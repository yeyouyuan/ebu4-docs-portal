(function () {
  'use strict';

  if (window.__ebu4BlogFetchBridgeLoaded) return;
  window.__ebu4BlogFetchBridgeLoaded = true;

  var CHANNEL = 'ebu4-blogfetch-bridge';
  var manifest = chrome.runtime.getManifest ? chrome.runtime.getManifest() : { version: '' };

  function post(payload) {
    window.postMessage(
      Object.assign(
        {
          channel: CHANNEL,
          source: 'ecom-token-extractor',
          target: 'ebu4-admin',
          name: manifest.name || 'e-Cology Token Extractor',
          version: manifest.version || '',
        },
        payload || {}
      ),
      '*'
    );
  }

  post({ type: 'bridge-ready' });

  window.addEventListener('message', function (event) {
    if (event.source !== window) return;
    var data = event.data;
    if (!data || data.channel !== CHANNEL) return;
    if (data.source !== 'ebu4-admin' || data.target !== 'ecom-token-extractor') return;

    if (data.type === 'ping') {
      post({ type: 'bridge-pong', requestId: data.requestId || '' });
      return;
    }

    if (data.type !== 'cookie-request') return;

    chrome.runtime.sendMessage({ action: 'getRequestCookieHeader' }, function (resp) {
      if (chrome.runtime.lastError) {
        post({
          type: 'cookie-response',
          requestId: data.requestId || '',
          ok: false,
          error: chrome.runtime.lastError.message || '插件通信失败',
        });
        return;
      }
      var payload = resp && typeof resp === 'object' ? resp : {};
      post({
        type: 'cookie-response',
        requestId: data.requestId || '',
        ok: !!payload.cookie,
        cookie: payload.cookie || '',
        tokens: Array.isArray(payload.tokens) ? payload.tokens : [],
        error: payload.error || '',
      });
    });
  });
})();
