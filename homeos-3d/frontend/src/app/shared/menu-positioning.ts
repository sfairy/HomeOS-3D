/**
 * 浮动菜单（下拉 / 弹层）的统一定位：贴着锚点向下展开，下方放不下就翻到上方。
 */

type AnyObj = Record<string, any>;
import { clampNumber } from "../utils/numbers.js";

/**
 * 摆一个浮动菜单，返回解出的几何量（调用方与测试可据此再定位）。
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
}: AnyObj) {
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
  const listHeightOf = (menuHeightPx: any) =>
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

/**
 * 把一个**已经在某处**的浮层面板按实测尺寸夹回可视区，返回解出的左上角坐标。
 */
export function moveFloatingPanelIntoBounds({
  panelElement,
  leftPx,
  topPx,
  marginPx = 8,
  viewportWindow = globalThis.window
}: AnyObj) {
  const panelRect = panelElement.getBoundingClientRect();
  const maxLeftPx = Math.max(marginPx, viewportWindow.innerWidth - panelRect.width - marginPx);
  const maxTopPx = Math.max(marginPx, viewportWindow.innerHeight - panelRect.height - marginPx);
  const nextLeftPx = clampNumber(leftPx, marginPx, maxLeftPx);
  const nextTopPx = clampNumber(topPx, marginPx, maxTopPx);
  panelElement.style.right = "auto";
  panelElement.style.left = nextLeftPx + "px";
  panelElement.style.top = nextTopPx + "px";
  return { leftPx: nextLeftPx, topPx: nextTopPx, widthPx: panelRect.width, heightPx: panelRect.height };
}

/**
 * 摆一个「跟着鼠标点弹出」的菜单（右键菜单那一类），返回解出的几何量。
 */
export function positionPointMenu({
  menuElement,
  clientX,
  clientY,
  marginPx = 8,
  viewportWindow = globalThis.window
}: AnyObj) {
  if (menuElement.hidden) {
    return null;
  }
  const menuRect = menuElement.getBoundingClientRect();
  const maxLeftPx = Math.max(marginPx, viewportWindow.innerWidth - menuRect.width - marginPx);
  const maxTopPx = Math.max(marginPx, viewportWindow.innerHeight - menuRect.height - marginPx);
  const menuLeftPx = clampNumber(clientX, marginPx, maxLeftPx);
  const menuTopPx = clampNumber(clientY, marginPx, maxTopPx);
  menuElement.style.left = menuLeftPx + "px";
  menuElement.style.top = menuTopPx + "px";
  return {
    menuWidthPx: menuRect.width,
    menuHeightPx: menuRect.height,
    menuLeftPx: menuLeftPx,
    menuTopPx: menuTopPx
  };
}

/**
 * 向上找最近的「会裁剪的滚动容器」：菜单被谁裁，就该按谁的可见盒算可用空间。
 */
export function nearestScrollClip(startElement: any) {
  for (let node = startElement?.parentElement; node; node = node.parentElement) {
    const overflowY = getComputedStyle(node).overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "hidden") &&
      node.clientHeight > 0
    ) {
      return node;
    }
  }
  return null;
}

/**
 * 给**留在文档流里**的下拉算展开方向与可用高度（不写 left/top）。
 */
export function resolveDropPlacement({
  anchorElement,
  menuElement,
  clipElement = null,
  gapPx = 4,
  marginPx = 6,
  minHeightPx = 96,
  viewportWindow = globalThis.window
}: AnyObj) {
  const anchorRect = anchorElement.getBoundingClientRect();
  const clipRect = clipElement?.getBoundingClientRect();
  const clipTopPx = clipRect ? clipRect.top : 0;
  const clipBottomPx = clipRect ? clipRect.bottom : viewportWindow.innerHeight;
  // scrollHeight 读到的是「内容想要多高」，不受 max-height 限制，正好用来判断要不要翻转。
  const naturalHeightPx = menuElement.scrollHeight;
  // CSS 里写死的 max-height（工作室是 240px）是这套下拉的尺寸上限，JS 只能往下压、不能往上抬。
  const cssMaxHeightPx = Number.parseFloat(viewportWindow.getComputedStyle(menuElement).maxHeight);
  const wantedHeightPx =
    Number.isFinite(cssMaxHeightPx) && cssMaxHeightPx > 0
      ? Math.min(naturalHeightPx, cssMaxHeightPx)
      : naturalHeightPx;
  const spaceBelowPx = clipBottomPx - anchorRect.bottom - gapPx - marginPx;
  const spaceAbovePx = anchorRect.top - clipTopPx - gapPx - marginPx;
  // 下方放不下整份内容、且上方更宽松时才翻上去：上方同样放不下就维持向下（跟着输入焦点看更自然）。
  const opensUp = spaceBelowPx < wantedHeightPx && spaceAbovePx > spaceBelowPx;
  const availableSpacePx = opensUp ? spaceAbovePx : spaceBelowPx;
  return {
    opensUp: opensUp,
    // 再糟也要给一个能滚的最小高度：宁可略微越过裁剪边界，也不要变成一条看不清的缝。
    maxHeightPx: Math.max(minHeightPx, Math.min(wantedHeightPx, availableSpacePx)),
    spaceBelowPx: spaceBelowPx,
    spaceAbovePx: spaceAbovePx
  };
}
