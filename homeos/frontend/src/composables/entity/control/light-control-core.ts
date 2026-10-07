/**
 * 灯光控制核心（无 Vue / DOM）：能力探测、颜色空间转换、服务 data 构建。
 * 栈 A LightControlPopup / 未来栈 C·D 共用，避免同域逻辑多套维护。
 */

/** 灯光能力相关 attributes key（REST 刷新时只 pick 这些字段） */
export const LIGHT_CAPABILITY_ATTR_KEYS = [
  'supported_color_modes',
  'min_color_temp_kelvin',
  'max_color_temp_kelvin',
  'min_mireds',
  'max_mireds',
  'min_mired',
  'max_mired',
] as const

/** 预设颜色调色板（HEX） */
export const LIGHT_COLOR_PRESETS = [
  '#FFFFFF',
  '#FFEAA7',
  '#FDCB6E',
  '#F39C12',
  '#E17055',
  '#FF6B6B',
  '#D63031',
  '#E84393',
  '#FD79A8',
  '#A29BFE',
  '#6C5CE7',
  '#0984E3',
  '#74B9FF',
  '#00CEC9',
  '#55EFC4',
  '#00B894',
  '#636E72',
  '#2D3436',
] as const

export function pickLightCapabilityAttrs(
  attributes: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!attributes) return {}
  const picked: Record<string, unknown> = {}
  for (const key of LIGHT_CAPABILITY_ATTR_KEYS) {
    if (attributes[key] != null) picked[key] = attributes[key]
  }
  return picked
}

/** 是否支持 RGB/HS/XY 类颜色模式 */
export function lightSupportsRgb(modes: unknown): boolean {
  if (!Array.isArray(modes)) return false
  return modes.some(
    (m) => m === 'rgb' || m === 'hs' || m === 'xy' || m === 'rgbw' || m === 'rgbww',
  )
}

/** 是否支持色温模式 */
export function lightSupportsColorTemp(modes: unknown): boolean {
  if (!Array.isArray(modes)) return false
  return modes.some((m) => String(m).includes('color_temp'))
}

/** brightness 0–255 → 百分比；关灯且无 brightness 时返回 1（避免滑块归零） */
export function lightBrightnessPct(
  state: string | undefined,
  brightness: unknown,
): number {
  if (brightness != null) return Math.round((Number(brightness) / 255) * 100)
  return state === 'on' ? 100 : 1
}

/** 百分比 → HA brightness（1–255） */
export function lightBrightnessFromPct(pct: number): number {
  return Math.max(1, Math.min(255, Math.round((pct / 100) * 255)))
}

export function hslToRgb(h: number, s: number): { r: number; g: number; b: number } {
  const c = s / 100
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = 1 - c
  let r = 0,
    g = 0,
    b = 0
  if (h < 60) {
    r = c
    g = x
  } else if (h < 120) {
    r = x
    g = c
  } else if (h < 180) {
    g = c
    b = x
  } else if (h < 240) {
    g = x
    b = c
  } else if (h < 300) {
    r = x
    b = c
  } else {
    r = c
    b = x
  }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  }
}

export function rgbToHs(r: number, g: number, b: number): { h: number; s: number } {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0,
    s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
    else if (max === g) h = ((b - r) / d + 2) * 60
    else h = ((r - g) / d + 4) * 60
  }
  return { h: Math.round(h), s: Math.round(s * 100) }
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '')
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  }
}

/** 构建 light.turn_on 的 data（亮度百分比可选） */
export function buildLightTurnOnData(options: {
  brightnessPct?: number
  hsColor?: [number, number]
  rgbColor?: [number, number, number]
  colorTempKelvin?: number
  colorTempMireds?: number
  transition?: number
}): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  if (options.brightnessPct != null) {
    data.brightness = lightBrightnessFromPct(options.brightnessPct)
  }
  if (options.hsColor) data.hs_color = options.hsColor
  if (options.rgbColor) data.rgb_color = options.rgbColor
  if (options.colorTempKelvin != null) data.color_temp_kelvin = options.colorTempKelvin
  if (options.colorTempMireds != null) data.color_temp = options.colorTempMireds
  if (options.transition != null && options.transition > 0) {
    data.transition = options.transition
  }
  return data
}
