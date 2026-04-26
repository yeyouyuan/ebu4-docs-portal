/**
 * 在本机生成远程升级用制品并写入 public/upgrade/manifest.json
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { spawnSync } = require('child_process');

const DOCS_REL = path.join('public', 'upgrade', 'docs-bundle.json');
const SYSTEM_REL = path.join('public', 'upgrade', 'system-artifact.tar.gz');
const MANIFEST_REL = path.join('public', 'upgrade', 'manifest.json');

const SYSTEM_PACKAGE_CORE_SERVER_ENTRIES = [
  'server/admin-auth-password.js',
  'server/admin-routes.js',
  'server/ai-routes.js',
  'server/admin-users-service.js',
  'server/audit-log.js',
  'server/doc-md.js',
  'server/extra-pages-repo.js',
  'server/extra-pages-store.js',
  'server/index.js',
  'server/invite-store.js',
  'server/logger.js',
  'server/passkey-store.js',
  'server/presence-store.js',
  'server/redis-cache.js',
  'server/role-profiles-store.js',
  'server/security-levels.js',
  'server/site-database.js',
  'server/site-session.js',
  'server/upgrade-scheduler.js',
  'server/visit-stats.js',
  'server/webauthn-challenges.js',
  'server/webauthn-config.js',
  'server/views/maintenance.html',
  'server/lib/admin-sensitive.js',
  'server/lib/ai-provider-service.js',
  'server/lib/ai-settings-normalize.js',
  'server/lib/ai-settings-store.js',
  'server/lib/backup.js',
  'server/lib/extra-page-search-text.js',
  'server/lib/migrate-default-embed.js',
  'server/lib/seo-config-normalize.js',
  'server/lib/seo-sitemap.js',
  'server/lib/site-embed.js',
  'server/lib/site-ai-search-service.js',
  'server/lib/site-settings-normalize.js',
  'server/lib/web-search-service.js',
  'server/services/doc-admin-service.js',
];

const SYSTEM_PACKAGE_SCOPE_DEFS = [
  {
    id: 'md',
    label: '文档管理与文档前台',
    hint: 'docs 页面、文档管理编辑器与高亮资源',
    entries: [
      'public/docs.html',
      'public/css/style.css',
      'public/css/doc-management.css',
      'public/js/app.js',
      'public/js/docs-chrome.js',
      'public/js/admin-upload.js',
      'public/js/admin-pages.js',
      'public/lib/github-dark.min.css',
      'public/lib/highlight.min.js',
      'public/lib/hl-bash.min.js',
      'public/lib/hl-java.min.js',
      'public/lib/hl-javascript.min.js',
      'public/lib/hl-json.min.js',
      'public/lib/hl-xml.min.js',
      'public/lib/marked.min.js',
      'public/lib/purify.min.js',
      'public/lib/quill.min.js',
      'public/lib/quill.snow.css',
      'public/lib/turndown.js',
    ],
  },
  {
    id: 'ai',
    label: 'AI 接入与公共助手',
    hint: '后台 AI 管理页与前台公共 AI 助手',
    entries: [
      'public/css/admin-ai.css',
      'public/css/site-ai-assistant.css',
      'public/js/admin-ai.js',
      'public/js/site-ai-assistant.js',
    ],
  },
  {
    id: 'tools',
    label: '工具导航',
    hint: '工具导航后台结构化编辑脚本',
    entries: ['public/js/admin-tools-nav.js'],
  },
  {
    id: 'landing',
    label: '门户首页',
    hint: 'landing 页面与对应后台表单配置脚本',
    entries: [
      'public/landing.html',
      'public/css/landing.css',
      'public/js/admin-config-forms.js',
      'public/js/landing.js',
      'public/js/landing-config.js',
    ],
  },
  {
    id: 'site',
    label: '站点设置',
    hint: '站点设置页脚本与样式',
    entries: ['public/css/admin-site-settings.css', 'public/js/admin-site-settings.js'],
  },
  {
    id: 'seo',
    label: 'SEO 与搜索收录',
    hint: 'SEO 页面配置表单与前台 SEO 脚本',
    entries: [
      'server/lib/seo-push-service.js',
      'public/js/admin-config-forms.js',
      'public/js/seo-config.js',
      'public/data/seo.json',
    ],
  },
  {
    id: 'blogfetch',
    label: '日报抓取',
    hint: '日报抓取服务端处理逻辑',
    entries: ['server/lib/blog-fetch-service.js'],
  },
  {
    id: 'upgrade',
    label: '系统升级',
    hint: '升级页脚本与升级制品/应用逻辑',
    entries: [
      'server/lib/build-upgrade-artifacts.js',
      'server/lib/upgrade-service.js',
      'public/js/admin-upgrade.js',
    ],
  },
  {
    id: 'extra_pages',
    label: '扩展页面',
    hint: '扩展页前台模板与后台编辑脚本',
    entries: [
      'server/services/extra-pages-admin-service.js',
      'public/extra-page.html',
      'public/css/extra-page.css',
      'public/js/extra-page.js',
      'public/js/admin-pages.js',
    ],
  },
  {
    id: 'pwa',
    label: 'PWA 与注册页',
    hint: 'Service Worker、manifest 与注册页',
    entries: [
      'public/sw.js',
      'public/manifest.webmanifest',
      'public/js/register-sw.js',
      'public/register.html',
      'public/register-invalid.html',
    ],
  },
  {
    id: 'media',
    label: '图片与静态资源',
    hint: '图标、图片目录与懒加载脚本',
    entries: ['public/icons', 'public/img', 'public/js/lazy-images.js'],
  },
];

const SYSTEM_PACKAGE_CORE_ENTRIES = [
  'package.json',
  'public/admin.html',
  'public/admin-login.html',
  'public/css/admin.css',
  'public/css/admin-dashboard.css',
  'public/css/admin-hub.css',
  'public/css/admin-shell-ebu4.css',
  'public/icons/icon.svg',
  'public/js/admin.js',
  ...SYSTEM_PACKAGE_CORE_SERVER_ENTRIES,
];

function readJsonSafe(abs) {
  try {
    return JSON.parse(fs.readFileSync(abs, 'utf-8'));
  } catch (_) {
    return null;
  }
}

function listSystemPackageScopes() {
  return SYSTEM_PACKAGE_SCOPE_DEFS.map((item) => ({
    id: item.id,
    label: item.label,
    hint: item.hint,
  }));
}

function normalizeSystemPackageScopes(input) {
  const allowed = new Set(SYSTEM_PACKAGE_SCOPE_DEFS.map((item) => item.id));
  const hasExplicitInput = Array.isArray(input);
  const arr = hasExplicitInput ? input : [];
  const out = [];
  const seen = new Set();
  for (const item of arr) {
    const id = String(item || '').trim();
    if (!allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  if (!hasExplicitInput) {
    return SYSTEM_PACKAGE_SCOPE_DEFS.map((item) => item.id);
  }
  return out;
}

function collectSystemPackageEntries(scopeIds) {
  const out = new Set(SYSTEM_PACKAGE_CORE_ENTRIES);
  const wanted = new Set(normalizeSystemPackageScopes(scopeIds));
  for (const scope of SYSTEM_PACKAGE_SCOPE_DEFS) {
    if (!wanted.has(scope.id)) continue;
    for (const entry of scope.entries) out.add(entry);
  }
  return Array.from(out).sort();
}

function ensureParentDir(abs) {
  fs.mkdirSync(path.dirname(abs), { recursive: true });
}

function copyEntry(siteRoot, stageRoot, rel) {
  const src = path.join(siteRoot, rel);
  const dst = path.join(stageRoot, rel);
  if (!fs.existsSync(src)) return false;
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.cpSync(src, dst, { recursive: true });
    return true;
  }
  ensureParentDir(dst);
  fs.copyFileSync(src, dst);
  return true;
}

function walkFiles(absRoot, relBase) {
  if (!fs.existsSync(absRoot)) return [];
  const out = [];
  const st = fs.statSync(absRoot);
  if (st.isFile()) {
    out.push(relBase.replace(/\\/g, '/'));
    return out;
  }
  const names = fs.readdirSync(absRoot);
  for (const name of names) {
    const abs = path.join(absRoot, name);
    const rel = relBase ? path.posix.join(relBase.replace(/\\/g, '/'), name) : name;
    const childSt = fs.statSync(abs);
    if (childSt.isDirectory()) out.push(...walkFiles(abs, rel));
    else out.push(rel.replace(/\\/g, '/'));
  }
  return out;
}

function entryExists(root, rel) {
  return fs.existsSync(path.join(root, rel));
}

function matchesExpectedEntry(rel, expectedEntries) {
  const normalized = String(rel || '').replace(/\\/g, '/').replace(/^\.\/+/, '');
  if (!normalized || normalized === '.') return true;
  for (const expected of expectedEntries) {
    const allowed = String(expected || '').replace(/\\/g, '/').replace(/\/+$/, '');
    if (!allowed) continue;
    if (normalized === allowed) return true;
    if (normalized.startsWith(allowed + '/')) return true;
  }
  return false;
}

function validateSystemPackageTree(root, scopeIds, opts) {
  const strict = !opts || opts.strict !== false;
  const selectedScopes = normalizeSystemPackageScopes(scopeIds);
  const expectedEntries = collectSystemPackageEntries(selectedScopes);
  const missingEntries = expectedEntries.filter((rel) => !entryExists(root, rel));
  const files = walkFiles(root, '').sort();
  const unexpectedEntries = strict
    ? files.filter((rel) => !matchesExpectedEntry(rel, expectedEntries))
    : [];
  return {
    ok: missingEntries.length === 0 && unexpectedEntries.length === 0,
    selectedScopes,
    expectedEntries,
    missingEntries,
    unexpectedEntries,
    fileCount: files.length,
    files,
  };
}

function normalizeTarEntry(raw) {
  let entry = String(raw || '').trim().replace(/\\/g, '/');
  entry = entry.replace(/^\.\//, '');
  entry = entry.replace(/\/+$/, '');
  return entry;
}

function validateSystemPackageArchive(archiveAbs, scopeIds) {
  const stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ebu4-upgrade-archive-check-'));
  try {
    const tar = spawnSync('tar', ['-xzf', archiveAbs, '-C', stageRoot], { encoding: 'utf-8' });
    if (tar.status !== 0) {
      throw new Error('系统制品目录校验失败: ' + (tar.stderr || tar.stdout || '').slice(0, 400));
    }
    const tree = validateSystemPackageTree(stageRoot, scopeIds, { strict: true });
    return {
      ok: tree.ok,
      archiveEntriesCount: tree.fileCount,
      missingEntries: tree.missingEntries,
      unexpectedEntries: tree.unexpectedEntries,
    };
  } finally {
    try {
      fs.rmSync(stageRoot, { recursive: true, force: true });
    } catch (_) {}
  }
}

function buildDocsBundle(siteRoot, siteDatabase) {
  if (!siteDatabase.isSiteSqlite()) {
    throw new Error('仅 SQLite 模式可生成文档制品');
  }
  const db = siteDatabase.getDb();
  if (!db) throw new Error('数据库不可用');

  const rows = db
    .prepare(
      'SELECT slug, title, content, sort_order FROM main_documents ORDER BY sort_order ASC, id ASC'
    )
    .all();
  if (!rows.length) throw new Error('main_documents 为空');

  const h = crypto.createHash('sha256');
  const rowsFp = db.prepare('SELECT slug, content FROM main_documents ORDER BY slug ASC').all();
  for (const r of rowsFp) {
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
  const docsVersion = h.digest('hex').slice(0, 24);

  const mainDocuments = rows.map((r) => ({
    slug: r.slug,
    title: r.title != null ? String(r.title) : r.slug,
    content: r.content != null ? String(r.content) : '',
    sort_order: r.sort_order != null ? r.sort_order : 0,
  }));

  const siteKv = {};
  for (const key of ['tools_nav', 'landing', 'seo']) {
    const v = siteDatabase.getKv(key);
    if (v != null) siteKv[key] = String(v);
  }

  const defSlugRaw = siteDatabase.getKv('default_main_doc_slug');
  const defaultSlug =
    defSlugRaw != null && String(defSlugRaw).trim() ? String(defSlugRaw).trim() : null;

  const pkg = readJsonSafe(path.join(siteRoot, 'package.json')) || {};
  const productName = (pkg && pkg.name) || 'ebu4-docs-site';

  const bundle = {
    format: 'ebu4-docs-bundle-v1',
    product: productName,
    docsVersion,
    mainDocuments,
    siteKv,
  };
  if (defaultSlug) bundle.defaultSlug = defaultSlug;

  const outAbs = path.join(siteRoot, DOCS_REL);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  const json = JSON.stringify(bundle, null, 2);
  fs.writeFileSync(outAbs, json, 'utf-8');
  const buf = Buffer.from(json, 'utf-8');
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');

  return {
    docsVersion,
    sha256,
    url: '/upgrade/docs-bundle.json',
    bytes: buf.length,
  };
}

function buildSystemTarGz(siteRoot, scopeIds) {
  const outAbs = path.join(siteRoot, SYSTEM_REL);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });

  const selectedScopes = normalizeSystemPackageScopes(scopeIds);
  const entries = collectSystemPackageEntries(selectedScopes);
  const stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ebu4-upgrade-build-'));
  try {
    const copied = [];
    for (const rel of entries) {
      if (copyEntry(siteRoot, stageRoot, rel)) copied.push(rel);
    }

    const treeIntegrity = validateSystemPackageTree(stageRoot, selectedScopes);
    if (!treeIntegrity.ok) {
      const parts = [];
      if (treeIntegrity.missingEntries.length) {
        parts.push('缺少条目: ' + treeIntegrity.missingEntries.join(', '));
      }
      if (treeIntegrity.unexpectedEntries.length) {
        parts.push('越界条目: ' + treeIntegrity.unexpectedEntries.join(', '));
      }
      throw new Error('系统完整性校验失败，' + parts.join('；'));
    }

    const tar = spawnSync('tar', ['-czf', outAbs, '-C', stageRoot, '.'], { encoding: 'utf-8' });
    if (tar.status !== 0) {
      throw new Error('tar 打包失败: ' + (tar.stderr || tar.stdout || '').slice(0, 400));
    }

    const archiveIntegrity = validateSystemPackageArchive(outAbs, selectedScopes);
    if (!archiveIntegrity.ok) {
      const parts = [];
      if (archiveIntegrity.missingEntries.length) {
        parts.push('归档缺少条目: ' + archiveIntegrity.missingEntries.join(', '));
      }
      if (archiveIntegrity.unexpectedEntries.length) {
        parts.push('归档越界条目: ' + archiveIntegrity.unexpectedEntries.join(', '));
      }
      throw new Error('系统制品归档校验失败，' + parts.join('；'));
    }

    const buf = fs.readFileSync(outAbs);
    const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
    return {
      sha256,
      url: '/upgrade/system-artifact.tar.gz',
      bytes: buf.length,
      selectedScopes,
      copiedEntries: copied,
      integrity: {
        ok: true,
        selectedScopes,
        expectedEntries: treeIntegrity.expectedEntries,
        fileCount: treeIntegrity.fileCount,
        archiveEntriesCount: archiveIntegrity.archiveEntriesCount,
        checkedAt: new Date().toISOString(),
      },
    };
  } finally {
    try {
      fs.rmSync(stageRoot, { recursive: true, force: true });
    } catch (_) {}
  }
}

/**
 * @param {string} siteRoot
 * @param {*} siteDatabase
 * @param {{ docs?: boolean, system?: boolean, systemScopes?: string[] }} opts
 */
function buildUpgradeArtifacts(siteRoot, siteDatabase, opts) {
  const docs = !!opts.docs;
  const system = !!opts.system;
  const selectedScopes = normalizeSystemPackageScopes(opts.systemScopes);
  const requestedScopes = Array.isArray(opts.systemScopes) ? selectedScopes : [];
  if (!docs && !system) {
    throw new Error('请至少选择「文档制品」或「系统制品」之一');
  }

  const prev = readJsonSafe(path.join(siteRoot, MANIFEST_REL)) || {};
  const pkg = readJsonSafe(path.join(siteRoot, 'package.json')) || {};
  const product = pkg.name != null ? String(pkg.name).trim() : 'ebu4-docs-site';
  const systemVersion = pkg.version != null ? String(pkg.version).trim() : '0.0.0';

  let docsResult = null;
  if (docs) {
    docsResult = buildDocsBundle(siteRoot, siteDatabase);
  }

  let systemResult = null;
  if (system) {
    systemResult = buildSystemTarGz(siteRoot, selectedScopes);
  }

  const prevDocs = prev.components && prev.components.docs ? prev.components.docs : null;
  const prevSys = prev.components && prev.components.system ? prev.components.system : null;

  const components = {
    docs: docsResult
      ? { available: true, artifacts: [{ url: docsResult.url, sha256: docsResult.sha256 }] }
      : prevDocs && prevDocs.artifacts && prevDocs.artifacts.length
        ? prevDocs
        : { available: false, artifacts: [] },
    system: systemResult
      ? {
          available: true,
          artifacts: [{ url: systemResult.url, sha256: systemResult.sha256 }],
          selectedScopes: systemResult.selectedScopes,
          integrity: systemResult.integrity,
        }
      : prevSys && prevSys.artifacts && prevSys.artifacts.length
        ? prevSys
        : { available: false, artifacts: [], selectedScopes: requestedScopes, integrity: null },
  };

  const iso = new Date().toISOString();
  const manifest = {
    product,
    systemVersion,
    docsVersion: docsResult
      ? docsResult.docsVersion
      : prev.docsVersion != null
        ? String(prev.docsVersion).trim()
        : '',
    changelog:
      typeof prev.changelog === 'string' && prev.changelog.trim()
        ? prev.changelog
        : `本地一键生成于 ${iso}`,
    components,
  };

  const manAbs = path.join(siteRoot, MANIFEST_REL);
  fs.mkdirSync(path.dirname(manAbs), { recursive: true });
  fs.writeFileSync(manAbs, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

  return {
    ok: true,
    manifestPublicPath: '/upgrade/manifest.json',
    docs: docsResult,
    system: systemResult,
    manifest,
    availableSystemScopes: listSystemPackageScopes(),
  };
}

module.exports = {
  buildUpgradeArtifacts,
  validateSystemPackageTree,
  listSystemPackageScopes,
  normalizeSystemPackageScopes,
  DOCS_REL,
  SYSTEM_REL,
  MANIFEST_REL,
};
