/**
 * 管理后台 API 响应脱敏：站点设置中的连接串、Token 等不下发明文。
 */

/**
 * 将 redis://[:password@]host 等中的 password 段替换为 ***
 * @param {string} url
 * @returns {string}
 */
function maskRedisUrl(url) {
  if (url == null || !String(url).trim()) return '';
  const s = String(url).trim();
  try {
    const u = new URL(s);
    if (u.password) u.password = '***';
    if (u.username && /^(auth|default)$/i.test(u.username) === false) {
      /* redis ACL 用户名可保留；密码已清 */
    }
    return u.toString();
  } catch (_) {
    return s.replace(/:([^:@/]+)@/, ':***@');
  }
}

/**
 * 布尔：是否已配置非空 Redis URL（不下发明文）
 */
function hasRedisUrl(url) {
  return !!(url != null && String(url).trim());
}

/**
 * 布尔：是否已配置非空 Bearer
 */
function hasBearerToken(tok) {
  return !!(tok != null && String(tok).trim());
}

/**
 * 站点设置 GET 响应：移除 redis.url、upgrade.bearerToken 明文，改为占位与标志位。
 * @param {object} normalized normalizeSiteSettings 的结果
 * @returns {object}
 */
function sanitizeSiteSettingsForAdminGet(normalized) {
  if (!normalized || typeof normalized !== 'object') return normalized;
  const out = JSON.parse(JSON.stringify(normalized));
  if (out.redis && typeof out.redis === 'object') {
    const rawUrl = out.redis.url;
    out.redisUrlConfigured = hasRedisUrl(rawUrl);
    out.redisUrlPreview = hasRedisUrl(rawUrl) ? maskRedisUrl(rawUrl) : '';
    out.redis.url = '';
  }
  if (out.upgrade && typeof out.upgrade === 'object') {
    const rawBt = out.upgrade.bearerToken;
    out.upgradeBearerConfigured = hasBearerToken(rawBt);
    out.upgrade.bearerToken = '';
  }
  return out;
}

/**
 * 审计日志单条 detail 递归脱敏（键名含 password、token、secret、authorization 等）
 * @param {*} v
 * @returns {*}
 */
function sanitizeAuditDetail(v) {
  if (v == null) return v;
  if (Array.isArray(v)) return v.map((x) => sanitizeAuditDetail(x));
  if (typeof v !== 'object') return v;
  const SENSITIVE_KEYS =
    /^(password|passwd|pwd|secret|token|authorization|cookie|setCookie|redisUrl|bearer|apiKey|api_key)$/i;
  const out = {};
  for (const k of Object.keys(v)) {
    if (SENSITIVE_KEYS.test(k)) {
      const x = v[k];
      out[k] =
        x != null && String(x).trim()
          ? '***（已脱敏）'
          : x;
      continue;
    }
    if (k === 'url' && typeof v[k] === 'string' && /^redis(s)?:\/\//i.test(v[k])) {
      out[k] = maskRedisUrl(v[k]);
      continue;
    }
    out[k] = sanitizeAuditDetail(v[k]);
  }
  return out;
}

function sanitizeAuditEntries(entries) {
  if (!Array.isArray(entries)) return entries;
  return entries.map((e) => {
    if (!e || typeof e !== 'object') return e;
    const copy = Object.assign({}, e);
    if (copy.detail != null) copy.detail = sanitizeAuditDetail(copy.detail);
    return copy;
  });
}

module.exports = {
  maskRedisUrl,
  hasRedisUrl,
  hasBearerToken,
  sanitizeSiteSettingsForAdminGet,
  sanitizeAuditEntries,
  sanitizeAuditDetail,
};
