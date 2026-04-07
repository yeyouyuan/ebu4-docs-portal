/**
 * 后台在线用户：Redis 优先（环境变量 REDIS_URL 或站点设置 site_settings.redis），否则进程内 Map。
 * Key: ebu4:admin:presence:{sessionToken}，TTL 90s，心跳续期。
 */
const TTL_SEC = 90;
const PREFIX = 'ebu4:admin:presence:';

let redisClient = null;
let redisReady = false;
let redisInitPromise = null;
/** 当前已建立连接的 URL（用于配置变更后重连） */
let lastConnectedUrl = null;

/** 来自 site_kv.site_settings（由 applySiteSettings 写入） */
let dbRedisEnabled = false;
let dbRedisUrl = '';

const mem = new Map();

function getEffectiveRedisUrl() {
  const env = process.env.REDIS_URL;
  if (env && String(env).trim()) {
    return { url: String(env).trim(), source: 'env' };
  }
  if (dbRedisEnabled && dbRedisUrl && String(dbRedisUrl).trim()) {
    return { url: String(dbRedisUrl).trim(), source: 'database' };
  }
  return { url: null, source: 'none' };
}

/**
 * 从站点设置应用 Redis（写入数据库后或启动时调用）。
 * @param {object|null|undefined} redis
 */
function applySiteSettings(redis) {
  const r = redis && typeof redis === 'object' ? redis : {};
  dbRedisEnabled = !!r.enabled;
  dbRedisUrl = r.url != null ? String(r.url).trim() : '';
}

/**
 * 断开连接并清空内存中的客户端状态，便于更换 URL 后重连。
 */
async function resetRedisConnection() {
  lastConnectedUrl = null;
  const c = redisClient;
  redisClient = null;
  redisReady = false;
  redisInitPromise = null;
  if (c) {
    try {
      await c.quit();
    } catch (_) {
      try {
        await c.disconnect();
      } catch (_) {}
    }
  }
}

async function ensureRedis() {
  const { url } = getEffectiveRedisUrl();
  if (!url) {
    await resetRedisConnection();
    return;
  }
  if (redisReady && redisClient && lastConnectedUrl === url) {
    return;
  }
  if (redisInitPromise) {
    return redisInitPromise;
  }
  redisInitPromise = (async () => {
    try {
      await resetRedisConnection();
      const { createClient } = require('redis');
      redisClient = createClient({ url });
      redisClient.on('error', () => {
        redisReady = false;
      });
      await redisClient.connect();
      redisReady = true;
      lastConnectedUrl = url;
    } catch (e) {
      redisClient = null;
      redisReady = false;
      lastConnectedUrl = null;
    } finally {
      redisInitPromise = null;
    }
  })();
  return redisInitPromise;
}

/**
 * 应用站点设置并立即尝试连接（保存后调用）。
 */
async function applySiteSettingsAndReconnect(redis) {
  applySiteSettings(redis);
  await ensureRedis();
}

function pruneMem() {
  const now = Date.now();
  const maxAge = TTL_SEC * 1000;
  for (const [k, v] of mem) {
    if (now - v.at > maxAge) mem.delete(k);
  }
}

async function ping(token, data) {
  await ensureRedis();
  if (!token || !data) return;
  const payload = Object.assign({}, data, { at: Date.now() });
  const key = PREFIX + token;
  const val = JSON.stringify(payload);
  if (redisClient && redisReady) {
    try {
      await redisClient.set(key, val, { EX: TTL_SEC });
      return;
    } catch (_) {
      redisReady = false;
    }
  }
  pruneMem();
  mem.set(token, payload);
}

async function listOnline() {
  await ensureRedis();
  const out = [];
  if (redisClient && redisReady) {
    try {
      for await (const key of redisClient.scanIterator({ MATCH: PREFIX + '*', COUNT: 200 })) {
        const raw = await redisClient.get(key);
        if (!raw) continue;
        try {
          const j = JSON.parse(raw);
          if (Date.now() - j.at > TTL_SEC * 1000) continue;
          const token = key.startsWith(PREFIX) ? key.slice(PREFIX.length) : '';
          out.push({
            userId: j.userId,
            username: j.username,
            role: j.role,
            at: j.at,
          });
        } catch (_) {}
      }
      return { list: out, backend: 'redis' };
    } catch (_) {
      redisReady = false;
    }
  }
  pruneMem();
  for (const [tok, v] of mem) {
    if (Date.now() - v.at > TTL_SEC * 1000) continue;
    out.push({
      userId: v.userId,
      username: v.username,
      role: v.role,
      at: v.at,
    });
  }
  return { list: out, backend: 'memory' };
}

async function del(token) {
  if (!token) return;
  await ensureRedis();
  const key = PREFIX + token;
  if (redisClient && redisReady) {
    try {
      await redisClient.del(key);
    } catch (_) {
      redisReady = false;
    }
  }
  mem.delete(token);
}

/**
 * 按 userId + at 匹配一条在线会话并下线（不在 API 中暴露 sessionToken）。
 */
async function kickByUserIdAndAt(userId, at) {
  const wantUid = parseInt(userId, 10);
  const wantAt = parseInt(at, 10);
  if (!Number.isFinite(wantUid) || !Number.isFinite(wantAt)) {
    return { ok: false, error: 'invalid_target', sessionToken: null };
  }
  await ensureRedis();
  if (redisClient && redisReady) {
    try {
      for await (const key of redisClient.scanIterator({ MATCH: PREFIX + '*', COUNT: 200 })) {
        const raw = await redisClient.get(key);
        if (!raw) continue;
        try {
          const j = JSON.parse(raw);
          if (Date.now() - j.at > TTL_SEC * 1000) continue;
          const uid = j.userId != null ? parseInt(j.userId, 10) : NaN;
          const ts = j.at != null ? parseInt(j.at, 10) : NaN;
          if (uid === wantUid && ts === wantAt) {
            const token = key.startsWith(PREFIX) ? key.slice(PREFIX.length) : '';
            await del(token);
            return { ok: true, sessionToken: token };
          }
        } catch (_) {}
      }
    } catch (_) {
      redisReady = false;
    }
  }
  pruneMem();
  for (const [tok, v] of mem) {
    const uid = v.userId != null ? parseInt(v.userId, 10) : NaN;
    const ts = v.at != null ? parseInt(v.at, 10) : NaN;
    if (uid === wantUid && ts === wantAt) {
      await del(tok);
      return { ok: true, sessionToken: tok };
    }
  }
  return { ok: false, error: 'not_found' };
}

async function getStatus() {
  await ensureRedis();
  const { url, source } = getEffectiveRedisUrl();
  const urlConfigured = !!(url && String(url).trim());
  const connected = !!(redisClient && redisReady);
  let effectiveBackend = 'memory';
  if (urlConfigured) {
    effectiveBackend = connected ? 'redis' : 'disconnected';
  }
  return {
    urlConfigured,
    connected,
    effectiveBackend,
    source,
    listUsesBackend: connected ? 'redis' : 'memory',
  };
}

/** 供内容缓存等模块复用同一连接 */
async function getRedisClient() {
  await ensureRedis();
  return redisClient && redisReady ? redisClient : null;
}

async function pingRedis() {
  await ensureRedis();
  if (!redisClient || !redisReady) {
    return { ok: false, error: 'not_connected' };
  }
  try {
    const r = await redisClient.ping();
    return { ok: r === 'PONG' };
  } catch (e) {
    redisReady = false;
    return { ok: false, error: String(e.message || e) };
  }
}

/**
 * 使用独立短连接测试任意 URL（保存前校验），不改动当前进程客户端。
 */
async function testRedisUrl(url) {
  const u = url != null ? String(url).trim() : '';
  if (!u) return { ok: false, error: 'empty_url' };
  const { createClient } = require('redis');
  const c = createClient({ url: u });
  try {
    await c.connect();
    const r = await c.ping();
    await c.quit();
    return { ok: r === 'PONG' };
  } catch (e) {
    try {
      await c.disconnect();
    } catch (_) {}
    return { ok: false, error: String(e.message || e) };
  }
}

module.exports = {
  ping,
  listOnline,
  del,
  kickByUserIdAndAt,
  ensureRedis,
  getStatus,
  getRedisClient,
  pingRedis,
  testRedisUrl,
  applySiteSettings,
  applySiteSettingsAndReconnect,
  resetRedisConnection,
};
