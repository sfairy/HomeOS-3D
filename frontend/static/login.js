/**
 * 登录页表单脚本。
 *
 * 位置：/login 页面，配合 auth-shell.js 的表情动画与 auth.css 样式。
 * 职责：提交用户名密码到 /api/v1/auth/login，成功后跳到 next 指定的页面。
 * 约定：next 参数只接受站内绝对路径，且必须拒绝 // 开头的协议相对地址，
 *   否则会被利用做开放重定向。
 */
const form = document.querySelector("#login-form"),
  message = document.querySelector("#message"),
  submit = form.querySelector('button[type="submit"]');

/**
 * 计算登录成功后的跳转地址。
 *
 * @returns {string} 站内路径；next 缺失或不合法时回退到 "/"。
 */
function loginDestination() {
  const destinationPath = new URLSearchParams(window.location.search).get("next") || "/";
  // 以 // 开头会被浏览器当成协议相对 URL 跳到外站，必须过滤。
  return destinationPath.startsWith("/") && !destinationPath.startsWith("//")
    ? destinationPath
    : "/";
}

form.addEventListener("submit", async submitEvent => {
  (submitEvent.preventDefault(), (message.textContent = ""), (message.hidden = !0));
  const formData = new FormData(form);
  // 请求期间禁用按钮，避免重复登录产生多个会话。
  submit.disabled = !0;
  try {
    // 非 JSON 响应（网关错误页等）解析失败，按空对象处理走默认错误文案。
    const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: String(formData.get("username") || ""),
          password: String(formData.get("password") || "")
        })
      }),
      responseBody = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(responseBody.detail || "\u767B\u5F55\u5931\u8D25\u3002");
    window.location.assign(loginDestination());
  } catch (error) {
    // 登录失败后恢复按钮，允许用户修改凭据重试。
    ((message.textContent = error.message), (message.hidden = !1), (submit.disabled = !1));
  }
});
