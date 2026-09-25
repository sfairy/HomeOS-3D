/**
 * 分页观感预设：把「每页变暗程度 / 每页饱和度 / 聚焦变暗 / 聚焦暗角」四组观感参数冻结成常量。
 *
 * 历史沿革：这些数值原先是模板里的硬编码默认值，0.6.3 起收敛成 preset —— 观感不再随控件配置漂移，
 * 只随 sceneStyle 分档。注意本模块**不是**「用户可选的多套预设」：0.6.3 与 0.6.5 的
 * `default` 与 `warm-wood` 指向同一份数值，即两个场景风格下的分页观感完全一致（保留分档结构
 * 只是为了以后能各自调参）。删除 default 分档或给两档写不同数值都会改变既有观感。
 *
 * 用法：模板默认值取 `withPageAppearancePreset({})`；载入既有场景时同样经它归一，
 * 这样「模板新建」与「旧草稿读入」两条路径拿到的是同一组数值，不会出现新老观感不一致。
 *
 * 键名由渲染层直接消费（stage.js 与 config-editor.js 都按这四个键读），改名必须两侧同步。
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
  // 每页饱和度：全部 100（不降饱和）。保留这个键是因为渲染层会读，缺了会退化成默认值。
  PAGE_SATURATION = Object.freeze({
    overview: 100,
    light: 100,
    environment: 100,
    devices: 100,
    vacuum: 100,
    security: 100
  }),
  // 聚焦态的变暗与暗角统一为 0：0.6.3 起聚焦只做相机推近，不再叠画面压暗。
  // 调大这两个值会让聚焦时画面明显发黑，属于观感级改动，需与渲染层一起评估。
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
 *
 * `sceneStyle` 只认 `warm-wood`，其余（含缺省）一律落到 `default` 分档 —— 与 definition.js 的
 * normalizeSceneStyle 口径一致。返回新对象，不改原对象；预设值整体覆盖同名键，
 * 因此调用方传进来的旧值会被替换成当前预设（这正是「收敛」的含义）。
 *
 * @param {object} properties 控件属性（至少含 sceneStyle，可只传 {}）。
 * @returns {object} 套用预设后的新属性对象。
 */
export function withPageAppearancePreset(properties) {
  const preset = PAGE_APPEARANCE_PRESETS[properties?.sceneStyle === "warm-wood" ? "warm-wood" : "default"];
  // structuredClone 而不是浅拷贝：preset 里有两个嵌套对象，浅拷贝会让调用方改到冻结常量。
  return { ...properties, ...structuredClone(preset) };
}
