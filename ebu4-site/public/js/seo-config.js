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

function absolutize(base, pathOrUrl) {
  if (!pathOrUrl) return '';
  var s = String(pathOrUrl).trim();
  if (/^https?:\/\//i.test(s)) return s;
  var b = base.replace(/\/$/, '');
  return b + (s.startsWith('/') ? s : '/' + s);
}

function applySeo(cfg, page) {
  if (!cfg || typeof cfg !== 'object') return;
  var section = page === 'landing' ? cfg.landing : cfg.docs;
  if (!section || typeof section !== 'object') return;

  var rawBase = (cfg.canonicalBase && String(cfg.canonicalBase).trim()) || '';
  var base = rawBase.replace(/\/$/, '') || (typeof location !== 'undefined' ? location.origin : '');
  var path = page === 'landing' ? '/index' : '/docs';
  var pageUrl = base + path;

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

  var twCard = section.twitterCard || 'summary_large_image';
  ensureMetaByName('twitter:card', twCard);
  ensureMetaByName('twitter:title', section.title || document.title);
  if (section.description) ensureMetaByName('twitter:description', section.description);
  if (section.ogImage) {
    ensureMetaByName('twitter:image', absolutize(base, section.ogImage));
  }

  ensureCanonical(pageUrl);
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
