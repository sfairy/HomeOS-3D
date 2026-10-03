/**
 * DOM 元素工厂：前端唯一的「建节点 + 套 class / 文本」口径。
 *
 * 背景：十余个 runtime / app 文件各自内联了一份几乎相同的 `document.createElement`
 * 包装，参数顺序（文本在前还是在后）与空值处理（空串写不写进去）各不相同。
 * 这里把「建节点」这一层收成一处，各调用点只保留一行薄适配，显式把 document
 * 传进来，因此不改变任何渲染细节。
 *
 * 约定：
 * - `className` 为 null / undefined 时按空串处理（不会写出字符串 "undefined"）；
 * - `text` 为 null / undefined 时**不**设置 textContent，其余一律写入（空串即清空）。
 */

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export function domElement<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tagName: K,
  className?: string | null,
  text?: string | number | null,
): HTMLElementTagNameMap[K];
export function domElement(
  doc: Document,
  tagName: string,
  className?: string | null,
  text?: string | number | null,
): HTMLElement;
export function domElement(
  doc: Document,
  tagName: string,
  className?: string | null,
  text?: string | number | null,
): HTMLElement {
  const element = doc.createElement(tagName);
  element.className = className ?? "";
  if (text != null) element.textContent = String(text);
  return element;
}

/**
 * SVG 节点工厂：`createElementNS` + 批量 `setAttribute`（可选挂到父节点）。
 *
 * 返回 `any`：SVG 标签名与属性多来自运行时字符串，调用点（flow-line 等）
 * 原本就是宽松推断，收紧成 `SVGElement` 会平白打散这些调用。
 */
export function domSvgNode(
  doc: Document,
  tagName: string,
  attributes: Record<string, unknown> = {},
  parent?: Element | null,
): any {
  const element = doc.createElementNS(SVG_NAMESPACE, tagName);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, String(value));
  }
  parent?.append(element);
  return element;
}
