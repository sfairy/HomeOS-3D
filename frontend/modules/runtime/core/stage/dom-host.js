/*
 * DOM 构造与宿主通信。
 *
 * 舞台内的元素工厂与发往宿主窗口的单向消息出口。
 *
 * 由 core/stage.js 的 mountStage 外提而来：这里只放函数，对外部状态与兄弟函数的读写一律经
 * ctx —— ctx 的每一项都是 stage.js 里的 getter/setter，读到的始终是调用时刻的值。
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
  // 避免被其它嵌入页面或跨源窗口收到。
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
