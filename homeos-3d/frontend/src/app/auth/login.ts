/**
 * 登录页表单脚本。
 */

import { apiFetch } from "../utils/api-fetch.js";

const form = document.querySelector<HTMLFormElement>("#login-form");
const message = document.querySelector<HTMLElement>("#message");
const submit = form?.querySelector<HTMLButtonElement>('button[type="submit"]');

if (!form || !message || !submit) {
  throw new Error("登录页缺少必要表单节点。");
}

/**
 * 计算登录成功后的跳转地址。
 */
function loginDestination(): string {
  const destinationPath = new URLSearchParams(window.location.search).get("next") || "/";
  // 以 // 开头会被浏览器当成协议相对 URL 跳到外站，必须过滤。
  const safePath =
    destinationPath.startsWith("/") && !destinationPath.startsWith("//")
      ? destinationPath
      : "/";
  return safePath === "/" ? "/license" : safePath;
}

form.addEventListener("submit", async submitEvent => {
  (submitEvent.preventDefault(), (message.textContent = ""), (message.hidden = !0));
  const formData = new FormData(form);
  submit.disabled = !0;
  try {
    // 非 JSON 响应（网关错误页等）解析失败，按空对象处理走默认错误文案。
    const response = await apiFetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: String(formData.get("username") || ""),
          password: String(formData.get("password") || "")
        })
      }),
      responseBody = (await response.json().catch(() => ({}))) as { detail?: unknown };
    if (!response.ok) throw new Error(String(responseBody.detail || "登录失败。"));
    window.location.assign(loginDestination());
  } catch (error: unknown) {
    const errorText = error instanceof Error ? error.message : String(error);
    ((message.textContent = errorText), (message.hidden = !1));
  } finally {
    submit.disabled = !1;
  }
});
