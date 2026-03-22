const fs = require('fs');
const path = require('path');

/** 备份 file.bak-时间戳，并只保留同一主文件最新的 keepCount 个备份 */
function backupWithPrune(filePath, keepCount) {
  if (!fs.existsSync(filePath)) return;
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const bakPath = filePath + '.bak-' + ts;
  fs.copyFileSync(filePath, bakPath);
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const prefix = base + '.bak-';
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (_) {
    return;
  }
  const items = names
    .filter((n) => n.startsWith(prefix))
    .map((n) => {
      const full = path.join(dir, n);
      try {
        const st = fs.statSync(full);
        if (!st.isFile()) return null;
        return { full, mtime: st.mtimeMs };
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime);
  for (let i = keepCount; i < items.length; i++) {
    try {
      fs.unlinkSync(items[i].full);
    } catch (_) {}
  }
}

module.exports = { backupWithPrune };
