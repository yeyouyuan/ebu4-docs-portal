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
const extraPagesRepo = require('./extra-pages-repo');
const visitStats = require('./visit-stats');
const roleProfilesStore = require('./role-profiles-store');
const presenceStore = require('./presence-store');
const inviteStore = require('./invite-store');
const siteSession = require('./site-session');
const { normalizeSiteSettings } = require('./lib/site-settings-normalize');
const { normalizeAiSettings } = require('./lib/ai-settings-normalize');
const {
  readNormalizedAiSettings,
  writeNormalizedAiSettings,
} = require('./lib/ai-settings-store');
const { normalizeSeoConfig } = require('./lib/seo-config-normalize');
const { buildSeoSitemapRelPaths, normalizeOrigin } = require('./lib/seo-sitemap');
const {
  sanitizeSiteSettingsForAdminGet,
  sanitizeAiSettingsForAdminGet,
  sanitizeAuditEntries,
} = require('./lib/admin-sensitive');
const { sendAdminError } = require('./lib/api-response');
const {
  validateNormalizedAiSettings,
  validateAiTestRequest,
} = require('./lib/ai-settings-validate');
const { validateSeoConfig, validateSeoPushRequest } = require('./lib/seo-admin-validate');
const {
  validateUpgradeConfig,
  validateUpgradeApplyRequest,
  validateBuildArtifactsRequest,
} = require('./lib/upgrade-admin-validate');
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

let cachedUpgradeDeps = null;
let cachedSeoPushRunner = null;
let cachedBlogFetchReport = null;
let cachedExtraPagesAdmin = null;
let cachedPersonalWeeklyReportGenerator = null;
let cachedRunAiChat = null;
let cachedWeeklyDocxExport = null;

function getUpgradeDeps() {
  if (cachedUpgradeDeps) return cachedUpgradeDeps;
  const upgradeService = require('./lib/upgrade-service');
  const {
    buildUpgradeArtifacts,
    listSystemPackageScopes,
    normalizeSystemPackageScopes,
  } = require('./lib/build-upgrade-artifacts');
  cachedUpgradeDeps = {
    upgradeService,
    buildUpgradeArtifacts,
    listSystemPackageScopes,
    normalizeSystemPackageScopes,
  };
  return cachedUpgradeDeps;
}

function getRunSeoPush() {
  if (cachedSeoPushRunner) return cachedSeoPushRunner;
  cachedSeoPushRunner = require('./lib/seo-push-service').runSeoPush;
  return cachedSeoPushRunner;
}

function getFetchBlogsReport() {
  if (cachedBlogFetchReport) return cachedBlogFetchReport;
  cachedBlogFetchReport = require('./lib/blog-fetch-service').fetchBlogsReport;
  return cachedBlogFetchReport;
}

function getGeneratePersonalWeeklyReport() {
  if (cachedPersonalWeeklyReportGenerator) return cachedPersonalWeeklyReportGenerator;
  cachedPersonalWeeklyReportGenerator =
    require('./lib/personal-weekly-report-service').generatePersonalWeeklyReport;
  return cachedPersonalWeeklyReportGenerator;
}

function getRunAiChat() {
  if (cachedRunAiChat) return cachedRunAiChat;
  cachedRunAiChat = require('./lib/ai-provider-service').runAiChat;
  return cachedRunAiChat;
}

function getWeeklyDocxExport() {
  if (cachedWeeklyDocxExport) return cachedWeeklyDocxExport;
  cachedWeeklyDocxExport = require('./lib/docx-export-service');
  return cachedWeeklyDocxExport;
}

function getExtraPagesAdmin() {
  if (cachedExtraPagesAdmin) return cachedExtraPagesAdmin;
  cachedExtraPagesAdmin = require('./services/extra-pages-admin-service');
  return cachedExtraPagesAdmin;
}

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
    AI_SETTINGS_PATH,
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
  const siteRoot = ctx.siteRoot || path.join(__dirname, '..');
  const resolveUpgradeDeps = () => (ctx && ctx.upgradeDeps ? ctx.upgradeDeps : getUpgradeDeps());
  const runSeoPush = ctx && typeof ctx.runSeoPush === 'function' ? ctx.runSeoPush : getRunSeoPush();
  const runAiChatForAdmin = ctx && typeof ctx.runAiChat === 'function' ? ctx.runAiChat : getRunAiChat();
  const dashboardDeps =
    (ctx && ctx.dashboardDeps && typeof ctx.dashboardDeps === 'object' ? ctx.dashboardDeps : null) || {};
  const dashboardVisitStats = dashboardDeps.visitStats || visitStats;
  const dashboardPresenceStore = dashboardDeps.presenceStore || presenceStore;
  const dashboardInviteStore = dashboardDeps.inviteStore || inviteStore;
  const dashboardRedisCache = dashboardDeps.redisCache || redisCache;
  const dashboardSiteSession = dashboardDeps.siteSession || siteSession;

  function readNormalizedSiteSettings() {
    let raw = null;
    try {
      if (siteDatabase.isSiteSqlite()) {
        const kv = siteDatabase.getKv('site_settings');
        if (kv) raw = JSON.parse(kv);
      } else if (fs.existsSync(SITE_SETTINGS_PATH)) {
        raw = JSON.parse(fs.readFileSync(SITE_SETTINGS_PATH, 'utf-8'));
      }
    } catch (_) {}
    return normalizeSiteSettings(raw);
  }

  function readNormalizedSeoConfig() {
    let raw = null;
    try {
      if (siteDatabase.isSiteSqlite()) {
        const kv = siteDatabase.getKv('seo');
        if (kv) raw = JSON.parse(kv);
      } else if (fs.existsSync(SEO_JSON_PATH)) {
        raw = JSON.parse(fs.readFileSync(SEO_JSON_PATH, 'utf-8'));
      }
    } catch (_) {}
    return normalizeSeoConfig(raw);
  }

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
  const ADMIN_MENU_TAB_IDS = ['dash', 'md', 'tools', 'blogfetch', 'landing', 'site', 'upgrade', 'seo', 'audit', 'users', 'roles', 'redis'];
  /** 可单独「停用」侧栏项（含「菜单显示」meta 项） */
  const ADMIN_MENU_DISABLE_KEYS = [
    'dash',
    'md',
    'tools',
    'blogfetch',
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
      sendAdminError(req, res, 400, '无效 doc 参数');
      return null;
    }
    const list = siteDatabase.listMainDocuments();
    if (!list.some((d) => d.slug === slug)) {
      sendAdminError(req, res, 404, '主文档不存在');
      return null;
    }
    return slug;
  }

  function validateNonEmptyMarkdown(content, fieldLabel) {
    if (typeof content !== 'string') {
      return {
        ok: false,
        detail: [{ field: 'content', message: `缺少 ${fieldLabel || 'Markdown'} 内容` }],
      };
    }
    if (!String(content).trim()) {
      return {
        ok: false,
        detail: [{ field: 'content', message: `${fieldLabel || 'Markdown'} 不能为空` }],
      };
    }
    return { ok: true };
  }

  function getSectionCountForDoc(slug) {
    const s = slug || siteDatabase.getDefaultMainDocSlug();
    if (siteDatabase.isSiteSqlite()) {
      return siteDatabase.countSectionsForSlug(s);
    }
    return docAdmin.readSectionsFromDisk(s).length;
  }

  function historyActorMeta(req, source, summary) {
    const u = req && req.adminUser ? req.adminUser : null;
    return {
      source: String(source || 'manual'),
      summary: summary != null ? String(summary) : '',
      actorUserId: u && Number.isFinite(Number(u.userId)) ? Number(u.userId) : null,
      actorUsername: u && u.username ? String(u.username) : '',
    };
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
    const u = req && req.adminUser ? req.adminUser : null;
    auditLog.append({
      action,
      outcome,
      requestId: req && req.requestId,
      ip: clientIp(req),
      actor: u && u.username ? String(u.username) : 'admin',
      actorUserId: u && u.userId != null ? Number(u.userId) : null,
      actorUsername: u && u.username ? String(u.username) : '',
      actorRole: u && u.role ? String(u.role) : '',
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
      return sendAdminError(req, res, 401, '未登录或会话无效');
    }
    const sess = sessions.get(token);
    if (sess.exp < Date.now()) {
      sessions.delete(token);
      return sendAdminError(req, res, 401, '会话已过期，请重新登录');
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
        return sendAdminError(req, res, 401, '未登录或会话无效');
      }
      if (u.role !== role) {
        return sendAdminError(req, res, 403, '权限不足');
      }
      next();
    };
  }

  /** 模块能力：按当前登录用户的角色读取 role_profiles（见 role-profiles-store） */
  function requireAdminOrEditorCapability(capKey) {
    return (req, res, next) => {
      const u = req.adminUser;
      if (!u) {
        return sendAdminError(req, res, 401, '未登录或会话无效');
      }
      const caps = roleProfilesStore.getModuleAccessForRole(u.role);
      if (caps[capKey] === true) return next();
      return sendAdminError(req, res, 403, '权限不足');
    };
  }

  function requireInviteManager() {
    return (req, res, next) => {
      const u = req.adminUser;
      if (!u) {
        return sendAdminError(req, res, 401, '未登录或会话无效');
      }
      if (u.role === 'admin') return next();
      const caps = roleProfilesStore.getModuleAccessForRole(u.role);
      if (caps.inviteRegister === true) return next();
      return sendAdminError(req, res, 403, '权限不足');
    };
  }

  function requireInviteViewer() {
    return (req, res, next) => {
      const u = req.adminUser;
      if (!u) {
        return sendAdminError(req, res, 401, '未登录或会话无效');
      }
      if (u.role === 'admin') return next();
      return sendAdminError(req, res, 403, '权限不足');
    };
  }

  function canAccessPersonalWeeklyReport(req, row) {
    const u = req && req.adminUser ? req.adminUser : null;
    if (!u || !row) return false;
    if (u.role === 'admin') return true;
    return row.createdByUserId != null && Number(row.createdByUserId) === Number(u.userId);
  }

  function listDbBackupFiles() {
    if (!siteDatabase.isSiteSqlite()) return [];
    const dbPath = siteDatabase.resolveDbPath();
    const dir = path.dirname(dbPath);
    const base = path.basename(dbPath) + '.bak-';
    let names = [];
    try {
      names = fs.readdirSync(dir);
    } catch (_) {
      return [];
    }
    return names
      .filter((name) => name.startsWith(base))
      .map((name) => {
        const full = path.join(dir, name);
        try {
          const st = fs.statSync(full);
          if (!st.isFile()) return null;
          return {
            name,
            path: full,
            size: st.size,
            mtime: st.mtime.toISOString(),
          };
        } catch (_) {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => String(b.mtime).localeCompare(String(a.mtime)));
  }

  function buildSystemHealthSnapshot() {
    const siteSettings = readNormalizedSiteSettings();
    const aiSettings = readCurrentAiSettingsNormalized();
    const seo = readNormalizedSeoConfig();
    const checks = [];
    checks.push({
      key: 'site',
      title: '站点设置',
      status:
        siteSettings.maintenance && siteSettings.maintenance.enabled && siteSettings.maintenance.fullSite
          ? 'warning'
          : 'ok',
      summary:
        siteSettings.maintenance && siteSettings.maintenance.enabled && siteSettings.maintenance.fullSite
          ? '全站维护已开启'
          : '站点设置正常',
    });
    checks.push({
      key: 'ai',
      title: 'AI',
      status:
        aiSettings.enabled !== true
          ? 'warning'
          : aiSettings.defaultProvider &&
              aiSettings.providers &&
              aiSettings.providers[aiSettings.defaultProvider] &&
              aiSettings.providers[aiSettings.defaultProvider].enabled === true &&
              String(aiSettings.providers[aiSettings.defaultProvider].apiKey || '').trim()
            ? 'ok'
            : 'error',
      summary:
        aiSettings.enabled !== true
          ? '整体 AI 未启用'
          : aiSettings.defaultProvider &&
              aiSettings.providers &&
              aiSettings.providers[aiSettings.defaultProvider] &&
              aiSettings.providers[aiSettings.defaultProvider].enabled === true &&
              String(aiSettings.providers[aiSettings.defaultProvider].apiKey || '').trim()
            ? '默认 Provider 已就绪'
            : '默认 Provider 未完成配置',
    });
    checks.push({
      key: 'seo',
      title: 'SEO',
      status: seo.canonicalBase ? 'ok' : 'warning',
      summary: seo.canonicalBase ? 'canonicalBase 已配置' : 'canonicalBase 未配置',
    });
    checks.push({
      key: 'upgrade',
      title: '升级',
      status:
        siteSettings.upgrade && siteSettings.upgrade.enabled
          ? siteSettings.upgrade.baseUrl
            ? 'ok'
            : 'warning'
          : 'warning',
      summary:
        siteSettings.upgrade && siteSettings.upgrade.enabled
          ? siteSettings.upgrade.baseUrl
            ? '升级源已配置'
            : '升级已开启但缺少 baseUrl'
          : '升级未启用',
    });
    return { checks };
  }

  function safeDashboardSummary(message, fallback) {
    const text = message != null ? String(message).trim() : '';
    return text || fallback;
  }

  function buildDashboardRedisHealth(redisStatus, message) {
    const status = redisStatus && typeof redisStatus === 'object' ? redisStatus : {};
    if (message) {
      return {
        key: 'redis',
        title: 'Redis',
        status: 'error',
        summary: safeDashboardSummary(message, 'Redis 状态读取失败'),
      };
    }
    if (status.connected) {
      return {
        key: 'redis',
        title: 'Redis',
        status: 'ok',
        summary: 'Redis 已就绪',
      };
    }
    if (status.urlConfigured) {
      return {
        key: 'redis',
        title: 'Redis',
        status: 'warning',
        summary: 'Redis 已配置但未连接',
      };
    }
    return {
      key: 'redis',
      title: 'Redis',
      status: 'warning',
      summary: 'Redis 未配置',
    };
  }

  async function collectDashboardPart(task, fallback) {
    try {
      return {
        value: await task(),
        error: null,
      };
    } catch (error) {
      return {
        value: fallback,
        error: error ? String(error.message || error) : 'unknown_error',
      };
    }
  }

  function listAccessiblePersonalWeeklyReportsByIds(req, ids) {
    const nums = Array.isArray(ids)
      ? ids
          .map((id) => parseInt(id, 10))
          .filter((n) => Number.isFinite(n))
      : [];
    const seen = new Set();
    const list = [];
    nums.forEach((id) => {
      if (seen.has(id)) return;
      seen.add(id);
      const row = siteDatabase.getPersonalWeeklyReportById(id);
      if (row && canAccessPersonalWeeklyReport(req, row)) list.push(row);
    });
    return list;
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
      return sendAdminError(req, res, 429, '请求过于频繁，请稍后再试');
    }
    next();
  });

  /** 站点设置与审计：单独 Router 且靠前注册，避免在部分环境下落到 SPA 兜底 */
  const siteMetaRouter = express.Router();
  function readCurrentSiteSettingsRaw() {
    let raw = null;
    if (siteDatabase.isSiteSqlite()) {
      const kv = siteDatabase.getKv('site_settings');
      if (kv) raw = JSON.parse(kv);
    } else if (fs.existsSync(SITE_SETTINGS_PATH)) {
      raw = JSON.parse(fs.readFileSync(SITE_SETTINGS_PATH, 'utf-8'));
    }
    return raw;
  }
  function writeCurrentSiteSettingsNormalized(normalized) {
    const out = JSON.stringify(normalized);
    if (siteDatabase.isSiteSqlite()) {
      siteDatabase.setKv('site_settings', out);
      return;
    }
    const dir = path.dirname(SITE_SETTINGS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SITE_SETTINGS_PATH, out, 'utf-8');
  }
  function readCurrentAiSettingsNormalized() {
    return readNormalizedAiSettings(siteDatabase, AI_SETTINGS_PATH);
  }
  function writeCurrentAiSettings(normalized) {
    writeNormalizedAiSettings(siteDatabase, AI_SETTINGS_PATH, normalizeAiSettings(normalized));
  }
  function mergeAiSettingsSecrets(prevRaw, nextNormalized) {
    const prev = normalizeAiSettings(prevRaw || {});
    const out = JSON.parse(JSON.stringify(nextNormalized));
    const nextProviders = out.providers && typeof out.providers === 'object' ? out.providers : {};
    const prevProviders = prev.providers && typeof prev.providers === 'object' ? prev.providers : {};
    Object.keys(nextProviders).forEach((key) => {
      if (
        nextProviders[key] &&
        typeof nextProviders[key] === 'object' &&
        !String(nextProviders[key].apiKey || '').trim() &&
        prevProviders[key] &&
        String(prevProviders[key].apiKey || '').trim()
      ) {
        nextProviders[key].apiKey = String(prevProviders[key].apiKey);
      }
    });
    if (
      out.webSearch &&
      typeof out.webSearch === 'object' &&
      !String(out.webSearch.apiKey || '').trim() &&
      prev.webSearch &&
      String(prev.webSearch.apiKey || '').trim()
    ) {
      out.webSearch.apiKey = String(prev.webSearch.apiKey);
    }
    return out;
  }
  function siteSettingsRiskFlags(prev, next) {
    const flags = [];
    const p = prev && typeof prev === 'object' ? prev : {};
    const n = next && typeof next === 'object' ? next : {};
    if (!!(p.homepage && p.homepage.enabled) !== !!(n.homepage && n.homepage.enabled)) {
      flags.push('homepage.enabled');
    }
    if (
      !!(p.maintenance && p.maintenance.enabled) !==
      !!(n.maintenance && n.maintenance.enabled)
    ) {
      flags.push('maintenance.enabled');
    }
    if (
      !!(p.maintenance && p.maintenance.fullSite) !==
      !!(n.maintenance && n.maintenance.fullSite)
    ) {
      flags.push('maintenance.fullSite');
    }
    if (((p.embed && p.embed.aiChatHtml) || '') !== ((n.embed && n.embed.aiChatHtml) || '')) {
      flags.push('embed.aiChatHtml');
    }
    return flags;
  }
  function siteSettingsWarnings(next) {
    const out = [];
    if (next && next.maintenance && next.maintenance.enabled && next.maintenance.fullSite) {
      out.push('全站维护已开启：/docs 与公开 API 将返回 503。');
    }
    if (next && next.homepage && next.homepage.enabled === false) {
      out.push('门户首页已关闭：访问 / 与 /index 将重定向到 /docs。');
    }
    return out;
  }
  /** 站点设置：管理员或（编辑且配置开启 siteSettings） */
  siteMetaRouter.get('/site-settings', requireAdmin, requireAdminOrEditorCapability('siteSettings'), (req, res) => {
    try {
      let raw = null;
      raw = readCurrentSiteSettingsRaw();
      const normalized = normalizeSiteSettings(raw);
      const isAdmin = req.adminUser && req.adminUser.role === 'admin';
      if (!isAdmin) {
        delete normalized.redis;
        delete normalized.upgrade;
        return res.json(normalized);
      }
      return res.json(sanitizeSiteSettingsForAdminGet(normalized));
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
          prev = readCurrentSiteSettingsRaw() || {};
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
        if (isAdminUser && body.upgrade && typeof body.upgrade === 'object') {
          merged.upgrade = Object.assign({}, prev.upgrade || {}, body.upgrade);
          const au = body.upgrade.autoUpdate;
          if (au && typeof au === 'object') {
            merged.upgrade.autoUpdate = Object.assign(
              {},
              (prev.upgrade && prev.upgrade.autoUpdate) || {},
              au
            );
          }
        }
        if (isAdminUser && body.embed && typeof body.embed === 'object') {
          merged.embed = Object.assign({}, prev.embed || {}, body.embed);
        }
        const normalized = normalizeSiteSettings(merged);
        writeCurrentSiteSettingsNormalized(normalized);
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
  siteMetaRouter.get('/site-settings/draft', requireAdmin, requireAdminOrEditorCapability('siteSettings'), (req, res) => {
    try {
      const current = normalizeSiteSettings(readCurrentSiteSettingsRaw());
      if (!siteDatabase.isSiteSqlite()) {
        return res.json({ scope: 'default', content: current, fromDraft: false });
      }
      const d = siteDatabase.getSiteSettingsDraft('default');
      if (!d || !d.content_json) {
        return res.json({ scope: 'default', content: current, fromDraft: false });
      }
      const parsed = normalizeSiteSettings(JSON.parse(d.content_json));
      return res.json({
        scope: d.scope || 'default',
        content: parsed,
        fromDraft: true,
        updatedAt: d.updated_at || null,
        updatedByUserId: d.updated_by_user_id || null,
        updatedByUsername: d.updated_by_username || '',
      });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });
  siteMetaRouter.put('/site-settings/draft', requireAdmin, requireAdminOrEditorCapability('siteSettings'), (req, res) => {
    try {
      if (!siteDatabase.isSiteSqlite()) {
        return res.status(400).json({ error: '当前存储模式不支持草稿，请切换 SQLite 单库存储。' });
      }
      const isAdminUser = req.adminUser && req.adminUser.role === 'admin';
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const content = body.content && typeof body.content === 'object' ? body.content : null;
      if (!content) return res.status(400).json({ error: '需要 JSON 字段 content（对象）' });
      if (!isAdminUser) {
        if (!content.maintenance || typeof content.maintenance !== 'object') {
          return res.status(400).json({ error: '编辑角色仅可编辑 maintenance 草稿' });
        }
        const cur = normalizeSiteSettings(readCurrentSiteSettingsRaw());
        content.homepage = cur.homepage;
        content.registration = cur.registration;
        content.embed = cur.embed;
        content.redis = cur.redis;
        content.upgrade = cur.upgrade;
      }
      const normalized = normalizeSiteSettings(content);
      const draft = siteDatabase.upsertSiteSettingsDraft({
        scope: 'default',
        contentJson: JSON.stringify(normalized),
        updatedByUserId: req.adminUser && req.adminUser.userId,
        updatedByUsername: req.adminUser && req.adminUser.username,
      });
      audit(req, 'site_settings.draft.write', 'ok', {});
      res.json({
        ok: true,
        scope: 'default',
        content: normalized,
        updatedAt: draft && draft.updated_at ? draft.updated_at : null,
      });
    } catch (e) {
      audit(req, 'site_settings.draft.write', 'error', {
        message: String(e.message || e).slice(0, 200),
      });
      res.status(500).json({ error: String(e.message || e) });
    }
  });
  siteMetaRouter.post('/site-settings/validate', requireAdmin, requireAdminOrEditorCapability('siteSettings'), (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const content = body.content && typeof body.content === 'object' ? body.content : null;
      if (!content) return res.status(400).json({ error: '需要 JSON 字段 content（对象）' });
      const prev = normalizeSiteSettings(readCurrentSiteSettingsRaw());
      const next = normalizeSiteSettings(content);
      const riskFlags = siteSettingsRiskFlags(prev, next);
      const warnings = siteSettingsWarnings(next);
      res.json({ ok: true, normalized: next, riskFlags, warnings });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });
  siteMetaRouter.post('/site-settings/publish', requireAdmin, requireRole('admin'), async (req, res) => {
    try {
      if (!siteDatabase.isSiteSqlite()) {
        return res.status(400).json({ error: '当前存储模式不支持发布版本，请切换 SQLite 单库存储。' });
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const draft = siteDatabase.getSiteSettingsDraft('default');
      if (!draft || !draft.content_json) {
        return res.status(400).json({ error: '暂无草稿可发布' });
      }
      const next = normalizeSiteSettings(JSON.parse(draft.content_json));
      const prev = normalizeSiteSettings(readCurrentSiteSettingsRaw());
      const riskFlags = siteSettingsRiskFlags(prev, next);
      if (riskFlags.length && body.confirmRisk !== true) {
        return res.status(409).json({
          error: '存在高风险变更，请确认后发布',
          riskFlags,
          warnings: siteSettingsWarnings(next),
        });
      }
      const released = siteDatabase.createSiteSettingsRelease({
        scope: 'default',
        contentJson: JSON.stringify(next),
        summary: body.summary || '',
        riskFlagsJson: JSON.stringify(riskFlags),
        createdByUserId: req.adminUser && req.adminUser.userId,
        createdByUsername: req.adminUser && req.adminUser.username,
      });
      writeCurrentSiteSettingsNormalized(next);
      await presenceStore.applySiteSettingsAndReconnect(next.redis);
      audit(req, 'site_settings.publish', 'ok', {
        releaseId: released && released.id ? released.id : null,
        versionNo: released && released.version_no ? released.version_no : null,
        riskFlags,
      });
      res.json({
        ok: true,
        riskFlags,
        warnings: siteSettingsWarnings(next),
        release: released,
      });
    } catch (e) {
      audit(req, 'site_settings.publish', 'error', {
        message: String(e.message || e).slice(0, 200),
      });
      res.status(500).json({ error: String(e.message || e) });
    }
  });
  siteMetaRouter.get('/site-settings/releases', requireAdmin, requireAdminOrEditorCapability('siteSettings'), (req, res) => {
    try {
      if (!siteDatabase.isSiteSqlite()) return res.json({ releases: [], nextCursor: null });
      const releases = siteDatabase.listSiteSettingsReleases('default', {
        limit: req.query && req.query.limit,
        cursor: req.query && req.query.cursor,
      });
      const list = releases.map((r) => ({
        id: r.id,
        scope: r.scope,
        versionNo: r.version_no,
        summary: r.summary || '',
        riskFlags: (() => {
          try {
            return JSON.parse(r.risk_flags_json || '[]');
          } catch (_) {
            return [];
          }
        })(),
        createdByUserId: r.created_by_user_id || null,
        createdByUsername: r.created_by_username || '',
        createdAt: r.created_at || null,
      }));
      const nextCursor =
        list.length && list.length >= Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20))
          ? list[list.length - 1].id
          : null;
      res.json({ releases: list, nextCursor });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });
  siteMetaRouter.get('/site-settings/releases/:id', requireAdmin, requireAdminOrEditorCapability('siteSettings'), (req, res) => {
    try {
      if (!siteDatabase.isSiteSqlite()) return res.status(404).json({ error: '版本记录不可用' });
      const row = siteDatabase.getSiteSettingsReleaseById(req.params.id);
      if (!row) return res.status(404).json({ error: '版本不存在' });
      const content = normalizeSiteSettings(JSON.parse(row.content_json || '{}'));
      res.json({
        id: row.id,
        scope: row.scope,
        versionNo: row.version_no,
        content,
        summary: row.summary || '',
        riskFlags: (() => {
          try {
            return JSON.parse(row.risk_flags_json || '[]');
          } catch (_) {
            return [];
          }
        })(),
        createdByUserId: row.created_by_user_id || null,
        createdByUsername: row.created_by_username || '',
        createdAt: row.created_at || null,
      });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });
  siteMetaRouter.post('/site-settings/releases/:id/rollback', requireAdmin, requireRole('admin'), async (req, res) => {
    try {
      if (!siteDatabase.isSiteSqlite()) return res.status(400).json({ error: '版本回滚不可用' });
      const row = siteDatabase.getSiteSettingsReleaseById(req.params.id);
      if (!row) return res.status(404).json({ error: '版本不存在' });
      const next = normalizeSiteSettings(JSON.parse(row.content_json || '{}'));
      const prev = normalizeSiteSettings(readCurrentSiteSettingsRaw());
      const riskFlags = siteSettingsRiskFlags(prev, next);
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      if (riskFlags.length && body.confirmRisk !== true) {
        return res.status(409).json({
          error: '存在高风险变更，请确认后回滚',
          riskFlags,
          warnings: siteSettingsWarnings(next),
        });
      }
      const released = siteDatabase.createSiteSettingsRelease({
        scope: 'default',
        contentJson: JSON.stringify(next),
        summary: body.summary || `rollback from release#${row.id} (v${row.version_no})`,
        riskFlagsJson: JSON.stringify(riskFlags),
        createdByUserId: req.adminUser && req.adminUser.userId,
        createdByUsername: req.adminUser && req.adminUser.username,
      });
      writeCurrentSiteSettingsNormalized(next);
      await presenceStore.applySiteSettingsAndReconnect(next.redis);
      audit(req, 'site_settings.rollback', 'ok', {
        fromReleaseId: row.id,
        toReleaseId: released && released.id ? released.id : null,
      });
      res.json({ ok: true, release: released, riskFlags, warnings: siteSettingsWarnings(next) });
    } catch (e) {
      audit(req, 'site_settings.rollback', 'error', {
        message: String(e.message || e).slice(0, 200),
      });
      res.status(500).json({ error: String(e.message || e) });
    }
  });
  siteMetaRouter.get('/ai/settings', requireAdmin, requireAdminOrEditorCapability('aiSettings'), (req, res) => {
    try {
      const normalized = readCurrentAiSettingsNormalized();
      res.json(sanitizeAiSettingsForAdminGet(normalized));
    } catch (e) {
      sendAdminError(req, res, 500, String(e.message || e));
    }
  });
  siteMetaRouter.put('/ai/settings', requireAdmin, requireAdminOrEditorCapability('aiSettings'), (req, res) => {
    try {
      const prevRaw = readNormalizedAiSettings(siteDatabase, AI_SETTINGS_PATH);
      const normalized = mergeAiSettingsSecrets(
        prevRaw,
        normalizeAiSettings(req.body && typeof req.body === 'object' ? req.body : {})
      );
      const validation = validateNormalizedAiSettings(normalized);
      if (!validation.ok) {
        return sendAdminError(req, res, 400, 'AI 配置校验失败', { detail: validation.detail });
      }
      writeCurrentAiSettings(normalized);
      audit(req, 'ai.settings.write', 'ok', {
        enabled: normalized.enabled,
        defaultProvider: normalized.defaultProvider,
      });
      res.json({ ok: true });
    } catch (e) {
      audit(req, 'ai.settings.write', 'error', {
        message: String(e.message || e).slice(0, 200),
      });
      sendAdminError(req, res, 500, String(e.message || e));
    }
  });
  siteMetaRouter.post('/ai/test', requireAdmin, requireAdminOrEditorCapability('aiSettings'), async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const requestValidation = validateAiTestRequest(body);
      if (!requestValidation.ok) {
        return sendAdminError(req, res, 400, 'AI 测试参数不完整', { detail: requestValidation.detail });
      }
      const settings = readCurrentAiSettingsNormalized();
      const settingsValidation = validateNormalizedAiSettings(settings);
      if (!settingsValidation.ok) {
        return sendAdminError(req, res, 400, 'AI 配置校验失败', { detail: settingsValidation.detail });
      }
      const result = await runAiChatForAdmin(settings, {
        providerId: body.providerId,
        model: body.model,
        systemPrompt: '你是 EBU4 管理后台的 AI 连通性测试助手。请简短回复“AI 测试成功”，并带上 provider 与 model。',
        messages: [
          {
            role: 'user',
            content: String(body.prompt || '请回复：AI 测试成功'),
          },
        ],
        temperature: 0.1,
        maxTokens: 256,
      });
      audit(req, 'ai.provider.test', 'ok', {
        providerId: result.providerId,
        model: result.model,
      });
      res.json({ ok: true, result });
    } catch (e) {
      audit(req, 'ai.provider.test', 'error', {
        message: String(e.message || e).slice(0, 200),
      });
      sendAdminError(req, res, 400, String(e.message || e));
    }
  });
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
      const q = req.query && req.query.q ? String(req.query.q).trim().toLowerCase() : '';
      const action = req.query && req.query.action ? String(req.query.action).trim() : '';
      const outcome = req.query && req.query.outcome ? String(req.query.outcome).trim() : '';
      const user = req.query && req.query.user ? String(req.query.user).trim().toLowerCase() : '';
      const from = req.query && req.query.from ? String(req.query.from).trim() : '';
      const to = req.query && req.query.to ? String(req.query.to).trim() : '';
      let entries = sanitizeAuditEntries(auditLog.readTail(500));
      if (action) entries = entries.filter((item) => String(item.action || '') === action);
      if (outcome) entries = entries.filter((item) => String(item.outcome || '') === outcome);
      if (user) {
        entries = entries.filter((item) =>
          String(item.actorUsername || item.actor || '')
            .toLowerCase()
            .includes(user)
        );
      }
      if (from) {
        const fromTs = Date.parse(from);
        if (Number.isFinite(fromTs)) {
          entries = entries.filter((item) => Date.parse(item.ts || '') >= fromTs);
        }
      }
      if (to) {
        const toTs = Date.parse(to);
        if (Number.isFinite(toTs)) {
          entries = entries.filter((item) => Date.parse(item.ts || '') <= toTs + 24 * 60 * 60 * 1000 - 1);
        }
      }
      if (q) {
        entries = entries.filter((item) => {
          const hay = JSON.stringify(item).toLowerCase();
          return hay.includes(q);
        });
      }
      entries = entries.slice(-limit);
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
      if (sessionToken) {
        destroySession(sessionToken);
        await presenceStore.del(sessionToken);
        audit(req, 'admin.presence.kick', 'ok', { by: 'token' });
        return res.json({ ok: true });
      }
      if (body.userId != null && body.at != null) {
        const r = await presenceStore.kickByUserIdAndAt(body.userId, body.at);
        if (!r.ok) {
          return res.status(404).json({ error: '未找到对应会话或已过期' });
        }
        if (r.sessionToken) destroySession(r.sessionToken);
        audit(req, 'admin.presence.kick', 'ok', { by: 'userId_at' });
        return res.json({ ok: true });
      }
      return res.status(400).json({ error: '缺少 userId+at 或 sessionToken' });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });
  siteMetaRouter.get('/invites', requireAdmin, requireInviteViewer(), (req, res) => {
    try {
      res.json({ codes: inviteStore.listCodes(siteDatabase) });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });
  siteMetaRouter.post('/invites', requireAdmin, requireInviteManager(), (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const created = inviteStore.createInvite(siteDatabase, body);
      audit(req, 'admin.invites.create', 'ok', { code: created.code });
      res.json({ ok: true, invite: created });
    } catch (e) {
      res.status(400).json({ error: String(e.message || e) });
    }
  });
  siteMetaRouter.delete('/invites/:code', requireAdmin, requireInviteManager(), (req, res) => {
    try {
      const ok = inviteStore.deleteInvite(siteDatabase, req.params.code);
      if (!ok) return res.status(404).json({ error: '邀请码不存在' });
      audit(req, 'admin.invites.delete', 'ok', { code: req.params.code });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  siteMetaRouter.post('/upgrade/check', requireAdmin, requireRole('admin'), async (req, res) => {
    try {
      const { upgradeService } = resolveUpgradeDeps();
      const st = readNormalizedSiteSettings();
      const validation = validateUpgradeConfig(st);
      if (!validation.ok) {
        return sendAdminError(req, res, 400, '升级配置校验失败', { detail: validation.detail });
      }
      const result = await upgradeService.withUpgradeLock(() =>
        upgradeService.runUpgradeCheck({
          siteDatabase,
          siteSettings: st,
          siteRoot,
          trigger: 'manual',
        })
      );
      audit(req, 'upgrade.check', 'ok', {});
      res.json(result);
    } catch (e) {
      audit(req, 'upgrade.check', 'error', { message: String(e.message || e).slice(0, 200) });
      sendAdminError(req, res, 500, String(e.message || e));
    }
  });
  siteMetaRouter.post('/upgrade/apply', requireAdmin, requireRole('admin'), async (req, res) => {
    try {
      const { upgradeService } = resolveUpgradeDeps();
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const requestValidation = validateUpgradeApplyRequest(body);
      if (!requestValidation.ok) {
        return sendAdminError(req, res, 400, '升级参数校验失败', { detail: requestValidation.detail });
      }
      const channel = requestValidation.channel;
      const artifactIndex = requestValidation.artifactIndex;
      const st = readNormalizedSiteSettings();
      const configValidation = validateUpgradeConfig(st);
      if (!configValidation.ok) {
        return sendAdminError(req, res, 400, '升级配置校验失败', { detail: configValidation.detail });
      }
      const result = await upgradeService.withUpgradeLock(async () => {
        if (channel === 'docs') {
          return upgradeService.runUpgradeApplyDocs({
            siteDatabase,
            siteSettings: st,
            siteRoot,
            artifactIndex,
            reloadDocData,
            backupKeepCount,
            trigger: 'manual',
          });
        }
        return upgradeService.runUpgradeApplySystem({
          siteDatabase,
          siteSettings: st,
          siteRoot,
          artifactIndex,
          trigger: 'manual',
        });
      });
      const out =
        channel === 'system' && result.needsRestart
          ? Object.assign({}, result, {
              autoExitScheduled:
                process.env.UPGRADE_AUTO_EXIT_ON_APPLY === '1' ||
                process.env.UPGRADE_AUTO_EXIT_ON_APPLY === 'true',
            })
          : result;
      audit(req, 'upgrade.apply', 'ok', { channel });
      res.json(out);
      if (
        channel === 'system' &&
        result.needsRestart &&
        out.autoExitScheduled
      ) {
        res.on('finish', () => {
          setTimeout(() => process.exit(0), 200);
        });
      }
    } catch (e) {
      audit(req, 'upgrade.apply', 'error', { message: String(e.message || e).slice(0, 200) });
      sendAdminError(req, res, 500, String(e.message || e));
    }
  });
  siteMetaRouter.get('/upgrade/history', requireAdmin, requireRole('admin'), (req, res) => {
    try {
      const { upgradeService } = getUpgradeDeps();
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
      const before = req.query.before ? String(req.query.before) : '';
      let items = upgradeService.readUpgradeHistory(siteDatabase);
      if (before) {
        const idx = items.findIndex((x) => x.id === before);
        if (idx >= 0) items = items.slice(idx + 1);
      }
      const slice = items.slice(0, limit);
      res.json({ items: slice, hasMore: items.length > limit });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });
  siteMetaRouter.get('/upgrade/status', requireAdmin, requireRole('admin'), (req, res) => {
    try {
      const { upgradeService } = getUpgradeDeps();
      res.json({
        lastCheck: upgradeService.getKvJson(siteDatabase, 'upgrade_last_check_at'),
        lastApply: upgradeService.getKvJson(siteDatabase, 'upgrade_last_apply_at'),
        lastResult: upgradeService.getKvJson(siteDatabase, 'upgrade_last_result'),
      });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });
  siteMetaRouter.get('/upgrade/package-scopes', requireAdmin, requireRole('admin'), (req, res) => {
    try {
      const { listSystemPackageScopes } = resolveUpgradeDeps();
      res.json({ items: listSystemPackageScopes() });
    } catch (e) {
      sendAdminError(req, res, 500, String(e.message || e));
    }
  });
  siteMetaRouter.post('/upgrade/build-artifacts', requireAdmin, requireRole('admin'), async (req, res) => {
    try {
      const { upgradeService, buildUpgradeArtifacts, normalizeSystemPackageScopes } =
        resolveUpgradeDeps();
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const validation = validateBuildArtifactsRequest(body, normalizeSystemPackageScopes);
      if (!validation.ok) {
        return sendAdminError(req, res, 400, '制品构建参数校验失败', { detail: validation.detail });
      }
      const docs = validation.docs;
      const system = validation.system;
      const systemScopes = validation.systemScopes;
      const result = await upgradeService.withUpgradeLock(() =>
        Promise.resolve(
          buildUpgradeArtifacts(siteRoot, siteDatabase, {
            docs,
            system,
            systemScopes,
          })
        )
      );
      const scopeSummary =
        result.system && Array.isArray(result.system.selectedScopes)
          ? result.system.selectedScopes.join(', ') || '仅共享核心'
          : '未生成';
      upgradeService.appendHistory(siteDatabase, {
        kind: 'build',
        trigger: 'manual',
        channel: 'both',
        fromVersion: null,
        toVersion: result.manifest && result.manifest.docsVersion,
        status: 'success',
        message:
          '本机一键生成升级清单（docs=' +
          (result.docs ? '是' : '否') +
          ' system=' +
          (result.system ? '是' : '否') +
          ' scopes=' +
          scopeSummary +
          '）',
        remoteProduct: null,
        remoteBaseUrlHost: '',
      });
      audit(req, 'upgrade.build_artifacts', 'ok', {
        docs: !!result.docs,
        system: !!result.system,
        systemScopes: result.system && Array.isArray(result.system.selectedScopes)
          ? result.system.selectedScopes
          : [],
      });
      res.json(result);
    } catch (e) {
      audit(req, 'upgrade.build_artifacts', 'error', { message: String(e.message || e).slice(0, 200) });
      sendAdminError(req, res, 400, String(e.message || e));
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
          inviteRegister: body.inviteRegister === true,
          blogFetch: body.blogFetch === true,
          aiSettings: body.aiSettings === true,
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
      const healthBase = buildSystemHealthSnapshot();
      const rawStatsResult = await collectDashboardPart(
        async () => ({
          total: 0,
          docsPv: 0,
          indexPv: 0,
          extraPagePv: 0,
          byPath: {},
          byDay: {},
          updatedAt: null,
          ...(dashboardVisitStats.readStats(siteDatabase, VISIT_STATS_FILE) || {}),
        }),
        {
          total: 0,
          docsPv: 0,
          indexPv: 0,
          extraPagePv: 0,
          byPath: {},
          byDay: {},
          updatedAt: null,
        }
      );
      const raw = rawStatsResult.value;
      const topPathsResult = await collectDashboardPart(
        async () => dashboardVisitStats.topPaths(raw.byPath, 20) || [],
        []
      );
      const byDayResult = await collectDashboardPart(
        async () => {
          const dayKeys = Object.keys(raw.byDay || {}).sort();
          const out = {};
          dayKeys.slice(-14).forEach((d) => {
            out[d] = raw.byDay[d];
          });
          return out;
        },
        {}
      );
      const presenceResult = await collectDashboardPart(
        async () => (await dashboardPresenceStore.listOnline()) || { list: [], backend: 'memory' },
        { list: [], backend: 'memory' }
      );
      const redisStatusResult = await collectDashboardPart(
        async () =>
          (await dashboardPresenceStore.getStatus()) || {
            connected: false,
            source: '',
            urlConfigured: false,
          },
        { connected: false, source: '', urlConfigured: false }
      );
      const inviteCodesResult = await collectDashboardPart(
        async () => dashboardInviteStore.listCodes(siteDatabase) || [],
        []
      );
      const backupsResult = await collectDashboardPart(
        async () => listDbBackupFiles() || [],
        []
      );
      const sectionCountResult = await collectDashboardPart(
        async () => {
          if (typeof ctx.getSectionCount !== 'function') return 0;
          return ctx.getSectionCount() || 0;
        },
        0
      );
      const siteGuestSessionsResult = await collectDashboardPart(
        async () => dashboardSiteSession.getSiteSessionCount() || 0,
        0
      );
      const cacheStatsResult = await collectDashboardPart(
        async () =>
          dashboardRedisCache.getStats() || {
            hits: 0,
            misses: 0,
            totalRequests: 0,
            hitRate: 0,
            contentEpoch: 0,
          },
        {
          hits: 0,
          misses: 0,
          totalRequests: 0,
          hitRate: 0,
          contentEpoch: 0,
        }
      );
      const healthChecks = (healthBase.checks || []).concat([
        buildDashboardRedisHealth(redisStatusResult.value, redisStatusResult.error),
      ]);
      const presence = presenceResult.value;
      const inviteCodes = Array.isArray(inviteCodesResult.value) ? inviteCodesResult.value : [];
      const backups = backupsResult.value;
      const now = Date.now();
      res.json({
        visits: {
          total: raw.total || 0,
          docsPv: raw.docsPv || 0,
          indexPv: raw.indexPv || 0,
          extraPagePv: raw.extraPagePv || 0,
          updatedAt: raw.updatedAt || null,
        },
        topPaths: Array.isArray(topPathsResult.value) ? topPathsResult.value : [],
        byDayLast14: byDayResult.value && typeof byDayResult.value === 'object' ? byDayResult.value : {},
        sectionCount: Number(sectionCountResult.value) || 0,
        presence: {
          backend: presence && presence.backend ? presence.backend : 'memory',
          count: (presence && presence.list && presence.list.length) || 0,
        },
        siteGuestSessions: Number(siteGuestSessionsResult.value) || 0,
        inviteCodes: {
          total: inviteCodes.length,
          active: inviteCodes.filter((c) => c.exp > now).length,
        },
        cache: cacheStatsResult.value,
        health: {
          checks: healthChecks,
        },
        backups: {
          total: Array.isArray(backups) ? backups.length : 0,
          latest: (Array.isArray(backups) && backups[0]) || null,
        },
      });
    } catch (e) {
      sendAdminError(req, res, 500, String(e.message || e));
    }
  });

  app.get('/api/admin/backups', requireAdmin, requireRole('admin'), (req, res) => {
    try {
      const list = listDbBackupFiles();
      res.json({
        ok: true,
        enabled: siteDatabase.isSiteSqlite(),
        dbPath: siteDatabase.isSiteSqlite() ? siteDatabase.resolveDbPath() : null,
        list,
      });
    } catch (e) {
      sendAdminError(req, res, 500, String(e.message || e));
    }
  });

  app.get('/api/admin/backups/:fileName/download', requireAdmin, requireRole('admin'), (req, res) => {
    try {
      const fileName = String(req.params.fileName || '').trim();
      const item = listDbBackupFiles().find((row) => row.name === fileName);
      if (!item) return sendAdminError(req, res, 404, '备份文件不存在');
      audit(req, 'sqlite.backup.download', 'ok', { file: item.name });
      res.download(item.path, item.name);
    } catch (e) {
      audit(req, 'sqlite.backup.download', 'error', { message: String(e.message || e).slice(0, 200) });
      sendAdminError(req, res, 500, String(e.message || e));
    }
  });

  app.post('/api/admin/backups/create', requireAdmin, requireRole('admin'), (req, res) => {
    try {
      if (!siteDatabase.isSiteSqlite()) {
        return sendAdminError(req, res, 400, '当前存储模式不支持 SQLite 备份');
      }
      const dbPath = siteDatabase.resolveDbPath();
      if (!fs.existsSync(dbPath)) {
        return sendAdminError(req, res, 400, 'SQLite 数据库文件不存在，无法创建备份');
      }
      backupWithPrune(dbPath, backupKeepCount);
      const latest = listDbBackupFiles()[0] || null;
      audit(req, 'sqlite.backup.create', 'ok', { file: latest && latest.name ? latest.name : '' });
      res.json({ ok: true, latest });
    } catch (e) {
      audit(req, 'sqlite.backup.create', 'error', { message: String(e.message || e).slice(0, 200) });
      sendAdminError(req, res, 500, String(e.message || e));
    }
  });

  app.post('/api/admin/backups/restore', requireAdmin, requireRole('admin'), async (req, res) => {
    try {
      if (!siteDatabase.isSiteSqlite()) {
        return sendAdminError(req, res, 400, '当前存储模式不支持 SQLite 恢复');
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const fileName = String(body.fileName || '').trim();
      if (!fileName) return sendAdminError(req, res, 400, '缺少备份文件名');
      const target = listDbBackupFiles().find((item) => item.name === fileName);
      if (!target || !fs.existsSync(target.path)) return sendAdminError(req, res, 404, '备份文件不存在');
      const dbPath = siteDatabase.resolveDbPath();
      if (!fs.existsSync(dbPath)) {
        return sendAdminError(req, res, 400, 'SQLite 数据库文件不存在，无法执行恢复');
      }
      try {
        backupWithPrune(dbPath, backupKeepCount);
      } catch (e) {
        return sendAdminError(req, res, 500, '恢复前自动备份失败', {
          detail: [{ field: 'backup', message: String(e.message || e) }],
        });
      }
      siteDatabase.restoreSqliteFromBackup(target.path);
      if (typeof reloadDocData === 'function') {
        try {
          reloadDocData();
        } catch (e) {
          throw new Error('数据库已恢复，但文档热重载失败：' + String(e.message || e));
        }
      }
      try {
        const st = readNormalizedSiteSettings();
        await presenceStore.applySiteSettingsAndReconnect(st.redis);
      } catch (_) {}
      audit(req, 'sqlite.backup.restore', 'ok', { file: target.name });
      res.json({ ok: true, restored: target.name });
    } catch (e) {
      audit(req, 'sqlite.backup.restore', 'error', { message: String(e.message || e).slice(0, 200) });
      sendAdminError(req, res, 500, String(e.message || e));
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
      return sendAdminError(req, res, 429, '登录尝试过多，请稍后再试');
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
      return sendAdminError(req, res, 401, '用户名或密码错误');
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
    const validation = validateNonEmptyMarkdown(content, '整篇 Markdown');
    if (!validation.ok) {
      return sendAdminError(req, res, 400, '整篇 Markdown 校验失败', { detail: validation.detail });
    }
    try {
      docAdmin.writeFullMarkdown(
        content,
        slug,
        historyActorMeta(req, 'docs.main.full_markdown', '整篇 Markdown 保存')
      );
      const sectionCount = getSectionCountForDoc(slug);
      audit(req, 'file.markdown.write', 'ok', {
        doc: slug,
        bytes: Buffer.byteLength(content, 'utf-8'),
        sectionCount,
      });
      res.json({ ok: true, sectionCount, doc: slug });
    } catch (e) {
      audit(req, 'file.markdown.write', 'error', {
        doc: slug,
        message: String(e.message || e).slice(0, 200),
      });
      sendAdminError(req, res, 500, String(e.message || e));
    }
  });

  app.get('/api/admin/docs/main-docs', requireAdmin, requireEditorDataView('mainDoc'), (req, res) => {
    try {
      const docs = siteDatabase.listMainDocuments().map((doc) => {
        let latestVersion = null;
        try {
          const rows = siteDatabase.listMainDocHistory(doc.slug, { limit: 1 });
          const row = rows && rows[0] ? rows[0] : null;
          if (row) {
            latestVersion = {
              id: row.id,
              source: row.source || '',
              actorUsername: row.actor_username || '',
              summary: row.summary || '',
              createdAt: row.created_at || null,
            };
          }
        } catch (_) {}
        let sectionCount = 0;
        try {
          if (typeof ctx.getSectionCountForDoc === 'function') {
            sectionCount = Number(ctx.getSectionCountForDoc(doc.slug)) || 0;
          }
        } catch (_) {}
        return Object.assign({}, doc, {
          updatedAt: doc.updated_at || null,
          bytes: Number(doc.bytes) || 0,
          sectionCount,
          latestVersion,
        });
      });
      res.json({ docs });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.get('/api/admin/docs/search', requireAdmin, requireEditorDataView('mainDoc'), (req, res) => {
    try {
      const q = req.query && req.query.q != null ? String(req.query.q).trim() : '';
      if (!q || q.length < 2) {
        return res.json({ ok: true, query: q, scope: 'current', docSlug: '', items: [] });
      }
      const scopeRaw = req.query && req.query.scope != null ? String(req.query.scope).trim() : 'current';
      const scope = scopeRaw === 'all' ? 'all' : 'current';
      const docSlug =
        scope === 'current'
          ? siteDatabase.normalizeMainDocSlug(req.query && req.query.doc)
          : '';
      const runSearch =
        ctx && typeof ctx.searchMainDocsForAdmin === 'function'
          ? ctx.searchMainDocsForAdmin
          : null;
      if (!runSearch) {
        return sendAdminError(req, res, 500, '文档检索服务未配置');
      }
      const items = runSearch(q, { docSlug: scope === 'current' ? docSlug : '' }) || [];
      res.json({
        ok: true,
        query: q,
        scope,
        docSlug: scope === 'current' ? docSlug || '' : '',
        items,
      });
    } catch (e) {
      sendAdminError(req, res, 500, String(e.message || e));
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

  app.get(
    '/api/admin/docs/main-docs/:slug/history',
    requireAdmin,
    requireEditorDataView('mainDoc'),
    (req, res) => {
      const slug = siteDatabase.normalizeMainDocSlug(req.params.slug);
      if (!slug) return res.status(400).json({ error: '无效 slug' });
      const limit = req.query && req.query.limit != null ? parseInt(req.query.limit, 10) : 30;
      const cursor = req.query && req.query.cursor != null ? parseInt(req.query.cursor, 10) : null;
      try {
        const rows = siteDatabase.listMainDocHistory(slug, { limit, cursor });
        const list = rows.map((r) => ({
          id: r.id,
          slug: r.slug,
          title: r.title,
          source: r.source,
          actorUserId: r.actor_user_id,
          actorUsername: r.actor_username,
          summary: r.summary,
          contentBytes: r.content_bytes,
          createdAt: r.created_at,
        }));
        const nextCursor = list.length ? list[list.length - 1].id : null;
        res.json({ slug, versions: list, nextCursor });
      } catch (e) {
        res.status(500).json({ error: String(e.message || e) });
      }
    }
  );

  app.get(
    '/api/admin/docs/main-docs/:slug/history/:versionId',
    requireAdmin,
    requireEditorDataView('mainDoc'),
    (req, res) => {
      const slug = siteDatabase.normalizeMainDocSlug(req.params.slug);
      if (!slug) return res.status(400).json({ error: '无效 slug' });
      const versionId = parseInt(req.params.versionId, 10);
      if (!Number.isFinite(versionId)) return res.status(400).json({ error: '无效版本号' });
      try {
        const row = siteDatabase.getMainDocHistoryVersion(slug, versionId);
        if (!row) return res.status(404).json({ error: '历史版本不存在' });
        res.json({
          version: {
            id: row.id,
            slug: row.slug,
            title: row.title,
            source: row.source,
            actorUserId: row.actor_user_id,
            actorUsername: row.actor_username,
            summary: row.summary,
            contentBytes: row.content_bytes,
            createdAt: row.created_at,
          },
          content: row.content != null ? String(row.content) : '',
        });
      } catch (e) {
        res.status(500).json({ error: String(e.message || e) });
      }
    }
  );

  app.post(
    '/api/admin/docs/main-docs/:slug/history/:versionId/rollback',
    requireAdmin,
    requireEditorDataView('mainDoc'),
    (req, res) => {
      const slug = siteDatabase.normalizeMainDocSlug(req.params.slug);
      if (!slug) return res.status(400).json({ error: '无效 slug' });
      const versionId = parseInt(req.params.versionId, 10);
      if (!Number.isFinite(versionId)) return res.status(400).json({ error: '无效版本号' });
      try {
        const row = siteDatabase.getMainDocHistoryVersion(slug, versionId);
        if (!row) return res.status(404).json({ error: '历史版本不存在' });
        const body = row.content != null ? String(row.content) : '';
        docAdmin.writeFullMarkdown(
          body,
          slug,
          historyActorMeta(req, 'docs.main.rollback', `回滚到版本 #${versionId}`)
        );
        redisCache.bumpEpoch();
        const sectionCount = getSectionCountForDoc(slug);
        audit(req, 'docs.main.rollback', 'ok', { slug, versionId, sectionCount });
        res.json({ ok: true, doc: slug, sectionCount, versionId });
      } catch (e) {
        audit(req, 'docs.main.rollback', 'error', {
          slug,
          versionId,
          message: String(e.message || e).slice(0, 200),
        });
        res.status(500).json({ error: String(e.message || e) });
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
          hiddenInPublic: s.id === 0 || s.id === 1,
          hiddenReason: s.id === 0 || s.id === 1 ? '前台 /docs 默认隐藏（标题/目录保留段）' : '',
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
    const validation = validateNonEmptyMarkdown(content, '章节 Markdown');
    if (!validation.ok) {
      return sendAdminError(req, res, 400, '章节内容校验失败', { detail: validation.detail });
    }
    try {
      const sections = docAdmin.readSectionsFromDisk(slug);
      const next = docMd.replaceSection(sections, id, content);
      docAdmin.persistSections(
        next,
        slug,
        historyActorMeta(req, 'docs.section.update', `更新章节 #${id}`)
      );
      const sectionCount = getSectionCountForDoc(slug);
      audit(req, 'docs.section.update', 'ok', {
        doc: slug,
        sectionId: id,
        bytes: Buffer.byteLength(content, 'utf-8'),
      });
      res.json({ ok: true, sectionCount, doc: slug });
    } catch (e) {
      const code = e.code === 'VALIDATION' ? 400 : e.code === 'NOT_FOUND' ? 404 : 500;
      if (code >= 500) {
        audit(req, 'docs.section.update', 'error', {
          doc: slug,
          sectionId: id,
          message: String(e.message || e).slice(0, 200),
        });
      }
      sendAdminError(req, res, code, String(e.message || e));
    }
  });

  app.post('/api/admin/docs/sections', requireAdmin, requireEditorDataView('mainDoc'), (req, res) => {
    const slug = requireExistingMainDocSlug(req, res);
    if (slug == null) return;
    const content = req.body && typeof req.body.content === 'string' ? req.body.content : null;
    const validation = validateNonEmptyMarkdown(content, '章节 Markdown');
    if (!validation.ok) {
      return sendAdminError(req, res, 400, '章节内容校验失败', { detail: validation.detail });
    }
    const afterId =
      req.body && Object.prototype.hasOwnProperty.call(req.body, 'afterId')
        ? req.body.afterId
        : null;
    try {
      const sections = docAdmin.readSectionsFromDisk(slug);
      const { sections: next, insertedId } = docMd.insertSection(sections, afterId, content);
      docAdmin.persistSections(
        next,
        slug,
        historyActorMeta(req, 'docs.section.create', `新增章节 #${insertedId}`)
      );
      const sectionCount = getSectionCountForDoc(slug);
      audit(req, 'docs.section.create', 'ok', {
        doc: slug,
        insertedId,
        afterId,
        bytes: Buffer.byteLength(content, 'utf-8'),
      });
      res.json({
        ok: true,
        sectionCount,
        insertedId,
        doc: slug,
      });
    } catch (e) {
      const code = e.code === 'VALIDATION' ? 400 : e.code === 'NOT_FOUND' ? 404 : 500;
      if (code >= 500) {
        audit(req, 'docs.section.create', 'error', {
          doc: slug,
          message: String(e.message || e).slice(0, 200),
        });
      }
      sendAdminError(req, res, code, String(e.message || e));
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
      docAdmin.persistSections(
        next,
        slug,
        historyActorMeta(req, 'docs.section.delete', `删除章节 #${id}`)
      );
      const sectionCount = getSectionCountForDoc(slug);
      audit(req, 'docs.section.delete', 'ok', { sectionId: id, doc: slug });
      res.json({ ok: true, sectionCount, doc: slug });
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
      docAdmin.persistSections(
        next,
        slug,
        historyActorMeta(req, 'docs.section.move', `移动章节 #${id}`)
      );
      const sectionCount = getSectionCountForDoc(slug);
      audit(req, 'docs.section.move', 'ok', { sectionId: id, delta, doc: slug });
      res.json({ ok: true, sectionCount, doc: slug });
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
      docAdmin.persistSections(
        next,
        slug,
        historyActorMeta(req, 'docs.section.reorder', `重排章节（${order.length}项）`)
      );
      const sectionCount = getSectionCountForDoc(slug);
      audit(req, 'docs.section.reorder', 'ok', { orderLen: order.length, doc: slug });
      res.json({ ok: true, sectionCount, doc: slug });
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
      return sendAdminError(req, res, 400, '缺少 content 字段');
    }
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return sendAdminError(req, res, 400, '不是合法 JSON：' + String(e.message || e));
    }
    const validation = validateSeoConfig(normalizeSeoConfig(parsed));
    if (!validation.ok) {
      return sendAdminError(req, res, 400, 'SEO 配置校验失败', { detail: validation.detail });
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
      sendAdminError(req, res, 500, String(e.message || e));
    }
  });

  app.all('/api/admin/seo/generate-sitemap-file', requireAdmin, requireAdminOrEditorCapability('seo'), async (req, res) => {
    function escapeXml(s) {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
    function normalizeSeoInput() {
      const bodySeo = req.body && typeof req.body.seo === 'object' ? req.body.seo : null;
      if (bodySeo) return normalizeSeoConfig(bodySeo);
      return readNormalizedSeoConfig();
    }

    try {
      const seo = normalizeSeoInput();
      const validation = validateSeoConfig(seo);
      if (!validation.ok) {
        return sendAdminError(req, res, 400, 'SEO 配置校验失败', { detail: validation.detail });
      }
      const origin = normalizeOrigin(seo.canonicalBase, `${req.protocol}://${req.get('host')}`);
      const paths = await buildSeoSitemapRelPaths({
        seo,
        siteDatabase,
        extraPagesRepo,
        extraPagesStore,
      });

      const urls = paths
        .map((p) => {
          const loc = origin + (p.startsWith('/') ? p : '/' + p);
          return `  <url><loc>${escapeXml(loc)}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`;
        })
        .join('\n');
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;

      const outPath = path.join(siteRoot, 'public', 'data', 'sitemap.generated.xml');
      const outDir = path.dirname(outPath);
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(outPath, xml, 'utf-8');
      audit(req, 'seo.sitemap.generate_file', 'ok', { count: paths.length, file: outPath });
      res.json({ ok: true, count: paths.length, url: '/data/sitemap.generated.xml' });
    } catch (e) {
      audit(req, 'seo.sitemap.generate_file', 'error', {
        message: String(e.message || e).slice(0, 200),
      });
      sendAdminError(req, res, 500, String(e.message || e));
    }
  });

  app.get('/api/admin/seo/push-logs', requireAdmin, requireAdminOrEditorCapability('seo'), (req, res) => {
    try {
      if (!siteDatabase.isSiteSqlite()) return res.json({ list: [] });
      const engine = req.query && req.query.engine ? String(req.query.engine) : '';
      const limit = req.query && req.query.limit ? req.query.limit : 100;
      const list = siteDatabase.listSeoPushLogs({ engine, limit });
      res.json({ list });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.post('/api/admin/seo/push', requireAdmin, requireAdminOrEditorCapability('seo'), async (req, res) => {
    const bodySeo = req.body && typeof req.body.seo === 'object' ? req.body.seo : null;
    const seo = bodySeo ? normalizeSeoConfig(bodySeo) : readNormalizedSeoConfig();
    const baseValidation = validateSeoConfig(seo);
    if (!baseValidation.ok) {
      return sendAdminError(req, res, 400, 'SEO 配置校验失败', { detail: baseValidation.detail });
    }
    const engines = Array.isArray(req.body && req.body.engines) ? req.body.engines : [];
    const batchKey = Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex');
    const actorUserId =
      req.user && req.user.id != null && Number.isFinite(Number(req.user.id))
        ? Number(req.user.id)
        : null;
    const actorUsername = req.user && req.user.username ? String(req.user.username) : '';
    try {
      const preflight = await require('./lib/seo-push-service').buildPushContext({
        req,
        seo,
        siteDatabase,
        extraPagesRepo,
        extraPagesStore,
      });
      const pushValidation = validateSeoPushRequest(req.body, seo, preflight);
      if (!pushValidation.ok) {
        return sendAdminError(req, res, 400, 'SEO 推送参数校验失败', { detail: pushValidation.detail });
      }
      const pushed = await runSeoPush({
        req,
        seo,
        siteDatabase,
        extraPagesRepo,
        extraPagesStore,
        engines: pushValidation.engines,
      });
      const results = Array.isArray(pushed.results) ? pushed.results : [];
      let okCount = 0;
      let errorCount = 0;
      let skippedCount = 0;
      for (const item of results) {
        if (!item || item.status === 'skipped') {
          skippedCount += 1;
          continue;
        }
        if (item.ok) okCount += 1;
        else errorCount += 1;
        if (siteDatabase.isSiteSqlite()) {
          siteDatabase.createSeoPushLog({
            batchKey,
            engine: item.engine,
            action: item.action,
            targetType: item.targetType,
            target: item.target,
            requestSummary: item.requestSummary,
            urlCount: item.urlCount,
            success: item.ok,
            httpStatus: item.httpStatus,
            responseExcerpt: item.responseExcerpt,
            errorMessage: item.errorMessage,
            actorUserId,
            actorUsername,
          });
        }
      }
      audit(req, 'seo.push.run', errorCount > 0 ? 'error' : 'ok', {
        batchKey,
        engines: Array.isArray(engines) && engines.length ? engines.length : 3,
        okCount,
        errorCount,
        skippedCount,
        urlCount: pushed.context && Array.isArray(pushed.context.urls) ? pushed.context.urls.length : 0,
      });
      res.json({
        ok: errorCount === 0,
        batchKey,
        context: {
          origin: pushed.context ? pushed.context.origin : '',
          sitemapUrl: pushed.context ? pushed.context.sitemapUrl : '',
          urlCount: pushed.context && Array.isArray(pushed.context.urls) ? pushed.context.urls.length : 0,
        },
        summary: {
          total: results.length,
          ok: okCount,
          error: errorCount,
          skipped: skippedCount,
        },
        results,
      });
    } catch (e) {
      audit(req, 'seo.push.run', 'error', {
        batchKey,
        message: String(e.message || e).slice(0, 200),
      });
      sendAdminError(req, res, 400, String(e.message || e));
    }
  });

  app.post('/api/admin/blog-fetch/run', requireAdmin, requireAdminOrEditorCapability('blogFetch'), async (req, res) => {
    try {
      const fetchBlogsReport = getFetchBlogsReport();
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const result = await fetchBlogsReport({
        cookie: body.cookie,
        base: body.base,
        userId: body.userId,
        pages: body.pages,
        from: body.from,
        to: body.to,
        range: body.range,
        lastDays: body.lastDays,
      });
      audit(req, 'blog.fetch.run', 'ok', {
        base: result.base,
        userId: String(result.userId || '').slice(0, 60),
        pages: result.pages,
        total: result.stats && result.stats.total ? result.stats.total : 0,
      });
      res.json({
        ok: true,
        result,
      });
    } catch (e) {
      audit(req, 'blog.fetch.run', 'error', {
        message: String(e.message || e).slice(0, 200),
      });
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  app.get('/api/admin/blog-fetch/weekly-reports', requireAdmin, requireAdminOrEditorCapability('blogFetch'), (req, res) => {
    try {
      const limit = req.query && req.query.limit ? req.query.limit : 20;
      const isAdminUser = req.adminUser && req.adminUser.role === 'admin';
      const resolvedUserId =
        isAdminUser && req.query && req.query.resolvedUserId ? String(req.query.resolvedUserId) : '';
      const keyword = req.query && req.query.keyword ? String(req.query.keyword) : '';
      const createdFrom = req.query && req.query.from ? String(req.query.from) : '';
      const createdTo = req.query && req.query.to ? String(req.query.to) : '';
      const sort = req.query && req.query.sort ? String(req.query.sort) : '';
      const list = siteDatabase.isSiteSqlite()
        ? siteDatabase.listPersonalWeeklyReports({
            limit,
            resolvedUserId,
            keyword,
            createdFrom,
            createdTo,
            sort,
            createdByUserId: isAdminUser ? null : req.adminUser.userId,
          })
        : [];
      audit(req, 'blog.fetch.weekly_report.list', 'ok', {
        count: list.length,
        limit: parseInt(limit, 10) || 20,
        resolvedUserId: resolvedUserId ? String(resolvedUserId).slice(0, 120) : '',
        keyword: keyword ? String(keyword).slice(0, 120) : '',
        scopedToUserId: isAdminUser ? '' : String(req.adminUser.userId || ''),
      });
      res.json({
        ok: true,
        supported: siteDatabase.isSiteSqlite(),
        list,
      });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.get('/api/admin/blog-fetch/weekly-reports/:id', requireAdmin, requireAdminOrEditorCapability('blogFetch'), (req, res) => {
    try {
      if (!siteDatabase.isSiteSqlite()) {
        return res.status(400).json({ error: '当前存储模式不支持周报历史' });
      }
      const row = siteDatabase.getPersonalWeeklyReportById(req.params.id);
      if (!row) return res.status(404).json({ error: '周报记录不存在' });
      if (!canAccessPersonalWeeklyReport(req, row)) {
        audit(req, 'blog.fetch.weekly_report.read', 'deny', {
          id: req.params.id,
          ownerUserId: row.createdByUserId != null ? Number(row.createdByUserId) : null,
        });
        return res.status(403).json({ error: '权限不足' });
      }
      audit(req, 'blog.fetch.weekly_report.read', 'ok', {
        id: row.id,
        ownerUserId: row.createdByUserId != null ? Number(row.createdByUserId) : null,
      });
      res.json({ ok: true, report: row });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.get('/api/admin/blog-fetch/weekly-reports/:id/docx', requireAdmin, requireAdminOrEditorCapability('blogFetch'), (req, res) => {
    try {
      if (!siteDatabase.isSiteSqlite()) {
        return res.status(400).json({ error: '当前存储模式不支持周报历史' });
      }
      const row = siteDatabase.getPersonalWeeklyReportById(req.params.id);
      if (!row) return res.status(404).json({ error: '周报记录不存在' });
      if (!canAccessPersonalWeeklyReport(req, row)) {
        audit(req, 'blog.fetch.weekly_report.docx', 'deny', {
          id: req.params.id,
          ownerUserId: row.createdByUserId != null ? Number(row.createdByUserId) : null,
        });
        return res.status(403).json({ error: '权限不足' });
      }
      const { createWeeklyReportDocx, safeDocxFilename } = getWeeklyDocxExport();
      const fileName = safeDocxFilename(row.title || 'personal-weekly-report');
      const encoded = encodeURIComponent(fileName).replace(/[!'()*]/g, (ch) =>
        '%' + ch.charCodeAt(0).toString(16).toUpperCase()
      );
      const buf = createWeeklyReportDocx(row);
      audit(req, 'blog.fetch.weekly_report.docx', 'ok', {
        id: row.id,
        title: String(row.title || '').slice(0, 120),
      });
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="weekly-report.docx"; filename*=UTF-8''${encoded}`
      );
      res.setHeader('Content-Length', String(buf.length));
      res.send(buf);
    } catch (e) {
      audit(req, 'blog.fetch.weekly_report.docx', 'error', {
        message: String(e.message || e).slice(0, 200),
      });
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.delete('/api/admin/blog-fetch/weekly-reports/:id', requireAdmin, requireAdminOrEditorCapability('blogFetch'), (req, res) => {
    try {
      if (!siteDatabase.isSiteSqlite()) {
        return res.status(400).json({ error: '当前存储模式不支持周报历史' });
      }
      const row = siteDatabase.getPersonalWeeklyReportById(req.params.id);
      if (!row) return res.status(404).json({ error: '周报记录不存在' });
      if (!canAccessPersonalWeeklyReport(req, row)) {
        audit(req, 'blog.fetch.weekly_report.delete', 'deny', {
          id: req.params.id,
          ownerUserId: row.createdByUserId != null ? Number(row.createdByUserId) : null,
        });
        return res.status(403).json({ error: '权限不足' });
      }
      const changes = siteDatabase.deletePersonalWeeklyReportById(row.id);
      audit(req, 'blog.fetch.weekly_report.delete', 'ok', {
        id: row.id,
        changes,
      });
      res.json({ ok: true, deleted: changes > 0 ? 1 : 0 });
    } catch (e) {
      audit(req, 'blog.fetch.weekly_report.delete', 'error', {
        message: String(e.message || e).slice(0, 200),
      });
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.post('/api/admin/blog-fetch/weekly-reports/batch-delete', requireAdmin, requireAdminOrEditorCapability('blogFetch'), (req, res) => {
    try {
      if (!siteDatabase.isSiteSqlite()) {
        return res.status(400).json({ error: '当前存储模式不支持周报历史' });
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const rows = listAccessiblePersonalWeeklyReportsByIds(req, body.ids);
      if (!rows.length) return res.status(400).json({ error: '没有可删除的周报记录' });
      const deleted = siteDatabase.deletePersonalWeeklyReportsByIds(
        rows.map((row) => row.id)
      );
      audit(req, 'blog.fetch.weekly_report.batch_delete', 'ok', {
        count: rows.length,
        deleted,
      });
      res.json({ ok: true, deleted, ids: rows.map((row) => row.id) });
    } catch (e) {
      audit(req, 'blog.fetch.weekly_report.batch_delete', 'error', {
        message: String(e.message || e).slice(0, 200),
      });
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.post('/api/admin/blog-fetch/weekly-reports/batch-export', requireAdmin, requireAdminOrEditorCapability('blogFetch'), (req, res) => {
    try {
      if (!siteDatabase.isSiteSqlite()) {
        return res.status(400).json({ error: '当前存储模式不支持周报历史' });
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const rows = listAccessiblePersonalWeeklyReportsByIds(req, body.ids);
      if (!rows.length) return res.status(400).json({ error: '没有可导出的周报记录' });
      const format = String(body.format || 'docx').trim().toLowerCase();
      const {
        createWeeklyReportDocx,
        safeArchiveEntryName,
        createZipArchive,
      } = getWeeklyDocxExport();
      const files = {};
      rows.forEach((row) => {
        if (format === 'json') {
          files[safeArchiveEntryName(row.title, '.json')] = JSON.stringify(row.summary || {}, null, 2);
          return;
        }
        if (format === 'md' || format === 'markdown') {
          files[safeArchiveEntryName(row.title, '.md')] = row.markdownContent || '';
          return;
        }
        files[safeArchiveEntryName(row.title, '.docx')] = createWeeklyReportDocx(row);
      });
      const zip = createZipArchive(files);
      audit(req, 'blog.fetch.weekly_report.batch_export', 'ok', {
        count: rows.length,
        format,
      });
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="weekly-reports-${format}.zip"`
      );
      res.setHeader('Content-Length', String(zip.length));
      res.send(zip);
    } catch (e) {
      audit(req, 'blog.fetch.weekly_report.batch_export', 'error', {
        message: String(e.message || e).slice(0, 200),
      });
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.post(
    '/api/admin/blog-fetch/weekly-report/generate',
    requireAdmin,
    requireAdminOrEditorCapability('blogFetch'),
    async (req, res) => {
      try {
        const generatePersonalWeeklyReport = getGeneratePersonalWeeklyReport();
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const generated = generatePersonalWeeklyReport({
          title: body.title,
          style: body.style,
          includeDailyDigest: body.includeDailyDigest !== false,
          blogs: Array.isArray(body.blogs) ? body.blogs : [],
        });
        let finalMarkdown = generated.markdown;
        let aiMeta = { used: false, providerId: '', model: '' };
        try {
          const aiSettings = readCurrentAiSettingsNormalized();
          if (aiSettings.enabled === true && aiSettings.weeklyReport && aiSettings.weeklyReport.useAi !== false) {
            const runAiChat = getRunAiChat();
            const wrProvider =
              String((aiSettings.weeklyReport && aiSettings.weeklyReport.provider) || '').trim() ||
              aiSettings.defaultProvider;
            const wrModel =
              String((aiSettings.weeklyReport && aiSettings.weeklyReport.model) || '').trim() || '';
            const aiResult = await runAiChat(aiSettings, {
              providerId: wrProvider,
              model: wrModel,
              systemPrompt:
                '你是企业内部的个人周报整理助手。请用中文输出结构清晰、可直接提交的 Markdown 周报。必须忠实于输入，不得编造未出现的成果、问题或计划。',
              messages: [
                {
                  role: 'user',
                  content:
                    '请基于以下结构化周报草稿，整理为更自然的个人周报 Markdown。保留这些部分：本周概览、本周完成事项、重点成果、问题与处理、协作与沟通、下周计划。若提供了按日纪要则放在末尾。\n\n' +
                    generated.markdown,
                },
              ],
              temperature: 0.2,
              maxTokens: 1800,
            });
            if (aiResult && aiResult.text) {
              finalMarkdown = String(aiResult.text).trim() + '\n';
              aiMeta = {
                used: true,
                providerId: aiResult.providerId || '',
                model: aiResult.model || '',
              };
            }
          }
        } catch (aiErr) {
          aiMeta = {
            used: false,
            providerId: '',
            model: '',
            error: String(aiErr && aiErr.message ? aiErr.message : aiErr),
          };
        }
        let saved = null;
        if (siteDatabase.isSiteSqlite() && body.save !== false) {
          saved = siteDatabase.createPersonalWeeklyReport({
            title: generated.title,
            style: generated.style,
            rangeFrom: generated.stats && generated.stats.rangeFrom,
            rangeTo: generated.stats && generated.stats.rangeTo,
            resolvedUserId: body.resolvedUserId,
            sourceCount: generated.stats && generated.stats.total,
            summary: {
              stats: generated.stats || {},
              sections: generated.sections || {},
              ai: aiMeta,
            },
            markdownContent: finalMarkdown,
            createdByUserId: req.adminUser && req.adminUser.userId,
            createdByUsername: req.adminUser && req.adminUser.username,
          });
        }
        audit(req, 'blog.fetch.weekly_report.generate', 'ok', {
          sourceCount: generated.stats && generated.stats.total ? generated.stats.total : 0,
          activeDays:
            generated.stats && generated.stats.activeDays ? generated.stats.activeDays : 0,
          resolvedUserId: String(body.resolvedUserId || '').slice(0, 120),
          saved: !!saved,
          aiUsed: aiMeta.used === true,
          aiProvider: aiMeta.providerId || '',
        });
        res.json({
          ok: true,
          supported: siteDatabase.isSiteSqlite(),
          report: Object.assign({}, saved || {}, {
            title: generated.title,
            style: generated.style,
            rangeFrom: generated.stats && generated.stats.rangeFrom ? generated.stats.rangeFrom : '',
            rangeTo: generated.stats && generated.stats.rangeTo ? generated.stats.rangeTo : '',
            resolvedUserId: String(body.resolvedUserId || '').trim(),
            sourceCount: generated.stats && generated.stats.total ? generated.stats.total : 0,
            summary: {
              stats: generated.stats || {},
              sections: generated.sections || {},
              ai: aiMeta,
            },
            markdownContent: finalMarkdown,
          }),
        });
      } catch (e) {
        audit(req, 'blog.fetch.weekly_report.generate', 'error', {
          message: String(e.message || e).slice(0, 200),
        });
        res.status(400).json({ error: String(e.message || e) });
      }
    }
  );

  function makeSubmissionSlug(title) {
    const base = String(title || '')
      .trim()
      .toLowerCase()
      .replace(/[\u4e00-\u9fff]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
    const fallback = base || 'submitted-doc';
    return fallback + '-' + Date.now().toString(36).slice(-6);
  }

  app.get('/api/admin/doc-submissions', requireAdmin, requireRole('admin'), (req, res) => {
    try {
      if (!siteDatabase.isSiteSqlite()) return res.json({ list: [] });
      const status = req.query && req.query.status ? String(req.query.status) : '';
      const list = siteDatabase.listDocSubmissions({ status, limit: 200 });
      res.json({ list });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.post('/api/admin/doc-submissions/:id/review', requireAdmin, requireRole('admin'), async (req, res) => {
    try {
      if (!siteDatabase.isSiteSqlite()) {
        return res.status(400).json({ error: '当前存储模式不支持审核投稿' });
      }
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ error: '无效投稿 id' });
      const action = String((req.body && req.body.action) || '').trim();
      if (action !== 'approve' && action !== 'reject') {
        return res.status(400).json({ error: '无效审核动作' });
      }
      const note = String((req.body && req.body.note) || '').trim();
      const row = siteDatabase.getDocSubmissionById(id);
      if (!row) return res.status(404).json({ error: '投稿不存在' });
      if (row.status !== 'pending') {
        return res.status(400).json({ error: '该投稿已审核，请勿重复处理' });
      }
      let publishMeta = null;
      if (action === 'approve') {
        const reviewActorUsername =
          req.adminUser && req.adminUser.username ? String(req.adminUser.username).trim() : 'admin';
        if (row.targetType === 'main') {
          const slug = siteDatabase.normalizeMainDocSlug(row.targetDocSlug || '');
          const docs = siteDatabase.listMainDocuments();
          if (!slug || !docs.some((d) => d.slug === slug)) {
            return res.status(400).json({ error: '目标主文档不存在' });
          }
          const oldRaw = siteDatabase.getMainMarkdownForSlug(slug) || '';
          const block =
            '\n\n---\n\n## ' +
            String(row.title || '投稿文档').trim() +
            '\n\n' +
            String(row.markdownContent || '').trim() +
            '\n';
          const nextRaw = String(oldRaw || '') + block;
          if (oldRaw !== nextRaw && typeof siteDatabase.appendMainDocHistory === 'function') {
            siteDatabase.appendMainDocHistory({
              slug,
              content: oldRaw,
              source: 'doc.submission.approve.main',
              summary: `审核通过投稿 #${id} · ${String(row.title || '投稿文档').trim()}`,
              actorUserId: req.adminUser && req.adminUser.userId,
              actorUsername: reviewActorUsername,
            });
            if (typeof siteDatabase.pruneMainDocHistory === 'function') {
              siteDatabase.pruneMainDocHistory(slug, 100);
            }
          }
          siteDatabase.setMainMarkdownForSlug(slug, nextRaw);
          try {
            reloadDocData();
          } catch (_) {}
          redisCache.bumpEpoch();
          publishMeta = {
            type: 'main',
            doc: slug,
            title: row.title || '投稿文档',
            sectionCount: getSectionCountForDoc(slug),
            summary: '已追加到主文档并立即生效',
          };
        } else {
          const store = await extraPagesRepo.readStore();
          const extraPagesAdmin = getExtraPagesAdmin();
          const payload = {
            title: row.title || '投稿文档',
            slug: makeSubmissionSlug(row.title),
            format: 'markdown',
            body: row.markdownContent || '',
            excerpt: '',
            tags: Array.isArray(row.tags) ? row.tags.join(', ') : '',
            author: row.submitterName ? String(row.submitterName).trim() : '技术共享上传',
            status: 'published',
            publishedAt: new Date().toISOString(),
          };
          const { page } = extraPagesAdmin.createPage(payload, store);
          await extraPagesRepo.insertPage(page);
          redisCache.bumpEpoch();
          publishMeta = {
            type: 'extra',
            slug: page.slug,
            id: page.id,
            title: row.title || '投稿文档',
            summary: '已发布为扩展页面',
          };
        }
      }
      const reviewed = siteDatabase.reviewDocSubmission({
        id,
        nextStatus: action === 'approve' ? 'approved' : 'rejected',
        reviewNote: note,
        reviewedByUserId: req.adminUser && req.adminUser.userId,
        reviewedByUsername: req.adminUser && req.adminUser.username,
      });
      if (!reviewed) return res.status(400).json({ error: '审核失败，状态可能已变更' });
      audit(req, 'doc.submission.review', 'ok', {
        id,
        action,
        targetType: row.targetType,
        targetDocSlug: row.targetDocSlug,
      });
      res.json({ ok: true, submission: reviewed, publish: publishMeta });
    } catch (e) {
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
      const extraPagesAdmin = getExtraPagesAdmin();
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
      const extraPagesAdmin = getExtraPagesAdmin();
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
        const extraPagesAdmin = getExtraPagesAdmin();
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
