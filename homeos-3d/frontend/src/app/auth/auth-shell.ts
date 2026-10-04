/** 登录/初始化页共用的密码可见性切换。由各 Vue 视图在挂载时调用。 */
export function initAuthShell(): void {
  for (const button of document.querySelectorAll<HTMLElement>("[data-password-toggle]")) {
    button.addEventListener("click", () => {
      const field = button.closest(".hos-password-field")?.querySelector("input");

      if (!field) return;
      const show = field.type === "password";
      field.type = show ? "text" : "password";

      field.dataset.passwordField = "true";
      const label = show ? "隐藏密码" : "显示密码";
      button.textContent = show ? "隐藏" : "显示";
      button.setAttribute("aria-label", label);
      button.title = label;
    });
  }
}
