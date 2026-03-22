/**
 * Markdown 区：粘贴 / 拖放图片上传，自动插入 ![](url)；图片列表与删除
 */
(function () {
  var lastMdTextarea = null;

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

  async function refreshImageList() {
    var host = $('adminImageListHost');
    if (!host) return;
    host.innerHTML = '<p class="de-image-empty de-image-loading">加载中…</p>';
    try {
      var d = await api('/api/admin/images');
      var images = d.images || [];
      if (!images.length) {
        host.innerHTML =
          '<p class="de-image-empty">暂无图片。在编辑区 <strong>Ctrl+V</strong> 粘贴或点击上方选择文件上传。</p>';
        return;
      }
      var h = '<div class="de-image-card-list">';
      images.forEach(function (im) {
        var urlAttr = escAttr(im.url);
        var nameAttr = escAttr(im.name);
        h += '<article class="de-image-card">';
        h += '<div class="de-image-card-thumb"><img src="' + urlAttr + '" alt="" loading="lazy"/></div>';
        h += '<div class="de-image-card-body">';
        h += '<code class="de-image-card-url" title="' + urlAttr + '">' + escHtml(im.url) + '</code>';
        h += '<div class="de-image-card-footer">';
        h += '<span class="de-image-card-size">' + escHtml(formatBytes(im.size)) + '</span>';
        h += '<span class="de-image-card-actions">';
        h +=
          '<button type="button" class="de-btn de-btn-ghost de-image-action-btn admin-image-copy" data-url="' +
          urlAttr +
          '">复制 MD</button>';
        h +=
          '<button type="button" class="de-btn de-btn-danger-ghost de-image-action-btn admin-image-del" data-name="' +
          nameAttr +
          '">删除</button>';
        h += '</span></div></div></article>';
      });
      h += '</div>';
      host.innerHTML = h;
      host.querySelectorAll('.admin-image-copy').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var u = btn.getAttribute('data-url');
          var md = '![](' + u + ')';
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(md).then(
              function () {
                btn.textContent = '已复制';
                setTimeout(function () {
                  btn.textContent = '复制 MD';
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
      });
      host.querySelectorAll('.admin-image-del').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          var name = btn.getAttribute('data-name');
          if (!name || !window.confirm('确定删除该图片？文档中若引用此 URL 将失效。')) return;
          try {
            await api('/api/admin/images/' + encodeURIComponent(name), { method: 'DELETE' });
            await refreshImageList();
          } catch (e) {
            window.alert(e.message);
          }
        });
      });
    } catch (e) {
      host.innerHTML = '<p class="admin-msg err">' + (e.message || String(e)) + '</p>';
    }
  }

  function initImagePanel() {
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
          } catch (e) {
            window.alert(e.message || String(e));
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
    if (btn) btn.addEventListener('click', function () {
      refreshImageList();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindAllMdTextareas();
    initImagePanel();
    if ($('adminImageListHost')) refreshImageList();
  });

  window.refreshAdminImageList = refreshImageList;
  window.__ebu4AdminUploadImage = uploadFile;
})();
