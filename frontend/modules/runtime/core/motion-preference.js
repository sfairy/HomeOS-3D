/**
 * 系统「减少动态效果」偏好的唯一判定。
 *
 * 前庭敏感用户会在系统里打开它，此时位移 / 旋转 / 渐变都该退化成静态呈现。判定要同时看
 * `globalThis.matchMedia` 与 `globalThis.window?.matchMedia`：运行侧既有舞台页（`window` 在），
 * 也有被注入替身对象的环境，只认一条会在另一侧静默恒为 `false` —— 表现不是报错，而是
 * 「无障碍设置被悄悄忽略」，最难被发现的那种失效。
 *
 * 对外只提供「读快照」与「订阅变化」两个入口，都不把 MediaQueryList 交出去：调用点多在每帧
 * 热路径上，让调用方各自读 `.matches` 就等于把「怎么算命中」复制出去。需要「创建时冻结」语义
 * 的调用方，请把结果存进常量（`const prefersReducedMotion = prefersReducedMotionNow()`），
 * 别在热路径里反复调用。
 */
/** 查询串只有一份：两个入口必须问同一个问题，否则订阅与判定会得出相反的结论。 */
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
 *
 * 为什么必须有订阅、不能只靠热路径重读：动画类调用方在命中偏好后会把「下次推进间隔」推成
 * `Infinity`（没有下一帧了），此时若用户在页面存活期间把设置**切回来**，光靠重读永远等不到
 * 那次读取 —— 动画再也醒不过来。反向（开启偏好）倒是能靠下一帧自然停下，两向合起来才完整。
 *
 * 拿不到 matchMedia 时返回一个空函数，调用方不必自己判空；返回值一律可直接当摘钩用。
 */
export function onReducedMotionChange(listener) {
  const mediaQueryList = reducedMotionMediaQuery();
  if (typeof mediaQueryList?.addEventListener !== "function") {
    return () => {};
  }
  mediaQueryList.addEventListener("change", listener);
  return () => mediaQueryList.removeEventListener("change", listener);
}
