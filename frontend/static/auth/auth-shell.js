/**
 * 入口页共用的密码显隐接线（/setup、/login、/pair 都引它）。
 *
 * 约定：按钮放在 .hos-password-field 里，紧邻它要控制的输入框；按钮不需要知道输入框的 id
 * （id 由页面自己保证唯一，脚本按结构找最近的 input），也不需要页面给按钮写死文案 ——
 * 文案由当前可见状态推出来，避免「按钮写着显示、输入框其实已经是明文」这种不一致。
 *
 * 为什么从「按 id 找目标」改成「按结构找」：原先登录页用 data-toggle-password="login-password"
 * 指 id，初始化页用 data-password-toggle 指最近的输入框。两套写法并存，两边的显示/隐藏文案也
 * 各写各的；统一视觉外壳时顺手统一成一套。
 *
 * 注意：本文件使用 data-password-field 标记「这个框曾经是密码框」。
 * 切换成 type=text 后 type 选择器就认不出它了，标记是刷新可见性状态的唯一依据。
 */

for (const button of document.querySelectorAll('[data-password-toggle]')) {
  button.addEventListener('click', () => {
    const field = button.closest('.hos-password-field')?.querySelector('input');
    // 一处结构写错只该让这一个按钮失效，不能让整个模块停在这行 —— 同页其它按钮还要能用。
    if (!field) return;
    const show = field.type === 'password';
    field.type = show ? 'text' : 'password';
    field.dataset.passwordField = 'true';
    const label = show ? '隐藏密码' : '显示密码';
    button.textContent = show ? '隐藏' : '显示';
    button.setAttribute('aria-label', label);
    button.title = label;
  });
}
