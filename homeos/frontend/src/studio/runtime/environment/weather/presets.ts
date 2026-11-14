import type { WeatherEffectKey } from '@/studio/platform/weather-settings'

/**
 * 单个天气态的表现参数。
 *
 * 所有强度都是「相对量」：粒子数还会再乘画布面积系数与自适应画质因子，
 * 所以同一档在平板与 4K 上观感一致。缺省字段等于「不画这一层」。
 *
 * **没有任何「背景遮盖层」字段**：这里没有天空渐变、没有压下来的云幕、没有雾幕、
 * 没有全屏调色与暗角。天气层是盖在 3D 舞台上的一张透明画布，一旦给整屏上色，
 * 户型、家具与设备图标的可读性就会被削弱；画面里只能出现**具体的物体**：
 * 雨丝、雪花、漂移的云朵、闪动的星星，以及它们落在地板上留下的水痕。
 */
export type WeatherEffectPreset = {
  /** 雨滴强度，1 约等于满屏细密雨丝。 */
  rain?: number
  /** 雨丝长度缩放（雨夹雪短、雷雨长）。 */
  rainScale?: number
  /** 雨滴下落速度缩放。 */
  rainSpeed?: number
  /** 近景雨层占比（0~1），越大越有「雨打在镜头上」的压迫感。 */
  rainDepth?: number
  snow?: number
  snowScale?: number
  /** 落地水花强度（0~1.4）：每秒溅射次数与溅射水珠数。 */
  splash?: number
  /**
   * 落地溅射的形态。
   *
   * 雨是液体，砸在地上会溅水珠、扩散涟漪；雪不是 —— 雪片落地只会轻轻塌进雪里，
   * 最多扬起一小团雪粉，没有任何水珠与水面涟漪。所以**形态必须跟降水种类走**，
   * 不能只按 `splash` 数值画一套水花（雪天溅水是明显的穿帮）。
   *
   * 缺省时按 `rain` 是否存在于预设推导：有雨按 `water`，只有雪按 `snow`。
   */
  splashStyle?: 'water' | 'snow'
  /** 湿地反光强度（0~1）。 */
  wet?: number
  /** 目标积雪厚度（0~0.2），会缓慢累积而不是突变。 */
  snowCover?: number
  thunder?: boolean
  /** 云朵数量系数（0~1.4）：只画一朵朵会漂移的云，不铺云幕。 */
  clouds?: number
  /** 云朵漂移速度（画面宽度/秒）；0.03 约 33 秒横穿一屏。 */
  cloudDrift?: number
  /** 云体主色（`r,g,b` 片段）：降水天气是压暗的铅灰，晴天才是纯白。 */
  cloudTint?: string
  /** 云体底色（`r,g,b` 片段）：比主色更暗更冷，压出云底体积。 */
  cloudBottom?: string
  /** 云层不透明度系数（0~1）：降水时压得更沉，但不能盖住户型。 */
  cloudAlpha?: number
  /** 星点强度（0~1.4）。 */
  stars?: number
  /** 是否放流星：晴夜偶尔划过一颗，画面才有「时间在走」的感觉。 */
  meteor?: boolean
}

/**
 * 效果键 → 表现参数。类型是 `Record<WeatherEffectKey, ...>`，漏写任何一种都会
 * 在 typecheck 阶段报错，不会静默退化成「无效果」。
 *
 * 六种天气分两类：
 * - 降水（雨 / 雪 / 雷雨 / 雨夹雪）：雨丝雪花 + 低空暗云 + 地面水痕积雪；
 * - 只有局部元素（多云 / 晴夜）：多云是几朵慢慢漂移的云，晴夜是一片闪烁的星。
 *
 * 降水天气必须有云：雨从晴空落下是「特效」，雨从低压的暗云下落下才是「天气」。
 * 云仍然只在画面上部活动、单朵有透明度上限，因此不会压住户型与设备图标。
 */
export const WEATHER_EFFECT_PRESETS: Readonly<Record<WeatherEffectKey, WeatherEffectPreset>> = Object.freeze({
  rainy: {
    rain: 0.72,
    splash: 0.9,
    splashStyle: 'water',
    wet: 0.62,
    // 中雨：一整片低沉的铅灰云，慢慢压过来。
    clouds: 0.9,
    cloudDrift: 0.042,
    cloudTint: '196,202,214',
    cloudBottom: '122,130,148',
    cloudAlpha: 0.58,
  },
  snowy: {
    snow: 0.7,
    snowScale: 1.08,
    // 雪落地不是水花：只扬起一小团雪粉（强度与频率都比雨低得多）。
    splash: 0.3,
    splashStyle: 'snow',
    snowCover: 0.16,
    // 雪云偏亮偏慢：云层在雪天是「亮而厚」的，不是铅灰。
    clouds: 0.86,
    cloudDrift: 0.024,
    cloudTint: '228,234,246',
    cloudBottom: '164,174,196',
    cloudAlpha: 0.52,
  },
  'lightning-rainy': {
    rain: 1.1,
    rainScale: 1.15,
    rainSpeed: 1.2,
    rainDepth: 0.7,
    splash: 1.1,
    splashStyle: 'water',
    wet: 0.7,
    thunder: true,
    // 雷雨：最暗、最快、最厚的云，闪电会从云底照下来。
    clouds: 1.2,
    cloudDrift: 0.058,
    cloudTint: '152,158,174',
    cloudBottom: '82,88,104',
    cloudAlpha: 0.74,
  },
  'snowy-rainy': {
    rain: 0.65,
    snow: 0.75,
    snowScale: 1.05,
    splash: 0.6,
    splashStyle: 'water',
    wet: 0.35,
    snowCover: 0.08,
    // 雨夹雪：灰白之间的云，比纯雪暗、比纯雨亮。
    clouds: 0.92,
    cloudDrift: 0.036,
    cloudTint: '208,214,228',
    cloudBottom: '138,146,166',
    cloudAlpha: 0.56,
  },
  // 多云：云朵是画面里唯一的元素，所以数量与漂移都给足，才能看出「在动」。
  partlycloudy: {
    clouds: 1,
    cloudDrift: 0.03,
    cloudTint: '250,252,255',
    cloudBottom: '196,204,220',
    cloudAlpha: 1,
  },
  // 晴夜：星点是唯一的视觉主体，强度拉满，靠星芒与慢闪撑起画面，再偶尔划一颗流星。
  'clear-night': {
    stars: 1.4,
    meteor: true,
  },
})
