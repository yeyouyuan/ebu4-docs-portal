/**
 * 后台表单 ↔ 配置对象（服务端仍存 JSON 文件，界面不展示 JSON 原文）
 */
function acfGet(id) {
  var el = document.getElementById(id);
  return el ? el.value : '';
}
function acfSet(id, v) {
  var el = document.getElementById(id);
  if (el) el.value = v == null ? '' : String(v);
}

function populateSeoFromJson(j) {
  if (!j || typeof j !== 'object') return;
  acfSet('seo_canonicalBase', j.canonicalBase || '');
  var d = j.docs || {};
  acfSet('seo_docs_title', d.title || '');
  acfSet('seo_docs_description', d.description || '');
  acfSet('seo_docs_keywords', d.keywords || '');
  acfSet('seo_docs_ogImage', d.ogImage || '');
  acfSet('seo_docs_twitterCard', d.twitterCard || 'summary_large_image');
  acfSet('seo_docs_robots', d.robots || 'index, follow');
  var l = j.landing || {};
  acfSet('seo_landing_title', l.title || '');
  acfSet('seo_landing_description', l.description || '');
  acfSet('seo_landing_keywords', l.keywords || '');
  acfSet('seo_landing_ogImage', l.ogImage || '');
  acfSet('seo_landing_twitterCard', l.twitterCard || 'summary_large_image');
  acfSet('seo_landing_robots', l.robots || 'index, follow');
  acfSet('seo_robotsTxt', j.robotsTxt != null ? j.robotsTxt : '');
  var paths = Array.isArray(j.sitemapPaths) ? j.sitemapPaths : [];
  acfSet('seo_sitemapPaths', paths.join('\n'));
  var sitemapAuto = document.getElementById('seo_sitemapAuto');
  if (sitemapAuto) sitemapAuto.checked = j.sitemapAuto !== false;
  var incSearch = document.getElementById('seo_includeExtraPagesInSearch');
  if (incSearch) incSearch.checked = j.includeExtraPagesInSearch !== false;
  var incSite = document.getElementById('seo_includeExtraPagesInSitemap');
  if (incSite) incSite.checked = j.includeExtraPagesInSitemap !== false;
}

function collectSeoToObject() {
  var paths = acfGet('seo_sitemapPaths')
    .split(/\r?\n/)
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);
  var sitemapAutoEl = document.getElementById('seo_sitemapAuto');
  var sitemapAuto = !sitemapAutoEl || sitemapAutoEl.checked;
  return {
    version: 1,
    canonicalBase: acfGet('seo_canonicalBase').trim(),
    docs: {
      title: acfGet('seo_docs_title').trim(),
      description: acfGet('seo_docs_description').trim(),
      keywords: acfGet('seo_docs_keywords').trim(),
      ogImage: acfGet('seo_docs_ogImage').trim(),
      twitterCard: acfGet('seo_docs_twitterCard').trim() || 'summary_large_image',
      robots: acfGet('seo_docs_robots').trim() || 'index, follow',
    },
    landing: {
      title: acfGet('seo_landing_title').trim(),
      description: acfGet('seo_landing_description').trim(),
      keywords: acfGet('seo_landing_keywords').trim(),
      ogImage: acfGet('seo_landing_ogImage').trim(),
      twitterCard: acfGet('seo_landing_twitterCard').trim() || 'summary_large_image',
      robots: acfGet('seo_landing_robots').trim() || 'index, follow',
    },
    robotsTxt: acfGet('seo_robotsTxt'),
    sitemapAuto: sitemapAuto,
    sitemapPaths: paths,
    includeExtraPagesInSearch: (function () {
      var el = document.getElementById('seo_includeExtraPagesInSearch');
      return !el || el.checked;
    })(),
    includeExtraPagesInSitemap: (function () {
      var el = document.getElementById('seo_includeExtraPagesInSitemap');
      return !el || el.checked;
    })(),
  };
}

function linesToTextarea(lines) {
  if (!Array.isArray(lines)) return '';
  return lines.join('\n');
}

function textareaToLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(function (l) {
      return l;
    });
}

function populateLandingFromJson(j) {
  if (!j || typeof j !== 'object') return;
  var meta = j.meta || {};
  acfSet('land_meta_pageTitle', meta.pageTitle || '');
  var nav = j.nav || {};
  acfSet('land_nav_logoText', nav.logoText || '');
  acfSet('land_nav_brandTitle', nav.brandTitle || '');
  acfSet('land_nav_verBadge', nav.verBadge || '');
  acfSet('land_nav_brandSub', nav.brandSub || '');
  var links = Array.isArray(nav.links) ? nav.links : [];
  for (var i = 0; i < 5; i++) acfSet('land_nav_link' + i, links[i] || '');
  acfSet('land_nav_toolsLabel', nav.toolsLabel || '');
  acfSet('land_nav_ctaLabel', nav.ctaLabel || '');
  acfSet('land_scrollHint', j.scrollHint || '');
  var dots = Array.isArray(j.slideDots) ? j.slideDots : [];
  for (var d = 0; d < 5; d++) acfSet('land_slideDot' + d, dots[d] || '');

  var s1 = j.slide1 || {};
  acfSet('land_s1_eyebrow', s1.eyebrow || '');
  acfSet('land_s1_titleLine', s1.titleLine || '');
  acfSet('land_s1_titleHighlight', s1.titleHighlight || '');
  acfSet('land_s1_tagline', s1.tagline || '');
  acfSet('land_s1_desc', s1.desc || '');
  acfSet('land_s1_btnPrimary', s1.btnPrimary || '');
  acfSet('land_s1_btnSecondary', s1.btnSecondary || '');
  acfSet('land_s1_btnSecondaryUrl', s1.btnSecondaryUrl || '');
  acfSet('land_s1_terminalTitle', s1.terminalTitle || '');
  acfSet('land_s1_terminalLines', linesToTextarea(s1.terminalLines));

  var s2 = j.slide2 || {};
  acfSet('land_s2_tag', s2.tag || '');
  acfSet('land_s2_title', s2.title || '');
  acfSet('land_s2_subtitle', s2.subtitle || '');
  var stats = Array.isArray(s2.stats) ? s2.stats : [];
  for (var si = 0; si < 4; si++) {
    var c = stats[si] || {};
    acfSet('land_s2_stat' + si + '_num', c.num || '');
    acfSet('land_s2_stat' + si + '_label', c.label || '');
    acfSet('land_s2_stat' + si + '_desc', c.desc || '');
  }

  var s3 = j.slide3 || {};
  acfSet('land_s3_tag', s3.tag || '');
  acfSet('land_s3_title', s3.title || '');
  acfSet('land_s3_subtitle', s3.subtitle || '');
  var feats = Array.isArray(s3.features) ? s3.features : [];
  for (var fi = 0; fi < 6; fi++) {
    var f = feats[fi] || {};
    acfSet('land_s3_f' + fi + '_title', f.title || '');
    acfSet('land_s3_f' + fi + '_desc', f.desc || '');
    var tags = Array.isArray(f.tags) ? f.tags : [];
    for (var t = 0; t < 3; t++) acfSet('land_s3_f' + fi + '_tag' + t, tags[t] || '');
  }

  var s4 = j.slide4 || {};
  acfSet('land_s4_tag', s4.tag || '');
  acfSet('land_s4_titleLine1', s4.titleLine1 || '');
  acfSet('land_s4_titleLine2', s4.titleLine2 || '');
  acfSet('land_s4_subtitle', s4.subtitle || '');
  var bullets = Array.isArray(s4.bullets) ? s4.bullets : [];
  for (var b = 0; b < 4; b++) acfSet('land_s4_bullet' + b, bullets[b] || '');
  acfSet('land_s4_codeFilename', s4.codeFilename || '');
  acfSet('land_s4_codeLines', linesToTextarea(s4.codeLines));

  var s5 = j.slide5 || {};
  acfSet('land_s5_titleLine1', s5.titleLine1 || '');
  acfSet('land_s5_titleHighlight', s5.titleHighlight || '');
  acfSet('land_s5_desc', s5.desc || '');
  acfSet('land_s5_btnPrimary', s5.btnPrimary || '');
  acfSet('land_s5_btnSecondary', s5.btnSecondary || '');
  acfSet('land_s5_btnSecondaryUrl', s5.btnSecondaryUrl || '');
  var f5 = Array.isArray(s5.feats) ? s5.feats : [];
  for (var fi5 = 0; fi5 < 3; fi5++) {
    var x = f5[fi5] || {};
    acfSet('land_s5_feat' + fi5 + '_title', x.title || '');
    acfSet('land_s5_feat' + fi5 + '_desc', x.desc || '');
  }
  syncLandingBasicFromAdvanced();
}

function collectLandingToObject() {
  syncLandingAdvancedFromBasic();
  var links = [];
  for (var i = 0; i < 5; i++) links.push(acfGet('land_nav_link' + i));
  var dots = [];
  for (var d = 0; d < 5; d++) dots.push(acfGet('land_slideDot' + d));
  var stats = [];
  for (var si = 0; si < 4; si++) {
    stats.push({
      num: acfGet('land_s2_stat' + si + '_num'),
      label: acfGet('land_s2_stat' + si + '_label'),
      desc: acfGet('land_s2_stat' + si + '_desc'),
    });
  }
  var features = [];
  for (var fi = 0; fi < 6; fi++) {
    var tags = [];
    for (var t = 0; t < 3; t++) tags.push(acfGet('land_s3_f' + fi + '_tag' + t));
    features.push({
      title: acfGet('land_s3_f' + fi + '_title'),
      desc: acfGet('land_s3_f' + fi + '_desc'),
      tags: tags,
    });
  }
  var bullets = [];
  for (var b = 0; b < 4; b++) bullets.push(acfGet('land_s4_bullet' + b));
  var feats5 = [];
  for (var fi5 = 0; fi5 < 3; fi5++) {
    feats5.push({
      title: acfGet('land_s5_feat' + fi5 + '_title'),
      desc: acfGet('land_s5_feat' + fi5 + '_desc'),
    });
  }
  return {
    version: 1,
    meta: { pageTitle: acfGet('land_meta_pageTitle') },
    nav: {
      logoText: acfGet('land_nav_logoText'),
      brandTitle: acfGet('land_nav_brandTitle'),
      verBadge: acfGet('land_nav_verBadge'),
      brandSub: acfGet('land_nav_brandSub'),
      links: links,
      toolsLabel: acfGet('land_nav_toolsLabel'),
      ctaLabel: acfGet('land_nav_ctaLabel'),
    },
    scrollHint: acfGet('land_scrollHint'),
    slideDots: dots,
    slide1: {
      eyebrow: acfGet('land_s1_eyebrow'),
      titleLine: acfGet('land_s1_titleLine'),
      titleHighlight: acfGet('land_s1_titleHighlight'),
      tagline: acfGet('land_s1_tagline'),
      desc: acfGet('land_s1_desc'),
      btnPrimary: acfGet('land_s1_btnPrimary'),
      btnSecondary: acfGet('land_s1_btnSecondary'),
      btnSecondaryUrl: acfGet('land_s1_btnSecondaryUrl'),
      terminalTitle: acfGet('land_s1_terminalTitle'),
      terminalLines: textareaToLines(acfGet('land_s1_terminalLines')),
    },
    slide2: {
      tag: acfGet('land_s2_tag'),
      title: acfGet('land_s2_title'),
      subtitle: acfGet('land_s2_subtitle'),
      stats: stats,
    },
    slide3: {
      tag: acfGet('land_s3_tag'),
      title: acfGet('land_s3_title'),
      subtitle: acfGet('land_s3_subtitle'),
      features: features,
    },
    slide4: {
      tag: acfGet('land_s4_tag'),
      titleLine1: acfGet('land_s4_titleLine1'),
      titleLine2: acfGet('land_s4_titleLine2'),
      subtitle: acfGet('land_s4_subtitle'),
      bullets: bullets,
      codeFilename: acfGet('land_s4_codeFilename'),
      codeLines: textareaToLines(acfGet('land_s4_codeLines')),
    },
    slide5: {
      titleLine1: acfGet('land_s5_titleLine1'),
      titleHighlight: acfGet('land_s5_titleHighlight'),
      desc: acfGet('land_s5_desc'),
      btnPrimary: acfGet('land_s5_btnPrimary'),
      btnSecondary: acfGet('land_s5_btnSecondary'),
      btnSecondaryUrl: acfGet('land_s5_btnSecondaryUrl'),
      feats: feats5,
    },
  };
}

function syncLandingBasicFromAdvanced() {
  acfSet('land_basic_pageTitle', acfGet('land_meta_pageTitle'));
  acfSet('land_basic_brandTitle', acfGet('land_nav_brandTitle'));
  acfSet('land_basic_s1_title', acfGet('land_s1_titleLine'));
  acfSet('land_basic_s1_tagline', acfGet('land_s1_tagline'));
  acfSet('land_basic_s1_desc', acfGet('land_s1_desc'));
  acfSet('land_basic_btn_primary', acfGet('land_s1_btnPrimary'));
  acfSet('land_basic_btn_secondary_url', acfGet('land_s1_btnSecondaryUrl'));
  acfSet('land_basic_stat0_num', acfGet('land_s2_stat0_num'));
  acfSet('land_basic_stat0_label', acfGet('land_s2_stat0_label'));
  acfSet('land_basic_stat1_num', acfGet('land_s2_stat1_num'));
  acfSet('land_basic_stat1_label', acfGet('land_s2_stat1_label'));
  acfSet('land_basic_cta_title', acfGet('land_s5_titleLine1'));
  acfSet('land_basic_cta_desc', acfGet('land_s5_desc'));
  acfSet('land_basic_cta_btn', acfGet('land_s5_btnPrimary'));
}

function syncLandingAdvancedFromBasic() {
  if (!document.getElementById('land_basic_pageTitle')) return;
  acfSet('land_meta_pageTitle', acfGet('land_basic_pageTitle'));
  acfSet('land_nav_brandTitle', acfGet('land_basic_brandTitle'));
  acfSet('land_s1_titleLine', acfGet('land_basic_s1_title'));
  acfSet('land_s1_tagline', acfGet('land_basic_s1_tagline'));
  acfSet('land_s1_desc', acfGet('land_basic_s1_desc'));
  acfSet('land_s1_btnPrimary', acfGet('land_basic_btn_primary'));
  acfSet('land_s1_btnSecondaryUrl', acfGet('land_basic_btn_secondary_url'));
  acfSet('land_s2_stat0_num', acfGet('land_basic_stat0_num'));
  acfSet('land_s2_stat0_label', acfGet('land_basic_stat0_label'));
  acfSet('land_s2_stat1_num', acfGet('land_basic_stat1_num'));
  acfSet('land_s2_stat1_label', acfGet('land_basic_stat1_label'));
  acfSet('land_s5_titleLine1', acfGet('land_basic_cta_title'));
  acfSet('land_s5_desc', acfGet('land_basic_cta_desc'));
  acfSet('land_s5_btnPrimary', acfGet('land_basic_cta_btn'));
}

function setLandingEditorMode(mode) {
  var m = mode === 'advanced' ? 'advanced' : 'basic';
  var adv = document.getElementById('landingAdvancedFields');
  var btnBasic = document.getElementById('btnLandingModeBasic');
  var btnAdv = document.getElementById('btnLandingModeAdvanced');
  if (adv) adv.classList.toggle('admin-hidden', m !== 'advanced');
  if (btnBasic) btnBasic.className = m === 'basic' ? 'admin-btn-primary' : 'admin-btn-ghost';
  if (btnAdv) btnAdv.className = m === 'advanced' ? 'admin-btn-primary' : 'admin-btn-ghost';
  try {
    localStorage.setItem('ebu4_landing_editor_mode', m);
  } catch (_) {}
}

function applyLandingTemplatePreset(preset) {
  var map = {
    'tech-docs': {
      pageTitle: '技术文档门户',
      brandTitle: '技术文档中心',
      s1Title: '构建高效技术知识库',
      s1Tagline: '面向团队协作的文档门户，支持检索与版本演进。',
      s1Desc: '聚合规范、接口和实践经验，帮助团队快速共享知识。',
      btnPrimary: '进入文档',
      btnSecondaryUrl: 'https://example.com/docs',
      stat0Num: '1200+',
      stat0Label: '文档条目',
      stat1Num: '24/7',
      stat1Label: '随时访问',
      ctaTitle: '开始沉淀团队知识',
      ctaDesc: '从今天开始，把核心经验沉淀为可复用文档。',
      ctaBtn: '立即开始',
    },
    'product-launch': {
      pageTitle: '产品发布门户',
      brandTitle: '产品发布中心',
      s1Title: '把产品能力讲清楚',
      s1Tagline: '一页式展示产品价值、能力亮点与上手路径。',
      s1Desc: '帮助用户快速理解产品，并完成从了解到试用的转化。',
      btnPrimary: '立即体验',
      btnSecondaryUrl: 'https://example.com/product',
      stat0Num: '30%',
      stat0Label: '转化提升',
      stat1Num: '10x',
      stat1Label: '部署效率',
      ctaTitle: '准备好开始体验了吗？',
      ctaDesc: '从现在开始，快速完成部署并进入真实业务场景。',
      ctaBtn: '开始试用',
    },
    'enterprise-portal': {
      pageTitle: '企业数字化门户',
      brandTitle: '企业数字化服务门户',
      s1Title: '统一入口，协同提效',
      s1Tagline: '覆盖流程、数据、应用的一站式企业门户。',
      s1Desc: '通过统一门户承载业务系统，提升组织协同效率和治理能力。',
      btnPrimary: '进入门户',
      btnSecondaryUrl: 'https://example.com/portal',
      stat0Num: '50+',
      stat0Label: '业务场景',
      stat1Num: '99.9%',
      stat1Label: '可用性',
      ctaTitle: '让组织协同更简单',
      ctaDesc: '基于统一门户，打造高效稳定的企业数字化底座。',
      ctaBtn: '查看方案',
    },
  };
  var p = map[preset];
  if (!p) return false;
  acfSet('land_basic_pageTitle', p.pageTitle);
  acfSet('land_basic_brandTitle', p.brandTitle);
  acfSet('land_basic_s1_title', p.s1Title);
  acfSet('land_basic_s1_tagline', p.s1Tagline);
  acfSet('land_basic_s1_desc', p.s1Desc);
  acfSet('land_basic_btn_primary', p.btnPrimary);
  acfSet('land_basic_btn_secondary_url', p.btnSecondaryUrl);
  acfSet('land_basic_stat0_num', p.stat0Num);
  acfSet('land_basic_stat0_label', p.stat0Label);
  acfSet('land_basic_stat1_num', p.stat1Num);
  acfSet('land_basic_stat1_label', p.stat1Label);
  acfSet('land_basic_cta_title', p.ctaTitle);
  acfSet('land_basic_cta_desc', p.ctaDesc);
  acfSet('land_basic_cta_btn', p.ctaBtn);
  syncLandingAdvancedFromBasic();
  return true;
}

function initLandingEditorEnhancements() {
  var btnBasic = document.getElementById('btnLandingModeBasic');
  var btnAdv = document.getElementById('btnLandingModeAdvanced');
  var btnTpl = document.getElementById('btnApplyLandingTemplate');
  var selTpl = document.getElementById('landingTemplatePreset');
  if (btnBasic && !btnBasic.dataset.bound) {
    btnBasic.dataset.bound = '1';
    btnBasic.addEventListener('click', function () {
      setLandingEditorMode('basic');
    });
  }
  if (btnAdv && !btnAdv.dataset.bound) {
    btnAdv.dataset.bound = '1';
    btnAdv.addEventListener('click', function () {
      setLandingEditorMode('advanced');
    });
  }
  if (btnTpl && selTpl && !btnTpl.dataset.bound) {
    btnTpl.dataset.bound = '1';
    btnTpl.addEventListener('click', function () {
      var ok = applyLandingTemplatePreset(selTpl.value || '');
      var msg = document.getElementById('landingMsg');
      if (!msg) return;
      if (!ok) {
        msg.textContent = '请先选择模板';
        msg.className = 'admin-msg err';
        return;
      }
      msg.textContent = '模板已套用，请确认后保存';
      msg.className = 'admin-msg ok';
    });
  }
  var mode = 'basic';
  try {
    mode = localStorage.getItem('ebu4_landing_editor_mode') || 'basic';
  } catch (_) {}
  setLandingEditorMode(mode);
}

if (typeof window !== 'undefined') {
  window.populateSeoFromJson = populateSeoFromJson;
  window.collectSeoToObject = collectSeoToObject;
  window.populateLandingFromJson = populateLandingFromJson;
  window.collectLandingToObject = collectLandingToObject;
  window.initLandingEditorEnhancements = initLandingEditorEnhancements;
}
