/**
 * HEX 颜色工具（全局唯一实现）
 *
 * 职责：
 * - 提供十六进制颜色规范化、RGB 解析、rgba 转换、加深、状态点主题构建等工具函数。
 * - 收敛原先分散在三处的平行实现：
 *   - composables/ui/useAppTheme 的 hexToRgb（严格 6 位，非法返回 null）。
 *   - constants/entity-state-colors 的 normalizeHexColor / hexToRgba / darkenHex /
 *     buildDotThemeFromColor（支持 3 位缩写，非法回退 FALLBACK_HEX）。
 *   - utils/chart/device-chart-theme 的 hexWithOpacity（严格 6 位，非法原样返回）。
 *
 * 依赖：无外部依赖，纯函数。
 *
 * 注意：
 * - 三个入口的解析语义存在历史差异（3 位缩写支持、非法输入回退值、
 *   输出字符串空格格式），为保持既有调用点行为不变，差异原样保留。
 * - 新代码请优先使用 normalizeHexColor + hexToRgba 组合。
 */

/** 颜色解析失败时的回退色（琥珀黄） */
const FALLBACK_HEX = '#FFD60A'

/** RGB 通道值对象 */
export interface Rgb {
  r: number
  g: number
  b: number
}

/**
 * 把颜色字符串规范化为 6 位大写 HEX（含 #）。
 *
 * 支持 3 位 HEX 展开、自动补 # 前缀；非法格式返回 null。
 *
 * @param color - 原始颜色字符串（可带 / 不带 #，3 位或 6 位 HEX）。
 * @returns 形如 `#FFD60A` 的大写 HEX；无法解析时返回 null。
 */
function normalizeHexColor(color: string | null | undefined): string | null {
  if (!color) return null
  const raw = String(color).trim()
  if (!raw) return null
  const hex = raw.startsWith('#') ? raw : `#${raw}`
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex.toUpperCase()
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    const [, a, b, c] = hex
    return `#${a}${a}${b}${b}${c}${c}`.toUpperCase()
  }
  return null
}

/**
 * 将十六进制颜色字符串解析为 RGB 对象。
 *
 * 仅接受 6 位 HEX（# 前缀可选）；长度不为 6 或解析失败时返回 null。
 * 供强调色 CSS 变量派生等场景使用。
 *
 * @param hex - 十六进制颜色（如 #0A84FF），可为空。
 * @returns RGB 对象；无法解析时返回 null。
 */
export function hexToRgb(hex: string | undefined | null): Rgb | null {
  const h = (hex || '').replace('#', '')
  if (h.length !== 6) return null
  const n = parseInt(h, 16)
  if (Number.isNaN(n)) return null
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

/**
 * 把 HEX 颜色转换为带透明度的 rgba() 字符串。
 *
 * @param hex - HEX 颜色字符串（3 / 6 位均可）；非法时回退到 FALLBACK_HEX。
 * @param alpha - 透明度（0-1）。
 * @returns 形如 `rgba(255,214,10,0.5)` 的字符串。
 */
export function hexToRgba(hex: string, alpha: number): string {
  const normalized = normalizeHexColor(hex) || FALLBACK_HEX
  const n = parseInt(normalized.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r},${g},${b},${alpha})`
}

/**
 * 把 HEX 转为 CSS `r, g, b` 通道串，供 `--accent-rgb` 使用。
 */
export function hexToRgbChannels(
  hex: string | null | undefined,
  fallback = '148, 163, 184',
): string {
  const rgb = hexToRgb(normalizeHexColor(hex) || hex || '')
  if (!rgb) return fallback
  return `${rgb.r}, ${rgb.g}, ${rgb.b}`
}

/**
 * 略加深，用于径向渐变外圈。
 *
 * @param hex - HEX 颜色字符串（3 / 6 位均可）；非法时回退到 FALLBACK_HEX。
 * @param amount - 各通道亮度衰减系数（0-1），默认 0.28。
 * @returns 形如 `#E0B807` 的 6 位大写 HEX。
 */
export function darkenHex(hex: string, amount = 0.28): string {
  const normalized = normalizeHexColor(hex) || FALLBACK_HEX
  const n = parseInt(normalized.slice(1), 16)
  const mix = (channel: number) => Math.round(channel * (1 - amount))
  const r = mix((n >> 16) & 255)
  const g = mix((n >> 8) & 255)
  const b = mix(n & 255)
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

/**
 * 十六进制色 → rgba 字符串（供渐变 colorStops 使用）。
 *
 * 仅接受 6 位 HEX（# 前缀可选，允许首尾空白）；非法时原样返回输入。
 *
 * @param hex - HEX 颜色字符串。
 * @param opacity - 透明度（0-1）。
 * @returns 形如 `rgba(255, 214, 10, 0.5)` 的字符串；非法输入返回原字符串。
 */
export function hexWithOpacity(hex: string, opacity: number): string {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  if (!match) return hex
  return `rgba(${parseInt(match[1], 16)}, ${parseInt(match[2], 16)}, ${parseInt(match[3], 16)}, ${opacity})`
}

/** 状态点主题：内圈 / 外圈 / 光晕 / 边框的颜色组合 */
export type StateDotTheme = {
  inner: string
  outer: string
  glow: string
  border: string
}

/**
 * 根据基色构建状态点主题（内圈 / 外圈 / 光晕 / 边框）。
 *
 * @param hex - 基色 HEX 字符串；非法时回退到 FALLBACK_HEX。
 * @returns StateDotTheme 对象，外圈略加深、光晕与边框带透明度。
 */
export function buildDotThemeFromColor(hex: string): StateDotTheme {
  const color = normalizeHexColor(hex) || FALLBACK_HEX
  return {
    inner: color,
    outer: darkenHex(color),
    glow: hexToRgba(color, 0.5),
    border: hexToRgba(color, 0.6),
  }
}
