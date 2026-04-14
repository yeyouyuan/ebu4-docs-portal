// === State ===
let sectionsMeta = [];
/** 当前章节：首页为 -1；正文为服务端章节 id（与 /api/sections/:id 一致，非过滤列表下标） */
let currentSection = -1;
/** 防止快速切换章节时旧请求覆盖新内容 */
let loadSectionGeneration = 0;
/** 首次 /docs 路由（含 await 正文）完成前，忽略 hashchange，避免与初始化竞态 */
let docsRouteReady = false;
/** 主文档切换重载中，忽略 hashchange（URL 与目录正在替换） */
let docSwitchBusy = 0;

/** 侧栏可点的章节（跳过原文档前两节 # 标题 / 目录，按 id 判断，避免与权限过滤后的数组错位） */
function sidebarNavSections() {
  return sectionsMeta.filter((s) => s.id > 1);
}

/** 进入文档按钮：首个可导航章节的 id */
function firstNavVisibleSectionId() {
  const nav = sidebarNavSections();
  if (nav.length) return nav[0].id;
  const any = sectionsMeta[0];
  return any && typeof any.id === 'number' ? any.id : null;
}

let mainDocsList = [];
let defaultDocSlug = 'default';
/** 当前主文档 slug（与 ?doc= 一致；等于 defaultDocSlug 时 URL 可省略 doc） */
let activeDocSlug = null;
/** 门户首页是否启用（由 /api/main-docs 返回） */
let homepageEnabled = true;

function getActiveDocMeta() {
  return mainDocsList.find((d) => d.slug === activeDocSlug) || null;
}

function renderPublicDocPublishMeta() {
  const el = document.getElementById('publicDocPublishMeta');
  if (!el) return;
  const doc = getActiveDocMeta();
  if (!doc) {
    el.hidden = false;
    el.textContent = '最近发布：暂无';
    return;
  }
  const who = doc.lastPublishedBy ? String(doc.lastPublishedBy) : '未知';
  const when = doc.lastPublishedAt ? new Date(doc.lastPublishedAt).toLocaleString('zh-CN') : '未知时间';
  el.hidden = false;
  el.textContent = '最近发布：' + who + ' · ' + when;
}

function publicSectionsApiPath() {
  if (!activeDocSlug || activeDocSlug === defaultDocSlug) return '/api/sections';
  return '/api/sections?doc=' + encodeURIComponent(activeDocSlug);
}

function publicSectionOneApiPath(sectionId) {
  const base = '/api/sections/' + sectionId;
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

function setupDocSubmitModal() {
  const modal = document.getElementById('docSubmitModal');
  const btnOpen = document.getElementById('btnOpenDocSubmit');
  const btnClose = document.getElementById('btnCloseDocSubmit');
  const btnCancel = document.getElementById('btnCancelDocSubmit');
  const btnDo = document.getElementById('btnDoDocSubmit');
  const targetTypeEl = document.getElementById('docSubmitTargetType');
  const mainWrap = document.getElementById('docSubmitMainWrap');
  const mainSel = document.getElementById('docSubmitMainDoc');
  const msgEl = document.getElementById('docSubmitMsg');
  if (!modal || !btnOpen || !btnClose || !btnCancel || !btnDo || !targetTypeEl || !mainWrap || !mainSel) return;

  function setMsg(text, isErr) {
    if (!msgEl) return;
    msgEl.textContent = text || '';
    msgEl.style.color = isErr ? 'var(--danger, #ef4444)' : 'var(--text-dim)';
  }

  function syncMainDocOptions() {
    mainSel.innerHTML = mainDocsList
      .map((d) => `<option value="${escapeHtml(d.slug)}">${escapeHtml(d.title || d.slug)}</option>`)
      .join('');
    if (activeDocSlug) mainSel.value = activeDocSlug;
    if (!mainSel.value && mainDocsList[0]) mainSel.value = mainDocsList[0].slug;
  }

  function syncTypeUi() {
    mainWrap.hidden = targetTypeEl.value !== 'main';
  }

  function openModal() {
    setMsg('', false);
    syncMainDocOptions();
    syncTypeUi();
    modal.hidden = false;
  }

  function closeModal() {
    modal.hidden = true;
  }

  async function submitNow() {
    setMsg('', false);
    const title = (document.getElementById('docSubmitTitle') && document.getElementById('docSubmitTitle').value.trim()) || '';
    const tags = (document.getElementById('docSubmitTags') && document.getElementById('docSubmitTags').value.trim()) || '';
    const submitterName = (document.getElementById('docSubmitName') && document.getElementById('docSubmitName').value.trim()) || '';
    const submitterContact = (document.getElementById('docSubmitContact') && document.getElementById('docSubmitContact').value.trim()) || '';
    const targetType = targetTypeEl.value === 'main' ? 'main' : 'extra';
    const targetDocSlug = targetType === 'main' ? (mainSel.value || '') : '';
    const fileEl = document.getElementById('docSubmitFile');
    const f = fileEl && fileEl.files && fileEl.files[0] ? fileEl.files[0] : null;
    if (!title) return setMsg('请填写标题', true);
    if (!f) return setMsg('请上传 .md 文件', true);
    if (!/\.md$/i.test(f.name || '')) return setMsg('仅支持 .md 文件', true);
    const markdownContent = await f.text();
    if (!markdownContent.trim()) return setMsg('Markdown 内容不能为空', true);
    btnDo.disabled = true;
    try {
      const r = await fetch('/api/doc-submissions', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          targetType,
          targetDocSlug,
          tags,
          submitterName,
          submitterContact,
          fileName: f.name,
          markdownContent,
        }),
      });
      const t = await r.text();
      let d = {};
      try {
        d = t ? JSON.parse(t) : {};
      } catch (_) {}
      if (!r.ok) throw new Error(d.error || '提交失败');
      setMsg('提交成功，已进入后台审核队列。', false);
      setTimeout(closeModal, 700);
    } catch (e) {
      setMsg(e.message || String(e), true);
    } finally {
      btnDo.disabled = false;
    }
  }

  btnOpen.addEventListener('click', openModal);
  btnClose.addEventListener('click', closeModal);
  btnCancel.addEventListener('click', closeModal);
  targetTypeEl.addEventListener('change', syncTypeUi);
  btnDo.addEventListener('click', function () {
    submitNow().catch(function (e) {
      setMsg(e.message || String(e), true);
    });
  });
  modal.addEventListener('click', function (e) {
    if (e.target === modal) closeModal();
  });
}

async function reloadDocsForActiveSlug() {
  docSwitchBusy++;
  loadSectionGeneration++;
  try {
    syncDocsUrl();
    const resp = await fetch(publicSectionsApiPath(), { cache: 'no-store' });
    if (!resp.ok) throw new Error('sections');
    sectionsMeta = await resp.json();
    renderSidebar();
    const raw = window.location.hash.slice(1);
    if (!raw || raw === 'home') {
      await showHomeBody();
    } else {
      const slug = slugFromAddressBarHash();
      const hit = slug != null ? sectionsMeta.find((s) => s.slug === slug) : null;
      if (hit) await loadSection(hit.id);
      else {
        history.replaceState(null, '', `${location.pathname}${location.search}#home`);
        await showHomeBody();
      }
    }
  } finally {
    docSwitchBusy--;
  }
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
  if (typeof window.initThemePicker === 'function') window.initThemePicker();
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

  if (typeof window.initBgCanvas === 'function') window.initBgCanvas();

  try {
    await fetch('/api/site/session', { credentials: 'same-origin' });
  } catch (_) {}

  try {
    const mr = await fetch('/api/main-docs', { cache: 'no-store' });
    if (mr.ok) {
      const mj = await mr.json();
      mainDocsList = mj.docs || [];
      homepageEnabled = mj.homepageEnabled !== false;
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
  renderPublicDocPublishMeta();

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
      renderPublicDocPublishMeta();
      try {
        await reloadDocsForActiveSlug();
      } catch (e) {
        console.warn(e);
      }
    });
  }
  setupDocSubmitModal();

  // Load sections metadata
  try {
    const resp = await fetch(publicSectionsApiPath(), { cache: 'no-store' });
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

  // 首次路由：必须 await 正文加载完成再开放 hash 监听与搜索初始化，避免「顺序错乱 / 刷新后空白」
  try {
    const raw = window.location.hash.slice(1);
    if (!raw || raw === 'home') {
      if (!raw) history.replaceState(null, '', `${location.pathname}${location.search}#home`);
      await showHomeBody();
    } else {
      const slug = slugFromAddressBarHash();
      const hit = slug != null ? sectionsMeta.find((s) => s.slug === slug) : null;
      if (hit) await loadSection(hit.id);
      else {
        history.replaceState(null, '', `${location.pathname}${location.search}#home`);
        await showHomeBody();
      }
    }
  } finally {
    docsRouteReady = true;
  }

  if (typeof window.initSearchUI === 'function') window.initSearchUI();
});

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
  if (!docsRouteReady || docSwitchBusy > 0) return;
  const raw = window.location.hash.slice(1);
  if (!raw || raw === 'home') {
    if (currentSection === -1 && document.querySelector('#contentArea .home-view')) return;
    void showHomeBody();
    return;
  }
  const slug = slugFromAddressBarHash();
  const hit = slug != null ? sectionsMeta.find((s) => s.slug === slug) : null;
  if (hit) {
    if (hit.id === currentSection) return;
    loadSection(hit.id);
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
  const firstId = firstNavVisibleSectionId();
  const firstTitle =
    firstId != null ? (sectionsMeta.find((s) => s.id === firstId) || {}).title || '文档' : '文档';
  let extraBlock = '';
  try {
    const r = await fetch('/api/pages', { cache: 'no-store' });
    if (r.ok) {
      const data = await r.json();
      const pages = (data && data.pages) || [];
      if (pages.length) {
        const groupsMap = {};
        pages.forEach((p) => {
          const tags = Array.isArray(p.tags)
            ? p.tags
                .map((t) => String(t || '').trim())
                .filter(Boolean)
            : [];
          const groupKey = tags.length ? tags[0] : '未分类';
          if (!groupsMap[groupKey]) groupsMap[groupKey] = [];
          groupsMap[groupKey].push(p);
        });
        const groupNames = Object.keys(groupsMap).sort((a, b) => {
          if (a === '未分类') return 1;
          if (b === '未分类') return -1;
          return a.localeCompare(b, 'zh-CN');
        });
        extraBlock = `
      <section class="home-extra" aria-labelledby="home-extra-title">
        <h2 id="home-extra-title" class="home-extra-title">扩展阅读</h2>
        <p class="home-extra-lead">按标签分类展示后台已发布的扩展页面。</p>
        <div class="home-extra-groups">
          ${groupNames
            .map((groupName, idx) => {
              const list = groupsMap[groupName] || [];
              return `<details class="home-extra-group" ${idx === 0 ? 'open' : ''}>
              <summary class="home-extra-group-title">${escapeHtml(groupName)} <span class="home-extra-group-count">${list.length}</span></summary>
              <ul class="home-extra-list">
              ${list
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
            </details>`;
            })
            .join('')}
        </div>
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
          ${
            firstId != null
              ? `<button type="button" class="home-btn primary" onclick="loadSection(${firstId})">进入文档 — ${escapeHtml(firstTitle)}</button>`
              : `<button type="button" class="home-btn primary" disabled>暂无可用章节</button>`
          }
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
  if (homepageEnabled) {
    html += `<a class="sidebar-link" href="/index">
        <span class="link-num">⌂</span>
        <span>门户首页</span>
      </a>`;
  }
  let navNum = 0;
  sectionsMeta.forEach((s) => {
    if (s.id === 0 || s.id === 1) return;
    navNum += 1;
    const active = s.id === currentSection ? ' active' : '';
    html += `<a class="sidebar-link${active}" href="#${encodeURIComponent(s.slug)}" data-idx="${s.id}">
      <span class="link-num">${navNum}</span>
      <span>${escapeHtml(s.title)}</span>
    </a>`;
  });

  nav.innerHTML = html;
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// === Load Section ===
async function loadSection(sectionId) {
  const sid =
    typeof sectionId === 'number' && !Number.isNaN(sectionId)
      ? sectionId
      : parseInt(sectionId, 10);
  if (Number.isNaN(sid)) return;
  const section = sectionsMeta.find((s) => s.id === sid);
  if (!section) return;

  const gen = ++loadSectionGeneration;
  currentSection = sid;

  // 与地址栏已一致时不要改 hash，避免多余 hashchange 与 onHashChange 重复加载
  const curSlug = slugFromAddressBarHash();
  if (curSlug !== section.slug) {
    window.location.hash = section.slug;
  }
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
    resp = await fetch(publicSectionOneApiPath(sid), { cache: 'no-store' });
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

  const navChain = sidebarNavSections();
  const pos = navChain.findIndex((x) => x.id === section.id);
  const prev = pos > 0 ? navChain[pos - 1] : null;
  const next = pos >= 0 && pos < navChain.length - 1 ? navChain[pos + 1] : null;
  html += '<div class="page-nav">';
  if (prev) {
    html += `<a href="#${encodeURIComponent(prev.slug)}" onclick="event.preventDefault(); loadSection(${prev.id})">← ${escapeHtml(prev.title)}</a>`;
  } else {
    html += '<span></span>';
  }
  if (next) {
    html += `<a href="#${encodeURIComponent(next.slug)}" onclick="event.preventDefault(); loadSection(${next.id})">${escapeHtml(next.title)} →</a>`;
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
