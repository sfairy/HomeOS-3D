/** 顶层浮动层定位：默认在锚点下方展开，下方放不下时翻到锚点上方。 */

import { reportBestEffort } from "@store/shared/utils/best-effort";

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
  } catch (error) {
    // `:popover-open` 是不受支持的伪类（老浏览器）会抛语法错 —— 可降级：拿不到就当作没打开。
    reportBestEffort("popover 关闭（浏览器不支持 :popover-open）", error);
  }
}

export function showPopoverIfPossible(node: HTMLElement | null | undefined): void {
  if (!node) return;
  const target = node as HTMLElement & { showPopover?: () => void };
  if (typeof target.showPopover === "function") {
    try {
      target.showPopover();
    } catch (error) {
      // 重复 `showPopover()` 会抛 InvalidStateError。可降级（它本来就已经开着），
      // 但要留痕：真出别的问题时，这里不记日志的话看起来就像「弹层无故不出现」。
      reportBestEffort("popover 打开（可能已处于打开状态）", error);
    }
  }
}
