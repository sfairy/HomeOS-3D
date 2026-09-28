import { describe } from "./api-error.js";
import { bindPasswordToggles } from "./password-toggle.js";

const form = document.getElementById('setup-form') as HTMLFormElement | null;
const errorBox = document.getElementById('setup-error');
const submitBtn = document.getElementById('setup-submit') as HTMLButtonElement | null;
const redirectBox = document.getElementById('setup-redirect');
const pageBox = document.getElementById('setup-page');

function tokenFromFragment() {
  const m = /(?:^|[#&])token=([^&]+)/.exec(location.hash || '');
  if (!m) return '';
  try {
    return decodeURIComponent(m[1] ?? '').trim();
  } catch {
    return '';
  }
}

const fragmentToken = tokenFromFragment();
if (fragmentToken) {
  const tokenInput = document.getElementById('setup-token') as HTMLInputElement | null;
  if (tokenInput && !tokenInput.value) tokenInput.value = fragmentToken;
  // 引导密钥只应活在输入框/请求头里：预填后立即抹掉地址栏 fragment，
  // 避免刷新、转发链接、浏览器历史与截屏把 token 泄漏出去（不刷新页面）。
  try {
    history.replaceState(null, '', location.pathname + location.search);
  } catch {
    /* 某些隐私模式下 replaceState 会抛错：保留功能优先，token 留在地址栏可接受 */
  }
}

fetch('/store/v1/setup/status', {
  method: 'GET',
  headers: fragmentToken ? { 'X-Setup-Token': fragmentToken } : {},
})
  .then((r) => r.json())
  .then((data: { initialized?: boolean }) => {
    if (data && data.initialized && fragmentToken) {
      if (pageBox) pageBox.hidden = true;
      if (redirectBox) redirectBox.hidden = false;
      setTimeout(() => {
        location.href = '/admin';
      }, 1500);
    }
  })
  .catch(() => { /* 静默：出错就让用户手动提交 */ });

// 密码显隐切换（setup 页只切按钮文案：模板里的 aria-label/title 保持静态，与商店、后台入口的差异保留）
bindPasswordToggles(document, { ariaLabel: false });

function showError(msg: string) {
  if (!errorBox) return;
  errorBox.textContent = msg;
  errorBox.hidden = false;
}

function clearError() {
  if (!errorBox) return;
  errorBox.hidden = true;
  errorBox.textContent = '';
}

form?.addEventListener('submit', (e) => {
  e.preventDefault();
  clearError();

  const email = (document.getElementById('email') as HTMLInputElement).value.trim();
  const password = (document.getElementById('password') as HTMLInputElement).value;
  const confirmPassword = (document.getElementById('confirm-password') as HTMLInputElement).value;
  // 引导密钥只对「远程访问」是必需的；用 localhost / 127.0.0.1 从本机打开时留空即可
  const setupToken = (document.getElementById('setup-token') as HTMLInputElement).value.trim();

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

  if (submitBtn) {
    submitBtn.classList.add('is-loading');
    submitBtn.disabled = true;
  }

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
    .then((r) =>
      r.json().then((body: unknown) => ({
        status: r.status,
        body: body as { detail?: unknown },
      })),
    )
    .then((result) => {
      if (result.status === 201) {
        location.href = '/admin';
        return;
      }
      // 409 = 库里已经有管理员了。这是**无权限**调用方唯一能确定
      if (result.status === 409) {
        if (pageBox) pageBox.hidden = true;
        if (redirectBox) redirectBox.hidden = false;
        setTimeout(() => {
          location.href = '/admin';
        }, 1500);
        return;
      }
      const detail = describe(result.body && result.body.detail, '初始化失败，请重试。');
      showError(detail);
      if (submitBtn) {
        submitBtn.classList.remove('is-loading');
        submitBtn.disabled = false;
      }
    })
    .catch(() => {
      showError('网络错误，请重试。');
      if (submitBtn) {
        submitBtn.classList.remove('is-loading');
        submitBtn.disabled = false;
      }
    });
});
