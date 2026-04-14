/* eslint-disable no-restricted-globals */
/**
 * E9 文档站 PWA — 离线壳层 + 运行时缓存
 * 更新缓存：修改 VERSION 并部署
 */
const VERSION = 'ebu4-pwa-2026.04.16-2';
const PRECACHE = 'precache-' + VERSION;
const RUNTIME = 'runtime-' + VERSION;

const PRECACHE_URLS = [
  '/index',
  '/docs',
  /* 勿预缓存 /admin：无 Cookie 时会缓存成「登录页」，导致已登录仍命中陈旧缓存无法进后台 */
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/css/style.css',
  '/css/landing.css',
  '/css/admin.css',
  '/js/docs-chrome.js',
  '/js/lazy-images.js',
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

/** 导航请求在部分环境下为 redirect: manual，直接 fetch(req) 会得到 302，交给页面会报错 */
function fetchFollow(req) {
  if (req.redirect === 'follow') return fetch(req);
  return fetch(new Request(req, { redirect: 'follow' }));
}

/** respondWith 必须得到 Response；勿返回 undefined，否则会抛 Failed to convert value to 'Response' */
function offline503() {
  return new Response('Network unavailable', {
    status: 503,
    statusText: 'Service Unavailable',
    headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
  });
}

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

  /**
   * /api/、/data/ 不拦截：交给浏览器默认网络请求。
   * 管理后台（文档管理等）依赖实时数据，不能走 SW cache-first。
   */
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/data/')) {
    return;
  }

  /** 后台与登录页必须走网络，禁止 cache-first（否则会长期返回预缓存的登录 HTML） */
  if (url.pathname.startsWith('/admin')) {
    event.respondWith(
      fetchFollow(req)
        .catch(function () {
          if (req.mode === 'navigate') {
            return caches.match('/admin/login').then(function (h) {
              return h || caches.match('/docs');
            });
          }
          return offline503();
        })
        .then(function (res) {
          return res instanceof Response ? res : offline503();
        })
    );
    return;
  }

  /**
   * 后台脚本须 network-first：否则 cache-first 会把 /js/admin.js?v=… 缓存在 runtime，
   * 版本号未变时长期返回旧脚本，后台界面逻辑不更新。
   */
  if (url.pathname.startsWith('/js/admin')) {
    event.respondWith(
      fetchFollow(req)
        .catch(function () {
          return caches.match(req);
        })
        .then(function (res) {
          return res instanceof Response ? res : offline503();
        })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetchFollow(req)
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
            return caches.match('/docs').then(function (d) {
              return d || caches.match('/index');
            });
          }
          return offline503();
        })
        .then(function (res) {
          return res instanceof Response ? res : offline503();
        });
    })
  );
});
