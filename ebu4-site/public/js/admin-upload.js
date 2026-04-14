/**
 * Markdown 区：粘贴 / 拖放图片上传，自动插入 ![](url)；图库弹窗预览与详情
 */
(function () {
  var lastMdTextarea = null;
  /** @type {Array<{name:string,url:string,size:number}>} */
  var lastImages = [];
  var gallerySelectedName = null;
  var gallerySearchKeyword = '';
  var gallerySortMode = 'newest';

  function $(id) {
    return document.getElementById(id);
  }

  async function api(path, opt) {
    var r = await fetch(
      path,
      Object.assign(
        {
          credentials: 'same-origin',
          headers: opt && opt.headers ? opt.headers : {},
        },
        opt || {}
      )
    );
    var text = await r.text();
    var data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      data = {};
    }
    if (!r.ok) throw new Error(data.error || r.statusText || '请求失败');
    return data;
  }

  function insertAtCursor(textarea, text) {
    if (!textarea) return;
    if (
      textarea.id === 'docSectionTa' &&
      typeof window.__ebu4MainDocInsertImageUrl === 'function'
    ) {
      var imgM = /^!\[\]\(([^)]+)\)\s*$/.exec(text);
      if (imgM) {
        window.__ebu4MainDocInsertImageUrl(imgM[1]);
        return;
      }
    }
    var start = textarea.selectionStart;
    var end = textarea.selectionEnd;
    var before = textarea.value.substring(0, start);
    var after = textarea.value.substring(end);
    var prefix = '';
    if (before.length > 0 && before.slice(-1) !== '\n') prefix = '\n';
    var insert = prefix + text + '\n';
    textarea.value = before + insert + after;
    var pos = start + insert.length;
    textarea.selectionStart = textarea.selectionEnd = pos;
    textarea.focus();
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function targetTextarea() {
    if (lastMdTextarea && document.body.contains(lastMdTextarea)) return lastMdTextarea;
    var el = $('docSectionTa');
    return el || $('mdTa');
  }

  async function uploadFile(file) {
    var fd = new FormData();
    fd.append('file', file, file.name || 'image.png');
    var r = await fetch('/api/admin/upload/image', {
      method: 'POST',
      credentials: 'same-origin',
      body: fd,
    });
    var text = await r.text();
    var data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      data = {};
    }
    if (!r.ok) throw new Error(data.error || r.statusText || '上传失败');
    return data.url;
  }

  function bindPasteAndDrop(textarea) {
    if (!textarea || textarea.dataset.mdUploadBound) return;
    textarea.dataset.mdUploadBound = '1';
    textarea.classList.add('admin-md-paste');

    textarea.addEventListener('focus', function () {
      lastMdTextarea = textarea;
    });

    textarea.addEventListener('paste', function (e) {
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (it.kind === 'file' && it.type.indexOf('image') === 0) {
          e.preventDefault();
          var blob = it.getAsFile();
          if (!blob) continue;
          var ta = textarea;
          (async function () {
            try {
              ta.classList.add('admin-md-uploading');
              var url = await uploadFile(blob);
              insertAtCursor(ta, '![](' + url + ')');
            } catch (err) {
              window.alert(err.message || String(err));
            } finally {
              ta.classList.remove('admin-md-uploading');
            }
          })();
          return;
        }
      }
    });

    textarea.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    textarea.addEventListener('drop', function (e) {
      var files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) return;
      var f = files[0];
      if (!f.type || f.type.indexOf('image') !== 0) return;
      e.preventDefault();
      var ta = textarea;
      (async function () {
        try {
          ta.classList.add('admin-md-uploading');
          var url = await uploadFile(f);
          insertAtCursor(ta, '![](' + url + ')');
        } catch (err) {
          window.alert(err.message || String(err));
        } finally {
          ta.classList.remove('admin-md-uploading');
        }
      })();
    });
  }

  function bindAllMdTextareas() {
    ['mdTa', 'extraPageBodyMd'].forEach(function (id) {
      var el = $(id);
      if (el) bindPasteAndDrop(el);
    });
  }

  function formatBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }

  function escAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function findImageByName(name) {
    for (var i = 0; i < lastImages.length; i++) {
      if (lastImages[i].name === name) return lastImages[i];
    }
    return null;
  }

  function updateCountHint(text) {
    var el = $('adminImageCountHint');
    if (el) el.textContent = text;
    var inModal = $('imageGalleryCountInModal');
    if (inModal) inModal.textContent = text;
  }

  function getFilteredSortedImages() {
    var list = (lastImages || []).slice();
    if (gallerySearchKeyword) {
      var kw = gallerySearchKeyword.toLowerCase();
      list = list.filter(function (it) {
        return String(it && it.name ? it.name : '')
          .toLowerCase()
          .includes(kw);
      });
    }
    if (gallerySortMode === 'nameAsc') {
      list.sort(function (a, b) {
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
    } else if (gallerySortMode === 'sizeDesc') {
      list.sort(function (a, b) {
        return (b.size || 0) - (a.size || 0);
      });
    } else if (gallerySortMode === 'sizeAsc') {
      list.sort(function (a, b) {
        return (a.size || 0) - (b.size || 0);
      });
    }
    return list;
  }

  function clearDetailPanel() {
    gallerySelectedName = null;
    var empty = $('imageGalleryDetailEmpty');
    var panel = $('imageGalleryDetailPanel');
    if (empty) empty.hidden = false;
    if (panel) panel.hidden = true;
    document.querySelectorAll('.de-gallery-tile.is-selected').forEach(function (t) {
      t.classList.remove('is-selected');
    });
  }

  function showImageDetail(im) {
    gallerySelectedName = im.name;
    var empty = $('imageGalleryDetailEmpty');
    var panel = $('imageGalleryDetailPanel');
    var img = $('imageGalleryDetailImg');
    var nm = $('imageGalleryDetailName');
    var sz = $('imageGalleryDetailSize');
    var urlEl = $('imageGalleryDetailUrl');
    if (!empty || !panel || !img || !nm || !sz || !urlEl) return;
    empty.hidden = true;
    panel.hidden = false;
    img.src = im.url;
    img.alt = im.name;
    nm.textContent = im.name;
    sz.textContent = formatBytes(im.size || 0);
    urlEl.textContent = im.url;
    urlEl.title = im.url;

    document.querySelectorAll('.de-gallery-tile').forEach(function (t) {
      t.classList.toggle('is-selected', t.getAttribute('data-name') === im.name);
    });
  }

  function bindDetailActions() {
    var btnCopy = $('btnImageGalleryCopyMd');
    var btnDel = $('btnImageGalleryDelete');
    var btnOpen = $('btnImageGalleryOpen');
    if (btnOpen && !btnOpen.dataset.bound) {
      btnOpen.dataset.bound = '1';
      btnOpen.addEventListener('click', function () {
        var im = gallerySelectedName ? findImageByName(gallerySelectedName) : null;
        if (!im || !im.url) return;
        window.open(im.url, '_blank', 'noopener');
      });
    }
    if (btnCopy && !btnCopy.dataset.bound) {
      btnCopy.dataset.bound = '1';
      btnCopy.addEventListener('click', function () {
        var im = gallerySelectedName ? findImageByName(gallerySelectedName) : null;
        if (!im) return;
        var md = '![](' + im.url + ')';
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(md).then(
            function () {
              var t = btnCopy.textContent;
              btnCopy.textContent = '已复制';
              setTimeout(function () {
                btnCopy.textContent = t;
              }, 1500);
            },
            function () {
              window.prompt('复制以下内容：', md);
            }
          );
        } else {
          window.prompt('复制以下内容：', md);
        }
      });
    }
    if (btnDel && !btnDel.dataset.bound) {
      btnDel.dataset.bound = '1';
      btnDel.addEventListener('click', async function () {
        var name = gallerySelectedName;
        if (!name || !window.confirm('确定删除该图片？文档中若引用此 URL 将失效。')) return;
        try {
          await api('/api/admin/images/' + encodeURIComponent(name), { method: 'DELETE' });
          gallerySelectedName = null;
          await refreshImageList();
        } catch (e) {
          window.alert(e.message);
        }
      });
    }
  }

  function renderGalleryGrid(images) {
    var grid = $('imageGalleryGridHost');
    if (!grid) return;
    if (!images.length) {
      grid.innerHTML = lastImages.length
        ? '<p class="de-gallery-grid-empty">没有匹配结果，试试其他关键词或排序。</p>'
        : '<p class="de-gallery-grid-empty">暂无图片。关闭后在侧栏上传，或使用编辑区 <strong>Ctrl+V</strong> 粘贴。</p>';
      clearDetailPanel();
      return;
    }
    var h = '<div class="de-gallery-tile-grid">';
    images.forEach(function (im) {
      var nameAttr = escAttr(im.name);
      var urlAttr = escAttr(im.url);
      h += '<button type="button" class="de-gallery-tile" data-name="' + nameAttr + '" title="' + nameAttr + '">';
      h += '<span class="de-gallery-tile-thumb"><img src="' + urlAttr + '" alt="" loading="lazy"/></span>';
      h += '<span class="de-gallery-tile-name">' + escHtml(im.name) + '</span>';
      h += '<span class="de-gallery-tile-meta">' + escHtml(formatBytes(im.size || 0)) + '</span>';
      h += '</button>';
    });
    h += '</div>';
    grid.innerHTML = h;
    grid.querySelectorAll('.de-gallery-tile').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var name = btn.getAttribute('data-name');
        var im = findImageByName(name);
        if (im) showImageDetail(im);
      });
    });
    if (gallerySelectedName) {
      var again = findImageByName(gallerySelectedName);
      if (again) showImageDetail(again);
      else if (images[0]) showImageDetail(images[0]);
      else clearDetailPanel();
    } else {
      if (images[0]) showImageDetail(images[0]);
      else clearDetailPanel();
    }
  }

  async function refreshImageList() {
    updateCountHint('共 — 张');
    var grid = $('imageGalleryGridHost');
    if (grid) {
      grid.innerHTML = '<p class="de-gallery-grid-loading">加载中…</p>';
    }
    try {
      var d = await api('/api/admin/images');
      var images = d.images || [];
      lastImages = images;
      var visible = getFilteredSortedImages();
      updateCountHint('共 ' + visible.length + ' / ' + images.length + ' 张');
      renderGalleryGrid(visible);
    } catch (e) {
      lastImages = [];
      updateCountHint('共 0 张');
      if (grid) {
        grid.innerHTML = '<p class="admin-msg err">' + escHtml(e.message || String(e)) + '</p>';
      }
    }
  }

  function openImageGalleryModal() {
    if (typeof openModalBg === 'function') {
      openModalBg($('imageGalleryModal'));
    } else {
      var m = $('imageGalleryModal');
      if (m) {
        m.removeAttribute('hidden');
        m.classList.add('show');
      }
    }
    bindDetailActions();
    var search = $('imageGallerySearch');
    var sort = $('imageGallerySort');
    if (search) search.value = gallerySearchKeyword;
    if (sort) sort.value = gallerySortMode;
    refreshImageList();
  }

  function closeImageGalleryModal() {
    if (typeof closeModalBg === 'function') {
      closeModalBg($('imageGalleryModal'));
    } else {
      var m = $('imageGalleryModal');
      if (m) {
        m.classList.remove('show');
        setTimeout(function () {
          m.setAttribute('hidden', '');
        }, 200);
      }
    }
  }

  function initImagePanel() {
    var openBtn = $('btnOpenImageGallery');
    if (openBtn) {
      openBtn.addEventListener('click', function () {
        openImageGalleryModal();
      });
    }
    var closeBtn = $('btnImageGalleryClose');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        closeImageGalleryModal();
      });
    }
    var modal = $('imageGalleryModal');
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeImageGalleryModal();
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var m = $('imageGalleryModal');
      if (!m || m.hasAttribute('hidden') || !m.classList.contains('show')) return;
      closeImageGalleryModal();
    });

    var pick = $('adminImagePick');
    if (pick) {
      pick.addEventListener('change', async function () {
        if (!pick.files || !pick.files.length) return;
        var ta = targetTextarea();
        if (!ta) {
          window.alert('请先点击要插入的 Markdown 编辑区');
          pick.value = '';
          return;
        }
        for (var i = 0; i < pick.files.length; i++) {
          var f = pick.files[i];
          if (!f.type || f.type.indexOf('image') !== 0) continue;
          try {
            ta.classList.add('admin-md-uploading');
            var url = await uploadFile(f);
            insertAtCursor(ta, '![](' + url + ')');
          } catch (err) {
            window.alert(err.message || String(err));
            break;
          } finally {
            ta.classList.remove('admin-md-uploading');
          }
        }
        pick.value = '';
        refreshImageList();
      });
    }
    var btn = $('btnRefreshImages');
    if (btn) {
      btn.addEventListener('click', function () {
        refreshImageList();
      });
    }
    var btnModalRefresh = $('btnImageGalleryRefresh');
    if (btnModalRefresh) {
      btnModalRefresh.addEventListener('click', function () {
        refreshImageList();
      });
    }
    var search = $('imageGallerySearch');
    if (search && !search.dataset.bound) {
      search.dataset.bound = '1';
      search.addEventListener('input', function () {
        gallerySearchKeyword = String(search.value || '').trim();
        var visible = getFilteredSortedImages();
        updateCountHint('共 ' + visible.length + ' / ' + lastImages.length + ' 张');
        renderGalleryGrid(visible);
      });
    }
    var sort = $('imageGallerySort');
    if (sort && !sort.dataset.bound) {
      sort.dataset.bound = '1';
      sort.addEventListener('change', function () {
        gallerySortMode = sort.value || 'newest';
        var visible = getFilteredSortedImages();
        updateCountHint('共 ' + visible.length + ' / ' + lastImages.length + ' 张');
        renderGalleryGrid(visible);
      });
    }
    bindDetailActions();
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindAllMdTextareas();
    initImagePanel();
  });

  window.refreshAdminImageList = refreshImageList;
  window.__ebu4AdminUploadImage = uploadFile;
  window.__ebu4OpenImageGalleryModal = openImageGalleryModal;
})();
