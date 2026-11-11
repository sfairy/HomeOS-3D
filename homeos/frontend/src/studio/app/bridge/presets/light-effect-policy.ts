/**
 * 灯光 3D 光效策略（0.8.5：标准光影模式支持逐灯自定义）。
 *
 * 两种模式共用同一份渲染管线，差别只在「光效参数从哪来」：
 *
 * - 轻量柔光（``region``）：所有灯一律用固定范围 / 默认值，由区域光照接管；
 * - 标准光影（``standard``）：未开启自定义的灯仍用固定值，开启后改用
 *   ``standardLightEffects`` 里的范围、默认值与色温兜底。
 *
 * 未开启自定义时必须与旧行为逐字节一致，否则老组件的画面会整体跳亮度。
 */

/** 固定范围（轻量柔光与未自定义的标准光影共用）。 */
const LIGHT_EFFECT_RANGE = Object.freeze({
  brightnessMin: 50,
  brightnessMax: 150,
  temperatureMin: 2700,
  temperatureMax: 6500,
})

/** 固定默认值（同上）。 */
export const LIGHT_EFFECT_DEFAULTS = Object.freeze({
  brightness: 150,
  kelvin: 3500,
})

export function withFixedLightEffects(settings: any) {
  return {
    ...settings,
    effectRange: {
      ...LIGHT_EFFECT_RANGE,
    },
    effectDefaults: {
      ...LIGHT_EFFECT_DEFAULTS,
    },
  }
}

/** 光效范围的四个键（部分缺省时回落固定值）。 */
interface LightEffectRangeSource {
  brightnessMin?: number
  brightnessMax?: number
  temperatureMin?: number
  temperatureMax?: number
}

/** 默认光效的两个键（部分缺省时回落固定值）。 */
interface LightEffectDefaultsSource {
  brightness?: number
  kelvin?: number
}

/** 读物：灯卡片 / 舞台共用的最小字段集。 */
interface LightEffectSource {
  effectRange?: LightEffectRangeSource
  effectDefaults?: LightEffectDefaultsSource
  temperatureFallback?: string
  standardLightEffects?: {
    enabled?: boolean
    effectRange?: LightEffectRangeSource
    effectDefaults?: LightEffectDefaultsSource
    temperatureFallback?: string
  }
}

/**
 * 逐灯自定义光效的编辑草稿：缺省键一律回落固定值。
 *
 * ``temperatureFallback`` 兼容 0.8.4 的旧字段：没有 ``standardLightEffects`` 时
 * 沿用灯上的顶层 ``temperatureFallback``，避免升级后已选「跟随户型」的灯被重置。
 */
export function standardLightEffectsDraft(item: LightEffectSource | null | undefined) {
  const effects = item?.standardLightEffects,
    temperatureFallback =
      effects?.temperatureFallback === 'floorplan' || (!effects && item?.temperatureFallback === 'floorplan')
        ? 'floorplan'
        : 'default'
  return {
    enabled: effects?.enabled === true,
    effectRange: { ...LIGHT_EFFECT_RANGE, ...effects?.effectRange },
    effectDefaults: { ...LIGHT_EFFECT_DEFAULTS, ...effects?.effectDefaults },
    temperatureFallback,
  }
}

/**
 * 把逐灯自定义光效折算成渲染参数。
 *
 * ``lightingMode`` 由调用方归一（``region`` / ``standard``）；非标准光影或未开启自定义
 * 时直接返回固定值，调用点因此可以无条件替换原来的 :func:`withFixedLightEffects`。
 */
export function withInteractionLightEffects(
  item: (LightEffectSource & Record<string, unknown>) | null | undefined,
  lightingMode: string,
) {
  const fixed = withFixedLightEffects(item)
  if (lightingMode !== 'standard' || item?.standardLightEffects?.enabled !== true) return fixed
  const draft = standardLightEffectsDraft(item)
  return {
    ...fixed,
    effectRange: draft.effectRange,
    effectDefaults: draft.effectDefaults,
    temperatureFallback: draft.temperatureFallback,
  }
}
