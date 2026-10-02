/**
 * 行操作菜单。
 */

import { $, $$ } from "./dom.js";
import { placePopover } from "./popover-place.js";

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
  // 右边缘与「⋯」对齐；GAP/MARGIN 夹取算法与功能码选择器共用一份。
  placePopover(pop, toggle);
}

 function openRowMenu(menu: HTMLElement) {
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
