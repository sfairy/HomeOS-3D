/**
 * 灯光控件的纯计算层：能力探测、颜色空间转换、服务数据拼装与预设确认状态机。
 */

import { entityDomainFromId } from "../../utils/entities.js?v=2609271411";
// 「属性里有没有可用数值」的唯一口径（空串 / 布尔算缺失）：与特效层共用同一份实现。
import { isUsableNumber } from "../../utils/numbers.js?v=2609271411";
import { resolveStateEntry } from "../../utils/state-entry.js?v=2609271411";

/**
 * 把 0~100 的相对色温百分比换算成开尔文。
 * @returns {number} 开尔文值；区间非法时回落到最低色温，最低色温也不可用时用 2700（常见暖白默认值）。
 */
export function relativeLightColorTemperature(minimumKelvin, maximumKelvin, relativePercent) {
  const parsedMinimumKelvin = Number(minimumKelvin);
  const parsedMaximumKelvin = Number(maximumKelvin);
  // 先把百分比夹到 0~100 再归一：滑块越界或属性缺失时不会算出区间外的色温。
  const relativeRatio = Math.max(0, Math.min(100, Number(relativePercent) || 0)) / 100;
  if (
    !Number.isFinite(parsedMinimumKelvin) ||
    !Number.isFinite(parsedMaximumKelvin) ||
    parsedMaximumKelvin <= parsedMinimumKelvin
  ) {
    // 上界缺失或区间反转时只能给一个值，选最低色温即「最暖」，视觉上最不易出错。
    if (Number.isFinite(parsedMinimumKelvin)) {
      return parsedMinimumKelvin;
    } else {
      return 2700;
    }
  } else {
    return parsedMinimumKelvin + (parsedMaximumKelvin - parsedMinimumKelvin) * relativeRatio;
  }
}
/**
 * @param {*} fallbackValue 不可用时的兜底值。
 */
export function lightVisualValueForCapability(
  isCapabilitySupported,
  capabilityValue,
  fallbackValue
) {
  const numericCapabilityValue = Number(capabilityValue);
  if (isCapabilitySupported && Number.isFinite(numericCapabilityValue)) {
    return numericCapabilityValue;
  } else {
    return Number(fallbackValue);
  }
}
const COLOR_CAPABLE_MODES_SET = new Set(["hs", "rgb", "rgbw", "rgbww", "xy"]);
/**
 * 归一化 supported_color_modes：统一小写去空格并丢掉空项。
 */
function resolveSupportedColorModes(attributes = {}) {
  const normalizedColorModes = Array.isArray(attributes?.supported_color_modes)
    ? attributes.supported_color_modes
        .map(declaredMode =>
          String(declaredMode || "")
            .trim()
            .toLowerCase()
        )
        .filter(Boolean)
    : [];
  if (normalizedColorModes.length) {
    return normalizedColorModes;
  } else if (Array.isArray(attributes?.hs_color) || Array.isArray(attributes?.rgb_color)) {
    return ["hs"];
  } else {
    return normalizedColorModes;
  }
}
/**
 * 判断灯是否支持彩色（而非仅明暗 / 冷暖）。
 */
export function lightSupportsColor(entityAttributes = {}) {
  return resolveSupportedColorModes(entityAttributes).some(colorMode =>
    COLOR_CAPABLE_MODES_SET.has(colorMode)
  );
}
/**
 * 探测灯在实时状态下的可调能力。
 */
export function lightRealtimeCapabilities(entityId = "", entityState = {}) {
  const stateObject = resolveStateEntry(entityState, {});
  const stateAttributes = stateObject?.attributes || {};
  const isLightEntity =
    entityDomainFromId(entityId || stateObject.entityId || stateObject.domain) === "light";
  const declaredColorModes = Array.isArray(stateAttributes.supported_color_modes)
    ? stateAttributes.supported_color_modes
    : [];
  const supportedFeatures = Number(stateAttributes.supported_features || 0);
  // 判断某属性是否已上报可用数值。口径统一在 utils/numbers.js 的 isUsableNumber：
  const hasNumericAttribute = attributeName =>
    isUsableNumber(stateAttributes[attributeName]);
  return {
    brightness:
      isLightEntity &&
      (hasNumericAttribute("brightness") ||
        declaredColorModes.some(supportedMode => supportedMode !== "onoff") ||
        (supportedFeatures & 1) === 1),
    colorTemperature:
      isLightEntity &&
      (declaredColorModes.includes("color_temp") ||
        hasNumericAttribute("color_temp_kelvin") ||
        hasNumericAttribute("min_color_temp_kelvin") ||
        hasNumericAttribute("max_color_temp_kelvin") ||
        hasNumericAttribute("color_temp") ||
        (supportedFeatures & 2) === 2)
  };
}
/**
 * RGB 转 HS。
 */
export function rgbToHsColor(rgbColor) {
  if (!Array.isArray(rgbColor) || rgbColor.length < 3) {
    return null;
  }
  const normalizedChannels = rgbColor
    .slice(0, 3)
    .map(channelValue => Math.max(0, Math.min(255, Number(channelValue) || 0)) / 255);
  const maximumChannel = Math.max(...normalizedChannels);
  const minimumChannel = Math.min(...normalizedChannels);
  const channelRange = maximumChannel - minimumChannel;
  let hueDegrees = 0;
  if (channelRange > 0) {
    // 标准 HSV 六段色相公式：按最大分量落在哪个通道决定用哪一段。
    if (maximumChannel === normalizedChannels[0]) {
      hueDegrees = (((normalizedChannels[1] - normalizedChannels[2]) / channelRange) % 6) * 60;
    } else if (maximumChannel === normalizedChannels[1]) {
      hueDegrees = ((normalizedChannels[2] - normalizedChannels[0]) / channelRange + 2) * 60;
    } else {
      hueDegrees = ((normalizedChannels[0] - normalizedChannels[1]) / channelRange + 4) * 60;
    }
  }
  if (hueDegrees < 0) {
    hueDegrees += 360;
  }
  const saturationRatio = maximumChannel <= 0 ? 0 : channelRange / maximumChannel;
  return [hueDegrees, saturationRatio * 100];
}
/**
 * HS 转 RGB。
 */
export function hsToRgbColor(hsColor) {
  if (!Array.isArray(hsColor) || hsColor.length < 2) {
    return null;
  }
  // 双取模再加 360 取模，负数色相也能落到 0~360。
  const normalizedHue = (((Number(hsColor[0]) || 0) % 360) + 360) % 360;
  const normalizedSaturation = Math.max(0, Math.min(100, Number(hsColor[1]) || 0)) / 100;
  const maximumValue = 1;
  // 标准 HSV → RGB：chroma 为最大与最小分量之差，secondaryComponent 是次大分量。
  const chroma = maximumValue * normalizedSaturation;
  const hueSector = normalizedHue / 60;
  const secondaryComponent = chroma * (1 - Math.abs((hueSector % 2) - 1));
  const minimumValue = maximumValue - chroma;
  const [redComponent, greenComponent, blueComponent] =
    hueSector < 1
      ? [chroma, secondaryComponent, 0]
      : hueSector < 2
        ? [secondaryComponent, chroma, 0]
        : hueSector < 3
          ? [0, chroma, secondaryComponent]
          : hueSector < 4
            ? [0, secondaryComponent, chroma]
            : hueSector < 5
              ? [secondaryComponent, 0, chroma]
              : [chroma, 0, secondaryComponent];
  return [redComponent, greenComponent, blueComponent].map(componentValue =>
    Math.round((componentValue + minimumValue) * 255)
  );
}
/**
 * 拾色盘点击坐标 → HS。
 */
export function lightColorPickerHsFromPoint(normalizedX, normalizedY) {
  const clampedX = Math.max(0, Math.min(1, Number(normalizedX) || 0));
  const clampedY = Math.max(0, Math.min(1, Number(normalizedY) || 0));
  const offsetX = clampedX - 0.5;
  const offsetY = clampedY - 0.5;
  const radiusRatio = Math.min(1, Math.hypot(offsetX / 0.36, offsetY / 0.36));
  return [
    ((((Math.atan2(offsetY, offsetX) * 180) / Math.PI + 360) % 360) + 90) % 360,
    radiusRatio * 100
  ];
}
/**
 * HS → 拾色盘上的归一化坐标，是 lightColorPickerHsFromPoint 的逆运算。
 */
export function lightColorPickerPointFromHs(hueSaturation) {
  // 色相先归一化到 0~360，负值与绕了多圈的输入都能落回标准区间。
  const pickerHueDegrees = (((Number(hueSaturation?.[0]) || 0) % 360) + 360) % 360;
  const pickerSaturationRatio = Math.max(0, Math.min(100, Number(hueSaturation?.[1]) || 0)) / 100;
  const hueRadians = ((pickerHueDegrees - 90) * Math.PI) / 180;
  return {
    x: Math.max(0, Math.min(1, 0.5 + Math.cos(hueRadians) * pickerSaturationRatio * 0.36)),
    y: Math.max(0, Math.min(1, 0.5 + Math.sin(hueRadians) * pickerSaturationRatio * 0.36))
  };
}
/**
 * 拼装设置颜色的服务数据。
 */
export function lightColorServiceData(lightAttributes, hsColorPair) {
  const colorModes = resolveSupportedColorModes(lightAttributes);
  // 发出去前先取整：小数色相 / 饱和度在部分设备上会被拒或产生抖动。
  const roundedHsColor = [
    Math.round((((Number(hsColorPair?.[0]) || 0) % 360) + 360) % 360),
    Math.round(Math.max(0, Math.min(100, Number(hsColorPair?.[1]) || 0)))
  ];
  if (colorModes.includes("hs") || colorModes.includes("xy") || !colorModes.includes("rgb")) {
    return {
      hs_color: roundedHsColor
    };
  } else {
    return {
      rgb_color: hsToRgbColor(roundedHsColor)
    };
  }
}
// 灯不支持色温时的显示用色温：4600K 接近正白，视觉上既不偏暖也不偏冷。
export const UNSUPPORTED_LIGHT_VISUAL_TEMPERATURE_KELVIN = 4600;
// 灯不支持亮度调节时的显示用亮度：按满亮绘制。
export const UNSUPPORTED_LIGHT_VISUAL_BRIGHTNESS_PERCENT = 100;
/**
 * 拼装预设亮度对应的服务数据。
 */
export function lightPresetBrightnessServiceData(brightnessPercent) {
  // 下限取 1：0% 在 HA 里等价于关灯，而调用方此处要表达的是「调到最暗但仍亮」。
  const clampedBrightnessPercent = Math.max(
    1,
    Math.min(100, Math.round(Number(brightnessPercent) || 1))
  );
  if (clampedBrightnessPercent === 100) {
    return {
      brightness: 255
    };
  } else {
    return {
      brightness_pct: clampedBrightnessPercent
    };
  }
}
/**
 * 灯光详情面板的三个快捷预设。
 */
export const LIGHT_DETAIL_PRESET_DEFINITIONS = Object.freeze([
  Object.freeze({
    label: "柔和",
    detail: "25%",
    brightnessPercent: 25,
    colorTemperaturePercent: 10
  }),
  Object.freeze({
    label: "日常",
    detail: "60%",
    brightnessPercent: 60,
    colorTemperaturePercent: 50
  }),
  Object.freeze({
    label: "明亮",
    detail: "100%",
    brightnessPercent: 100,
    colorTemperaturePercent: 100
  })
]);
// 预设下发后的最短等待：灯从收到指令到上报状态通常需要一段时间，
export const LIGHT_PRESET_MINIMUM_HOLD_MS = 8000;
export const LIGHT_PRESET_STABLE_CONFIRMATION_MS = 1200;
// 超过这个时长还没等到匹配状态就放弃等待，防止 pending 永远挂着。
export const LIGHT_PRESET_MAXIMUM_HOLD_MS = 12000;
/**
 * 判断某个待确认预设当前应处于什么阶段。
 */
export function lightPresetPendingDecision(pendingPreset, nowMs = Date.now()) {
  if (!pendingPreset) {
    return "idle";
  }
  const currentTimeMs = Number(nowMs) || 0;
  if (currentTimeMs >= Number(pendingPreset.expiresAt || 0)) {
    return "timeout";
  }
  // 还没观察到匹配状态，或匹配的起始时刻未知，都只能继续等——累计稳定时长要从某个明确的起点算。
  if (!pendingPreset.latestMatches || !Number.isFinite(Number(pendingPreset.matchStartedAt))) {
    return "hold";
  }
  const hasReachedMinimumHold = currentTimeMs >= Number(pendingPreset.minimumHoldUntil || 0);
  const isStableConfirmationElapsed =
    currentTimeMs - Number(pendingPreset.matchStartedAt) >= LIGHT_PRESET_STABLE_CONFIRMATION_MS;
  if (hasReachedMinimumHold && isStableConfirmationElapsed) {
    return "confirmed";
  } else {
    return "hold";
  }
}
