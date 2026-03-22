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
