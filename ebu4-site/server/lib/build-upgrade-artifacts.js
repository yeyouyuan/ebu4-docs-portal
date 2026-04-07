/**
 * 在本机生成远程升级用制品并写入 public/upgrade/manifest.json
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const DOCS_REL = path.join('public', 'upgrade', 'docs-bundle.json');
const SYSTEM_REL = path.join('public', 'upgrade', 'system-artifact.tar.gz');
const MANIFEST_REL = path.join('public', 'upgrade', 'manifest.json');

function readJsonSafe(abs) {
  try {
    return JSON.parse(fs.readFileSync(abs, 'utf-8'));
  } catch (_) {
    return null;
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

function buildSystemTarGz(siteRoot) {
  const serverDir = path.join(siteRoot, 'server');
  const publicDir = path.join(siteRoot, 'public');
  const pkgJson = path.join(siteRoot, 'package.json');
  if (!fs.existsSync(serverDir) || !fs.existsSync(publicDir) || !fs.existsSync(pkgJson)) {
    throw new Error('缺少 server/、public/ 或 package.json');
  }

  const outAbs = path.join(siteRoot, SYSTEM_REL);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });

  const tar = spawnSync(
    'tar',
    [
      '-czf',
      outAbs,
      '--exclude=server/test',
      '--exclude=public/upgrade',
      '-C',
      siteRoot,
      'server',
      'public',
      'package.json',
    ],
    { encoding: 'utf-8' }
  );
  if (tar.status !== 0) {
    throw new Error('tar 打包失败: ' + (tar.stderr || tar.stdout || '').slice(0, 400));
  }

  const buf = fs.readFileSync(outAbs);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  return {
    sha256,
    url: '/upgrade/system-artifact.tar.gz',
    bytes: buf.length,
  };
}

/**
 * @param {string} siteRoot
 * @param {*} siteDatabase
 * @param {{ docs?: boolean, system?: boolean }} opts
 */
function buildUpgradeArtifacts(siteRoot, siteDatabase, opts) {
  const docs = !!opts.docs;
  const system = !!opts.system;
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
    systemResult = buildSystemTarGz(siteRoot);
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
      ? { available: true, artifacts: [{ url: systemResult.url, sha256: systemResult.sha256 }] }
      : prevSys && prevSys.artifacts && prevSys.artifacts.length
        ? prevSys
        : { available: false, artifacts: [] },
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
  };
}

module.exports = { buildUpgradeArtifacts, DOCS_REL, SYSTEM_REL, MANIFEST_REL };
