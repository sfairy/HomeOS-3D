/**
 * 登录页表单脚本。
 *
 * 位置：/login 页面，配合 auth-shell.js 的密码显隐与 setup.css 的激活页同款样式。
 * 职责：提交用户名密码到 /api/v1/auth/login，成功后跳到 next 指定的页面。
 * 约定：next 参数只接受站内绝对路径，且必须拒绝 // 开头的协议相对地址，
 *   否则会被利用做开放重定向。
 *   提交按钮的禁用状态在 finally 里复位，并且请求带超时（apiFetch）：两者缺一
 *   都会让「点一次登录后按钮永久灰掉」——请求不返回时用户连重试都点不了。
 */

import { apiFetch } from "../utils/api-fetch.js?v=20260920102755";

const form = document.querySelector("#login-form"),
  message = document.querySelector("#message"),
  submit = form.querySelector('button[type="submit"]');

/**
 * 计算登录成功后的跳转地址。
 */
function loginDestination() {
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
  // 请求期间禁用按钮，避免重复登录产生多个会话。
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
      responseBody = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(responseBody.detail || "登录失败。");
    window.location.assign(loginDestination());
  } catch (error) {
    ((message.textContent = error.message), (message.hidden = !1));
  } finally {
    // 无论成功、失败还是超时都要恢复按钮，否则用户只剩刷新页面一条路。
    submit.disabled = !1;
  }
});
