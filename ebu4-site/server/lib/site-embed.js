/**
 * 将站点配置的第三方脚本（如右下角 AI 询问）注入到 HTML 的 </body> 前。
 */

const MAX_EMBED_LEN = 200000;

/**
 * 原 docs.html 内嵌示例（迁移时若 embed 为空则写入 site_settings）
 */
const DEFAULT_EMBED_AI_HTML =
  '<script async defer src="http://fnos.jiansmart.com:8088/chat/api/embed?protocol=http&amp;host=fnos.jiansmart.com:8088&amp;token=898756846c53cd97"></script>';

/**
 * @param {string} html
 * @param {string} fragment
 * @returns {string}
 */
function injectBeforeBodyClose(html, fragment) {
  const f = fragment != null ? String(fragment) : '';
  if (!f.trim()) return html;
  const marker = '<!-- EBU4_EMBED_AI_SLOT -->';
  if (html.includes(marker)) {
    return html.split(marker).join(f + '\n' + marker);
  }
  const lower = html.toLowerCase();
  const idx = lower.lastIndexOf('</body>');
  if (idx === -1) return html + '\n' + f;
  return html.slice(0, idx) + '\n' + f + '\n' + html.slice(idx);
}

function clampEmbedFragment(s) {
  if (s == null) return '';
  return String(s).slice(0, MAX_EMBED_LEN);
}

module.exports = {
  injectBeforeBodyClose,
  clampEmbedFragment,
  MAX_EMBED_LEN,
  DEFAULT_EMBED_AI_HTML,
};
