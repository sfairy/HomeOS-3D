/**
 * 天气层的配色：按**场景风格**取降水与云的颜色。
 *
 * 为什么必须跟着风格走：天气层是一张透明画布，颜色是画在「当前的 3D 背景」上的。
 * 默认风格与暖阳原木是深色底，暖白（`#fff6dd`）正好；自然木语的底图是暖砂色，
 * 同一组暖白画上去几乎是隐形的 —— 雨存在、但看不见，用户只会以为天气没生效。
 *
 * 这里只做「取色」，不读 DOM、不看画布：调用方（`weather-effects`）把风格传进来，
 * 换风格后重绘一帧即可。
 */

export type WeatherPalette = {
  /** 雨丝主色（`#rrggbb`）。 */
  rain: string
  /** 雪花主色（`#rrggbb`）。 */
  snow: string
  /** 云体主色（`r,g,b` 片段，供 `rgba()` 拼接）。 */
  cloudTint: string
  /** 云体底色（`r,g,b` 片段）。 */
  cloudBottom: string
  /** 云层不透明度系数：浅底图上要压低，否则云会盖住户型。 */
  cloudAlphaScale: number
}

/** 深色底（默认 / 暖阳原木）：沿用 0.8.7 之前的暖白。 */
const DARK_PALETTE: WeatherPalette = Object.freeze({
  rain: '#fff6dd',
  snow: '#fff6dd',
  cloudTint: '196,202,214',
  cloudBottom: '122,130,148',
  cloudAlphaScale: 1,
})

/**
 * 浅色底（自然木语）：雨用冷灰、雪用近白。
 *
 * 雨若也用近白，在 `#e9e2d4` 的砂色地上几乎与背景同亮度；雪若用冷灰，
 * 又会被当成「脏点」。这一组是在浅底上能同时分辨雨与雪的折中。
 */
const LIGHT_PALETTE: WeatherPalette = Object.freeze({
  rain: '#4a5560',
  snow: '#ffffff',
  cloudTint: '226,232,238',
  cloudBottom: '176,186,198',
  cloudAlphaScale: 0.72,
})

/** 风格 → 配色。未知风格按深色底处理（与既有默认一致，不会突然变大白点）。 */
export function weatherPalette(sceneStyle: unknown): WeatherPalette {
  return sceneStyle === 'natural-wood' ? LIGHT_PALETTE : DARK_PALETTE
}
