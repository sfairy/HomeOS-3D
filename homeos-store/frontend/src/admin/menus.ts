/**
 * 行操作菜单。
 */

import { $, $$ } from "./dom.js";

export const MENU_GAP = 5;

export const MENU_MARGIN = 8;

type PopoverElement = HTMLElement & {
  showPopover?: () => void;
  hidePopover?: () => void;
  matches: (selectors: string) => boolean;
};

// 关掉顶层 popover，且对「本来就没展开」保持静默。
export function hidePopoverIfOpen(node: PopoverElement | HTMLElement | null | undefined) {
  if (!node) return;
  try {
    if (node.matches(':popover-open')) (node as PopoverElement).hidePopover?.();
  } catch { /* 没展开，或这个浏览器没有 popover */ }
}

export function closeRowMenus() {
  $$('.menu.is-open').forEach((menu) => {
    menu.classList.remove('is-open');
    const pop = $('.menu__pop', menu);
    if (!pop) return;
    hidePopoverIfOpen(pop);
    pop.hidden = true;
  });
}

function placeRowMenu(menu: HTMLElement) {
  const pop = $('.menu__pop', menu);
  const toggle = $('[data-menu-toggle]', menu);
  if (!pop || !toggle) return;
  // 先挪到原点量真实尺寸；此时已经是 fixed，量到的就是最终尺寸，不用等下一帧
  pop.style.top = '0px';
  pop.style.left = '0px';
  const size = pop.getBoundingClientRect();
  const anchor = toggle.getBoundingClientRect();
  let top = anchor.bottom + MENU_GAP;
  if (top + size.height > window.innerHeight - MENU_MARGIN) {
    top = anchor.top - MENU_GAP - size.height;
  }
  top = Math.min(
    Math.max(MENU_MARGIN, top),
    Math.max(MENU_MARGIN, window.innerHeight - MENU_MARGIN - size.height),
  );
  // 右边缘与「⋯」对齐，同样夹进视口
  const left = Math.min(
    Math.max(MENU_MARGIN, anchor.right - size.width),
    Math.max(MENU_MARGIN, window.innerWidth - MENU_MARGIN - size.width),
  );
  pop.style.top = `${Math.round(top)}px`;
  pop.style.left = `${Math.round(left)}px`;
}

export function openRowMenu(menu: HTMLElement) {
  const pop = $('.menu__pop', menu) as PopoverElement | null;
  if (!pop) return;
  closeRowMenus();
  pop.hidden = false;
  menu.classList.add('is-open');
  // 进顶层再定位，这是上面「fixed + 现算坐标」真正成立的前提：
  if (typeof pop.showPopover === 'function') pop.showPopover();
  placeRowMenu(menu);
}

// 挂在 .admin-main 上：菜单项点击仍会先冒泡到各表的委托处理（层级更深），
const adminMain = $('.admin-main');
adminMain?.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const toggle = target.closest('[data-menu-toggle]');
  if (toggle) {
    const menu = toggle.closest('.menu') as HTMLElement | null;
    if (!menu) return;
    const wasOpen = menu.classList.contains('is-open');
    closeRowMenus();
    if (!wasOpen) openRowMenu(menu);
    return;
  }
  closeRowMenus();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeRowMenus();
});

// 用捕获阶段监听：菜单坐标是按按钮位置算死的，任何祖先滚动都会让它错位，而 scroll
adminMain?.addEventListener('scroll', closeRowMenus, { passive: true, capture: true });

window.addEventListener('resize', closeRowMenus, { passive: true });
