/**
 * 文档站与扩展页共用的顶栏主题、背景 Canvas、全文搜索。
 * 须在 app.js / extra-page.js 之前以 defer 加载。
 */
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

function initBgCanvas() {
  const canvas = document.getElementById('bgCanvas');
  if (!canvas || !canvas.getContext) return;
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

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 1.5 + 0.5,
      gold: Math.random() > 0.7,
    });
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = `rgba(${pRgb},0.03)`;
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
      ctx.fillStyle = p.gold ? `rgba(${aRgb},0.2)` : `rgba(${pRgb},0.25)`;
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

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let searchTimer = null;

async function doSearch(query) {
  const results = document.getElementById('searchResults');
  if (!results) return;
  if (!query || query.trim().length < 2) {
    results.classList.remove('active');
    return;
  }

  const resp = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
  const data = await resp.json();

  if (data.length === 0) {
    results.innerHTML =
      '<div class="search-result-item"><div class="title" style="color:var(--text-dim)">未找到相关结果</div></div>';
    results.classList.add('active');
    return;
  }

  const keywords = query.toLowerCase().split(/\s+/);
  results.innerHTML = data
    .map((r) => {
      let snippet = r.snippet || '';
      keywords.forEach((kw) => {
        const regex = new RegExp(`(${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        snippet = snippet.replace(regex, '<mark>$1</mark>');
      });
      const kind = r.kind || (r.id != null ? 'section' : 'page');
      const badge =
        kind === 'page' ? '<span class="search-result-badge" title="扩展页">扩展页</span>' : '';
      let click;
      if (kind === 'page' && r.slug) {
        click = `location.href='/page/${encodeURIComponent(r.slug)}'; document.getElementById('searchResults').classList.remove('active');`;
      } else if (typeof loadSection === 'function' && r.id != null) {
        click = `loadSection(${r.id}); document.getElementById('searchResults').classList.remove('active');`;
      } else if (r.slug) {
        const enc = JSON.stringify(String(r.slug));
        click = `location.href='/docs#' + encodeURIComponent(${enc}); document.getElementById('searchResults').classList.remove('active');`;
      } else {
        click = `document.getElementById('searchResults').classList.remove('active');`;
      }
      return `<div class="search-result-item" role="button" data-search-kind="${kind}" onclick="${click}">
      <div class="title">${badge}${escapeHtml(r.title)}</div>
      <div class="snippet">${snippet}</div>
    </div>`;
    })
    .join('');
  results.classList.add('active');
}

function initSearchUI() {
  const searchInput = document.getElementById('searchInput');
  const searchResults = document.getElementById('searchResults');
  if (!searchInput || !searchResults) return;

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

  if (navigator.platform && !navigator.platform.includes('Mac')) {
    document.querySelectorAll('.search-kbd').forEach((k) => (k.textContent = 'Ctrl+K'));
  }
}

/** 显式挂到 window，保证与 app.js 等脚本之间的全局引用一致（部分环境/缓存下裸函数声明不可靠） */
if (typeof window !== 'undefined') {
  window.initThemePicker = initThemePicker;
  window.initBgCanvas = initBgCanvas;
  window.initSearchUI = initSearchUI;
  window.escapeHtml = escapeHtml;
  window.applyTheme = applyTheme;
}
