/* setup.js — 商店首次初始化页面逻辑 */

(function () {
  'use strict';

  var form = document.getElementById('setup-form');
  var errorBox = document.getElementById('setup-error');
  var submitBtn = document.getElementById('setup-submit');
  var redirectBox = document.getElementById('setup-redirect');
  var pageBox = document.getElementById('setup-page');

  // 引导密钥可以从 URL 片段带进来（``#token=xxx``）。刻意用片段而不是查询串：
  // 片段不会被发到服务器、不会进访问日志与 Referer。远程首次部署时运营从容器日志
  // 里抄到密钥，直接以 ``/store-setup#token=xxx`` 打开本页即可，不必先看到表单。
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

  // 页面加载时检查是否已有管理员。
  //
  // S17：``/store/v1/setup/status`` 对**无权限**的调用方恒回 ``{initialized:true}``
  // （否则它就成了一条免费探针：``false`` = 「这家店还没管理员，来抢」）。
  // 因此这里只在「确实带了引导密钥」时才把 ``initialized`` 当定论并跳去登录；
  // 拿不到权限时照常显示表单，由提交结果（403 无权限 / 409 已初始化）给出确定答案。
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
    // 引导密钥只对「远程访问」是必需的；本机直连时留空即可（服务端按对端地址判定）。
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
        // 409 = 库里已经有管理员了。这是 S17 之后**无权限**调用方唯一能确定
        // 「其实已经初始化过」的途径（``/status`` 对他们恒回 true），所以这里
        // 直接把他送回登录页，而不是抛一句看不懂的报错。
        if (result.status === 409) {
          pageBox.hidden = true;
          redirectBox.hidden = false;
          setTimeout(function () { location.href = '/admin'; }, 1500);
          return;
        }
        // FastAPI 的参数校验失败（422）里的 ``detail`` 是**数组**，直接交给
        // ``showError`` 会显示成 ``[object Object]`` —— 初始化页最常见的一类失败
        // （邮箱格式、密码太短、引导密钥不对）恰好都走这条。归一化只有一份实现，
        // 与后台/商店前台共用：store/static/api-error.js。
        var detail = ApiError.describe(result.body && result.body.detail, '初始化失败，请重试。');
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
