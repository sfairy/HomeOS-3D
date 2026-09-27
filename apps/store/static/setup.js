import { describe } from "./api-error.js?v=2609271411";

var form = document.getElementById('setup-form');
var errorBox = document.getElementById('setup-error');
var submitBtn = document.getElementById('setup-submit');
var redirectBox = document.getElementById('setup-redirect');
var pageBox = document.getElementById('setup-page');

function tokenFromFragment() {
  var m = /(?:^|[#&])token=([^&]+)/.exec(location.hash || '');
  if (!m) return '';
  try { return decodeURIComponent(m[1]).trim(); } catch (e) { return ''; }
}

var fragmentToken = tokenFromFragment();
if (fragmentToken) {
  var tokenInput = document.getElementById('setup-token');
  if (tokenInput && !tokenInput.value) tokenInput.value = fragmentToken;
}

fetch('/store/v1/setup/status', {
  method: 'GET',
  headers: fragmentToken ? { 'X-Setup-Token': fragmentToken } : {},
})
  .then(function (r) { return r.json(); })
  .then(function (data) {
    if (data && data.initialized && fragmentToken) {
      pageBox.hidden = true;
      redirectBox.hidden = false;
      setTimeout(function () { location.href = '/admin'; }, 1500);
    }
  })
  .catch(function () { /* 静默：出错就让用户手动提交 */ });

// 密码显隐切换
document.querySelectorAll('[data-password-toggle]').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var input = btn.parentElement.querySelector('input[type="password"], input[type="text"]');
    if (!input) return;
    var isPw = input.type === 'password';
    input.type = isPw ? 'text' : 'password';
    btn.textContent = isPw ? '隐藏' : '显示';
  });
});

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.hidden = false;
}

function clearError() {
  errorBox.hidden = true;
  errorBox.textContent = '';
}

form.addEventListener('submit', function (e) {
  e.preventDefault();
  clearError();

  var email = document.getElementById('email').value.trim();
  var password = document.getElementById('password').value;
  var confirmPassword = document.getElementById('confirm-password').value;
  // 引导密钥只对「远程访问」是必需的；用 localhost / 127.0.0.1 从本机打开时留空即可
  var setupToken = document.getElementById('setup-token').value.trim();

  if (!email) {
    showError('请输入管理员邮箱。');
    return;
  }
  if (password.length < 8) {
    showError('密码至少需要 8 位。');
    return;
  }
  if (password !== confirmPassword) {
    showError('两次输入的密码不一致。');
    return;
  }

  submitBtn.classList.add('is-loading');
  submitBtn.disabled = true;

  fetch('/store/v1/setup/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: email,
      password: password,
      confirm_password: confirmPassword,
      setup_token: setupToken,
    }),
  })
    .then(function (r) {
      return r.json().then(function (body) {
        return { status: r.status, body: body };
      });
    })
    .then(function (result) {
      if (result.status === 201) {
        location.href = '/admin';
        return;
      }
      // 409 = 库里已经有管理员了。这是**无权限**调用方唯一能确定
      if (result.status === 409) {
        pageBox.hidden = true;
        redirectBox.hidden = false;
        setTimeout(function () { location.href = '/admin'; }, 1500);
        return;
      }
      var detail = describe(result.body && result.body.detail, '初始化失败，请重试。');
      showError(detail);
      submitBtn.classList.remove('is-loading');
      submitBtn.disabled = false;
    })
    .catch(function () {
      showError('网络错误，请重试。');
      submitBtn.classList.remove('is-loading');
      submitBtn.disabled = false;
    });
});
