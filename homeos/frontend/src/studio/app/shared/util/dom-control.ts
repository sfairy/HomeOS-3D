/** 页面脚本里的「控件节点」。 */
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
