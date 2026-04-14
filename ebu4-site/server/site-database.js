/**
 * 企业级单库：主文档 Markdown、站点 JSON（工具导航/落地/SEO）、扩展页，统一存入 SQLite。
 * SITE_STORAGE=file 或 EXTRA_PAGES_USE_JSON=1 时退回纯文件（与旧版一致）。
 */
const fs = require('fs');
const path = require('path');
const docMd = require('./doc-md');
const extraPagesStore = require('./extra-pages-store');

const DEFAULT_DB = path.join(__dirname, '..', 'data', 'site.db');
const LEGACY_EXTRA_DB = path.join(__dirname, '..', 'data', 'extra-pages.db');

let db = null;
let initDone = false;
/** 是否采用 SQLite 单库（在 init 开头赋值，供 isSiteSqlite） */
let siteSqliteMode = false;
let dbPathResolved = '';
/** 文件模式下主 Markdown 路径（用于 main-docs 目录） */
let fileModePaths = null;

const KV_DEFAULT_MAIN_DOC_SLUG = 'default_main_doc_slug';

function useSiteSqlite() {
  if (process.env.SITE_STORAGE === 'file') return false;
  if (process.env.EXTRA_PAGES_USE_JSON === '1') return false;
  return true;
}

function resolveDbPath() {
  return (
    process.env.SITE_SQLITE_PATH ||
    process.env.SQLITE_PATH ||
    DEFAULT_DB
  );
}

function isSiteSqlite() {
  return siteSqliteMode;
}

function getDb() {
  return db;
}

function nowIso() {
  return new Date().toISOString();
}

function ensureSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS extra_pages (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL DEFAULT '',
      format TEXT NOT NULL DEFAULT 'markdown',
      body TEXT NOT NULL DEFAULT '',
      excerpt TEXT NOT NULL DEFAULT '',
      cover TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      author TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'published',
      published_at TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_extra_pages_status ON extra_pages (status);

    CREATE TABLE IF NOT EXISTS site_kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS main_document (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      content TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS main_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_main_documents_sort ON main_documents (sort_order, id);
    CREATE TABLE IF NOT EXISTS main_document_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      main_document_id INTEGER NOT NULL REFERENCES main_documents(id) ON DELETE CASCADE,
      slug TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      content_bytes INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'manual',
      actor_user_id INTEGER,
      actor_username TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_main_document_history_doc_id
      ON main_document_history (main_document_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_main_document_history_slug_id
      ON main_document_history (slug, id DESC);
    CREATE TABLE IF NOT EXISTS site_settings_drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL UNIQUE DEFAULT 'default',
      content_json TEXT NOT NULL,
      updated_by_user_id INTEGER,
      updated_by_username TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS site_settings_releases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL DEFAULT 'default',
      version_no INTEGER NOT NULL,
      content_json TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      risk_flags_json TEXT NOT NULL DEFAULT '[]',
      created_by_user_id INTEGER,
      created_by_username TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_site_settings_releases_scope_version
      ON site_settings_releases (scope, version_no DESC);
    CREATE INDEX IF NOT EXISTS idx_site_settings_releases_scope_created
      ON site_settings_releases (scope, created_at DESC);

    CREATE TABLE IF NOT EXISTS document_sections (
      main_document_id INTEGER NOT NULL REFERENCES main_documents(id) ON DELETE CASCADE,
      section_index INTEGER NOT NULL,
      slug TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      security_level TEXT NOT NULL DEFAULT 'public',
      toc TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (main_document_id, section_index)
    );
    CREATE INDEX IF NOT EXISTS idx_document_sections_doc_sort
      ON document_sections (main_document_id, section_index);
    CREATE INDEX IF NOT EXISTS idx_document_sections_doc_slug
      ON document_sections (main_document_id, slug);

    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'editor',
      disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users (username);

    CREATE TABLE IF NOT EXISTS admin_passkeys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
      credential_id TEXT NOT NULL UNIQUE,
      public_key BLOB NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      transports TEXT NOT NULL DEFAULT '[]',
      label TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_admin_passkeys_user ON admin_passkeys (user_id);

    CREATE TABLE IF NOT EXISTS tech_doc_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT '',
      target_type TEXT NOT NULL DEFAULT 'extra',
      target_doc_slug TEXT NOT NULL DEFAULT '',
      file_name TEXT NOT NULL DEFAULT '',
      markdown_content TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL DEFAULT '[]',
      submitter_name TEXT NOT NULL DEFAULT '',
      submitter_contact TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      review_note TEXT NOT NULL DEFAULT '',
      reviewed_by_user_id INTEGER,
      reviewed_by_username TEXT NOT NULL DEFAULT '',
      reviewed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tech_doc_submissions_status_created
      ON tech_doc_submissions (status, created_at DESC);
  `);
}

function migrateExtraPagesSecurityLevelColumn() {
  if (!siteSqliteMode || !db) return;
  try {
    const cols = db.prepare(`PRAGMA table_info(extra_pages)`).all();
    if (cols.some((c) => c.name === 'security_level')) return;
    db.exec(`ALTER TABLE extra_pages ADD COLUMN security_level TEXT NOT NULL DEFAULT 'public'`);
    console.log('[site-db] extra_pages.security_level 已添加');
  } catch (e) {
    console.warn('[site-db] migrateExtraPagesSecurityLevelColumn:', e.message || e);
  }
}

function migrateExtraPagesLinkUrlColumn() {
  if (!siteSqliteMode || !db) return;
  try {
    const cols = db.prepare(`PRAGMA table_info(extra_pages)`).all();
    if (cols.some((c) => c.name === 'link_url')) return;
    db.exec(`ALTER TABLE extra_pages ADD COLUMN link_url TEXT NOT NULL DEFAULT ''`);
    console.log('[site-db] extra_pages.link_url 已添加');
  } catch (e) {
    console.warn('[site-db] migrateExtraPagesLinkUrlColumn:', e.message || e);
  }
}

function migrateAdminUsersRoleNoCheckConstraint() {
  if (!siteSqliteMode || !db) return;
  const row = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='admin_users'`)
    .get();
  if (!row || !row.sql || !/CHECK\s*\(\s*role\s+IN/i.test(row.sql)) return;
  db.exec(`
    CREATE TABLE admin_users_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'editor',
      disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO admin_users_new (id, username, password_hash, role, disabled, created_at, updated_at)
      SELECT id, username, password_hash, role, disabled, created_at, updated_at FROM admin_users;
    DROP TABLE admin_users;
    ALTER TABLE admin_users_new RENAME TO admin_users;
    CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users (username);
  `);
  console.log('[site-db] admin_users.role 已迁移为任意文本（支持自定义角色）');
}

function getKv(key) {
  if (!siteSqliteMode || !db) return null;
  const row = db.prepare('SELECT value FROM site_kv WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setKv(key, value) {
  if (!db) throw new Error('site-database 未初始化');
  const t = nowIso();
  db.prepare(
    `INSERT INTO site_kv (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, value, t);
}

function normalizeMainDocSlug(input) {
  const s = String(input || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(s)) return null;
  return s;
}

function getDefaultMainDocSlug() {
  if (siteSqliteMode && db) {
    const v = getKv(KV_DEFAULT_MAIN_DOC_SLUG);
    if (v && normalizeMainDocSlug(v)) return normalizeMainDocSlug(v);
    const row = db.prepare('SELECT slug FROM main_documents ORDER BY sort_order ASC, id ASC LIMIT 1').get();
    return row && row.slug ? row.slug : 'default';
  }
  const reg = readMainDocsRegistryFile();
  return reg.defaultSlug && normalizeMainDocSlug(reg.defaultSlug) ? reg.defaultSlug : 'default';
}

function setDefaultMainDocSlug(slug) {
  const s = normalizeMainDocSlug(slug);
  if (!s) throw new Error('无效 slug');
  if (siteSqliteMode && db) {
    const row = db.prepare('SELECT 1 AS o FROM main_documents WHERE slug = ?').get(s);
    if (!row) throw new Error('主文档不存在');
    setKv(KV_DEFAULT_MAIN_DOC_SLUG, s);
    return;
  }
  const reg = readMainDocsRegistryFile();
  if (!reg.docs.some((d) => d.slug === s)) throw new Error('主文档不存在');
  reg.defaultSlug = s;
  writeMainDocsRegistryFile(reg);
}

function migrateMainDocumentsFromLegacySqlite() {
  if (!siteSqliteMode || !db) return;
  const n = db.prepare('SELECT COUNT(*) AS c FROM main_documents').get();
  if (n && n.c > 0) {
    if (!getKv(KV_DEFAULT_MAIN_DOC_SLUG)) {
      const first = db.prepare('SELECT slug FROM main_documents ORDER BY sort_order ASC, id ASC LIMIT 1').get();
      if (first && first.slug) setKv(KV_DEFAULT_MAIN_DOC_SLUG, first.slug);
    }
    return;
  }
  const t = nowIso();
  let content = '';
  try {
    const legacy = db.prepare('SELECT content FROM main_document WHERE id = 1').get();
    if (legacy && legacy.content != null) content = String(legacy.content);
  } catch (_) {}
  db.prepare(
    `INSERT INTO main_documents (slug, title, content, sort_order, updated_at) VALUES (?, ?, ?, 0, ?)`
  ).run('default', '主文档', content, t);
  setKv(KV_DEFAULT_MAIN_DOC_SLUG, 'default');
  console.log('[site-db] 已迁移主文档至 main_documents（default）');
}

function getMainDocumentRowBySlug(slug) {
  if (!siteSqliteMode || !db) return null;
  const s = normalizeMainDocSlug(slug) || getDefaultMainDocSlug();
  return db
    .prepare(
      `SELECT id, slug, title, content, sort_order, updated_at
         FROM main_documents
        WHERE slug = ?`
    )
    .get(s);
}

function normalizeSectionRows(raw, updatedAt) {
  const t = updatedAt || nowIso();
  return docMd.parseSectionsFromRaw(String(raw || '')).map((section, index) => ({
    section_index: index,
    slug: section.slug != null ? String(section.slug) : '',
    title: section.title != null ? String(section.title) : '',
    content: section.content != null ? String(section.content) : '',
    security_level: section.securityLevel != null ? String(section.securityLevel) : 'public',
    toc: JSON.stringify(Array.isArray(section.toc) ? section.toc : []),
    updated_at: t,
  }));
}

function replaceSectionsForMainDocumentId(mainDocumentId, raw, updatedAt) {
  if (!siteSqliteMode || !db) return;
  const docId = parseInt(mainDocumentId, 10);
  if (!Number.isFinite(docId)) return;
  const insert = db.prepare(
    `INSERT INTO document_sections (
       main_document_id,
       section_index,
       slug,
       title,
       content,
       security_level,
       toc,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const rows = normalizeSectionRows(raw, updatedAt);
  db.prepare('DELETE FROM document_sections WHERE main_document_id = ?').run(docId);
  for (const row of rows) {
    insert.run(
      docId,
      row.section_index,
      row.slug,
      row.title,
      row.content,
      row.security_level,
      row.toc,
      row.updated_at
    );
  }
}

function rebuildDocumentSections() {
  if (!siteSqliteMode || !db) return;
  const docs = db
    .prepare(`SELECT id, content, updated_at FROM main_documents ORDER BY sort_order ASC, id ASC`)
    .all();
  const tx = db.transaction((items) => {
    db.prepare('DELETE FROM document_sections').run();
    for (const item of items) {
      replaceSectionsForMainDocumentId(item.id, item.content, item.updated_at || nowIso());
    }
  });
  tx(docs);
}

function sectionRowToObject(row) {
  let toc = [];
  if (typeof row.toc === 'string' && row.toc) {
    try {
      const parsed = JSON.parse(row.toc);
      if (Array.isArray(parsed)) toc = parsed;
    } catch (_) {}
  }
  return {
    id: row.section_index,
    title: row.title != null ? String(row.title) : '',
    slug: row.slug != null ? String(row.slug) : '',
    content: row.content != null ? String(row.content) : '',
    toc,
    securityLevel: row.security_level != null ? String(row.security_level) : 'public',
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  };
}

function mainDocsRootFile() {
  if (!fileModePaths || !fileModePaths.mdPath) return null;
  return path.join(path.dirname(fileModePaths.mdPath), 'main-docs');
}

function readMainDocsRegistryFile() {
  const root = mainDocsRootFile();
  if (!root) return { defaultSlug: 'default', docs: [] };
  const p = path.join(root, 'registry.json');
  if (!fs.existsSync(p)) return { defaultSlug: 'default', docs: [] };
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf-8'));
    const docs = Array.isArray(j.docs) ? j.docs : [];
    const defaultSlug =
      typeof j.defaultSlug === 'string' && normalizeMainDocSlug(j.defaultSlug)
        ? normalizeMainDocSlug(j.defaultSlug)
        : docs[0] && docs[0].slug
          ? docs[0].slug
          : 'default';
    return { defaultSlug, docs };
  } catch (_) {
    return { defaultSlug: 'default', docs: [] };
  }
}

function writeMainDocsRegistryFile(reg) {
  const root = mainDocsRootFile();
  if (!root) throw new Error('main-docs 目录不可用');
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  const p = path.join(root, 'registry.json');
  fs.writeFileSync(p, JSON.stringify(reg, null, 2), 'utf-8');
}

function migrateFileModeMainDocuments() {
  const root = mainDocsRootFile();
  if (!root || !fileModePaths.mdPath) return;
  const regPath = path.join(root, 'registry.json');
  if (fs.existsSync(regPath)) return;
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  let content = '';
  if (fs.existsSync(fileModePaths.mdPath)) {
    try {
      content = fs.readFileSync(fileModePaths.mdPath, 'utf-8');
    } catch (_) {}
  }
  const defaultMd = path.join(root, 'default.md');
  fs.writeFileSync(defaultMd, content, 'utf-8');
  writeMainDocsRegistryFile({
    defaultSlug: 'default',
    docs: [{ slug: 'default', title: '主文档', sort_order: 0 }],
  });
  console.log('[site-db] 文件模式：已初始化 main-docs/default.md');
}

function listMainDocuments() {
  if (siteSqliteMode && db) {
    const def = getDefaultMainDocSlug();
    const rows = db
      .prepare(
        `SELECT id, slug, title, sort_order, updated_at,
                length(content) AS bytes FROM main_documents ORDER BY sort_order ASC, id ASC`
      )
      .all();
    return rows.map((r) =>
      Object.assign({}, r, { isDefault: r.slug === def })
    );
  }
  const reg = readMainDocsRegistryFile();
  const def = reg.defaultSlug || 'default';
  return reg.docs.map((d, i) => ({
    id: i + 1,
    slug: d.slug,
    title: d.title || d.slug,
    sort_order: d.sort_order != null ? d.sort_order : i,
    updated_at: d.updated_at || new Date().toISOString(),
    bytes: (() => {
      const fp = path.join(mainDocsRootFile() || '', `${d.slug}.md`);
      try {
        if (fs.existsSync(fp)) return fs.statSync(fp).size;
      } catch (_) {}
      return 0;
    })(),
    isDefault: d.slug === def,
  }));
}

function listSectionsForSlug(slug) {
  const s = normalizeMainDocSlug(slug) || getDefaultMainDocSlug();
  if (siteSqliteMode && db) {
    const docRow = getMainDocumentRowBySlug(s);
    if (!docRow) return [];
    let rows = db
      .prepare(
        `SELECT section_index, slug, title, content, security_level, toc, updated_at
           FROM document_sections
          WHERE main_document_id = ?
          ORDER BY section_index ASC`
      )
      .all(docRow.id);
    if (rows.length === 0 && String(docRow.content || '').trim()) {
      replaceSectionsForMainDocumentId(docRow.id, docRow.content, docRow.updated_at || nowIso());
      rows = db
        .prepare(
          `SELECT section_index, slug, title, content, security_level, toc, updated_at
             FROM document_sections
            WHERE main_document_id = ?
            ORDER BY section_index ASC`
        )
        .all(docRow.id);
    }
    return rows.map(sectionRowToObject);
  }
  return docMd.parseSectionsFromRaw(getMainMarkdownForSlug(s) || '');
}

function countSectionsForSlug(slug) {
  const s = normalizeMainDocSlug(slug) || getDefaultMainDocSlug();
  if (siteSqliteMode && db) {
    const docRow = getMainDocumentRowBySlug(s);
    if (!docRow) return 0;
    let row = db
      .prepare(`SELECT COUNT(*) AS c FROM document_sections WHERE main_document_id = ?`)
      .get(docRow.id);
    if (row && row.c === 0 && String(docRow.content || '').trim()) {
      replaceSectionsForMainDocumentId(docRow.id, docRow.content, docRow.updated_at || nowIso());
      row = db
        .prepare(`SELECT COUNT(*) AS c FROM document_sections WHERE main_document_id = ?`)
        .get(docRow.id);
    }
    if (row && Number.isFinite(row.c)) return row.c;
    return 0;
  }
  return listSectionsForSlug(s).length;
}

function getMainMarkdownForSlug(slug) {
  const s = normalizeMainDocSlug(slug) || getDefaultMainDocSlug();
  if (siteSqliteMode && db) {
    const row = db.prepare('SELECT content FROM main_documents WHERE slug = ?').get(s);
    if (row && row.content != null) return String(row.content);
    return '';
  }
  const root = mainDocsRootFile();
  if (!root) return '';
  const fp = path.join(root, `${s}.md`);
  if (!fs.existsSync(fp)) return '';
  try {
    return fs.readFileSync(fp, 'utf-8');
  } catch (_) {
    return '';
  }
}

function setMainMarkdownForSlug(slug, content) {
  const s = normalizeMainDocSlug(slug) || getDefaultMainDocSlug();
  const body = content != null ? String(content) : '';
  const t = nowIso();
  if (siteSqliteMode && db) {
    const row = db.prepare('SELECT id FROM main_documents WHERE slug = ?').get(s);
    if (!row) throw new Error('主文档不存在: ' + s);
    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE main_documents SET content = ?, updated_at = ? WHERE slug = ?`
      ).run(body, t, s);
      replaceSectionsForMainDocumentId(row.id, body, t);
    });
    tx();
    return;
  }
  const reg = readMainDocsRegistryFile();
  if (!reg.docs.some((d) => d.slug === s)) throw new Error('主文档不存在: ' + s);
  const root = mainDocsRootFile();
  if (!root) throw new Error('main-docs 目录不可用');
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  const fp = path.join(root, `${s}.md`);
  if (fs.existsSync(fp)) {
    try {
      const bakDir = path.join(root, '.backup');
      if (!fs.existsSync(bakDir)) fs.mkdirSync(bakDir, { recursive: true });
      const stamp = t.replace(/[:.]/g, '-');
      fs.copyFileSync(fp, path.join(bakDir, `${s}-${stamp}.md`));
    } catch (_) {}
  }
  fs.writeFileSync(fp, body, 'utf-8');
  reg.docs = reg.docs.map((d) =>
    d.slug === s ? Object.assign({}, d, { updated_at: t }) : d
  );
  writeMainDocsRegistryFile(reg);
}

function appendMainDocHistory({
  slug,
  content,
  source,
  actorUserId,
  actorUsername,
  summary,
}) {
  if (!siteSqliteMode || !db) return null;
  const s = normalizeMainDocSlug(slug) || getDefaultMainDocSlug();
  const row = db
    .prepare(`SELECT id, slug, title FROM main_documents WHERE slug = ?`)
    .get(s);
  if (!row) throw new Error('主文档不存在');
  const body = content != null ? String(content) : '';
  const src = String(source || 'manual').trim() || 'manual';
  const actorName = actorUsername != null ? String(actorUsername).trim() : '';
  const actorIdNum = Number.isFinite(Number(actorUserId))
    ? Number(actorUserId)
    : null;
  const note = summary != null ? String(summary).trim() : '';
  const t = nowIso();
  const info = db
    .prepare(
      `INSERT INTO main_document_history
       (main_document_id, slug, title, content, content_bytes, source, actor_user_id, actor_username, summary, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      row.id,
      row.slug,
      row.title || row.slug,
      body,
      Buffer.byteLength(body, 'utf-8'),
      src,
      actorIdNum,
      actorName,
      note,
      t
    );
  return info.lastInsertRowid;
}

function pruneMainDocHistory(slug, keep) {
  if (!siteSqliteMode || !db) return 0;
  const s = normalizeMainDocSlug(slug) || getDefaultMainDocSlug();
  const row = db.prepare(`SELECT id FROM main_documents WHERE slug = ?`).get(s);
  if (!row) return 0;
  const keepCount = Math.max(1, parseInt(keep, 10) || 100);
  const info = db
    .prepare(
      `DELETE FROM main_document_history
       WHERE main_document_id = ?
         AND id IN (
           SELECT id
             FROM main_document_history
            WHERE main_document_id = ?
            ORDER BY id DESC
            LIMIT -1 OFFSET ?
         )`
    )
    .run(row.id, row.id, keepCount);
  return info.changes || 0;
}

function listMainDocHistory(slug, opts) {
  if (!siteSqliteMode || !db) return [];
  const s = normalizeMainDocSlug(slug) || getDefaultMainDocSlug();
  const row = db.prepare(`SELECT id FROM main_documents WHERE slug = ?`).get(s);
  if (!row) return [];
  const limit = Math.min(200, Math.max(1, parseInt(opts && opts.limit, 10) || 30));
  const cursor = parseInt(opts && opts.cursor, 10);
  if (Number.isFinite(cursor) && cursor > 0) {
    return db
      .prepare(
        `SELECT id, slug, title, source, actor_user_id, actor_username, summary, content_bytes, created_at
           FROM main_document_history
          WHERE main_document_id = ? AND id < ?
          ORDER BY id DESC
          LIMIT ?`
      )
      .all(row.id, cursor, limit);
  }
  return db
    .prepare(
      `SELECT id, slug, title, source, actor_user_id, actor_username, summary, content_bytes, created_at
         FROM main_document_history
        WHERE main_document_id = ?
        ORDER BY id DESC
        LIMIT ?`
    )
    .all(row.id, limit);
}

function getMainDocHistoryVersion(slug, versionId) {
  if (!siteSqliteMode || !db) return null;
  const s = normalizeMainDocSlug(slug) || getDefaultMainDocSlug();
  const row = db.prepare(`SELECT id FROM main_documents WHERE slug = ?`).get(s);
  if (!row) return null;
  const id = parseInt(versionId, 10);
  if (!Number.isFinite(id)) return null;
  return db
    .prepare(
      `SELECT id, slug, title, content, source, actor_user_id, actor_username, summary, content_bytes, created_at
         FROM main_document_history
        WHERE main_document_id = ? AND id = ?`
    )
    .get(row.id, id);
}

function createMainDocument({ slug, title }) {
  const s = normalizeMainDocSlug(slug);
  if (!s) throw new Error('slug 须为小写字母、数字、连字符，且 1–63 字符');
  const tit = String(title || '').trim() || s;
  const t = nowIso();
  const seed = '# ' + tit + '\n\n';
  if (siteSqliteMode && db) {
    const ex = db.prepare('SELECT id FROM main_documents WHERE slug = ?').get(s);
    if (ex) throw new Error('slug 已存在');
    const maxRow = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM main_documents').get();
    const ord = (maxRow && maxRow.m != null ? maxRow.m : -1) + 1;
    const tx = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO main_documents (slug, title, content, sort_order, updated_at) VALUES (?, ?, ?, ?, ?)`
        )
        .run(s, tit, seed, ord, t);
      replaceSectionsForMainDocumentId(info.lastInsertRowid, seed, t);
    });
    tx();
    return s;
  }
  migrateFileModeMainDocuments();
  const reg = readMainDocsRegistryFile();
  if (reg.docs.some((d) => d.slug === s)) throw new Error('slug 已存在');
  const maxOrd = reg.docs.reduce((m, d) => Math.max(m, d.sort_order != null ? d.sort_order : 0), -1);
  reg.docs.push({ slug: s, title: tit, sort_order: maxOrd + 1, updated_at: t });
  writeMainDocsRegistryFile(reg);
  const root = mainDocsRootFile();
  const fp = path.join(root, `${s}.md`);
  fs.writeFileSync(fp, seed, 'utf-8');
  return s;
}

function updateMainDocumentTitle(slug, title) {
  const s = normalizeMainDocSlug(slug);
  if (!s) throw new Error('无效 slug');
  const tit = String(title || '').trim();
  if (!tit) throw new Error('标题不能为空');
  const t = nowIso();
  if (siteSqliteMode && db) {
    const row = db.prepare('SELECT id FROM main_documents WHERE slug = ?').get(s);
    if (!row) throw new Error('主文档不存在');
    db.prepare(`UPDATE main_documents SET title = ?, updated_at = ? WHERE slug = ?`).run(tit, t, s);
    return;
  }
  const reg = readMainDocsRegistryFile();
  const d = reg.docs.find((x) => x.slug === s);
  if (!d) throw new Error('主文档不存在');
  d.title = tit;
  d.updated_at = t;
  writeMainDocsRegistryFile(reg);
}

function deleteMainDocument(slug) {
  const s = normalizeMainDocSlug(slug);
  if (!s) throw new Error('无效 slug');
  if (siteSqliteMode && db) {
    const n = db.prepare('SELECT COUNT(*) AS c FROM main_documents').get();
    if (!n || n.c <= 1) throw new Error('至少保留一个主文档');
    const row = db.prepare('SELECT slug FROM main_documents WHERE slug = ?').get(s);
    if (!row) throw new Error('主文档不存在');
    const def = getDefaultMainDocSlug();
    if (s === def) {
      const other = db
        .prepare(`SELECT slug FROM main_documents WHERE slug != ? ORDER BY sort_order ASC, id ASC LIMIT 1`)
        .get(s);
      if (!other) throw new Error('无法删除');
      setKv(KV_DEFAULT_MAIN_DOC_SLUG, other.slug);
    }
    db.prepare('DELETE FROM main_documents WHERE slug = ?').run(s);
    return;
  }
  const reg = readMainDocsRegistryFile();
  if (reg.docs.length <= 1) throw new Error('至少保留一个主文档');
  const idx = reg.docs.findIndex((d) => d.slug === s);
  if (idx < 0) throw new Error('主文档不存在');
  if (reg.defaultSlug === s) {
    const other = reg.docs.find((d) => d.slug !== s);
    if (!other) throw new Error('无法删除');
    reg.defaultSlug = other.slug;
  }
  reg.docs.splice(idx, 1);
  writeMainDocsRegistryFile(reg);
  const root = mainDocsRootFile();
  const fp = path.join(root, `${s}.md`);
  try {
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  } catch (_) {}
}

function getMainMarkdown() {
  if (!siteSqliteMode || !db) {
    if (fileModePaths && fileModePaths.mdPath) {
      migrateFileModeMainDocuments();
      return getMainMarkdownForSlug(getDefaultMainDocSlug());
    }
    return null;
  }
  return getMainMarkdownForSlug(getDefaultMainDocSlug());
}

function setMainMarkdown(content) {
  if (!siteSqliteMode || !db) {
    if (fileModePaths && fileModePaths.mdPath) {
      migrateFileModeMainDocuments();
      setMainMarkdownForSlug(getDefaultMainDocSlug(), content);
      return;
    }
    throw new Error('site-database 未初始化');
  }
  setMainMarkdownForSlug(getDefaultMainDocSlug(), content);
}

function migrateKvFromFiles(paths) {
  const pairs = [
    ['tools_nav', paths.toolsJsonPath],
    ['landing', paths.landingJsonPath],
    ['seo', paths.seoJsonPath],
  ];
  for (const [k, p] of pairs) {
    const row = db.prepare('SELECT 1 AS o FROM site_kv WHERE key = ?').get(k);
    if (row) continue;
    if (!p || !fs.existsSync(p)) continue;
    try {
      const raw = fs.readFileSync(p, 'utf-8');
      setKv(k, raw);
      console.log('[site-db] 已导入 site_kv:', k);
    } catch (_) {}
  }
}

function migrateMainDocFromFile(mdPath) {
  if (!siteSqliteMode || !db) return;
  if (!mdPath || !fs.existsSync(mdPath)) return;
  const hasNonEmptyMainDoc = db
    .prepare(
      `SELECT 1 AS o
         FROM main_documents
        WHERE length(trim(content)) > 0
        LIMIT 1`
    )
    .get();
  if (hasNonEmptyMainDoc) return;
  const hasAnyMainDoc = db.prepare('SELECT 1 AS o FROM main_documents LIMIT 1').get();
  if (!hasAnyMainDoc) {
    migrateMainDocumentsFromLegacySqlite();
  }
  try {
    const raw = fs.readFileSync(mdPath, 'utf-8');
    if (!String(raw || '').trim()) return;
    setMainMarkdown(raw);
    console.log('[site-db] 主文档已从 Markdown 文件导入');
  } catch (_) {}
}

function rowToPage(row) {
  let tags = row.tags;
  if (tags == null) tags = [];
  else if (typeof tags === 'string') {
    try {
      tags = JSON.parse(tags);
    } catch (_) {
      tags = [];
    }
  }
  const { normalizeLevel } = require('./security-levels');
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    format:
      row.format === 'richtext'
        ? 'richtext'
        : row.format === 'html'
          ? 'html'
          : 'markdown',
    body: row.body != null ? String(row.body) : '',
    excerpt: row.excerpt != null ? String(row.excerpt) : '',
    cover: row.cover != null ? String(row.cover) : '',
    tags: Array.isArray(tags) ? tags : extraPagesStore.parseTagsInput(tags),
    author: row.author != null ? String(row.author) : '',
    status: row.status === 'draft' ? 'draft' : 'published',
    securityLevel: normalizeLevel(row.security_level),
    publishedAt: row.published_at
      ? new Date(row.published_at).toISOString()
      : null,
    updatedAt: row.updated_at
      ? new Date(row.updated_at).toISOString()
      : new Date().toISOString(),
    linkUrl: row.link_url != null ? String(row.link_url) : '',
  };
}

function tagsJson(p) {
  const t = Array.isArray(p.tags) ? p.tags : extraPagesStore.parseTagsInput(p.tags);
  return JSON.stringify(t);
}

function migrateExtraPagesFromJson(extraPagesJsonPath) {
  const p = extraPagesJsonPath || path.join(__dirname, '..', 'public', 'data', 'extra-pages.json');
  const count = db.prepare('SELECT COUNT(*) AS c FROM extra_pages').get().c;
  if (count > 0) return;
  if (!p || !fs.existsSync(p)) return;
  let j;
  try {
    j = JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (_) {
    return;
  }
  const pages = Array.isArray(j.pages) ? j.pages : [];
  if (!pages.length) return;
  console.log(`[site-db] 扩展页从 JSON 迁移 ${pages.length} 条`);
  const insert = db.prepare(
    `INSERT INTO extra_pages (id, slug, title, format, body, excerpt, cover, tags, author, status, published_at, updated_at, security_level, link_url)
     VALUES (@id, @slug, @title, @format, @body, @excerpt, @cover, @tags, @author, @status, @published_at, @updated_at, @security_level, @link_url)`
  );
  const tx = db.transaction((items) => {
    for (const raw of items) {
      const page = Object.assign({}, raw);
      if (!page.id) continue;
      const enriched = extraPagesStore.enrichPage(page) || page;
      const pub = enriched.publishedAt;
      const { normalizeLevel } = require('./security-levels');
      insert.run({
        id: enriched.id,
        slug: enriched.slug,
        title: enriched.title || '',
        format:
          enriched.format === 'richtext'
            ? 'richtext'
            : enriched.format === 'html'
              ? 'html'
              : 'markdown',
        body: enriched.body != null ? String(enriched.body) : '',
        excerpt: enriched.excerpt != null ? String(enriched.excerpt) : '',
        cover: enriched.cover != null ? String(enriched.cover) : '',
        tags: tagsJson(enriched),
        author: enriched.author != null ? String(enriched.author) : '',
        status: enriched.status === 'draft' ? 'draft' : 'published',
        published_at: pub ? new Date(pub).toISOString() : null,
        updated_at: (enriched.updatedAt
          ? new Date(enriched.updatedAt)
          : new Date()
        ).toISOString(),
        security_level: normalizeLevel(enriched.securityLevel),
        link_url: enriched.linkUrl != null ? String(enriched.linkUrl) : '',
      });
    }
  });
  tx(pages);
}

/**
 * @param {{ mdPath: string, toolsJsonPath: string, landingJsonPath: string, seoJsonPath: string, extraPagesJsonPath?: string }} paths
 */
function init(paths) {
  if (initDone) return;
  initDone = true;
  siteSqliteMode = useSiteSqlite();
  fileModePaths = paths || {};
  if (!siteSqliteMode) {
    console.log('[site-db] 全站使用文件存储（Markdown + public/data/*.json）');
    migrateFileModeMainDocuments();
    return;
  }
  const Database = require('better-sqlite3');
  dbPathResolved = resolveDbPath();
  const dir = path.dirname(dbPathResolved);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(dbPathResolved) && fs.existsSync(LEGACY_EXTRA_DB)) {
    fs.copyFileSync(LEGACY_EXTRA_DB, dbPathResolved);
    console.log('[site-db] 已从 extra-pages.db 复制到', dbPathResolved);
  }
  db = new Database(dbPathResolved);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  ensureSchema();
  migrateAdminUsersRoleNoCheckConstraint();
  migrateExtraPagesSecurityLevelColumn();
  migrateExtraPagesLinkUrlColumn();
  const p = paths || {};
  migrateKvFromFiles({
    toolsJsonPath: p.toolsJsonPath,
    landingJsonPath: p.landingJsonPath,
    seoJsonPath: p.seoJsonPath,
  });
  migrateMainDocumentsFromLegacySqlite();
  migrateMainDocFromFile(p.mdPath);
  rebuildDocumentSections();
  migrateExtraPagesFromJson(p.extraPagesJsonPath);
  console.log('[site-db] SQLite 就绪:', dbPathResolved);
}

function ping() {
  if (!siteSqliteMode || !db) return true;
  db.prepare('SELECT 1').get();
  return true;
}

function kvMeta() {
  if (!siteSqliteMode || !db) return null;
  const rows = db
    .prepare(
      `SELECT key, length(value) AS bytes, updated_at FROM site_kv ORDER BY key`
    )
    .all();
  return rows;
}

function mainDocMeta() {
  if (!siteSqliteMode || !db) return null;
  const slug = getDefaultMainDocSlug();
  const row = db
    .prepare(`SELECT length(content) AS bytes, updated_at FROM main_documents WHERE slug = ?`)
    .get(slug);
  return row || null;
}

function adminUsersCount() {
  if (!siteSqliteMode || !db) return 0;
  const row = db.prepare('SELECT COUNT(*) AS c FROM admin_users').get();
  return row ? row.c : 0;
}

function adminUsersList() {
  if (!siteSqliteMode || !db) return [];
  return db
    .prepare(
      `SELECT id, username, role, disabled, created_at, updated_at FROM admin_users ORDER BY id ASC`
    )
    .all();
}

function adminUserByUsername(username) {
  if (!siteSqliteMode || !db) return null;
  const u = String(username || '').trim();
  if (!u) return null;
  return db
    .prepare(
      `SELECT id, username, password_hash, role, disabled, created_at, updated_at FROM admin_users WHERE username = ? COLLATE NOCASE`
    )
    .get(u);
}

function adminUserById(id) {
  if (!siteSqliteMode || !db) return null;
  const n = parseInt(id, 10);
  if (!Number.isFinite(n)) return null;
  return db
    .prepare(
      `SELECT id, username, password_hash, role, disabled, created_at, updated_at FROM admin_users WHERE id = ?`
    )
    .get(n);
}

function adminUserInsert({ username, passwordHash, role }) {
  if (!db) throw new Error('site-database 未初始化');
  const t = nowIso();
  const u = String(username || '').trim();
  const r = String(role || 'editor').trim() || 'editor';
  const info = db
    .prepare(
      `INSERT INTO admin_users (username, password_hash, role, disabled, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?)`
    )
    .run(u, passwordHash, r, t, t);
  return info.lastInsertRowid;
}

function adminUserUpdate(id, { passwordHash, role, disabled }) {
  if (!db) throw new Error('site-database 未初始化');
  const n = parseInt(id, 10);
  if (!Number.isFinite(n)) throw new Error('无效 id');
  const row = adminUserById(n);
  if (!row) throw new Error('用户不存在');
  const t = nowIso();
  const parts = ['updated_at = ?'];
  const vals = [t];
  if (passwordHash != null) {
    parts.push('password_hash = ?');
    vals.push(passwordHash);
  }
  if (role != null) {
    parts.push('role = ?');
    vals.push(String(role).trim() || 'editor');
  }
  if (disabled != null) {
    parts.push('disabled = ?');
    vals.push(disabled ? 1 : 0);
  }
  vals.push(n);
  db.prepare(`UPDATE admin_users SET ${parts.join(', ')} WHERE id = ?`).run(...vals);
}

function adminUserDelete(id) {
  if (!db) throw new Error('site-database 未初始化');
  const n = parseInt(id, 10);
  if (!Number.isFinite(n)) throw new Error('无效 id');
  db.prepare('DELETE FROM admin_users WHERE id = ?').run(n);
}

function adminUsersAdminCount() {
  if (!siteSqliteMode || !db) return 0;
  const row = db
    .prepare(`SELECT COUNT(*) AS c FROM admin_users WHERE role = 'admin' AND disabled = 0`)
    .get();
  return row ? row.c : 0;
}

function adminUsersCountByRole(role) {
  if (!siteSqliteMode || !db) return 0;
  const r = String(role || '').trim();
  if (!r) return 0;
  const row = db.prepare(`SELECT COUNT(*) AS c FROM admin_users WHERE role = ?`).get(r);
  return row ? row.c : 0;
}

function getSiteSettingsDraft(scope) {
  if (!siteSqliteMode || !db) return null;
  const sc = String(scope || 'default').trim() || 'default';
  return db
    .prepare(
      `SELECT id, scope, content_json, updated_by_user_id, updated_by_username, updated_at
         FROM site_settings_drafts
        WHERE scope = ?`
    )
    .get(sc);
}

function upsertSiteSettingsDraft({ scope, contentJson, updatedByUserId, updatedByUsername }) {
  if (!siteSqliteMode || !db) return null;
  const sc = String(scope || 'default').trim() || 'default';
  const body = String(contentJson || '{}');
  const uid = Number.isFinite(Number(updatedByUserId)) ? Number(updatedByUserId) : null;
  const uname = updatedByUsername != null ? String(updatedByUsername).trim() : '';
  const t = nowIso();
  db.prepare(
    `INSERT INTO site_settings_drafts (scope, content_json, updated_by_user_id, updated_by_username, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(scope) DO UPDATE SET
       content_json = excluded.content_json,
       updated_by_user_id = excluded.updated_by_user_id,
       updated_by_username = excluded.updated_by_username,
       updated_at = excluded.updated_at`
  ).run(sc, body, uid, uname, t);
  return getSiteSettingsDraft(sc);
}

function createSiteSettingsRelease({
  scope,
  contentJson,
  summary,
  riskFlagsJson,
  createdByUserId,
  createdByUsername,
}) {
  if (!siteSqliteMode || !db) return null;
  const sc = String(scope || 'default').trim() || 'default';
  const body = String(contentJson || '{}');
  const note = summary != null ? String(summary).trim() : '';
  const risk = riskFlagsJson != null ? String(riskFlagsJson) : '[]';
  const uid = Number.isFinite(Number(createdByUserId)) ? Number(createdByUserId) : null;
  const uname = createdByUsername != null ? String(createdByUsername).trim() : '';
  const t = nowIso();
  const tx = db.transaction(() => {
    const row = db
      .prepare(`SELECT COALESCE(MAX(version_no), 0) AS m FROM site_settings_releases WHERE scope = ?`)
      .get(sc);
    const next = (row && row.m ? row.m : 0) + 1;
    const info = db
      .prepare(
        `INSERT INTO site_settings_releases
         (scope, version_no, content_json, summary, risk_flags_json, created_by_user_id, created_by_username, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(sc, next, body, note, risk, uid, uname, t);
    return { id: info.lastInsertRowid, versionNo: next };
  });
  const out = tx();
  return getSiteSettingsReleaseById(out.id);
}

function listSiteSettingsReleases(scope, opts) {
  if (!siteSqliteMode || !db) return [];
  const sc = String(scope || 'default').trim() || 'default';
  const limit = Math.min(100, Math.max(1, parseInt(opts && opts.limit, 10) || 20));
  const cursor = parseInt(opts && opts.cursor, 10);
  if (Number.isFinite(cursor) && cursor > 0) {
    return db
      .prepare(
        `SELECT id, scope, version_no, summary, risk_flags_json, created_by_user_id, created_by_username, created_at
           FROM site_settings_releases
          WHERE scope = ? AND id < ?
          ORDER BY id DESC
          LIMIT ?`
      )
      .all(sc, cursor, limit);
  }
  return db
    .prepare(
      `SELECT id, scope, version_no, summary, risk_flags_json, created_by_user_id, created_by_username, created_at
         FROM site_settings_releases
        WHERE scope = ?
        ORDER BY id DESC
        LIMIT ?`
    )
    .all(sc, limit);
}

function getSiteSettingsReleaseById(id) {
  if (!siteSqliteMode || !db) return null;
  const n = parseInt(id, 10);
  if (!Number.isFinite(n)) return null;
  return db
    .prepare(
      `SELECT id, scope, version_no, content_json, summary, risk_flags_json, created_by_user_id, created_by_username, created_at
         FROM site_settings_releases
        WHERE id = ?`
    )
    .get(n);
}

function createDocSubmission(input) {
  if (!siteSqliteMode || !db) return null;
  const t = nowIso();
  const title = String((input && input.title) || '').trim();
  const targetType = String((input && input.targetType) || 'extra').trim() === 'main' ? 'main' : 'extra';
  const targetDocSlug = String((input && input.targetDocSlug) || '').trim();
  const fileName = String((input && input.fileName) || '').trim();
  const markdownContent = String((input && input.markdownContent) || '');
  const submitterName = String((input && input.submitterName) || '').trim();
  const submitterContact = String((input && input.submitterContact) || '').trim();
  const tags = Array.isArray(input && input.tags)
    ? input.tags.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  const info = db
    .prepare(
      `INSERT INTO tech_doc_submissions
       (title, target_type, target_doc_slug, file_name, markdown_content, tags_json, submitter_name, submitter_contact, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
    )
    .run(
      title,
      targetType,
      targetDocSlug,
      fileName,
      markdownContent,
      JSON.stringify(tags),
      submitterName,
      submitterContact,
      t,
      t
    );
  return getDocSubmissionById(info.lastInsertRowid);
}

function listDocSubmissions(opts) {
  if (!siteSqliteMode || !db) return [];
  const statusRaw = opts && opts.status != null ? String(opts.status).trim() : '';
  const limit = Math.min(200, Math.max(1, parseInt(opts && opts.limit, 10) || 50));
  const allowed = new Set(['pending', 'approved', 'rejected']);
  if (statusRaw && allowed.has(statusRaw)) {
    return db
      .prepare(
        `SELECT * FROM tech_doc_submissions
         WHERE status = ?
         ORDER BY id DESC
         LIMIT ?`
      )
      .all(statusRaw, limit)
      .map(docSubmissionRowToObject);
  }
  return db
    .prepare(
      `SELECT * FROM tech_doc_submissions
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(limit)
    .map(docSubmissionRowToObject);
}

function getDocSubmissionById(id) {
  if (!siteSqliteMode || !db) return null;
  const n = parseInt(id, 10);
  if (!Number.isFinite(n)) return null;
  const row = db
    .prepare(`SELECT * FROM tech_doc_submissions WHERE id = ?`)
    .get(n);
  return row ? docSubmissionRowToObject(row) : null;
}

function reviewDocSubmission({
  id,
  nextStatus,
  reviewNote,
  reviewedByUserId,
  reviewedByUsername,
}) {
  if (!siteSqliteMode || !db) return null;
  const n = parseInt(id, 10);
  if (!Number.isFinite(n)) return null;
  const status = String(nextStatus || '').trim();
  if (status !== 'approved' && status !== 'rejected') throw new Error('无效审核状态');
  const note = String(reviewNote || '').trim();
  const uid = Number.isFinite(Number(reviewedByUserId)) ? Number(reviewedByUserId) : null;
  const uname = String(reviewedByUsername || '').trim();
  const t = nowIso();
  const info = db
    .prepare(
      `UPDATE tech_doc_submissions
       SET status = ?,
           review_note = ?,
           reviewed_by_user_id = ?,
           reviewed_by_username = ?,
           reviewed_at = ?,
           updated_at = ?
       WHERE id = ? AND status = 'pending'`
    )
    .run(status, note, uid, uname, t, t, n);
  if (!info.changes) return null;
  return getDocSubmissionById(n);
}

function docSubmissionRowToObject(row) {
  var tags = [];
  if (row && typeof row.tags_json === 'string' && row.tags_json) {
    try {
      const parsed = JSON.parse(row.tags_json);
      if (Array.isArray(parsed)) tags = parsed;
    } catch (_) {}
  }
  return {
    id: row.id,
    title: row.title != null ? String(row.title) : '',
    targetType: row.target_type === 'main' ? 'main' : 'extra',
    targetDocSlug: row.target_doc_slug != null ? String(row.target_doc_slug) : '',
    fileName: row.file_name != null ? String(row.file_name) : '',
    markdownContent: row.markdown_content != null ? String(row.markdown_content) : '',
    tags: tags.map((x) => String(x || '')).filter(Boolean),
    submitterName: row.submitter_name != null ? String(row.submitter_name) : '',
    submitterContact: row.submitter_contact != null ? String(row.submitter_contact) : '',
    status: row.status || 'pending',
    reviewNote: row.review_note != null ? String(row.review_note) : '',
    reviewedByUserId:
      row.reviewed_by_user_id != null && Number.isFinite(Number(row.reviewed_by_user_id))
        ? Number(row.reviewed_by_user_id)
        : null,
    reviewedByUsername: row.reviewed_by_username != null ? String(row.reviewed_by_username) : '',
    reviewedAt: row.reviewed_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

module.exports = {
  init,
  getDb,
  isSiteSqlite,
  getKv,
  setKv,
  getMainMarkdown,
  setMainMarkdown,
  getMainMarkdownForSlug,
  setMainMarkdownForSlug,
  listSectionsForSlug,
  countSectionsForSlug,
  normalizeMainDocSlug,
  getDefaultMainDocSlug,
  setDefaultMainDocSlug,
  listMainDocuments,
  createMainDocument,
  updateMainDocumentTitle,
  deleteMainDocument,
  appendMainDocHistory,
  pruneMainDocHistory,
  listMainDocHistory,
  getMainDocHistoryVersion,
  rebuildDocumentSections,
  ping,
  kvMeta,
  mainDocMeta,
  resolveDbPath: () => dbPathResolved || resolveDbPath(),
  rowToPage,
  tagsJson,
  adminUsersCount,
  adminUsersList,
  adminUserByUsername,
  adminUserById,
  adminUserInsert,
  adminUserUpdate,
  adminUserDelete,
  adminUsersAdminCount,
  adminUsersCountByRole,
  getSiteSettingsDraft,
  upsertSiteSettingsDraft,
  createSiteSettingsRelease,
  listSiteSettingsReleases,
  getSiteSettingsReleaseById,
  createDocSubmission,
  listDocSubmissions,
  getDocSubmissionById,
  reviewDocSubmission,
  migrateAdminUsersRoleNoCheckConstraint,
};
