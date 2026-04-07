/**
 * 远程升级：拉取 manifest、比对版本、文档制品应用、升级历史（site_kv）
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const { spawnSync } = require('child_process');
const os = require('os');
const { backupWithPrune } = require('./backup');

const MANIFEST_MAX_BYTES = 2 * 1024 * 1024;
const ARTIFACT_MAX_BYTES = 80 * 1024 * 1024;
const HISTORY_MAX = 150;

/** 全站图片懒加载脚本路径（相对站点根），系统制品应包含；缺失时尝试从升级前内存或备份恢复 */
const LAZY_IMAGES_REL = path.join('public', 'js', 'lazy-images.js');

function readFileBufferIfExists(abs) {
  try {
    return fs.existsSync(abs) ? fs.readFileSync(abs) : null;
  } catch (_) {
    return null;
  }
}

/**
 * 系统升级覆盖 public/ 后，若制品未带 lazy-images.js，用升级前内容或 data/backups 下备份补全。
 * @returns {{ status: 'ok' | 'restored' | 'missing', from?: 'memory' | 'backup' }}
 */
function ensureLazyImagesAfterSystemApply(siteRoot, backupRoot, lazyBeforeBuf) {
  const dst = path.join(siteRoot, LAZY_IMAGES_REL);
  if (fs.existsSync(dst)) {
    return { status: 'ok' };
  }
  let buf = lazyBeforeBuf;
  let from = 'memory';
  const bk = path.join(backupRoot, 'public', 'js', 'lazy-images.js');
  if (!buf) {
    buf = readFileBufferIfExists(bk);
    from = 'backup';
  }
  if (!buf) {
    return { status: 'missing' };
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, buf);
  return { status: 'restored', from };
}

let upgradeChain = Promise.resolve();

function withUpgradeLock(fn) {
  const p = upgradeChain.then(() => fn());
  upgradeChain = p.then(
    () => {},
    () => {}
  );
  return p;
}

function compareSemver(a, b) {
  const pa = String(a || '0.0.0')
    .split('.')
    .map((x) => parseInt(x, 10) || 0);
  const pb = String(b || '0.0.0')
    .split('.')
    .map((x) => parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da < db) return -1;
    if (da > db) return 1;
  }
  return 0;
}

function readJsonSafe(fp) {
  try {
    if (!fs.existsSync(fp)) return null;
    return JSON.parse(fs.readFileSync(fp, 'utf-8'));
  } catch (_) {
    return null;
  }
}

function getLocalSystemVersion(siteRoot) {
  const pkg = readJsonSafe(path.join(siteRoot, 'package.json')) || {};
  const name = pkg.name != null ? String(pkg.name).trim() : 'ebu4-docs-site';
  const v = pkg.version != null ? String(pkg.version).trim() : '0.0.0';
  const build = readJsonSafe(path.join(siteRoot, 'public', 'build-info.json'));
  return {
    product: name,
    systemVersion: v,
    buildInfo: build && typeof build === 'object' ? build : null,
  };
}

function computeDocsFingerprint(siteDatabase) {
  if (!siteDatabase.isSiteSqlite()) return 'file-mode';
  const db = siteDatabase.getDb();
  if (!db) return 'unknown';
  const rows = db.prepare('SELECT slug, content FROM main_documents ORDER BY slug ASC').all();
  const h = crypto.createHash('sha256');
  for (const r of rows) {
    h.update(String(r.slug));
    h.update('\0');
    h.update(String(r.content != null ? r.content : ''));
    h.update('\n');
  }
  for (const key of ['tools_nav', 'landing', 'seo']) {
    const v = siteDatabase.getKv(key);
    h.update(key);
    h.update('\0');
    h.update(v || '');
    h.update('\n');
  }
  return h.digest('hex').slice(0, 24);
}

function sha256Buffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function fetchUrlBuffer(urlStr, opts) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(urlStr);
    } catch (e) {
      reject(new Error('无效 URL'));
      return;
    }
    const lib = u.protocol === 'https:' ? https : http;
    const max = opts.maxBytes || MANIFEST_MAX_BYTES;
    const timeoutMs = opts.timeoutMs || 15000;
    const headers = Object.assign({}, opts.headers || {});
    const req = lib.request(
      u,
      {
        method: 'GET',
        headers,
        timeout: timeoutMs,
        rejectUnauthorized: opts.insecureTls ? false : undefined,
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          try {
            const next = new URL(res.headers.location, u).href;
            res.resume();
            fetchUrlBuffer(next, opts).then(resolve, reject);
          } catch (e) {
            reject(new Error('重定向无效'));
          }
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error('HTTP ' + res.statusCode));
          return;
        }
        const chunks = [];
        let len = 0;
        res.on('data', (c) => {
          len += c.length;
          if (len > max) {
            res.destroy();
            reject(new Error('响应过大'));
            return;
          }
          chunks.push(c);
        });
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('请求超时'));
    });
    req.end();
  });
}

function resolveArtifactUrl(baseUrl, artifactUrl) {
  if (!artifactUrl) return null;
  const s = String(artifactUrl).trim();
  if (/^https?:\/\//i.test(s)) return s;
  const b = baseUrl.replace(/\/+$/, '');
  const p = s.startsWith('/') ? s : '/' + s;
  return b + p;
}

async function fetchManifest(upgrade) {
  const base = upgrade.baseUrl.replace(/\/+$/, '');
  const mp = upgrade.manifestPath.startsWith('/') ? upgrade.manifestPath : '/' + upgrade.manifestPath;
  const url = base + mp;
  const headers = {};
  if (upgrade.bearerToken) {
    headers.Authorization = 'Bearer ' + upgrade.bearerToken;
  }
  const buf = await fetchUrlBuffer(url, {
    maxBytes: MANIFEST_MAX_BYTES,
    insecureTls: upgrade.insecureTls === true,
    headers,
  });
  let j;
  try {
    j = JSON.parse(buf.toString('utf-8'));
  } catch (_) {
    throw new Error('manifest 不是合法 JSON');
  }
  if (!j || typeof j !== 'object') throw new Error('manifest 格式无效');
  return j;
}

function parseManifest(manifest) {
  const product = manifest.product != null ? String(manifest.product).trim() : 'ebu4-docs-site';
  const systemVersion =
    manifest.systemVersion != null ? String(manifest.systemVersion).trim() : '0.0.0';
  const docsVersion = manifest.docsVersion != null ? String(manifest.docsVersion).trim() : '';
  const minClient =
    manifest.minClientSystemVersion != null
      ? String(manifest.minClientSystemVersion).trim()
      : null;
  const comp = manifest.components && typeof manifest.components === 'object' ? manifest.components : {};
  const sys = comp.system && typeof comp.system === 'object' ? comp.system : {};
  const docs = comp.docs && typeof comp.docs === 'object' ? comp.docs : {};
  return {
    product,
    systemVersion,
    docsVersion,
    minClientSystemVersion: minClient,
    changelogSummary:
      typeof manifest.changelog === 'string'
        ? manifest.changelog
        : [sys.changelog, docs.changelog].filter(Boolean).join('\n').slice(0, 4000),
    components: {
      system: {
        available: sys.available === true,
        artifacts: Array.isArray(sys.artifacts) ? sys.artifacts : [],
      },
      docs: {
        available: docs.available === true,
        artifacts: Array.isArray(docs.artifacts) ? docs.artifacts : [],
      },
    },
  };
}

function readUpgradeHistory(siteDatabase) {
  if (!siteDatabase.isSiteSqlite()) return [];
  const raw = siteDatabase.getKv('upgrade_history');
  if (!raw) return [];
  try {
    const j = JSON.parse(raw);
    return Array.isArray(j) ? j : [];
  } catch (_) {
    return [];
  }
}

function writeUpgradeHistory(siteDatabase, items) {
  siteDatabase.setKv('upgrade_history', JSON.stringify(items.slice(0, HISTORY_MAX)));
}

function appendHistory(siteDatabase, ev) {
  const items = readUpgradeHistory(siteDatabase);
  const id = ev.id || `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  items.unshift(
    Object.assign(
      {
        id,
        at: new Date().toISOString(),
      },
      ev
    )
  );
  writeUpgradeHistory(siteDatabase, items);
}

function getKvJson(siteDatabase, key) {
  const raw = siteDatabase.getKv(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function setKvJson(siteDatabase, key, obj) {
  siteDatabase.setKv(key, JSON.stringify(obj));
}

function applyDocsBundle(siteDatabase, bundle) {
  const db = siteDatabase.getDb();
  if (!db) throw new Error('仅 SQLite 模式支持文档升级');
  if (bundle.format !== 'ebu4-docs-bundle-v1') throw new Error('不支持的文档包 format');
  const mainDocs = Array.isArray(bundle.mainDocuments) ? bundle.mainDocuments : [];
  if (mainDocs.length === 0) throw new Error('文档包中无 mainDocuments');
  const t = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM main_documents').run();
    const ins = db.prepare(
      `INSERT INTO main_documents (slug, title, content, sort_order, updated_at) VALUES (?, ?, ?, ?, ?)`
    );
    for (let i = 0; i < mainDocs.length; i++) {
      const m = mainDocs[i];
      const slug = siteDatabase.normalizeMainDocSlug(m.slug);
      if (!slug) throw new Error('无效 slug: ' + m.slug);
      const title = String(m.title != null ? m.title : slug);
      const content = m.content != null ? String(m.content) : '';
      const ord = m.sort_order != null ? parseInt(m.sort_order, 10) : i;
      ins.run(slug, title, content, Number.isFinite(ord) ? ord : i, t);
    }
    const sk = bundle.siteKv && typeof bundle.siteKv === 'object' ? bundle.siteKv : {};
    for (const k of ['tools_nav', 'landing', 'seo']) {
      if (sk[k] != null) {
        const val = typeof sk[k] === 'string' ? sk[k] : JSON.stringify(sk[k]);
        db.prepare(
          `INSERT INTO site_kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
        ).run(k, val, t);
      }
    }
  });
  tx();
  const defSlug =
    bundle.defaultSlug && siteDatabase.normalizeMainDocSlug(bundle.defaultSlug)
      ? siteDatabase.normalizeMainDocSlug(bundle.defaultSlug)
      : mainDocs[0] && siteDatabase.normalizeMainDocSlug(mainDocs[0].slug);
  if (defSlug) {
    siteDatabase.setDefaultMainDocSlug(defSlug);
  }
}

async function runUpgradeCheck(ctx) {
  const { siteDatabase, siteSettings, siteRoot } = ctx;
  const upgrade = siteSettings.upgrade || {};
  const localSys = getLocalSystemVersion(siteRoot);
  const localDocsFp = computeDocsFingerprint(siteDatabase);
  const out = {
    upToDate: true,
    hasSystemUpdate: false,
    hasDocsUpdate: false,
    local: {
      product: localSys.product,
      systemVersion: localSys.systemVersion,
      docsVersion: localDocsFp,
      buildInfo: localSys.buildInfo,
    },
    remote: null,
    changelogSummary: '',
    errors: [],
    warnings: [],
  };
  if (!upgrade.enabled) {
    out.errors.push('远程升级未启用');
    return out;
  }
  if (!upgrade.baseUrl) {
    out.errors.push('请配置升级源 baseUrl');
    return out;
  }
  let manifest;
  try {
    manifest = await fetchManifest(upgrade);
  } catch (e) {
    const msg = e.message || String(e);
    out.errors.push(msg);
    appendHistory(siteDatabase, {
      kind: 'check',
      trigger: ctx.trigger || 'manual',
      channel: upgrade.checkChannels || 'both',
      fromVersion: localSys.systemVersion,
      toVersion: null,
      status: 'failed',
      message: '拉取 manifest 失败: ' + msg,
      remoteBaseUrlHost: (() => {
        try {
          return new URL(upgrade.baseUrl).host;
        } catch (_) {
          return '';
        }
      })(),
    });
    return out;
  }
  const parsed = parseManifest(manifest);
  out.remote = parsed;
  out.changelogSummary = parsed.changelogSummary || '';

  if (parsed.product !== out.local.product) {
    out.errors.push('对端产品标识与本机不一致，已拒绝');
    out.upToDate = false;
    appendHistory(siteDatabase, {
      kind: 'check',
      trigger: ctx.trigger || 'manual',
      channel: upgrade.checkChannels || 'both',
      fromVersion: localSys.systemVersion,
      toVersion: parsed.systemVersion,
      status: 'failed',
      message: out.errors[0],
      remoteProduct: parsed.product,
      remoteBaseUrlHost: (() => {
        try {
          return new URL(upgrade.baseUrl).host;
        } catch (_) {
          return '';
        }
      })(),
    });
    return out;
  }

  const ch =
    upgrade.checkChannels === 'docs' || upgrade.checkChannels === 'system' ? upgrade.checkChannels : 'both';
  if (ch === 'system' || ch === 'both') {
    if (
      parsed.minClientSystemVersion &&
      compareSemver(localSys.systemVersion, parsed.minClientSystemVersion) < 0
    ) {
      out.errors.push(`本机系统版本过低，需要 >= ${parsed.minClientSystemVersion}`);
    } else if (compareSemver(parsed.systemVersion, localSys.systemVersion) > 0) {
      out.hasSystemUpdate = true;
      out.upToDate = false;
    }
  }
  if (ch === 'docs' || ch === 'both') {
    if (parsed.docsVersion && parsed.docsVersion !== localDocsFp) {
      out.hasDocsUpdate = true;
      out.upToDate = false;
    }
  }

  if ((ch === 'docs' || ch === 'both') && !parsed.docsVersion) {
    out.warnings.push(
      '对端 manifest 未填写 docsVersion，无法判断是否有文档更新；发布方应运行 npm run export-docs-bundle，将打印的指纹写入对端 manifest 的 docsVersion。'
    );
  }

  const iso = new Date().toISOString();
  setKvJson(siteDatabase, 'upgrade_last_check_at', { at: iso });
  setKvJson(siteDatabase, 'upgrade_last_result', {
    at: iso,
    ok: true,
    summary: out.upToDate ? '已是最新' : '有可用更新',
  });

  appendHistory(siteDatabase, {
    kind: 'check',
    trigger: ctx.trigger || 'manual',
    channel: ch,
    fromVersion: `${localSys.systemVersion} / ${localDocsFp}`,
    toVersion: `${parsed.systemVersion} / ${parsed.docsVersion || '—'}`,
    status: out.errors.length ? 'failed' : 'success',
    message: out.errors.length
      ? out.errors.join('; ')
      : out.upToDate
        ? '当前已与对端声明一致'
        : '检测到可用更新',
    remoteProduct: parsed.product,
    remoteBaseUrlHost: (() => {
      try {
        return new URL(upgrade.baseUrl).host;
      } catch (_) {
        return '';
      }
    })(),
  });

  return out;
}

async function runUpgradeApplyDocs(ctx) {
  const { siteDatabase, siteSettings, siteRoot, artifactIndex, reloadDocData, backupKeepCount = 20 } = ctx;
  const upgrade = siteSettings.upgrade || {};
  const base = upgrade.baseUrl.replace(/\/+$/, '');
  const manifest = await fetchManifest(upgrade);
  const parsed = parseManifest(manifest);
  const arts = parsed.components.docs.artifacts;
  const idx = artifactIndex != null ? parseInt(artifactIndex, 10) : 0;
  const art = arts[idx];
  if (!art || !art.url) throw new Error('文档制品不存在');
  const url = resolveArtifactUrl(base, art.url);
  const headers = {};
  if (upgrade.bearerToken) headers.Authorization = 'Bearer ' + upgrade.bearerToken;
  const buf = await fetchUrlBuffer(url, {
    maxBytes: ARTIFACT_MAX_BYTES,
    insecureTls: upgrade.insecureTls === true,
    headers,
  });
  const hex = sha256Buffer(buf);
  if (art.sha256 && art.sha256.toLowerCase() !== hex) {
    throw new Error('SHA256 校验失败');
  }
  let bundle;
  try {
    bundle = JSON.parse(buf.toString('utf-8'));
  } catch (_) {
    throw new Error('文档制品不是合法 JSON');
  }
  if (bundle.product && bundle.product !== parsed.product) {
    throw new Error('文档包 product 与 manifest 不一致');
  }

  const dbPath = siteDatabase.resolveDbPath();
  if (!fs.existsSync(dbPath)) throw new Error('数据库文件不存在');

  const fpBefore = computeDocsFingerprint(siteDatabase);
  backupWithPrune(dbPath, backupKeepCount);
  const bakPattern = path.basename(dbPath) + '.bak-';
  const dir = path.dirname(dbPath);
  let backupPath = null;
  try {
    const names = fs.readdirSync(dir).filter((n) => n.startsWith(bakPattern));
    names.sort();
    backupPath = names.length ? path.join(dir, names[names.length - 1]) : null;
  } catch (_) {}

  try {
    applyDocsBundle(siteDatabase, bundle);
  } catch (e) {
    if (backupPath && fs.existsSync(backupPath)) {
      try {
        fs.copyFileSync(backupPath, dbPath);
      } catch (_) {}
    }
    throw e;
  }

  reloadDocData();
  const iso = new Date().toISOString();
  setKvJson(siteDatabase, 'upgrade_last_apply_at', { at: iso, channel: 'docs' });
  const fpAfter = computeDocsFingerprint(siteDatabase);
  appendHistory(siteDatabase, {
    kind: 'apply',
    trigger: ctx.trigger || 'manual',
    channel: 'docs',
    fromVersion: fpBefore,
    toVersion: parsed.docsVersion || fpAfter,
    status: 'success',
    message: '文档已更新',
    remoteProduct: parsed.product,
    remoteBaseUrlHost: (() => {
      try {
        return new URL(upgrade.baseUrl).host;
      } catch (_) {
        return '';
      }
    })(),
  });
  return { ok: true, docsVersion: parsed.docsVersion };
}

function runShellOneLiner(cmd, label) {
  if (!cmd || !String(cmd).trim()) return { ok: false, skipped: true };
  const r = spawnSync(String(cmd), { shell: true, stdio: 'pipe', encoding: 'utf-8' });
  if (r.status !== 0) {
    return {
      ok: false,
      message: `${label} 退出码 ${r.status}: ${(r.stderr || r.stdout || '').slice(0, 500)}`,
    };
  }
  return { ok: true };
}

async function runUpgradeApplySystem(ctx) {
  const { siteDatabase, siteSettings, siteRoot, artifactIndex } = ctx;
  const upgrade = siteSettings.upgrade || {};
  const base = upgrade.baseUrl.replace(/\/+$/, '');
  const manifest = await fetchManifest(upgrade);
  const parsed = parseManifest(manifest);
  const arts = parsed.components.system.artifacts;
  const idx = artifactIndex != null ? parseInt(artifactIndex, 10) : 0;
  const art = arts[idx];
  if (!art || !art.url) throw new Error('系统制品不存在');
  const url = resolveArtifactUrl(base, art.url);
  const headers = {};
  if (upgrade.bearerToken) headers.Authorization = 'Bearer ' + upgrade.bearerToken;
  const buf = await fetchUrlBuffer(url, {
    maxBytes: ARTIFACT_MAX_BYTES,
    insecureTls: upgrade.insecureTls === true,
    headers,
  });
  if (art.sha256 && art.sha256.toLowerCase() !== sha256Buffer(buf)) {
    throw new Error('系统制品 SHA256 校验失败');
  }
  const urlPath = String(art.url || '').split('?')[0];
  const ext = path.extname(urlPath).toLowerCase();
  const isTgz = ext === '.gz' || urlPath.toLowerCase().endsWith('.tar.gz');
  if (!isTgz) {
    throw new Error('当前仅支持 .tar.gz 系统制品');
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ebu4-upgrade-'));
  const tgz = path.join(tmpDir, 'system.tgz');
  fs.writeFileSync(tgz, buf);
  const extractDir = path.join(tmpDir, 'out');
  fs.mkdirSync(extractDir, { recursive: true });
  const tar = spawnSync('tar', ['-xzf', tgz, '-C', extractDir], { encoding: 'utf-8' });
  if (tar.status !== 0) {
    throw new Error('解压失败: ' + (tar.stderr || tar.stdout || '').slice(0, 200));
  }

  const backupRoot = path.join(
    siteRoot,
    'data',
    'backups',
    `upgrade-system-${new Date().toISOString().replace(/[:.]/g, '-')}`
  );
  fs.mkdirSync(backupRoot, { recursive: true });

  const lazyBeforeBuf = readFileBufferIfExists(path.join(siteRoot, LAZY_IMAGES_REL));

  const whitelist = [
    ['server', path.join(extractDir, 'server')],
    ['public', path.join(extractDir, 'public')],
    ['package.json', path.join(extractDir, 'package.json')],
  ];
  for (const [name, src] of whitelist) {
    if (!fs.existsSync(src)) continue;
    const dst = path.join(siteRoot, name);
    if (name === 'package.json') {
      if (fs.existsSync(dst)) fs.copyFileSync(dst, path.join(backupRoot, 'package.json'));
      fs.copyFileSync(src, dst);
      continue;
    }
    const dstBk = path.join(backupRoot, name);
    if (fs.existsSync(dst)) {
      fs.cpSync(dst, dstBk, { recursive: true });
    }
    fs.cpSync(src, dst, { recursive: true });
  }

  const lazyImages = ensureLazyImagesAfterSystemApply(siteRoot, backupRoot, lazyBeforeBuf);

  const iso = new Date().toISOString();
  setKvJson(siteDatabase, 'upgrade_last_apply_at', { at: iso, channel: 'system' });

  const restart = process.env.UPGRADE_RESTART_CMD;
  let needsRestart = !restart || !String(restart).trim();
  let restartResult = null;
  if (!needsRestart) {
    restartResult = runShellOneLiner(restart, 'UPGRADE_RESTART_CMD');
    if (!restartResult.ok) needsRestart = true;
  }

  let sysMsg = needsRestart
    ? '文件已更新，请配置 UPGRADE_RESTART_CMD 或手动重启服务'
    : '系统文件已更新并已执行重启命令';
  if (lazyImages.status === 'restored') {
    sysMsg +=
      '；已补全 public/js/lazy-images.js（全站图片懒加载，系统制品未包含该文件）';
  } else if (lazyImages.status === 'missing') {
    sysMsg +=
      '；提示：public/js/lazy-images.js 缺失且无法从升级前恢复，请从官方发行包补全';
  }

  appendHistory(siteDatabase, {
    kind: 'apply',
    trigger: ctx.trigger || 'manual',
    channel: 'system',
    fromVersion: getLocalSystemVersion(siteRoot).systemVersion,
    toVersion: parsed.systemVersion,
    status: needsRestart ? 'needs_restart' : 'success',
    message: sysMsg,
    remoteProduct: parsed.product,
    remoteBaseUrlHost: (() => {
      try {
        return new URL(upgrade.baseUrl).host;
      } catch (_) {
        return '';
      }
    })(),
  });

  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_) {}

  const appliedLocal = getLocalSystemVersion(siteRoot);

  return {
    ok: true,
    needsRestart,
    restartResult,
    systemVersion: parsed.systemVersion,
    appliedProduct: appliedLocal.product,
    appliedSystemVersion: appliedLocal.systemVersion,
    lazyImages: lazyImages.status,
    lazyImagesRestoredFrom: lazyImages.from || undefined,
  };
}

module.exports = {
  withUpgradeLock,
  compareSemver,
  getLocalSystemVersion,
  computeDocsFingerprint,
  fetchManifest,
  parseManifest,
  runUpgradeCheck,
  runUpgradeApplyDocs,
  runUpgradeApplySystem,
  readUpgradeHistory,
  appendHistory,
  getKvJson,
  setKvJson,
  runShellOneLiner,
};
