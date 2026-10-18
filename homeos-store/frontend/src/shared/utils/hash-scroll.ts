/** 锚点滚动：把 sticky 顶栏占的高度让出来。 */

/**
 * 目标元素自己声明的 `scroll-margin-top`。
 *
 * 首页区块用 `calc(var(--hb-topbar-h) + 20px)` 声明这段留白。原生锚点会遵守它，
 * 但 vue-router 的 `{ el }` 定位与 `window.scrollTo` 不会 —— 两边都要主动减掉。
 */
export function hashScrollOffset(target: Element): number {
  return Number.parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
}

/**
 * 滚动到当前 hash 对应的区块。
 *
 * 供「异步内容撑开布局之后需要重新对齐」的场景调用（例如首页服务状态条晚于路由
 * 渲染）。返回是否找到了目标元素，调用方不需要自己处理空 hash。
 */
export function scrollToHash(hash: string, behavior: ScrollBehavior = "smooth"): boolean {
  if (!hash) return false;
  const target = document.querySelector(hash);
  if (!target) return false;
  const top = target.getBoundingClientRect().top + window.scrollY - hashScrollOffset(target);
  window.scrollTo({ top, behavior });
  return true;
}
