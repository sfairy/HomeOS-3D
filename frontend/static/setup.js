/**
 * 首次初始化（管理员账号设置）页脚本。
 *
 * 位置：后端尚未创建管理员时，/setup 页面的表单逻辑。
 * 职责：提交用户名与密码到 /api/v1/setup/admin，成功后先去授权页。
 * 约定：两次密码在前端先比对一次；后端失败信息可能是 FastAPI 校验错误数组
 *   （detail[0].msg），也可能是字符串。非本机地址打开时还要带上引导密钥。
 * 约定：初始化请求走 utils/api-fetch.js（带 20 秒超时），且按钮的恢复放在 finally
 *   里 —— 后端正在建库/迁移时这个请求可能拖很久，没有超时就没有结论，没有 finally
 *   就没有下一次点击。
 * 跳转：设置成功即已下发登录 Cookie；先打开 /license——
 *   授权有效时该页会 303 回首页，失效/未激活则留在授权页完成激活。
 */
import { apiFetch } from "./utils/api-fetch.js?v=20260919153711";

const form = document.querySelector("#setup-form"),
  message = document.querySelector("#message"),
  submit = form.querySelector('button[type="submit"]');

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]),
  tokenField = document.querySelector("#setup-token-field");
if (tokenField && !LOOPBACK_HOSTS.has(window.location.hostname)) {
  tokenField.hidden = false;
  tokenField.querySelector("input").required = true;
}

form.querySelectorAll("[data-password-toggle]").forEach(button => {
  button.addEventListener("click", () => {
    const field = button.closest(".hb-password-field")?.querySelector("input");
    if (!field) return;
    const show = field.type === "password";
    field.type = show ? "text" : "password";
    button.textContent = show ? "隐藏" : "显示";
    button.setAttribute("aria-label", show ? "隐藏密码" : "显示密码");
  });
});

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
      const detail = payload.detail;
      throw new Error(
        (Array.isArray(detail) && detail[0]?.msg) ||
          (typeof detail === "string" ? detail : null) ||
          "初始化失败。"
      );
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
