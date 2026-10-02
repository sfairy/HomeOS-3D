/**
 * 密码显隐切换：商店认证/解绑表单、setup 初始化页、后台登录共用同一
 * [data-password-toggle] DOM 契约（开关按钮与 input 同在一个包裹元素里）。
 */

type PasswordToggleOptions = {
  // 是否在切换时同步按钮 aria-label。setup 页模板里的 aria-label 是静态属性，
  // 其原实现只切文案，这里保留该差异；其余入口切换时同步 aria-label。
  ariaLabel?: boolean;
};

// 一次切换：按「按钮的父元素」找输入框，而不是按某个字段类名。
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

// 逐个绑定：商店的各张表单与 setup 页在注册监听时对应 DOM 已就绪。
export function bindPasswordToggles(
  root: ParentNode,
  options?: PasswordToggleOptions,
): void {
  root.querySelectorAll('[data-password-toggle]').forEach((button) => {
    button.addEventListener('click', () => togglePassword(button, options));
  });
}

// 事件委托版：后台登录把点击监听挂在表单上，靠 closest 找到被点的开关。
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
