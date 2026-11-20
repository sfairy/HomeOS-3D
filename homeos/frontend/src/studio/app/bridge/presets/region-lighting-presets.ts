const baseLightingPreset = {
  ambientIntensity: 0.16,
  fillAzimuth: -48,
  fillElevation: 28,
  fillIntensity: 0.16,
  hemisphereIntensity: 0.58,
  mainAzimuth: 139,
  mainElevation: 55,
  mainIntensity: 2.05,
  mainShadowIntensity: 0.18,
  topAzimuth: 90,
  topElevation: 86,
  topIntensity: 0.12,
}
const REGION_LIGHTING_PRESETS = Object.freeze({
  default: Object.freeze({
    ...baseLightingPreset,
    exposure: 0.95,
    floorBrightness: 75,
  }),
  'warm-wood': Object.freeze({
    ...baseLightingPreset,
    exposure: 0.6,
    floorBrightness: 50,
  }),
  // 自然木语的墙面自发光更高（暖砂墙 + 木饰面），区域光再按暖木那档压到 0.6 会糊成一片；
  // 曝光取中值、地面亮度略提，让踢脚与家具阴影还能分辨。
  'natural-wood': Object.freeze({
    ...baseLightingPreset,
    exposure: 0.72,
    floorBrightness: 62,
  }),
})

/** 风格 → 区域光预设键。未知风格回落到默认档。 */
function regionPresetKey(sceneStyle: unknown): 'default' | 'warm-wood' | 'natural-wood' {
  if (sceneStyle === 'warm-wood') return 'warm-wood'
  if (sceneStyle === 'natural-wood') return 'natural-wood'
  return 'default'
}

export function withRegionLightingPreset(sceneConfig: any) {
  if (sceneConfig.lightingMode !== 'region') return sceneConfig
  const presetKey = regionPresetKey(sceneConfig.sceneStyle)
  return {
    ...sceneConfig,
    baseLighting: {
      ...REGION_LIGHTING_PRESETS[presetKey],
    },
  }
}
