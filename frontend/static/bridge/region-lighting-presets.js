/**
 * 轻量柔光（region）模式的固定光照参数。
 */
// 十二项共享参数：主光 / 顶光 / 补光三束的角度与强度、环境光、半球光、主光阴影强度。
const REGION_LIGHTING_BASE = Object.freeze({
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
    topIntensity: 0.12
  }),
  // 两种场景风格只在整体曝光与地板亮度上分档：暖阳原木（warm-wood）更暗更沉，默认风格更亮。
  REGION_LIGHTING_PRESETS_BY_STYLE = Object.freeze({
    default: Object.freeze({ ...REGION_LIGHTING_BASE, exposure: 0.95, floorBrightness: 75 }),
    "warm-wood": Object.freeze({ ...REGION_LIGHTING_BASE, exposure: 0.6, floorBrightness: 50 })
  });
/**
 * 轻量柔光模式的固定光照参数表，按场景风格分档。
 */
export const REGION_LIGHTING_PRESETS = REGION_LIGHTING_PRESETS_BY_STYLE;
/**
 * 给控件属性补上固定光照参数。
 * @param {object} properties 控件属性（含 lightingMode / sceneStyle）。
 * @returns {object} 补好 baseLighting 的新属性对象。
 */
export function withRegionLightingPreset(properties) {
  if (properties?.lightingMode !== "region") {
    return properties;
  }
  const preset =
    REGION_LIGHTING_PRESETS[properties.sceneStyle === "warm-wood" ? "warm-wood" : "default"];
  return { ...properties, baseLighting: { ...preset } };
}
