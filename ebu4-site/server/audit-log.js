/**
 * 管理操作审计：追加写入 JSON Lines，不含密码或正文内容。
 * AUDIT_LOG_PATH：日志文件路径（默认 ebu4-site/logs/admin-audit.jsonl）
 * AUDIT_LOG_ENABLED=0：关闭写入（仍建议生产开启）
 */
const fs = require('fs');
const path = require('path');

function enabled() {
  const v = process.env.AUDIT_LOG_ENABLED;
  if (v === '0' || v === 'false') return false;
  return true;
}

function getLogPath() {
  return (
    process.env.AUDIT_LOG_PATH ||
    path.join(__dirname, '..', 'logs', 'admin-audit.jsonl')
  );
}

/**
 * @param {object} entry
 * @param {string} entry.action  如 auth.login.success、file.markdown.write
 * @param {string} [entry.actor] 固定为 admin（单用户）；预留多用户时可填账号
 * @param {string} entry.outcome ok | deny | error
 * @param {string} [entry.ip]
 * @param {string} [entry.requestId]
 * @param {object} [entry.detail] 摘要字段，禁止放密码或全文
 */
function append(entry) {
  if (!enabled()) return;
  const line =
    JSON.stringify(
      Object.assign(
        {
          ts: new Date().toISOString(),
          actor: 'admin',
        },
        entry
      )
    ) + '\n';
  try {
    const p = getLogPath();
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(p, line, 'utf-8');
  } catch (e) {
    console.error('[audit-log]', e.message || e);
  }
}

/**
 * 读取审计文件尾部若干条（JSON Lines）。大文件只读末尾约 512KB。
 * @param {number} limit 条数上限 1–500
 */
function readTail(limit) {
  const lim = Math.min(500, Math.max(1, parseInt(limit, 10) || 100));
  const p = getLogPath();
  if (!fs.existsSync(p)) return [];
  let stat;
  try {
    stat = fs.statSync(p);
  } catch (_) {
    return [];
  }
  const maxChunk = Math.min(stat.size, 512 * 1024);
  let text;
  if (stat.size <= maxChunk) {
    text = fs.readFileSync(p, 'utf-8');
  } else {
    const fd = fs.openSync(p, 'r');
    const buf = Buffer.alloc(maxChunk);
    fs.readSync(fd, buf, 0, maxChunk, stat.size - maxChunk);
    fs.closeSync(fd);
    text = buf.toString('utf-8');
  }
  const lines = text.split(/\r?\n/).filter(Boolean);
  const slice = lines.slice(-lim);
  const out = [];
  for (const line of slice) {
    try {
      out.push(JSON.parse(line));
    } catch (_) {}
  }
  return out;
}

module.exports = { append, enabled, getLogPath, readTail };
