/**
 * 组件封面（cover）与授权提示文案。
 *
 * 位置：当 3D 交互组件未授权或未购买时，设计器 / 仪表盘用这里生成的 DOM 覆盖在组件之上，
 *   把交互挡在外面，因此它同时承担「占位」与「门禁提示」两个职责。
 * 对外导出：updateInteraction3dCoverMessage、createInteraction3dCover。
 * 全局约定：提示文案由前端写死（“请移步商店购买3D交互包”“购买后请重启本项目”），
 *   元素 class 名 `interaction3d-cover-*` 与样式表 interaction3d 的 CSS 约定死，改名会同时失效。
 * 副作用：只创建脱离文档的 DOM 节点，是否插入由调用方决定。
 */

// 默认两行提示：第一行指向购买入口，第二行说明购买后的生效方式。
const DEFAULT_COVER_MESSAGES = [
  "请移步商店购买3D交互包",
  "购买后请重启本项目"
];
/**
 * 替换封面上已有的提示文案。
 *
 * 用于授权状态变化（例如刚完成购买校验）后原地刷新文案，
 * 而不必重建整块封面 —— 重建会丢掉封面元素上的过渡动画与已有引用。
 */
export function updateInteraction3dCoverMessage(
  coverTitleElement,
  messages = DEFAULT_COVER_MESSAGES
) {
  const messageElement = coverTitleElement?.querySelector?.(".interaction3d-cover-message");
  // 用 replaceChildren 整体换掉，而不是逐个 remove / append，避免中间出现空窗帧。
  messageElement &&
    messageElement.replaceChildren(
      ...messages.map(messageText => {
        const messageSpanElement = document.createElement("span");
        return ((messageSpanElement.textContent = messageText), messageSpanElement);
      })
    );
}
/**
 * 创建一块 3D 组件封面。
 *
 * @param {boolean} [options.showTitle] 是否显示标题（含锁图标与购买提示），默认 true；
 *   预览缩略图场景会传 false，只保留底图。
 */
export function createInteraction3dCover({ showTitle: isTitleVisible = !0 } = {}) {
  const coverElement = document.createElement("span");
  coverElement.className = "interaction3d-cover";
  const coverImageElement = document.createElement("img");
  // 缩略图 URL 上的版本戳与后端静态资源缓存戳机制一致；
  // 换图后必须同步改这里，否则浏览器会一直吃旧缓存。
  ((coverImageElement.src =
    "/static/component-thumbnails/interaction3d.png?v=20260920101628"),
    (coverImageElement.alt = ""),
    (coverImageElement.decoding = "async"));
  const titleElement = document.createElement("span");
  titleElement.className = "interaction3d-cover-title";
  const lockIconElement = document.createElement("span");
  // 锁图标纯装饰，对读屏器隐藏（aria-hidden）；「需要购买」的语义由标题文案承担。
  ((lockIconElement.className = "interaction3d-cover-lock"),
    lockIconElement.setAttribute("aria-hidden", "true"));
  const messageContainerElement = document.createElement("span");
  messageContainerElement.className = "interaction3d-cover-message";
  // 初始文案一次性建好，后续 updateInteraction3dCoverMessage 只替换这一层的内容。
  for (const coverMessageText of DEFAULT_COVER_MESSAGES) {
    const textSpanElement = document.createElement("span");
    ((textSpanElement.textContent = coverMessageText),
      messageContainerElement.append(textSpanElement));
  }
  // 逗号表达式的值是最后一个操作数，因而返回的就是 coverElement 本身。
  return (
    titleElement.append(lockIconElement, messageContainerElement),
    (titleElement.hidden = !isTitleVisible),
    coverElement.append(coverImageElement, titleElement),
    coverElement
  );
}
