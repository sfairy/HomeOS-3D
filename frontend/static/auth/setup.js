/**
 * 首次初始化（管理员账号设置）页脚本：后端尚未创建管理员时，/setup 的表单逻辑。
 */
import { apiFetch } from "../utils/api-fetch.js?v=2609271508";
import { apiErrorMessage } from "../utils/api-error.js?v=2609271508";

const form = document.querySelector("#setup-form"),
  message = document.querySelector("#message"),
  submit = form.querySelector('button[type="submit"]');

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]),
  tokenField = document.querySelector("#setup-token-field");
if (tokenField && !LOOPBACK_HOSTS.has(window.location.hostname)) {
  tokenField.hidden = false;
  tokenField.querySelector("input").required = true;
}


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
    submit.disabled = false;
  }
});
