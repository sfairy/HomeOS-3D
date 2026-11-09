/**
 * 面光（灯带）的 LTC 查找表。
 *
 * three 的 `RectAreaLight` 着色靠两张 LTC 纹理，必须先 `RectAreaLightUniformsLib.init()`
 * 把它们挂到 `UniformsLib` 上；之前从没初始化，镜面项恒为 0、个别像素读出 NaN。
 * 支持浮点线性过滤时用 FLOAT 版，否则用 HALF 版（与 three 的 `WebGLLights` 同一判定）。
 */
import { RectAreaLightUniformsLib } from '/static/vendor/three/0.187.0/RectAreaLightUniformsLib.js'

type LtcThree = { UniformsLib: Record<string, unknown> }
type LtcRenderer = { extensions?: { has?(name: string): boolean } }

let initialized = false

export function stripLightLtcTextures(THREE: LtcThree, renderer: LtcRenderer | null | undefined) {
  if (!initialized) RectAreaLightUniformsLib.init(), (initialized = true)
  const floatLinear = renderer?.extensions?.has?.('OES_texture_float_linear') === true,
    library = THREE.UniformsLib
  return {
    ltc1: floatLinear ? library.LTC_FLOAT_1 : library.LTC_HALF_1,
    ltc2: floatLinear ? library.LTC_FLOAT_2 : library.LTC_HALF_2,
  }
}
