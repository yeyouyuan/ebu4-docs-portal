/**
 * e-Cology Token Extractor — Content Script
 * 页面悬浮面板：支持最小化、关闭、从 Popup 重新打开
 */

(function () {
  'use strict';

  if (window.__ecomTokenPanelLoaded) return;
  window.__ecomTokenPanelLoaded = true;

  let autoMode = true;
  let isMinimized = false;
  let showPanel = true;
  let tokens = [];
  let panel = null;

  function getEl(id) {
    return document.getElementById(id);
  }

  function escapeAttr(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
      return;
    }
    fallbackCopy(text);
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  function renderTokens(list) {
    if (!panel) return;
    const container = getEl('etpTokenList');
    const statusEl = getEl('etpStatus');
    if (!container || !statusEl) return;

    if (!list.length) {
      statusEl.innerHTML = '<span class="etp-dot etp-dot-err"></span><span>未发现 Token</span>';
      container.innerHTML = '<div class="etp-empty">当前页面无有效 Token</div>';
      return;
    }

    statusEl.innerHTML =
      '<span class="etp-dot etp-dot-ok"></span><span>发现 ' + list.length + ' 个 Token</span>';

    container.innerHTML = list
      .map((t, i) => {
        const truncated =
          t.value.length > 40 ? t.value.slice(0, 20) + '...' + t.value.slice(-10) : t.value;
        const isExpired = t.expires && t.expires * 1000 < Date.now();
        return (
          '<div class="etp-token-item ' +
          (isExpired ? 'etp-expired' : '') +
          '" data-index="' +
          i +
          '">' +
          '<div class="etp-token-header">' +
          '<span class="etp-token-name">' +
          t.name +
          '</span>' +
          (isExpired
            ? '<span class="etp-badge-expired">已过期</span>'
            : '<span class="etp-badge-active">有效</span>') +
          '</div>' +
          '<div class="etp-token-value" title="' +
          escapeAttr(t.value) +
          '">' +
          truncated +
          '</div>' +
          '<div class="etp-token-meta"><span>' +
          t.domain +
          '</span><span>' +
          (t.httpOnly ? '🔒 HttpOnly ' : '') +
          (t.secure ? '🛡️ Secure' : '') +
          '</span></div>' +
          '<button class="etp-copy-btn" data-value="' +
          escapeAttr(t.name + '=' + t.value + ';') +
          '">📋 复制 Cookie</button>' +
          '</div>'
        );
      })
      .join('');

    container.querySelectorAll('.etp-copy-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const val = e.currentTarget.dataset.value;
        copyText(val);
        e.currentTarget.textContent = '✅ 已复制';
        setTimeout(() => {
          e.currentTarget.textContent = '📋 复制 Cookie';
        }, 1500);
      });
    });
  }

  function updateAutoButton() {
    if (!panel) return;
    const btn = getEl('etpAutoToggle');
    if (!btn) return;
    btn.textContent = autoMode ? '⚡' : '🔘';
    btn.title = autoMode ? '自动模式' : '手动模式';
  }

  function applyPanelState() {
    if (!panel) return;
    panel.classList.toggle('etp-panel-hidden', !showPanel);
    const body = getEl('etpBody');
    if (body) body.classList.toggle('etp-hidden', isMinimized);
    panel.classList.toggle('etp-collapsed', isMinimized);
    updateAutoButton();
  }

  function ensurePanel() {
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = 'ecom-token-panel';
    panel.innerHTML = `
      <div class="etp-header">
        <div class="etp-logo">
          <svg width="18" height="18" viewBox="0 0 128 128" fill="none">
            <circle cx="64" cy="64" r="64" fill="url(#etpGrad)"/>
            <defs><linearGradient id="etpGrad" x1="0" y1="0" x2="128" y2="128">
              <stop offset="0%" stop-color="#6366f1"/><stop offset="100%" stop-color="#8b5cf6"/>
            </linearGradient></defs>
            <g transform="translate(64,58)" stroke="white" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none">
              <circle cx="-12" cy="-8" r="18"/>
              <line x1="10" y1="-8" x2="52" y2="-8"/>
              <line x1="52" y1="-8" x2="52" y2="12"/>
              <line x1="38" y1="-8" x2="38" y2="12"/>
            </g>
          </svg>
        </div>
        <span class="etp-title">Token Extractor</span>
        <div class="etp-controls">
          <button class="etp-btn etp-auto-btn" id="etpAutoToggle" title="自动/手动">⚡</button>
          <button class="etp-btn etp-min-btn" id="etpMinToggle" title="最小化">—</button>
          <button class="etp-btn etp-close-btn" id="etpCloseToggle" title="关闭悬浮窗">✕</button>
        </div>
      </div>
      <div class="etp-body" id="etpBody">
        <div class="etp-status" id="etpStatus">
          <span class="etp-dot"></span>
          <span>扫描中...</span>
        </div>
        <div class="etp-token-list" id="etpTokenList"></div>
        <div class="etp-actions">
          <button class="etp-action-btn etp-refresh" id="etpRefresh">🔄 刷新</button>
          <button class="etp-action-btn etp-copy-all" id="etpCopyAll">📋 全部复制</button>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    getEl('etpMinToggle').addEventListener('click', () => {
      isMinimized = !isMinimized;
      applyPanelState();
      chrome.storage.local.set({ etpMinimized: isMinimized });
    });

    getEl('etpAutoToggle').addEventListener('click', () => {
      autoMode = !autoMode;
      updateAutoButton();
      chrome.storage.local.set({ etpAutoMode: autoMode });
      if (autoMode) scanTokens();
    });

    getEl('etpCloseToggle').addEventListener('click', () => {
      showPanel = false;
      applyPanelState();
      chrome.storage.local.set({ etpShowPanel: false });
    });

    getEl('etpRefresh').addEventListener('click', () => {
      scanTokens();
    });

    getEl('etpCopyAll').addEventListener('click', () => {
      if (!tokens.length) return;
      const allText = tokens.map((t) => `${t.name}=${t.value};`).join(' ');
      copyText(allText);
    });

    let isDragging = false;
    let dragX = 0;
    let dragY = 0;
    const header = panel.querySelector('.etp-header');
    header.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      isDragging = true;
      dragX = e.clientX - panel.offsetLeft;
      dragY = e.clientY - panel.offsetTop;
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!isDragging || !panel || !showPanel) return;
      panel.style.left = e.clientX - dragX + 'px';
      panel.style.top = e.clientY - dragY + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', () => {
      isDragging = false;
    });

    window.addEventListener('resize', autoSnap);
    renderTokens(tokens);
    applyPanelState();
    return panel;
  }

  function autoSnap() {
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (rect.right > w - 30 && rect.bottom > h - 30) {
      panel.style.left = 'auto';
      panel.style.top = 'auto';
      panel.style.right = '16px';
      panel.style.bottom = '16px';
    }
  }

  function scanTokens() {
    if (!panel) ensurePanel();
    const statusEl = getEl('etpStatus');
    if (statusEl) {
      statusEl.innerHTML = '<span class="etp-dot etp-dot-warn"></span><span>扫描中...</span>';
    }

    chrome.runtime.sendMessage({ action: 'scanTokens' }, (resp) => {
      if (resp && resp.tokens) {
        tokens = resp.tokens;
        renderTokens(tokens);
      } else if (statusEl) {
        statusEl.innerHTML = '<span class="etp-dot etp-dot-err"></span><span>扫描失败</span>';
      }
    });
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes.etpShowPanel) {
      showPanel = changes.etpShowPanel.newValue !== false;
      if (showPanel) {
        ensurePanel();
        applyPanelState();
        if (autoMode) scanTokens();
      } else {
        applyPanelState();
      }
    }
    if (changes.etpAutoMode) {
      autoMode = changes.etpAutoMode.newValue !== false;
      updateAutoButton();
    }
    if (changes.etpMinimized) {
      isMinimized = !!changes.etpMinimized.newValue;
      applyPanelState();
    }
    if (changes.tokens && Array.isArray(changes.tokens.newValue)) {
      tokens = changes.tokens.newValue;
      if (panel) renderTokens(tokens);
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'tokensUpdated' && autoMode) {
      tokens = Array.isArray(msg.tokens) ? msg.tokens : [];
      if (panel) renderTokens(tokens);
    }
  });

  chrome.storage.local.get(['etpMinimized', 'etpAutoMode', 'etpShowPanel', 'tokens'], (res) => {
    isMinimized = !!res.etpMinimized;
    autoMode = res.etpAutoMode !== undefined ? res.etpAutoMode : true;
    showPanel = res.etpShowPanel !== undefined ? res.etpShowPanel : true;
    if (Array.isArray(res.tokens) && res.tokens.length) tokens = res.tokens;

    if (!showPanel) return;
    ensurePanel();
    if (autoMode) scanTokens();
    else renderTokens(tokens);
  });
})();
