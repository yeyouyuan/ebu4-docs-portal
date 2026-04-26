function joinUrl(baseUrl, path) {
  const root = String(baseUrl || '').replace(/\/+$/, '');
  const tail = String(path || '').replace(/^\/+/, '');
  return root + '/' + tail;
}

async function runSearxngSearch(settings, query) {
  const baseUrl = String(settings.baseUrl || '').trim().replace(/\/+$/, '');
  if (!baseUrl) throw new Error('未配置联网搜索地址');
  const url = new URL(joinUrl(baseUrl, 'search'));
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('safesearch', settings.safeSearch === 'off' ? '0' : settings.safeSearch === 'strict' ? '2' : '1');
  if (settings.apiKey) {
    url.searchParams.set('apikey', settings.apiKey);
  }
  const resp = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  const text = await resp.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {}
  if (!resp.ok) {
    throw new Error((data && (data.error || data.message)) || '联网搜索失败');
  }
  const list = Array.isArray(data && data.results) ? data.results : [];
  return list.slice(0, Math.max(1, Math.min(10, settings.maxResults || 5))).map((item) => ({
    title: String((item && item.title) || '').trim(),
    url: String((item && item.url) || '').trim(),
    snippet: String((item && (item.content || item.snippet)) || '').trim(),
    sourceLabel: '外部搜索 / ' + String((item && item.engine) || 'web').trim(),
  }));
}

async function runWebSearch(settings, query) {
  if (!settings || settings.enabled !== true) return [];
  return runSearxngSearch(settings, query);
}

module.exports = {
  runWebSearch,
};
