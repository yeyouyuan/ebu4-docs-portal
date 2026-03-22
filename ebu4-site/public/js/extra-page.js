/**
 * 扩展页面前台：/page/:slug → GET /api/pages/:slug（博客式版式）
 */
(function () {
  var loading = document.getElementById('extraPageLoading');
  var errEl = document.getElementById('extraPageErr');
  var bodyEl = document.getElementById('extraPageBody');
  var headEl = document.getElementById('blogArticleHead');
  var titleEl = document.getElementById('blogTitle');
  var metaEl = document.getElementById('blogMeta');
  var tagsEl = document.getElementById('blogTags');
  var coverWrap = document.getElementById('blogCoverWrap');
  var coverImg = document.getElementById('blogCoverImg');
  var excerptEl = document.getElementById('blogExcerpt');

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

  function fillArticleHead(data) {
    if (titleEl) titleEl.textContent = data.title || '';
    var parts = [];
    if (data.author) parts.push(data.author);
    if (data.publishedAt) {
      try {
        parts.push(new Date(data.publishedAt).toLocaleString('zh-CN'));
      } catch (_) {
        parts.push(data.publishedAt);
      }
    }
    if (metaEl) metaEl.textContent = parts.join(' · ');
    if (tagsEl) {
      if (data.tags && data.tags.length) {
        tagsEl.innerHTML = data.tags
          .map(function (t) {
            return '<span class="blog-tag">' + escapeHtml(String(t)) + '</span>';
          })
          .join('');
        tagsEl.classList.remove('admin-hidden');
      } else {
        tagsEl.innerHTML = '';
        tagsEl.classList.add('admin-hidden');
      }
    }
    if (coverWrap && coverImg) {
      if (data.cover) {
        coverImg.src = data.cover;
        coverImg.alt = data.title || '';
        coverWrap.classList.remove('admin-hidden');
      } else {
        coverWrap.classList.add('admin-hidden');
      }
    }
    if (excerptEl) {
      if (data.excerpt) {
        excerptEl.textContent = data.excerpt;
        excerptEl.classList.remove('admin-hidden');
      } else {
        excerptEl.classList.add('admin-hidden');
      }
    }
    if (headEl) headEl.classList.remove('admin-hidden');
  }

  async function run() {
    var slug = matchSlug();
    if (!slug) {
      if (loading) loading.classList.add('admin-hidden');
      if (errEl) {
        errEl.textContent = '无效的页面地址';
        errEl.className = 'admin-msg err';
        errEl.classList.remove('admin-hidden');
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

      fillArticleHead(data);

      var html;
      if (data.format === 'richtext') {
        html = window.DOMPurify ? DOMPurify.sanitize(data.body || '') : data.body || '';
      } else {
        if (window.marked) {
          var mdOpts = { gfm: true, breaks: true };
          if (window.hljs) {
            mdOpts.highlight = function (code, lang) {
              if (lang && hljs.getLanguage(lang)) {
                try {
                  return hljs.highlight(code, { language: lang }).value;
                } catch (_) {}
              }
              try {
                return hljs.highlightAuto(code).value;
              } catch (_) {
                return escapeHtml(code);
              }
            };
          }
          marked.setOptions(mdOpts);
          var raw =
            typeof marked.parse === 'function'
              ? marked.parse(data.body || '')
              : marked(data.body || '');
          html = window.DOMPurify ? DOMPurify.sanitize(raw) : raw;
        } else {
          html = '<pre>' + escapeHtml(data.body || '') + '</pre>';
        }
      }

      if (bodyEl) bodyEl.innerHTML = html;
      if (loading) loading.classList.add('admin-hidden');
      if (errEl) errEl.classList.add('admin-hidden');
      if (window.hljs && bodyEl) {
        bodyEl.querySelectorAll('pre code').forEach(function (block) {
          try {
            hljs.highlightElement(block);
          } catch (_) {}
        });
      }
    } catch (e) {
      if (loading) loading.classList.add('admin-hidden');
      if (headEl) headEl.classList.add('admin-hidden');
      if (bodyEl) bodyEl.innerHTML = '';
      if (errEl) {
        errEl.textContent = String(e.message || e);
        errEl.className = 'admin-msg err';
        errEl.classList.remove('admin-hidden');
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
