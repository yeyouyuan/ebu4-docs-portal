const { buildSeoSitemapRelPaths, relPathsToAbsoluteUrls, normalizeOrigin } = require('./seo-sitemap');

function truncateText(value, maxLen) {
  const text = value == null ? '' : String(value);
  if (!maxLen || text.length <= maxLen) return text;
  return text.slice(0, maxLen);
}

function buildFallbackOrigin(req) {
  if (!req) return '';
  const protocol = req.protocol || 'http';
  const host = req.get ? req.get('host') : '';
  return host ? `${protocol}://${host}` : '';
}

function isLocalHost(hostname) {
  const h = String(hostname || '').trim().toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

function ensurePublicCanonicalBase(rawBase, req) {
  const base = normalizeOrigin(rawBase, buildFallbackOrigin(req));
  if (!base) {
    throw new Error('主动推送需要填写 canonicalBase（生产环境公开地址）');
  }
  let u;
  try {
    u = new URL(base);
  } catch (_) {
    throw new Error('canonicalBase 不是合法的 http(s) 地址');
  }
  if ((u.protocol !== 'http:' && u.protocol !== 'https:') || !u.hostname) {
    throw new Error('canonicalBase 不是合法的 http(s) 地址');
  }
  if (isLocalHost(u.hostname)) {
    throw new Error('主动推送不能使用 localhost，请填写公网可访问的 canonicalBase');
  }
  return base;
}

async function buildPushContext({ req, seo, siteDatabase, extraPagesRepo, extraPagesStore }) {
  const origin = ensurePublicCanonicalBase(seo && seo.canonicalBase, req);
  const relPaths = await buildSeoSitemapRelPaths({
    seo,
    siteDatabase,
    extraPagesRepo,
    extraPagesStore,
  });
  const urls = relPathsToAbsoluteUrls(origin, relPaths);
  return {
    origin,
    relPaths,
    urls,
    sitemapUrl: origin + '/sitemap.xml',
  };
}

function chunkArray(items, size) {
  const out = [];
  const arr = Array.isArray(items) ? items : [];
  const chunkSize = Math.max(1, parseInt(size, 10) || 100);
  for (let i = 0; i < arr.length; i += chunkSize) {
    out.push(arr.slice(i, i + chunkSize));
  }
  return out;
}

async function requestWithTimeout(url, options) {
  const timeoutMs = Math.max(2000, parseInt(options && options.timeoutMs, 10) || 15000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      url,
      Object.assign({}, options || {}, {
        signal: controller.signal,
      })
    );
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {}
    return {
      ok: res.ok,
      status: res.status,
      text: truncateText(text, 4000),
      data,
      headers: res.headers,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      text: '',
      data: null,
      errorMessage: String(e && e.message ? e.message : e),
    };
  } finally {
    clearTimeout(timer);
  }
}

function buildResult(input) {
  const ok = input.status === 'skipped' ? false : !!input.ok;
  return {
    status: input.status || (ok ? 'ok' : 'error'),
    engine: input.engine,
    action: input.action,
    targetType: input.targetType,
    target: input.target,
    requestTarget: input.requestTarget || '',
    requestSummary: input.requestSummary || '',
    urlCount: Math.max(0, parseInt(input.urlCount, 10) || 0),
    ok,
    httpStatus: Math.max(0, parseInt(input.httpStatus, 10) || 0),
    responseExcerpt: truncateText(input.responseExcerpt, 4000),
    errorMessage: truncateText(input.errorMessage, 1000),
  };
}

async function pushGoogle(seo, ctx) {
  const submission = (seo && seo.submission && seo.submission.google) || {};
  const property = String(submission.property || '').trim();
  const accessToken = String(submission.accessToken || '').trim();
  if (!property || !accessToken) {
    return [
      buildResult({
        status: 'skipped',
        engine: 'google',
        action: 'submit_sitemap',
        targetType: 'sitemap',
        target: ctx.sitemapUrl,
        requestSummary: '未配置 Google Search Console property 或 access token',
      }),
    ];
  }
  const endpoint =
    'https://www.googleapis.com/webmasters/v3/sites/' +
    encodeURIComponent(property) +
    '/sitemaps/' +
    encodeURIComponent(ctx.sitemapUrl);
  const response = await requestWithTimeout(endpoint, {
    method: 'PUT',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      Accept: 'application/json',
    },
    timeoutMs: 15000,
  });
  return [
    buildResult({
      engine: 'google',
      action: 'submit_sitemap',
      targetType: 'sitemap',
      target: ctx.sitemapUrl,
      requestTarget:
        'https://www.googleapis.com/webmasters/v3/sites/{property}/sitemaps/{sitemap}',
      requestSummary: '向 Google Search Console 提交 sitemap',
      urlCount: 1,
      ok: response.ok,
      httpStatus: response.status,
      responseExcerpt: response.text,
      errorMessage: response.ok ? '' : response.errorMessage || response.text || '请求失败',
    }),
  ];
}

async function pushBing(seo, ctx) {
  const submission = (seo && seo.submission && seo.submission.bing) || {};
  const siteUrl = String(submission.siteUrl || '').trim();
  const apiKey = String(submission.apiKey || '').trim();
  if (!siteUrl || !apiKey) {
    return [
      buildResult({
        status: 'skipped',
        engine: 'bing',
        action: 'submit',
        targetType: 'engine',
        target: siteUrl || ctx.origin,
        requestSummary: '未配置 Bing siteUrl 或 API key',
      }),
    ];
  }

  const out = [];
  if (submission.submitSitemap !== false) {
    const endpoint =
      'https://ssl.bing.com/webmaster/api.svc/json/SubmitSiteMap?apikey=' +
      encodeURIComponent(apiKey) +
      '&siteUrl=' +
      encodeURIComponent(siteUrl) +
      '&siteMap=' +
      encodeURIComponent(ctx.sitemapUrl);
    const response = await requestWithTimeout(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      timeoutMs: 15000,
    });
    out.push(
      buildResult({
        engine: 'bing',
        action: 'submit_sitemap',
        targetType: 'sitemap',
        target: ctx.sitemapUrl,
        requestTarget:
          'https://ssl.bing.com/webmaster/api.svc/json/SubmitSiteMap?siteUrl={siteUrl}&siteMap={sitemap}',
        requestSummary: '向 Bing Webmaster 提交 sitemap',
        urlCount: 1,
        ok: response.ok,
        httpStatus: response.status,
        responseExcerpt: response.text,
        errorMessage: response.ok ? '' : response.errorMessage || response.text || '请求失败',
      })
    );
  }

  if (submission.submitUrlBatch !== false) {
    const chunks = chunkArray(ctx.urls, 500);
    for (let i = 0; i < chunks.length; i += 1) {
      const batch = chunks[i];
      if (!batch.length) continue;
      const endpoint =
        'https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlbatch?apikey=' +
        encodeURIComponent(apiKey);
      const response = await requestWithTimeout(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          siteUrl,
          urlList: batch,
        }),
        timeoutMs: 20000,
      });
      out.push(
        buildResult({
          engine: 'bing',
          action: 'submit_url_batch',
          targetType: 'url_batch',
          target: siteUrl,
          requestTarget:
            'https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlbatch',
          requestSummary:
            '向 Bing Webmaster 提交 URL 批次 ' + (i + 1) + '/' + chunks.length,
          urlCount: batch.length,
          ok: response.ok,
          httpStatus: response.status,
          responseExcerpt: response.text,
          errorMessage: response.ok ? '' : response.errorMessage || response.text || '请求失败',
        })
      );
    }
  }

  return out;
}

async function pushBaidu(seo, ctx) {
  const submission = (seo && seo.submission && seo.submission.baidu) || {};
  const site = String(submission.site || '').trim();
  const token = String(submission.token || '').trim();
  const type = String(submission.type || '').trim();
  if (!site || !token) {
    return [
      buildResult({
        status: 'skipped',
        engine: 'baidu',
        action: 'active_push',
        targetType: 'url_batch',
        target: site || ctx.origin,
        requestSummary: '未配置百度站点 site 或 token',
      }),
    ];
  }
  const out = [];
  const chunks = chunkArray(ctx.urls, 500);
  for (let i = 0; i < chunks.length; i += 1) {
    const batch = chunks[i];
    if (!batch.length) continue;
    let endpoint =
      'http://data.zz.baidu.com/urls?site=' +
      encodeURIComponent(site) +
      '&token=' +
      encodeURIComponent(token);
    if (type) endpoint += '&type=' + encodeURIComponent(type);
    const response = await requestWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        Accept: 'application/json,text/plain;q=0.9,*/*;q=0.8',
      },
      body: batch.join('\n'),
      timeoutMs: 20000,
    });
    const data = response.data && typeof response.data === 'object' ? response.data : null;
    const knownError =
      data && (data.error || data.message || data.not_same_site || data.site_error);
    const ok = response.ok && !knownError;
    out.push(
      buildResult({
        engine: 'baidu',
        action: 'active_push',
        targetType: 'url_batch',
        target: site,
        requestTarget:
          'http://data.zz.baidu.com/urls?site={site}&type={type}',
        requestSummary:
          '向百度主动推送 URL 批次 ' + (i + 1) + '/' + chunks.length,
        urlCount: batch.length,
        ok,
        httpStatus: response.status,
        responseExcerpt: response.text,
        errorMessage: ok
          ? ''
          : truncateText(
              response.errorMessage || (knownError != null ? String(knownError) : response.text || '请求失败'),
              1000
            ),
      })
    );
  }
  return out;
}

async function runSeoPush({ req, seo, siteDatabase, extraPagesRepo, extraPagesStore, engines }) {
  const wanted = Array.isArray(engines) ? engines.map((x) => String(x || '').trim()) : [];
  const uniqueEngines = Array.from(
    new Set(
      wanted.filter(function (x) {
        return x === 'google' || x === 'bing' || x === 'baidu';
      })
    )
  );
  const targets = uniqueEngines.length ? uniqueEngines : ['google', 'bing', 'baidu'];
  const ctx = await buildPushContext({
    req,
    seo,
    siteDatabase,
    extraPagesRepo,
    extraPagesStore,
  });
  const results = [];
  for (const engine of targets) {
    if (engine === 'google') {
      results.push(...(await pushGoogle(seo, ctx)));
    } else if (engine === 'bing') {
      results.push(...(await pushBing(seo, ctx)));
    } else if (engine === 'baidu') {
      results.push(...(await pushBaidu(seo, ctx)));
    }
  }
  return {
    context: ctx,
    results,
  };
}

module.exports = {
  buildPushContext,
  runSeoPush,
};
