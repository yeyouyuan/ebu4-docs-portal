(function () {
  'use strict';

  let tokens = [];

  // DOM — Token
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const autoModeEl = document.getElementById('autoMode');
  const tokenList = document.getElementById('tokenList');
  const scanBtn = document.getElementById('scanBtn');
  const copyAllBtn = document.getElementById('copyAllBtn');
  const lastScanEl = document.getElementById('lastScan');

  // DOM — Settings
  const settingsToggle = document.getElementById('settingsToggle');
  const tabTokens = document.getElementById('tabTokens');
  const tabSettings = document.getElementById('tabSettings');
  const backBtn = document.getElementById('backBtn');
  const autoScan = document.getElementById('autoScan');
  const showPanel = document.getElementById('showPanel');
  const watchCookie = document.getElementById('watchCookie');
  const expireNotify = document.getElementById('expireNotify');
  const autoCopy = document.getElementById('autoCopy');
  const customCookies = document.getElementById('customCookies');
  const historyCount = document.getElementById('historyCount');
  const exportHistory = document.getElementById('exportHistory');
  const clearHistory = document.getElementById('clearHistory');

  // ===== Tab Switching =====
  function showTab(tab) {
    tabTokens.classList.toggle('tab-hidden', tab !== 'tokens');
    tabSettings.classList.toggle('tab-hidden', tab !== 'settings');
    settingsToggle.classList.toggle('active', tab === 'settings');
  }

  settingsToggle.addEventListener('click', () => {
    const isSettings = !tabSettings.classList.contains('tab-hidden');
    showTab(isSettings ? 'tokens' : 'settings');
    if (!isSettings) loadSettings();
  });

  backBtn.addEventListener('click', () => showTab('tokens'));

  // ===== Scan Tokens =====
  function scanTokens() {
    setStatus('scanning', '扫描中...');
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0] || !tabs[0].url) {
        setStatus('err', '无法获取当前标签');
        return;
      }
      chrome.runtime.sendMessage({ action: 'scanTokens' }, (resp) => {
        if (chrome.runtime.lastError) { setStatus('err', '通信失败'); return; }
        if (resp && resp.tokens) {
          tokens = resp.tokens;
          if (tokens.length > 0) {
            setStatus('ok', `发现 ${tokens.length} 个 Token`);
            renderTokens(tokens);
            copyAllBtn.disabled = false;
          } else {
            setStatus('warn', '未发现 Token');
            renderEmpty('当前域名无有效 Token');
            copyAllBtn.disabled = true;
          }
          updateLastScan();
        } else {
          setStatus('err', '扫描失败');
        }
      });
    });
  }

  // ===== Render Tokens =====
  function renderTokens(list) {
    tokenList.innerHTML = list.map((t, i) => {
      const truncated = t.value.length > 50 ? t.value.slice(0, 25) + '…' + t.value.slice(-12) : t.value;
      const isExpired = t.expires && t.expires * 1000 < Date.now();
      return `
        <div class="token-card ${isExpired ? 'expired' : ''}">
          <div class="token-card-header">
            <span class="token-name">${esc(t.name)}</span>
            <span class="token-badge ${isExpired ? 'expired' : 'active'}">${isExpired ? '已过期' : '有效'}</span>
          </div>
          <div class="token-value ${isExpired ? 'expired' : ''}" title="点击复制" data-full="${escAttr(t.value)}">${esc(truncated)}</div>
          <div class="token-meta">
            <span>${esc(t.domain)}</span>
            <span>${t.httpOnly ? '<span class="tag">🔒 Http</span>' : ''} ${t.secure ? '<span class="tag">🛡️ Secure</span>' : ''}</span>
          </div>
          <div class="token-actions">
            <button class="token-action-btn" data-copy="${escAttr(t.name + '=' + t.value + ';')}">📋 复制 Cookie</button>
          </div>
        </div>`;
    }).join('');

    tokenList.querySelectorAll('[data-copy]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        copy(e.currentTarget.dataset.copy);
        e.currentTarget.classList.add('copied');
        e.currentTarget.textContent = '✅ 已复制';
        setTimeout(() => {
          e.currentTarget.classList.remove('copied');
          e.currentTarget.textContent = '📋 复制 Cookie';
        }, 1500);
      });
    });

    tokenList.querySelectorAll('.token-value').forEach(el => {
      el.addEventListener('click', () => {
        copy(el.dataset.full);
        el.style.outline = '1px solid #22c55e';
        setTimeout(() => { el.style.outline = ''; }, 800);
      });
    });
  }

  function renderEmpty(msg) {
    tokenList.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><p>${esc(msg)}</p><p class="empty-hint">请确认已登录 e-cology 系统</p></div>`;
  }

  // ===== Settings =====
  const SETTING_KEYS = ['etpAutoMode', 'etpShowPanel', 'etpWatchCookie', 'etpExpireNotify', 'etpCustomCookies', 'etpAutoCopy'];

  function loadSettings() {
    chrome.storage.local.get(SETTING_KEYS.concat(['tokenHistory']), (res) => {
      autoScan.checked = res.etpAutoMode !== undefined ? res.etpAutoMode : true;
      showPanel.checked = res.etpShowPanel !== undefined ? res.etpShowPanel : true;
      watchCookie.checked = res.etpWatchCookie !== undefined ? res.etpWatchCookie : true;
      expireNotify.checked = res.etpExpireNotify !== undefined ? res.etpExpireNotify : true;
      customCookies.value = res.etpCustomCookies || '';
      autoCopy.checked = res.etpAutoCopy !== undefined ? res.etpAutoCopy : false;
      const hc = (res.tokenHistory || []).length;
      historyCount.textContent = hc > 0 ? `${hc} 条记录` : '暂无记录';
    });
  }

  function saveSettings() {
    chrome.storage.local.set({
      etpAutoMode: autoScan.checked,
      etpShowPanel: showPanel.checked,
      etpWatchCookie: watchCookie.checked,
      etpExpireNotify: expireNotify.checked,
      etpCustomCookies: customCookies.value.trim(),
      etpAutoCopy: autoCopy.checked
    });
  }

  [autoScan, showPanel, watchCookie, expireNotify, autoCopy].forEach(el => {
    el.addEventListener('change', saveSettings);
  });
  customCookies.addEventListener('input', debounce(saveSettings, 600));

  exportHistory.addEventListener('click', () => {
    chrome.storage.local.get(['tokenHistory'], (res) => {
      const history = res.tokenHistory || [];
      const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ecom-tokens-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  });

  clearHistory.addEventListener('click', () => {
    chrome.storage.local.set({ tokenHistory: [] }, () => {
      historyCount.textContent = '暂无记录';
    });
  });

  // ===== Utils =====
  function setStatus(type, text) {
    statusDot.className = 'status-dot ' + type;
    statusText.textContent = text;
  }

  function updateLastScan() {
    lastScanEl.textContent = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    chrome.storage.local.set({ lastScanTime: Date.now() });
  }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    } else { fallbackCopy(text); }
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
  }

  function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function escAttr(s) { return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  // ===== Init =====
  scanBtn.addEventListener('click', scanTokens);
  copyAllBtn.addEventListener('click', () => {
    if (tokens.length === 0) return;
    copy(tokens.map(t => `${t.name}=${t.value};`).join(' '));
    copyAllBtn.innerHTML = '<span class="btn-icon">✅</span> 已复制';
    setTimeout(() => { copyAllBtn.innerHTML = '<span class="btn-icon">📋</span> 全部复制'; }, 1500);
  });
  autoModeEl.addEventListener('change', () => {
    chrome.storage.local.set({ etpAutoMode: autoModeEl.checked });
  });

  chrome.storage.local.get(['etpAutoMode', 'tokens', 'lastScanTime'], (res) => {
    autoModeEl.checked = res.etpAutoMode !== undefined ? res.etpAutoMode : true;
    if (res.tokens && res.tokens.length > 0) {
      tokens = res.tokens;
      renderTokens(tokens);
      setStatus('ok', `发现 ${tokens.length} 个 Token`);
      copyAllBtn.disabled = false;
    }
    if (res.lastScanTime) {
      lastScanEl.textContent = new Date(res.lastScanTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    if (autoModeEl.checked) scanTokens();
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'tokensUpdated') {
      tokens = msg.tokens;
      renderTokens(tokens);
      if (tokens.length > 0) {
        setStatus('ok', `发现 ${tokens.length} 个 Token`);
        copyAllBtn.disabled = false;
      }
      updateLastScan();
    }
  });

})();
