/**
 * 结构化日志（单行 JSON），便于日志采集与 requestId 关联。
 * LOG_JSON=0：仅输出 message 字符串（兼容旧习惯）
 */
function log(level, fields) {
  if (!fields || typeof fields !== 'object') return;
  const payload = Object.assign(
    {
      ts: new Date().toISOString(),
      level: level || 'info',
    },
    fields
  );
  if (process.env.LOG_JSON === '0') {
    const msg = fields.msg || fields.type || level;
    if (level === 'error') console.error(msg);
    else console.log(msg);
    return;
  }
  const line = JSON.stringify(payload);
  if (level === 'error') console.error(line);
  else console.log(line);
}

module.exports = { log };
