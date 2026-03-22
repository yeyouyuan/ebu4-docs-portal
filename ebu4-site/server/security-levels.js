/**
 * 内容安全等级：序号越大，所需访客/用户 clearance 越高。
 * public < guest < internal < important < core < restricted
 */
const ORDER = ['public', 'guest', 'internal', 'important', 'core', 'restricted'];

function normalizeLevel(raw) {
  const s = String(raw || 'public').toLowerCase();
  return ORDER.includes(s) ? s : 'public';
}

function rank(level) {
  const n = ORDER.indexOf(normalizeLevel(level));
  return n >= 0 ? n : 0;
}

/** 用户 clearance 能否阅读该安全等级的内容（clearance 等级需 ≥ 内容要求） */
function canReadContent(userClearance, contentRequired) {
  return rank(userClearance) >= rank(contentRequired);
}

module.exports = {
  ORDER,
  normalizeLevel,
  rank,
  canReadContent,
};
