'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');

const { registerAiRoutes } = require('../ai-routes');
const { httpJson } = require('../test-support/http-test-utils.cjs');

function createAiApp(overrides) {
  const app = express();
  registerAiRoutes(
    app,
    Object.assign(
      {
        AI_SETTINGS_PATH: '',
        siteDatabase: {},
        extraPagesRepo: {},
        siteSession: {
          ensureSiteGuest(req) {
            req.siteRole = req.headers['x-site-role'] || 'guest';
            req.siteSessionToken = 'test-session';
          },
        },
        redisCache: { getEpoch: () => 1 },
        readNormalizedAiSettings: () => ({
          enabled: true,
          defaultProvider: 'openai',
          publicAssistant: {
            enabled: true,
            requireLogin: false,
            showSources: true,
            allowWebSearch: true,
          },
          weeklyReport: { useAi: false, provider: '', model: '' },
          webSearch: {
            enabled: false,
            provider: 'searxng',
            baseUrl: '',
            apiKey: '',
            maxResults: 5,
            safeSearch: 'moderate',
          },
          providers: {
            openai: {
              enabled: true,
              type: 'openai',
              label: 'OpenAI',
              baseUrl: 'https://api.openai.com/v1',
              model: 'gpt-4.1-mini',
              apiKey: 'sk-test',
            },
          },
        }),
        searchSiteKnowledge: async () => [{ title: '文档', url: '/docs', snippet: '站内资料', sourceLabel: '主文档' }],
        runWebSearch: async () => [],
        runAiChat: async () => ({ text: '测试回答', providerId: 'openai', model: 'gpt-4.1-mini' }),
      },
      overrides || {}
    )
  );
  return app;
}

test('POST /api/ai/chat: returns structured 400 for empty messages', async () => {
  const { res, data } = await httpJson(createAiApp(), '/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [] }),
  });
  assert.equal(res.status, 400);
  assert.equal(data.error, '缺少消息内容');
  assert.equal(data.message, '缺少消息内容');
});

test('POST /api/ai/chat: returns structured 503 for incomplete AI config', async () => {
  const app =
    createAiApp({
      readNormalizedAiSettings: () => ({
        enabled: true,
        defaultProvider: 'openai',
        publicAssistant: { enabled: true, requireLogin: false, showSources: true, allowWebSearch: true },
        weeklyReport: { useAi: false, provider: '', model: '' },
        webSearch: { enabled: false, provider: 'searxng', baseUrl: '', apiKey: '', maxResults: 5, safeSearch: 'moderate' },
        providers: {
          openai: {
            enabled: true,
            type: 'openai',
            label: 'OpenAI',
            baseUrl: 'https://api.openai.com/v1',
            model: '',
            apiKey: '',
          },
        },
      }),
    });
  const { res, data } = await httpJson(app, '/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: '你好' }] }),
  });
  assert.equal(res.status, 503);
  assert.equal(data.message, 'AI 服务配置不完整');
  assert.ok(Array.isArray(data.detail));
});

test('POST /api/ai/chat: succeeds for valid request', async () => {
  const { res, data } = await httpJson(createAiApp(), '/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: '如何配置 AI？' }] }),
  });
  assert.equal(res.status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.answer, '测试回答');
  assert.equal(Array.isArray(data.sources), true);
});
