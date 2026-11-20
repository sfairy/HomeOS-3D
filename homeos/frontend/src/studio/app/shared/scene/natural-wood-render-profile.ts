/**
 * 自然木语的渲染档位（0.8.7 `natural-wood-render-profile.js` 的对应实现）。
 *
 * 「档位」= 曝光 / 像素比 / 阴影类型与参数 / 相机远近平面的成套取值。
 * 单独成模块的原因：这三组值必须**成套**生效 —— 只调曝光会过曝阴影，
 * 只调阴影半径会让浅色墙面出现一圈灰边，只有一起换才是 0.8.7 的观感。
 *
 * 数值来源：0.8.7 的 `NATURAL_WOOD_RENDER_PROFILE`（含方位角/高度角按向量换算的结果）。
 */

/** 由「指向光源的向量」换算方位角与高度角（度）。与 0.8.7 同一公式。 */
function angleFromVector(x: number, y: number, z: number): { azimuth: number; elevation: number } {
  return {
    azimuth: (Math.atan2(z, x) * 180) / Math.PI,
    elevation: (Math.atan2(y, Math.hypot(x, z)) * 180) / Math.PI,
  }
}

/** 主光方向（0.8.7 `l`）：左前上方。 */
const MAIN_ANGLE = angleFromVector(-5, 8, 5.5)
/** 补光方向（0.8.7 `h`）：右前上方。 */
const FILL_ANGLE = angleFromVector(5, 5, 3)

/** 阴影参数：VSM + 20m 覆盖盒。 */
export const NATURAL_WOOD_SHADOW = Object.freeze({
  type: 'VSMShadowMap',
  mapSize: 2048,
  bias: -0.00012,
  normalBias: 0.006,
  radius: 3.25,
  blurSamples: 12,
  camera: Object.freeze({ left: -20, right: 20, top: 20, bottom: -20, near: 0.5, far: 500 }),
})

/** 光照颜色（白天 / 傍晚切换的是强度，色只换主光一盏）。 */
export const NATURAL_WOOD_COLORS = Object.freeze({
  sky: 0xfff9ef,
  ground: 0xa7967e,
  ambient: 0xfff9ef,
  main: 0xfff0d8,
  eveningMain: 0xffcf95,
  fill: 0xe6edf2,
  top: 0xffffff,
})

/** 环境面板：左前大面光、正上顶光、右后补光。 */
const ENVIRONMENT_PANELS = Object.freeze([
  { size: [5, 5], at: [-4, 3, 0], rotation: [0, Math.PI / 2, 0], color: 0xfff3dd, intensity: 2.6 },
  { size: [7, 4], at: [0, 6, 0], rotation: [Math.PI / 2, 0, 0], color: 0xffffff, intensity: 1.3 },
  { size: [3, 5], at: [5, 2, 3], rotation: [0, -Math.PI / 2, 0], color: 0xf8f7f0, intensity: 0.8 },
])

export const NATURAL_WOOD_RENDER_PROFILE = Object.freeze({
  exposure: 0.92,
  /** 像素比上限：浅色大面积 + VSM 阴影，2x 以上收益很低但开销翻倍。 */
  maxPixelRatio: 1.6,
  camera: Object.freeze({
    fov: 34,
    focalLength: 35 / (2 * Math.tan((34 * Math.PI) / 360)),
    nearMin: 0.02,
    nearMax: 0.6,
    nearDistanceRatio: 0.01,
    farDistanceRatio: 6,
    farMin: 100,
  }),
  floor: Object.freeze({ boardLength: 1.6, boardWidth: 0.18, gap: 0.0014 }),
  environment: Object.freeze({
    background: 0xc9c5bb,
    blur: 0.03,
    near: 0.1,
    far: 50,
    panels: ENVIRONMENT_PANELS,
  }),
  colors: NATURAL_WOOD_COLORS,
  shadow: NATURAL_WOOD_SHADOW,
  base: Object.freeze({
    floorBrightness: 100,
    ambientIntensity: 0,
    mainAzimuth: MAIN_ANGLE.azimuth,
    mainElevation: MAIN_ANGLE.elevation,
    mainShadowIntensity: 0.72,
    fillAzimuth: FILL_ANGLE.azimuth,
    fillElevation: FILL_ANGLE.elevation,
    topAzimuth: 90,
    topElevation: 86,
    topIntensity: 0,
  }),
  day: Object.freeze({
    hemisphereIntensity: 0.9,
    mainIntensity: 2.35,
    fillIntensity: 0.55,
    environmentIntensity: 0.55,
  }),
  evening: Object.freeze({
    hemisphereIntensity: 0.65,
    mainIntensity: 1.25,
    fillIntensity: 0.26,
    environmentIntensity: 0.4,
  }),
})

export type NaturalWoodPhase = 'day' | 'evening'

/** 背景主题 → 光照相位：暮色用傍晚档，其余用白天档。 */
export function naturalWoodPhase(backgroundTheme: unknown): NaturalWoodPhase {
  return backgroundTheme === 'warm-dusk' || backgroundTheme === 'evening' ? 'evening' : 'day'
}

/** 当前相位的基础光照（直接喂给 `applyBaseLighting` 的形状）。 */
export function naturalWoodBaseLighting(phase: NaturalWoodPhase = 'day') {
  const { base, colors } = NATURAL_WOOD_RENDER_PROFILE
  const intensity = NATURAL_WOOD_RENDER_PROFILE[phase]
  return {
    ...base,
    hemisphereIntensity: intensity.hemisphereIntensity,
    mainIntensity: intensity.mainIntensity,
    fillIntensity: intensity.fillIntensity,
    topIntensity: 0,
    // 傍晚把主光换成更黄的暖光，白天保持米白。
    mainColor: phase === 'evening' ? colors.eveningMain : colors.main,
    hemisphereColor: colors.sky,
    hemisphereGroundColor: colors.ground,
    ambientColor: colors.ambient,
    fillColor: colors.fill,
    topColor: colors.top,
    exposure: NATURAL_WOOD_RENDER_PROFILE.exposure,
  }
}

/**
 * 相机近远平面：按「相机到目标的距离」缩放，避免大户型被近裁剪切掉、小户型精度不足。
 * @returns 是否发生了变化（调用方据此决定要不要 `updateProjectionMatrix`）
 */
type CameraLike = {
  position: { distanceTo: (other: unknown) => number }
  isPerspectiveCamera?: boolean
  near: number
  far: number
  updateProjectionMatrix: () => void
}

export function applyNaturalWoodCameraDepth(camera: CameraLike, target: unknown): boolean {
  if (!camera || !target) return false
  const config = NATURAL_WOOD_RENDER_PROFILE.camera
  const distance = Math.max(camera.position.distanceTo(target), 1)
  const near = camera.isPerspectiveCamera
    ? Math.min(config.nearMax, Math.max(config.nearMin, distance * config.nearDistanceRatio))
    : config.nearMin
  const far = Math.max(config.farMin, distance * config.farDistanceRatio)
  if (Math.abs(camera.near - near) < 1e-6 && Math.abs(camera.far - far) < 1e-4) return false
  camera.near = near
  camera.far = far
  camera.updateProjectionMatrix()
  return true
}

/** 渲染器级档位：曝光、像素比上限、阴影类型。 */
export function naturalWoodRenderSettings() {
  return {
    exposure: NATURAL_WOOD_RENDER_PROFILE.exposure,
    maxPixelRatio: NATURAL_WOOD_RENDER_PROFILE.maxPixelRatio,
    shadow: NATURAL_WOOD_SHADOW,
  }
}
