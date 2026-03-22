/**
 * 将扩展页正文转为可检索纯文本（Markdown 轻量去标记 + 富文本去 HTML）
 */
function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function normalizeSearchText(s) {
  return String(s || '')
    .replace(/[#*`\[\]()]/g, ' ')
    .toLowerCase();
}

/**
 * @param {{ format?: string, body?: string, excerpt?: string, title?: string }} page enrich 后的页
 */
function extraPageSearchableText(page) {
  const title = normalizeSearchText(page.title || '');
  const excerpt = normalizeSearchText(page.excerpt || '');
  const rawBody = page.body != null ? String(page.body) : '';
  const bodyPlain =
    page.format === 'richtext'
      ? normalizeSearchText(stripHtml(rawBody))
      : normalizeSearchText(rawBody);
  return `${title} ${excerpt} ${bodyPlain}`.trim();
}

module.exports = { extraPageSearchableText, stripHtml, normalizeSearchText };
