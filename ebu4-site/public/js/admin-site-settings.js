(function () {
  var TEMPLATE = [
    '<div class="admin-card admin-stats ry-stats-card" id="statsBox">',
    '  <span class="admin-label">站点数据概览</span>',
    '  <div id="statsInner">加载中…</div>',
    '</div>',
    '  <section class="admin-card site-settings-card site-branding-card site-branding-card--top">',
    '    <div class="site-settings-head">',
    '      <span class="admin-label">品牌与标识（通用）</span>',
    '      <p class="admin-tools-hint">仅保留通用字段，统一作用于后台侧栏与门户导航；网站 title/ico 单独控制。</p>',
    '    </div>',
    '    <div class="site-settings-body">',
    '      <div class="site-branding-grid site-branding-grid--top">',
    '        <label class="admin-field admin-field-full"><span class="admin-field-label">通用标识（Logo 文本）</span><input type="text" id="site_brand_common_mark" class="admin-input" placeholder="E9" /></label>',
    '        <label class="admin-field admin-field-full"><span class="admin-field-label">通用主标题</span><input type="text" id="site_brand_common_title" class="admin-input" placeholder="EBU4 文档站" /></label>',
    '        <label class="admin-field admin-field-full"><span class="admin-field-label">通用副标题</span><input type="text" id="site_brand_common_sub" class="admin-input" placeholder="企业级技术支持门户" /></label>',
    '        <label class="admin-field admin-field-full"><span class="admin-field-label">通用版本标识</span><input type="text" id="site_brand_common_version" class="admin-input" placeholder="v3.0" /></label>',
    '        <label class="admin-field admin-field-full"><span class="admin-field-label">网站 Title</span><input type="text" id="site_brand_site_title" class="admin-input" placeholder="例如：EBU4 文档站 · 技术支持平台" /></label>',
    '        <label class="admin-field admin-field-full"><span class="admin-field-label">网站 ICO 地址</span><input type="text" id="site_brand_site_icon" class="admin-input" placeholder="/icons/icon.svg 或完整 https 地址" /></label>',
    '      </div>',
    '    </div>',
    '  </section>',
    '<div class="site-settings-main">',
    '<div class="site-settings-left">',
    '<div class="site-settings-layout">',
    '  <section class="admin-card site-settings-card">',
    '    <div class="site-settings-head">',
    '      <span class="admin-label">访问控制</span>',
    '      <p class="admin-tools-hint">门户首页开关仅影响 <code>/</code>、<code>/index</code>；关闭后自动跳转到文档页 <code>/docs</code>。</p>',
    '    </div>',
    '    <div class="site-settings-body">',
    '      <label class="admin-field admin-field-full admin-switch-row site-switch-row">',
    '        <input type="checkbox" id="site_homepage_enabled" checked />',
    '        <span class="admin-switch-ui" aria-hidden="true"></span>',
    '        <span class="admin-field-label" style="display:inline">启用门户首页访问（<code>/</code>、<code>/index</code>）</span>',
    '      </label>',
    '    </div>',
    '  </section>',
    '  <section class="admin-card site-settings-card">',
    '    <div class="site-settings-head">',
    '      <span class="admin-label">维护模式</span>',
    '      <p class="admin-tools-hint">默认仅关闭门户首页；勾选“全站维护”后，<code>/docs</code> 与公开接口也会 503。<code>/api/health</code>、<code>/admin</code>、<code>/api/admin</code> 始终可用。</p>',
    '    </div>',
    '    <div class="site-settings-body">',
    '      <label class="admin-field admin-field-full admin-checkbox-row"><input type="checkbox" id="site_maint_enabled" /> <span class="admin-field-label" style="display:inline">启用维护模式</span></label>',
    '      <label class="admin-field admin-field-full admin-checkbox-row"><input type="checkbox" id="site_maint_full_site" /> <span class="admin-field-label" style="display:inline">全站维护（含 <code>/docs</code> 文档站与公开接口）</span></label>',
    '      <label class="admin-field admin-field-full"><span class="admin-field-label">维护提示文案</span><textarea id="site_maint_message" class="admin-input" rows="3" spellcheck="true" placeholder="站点维护中，请稍后再试。"></textarea></label>',
    '    </div>',
    '  </section>',
    '  <section class="admin-card site-settings-card">',
    '    <div class="site-settings-head">',
    '      <span class="admin-label">注册策略</span>',
    '      <p class="admin-tools-hint">作用于公开页 <code>/register</code> 与 <code>POST /api/register</code>。</p>',
    '    </div>',
    '    <div class="site-settings-body">',
    '      <label class="admin-field admin-field-full">',
    '        <span class="admin-field-label">注册形式</span>',
    '        <select id="site_registration_mode" class="admin-input">',
    '          <option value="invitation">邀请制（须有效邀请码）</option>',
    '          <option value="open">自主注册（可不填邀请码；若填写则仍消耗邀请码并采用码上默认角色）</option>',
    '        </select>',
    '      </label>',
    '    </div>',
    '  </section>',
    '  <section class="admin-card admin-hidden site-settings-card" id="siteEmbedAiCard">',
    '    <div class="site-settings-head">',
    '      <span class="admin-label">前台嵌入（AI / 脚本）</span>',
    '      <p class="admin-tools-hint">会插入门户、文档站和扩展页的 <code>&lt;/body&gt;</code> 前。仅管理员可编辑，请只使用可信脚本。</p>',
    '    </div>',
    '    <div class="site-settings-body">',
    '      <label class="admin-field admin-field-full">',
    '        <span class="admin-field-label">嵌入代码（HTML / script）</span>',
    '        <textarea id="site_embed_ai_chat" class="admin-input mono" rows="8" spellcheck="false" placeholder="例如：&#10;&lt;script async defer src=&quot;https://example.com/chat/embed.js&quot;&gt;&lt;/script&gt;"></textarea>',
    '      </label>',
    '    </div>',
    '  </section>',
    '</div>',
    '</div>',
    '<aside class="site-settings-right">',
    '<div class="admin-card site-settings-release-card">',
    '  <div class="site-settings-head">',
    '    <span class="admin-label">发布治理（草稿 / 发布 / 回滚）</span>',
    '    <p class="admin-tools-hint">修改先保存草稿，校验通过后发布；可查看历史版本并回滚。</p>',
    '  </div>',
    '  <div class="site-settings-body">',
    '    <label class="admin-field admin-field-full">',
    '      <span class="admin-field-label">发布摘要（建议填写）</span>',
    '      <input type="text" id="sitePublishSummary" class="admin-input" autocomplete="off" placeholder="例如：调整首页访问策略与维护提示文案" />',
    '    </label>',
    '    <div class="admin-row" style="gap:8px;flex-wrap:wrap">',
    '      <button type="button" class="admin-btn-ghost" id="btnSiteSaveDraft">保存草稿</button>',
    '      <button type="button" class="admin-btn-ghost" id="btnSiteValidate">校验草稿</button>',
    '      <button type="button" class="admin-btn-primary" id="btnSitePublish">发布生效</button>',
    '      <button type="button" class="admin-btn-ghost" id="btnSiteRefreshReleases">刷新历史</button>',
    '    </div>',
    '    <div class="admin-row" style="margin-top:8px">',
    '      <span class="admin-msg" id="siteSettingsMsg"></span>',
    '    </div>',
    '    <div id="siteReleasesHost" class="site-releases-host"></div>',
    '    <pre id="siteReleaseDetail" class="site-release-detail">请选择历史版本查看详情</pre>',
    '  </div>',
    '</div>',
    '</aside>',
    '</div>',
  ].join('');
  var _deps = null;

  function byId(id) {
    return document.getElementById(id);
  }
  function setMsg(text, type) {
    var m = byId('siteSettingsMsg');
    if (!m) return;
    m.textContent = text || '';
    m.className = text ? 'admin-msg' + (type ? ' ' + type : '') : 'admin-msg';
  }
  function safeJsonParse(s, fallback) {
    try {
      return JSON.parse(s);
    } catch (_) {
      return fallback;
    }
  }
  async function askConfirm(message, title, okText, cancelText) {
    if (typeof window.showAdminConfirm === 'function') {
      return !!(await window.showAdminConfirm(message, title || '操作确认', okText || '确定', cancelText || '取消'));
    }
    return window.confirm(message);
  }
  function isNotFoundErr(err) {
    var m = err && err.message ? String(err.message) : String(err || '');
    return /not found/i.test(m) || /404/.test(m);
  }
  function mergeForDisplay(baseCfg, draftCfg) {
    var base = baseCfg && typeof baseCfg === 'object' ? baseCfg : {};
    var draft = draftCfg && typeof draftCfg === 'object' ? draftCfg : {};
    var out = Object.assign({}, base, draft);
    out.homepage = Object.assign({}, base.homepage || {}, draft.homepage || {});
    out.maintenance = Object.assign({}, base.maintenance || {}, draft.maintenance || {});
    out.registration = Object.assign({}, base.registration || {}, draft.registration || {});
    out.embed = Object.assign({}, base.embed || {}, draft.embed || {});
    out.branding = Object.assign({}, base.branding || {}, draft.branding || {});
    out.branding.common = Object.assign({}, (base.branding && base.branding.common) || {}, (draft.branding && draft.branding.common) || {});
    out.branding.site = Object.assign({}, (base.branding && base.branding.site) || {}, (draft.branding && draft.branding.site) || {});
    out.branding.adminSidebar = Object.assign(
      {},
      (base.branding && base.branding.adminSidebar) || {},
      (draft.branding && draft.branding.adminSidebar) || {}
    );
    out.branding.adminNavbar = Object.assign(
      {},
      (base.branding && base.branding.adminNavbar) || {},
      (draft.branding && draft.branding.adminNavbar) || {}
    );
    out.branding.landingNav = Object.assign(
      {},
      (base.branding && base.branding.landingNav) || {},
      (draft.branding && draft.branding.landingNav) || {}
    );
    if (
      base.embed &&
      typeof base.embed.aiChatHtml === 'string' &&
      base.embed.aiChatHtml &&
      (!out.embed || !out.embed.aiChatHtml)
    ) {
      out.embed = out.embed || {};
      out.embed.aiChatHtml = base.embed.aiChatHtml;
    }
    return out;
  }

  function setBrandingText(id, text) {
    var el = byId(id);
    if (!el || text == null) return;
    var t = String(text).trim();
    if (t) el.textContent = t;
  }
  function setBrandingFavicon(url) {
    var v = url != null ? String(url).trim() : '';
    if (!v) return;
    var icon = document.querySelector('link[rel="icon"]');
    if (!icon) {
      icon = document.createElement('link');
      icon.setAttribute('rel', 'icon');
      document.head.appendChild(icon);
    }
    icon.setAttribute('href', v);
  }
  function applyBrandingToAdminDom(branding) {
    if (!branding || typeof branding !== 'object') return;
    var site = branding.site || {};
    var common = branding.common || {};
    var side = branding.adminSidebar || {};
    var sideMark = common.logoMark || side.logoMark;
    var sideTitle = common.brandTitle || side.logoTitle;
    var sideSub = common.brandSub || side.logoSub;
    if (site.title) document.title = String(site.title);
    setBrandingFavicon(site.faviconUrl);
    setBrandingText('adminSidebarLogoMark', sideMark);
    setBrandingText('adminSidebarLogoTitle', sideTitle);
    setBrandingText('adminSidebarLogoSub', sideSub);
  }

  function mount() {
    var host = byId('siteSettingsPanelMount');
    if (!host || host.dataset.mounted === '1') return;
    host.innerHTML = TEMPLATE;
    host.dataset.mounted = '1';
  }

  function populate(ss, adminUser) {
    var homeEnabled = byId('site_homepage_enabled');
    var en = byId('site_maint_enabled');
    var msg = byId('site_maint_message');
    if (homeEnabled) homeEnabled.checked = !(ss.homepage && ss.homepage.enabled === false);
    if (en) en.checked = !!(ss.maintenance && ss.maintenance.enabled);
    var fs = byId('site_maint_full_site');
    if (fs) fs.checked = !!(ss.maintenance && ss.maintenance.fullSite);
    if (msg) msg.value = (ss.maintenance && ss.maintenance.message) || '';
    var regSel = byId('site_registration_mode');
    if (regSel) {
      var mode = (ss.registration && ss.registration.mode) || 'invitation';
      if (mode !== 'open' && mode !== 'invitation') mode = 'invitation';
      regSel.value = mode;
      regSel.disabled = !(adminUser && adminUser.role === 'admin');
    }
    var embCard = byId('siteEmbedAiCard');
    if (embCard) embCard.classList.toggle('admin-hidden', !(adminUser && adminUser.role === 'admin'));
    var embTa = byId('site_embed_ai_chat');
    if (embTa && adminUser && adminUser.role === 'admin') embTa.value = (ss.embed && ss.embed.aiChatHtml) || '';
    var br = (ss && ss.branding) || {};
    var site = br.site || {};
    var common = br.common || {};
    var side = br.adminSidebar || {};
    var landing = br.landingNav || {};
    var siteTitle = byId('site_brand_site_title');
    if (siteTitle) siteTitle.value = site.title || '';
    var siteIcon = byId('site_brand_site_icon');
    if (siteIcon) siteIcon.value = site.faviconUrl || '/icons/icon.svg';
    var commonMark = byId('site_brand_common_mark');
    if (commonMark) commonMark.value = common.logoMark || side.logoMark || landing.logoText || '';
    var commonTitle = byId('site_brand_common_title');
    if (commonTitle) commonTitle.value = common.brandTitle || side.logoTitle || landing.brandTitle || '';
    var commonSub = byId('site_brand_common_sub');
    if (commonSub) commonSub.value = common.brandSub || side.logoSub || landing.brandSub || '';
    var commonVersion = byId('site_brand_common_version');
    if (commonVersion) commonVersion.value = common.versionText || landing.verBadge || '';
    applyBrandingToAdminDom(br);
  }

  function buildPayload(adminUser) {
    var payload = {
      homepage: { enabled: !(byId('site_homepage_enabled') && byId('site_homepage_enabled').checked === false) },
      maintenance: {
        enabled: !!(byId('site_maint_enabled') && byId('site_maint_enabled').checked),
        fullSite: !!(byId('site_maint_full_site') && byId('site_maint_full_site').checked),
        message: (byId('site_maint_message') && byId('site_maint_message').value) || '',
      },
      registration: {
        mode: byId('site_registration_mode') && byId('site_registration_mode').value === 'open' ? 'open' : 'invitation',
      },
      branding: {
        common: {
          logoMark: (byId('site_brand_common_mark') && byId('site_brand_common_mark').value) || '',
          brandTitle: (byId('site_brand_common_title') && byId('site_brand_common_title').value) || '',
          brandSub: (byId('site_brand_common_sub') && byId('site_brand_common_sub').value) || '',
          versionText: (byId('site_brand_common_version') && byId('site_brand_common_version').value) || '',
        },
        site: {
          title: (byId('site_brand_site_title') && byId('site_brand_site_title').value) || '',
          faviconUrl: (byId('site_brand_site_icon') && byId('site_brand_site_icon').value) || '/icons/icon.svg',
        },
        adminSidebar: {},
        adminNavbar: {},
        landingNav: {},
      },
    };
    if (adminUser && adminUser.role === 'admin') {
      payload.embed = { aiChatHtml: (byId('site_embed_ai_chat') && byId('site_embed_ai_chat').value) || '' };
    }
    return payload;
  }
  function getPublishSummary(fallbackText) {
    var v = (byId('sitePublishSummary') && byId('sitePublishSummary').value) || '';
    v = String(v).trim();
    return v || fallbackText || 'manual publish';
  }

  function renderReleases(list) {
    var host = byId('siteReleasesHost');
    if (!host) return;
    if (!list || !list.length) {
      host.innerHTML = '<p class="admin-sub" style="margin:8px 0 0">暂无发布记录</p>';
      return;
    }
    var html = '<div class="site-release-list">';
    list.forEach(function (r) {
      var who = r.createdByUsername || '-';
      var time = r.createdAt || '';
      html +=
        '<div class="site-release-item" role="button" tabindex="0" data-id="' +
        r.id +
        '">' +
        '<span class="v">v' +
        r.versionNo +
        '</span><span class="s">' +
        (r.summary || '未填写摘要') +
        '</span><span class="m">' +
        who +
        ' · ' +
        time +
        '</span><span class="site-release-actions"><button type="button" class="site-release-rollback" data-rollback-id="' +
        r.id +
        '" data-rollback-version="' +
        r.versionNo +
        '">回滚</button></span></div>';
    });
    html += '</div>';
    host.innerHTML = html;
    host.querySelectorAll('.site-release-item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        loadReleaseDetail(btn.getAttribute('data-id'));
      });
      btn.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          loadReleaseDetail(btn.getAttribute('data-id'));
        }
      });
    });
    host.querySelectorAll('.site-release-rollback').forEach(function (btn) {
      btn.addEventListener('click', async function (e) {
        e.preventDefault();
        e.stopPropagation();
        var id = btn.getAttribute('data-rollback-id');
        var v = btn.getAttribute('data-rollback-version');
        var ok = await askConfirm('确定回滚到版本 v' + v + '？', '回滚确认', '回滚', '取消');
        if (!ok) return;
        await rollbackToRelease(id, v);
      });
    });
  }
  async function refreshReleases() {
    if (!_deps) return;
    try {
      var d = await _deps.api('/api/admin/site-settings/releases?limit=20');
      renderReleases((d && d.releases) || []);
    } catch (e) {
      if (isNotFoundErr(e)) {
        renderReleases([]);
        setMsg('当前后端未启用发布历史接口（请重启服务后再试）', 'err');
        return;
      }
      setMsg(e.message || String(e), 'err');
    }
  }
  async function loadReleaseDetail(id) {
    if (!_deps) return;
    try {
      var d = await _deps.api('/api/admin/site-settings/releases/' + encodeURIComponent(String(id)));
      var panel = byId('siteReleaseDetail');
      if (panel) {
        panel.textContent =
          '版本: v' +
          d.versionNo +
          ' (#' +
          d.id +
          ')\n发布人: ' +
          (d.createdByUsername || '-') +
          '\n发布时间: ' +
          (d.createdAt || '-') +
          '\n风险项: ' +
          ((d.riskFlags || []).join(', ') || '无') +
          '\n摘要: ' +
          (d.summary || '未填写') +
          '\n\n' +
          JSON.stringify(d.content || {}, null, 2);
      }
    } catch (e) {
      setMsg(e.message || String(e), 'err');
    }
  }
  async function rollbackToRelease(id, versionNo) {
    if (!_deps) return;
    try {
      await _deps.api('/api/admin/site-settings/releases/' + encodeURIComponent(String(id)) + '/rollback', {
        method: 'POST',
        body: JSON.stringify({ summary: getPublishSummary('rollback to v' + versionNo), confirmRisk: true }),
      });
      setMsg('已回滚并生成新发布版本', 'ok');
      _deps.loadStats();
      await ensureLoaded({ force: true }, _deps);
    } catch (e) {
      setMsg(e.message || String(e), 'err');
    }
  }
  function bindActions(deps) {
    var btnDraft = byId('btnSiteSaveDraft');
    var btnValidate = byId('btnSiteValidate');
    var btnPublish = byId('btnSitePublish');
    var btnRefresh = byId('btnSiteRefreshReleases');
    if (btnDraft && !btnDraft.dataset.bound) {
      btnDraft.dataset.bound = '1';
      btnDraft.addEventListener('click', async function () {
        setMsg('');
        try {
          try {
            await deps.api('/api/admin/site-settings/draft', {
              method: 'PUT',
              body: JSON.stringify({ content: buildPayload(deps.getAdminUser()) }),
            });
            applyBrandingToAdminDom(buildPayload(deps.getAdminUser()).branding || {});
            setMsg('草稿已保存', 'ok');
          } catch (e0) {
            if (!isNotFoundErr(e0)) throw e0;
            await deps.api('/api/admin/site-settings', {
              method: 'PUT',
              body: JSON.stringify(buildPayload(deps.getAdminUser())),
            });
            applyBrandingToAdminDom(buildPayload(deps.getAdminUser()).branding || {});
            setMsg('后端未启用草稿接口，已直接保存生效', 'ok');
          }
        } catch (e) {
          setMsg(e.message || String(e), 'err');
        }
      });
    }
    if (btnValidate && !btnValidate.dataset.bound) {
      btnValidate.dataset.bound = '1';
      btnValidate.addEventListener('click', async function () {
        setMsg('');
        try {
          var d = await deps.api('/api/admin/site-settings/validate', {
            method: 'POST',
            body: JSON.stringify({ content: buildPayload(deps.getAdminUser()) }),
          });
          var tips = [];
          if (d.riskFlags && d.riskFlags.length) tips.push('风险项: ' + d.riskFlags.join(', '));
          if (d.warnings && d.warnings.length) tips = tips.concat(d.warnings);
          setMsg(tips.length ? '校验通过；' + tips.join('；') : '校验通过', 'ok');
        } catch (e) {
          if (isNotFoundErr(e)) {
            setMsg('后端未启用校验接口，请先重启服务后再试', 'err');
            return;
          }
          setMsg(e.message || String(e), 'err');
        }
      });
    }
    if (btnPublish && !btnPublish.dataset.bound) {
      btnPublish.dataset.bound = '1';
      btnPublish.addEventListener('click', async function () {
        setMsg('');
        try {
          try {
            await deps.api('/api/admin/site-settings/draft', {
              method: 'PUT',
              body: JSON.stringify({ content: buildPayload(deps.getAdminUser()) }),
            });
          } catch (e0) {
            if (!isNotFoundErr(e0)) throw e0;
            await deps.api('/api/admin/site-settings', {
              method: 'PUT',
              body: JSON.stringify(buildPayload(deps.getAdminUser())),
            });
            setMsg('后端未启用发布接口，已直接保存生效', 'ok');
            deps.loadStats();
            await ensureLoaded({ force: true }, deps);
            return;
          }
          var payload = { summary: getPublishSummary('manual publish'), confirmRisk: false };
          try {
            await deps.api('/api/admin/site-settings/publish', {
              method: 'POST',
              body: JSON.stringify(payload),
            });
          } catch (e1) {
            if ((e1.message || '').indexOf('高风险') >= 0) {
              var ok = await askConfirm('检测到高风险变更，是否继续发布？', '高风险发布', '继续发布', '取消');
              if (!ok) return;
              await deps.api('/api/admin/site-settings/publish', {
                method: 'POST',
                body: JSON.stringify({ summary: getPublishSummary('manual publish'), confirmRisk: true }),
              });
            } else {
              throw e1;
            }
          }
          setMsg('发布成功，已生效', 'ok');
          deps.loadStats();
          await ensureLoaded({ force: true }, deps);
        } catch (e) {
          setMsg(e.message || String(e), 'err');
        }
      });
    }
    if (btnRefresh && !btnRefresh.dataset.bound) {
      btnRefresh.dataset.bound = '1';
      btnRefresh.addEventListener('click', function () {
        refreshReleases();
      });
    }
  }

  async function ensureLoaded(opts, deps) {
    opts = opts || {};
    if (!deps || typeof deps.runAdminPanelLoader !== 'function') {
      throw new Error('站点设置模块依赖不完整：runAdminPanelLoader 缺失');
    }
    return deps
      .runAdminPanelLoader(
        'panel:site-settings',
        async function () {
          var caps = window.__adminCapabilities || { siteSettings: false };
          if (!caps.siteSettings) return;
          deps.setAdminLoaderMsg('siteSettingsMsg', '正在加载站点设置…');
          var d;
          try {
            var current = await deps.api('/api/admin/site-settings');
            d = safeJsonParse(
              JSON.stringify(await deps.api('/api/admin/site-settings/draft')),
              { content: {} }
            );
            populate(mergeForDisplay(current || {}, (d && d.content) || {}), deps.getAdminUser());
          } catch (e0) {
            if (!isNotFoundErr(e0)) throw e0;
            d = await deps.api('/api/admin/site-settings');
            populate(d || {}, deps.getAdminUser());
            setMsg('后端未启用草稿接口，当前为直接生效模式', 'err');
          }
          await refreshReleases();
          deps.setAdminLoaderMsg('siteSettingsMsg', '');
        },
        opts
      )
      .catch(function (err) {
        deps.setAdminLoaderMsg('siteSettingsMsg', err.message || String(err), 'err');
        throw err;
      });
  }

  function init(deps) {
    _deps = deps;
    mount();
    bindActions(deps);
  }

  window.AdminSiteSettings = {
    init: init,
    ensureLoaded: ensureLoaded,
  };
})();
