/**
 * 行操作菜单。
 *
 * 表格行尾「⋯」菜单的开合与定位，表格与功能选择器共用同一份。
 *
 * 行尾「⋯」菜单被表格与功能选择器共用，单独成模块，否则两边会形成循环依赖。
 */

import { $, $$ } from "./dom.js?v=2609221451";

// 行内「⋯」菜单：同一时刻只开一个，点外部 / Esc / 滚动 / 改窗口大小收起；菜单节点留在单元格里（事件委托要收得到点击），弹出层打开时用 fixed + 按钮位置现算坐标，避免被 .table-wrap 的 overflow 裁掉。
export const MENU_GAP = 5;

export const MENU_MARGIN = 8;

export function closeRowMenus() {
  $$('.menu.is-open').forEach((menu) => {
    menu.classList.remove('is-open');
    const pop = $('.menu__pop', menu);
    if (pop) pop.hidden = true;
  });
}

function placeRowMenu(menu) {
  const pop = $('.menu__pop', menu);
  const toggle = $('[data-menu-toggle]', menu);
  if (!toggle) return;
  // 先挪到原点量真实尺寸；此时已经是 fixed，量到的就是最终尺寸，不用等下一帧
  pop.style.top = '0px';
  pop.style.left = '0px';
  const size = pop.getBoundingClientRect();
  const anchor = toggle.getBoundingClientRect();
  // 默认向下弹，下方放不下就翻到按钮上方；末尾再整体夹进视口，因为按钮自身可能就贴着
  // 视口边（例如在视口外半格），翻上去也仍然越界；菜单比视口还高时至少保住顶部。
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

export function openRowMenu(menu) {
  const pop = $('.menu__pop', menu);
  if (!pop) return;
  closeRowMenus();
  pop.hidden = false;
  menu.classList.add('is-open');
  placeRowMenu(menu);
}

// 挂在 .admin-main 上：菜单项点击仍会先冒泡到各表的委托处理（层级更深），
// 处理完再冒泡到这里收起菜单。
$('.admin-main').addEventListener('click', (event) => {
  const toggle = event.target.closest('[data-menu-toggle]');
  if (toggle) {
    const menu = toggle.closest('.menu');
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
// 不冒泡——窄屏下 .table-wrap 自己会横滚，那些 scroll 事件只有捕获阶段才经过这里。
$('.admin-main').addEventListener('scroll', closeRowMenus, { passive: true, capture: true });

window.addEventListener('resize', closeRowMenus, { passive: true });
