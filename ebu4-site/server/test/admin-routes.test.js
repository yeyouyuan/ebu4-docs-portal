'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');

const { registerAdminRoutes } = require('../admin-routes');
const { httpJson, login } = require('../test-support/http-test-utils.cjs');

function createSiteDatabase(tmpRoot) {
  const kv = new Map();
  const logs = [];
  const dbPath = path.join(tmpRoot, 'site.db');
  fs.writeFileSync(dbPath, 'sqlite-placeholder', 'utf-8');
  const docs = [
    { slug: 'default', title: '默认文档', isDefault: true, updated_at: '2026-04-25T09:00:00.000Z', bytes: 28 },
    { slug: 'guide', title: '使用指南', isDefault: false, updated_at: '2026-04-25T09:00:00.000Z', bytes: 32 },
  ];
  let defaultSlug = 'default';
  const contents = new Map([
    ['default', '# 默认文档\n\n## 缓存说明\n\n默认内容\n'],
    ['guide', '# 使用指南\n\n## 升级流程\n\n指南内容\n'],
  ]);
  const histories = new Map([
    [
      'default',
      [
        {
          id: 8,
          slug: 'default',
          title: '默认文档',
          source: 'docs.main.full_markdown',
          actor_username: 'admin',
          summary: 'default updated',
          content: '# 默认文档\n\n## 历史版本\n\nold\n',
          content_bytes: 31,
          created_at: '2026-04-25T09:00:00.000Z',
        },
      ],
    ],
    [
      'guide',
      [
        {
          id: 12,
          slug: 'guide',
          title: '使用指南',
          source: 'docs.main.full_markdown',
          actor_username: 'admin',
          summary: 'guide updated',
          content: '# 使用指南\n\n## 历史版本\n\nold\n',
          content_bytes: 31,
          created_at: '2026-04-25T09:00:00.000Z',
        },
      ],
    ],
  ]);
  let historySeq = 100;
  const submissions = new Map();
  let submissionSeq = 1;
  function nowIso() {
    return '2026-04-26T09:00:00.000Z';
  }
  function normalizeMainDocSlugLocal(slug) {
    const text = slug != null ? String(slug).trim().toLowerCase() : '';
    if (!text) return '';
    if (!/^[a-z0-9-]{1,63}$/.test(text)) return '';
    return text;
  }
  function sectionCountFor(slug) {
    const raw = contents.get(slug) || '';
    const matches = String(raw).match(/^##\s+/gm);
    return matches ? matches.length : 0;
  }
  function listHistoryRows(slug) {
    return (histories.get(slug) || []).map((row) => Object.assign({}, row));
  }
  return {
    kv,
    logs,
    isSiteSqlite: () => true,
    getKv: (key) => (kv.has(key) ? kv.get(key) : null),
    setKv: (key, value) => kv.set(key, value),
    resolveDbPath: () => dbPath,
    restoreSqliteFromBackup: (backupPath) => {
      fs.copyFileSync(backupPath, dbPath);
    },
    listSeoPushLogs: () => logs.slice(),
    createSeoPushLog: (row) => logs.push(row),
    listMainDocuments: () =>
      docs.map((doc) =>
        Object.assign({}, doc, {
          isDefault: doc.slug === defaultSlug,
          updated_at: doc.updated_at || nowIso(),
          bytes: Buffer.byteLength(contents.get(doc.slug) || '', 'utf-8'),
        })
      ),
    normalizeMainDocSlug: normalizeMainDocSlugLocal,
    getDefaultMainDocSlug: () => defaultSlug,
    setDefaultMainDocSlug: (slug) => {
      const normalized = normalizeMainDocSlugLocal(slug);
      if (!normalized || !docs.some((doc) => doc.slug === normalized)) throw new Error('主文档不存在');
      defaultSlug = normalized;
    },
    countSectionsForSlug: (slug) => sectionCountFor(slug || defaultSlug),
    getMainMarkdownForSlug: (slug) => contents.get(slug || defaultSlug) || '',
    setMainMarkdownForSlug: (slug, content) => {
      const normalized = normalizeMainDocSlugLocal(slug) || defaultSlug;
      const doc = docs.find((item) => item.slug === normalized);
      if (!doc) throw new Error('主文档不存在: ' + normalized);
      const body = String(content || '');
      contents.set(normalized, body);
      doc.updated_at = nowIso();
      doc.bytes = Buffer.byteLength(body, 'utf-8');
    },
    listMainDocHistory: (slug, opts) => {
      const rows = listHistoryRows(slug);
      const limit = Math.min(200, Math.max(1, parseInt(opts && opts.limit, 10) || 30));
      return rows.slice(0, limit);
    },
    getMainDocHistoryVersion: (slug, versionId) =>
      listHistoryRows(slug).find((row) => row.id === Number(versionId)) || null,
    appendMainDocHistory: ({ slug, content, source, actorUserId, actorUsername, summary }) => {
      const normalized = normalizeMainDocSlugLocal(slug) || defaultSlug;
      const doc = docs.find((item) => item.slug === normalized);
      if (!doc) throw new Error('主文档不存在');
      const row = {
        id: ++historySeq,
        slug: normalized,
        title: doc.title,
        source: source || 'manual',
        actor_user_id: actorUserId != null ? Number(actorUserId) : null,
        actor_username: actorUsername || '',
        summary: summary || '',
        content: String(content || ''),
        content_bytes: Buffer.byteLength(String(content || ''), 'utf-8'),
        created_at: nowIso(),
      };
      const list = histories.get(normalized) || [];
      list.unshift(row);
      histories.set(normalized, list);
      return row.id;
    },
    pruneMainDocHistory: (slug, keep) => {
      const normalized = normalizeMainDocSlugLocal(slug) || defaultSlug;
      const limit = Math.max(1, parseInt(keep, 10) || 100);
      const list = histories.get(normalized) || [];
      histories.set(normalized, list.slice(0, limit));
    },
    createMainDocument: ({ slug, title }) => {
      const normalized = normalizeMainDocSlugLocal(slug);
      if (!normalized) throw new Error('slug 须为小写字母、数字、连字符，且 1–63 字符');
      if (docs.some((doc) => doc.slug === normalized)) throw new Error('slug 已存在');
      docs.push({
        slug: normalized,
        title: String(title || normalized).trim() || normalized,
        isDefault: false,
        updated_at: nowIso(),
        bytes: 0,
      });
      contents.set(normalized, '# ' + (String(title || normalized).trim() || normalized) + '\n\n');
      histories.set(normalized, []);
      return normalized;
    },
    updateMainDocumentTitle: (slug, title) => {
      const normalized = normalizeMainDocSlugLocal(slug);
      const doc = docs.find((item) => item.slug === normalized);
      if (!doc) throw new Error('主文档不存在');
      doc.title = String(title || '').trim() || normalized;
      doc.updated_at = nowIso();
    },
    deleteMainDocument: (slug) => {
      const normalized = normalizeMainDocSlugLocal(slug);
      if (!normalized) throw new Error('主文档不存在');
      if (normalized === defaultSlug) throw new Error('默认主文档不可删除');
      const idx = docs.findIndex((item) => item.slug === normalized);
      if (idx < 0) throw new Error('主文档不存在');
      docs.splice(idx, 1);
      contents.delete(normalized);
      histories.delete(normalized);
    },
    createDocSubmission: ({ title, targetType, targetDocSlug, markdownContent, tags, submitterName }) => {
      const id = submissionSeq++;
      const row = {
        id,
        title: String(title || ''),
        targetType: targetType === 'main' ? 'main' : 'extra',
        targetDocSlug: String(targetDocSlug || ''),
        fileName: 'submission.md',
        markdownContent: String(markdownContent || ''),
        tags: Array.isArray(tags) ? tags : [],
        submitterName: String(submitterName || ''),
        submitterContact: '',
        status: 'pending',
        reviewNote: '',
        reviewedByUserId: null,
        reviewedByUsername: '',
        reviewedAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      submissions.set(id, row);
      return Object.assign({}, row);
    },
    getDocSubmissionById: (id) => {
      const row = submissions.get(Number(id));
      return row ? Object.assign({}, row) : null;
    },
    listDocSubmissions: (opts) => {
      const status = opts && opts.status ? String(opts.status) : '';
      return Array.from(submissions.values())
        .filter((row) => !status || row.status === status)
        .sort((a, b) => b.id - a.id)
        .map((row) => Object.assign({}, row));
    },
    reviewDocSubmission: ({ id, nextStatus, reviewNote, reviewedByUserId, reviewedByUsername }) => {
      const row = submissions.get(Number(id));
      if (!row || row.status !== 'pending') return null;
      row.status = nextStatus === 'approved' ? 'approved' : 'rejected';
      row.reviewNote = String(reviewNote || '');
      row.reviewedByUserId = reviewedByUserId != null ? Number(reviewedByUserId) : null;
      row.reviewedByUsername = String(reviewedByUsername || '');
      row.reviewedAt = nowIso();
      row.updatedAt = nowIso();
      return Object.assign({}, row);
    },
  };
}

function createAdminUsersService() {
  return {
    authenticate(username, password) {
      if (username === 'admin' && password === 'adminpass') {
        return { id: 1, username: 'admin', role: 'admin' };
      }
      if (username === 'editor' && password === 'editorpass') {
        return { id: 2, username: 'editor', role: 'editor' };
      }
      return null;
    },
    authenticateLegacyPasswordOnly() {
      return null;
    },
    countUsersWithRole() {
      return 0;
    },
  };
}

function createAdminApp(options) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ebu4-admin-routes-'));
  const publicDataDir = path.join(tmpRoot, 'public', 'data');
  fs.mkdirSync(publicDataDir, { recursive: true });
  const siteDatabase = createSiteDatabase(tmpRoot);
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  const upgradeCalls = { check: 0, applyDocs: 0, applySystem: 0 };
  const seoPushCalls = [];
  const roleProfiles =
    (options && options.roleProfiles) ||
    {
      order: ['admin', 'editor'],
      roles: {
        admin: {
          label: '管理员',
          system: true,
          moduleAccess: {
            siteSettings: true,
            seo: true,
            audit: true,
            inviteRegister: true,
            blogFetch: true,
            aiSettings: true,
          },
          dataViews: { mainDoc: true, tools: true, landing: true, extraPages: true, images: true, stats: true },
          securityLevel: 'internal',
          securityNote: '',
        },
        editor: {
          label: '编辑',
          system: true,
          moduleAccess: {
            siteSettings: false,
            seo: false,
            audit: false,
            inviteRegister: false,
            blogFetch: false,
            aiSettings: false,
          },
          dataViews: { mainDoc: true, tools: true, landing: true, extraPages: true, images: true, stats: true },
          securityLevel: 'internal',
          securityNote: '',
        },
      },
    };
  siteDatabase.setKv('role_profiles', JSON.stringify(roleProfiles));
  siteDatabase.setKv(
    'ai_settings',
    JSON.stringify({
      enabled: true,
      defaultProvider: 'openai',
      publicAssistant: { enabled: true, requireLogin: false, showSources: true, allowWebSearch: true },
      weeklyReport: { useAi: false, provider: '', model: '' },
      webSearch: { enabled: false, provider: 'searxng', baseUrl: '', apiKey: 'search-key', maxResults: 5, safeSearch: 'moderate' },
      providers: {
        openai: {
          enabled: true,
          type: 'openai',
          label: 'OpenAI',
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-4.1-mini',
          apiKey: 'secret-key',
        },
      },
    })
  );
  siteDatabase.setKv(
    'site_settings',
    JSON.stringify(
      (options && options.siteSettings) || {
        upgrade: {
          enabled: true,
          baseUrl: 'https://updates.example.com',
          manifestPath: '/upgrade/manifest.json',
          checkChannels: 'both',
          autoUpdate: { enabled: false, intervalMinutes: 60, applyDocs: false, applySystem: false },
        },
      }
    )
  );
  siteDatabase.setKv(
    'seo',
    JSON.stringify(
      (options && options.seo) || {
        canonicalBase: 'https://docs.example.com',
        docs: { title: 'Docs', description: '', keywords: '', ogImage: '', twitterCard: 'summary_large_image', robots: 'index, follow' },
        landing: { title: 'Home', description: '', keywords: '', ogImage: '', twitterCard: 'summary_large_image', robots: 'index, follow' },
        sitemapAuto: true,
        sitemapPaths: [],
        includeExtraPagesInSearch: true,
        includeExtraPagesInSitemap: false,
        structuredData: { organizationName: '', organizationLogo: '', sameAs: [] },
        verification: {},
        submission: { google: {}, bing: {}, baidu: {} },
      }
    )
  );

  registerAdminRoutes(app, {
    MD_PATH: path.join(tmpRoot, 'ebu4-docs.md'),
    IMG_DIR: path.join(tmpRoot, 'img'),
    TOOLS_JSON_PATH: path.join(publicDataDir, 'tools-nav.json'),
    LANDING_JSON_PATH: path.join(publicDataDir, 'landing.json'),
    SEO_JSON_PATH: path.join(publicDataDir, 'seo.json'),
    AI_SETTINGS_PATH: path.join(publicDataDir, 'ai-settings.json'),
    EXTRA_PAGES_PATH: path.join(publicDataDir, 'extra-pages.json'),
    backupKeepCount: 3,
    reloadDocData: options && options.reloadDocData ? options.reloadDocData : () => {},
    getAdminPassword: () => 'ignored-password',
    siteDatabase,
    adminUsersService: createAdminUsersService(),
    upgradeDeps: {
      upgradeService: {
        withUpgradeLock: (fn) => Promise.resolve().then(fn),
        runUpgradeCheck: async () => {
          upgradeCalls.check += 1;
          return { ok: true, stage: 'check' };
        },
        runUpgradeApplyDocs: async () => {
          upgradeCalls.applyDocs += 1;
          return { ok: true, channel: 'docs' };
        },
        runUpgradeApplySystem: async () => {
          upgradeCalls.applySystem += 1;
          return { ok: true, channel: 'system', needsRestart: false };
        },
        readUpgradeHistory: () => [],
        getKvJson: () => null,
        appendHistory: () => {},
      },
      buildUpgradeArtifacts: async () => ({
        docs: true,
        system: { selectedScopes: ['site'] },
        manifest: { docsVersion: '1.0.0' },
      }),
      listSystemPackageScopes: () => [{ id: 'site', label: '站点', hint: '' }],
      normalizeSystemPackageScopes: (items) => items,
    },
    runAiChat: async () => ({ providerId: 'openai', model: 'gpt-4.1-mini', text: 'AI 测试成功' }),
    runSeoPush: async ({ engines }) => {
      seoPushCalls.push(engines);
      return {
        context: {
          origin: 'https://docs.example.com',
          sitemapUrl: 'https://docs.example.com/sitemap.xml',
          urls: ['https://docs.example.com/index'],
        },
        results: [
          {
            status: 'ok',
            engine: 'google',
            action: 'submit_sitemap',
            targetType: 'sitemap',
            target: 'https://docs.example.com/sitemap.xml',
            requestSummary: 'ok',
            urlCount: 1,
            ok: true,
            httpStatus: 200,
            responseExcerpt: '',
            errorMessage: '',
          },
        ],
      };
    },
    getSectionCount: options && Object.prototype.hasOwnProperty.call(options, 'getSectionCount') ? options.getSectionCount : () => 12,
    getSectionCountForDoc:
      options && Object.prototype.hasOwnProperty.call(options, 'getSectionCountForDoc')
        ? options.getSectionCountForDoc
        : (slug) => (slug === 'guide' ? 7 : 12),
    searchMainDocsForAdmin:
      options && Object.prototype.hasOwnProperty.call(options, 'searchMainDocsForAdmin')
        ? options.searchMainDocsForAdmin
        : (query, opts) => {
            const docSlug = opts && opts.docSlug ? String(opts.docSlug) : '';
            const base = [
              {
                docSlug: 'default',
                docTitle: '默认文档',
                isDefault: true,
                sectionId: 1,
                sectionTitle: '缓存说明',
                sectionSlug: 'cache',
                snippet: '...缓存与命中率说明...',
                score: 18,
              },
              {
                docSlug: 'guide',
                docTitle: '使用指南',
                isDefault: false,
                sectionId: 3,
                sectionTitle: '升级流程',
                sectionSlug: 'upgrade',
                snippet: '...升级流程与回滚说明...',
                score: 14,
              },
            ];
            if (!query || String(query).trim().length < 2) return [];
            return docSlug ? base.filter((item) => item.docSlug === docSlug) : base;
          },
    dashboardDeps: options && options.dashboardDeps ? options.dashboardDeps : undefined,
  });

  return { app, siteDatabase, tmpRoot, upgradeCalls, seoPushCalls };
}

test('admin routes: permission matrix and AI config sanitization', async () => {
  const { app, tmpRoot } = createAdminApp();
  try {
    const unauth = await httpJson(app, '/api/admin/ai/settings');
    assert.equal(unauth.res.status, 401);
    assert.equal(unauth.data.message, '未登录或会话无效');

    const editor = await login(app, 'editor', 'editorpass');
    const denied = await httpJson(app, '/api/admin/ai/settings', {
      headers: { Cookie: editor.cookie },
    });
    assert.equal(denied.res.status, 403);
    assert.equal(denied.data.message, '权限不足');

    const admin = await login(app, 'admin', 'adminpass');
    const ok = await httpJson(app, '/api/admin/ai/settings', {
      headers: { Cookie: admin.cookie },
    });
    assert.equal(ok.res.status, 200);
    assert.equal(ok.data.providers.openai.apiKey, '');
    assert.equal(ok.data.providers.openai.apiKeyConfigured, true);
    assert.equal(ok.data.webSearch.apiKey, '');
    assert.equal(ok.data.webSearchApiKeyConfigured, true);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('admin routes: dashboard returns resilient aggregated data', async () => {
  const { app, siteDatabase, tmpRoot } = createAdminApp();
  try {
    siteDatabase.setKv(
      'public_visit_stats',
      JSON.stringify({
        total: 20,
        docsPv: 8,
        indexPv: 6,
        extraPagePv: 2,
        byPath: { '/docs': 8, '/': 6, '/page/demo': 2, '/other': 4 },
        byDay: { '2026-04-20': 3, '2026-04-21': 5, '2026-04-22': 12 },
        updatedAt: '2026-04-22T10:00:00.000Z',
      })
    );
    const admin = await login(app, 'admin', 'adminpass');
    const dashboard = await httpJson(app, '/api/admin/dashboard', {
      headers: { Cookie: admin.cookie },
    });
    assert.equal(dashboard.res.status, 200);
    assert.equal(dashboard.data.visits.total, 20);
    assert.deepEqual(dashboard.data.topPaths[0], { path: '/docs', count: 8 });
    assert.equal(dashboard.data.sectionCount, 12);
    assert.equal(dashboard.data.presence.count, 0);
    assert.ok(Array.isArray(dashboard.data.health.checks));
    assert.equal(
      dashboard.data.health.checks.some((item) => item && item.key === 'redis'),
      true
    );
    assert.equal(dashboard.data.backups.total, 0);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('admin routes: dashboard survives presence and section failures', async () => {
  const { app, tmpRoot } = createAdminApp({
    getSectionCount: () => {
      throw new Error('section broken');
    },
    dashboardDeps: {
      presenceStore: {
        listOnline: async () => {
          throw new Error('presence broken');
        },
        getStatus: async () => ({
          connected: false,
          urlConfigured: false,
          effectiveBackend: 'memory',
          source: 'none',
          listUsesBackend: 'memory',
        }),
      },
    },
  });
  try {
    const admin = await login(app, 'admin', 'adminpass');
    const dashboard = await httpJson(app, '/api/admin/dashboard', {
      headers: { Cookie: admin.cookie },
    });
    assert.equal(dashboard.res.status, 200);
    assert.equal(dashboard.data.presence.count, 0);
    assert.equal(dashboard.data.presence.backend, 'memory');
    assert.equal(dashboard.data.sectionCount, 0);
    const redisItem = dashboard.data.health.checks.find((item) => item.key === 'redis');
    assert.equal(redisItem.status, 'warning');
    assert.equal(redisItem.summary, 'Redis 未配置');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('admin routes: dashboard degrades when redis status read fails', async () => {
  const { app, tmpRoot } = createAdminApp({
    dashboardDeps: {
      presenceStore: {
        listOnline: async () => ({ list: [], backend: 'memory' }),
        getStatus: async () => {
          throw new Error('redis status failed');
        },
      },
    },
  });
  try {
    const admin = await login(app, 'admin', 'adminpass');
    const dashboard = await httpJson(app, '/api/admin/dashboard', {
      headers: { Cookie: admin.cookie },
    });
    assert.equal(dashboard.res.status, 200);
    const redisItem = dashboard.data.health.checks.find((item) => item.key === 'redis');
    assert.equal(redisItem.status, 'error');
    assert.equal(redisItem.summary, 'redis status failed');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('admin routes: main docs metadata and search validation endpoint', async () => {
  const { app, tmpRoot } = createAdminApp();
  try {
    const admin = await login(app, 'admin', 'adminpass');
    const headers = { Cookie: admin.cookie };

    const docs = await httpJson(app, '/api/admin/docs/main-docs', { headers });
    assert.equal(docs.res.status, 200);
    assert.equal(docs.data.docs.length, 2);
    assert.equal(docs.data.docs[0].sectionCount, 12);
    assert.equal(docs.data.docs[0].latestVersion.actorUsername, 'admin');

    const currentSearch = await httpJson(app, '/api/admin/docs/search?q=升级&scope=current&doc=guide', {
      headers,
    });
    assert.equal(currentSearch.res.status, 200);
    assert.equal(currentSearch.data.scope, 'current');
    assert.equal(currentSearch.data.items.length, 1);
    assert.equal(currentSearch.data.items[0].docSlug, 'guide');

    const allSearch = await httpJson(app, '/api/admin/docs/search?q=缓存&scope=all', {
      headers,
    });
    assert.equal(allSearch.res.status, 200);
    assert.equal(allSearch.data.items.length, 2);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('admin routes: main doc lifecycle, history, rollback and submission publish', async () => {
  const { app, siteDatabase, tmpRoot } = createAdminApp({
    getSectionCountForDoc: (slug) => siteDatabase.countSectionsForSlug(slug),
    getSectionCount: () => siteDatabase.countSectionsForSlug('default'),
  });
  try {
    const admin = await login(app, 'admin', 'adminpass');
    const headers = { Cookie: admin.cookie, 'Content-Type': 'application/json' };

    const createDoc = await httpJson(app, '/api/admin/docs/main-docs', {
      method: 'POST',
      headers,
      body: JSON.stringify({ slug: 'playbook', title: '运维手册' }),
    });
    assert.equal(createDoc.res.status, 200);
    assert.equal(createDoc.data.slug, 'playbook');

    const renameDoc = await httpJson(app, '/api/admin/docs/main-docs/playbook', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ title: '运维手册 v2' }),
    });
    assert.equal(renameDoc.res.status, 200);

    const setDefault = await httpJson(app, '/api/admin/docs/main-docs/guide/set-default', {
      method: 'POST',
      headers: { Cookie: admin.cookie },
    });
    assert.equal(setDefault.res.status, 200);

    const saveMarkdownEmpty = await httpJson(app, '/api/admin/files/markdown?doc=guide', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ content: '   ' }),
    });
    assert.equal(saveMarkdownEmpty.res.status, 400);
    assert.equal(saveMarkdownEmpty.data.message, '整篇 Markdown 校验失败');

    const saveMarkdown = await httpJson(app, '/api/admin/files/markdown?doc=guide', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ content: '# 使用指南\n\n## 升级流程\n\n新的正文\n' }),
    });
    assert.equal(saveMarkdown.res.status, 200);
    assert.equal(saveMarkdown.data.sectionCount, 1);

    const guideHistory = await httpJson(app, '/api/admin/docs/main-docs/guide/history?limit=10', {
      headers: { Cookie: admin.cookie },
    });
    assert.equal(guideHistory.res.status, 200);
    assert.equal(guideHistory.data.versions[0].source, 'docs.main.full_markdown');
    assert.equal(guideHistory.data.versions[0].summary, '整篇 Markdown 保存');

    const versionId = guideHistory.data.versions[0].id;
    const rollback = await httpJson(
      app,
      '/api/admin/docs/main-docs/guide/history/' + versionId + '/rollback',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      }
    );
    assert.equal(rollback.res.status, 200);
    assert.equal(rollback.data.sectionCount, 1);

    const submission = siteDatabase.createDocSubmission({
      title: '新的审核稿',
      targetType: 'main',
      targetDocSlug: 'guide',
      markdownContent: '审核通过后追加到主文档',
      tags: ['审核'],
      submitterName: '投稿人',
    });
    const approve = await httpJson(app, '/api/admin/doc-submissions/' + submission.id + '/review', {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'approve', note: '可以发布' }),
    });
    assert.equal(approve.res.status, 200);
    assert.equal(approve.data.submission.status, 'approved');
    assert.equal(approve.data.publish.type, 'main');
    assert.equal(approve.data.publish.doc, 'guide');

    const guideRaw = siteDatabase.getMainMarkdownForSlug('guide');
    assert.match(guideRaw, /新的审核稿/);
    assert.match(guideRaw, /审核通过后追加到主文档/);

    const guideHistoryAfterApprove = siteDatabase.listMainDocHistory('guide', { limit: 10 });
    assert.equal(guideHistoryAfterApprove[0].source, 'doc.submission.approve.main');
    assert.equal(guideHistoryAfterApprove[0].actor_username, 'admin');
    assert.match(guideHistoryAfterApprove[0].summary, /审核通过投稿/);
    assert.doesNotMatch(String(guideHistoryAfterApprove[0].content || ''), /新的审核稿/);

    const deleteDoc = await httpJson(app, '/api/admin/docs/main-docs/playbook', {
      method: 'DELETE',
      headers: { Cookie: admin.cookie },
    });
    assert.equal(deleteDoc.res.status, 200);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('admin routes: validate AI save, SEO push, upgrade check/apply, backup create/restore', async () => {
  const { app, siteDatabase, tmpRoot, upgradeCalls, seoPushCalls } = createAdminApp({
    seo: {
      canonicalBase: 'https://docs.example.com',
      docs: { title: 'Docs', description: '', keywords: '', ogImage: '', twitterCard: 'summary_large_image', robots: 'index, follow' },
      landing: { title: 'Home', description: '', keywords: '', ogImage: '', twitterCard: 'summary_large_image', robots: 'index, follow' },
      sitemapAuto: true,
      sitemapPaths: ['/index'],
      includeExtraPagesInSearch: true,
      includeExtraPagesInSitemap: false,
      structuredData: { organizationName: '', organizationLogo: '', sameAs: [] },
      verification: {},
      submission: { google: {}, bing: {}, baidu: {} },
    },
  });
  try {
    const admin = await login(app, 'admin', 'adminpass');
    const headers = { Cookie: admin.cookie, 'Content-Type': 'application/json' };

    const badAi = await httpJson(app, '/api/admin/ai/settings', {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        enabled: true,
        defaultProvider: 'openai',
        publicAssistant: { enabled: true, requireLogin: false, showSources: true, allowWebSearch: true },
        weeklyReport: { useAi: false, provider: '', model: '' },
        webSearch: { enabled: false, provider: 'searxng', baseUrl: '', apiKey: '', maxResults: 5, safeSearch: 'moderate' },
        providers: {
          openai: {
            enabled: true,
            type: 'openai',
            label: 'OpenAI',
            baseUrl: 'https://api.openai.com/v1',
            model: '',
            apiKey: '',
          },
        },
      }),
    });
    assert.equal(badAi.res.status, 400);
    assert.equal(badAi.data.message, 'AI 配置校验失败');
    assert.ok(Array.isArray(badAi.data.detail));

    const badSeo = await httpJson(app, '/api/admin/seo/push', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        seo: {
          canonicalBase: 'http://localhost:3000',
          docs: { title: 'Docs' },
          landing: { title: 'Home' },
          sitemapAuto: true,
          sitemapPaths: [],
          includeExtraPagesInSearch: true,
          includeExtraPagesInSitemap: false,
          structuredData: {},
          verification: {},
          submission: {},
        },
      }),
    });
    assert.equal(badSeo.res.status, 400);
    assert.equal(badSeo.data.message, 'SEO 配置校验失败');

    const badUpgradeCheckApp = createAdminApp({
      siteSettings: {
        upgrade: {
          enabled: true,
          baseUrl: '',
          manifestPath: 'manifest.json',
          checkChannels: 'weird',
          autoUpdate: { enabled: false, intervalMinutes: 60, applyDocs: false, applySystem: false },
        },
      },
    });
    try {
      const badAdmin = await login(badUpgradeCheckApp.app, 'admin', 'adminpass');
      const badUpgrade = await httpJson(badUpgradeCheckApp.app, '/api/admin/upgrade/check', {
        method: 'POST',
        headers: { Cookie: badAdmin.cookie },
      });
      assert.equal(badUpgrade.res.status, 400);
      assert.equal(badUpgrade.data.message, '升级配置校验失败');
    } finally {
      fs.rmSync(badUpgradeCheckApp.tmpRoot, { recursive: true, force: true });
    }

    const upgradeCheck = await httpJson(app, '/api/admin/upgrade/check', {
      method: 'POST',
      headers: { Cookie: admin.cookie },
    });
    assert.equal(upgradeCheck.res.status, 200);
    assert.equal(upgradeCalls.check, 1);

    const upgradeApplyBad = await httpJson(app, '/api/admin/upgrade/apply', {
      method: 'POST',
      headers,
      body: JSON.stringify({ channel: 'other', artifactIndex: -1 }),
    });
    assert.equal(upgradeApplyBad.res.status, 400);
    assert.equal(upgradeApplyBad.data.message, '升级参数校验失败');

    const upgradeApply = await httpJson(app, '/api/admin/upgrade/apply', {
      method: 'POST',
      headers,
      body: JSON.stringify({ channel: 'docs', artifactIndex: 0 }),
    });
    assert.equal(upgradeApply.res.status, 200);
    assert.equal(upgradeCalls.applyDocs, 1);

    const backupCreate = await httpJson(app, '/api/admin/backups/create', {
      method: 'POST',
      headers: { Cookie: admin.cookie },
    });
    assert.equal(backupCreate.res.status, 200);
    assert.equal(backupCreate.data.ok, true);

    const backups = fs
      .readdirSync(path.dirname(siteDatabase.resolveDbPath()))
      .filter((name) => name.startsWith(path.basename(siteDatabase.resolveDbPath()) + '.bak-'));
    assert.ok(backups.length > 0);

    const restoreMissing = await httpJson(app, '/api/admin/backups/restore', {
      method: 'POST',
      headers,
      body: JSON.stringify({ fileName: 'missing-file' }),
    });
    assert.equal(restoreMissing.res.status, 404);
    assert.equal(restoreMissing.data.message, '备份文件不存在');

    const restoreOk = await httpJson(app, '/api/admin/backups/restore', {
      method: 'POST',
      headers,
      body: JSON.stringify({ fileName: backups[0] }),
    });
    assert.equal(restoreOk.res.status, 200);
    assert.equal(restoreOk.data.ok, true);

    const seoPush = await httpJson(app, '/api/admin/seo/push', {
      method: 'POST',
      headers,
      body: JSON.stringify({ engines: ['google'] }),
    });
    assert.equal(seoPush.res.status, 200);
    assert.equal(seoPushCalls.length, 1);
    assert.deepEqual(seoPushCalls[0], ['google']);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
