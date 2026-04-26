(function () {
  var storageKey = 'ebu4-site-ai-open';
  var state = {
    enabled: false,
    showSources: true,
    allowWebSearch: false,
    requireLogin: false,
    canUseNow: true,
    open: false,
    busy: false,
    messages: [],
  };

  function qs(sel) {
    return document.querySelector(sel);
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function currentDocSlug() {
    var params = new URLSearchParams(location.search);
    return params.get('doc') || '';
  }

  function currentPageSlug() {
    var m = location.pathname.match(/^\/page\/([^/]+)\/?$/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function extractPageText() {
    var candidates = [
      '#contentArea',
      '.extra-doc-article',
      '.slide.active .slide-inner',
      '.slide-inner',
      'main',
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      var el = qs(candidates[i]);
      if (el && el.textContent && el.textContent.trim()) {
        return String(el.textContent).replace(/\s+/g, ' ').trim().slice(0, 3000);
      }
    }
    return String(document.body && document.body.textContent ? document.body.textContent : '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 3000);
  }

  function pageContext() {
    return {
      pageTitle: document.title || '',
      currentDocSlug: currentDocSlug(),
      currentPageSlug: currentPageSlug(),
      pageText: extractPageText(),
    };
  }

  function ensureUi() {
    if (document.getElementById('siteAiAssistantRoot')) return;
    var root = document.createElement('div');
    root.id = 'siteAiAssistantRoot';
    root.innerHTML =
      '<button type="button" id="siteAiFab" class="site-ai-fab" aria-label="打开 AI 助手">AI</button>' +
      '<section id="siteAiPanel" class="site-ai-panel" hidden>' +
      '<div class="site-ai-head">' +
      '<strong>整站 AI 助手</strong>' +
      '<button type="button" id="siteAiClose" class="site-ai-close" aria-label="关闭">×</button>' +
      '</div>' +
      '<div id="siteAiMessages" class="site-ai-messages"><div class="site-ai-empty">可以提问当前页面、文档内容或站内知识问题。</div></div>' +
      '<label class="site-ai-web-search"><input type="checkbox" id="siteAiWebSearch" /> <span>允许联网搜索</span></label>' +
      '<div class="site-ai-compose">' +
      '<textarea id="siteAiInput" rows="3" placeholder="例如：这页的核心内容是什么？"></textarea>' +
      '<button type="button" id="siteAiSend">发送</button>' +
      '</div>' +
      '<div id="siteAiStatus" class="site-ai-status"></div>' +
      '</section>';
    document.body.appendChild(root);
    qs('#siteAiFab').addEventListener('click', function () {
      state.open = true;
      saveOpenState();
      renderOpenState();
    });
    qs('#siteAiClose').addEventListener('click', function () {
      state.open = false;
      saveOpenState();
      renderOpenState();
    });
    qs('#siteAiSend').addEventListener('click', function () {
      sendQuestion();
    });
    qs('#siteAiInput').addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        sendQuestion();
      }
    });
  }

  function removeLegacyEmbedWidgets() {
    var selector = [
      'script[src*="fnos.jiansmart.com"]',
      'script[src*="/chat/api/embed"]',
      'iframe[src*="fnos.jiansmart.com"]',
      'iframe[src*="/chat/api/embed"]',
    ].join(',');
    document.querySelectorAll(selector).forEach(function (el) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
  }

  function saveOpenState() {
    try {
      localStorage.setItem(storageKey, state.open ? '1' : '0');
    } catch (_) {}
  }

  function restoreOpenState() {
    try {
      state.open = localStorage.getItem(storageKey) === '1';
    } catch (_) {
      state.open = false;
    }
  }

  function setStatus(text, cls) {
    var el = qs('#siteAiStatus');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'site-ai-status' + (cls ? ' ' + cls : '');
  }

  function renderMessages() {
    var host = qs('#siteAiMessages');
    if (!host) return;
    if (!state.canUseNow) {
      host.innerHTML =
        '<div class="site-ai-empty">' +
        (state.requireLogin ? '当前需要登录后使用 AI 助手。' : 'AI 助手暂不可用。') +
        '</div>';
      return;
    }
    if (!state.messages.length) {
      host.innerHTML = '<div class="site-ai-empty">可以提问当前页面、文档内容或站内知识问题。</div>';
      return;
    }
    host.innerHTML = state.messages
      .map(function (item) {
        var html =
          '<article class="site-ai-msg site-ai-msg--' +
          item.role +
          '">' +
          '<div class="site-ai-msg-body">' +
          esc(item.content).replace(/\n/g, '<br />');
        if (item.role === 'assistant' && Array.isArray(item.sources) && item.sources.length && state.showSources) {
          html +=
            '<div class="site-ai-sources">' +
            item.sources
              .map(function (src) {
                return (
                  '<a class="site-ai-source" href="' +
                  esc(src.url || '#') +
                  '" target="_blank" rel="noopener">' +
                  esc(src.sourceLabel || src.title || src.url || '来源') +
                  '</a>'
                );
              })
              .join('') +
            '</div>';
        }
        html += '</div></article>';
        return html;
      })
      .join('');
    host.scrollTop = host.scrollHeight;
  }

  function renderOpenState() {
    var panel = qs('#siteAiPanel');
    if (!panel) return;
    panel.hidden = !state.open;
  }

  async function sendQuestion() {
    if (state.busy) return;
    var input = qs('#siteAiInput');
    var web = qs('#siteAiWebSearch');
    var text = input && input.value ? String(input.value).trim() : '';
    if (!state.canUseNow) {
      setStatus(state.requireLogin ? '当前需要登录后使用 AI 助手。' : 'AI 助手暂不可用。', 'err');
      return;
    }
    if (!text) return;
    state.busy = true;
    state.messages.push({ role: 'user', content: text });
    renderMessages();
    if (input) input.value = '';
    setStatus('AI 正在思考…', '');
    try {
      var resp = await fetch('/api/ai/chat', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: state.messages.map(function (item) {
            return { role: item.role, content: item.content };
          }),
          webSearch: !!(web && web.checked && state.allowWebSearch),
          pageContext: pageContext(),
        }),
      });
      var raw = await resp.text();
      var data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch (_) {}
      if (!resp.ok) throw new Error(data.error || 'AI 请求失败');
      state.messages.push({
        role: 'assistant',
        content: String(data.answer || '').trim() || '未返回有效内容',
        sources: Array.isArray(data.sources) ? data.sources : [],
      });
      state.showSources = data.showSources !== false;
      renderMessages();
      setStatus('', '');
    } catch (err) {
      setStatus(err.message || String(err), 'err');
    } finally {
      state.busy = false;
    }
  }

  async function bootstrap() {
    try {
      removeLegacyEmbedWidgets();
      var resp = await fetch('/api/ai/config', { credentials: 'same-origin', cache: 'no-store' });
      var data = await resp.json().catch(function () {
        return {};
      });
      if (!resp.ok) return;
      if (!data.enabled && data.canUseNow !== false) return;
      state.enabled = !!data.enabled;
      state.requireLogin = !!data.requireLogin;
      state.canUseNow = data.canUseNow !== false && !!data.enabled;
      state.showSources = data.showSources !== false;
      state.allowWebSearch = !!data.allowWebSearch;
      restoreOpenState();
      ensureUi();
      var input = qs('#siteAiInput');
      var send = qs('#siteAiSend');
      var web = qs('#siteAiWebSearch');
      if (web) {
        web.checked = false;
        web.disabled = !state.allowWebSearch || !state.canUseNow;
        web.parentNode.classList.toggle('is-disabled', !state.allowWebSearch || !state.canUseNow);
      }
      if (!state.canUseNow) {
        if (input) {
          input.value = '';
          input.disabled = true;
          input.placeholder = state.requireLogin ? '请登录后使用 AI 助手' : 'AI 助手暂不可用';
        }
        if (send) send.disabled = true;
        setStatus(state.requireLogin ? '当前需要登录后使用 AI 助手。' : 'AI 助手暂不可用。', 'err');
      }
      renderOpenState();
      renderMessages();
    } catch (_) {}
  }

  removeLegacyEmbedWidgets();
  document.addEventListener('DOMContentLoaded', bootstrap);
})();
