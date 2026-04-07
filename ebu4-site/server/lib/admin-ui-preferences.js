/**
 * 后台 UI 偏好（上次侧栏模块等）— SQLite site_kv 或文件，与菜单顺序存储方式一致。
 */
const fs = require('fs');
const path = require('path');

const KV_KEY = 'admin_ui_preferences';

const DEFAULT_PREFS = {
  lastTab: 'dash',
  docSub: 'main',
};

function safeParse(raw) {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function readPrefs(siteDatabase, filePath) {
  try {
    if (siteDatabase && siteDatabase.isSiteSqlite()) {
      const raw = siteDatabase.getKv(KV_KEY);
      return Object.assign({}, DEFAULT_PREFS, safeParse(raw));
    }
    if (filePath && fs.existsSync(filePath)) {
      return Object.assign({}, DEFAULT_PREFS, safeParse(fs.readFileSync(filePath, 'utf-8')));
    }
  } catch (_) {}
  return { ...DEFAULT_PREFS };
}

function writePrefs(siteDatabase, filePath, prefs) {
  const out = JSON.stringify(
    Object.assign({}, DEFAULT_PREFS, prefs),
    null,
    0
  );
  if (siteDatabase && siteDatabase.isSiteSqlite()) {
    siteDatabase.setKv(KV_KEY, out);
    return;
  }
  if (filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, out, 'utf-8');
  }
}

function mergePut(prev, body) {
  const next = Object.assign({}, prev);
  if (body && typeof body === 'object') {
    if (body.lastTab != null && String(body.lastTab).trim()) {
      next.lastTab = String(body.lastTab).trim();
    }
    if (body.docSub === 'extra' || body.docSub === 'main') {
      next.docSub = body.docSub;
    }
  }
  return next;
}

module.exports = {
  KV_KEY,
  DEFAULT_PREFS,
  readPrefs,
  writePrefs,
  mergePut,
};
