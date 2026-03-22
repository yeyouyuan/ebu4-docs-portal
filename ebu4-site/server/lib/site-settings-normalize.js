/**
 * 站点设置合并默认值（供 index 与单测共用）
 */
function normalizeSiteSettings(j) {
  const baseMaint = { enabled: false, message: '', fullSite: false };
  const baseReg = { mode: 'invitation' };
  const baseRedis = { enabled: false, url: '' };
  if (!j || typeof j !== 'object') {
    return {
      maintenance: { ...baseMaint },
      registration: { ...baseReg },
      redis: { ...baseRedis },
    };
  }
  const mode = j.registration && j.registration.mode === 'open' ? 'open' : 'invitation';
  const r = j.redis && typeof j.redis === 'object' ? j.redis : {};
  return Object.assign({}, j, {
    maintenance: Object.assign({}, baseMaint, j.maintenance || {}),
    registration: { mode },
    redis: {
      enabled: !!r.enabled,
      url: r.url != null ? String(r.url).trim() : '',
    },
  });
}

module.exports = { normalizeSiteSettings };
