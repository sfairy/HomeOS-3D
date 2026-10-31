/** HEX 颜色工具（全局唯一实现） */

/** RGB 通道值对象 */
interface Rgb {
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

/** `#RRGGBB` 颜色的 WCAG 相对亮度；非法输入返回 null。 */
export function relativeLuminance(hex: string | null | undefined): number | null {
  const rgb = hexToRgb(normalizeHexColor(hex) || hex || '')
  if (!rgb) return null
  const channel = (value: number) => {
    const c = value / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b)
}

/** 两个 `#RRGGBB` 颜色的 WCAG 对比度（1–21）；任一非法输入返回 null。 */
export function contrastRatio(
  foreground: string | null | undefined,
  background: string | null | undefined,
): number | null {
  const a = relativeLuminance(foreground)
  const b = relativeLuminance(background)
  if (a === null || b === null) return null
  const [light, dark] = a > b ? [a, b] : [b, a]
  return (light + 0.05) / (dark + 0.05)
}

/** 强调色在深色画布上的最低对比度（非文本控件 / 焦点环，WCAG 1.4.11）。 */
export const ACCENT_MIN_SURFACE_CONTRAST = 3
/** 强调色本身作为文字、或强调底上的文字所需的最低对比度（WCAG 1.4.3）。 */
export const ACCENT_MIN_TEXT_CONTRAST = 4.5

/**
 * 把后台 `ui.accentColor` 收敛到可读范围。
 *
 * 强调色同时被用作深色画布上的文字/边框和按钮底色（按钮文字是 `--hos-fg-on-accent`），
 * 单一颜色必须同时满足两侧对比度；否则导航高亮、选中态和主按钮会不可读。
 * 非法或过暗的颜色回落到系统蓝，并在调用侧给出一次警告，不静默接受不可读配置。
 */
export function resolveReadableAccent(
  accent: string | null | undefined,
  fallback = '#0A84FF',
  canvas = '#070a0f',
  onAccent = '#041018',
): string {
  const normalized = normalizeHexColor(accent)
  if (!normalized) return normalizeHexColor(fallback) ?? fallback
  const surface = contrastRatio(normalized, canvas)
  const text = contrastRatio(normalized, onAccent)
  if (surface === null || text === null) return normalizeHexColor(fallback) ?? fallback
  if (surface < ACCENT_MIN_SURFACE_CONTRAST || text < ACCENT_MIN_TEXT_CONTRAST) {
    return normalizeHexColor(fallback) ?? fallback
  }
  return normalized
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
