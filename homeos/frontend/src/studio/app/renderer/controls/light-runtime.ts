import type { HaEntityAttributes, HaEntityState } from "@app/utils/ha-entity";
export function relativeLightColorTemperature(minimumKelvin: any, maximumKelvin: any, relativePercent: any) {
  const parsedMinimumKelvin = Number(minimumKelvin),
    parsedMaximumKelvin = Number(maximumKelvin),
    relativeRatio = Math.max(0, Math.min(100, Number(relativePercent) || 0)) / 100;
  return !Number.isFinite(parsedMinimumKelvin) ||
    !Number.isFinite(parsedMaximumKelvin) ||
    parsedMaximumKelvin <= parsedMinimumKelvin
    ? Number.isFinite(parsedMinimumKelvin)
      ? parsedMinimumKelvin
      : 2700
    : parsedMinimumKelvin + (parsedMaximumKelvin - parsedMinimumKelvin) * relativeRatio;
}
export function lightVisualValueForCapability(
  isCapabilitySupported: any,
  capabilityValue: any,
  fallbackValue: any,
) {
  const numericCapabilityValue = Number(capabilityValue);
  return isCapabilitySupported && Number.isFinite(numericCapabilityValue)
    ? numericCapabilityValue
    : Number(fallbackValue);
}
const colorModeSet = new Set(["hs", "rgb", "rgbw", "rgbww", "xy"]);
function resolveSupportedColorModes(attributes: HaEntityAttributes = {}) {
  const normalizedColorModes = Array.isArray(attributes?.supported_color_modes)
    ? attributes.supported_color_modes
        .map((declaredMode) =>
          String(declaredMode || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean)
    : [];
  if (normalizedColorModes.length) return normalizedColorModes;
  if (lightColorHs(attributes)) normalizedColorModes.push("hs");
  if (lightRealtimeCapabilities("light.legacy", { attributes }).colorTemperature)
    normalizedColorModes.push("color_temp");
  return normalizedColorModes;
}
const isByteChannelArray = (channelArray: any, expectedLength: any) =>
  Array.isArray(channelArray) &&
  channelArray.length === expectedLength &&
  channelArray.every(
    (channelByte) =>
      typeof channelByte == "number" &&
      Number.isFinite(channelByte) &&
      channelByte >= 0 &&
      channelByte <= 255,
  );
function lightKelvinRgb(kelvinValue: any) {
  const scaledKelvin = Math.max(1000, Math.min(40000, Number(kelvinValue) || 2700)) / 100;
  return [
    scaledKelvin <= 66 ? 255 : 329.698727446 * (scaledKelvin - 60) ** -0.1332047592,
    scaledKelvin <= 66
      ? 99.4708025861 * Math.log(scaledKelvin) - 161.1195681661
      : 288.1221695283 * (scaledKelvin - 60) ** -0.0755148492,
    scaledKelvin >= 66
      ? 255
      : scaledKelvin <= 19
        ? 0
        : 138.5177312231 * Math.log(scaledKelvin - 10) - 305.0447927307,
  ].map((clampedChannel) => Math.max(0, Math.min(255, clampedChannel)));
}
export function lightColorRgb(colorAttributes: HaEntityAttributes = {}) {
  const colorState = colorAttributes,
    colorMode = colorState.color_mode;
  if (colorMode === "white") return [255, 255, 255];
  if (["color_temp", "onoff", "brightness", "unknown"].includes(colorMode!)) return null;
  const resolveHsColor = () =>
      Array.isArray(colorState.hs_color) &&
      colorState.hs_color.length === 2 &&
      colorState.hs_color.every(
        (hsColorComponent) =>
          typeof hsColorComponent == "number" && Number.isFinite(hsColorComponent),
      )
        ? hsToRgbColor(colorState.hs_color)
        : null,
    resolveRgbColor = () =>
      isByteChannelArray(colorState.rgb_color, 3) ? [...(colorState.rgb_color as number[])] : null,
    resolveRgbwColor = (colorAttributeName: any, componentCount: any) => {
      if (!isByteChannelArray(colorState[colorAttributeName], componentCount)) return null;
      const rawColorComponents = colorState[colorAttributeName];
      let baseChannels = [rawColorComponents[3], rawColorComponents[3], rawColorComponents[3]];
      if (componentCount === 5) {
        const [firstWhiteChannel, secondWhiteChannel] = rawColorComponents.slice(3),
          minimumColorTemperatureKelvin = Number(colorState.min_color_temp_kelvin) || 2700,
          maximumColorTemperatureKelvin = Number(colorState.max_color_temp_kelvin) || 6500,
          whiteMixRatio =
            firstWhiteChannel + secondWhiteChannel
              ? secondWhiteChannel / (firstWhiteChannel + secondWhiteChannel)
              : 0.5,
          interpolatedKelvin =
            1000000 /
            (1000000 / maximumColorTemperatureKelvin +
              whiteMixRatio *
                (1000000 / minimumColorTemperatureKelvin -
                  1000000 / maximumColorTemperatureKelvin));
        baseChannels = lightKelvinRgb(interpolatedKelvin).map(
          (kelvinChannel) =>
            (kelvinChannel * Math.max(firstWhiteChannel, secondWhiteChannel)) / 255,
        );
      }
      const combinedChannels = rawColorComponents
          .slice(0, 3)
          .map((baseChannel: any, channelIndex: any) => baseChannel + baseChannels[channelIndex]),
        channelScale = Math.max(...combinedChannels)
          ? Math.max(...rawColorComponents) / Math.max(...combinedChannels)
          : 0;
      return combinedChannels.map((scaledChannel: any) => Math.round(scaledChannel * channelScale));
    },
    resolveXyColor = () => {
      if (
        !Array.isArray(colorState.xy_color) ||
        colorState.xy_color.length !== 2 ||
        !colorState.xy_color.every(
          (xyComponent) => typeof xyComponent == "number" && Number.isFinite(xyComponent),
        )
      )
        return null;
      const [chromaticityX, chromaticityY] = colorState.xy_color;
      if (chromaticityX < 0 || chromaticityY <= 0 || chromaticityX + chromaticityY > 1.00001)
        return null;
      const chromaticityRatioX = chromaticityX / chromaticityY,
        chromaticityRatioY = (1 - chromaticityX - chromaticityY) / chromaticityY,
        linearRgbChannels = [
          1.656492 * chromaticityRatioX - 0.354851 - 0.255038 * chromaticityRatioY,
          -0.707196 * chromaticityRatioX + 1.655397 + 0.036152 * chromaticityRatioY,
          0.051713 * chromaticityRatioX - 0.121364 + 1.01153 * chromaticityRatioY,
        ].map((linearChannel) =>
          linearChannel <= 0.0031308
            ? Math.max(0, linearChannel) * 12.92
            : 1.055 * Math.pow(linearChannel, 1 / 2.4) - 0.055,
        ),
        componentMaximum = Math.max(...linearRgbChannels, 1);
      return linearRgbChannels.map((normalizedChannel) =>
        Math.round((normalizedChannel / componentMaximum) * 255),
      );
    };
  return colorMode === "hs"
    ? resolveHsColor() || resolveRgbColor()
    : colorMode === "xy"
      ? resolveRgbColor() || resolveXyColor() || resolveHsColor()
      : colorMode === "rgbw"
        ? resolveRgbColor() || resolveRgbwColor("rgbw_color", 4) || resolveHsColor()
        : colorMode === "rgbww"
          ? resolveRgbColor() || resolveRgbwColor("rgbww_color", 5) || resolveHsColor()
          : colorMode === "rgb"
            ? resolveRgbColor() || resolveHsColor()
            : resolveRgbColor() ||
              resolveRgbwColor("rgbw_color", 4) ||
              resolveRgbwColor("rgbww_color", 5) ||
              resolveHsColor() ||
              resolveXyColor();
}
export function lightColorHs(hsAttributes: HaEntityAttributes = {}) {
  if (
    (!hsAttributes.color_mode || hsAttributes.color_mode === "hs") &&
    Array.isArray(hsAttributes.hs_color) &&
    hsAttributes.hs_color.length === 2 &&
    hsAttributes.hs_color.every(
      (hsPairComponent) => typeof hsPairComponent == "number" && Number.isFinite(hsPairComponent),
    )
  )
    return [
      ((hsAttributes.hs_color[0] % 360) + 360) % 360,
      Math.max(0, Math.min(100, hsAttributes.hs_color[1])),
    ];
  const computedRgbColor = lightColorRgb(hsAttributes);
  return computedRgbColor ? rgbToHsColor(computedRgbColor) : null;
}
export function lightControlModes(modeAttributes: Record<string, any> = {}) {
  const resolvedColorModes = resolveSupportedColorModes(modeAttributes);
  return [
    ...(resolvedColorModes.some((colorModeName) => colorModeSet.has(colorModeName))
      ? ["color"]
      : []),
    ...(resolvedColorModes.includes("color_temp") ? ["temperature"] : []),
    ...(resolvedColorModes.includes("white") ? ["white"] : []),
  ];
}
export function lightControlMode(reportedColorMode: any, availableModes: any) {
  const normalizedControlMode =
    reportedColorMode === "color_temp"
      ? "temperature"
      : reportedColorMode === "white"
        ? "white"
        : "color";
  return availableModes.includes(normalizedControlMode)
    ? normalizedControlMode
    : availableModes[0] || "temperature";
}
export function lightSupportsColor(entityAttributes: HaEntityAttributes = {}) {
  return resolveSupportedColorModes(entityAttributes).some((supportedColorMode) =>
    colorModeSet.has(supportedColorMode),
  );
}
export function lightRealtimeCapabilities(
  entityId = "",
  entityState: HaEntityState = {},
) {
  const stateObject = entityState?.newState || entityState || {},
    stateAttributes = stateObject?.attributes || {},
    isLightEntity =
      String(entityId || stateObject.entityId || stateObject.domain || "").split(".", 1)[0] ===
      "light",
    declaredColorModes = Array.isArray(stateAttributes.supported_color_modes)
      ? stateAttributes.supported_color_modes
          .map((declaredMode) => String(declaredMode).trim().toLowerCase())
          .filter(Boolean)
      : [],
    supportedFeatures = Number(stateAttributes.supported_features || 0),
    hasNumericAttribute = (attributeName: any) =>
      stateAttributes[attributeName] !== null &&
      stateAttributes[attributeName] !== undefined &&
      stateAttributes[attributeName] !== "" &&
      typeof stateAttributes[attributeName] != "boolean" &&
      Number.isFinite(Number(stateAttributes[attributeName]));
  return {
    brightness:
      isLightEntity &&
      (declaredColorModes.length
        ? declaredColorModes.some(
            (declaredMode) =>
              colorModeSet.has(declaredMode) ||
              ["brightness", "color_temp", "white"].includes(declaredMode),
          )
        : hasNumericAttribute("brightness") || (supportedFeatures & 1) === 1),
    colorTemperature:
      isLightEntity &&
      (declaredColorModes.length
        ? declaredColorModes.includes("color_temp")
        : hasNumericAttribute("color_temp_kelvin") ||
          hasNumericAttribute("min_color_temp_kelvin") ||
          hasNumericAttribute("max_color_temp_kelvin") ||
          hasNumericAttribute("color_temp") ||
          (supportedFeatures & 2) === 2),
  };
}
export function rgbToHsColor(rgbColor: any) {
  if (!Array.isArray(rgbColor) || rgbColor.length < 3) return null;
  const normalizedChannels = rgbColor
      .slice(0, 3)
      .map((channelValue) => Math.max(0, Math.min(255, Number(channelValue) || 0)) / 255),
    maximumChannel = Math.max(...normalizedChannels),
    minimumChannel = Math.min(...normalizedChannels),
    channelRange = maximumChannel - minimumChannel;
  let hueDegrees = 0;
  (channelRange > 0 &&
    (maximumChannel === normalizedChannels[0]
      ? (hueDegrees = 60 * (((normalizedChannels[1] - normalizedChannels[2]) / channelRange) % 6))
      : maximumChannel === normalizedChannels[1]
        ? (hueDegrees = 60 * ((normalizedChannels[2] - normalizedChannels[0]) / channelRange + 2))
        : (hueDegrees = 60 * ((normalizedChannels[0] - normalizedChannels[1]) / channelRange + 4))),
    hueDegrees < 0 && (hueDegrees += 360));
  const saturationRatio = maximumChannel <= 0 ? 0 : channelRange / maximumChannel;
  return [hueDegrees, saturationRatio * 100];
}
export function hsToRgbColor(hsColor: any) {
  if (!Array.isArray(hsColor) || hsColor.length < 2) return null;
  const normalizedHue = (((Number(hsColor[0]) || 0) % 360) + 360) % 360,
    normalizedSaturation = Math.max(0, Math.min(100, Number(hsColor[1]) || 0)) / 100,
    maximumValue = 1,
    chroma = maximumValue * normalizedSaturation,
    hueSector = normalizedHue / 60,
    secondaryComponent = chroma * (1 - Math.abs((hueSector % 2) - 1)),
    minimumValue = maximumValue - chroma,
    [redComponent, greenComponent, blueComponent] =
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
  return [redComponent, greenComponent, blueComponent].map((componentValue) =>
    Math.round((componentValue + minimumValue) * 255),
  );
}
export function lightColorPickerHsFromPoint(normalizedX: any, normalizedY: any, aspectRatio = 1) {
  const clampedX = Math.max(0, Math.min(1, Number(normalizedX) || 0)),
    clampedY = Math.max(0, Math.min(1, Number(normalizedY) || 0)),
    offsetX = clampedX - 0.5,
    offsetY = clampedY - 0.5,
    radialDistance = Math.max(Math.abs(offsetX), Math.abs(offsetY)) * 2,
    effectiveAspectRatio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  return [
    ((((Math.atan2(offsetY, offsetX * effectiveAspectRatio) * 180) / Math.PI + 360) % 360) + 90) %
      360,
    radialDistance * 100,
  ];
}
export function lightColorPickerPointFromHs(hueSaturation: any, pickerAspectRatio = 1) {
  const pickerHueDegrees = (((Number(hueSaturation?.[0]) || 0) % 360) + 360) % 360,
    pickerSaturationRatio = Math.max(0, Math.min(100, Number(hueSaturation?.[1]) || 0)) / 100,
    hueRadians = ((pickerHueDegrees - 90) * Math.PI) / 180,
    effectivePickerAspectRatio =
      Number.isFinite(pickerAspectRatio) && pickerAspectRatio > 0 ? pickerAspectRatio : 1,
    cosineScale = Math.cos(hueRadians) / effectivePickerAspectRatio,
    sineValue = Math.sin(hueRadians),
    pointRadius =
      (pickerSaturationRatio * 0.5) / Math.max(Math.abs(cosineScale), Math.abs(sineValue));
  return {
    x: Math.max(0, Math.min(1, 0.5 + cosineScale * pointRadius)),
    y: Math.max(0, Math.min(1, 0.5 + sineValue * pointRadius)),
  };
}
export function lightColorServiceData(lightAttributes: any, hsColorPair: any) {
  const colorModes = resolveSupportedColorModes(lightAttributes),
    roundedHsColor = [
      Math.round((((Number(hsColorPair?.[0]) || 0) % 360) + 360) % 360),
      Math.round(Math.max(0, Math.min(100, Number(hsColorPair?.[1]) || 0))),
    ];
  return colorModes.includes("hs") || colorModes.includes("xy") || !colorModes.includes("rgb")
    ? {
        hs_color: roundedHsColor,
      }
    : {
        rgb_color: hsToRgbColor(roundedHsColor),
      };
}
export const UNSUPPORTED_LIGHT_VISUAL_TEMPERATURE_KELVIN = 4600,
  UNSUPPORTED_LIGHT_VISUAL_BRIGHTNESS_PERCENT = 100;
export function lightPresetBrightnessServiceData(brightnessPercent: any) {
  const clampedBrightnessPercent = Math.max(
    1,
    Math.min(100, Math.round(Number(brightnessPercent) || 1)),
  );
  return clampedBrightnessPercent === 100
    ? {
        brightness: 255,
      }
    : {
        brightness_pct: clampedBrightnessPercent,
      };
}
export const LIGHT_DETAIL_PRESET_DEFINITIONS = Object.freeze([
    Object.freeze({
      label: "柔和",
      detail: "25%",
      brightnessPercent: 25,
      colorTemperaturePercent: 10,
    }),
    Object.freeze({
      label: "日常",
      detail: "60%",
      brightnessPercent: 60,
      colorTemperaturePercent: 50,
    }),
    Object.freeze({
      label: "明亮",
      detail: "100%",
      brightnessPercent: 100,
      colorTemperaturePercent: 100,
    }),
  ]),
  LIGHT_PRESET_MINIMUM_HOLD_MS = 8000,
  LIGHT_PRESET_STABLE_CONFIRMATION_MS = 1200,
  LIGHT_PRESET_MAXIMUM_HOLD_MS = 12000;
export function lightPresetPendingDecision(pendingPreset: any, nowMs = Date.now()) {
  if (!pendingPreset) return "idle";
  const currentTimeMs = Number(nowMs) || 0;
  if (currentTimeMs >= Number(pendingPreset.expiresAt || 0)) return "timeout";
  if (!pendingPreset.latestMatches || !Number.isFinite(Number(pendingPreset.matchStartedAt)))
    return "hold";
  const hasReachedMinimumHold = currentTimeMs >= Number(pendingPreset.minimumHoldUntil || 0),
    isStableConfirmationElapsed =
      currentTimeMs - Number(pendingPreset.matchStartedAt) >= LIGHT_PRESET_STABLE_CONFIRMATION_MS;
  return hasReachedMinimumHold && isStableConfirmationElapsed ? "confirmed" : "hold";
}
