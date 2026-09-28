/**
 * DOM 工厂：面板、编辑器、弹窗都在造同样的三样东西（带类名/文本的元素、普通按钮、SVG 元素），
 */


/**
 * 造一套挂在某个文档上的 DOM 工厂。
 * @param ownerDocument 目标文档；省略时退回全局 `document`（仅在确定不会被嵌进别的文档时才可以）。
 * @returns {{ el: Function, button: Function, svg: Function, replaceChildren: Function }}
 */
export function createDomFactory(ownerDocument: any) {
  const targetDocument = ownerDocument || globalThis.document;

  /**
   * 造一个元素并设置类名与文本。默认值都是空串：新元素本来就是空的，`className = ""` 与
   */
  const el = (tagName: any, className: any = "", textContent: any = "") => {
    const element = targetDocument.createElement(tagName);
    element.className = className;
    element.textContent = textContent;
    return element;
  };

  /**
   * 造一个普通按钮（`type="button"` 已写死，见模块头第 3 条）并挂点击回调。
   */
  const button = (label: any, onClick: any) => {
    const buttonElement = el("button", "", label);
    buttonElement.type = "button";
    buttonElement.addEventListener("click", onClick);
    return buttonElement;
  };

  const svg = (tagName: any, attributes: any = {}, parentElement: any = null) => {
    const svgElement = targetDocument.createElementNS(
      "http://www.w3.org/2000/svg",
      tagName
    );
    for (const [attributeName, attributeValue] of Object.entries(attributes)) {
      svgElement.setAttribute(attributeName, String(attributeValue));
    }
    if (parentElement) {
      parentElement.append(svgElement);
    }
    return svgElement;
  };

  /**
   * 清空容器并填入新子节点。
   */
  const replaceChildren = (containerElement: any, ...childNodes: any[]) => {
    if (typeof containerElement.replaceChildren == "function") {
      containerElement.replaceChildren(...childNodes);
    } else {
      for (const child of [...(containerElement.children || [])]) {
        child.remove?.();
      }
      containerElement.append(...childNodes);
    }
  };

  return { el, button, svg, replaceChildren };
}
