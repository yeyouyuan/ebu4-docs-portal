const http = require('http');
const https = require('https');
const { URL } = require('url');

function fmtDate(value) {
  return value.toISOString().slice(0, 10);
}

function normalizeBaseUrl(raw) {
  const src = String(raw || '').trim() || 'https://www.e-cology.com.cn';
  let u;
  try {
    u = new URL(src);
  } catch (_) {
    throw new Error('base 不是合法 URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('base 仅支持 http(s)');
  }
  return u.toString().replace(/\/+$/, '');
}

function calcRange(opts) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (opts.range === 'this-week') {
    const dow = today.getDay() || 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - dow + 1);
    return { from: fmtDate(monday), to: fmtDate(today) };
  }
  if (opts.range === 'last-week') {
    const dow = today.getDay() || 7;
    const thisMonday = new Date(today);
    thisMonday.setDate(today.getDate() - dow + 1);
    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(thisMonday.getDate() - 7);
    const lastSunday = new Date(thisMonday);
    lastSunday.setDate(thisMonday.getDate() - 1);
    return { from: fmtDate(lastMonday), to: fmtDate(lastSunday) };
  }
  if (opts.range === 'last-days' && opts.lastDays && opts.lastDays > 0) {
    const start = new Date(today);
    start.setDate(today.getDate() - opts.lastDays + 1);
    return { from: fmtDate(start), to: fmtDate(today) };
  }
  if (opts.from || opts.to) {
    return {
      from: opts.from || null,
      to: opts.to || null,
    };
  }
  if (opts.lastDays && opts.lastDays > 0) {
    const start = new Date(today);
    start.setDate(today.getDate() - opts.lastDays + 1);
    return { from: fmtDate(start), to: fmtDate(today) };
  }
  return {
    from: opts.from || null,
    to: opts.to || null,
  };
}

function stripHtml(html) {
  return String(html || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '  • ')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function tsToDate(ts) {
  try {
    return new Date(ts).toISOString().slice(0, 10);
  } catch (_) {
    return '';
  }
}

function requestJson(url, { method = 'GET', headers = {}, body, timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (_) {
      reject(new Error('无效 URL'));
      return;
    }
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method,
        timeout: timeoutMs,
        headers: Object.assign(
          {
            Accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
            'User-Agent': 'EBU4-BlogFetcher/1.0',
          },
          headers || {}
        ),
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          let data = null;
          try {
            data = raw ? JSON.parse(raw) : null;
          } catch (_) {}
          resolve({
            status: res.statusCode || 0,
            headers: res.headers || {},
            raw,
            data,
          });
        });
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error('请求超时'));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getCurrentUserId(base, cookie) {
  const res = await requestJson(`${base}/api/blog/prior/findCurBlogForm?timezoneOffset=-8`, {
    headers: { Cookie: cookie },
  });
  if (res.status !== 200) {
    throw new Error(`获取用户 ID 失败：HTTP ${res.status}`);
  }
  const data = res.data;
  if (!data || typeof data !== 'object') {
    throw new Error(`获取用户 ID 响应异常：${String(res.raw || '').slice(0, 200)}`);
  }
  return data.userId || (data.user && data.user.id) || '';
}

async function fetchBlogPage(base, cookie, userId, pageNo, pageSize) {
  const body = JSON.stringify({ userId, pageNo, pageSize });
  const res = await requestJson(`${base}/api/blog/query/blogs`, {
    method: 'POST',
    headers: {
      Cookie: cookie,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
    body,
    timeoutMs: 20000,
  });
  if (res.status !== 200) {
    throw new Error(`抓取日报失败：HTTP ${res.status} ${String(res.raw || '').slice(0, 200)}`);
  }
  if (!res.data || typeof res.data !== 'object') {
    throw new Error(`响应非 JSON：${String(res.raw || '').slice(0, 200)}`);
  }
  return res.data;
}

function formatBlogsText(list) {
  const lines = [];
  lines.push('═══════════════════════════════════════════════');
  lines.push(`  日报抓取结果  共 ${list.length} 条`);
  lines.push('═══════════════════════════════════════════════\n');
  for (const item of list) {
    lines.push(`──── ${item.date} ────`);
    lines.push(`作者: ${item.user}  部门: ${item.department}`);
    lines.push('');
    lines.push(item.content);
    lines.push('');
  }
  return lines.join('\n');
}

function summarizeBlogs(list) {
  const users = new Set();
  const departments = new Set();
  let firstDate = '';
  let lastDate = '';
  for (const item of list) {
    if (item.user) users.add(item.user);
    if (item.department) departments.add(item.department);
    if (!firstDate || item.date < firstDate) firstDate = item.date;
    if (!lastDate || item.date > lastDate) lastDate = item.date;
  }
  return {
    total: list.length,
    users: users.size,
    departments: departments.size,
    firstDate: firstDate || '',
    lastDate: lastDate || '',
  };
}

async function fetchBlogsReport(input) {
  const opts = input && typeof input === 'object' ? input : {};
  const cookie = String(opts.cookie || '').trim();
  if (!cookie) throw new Error('请填写 Cookie');
  const base = normalizeBaseUrl(opts.base);
  const pages = Math.min(30, Math.max(1, parseInt(opts.pages, 10) || 5));
  const pageSize = 10;
  const range = calcRange({
    range: String(opts.range || '').trim(),
    from: opts.from ? String(opts.from).trim() : '',
    to: opts.to ? String(opts.to).trim() : '',
    lastDays: Math.min(365, Math.max(0, parseInt(opts.lastDays, 10) || 0)),
  });
  const fromDate = range.from ? new Date(range.from).getTime() : null;
  const toDate = range.to ? new Date(range.to).getTime() + 86400000 : null;

  let userId = opts.userId != null ? String(opts.userId).trim() : '';
  if (!userId) {
    userId = String(await getCurrentUserId(base, cookie) || '').trim();
  }
  if (!userId) throw new Error('无法获取当前用户 ID，请手动填写 userId');

  const allBlogs = [];
  for (let page = 1; page <= pages; page += 1) {
    const data = await fetchBlogPage(base, cookie, userId, page, pageSize);
    const list = Array.isArray(data.blogList) ? data.blogList : [];
    if (!list.length) break;

    for (const item of list) {
      const ts = Number(item && item.date);
      if (fromDate && ts < fromDate) continue;
      if (toDate && ts > toDate) continue;
      allBlogs.push({
        date: tsToDate(ts),
        timestamp: ts,
        user: item && item.user && item.user.name ? String(item.user.name) : '',
        department:
          item && item.user && item.user.department && item.user.department.name
            ? String(item.user.department.name)
            : '',
        content: stripHtml(item && item.blog && item.blog.content ? item.blog.content : ''),
        blogId: item && item.blog && item.blog.id ? String(item.blog.id) : '',
      });
    }

    const lastTs = Number(list[list.length - 1] && list[list.length - 1].date);
    if (fromDate && lastTs && lastTs < fromDate) break;
    if (list.length < pageSize) break;
  }

  return {
    base,
    userId,
    pages,
    range,
    stats: summarizeBlogs(allBlogs),
    blogs: allBlogs,
    textOutput: formatBlogsText(allBlogs),
  };
}

module.exports = {
  fetchBlogsReport,
};
