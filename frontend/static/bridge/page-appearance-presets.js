/**
 * 分页观感预设：把「每页变暗程度 / 每页饱和度 / 聚焦变暗 / 聚焦暗角」四组观感参数冻结成常量。
 */
// 每页变暗程度：概览与灯光页不额外压暗，其余四页统一 30。数值是 0~100 的百分比。
const PAGE_DIM_STRENGTH = Object.freeze({
    overview: 0,
    light: 0,
    environment: 30,
    devices: 30,
    vacuum: 30,
    security: 30
  }),
  PAGE_SATURATION = Object.freeze({
    overview: 100,
    light: 100,
    environment: 100,
    devices: 100,
    vacuum: 100,
    security: 100
  }),
  // 聚焦态的变暗与暗角统一为 0：0.6.3 起聚焦只做相机推近，不再叠画面压暗。
  PRESET_VALUES = Object.freeze({
    pageDimStrength: PAGE_DIM_STRENGTH,
    pageSaturation: PAGE_SATURATION,
    focusDimStrength: 0,
    focusVignetteStrength: 0
  });
/**
 * 分页观感预设表。两个场景风格共用同一份数值，故两键指向同一个冻结对象。
 */
export const PAGE_APPEARANCE_PRESETS = Object.freeze({
  default: PRESET_VALUES,
  "warm-wood": PRESET_VALUES
});
/**
 * 把分页观感预设套到控件属性上。
 * @param {object} properties 控件属性（至少含 sceneStyle，可只传 {}）。
 * @returns {object} 套用预设后的新属性对象。
 */
export function withPageAppearancePreset(properties) {
  const preset = PAGE_APPEARANCE_PRESETS[properties?.sceneStyle === "warm-wood" ? "warm-wood" : "default"];
  // structuredClone 而不是浅拷贝：preset 里有两个嵌套对象，浅拷贝会让调用方改到冻结常量。
  return { ...properties, ...structuredClone(preset) };
}
