/**
 * 读取 /data/seo.json，写入 title / meta / OG / Twitter / canonical（按页面 docs | landing）
 */
function ensureMetaByName(name, content) {
  if (content == null || content === '') return;
  var sel = 'meta[name="' + name.replace(/"/g, '\\"') + '"]';
  var el = document.head.querySelector(sel);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function ensureMetaByProperty(property, content) {
  if (content == null || content === '') return;
  var sel = 'meta[property="' + property.replace(/"/g, '\\"') + '"]';
  var el = document.head.querySelector(sel);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('property', property);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function ensureCanonical(href) {
  if (!href) return;
  var el = document.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function ensureJsonLd(id, payload) {
  if (!id || !payload) return;
  var el = document.getElementById(id);
  if (!el) {
    el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(payload);
}

function absolutize(base, pathOrUrl) {
  if (!pathOrUrl) return '';
  var s = String(pathOrUrl).trim();
  if (/^https?:\/\//i.test(s)) return s;
  var b = base.replace(/\/$/, '');
  return b + (s.startsWith('/') ? s : '/' + s);
}

function buildPageUrl(base, page) {
  if (page === 'landing') return base + '/index';
  var url = base + '/docs';
  try {
    var loc = new URL(location.href);
    var doc = loc.searchParams.get('doc');
    if (doc) url += '?doc=' + encodeURIComponent(doc);
  } catch (_) {}
  return url;
}

function applySeo(cfg, page) {
  if (!cfg || typeof cfg !== 'object') return;
  var section = page === 'landing' ? cfg.landing : cfg.docs;
  if (!section || typeof section !== 'object') return;

  var rawBase = (cfg.canonicalBase && String(cfg.canonicalBase).trim()) || '';
  var base = rawBase.replace(/\/$/, '') || (typeof location !== 'undefined' ? location.origin : '');
  var pageUrl = buildPageUrl(base, page);
  var ver = cfg.verification || {};

  if (section.title) document.title = section.title;
  if (section.description) ensureMetaByName('description', section.description);
  if (section.keywords) ensureMetaByName('keywords', section.keywords);
  if (section.robots) ensureMetaByName('robots', section.robots);

  ensureMetaByProperty('og:type', 'website');
  ensureMetaByProperty('og:title', section.title || document.title);
  if (section.description) ensureMetaByProperty('og:description', section.description);
  ensureMetaByProperty('og:url', pageUrl);
  ensureMetaByProperty('og:locale', 'zh_CN');

  if (section.ogImage) {
    ensureMetaByProperty('og:image', absolutize(base, section.ogImage));
  }
  if (cfg.siteName) {
    ensureMetaByProperty('og:site_name', cfg.siteName);
  }

  var twCard = section.twitterCard || 'summary_large_image';
  ensureMetaByName('twitter:card', twCard);
  ensureMetaByName('twitter:title', section.title || document.title);
  if (section.description) ensureMetaByName('twitter:description', section.description);
  if (section.ogImage) {
    ensureMetaByName('twitter:image', absolutize(base, section.ogImage));
  }

  ensureCanonical(pageUrl);
  if (ver.googleSiteVerification) {
    ensureMetaByName('google-site-verification', ver.googleSiteVerification);
  }
  if (ver.bingSiteVerification) {
    ensureMetaByName('msvalidate.01', ver.bingSiteVerification);
  }
  if (ver.baiduSiteVerification) {
    ensureMetaByName('baidu-site-verification', ver.baiduSiteVerification);
  }

  var sameAs =
    cfg.structuredData && Array.isArray(cfg.structuredData.sameAs)
      ? cfg.structuredData.sameAs.filter(Boolean)
      : [];
  var orgName =
    (cfg.structuredData && cfg.structuredData.organizationName) ||
    cfg.siteName ||
    section.title ||
    document.title;
  var orgLogo = absolutize(
    base,
    (cfg.structuredData && cfg.structuredData.organizationLogo) || section.ogImage || '/icons/icon.svg'
  );
  ensureJsonLd('ebu4-seo-jsonld', {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: orgName,
        url: base,
        logo: orgLogo,
        sameAs: sameAs,
      },
      {
        '@type': 'WebSite',
        name: cfg.siteName || orgName,
        url: base,
        inLanguage: 'zh-CN',
      },
      {
        '@type': 'WebPage',
        name: section.title || document.title,
        url: pageUrl,
        description: section.description || undefined,
        inLanguage: 'zh-CN',
      },
    ],
  });
}

async function loadSeoConfig(page) {
  try {
    var r = await fetch('/data/seo.json', { credentials: 'same-origin', cache: 'no-cache' });
    if (!r.ok) return;
    var cfg = await r.json();
    applySeo(cfg, page);
  } catch (e) {
    console.warn('[seo-config]', e);
  }
}

if (typeof window !== 'undefined') {
  window.loadSeoConfig = loadSeoConfig;
  window.applySeo = applySeo;
}
