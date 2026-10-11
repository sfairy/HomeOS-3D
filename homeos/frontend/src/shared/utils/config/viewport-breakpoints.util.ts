/** 项目以平板墙屏 / kiosk 为主： */
/** 平板紧凑断点：宽度介于该值与 TABLET_COMPACT_MAX_WIDTH 之间为紧凑平板 */
const TABLET_COMPACT_MIN_WIDTH = 640
/** 平板紧凑断点：宽度大于该值为常规平板/桌面 */
const TABLET_COMPACT_MAX_WIDTH = 1024

/**
 * 平板 / 墙屏：短边 ≥600 且长边 ≥768（含 iPad 竖屏 768、横屏 1024 等）。
 * @param width 视口宽度，默认 window.innerWidth（SSR 取 1366）
 * @param height 视口高度，默认 window.innerHeight（SSR 取 1024）
 * @returns 是否平板类视口
 */
export function isTabletLikeViewport(
  width = typeof window !== 'undefined' ? window.innerWidth : 1366,
  height = typeof window !== 'undefined' ? window.innerHeight : 1024,
): boolean {
  const min = Math.min(width, height)
  const max = Math.max(width, height)
  return min >= 600 && max >= 768
}

/**
 * 判断是否为「紧凑平板」视口：宽度在 TABLET_COMPACT_MIN_WIDTH 与 TABLET_COMPACT_MAX_WIDTH 之间。
 * @param width 视口宽度，默认 window.innerWidth（SSR 取 1366）
 * @returns 是否紧凑平板视口
 */
export function isTabletCompactViewport(
  width = typeof window !== 'undefined' ? window.innerWidth : 1366,
): boolean {
  return width >= TABLET_COMPACT_MIN_WIDTH && width <= TABLET_COMPACT_MAX_WIDTH
}
