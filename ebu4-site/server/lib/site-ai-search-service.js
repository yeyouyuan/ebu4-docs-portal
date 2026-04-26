const { canReadContent, normalizeLevel } = require('../security-levels');
const extraPagesStore = require('../extra-pages-store');
const { extraPageSearchableText, stripHtml } = require('./extra-page-search-text');
let builtFtsEpoch = -1;

function normalizeSearchText(s) {
  return String(s || '')
    .replace(/[#*`\[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreAgainstKeywords(textLower, titleLower, keywords) {
  let score = 0;
  for (const kw of keywords) {
    if (!kw) continue;
    if (titleLower.includes(kw)) score += 10;
    const re = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const count = (textLower.match(re) || []).length;
    score += count;
  }
  return score;
}

function snippetFromText(text, keywords) {
  const textRaw = normalizeSearchText(text);
  const textLower = textRaw.toLowerCase();
  const first = String(keywords[0] || '').toLowerCase();
  if (!first) return textRaw.slice(0, 160);
  const idx = textLower.indexOf(first);
  if (idx < 0) return textRaw.slice(0, 160);
  const start = Math.max(0, idx - 80);
  const end = Math.min(textRaw.length, idx + 120);
  return textRaw.slice(start, end).trim();
}

function pageBodyPlain(page) {
  const rawBody = page && page.body != null ? String(page.body) : '';
  if (page && (page.format === 'richtext' || page.format === 'html')) {
    return normalizeSearchText(stripHtml(rawBody));
  }
  return normalizeSearchText(rawBody);
}

async function searchSiteKnowledge(input) {
  const opts = input && typeof input === 'object' ? input : {};
  const query = String(opts.query || '').trim().toLowerCase();
  const keywords = query.split(/\s+/).filter(Boolean).slice(0, 8);
  if (!keywords.length) return [];
  const clearance = opts.clearance || 'guest';
  const currentDocSlug = opts.currentDocSlug ? String(opts.currentDocSlug).trim() : '';
  const currentPageSlug = opts.currentPageSlug ? String(opts.currentPageSlug).trim() : '';
  const limit = Math.max(1, Math.min(8, parseInt(opts.limit, 10) || 5));
  const siteDatabase = opts.siteDatabase;
  const extraPagesRepo = opts.extraPagesRepo;
  if (!siteDatabase || !extraPagesRepo) return [];

  if (siteDatabase.isSiteSqlite()) {
    return searchSiteKnowledgeFts(opts);
  }

  return searchSiteKnowledgeFallback(opts);
}

function buildFtsQuery(keywords) {
  return (Array.isArray(keywords) ? keywords : [])
    .map((kw) => String(kw || '').trim())
    .filter(Boolean)
    .map((kw) => {
      const safe = kw.replace(/["']/g, ' ').trim();
      if (!safe) return '';
      if (/^[a-z0-9_-]{2,}$/i.test(safe)) return safe + '*';
      return '"' + safe + '"';
    })
    .filter(Boolean)
    .join(' OR ');
}

async function ensureFtsIndex(opts) {
  const siteDatabase = opts.siteDatabase;
  const extraPagesRepo = opts.extraPagesRepo;
  const epoch = Number.isFinite(Number(opts.contentEpoch)) ? Number(opts.contentEpoch) : 0;
  if (builtFtsEpoch === epoch) return;
  const db = siteDatabase.getDb();
  const rows = [];
  siteDatabase.listMainDocuments().forEach((doc) => {
    const docSlug = String((doc && doc.slug) || '').trim();
    const docTitle = String((doc && doc.title) || docSlug).trim();
    siteDatabase.listSectionsForSlug(docSlug).forEach((section) => {
      const title = String(section.title || '').trim();
      const plain = normalizeSearchText(String(section.content || ''));
      rows.push({
        title,
        body: plain,
        sourceLabel: docTitle + ' / ' + title,
        kind: 'section',
        docSlug,
        pageSlug: '',
        url: docSlug === siteDatabase.getDefaultMainDocSlug() ? '/docs' : '/docs?doc=' + encodeURIComponent(docSlug),
        securityLevel: normalizeLevel(section.securityLevel),
      });
    });
  });

  const store = await extraPagesRepo.readStore();
  (store.pages || []).forEach((page) => {
    if (!extraPagesStore.isPublishedForPublic(page)) return;
    const enriched = extraPagesStore.enrichPage(page);
    rows.push({
      title: String(enriched.title || '').trim(),
      body: pageBodyPlain(enriched),
      sourceLabel: '扩展页 / ' + String(enriched.title || enriched.slug || '').trim(),
      kind: 'page',
      docSlug: '',
      pageSlug: String(enriched.slug || '').trim(),
      url: '/page/' + encodeURIComponent(enriched.slug),
      securityLevel: normalizeLevel(enriched.securityLevel || 'public'),
    });
  });

  const insert = db.prepare(
    `INSERT INTO ai_search_index
     (title, body, source_label, kind, doc_slug, page_slug, url, security_level)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const tx = db.transaction((items) => {
    db.prepare('DELETE FROM ai_search_index').run();
    items.forEach((item) => {
      insert.run(
        item.title,
        item.body,
        item.sourceLabel,
        item.kind,
        item.docSlug,
        item.pageSlug,
        item.url,
        item.securityLevel
      );
    });
  });
  tx(rows);
  builtFtsEpoch = epoch;
}

async function searchSiteKnowledgeFts(opts) {
  const query = String(opts.query || '').trim().toLowerCase();
  const keywords = query.split(/\s+/).filter(Boolean).slice(0, 8);
  const ftsQuery = buildFtsQuery(keywords);
  if (!ftsQuery) return [];
  await ensureFtsIndex(opts);
  const siteDatabase = opts.siteDatabase;
  const db = siteDatabase.getDb();
  const clearance = opts.clearance || 'guest';
  const currentDocSlug = opts.currentDocSlug ? String(opts.currentDocSlug).trim() : '';
  const currentPageSlug = opts.currentPageSlug ? String(opts.currentPageSlug).trim() : '';
  const limit = Math.max(1, Math.min(8, parseInt(opts.limit, 10) || 5));
  const sql =
    `SELECT rowid, title, body, source_label, kind, doc_slug, page_slug, url, security_level, ` +
    `snippet(ai_search_index, 1, '', '', ' ... ', 18) AS snippet, bm25(ai_search_index, 10.0, 1.0, 2.0) AS rank ` +
    `FROM ai_search_index WHERE ai_search_index MATCH ? ORDER BY rank LIMIT ?`;
  const raw = db.prepare(sql).all(ftsQuery, Math.max(limit * 4, 20));
  const rows = raw
    .filter((row) => canReadContent(clearance, row.security_level || 'public'))
    .map((row) => {
      let score = Number(row.rank) || 0;
      if (row.doc_slug && currentDocSlug && row.doc_slug === currentDocSlug) score -= 2;
      if (row.page_slug && currentPageSlug && row.page_slug === currentPageSlug) score -= 2;
      return {
        kind: row.kind,
        title: row.title,
        docSlug: row.doc_slug,
        pageSlug: row.page_slug,
        url: row.url,
        snippet: String(row.snippet || '').trim() || snippetFromText(row.body, keywords),
        score,
        sourceLabel: row.source_label,
      };
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, limit);
  return rows;
}

async function searchSiteKnowledgeFallback(opts) {
  const query = String(opts.query || '').trim().toLowerCase();
  const keywords = query.split(/\s+/).filter(Boolean).slice(0, 8);
  const clearance = opts.clearance || 'guest';
  const currentDocSlug = opts.currentDocSlug ? String(opts.currentDocSlug).trim() : '';
  const currentPageSlug = opts.currentPageSlug ? String(opts.currentPageSlug).trim() : '';
  const limit = Math.max(1, Math.min(8, parseInt(opts.limit, 10) || 5));
  const siteDatabase = opts.siteDatabase;
  const extraPagesRepo = opts.extraPagesRepo;

  const rows = [];
  const docs = siteDatabase.listMainDocuments();
  docs.forEach((doc) => {
    const docSlug = String((doc && doc.slug) || '').trim();
    if (!docSlug) return;
    const docTitle = String((doc && doc.title) || docSlug).trim();
    const sections = siteDatabase.listSectionsForSlug(docSlug);
    sections.forEach((section) => {
      const level = normalizeLevel(section.securityLevel);
      if (!canReadContent(clearance, level)) return;
      const title = String(section.title || '').trim();
      const plain = normalizeSearchText(String(section.content || ''));
      const titleLower = title.toLowerCase();
      let score = scoreAgainstKeywords(plain.toLowerCase(), titleLower, keywords);
      if (docSlug && currentDocSlug && docSlug === currentDocSlug) score += 8;
      if (titleLower && currentPageSlug && titleLower.includes(currentPageSlug.toLowerCase())) score += 2;
      if (score <= 0) return;
      rows.push({
        kind: 'section',
        title,
        docSlug,
        url: docSlug === siteDatabase.getDefaultMainDocSlug() ? '/docs' : '/docs?doc=' + encodeURIComponent(docSlug),
        snippet: snippetFromText(plain, keywords),
        score,
        sourceLabel: docTitle + ' / ' + title,
      });
    });
  });

  const store = await extraPagesRepo.readStore();
  (store.pages || []).forEach((page) => {
    if (!extraPagesStore.isPublishedForPublic(page)) return;
    const enriched = extraPagesStore.enrichPage(page);
    const level = normalizeLevel(enriched.securityLevel || 'public');
    if (!canReadContent(clearance, level)) return;
    const title = String(enriched.title || '').trim();
    const text = extraPageSearchableText(enriched);
    let score = scoreAgainstKeywords(text, title.toLowerCase(), keywords);
    if (currentPageSlug && enriched.slug === currentPageSlug) score += 8;
    if (score <= 0) return;
    rows.push({
      kind: 'page',
      title,
      docSlug: '',
      pageSlug: enriched.slug,
      url: '/page/' + encodeURIComponent(enriched.slug),
      snippet: snippetFromText(pageBodyPlain(enriched), keywords),
      score,
      sourceLabel: '扩展页 / ' + title,
    });
  });

  return rows.sort((a, b) => b.score - a.score).slice(0, limit);
}

module.exports = {
  searchSiteKnowledge,
};
