/*
 * DOM 构造与宿主通信。
 */
export function createDomAndHostBridge(ctx) {
  // 建元素小工具：文本一律走 textContent，不拼 HTML，天然免疫转义问题。
  const makeElement = (tagName, className, textContent) => {
    const element = document.createElement(tagName);
    element.className = className || "";
    if (textContent) {
      element.textContent = textContent;
    }
    return element;
  };

  // 统一回传通道：带固定 channel 标识，且只发给同源父窗口，
  const postToHost = outboundMessage =>
    window.parent.postMessage(
      {
        channel: "hb-i3d-v1",
        ...outboundMessage
      },
      location.origin
    );
  return { makeElement, postToHost };
}
