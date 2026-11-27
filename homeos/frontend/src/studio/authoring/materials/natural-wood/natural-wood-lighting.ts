/**
 * 自然木语的灯光（0.8.7 `natural-wood-lighting.js` 的对应实现）。
 *
 * 为什么单独一层而不是直接改 `applyBaseLighting`：基础光照那套是**用户可调**的
 * （14 个参数、分主题保存、面板实时预览），自然木语档位只是它的**一组预设初值**。
 * 把档位写死进 `applyBaseLighting` 会让用户在面板里调过的值每次切风格都被覆盖。
 *
 * 所以这里是「档位 → 灯光对象」的一次性落地，用于：
 * 1. 首次进入自然木语、且该主题还没有用户自定义光照时；
 * 2. 后台主题（白天/傍晚）切换时重刷强度与主光色。
 */

import {
  NATURAL_WOOD_RENDER_PROFILE,
  naturalWoodBaseLighting,
  naturalWoodPhase,
  type NaturalWoodPhase,
} from '../../../app/shared/scene/natural-wood-render-profile'

type ThreeLike = {
  ACESFilmicToneMapping: number
  VSMShadowMap: number
}

/** 需要写值的灯光集合（与 `appCtx` 里的句柄同名）。 */
export interface NaturalWoodLightRig {
  hemisphere?: any
  ambient?: any
  main?: any
  fill?: any
  top?: any
}

export interface NaturalWoodLightingOptions {
  /** 白天 / 傍晚；也可直接传背景主题（`warm-dusk` 会被识别为傍晚）。 */
  phase?: NaturalWoodPhase | string
  /** 舞台（嵌入）里整体减弱，与 `applyBaseLighting` 的 `isEmbedStageMode` 同一语义。 */
  scale?: number
  /** 是否覆盖主光色（午后切傍晚时需要换色）。 */
  applyMainColor?: boolean
}

/** 按档位摆放一盏方向光（方位角/高度角 → 世界坐标）。 */
function placeLight(light: any, azimuth: number, elevation: number, distance: number): void {
  if (!light) return
  const azimuthRad = (azimuth * Math.PI) / 180
  const elevationRad = (elevation * Math.PI) / 180
  const horizontal = Math.cos(elevationRad) * distance
  light.position.set(
    Math.cos(azimuthRad) * horizontal,
    Math.sin(elevationRad) * distance,
    Math.sin(azimuthRad) * horizontal,
  )
  light.target?.position?.set(0, 0, 0)
}

/**
 * 把自然木语档位应用到灯光与渲染器。
 *
 * @returns 落地后的基础光照参数（调用方可以拿去同步滑块面板）
 */
/** 半球光 + 环境光（纯强度与色，无方向）。 */
function applyAmbientRig(
  lights: NaturalWoodLightRig,
  lighting: ReturnType<typeof naturalWoodBaseLighting>,
  colors: typeof NATURAL_WOOD_RENDER_PROFILE.colors,
  scale: number,
): void {
  if (lights.hemisphere) {
    lights.hemisphere.color.setHex(colors.sky)
    lights.hemisphere.groundColor.setHex(colors.ground)
    lights.hemisphere.intensity = lighting.hemisphereIntensity * scale
  }
  if (!lights.ambient) return
  lights.ambient.color.setHex(colors.ambient)
  lights.ambient.intensity = lighting.ambientIntensity * scale
}

/** 主光：色 / 强度 / 位置 / VSM 阴影参数（阴影盒也在这里一次性写入）。 */
function applyMainRig(
  lights: NaturalWoodLightRig,
  lighting: ReturnType<typeof naturalWoodBaseLighting>,
  options: NaturalWoodLightingOptions,
  scale: number,
): void {
  const { shadow } = NATURAL_WOOD_RENDER_PROFILE
  const main = lights.main
  if (!main) return
  if (options.applyMainColor ?? true) main.color.setHex(lighting.mainColor)
  main.intensity = lighting.mainIntensity * scale
  placeLight(main, lighting.mainAzimuth, lighting.mainElevation, 18.4)
  const mainShadow = main.shadow
  if (!mainShadow) return
  Object.assign(mainShadow, {
    bias: shadow.bias,
    normalBias: shadow.normalBias,
    radius: shadow.radius,
    blurSamples: shadow.blurSamples,
    intensity: lighting.mainShadowIntensity,
  })
  if (mainShadow.camera) Object.assign(mainShadow.camera, shadow.camera)
  mainShadow.camera?.updateProjectionMatrix?.()
  mainShadow.mapSize?.set?.(shadow.mapSize, shadow.mapSize)
  mainShadow.needsUpdate = true
}

/**
 * 把自然木语档位应用到灯光与渲染器。
 *
 * @returns 落地后的基础光照参数（调用方可以拿去同步滑块面板）
 */
export function applyNaturalWoodLighting(
  three: ThreeLike,
  renderer: any,
  lights: NaturalWoodLightRig,
  options: NaturalWoodLightingOptions = {},
): ReturnType<typeof naturalWoodBaseLighting> {
  const phase = naturalWoodPhase(options.phase)
  const lighting = naturalWoodBaseLighting(phase)
  const { colors } = NATURAL_WOOD_RENDER_PROFILE
  const scale = options.scale ?? 1

  renderer.toneMapping = three.ACESFilmicToneMapping
  renderer.toneMappingExposure = lighting.exposure
  renderer.shadowMap && (renderer.shadowMap.type = three.VSMShadowMap)

  applyAmbientRig(lights, lighting, colors, scale)
  applyMainRig(lights, lighting, options, scale)

  if (lights.fill) {
    lights.fill.color.setHex(colors.fill)
    lights.fill.intensity = lighting.fillIntensity * scale
    placeLight(lights.fill, lighting.fillAzimuth, lighting.fillElevation, 15.2)
  }
  if (lights.top) {
    lights.top.color.setHex(colors.top)
    lights.top.intensity = lighting.topIntensity * scale
    placeLight(lights.top, lighting.topAzimuth, lighting.topElevation, 16.1)
  }
  return lighting
}

/** 自然木语是否应该接管区域光控制器：接管时必须关掉它，否则与环境贴图叠加发白。 */
export function naturalWoodRegionLightEnabled(): boolean {
  return false
}
