const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const docMd = require('./doc-md');
const extraPagesStore = require('./extra-pages-store');
const auditLog = require('./audit-log');
const { backupWithPrune } = require('./lib/backup');
const createDocAdminService = require('./services/doc-admin-service');
const extraPagesAdmin = require('./services/extra-pages-admin-service');
const extraPagesRepo = require('./extra-pages-repo');
const visitStats = require('./visit-stats');
const roleProfilesStore = require('./role-profiles-store');
const presenceStore = require('./presence-store');
const inviteStore = require('./invite-store');
const siteSession = require('./site-session');
const { normalizeSiteSettings } = require('./lib/site-settings-normalize');
const redisCache = require('./redis-cache');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const passkeyStore = require('./passkey-store');
const webauthnChallenges = require('./webauthn-challenges');
const { webauthnEnabled, getWebAuthnConfig } = require('./webauthn-config');

function getCookie(req, name) {
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

function shouldUseSecureCookie(req) {
  if (req.secure) return true;
  const xf = req.headers['x-forwarded-proto'];
  if (typeof xf === 'string' && xf.split(',')[0].trim().toLowerCase() === 'https') {
    return true;
  }
  if (process.env.FORCE_SECURE_COOKIE === '1' || process.env.FORCE_SECURE_COOKIE === 'true') {
    return true;
  }
  return false;
}

function registerAdminRoutes(app, ctx) {
  const {
    MD_PATH,
    IMG_DIR,
    TOOLS_JSON_PATH,
    LANDING_JSON_PATH,
    SEO_JSON_PATH,
    EXTRA_PAGES_PATH,
    backupKeepCount = 20,
    reloadDocData,
    getAdminPassword,
    siteDatabase,
    adminUsersService,
  } = ctx;

  if (!adminUsersService) {
    throw new Error('registerAdminRoutes: 缺少 adminUsersService');
  }

  const SITE_SETTINGS_PATH = path.join(
    path.dirname(TOOLS_JSON_PATH),
    '..',
    'data',
    'site-settings.json'
  );
  const EDITOR_MODULE_ACCESS_PATH = path.join(
    path.dirname(TOOLS_JSON_PATH),
    '..',
    'data',
    'editor-module-access.json'
  );
  const ROLE_DATA_VIEW_PATH = path.join(
    path.dirname(TOOLS_JSON_PATH),
    '..',
    'data',
    'role-data-view.json'
  );
  const ROLE_SECURITY_DOC_FILE = path.join(
    path.dirname(TOOLS_JSON_PATH),
    '..',
    'data',
    'role-security-doc.txt'
  );
  roleProfilesStore.init({
    siteDatabase,
    legacyPaths: {
      editorModuleAccessPath: EDITOR_MODULE_ACCESS_PATH,
      roleDataViewPath: ROLE_DATA_VIEW_PATH,
      roleSecurityDocPath: ROLE_SECURITY_DOC_FILE,
    },
  });
  const VISIT_STATS_FILE = path.join(path.dirname(TOOLS_JSON_PATH), 'visit-stats.json');
  /** 编辑角色数据查看范围（对应后台侧栏与 API；管理员不受限） */
  const DATA_VIEW_KEYS = ['mainDoc', 'tools', 'landing', 'extraPages', 'images', 'stats'];
  const ADMIN_MENU_ORDER_PATH = path.join(path.dirname(TOOLS_JSON_PATH), 'admin-menu-order.json');
  const ADMIN_MENU_TAB_IDS = ['dash', 'md', 'tools', 'landing', 'site', 'seo', 'audit', 'users', 'roles', 'redis'];
  /** 可单独「停用」侧栏项（含「菜单显示」meta 项） */
  const ADMIN_MENU_DISABLE_KEYS = [
    'dash',
    'md',
    'tools',
    'landing',
    'site',
    'seo',
    'audit',
    'users',
    'roles',
    'redis',
    'menu',
  ];

  function normalizeMenuDisabled(input) {
    const o = {};
    const allowed = new Set(ADMIN_MENU_DISABLE_KEYS);
    for (const id of ADMIN_MENU_DISABLE_KEYS) {
      o[id] = !!(input && input[id]);
    }
    if (input && typeof input === 'object') {
      for (const k of Object.keys(input)) {
        if (allowed.has(k)) o[k] = !!input[k];
      }
    }
    return o;
  }

  function readAdminMenuOrderFull() {
    try {
      let raw;
      if (siteDatabase.isSiteSqlite()) {
        raw = siteDatabase.getKv('admin_menu_order');
      } else if (fs.existsSync(ADMIN_MENU_ORDER_PATH)) {
        raw = fs.readFileSync(ADMIN_MENU_ORDER_PATH, 'utf-8');
      }
      if (!raw) return { order: null, disabled: {} };
      const j = JSON.parse(raw);
      if (Array.isArray(j)) {
        return { order: j, disabled: {} };
      }
      if (j && typeof j === 'object') {
        return {
          order: Array.isArray(j.order) ? j.order : null,
          disabled: normalizeMenuDisabled(j.disabled),
        };
      }
    } catch (_) {}
    return { order: null, disabled: {} };
  }

  function writeAdminMenuOrderFull(state) {
    const obj = {
      order: state.order,
      disabled: normalizeMenuDisabled(state.disabled),
    };
    const raw = JSON.stringify(obj);
    if (siteDatabase.isSiteSqlite()) {
      siteDatabase.setKv('admin_menu_order', raw);
      return;
    }
    const dir = path.dirname(ADMIN_MENU_ORDER_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(ADMIN_MENU_ORDER_PATH, raw, 'utf-8');
  }

  function normalizeAdminMenuOrder(input) {
    const allowed = new Set(ADMIN_MENU_TAB_IDS);
    const seen = new Set();
    const out = [];
    if (Array.isArray(input)) {
      for (const id of input) {
        if (typeof id !== 'string' || !allowed.has(id) || seen.has(id)) continue;
        seen.add(id);
        out.push(id);
      }
    }
    for (const id of ADMIN_MENU_TAB_IDS) {
      if (!seen.has(id)) out.push(id);
    }
    return out;
  }

  const docAdmin = createDocAdminService({
    MD_PATH,
    backupKeepCount,
    reloadDocData,
    backupWithPrune,
    docMd,
    siteDatabase,
  });

  /** 解析 ?doc= 或 JSON body.doc，缺省为默认主文档；校验 slug 存在 */
  function requireExistingMainDocSlug(req, res) {
    const fromQuery = req.query && req.query.doc;
    const fromBody = req.body && typeof req.body === 'object' ? req.body.doc : undefined;
    const raw =
      fromQuery != null && String(fromQuery).trim() !== ''
        ? String(fromQuery)
        : fromBody != null
          ? String(fromBody)
          : '';
    const trimmed = raw.trim();
    const slug = trimmed ? siteDatabase.normalizeMainDocSlug(trimmed) : siteDatabase.getDefaultMainDocSlug();
    if (trimmed && !slug) {
      res.status(400).json({ error: '无效 doc 参数' });
      return null;
    }
    const list = siteDatabase.listMainDocuments();
    if (!list.some((d) => d.slug === slug)) {
      res.status(404).json({ error: '主文档不存在' });
      return null;
    }
    return slug;
  }

  const MIME_TO_EXT = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
  };

  function ensureImageDir() {
    if (!IMG_DIR) return;
    if (!fs.existsSync(IMG_DIR)) fs.mkdirSync(IMG_DIR, { recursive: true });
  }

  function safeImageBasename(name) {
    const base = path.basename(String(name || ''));
    if (!base || base.includes('..')) return null;
    if (!/^[a-zA-Z0-9._-]+$/.test(base)) return null;
    return base;
  }

  const imageStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        ensureImageDir();
        cb(null, IMG_DIR);
      } catch (e) {
        cb(e);
      }
    },
    filename: (req, file, cb) => {
      let ext = path.extname(file.originalname || '').toLowerCase();
      const allowed = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']);
      if (!allowed.has(ext)) {
        ext = MIME_TO_EXT[file.mimetype] || '.png';
      }
      if (ext === '.jpeg') ext = '.jpg';
      const name = 'u-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex') + ext;
      cb(null, name);
    },
  });

  const imageUpload = multer({
    storage: imageStorage,
    limits: { fileSize: 12 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (/^image\/(jpeg|png|gif|webp|svg\+xml)$/.test(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('仅支持 JPEG、PNG、GIF、WebP、SVG'));
      }
    },
  });

  const LOGIN_WINDOW_MS =
    parseInt(process.env.ADMIN_LOGIN_WINDOW_MS || '900000', 10) || 900000;
  const LOGIN_MAX_FAILS =
    parseInt(process.env.ADMIN_LOGIN_MAX_FAILS || '15', 10) || 15;

  /** @type {Map<string, { n: number, windowStart: number }>} */
  const loginFails = new Map();

  function clientIp(req) {
    return req.ip || req.socket.remoteAddress || 'unknown';
  }

  function isLoginBlocked(ip) {
    const now = Date.now();
    const row = loginFails.get(ip);
    if (!row) return false;
    if (now - row.windowStart > LOGIN_WINDOW_MS) {
      loginFails.delete(ip);
      return false;
    }
    return row.n >= LOGIN_MAX_FAILS;
  }

  function recordLoginFailure(ip) {
    const now = Date.now();
    let row = loginFails.get(ip);
    if (!row || now - row.windowStart > LOGIN_WINDOW_MS) {
      row = { n: 0, windowStart: now };
    }
    row.n += 1;
    loginFails.set(ip, row);
  }

  function clearLoginFailures(ip) {
    loginFails.delete(ip);
  }

  const ADMIN_RL_WINDOW_MS =
    parseInt(process.env.ADMIN_API_RATE_WINDOW_MS || '60000', 10) || 60000;
  const ADMIN_RL_MAX =
    parseInt(process.env.ADMIN_API_RATE_MAX || '240', 10) || 240;
  /** @type {Map<string, { n: number, windowStart: number }>} */
  const adminRateHits = new Map();

  function touchAdminRate(ip) {
    const now = Date.now();
    let row = adminRateHits.get(ip);
    if (!row || now - row.windowStart > ADMIN_RL_WINDOW_MS) {
      row = { n: 0, windowStart: now };
    }
    row.n += 1;
    adminRateHits.set(ip, row);
    return row.n <= ADMIN_RL_MAX;
  }

  function audit(req, action, outcome, detail) {
    auditLog.append({
      action,
      outcome,
      requestId: req && req.requestId,
      ip: clientIp(req),
      detail: detail && typeof detail === 'object' ? detail : undefined,
    });
  }

  /** @type {Map<string, { exp: number, userId: number, username: string, role: string, legacy?: boolean }>} */
  const sessions = new Map();

  function createSession(user) {
    const token = crypto.randomBytes(32).toString('hex');
    const exp = Date.now() + 24 * 60 * 60 * 1000;
    sessions.set(token, {
      exp,
      userId: user.id,
      username: user.username,
      role: user.role,
      legacy: user.legacy === true,
    });
    return token;
  }

  function destroySession(token) {
    if (token) sessions.delete(token);
  }

  function pruneSessions() {
    const now = Date.now();
    for (const [t, sess] of sessions) {
      if (sess.exp < now) sessions.delete(t);
    }
  }

  function requireAdmin(req, res, next) {
    pruneSessions();
    const token = getCookie(req, 'admin_session');
    if (!token || !sessions.has(token)) {
      return res.status(401).json({
        error: '未登录或会话无效',
        requestId: req.requestId,
      });
    }
    const sess = sessions.get(token);
    if (sess.exp < Date.now()) {
      sessions.delete(token);
      return res.status(401).json({
        error: '会话已过期，请重新登录',
        requestId: req.requestId,
      });
    }
    req.adminUser = {
      userId: sess.userId,
      username: sess.username,
      role: sess.role,
      legacy: !!sess.legacy,
    };
    next();
  }

  function requireRole(role) {
    return (req, res, next) => {
      const u = req.adminUser;
      if (!u) {
        return res.status(401).json({
          error: '未登录或会话无效',
          requestId: req.requestId,
        });
      }
      if (u.role !== role) {
        return res.status(403).json({
          error: '权限不足',
          requestId: req.requestId,
        });
      }
      next();
    };
  }

  /** 模块能力：按当前登录用户的角色读取 role_profiles（见 role-profiles-store） */
  function requireAdminOrEditorCapability(capKey) {
    return (req, res, next) => {
      const u = req.adminUser;
      if (!u) {
        return res.status(401).json({
          error: '未登录或会话无效',
          requestId: req.requestId,
        });
      }
      const caps = roleProfilesStore.getModuleAccessForRole(u.role);
      if (caps[capKey] === true) return next();
      return res.status(403).json({
        error: '权限不足',
        requestId: req.requestId,
      });
    };
  }

  /** 数据范围：按角色读取 dataViews */
  function requireEditorDataView(key) {
    return (req, res, next) => {
      const u = req.adminUser;
      if (!u) {
        return res.status(401).json({
          error: '未登录或会话无效',
          requestId: req.requestId,
        });
      }
      const dv = roleProfilesStore.getDataViewsForRole(u.role);
      if (dv[key] !== false) return next();
      return res.status(403).json({
        error: '权限不足',
        requestId: req.requestId,
      });
    };
  }

  function rowIsActiveAdmin(row) {
    if (!row) return false;
    const dis = row.disabled;
    const off = dis === true || dis === 1 || dis === '1';
    return row.role === 'admin' && !off;
  }

  const SESSION_COOKIE = 'admin_session';

  function setSessionCookie(res, req, token) {
    const maxAge = 86400;
    const secure = shouldUseSecureCookie(req) ? '; Secure' : '';
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`
    );
  }

  function clearSessionCookie(res, req) {
    const secure = shouldUseSecureCookie(req) ? '; Secure' : '';
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`
    );
  }

  app.use('/api/admin', (req, res, next) => {
    if (req.method === 'POST' && req.path === '/login') return next();
    const ip = clientIp(req);
    if (!touchAdminRate(ip)) {
      audit(req, 'api.rate_limited', 'deny', {
        path: req.originalUrl || req.url,
        method: req.method,
      });
      return res.status(429).json({
        error: '请求过于频繁，请稍后再试',
        requestId: req.requestId,
      });
    }
    next();
  });

  /** 站点设置与审计：单独 Router 且靠前注册，避免在部分环境下落到 SPA 兜底 */
  const siteMetaRouter = express.Router();
  /** 站点设置：管理员或（编辑且配置开启 siteSettings） */
  siteMetaRouter.get('/site-settings', requireAdmin, requireAdminOrEditorCapability('siteSettings'), (req, res) => {
    try {
      let raw = null;
      if (siteDatabase.isSiteSqlite()) {
        const kv = siteDatabase.getKv('site_settings');
        if (kv) raw = JSON.parse(kv);
      } else if (fs.existsSync(SITE_SETTINGS_PATH)) {
        raw = JSON.parse(fs.readFileSync(SITE_SETTINGS_PATH, 'utf-8'));
      }
      const normalized = normalizeSiteSettings(raw);
      const isAdmin = req.adminUser && req.adminUser.role === 'admin';
      if (!isAdmin) {
        delete normalized.redis;
      }
      return res.json(normalized);
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });
  siteMetaRouter.put(
    '/site-settings',
    requireAdmin,
    requireAdminOrEditorCapability('siteSettings'),
    async (req, res) => {
      try {
        const isAdminUser = req.adminUser && req.adminUser.role === 'admin';
        let body = req.body && typeof req.body === 'object' ? req.body : {};
        if (!isAdminUser) {
          if (!body.maintenance || typeof body.maintenance !== 'object') {
            return res.status(400).json({ error: '编辑角色仅可更新 maintenance 对象' });
          }
          body = { maintenance: body.maintenance };
        }
        let prev = {};
        try {
          if (siteDatabase.isSiteSqlite()) {
            const raw = siteDatabase.getKv('site_settings');
            if (raw) prev = JSON.parse(raw);
          } else if (fs.existsSync(SITE_SETTINGS_PATH)) {
            prev = JSON.parse(fs.readFileSync(SITE_SETTINGS_PATH, 'utf-8'));
          }
        } catch (_) {}
        const merged = Object.assign({}, prev, body);
        if (body.maintenance && typeof body.maintenance === 'object') {
          merged.maintenance = Object.assign({}, prev.maintenance || {}, body.maintenance);
        }
        if (body.registration && typeof body.registration === 'object') {
          merged.registration = Object.assign({}, prev.registration || {}, body.registration);
        }
        if (isAdminUser && body.redis && typeof body.redis === 'object') {
          merged.redis = Object.assign({}, prev.redis || {}, body.redis);
        }
        const normalized = normalizeSiteSettings(merged);
        const out = JSON.stringify(normalized);
        if (siteDatabase.isSiteSqlite()) {
          siteDatabase.setKv('site_settings', out);
        } else {
          const dir = path.dirname(SITE_SETTINGS_PATH);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(SITE_SETTINGS_PATH, out, 'utf-8');
        }
        await presenceStore.applySiteSettingsAndReconnect(normalized.redis);
        audit(req, 'site_settings.write', 'ok', {});
        res.json({ ok: true });
      } catch (e) {
        audit(req, 'site_settings.write', 'error', {
          message: String(e.message || e).slice(0, 200),
        });
        res.status(500).json({ error: String(e.message || e) });
      }
    }
  );
  siteMetaRouter.get('/menu-order', requireAdmin, (req, res) => {
    try {
      const full = readAdminMenuOrderFull();
      const order = full.order ? normalizeAdminMenuOrder(full.order) : null;
      const disabled = normalizeMenuDisabled(full.disabled);
      res.json({ order, disabled });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });
  siteMetaRouter.put('/menu-order', requireAdmin, requireRole('admin'), (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      if (!Array.isArray(body.order)) {
        return res.status(400).json({ error: '需要 JSON 字段 order 为字符串数组' });
      }
      const next = normalizeAdminMenuOrder(body.order);
      const disabled = normalizeMenuDisabled(body.disabled);
      writeAdminMenuOrderFull({ order: next, disabled });
      audit(req, 'admin_menu_order.write', 'ok', { tabs: next.length, disabledKeys: Object.keys(disabled).filter((k) => disabled[k]).length });
      res.json({ ok: true, order: next, disabled });
    } catch (e) {
      audit(req, 'admin_menu_order.write', 'error', {
        message: String(e.message || e).slice(0, 200),
      });
      res.status(500).json({ error: String(e.message || e) });
    }
  });
  siteMetaRouter.get('/audit-log', requireAdmin, requireAdminOrEditorCapability('audit'), (req, res) => {
    try {
      const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100));
      const entries = auditLog.readTail(limit);
      res.json({ entries });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });
  siteMetaRouter.post('/presence/ping', requireAdmin, async (req, res) => {
    try {
      const token = getCookie(req, SESSION_COOKIE);
      await presenceStore.ping(token, {
        userId: req.adminUser.userId,
        username: req.adminUser.username,
        role: req.adminUser.role,
      });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });
  siteMetaRouter.get('/presence/online', requireAdmin, requireRole('admin'), async (req, res) => {
    try {
      const r = await presenceStore.listOnline();
      res.json({ ok: true, list: r.list, backend: r.backend });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });
  siteMetaRouter.post('/presence/kick', requireAdmin, requireRole('admin'), async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const sessionToken = String(body.sessionToken || '').trim();
      if (!sessionToken) return res.status(400).json({ error: '缺少 sessionToken' });
      destroySession(sessionToken);
      await presenceStore.del(sessionToken);
      audit(req, 'admin.presence.kick', 'ok', {});
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });
  siteMetaRouter.get('/invites', requireAdmin, requireAdminOrEditorCapability('inviteRegister'), (req, res) => {
    try {
      res.json({ codes: inviteStore.listCodes(siteDatabase) });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });
  siteMetaRouter.post('/invites', requireAdmin, requireAdminOrEditorCapability('inviteRegister'), (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const created = inviteStore.createInvite(siteDatabase, body);
      audit(req, 'admin.invites.create', 'ok', { code: created.code });
      res.json({ ok: true, invite: created });
    } catch (e) {
      res.status(400).json({ error: String(e.message || e) });
    }
  });
  siteMetaRouter.delete('/invites/:code', requireAdmin, requireAdminOrEditorCapability('inviteRegister'), (req, res) => {
    try {
      const ok = inviteStore.deleteInvite(siteDatabase, req.params.code);
      if (!ok) return res.status(404).json({ error: '邀请码不存在' });
      audit(req, 'admin.invites.delete', 'ok', { code: req.params.code });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });
  app.use('/api/admin', siteMetaRouter);

  app.get('/api/admin/role-profiles', requireAdmin, requireRole('admin'), (req, res) => {
    try {
      res.json(roleProfilesStore.readStore());
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.put('/api/admin/role-profiles', requireAdmin, requireRole('admin'), (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const role = String(body.role || '').trim();
      if (!role) return res.status(400).json({ error: '需要字段 role' });
      const patch = {};
      if (body.moduleAccess && typeof body.moduleAccess === 'object') patch.moduleAccess = body.moduleAccess;
      if (body.dataViews && typeof body.dataViews === 'object') patch.dataViews = body.dataViews;
      if (body.securityLevel !== undefined) patch.securityLevel = body.securityLevel;
      if (body.securityNote !== undefined) patch.securityNote = body.securityNote;
      if (body.label !== undefined) patch.label = body.label;
      roleProfilesStore.updateRole(role, patch);
      audit(req, 'role_profiles.update', 'ok', { role });
      res.json({ ok: true, store: roleProfilesStore.readStore() });
    } catch (e) {
      audit(req, 'role_profiles.update', 'error', {
        message: String(e.message || e).slice(0, 200),
      });
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  app.post('/api/admin/role-profiles', requireAdmin, requireRole('admin'), (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const roleId = String(body.roleId || body.id || '').trim();
      const label = body.label != null ? String(body.label) : '';
      roleProfilesStore.createRole(roleId, { label });
      audit(req, 'role_profiles.create', 'ok', { roleId });
      res.json({ ok: true, store: roleProfilesStore.readStore() });
    } catch (e) {
      audit(req, 'role_profiles.create', 'error', {
        message: String(e.message || e).slice(0, 200),
      });
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  app.delete('/api/admin/role-profiles/:roleId', requireAdmin, requireRole('admin'), (req, res) => {
    try {
      const roleId = String(req.params.roleId || '').trim();
      roleProfilesStore.deleteRole(roleId, (r) => adminUsersService.countUsersWithRole(r));
      audit(req, 'role_profiles.delete', 'ok', { roleId });
      res.json({ ok: true, store: roleProfilesStore.readStore() });
    } catch (e) {
      audit(req, 'role_profiles.delete', 'error', {
        message: String(e.message || e).slice(0, 200),
      });
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  /** 兼容旧客户端：仅映射到 editor 角色 */
  app.get('/api/admin/editor-module-access', requireAdmin, requireRole('admin'), (req, res) => {
    try {
      res.json(roleProfilesStore.getModuleAccessForRole('editor'));
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.put('/api/admin/editor-module-access', requireAdmin, requireRole('admin'), (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      roleProfilesStore.updateRole('editor', {
        moduleAccess: {
          siteSettings: body.siteSettings === true,
          seo: body.seo === true,
          audit: body.audit === true,
        },
      });
      const next = roleProfilesStore.getModuleAccessForRole('editor');
      audit(req, 'editor_module_access.write', 'ok', next);
      res.json({ ok: true, ...next });
    } catch (e) {
      audit(req, 'editor_module_access.write', 'error', {
        message: String(e.message || e).slice(0, 200),
      });
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.get('/api/admin/role-data-view', requireAdmin, requireRole('admin'), (req, res) => {
    try {
      res.json({ editor: roleProfilesStore.getDataViewsForRole('editor') });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.put('/api/admin/role-data-view', requireAdmin, requireRole('admin'), (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const ed = body.editor && typeof body.editor === 'object' ? body.editor : {};
      const patch = {};
      DATA_VIEW_KEYS.forEach((k) => {
        patch[k] = ed[k] !== false;
      });
      roleProfilesStore.updateRole('editor', { dataViews: patch });
      const next = roleProfilesStore.getDataViewsForRole('editor');
      audit(req, 'role_data_view.write', 'ok', next);
      res.json({ ok: true, editor: next });
    } catch (e) {
      audit(req, 'role_data_view.write', 'error', {
        message: String(e.message || e).slice(0, 200),
      });
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.get('/api/admin/role-security-doc', requireAdmin, requireRole('admin'), (req, res) => {
    try {
      const p = roleProfilesStore.getRoleProfile('editor');
      res.json({ content: (p && p.securityNote) || '' });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.put('/api/admin/role-security-doc', requireAdmin, requireRole('admin'), (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const content = body.content != null ? String(body.content) : '';
      roleProfilesStore.updateRole('editor', { securityNote: content });
      audit(req, 'role_security_doc.write', 'ok', { bytes: Buffer.byteLength(content, 'utf-8') });
      res.json({ ok: true });
    } catch (e) {
      audit(req, 'role_security_doc.write', 'error', {
        message: String(e.message || e).slice(0, 200),
      });
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.get('/api/admin/dashboard', requireAdmin, async (req, res) => {
    try {
      const raw = visitStats.readStats(siteDatabase, VISIT_STATS_FILE);
      const topPaths = visitStats.topPaths(raw.byPath, 20);
      const dayKeys = Object.keys(raw.byDay || {}).sort();
      const byDayLast14 = {};
      dayKeys.slice(-14).forEach((d) => {
        byDayLast14[d] = raw.byDay[d];
      });
      const presence = await presenceStore.listOnline();
      const inviteCodes = inviteStore.listCodes(siteDatabase);
      const now = Date.now();
      res.json({
        visits: {
          total: raw.total || 0,
          docsPv: raw.docsPv || 0,
          indexPv: raw.indexPv || 0,
          extraPagePv: raw.extraPagePv || 0,
          updatedAt: raw.updatedAt || null,
        },
        topPaths,
        byDayLast14,
        sectionCount: ctx.getSectionCount(),
        presence: {
          backend: presence.backend,
          count: (presence.list && presence.list.length) || 0,
        },
        siteGuestSessions: siteSession.getSiteSessionCount(),
        inviteCodes: {
          total: inviteCodes.length,
          active: inviteCodes.filter((c) => c.exp > now).length,
        },
        cache: redisCache.getStats(),
      });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.get('/api/admin/redis', requireAdmin, requireRole('admin'), async (req, res) => {
    try {
      const st = await presenceStore.getStatus();
      const ping = await presenceStore.pingRedis();
      res.json({
        ok: true,
        redis: st,
        ping,
        cache: redisCache.getStats(),
      });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.post('/api/admin/redis/test', requireAdmin, requireRole('admin'), async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const url = body.url != null ? String(body.url).trim() : '';
      if (url) {
        const r = await presenceStore.testRedisUrl(url);
        return res.json(r);
      }
      const ping = await presenceStore.pingRedis();
      res.json({ ok: ping.ok, ping, redis: await presenceStore.getStatus() });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.post('/api/admin/redis/reset-cache-stats', requireAdmin, requireRole('admin'), (req, res) => {
    redisCache.resetStats();
    res.json({ ok: true });
  });

  app.post('/api/admin/login', (req, res) => {
    const ip = clientIp(req);
    if (isLoginBlocked(ip)) {
      audit(req, 'auth.login.blocked', 'deny', {});
      return res.status(429).json({
        error: '登录尝试过多，请稍后再试',
        requestId: req.requestId,
      });
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const username = String(body.username || '').trim();
    const pwd = body.password != null ? String(body.password) : '';
    let user = null;
    if (username) {
      user = adminUsersService.authenticate(username, pwd);
    } else {
      user = adminUsersService.authenticateLegacyPasswordOnly(pwd);
    }
    if (!user) {
      recordLoginFailure(ip);
      audit(req, 'auth.login.failure', 'deny', {});
      return res.status(401).json({
        error: '用户名或密码错误',
        requestId: req.requestId,
      });
    }
    clearLoginFailures(ip);
    const token = createSession(user);
    setSessionCookie(res, req, token);
    audit(req, 'auth.login.success', 'ok', {
      username: user.username,
      role: user.role,
      legacy: user.legacy === true,
    });
    res.json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
      requestId: req.requestId,
    });
  });

  app.get('/api/admin/webauthn/config', (req, res) => {
    if (!webauthnEnabled()) {
      return res.json({ enabled: false, rpId: null, rpName: null });
    }
    const { rpID, rpName } = getWebAuthnConfig(req);
    res.json({ enabled: true, rpId: rpID, rpName });
  });

  app.post('/api/admin/webauthn/authentication/options', async (req, res) => {
    if (!webauthnEnabled()) {
      return res.status(503).json({ error: '通行密钥未启用' });
    }
    const ip = clientIp(req);
    if (isLoginBlocked(ip)) {
      return res.status(429).json({ error: '登录尝试过多，请稍后再试' });
    }
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const username = String(body.username || '').trim();
      if (!username) return res.status(400).json({ error: '请输入用户名' });
      const u = adminUsersService.findUserByUsername(username);
      if (!u || u.disabled) {
        recordLoginFailure(ip);
        return res.status(401).json({ error: '用户不存在或已禁用' });
      }
      if (passkeyStore.countByUserId(u.id) === 0) {
        return res.status(400).json({ error: '该账号尚未绑定通行密钥' });
      }
      const { rpID } = getWebAuthnConfig(req);
      const allowCredentials = passkeyStore.listExcludeDescriptors(u.id);
      const options = await generateAuthenticationOptions({
        rpID,
        timeout: 60000,
        allowCredentials,
        userVerification: 'preferred',
      });
      const challengeId = webauthnChallenges.put({
        flow: 'auth',
        challenge: options.challenge,
        userId: u.id,
        username: u.username,
        role: u.role,
      });
      res.json({ options, challengeId });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.post('/api/admin/webauthn/authentication/verify', async (req, res) => {
    if (!webauthnEnabled()) {
      return res.status(503).json({ error: '通行密钥未启用' });
    }
    const ip = clientIp(req);
    if (isLoginBlocked(ip)) {
      return res.status(429).json({ error: '登录尝试过多，请稍后再试' });
    }
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const challengeId = String(body.challengeId || '').trim();
      const credential = body.credential;
      if (!challengeId || !credential) {
        return res.status(400).json({ error: '缺少参数' });
      }
      const ch = webauthnChallenges.take(challengeId);
      if (!ch || ch.flow !== 'auth' || !ch.challenge) {
        return res.status(400).json({ error: '验证已过期，请重试' });
      }
      const { rpID, origin } = getWebAuthnConfig(req);
      const credId = String(credential.id || '').trim() || String(credential.rawId || '').trim();
      const authenticator = passkeyStore.findAuthenticator(credId);
      if (!authenticator) {
        recordLoginFailure(ip);
        return res.status(401).json({ error: '凭证无效' });
      }
      const meta = passkeyStore.findRowMetaByCredentialId(credId);
      if (!meta || meta.user_id !== ch.userId) {
        recordLoginFailure(ip);
        return res.status(401).json({ error: '凭证与用户不匹配' });
      }
      const verification = await verifyAuthenticationResponse({
        response: credential,
        expectedChallenge: ch.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential: authenticator,
        requireUserVerification: false,
      });
      if (!verification.verified) {
        recordLoginFailure(ip);
        return res.status(401).json({ error: '通行密钥验证失败' });
      }
      const newCounter = verification.authenticationInfo.newCounter;
      passkeyStore.updateCounter(meta.id, newCounter);
      const user = adminUsersService.getUserById(ch.userId);
      if (!user || user.disabled) {
        recordLoginFailure(ip);
        return res.status(401).json({ error: '用户不可用' });
      }
      const sessionUser = {
        id: user.id,
        username: user.username,
        role: user.role,
        legacy: false,
      };
      clearLoginFailures(ip);
      const token = createSession(sessionUser);
      setSessionCookie(res, req, token);
      audit(req, 'auth.login.success', 'ok', {
        username: sessionUser.username,
        role: sessionUser.role,
        passkey: true,
      });
      res.json({
        ok: true,
        user: { id: sessionUser.id, username: sessionUser.username, role: sessionUser.role },
        requestId: req.requestId,
      });
    } catch (e) {
      recordLoginFailure(clientIp(req));
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  app.post('/api/admin/webauthn/registration/options', requireAdmin, requireRole('admin'), async (req, res) => {
    if (!webauthnEnabled()) {
      return res.status(503).json({ error: '通行密钥未启用' });
    }
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const userId = parseInt(body.userId, 10);
      if (!Number.isFinite(userId)) return res.status(400).json({ error: '无效 userId' });
      const target = adminUsersService.getUserById(userId);
      if (!target || target.disabled) {
        return res.status(400).json({ error: '用户不存在或已禁用' });
      }
      const { rpID, rpName, origin } = getWebAuthnConfig(req);
      const excludeCredentials = passkeyStore.listExcludeDescriptors(userId);
      const userID = new TextEncoder().encode(`ebu4-${userId}`);
      const options = await generateRegistrationOptions({
        rpName,
        rpID,
        userName: target.username,
        userDisplayName: target.username,
        userID,
        timeout: 120000,
        attestationType: 'none',
        excludeCredentials,
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'preferred',
        },
      });
      const challengeId = webauthnChallenges.put({
        flow: 'registration',
        challenge: options.challenge,
        userId,
        username: target.username,
      });
      res.json({ options, challengeId, origin, rpId: rpID });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.post('/api/admin/webauthn/registration/verify', requireAdmin, requireRole('admin'), async (req, res) => {
    if (!webauthnEnabled()) {
      return res.status(503).json({ error: '通行密钥未启用' });
    }
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const challengeId = String(body.challengeId || '').trim();
      const credential = body.credential;
      const label = String(body.label || '').trim().slice(0, 120) || '通行密钥';
      const userId = parseInt(body.userId, 10);
      if (!challengeId || !credential || !Number.isFinite(userId)) {
        return res.status(400).json({ error: '缺少参数' });
      }
      const ch = webauthnChallenges.take(challengeId);
      if (!ch || ch.flow !== 'registration' || ch.userId !== userId) {
        return res.status(400).json({ error: '注册已过期，请重试' });
      }
      const { rpID, origin } = getWebAuthnConfig(req);
      const verification = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge: ch.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: false,
      });
      if (!verification.verified || !verification.registrationInfo) {
        return res.status(400).json({ error: '通行密钥注册验证失败' });
      }
      const cred = verification.registrationInfo.credential;
      passkeyStore.insertPasskey({
        userId,
        credentialId: cred.id,
        publicKey: Buffer.from(cred.publicKey),
        counter: cred.counter,
        transports: cred.transports,
        label,
      });
      audit(req, 'admin.passkey.register', 'ok', { userId, credentialId: cred.id });
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  app.get('/api/admin/users/:id/passkeys', requireAdmin, requireRole('admin'), (req, res) => {
    if (!webauthnEnabled()) {
      return res.json({ passkeys: [], disabled: true });
    }
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ error: '无效 id' });
      if (!adminUsersService.getUserById(id)) return res.status(404).json({ error: '用户不存在' });
      const passkeys = passkeyStore.listPublicByUserId(id);
      res.json({ passkeys });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.delete('/api/admin/passkeys/:pkId', requireAdmin, requireRole('admin'), (req, res) => {
    try {
      passkeyStore.deleteByPk(req.params.pkId);
      audit(req, 'admin.passkey.delete', 'ok', { pkId: req.params.pkId });
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  app.post('/api/admin/logout', (req, res) => {
    const token = getCookie(req, SESSION_COOKIE);
    const had = !!(token && sessions.has(token));
    destroySession(token);
    clearSessionCookie(res, req);
    audit(req, 'auth.logout', 'ok', { hadSession: had });
    res.json({ ok: true, requestId: req.requestId });
  });

  app.get('/api/admin/session', (req, res) => {
    pruneSessions();
    const token = getCookie(req, SESSION_COOKIE);
    if (!token || !sessions.has(token)) {
      return res.json({ ok: false });
    }
    const sess = sessions.get(token);
    if (sess.exp < Date.now()) {
      sessions.delete(token);
      return res.json({ ok: false });
    }
    const capabilities = roleProfilesStore.getModuleAccessForRole(sess.role);
    const dataViews = roleProfilesStore.getDataViewsForRole(sess.role);
    const meta = roleProfilesStore.getRoleMetaForRole(sess.role);
    res.json({
      ok: true,
      user: {
        id: sess.userId,
        username: sess.username,
        role: sess.role,
        legacy: !!sess.legacy,
      },
      capabilities,
      dataViews,
      roleMeta: {
        label: meta.label,
        securityLevel: meta.securityLevel,
        securityNote: meta.securityNote,
      },
    });
  });

  app.get('/api/admin/users', requireAdmin, requireRole('admin'), (req, res) => {
    try {
      const users = adminUsersService.listUsersPublic();
      res.json({ users });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.post('/api/admin/users', requireAdmin, requireRole('admin'), (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const created = adminUsersService.createUser({
        username: body.username,
        password: body.password,
        role: body.role,
      });
      audit(req, 'admin_users.create', 'ok', {
        id: created.id,
        username: created.username,
        role: created.role,
      });
      res.json({ ok: true, user: created });
    } catch (e) {
      audit(req, 'admin_users.create', 'error', {
        message: String(e.message || e).slice(0, 200),
      });
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  app.put('/api/admin/users/:id', requireAdmin, requireRole('admin'), (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: '无效 id' });
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const row = adminUsersService.getUserById(id);
      if (!row) return res.status(404).json({ error: '用户不存在' });
      if (body.role !== undefined || body.disabled === true) {
        if (rowIsActiveAdmin(row)) {
          const n = adminUsersService.countAdmins();
          if (n <= 1) {
            if ((body.role !== undefined && body.role !== 'admin') || body.disabled === true) {
              return res.status(400).json({ error: '不能撤销或禁用最后一位管理员' });
            }
          }
        }
      }
      const patch = {};
      if (body.password !== undefined && body.password !== null && String(body.password).length > 0) {
        patch.password = String(body.password);
      }
      if (body.role !== undefined) patch.role = body.role;
      if (body.disabled !== undefined) patch.disabled = body.disabled;
      adminUsersService.updateUser(id, patch);
      audit(req, 'admin_users.update', 'ok', { id });
      res.json({ ok: true });
    } catch (e) {
      audit(req, 'admin_users.update', 'error', {
        message: String(e.message || e).slice(0, 200),
      });
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  app.delete('/api/admin/users/:id', requireAdmin, requireRole('admin'), (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: '无效 id' });
      }
      if (id === req.adminUser.userId) {
        return res.status(400).json({ error: '不能删除当前登录用户' });
      }
      const row = adminUsersService.getUserById(id);
      if (!row) return res.status(404).json({ error: '用户不存在' });
      if (rowIsActiveAdmin(row) && adminUsersService.countAdmins() <= 1) {
        return res.status(400).json({ error: '不能删除最后一位管理员' });
      }
      adminUsersService.deleteUser(id);
      audit(req, 'admin_users.delete', 'ok', { id });
      res.json({ ok: true });
    } catch (e) {
      audit(req, 'admin_users.delete', 'error', {
        message: String(e.message || e).slice(0, 200),
      });
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.post('/api/admin/upload/image', requireAdmin, requireEditorDataView('images'), (req, res) => {
    if (!IMG_DIR) return res.status(500).json({ error: '未配置图片目录' });
    imageUpload.single('file')(req, res, (err) => {
      if (err) {
        audit(req, 'media.image.upload', 'error', {
          message: String(err.message || err).slice(0, 200),
        });
        return res.status(400).json({ error: err.message || '上传失败' });
      }
      if (!req.file) {
        audit(req, 'media.image.upload', 'deny', { reason: 'no_file' });
        return res.status(400).json({ error: '未收到文件' });
      }
      audit(req, 'media.image.upload', 'ok', {
        filename: req.file.filename,
        size: req.file.size,
      });
      res.json({
        ok: true,
        url: '/img/' + req.file.filename,
        filename: req.file.filename,
      });
    });
  });

  app.get('/api/admin/images', requireAdmin, requireEditorDataView('images'), (req, res) => {
    if (!IMG_DIR) return res.json({ images: [] });
    try {
      ensureImageDir();
      if (!fs.existsSync(IMG_DIR)) return res.json({ images: [] });
      const names = fs.readdirSync(IMG_DIR);
      const out = [];
      for (const name of names) {
        if (name.startsWith('.')) continue;
        const full = path.join(IMG_DIR, name);
        let st;
        try {
          st = fs.statSync(full);
        } catch (_) {
          continue;
        }
        if (!st.isFile()) continue;
        out.push({
          name,
          url: '/img/' + name,
          size: st.size,
          mtime: st.mtime.toISOString(),
        });
      }
      out.sort((a, b) => b.mtime.localeCompare(a.mtime));
      res.json({ images: out.slice(0, 100) });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.delete('/api/admin/images/:name', requireAdmin, requireEditorDataView('images'), (req, res) => {
    if (!IMG_DIR) return res.status(500).json({ error: '未配置图片目录' });
    const name = safeImageBasename(req.params.name);
    if (!name) return res.status(400).json({ error: '无效文件名' });
    const full = path.join(IMG_DIR, name);
    const root = path.resolve(IMG_DIR);
    const resolved = path.resolve(full);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      return res.status(400).json({ error: '无效路径' });
    }
    try {
      if (!fs.existsSync(full)) return res.status(404).json({ error: '文件不存在' });
      fs.unlinkSync(full);
      audit(req, 'media.image.delete', 'ok', { name });
      res.json({ ok: true });
    } catch (e) {
      audit(req, 'media.image.delete', 'error', {
        message: String(e.message || e).slice(0, 200),
      });
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.get('/api/admin/stats', requireAdmin, requireEditorDataView('stats'), (req, res) => {
    const siteStorage = siteDatabase.isSiteSqlite() ? 'sqlite' : 'file';
    let mdStat = null;
    let toolsStat = null;
    let landingStat = null;
    let seoStat = null;
    let extraPagesStat = null;
    if (!siteDatabase.isSiteSqlite()) {
      try {
        mdStat = fs.statSync(MD_PATH);
      } catch (_) {}
      try {
        toolsStat = fs.statSync(TOOLS_JSON_PATH);
      } catch (_) {}
      try {
        landingStat = fs.statSync(LANDING_JSON_PATH);
      } catch (_) {}
      try {
        seoStat = fs.statSync(SEO_JSON_PATH);
      } catch (_) {}
      if (EXTRA_PAGES_PATH) {
        try {
          extraPagesStat = fs.statSync(EXTRA_PAGES_PATH);
        } catch (_) {}
      }
    }
    const mainDocMeta = siteDatabase.isSiteSqlite() ? siteDatabase.mainDocMeta() : null;
    res.json({
      siteStorage,
      siteDbPath: siteDatabase.isSiteSqlite() ? siteDatabase.resolveDbPath() : null,
      siteKv: siteDatabase.isSiteSqlite() ? siteDatabase.kvMeta() : null,
      markdownPath: MD_PATH,
      toolsJsonPath: TOOLS_JSON_PATH,
      landingJsonPath: LANDING_JSON_PATH,
      seoJsonPath: SEO_JSON_PATH,
      extraPagesStorage: extraPagesRepo.isSqlite() ? 'sqlite' : 'file',
      extraPagesPath: EXTRA_PAGES_PATH || null,
      markdown: siteDatabase.isSiteSqlite()
        ? mainDocMeta
          ? { size: mainDocMeta.bytes, mtime: mainDocMeta.updated_at }
          : null
        : mdStat
          ? { size: mdStat.size, mtime: mdStat.mtime.toISOString() }
          : null,
      toolsJson: siteDatabase.isSiteSqlite()
        ? (() => {
            const m = (siteDatabase.kvMeta() || []).find((r) => r.key === 'tools_nav');
            return m ? { size: m.bytes, mtime: m.updated_at } : null;
          })()
        : toolsStat
          ? { size: toolsStat.size, mtime: toolsStat.mtime.toISOString() }
          : null,
      landingJson: siteDatabase.isSiteSqlite()
        ? (() => {
            const m = (siteDatabase.kvMeta() || []).find((r) => r.key === 'landing');
            return m ? { size: m.bytes, mtime: m.updated_at } : null;
          })()
        : landingStat
          ? { size: landingStat.size, mtime: landingStat.mtime.toISOString() }
          : null,
      seoJson: siteDatabase.isSiteSqlite()
        ? (() => {
            const m = (siteDatabase.kvMeta() || []).find((r) => r.key === 'seo');
            return m ? { size: m.bytes, mtime: m.updated_at } : null;
          })()
        : seoStat
          ? { size: seoStat.size, mtime: seoStat.mtime.toISOString() }
          : null,
      extraPagesJson: siteDatabase.isSiteSqlite()
        ? null
        : extraPagesStat
          ? { size: extraPagesStat.size, mtime: extraPagesStat.mtime.toISOString() }
          : null,
      sectionCount: ctx.getSectionCount(),
    });
  });

  app.get('/api/admin/files/markdown', requireAdmin, requireEditorDataView('mainDoc'), (req, res) => {
    const slug = requireExistingMainDocSlug(req, res);
    if (slug == null) return;
    try {
      let content = siteDatabase.getMainMarkdownForSlug(slug) || '';
      if (content === '' && slug === siteDatabase.getDefaultMainDocSlug() && fs.existsSync(MD_PATH)) {
        content = fs.readFileSync(MD_PATH, 'utf-8');
      }
      res.json({ content, doc: slug });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.put('/api/admin/files/markdown', requireAdmin, requireEditorDataView('mainDoc'), (req, res) => {
    const slug = requireExistingMainDocSlug(req, res);
    if (slug == null) return;
    const content = req.body && typeof req.body.content === 'string' ? req.body.content : null;
    if (content === null) {
      return res.status(400).json({ error: '缺少 content 字段' });
    }
    try {
      docAdmin.writeFullMarkdown(content, slug);
      audit(req, 'file.markdown.write', 'ok', {
        doc: slug,
        bytes: Buffer.byteLength(content, 'utf-8'),
        sectionCount: ctx.getSectionCount(),
      });
      res.json({ ok: true, sectionCount: ctx.getSectionCount(), doc: slug });
    } catch (e) {
      audit(req, 'file.markdown.write', 'error', {
        message: String(e.message || e).slice(0, 200),
      });
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.get('/api/admin/docs/main-docs', requireAdmin, requireEditorDataView('mainDoc'), (req, res) => {
    try {
      const docs = siteDatabase.listMainDocuments();
      res.json({ docs });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.post('/api/admin/docs/main-docs', requireAdmin, requireEditorDataView('mainDoc'), (req, res) => {
    const slugIn = req.body && req.body.slug != null ? String(req.body.slug) : '';
    const titleIn = req.body && req.body.title != null ? String(req.body.title) : '';
    try {
      const slug = siteDatabase.createMainDocument({ slug: slugIn, title: titleIn });
      reloadDocData();
      audit(req, 'docs.main.create', 'ok', { slug });
      res.json({ ok: true, slug });
    } catch (e) {
      audit(req, 'docs.main.create', 'error', { message: String(e.message || e).slice(0, 200) });
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  app.patch('/api/admin/docs/main-docs/:slug', requireAdmin, requireEditorDataView('mainDoc'), (req, res) => {
    const slug = siteDatabase.normalizeMainDocSlug(req.params.slug);
    if (!slug) return res.status(400).json({ error: '无效 slug' });
    const title = req.body && req.body.title != null ? String(req.body.title) : '';
    try {
      siteDatabase.updateMainDocumentTitle(slug, title);
      reloadDocData();
      audit(req, 'docs.main.update', 'ok', { slug });
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  app.delete('/api/admin/docs/main-docs/:slug', requireAdmin, requireEditorDataView('mainDoc'), (req, res) => {
    const slug = siteDatabase.normalizeMainDocSlug(req.params.slug);
    if (!slug) return res.status(400).json({ error: '无效 slug' });
    try {
      siteDatabase.deleteMainDocument(slug);
      reloadDocData();
      audit(req, 'docs.main.delete', 'ok', { slug });
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  app.post(
    '/api/admin/docs/main-docs/:slug/set-default',
    requireAdmin,
    requireEditorDataView('mainDoc'),
    (req, res) => {
      const slug = siteDatabase.normalizeMainDocSlug(req.params.slug);
      if (!slug) return res.status(400).json({ error: '无效 slug' });
      try {
        siteDatabase.setDefaultMainDocSlug(slug);
        reloadDocData();
        audit(req, 'docs.main.setDefault', 'ok', { slug });
        res.json({ ok: true });
      } catch (e) {
        res.status(400).json({ error: String(e.message || e) });
      }
    }
  );

  app.get('/api/admin/docs/sections', requireAdmin, requireEditorDataView('mainDoc'), (req, res) => {
    const slug = requireExistingMainDocSlug(req, res);
    if (slug == null) return;
    try {
      const sections = docAdmin.readSectionsFromDisk(slug);
      res.json({
        doc: slug,
        sections: sections.map((s) => ({
          id: s.id,
          title: s.title,
          slug: s.slug,
          chars: (s.content && s.content.length) || 0,
        })),
      });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.get('/api/admin/docs/sections/:id', requireAdmin, requireEditorDataView('mainDoc'), (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: '无效 id' });
    }
    const slug = requireExistingMainDocSlug(req, res);
    if (slug == null) return;
    try {
      const sections = docAdmin.readSectionsFromDisk(slug);
      const section = sections.find((s) => s.id === id);
      if (!section) return res.status(404).json({ error: '章节不存在' });
      res.json({
        doc: slug,
        id: section.id,
        title: section.title,
        slug: section.slug,
        content: section.content,
      });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.put('/api/admin/docs/sections/:id', requireAdmin, requireEditorDataView('mainDoc'), (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: '无效 id' });
    }
    const slug = requireExistingMainDocSlug(req, res);
    if (slug == null) return;
    const content = req.body && typeof req.body.content === 'string' ? req.body.content : null;
    if (content === null) {
      return res.status(400).json({ error: '缺少 content 字段' });
    }
    try {
      const sections = docAdmin.readSectionsFromDisk(slug);
      const next = docMd.replaceSection(sections, id, content);
      docAdmin.persistSections(next, slug);
      audit(req, 'docs.section.update', 'ok', {
        doc: slug,
        sectionId: id,
        bytes: Buffer.byteLength(content, 'utf-8'),
      });
      res.json({ ok: true, sectionCount: ctx.getSectionCount(), doc: slug });
    } catch (e) {
      const code = e.code === 'VALIDATION' ? 400 : e.code === 'NOT_FOUND' ? 404 : 500;
      if (code >= 500) {
        audit(req, 'docs.section.update', 'error', {
          sectionId: id,
          message: String(e.message || e).slice(0, 200),
        });
      }
      res.status(code).json({ error: String(e.message || e) });
    }
  });

  app.post('/api/admin/docs/sections', requireAdmin, requireEditorDataView('mainDoc'), (req, res) => {
    const slug = requireExistingMainDocSlug(req, res);
    if (slug == null) return;
    const content = req.body && typeof req.body.content === 'string' ? req.body.content : null;
    if (content === null) {
      return res.status(400).json({ error: '缺少 content 字段' });
    }
    const afterId =
      req.body && Object.prototype.hasOwnProperty.call(req.body, 'afterId')
        ? req.body.afterId
        : null;
    try {
      const sections = docAdmin.readSectionsFromDisk(slug);
      const { sections: next, insertedId } = docMd.insertSection(sections, afterId, content);
      docAdmin.persistSections(next, slug);
      audit(req, 'docs.section.create', 'ok', {
        doc: slug,
        insertedId,
        afterId,
        bytes: Buffer.byteLength(content, 'utf-8'),
      });
      res.json({
        ok: true,
        sectionCount: ctx.getSectionCount(),
        insertedId,
        doc: slug,
      });
    } catch (e) {
      const code = e.code === 'VALIDATION' ? 400 : e.code === 'NOT_FOUND' ? 404 : 500;
      if (code >= 500) {
        audit(req, 'docs.section.create', 'error', {
          message: String(e.message || e).slice(0, 200),
        });
      }
      res.status(code).json({ error: String(e.message || e) });
    }
  });

  app.delete('/api/admin/docs/sections/:id', requireAdmin, requireEditorDataView('mainDoc'), (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: '无效 id' });
    }
    const slug = requireExistingMainDocSlug(req, res);
    if (slug == null) return;
    try {
      const sections = docAdmin.readSectionsFromDisk(slug);
      const next = docMd.deleteSection(sections, id);
      docAdmin.persistSections(next, slug);
      audit(req, 'docs.section.delete', 'ok', { sectionId: id, doc: slug });
      res.json({ ok: true, sectionCount: ctx.getSectionCount(), doc: slug });
    } catch (e) {
      const code = e.code === 'VALIDATION' ? 400 : e.code === 'NOT_FOUND' ? 404 : 500;
      if (code >= 500) {
        audit(req, 'docs.section.delete', 'error', {
          sectionId: id,
          message: String(e.message || e).slice(0, 200),
        });
      }
      res.status(code).json({ error: String(e.message || e) });
    }
  });

  app.post('/api/admin/docs/sections/move', requireAdmin, requireEditorDataView('mainDoc'), (req, res) => {
    const slug = requireExistingMainDocSlug(req, res);
    if (slug == null) return;
    const id = req.body && req.body.id != null ? parseInt(req.body.id, 10) : NaN;
    const delta = req.body && req.body.delta != null ? parseInt(req.body.delta, 10) : NaN;
    if (Number.isNaN(id) || (delta !== -1 && delta !== 1)) {
      return res.status(400).json({ error: '需要 id 与 delta（-1 或 1）' });
    }
    try {
      const sections = docAdmin.readSectionsFromDisk(slug);
      const next = docMd.moveSection(sections, id, delta);
      docAdmin.persistSections(next, slug);
      audit(req, 'docs.section.move', 'ok', { sectionId: id, delta, doc: slug });
      res.json({ ok: true, sectionCount: ctx.getSectionCount(), doc: slug });
    } catch (e) {
      const code = e.code === 'VALIDATION' ? 400 : e.code === 'NOT_FOUND' ? 404 : 500;
      if (code >= 500) {
        audit(req, 'docs.section.move', 'error', {
          message: String(e.message || e).slice(0, 200),
        });
      }
      res.status(code).json({ error: String(e.message || e) });
    }
  });

  app.put('/api/admin/docs/sections/reorder', requireAdmin, requireEditorDataView('mainDoc'), (req, res) => {
    const slug = requireExistingMainDocSlug(req, res);
    if (slug == null) return;
    const order = req.body && Array.isArray(req.body.order) ? req.body.order : null;
    if (!order) {
      return res.status(400).json({ error: '缺少 order 数组' });
    }
    try {
      const sections = docAdmin.readSectionsFromDisk(slug);
      const next = docMd.reorderSections(sections, order);
      docAdmin.persistSections(next, slug);
      audit(req, 'docs.section.reorder', 'ok', { orderLen: order.length, doc: slug });
      res.json({ ok: true, sectionCount: ctx.getSectionCount(), doc: slug });
    } catch (e) {
      const code = e.code === 'VALIDATION' ? 400 : 500;
      if (code >= 500) {
        audit(req, 'docs.section.reorder', 'error', {
          message: String(e.message || e).slice(0, 200),
        });
      }
      res.status(code).json({ error: String(e.message || e) });
    }
  });

  app.get('/api/admin/files/tools-json', requireAdmin, requireEditorDataView('tools'), (req, res) => {
    try {
      if (siteDatabase.isSiteSqlite()) {
        const raw = siteDatabase.getKv('tools_nav');
        return res.json({ content: raw || '' });
      }
      if (!fs.existsSync(TOOLS_JSON_PATH)) {
        return res.json({ content: '' });
      }
      const content = fs.readFileSync(TOOLS_JSON_PATH, 'utf-8');
      res.json({ content });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.put('/api/admin/files/tools-json', requireAdmin, requireEditorDataView('tools'), (req, res) => {
    const raw = req.body && typeof req.body.content === 'string' ? req.body.content : null;
    if (raw === null) {
      return res.status(400).json({ error: '缺少 content 字段' });
    }
    try {
      JSON.parse(raw);
    } catch (e) {
      return res.status(400).json({ error: '不是合法 JSON：' + String(e.message || e) });
    }
    try {
      if (siteDatabase.isSiteSqlite()) {
        siteDatabase.setKv('tools_nav', raw);
        audit(req, 'file.tools_json.write', 'ok', {
          bytes: Buffer.byteLength(raw, 'utf-8'),
        });
        redisCache.bumpEpoch();
        return res.json({ ok: true });
      }
      const dir = path.dirname(TOOLS_JSON_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (fs.existsSync(TOOLS_JSON_PATH)) {
        backupWithPrune(TOOLS_JSON_PATH, backupKeepCount);
      }
      fs.writeFileSync(TOOLS_JSON_PATH, raw, 'utf-8');
      audit(req, 'file.tools_json.write', 'ok', {
        bytes: Buffer.byteLength(raw, 'utf-8'),
      });
      redisCache.bumpEpoch();
      res.json({ ok: true });
    } catch (e) {
      audit(req, 'file.tools_json.write', 'error', {
        message: String(e.message || e).slice(0, 200),
      });
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.get('/api/admin/files/tools-site', requireAdmin, requireEditorDataView('tools'), (req, res) => {
    try {
      let raw;
      if (siteDatabase.isSiteSqlite()) {
        raw = siteDatabase.getKv('tools_nav');
        if (!raw) return res.json({ site: {} });
      } else {
        if (!fs.existsSync(TOOLS_JSON_PATH)) {
          return res.json({ site: {} });
        }
        raw = fs.readFileSync(TOOLS_JSON_PATH, 'utf-8');
      }
      const obj = JSON.parse(raw);
      res.json({ site: obj.site && typeof obj.site === 'object' ? obj.site : {} });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.put('/api/admin/files/tools-site', requireAdmin, requireEditorDataView('tools'), (req, res) => {
    const site = req.body && req.body.site && typeof req.body.site === 'object' ? req.body.site : null;
    if (!site) {
      return res.status(400).json({ error: '缺少 site 对象' });
    }
    try {
      let raw;
      if (siteDatabase.isSiteSqlite()) {
        raw = siteDatabase.getKv('tools_nav');
        if (!raw) {
          return res.status(404).json({ error: 'tools 配置不存在' });
        }
      } else {
        if (!fs.existsSync(TOOLS_JSON_PATH)) {
          return res.status(404).json({ error: 'tools-nav.json 不存在' });
        }
        raw = fs.readFileSync(TOOLS_JSON_PATH, 'utf-8');
      }
      const obj = JSON.parse(raw);
      obj.site = Object.assign({}, obj.site || {}, site);
      const out = JSON.stringify(obj);
      if (siteDatabase.isSiteSqlite()) {
        siteDatabase.setKv('tools_nav', out);
      } else {
        if (fs.existsSync(TOOLS_JSON_PATH)) {
          backupWithPrune(TOOLS_JSON_PATH, backupKeepCount);
        }
        fs.writeFileSync(TOOLS_JSON_PATH, out, 'utf-8');
      }
      audit(req, 'file.tools_site.write', 'ok', {});
      redisCache.bumpEpoch();
      res.json({ ok: true });
    } catch (e) {
      audit(req, 'file.tools_site.write', 'error', {
        message: String(e.message || e).slice(0, 200),
      });
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  function readToolsNavObject() {
    try {
      let raw;
      if (siteDatabase.isSiteSqlite()) {
        raw = siteDatabase.getKv('tools_nav');
        if (!raw) return null;
      } else {
        if (!fs.existsSync(TOOLS_JSON_PATH)) return null;
        raw = fs.readFileSync(TOOLS_JSON_PATH, 'utf-8');
      }
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function persistToolsNavObject(obj) {
    const out = JSON.stringify(obj);
    if (siteDatabase.isSiteSqlite()) {
      siteDatabase.setKv('tools_nav', out);
      return;
    }
    const dir = path.dirname(TOOLS_JSON_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(TOOLS_JSON_PATH)) {
      backupWithPrune(TOOLS_JSON_PATH, backupKeepCount);
    }
    fs.writeFileSync(TOOLS_JSON_PATH, out, 'utf-8');
  }

  function normalizeToolsItem(it) {
    if (!it || typeof it !== 'object') return null;
    const url = String(it.url || '').trim();
    if (!url) return null;
    const o = {
      name: String(it.name || '').trim() || url,
      url,
      category: String(it.category || '其他').trim() || '其他',
      description: it.description != null ? String(it.description) : '',
      domain: it.domain != null ? String(it.domain).trim() : '',
    };
    if (typeof it.favicon_base64 === 'string' && it.favicon_base64.startsWith('data:')) {
      o.favicon_base64 = it.favicon_base64;
    }
    return o;
  }

  function buildToolsNavFromPayload(body, existing) {
    const ex = existing && typeof existing === 'object' ? existing : {};
    const site =
      body.site && typeof body.site === 'object'
        ? Object.assign({}, ex.site || {}, body.site)
        : ex.site && typeof ex.site === 'object'
          ? ex.site
          : {};
    let categories = Array.isArray(body.categories)
      ? body.categories.map((c) => String(c).trim()).filter(Boolean)
      : [];
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const items = [];
    for (const it of rawItems) {
      const n = normalizeToolsItem(it);
      if (n) items.push(n);
    }
    const seen = new Set(categories);
    for (const it of items) {
      if (!seen.has(it.category)) {
        seen.add(it.category);
        categories.push(it.category);
      }
    }
    if (!categories.length && items.length) {
      const g = new Map();
      for (const it of items) {
        if (!g.has(it.category)) g.set(it.category, true);
      }
      categories = [...g.keys()];
    }
    const favicon_map =
      ex.favicon_map && typeof ex.favicon_map === 'object' ? ex.favicon_map : {};
    return { site, categories, items, favicon_map };
  }

  app.get('/api/admin/tools-nav', requireAdmin, requireEditorDataView('tools'), (req, res) => {
    try {
      const obj = readToolsNavObject();
      if (!obj) {
        return res.json({
          site: {},
          categories: [],
          items: [],
          favicon_map: {},
        });
      }
      res.json({
        site: obj.site && typeof obj.site === 'object' ? obj.site : {},
        categories: Array.isArray(obj.categories) ? obj.categories : [],
        items: Array.isArray(obj.items) ? obj.items : [],
        favicon_map:
          obj.favicon_map && typeof obj.favicon_map === 'object' ? obj.favicon_map : {},
      });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.put('/api/admin/tools-nav', requireAdmin, requireEditorDataView('tools'), (req, res) => {
    try {
      const existing = readToolsNavObject();
      const next = buildToolsNavFromPayload(req.body || {}, existing);
      if (!next.items.length && req.body && Array.isArray(req.body.items) && req.body.items.length) {
        return res.status(400).json({ error: '无有效条目：每条需至少包含非空 url' });
      }
      persistToolsNavObject(next);
      audit(req, 'tools_nav.structured.write', 'ok', {
        categories: next.categories.length,
        items: next.items.length,
      });
      redisCache.bumpEpoch();
      res.json({ ok: true, categories: next.categories.length, items: next.items.length });
    } catch (e) {
      audit(req, 'tools_nav.structured.write', 'error', {
        message: String(e.message || e).slice(0, 200),
      });
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.get('/api/admin/files/landing-json', requireAdmin, requireEditorDataView('landing'), (req, res) => {
    try {
      if (siteDatabase.isSiteSqlite()) {
        const raw = siteDatabase.getKv('landing');
        return res.json({ content: raw || '' });
      }
      if (!fs.existsSync(LANDING_JSON_PATH)) {
        return res.json({ content: '' });
      }
      const content = fs.readFileSync(LANDING_JSON_PATH, 'utf-8');
      res.json({ content });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.put('/api/admin/files/landing-json', requireAdmin, requireEditorDataView('landing'), (req, res) => {
    const raw = req.body && typeof req.body.content === 'string' ? req.body.content : null;
    if (raw === null) {
      return res.status(400).json({ error: '缺少 content 字段' });
    }
    try {
      JSON.parse(raw);
    } catch (e) {
      return res.status(400).json({ error: '不是合法 JSON：' + String(e.message || e) });
    }
    try {
      if (siteDatabase.isSiteSqlite()) {
        siteDatabase.setKv('landing', raw);
        audit(req, 'file.landing_json.write', 'ok', {
          bytes: Buffer.byteLength(raw, 'utf-8'),
        });
        redisCache.bumpEpoch();
        return res.json({ ok: true });
      }
      const dir = path.dirname(LANDING_JSON_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (fs.existsSync(LANDING_JSON_PATH)) {
        backupWithPrune(LANDING_JSON_PATH, backupKeepCount);
      }
      fs.writeFileSync(LANDING_JSON_PATH, raw, 'utf-8');
      audit(req, 'file.landing_json.write', 'ok', {
        bytes: Buffer.byteLength(raw, 'utf-8'),
      });
      redisCache.bumpEpoch();
      res.json({ ok: true });
    } catch (e) {
      audit(req, 'file.landing_json.write', 'error', {
        message: String(e.message || e).slice(0, 200),
      });
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.get('/api/admin/files/seo-json', requireAdmin, requireAdminOrEditorCapability('seo'), (req, res) => {
    try {
      if (siteDatabase.isSiteSqlite()) {
        const raw = siteDatabase.getKv('seo');
        return res.json({ content: raw || '' });
      }
      if (!fs.existsSync(SEO_JSON_PATH)) {
        return res.json({ content: '' });
      }
      const content = fs.readFileSync(SEO_JSON_PATH, 'utf-8');
      res.json({ content });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.put('/api/admin/files/seo-json', requireAdmin, requireAdminOrEditorCapability('seo'), (req, res) => {
    const raw = req.body && typeof req.body.content === 'string' ? req.body.content : null;
    if (raw === null) {
      return res.status(400).json({ error: '缺少 content 字段' });
    }
    try {
      JSON.parse(raw);
    } catch (e) {
      return res.status(400).json({ error: '不是合法 JSON：' + String(e.message || e) });
    }
    try {
      if (siteDatabase.isSiteSqlite()) {
        siteDatabase.setKv('seo', raw);
        audit(req, 'file.seo_json.write', 'ok', {
          bytes: Buffer.byteLength(raw, 'utf-8'),
        });
        redisCache.bumpEpoch();
        return res.json({ ok: true });
      }
      const dir = path.dirname(SEO_JSON_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (fs.existsSync(SEO_JSON_PATH)) {
        backupWithPrune(SEO_JSON_PATH, backupKeepCount);
      }
      fs.writeFileSync(SEO_JSON_PATH, raw, 'utf-8');
      audit(req, 'file.seo_json.write', 'ok', {
        bytes: Buffer.byteLength(raw, 'utf-8'),
      });
      redisCache.bumpEpoch();
      res.json({ ok: true });
    } catch (e) {
      audit(req, 'file.seo_json.write', 'error', {
        message: String(e.message || e).slice(0, 200),
      });
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.get('/api/admin/pages', requireAdmin, requireEditorDataView('extraPages'), async (req, res) => {
    try {
      const store = await extraPagesRepo.readStore();
      res.json({
        pages: store.pages.map((p) => extraPagesStore.enrichPage(p)),
      });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.get('/api/admin/pages/:id', requireAdmin, requireEditorDataView('extraPages'), async (req, res) => {
    try {
      const { id } = req.params;
      const store = await extraPagesRepo.readStore();
      const page = store.pages.find((p) => p.id === id);
      if (!page) return res.status(404).json({ error: '页面不存在' });
      res.json({ page: extraPagesStore.enrichPage(page) });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.post('/api/admin/pages', requireAdmin, requireEditorDataView('extraPages'), async (req, res) => {
    if (!extraPagesRepo.isSqlite() && !EXTRA_PAGES_PATH) {
      return res.status(500).json({ error: '未配置扩展内容存储路径' });
    }
    try {
      const store = await extraPagesRepo.readStore();
      const { page } = extraPagesAdmin.createPage(req.body, store);
      await extraPagesRepo.insertPage(page);
      audit(req, 'pages.create', 'ok', {
        id: page.id,
        slug: page.slug,
        status: page.status,
        format: page.format,
      });
      redisCache.bumpEpoch();
      res.json({ ok: true, page: extraPagesStore.enrichPage(page) });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.put('/api/admin/pages/:id', requireAdmin, requireEditorDataView('extraPages'), async (req, res) => {
    if (!extraPagesRepo.isSqlite() && !EXTRA_PAGES_PATH) {
      return res.status(500).json({ error: '未配置扩展内容存储路径' });
    }
    try {
      const { id } = req.params;
      const store = await extraPagesRepo.readStore();
      const result = extraPagesAdmin.updatePage(id, req.body, store);
      if (!result.ok) {
        return res.status(result.status).json({ error: result.error });
      }
      if (extraPagesRepo.isSqlite()) {
        await extraPagesRepo.updatePageRow(result.page);
      } else {
        extraPagesRepo.writeFileStore(store);
      }
      audit(req, 'pages.update', 'ok', {
        id,
        slug: result.page.slug,
        status: result.page.status,
      });
      redisCache.bumpEpoch();
      res.json({ ok: true, page: extraPagesStore.enrichPage(result.page) });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.delete('/api/admin/pages/:id', requireAdmin, requireEditorDataView('extraPages'), async (req, res) => {
    if (!extraPagesRepo.isSqlite() && !EXTRA_PAGES_PATH) {
      return res.status(500).json({ error: '未配置扩展内容存储路径' });
    }
    try {
      const { id } = req.params;
      if (extraPagesRepo.isSqlite()) {
        const ok = await extraPagesRepo.deletePageById(id);
        if (!ok) return res.status(404).json({ error: '页面不存在' });
      } else {
        const store = await extraPagesRepo.readStore();
        const result = extraPagesAdmin.deletePage(id, store);
        if (!result.ok) {
          return res.status(result.status).json({ error: result.error });
        }
        extraPagesRepo.writeFileStore(result.store);
      }
      audit(req, 'pages.delete', 'ok', { id });
      redisCache.bumpEpoch();
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

}

module.exports = { registerAdminRoutes };
