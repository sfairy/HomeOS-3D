/**
 * 灯光效果的固定区间与默认值。
 *
 * 历史沿革：亮度与色温的可调区间原先是按实体的 `supported_color_modes` / `min_color_temp_kelvin`
 * 等能力位逐个推算的，导致同一盏灯换个实体、换个房间，滑杆量程就变一次；0.6.3 起收敛成固定值 ——
 * 所有灯共用同一段区间，滑杆手感一致，实体能力只决定「能不能调」而不再决定「能调到哪」。
 *
 * 与 light-motion.js 的约定：effectRange 是**效果的绝对值区间**，不是百分比。
 * 亮度按 1~100% 的百分比线性铺到 [brightnessMin, brightnessMax]（150 表示允许把效果预设到 150%），
 * 色温直接是开尔文。实体自身量程与效果区间是两个独立概念，映射逻辑仍在 light-motion.js。
 *
 * 因此本模块的两个常量必须成套使用：只改区间不改默认值会让不支持调光/调色的灯停在区间外。
 */
// 效果区间：亮度 50~150（百分比），色温 2700~6500K（覆盖常见家用灯具的暖白到冷白）。
export const LIGHT_EFFECT_RANGE = Object.freeze({
  brightnessMin: 50,
  brightnessMax: 150,
  temperatureMin: 2700,
  temperatureMax: 6500
});
/**
 * 效果默认值：实体不上报 brightness / kelvin 时展示的兜底。
 *
 * 亮度取区间上限 150%（「效果全开」），色温取 3500K（中性偏暖，最接近常见默认观感）。
 * 这两个值必须落在 LIGHT_EFFECT_RANGE 内，否则滑杆会停在端点之外。
 */
export const LIGHT_EFFECT_DEFAULTS = Object.freeze({
  brightness: 150,
  kelvin: 3500
});
/**
 * 把固定效果区间与默认值套到单个灯光项上。
 *
 * 返回新对象；effectRange / effectDefaults 整体覆盖 —— 灯光项上原有的按实体能力推算的值会被替换，
 * 这正是「固定效果」的含义。其余字段原样透传。
 *
 * @param {object} lightItem 灯光项（studio 楼层 items 或控件属性 lights 里的元素）。
 * @returns {object} 套好固定效果区间的灯光项。
 */
export function withFixedLightEffects(lightItem) {
  return {
    ...lightItem,
    effectRange: { ...LIGHT_EFFECT_RANGE },
    effectDefaults: { ...LIGHT_EFFECT_DEFAULTS }
  };
}
