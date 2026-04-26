const { normalizeOrigin } = require('./seo-sitemap');

const ALLOWED_ENGINES = new Set(['google', 'bing', 'baidu']);

function isValidHttpUrl(raw) {
  if (!raw) return false;
  try {
    const url = new URL(String(raw));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function isLocalHost(hostname) {
  const h = String(hostname || '').trim().toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

function validateSeoConfig(seo) {
  const cfg = seo && typeof seo === 'object' ? seo : {};
  const detail = [];
  const canonicalBase = String(cfg.canonicalBase || '').trim();
  if (canonicalBase) {
    if (!isValidHttpUrl(canonicalBase)) {
      detail.push({ field: 'canonicalBase', message: 'canonicalBase 必须是合法的 http(s) 地址' });
    } else {
      const url = new URL(canonicalBase);
      if (isLocalHost(url.hostname)) {
        detail.push({ field: 'canonicalBase', message: 'canonicalBase 不能使用 localhost' });
      }
    }
  }

  const verification = cfg.verification && typeof cfg.verification === 'object' ? cfg.verification : {};
  if (verification.googleFileToken && !/^[a-z0-9._-]+(\.html)?$/i.test(String(verification.googleFileToken))) {
    detail.push({ field: 'verification.googleFileToken', message: 'Google 验证文件名格式无效' });
  }
  if (
    verification.baiduFileName &&
    (/[/\\]/.test(String(verification.baiduFileName)) || String(verification.baiduFileName).includes('..'))
  ) {
    detail.push({ field: 'verification.baiduFileName', message: '百度验证文件名不能包含路径' });
  }

  const submission = cfg.submission && typeof cfg.submission === 'object' ? cfg.submission : {};
  if (submission.bing && submission.bing.siteUrl && !isValidHttpUrl(submission.bing.siteUrl)) {
    detail.push({ field: 'submission.bing.siteUrl', message: 'Bing siteUrl 必须是合法的 http(s) 地址' });
  }
  if (submission.baidu && submission.baidu.site && !isValidHttpUrl(submission.baidu.site)) {
    detail.push({ field: 'submission.baidu.site', message: '百度 site 必须是合法的 http(s) 地址' });
  }

  return {
    ok: detail.length === 0,
    detail,
  };
}

function validateSeoPushRequest(body, seo, context) {
  const payload = body && typeof body === 'object' ? body : {};
  const detail = [];
  const engines = Array.isArray(payload.engines) && payload.engines.length
    ? payload.engines.map((item) => String(item || '').trim()).filter(Boolean)
    : ['google', 'bing', 'baidu'];
  const invalidEngines = engines.filter((engine) => !ALLOWED_ENGINES.has(engine));
  if (invalidEngines.length) {
    detail.push({ field: 'engines', message: '存在不支持的推送引擎：' + invalidEngines.join(', ') });
  }

  const origin = normalizeOrigin(seo && seo.canonicalBase, '');
  if (!origin) {
    detail.push({ field: 'canonicalBase', message: '主动推送前必须配置 canonicalBase' });
  }

  const urls = context && Array.isArray(context.urls) ? context.urls.filter(Boolean) : [];
  if (!urls.length) {
    detail.push({ field: 'urls', message: '当前没有可推送的公开 URL' });
  }
  const seen = new Set();
  const duplicates = [];
  urls.forEach((url) => {
    if (seen.has(url)) duplicates.push(url);
    else seen.add(url);
  });
  if (duplicates.length) {
    detail.push({ field: 'urls', message: '推送 URL 存在重复项' });
  }

  return {
    ok: detail.length === 0,
    detail,
    engines,
  };
}

module.exports = {
  validateSeoConfig,
  validateSeoPushRequest,
};
