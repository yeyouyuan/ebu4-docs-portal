const { DEFAULT_PROVIDER_KEYS } = require('./ai-settings-normalize');

function isValidHttpUrl(raw) {
  if (!raw) return false;
  try {
    const url = new URL(String(raw));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function validateNormalizedAiSettings(settings) {
  const normalized = settings && typeof settings === 'object' ? settings : {};
  const providers = normalized.providers && typeof normalized.providers === 'object' ? normalized.providers : {};
  const detail = [];
  const enabledProviders = [];

  DEFAULT_PROVIDER_KEYS.forEach((id) => {
    const row = providers[id];
    if (!row || typeof row !== 'object' || row.enabled !== true) return;
    enabledProviders.push(id);
    if (!String(row.baseUrl || '').trim()) {
      detail.push({ field: `providers.${id}.baseUrl`, message: '启用 Provider 后必须填写 Base URL' });
    } else if (!isValidHttpUrl(row.baseUrl)) {
      detail.push({ field: `providers.${id}.baseUrl`, message: 'Provider Base URL 必须是合法的 http(s) 地址' });
    }
    if (!String(row.model || '').trim()) {
      detail.push({ field: `providers.${id}.model`, message: '启用 Provider 后必须填写模型名' });
    }
    if (!String(row.apiKey || '').trim()) {
      detail.push({ field: `providers.${id}.apiKey`, message: '启用 Provider 后必须填写 API Key' });
    }
  });

  if (normalized.enabled === true) {
    const defaultProvider = String(normalized.defaultProvider || '').trim();
    if (!defaultProvider) {
      detail.push({ field: 'defaultProvider', message: '启用 AI 后必须选择默认 Provider' });
    } else if (!enabledProviders.includes(defaultProvider)) {
      detail.push({ field: 'defaultProvider', message: '默认 Provider 必须已启用并配置完整' });
    }
  }

  const weeklyReport = normalized.weeklyReport && typeof normalized.weeklyReport === 'object' ? normalized.weeklyReport : {};
  if (weeklyReport.useAi === true && String(weeklyReport.provider || '').trim()) {
    const providerId = String(weeklyReport.provider).trim();
    if (!enabledProviders.includes(providerId)) {
      detail.push({ field: 'weeklyReport.provider', message: '周报 AI Provider 必须已启用并配置完整' });
    }
  }

  const webSearch = normalized.webSearch && typeof normalized.webSearch === 'object' ? normalized.webSearch : {};
  if (webSearch.enabled === true) {
    if (!String(webSearch.baseUrl || '').trim()) {
      detail.push({ field: 'webSearch.baseUrl', message: '启用联网搜索后必须填写 Base URL' });
    } else if (!isValidHttpUrl(webSearch.baseUrl)) {
      detail.push({ field: 'webSearch.baseUrl', message: '联网搜索 Base URL 必须是合法的 http(s) 地址' });
    }
  }

  const publicAssistant =
    normalized.publicAssistant && typeof normalized.publicAssistant === 'object' ? normalized.publicAssistant : {};
  if (
    publicAssistant.enabled === true &&
    publicAssistant.allowWebSearch === true &&
    webSearch.enabled === true &&
    publicAssistant.showSources !== true
  ) {
    detail.push({
      field: 'publicAssistant.showSources',
      message: '启用前台联网搜索时必须同时开启来源展示',
    });
  }

  return {
    ok: detail.length === 0,
    detail,
  };
}

function validateAiTestRequest(body) {
  const payload = body && typeof body === 'object' ? body : {};
  const detail = [];
  if (!String(payload.providerId || '').trim()) {
    detail.push({ field: 'providerId', message: '缺少测试 Provider' });
  }
  if (!String(payload.prompt || '').trim()) {
    detail.push({ field: 'prompt', message: '缺少测试 Prompt' });
  }
  return {
    ok: detail.length === 0,
    detail,
  };
}

module.exports = {
  validateNormalizedAiSettings,
  validateAiTestRequest,
};
