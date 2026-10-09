/** DOM 元素工厂：前端唯一的「建节点 + 套 class / 文本」口径。 */

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
