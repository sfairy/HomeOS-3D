/**
 * @module config/viewport-breakpoints
 * @description 视口断点判定工具（全局唯一判定来源）。
 *
 * 项目以平板墙屏 / kiosk 为主，手机走独立原生布局：
 *  - PHONE:        短边 <600 且长边 <900 → 手机视口（含横屏手机，如 844×390）
 *  - TABLET/DESKTOP: 其余（1366×1024、1024×768、768×1024、639×610 近方形小屏均按平板/桌面处理）
 *
 * 统一口径：外壳判定（useViewportMode）、等比缩放默认值（useScaling）、
 * 路由守卫（/m 去留）均以此处组合判定为准，避免「宽 <640」与「短边 <600」双轨并存。
 * CSS 侧沿用 @media (max-width: 639px) 纯宽度阈值（改动全部 CSS 断点侵入面过大）：
 * CSS 无法直接表达短边+长边组合判定，竖屏手机仍可命中手机样式，近方形小屏
 * （639×610，宽恰 ≤639）与横屏手机（844×390，宽 >639 走紧凑平板/桌面样式）属可接受边缘误差。
 *
 * 依赖：浏览器 window（SSR 安全降级到默认尺寸）。
 */
/** 手机短边阈值：短边 <600 视为手机（与旧「短边 <600」外壳口径一致） */
const PHONE_MAX_SHORT_SIDE = 600
/** 手机长边阈值：长边 <900 视为手机（区分平板竖屏 768×1024 与近方形小屏 639×610） */
const PHONE_MAX_LONG_SIDE = 900
/** 平板紧凑断点：宽度介于该值与 TABLET_COMPACT_MAX_WIDTH 之间为紧凑平板 */
const TABLET_COMPACT_MIN_WIDTH = 640
/** 平板紧凑断点：宽度大于该值为常规平板/桌面 */
const TABLET_COMPACT_MAX_WIDTH = 1024

/** 取视口尺寸（SSR 或参数缺省时降级到默认尺寸） */
function resolveViewportSize(width?: number, height?: number): [number, number] {
  const w = width ?? (typeof window !== 'undefined' ? window.innerWidth : 1366)
  const h = height ?? (typeof window !== 'undefined' ? window.innerHeight : 1024)
  return [w, h]
}

/**
 * 手机视口组合判定：短边 <600 且长边 <900。
 * 横屏手机（如 844×390）判为手机；近方形小屏（639×610）与平板（768×1024、1366×1024）判非手机。
 * @param width 视口宽度，默认 window.innerWidth（SSR 取 1366）
 * @param height 视口高度，默认 window.innerHeight（SSR 取 1024）
 * @returns 是否手机视口
 */
export function isPhoneViewport(width?: number, height?: number): boolean {
  const [w, h] = resolveViewportSize(width, height)
  const min = Math.min(w, h)
  const max = Math.max(w, h)
  return min < PHONE_MAX_SHORT_SIDE && max < PHONE_MAX_LONG_SIDE
}

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
