#!/usr/bin/env node
/**
 * 从本地 SQLite 导出「文档升级」制品 JSON（ebu4-docs-bundle-v1），与 upgrade-service 导入格式一致。
 *
 * 用法（在 ebu4-site 目录）：
 *   node scripts/export-docs-bundle.js [输出路径]
 *
 * 环境变量：
 *   SITE_SQLITE_PATH — 数据库路径，默认 ./data/site.db
 *
 * 示例：
 *   node scripts/export-docs-bundle.js public/upgrade/docs-bundle.json
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const siteRoot = path.join(__dirname, '..');
const dbPath = process.env.SITE_SQLITE_PATH || path.join(siteRoot, 'data', 'site.db');
const outArg = process.argv[2];
const outFile = outArg
  ? path.isAbsolute(outArg)
    ? outArg
    : path.join(siteRoot, outArg)
  : path.join(siteRoot, 'public', 'upgrade', 'docs-bundle.json');

function computeDocsFingerprint(db) {
  const rows = db.prepare('SELECT slug, content FROM main_documents ORDER BY slug ASC').all();
  const h = crypto.createHash('sha256');
  for (const r of rows) {
    h.update(String(r.slug));
    h.update('\0');
    h.update(String(r.content != null ? r.content : ''));
    h.update('\n');
  }
  for (const key of ['tools_nav', 'landing', 'seo']) {
    const row = db.prepare('SELECT value FROM site_kv WHERE key = ?').get(key);
    const v = row ? row.value : '';
    h.update(key);
    h.update('\0');
    h.update(v || '');
    h.update('\n');
  }
  return h.digest('hex').slice(0, 24);
}

function readPackageProduct() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(siteRoot, 'package.json'), 'utf-8'));
    return (pkg && pkg.name) || 'ebu4-docs-site';
  } catch (_) {
    return 'ebu4-docs-site';
  }
}

function main() {
  if (!fs.existsSync(dbPath)) {
    console.error('[export-docs-bundle] 找不到数据库:', dbPath);
    process.exit(1);
  }

  const db = new Database(dbPath);
  const rows = db
    .prepare(
      'SELECT slug, title, content, sort_order FROM main_documents ORDER BY sort_order ASC, id ASC'
    )
    .all();

  if (!rows.length) {
    console.error('[export-docs-bundle] main_documents 为空');
    process.exit(1);
  }

  const mainDocuments = rows.map((r) => ({
    slug: r.slug,
    title: r.title != null ? String(r.title) : r.slug,
    content: r.content != null ? String(r.content) : '',
    sort_order: r.sort_order != null ? r.sort_order : 0,
  }));

  const siteKv = {};
  for (const key of ['tools_nav', 'landing', 'seo']) {
    const row = db.prepare('SELECT value FROM site_kv WHERE key = ?').get(key);
    if (row && row.value != null) siteKv[key] = String(row.value);
  }

  const defRow = db.prepare("SELECT value FROM site_kv WHERE key = 'default_main_doc_slug'").get();
  const defaultSlug = defRow && defRow.value ? String(defRow.value).trim() : null;

  const docsVersion = computeDocsFingerprint(db);
  db.close();

  const bundle = {
    format: 'ebu4-docs-bundle-v1',
    product: readPackageProduct(),
    docsVersion,
    mainDocuments,
    siteKv,
  };
  if (defaultSlug) bundle.defaultSlug = defaultSlug;

  const dir = path.dirname(outFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const json = JSON.stringify(bundle, null, 2);
  fs.writeFileSync(outFile, json, 'utf-8');

  const buf = Buffer.from(json, 'utf-8');
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');

  const rel = path.relative(siteRoot, outFile);
  console.log('[export-docs-bundle] 已写入:', rel);
  console.log('[export-docs-bundle] docsVersion（与后台指纹一致）:', docsVersion);
  console.log('[export-docs-bundle] sha256:', sha256);
  console.log('[export-docs-bundle] 请将 manifest.json 中 components.docs 指向该文件并填入 sha256。');
}

main();
