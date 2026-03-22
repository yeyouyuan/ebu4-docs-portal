/**
 * 邀请注册码：SQLite 存 site_kv；文件模式存 public/data/invite-codes.json
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KV_KEY = 'invite_codes_v1';
const FILE = path.join(__dirname, '..', 'public', 'data', 'invite-codes.json');

function readInvites(siteDatabase) {
  try {
    if (siteDatabase && siteDatabase.isSiteSqlite()) {
      const raw = siteDatabase.getKv(KV_KEY);
      if (raw) return JSON.parse(raw);
    } else if (fs.existsSync(FILE)) {
      return JSON.parse(fs.readFileSync(FILE, 'utf-8'));
    }
  } catch (_) {}
  return { codes: [] };
}

function writeInvites(siteDatabase, data) {
  const out = JSON.stringify(data, null, 2);
  if (siteDatabase && siteDatabase.isSiteSqlite()) {
    siteDatabase.setKv(KV_KEY, out);
  } else {
    const dir = path.dirname(FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(FILE, out, 'utf-8');
  }
}

function listCodes(siteDatabase) {
  return readInvites(siteDatabase).codes || [];
}

function createInvite(siteDatabase, opts) {
  const maxUses = Math.max(1, Math.min(1000, parseInt(opts.maxUses, 10) || 1));
  const expiresDays = Math.max(1, Math.min(3650, parseInt(opts.expiresDays, 10) || 30));
  const defaultRole = String(opts.defaultRole || 'editor').trim() || 'editor';
  const code = crypto.randomBytes(10).toString('hex');
  const exp = Date.now() + expiresDays * 86400000;
  const data = readInvites(siteDatabase);
  data.codes = data.codes || [];
  data.codes.push({ code, maxUses, used: 0, exp, defaultRole, createdAt: Date.now() });
  writeInvites(siteDatabase, data);
  return { code, maxUses, exp, defaultRole };
}

function deleteInvite(siteDatabase, code) {
  const data = readInvites(siteDatabase);
  const before = (data.codes || []).length;
  data.codes = (data.codes || []).filter((c) => c.code !== code);
  if (data.codes.length === before) return false;
  writeInvites(siteDatabase, data);
  return true;
}

/**
 * 校验并占用一次名额。
 * 成功：{ ok: true, defaultRole }
 * 失败：{ ok: false, reason: 'empty'|'not_found'|'expired'|'exhausted' }
 */
function tryConsumeInvite(siteDatabase, code) {
  const rawCode = String(code || '').trim();
  if (!rawCode) return { ok: false, reason: 'empty' };
  const data = readInvites(siteDatabase);
  const codes = data.codes || [];
  const idx = codes.findIndex((c) => c.code === rawCode);
  if (idx === -1) return { ok: false, reason: 'not_found' };
  const c = codes[idx];
  if (c.exp < Date.now()) return { ok: false, reason: 'expired' };
  if (c.used >= c.maxUses) return { ok: false, reason: 'exhausted' };
  c.used = (c.used || 0) + 1;
  codes[idx] = c;
  data.codes = codes;
  writeInvites(siteDatabase, data);
  return { ok: true, defaultRole: c.defaultRole || 'editor' };
}

/** 校验并占用一次名额；成功返回 { defaultRole }，失败返回 null（兼容旧逻辑） */
function validateAndConsume(siteDatabase, code) {
  const r = tryConsumeInvite(siteDatabase, code);
  return r.ok ? { defaultRole: r.defaultRole } : null;
}

/**
 * 仅检查邀请码是否仍可用，不消耗次数。
 * 成功：{ ok: true, defaultRole }
 * 失败：{ ok: false, reason: 'empty'|'not_found'|'expired'|'exhausted' }
 */
function peekInvite(siteDatabase, code) {
  const rawCode = String(code || '').trim();
  if (!rawCode) return { ok: false, reason: 'empty' };
  const data = readInvites(siteDatabase);
  const codes = data.codes || [];
  const c = codes.find((x) => x.code === rawCode);
  if (!c) return { ok: false, reason: 'not_found' };
  if (c.exp < Date.now()) return { ok: false, reason: 'expired' };
  if (c.used >= c.maxUses) return { ok: false, reason: 'exhausted' };
  return { ok: true, defaultRole: c.defaultRole || 'editor' };
}

module.exports = {
  listCodes,
  createInvite,
  deleteInvite,
  validateAndConsume,
  tryConsumeInvite,
  peekInvite,
};
