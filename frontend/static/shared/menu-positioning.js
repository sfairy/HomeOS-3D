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
import { clampNumber } from "../utils/numbers.js?v=2609251754";

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

/**
 * 把一个**已经在某处**的浮层面板按实测尺寸夹回可视区，返回解出的左上角坐标。
 *
 * 与 positionFloatingMenu 的分工：那个是「贴着锚点展开」，这个是「面板位置已定（或正被用户
 * 拖着走）、只保证别跑出屏幕」。基础灯光设置面板的「打开时兜一遍」与「拖拽中逐帧夹取」是同一段
 * 算术，原先在两处各写了一遍、都硬编码 8px 边距，这里收敛成一处。
 *
 * 写 left/top 并清掉 right：面板的 CSS 默认靠 right 贴边，两套一起开着会互相拉扯
 * （right 参与计算后 left 就不再是唯一所有者，读到的是被拉伸后的盒子）。
 * 调用方负责传「想落到的位置」——打开时传当前 rect 的左上角，拖拽时传 startLeft + delta。
 */
export function moveFloatingPanelIntoBounds({
  panelElement,
  leftPx,
  topPx,
  marginPx = 8,
  viewportWindow = globalThis.window
}) {
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
 *
 * 三个右键菜单原先各自按常量预留高度（116×82 / 116×108 / 128×84），按钮文案一变长
 * （楼层名换行、菜单项增删）常量就对不上，贴边右键会被切掉一截且不报错。这里改成实测：
 * 调用方先摘掉 hidden，本函数量一次 getBoundingClientRect，再按真实宽高夹进视口 ——
 * 尺寸来源只剩 DOM 一个。
 *
 * 前提：菜单以 `position: fixed` 定位（贴视口坐标，不受滚动容器与祖先定位影响），
 * 且不在 `container-type` / `transform` 的祖先里 —— 那类祖先会成为 fixed 的包含块，
 * 量到的就不是视口坐标了。
 */
export function positionPointMenu({
  menuElement,
  clientX,
  clientY,
  marginPx = 8,
  viewportWindow = globalThis.window
}) {
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
 * 只认 overflow-y 为 auto / scroll / hidden 且高度大于 0 的祖先；找不到返回 null（调用方按视口兜底）。
 */
export function nearestScrollClip(startElement) {
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
 *
 * 为什么不能一律用 positionFloatingMenu：那个把菜单改成贴视口的 fixed 坐标，代价是脱离文档流 ——
 * 不能用在下述两类控件上，否则算出来的位置是错的或看不见：
 *   1. `<dialog>` 内的控件（top layer 里的 fixed 会掉到遮罩之下）；
 *   2. `container-type` / `transform` 祖先内的控件（那类祖先会成为 fixed 的包含块）。
 * 工作室的自定义下拉（.studio-select-menu）正好两类都沾，所以定位继续交给 CSS
 * （absolute + inset），这里只回答两个 CSS 答不出来的问题：**向下还是向上**、**最多多高**。
 *
 * 参照系取传入的裁剪祖先（用 nearestScrollClip 找到的滚动容器）而不是视口：
 * 菜单被谁裁就按谁的可见盒算，否则「下方空间够」的判断会在卡片内部失效。
 */
export function resolveDropPlacement({
  anchorElement,
  menuElement,
  clipElement = null,
  gapPx = 4,
  marginPx = 6,
  minHeightPx = 96,
  viewportWindow = globalThis.window
}) {
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
