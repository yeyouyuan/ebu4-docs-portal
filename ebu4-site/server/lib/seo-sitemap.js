function normalizeOrigin(raw, fallbackOrigin) {
  const fallback = String(fallbackOrigin || '').trim().replace(/\/+$/, '');
  const src = String(raw || '').trim();
  if (!src) return fallback;
  try {
    const u = new URL(src);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return fallback;
    return u.toString().replace(/\/+$/, '');
  } catch (_) {
    return fallback;
  }
}

async function buildSeoSitemapRelPaths({ seo, siteDatabase, extraPagesRepo, extraPagesStore }) {
  const cfg = seo && typeof seo === 'object' ? seo : {};
  const useAuto = cfg.sitemapAuto !== false;
  const paths = [];
  const seen = new Set();
  const addPath = (value) => {
    if (typeof value !== 'string' || !value.trim()) return;
    let next = value.trim();
    if (!next.startsWith('/')) next = '/' + next;
    if (seen.has(next)) return;
    seen.add(next);
    paths.push(next);
  };

  if (useAuto) {
    addPath('/');
    addPath('/index');
    let docs = [];
    let defaultSlug = 'default';
    try {
      docs = siteDatabase.listMainDocuments();
      defaultSlug = siteDatabase.getDefaultMainDocSlug();
    } catch (_) {}
    if (!Array.isArray(docs) || !docs.length) {
      addPath('/docs');
    } else {
      for (const doc of docs) {
        const slug = String((doc && doc.slug) || defaultSlug || 'default').trim();
        if (!slug) continue;
        addPath(slug === defaultSlug ? '/docs' : `/docs?doc=${encodeURIComponent(slug)}`);
      }
    }
  }

  const extraManual = Array.isArray(cfg.sitemapPaths) ? cfg.sitemapPaths : [];
  if (useAuto) {
    extraManual.forEach(addPath);
  } else if (extraManual.length) {
    extraManual.forEach(addPath);
  } else {
    addPath('/index');
    addPath('/docs');
  }

  const includeExtra =
    cfg.includeExtraPagesInSitemap === undefined || cfg.includeExtraPagesInSitemap === true;
  if (includeExtra && extraPagesRepo && extraPagesStore) {
    const store = await extraPagesRepo.readStore();
    const pages = store && Array.isArray(store.pages) ? store.pages : [];
    for (const page of pages) {
      if (!extraPagesStore.isPublishedForPublic(page)) continue;
      const slug = String((page && page.slug) || '').trim();
      if (!slug) continue;
      addPath(`/page/${encodeURIComponent(slug)}`);
    }
  }

  return paths;
}

function relPathsToAbsoluteUrls(origin, relPaths) {
  const base = normalizeOrigin(origin, '');
  return (Array.isArray(relPaths) ? relPaths : [])
    .map((item) => {
      const rel = String(item || '').trim();
      if (!rel) return '';
      const next = rel.startsWith('/') ? rel : '/' + rel;
      return base ? base + next : next;
    })
    .filter(Boolean);
}

module.exports = {
  normalizeOrigin,
  buildSeoSitemapRelPaths,
  relPathsToAbsoluteUrls,
};
