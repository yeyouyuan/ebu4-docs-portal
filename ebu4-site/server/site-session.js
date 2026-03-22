/**
 * 前台访客会话：默认角色 guest，clearance=guest，可查看 public/guest 等级文档。
 * Cookie: site_session
 */
const crypto = require('crypto');
const { normalizeLevel } = require('./security-levels');

const COOKIE_NAME = 'site_session';
const DEFAULT_CLEARANCE = 'guest';
const TTL_MS = 365 * 24 * 60 * 60 * 1000;

/** @type {Map<string, { exp: number, role: string, clearance: string }>} */
const sessions = new Map();

function prune() {
  const now = Date.now();
  for (const [t, s] of sessions) {
    if (s.exp < now) sessions.delete(t);
  }
}

function getCookie(req, name) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  const parts = raw.split(';');
  for (const p of parts) {
    const s = p.trim();
    const i = s.indexOf('=');
    if (i === -1) continue;
    const k = s.slice(0, i);
    if (k !== name) continue;
    return decodeURIComponent(s.slice(i + 1));
  }
  return null;
}

function shouldUseSecureCookie(req) {
  if (req.secure) return true;
  const xf = req.headers['x-forwarded-proto'];
  if (typeof xf === 'string' && xf.split(',')[0].trim().toLowerCase() === 'https') {
    return true;
  }
  if (process.env.FORCE_SECURE_COOKIE === '1' || process.env.FORCE_SECURE_COOKIE === 'true') {
    return true;
  }
  return false;
}

function setSiteCookie(res, req, token) {
  const maxAgeSec = Math.floor(TTL_MS / 1000);
  const secure = shouldUseSecureCookie(req);
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${maxAgeSec}`,
    'SameSite=Lax',
    'HttpOnly',
  ];
  if (secure) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

function clearSiteCookie(res, req) {
  const secure = shouldUseSecureCookie(req);
  const parts = [`${COOKIE_NAME}=`, 'Path=/', 'Max-Age=0', 'SameSite=Lax', 'HttpOnly'];
  if (secure) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

/**
 * 确保存在前台会话；无 Cookie 时创建 guest 并下发 Set-Cookie。
 * 设置 req.siteSessionToken、req.siteClearance、req.siteRole
 */
function ensureSiteGuest(req, res) {
  prune();
  let token = getCookie(req, COOKIE_NAME);
  let sess = token ? sessions.get(token) : null;
  if (!token || !sess || sess.exp < Date.now()) {
    if (token) sessions.delete(token);
    token = crypto.randomBytes(24).toString('hex');
    sess = {
      exp: Date.now() + TTL_MS,
      role: 'guest',
      clearance: DEFAULT_CLEARANCE,
    };
    sessions.set(token, sess);
    setSiteCookie(res, req, token);
  }
  req.siteSessionToken = token;
  req.siteClearance = normalizeLevel(sess.clearance);
  req.siteRole = sess.role || 'guest';
  return sess;
}

function getSiteSessionCount() {
  prune();
  return sessions.size;
}

function destroySiteSession(token) {
  if (token) sessions.delete(token);
}

module.exports = {
  COOKIE_NAME,
  ensureSiteGuest,
  getSiteSessionCount,
  destroySiteSession,
  clearSiteCookie,
  getCookie,
};
