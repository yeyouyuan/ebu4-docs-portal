/**
 * 服务侧定时检测/自动应用（与管理员 API 共用 upgrade-service）
 */
const { normalizeSiteSettings } = require('./lib/site-settings-normalize');
const upgradeService = require('./lib/upgrade-service');

function readSettings(siteDatabase) {
  try {
    const raw = siteDatabase.getKv('site_settings');
    if (!raw) return normalizeSiteSettings(null);
    return normalizeSiteSettings(JSON.parse(raw));
  } catch (_) {
    return normalizeSiteSettings(null);
  }
}

/**
 * @param {{ siteDatabase: import('./site-database'), siteRoot: string, reloadDocData: () => void, backupKeepCount?: number }} ctx
 */
function startUpgradeScheduler(ctx) {
  const { siteDatabase, siteRoot, reloadDocData, backupKeepCount = 20 } = ctx;
  let lastRunAt = 0;
  const tickMs = 60 * 1000;
  setInterval(() => {
    upgradeService
      .withUpgradeLock(async () => {
        const st = readSettings(siteDatabase);
        const u = st.upgrade;
        if (!u || !u.enabled || !u.autoUpdate || !u.autoUpdate.enabled) return;
        const minMs = (u.autoUpdate.intervalMinutes || 60) * 60 * 1000;
        const now = Date.now();
        if (now - lastRunAt < minMs) return;
        lastRunAt = now;
        const check = await upgradeService.runUpgradeCheck({
          siteDatabase,
          siteSettings: st,
          siteRoot,
          trigger: 'scheduler',
        });
        if (check.errors && check.errors.length) return;
        if (u.autoUpdate.applyDocs && check.hasDocsUpdate) {
          await upgradeService.runUpgradeApplyDocs({
            siteDatabase,
            siteSettings: st,
            siteRoot,
            artifactIndex: 0,
            reloadDocData,
            backupKeepCount,
            trigger: 'scheduler',
          });
        }
        if (u.autoUpdate.applySystem && check.hasSystemUpdate) {
          await upgradeService.runUpgradeApplySystem({
            siteDatabase,
            siteSettings: st,
            siteRoot,
            artifactIndex: 0,
            trigger: 'scheduler',
          });
        }
      })
      .catch((e) => {
        console.warn('[upgrade-scheduler]', e && e.message ? e.message : e);
      });
  }, tickMs);
}

module.exports = { startUpgradeScheduler };
