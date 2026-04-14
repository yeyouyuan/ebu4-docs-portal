/**
 * 站点设置合并默认值（供 index 与单测共用）
 */
function normalizeSiteSettings(j) {
  const baseMaint = { enabled: false, message: '', fullSite: false };
  const baseHomepage = { enabled: true };
  const baseBranding = {
    common: {
      logoMark: 'E9',
      brandTitle: 'EBU4 文档站',
      brandSub: '企业级技术支持门户',
      versionText: 'v3.0',
    },
    site: {
      title: '',
      faviconUrl: '/icons/icon.svg',
    },
    adminSidebar: {
      logoMark: 'E9',
      logoTitle: 'EBU4 文档站',
      logoSub: '内容管理',
    },
    adminNavbar: {
      logoPrefix: 'EBU4',
      logoHighlight: '技术支持',
    },
    landingNav: {
      logoText: 'E9',
      brandTitle: '泛微 E9 开发文档',
      verBadge: 'v3.0',
      brandSub: '企业级技术支持门户',
    },
  };
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
      homepage: { ...baseHomepage },
      branding: JSON.parse(JSON.stringify(baseBranding)),
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
  const br = j.branding && typeof j.branding === 'object' ? j.branding : {};
  const brCommon = br.common && typeof br.common === 'object' ? br.common : {};
  const brSite = br.site && typeof br.site === 'object' ? br.site : {};
  const brSide = br.adminSidebar && typeof br.adminSidebar === 'object' ? br.adminSidebar : {};
  const brNav = br.adminNavbar && typeof br.adminNavbar === 'object' ? br.adminNavbar : {};
  const brLanding = br.landingNav && typeof br.landingNav === 'object' ? br.landingNav : {};
  const commonLogoMark = brCommon.logoMark != null ? String(brCommon.logoMark).trim().slice(0, 40) : '';
  const commonBrandTitle = brCommon.brandTitle != null ? String(brCommon.brandTitle).trim().slice(0, 120) : '';
  const commonBrandSub = brCommon.brandSub != null ? String(brCommon.brandSub).trim().slice(0, 120) : '';
  const commonVersion = brCommon.versionText != null ? String(brCommon.versionText).trim().slice(0, 40) : '';
  const normalizedCommon = {
    logoMark: commonLogoMark || (brSide.logoMark != null ? String(brSide.logoMark).trim().slice(0, 40) : baseBranding.common.logoMark),
    brandTitle:
      commonBrandTitle ||
      (brLanding.brandTitle != null
        ? String(brLanding.brandTitle).trim().slice(0, 120)
        : brSide.logoTitle != null
          ? String(brSide.logoTitle).trim().slice(0, 120)
          : baseBranding.common.brandTitle),
    brandSub:
      commonBrandSub ||
      (brLanding.brandSub != null
        ? String(brLanding.brandSub).trim().slice(0, 120)
        : brSide.logoSub != null
          ? String(brSide.logoSub).trim().slice(0, 120)
          : baseBranding.common.brandSub),
    versionText:
      commonVersion ||
      (brLanding.verBadge != null
        ? String(brLanding.verBadge).trim().slice(0, 40)
        : baseBranding.common.versionText),
  };
  return Object.assign({}, j, {
    maintenance: Object.assign({}, baseMaint, j.maintenance || {}),
    homepage: Object.assign({}, baseHomepage, j.homepage || {}),
    branding: {
      common: normalizedCommon,
      site: {
        title: brSite.title != null ? String(brSite.title).slice(0, 200) : '',
        faviconUrl:
          brSite.faviconUrl != null && String(brSite.faviconUrl).trim()
            ? String(brSite.faviconUrl).trim().slice(0, 500)
            : '/icons/icon.svg',
      },
      adminSidebar: {
        logoMark:
          brSide.logoMark != null
            ? String(brSide.logoMark).trim().slice(0, 40)
            : normalizedCommon.logoMark,
        logoTitle:
          brSide.logoTitle != null
            ? String(brSide.logoTitle).trim().slice(0, 120)
            : normalizedCommon.brandTitle,
        logoSub:
          brSide.logoSub != null
            ? String(brSide.logoSub).trim().slice(0, 120)
            : normalizedCommon.brandSub,
      },
      adminNavbar: {
        logoPrefix:
          brNav.logoPrefix != null
            ? String(brNav.logoPrefix).trim().slice(0, 80)
            : baseBranding.adminNavbar.logoPrefix,
        logoHighlight:
          brNav.logoHighlight != null
            ? String(brNav.logoHighlight).trim().slice(0, 80)
            : baseBranding.adminNavbar.logoHighlight,
      },
      landingNav: {
        logoText:
          brLanding.logoText != null
            ? String(brLanding.logoText).trim().slice(0, 40)
            : normalizedCommon.logoMark,
        brandTitle:
          brLanding.brandTitle != null
            ? String(brLanding.brandTitle).trim().slice(0, 120)
            : normalizedCommon.brandTitle,
        verBadge:
          brLanding.verBadge != null
            ? String(brLanding.verBadge).trim().slice(0, 40)
            : normalizedCommon.versionText,
        brandSub:
          brLanding.brandSub != null
            ? String(brLanding.brandSub).trim().slice(0, 120)
            : normalizedCommon.brandSub,
      },
    },
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
