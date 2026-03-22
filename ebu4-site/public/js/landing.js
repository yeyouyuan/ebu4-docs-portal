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
  mq.addEventListener('change', () => {
    if (document.documentElement.dataset.theme === 'system') {
      window.dispatchEvent(new Event('ebu4-theme'));
    }
  });

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

document.addEventListener('DOMContentLoaded', () => {
  initThemePicker();
  initBgCanvas();
  if (navigator.platform && !navigator.platform.includes('Mac')) {
    document.querySelectorAll('.search-kbd').forEach((k) => {
      k.textContent = 'Ctrl+K';
    });
  }
});
