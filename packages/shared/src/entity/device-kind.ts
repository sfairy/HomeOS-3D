/**
 * 设备类型（kind）唯一词汇表 —— 前端侧。
 *
 * 为什么两端各存一份而不用跨语言代码生成：后端跑 Python、前端跑浏览器，生成器本身
 * 会成为第三处真源（前后端各存一份，靠两表对齐的约定保证一致）。
 * 因此这里的做法是「同一张表 + 跨端约定」：
 *
 * - 后端 `homeos/backend/src/domains/device_profile/classify.py` 的 `CLIMATE_KINDS` 是权威集合
 *   （它的 `ALLOWED_KINDS` 是写入校验的唯一口径）；
 * - 本文件是前端唯一词汇表；
 * - 两边「kind 集合」与「kind → 渲染形态」必须逐条相等，任一单侧改动都要同步另一侧。
 *
 * 这份表存在的原因：分类结论只能有一个。此前前端 `resolveClimateDeviceType()` 用中文
 * 设备名正则（`浴霸|风暖|暖风`）自己猜一遍，后端 `classify()` 是另一套规则，同一台设备
 * 在 3D 面板 / 语音选目标 / 自动化里可能被判成不同类型。
 */

/** 与后端 `CLIMATE_KINDS` 逐条对应（顺序也保持一致，便于人工比对）。 */
export const CLIMATE_KINDS = [
  'ac_split',
  'ac_central',
  'boiler',
  'floor_heating',
  'water_heater',
  'bath_heater',
  'unknown',
] as const

export type ClimateDeviceKind = (typeof CLIMATE_KINDS)[number]

/** 3D 面板 / 控制弹窗只有三种渲染形态；新增形态必须同时改后端映射与门禁口径。 */
export const CLIMATE_RENDER_TYPES = ['air-conditioner', 'bath-heater', 'water-heater'] as const

export type ClimateRenderType = (typeof CLIMATE_RENDER_TYPES)[number]

/**
 * kind → 渲染形态。
 *
 * `boiler` / `floor_heating` 是供暖设备，温度与模式的交互和空调同构，因此复用空调面板
 * 而不单开第四套 UI；`unknown`（后端尚未确认）与历史默认值一致，落到空调。
 */
export const CLIMATE_RENDER_TYPE_BY_KIND: Readonly<Record<ClimateDeviceKind, ClimateRenderType>> = Object.freeze({
  ac_split: 'air-conditioner',
  ac_central: 'air-conditioner',
  boiler: 'air-conditioner',
  floor_heating: 'air-conditioner',
  water_heater: 'water-heater',
  bath_heater: 'bath-heater',
  unknown: 'air-conditioner',
})

/**
 * 是否为合法 climate kind。
 *
 * 注意这里包含 `unknown`：它是**权威结论**（后端判不出来、等用户确认），
 * 与「调用方传了个表外值」不是一回事。
 */
export function isClimateDeviceKind(value: unknown): value is ClimateDeviceKind {
  return typeof value === 'string' && (CLIMATE_KINDS as readonly string[]).includes(value)
}

/**
 * kind → 渲染形态；表外取值返回 `''`。
 *
 * `unknown` 也返回 `''`：它没有「形态」可言，兜底由调用方决定（通常是空调面板，
 * 但那属于 UI 默认值，不是分类结论）。把这两种情况分开，才不会把「传错域」
 * 掩盖成「后端没确认」。
 */
export function climateRenderTypeFromKind(value: unknown): ClimateRenderType | '' {
  return isClimateDeviceKind(value) && value !== 'unknown' ? CLIMATE_RENDER_TYPE_BY_KIND[value] : ''
}
