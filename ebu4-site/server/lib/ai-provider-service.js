const { normalizeProviderId } = require('./ai-settings-normalize');

function joinUrl(baseUrl, path) {
  const root = String(baseUrl || '').replace(/\/+$/, '');
  const tail = String(path || '').replace(/^\/+/, '');
  return root + '/' + tail;
}

function ensureVersionedBaseUrl(baseUrl) {
  const raw = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!raw) return raw;
  if (/\/v\d+$/i.test(raw) || /\/compatible-mode\/v\d+$/i.test(raw) || /\/api\/v\d+$/i.test(raw)) {
    return raw;
  }
  return raw + '/v1';
}

function safeJsonParse(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch (_) {
    return null;
  }
}

function getProviderRow(settings, providerId) {
  const providers = settings && settings.providers && typeof settings.providers === 'object' ? settings.providers : {};
  const pid = normalizeProviderId(providerId || settings.defaultProvider || '');
  if (!pid || !providers[pid]) {
    throw new Error('AI provider 未配置');
  }
  return { id: pid, config: providers[pid] };
}

function assertProviderReady(row, overrideModel) {
  if (!row || !row.config) throw new Error('AI provider 不存在');
  if (row.config.enabled !== true) throw new Error('AI provider 未启用');
  if (!String(row.config.apiKey || '').trim()) throw new Error('AI provider 缺少 API Key');
  const model = String(overrideModel || row.config.model || '').trim();
  if (!model) throw new Error('AI provider 缺少默认模型');
  return model;
}

function toTextMessages(messages) {
  const list = Array.isArray(messages) ? messages : [];
  return list
    .map((item) => ({
      role: item && item.role === 'assistant' ? 'assistant' : 'user',
      content: String(item && item.content ? item.content : '').trim(),
    }))
    .filter((item) => item.content);
}

async function doJsonRequest(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || 30000);
  try {
    const resp = await fetch(url, Object.assign({}, options, { signal: controller.signal }));
    const text = await resp.text();
    const data = safeJsonParse(text);
    if (resp.ok && !data) {
      const sample = String(text || '').trim().slice(0, 200);
      if (/^\s*<!doctype html>|^\s*<html/i.test(sample)) {
        throw new Error('AI 上游返回的是 HTML 页面，不是 JSON。请检查 baseUrl 是否应填写 API 地址（通常需要 /v1）。');
      }
      throw new Error('AI 上游返回了非 JSON 响应，请检查 baseUrl 与接口兼容性。');
    }
    if (!resp.ok) {
      throw new Error(
        (data && (data.error && (data.error.message || data.error) || data.message)) ||
          ('HTTP ' + resp.status + ' ' + String(text || '').slice(0, 200))
      );
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenAiCompatible(row, model, messages, systemPrompt, opts) {
  const payloadMessages = [];
  if (systemPrompt) payloadMessages.push({ role: 'system', content: systemPrompt });
  payloadMessages.push(...messages);
  const data = await doJsonRequest(
    joinUrl(ensureVersionedBaseUrl(row.config.baseUrl || 'https://api.openai.com/v1'), 'chat/completions'),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + row.config.apiKey,
      },
      body: JSON.stringify({
        model,
        messages: payloadMessages,
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
      }),
    },
    opts.timeoutMs
  );
  const content =
    data &&
    data.choices &&
    data.choices[0] &&
    data.choices[0].message
      ? data.choices[0].message.content
      : '';
  const text = Array.isArray(content)
    ? content
        .map((part) => {
          if (part && typeof part === 'object' && part.text) return String(part.text);
          return typeof part === 'string' ? part : '';
        })
        .filter(Boolean)
        .join('\n')
        .trim()
    : String(content || '').trim();
  if (!text) {
    throw new Error('AI 上游已响应，但未返回文本内容。请检查当前模型是否兼容 chat/completions 接口。');
  }
  return text;
}

function extractResponsesText(data) {
  if (!data || typeof data !== 'object') return '';
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }
  const output = Array.isArray(data.output) ? data.output : [];
  const parts = [];
  output.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const content = Array.isArray(item.content) ? item.content : [];
    content.forEach((part) => {
      if (!part || typeof part !== 'object') return;
      if (typeof part.text === 'string' && part.text.trim()) parts.push(part.text.trim());
    });
  });
  return parts.join('\n').trim();
}

async function callOpenAiNative(row, model, messages, systemPrompt, opts) {
  const mergedInput = [];
  if (systemPrompt) mergedInput.push(systemPrompt);
  messages.forEach((item) => {
    mergedInput.push((item.role === 'assistant' ? 'Assistant: ' : 'User: ') + item.content);
  });
  const data = await doJsonRequest(
    joinUrl(ensureVersionedBaseUrl(row.config.baseUrl || 'https://api.openai.com/v1'), 'responses'),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + row.config.apiKey,
      },
      body: JSON.stringify({
        model,
        input: mergedInput.join('\n\n'),
        temperature: opts.temperature,
        max_output_tokens: opts.maxTokens,
      }),
    },
    opts.timeoutMs
  );
  const text = extractResponsesText(data);
  if (!text) {
    throw new Error('OpenAI 上游已响应，但未返回文本内容。请检查当前模型或所接入网关是否兼容 Responses API。');
  }
  return text;
}

async function callOpenAiWithFallback(row, model, messages, systemPrompt, opts) {
  try {
    return await callOpenAiCompatible(row, model, messages, systemPrompt, opts);
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    if (/chat\/completions/i.test(msg) || /route/i.test(msg) || /404/.test(msg)) {
      return callOpenAiNative(row, model, messages, systemPrompt, opts);
    }
    throw err;
  }
}

async function callAnthropic(row, model, messages, systemPrompt, opts) {
  const data = await doJsonRequest(
    joinUrl(row.config.baseUrl || 'https://api.anthropic.com', 'v1/messages'),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': row.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        system: systemPrompt || '',
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
        messages,
      }),
    },
    opts.timeoutMs
  );
  const parts = Array.isArray(data && data.content) ? data.content : [];
  const text = parts
    .filter((part) => part && part.type === 'text' && part.text)
    .map((part) => String(part.text))
    .join('\n')
    .trim();
  if (!text) throw new Error('Anthropic 未返回有效文本');
  return text;
}

function toGeminiContents(messages) {
  return messages.map((item) => ({
    role: item.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: item.content }],
  }));
}

async function callGemini(row, model, messages, systemPrompt, opts) {
  const baseUrl = row.config.baseUrl || 'https://generativelanguage.googleapis.com';
  const query = '?key=' + encodeURIComponent(row.config.apiKey);
  const data = await doJsonRequest(
    joinUrl(baseUrl, 'v1beta/models/' + encodeURIComponent(model) + ':generateContent') + query,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
        contents: toGeminiContents(messages),
        generationConfig: {
          temperature: opts.temperature,
          maxOutputTokens: opts.maxTokens,
        },
      }),
    },
    opts.timeoutMs
  );
  const candidates = Array.isArray(data && data.candidates) ? data.candidates : [];
  const parts =
    candidates[0] &&
    candidates[0].content &&
    Array.isArray(candidates[0].content.parts)
      ? candidates[0].content.parts
      : [];
  const text = parts
    .map((part) => String((part && part.text) || '').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
  if (!text) throw new Error('Gemini 未返回有效文本');
  return text;
}

async function runAiChat(settings, input) {
  if (!settings || settings.enabled !== true) {
    throw new Error('AI 功能未启用');
  }
  const row = getProviderRow(settings, input && input.providerId);
  const model = assertProviderReady(row, input && input.model);
  const messages = toTextMessages(input && input.messages);
  if (!messages.length) throw new Error('缺少消息内容');
  const systemPrompt = String((input && input.systemPrompt) || '').trim();
  const opts = {
    temperature:
      input && Number.isFinite(Number(input.temperature)) ? Number(input.temperature) : 0.2,
    maxTokens:
      input && Number.isFinite(Number(input.maxTokens))
        ? Math.max(128, Math.min(4000, Number(input.maxTokens)))
        : 1200,
    timeoutMs:
      input && Number.isFinite(Number(input.timeoutMs))
        ? Math.max(5000, Math.min(60000, Number(input.timeoutMs)))
        : 30000,
  };

  let text = '';
  if (row.config.type === 'openai') {
    text = await callOpenAiWithFallback(row, model, messages, systemPrompt, opts);
  } else if (row.config.type === 'anthropic') {
    text = await callAnthropic(row, model, messages, systemPrompt, opts);
  } else if (row.config.type === 'gemini') {
    text = await callGemini(row, model, messages, systemPrompt, opts);
  } else {
    text = await callOpenAiCompatible(row, model, messages, systemPrompt, opts);
  }
  return {
    providerId: row.id,
    providerLabel: row.config.label || row.id,
    model,
    text,
  };
}

module.exports = {
  runAiChat,
};
