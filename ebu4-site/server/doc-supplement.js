/**
 * 文档站公开「补充资料」提交：追加写入 JSON Lines，按 IP 简单限流。
 */
const fs = require('fs');
const path = require('path');

const RATE_WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 60;
const rateMap = new Map();

function getClientIp(req) {
  const x = req.headers['x-forwarded-for'];
  if (typeof x === 'string' && x.trim()) {
    return x.split(',')[0].trim();
  }
  return req.ip || (req.socket && req.socket.remoteAddress) || '';
}

function allowRate(ip) {
  const now = Date.now();
  const key = ip || 'unknown';
  let r = rateMap.get(key);
  if (!r || now > r.resetAt) {
    r = { n: 0, resetAt: now + RATE_WINDOW_MS };
    rateMap.set(key, r);
  }
  if (r.n >= MAX_PER_WINDOW) return false;
  r.n += 1;
  return true;
}

function appendLine(req, payload) {
  const dir = path.join(__dirname, '..', 'logs');
  const file = path.join(dir, 'doc-supplement.jsonl');
  fs.mkdirSync(dir, { recursive: true });
  const line =
    JSON.stringify({
      ts: new Date().toISOString(),
      ip: getClientIp(req),
      requestId: req.requestId,
      ...payload,
    }) + '\n';
  fs.appendFileSync(file, line, 'utf8');
}

function handlePost(req, res) {
  const ip = getClientIp(req);
  if (!allowRate(ip)) {
    return res.status(429).json({ error: '提交过于频繁，请稍后再试' });
  }
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const text = String(b.body || '').trim();
  if (text.length < 5) {
    return res.status(400).json({ error: '补充说明至少 5 个字符' });
  }
  if (text.length > 8000) {
    return res.status(400).json({ error: '补充说明过长（最多 8000 字）' });
  }
  const contact = String(b.contact || '').trim().slice(0, 200);
  const context = String(b.context || '').trim().slice(0, 2000);
  const pageTitle = String(b.pageTitle || '').trim().slice(0, 300);
  const sectionSlug = String(b.sectionSlug || '').trim().slice(0, 200);
  const docSlug = String(b.docSlug || '').trim().slice(0, 120);

  appendLine(req, {
    body: text,
    contact: contact || undefined,
    context: context || undefined,
    pageTitle: pageTitle || undefined,
    sectionSlug: sectionSlug || undefined,
    docSlug: docSlug || undefined,
  });
  res.json({ ok: true });
}

module.exports = { handlePost };
