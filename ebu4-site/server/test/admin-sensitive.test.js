'use strict';
const assert = require('assert');
const test = require('node:test');
const {
  sanitizeSiteSettingsForAdminGet,
  maskRedisUrl,
  sanitizeAuditDetail,
} = require('../lib/admin-sensitive');

test('maskRedisUrl: password hidden', () => {
  assert.strictEqual(
    maskRedisUrl('redis://:secret@127.0.0.1:6379/0'),
    'redis://:***@127.0.0.1:6379/0'
  );
});

test('sanitizeSiteSettingsForAdminGet: strips secrets, adds flags', () => {
  const o = sanitizeSiteSettingsForAdminGet({
    maintenance: { enabled: false, message: '', fullSite: false },
    registration: { mode: 'invitation' },
    redis: { enabled: true, url: 'redis://:pwd@h:6379' },
    upgrade: {
      enabled: true,
      baseUrl: 'https://x.com',
      manifestPath: '/upgrade/manifest.json',
      bearerToken: 'secret-token',
      insecureTls: false,
      checkChannels: 'both',
      autoUpdate: { enabled: false, intervalMinutes: 60, applyDocs: false, applySystem: false },
    },
  });
  assert.strictEqual(o.redis.url, '');
  assert.strictEqual(o.redisUrlConfigured, true);
  assert.ok(String(o.redisUrlPreview).includes('***'));
  assert.strictEqual(o.upgrade.bearerToken, '');
  assert.strictEqual(o.upgradeBearerConfigured, true);
});

test('sanitizeAuditDetail: masks password key', () => {
  const d = sanitizeAuditDetail({ user: 'a', password: 'x', nested: { token: 'y' } });
  assert.strictEqual(d.password, '***（已脱敏）');
  assert.strictEqual(d.nested.token, '***（已脱敏）');
});
