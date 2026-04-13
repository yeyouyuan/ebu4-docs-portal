/**
 * 后台管理页：主题、背景 Canvas、与文档站 app.js 一致的外观逻辑
 */
const THEME_STORAGE_KEY = 'ebu4-theme';

function normalizeStoredTheme(raw) {
  const legacy = new Set(['default', 'ocean', 'rose', 'emerald', 'violet']);
  if (legacy.has(raw)) return 'dark';
  if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  return 'dark';
}

function applyTheme(name) {
  const allowed = new Set(['light', 'dark', 'system']);
  const t = allowed.has(name) ? name : 'dark';
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, t);
  } catch (_) {}
  window.dispatchEvent(new Event('ebu4-theme'));
  document.querySelectorAll('.theme-swatch').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.theme === t);
  });
}

function initThemePickerRoot(rootId) {
  const root = document.getElementById(rootId);
  if (!root) return;
  const trigger = root.querySelector('.theme-trigger');
  const panel = root.querySelector('.theme-panel');
  if (!trigger || !panel) return;

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !root.classList.contains('open');
    root.classList.toggle('open', open);
    panel.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
  });

  root.querySelectorAll('.theme-swatch').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.theme);
      root.classList.remove('open');
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    });
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.theme-picker')) {
      root.classList.remove('open');
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && root.classList.contains('open')) {
      root.classList.remove('open');
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    }
  });
}

function initThemePicker() {
  let saved = 'dark';
  try {
    saved = normalizeStoredTheme(localStorage.getItem(THEME_STORAGE_KEY) || 'dark');
  } catch (_) {}
  applyTheme(saved);

  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', () => {
    if (document.documentElement.dataset.theme === 'system') {
      window.dispatchEvent(new Event('ebu4-theme'));
    }
  });

  initThemePickerRoot('themePicker');
  initThemePickerRoot('themePickerDash');
}

function initBgCanvas() {
  const canvas = document.getElementById('bgCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w;
  let h;
  let pRgb = '79,91,213';
  let aRgb = '212,168,83';
  const particles = [];
  const PARTICLE_COUNT = 30;

  function refreshThemeColors() {
    const s = getComputedStyle(document.documentElement);
    pRgb = s.getPropertyValue('--theme-rgb-p').trim() || '79,91,213';
    aRgb = s.getPropertyValue('--theme-rgb-a').trim() || '212,168,83';
  }
  refreshThemeColors();
  window.addEventListener('ebu4-theme', refreshThemeColors);

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 1.5 + 0.5,
      gold: Math.random() > 0.7
    });
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(' + pRgb + ',0.03)';
    ctx.lineWidth = 0.5;
    const step = 90;
    for (let x = 0; x < w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = w;
      if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = h;
      if (p.y > h) p.y = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.gold ? 'rgba(' + aRgb + ',0.2)' : 'rgba(' + pRgb + ',0.25)';
      ctx.fill();
    });

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 200) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = 'rgba(' + pRgb + ',' + 0.06 * (1 - dist / 200) + ')';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }

    requestAnimationFrame(draw);
  }
  draw();
}

function $(id) {
  return document.getElementById(id);
}

function inviteRegisterUrl(code) {
  return (
    window.location.origin + '/register?invite=' + encodeURIComponent(code != null ? String(code) : '')
  );
}

function copyTextToClipboard(text) {
  var t = String(text);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(t);
  }
  return new Promise(function (resolve, reject) {
    var ta = document.createElement('textarea');
    ta.value = t;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta);
    ta.select();
    try {
      if (document.execCommand('copy')) {
        document.body.removeChild(ta);
        resolve();
      } else {
        document.body.removeChild(ta);
        reject(new Error('copy'));
      }
    } catch (e) {
      try {
        document.body.removeChild(ta);
      } catch (_) {}
      reject(e);
    }
  });
}

function toastAdminDash(msg) {
  var el = $('adminToast');
  if (!el) return;
  el.textContent = msg;
  el.removeAttribute('hidden');
  el.classList.add('show');
  clearTimeout(toastAdminDash._t);
  toastAdminDash._t = setTimeout(function () {
    el.classList.remove('show');
    el.setAttribute('hidden', '');
  }, 2200);
}

/** 侧边菜单顺序：服务端保存；仅管理员可改。本地 key 作离线回退 */
var ADMIN_MENU_ORDER_KEY = 'ebu4-admin-menu-order';
var DEFAULT_ADMIN_MENU_TABS = ['dash', 'md', 'tools', 'landing', 'site', 'upgrade', 'seo', 'audit', 'users', 'roles', 'redis'];
/** 主导航 tab id → 名称（「菜单显示」本页不在此列表） */
var MENU_TAB_LABELS = {
  dash: '数据看板',
  md: '文档管理',
  tools: '工具导航',
  landing: '门户首页',
  site: '站点设置',
  seo: 'SEO 设置',
  audit: '操作日志',
  users: '用户管理',
  roles: '角色管理',
  redis: 'Redis',
  upgrade: '系统升级',
  menu: '菜单显示',
};
/** 管理员在「菜单显示」中停用的侧栏项 id → true */
window.__adminMenuDisabled = window.__adminMenuDisabled || {};
var suppressAdminMenuClickUntil = 0;

function readAdminMenuOrderLocalFallback() {
  try {
    var raw = localStorage.getItem(ADMIN_MENU_ORDER_KEY);
    if (!raw) return null;
    var arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    return arr.filter(function (id) {
      return typeof id === 'string';
    });
  } catch (e) {
    return null;
  }
}

function applyMenuOrderToNav(orderIds) {
  var nav = $('ryMenuNav');
  if (!nav) return;
  var base = orderIds && orderIds.length ? orderIds.slice() : DEFAULT_ADMIN_MENU_TABS.slice();
  var items = nav.querySelectorAll('.ry-menu-item[data-tab]');
  var map = {};
  items.forEach(function (btn) {
    map[btn.getAttribute('data-tab')] = btn;
  });
  var order = base;
  DEFAULT_ADMIN_MENU_TABS.forEach(function (id) {
    if (order.indexOf(id) === -1) order.push(id);
  });
  var seen = {};
  var deduped = [];
  order.forEach(function (id) {
    if (seen[id] || !map[id]) return;
    seen[id] = true;
    deduped.push(id);
  });
  DEFAULT_ADMIN_MENU_TABS.forEach(function (id) {
    if (!seen[id] && map[id]) deduped.push(id);
  });
  var frag = document.createDocumentFragment();
  deduped.forEach(function (id) {
    if (map[id]) frag.appendChild(map[id]);
  });
  nav.appendChild(frag);
}

function applyMenuDisabled(dis) {
  var d = dis && typeof dis === 'object' ? dis : {};
  document.querySelectorAll('.ry-menu-item[data-tab]').forEach(function (btn) {
    var id = btn.getAttribute('data-tab');
    if (!id) return;
    var off = d[id] === true;
    btn.classList.toggle('ry-menu-item--off', off);
  });
}

function collectMenuOrderIdsFromNav() {
  var nav = $('ryMenuNav');
  if (!nav) return [];
  var ids = [];
  nav.querySelectorAll('.ry-menu-item[data-tab]').forEach(function (btn) {
    if (btn.classList.contains('admin-hidden')) return;
    ids.push(btn.getAttribute('data-tab'));
  });
  return ids;
}

function getDragAfterElement(container, y) {
  var els = [].slice.call(container.querySelectorAll('.ry-menu-item[data-tab]:not(.ry-menu-dragging)'));
  return els.reduce(
    function (closest, child) {
      var box = child.getBoundingClientRect();
      var offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      }
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null }
  ).element;
}

function getDragAfterElementPanelList(container, y) {
  var els = [].slice.call(
    container.querySelectorAll('.menu-order-editor-row:not(.menu-order-panel-dragging)')
  );
  return els.reduce(
    function (closest, child) {
      var box = child.getBoundingClientRect();
      var offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      }
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null }
  ).element;
}

function updateMenuOrderFooterUi(isAdmin) {
  var hint = $('ryMenuHint');
  var resetBtn = $('btnResetAdminMenuOrder');
  if (hint) {
    hint.textContent = isAdmin
      ? '拖动菜单项调整顺序，保存后所有登录用户可见。'
      : '菜单顺序由管理员统一配置。';
  }
  if (resetBtn) {
    resetBtn.classList.toggle('admin-hidden', !isAdmin);
  }
}

function bindAdminMenuDrag(nav) {
  if (nav._adminMenuDragBound) return;
  nav._adminMenuDragBound = true;
  nav.addEventListener('dragover', function (e) {
    e.preventDefault();
    var dragging = nav.querySelector('.ry-menu-dragging');
    if (!dragging) return;
    e.dataTransfer.dropEffect = 'move';
    var after = getDragAfterElement(nav, e.clientY);
    if (after == null) nav.appendChild(dragging);
    else nav.insertBefore(dragging, after);
  });
  nav.addEventListener('drop', function (e) {
    e.preventDefault();
  });
}

async function persistAdminMenuOrderToServer() {
  var ids = collectMenuOrderIdsFromNav();
  if (!ids.length) return false;
  try {
    await api('/api/admin/menu-order', {
      method: 'PUT',
      body: JSON.stringify({
        order: ids,
        disabled: window.__adminMenuDisabled || {},
      }),
    });
    try {
      localStorage.removeItem(ADMIN_MENU_ORDER_KEY);
    } catch (e) {}
    renderMenuOrderPanel();
    return true;
  } catch (e) {
    alert('保存菜单顺序失败：' + (e.message || String(e)));
    return false;
  }
}

function bindMenuOrderPanelDragOnce() {
  var list = $('menuOrderEditorList');
  if (!list || list._menuPanelListDragBound) return;
  list._menuPanelListDragBound = true;
  list.addEventListener('dragover', function (e) {
    e.preventDefault();
    var dragging = list.querySelector('.menu-order-panel-dragging');
    if (!dragging) return;
    e.dataTransfer.dropEffect = 'move';
    var after = getDragAfterElementPanelList(list, e.clientY);
    if (after == null) list.appendChild(dragging);
    else list.insertBefore(dragging, after);
  });
  list.addEventListener('drop', function (e) {
    e.preventDefault();
  });
  var panel = $('panelMenu');
  if (panel && !panel._menuPanelDragPhaseBound) {
    panel._menuPanelDragPhaseBound = true;
    panel.addEventListener('dragstart', function (e) {
      var row = e.target.closest && e.target.closest('.menu-order-editor-row');
      if (!row || row.getAttribute('draggable') !== 'true') return;
      row.classList.add('menu-order-panel-dragging');
      e.dataTransfer.effectAllowed = 'move';
      try {
        e.dataTransfer.setData('text/plain', row.getAttribute('data-tab') || '');
      } catch (err) {}
    });
    panel.addEventListener('dragend', function (e) {
      var row = e.target.closest && e.target.closest('.menu-order-editor-row');
      if (row) row.classList.remove('menu-order-panel-dragging');
      if (!window.__adminUser || window.__adminUser.role !== 'admin') return;
      suppressAdminMenuClickUntil = Date.now() + 220;
      var ids = [];
      list.querySelectorAll('.menu-order-editor-row').forEach(function (li) {
        var tab = li.getAttribute('data-tab');
        if (tab) ids.push(tab);
      });
      if (ids.length) {
        applyMenuOrderToNav(ids);
        persistAdminMenuOrderToServer();
      }
    });
  }
}

function renderMenuOrderPanel() {
  var host = $('menuOrderEditorList');
  if (!host) return;
  var ids = collectMenuOrderIdsFromNav();
  var isAdmin = window.__adminUser && window.__adminUser.role === 'admin';
  var dis = window.__adminMenuDisabled || {};
  var n = ids.length;
  var html = ids
    .map(function (id, idx) {
      var label = MENU_TAB_LABELS[id] || id;
      var upDis = !isAdmin || idx === 0;
      var downDis = !isAdmin || idx === n - 1;
      var dragAttr = isAdmin ? ' draggable="true"' : ' draggable="false"';
      var shown = !dis[id];
      return (
        '<li class="menu-order-editor-row"' +
        dragAttr +
        ' data-tab="' +
        escapeHtml(id) +
        '">' +
        '<span class="menu-order-editor-grip" aria-hidden="true" title="拖动排序">⠿</span>' +
        '<span class="menu-order-editor-label">' +
        escapeHtml(label) +
        '</span>' +
        '<label class="menu-order-enable-lbl" title="在侧栏显示">' +
        '<input type="checkbox" class="menu-tab-enable" data-tab="' +
        escapeHtml(id) +
        '" ' +
        (shown ? 'checked' : '') +
        (isAdmin ? '' : ' disabled') +
        ' /> 显示</label>' +
        '<span class="menu-order-editor-actions">' +
        '<button type="button" class="de-btn de-btn-ghost menu-order-up" data-i="' +
        idx +
        '"' +
        (upDis ? ' disabled' : '') +
        '>上移</button>' +
        '<button type="button" class="de-btn de-btn-ghost menu-order-down" data-i="' +
        idx +
        '"' +
        (downDis ? ' disabled' : '') +
        '>下移</button>' +
        '</span></li>'
      );
    })
    .join('');
  host.innerHTML = html;
  if (!host._menuEnableBound) {
    host._menuEnableBound = true;
    host.addEventListener('change', function (e) {
      var inp = e.target && e.target.closest && e.target.closest('.menu-tab-enable');
      if (!inp || inp.disabled) return;
      var tid = inp.getAttribute('data-tab');
      if (!tid) return;
      if (!window.__adminMenuDisabled) window.__adminMenuDisabled = {};
      window.__adminMenuDisabled[tid] = !inp.checked;
      applyMenuDisabled(window.__adminMenuDisabled);
      if (window.__adminUser && window.__adminUser.role === 'admin') {
        persistAdminMenuOrderToServer();
      }
    });
  }
  bindMenuOrderPanelDragOnce();
  var s = $('btnSaveMenuOrderPanel');
  var r = $('btnResetMenuOrderPanel');
  if (s) {
    s.disabled = !isAdmin;
    s.classList.toggle('admin-hidden', !isAdmin);
  }
  if (r) {
    r.classList.toggle('admin-hidden', !isAdmin);
  }
  var menuStats = $('adminMenuHubStats');
  if (menuStats) {
    menuStats.innerHTML =
      '<div class="stat-card"><div class="stat-label">菜单项</div>' +
      '<div class="stat-value accent">' +
      n +
      '</div><div class="stat-sub">当前顺序项数</div></div>' +
      '<div class="stat-card"><div class="stat-label">可保存</div>' +
      '<div class="stat-value ' +
      (isAdmin ? 'green' : 'blue') +
      '">' +
      (isAdmin ? '是' : '否') +
      '</div><div class="stat-sub">需管理员会话</div></div>' +
      '<div class="stat-card"><div class="stat-label">持久化</div>' +
      '<div class="stat-value purple">order</div><div class="stat-sub">SQLite / JSON</div></div>' +
      '<div class="stat-card"><div class="stat-label">操作</div>' +
      '<div class="stat-value blue">⇅</div><div class="stat-sub">拖动行或上移下移</div></div>';
  }
}

function swapMenuOrderIndices(idx, delta) {
  if (!window.__adminUser || window.__adminUser.role !== 'admin') return;
  var ids = collectMenuOrderIdsFromNav();
  var j = idx + delta;
  if (j < 0 || j >= ids.length) return;
  var t = ids[idx];
  ids[idx] = ids[j];
  ids[j] = t;
  applyMenuOrderToNav(ids);
  renderMenuOrderPanel();
}

async function initAdminSidebarMenuOrderAndDrag() {
  var nav = $('ryMenuNav');
  if (!nav) return;
  var order = null;
  try {
    var d = await api('/api/admin/menu-order');
    if (d && Array.isArray(d.order) && d.order.length) order = d.order;
    if (d && d.disabled && typeof d.disabled === 'object') {
      window.__adminMenuDisabled = d.disabled;
      applyMenuDisabled(window.__adminMenuDisabled);
    }
  } catch (e) {}
  if (!order || !order.length) order = readAdminMenuOrderLocalFallback();
  if (!order || !order.length) order = DEFAULT_ADMIN_MENU_TABS.slice();
  applyMenuOrderToNav(order);
  applyMenuDisabled(window.__adminMenuDisabled || {});
  var isAdmin = window.__adminUser && window.__adminUser.role === 'admin';
  updateMenuOrderFooterUi(isAdmin);
  if (isAdmin) {
    bindAdminMenuDrag(nav);
    nav.querySelectorAll('.ry-menu-item[data-tab]').forEach(function (btn) {
      btn.setAttribute('draggable', 'true');
      btn.addEventListener('dragstart', function (e) {
        btn.classList.add('ry-menu-dragging');
        e.dataTransfer.effectAllowed = 'move';
        try {
          e.dataTransfer.setData('text/plain', btn.getAttribute('data-tab'));
        } catch (err) {}
      });
      btn.addEventListener('dragend', function () {
        btn.classList.remove('ry-menu-dragging');
        suppressAdminMenuClickUntil = Date.now() + 220;
        persistAdminMenuOrderToServer();
      });
    });
    var resetBtn = $('btnResetAdminMenuOrder');
    if (resetBtn && !resetBtn._adminMenuResetBound) {
      resetBtn._adminMenuResetBound = true;
      resetBtn.addEventListener('click', async function () {
        try {
          await api('/api/admin/menu-order', {
            method: 'PUT',
            body: JSON.stringify({
              order: DEFAULT_ADMIN_MENU_TABS.slice(),
              disabled: {},
            }),
          });
          try {
            localStorage.removeItem(ADMIN_MENU_ORDER_KEY);
          } catch (e2) {}
          window.location.reload();
        } catch (err) {
          alert(err.message || String(err));
        }
      });
    }
  } else {
    nav.querySelectorAll('.ry-menu-item[data-tab]').forEach(function (btn) {
      btn.setAttribute('draggable', 'false');
    });
  }
}

async function api(path, opt) {
  const r = await fetch(
    path,
    Object.assign(
      {
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
      },
      opt || {}
    )
  );
  const text = await r.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    data = { _raw: text };
  }
  if (!r.ok) throw new Error(data.error || r.statusText || '请求失败');
  return data;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function roleLabelFromStore(st, roleId) {
  var r = st && st.roles && st.roles[roleId];
  return (r && r.label) || roleId;
}

function buildRoleOptionsHtml(st, currentRole) {
  var order = (st && st.order) || [];
  var roles = (st && st.roles) || {};
  return order
    .map(function (rid) {
      var r = roles[rid];
      if (!r) return '';
      var sel = currentRole === rid ? ' selected' : '';
      return (
        '<option value="' +
        escapeHtml(rid) +
        '"' +
        sel +
        '>' +
        escapeHtml((r.label || rid) + ' (' + rid + ')') +
        '</option>'
      );
    })
    .join('');
}

async function checkSession() {
  try {
    const r = await fetch('/api/admin/session', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    const d = await r.json();
    if (d.ok === true && d.user) {
      window.__adminUser = d.user;
      window.__adminCapabilities = d.capabilities || {
        siteSettings: false,
        seo: false,
        audit: false,
      };
      window.__adminDataViews = d.dataViews || {
        mainDoc: true,
        tools: true,
        landing: true,
        extraPages: true,
        images: true,
        stats: true,
      };
      window.__adminRoleMeta = d.roleMeta || null;
      return true;
    }
    window.__adminUser = null;
    window.__adminCapabilities = null;
    window.__adminDataViews = null;
    window.__adminRoleMeta = null;
    return false;
  } catch (e) {
    window.__adminUser = null;
    window.__adminCapabilities = null;
    window.__adminDataViews = null;
    window.__adminRoleMeta = null;
    return false;
  }
}

function defaultDataViews() {
  return {
    mainDoc: true,
    tools: true,
    landing: true,
    extraPages: true,
    images: true,
    stats: true,
  };
}

function updateAdminChrome() {
  const u = window.__adminUser;
  const caps = window.__adminCapabilities || { siteSettings: false, seo: false, audit: false };
  const isAdm = u && u.role === 'admin';
  const dv = window.__adminDataViews || defaultDataViews();
  const showSite = !!caps.siteSettings;
  const showSeo = !!caps.seo;
  const showAudit = !!caps.audit;
  const showMd = !!(dv.mainDoc || dv.extraPages);
  const showTools = !!dv.tools;
  const showLanding = !!dv.landing;
  const sub = $('navSubtitle');
  if (sub && u) {
    var rm = window.__adminRoleMeta;
    var roleLabel =
      (rm && rm.label) ||
      (u.role === 'admin' ? '管理员' : u.role === 'editor' ? '编辑' : u.role);
    sub.textContent = '内容管理 · ' + u.username + ' · ' + roleLabel;
  }
  var mu = $('menuTabUsers');
  if (mu) {
    mu.classList.toggle('admin-hidden', !isAdm);
  }
  var mr = $('menuTabRoles');
  if (mr) {
    mr.classList.toggle('admin-hidden', !isAdm);
  }
  var mredis = $('menuTabRedis');
  if (mredis) {
    mredis.classList.toggle('admin-hidden', !isAdm);
  }
  var mup = $('menuTabUpgrade');
  if (mup) {
    mup.classList.toggle('admin-hidden', !isAdm);
  }
  var tabVis = {
    dash: true,
    md: showMd,
    tools: showTools,
    landing: showLanding,
    site: showSite,
    seo: showSeo,
    audit: showAudit,
    users: isAdm,
    roles: isAdm,
    redis: isAdm,
    upgrade: isAdm,
  };
  Object.keys(tabVis).forEach(function (tab) {
    var b = document.querySelector('.ry-menu-item[data-tab="' + tab + '"]');
    if (b) b.classList.toggle('admin-hidden', !tabVis[tab]);
  });
  var panelVis = {
    panelDashboard: true,
    panelMd: showMd,
    panelTools: showTools,
    panelLanding: showLanding,
    panelSite: showSite,
    panelSeo: showSeo,
    panelAudit: showAudit,
    panelUsers: isAdm,
    panelRoles: isAdm,
    panelRedis: isAdm,
    panelUpgrade: isAdm,
  };
  Object.keys(panelVis).forEach(function (pid) {
    var el = $(pid);
    if (el) el.classList.toggle('admin-hidden', !panelVis[pid]);
  });
  var statsBox = $('statsBox');
  if (statsBox) statsBox.classList.toggle('admin-hidden', !dv.stats);
  var btnMain = $('docSubBtnMain');
  var btnExtra = $('docSubBtnExtra');
  if (btnMain) btnMain.classList.toggle('admin-hidden', !dv.mainDoc);
  if (btnExtra) btnExtra.classList.toggle('admin-hidden', !dv.extraPages);
  var subnav = document.querySelector('.admin-docs-subnav');
  if (subnav) subnav.classList.toggle('admin-hidden', !(dv.mainDoc && dv.extraPages));
  var imgPanel = $('adminDocImagePanel');
  if (imgPanel) imgPanel.classList.toggle('admin-hidden', !dv.images);
  if ($('docSubMain')) $('docSubMain').classList.toggle('admin-hidden', !dv.mainDoc);
  if ($('docSubExtra')) $('docSubExtra').classList.toggle('admin-hidden', !dv.extraPages);
}

function syncDocSubNavForDataView() {
  var dv = window.__adminDataViews || defaultDataViews();
  var btnMain = $('docSubBtnMain');
  var btnExtra = $('docSubBtnExtra');
  if (dv.mainDoc && !dv.extraPages && btnMain) btnMain.click();
  else if (!dv.mainDoc && dv.extraPages && btnExtra) btnExtra.click();
  else if (dv.mainDoc && btnMain) btnMain.click();
}

function ensureVisibleAdminTab() {
  var nav = $('ryMenuNav');
  if (!nav) return;
  var active = nav.querySelector('.ry-menu-item[data-tab].active');
  if (active && !active.classList.contains('admin-hidden')) return;
  var dash = $('menuTabDash');
  if (dash && !dash.classList.contains('admin-hidden')) {
    dash.click();
    return;
  }
  var first = nav.querySelector('.ry-menu-item[data-tab]:not(.admin-hidden)');
  if (first) {
    first.click();
    return;
  }
  var meta = document.querySelector('.ry-menu-meta .ry-menu-item[data-tab]:not(.admin-hidden)');
  if (meta) meta.click();
}

function showDash() {
  document.body.classList.add('admin-dash-mode');
  $('navSubtitle').classList.remove('admin-hidden');
  $('btnLogoutNav').classList.remove('admin-hidden');
  updateAdminChrome();
}

async function loadStats() {
  const inner = $('statsInner');
  var dv = window.__adminDataViews || defaultDataViews();
  if (!dv.stats) {
    if (inner) inner.textContent = '无权限查看统计（由管理员在「数据查看范围」中配置）';
    return;
  }
  try {
    const s = await api('/api/admin/stats');
    let h = '';
    h += '<div>章节数：<strong>' + s.sectionCount + '</strong></div>';
    if (s.markdown) {
      h +=
        '<div>Markdown：' +
        s.markdown.size +
        ' 字节 · 修改 ' +
        s.markdown.mtime +
        '</div>';
      h += '<div><code>' + escapeHtml(s.markdownPath) + '</code></div>';
    }
    if (s.toolsJson) {
      h +=
        '<div>工具导航数据：' +
        s.toolsJson.size +
        ' 字节 · 修改 ' +
        s.toolsJson.mtime +
        '</div>';
      h += '<div><code>' + escapeHtml(s.toolsJsonPath) + '</code></div>';
    }
    if (s.landingJson) {
      h +=
        '<div>门户配置：' +
        s.landingJson.size +
        ' 字节 · 修改 ' +
        s.landingJson.mtime +
        '</div>';
      h += '<div><code>' + escapeHtml(s.landingJsonPath) + '</code></div>';
    }
    if (s.seoJson) {
      h +=
        '<div>SEO 配置：' +
        s.seoJson.size +
        ' 字节 · 修改 ' +
        s.seoJson.mtime +
        '</div>';
      h += '<div><code>' + escapeHtml(s.seoJsonPath) + '</code></div>';
    }
    if (s.extraPagesJson) {
      h +=
        '<div>扩展内容：' +
        s.extraPagesJson.size +
        ' 字节 · 修改 ' +
        s.extraPagesJson.mtime +
        '</div>';
      if (s.extraPagesPath) h += '<div><code>' + escapeHtml(s.extraPagesPath) + '</code></div>';
    }
    if (inner) inner.innerHTML = h;
  } catch (e) {
    if (inner) inner.textContent = '统计加载失败：' + (e.message || String(e));
  }
}

function drFormatBackendLabel(b) {
  var s = String(b || '').toLowerCase();
  if (s.indexOf('redis') >= 0) return 'Redis';
  if (s.indexOf('memory') >= 0) return '内存';
  return b ? String(b) : '—';
}

function buildDrChartSvg(daysObj) {
  var keys = Object.keys(daysObj || {}).sort();
  if (!keys.length) {
    return '<div class="dr-chart-empty">暂无近 14 日按日数据</div>';
  }
  var vals = keys.map(function (k) {
    return Number(daysObj[k]) || 0;
  });
  var max = Math.max.apply(null, vals.concat([1]));
  var n = vals.length;
  var W = 800;
  var H = 160;
  var topPad = 22;
  var bottomPad = 18;
  var plotH = H - bottomPad - topPad;
  var pts = [];
  var i;
  for (i = 0; i < n; i++) {
    var x = n === 1 ? W / 2 : (i / (n - 1)) * W;
    var y = topPad + (1 - vals[i] / max) * plotH;
    pts.push([x, y]);
  }
  var lineD = 'M ' + pts[0][0] + ',' + pts[0][1];
  for (i = 1; i < pts.length; i++) {
    lineD += ' L ' + pts[i][0] + ',' + pts[i][1];
  }
  var bottomY = H - 6;
  var fillD = 'M ' + pts[0][0] + ',' + bottomY + ' L ' + pts[0][0] + ',' + pts[0][1];
  for (i = 1; i < pts.length; i++) {
    fillD += ' L ' + pts[i][0] + ',' + pts[i][1];
  }
  fillD += ' L ' + pts[pts.length - 1][0] + ',' + bottomY + ' Z';

  var step = Math.max(1, Math.ceil(n / 5));
  var labelIdx = [];
  for (i = 0; i < n; i += step) {
    labelIdx.push(i);
  }
  if (n > 1 && labelIdx[labelIdx.length - 1] !== n - 1) {
    labelIdx.push(n - 1);
  }
  var labelHtml = '';
  labelIdx.forEach(function (ii) {
    var dk = keys[ii];
    var short = dk.length > 12 ? dk.slice(0, 10) + '…' : dk;
    labelHtml +=
      '<text class="chart-label" x="' +
      pts[ii][0] +
      '" y="154" text-anchor="middle">' +
      escapeHtml(short) +
      '</text>';
  });

  var dots = pts
    .map(function (p) {
      return '<circle class="chart-dot" cx="' + p[0] + '" cy="' + p[1] + '" r="4"/>';
    })
    .join('');

  return (
    '<svg class="chart-svg" viewBox="0 0 ' +
    W +
    ' ' +
    H +
    '" preserveAspectRatio="none" aria-hidden="true">' +
    '<defs><linearGradient id="drChartGrad" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="var(--ebu4-accent)" stop-opacity="0.42"/>' +
    '<stop offset="100%" stop-color="var(--ebu4-accent)" stop-opacity="0"/>' +
    '</linearGradient></defs>' +
    '<g class="chart-grid">' +
    '<line x1="0" y1="40" x2="800" y2="40"/>' +
    '<line x1="0" y1="80" x2="800" y2="80"/>' +
    '<line x1="0" y1="120" x2="800" y2="120"/>' +
    '</g>' +
    '<path class="chart-area-fill" fill="url(#drChartGrad)" d="' +
    fillD +
    '"/>' +
    '<path class="chart-line" d="' +
    lineD +
    '"/>' +
    dots +
    labelHtml +
    '</svg>'
  );
}

function initDashboardRefUi(host) {
  if (!host) return;
  setTimeout(function () {
    host.querySelectorAll('[data-pct]').forEach(function (el) {
      var w = el.getAttribute('data-pct');
      if (w != null && w !== '') el.style.width = w + '%';
    });
  }, 80);
}

async function loadDashboard() {
  var host = $('dashboardHost');
  if (!host) return;
  host.innerHTML = '<p class="admin-tools-hint">加载中…</p>';
  try {
    var inviteFetch = Promise.resolve({ codes: [] });
    if (window.__adminUser && window.__adminUser.role === 'admin') {
      inviteFetch = api('/api/admin/invites').catch(function () {
        return { codes: [] };
      });
    }
    const results = await Promise.all([api('/api/admin/dashboard'), inviteFetch]);
    const d = results[0];
    const inv = results[1];
    const v = d.visits || {};
    const top = d.topPaths || [];
    const days = d.byDayLast14 || {};
    const pres = d.presence || {};
    const sg = d.siteGuestSessions != null ? d.siteGuestSessions : '—';
    const ic = d.inviteCodes || {};
    const total = Number(v.total) || 0;
    const docsPv = Number(v.docsPv) || 0;
    const indexPv = Number(v.indexPv) || 0;
    const extraPv = Number(v.extraPagePv) || 0;
    const otherPv = Math.max(0, total - docsPv - indexPv - extraPv);
    const pvSum = Math.max(1, docsPv + indexPv + extraPv + otherPv);
    const pct = function (x) {
      return Math.round((100 * (Number(x) || 0)) / pvSum);
    };

    var h = '';
    h += '<div class="dashboard-ref">';
    h += '<div class="page-hd fade-up">';
    h += '<div class="hd-left">';
    h += '<div class="breadcrumb"><span>首页</span><span class="sep">/</span><span>数据看板</span></div>';
    h += '<h1 class="page-title">访问与内容概览</h1>';
    h +=
      '<p class="page-desc">统计前台页面浏览（排除静态资源与 API）。数据存于 <code>site_kv.public_visit_stats</code> 或 <code>public/data/visit-stats.json</code>。</p>';
    h += '</div>';
    h += '<div class="hd-right">';
    h +=
      '<div class="live-badge"><span class="live-dot"></span>在线 ' +
      escapeHtml(String(pres.count != null ? pres.count : 0)) +
      ' · ' +
      escapeHtml(drFormatBackendLabel(pres.backend)) +
      '</div>';
    h +=
      '<button type="button" class="btn btn-secondary btn-sm" id="btnRefreshDashboard" title="刷新数据">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23,4 23,10 17,10"/><polyline points="1,20 1,14 7,14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>刷新' +
      '</button>';
    h += '</div></div>';

    h += '<div class="dashboard-ref-body">';
    h += '<div class="section fade-up stagger-1">';
    h += '<div class="section-hd">';
    h +=
      '<div class="section-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>访问与内容</div>';
    h +=
      '<span style="font-size:11px;color:var(--ebu4-text3)">统计更新: ' +
      escapeHtml(v.updatedAt ? String(v.updatedAt) : '—') +
      '</span>';
    h += '</div>';

    h += '<div class="stats-grid">';
    h +=
      '<div class="stat-card sc-accent fade-up stagger-1"><div class="stat-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></div><div class="stat-label">前台 PV (总)</div><div class="stat-value">' +
      escapeHtml(String(total)) +
      '</div><div class="stat-sub">全部页面浏览量</div></div>';
    h +=
      '<div class="stat-card sc-blue fade-up stagger-2"><div class="stat-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg></div><div class="stat-label">文档站</div><div class="stat-value">' +
      escapeHtml(String(docsPv)) +
      '</div><div class="stat-sub">技术文档浏览</div></div>';
    h +=
      '<div class="stat-card sc-purple fade-up stagger-3"><div class="stat-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg></div><div class="stat-label">门户</div><div class="stat-value">' +
      escapeHtml(String(indexPv)) +
      '</div><div class="stat-sub">门户首页访问</div></div>';
    h +=
      '<div class="stat-card sc-green fade-up stagger-4"><div class="stat-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></div><div class="stat-label">扩展页</div><div class="stat-value">' +
      escapeHtml(String(extraPv)) +
      '</div><div class="stat-sub">扩展页面浏览</div></div>';
    h +=
      '<div class="stat-card sc-orange fade-up stagger-5"><div class="stat-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg></div><div class="stat-label">主文档章节</div><div class="stat-value">' +
      escapeHtml(String(d.sectionCount != null ? d.sectionCount : 0)) +
      '</div><div class="stat-sub">当前章节数</div></div>';
    h += '</div>';

    h += '<div class="pv-grid fade-up stagger-3">';
    h +=
      '<div class="pv-item"><div class="pv-num">' +
      escapeHtml(String(docsPv)) +
      '</div><div class="pv-label">文档站</div><div class="pv-bar"><div class="pv-bar-inner" data-pct="' +
      pct(docsPv) +
      '"></div></div></div>';
    h +=
      '<div class="pv-item"><div class="pv-num">' +
      escapeHtml(String(indexPv)) +
      '</div><div class="pv-label">门户</div><div class="pv-bar"><div class="pv-bar-inner" data-pct="' +
      pct(indexPv) +
      '"></div></div></div>';
    h +=
      '<div class="pv-item"><div class="pv-num">' +
      escapeHtml(String(otherPv)) +
      '</div><div class="pv-label">其他（未归类）</div><div class="pv-bar"><div class="pv-bar-inner" data-pct="' +
      pct(otherPv) +
      '"></div></div></div>';
    h +=
      '<div class="pv-item"><div class="pv-num">' +
      escapeHtml(String(extraPv)) +
      '</div><div class="pv-label">扩展页</div><div class="pv-bar"><div class="pv-bar-inner" data-pct="' +
      pct(extraPv) +
      '"></div></div></div>';
    h += '</div>';

    h += '<div class="chart-area fade-up stagger-4">';
    h += buildDrChartSvg(days);
    h += '</div>';

    h += '<div class="dr-paths-mini fade-up stagger-4">';
    h += '<div class="card">';
    h += '<div class="card-hd"><div class="card-title">路径 TOP（累计）</div></div>';
    h += '<div class="card-body">';
    h += '<table class="tbl"><thead><tr><th>路径</th><th>次数</th></tr></thead><tbody>';
    if (!top.length) {
      h += '<tr><td colspan="2" style="color:var(--ebu4-text3)">暂无路径数据</td></tr>';
    } else {
      top.slice(0, 12).forEach(function (row) {
        h +=
          '<tr><td><code style="font-size:12px">' +
          escapeHtml(row.path) +
          '</code></td><td>' +
          escapeHtml(String(row.count)) +
          '</td></tr>';
      });
    }
    h += '</tbody></table>';
    h += '</div></div></div>';

    h += '</div>';

    h += '<div class="section fade-up stagger-3">';
    h +=
      '<div class="section-hd"><div class="section-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>会话与安全</div></div>';
    h += '<div class="session-grid">';
    h +=
      '<div class="session-card fade-up stagger-3"><div class="sc-row"><div class="sc-icon si-backend"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div><div class="sc-val v-accent">' +
      escapeHtml(String(pres.count != null ? pres.count : 0)) +
      '</div></div><div class="sc-label">后台在线（心跳）</div><div class="sc-detail">实时监控连接状态</div><span class="sc-tag memory">' +
      escapeHtml(drFormatBackendLabel(pres.backend)) +
      '</span></div>';
    h +=
      '<div class="session-card fade-up stagger-4"><div class="sc-row"><div class="sc-icon si-frontend"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg></div><div class="sc-val v-blue">' +
      escapeHtml(String(sg)) +
      '</div></div><div class="sc-label">前台访客会话</div><div class="sc-detail">site_session 活跃连接</div><span class="sc-tag session">site_session</span></div>';
    h +=
      '<div class="session-card fade-up stagger-5"><div class="sc-row"><div class="sc-icon si-invite"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg></div><div class="sc-val v-purple">' +
      escapeHtml(String(ic.active != null ? ic.active : 0)) +
      '</div></div><div class="sc-label">邀请码</div><div class="sc-detail">' +
      escapeHtml(String(ic.active != null ? ic.active : 0)) +
      ' 有效 / 共 ' +
      escapeHtml(String(ic.total != null ? ic.total : 0)) +
      '</div><span class="sc-tag guest">guest clearance</span></div>';
    h += '</div>';
    h +=
      '<div class="clearance-bar fade-up stagger-5"><div class="clearance-dot"></div><span class="clearance-label">访客默认 clearance</span><span class="clearance-desc">主文档可用标记章节等级</span><span class="clearance-code">&lt;!-- ebu4-security: internal --&gt;</span></div>';
    h += '</div>';

    if (window.__adminUser && window.__adminUser.role === 'admin' && inv.codes && inv.codes.length) {
      h += '<div class="section fade-up stagger-5">';
      h += '<div class="section-hd">';
      h +=
        '<div class="section-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>邀请码一览</div>';
      if (window.__adminCapabilities && window.__adminCapabilities.inviteRegister) {
        h +=
          '<button type="button" class="btn btn-primary btn-sm dashboard-gen-invite"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>生成新邀请码</button>';
      }
      h += '</div>';
      h += '<div class="card fade-up stagger-6">';
      h += '<div class="card-body">';
      h +=
        '<table class="tbl"><thead><tr><th>邀请码</th><th>已用 / 上限</th><th>过期时间</th><th>默认角色</th><th>操作</th></tr></thead><tbody>';
      inv.codes.forEach(function (c) {
        var exp = c.exp ? new Date(c.exp).toLocaleString('zh-CN') : '—';
        var codeRaw = c.code != null ? String(c.code) : '';
        var codeEsc = escapeHtml(codeRaw);
        var used = Number(c.used) || 0;
        var maxU = Number(c.maxUses) || 1;
        var uPct = maxU > 0 ? Math.round((100 * used) / maxU) : 0;
        var ubClass = used >= maxU ? 'ub-full' : used > 0 ? 'ub-partial' : 'ub-empty';
        var utClass = used >= maxU ? 'ut-full' : 'ut-empty';
        var role = (c.defaultRole || 'editor').toLowerCase();
        var roleCls = role === 'admin' ? 'role-admin' : 'role-editor';
        h += '<tr><td><div class="invite-code"><span>' + codeEsc + '</span>';
        h +=
          '<button type="button" class="copy-btn dr-invite-copy-btn" title="复制邀请码" data-code="' +
          codeEsc +
          '"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button></div></td>';
        h +=
          '<td><div class="usage-cell"><div class="usage-bar"><div class="usage-bar-inner ' +
          ubClass +
          '" data-pct="' +
          uPct +
          '"></div></div><span class="usage-text ' +
          utClass +
          '">' +
          escapeHtml(String(used)) +
          '/' +
          escapeHtml(String(maxU)) +
          '</span></div></td>';
        h += '<td><span class="expiry expiry-ok">' + escapeHtml(exp) + '</span></td>';
        h += '<td><span class="role-badge ' + roleCls + '">' + escapeHtml(c.defaultRole || 'editor') + '</span></td>';
        h +=
          '<td><button type="button" class="link-btn dashboard-copy-link" data-code="' +
          codeEsc +
          '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>复制链接</button></td></tr>';
      });
      h += '</tbody></table></div></div>';

      h += '<div class="two-col fade-up stagger-7" style="margin-top:14px">';
      h += '<div class="card">';
      h += '<div class="card-hd"><div class="card-title">';
      h +=
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>链接格式</div></div>';
      h += '<div style="padding:16px 20px">';
      h +=
        '<div style="font-family:var(--dr-mono,monospace);font-size:12.5px;color:var(--ebu4-text2);background:var(--ebu4-bg);padding:12px 16px;border-radius:8px;border:1px solid var(--ebu4-border);word-break:break-all">';
      h +=
        escapeHtml(window.location.origin + '/register?invite=') +
        '<span style="color:var(--ebu4-accent)">{code}</span>';
      h += '</div></div></div>';

      if (window.__adminCapabilities && window.__adminCapabilities.inviteRegister) {
        h += '<div class="card">';
        h += '<div class="card-hd"><div class="card-title">';
        h +=
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>快速生成邀请码</div></div>';
        h += '<div style="padding:16px 20px">';
        h +=
          '<p style="font-size:12px;color:var(--ebu4-text3);line-height:1.6;margin-bottom:12px">需当前账号具备「邀请注册」权限；默认创建 30 天有效、可用 1 次、角色为 editor。生成成功后将尝试复制邀请注册链接。</p>';
        h +=
          '<button type="button" class="btn btn-primary btn-sm dashboard-gen-invite" style="width:100%"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>生成新邀请码</button>';
        h += '<span class="admin-msg" id="dashboardInviteMsg" style="display:block;margin-top:10px"></span>';
        h += '</div></div>';
      }
      h += '</div>';
      h += '</div>';
    } else if (window.__adminCapabilities && window.__adminCapabilities.inviteRegister) {
      h += '<div class="section fade-up stagger-5">';
      h +=
        '<div class="section-hd"><div class="section-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>邀请码</div></div>';
      h += '<div class="card"><div style="padding:16px 20px">';
      h +=
        '<p style="font-size:13px;color:var(--ebu4-text3)">暂无邀请码数据，或需要管理员权限查看列表。</p>';
      h +=
        '<button type="button" class="btn btn-primary btn-sm dashboard-gen-invite" style="margin-top:10px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>生成新邀请码</button>';
      h += '<span class="admin-msg" id="dashboardInviteMsg" style="display:block;margin-top:10px"></span>';
      h += '</div></div></div>';
    }

    h += '<div class="section fade-up stagger-6">';
    h +=
      '<div class="section-hd"><div class="section-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27,6.96 12,12.01 20.73,6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>训练数据</div></div>';
    h += '<div class="training-card fade-up stagger-7">';
    h += '<div class="tc-header">';
    h +=
      '<div class="tc-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27,6.96 12,12.01 20.73,6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>';
    h += '<div><div class="tc-title">训练数据管理</div><div class="tc-sub">管理 AI 训练所需的文档数据集（占位）</div></div>';
    h += '</div>';
    h += '<div class="tc-stats">';
    h += '<div class="tc-stat"><div class="tc-stat-val">0</div><div class="tc-stat-label">数据集</div></div>';
    h += '<div class="tc-stat"><div class="tc-stat-val">0</div><div class="tc-stat-label">文档数</div></div>';
    h += '<div class="tc-stat"><div class="tc-stat-val">0 MB</div><div class="tc-stat-label">总大小</div></div>';
    h += '</div></div></div>';

    h += '<div class="footer-bar">';
    h += '<span>管理后台 · 与文档站共用主题与样式</span><span>Ecology E9 Platform</span>';
    h += '</div>';

    h += '</div></div>';
    host.innerHTML = h;
    initDashboardRefUi(host);
  } catch (e) {
    host.innerHTML = '<p class="admin-msg err">' + escapeHtml(e.message || String(e)) + '</p>';
  }
}

function populateToolsSite(site) {
  if (!site || typeof site !== 'object') return;
  var keys = ['name', 'domain', 'title', 'author', 'blog', 'theme', 'icp', 'beian'];
  keys.forEach(function (k) {
    var el = document.getElementById('tools_site_' + k);
    if (el && site[k] != null) el.value = String(site[k]);
  });
}

function collectToolsSite() {
  return {
    name: $('tools_site_name').value,
    domain: $('tools_site_domain').value,
    title: $('tools_site_title').value,
    author: $('tools_site_author').value,
    blog: $('tools_site_blog').value,
    theme: $('tools_site_theme').value,
    icp: $('tools_site_icp').value,
    beian: $('tools_site_beian').value,
  };
}

var docSectionsCache = [];
var selectedDocId = null;
/** 当前编辑的主文档 slug（与 ?doc= 一致；默认主文档可为 null，请求省略 doc） */
var adminMainDocSlug = null;
var adminMainDocsCache = [];

function adminDocQ() {
  if (!adminMainDocSlug) return '';
  return '?doc=' + encodeURIComponent(adminMainDocSlug);
}

async function initAdminMainDocSlug() {
  var d = await api('/api/admin/docs/main-docs');
  var docs = d.docs || [];
  adminMainDocsCache = docs.slice();
  var saved = null;
  try {
    saved = sessionStorage.getItem('ebu4_admin_main_doc');
  } catch (e) {}
  var pick = docs.find(function (x) {
    return x.slug === saved;
  });
  if (!pick) pick = docs.find(function (x) { return x.isDefault; }) || docs[0];
  adminMainDocSlug = pick ? pick.slug : null;
  if (pick) {
    try {
      sessionStorage.setItem('ebu4_admin_main_doc', pick.slug);
    } catch (e) {}
  }
  var sel = $('mainDocPicker');
  if (sel) {
    sel.innerHTML = docs
      .map(function (x) {
        return (
          '<option value="' +
          escapeHtml(x.slug) +
          '"' +
          (x.slug === adminMainDocSlug ? ' selected' : '') +
          '>' +
          escapeHtml(x.title || x.slug) +
          (x.isDefault ? '（默认）' : '') +
          '</option>'
        );
      })
      .join('');
  }
  var book = $('mainDocCrumbBook');
  if (book && pick) book.textContent = (pick.title || pick.slug || '').trim() || '当前文档';
  updateMdTaChrome();
  updateMainDocChrome();
}

/** 整文件 Markdown 区：标题显示当前主文档 slug、字数统计 */
function updateMdTaChrome() {
  var slug = adminMainDocSlug || 'default';
  var docLabel = getCurrentAdminDocDisplayName();
  var label = $('mdTaLabel');
  if (label) label.textContent = '完整 Markdown（' + docLabel + ' / ' + slug + '）';
  var meta = $('mdTaMeta');
  var ta = $('mdTa');
  if (meta && ta) {
    var v = ta.value || '';
    var chars = v.length;
    var bytes = chars;
    try {
      bytes = new Blob([v]).size;
    } catch (e) {}
    meta.textContent = chars + ' 字符 · 约 ' + bytes + ' 字节（UTF-8）';
  }
  var docNameEl = $('mainDocFullMdDocName');
  if (docNameEl) docNameEl.textContent = docLabel;
  var docSlugEl = $('mainDocFullMdDocSlug');
  if (docSlugEl) docSlugEl.textContent = slug;
  updateMainDocChrome();
}

function setMainDocFullMarkdownValue(raw) {
  var ta = $('mdTa');
  if (!ta) return;
  ta.value = raw || '';
  mainDocFullMdSavedValue = ta.value || '';
  updateMdTaChrome();
}

async function refreshMainDocsModalTable() {
  var host = $('mainDocsTableBody');
  if (!host) return;
  var d = await api('/api/admin/docs/main-docs');
  var docs = d.docs || [];
  adminMainDocsCache = docs.slice();
  if (!docs.length) {
    host.innerHTML =
      '<tr><td colspan="4" style="padding:14px;color:var(--text-dim,#9ca3af);text-align:center">暂无主文档（若长期如此请检查接口 <code>/api/admin/docs/main-docs</code>）</td></tr>';
    return;
  }
  host.innerHTML = docs
    .map(function (x) {
      return (
        '<tr data-slug="' +
        escapeHtml(x.slug) +
        '"><td>' +
        escapeHtml(x.title || x.slug) +
        '</td><td><code>' +
        escapeHtml(x.slug) +
        '</code></td><td>' +
        (x.isDefault ? '<span class="admin-msg ok">默认</span>' : '—') +
        '</td><td class="main-docs-actions">' +
        (x.isDefault
          ? ''
          : '<button type="button" class="de-btn de-btn-sm de-btn-ghost main-docs-def">设默认</button> ') +
        '<button type="button" class="de-btn de-btn-sm de-btn-ghost main-docs-ren">改名</button> ' +
        (docs.length <= 1
          ? ''
          : '<button type="button" class="de-btn de-btn-sm de-btn-danger-ghost main-docs-del">删除</button>') +
        '</td></tr>'
      );
    })
    .join('');
}

function openMainDocsModal() {
  var bg = $('mainDocsModal');
  if (!bg) return;
  openModalBg(bg);
  refreshMainDocsModalTable().catch(function (e) {
    alert(e.message || String(e));
  });
}

function closeMainDocsModal() {
  closeModalBg($('mainDocsModal'));
}
var selectedDocSlug = null;
var mainDocQuill = null;
var mainDocTurndown = null;
var mainDocSyncTimer = null;
var mainDocDirty = false;
var mainDocFullMdSavedValue = '';
var mainDocFullMdDrawerTimer = null;
window.__mainDocEditMode = 'rich';

function getCurrentAdminMainDocMeta() {
  var slugKey = adminMainDocSlug;
  try {
    var sel = $('mainDocPicker');
    if (sel && sel.value != null && String(sel.value).trim() !== '') {
      slugKey = String(sel.value).trim();
    }
  } catch (e) {}
  var pick =
    slugKey != null && slugKey !== ''
      ? adminMainDocsCache.find(function (x) {
          return x.slug === slugKey;
        })
      : null;
  if (!pick && adminMainDocsCache.length) {
    pick =
      adminMainDocsCache.find(function (x) {
        return !!x.isDefault;
      }) || adminMainDocsCache[0];
  }
  return pick || null;
}

function getCurrentAdminDocDisplayName() {
  var sel = $('mainDocPicker');
  if (sel && sel.selectedOptions && sel.selectedOptions[0]) {
    return String(sel.selectedOptions[0].textContent || '')
      .replace(/\s*（默认）\s*$/, '')
      .trim();
  }
  return adminMainDocSlug || 'default';
}

function hasUnsavedMainDocFullMarkdown() {
  var ta = $('mdTa');
  return !!ta && (ta.value || '') !== (mainDocFullMdSavedValue || '');
}

function hasUnsavedMainDocChanges() {
  return !!mainDocDirty || hasUnsavedMainDocFullMarkdown();
}

function getCurrentAdminSectionMeta() {
  if (selectedDocId == null) return null;
  return (
    docSectionsCache.find(function (x) {
      return x.id === selectedDocId;
    }) || null
  );
}

function confirmDiscardMainDocChanges(nextDocLabel) {
  if (!hasUnsavedMainDocChanges()) return true;
  var cur = getCurrentAdminDocDisplayName();
  var next = nextDocLabel || '目标文档';
  return window.confirm(
    '当前文档「' +
      cur +
      '」还有未保存修改，切换到「' +
      next +
      '」后这些修改会丢失。是否继续？'
  );
}

function setMainDocDrawerOpen(open) {
  var drawer = $('mainDocFullMdDrawer');
  if (!drawer) return;
  if (mainDocFullMdDrawerTimer) {
    clearTimeout(mainDocFullMdDrawerTimer);
    mainDocFullMdDrawerTimer = null;
  }
  if (open) {
    drawer.classList.remove('admin-hidden');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('dm-drawer-open');
    requestAnimationFrame(function () {
      drawer.classList.add('open');
    });
    return;
  }
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('dm-drawer-open');
  mainDocFullMdDrawerTimer = setTimeout(function () {
    drawer.classList.add('admin-hidden');
    mainDocFullMdDrawerTimer = null;
  }, 220);
}

function openMainDocFullMarkdownDrawer() {
  setMainDocDrawerOpen(true);
  updateMdTaChrome();
  setTimeout(function () {
    var ta = $('mdTa');
    if (ta) ta.focus();
  }, 120);
}

function closeMainDocFullMarkdownDrawer() {
  setMainDocDrawerOpen(false);
}

function updateMainDocSaveInd() {
  var dot = $('mainDocSaveDot');
  var txt = $('mainDocSaveTxt');
  if (!dot || !txt) return;
  dot.classList.toggle('unsaved', mainDocDirty);
  txt.textContent = mainDocDirty ? '未保存' : '已保存';
}

function applyMainDocEditMode() {
  var wrap = $('mainDocQuillWrap');
  var ta = $('docSectionTa');
  var br = $('btnMainDocModeRich');
  var bm = $('btnMainDocModeMd');
  if (!wrap || !ta) return;
  if (window.__mainDocEditMode === 'markdown') {
    if (mainDocQuill) {
      var td = getMainDocTurndown();
      if (td) ta.value = td.turndown(mainDocQuill.root.innerHTML);
    }
    wrap.classList.add('admin-hidden');
    ta.classList.remove('admin-hidden');
    ta.removeAttribute('aria-hidden');
    ta.removeAttribute('tabindex');
    if (br) {
      br.classList.add('de-btn-ghost');
      br.classList.remove('de-btn-accent');
    }
    if (bm) {
      bm.classList.add('de-btn-accent');
      bm.classList.remove('de-btn-ghost');
    }
  } else {
    ta.classList.add('admin-hidden');
    ta.setAttribute('aria-hidden', 'true');
    ta.setAttribute('tabindex', '-1');
    wrap.classList.remove('admin-hidden');
    setMainDocFromMarkdown(ta.value);
    if (br) {
      br.classList.add('de-btn-accent');
      br.classList.remove('de-btn-ghost');
    }
    if (bm) {
      bm.classList.add('de-btn-ghost');
      bm.classList.remove('de-btn-accent');
    }
  }
  updateMainDocChrome();
}

async function refreshMdTaFromServer() {
  try {
    const md = await api('/api/admin/files/markdown' + adminDocQ());
    setMainDocFullMarkdownValue(md.content || '');
  } catch (_) {}
}

function renderDocSectionList(filterText) {
  var ul = $('docSectionList');
  if (!ul) return;
  var term = (filterText || '').toLowerCase().trim();
  ul.innerHTML = '';
  var rows = docSectionsCache.filter(function (s) {
    return !term || String(s.title).toLowerCase().indexOf(term) !== -1;
  });
  if (!rows.length) {
    var li = document.createElement('li');
    var hint = document.createElement('div');
    hint.style.padding = '12px';
    hint.style.fontSize = '0.82rem';
    hint.style.color = 'var(--text-dim)';
    hint.textContent = docSectionsCache.length ? '无匹配章节' : '暂无章节，请点击「新建章节」';
    li.appendChild(hint);
    ul.appendChild(li);
    updateMainDocChrome();
    return;
  }
  rows.forEach(function (s) {
    var li = document.createElement('li');
    var btn = document.createElement('button');
    var order = docSectionsCache.indexOf(s) + 1;
    btn.type = 'button';
    btn.className = 'de-chapter-btn';
    btn.innerHTML =
      '<span class="de-chapter-title">' +
      escapeHtml(s.title || '未命名章节') +
      '</span><span class="de-chapter-meta">第 ' +
      String(order) +
      ' 章' +
      (s.slug ? ' · /' + escapeHtml(s.slug) : '') +
      '</span>';
    btn.dataset.id = String(s.id);
    if (selectedDocId === s.id) btn.classList.add('active');
    btn.addEventListener('click', function () {
      selectDocSection(s.id);
    });
    li.appendChild(btn);
    ul.appendChild(li);
  });
  updateMainDocChrome();
}

function updateMainDocChrome() {
  var docMeta = getCurrentAdminMainDocMeta();
  var sectionMeta = getCurrentAdminSectionMeta();
  var docLabel =
    (docMeta && String(docMeta.title || docMeta.slug || '').trim()) ||
    getCurrentAdminDocDisplayName() ||
    '当前文档';
  var docSlug = (docMeta && docMeta.slug) || adminMainDocSlug || 'default';
  var book = $('mainDocCrumbBook');
  if (book) book.textContent = docLabel;
  var crumb = $('mainDocCrumbChapter');
  var left = $('mainDocStatusLeft');
  var right = $('mainDocStatusRight');
  var ta = $('docSectionTa');
  if (crumb) {
    if (selectedDocId == null) {
      crumb.textContent = '—';
    } else {
      crumb.textContent = (sectionMeta && sectionMeta.title) || '章节 #' + selectedDocId;
    }
  }
  if (left) {
    left.textContent =
      selectedDocId == null
        ? '未选择章节'
        : '当前章节 · ' + ((sectionMeta && sectionMeta.title) || '章节 #' + selectedDocId);
  }
  if (right) {
    var n = docSectionsCache.length || 0;
    var dirtyText = hasUnsavedMainDocChanges() ? '未保存改动' : '已同步';
    try {
      var md = typeof getMainDocMarkdown === 'function' ? getMainDocMarkdown() : ta && ta.value ? ta.value : '';
      var bytes = new Blob([md || '']).size;
      right.textContent = dirtyText + ' · ' + bytes + ' 字节 · ' + n + ' 章';
    } catch (_) {
      right.textContent = dirtyText + ' · ' + n + ' 章';
    }
  }
  var summaryTitle = $('mainDocSummaryTitle');
  if (summaryTitle) summaryTitle.textContent = docLabel;
  var summarySlug = $('mainDocSummarySlug');
  if (summarySlug) summarySlug.textContent = docSlug;
  var summaryCount = $('mainDocSummaryCount');
  if (summaryCount) summaryCount.textContent = String(docSectionsCache.length || 0);
  var summarySection = $('mainDocSummarySection');
  if (summarySection) {
    summarySection.textContent =
      selectedDocId == null
        ? '未选择'
        : (sectionMeta && sectionMeta.title) || '章节 #' + selectedDocId;
  }
  var summaryDefault = $('mainDocSummaryDefault');
  if (summaryDefault) summaryDefault.classList.toggle('admin-hidden', !(docMeta && docMeta.isDefault));
  var summaryDirty = $('mainDocSummaryDirty');
  if (summaryDirty) summaryDirty.classList.toggle('admin-hidden', !hasUnsavedMainDocChanges());
  var drawerName = $('mainDocFullMdDocName');
  if (drawerName) drawerName.textContent = docLabel;
  var drawerSlug = $('mainDocFullMdDocSlug');
  if (drawerSlug) drawerSlug.textContent = docSlug;
  var metaSlug = $('mainDocPickerMetaSlug');
  if (metaSlug) metaSlug.textContent = docSlug ? docSlug : '—';
  var metaCount = $('mainDocPickerMetaCount');
  if (metaCount) metaCount.textContent = (docSectionsCache.length || 0) + ' 章';
  updateMainDocSaveInd();
}

function getMainDocTurndown() {
  if (mainDocTurndown) return mainDocTurndown;
  if (typeof TurndownService === 'undefined') return null;
  mainDocTurndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
  return mainDocTurndown;
}

function getMainDocMarkdown() {
  if (window.__mainDocEditMode === 'markdown') {
    var ta0 = $('docSectionTa');
    return ta0 ? ta0.value || '' : '';
  }
  if (mainDocQuill) {
    var td = getMainDocTurndown();
    if (!td) return '';
    return td.turndown(mainDocQuill.root.innerHTML);
  }
  var ta = $('docSectionTa');
  return ta ? ta.value || '' : '';
}

function scheduleMainDocHiddenTextareaSync() {
  if (mainDocSyncTimer) clearTimeout(mainDocSyncTimer);
  mainDocSyncTimer = setTimeout(function () {
    var ta = $('docSectionTa');
    if (ta) ta.value = getMainDocMarkdown();
  }, 400);
}

function setMainDocFromMarkdown(md) {
  var raw = md == null ? '' : String(md);
  var ta = $('docSectionTa');
  if (ta) ta.value = raw;
  if (window.__mainDocEditMode === 'markdown') return;
  if (!mainDocQuill) return;
  if (!raw.trim()) {
    mainDocQuill.setText('');
    return;
  }
  if (typeof marked === 'undefined' || typeof marked.parse !== 'function') {
    mainDocQuill.setText(raw);
    return;
  }
  marked.setOptions({ gfm: true, breaks: true });
  var html = marked.parse(raw);
  var safe = window.DOMPurify ? DOMPurify.sanitize(html) : html;
  mainDocQuill.setContents([]);
  mainDocQuill.clipboard.dangerouslyPasteHTML(0, safe, 'silent');
}

async function mainDocUploadAndInsertImage(file) {
  if (!mainDocQuill || !file) return;
  var up = window.__ebu4AdminUploadImage;
  if (typeof up !== 'function') {
    window.alert('上传模块未就绪');
    return;
  }
  try {
    mainDocQuill.enable(false);
    var url = await up(file);
    mainDocInsertImageUrl(url);
  } catch (e) {
    window.alert(e.message || String(e));
  } finally {
    mainDocQuill.enable(true);
  }
}

function mainDocInsertImageUrl(url) {
  if (!mainDocQuill || !url) return;
  var range = mainDocQuill.getSelection(true);
  var index = range ? range.index : Math.max(0, mainDocQuill.getLength() - 1);
  mainDocQuill.insertEmbed(index, 'image', url, 'user');
  mainDocQuill.setSelection(index + 1, 0);
  scheduleMainDocHiddenTextareaSync();
  updateMainDocChrome();
}
window.__ebu4MainDocInsertImageUrl = mainDocInsertImageUrl;

function bindMainDocQuillPasteAndDrop(quill) {
  if (!quill || !quill.root) return;
  quill.root.addEventListener('paste', function (e) {
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.kind === 'file' && it.type.indexOf('image') === 0) {
        e.preventDefault();
        var blob = it.getAsFile();
        if (!blob) continue;
        mainDocUploadAndInsertImage(blob);
        return;
      }
    }
  });
  quill.root.addEventListener('dragover', function (e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  quill.root.addEventListener('drop', function (e) {
    var files = e.dataTransfer && e.dataTransfer.files;
    if (!files || !files.length) return;
    var f = files[0];
    if (!f.type || f.type.indexOf('image') !== 0) return;
    e.preventDefault();
    mainDocUploadAndInsertImage(f);
  });
}

function initMainDocQuill() {
  if (mainDocQuill) return mainDocQuill;
  if (typeof Quill === 'undefined') return null;
  var host = $('mainDocQuill');
  if (!host) return null;
  mainDocQuill = new Quill('#mainDocQuill', {
    theme: 'snow',
    placeholder: '在左侧选择章节，或新建章节；支持工具栏插图、粘贴与拖入图片',
    modules: {
      toolbar: {
        container: [
          [{ header: [1, 2, 3, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          [{ indent: '-1' }, { indent: '+1' }],
          ['blockquote', 'code-block'],
          ['link', 'image'],
          ['clean'],
        ],
        handlers: {
          image: function () {
            var input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.click();
            input.addEventListener('change', function () {
              var f = input.files && input.files[0];
              if (f) mainDocUploadAndInsertImage(f);
            });
          },
        },
      },
    },
  });
  mainDocQuill.on('text-change', function () {
    mainDocDirty = true;
    scheduleMainDocHiddenTextareaSync();
    updateMainDocChrome();
  });
  mainDocQuill.on('selection-change', function () {
    scheduleMainDocHiddenTextareaSync();
  });
  bindMainDocQuillPasteAndDrop(mainDocQuill);
  return mainDocQuill;
}

function deWrapMdSelection(ta, before, after) {
  if (!ta) return;
  var start = ta.selectionStart;
  var end = ta.selectionEnd;
  var v = ta.value;
  var sel = v.slice(start, end);
  ta.value = v.slice(0, start) + before + sel + after + v.slice(end);
  var np = start + before.length + sel.length + after.length;
  ta.selectionStart = ta.selectionEnd = np;
  ta.focus();
}

function deInsertMdPrefix(ta, prefix) {
  if (!ta) return;
  var pos = ta.selectionStart;
  var v = ta.value;
  ta.value = v.slice(0, pos) + prefix + v.slice(pos);
  ta.selectionStart = ta.selectionEnd = pos + prefix.length;
  ta.focus();
}

function initMdToolbarDelegation() {
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.de-tool-btn[data-de-ta]');
    if (!btn) return;
    var taId = btn.getAttribute('data-de-ta');
    var ta = document.getElementById(taId);
    if (!ta) return;
    var wrap = btn.getAttribute('data-wrap');
    var prefix = btn.getAttribute('data-prefix');
    if (wrap) {
      if (wrap === '**') deWrapMdSelection(ta, '**', '**');
      else if (wrap === '*') deWrapMdSelection(ta, '*', '*');
      else if (wrap === '`') deWrapMdSelection(ta, '`', '`');
    } else if (prefix) {
      deInsertMdPrefix(ta, prefix);
    }
  });
}

async function selectDocSection(id) {
  $('docSectionMsg').textContent = '';
  $('docSectionMsg').className = 'admin-msg';
  initMainDocQuill();
  var d = await api('/api/admin/docs/sections/' + id + adminDocQ());
  selectedDocId = d.id;
  selectedDocSlug = d.slug;
  setMainDocFromMarkdown(d.content || '');
  var crumb = $('mainDocCrumbChapter');
  if (crumb) crumb.textContent = d.title || '—';
  renderDocSectionList($('docSectionFilter') ? $('docSectionFilter').value : '');
  mainDocDirty = false;
  updateMainDocChrome();
}

async function refreshDocSections(preferredId, opts) {
  opts = opts || {};
  var preferSlugFirst = !!opts.preferSlugFirst;
  try {
    var d = await api('/api/admin/docs/sections' + adminDocQ());
    docSectionsCache = d.sections || [];
    if (docSectionsCache.length === 0) {
      selectedDocId = null;
      selectedDocSlug = null;
      initMainDocQuill();
      setMainDocFromMarkdown('');
      var crumb = $('mainDocCrumbChapter');
      if (crumb) crumb.textContent = '—';
      renderDocSectionList($('docSectionFilter') ? $('docSectionFilter').value : '');
      mainDocDirty = false;
      updateMainDocChrome();
      return;
    }
    var pick = null;
    // 上移/下移后服务端会 reindex，章节 id 会变；须按 slug 找回同一章，不能再用旧 id
    if (preferSlugFirst && selectedDocSlug) {
      pick = docSectionsCache.find(function (s) {
        return s.slug === selectedDocSlug;
      });
    }
    if (!pick && preferredId != null && preferredId !== '') {
      pick = docSectionsCache.find(function (s) {
        return s.id === Number(preferredId);
      });
    }
    if (!pick && selectedDocSlug) {
      pick = docSectionsCache.find(function (s) {
        return s.slug === selectedDocSlug;
      });
    }
    if (!pick) pick = docSectionsCache[0];
    selectedDocId = pick.id;
    selectedDocSlug = pick.slug;
    await selectDocSection(pick.id);
    updateMainDocChrome();
  } catch (e) {
    docSectionsCache = [];
    initMainDocQuill();
    setMainDocFromMarkdown('');
    renderDocSectionList('');
    mainDocDirty = false;
    updateMainDocChrome();
    throw e;
  }
}

function initDocSectionManager() {
  initMdToolbarDelegation();
  initMainDocQuill();
  var mainToggle = $('btnMainToggleProps');
  var mainPanel = $('mainDocPropsPanel');
  if (mainToggle && mainPanel) {
    mainToggle.addEventListener('click', function () {
      mainPanel.classList.toggle('open');
    });
  }

  var filterEl = $('docSectionFilter');
  if (filterEl) {
    filterEl.addEventListener('input', function () {
      renderDocSectionList(filterEl.value);
    });
  }

  var taMd = $('docSectionTa');
  if (taMd && !taMd._dmDirtyBound) {
    taMd._dmDirtyBound = true;
    taMd.addEventListener('input', function () {
      mainDocDirty = true;
      updateMainDocChrome();
    });
  }

  var btnOpenFullMd = $('btnOpenFullMarkdown');
  if (btnOpenFullMd && !btnOpenFullMd._bound) {
    btnOpenFullMd._bound = true;
    btnOpenFullMd.addEventListener('click', openMainDocFullMarkdownDrawer);
  }
  var btnCloseFullMd = $('btnCloseFullMarkdown');
  if (btnCloseFullMd && !btnCloseFullMd._bound) {
    btnCloseFullMd._bound = true;
    btnCloseFullMd.addEventListener('click', closeMainDocFullMarkdownDrawer);
  }
  var drawer = $('mainDocFullMdDrawer');
  if (drawer && !drawer._bound) {
    drawer._bound = true;
    drawer.addEventListener('click', function (e) {
      var closeHit = e.target.closest('[data-drawer-close]');
      if (!closeHit) return;
      closeMainDocFullMarkdownDrawer();
    });
  }
  if (!document._mainDocDrawerEscBound) {
    document._mainDocDrawerEscBound = true;
    document.addEventListener('keydown', function (e) {
      var drawerEl = $('mainDocFullMdDrawer');
      if (e.key !== 'Escape' || !drawerEl || drawerEl.classList.contains('admin-hidden')) return;
      closeMainDocFullMarkdownDrawer();
    });
  }

  $('btnSaveSection').addEventListener('click', async function () {
    $('docSectionMsg').textContent = '';
    $('docSectionMsg').className = 'admin-msg';
    if (selectedDocId == null) {
      $('docSectionMsg').textContent = '请先选择章节';
      $('docSectionMsg').className = 'admin-msg err';
      return;
    }
    try {
      await api('/api/admin/docs/sections/' + selectedDocId + adminDocQ(), {
        method: 'PUT',
        body: JSON.stringify({ content: getMainDocMarkdown() }),
      });
      $('docSectionMsg').textContent = '已保存';
      $('docSectionMsg').className = 'admin-msg ok';
      await refreshMdTaFromServer();
      await refreshDocSections(selectedDocId);
      mainDocDirty = false;
      updateMainDocSaveInd();
      loadStats();
    } catch (e) {
      $('docSectionMsg').textContent = e.message;
      $('docSectionMsg').className = 'admin-msg err';
    }
  });

  $('btnNewSection').addEventListener('click', async function () {
    $('docSectionMsg').textContent = '';
    $('docSectionMsg').className = 'admin-msg';
    var title = window.prompt('新章节的一级标题（不要加 #）', '新章节');
    if (title == null) return;
    title = String(title).trim() || '新章节';
    var body = '# ' + title + '\n\n';
    try {
      var resNew = await api('/api/admin/docs/sections' + adminDocQ(), {
        method: 'POST',
        body: JSON.stringify({
          content: body,
          afterId: selectedDocId,
        }),
      });
      await refreshMdTaFromServer();
      await refreshDocSections(resNew.insertedId != null ? resNew.insertedId : null);
      loadStats();
    } catch (e) {
      $('docSectionMsg').textContent = e.message;
      $('docSectionMsg').className = 'admin-msg err';
    }
  });

  $('btnDeleteSection').addEventListener('click', async function () {
    $('docSectionMsg').textContent = '';
    $('docSectionMsg').className = 'admin-msg';
    if (selectedDocId == null) return;
    if (!window.confirm('确定删除当前章节？此操作会写入备份后从文件中移除该章。')) return;
    try {
      var delId = selectedDocId;
      await api('/api/admin/docs/sections/' + delId + adminDocQ(), { method: 'DELETE' });
      selectedDocSlug = null;
      selectedDocId = null;
      await refreshMdTaFromServer();
      await refreshDocSections(selectedDocId);
      loadStats();
    } catch (e) {
      $('docSectionMsg').textContent = e.message;
      $('docSectionMsg').className = 'admin-msg err';
    }
  });

  function doMove(delta) {
    if (selectedDocId == null) return;
    $('docSectionMsg').textContent = '';
    $('docSectionMsg').className = 'admin-msg';
    api('/api/admin/docs/sections/move' + adminDocQ(), {
      method: 'POST',
      body: JSON.stringify({ id: selectedDocId, delta: delta }),
    })
      .then(async function () {
        await refreshMdTaFromServer();
        await refreshDocSections(null, { preferSlugFirst: true });
        loadStats();
      })
      .catch(function (e) {
        $('docSectionMsg').textContent = e.message;
        $('docSectionMsg').className = 'admin-msg err';
      });
  }
  $('btnMoveSectionUp').addEventListener('click', function () {
    doMove(-1);
  });
  $('btnMoveSectionDown').addEventListener('click', function () {
    doMove(1);
  });

  var br = $('btnMainDocModeRich');
  var bm = $('btnMainDocModeMd');
  if (br && bm && !br._mainModeBound) {
    br._mainModeBound = true;
    br.addEventListener('click', function () {
      window.__mainDocEditMode = 'rich';
      applyMainDocEditMode();
    });
    bm.addEventListener('click', function () {
      window.__mainDocEditMode = 'markdown';
      applyMainDocEditMode();
    });
  }

  var mainPicker = $('mainDocPicker');
  if (mainPicker) {
    mainPicker.addEventListener('change', async function () {
      var nextSlug = mainPicker.value || null;
      var nextLabel =
        mainPicker.selectedOptions && mainPicker.selectedOptions[0]
          ? String(mainPicker.selectedOptions[0].textContent || '').replace(/\s*（默认）\s*$/, '').trim()
          : nextSlug || '目标文档';
      if (!confirmDiscardMainDocChanges(nextLabel)) {
        mainPicker.value = adminMainDocSlug || '';
        return;
      }
      adminMainDocSlug = nextSlug;
      try {
        if (adminMainDocSlug) sessionStorage.setItem('ebu4_admin_main_doc', adminMainDocSlug);
      } catch (e) {}
      $('docSectionMsg').textContent = '';
      $('docSectionMsg').className = 'admin-msg';
      try {
        await refreshMdTaFromServer();
        await refreshDocSections();
        loadStats();
      } catch (e) {
        $('docSectionMsg').textContent = e.message;
        $('docSectionMsg').className = 'admin-msg err';
      }
      updateMainDocChrome();
      updateMdTaChrome();
    });
  }
  var mdTaEl = $('mdTa');
  if (mdTaEl && !mdTaEl._ebu4MdStatBound) {
    mdTaEl._ebu4MdStatBound = true;
    mdTaEl.addEventListener('input', function () {
      updateMdTaChrome();
    });
  }
  var btnMm = $('btnManageMainDocs');
  if (btnMm) btnMm.addEventListener('click', openMainDocsModal);
  var btnMmClose = $('btnMainDocsModalClose');
  if (btnMmClose) btnMmClose.addEventListener('click', closeMainDocsModal);
  var mm = $('mainDocsModal');
  if (mm) {
    mm.addEventListener('click', function (e) {
      if (e.target === mm) closeMainDocsModal();
    });
    var tbody = $('mainDocsTableBody');
    if (tbody) {
      tbody.addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (!b) return;
        var tr = e.target.closest('tr');
        var slug = tr && tr.getAttribute('data-slug');
        if (!slug) return;
        if (b.classList.contains('main-docs-def')) {
          api('/api/admin/docs/main-docs/' + encodeURIComponent(slug) + '/set-default', { method: 'POST' })
            .then(function () {
              return initAdminMainDocSlug();
            })
            .then(function () {
              return refreshMainDocsModalTable();
            })
            .then(function () {
              return refreshMdTaFromServer();
            })
            .then(function () {
              return refreshDocSections();
            })
            .then(function () {
              loadStats();
            })
            .catch(function (err) {
              alert(err.message || String(err));
            });
        }
        if (b.classList.contains('main-docs-ren')) {
          var curTd = tr.querySelector('td');
          var cur = curTd ? curTd.textContent : '';
          var nt = window.prompt('新标题', cur ? cur.trim() : '');
          if (nt == null) return;
          nt = String(nt).trim();
          if (!nt) return;
          api('/api/admin/docs/main-docs/' + encodeURIComponent(slug), {
            method: 'PATCH',
            body: JSON.stringify({ title: nt }),
          })
            .then(function () {
              return initAdminMainDocSlug();
            })
            .then(function () {
              return refreshMainDocsModalTable();
            })
            .catch(function (err) {
              alert(err.message || String(err));
            });
        }
        if (b.classList.contains('main-docs-del')) {
          if (!window.confirm('确定删除主文档「' + slug + '」？其下章节将一并删除。')) return;
          api('/api/admin/docs/main-docs/' + encodeURIComponent(slug), { method: 'DELETE' })
            .then(function () {
              return initAdminMainDocSlug();
            })
            .then(function () {
              return refreshMainDocsModalTable();
            })
            .then(function () {
              return refreshMdTaFromServer();
            })
            .then(function () {
              return refreshDocSections();
            })
            .then(function () {
              loadStats();
            })
            .catch(function (err) {
              alert(err.message || String(err));
            });
        }
      });
    }
  }
  var btnCreateMain = $('btnCreateMainDoc');
  if (btnCreateMain) {
    btnCreateMain.addEventListener('click', async function () {
      var ns = $('newMainDocSlug');
      var nt = $('newMainDocTitle');
      var slug = ns && ns.value ? String(ns.value).trim() : '';
      var title = nt && nt.value ? String(nt.value).trim() : '';
      if (!slug) {
        alert('请填写 slug（小写字母、数字、连字符）');
        return;
      }
      try {
        await api('/api/admin/docs/main-docs', {
          method: 'POST',
          body: JSON.stringify({ slug: slug, title: title || slug }),
        });
        try {
          sessionStorage.setItem('ebu4_admin_main_doc', slug);
        } catch (e) {}
        if (ns) ns.value = '';
        if (nt) nt.value = '';
        await initAdminMainDocSlug();
        await refreshMainDocsModalTable();
        await refreshMdTaFromServer();
        await refreshDocSections();
        loadStats();
      } catch (e) {
        alert(e.message || String(e));
      }
    });
  }

  applyMainDocEditMode();
}

window.__roleProfilesCache = null;

function fillRoleProfileFormFromCache(roleId) {
  var st = window.__roleProfilesCache;
  if (!st || !st.roles) return;
  var r = st.roles[roleId];
  if (!r) return;
  var li = $('roleProfileLabelInput');
  if (li) li.value = r.label || roleId;
  var sl = $('roleSecurityLevelSelect');
  if (sl) sl.value = r.securityLevel || 'internal';
  var ta = $('roleSecurityDocTa');
  if (ta) ta.value = r.securityNote || '';
  var ma = r.moduleAccess || {};
  if ($('cap_editor_site')) $('cap_editor_site').checked = !!ma.siteSettings;
  if ($('cap_editor_seo')) $('cap_editor_seo').checked = !!ma.seo;
  if ($('cap_editor_audit')) $('cap_editor_audit').checked = !!ma.audit;
  if ($('cap_editor_invite')) $('cap_editor_invite').checked = !!ma.inviteRegister;
  var dv = r.dataViews || {};
  ['mainDoc', 'tools', 'landing', 'extraPages', 'images', 'stats'].forEach(function (k) {
    var el = $('cap_dv_' + k);
    if (el) el.checked = dv[k] !== false;
  });
  var delBtn = $('btnDeleteRoleProfile');
  if (delBtn) delBtn.disabled = !!r.system;
}

function countUsersByRole(users) {
  var m = {};
  (users || []).forEach(function (u) {
    var r = u.role || 'editor';
    m[r] = (m[r] || 0) + 1;
  });
  return m;
}

function roleCardClassForId(rid) {
  if (rid === 'admin') return 'rc-admin';
  if (rid === 'editor') return 'rc-editor';
  if (rid === 'viewer') return 'rc-viewer';
  return 'rc-custom';
}

function renderRoleCards(st, counts) {
  var host = $('roleCardsHost');
  if (!host) return;
  var order = st.order || [];
  var roles = st.roles || {};
  var svgShield =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
  var html = order
    .map(function (rid) {
      var r = roles[rid];
      if (!r) return '';
      var cnt = counts[rid] != null ? counts[rid] : 0;
      var ma = r.moduleAccess || {};
      var tags = [];
      if (ma.siteSettings) tags.push('站点');
      if (ma.seo) tags.push('SEO');
      if (ma.audit) tags.push('审计');
      if (ma.inviteRegister) tags.push('邀请');
      var tagsHtml = tags
        .map(function (t) {
          return '<span class="perm-tag">' + escapeHtml(t) + '</span>';
        })
        .join('');
      if (r.system) tagsHtml = '<span class="perm-tag">系统</span>' + tagsHtml;
      var rc = roleCardClassForId(rid);
      var title = escapeHtml(r.label || rid);
      var sub = escapeHtml(rid);
      return (
        '<button type="button" class="role-card ' +
        rc +
        '" data-role="' +
        escapeHtml(rid) +
        '">' +
        '<span class="rc-count">' +
        cnt +
        ' 人</span>' +
        '<div class="rc-icon">' +
        svgShield +
        '</div>' +
        '<h4>' +
        title +
        '</h4>' +
        '<p class="mono" style="margin-bottom:12px">' +
        sub +
        '</p>' +
        '<div class="rc-perms">' +
        tagsHtml +
        '</div>' +
        '</button>'
      );
    })
    .join('');
  host.innerHTML = html || '<p class="admin-muted" style="margin:0">暂无角色配置</p>';
}

function openModalBg(m) {
  if (!m) return;
  m.removeAttribute('hidden');
  requestAnimationFrame(function () {
    m.classList.add('show');
  });
}

function closeModalBg(m) {
  if (!m) return;
  m.classList.remove('show');
  setTimeout(function () {
    m.setAttribute('hidden', '');
  }, 200);
}

function openAdminNewUserModal() {
  var m = $('adminNewUserModal');
  if ($('adminUsersMsg')) {
    $('adminUsersMsg').textContent = '';
    $('adminUsersMsg').className = 'admin-msg';
  }
  var nu = $('newUserRole');
  function fillRolesAndShow() {
    var st = window.__roleProfilesCache;
    if (nu && st) {
      var pref = nu.value || 'editor';
      nu.innerHTML = buildRoleOptionsHtml(st, pref);
      var j;
      for (j = 0; j < nu.options.length; j++) {
        if (nu.options[j].value === pref) {
          nu.value = pref;
          break;
        }
      }
      if (j >= nu.options.length && nu.options[0]) nu.value = nu.options[0].value;
    }
    openModalBg(m);
  }
  if (nu && !window.__roleProfilesCache) {
    api('/api/admin/role-profiles')
      .then(function (fresh) {
        window.__roleProfilesCache = fresh;
        fillRolesAndShow();
      })
      .catch(function () {
        openModalBg(m);
      });
    return;
  }
  fillRolesAndShow();
}

function closeAdminNewUserModal() {
  closeModalBg($('adminNewUserModal'));
}

function openRoleProfileModal() {
  openModalBg($('roleProfileModal'));
}

function closeRoleProfileModal() {
  closeModalBg($('roleProfileModal'));
}

async function loadRoleProfilesPanel() {
  if (!window.__adminUser || window.__adminUser.role !== 'admin') return;
  try {
    const [st, usersRes] = await Promise.all([
      api('/api/admin/role-profiles'),
      api('/api/admin/users').catch(function () {
        return { users: [] };
      }),
    ]);
    window.__roleProfilesCache = st;
    var counts = countUsersByRole((usersRes && usersRes.users) || []);
    var sel = $('roleProfileSelect');
    if (sel) {
      var prev = sel.value || 'editor';
      sel.innerHTML = '';
      (st.order || []).forEach(function (rid) {
        var r = st.roles && st.roles[rid];
        if (!r) return;
        var opt = document.createElement('option');
        opt.value = rid;
        opt.textContent = (r.label || rid) + ' (' + rid + ')';
        sel.appendChild(opt);
      });
      if (st.roles && st.roles[prev]) sel.value = prev;
      else if (sel.options[0]) sel.value = sel.options[0].value;
      fillRoleProfileFormFromCache(sel.value);
      if (!sel._roleProfChangeBound) {
        sel._roleProfChangeBound = true;
        sel.addEventListener('change', function () {
          fillRoleProfileFormFromCache(sel.value);
        });
      }
    }
    renderRoleCards(st, counts);
    var statsEl = $('adminRolesHubStats');
    if (statsEl) {
      var order = st.order || [];
      var total = order.length;
      var sys = 0;
      order.forEach(function (rid) {
        var r = st.roles && st.roles[rid];
        if (r && r.system) sys += 1;
      });
      var custom = Math.max(0, total - sys);
      statsEl.innerHTML =
        '<div class="stat-card"><div class="stat-label">角色总数</div>' +
        '<div class="stat-value accent">' +
        total +
        '</div><div class="stat-sub">已配置角色</div></div>' +
        '<div class="stat-card"><div class="stat-label">内置</div>' +
        '<div class="stat-value purple">' +
        sys +
        '</div><div class="stat-sub">系统角色</div></div>' +
        '<div class="stat-card"><div class="stat-label">自定义</div>' +
        '<div class="stat-value blue">' +
        custom +
        '</div><div class="stat-sub">可删除（无用户占用时）</div></div>' +
        '<div class="stat-card"><div class="stat-label">存储键</div>' +
        '<div class="stat-value green">profiles</div><div class="stat-sub">site_kv / JSON</div></div>';
    }
  } catch (e) {
    console.warn(e);
  }
}

async function loadFiles() {
  var caps0 = window.__adminCapabilities || { siteSettings: false, seo: false, audit: false };
  var dv = window.__adminDataViews || defaultDataViews();

  if (dv.mainDoc) {
    try {
      await initAdminMainDocSlug();
    } catch (e) {
      console.warn(e);
    }
    const md = await api('/api/admin/files/markdown' + adminDocQ());
    setMainDocFullMarkdownValue(md.content || '');
    try {
      await refreshDocSections();
    } catch (e) {
      console.warn(e);
    }
  } else if ($('mdTa')) {
    setMainDocFullMarkdownValue('');
  }

  if (dv.landing) {
    const lj = await api('/api/admin/files/landing-json');
    if (lj.content) {
      try {
        populateLandingFromJson(JSON.parse(lj.content));
      } catch (e) {
        alert('门户配置解析失败：' + e.message);
      }
    }
  }

  if (caps0.seo) {
    const sj = await api('/api/admin/files/seo-json');
    if (sj.content) {
      try {
        populateSeoFromJson(JSON.parse(sj.content));
      } catch (e) {
        alert('SEO 配置解析失败：' + e.message);
      }
    }
  }

  if (dv.tools) {
    try {
      const tn = await api('/api/admin/tools-nav');
      populateToolsSite(tn.site || {});
      if (typeof window.refreshToolsNavEditorFromData === 'function') {
        window.refreshToolsNavEditorFromData(tn);
      }
    } catch (e) {}
  }

  if (caps0.siteSettings) {
    try {
      const ss = await api('/api/admin/site-settings');
      const en = $('site_maint_enabled');
      const msg = $('site_maint_message');
      if (en) en.checked = !!(ss.maintenance && ss.maintenance.enabled);
      const fs = $('site_maint_full_site');
      if (fs) fs.checked = !!(ss.maintenance && ss.maintenance.fullSite);
      if (msg) msg.value = (ss.maintenance && ss.maintenance.message) || '';
      const regSel = $('site_registration_mode');
      if (regSel) {
        let m = (ss.registration && ss.registration.mode) || 'invitation';
        if (m !== 'open' && m !== 'invitation') m = 'invitation';
        regSel.value = m;
        regSel.disabled = !(window.__adminUser && window.__adminUser.role === 'admin');
      }
      var embCard = $('siteEmbedAiCard');
      if (embCard) {
        embCard.classList.toggle(
          'admin-hidden',
          !(window.__adminUser && window.__adminUser.role === 'admin')
        );
      }
      var embTa = $('site_embed_ai_chat');
      if (embTa && window.__adminUser && window.__adminUser.role === 'admin') {
        embTa.value = (ss.embed && ss.embed.aiChatHtml) || '';
      }
    } catch (e) {}
  }
  syncDocSubNavForDataView();
}

function redisMaskUrlForDisplay(u) {
  if (!u || !String(u).trim()) return '—';
  var s = String(u).trim();
  try {
    var x = new URL(s);
    if (x.password) x.password = '***';
    return x.toString();
  } catch (err) {
    return s.replace(/:([^:@/]+)@/, ':***@');
  }
}

function updateRedisFormPreview() {
  var en = $('redis_enabled');
  var url = $('redis_url');
  var ce = $('redisCfgEnabled');
  var cu = $('redisCfgUrl');
  if (ce) ce.textContent = en && en.checked ? 'true' : 'false';
  if (cu) {
    if (!url || !String(url.value).trim()) cu.textContent = '""';
    else cu.textContent = '"' + redisMaskUrlForDisplay(url.value).replace(/"/g, '\\"') + '"';
  }
}

function applyRedisPanelStatus(d) {
  var rs = (d && d.redis) || {};
  var cache = (d && d.cache) || {};
  var badge = $('redisConnBadge');
  var dot = $('redisConnDot');
  var txt = $('redisConnText');
  var icon = $('redisServerIcon');
  var addr = $('redisConnAddr');
  var urlEl = $('redis_url');
  var srcEnv = $('redisSrcEnv');
  var srcDb = $('redisSrcDb');
  var hitR = $('redisCacheHitRate');
  if (badge && txt) {
    badge.className = 'redis-status-badge ';
    if (rs.connected) badge.className += 'sb-connected';
    else if (rs.urlConfigured) badge.className += 'sb-disconnected';
    else badge.className += 'sb-idle';
    txt.textContent = rs.connected ? '已连接' : rs.urlConfigured ? '未连通' : '未配置';
  }
  if (dot) {
    dot.classList.toggle('pulse', !!(rs.connected || (rs.urlConfigured && !rs.connected)));
  }
  if (icon) icon.classList.toggle('active', !!rs.connected);
  if (addr) {
    if (rs.source === 'env') addr.textContent = '环境变量 REDIS_URL';
    else if (rs.source === 'database' && urlEl && urlEl.value.trim())
      addr.textContent = redisMaskUrlForDisplay(urlEl.value);
    else addr.textContent = rs.urlConfigured ? '站点配置' : '—';
  }
  if (srcEnv) {
    srcEnv.textContent = rs.source === 'env' ? '● 生效中' : '未使用';
  }
  if (srcDb) {
    srcDb.textContent = rs.source === 'database' ? '● 生效中' : '未使用';
  }
  if (hitR) {
    var hr = cache.hitRate != null ? cache.hitRate : 0;
    hitR.textContent = (cache.totalRequests > 0 ? hr + '%' : '—') + (cache.totalRequests > 0 ? ' · ' + cache.hits + '/' + cache.totalRequests : '');
  }
  var h = $('redisStatHits');
  var m = $('redisStatMisses');
  var t = $('redisStatTotal');
  var ep = $('redisStatEpoch');
  if (h) h.textContent = String(cache.hits != null ? cache.hits : 0);
  if (m) m.textContent = String(cache.misses != null ? cache.misses : 0);
  if (t) t.textContent = String(cache.totalRequests != null ? cache.totalRequests : 0);
  if (ep) ep.textContent = String(cache.contentEpoch != null ? cache.contentEpoch : '—');
}

async function loadRedisPanel() {
  var msg = $('redisSettingsMsg');
  if (msg) {
    msg.textContent = '';
    msg.className = 'admin-msg';
  }
  if (!(window.__adminUser && window.__adminUser.role === 'admin')) return;
  try {
    const results = await Promise.all([
      api('/api/admin/site-settings'),
      api('/api/admin/redis').catch(function () {
        return null;
      }),
    ]);
    const ss = results[0];
    const dbg = results[1];
    const r = (ss && ss.redis) || {};
    var en = $('redis_enabled');
    var urlEl = $('redis_url');
    var hint = $('redisStatusHint');
    if (en) en.checked = !!r.enabled;
    window.__redisUrlConfiguredFromServer = !!(ss && ss.redisUrlConfigured);
    if (urlEl) {
      urlEl.value = r.url != null && String(r.url).trim() ? String(r.url) : '';
      urlEl.placeholder = window.__redisUrlConfiguredFromServer
        ? '已保存连接串（密码不返回；输入新地址可替换，留空并保存表示保持原值）'
        : '';
    }
    if (hint) {
      hint.textContent =
        (ss && ss.redisUrlPreview
          ? '当前站点配置预览（脱敏）：' + ss.redisUrlPreview + '。'
          : '') +
        '保存后立即按新配置尝试连接。若已设置环境变量 REDIS_URL，将始终优先使用该地址。';
    }
    updateRedisFormPreview();
    if (dbg) applyRedisPanelStatus(dbg);
  } catch (e) {
    if ($('redisSettingsMsg')) {
      $('redisSettingsMsg').textContent = e.message || String(e);
      $('redisSettingsMsg').className = 'admin-msg err';
    }
  }
}

async function loadAuditLog() {
  const host = $('auditLogHost');
  if (!host) return;
  host.innerHTML = '<p class="admin-tools-hint">加载中…</p>';
  try {
    const data = await api('/api/admin/audit-log?limit=150');
    const entries = data.entries || [];
    if (!entries.length) {
      host.innerHTML = '<p class="admin-tools-hint">暂无记录或审计已关闭。</p>';
      return;
    }
    const rows = entries
      .map(function (e) {
        const ts = e.ts || '';
        const act = e.action || '';
        const out = e.outcome || '';
        const rid = e.requestId || '';
        return (
          '<tr><td class="audit-td-ts">' +
          escapeHtmlAudit(ts) +
          '</td><td>' +
          escapeHtmlAudit(act) +
          '</td><td>' +
          escapeHtmlAudit(out) +
          '</td><td class="audit-td-rid">' +
          escapeHtmlAudit(rid) +
          '</td></tr>'
        );
      })
      .join('');
    host.innerHTML =
      '<table class="audit-log-table"><thead><tr><th>时间</th><th>操作</th><th>结果</th><th>requestId</th></tr></thead><tbody>' +
      rows +
      '</tbody></table>';
  } catch (err) {
    host.innerHTML =
      '<p class="admin-msg err">' + escapeHtmlAudit(err.message || String(err)) + '</p>';
  }
}

function escapeHtmlAudit(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function initAdminPanel() {
  await initAdminSidebarMenuOrderAndDrag();

  async function doLogout() {
    try {
      await api('/api/admin/logout', { method: 'POST' });
    } catch (e) {}
    var ret = encodeURIComponent((location.pathname + location.search) || '/admin');
    window.location.href = '/admin/login?return=' + ret;
  }
  $('btnLogoutNav').addEventListener('click', doLogout);
  const btnDash = $('btnLogoutDash');
  if (btnDash) btnDash.addEventListener('click', doLogout);

  $('btnSaveMd').addEventListener('click', async function () {
    $('mdMsg').textContent = '';
    $('mdMsg').className = 'admin-msg';
    try {
      const d = await api('/api/admin/files/markdown' + adminDocQ(), {
        method: 'PUT',
        body: JSON.stringify({ content: $('mdTa').value }),
      });
      mainDocFullMdSavedValue = $('mdTa').value || '';
      $('mdMsg').textContent = '已保存「' + getCurrentAdminDocDisplayName() + '」，当前 ' + d.sectionCount + ' 个章节';
      $('mdMsg').className = 'admin-msg ok';
      selectedDocSlug = null;
      updateMdTaChrome();
      await refreshDocSections();
      loadStats();
    } catch (e) {
      $('mdMsg').textContent = e.message;
      $('mdMsg').className = 'admin-msg err';
    }
  });

  var btnCopyMd = $('btnCopyMdTa');
  if (btnCopyMd) {
    btnCopyMd.addEventListener('click', async function () {
      var ta = $('mdTa');
      if (!ta) return;
      var t = ta.value || '';
      try {
        await navigator.clipboard.writeText(t);
        $('mdMsg').textContent = '已复制 ' + t.length + ' 字符';
        $('mdMsg').className = 'admin-msg ok';
      } catch (e) {
        ta.focus();
        ta.select();
        try {
          document.execCommand('copy');
          $('mdMsg').textContent = '已尝试复制（若失败请手动 Ctrl+C）';
          $('mdMsg').className = 'admin-msg ok';
        } catch (e2) {
          $('mdMsg').textContent = '复制失败，请全选后手动复制';
          $('mdMsg').className = 'admin-msg err';
        }
      }
    });
  }
  var btnDlMd = $('btnDownloadMdTa');
  if (btnDlMd) {
    btnDlMd.addEventListener('click', function () {
      var ta = $('mdTa');
      if (!ta) return;
      var name = (adminMainDocSlug || 'default') + '.md';
      var blob = new Blob([ta.value || ''], { type: 'text/markdown;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 4000);
      $('mdMsg').textContent = '已下载 ' + name;
      $('mdMsg').className = 'admin-msg ok';
    });
  }

  $('btnSaveToolsSite').addEventListener('click', async function () {
    $('toolsSiteMsg').textContent = '';
    $('toolsSiteMsg').className = 'admin-msg';
    try {
      await api('/api/admin/files/tools-site', {
        method: 'PUT',
        body: JSON.stringify({ site: collectToolsSite() }),
      });
      $('toolsSiteMsg').textContent = '站点信息已保存';
      $('toolsSiteMsg').className = 'admin-msg ok';
      loadStats();
    } catch (e) {
      $('toolsSiteMsg').textContent = e.message;
      $('toolsSiteMsg').className = 'admin-msg err';
    }
  });

  $('btnUploadToolsJson').addEventListener('click', async function () {
    $('toolsMsg').textContent = '';
    $('toolsMsg').className = 'admin-msg';
    const input = $('toolsFileInput');
    if (!input.files || !input.files[0]) {
      $('toolsMsg').textContent = '请先选择 JSON 文件';
      $('toolsMsg').className = 'admin-msg err';
      return;
    }
    try {
      const text = await new Promise(function (resolve, reject) {
        const fr = new FileReader();
        fr.onload = function () {
          resolve(fr.result);
        };
        fr.onerror = function () {
          reject(fr.error);
        };
        fr.readAsText(input.files[0], 'UTF-8');
      });
      JSON.parse(text);
      await api('/api/admin/files/tools-json', {
        method: 'PUT',
        body: JSON.stringify({ content: text }),
      });
      $('toolsMsg').textContent = '文件已上传并保存';
      $('toolsMsg').className = 'admin-msg ok';
      input.value = '';
      loadStats();
      const tn = await api('/api/admin/tools-nav');
      populateToolsSite(tn.site || {});
      if (typeof window.refreshToolsNavEditorFromData === 'function') {
        window.refreshToolsNavEditorFromData(tn);
      }
    } catch (e) {
      $('toolsMsg').textContent = e.message || String(e);
      $('toolsMsg').className = 'admin-msg err';
    }
  });

  $('btnSaveLanding').addEventListener('click', async function () {
    $('landingMsg').textContent = '';
    $('landingMsg').className = 'admin-msg';
    try {
      const obj = collectLandingToObject();
      const raw = JSON.stringify(obj, null, 2);
      await api('/api/admin/files/landing-json', {
        method: 'PUT',
        body: JSON.stringify({ content: raw }),
      });
      $('landingMsg').textContent = '门户配置已保存';
      $('landingMsg').className = 'admin-msg ok';
      loadStats();
    } catch (e) {
      $('landingMsg').textContent = e.message;
      $('landingMsg').className = 'admin-msg err';
    }
  });

  const btnSaveRoleProfile = $('btnSaveRoleProfile');
  if (btnSaveRoleProfile) {
    btnSaveRoleProfile.addEventListener('click', async function () {
      var msg = $('roleProfileMsg');
      if (msg) {
        msg.textContent = '';
        msg.className = 'admin-msg';
      }
      var sel = $('roleProfileSelect');
      var roleId = (sel && sel.value) || 'editor';
      try {
        await api('/api/admin/role-profiles', {
          method: 'PUT',
          body: JSON.stringify({
            role: roleId,
            label: ($('roleProfileLabelInput') && $('roleProfileLabelInput').value) || '',
            securityLevel: ($('roleSecurityLevelSelect') && $('roleSecurityLevelSelect').value) || 'internal',
            securityNote: ($('roleSecurityDocTa') && $('roleSecurityDocTa').value) || '',
            moduleAccess: {
              siteSettings: !!($('cap_editor_site') && $('cap_editor_site').checked),
              seo: !!($('cap_editor_seo') && $('cap_editor_seo').checked),
              audit: !!($('cap_editor_audit') && $('cap_editor_audit').checked),
              inviteRegister: !!($('cap_editor_invite') && $('cap_editor_invite').checked),
            },
            dataViews: {
              mainDoc: !!($('cap_dv_mainDoc') && $('cap_dv_mainDoc').checked),
              tools: !!($('cap_dv_tools') && $('cap_dv_tools').checked),
              landing: !!($('cap_dv_landing') && $('cap_dv_landing').checked),
              extraPages: !!($('cap_dv_extraPages') && $('cap_dv_extraPages').checked),
              images: !!($('cap_dv_images') && $('cap_dv_images').checked),
              stats: !!($('cap_dv_stats') && $('cap_dv_stats').checked),
            },
          }),
        });
        await loadRoleProfilesPanel();
        if (msg) {
          msg.textContent = '已保存（该角色已登录用户需刷新后生效）';
          msg.className = 'admin-msg ok';
        }
      } catch (e) {
        if (msg) {
          msg.textContent = e.message || String(e);
          msg.className = 'admin-msg err';
        }
      }
    });
  }

  const btnCreateRole = $('btnCreateRoleProfile');
  if (btnCreateRole) {
    btnCreateRole.addEventListener('click', async function () {
      var msg = $('roleProfileCrudMsg');
      if (msg) {
        msg.textContent = '';
        msg.className = 'admin-msg';
      }
      var rid = ($('newRoleIdInput') && $('newRoleIdInput').value.trim()) || '';
      var lab = ($('newRoleLabelInput') && $('newRoleLabelInput').value.trim()) || '';
      try {
        await api('/api/admin/role-profiles', {
          method: 'POST',
          body: JSON.stringify({ roleId: rid, label: lab }),
        });
        const st = await api('/api/admin/role-profiles');
        window.__roleProfilesCache = st;
        if ($('newRoleIdInput')) $('newRoleIdInput').value = '';
        if ($('newRoleLabelInput')) $('newRoleLabelInput').value = '';
        if (msg) {
          msg.textContent = '已新增角色';
          msg.className = 'admin-msg ok';
        }
        await loadRoleProfilesPanel();
      } catch (e) {
        if (msg) {
          msg.textContent = e.message || String(e);
          msg.className = 'admin-msg err';
        }
      }
    });
  }

  const btnDelRole = $('btnDeleteRoleProfile');
  if (btnDelRole) {
    btnDelRole.addEventListener('click', async function () {
      var sel = $('roleProfileSelect');
      var roleId = (sel && sel.value) || '';
      if (!roleId) return;
      if (!confirm('确定删除角色「' + roleId + '」？（无账号使用才可删除）')) return;
      var msg = $('roleProfileCrudMsg');
      if (msg) {
        msg.textContent = '';
        msg.className = 'admin-msg';
      }
      try {
        await api('/api/admin/role-profiles/' + encodeURIComponent(roleId), { method: 'DELETE' });
        const st = await api('/api/admin/role-profiles');
        window.__roleProfilesCache = st;
        if (msg) {
          msg.textContent = '已删除';
          msg.className = 'admin-msg ok';
        }
        await loadRoleProfilesPanel();
      } catch (e) {
        if (msg) {
          msg.textContent = e.message || String(e);
          msg.className = 'admin-msg err';
        }
      }
    });
  }

  var dashHost0 = $('dashboardHost');
  if (dashHost0 && !dashHost0._dashDeleg) {
    dashHost0._dashDeleg = true;
    dashHost0.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('#btnRefreshDashboard')) {
        e.preventDefault();
        loadDashboard();
        return;
      }
      var copyCodeBtn = e.target.closest && e.target.closest('.dr-invite-copy-btn');
      if (copyCodeBtn) {
        e.preventDefault();
        var rawCode = copyCodeBtn.getAttribute('data-code') || '';
        if (!rawCode) return;
        copyTextToClipboard(rawCode).then(
          function () {
            toastAdminDash('已复制邀请码');
          },
          function () {
            try {
              window.prompt('请复制邀请码', rawCode);
            } catch (_) {}
          }
        );
        return;
      }
      var copyB = e.target.closest && e.target.closest('.dashboard-copy-link');
      if (copyB) {
        e.preventDefault();
        var code = copyB.getAttribute('data-code') || '';
        if (!code) return;
        var url = inviteRegisterUrl(code);
        copyTextToClipboard(url).then(
          function () {
            toastAdminDash('已复制邀请链接');
          },
          function () {
            try {
              window.prompt('请复制邀请链接', url);
            } catch (_) {}
          }
        );
        return;
      }
      var createBtn = e.target.closest && e.target.closest('.dashboard-gen-invite');
      if (!createBtn) return;
      e.preventDefault();
      var msg = $('dashboardInviteMsg');
      if (msg) {
        msg.textContent = '';
        msg.className = 'admin-msg';
      }
      api('/api/admin/invites', {
        method: 'POST',
        body: JSON.stringify({ maxUses: 1, expiresDays: 30, defaultRole: 'editor' }),
      })
        .then(function (r) {
          if (r.invite && r.invite.code) {
            var u = inviteRegisterUrl(r.invite.code);
            copyTextToClipboard(u).then(
              function () {
                toastAdminDash('已生成并复制邀请链接');
              },
              function () {
                if (msg) {
                  msg.textContent = '已生成，请复制链接：' + r.invite.code;
                  msg.className = 'admin-msg ok';
                }
              }
            );
          }
          loadDashboard();
        })
        .catch(function (err) {
          if (msg) {
            msg.textContent = err.message || String(err);
            msg.className = 'admin-msg err';
          }
        });
    });
  }

  var redisUrlEl = $('redis_url');
  if (redisUrlEl) {
    redisUrlEl.addEventListener('input', updateRedisFormPreview);
  }
  var redisEnEl = $('redis_enabled');
  if (redisEnEl) {
    redisEnEl.addEventListener('change', updateRedisFormPreview);
  }

  const btnRedisTest = $('btnRedisTest');
  if (btnRedisTest) {
    btnRedisTest.addEventListener('click', async function () {
      if (!window.__adminUser || window.__adminUser.role !== 'admin') return;
      var msg = $('redisSettingsMsg');
      if (msg) {
        msg.textContent = '';
        msg.className = 'admin-msg';
      }
      try {
        var u = ($('redis_url') && $('redis_url').value) || '';
        var r = await api('/api/admin/redis/test', {
          method: 'POST',
          body: JSON.stringify({ url: u.trim() }),
        });
        if (msg) {
          if (r.ok) {
            msg.textContent = u.trim() ? '指定地址连接成功' : '当前连接成功';
            msg.className = 'admin-msg ok';
          } else {
            var errPart = r.error || (r.ping && r.ping.error) || '未知';
            msg.textContent = '失败：' + errPart;
            msg.className = 'admin-msg err';
          }
        }
        loadRedisPanel();
      } catch (e) {
        var msg2 = $('redisSettingsMsg');
        if (msg2) {
          msg2.textContent = e.message || String(e);
          msg2.className = 'admin-msg err';
        }
      }
    });
  }

  const btnRedisResetStats = $('btnRedisResetCacheStats');
  if (btnRedisResetStats) {
    btnRedisResetStats.addEventListener('click', async function () {
      if (!window.__adminUser || window.__adminUser.role !== 'admin') return;
      try {
        await api('/api/admin/redis/reset-cache-stats', { method: 'POST', body: '{}' });
        loadRedisPanel();
      } catch (e) {
        alert(e.message || String(e));
      }
    });
  }

  const btnRedis = $('btnSaveRedis');
  if (btnRedis) {
    btnRedis.addEventListener('click', async function () {
      if (!window.__adminUser || window.__adminUser.role !== 'admin') return;
      if ($('redisSettingsMsg')) {
        $('redisSettingsMsg').textContent = '';
        $('redisSettingsMsg').className = 'admin-msg';
      }
      try {
        var ru = ($('redis_url') && $('redis_url').value.trim()) || '';
        var redisPayload = {
          enabled: !!($('redis_enabled') && $('redis_enabled').checked),
        };
        if (ru) redisPayload.url = ru;
        else if (!window.__redisUrlConfiguredFromServer) redisPayload.url = '';
        await api('/api/admin/site-settings', {
          method: 'PUT',
          body: JSON.stringify({ redis: redisPayload }),
        });
        if ($('redisSettingsMsg')) {
          $('redisSettingsMsg').textContent = '已保存并已尝试连接';
          $('redisSettingsMsg').className = 'admin-msg ok';
        }
        if (typeof loadDashboard === 'function') loadDashboard();
        loadRedisPanel();
      } catch (e) {
        if ($('redisSettingsMsg')) {
          $('redisSettingsMsg').textContent = e.message || String(e);
          $('redisSettingsMsg').className = 'admin-msg err';
        }
      }
    });
  }

  const btnSite = $('btnSaveSiteSettings');
  if (btnSite) {
    btnSite.addEventListener('click', async function () {
      $('siteSettingsMsg').textContent = '';
      $('siteSettingsMsg').className = 'admin-msg';
      try {
        var sitePayload = {
          maintenance: {
            enabled: !!$('site_maint_enabled').checked,
            fullSite: !!($('site_maint_full_site') && $('site_maint_full_site').checked),
            message: ($('site_maint_message') && $('site_maint_message').value) || '',
          },
          registration: {
            mode:
              ($('site_registration_mode') && $('site_registration_mode').value === 'open'
                ? 'open'
                : 'invitation'),
          },
        };
        if (window.__adminUser && window.__adminUser.role === 'admin') {
          sitePayload.embed = {
            aiChatHtml: ($('site_embed_ai_chat') && $('site_embed_ai_chat').value) || '',
          };
        }
        await api('/api/admin/site-settings', {
          method: 'PUT',
          body: JSON.stringify(sitePayload),
        });
        $('siteSettingsMsg').textContent = '已保存';
        $('siteSettingsMsg').className = 'admin-msg ok';
        loadStats();
        if ($('site_maint_enabled') && $('site_maint_enabled').checked) {
          window.location.assign('/maintenance');
        }
      } catch (e) {
        $('siteSettingsMsg').textContent = e.message;
        $('siteSettingsMsg').className = 'admin-msg err';
      }
    });
  }

  const btnRefreshAudit = $('btnRefreshAudit');
  if (btnRefreshAudit) {
    btnRefreshAudit.addEventListener('click', function () {
      loadAuditLog();
    });
  }

  $('btnSaveSeo').addEventListener('click', async function () {
    $('seoMsg').textContent = '';
    $('seoMsg').className = 'admin-msg';
    try {
      const obj = collectSeoToObject();
      const raw = JSON.stringify(obj, null, 2);
      await api('/api/admin/files/seo-json', {
        method: 'PUT',
        body: JSON.stringify({ content: raw }),
      });
      $('seoMsg').textContent = 'SEO 已保存';
      $('seoMsg').className = 'admin-msg ok';
      loadStats();
    } catch (e) {
      $('seoMsg').textContent = e.message;
      $('seoMsg').className = 'admin-msg err';
    }
  });

  var tabTitles = {
    dash: '数据看板',
    md: '文档管理',
    tools: '工具导航',
    landing: '门户首页',
    site: '站点设置',
    seo: 'SEO 设置',
    audit: '操作日志',
    users: '用户管理',
    roles: '角色管理',
    redis: 'Redis',
    upgrade: '系统升级',
    menu: '菜单显示',
  };

  function docCrumbTitle() {
    if (window.__docSub === 'extra') return '文档管理 · 扩展页面';
    return '文档管理';
  }

  function initDocSubNav() {
    if (!$('docSubMain') || !$('docSubExtra')) return;
    window.__docSub = 'main';
    document.querySelectorAll('.admin-docs-subnav-btn[data-doc-sub]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var sub = btn.getAttribute('data-doc-sub');
        window.__docSub = sub === 'extra' ? 'extra' : 'main';
        document.querySelectorAll('.admin-docs-subnav-btn[data-doc-sub]').forEach(function (b) {
          b.classList.toggle('active', b.getAttribute('data-doc-sub') === sub);
        });
        $('docSubMain').classList.toggle('admin-hidden', sub !== 'main');
        $('docSubExtra').classList.toggle('admin-hidden', sub !== 'extra');
        var crumb = $('ryCrumbTitle');
        if (crumb) crumb.textContent = docCrumbTitle();
        if (sub === 'extra' && typeof window.loadExtraPagesList === 'function') {
          window.loadExtraPagesList();
        }
        if (sub === 'main' && typeof window.refreshAdminImageList === 'function') {
          window.refreshAdminImageList();
        }
      });
    });
  }

  function showAdminToast(msg) {
    var el = $('adminToast');
    if (!el) return;
    el.textContent = msg;
    el.removeAttribute('hidden');
    el.classList.add('show');
    clearTimeout(showAdminToast._t);
    showAdminToast._t = setTimeout(function () {
      el.classList.remove('show');
      el.setAttribute('hidden', '');
    }, 2200);
  }

  function openAdminPwdModal(userId) {
    var m = $('adminPwdModal');
    var idEl = $('adminPwdUserId');
    var a = $('adminPwdInput1');
    var b = $('adminPwdInput2');
    if (!m || !idEl) return;
    idEl.value = String(userId);
    if (a) a.value = '';
    if (b) b.value = '';
    m.removeAttribute('hidden');
    requestAnimationFrame(function () {
      m.classList.add('show');
    });
  }

  function closeAdminPwdModal() {
    var m = $('adminPwdModal');
    if (!m) return;
    m.classList.remove('show');
    setTimeout(function () {
      m.setAttribute('hidden', '');
    }, 200);
  }

  function loadPasskeyListForModal(userId) {
    var host = $('adminPasskeyList');
    if (!host) return;
    host.innerHTML = '<p class="admin-muted">加载中…</p>';
    api('/api/admin/users/' + userId + '/passkeys')
      .then(function (d) {
        var list = (d && d.passkeys) || [];
        if (!list.length) {
          host.innerHTML = '<p class="admin-muted">暂无绑定</p>';
          return;
        }
        host.innerHTML =
          '<ul style="list-style:none;padding:0;margin:0">' +
          list
            .map(function (p) {
              return (
                '<li style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)"><span>' +
                escapeHtml(p.label || '通行密钥') +
                ' <span class="admin-muted">#' +
                p.id +
                '</span></span><button type="button" class="btn btn-ghost btn-sm" data-pk-del="' +
                p.id +
                '">删除</button></li>'
              );
            })
            .join('') +
          '</ul>';
      })
      .catch(function (err) {
        host.innerHTML =
          '<p class="admin-msg err">' + escapeHtml(err.message || String(err)) + '</p>';
      });
  }

  function openAdminPasskeyModal(userId) {
    var m = $('adminPasskeyModal');
    var idEl = $('adminPasskeyUserId');
    var lab = $('adminPasskeyLabel');
    if (!m || !idEl) return;
    idEl.value = String(userId);
    if (lab) lab.value = '';
    loadPasskeyListForModal(userId);
    m.removeAttribute('hidden');
    requestAnimationFrame(function () {
      m.classList.add('show');
    });
  }

  function closeAdminPasskeyModal() {
    var m = $('adminPasskeyModal');
    if (!m) return;
    m.classList.remove('show');
    setTimeout(function () {
      m.setAttribute('hidden', '');
    }, 200);
  }

  function loadAdminUsers() {
    var host = $('adminUsersHost');
    var statsEl = $('adminUsersStats');
    if (!host) return;
    host.innerHTML = '<p class="admin-muted">加载中…</p>';
    if (statsEl) statsEl.innerHTML = '';
    Promise.all([api('/api/admin/users'), api('/api/admin/role-profiles')])
      .then(function (results) {
        var d = results[0];
        var st = results[1];
        var nu = $('newUserRole');
        if (nu) {
          var pref = nu.value || 'editor';
          nu.innerHTML = buildRoleOptionsHtml(st, pref);
          var j;
          for (j = 0; j < nu.options.length; j++) {
            if (nu.options[j].value === pref) {
              nu.value = pref;
              break;
            }
          }
          if (j >= nu.options.length && nu.options[0]) nu.value = nu.options[0].value;
        }
        var users = (d && d.users) || [];
        var total = users.length;
        var adminN = users.filter(function (u) {
          return u.role === 'admin' && !u.disabled;
        }).length;
        var activeN = users.filter(function (u) {
          return !u.disabled;
        }).length;
        if (statsEl) {
          statsEl.innerHTML =
            '<div class="stat-card"><div class="stat-label">总用户</div>' +
            '<div class="stat-value accent">' +
            total +
            '</div>' +
            '<div class="stat-sub">共 ' +
            total +
            ' 个账号</div></div>' +
            '<div class="stat-card"><div class="stat-label">管理员</div>' +
            '<div class="stat-value purple">' +
            adminN +
            '</div>' +
            '<div class="stat-sub">角色为 admin 且未禁用</div></div>' +
            '<div class="stat-card"><div class="stat-label">正常状态</div>' +
            '<div class="stat-value green">' +
            activeN +
            '</div>' +
            '<div class="stat-sub">未禁用的账号</div></div>' +
            '<div class="stat-card"><div class="stat-label">安全存储</div>' +
            '<div class="stat-value blue">scrypt</div>' +
            '<div class="stat-sub">密码哈希算法</div></div>';
        }
        if (!users.length) {
          host.innerHTML =
            '<p class="admin-muted" style="padding:16px 18px">暂无账号（请检查环境变量 <code>ADMIN_PASSWORD</code> 是否已创建首个管理员）</p>';
          return;
        }
        var svgSave =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>';
        var svgPwd =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>';
        var svgPk =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>';
        var svgBan =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>';
        var svgDel =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>';
        var rows = users
          .map(function (u, idx) {
            var av = 'av-' + ((idx % 4) + 1);
            var initial = String(u.username || '?').trim().charAt(0).toUpperCase();
            var roleSel =
              '<select class="form-input admin-user-role" data-uid="' +
              u.id +
              '">' +
              buildRoleOptionsHtml(st, u.role) +
              '</select>';
            var stHtml = u.disabled
              ? '<span class="status status-disabled"><span class="status-dot"></span>已禁用</span>'
              : '<span class="status status-active"><span class="status-dot"></span>正常</span>';
            return (
              '<tr data-uid="' +
              u.id +
              '" data-disabled="' +
              (u.disabled ? '1' : '0') +
              '"><td><div class="user-cell">' +
              '<div class="user-av ' +
              av +
              '">' +
              escapeHtml(initial) +
              '</div><div class="user-meta"><div class="uname">' +
              escapeHtml(u.username) +
              '</div><div class="email">#' +
              u.id +
              ' · ' +
              escapeHtml(roleLabelFromStore(st, u.role)) +
              '</div></div></div></td><td>' +
              roleSel +
              '</td><td>' +
              stHtml +
              '</td><td><div class="act-btns">' +
              '<button type="button" class="act-btn admin-user-save" data-uid="' +
              u.id +
              '" title="保存角色">' +
              svgSave +
              '</button>' +
              '<button type="button" class="act-btn admin-user-pwd" data-uid="' +
              u.id +
              '" title="修改密码">' +
              svgPwd +
              '</button>' +
              '<button type="button" class="act-btn admin-user-passkey" data-uid="' +
              u.id +
              '" title="通行密钥">' +
              svgPk +
              '</button>' +
              '<button type="button" class="act-btn admin-user-toggle" data-uid="' +
              u.id +
              '" title="' +
              (u.disabled ? '启用' : '禁用') +
              '">' +
              svgBan +
              '</button>' +
              '<button type="button" class="act-btn danger admin-user-del" data-uid="' +
              u.id +
              '" title="删除">' +
              svgDel +
              '</button>' +
              '</div></td></tr>'
            );
          })
          .join('');
        host.innerHTML =
          '<table class="tbl"><thead><tr><th>用户</th><th>角色</th><th>状态</th><th>操作</th></tr></thead><tbody>' +
          rows +
          '</tbody></table>';
      })
      .catch(function (err) {
        host.innerHTML =
          '<p class="admin-msg err" style="padding:16px 18px">' + escapeHtml(err.message || String(err)) + '</p>';
      });
  }


  var adminUsersHost = $('adminUsersHost');
  if (adminUsersHost) {
    adminUsersHost.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('button[data-uid]');
      if (!t || !t.getAttribute) return;
      var uid = t.getAttribute('data-uid');
      if (!uid) return;
      var id = parseInt(uid, 10);
      if (t.classList.contains('admin-user-save')) {
        var row = adminUsersHost.querySelector('tr[data-uid="' + uid + '"]');
        var sel = row && row.querySelector('select.admin-user-role');
        var role = sel ? sel.value : 'editor';
        $('adminUsersMsg').textContent = '';
        $('adminUsersMsg').className = 'admin-msg';
        api('/api/admin/users/' + id, {
          method: 'PUT',
          body: JSON.stringify({ role: role }),
        })
          .then(function () {
            showAdminToast('角色已保存');
            if ($('adminUsersMsg')) {
              $('adminUsersMsg').textContent = '';
              $('adminUsersMsg').className = 'admin-msg';
            }
            loadAdminUsers();
          })
          .catch(function (err) {
            $('adminUsersMsg').textContent = err.message || String(err);
            $('adminUsersMsg').className = 'admin-msg err';
          });
        return;
      }
      if (t.classList.contains('admin-user-pwd')) {
        openAdminPwdModal(id);
        return;
      }
      if (t.classList.contains('admin-user-passkey')) {
        openAdminPasskeyModal(id);
        return;
      }
      if (t.classList.contains('admin-user-toggle')) {
        var row2 = adminUsersHost.querySelector('tr[data-uid="' + uid + '"]');
        var dis = row2 && row2.getAttribute('data-disabled') === '1';
        $('adminUsersMsg').textContent = '';
        $('adminUsersMsg').className = 'admin-msg';
        api('/api/admin/users/' + id, {
          method: 'PUT',
          body: JSON.stringify({ disabled: !dis }),
        })
          .then(function () {
            showAdminToast(dis ? '用户已启用' : '用户已禁用');
            loadAdminUsers();
          })
          .catch(function (err) {
            $('adminUsersMsg').textContent = err.message || String(err);
            $('adminUsersMsg').className = 'admin-msg err';
          });
        return;
      }
      if (t.classList.contains('admin-user-del')) {
        if (!confirm('确定删除该用户？')) return;
        $('adminUsersMsg').textContent = '';
        $('adminUsersMsg').className = 'admin-msg';
        api('/api/admin/users/' + id, { method: 'DELETE' })
          .then(function () {
            showAdminToast('用户已删除');
            loadAdminUsers();
          })
          .catch(function (err) {
            $('adminUsersMsg').textContent = err.message || String(err);
            $('adminUsersMsg').className = 'admin-msg err';
          });
      }
    });
  }

  var btnCreateUser = $('btnCreateUser');
  if (btnCreateUser) {
    btnCreateUser.addEventListener('click', function () {
      var name = ($('newUserName') && $('newUserName').value.trim()) || '';
      var pw = ($('newUserPwd') && $('newUserPwd').value) || '';
      var role = ($('newUserRole') && $('newUserRole').value) || 'editor';
      $('adminUsersMsg').textContent = '';
      $('adminUsersMsg').className = 'admin-msg';
      api('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ username: name, password: pw, role: role }),
      })
        .then(function () {
          $('adminUsersMsg').textContent = '';
          if ($('newUserName')) $('newUserName').value = '';
          if ($('newUserPwd')) $('newUserPwd').value = '';
          closeAdminNewUserModal();
          showAdminToast('用户已创建');
          loadAdminUsers();
        })
        .catch(function (err) {
          $('adminUsersMsg').textContent = err.message || String(err);
          $('adminUsersMsg').className = 'admin-msg err';
        });
    });
  }

  var btnAdminNewUser = $('btnAdminNewUser');
  if (btnAdminNewUser) {
    btnAdminNewUser.addEventListener('click', function () {
      openAdminNewUserModal();
    });
  }
  var btnAdminNewUserCancel = $('btnAdminNewUserCancel');
  if (btnAdminNewUserCancel) {
    btnAdminNewUserCancel.addEventListener('click', function () {
      closeAdminNewUserModal();
    });
  }
  var adminNewUserModal = $('adminNewUserModal');
  if (adminNewUserModal) {
    adminNewUserModal.addEventListener('click', function (e) {
      if (e.target === adminNewUserModal) closeAdminNewUserModal();
    });
  }
  var roleCardsHostEl = $('roleCardsHost');
  if (roleCardsHostEl && !roleCardsHostEl._roleCardClickBound) {
    roleCardsHostEl._roleCardClickBound = true;
    roleCardsHostEl.addEventListener('click', function (e) {
      var card = e.target.closest && e.target.closest('.role-card[data-role]');
      if (!card) return;
      var rid = card.getAttribute('data-role');
      if (!rid) return;
      var sel = $('roleProfileSelect');
      if (sel) {
        sel.value = rid;
        fillRoleProfileFormFromCache(rid);
      }
      openRoleProfileModal();
    });
  }
  var btnRoleProfileModalCancel = $('btnRoleProfileModalCancel');
  if (btnRoleProfileModalCancel) {
    btnRoleProfileModalCancel.addEventListener('click', closeRoleProfileModal);
  }
  var roleProfileModal = $('roleProfileModal');
  if (roleProfileModal) {
    roleProfileModal.addEventListener('click', function (e) {
      if (e.target === roleProfileModal) closeRoleProfileModal();
    });
  }
  var btnAdminUsersRefresh = $('btnAdminUsersRefresh');
  if (btnAdminUsersRefresh) {
    btnAdminUsersRefresh.addEventListener('click', function () {
      loadAdminUsers();
      showAdminToast('列表已刷新');
    });
  }
  var btnAdminRolesRefresh = $('btnAdminRolesRefresh');
  if (btnAdminRolesRefresh) {
    btnAdminRolesRefresh.addEventListener('click', function () {
      loadRoleProfilesPanel();
      showAdminToast('角色配置已重新加载');
    });
  }
  var btnAdminMenuRefresh = $('btnAdminMenuRefresh');
  if (btnAdminMenuRefresh) {
    btnAdminMenuRefresh.addEventListener('click', function () {
      renderMenuOrderPanel();
      showAdminToast('菜单列表已刷新');
    });
  }
  document.querySelectorAll('.admin-hub-bc-dash').forEach(function (btn) {
    btn.addEventListener('click', function () {
      switchAdminTab('dash');
    });
  });

  document.querySelectorAll('.admin-hub .tab[data-hub-tab]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var t = btn.getAttribute('data-hub-tab');
      if (t === 'users') switchAdminTab('users');
      else if (t === 'roles') switchAdminTab('roles');
      else if (t === 'menu') switchAdminTab('menu');
    });
  });

  var btnAdminPwd = $('btnAdminPwdConfirm');
  if (btnAdminPwd) {
    btnAdminPwd.addEventListener('click', function () {
      var id = parseInt(($('adminPwdUserId') && $('adminPwdUserId').value) || '', 10);
      var a = ($('adminPwdInput1') && $('adminPwdInput1').value) || '';
      var b = ($('adminPwdInput2') && $('adminPwdInput2').value) || '';
      if (!Number.isFinite(id)) return;
      if (String(a).length < 8) {
        showAdminToast('密码至少 8 位');
        return;
      }
      if (a !== b) {
        showAdminToast('两次密码不一致');
        return;
      }
      api('/api/admin/users/' + id, {
        method: 'PUT',
        body: JSON.stringify({ password: a }),
      })
        .then(function () {
          closeAdminPwdModal();
          showAdminToast('密码已更新');
          loadAdminUsers();
        })
        .catch(function (err) {
          showAdminToast(err.message || String(err));
        });
    });
  }
  var btnAdminPwdCancel = $('btnAdminPwdCancel');
  if (btnAdminPwdCancel) {
    btnAdminPwdCancel.addEventListener('click', closeAdminPwdModal);
  }
  var adminPwdModal = $('adminPwdModal');
  if (adminPwdModal) {
    adminPwdModal.addEventListener('click', function (e) {
      if (e.target === adminPwdModal) closeAdminPwdModal();
    });
  }

  var btnAdminPasskeyRegister = $('btnAdminPasskeyRegister');
  if (btnAdminPasskeyRegister) {
    btnAdminPasskeyRegister.addEventListener('click', function () {
      var uid = parseInt(($('adminPasskeyUserId') && $('adminPasskeyUserId').value) || '', 10);
      var label = ($('adminPasskeyLabel') && $('adminPasskeyLabel').value.trim()) || '';
      if (!window.webauthnClient || !webauthnClient.supported()) {
        showAdminToast('当前浏览器不支持通行密钥（WebAuthn）');
        return;
      }
      if (!Number.isFinite(uid)) return;
      api('/api/admin/webauthn/registration/options', {
        method: 'POST',
        body: JSON.stringify({ userId: uid }),
      })
        .then(function (d) {
          var opts = webauthnClient.prepareCreateOptions(d.options);
          return navigator.credentials.create({ publicKey: opts }).then(function (cred) {
            var json = webauthnClient.registrationToJSON(cred);
            if (!json) throw new Error('无法读取注册结果');
            return api('/api/admin/webauthn/registration/verify', {
              method: 'POST',
              body: JSON.stringify({
                challengeId: d.challengeId,
                userId: uid,
                credential: json,
                label: label,
              }),
            });
          });
        })
        .then(function () {
          showAdminToast('通行密钥已绑定');
          loadPasskeyListForModal(uid);
        })
        .catch(function (err) {
          showAdminToast(err.message || String(err));
        });
    });
  }
  var btnAdminPasskeyCancel = $('btnAdminPasskeyCancel');
  if (btnAdminPasskeyCancel) {
    btnAdminPasskeyCancel.addEventListener('click', closeAdminPasskeyModal);
  }
  var adminPasskeyModal = $('adminPasskeyModal');
  if (adminPasskeyModal) {
    adminPasskeyModal.addEventListener('click', function (e) {
      if (e.target === adminPasskeyModal) closeAdminPasskeyModal();
      var delBtn = e.target.closest && e.target.closest('[data-pk-del]');
      if (delBtn && adminPasskeyModal.contains(delBtn)) {
        var pkId = delBtn.getAttribute('data-pk-del');
        if (!pkId || !confirm('确定删除该通行密钥？')) return;
        var uid = parseInt(($('adminPasskeyUserId') && $('adminPasskeyUserId').value) || '', 10);
        api('/api/admin/passkeys/' + pkId, { method: 'DELETE' })
          .then(function () {
            showAdminToast('已删除');
            if (Number.isFinite(uid)) loadPasskeyListForModal(uid);
          })
          .catch(function (err) {
            showAdminToast(err.message || String(err));
          });
      }
    });
  }

  function switchAdminTab(name) {
    document.querySelectorAll('.admin-hub .tab[data-hub-tab]').forEach(function (b) {
      var hub = b.getAttribute('data-hub-tab');
      var on = hub === name;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('.ry-menu-item[data-tab]').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-tab') === name);
    });
    var pd = $('panelDashboard');
    if (pd) pd.classList.toggle('active', name === 'dash');
    $('panelMd').classList.toggle('active', name === 'md');
    $('panelTools').classList.toggle('active', name === 'tools');
    $('panelLanding').classList.toggle('active', name === 'landing');
    $('panelSite').classList.toggle('active', name === 'site');
    $('panelSeo').classList.toggle('active', name === 'seo');
    $('panelAudit').classList.toggle('active', name === 'audit');
    $('panelUsers').classList.toggle('active', name === 'users');
    $('panelRoles').classList.toggle('active', name === 'roles');
    var pr = $('panelRedis');
    if (pr) pr.classList.toggle('active', name === 'redis');
    var pu = $('panelUpgrade');
    if (pu) pu.classList.toggle('active', name === 'upgrade');
    $('panelMenu').classList.toggle('active', name === 'menu');
    if (name === 'dash') {
      loadDashboard();
    }
    if (name === 'audit') {
      loadAuditLog();
    }
    if (name === 'site') {
      loadStats();
    }
    if (name === 'users') {
      loadAdminUsers();
    }
    if (name === 'roles') {
      loadRoleProfilesPanel();
    }
    if (name === 'menu') {
      renderMenuOrderPanel();
    }
    if (name === 'redis') {
      loadRedisPanel();
    }
    if (name === 'upgrade') {
      if (typeof window.loadUpgradePanel === 'function') window.loadUpgradePanel();
    }
    var crumb = $('ryCrumbTitle');
    if (crumb) {
      crumb.textContent = name === 'md' ? docCrumbTitle() : tabTitles[name] || name;
    }
  }

  var asideSidebar = document.querySelector('.ry-sidebar');
  if (asideSidebar) {
    asideSidebar.addEventListener('click', function (e) {
      if (Date.now() < suppressAdminMenuClickUntil) return;
      var tabBtn = e.target.closest && e.target.closest('.ry-menu-item[data-tab]');
      if (!tabBtn) return;
      switchAdminTab(tabBtn.getAttribute('data-tab'));
    });
  }

  var panelMenuEl = $('panelMenu');
  if (panelMenuEl && !panelMenuEl._menuPanelBound) {
    panelMenuEl._menuPanelBound = true;
    panelMenuEl.addEventListener('click', function (e) {
      var t = e.target;
      if (t.classList.contains('menu-order-up')) {
        var iu = parseInt(t.getAttribute('data-i'), 10);
        if (!Number.isNaN(iu)) swapMenuOrderIndices(iu, -1);
        return;
      }
      if (t.classList.contains('menu-order-down')) {
        var idxDn = parseInt(t.getAttribute('data-i'), 10);
        if (!Number.isNaN(idxDn)) swapMenuOrderIndices(idxDn, 1);
        return;
      }
      if (t.id === 'btnSaveMenuOrderPanel') {
        var m0 = $('menuOrderPanelMsg');
        if (m0) {
          m0.textContent = '';
          m0.className = 'admin-msg';
        }
        persistAdminMenuOrderToServer().then(function (ok) {
          if (ok) {
            var m = $('menuOrderPanelMsg');
            if (m) {
              m.textContent = '已保存';
              m.className = 'admin-msg ok';
            }
          }
        });
        return;
      }
      if (t.id === 'btnResetMenuOrderPanel') {
        if (!window.__adminUser || window.__adminUser.role !== 'admin') return;
        api('/api/admin/menu-order', {
          method: 'PUT',
          body: JSON.stringify({
            order: DEFAULT_ADMIN_MENU_TABS.slice(),
            disabled: {},
          }),
        })
          .then(function () {
            try {
              localStorage.removeItem(ADMIN_MENU_ORDER_KEY);
            } catch (e2) {}
            window.location.reload();
          })
          .catch(function (err) {
            alert(err.message || String(err));
          });
      }
    });
  }

  document.addEventListener('keydown', function (e) {
    if (!(e.metaKey || e.ctrlKey) || e.key !== 'j') return;
    var panelMd = $('panelMd');
    if (!panelMd || !panelMd.classList.contains('active')) return;
    e.preventDefault();
    if (window.__docSub === 'extra') {
      var ep = $('extraPropsPanel');
      if (ep) ep.classList.toggle('open');
    } else {
      var mp = $('mainDocPropsPanel');
      if (mp) mp.classList.toggle('open');
    }
  });

  var ryMenuFilter = $('ryMenuFilter');
  if (ryMenuFilter && !ryMenuFilter._bound) {
    ryMenuFilter._bound = true;
    ryMenuFilter.addEventListener('input', function () {
      var q = (ryMenuFilter.value || '').trim().toLowerCase();
      function applyNav(container) {
        if (!container) return;
        container.querySelectorAll('.ry-menu-item[data-tab]').forEach(function (btn) {
          var span = btn.querySelector('span:not(.ry-menu-ico)');
          var text = (span && span.textContent) || '';
          var match = !q || text.toLowerCase().indexOf(q) !== -1;
          btn.classList.toggle('ry-menu-filter-hide', !match);
        });
      }
      applyNav($('ryMenuNav'));
      applyNav(document.querySelector('.ry-menu-meta'));
    });
  }

  function refreshAdminOnlineUi() {
    var badge = $('ryOnlineBadge');
    var isAdm = window.__adminUser && window.__adminUser.role === 'admin';
    if (!isAdm) {
      if (badge) badge.setAttribute('hidden', '');
      return;
    }
    api('/api/admin/presence/online')
      .then(function (d) {
        var list = (d && d.list) || [];
        var n = list.length;
        var be = (d && d.backend) === 'redis' ? 'Redis' : '内存';
        if (badge) {
          badge.textContent = '在线 ' + n + ' · ' + be;
          badge.removeAttribute('hidden');
          badge.title = '后台在线会话（' + be + '，约 90s 内心跳）';
        }
        var host = $('adminOnlineUsersHost');
        if (host) {
          if (!list.length) {
            host.innerHTML =
              '<p class="admin-muted" style="margin:0">当前无在线会话（或已过期）。</p>';
            return;
          }
          var rows = list
            .map(function (x) {
              var kick =
                '<button type="button" class="de-btn de-btn-ghost de-btn-sm admin-kick-btn" data-kick-user="' +
                escapeHtml(String(x.userId)) +
                '" data-kick-at="' +
                escapeHtml(String(x.at)) +
                '">下线</button>';
              return (
                '<tr><td>' +
                escapeHtml(x.username || '') +
                '</td><td>' +
                escapeHtml(x.role || '') +
                '</td><td class="mono">#' +
                escapeHtml(String(x.userId)) +
                '</td><td>' +
                kick +
                '</td></tr>'
              );
            })
            .join('');
          host.innerHTML =
            '<table class="tbl tbl-online"><thead><tr><th>用户</th><th>角色</th><th>ID</th><th>操作</th></tr></thead><tbody>' +
            rows +
            '</tbody></table>';
        }
      })
      .catch(function () {
        if (badge) badge.setAttribute('hidden', '');
      });
  }

  function adminPresencePing() {
    api('/api/admin/presence/ping', { method: 'POST', body: '{}' }).catch(function () {});
  }
  adminPresencePing();
  if (window.__adminPresencePingTimer) clearInterval(window.__adminPresencePingTimer);
  window.__adminPresencePingTimer = setInterval(adminPresencePing, 45000);

  if (window.__adminUser && window.__adminUser.role === 'admin') {
    refreshAdminOnlineUi();
    if (window.__adminPresenceOnlineTimer) clearInterval(window.__adminPresenceOnlineTimer);
    window.__adminPresenceOnlineTimer = setInterval(refreshAdminOnlineUi, 30000);
  }
  var btnAdminOnlineRefresh = $('btnAdminOnlineRefresh');
  if (btnAdminOnlineRefresh) {
    btnAdminOnlineRefresh.addEventListener('click', refreshAdminOnlineUi);
  }
  var onlineHostKick = $('adminOnlineUsersHost');
  if (onlineHostKick && !onlineHostKick._kickBound) {
    onlineHostKick._kickBound = true;
    onlineHostKick.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.admin-kick-btn');
      if (!b) return;
      var uid = b.getAttribute('data-kick-user');
      var at = b.getAttribute('data-kick-at');
      if (uid == null || at == null || !window.confirm('确定将该后台会话下线？')) return;
      api('/api/admin/presence/kick', {
        method: 'POST',
        body: JSON.stringify({ userId: parseInt(uid, 10), at: parseInt(at, 10) }),
      })
        .then(function () {
          showAdminToast('已下线');
          refreshAdminOnlineUi();
        })
        .catch(function (err) {
          showAdminToast(err.message || String(err));
        });
    });
  }

  initDocSectionManager();
  initDocSubNav();

  var ADMIN_ASSET_LS_KEY = 'ebu4-admin-asset-v';
  function refreshAdminAssets() {
    try {
      localStorage.setItem(ADMIN_ASSET_LS_KEY, String(Date.now()));
    } catch (e) {}
    window.location.reload();
  }
  window.refreshAdminAssets = refreshAdminAssets;
  var btnAsset = $('btnRefreshAdminAssets');
  if (btnAsset) {
    btnAsset.addEventListener('click', function () {
      refreshAdminAssets();
    });
  }

}

document.addEventListener('DOMContentLoaded', async () => {
  const ok = await checkSession();
  if (!ok) {
    const ret = encodeURIComponent((location.pathname + location.search) || '/admin');
    location.replace('/admin/login?return=' + ret);
    return;
  }
  document.body.classList.remove('admin-booting');
  initThemePicker();
  initBgCanvas();
  showDash();
  await initAdminPanel();
  loadStats();
  loadFiles()
    .catch(function (e) {
      alert(e.message);
    })
    .then(function () {
      ensureVisibleAdminTab();
      loadDashboard();
    });
});
