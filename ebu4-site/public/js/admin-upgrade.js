/**
 * 系统升级：配置、检测、应用、历史
 */
(function () {
  function $(id) {
    return document.getElementById(id);
  }

  async function api(path, opt) {
    const r = await fetch(
      path,
      Object.assign(
        {
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
        },
        opt || {}
      )
    );
    const text = await r.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      data = { _raw: text };
    }
    if (!r.ok) {
      var errMsg =
        data.error ||
        (data._raw && String(data._raw).replace(/\s+/g, ' ').trim().slice(0, 240)) ||
        r.statusText ||
        '请求失败';
      throw new Error(errMsg);
    }
    return data;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function showUpgradeMsg(text, ok) {
    const el = $('upgradePanelMsg');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'admin-msg' + (ok ? ' ok' : text ? ' err' : '');
  }

  function showBuildMsg(text, ok) {
    var el = $('upgradeBuildMsg') || $('upgradePanelMsg');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'admin-msg' + (ok ? ' ok' : text ? ' err' : '');
  }

  function buildOutputPre() {
    return $('upgradeBuildResult') || $('upgradeCheckResult');
  }

  /** 轮询公开 /api/health，用于系统升级后等待进程恢复（无需 Cookie） */
  function waitForServerHealth(opts) {
    opts = opts || {};
    var maxMs = opts.maxMs != null ? opts.maxMs : 180000;
    var intervalMs = opts.intervalMs != null ? opts.intervalMs : 1500;
    var onProgress = opts.onProgress;
    var start = Date.now();
    var attempts = 0;
    return new Promise(function (resolve, reject) {
      function tick() {
        attempts += 1;
        if (onProgress) onProgress(attempts, Date.now() - start);
        if (Date.now() - start > maxMs) {
          reject(
            new Error(
              '等待超时（' +
                Math.round(maxMs / 1000) +
                's）。若已手动重启服务，请刷新页面后再试；Docker/systemd/pm2 可设置环境变量 UPGRADE_AUTO_EXIT_ON_APPLY=1，使进程在返回响应后自动退出并由守护策略拉起。'
            )
          );
          return;
        }
        fetch('/api/health', { method: 'GET', cache: 'no-store', credentials: 'omit' })
          .then(function (r) {
            return r
              .json()
              .then(function (j) {
                return { ok: r.ok, j: j };
              })
              .catch(function () {
                return { ok: false, j: null };
              });
          })
          .catch(function () {
            return { ok: false, j: null };
          })
          .then(function (x) {
            if (x.ok && x.j && x.j.ok === true) {
              resolve(x.j);
              return;
            }
            setTimeout(tick, intervalMs);
          });
      }
      setTimeout(tick, 400);
    });
  }

  async function loadUpgradePanel() {
    if (!window.__adminUser || window.__adminUser.role !== 'admin') return;
    showUpgradeMsg('', true);
    try {
      const ss = await api('/api/admin/site-settings');
      const u = (ss && ss.upgrade) || {};
      if ($('up_enabled')) $('up_enabled').checked = !!u.enabled;
      if ($('up_baseUrl')) $('up_baseUrl').value = u.baseUrl || '';
      if ($('up_manifestPath')) $('up_manifestPath').value = u.manifestPath || '/upgrade/manifest.json';
      if ($('up_bearerToken')) {
        $('up_bearerToken').value = '';
        $('up_bearerToken').type = 'password';
        window.__upgradeBearerConfigured = !!u.upgradeBearerConfigured;
        $('up_bearerToken').placeholder = u.upgradeBearerConfigured
          ? '已保存 Bearer（输入新值可替换，留空并保存表示保持原值）'
          : '';
      }
      if ($('up_insecureTls')) $('up_insecureTls').checked = !!u.insecureTls;
      if ($('up_checkChannels')) $('up_checkChannels').value = u.checkChannels || 'both';
      const au = u.autoUpdate || {};
      if ($('up_auto_enabled')) $('up_auto_enabled').checked = !!au.enabled;
      if ($('up_interval')) $('up_interval').value = au.intervalMinutes != null ? au.intervalMinutes : 60;
      if ($('up_apply_docs')) $('up_apply_docs').checked = !!au.applyDocs;
      if ($('up_apply_system')) $('up_apply_system').checked = !!au.applySystem;
      const st = await api('/api/admin/upgrade/status');
      const lc = st.lastCheck && st.lastCheck.at ? st.lastCheck.at : '—';
      const la = st.lastApply && st.lastApply.at ? st.lastApply.at : '—';
      if ($('up_lastCheck')) $('up_lastCheck').textContent = lc;
      if ($('up_lastApply')) $('up_lastApply').textContent = la;
      await refreshUpgradeHistory();
    } catch (e) {
      showUpgradeMsg(e.message || String(e), false);
    }
  }

  async function refreshUpgradeHistory() {
    const host = $('upgradeHistoryHost');
    if (!host) return;
    try {
      const data = await api('/api/admin/upgrade/history?limit=50');
      const items = data.items || [];
      if (!items.length) {
        host.innerHTML = '<p class="admin-tools-hint">暂无升级记录。</p>';
        return;
      }
      const rows = items
        .map(function (it) {
          return (
            '<tr><td class="mono">' +
            esc(it.at) +
            '</td><td>' +
            esc(it.trigger) +
            '</td><td>' +
            esc(it.kind) +
            '</td><td>' +
            esc(it.channel) +
            '</td><td>' +
            esc(it.status) +
            '</td><td>' +
            esc(it.message) +
            '</td></tr>'
          );
        })
        .join('');
      host.innerHTML =
        '<table class="admin-table upgrade-history-table"><thead><tr><th>时间</th><th>触发</th><th>类型</th><th>通道</th><th>状态</th><th>摘要</th></tr></thead><tbody>' +
        rows +
        '</tbody></table>';
    } catch (e) {
      host.innerHTML = '<p class="admin-msg err">' + esc(e.message) + '</p>';
    }
  }

  window.loadUpgradePanel = loadUpgradePanel;

  function generateRandomBearerToken() {
    var buf = new Uint8Array(32);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(buf);
    } else {
      for (var i = 0; i < 32; i++) buf[i] = Math.floor(Math.random() * 256);
    }
    var hex = '';
    for (var j = 0; j < buf.length; j++) {
      hex += ('0' + buf[j].toString(16)).slice(-2);
    }
    return hex;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var btnGen = $('btnUpBearerGenerate');
    if (btnGen) {
      btnGen.addEventListener('click', function () {
        var inp = $('up_bearerToken');
        if (!inp) return;
        inp.value = generateRandomBearerToken();
        inp.type = 'text';
        showUpgradeMsg('已填入随机 Token（64 位十六进制），请保存配置并在对端网关配置相同密钥', true);
      });
    }

    const btnSave = $('btnSaveUpgradeSettings');
    if (btnSave) {
      btnSave.addEventListener('click', async function () {
        showUpgradeMsg('', true);
        try {
          var bt = ($('up_bearerToken') && $('up_bearerToken').value.trim()) || '';
          var upgradePayload = {
            enabled: !!($('up_enabled') && $('up_enabled').checked),
            baseUrl: ($('up_baseUrl') && $('up_baseUrl').value.trim()) || '',
            manifestPath: ($('up_manifestPath') && $('up_manifestPath').value.trim()) || '/upgrade/manifest.json',
            insecureTls: !!($('up_insecureTls') && $('up_insecureTls').checked),
            checkChannels: ($('up_checkChannels') && $('up_checkChannels').value) || 'both',
            autoUpdate: {
              enabled: !!($('up_auto_enabled') && $('up_auto_enabled').checked),
              intervalMinutes: parseInt(($('up_interval') && $('up_interval').value) || '60', 10) || 60,
              applyDocs: !!($('up_apply_docs') && $('up_apply_docs').checked),
              applySystem: !!($('up_apply_system') && $('up_apply_system').checked),
            },
          };
          if (bt) upgradePayload.bearerToken = bt;
          else if (!window.__upgradeBearerConfigured) upgradePayload.bearerToken = '';
          await api('/api/admin/site-settings', {
            method: 'PUT',
            body: JSON.stringify({ upgrade: upgradePayload }),
          });
          showUpgradeMsg('配置已保存', true);
        } catch (e) {
          showUpgradeMsg(e.message || String(e), false);
        }
      });
    }

    const btnCheck = $('btnUpgradeCheck');
    if (btnCheck) {
      btnCheck.addEventListener('click', async function () {
        $('upgradeCheckResult').textContent = '检测中…';
        showUpgradeMsg('', true);
        try {
          const r = await api('/api/admin/upgrade/check', { method: 'POST', body: '{}' });
          const lines = [];
          lines.push('本机 product: ' + (r.local && r.local.product));
          lines.push('本机系统: ' + (r.local && r.local.systemVersion) + ' · 文档指纹: ' + (r.local && r.local.docsVersion));
          if (r.remote) {
            lines.push(
              '对端系统: ' +
                r.remote.systemVersion +
                ' · 文档指纹（manifest.docsVersion）: ' +
                (r.remote.docsVersion || '（未填写）')
            );
            lines.push('有系统更新: ' + !!r.hasSystemUpdate + ' · 有文档更新: ' + !!r.hasDocsUpdate);
          }
          if (r.warnings && r.warnings.length) lines.push('提示: ' + r.warnings.join(' '));
          if (r.errors && r.errors.length) lines.push('错误: ' + r.errors.join('; '));
          if (r.changelogSummary) lines.push('变更说明: ' + r.changelogSummary.slice(0, 800));
          $('upgradeCheckResult').textContent = lines.join('\n');
          await refreshUpgradeHistory();
          await loadUpgradePanel();
        } catch (e) {
          $('upgradeCheckResult').textContent = e.message || String(e);
          showUpgradeMsg(e.message || String(e), false);
        }
      });
    }

    const btnDocs = $('btnUpgradeApplyDocs');
    if (btnDocs) {
      btnDocs.addEventListener('click', async function () {
        if (
          !confirm(
            '将先备份站点数据库再导入远程文档包。确定应用文档更新？'
          )
        ) {
          return;
        }
        showUpgradeMsg('', true);
        try {
          await api('/api/admin/upgrade/apply', {
            method: 'POST',
            body: JSON.stringify({ channel: 'docs', artifactIndex: 0 }),
          });
          showUpgradeMsg('文档已更新', true);
          await refreshUpgradeHistory();
          await loadUpgradePanel();
        } catch (e) {
          showUpgradeMsg(e.message || String(e), false);
        }
      });
    }

    const btnSys = $('btnUpgradeApplySystem');
    if (btnSys) {
      btnSys.addEventListener('click', async function () {
        if (
          !confirm(
            '将下载并覆盖 server/、public/、package.json（白名单），可能影响运行。全站图片懒加载脚本 public/js/lazy-images.js 随 public/ 一并更新；若制品未带该文件，将尝试从升级前自动补全。若需重启，页面将自动等待服务恢复。确定继续？'
          )
        ) {
          return;
        }
        showUpgradeMsg('', true);
        var pre = $('upgradeCheckResult');
        btnSys.disabled = true;
        try {
          var r = await api('/api/admin/upgrade/apply', {
            method: 'POST',
            body: JSON.stringify({ channel: 'system', artifactIndex: 0 }),
          });
          if (r.needsRestart) {
            if (pre) {
              pre.textContent =
                '已落盘' +
                (r.autoExitScheduled
                  ? '；已安排进程在响应结束后自动退出（UPGRADE_AUTO_EXIT_ON_APPLY），请等待守护进程拉起…'
                  : '；请等待服务重启或手动重启…') +
                '\n正在轮询 /api/health …';
            }
            showUpgradeMsg('正在等待服务恢复…', true);
            try {
              var h = await waitForServerHealth({
                maxMs: 180000,
                intervalMs: 1500,
                onProgress: function (n, elapsed) {
                  if (pre) {
                    pre.textContent =
                      '正在等待服务恢复… 第 ' +
                      n +
                      ' 次（约 ' +
                      Math.round(elapsed / 1000) +
                      's）\n' +
                      (r.autoExitScheduled
                        ? '已启用 UPGRADE_AUTO_EXIT_ON_APPLY：进程应已退出并由 systemd / Docker / pm2 等重新拉起。'
                        : '连接中断属正常现象，将继续重试直至健康检查通过。');
                  }
                },
              });
              var okLine =
                '升级完成 · 服务已恢复 · 当前应用版本 ' +
                (h.appVersion || '—') +
                '（' +
                (h.appName || r.appliedProduct || '') +
                '）';
              if (r.lazyImages === 'restored') {
                okLine += ' · 已补全 lazy-images.js';
              }
              if (r.lazyImages === 'missing') {
                okLine +=
                  ' · 注意：lazy-images.js 未恢复，请从发行包补全 public/js/lazy-images.js';
              }
              showUpgradeMsg(okLine, r.lazyImages !== 'missing');
              if (pre) {
                pre.textContent =
                  '【升级后状态】\n' +
                  '本机运行版本（/api/health）: ' +
                  (h.appVersion || '—') +
                  ' · ' +
                  (h.appName || '—') +
                  '\n' +
                  '制品 manifest 声明系统版本: ' +
                  (r.systemVersion || '—') +
                  '\n' +
                  '落盘时 package.json 版本: ' +
                  (r.appliedSystemVersion || '—') +
                  '\n' +
                  '存储: ' +
                  (h.siteStorage || '—') +
                  ' · SQLite: ' +
                  (h.sqlite != null ? h.sqlite : '—');
              }
            } catch (wErr) {
              showUpgradeMsg(wErr.message || String(wErr), false);
              if (pre) pre.textContent = wErr.message || String(wErr);
            }
          } else {
            var line = '系统更新已执行';
            if (r.appliedSystemVersion) {
              line += ' · 本机 package 版本 ' + r.appliedSystemVersion;
            }
            if (r.lazyImages === 'restored') {
              line += '；已补全 lazy-images.js（全站图片懒加载）。';
            }
            if (r.lazyImages === 'missing') {
              line +=
                '；注意：lazy-images.js 未能恢复，请从官方发行包将 public/js/lazy-images.js 补到站点。';
            }
            showUpgradeMsg(line, r.lazyImages !== 'missing');
            if (pre) {
              pre.textContent =
                '【升级后状态】\n本机 package 版本: ' +
                (r.appliedSystemVersion || '—') +
                '\nmanifest 目标: ' +
                (r.systemVersion || '—');
            }
          }
          await refreshUpgradeHistory();
          await loadUpgradePanel();
        } catch (e) {
          showUpgradeMsg(e.message || String(e), false);
          if (pre) pre.textContent = e.message || String(e);
        } finally {
          btnSys.disabled = false;
        }
      });
    }

    var panelUpgrade = $('panelUpgrade');
    if (panelUpgrade) {
      panelUpgrade.addEventListener('click', async function (e) {
        var btn =
          e.target &&
          e.target.closest &&
          e.target.closest('#btnUpgradeBuildArtifacts');
        if (!btn) return;
        e.preventDefault();
        var docs = $('up_build_docs') && $('up_build_docs').checked;
        var system = $('up_build_system') && $('up_build_system').checked;
        if (!docs && !system) {
          showBuildMsg('请至少勾选一项', false);
          return;
        }
        var pre = buildOutputPre();
        if (pre) pre.textContent = '生成中…';
        showBuildMsg('正在生成升级清单…', true);
        btn.disabled = true;
        try {
          var r = await api('/api/admin/upgrade/build-artifacts', {
            method: 'POST',
            body: JSON.stringify({ docs: !!docs, system: !!system }),
          });
          showBuildMsg('已写入 public/upgrade/，见下方摘要', true);
          pre = buildOutputPre();
          if (pre) {
            var lines = [];
            if (r.docs) {
              lines.push(
                '文档: docsVersion=' +
                  r.docs.docsVersion +
                  ' sha256=' +
                  r.docs.sha256 +
                  ' bytes=' +
                  r.docs.bytes
              );
            }
            if (r.system) {
              lines.push(
                '系统: sha256=' + r.system.sha256 + ' bytes=' + r.system.bytes
              );
            }
            lines.push('manifest: ' + (r.manifestPublicPath || '/upgrade/manifest.json'));
            pre.textContent = lines.join('\n');
          }
          await refreshUpgradeHistory();
        } catch (err) {
          var msg = err.message || String(err);
          showBuildMsg(msg, false);
          showUpgradeMsg(msg, false);
          pre = buildOutputPre();
          if (pre) pre.textContent = msg;
        } finally {
          btn.disabled = false;
        }
      });
    }

    const btnHist = $('btnUpgradeHistoryRefresh');
    if (btnHist) btnHist.addEventListener('click', refreshUpgradeHistory);
  });
})();
