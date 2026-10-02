// 入口页共用的密码显隐接线（/login、/setup、/pair 都引它）。
//
// 源：homeos-3d/frontend/src/app/auth/auth-shell.ts。
// 这里只做一件事：把原来 auth-shell.js 里那套「卡通角色跟着密码框眨眼」的接线
// 换成 HomeOS 场景的密码显隐按钮 —— 角色的 DOM（.home-characters）随新场景一起消失，
// 旧代码会在 characters.classList 上直接抛错，把同页的登录表单接线一起带走。
for (const button of document.querySelectorAll<HTMLElement>("[data-password-toggle]")) {
  button.addEventListener("click", () => {
    const field = button.closest(".hos-password-field")?.querySelector("input");
    // 一处结构写错只该让这一个按钮失效，不能让整个模块停在这行 —— 同页其它按钮还要能用。
    if (!field) return;
    const show = field.type === "password";
    field.type = show ? "text" : "password";
    // 打上这个标记：提交前若还想恢复遮蔽，靠它认出「曾经被动过」的输入框。
    field.dataset.passwordField = "true";
    const label = show ? "隐藏密码" : "显示密码";
    button.textContent = show ? "隐藏" : "显示";
    button.setAttribute("aria-label", label);
    button.title = label;
  });
}
