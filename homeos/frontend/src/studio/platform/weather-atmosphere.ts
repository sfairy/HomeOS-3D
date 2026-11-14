/**
 * 天气对 3D 场景光照的影响：纯数据 + 纯函数，宿主与舞台共用。
 *
 * 2D 天气层只能画「天上掉下来的东西」；一个房间在雷雨里和晴天里长得一样，
 * 观感永远是「给户型盖了一层特效」。这里定义每种天气对场景光照的**乘数**，
 * 舞台据此压暗主光、调低曝光、加一层很淡的雾，并在闪电时整体提亮一下。
 *
 * 三条硬约束：
 * 1. 系数只做「相对基线的缩放」，基线永远来自用户在编辑器里调好的一组灯光；
 *    天气只能说「今天暗一点」，不能覆盖用户的设置。
 * 2. 有下限：室内户型图与设备图标必须始终可读。半球光 / 环境光不低于 0.45，
 *    主方向光不低于 0.25，曝光限定在 0.86~1.08。
 * 3. 雾密度压得很低（≤ 0.016）：雾只用来「拉开层次」，不是把房间糊住。
 *
 * 这个文件不 import three，也不碰 DOM —— 舞台侧把系数乘到自己的灯上，宿主侧
 * 只负责把天气键转发过去。
 */
import type { WeatherEffectKey } from './weather-settings'

/** 一种天气对场景光照的影响系数（全部相对基线，1 = 不变）。 */
export type WeatherAtmosphereProfile = {
  /** 半球光（天空/地面双色环境光）亮度系数。 */
  hemisphere: number
  /** 环境光亮度系数。 */
  ambient: number
  /** 主方向光（「太阳」）亮度系数。 */
  main: number
  /** 补光方向光亮度系数。 */
  fill: number
  /** 顶光方向光亮度系数。 */
  top: number
  /** 色调映射曝光系数。 */
  exposure: number
  /** 指数雾密度（0 = 不加雾，上限见 `WEATHER_ATMOSPHERE_LIMITS.fogMax`）。 */
  fogDensity: number
  /** 雾色（`r,g,b` 片段）。 */
  fogRgb: string
  /**
   * 色温偏移目标色（`r,g,b` 片段，与 `fogRgb` / 云色同一写法）：把各盏灯的
   * **颜色**朝它插值。
   *
   * 只调亮度不调色温是「把灯关小一点」，不是「天变了」。真实的雨天是冷青色环境光
   * （云层把太阳的暖光滤掉了），雪天是冷白偏蓝，夜里是深蓝。这里给目标色，
   * 舞台按下面的 `tintStrength` 从用户设定的颜色插值过去 —— 仍是乘数，不是覆盖。
   */
  lightTint: string
  /** 色温偏移强度 0~1（0 = 完全保持用户设定的色温）。 */
  tintStrength: number
}

/** 系数安全边界：保证户型、家具与设备图标在任何天气下都仍然可读。 */
export const WEATHER_ATMOSPHERE_LIMITS = Object.freeze({
  /** 半球光 / 环境光 / 补光 / 顶光的下限。 */
  indirectMin: 0.45,
  /** 主方向光的下限。 */
  mainMin: 0.25,
  /** 曝光范围。 */
  exposureMin: 0.86,
  exposureMax: 1.08,
  /** 雾密度上限。 */
  fogMax: 0.016,
  /** 色温偏移强度上限：再高就会盖掉用户的灯光设计。 */
  tintMax: 0.62,
})

/** 无天气（晴天 / 未绑定 / 实体不可用）时的中性系数：一切乘以 1，没有雾，色温不动。 */
export const NEUTRAL_WEATHER_ATMOSPHERE: WeatherAtmosphereProfile = Object.freeze({
  hemisphere: 1,
  ambient: 1,
  main: 1,
  fill: 1,
  top: 1,
  exposure: 1,
  fogDensity: 0,
  fogRgb: '176,190,208',
  lightTint: '255,255,255',
  tintStrength: 0,
})

/**
 * 闪电瞬间的额外增益（叠加在天气系数之上，按放电强度缩放）。
 *
 * 真实雷雨里，一次放电会把整个房间照亮几十毫秒：光源在上方，所以半球光与环境光
 * 的增益最大，主方向光也会被「云层里的闪光」带亮一点。
 *
 * 这个增益**不受** `WEATHER_ATMOSPHERE_LIMITS` 的下限/上限约束 —— 那几条是给
 * 「长时间稳态」准备的，用来保证户型与图标在任何天气下都看得清。放电只有
 * 100~150 毫秒，按稳态上限压着闪，实测画面只亮 4%（几乎看不出「雷照亮了房间」）。
 * 这里让增益能越过 1（e.g. 雷雨半球光 0.72 × 1.85 ≈ 1.33），闪光才像真的。
 */
export const WEATHER_LIGHTNING_BOOST = Object.freeze({
  hemisphere: 0.85,
  ambient: 0.7,
  main: 0.5,
  fill: 0.35,
  top: 0.45,
  exposure: 0.28,
  /** 闪电时雾色一起提亮，雾才不会在闪光里变成一块脏灰。 */
  fog: 0.5,
})

/**
 * 六种天气的光照系数。
 *
 * - 雨：压主光、压曝光，整体转冷，加一层薄雾（远处墙面开始发灰）；
 * - 雪：环境光反而更亮（雪面反光强），主光柔和，雾更白更厚一点；
 * - 雷雨：雨的基础上再压一档，云层最厚，闪电增益最明显；
 * - 雨夹雪：雨与雪之间；
 * - 多云：几乎不动基线，只压一点点主光；
 * - 晴夜：主光与环境光明显下调（夜里没有太阳），但不至于让房间看不清。
 */
export const WEATHER_ATMOSPHERE_PROFILES: Readonly<Record<WeatherEffectKey, WeatherAtmosphereProfile>> = Object.freeze({
  rainy: {
    hemisphere: 0.82,
    ambient: 0.88,
    main: 0.48,
    fill: 0.74,
    top: 0.78,
    exposure: 0.93,
    fogDensity: 0.0075,
    fogRgb: '170,184,204',
    lightTint: '147,169,198',
    tintStrength: 0.52,
  },
  snowy: {
    hemisphere: 1.04,
    ambient: 1,
    main: 0.6,
    fill: 0.88,
    top: 0.94,
    exposure: 0.99,
    fogDensity: 0.011,
    fogRgb: '206,216,232',
    lightTint: '200,218,245',
    tintStrength: 0.36,
  },
  'lightning-rainy': {
    hemisphere: 0.72,
    ambient: 0.84,
    main: 0.38,
    fill: 0.68,
    top: 0.7,
    exposure: 0.9,
    fogDensity: 0.01,
    fogRgb: '150,164,186',
    lightTint: '132,151,184',
    tintStrength: 0.6,
  },
  'snowy-rainy': {
    hemisphere: 0.94,
    ambient: 0.94,
    main: 0.54,
    fill: 0.8,
    top: 0.86,
    exposure: 0.96,
    fogDensity: 0.009,
    fogRgb: '188,200,218',
    lightTint: '174,191,216',
    tintStrength: 0.44,
  },
  partlycloudy: {
    hemisphere: 0.97,
    ambient: 0.99,
    main: 0.88,
    fill: 0.95,
    top: 0.97,
    exposure: 0.985,
    fogDensity: 0.0015,
    fogRgb: '190,200,216',
    lightTint: '238,244,255',
    tintStrength: 0.1,
  },
  'clear-night': {
    hemisphere: 0.6,
    ambient: 0.8,
    main: 0.3,
    fill: 0.58,
    top: 0.62,
    exposure: 0.9,
    fogDensity: 0.004,
    fogRgb: '110,130,170',
    lightTint: '127,151,207',
    tintStrength: 0.55,
  },
})

/** 效果键 → 光照系数；空串 / 未知键一律回落到中性系数（精确恢复基线）。 */
export function weatherAtmosphereProfile(effectKey: unknown): WeatherAtmosphereProfile {
  if (typeof effectKey !== 'string' || !effectKey) return NEUTRAL_WEATHER_ATMOSPHERE
  const profile = (WEATHER_ATMOSPHERE_PROFILES as Record<string, WeatherAtmosphereProfile | undefined>)[effectKey]
  return profile || NEUTRAL_WEATHER_ATMOSPHERE
}

/** 该天气是否会出现雷电（舞台据此决定要不要为闪光留出渲染预算）。 */
export function weatherAtmosphereHasLightning(effectKey: unknown): boolean {
  return effectKey === 'lightning-rainy'
}
