/**
 * 前台访问 PV 统计（SQLite site_kv.public_visit_stats 或 data/visit-stats.json）
 */
const fs = require('fs');
const path = require('path');

const KV_KEY = 'public_visit_stats';

function defaultStats() {
  return {
    total: 0,
    docsPv: 0,
    indexPv: 0,
    extraPagePv: 0,
    byPath: {},
    byDay: {},
    updatedAt: null,
  };
}

function shouldCountVisit(req) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const p = req.path || '';
  if (p.startsWith('/api/') || p.startsWith('/admin')) return false;
  if (p.startsWith('/img/')) return false;
  if (p === '/sw.js' || p.startsWith('/maintenance')) return false;
  if (p.startsWith('/data/')) return false;
  if (/\.(js|mjs|css|map|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot|json|xml|txt|webmanifest)$/i.test(p)) {
    return false;
  }
  return true;
}

function normalizePath(p) {
  if (!p || p === '') return '/';
  const q = String(p).split('?')[0];
  return q.length > 200 ? q.slice(0, 200) : q;
}

function readStats(siteDatabase, filePath) {
  try {
    if (siteDatabase && siteDatabase.isSiteSqlite()) {
      const raw = siteDatabase.getKv(KV_KEY);
      if (raw) return Object.assign(defaultStats(), JSON.parse(raw));
    } else if (filePath && fs.existsSync(filePath)) {
      return Object.assign(defaultStats(), JSON.parse(fs.readFileSync(filePath, 'utf-8')));
    }
  } catch (_) {}
  return defaultStats();
}

function writeStats(siteDatabase, filePath, data) {
  const out = JSON.stringify({
    ...data,
    updatedAt: new Date().toISOString(),
  });
  if (siteDatabase && siteDatabase.isSiteSqlite()) {
    siteDatabase.setKv(KV_KEY, out);
  } else if (filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, out, 'utf-8');
  }
}

function recordVisit(siteDatabase, filePath, req) {
  const pathname = normalizePath(req.path);
  const d = readStats(siteDatabase, filePath);
  d.total = (d.total || 0) + 1;
  const day = new Date().toISOString().slice(0, 10);
  d.byDay = d.byDay || {};
  d.byDay[day] = (d.byDay[day] || 0) + 1;
  const bp = d.byPath || {};
  bp[pathname] = (bp[pathname] || 0) + 1;
  const keys = Object.keys(bp);
  if (keys.length > 100) {
    const sorted = keys.sort((a, b) => (bp[b] || 0) - (bp[a] || 0));
    const next = {};
    sorted.slice(0, 80).forEach((k) => {
      next[k] = bp[k];
    });
    d.byPath = next;
  } else {
    d.byPath = bp;
  }
  if (pathname.startsWith('/docs') || pathname === '/docs') {
    d.docsPv = (d.docsPv || 0) + 1;
  } else if (pathname === '/' || pathname.startsWith('/index')) {
    d.indexPv = (d.indexPv || 0) + 1;
  } else if (pathname.startsWith('/page/')) {
    d.extraPagePv = (d.extraPagePv || 0) + 1;
  }
  writeStats(siteDatabase, filePath, d);
}

function createMiddleware(siteDatabase, filePath) {
  return (req, res, next) => {
    if (!shouldCountVisit(req)) return next();
    try {
      recordVisit(siteDatabase, filePath, req);
    } catch (_) {}
    next();
  };
}

function topPaths(byPath, n) {
  const o = byPath && typeof byPath === 'object' ? byPath : {};
  return Object.keys(o)
    .map((k) => ({ path: k, count: o[k] || 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n || 15);
}

module.exports = {
  createMiddleware,
  readStats,
  topPaths,
};
