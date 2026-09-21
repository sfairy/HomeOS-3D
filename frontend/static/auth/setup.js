/**
 * 首次初始化（管理员账号设置）页脚本：后端尚未创建管理员时，/setup 的表单逻辑。
 *
 * 提交用户名与密码到 /api/v1/setup/admin，成功后先去授权页。约定：两次密码在前端先比对一次；
 * 后端失败信息的归一交给 utils/api-error.js；非本机地址打开时还要带上引导密钥。
 * 初始化请求走 utils/api-fetch.js（20 秒超时），按钮恢复放在 finally —— 后端建库 / 迁移时请求可能拖很久，
 * 没有超时就没有结论，没有 finally 就没有下一次点击。
 * 跳转：设置成功即已下发登录 Cookie，先打开 /license —— 授权有效时该页 303 回首页，失效 / 未激活则留下完成激活。
 */
import { apiFetch } from "../utils/api-fetch.js?v=2609212100";
import { apiErrorMessage } from "../utils/api-error.js?v=2609212100";

const form = document.querySelector("#setup-form"),
  message = document.querySelector("#message"),
  submit = form.querySelector('button[type="submit"]');

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]),
  tokenField = document.querySelector("#setup-token-field");
if (tokenField && !LOOPBACK_HOSTS.has(window.location.hostname)) {
  tokenField.hidden = false;
  tokenField.querySelector("input").required = true;
}

// 密码显隐由 /static/auth/auth-shell.js 统一接线（按 .hos-password-field 找最近输入框），
// 这里不再重复绑定：两处都挂监听会让一次点击切换两次，等于按钮没反应。

form.addEventListener("submit", async submitEvent => {
  submitEvent.preventDefault();
  message.textContent = "";
  message.hidden = true;

  const formData = new FormData(form),
    password = String(formData.get("password") || ""),
    passwordConfirmation = String(formData.get("passwordConfirmation") || "");

  if (password !== passwordConfirmation) {
    message.textContent = "两次输入的密码不一致。";
    message.hidden = false;
    return;
  }

  submit.disabled = true;
  try {
    const response = await apiFetch("/api/v1/setup/admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: String(formData.get("username") || ""),
          password,
          passwordConfirmation,
          setupToken: String(formData.get("setupToken") || "")
        })
      }),
      payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      // 文案归一交给 utils/api-error.js，它认得 422 数组并能用上后端追加的中文摘要。
      throw new Error(apiErrorMessage(payload, "初始化失败。"));
    }
    window.location.assign("/license");
  } catch (caughtError) {
    message.textContent = caughtError.message;
    message.hidden = false;
  } finally {
    // 超时（apiFetch 抛 TimeoutError）、网络失败、后端报错都必须把按钮放回来：
    // 初始化接口在后端建库/迁移时可能拖很久，卡住的那一次点击不能把页面锁死。
    submit.disabled = false;
  }
});
