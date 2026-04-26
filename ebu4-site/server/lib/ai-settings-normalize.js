function normalizeProviderId(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '');
}

const DEFAULT_PROVIDER_KEYS = [
  'openai',
  'anthropic',
  'gemini',
  'openrouter',
  'deepseek',
  'qwen',
  'moonshot',
  'zhipu',
  'doubao',
  'xai',
];

const DEFAULT_PROVIDERS = {
  openai: {
    enabled: false,
    type: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4.1-mini',
    apiKey: '',
  },
  anthropic: {
    enabled: false,
    type: 'anthropic',
    label: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-3-5-sonnet-latest',
    apiKey: '',
  },
  gemini: {
    enabled: false,
    type: 'gemini',
    label: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    model: 'gemini-2.0-flash',
    apiKey: '',
  },
  openrouter: {
    enabled: false,
    type: 'openai_compat',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: '',
    apiKey: '',
  },
  deepseek: {
    enabled: false,
    type: 'openai_compat',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: '',
    apiKey: '',
  },
  qwen: {
    enabled: false,
    type: 'openai_compat',
    label: 'Qwen / DashScope',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: '',
    apiKey: '',
  },
  moonshot: {
    enabled: false,
    type: 'openai_compat',
    label: 'Moonshot / Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: '',
    apiKey: '',
  },
  zhipu: {
    enabled: false,
    type: 'openai_compat',
    label: 'Zhipu GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: '',
    apiKey: '',
  },
  doubao: {
    enabled: false,
    type: 'openai_compat',
    label: 'Doubao / Ark',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: '',
    apiKey: '',
  },
  xai: {
    enabled: false,
    type: 'openai_compat',
    label: 'xAI',
    baseUrl: 'https://api.x.ai/v1',
    model: '',
    apiKey: '',
  },
};

function cloneJson(v) {
  return JSON.parse(JSON.stringify(v));
}

function normalizeProviderConfig(id, value) {
  const base = cloneJson(DEFAULT_PROVIDERS[id] || {
    enabled: false,
    type: 'openai_compat',
    label: id,
    baseUrl: '',
    model: '',
    apiKey: '',
  });
  const raw = value && typeof value === 'object' ? value : {};
  const type =
    raw.type === 'openai' || raw.type === 'openai_compat' || raw.type === 'anthropic' || raw.type === 'gemini'
      ? raw.type
      : base.type;
  const baseUrl = raw.baseUrl != null ? String(raw.baseUrl).trim().replace(/\/+$/, '') : base.baseUrl;
  return {
    enabled: raw.enabled === true,
    type,
    label: raw.label != null ? String(raw.label).trim().slice(0, 80) : base.label,
    baseUrl: baseUrl,
    model: raw.model != null ? String(raw.model).trim().slice(0, 120) : base.model,
    apiKey: raw.apiKey != null ? String(raw.apiKey).trim().slice(0, 500) : base.apiKey,
  };
}

function normalizeAiSettings(raw) {
  const base = {
    enabled: false,
    defaultProvider: 'openai',
    publicAssistant: {
      enabled: false,
      requireLogin: false,
      showSources: true,
      allowWebSearch: true,
    },
    weeklyReport: {
      useAi: true,
      provider: '',
      model: '',
    },
    webSearch: {
      enabled: false,
      provider: 'searxng',
      baseUrl: '',
      apiKey: '',
      maxResults: 5,
      safeSearch: 'moderate',
    },
    providers: cloneJson(DEFAULT_PROVIDERS),
  };
  if (!raw || typeof raw !== 'object') return base;
  const out = cloneJson(base);
  out.enabled = raw.enabled === true;
  const defaultProvider = normalizeProviderId(raw.defaultProvider || base.defaultProvider) || base.defaultProvider;
  out.defaultProvider = DEFAULT_PROVIDER_KEYS.includes(defaultProvider) ? defaultProvider : base.defaultProvider;
  const pub = raw.publicAssistant && typeof raw.publicAssistant === 'object' ? raw.publicAssistant : {};
  out.publicAssistant = {
    enabled: pub.enabled === true,
    requireLogin: pub.requireLogin === true,
    showSources: pub.showSources !== false,
    allowWebSearch: pub.allowWebSearch !== false,
  };
  const wr = raw.weeklyReport && typeof raw.weeklyReport === 'object' ? raw.weeklyReport : {};
  out.weeklyReport = {
    useAi: wr.useAi !== false,
    provider: normalizeProviderId(wr.provider || ''),
    model: wr.model != null ? String(wr.model).trim().slice(0, 120) : '',
  };
  const ws = raw.webSearch && typeof raw.webSearch === 'object' ? raw.webSearch : {};
  out.webSearch = {
    enabled: ws.enabled === true,
    provider: 'searxng',
    baseUrl: ws.baseUrl != null ? String(ws.baseUrl).trim().replace(/\/+$/, '') : '',
    apiKey: ws.apiKey != null ? String(ws.apiKey).trim().slice(0, 500) : '',
    maxResults: Math.max(1, Math.min(10, parseInt(ws.maxResults, 10) || 5)),
    safeSearch:
      ws.safeSearch === 'off' || ws.safeSearch === 'strict' ? ws.safeSearch : 'moderate',
  };

  const providers = raw.providers && typeof raw.providers === 'object' ? raw.providers : {};
  DEFAULT_PROVIDER_KEYS.forEach((key) => {
    out.providers[key] = normalizeProviderConfig(key, providers[key]);
  });

  return out;
}

module.exports = {
  DEFAULT_PROVIDER_KEYS,
  DEFAULT_PROVIDERS,
  normalizeAiSettings,
  normalizeProviderId,
};
