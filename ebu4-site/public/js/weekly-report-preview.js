(function () {
  var report = null;

  function $(id) {
    return document.getElementById(id);
  }

  function setMsg(text, cls) {
    var el = $('weeklyReportMsg');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'weekly-preview-msg' + (cls ? ' ' + cls : '');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function downloadBlob(content, fileName, mime) {
    var blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function safeFileName(value, ext) {
    var base = String(value || 'personal-weekly-report')
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .slice(0, 80);
    return (base || 'personal-weekly-report') + ext;
  }

  function getCachedDraft() {
    try {
      var raw = sessionStorage.getItem('ebu4-weekly-report-preview');
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  async function loadReport() {
    var params = new URLSearchParams(window.location.search);
    var id = params.get('id') || '';
    if (id) {
      var res = await fetch('/api/admin/blog-fetch/weekly-reports/' + encodeURIComponent(id), {
        credentials: 'same-origin',
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) throw new Error(data && data.error ? data.error : '周报加载失败');
      return data && data.report ? data.report : null;
    }
    return getCachedDraft();
  }

  function renderMarkdown(markdown) {
    var html = '';
    if (window.marked && typeof window.marked.parse === 'function') {
      html = window.marked.parse(markdown || '');
    } else {
      html = '<pre>' + escapeHtml(markdown || '') + '</pre>';
    }
    if (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
      return window.DOMPurify.sanitize(html);
    }
    return html;
  }

  function renderReport(nextReport) {
    report = nextReport || null;
    var title = report && report.title ? report.title : '个人周报';
    var summary = (report && report.summary) || {};
    var stats = summary.stats || {};
    var range =
      report && report.rangeFrom && report.rangeTo
        ? report.rangeFrom + ' ~ ' + report.rangeTo
        : stats.rangeFrom && stats.rangeTo
          ? stats.rangeFrom + ' ~ ' + stats.rangeTo
          : '未定范围';
    var content = report && report.markdownContent ? report.markdownContent : '';

    document.title = title + ' - 个人周报预览';
    if ($('weeklyReportTitle')) $('weeklyReportTitle').textContent = title;
    if ($('weeklyReportSubtitle')) $('weeklyReportSubtitle').textContent = range;
    if ($('weeklyReportMeta')) {
      $('weeklyReportMeta').innerHTML =
        '<span>风格<strong>' +
        escapeHtml((report && report.style) || 'concise') +
        '</strong></span>' +
        '<span>来源<strong>' +
        escapeHtml(String((report && report.sourceCount) || stats.total || 0)) +
        ' 条日报</strong></span>' +
        '<span>活跃天数<strong>' +
        escapeHtml(String(stats.activeDays || 0)) +
        ' 天</strong></span>' +
        '<span>生成时间<strong>' +
        escapeHtml((report && report.createdAt) || '草稿') +
        '</strong></span>';
    }
    if ($('weeklyReportContent')) {
      $('weeklyReportContent').innerHTML = content
        ? renderMarkdown(content)
        : '<p>暂无可预览的周报内容。</p>';
    }
  }

  async function downloadDocx() {
    if (!report) {
      setMsg('暂无可导出的周报。', 'err');
      return;
    }
    if (!report.id) {
      setMsg('当前是未保存草稿，请先在后台生成并保存后再导出 DOCX。', 'err');
      return;
    }
    setMsg('正在生成 DOCX…');
    var res = await fetch(
      '/api/admin/blog-fetch/weekly-reports/' + encodeURIComponent(String(report.id)) + '/docx',
      { credentials: 'same-origin' }
    );
    if (!res.ok) {
      var data = await res.json().catch(function () {
        return {};
      });
      throw new Error(data && data.error ? data.error : 'DOCX 导出失败');
    }
    var blob = await res.blob();
    downloadBlob(blob, safeFileName(report.title, '.docx'), blob.type);
    setMsg('DOCX 已开始下载。');
  }

  function bindActions() {
    var printBtn = $('btnWeeklyPreviewPrint');
    if (printBtn) printBtn.addEventListener('click', function () { window.print(); });
    var mdBtn = $('btnWeeklyPreviewMarkdown');
    if (mdBtn) {
      mdBtn.addEventListener('click', function () {
        if (!report) return setMsg('暂无可导出的周报。', 'err');
        downloadBlob(report.markdownContent || '', safeFileName(report.title, '.md'), 'text/markdown;charset=utf-8');
      });
    }
    var jsonBtn = $('btnWeeklyPreviewJson');
    if (jsonBtn) {
      jsonBtn.addEventListener('click', function () {
        if (!report) return setMsg('暂无可导出的周报。', 'err');
        downloadBlob(
          JSON.stringify(report.summary || {}, null, 2),
          safeFileName(report.title, '.json'),
          'application/json;charset=utf-8'
        );
      });
    }
    var docxBtn = $('btnWeeklyPreviewDocx');
    if (docxBtn) {
      docxBtn.addEventListener('click', function () {
        Promise.resolve(downloadDocx()).catch(function (err) {
          setMsg(err.message || String(err), 'err');
        });
      });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindActions();
    Promise.resolve(loadReport())
      .then(function (loaded) {
        renderReport(loaded);
        setMsg(loaded ? '周报已加载。' : '未找到周报内容，请从后台周报助手打开。', loaded ? '' : 'err');
      })
      .catch(function (err) {
        renderReport(null);
        setMsg(err.message || String(err), 'err');
      });
  });
})();
