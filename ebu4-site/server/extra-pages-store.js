const fs = require('fs');
const path = require('path');
const { normalizeLevel } = require('./security-levels');

function normalizeSlugInput(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function makeUniqueSlug(base, pages, excludeId) {
  let slug = base || 'page';
  if (!slug) slug = 'page';
  let n = 0;
  let candidate = slug;
  while (pages.some((p) => p.slug === candidate && p.id !== excludeId)) {
    n += 1;
    candidate = `${slug}-${n}`;
  }
  return candidate;
}

function readStore(extraPagesPath) {
  if (!extraPagesPath || !fs.existsSync(extraPagesPath)) return { pages: [] };
  try {
    const raw = fs.readFileSync(extraPagesPath, 'utf-8');
    const j = JSON.parse(raw);
    const pages = Array.isArray(j.pages) ? j.pages : [];
    return { pages };
  } catch (_) {
    return { pages: [] };
  }
}

function writeStore(extraPagesPath, store, backupWithPrune, backupKeepCount) {
  if (!extraPagesPath) return;
  const dir = path.dirname(extraPagesPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(extraPagesPath)) {
    backupWithPrune(extraPagesPath, backupKeepCount);
  }
  fs.writeFileSync(extraPagesPath, JSON.stringify(store, null, 2), 'utf-8');
}

function parseTagsInput(v) {
  if (Array.isArray(v)) {
    return v
      .map((s) => String(s).trim())
      .filter(Boolean)
      .slice(0, 30);
  }
  if (typeof v === 'string') {
    return v
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 30);
  }
  return [];
}

/** 补齐博客字段（兼容旧数据） */
function enrichPage(p) {
  if (!p || typeof p !== 'object') return null;
  const o = Object.assign({}, p);
  if (o.excerpt == null) o.excerpt = '';
  if (o.cover == null) o.cover = '';
  if (!Array.isArray(o.tags)) o.tags = parseTagsInput(o.tags);
  if (o.author == null) o.author = '';
  if (o.status !== 'draft' && o.status !== 'published') o.status = 'published';
  if (o.status === 'draft') {
    o.publishedAt = o.publishedAt || null;
  } else if (!o.publishedAt) {
    o.publishedAt = o.updatedAt || new Date().toISOString();
  }
  const sl = o.securityLevel != null ? o.securityLevel : o.security_level;
  o.securityLevel = normalizeLevel(sl);
  return o;
}

function isPublishedForPublic(p) {
  const e = enrichPage(p);
  return e && e.status === 'published';
}

module.exports = {
  normalizeSlugInput,
  makeUniqueSlug,
  readStore,
  writeStore,
  parseTagsInput,
  enrichPage,
  isPublishedForPublic,
};
