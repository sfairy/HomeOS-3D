/**
 * 首次初始化（管理员账号设置）页脚本。
 *
 * 位置：后端尚未创建管理员时，/setup 页面的表单逻辑。
 * 职责：提交用户名与密码到 /api/v1/setup/admin，成功后跳回首页。
 * 约定：两次密码在前端先比对一次，减少一次无谓请求；后端失败信息可能是
 *   FastAPI 校验错误数组（detail[0].msg），也可能是字符串，要分别兼容。
 *   非本机地址打开时还要带上引导密钥（setupToken），否则后端一律 403。
 */
const form = document.querySelector("#setup-form"),
  message = document.querySelector("#message"),
  submit = form.querySelector('button[type="submit"]');

// 引导密钥：后端只对「本机直连」放行，其它来源必须出示密钥才能建管理员账号。
// 本机用 localhost / 127.0.0.1 / ::1 打开时不显示这一栏，避免无谓的打扰；
// 其余地址（含内网 IP、反代域名）一律显示并改成必填。
// 注意不能写死 required：隐藏字段触发校验时浏览器无法聚焦，只会抛
// 「An invalid form control ... is not focusable」而表单静默不提交。
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]),
  tokenField = document.querySelector("#setup-token-field");
if (tokenField && !LOOPBACK_HOSTS.has(window.location.hostname)) {
  ((tokenField.hidden = !1), (tokenField.querySelector("input").required = !0));
}

form.addEventListener("submit", async submitEvent => {
  (submitEvent.preventDefault(), (message.textContent = ""), (message.hidden = !0));
  const formData = new FormData(form),
    password = String(formData.get("password") || ""),
    passwordConfirmation = String(formData.get("passwordConfirmation") || "");
  // 前端先做一致性校验，避免把明显无效的表单发到后端。
  if (password !== passwordConfirmation) {
    ((message.textContent = "\u4E24\u6B21\u8F93\u5165\u7684\u5BC6\u7801\u4E0D\u4E00\u81F4\u3002"),
      (message.hidden = !1));
    return;
  }
  // 请求期间禁用按钮，防止重复提交建出多个管理员。
  submit.disabled = !0;
  try {
    // 非 JSON 响应（网关错误页等）解析失败，按空对象处理走默认错误文案。
    const response = await fetch("/api/v1/setup/admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: String(formData.get("username") || ""),
          password: password,
          passwordConfirmation: passwordConfirmation,
          // 本机直连时后端放行，留空即可；远程访问必须与启动日志里的引导密钥一致。
          setupToken: String(formData.get("setupToken") || "")
        })
      }),
      payload = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(
        payload.detail?.[0]?.msg || payload.detail || "\u521D\u59CB\u5316\u5931\u8D25\u3002"
      );
    // 初始化成功即已建立会话，直接进入面板，无需再登录一次。
    window.location.assign("/");
  } catch (caughtError) {
    // 失败时恢复按钮，让用户可以改完再提交。
    ((message.textContent = caughtError.message), (message.hidden = !1), (submit.disabled = !1));
  }
});
