/**
 * 扩展内容：Markdown / 富文本（Quill）+ 预览
 * 依赖：marked、DOMPurify、Turndown、Quill（由 admin.html CDN 引入）
 */
(function () {
  var quillInstance = null;
  var pageViewMode = 'edit';
  var lastFormat = 'markdown';
  var selectedPageId = null;
  var pagesCache = [];
  var selectedTagFilter = '';

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function isoToDatetimeLocal(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var pad = function (n) {
      return n < 10 ? '0' + n : '' + n;
    };
    return (
      d.getFullYear() +
      '-' +
      pad(d.getMonth() + 1) +
      '-' +
      pad(d.getDate()) +
      'T' +
      pad(d.getHours()) +
      ':' +
      pad(d.getMinutes())
    );
  }

  function datetimeLocalToIso(s) {
    if (!s || !String(s).trim()) return null;
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  function updateExtraPageOpenLink() {
    var a = $('extraPageOpenFront');
    if (!a) return;
    var slug = ($('extraPageSlug') && $('extraPageSlug').value.trim()) || '';
    if (!slug) {
      a.setAttribute('href', '#');
      a.classList.add('is-disabled');
      a.setAttribute('aria-disabled', 'true');
      a.title = '请先填写 slug';
      return;
    }
    a.setAttribute('href', '/page/' + encodeURIComponent(slug));
    a.classList.remove('is-disabled');
    a.removeAttribute('aria-disabled');
    a.title = '在新标签打开前台页面';
  }

  function updateCoverThumbPreview() {
    var wrap = $('extraPageCoverThumbWrap');
    var img = $('extraPageCoverThumb');
    if (!wrap || !img) return;
    var url = ($('extraPageCover') && $('extraPageCover').value.trim()) || '';
    if (!url) {
      wrap.hidden = true;
      img.removeAttribute('src');
      return;
    }
    wrap.hidden = false;
    img.onerror = function () {
      wrap.hidden = true;
    };
    img.onload = function () {
      wrap.hidden = false;
    };
    img.src = url;
  }

  function collectBlogPayload() {
    return {
      excerpt: $('extraPageExcerpt') ? $('extraPageExcerpt').value : '',
      cover: $('extraPageCover') ? $('extraPageCover').value.trim() : '',
      tags: $('extraPageTags') ? $('extraPageTags').value : '',
      author: $('extraPageAuthor') ? $('extraPageAuthor').value.trim() : '',
      status: $('extraPageStatus') ? $('extraPageStatus').value : 'draft',
      publishedAt: datetimeLocalToIso($('extraPagePublishedAt') ? $('extraPagePublishedAt').value : ''),
      securityLevel: $('extraPageSecurityLevel') ? $('extraPageSecurityLevel').value : 'public',
      linkUrl: $('extraPageLinkUrl') ? $('extraPageLinkUrl').value.trim() : '',
    };
  }

  async function api(path, opt) {
    var r = await fetch(
      path,
      Object.assign(
        {
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
        },
        opt || {}
      )
    );
    var text = await r.text();
    var data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      data = { _raw: text };
    }
    if (!r.ok) throw new Error(data.error || r.statusText || '请求失败');
    return data;
  }

  function updateExtraEditorStatus() {
    var right = $('extraEditorStatusRight');
    var fmt = $('extraPageFormat') && $('extraPageFormat').value;
    var bytes = 0;
    if (fmt === 'richtext' && quillInstance) {
      try {
        bytes = new Blob([quillInstance.root.innerHTML || '']).size;
      } catch (_) {}
    } else if ($('extraPageBodyMd') && (fmt === 'markdown' || fmt === 'html')) {
      try {
        bytes = new Blob([$('extraPageBodyMd').value || '']).size;
      } catch (_) {}
    }
    if (right) {
      right.textContent = bytes ? bytes + ' 字节' : '';
    }
  }

  function syncExtraStatusUi() {
    var sel = $('extraPageStatus');
    if (!sel) return;
    var v = sel.value;
    document.querySelectorAll('.de-status-opt').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-status') === v);
    });
    var badge = $('extraPageStatusBadge');
    if (badge) {
      badge.textContent = v === 'published' ? '已发布' : '草稿';
      badge.classList.toggle('is-draft', v === 'draft');
    }
  }

  function updateExtraToolbarViewButtons() {
    var ed = $('btnDeExtraEdit');
    var pr = $('btnDeExtraPreview');
    if (ed) ed.classList.toggle('de-btn-active', pageViewMode === 'edit');
    if (pr) pr.classList.toggle('de-btn-active', pageViewMode === 'preview');
  }

  function initQuill() {
    if (quillInstance) return quillInstance;
    if (typeof Quill === 'undefined') {
      throw new Error('Quill 未加载');
    }
    quillInstance = new Quill('#extraPageQuill', {
      theme: 'snow',
      modules: {
        toolbar: [
          [{ header: [1, 2, 3, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          [{ color: [] }, { background: [] }],
          ['link', 'blockquote', 'code-block'],
          ['clean'],
        ],
      },
    });
    quillInstance.on('text-change', function () {
      updateExtraEditorStatus();
    });
    return quillInstance;
  }

  function getBodyForSave() {
    var fmt = $('extraPageFormat').value;
    if (fmt === 'richtext') {
      var q = initQuill();
      var html = q.root.innerHTML;
      if (window.DOMPurify) return DOMPurify.sanitize(html);
      return html;
    }
    if (fmt === 'html') {
      var raw = $('extraPageBodyMd') ? $('extraPageBodyMd').value : '';
      if (window.DOMPurify) return DOMPurify.sanitize(raw);
      return raw;
    }
    return $('extraPageBodyMd').value;
  }

  function renderPreview() {
    var fmt = $('extraPageFormat').value;
    var body;
    if (fmt === 'richtext') {
      var q = initQuill();
      body = q.root.innerHTML;
    } else {
      body = $('extraPageBodyMd').value;
    }
    var el = $('extraPagePreview');
    if (!el) return;
    var title = ($('extraPageTitle') && $('extraPageTitle').value) || '标题';
    var excerpt = ($('extraPageExcerpt') && $('extraPageExcerpt').value) || '';
    var cover = ($('extraPageCover') && $('extraPageCover').value) || '';
    var author = ($('extraPageAuthor') && $('extraPageAuthor').value) || '';
    var tagsStr = ($('extraPageTags') && $('extraPageTags').value) || '';
    var status = ($('extraPageStatus') && $('extraPageStatus').value) || 'draft';
    var pub = ($('extraPagePublishedAt') && $('extraPagePublishedAt').value) || '';
    var head =
      '<div class="blog-preview-head"><h1 class="blog-preview-title">' +
      escapeHtml(title) +
      '</h1><p class="blog-preview-meta">' +
      escapeHtml(author) +
      (author ? ' · ' : '') +
      (status === 'draft' ? '草稿' : '已发布') +
      (pub ? ' · ' + escapeHtml(pub.replace('T', ' ')) : '') +
      '</p>';
    if (tagsStr) {
      head += '<p class="blog-preview-tags">' + escapeHtml(tagsStr) + '</p>';
    }
    if (cover) {
      head +=
        '<p class="blog-preview-cover"><img src="' +
        escapeHtml(cover) +
        '" alt="" loading="lazy"/></p>';
    }
    if (excerpt) {
      head += '<p class="blog-preview-excerpt">' + escapeHtml(excerpt) + '</p>';
    }
    head += '</div>';
    if (window.marked && typeof marked.parse === 'function') {
      marked.setOptions({ gfm: true, breaks: true });
    }
    var bodyHtml;
    if (fmt === 'markdown') {
      var raw =
        window.marked && typeof marked.parse === 'function'
          ? marked.parse(body || '')
          : '<pre>' + escapeHtml(body || '') + '</pre>';
      bodyHtml = window.DOMPurify ? DOMPurify.sanitize(raw) : raw;
    } else {
      bodyHtml = window.DOMPurify ? DOMPurify.sanitize(body || '') : body || '';
    }
    el.innerHTML = head + '<div class="blog-preview-body">' + bodyHtml + '</div>';
  }

  function setExtraBodyPlaceholder() {
    var ta = $('extraPageBodyMd');
    if (!ta) return;
    var fmt = $('extraPageFormat') && $('extraPageFormat').value;
    if (fmt === 'html') {
      ta.placeholder =
        '编写 HTML，支持站内链接，例如 <a href="/docs#home">文档</a>、<a href="/page/slug">扩展页</a>、<img src="/img/…" />';
    } else {
      ta.placeholder = '开始写作…（Markdown，可粘贴 / 拖入图片）';
    }
  }

  function updateExtraPageViewPanels() {
    var fmt = $('extraPageFormat').value;
    var editing = pageViewMode === 'edit';
    var prev = $('extraPageWrapPreview');
    var mdW = $('extraPageWrapMd');
    var qW = $('extraPageWrapQuill');
    var mdTools = $('extraPageMdTools');
    if (prev) prev.classList.toggle('admin-hidden', editing);
    if (mdW) mdW.classList.toggle('admin-hidden', !editing || (fmt !== 'markdown' && fmt !== 'html'));
    if (qW) qW.classList.toggle('admin-hidden', !editing || fmt !== 'richtext');
    if (mdTools) {
      var hideTools = !editing || fmt !== 'markdown';
      mdTools.classList.toggle('is-hidden', hideTools);
    }
    setExtraBodyPlaceholder();
    if (!editing) renderPreview();
    updateExtraEditorStatus();
    updateExtraToolbarViewButtons();
  }

  function setPageViewMode(mode) {
    pageViewMode = mode === 'preview' ? 'preview' : 'edit';
    document.querySelectorAll('.admin-page-tab[data-page-view]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-page-view') === (pageViewMode === 'preview' ? 'preview' : 'edit'));
    });
    updateExtraPageViewPanels();
  }

  function renderExtraPageList(filterText) {
    var ul = $('extraPageList');
    if (!ul) return;
    var cnt = $('extraPageListCount');
    var term = (filterText || '').toLowerCase().trim();
    ul.innerHTML = '';
    function pageTags(page) {
      if (!page) return [];
      var arr = Array.isArray(page.tags) ? page.tags : [];
      return arr
        .map(function (x) {
          return String(x || '').trim();
        })
        .filter(Boolean);
    }
    function primaryTag(page) {
      var tags = pageTags(page);
      return tags.length ? tags[0] : '未分类';
    }
    var rows = pagesCache.filter(function (p) {
      if (selectedTagFilter) {
        var tags = pageTags(p);
        if (selectedTagFilter === '__untagged__') {
          if (tags.length) return false;
        } else if (tags.indexOf(selectedTagFilter) < 0) {
          return false;
        }
      }
      if (!term) return true;
      var tagStr = pageTags(p).join(' ');
      return (
        String(p.title).toLowerCase().indexOf(term) !== -1 ||
        String(p.slug).toLowerCase().indexOf(term) !== -1 ||
        tagStr.toLowerCase().indexOf(term) !== -1
      );
    });
    if (cnt) {
      var total = pagesCache.length;
      var shown = rows.length;
      cnt.textContent = term ? shown + ' / ' + total + ' 篇' : total + ' 篇';
    }
    if (!rows.length) {
      var li0 = document.createElement('li');
      var hint = document.createElement('div');
      hint.className = 'extra-pages-list-empty';
      hint.textContent = pagesCache.length ? '无匹配页面，试试其它关键词' : '暂无页面，点击「新建页面」开始';
      li0.appendChild(hint);
      ul.appendChild(li0);
      return;
    }
    var grouped = {};
    rows.forEach(function (p) {
      var k = primaryTag(p);
      if (!grouped[k]) grouped[k] = [];
      grouped[k].push(p);
    });
    Object.keys(grouped)
      .sort(function (a, b) {
        if (a === '未分类') return 1;
        if (b === '未分类') return -1;
        return a.localeCompare(b, 'zh-CN');
      })
      .forEach(function (k) {
        var groupLi = document.createElement('li');
        groupLi.className = 'extra-pages-group-title';
        groupLi.textContent = k + ' · ' + grouped[k].length;
        ul.appendChild(groupLi);
        grouped[k].forEach(function (p) {
          var li = document.createElement('li');
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'extra-pages-li-btn';
          btn.dataset.id = p.id;
          if (selectedPageId === p.id) btn.classList.add('active');
          btn.innerHTML =
            '<span class="extra-pages-li-title">' +
            escapeHtml(p.title || '(无标题)') +
            (p.linkUrl ? '<span class="extra-pages-li-link" title="跳转页">↗</span>' : '') +
            '</span><span class="extra-pages-li-slug">/' +
            escapeHtml(p.slug || '') +
            '</span><span class="extra-pages-li-meta"><span class="extra-pages-pill ' +
            (p.status === 'draft' ? 'is-draft' : 'is-live') +
            '">' +
            (p.status === 'draft' ? '草稿' : '已发布') +
            '</span></span>';
          btn.addEventListener('click', function () {
            selectExtraPage(p.id);
          });
          li.appendChild(btn);
          ul.appendChild(li);
        });
      });
  }

  function renderExtraTagFilters() {
    var host = $('extraPageTagFilters');
    if (!host) return;
    var stats = {};
    var untagged = 0;
    pagesCache.forEach(function (p) {
      var tags = Array.isArray(p.tags) ? p.tags : [];
      tags = tags
        .map(function (x) {
          return String(x || '').trim();
        })
        .filter(Boolean);
      if (!tags.length) {
        untagged += 1;
        return;
      }
      tags.forEach(function (t) {
        stats[t] = (stats[t] || 0) + 1;
      });
    });
    var html = '';
    var total = pagesCache.length;
    html +=
      '<button type="button" class="extra-pages-tag-chip' +
      (!selectedTagFilter ? ' active' : '') +
      '" data-tag="">全部 ' +
      total +
      '</button>';
    Object.keys(stats)
      .sort(function (a, b) {
        return a.localeCompare(b, 'zh-CN');
      })
      .forEach(function (tag) {
        html +=
          '<button type="button" class="extra-pages-tag-chip' +
          (selectedTagFilter === tag ? ' active' : '') +
          '" data-tag="' +
          escapeHtml(tag) +
          '">' +
          escapeHtml(tag) +
          ' ' +
          stats[tag] +
          '</button>';
      });
    if (untagged > 0) {
      html +=
        '<button type="button" class="extra-pages-tag-chip' +
        (selectedTagFilter === '__untagged__' ? ' active' : '') +
        '" data-tag="__untagged__">未分类 ' +
        untagged +
        '</button>';
    }
    host.innerHTML = html;
    host.querySelectorAll('.extra-pages-tag-chip').forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectedTagFilter = btn.getAttribute('data-tag') || '';
        renderExtraTagFilters();
        renderExtraPageList($('extraPageFilter') ? $('extraPageFilter').value : '');
      });
    });
  }

  function applyPageToForm(page) {
    $('extraPageTitle').value = page.title || '';
    $('extraPageSlug').value = page.slug || '';
    if ($('extraPageExcerpt')) $('extraPageExcerpt').value = page.excerpt || '';
    if ($('extraPageCover')) $('extraPageCover').value = page.cover || '';
    if ($('extraPageTags')) $('extraPageTags').value = Array.isArray(page.tags) ? page.tags.join(', ') : '';
    if ($('extraPageAuthor')) $('extraPageAuthor').value = page.author || '';
    if ($('extraPageStatus')) $('extraPageStatus').value = page.status === 'draft' ? 'draft' : 'published';
    if ($('extraPagePublishedAt')) $('extraPagePublishedAt').value = isoToDatetimeLocal(page.publishedAt);
    if ($('extraPageLinkUrl')) $('extraPageLinkUrl').value = page.linkUrl || '';
    $('extraPageFormat').value =
      page.format === 'richtext' ? 'richtext' : page.format === 'html' ? 'html' : 'markdown';
    lastFormat = $('extraPageFormat').value;
    if ($('extraPageSecurityLevel')) {
      $('extraPageSecurityLevel').value = page.securityLevel || 'public';
    }
    if (page.format === 'richtext') {
      $('extraPageBodyMd').value = '';
      initQuill();
      var html = page.body || '';
      var safeHtml = window.DOMPurify ? DOMPurify.sanitize(html) : html;
      quillInstance.setText('');
      quillInstance.clipboard.dangerouslyPasteHTML(0, safeHtml, 'silent');
    } else {
      $('extraPageBodyMd').value = page.body || '';
      if (quillInstance) quillInstance.setText('');
    }
    setExtraBodyPlaceholder();
    setPageViewMode('edit');
    syncExtraStatusUi();
    updateExtraPageOpenLink();
    updateCoverThumbPreview();
    updateExtraEditorStatus();
  }

  async function selectExtraPage(id) {
    $('extraPageMsg').textContent = '';
    $('extraPageMsg').className = 'admin-msg';
    var d = await api('/api/admin/pages/' + id);
    var page = d.page;
    selectedPageId = page.id;
    applyPageToForm(page);
    renderExtraPageList($('extraPageFilter') ? $('extraPageFilter').value : '');
  }

  async function loadExtraPagesList() {
    try {
      var d = await api('/api/admin/pages');
      pagesCache = d.pages || [];
      if (selectedTagFilter) {
        var stillExists = pagesCache.some(function (p) {
          var tags = Array.isArray(p.tags) ? p.tags : [];
          tags = tags
            .map(function (x) {
              return String(x || '').trim();
            })
            .filter(Boolean);
          if (selectedTagFilter === '__untagged__') return !tags.length;
          return tags.indexOf(selectedTagFilter) >= 0;
        });
        if (!stillExists) selectedTagFilter = '';
      }
      if (!pagesCache.length) {
        selectedTagFilter = '';
        selectedPageId = null;
        $('extraPageTitle').value = '';
        $('extraPageSlug').value = '';
        if ($('extraPageExcerpt')) $('extraPageExcerpt').value = '';
        if ($('extraPageCover')) $('extraPageCover').value = '';
        if ($('extraPageTags')) $('extraPageTags').value = '';
        if ($('extraPageAuthor')) $('extraPageAuthor').value = '';
        if ($('extraPageStatus')) $('extraPageStatus').value = 'draft';
        if ($('extraPagePublishedAt')) $('extraPagePublishedAt').value = '';
        $('extraPageFormat').value = 'markdown';
        lastFormat = 'markdown';
        if ($('extraPageSecurityLevel')) $('extraPageSecurityLevel').value = 'public';
        $('extraPageBodyMd').value = '';
        if (quillInstance) {
          quillInstance.setText('');
        }
        updateExtraPageOpenLink();
        updateCoverThumbPreview();
        syncExtraStatusUi();
        updateExtraEditorStatus();
        renderExtraTagFilters();
        renderExtraPageList($('extraPageFilter') ? $('extraPageFilter').value : '');
        return;
      }
      var pick = pagesCache.find(function (p) {
        return p.id === selectedPageId;
      });
      if (!pick) pick = pagesCache[0];
      renderExtraTagFilters();
      await selectExtraPage(pick.id);
    } catch (e) {
      pagesCache = [];
      selectedTagFilter = '';
      renderExtraTagFilters();
      renderExtraPageList('');
      console.warn(e);
    }
  }

  function initExtraPages() {
    var filterEl = $('extraPageFilter');
    if (filterEl) {
      filterEl.addEventListener('input', function () {
        renderExtraPageList(filterEl.value);
      });
    }

    var openFront = $('extraPageOpenFront');
    if (openFront) {
      openFront.addEventListener('click', function (e) {
        if (openFront.classList.contains('is-disabled')) e.preventDefault();
      });
    }
    var slugEl = $('extraPageSlug');
    if (slugEl) {
      slugEl.addEventListener('input', updateExtraPageOpenLink);
      slugEl.addEventListener('change', updateExtraPageOpenLink);
    }
    var statusEl = $('extraPageStatus');
    if (statusEl) {
      statusEl.addEventListener('change', function () {
        syncExtraStatusUi();
        updateExtraPageOpenLink();
      });
    }
    document.querySelectorAll('.de-status-opt').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var st = btn.getAttribute('data-status');
        if ($('extraPageStatus')) $('extraPageStatus').value = st;
        syncExtraStatusUi();
      });
    });
    var btnProps = $('btnExtraToggleProps');
    var extraPanel = $('extraPropsPanel');
    if (btnProps && extraPanel) {
      btnProps.addEventListener('click', function () {
        extraPanel.classList.toggle('open');
      });
    }
    var tabEdit = $('tabPageViewEdit');
    var tabPrev = $('tabPageViewPreview');
    var bEd = $('btnDeExtraEdit');
    var bPr = $('btnDeExtraPreview');
    if (bEd && tabEdit) {
      bEd.addEventListener('click', function () {
        tabEdit.click();
      });
    }
    if (bPr && tabPrev) {
      bPr.addEventListener('click', function () {
        tabPrev.click();
      });
    }
    var bodyMdEl = $('extraPageBodyMd');
    if (bodyMdEl) {
      bodyMdEl.addEventListener('input', updateExtraEditorStatus);
    }
    var coverIn = $('extraPageCover');
    if (coverIn) {
      coverIn.addEventListener('input', updateCoverThumbPreview);
      coverIn.addEventListener('change', updateCoverThumbPreview);
    }

    document.querySelectorAll('.admin-page-tab[data-page-view]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var v = btn.getAttribute('data-page-view');
        setPageViewMode(v === 'preview' ? 'preview' : 'edit');
      });
    });

    $('extraPageFormat').addEventListener('change', function () {
      var next = $('extraPageFormat').value;
      var prev = lastFormat;
      if (prev === next) return;
      try {
        if (next === 'html' && prev === 'richtext') {
          initQuill();
          var htmlFromQuill = quillInstance.root.innerHTML;
          $('extraPageBodyMd').value = window.DOMPurify
            ? DOMPurify.sanitize(htmlFromQuill)
            : htmlFromQuill;
        } else if (next === 'richtext' && prev === 'html') {
          var htmlSrc = $('extraPageBodyMd').value || '';
          var safeHtml = window.DOMPurify ? DOMPurify.sanitize(htmlSrc) : htmlSrc;
          initQuill();
          quillInstance.setText('');
          quillInstance.clipboard.dangerouslyPasteHTML(0, safeHtml, 'silent');
        } else if (next === 'markdown' && prev === 'html') {
          if (typeof TurndownService === 'undefined') throw new Error('Turndown 未加载');
          var tdh = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
          $('extraPageBodyMd').value = tdh.turndown($('extraPageBodyMd').value || '');
        } else if (prev === 'markdown' && next === 'richtext') {
          var md = $('extraPageBodyMd').value || '';
          if (window.marked && typeof marked.parse === 'function') {
            marked.setOptions({ gfm: true, breaks: true });
          }
          var html =
            window.marked && typeof marked.parse === 'function'
              ? marked.parse(md)
              : '<p>' + escapeHtml(md) + '</p>';
          var safe = window.DOMPurify ? DOMPurify.sanitize(html) : html;
          initQuill();
          quillInstance.setText('');
          quillInstance.clipboard.dangerouslyPasteHTML(0, safe, 'silent');
        } else if (prev === 'richtext' && next === 'markdown') {
          initQuill();
          if (typeof TurndownService === 'undefined') throw new Error('Turndown 未加载');
          var td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
          $('extraPageBodyMd').value = td.turndown(quillInstance.root.innerHTML);
        }
      } catch (e) {
        window.alert('切换格式失败：' + e.message);
        $('extraPageFormat').value = prev;
        return;
      }
      lastFormat = next;
      updateExtraPageViewPanels();
      updateExtraEditorStatus();
    });

    $('btnExtraPageNew').addEventListener('click', async function () {
      $('extraPageMsg').textContent = '';
      $('extraPageMsg').className = 'admin-msg';
      var title = window.prompt('页面标题', '新页面');
      if (title == null) return;
      title = String(title).trim() || '新页面';
      try {
        var res = await api('/api/admin/pages', {
          method: 'POST',
          body: JSON.stringify({
            title: title,
            format: 'markdown',
            body: '# ' + title + '\n\n',
            status: 'draft',
          }),
        });
        selectedPageId = res.page.id;
        await loadExtraPagesList();
        if (typeof loadStats === 'function') loadStats();
      } catch (e) {
        $('extraPageMsg').textContent = e.message;
        $('extraPageMsg').className = 'admin-msg err';
      }
    });

    $('btnExtraPageSave').addEventListener('click', async function () {
      $('extraPageMsg').textContent = '';
      $('extraPageMsg').className = 'admin-msg';
      if (!selectedPageId) {
        $('extraPageMsg').textContent = '请先选择或新建页面';
        $('extraPageMsg').className = 'admin-msg err';
        return;
      }
      try {
        var blog = collectBlogPayload();
        await api('/api/admin/pages/' + selectedPageId, {
          method: 'PUT',
          body: JSON.stringify(
            Object.assign(
              {
                title: $('extraPageTitle').value,
                slug: $('extraPageSlug').value,
                format: $('extraPageFormat').value,
                body: getBodyForSave(),
              },
              blog
            )
          ),
        });
        $('extraPageMsg').textContent = '已保存';
        $('extraPageMsg').className = 'admin-msg ok';
        var hint = $('extraEditorSaveHint');
        if (hint) {
          hint.textContent =
            '已保存 ' +
            new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        }
        await loadExtraPagesList();
        if (typeof loadStats === 'function') loadStats();
      } catch (e) {
        $('extraPageMsg').textContent = e.message;
        $('extraPageMsg').className = 'admin-msg err';
      }
    });

    var btnCover = $('btnExtraCoverUpload');
    var cf = $('extraPageCoverFile');
    if (btnCover && cf) {
      btnCover.addEventListener('click', function () {
        cf.click();
      });
      cf.addEventListener('change', async function () {
        if (!cf.files || !cf.files[0]) return;
        var fd = new FormData();
        fd.append('file', cf.files[0]);
        try {
          var r = await fetch('/api/admin/upload/image', {
            method: 'POST',
            credentials: 'same-origin',
            body: fd,
          });
          var t = await r.text();
          var d = t ? JSON.parse(t) : {};
          if (!r.ok) throw new Error(d.error || '上传失败');
          if ($('extraPageCover')) $('extraPageCover').value = d.url;
          updateCoverThumbPreview();
          cf.value = '';
        } catch (e) {
          window.alert(e.message || String(e));
        }
      });
    }

    $('btnExtraPageDelete').addEventListener('click', async function () {
      if (!selectedPageId) return;
      if (!window.confirm('确定删除该页面？')) return;
      $('extraPageMsg').textContent = '';
      $('extraPageMsg').className = 'admin-msg';
      try {
        await api('/api/admin/pages/' + selectedPageId, { method: 'DELETE' });
        selectedPageId = null;
        await loadExtraPagesList();
        if (typeof loadStats === 'function') loadStats();
      } catch (e) {
        $('extraPageMsg').textContent = e.message;
        $('extraPageMsg').className = 'admin-msg err';
      }
    });

    syncExtraStatusUi();
    updateExtraToolbarViewButtons();
    updateExtraEditorStatus();
  }

  window.loadExtraPagesList = loadExtraPagesList;

  document.addEventListener('DOMContentLoaded', function () {
    if (!$('docSubExtra')) return;
    initExtraPages();
  });
})();
