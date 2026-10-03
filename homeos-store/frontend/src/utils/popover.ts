/** 顶层浮动层定位：默认在锚点下方展开，下方放不下时翻到锚点上方。 */

const POPOVER_GAP = 5;
const POPOVER_MARGIN = 8;

interface PopoverSize {
  width: number;
  height: number;
}

function clampPopoverPosition(
  anchor: DOMRect,
  size: PopoverSize,
  align: "left" | "right" = "right",
): { top: number; left: number } {
  let top = anchor.bottom + POPOVER_GAP;
  if (top + size.height > window.innerHeight - POPOVER_MARGIN) {
    top = anchor.top - POPOVER_GAP - size.height;
  }
  top = Math.min(
    Math.max(POPOVER_MARGIN, top),
    Math.max(POPOVER_MARGIN, window.innerHeight - POPOVER_MARGIN - size.height),
  );

  const baseLeft = align === "right" ? anchor.right - size.width : anchor.left;
  const left = Math.min(
    Math.max(POPOVER_MARGIN, baseLeft),
    Math.max(POPOVER_MARGIN, window.innerWidth - POPOVER_MARGIN - size.width),
  );
  return { top: Math.round(top), left: Math.round(left) };
}

interface PlacePopoverOptions {
  align?: "left" | "right";
  prepare?: (pop: HTMLElement) => void;
}

export function placePopover(
  pop: HTMLElement,
  toggle: HTMLElement,
  options: PlacePopoverOptions = {},
): void {
  pop.style.top = "0px";
  pop.style.left = "0px";
  options.prepare?.(pop);
  const size = pop.getBoundingClientRect();
  const anchor = toggle.getBoundingClientRect();
  const { top, left } = clampPopoverPosition(anchor, size, options.align ?? "right");
  pop.style.top = `${top}px`;
  pop.style.left = `${left}px`;
}

export function hidePopoverIfOpen(node: HTMLElement | null | undefined): void {
  if (!node) return;
  try {
    if (node.matches(":popover-open")) {
      (node as HTMLElement & { hidePopover?: () => void }).hidePopover?.();
    }
  } catch {
    /* 不支持 popover 的浏览器：忽略 */
  }
}

export function showPopoverIfPossible(node: HTMLElement | null | undefined): void {
  if (!node) return;
  const target = node as HTMLElement & { showPopover?: () => void };
  if (typeof target.showPopover === "function") {
    try {
      target.showPopover();
    } catch {
      /* 已经打开时忽略 */
    }
  }
}
