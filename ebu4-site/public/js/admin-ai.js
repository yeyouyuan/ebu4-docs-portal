(function () {
  var TEMPLATE = [
    '<div class="ai-page-shell">',
    '  <section class="ai-page-hero admin-card">',
    '    <div class="ai-page-title-wrap">',
    '      <div class="ai-page-icon" aria-hidden="true">',
    '        <svg viewBox="0 0 24 24" fill="none"><path d="M12 2l1.8 5.2L19 9l-4.2 3.1 1.6 5.1-4.4-3-4.4 3 1.6-5.1L5 9l5.2-1.8L12 2z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M5 19l1.1.3L6.5 21 7 19.3l1-.3-1-.3-.5-1.7-.4 1.7L5 19zm12-11l.8.2.2.8.2-.8.8-.2-.8-.2-.2-.8-.2.8-.8.2z" fill="currentColor"/></svg>',
    '      </div>',
    '      <div class="ai-page-title-copy">',
    '        <h1 class="ai-page-title">AI 接入</h1>',
    '        <p class="ai-page-desc">配置 AI 能力、公共助手与个人周报助手，统一管理 AI 服务接入与使用策略。</p>',
    '      </div>',
    '    </div>',
    '  </section>',
    '',
    '  <div class="ai-layout-grid ai-layout-grid--hero">',
    '    <section class="admin-card ai-card ai-card--base">',
    '      <div class="ai-card-head">',
    '        <div class="ai-card-head-icon ai-card-head-icon--base" aria-hidden="true">',
    '          <svg viewBox="0 0 24 24" fill="none"><path d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M9.5 13h5m-5 3h5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    '        </div>',
    '        <div>',
    '          <div class="ai-card-title">AI 基础配置</div>',
    '          <p class="ai-card-desc">管理整体 AI 服务接入能力与默认 Provider。</p>',
    '        </div>',
    '      </div>',
    '      <div class="ai-stack-panel">',
    '        <label class="ai-switch-item" for="ai_enabled">',
    '          <span class="ai-switch-item-main">',
    '            <span class="ai-switch-item-icon ai-switch-item-icon--blue" aria-hidden="true">',
    '              <svg viewBox="0 0 24 24" fill="none"><path d="M12 3l1.5 4.5L18 9l-3.5 2.5L15.8 16 12 13.7 8.2 16l1.3-4.5L6 9l4.5-1.5L12 3z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    '            </span>',
    '            <span class="ai-switch-item-copy">',
    '              <span class="ai-switch-item-title">启用整体 AI 能力</span>',
    '              <span class="ai-switch-item-desc">开启后，系统将根据配置使用 AI 能力提供相关服务。</span>',
    '            </span>',
    '          </span>',
    '          <span class="ai-switch-control admin-switch-row">',
    '            <input type="checkbox" id="ai_enabled" />',
    '            <span class="admin-switch-ui" aria-hidden="true"></span>',
    '          </span>',
    '        </label>',
    '        <div class="ai-divider"></div>',
    '        <label class="admin-field admin-field-full ai-field-block">',
    '          <span class="admin-field-label">默认 Provider</span>',
    '          <select id="ai_default_provider" class="admin-input"></select>',
    '        </label>',
    '      </div>',
    '    </section>',
    '',
    '    <aside class="admin-card ai-card ai-card--note">',
    '      <div class="ai-card-head">',
    '        <div class="ai-card-head-icon ai-card-head-icon--note" aria-hidden="true">',
    '          <svg viewBox="0 0 24 24" fill="none"><path d="M12 4v9m0 4h.01M4 12a8 8 0 1 1 16 0 8 8 0 0 1-16 0z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    '        </div>',
    '        <div>',
    '          <div class="ai-card-title">配置说明</div>',
    '          <p class="ai-card-desc">建议先完成默认 Provider 与开关设置，再逐步配置前台助手和周报助手。</p>',
    '        </div>',
    '      </div>',
    '      <ul class="ai-note-list">',
    '        <li>系统提供三层 AI 控制：整体开关、公共助手、个人周报助手。</li>',
    '        <li>默认 Provider 将作为未指定时的兜底服务。</li>',
    '        <li>API Key 在后台读取时会自动脱敏，留空保存不会覆盖现有 Key。</li>',
    '      </ul>',
    '    </aside>',
    '  </div>',
    '',
    '  <div class="ai-layout-grid ai-layout-grid--assistants">',
    '    <section class="admin-card ai-card ai-card--assistant">',
    '      <div class="ai-card-head">',
    '        <div class="ai-card-head-icon ai-card-head-icon--assistant" aria-hidden="true">',
    '          <svg viewBox="0 0 24 24" fill="none"><path d="M12 3a4 4 0 0 1 4 4v1.3a5 5 0 0 1 2.5 4.3A5.4 5.4 0 0 1 13 18h-2a5.4 5.4 0 0 1-5.5-5.4A5 5 0 0 1 8 8.3V7a4 4 0 0 1 4-4z" stroke="currentColor" stroke-width="1.7"/><path d="M9.5 12h.01M14.5 12h.01M9.5 21h5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    '        </div>',
    '        <div>',
    '          <div class="ai-card-title">前台公共助手</div>',
    '          <p class="ai-card-desc">作用于门户首页、文档站和扩展页，默认匿名可用，可选择联网搜索和来源展示。</p>',
    '        </div>',
    '      </div>',
    '      <div class="ai-stack-panel">',
    '        <label class="ai-switch-item" for="ai_public_enabled">',
    '          <span class="ai-switch-item-main">',
    '            <span class="ai-switch-item-icon ai-switch-item-icon--blue" aria-hidden="true">',
    '              <svg viewBox="0 0 24 24" fill="none"><path d="M12 4v4m0 8v4M4 12h4m8 0h4M7.8 7.8l2.8 2.8m2.8 2.8 2.8 2.8m0-8.4-2.8 2.8m-2.8 2.8-2.8 2.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    '            </span>',
    '            <span class="ai-switch-item-copy">',
    '              <span class="ai-switch-item-title">启用前台公共助手</span>',
    '              <span class="ai-switch-item-desc">开启后，前台将展示 AI 助手入口。</span>',
    '            </span>',
    '          </span>',
    '          <span class="ai-switch-control admin-switch-row"><input type="checkbox" id="ai_public_enabled" /><span class="admin-switch-ui" aria-hidden="true"></span></span>',
    '        </label>',
    '        <label class="ai-switch-item" for="ai_public_require_login">',
    '          <span class="ai-switch-item-main">',
    '            <span class="ai-switch-item-icon ai-switch-item-icon--amber" aria-hidden="true">',
    '              <svg viewBox="0 0 24 24" fill="none"><path d="M8 11V8a4 4 0 1 1 8 0v3M7 11h10a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    '            </span>',
    '            <span class="ai-switch-item-copy">',
    '              <span class="ai-switch-item-title">仅登录后可用</span>',
    '              <span class="ai-switch-item-desc">仅登录用户可使用前台助手。</span>',
    '            </span>',
    '          </span>',
    '          <span class="ai-switch-control admin-switch-row"><input type="checkbox" id="ai_public_require_login" /><span class="admin-switch-ui" aria-hidden="true"></span></span>',
    '        </label>',
    '        <label class="ai-switch-item" for="ai_public_show_sources">',
    '          <span class="ai-switch-item-main">',
    '            <span class="ai-switch-item-icon ai-switch-item-icon--green" aria-hidden="true">',
    '              <svg viewBox="0 0 24 24" fill="none"><path d="M7 12.5 10 15l7-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 3a9 9 0 1 0 9 9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    '            </span>',
    '            <span class="ai-switch-item-copy">',
    '              <span class="ai-switch-item-title">默认展示来源引用</span>',
    '              <span class="ai-switch-item-desc">在回答中展示来源链接与引用摘要。</span>',
    '            </span>',
    '          </span>',
    '          <span class="ai-switch-control admin-switch-row"><input type="checkbox" id="ai_public_show_sources" /><span class="admin-switch-ui" aria-hidden="true"></span></span>',
    '        </label>',
    '        <label class="ai-switch-item" for="ai_public_allow_web_search">',
    '          <span class="ai-switch-item-main">',
    '            <span class="ai-switch-item-icon ai-switch-item-icon--violet" aria-hidden="true">',
    '              <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.7"/><path d="M4 12h16M12 4a14 14 0 0 0 0 16" stroke="currentColor" stroke-width="1.7"/></svg>',
    '            </span>',
    '            <span class="ai-switch-item-copy">',
    '              <span class="ai-switch-item-title">允许用户勾选联网搜索</span>',
    '              <span class="ai-switch-item-desc">允许用户主动选择是否启用联网搜索。</span>',
    '            </span>',
    '          </span>',
    '          <span class="ai-switch-control admin-switch-row"><input type="checkbox" id="ai_public_allow_web_search" /><span class="admin-switch-ui" aria-hidden="true"></span></span>',
    '        </label>',
    '      </div>',
    '    </section>',
    '',
    '    <section class="admin-card ai-card ai-card--assistant">',
    '      <div class="ai-card-head">',
    '        <div class="ai-card-head-icon ai-card-head-icon--weekly" aria-hidden="true">',
    '          <svg viewBox="0 0 24 24" fill="none"><path d="M12 3a4 4 0 0 1 4 4v1.2a5.2 5.2 0 0 1 2.8 4.5A5.3 5.3 0 0 1 13.5 18h-3A5.3 5.3 0 0 1 5.2 12.7 5.2 5.2 0 0 1 8 8.2V7a4 4 0 0 1 4-4z" stroke="currentColor" stroke-width="1.7"/><path d="M9 11.5h6M9 15h3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    '        </div>',
    '        <div>',
    '          <div class="ai-card-title">个人周报助手</div>',
    '          <p class="ai-card-desc">在日报抓取与个人周报助手页中，先做结构化清洗，再由指定模型进行成文润色。</p>',
    '        </div>',
    '      </div>',
    '      <div class="ai-stack-panel ai-stack-panel--compact">',
    '        <label class="ai-switch-item" for="ai_weekly_use_ai">',
    '          <span class="ai-switch-item-main">',
    '            <span class="ai-switch-item-icon ai-switch-item-icon--blue" aria-hidden="true">',
    '              <svg viewBox="0 0 24 24" fill="none"><path d="M12 4v8m0 0 3-3m-3 3-3-3M6 18h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    '            </span>',
    '            <span class="ai-switch-item-copy">',
    '              <span class="ai-switch-item-title">启用 AI 成文</span>',
    '              <span class="ai-switch-item-desc">开启后，系统将使用 AI 生成个人周报内容。</span>',
    '            </span>',
    '          </span>',
    '          <span class="ai-switch-control admin-switch-row"><input type="checkbox" id="ai_weekly_use_ai" /><span class="admin-switch-ui" aria-hidden="true"></span></span>',
    '        </label>',
    '        <div class="ai-inline-grid">',
    '          <label class="admin-field">',
    '            <span class="admin-field-label">周报 Provider</span>',
    '            <select id="ai_weekly_provider" class="admin-input"></select>',
    '          </label>',
    '          <label class="admin-field">',
    '            <span class="admin-field-label">周报 Model（可选）</span>',
    '            <input type="text" id="ai_weekly_model" class="admin-input" autocomplete="off" placeholder="留空则使用该 Provider 默认模型" />',
    '          </label>',
    '        </div>',
    '      </div>',
    '    </section>',
    '  </div>',
    '',
    '  <section class="admin-card ai-card ai-card--search">',
    '    <div class="ai-card-head">',
    '      <div class="ai-card-head-icon ai-card-head-icon--search" aria-hidden="true">',
    '        <svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.7"/><path d="m16 16 4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    '      </div>',
    '      <div>',
    '        <div class="ai-card-title">联网搜索</div>',
    '        <p class="ai-card-desc">第一阶段默认接入 SearXNG 兼容搜索实例，前台只有在用户勾选时才会走外部搜索。</p>',
    '      </div>',
    '    </div>',
    '    <div class="ai-search-grid">',
    '      <div class="ai-search-form">',
    '        <label class="ai-switch-item ai-switch-item--flat" for="ai_web_enabled">',
    '          <span class="ai-switch-item-main">',
    '            <span class="ai-switch-item-icon ai-switch-item-icon--blue" aria-hidden="true">',
    '              <svg viewBox="0 0 24 24" fill="none"><path d="M4 12h16M12 4a14 14 0 0 0 0 16" stroke="currentColor" stroke-width="1.7"/></svg>',
    '            </span>',
    '            <span class="ai-switch-item-copy">',
    '              <span class="ai-switch-item-title">启用联网搜索</span>',
    '              <span class="ai-switch-item-desc">允许前台助手在用户勾选时走外部搜索。</span>',
    '            </span>',
    '          </span>',
    '          <span class="ai-switch-control admin-switch-row"><input type="checkbox" id="ai_web_enabled" /><span class="admin-switch-ui" aria-hidden="true"></span></span>',
    '        </label>',
    '        <div class="ai-inline-grid ai-inline-grid--search">',
    '          <label class="admin-field">',
    '            <span class="admin-field-label">搜索提供方</span>',
    '            <input type="text" id="ai_web_provider" class="admin-input" value="searxng" readonly />',
    '          </label>',
    '          <label class="admin-field">',
    '            <span class="admin-field-label">安全搜索</span>',
    '            <select id="ai_web_safe_search" class="admin-input"><option value="moderate">moderate</option><option value="strict">strict</option><option value="off">off</option></select>',
    '          </label>',
    '          <label class="admin-field admin-field-full">',
    '            <span class="admin-field-label">SearXNG Base URL</span>',
    '            <input type="text" id="ai_web_base_url" class="admin-input" autocomplete="off" placeholder="例如：https://search.example.com" />',
    '          </label>',
    '          <label class="admin-field">',
    '            <span class="admin-field-label">搜索 API Key（可选）</span>',
    '            <input type="password" id="ai_web_api_key" class="admin-input" autocomplete="off" placeholder="留空则不带 apikey 参数" />',
    '          </label>',
    '          <label class="admin-field">',
    '            <span class="admin-field-label">最大结果数</span>',
    '            <input type="number" id="ai_web_max_results" class="admin-input" min="1" max="10" value="5" />',
    '          </label>',
    '          <div class="ai-configured-flag" id="ai_web_api_key_flag"></div>',
    '        </div>',
    '      </div>',
    '      <div class="ai-search-visual" aria-hidden="true">',
    '        <div class="ai-search-orb ai-search-orb--one"></div>',
    '        <div class="ai-search-orb ai-search-orb--two"></div>',
    '        <div class="ai-search-chip ai-search-chip--main">AI</div>',
    '        <div class="ai-search-chip ai-search-chip--small">Web</div>',
    '        <div class="ai-search-line ai-search-line--one"></div>',
    '        <div class="ai-search-line ai-search-line--two"></div>',
    '      </div>',
    '    </div>',
    '  </section>',
    '',
    '  <div class="ai-layout-grid ai-layout-grid--bottom">',
    '    <section class="admin-card ai-card ai-card--providers">',
    '      <div class="ai-card-head">',
    '        <div class="ai-card-head-icon ai-card-head-icon--provider" aria-hidden="true">',
    '          <svg viewBox="0 0 24 24" fill="none"><path d="M8 6h8M8 12h8M8 18h8M4 6h.01M4 12h.01M4 18h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    '        </div>',
    '        <div>',
    '          <div class="ai-card-title">Provider 列表</div>',
    '          <p class="ai-card-desc">默认仅展示当前 Provider，需要接入更多厂商时手动新增。API Key 留空保存不会覆盖现有 Key。</p>',
    '        </div>',
    '      </div>',
    '      <div id="aiProviderList" class="ai-provider-list"></div>',
    '    </section>',
    '',
    '    <section class="admin-card ai-card ai-card--test">',
    '      <div class="ai-card-head">',
    '        <div class="ai-card-head-icon ai-card-head-icon--test" aria-hidden="true">',
    '          <svg viewBox="0 0 24 24" fill="none"><path d="M12 5v6l4 2m3-1a7 7 0 1 1-14 0 7 7 0 0 1 14 0z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    '        </div>',
    '        <div>',
    '          <div class="ai-card-title">连通性测试</div>',
    '          <p class="ai-card-desc">用于验证当前 Provider 的 API Key、Base URL 和模型是否可用。</p>',
    '        </div>',
    '      </div>',
    '      <div class="admin-form-grid ai-test-grid">',
    '        <label class="admin-field"><span class="admin-field-label">测试 Provider</span><select id="ai_test_provider" class="admin-input"></select></label>',
    '        <label class="admin-field"><span class="admin-field-label">测试 Model（可选）</span><input type="text" id="ai_test_model" class="admin-input" autocomplete="off" placeholder="留空则使用默认模型" /></label>',
    '        <label class="admin-field admin-field-full"><span class="admin-field-label">测试 Prompt</span><textarea id="ai_test_prompt" class="admin-input" rows="4" spellcheck="true">请回复：AI 测试成功</textarea></label>',
    '      </div>',
    '      <div class="ai-actions-row">',
    '        <button type="button" class="admin-btn-primary" id="btnAiSaveSettings">保存 AI 配置</button>',
    '        <button type="button" class="admin-btn-ghost" id="btnAiTestProvider">运行测试</button>',
    '      </div>',
    '      <span class="admin-msg" id="aiSettingsMsg"></span>',
    '      <pre id="aiTestResult" class="ai-test-result">尚未运行测试</pre>',
    '    </section>',
    '  </div>',
    '</div>',
  ].join('');

  var PROVIDER_ORDER = ['openai', 'anthropic', 'gemini', 'openrouter', 'deepseek', 'qwen', 'moonshot', 'zhipu', 'doubao', 'xai'];
  var state = { settings: null, visibleProviderIds: [] };
  var _deps = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function setMsg(text, cls) {
    var el = byId('aiSettingsMsg');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'admin-msg' + (cls ? ' ' + cls : '');
  }

  function providerLabel(row, fallback) {
    return (row && row.label) || fallback || '';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function uniqProviderIds(ids) {
    var seen = {};
    return (Array.isArray(ids) ? ids : [])
      .map(function (id) {
        return String(id || '').trim();
      })
      .filter(function (id) {
        if (!id || !PROVIDER_ORDER.includes(id) || seen[id]) return false;
        seen[id] = true;
        return true;
      });
  }

  function getInitialVisibleProviderIds(settings) {
    var providers = (settings && settings.providers) || {};
    var ids = [];
    function add(id) {
      if (id && PROVIDER_ORDER.includes(id) && !ids.includes(id)) ids.push(id);
    }
    add((settings && settings.defaultProvider) || 'openai');
    var weeklyProvider = settings && settings.weeklyReport && settings.weeklyReport.provider;
    add(weeklyProvider);
    PROVIDER_ORDER.forEach(function (id) {
      var row = providers[id] || {};
      if (row.enabled) add(id);
    });
    if (!ids.length) ids.push('openai');
    return ids;
  }

  function getVisibleProviderIds(settings) {
    var ids = uniqProviderIds(state.visibleProviderIds);
    if (!ids.length) ids = getInitialVisibleProviderIds(settings);
    state.visibleProviderIds = ids;
    return ids;
  }

  function ensureMount() {
    var host = byId('aiSettingsPanelMount');
    if (!host || host.dataset.mounted === '1') return;
    host.innerHTML = TEMPLATE;
    host.dataset.mounted = '1';
  }

  function makeProviderOptionHtml(settings, selectedValue, emptyLabel, ids) {
    var providers = (settings && settings.providers) || {};
    var html = emptyLabel ? '<option value="">' + emptyLabel + '</option>' : '';
    (ids && ids.length ? ids : PROVIDER_ORDER).forEach(function (id) {
      var row = providers[id] || {};
      html +=
        '<option value="' +
        id +
        '"' +
        (selectedValue === id ? ' selected' : '') +
        '>' +
        escapeHtml(providerLabel(row, id)) +
        '</option>';
    });
    return html;
  }

  function refreshProviderSelects(settings) {
    var ids = getVisibleProviderIds(settings);
    var defaultProvider = (settings && settings.defaultProvider) || ids[0] || 'openai';
    if (!ids.includes(defaultProvider)) defaultProvider = ids[0] || 'openai';
    if (byId('ai_default_provider')) {
      byId('ai_default_provider').innerHTML = makeProviderOptionHtml(settings, defaultProvider, '', ids);
    }
    var wr = (settings && settings.weeklyReport) || {};
    if (byId('ai_weekly_provider')) {
      byId('ai_weekly_provider').innerHTML = makeProviderOptionHtml(settings, wr.provider || '', '跟随默认 Provider', ids);
    }
    if (byId('ai_test_provider')) {
      byId('ai_test_provider').innerHTML = makeProviderOptionHtml(settings, defaultProvider, '', ids);
    }
  }

  function providerTypeOptions(row) {
    return (
      '<option value="openai"' + (row.type === 'openai' ? ' selected' : '') + '>openai</option>' +
      '<option value="openai_compat"' + (row.type === 'openai_compat' ? ' selected' : '') + '>openai_compat</option>' +
      '<option value="anthropic"' + (row.type === 'anthropic' ? ' selected' : '') + '>anthropic</option>' +
      '<option value="gemini"' + (row.type === 'gemini' ? ' selected' : '') + '>gemini</option>'
    );
  }

  function renderProviderCard(settings, id, canRemove) {
    var providers = (settings && settings.providers) || {};
    var row = providers[id] || {};
    return (
      '<section class="ai-provider-card" data-ai-provider-card="' +
      id +
      '">' +
      '<div class="ai-provider-card-head">' +
      '<div class="ai-provider-title-block"><strong>' +
      escapeHtml(providerLabel(row, id)) +
      '</strong><div class="admin-tools-hint">' +
      escapeHtml(row.type || 'openai_compat') +
      '</div></div>' +
      '<div class="ai-provider-head-actions">' +
      '<label class="admin-field admin-checkbox-row"><input type="checkbox" data-ai-provider-enabled="' +
      id +
      '"' +
      (row.enabled ? ' checked' : '') +
      ' /> <span class="admin-field-label" style="display:inline">启用</span></label>' +
      (canRemove ? '<button type="button" class="admin-btn-ghost ai-provider-remove" data-ai-provider-remove="' + id + '">移除</button>' : '') +
      '</div>' +
      '</div>' +
      '<div class="admin-form-grid">' +
      '<label class="admin-field"><span class="admin-field-label">显示名称</span><input type="text" class="admin-input" data-ai-provider-label="' +
      id +
      '" value="' +
      escapeHtml(row.label || '') +
      '" /></label>' +
      '<label class="admin-field"><span class="admin-field-label">类型</span><select class="admin-input" data-ai-provider-type="' +
      id +
      '">' +
      providerTypeOptions(row) +
      '</select></label>' +
      '<label class="admin-field admin-field-full"><span class="admin-field-label">Base URL</span><input type="text" class="admin-input" data-ai-provider-base="' +
      id +
      '" value="' +
      escapeHtml(row.baseUrl || '') +
      '" placeholder="API 根地址；OpenAI 兼容地址可不带 /v1" /></label>' +
      '<label class="admin-field"><span class="admin-field-label">默认 Model</span><input type="text" class="admin-input" data-ai-provider-model="' +
      id +
      '" value="' +
      escapeHtml(row.model || '') +
      '" /></label>' +
      '<label class="admin-field"><span class="admin-field-label">API Key</span><input type="password" class="admin-input" data-ai-provider-key="' +
      id +
      '" value="" placeholder="' +
      (row.apiKeyConfigured ? '已配置，留空保持不变' : '未配置') +
      '" /></label>' +
      '</div>' +
      '</section>'
    );
  }

  function bindProviderListActions(settings) {
    var addBtn = byId('btnAiAddProvider');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        var sel = byId('aiProviderAddSelect');
        var id = sel && sel.value;
        if (!id) return;
        state.visibleProviderIds = uniqProviderIds(getVisibleProviderIds(settings).concat(id));
        renderProviderCards(settings);
        refreshProviderSelects(settings);
      });
    }
    document.querySelectorAll('[data-ai-provider-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-ai-provider-remove');
        var currentDefault = (byId('ai_default_provider') && byId('ai_default_provider').value) || (settings && settings.defaultProvider) || 'openai';
        if (id === currentDefault) return;
        state.visibleProviderIds = getVisibleProviderIds(settings).filter(function (item) {
          return item !== id;
        });
        renderProviderCards(settings);
        refreshProviderSelects(settings);
      });
    });
  }

  function renderProviderCards(settings) {
    var host = byId('aiProviderList');
    if (!host) return;
    var providers = (settings && settings.providers) || {};
    var ids = getVisibleProviderIds(settings);
    var addable = PROVIDER_ORDER.filter(function (id) {
      return !ids.includes(id);
    });
    var addOptions = addable
      .map(function (id) {
        return '<option value="' + id + '">' + escapeHtml(providerLabel(providers[id] || {}, id)) + '</option>';
      })
      .join('');
    host.innerHTML =
      '<div class="ai-provider-toolbar">' +
      '<div class="ai-provider-toolbar-copy"><strong>当前 Provider</strong><span>只保留需要维护的接入项。</span></div>' +
      '<div class="ai-provider-add">' +
      '<select id="aiProviderAddSelect" class="admin-input"' +
      (addable.length ? '' : ' disabled') +
      '>' +
      (addOptions || '<option value="">暂无可新增项</option>') +
      '</select>' +
      '<button type="button" class="admin-btn-ghost" id="btnAiAddProvider"' +
      (addable.length ? '' : ' disabled') +
      '>新增 Provider</button>' +
      '</div>' +
      '</div>' +
      '<div class="ai-provider-card-list">' +
      ids
        .map(function (id) {
          var currentDefault = (settings && settings.defaultProvider) || 'openai';
          return renderProviderCard(settings, id, ids.length > 1 && id !== currentDefault);
        })
        .join('') +
      '</div>';
    bindProviderListActions(settings);
  }

  function populate(settings) {
    state.settings = settings || {};
    var s = state.settings;
    if (byId('ai_enabled')) byId('ai_enabled').checked = !!s.enabled;
    state.visibleProviderIds = uniqProviderIds(getInitialVisibleProviderIds(s).concat(state.visibleProviderIds || []));
    refreshProviderSelects(s);
    var pa = s.publicAssistant || {};
    if (byId('ai_public_enabled')) byId('ai_public_enabled').checked = !!pa.enabled;
    if (byId('ai_public_require_login')) byId('ai_public_require_login').checked = !!pa.requireLogin;
    if (byId('ai_public_show_sources')) byId('ai_public_show_sources').checked = pa.showSources !== false;
    if (byId('ai_public_allow_web_search')) byId('ai_public_allow_web_search').checked = pa.allowWebSearch !== false;

    var wr = s.weeklyReport || {};
    if (byId('ai_weekly_use_ai')) byId('ai_weekly_use_ai').checked = wr.useAi !== false;
    if (byId('ai_weekly_model')) byId('ai_weekly_model').value = wr.model || '';

    var ws = s.webSearch || {};
    if (byId('ai_web_enabled')) byId('ai_web_enabled').checked = !!ws.enabled;
    if (byId('ai_web_base_url')) byId('ai_web_base_url').value = ws.baseUrl || '';
    if (byId('ai_web_api_key')) byId('ai_web_api_key').value = '';
    if (byId('ai_web_max_results')) byId('ai_web_max_results').value = String(ws.maxResults || 5);
    if (byId('ai_web_safe_search')) byId('ai_web_safe_search').value = ws.safeSearch || 'moderate';
    if (byId('ai_web_api_key_flag')) {
      byId('ai_web_api_key_flag').textContent = s.webSearchApiKeyConfigured ? '搜索 API Key 已配置' : '搜索 API Key 未配置';
    }

    renderProviderCards(s);
    refreshProviderSelects(s);
  }

  function collectProviders() {
    var out = {};
    PROVIDER_ORDER.forEach(function (id) {
      var existing = state.settings && state.settings.providers && state.settings.providers[id] ? state.settings.providers[id] : {};
      var enabledInput = document.querySelector('[data-ai-provider-enabled="' + id + '"]');
      var labelInput = document.querySelector('[data-ai-provider-label="' + id + '"]');
      var typeInput = document.querySelector('[data-ai-provider-type="' + id + '"]');
      var baseInput = document.querySelector('[data-ai-provider-base="' + id + '"]');
      var modelInput = document.querySelector('[data-ai-provider-model="' + id + '"]');
      var keyInput = document.querySelector('[data-ai-provider-key="' + id + '"]');
      out[id] = {
        enabled: enabledInput ? !!enabledInput.checked : !!existing.enabled,
        label: labelInput ? labelInput.value : existing.label || '',
        type: typeInput ? typeInput.value : existing.type || 'openai_compat',
        baseUrl: baseInput ? baseInput.value : existing.baseUrl || '',
        model: modelInput ? modelInput.value : existing.model || '',
        apiKey: keyInput ? keyInput.value : '',
      };
    });
    return out;
  }

  function buildPayload() {
    return {
      enabled: !!(byId('ai_enabled') && byId('ai_enabled').checked),
      defaultProvider: (byId('ai_default_provider') && byId('ai_default_provider').value) || 'openai',
      publicAssistant: {
        enabled: !!(byId('ai_public_enabled') && byId('ai_public_enabled').checked),
        requireLogin: !!(byId('ai_public_require_login') && byId('ai_public_require_login').checked),
        showSources: !!(byId('ai_public_show_sources') && byId('ai_public_show_sources').checked),
        allowWebSearch: !!(byId('ai_public_allow_web_search') && byId('ai_public_allow_web_search').checked),
      },
      weeklyReport: {
        useAi: !!(byId('ai_weekly_use_ai') && byId('ai_weekly_use_ai').checked),
        provider: (byId('ai_weekly_provider') && byId('ai_weekly_provider').value) || '',
        model: (byId('ai_weekly_model') && byId('ai_weekly_model').value) || '',
      },
      webSearch: {
        enabled: !!(byId('ai_web_enabled') && byId('ai_web_enabled').checked),
        provider: 'searxng',
        baseUrl: (byId('ai_web_base_url') && byId('ai_web_base_url').value) || '',
        apiKey: (byId('ai_web_api_key') && byId('ai_web_api_key').value) || '',
        maxResults: (byId('ai_web_max_results') && byId('ai_web_max_results').value) || '5',
        safeSearch: (byId('ai_web_safe_search') && byId('ai_web_safe_search').value) || 'moderate',
      },
      providers: collectProviders(),
    };
  }

  async function saveSettings() {
    var saveBtn = byId('btnAiSaveSettings');
    if (saveBtn) saveBtn.disabled = true;
    setMsg('保存中…', '');
    try {
      await _deps.api('/api/admin/ai/settings', {
        method: 'PUT',
        body: JSON.stringify(buildPayload()),
      });
      setMsg('AI 配置已保存', 'ok');
      await ensureLoaded({ force: true }, _deps);
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  async function runTest() {
    var testBtn = byId('btnAiTestProvider');
    var resultEl = byId('aiTestResult');
    if (testBtn) testBtn.disabled = true;
    if (resultEl) resultEl.textContent = '测试中…';
    setMsg('', '');
    try {
      var data = await _deps.api('/api/admin/ai/test', {
        method: 'POST',
        body: JSON.stringify({
          providerId: (byId('ai_test_provider') && byId('ai_test_provider').value) || '',
          model: (byId('ai_test_model') && byId('ai_test_model').value) || '',
          prompt: (byId('ai_test_prompt') && byId('ai_test_prompt').value) || '',
        }),
      });
      if (resultEl) {
        resultEl.textContent =
          'Provider: ' +
          ((data && data.result && data.result.providerLabel) || '') +
          '\nModel: ' +
          ((data && data.result && data.result.model) || '') +
          '\n\n' +
          ((data && data.result && data.result.text) || '');
      }
      setMsg('测试成功', 'ok');
    } catch (err) {
      if (resultEl) resultEl.textContent = err.message || String(err);
      setMsg(err.message || String(err), 'err');
    } finally {
      if (testBtn) testBtn.disabled = false;
    }
  }

  function bindActions() {
    var saveBtn = byId('btnAiSaveSettings');
    if (saveBtn && !saveBtn.dataset.bound) {
      saveBtn.dataset.bound = '1';
      saveBtn.addEventListener('click', function () {
        saveSettings().catch(function (err) {
          setMsg(err.message || String(err), 'err');
        });
      });
    }
    var testBtn = byId('btnAiTestProvider');
    if (testBtn && !testBtn.dataset.bound) {
      testBtn.dataset.bound = '1';
      testBtn.addEventListener('click', function () {
        runTest();
      });
    }
  }

  async function ensureLoaded(opts, deps) {
    opts = opts || {};
    return deps
      .runAdminPanelLoader(
        'panel:ai-settings',
        async function () {
          deps.setAdminLoaderMsg('aiSettingsMsg', '正在加载 AI 配置…');
          var current = await deps.api('/api/admin/ai/settings');
          populate(current || {});
          bindActions();
          deps.setAdminLoaderMsg('aiSettingsMsg', '');
        },
        opts
      )
      .catch(function (err) {
        deps.setAdminLoaderMsg('aiSettingsMsg', err.message || String(err), 'err');
        throw err;
      });
  }

  function init(deps) {
    _deps = deps;
    ensureMount();
    bindActions();
  }

  window.AdminAi = {
    init: init,
    ensureLoaded: ensureLoaded,
  };
})();
