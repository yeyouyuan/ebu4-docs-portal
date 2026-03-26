/**
 * 文档站右下角「补充资料」悬浮入口与提交
 */
(function () {
  function $(id) {
    return document.getElementById(id);
  }

  function init() {
    var dialog = $('docSupplementDialog');
    var fab = $('docSupplementFab');
    var form = $('docSupplementForm');
    var cancel = $('docSupplementCancel');
    var ctx = $('docSupplementContext');
    var msg = $('docSupplementMsg');
    if (!dialog || !fab || !form) return;

    function openDialog() {
      if (ctx) ctx.value = location.href;
      if (msg) {
        msg.textContent = '';
        msg.className = 'doc-supplement-msg';
      }
      form.reset();
      if (ctx) ctx.value = location.href;
      if (dialog.showModal) dialog.showModal();
    }

    fab.addEventListener('click', openDialog);

    if (cancel) {
      cancel.addEventListener('click', function () {
        dialog.close();
      });
    }

    dialog.addEventListener('click', function (e) {
      if (e.target === dialog) dialog.close();
    });

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (msg) {
        msg.textContent = '';
        msg.className = 'doc-supplement-msg';
      }
      var fd = new FormData(form);
      var body = (fd.get('body') || '').toString().trim();
      var contact = (fd.get('contact') || '').toString().trim();
      if (body.length < 5) {
        if (msg) {
          msg.textContent = '请至少填写 5 个字的补充说明';
          msg.className = 'doc-supplement-msg err';
        }
        return;
      }
      try {
        var r = await fetch('/api/doc-supplement', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            body: body,
            contact: contact,
            context: location.href,
            pageTitle: document.title,
            sectionSlug: location.hash ? location.hash.slice(1) : '',
            docSlug: new URLSearchParams(location.search).get('doc') || '',
          }),
        });
        var data = await r.json().catch(function () {
          return {};
        });
        if (!r.ok) {
          throw new Error(data.error || r.statusText || '提交失败');
        }
        if (msg) {
          msg.textContent = '已收到，感谢反馈！';
          msg.className = 'doc-supplement-msg ok';
        }
        setTimeout(function () {
          dialog.close();
        }, 1600);
      } catch (err) {
        if (msg) {
          msg.textContent = String(err.message || err);
          msg.className = 'doc-supplement-msg err';
        }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
