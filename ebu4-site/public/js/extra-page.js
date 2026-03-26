/**
 * 扩展页：与文档站相同 layout，内容来自 /api/pages/:slug
 */
(function () {
  function matchSlug() {
    var m = location.pathname.match(/^\/page\/([^/]+)\/?$/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  window.toggleSidebar = function () {
    var el = document.getElementById('sidebar');
    if (el) el.classList.toggle('open');
  };

  window.scrollToHeading = function (id) {
    var el = document.getElementById(id);
    if (!el) {
      var headings = document.querySelectorAll('.md-content h2, .md-content h3');
      for (var i = 0; i < headings.length; i++) {
        var h = headings[i];
        if (
          h.textContent.trim().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').toLowerCase() === id
        ) {
          el = h;
          break;
        }
      }
    }
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  function renderTocFromDom() {
    var container = document.getElementById('tocList');
    if (!container) return;
    var headings = document.querySelectorAll('.md-content h2, .md-content h3');
    if (!headings.length) {
      container.innerHTML =
        '<div style="color:var(--text-dim);font-size:.75rem;padding:8px 14px;">暂无目录</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < headings.length; i++) {
      var h = headings[i];
      var text = h.textContent.trim();
      var id = text.replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').toLowerCase();
      if (!h.id) h.id = id;
      var level = h.tagName === 'H3' ? 3 : 2;
      var depthClass = level === 3 ? ' depth-3' : '';
      html +=
        '<a class="toc-link' +
        depthClass +
        '" href="#' +
        escapeHtml(id) +
        '" data-toc-anchor="' +
        escapeHtml(id) +
        '" onclick="event.preventDefault();scrollToHeading(this.getAttribute(\'data-toc-anchor\'))">' +
        escapeHtml(text) +
        '</a>';
    }
    container.innerHTML = html;
  }

  function fixDocImages() {
    document.querySelectorAll('.md-content img').forEach(function (img) {
      var src = img.getAttribute('src');
      if (src && src.startsWith('ebu4-docs-img/')) {
        img.src = '/img/' + src.replace('ebu4-docs-img/', '');
      }
    });
  }

  async function run() {
    var slug = matchSlug();
    var contentArea = document.getElementById('contentArea');
    if (!slug) {
      if (contentArea) {
        contentArea.innerHTML =
          '<div class="loading"><p style="color:var(--text-dim)">无效的页面地址</p></div>';
      }
      return;
    }

    try {
      var r = await fetch('/api/pages/' + encodeURIComponent(slug), { credentials: 'same-origin' });
      var data = await r.json().catch(function () {
        return {};
      });
      if (!r.ok) {
        throw new Error(data.error || r.statusText || '加载失败');
      }
      document.title = (data.title || slug) + ' — EBU4';

      var jump = data.linkUrl && String(data.linkUrl).trim();
      if (jump) {
        window.location.replace(jump);
        return;
      }

      var parts = [];
      if (data.author) parts.push(escapeHtml(data.author));
      if (data.publishedAt) {
        try {
          parts.push(escapeHtml(new Date(data.publishedAt).toLocaleString('zh-CN')));
        } catch (_) {
          parts.push(escapeHtml(String(data.publishedAt)));
        }
      }
      var metaLine = parts.join(' · ');

      var tagsHtml = '';
      if (data.tags && data.tags.length) {
        tagsHtml =
          '<div class="extra-doc-tags">' +
          data.tags
            .map(function (t) {
              return '<span class="extra-doc-tag">' + escapeHtml(String(t)) + '</span>';
            })
            .join('') +
          '</div>';
      }

      var excerptHtml = '';
      if (data.excerpt) {
        excerptHtml =
          '<p class="extra-doc-excerpt">' + escapeHtml(data.excerpt) + '</p>';
      }

      var bodyHtml;
      if (data.format === 'richtext' || data.format === 'html') {
        bodyHtml = window.DOMPurify ? DOMPurify.sanitize(data.body || '') : data.body || '';
      } else {
        if (window.marked) {
          var raw =
            typeof marked.parse === 'function'
              ? marked.parse(data.body || '')
              : marked(data.body || '');
          bodyHtml = window.DOMPurify ? DOMPurify.sanitize(raw) : raw;
        } else {
          bodyHtml = '<pre>' + escapeHtml(data.body || '') + '</pre>';
        }
      }

      var articleHtml =
        '<article class="extra-doc-article">' +
        '<header class="extra-doc-head">' +
        '<h1 class="extra-doc-title">' +
        escapeHtml(data.title || slug) +
        '</h1>' +
        (metaLine ? '<p class="extra-doc-meta">' + metaLine + '</p>' : '') +
        excerptHtml +
        tagsHtml +
        '</header>' +
        '<div class="md-content">' +
        bodyHtml +
        '</div>' +
        '</article>';

      if (contentArea) contentArea.innerHTML = articleHtml;

      fixDocImages();

      var bodyEl = contentArea && contentArea.querySelector('.md-content');
      if (window.hljs && bodyEl) {
        bodyEl.querySelectorAll('pre code').forEach(function (block) {
          try {
            hljs.highlightElement(block);
          } catch (_) {}
        });
      }

      renderTocFromDom();
      window.scrollTo({ top: 0, behavior: 'auto' });
    } catch (e) {
      if (contentArea) {
        contentArea.innerHTML =
          '<div class="loading"><p style="color:var(--text-dim);max-width:28rem;margin:0 auto;line-height:1.7">' +
          escapeHtml(String(e.message || e)) +
          '</p></div>';
      }
    }
  }

  document.addEventListener('DOMContentLoaded', async function () {
    initThemePicker();
    initBgCanvas();
    initSearchUI();

    marked.setOptions({
      highlight: function (code, lang) {
        if (lang && hljs.getLanguage(lang)) {
          return hljs.highlight(code, { language: lang }).value;
        }
        return hljs.highlightAuto(code).value;
      },
      breaks: false,
      gfm: true,
    });

    try {
      await fetch('/api/site/session', { credentials: 'same-origin' });
    } catch (_) {}

    await run();
  });
})();
