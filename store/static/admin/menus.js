/**
 * 行操作菜单。
 *
 * 表格行尾「⋯」菜单的开合与定位，表格与功能选择器共用同一份。
 *
 * 行尾「⋯」菜单被表格与功能选择器共用，单独成模块，否则两边会形成循环依赖。
 */

import { $, $$ } from "./dom.js?v=2609251851";

// 行内「⋯」菜单：同一时刻只开一个，点外部 / Esc / 滚动 / 改窗口大小收起；菜单节点留在单元格里（事件委托要收得到点击），弹出层打开时用 fixed + 按钮位置现算坐标，避免被 .table-wrap 的 overflow 裁掉。
export const MENU_GAP = 5;

export const MENU_MARGIN = 8;

// 关掉顶层 popover，且对「本来就没展开」保持静默。
// 两层兜底都要：hidePopover() 对不在顶层的 popover 会抛 InvalidStateError，而
// :popover-open 在不支持 popover 的浏览器里是未知伪类，matches() 一样会抛。
// 两种异常都只表示「没展开」，没有别的语义 —— 与设备控制那几处下拉同一写法。
export function hidePopoverIfOpen(node) {
  try {
    if (node.matches(':popover-open')) node.hidePopover();
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
  // 进顶层再定位，这是上面「fixed + 现算坐标」真正成立的前提：
  // fixed 的包含块只在「祖先没有 transform / filter / backdrop-filter / contain」时才是视口。
  // .table-wrap 与 .hb-card 都为玻璃面挂了 backdrop-filter（admin.css 的 --a-glass-blur），
  // 于是包含块落到表格/卡片自己身上 —— 菜单被 overflow 裁掉、还会跟着 .table-wrap 的内部
  // 滚动上下漂移（滚过的距离整段算进去），表现就是「点了 ⋯ 没反应」。
  // popover 把节点放进顶层：包含块与裁剪都回到视口，而**节点仍留在单元格里**，
  // 各表挂在 <tbody> 上的事件委托照样收得到菜单项的点击。
  // 属性用 manual 而不是 auto：auto 的轻关闭发生在 pointerdown，会比 JS 早一步合上，
  // 与这里自己维护的 hidden / is-open 错位；点外部、Esc、只开一个本来也都由本文件负责。
  if (typeof pop.showPopover === 'function') pop.showPopover();
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
