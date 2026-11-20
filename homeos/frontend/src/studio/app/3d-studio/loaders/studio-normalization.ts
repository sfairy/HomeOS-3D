export {
  isCourtyardDrawing,
  normalizeCourtyardDrawing,
} from '../plan/courtyard-drawing'
// 收藏模型（98 款新增 + 12 款改写）要按自己的尺寸下限摆放，不能一律套用
// 通用的 10cm / 5cm。`collection-models.ts` 只有一条 `import type`，不会形成运行期环。
import { COLLECTION_MODELS } from './external-models/collection-models'
import { finite, normalizeFullRotation } from './studio-number'
import { clampNumber } from '../../shared/util/number'
export { finite, normalizeFullRotation }
/**
 * 这些「小件 / 挂墙件」按 1cm 级别下限处理。
 */
const MIN_FOOTPRINT_ITEM_TYPES = [
  'airer',
  'presence',
  'smart-socket-86',
  'wall-art',
  'wall-clock',
  'switch-console',
  'smart-display',
  'up-down-wall-lamp',
]

/**
 * 该款模型是否属于「收藏模型」且**不是**改写既有款。
 *
 * `replaces: true` 的 12 款是重绘既有模型（`microwave` / `bed` / `basin`…），尺寸下限要
 * 沿用被替换款的 10cm / 5cm —— 否则同一件家具从 10cm 下限放宽到 1cm，已保存户型的
 * 摆放校验会跟着变。
 */
function isNewCollectionModel(itemType: any) {
  const collectionModel = COLLECTION_MODELS[itemType]
  return Boolean(collectionModel) && !collectionModel.replaces
}

export function itemMinimumFootprint(footprintItemType: any) {
  return isNewCollectionModel(footprintItemType) || MIN_FOOTPRINT_ITEM_TYPES.includes(footprintItemType) ? 0.01 : 0.1
}
export function itemMinimumHeight(heightItemType: any) {
  // 台面：整件就是一块 5cm 厚的板（`countertop.glb` 板厚 0.05m），不跟收藏批其它薄件
  // 一起放到 4mm —— 属性面板「高（m）」的下限与场景载荷的收敛都取这个值，再薄就不是台面了。
  if (heightItemType === 'countertop') return 0.05
  if (isNewCollectionModel(heightItemType)) return 0.004
  return heightItemType?.startsWith('courtyard-')
    ? 0.01
    : heightItemType === 'planlabel'
      ? 0.001
      : heightItemType === 'rug' || heightItemType === 'round-rug'
        ? 0.004
        : 0.05
}
const NEGATIVE_ELEVATION_ITEM_TYPES: readonly unknown[] = ['wallcabinet', 'tv', 'shower']
export function itemMinimumElevation(elevationItemType: unknown) {
  return NEGATIVE_ELEVATION_ITEM_TYPES.includes(elevationItemType) ? -6 : 0
}
/** 属性面板「离地（m）」的悬停提示。 */
/**
 * 「离地」字段的类型化语义（0.8.7 `elevationMeaning`）：
 * 标签 + 提示都随类型变化 —— 同一件家具，「底座安装点」与「机身顶部安装面」
 * 是两个完全不同的基准面，只写「离地」会让人按相反方向调。
 */
export function itemElevationMeaning(elevationItemType: unknown): { label: string; hint: string } {
  if (elevationItemType === 'ceilingfan' || elevationItemType === 'ceiling-fan') {
    return { label: '顶部安装高度', hint: '吊扇顶部安装面距本层地面的高度，扇体向下延伸。' }
  }
  if (['downlight', 'ceilinglight', 'striplight'].includes(elevationItemType as string)) {
    return { label: '光源安装高度', hint: '沿用当前灯具的安装基准；发光尺寸和出光角度独立调整。' }
  }
  if (elevationItemType === 'airer') {
    return { label: '顶部安装高度', hint: '机身顶部安装面距本层地面的高度；伸降长度独立调整。' }
  }
  if (itemMinimumElevation(elevationItemType) < 0) {
    return { label: '安装偏移', hint: '相对模型原有安装高度的偏移；允许负值，保留旧户型含义。' }
  }
  if (['camera', 'presence'].includes(elevationItemType as string)) {
    return { label: '底座安装高度', hint: '底座安装点距本层地面的高度；旋转后几何上下界随姿态变化。' }
  }
  return { label: '底部离地', hint: '保留模型原点的离地值；下方实际高度范围按已加载的三维几何显示。' }
}
/** 兼容旧签名：只要提示文本。 */
export function itemElevationHint(elevationItemType: unknown) {
  return itemElevationMeaning(elevationItemType).hint
}
export function normalizePoint(rawPoint: any) {
  return {
    x: finite(rawPoint?.x),
    y: finite(rawPoint?.y),
  }
}
export function normalizeLabelText(rawLabelText: any, fallbackLabelText: any, maxLabelLength: any) {
  return (
    String(rawLabelText ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLabelLength) || fallbackLabelText
  )
}
export function kelvinToRgbHex(kelvinValue: any) {
  const normalizedKelvin = clampNumber(finite(kelvinValue, 3000), 2200, 6500) / 100,
    redChannel = normalizedKelvin <= 66 ? 255 : 329.698727446 * (normalizedKelvin - 60) ** -0.1332047592,
    greenChannel =
      normalizedKelvin <= 66
        ? 99.4708025861 * Math.log(normalizedKelvin) - 161.1195681661
        : 288.1221695283 * (normalizedKelvin - 60) ** -0.0755148492,
    blueChannel =
      normalizedKelvin >= 66
        ? 255
        : normalizedKelvin <= 19
          ? 0
          : 138.5177312231 * Math.log(normalizedKelvin - 10) - 305.0447927307,
    clampChannel = (channelValue: any) => Math.round(clampNumber(channelValue, 0, 255))
  return (clampChannel(redChannel) << 16) | (clampChannel(greenChannel) << 8) | clampChannel(blueChannel)
}
export function normalizeFixedCameraView(rawCameraView: any) {
  if (!rawCameraView || typeof rawCameraView != 'object') return null
  const positionVector = {
      x: clampNumber(finite(rawCameraView.position?.x), -500, 500),
      y: clampNumber(finite(rawCameraView.position?.y), -500, 500),
      z: clampNumber(finite(rawCameraView.position?.z), -500, 500),
    },
    targetVector = {
      x: clampNumber(finite(rawCameraView.target?.x), -500, 500),
      y: clampNumber(finite(rawCameraView.target?.y), -500, 500),
      z: clampNumber(finite(rawCameraView.target?.z), -500, 500),
    }
  if (
    Math.hypot(
      positionVector.x - targetVector.x,
      positionVector.y - targetVector.y,
      positionVector.z - targetVector.z,
    ) < 0.1
  )
    return null
  const fixedCameraView: {
    mode: string
    view: string
    topRotation: number
    position: { x: number; y: number; z: number }
    target: { x: number; y: number; z: number }
    visibleHeight: number
    fov: number
    focalLength: number | null
    frameSize?: number
  } = {
    mode: rawCameraView.mode === 'perspective' ? 'perspective' : 'orthographic',
    view: rawCameraView.view === 'top' ? 'top' : 'free',
    topRotation: (((Math.round(finite(rawCameraView.topRotation, 0) / 90) * 90) % 360) + 360) % 360,
    position: positionVector,
    target: targetVector,
    visibleHeight: clampNumber(finite(rawCameraView.visibleHeight, 10), 1, 100),
    fov: clampNumber(finite(rawCameraView.fov, 36), 20, 80),
    focalLength:
      rawCameraView.focalLength !== null &&
      rawCameraView.focalLength !== undefined &&
      Number.isFinite(Number(rawCameraView.focalLength))
        ? clampNumber(finite(rawCameraView.focalLength, 50), 18, 120)
        : null,
  }
  return (
    Number.isFinite(Number(rawCameraView.frameSize)) &&
      Number(rawCameraView.frameSize) > 0 &&
      (fixedCameraView.frameSize = clampNumber(finite(rawCameraView.frameSize, 10), 1, 100)),
    fixedCameraView
  )
}
export function normalizeCameraSettings(cameraSettings: any) {
  return {
    cameraView: cameraSettings?.cameraView === 'top' ? 'top' : 'free',
    cameraTopRotation: (((Math.round(finite(cameraSettings?.cameraTopRotation, 0) / 90) * 90) % 360) + 360) % 360,
    cameraMode: cameraSettings?.cameraMode === 'orthographic' ? 'orthographic' : 'perspective',
    cameraFocalLength: clampNumber(finite(cameraSettings?.cameraFocalLength, 50), 18, 120),
  }
}
export const DEFAULT_BASE_LIGHTING = Object.freeze({
  exposure: 1.05,
  hemisphereIntensity: 0.58,
  ambientIntensity: 0.16,
  mainIntensity: 2.05,
  mainAzimuth: 139,
  mainElevation: 55,
  mainShadowIntensity: 0.18,
  fillIntensity: 0.16,
  fillAzimuth: -48,
  fillElevation: 28,
  topIntensity: 0.12,
  topAzimuth: 90,
  topElevation: 86,
})
/**
 * 支持的风格主题（与 `SCENE_STYLES` 的 id 逐一对应）。
 *
 * 0.8.7 起「基础光照」按主题分别保存：默认风格、暖阳原木、自然木语各自独立，
 * 互不影响。这份键表是前端唯一的真源，后端 `domains/studio3d/lighting.py` 与本表同源。
 */
export const LIGHTING_THEMES = ['default', 'warm-wood', 'natural-wood'] as const
export type LightingTheme = (typeof LIGHTING_THEMES)[number]

/** `{theme: baseLighting}` 的收敛：未知名丢弃、每份光照按同一套区间规整。 */
export function normalizeBaseLightingByTheme(
  value: unknown,
): Partial<Record<LightingTheme, ReturnType<typeof normalizeBaseLighting>>> {
  const source = value && typeof value == 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  const result: Partial<Record<LightingTheme, ReturnType<typeof normalizeBaseLighting>>> = {}
  for (const theme of LIGHTING_THEMES) {
    if (source[theme] !== undefined) result[theme] = normalizeBaseLighting(source[theme])
  }
  return result
}

/** 取某个主题的光照；该主题还没调过时回落到当前编辑用的那份。 */
export function baseLightingForTheme(byTheme: unknown, theme: unknown, fallback: unknown) {
  const normalized = normalizeBaseLightingByTheme(byTheme)
  const key: LightingTheme = (LIGHTING_THEMES as readonly string[]).includes(String(theme))
    ? (theme as LightingTheme)
    : 'default'
  return normalized[key] ?? fallback
}

export function normalizeBaseLighting(baseLighting: any) {
  const lightingConfig = baseLighting && typeof baseLighting == 'object' ? baseLighting : {}
  return {
    exposure: clampNumber(finite(lightingConfig.exposure, DEFAULT_BASE_LIGHTING.exposure), 0.5, 2),
    ...(lightingConfig.floorBrightness !== undefined
      ? {
          floorBrightness: clampNumber(finite(lightingConfig.floorBrightness, 100), 50, 150),
        }
      : {}),
    hemisphereIntensity: clampNumber(
      finite(lightingConfig.hemisphereIntensity, DEFAULT_BASE_LIGHTING.hemisphereIntensity),
      0,
      3,
    ),
    ambientIntensity: clampNumber(
      finite(lightingConfig.ambientIntensity, DEFAULT_BASE_LIGHTING.ambientIntensity),
      0,
      2,
    ),
    mainIntensity: clampNumber(finite(lightingConfig.mainIntensity, DEFAULT_BASE_LIGHTING.mainIntensity), 0, 5),
    mainAzimuth: clampNumber(finite(lightingConfig.mainAzimuth, DEFAULT_BASE_LIGHTING.mainAzimuth), -180, 180),
    mainElevation: clampNumber(finite(lightingConfig.mainElevation, DEFAULT_BASE_LIGHTING.mainElevation), 5, 89),
    mainShadowIntensity: clampNumber(
      finite(lightingConfig.mainShadowIntensity, DEFAULT_BASE_LIGHTING.mainShadowIntensity),
      0,
      1,
    ),
    fillIntensity: clampNumber(finite(lightingConfig.fillIntensity, DEFAULT_BASE_LIGHTING.fillIntensity), 0, 3),
    fillAzimuth: clampNumber(finite(lightingConfig.fillAzimuth, DEFAULT_BASE_LIGHTING.fillAzimuth), -180, 180),
    fillElevation: clampNumber(finite(lightingConfig.fillElevation, DEFAULT_BASE_LIGHTING.fillElevation), 0, 89),
    topIntensity: clampNumber(finite(lightingConfig.topIntensity, DEFAULT_BASE_LIGHTING.topIntensity), 0, 3),
    topAzimuth: clampNumber(finite(lightingConfig.topAzimuth, DEFAULT_BASE_LIGHTING.topAzimuth), -180, 180),
    topElevation: clampNumber(finite(lightingConfig.topElevation, DEFAULT_BASE_LIGHTING.topElevation), 0, 89),
  }
}
