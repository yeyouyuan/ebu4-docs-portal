/**
 * PWA：注册 Service Worker（landing / docs 共用）
 */
(function () {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', function () {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(function (reg) {
        if (reg && typeof reg.update === 'function') reg.update().catch(function () {});
      })
      .catch(function () {});
  });
})();
