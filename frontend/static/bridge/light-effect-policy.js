/**
 * 灯光效果的固定区间与默认值。
 */
export const LIGHT_EFFECT_RANGE = Object.freeze({
  brightnessMin: 1,
  brightnessMax: 100,
  temperatureMin: 2700,
  temperatureMax: 6500
});
/**
 * 效果默认值：实体不上报 brightness / kelvin 时展示的兜底。
 */
export const LIGHT_EFFECT_DEFAULTS = Object.freeze({
  brightness: 100,
  kelvin: 3500
});
/**
 * 把固定效果区间与默认值套到单个灯光项上。
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
