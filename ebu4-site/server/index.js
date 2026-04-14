const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const fs = require('fs');
const crypto = require('crypto');
const { log } = require('./logger');
const { registerAdminRoutes } = require('./admin-routes');
const adminUsersService = require('./admin-users-service');
const passkeyStore = require('./passkey-store');
const { parseSectionsFromRaw } = require('./doc-md');
const extraPagesStore = require('./extra-pages-store');
const extraPagesRepo = require('./extra-pages-repo');
const siteDatabase = require('./site-database');
const { extraPageSearchableText } = require('./lib/extra-page-search-text');
const siteSession = require('./site-session');
const { canReadContent, normalizeLevel } = require('./security-levels');
const inviteStore = require('./invite-store');
const presenceStore = require('./presence-store');
const redisCache = require('./redis-cache');
const { normalizeSiteSettings } = require('./lib/site-settings-normalize');
const { startUpgradeScheduler } = require('./upgrade-scheduler');
const { injectBeforeBodyClose } = require('./lib/site-embed');
const { migrateDefaultEmbedAi } = require('./lib/migrate-default-embed');

const app = express();
const PORT = process.env.PORT || 3000;

function readAppPackageMeta() {
  try {
    const p = path.join(__dirname, '..', 'package.json');
    const j = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return {
      name: j.name != null ? String(j.name).trim() : '',
      version: j.version != null ? String(j.version).trim() : '',
    };
  } catch (_) {
    return { name: '', version: '' };
  }
}

/** 反向代理（Nginx 等）后需开启，以便 req.ip / req.secure / X-Forwarded-Proto 正确 */
if (process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

app.use(express.json({ limit: '50mb' }));

/** 请求关联 ID（响应头 X-Request-ID）；可接受网关传入的合法 X-Request-ID */
app.use((req, res, next) => {
  const raw = req.headers['x-request-id'];
  let requestId;
  if (
    typeof raw === 'string' &&
    /^[a-zA-Z0-9._-]{8,128}$/.test(raw.trim())
  ) {
    requestId = raw.trim();
  } else {
    requestId = crypto.randomBytes(8).toString('hex');
  }
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
});

/** 管理端与后台 API 的基础安全响应头 */
app.use((req, res, next) => {
  const p = req.path || '';
  if (p.startsWith('/admin') || p.startsWith('/api/admin')) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  }
  next();
});

/** 管理 API 写操作访问日志（与审计分离，便于 ELK 按 requestId 串联） */
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/admin')) return next();
  const start = Date.now();
  res.on('finish', () => {
    if (process.env.LOG_ADMIN_ACCESS !== '1' && process.env.LOG_ADMIN_ACCESS !== 'true') {
      return;
    }
    const m = req.method;
    if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return;
    log('info', {
      type: 'admin.access',
      msg: 'admin.access',
      method: m,
      path: req.originalUrl || req.url,
      status: res.statusCode,
      ms: Date.now() - start,
      requestId: req.requestId,
    });
  });
  next();
});

// --- Parse markdown into sections ---
const MD_PATH = path.join(__dirname, '..', '..', 'ebu4-docs.md');
const IMG_DIR = path.join(__dirname, '..', '..', 'ebu4-docs-img');
const publicDir = path.join(__dirname, '..', 'public');
/** 文档站壳页面，缺失会导致 /docs 与兜底路由崩溃 */
const REQUIRED_PUBLIC_HTML = ['docs.html', 'landing.html', 'extra-page.html'];
const TOOLS_JSON_PATH = path.join(publicDir, 'data', 'tools-nav.json');
const LANDING_JSON_PATH = path.join(publicDir, 'data', 'landing.json');
const SEO_JSON_PATH = path.join(publicDir, 'data', 'seo.json');
const EXTRA_PAGES_PATH = path.join(publicDir, 'data', 'extra-pages.json');

function getCookieFromHeader(req, name) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  const parts = raw.split(';');
  for (const p of parts) {
    const s = p.trim();
    const i = s.indexOf('=');
    if (i === -1) continue;
    const k = s.slice(0, i);
    if (k !== name) continue;
    return decodeURIComponent(s.slice(i + 1));
  }
  return null;
}

function escapeHtmlMaintenance(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function readSiteSettingsSafe() {
  try {
    if (siteDatabase.isSiteSqlite()) {
      const raw = siteDatabase.getKv('site_settings');
      if (raw) {
        const j = JSON.parse(raw);
        if (j && typeof j === 'object') return normalizeSiteSettings(j);
      }
    } else {
      const fp = path.join(publicDir, 'data', 'site-settings.json');
      if (fs.existsSync(fp)) {
        const j = JSON.parse(fs.readFileSync(fp, 'utf-8'));
        if (j && typeof j === 'object') return normalizeSiteSettings(j);
      }
    }
  } catch (_) {}
  return normalizeSiteSettings(null);
}

function getAiChatEmbedHtml() {
  const st = readSiteSettingsSafe();
  const e = st.embed && typeof st.embed === 'object' ? st.embed : {};
  return e.aiChatHtml != null ? String(e.aiChatHtml) : '';
}

function isHomepageEnabled() {
  const st = readSiteSettingsSafe();
  return !st || !st.homepage || st.homepage.enabled !== false;
}

function sendPublicHtmlWithEmbed(res, fileName) {
  const fp = path.join(publicDir, fileName);
  let html;
  try {
    html = fs.readFileSync(fp, 'utf-8');
  } catch (e) {
    log('error', {
      type: 'missing_public_html',
      path: fp,
      err: String(e && e.message ? e.message : e),
    });
    res
      .status(500)
      .type('text/plain; charset=utf-8')
      .send(
        '服务器缺少静态页面文件（' +
          fileName +
          '）。请确认部署含 ebu4-site/public 目录；Docker 请在 ebu4-site 下构建镜像，且不要将空目录挂载到 /app/public（数据目录请仅挂载 /app/data）。'
      );
    return;
  }
  html = injectBeforeBodyClose(html, getAiChatEmbedHtml());
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}

function assertRequiredPublicHtmlPresent() {
  const missing = REQUIRED_PUBLIC_HTML.filter((name) => !fs.existsSync(path.join(publicDir, name)));
  if (missing.length === 0) return;
  console.error(
    '[fatal] public 目录缺少必需页面: ' +
      missing.join(', ') +
      '\n  目录: ' +
      publicDir +
      '\n  处理：1) 部署包/镜像须含完整 public/（含 docs.html 等）；' +
      '2) Docker 构建上下文必须是 ebu4-site：cd ebu4-site && docker build -t ebu4-docs .；' +
      '3) 运行时不要将空目录挂到 /app/public，仅挂载数据：-v ./data:/app/data'
  );
  process.exit(1);
}

const MAINTENANCE_TEMPLATE = path.join(__dirname, 'views', 'maintenance.html');

function renderMaintenanceHtml(msg) {
  const raw = fs.readFileSync(MAINTENANCE_TEMPLATE, 'utf8');
  const safe = escapeHtmlMaintenance(msg).replace(/\r\n/g, '\n').replace(/\n/g, '<br>');
  return raw.replace(/\{\{MESSAGE\}\}/g, safe);
}

/** 门户风格维护页（模板在 server/views，避免被 static 直接暴露未替换占位符） */
app.get(['/maintenance', '/maintenance/'], (req, res) => {
  const settings = readSiteSettingsSafe();
  const m = settings.maintenance;
  if (!m || !m.enabled) {
    return res.redirect(302, '/index');
  }
  const msg = (m.message && String(m.message).trim()) || '站点维护中，请稍后再试。';
  try {
    const html = renderMaintenanceHtml(msg);
    res
      .status(503)
      .type('html; charset=utf-8')
      .setHeader('Retry-After', '3600')
      .setHeader('Cache-Control', 'no-store')
      .send(html);
  } catch (e) {
    res
      .status(503)
      .type('html; charset=utf-8')
      .setHeader('Cache-Control', 'no-store')
      .send(
        `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>维护中</title></head><body style="font-family:system-ui,sans-serif;padding:2rem;"><p>${escapeHtmlMaintenance(
          msg
        )}</p></body></html>`
      );
  }
});

/**
 * 维护模式：
 * - fullSite !== true（默认）：仅拦截门户 `/`、`/index`，文档与公开 API 仍可访问。
 * - fullSite === true：全站拦截（除 health、admin、sw、维护页本身）。
 * 浏览器导航类请求 302 至 `/maintenance`；API 返回 JSON 503。
 */
app.use((req, res, next) => {
  const p = req.path || '';
  if (p.startsWith('/api/health')) return next();
  if (p.startsWith('/api/admin')) return next();
  if (p.startsWith('/admin')) return next();
  if (p === '/sw.js') return next();
  if (p === '/maintenance' || p.startsWith('/maintenance/')) return next();
  if (p === '/register' || p.startsWith('/register/')) return next();

  const settings = readSiteSettingsSafe();
  const m = settings.maintenance;
  if (!m || !m.enabled) return next();

  const fullSite = m.fullSite === true;
  let block = false;
  if (!fullSite) {
    block = p === '/' || p === '/index' || p.startsWith('/index/');
  } else {
    block = true;
  }
  if (!block) return next();

  const msg = (m.message && String(m.message).trim()) || '站点维护中，请稍后再试。';

  if (p.startsWith('/api/')) {
    return res.status(503).json({ error: 'maintenance', message: msg });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(503).json({ error: 'maintenance', message: msg });
  }

  // 浏览器/爬虫的 Accept 差异很大；门户拦截统一 302，避免仅部分客户端能跳转
  return res.redirect(302, '/maintenance');
});

const visitStats = require('./visit-stats');
const VISIT_STATS_PATH = path.join(publicDir, 'data', 'visit-stats.json');
app.use(visitStats.createMiddleware(siteDatabase, VISIT_STATS_PATH));

function readSeoJsonSafe() {
  if (siteDatabase.isSiteSqlite()) {
    const raw = siteDatabase.getKv('seo');
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch (_) {
        return null;
      }
    }
  }
  try {
    const raw = fs.readFileSync(SEO_JSON_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD || 'ebu4-admin-dev';
}

if (!process.env.ADMIN_PASSWORD) {
  const isProd =
    process.env.NODE_ENV === 'production' || process.env.EBU4_STRICT_PRODUCTION === '1';
  if (!isProd) {
    console.warn(
      '[admin] 未设置环境变量 ADMIN_PASSWORD，当前使用默认开发密码；生产环境请务必设置强密码。'
    );
  }
}

function readMainMarkdownRaw() {
  if (siteDatabase.isSiteSqlite()) {
    const c = siteDatabase.getMainMarkdown();
    if (c != null && c !== '') return c;
  }
  if (fs.existsSync(MD_PATH)) {
    return fs.readFileSync(MD_PATH, 'utf-8');
  }
  return '';
}

function parseSections() {
  return parseSectionsForSlug(siteDatabase.getDefaultMainDocSlug());
}

function buildSearchIndex(sectionArr) {
  return sectionArr.map((s) => ({
    id: s.id,
    title: s.title,
    slug: s.slug,
    text: s.content.replace(/[#*`\[\]()]/g, ' ').toLowerCase(),
    securityLevel: normalizeLevel(s.securityLevel),
  }));
}

let sections = [];
let searchIndex = [];
/** 非默认主文档 slug → 解析后的章节数组（随 reloadDocData 清空） */
let docSectionsCache = new Map();
/** 非默认主文档 slug → 搜索索引（随 reloadDocData 清空） */
let docSearchIndexCache = new Map();

function resolvePublicDocSlug(q) {
  const trimmed = q == null ? '' : String(q).trim();
  if (!trimmed) return siteDatabase.getDefaultMainDocSlug();
  const n = siteDatabase.normalizeMainDocSlug(trimmed);
  if (!n) return null;
  const list = siteDatabase.listMainDocuments();
  if (!list.some((d) => d.slug === n)) return null;
  return n;
}

function parseSectionsForSlug(slug) {
  if (siteDatabase.isSiteSqlite()) {
    return siteDatabase.listSectionsForSlug(slug);
  }
  const raw = siteDatabase.getMainMarkdownForSlug(slug);
  if (!raw && slug === siteDatabase.getDefaultMainDocSlug() && fs.existsSync(MD_PATH)) {
    try {
      return parseSectionsFromRaw(fs.readFileSync(MD_PATH, 'utf-8'));
    } catch (_) {
      return parseSectionsFromRaw('');
    }
  }
  return parseSectionsFromRaw(raw || '');
}

function getSectionsForPublic(slug) {
  const def = siteDatabase.getDefaultMainDocSlug();
  const s = slug || def;
  if (s === def) return sections;
  if (!docSectionsCache.has(s)) {
    docSectionsCache.set(s, parseSectionsForSlug(s));
  }
  return docSectionsCache.get(s);
}

function getSearchIndexForPublic(slug) {
  const def = siteDatabase.getDefaultMainDocSlug();
  const s = slug || def;
  if (s === def) return searchIndex;
  if (!docSearchIndexCache.has(s)) {
    docSearchIndexCache.set(s, buildSearchIndex(getSectionsForPublic(s)));
  }
  return docSearchIndexCache.get(s);
}

function reloadDocData() {
  docSectionsCache.clear();
  docSearchIndexCache.clear();
  sections = parseSections();
  searchIndex = buildSearchIndex(sections);
  redisCache.bumpEpoch();
  console.log(`文档已重载：${sections.length} 个章节`);
}

/**
 * 自动生成 sitemap 相对路径：门户根、/index、各主文档下 /docs#…（与前台 hash 路由一致）。
 * 跳过章节索引 0、1（与侧栏「标题 / 目录」一致）。
 */
function buildAutoSitemapRelUrls() {
  const out = [];
  const seen = new Set();
  const add = (rel) => {
    if (typeof rel !== 'string' || !rel.startsWith('/')) return;
    if (seen.has(rel)) return;
    seen.add(rel);
    out.push(rel);
  };

  add('/');
  add('/index');

  let defaultSlug;
  try {
    defaultSlug = siteDatabase.getDefaultMainDocSlug();
  } catch (_) {
    defaultSlug = 'default';
  }

  let docs;
  try {
    docs = siteDatabase.listMainDocuments();
  } catch (_) {
    docs = [];
  }
  if (!docs.length) {
    add('/docs#home');
    return out;
  }

  for (const doc of docs) {
    const slug = doc.slug || defaultSlug;
    let secs;
    try {
      secs = parseSectionsForSlug(slug);
    } catch (_) {
      secs = [];
    }
    const isDef = slug === defaultSlug;
    const base = isDef ? '/docs' : `/docs?doc=${encodeURIComponent(slug)}`;
    add(`${base}#home`);
    for (let i = 2; i < secs.length; i++) {
      const s = secs[i];
      if (!s || !s.slug) continue;
      add(`${base}#${encodeURIComponent(s.slug)}`);
    }
  }
  return out;
}

const ADMIN_BACKUP_KEEP = (function () {
  const n = parseInt(process.env.ADMIN_BACKUP_KEEP || '20', 10);
  if (Number.isFinite(n) && n >= 1 && n <= 200) return n;
  return 20;
})();

registerAdminRoutes(app, {
  MD_PATH,
  IMG_DIR,
  TOOLS_JSON_PATH,
  LANDING_JSON_PATH,
  SEO_JSON_PATH,
  EXTRA_PAGES_PATH,
  backupKeepCount: ADMIN_BACKUP_KEEP,
  reloadDocData,
  getAdminPassword,
  getSectionCount: () => sections.length,
  siteDatabase,
  adminUsersService,
});

/** 前台访客会话（默认 guest clearance）；排除 admin 与 health */
app.use((req, res, next) => {
  const p = req.path || '';
  if (!p.startsWith('/api/')) return next();
  if (p.startsWith('/api/admin') || p === '/api/health') return next();
  siteSession.ensureSiteGuest(req, res);
  next();
});

app.get('/api/site/session', (req, res) => {
  siteSession.ensureSiteGuest(req, res);
  const st = readSiteSettingsSafe();
  const regMode = (st.registration && st.registration.mode) || 'invitation';
  res.json({
    ok: true,
    role: req.siteRole,
    clearance: req.siteClearance,
    registrationMode: regMode,
  });
});

/** 预检邀请码是否仍可用（不消耗次数），供注册页 /register?invite= 跳转无效页 */
app.get('/api/register/invite-status', (req, res) => {
  try {
    const code = String(req.query.code || '').trim();
    if (!code) return res.status(400).json({ error: '缺少参数 code' });
    const r = inviteStore.peekInvite(siteDatabase, code);
    if (r.ok) return res.json({ valid: true });
    return res.json({ valid: false, reason: r.reason });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/** 公开注册：邀请制须有效邀请码；自主注册可不用码（可选填邀请以指定角色） */
app.post('/api/register', (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const username = String(body.username || '').trim();
    const password = body.password != null ? String(body.password) : '';
    const inviteCode = String(body.inviteCode || '').trim();
    if (!username) return res.status(400).json({ error: '需要用户名' });
    if (password.length < 8) return res.status(400).json({ error: '密码至少 8 位' });
    const settings = readSiteSettingsSafe();
    const mode = settings.registration && settings.registration.mode === 'open' ? 'open' : 'invitation';
    let role = 'editor';
    if (mode === 'invitation') {
      if (!inviteCode) return res.status(400).json({ error: '当前为邀请制注册，需要邀请码' });
      const ir = inviteStore.tryConsumeInvite(siteDatabase, inviteCode);
      if (!ir.ok) {
        if (ir.reason === 'exhausted') {
          return res.status(400).json({ error: '该邀请链接名额已用完，请联系管理员' });
        }
        return res.status(400).json({ error: '无效邀请码，请联系管理员' });
      }
      role = ir.defaultRole || 'editor';
    } else {
      if (inviteCode) {
        const ir = inviteStore.tryConsumeInvite(siteDatabase, inviteCode);
        if (!ir.ok) {
          if (ir.reason === 'exhausted') {
            return res.status(400).json({ error: '该邀请链接名额已用完，请联系管理员' });
          }
          return res.status(400).json({ error: '无效邀请码，请联系管理员' });
        }
        role = ir.defaultRole || 'editor';
      }
    }
    const created = adminUsersService.createUser({
      username,
      password,
      role,
    });
    res.json({
      ok: true,
      user: { id: created.id, username: created.username, role: created.role },
    });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

/** 扩展内容公开 API（须在 express.static 与 SPA 兜底之前注册） */
app.get('/api/pages', async (req, res) => {
  try {
    const clearance = req.siteClearance || 'guest';
    const key = `v1:pages:list:${redisCache.getEpoch()}:${clearance}`;
    const hit = await redisCache.getJsonTracked(key);
    if (hit != null) {
      redisCache.cacheHeader(res, true);
      return res.json(hit);
    }
    const store = await extraPagesRepo.readStore();
    const pages = store.pages
      .filter((p) => extraPagesStore.isPublishedForPublic(p))
      .map((p) => {
        const e = extraPagesStore.enrichPage(p);
        return {
          slug: e.slug,
          title: e.title,
          excerpt: e.excerpt,
          cover: e.cover,
          tags: e.tags,
          author: e.author,
          format: e.format,
          linkUrl: e.linkUrl,
          publishedAt: e.publishedAt,
          updatedAt: e.updatedAt,
          securityLevel: e.securityLevel,
        };
      })
      .filter((row) => canReadContent(clearance, row.securityLevel || 'public'))
      .sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));
    const payload = { pages };
    await redisCache.setJsonAfterMiss(key, payload, redisCache.DEFAULT_TTL_SEC);
    redisCache.cacheHeader(res, false);
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/** 公开投稿：提交技术文档（Markdown），待后台审核 */
app.post('/api/doc-submissions', express.json({ limit: '2mb' }), async (req, res) => {
  try {
    if (!siteDatabase.isSiteSqlite()) {
      return res.status(400).json({ error: '当前存储模式未启用投稿能力' });
    }
    const body = req.body || {};
    const targetType = String(body.targetType || '').trim() === 'main' ? 'main' : 'extra';
    const targetDocSlug = String(body.targetDocSlug || '').trim();
    const title = String(body.title || '').trim();
    const fileName = String(body.fileName || '').trim();
    const markdownContent = String(body.markdownContent || '');
    const submitterName = String(body.submitterName || '').trim();
    const submitterContact = String(body.submitterContact || '').trim();
    const tags = Array.isArray(body.tags) ? body.tags : String(body.tags || '').split(',');
    const cleanTags = tags
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .slice(0, 20);
    if (!title) return res.status(400).json({ error: '缺少标题' });
    if (!/\.md$/i.test(fileName)) return res.status(400).json({ error: '仅支持 .md 文件' });
    if (!markdownContent.trim()) return res.status(400).json({ error: 'Markdown 内容不能为空' });
    if (Buffer.byteLength(markdownContent, 'utf-8') > 1024 * 1024) {
      return res.status(400).json({ error: 'Markdown 文件过大（限制 1MB）' });
    }
    if (targetType === 'main') {
      const docs = siteDatabase.listMainDocuments();
      if (!targetDocSlug || !docs.some((d) => d.slug === targetDocSlug)) {
        return res.status(400).json({ error: '主文档目标无效' });
      }
    }
    const row = siteDatabase.createDocSubmission({
      title,
      targetType,
      targetDocSlug: targetType === 'main' ? targetDocSlug : '',
      fileName,
      markdownContent,
      submitterName,
      submitterContact,
      tags: cleanTags,
    });
    res.json({ ok: true, id: row && row.id });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/pages/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const clearance = req.siteClearance || 'guest';
    const safeSlug = String(slug || '').trim();
    const key = `v1:pages:one:${redisCache.getEpoch()}:${clearance}:${safeSlug}`;
    const cached = await redisCache.getJsonTracked(key);
    if (cached != null) {
      if (cached._notFound) {
        redisCache.cacheHeader(res, true);
        return res.status(404).json({ error: 'Not found' });
      }
      if (cached._forbidden) {
        redisCache.cacheHeader(res, true);
        return res.status(403).json({ error: '无权查看该内容' });
      }
      redisCache.cacheHeader(res, true);
      return res.json(cached.body);
    }
    const store = await extraPagesRepo.readStore();
    const page = store.pages.find((p) => p.slug === safeSlug);
    if (!page || !extraPagesStore.isPublishedForPublic(page)) {
      await redisCache.setJsonAfterMiss(
        key,
        { _notFound: true },
        redisCache.DEFAULT_TTL_SEC
      );
      redisCache.cacheHeader(res, false);
      return res.status(404).json({ error: 'Not found' });
    }
    const e = extraPagesStore.enrichPage(page);
    if (!canReadContent(clearance, e.securityLevel || 'public')) {
      await redisCache.setJsonAfterMiss(
        key,
        { _forbidden: true },
        redisCache.DEFAULT_TTL_SEC
      );
      redisCache.cacheHeader(res, false);
      return res.status(403).json({ error: '无权查看该内容' });
    }
    const body = {
      slug: e.slug,
      title: e.title,
      excerpt: e.excerpt,
      cover: e.cover,
      tags: e.tags,
      author: e.author,
      format: e.format,
      body: e.body,
      linkUrl: e.linkUrl,
      publishedAt: e.publishedAt,
      updatedAt: e.updatedAt,
    };
    await redisCache.setJsonAfterMiss(key, { body }, redisCache.DEFAULT_TTL_SEC);
    redisCache.cacheHeader(res, false);
    res.json(body);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/** 负载均衡 / 探活：TRUST_PROXY、ADMIN_BACKUP_KEEP、ADMIN_LOGIN_* 等见环境变量说明 */
app.get('/api/health', async (req, res) => {
  const st = readSiteSettingsSafe();
  const appPkg = readAppPackageMeta();
  const payload = {
    ok: true,
    appName: appPkg.name,
    appVersion: appPkg.version,
    sections: sections.length,
    siteStorage: siteDatabase.isSiteSqlite() ? 'sqlite' : 'file',
    extraPages: extraPagesRepo.isSqlite() ? 'sqlite' : 'file',
    maintenance: !!(st.maintenance && st.maintenance.enabled),
  };
  try {
    payload.redis = await presenceStore.getStatus();
  } catch (e) {
    payload.redis = { error: String(e.message || e) };
  }
  payload.cache = redisCache.getStats();
  if (siteDatabase.isSiteSqlite()) {
    try {
      await siteDatabase.ping();
      payload.sqlite = 'ok';
    } catch (e) {
      payload.sqlite = 'error';
      payload.sqliteError = String(e.message || e);
    }
  }
  res.json(payload);
});

app.get('/api/site-branding', (req, res) => {
  try {
    const st = readSiteSettingsSafe();
    const b = (st && st.branding) || {};
    res.json({
      ok: true,
      branding: {
        site: b.site || { title: '', faviconUrl: '/icons/icon.svg' },
        adminSidebar: b.adminSidebar || {},
        adminNavbar: b.adminNavbar || {},
        landingNav: b.landingNav || {},
      },
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// --- API Routes ---

app.get('/api/main-docs', (req, res) => {
  try {
    const docs = siteDatabase.listMainDocuments().map((d) => ({
      slug: d.slug,
      title: d.title || d.slug,
      isDefault: !!d.isDefault,
      lastPublishedBy: (function () {
        try {
          const rows = siteDatabase.listMainDocHistory(d.slug, { limit: 1 });
          const r = rows && rows[0] ? rows[0] : null;
          return r && r.actor_username ? String(r.actor_username) : '';
        } catch (_) {
          return '';
        }
      })(),
      lastPublishedAt: (function () {
        try {
          const rows = siteDatabase.listMainDocHistory(d.slug, { limit: 1 });
          const r = rows && rows[0] ? rows[0] : null;
          return r && r.created_at ? String(r.created_at) : '';
        } catch (_) {
          return '';
        }
      })(),
    }));
    res.json({ docs, homepageEnabled: isHomepageEnabled() });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/sections', async (req, res) => {
  const docSlug = resolvePublicDocSlug(req.query.doc);
  if (docSlug === null) {
    return res.status(400).json({ error: '无效 doc 参数' });
  }
  const clearance = req.siteClearance || 'guest';
  const key = `v1:sections:list:${redisCache.getEpoch()}:${clearance}:${docSlug}`;
  const cached = await redisCache.getJsonTracked(key);
  if (cached != null) {
    redisCache.cacheHeader(res, true);
    return res.json(cached);
  }
  const secArr = getSectionsForPublic(docSlug);
  const list = secArr
    .filter((s) => canReadContent(clearance, normalizeLevel(s.securityLevel)))
    .map((s) => ({
      id: s.id,
      title: s.title,
      slug: s.slug,
      toc: s.toc,
      securityLevel: normalizeLevel(s.securityLevel),
    }));
  await redisCache.setJsonAfterMiss(key, list, redisCache.DEFAULT_TTL_SEC);
  redisCache.cacheHeader(res, false);
  res.json(list);
});

app.get('/api/sections/:id', async (req, res) => {
  const docSlug = resolvePublicDocSlug(req.query.doc);
  if (docSlug === null) {
    return res.status(400).json({ error: '无效 doc 参数' });
  }
  const clearance = req.siteClearance || 'guest';
  const id = parseInt(req.params.id, 10);
  const secArr = getSectionsForPublic(docSlug);
  const section = secArr[id];
  if (!section) return res.status(404).json({ error: 'Section not found' });
  if (!canReadContent(clearance, normalizeLevel(section.securityLevel))) {
    return res.status(403).json({ error: '无权查看该章节' });
  }
  const key = `v1:sections:one:${redisCache.getEpoch()}:${clearance}:${docSlug}:${id}`;
  const cached = await redisCache.getJsonTracked(key);
  if (cached != null) {
    redisCache.cacheHeader(res, true);
    return res.json(cached);
  }
  const body = {
    id: section.id,
    title: section.title,
    slug: section.slug,
    content: section.content,
    toc: section.toc,
    securityLevel: normalizeLevel(section.securityLevel),
  };
  await redisCache.setJsonAfterMiss(key, body, redisCache.DEFAULT_TTL_SEC);
  redisCache.cacheHeader(res, false);
  res.json(body);
});

function scoreAgainstKeywords(textLower, titleLower, keywords) {
  let score = 0;
  for (const kw of keywords) {
    if (titleLower.includes(kw)) score += 10;
    const re = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const count = (textLower.match(re) || []).length;
    score += count;
  }
  return score;
}

function snippetFromText(textLower, keywords) {
  const first = keywords[0] || '';
  if (!first) return '';
  const idx = textLower.indexOf(first);
  if (idx < 0) return '';
  const start = Math.max(0, idx - 60);
  const end = Math.min(textLower.length, idx + 100);
  return '...' + textLower.slice(start, end).trim() + '...';
}

app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  if (!q || q.length < 2) return res.json([]);
  const docSlug = resolvePublicDocSlug(req.query.doc);
  if (docSlug === null) {
    return res.status(400).json({ error: '无效 doc 参数' });
  }
  const keywords = q.split(/\s+/).filter(Boolean);
  const clearance = req.siteClearance || 'guest';
  const qHash = crypto.createHash('sha256').update(q).digest('hex').slice(0, 32);
  const sKey = `v1:search:${redisCache.getEpoch()}:${clearance}:${docSlug}:${qHash}`;
  const cachedSearch = await redisCache.getJsonTracked(sKey);
  if (cachedSearch != null) {
    redisCache.cacheHeader(res, true);
    return res.json(cachedSearch);
  }
  const seo = readSeoJsonSafe();
  const includeExtra =
    seo == null ||
    seo.includeExtraPagesInSearch === undefined ||
    seo.includeExtraPagesInSearch === true;

  try {
    const sectionRows = getSearchIndexForPublic(docSlug)
      .filter((item) => canReadContent(clearance, item.securityLevel || 'public'))
      .map((item) => {
        const titleLower = (item.title || '').toLowerCase();
        const score = scoreAgainstKeywords(item.text, titleLower, keywords);
        return {
          kind: 'section',
          doc: docSlug,
          id: item.id,
          title: item.title,
          slug: item.slug,
          text: item.text,
          titleLower,
          score,
        };
      });

    let pageRows = [];
    if (includeExtra) {
      const store = await extraPagesRepo.readStore();
      pageRows = store.pages
        .filter((p) => extraPagesStore.isPublishedForPublic(p))
        .map((p) => {
          const e = extraPagesStore.enrichPage(p);
          if (!canReadContent(clearance, e.securityLevel || 'public')) return null;
          const text = extraPageSearchableText(e);
          const titleLower = (e.title || '').toLowerCase();
          const score = scoreAgainstKeywords(text, titleLower, keywords);
          return {
            kind: 'page',
            id: null,
            slug: e.slug,
            title: e.title,
            text,
            titleLower,
            score,
          };
        })
        .filter(Boolean);
    }

    const combined = [...sectionRows, ...pageRows]
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    const out = combined.map((r) => {
      const snippet = snippetFromText(r.text, keywords);
      if (r.kind === 'section') {
        return {
          kind: 'section',
          doc: r.doc,
          id: r.id,
          title: r.title,
          slug: r.slug,
          score: r.score,
          snippet: snippet || undefined,
        };
      }
      return {
        kind: 'page',
        slug: r.slug,
        title: r.title,
        score: r.score,
        snippet: snippet || undefined,
      };
    });

    await redisCache.setJsonAfterMiss(sKey, out, redisCache.SEARCH_TTL_SEC);
    redisCache.cacheHeader(res, false);
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/robots.txt', (req, res) => {
  let body = 'User-agent: *\nAllow: /\n';
  const j = readSeoJsonSafe();
  if (j && typeof j.robotsTxt === 'string' && j.robotsTxt.trim()) {
    body = j.robotsTxt;
  }
  res.type('text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=120');
  res.send(body);
});

app.get('/sitemap.xml', async (req, res) => {
  try {
    const j = readSeoJsonSafe();
    const rawBase = j && j.canonicalBase != null ? String(j.canonicalBase).trim() : '';
    const origin = rawBase.replace(/\/$/, '') || `${req.protocol}://${req.get('host')}`;

    const useAuto = j == null || j.sitemapAuto !== false;
    const paths = [];
    const seen = new Set();
    const addPath = (p) => {
      if (typeof p !== 'string' || !p.trim()) return;
      let pathPart = p.trim();
      if (!pathPart.startsWith('/')) pathPart = `/${pathPart}`;
      if (seen.has(pathPart)) return;
      seen.add(pathPart);
      paths.push(pathPart);
    };

    if (useAuto) {
      buildAutoSitemapRelUrls().forEach(addPath);
    }
    const extraManual = j && Array.isArray(j.sitemapPaths) ? j.sitemapPaths : [];
    if (useAuto) {
      extraManual.forEach(addPath);
    } else if (extraManual.length) {
      extraManual.forEach(addPath);
    } else {
      ['/index', '/docs'].forEach(addPath);
    }

    const includeExtra =
      j == null ||
      j.includeExtraPagesInSitemap === undefined ||
      j.includeExtraPagesInSitemap === true;
    if (includeExtra) {
      const store = await extraPagesRepo.readStore();
      for (const p of store.pages) {
        if (!extraPagesStore.isPublishedForPublic(p)) continue;
        const slug = String(p.slug || '').trim();
        if (!slug) continue;
        addPath(`/page/${encodeURIComponent(slug)}`);
      }
    }
    const urls = paths
      .map((p) => {
        const pathPart = p.startsWith('/') ? p : `/${p}`;
        const loc = origin + pathPart;
        return `  <url><loc>${escapeXml(loc)}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`;
      })
      .join('\n');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
    res.type('application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(xml);
  } catch (e) {
    res.status(500).type('text/plain').send(String(e.message || e));
  }
});

/** 扩展页面前台展示（数据来自 /api/pages/:slug） */
app.get('/page/:slug', (req, res) => {
  sendPublicHtmlWithEmbed(res, 'extra-page.html');
});

// 后台登录页与管理台（须在 SPA 兜底之前注册）
// 无会话 Cookie 时直接重定向到登录页，避免浏览器缓存旧版 admin.html（单密码表单）
app.get(['/register/invalid', '/register/invalid/'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(path.join(publicDir, 'register-invalid.html'));
});

app.get(['/register', '/register/'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(path.join(publicDir, 'register.html'));
});

app.get(['/admin/login', '/admin/login/'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(path.join(publicDir, 'admin-login.html'));
});
app.get(['/admin', '/admin/'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  if (!getCookieFromHeader(req, 'admin_session')) {
    return res.redirect(302, '/admin/login?return=' + encodeURIComponent('/admin'));
  }
  res.sendFile(path.join(publicDir, 'admin.html'));
});

// 门户落地页（独立页面，与文档 SPA 分离）
app.get(['/index', '/index/', '/index.html', '/index.html/'], (req, res) => {
  if (!isHomepageEnabled()) {
    return res.redirect(302, '/docs');
  }
  sendPublicHtmlWithEmbed(res, 'landing.html');
});

app.get('/', (req, res) => {
  if (!isHomepageEnabled()) {
    return res.redirect(302, '/docs');
  }
  res.redirect(302, '/index');
});

app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Service-Worker-Allowed', '/');
  res.sendFile(path.join(publicDir, 'sw.js'));
});

/** SQLite 模式下 /data/*.json 由库内数据提供，避免前台仍读陈旧静态文件 */
function resolveDataJsonBody(kvKey, fileName) {
  if (siteDatabase.isSiteSqlite()) {
    const raw = siteDatabase.getKv(kvKey);
    if (raw) return raw;
  }
  const f = path.join(publicDir, 'data', fileName);
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf-8');
  return null;
}

async function sendDataJsonCached(res, kvKey, fileName) {
  const key = `v1:data:${kvKey}:${redisCache.getEpoch()}`;
  const hit = await redisCache.getStringTracked(key);
  if (hit != null) {
    redisCache.cacheHeader(res, true);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    return res.send(hit);
  }
  const body = resolveDataJsonBody(kvKey, fileName);
  if (body == null) {
    redisCache.cacheHeader(res, false);
    return res.status(404).type('application/json').send('{}');
  }
  await redisCache.setStringAfterMiss(key, body, redisCache.DEFAULT_TTL_SEC);
  redisCache.cacheHeader(res, false);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(body);
}

app.get('/data/landing.json', (req, res) => {
  sendDataJsonCached(res, 'landing', 'landing.json').catch((e) =>
    res.status(500).type('application/json').json({ error: String(e.message || e) })
  );
});
app.get('/data/tools-nav.json', (req, res) => {
  sendDataJsonCached(res, 'tools_nav', 'tools-nav.json').catch((e) =>
    res.status(500).type('application/json').json({ error: String(e.message || e) })
  );
});
app.get('/data/seo.json', (req, res) => {
  sendDataJsonCached(res, 'seo', 'seo.json').catch((e) =>
    res.status(500).type('application/json').json({ error: String(e.message || e) })
  );
});

app.use('/img', express.static(IMG_DIR, { maxAge: '7d' }));
/** 直接访问 *.html 时同样注入站点嵌入代码（避免 static 直出无注入） */
app.get(['/docs.html', '/docs.html/'], (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=120');
  sendPublicHtmlWithEmbed(res, 'docs.html');
});
app.get(['/landing.html', '/landing.html/'], (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=120');
  sendPublicHtmlWithEmbed(res, 'landing.html');
});
app.get(['/extra-page.html', '/extra-page.html/'], (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=120');
  sendPublicHtmlWithEmbed(res, 'extra-page.html');
});
app.use(
  express.static(publicDir, {
    setHeaders(res, filePath) {
      const base = path.basename(filePath);
      if (base === 'manifest.webmanifest') {
        res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
      }
      if (base === 'admin-login.js' || base === 'admin.js') {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      }
    },
  })
);

app.get('/docs', (req, res) => {
  sendPublicHtmlWithEmbed(res, 'docs.html');
});

app.get('*', (req, res) => {
  sendPublicHtmlWithEmbed(res, 'docs.html');
});

function assertProductionConfigSafe() {
  const strict =
    process.env.NODE_ENV === 'production' || process.env.EBU4_STRICT_PRODUCTION === '1';
  if (!strict) return;
  const pwd = process.env.ADMIN_PASSWORD;
  if (!pwd || String(pwd).length < 8) {
    console.error(
      '[fatal] 生产模式（NODE_ENV=production 或 EBU4_STRICT_PRODUCTION=1）必须设置 ADMIN_PASSWORD，且长度至少 8 字符。'
    );
    process.exit(1);
  }
  if (String(pwd) === 'ebu4-admin-dev') {
    console.error('[fatal] 生产环境禁止使用默认开发密码 ebu4-admin-dev，请更换强密码。');
    process.exit(1);
  }
}

(async function start() {
  assertProductionConfigSafe();
  assertRequiredPublicHtmlPresent();
  try {
    await siteDatabase.init({
      mdPath: MD_PATH,
      toolsJsonPath: TOOLS_JSON_PATH,
      landingJsonPath: LANDING_JSON_PATH,
      seoJsonPath: SEO_JSON_PATH,
      extraPagesJsonPath: EXTRA_PAGES_PATH,
    });
    adminUsersService.init({ siteDatabase, getAdminPassword });
    passkeyStore.init({ siteDatabase });
    migrateDefaultEmbedAi(siteDatabase, publicDir);
  } catch (e) {
    console.error('[site-db] 初始化失败:', e.message || e);
    process.exit(1);
  }
  try {
    const st0 = readSiteSettingsSafe();
    presenceStore.applySiteSettings(st0.redis);
    await presenceStore.ensureRedis();
    const requireRedis =
      process.env.REQUIRE_REDIS === '1' || process.env.EBU4_REQUIRE_REDIS === '1';
    if (requireRedis) {
      const rs = await presenceStore.getStatus();
      if (!rs.urlConfigured) {
        console.error(
          '[fatal] 已设置 REQUIRE_REDIS=1，但未配置可用 Redis（环境变量 REDIS_URL，或后台「Redis」中启用并填写地址）。'
        );
        process.exit(1);
      }
      if (!rs.connected) {
        console.error(
          '[fatal] 已配置 Redis 地址但无法连接（在线列表依赖 Redis）。请检查网络与密码。'
        );
        process.exit(1);
      }
      console.log('[redis] 已连接，后台在线心跳将使用 Redis（来源：' + (rs.source || '—') + '）。');
    }
  } catch (e) {
    console.error('[redis] 初始化检查失败:', e.message || e);
    process.exit(1);
  }
  reloadDocData();
  startUpgradeScheduler({
    siteDatabase,
    siteRoot: path.join(__dirname, '..'),
    reloadDocData,
    backupKeepCount: ADMIN_BACKUP_KEEP,
  });
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Docs site running at http://localhost:${PORT}`);
    console.log(`后台登录 http://localhost:${PORT}/admin/login  ·  控制台 http://localhost:${PORT}/admin`);
    if (siteDatabase.isSiteSqlite()) {
      console.log('[site-db] 全站内容: SQLite →', siteDatabase.resolveDbPath());
    }
  });
})();
