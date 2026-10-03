/** 密码显隐切换：商店认证/解绑表单、setup 初始化页、后台登录共用同一[data-password-toggle] DOM 契约（开关按钮与 input 同在一个包裹元素里）。 */

type PasswordToggleOptions = {


  ariaLabel?: boolean;
};


 function togglePassword(button: Element, options: PasswordToggleOptions = {}): void {
  const input = button.parentElement?.querySelector('input') as HTMLInputElement | null;
  if (!input) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  button.textContent = show ? '隐藏' : '显示';
  if (options.ariaLabel !== false) {
    button.setAttribute('aria-label', show ? '隐藏密码' : '显示密码');
  }
}


export function bindPasswordToggles(
  root: ParentNode,
  options?: PasswordToggleOptions,
): void {
  root.querySelectorAll('[data-password-toggle]').forEach((button) => {
    button.addEventListener('click', () => togglePassword(button, options));
  });
}


export function handlePasswordToggleClick(
  event: Event,
  options?: PasswordToggleOptions,
): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const toggle = target.closest('[data-password-toggle]');
  if (!toggle) return;
  togglePassword(toggle, options);
}
