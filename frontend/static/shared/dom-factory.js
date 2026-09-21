/**
 * DOM 工厂：面板、编辑器、弹窗都在造同样的三样东西（带类名/文本的元素、普通按钮、SVG 元素），
 * 此前每个文件各抄一份，抄歪的代价是静默的 —— 元素造出来了、只是行为和别处不一样。
 *
 * 契约（四个方法，名字即契约）：
 *   `el(tagName, className, textContent)`      文本一律 `textContent`，不拼 HTML。
 *   `button(label, onClick)`                   一律 `type="button"`。
 *   `svg(tagName, attributes, parentElement)`  `createElementNS` + `setAttribute`；
 *                                             给了 `parentElement` 就顺手 append。
 *   `replaceChildren(container, ...children)`  原生方法缺失时的手动兜底。
 *
 * 三处必须集中的易错点：
 *   1. 用**宿主元素的 `ownerDocument`** 造节点：面板会被放进弹窗 / 预览 iframe 的另一份文档，
 *      用全局 `document` 造出来的节点属于外部文档，append 时要么静默无效、要么抛
 *      "not a child of this node"。因此工厂必须由调用方传入 `ownerDocument`（默认全局 document）。
 *   2. 文本一律走 `textContent`：设备名、路线名、公告都是用户输入，拼 HTML 就是注入。
 *   3. 按钮一律显式 `type="button"`：`<dialog>` 里的按钮不写 type 默认按 submit 处理，
 *      回车键就会误触发第一个按钮。
 *
 * 为什么在 `static/shared/`：显示路径（气候 / 窗帘 / NAS / 电视面板）与编辑器路径都要用，
 * 两边分别经 `modules/runtime/core/static-helpers.js` 与 `static-helpers-editor.js` 取用。
 */

/**
 * 造一套挂在某个文档上的 DOM 工厂。
 *
 * @param ownerDocument 目标文档；省略时退回全局 `document`（仅在确定不会被嵌进别的文档时才可以）。
 * @returns {{ el: Function, button: Function, svg: Function, replaceChildren: Function }}
 */
export function createDomFactory(ownerDocument) {
  const targetDocument = ownerDocument || globalThis.document;

  /**
   * 造一个元素并设置类名与文本。默认值都是空串：新元素本来就是空的，`className = ""` 与
   * `textContent = ""` 都是无操作，因此调用方可以只传关心的那一个。
   */
  const el = (tagName, className = "", textContent = "") => {
    const element = targetDocument.createElement(tagName);
    element.className = className;
    element.textContent = textContent;
    return element;
  };

  /**
   * 造一个普通按钮（`type="button"` 已写死，见模块头第 3 条）并挂点击回调。
   */
  const button = (label, onClick) => {
    const buttonElement = el("button", "", label);
    buttonElement.type = "button";
    buttonElement.addEventListener("click", onClick);
    return buttonElement;
  };

  /**
   * 造一个 SVG 元素并批量设置属性。SVG 必须走 `createElementNS`（普通 `createElement` 拿到的是
   * HTML 元素，画不出来且不报错），属性只能用 `setAttribute`（不是所有 SVG 属性都有同名 property）。
   */
  const svg = (tagName, attributes = {}, parentElement = null) => {
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
   *
   * 优先用原生 `replaceChildren`；部分嵌入式 WebView 没实现它，因此保留手动兜底分支
   * （按 `children` 逐个 remove 再 append）。兜底分支不处理文本子节点 —— 调用点传的一律是元素。
   */
  const replaceChildren = (containerElement, ...childNodes) => {
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
