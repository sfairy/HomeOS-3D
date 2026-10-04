/**
 * 户型图温湿度徽章前置图标（实心剪影，适配小字号粗体数值）
 * viewBox 0 0 16 16，fill currentColor
 */

const BADGE_READING_ICON_VB = 16

/** 温度计：细管 + 圆球，小尺寸仍可辨认 */
const THERMOMETER_SILHOUETTE =
  'M9.15 1.55c0-.75-.6-1.35-1.35-1.35s-1.35.6-1.35 1.35v7.1a3.5 3.5 0 1 0 2.7 0v-7.1Z'

/** 水滴：圆润实心水珠 */
const DROPLET_SILHOUETTE =
  'M8 1.15c2.2 2.85 5.35 6.55 5.35 9.35a5.35 5.35 0 1 1-10.7 0C2.65 7.7 5.8 4 8 1.15Z'

/**
 * 按读数量纲返回对应剪影 SVG path 字符串。
 *
 * @param kind 量纲 key（temperature / humidity）
 * @returns SVG path 字符串；未匹配返回 null
 */
export function resolveBadgeReadingIconPath(kind: string | null | undefined): string | null {
  if (kind === 'temperature') return THERMOMETER_SILHOUETTE
  if (kind === 'humidity') return DROPLET_SILHOUETTE
  return null
}

/**
 * Canvas 绘制实心剪影（中心对齐 cx/cy）。
 *
 * @param ctx Canvas 2D 上下文
 * @param kind 量纲 key（temperature / humidity）
 * @param cx 中心 X 坐标
 * @param cy 中心 Y 坐标
 * @param sizePx 目标像素尺寸
 * @param color 填充颜色（CSS 颜色值）
 */
export function drawBadgeReadingIcon(
  ctx: CanvasRenderingContext2D,
  kind: string,
  cx: number,
  cy: number,
  sizePx: number,
  color: string,
) {
  const d = resolveBadgeReadingIconPath(kind)
  if (!d) return
  const path = new Path2D(d)
  ctx.save()
  ctx.translate(cx, cy)
  const s = sizePx / BADGE_READING_ICON_VB
  ctx.scale(s, s)
  ctx.translate(-BADGE_READING_ICON_VB / 2, -BADGE_READING_ICON_VB / 2)
  ctx.fillStyle = color
  ctx.fill(path)
  ctx.restore()
}
