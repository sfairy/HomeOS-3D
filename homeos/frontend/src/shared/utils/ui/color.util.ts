/** HEX 颜色工具（全局唯一实现） */

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
 */
export function hexToRgb(hex: string | undefined | null): Rgb | null {
  const h = (hex || '').replace('#', '')
  if (h.length !== 6) return null
  const n = parseInt(h, 16)
  if (Number.isNaN(n)) return null
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

/**
 * HEX（3/6 位）→ RGB 分量，**永不返回 null**：非法输入回落黑。
 *
 * 存在的理由是「调用方拿不到颜色就用黑」这一类分支。这类分支此前在 `light-control-core` 与
 * studio 的 `editor-utils` 里各自抄了一份**不校验**的解析（`parseInt` 直接切字符串），
 * 非法输入会产出 `NaN` 通道 —— 写进 `style` 后整条声明静默失效（CSS 不报错，界面只是不生效）。
 * 统一到这里后既保留校验，又不逼每个调用方写 null 分支。
 */
export function hexToRgbOrBlack(hex: string | undefined | null): Rgb {
  return hexToRgb(normalizeHexColor(hex) ?? hex ?? '') ?? { r: 0, g: 0, b: 0 }
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
 * 十六进制色 → rgba 字符串（供渐变 colorStops 使用）。
 *
 * 仅接受 6 位 HEX（# 前缀可选，允许首尾空白）；非法时原样返回输入。
 */
export function hexWithOpacity(hex: string, opacity: number): string {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  if (!match) return hex
  return `rgba(${parseInt(match[1], 16)}, ${parseInt(match[2], 16)}, ${parseInt(match[3], 16)}, ${opacity})`
}
