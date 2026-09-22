/**
 * 浮动菜单（下拉 / 弹层）的统一定位：贴着锚点向下展开，下方放不下就翻到上方。
 *
 * 编辑器里 11 处下拉都是这一套算术，只是阈值不同（间距、高度上下限、列表让出多少像素）——
 * 差异全部保留成调用方传进来的参数，那些数字是各自调出来的手感，不是重复代码。
 * 取高方式：`available` 按锚点上下可用空间取高并钳在 [minHeightPx, maxHeightPx]；
 * `content` 按菜单内容高（scrollHeight）取。内容高度必须在写好 maxHeight 之后才读，
 * 否则量到的是未受限的高度，翻转判断会提前。
 *
 * 视口默认取顶层 window；编辑器被嵌进 iframe 时传 `viewportWindow`，否则算出来的是外层窗口的
 * 尺寸，菜单会跑到屏幕外。
 */
import { clampNumber } from "../utils/numbers.js?v=2609221415";

/**
 * 摆一个浮动菜单，返回解出的几何量（调用方与测试可据此再定位）。
 * 默认值就是「标准图标下拉」那一套（gap 5 / margin 8 / 高度 150~390 / 优先向下 250 /
 * 列表扣 57px 保底 90px），11 处里 5 处都是它；`heightMode: "content"` 需在内容渲染后调用。
 */
export function positionFloatingMenu({
  anchorElement,
  menuElement,
  optionsElement = null,
  gapPx = 5,
  marginPx = 8,
  widthMode = "anchor",
  heightMode = "available",
  minHeightPx = 150,
  maxHeightPx = 390,
  preferBelowPx = 250,
  contentHeightCapPx = 0,
  contentHeightFloorPx = null,
  listTrimPx = 57,
  listMinHeightPx = 90,
  viewportWindow = globalThis.window
}) {
  if (menuElement.hidden) {
    return null;
  }
  const viewportWidthPx = viewportWindow.innerWidth;
  const viewportHeightPx = viewportWindow.innerHeight;
  const anchorRect = anchorElement.getBoundingClientRect();
  // clamped 模式再压一道「不许比视口宽」：锚点本身比视口宽时按视口收。
  const menuWidthPx =
    widthMode === "clamped"
      ? Math.min(anchorRect.width, viewportWidthPx - marginPx * 2)
      : anchorRect.width;
  const menuLeftPx = clampNumber(
    anchorRect.left,
    marginPx,
    Math.max(marginPx, viewportWidthPx - menuWidthPx - marginPx)
  );
  // 列表可用高度只由菜单高度算出，不依赖内容，所以能赶在读 scrollHeight 之前先写。
  const listHeightOf = (menuHeightPx) =>
    Math.max(listMinHeightPx, menuHeightPx - listTrimPx) + "px";

  if (heightMode === "content") {
    const viewportCapPx = Math.min(contentHeightCapPx, viewportHeightPx - marginPx * 2);
    // 自建下拉给「上限本身」还压了一道下限（80px），弹窗实体下拉没有。
    const boxHeightPx =
      contentHeightFloorPx === null ? viewportCapPx : Math.max(contentHeightFloorPx, viewportCapPx);
    menuElement.style.left = menuLeftPx + "px";
    menuElement.style.width = menuWidthPx + "px";
    menuElement.style.maxHeight = boxHeightPx + "px";
    if (optionsElement) {
      optionsElement.style.maxHeight = listHeightOf(boxHeightPx);
    }
    // 量实际内容高（已被 maxHeight 收住）来决定翻转：内容不多时下方空间小也能原样放下。
    const contentHeightPx = Math.min(menuElement.scrollHeight, boxHeightPx);
    const contentOpensBelow =
      anchorRect.bottom + gapPx + contentHeightPx <= viewportHeightPx - marginPx;
    menuElement.style.top = contentOpensBelow
      ? anchorRect.bottom + gapPx + "px"
      : Math.max(marginPx, anchorRect.top - contentHeightPx - gapPx) + "px";
    return {
      menuWidthPx: menuWidthPx,
      menuHeightPx: boxHeightPx,
      menuOffsetHeightPx: contentHeightPx,
      menuLeftPx: menuLeftPx,
      opensBelow: contentOpensBelow
    };
  }

  const spaceBelowPx = viewportHeightPx - anchorRect.bottom - gapPx - marginPx;
  const spaceAbovePx = anchorRect.top - gapPx - marginPx;
  const opensBelow = spaceBelowPx >= preferBelowPx || spaceBelowPx >= spaceAbovePx;
  const boxHeightPx = Math.max(
    minHeightPx,
    Math.min(maxHeightPx, opensBelow ? spaceBelowPx : spaceAbovePx)
  );
  menuElement.style.left = menuLeftPx + "px";
  menuElement.style.width = menuWidthPx + "px";
  menuElement.style.maxHeight = boxHeightPx + "px";
  if (optionsElement) {
    optionsElement.style.maxHeight = listHeightOf(boxHeightPx);
  }
  menuElement.style.top = opensBelow
    ? anchorRect.bottom + gapPx + "px"
    : Math.max(marginPx, anchorRect.top - boxHeightPx - gapPx) + "px";
  return {
    menuWidthPx: menuWidthPx,
    menuHeightPx: boxHeightPx,
    menuOffsetHeightPx: boxHeightPx,
    menuLeftPx: menuLeftPx,
    opensBelow: opensBelow
  };
}
