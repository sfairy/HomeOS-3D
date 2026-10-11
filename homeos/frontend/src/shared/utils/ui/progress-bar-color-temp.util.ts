/**
 * 灯光色温（Kelvin / mireds）换算与 UI 滑块样式工具。
 *
 * 职责：
 * - Kelvin ↔ mireds 互转（1e6 / K）
 * - 从 HA LightEntity attributes 解析设备真实色温范围，识别 HA 平台占位范围并忽略
 * - 钳制 UI 展示色温（0–6500K）与下发色温（设备实际范围）
 * - 按色温在暖光↔冷光间插值，生成滑块轨道填充色
 *
 * 关键算法：resolveKelvinBounds 按非通用 Kelvin → 非通用 mired → HA 占位 Kelvin → mired → 兜底 优先级解析；
 * mired 与 Kelvin 反向（max_mireds=暖端低 K，min_mireds=冷端高 K）。
 *
 * 依赖：./progress-bar-gradient.util 的滑块值归一化 helper。
 */

import {
  normalizeProgressPct,
  resolveSliderValue,
  snapToSliderStep,
  formatProgressPct,
} from './progress-bar-gradient.util'

/**
 * Kelvin → mireds 换算（mireds = 1e6 / K，值越大越暖）。
 * @param kelvin 色温 Kelvin
 * @returns mireds；非法或非正返回 null
 */
export function kelvinToMireds(kelvin: number | null | undefined) {
  if (!kelvin || kelvin <= 0) return null
  return Math.round(1000000 / kelvin)
}

/**
 * mireds → Kelvin 换算（K = 1e6 / mireds）。
 * @param mireds mired 值
 * @returns Kelvin；非法或非正返回 0
 */
function miredsToKelvin(mireds: number | null | undefined) {
  if (!mireds || mireds <= 0) return 0
  return Math.round(1000000 / mireds)
}

/** 灯光弹窗 / 场景联动等 UI 滑块统一刻度（与 HA 常见上限一致） */
const LIGHT_COLOR_TEMP_UI_MIN = 0
const LIGHT_COLOR_TEMP_UI_MAX = 6500

type KelvinBounds = { min: number; max: number }

/** 无设备属性时的下发兜底范围 */
const DEFAULT_KELVIN_BOUNDS: KelvinBounds = { min: 2000, max: LIGHT_COLOR_TEMP_UI_MAX }

/** HA LightEntity 平台占位范围（非设备真实能力，应忽略） */
const HA_GENERIC_COLOR_TEMP_KELVIN_MIN = 1700
const HA_GENERIC_COLOR_TEMP_KELVIN_MAX = 7000

/** HA LightEntity 平台占位 mired 范围（非设备真实能力） */
const HA_GENERIC_MIREDS_MIN = 153
const HA_GENERIC_MIREDS_MAX = 500

/**
 * 判断 mired 范围是否为 HA 平台占位值（153–500），占位值不代表设备真实能力。
 * @param minM 最小 mired
 * @param maxM 最大 mired
 * @returns 是占位范围返回 true
 */
function isHaGenericMiredRange(minM: number | null | undefined, maxM: number | null | undefined) {
  const min = Math.round(Number(minM))
  const max = Math.round(Number(maxM))
  if (!Number.isFinite(min) || !Number.isFinite(max)) return false
  if (min === HA_GENERIC_MIREDS_MIN && max === HA_GENERIC_MIREDS_MAX) return true
  return min <= HA_GENERIC_MIREDS_MIN && max >= HA_GENERIC_MIREDS_MAX
}

/**
 * 判断 Kelvin 范围是否为 HA 平台占位值（约 1700–7000），占位值不代表设备真实能力。
 * @param minK 最小 Kelvin
 * @param maxK 最大 Kelvin
 * @returns 是占位范围返回 true
 */
function isHaGenericColorTempKelvinRange(
  minK: number | null | undefined,
  maxK: number | null | undefined,
) {
  const min = Math.round(Number(minK))
  const max = Math.round(Number(maxK))
  if (!Number.isFinite(min) || !Number.isFinite(max)) return false
  return min <= HA_GENERIC_COLOR_TEMP_KELVIN_MIN && max >= HA_GENERIC_COLOR_TEMP_KELVIN_MAX - 465
}

type ColorTempAttrs = Record<string, unknown>

/**
 * 按候选键名依次读取第一个有限数值属性（兼容 min_mireds / min_mired 等多种命名）。
 * @param attrs 属性对象
 * @param keys 候选键名
 * @returns 命中的数值或 null
 */
function readAttrNumber(attrs: ColorTempAttrs, ...keys: string[]) {
  for (const key of keys) {
    if (attrs[key] == null) continue
    const n = Number(attrs[key])
    if (Number.isFinite(n)) return n
  }
  return null
}

/** max_mireds=暖端(低K)，min_mireds=冷端(高K) */
function kelvinRangeFromMireds(attrs: ColorTempAttrs) {
  const minM = readAttrNumber(attrs, 'min_mireds', 'min_mired')
  const maxM = readAttrNumber(attrs, 'max_mireds', 'max_mired')
  if (minM == null || maxM == null) return null
  return {
    min: miredsToKelvin(maxM),
    max: miredsToKelvin(minM),
  }
}

/**
 * 归一化 Kelvin 范围：非法值回退默认、保证 min<=max、跨度不足 100K 时扩展上限。
 * @param minK 最小 Kelvin
 * @param maxK 最大 Kelvin
 * @returns 归一化后的 { min, max }（已取整）
 */
function normalizeKelvinRange(minK: number | null | undefined, maxK: number | null | undefined) {
  let min = Number(minK)
  let max = Number(maxK)
  if (!Number.isFinite(min) || min <= 0) min = DEFAULT_KELVIN_BOUNDS.min
  if (!Number.isFinite(max) || max <= 0) max = DEFAULT_KELVIN_BOUNDS.max
  if (min > max) [min, max] = [max, min]
  if (max - min < 100) max = min + 100
  return { min: Math.round(min), max: Math.round(max) }
}

/**
 * 从 HA 灯光实体 attributes 解析 Kelvin 范围。
 * 优先级：非通用 Kelvin → 非通用 mired → Kelvin（含 1700–7000 占位，与 HA UI 一致）→ mired → 兜底
 */
export function resolveKelvinBounds(attrs: ColorTempAttrs = {}) {
  const rawMinK = readAttrNumber(attrs, 'min_color_temp_kelvin')
  const rawMaxK = readAttrNumber(attrs, 'max_color_temp_kelvin')
  const minM = readAttrNumber(attrs, 'min_mireds', 'min_mired')
  const maxM = readAttrNumber(attrs, 'max_mireds', 'max_mired')

  const hasKelvinPair = rawMinK != null && rawMaxK != null
  const kelvinIsDeviceSpecific = hasKelvinPair && !isHaGenericColorTempKelvinRange(rawMinK, rawMaxK)
  const hasMiredPair = minM != null && maxM != null
  const miredIsDeviceSpecific = hasMiredPair && !isHaGenericMiredRange(minM, maxM)

  if (kelvinIsDeviceSpecific) {
    return normalizeKelvinRange(rawMinK, rawMaxK)
  }

  if (miredIsDeviceSpecific) {
    const miredRange = kelvinRangeFromMireds(attrs)
    if (miredRange) {
      const { min, max } = miredRange
      return normalizeKelvinRange(min, max)
    }
  }

  // 仅有 HA 平台占位 Kelvin（1700–7000）时，与 HA 开发者工具显示保持一致
  if (hasKelvinPair && isHaGenericColorTempKelvinRange(rawMinK, rawMaxK)) {
    return normalizeKelvinRange(rawMinK, rawMaxK)
  }

  if (hasMiredPair) {
    const miredRange = kelvinRangeFromMireds(attrs)
    if (miredRange) {
      const { min, max } = miredRange
      return normalizeKelvinRange(min, max)
    }
  }

  if (rawMinK != null && rawMaxK != null) {
    return normalizeKelvinRange(rawMinK, rawMaxK)
  }
  if (rawMinK != null) {
    return normalizeKelvinRange(rawMinK, DEFAULT_KELVIN_BOUNDS.max)
  }
  if (rawMaxK != null) {
    return normalizeKelvinRange(DEFAULT_KELVIN_BOUNDS.min, rawMaxK)
  }
  if (maxM != null) {
    return normalizeKelvinRange(miredsToKelvin(maxM), DEFAULT_KELVIN_BOUNDS.max)
  }
  if (minM != null) {
    return normalizeKelvinRange(DEFAULT_KELVIN_BOUNDS.min, miredsToKelvin(minM))
  }

  return { ...DEFAULT_KELVIN_BOUNDS }
}

/** UI 滑块展示用：钳制到 0–6500K */
function clampKelvinForUi(kelvin: number | null | undefined) {
  const k = Math.round(Number(kelvin) || 0)
  return Math.max(LIGHT_COLOR_TEMP_UI_MIN, Math.min(LIGHT_COLOR_TEMP_UI_MAX, k))
}

/** 读实体当前色温（UI 用，钳制到该实体支持范围） */
export function resolveEntityColorTempKelvinForUi(attrs: ColorTempAttrs = {}) {
  const deviceBounds = resolveKelvinBounds(attrs)
  return clampKelvinForUi(resolveEntityColorTempKelvin(attrs, deviceBounds))
}

/** 按实体色温跨度选择滑块步进 */
export function resolveColorTempStep(minK: number, maxK: number) {
  const span = Math.max(0, maxK - minK)
  if (span <= 300) return 10
  if (span <= 800) return 50
  return 100
}

/** 下发 HA 前钳制到设备实际支持范围 */
export function clampKelvinForDevice(kelvin: number | null | undefined, attrs: ColorTempAttrs = {}) {
  const { min, max } = resolveKelvinBounds(attrs)
  const k = Math.round(Number(kelvin) || min)
  return Math.max(min, Math.min(max, k))
}

/** 从实体属性读当前色温 Kelvin，并钳制到设备支持范围 */
function resolveEntityColorTempKelvin(
  attrs: ColorTempAttrs = {},
  bounds: KelvinBounds = resolveKelvinBounds(attrs),
) {
  const { min, max } = bounds
  let kelvin: number | null = null
  const colorTempKelvin = attrs.color_temp_kelvin
  const colorTemp = attrs.color_temp
  if (colorTempKelvin != null && Number(colorTempKelvin) > 0) {
    kelvin = Number(colorTempKelvin)
  } else if (colorTemp != null && Number(colorTemp) > 0) {
    const n = Number(colorTemp)
    kelvin = n >= 1000 ? n : miredsToKelvin(n)
  }
  if (kelvin == null || kelvin <= 0) kelvin = Math.round((min + max) / 2)
  return Math.max(min, Math.min(max, Math.round(kelvin)))
}


/** 暖光 → 冷光轨道端点色 */
const COLOR_TEMP_WARM = '#fdba74'
const COLOR_TEMP_COOL = '#93c5fd'

/**
 * 按 Kelvin 在 min~max 间插值得到轨道高亮色
 * @param {number} kelvin
 * @param {number} minK
 * @param {number} maxK
 */
function kelvinToTrackColor(kelvin: number, minK: number, maxK: number) {
  const t = normalizeProgressPct(kelvin, minK, maxK) / 100
  if (t <= 0.5) {
    return mixHexColors(COLOR_TEMP_WARM, '#ffffff', t * 2)
  }
  return mixHexColors('#ffffff', COLOR_TEMP_COOL, (t - 0.5) * 2)
}

/**
 * 在两个 hex 颜色间按比例线性插值，返回 rgb() 字符串。
 * @param from 起始 hex
 * @param to 目标 hex
 * @param ratio 插值比例 [0,1]
 * @returns rgb(r, g, b)
 */
function mixHexColors(from: string, to: string, ratio: number) {
  const a = parseHexColor(from)
  const b = parseHexColor(to)
  const t = Math.min(1, Math.max(0, ratio))
  const r = Math.round(a.r + (b.r - a.r) * t)
  const g = Math.round(a.g + (b.g - a.g) * t)
  const bl = Math.round(a.b + (b.b - a.b) * t)
  return `rgb(${r}, ${g}, ${bl})`
}

/**
 * 解析 hex 颜色字符串为 { r, g, b } 数值对象。
 * @param hex hex 字符串（可含 #）
 * @returns 分量对象
 */
function parseHexColor(hex: string) {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

/**
 * 色温滑块轨道：填充段随 Kelvin 从暖色过渡到当前色温色
 */
export function colorTempSliderTrackStyle(
  value: number | null | undefined,
  min: number,
  max: number,
  trackColor = 'rgba(255,255,255,0.1)',
  step?: number,
) {
  let v = resolveSliderValue(value, min)
  if (step != null && step > 0) {
    v = snapToSliderStep(v, min, max, step)
  }
  const pct = normalizeProgressPct(v, min, max)
  const from = COLOR_TEMP_WARM
  const to = kelvinToTrackColor(v, min, max)
  const pctStr = formatProgressPct(pct)
  return {
    '--progress': pctStr,
    '--progress-pct': pctStr,
    '--range-progress': pctStr,
    '--track-fill-from': from,
    '--track-fill-to': to,
    '--track-bg': trackColor,
  }
}
