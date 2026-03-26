const crypto = require('crypto');
const extraPagesStore = require('../extra-pages-store');
const { normalizeLinkUrl } = extraPagesStore;
const { normalizeLevel } = require('../security-levels');

function normalizeFormat(v) {
  if (v === 'richtext' || v === 'html') return v;
  return 'markdown';
}

/**
 * 扩展页创建/更新/删除的领域逻辑（不含 HTTP 与审计）。
 */

function createPage(body, store) {
  const b = body || {};
  const title = typeof b.title === 'string' ? b.title.trim() : '新页面';
  const format = normalizeFormat(b.format);
  const bodyText = typeof b.body === 'string' ? b.body : '';
  let slug = extraPagesStore.normalizeSlugInput(b.slug);
  if (!slug) slug = extraPagesStore.makeUniqueSlug('page', store.pages, null);
  else slug = extraPagesStore.makeUniqueSlug(slug, store.pages, null);
  const excerpt = typeof b.excerpt === 'string' ? b.excerpt.trim() : '';
  const cover = typeof b.cover === 'string' ? b.cover.trim() : '';
  const author = typeof b.author === 'string' ? b.author.trim() : '';
  const tags = extraPagesStore.parseTagsInput(b.tags);
  const status = b.status === 'draft' ? 'draft' : 'published';
  let publishedAt =
    typeof b.publishedAt === 'string' && b.publishedAt.trim()
      ? b.publishedAt.trim()
      : null;
  if (status === 'published' && !publishedAt) {
    publishedAt = new Date().toISOString();
  }
  if (status === 'draft') {
    publishedAt = publishedAt || null;
  }
  const page = {
    id: crypto.randomBytes(16).toString('hex'),
    title: title || '新页面',
    slug,
    format,
    body: bodyText,
    linkUrl: normalizeLinkUrl(b.linkUrl),
    excerpt,
    cover,
    tags,
    author,
    status,
    publishedAt,
    securityLevel: normalizeLevel(b.securityLevel),
    updatedAt: new Date().toISOString(),
  };
  return { page };
}

/**
 * @returns {{ ok: true, page: object } | { ok: false, status: number, error: string }}
 */
function updatePage(id, body, store) {
  const idx = store.pages.findIndex((p) => p.id === id);
  if (idx === -1) return { ok: false, status: 404, error: '页面不存在' };
  const cur = Object.assign({}, store.pages[idx]);
  const b = body || {};
  if (typeof b.title === 'string') cur.title = b.title.trim() || cur.title;
  if (typeof b.body === 'string') cur.body = b.body;
  if (b.format === 'richtext' || b.format === 'markdown' || b.format === 'html') {
    cur.format = normalizeFormat(b.format);
  }
  if (typeof b.excerpt === 'string') cur.excerpt = b.excerpt.trim();
  if (typeof b.cover === 'string') cur.cover = b.cover.trim();
  if (typeof b.author === 'string') cur.author = b.author.trim();
  if (b.tags !== undefined) cur.tags = extraPagesStore.parseTagsInput(b.tags);
  if (b.status === 'draft' || b.status === 'published') cur.status = b.status;
  if (typeof b.publishedAt === 'string' && b.publishedAt.trim()) {
    cur.publishedAt = b.publishedAt.trim();
  } else if (b.publishedAt === null || b.publishedAt === '') {
    cur.publishedAt = null;
  }
  if (cur.status === 'published' && !cur.publishedAt) {
    cur.publishedAt = new Date().toISOString();
  }
  if (typeof b.slug === 'string') {
    const s = extraPagesStore.normalizeSlugInput(b.slug);
    if (!s) {
      return { ok: false, status: 400, error: 'slug 仅允许英文小写与数字' };
    }
    cur.slug = extraPagesStore.makeUniqueSlug(s, store.pages, id);
  }
  if (b.securityLevel !== undefined) {
    cur.securityLevel = normalizeLevel(b.securityLevel);
  }
  if (b.linkUrl !== undefined) {
    cur.linkUrl = normalizeLinkUrl(b.linkUrl);
  }
  cur.updatedAt = new Date().toISOString();
  store.pages[idx] = cur;
  return { ok: true, page: cur };
}

/**
 * @returns {{ ok: true, store: { pages: [] } } | { ok: false, status: number, error: string }}
 */
function deletePage(id, store) {
  const next = store.pages.filter((p) => p.id !== id);
  if (next.length === store.pages.length) {
    return { ok: false, status: 404, error: '页面不存在' };
  }
  return { ok: true, store: { pages: next } };
}

module.exports = {
  createPage,
  updatePage,
  deletePage,
};
