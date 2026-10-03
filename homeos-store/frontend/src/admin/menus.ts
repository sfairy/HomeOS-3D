/** 行操作菜单。 */

import { $, $$ } from "./dom.js";
import { placePopover } from "./popover-place.js";

type PopoverElement = HTMLElement & {
  showPopover?: () => void;
  hidePopover?: () => void;
  matches: (selectors: string) => boolean;
};


export function hidePopoverIfOpen(node: PopoverElement | HTMLElement | null | undefined) {
  if (!node) return;
  try {
    if (node.matches(':popover-open')) (node as PopoverElement).hidePopover?.();
  } catch {  }
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

  placePopover(pop, toggle);
}

 function openRowMenu(menu: HTMLElement) {
  const pop = $('.menu__pop', menu) as PopoverElement | null;
  if (!pop) return;
  closeRowMenus();
  pop.hidden = false;
  menu.classList.add('is-open');

  if (typeof pop.showPopover === 'function') pop.showPopover();
  placeRowMenu(menu);
}


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


adminMain?.addEventListener('scroll', closeRowMenus, { passive: true, capture: true });

window.addEventListener('resize', closeRowMenus, { passive: true });
