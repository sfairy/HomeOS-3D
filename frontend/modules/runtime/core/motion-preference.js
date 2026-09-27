/**
 * 系统「减少动态效果」偏好的唯一判定。
 */
const REDUCED_MOTION_MEDIA_QUERY = "(prefers-reduced-motion: reduce)";

/** 按上面的双查规则取媒体查询对象；两边都没有（注入环境）时返回 undefined。 */
function reducedMotionMediaQuery() {
  const matchMedia = globalThis.matchMedia ?? globalThis.window?.matchMedia;
  return matchMedia?.(REDUCED_MOTION_MEDIA_QUERY);
}

/**
 * 当前是否要求减少动态效果。
 */
export function prefersReducedMotionNow() {
  return reducedMotionMediaQuery()?.matches === true;
}

/**
 * 订阅系统偏好的变化，返回取消订阅的函数。
 */
export function onReducedMotionChange(listener) {
  const mediaQueryList = reducedMotionMediaQuery();
  if (typeof mediaQueryList?.addEventListener !== "function") {
    return () => {};
  }
  mediaQueryList.addEventListener("change", listener);
  return () => mediaQueryList.removeEventListener("change", listener);
}
