import { randomUuid } from "../utils/random-id.js?v=20260915211726";
import {
  climateDefaultIcon,
  climateEffectMode,
  climateIsPoweredOn,
  climateModeLabel,
  climatePresentationMode,
  normalizeClimateCapabilities,
  resolveClimateDeviceType
} from "./climate.js?v=20260915211726";
import { entityPowerIsOn } from "./entity-power.js?v=20260915211726";
import { lightRealtimeCapabilities } from "./light-runtime.js?v=20260915211726";
import { renderInteraction3d } from "../modules/interaction3d/bridge.js?v=20260915211726";
const componentsByType = new Map();
registerComponent("interaction3d", {
  render: renderInteraction3d
});
const assetVersionByAssetId = new Map();
const assetUrlByAssetId = new Map();
const effectVariantByAssetId = new Map();
export function setBuiltinAssetVersions(assetEntries = []) {
  const nextVersionByAssetId = new Map();
  const nextUrlByAssetId = new Map();
  const nextEffectVariantByAssetId = new Map();
  for (const assetEntry of assetEntries || []) {
    const primaryAssetId = String(assetEntry?.assetId || "");
    if (!primaryAssetId) {
      continue;
    }
    const assetVersion = String(assetEntry.version || "");
    const legacyAssetIds = Array.isArray(assetEntry.legacyAssetIds)
      ? assetEntry.legacyAssetIds
      : [];
    for (const assetIdCandidate of [primaryAssetId, ...legacyAssetIds]) {
      nextVersionByAssetId.set(String(assetIdCandidate), assetVersion);
      if (assetEntry.url) {
        nextUrlByAssetId.set(String(assetIdCandidate), String(assetEntry.url));
      }
      const effectVariant = assetEntry.effectVariant || {};
      const variantOriginalWidth = Number(effectVariant.originalWidth || 0);
      const variantOriginalHeight = Number(effectVariant.originalHeight || 0);
      const variantCropX = Number(effectVariant.cropX);
      const variantCropY = Number(effectVariant.cropY);
      const variantCropWidth = Number(effectVariant.width || 0);
      const variantCropHeight = Number(effectVariant.height || 0);
      if (
        String(effectVariant.url || "").startsWith("/api/v1/assets/effect-variant?") &&
        variantOriginalWidth > 0 &&
        variantOriginalHeight > 0 &&
        Number.isFinite(variantCropX) &&
        Number.isFinite(variantCropY) &&
        variantCropX >= 0 &&
        variantCropY >= 0 &&
        variantCropWidth > 0 &&
        variantCropHeight > 0 &&
        variantCropX + variantCropWidth <= variantOriginalWidth &&
        variantCropY + variantCropHeight <= variantOriginalHeight
      ) {
        nextEffectVariantByAssetId.set(String(assetIdCandidate), {
          url: String(effectVariant.url),
          originalWidth: variantOriginalWidth,
          originalHeight: variantOriginalHeight,
          cropX: variantCropX,
          cropY: variantCropY,
          width: variantCropWidth,
          height: variantCropHeight
        });
      }
    }
  }
  if (
    nextVersionByAssetId.size === assetVersionByAssetId.size &&
    ![...nextVersionByAssetId].some(
      ([mappedAssetId, mappedVersion]) => assetVersionByAssetId.get(mappedAssetId) !== mappedVersion
    ) &&
    nextUrlByAssetId.size === assetUrlByAssetId.size &&
    ![...nextUrlByAssetId].some(
      ([mappedUrlAssetId, mappedUrl]) => assetUrlByAssetId.get(mappedUrlAssetId) !== mappedUrl
    ) &&
    nextEffectVariantByAssetId.size === effectVariantByAssetId.size &&
    ![...nextEffectVariantByAssetId].some(
      ([mappedVariantAssetId, mappedEffectVariant]) =>
        JSON.stringify(effectVariantByAssetId.get(mappedVariantAssetId)) !==
        JSON.stringify(mappedEffectVariant)
    )
  ) {
    return false;
  }
  assetVersionByAssetId.clear();
  for (const [detectedVersionAssetId, detectedVersion] of nextVersionByAssetId) {
    assetVersionByAssetId.set(detectedVersionAssetId, detectedVersion);
  }
  assetUrlByAssetId.clear();
  for (const [detectedUrlAssetId, detectedUrl] of nextUrlByAssetId) {
    assetUrlByAssetId.set(detectedUrlAssetId, detectedUrl);
  }
  effectVariantByAssetId.clear();
  for (const [detectedVariantAssetId, detectedVariant] of nextEffectVariantByAssetId) {
    effectVariantByAssetId.set(detectedVariantAssetId, detectedVariant);
  }
  return true;
}
export function registerComponent(componentType, componentRenderer) {
  componentsByType.set(componentType, componentRenderer);
}
export function renderRegisteredComponent(component, renderContext) {
  const registeredRenderer = componentsByType.get(component.type);
  if (registeredRenderer) {
    return registeredRenderer.render(component, renderContext);
  }
  const unknownComponentElement = document.createElement("div");
  unknownComponentElement.className = "hb-unknown-component";
  const unknownTitleElement = document.createElement("strong");
  unknownTitleElement.textContent = "控件尚未实现";
  const unknownTypeElement = document.createElement("span");
  unknownTypeElement.textContent = component.type;
  unknownComponentElement.append(unknownTitleElement, unknownTypeElement);
  return unknownComponentElement;
}
function resolveAssetUrl(assetReference) {
  const assetReferenceText = String(assetReference || "");
  if (assetUrlByAssetId.has(assetReferenceText)) {
    return assetUrlByAssetId.get(assetReferenceText);
  }
  if (assetReferenceText.startsWith("studio3d:")) {
    const studioExportSegments = assetReferenceText.slice(9).split("/");
    if (studioExportSegments.length !== 2 || !studioExportSegments[0] || !studioExportSegments[1]) {
      return "";
    } else {
      return (
        "/api/v1/assets/studio3d-export/" +
        encodeURIComponent(studioExportSegments[0]) +
        "/" +
        encodeURIComponent(studioExportSegments[1])
      );
    }
  }
  if (assetReferenceText.startsWith("user:")) {
    const userAssetId = assetReferenceText.slice(5);
    if (/^[0-9a-f]{32}$/.test(userAssetId)) {
      return "/api/v1/assets/user/" + userAssetId;
    } else {
      return "";
    }
  }
  if (!assetReferenceText.startsWith("builtin:")) {
    return "";
  }
  const builtinAssetPath = assetReferenceText.slice(8);
  const encodedBuiltinAssetPath = (
    builtinAssetPath.startsWith("v1/2D/") || builtinAssetPath.startsWith("v1/3D/")
      ? builtinAssetPath.replace(/^v1\//, "v1/户型图示例/")
      : builtinAssetPath
  )
    .split("/")
    .filter(Boolean)
    .map(pathSegment => encodeURIComponent(pathSegment))
    .join("/");
  if (!encodedBuiltinAssetPath) {
    return "";
  }
  const builtinAssetVersion = assetVersionByAssetId.get(assetReferenceText) || "";
  return (
    "/assets/builtin/" +
    encodedBuiltinAssetPath +
    (builtinAssetVersion ? "?v=" + encodeURIComponent(builtinAssetVersion) : "")
  );
}
export function staticAssetImageSource(imageAssetId) {
  return resolveAssetUrl(imageAssetId);
}
function clampNumber(numericValue, minimumValue, maximumValue, fallbackValue) {
  const parsedValue = Number(numericValue);
  return Math.max(
    minimumValue,
    Math.min(maximumValue, Number.isFinite(parsedValue) ? parsedValue : fallbackValue)
  );
}
function resolveColor(colorCandidate, fallbackColor) {
  const trimmedColor = String(colorCandidate || "").trim();
  if (/^(#[\da-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\))$/i.test(trimmedColor)) {
    return trimmedColor;
  } else {
    return fallbackColor;
  }
}
function applyFontWeight(targetElement, fontWeightValue, fontSizeValue) {
  const weightNumber = Number(fontWeightValue);
  const normalizedWeight =
    Number.isFinite(weightNumber) && weightNumber > 1
      ? clampNumber((weightNumber - 1) / 899, 0, 1, 0.4)
      : clampNumber(weightNumber, 0, 1, 0.4);
  const strokeFontSize = Math.max(1, Number(fontSizeValue || 16));
  const strokeWidthPx = normalizedWeight * strokeFontSize * 0.05;
  targetElement.style.fontWeight = "100";
  targetElement.style.webkitTextStroke = strokeWidthPx.toFixed(3) + "px currentColor";
  targetElement.style.paintOrder = "stroke fill";
}
function resolveIconUrl(iconName) {
  const normalizedIconName = String(iconName || "")
    .trim()
    .replace(/^mdi:/, "");
  if (/^[a-z0-9-]+$/.test(normalizedIconName)) {
    return "/static/vendor/mdi/7.4.47/svg/" + normalizedIconName + ".svg";
  } else {
    return "";
  }
}
function isEntityActiveState(entityStateEntry) {
  const entityStateText = String(entityStateEntry?.state ?? entityStateEntry?.newState?.state ?? "")
    .trim()
    .toLowerCase();
  return ["on", "open", "true", "home"].includes(entityStateText);
}
const COVER_ACTIVE_POSITION_THRESHOLD = 1;
function isCoverMotorReversed(motorComponentConfig) {
  return motorComponentConfig?.properties?.coverMotorDirection === "reversed";
}
export function coverComponentIsDream(
  coverDreamComponent,
  coverDreamEntityId = "",
  coverDreamState = null,
  coverDreamMetadataByEntityId = new Map()
) {
  const coverKind = coverDreamComponent?.properties?.coverKind;
  if (coverKind === "dream") {
    return true;
  }
  if (["standard", "airer"].includes(coverKind)) {
    return false;
  }
  const dreamResolvedState = resolveStateEntry(coverDreamState) || {};
  const supportedFeatures = Number(dreamResolvedState.attributes?.supported_features || 0);
  const dreamMetadataEntry = coverDreamMetadataByEntityId?.get?.(coverDreamEntityId) || {};
  const dreamSearchText =
    coverDreamEntityId +
    " " +
    (dreamResolvedState.attributes?.friendly_name || "") +
    " " +
    (dreamMetadataEntry.name || "") +
    " " +
    (dreamMetadataEntry.originalName || "");
  return (
    Number.isFinite(Number(dreamResolvedState.attributes?.current_tilt_position)) ||
    !!(supportedFeatures & 240) ||
    /梦幻|竖帘|垂直帘|百叶|(^|[._-])novo([._-]|$)/i.test(dreamSearchText)
  );
}
function isCoverActive(coverComponent, coverActiveEntityId, coverActiveState, coverActiveContext) {
  const coverResolvedState = resolveStateEntry(coverActiveState) || {};
  const coverStateText = String(coverResolvedState.state || "")
    .trim()
    .toLowerCase();
  const isCoverReversed = isCoverMotorReversed(coverComponent);
  const coverEffectiveState =
    (isCoverReversed &&
      {
        open: "closed",
        closed: "open",
        opening: "closing",
        closing: "opening"
      }[coverStateText]) ||
    coverStateText;
  if (coverEffectiveState === "opening") {
    return true;
  }
  if (coverEffectiveState === "closing") {
    return false;
  }
  if (
    coverComponentIsDream(
      coverComponent,
      coverActiveEntityId,
      coverResolvedState,
      coverActiveContext.entityMetadata
    )
  ) {
    return coverEffectiveState === "open";
  }
  const coverCurrentPosition = Number(coverResolvedState.attributes?.current_position);
  if (Number.isFinite(coverCurrentPosition)) {
    return (
      (isCoverReversed ? 100 - coverCurrentPosition : coverCurrentPosition) >
      COVER_ACTIVE_POSITION_THRESHOLD
    );
  } else if (isCoverReversed) {
    return !isEntityActiveState(coverResolvedState);
  } else {
    return isEntityActiveState(coverResolvedState);
  }
}
export function coverComponentIsActive(
  activeCoverComponent,
  activeCoverEntityId,
  activeCoverState,
  activeCoverContext = {}
) {
  return isCoverActive(
    activeCoverComponent,
    activeCoverEntityId,
    activeCoverState,
    activeCoverContext
  );
}
function isComponentEntityActive(
  powerAwareComponent,
  powerAwareEntityId,
  powerAwareState,
  powerAwareContext = {}
) {
  if (String(powerAwareEntityId || "").startsWith("cover.")) {
    return coverComponentIsActive(
      powerAwareComponent,
      powerAwareEntityId,
      powerAwareState,
      powerAwareContext
    );
  }
  const runtimePowerEntityId = String(
    powerAwareComponent?.properties?.runtimePowerEntityId || powerAwareEntityId
  );
  const runtimePowerState =
    runtimePowerEntityId === powerAwareEntityId
      ? powerAwareState
      : powerAwareContext.states?.get(runtimePowerEntityId);
  return entityPowerIsOn(runtimePowerEntityId, runtimePowerState, powerAwareComponent);
}
function resolveStateEntry(stateSource) {
  return stateSource?.newState || stateSource || null;
}
export function iconButtonEffectLightVisualAwaiting(effectAwaitComponent, effectAwaitContext = {}) {
  const effectAwaitProperties = effectAwaitComponent?.properties || {};
  const effectAwaitEntityId = String(effectAwaitComponent?.bindings?.entity?.entityId || "");
  if (
    !!effectAwaitContext.editable ||
    !effectAwaitEntityId.startsWith("light.") ||
    (effectAwaitProperties.effectBrightnessRealtime === false &&
      effectAwaitProperties.effectColorTemperatureRealtime === false)
  ) {
    return false;
  }
  const effectAwaitState = resolveStateEntry(effectAwaitContext.states?.get?.(effectAwaitEntityId));
  const effectAwaitStateText = String(effectAwaitState?.state || "").toLowerCase();
  if (
    !effectAwaitState ||
    effectAwaitStateText === "unknown" ||
    effectAwaitStateText === "unavailable"
  ) {
    return true;
  }
  if (
    effectAwaitContext.pendingOptimisticState?.desiredActive === true ||
    effectAwaitStateText !== "on"
  ) {
    return false;
  }
  const effectAwaitAttributes = effectAwaitState.attributes || {};
  const effectAwaitRealtimeCapabilities = lightRealtimeCapabilities(
    effectAwaitEntityId,
    effectAwaitState
  );
  const hasNumericAttribute = attributeKey =>
    effectAwaitAttributes[attributeKey] !== null &&
    effectAwaitAttributes[attributeKey] !== undefined &&
    effectAwaitAttributes[attributeKey] !== "" &&
    Number.isFinite(Number(effectAwaitAttributes[attributeKey]));
  if (
    effectAwaitProperties.effectBrightnessRealtime !== false &&
    effectAwaitRealtimeCapabilities.brightness &&
    !hasNumericAttribute("brightness")
  ) {
    return true;
  }
  const effectSupportedColorModes = Array.isArray(effectAwaitAttributes.supported_color_modes)
    ? effectAwaitAttributes.supported_color_modes.map(colorModeName =>
        String(colorModeName || "").toLowerCase()
      )
    : [];
  const effectActiveColorMode = String(effectAwaitAttributes.color_mode || "").toLowerCase();
  const isEffectColorTemperatureMode =
    effectActiveColorMode === "color_temp" ||
    (!effectActiveColorMode &&
      effectSupportedColorModes.length === 1 &&
      effectSupportedColorModes[0] === "color_temp");
  return (
    effectAwaitProperties.effectColorTemperatureRealtime !== false &&
    !!effectAwaitRealtimeCapabilities.colorTemperature &&
    !!isEffectColorTemperatureMode &&
    !hasNumericAttribute("color_temp_kelvin") &&
    !hasNumericAttribute("color_temp")
  );
}
export function vacuumMapImageSource(vacuumImageEntityId, vacuumImageState = null) {
  const vacuumImageResolvedState = resolveStateEntry(vacuumImageState) || {};
  const vacuumImageCacheKey = String(
    vacuumImageResolvedState.updatedAt ||
      vacuumImageResolvedState.lastChanged ||
      vacuumImageResolvedState.state ||
      "initial"
  );
  return (
    "/api/image_proxy/" +
    encodeURIComponent(String(vacuumImageEntityId || "")) +
    "?hb=" +
    encodeURIComponent(vacuumImageCacheKey)
  );
}
import {
  lightStatisticsEntityStateStatus,
  lightStatisticsEntitySupport,
  lightStatisticsSummary
} from "./light-statistics-runtime.js?v=20260915211726";
import {
  automaticNumericPrecision,
  formatLineChartValue,
  formatNumericValue,
  lineChartGeometry,
  normalizedStatePrecision
} from "./line-chart-runtime.js?v=20260915211726";
import {
  doorWindowPerspectiveCorners,
  doorWindowPerspectiveMatrix
} from "./door-window-runtime.js?v=20260915211726";
import {
  automaticThresholds,
  meteoconUrl,
  normalizedThresholds,
  resolvedThresholds,
  smoothChartPath,
  thresholdColor,
  weatherVisual
} from "./weather-chart-runtime.js?v=20260915211726";
import {
  formatLocalDate,
  formatLocalTime,
  formatLunarDate
} from "./date-time-runtime.js?v=20260915211726";
export {
  lightStatisticsEntityStateStatus as lightStatisticsEntityStateStatus,
  lightStatisticsEntitySupport as lightStatisticsEntitySupport,
  lightStatisticsSummary as lightStatisticsSummary,
  automaticNumericPrecision as automaticNumericPrecision,
  formatLineChartValue as formatLineChartValue,
  formatNumericValue as formatNumericValue,
  lineChartGeometry as lineChartGeometry,
  normalizedStatePrecision as normalizedStatePrecision,
  doorWindowPerspectiveCorners as doorWindowPerspectiveCorners,
  doorWindowPerspectiveMatrix as doorWindowPerspectiveMatrix,
  meteoconUrl as meteoconUrl,
  automaticThresholds as automaticThresholds,
  normalizedThresholds as normalizedThresholds,
  resolvedThresholds as resolvedThresholds,
  smoothChartPath as smoothChartPath,
  thresholdColor as thresholdColor,
  weatherVisual as weatherVisual,
  formatLocalDate as formatLocalDate,
  formatLocalTime as formatLocalTime,
  formatLunarDate as formatLunarDate
};
import {
  formatPresenceDuration,
  presenceAnimationPhase,
  presenceHistoryBuckets,
  presenceMotionEventConfig,
  presenceSensorPresentation,
  presenceStateTimestamp
} from "./presence-runtime.js?v=20260915211726";
export {
  formatPresenceDuration as formatPresenceDuration,
  presenceAnimationPhase as presenceAnimationPhase,
  presenceHistoryBuckets as presenceHistoryBuckets,
  presenceMotionEventConfig as presenceMotionEventConfig,
  presenceSensorPresentation as presenceSensorPresentation,
  presenceStateTimestamp as presenceStateTimestamp
};
function resolveStateIcon(stateIconEntityId, stateIconEntityState) {
  const stateIconName = String(
    resolveStateEntry(stateIconEntityState)?.attributes?.icon || ""
  ).trim();
  if (stateIconName) {
    return stateIconName;
  }
  const entityDomainName = String(stateIconEntityId || "").split(".")[0];
  return (
    {
      binary_sensor: "mdi:radiobox-marked",
      button: "mdi:gesture-tap-button",
      climate: "mdi:thermostat",
      cover: "mdi:window-shutter",
      fan: "mdi:fan",
      input_boolean: "mdi:toggle-switch",
      light: "mdi:lightbulb-outline",
      lock: "mdi:lock-outline",
      media_player: "mdi:play-circle-outline",
      number: "mdi:numeric",
      remote: "mdi:remote",
      sensor: "mdi:gauge",
      switch: "mdi:toggle-switch-outline",
      water_heater: "mdi:water-boiler"
    }[entityDomainName] || "mdi:devices"
  );
}
export function formatEntityState(rawState, formattedEntityId = "", formatContext = {}) {
  const resolvedStateEntry = resolveStateEntry(rawState);
  if (!resolvedStateEntry) {
    return "等待实体状态";
  }
  const stateValueText = String(resolvedStateEntry.state ?? "").trim();
  const entityMetadataEntry = formatContext.entityMetadata?.get?.(formattedEntityId) || {};
  const integrationPlatform = String(entityMetadataEntry.platform || "").trim();
  const entityDomain = String(
    entityMetadataEntry.domain || formattedEntityId.split(".")[0] || ""
  ).trim();
  const translationKey = String(entityMetadataEntry.translationKey || "").trim();
  const stateTranslationKey =
    integrationPlatform && entityDomain && translationKey && stateValueText
      ? "component." +
        integrationPlatform +
        ".entity." +
        entityDomain +
        "." +
        translationKey +
        ".state." +
        stateValueText
      : "";
  const deviceClass = String(resolvedStateEntry.attributes?.device_class || "").trim();
  const componentTranslationKey =
    entityDomain && deviceClass && stateValueText
      ? "component." +
        entityDomain +
        ".entity_component." +
        deviceClass +
        ".state." +
        stateValueText
      : "";
  const translatedStateText = String(
    (stateTranslationKey ? formatContext.entityTranslations?.[stateTranslationKey] : "") ||
      (componentTranslationKey
        ? formatContext.entityTranslations?.[componentTranslationKey]
        : "") ||
      ""
  ).trim();
  const defaultStateLabels =
    {
      on: "开启",
      off: "关闭",
      open: "打开",
      closed: "关闭",
      locked: "已上锁",
      unlocked: "已解锁",
      home: "在家",
      not_home: "离家",
      unavailable: "不可用",
      unknown: "未知",
      idle: "待机",
      sweeping: "扫地中",
      charging: "充电中",
      docked: "已停靠",
      partlycloudy: "晴间多云",
      "power off": "已关闭",
      playing: "播放中",
      paused: "已暂停"
    }[stateValueText.toLowerCase()] ||
    stateValueText ||
    "未知";
  const coverStateOverride =
    String(formattedEntityId || "").startsWith("cover.") &&
    isCoverMotorReversed(formatContext.component)
      ? {
          open: "关闭",
          closed: "打开",
          opening: "正在关闭",
          closing: "正在打开"
        }[stateValueText.toLowerCase()]
      : "";
  const numericStateValue = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(stateValueText)
    ? Number(stateValueText)
    : Number.NaN;
  const displayState = Number.isFinite(numericStateValue)
    ? formatNumericValue(numericStateValue, formatContext.component?.properties?.statePrecision)
    : coverStateOverride || translatedStateText || defaultStateLabels;
  const unitOfMeasurement = String(resolvedStateEntry.attributes?.unit_of_measurement || "").trim();
  if (unitOfMeasurement && !["不可用", "未知"].includes(displayState)) {
    return displayState + " " + unitOfMeasurement;
  } else {
    return displayState;
  }
}
function isLightVisualActive(visualComponent, visualContext) {
  if (visualContext.editable && visualContext.previewState === "on") {
    return true;
  }
  if (visualContext.editable && visualContext.previewState === "off") {
    return false;
  }
  const visualEntityId = visualComponent.bindings?.entity?.entityId || "";
  return (
    !!visualEntityId &&
    !!isComponentEntityActive(
      visualComponent,
      visualEntityId,
      visualContext.states?.get(visualEntityId),
      visualContext
    )
  );
}
export const ICON_BUTTON_EFFECT_BASE_TEMPERATURE_KELVIN = 3500;
function brightnessPercentToOpacity(brightnessPercent) {
  if (
    brightnessPercent == null ||
    brightnessPercent === "" ||
    !Number.isFinite(Number(brightnessPercent))
  ) {
    return 1;
  }
  const clampedBrightness = Math.max(0, Math.min(1, Number(brightnessPercent) / 100));
  if (clampedBrightness <= 0) {
    return 0;
  } else {
    return 0.2 + clampedBrightness * 0.8;
  }
}
function resolveColorTemperature(kelvinAttributes = {}) {
  const colorTempKelvin = Number(kelvinAttributes.color_temp_kelvin);
  if (Number.isFinite(colorTempKelvin) && colorTempKelvin > 0) {
    return colorTempKelvin;
  }
  const colorTempMired = Number(kelvinAttributes.color_temp);
  if (Number.isFinite(colorTempMired) && colorTempMired > 0) {
    return 1000000 / colorTempMired;
  } else {
    return null;
  }
}
export function iconButtonEffectLightVisualState(lightVisualComponent, lightVisualContext = {}) {
  const lightVisualEntityId = String(lightVisualComponent?.bindings?.entity?.entityId || "");
  const lightVisualAttributes =
    resolveStateEntry(lightVisualContext.states?.get?.(lightVisualEntityId))?.attributes || {};
  if (!lightVisualEntityId.startsWith("light.")) {
    return {
      brightnessPercent: null,
      colorTemperatureKelvin: null,
      opacity: 1,
      filter: "none"
    };
  }
  const brightnessAttribute = lightVisualAttributes.brightness;
  const brightnessNumber =
    brightnessAttribute == null || brightnessAttribute === ""
      ? Number.NaN
      : Number(brightnessAttribute);
  const brightnessPercentValue = Number.isFinite(brightnessNumber)
    ? Math.max(0, Math.min(100, (brightnessNumber / 255) * 100))
    : null;
  const colorTemperatureKelvin = resolveColorTemperature(lightVisualAttributes);
  const visualProperties = lightVisualComponent?.properties || {};
  const isBrightnessRealtime = visualProperties.effectBrightnessRealtime !== false;
  const isColorTemperatureRealtime = visualProperties.effectColorTemperatureRealtime !== false;
  const brightnessOpacity = isBrightnessRealtime
    ? brightnessPercentToOpacity(brightnessPercentValue)
    : 1;
  if (!isColorTemperatureRealtime || !Number.isFinite(colorTemperatureKelvin)) {
    return {
      brightnessPercent: brightnessPercentValue,
      colorTemperatureKelvin: null,
      opacity: brightnessOpacity,
      filter: "none"
    };
  }
  const warmFactor = Math.max(
    0,
    Math.min(1, (ICON_BUTTON_EFFECT_BASE_TEMPERATURE_KELVIN - colorTemperatureKelvin) / 1500)
  );
  const coolFactor = Math.max(
    0,
    Math.min(1, (colorTemperatureKelvin - ICON_BUTTON_EFFECT_BASE_TEMPERATURE_KELVIN) / 3000)
  );
  const saturationFactor = 1 + warmFactor * 0.95 - coolFactor * 0.55;
  return {
    brightnessPercent: brightnessPercentValue,
    colorTemperatureKelvin: colorTemperatureKelvin,
    opacity: brightnessOpacity,
    filter: "saturate(" + saturationFactor.toFixed(3) + ")"
  };
}
function isDeviceButtonVisualActive(buttonPreviewComponent, buttonPreviewContext) {
  if (buttonPreviewContext.editable && buttonPreviewContext.previewState === "on") {
    return true;
  }
  if (buttonPreviewContext.editable && buttonPreviewContext.previewState === "off") {
    return false;
  }
  const buttonPreviewEntityId = buttonPreviewComponent.bindings?.entity?.entityId || "";
  return (
    !!buttonPreviewEntityId &&
    !!isComponentEntityActive(
      buttonPreviewComponent,
      buttonPreviewEntityId,
      buttonPreviewContext.states?.get(buttonPreviewEntityId),
      buttonPreviewContext
    )
  );
}
function resolveClimatePresentationMode(climateComponent, climateContext) {
  const climateEntityId = climateComponent.bindings?.entity?.entityId || "";
  const climateState = resolveStateEntry(climateContext.states?.get(climateEntityId));
  const climateDeviceType = resolveClimateDeviceType(
    climateComponent,
    climateState,
    climateEntityId
  );
  if (climateContext.editable && climateContext.previewState === "on") {
    if (climateDeviceType === "bath-heater") {
      return "heat";
    } else {
      return "cool";
    }
  } else if (climateContext.editable && climateContext.previewState === "off") {
    return "off";
  } else {
    return climatePresentationMode(climateState, climateDeviceType).toLowerCase();
  }
}
function isClimateDeviceActive(poweredComponent, poweredContext) {
  if (poweredContext.editable && poweredContext.previewState === "on") {
    return true;
  }
  if (poweredContext.editable && poweredContext.previewState === "off") {
    return false;
  }
  const poweredEntityId = poweredComponent.bindings?.entity?.entityId || "";
  const poweredState = resolveStateEntry(poweredContext.states?.get(poweredEntityId));
  return climateIsPoweredOn(
    poweredState,
    resolveClimateDeviceType(poweredComponent, poweredState, poweredEntityId)
  );
}
function resolveClimateEffectMode(effectModeComponent, effectModeContext) {
  const effectModeEntityId = effectModeComponent.bindings?.entity?.entityId || "";
  const effectModeState = resolveStateEntry(effectModeContext.states?.get(effectModeEntityId));
  const effectModeDeviceType = resolveClimateDeviceType(
    effectModeComponent,
    effectModeState,
    effectModeEntityId
  );
  if (effectModeContext.editable && effectModeContext.previewState === "on") {
    return "cool";
  } else if (effectModeContext.editable && effectModeContext.previewState === "off") {
    return "off";
  } else {
    return climateEffectMode(effectModeState, effectModeDeviceType);
  }
}
function resolveClimateLabel(modeLabelComponent, modeLabelContext) {
  const modeLabelEntityId = modeLabelComponent.bindings?.entity?.entityId || "";
  const modeLabelState = resolveStateEntry(modeLabelContext.states?.get(modeLabelEntityId));
  const climateMode = resolveClimatePresentationMode(modeLabelComponent, modeLabelContext);
  const modeLabelDeviceType = resolveClimateDeviceType(
    modeLabelComponent,
    modeLabelState,
    modeLabelEntityId
  );
  const climateModeText = climateModeLabel(climateMode, modeLabelDeviceType);
  if (!isClimateDeviceActive(modeLabelComponent, modeLabelContext)) {
    return climateModeText;
  }
  const climateCapabilities = normalizeClimateCapabilities(modeLabelState);
  if (climateCapabilities.targetTemperature !== null) {
    return climateModeText + " · " + climateCapabilities.targetTemperature + "°C";
  } else if (climateCapabilities.currentTemperature !== null) {
    return climateModeText + " · " + climateCapabilities.currentTemperature + "°C";
  } else {
    return climateModeText;
  }
}
function buildAirflowSvg(airflowProperties = {}, airflowClimateMode = "other") {
  const airflowMotionMode = airflowProperties.airflowMotion === "static" ? "static" : "dynamic";
  const airflowColor =
    airflowClimateMode === "cool"
      ? resolveColor(airflowProperties.airflowCoolColor, "#73c8ff")
      : airflowClimateMode === "heat"
        ? resolveColor(airflowProperties.airflowHeatColor, "#ff8a65")
        : resolveColor(airflowProperties.airflowOtherColor, "#ffffff");
  const airflowAngleDeg = clampNumber(airflowProperties.airflowAngle, -360, 360, 7);
  const airflowLengthRatio = clampNumber(airflowProperties.airflowLength, 10, 300, 200) / 100;
  const airflowFadeRatio = clampNumber(airflowProperties.airflowFadePosition, 15, 100, 50) / 100;
  const airflowSpreadValue = clampNumber(airflowProperties.airflowSpread, 10, 300, 100);
  const airflowCurveValue = Math.tanh(
    clampNumber(airflowProperties.airflowCurve, -200, 200, 20) / 140
  );
  const airflowDensityRatio = clampNumber(airflowProperties.airflowDensity, 20, 200, 60) / 100;
  const airflowIrregularityRatio =
    clampNumber(airflowProperties.airflowIrregularity, 0, 200, 50) / 100;
  const airflowThicknessRatio = clampNumber(airflowProperties.airflowThickness, 5, 300, 40) / 100;
  const airflowStrengthRatio = clampNumber(airflowProperties.airflowStrength, 0, 500, 200) / 100;
  const airflowBlurPx = clampNumber(airflowProperties.airflowBlur, 0, 30, 6);
  const airflowSpeedSeconds = clampNumber(airflowProperties.airflowSpeed, 0.3, 12, 1);
  const airflowTopY = 6;
  const airflowBottomY = airflowTopY + (228 - airflowTopY) * airflowFadeRatio;
  const airflowMidY = airflowTopY + (airflowBottomY - airflowTopY) * 0.63;
  const airflowTailY = airflowMidY + (airflowBottomY - airflowMidY) * 0.56;
  const airflowSpreadPx = Math.min(70, Math.sqrt(airflowSpreadValue / 100) * 44);
  const pseudoRandomUnit = randomSeed => {
    const randomSeedProduct = Math.sin(randomSeed * 12.9898) * 43758.5453;
    return randomSeedProduct - Math.floor(randomSeedProduct);
  };
  const airflowStrandCount = Math.max(3, Math.min(12, Math.round(airflowDensityRatio * 8)));
  const airflowWispCount = Math.max(2, Math.min(4, Math.round(1.5 + airflowDensityRatio * 1.2)));
  const airflowStrandOffsets = Array.from(
    {
      length: airflowStrandCount
    },
    (strandElement, strandIndex) => {
      const strandRatio = airflowStrandCount === 1 ? 0.5 : strandIndex / (airflowStrandCount - 1);
      const strandJitter =
        (pseudoRandomUnit(strandIndex + 3) - 0.5) * 10 * airflowIrregularityRatio;
      return Math.max(
        10,
        Math.min(170, 90 + (strandRatio - 0.5) * airflowSpreadPx * 2 + strandJitter)
      );
    }
  );
  const minStrandOffset = Math.min(...airflowStrandOffsets);
  const maxStrandOffset = Math.max(...airflowStrandOffsets);
  const strandBaseOffset = airflowCurveValue >= 0 ? 168 - maxStrandOffset : minStrandOffset - 12;
  const strandCurveOffset = airflowCurveValue * Math.max(0, strandBaseOffset);
  const airflowStrandPaths = airflowStrandOffsets.map(strandOffset => {
    const strandEndOffset = strandOffset + strandCurveOffset;
    const strandControlOffset = strandOffset + strandCurveOffset * 0.42;
    return (
      "M" +
      strandOffset.toFixed(2) +
      " " +
      airflowTopY +
      "L" +
      strandOffset.toFixed(2) +
      " " +
      airflowMidY.toFixed(2) +
      "C" +
      strandOffset.toFixed(2) +
      " " +
      airflowTailY.toFixed(2) +
      " " +
      strandControlOffset.toFixed(2) +
      " " +
      airflowBottomY.toFixed(2) +
      " " +
      strandEndOffset.toFixed(2) +
      " " +
      airflowBottomY.toFixed(2)
    );
  });
  const airflowWisps = airflowStrandPaths.flatMap((strandPathD, strandPathIndex) =>
    Array.from(
      {
        length: airflowWispCount
      },
      (wispElement, wispIndex) => {
        const wispSeed = strandPathIndex * 41 + wispIndex * 67 + 11;
        const wispLength = Math.max(
          8,
          Math.min(
            112,
            (34 + pseudoRandomUnit(wispSeed) * 42 * (0.7 + airflowIrregularityRatio * 0.3)) *
              airflowLengthRatio
          )
        );
        const wispWidth = Math.max(
          0.2,
          Math.min(14, (1.5 + pseudoRandomUnit(wispSeed + 7) * 2.9) * airflowThicknessRatio)
        );
        const wispDuration =
          airflowSpeedSeconds *
          (0.8 + pseudoRandomUnit(wispSeed + 13) * 0.42 * (0.55 + airflowIrregularityRatio * 0.45));
        const wispPhase =
          (wispIndex / airflowWispCount +
            strandPathIndex * 0.067 +
            (pseudoRandomUnit(wispSeed + 19) - 0.5) * 0.08 * airflowIrregularityRatio +
            1) %
          1;
        const wispOpacity = Math.min(
          1,
          airflowStrengthRatio * (0.62 + pseudoRandomUnit(wispSeed + 29) * 0.5)
        );
        const wispMarkup =
          '<rect x="' +
          (-wispLength / 2).toFixed(2) +
          '" y="' +
          (-wispWidth * 1.3).toFixed(2) +
          '" width="' +
          wispLength.toFixed(2) +
          '" height="' +
          (wispWidth * 2.6).toFixed(2) +
          '" rx="' +
          (wispWidth * 1.3).toFixed(2) +
          '" fill="url(#wisp)" filter="url(#glow)"/><rect x="' +
          (-wispLength * 0.42).toFixed(2) +
          '" y="' +
          (-wispWidth * 0.22).toFixed(2) +
          '" width="' +
          (wispLength * 0.82).toFixed(2) +
          '" height="' +
          (wispWidth * 0.44).toFixed(2) +
          '" rx="' +
          (wispWidth * 0.22).toFixed(2) +
          '" fill="url(#core)"/>';
        if (airflowMotionMode === "static") {
          return (
            '<g opacity="' +
            wispOpacity.toFixed(3) +
            '">' +
            wispMarkup +
            '<animateMotion path="' +
            strandPathD +
            '" dur="0.001s" keyPoints="' +
            wispPhase.toFixed(4) +
            ";" +
            wispPhase.toFixed(4) +
            '" keyTimes="0;1" fill="freeze" rotate="auto"/></g>'
          );
        } else {
          return (
            '<g opacity="0">' +
            wispMarkup +
            '<animate attributeName="opacity" values="0;' +
            wispOpacity.toFixed(3) +
            ";" +
            wispOpacity.toFixed(3) +
            ';0" keyTimes="0;.06;.78;1" dur="' +
            wispDuration.toFixed(3) +
            's" begin="' +
            (-wispDuration * wispPhase).toFixed(3) +
            's" repeatCount="indefinite"/><animateMotion path="' +
            strandPathD +
            '" dur="' +
            wispDuration.toFixed(3) +
            's" begin="' +
            (-wispDuration * wispPhase).toFixed(3) +
            's" rotate="auto" repeatCount="indefinite"/></g>'
          );
        }
      }
    )
  );
  const airflowSvgMarkup =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 240" preserveAspectRatio="none"><defs><linearGradient id="bed" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' +
    airflowColor +
    '" stop-opacity="0"/><stop offset=".22" stop-color="' +
    airflowColor +
    '" stop-opacity=".25"/><stop offset=".58" stop-color="' +
    airflowColor +
    '" stop-opacity=".8"/><stop offset="1" stop-color="' +
    airflowColor +
    '" stop-opacity="0"/></linearGradient><linearGradient id="wisp"><stop offset="0" stop-color="' +
    airflowColor +
    '" stop-opacity="0"/><stop offset=".2" stop-color="' +
    airflowColor +
    '" stop-opacity=".18"/><stop offset=".52" stop-color="' +
    airflowColor +
    '"/><stop offset=".78" stop-color="' +
    airflowColor +
    '" stop-opacity=".52"/><stop offset="1" stop-color="' +
    airflowColor +
    '" stop-opacity="0"/></linearGradient><linearGradient id="core"><stop offset="0" stop-color="' +
    airflowColor +
    '" stop-opacity="0"/><stop offset=".34" stop-color="' +
    airflowColor +
    '" stop-opacity=".12"/><stop offset=".58" stop-color="' +
    airflowColor +
    '"/><stop offset=".82" stop-color="' +
    airflowColor +
    '" stop-opacity=".28"/><stop offset="1" stop-color="' +
    airflowColor +
    '" stop-opacity="0"/></linearGradient><filter id="glow" x="-120%" y="-240%" width="340%" height="580%"><feGaussianBlur stdDeviation="' +
    Math.max(0.2, airflowBlurPx * 1.35) +
    '"/><feComponentTransfer><feFuncA type="linear" slope="' +
    (airflowStrengthRatio <= 1 ? 1 : 1 + (airflowStrengthRatio - 1) * 0.9).toFixed(3) +
    '"/></feComponentTransfer></filter></defs><g transform="rotate(' +
    airflowAngleDeg +
    ' 90 120)">' +
    airflowStrandPaths
      .map(
        airflowBedPath =>
          '<path d="' +
          airflowBedPath +
          '" fill="none" stroke="url(#bed)" stroke-width="1.2" stroke-linecap="round" opacity="' +
          Math.min(1, airflowStrengthRatio * 0.075).toFixed(3) +
          '"/>'
      )
      .join("") +
    airflowWisps.join("") +
    "</g></svg>";
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(airflowSvgMarkup);
}
export function renderAirConditionerAirflowLayer(airflowLayerComponent, airflowLayerContext) {
  const airflowLayerProperties = airflowLayerComponent.properties || {};
  if (
    airflowLayerProperties.airflowVisible === false ||
    !isClimateDeviceActive(airflowLayerComponent, airflowLayerContext)
  ) {
    return null;
  }
  const airflowLayerElement = document.createElement("div");
  airflowLayerElement.className = "hb-air-conditioner-airflow-layer";
  const airflowImageElement = document.createElement("img");
  airflowImageElement.src = buildAirflowSvg(
    airflowLayerProperties,
    resolveClimateEffectMode(airflowLayerComponent, airflowLayerContext)
  );
  airflowImageElement.alt = "";
  airflowImageElement.draggable = false;
  airflowLayerElement.append(airflowImageElement);
  return airflowLayerElement;
}
function appendSvgElement(svgParentElement, svgTagName, svgAttributes = {}) {
  const createdSvgElement = document.createElementNS("http://www.w3.org/2000/svg", svgTagName);
  for (const [svgAttributeName, svgAttributeValue] of Object.entries(svgAttributes)) {
    createdSvgElement.setAttribute(svgAttributeName, String(svgAttributeValue));
  }
  svgParentElement.append(createdSvgElement);
  return createdSvgElement;
}
function buildHistorySeries(historyContext, historyEntityId, currentStateValue, historyHours = 24) {
  const historySamples = (
    Array.isArray(historyContext.history?.get(historyEntityId)?.points)
      ? historyContext.history.get(historyEntityId).points
      : []
  )
    .map(historyPoint => ({
      timestamp: Date.parse(historyPoint.timestamp),
      value: Number(historyPoint.value)
    }))
    .filter(
      historySample =>
        Number.isFinite(historySample.timestamp) && Number.isFinite(historySample.value)
    );
  const nowTimestamp = Date.now();
  if (Number.isFinite(currentStateValue)) {
    historySamples.push({
      timestamp: nowTimestamp,
      value: currentStateValue
    });
  }
  historySamples.sort(
    (firstSample, secondSample) => firstSample.timestamp - secondSample.timestamp
  );
  const dedupedSamples = historySamples.filter(
    (dedupSample, dedupIndex) =>
      dedupIndex === 0 ||
      dedupSample.timestamp !== historySamples[dedupIndex - 1].timestamp ||
      dedupSample.value !== historySamples[dedupIndex - 1].value
  );
  if (!dedupedSamples.length) {
    return [];
  }
  const sampleBucketCount = Math.round(clampNumber(historyHours, 1, 168, 24));
  const MILLISECONDS_PER_HOUR = 3600000;
  const windowStartTimestamp = nowTimestamp - sampleBucketCount * MILLISECONDS_PER_HOUR;
  const bucketedSamples = [];
  let sampleCursor = 0;
  let lastSample = null;
  for (let bucketIndex = 0; bucketIndex <= sampleBucketCount; bucketIndex += 1) {
    const bucketTimestamp =
      bucketIndex === sampleBucketCount
        ? nowTimestamp
        : windowStartTimestamp + bucketIndex * MILLISECONDS_PER_HOUR;
    while (
      sampleCursor < dedupedSamples.length &&
      dedupedSamples[sampleCursor].timestamp <= bucketTimestamp
    ) {
      lastSample = dedupedSamples[sampleCursor];
      sampleCursor += 1;
    }
    const bucketSample = lastSample || dedupedSamples[sampleCursor] || dedupedSamples[0];
    if (bucketSample) {
      bucketedSamples.push({
        timestamp: bucketTimestamp,
        value: bucketSample.value
      });
    }
  }
  return bucketedSamples;
}
function formatHistoryTimestamp(timestampValue, includeDate = true) {
  const dateTimeFormatOptions = includeDate
    ? {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }
    : {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      };
  return new Intl.DateTimeFormat("zh-CN", dateTimeFormatOptions)
    .format(new Date(timestampValue))
    .replace(/\//g, "-");
}
function attachChartTooltip(
  chartRootElement,
  chartContainerElement,
  tooltipGeometry,
  valueSuffix,
  positionMapper,
  valuePrecision = "auto",
  valueRange = {
    start: 0,
    end: 1
  },
  tooltipParentElement = document.body
) {
  const tooltipElement = document.createElement("span");
  tooltipElement.className = "hb-line-chart-tooltip";
  if (tooltipParentElement === chartContainerElement) {
    tooltipElement.classList.add("hb-line-chart-details-tooltip");
  }
  tooltipElement.hidden = true;
  const hoverGuideElement = document.createElement("i");
  hoverGuideElement.className = "hb-line-chart-hover-guide";
  hoverGuideElement.hidden = true;
  const hoverDotElement = document.createElement("i");
  hoverDotElement.className = "hb-line-chart-hover-dot";
  hoverDotElement.hidden = true;
  chartContainerElement.append(hoverGuideElement, hoverDotElement);
  tooltipParentElement.append(tooltipElement);
  const handlePointerMove = pointerEvent => {
    const dialogLayerElement =
      tooltipParentElement === chartContainerElement
        ? chartContainerElement.closest(".hb-renderer-runtime-dialog-layer")
        : null;
    if (dialogLayerElement && tooltipElement.parentElement !== dialogLayerElement) {
      dialogLayerElement.append(tooltipElement);
    }
    const rootRect = chartRootElement.getBoundingClientRect();
    if (!rootRect.width) {
      return;
    }
    const relativePointerX = (pointerEvent.clientX - rootRect.left) / rootRect.width;
    const rangeRatio = clampNumber(
      (relativePointerX - valueRange.start) / Math.max(0.001, valueRange.end - valueRange.start),
      0,
      1,
      0
    );
    const targetTime =
      tooltipGeometry.firstTime +
      rangeRatio * (tooltipGeometry.lastTime - tooltipGeometry.firstTime);
    const closestSample = tooltipGeometry.points.reduce((nearestSample, candidateSample) =>
      Math.abs(candidateSample.timestamp - targetTime) <
      Math.abs(nearestSample.timestamp - targetTime)
        ? candidateSample
        : nearestSample
    );
    const mappedPosition = positionMapper(closestSample);
    const containerRect = chartContainerElement.getBoundingClientRect();
    const offsetX =
      chartRootElement.getBoundingClientRect().left -
      containerRect.left +
      (mappedPosition.x / 100) * rootRect.width;
    const offsetY =
      chartRootElement.getBoundingClientRect().top -
      containerRect.top +
      (mappedPosition.y / 100) * rootRect.height;
    const pageX = containerRect.left + offsetX;
    const pageY = containerRect.top + offsetY;
    const percentX = (offsetX / Math.max(1, containerRect.width)) * 100;
    const percentY = (offsetY / Math.max(1, containerRect.height)) * 100;
    const isInsideContainer = tooltipElement.parentElement === chartContainerElement;
    const isInsideDialogLayer =
      dialogLayerElement && tooltipElement.parentElement === dialogLayerElement;
    const dialogRect = isInsideDialogLayer ? dialogLayerElement.getBoundingClientRect() : null;
    const chartScale =
      tooltipParentElement === chartContainerElement
        ? rootRect.width /
          Math.max(1, chartRootElement.viewBox?.baseVal?.width || chartRootElement.clientWidth)
        : containerRect.width / Math.max(1, chartContainerElement.offsetWidth);
    const scaleParentElement = isInsideContainer
      ? chartContainerElement
      : isInsideDialogLayer
        ? dialogLayerElement
        : null;
    const scaleParentRect = isInsideContainer ? containerRect : dialogRect;
    const parentScaleX = scaleParentElement
      ? scaleParentRect.width / Math.max(1, scaleParentElement.offsetWidth)
      : 1;
    const parentScaleY = scaleParentElement
      ? scaleParentRect.height / Math.max(1, scaleParentElement.offsetHeight)
      : 1;
    const dialogOffsetX = isInsideDialogLayer ? (pageX - dialogRect.left) / parentScaleX : pageX;
    const dialogOffsetY = isInsideDialogLayer ? (pageY - dialogRect.top) / parentScaleY : pageY;
    tooltipElement.textContent =
      formatHistoryTimestamp(closestSample.timestamp) +
      "  " +
      formatLineChartValue(closestSample.value, valuePrecision) +
      valueSuffix;
    tooltipElement.style.position = isInsideContainer || isInsideDialogLayer ? "absolute" : "fixed";
    tooltipElement.style.left =
      (isInsideContainer ? offsetX / parentScaleX : dialogOffsetX) + "px";
    tooltipElement.style.top =
      (isInsideContainer ? offsetY / parentScaleY : dialogOffsetY) + "px";
    tooltipElement.style.transformOrigin = "0 0";
    tooltipElement.hidden = false;
    const scaledTooltipWidth = tooltipElement.offsetWidth * chartScale;
    const boundLeft = scaleParentRect?.left ?? 0;
    const boundRight = scaleParentRect?.right ?? window.innerWidth;
    const translateX =
      pageX - scaledTooltipWidth / 2 < boundLeft
        ? "0"
        : pageX + scaledTooltipWidth / 2 > boundRight
          ? "-100%"
          : "-50%";
    tooltipElement.style.transform =
      `scale(${chartScale / parentScaleX}, ${chartScale / parentScaleY}) ` +
      `translate(${translateX}, calc(-100% - 9px))`;
    hoverGuideElement.style.left = percentX + "%";
    hoverDotElement.style.left = percentX + "%";
    hoverDotElement.style.top = percentY + "%";
    hoverGuideElement.hidden = false;
    hoverDotElement.hidden = false;
  };
  const handlePointerLeave = () => {
    tooltipElement.hidden = true;
    hoverGuideElement.hidden = true;
    hoverDotElement.hidden = true;
  };
  chartRootElement.addEventListener("pointermove", handlePointerMove);
  chartRootElement.addEventListener("pointerleave", handlePointerLeave);
  return () => {
    chartRootElement.removeEventListener("pointermove", handlePointerMove);
    chartRootElement.removeEventListener("pointerleave", handlePointerLeave);
    tooltipElement.remove();
  };
}
function buildNavigationEffects(
  navFrameComponent,
  navFrameProperties,
  isNavFrameActive,
  navFrameOpacity,
  navGlowStrength,
  navGlowSize
) {
  const navFramePanelWidth = Math.max(1, Number(navFrameComponent.position?.width || 236));
  const navFramePanelHeight = Math.max(1, Number(navFrameComponent.position?.height || 100));
  const navFrameViewBoxHeight = Math.max(8, (navFramePanelHeight * 236) / navFramePanelWidth);
  const navFrameWidth = clampNumber(navFrameProperties.frameWidth, 0, 20, 2);
  const navFrameInset = Math.max(0.5, navFrameWidth / 2 + 0.5);
  const navFrameInnerWidth = Math.max(1, 236 - navFrameInset * 2);
  const navFrameInnerHeight = Math.max(1, navFrameViewBoxHeight - navFrameInset * 2);
  const navFrameCornerRadius =
    Math.min(navFrameInnerWidth, navFrameInnerHeight) *
    clampNumber(navFrameProperties.radius, 0, 0.5, 0.5);
  const navGlowOpacity = Math.min(1, navGlowStrength * 0.38);
  const navGlowStrokeWidth = Math.max(
    0,
    Math.min(navFrameInnerWidth, navFrameInnerHeight) * 0.42 * navGlowSize
  );
  const navGlowBlurStdDeviation = Math.max(
    0,
    Math.min(navFrameInnerWidth, navFrameInnerHeight) * 0.095 * navGlowSize
  );
  const navGradientCenterX = 118;
  const navGradientCenterY = navFrameViewBoxHeight / 2;
  const navFrameColorValue = resolveColor(navFrameProperties.frameColor, "#d9e0e6");
  const navGlowColorValue = resolveColor(navFrameProperties.glowColor, "#f2f6fa");
  const navFrameAngleValue = clampNumber(navFrameProperties.frameAngle, 0, 360, 45);
  const navGlowAngleValue = clampNumber(navFrameProperties.glowAngle, 0, 360, 45);
  const navOpacityDivisor = isNavFrameActive ? 0.98 : 0.48;
  const scaleNavOpacity = navOpacityInput =>
    Math.max(0, Math.min(1, (navOpacityInput * navFrameOpacity) / navOpacityDivisor));
  const navGradientIdSuffix = "navigation-" + randomUuid();
  const navigationFrameElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  navigationFrameElement.classList.add("hb-navigation-effects");
  navigationFrameElement.setAttribute("viewBox", "0 0 236 " + navFrameViewBoxHeight);
  navigationFrameElement.setAttribute("preserveAspectRatio", "none");
  navigationFrameElement.setAttribute("aria-hidden", "true");
  navigationFrameElement.innerHTML =
    '\n    <defs>\n      <linearGradient id="navigation-edge-' +
    navGradientIdSuffix +
    '" gradientUnits="userSpaceOnUse" x1="0" y1="' +
    navGradientCenterY +
    '" x2="236" y2="' +
    navGradientCenterY +
    '" gradientTransform="rotate(' +
    navFrameAngleValue +
    " " +
    navGradientCenterX +
    " " +
    navGradientCenterY +
    ')">\n        <stop offset="0" stop-color="' +
    navFrameColorValue +
    '" stop-opacity="' +
    scaleNavOpacity(isNavFrameActive ? 0.98 : 0.48) +
    '"/>\n        <stop offset=".48" stop-color="' +
    navFrameColorValue +
    '" stop-opacity="' +
    scaleNavOpacity(isNavFrameActive ? 0.58 : 0.22) +
    '"/>\n        <stop offset="1" stop-color="' +
    navFrameColorValue +
    '" stop-opacity="' +
    scaleNavOpacity(isNavFrameActive ? 0.82 : 0.36) +
    '"/>\n      </linearGradient>\n      <linearGradient id="navigation-light-' +
    navGradientIdSuffix +
    '" gradientUnits="userSpaceOnUse" x1="0" y1="' +
    navGradientCenterY +
    '" x2="236" y2="' +
    navGradientCenterY +
    '" gradientTransform="rotate(' +
    navGlowAngleValue +
    " " +
    navGradientCenterX +
    " " +
    navGradientCenterY +
    ')">\n        <stop offset="0" stop-color="' +
    navGlowColorValue +
    '" stop-opacity="' +
    navGlowOpacity +
    '"/>\n        <stop offset=".45" stop-color="' +
    navGlowColorValue +
    '" stop-opacity="' +
    navGlowOpacity * 0.35 +
    '"/>\n        <stop offset="1" stop-color="' +
    navGlowColorValue +
    '" stop-opacity="' +
    navGlowOpacity * 0.72 +
    '"/>\n      </linearGradient>\n      <clipPath id="navigation-shape-' +
    navGradientIdSuffix +
    '"><rect x="' +
    navFrameInset +
    '" y="' +
    navFrameInset +
    '" width="' +
    navFrameInnerWidth +
    '" height="' +
    navFrameInnerHeight +
    '" rx="' +
    navFrameCornerRadius +
    '"/></clipPath>\n      <filter id="navigation-soft-light-' +
    navGradientIdSuffix +
    '" x="-35%" y="-75%" width="170%" height="250%"><feGaussianBlur stdDeviation="' +
    navGlowBlurStdDeviation +
    '"/></filter>\n    </defs>\n    ' +
    (navFrameProperties.glowVisible !== false && navGlowStrokeWidth > 0 && navGlowOpacity > 0
      ? '<g clip-path="url(#navigation-shape-' +
        navGradientIdSuffix +
        ')"><rect x="' +
        navFrameInset +
        '" y="' +
        navFrameInset +
        '" width="' +
        navFrameInnerWidth +
        '" height="' +
        navFrameInnerHeight +
        '" rx="' +
        navFrameCornerRadius +
        '" fill="none" stroke="url(#navigation-light-' +
        navGradientIdSuffix +
        ')" stroke-width="' +
        navGlowStrokeWidth +
        '" filter="url(#navigation-soft-light-' +
        navGradientIdSuffix +
        ')"/></g>'
      : "") +
    "\n    " +
    (navFrameProperties.frameVisible !== false
      ? '<rect x="' +
        navFrameInset +
        '" y="' +
        navFrameInset +
        '" width="' +
        navFrameInnerWidth +
        '" height="' +
        navFrameInnerHeight +
        '" rx="' +
        navFrameCornerRadius +
        '" fill="none" stroke="url(#navigation-edge-' +
        navGradientIdSuffix +
        ')" stroke-width="' +
        navFrameWidth +
        '"/>'
      : "") +
    "\n  ";
  return navigationFrameElement;
}
export function navigationButtonIsActive({
  targetPage: navigationTargetPage = "",
  currentPagePath: activePagePath = "",
  entityId: navigationStateEntityId = "",
  entityActive: isNavigationEntityActive = false,
  previewState: navigationPreviewState = "auto"
} = {}) {
  if (navigationPreviewState === "on") {
    return true;
  } else if (navigationPreviewState === "off") {
    return false;
  } else if (navigationTargetPage) {
    return navigationTargetPage === activePagePath;
  } else {
    return !!navigationStateEntityId && !!isNavigationEntityActive;
  }
}
registerComponent("image", {
  render(imageComponent) {
    const imageProperties = imageComponent.properties || {};
    const imageSource = staticAssetImageSource(imageProperties.assetId);
    if (!imageSource) {
      const imageEmptyElement = document.createElement("div");
      imageEmptyElement.className = "hb-unknown-component";
      imageEmptyElement.textContent = "尚未选择图片";
      return imageEmptyElement;
    }
    const imageElement = document.createElement("img");
    imageElement.className = "hb-image-component";
    imageElement.src = imageSource;
    imageElement.alt = imageProperties.alt || imageProperties.label || "图片";
    imageElement.draggable = false;
    imageElement.style.objectFit = "contain";
    imageElement.style.opacity = String(
      Math.max(0, Math.min(1, Number(imageProperties.opacity ?? 1)))
    );
    return imageElement;
  }
});
function isLayerEntityActive(diagramLayerEntityId, layerContext) {
  if (!diagramLayerEntityId) {
    return false;
  }
  const layerState = layerContext?.states?.get?.(String(diagramLayerEntityId));
  const layerStateText = String(
    layerState?.newState?.state ?? layerState?.state ?? ""
  ).toLowerCase();
  return ["on", "true", "1", "open", "opening", "active", "playing"].includes(layerStateText);
}
registerComponent("floorplan-auto-diagram", {
  render(diagramComponent, diagramContext = {}) {
    const diagramProperties = diagramComponent.properties || {};
    const diagramElement = document.createElement("div");
    diagramElement.className = "hb-floorplan-auto-diagram";
    diagramElement.setAttribute(
      "aria-label",
      diagramProperties.label || diagramProperties.instanceName || "户型图自动导图"
    );
    if (
      diagramContext.editable &&
      diagramProperties.previewReady === true &&
      (diagramProperties.generated !== true || diagramProperties.previewing === true)
    ) {
      const diagramPreviewFrameElement = document.createElement("iframe");
      diagramPreviewFrameElement.className =
        "hb-floorplan-auto-diagram-preview is-" +
        (diagramProperties.interactionMode === "view" ? "view" : "position") +
        "-mode";
      diagramPreviewFrameElement.title = "3D户型图构图预览";
      const diagramCanvasMetrics = diagramContext.document?.canvas || {};
      const diagramPosition = diagramComponent.position || {};
      const diagramExportFolder =
        diagramProperties.exportFolder || "自动导图-" + diagramComponent.id;
      const diagramQueryParams = new URLSearchParams({
        "auto-diagram-component": diagramComponent.id,
        "auto-diagram-embed": "1",
        "dashboard-width": String(Number(diagramCanvasMetrics.width || 2778)),
        "dashboard-height": String(Number(diagramCanvasMetrics.height || 1940)),
        "component-width": String(Math.max(1, Math.round(Number(diagramPosition.width || 100)))),
        "component-height": String(Math.max(1, Math.round(Number(diagramPosition.height || 100)))),
        "export-folder": diagramExportFolder
      });
      if (diagramProperties.floorSelection) {
        diagramQueryParams.set("floor-selection", String(diagramProperties.floorSelection));
      }
      diagramPreviewFrameElement.src = "/3d-studio?" + diagramQueryParams;
      diagramPreviewFrameElement.setAttribute("allow", "fullscreen");
      diagramElement.append(diagramPreviewFrameElement);
      const diagramLoadingElement = document.createElement("div");
      diagramLoadingElement.className = "hb-floorplan-auto-diagram-loading";
      diagramLoadingElement.innerHTML =
        '<i aria-hidden="true"></i><strong>正在加载3D户型…</strong>';
      diagramElement.append(diagramLoadingElement);
      const diagramHintElement = document.createElement("div");
      diagramHintElement.className = "hb-floorplan-auto-diagram-preview-hint";
      diagramHintElement.textContent =
        diagramProperties.interactionMode === "view"
          ? "拖动旋转 · 右键平移 · 滚轮缩放"
          : "拖动控件调整位置，右下角调整大小";
      diagramElement.append(diagramHintElement);
      return diagramElement;
    }
    const diagramBaseImageElement = document.createElement("img");
    diagramBaseImageElement.className = "hb-floorplan-auto-diagram-base";
    diagramBaseImageElement.alt = "户型图";
    diagramBaseImageElement.draggable = false;
    const diagramBaseImageSource = resolveAssetUrl(
      diagramProperties.baseAssetId || diagramProperties.floorPlanAssetId || ""
    );
    if (diagramBaseImageSource) {
      diagramBaseImageElement.src = diagramBaseImageSource;
    } else {
      diagramBaseImageElement.className += " is-empty";
      diagramBaseImageElement.alt = "";
    }
    diagramElement.append(diagramBaseImageElement);
    const diagramLayerEntries = [];
    const diagramLayerButtons = [];
    const syncDiagramLayerState = () => {
      for (const diagramLayerEntry of diagramLayerEntries) {
        const isDiagramLayerActive = isLayerEntityActive(
          diagramLayerEntry.entityId,
          diagramContext
        );
        diagramLayerEntry.image.classList.toggle(
          "is-active",
          isDiagramLayerActive || diagramContext.editable
        );
        diagramLayerEntry.button.classList.toggle("is-active", isDiagramLayerActive);
        diagramLayerEntry.button.setAttribute("aria-pressed", String(isDiagramLayerActive));
      }
    };
    const diagramLightLayers = Array.isArray(diagramProperties.lightLayers)
      ? diagramProperties.lightLayers
      : [];
    for (const diagramLightLayer of diagramLightLayers) {
      const layerImageElement = document.createElement("img");
      layerImageElement.className = "hb-floorplan-auto-diagram-layer";
      layerImageElement.alt = "";
      layerImageElement.draggable = false;
      const layerImageSource = resolveAssetUrl(diagramLightLayer.assetId || "");
      if (layerImageSource) {
        layerImageElement.src = layerImageSource;
      }
      const layerBinding = diagramComponent.bindings?.["lightGroup:" + diagramLightLayer.id] || {};
      const layerEntityId = String(layerBinding.entityId || diagramLightLayer.entityId || "");
      const layerButtonElement = document.createElement("button");
      layerButtonElement.type = "button";
      layerButtonElement.className = "hb-floorplan-auto-diagram-button";
      layerButtonElement.textContent = diagramLightLayer.name || diagramLightLayer.note || "灯组";
      if (diagramLightLayer.note) {
        layerButtonElement.title = diagramLightLayer.note;
      }
      layerButtonElement.addEventListener("click", async layerClickEvent => {
        layerClickEvent.preventDefault();
        layerClickEvent.stopPropagation();
        if (
          !!layerEntityId &&
          !diagramContext.editable &&
          typeof diagramContext.callEntityService == "function"
        ) {
          layerButtonElement.disabled = true;
          try {
            await diagramContext.callEntityService("homeassistant", "toggle", layerEntityId);
          } catch (toggleError) {
            diagramContext.onError?.(toggleError);
          } finally {
            layerButtonElement.disabled = false;
          }
        }
      });
      diagramElement.append(layerImageElement, layerButtonElement);
      const layerEntryRecord = {
        image: layerImageElement,
        button: layerButtonElement,
        entityId: layerEntityId
      };
      diagramLayerEntries.push(layerEntryRecord);
      diagramLayerButtons.push(layerButtonElement);
      if (layerEntityId && typeof diagramContext.registerRuntimeStateHandler == "function") {
        diagramContext.registerRuntimeStateHandler(layerEntityId, syncDiagramLayerState);
      }
    }
    if (!diagramBaseImageSource) {
      const diagramEmptyHintElement = document.createElement("div");
      diagramEmptyHintElement.className = "hb-floorplan-auto-diagram-empty";
      diagramEmptyHintElement.textContent = "请先完成户型和灯组，再生成导图";
      diagramElement.append(diagramEmptyHintElement);
    }
    diagramElement.syncFloorplanAutoDiagramState = syncDiagramLayerState;
    syncDiagramLayerState();
    return diagramElement;
  }
});
export function renderIconButtonEffectLayer(effectLayerComponent, effectLayerContext) {
  const effectLayerProperties = effectLayerComponent.properties || {};
  const effectVariantRecord = effectLayerContext.editable
    ? null
    : effectVariantByAssetId.get(String(effectLayerProperties.effectAssetId || ""));
  const effectImageSource =
    effectVariantRecord?.url || resolveAssetUrl(effectLayerProperties.effectAssetId);
  if (!effectImageSource || effectLayerProperties.effectVisible === false) {
    return null;
  }
  const isEffectActive = isLightVisualActive(effectLayerComponent, effectLayerContext);
  const effectVisualState = iconButtonEffectLightVisualState(
    effectLayerComponent,
    effectLayerContext
  );
  const isEffectAwaiting = iconButtonEffectLightVisualAwaiting(
    effectLayerComponent,
    effectLayerContext
  );
  const effectLayerElement = document.createElement("div");
  effectLayerElement.className =
    "hb-icon-button-effect-layer" +
    (isEffectActive ? " active" : "") +
    (isEffectAwaiting ? " awaiting-light-visual" : "");
  effectLayerElement.style.setProperty(
    "--hb-effect-image-opacity",
    String(clampNumber(effectLayerProperties.effectOpacity, 0, 1, 1) * effectVisualState.opacity)
  );
  const effectFadeDuration = clampNumber(effectLayerProperties.effectFadeDuration, 0, 3, 0.52);
  effectLayerElement.style.setProperty("--hb-effect-fade-duration", effectFadeDuration + "s");
  effectLayerElement.style.setProperty(
    "--hb-effect-visual-transition-duration",
    Math.max(0.45, effectFadeDuration) + "s"
  );
  const effectImageElement = document.createElement("img");
  if (effectVariantRecord) {
    effectImageElement.dataset.effectSource = effectImageSource;
  } else {
    effectImageElement.src = effectImageSource;
  }
  effectImageElement.alt = "";
  effectImageElement.draggable = false;
  effectImageElement.decoding = "async";
  effectImageElement.style.objectFit = "contain";
  effectImageElement.style.mixBlendMode = "normal";
  effectImageElement.style.filter = effectVisualState.filter;
  if (effectVariantRecord) {
    effectImageElement.dataset.effectOriginalWidth = String(effectVariantRecord.originalWidth);
    effectImageElement.dataset.effectOriginalHeight = String(effectVariantRecord.originalHeight);
    effectImageElement.dataset.effectCropX = String(effectVariantRecord.cropX);
    effectImageElement.dataset.effectCropY = String(effectVariantRecord.cropY);
    effectImageElement.dataset.effectCropWidth = String(effectVariantRecord.width);
    effectImageElement.dataset.effectCropHeight = String(effectVariantRecord.height);
  }
  effectLayerElement.append(effectImageElement);
  return effectLayerElement;
}
registerComponent("icon-button-effect", {
  render(effectButtonComponent, effectButtonContext) {
    const effectButtonProperties = effectButtonComponent.properties || {};
    const isEffectButtonActive = isLightVisualActive(effectButtonComponent, effectButtonContext);
    const isEffectIconVisible =
      effectButtonContext?.isIconVisible?.(effectButtonComponent.id) !== false;
    const effectButtonElement = document.createElement("div");
    effectButtonElement.className =
      "hb-icon-button-effect" + (isEffectButtonActive ? " active" : "");
    effectButtonElement.hidden = effectButtonProperties.buttonVisible === false;
    effectButtonElement.style.opacity = isEffectIconVisible ? "1" : "0";
    effectButtonElement.style.transition = "opacity .24s ease";
    effectButtonElement.style.setProperty(
      "--effect-button-color",
      resolveColor(
        isEffectButtonActive
          ? effectButtonProperties.buttonOnColor
          : effectButtonProperties.buttonOffColor,
        isEffectButtonActive ? "#1f91b8" : "#17242d"
      )
    );
    effectButtonElement.style.setProperty(
      "--effect-button-opacity",
      clampNumber(effectButtonProperties.buttonOpacity, 0, 1, 0.92) * 100 + "%"
    );
    effectButtonElement.style.setProperty(
      "--effect-frame-color",
      resolveColor(effectButtonProperties.frameColor, "#dcebf2")
    );
    effectButtonElement.style.setProperty(
      "--effect-frame-width",
      clampNumber(effectButtonProperties.frameWidth, 0, 20, 1.5) + "px"
    );
    effectButtonElement.style.setProperty(
      "--effect-frame-opacity",
      clampNumber(effectButtonProperties.frameOpacity, 0, 1, 0.72) * 100 + "%"
    );
    effectButtonElement.style.setProperty(
      "--effect-radius",
      clampNumber(effectButtonProperties.radius, 0, 50, 50) + "%"
    );
    effectButtonElement.style.setProperty(
      "--effect-glow-color",
      resolveColor(effectButtonProperties.glowColor, "#43c8f0")
    );
    const effectGlowStrength = clampNumber(
      isEffectButtonActive
        ? effectButtonProperties.glowOnStrength
        : effectButtonProperties.glowOffStrength,
      0,
      3,
      isEffectButtonActive ? 1 : 0
    );
    effectButtonElement.style.setProperty("--effect-glow-size", effectGlowStrength * 18 + "px");
    effectButtonElement.style.setProperty(
      "--effect-glow-inset-size",
      effectGlowStrength * 13 + "px"
    );
    effectButtonElement.style.setProperty(
      "--effect-glow-opacity",
      Math.min(100, effectGlowStrength * 38) + "%"
    );
    effectButtonElement.style.setProperty(
      "--effect-glow-inset-opacity",
      Math.min(100, effectGlowStrength * 30) + "%"
    );
    const effectIconSource = resolveIconUrl(effectButtonProperties.icon || "mdi:lightbulb-outline");
    if (effectIconSource) {
      const effectIconElement = document.createElement("i");
      effectIconElement.className = "hb-icon-button-effect-icon";
      effectIconElement.style.transition = "opacity .24s ease";
      effectIconElement.style.opacity = isEffectIconVisible ? "1" : "0";
      effectIconElement.style.backgroundColor = resolveColor(
        isEffectButtonActive
          ? effectButtonProperties.iconOnColor
          : effectButtonProperties.iconOffColor,
        isEffectButtonActive ? "#ffffff" : "#9aa5ad"
      );
      effectIconElement.style.width =
        clampNumber(effectButtonProperties.iconSize, 1, 100, 44) + "%";
      effectIconElement.style.height =
        clampNumber(effectButtonProperties.iconSize, 1, 100, 44) + "%";
      effectIconElement.style.maskImage = 'url("' + effectIconSource + '")';
      effectIconElement.style.webkitMaskImage = 'url("' + effectIconSource + '")';
      effectButtonElement.append(effectIconElement);
    }
    return effectButtonElement;
  }
});
registerComponent("title-button", {
  render(titleComponent, titleContext) {
    const titleProperties = titleComponent.properties || {};
    const isHiddenContentClickable = titleProperties.hiddenContentClickable === true;
    const titleWidth = Math.max(20, Number(titleComponent.position?.width || 500));
    const titleHeight = Math.max(20, Number(titleComponent.position?.height || 122));
    const { height: titleUnitPx } = componentContentUnitsPx(titleComponent, titleContext);
    const titleElement = document.createElement("div");
    titleElement.className = "hb-title-button";
    titleElement.style.setProperty(
      "--title-frame-color",
      resolveColor(titleProperties.frameColor, "#60636a")
    );
    titleElement.style.setProperty(
      "--title-frame-width",
      clampNumber(titleProperties.frameWidth, 0, 12, 1.5) + "px"
    );
    titleElement.style.setProperty(
      "--title-frame-offset-x",
      clampNumber(titleProperties.frameOffsetX, -100, 100, 0) + "%"
    );
    titleElement.style.setProperty(
      "--title-frame-offset-y",
      clampNumber(titleProperties.frameOffsetY, -100, 100, 0) + "%"
    );
    titleElement.style.setProperty(
      "--title-main-size",
      clampNumber(titleProperties.mainSize, 8, 200, 34) * titleUnitPx + "px"
    );
    titleElement.style.setProperty(
      "--title-secondary-size",
      clampNumber(titleProperties.secondarySize, 6, 100, 12) * titleUnitPx + "px"
    );
    titleElement.style.setProperty(
      "--title-main-spacing",
      clampNumber(titleProperties.mainSpacing, -20, 100, 1) * titleUnitPx + "px"
    );
    titleElement.style.setProperty(
      "--title-secondary-spacing",
      clampNumber(titleProperties.secondarySpacing, -20, 100, 2) * titleUnitPx + "px"
    );
    titleElement.style.setProperty(
      "--title-secondary-line-gap",
      clampNumber(titleProperties.secondaryLineGap, 0, 100, 2) * titleUnitPx + "px"
    );
    titleElement.style.setProperty(
      "--title-main-left",
      clampNumber(titleProperties.mainTextLeft, -100, 200, 5.5) + "%"
    );
    titleElement.style.setProperty(
      "--title-main-top",
      clampNumber(titleProperties.mainTextTop, -100, 200, 45) + "%"
    );
    titleElement.style.setProperty(
      "--title-secondary-left",
      clampNumber(titleProperties.secondaryTextLeft, -100, 200, 54) + "%"
    );
    titleElement.style.setProperty(
      "--title-secondary-top",
      clampNumber(titleProperties.secondaryTextTop, -100, 200, 43) + "%"
    );
    titleElement.style.setProperty(
      "--title-icon-size",
      clampNumber(titleProperties.iconSize, 1, 100, 30) * titleUnitPx + "px"
    );
    titleElement.style.setProperty(
      "--title-icon-left",
      clampNumber(titleProperties.iconLeft, -100, 200, 50) + "%"
    );
    titleElement.style.setProperty(
      "--title-icon-top",
      clampNumber(titleProperties.iconTop, -100, 200, 45) + "%"
    );
    titleElement.style.setProperty(
      "--title-marker-left",
      clampNumber(titleProperties.markerLeft, -100, 200, 1.8) + "%"
    );
    titleElement.style.setProperty(
      "--title-marker-top",
      clampNumber(titleProperties.markerTop, -100, 200, 84) + "%"
    );
    if (titleProperties.frameVisible !== false || isHiddenContentClickable) {
      const titleFrameSizeRatio = clampNumber(titleProperties.frameSize, 10, 300, 100) / 100;
      const titleFrameHalfHeight = titleHeight * 0.45 * titleFrameSizeRatio;
      const titleFrameOffsetXPx =
        (titleWidth * clampNumber(titleProperties.frameOffsetX, -100, 100, 0)) / 100;
      const titleFrameOffsetYPx =
        (titleHeight * clampNumber(titleProperties.frameOffsetY, -100, 100, 0)) / 100;
      const titleFrameHalfSpacing =
        (titleWidth * clampNumber(titleProperties.frameSpacing, 0, 300, 100)) / 200;
      const titleFrameCenterX = titleWidth / 2 + titleFrameOffsetXPx;
      const titleFrameCenterY = titleHeight / 2 + titleFrameOffsetYPx;
      const titleFrameTop = titleFrameCenterY - titleFrameHalfHeight / 2;
      const titleFrameBottom = titleFrameCenterY + titleFrameHalfHeight / 2;
      const titleBracketLength = titleHeight * 0.12;
      const titleFrameHalfWidth = clampNumber(titleProperties.frameWidth, 0, 12, 1.5) / 2;
      const titleLeftBracketX = titleFrameCenterX - titleFrameHalfSpacing + titleFrameHalfWidth;
      const titleRightBracketX = titleFrameCenterX + titleFrameHalfSpacing - titleFrameHalfWidth;
      const titleBracketsElement = appendSvgElement(titleElement, "svg", {
        viewBox: "0 0 " + titleWidth + " " + titleHeight,
        preserveAspectRatio: "none",
        "aria-hidden": "true"
      });
      titleBracketsElement.setAttribute("class", "hb-title-button-brackets");
      if (titleProperties.frameVisible === false) {
        titleBracketsElement.style.visibility = "hidden";
      }
      const titleBracketAttributes = {
        fill: "none",
        stroke: resolveColor(titleProperties.frameColor, "#60636a"),
        "stroke-width": clampNumber(titleProperties.frameWidth, 0, 12, 1.5),
        "stroke-opacity": 1,
        "stroke-linecap": "butt",
        "stroke-linejoin": "miter",
        "vector-effect": "non-scaling-stroke"
      };
      appendSvgElement(titleBracketsElement, "path", {
        ...titleBracketAttributes,
        d:
          "M " +
          (titleLeftBracketX + titleBracketLength) +
          " " +
          titleFrameTop +
          " H " +
          titleLeftBracketX +
          " V " +
          titleFrameBottom +
          " H " +
          (titleLeftBracketX + titleBracketLength)
      });
      appendSvgElement(titleBracketsElement, "path", {
        ...titleBracketAttributes,
        d:
          "M " +
          (titleRightBracketX - titleBracketLength) +
          " " +
          titleFrameTop +
          " H " +
          titleRightBracketX +
          " V " +
          titleFrameBottom +
          " H " +
          (titleRightBracketX - titleBracketLength)
      });
    }
    if (titleProperties.mainTextVisible !== false || isHiddenContentClickable) {
      const titleMainTextElement = document.createElement("strong");
      titleMainTextElement.className = "hb-title-button-main";
      titleMainTextElement.textContent = String(titleProperties.mainText || "客厅");
      titleMainTextElement.style.color = resolveColor(titleProperties.mainColor, "#b9bbc0");
      if (titleProperties.mainTextVisible === false) {
        titleMainTextElement.style.visibility = "hidden";
      }
      applyFontWeight(
        titleMainTextElement,
        titleProperties.mainWeight,
        clampNumber(titleProperties.mainSize, 8, 200, 34)
      );
      titleElement.append(titleMainTextElement);
    }
    if (titleProperties.secondaryTextVisible !== false || isHiddenContentClickable) {
      const titleSecondaryTextElement = document.createElement("small");
      titleSecondaryTextElement.className = "hb-title-button-secondary";
      String(titleProperties.secondaryText || "LIVING ROOM\nLIGHTING")
        .split(/\r?\n/)
        .slice(0, 2)
        .forEach(titleTextLine => {
          const titleTextLineElement = document.createElement("span");
          titleTextLineElement.textContent = titleTextLine;
          titleSecondaryTextElement.append(titleTextLineElement);
        });
      titleSecondaryTextElement.style.color = resolveColor(
        titleProperties.secondaryColor,
        "#70737b"
      );
      if (titleProperties.secondaryTextVisible === false) {
        titleSecondaryTextElement.style.visibility = "hidden";
      }
      applyFontWeight(
        titleSecondaryTextElement,
        titleProperties.secondaryWeight,
        clampNumber(titleProperties.secondarySize, 6, 100, 12)
      );
      titleElement.append(titleSecondaryTextElement);
    }
    if (titleProperties.iconVisible !== false || isHiddenContentClickable) {
      const titleIconSource = resolveIconUrl(titleProperties.icon || "");
      if (titleIconSource) {
        const titleIconElement = document.createElement("i");
        titleIconElement.className = "hb-title-button-icon";
        if (titleProperties.iconVisible === false) {
          titleIconElement.style.visibility = "hidden";
        }
        titleIconElement.style.backgroundColor = resolveColor(titleProperties.iconColor, "#b9bbc0");
        titleIconElement.style.maskImage = 'url("' + titleIconSource + '")';
        titleIconElement.style.webkitMaskImage = 'url("' + titleIconSource + '")';
        titleElement.append(titleIconElement);
      }
    }
    if (titleProperties.markerVisible !== false || isHiddenContentClickable) {
      const titleMarkerElement = document.createElement("i");
      titleMarkerElement.className = "hb-title-button-marker";
      if (titleProperties.markerVisible === false) {
        titleMarkerElement.style.visibility = "hidden";
      }
      titleMarkerElement.style.color = resolveColor(titleProperties.markerColor, "#f2a20d");
      titleMarkerElement.style.borderTopColor = resolveColor(
        titleProperties.markerColor,
        "#f2a20d"
      );
      titleMarkerElement.style.setProperty(
        "--title-marker-size",
        clampNumber(titleProperties.markerSize, 2, 60, 10) * titleUnitPx + "px"
      );
      titleElement.append(titleMarkerElement);
    }
    return titleElement;
  }
});
registerComponent("light-statistics", {
  render(statisticsComponent, statisticsContext) {
    const statisticsProperties = statisticsComponent.properties || {};
    const lightSummary = lightStatisticsSummary(
      statisticsProperties.entityIds,
      statisticsContext.states,
      statisticsContext.entityMetadata
    );
    const { width: statisticsWidth, height: statisticsHeight } = componentContentUnitsPx(
      statisticsComponent,
      statisticsContext
    );
    const statisticsElement = document.createElement("div");
    statisticsElement.className = "hb-light-statistics";
    statisticsElement.classList.toggle("active", lightSummary.on > 0);
    statisticsElement.dataset.total = String(lightSummary.total);
    statisticsElement.dataset.on = String(lightSummary.on);
    statisticsElement.dataset.off = String(lightSummary.off);
    statisticsElement.dataset.abnormal = String(lightSummary.abnormal);
    statisticsElement.style.setProperty(
      "--light-statistics-icon-size",
      clampNumber(statisticsProperties.iconSize, 1, 100, 42) * statisticsHeight + "px"
    );
    statisticsElement.style.setProperty(
      "--light-statistics-title-size",
      clampNumber(statisticsProperties.titleSize, 8, 200, 32) * statisticsHeight + "px"
    );
    statisticsElement.style.setProperty(
      "--light-statistics-title-spacing",
      clampNumber(statisticsProperties.titleSpacing, -20, 100, 1.2) * statisticsHeight + "px"
    );
    statisticsElement.style.setProperty(
      "--light-statistics-count-size",
      clampNumber(statisticsProperties.countSize, 8, 200, 34) * statisticsHeight + "px"
    );
    statisticsElement.style.setProperty(
      "--light-statistics-count-spacing",
      clampNumber(statisticsProperties.countSpacing, -20, 100, 0) * statisticsHeight + "px"
    );
    statisticsElement.style.setProperty(
      "--light-statistics-icon-gap",
      clampNumber(statisticsProperties.iconGap, 0, 40, 4.5) * statisticsWidth + "px"
    );
    statisticsElement.style.setProperty(
      "--light-statistics-count-gap",
      clampNumber(statisticsProperties.countGap, 0, 40, 4.5) * statisticsWidth + "px"
    );
    statisticsElement.style.setProperty(
      "--light-statistics-icon-color",
      resolveColor(statisticsProperties.iconColor, "#8b9298")
    );
    statisticsElement.style.setProperty(
      "--light-statistics-icon-active-color",
      resolveColor(statisticsProperties.iconActiveColor, "#f2a20d")
    );
    statisticsElement.style.setProperty(
      "--light-statistics-title-color",
      resolveColor(statisticsProperties.titleColor, "#b9bbc0")
    );
    statisticsElement.style.setProperty(
      "--light-statistics-count-color",
      resolveColor(statisticsProperties.countColor, "#b9bbc0")
    );
    statisticsElement.style.setProperty(
      "--light-statistics-count-active-color",
      resolveColor(statisticsProperties.countActiveColor, "#f2a20d")
    );
    const statisticsIconName = Object.prototype.hasOwnProperty.call(statisticsProperties, "icon")
      ? String(statisticsProperties.icon || "")
      : "mdi:lightbulb-group-outline";
    const statisticsIconSource = resolveIconUrl(statisticsIconName);
    const hasStatisticsIcon = statisticsProperties.iconVisible !== false && !!statisticsIconSource;
    const hasStatisticsTitle = statisticsProperties.titleVisible !== false;
    const hasStatisticsCount = statisticsProperties.countVisible !== false;
    statisticsElement.classList.toggle("has-icon", hasStatisticsIcon);
    statisticsElement.classList.toggle("has-title", hasStatisticsTitle);
    statisticsElement.classList.toggle("has-count", hasStatisticsCount);
    if (hasStatisticsIcon) {
      const statisticsIconElement = document.createElement("i");
      statisticsIconElement.className = "hb-light-statistics-icon";
      statisticsIconElement.style.maskImage = 'url("' + statisticsIconSource + '")';
      statisticsIconElement.style.webkitMaskImage = 'url("' + statisticsIconSource + '")';
      statisticsElement.append(statisticsIconElement);
    }
    if (hasStatisticsTitle) {
      const statisticsTitleElement = document.createElement("strong");
      statisticsTitleElement.className = "hb-light-statistics-title";
      statisticsTitleElement.textContent = String(statisticsProperties.title || "数量");
      applyFontWeight(
        statisticsTitleElement,
        statisticsProperties.titleWeight,
        clampNumber(statisticsProperties.titleSize, 8, 200, 32)
      );
      statisticsElement.append(statisticsTitleElement);
    }
    if (hasStatisticsCount) {
      const statisticsCountElement = document.createElement("span");
      statisticsCountElement.className = "hb-light-statistics-count";
      const statisticsCountValueElement = document.createElement("b");
      statisticsCountValueElement.textContent = lightSummary.total ? String(lightSummary.on) : "--";
      applyFontWeight(
        statisticsCountValueElement,
        statisticsProperties.countWeight,
        clampNumber(statisticsProperties.countSize, 8, 200, 34)
      );
      statisticsCountElement.append(statisticsCountValueElement);
      if (lightSummary.total) {
        const statisticsCountTotalElement = document.createElement("em");
        statisticsCountTotalElement.textContent = " / " + lightSummary.total;
        statisticsCountElement.append(statisticsCountTotalElement);
      }
      statisticsElement.append(statisticsCountElement);
    }
    return statisticsElement;
  }
});
const buttonRenderer = {
  render(deviceButtonComponent, deviceButtonContext) {
    const deviceButtonProperties = deviceButtonComponent.properties || {};
    const isDeviceButton = deviceButtonComponent.type === "device-button";
    const deviceButtonEntityId = deviceButtonComponent.bindings?.entity?.entityId || "";
    const deviceButtonState = deviceButtonContext.states?.get(deviceButtonEntityId);
    const deviceButtonResolvedState = resolveStateEntry(deviceButtonState);
    const isDeviceButtonActive = isDeviceButtonVisualActive(
      deviceButtonComponent,
      deviceButtonContext
    );
    const deviceButtonWidth = Math.max(20, Number(deviceButtonComponent.position?.width || 144));
    const deviceButtonHeight = Math.max(20, Number(deviceButtonComponent.position?.height || 150));
    const { height: deviceButtonUnitPx } = componentContentUnitsPx(
      deviceButtonComponent,
      deviceButtonContext
    );
    const deviceButtonCutCorner =
      (Math.min(deviceButtonWidth, deviceButtonHeight) *
        clampNumber(deviceButtonProperties.cutCorner, 0, 50, 20)) /
      100;
    const deviceButtonFrameWidth = clampNumber(deviceButtonProperties.frameWidth, 0, 12, 1);
    const deviceButtonFrameAngle = clampNumber(deviceButtonProperties.frameAngle, 0, 360, 45);
    const deviceButtonFrameOpacity = clampNumber(
      isDeviceButtonActive
        ? deviceButtonProperties.frameOnOpacity
        : deviceButtonProperties.frameOffOpacity,
      0,
      1,
      isDeviceButtonActive ? 1 : 0.8
    );
    const deviceButtonSoftLightColor = resolveColor(
      deviceButtonProperties.softLightColor,
      "#ffffff"
    );
    const deviceButtonSoftLightStrength = clampNumber(
      deviceButtonProperties.softLightStrength,
      0,
      5,
      1
    );
    const deviceButtonSoftLightSize = clampNumber(deviceButtonProperties.softLightSize, 0, 3, 1);
    const deviceButtonSoftLightAngle = clampNumber(
      deviceButtonProperties.softLightAngle,
      0,
      360,
      45
    );
    const deviceButtonGlowColor = resolveColor(deviceButtonProperties.glowColor, "#ffffff");
    const deviceButtonGlowStrength = clampNumber(deviceButtonProperties.glowStrength, 0, 5, 1);
    const deviceButtonGlowSize = clampNumber(deviceButtonProperties.glowSize, 0, 3, 1);
    const deviceButtonGlowAngle = clampNumber(deviceButtonProperties.glowAngle, 0, 360, 220);
    const deviceButtonCenterX = deviceButtonWidth / 2;
    const deviceButtonCenterY = deviceButtonHeight / 2;
    const deviceButtonGlowAngleRad = (deviceButtonGlowAngle * Math.PI) / 180;
    const deviceButtonGlowX =
      deviceButtonCenterX + Math.cos(deviceButtonGlowAngleRad) * deviceButtonWidth * 0.16;
    const deviceButtonGlowY =
      deviceButtonCenterY + Math.sin(deviceButtonGlowAngleRad) * deviceButtonHeight * 0.18;
    const deviceButtonNamespace =
      (deviceButtonContext.renderNamespace || "renderer") +
      "-icon-button-" +
      String(deviceButtonComponent.id || "").replace(/[^a-z0-9_-]/gi, "");
    const deviceButtonElement = document.createElement("div");
    deviceButtonElement.className = "hb-icon-button" + (isDeviceButtonActive ? " active" : "");
    deviceButtonElement.style.setProperty(
      "--icon-button-main-left",
      clampNumber(deviceButtonProperties.mainTextLeft, -100, 200, 9) + "%"
    );
    deviceButtonElement.style.setProperty(
      "--icon-button-main-top",
      clampNumber(deviceButtonProperties.mainTextTop, -100, 200, 78) + "%"
    );
    deviceButtonElement.style.setProperty(
      "--icon-button-secondary-left",
      clampNumber(deviceButtonProperties.secondaryTextLeft, -100, 200, 9) + "%"
    );
    deviceButtonElement.style.setProperty(
      "--icon-button-secondary-top",
      clampNumber(deviceButtonProperties.secondaryTextTop, -100, 200, 91) + "%"
    );
    deviceButtonElement.style.setProperty(
      "--icon-button-icon-left",
      clampNumber(deviceButtonProperties.iconLeft, -100, 200, 50) + "%"
    );
    deviceButtonElement.style.setProperty(
      "--icon-button-icon-top",
      clampNumber(deviceButtonProperties.iconTop, -100, 200, 34) + "%"
    );
    deviceButtonElement.style.setProperty(
      "--icon-button-icon-glow-size",
      deviceButtonUnitPx * 9 + "px"
    );
    deviceButtonElement.style.setProperty(
      "--device-button-icon-glow-size",
      deviceButtonUnitPx * 5 + "px"
    );
    deviceButtonElement.style.setProperty(
      "--device-button-icon-active-glow-size",
      deviceButtonUnitPx * 7 + "px"
    );
    deviceButtonElement.style.setProperty(
      "--hb-on-fill-fade-duration",
      clampNumber(deviceButtonProperties.onFillFadeDuration, 0, 3, 0.3) + "s"
    );
    if (!isDeviceButton) {
      const deviceButtonFrameSvg = appendSvgElement(deviceButtonElement, "svg", {
        viewBox: "0 0 " + deviceButtonWidth + " " + deviceButtonHeight,
        preserveAspectRatio: "none",
        "aria-hidden": "true"
      });
      const deviceButtonDefsElement = appendSvgElement(deviceButtonFrameSvg, "defs");
      const deviceButtonPolygonPoints =
        "0,0 " +
        (deviceButtonWidth - deviceButtonCutCorner) +
        ",0 " +
        deviceButtonWidth +
        "," +
        deviceButtonCutCorner +
        " " +
        deviceButtonWidth +
        "," +
        deviceButtonHeight +
        " 0," +
        deviceButtonHeight;
      const deviceButtonClipPath = appendSvgElement(deviceButtonDefsElement, "clipPath", {
        id: deviceButtonNamespace + "-clip"
      });
      appendSvgElement(deviceButtonClipPath, "polygon", {
        points: deviceButtonPolygonPoints
      });
      const deviceButtonSoftLightHalfWidth = deviceButtonWidth * 0.5 * deviceButtonSoftLightSize;
      const deviceButtonSoftLightGradient = appendSvgElement(
        deviceButtonDefsElement,
        "linearGradient",
        {
          id: deviceButtonNamespace + "-soft-light",
          gradientUnits: "userSpaceOnUse",
          x1: deviceButtonCenterX - deviceButtonSoftLightHalfWidth,
          y1: deviceButtonCenterY,
          x2: deviceButtonCenterX + deviceButtonSoftLightHalfWidth,
          y2: deviceButtonCenterY,
          gradientTransform:
            "rotate(" +
            deviceButtonSoftLightAngle +
            " " +
            deviceButtonCenterX +
            " " +
            deviceButtonCenterY +
            ")"
        }
      );
      appendSvgElement(deviceButtonSoftLightGradient, "stop", {
        offset: 0,
        "stop-color": deviceButtonSoftLightColor,
        "stop-opacity": Math.min(1, deviceButtonSoftLightStrength * 0.055)
      });
      appendSvgElement(deviceButtonSoftLightGradient, "stop", {
        offset: 0.55,
        "stop-color": deviceButtonSoftLightColor,
        "stop-opacity": Math.min(1, deviceButtonSoftLightStrength * 0.018)
      });
      appendSvgElement(deviceButtonSoftLightGradient, "stop", {
        offset: 1,
        "stop-color": deviceButtonSoftLightColor,
        "stop-opacity": Math.min(1, deviceButtonSoftLightStrength * 0.085)
      });
      const deviceButtonEdgeGradient = appendSvgElement(deviceButtonDefsElement, "linearGradient", {
        id: deviceButtonNamespace + "-edge",
        gradientUnits: "userSpaceOnUse",
        x1: 0,
        y1: deviceButtonCenterY,
        x2: deviceButtonWidth,
        y2: deviceButtonCenterY,
        gradientTransform:
          "rotate(" +
          deviceButtonFrameAngle +
          " " +
          deviceButtonCenterX +
          " " +
          deviceButtonCenterY +
          ")"
      });
      appendSvgElement(deviceButtonEdgeGradient, "stop", {
        offset: 0,
        "stop-color": "#ffffff",
        "stop-opacity": deviceButtonFrameOpacity
      });
      appendSvgElement(deviceButtonEdgeGradient, "stop", {
        offset: 0.48,
        "stop-color": "#ffffff",
        "stop-opacity": deviceButtonFrameOpacity * 0.49
      });
      appendSvgElement(deviceButtonEdgeGradient, "stop", {
        offset: 1,
        "stop-color": "#ffffff",
        "stop-opacity": deviceButtonFrameOpacity * 0.66
      });
      const deviceButtonGlowGradient = appendSvgElement(deviceButtonDefsElement, "radialGradient", {
        id: deviceButtonNamespace + "-glow",
        gradientUnits: "userSpaceOnUse",
        cx: deviceButtonGlowX,
        cy: deviceButtonGlowY,
        r: Math.min(deviceButtonWidth, deviceButtonHeight) * 0.42 * deviceButtonGlowSize
      });
      appendSvgElement(deviceButtonGlowGradient, "stop", {
        offset: 0,
        "stop-color": deviceButtonGlowColor,
        "stop-opacity": Math.min(1, deviceButtonGlowStrength * 0.12)
      });
      appendSvgElement(deviceButtonGlowGradient, "stop", {
        offset: 0.52,
        "stop-color": deviceButtonGlowColor,
        "stop-opacity": Math.min(1, deviceButtonGlowStrength * 0.025)
      });
      appendSvgElement(deviceButtonGlowGradient, "stop", {
        offset: 1,
        "stop-color": deviceButtonGlowColor,
        "stop-opacity": 0
      });
      const deviceButtonGlowFilter = appendSvgElement(deviceButtonDefsElement, "filter", {
        id: deviceButtonNamespace + "-glow-blur",
        x: "-40%",
        y: "-40%",
        width: "180%",
        height: "180%"
      });
      appendSvgElement(deviceButtonGlowFilter, "feGaussianBlur", {
        stdDeviation: Math.min(deviceButtonWidth, deviceButtonHeight) * 0.03
      });
      const deviceButtonClippedGroup = appendSvgElement(deviceButtonFrameSvg, "g", {
        "clip-path": "url(#" + deviceButtonNamespace + "-clip)"
      });
      if (deviceButtonProperties.onFillVisible !== false) {
        appendSvgElement(deviceButtonClippedGroup, "polygon", {
          class: "hb-icon-button-on-fill",
          points: deviceButtonPolygonPoints,
          fill: resolveColor(deviceButtonProperties.onFillColor, "#dfb64f"),
          "fill-opacity": clampNumber(deviceButtonProperties.onFillStrength, 0, 1, 1)
        });
      }
      if (deviceButtonProperties.softLightVisible !== false && deviceButtonSoftLightSize > 0) {
        appendSvgElement(deviceButtonClippedGroup, "polygon", {
          points: deviceButtonPolygonPoints,
          fill: "url(#" + deviceButtonNamespace + "-soft-light)"
        });
      }
      if (deviceButtonProperties.glowVisible !== false && deviceButtonGlowSize > 0) {
        appendSvgElement(deviceButtonClippedGroup, "ellipse", {
          cx: deviceButtonGlowX,
          cy: deviceButtonGlowY,
          rx: deviceButtonWidth * 0.42 * deviceButtonGlowSize,
          ry: deviceButtonHeight * 0.42 * deviceButtonGlowSize,
          fill: "url(#" + deviceButtonNamespace + "-glow)",
          filter: "url(#" + deviceButtonNamespace + "-glow-blur)"
        });
      }
      if (deviceButtonProperties.frameVisible !== false && deviceButtonFrameWidth > 0) {
        appendSvgElement(deviceButtonClippedGroup, "polygon", {
          points: deviceButtonPolygonPoints,
          fill: "none",
          stroke: "url(#" + deviceButtonNamespace + "-edge)",
          "stroke-width": deviceButtonFrameWidth,
          "vector-effect": "non-scaling-stroke"
        });
      }
    }
    const deviceButtonIconName =
      String(deviceButtonProperties.icon || "").trim() ||
      (isDeviceButton
        ? resolveStateIcon(deviceButtonEntityId, deviceButtonState)
        : "mdi:ceiling-light");
    const deviceButtonIconSource = resolveIconUrl(deviceButtonIconName);
    if (
      deviceButtonIconSource &&
      (!isDeviceButton ||
        deviceButtonProperties.iconVisible !== false ||
        deviceButtonProperties.hiddenContentClickable === true)
    ) {
      const deviceButtonIconElement = document.createElement("i");
      deviceButtonIconElement.className = isDeviceButton
        ? "hb-device-button-icon"
        : "hb-icon-button-icon";
      if (!isDeviceButton) {
        deviceButtonIconElement.style.width =
          clampNumber(deviceButtonProperties.iconSize, 1, 100, 42) + "%";
        deviceButtonIconElement.style.height =
          clampNumber(deviceButtonProperties.iconSize, 1, 100, 42) + "%";
      }
      deviceButtonIconElement.style.backgroundColor =
        isDeviceButton && isDeviceButtonActive
          ? resolveColor(deviceButtonProperties.iconOnColor, "#379bff")
          : resolveColor(
              deviceButtonProperties.iconColor ||
                deviceButtonProperties.iconOffColor ||
                deviceButtonProperties.iconOnColor,
              "#d7d8da"
            );
      deviceButtonIconElement.style.opacity = isDeviceButton
        ? "1"
        : String(
            clampNumber(
              isDeviceButtonActive
                ? deviceButtonProperties.iconOnOpacity
                : deviceButtonProperties.iconOffOpacity,
              0,
              1,
              1
            )
          );
      deviceButtonIconElement.style.maskImage = 'url("' + deviceButtonIconSource + '")';
      deviceButtonIconElement.style.webkitMaskImage = 'url("' + deviceButtonIconSource + '")';
      if (isDeviceButton) {
        const deviceButtonIconSize = clampNumber(deviceButtonProperties.iconSize, 1, 100, 28);
        const deviceButtonBadgeSize = clampNumber(
          deviceButtonProperties.badgeSize ?? deviceButtonIconSize,
          1,
          100,
          deviceButtonIconSize
        );
        const deviceButtonSymbolSize = clampNumber(
          deviceButtonProperties.symbolSize ?? deviceButtonIconSize * 0.5,
          1,
          100,
          deviceButtonIconSize * 0.5
        );
        const deviceButtonSymbolPercent = clampNumber(
          (deviceButtonSymbolSize / deviceButtonBadgeSize) * 100,
          1,
          100,
          50
        );
        deviceButtonIconElement.style.width = deviceButtonSymbolPercent + "%";
        deviceButtonIconElement.style.height = deviceButtonSymbolPercent + "%";
        const deviceButtonBadgeElement = document.createElement("span");
        deviceButtonBadgeElement.className =
          "hb-device-button-icon-badge" + (isDeviceButtonActive ? " active" : "");
        if (deviceButtonProperties.iconVisible === false) {
          deviceButtonBadgeElement.style.visibility = "hidden";
        }
        deviceButtonBadgeElement.style.width = deviceButtonBadgeSize * deviceButtonUnitPx + "px";
        deviceButtonBadgeElement.style.height = deviceButtonBadgeSize * deviceButtonUnitPx + "px";
        deviceButtonBadgeElement.style.setProperty(
          "--device-badge-color",
          resolveColor(deviceButtonProperties.badgeColor, "#5b5e66")
        );
        deviceButtonBadgeElement.style.setProperty(
          "--device-badge-opacity",
          clampNumber(deviceButtonProperties.badgeOpacity, 0, 1, 0.58) * 100 + "%"
        );
        deviceButtonBadgeElement.append(deviceButtonIconElement);
        deviceButtonElement.append(deviceButtonBadgeElement);
      } else {
        deviceButtonElement.append(deviceButtonIconElement);
      }
    }
    const deviceButtonTextElement = document.createElement("span");
    deviceButtonTextElement.className = "hb-icon-button-text";
    const deviceButtonMainTextSize = clampNumber(deviceButtonProperties.mainSize, 6, 120, 25);
    const deviceButtonMainTextElement = document.createElement("strong");
    deviceButtonMainTextElement.textContent = isDeviceButton
      ? String(deviceButtonProperties.mainText || "").trim() ||
        String(
          deviceButtonResolvedState?.attributes?.friendly_name ||
            deviceButtonEntityId ||
            "未选择实体"
        )
      : String(deviceButtonProperties.mainText || "主灯");
    deviceButtonMainTextElement.style.color = resolveColor(
      deviceButtonProperties.mainColor ||
        deviceButtonProperties.mainOffColor ||
        deviceButtonProperties.mainOnColor,
      "#c7c8cb"
    );
    deviceButtonMainTextElement.style.opacity = isDeviceButton
      ? "1"
      : String(
          clampNumber(
            isDeviceButtonActive
              ? deviceButtonProperties.mainOnOpacity
              : deviceButtonProperties.mainOffOpacity,
            0,
            1,
            1
          )
        );
    deviceButtonMainTextElement.style.fontSize =
      deviceButtonMainTextSize * deviceButtonUnitPx + "px";
    deviceButtonMainTextElement.style.letterSpacing =
      clampNumber(deviceButtonProperties.mainSpacing, -20, 100, 1) * deviceButtonUnitPx + "px";
    applyFontWeight(
      deviceButtonMainTextElement,
      deviceButtonProperties.mainWeight,
      deviceButtonMainTextSize
    );
    deviceButtonMainTextElement.hidden =
      isDeviceButton &&
      deviceButtonProperties.mainTextVisible === false &&
      deviceButtonProperties.hiddenContentClickable !== true;
    if (
      isDeviceButton &&
      deviceButtonProperties.mainTextVisible === false &&
      deviceButtonProperties.hiddenContentClickable === true
    ) {
      deviceButtonMainTextElement.style.visibility = "hidden";
    }
    const deviceButtonSecondaryTextSize = clampNumber(
      deviceButtonProperties.secondarySize,
      5,
      80,
      10
    );
    const deviceButtonSecondaryTextElement = document.createElement("small");
    deviceButtonSecondaryTextElement.textContent = isDeviceButton
      ? String(deviceButtonProperties.secondaryText || "").trim() ||
        (deviceButtonEntityId
          ? formatEntityState(deviceButtonState, deviceButtonEntityId, {
              ...deviceButtonContext,
              component: deviceButtonComponent
            })
          : "未选择实体")
      : String(deviceButtonProperties.secondaryText || "MAIN LIGHT");
    deviceButtonSecondaryTextElement.style.color = resolveColor(
      deviceButtonProperties.secondaryColor ||
        deviceButtonProperties.secondaryOffColor ||
        deviceButtonProperties.secondaryOnColor,
      "#75777d"
    );
    deviceButtonSecondaryTextElement.style.opacity = isDeviceButton
      ? "1"
      : String(
          clampNumber(
            isDeviceButtonActive
              ? deviceButtonProperties.secondaryOnOpacity
              : deviceButtonProperties.secondaryOffOpacity,
            0,
            1,
            1
          )
        );
    deviceButtonSecondaryTextElement.style.fontSize =
      deviceButtonSecondaryTextSize * deviceButtonUnitPx + "px";
    deviceButtonSecondaryTextElement.style.letterSpacing =
      clampNumber(deviceButtonProperties.secondarySpacing, -20, 100, 0.7) * deviceButtonUnitPx +
      "px";
    applyFontWeight(
      deviceButtonSecondaryTextElement,
      deviceButtonProperties.secondaryWeight,
      deviceButtonSecondaryTextSize
    );
    deviceButtonSecondaryTextElement.hidden =
      isDeviceButton &&
      deviceButtonProperties.secondaryTextVisible === false &&
      deviceButtonProperties.hiddenContentClickable !== true;
    if (
      isDeviceButton &&
      deviceButtonProperties.secondaryTextVisible === false &&
      deviceButtonProperties.hiddenContentClickable === true
    ) {
      deviceButtonSecondaryTextElement.style.visibility = "hidden";
    }
    deviceButtonTextElement.append(deviceButtonMainTextElement, deviceButtonSecondaryTextElement);
    deviceButtonElement.append(deviceButtonTextElement);
    return deviceButtonElement;
  }
};
registerComponent("icon-button", buttonRenderer);
registerComponent("device-button", buttonRenderer);
function renderDoorWindowSensor(
  sensorComponent,
  sensorProperties,
  sensorPresentation,
  sensorContext
) {
  const sensorAccentColor = resolveColor(
    sensorProperties.iconOnColor || sensorProperties.occupiedColor,
    "#ffffff"
  );
  const isSensorOccupied = sensorPresentation.key === "occupied";
  const sensorStateLabel = isSensorOccupied
    ? "打开"
    : sensorPresentation.key === "clear"
      ? "关闭"
      : sensorPresentation.key === "unavailable"
        ? "离线"
        : "未知";
  const sensorElement = document.createElement("div");
  sensorElement.className =
    "hb-door-window-sensor is-" + (isSensorOccupied ? "open" : sensorPresentation.key);
  sensorElement.dataset.sensorState = isSensorOccupied ? "open" : sensorPresentation.key;
  sensorElement.style.setProperty("--hb-door-window-accent", sensorAccentColor);
  sensorElement.setAttribute("role", "img");
  sensorElement.setAttribute("aria-label", "门窗传感器：" + sensorStateLabel);
  const sensorVisualElement = document.createElement("div");
  sensorVisualElement.className = "hb-door-window-visual";
  const sensorComponentScale = Math.max(
    0.01,
    Number(sensorContext.document?.canvas?.componentScale || 1)
  );
  const sensorWidth = Math.max(
    1,
    Number(sensorComponent.position?.width || 100) / sensorComponentScale
  );
  const sensorHeight = Math.max(
    1,
    Number(sensorComponent.position?.height || 100) / sensorComponentScale
  );
  sensorVisualElement.style.transform = doorWindowPerspectiveMatrix(
    sensorWidth,
    sensorHeight,
    sensorProperties.perspectiveCorners
  );
  const sensorFrameElement = document.createElement("span");
  sensorFrameElement.className = "hb-door-window-frame";
  const sensorLeftPanelElement = document.createElement("span");
  sensorLeftPanelElement.className = "hb-door-window-panel left";
  const sensorRightPanelElement = document.createElement("span");
  sensorRightPanelElement.className = "hb-door-window-panel right";
  sensorLeftPanelElement.append(document.createElement("i"));
  sensorRightPanelElement.append(document.createElement("i"));
  sensorFrameElement.append(sensorLeftPanelElement, sensorRightPanelElement);
  const sensorAirflowElement = document.createElement("span");
  sensorAirflowElement.className = "hb-door-window-airflow";
  for (let airflowSlatIndex = 0; airflowSlatIndex < 3; airflowSlatIndex += 1) {
    sensorAirflowElement.append(document.createElement("i"));
  }
  sensorVisualElement.append(sensorFrameElement, sensorAirflowElement);
  sensorElement.append(sensorVisualElement);
  return sensorElement;
}
function renderWaterLeakSensor(waterLeakProperties, waterLeakPresentation) {
  const waterLeakAccentColor = resolveColor(waterLeakProperties.waterLeakColor, "#42c8ff");
  const isWaterLeakOccupied = waterLeakPresentation.key === "occupied";
  const waterLeakStateLabel = isWaterLeakOccupied
    ? "检测到水浸"
    : waterLeakPresentation.key === "clear"
      ? "正常"
      : waterLeakPresentation.key === "unavailable"
        ? "离线"
        : "未知";
  const waterLeakElement = document.createElement("div");
  waterLeakElement.className =
    "hb-water-leak-sensor is-" + (isWaterLeakOccupied ? "wet" : waterLeakPresentation.key);
  waterLeakElement.dataset.sensorState = isWaterLeakOccupied ? "wet" : waterLeakPresentation.key;
  waterLeakElement.style.setProperty("--hb-water-leak-accent", waterLeakAccentColor);
  waterLeakElement.setAttribute("role", "img");
  waterLeakElement.setAttribute("aria-label", "水浸传感器：" + waterLeakStateLabel);
  const waterLeakVisualElement = document.createElement("div");
  waterLeakVisualElement.className = "hb-water-leak-visual";
  const waterLeakPuddleElement = document.createElement("span");
  waterLeakPuddleElement.className = "hb-water-leak-puddle";
  const waterLeakRipplesElement = document.createElement("span");
  waterLeakRipplesElement.className = "hb-water-leak-ripples";
  for (let rippleIndex = 0; rippleIndex < 3; rippleIndex += 1) {
    waterLeakRipplesElement.append(document.createElement("i"));
  }
  const SVG_NAMESPACE_URI = "http://www.w3.org/2000/svg";
  const waterLeakDropletElement = document.createElementNS(SVG_NAMESPACE_URI, "svg");
  waterLeakDropletElement.setAttribute("class", "hb-water-leak-droplet");
  waterLeakDropletElement.setAttribute("viewBox", "0 0 48 64");
  waterLeakDropletElement.setAttribute("aria-hidden", "true");
  const dropletBodyElement = document.createElementNS(SVG_NAMESPACE_URI, "path");
  dropletBodyElement.setAttribute("class", "body");
  dropletBodyElement.setAttribute(
    "d",
    "M24 3C20 10 6 27 6 40c0 11 8 20 18 20s18-9 18-20C42 27 28 10 24 3Z"
  );
  const dropletHighlightElement = document.createElementNS(SVG_NAMESPACE_URI, "path");
  dropletHighlightElement.setAttribute("class", "highlight");
  dropletHighlightElement.setAttribute("d", "M15 40c0-6 3-12 8-18");
  waterLeakDropletElement.append(dropletBodyElement, dropletHighlightElement);
  waterLeakVisualElement.append(
    waterLeakPuddleElement,
    waterLeakRipplesElement,
    waterLeakDropletElement
  );
  waterLeakElement.append(waterLeakVisualElement);
  return waterLeakElement;
}
function renderSmokeSensor(smokeProperties, smokePresentation) {
  const smokeAccentColor = resolveColor(smokeProperties.smokeColor, "#ffffff");
  const isSmokeOccupied = smokePresentation.key === "occupied";
  const smokeStateLabel = isSmokeOccupied
    ? "检测到烟雾"
    : smokePresentation.key === "clear"
      ? "正常"
      : smokePresentation.key === "unavailable"
        ? "离线"
        : "未知";
  const smokeElement = document.createElement("div");
  smokeElement.className =
    "hb-smoke-sensor is-" + (isSmokeOccupied ? "alert" : smokePresentation.key);
  smokeElement.dataset.sensorState = isSmokeOccupied ? "alert" : smokePresentation.key;
  smokeElement.style.setProperty("--hb-smoke-accent", smokeAccentColor);
  smokeElement.setAttribute("role", "img");
  smokeElement.setAttribute("aria-label", "烟雾传感器：" + smokeStateLabel);
  const smokeVisualElement = document.createElement("span");
  smokeVisualElement.className = "hb-smoke-visual";
  const smokeGroundElement = document.createElement("span");
  smokeGroundElement.className = "hb-smoke-ground";
  const SMOKE_SVG_NAMESPACE_URI = "http://www.w3.org/2000/svg";
  const smokeWispsElement = document.createElementNS(SMOKE_SVG_NAMESPACE_URI, "svg");
  smokeWispsElement.setAttribute("class", "hb-smoke-wisps");
  smokeWispsElement.setAttribute("viewBox", "0 0 100 100");
  smokeWispsElement.setAttribute("aria-hidden", "true");
  for (const smokeWispPath of [
    "M27 94C12 76 41 67 27 49C13 32 38 22 30 7",
    "M50 97C34 79 65 69 49 50C35 33 61 21 52 3",
    "M73 93C60 77 86 66 72 48C59 32 83 22 75 8"
  ]) {
    const smokeWispElement = document.createElementNS(SMOKE_SVG_NAMESPACE_URI, "path");
    smokeWispElement.setAttribute("d", smokeWispPath);
    smokeWispsElement.append(smokeWispElement);
  }
  smokeVisualElement.append(smokeGroundElement, smokeWispsElement);
  smokeElement.append(smokeVisualElement);
  return smokeElement;
}
function renderGasSensor(gasProperties, gasPresentation) {
  const gasAccentColor = resolveColor(gasProperties.naturalGasColor, "#ffb347");
  const isGasOccupied = gasPresentation.key === "occupied";
  const gasStateLabel = isGasOccupied
    ? "检测到天然气"
    : gasPresentation.key === "clear"
      ? "正常"
      : gasPresentation.key === "unavailable"
        ? "离线"
        : "未知";
  const gasElement = document.createElement("div");
  gasElement.className =
    "hb-natural-gas-sensor is-" + (isGasOccupied ? "alert" : gasPresentation.key);
  gasElement.dataset.sensorState = isGasOccupied ? "alert" : gasPresentation.key;
  gasElement.style.setProperty("--hb-natural-gas-accent", gasAccentColor);
  gasElement.setAttribute("role", "img");
  gasElement.setAttribute("aria-label", "天然气传感器：" + gasStateLabel);
  const gasVisualElement = document.createElement("span");
  gasVisualElement.className = "hb-natural-gas-visual";
  const gasHazeElement = document.createElement("span");
  gasHazeElement.className = "hb-natural-gas-haze";
  const GAS_SVG_NAMESPACE_URI = "http://www.w3.org/2000/svg";
  const gasCurrentsElement = document.createElementNS(GAS_SVG_NAMESPACE_URI, "svg");
  gasCurrentsElement.setAttribute("class", "hb-natural-gas-currents");
  gasCurrentsElement.setAttribute("viewBox", "0 0 120 80");
  gasCurrentsElement.setAttribute("aria-hidden", "true");
  for (const gasCurrentPath of [
    "M3 19C23 5 38 32 58 18C78 4 94 29 117 13",
    "M0 40C20 26 35 53 55 39C76 24 94 54 120 35",
    "M5 62C26 47 42 74 64 58C85 43 101 67 117 54"
  ]) {
    const gasCurrentElement = document.createElementNS(GAS_SVG_NAMESPACE_URI, "path");
    gasCurrentElement.setAttribute("d", gasCurrentPath);
    gasCurrentsElement.append(gasCurrentElement);
  }
  gasVisualElement.append(gasHazeElement, gasCurrentsElement);
  gasElement.append(gasVisualElement);
  return gasElement;
}
registerComponent("presence-sensor", {
  render(presenceComponent, presenceContext) {
    const presenceProperties = presenceComponent.properties || {};
    const presenceEntityId = presenceComponent.bindings?.entity?.entityId || "";
    const presenceState = presenceContext.states?.get(presenceEntityId);
    const motionEventConfig = presenceMotionEventConfig(
      presenceEntityId,
      presenceState,
      presenceContext.entityMetadata,
      presenceContext.states,
      presenceProperties
    );
    const sensorPresentationData = presenceSensorPresentation(
      presenceState,
      presenceContext.editable ? presenceContext.previewState : "auto",
      motionEventConfig
    );
    if (presenceProperties.sensorKind === "door-window") {
      return renderDoorWindowSensor(
        presenceComponent,
        presenceProperties,
        sensorPresentationData,
        presenceContext
      );
    }
    if (presenceProperties.sensorKind === "water-leak") {
      return renderWaterLeakSensor(presenceProperties, sensorPresentationData);
    }
    if (presenceProperties.sensorKind === "smoke") {
      return renderSmokeSensor(presenceProperties, sensorPresentationData);
    }
    if (presenceProperties.sensorKind === "natural-gas") {
      return renderGasSensor(presenceProperties, sensorPresentationData);
    }
    const presenceAccentColor = resolveColor(
      presenceProperties.iconOnColor || presenceProperties.occupiedColor,
      "#ffffff"
    );
    const presenceIdleColor = resolveColor(
      presenceProperties.iconColor || presenceProperties.clearColor,
      "#758189"
    );
    const presenceUnit = componentContentUnitsPx(presenceComponent, presenceContext);
    const presenceElement = document.createElement("div");
    presenceElement.className = "hb-presence-sensor is-" + sensorPresentationData.key;
    presenceElement.classList.toggle("is-halo-hidden", presenceProperties.haloVisible === false);
    presenceElement.classList.toggle(
      "is-person-hidden",
      presenceProperties.personVisible === false
    );
    presenceElement.dataset.presenceState = sensorPresentationData.key;
    presenceElement.style.setProperty("--hb-presence-occupied", presenceAccentColor);
    presenceElement.style.setProperty("--hb-presence-clear", presenceIdleColor);
    const animationStrength = clampNumber(presenceProperties.animationStrength, 0, 1, 0.72);
    const haloScale = clampNumber(presenceProperties.haloScale, 0.2, 3, 1);
    const haloScaleX = clampNumber(presenceProperties.haloScaleX, 0.2, 3, haloScale);
    const haloScaleY = clampNumber(presenceProperties.haloScaleY, 0.2, 3, haloScale);
    const haloRotation = clampNumber(presenceProperties.haloRotation, -360, 360, 0);
    const haloOpacity = clampNumber(presenceProperties.haloOpacity, 0, 1, 1);
    const personScale = clampNumber(presenceProperties.personScale, 0.2, 3, 1);
    const personRotation = clampNumber(presenceProperties.personRotation, -360, 360, 0);
    const personOpacity = clampNumber(presenceProperties.personOpacity, 0, 1, 1);
    const orbitDuration = clampNumber(presenceProperties.orbitDuration, 2, 60, 8);
    presenceElement.style.setProperty("--hb-presence-motion", String(animationStrength));
    const waveDuration = Number((3.2 - animationStrength * 0.8).toFixed(2));
    presenceElement.style.setProperty("--hb-presence-wave-duration", waveDuration + "s");
    presenceElement.style.setProperty("--hb-presence-halo-scale-x", String(haloScaleX));
    presenceElement.style.setProperty("--hb-presence-halo-scale-y", String(haloScaleY));
    presenceElement.style.setProperty("--hb-presence-halo-rotation", haloRotation + "deg");
    presenceElement.style.setProperty("--hb-presence-halo-opacity", String(haloOpacity));
    presenceElement.style.setProperty("--hb-presence-person-scale", String(personScale));
    presenceElement.style.setProperty("--hb-presence-person-rotation", personRotation + "deg");
    presenceElement.style.setProperty("--hb-presence-person-opacity", String(personOpacity));
    presenceElement.style.setProperty("--hb-presence-orbit-duration", orbitDuration + "s");
    if (sensorPresentationData.key === "occupied") {
      const presencePhase = presenceAnimationPhase(presenceState, {
        orbit: orbitDuration,
        wave: waveDuration
      });
      presenceElement.style.setProperty("--hb-presence-orbit-delay", presencePhase.orbitDelay);
      presenceElement.style.setProperty("--hb-presence-wave-delay", presencePhase.waveDelay);
      presenceElement.style.setProperty("--hb-presence-floor-delay", presencePhase.floorDelay);
      presenceElement.style.setProperty("--hb-presence-step-delay", presencePhase.stepDelay);
    }
    const orbitOffsetX = haloScaleX * 32 * presenceUnit.width;
    const orbitOffsetY = haloScaleY * 13 * presenceUnit.height;
    presenceElement.style.setProperty("--hb-presence-orbit-x", orbitOffsetX.toFixed(4) + "px");
    presenceElement.style.setProperty(
      "--hb-presence-orbit-x-negative",
      (-orbitOffsetX).toFixed(4) + "px"
    );
    presenceElement.style.setProperty("--hb-presence-orbit-y", orbitOffsetY.toFixed(4) + "px");
    presenceElement.style.setProperty(
      "--hb-presence-orbit-y-negative",
      (-orbitOffsetY).toFixed(4) + "px"
    );
    presenceElement.style.setProperty(
      "--hb-presence-orbit-x-diagonal",
      (orbitOffsetX * 0.707).toFixed(4) + "px"
    );
    presenceElement.style.setProperty(
      "--hb-presence-orbit-x-diagonal-negative",
      (-orbitOffsetX * 0.707).toFixed(4) + "px"
    );
    presenceElement.style.setProperty(
      "--hb-presence-orbit-y-diagonal",
      (orbitOffsetY * 0.707).toFixed(4) + "px"
    );
    presenceElement.style.setProperty(
      "--hb-presence-orbit-y-diagonal-negative",
      (-orbitOffsetY * 0.707).toFixed(4) + "px"
    );
    presenceElement.style.setProperty(
      "--hb-presence-orbit-x-shallow",
      (orbitOffsetX * 0.382683).toFixed(4) + "px"
    );
    presenceElement.style.setProperty(
      "--hb-presence-orbit-x-shallow-negative",
      (-orbitOffsetX * 0.382683).toFixed(4) + "px"
    );
    presenceElement.style.setProperty(
      "--hb-presence-orbit-x-steep",
      (orbitOffsetX * 0.92388).toFixed(4) + "px"
    );
    presenceElement.style.setProperty(
      "--hb-presence-orbit-x-steep-negative",
      (-orbitOffsetX * 0.92388).toFixed(4) + "px"
    );
    presenceElement.style.setProperty(
      "--hb-presence-orbit-y-shallow",
      (orbitOffsetY * 0.382683).toFixed(4) + "px"
    );
    presenceElement.style.setProperty(
      "--hb-presence-orbit-y-shallow-negative",
      (-orbitOffsetY * 0.382683).toFixed(4) + "px"
    );
    presenceElement.style.setProperty(
      "--hb-presence-orbit-y-steep",
      (orbitOffsetY * 0.92388).toFixed(4) + "px"
    );
    presenceElement.style.setProperty(
      "--hb-presence-orbit-y-steep-negative",
      (-orbitOffsetY * 0.92388).toFixed(4) + "px"
    );
    presenceElement.style.setProperty("--hb-presence-person-width", presenceUnit.width * 22 + "px");
    presenceElement.style.setProperty(
      "--hb-presence-person-height",
      presenceUnit.height * 62 + "px"
    );
    presenceElement.style.setProperty("--hb-presence-copy-gap", presenceUnit.height * 7 + "px");
    presenceElement.style.setProperty(
      "--hb-presence-copy-main-size",
      presenceUnit.height * 20 + "px"
    );
    presenceElement.style.setProperty(
      "--hb-presence-copy-secondary-size",
      presenceUnit.height * 10 + "px"
    );
    presenceElement.setAttribute("role", "img");
    presenceElement.setAttribute("aria-label", "人在传感器：" + sensorPresentationData.label);
    const presenceVisualElement = document.createElement("div");
    presenceVisualElement.className = "hb-presence-sensor-visual";
    const presenceHaloElement = document.createElement("span");
    presenceHaloElement.className = "hb-presence-sensor-halo";
    const presenceSpaceElement = document.createElement("span");
    presenceSpaceElement.className = "hb-presence-sensor-space";
    for (let haloSpanIndex = 0; haloSpanIndex < 3; haloSpanIndex += 1) {
      presenceSpaceElement.append(document.createElement("i"));
    }
    const presencePersonElement = document.createElement("span");
    presencePersonElement.className = "hb-presence-sensor-person";
    const personHeadElement = document.createElement("i");
    const personBodyElement = document.createElement("b");
    const personLeftArmElement = document.createElement("span");
    personLeftArmElement.className = "arm left";
    const personRightArmElement = document.createElement("span");
    personRightArmElement.className = "arm right";
    const personLeftLegElement = document.createElement("span");
    personLeftLegElement.className = "leg left";
    const personRightLegElement = document.createElement("span");
    personRightLegElement.className = "leg right";
    presencePersonElement.append(
      personHeadElement,
      personBodyElement,
      personLeftArmElement,
      personRightArmElement,
      personLeftLegElement,
      personRightLegElement
    );
    const presenceFloorElement = document.createElement("span");
    presenceFloorElement.className = "hb-presence-sensor-floor";
    presenceHaloElement.append(presenceSpaceElement, presenceFloorElement);
    const presenceOrbitElement = document.createElement("span");
    presenceOrbitElement.className = "hb-presence-sensor-orbit";
    const presenceTravelerElement = document.createElement("span");
    presenceTravelerElement.className = "hb-presence-sensor-traveler";
    presenceTravelerElement.append(presencePersonElement);
    presenceOrbitElement.append(presenceTravelerElement);
    presenceVisualElement.append(presenceHaloElement, presenceOrbitElement);
    presenceElement.append(presenceVisualElement);
    if (
      !presenceContext.editable &&
      motionEventConfig.motionEvent &&
      sensorPresentationData.key === "occupied"
    ) {
      const presenceTimestamp = presenceStateTimestamp(presenceState);
      const motionRemainingMs = Number.isFinite(presenceTimestamp)
        ? motionEventConfig.motionTimeoutSeconds * 1000 - (Date.now() - presenceTimestamp)
        : 0;
      if (motionRemainingMs > 0) {
        const motionTimeoutId = window.setTimeout(
          () => presenceContext.invalidate?.(),
          motionRemainingMs + 80
        );
        presenceContext.cleanup(() => window.clearTimeout(motionTimeoutId));
      }
    }
    return presenceElement;
  }
});
registerComponent("air-conditioner", {
  render(airConditionerComponent, airConditionerContext) {
    const airConditionerProperties = airConditionerComponent.properties || {};
    const airConditionerEntityId = airConditionerComponent.bindings?.entity?.entityId || "";
    const airConditionerState = resolveStateEntry(
      airConditionerContext.states?.get(airConditionerEntityId)
    );
    const airConditionerDeviceType = resolveClimateDeviceType(
      airConditionerComponent,
      airConditionerState,
      airConditionerEntityId
    );
    const isAirConditionerActive = isClimateDeviceActive(
      airConditionerComponent,
      airConditionerContext
    );
    const { height: airConditionerUnitPx } = componentContentUnitsPx(
      airConditionerComponent,
      airConditionerContext
    );
    const airConditionerElement = document.createElement("div");
    airConditionerElement.className =
      "hb-air-conditioner" + (isAirConditionerActive ? " active" : "");
    airConditionerElement.style.setProperty(
      "--climate-icon-left",
      clampNumber(airConditionerProperties.iconLeft, -100, 200, 20) + "%"
    );
    airConditionerElement.style.setProperty(
      "--climate-icon-top",
      clampNumber(airConditionerProperties.iconTop, -100, 200, 50) + "%"
    );
    airConditionerElement.style.setProperty(
      "--climate-main-left",
      clampNumber(airConditionerProperties.mainTextLeft, -100, 200, 39) + "%"
    );
    airConditionerElement.style.setProperty(
      "--climate-main-top",
      clampNumber(airConditionerProperties.mainTextTop, -100, 200, 40) + "%"
    );
    airConditionerElement.style.setProperty(
      "--climate-secondary-left",
      clampNumber(airConditionerProperties.secondaryTextLeft, -100, 200, 39) + "%"
    );
    airConditionerElement.style.setProperty(
      "--climate-secondary-top",
      clampNumber(airConditionerProperties.secondaryTextTop, -100, 200, 67) + "%"
    );
    airConditionerElement.style.setProperty(
      "--climate-badge-color",
      resolveColor(airConditionerProperties.badgeColor, "#5b5e66")
    );
    airConditionerElement.style.setProperty(
      "--climate-badge-opacity",
      clampNumber(airConditionerProperties.badgeOpacity, 0, 1, 0.58) * 100 + "%"
    );
    const airConditionerIconColor = resolveColor(
      isAirConditionerActive
        ? airConditionerProperties.iconOnColor
        : airConditionerProperties.iconOffColor,
      isAirConditionerActive ? "#73c8ff" : "#9aa5ad"
    );
    airConditionerElement.style.setProperty("--climate-icon-color", airConditionerIconColor);
    airConditionerElement.style.setProperty(
      "--climate-icon-glow-size",
      airConditionerUnitPx * 7 + "px"
    );
    const airConditionerBadgeSize = clampNumber(airConditionerProperties.badgeSize, 1, 100, 28);
    const airConditionerSymbolSize = clampNumber(airConditionerProperties.symbolSize, 1, 100, 14);
    if (airConditionerProperties.iconVisible !== false) {
      const airConditionerBadgeElement = document.createElement("span");
      airConditionerBadgeElement.className = "hb-air-conditioner-icon-badge";
      airConditionerBadgeElement.style.width =
        airConditionerBadgeSize * airConditionerUnitPx + "px";
      airConditionerBadgeElement.style.height =
        airConditionerBadgeSize * airConditionerUnitPx + "px";
      const airConditionerIconName = String(airConditionerProperties.icon || "");
      const airConditionerResolvedIconName =
        airConditionerDeviceType === "bath-heater" &&
        (!airConditionerIconName || airConditionerIconName === "mdi:air-conditioner")
          ? climateDefaultIcon(airConditionerDeviceType)
          : airConditionerIconName || climateDefaultIcon(airConditionerDeviceType);
      const airConditionerIconSource = resolveIconUrl(airConditionerResolvedIconName);
      if (airConditionerIconSource) {
        const airConditionerIconElement = document.createElement("i");
        airConditionerIconElement.className = "hb-air-conditioner-icon";
        const airConditionerSymbolPercent = clampNumber(
          (airConditionerSymbolSize / airConditionerBadgeSize) * 100,
          1,
          100,
          50
        );
        airConditionerIconElement.style.width = airConditionerSymbolPercent + "%";
        airConditionerIconElement.style.height = airConditionerSymbolPercent + "%";
        airConditionerIconElement.style.backgroundColor = airConditionerIconColor;
        airConditionerIconElement.style.maskImage = 'url("' + airConditionerIconSource + '")';
        airConditionerIconElement.style.webkitMaskImage = 'url("' + airConditionerIconSource + '")';
        airConditionerBadgeElement.append(airConditionerIconElement);
      }
      airConditionerElement.append(airConditionerBadgeElement);
    }
    const airConditionerTextElement = document.createElement("span");
    airConditionerTextElement.className = "hb-air-conditioner-text";
    const airConditionerMainTextSize = clampNumber(airConditionerProperties.mainSize, 6, 120, 21);
    const airConditionerMainTextElement = document.createElement("strong");
    airConditionerMainTextElement.textContent =
      String(airConditionerProperties.mainText || "").trim() ||
      String(
        airConditionerState?.attributes?.friendly_name ||
          airConditionerEntityId ||
          (airConditionerDeviceType === "bath-heater" ? "未选择浴霸实体" : "未选择空调实体")
      );
    airConditionerMainTextElement.style.color = resolveColor(
      airConditionerProperties.mainColor,
      "#c7c8cb"
    );
    airConditionerMainTextElement.style.fontSize =
      airConditionerMainTextSize * airConditionerUnitPx + "px";
    airConditionerMainTextElement.style.letterSpacing =
      clampNumber(airConditionerProperties.mainSpacing, -20, 100, 0.5) * airConditionerUnitPx +
      "px";
    applyFontWeight(
      airConditionerMainTextElement,
      airConditionerProperties.mainWeight,
      airConditionerMainTextSize
    );
    const airConditionerSecondaryTextSize = clampNumber(
      airConditionerProperties.secondarySize,
      5,
      80,
      12
    );
    const airConditionerSecondaryTextElement = document.createElement("small");
    airConditionerSecondaryTextElement.textContent = airConditionerEntityId
      ? resolveClimateLabel(airConditionerComponent, airConditionerContext)
      : "未选择实体";
    airConditionerSecondaryTextElement.style.color = resolveColor(
      airConditionerProperties.secondaryColor,
      "#75777d"
    );
    airConditionerSecondaryTextElement.style.fontSize =
      airConditionerSecondaryTextSize * airConditionerUnitPx + "px";
    airConditionerSecondaryTextElement.style.letterSpacing =
      clampNumber(airConditionerProperties.secondarySpacing, -20, 100, 0.3) * airConditionerUnitPx +
      "px";
    applyFontWeight(
      airConditionerSecondaryTextElement,
      airConditionerProperties.secondaryWeight,
      airConditionerSecondaryTextSize
    );
    if (airConditionerProperties.mainTextVisible !== false) {
      airConditionerTextElement.append(airConditionerMainTextElement);
    }
    if (airConditionerProperties.secondaryTextVisible !== false) {
      airConditionerTextElement.append(airConditionerSecondaryTextElement);
    }
    if (airConditionerTextElement.childElementCount) {
      airConditionerElement.append(airConditionerTextElement);
    }
    return airConditionerElement;
  }
});
export function cameraRadiusRatio(radiusValue, fallbackRadiusRatio = 0.04) {
  const parsedRadius = Number(radiusValue);
  if (Number.isFinite(parsedRadius)) {
    return clampNumber(
      parsedRadius > 0.5 ? parsedRadius / 100 : parsedRadius,
      0,
      0.5,
      fallbackRadiusRatio
    );
  } else {
    return fallbackRadiusRatio;
  }
}
export function appendCameraFrame(
  frameContainerElement,
  frameComponent,
  frameProperties = {},
  frameNamespace = "renderer"
) {
  if (!frameContainerElement || frameProperties.frameVisible === false) {
    return null;
  }
  const cameraFrameWidth = Math.max(
    20,
    Number(frameComponent?.position?.width || frameContainerElement.clientWidth || 320)
  );
  const cameraFrameHeight = Math.max(
    20,
    Number(frameComponent?.position?.height || frameContainerElement.clientHeight || 180)
  );
  const cameraFrameBorderWidth = clampNumber(frameProperties.frameWidth, 0, 20, 1);
  if (cameraFrameBorderWidth <= 0) {
    return null;
  }
  const cameraFrameInset = Math.max(0.5, cameraFrameBorderWidth / 2 + 0.5);
  const cameraFrameInnerWidth = Math.max(1, cameraFrameWidth - cameraFrameInset * 2);
  const cameraFrameInnerHeight = Math.max(1, cameraFrameHeight - cameraFrameInset * 2);
  const cameraFrameRadiusRatio = cameraRadiusRatio(frameProperties.radius);
  const cameraFrameCornerRadius =
    Math.min(cameraFrameInnerWidth, cameraFrameInnerHeight) * cameraFrameRadiusRatio;
  const cameraFrameOpacity = clampNumber(frameProperties.frameOpacity, 0, 1, 0.9);
  const cameraFrameColor = resolveColor(frameProperties.frameColor, "#d4d4d4");
  const cameraFrameId =
    frameNamespace +
    "-camera-frame-" +
    String(frameComponent?.id || "").replace(/[^a-z0-9_-]/gi, "");
  const cameraFrameSvg = appendSvgElement(frameContainerElement, "svg", {
    class: "hb-camera-frame",
    viewBox: "0 0 " + cameraFrameWidth + " " + cameraFrameHeight,
    preserveAspectRatio: "none",
    "aria-hidden": "true"
  });
  const cameraFrameDefs = appendSvgElement(cameraFrameSvg, "defs");
  const cameraFrameEdgeGradient = appendSvgElement(cameraFrameDefs, "linearGradient", {
    id: cameraFrameId + "-edge",
    gradientUnits: "userSpaceOnUse",
    x1: 0,
    y1: cameraFrameHeight / 2,
    x2: cameraFrameWidth,
    y2: cameraFrameHeight / 2,
    gradientTransform:
      "rotate(" +
      clampNumber(frameProperties.frameAngle, 0, 360, 45) +
      " " +
      cameraFrameWidth / 2 +
      " " +
      cameraFrameHeight / 2 +
      ")"
  });
  for (const [cameraFrameStopOffset, cameraFrameStopOpacity] of [
    [0, 0.96],
    [0.22, 0.72],
    [0.52, 0.3],
    [0.78, 0.66],
    [1, 0.42]
  ]) {
    appendSvgElement(cameraFrameEdgeGradient, "stop", {
      offset: cameraFrameStopOffset,
      "stop-color": cameraFrameColor,
      "stop-opacity": cameraFrameStopOpacity * cameraFrameOpacity
    });
  }
  appendSvgElement(cameraFrameSvg, "rect", {
    x: cameraFrameInset,
    y: cameraFrameInset,
    width: cameraFrameInnerWidth,
    height: cameraFrameInnerHeight,
    rx: cameraFrameCornerRadius,
    fill: "none",
    stroke: "url(#" + cameraFrameId + "-edge)",
    "stroke-width": cameraFrameBorderWidth,
    "vector-effect": "non-scaling-stroke"
  });
  return cameraFrameSvg;
}
const CAMERA_HLS_CACHE_TTL_MS = 30000;
const CAMERA_PREWARM_LIMIT = 4;
const cameraSourceCache = new Map();
const cameraSourceInflight = new Map();
async function fetchCameraHlsSource(cameraEntityId) {
  const normalizedCameraEntityId = String(cameraEntityId || "").trim();
  if (!normalizedCameraEntityId) {
    throw new Error("Camera entity is required");
  }
  const requestStartTimestamp = Date.now();
  const cachedSourceEntry = cameraSourceCache.get(normalizedCameraEntityId);
  if (
    cachedSourceEntry &&
    requestStartTimestamp - cachedSourceEntry.createdAt < CAMERA_HLS_CACHE_TTL_MS
  ) {
    return cachedSourceEntry.source;
  }
  const inflightSourcePromise = cameraSourceInflight.get(normalizedCameraEntityId);
  if (inflightSourcePromise) {
    return inflightSourcePromise;
  }
    const pendingSourcePromise = (async () => {
    const hlsFetchResponse = await fetch(
      "/api/camera_hls/" + encodeURIComponent(normalizedCameraEntityId)
    );
    const hlsPayload = await hlsFetchResponse.json().catch(() => ({}));
    if (!hlsFetchResponse.ok) {
      throw new Error(
        hlsPayload?.detail || "Camera HLS request failed: " + hlsFetchResponse.status
      );
    }
    const hlsProxyUrl = typeof hlsPayload?.url == "string" ? hlsPayload.url.trim() : "";
    if (!hlsProxyUrl.startsWith("/")) {
      cameraSourceCache.set(normalizedCameraEntityId, {
        source: "",
        createdAt: Date.now()
      });
      return "";
    }
    cameraSourceCache.set(normalizedCameraEntityId, {
      source: hlsProxyUrl,
      createdAt: Date.now()
    });
    return hlsProxyUrl;
  })();
  cameraSourceInflight.set(normalizedCameraEntityId, pendingSourcePromise);
  try {
    return await pendingSourcePromise;
  } finally {
    if (cameraSourceInflight.get(normalizedCameraEntityId) === pendingSourcePromise) {
      cameraSourceInflight.delete(normalizedCameraEntityId);
    }
  }
}
export async function prewarmCameraMedia(prewarmEntityIds = []) {
  if (document.visibilityState === "hidden") {
    return;
  }
  const prewarmTargetEntityIds = [
    ...new Set(
      (prewarmEntityIds || [])
        .map(prewarmEntityId => String(prewarmEntityId || "").trim())
        .filter(Boolean)
    )
  ].slice(0, CAMERA_PREWARM_LIMIT);
  await Promise.allSettled(
    prewarmTargetEntityIds.map(prewarmRequestEntityId =>
      fetchCameraHlsSource(prewarmRequestEntityId)
    )
  );
}
export function mountCameraSnapshot({
  container: snapshotContainer,
  entityId: snapshotEntityId,
  label: snapshotLabel,
  objectFit: snapshotObjectFit = "cover",
  refreshInterval: snapshotRefreshSeconds = 10,
  placeholder: snapshotPlaceholderElement,
  cleanup: snapshotCleanup = () => {}
}) {
  const snapshotImageElement = document.createElement("img");
  snapshotImageElement.className = "hb-camera-image";
  snapshotImageElement.alt = snapshotLabel || snapshotEntityId;
  snapshotImageElement.draggable = false;
  snapshotImageElement.style.objectFit = snapshotObjectFit;
  const snapshotRefreshValue = Number(snapshotRefreshSeconds);
  const snapshotRefreshSecondsClamped = Number.isFinite(snapshotRefreshValue)
    ? Math.max(6, Math.round(snapshotRefreshValue))
    : 10;
  const snapshotRefreshMs = Math.min(2147483000, snapshotRefreshSecondsClamped * 1000);
  let isSnapshotDisposed = false;
  let isSnapshotSuspended = document.visibilityState === "hidden";
  let snapshotRefreshTimeoutId = 0;
  let hasSnapshotLoaded = false;
  let snapshotRequestId = 0;
  const clearSnapshotRefreshTimer = () => {
    window.clearTimeout(snapshotRefreshTimeoutId);
    snapshotRefreshTimeoutId = 0;
  };
  const scheduleSnapshotRefresh = () => {
    clearSnapshotRefreshTimer();
    if (!isSnapshotDisposed && !isSnapshotSuspended) {
      snapshotRefreshTimeoutId = window.setTimeout(loadCameraSnapshot, snapshotRefreshMs);
    }
  };
  const loadCameraSnapshot = () => {
    if (isSnapshotDisposed || isSnapshotSuspended) {
      return;
    }
    clearSnapshotRefreshTimer();
    const snapshotProxyUrl =
      "/api/camera_proxy/" + encodeURIComponent(snapshotEntityId) + "?hb=" + Date.now();
    if (!hasSnapshotLoaded) {
      snapshotPlaceholderElement.hidden = false;
      snapshotPlaceholderElement.textContent = "正在载入摄像头快照";
      snapshotContainer.dataset.cameraState = "snapshot-loading";
      snapshotImageElement.src = snapshotProxyUrl;
      return;
    }
    snapshotContainer.dataset.cameraState = "snapshot-loading";
    const currentSnapshotRequestId = ++snapshotRequestId;
    const preloadSnapshotImage = document.createElement("img");
    preloadSnapshotImage.addEventListener("load", () => {
      if (
        !isSnapshotDisposed &&
        !isSnapshotSuspended &&
        currentSnapshotRequestId === snapshotRequestId
      ) {
        snapshotImageElement.src = snapshotProxyUrl;
      }
    });
    preloadSnapshotImage.addEventListener("error", () => {
      if (
        !isSnapshotDisposed &&
        !isSnapshotSuspended &&
        currentSnapshotRequestId === snapshotRequestId
      ) {
        snapshotContainer.dataset.cameraState = "snapshot-stale";
        scheduleSnapshotRefresh();
      }
    });
    preloadSnapshotImage.src = snapshotProxyUrl;
  };
  snapshotImageElement.addEventListener("load", () => {
    if (!isSnapshotDisposed && !isSnapshotSuspended) {
      hasSnapshotLoaded = true;
      snapshotPlaceholderElement.hidden = true;
      snapshotContainer.dataset.cameraState = "snapshot-ready";
      scheduleSnapshotRefresh();
    }
  });
  snapshotImageElement.addEventListener("error", () => {
    if (!isSnapshotDisposed && !isSnapshotSuspended) {
      snapshotPlaceholderElement.hidden = false;
      snapshotPlaceholderElement.textContent = "摄像头快照不可用";
      snapshotContainer.dataset.cameraState = "snapshot-unavailable";
      scheduleSnapshotRefresh();
    }
  });
  const handleSnapshotVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      isSnapshotSuspended = true;
      clearSnapshotRefreshTimer();
      snapshotContainer.dataset.cameraState = "snapshot-suspended";
      return;
    }
    if (isSnapshotSuspended) {
      isSnapshotSuspended = false;
      loadCameraSnapshot();
    }
  };
  snapshotContainer.dataset.cameraTransport = "snapshot";
  snapshotContainer.prepend(snapshotImageElement);
  document.addEventListener("visibilitychange", handleSnapshotVisibilityChange);
  if (isSnapshotSuspended) {
    snapshotContainer.dataset.cameraState = "snapshot-suspended";
  } else {
    loadCameraSnapshot();
  }
  snapshotCleanup(() => {
    isSnapshotDisposed = true;
    clearSnapshotRefreshTimer();
    document.removeEventListener("visibilitychange", handleSnapshotVisibilityChange);
    snapshotImageElement.removeAttribute("src");
  });
  return {
    image: snapshotImageElement
  };
}
export function mountCameraMedia({
  container: mediaContainer,
  entityId: mediaEntityId,
  label: mediaLabel,
  objectFit: mediaObjectFit = "cover",
  placeholder: mediaPlaceholderElement,
  onReady: onMediaReady = () => {},
  onUnavailable: onMediaUnavailable = () => {},
  cleanup: mediaCleanup = () => {}
}) {
  const cameraVideoElement = document.createElement("video");
  cameraVideoElement.className = "hb-camera-video";
  cameraVideoElement.setAttribute("aria-label", mediaLabel || mediaEntityId);
  cameraVideoElement.autoplay = true;
  cameraVideoElement.muted = true;
  cameraVideoElement.playsInline = true;
  cameraVideoElement.disablePictureInPicture = true;
  cameraVideoElement.style.objectFit = mediaObjectFit;
  const cameraSnapshotImageElement = document.createElement("img");
  cameraSnapshotImageElement.className = "hb-camera-image";
  cameraSnapshotImageElement.alt = mediaLabel || mediaEntityId;
  cameraSnapshotImageElement.draggable = false;
  cameraSnapshotImageElement.style.objectFit = mediaObjectFit;
  let isMediaDisposed = false;
  let hasLegacyFallbackStarted = false;
  let hasSnapshotFallbackStarted = false;
  let connectTimeoutId = 0;
  let hlsTimeoutId = 0;
  let snapshotProbeTimeoutId = 0;
  let hlsInstance = null;
  let hasVideoReady = false;
  let mediaGeneration = 0;
  let isMediaSuspended = document.visibilityState === "hidden";
  const teardownCameraMedia = () => {
    mediaGeneration += 1;
    window.clearTimeout(connectTimeoutId);
    window.clearTimeout(hlsTimeoutId);
    window.clearTimeout(snapshotProbeTimeoutId);
    connectTimeoutId = 0;
    hlsTimeoutId = 0;
    snapshotProbeTimeoutId = 0;
    hlsInstance?.destroy();
    hlsInstance = null;
    cameraVideoElement.pause();
    cameraVideoElement.removeAttribute("src");
    cameraVideoElement.load();
    cameraSnapshotImageElement.removeAttribute("src");
    hasLegacyFallbackStarted = false;
    hasSnapshotFallbackStarted = false;
    hasVideoReady = false;
  };
  const showCameraVideo = () => {
    cameraSnapshotImageElement.remove();
    if (!cameraVideoElement.isConnected) {
      mediaContainer.prepend(cameraVideoElement);
    }
  };
  const handleVideoReady = () => {
    if (!isMediaDisposed && !isMediaSuspended && !hasVideoReady) {
      hasVideoReady = true;
      window.clearTimeout(hlsTimeoutId);
      window.clearTimeout(snapshotProbeTimeoutId);
      mediaPlaceholderElement.hidden = true;
      onMediaReady();
    }
  };
  const handleVideoUnavailable = () => {
    if (!isMediaDisposed && !isMediaSuspended) {
      hasVideoReady = false;
      mediaPlaceholderElement.hidden = false;
      mediaPlaceholderElement.textContent = "摄像头实时预览不可用";
      onMediaUnavailable();
    }
  };
  const loadLegacySnapshotImage = () => {
    if (!isMediaDisposed && !isMediaSuspended) {
      cameraSnapshotImageElement.src =
        "/api/camera_proxy/" + encodeURIComponent(mediaEntityId) + "?hb=" + Date.now();
    }
  };
  const fallbackToSnapshotImage = (expectedGeneration = mediaGeneration) => {
    if (
      !isMediaDisposed &&
      !isMediaSuspended &&
      expectedGeneration === mediaGeneration &&
      !hasSnapshotFallbackStarted
    ) {
      hasSnapshotFallbackStarted = true;
      window.clearTimeout(snapshotProbeTimeoutId);
      loadLegacySnapshotImage();
    }
  };
  const useLegacyCameraStream = (fallbackGeneration = mediaGeneration) => {
    if (
      !isMediaDisposed &&
      !isMediaSuspended &&
      fallbackGeneration === mediaGeneration &&
      !hasLegacyFallbackStarted
    ) {
      hasLegacyFallbackStarted = true;
      mediaContainer.dataset.cameraTransport = "legacy";
      window.clearTimeout(hlsTimeoutId);
      hlsInstance?.destroy();
      hlsInstance = null;
      cameraVideoElement.pause();
      cameraVideoElement.removeAttribute("src");
      cameraVideoElement.load();
      cameraVideoElement.remove();
      mediaContainer.prepend(cameraSnapshotImageElement);
      cameraSnapshotImageElement.src =
        "/api/camera_proxy_stream/" + encodeURIComponent(mediaEntityId);
      snapshotProbeTimeoutId = window.setTimeout(() => {
        if (!cameraSnapshotImageElement.naturalWidth) {
          fallbackToSnapshotImage(fallbackGeneration);
        }
      }, 7000);
    }
  };
  cameraVideoElement.addEventListener("loadeddata", handleVideoReady);
  cameraVideoElement.addEventListener("playing", handleVideoReady);
  cameraVideoElement.addEventListener(
    "error",
    () => {
      if (!hlsInstance) {
        useLegacyCameraStream();
      }
    },
    {
      once: true
    }
  );
  cameraSnapshotImageElement.addEventListener("load", handleVideoReady);
  cameraSnapshotImageElement.addEventListener("error", () => {
    if (!isMediaDisposed && !isMediaSuspended) {
      if (hasSnapshotFallbackStarted) {
        handleVideoUnavailable();
      } else {
        fallbackToSnapshotImage();
      }
    }
  });
  mediaContainer.prepend(cameraVideoElement);
  const startHlsPlayback = async playbackGeneration => {
    try {
      const hlsSourceUrl = await fetchCameraHlsSource(mediaEntityId);
      if (isMediaDisposed || isMediaSuspended || playbackGeneration !== mediaGeneration) {
        return;
      }
      if (!hlsSourceUrl) {
        useLegacyCameraStream(playbackGeneration);
        return;
      }
      mediaContainer.dataset.cameraHlsSource = hlsSourceUrl;
      mediaContainer.dataset.cameraTransport = "hls";
      if (window.Hls?.isSupported?.()) {
        hlsInstance = new window.Hls({
          lowLatencyMode: true,
          backBufferLength: 15,
          maxBufferLength: 15
        });
        hlsInstance.on(window.Hls.Events.MEDIA_ATTACHED, () =>
          hlsInstance?.loadSource(hlsSourceUrl)
        );
        hlsInstance.on(window.Hls.Events.MANIFEST_PARSED, () => {
          mediaContainer.dataset.cameraState = "manifest-parsed";
          cameraVideoElement.play().catch(() => {});
        });
        hlsInstance.on(window.Hls.Events.ERROR, (hlsEventName, hlsEventData) => {
          if (!isMediaDisposed && !isMediaSuspended && playbackGeneration === mediaGeneration) {
            if (hlsEventData?.fatal) {
              cameraSourceCache.delete(String(mediaEntityId || "").trim());
              mediaContainer.dataset.cameraState = "hls-failed";
              mediaContainer.dataset.cameraError = [
                hlsEventData.type,
                hlsEventData.details,
                hlsEventData.url || hlsEventData.response?.url || "",
                hlsEventData.response?.code || 0,
                hlsEventData.reason || hlsEventData.error?.message || ""
              ].join(" | ");
              window.HABridgeLog?.report(
                "error",
                "摄像头",
                "摄像头播放失败：" +
                  (hlsEventData.type || "") +
                  " / " +
                  (hlsEventData.details || ""),
                {
                  entityId: mediaEntityId,
                  phase: "hls-playback",
                  status: hlsEventData.response?.code || 0,
                  path: hlsEventData.url || hlsEventData.response?.url || ""
                }
              );
              console.warn("[HomeOS camera] HLS playback failed", {
                entityId: mediaEntityId,
                type: hlsEventData.type,
                details: hlsEventData.details,
                url: hlsEventData.url || hlsEventData.response?.url || "",
                status: hlsEventData.response?.code || 0,
                reason: hlsEventData.reason || hlsEventData.error?.message || ""
              });
              useLegacyCameraStream(playbackGeneration);
            }
          }
        });
        hlsInstance.attachMedia(cameraVideoElement);
      } else {
        cameraVideoElement.src = hlsSourceUrl;
        cameraVideoElement.play().catch(() => {});
      }
    } catch (hlsError) {
      if (isMediaDisposed || isMediaSuspended || playbackGeneration !== mediaGeneration) {
        return;
      }
      mediaContainer.dataset.cameraState = "setup-fallback";
      mediaContainer.dataset.cameraError = String(hlsError);
      useLegacyCameraStream(playbackGeneration);
    }
  };
  const beginCameraPlayback = () => {
    if (isMediaDisposed || isMediaSuspended) {
      return;
    }
    showCameraVideo();
    hasVideoReady = false;
    mediaPlaceholderElement.hidden = false;
    mediaPlaceholderElement.textContent = "摄像头正在连接";
    const playbackStartGeneration = mediaGeneration;
    mediaContainer.dataset.cameraState = "starting";
    startHlsPlayback(playbackStartGeneration);
    hlsTimeoutId = window.setTimeout(() => useLegacyCameraStream(playbackStartGeneration), 12000);
  };
  const handleMediaVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      if (isMediaSuspended) {
        return;
      }
      isMediaSuspended = true;
      teardownCameraMedia();
      mediaContainer.dataset.cameraState = "suspended";
      mediaPlaceholderElement.hidden = false;
      mediaPlaceholderElement.textContent = "摄像头已在后台暂停";
      return;
    }
    if (isMediaSuspended) {
      isMediaSuspended = false;
      beginCameraPlayback();
    }
  };
  document.addEventListener("visibilitychange", handleMediaVisibilityChange);
  if (isMediaSuspended) {
    mediaContainer.dataset.cameraState = "suspended";
    mediaPlaceholderElement.hidden = false;
    mediaPlaceholderElement.textContent = "摄像头已在后台暂停";
  } else {
    mediaContainer.dataset.cameraState = "deferred";
    connectTimeoutId = window.setTimeout(beginCameraPlayback, 0);
  }
  mediaCleanup(() => {
    isMediaDisposed = true;
    document.removeEventListener("visibilitychange", handleMediaVisibilityChange);
    teardownCameraMedia();
  });
  return {
    video: cameraVideoElement,
    image: cameraSnapshotImageElement
  };
}
registerComponent("camera", {
  render(cameraComponent, cameraContext) {
    const cameraProperties = cameraComponent.properties || {};
    const cameraBindingEntityId = cameraComponent.bindings?.entity?.entityId || "";
    const cameraElement = document.createElement("div");
    cameraElement.className = "hb-camera-component";
    const cameraWidth = Math.max(1, Number(cameraComponent.position?.width || 320));
    const cameraHeight = Math.max(1, Number(cameraComponent.position?.height || 180));
    const cameraScopeScale = Math.max(
      0.01,
      Number(cameraContext.document?.canvas?.componentScale || 1)
    );
    const cameraBorderRadius =
      (Math.min(cameraWidth, cameraHeight) * cameraRadiusRatio(cameraProperties.radius)) /
      cameraScopeScale;
    cameraElement.style.borderRadius = cameraBorderRadius + "px";
    if (cameraContext.editable) {
      const cameraPlaceholderElement = document.createElement("div");
      cameraPlaceholderElement.className = "hb-camera-placeholder";
      cameraPlaceholderElement.textContent =
        cameraProperties.mediaVisible === false ? "摄像头画面已隐藏" : "编辑模式不加载实时画面";
      cameraElement.append(cameraPlaceholderElement);
    } else if (cameraContext.liveMedia !== false && cameraProperties.mediaVisible !== false) {
      const cameraStatusElement = document.createElement("div");
      cameraStatusElement.className = "hb-camera-placeholder";
      const isSnapshotDisplayMode = cameraProperties.displayMode === "snapshot";
      cameraStatusElement.textContent = cameraBindingEntityId
        ? isSnapshotDisplayMode
          ? "正在载入摄像头快照"
          : "正在载入摄像头实时预览"
        : "未选择摄像头实体";
      cameraElement.append(cameraStatusElement);
      if (cameraBindingEntityId) {
        const cameraMountOptions = {
          container: cameraElement,
          entityId: cameraBindingEntityId,
          label:
            resolveStateEntry(cameraContext.states?.get(cameraBindingEntityId))?.attributes
              ?.friendly_name || cameraBindingEntityId,
          objectFit: cameraProperties.fit === "contain" ? "contain" : "fill",
          placeholder: cameraStatusElement,
          cleanup: cleanupRegistration => cameraContext.cleanup(cleanupRegistration)
        };
        if (isSnapshotDisplayMode) {
          mountCameraSnapshot({
            ...cameraMountOptions,
            refreshInterval: cameraProperties.refreshInterval
          });
        } else {
          mountCameraMedia(cameraMountOptions);
        }
      }
    }
    appendCameraFrame(
      cameraElement,
      cameraComponent,
      cameraProperties,
      cameraContext.renderNamespace
    );
    return cameraElement;
  }
});
registerComponent("vacuum-map", {
  render(vacuumComponent, vacuumContext) {
    const vacuumProperties = vacuumComponent.properties || {};
    const vacuumBindingEntityId = vacuumComponent.bindings?.entity?.entityId || "";
    const vacuumElement = document.createElement("div");
    vacuumElement.className = "hb-vacuum-map-component";
    vacuumElement.style.opacity = String(clampNumber(vacuumProperties.opacity, 0, 1, 0.5));
    vacuumElement.setAttribute("aria-label", vacuumProperties.label || "扫地机器人实时地图");
    if (!vacuumBindingEntityId) {
      if (vacuumContext.editable) {
        const vacuumEmptyPlaceholderElement = document.createElement("span");
        vacuumEmptyPlaceholderElement.className = "hb-vacuum-map-placeholder";
        vacuumEmptyPlaceholderElement.textContent = "请选择实时地图实体";
        vacuumElement.append(vacuumEmptyPlaceholderElement);
      }
      return vacuumElement;
    }
    const vacuumImageElement = document.createElement("img");
    vacuumImageElement.className = "hb-vacuum-map-image";
    vacuumImageElement.alt =
      vacuumProperties.label ||
      resolveStateEntry(vacuumContext.states?.get(vacuumBindingEntityId))?.attributes
        ?.friendly_name ||
      vacuumBindingEntityId;
    vacuumImageElement.draggable = false;
    const vacuumEncodedEntityId = encodeURIComponent(vacuumBindingEntityId);
    const isImageEntityId = vacuumBindingEntityId.startsWith("image.");
    const isVacuumLiveMediaEnabled = vacuumContext.liveMedia !== false;
    const isVacuumLiveMediaActive = vacuumContext.liveMedia !== false && !vacuumContext.editable;
    if (isVacuumLiveMediaActive && document.visibilityState === "hidden") {
      vacuumImageElement.dataset.vacuumMapSuspended = "true";
    }
    const resolveVacuumMapSource = () =>
      isImageEntityId
        ? vacuumMapImageSource(
            vacuumBindingEntityId,
            vacuumContext.states?.get(vacuumBindingEntityId)
          )
        : vacuumContext.editable
          ? "/api/camera_proxy/" + vacuumEncodedEntityId + "?hb=" + Date.now()
          : "/api/camera_proxy_stream/" + vacuumEncodedEntityId;
    let vacuumRetryTimeoutId = 0;
    let vacuumRetryCount = 0;
    const MAX_VACUUM_RETRY_COUNT = 4;
    const clearVacuumRetryTimer = () => {
      if (vacuumRetryTimeoutId) {
        window.clearTimeout(vacuumRetryTimeoutId);
        vacuumRetryTimeoutId = 0;
      }
    };
    const applyVacuumMapSource = () => {
      const vacuumMapSource = resolveVacuumMapSource();
      if (isImageEntityId) {
        vacuumImageElement.dataset.vacuumMapSource = vacuumMapSource;
      }
      if (vacuumImageElement.dataset.vacuumMapSuspended === "true") {
        vacuumImageElement.removeAttribute("src");
        return;
      }
      vacuumImageElement.src = vacuumMapSource;
    };
    const handleVacuumImageLoad = () => {
      vacuumRetryCount = 0;
      clearVacuumRetryTimer();
    };
    const showVacuumUnavailablePlaceholder = () => {
      if (!vacuumContext.editable || !vacuumImageElement.isConnected) {
        return;
      }
      const vacuumUnavailableElement = document.createElement("span");
      vacuumUnavailableElement.className = "hb-vacuum-map-placeholder";
      vacuumUnavailableElement.textContent = "实时地图暂时不可用";
      vacuumImageElement.replaceWith(vacuumUnavailableElement);
    };
    const handleVacuumImageError = () => {
      if (!isVacuumLiveMediaEnabled || vacuumImageElement.dataset.vacuumMapSuspended === "true") {
        return;
      }
      if (vacuumRetryCount >= MAX_VACUUM_RETRY_COUNT) {
        showVacuumUnavailablePlaceholder();
        return;
      }
      vacuumRetryCount += 1;
      clearVacuumRetryTimer();
      const vacuumRetryDelayMs = Math.min(4000, 2 ** (vacuumRetryCount - 1) * 700);
      vacuumRetryTimeoutId = window.setTimeout(() => {
        vacuumRetryTimeoutId = 0;
        if (
          vacuumImageElement.dataset.vacuumMapSuspended === "true" ||
          !vacuumImageElement.isConnected
        ) {
          return;
        }
        const vacuumRetrySource = resolveVacuumMapSource();
        const vacuumRetrySourceBusted = isImageEntityId
          ? vacuumRetrySource
          : "" +
            vacuumRetrySource +
            (vacuumRetrySource.includes("?") ? "&" : "?") +
            "hb=" +
            Date.now();
        if (isImageEntityId) {
          vacuumImageElement.dataset.vacuumMapSource = vacuumRetrySourceBusted;
        }
        vacuumImageElement.src = vacuumRetrySourceBusted;
      }, vacuumRetryDelayMs);
    };
    vacuumImageElement.addEventListener("load", handleVacuumImageLoad);
    if (isVacuumLiveMediaEnabled) {
      vacuumImageElement.addEventListener("error", handleVacuumImageError);
    }
    if (vacuumContext.liveMedia !== false) {
      applyVacuumMapSource();
    }
    if (isVacuumLiveMediaActive) {
      const handleVacuumVisibilityChange = () => {
        if (document.visibilityState === "hidden") {
          if (vacuumImageElement.dataset.vacuumMapSuspended === "true") {
            return;
          }
          vacuumImageElement.dataset.vacuumMapSuspended = "true";
          vacuumImageElement.removeAttribute("src");
          return;
        }
        if (vacuumImageElement.dataset.vacuumMapSuspended === "true") {
          delete vacuumImageElement.dataset.vacuumMapSuspended;
          applyVacuumMapSource();
        }
      };
      document.addEventListener("visibilitychange", handleVacuumVisibilityChange);
      vacuumContext.cleanup(() =>
        document.removeEventListener("visibilitychange", handleVacuumVisibilityChange)
      );
    }
    if (!isVacuumLiveMediaEnabled) {
      vacuumImageElement.addEventListener("error", showVacuumUnavailablePlaceholder, {
        once: true
      });
    }
    vacuumElement.append(vacuumImageElement);
    vacuumContext.cleanup(() => {
      clearVacuumRetryTimer();
      vacuumImageElement.removeEventListener?.("load", handleVacuumImageLoad);
      if (isVacuumLiveMediaEnabled) {
        vacuumImageElement.removeEventListener?.("error", handleVacuumImageError);
      }
      vacuumImageElement.removeAttribute("src");
    });
    return vacuumElement;
  }
});
registerComponent("time", {
  render(timeComponent, timeContext) {
    const timeProperties = timeComponent.properties || {};
    const timeFontSize = clampNumber(timeProperties.fontSize, 12, 500, 96);
    const timeElement = document.createElement("time");
    timeElement.className = "hb-time-component";
    timeElement.style.color = resolveColor(timeProperties.color, "#248eb2");
    timeElement.style.fontSize = timeFontSize + "px";
    timeElement.style.letterSpacing =
      clampNumber(timeProperties.letterSpacing, -20, 100, 2.2) + "px";
    timeElement.style.opacity = String(clampNumber(timeProperties.opacity, 0, 1, 1));
    const timeValueElement = document.createElement("span");
    timeValueElement.className = "hb-time-value";
    applyFontWeight(timeValueElement, timeProperties.fontWeight, timeFontSize);
    const timePeriodElement = document.createElement("small");
    timePeriodElement.className = "hb-time-period";
    applyFontWeight(timePeriodElement, timeProperties.fontWeight, timeFontSize * 0.5);
    timeElement.append(timeValueElement, timePeriodElement);
    const updateTimeDisplay = () => {
      const nowDate = new Date();
      const formattedLocalTime = formatLocalTime(timeProperties, nowDate);
      timeElement.dateTime = nowDate.toISOString();
      timeValueElement.textContent = formattedLocalTime.value;
      timePeriodElement.textContent = formattedLocalTime.suffix;
      timePeriodElement.hidden = !formattedLocalTime.suffix;
    };
    updateTimeDisplay();
    const timeIntervalId = window.setInterval(
      updateTimeDisplay,
      timeProperties.showSeconds === true ? 250 : 1000
    );
    timeContext.cleanup(() => window.clearInterval(timeIntervalId));
    return timeElement;
  }
});
registerComponent("date", {
  render(dateComponent, dateContext) {
    const dateProperties = dateComponent.properties || {};
    const dateElement = document.createElement("div");
    dateElement.className = "hb-date-component";
    dateElement.style.opacity = String(clampNumber(dateProperties.opacity, 0, 1, 1));
    dateElement.style.gap = clampNumber(dateProperties.lineGap, 0, 200, 8) + "px";
    const datePrimaryElement = document.createElement("strong");
    datePrimaryElement.className = "hb-date-primary";
    datePrimaryElement.style.color = resolveColor(dateProperties.primaryColor, "#8d9296");
    const datePrimarySize = clampNumber(dateProperties.primarySize, 12, 500, 36);
    datePrimaryElement.style.fontSize = datePrimarySize + "px";
    applyFontWeight(datePrimaryElement, dateProperties.primaryWeight, datePrimarySize);
    datePrimaryElement.style.letterSpacing =
      clampNumber(dateProperties.primarySpacing, -20, 100, 1) + "px";
    dateElement.append(datePrimaryElement);
    let lunarElement = null;
    if (dateProperties.showLunar === true) {
      lunarElement = document.createElement("small");
      lunarElement.className = "hb-date-lunar";
      lunarElement.style.color = resolveColor(dateProperties.lunarColor, "#7f878c");
      const dateLunarSize = clampNumber(dateProperties.lunarSize, 10, 500, 24);
      lunarElement.style.fontSize = dateLunarSize + "px";
      applyFontWeight(lunarElement, dateProperties.lunarWeight, dateLunarSize);
      lunarElement.style.letterSpacing =
        clampNumber(dateProperties.lunarSpacing, -20, 100, 1) + "px";
      dateElement.append(lunarElement);
    }
    const updateDateDisplay = () => {
      const todayDate = new Date();
      datePrimaryElement.textContent = formatLocalDate(dateProperties, todayDate);
      if (lunarElement) {
        lunarElement.textContent = formatLunarDate(todayDate);
      }
    };
    updateDateDisplay();
    const dateIntervalId = window.setInterval(updateDateDisplay, 30000);
    dateContext.cleanup(() => window.clearInterval(dateIntervalId));
    return dateElement;
  }
});
registerComponent("weather", {
  render(weatherComponent, weatherContext) {
    const weatherProperties = weatherComponent.properties || {};
    const weatherEntityId = weatherComponent.bindings?.entity?.entityId || "";
    const sunEntityId = weatherComponent.bindings?.sun?.entityId || "sun.sun";
    const weatherState = weatherContext.states.get(weatherEntityId);
    const sunStateText = weatherContext.states.get(sunEntityId)?.state || "";
    const weatherAttributes = weatherState?.attributes || {};
    const [weatherIconName, weatherConditionLabel] = weatherVisual(
      weatherState?.state,
      sunStateText
    );
    const weatherElement = document.createElement("div");
    weatherElement.className = "hb-weather-component";
    weatherElement.style.gap = clampNumber(weatherProperties.iconGap, 0, 300, 22) + "px";
    weatherElement.style.opacity = String(clampNumber(weatherProperties.opacity, 0, 1, 1));
    if (weatherProperties.iconVisible !== false) {
      const weatherIconElement = document.createElement("img");
      weatherIconElement.className = "hb-weather-icon";
      weatherIconElement.src = meteoconUrl(weatherIconName);
      weatherIconElement.alt = weatherConditionLabel;
      weatherIconElement.draggable = false;
      weatherIconElement.style.width = clampNumber(weatherProperties.iconSize, 12, 500, 64) + "px";
      weatherIconElement.style.height = clampNumber(weatherProperties.iconSize, 12, 500, 64) + "px";
      weatherElement.append(weatherIconElement);
    }
    const weatherContentElement = document.createElement("span");
    weatherContentElement.className = "hb-weather-content";
    weatherContentElement.style.gap = clampNumber(weatherProperties.lineGap, 0, 200, 7) + "px";
    if (weatherProperties.temperatureVisible !== false) {
      const weatherTemperatureElement = document.createElement("strong");
      const temperatureValue = Number(weatherAttributes.temperature);
      const temperatureUnit = String(
        weatherAttributes.temperature_unit || weatherAttributes.unit_of_measurement || "°C"
      );
      weatherTemperatureElement.textContent = Number.isFinite(temperatureValue)
        ? "" + temperatureValue + temperatureUnit
        : "--" + temperatureUnit;
      weatherTemperatureElement.style.color = resolveColor(
        weatherProperties.temperatureColor,
        "#aeb3b7"
      );
      const temperatureFontSize = clampNumber(weatherProperties.temperatureSize, 12, 500, 32);
      weatherTemperatureElement.style.fontSize = temperatureFontSize + "px";
      applyFontWeight(
        weatherTemperatureElement,
        weatherProperties.temperatureWeight,
        temperatureFontSize
      );
      weatherTemperatureElement.style.letterSpacing =
        clampNumber(weatherProperties.temperatureSpacing, -20, 100, 1) + "px";
      weatherContentElement.append(weatherTemperatureElement);
    }
    if (
      weatherProperties.conditionVisible !== false ||
      weatherProperties.humidityVisible !== false
    ) {
      const weatherSecondaryElement = document.createElement("small");
      const weatherSecondaryParts = [];
      if (weatherProperties.conditionVisible !== false) {
        weatherSecondaryParts.push(weatherConditionLabel);
      }
      const humidityValue = Number(weatherAttributes.humidity);
      if (weatherProperties.humidityVisible !== false) {
        weatherSecondaryParts.push(
          Number.isFinite(humidityValue) ? "湿度 " + humidityValue + "%" : "湿度 --"
        );
      }
      weatherSecondaryElement.textContent = weatherSecondaryParts.join(" · ");
      weatherSecondaryElement.style.color = resolveColor(
        weatherProperties.secondaryColor,
        "#8d9296"
      );
      const weatherSecondaryFontSize = clampNumber(weatherProperties.secondarySize, 10, 500, 18);
      weatherSecondaryElement.style.fontSize = weatherSecondaryFontSize + "px";
      applyFontWeight(
        weatherSecondaryElement,
        weatherProperties.secondaryWeight,
        weatherSecondaryFontSize
      );
      weatherSecondaryElement.style.letterSpacing =
        clampNumber(weatherProperties.secondarySpacing, -20, 100, 1) + "px";
      weatherContentElement.append(weatherSecondaryElement);
    }
    if (weatherContentElement.childElementCount) {
      weatherElement.append(weatherContentElement);
    }
    return weatherElement;
  }
});
registerComponent("line-chart", {
  render(chartComponent, chartContext) {
    const chartProperties = chartComponent.properties || {};
    const chartEntityId = chartComponent.bindings?.entity?.entityId || "";
    const chartState = chartContext.states.get(chartEntityId);
    const chartUnit = String(chartState?.attributes?.unit_of_measurement || "");
    const chartCurrentValue = Number.parseFloat(chartState?.state);
    const chartSamples = buildHistorySeries(
      chartContext,
      chartEntityId,
      chartCurrentValue,
      chartProperties.hours
    );
    const chartThresholds = resolvedThresholds(
      chartProperties.thresholds,
      chartSamples,
      chartProperties.thresholdMode
    );
    const chartElement = document.createElement("div");
    chartElement.className = "hb-line-chart-component";
    chartElement.style.borderRadius = clampNumber(chartProperties.cornerRadius, 0, 50, 10) + "%";
    const chartValueElement = document.createElement("span");
    chartValueElement.className = "hb-line-chart-value";
    chartValueElement.hidden = chartProperties.valueVisible === false;
    chartValueElement.style.color = resolveColor(chartProperties.valueColor, "#dce1e5");
    chartValueElement.style.fontSize =
      Math.max(
        10,
        (Number(chartComponent.position?.height || 300) *
          0.12 *
          clampNumber(chartProperties.valueScale, 10, 500, 100)) /
          100
      ) + "px";
    chartValueElement.style.left =
      95 + clampNumber(chartProperties.valueOffsetX, -100, 100, 0) + "%";
    chartValueElement.style.top = 8 + clampNumber(chartProperties.valueOffsetY, -100, 100, 0) + "%";
    const chartValueTextElement = document.createElement("strong");
    chartValueTextElement.textContent = formatLineChartValue(
      chartCurrentValue,
      chartProperties.statePrecision
    );
    const chartUnitElement = document.createElement("small");
    chartUnitElement.textContent = chartUnit;
    chartValueElement.append(chartValueTextElement, chartUnitElement);
    chartElement.append(chartValueElement);
    chartElement.syncLineChartState = runtimeStateUpdate => {
      const runtimeStateValue = Number.parseFloat(runtimeStateUpdate?.state);
      chartValueTextElement.textContent = formatLineChartValue(
        runtimeStateValue,
        chartProperties.statePrecision
      );
      chartUnitElement.textContent = String(
        runtimeStateUpdate?.attributes?.unit_of_measurement || ""
      );
      chartElement.style.setProperty(
        "--hb-chart-current-color",
        Number.isFinite(runtimeStateValue)
          ? thresholdColor(chartThresholds, runtimeStateValue)
          : "#68cc3e"
      );
    };
    const chartSvg = appendSvgElement(chartElement, "svg", {
      viewBox: "0 0 100 70",
      preserveAspectRatio: "none",
      "aria-hidden": "true"
    });
    chartSvg.classList.add("hb-line-chart-graph");
    if (chartSamples.length) {
      const chartGeometry = lineChartGeometry(chartSamples);
      const {
        minimum: chartMinimum,
        maximum: chartMaximum,
        span: chartSpan,
        points: chartPoints
      } = chartGeometry;
      const chartPath = smoothChartPath(chartPoints);
      const chartGradientId =
        (chartContext.renderNamespace || "renderer") +
        "-chart-" +
        String(chartComponent.id || "").replace(/[^a-z0-9_-]/gi, "");
      const chartDefs = appendSvgElement(chartSvg, "defs");
      const chartLineGradient = appendSvgElement(chartDefs, "linearGradient", {
        id: chartGradientId + "-line",
        gradientUnits: "userSpaceOnUse",
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 70
      });
      const chartThresholdStops = chartThresholds.length
        ? chartThresholds
        : [
            {
              value: chartMinimum,
              color: "#68cc3e"
            }
          ];
      for (const chartThresholdStop of [...chartThresholdStops].sort(
        (firstThresholdStop, secondThresholdStop) =>
          secondThresholdStop.value - firstThresholdStop.value
      )) {
        appendSvgElement(chartLineGradient, "stop", {
          offset:
            clampNumber(((chartMaximum - chartThresholdStop.value) / chartSpan) * 100, 0, 100, 0) +
            "%",
          "stop-color": chartThresholdStop.color
        });
      }
      appendSvgElement(chartSvg, "path", {
        d: chartPath + " L100 70 L0 70 Z",
        fill: "url(#" + chartGradientId + "-line)",
        opacity: 0.18
      });
      appendSvgElement(chartSvg, "path", {
        d: chartPath,
        fill: "none",
        stroke: "url(#" + chartGradientId + "-line)",
        "stroke-width": 1.6,
        "vector-effect": "non-scaling-stroke"
      });
      if (!chartContext.editable) {
        const chartHoverLayerElement = document.createElement("span");
        chartHoverLayerElement.className = "hb-line-chart-hover-layer";
        chartElement.append(chartHoverLayerElement);
        const chartHoverCleanup = attachChartTooltip(
          chartHoverLayerElement,
          chartElement,
          chartGeometry,
          chartUnit,
          chartMappedPoint => ({
            x: chartMappedPoint.x,
            y: (chartMappedPoint.y / 70) * 100
          }),
          chartProperties.statePrecision
        );
        chartContext.cleanup?.(chartHoverCleanup);
      }
    } else {
      chartElement.classList.add("history-loading");
    }
    chartElement.style.setProperty(
      "--hb-chart-current-color",
      Number.isFinite(chartCurrentValue)
        ? thresholdColor(chartThresholds, chartCurrentValue)
        : "#68cc3e"
    );
    return chartElement;
  }
});
export function renderLineChartDetails(detailsComponent, detailsContext) {
  const detailsEntityId = detailsComponent.bindings?.entity?.entityId || "";
  const detailsState = detailsContext.states.get(detailsEntityId);
  const detailsUnit = String(detailsState?.attributes?.unit_of_measurement || "");
  const detailsValue = Number.parseFloat(detailsState?.state);
  const detailsSamples = buildHistorySeries(
    detailsContext,
    detailsEntityId,
    detailsValue,
    detailsComponent.properties?.hours
  );
  const detailsElement = document.createElement("section");
  detailsElement.className = "hb-line-chart-details";
  const detailsThresholds = resolvedThresholds(
    detailsComponent.properties?.thresholds,
    detailsSamples,
    detailsComponent.properties?.thresholdMode
  );
  detailsElement.style.setProperty(
    "--hb-chart-current-color",
    Number.isFinite(detailsValue) ? thresholdColor(detailsThresholds, detailsValue) : "#68cc3e"
  );
  detailsElement.syncLineChartState = detailsRuntimeUpdate => {
    const detailsRuntimeValue = Number.parseFloat(detailsRuntimeUpdate?.state);
    detailsElement.style.setProperty(
      "--hb-chart-current-color",
      Number.isFinite(detailsRuntimeValue)
        ? thresholdColor(detailsThresholds, detailsRuntimeValue)
        : "#68cc3e"
    );
  };
  if (!detailsSamples.length) {
    const detailsEmptyElement = document.createElement("p");
    detailsEmptyElement.textContent = "暂无历史数据。";
    detailsElement.append(detailsEmptyElement);
    return detailsElement;
  }
  const isCompactHorizontal = detailsComponent.properties?.compactDetailsHorizontal === true;
  const detailsViewBoxWidth = isCompactHorizontal ? 790 : 720;
  const detailsTopOffset = isCompactHorizontal ? 0 : 56;
  const detailsViewBoxHeight = 340 + detailsTopOffset;
  const detailsLeftMargin = isCompactHorizontal ? 44 : 66;
  const detailsRightMargin = isCompactHorizontal ? 44 : 26;
  const detailsPlotRect = {
    left: detailsLeftMargin,
    top: 24,
    width: detailsViewBoxWidth - detailsLeftMargin - detailsRightMargin,
    height: 258 + detailsTopOffset
  };
  const detailsGeometry = lineChartGeometry(
    detailsSamples,
    detailsPlotRect.left,
    detailsPlotRect.top,
    detailsPlotRect.width,
    detailsPlotRect.height
  );
  const detailsSvg = appendSvgElement(detailsElement, "svg", {
    viewBox: "0 0 " + detailsViewBoxWidth + " " + detailsViewBoxHeight,
    preserveAspectRatio: "xMidYMid meet",
    role: "img",
    "aria-label": "带时间轴和数值轴的历史折线图"
  });
  const detailsGradientId =
    (detailsContext.renderNamespace || "renderer") +
    "-chart-details-" +
    String(detailsComponent.id || "").replace(/[^a-z0-9_-]/gi, "");
  const detailsDefs = appendSvgElement(detailsSvg, "defs");
  const detailsLineGradient = appendSvgElement(detailsDefs, "linearGradient", {
    id: detailsGradientId + "-line",
    gradientUnits: "userSpaceOnUse",
    x1: 0,
    y1: detailsPlotRect.top,
    x2: 0,
    y2: detailsPlotRect.top + detailsPlotRect.height
  });
  const detailsThresholdStops = detailsThresholds.length
    ? detailsThresholds
    : [
        {
          value: detailsGeometry.minimum,
          color: "#68cc3e"
        }
      ];
  for (const detailsThresholdStop of [...detailsThresholdStops].sort(
    (lowerThresholdStop, higherThresholdStop) =>
      higherThresholdStop.value - lowerThresholdStop.value
  )) {
    appendSvgElement(detailsLineGradient, "stop", {
      offset:
        clampNumber(
          ((detailsGeometry.maximum - detailsThresholdStop.value) / detailsGeometry.span) * 100,
          0,
          100,
          0
        ) + "%",
      "stop-color": detailsThresholdStop.color
    });
  }
  for (let horizontalGridIndex = 0; horizontalGridIndex <= 4; horizontalGridIndex += 1) {
    const horizontalRatio = horizontalGridIndex / 4;
    const horizontalY = detailsPlotRect.top + horizontalRatio * detailsPlotRect.height;
    const horizontalValue = detailsGeometry.maximum - horizontalRatio * detailsGeometry.span;
    appendSvgElement(detailsSvg, "line", {
      x1: detailsPlotRect.left,
      y1: horizontalY,
      x2: detailsPlotRect.left + detailsPlotRect.width,
      y2: horizontalY,
      class: "hb-line-chart-details-grid"
    });
    const horizontalLabelElement = appendSvgElement(detailsSvg, "text", {
      x: detailsPlotRect.left - (isCompactHorizontal ? 8 : 12),
      y: horizontalY + 4,
      "text-anchor": "end",
      class: "hb-line-chart-details-axis-label"
    });
    horizontalLabelElement.textContent = formatLineChartValue(
      horizontalValue,
      detailsComponent.properties?.statePrecision
    );
  }
  const hasMultiDayRange = Number(detailsComponent.properties?.hours || 24) > 24;
  for (let verticalGridIndex = 0; verticalGridIndex <= 5; verticalGridIndex += 1) {
    const verticalRatio = verticalGridIndex / 5;
    const verticalX = detailsPlotRect.left + verticalRatio * detailsPlotRect.width;
    const verticalTime =
      detailsGeometry.firstTime +
      verticalRatio * (detailsGeometry.lastTime - detailsGeometry.firstTime);
    appendSvgElement(detailsSvg, "line", {
      x1: verticalX,
      y1: detailsPlotRect.top,
      x2: verticalX,
      y2: detailsPlotRect.top + detailsPlotRect.height,
      class: "hb-line-chart-details-grid vertical"
    });
    const verticalLabelElement = appendSvgElement(detailsSvg, "text", {
      x: verticalX,
      y: detailsPlotRect.top + detailsPlotRect.height + 25,
      "text-anchor": "middle",
      class: "hb-line-chart-details-axis-label"
    });
    verticalLabelElement.textContent = formatHistoryTimestamp(verticalTime, hasMultiDayRange);
  }
  appendSvgElement(detailsSvg, "line", {
    x1: detailsPlotRect.left,
    y1: detailsPlotRect.top,
    x2: detailsPlotRect.left,
    y2: detailsPlotRect.top + detailsPlotRect.height,
    class: "hb-line-chart-details-axis"
  });
  appendSvgElement(detailsSvg, "line", {
    x1: detailsPlotRect.left,
    y1: detailsPlotRect.top + detailsPlotRect.height,
    x2: detailsPlotRect.left + detailsPlotRect.width,
    y2: detailsPlotRect.top + detailsPlotRect.height,
    class: "hb-line-chart-details-axis"
  });
  const axisTitleElement = appendSvgElement(detailsSvg, "text", {
    x: detailsPlotRect.left,
    y: 20,
    class: "hb-line-chart-details-axis-title"
  });
  axisTitleElement.textContent = detailsUnit || "数值";
  const detailsPath = smoothChartPath(detailsGeometry.points);
  appendSvgElement(detailsSvg, "path", {
    d:
      detailsPath +
      " L" +
      (detailsPlotRect.left + detailsPlotRect.width) +
      " " +
      (detailsPlotRect.top + detailsPlotRect.height) +
      " L" +
      detailsPlotRect.left +
      " " +
      (detailsPlotRect.top + detailsPlotRect.height) +
      " Z",
    fill: "url(#" + detailsGradientId + "-line)",
    opacity: 0.12,
    class: "hb-line-chart-details-fill"
  });
  appendSvgElement(detailsSvg, "path", {
    d: detailsPath,
    fill: "none",
    stroke: "url(#" + detailsGradientId + "-line)",
    "stroke-width": 2.4,
    pathLength: 100,
    "vector-effect": "non-scaling-stroke",
    class: "hb-line-chart-details-line"
  });
  const leadDotElement = appendSvgElement(detailsSvg, "circle", {
    cx: 0,
    cy: 0,
    r: 4.2,
    class: "hb-line-chart-details-lead-dot"
  });
  if (detailsContext.animate !== false) {
    appendSvgElement(leadDotElement, "animateMotion", {
      path: detailsPath,
      dur: "1.1s",
      begin: ".28s",
      fill: "freeze"
    });
  }
  detailsElement.cleanupLineChartHover = () => {};
  if (detailsContext.interactive !== false) {
    detailsElement.cleanupLineChartHover = attachChartTooltip(
      detailsSvg,
      detailsElement,
      detailsGeometry,
      detailsUnit,
      detailsMappedPoint => ({
        x: (detailsMappedPoint.x / detailsViewBoxWidth) * 100,
        y: (detailsMappedPoint.y / detailsViewBoxHeight) * 100
      }),
      detailsComponent.properties?.statePrecision,
      {
        start: detailsPlotRect.left / detailsViewBoxWidth,
        end: (detailsPlotRect.left + detailsPlotRect.width) / detailsViewBoxWidth
      },
      detailsElement
    );
  }
  return detailsElement;
}
registerComponent("panel-frame", {
  render(panelFrameComponent, panelFrameContext) {
    const panelFrameProperties = panelFrameComponent.properties || {};
    const panelFrameWidth = Math.max(20, Number(panelFrameComponent.position?.width || 528));
    const panelFrameHeight = Math.max(20, Number(panelFrameComponent.position?.height || 300));
    const panelEdgeWidth = clampNumber(panelFrameProperties.edgeWidth, 0, 20, 0.9);
    const panelInset = Math.max(0.5, panelEdgeWidth / 2 + 0.5);
    const panelInnerWidth = Math.max(1, panelFrameWidth - panelInset * 2);
    const panelInnerHeight = Math.max(1, panelFrameHeight - panelInset * 2);
    const panelCornerRadius =
      Math.min(panelInnerWidth, panelInnerHeight) *
      clampNumber(panelFrameProperties.radius, 0, 0.5, 0.195);
    const panelEdgeOpacity = clampNumber(panelFrameProperties.edgeOpacity, 0, 1, 1);
    const panelGlowStrength = clampNumber(panelFrameProperties.glowStrength, 0, 5, 0.5);
    const panelGlowSize = clampNumber(panelFrameProperties.glowSize, 0, 3, 1.5);
    const panelGlowStrokeWidth = Math.min(panelInnerWidth, panelInnerHeight) * 0.22 * panelGlowSize;
    const panelGlowBlur = Math.min(panelInnerWidth, panelInnerHeight) * 0.06 * panelGlowSize;
    const panelEdgeColor = resolveColor(panelFrameProperties.edgeColor, "#d4d4d4");
    const panelGlowColor = resolveColor(panelFrameProperties.glowColor, "#ffffff");
    const panelFrameId =
      (panelFrameContext.renderNamespace || "renderer") +
      "-frame-" +
      String(panelFrameComponent.id || "").replace(/[^a-z0-9_-]/gi, "");
    const panelFrameElement = document.createElement("div");
    panelFrameElement.className = "hb-panel-frame-component";
    const panelFrameSvg = appendSvgElement(panelFrameElement, "svg", {
      viewBox: "0 0 " + panelFrameWidth + " " + panelFrameHeight,
      preserveAspectRatio: "none",
      "aria-hidden": "true"
    });
    const panelFrameDefs = appendSvgElement(panelFrameSvg, "defs");
    const panelGlassGradient = appendSvgElement(panelFrameDefs, "linearGradient", {
      id: panelFrameId + "-glass",
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1
    });
    appendSvgElement(panelGlassGradient, "stop", {
      offset: 0,
      "stop-color": panelGlowColor,
      "stop-opacity": Math.min(0.35, panelGlowStrength * 0.035)
    });
    appendSvgElement(panelGlassGradient, "stop", {
      offset: 0.52,
      "stop-color": panelGlowColor,
      "stop-opacity": Math.min(0.12, panelGlowStrength * 0.01)
    });
    appendSvgElement(panelGlassGradient, "stop", {
      offset: 1,
      "stop-color": panelGlowColor,
      "stop-opacity": Math.min(0.25, panelGlowStrength * 0.025)
    });
    const panelEdgeGradient = appendSvgElement(panelFrameDefs, "linearGradient", {
      id: panelFrameId + "-edge",
      gradientUnits: "userSpaceOnUse",
      x1: 0,
      y1: panelFrameHeight / 2,
      x2: panelFrameWidth,
      y2: panelFrameHeight / 2,
      gradientTransform:
        "rotate(" +
        clampNumber(panelFrameProperties.edgeAngle, 0, 360, 45) +
        " " +
        panelFrameWidth / 2 +
        " " +
        panelFrameHeight / 2 +
        ")"
    });
    for (const [panelEdgeStopOffset, panelEdgeStopOpacity] of [
      [0, 0.96],
      [0.22, 0.72],
      [0.52, 0.3],
      [0.78, 0.66],
      [1, 0.42]
    ]) {
      appendSvgElement(panelEdgeGradient, "stop", {
        offset: panelEdgeStopOffset,
        "stop-color": panelEdgeColor,
        "stop-opacity": panelEdgeStopOpacity * panelEdgeOpacity
      });
    }
    const panelGlowGradient = appendSvgElement(panelFrameDefs, "linearGradient", {
      id: panelFrameId + "-glow",
      gradientUnits: "userSpaceOnUse",
      x1: 0,
      y1: panelFrameHeight / 2,
      x2: panelFrameWidth,
      y2: panelFrameHeight / 2,
      gradientTransform:
        "rotate(" +
        clampNumber(panelFrameProperties.glowAngle, 0, 360, 242) +
        " " +
        panelFrameWidth / 2 +
        " " +
        panelFrameHeight / 2 +
        ")"
    });
    for (const [panelGlowStopOffset, panelGlowStopOpacity] of [
      [0, 0.32],
      [0.42, 0.09],
      [0.72, 0.05],
      [1, 0.22]
    ]) {
      appendSvgElement(panelGlowGradient, "stop", {
        offset: panelGlowStopOffset,
        "stop-color": panelGlowColor,
        "stop-opacity": Math.min(1, panelGlowStopOpacity * panelGlowStrength)
      });
    }
    const panelClipPath = appendSvgElement(panelFrameDefs, "clipPath", {
      id: panelFrameId + "-clip"
    });
    appendSvgElement(panelClipPath, "rect", {
      x: panelInset,
      y: panelInset,
      width: panelInnerWidth,
      height: panelInnerHeight,
      rx: panelCornerRadius
    });
    const panelBlurFilter = appendSvgElement(panelFrameDefs, "filter", {
      id: panelFrameId + "-blur",
      x: "-35%",
      y: "-55%",
      width: "170%",
      height: "210%"
    });
    appendSvgElement(panelBlurFilter, "feGaussianBlur", {
      stdDeviation: panelGlowBlur
    });
    if (panelFrameProperties.glowVisible !== false) {
      const panelGlowGroup = appendSvgElement(panelFrameSvg, "g", {
        "clip-path": "url(#" + panelFrameId + "-clip)"
      });
      appendSvgElement(panelGlowGroup, "rect", {
        x: panelInset,
        y: panelInset,
        width: panelInnerWidth,
        height: panelInnerHeight,
        rx: panelCornerRadius,
        fill: "url(#" + panelFrameId + "-glass)"
      });
      if (panelGlowStrokeWidth > 0 && panelGlowStrength > 0) {
        appendSvgElement(panelGlowGroup, "rect", {
          x: panelInset,
          y: panelInset,
          width: panelInnerWidth,
          height: panelInnerHeight,
          rx: panelCornerRadius,
          fill: "none",
          stroke: "url(#" + panelFrameId + "-glow)",
          "stroke-width": panelGlowStrokeWidth,
          filter: "url(#" + panelFrameId + "-blur)"
        });
      }
    }
    if (panelFrameProperties.edgeVisible !== false) {
      appendSvgElement(panelFrameSvg, "rect", {
        x: panelInset,
        y: panelInset,
        width: panelInnerWidth,
        height: panelInnerHeight,
        rx: panelCornerRadius,
        fill: "none",
        stroke: "url(#" + panelFrameId + "-edge)",
        "stroke-width": panelEdgeWidth
      });
    }
    const panelTextLeft = clampNumber(panelFrameProperties.textLeft, -100, 200, 5.2);
    const panelTextTop = clampNumber(panelFrameProperties.textTop, -100, 200, 28);
    const panelMainTextX =
      (panelFrameWidth * clampNumber(panelFrameProperties.mainTextLeft, -100, 200, panelTextLeft)) /
      100;
    const panelMainTextY =
      (panelFrameHeight *
        clampNumber(
          panelFrameProperties.mainTextTop,
          -100,
          200,
          panelTextTop -
            (clampNumber(panelFrameProperties.lineGap, 0, 500, 24) / panelFrameHeight) * 100
        )) /
      100;
    const panelSecondaryTextX =
      (panelFrameWidth *
        clampNumber(panelFrameProperties.secondaryTextLeft, -100, 200, panelTextLeft)) /
      100;
    const panelSecondaryTextY =
      (panelFrameHeight *
        clampNumber(panelFrameProperties.secondaryTextTop, -100, 200, panelTextTop)) /
      100;
    const panelMainTextOpacity = clampNumber(panelFrameProperties.mainOpacity, 0, 1, 0.72);
    const panelSecondaryTextOpacity = clampNumber(
      panelFrameProperties.secondaryOpacity,
      0,
      1,
      0.36
    );
    if (panelFrameProperties.mainTextVisible !== false) {
      const panelMainTextElement = appendSvgElement(panelFrameSvg, "text", {
        x: panelMainTextX,
        y: panelMainTextY,
        "text-anchor": "start",
        fill: resolveColor(panelFrameProperties.mainColor, "#ffffff"),
        "fill-opacity": panelMainTextOpacity,
        "font-family": "PingFang SC,Noto Sans SC,Microsoft YaHei,sans-serif",
        "font-size": clampNumber(panelFrameProperties.mainSize, 8, 500, 30),
        "font-weight": 300,
        "letter-spacing": clampNumber(panelFrameProperties.mainSpacing, -20, 100, 2)
      });
      const panelMainTextStrokeWidth = clampNumber(panelFrameProperties.mainWeight, 0, 3, 0);
      if (panelMainTextStrokeWidth > 0) {
        Object.entries({
          stroke: resolveColor(panelFrameProperties.mainColor, "#ffffff"),
          "stroke-opacity": panelMainTextOpacity,
          "stroke-width": panelMainTextStrokeWidth,
          "paint-order": "stroke fill"
        }).forEach(([mainTextAttributeName, mainTextAttributeValue]) =>
          panelMainTextElement.setAttribute(mainTextAttributeName, mainTextAttributeValue)
        );
      }
      panelMainTextElement.textContent = String(panelFrameProperties.mainText || "");
    }
    if (panelFrameProperties.secondaryTextVisible !== false) {
      const panelSecondaryTextElement = appendSvgElement(panelFrameSvg, "text", {
        x: panelSecondaryTextX,
        y: panelSecondaryTextY,
        "text-anchor": "start",
        fill: resolveColor(panelFrameProperties.secondaryColor, "#ffffff"),
        "fill-opacity": panelSecondaryTextOpacity,
        "font-family": "Helvetica Neue,Arial,sans-serif",
        "font-size": clampNumber(panelFrameProperties.secondarySize, 6, 500, 15),
        "font-weight": 300,
        "letter-spacing": clampNumber(panelFrameProperties.secondarySpacing, -20, 100, 2.1)
      });
      const panelSecondaryTextStrokeWidth = clampNumber(
        panelFrameProperties.secondaryWeight,
        0,
        3,
        0
      );
      if (panelSecondaryTextStrokeWidth > 0) {
        Object.entries({
          stroke: resolveColor(panelFrameProperties.secondaryColor, "#ffffff"),
          "stroke-opacity": panelSecondaryTextOpacity,
          "stroke-width": panelSecondaryTextStrokeWidth,
          "paint-order": "stroke fill"
        }).forEach(([secondaryTextAttributeName, secondaryTextAttributeValue]) =>
          panelSecondaryTextElement.setAttribute(
            secondaryTextAttributeName,
            secondaryTextAttributeValue
          )
        );
      }
      panelSecondaryTextElement.textContent = String(panelFrameProperties.secondaryText || "");
    }
    return panelFrameElement;
  }
});
export function componentContentUnitsPx(unitComponent, unitContext) {
  const componentScale = Math.max(0.01, Number(unitContext?.document?.canvas?.componentScale || 1));
  return {
    width: Math.max(1, Number(unitComponent?.position?.width || 100)) / componentScale / 100,
    height: Math.max(1, Number(unitComponent?.position?.height || 100)) / componentScale / 100
  };
}
export function navigationContentUnitPx(navigationUnitComponent, navigationUnitContext) {
  return (
    (componentContentUnitsPx(navigationUnitComponent, navigationUnitContext).height * 100) / 64.36
  );
}
registerComponent("navigation-button", {
  render(navigationComponent, navigationContext) {
    const navigationProperties = navigationComponent.properties || {};
    const navigationButtonTargetPage =
      ["tap", "doubleTap", "hold"]
        .map(navigationActionName => navigationComponent.actions?.[navigationActionName])
        .find(navigationAction => navigationAction?.type === "navigate" && navigationAction.target)
        ?.target ||
      navigationProperties.targetPage ||
      "";
    const navigationBindingEntityId = navigationComponent.bindings?.entity?.entityId || "";
    const navigationButtonPreviewState =
      navigationContext.editable && ["off", "on"].includes(navigationContext.previewState)
        ? navigationContext.previewState
        : "auto";
    const isNavigationTargetEntityActive =
      !!navigationBindingEntityId &&
      !!isComponentEntityActive(
        navigationComponent,
        navigationBindingEntityId,
        navigationContext.states?.get(navigationBindingEntityId),
        navigationContext
      );
    const isNavigationButtonActive = navigationButtonIsActive({
      targetPage: navigationButtonTargetPage,
      currentPagePath: navigationContext.page?.path || "",
      entityId: navigationBindingEntityId,
      entityActive: isNavigationTargetEntityActive,
      previewState: navigationButtonPreviewState
    });
    const navigationTextOpacity = clampNumber(
      isNavigationButtonActive
        ? (navigationProperties.textActiveOpacity ?? navigationProperties.activeOpacity)
        : (navigationProperties.textIdleOpacity ?? navigationProperties.idleOpacity),
      0,
      1,
      isNavigationButtonActive ? 0.96 : 0.3
    );
    const navigationIconOpacity = clampNumber(
      isNavigationButtonActive
        ? (navigationProperties.iconActiveOpacity ?? navigationProperties.activeOpacity)
        : (navigationProperties.iconIdleOpacity ?? navigationProperties.idleOpacity),
      0,
      1,
      isNavigationButtonActive ? 0.96 : 0.3
    );
    const navigationButtonFrameOpacity = clampNumber(
      isNavigationButtonActive
        ? navigationProperties.frameActiveOpacity
        : navigationProperties.frameIdleOpacity,
      0,
      1,
      isNavigationButtonActive ? 0.98 : 0.48
    );
    const navigationButtonGlowStrength = clampNumber(
      isNavigationButtonActive
        ? navigationProperties.glowActiveStrength
        : navigationProperties.glowIdleStrength,
      0,
      5,
      isNavigationButtonActive ? 2.2 : 0.5
    );
    const navigationButtonGlowSize = clampNumber(
      isNavigationButtonActive
        ? navigationProperties.glowActiveSize
        : navigationProperties.glowIdleSize,
      0,
      3,
      isNavigationButtonActive ? 3 : 1.5
    );
    const navigationMainColor = resolveColor(navigationProperties.mainColor, "#e9edf0");
    const navigationSecondaryColor = resolveColor(navigationProperties.secondaryColor, "#e9edf0");
    const navigationLineHeightRatio = 100 / 64.36;
    const navigationUnitPx = navigationContentUnitPx(navigationComponent, navigationContext);
    const navigationTextLeft = clampNumber(navigationProperties.textLeft, -100, 200, 27.5);
    const navigationTextTop = clampNumber(navigationProperties.textTop, -100, 200, 81.5);
    const navigationMainLeft = clampNumber(
      navigationProperties.mainTextLeft,
      -100,
      200,
      navigationTextLeft
    );
    const navigationMainTop = clampNumber(
      navigationProperties.mainTextTop,
      -100,
      200,
      navigationTextTop - navigationLineHeightRatio * 18
    );
    const navigationSecondaryLeft = clampNumber(
      navigationProperties.secondaryTextLeft,
      -100,
      200,
      navigationTextLeft
    );
    const navigationSecondaryTop = clampNumber(
      navigationProperties.secondaryTextTop,
      -100,
      200,
      navigationTextTop
    );
    const navigationElement = document.createElement("div");
    navigationElement.className =
      "hb-navigation-button" + (isNavigationButtonActive ? " active" : "");
    navigationElement.dataset.targetPage = navigationButtonTargetPage;
    navigationElement.style.setProperty("--navigation-text-opacity", String(navigationTextOpacity));
    navigationElement.style.setProperty("--navigation-icon-opacity", String(navigationIconOpacity));
    navigationElement.style.setProperty(
      "--navigation-icon-size",
      clampNumber(navigationProperties.iconSize, 1, 500, 50) * navigationUnitPx + "px"
    );
    navigationElement.style.setProperty(
      "--navigation-icon-left",
      clampNumber(navigationProperties.iconLeft, -100, 200, 14) + "%"
    );
    navigationElement.style.setProperty(
      "--navigation-icon-top",
      clampNumber(navigationProperties.iconTop, -100, 200, 50) + "%"
    );
    navigationElement.style.setProperty(
      "--navigation-main-size",
      clampNumber(navigationProperties.mainSize, 1, 500, 30) * navigationUnitPx + "px"
    );
    navigationElement.style.setProperty(
      "--navigation-secondary-size",
      clampNumber(navigationProperties.secondarySize, 1, 500, 11) * navigationUnitPx + "px"
    );
    navigationElement.style.setProperty(
      "--navigation-main-spacing",
      clampNumber(navigationProperties.mainSpacing, -20, 100, 8) * navigationUnitPx + "px"
    );
    navigationElement.style.setProperty(
      "--navigation-secondary-spacing",
      clampNumber(navigationProperties.secondarySpacing, -20, 100, 3) * navigationUnitPx + "px"
    );
    navigationElement.style.setProperty("--navigation-main-left", navigationMainLeft + "%");
    navigationElement.style.setProperty(
      "--navigation-secondary-left",
      navigationSecondaryLeft + "%"
    );
    navigationElement.style.setProperty("--navigation-main-top", navigationMainTop + "%");
    navigationElement.style.setProperty("--navigation-secondary-top", navigationSecondaryTop + "%");
    if (navigationProperties.glowVisible !== false || navigationProperties.frameVisible !== false) {
      navigationElement.append(
        buildNavigationEffects(
          navigationComponent,
          navigationProperties,
          isNavigationButtonActive,
          navigationButtonFrameOpacity,
          navigationButtonGlowStrength,
          navigationButtonGlowSize
        )
      );
    }
    if (navigationProperties.iconVisible !== false) {
      const navigationIconSource = resolveIconUrl(
        navigationProperties.icon || "mdi:home-lightbulb-outline"
      );
      if (navigationIconSource) {
        const navigationIconElement = document.createElement("i");
        navigationIconElement.className = "hb-navigation-icon";
        navigationIconElement.setAttribute("aria-hidden", "true");
        navigationIconElement.style.backgroundColor = resolveColor(
          navigationProperties.iconColor,
          "#e9edf0"
        );
        navigationIconElement.style.maskImage = 'url("' + navigationIconSource + '")';
        navigationIconElement.style.webkitMaskImage = 'url("' + navigationIconSource + '")';
        navigationElement.append(navigationIconElement);
      }
    }
    const navigationTextElement = document.createElement("span");
    navigationTextElement.className = "hb-navigation-text";
    if (navigationProperties.mainTextVisible !== false) {
      const navigationMainTextElement = document.createElement("strong");
      navigationMainTextElement.textContent = navigationProperties.mainText || "页面导航";
      navigationMainTextElement.style.color = navigationMainColor;
      navigationMainTextElement.style.webkitTextStrokeColor = navigationMainColor;
      navigationMainTextElement.style.webkitTextStrokeWidth =
        clampNumber(navigationProperties.mainWeight, 0, 3, 0) * navigationUnitPx + "px";
      navigationTextElement.append(navigationMainTextElement);
    }
    if (navigationProperties.secondaryTextVisible !== false) {
      const navigationSecondaryTextElement = document.createElement("small");
      navigationSecondaryTextElement.textContent =
        navigationProperties.secondaryText || "NAVIGATION";
      navigationSecondaryTextElement.style.color = navigationSecondaryColor;
      navigationSecondaryTextElement.style.webkitTextStrokeColor = navigationSecondaryColor;
      navigationSecondaryTextElement.style.webkitTextStrokeWidth =
        clampNumber(navigationProperties.secondaryWeight, 0, 3, 0) * navigationUnitPx + "px";
      navigationTextElement.append(navigationSecondaryTextElement);
    }
    if (navigationTextElement.childElementCount) {
      navigationElement.append(navigationTextElement);
    }
    return navigationElement;
  }
});
