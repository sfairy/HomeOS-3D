/**
 * 页面脚本里的「控件节点」。
 *
 * 背景：这些页面正在脱离 ts-nocheck 注释，节点几乎全是
 * `document.querySelector("#id")` / `querySelectorAll` 抓出来的。逐个写死
 * HTMLInputElement / HTMLSelectElement / HTMLButtonElement 会把调用点淹掉，
 * 所以统一收窄成「控件节点」：补齐代码实际读写的表单与写作属性，
 * 其余保持 HTMLElement 语义。
 *
 * 只要用 `document.querySelector<DomControl>(...)` 标注查询结果即可；
 * 这是过渡期的折中，只放宽类型，不改变任何运行时行为。
 */
export type DomControl = HTMLElement & {
  /** 表单控件的当前值（input / select / textarea）。 */
  value?: any;
  /** 勾选状态。 */
  checked?: any;
  disabled?: boolean;
  /** 数值步长 / 上下限：控件拿到的是字符串还是数字都放行。 */
  step?: any;
  min?: any;
  max?: any;
  type?: string;
  name?: string;
  maxLength?: number;
  readOnly?: boolean;
  /** <select> 追加选项。 */
  add?: (element: any, before?: any) => any;
  /** <dialog> 打开状态与开关方法。 */
  open?: boolean;
  showModal?: () => void;
  close?: (returnValue?: string) => void;
  /** 文件选择框的已选文件。 */
  files?: any;
  /** select 的选项集合。 */
  options?: any;
  selectedIndex?: number;
  /** form 的具名控件集合。 */
  elements?: any;
  /** 直接赋值的事件处理器：多处面板会 onclick?.() / onchange = ... 直接挂。 */
  onclick?: (...args: any[]) => any;
  oninput?: (...args: any[]) => any;
  onchange?: (...args: any[]) => any;
};
