/**
 * 灯光控件的纯计算层：能力探测、颜色空间转换、服务数据拼装与预设确认状态机。
 *
 * 职责：从 HA 属性推断支持的能力（亮度 / 色温 / 彩色）；HS 与 RGB 互转、拾色盘坐标与 HS 互换；
 * 把操作拼成发给 HA 的服务数据；维护「点预设后等设备状态稳定」的判定。
 *
 * 位置：不碰 DOM，也不读控件注册表；runtime 与编辑器预览共用这里的口径。
 */

// 本模块原本是**零 import** 的纯计算层，这里引入第一个依赖，且只依赖 `utils/entities.js`
// （叶子模块，自己没有 import，也不碰 DOM / 注册表），所以「不碰 DOM、不读注册表」这条
// 位置说明仍然成立；灯域判定与 `entityDomainFromId` 是同一份知识，不再内联。
import { entityDomainFromId } from "../../utils/entities.js?v=2609260900";
// 「属性里有没有可用数值」的唯一口径（空串 / 布尔算缺失）：与特效层共用同一份实现。
import { isUsableNumber } from "../../utils/numbers.js?v=2609260900";
// 状态条目归一（变更对象 / 状态对象两种形态）走 `utils/state-entry.js` 的 `resolveStateEntry`。
import { resolveStateEntry } from "../../utils/state-entry.js?v=2609260900";

/**
 * 把 0~100 的相对色温百分比换算成开尔文。
 *
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
 * 在「控件支持该能力」与「属性里有可用数值」同时成立时才采用实际值，否则用兜底值。
 * 某些灯会把 brightness 留在属性里但已不支持调节，只看数值存在会误判为可用。
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
// 这些色彩模式意味着灯能接收具体颜色指令；onoff 与 brightness / color_temp 只能调明暗或冷暖。
const COLOR_CAPABLE_MODES_SET = new Set(["hs", "rgb", "rgbw", "rgbww", "xy"]);
/**
 * 归一化 supported_color_modes：统一小写去空格并丢掉空项。
 * 老固件不下发 supported_color_modes，只会给 hs_color / rgb_color，这时补一个 "hs"
 * 作为等价声明，避免把能调色的灯误判成只能调亮度。
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
 * 三个依据取并集（任一成立即支持）：supported_color_modes 声明、属性里的数值字段、
 * 旧 supported_features 位掩码（第 1 位亮度、第 2 位色温）；非 light 域一律全 false。
 */
export function lightRealtimeCapabilities(entityId = "", entityState = {}) {
  const stateObject = resolveStateEntry(entityState, {});
  const stateAttributes = stateObject?.attributes || {};
  // 实体 ID 缺失时退回状态对象自带的 entityId / domain，避免拿不到域就判成不支持。
  const isLightEntity =
    entityDomainFromId(entityId || stateObject.entityId || stateObject.domain) === "light";
  const declaredColorModes = Array.isArray(stateAttributes.supported_color_modes)
    ? stateAttributes.supported_color_modes
    : [];
  const supportedFeatures = Number(stateAttributes.supported_features || 0);
  // 判断某属性是否已上报可用数值。口径统一在 utils/numbers.js 的 isUsableNumber：
  // null / undefined / 空串 / 布尔都算缺失，数字字符串算可用（HA 上报的数值属性可能是字符串）。
  // 调用点都希望「无效即等于没上报」，例如 brightness 为空时才需要退回 supported_features
  // 位掩码来推断能力。这里曾自持一份只判 Number.isFinite 的实现，把 "" 当成 0 而误判为
  // 「支持亮度」，与特效层那份（明确排除空串）给出相反答案。
  const hasNumericAttribute = attributeName =>
    isUsableNumber(stateAttributes[attributeName]);
  // 亮度判定：onoff 模式是唯一的纯开关模式，其余（brightness / color_temp / 彩色）都隐含可调亮度。
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
 * 返回 HS 是因为拾色盘的色相环用的就是 HS，HA 服务也接受 hs_color，
 * 链路中间不需要再转一次。
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
  // 灰色（最大分量为 0）没有色相可言，饱和度直接记 0，避免除零。
  const saturationRatio = maximumChannel <= 0 ? 0 : channelRange / maximumChannel;
  return [hueDegrees, saturationRatio * 100];
}
/**
 * HS 转 RGB。
 * 亮度固定按 100% 计算：HA 的亮度是独立字段，颜色只需要表达色相与饱和度，
 * 若把亮度也揉进来，灯处于低亮时拾色盘会整片发暗。
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
 * 入参是相对拾色盘外接正方形的归一化坐标（0~1，左上为原点）；0.36 是色相环半径
 * 相对正方形的比例，角度先算 atan2（0° 在正右方，逆时针为正）再 +90° 对齐绘制起点。
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
  // 与上面 +90° 的偏移互逆，所以这里减 90° 再转弧度。
  const hueRadians = ((pickerHueDegrees - 90) * Math.PI) / 180;
  return {
    x: Math.max(0, Math.min(1, 0.5 + Math.cos(hueRadians) * pickerSaturationRatio * 0.36)),
    y: Math.max(0, Math.min(1, 0.5 + Math.sin(hueRadians) * pickerSaturationRatio * 0.36))
  };
}
/**
 * 拼装设置颜色的服务数据。
 * 支持 hs 或 xy 时优先发 hs_color，仅当明确只支持 rgb 时才发 rgb_color；这个顺序是
 * 刻意的——rgb_color 在部分灯上转回 hs 会丢精度，而 xy 灯同样接受 hs_color。
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
 * 100% 时走 brightness: 255 而非 brightness_pct：按 255 发送可避免部分固件
 * 把 100% 换算成 254 导致「按了没反应」。
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
 * 冻结成常量：这是与界面文案约定死的配置（label 会直接上屏）；
 * colorTemperaturePercent 用相对百分比是为了适配不同灯的色温区间。
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
// 太早判定会把还没生效的旧状态当成「用户又改了」，故给 8 秒底线。
export const LIGHT_PRESET_MINIMUM_HOLD_MS = 8000;
// 状态需要连续稳定这么久才认可，避免调光过程上报的中间值被当成最终结果。
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
