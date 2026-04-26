function normalizeStringArray(value, maxItems, maxLen) {
  const out = [];
  const arr = Array.isArray(value) ? value : [];
  for (const item of arr) {
    const s = item != null ? String(item).trim() : '';
    if (!s) continue;
    out.push(s.slice(0, maxLen || 500));
    if (maxItems && out.length >= maxItems) break;
  }
  return out;
}

function normalizeSeoPage(value) {
  const src = value && typeof value === 'object' ? value : {};
  return {
    title: src.title != null ? String(src.title).trim().slice(0, 200) : '',
    description: src.description != null ? String(src.description).trim().slice(0, 500) : '',
    keywords: src.keywords != null ? String(src.keywords).trim().slice(0, 500) : '',
    ogImage: src.ogImage != null ? String(src.ogImage).trim().slice(0, 500) : '',
    twitterCard:
      src.twitterCard != null && String(src.twitterCard).trim()
        ? String(src.twitterCard).trim().slice(0, 80)
        : 'summary_large_image',
    robots:
      src.robots != null && String(src.robots).trim()
        ? String(src.robots).trim().slice(0, 120)
        : 'index, follow',
  };
}

function normalizeGoogleFileToken(raw) {
  const s = raw != null ? String(raw).trim() : '';
  if (!s) return '';
  if (/^google[a-z0-9_-]+\.html$/i.test(s)) return s;
  return s.replace(/^google/i, '').replace(/\.html$/i, '').trim();
}

function normalizeSeoSubmission(value) {
  const src = value && typeof value === 'object' ? value : {};
  const google = src.google && typeof src.google === 'object' ? src.google : {};
  const bing = src.bing && typeof src.bing === 'object' ? src.bing : {};
  const baidu = src.baidu && typeof src.baidu === 'object' ? src.baidu : {};
  return {
    google: {
      property: google.property != null ? String(google.property).trim().slice(0, 500) : '',
      accessToken:
        google.accessToken != null ? String(google.accessToken).trim().slice(0, 4000) : '',
      submitSitemap: google.submitSitemap !== false,
    },
    bing: {
      siteUrl: bing.siteUrl != null ? String(bing.siteUrl).trim().slice(0, 500) : '',
      apiKey: bing.apiKey != null ? String(bing.apiKey).trim().slice(0, 500) : '',
      submitSitemap: bing.submitSitemap !== false,
      submitUrlBatch: bing.submitUrlBatch !== false,
    },
    baidu: {
      site: baidu.site != null ? String(baidu.site).trim().slice(0, 500) : '',
      token: baidu.token != null ? String(baidu.token).trim().slice(0, 500) : '',
      type: baidu.type != null ? String(baidu.type).trim().slice(0, 80) : '',
    },
  };
}

function normalizeSeoConfig(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const structuredData =
    src.structuredData && typeof src.structuredData === 'object' ? src.structuredData : {};
  const verification =
    src.verification && typeof src.verification === 'object' ? src.verification : {};

  return {
    version: 3,
    canonicalBase:
      src.canonicalBase != null ? String(src.canonicalBase).trim().replace(/\/+$/, '') : '',
    siteName: src.siteName != null ? String(src.siteName).trim().slice(0, 120) : '',
    docs: normalizeSeoPage(src.docs),
    landing: normalizeSeoPage(src.landing),
    robotsTxt: src.robotsTxt != null ? String(src.robotsTxt) : '',
    sitemapAuto: src.sitemapAuto !== false,
    sitemapPaths: normalizeStringArray(src.sitemapPaths, 500, 1000),
    includeExtraPagesInSearch: src.includeExtraPagesInSearch !== false,
    includeExtraPagesInSitemap: src.includeExtraPagesInSitemap !== false,
    structuredData: {
      organizationName:
        structuredData.organizationName != null
          ? String(structuredData.organizationName).trim().slice(0, 200)
          : '',
      organizationLogo:
        structuredData.organizationLogo != null
          ? String(structuredData.organizationLogo).trim().slice(0, 500)
          : '',
      sameAs: normalizeStringArray(structuredData.sameAs, 20, 500),
    },
    verification: {
      googleSiteVerification:
        verification.googleSiteVerification != null
          ? String(verification.googleSiteVerification).trim().slice(0, 200)
          : '',
      googleFileToken: normalizeGoogleFileToken(verification.googleFileToken),
      bingSiteVerification:
        verification.bingSiteVerification != null
          ? String(verification.bingSiteVerification).trim().slice(0, 200)
          : '',
      bingXmlContent:
        verification.bingXmlContent != null
          ? String(verification.bingXmlContent).slice(0, 20000)
          : '',
      baiduSiteVerification:
        verification.baiduSiteVerification != null
          ? String(verification.baiduSiteVerification).trim().slice(0, 200)
          : '',
      baiduFileName:
        verification.baiduFileName != null
          ? String(verification.baiduFileName).trim().replace(/^\/+/, '').slice(0, 200)
          : '',
      baiduFileContent:
        verification.baiduFileContent != null
          ? String(verification.baiduFileContent).slice(0, 20000)
          : '',
    },
    submission: normalizeSeoSubmission(src.submission),
  };
}

function buildSeoVerificationFiles(config) {
  const seo = normalizeSeoConfig(config);
  const out = [];
  const ver = seo.verification || {};

  if (ver.googleFileToken) {
    const fileName = /^google[a-z0-9_-]+\.html$/i.test(ver.googleFileToken)
      ? ver.googleFileToken
      : `google${ver.googleFileToken}.html`;
    out.push({
      path: `/${fileName}`,
      content: `google-site-verification: ${fileName}`,
      contentType: 'text/html; charset=utf-8',
    });
  }

  if (ver.bingXmlContent && ver.bingXmlContent.trim()) {
    out.push({
      path: '/BingSiteAuth.xml',
      content: ver.bingXmlContent,
      contentType: 'application/xml; charset=utf-8',
    });
  }

  if (ver.baiduFileName && ver.baiduFileContent) {
    out.push({
      path: `/${ver.baiduFileName}`,
      content: ver.baiduFileContent,
      contentType: ver.baiduFileName.toLowerCase().endsWith('.html')
        ? 'text/html; charset=utf-8'
        : 'text/plain; charset=utf-8',
    });
  }

  return out;
}

module.exports = {
  normalizeSeoConfig,
  buildSeoVerificationFiles,
};
