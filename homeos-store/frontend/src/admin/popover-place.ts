/**
 * 顶层浮动层（行操作「⋯」菜单、功能码选择器）共用的定位算法：
 * 默认在锚点下方展开，下方放不下时翻到锚点上方；纵向、横向再各夹一道视口边距。
 */

export const POPOVER_GAP = 5;
export const POPOVER_MARGIN = 8;

type PopoverSize = {
  width: number;
  height: number;
};

// 锚点矩形 + 弹层实测尺寸 → 夹取后的 top/left。四边判定与夹取顺序由两份调用方共用。
export function clampPopoverPosition(
  anchor: DOMRect,
  size: PopoverSize,
  align: 'left' | 'right' = 'right',
): { top: number; left: number } {
  let top = anchor.bottom + POPOVER_GAP;
  if (top + size.height > window.innerHeight - POPOVER_MARGIN) {
    top = anchor.top - POPOVER_GAP - size.height;
  }
  top = Math.min(
    Math.max(POPOVER_MARGIN, top),
    Math.max(POPOVER_MARGIN, window.innerHeight - POPOVER_MARGIN - size.height),
  );
  // 行菜单右缘与「⋯」对齐；功能码选择器与字段左缘对齐，二者同样夹进视口。
  const baseLeft = align === 'right' ? anchor.right - size.width : anchor.left;
  const left = Math.min(
    Math.max(POPOVER_MARGIN, baseLeft),
    Math.max(POPOVER_MARGIN, window.innerWidth - POPOVER_MARGIN - size.width),
  );
  return { top: Math.round(top), left: Math.round(left) };
}

type PlacePopoverOptions = {
  align?: 'left' | 'right';
  // 量尺寸前的最后一道调整：功能码选择器要先把弹层宽度夹到一档易读宽度。
  prepare?: (pop: HTMLElement) => void;
};

export function placePopover(
  pop: HTMLElement,
  toggle: HTMLElement,
  options: PlacePopoverOptions = {},
): void {
  // 先挪到原点量真实尺寸；此时弹层已经是 fixed / 顶层，量到的就是最终尺寸，不用等下一帧。
  pop.style.top = '0px';
  pop.style.left = '0px';
  options.prepare?.(pop);
  const size = pop.getBoundingClientRect();
  const anchor = toggle.getBoundingClientRect();
  const { top, left } = clampPopoverPosition(anchor, size, options.align ?? 'right');
  pop.style.top = `${top}px`;
  pop.style.left = `${left}px`;
}
