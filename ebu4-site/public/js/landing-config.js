/**
 * 门户 /index 文案：由 /data/landing.json 驱动（与 landing.html 默认 DOM 对应）
 */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setText(id, text) {
  if (text == null || text === '') return;
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setHtml(id, html) {
  if (html == null || html === '') return;
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function setFavicon(url) {
  if (!url) return;
  var href = String(url).trim();
  if (!href) return;
  document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]').forEach(function (el) {
    el.setAttribute('href', href);
  });
}

function renderTerminal(lines) {
  const body = document.querySelector('.term-body');
  if (!body || !Array.isArray(lines)) return;
  body.innerHTML = lines
    .map(function (line) {
      return '<div class="tl"><span class="tc">' + escapeHtml(line) + '</span></div>';
    })
    .join('');
}

function renderCodeBody(lines) {
  const body = document.getElementById('cbBody');
  if (!body || !Array.isArray(lines)) return;
  body.innerHTML = lines
    .map(function (line, i) {
      var n = i + 1;
      return (
        '<div class="ln"><span class="ln-n">' +
        n +
        '</span><span class="tc">' +
        escapeHtml(line) +
        '</span></div>'
      );
    })
    .join('');
}

function applyLandingConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return;

  if (cfg.meta && cfg.meta.pageTitle) {
    document.title = cfg.meta.pageTitle;
  }

  var nav = cfg.nav;
  if (nav) {
    setText('navLogoText', nav.logoText);
    setText('navBrandTitle', nav.brandTitle);
    setText('verBadge', nav.verBadge);
    setText('navBrandSub', nav.brandSub);
    setText('toolsTriggerLabel', nav.toolsLabel);
    setText('navCta', nav.ctaLabel);
    if (Array.isArray(nav.links)) {
      document.querySelectorAll('.nav-link[data-slide]').forEach(function (a, i) {
        if (nav.links[i] != null) a.textContent = nav.links[i];
      });
    }
  }

  if (cfg.scrollHint != null) setText('scrollHintText', cfg.scrollHint);

  if (Array.isArray(cfg.slideDots)) {
    document.querySelectorAll('.side-dot[data-index]').forEach(function (btn, i) {
      if (cfg.slideDots[i] != null) btn.setAttribute('data-label', cfg.slideDots[i]);
    });
  }

  var s1 = cfg.slide1;
  if (s1) {
    setText('s1Eyebrow', s1.eyebrow);
    setText('s1TitleLine', s1.titleLine);
    setText('s1TitleHl', s1.titleHighlight);
    setText('s1Tagline', s1.tagline);
    setText('s1Desc', s1.desc);
    setText('s1BtnPrimary', s1.btnPrimary);
    setText('s1BtnSecondary', s1.btnSecondary);
    var a2 = document.getElementById('s1SecondaryLink');
    if (a2 && s1.btnSecondaryUrl) a2.href = s1.btnSecondaryUrl;
    setText('termTitle', s1.terminalTitle);
    renderTerminal(s1.terminalLines);
  }

  var s2 = cfg.slide2;
  if (s2) {
    setText('s2Tag', s2.tag);
    setText('s2Title', s2.title);
    setText('s2Subtitle', s2.subtitle);
    if (Array.isArray(s2.stats)) {
      s2.stats.forEach(function (card, i) {
        setText('s2Card' + i + 'Num', card.num);
        setText('s2Card' + i + 'Label', card.label);
        setText('s2Card' + i + 'Desc', card.desc);
      });
    }
  }

  var s3 = cfg.slide3;
  if (s3) {
    setText('s3Tag', s3.tag);
    setText('s3Title', s3.title);
    setText('s3Subtitle', s3.subtitle);
    if (Array.isArray(s3.features)) {
      s3.features.forEach(function (feat, i) {
        setText('s3Card' + i + 'Title', feat.title);
        setText('s3Card' + i + 'Desc', feat.desc);
        if (feat.tags && feat.tags.length) {
          feat.tags.forEach(function (tag, j) {
            setText('s3Card' + i + 'Tag' + j, tag);
          });
        }
      });
    }
  }

  var s4 = cfg.slide4;
  if (s4) {
    setText('s4Tag', s4.tag);
    setText('s4TitleLine1', s4.titleLine1);
    setText('s4TitleLine2', s4.titleLine2);
    setText('s4Subtitle', s4.subtitle);
    if (Array.isArray(s4.bullets)) {
      s4.bullets.forEach(function (t, i) {
        setText('s4Bullet' + i, t);
      });
    }
    setText('cbLangFilename', s4.codeFilename);
    renderCodeBody(s4.codeLines);
  }

  var s5 = cfg.slide5;
  if (s5) {
    setText('s5TitleLine1', s5.titleLine1);
    setText('s5TitleHl', s5.titleHighlight);
    setText('s5Desc', s5.desc);
    setText('s5BtnPrimary', s5.btnPrimary);
    setText('s5BtnSecondary', s5.btnSecondary);
    var a5 = document.getElementById('s5SecondaryLink');
    if (a5 && s5.btnSecondaryUrl) a5.href = s5.btnSecondaryUrl;
    if (Array.isArray(s5.feats)) {
      s5.feats.forEach(function (f, i) {
        setText('s5Feat' + i + 'Title', f.title);
        setText('s5Feat' + i + 'Desc', f.desc);
      });
    }
  }
}

function applySiteBranding(branding) {
  if (!branding || typeof branding !== 'object') return;
  var site = branding.site || {};
  var common = branding.common || {};
  var nav = branding.landingNav || {};
  var logoText = common.logoMark || nav.logoText;
  var brandTitle = common.brandTitle || nav.brandTitle;
  var brandSub = common.brandSub || nav.brandSub;
  var versionText = common.versionText || nav.verBadge;
  if (site.title) document.title = site.title;
  if (site.faviconUrl) setFavicon(site.faviconUrl);
  setText('navLogoText', logoText);
  setText('navBrandTitle', brandTitle);
  setText('verBadge', versionText);
  setText('navBrandSub', brandSub);
}

async function loadLandingConfig() {
  try {
    var r = await fetch('/data/landing.json', { credentials: 'same-origin', cache: 'no-cache' });
    if (!r.ok) return;
    var cfg = await r.json();
    applyLandingConfig(cfg);
  } catch (e) {
    console.warn('[landing-config]', e);
  }
  try {
    var rb = await fetch('/api/site-branding', { credentials: 'same-origin', cache: 'no-store' });
    if (!rb.ok) return;
    var data = await rb.json();
    applySiteBranding(data && data.branding ? data.branding : null);
  } catch (e2) {
    console.warn('[site-branding]', e2);
  }
}
