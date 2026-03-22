/**
 * 后台角色配置：模块权限、数据范围、安全等级与说明；支持动态新增角色。
 * 存储：site_kv.role_profiles 或 data/role-profiles.json
 */
const fs = require('fs');
const path = require('path');

const ROLE_PROFILES_KV = 'role_profiles';
const SECURITY_LEVELS = ['public', 'guest', 'internal', 'important', 'core', 'restricted'];

/** @type {import('./site-database')} */
let siteDatabase = null;
let roleProfilesPath = path.join(__dirname, '..', 'data', 'role-profiles.json');
/** @type {{ editorModuleAccessPath?: string, roleDataViewPath?: string, roleSecurityDocPath?: string } | null} */
let legacyPaths = null;

function init(ctx) {
  siteDatabase = ctx.siteDatabase;
  if (ctx.roleProfilesPath) roleProfilesPath = ctx.roleProfilesPath;
  legacyPaths = ctx.legacyPaths || null;
}

const DATA_VIEW_KEYS = ['mainDoc', 'tools', 'landing', 'extraPages', 'images', 'stats'];

function defaultDataViews() {
  return DATA_VIEW_KEYS.reduce((acc, k) => {
    acc[k] = true;
    return acc;
  }, {});
}

function normalizeModuleAccess(raw, defaults) {
  const base = { siteSettings: false, seo: false, audit: false, inviteRegister: false };
  Object.assign(base, defaults);
  if (!raw || typeof raw !== 'object') return base;
  ['siteSettings', 'seo', 'audit', 'inviteRegister'].forEach((k) => {
    if (raw[k] === true) base[k] = true;
    else if (raw[k] === false) base[k] = false;
  });
  return base;
}

function normalizeDataViews(raw) {
  const def = defaultDataViews();
  if (!raw || typeof raw !== 'object') return { ...def };
  const o = { ...def };
  DATA_VIEW_KEYS.forEach((k) => {
    o[k] = raw[k] !== false;
  });
  return o;
}

function defaultStore() {
  return {
    order: ['admin', 'editor'],
    roles: {
      admin: {
        label: '管理员',
        system: true,
        moduleAccess: normalizeModuleAccess(null, {
          siteSettings: true,
          seo: true,
          audit: true,
          inviteRegister: true,
        }),
        dataViews: defaultDataViews(),
        securityLevel: 'internal',
        securityNote: '',
      },
      editor: {
        label: '编辑',
        system: true,
        moduleAccess: normalizeModuleAccess(null, {
          siteSettings: false,
          seo: false,
          audit: false,
          inviteRegister: false,
        }),
        dataViews: defaultDataViews(),
        securityLevel: 'internal',
        securityNote: '',
      },
    },
  };
}

function normalizeRoleEntry(roleId, raw, defaults) {
  const label =
    raw && typeof raw.label === 'string' && raw.label.trim()
      ? raw.label.trim()
      : defaults.label || roleId;
  const system = !!(raw && raw.system);
  const moduleAccess = normalizeModuleAccess(
    raw && raw.moduleAccess,
    defaults.moduleAccess ||
      normalizeModuleAccess(null, {
        siteSettings: false,
        seo: false,
        audit: false,
        inviteRegister: false,
      })
  );
  const dataViews = normalizeDataViews(raw && raw.dataViews);
  let securityLevel = 'internal';
  if (
    raw &&
    typeof raw.securityLevel === 'string' &&
    SECURITY_LEVELS.includes(raw.securityLevel)
  ) {
    securityLevel = raw.securityLevel;
  }
  const securityNote = raw && raw.securityNote != null ? String(raw.securityNote) : '';
  return { label, system, moduleAccess, dataViews, securityLevel, securityNote };
}

function normalizeFullStore(raw) {
  const base = defaultStore();
  if (!raw || typeof raw !== 'object') return base;
  const order = Array.isArray(raw.order) ? raw.order.filter((x) => typeof x === 'string') : [];
  const roles = {};
  const srcRoles = raw.roles && typeof raw.roles === 'object' ? raw.roles : {};
  const keys = new Set([...Object.keys(base.roles), ...Object.keys(srcRoles)]);
  keys.forEach((id) => {
    if (!isValidRoleId(id)) return;
    if (id === '__proto__' || id === 'constructor' || id === 'prototype') return;
    const def = base.roles[id] || {
      label: id,
      system: false,
      moduleAccess: normalizeModuleAccess(null, {
        siteSettings: false,
        seo: false,
        audit: false,
        inviteRegister: false,
      }),
      dataViews: defaultDataViews(),
      securityLevel: 'internal',
      securityNote: '',
    };
    roles[id] = normalizeRoleEntry(id, srcRoles[id], def);
    if (id === 'admin' || id === 'editor') roles[id].system = true;
  });
  let ord = order.length ? order.filter((id) => roles[id]) : Object.keys(roles);
  ['admin', 'editor'].forEach((id) => {
    if (roles[id] && !ord.includes(id)) ord.unshift(id);
  });
  ord = [...new Set(ord)];
  Object.keys(roles).forEach((id) => {
    if (!ord.includes(id)) ord.push(id);
  });
  return { order: ord, roles };
}

function readRawFromDisk() {
  if (siteDatabase && siteDatabase.isSiteSqlite()) {
    const raw = siteDatabase.getKv(ROLE_PROFILES_KV);
    if (raw) return JSON.parse(raw);
  } else if (fs.existsSync(roleProfilesPath)) {
    return JSON.parse(fs.readFileSync(roleProfilesPath, 'utf-8'));
  }
  return null;
}

function writeRaw(obj) {
  const out = JSON.stringify(obj);
  if (siteDatabase && siteDatabase.isSiteSqlite()) {
    siteDatabase.setKv(ROLE_PROFILES_KV, out);
  } else {
    const dir = path.dirname(roleProfilesPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(roleProfilesPath, out, 'utf-8');
  }
}

function readLegacyEditorModuleAccess(legacyPath) {
  try {
    if (siteDatabase && siteDatabase.isSiteSqlite()) {
      const raw = siteDatabase.getKv('editor_module_access');
      if (raw) {
        const j = JSON.parse(raw);
        return normalizeModuleAccess(j, { siteSettings: false, seo: false, audit: false });
      }
    } else if (legacyPath && fs.existsSync(legacyPath)) {
      const j = JSON.parse(fs.readFileSync(legacyPath, 'utf-8'));
      return normalizeModuleAccess(j, { siteSettings: false, seo: false, audit: false });
    }
  } catch (_) {}
  return normalizeModuleAccess(null, {
    siteSettings: false,
    seo: false,
    audit: false,
    inviteRegister: false,
  });
}

function readLegacyRoleDataView(legacyPath) {
  try {
    if (siteDatabase && siteDatabase.isSiteSqlite()) {
      const raw = siteDatabase.getKv('role_data_view');
      if (raw) {
        const j = JSON.parse(raw);
        const ed = j.editor && typeof j.editor === 'object' ? j.editor : {};
        return normalizeDataViews(ed);
      }
    } else if (legacyPath && fs.existsSync(legacyPath)) {
      const j = JSON.parse(fs.readFileSync(legacyPath, 'utf-8'));
      const ed = j.editor && typeof j.editor === 'object' ? j.editor : {};
      return normalizeDataViews(ed);
    }
  } catch (_) {}
  return defaultDataViews();
}

function readLegacySecurityDoc(securityFile) {
  try {
    if (siteDatabase && siteDatabase.isSiteSqlite()) {
      const raw = siteDatabase.getKv('role_security_doc');
      if (raw != null) return String(raw);
    } else if (securityFile && fs.existsSync(securityFile)) {
      return fs.readFileSync(securityFile, 'utf-8');
    }
  } catch (_) {}
  return '';
}

function migrateFromLegacy(opts) {
  const editorMods = readLegacyEditorModuleAccess(opts && opts.editorModuleAccessPath);
  const editorDv = readLegacyRoleDataView(opts && opts.roleDataViewPath);
  const sec = readLegacySecurityDoc(opts && opts.roleSecurityDocPath);
  const base = defaultStore();
  base.roles.editor.moduleAccess = editorMods;
  base.roles.editor.dataViews = editorDv;
  base.roles.editor.securityNote = sec;
  return normalizeFullStore(base);
}

function readStore() {
  try {
    const raw = readRawFromDisk();
    if (raw) return normalizeFullStore(raw);
  } catch (_) {}
  const migrated = migrateFromLegacy(legacyPaths || {});
  writeRaw(migrated);
  return migrated;
}

function writeStore(store) {
  const next = normalizeFullStore(store);
  writeRaw(next);
  return next;
}

function isValidRoleId(s) {
  const id = String(s || '').trim();
  if (id.length < 1 || id.length > 64) return false;
  return /^[a-z][a-z0-9_-]*$/.test(id);
}

function getRoleProfile(roleId) {
  const st = readStore();
  return st.roles[roleId] || null;
}

function getModuleAccessForRole(roleId) {
  const p = getRoleProfile(roleId);
  if (p) return { ...p.moduleAccess };
  return normalizeModuleAccess(null, {
    siteSettings: false,
    seo: false,
    audit: false,
    inviteRegister: false,
  });
}

function getDataViewsForRole(roleId) {
  const p = getRoleProfile(roleId);
  if (p) return { ...p.dataViews };
  return defaultDataViews();
}

function getRoleMetaForRole(roleId) {
  const p = getRoleProfile(roleId);
  if (!p) {
    return { securityLevel: 'internal', securityNote: '', label: roleId };
  }
  return {
    label: p.label,
    securityLevel: p.securityLevel,
    securityNote: p.securityNote,
  };
}

function listRolesBrief() {
  const st = readStore();
  return st.order
    .filter((id) => st.roles[id])
    .map((id) => ({
      id,
      label: st.roles[id].label || id,
      system: !!st.roles[id].system,
    }));
}

function createRole(roleId, { label } = {}) {
  const id = String(roleId || '').trim();
  if (!isValidRoleId(id)) throw new Error('角色标识须为小写字母开头，仅含字母数字、下划线、连字符');
  if (id === 'admin' || id === 'editor') throw new Error('内置角色请使用界面编辑，勿重复创建');
  const st = readStore();
  if (st.roles[id]) throw new Error('角色已存在');
  const template = st.roles.editor || defaultStore().roles.editor;
  st.roles[id] = normalizeRoleEntry(
    id,
    {
      label: label || id,
      system: false,
      moduleAccess: template.moduleAccess,
      dataViews: { ...template.dataViews },
      securityLevel: template.securityLevel,
      securityNote: '',
    },
    { label: id, moduleAccess: template.moduleAccess }
  );
  st.roles[id].system = false;
  if (!st.order.includes(id)) st.order.push(id);
  return writeStore(st);
}

function updateRole(roleId, patch) {
  const id = String(roleId || '').trim();
  const st = readStore();
  if (!st.roles[id]) throw new Error('角色不存在');
  const cur = st.roles[id];
  if (patch.label != null) cur.label = String(patch.label).trim() || cur.label;
  if (patch.moduleAccess && typeof patch.moduleAccess === 'object') {
    cur.moduleAccess = normalizeModuleAccess(patch.moduleAccess, cur.moduleAccess);
  }
  if (patch.dataViews && typeof patch.dataViews === 'object') {
    cur.dataViews = normalizeDataViews({ ...cur.dataViews, ...patch.dataViews });
  }
  if (patch.securityLevel != null) {
    const s = String(patch.securityLevel);
    if (SECURITY_LEVELS.includes(s)) cur.securityLevel = s;
  }
  if (patch.securityNote != null) cur.securityNote = String(patch.securityNote);
  st.roles[id] = normalizeRoleEntry(id, cur, cur);
  if (id === 'admin' || id === 'editor') st.roles[id].system = true;
  return writeStore(st);
}

function deleteRole(roleId, countUsersWithRole) {
  const id = String(roleId || '').trim();
  const st = readStore();
  if (!st.roles[id]) throw new Error('角色不存在');
  if (st.roles[id].system) throw new Error('系统内置角色不可删除');
  const n = typeof countUsersWithRole === 'function' ? countUsersWithRole(id) : 0;
  if (n > 0) throw new Error('仍有账号使用该角色，无法删除');
  delete st.roles[id];
  st.order = st.order.filter((x) => x !== id);
  return writeStore(st);
}

function isSystemRoleId(roleId) {
  const p = getRoleProfile(roleId);
  return !!(p && p.system);
}

module.exports = {
  init,
  DATA_VIEW_KEYS,
  SECURITY_LEVELS,
  readStore,
  writeStore,
  migrateFromLegacy,
  isValidRoleId,
  getRoleProfile,
  getModuleAccessForRole,
  getDataViewsForRole,
  getRoleMetaForRole,
  listRolesBrief,
  createRole,
  updateRole,
  deleteRole,
  isSystemRoleId,
  defaultDataViews,
  normalizeModuleAccess,
};
