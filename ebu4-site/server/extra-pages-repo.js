/**
 * 扩展页读写：委托 site-database（SQLite）或 extra-pages.json。
 */
const fs = require('fs');
const path = require('path');
const extraPagesStore = require('./extra-pages-store');
const siteDatabase = require('./site-database');
const { normalizeLevel } = require('./security-levels');

const DEFAULT_JSON_PATH = path.join(__dirname, '..', 'public', 'data', 'extra-pages.json');

function jsonPath() {
  return process.env.EXTRA_PAGES_PATH || DEFAULT_JSON_PATH;
}

function useJsonOnly() {
  const v = process.env.EXTRA_PAGES_USE_JSON;
  return v === '1' || v === 'true';
}

function readStoreSync() {
  return extraPagesStore.readStore(jsonPath());
}

function writeFileStore(store) {
  const { backupWithPrune } = require('./lib/backup');
  const keep = parseInt(process.env.ADMIN_BACKUP_KEEP || '20', 10) || 20;
  extraPagesStore.writeStore(jsonPath(), store, backupWithPrune, keep);
}

function formatToDb(f) {
  if (f === 'richtext') return 'richtext';
  if (f === 'html') return 'html';
  return 'markdown';
}

async function readStore() {
  if (!siteDatabase.isSiteSqlite()) {
    return readStoreSync();
  }
  const db = siteDatabase.getDb();
  const rows = db.prepare('SELECT * FROM extra_pages ORDER BY updated_at DESC').all();
  return { pages: rows.map(siteDatabase.rowToPage) };
}

async function insertPage(page) {
  if (!siteDatabase.isSiteSqlite()) {
    const store = readStoreSync();
    store.pages.push(page);
    writeFileStore(store);
    return;
  }
  const db = siteDatabase.getDb();
  const pub = page.publishedAt;
  const enriched = extraPagesStore.enrichPage(page) || page;
  const sl = normalizeLevel(enriched.securityLevel);
  db.prepare(
    `INSERT INTO extra_pages (id, slug, title, format, body, excerpt, cover, tags, author, status, published_at, updated_at, security_level, link_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    page.id,
    page.slug,
    page.title || '',
    formatToDb(page.format),
    page.body != null ? String(page.body) : '',
    page.excerpt != null ? String(page.excerpt) : '',
    page.cover != null ? String(page.cover) : '',
    siteDatabase.tagsJson(page),
    page.author != null ? String(page.author) : '',
    page.status === 'draft' ? 'draft' : 'published',
    pub ? new Date(pub).toISOString() : null,
    (page.updatedAt ? new Date(page.updatedAt) : new Date()).toISOString(),
    sl,
    page.linkUrl != null ? String(page.linkUrl) : ''
  );
}

async function updatePageRow(page) {
  if (!siteDatabase.isSiteSqlite()) {
    throw new Error('updatePageRow 仅用于 SQLite 模式');
  }
  const db = siteDatabase.getDb();
  const pub = page.publishedAt;
  const enriched = extraPagesStore.enrichPage(page) || page;
  const sl = normalizeLevel(enriched.securityLevel);
  db.prepare(
    `UPDATE extra_pages SET slug=?, title=?, format=?, body=?, excerpt=?, cover=?, tags=?, author=?, status=?, published_at=?, updated_at=?, security_level=?, link_url=? WHERE id=?`
  ).run(
    page.slug,
    page.title || '',
    formatToDb(page.format),
    page.body != null ? String(page.body) : '',
    page.excerpt != null ? String(page.excerpt) : '',
    page.cover != null ? String(page.cover) : '',
    siteDatabase.tagsJson(page),
    page.author != null ? String(page.author) : '',
    page.status === 'draft' ? 'draft' : 'published',
    pub ? new Date(pub).toISOString() : null,
    (page.updatedAt ? new Date(page.updatedAt) : new Date()).toISOString(),
    sl,
    page.linkUrl != null ? String(page.linkUrl) : '',
    page.id
  );
}

async function deletePageById(id) {
  if (!siteDatabase.isSiteSqlite()) {
    const store = readStoreSync();
    const next = store.pages.filter((p) => p.id !== id);
    if (next.length === store.pages.length) return false;
    writeFileStore({ pages: next });
    return true;
  }
  const r = siteDatabase.getDb().prepare('DELETE FROM extra_pages WHERE id = ?').run(id);
  return r.changes > 0;
}

function isSqlite() {
  return siteDatabase.isSiteSqlite();
}

async function ping() {
  return siteDatabase.ping();
}

module.exports = {
  readStore,
  insertPage,
  updatePageRow,
  deletePageById,
  writeFileStore,
  isSqlite,
  ping,
  jsonPath,
  useJsonOnly,
};
