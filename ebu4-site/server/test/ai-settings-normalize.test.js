'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { normalizeAiSettings } = require('../lib/ai-settings-normalize');

test('normalizeAiSettings: defaults', () => {
  const o = normalizeAiSettings(null);
  assert.strictEqual(o.enabled, false);
  assert.strictEqual(o.defaultProvider, 'openai');
  assert.strictEqual(o.publicAssistant.showSources, true);
  assert.strictEqual(o.webSearch.provider, 'searxng');
  assert.ok(o.providers.openai);
});

test('normalizeAiSettings: trims and preserves provider config', () => {
  const o = normalizeAiSettings({
    enabled: true,
    defaultProvider: 'deepseek',
    publicAssistant: { enabled: true, requireLogin: true, showSources: false, allowWebSearch: false },
    webSearch: { enabled: true, baseUrl: ' https://search.example.com/ ', maxResults: 9, safeSearch: 'strict' },
    providers: {
      deepseek: {
        enabled: true,
        type: 'openai_compat',
        label: 'DeepSeek',
        baseUrl: ' https://api.deepseek.com/v1/ ',
        model: 'deepseek-chat',
        apiKey: 'sk-test',
      },
    },
  });
  assert.strictEqual(o.enabled, true);
  assert.strictEqual(o.defaultProvider, 'deepseek');
  assert.strictEqual(o.publicAssistant.requireLogin, true);
  assert.strictEqual(o.publicAssistant.showSources, false);
  assert.strictEqual(o.webSearch.baseUrl, 'https://search.example.com');
  assert.strictEqual(o.providers.deepseek.baseUrl, 'https://api.deepseek.com/v1');
  assert.strictEqual(o.providers.deepseek.apiKey, 'sk-test');
});
