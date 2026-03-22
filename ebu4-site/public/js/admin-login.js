/**
 * 后台登录：密码 / 仅密码 / 通行密钥（WebAuthn）
 */
var loginMode = 'user';

function toast(msg, type) {
  type = type || 'success';
  var t = document.getElementById('toast');
  var icon = document.getElementById('toastIcon');
  document.getElementById('toastMsg').textContent = msg;
  icon.className = type === 'success' ? 'chk' : type === 'warn' ? 'warn' : 'err';
  icon.textContent = type === 'success' ? '✓' : type === 'warn' ? '⚠' : '✕';
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(function () {
    t.classList.remove('show');
  }, 2400);
}

function switchMode(mode) {
  loginMode = mode;
  document.querySelectorAll('.mode-tab').forEach(function (el) {
    el.classList.toggle('on', el.getAttribute('data-mode') === mode);
  });
  var ug = document.getElementById('usernameGroup');
  var pg = document.getElementById('passwordGroup');
  var pkg = document.getElementById('passkeyGroup');
  var rr = document.getElementById('rememberRow');
  var btn = document.getElementById('btnSubmit');
  var cd = document.getElementById('cardDesc');
  if (mode === 'pwd') {
    ug.classList.remove('show');
    ug.classList.add('hidden');
    pg.classList.remove('hidden');
    pg.classList.add('show');
    pkg.classList.add('hidden');
    pkg.classList.remove('show');
    rr.style.display = '';
    if (btn) btn.style.display = '';
    if (cd) {
      cd.textContent = '仅填写环境变量中的管理员密码（旧版单密码登录）。';
    }
    document.getElementById('password').focus();
  } else if (mode === 'passkey') {
    ug.classList.remove('hidden');
    ug.classList.add('show');
    pg.classList.remove('show');
    pg.classList.add('hidden');
    pkg.classList.remove('hidden');
    pkg.classList.add('show');
    rr.style.display = 'none';
    if (btn) btn.style.display = 'none';
    if (cd) {
      cd.textContent = '输入用户名后使用通行密钥。请先在控制台「用户管理」为该账号绑定密钥。';
    }
    document.getElementById('username').focus();
  } else {
    ug.classList.remove('hidden');
    ug.classList.add('show');
    pg.classList.remove('hidden');
    pg.classList.add('show');
    pkg.classList.add('hidden');
    pkg.classList.remove('show');
    rr.style.display = '';
    if (btn) btn.style.display = '';
    if (cd) {
      cd.textContent = '使用用户名与密码进入控制台。仅填密码可兼容旧版单密码登录。';
    }
    document.getElementById('username').focus();
  }
  hideError();
}

function togglePwd() {
  var inp = document.getElementById('password');
  var on = document.getElementById('eyeOn');
  var off = document.getElementById('eyeOff');
  if (inp.type === 'password') {
    inp.type = 'text';
    on.style.display = 'none';
    off.style.display = '';
  } else {
    inp.type = 'password';
    on.style.display = '';
    off.style.display = 'none';
  }
}

function showError(msg) {
  var el = document.getElementById('errorMsg');
  document.getElementById('errorText').textContent = msg;
  el.classList.add('show');
  document.getElementById('password').classList.add('has-error');
  if (loginMode === 'user') document.getElementById('username').classList.add('has-error');
  var card = document.getElementById('authCard');
  if (card) {
    card.classList.add('shake');
    setTimeout(function () {
      card.classList.remove('shake');
    }, 500);
  }
}

function hideError() {
  document.getElementById('errorMsg').classList.remove('show');
  document.getElementById('password').classList.remove('has-error');
  document.getElementById('username').classList.remove('has-error');
}

function safeReturnUrl(raw) {
  if (raw == null || typeof raw !== 'string') return '/admin';
  var d = raw.trim();
  try {
    d = decodeURIComponent(d);
  } catch (e) {
    return '/admin';
  }
  if (!d.startsWith('/') || d.startsWith('//')) return '/admin';
  return d;
}

function api(path, opt) {
  return fetch(
    path,
    Object.assign(
      {
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
      },
      opt || {}
    )
  ).then(function (r) {
    return r.text().then(function (text) {
      var data;
      try {
        data = text ? JSON.parse(text) : {};
      } catch (e) {
        data = {};
      }
      if (!r.ok) throw new Error(data.error || r.statusText || '请求失败');
      return data;
    });
  });
}

function checkSession() {
  return fetch('/api/admin/session', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
    .then(function (r) {
      return r.json();
    })
    .then(function (d) {
      return d.ok === true && d.user;
    })
    .catch(function () {
      return false;
    });
}

function handleLogin(e) {
  e.preventDefault();
  if (loginMode === 'passkey') {
    doPasskeyLogin();
    return false;
  }
  var u = document.getElementById('username').value.trim();
  var p = document.getElementById('password').value;
  if (loginMode === 'user' && !u) {
    showError('请输入用户名');
    return false;
  }
  if (!p) {
    showError('请输入密码');
    return false;
  }
  hideError();
  var btn = document.getElementById('btnSubmit');
  var label = document.getElementById('btnSubmitLabel');
  btn.disabled = true;
  var body =
    loginMode === 'pwd' ? { password: p } : { username: u, password: p };
  api('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify(body),
  })
    .then(function () {
      document.getElementById('password').value = '';
      var params = new URLSearchParams(window.location.search);
      window.location.replace(safeReturnUrl(params.get('return')));
    })
    .catch(function (err) {
      showError(err.message || '登录失败');
    })
    .finally(function () {
      btn.disabled = false;
      if (label) label.textContent = '进入控制台';
    });
  return false;
}

function doPasskeyLogin() {
  if (!window.webauthnClient || !webauthnClient.supported()) {
    toast('当前浏览器不支持通行密钥，请使用 Chrome / Edge / Safari 或更新系统', 'warn');
    return;
  }
  var u = document.getElementById('username').value.trim();
  if (!u) {
    showError('请先输入用户名');
    return;
  }
  hideError();
  var btnPk = document.getElementById('btnPasskey');
  if (btnPk) btnPk.disabled = true;
  api('/api/admin/webauthn/config')
    .then(function (cfg) {
      if (!cfg || !cfg.enabled) {
        throw new Error('服务器未启用通行密钥（或已禁用）');
      }
      return api('/api/admin/webauthn/authentication/options', {
        method: 'POST',
        body: JSON.stringify({ username: u }),
      });
    })
    .then(function (d) {
      var options = d.options;
      var challengeId = d.challengeId;
      var req = webauthnClient.prepareRequestOptions(options);
      return navigator.credentials
        .get({ publicKey: req })
        .then(function (cred) {
          var json = webauthnClient.authenticationToJSON(cred);
          if (!json) throw new Error('无法读取认证结果');
          return api('/api/admin/webauthn/authentication/verify', {
            method: 'POST',
            body: JSON.stringify({ challengeId: challengeId, credential: json }),
          });
        });
    })
    .then(function () {
      toast('登录成功，正在跳转…', 'success');
      var params = new URLSearchParams(window.location.search);
      setTimeout(function () {
        window.location.replace(safeReturnUrl(params.get('return')));
      }, 400);
    })
    .catch(function (err) {
      showError(err.message || String(err));
    })
    .finally(function () {
      if (btnPk) btnPk.disabled = false;
    });
}

document.getElementById('username').addEventListener('input', hideError);
document.getElementById('password').addEventListener('input', hideError);

document.addEventListener('DOMContentLoaded', function () {
  var params = new URLSearchParams(window.location.search);
  var ret = safeReturnUrl(params.get('return'));

  checkSession().then(function (ok) {
    if (ok) window.location.replace(ret);
  });
});

window.switchMode = switchMode;
window.togglePwd = togglePwd;
window.handleLogin = handleLogin;
window.doPasskeyLogin = doPasskeyLogin;
window.toast = toast;
