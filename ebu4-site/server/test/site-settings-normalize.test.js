'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { normalizeSiteSettings } = require('../lib/site-settings-normalize');

test('normalizeSiteSettings: null → defaults', () => {
  const o = normalizeSiteSettings(null);
  assert.strictEqual(o.maintenance.enabled, false);
  assert.strictEqual(o.maintenance.fullSite, false);
  assert.strictEqual(o.registration.mode, 'invitation');
  assert.strictEqual(o.redis.enabled, false);
  assert.strictEqual(o.redis.url, '');
  assert.strictEqual(o.upgrade.enabled, false);
  assert.strictEqual(o.upgrade.baseUrl, '');
  assert.strictEqual(o.embed && o.embed.aiChatHtml, '');
});

test('normalizeSiteSettings: embed.aiChatHtml', () => {
  const o = normalizeSiteSettings({
    embed: { aiChatHtml: '<script></script>' },
  });
  assert.strictEqual(o.embed.aiChatHtml, '<script></script>');
});

test('normalizeSiteSettings: merge maintenance + registration.mode', () => {
  const o = normalizeSiteSettings({
    maintenance: { enabled: true, message: 'x', fullSite: true },
    registration: { mode: 'open' },
  });
  assert.strictEqual(o.maintenance.enabled, true);
  assert.strictEqual(o.maintenance.message, 'x');
  assert.strictEqual(o.maintenance.fullSite, true);
  assert.strictEqual(o.registration.mode, 'open');
});

test('normalizeSiteSettings: invalid mode → invitation', () => {
  const o = normalizeSiteSettings({
    registration: { mode: 'bogus' },
  });
  assert.strictEqual(o.registration.mode, 'invitation');
});

test('normalizeSiteSettings: redis merge + trim url', () => {
  const o = normalizeSiteSettings({
    redis: { enabled: true, url: '  redis://x  ' },
  });
  assert.strictEqual(o.redis.enabled, true);
  assert.strictEqual(o.redis.url, 'redis://x');
});


test('normalizeSiteSettings: upgrade merge', () => {
  const o = normalizeSiteSettings({
    upgrade: {
      enabled: true,
      baseUrl: 'https://x.com/',
      checkChannels: 'docs',
      autoUpdate: { enabled: true, intervalMinutes: 30, applyDocs: true },
    },
  });
  assert.strictEqual(o.upgrade.enabled, true);
  assert.strictEqual(o.upgrade.baseUrl, 'https://x.com');
  assert.strictEqual(o.upgrade.checkChannels, 'docs');
  assert.strictEqual(o.upgrade.autoUpdate.intervalMinutes, 30);
  assert.strictEqual(o.upgrade.autoUpdate.applyDocs, true);
});
