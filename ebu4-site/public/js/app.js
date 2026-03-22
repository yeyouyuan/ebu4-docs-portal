// === State ===
let sectionsMeta = [];
let currentSection = 0;
let searchTimer = null;
/** 防止快速切换章节时旧请求覆盖新内容 */
let loadSectionGeneration = 0;

/** 跳过 markdown 中标题与目录两节 */
const SIDEBAR_SKIP = new Set([0, 1]);

function firstDocSectionIndex() {
  const idx = sectionsMeta.findIndex((_, i) => !SIDEBAR_SKIP.has(i));
  return idx >= 0 ? idx : 0;
}

let mainDocsList = [];
let defaultDocSlug = 'default';
/** 当前主文档 slug（与 ?doc= 一致；等于 defaultDocSlug 时 URL 可省略 doc） */
let activeDocSlug = null;

function publicSectionsApiPath() {
  if (!activeDocSlug || activeDocSlug === defaultDocSlug) return '/api/sections';
  return '/api/sections?doc=' + encodeURIComponent(activeDocSlug);
}

function publicSectionOneApiPath(idx) {
  const base = '/api/sections/' + idx;
  if (!activeDocSlug || activeDocSlug === defaultDocSlug) return base;
  return base + '?doc=' + encodeURIComponent(activeDocSlug);
}

function syncDocsUrl() {
  const q =
    activeDocSlug && activeDocSlug !== defaultDocSlug
      ? '?doc=' + encodeURIComponent(activeDocSlug)
      : '';
  const h = location.hash || '';
  history.replaceState(null, '', location.pathname + q + h);
}

async function reloadDocsForActiveSlug() {
  syncDocsUrl();
  const resp = await fetch(publicSectionsApiPath());
  if (!resp.ok) throw new Error('sections');
  sectionsMeta = await resp.json();
  renderSidebar();
  const raw = window.location.hash.slice(1);
  if (!raw || raw === 'home') {
    await showHomeBody();
  } else {
    const slug = slugFromAddressBarHash();
    const idx = slug != null ? sectionsMeta.findIndex((s) => s.slug === slug) : -1;
    if (idx >= 0) await loadSection(idx);
    else {
      history.replaceState(null, '', `${location.pathname}${location.search}#home`);
      await showHomeBody();
    }
  }
}

const THEME_STORAGE_KEY = 'ebu4-theme';

function normalizeStoredTheme(raw) {
  const legacy = new Set(['default', 'ocean', 'rose', 'emerald', 'violet']);
  if (legacy.has(raw)) return 'dark';
  return raw;
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

function initThemePicker() {
  let saved = 'dark';
  try {
    saved = normalizeStoredTheme(localStorage.getItem(THEME_STORAGE_KEY) || 'dark');
  } catch (_) {}
  applyTheme(saved);

  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onSchemeChange = () => {
    if (document.documentElement.dataset.theme === 'system') {
      window.dispatchEvent(new Event('ebu4-theme'));
    }
  };
  mq.addEventListener('change', onSchemeChange);

  const root = document.getElementById('themePicker');
  const trigger = document.getElementById('themeTrigger');
  const panel = document.getElementById('themePanel');
  if (!root || !trigger || !panel) return;

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !root.classList.contains('open');
    root.classList.toggle('open', open);
    panel.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
  });

  document.querySelectorAll('.theme-swatch').forEach((btn) => {
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

function initSidebarNavDelegation() {
  const nav = document.getElementById('sidebarNav');
  if (!nav) return;
  // 捕获阶段先拦截，避免 <a href="#..."> 的默认跳转与脚本路由竞态
  nav.addEventListener(
    'click',
    (e) => {
      const a = e.target.closest('a.sidebar-link');
      if (!a) return;
      const href = a.getAttribute('href') || '';
      if (href === '/index' || href.startsWith('/index?')) {
        return;
      }
      e.preventDefault();
      const raw = a.dataset.idx;
      if (raw === undefined || raw === '') return;
      const idx = parseInt(raw, 10);
      if (Number.isNaN(idx)) return;
      loadSection(idx);
    },
    true
  );
}

// === Init ===
document.addEventListener('DOMContentLoaded', async () => {
  initThemePicker();
  initSidebarNavDelegation();

  // Configure marked
  marked.setOptions({
    highlight: (code, lang) => {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return hljs.highlightAuto(code).value;
    },
    breaks: false,
    gfm: true
  });

  // Init background canvas
  initBgCanvas();

  try {
    await fetch('/api/site/session', { credentials: 'same-origin' });
  } catch (_) {}

  try {
    const mr = await fetch('/api/main-docs');
    if (mr.ok) {
      const mj = await mr.json();
      mainDocsList = mj.docs || [];
      const def = mainDocsList.find((d) => d.isDefault);
      if (def) defaultDocSlug = def.slug;
      else if (mainDocsList[0]) defaultDocSlug = mainDocsList[0].slug;
    }
  } catch (_) {}
  const params = new URLSearchParams(location.search);
  const qDoc = params.get('doc');
  if (qDoc && mainDocsList.some((d) => d.slug === qDoc)) {
    activeDocSlug = qDoc;
  } else {
    activeDocSlug = defaultDocSlug;
  }
  syncDocsUrl();

  const pubPicker = document.getElementById('publicDocPicker');
  if (pubPicker && mainDocsList.length > 1) {
    pubPicker.hidden = false;
    pubPicker.innerHTML = mainDocsList
      .map((d) => {
        const t = escapeHtml(d.title || d.slug);
        return `<option value="${escapeHtml(d.slug)}">${t}</option>`;
      })
      .join('');
    pubPicker.value = activeDocSlug;
    pubPicker.addEventListener('change', async () => {
      activeDocSlug = pubPicker.value || defaultDocSlug;
      loadSectionGeneration++;
      try {
        await reloadDocsForActiveSlug();
      } catch (e) {
        console.warn(e);
      }
    });
  }

  // Load sections metadata
  try {
    const resp = await fetch(publicSectionsApiPath());
    if (!resp.ok) throw new Error('sections');
    sectionsMeta = await resp.json();
  } catch (_) {
    sectionsMeta = [];
    const nav = document.getElementById('sidebarNav');
    if (nav) {
      nav.innerHTML =
        '<div class="sidebar-error">目录加载失败，请检查网络后刷新页面。</div>';
    }
    document.getElementById('contentArea').innerHTML = `
      <div class="loading">
        <p style="color:var(--text-dim);max-width:28rem;margin:0 auto;line-height:1.7">无法加载文档目录（<code>/api/sections</code>）。请确认服务已启动后刷新。</p>
      </div>`;
    return;
  }

  window.addEventListener('hashchange', onHashChange);

  // 首次路由（hash 中的中文需解码后再与 slug 比较）
  const raw = window.location.hash.slice(1);
  if (!raw || raw === 'home') {
    if (!raw) history.replaceState(null, '', `${location.pathname}${location.search}#home`);
    await showHomeBody();
  } else {
    const slug = slugFromAddressBarHash();
    const idx = slug != null ? sectionsMeta.findIndex((s) => s.slug === slug) : -1;
    if (idx >= 0) loadSection(idx);
    else {
      history.replaceState(null, '', `${location.pathname}${location.search}#home`);
      await showHomeBody();
    }
  }

  // Search
  const searchInput = document.getElementById('searchInput');
  const searchResults = document.getElementById('searchResults');

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => doSearch(searchInput.value), 250);
  });

  searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim().length >= 2) {
      searchResults.classList.add('active');
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-box')) {
      searchResults.classList.remove('active');
    }
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      searchInput.focus();
    }
    if (e.key === 'Escape') {
      searchResults.classList.remove('active');
      searchInput.blur();
    }
  });

  // Detect OS for kbd display
  if (navigator.platform && !navigator.platform.includes('Mac')) {
    document.querySelectorAll('.search-kbd').forEach(k => k.textContent = 'Ctrl+K');
  }
});

// === Background Canvas (Geometric Grid + Particles) ===
function initBgCanvas() {
  const canvas = document.getElementById('bgCanvas');
  const ctx = canvas.getContext('2d');
  let w, h;
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

  // Create particles
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

    // Grid lines
    ctx.strokeStyle = `rgba(${pRgb},0.03)`;
    ctx.lineWidth = 0.5;
    const step = 90;
    for (let x = 0; x < w; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Particles
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = w;
      if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = h;
      if (p.y > h) p.y = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.gold ? `rgba(${aRgb},0.2)` : `rgba(${pRgb},0.25)`;
      ctx.fill();
    });

    // Connection lines between close particles
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 200) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(${pRgb},${0.06 * (1 - dist / 200)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }

    requestAnimationFrame(draw);
  }
  draw();
}

function setLayoutHomeMode(isHome) {
  document.getElementById('layoutRoot')?.classList.toggle('home-mode', isHome);
}

/**
 * 与 /api/sections 中的 slug 对齐。浏览器对 hash 里的中文等会做 percent-encoding，
 * 若直接用 slice(1) 与 s.slug 比较会不相等，onHashChange 会误判为「未知章节」并执行 showHomeBody()，把已打开的章节覆盖成首页。
 */
function slugFromAddressBarHash() {
  const raw = window.location.hash.slice(1);
  if (!raw || raw === 'home') return null;
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' '));
  } catch (_) {
    return raw;
  }
}

function onHashChange() {
  const raw = window.location.hash.slice(1);
  if (!raw || raw === 'home') {
    if (currentSection === -1 && document.querySelector('#contentArea .home-view')) return;
    void showHomeBody();
    return;
  }
  const slug = slugFromAddressBarHash();
  const idx = slug != null ? sectionsMeta.findIndex((s) => s.slug === slug) : -1;
  if (idx >= 0) {
    if (idx === currentSection) return;
    loadSection(idx);
  } else {
    console.warn('无法匹配章节 hash:', window.location.hash);
  }
}

function truncateText(s, n) {
  const t = String(s);
  if (t.length <= n) return t;
  return t.slice(0, n) + '…';
}

async function showHomeBody() {
  loadSectionGeneration++;
  currentSection = -1;
  setLayoutHomeMode(true);
  renderSidebar();
  const firstIdx = firstDocSectionIndex();
  const firstTitle = sectionsMeta[firstIdx] ? sectionsMeta[firstIdx].title : '文档';
  let extraBlock = '';
  try {
    const r = await fetch('/api/pages');
    if (r.ok) {
      const data = await r.json();
      const pages = (data && data.pages) || [];
      if (pages.length) {
        extraBlock = `
      <section class="home-extra" aria-labelledby="home-extra-title">
        <h2 id="home-extra-title" class="home-extra-title">扩展阅读</h2>
        <p class="home-extra-lead">后台发布的扩展页面，与主文档并列维护。</p>
        <ul class="home-extra-list">
          ${pages
            .map(
              (p) => `<li class="home-extra-item">
            <a class="home-extra-link" href="/page/${encodeURIComponent(p.slug)}">
              <span class="home-extra-t">${escapeHtml(p.title)}</span>
              ${
                p.excerpt
                  ? `<span class="home-extra-ex">${escapeHtml(truncateText(p.excerpt, 140))}</span>`
                  : ''
              }
            </a>
          </li>`
            )
            .join('')}
        </ul>
      </section>`;
      }
    }
  } catch (_) {}
  document.getElementById('contentArea').innerHTML = `
    <div class="home-view">
      <div class="home-hero">
        <div class="badge">Ecology E9 · 二次开发</div>
        <h1>泛微 E9 二开技术支持门户</h1>
        <p class="lead">集中查阅接口、流程、表单与部署说明；支持全文搜索与章节导航，助力企业 IT 与实施同事快速定位问题。</p>
        <div class="home-actions">
          <button type="button" class="home-btn primary" onclick="loadSection(${firstIdx})">进入文档 — ${escapeHtml(firstTitle)}</button>
          <button type="button" class="home-btn ghost" onclick="document.getElementById('sidebar')?.classList.add('open')">打开侧栏目录</button>
        </div>
      </div>
      <div class="home-grid">
        <div class="home-card">
          <div class="num">浏览</div>
          <h3>章节导航</h3>
          <p>左侧目录按文档结构列出章节，支持上下章切换与当前页目录（TOC）。</p>
        </div>
        <div class="home-card">
          <div class="num">搜索</div>
          <h3>全文检索</h3>
          <p>使用顶部搜索框或快捷键 Ctrl/⌘+K，在全部章节中查找关键词。</p>
        </div>
        <div class="home-card">
          <div class="num">资源</div>
          <h3>外链</h3>
          <p>导航栏可跳转 E9 技术站与云商店文档，与站内文档互为补充。</p>
        </div>
      </div>
      ${extraBlock}
      <p class="home-foot">本地单进程部署，无数据库依赖；内容源自项目内 Markdown 与配图目录。</p>
    </div>`;
  document.getElementById('tocList').innerHTML =
    '<div style="color:var(--text-dim);font-size:.75rem;padding:8px 14px;">首页无目录</div>';
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// === Sidebar ===
function renderSidebar() {
  const nav = document.getElementById('sidebarNav');
  if (!nav) return;
  if (!sectionsMeta.length) {
    nav.innerHTML =
      '<div class="sidebar-error">暂无章节数据。</div>';
    return;
  }
  let html = '';
  html += `<a class="sidebar-link" href="/index">
      <span class="link-num">⌂</span>
      <span>门户首页</span>
    </a>`;
  sectionsMeta.forEach((s, i) => {
    if (SIDEBAR_SKIP.has(i)) return;
    const active = i === currentSection ? ' active' : '';
    const num = i - 1;
    html += `<a class="sidebar-link${active}" href="#${s.slug}" data-idx="${i}">
      <span class="link-num">${num}</span>
      <span>${escapeHtml(s.title)}</span>
    </a>`;
  });

  nav.innerHTML = html;
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// === Load Section ===
async function loadSection(idx) {
  if (!sectionsMeta.length || idx < 0 || idx >= sectionsMeta.length) return;
  const section = sectionsMeta[idx];
  if (!section) return;

  const gen = ++loadSectionGeneration;
  currentSection = idx;

  window.location.hash = section.slug;
  setLayoutHomeMode(false);
  renderSidebar();
  document.getElementById('sidebar').classList.remove('open');

  // Show loading
  document.getElementById('contentArea').innerHTML = `
    <div class="loading">
      <div class="loading-shield">
        <svg width="48" height="48" viewBox="0 0 28 28" fill="none">
          <path d="M14 2L22 7V17Q22 22 14 26Q6 22 6 17V7L14 2Z" stroke="#d4a853" stroke-width="1.5" fill="rgba(62,175,124,0.08)"/>
        </svg>
      </div>
      <p>加载中…</p>
    </div>`;

  let resp;
  try {
    resp = await fetch(publicSectionOneApiPath(idx));
  } catch (_) {
    if (gen !== loadSectionGeneration) return;
    document.getElementById('contentArea').innerHTML = `
      <div class="loading"><p style="color:var(--text-dim)">网络错误，请重试。</p></div>`;
    return;
  }
  if (gen !== loadSectionGeneration) return;
  if (!resp.ok) {
    const hint =
      resp.status === 403
        ? '无权查看该章节（内容安全等级高于当前访客权限）。'
        : '章节加载失败（' + resp.status + '）';
    document.getElementById('contentArea').innerHTML =
      '<div class="loading"><p style="color:var(--text-dim)">' + hint + '</p></div>';
    return;
  }
  const data = await resp.json();
  if (gen !== loadSectionGeneration) return;

  let html = `<div class="md-content">${marked.parse(data.content)}</div>`;

  // Prev/Next
  const prev = idx > 2 ? sectionsMeta[idx - 1] : null;
  const next = idx < sectionsMeta.length - 1 ? sectionsMeta[idx + 1] : null;
  html += '<div class="page-nav">';
  if (prev) {
    html += `<a href="#${prev.slug}" onclick="event.preventDefault(); loadSection(${idx-1})">← ${prev.title}</a>`;
  } else {
    html += '<span></span>';
  }
  if (next) {
    html += `<a href="#${next.slug}" onclick="event.preventDefault(); loadSection(${idx+1})">${next.title} →</a>`;
  }
  html += '</div>';

  document.getElementById('contentArea').innerHTML = html;

  // Fix image paths
  document.querySelectorAll('.md-content img').forEach(img => {
    const src = img.getAttribute('src');
    if (src && src.startsWith('ebu4-docs-img/')) {
      img.src = '/img/' + src.replace('ebu4-docs-img/', '');
    }
  });

  renderToc(data.toc);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// === TOC ===
function renderToc(toc) {
  const container = document.getElementById('tocList');
  if (!toc || toc.length === 0) {
    container.innerHTML = '<div style="color:var(--text-dim);font-size:.75rem;padding:8px 14px;">暂无目录</div>';
    return;
  }

  let html = '';
  toc.filter(t => t.level === 2 || t.level === 3).forEach(t => {
    const depthClass = t.level === 3 ? ' depth-3' : '';
    const id = t.text.replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').toLowerCase();
    html += `<a class="toc-link${depthClass}" href="#${id}" onclick="event.preventDefault(); scrollToHeading('${id}')">${t.text}</a>`;
  });
  container.innerHTML = html;
}

function scrollToHeading(id) {
  let el = document.getElementById(id);
  if (!el) {
    const headings = document.querySelectorAll('.md-content h2, .md-content h3');
    for (const h of headings) {
      if (h.textContent.trim().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').toLowerCase() === id) {
        el = h; break;
      }
    }
  }
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// === Search ===
async function doSearch(query) {
  const results = document.getElementById('searchResults');
  if (!query || query.trim().length < 2) { results.classList.remove('active'); return; }

  const resp = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
  const data = await resp.json();

  if (data.length === 0) {
    results.innerHTML = '<div class="search-result-item"><div class="title" style="color:var(--text-dim)">未找到相关结果</div></div>';
    results.classList.add('active');
    return;
  }

  const keywords = query.toLowerCase().split(/\s+/);
  results.innerHTML = data.map(r => {
    let snippet = r.snippet || '';
    keywords.forEach(kw => {
      const regex = new RegExp(`(${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      snippet = snippet.replace(regex, '<mark>$1</mark>');
    });
    const kind = r.kind || (r.id != null ? 'section' : 'page');
    const badge =
      kind === 'page'
        ? '<span class="search-result-badge" title="扩展页">扩展页</span>'
        : '';
    const click =
      kind === 'page' && r.slug
        ? `location.href='/page/${encodeURIComponent(r.slug)}'; document.getElementById('searchResults').classList.remove('active');`
        : `loadSection(${r.id}); document.getElementById('searchResults').classList.remove('active');`;
    return `<div class="search-result-item" role="button" data-search-kind="${kind}" onclick="${click}">
      <div class="title">${badge}${r.title}</div>
      <div class="snippet">${snippet}</div>
    </div>`;
  }).join('');
  results.classList.add('active');
}
