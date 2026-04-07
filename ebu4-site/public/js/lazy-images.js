/**
 * 全局图片懒加载：为未声明 loading 的 img 设置 loading="lazy"、decoding="async"。
 * 已有 loading（含 eager）或位于 [data-ebu4-no-lazy] 内则不修改。
 * 排除富文本编辑器内图片，避免编辑区延迟加载异常。
 */
(function () {
  function inExcludedEditor(el) {
    return !!el.closest(
      '.ql-editor, .admin-quill-root, .admin-page-quill-wrap, [contenteditable="true"]'
    );
  }

  function enhanceImg(img) {
    if (img.nodeType !== 1 || img.tagName !== 'IMG') return;
    if (img.hasAttribute('data-ebu4-lazy-done')) return;
    if (img.closest('[data-ebu4-no-lazy]')) {
      img.setAttribute('data-ebu4-lazy-done', '');
      return;
    }
    if (inExcludedEditor(img)) {
      img.setAttribute('data-ebu4-lazy-done', '');
      return;
    }
    if (img.hasAttribute('loading')) {
      if (!img.hasAttribute('decoding')) img.setAttribute('decoding', 'async');
      img.setAttribute('data-ebu4-lazy-done', '');
      return;
    }
    img.setAttribute('loading', 'lazy');
    img.setAttribute('decoding', 'async');
    img.setAttribute('data-ebu4-lazy-done', '');
  }

  function enhance(root) {
    if (!root) return;
    if (root.nodeType === 1 && root.tagName === 'IMG') {
      enhanceImg(root);
      return;
    }
    if (root.querySelectorAll) {
      root.querySelectorAll('img').forEach(enhanceImg);
    }
  }

  function init() {
    enhance(document.body);
    var mo = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type !== 'childList') continue;
        m.addedNodes.forEach(function (n) {
          if (n.nodeType === 1) enhance(n);
        });
      }
    });
    if (document.body) {
      mo.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
