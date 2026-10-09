/** SVG 元素工厂：编辑器侧统一的 createElementNS + 批量 setAttribute（可选挂到父节点）。 */

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/**
 * 创建 SVG 节点并可选挂到父节点。
 *
 * 签名对齐编辑器本地工厂：`(tagName, attributes, parent?)`。
 * 渲染注册表里的「父节点优先」变体仍留在 registry/_shared.ts。
 */
export function createSvgElement(
  tagName: string,
  attributes: Record<string, unknown> = {},
  parent?: Element | DocumentFragment | null,
  doc: Document = document,
): any {
  const element = doc.createElementNS(SVG_NAMESPACE, tagName);
  for (const [name, value] of Object.entries(attributes || {})) {
    element.setAttribute(name, String(value));
  }
  parent?.append(element);
  return element;
}
