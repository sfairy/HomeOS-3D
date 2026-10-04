import type { DomControl } from "@app/utils/dom-control";

/**
 * 登录页引导。由 `LoginView.vue` 在挂载时调用。
 *
 * 之所以导出成函数而不是继续在模块顶层跑：SPA 内同文档多次进入同一路由时，模块只会求值
 * 一次，顶层副作用不会重跑；只有显式 init 才能把监听器重新挂到新渲染出来的 DOM 上。
 */
export function initLogin(): void {
  const form = document.querySelector<DomControl>("#login-form"),
    message = document.querySelector<DomControl>("#message"),
    submit = form.querySelector<DomControl>('button[type="submit"]');
  function loginDestination() {
    const nextPath = new URLSearchParams(window.location.search).get("next") || "/";
    return nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/";
  }
  form.addEventListener("submit", async (submitEvent) => {
    (submitEvent.preventDefault(), (message.textContent = ""), (message.hidden = true));
    const formData = new FormData(form as HTMLFormElement);
    submit.disabled = true;
    try {
      const response = await fetch("/api/v1/auth/login", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            username: String(formData.get("username") || ""),
            password: String(formData.get("password") || ""),
          }),
        }),
        payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || "登录失败。");
      window.location.assign(loginDestination());
    } catch (caughtError) {
      ((message.textContent = caughtError.message),
        (message.hidden = false),
        (submit.disabled = false));
    }
  });
}
