const express = require('express');
const { readNormalizedAiSettings } = require('./lib/ai-settings-store');
const { searchSiteKnowledge } = require('./lib/site-ai-search-service');
const { runWebSearch } = require('./lib/web-search-service');
const { runAiChat } = require('./lib/ai-provider-service');
const { sendError } = require('./lib/api-response');
const { validateNormalizedAiSettings } = require('./lib/ai-settings-validate');

const PUBLIC_AI_RATE_LIMIT = new Map();
const WINDOW_MS = 60 * 1000;

function buildPublicKey(req) {
  return String(req.ip || '') + ':' + String(req.siteSessionToken || '');
}

function takeRateLimit(req, maxCount) {
  const key = buildPublicKey(req);
  const now = Date.now();
  let row = PUBLIC_AI_RATE_LIMIT.get(key);
  if (!row || row.exp <= now) {
    row = { exp: now + WINDOW_MS, count: 0 };
  }
  row.count += 1;
  PUBLIC_AI_RATE_LIMIT.set(key, row);
  return row.count <= maxCount;
}

function sanitizePublicConfig(settings, req) {
  const publicCfg =
    settings && settings.publicAssistant && typeof settings.publicAssistant === 'object'
      ? settings.publicAssistant
      : {};
  const allowedByRole = !(publicCfg.requireLogin === true && (req.siteRole || 'guest') === 'guest');
  return {
    enabled: settings.enabled === true && publicCfg.enabled === true && allowedByRole,
    requireLogin: publicCfg.requireLogin === true,
    showSources: publicCfg.showSources !== false,
    allowWebSearch: publicCfg.allowWebSearch !== false,
    canUseNow: allowedByRole,
  };
}

function trimText(value, max) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function buildAiPrompt(input) {
  const siteSources = Array.isArray(input.siteSources) ? input.siteSources : [];
  const webSources = Array.isArray(input.webSources) ? input.webSources : [];
  const pageContext = input.pageContext && typeof input.pageContext === 'object' ? input.pageContext : {};
  const parts = [];
  if (pageContext.pageTitle || pageContext.pageText) {
    parts.push('【当前页面上下文】');
    if (pageContext.pageTitle) parts.push('标题：' + trimText(pageContext.pageTitle, 200));
    if (pageContext.pageText) parts.push('正文摘录：' + trimText(pageContext.pageText, 2500));
  }
  if (siteSources.length) {
    parts.push('【站内检索结果】');
    siteSources.forEach((item, idx) => {
      parts.push(
        `${idx + 1}. ${trimText(item.sourceLabel || item.title, 200)}\n链接：${item.url}\n片段：${trimText(
          item.snippet,
          400
        )}`
      );
    });
  }
  if (webSources.length) {
    parts.push('【外部联网搜索结果】');
    webSources.forEach((item, idx) => {
      parts.push(
        `${idx + 1}. ${trimText(item.title, 200)}\n链接：${item.url}\n片段：${trimText(item.snippet, 400)}`
      );
    });
  }
  parts.push('请严格优先依据站内资料回答；只有当站内资料不足时，才参考外部联网结果。若资料不足或不确定，直接说明。');
  return parts.join('\n\n');
}

function normalizeMessages(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map((item) => ({
      role: item && item.role === 'assistant' ? 'assistant' : 'user',
      content: trimText(item && item.content, 4000),
    }))
    .filter((item) => item.content)
    .slice(-10);
}

function registerAiRoutes(app, ctx) {
  const { AI_SETTINGS_PATH, siteDatabase, extraPagesRepo, siteSession, redisCache } = ctx;
  const readAiSettings =
    ctx && typeof ctx.readNormalizedAiSettings === 'function'
      ? ctx.readNormalizedAiSettings
      : () => readNormalizedAiSettings(siteDatabase, AI_SETTINGS_PATH);
  const searchKnowledge =
    ctx && typeof ctx.searchSiteKnowledge === 'function' ? ctx.searchSiteKnowledge : searchSiteKnowledge;
  const searchWeb = ctx && typeof ctx.runWebSearch === 'function' ? ctx.runWebSearch : runWebSearch;
  const chatRunner = ctx && typeof ctx.runAiChat === 'function' ? ctx.runAiChat : runAiChat;

  app.get('/api/ai/config', (req, res) => {
    try {
      if (siteSession && typeof siteSession.ensureSiteGuest === 'function') {
        siteSession.ensureSiteGuest(req, res);
      }
      const settings = readAiSettings();
      const pub = sanitizePublicConfig(settings, req);
      res.json({
        ok: true,
        enabled: pub.enabled,
        requireLogin: pub.requireLogin,
        canUseNow: pub.canUseNow,
        showSources: pub.showSources,
        allowWebSearch: pub.allowWebSearch && settings.webSearch && settings.webSearch.enabled === true,
      });
    } catch (e) {
      sendError(res, 500, String(e.message || e));
    }
  });

  app.post('/api/ai/chat', express.json({ limit: '200kb' }), async (req, res) => {
    try {
      if (siteSession && typeof siteSession.ensureSiteGuest === 'function') {
        siteSession.ensureSiteGuest(req, res);
      }
      const settings = readAiSettings();
      const pub = sanitizePublicConfig(settings, req);
      if (!pub.enabled) {
        return sendError(res, pub.canUseNow ? 404 : 403, pub.canUseNow ? 'AI 助手未启用' : '当前需登录后使用 AI 助手');
      }
      const configValidation = validateNormalizedAiSettings(settings);
      if (!configValidation.ok) {
        return sendError(res, 503, 'AI 服务配置不完整', { detail: configValidation.detail });
      }
      if (!takeRateLimit(req, 20)) {
        return sendError(res, 429, '请求过于频繁，请稍后再试');
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const pageContext = body.pageContext && typeof body.pageContext === 'object' ? body.pageContext : {};
      const messages = normalizeMessages(body.messages);
      if (!messages.length) return sendError(res, 400, '缺少消息内容');
      const lastUserMessage = [...messages].reverse().find((item) => item.role === 'user');
      if (!lastUserMessage || !lastUserMessage.content) {
        return sendError(res, 400, '缺少用户提问');
      }
      const siteSources = await searchKnowledge({
        query: lastUserMessage.content,
        clearance: req.siteClearance || 'guest',
        currentDocSlug: pageContext.currentDocSlug,
        currentPageSlug: pageContext.currentPageSlug,
        contentEpoch: redisCache && typeof redisCache.getEpoch === 'function' ? redisCache.getEpoch() : 0,
        siteDatabase,
        extraPagesRepo,
        limit: 5,
      });
      let webSources = [];
      const wantsWeb = body.webSearch === true && pub.allowWebSearch && settings.webSearch.enabled === true;
      if (wantsWeb) {
        webSources = await searchWeb(settings.webSearch, lastUserMessage.content);
      }
      const result = await chatRunner(settings, {
        providerId: settings.defaultProvider,
        systemPrompt:
          '你是 EBU4 文档站的整站 AI 助手。请使用中文回答，优先依据站内资料，回答简洁、准确、可操作；若资料不足要明确说明不确定，不要编造。',
        messages: messages.concat([
          {
            role: 'user',
            content: buildAiPrompt({
              pageContext,
              siteSources,
              webSources,
            }),
          },
        ]),
        temperature: 0.2,
        maxTokens: 1400,
      });
      res.json({
        ok: true,
        answer: result.text,
        providerId: result.providerId,
        model: result.model,
        showSources: pub.showSources,
        sources: pub.showSources ? siteSources.concat(webSources) : [],
      });
    } catch (e) {
      sendError(res, 400, String(e.message || e));
    }
  });
}

module.exports = {
  registerAiRoutes,
};
