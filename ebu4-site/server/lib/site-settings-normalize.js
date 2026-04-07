/**
 * 站点设置合并默认值（供 index 与单测共用）
 */
function normalizeSiteSettings(j) {
  const baseMaint = { enabled: false, message: '', fullSite: false };
  const baseReg = { mode: 'invitation' };
  const baseRedis = { enabled: false, url: '' };
  const baseUpgrade = {
    enabled: false,
    baseUrl: '',
    manifestPath: '/upgrade/manifest.json',
    bearerToken: '',
    insecureTls: false,
    checkChannels: 'both',
    autoUpdate: {
      enabled: false,
      intervalMinutes: 60,
      applyDocs: false,
      applySystem: false,
      quietHours: null,
    },
  };
  const baseEmbed = { aiChatHtml: '' };
  const MAX_EMBED = 200000;
  if (!j || typeof j !== 'object') {
    return {
      maintenance: { ...baseMaint },
      registration: { ...baseReg },
      redis: { ...baseRedis },
      upgrade: { ...baseUpgrade, autoUpdate: { ...baseUpgrade.autoUpdate } },
      embed: { ...baseEmbed },
    };
  }
  const mode = j.registration && j.registration.mode === 'open' ? 'open' : 'invitation';
  const r = j.redis && typeof j.redis === 'object' ? j.redis : {};
  const u = j.upgrade && typeof j.upgrade === 'object' ? j.upgrade : {};
  const au = u.autoUpdate && typeof u.autoUpdate === 'object' ? u.autoUpdate : {};
  const ch = u.checkChannels === 'system' || u.checkChannels === 'docs' ? u.checkChannels : 'both';
  const quiet =
    au.quietHours && typeof au.quietHours === 'object'
      ? {
          start: au.quietHours.start != null ? String(au.quietHours.start).trim() : '',
          end: au.quietHours.end != null ? String(au.quietHours.end).trim() : '',
        }
      : null;
  const em = j.embed && typeof j.embed === 'object' ? j.embed : {};
  const aiChatHtml =
    em.aiChatHtml != null ? String(em.aiChatHtml).slice(0, MAX_EMBED) : '';
  return Object.assign({}, j, {
    maintenance: Object.assign({}, baseMaint, j.maintenance || {}),
    registration: { mode },
    redis: {
      enabled: !!r.enabled,
      url: r.url != null ? String(r.url).trim() : '',
    },
    upgrade: {
      enabled: !!u.enabled,
      baseUrl: u.baseUrl != null ? String(u.baseUrl).trim().replace(/\/+$/, '') : '',
      manifestPath:
        u.manifestPath != null && String(u.manifestPath).trim()
          ? String(u.manifestPath).trim()
          : '/upgrade/manifest.json',
      bearerToken: u.bearerToken != null ? String(u.bearerToken) : '',
      insecureTls: u.insecureTls === true,
      checkChannels: ch,
      autoUpdate: {
        enabled: au.enabled === true,
        intervalMinutes: Math.max(
          5,
          Math.min(24 * 60, parseInt(String(au.intervalMinutes != null ? au.intervalMinutes : 60), 10) || 60)
        ),
        applyDocs: au.applyDocs === true,
        applySystem: au.applySystem === true,
        quietHours: quiet && (quiet.start || quiet.end) ? quiet : null,
      },
    },
    embed: {
      aiChatHtml,
    },
  });
}

module.exports = { normalizeSiteSettings };
