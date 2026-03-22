/**
 * 多用户：SQLite（site.db）或 data/admin-users.json（文件存储模式）
 */
const fs = require('fs');
const path = require('path');
const { hashPassword, verifyPassword } = require('./admin-auth-password');
const roleProfilesStore = require('./role-profiles-store');

const JSON_PATH = path.join(__dirname, '..', 'data', 'admin-users.json');

let siteDatabase = null;
let getAdminPassword = () => '';

function nowIso() {
  return new Date().toISOString();
}

function readJsonFile() {
  if (!fs.existsSync(JSON_PATH)) return { users: [], nextId: 1 };
  try {
    const j = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));
    if (!j || !Array.isArray(j.users)) return { users: [], nextId: 1 };
    if (typeof j.nextId !== 'number') j.nextId = Math.max(0, ...j.users.map((u) => u.id || 0)) + 1;
    return j;
  } catch (_) {
    return { users: [], nextId: 1 };
  }
}

function writeJsonFile(data) {
  const dir = path.dirname(JSON_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = JSON_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, JSON_PATH);
}

function rowPublic(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    disabled: !!row.disabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function bootstrap() {
  const pwd = getAdminPassword();
  if (!pwd || pwd.length < 4) {
    console.warn(
      '[admin-users] 请设置环境变量 ADMIN_PASSWORD（至少 4 字符）以创建首个管理员账户。'
    );
    return;
  }
  if (siteDatabase.isSiteSqlite()) {
    if (siteDatabase.adminUsersCount() > 0) return;
    const h = hashPassword(pwd);
    siteDatabase.adminUserInsert({ username: 'admin', passwordHash: h, role: 'admin' });
    console.log('[admin-users] 已创建首个管理员：admin（来自 ADMIN_PASSWORD）');
    return;
  }
  const data = readJsonFile();
  if (data.users.length > 0) return;
  const t = nowIso();
  data.users.push({
    id: 1,
    username: 'admin',
    password_hash: hashPassword(pwd),
    role: 'admin',
    disabled: false,
    created_at: t,
    updated_at: t,
  });
  data.nextId = 2;
  writeJsonFile(data);
  console.log('[admin-users] 已创建 data/admin-users.json 首个管理员：admin');
}

function authenticate(username, password) {
  const u = String(username || '').trim();
  const p = String(password || '');
  if (!p) return null;

  if (siteDatabase.isSiteSqlite()) {
    if (!u) return null;
    const row = siteDatabase.adminUserByUsername(u);
    if (!row || row.disabled) return null;
    if (!verifyPassword(p, row.password_hash)) return null;
    return { id: row.id, username: row.username, role: row.role };
  }

  const data = readJsonFile();
  if (!u) return null;
  const row = data.users.find((x) => String(x.username).toLowerCase() === u.toLowerCase());
  if (!row || row.disabled) return null;
  if (!verifyPassword(p, row.password_hash)) return null;
  return { id: row.id, username: row.username, role: row.role };
}

/** 仅密码（兼容旧版单密码登录）：仅当与 ADMIN_PASSWORD 一致时通过 */
function authenticateLegacyPasswordOnly(password) {
  const p = String(password || '');
  const env = getAdminPassword();
  if (!p || !env || p !== env) return null;
  if (siteDatabase.isSiteSqlite()) {
    const row = siteDatabase.adminUserByUsername('admin');
    if (row && !row.disabled && verifyPassword(p, row.password_hash)) {
      return { id: row.id, username: row.username, role: row.role };
    }
    if (siteDatabase.adminUsersCount() === 0) {
      return { id: 0, username: 'admin', role: 'admin', legacy: true };
    }
    return null;
  }
  const data = readJsonFile();
  const row = data.users.find((x) => String(x.username).toLowerCase() === 'admin');
  if (row && !row.disabled && verifyPassword(p, row.password_hash)) {
    return { id: row.id, username: row.username, role: row.role };
  }
  if (data.users.length === 0) {
    return { id: 0, username: 'admin', role: 'admin', legacy: true };
  }
  return null;
}

function listUsersPublic() {
  if (siteDatabase.isSiteSqlite()) {
    return siteDatabase.adminUsersList().map((r) => rowPublic(r));
  }
  const data = readJsonFile();
  return data.users.map((r) =>
    rowPublic({
      id: r.id,
      username: r.username,
      role: r.role,
      disabled: r.disabled ? 1 : 0,
      created_at: r.created_at,
      updated_at: r.updated_at,
    })
  );
}

function assertAssignableRole(role) {
  const id = String(role || '').trim();
  if (!roleProfilesStore.isValidRoleId(id)) throw new Error('无效角色标识');
  if (!roleProfilesStore.getRoleProfile(id)) throw new Error('角色不存在，请先在「角色管理」中配置');
  return id;
}

function createUser({ username, password, role }) {
  const u = String(username || '').trim();
  const p = String(password || '');
  if (!u || u.length < 2) throw new Error('用户名至少 2 个字符');
  if (!p || p.length < 8) throw new Error('密码至少 8 个字符');
  const r = assertAssignableRole(role || 'editor');
  const h = hashPassword(p);
  if (siteDatabase.isSiteSqlite()) {
    if (siteDatabase.adminUserByUsername(u)) throw new Error('用户名已存在');
    const id = Number(siteDatabase.adminUserInsert({ username: u, passwordHash: h, role: r }));
    return { id, username: u, role: r };
  }
  const data = readJsonFile();
  if (data.users.some((x) => String(x.username).toLowerCase() === u.toLowerCase())) {
    throw new Error('用户名已存在');
  }
  const id = data.nextId++;
  const t = nowIso();
  data.users.push({
    id,
    username: u,
    password_hash: h,
    role: r,
    disabled: false,
    created_at: t,
    updated_at: t,
  });
  writeJsonFile(data);
  return { id, username: u, role: r };
}

function updateUser(id, patch) {
  const { password, role, disabled } = patch || {};
  const n = parseInt(id, 10);
  if (!Number.isFinite(n)) throw new Error('无效 id');
  if (siteDatabase.isSiteSqlite()) {
    const dbPatch = {};
    if (password !== undefined && password !== null && String(password).length > 0) {
      const p = String(password);
      if (p.length < 8) throw new Error('密码至少 8 个字符');
      dbPatch.passwordHash = hashPassword(p);
    }
    if (role !== undefined) dbPatch.role = assertAssignableRole(role);
    if (disabled !== undefined) dbPatch.disabled = !!disabled;
    siteDatabase.adminUserUpdate(n, dbPatch);
    return;
  }
  const data = readJsonFile();
  const idx = data.users.findIndex((x) => x.id === n);
  if (idx === -1) throw new Error('用户不存在');
  const row = data.users[idx];
  if (password !== undefined && password !== null && String(password).length > 0) {
    const p = String(password);
    if (p.length < 8) throw new Error('密码至少 8 个字符');
    row.password_hash = hashPassword(p);
  }
  if (role !== undefined) row.role = assertAssignableRole(role);
  if (disabled !== undefined) row.disabled = !!disabled;
  row.updated_at = nowIso();
  writeJsonFile(data);
}

function deleteUser(id) {
  const n = parseInt(id, 10);
  if (!Number.isFinite(n)) throw new Error('无效 id');
  try {
    const passkeyStore = require('./passkey-store');
    passkeyStore.deleteByUserId(n);
  } catch (_) {}
  if (siteDatabase.isSiteSqlite()) {
    siteDatabase.adminUserDelete(n);
    return;
  }
  const data = readJsonFile();
  data.users = data.users.filter((x) => x.id !== n);
  writeJsonFile(data);
}

function countUsersWithRole(role) {
  const r = String(role || '').trim();
  if (!r) return 0;
  if (siteDatabase.isSiteSqlite()) {
    return siteDatabase.adminUsersCountByRole(r);
  }
  const data = readJsonFile();
  return data.users.filter((x) => String(x.role) === r).length;
}

function countAdmins() {
  if (siteDatabase.isSiteSqlite()) {
    return siteDatabase.adminUsersAdminCount();
  }
  const data = readJsonFile();
  return data.users.filter((x) => x.role === 'admin' && !x.disabled).length;
}

function getUserById(id) {
  const n = parseInt(id, 10);
  if (!Number.isFinite(n)) return null;
  if (siteDatabase.isSiteSqlite()) {
    return siteDatabase.adminUserById(n);
  }
  const data = readJsonFile();
  return data.users.find((x) => x.id === n) || null;
}

/** 与 listUsersPublic 单项结构一致（用于登录 / WebAuthn 查找） */
function findUserByUsername(username) {
  const u = String(username || '').trim();
  if (!u) return null;
  if (siteDatabase.isSiteSqlite()) {
    const row = siteDatabase.adminUserByUsername(u);
    return row ? rowPublic(row) : null;
  }
  const data = readJsonFile();
  const row = data.users.find((x) => String(x.username).toLowerCase() === u.toLowerCase());
  return row
    ? rowPublic({
        id: row.id,
        username: row.username,
        role: row.role,
        disabled: row.disabled ? 1 : 0,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })
    : null;
}

function init(ctx) {
  siteDatabase = ctx.siteDatabase;
  getAdminPassword = ctx.getAdminPassword || getAdminPassword;
  bootstrap();
}

module.exports = {
  init,
  authenticate,
  authenticateLegacyPasswordOnly,
  listUsersPublic,
  countUsersWithRole,
  createUser,
  updateUser,
  deleteUser,
  countAdmins,
  getUserById,
  findUserByUsername,
};
