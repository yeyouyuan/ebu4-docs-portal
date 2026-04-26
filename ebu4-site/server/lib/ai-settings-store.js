const fs = require('fs');
const path = require('path');
const { normalizeAiSettings } = require('./ai-settings-normalize');

function readAiSettingsRaw(siteDatabase, filePath) {
  let raw = null;
  if (siteDatabase && typeof siteDatabase.isSiteSqlite === 'function' && siteDatabase.isSiteSqlite()) {
    const kv = siteDatabase.getKv('ai_settings');
    if (kv) raw = JSON.parse(kv);
  } else if (filePath && fs.existsSync(filePath)) {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
  return raw;
}

function readNormalizedAiSettings(siteDatabase, filePath) {
  try {
    return normalizeAiSettings(readAiSettingsRaw(siteDatabase, filePath));
  } catch (_) {
    return normalizeAiSettings(null);
  }
}

function writeNormalizedAiSettings(siteDatabase, filePath, normalized) {
  const raw = JSON.stringify(normalized);
  if (siteDatabase && typeof siteDatabase.isSiteSqlite === 'function' && siteDatabase.isSiteSqlite()) {
    siteDatabase.setKv('ai_settings', raw);
    return;
  }
  if (!filePath) throw new Error('缺少 AI 设置文件路径');
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, raw, 'utf-8');
}

module.exports = {
  readAiSettingsRaw,
  readNormalizedAiSettings,
  writeNormalizedAiSettings,
};
