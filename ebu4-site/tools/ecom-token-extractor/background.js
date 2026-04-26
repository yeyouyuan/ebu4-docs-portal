/**
 * e-Cology Token Extractor — Background Service Worker
 * 负责 cookie 探测 & token 管理
 */

const DOMAIN = 'e-cology.com.cn';
const COOKIE_NAMES = ['ETEAMSID'];

async function buildCookieHeader() {
  const now = Date.now() / 1000;
  const cookies = await chrome.cookies.getAll({ domain: DOMAIN });
  return cookies
    .filter((c) => !c.expirationDate || c.expirationDate > now)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
    .map((c) => `${c.name}=${c.value};`)
    .join(' ')
    .trim();
}

// 扫描 cookie，提取 token
async function scanCookies() {
  const tokens = [];
  for (const name of COOKIE_NAMES) {
    try {
      // Chrome/Edge API (also works in Firefox MV3)
      const cookie = await chrome.cookies.get({
        url: `https://${DOMAIN}`,
        name
      });
      if (cookie) {
        tokens.push({
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          expires: cookie.expirationDate,
          httpOnly: cookie.httpOnly,
          secure: cookie.secure,
          path: cookie.path
        });
      }
    } catch (e) {
      // Firefox 可能需要宿主匹配
      try {
        const cookies = await chrome.cookies.getAll({ domain: DOMAIN });
        for (const c of cookies) {
          if (c.name === name) {
            tokens.push({
              name: c.name,
              value: c.value,
              domain: c.domain,
              expires: c.expirationDate,
              httpOnly: c.httpOnly,
              secure: c.secure,
              path: c.path
            });
          }
        }
      } catch (_) {}
    }
  }
  // 也扫描所有包含 "token" / "sid" / "session" 的 cookie
  try {
    const all = await chrome.cookies.getAll({ domain: DOMAIN });
    for (const c of all) {
      if (!tokens.find(t => t.name === c.name && t.value === c.value)) {
        const nl = c.name.toLowerCase();
        if (nl.includes('token') || nl.includes('sid') || nl.includes('session') || nl.includes('auth')) {
          tokens.push({
            name: c.name,
            value: c.value,
            domain: c.domain,
            expires: c.expirationDate,
            httpOnly: c.httpOnly,
            secure: c.secure,
            path: c.path
          });
        }
      }
    }
  } catch (_) {}

  return tokens;
}

// 监听来自 popup / content script 的消息
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'scanTokens') {
    scanCookies().then(tokens => {
      // 保存到 storage
      chrome.storage.local.set({ tokens, lastScan: Date.now() });
      sendResponse({ tokens });
    }).catch(err => sendResponse({ tokens: [], error: err.message }));
    return true; // 异步响应
  }

  if (msg.action === 'copyToClipboard') {
    // 需要通过 content script 来复制
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'doCopy',
          text: msg.text
        }, (resp) => {
          sendResponse(resp || { ok: false });
        });
      }
    });
    return true;
  }

  if (msg.action === 'getRequestCookieHeader') {
    Promise.all([buildCookieHeader(), scanCookies()])
      .then(([cookie, tokens]) => {
        sendResponse({
          ok: !!cookie,
          cookie,
          tokens,
          version: chrome.runtime.getManifest().version,
        });
      })
      .catch((err) => {
        sendResponse({
          ok: false,
          cookie: '',
          tokens: [],
          error: err && err.message ? err.message : String(err),
          version: chrome.runtime.getManifest().version,
        });
      });
    return true;
  }
});

// Cookie 变更时自动更新
chrome.cookies.onChanged.addListener(async (changeInfo) => {
  if (changeInfo.cookie.domain.includes(DOMAIN)) {
    const tokens = await scanCookies();
    chrome.storage.local.set({ tokens, lastScan: Date.now() });
    // 通知所有 tab 的 content script
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (tab.url && tab.url.includes(DOMAIN)) {
          chrome.tabs.sendMessage(tab.id, {
            action: 'tokensUpdated',
            tokens
          }).catch(() => {});
        }
      }
    });
  }
});
