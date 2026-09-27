/**
 * 入口页共用的密码显隐接线（/setup、/login、/pair 都引它）。
 */

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-password-toggle]')) {
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
