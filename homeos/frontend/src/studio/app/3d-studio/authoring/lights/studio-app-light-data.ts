/**
 * studio-app.ts 的灯光属性数据与工具函数。
 *
 * 仅依赖自身参数与导入的几何工具。
 */

import { clamp as clamp2 } from '../../plan/geometry';
import { finite as finite2 } from '../../loaders/studio-normalization';

/** 灯光预设目录（色温 / 亮度 / 范围 / 角度）。 */
export const lightPresetCatalog = {
  downlight: {
    temperature: 3000,
    brightness: 48,
    range: 3.2,
    angle: 48,
  },
  ceilinglight: {
    temperature: 3500,
    brightness: 62,
    range: 5,
    angle: 110,
  },
  striplight: {
    temperature: 3000,
    brightness: 42,
    range: 3.5,
    angle: 100,
  },
};

/** 灯光强度系数（按类型冻结）。 */
export const lightIntensityFactor = Object.freeze({
  downlight: 1.1,
  ceilinglight: 0.792,
  striplight: 1.3,
});

/** 灯光角度上限（按类型）。 */
export const lightAngleLimit = {
  downlight: 120,
  ceilinglight: 150,
  striplight: 120,
};

/** 按灯光类型取角度上限（未知类型默认 120）。 */
export function lightAngleLimitForType(lightTypeKey: any) {
  return (lightAngleLimit as any)[lightTypeKey] || 120;
}

/** 灯光属性字段表（label / input 选择器 / 单位）。 */
export const lightPropertyFields = {
  lightTemperature: {
    label: "色温",
    input: "#light-temperature",
    unit: "K",
  },
  lightBrightness: {
    label: "亮度",
    input: "#light-brightness",
    unit: "%",
  },
  lightRange: {
    label: "照射范围",
    input: "#light-range",
    unit: "m",
  },
  lightAngle: {
    label: "光束角",
    input: "#light-angle",
    unit: "°",
  },
  elevation: {
    label: "离地高度",
    input: "#item-elevation",
    unit: "m",
  },
};

/** 按字段名规范化灯光属性值（范围 / 精度 / 角度上限）。 */
export function normalizeLightPropertyValue(lightPropertyName: any, propertyValue: any, maxAngleLimit: any) {
  return lightPropertyName === "lightTemperature"
    ? Math.round(clamp2(finite2(propertyValue, 3000), 2200, 6500))
    : lightPropertyName === "lightBrightness"
      ? Math.round(clamp2(finite2(propertyValue, 50), 0, 100))
      : lightPropertyName === "lightRange"
        ? Math.round(clamp2(finite2(propertyValue, 3.5), 0.5, 10) * 10) / 10
        : lightPropertyName === "lightAngle"
          ? Math.round(
              clamp2(finite2(propertyValue, 90), 15, lightAngleLimitForType(maxAngleLimit)),
            )
          : lightPropertyName === "elevation"
            ? Math.round(clamp2(finite2(propertyValue, 2.7), 0, 6) * 100) / 100
            : finite2(propertyValue);
}

/** 按字段名格式化灯光属性值（附加单位）。 */
export function formatLightPropertyValue(fieldName: any, fieldValue: any) {
  const fieldSpec = (lightPropertyFields as any)[fieldName];
  if (!fieldSpec) return String(fieldValue);
  const fixed = ["lightRange", "elevation"].includes(fieldName)
    ? Number(fieldValue).toFixed(fieldName === "elevation" ? 2 : 1)
    : Math.round(fieldValue);
  return ["%", "°"].includes(fieldSpec.unit)
    ? "" + fixed + fieldSpec.unit
    : fixed + " " + fieldSpec.unit;
}
