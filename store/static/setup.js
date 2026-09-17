/* setup.js — 商店首次初始化页面逻辑 */

(function () {
  'use strict';

  var form = document.getElementById('setup-form');
  var errorBox = document.getElementById('setup-error');
  var submitBtn = document.getElementById('setup-submit');
  var redirectBox = document.getElementById('setup-redirect');
  var pageBox = document.getElementById('setup-page');

  // 页面加载时检查是否已有管理员
  fetch('/store/v1/setup/status', { method: 'GET' })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data && data.initialized) {
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
        var detail = (result.body && result.body.detail) || '初始化失败，请重试。';
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
})();
