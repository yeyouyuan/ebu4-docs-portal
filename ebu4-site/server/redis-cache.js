/**
 * 公开 API / 静态 JSON 的 Redis 缓存层；未连接 Redis 时自动退化为直连数据源。
 * 键前缀 ebu4:cache: ，按 contentEpoch 分段，文档或扩展页变更时 bumpEpoch 即失效。
 */
'use strict';

const presenceStore = require('./presence-store');

const PREFIX = 'ebu4:cache:';
const DEFAULT_TTL_SEC = 3600;
const SEARCH_TTL_SEC = 120;

let contentEpoch = 0;
let hits = 0;
let misses = 0;

function bumpEpoch() {
  contentEpoch++;
}

function getEpoch() {
  return contentEpoch;
}

function getStats() {
  const total = hits + misses;
  return {
    hits,
    misses,
    totalRequests: total,
    hitRate: total ? Math.round((10000 * hits) / total) / 100 : 0,
    contentEpoch,
  };
}

function resetStats() {
  hits = 0;
  misses = 0;
}

async function getString(key) {
  const client = await presenceStore.getRedisClient();
  if (!client) return null;
  try {
    return await client.get(PREFIX + key);
  } catch (_) {
    return null;
  }
}

async function setString(key, value, ttlSec = DEFAULT_TTL_SEC) {
  const client = await presenceStore.getRedisClient();
  if (!client) return false;
  try {
    await client.set(PREFIX + key, value, { EX: ttlSec });
    return true;
  } catch (_) {
    return false;
  }
}

async function getJson(key) {
  const raw = await getString(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

async function setJson(key, value, ttlSec = DEFAULT_TTL_SEC) {
  try {
    return await setString(key, JSON.stringify(value), ttlSec);
  } catch (_) {
    return false;
  }
}

/** 读取 JSON 并计入 hits（未命中返回 null，不计数） */
async function getJsonTracked(key) {
  const v = await getJson(key);
  if (v != null) hits++;
  return v;
}

/** 写入 JSON 并计入 misses（表示本次为未命中后的回源） */
async function setJsonAfterMiss(key, value, ttlSec = DEFAULT_TTL_SEC) {
  misses++;
  return setJson(key, value, ttlSec);
}

async function getStringTracked(key) {
  const v = await getString(key);
  if (v != null) hits++;
  return v;
}

async function setStringAfterMiss(key, value, ttlSec = DEFAULT_TTL_SEC) {
  misses++;
  return setString(key, value, ttlSec);
}

async function getOrSetJson(key, ttlSec, buildFn) {
  const cached = await getJson(key);
  if (cached != null) {
    hits++;
    return { value: cached, hit: true };
  }
  misses++;
  const value = await buildFn();
  await setJson(key, value, ttlSec);
  return { value, hit: false };
}

function cacheHeader(res, hit) {
  try {
    res.setHeader('X-EBU4-Cache', hit ? 'hit' : 'miss');
  } catch (_) {}
}

module.exports = {
  bumpEpoch,
  getEpoch,
  getStats,
  resetStats,
  getJson,
  setJson,
  getJsonTracked,
  setJsonAfterMiss,
  getString,
  setString,
  getStringTracked,
  setStringAfterMiss,
  getOrSetJson,
  cacheHeader,
  DEFAULT_TTL_SEC,
  SEARCH_TTL_SEC,
};
