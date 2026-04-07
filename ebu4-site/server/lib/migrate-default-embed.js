/**
 * 一次性迁移：若 site_settings 中 embed.aiChatHtml 仍为空，则写入默认 AI 嵌入脚本并打标，避免重复执行。
 */
const fs = require('fs');
const path = require('path');
const { normalizeSiteSettings } = require('./site-settings-normalize');
const { DEFAULT_EMBED_AI_HTML } = require('./site-embed');

const KV_FLAG = 'migrated_default_embed_ai_v1';

/**
 * @param {*} siteDatabase
 * @param {string} [publicDir] 文件模式 site-settings.json 所在 public 根目录
 */
function migrateDefaultEmbedAi(siteDatabase, publicDir) {
  if (siteDatabase && typeof siteDatabase.isSiteSqlite === 'function' && siteDatabase.isSiteSqlite()) {
    try {
      if (siteDatabase.getKv(KV_FLAG) === '1') return;
      const raw = siteDatabase.getKv('site_settings');
      const j = raw ? JSON.parse(raw) : {};
      const merged = normalizeSiteSettings(j);
      const cur =
        merged.embed && merged.embed.aiChatHtml != null
          ? String(merged.embed.aiChatHtml).trim()
          : '';
      if (cur) {
        siteDatabase.setKv(KV_FLAG, '1');
        return;
      }
      merged.embed = Object.assign({}, merged.embed || {}, {
        aiChatHtml: DEFAULT_EMBED_AI_HTML,
      });
      siteDatabase.setKv('site_settings', JSON.stringify(merged));
      siteDatabase.setKv(KV_FLAG, '1');
      console.log('[site] 已将默认前台 AI 嵌入写入 site_settings（一次性迁移）');
    } catch (e) {
      console.warn('[site] 默认嵌入迁移跳过:', e && e.message ? e.message : e);
    }
    return;
  }

  if (!publicDir) return;
  try {
    const flagPath = path.join(publicDir, 'data', '.migrated_default_embed_ai_v1');
    if (fs.existsSync(flagPath)) return;
    const settingsPath = path.join(publicDir, 'data', 'site-settings.json');
    let j = {};
    if (fs.existsSync(settingsPath)) {
      try {
        j = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      } catch (_) {}
    }
    const merged = normalizeSiteSettings(j);
    const cur =
      merged.embed && merged.embed.aiChatHtml != null
        ? String(merged.embed.aiChatHtml).trim()
        : '';
    if (cur) {
      fs.writeFileSync(flagPath, '1', 'utf-8');
      return;
    }
    merged.embed = Object.assign({}, merged.embed || {}, {
      aiChatHtml: DEFAULT_EMBED_AI_HTML,
    });
    const dir = path.dirname(settingsPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
    fs.writeFileSync(flagPath, '1', 'utf-8');
    console.log('[site] 已将默认前台 AI 嵌入写入 site-settings.json（一次性迁移）');
  } catch (e) {
    console.warn('[site] 默认嵌入迁移（文件模式）跳过:', e && e.message ? e.message : e);
  }
}

module.exports = { migrateDefaultEmbedAi, KV_FLAG };
