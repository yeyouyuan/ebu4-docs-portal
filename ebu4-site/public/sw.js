/* eslint-disable no-restricted-globals */
/**
 * E9 文档站 PWA — 离线壳层 + 运行时缓存
 * 更新缓存：修改 VERSION 并部署
 */
const VERSION = 'ebu4-pwa-2026.03.22-3';
const PRECACHE = 'precache-' + VERSION;
const RUNTIME = 'runtime-' + VERSION;

const PRECACHE_URLS = [
  '/index',
  '/docs',
  '/admin',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/css/style.css',
  '/css/landing.css',
  '/css/admin.css',
  '/js/app.js',
  '/js/admin.js',
  '/js/admin-config-forms.js',
  '/js/admin-tools-nav.js',
  '/js/register-sw.js',
  '/js/landing-config.js',
  '/data/landing.json',
  '/data/seo.json',
  '/js/seo-config.js',
  '/lib/marked.min.js',
  '/lib/highlight.min.js',
  '/lib/hl-java.min.js',
  '/lib/hl-javascript.min.js',
  '/lib/hl-xml.min.js',
  '/lib/hl-json.min.js',
  '/lib/hl-bash.min.js',
  '/lib/github-dark.min.css',
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches
      .open(PRECACHE)
      .then(function (cache) {
        return cache.addAll(PRECACHE_URLS);
      })
      .then(function () {
        return self.skipWaiting();
      })
      .catch(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys.map(function (key) {
            if (key !== PRECACHE && key !== RUNTIME) {
              return caches.delete(key);
            }
          })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(req));
    return;
  }

  if (url.pathname.startsWith('/data/')) {
    event.respondWith(fetch(req));
    return;
  }

  event.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req)
        .then(function (res) {
          if (!res || res.status !== 200 || res.type !== 'basic') {
            return res;
          }
          var copy = res.clone();
          caches.open(RUNTIME).then(function (cache) {
            cache.put(req, copy);
          });
          return res;
        })
        .catch(function () {
          if (req.mode === 'navigate') {
            var p = url.pathname;
            if (p === '/admin' || p === '/admin/') {
              return caches.match('/admin');
            }
            return caches.match('/docs').then(function (d) {
              return d || caches.match('/index');
            });
          }
        });
    })
  );
});
