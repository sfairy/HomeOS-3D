/**
 * 编辑器浮层定位（0.8.1 新增 `editor-floating-layout`）。
 *
 * 0.8.0 的浮层定位是「各写一遍」：选择器一套、图片/图标菜单各一套，都是直接读
 * `window.innerWidth / innerHeight` 再 clamp。问题有三个：
 *
 * 1. **弹窗是缩放容器**：浮层挂在 `body` 上，用视口坐标定位却按缩放后的矩形算宽度，
 *    缩放到 0.6 时菜单会偏移半个按钮；
 * 2. **弹窗可能已关闭**：触发器还 `isConnected`，但祖先 `<dialog>` 已经 `close()`，
 *    浮层会飘在页面上不消失；
 * 3. **没有任何可见性守卫**：`[hidden]` / `[inert]` / `display:none` / 后台标签页都不判，
 *    定时器继续跑 rAF。
 *
 * 这里把「可见性判定 + 容器内 clamp + 跟随锚点 + 单例」收成一份。定位计算是纯函数
 * （`floatingVisibilityProblem` / `clampFloatingRect`），单测不需要 DOM 布局。
 */

export interface FloatingRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface FloatingViewport {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface FloatingClampOptions {
  anchorRect: FloatingRect;
  panelWidth: number;
  panelHeight: number;
  viewport: FloatingViewport;
  /** 允许溢出的边界（例如 `.interaction3d-stage`）；缺省用 `viewport`。 */
  container?: FloatingViewport | null;
  gap?: number;
  margin?: number;
  /** 优先向上展开（空间不足时自动翻转）。 */
  preferAbove?: boolean;
}

export interface FloatingPlacement {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  above: boolean;
}

/** 浮层需要透传的颜色变量：弹窗主题把它们定义在容器上，浮层挂到 body 后会丢。 */
export const FLOATING_COLOR_VARIABLES = [
  "--hb-bed-accent",
  "--hb-climate-accent",
  "--hb-climate-accent-soft",
  "--i3d-climate-accent",
] as const;

const FLOATING_COLOR_FALLBACKS: Record<string, string> = {
  "--hb-climate-accent": "#73c8ff",
  "--i3d-climate-accent": "#73c8ff",
};

function intersect(left: FloatingViewport, right: FloatingViewport | null | undefined): FloatingViewport {
  if (!right) return left;
  return {
    left: Math.max(left.left, right.left),
    top: Math.max(left.top, right.top),
    right: Math.min(left.right, right.right),
    bottom: Math.min(left.bottom, right.bottom),
  };
}

/** 视口（含 `visualViewport` 偏移）与可选容器的交集，浮层只允许落在这里面。 */
export function floatingViewport(
  view: (Window & typeof globalThis) | null | undefined,
  containerRect?: FloatingRect | null,
): FloatingViewport {
  const visualViewport = view?.visualViewport,
    left = (visualViewport?.offsetLeft || 0) + 0,
    top = (visualViewport?.offsetTop || 0) + 0,
    right = left + (visualViewport?.width || view?.innerWidth || 1024),
    bottom = top + (visualViewport?.height || view?.innerHeight || 768);
  return intersect(
    { left, top, right, bottom },
    containerRect
      ? { left: containerRect.left, top: containerRect.top, right: containerRect.right, bottom: containerRect.bottom }
      : null,
  );
}

/**
 * 锚点是否还有资格继续显示浮层。返回 `null` 表示可见；否则返回原因（调用方据此关闭）。
 *
 * 纯 DOM 读取，不写样式，便于单测与「先判再算」。
 */
export function floatingVisibilityProblem(
  anchor: HTMLElement | null | undefined,
  ownerDocument: Document = globalThis.document,
): string | null {
  if (!anchor || anchor.isConnected === false) return "detached";
  if (ownerDocument.hidden || ownerDocument.visibilityState === "hidden") return "document-hidden";
  if ((anchor as HTMLButtonElement).disabled) return "disabled";
  if (anchor.getClientRects && !anchor.getClientRects().length) return "no-layout";
  const view = ownerDocument.defaultView;
  const styles = view?.getComputedStyle?.(anchor);
  if (styles && (styles.visibility === "hidden" || styles.display === "none")) return "invisible";
  // 祖先被折叠（`hidden` / `inert` / `aria-hidden`）时浮层不该继续挂着。
  if (anchor.closest?.('[hidden], [inert], [aria-hidden="true"]')) return "ancestor-hidden";
  // 关键：`<dialog>` 关闭后触发器仍在 DOM 里，但弹窗已经不可见。
  const dialogElement = anchor.closest?.("dialog") as HTMLDialogElement | null;
  if (dialogElement && !dialogElement.open) return "dialog-closed";
  return null;
}

/** 计算浮层位置：容器内 clamp + 上下翻转。宽度取锚点宽（`matchAnchorWidth`）或自身宽。 */
export function clampFloatingRect({
  anchorRect,
  panelWidth,
  panelHeight,
  viewport,
  container,
  gap = 4,
  margin = 8,
  preferAbove = false,
}: FloatingClampOptions): FloatingPlacement | null {
  const bounds = intersect(viewport, container);
  if (bounds.right <= bounds.left || bounds.bottom <= bounds.top) return null;
  if (anchorRect.bottom < bounds.top || anchorRect.top > bounds.bottom) return null;

  const width = Math.max(0, Math.min(panelWidth, bounds.right - bounds.left - margin * 2)),
    spaceBelow = bounds.bottom - anchorRect.bottom - gap - margin,
    spaceAbove = anchorRect.top - bounds.top - gap - margin,
    above = preferAbove ? spaceAbove >= spaceBelow : spaceBelow < panelHeight && spaceAbove > spaceBelow,
    available = Math.max(0, above ? spaceAbove : spaceBelow),
    maxHeight = Math.max(0, Math.min(panelHeight, available)),
    left = Math.max(
      bounds.left + margin,
      Math.min(anchorRect.left, bounds.right - margin - width),
    ),
    top = above
      ? Math.max(bounds.top + margin, anchorRect.top - gap - maxHeight)
      : Math.min(anchorRect.bottom + gap, bounds.bottom - margin - maxHeight);
  return { left, top, width, maxHeight, above };
}

/** 从锚点/主题根节点抄一份颜色变量给挂在 body 上的浮层。 */
export function applyFloatingColorVariables(
  panel: HTMLElement,
  anchor: HTMLElement | null | undefined,
  ownerDocument: Document = globalThis.document,
) {
  const view = ownerDocument.defaultView,
    source =
      anchor?.closest?.("[data-scene-style]") ||
      anchor ||
      ownerDocument.documentElement;
  if (!view?.getComputedStyle || !source) return;
  const styles = view.getComputedStyle(source);
  for (const variableName of FLOATING_COLOR_VARIABLES) {
    const value = styles.getPropertyValue(variableName).trim() || FLOATING_COLOR_FALLBACKS[variableName];
    if (value) panel.style.setProperty(variableName, value);
  }
}

/** 锚点不可见时直接把浮层收起；返回 `false` 表示调用方应提前 return。 */
export function hideIfFloatingUnavailable(
  anchor: HTMLElement | null | undefined,
  panel: HTMLElement,
  ownerDocument: Document = anchor?.ownerDocument || globalThis.document,
): boolean {
  if (!floatingVisibilityProblem(anchor, ownerDocument)) return true;
  panel.hidden = true;
  panel.dataset.side = "";
  return false;
}

export interface FloatingMenuOptions {
  anchor: HTMLElement;
  panel: HTMLElement;
  /** 滚动区（`*-options`），按面板可用高度减去表头预留。 */
  optionsElement?: HTMLElement | null;
  optionsReserve?: number;
  optionsMinHeight?: number;
  document?: Document;
  container?: () => HTMLElement | null | undefined;
  matchAnchorWidth?: boolean;
  maxWidth?: number;
  maxHeight?: number;
  gap?: number;
  margin?: number;
  preferAbove?: boolean;
  scaleToAnchor?: boolean;
}

/**
 * 一次性定位（不做 rAF 跟随）：图标/资产/实体菜单每帧由调用方主动调用，
 * 这里只负责「守卫 + 容器内 clamp + 翻转 + 宽度/高度写回」。
 */
export function positionFloatingMenu({
  anchor,
  panel,
  optionsElement,
  optionsReserve = 58,
  optionsMinHeight = 90,
  document: ownerDocument = anchor.ownerDocument || globalThis.document,
  container,
  matchAnchorWidth = true,
  maxWidth,
  maxHeight = 420,
  gap = 5,
  margin = 8,
  preferAbove = false,
  scaleToAnchor = false,
}: FloatingMenuOptions): boolean {
  if (!hideIfFloatingUnavailable(anchor, panel, ownerDocument)) return false;
  const view = ownerDocument.defaultView,
    anchorRect = anchor.getBoundingClientRect(),
    layoutWidth = anchor.offsetWidth || anchorRect.width || 1,
    layoutHeight = anchor.offsetHeight || anchorRect.height || 1,
    scaleX = scaleToAnchor ? anchorRect.width / layoutWidth || 1 : 1,
    scaleY = scaleToAnchor ? anchorRect.height / layoutHeight || 1 : 1,
    placement = clampFloatingRect({
      anchorRect,
      panelWidth: matchAnchorWidth
        ? anchorRect.width
        : panel.offsetWidth || panel.scrollWidth || anchorRect.width,
      panelHeight: maxHeight * scaleY,
      viewport: floatingViewport(view) as FloatingViewport,
      container: container?.()?.getBoundingClientRect() ?? null,
      gap: gap * scaleY,
      margin,
      preferAbove,
    });
  if (!placement) {
    panel.hidden = true;
    return false;
  }
  const width = maxWidth ? Math.min(placement.width, maxWidth) : placement.width;
  panel.style.width = `${width}px`;
  panel.style.maxHeight = `${placement.maxHeight / scaleY}px`;
  panel.style.left = `${placement.left}px`;
  panel.style.top = `${placement.top}px`;
  if (scaleToAnchor) {
    panel.style.transform = `scale(${scaleX},${scaleY})`;
    panel.style.transformOrigin = "0 0";
  }
  panel.dataset.side = placement.above ? "top" : "bottom";
  if (optionsElement) {
    optionsElement.style.maxHeight = `${Math.max(
      optionsMinHeight,
      placement.maxHeight / scaleY - optionsReserve,
    )}px`;
  }
  applyFloatingColorVariables(panel, anchor, ownerDocument);
  return true;
}

export interface FloatingLayoutOptions {
  anchor: HTMLElement;
  panel: HTMLElement;
  document?: Document;
  /** 允许浮层溢出的容器（一般是 `.interaction3d-stage` 或弹窗根节点）。 */
  container?: () => HTMLElement | null | undefined;
  /** 宽度跟锚点一致（菜单类）；否则用 `panel.offsetWidth`。 */
  matchAnchorWidth?: boolean;
  /** 宽度至少不窄于锚点（下拉菜单要覆盖按钮）。 */
  minWidthFromAnchor?: boolean;
  /** 先按内容撑开再量宽度（下拉菜单的选项可能比按钮宽）。 */
  measureContentWidth?: boolean;
  minWidth?: number;
  maxWidth?: number;
  maxHeight?: number;
  gap?: number;
  margin?: number;
  preferAbove?: boolean;
  /** 缩放容器里要为浮层补的 transform 缩放（兼容旧逻辑）。 */
  scaleToAnchor?: boolean;
  /** 抄一份锚点字体（菜单类需要跟按钮一致）。 */
  inheritFont?: boolean;
  /** 定位判定失败（锚点不可见 / 容器关闭）时回调，调用方据此关闭浮层。 */
  onDismiss?: () => void;
}

export interface FloatingLayout {
  /** 重新定位；返回 `false` 表示浮层应该关闭（已触发 `onDismiss`）。 */
  position(): boolean;
  /** 开始跟随锚点（rAF）并登记为当前 document 的唯一浮层。 */
  start(): void;
  stop(): void;
  dispose(): void;
}

interface FloatingRegistry {
  active: FloatingLayout | null;
}

const registryByDocument = new WeakMap<Document, FloatingRegistry>();

function registryFor(ownerDocument: Document): FloatingRegistry {
  let registry = registryByDocument.get(ownerDocument);
  registry || ((registry = { active: null }), registryByDocument.set(ownerDocument, registry));
  return registry;
}

/** 同一个 document 只允许一个浮层展开：开新的会先让旧的 `stop()`。 */
export function claimFloatingLayout(ownerDocument: Document, layout: FloatingLayout) {
  const registry = registryFor(ownerDocument);
  if (registry.active && registry.active !== layout) registry.active.stop();
  registry.active = layout;
}

export function releaseFloatingLayout(ownerDocument: Document, layout: FloatingLayout) {
  const registry = registryFor(ownerDocument);
  if (registry.active === layout) registry.active = null;
}

export function createFloatingLayout({
  anchor,
  panel,
  document: ownerDocument = anchor.ownerDocument || globalThis.document,
  container,
  matchAnchorWidth = false,
  minWidthFromAnchor = false,
  measureContentWidth = false,
  minWidth = 0,
  maxWidth = Infinity,
  maxHeight = 420,
  gap = 4,
  margin = 8,
  preferAbove = false,
  scaleToAnchor = false,
  inheritFont = false,
  onDismiss,
}: FloatingLayoutOptions): FloatingLayout {
  let frameId: number | null = null,
    following = false,
    disposed = false;
  const view = ownerDocument.defaultView;

  const dismiss = () => {
    if (disposed) return;
    stop();
    onDismiss?.();
  };

  function stop() {
    if (frameId !== null) view?.cancelAnimationFrame?.(frameId);
    frameId = null;
    if (following) {
      following = false;
      ownerDocument.removeEventListener?.("visibilitychange", handleVisibilityChange, true);
      releaseFloatingLayout(ownerDocument, layout);
    }
  }

  function handleVisibilityChange() {
    if (ownerDocument.hidden) dismiss();
    else if (following) position();
  }

  function position(): boolean {
    if (disposed) return false;
    if (floatingVisibilityProblem(anchor, ownerDocument)) {
      dismiss();
      return false;
    }
    if (measureContentWidth) panel.style.width = "max-content";
    const anchorRect = anchor.getBoundingClientRect(),
      panelRect = panel.getBoundingClientRect(),
      layoutWidth = anchor.offsetWidth || anchorRect.width || 1,
      layoutHeight = anchor.offsetHeight || anchorRect.height || 1,
      scaleX = scaleToAnchor ? anchorRect.width / layoutWidth || 1 : 1,
      scaleY = scaleToAnchor ? anchorRect.height / layoutHeight || 1 : 1,
      rawWidth = matchAnchorWidth
        ? Math.max(anchorRect.width, minWidth)
        : Math.max(
            panel.scrollWidth || panelRect.width || panel.offsetWidth || minWidth,
            minWidthFromAnchor ? anchorRect.width : minWidth,
            minWidth,
          ),
      desiredWidth = Math.min(Math.max(rawWidth, minWidth), maxWidth),
      panelHeight =
        Math.min(panelRect.height || panel.offsetHeight || maxHeight, maxHeight) * scaleY,
      placement = clampFloatingRect({
        anchorRect,
        panelWidth: desiredWidth,
        panelHeight,
        viewport: floatingViewport(view) as FloatingViewport,
        container: container?.()?.getBoundingClientRect() ?? null,
        gap: gap * scaleY,
        margin,
        preferAbove,
      });
    if (!placement) {
      dismiss();
      return false;
    }
    panel.style.width = `${placement.width}px`;
    panel.style.maxHeight = `${placement.maxHeight / scaleY}px`;
    panel.style.left = `${placement.left}px`;
    panel.style.top = `${placement.top}px`;
    if (scaleToAnchor) {
      panel.style.transform = `scale(${scaleX},${scaleY})`;
      panel.style.transformOrigin = "0 0";
    }
    applyFloatingColorVariables(panel, anchor, ownerDocument);
    if (inheritFont) {
      const anchorStyles = view?.getComputedStyle?.(anchor);
      if (anchorStyles?.font) panel.style.font = anchorStyles.font;
    }
    panel.dataset.side = placement.above ? "top" : "bottom";
    return true;
  }

  function followAnchor() {
    frameId = null;
    if (!following || !position()) return;
    frameId = view?.requestAnimationFrame?.(followAnchor) ?? null;
  }

  const layout: FloatingLayout = {
    position,
    start() {
      if (disposed) return;
      claimFloatingLayout(ownerDocument, layout);
      if (following) return;
      following = true;
      ownerDocument.addEventListener?.("visibilitychange", handleVisibilityChange, true);
      followAnchor();
    },
    stop,
    dispose() {
      (stop(), (disposed = true));
    },
  };
  return layout;
}

/** 缩放空间：`transform` 容器里「视口坐标 ↔ 容器布局坐标」的换算（0.8.1 `editorFloatingSpace`）。 */
export interface FloatingSpace {
  /** 视口坐标 → 容器布局坐标。 */
  point(left: number, top: number): { left: number; top: number };
  /** 视口矩形 → 容器布局矩形。 */
  rect(rect: FloatingRect): FloatingRect;
  scaleX: number;
  scaleY: number;
  bounds: FloatingRect;
}

export interface FloatingSpaceMeasurement {
  originLeft: number;
  originTop: number;
  scaleX: number;
  scaleY: number;
  bounds: FloatingRect;
}

/** 纯换算（无 DOM 读取），供 `editorFloatingSpace` 与单测共用。 */
export function floatingSpaceFrom({
  originLeft,
  originTop,
  scaleX,
  scaleY,
  bounds,
}: FloatingSpaceMeasurement): FloatingSpace {
  const safeScaleX = ratio(scaleX),
    safeScaleY = ratio(scaleY);
  return {
    point: (left, top) => ({
      left: (left - originLeft) / safeScaleX,
      top: (top - originTop) / safeScaleY,
    }),
    rect: (rect) => ({
      left: (rect.left - originLeft) / safeScaleX,
      top: (rect.top - originTop) / safeScaleY,
      right: (rect.right - originLeft) / safeScaleX,
      bottom: (rect.bottom - originTop) / safeScaleY,
      width: rect.width / safeScaleX,
      height: rect.height / safeScaleY,
    }),
    scaleX: safeScaleX,
    scaleY: safeScaleY,
    bounds,
  };
}

function ratio(value: unknown, fallback = 1) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : fallback;
}

/**
 * 找到浮层所在的缩放容器（最近一个有 `transform`/`contain` 的祖先），
 * 把它的可视区换算成视口坐标的边界。
 *
 * 为什么不能直接用 `getBoundingClientRect()`：容器缩放到 0.6 时，锚点矩形
 * 已经是缩放后的尺寸，而菜单是按 CSS 像素（布局像素）排版的，两者差一个
 * `rect.width / offsetWidth`。只有把这个比例和容器原点一起带出来，
 * 菜单才能既不偏移也不变形。
 */
export function editorFloatingSpace(element: HTMLElement): FloatingSpace {
  const ownerDocument = element.ownerDocument || globalThis.document,
    view = ownerDocument.defaultView,
    visualViewport = view?.visualViewport,
    viewportLeft = visualViewport?.offsetLeft || 0,
    viewportTop = visualViewport?.offsetTop || 0,
    viewportWidth = ratio(visualViewport?.width || view?.innerWidth, 1024),
    viewportHeight = ratio(visualViewport?.height || view?.innerHeight, 768);
  let originLeft = 0,
    originTop = 0,
    scaleX = 1,
    scaleY = 1,
    container: (FloatingRect & { clipX: boolean; clipY: boolean }) | null = null;
  for (
    let ancestor = element.parentElement;
    ancestor;
    ancestor = ancestor.parentElement
  ) {
    const styles = view?.getComputedStyle?.(ancestor),
      transformed = [
        styles?.transform,
        styles?.translate,
        styles?.scale,
        styles?.rotate,
        styles?.perspective,
        styles?.filter,
      ].some((value) => value && value !== "none") ||
        /paint|layout|strict|content/.test(styles?.contain || "");
    if (transformed) {
      const rect = ancestor.getBoundingClientRect(),
        ancestorScaleX = ratio(rect.width / ratio(ancestor.offsetWidth), 1),
        ancestorScaleY = ratio(rect.height / ratio(ancestor.offsetHeight), 1);
      ((scaleX = ancestorScaleX),
        (scaleY = ancestorScaleY),
        (originLeft = rect.left + (ancestor.clientLeft - ancestor.scrollLeft) * ancestorScaleX),
        (originTop = rect.top + (ancestor.clientTop - ancestor.scrollTop) * ancestorScaleY),
        (container = {
          left: rect.left + ancestor.clientLeft * ancestorScaleX,
          top: rect.top + ancestor.clientTop * ancestorScaleY,
          right: 0,
          bottom: 0,
          width: ancestor.clientWidth * ancestorScaleX,
          height: ancestor.clientHeight * ancestorScaleY,
          clipX: styles?.overflowX !== "visible",
          clipY: styles?.overflowY !== "visible",
        }));
      break;
    }
    // 顶层（`<dialog>` / popover）之后就不再往外找了：再往外是页面本身。
    if (
      ancestor.matches(":modal") ||
      (typeof (ancestor as HTMLElement & { showPopover?: () => void }).showPopover ===
        "function" &&
        ancestor.matches(":popover-open"))
    )
      break;
  }
  let left = viewportLeft,
    top = viewportTop,
    right = viewportLeft + viewportWidth,
    bottom = viewportTop + viewportHeight;
  if (container?.clipX) {
    left = Math.max(left, container.left);
    right = Math.min(right, container.left + container.width);
  }
  if (container?.clipY) {
    top = Math.max(top, container.top);
    bottom = Math.min(bottom, container.top + container.height);
  }
  return floatingSpaceFrom({
    originLeft,
    originTop,
    scaleX,
    scaleY,
    bounds: { left, top, right, bottom, width: right - left, height: bottom - top },
  });
}

export interface ScaledPopupPlacementInput {
  anchorRect: FloatingRect;
  bounds: FloatingViewport;
  /** 锚点的视觉缩放（`rect.width / offsetWidth`）。 */
  scaleX?: number;
  scaleY?: number;
  minWidth?: number;
  maxHeight?: number;
  /** 菜单内容高度（布局像素，未缩放）。 */
  menuHeight?: number;
  margin?: number;
  gap?: number;
}

export interface ScaledPopupPlacement {
  left: number;
  top: number;
  /** 布局宽度（写进 `style.width`，视觉宽度 = width × scaleX）。 */
  width: number;
  /** 布局最大高度（写进 `style.maxHeight`）。 */
  maxHeight: number;
  above: boolean;
}

/**
 * 缩放下拉菜单的定位（0.8.1 `createScaledPopupMenu` 的几何部分，纯函数）。
 *
 * 与 `clampFloatingRect` 的区别：这里的输入输出都是**布局像素**，`bounds`
 * 与 `anchorRect` 是视口坐标，`scaleX/scaleY` 把两者换算一遍。缩放容器里
 * 直接用 `clampFloatingRect` 会把菜单排成「锚点视觉宽」再被 CSS 缩放一次，
 * 结果是 0.6 倍弹窗里菜单只有 0.36 倍宽。
 */
export function scaledPopupPlacement({
  anchorRect,
  bounds,
  scaleX = 1,
  scaleY = 1,
  minWidth = 1,
  maxHeight = 320,
  menuHeight = 0,
  margin = 10,
  gap = 5,
}: ScaledPopupPlacementInput): ScaledPopupPlacement | null {
  const safeScaleX = ratio(scaleX),
    safeScaleY = ratio(scaleY),
    marginX = Math.min(margin * safeScaleX, (bounds.right - bounds.left) / 4),
    marginY = Math.min(margin * safeScaleY, (bounds.bottom - bounds.top) / 4),
    left = bounds.left + marginX,
    top = bounds.top + marginY,
    right = bounds.right - marginX,
    bottom = bounds.bottom - marginY;
  if (right <= left || bottom <= top) return null;
  if (
    anchorRect.bottom < top ||
    anchorRect.top > bottom ||
    anchorRect.right < left ||
    anchorRect.left > right
  )
    return null;
  const width = Math.min(
      Math.max(anchorRect.width / safeScaleX, minWidth),
      (right - left) / safeScaleX,
    ),
    scaledMenuHeight = Math.min(maxHeight, Math.max(0, menuHeight)) * safeScaleY,
    spaceBelow = Math.max(0, bottom - anchorRect.bottom - gap * safeScaleY),
    spaceAbove = Math.max(0, anchorRect.top - top - gap * safeScaleY),
    above = spaceBelow < scaledMenuHeight && spaceAbove > spaceBelow,
    available = Math.min(bottom - top, above ? spaceAbove : spaceBelow),
    height = Math.min(scaledMenuHeight, available),
    placementLeft = Math.max(left, Math.min(anchorRect.left, right - width * safeScaleX)),
    placementTop = Math.max(
      top,
      Math.min(
        above ? anchorRect.top - gap * safeScaleY - height : anchorRect.bottom + gap * safeScaleY,
        bottom - height,
      ),
    );
  return {
    left: placementLeft,
    top: placementTop,
    width,
    maxHeight: Math.min(maxHeight, available / safeScaleY),
    above,
  };
}

export interface ScaledPopupMenuOptions {
  minWidth?: number;
  maxHeight?: number;
  margin?: number;
  gap?: number;
}

/**
 * 把缩放容器里的下拉菜单摆到锚点旁边并补上缩放（0.8.1 `createScaledPopupMenu`）。
 *
 * 返回 `false` 表示锚点已不可见（弹窗关闭 / 后台标签页 / 脱离 DOM），
 * 调用方应把浮层收起。
 */
export function positionScaledPopupMenu(
  anchor: HTMLElement,
  panel: HTMLElement,
  { minWidth = 1, maxHeight = 320, margin = 10, gap = 5 }: ScaledPopupMenuOptions = {},
): boolean {
  if (!hideIfFloatingUnavailable(anchor, panel)) return false;
  const ownerDocument = anchor.ownerDocument || globalThis.document,
    view = ownerDocument.defaultView,
    anchorRect = anchor.getBoundingClientRect(),
    anchorScaleX = ratio(anchorRect.width / ratio(anchor.offsetWidth), 1),
    anchorScaleY = ratio(anchorRect.height / ratio(anchor.offsetHeight), 1),
    inTopLayer =
      typeof (panel as HTMLElement & { showPopover?: () => void }).showPopover === "function" &&
      panel.matches(":popover-open"),
    space = inTopLayer ? null : editorFloatingSpace(panel),
    placement = scaledPopupPlacement({
      anchorRect,
      bounds: space?.bounds ?? (floatingViewport(view) as FloatingRect),
      scaleX: anchorScaleX,
      scaleY: anchorScaleY,
      minWidth,
      maxHeight,
      menuHeight:
        panel.scrollHeight + Math.max(0, panel.offsetHeight - panel.clientHeight),
      margin,
      gap,
    });
  if (!placement) {
    panel.hidden = true;
    panel.dataset.side = "";
    return false;
  }
  const point = space ? space.point(placement.left, placement.top) : placement;
  panel.style.width = `${placement.width}px`;
  panel.style.minWidth = "0";
  panel.style.maxHeight = `${placement.maxHeight}px`;
  panel.style.transform = `scale(${anchorScaleX / (space?.scaleX || 1)},${anchorScaleY / (space?.scaleY || 1)})`;
  panel.style.transformOrigin = "0 0";
  panel.style.left = `${point.left}px`;
  panel.style.top = `${point.top}px`;
  panel.dataset.side = placement.above ? "top" : "bottom";
  applyFloatingColorVariables(panel, anchor, ownerDocument);
  return true;
}
