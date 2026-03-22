/**
 * 工具导航结构化编辑：分类 + 条目，PUT /api/admin/tools-nav
 */
(function () {
  var toolsNavItems = [];

  function $(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function renderItems(items) {
    toolsNavItems = Array.isArray(items) ? items.slice() : [];
    var host = $('toolsNavItemsHost');
    if (!host) return;
    if (!toolsNavItems.length) {
      host.innerHTML =
        '<p class="admin-tools-hint" style="margin:8px 0;">暂无链接，点击「添加链接」。</p>';
      return;
    }
    var html = toolsNavItems
      .map(function (it, i) {
        return (
          '<div class="tools-nav-row" data-index="' +
          i +
          '">' +
          '<div class="tools-nav-row-grid">' +
          '<label class="admin-field"><span class="admin-field-label">名称</span><input type="text" class="admin-input tn-in" data-field="name" value="' +
          esc(it.name) +
          '" autocomplete="off" /></label>' +
          '<label class="admin-field"><span class="admin-field-label">URL</span><input type="text" class="admin-input tn-in" data-field="url" value="' +
          esc(it.url) +
          '" autocomplete="off" placeholder="https://" /></label>' +
          '<label class="admin-field"><span class="admin-field-label">分类</span><input type="text" class="admin-input tn-in" data-field="category" value="' +
          esc(it.category || '其他') +
          '" autocomplete="off" /></label>' +
          '<label class="admin-field admin-field-full"><span class="admin-field-label">描述</span><input type="text" class="admin-input tn-in" data-field="description" value="' +
          esc(it.description) +
          '" autocomplete="off" /></label>' +
          '<label class="admin-field"><span class="admin-field-label">域名（可选，用于 favicon）</span><input type="text" class="admin-input tn-in" data-field="domain" value="' +
          esc(it.domain) +
          '" autocomplete="off" /></label>' +
          '</div>' +
          '<div class="tools-nav-row-actions">' +
          '<button type="button" class="admin-btn-ghost tools-nav-row-up">上移</button>' +
          '<button type="button" class="admin-btn-ghost tools-nav-row-down">下移</button>' +
          '<button type="button" class="admin-btn-ghost tools-nav-row-del">删除</button>' +
          '</div></div>'
        );
      })
      .join('');
    host.innerHTML = html;
  }

  function readRowsFromDom() {
    var host = $('toolsNavItemsHost');
    if (!host) return [];
    var rows = host.querySelectorAll('.tools-nav-row');
    var out = [];
    rows.forEach(function (row) {
      var o = {};
      row.querySelectorAll('.tn-in').forEach(function (inp) {
        o[inp.getAttribute('data-field')] = inp.value;
      });
      out.push(o);
    });
    return out;
  }

  window.refreshToolsNavEditorFromData = function (data) {
    var ta = $('toolsNavCategories');
    if (ta) {
      ta.value = Array.isArray(data.categories) ? data.categories.join('\n') : '';
    }
    renderItems(data.items || []);
  };

  document.addEventListener('DOMContentLoaded', function () {
    var host = $('toolsNavItemsHost');
    var btnAdd = $('btnToolsNavAddRow');
    var btnSave = $('btnSaveToolsNavStructured');

    if (btnAdd) {
      btnAdd.addEventListener('click', function () {
        var cur = readRowsFromDom();
        cur.push({ name: '', url: '', category: '其他', description: '', domain: '' });
        renderItems(cur);
      });
    }

    if (host) {
      host.addEventListener('click', function (e) {
        var row = e.target.closest('.tools-nav-row');
        if (!row) return;
        var idx = parseInt(row.getAttribute('data-index'), 10);
        var list = readRowsFromDom();
        if (e.target.classList.contains('tools-nav-row-del')) {
          list.splice(idx, 1);
          renderItems(list);
          return;
        }
        if (e.target.classList.contains('tools-nav-row-up') && idx > 0) {
          var t = list[idx - 1];
          list[idx - 1] = list[idx];
          list[idx] = t;
          renderItems(list);
          return;
        }
        if (e.target.classList.contains('tools-nav-row-down') && idx < list.length - 1) {
          var t2 = list[idx + 1];
          list[idx + 1] = list[idx];
          list[idx] = t2;
          renderItems(list);
        }
      });
    }

    if (btnSave) {
      btnSave.addEventListener('click', async function () {
        var msg = $('toolsNavStructuredMsg');
        if (msg) {
          msg.textContent = '';
          msg.className = 'admin-msg';
        }
        try {
          var lines = (($('toolsNavCategories') && $('toolsNavCategories').value) || '')
            .split(/\r?\n/)
            .map(function (s) {
              return s.trim();
            })
            .filter(Boolean);
          var items = readRowsFromDom();
          var site = typeof collectToolsSite === 'function' ? collectToolsSite() : {};
          if (typeof api !== 'function') throw new Error('api 未就绪');
          await api('/api/admin/tools-nav', {
            method: 'PUT',
            body: JSON.stringify({
              site: site,
              categories: lines,
              items: items,
            }),
          });
          if (msg) {
            msg.textContent = '已保存';
            msg.className = 'admin-msg ok';
          }
          if (typeof loadStats === 'function') loadStats();
        } catch (err) {
          if (msg) {
            msg.textContent = err.message || String(err);
            msg.className = 'admin-msg err';
          }
        }
      });
    }
  });
})();
