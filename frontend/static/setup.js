/**
 * 首次初始化（管理员账号设置）页脚本。
 *
 * 位置：后端尚未创建管理员时，/setup 页面的表单逻辑。
 * 职责：提交用户名与密码到 /api/v1/setup/admin，成功后跳回首页。
 * 约定：两次密码在前端先比对一次，减少一次无谓请求；后端失败信息可能是
 *   FastAPI 校验错误数组（detail[0].msg），也可能是字符串，要分别兼容。
 */
const form = document.querySelector("#setup-form"),
  message = document.querySelector("#message"),
  submit = form.querySelector('button[type="submit"]');

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
          passwordConfirmation: passwordConfirmation
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
