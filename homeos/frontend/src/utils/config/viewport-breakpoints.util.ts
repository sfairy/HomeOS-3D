/**
 * @module config/viewport-breakpoints
 * @description 视口断点判定工具（全局唯一判定来源）。
 *
 * 项目以平板墙屏 / kiosk 为主：
 *  - TABLET/DESKTOP: 短边 ≥600 且长边 ≥768（1366×1024、1024×768、768×1024 均按平板/桌面处理）
 *
 * 统一口径：等比缩放默认值（useScaling）、设备形态上报（system.util）与
 * 侧栏紧凑布局（RightSidebar）均以此处组合判定为准。
 *
 * 依赖：浏览器 window（SSR 安全降级到默认尺寸）。
 */
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
