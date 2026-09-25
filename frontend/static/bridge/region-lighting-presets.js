/**
 * 轻量柔光（region）模式的固定光照参数。
 *
 * 历史沿革：这些数值原先由布光算法按户型自动推算，0.6.3 起收敛成 preset —— 同一 sceneStyle 下
 * 所有户型共用一套光照，解决「同型号灯在不同户型里明暗不一致」的观感漂移。
 *
 * `withRegionLightingPreset` 只在 `lightingMode === 'region'` 时生效：逐区域布光只在轻量柔光下
 * 成立，其它模式没有 baseLighting 这个概念，原样返回避免写入无用字段。
 *
 * 键名与 studio 侧 scene document 的 baseLighting 一一对应（studio-app.js / scene-update.js 都读它），
 * 改名前必须两侧同步，否则渲染会整段退化成默认光照。
 */
// 十二项共享参数：主光 / 顶光 / 补光三束的角度与强度、环境光、半球光、主光阴影强度。
// 角度单位是度，强度是无量纲系数。三束光的 azimuth/elevation 决定明暗方向，改动会直接影响
// 墙体投影位置，属于观感级改动。
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
  // exposure 是渲染曝光倍数，floorBrightness 是地板亮度百分比。
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
 *
 * 非 region 模式或属性缺失时原样返回（不新增 baseLighting 键）；region 模式下用预设整体覆盖
 * `baseLighting`，`sceneStyle` 只认 `warm-wood`，其余落到 `default` 分档。
 *
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
