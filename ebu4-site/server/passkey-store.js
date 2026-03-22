/**
 * 后台用户通行密钥（WebAuthn）：SQLite 表 admin_passkeys；文件模式 data/admin-passkeys.json
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'admin-passkeys.json');

let siteDatabase = null;

function nowIso() {
  return new Date().toISOString();
}

function init(ctx) {
  siteDatabase = ctx.siteDatabase;
}

function readFileData() {
  if (!fs.existsSync(FILE)) return { nextId: 1, rows: [] };
  try {
    const j = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
    if (!j || !Array.isArray(j.rows)) return { nextId: 1, rows: [] };
    if (typeof j.nextId !== 'number') j.nextId = Math.max(0, ...j.rows.map((r) => r.id || 0)) + 1;
    return j;
  } catch (_) {
    return { nextId: 1, rows: [] };
  }
}

function writeFileData(data) {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, FILE);
}

/**
 * @returns {{ id: string, transports?: string[] }[]}
 */
function listExcludeDescriptors(userId) {
  const uid = parseInt(userId, 10);
  if (!Number.isFinite(uid)) return [];
  if (siteDatabase && siteDatabase.isSiteSqlite()) {
    const db = siteDatabase.getDb();
    if (!db) return [];
    const rows = db
      .prepare(
        `SELECT credential_id AS credentialId, transports FROM admin_passkeys WHERE user_id = ?`
      )
      .all(uid);
    return rows.map((r) => {
      let transports = [];
      try {
        transports = JSON.parse(r.transports || '[]');
      } catch (_) {}
      return { id: r.credentialId, transports: Array.isArray(transports) ? transports : [] };
    });
  }
  const data = readFileData();
  return data.rows
    .filter((r) => r.user_id === uid)
    .map((r) => {
      let transports = [];
      try {
        transports = JSON.parse(r.transports || '[]');
      } catch (_) {}
      return { id: r.credential_id, transports: Array.isArray(transports) ? transports : [] };
    });
}

/**
 * @returns {import('@simplewebauthn/types').WebAuthnCredential | null}
 */
function findAuthenticator(credentialIdB64Url) {
  const id = String(credentialIdB64Url || '').trim();
  if (!id) return null;
  if (siteDatabase && siteDatabase.isSiteSqlite()) {
    const db = siteDatabase.getDb();
    if (!db) return null;
    const row = db
      .prepare(
        `SELECT id, user_id, credential_id, public_key, counter, transports FROM admin_passkeys WHERE credential_id = ?`
      )
      .get(id);
    if (!row) return null;
    let transports;
    try {
      transports = JSON.parse(row.transports || '[]');
    } catch (_) {
      transports = [];
    }
    return {
      id: row.credential_id,
      publicKey: new Uint8Array(row.public_key),
      counter: row.counter | 0,
      transports: Array.isArray(transports) ? transports : undefined,
    };
  }
  const data = readFileData();
  const row = data.rows.find((r) => r.credential_id === id);
  if (!row) return null;
  let transports;
  try {
    transports = JSON.parse(row.transports || '[]');
  } catch (_) {
    transports = [];
  }
  const pk = Buffer.from(String(row.public_key_b64 || ''), 'base64');
  return {
    id: row.credential_id,
    publicKey: new Uint8Array(pk),
    counter: row.counter | 0,
    transports: Array.isArray(transports) ? transports : undefined,
  };
}

function findRowMetaByCredentialId(credentialIdB64Url) {
  const id = String(credentialIdB64Url || '').trim();
  if (!id) return null;
  if (siteDatabase && siteDatabase.isSiteSqlite()) {
    const db = siteDatabase.getDb();
    if (!db) return null;
    return db
      .prepare(`SELECT id, user_id, credential_id, counter FROM admin_passkeys WHERE credential_id = ?`)
      .get(id);
  }
  const data = readFileData();
  const row = data.rows.find((r) => r.credential_id === id);
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    credential_id: row.credential_id,
    counter: row.counter,
  };
}

function insertPasskey({ userId, credentialId, publicKey, counter, transports, label }) {
  const uid = parseInt(userId, 10);
  if (!Number.isFinite(uid)) throw new Error('无效用户');
  const cid = String(credentialId || '').trim();
  if (!cid) throw new Error('无效凭证');
  const pk = publicKey instanceof Buffer ? publicKey : Buffer.from(publicKey);
  const tr = JSON.stringify(Array.isArray(transports) ? transports : []);
  const lab = String(label || '').slice(0, 120) || '通行密钥';
  const t = nowIso();

  if (siteDatabase && siteDatabase.isSiteSqlite()) {
    const db = siteDatabase.getDb();
    if (!db) throw new Error('数据库未就绪');
    const info = db
      .prepare(
        `INSERT INTO admin_passkeys (user_id, credential_id, public_key, counter, transports, label, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(uid, cid, pk, counter | 0, tr, lab, t);
    return Number(info.lastInsertRowid);
  }
  const data = readFileData();
  const nid = data.nextId++;
  data.rows.push({
    id: nid,
    user_id: uid,
    credential_id: cid,
    public_key_b64: pk.toString('base64'),
    counter: counter | 0,
    transports: tr,
    label: lab,
    created_at: t,
  });
  writeFileData(data);
  return nid;
}

function updateCounter(tablePk, newCounter) {
  const n = parseInt(newCounter, 10);
  if (!Number.isFinite(n)) return;
  const id = parseInt(tablePk, 10);
  if (!Number.isFinite(id)) return;
  if (siteDatabase && siteDatabase.isSiteSqlite()) {
    const db = siteDatabase.getDb();
    if (!db) return;
    db.prepare(`UPDATE admin_passkeys SET counter = ? WHERE id = ?`).run(n, id);
    return;
  }
  const data = readFileData();
  const row = data.rows.find((r) => r.id === id);
  if (row) {
    row.counter = n;
    writeFileData(data);
  }
}

function listPublicByUserId(userId) {
  const uid = parseInt(userId, 10);
  if (!Number.isFinite(uid)) return [];
  if (siteDatabase && siteDatabase.isSiteSqlite()) {
    const db = siteDatabase.getDb();
    if (!db) return [];
    return db
      .prepare(
        `SELECT id, label, created_at AS createdAt FROM admin_passkeys WHERE user_id = ? ORDER BY id ASC`
      )
      .all(uid);
  }
  const data = readFileData();
  return data.rows
    .filter((r) => r.user_id === uid)
    .map((r) => ({ id: r.id, label: r.label, createdAt: r.created_at }))
    .sort((a, b) => a.id - b.id);
}

function deleteByPk(pkId) {
  const id = parseInt(pkId, 10);
  if (!Number.isFinite(id)) throw new Error('无效 id');
  if (siteDatabase && siteDatabase.isSiteSqlite()) {
    const db = siteDatabase.getDb();
    if (!db) throw new Error('数据库未就绪');
    const r = db.prepare(`DELETE FROM admin_passkeys WHERE id = ?`).run(id);
    if (r.changes === 0) throw new Error('记录不存在');
    return;
  }
  const data = readFileData();
  const before = data.rows.length;
  data.rows = data.rows.filter((r) => r.id !== id);
  if (data.rows.length === before) throw new Error('记录不存在');
  writeFileData(data);
}

function deleteByUserId(userId) {
  const uid = parseInt(userId, 10);
  if (!Number.isFinite(uid)) return;
  if (siteDatabase && siteDatabase.isSiteSqlite()) {
    const db = siteDatabase.getDb();
    if (!db) return;
    db.prepare(`DELETE FROM admin_passkeys WHERE user_id = ?`).run(uid);
    return;
  }
  const data = readFileData();
  data.rows = data.rows.filter((r) => r.user_id !== uid);
  writeFileData(data);
}

function countByUserId(userId) {
  const uid = parseInt(userId, 10);
  if (!Number.isFinite(uid)) return 0;
  if (siteDatabase && siteDatabase.isSiteSqlite()) {
    const db = siteDatabase.getDb();
    if (!db) return 0;
    const row = db.prepare(`SELECT COUNT(*) AS c FROM admin_passkeys WHERE user_id = ?`).get(uid);
    return row ? row.c : 0;
  }
  const data = readFileData();
  return data.rows.filter((r) => r.user_id === uid).length;
}

module.exports = {
  init,
  listExcludeDescriptors,
  findAuthenticator,
  findRowMetaByCredentialId,
  insertPasskey,
  updateCounter,
  listPublicByUserId,
  deleteByPk,
  deleteByUserId,
  countByUserId,
};
