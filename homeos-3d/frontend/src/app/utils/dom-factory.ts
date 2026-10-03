/** DOM 元素工厂：前端唯一的「建节点 + 套 class / 文本」口径。 */

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

/** SVG 节点工厂：`createElementNS` + 批量 `setAttribute`（可选挂到父节点）。 */
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
