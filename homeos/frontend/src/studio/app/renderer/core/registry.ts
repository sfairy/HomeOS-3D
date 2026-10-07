import { createVacuumMapImageLoader } from "./vacuum-map-state";
import { renderFlowLine } from "./registry/flow-line";
import { bindSceneMode } from "./scene-mode";
import { renderPercentageBarControl } from "./registry/percentage-bar";
import { EntityRequestPolicy } from "./runtime-caches";
import { randomUuid } from "../../utils/random-id";
import {
  climateDefaultIcon,
  climateEffectMode,
  climateIsPoweredOn,
  climateModeLabel,
  climatePresentationMode,
  normalizeClimateCapabilities,
  resolveClimateDeviceType,
} from "../controls/climate";
import { entityPowerIsOn } from "./entity-power";
import { lightRealtimeCapabilities } from "../controls/light-runtime";
import { renderInteraction3d } from "../../bridge/bridge";
import {
  EventLogWallBuffer,
  buildEventLogFingerprint,
  createEventLogEntry,
  eventLogWallEntityName,
  isEventLogWallDomain,
  resolveEntityStateChangeMessage,
  resolveStateSnapshot,
} from "../controls/event-log-runtime";
/** 渲染环境 / 属性袋：由 renderer 按组件类型动态组装（states、editable、document、cleanup、callEntityService、airflow* …），registry 侧只读取其中的可选字段； */
type RenderPropertyBag = any;
/** 渲染期直接挂在 DOM 元素上的组件控制器钩子（renderer.ts 的 ComponentControllerHooks未导出，这里按同样的「全部可选」写法声明 registry 用到的键）。 */
type ComponentControllerHooks = {
  syncFloorplanAutoDiagramState?: () => void;
  hbSyncVacuumMap?: () => void;
  syncLineChartState?: (...stateArgs: any[]) => any;
  cleanupLineChartHover?: () => void;
  pushEvent?: (...eventArgs: any[]) => any;
};
/** hls.js 运行时：外部脚本注入 window.Hls，vite-env.d.ts 的 Window 只有索引签名，这里按本文件实际用到的 API 补一份局部类型。 */
type HlsRuntime = {
  isSupported?: () => boolean;
  Events: {
    MEDIA_ATTACHED: string;
    MANIFEST_PARSED: string;
    ERROR: string;
  };
  new (hlsPlayerConfig?: {
    lowLatencyMode?: boolean;
    backBufferLength?: number;
    maxBufferLength?: number;
  }): {
    on: (hlsEventName: string, hlsEventHandler: (...hlsEventArgs: any[]) => void) => void;
    loadSource: (hlsSourceUrl: string) => void;
  };
};
const rendererByComponentType = new Map();
(registerComponent("interaction3d", {
  render: renderInteraction3d,
}),
  registerComponent("flow-line", {
    render: renderFlowLine,
  }));
const versionByAssetId = new Map(),
  urlByAssetId = new Map(),
  effectVariantByAssetId = new Map();
export function setBuiltinAssetVersions(assetVersionEntries: any[] = []) {
  const stagedVersionByAssetId = new Map(),
    stagedUrlByAssetId = new Map(),
    stagedVariantByAssetId = new Map();
  for (const assetVersionEntry of assetVersionEntries || []) {
    const assetId = String(assetVersionEntry?.assetId || "");
    if (!assetId) continue;
    const assetVersion = String(assetVersionEntry.version || "");


    (stagedVersionByAssetId.set(assetId, assetVersion),
      assetVersionEntry.url && stagedUrlByAssetId.set(assetId, String(assetVersionEntry.url)));
    const effectVariant = assetVersionEntry.effectVariant || {},
      originalWidth = Number(effectVariant.originalWidth || 0),
      originalHeight = Number(effectVariant.originalHeight || 0),
      cropX = Number(effectVariant.cropX),
      cropY = Number(effectVariant.cropY),
      cropWidth = Number(effectVariant.width || 0),
      cropHeight = Number(effectVariant.height || 0);
    String(effectVariant.url || "").startsWith("/api/v1/assets/effect-variant?") &&
      originalWidth > 0 &&
      originalHeight > 0 &&
      Number.isFinite(cropX) &&
      Number.isFinite(cropY) &&
      cropX >= 0 &&
      cropY >= 0 &&
      cropWidth > 0 &&
      cropHeight > 0 &&
      cropX + cropWidth <= originalWidth &&
      cropY + cropHeight <= originalHeight &&
      stagedVariantByAssetId.set(assetId, {
        url: String(effectVariant.url),
        originalWidth: originalWidth,
        originalHeight: originalHeight,
        cropX: cropX,
        cropY: cropY,
        width: cropWidth,
        height: cropHeight,
      });
  }
  if (!(
    stagedVersionByAssetId.size !== versionByAssetId.size ||
    [...stagedVersionByAssetId].some(
      ([versionCheckAssetId, committedVersion]) =>
        versionByAssetId.get(versionCheckAssetId) !== committedVersion,
    ) ||
    stagedUrlByAssetId.size !== urlByAssetId.size ||
    [...stagedUrlByAssetId].some(
      ([urlCheckAssetId, committedUrl]) => urlByAssetId.get(urlCheckAssetId) !== committedUrl,
    ) ||
    stagedVariantByAssetId.size !== effectVariantByAssetId.size ||
    [...stagedVariantByAssetId].some(
      ([variantCheckAssetId, committedVariant]) =>
        JSON.stringify(effectVariantByAssetId.get(variantCheckAssetId)) !==
        JSON.stringify(committedVariant),
    )
  ))
    return false;
  versionByAssetId.clear();
  for (const [versionAssignmentKey, versionAssignmentValue] of stagedVersionByAssetId)
    versionByAssetId.set(versionAssignmentKey, versionAssignmentValue);
  urlByAssetId.clear();
  for (const [urlAssignmentKey, urlAssignmentValue] of stagedUrlByAssetId)
    urlByAssetId.set(urlAssignmentKey, urlAssignmentValue);
  effectVariantByAssetId.clear();
  for (const [variantAssignmentKey, variantAssignmentValue] of stagedVariantByAssetId)
    effectVariantByAssetId.set(variantAssignmentKey, variantAssignmentValue);
  return true;
}
function registerComponent(componentType: any, componentDefinition: any) {
  rendererByComponentType.set(componentType, componentDefinition);
}
export function renderRegisteredComponent(componentProps: any, renderEnvironment: any) {
  const registeredRenderer = rendererByComponentType.get(componentProps.type);
  if (registeredRenderer) return registeredRenderer.render(componentProps, renderEnvironment);
  const unknownComponentBox = document.createElement("div");
  unknownComponentBox.className = "hb-unknown-component";
  const unknownComponentTitle = document.createElement("strong");
  unknownComponentTitle.textContent = "控件尚未实现";
  const unknownComponentTypeElement = document.createElement("span");
  return (
    (unknownComponentTypeElement.textContent = componentProps.type),
    unknownComponentBox.append(unknownComponentTitle, unknownComponentTypeElement),
    unknownComponentBox
  );
}
function resolveAssetSource(assetKey: any) {
  const normalizedAssetKey = String(assetKey || "");
  if (urlByAssetId.has(normalizedAssetKey)) return urlByAssetId.get(normalizedAssetKey);
  if (normalizedAssetKey.startsWith("studio3d:")) {
    const studio3dPartSegments = normalizedAssetKey.slice(9).split("/");
    return studio3dPartSegments.length !== 2 || !studio3dPartSegments[0] || !studio3dPartSegments[1]
      ? ""
      : "/api/v1/assets/studio3d-export/" +
          encodeURIComponent(studio3dPartSegments[0]) +
          "/" +
          encodeURIComponent(studio3dPartSegments[1]);
  }
  if (normalizedAssetKey.startsWith("user:")) {
    const userAssetId = normalizedAssetKey.slice(5);
    return /^[0-9a-f]{32}$/.test(userAssetId) ? "/api/v1/assets/user/" + userAssetId : "";
  }
  if (!normalizedAssetKey.startsWith("builtin:")) return "";


  const normalizedBuiltinPath = normalizedAssetKey
    .slice(8)
    .split("/")
    .filter(Boolean)
    .map((pathSegment) => encodeURIComponent(pathSegment))
    .join("/");
  if (!normalizedBuiltinPath) return "";
  const builtinAssetVersion = versionByAssetId.get(normalizedAssetKey) || "";
  return (
    "/assets/builtin/" +
    normalizedBuiltinPath +
    (builtinAssetVersion ? "?v=" + encodeURIComponent(builtinAssetVersion) : "")
  );
}
export function staticAssetImageSource(assetSourceRef: any) {
  return resolveAssetSource(assetSourceRef);
}
function clampNumber(rawNumber: any, lowerBound: any, upperBound: any, fallbackNumber: any) {
  const finiteCandidate = Number(rawNumber);
  return Math.max(
    lowerBound,
    Math.min(upperBound, Number.isFinite(finiteCandidate) ? finiteCandidate : fallbackNumber),
  );
}
function normalizeCssColor(colorInput: any, fallbackColor: any) {
  const trimmedColor = String(colorInput || "").trim();
  return /^(#[\da-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\))$/i.test(trimmedColor)
    ? trimmedColor
    : fallbackColor;
}
function applyTextOutline(textElement: any, fontWeightInput: any, fontSizeInput: any) {
  const numericWeight = Number(fontWeightInput),
    strokeRatio =
      Number.isFinite(numericWeight) && numericWeight > 1
        ? clampNumber((numericWeight - 1) / 899, 0, 1, 0.4)
        : clampNumber(numericWeight, 0, 1, 0.4),
    fontSizePixels = Math.max(1, Number(fontSizeInput || 16)),
    strokeWidthPixels = strokeRatio * fontSizePixels * 0.05;
  ((textElement.style.fontWeight = "100"),
    (textElement.style.webkitTextStroke = strokeWidthPixels.toFixed(3) + "px currentColor"),
    (textElement.style.paintOrder = "stroke fill"));
}
function resolveMdiIconUrl(iconName: any) {
  const normalizedIconName = String(iconName || "")
    .trim()
    .replace(/^mdi:/, "");
  return /^[a-z0-9-]+$/.test(normalizedIconName)
    ? "/static/vendor/mdi/7.4.47/svg/" + normalizedIconName + ".svg"
    : "";
}
function isActiveStateText(statePayload: any) {
  const stateText = String(statePayload?.state ?? statePayload?.newState?.state ?? "")
    .trim()
    .toLowerCase();
  return ["on", "open", "true", "home"].includes(stateText);
}
const COVER_POSITION_THRESHOLD = 1;
function isCoverMotorReversed(component: any) {
  return component?.properties?.coverMotorDirection === "reversed";
}
export function coverComponentIsDream(
  dreamComponent: any,
  dreamEntityId = "",
  dreamStatePayload: any = null,
  entityMetadataMap = new Map(),
) {
  const coverKind = dreamComponent?.properties?.coverKind;
  if (coverKind === "dream") return true;
  if (["standard", "airer"].includes(coverKind)) return false;
  const dreamEntityState = resolveStatePayload(dreamStatePayload) || {},
    supportedFeatures = Number(dreamEntityState.attributes?.supported_features || 0),
    entityMetadataEntry = entityMetadataMap?.get?.(dreamEntityId) || {},
    nameSearchText =
      dreamEntityId +
      " " +
      (dreamEntityState.attributes?.friendly_name || "") +
      " " +
      (entityMetadataEntry.name || "") +
      " " +
      (entityMetadataEntry.originalName || "");
  return (
    Number.isFinite(Number(dreamEntityState.attributes?.current_tilt_position)) ||
    !!(supportedFeatures & 240) ||
    /梦幻|竖帘|垂直帘|百叶|(^|[._-])novo([._-]|$)/i.test(nameSearchText)
  );
}
function isCoverActiveState(
  coverComponent: any,
  coverStateEntityId: any,
  coverStatePayload: any,
  coverRenderEnvironment: any,
) {
  const coverEntityState = resolveStatePayload(coverStatePayload) || {},
    coverStateText = String(coverEntityState.state || "")
      .trim()
      .toLowerCase(),
    isPositionReversed = isCoverMotorReversed(coverComponent),
    coverDirectionState =
      (isPositionReversed &&
        {
          open: "closed",
          closed: "open",
          opening: "closing",
          closing: "opening",
        }[coverStateText]) ||
      coverStateText;
  if (coverDirectionState === "opening") return true;
  if (coverDirectionState === "closing") return false;
  if (
    coverComponentIsDream(
      coverComponent,
      coverStateEntityId,
      coverEntityState,
      coverRenderEnvironment.entityMetadata,
    )
  )
    return coverDirectionState === "open";
  const currentPosition = Number(coverEntityState.attributes?.current_position);
  return Number.isFinite(currentPosition)
    ? (isPositionReversed ? 100 - currentPosition : currentPosition) > COVER_POSITION_THRESHOLD
    : isPositionReversed
      ? !isActiveStateText(coverEntityState)
      : isActiveStateText(coverEntityState);
}
function coverComponentIsActive(
  coverActiveComponent: any,
  coverActiveEntityId: any,
  coverActiveStatePayload: any,
  coverActiveRenderEnvironment: Record<string, any> = {},
) {
  return isCoverActiveState(
    coverActiveComponent,
    coverActiveEntityId,
    coverActiveStatePayload,
    coverActiveRenderEnvironment,
  );
}
function isEntityComponentActive(
  activeComponent: any,
  runtimeEntityIdCandidate: any,
  inlineStatePayload: any,
  activeRenderEnvironment: RenderPropertyBag = {},
) {
  if (String(runtimeEntityIdCandidate || "").startsWith("cover."))
    return coverComponentIsActive(
      activeComponent,
      runtimeEntityIdCandidate,
      inlineStatePayload,
      activeRenderEnvironment,
    );
  const runtimeEntityId = String(
      activeComponent?.properties?.runtimePowerEntityId || runtimeEntityIdCandidate,
    ),
    runtimeStatePayload =
      runtimeEntityId === runtimeEntityIdCandidate
        ? inlineStatePayload
        : activeRenderEnvironment.states?.get(runtimeEntityId);
  return entityPowerIsOn(runtimeEntityId, runtimeStatePayload, activeComponent);
}
function resolveStatePayload(rawStatePayload: any) {
  return rawStatePayload?.newState || rawStatePayload || null;
}
export function iconButtonEffectLightVisualAwaiting(
  awaitingComponent: any,
  awaitingRenderEnvironment: RenderPropertyBag = {},
) {
  const awaitingProperties = awaitingComponent?.properties || {},
    awaitingEntityId = String(awaitingComponent?.bindings?.entity?.entityId || "");
  if (!(
    !awaitingRenderEnvironment.editable &&
    awaitingEntityId.startsWith("light.") &&
    (awaitingProperties.effectBrightnessRealtime !== false ||
      awaitingProperties.effectColorTemperatureRealtime !== false)
  ))
    return false;
  const awaitingEntityState = resolveStatePayload(
      awaitingRenderEnvironment.states?.get?.(awaitingEntityId),
    ),
    awaitingStateText = String(awaitingEntityState?.state || "").toLowerCase();
  if (
    !awaitingEntityState ||
    awaitingStateText === "unknown" ||
    awaitingStateText === "unavailable"
  )
    return true;
  if (
    awaitingRenderEnvironment.pendingOptimisticState?.desiredActive === true ||
    awaitingStateText !== "on"
  )
    return false;
  const awaitingAttributes = awaitingEntityState.attributes || {},
    awaitingRealtimeCapabilities = lightRealtimeCapabilities(awaitingEntityId, awaitingEntityState),
    hasRealtimeCapability = (capabilityName: any) =>
      awaitingAttributes[capabilityName] !== null &&
      awaitingAttributes[capabilityName] !== undefined &&
      awaitingAttributes[capabilityName] !== "" &&
      Number.isFinite(Number(awaitingAttributes[capabilityName]));
  if (
    awaitingProperties.effectBrightnessRealtime !== false &&
    awaitingRealtimeCapabilities.brightness &&
    !hasRealtimeCapability("brightness")
  )
    return true;
  const supportedColorModes = Array.isArray(awaitingAttributes.supported_color_modes)
      ? awaitingAttributes.supported_color_modes.map((colorModeEntry: any) =>
          String(colorModeEntry || "").toLowerCase(),
        )
      : [],
    activeColorMode = String(awaitingAttributes.color_mode || "").toLowerCase(),
    hasColorTemperatureMode =
      activeColorMode === "color_temp" ||
      (!activeColorMode &&
        supportedColorModes.length === 1 &&
        supportedColorModes[0] === "color_temp");
  return !!(
    awaitingProperties.effectColorTemperatureRealtime !== false &&
    awaitingRealtimeCapabilities.colorTemperature &&
    hasColorTemperatureMode &&
    !hasRealtimeCapability("color_temp_kelvin") &&
    !hasRealtimeCapability("color_temp")
  );
}
export function vacuumMapImageSource(vacuumMapEntityId: any, vacuumMapState: any = null) {
  const vacuumEntityState = resolveStatePayload(vacuumMapState) || {},
    vacuumMapStamp = String(
      vacuumEntityState.updatedAt ||
        vacuumEntityState.lastChanged ||
        vacuumEntityState.state ||
        "initial",
    );
  return (
    "/api/image_proxy/" +
    encodeURIComponent(String(vacuumMapEntityId || "")) +
    "?hb=" +
    encodeURIComponent(vacuumMapStamp)
  );
}
import {
  lightStatisticsEntityStateStatus,
  lightStatisticsEntitySupport,
  lightStatisticsSummary,
} from "../controls/light-statistics-runtime";
import {
  automaticNumericPrecision,
  formatLineChartValue,
  formatNumericValue,
  lineChartGeometry,
  normalizedStatePrecision,
} from "../controls/line-chart-runtime";
import {
  doorWindowPerspectiveCorners,
  doorWindowPerspectiveMatrix,
} from "../controls/door-window-runtime";
import {
  automaticThresholds,
  meteoconUrl,
  normalizedThresholds,
  resolvedThresholds,
  smoothChartPath,
  thresholdColor,
  weatherVisual,
} from "../controls/weather-chart-runtime";
import {
  formatLocalDate,
  formatLocalTime,
  formatLunarDate,
} from "../controls/date-time-runtime";
export {
  lightStatisticsEntityStateStatus,
  lightStatisticsEntitySupport,
  lightStatisticsSummary,
  automaticNumericPrecision,
  formatLineChartValue,
  formatNumericValue,
  lineChartGeometry,
  normalizedStatePrecision,
  doorWindowPerspectiveCorners,
  doorWindowPerspectiveMatrix,
  meteoconUrl,
  automaticThresholds,
  normalizedThresholds,
  resolvedThresholds,
  smoothChartPath,
  thresholdColor,
  weatherVisual,
  formatLocalDate,
  formatLocalTime,
  formatLunarDate,
};
import {
  formatPresenceDuration,
  presenceAnimationPhase,
  presenceHistoryBuckets,
  presenceMotionEventConfig,
  presenceSensorPresentation,
  presenceStateTimestamp,
} from "../controls/presence-runtime";
export {
  formatPresenceDuration,
  presenceAnimationPhase,
  presenceHistoryBuckets,
  presenceMotionEventConfig,
  presenceSensorPresentation,
  presenceStateTimestamp,
};
function resolveEntityIcon(iconEntityId: any, iconStatePayload: any) {
  const explicitIconName = String(
    resolveStatePayload(iconStatePayload)?.attributes?.icon || "",
  ).trim();
  if (explicitIconName) return explicitIconName;
  const entityDomainPrefix = String(iconEntityId || "").split(".")[0];
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
      water_heater: "mdi:water-boiler",
    }[entityDomainPrefix] || "mdi:devices"
  );
}
function formatEntityState(
  formattedStatePayload: any,
  formattedEntityId = "",
  formattingEnvironment: RenderPropertyBag = {},
) {
  const formattedEntityState = resolveStatePayload(formattedStatePayload);
  if (!formattedEntityState) return "等待实体状态";
  const formattedStateText = String(formattedEntityState.state ?? "").trim(),
    formattedMetadata = formattingEnvironment.entityMetadata?.get?.(formattedEntityId) || {},
    platformIdentifier = String(formattedMetadata.platform || "").trim(),
    domainIdentifier = String(
      formattedMetadata.domain || formattedEntityId.split(".")[0] || "",
    ).trim(),
    entityTranslationKey = String(formattedMetadata.translationKey || "").trim(),
    platformTranslationKey =
      platformIdentifier && domainIdentifier && entityTranslationKey && formattedStateText
        ? "component." +
          platformIdentifier +
          ".entity." +
          domainIdentifier +
          "." +
          entityTranslationKey +
          ".state." +
          formattedStateText
        : "",
    deviceClassKey = String(formattedEntityState.attributes?.device_class || "").trim(),
    deviceClassTranslationKey =
      domainIdentifier && deviceClassKey && formattedStateText
        ? "component." +
          domainIdentifier +
          ".entity_component." +
          deviceClassKey +
          ".state." +
          formattedStateText
        : "",
    translatedStateText = String(
      (platformTranslationKey
        ? formattingEnvironment.entityTranslations?.[platformTranslationKey]
        : "") ||
        (deviceClassTranslationKey
          ? formattingEnvironment.entityTranslations?.[deviceClassTranslationKey]
          : "") ||
        "",
    ).trim(),
    localizedStateLabel =
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
        paused: "已暂停",
      }[formattedStateText.toLowerCase()] ||
      formattedStateText ||
      "未知",
    reversedCoverLabel =
      String(formattedEntityId || "").startsWith("cover.") &&
      isCoverMotorReversed(formattingEnvironment.component)
        ? {
            open: "关闭",
            closed: "打开",
            opening: "正在关闭",
            closing: "正在打开",
          }[formattedStateText.toLowerCase()]
        : "",
    numericStateValue = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(formattedStateText)
      ? Number(formattedStateText)
      : Number.NaN,
    formattedStateValue = Number.isFinite(numericStateValue)
      ? formatNumericValue(
          numericStateValue,
          formattingEnvironment.component?.properties?.statePrecision,
        )
      : reversedCoverLabel || translatedStateText || localizedStateLabel,
    stateUnit = String(formattedEntityState.attributes?.unit_of_measurement || "").trim();
  return stateUnit && !["不可用", "未知"].includes(formattedStateValue)
    ? formattedStateValue + " " + stateUnit
    : formattedStateValue;
}
function isCoverAuthoredActive(authoredComponent: any, authoredRenderEnvironment: any) {
  if (authoredRenderEnvironment.editable && authoredRenderEnvironment.previewState === "on")
    return true;
  if (authoredRenderEnvironment.editable && authoredRenderEnvironment.previewState === "off")
    return false;
  const authoredEntityId = authoredComponent.bindings?.entity?.entityId || "";
  return !!(
    authoredEntityId &&
    isEntityComponentActive(
      authoredComponent,
      authoredEntityId,
      authoredRenderEnvironment.states?.get(authoredEntityId),
      authoredRenderEnvironment,
    )
  );
}
const ICON_BUTTON_EFFECT_BASE_TEMPERATURE_KELVIN = 3500;
function brightnessToOpacity(brightnessPercent: any) {
  if (
    brightnessPercent == null ||
    brightnessPercent === "" ||
    !Number.isFinite(Number(brightnessPercent))
  )
    return 1;
  const normalizedBrightnessRatio = Math.max(0, Math.min(1, Number(brightnessPercent) / 100));
  return normalizedBrightnessRatio <= 0 ? 0 : 0.2 + normalizedBrightnessRatio * 0.8;
}
function resolveColorTemperature(lightAttributes: RenderPropertyBag = {}) {
  const kelvinValue = Number(lightAttributes.color_temp_kelvin);
  if (Number.isFinite(kelvinValue) && kelvinValue > 0) return kelvinValue;
  const miredValue = Number(lightAttributes.color_temp);
  return Number.isFinite(miredValue) && miredValue > 0 ? 1000000 / miredValue : null;
}
export function iconButtonEffectLightVisualState(
  effectLightComponent: any,
  effectLightRenderEnvironment: RenderPropertyBag = {},
) {
  const effectLightEntityId = String(effectLightComponent?.bindings?.entity?.entityId || ""),
    effectLightAttributes =
      resolveStatePayload(effectLightRenderEnvironment.states?.get?.(effectLightEntityId))
        ?.attributes || {};
  if (!effectLightEntityId.startsWith("light."))
    return {
      brightnessPercent: null as any,
      colorTemperatureKelvin: null as any,
      opacity: 1,
      filter: "none",
    };
  const rawBrightness = effectLightAttributes.brightness,
    brightnessNumber =
      rawBrightness == null || rawBrightness === "" ? Number.NaN : Number(rawBrightness),
    brightnessPercentValue = Number.isFinite(brightnessNumber)
      ? Math.max(0, Math.min(100, (brightnessNumber / 255) * 100))
      : null,
    effectKelvinValue = resolveColorTemperature(effectLightAttributes),
    effectLightProperties = effectLightComponent?.properties || {},
    isBrightnessRealtimeEnabled = effectLightProperties.effectBrightnessRealtime !== false,
    isColorTemperatureRealtimeEnabled =
      effectLightProperties.effectColorTemperatureRealtime !== false,
    effectOpacity = isBrightnessRealtimeEnabled ? brightnessToOpacity(brightnessPercentValue) : 1;
  if (!isColorTemperatureRealtimeEnabled || !Number.isFinite(effectKelvinValue))
    return {
      brightnessPercent: brightnessPercentValue,
      colorTemperatureKelvin: null as any,
      opacity: effectOpacity,
      filter: "none",
    };
  const warmGlowWeight = Math.max(
      0,
      Math.min(1, (ICON_BUTTON_EFFECT_BASE_TEMPERATURE_KELVIN - effectKelvinValue!) / 1500),
    ),
    coolGlowWeight = Math.max(
      0,
      Math.min(1, (effectKelvinValue! - ICON_BUTTON_EFFECT_BASE_TEMPERATURE_KELVIN) / 3000),
    ),
    saturationFactor = 1 + warmGlowWeight * 0.95 - coolGlowWeight * 0.55;
  return {
    brightnessPercent: brightnessPercentValue,
    colorTemperatureKelvin: effectKelvinValue,
    opacity: effectOpacity,
    filter: "saturate(" + saturationFactor.toFixed(3) + ")",
  };
}
function isCoverComponentActive(toggleComponent: any, toggleRenderEnvironment: any) {
  if (toggleRenderEnvironment.editable && toggleRenderEnvironment.previewState === "on")
    return true;
  if (toggleRenderEnvironment.editable && toggleRenderEnvironment.previewState === "off")
    return false;
  const toggleEntityId = toggleComponent.bindings?.entity?.entityId || "";
  return !!(
    toggleEntityId &&
    isEntityComponentActive(
      toggleComponent,
      toggleEntityId,
      toggleRenderEnvironment.states?.get(toggleEntityId),
      toggleRenderEnvironment,
    )
  );
}
function resolveClimateEffectMode(climateComponent: any, climateRenderEnvironment: any) {
  const climateEntityId = climateComponent.bindings?.entity?.entityId || "",
    climateEntityState = resolveStatePayload(climateRenderEnvironment.states?.get(climateEntityId)),
    climateDeviceType = resolveClimateDeviceType(
      climateComponent,
      climateEntityState,
      climateEntityId,
    );
  return climateRenderEnvironment.editable && climateRenderEnvironment.previewState === "on"
    ? climateDeviceType === "bath-heater"
      ? "heat"
      : "cool"
    : climateRenderEnvironment.editable && climateRenderEnvironment.previewState === "off"
      ? "off"
      : climatePresentationMode(climateEntityState, climateDeviceType).toLowerCase();
}
function isClimatePoweredOn(climatePowerComponent: any, climatePowerRenderEnvironment: any) {
  if (climatePowerRenderEnvironment.editable && climatePowerRenderEnvironment.previewState === "on")
    return true;
  if (
    climatePowerRenderEnvironment.editable &&
    climatePowerRenderEnvironment.previewState === "off"
  )
    return false;
  const climatePowerEntityId = climatePowerComponent.bindings?.entity?.entityId || "",
    climatePowerState = resolveStatePayload(
      climatePowerRenderEnvironment.states?.get(climatePowerEntityId),
    );
  return climateIsPoweredOn(
    climatePowerState,
    resolveClimateDeviceType(climatePowerComponent, climatePowerState, climatePowerEntityId),
  );
}
function resolveAirflowMotionKind(airflowComponent: any, airflowRenderEnvironment: any) {
  const airflowEntityId = airflowComponent.bindings?.entity?.entityId || "",
    airflowEntityState = resolveStatePayload(airflowRenderEnvironment.states?.get(airflowEntityId)),
    airflowDeviceType = resolveClimateDeviceType(
      airflowComponent,
      airflowEntityState,
      airflowEntityId,
    );
  return airflowRenderEnvironment.editable && airflowRenderEnvironment.previewState === "on"
    ? "cool"
    : airflowRenderEnvironment.editable && airflowRenderEnvironment.previewState === "off"
      ? "off"
      : climateEffectMode(airflowEntityState, airflowDeviceType);
}
function formatClimateStateLabel(labelComponent: any, labelRenderEnvironment: any) {
  const labelEntityId = labelComponent.bindings?.entity?.entityId || "",
    labelEntityState = resolveStatePayload(labelRenderEnvironment.states?.get(labelEntityId)),
    climateModeKey = resolveClimateEffectMode(labelComponent, labelRenderEnvironment),
    labelDeviceType = resolveClimateDeviceType(labelComponent, labelEntityState, labelEntityId),
    climateModeText = climateModeLabel(climateModeKey, labelDeviceType);
  if (!isClimatePoweredOn(labelComponent, labelRenderEnvironment)) return climateModeText;
  const climateCapabilities = normalizeClimateCapabilities(labelEntityState);
  return climateCapabilities.targetTemperature !== null
    ? climateModeText + " · " + climateCapabilities.targetTemperature + "°C"
    : climateCapabilities.currentTemperature !== null
      ? climateModeText + " · " + climateCapabilities.currentTemperature + "°C"
      : climateModeText;
}
function buildAirflowSvg(airflowProperties: RenderPropertyBag = {}, airflowModeKind = "other") {
  const airflowMotionKind = airflowProperties.airflowMotion === "static" ? "static" : "dynamic",
    airflowColor =
      airflowModeKind === "cool"
        ? normalizeCssColor(airflowProperties.airflowCoolColor, "#73c8ff")
        : airflowModeKind === "heat"
          ? normalizeCssColor(airflowProperties.airflowHeatColor, "#ff8a65")
          : normalizeCssColor(airflowProperties.airflowOtherColor, "#ffffff"),
    airflowAngleDegrees = clampNumber(airflowProperties.airflowAngle, -360, 360, 7),
    airflowLengthRatio = clampNumber(airflowProperties.airflowLength, 10, 300, 200) / 100,
    airflowFadeRatio = clampNumber(airflowProperties.airflowFadePosition, 15, 100, 50) / 100,
    airflowSpreadValue = clampNumber(airflowProperties.airflowSpread, 10, 300, 100),
    airflowCurveFactor = Math.tanh(
      clampNumber(airflowProperties.airflowCurve, -200, 200, 20) / 140,
    ),
    airflowDensityRatio = clampNumber(airflowProperties.airflowDensity, 20, 200, 60) / 100,
    airflowIrregularityRatio = clampNumber(airflowProperties.airflowIrregularity, 0, 200, 50) / 100,
    airflowThicknessRatio = clampNumber(airflowProperties.airflowThickness, 5, 300, 40) / 100,
    airflowStrengthRatio = clampNumber(airflowProperties.airflowStrength, 0, 500, 200) / 100,
    airflowBlurValue = clampNumber(airflowProperties.airflowBlur, 0, 30, 6),
    airflowSpeedValue = clampNumber(airflowProperties.airflowSpeed, 0.3, 12, 1),
    streamBaseOffset = 6,
    streamFarOffset = streamBaseOffset + (228 - streamBaseOffset) * airflowFadeRatio,
    streamMidOffset = streamBaseOffset + (streamFarOffset - streamBaseOffset) * 0.63,
    streamNearOffset = streamMidOffset + (streamFarOffset - streamMidOffset) * 0.56,
    streamSwayAmplitude = Math.min(70, 44 * Math.sqrt(airflowSpreadValue / 100)),
    pseudoRandom = (randomSeed: any) => {
      const rawRandomValue = Math.sin(randomSeed * 12.9898) * 43758.5453;
      return rawRandomValue - Math.floor(rawRandomValue);
    },
    bedPathCount = Math.max(3, Math.min(12, Math.round(8 * airflowDensityRatio))),
    wispStrandCount = Math.max(2, Math.min(4, Math.round(1.5 + 1.2 * airflowDensityRatio))),
    bedPathOffsets = Array.from(
      {
        length: bedPathCount,
      },
      (_pathSlotElement, pathOffsetIndex) => {
        const pathRatio = bedPathCount === 1 ? 0.5 : pathOffsetIndex / (bedPathCount - 1),
          lateralJitter = (pseudoRandom(pathOffsetIndex + 3) - 0.5) * 10 * airflowIrregularityRatio;
        return Math.max(
          10,
          Math.min(170, 90 + (pathRatio - 0.5) * streamSwayAmplitude * 2 + lateralJitter),
        );
      },
    ),
    minPathOffset = Math.min(...bedPathOffsets),
    maxPathOffset = Math.max(...bedPathOffsets),
    tipOffset = airflowCurveFactor >= 0 ? 168 - maxPathOffset : minPathOffset - 12,
    tipDriftAmount = airflowCurveFactor * Math.max(0, tipOffset),
    bedPathStrings = bedPathOffsets.map((pathOffset) => {
      const pathEndOffset = pathOffset + tipDriftAmount,
        pathQuarterOffset = pathOffset + tipDriftAmount * 0.42;
      return (
        "M" +
        pathOffset.toFixed(2) +
        " " +
        streamBaseOffset +
        "L" +
        pathOffset.toFixed(2) +
        " " +
        streamMidOffset.toFixed(2) +
        "C" +
        pathOffset.toFixed(2) +
        " " +
        streamNearOffset.toFixed(2) +
        " " +
        pathQuarterOffset.toFixed(2) +
        " " +
        streamFarOffset.toFixed(2) +
        " " +
        pathEndOffset.toFixed(2) +
        " " +
        streamFarOffset.toFixed(2)
      );
    }),
    wispRectMarkupList = bedPathStrings.flatMap((bedPathString, bedPathIndex) =>
      Array.from(
        {
          length: wispStrandCount,
        },
        (_strandSlotElement, strandSlotIndex) => {
          const wispSeed = bedPathIndex * 41 + strandSlotIndex * 67 + 11,
            wispWidth = Math.max(
              8,
              Math.min(
                112,
                (34 + pseudoRandom(wispSeed) * 42 * (0.7 + airflowIrregularityRatio * 0.3)) *
                  airflowLengthRatio,
              ),
            ),
            wispHeight = Math.max(
              0.2,
              Math.min(14, (1.5 + pseudoRandom(wispSeed + 7) * 2.9) * airflowThicknessRatio),
            ),
            wispVelocity =
              airflowSpeedValue *
              (0.8 + pseudoRandom(wispSeed + 13) * 0.42 * (0.55 + airflowIrregularityRatio * 0.45)),
            wispPhase =
              (strandSlotIndex / wispStrandCount +
                bedPathIndex * 0.067 +
                (pseudoRandom(wispSeed + 19) - 0.5) * 0.08 * airflowIrregularityRatio +
                1) %
              1,
            wispOpacity = Math.min(
              1,
              airflowStrengthRatio * (0.62 + pseudoRandom(wispSeed + 29) * 0.5),
            ),
            wispRectMarkup =
              '<rect x="' +
              (-wispWidth / 2).toFixed(2) +
              '" y="' +
              (-wispHeight * 1.3).toFixed(2) +
              '" width="' +
              wispWidth.toFixed(2) +
              '" height="' +
              (wispHeight * 2.6).toFixed(2) +
              '" rx="' +
              (wispHeight * 1.3).toFixed(2) +
              '" fill="url(#wisp)" filter="url(#glow)"/><rect x="' +
              (-wispWidth * 0.42).toFixed(2) +
              '" y="' +
              (-wispHeight * 0.22).toFixed(2) +
              '" width="' +
              (wispWidth * 0.82).toFixed(2) +
              '" height="' +
              (wispHeight * 0.44).toFixed(2) +
              '" rx="' +
              (wispHeight * 0.22).toFixed(2) +
              '" fill="url(#core)"/>';
          return airflowMotionKind === "static"
            ? '<g opacity="' +
                wispOpacity.toFixed(3) +
                '">' +
                wispRectMarkup +
                '<animateMotion path="' +
                bedPathString +
                '" dur="0.001s" keyPoints="' +
                wispPhase.toFixed(4) +
                ";" +
                wispPhase.toFixed(4) +
                '" keyTimes="0;1" fill="freeze" rotate="auto"/></g>'
            : '<g opacity="0">' +
                wispRectMarkup +
                '<animate attributeName="opacity" values="0;' +
                wispOpacity.toFixed(3) +
                ";" +
                wispOpacity.toFixed(3) +
                ';0" keyTimes="0;.06;.78;1" dur="' +
                wispVelocity.toFixed(3) +
                's" begin="' +
                (-wispVelocity * wispPhase).toFixed(3) +
                's" repeatCount="indefinite"/><animateMotion path="' +
                bedPathString +
                '" dur="' +
                wispVelocity.toFixed(3) +
                's" begin="' +
                (-wispVelocity * wispPhase).toFixed(3) +
                's" rotate="auto" repeatCount="indefinite"/></g>';
        },
      ),
    ),
    airflowSvgMarkup =
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
      Math.max(0.2, airflowBlurValue * 1.35) +
      '"/><feComponentTransfer><feFuncA type="linear" slope="' +
      (airflowStrengthRatio <= 1 ? 1 : 1 + (airflowStrengthRatio - 1) * 0.9).toFixed(3) +
      '"/></feComponentTransfer></filter></defs><g transform="rotate(' +
      airflowAngleDegrees +
      ' 90 120)">' +
      bedPathStrings
        .map(
          (bedPathOutline) =>
            '<path d="' +
            bedPathOutline +
            '" fill="none" stroke="url(#bed)" stroke-width="1.2" stroke-linecap="round" opacity="' +
            Math.min(1, airflowStrengthRatio * 0.075).toFixed(3) +
            '"/>',
        )
        .join("") +
      wispRectMarkupList.join("") +
      "</g></svg>";
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(airflowSvgMarkup);
}
export function renderAirConditionerAirflowLayer(
  airflowLayerComponent: any,
  airflowLayerRenderEnvironment: any,
) {
  const airflowLayerProperties = airflowLayerComponent.properties || {};
  if (
    airflowLayerProperties.airflowVisible === false ||
    !isClimatePoweredOn(airflowLayerComponent, airflowLayerRenderEnvironment)
  )
    return null;
  const airflowLayerElement = document.createElement("div");
  airflowLayerElement.className = "hb-air-conditioner-airflow-layer";
  const airflowImageElement = document.createElement("img");
  return (
    (airflowImageElement.src = buildAirflowSvg(
      airflowLayerProperties,
      resolveAirflowMotionKind(airflowLayerComponent, airflowLayerRenderEnvironment),
    )),
    (airflowImageElement.alt = ""),
    (airflowImageElement.draggable = false),
    airflowLayerElement.append(airflowImageElement),
    airflowLayerElement
  );
}
function createSvgElement(svgParentElement: any, svgTagName: any, svgAttributes: Record<string, any> = {}) {
  const createdSvgElement = document.createElementNS("http://www.w3.org/2000/svg", svgTagName);
  for (const [svgAttributeName, svgAttributeValue] of Object.entries(svgAttributes))
    createdSvgElement.setAttribute(svgAttributeName, String(svgAttributeValue));
  return (svgParentElement.append(createdSvgElement), createdSvgElement);
}
function buildHistorySeries(historySource: any, historyEntityId: any, liveValue: any, hoursWindow = 24) {
  const historyPoints = (
      Array.isArray(historySource.history?.get(historyEntityId)?.points)
        ? historySource.history.get(historyEntityId).points
        : []
    )
      .map((historyPointEntry: any) => ({
        timestamp: Date.parse(historyPointEntry.timestamp),
        value: Number(historyPointEntry.value),
      }))
      .filter(
        (validHistoryPoint: any) =>
          Number.isFinite(validHistoryPoint.timestamp) && Number.isFinite(validHistoryPoint.value),
      ),
    nowTimestamp = Date.now();
  (Number.isFinite(liveValue) &&
    historyPoints.push({
      timestamp: nowTimestamp,
      value: liveValue,
    }),
    historyPoints.sort(
      (previousPoint: any, currentPoint: any) => previousPoint.timestamp - currentPoint.timestamp,
    ));
  const dedupedPoints = historyPoints.filter(
    (candidateHistoryPoint: any, candidatePointIndex: any) =>
      candidatePointIndex === 0 ||
      candidateHistoryPoint.timestamp !== historyPoints[candidatePointIndex - 1].timestamp ||
      candidateHistoryPoint.value !== historyPoints[candidatePointIndex - 1].value,
  );
  if (!dedupedPoints.length) return [];
  const requestedHours = Math.round(clampNumber(hoursWindow, 1, 168, 24)),
    HOUR_IN_MILLISECONDS = 3600 * 1000,
    windowStartTimestamp = nowTimestamp - requestedHours * HOUR_IN_MILLISECONDS,
    seriesPoints: any[] = [];
  let historyCursor = 0,
    lastPointBeforeWindow: any = null;
  for (let hourOffset = 0; hourOffset <= requestedHours; hourOffset += 1) {
    const sampleTimestamp =
      hourOffset === requestedHours
        ? nowTimestamp
        : windowStartTimestamp + hourOffset * HOUR_IN_MILLISECONDS;
    for (
      ;
      historyCursor < dedupedPoints.length &&
      dedupedPoints[historyCursor].timestamp <= sampleTimestamp;
    )
      ((lastPointBeforeWindow = dedupedPoints[historyCursor]), (historyCursor += 1));
    const samplePoint = lastPointBeforeWindow || dedupedPoints[historyCursor] || dedupedPoints[0];
    samplePoint &&
      seriesPoints.push({
        timestamp: sampleTimestamp,
        value: samplePoint.value,
      });
  }
  return seriesPoints;
}
function formatTimestamp(timestampInput: any, hasTimeComponent = true) {
  const dateTimeFormatOptions: Intl.DateTimeFormatOptions = hasTimeComponent
    ? {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }
    : {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      };
  return new Intl.DateTimeFormat("zh-CN", dateTimeFormatOptions)
    .format(new Date(timestampInput))
    .replace(/\//g, "-");
}
function createHoverLineChart(
  chartContainer: any,
  tooltipHostElement: any,
  seriesRecord: any,
  valueSuffix: any,
  pointToPercent: any,
  valueFormat = "auto",
  windowRange = {
    start: 0,
    end: 1,
  },
  tooltipMountElement = document.body,
) {
  const tooltipElement = document.createElement("span");
  ((tooltipElement.className = "hb-line-chart-tooltip"),
    tooltipMountElement === tooltipHostElement &&
      tooltipElement.classList.add("hb-line-chart-details-tooltip"),
    (tooltipElement.hidden = true));
  const hoverGuideElement = document.createElement("i");
  ((hoverGuideElement.className = "hb-line-chart-hover-guide"), (hoverGuideElement.hidden = true));
  const hoverDotElement = document.createElement("i");
  ((hoverDotElement.className = "hb-line-chart-hover-dot"),
    (hoverDotElement.hidden = true),
    tooltipHostElement.append(hoverGuideElement, hoverDotElement),
    tooltipMountElement.append(tooltipElement));
  const handleChartPointerMove = (pointerEvent: any) => {
      const dialogLayerElement =
        tooltipMountElement === tooltipHostElement
          ? tooltipHostElement.closest(".hb-renderer-runtime-dialog-layer")
          : null;
      dialogLayerElement &&
        tooltipElement.parentElement !== dialogLayerElement &&
        dialogLayerElement.append(tooltipElement);
      const chartBounds = chartContainer.getBoundingClientRect();
      if (!chartBounds.width) return;
      const pointerRatioX = (pointerEvent.clientX - chartBounds.left) / chartBounds.width,
        windowRatio = clampNumber(
          (pointerRatioX - windowRange.start) /
            Math.max(0.001, windowRange.end - windowRange.start),
          0,
          1,
          0,
        ),
        pointerTimestamp =
          seriesRecord.firstTime + windowRatio * (seriesRecord.lastTime - seriesRecord.firstTime),
        nearestPoint = seriesRecord.points.reduce((closestPoint: any, candidatePoint: any) =>
          Math.abs(candidatePoint.timestamp - pointerTimestamp) <
          Math.abs(closestPoint.timestamp - pointerTimestamp)
            ? candidatePoint
            : closestPoint,
        ),
        projectedPoint = pointToPercent(nearestPoint),
        hostBounds = tooltipHostElement.getBoundingClientRect(),
        localOffsetX =
          chartContainer.getBoundingClientRect().left -
          hostBounds.left +
          (projectedPoint.x / 100) * chartBounds.width,
        localOffsetY =
          chartContainer.getBoundingClientRect().top -
          hostBounds.top +
          (projectedPoint.y / 100) * chartBounds.height,
        absoluteLeft = hostBounds.left + localOffsetX,
        absoluteTop = hostBounds.top + localOffsetY,
        guideLeftPercent = (localOffsetX / Math.max(1, hostBounds.width)) * 100,
        guideTopPercent = (localOffsetY / Math.max(1, hostBounds.height)) * 100,
        isTooltipOnHost = tooltipElement.parentElement === tooltipHostElement,
        isTooltipOnDialogLayer =
          dialogLayerElement && tooltipElement.parentElement === dialogLayerElement,
        dialogLayerBounds = isTooltipOnDialogLayer
          ? dialogLayerElement.getBoundingClientRect()
          : null,
        tooltipScale =
          tooltipMountElement === tooltipHostElement
            ? chartBounds.width /
              Math.max(1, chartContainer.viewBox?.baseVal.width || chartContainer.clientWidth)
            : hostBounds.width / Math.max(1, tooltipHostElement.offsetWidth),
        positionContainerElement = isTooltipOnHost
          ? tooltipHostElement
          : isTooltipOnDialogLayer
            ? dialogLayerElement
            : null,
        positionContainerBounds = isTooltipOnHost ? hostBounds : dialogLayerBounds,
        horizontalScale = positionContainerElement
          ? positionContainerBounds.width / Math.max(1, positionContainerElement.offsetWidth)
          : 1,
        verticalScale = positionContainerElement
          ? positionContainerBounds.height / Math.max(1, positionContainerElement.offsetHeight)
          : 1,
        dialogLocalLeft = isTooltipOnDialogLayer
          ? (absoluteLeft - dialogLayerBounds.left) / horizontalScale
          : absoluteLeft,
        dialogLocalTop = isTooltipOnDialogLayer
          ? (absoluteTop - dialogLayerBounds.top) / verticalScale
          : absoluteTop;
      ((tooltipElement.textContent =
        formatTimestamp(nearestPoint.timestamp) +
        "  " +
        formatLineChartValue(nearestPoint.value, valueFormat) +
        valueSuffix),
        (tooltipElement.style.position =
          isTooltipOnHost || isTooltipOnDialogLayer ? "absolute" : "fixed"),
        (tooltipElement.style.left =
          (isTooltipOnHost ? localOffsetX / horizontalScale : dialogLocalLeft) + "px"),
        (tooltipElement.style.top =
          (isTooltipOnHost ? localOffsetY / verticalScale : dialogLocalTop) + "px"),
        (tooltipElement.style.transformOrigin = "0 0"),
        (tooltipElement.hidden = false));
      const tooltipPixelWidth = tooltipElement.offsetWidth * tooltipScale,
        containerLeftEdge = positionContainerBounds?.left ?? 0,
        containerRightEdge = positionContainerBounds?.right ?? window.innerWidth,
        tooltipTranslateX =
          absoluteLeft - tooltipPixelWidth / 2 < containerLeftEdge
            ? "0"
            : absoluteLeft + tooltipPixelWidth / 2 > containerRightEdge
              ? "-100%"
              : "-50%";
      ((tooltipElement.style.transform =
        "scale(" +
        tooltipScale / horizontalScale +
        ", " +
        tooltipScale / verticalScale +
        ") translate(" +
        tooltipTranslateX +
        ", calc(-100% - 9px))"),
        (hoverGuideElement.style.left = guideLeftPercent + "%"),
        (hoverDotElement.style.left = guideLeftPercent + "%"),
        (hoverDotElement.style.top = guideTopPercent + "%"),
        (tooltipElement.hidden = false),
        (hoverGuideElement.hidden = false),
        (hoverDotElement.hidden = false));
    },
    handleChartPointerLeave = () => {
      ((tooltipElement.hidden = true),
        (hoverGuideElement.hidden = true),
        (hoverDotElement.hidden = true));
    };
  return (
    chartContainer.addEventListener("pointermove", handleChartPointerMove),
    chartContainer.addEventListener("pointerleave", handleChartPointerLeave),
    () => {
      (chartContainer.removeEventListener("pointermove", handleChartPointerMove),
        chartContainer.removeEventListener("pointerleave", handleChartPointerLeave),
        tooltipElement.remove());
    }
  );
}
function createNavigationEffectsSvg(
  navigationComponent: any,
  visualProperties: any,
  isActiveState: any,
  intensityMultiplier: any,
  glowIntensity: any,
  glowSpreadScale: any,
) {
  const viewWidth = Math.max(1, Number(navigationComponent.position?.width || 236)),
    viewHeight = Math.max(1, Number(navigationComponent.position?.height || 100)),
    svgHeight = Math.max(8, (236 * viewHeight) / viewWidth),
    frameWidth = clampNumber(visualProperties.frameWidth, 0, 20, 2),
    frameInset = Math.max(0.5, frameWidth / 2 + 0.5),
    innerWidth = Math.max(1, 236 - frameInset * 2),
    innerHeight = Math.max(1, svgHeight - frameInset * 2),
    cornerRadius =
      Math.min(innerWidth, innerHeight) * clampNumber(visualProperties.radius, 0, 0.5, 0.5),
    glowOpacity = Math.min(1, 0.38 * glowIntensity),
    edgeGlowSpread = Math.max(0, Math.min(innerWidth, innerHeight) * 0.42 * glowSpreadScale),
    innerGlowSpread = Math.max(0, Math.min(innerWidth, innerHeight) * 0.095 * glowSpreadScale),
    centerX = 236 / 2,
    centerY = svgHeight / 2,
    frameColor = normalizeCssColor(visualProperties.frameColor, "#d9e0e6"),
    glowColor = normalizeCssColor(visualProperties.glowColor, "#f2f6fa"),
    frameAngle = clampNumber(visualProperties.frameAngle, 0, 360, 45),
    glowAngle = clampNumber(visualProperties.glowAngle, 0, 360, 45),
    intensityDivisor = isActiveState ? 0.98 : 0.48,
    scaleOpacity = (opacityInput: any) =>
      Math.max(0, Math.min(1, (opacityInput * intensityMultiplier) / intensityDivisor)),
    gradientId = "navigation-" + randomUuid(),
    svgElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  return (
    svgElement.classList.add("hb-navigation-effects"),
    svgElement.setAttribute("viewBox", "0 0 236 " + svgHeight),
    svgElement.setAttribute("preserveAspectRatio", "none"),
    svgElement.setAttribute("aria-hidden", "true"),
    (svgElement.innerHTML =
      '\n    <defs>\n      <linearGradient id="navigation-edge-' +
      gradientId +
      '" gradientUnits="userSpaceOnUse" x1="0" y1="' +
      centerY +
      '" x2="236" y2="' +
      centerY +
      '" gradientTransform="rotate(' +
      frameAngle +
      " " +
      centerX +
      " " +
      centerY +
      ')">\n        <stop offset="0" stop-color="' +
      frameColor +
      '" stop-opacity="' +
      scaleOpacity(isActiveState ? 0.98 : 0.48) +
      '"/>\n        <stop offset=".48" stop-color="' +
      frameColor +
      '" stop-opacity="' +
      scaleOpacity(isActiveState ? 0.58 : 0.22) +
      '"/>\n        <stop offset="1" stop-color="' +
      frameColor +
      '" stop-opacity="' +
      scaleOpacity(isActiveState ? 0.82 : 0.36) +
      '"/>\n      </linearGradient>\n      <linearGradient id="navigation-light-' +
      gradientId +
      '" gradientUnits="userSpaceOnUse" x1="0" y1="' +
      centerY +
      '" x2="236" y2="' +
      centerY +
      '" gradientTransform="rotate(' +
      glowAngle +
      " " +
      centerX +
      " " +
      centerY +
      ')">\n        <stop offset="0" stop-color="' +
      glowColor +
      '" stop-opacity="' +
      glowOpacity +
      '"/>\n        <stop offset=".45" stop-color="' +
      glowColor +
      '" stop-opacity="' +
      glowOpacity * 0.35 +
      '"/>\n        <stop offset="1" stop-color="' +
      glowColor +
      '" stop-opacity="' +
      glowOpacity * 0.72 +
      '"/>\n      </linearGradient>\n      <clipPath id="navigation-shape-' +
      gradientId +
      '"><rect x="' +
      frameInset +
      '" y="' +
      frameInset +
      '" width="' +
      innerWidth +
      '" height="' +
      innerHeight +
      '" rx="' +
      cornerRadius +
      '"/></clipPath>\n      <filter id="navigation-soft-light-' +
      gradientId +
      '" x="-35%" y="-75%" width="170%" height="250%"><feGaussianBlur stdDeviation="' +
      innerGlowSpread +
      '"/></filter>\n    </defs>\n    ' +
      (visualProperties.glowVisible !== false && edgeGlowSpread > 0 && glowOpacity > 0
        ? '<g clip-path="url(#navigation-shape-' +
          gradientId +
          ')"><rect x="' +
          frameInset +
          '" y="' +
          frameInset +
          '" width="' +
          innerWidth +
          '" height="' +
          innerHeight +
          '" rx="' +
          cornerRadius +
          '" fill="none" stroke="url(#navigation-light-' +
          gradientId +
          ')" stroke-width="' +
          edgeGlowSpread +
          '" filter="url(#navigation-soft-light-' +
          gradientId +
          ')"/></g>'
        : "") +
      "\n    " +
      (visualProperties.frameVisible !== false
        ? '<rect x="' +
          frameInset +
          '" y="' +
          frameInset +
          '" width="' +
          innerWidth +
          '" height="' +
          innerHeight +
          '" rx="' +
          cornerRadius +
          '" fill="none" stroke="url(#navigation-edge-' +
          gradientId +
          ')" stroke-width="' +
          frameWidth +
          '"/>'
        : "") +
      "\n  "),
    svgElement
  );
}
function navigationButtonIsActive({
  targetPage = "",
  currentPagePath = "",
  entityId: navigationEntityId = "",
  entityActive: isEntityActive = false,
  previewState: previewStateValue = "auto",
} = {}) {
  return previewStateValue === "on"
    ? true
    : previewStateValue === "off"
      ? false
      : targetPage
        ? targetPage === currentPagePath
        : !!(navigationEntityId && isEntityActive);
}
registerComponent("image", {
  render(imageComponent: any) {
    const imageProperties = imageComponent.properties || {},
      imageSourceUrl = staticAssetImageSource(imageProperties.assetId);
    if (!imageSourceUrl) {
      const missingImageNoticeElement = document.createElement("div");
      return (
        (missingImageNoticeElement.className = "hb-unknown-component"),
        (missingImageNoticeElement.textContent = "尚未选择图片"),
        missingImageNoticeElement
      );
    }
    const imageElement = document.createElement("img");
    return (
      (imageElement.className = "hb-image-component"),
      (imageElement.src = imageSourceUrl),
      (imageElement.alt = imageProperties.alt || imageProperties.label || "图片"),
      (imageElement.draggable = false),
      (imageElement.style.objectFit = "contain"),
      (imageElement.style.opacity = String(
        Math.max(0, Math.min(1, Number(imageProperties.opacity ?? 1))),
      )),
      imageElement
    );
  },
});
function isEntityStateActive(stateEntityId: any, stateLookupEnvironment: any) {
  if (!stateEntityId) return false;
  const entityStateRecord = stateLookupEnvironment?.states?.get?.(String(stateEntityId)),
    entityStateText = String(
      entityStateRecord?.newState?.state ?? entityStateRecord?.state ?? "",
    ).toLowerCase();
  return ["on", "true", "1", "open", "opening", "active", "playing"].includes(entityStateText);
}
registerComponent("floorplan-auto-diagram", {
  render(diagramComponent: any, diagramRenderEnvironment: RenderPropertyBag = {}) {
    const diagramProperties = diagramComponent.properties || {},
      diagramContainerElement: HTMLDivElement & ComponentControllerHooks = document.createElement("div");
    if (
      ((diagramContainerElement.className = "hb-floorplan-auto-diagram"),
      diagramContainerElement.setAttribute(
        "aria-label",
        diagramProperties.label || diagramProperties.instanceName || "户型图自动导图",
      ),
      diagramRenderEnvironment.editable &&
        diagramProperties.previewReady === true &&
        (diagramProperties.generated !== true || diagramProperties.previewing === true))
    ) {
      const previewFrameElement = document.createElement("iframe");
      ((previewFrameElement.className =
        "hb-floorplan-auto-diagram-preview is-" +
        (diagramProperties.interactionMode === "view" ? "view" : "position") +
        "-mode"),
        (previewFrameElement.title = "3D户型图构图预览"));
      const dashboardCanvas = diagramRenderEnvironment.document?.canvas || {},
        componentPosition = diagramComponent.position || {},
        exportFolderName = diagramProperties.exportFolder || "自动导图-" + diagramComponent.id,
        previewSearchParams = new URLSearchParams({
          "auto-diagram-component": diagramComponent.id,
          "auto-diagram-embed": "1",
          "dashboard-width": String(Number(dashboardCanvas.width || 2778)),
          "dashboard-height": String(Number(dashboardCanvas.height || 1940)),
          "component-width": String(
            Math.max(1, Math.round(Number(componentPosition.width || 100))),
          ),
          "component-height": String(
            Math.max(1, Math.round(Number(componentPosition.height || 100))),
          ),
          "export-folder": exportFolderName,
        });
      (diagramProperties.floorSelection &&
        previewSearchParams.set("floor-selection", String(diagramProperties.floorSelection)),
        (previewFrameElement.src = "/3d-studio?" + previewSearchParams),
        previewFrameElement.setAttribute("allow", "fullscreen"),
        diagramContainerElement.append(previewFrameElement));
      const loadingElement = document.createElement("div");
      ((loadingElement.className = "hb-floorplan-auto-diagram-loading"),
        (loadingElement.innerHTML = '<i aria-hidden="true"></i><strong>正在加载3D户型…</strong>'),
        diagramContainerElement.append(loadingElement));
      const previewHintElement = document.createElement("div");
      return (
        (previewHintElement.className = "hb-floorplan-auto-diagram-preview-hint"),
        (previewHintElement.textContent =
          diagramProperties.interactionMode === "view"
            ? "拖动旋转 · 右键平移 · 滚轮缩放"
            : "拖动控件调整位置，右下角调整大小"),
        diagramContainerElement.append(previewHintElement),
        diagramContainerElement
      );
    }
    const baseImageElement = document.createElement("img");
    ((baseImageElement.className = "hb-floorplan-auto-diagram-base"),
      (baseImageElement.alt = "户型图"),
      (baseImageElement.draggable = false));
    const baseImageUrl = resolveAssetSource(
      diagramProperties.baseAssetId || diagramProperties.floorPlanAssetId || "",
    );
    (baseImageUrl
      ? (baseImageElement.src = baseImageUrl)
      : ((baseImageElement.className += " is-empty"), (baseImageElement.alt = "")),
      diagramContainerElement.append(baseImageElement));
    const lightLayerEntries: any = [],
      layerStates: any[] = [],
      syncDiagramState = () => {
        for (const lightLayerEntry of lightLayerEntries) {
          const isLayerActive = isEntityStateActive(
            lightLayerEntry.entityId,
            diagramRenderEnvironment,
          );
          (lightLayerEntry.image.classList.toggle(
            "is-active",
            isLayerActive || diagramRenderEnvironment.editable,
          ),
            lightLayerEntry.button.classList.toggle("is-active", isLayerActive),
            lightLayerEntry.button.setAttribute("aria-pressed", String(isLayerActive)));
        }
      },
      lightLayers = Array.isArray(diagramProperties.lightLayers)
        ? diagramProperties.lightLayers
        : [];
    for (const lightLayer of lightLayers) {
      const layerImageElement = document.createElement("img");
      ((layerImageElement.className = "hb-floorplan-auto-diagram-layer"),
        (layerImageElement.alt = ""),
        (layerImageElement.draggable = false));
      const layerImageUrl = resolveAssetSource(lightLayer.assetId || "");
      layerImageUrl && (layerImageElement.src = layerImageUrl);
      const lightGroupBinding = diagramComponent.bindings?.["lightGroup:" + lightLayer.id] || {},
        lightGroupEntityId = String(lightGroupBinding.entityId || lightLayer.entityId || ""),
        lightGroupButtonElement = document.createElement("button");
      ((lightGroupButtonElement.type = "button"),
        (lightGroupButtonElement.className = "hb-floorplan-auto-diagram-button"),
        (lightGroupButtonElement.textContent = lightLayer.name || lightLayer.note || "灯组"),
        lightLayer.note && (lightGroupButtonElement.title = lightLayer.note),
        lightGroupButtonElement.addEventListener("click", async (clickEvent) => {
          if (
            (clickEvent.preventDefault(),
            clickEvent.stopPropagation(),
            !(
              !lightGroupEntityId ||
              diagramRenderEnvironment.editable ||
              typeof diagramRenderEnvironment.callEntityService != "function"
            ))
          ) {
            lightGroupButtonElement.disabled = true;
            try {
              await diagramRenderEnvironment.callEntityService(
                "homeassistant",
                "toggle",
                lightGroupEntityId,
              );
            } catch (toggleServiceError: any) {
              diagramRenderEnvironment.onError?.(toggleServiceError);
            } finally {
              lightGroupButtonElement.disabled = false;
            }
          }
        }),
        diagramContainerElement.append(layerImageElement, lightGroupButtonElement));
      const layerStateEntry = {
        image: layerImageElement,
        button: lightGroupButtonElement,
        entityId: lightGroupEntityId,
      };
      (lightLayerEntries.push(layerStateEntry),
        layerStates.push(lightGroupButtonElement),
        lightGroupEntityId &&
          typeof diagramRenderEnvironment.registerRuntimeStateHandler == "function" &&
          diagramRenderEnvironment.registerRuntimeStateHandler(
            lightGroupEntityId,
            syncDiagramState,
          ));
    }
    if (!baseImageUrl) {
      const emptyStateElement = document.createElement("div");
      ((emptyStateElement.className = "hb-floorplan-auto-diagram-empty"),
        (emptyStateElement.textContent = "请先完成户型和灯组，再生成导图"),
        diagramContainerElement.append(emptyStateElement));
    }
    return (
      (diagramContainerElement.syncFloorplanAutoDiagramState = syncDiagramState),
      syncDiagramState(),
      diagramContainerElement
    );
  },
});
export function renderIconButtonEffectLayer(effectLayerComponent: any, effectLayerRenderEnvironment: any) {
  const effectLayerProperties = effectLayerComponent.properties || {},
    effectAssetOverride = effectLayerRenderEnvironment.editable
      ? null
      : effectVariantByAssetId.get(String(effectLayerProperties.effectAssetId || "")),
    effectAssetUrl =
      effectAssetOverride?.url || resolveAssetSource(effectLayerProperties.effectAssetId);
  if (!effectAssetUrl || effectLayerProperties.effectVisible === false) return null;
  const isEffectAuthoredActive = isCoverAuthoredActive(
      effectLayerComponent,
      effectLayerRenderEnvironment,
    ),
    effectLightVisualState = iconButtonEffectLightVisualState(
      effectLayerComponent,
      effectLayerRenderEnvironment,
    ),
    isEffectAwaitingLight = iconButtonEffectLightVisualAwaiting(
      effectLayerComponent,
      effectLayerRenderEnvironment,
    ),
    effectLayerElement = document.createElement("div");
  ((effectLayerElement.className =
    "hb-icon-button-effect-layer" +
    (isEffectAuthoredActive ? " active" : "") +
    (isEffectAwaitingLight ? " awaiting-light-visual" : "")),
    effectLayerElement.style.setProperty(
      "--hb-effect-image-opacity",
      String(
        clampNumber(effectLayerProperties.effectOpacity, 0, 1, 1) * effectLightVisualState.opacity,
      ),
    ));
  const effectFadeDuration = clampNumber(effectLayerProperties.effectFadeDuration, 0, 3, 0.52);
  (effectLayerElement.style.setProperty("--hb-effect-fade-duration", effectFadeDuration + "s"),
    effectLayerElement.style.setProperty(
      "--hb-effect-visual-transition-duration",
      Math.max(0.45, effectFadeDuration) + "s",
    ));
  const effectImageElement = document.createElement("img");
  return (
    effectAssetOverride
      ? (effectImageElement.dataset.effectSource = effectAssetUrl)
      : (effectImageElement.src = effectAssetUrl),
    (effectImageElement.alt = ""),
    (effectImageElement.draggable = false),
    (effectImageElement.decoding = "async"),
    (effectImageElement.style.objectFit = "contain"),
    (effectImageElement.style.mixBlendMode = "normal"),
    (effectImageElement.style.filter = effectLightVisualState.filter),
    effectAssetOverride &&
      ((effectImageElement.dataset.effectOriginalWidth = String(effectAssetOverride.originalWidth)),
      (effectImageElement.dataset.effectOriginalHeight = String(
        effectAssetOverride.originalHeight,
      )),
      (effectImageElement.dataset.effectCropX = String(effectAssetOverride.cropX)),
      (effectImageElement.dataset.effectCropY = String(effectAssetOverride.cropY)),
      (effectImageElement.dataset.effectCropWidth = String(effectAssetOverride.width)),
      (effectImageElement.dataset.effectCropHeight = String(effectAssetOverride.height))),
    effectLayerElement.append(effectImageElement),
    effectLayerElement
  );
}
(registerComponent("icon-button-effect", {
  render(iconButtonComponent: any, iconButtonRenderEnvironment: any) {
    const iconButtonProperties = iconButtonComponent.properties || {},
      isIconButtonActive = isCoverAuthoredActive(iconButtonComponent, iconButtonRenderEnvironment),
      shouldShowIcon =
        iconButtonRenderEnvironment?.isIconVisible?.(iconButtonComponent.id) !== false,
      iconButtonElement = document.createElement("div");
    ((iconButtonElement.className =
      "hb-icon-button-effect" + (isIconButtonActive ? " active" : "")),
      (iconButtonElement.hidden = iconButtonProperties.buttonVisible === false),
      (iconButtonElement.style.opacity = shouldShowIcon ? "1" : "0"),
      (iconButtonElement.style.transition = "opacity .24s ease"),
      iconButtonElement.style.setProperty(
        "--effect-button-color",
        normalizeCssColor(
          isIconButtonActive
            ? iconButtonProperties.buttonOnColor
            : iconButtonProperties.buttonOffColor,
          isIconButtonActive ? "#1f91b8" : "#17242d",
        ),
      ),
      iconButtonElement.style.setProperty(
        "--effect-button-opacity",
        clampNumber(iconButtonProperties.buttonOpacity, 0, 1, 0.92) * 100 + "%",
      ),
      iconButtonElement.style.setProperty(
        "--effect-frame-color",
        normalizeCssColor(iconButtonProperties.frameColor, "#dcebf2"),
      ),
      iconButtonElement.style.setProperty(
        "--effect-frame-width",
        clampNumber(iconButtonProperties.frameWidth, 0, 20, 1.5) + "px",
      ),
      iconButtonElement.style.setProperty(
        "--effect-frame-opacity",
        clampNumber(iconButtonProperties.frameOpacity, 0, 1, 0.72) * 100 + "%",
      ),
      iconButtonElement.style.setProperty(
        "--effect-radius",
        clampNumber(iconButtonProperties.radius, 0, 50, 50) + "%",
      ),
      iconButtonElement.style.setProperty(
        "--effect-glow-color",
        normalizeCssColor(iconButtonProperties.glowColor, "#43c8f0"),
      ));
    const glowIntensityScale = clampNumber(
      isIconButtonActive
        ? iconButtonProperties.glowOnStrength
        : iconButtonProperties.glowOffStrength,
      0,
      3,
      isIconButtonActive ? 1 : 0,
    );
    (iconButtonElement.style.setProperty("--effect-glow-size", 18 * glowIntensityScale + "px"),
      iconButtonElement.style.setProperty(
        "--effect-glow-inset-size",
        13 * glowIntensityScale + "px",
      ),
      iconButtonElement.style.setProperty(
        "--effect-glow-opacity",
        Math.min(100, glowIntensityScale * 38) + "%",
      ),
      iconButtonElement.style.setProperty(
        "--effect-glow-inset-opacity",
        Math.min(100, glowIntensityScale * 30) + "%",
      ));
    const iconMaskUrl = resolveMdiIconUrl(iconButtonProperties.icon || "mdi:lightbulb-outline");
    if (iconMaskUrl) {
      const iconElement = document.createElement("i");
      ((iconElement.className = "hb-icon-button-effect-icon"),
        (iconElement.style.transition = "opacity .24s ease"),
        (iconElement.style.opacity = shouldShowIcon ? "1" : "0"),
        (iconElement.style.backgroundColor = normalizeCssColor(
          isIconButtonActive ? iconButtonProperties.iconOnColor : iconButtonProperties.iconOffColor,
          isIconButtonActive ? "#ffffff" : "#9aa5ad",
        )),
        (iconElement.style.width = clampNumber(iconButtonProperties.iconSize, 1, 100, 44) + "%"),
        (iconElement.style.height = clampNumber(iconButtonProperties.iconSize, 1, 100, 44) + "%"),
        iconElement.style.setProperty("mask-image", 'url("' + iconMaskUrl + '")'),
        iconElement.style.setProperty("-webkit-mask-image", 'url("' + iconMaskUrl + '")'),
        iconButtonElement.append(iconElement));
    }
    return iconButtonElement;
  },
}),
  registerComponent("title-button", {
    render(titleButtonComponent: any, titleButtonRenderEnvironment: any) {
      const titleButtonProperties = titleButtonComponent.properties || {},
        isHiddenContentClickable = titleButtonProperties.hiddenContentClickable === true,
        titleButtonWidthPx = Math.max(20, Number(titleButtonComponent.position?.width || 500)),
        titleButtonHeightPx = Math.max(20, Number(titleButtonComponent.position?.height || 122)),
        { height: titleUnitHeight } = componentContentUnitsPx(
          titleButtonComponent,
          titleButtonRenderEnvironment,
        ),
        titleButtonElement = document.createElement("div");
      if (
        ((titleButtonElement.className = "hb-title-button"),
        titleButtonElement.style.setProperty(
          "--title-frame-color",
          normalizeCssColor(titleButtonProperties.frameColor, "#60636a"),
        ),
        titleButtonElement.style.setProperty(
          "--title-frame-width",
          clampNumber(titleButtonProperties.frameWidth, 0, 12, 1.5) + "px",
        ),
        titleButtonElement.style.setProperty(
          "--title-frame-offset-x",
          clampNumber(titleButtonProperties.frameOffsetX, -100, 100, 0) + "%",
        ),
        titleButtonElement.style.setProperty(
          "--title-frame-offset-y",
          clampNumber(titleButtonProperties.frameOffsetY, -100, 100, 0) + "%",
        ),
        titleButtonElement.style.setProperty(
          "--title-main-size",
          clampNumber(titleButtonProperties.mainSize, 8, 200, 34) * titleUnitHeight + "px",
        ),
        titleButtonElement.style.setProperty(
          "--title-secondary-size",
          clampNumber(titleButtonProperties.secondarySize, 6, 100, 12) * titleUnitHeight + "px",
        ),
        titleButtonElement.style.setProperty(
          "--title-main-spacing",
          clampNumber(titleButtonProperties.mainSpacing, -20, 100, 1) * titleUnitHeight + "px",
        ),
        titleButtonElement.style.setProperty(
          "--title-secondary-spacing",
          clampNumber(titleButtonProperties.secondarySpacing, -20, 100, 2) * titleUnitHeight + "px",
        ),
        titleButtonElement.style.setProperty(
          "--title-secondary-line-gap",
          clampNumber(titleButtonProperties.secondaryLineGap, 0, 100, 2) * titleUnitHeight + "px",
        ),
        titleButtonElement.style.setProperty(
          "--title-main-left",
          clampNumber(titleButtonProperties.mainTextLeft, -100, 200, 5.5) + "%",
        ),
        titleButtonElement.style.setProperty(
          "--title-main-top",
          clampNumber(titleButtonProperties.mainTextTop, -100, 200, 45) + "%",
        ),
        titleButtonElement.style.setProperty(
          "--title-secondary-left",
          clampNumber(titleButtonProperties.secondaryTextLeft, -100, 200, 54) + "%",
        ),
        titleButtonElement.style.setProperty(
          "--title-secondary-top",
          clampNumber(titleButtonProperties.secondaryTextTop, -100, 200, 43) + "%",
        ),
        titleButtonElement.style.setProperty(
          "--title-icon-size",
          clampNumber(titleButtonProperties.iconSize, 1, 100, 30) * titleUnitHeight + "px",
        ),
        titleButtonElement.style.setProperty(
          "--title-icon-left",
          clampNumber(titleButtonProperties.iconLeft, -100, 200, 50) + "%",
        ),
        titleButtonElement.style.setProperty(
          "--title-icon-top",
          clampNumber(titleButtonProperties.iconTop, -100, 200, 45) + "%",
        ),
        titleButtonElement.style.setProperty(
          "--title-marker-left",
          clampNumber(titleButtonProperties.markerLeft, -100, 200, 1.8) + "%",
        ),
        titleButtonElement.style.setProperty(
          "--title-marker-top",
          clampNumber(titleButtonProperties.markerTop, -100, 200, 84) + "%",
        ),
        titleButtonProperties.frameVisible !== false || isHiddenContentClickable)
      ) {
        const frameSizeRatio = clampNumber(titleButtonProperties.frameSize, 10, 300, 100) / 100,
          frameHeight = titleButtonHeightPx * 0.45 * frameSizeRatio,
          frameOffsetXPx =
            (titleButtonWidthPx * clampNumber(titleButtonProperties.frameOffsetX, -100, 100, 0)) /
            100,
          frameOffsetYPx =
            (titleButtonHeightPx * clampNumber(titleButtonProperties.frameOffsetY, -100, 100, 0)) /
            100,
          frameHalfSpacing =
            (titleButtonWidthPx * clampNumber(titleButtonProperties.frameSpacing, 0, 300, 100)) /
            200,
          frameCenterX = titleButtonWidthPx / 2 + frameOffsetXPx,
          frameCenterY = titleButtonHeightPx / 2 + frameOffsetYPx,
          frameTopEdge = frameCenterY - frameHeight / 2,
          frameBottomEdge = frameCenterY + frameHeight / 2,
          frameCornerInset = titleButtonHeightPx * 0.12,
          frameHalfWidth = clampNumber(titleButtonProperties.frameWidth, 0, 12, 1.5) / 2,
          frameLeftEdge = frameCenterX - frameHalfSpacing + frameHalfWidth,
          frameRightEdge = frameCenterX + frameHalfSpacing - frameHalfWidth,
          bracketsSvgElement = createSvgElement(titleButtonElement, "svg", {
            viewBox: "0 0 " + titleButtonWidthPx + " " + titleButtonHeightPx,
            preserveAspectRatio: "none",
            "aria-hidden": "true",
          });
        (bracketsSvgElement.setAttribute("class", "hb-title-button-brackets"),
          titleButtonProperties.frameVisible === false &&
            (bracketsSvgElement.style.visibility = "hidden"));
        const bracketPathAttributes = {
          fill: "none",
          stroke: normalizeCssColor(titleButtonProperties.frameColor, "#60636a"),
          "stroke-width": clampNumber(titleButtonProperties.frameWidth, 0, 12, 1.5),
          "stroke-opacity": 1,
          "stroke-linecap": "butt",
          "stroke-linejoin": "miter",
          "vector-effect": "non-scaling-stroke",
        };
        (createSvgElement(bracketsSvgElement, "path", {
          ...bracketPathAttributes,
          d:
            "M " +
            (frameLeftEdge + frameCornerInset) +
            " " +
            frameTopEdge +
            " H " +
            frameLeftEdge +
            " V " +
            frameBottomEdge +
            " H " +
            (frameLeftEdge + frameCornerInset),
        }),
          createSvgElement(bracketsSvgElement, "path", {
            ...bracketPathAttributes,
            d:
              "M " +
              (frameRightEdge - frameCornerInset) +
              " " +
              frameTopEdge +
              " H " +
              frameRightEdge +
              " V " +
              frameBottomEdge +
              " H " +
              (frameRightEdge - frameCornerInset),
          }));
      }
      if (titleButtonProperties.mainTextVisible !== false || isHiddenContentClickable) {
        const mainTextElement = document.createElement("strong");
        ((mainTextElement.className = "hb-title-button-main"),
          (mainTextElement.textContent = String(titleButtonProperties.mainText || "客厅")),
          (mainTextElement.style.color = normalizeCssColor(
            titleButtonProperties.mainColor,
            "#b9bbc0",
          )),
          titleButtonProperties.mainTextVisible === false &&
            (mainTextElement.style.visibility = "hidden"),
          applyTextOutline(
            mainTextElement,
            titleButtonProperties.mainWeight,
            clampNumber(titleButtonProperties.mainSize, 8, 200, 34),
          ),
          titleButtonElement.append(mainTextElement));
      }
      if (titleButtonProperties.secondaryTextVisible !== false || isHiddenContentClickable) {
        const secondaryTextElement = document.createElement("small");
        ((secondaryTextElement.className = "hb-title-button-secondary"),
          String(titleButtonProperties.secondaryText || "LIVING ROOM\nLIGHTING")
            .split(/\r?\n/)
            .slice(0, 2)
            .forEach((secondaryLineText) => {
              const secondaryLineElement = document.createElement("span");
              ((secondaryLineElement.textContent = secondaryLineText),
                secondaryTextElement.append(secondaryLineElement));
            }),
          (secondaryTextElement.style.color = normalizeCssColor(
            titleButtonProperties.secondaryColor,
            "#70737b",
          )),
          titleButtonProperties.secondaryTextVisible === false &&
            (secondaryTextElement.style.visibility = "hidden"),
          applyTextOutline(
            secondaryTextElement,
            titleButtonProperties.secondaryWeight,
            clampNumber(titleButtonProperties.secondarySize, 6, 100, 12),
          ),
          titleButtonElement.append(secondaryTextElement));
      }
      if (titleButtonProperties.iconVisible !== false || isHiddenContentClickable) {
        const titleIconUrl = resolveMdiIconUrl(titleButtonProperties.icon || "");
        if (titleIconUrl) {
          const titleIconElement = document.createElement("i");
          ((titleIconElement.className = "hb-title-button-icon"),
            titleButtonProperties.iconVisible === false &&
              (titleIconElement.style.visibility = "hidden"),
            (titleIconElement.style.backgroundColor = normalizeCssColor(
              titleButtonProperties.iconColor,
              "#b9bbc0",
            )),
            titleIconElement.style.setProperty("mask-image", 'url("' + titleIconUrl + '")'),
            titleIconElement.style.setProperty("-webkit-mask-image", 'url("' + titleIconUrl + '")'),
            titleButtonElement.append(titleIconElement));
        }
      }
      if (titleButtonProperties.markerVisible !== false || isHiddenContentClickable) {
        const markerIconElement = document.createElement("i");
        ((markerIconElement.className = "hb-title-button-marker"),
          titleButtonProperties.markerVisible === false &&
            (markerIconElement.style.visibility = "hidden"),
          (markerIconElement.style.color = normalizeCssColor(
            titleButtonProperties.markerColor,
            "#f2a20d",
          )),
          (markerIconElement.style.borderTopColor = normalizeCssColor(
            titleButtonProperties.markerColor,
            "#f2a20d",
          )),
          markerIconElement.style.setProperty(
            "--title-marker-size",
            clampNumber(titleButtonProperties.markerSize, 2, 60, 10) * titleUnitHeight + "px",
          ),
          titleButtonElement.append(markerIconElement));
      }
      return titleButtonElement;
    },
  }),
  registerComponent("light-statistics", {
    render(lightStatisticsComponent: any, lightStatisticsRenderEnvironment: any) {
      const lightStatisticsProperties = lightStatisticsComponent.properties || {},
        lightStatisticsTotals = lightStatisticsSummary(
          lightStatisticsProperties.entityIds,
          lightStatisticsRenderEnvironment.states,
          lightStatisticsRenderEnvironment.entityMetadata,
        ),
        { width: statisticsUnitWidth, height: statisticsUnitHeight } = componentContentUnitsPx(
          lightStatisticsComponent,
          lightStatisticsRenderEnvironment,
        ),
        statisticsElement = document.createElement("div");
      ((statisticsElement.className = "hb-light-statistics"),
        statisticsElement.classList.toggle("active", lightStatisticsTotals.on > 0),
        (statisticsElement.dataset.total = String(lightStatisticsTotals.total)),
        (statisticsElement.dataset.on = String(lightStatisticsTotals.on)),
        (statisticsElement.dataset.off = String(lightStatisticsTotals.off)),
        (statisticsElement.dataset.abnormal = String(lightStatisticsTotals.abnormal)),
        statisticsElement.style.setProperty(
          "--light-statistics-icon-size",
          clampNumber(lightStatisticsProperties.iconSize, 1, 100, 42) * statisticsUnitHeight + "px",
        ),
        statisticsElement.style.setProperty(
          "--light-statistics-title-size",
          clampNumber(lightStatisticsProperties.titleSize, 8, 200, 32) * statisticsUnitHeight +
            "px",
        ),
        statisticsElement.style.setProperty(
          "--light-statistics-title-spacing",
          clampNumber(lightStatisticsProperties.titleSpacing, -20, 100, 1.2) *
            statisticsUnitHeight +
            "px",
        ),
        statisticsElement.style.setProperty(
          "--light-statistics-count-size",
          clampNumber(lightStatisticsProperties.countSize, 8, 200, 34) * statisticsUnitHeight +
            "px",
        ),
        statisticsElement.style.setProperty(
          "--light-statistics-count-spacing",
          clampNumber(lightStatisticsProperties.countSpacing, -20, 100, 0) * statisticsUnitHeight +
            "px",
        ),
        statisticsElement.style.setProperty(
          "--light-statistics-icon-gap",
          clampNumber(lightStatisticsProperties.iconGap, 0, 40, 4.5) * statisticsUnitWidth + "px",
        ),
        statisticsElement.style.setProperty(
          "--light-statistics-count-gap",
          clampNumber(lightStatisticsProperties.countGap, 0, 40, 4.5) * statisticsUnitWidth + "px",
        ),
        statisticsElement.style.setProperty(
          "--light-statistics-icon-color",
          normalizeCssColor(lightStatisticsProperties.iconColor, "#8b9298"),
        ),
        statisticsElement.style.setProperty(
          "--light-statistics-icon-active-color",
          normalizeCssColor(lightStatisticsProperties.iconActiveColor, "#f2a20d"),
        ),
        statisticsElement.style.setProperty(
          "--light-statistics-title-color",
          normalizeCssColor(lightStatisticsProperties.titleColor, "#b9bbc0"),
        ),
        statisticsElement.style.setProperty(
          "--light-statistics-count-color",
          normalizeCssColor(lightStatisticsProperties.countColor, "#b9bbc0"),
        ),
        statisticsElement.style.setProperty(
          "--light-statistics-count-active-color",
          normalizeCssColor(lightStatisticsProperties.countActiveColor, "#f2a20d"),
        ));
      const iconAssetId = Object.prototype.hasOwnProperty.call(lightStatisticsProperties, "icon")
          ? String(lightStatisticsProperties.icon || "")
          : "mdi:lightbulb-group-outline",
        statisticsIconUrl = resolveMdiIconUrl(iconAssetId),
        hasStatisticsIcon = lightStatisticsProperties.iconVisible !== false && !!statisticsIconUrl,
        isTitleVisible = lightStatisticsProperties.titleVisible !== false,
        isCountVisible = lightStatisticsProperties.countVisible !== false;
      if (
        (statisticsElement.classList.toggle("has-icon", hasStatisticsIcon),
        statisticsElement.classList.toggle("has-title", isTitleVisible),
        statisticsElement.classList.toggle("has-count", isCountVisible),
        hasStatisticsIcon)
      ) {
        const statisticsIconElement = document.createElement("i");
        ((statisticsIconElement.className = "hb-light-statistics-icon"),
          statisticsIconElement.style.setProperty("mask-image", 'url("' + statisticsIconUrl + '")'),
          statisticsIconElement.style.setProperty(
            "-webkit-mask-image",
            'url("' + statisticsIconUrl + '")',
          ),
          statisticsElement.append(statisticsIconElement));
      }
      if (isTitleVisible) {
        const statisticsTitleElement = document.createElement("strong");
        ((statisticsTitleElement.className = "hb-light-statistics-title"),
          (statisticsTitleElement.textContent = String(lightStatisticsProperties.title || "数量")),
          applyTextOutline(
            statisticsTitleElement,
            lightStatisticsProperties.titleWeight,
            clampNumber(lightStatisticsProperties.titleSize, 8, 200, 32),
          ),
          statisticsElement.append(statisticsTitleElement));
      }
      if (isCountVisible) {
        const statisticsCountElement = document.createElement("span");
        statisticsCountElement.className = "hb-light-statistics-count";
        const activeCountElement = document.createElement("b");
        if (
          ((activeCountElement.textContent = lightStatisticsTotals.total
            ? String(lightStatisticsTotals.on)
            : "--"),
          applyTextOutline(
            activeCountElement,
            lightStatisticsProperties.countWeight,
            clampNumber(lightStatisticsProperties.countSize, 8, 200, 34),
          ),
          statisticsCountElement.append(activeCountElement),
          lightStatisticsTotals.total)
        ) {
          const totalCountElement = document.createElement("em");
          ((totalCountElement.textContent = " / " + lightStatisticsTotals.total),
            statisticsCountElement.append(totalCountElement));
        }
        statisticsElement.append(statisticsCountElement);
      }
      return statisticsElement;
    },
  }));
/**
 * 即时消息墙控件：实时展示设备状态变更流，消息出现后自动淡出。
 *
 * 数据来源：渲染器核心在 WS state_changed 回调里把「上一状态 + 新状态」推给本控件上的
 * pushEvent 钩子；本控件负责文案解析、窗口期去重、列表渲染与显示时长控制。
 */
export function renderEventLogWall(eventLogWallComponent: any, eventLogWallRenderEnvironment: any) {
  const eventLogWallProperties = eventLogWallComponent.properties || {},
    { height: eventLogWallUnitHeight } = componentContentUnitsPx(
      eventLogWallComponent,
      eventLogWallRenderEnvironment,
    ),
    eventLogWallEditable = !!eventLogWallRenderEnvironment.editable,
    eventLogWallMaxEntries = clampNumber(eventLogWallProperties.maxEntries, 1, 200, 20),
    eventLogWallBuffer = new EventLogWallBuffer(eventLogWallMaxEntries),
    eventLogWallFontSizePx =
      clampNumber(eventLogWallProperties.fontSize, 8, 200, 21) * eventLogWallUnitHeight,
    eventLogWallRootElement: HTMLDivElement & ComponentControllerHooks =
      document.createElement("div");
  eventLogWallRootElement.className = "hb-event-log-wall";
  eventLogWallRootElement.style.setProperty(
    "--hb-event-log-wall-font-size",
    eventLogWallFontSizePx + "px",
  );
  eventLogWallRootElement.style.setProperty(
    "--hb-event-log-wall-title-font-size",
    (eventLogWallFontSizePx * clampNumber(eventLogWallProperties.titleSize, 40, 300, 72)) / 100 +
      "px",
  );
  eventLogWallRootElement.style.setProperty(
    "--hb-event-log-wall-title-color",
    normalizeCssColor(eventLogWallProperties.titleColor, "#b8c2c8"),
  );
  eventLogWallRootElement.style.setProperty(
    "--hb-event-log-wall-title-align",
    ["left", "center", "right"].includes(String(eventLogWallProperties.titleAlign))
      ? { left: "flex-start", center: "center", right: "flex-end" }[
          String(eventLogWallProperties.titleAlign)
        ]!
      : "flex-start"!,
  );
  eventLogWallRootElement.style.setProperty(
    "--hb-event-log-wall-bg-opacity",
    String(clampNumber(eventLogWallProperties.panelBgOpacity, 0, 1, 0.3)),
  );
  eventLogWallRootElement.style.setProperty(
    "--hb-event-log-wall-blur",
    clampNumber(eventLogWallProperties.panelBlur, 0, 40, 8) + "px",
  );
  eventLogWallRootElement.style.setProperty(
    "--hb-event-log-wall-radius",
    clampNumber(eventLogWallProperties.cornerRadius, 0, 50, 12) + "px",
  );
  for (const [eventLogWallColorKey, eventLogWallColorFallback] of [
    ["on", "#fb923c"],
    ["off", "#93c5fd"],
    ["attr", "#7dd3fc"],
    ["climate", "#67e8f9"],
    ["alert", "#f87171"],
    ["muted", "#9ca3af"],
  ] as const)
    eventLogWallRootElement.style.setProperty(
      "--hb-event-log-wall-" + eventLogWallColorKey + "-color",
      normalizeCssColor(
        eventLogWallProperties["state" + eventLogWallColorKey[0].toUpperCase() + eventLogWallColorKey.slice(1) + "Color"],
        eventLogWallColorFallback,
      ),
    );

  const eventLogWallPanelElement = document.createElement("div");
  eventLogWallPanelElement.className = "hb-event-log-wall__panel";

  const isEventLogWallTitleVisible = eventLogWallProperties.titleVisible === true;
  if (isEventLogWallTitleVisible) {
    const eventLogWallTitleElement = document.createElement("div");
    eventLogWallTitleElement.className = "hb-event-log-wall__title";
    const eventLogWallTitleTextElement = document.createElement("strong");
    eventLogWallTitleTextElement.textContent = String(
      eventLogWallProperties.title || eventLogWallProperties.instanceName || "即时消息墙",
    );
    eventLogWallTitleElement.append(eventLogWallTitleTextElement);
    eventLogWallPanelElement.append(eventLogWallTitleElement);
  }

  const eventLogWallScrollElement = document.createElement("div");
  eventLogWallScrollElement.className = "hb-event-log-wall__scroll";
  const eventLogWallListElement = document.createElement("div");
  eventLogWallListElement.className = "hb-event-log-wall__list";
  eventLogWallScrollElement.append(eventLogWallListElement);
  eventLogWallPanelElement.append(eventLogWallScrollElement);
  eventLogWallRootElement.append(eventLogWallPanelElement);

  if (eventLogWallProperties.showFooter === true) {
    const eventLogWallFooterElement = document.createElement("div");
    eventLogWallFooterElement.className = "hb-event-log-wall__footer";
    eventLogWallFooterElement.textContent = String(eventLogWallProperties.footerText || "");
    eventLogWallPanelElement.append(eventLogWallFooterElement);
  }

  let eventLogWallHideTimer: ReturnType<typeof setTimeout> | null = null;
  const clearEventLogWallHideTimer = () => {
    if (eventLogWallHideTimer != null) {
      clearTimeout(eventLogWallHideTimer);
      eventLogWallHideTimer = null;
    }
  };
  const showEventLogWall = () => {
    eventLogWallRootElement.classList.add("is-visible");
    clearEventLogWallHideTimer();
    const eventLogWallDurationValue = Number(eventLogWallProperties.displayDuration);
    const eventLogWallDurationSeconds =
      Number.isFinite(eventLogWallDurationValue) && eventLogWallDurationValue > 0
        ? eventLogWallDurationValue
        : 4;
    eventLogWallHideTimer = setTimeout(() => {
      eventLogWallRootElement.classList.remove("is-visible");
      eventLogWallHideTimer = null;
    }, eventLogWallDurationSeconds * 1000);
  };

  const createEventLogWallEntryElement = (eventLogWallEntry: any) => {
    const eventLogWallEntryElement = document.createElement("button");
    eventLogWallEntryElement.type = "button";
    eventLogWallEntryElement.className = "hb-event-log-wall__entry is-entering";
    const eventLogWallStateElement = document.createElement("span");
    eventLogWallStateElement.className =
      "hb-event-log-wall__state hb-event-log-wall__state--" + eventLogWallEntry.colorToken;
    eventLogWallStateElement.textContent = "[" + eventLogWallEntry.state + "]";
    const eventLogWallTimeElement = document.createElement("span");
    eventLogWallTimeElement.className = "hb-event-log-wall__time";
    eventLogWallTimeElement.textContent = eventLogWallEntry.timestamp;
    const eventLogWallNameElement = document.createElement("span");
    eventLogWallNameElement.className = "hb-event-log-wall__name";
    eventLogWallNameElement.textContent = eventLogWallEntry.name;
    eventLogWallEntryElement.append(
      eventLogWallStateElement,
      eventLogWallTimeElement,
      eventLogWallNameElement,
    );
    if (
      eventLogWallProperties.entryClickMode !== "none" &&
      typeof eventLogWallRenderEnvironment.openEntityDetails === "function"
    ) {
      eventLogWallEntryElement.classList.add("is-clickable");
      eventLogWallEntryElement.addEventListener("click", () =>
        eventLogWallRenderEnvironment.openEntityDetails(eventLogWallEntry.entityId),
      );
    }
    return eventLogWallEntryElement;
  };

  const revealEventLogWallEntries = () => {
    for (const eventLogWallEnteringRow of eventLogWallListElement.querySelectorAll(
      ".hb-event-log-wall__entry.is-entering",
    ))
      eventLogWallEnteringRow.classList.remove("is-entering");
  };

  eventLogWallRootElement.pushEvent = (
    eventLogWallPushedEntityId,
    eventLogWallPreviousStateEntry,
    eventLogWallNextStateEntry,
  ) => {
    if (eventLogWallProperties.enabled === false) return;
    const eventLogWallResolvedEntityId = String(eventLogWallPushedEntityId || "");
    if (!eventLogWallResolvedEntityId || !isEventLogWallDomain(eventLogWallResolvedEntityId)) return;
    const eventLogWallPreviousSnapshot = resolveStateSnapshot(eventLogWallPreviousStateEntry),
      eventLogWallNextSnapshot = resolveStateSnapshot(eventLogWallNextStateEntry),
      eventLogWallResolvedChange = resolveEntityStateChangeMessage(
        eventLogWallResolvedEntityId,
        eventLogWallPreviousSnapshot,
        eventLogWallNextSnapshot,
      );
    if (!eventLogWallResolvedChange) return;
    const eventLogWallFingerprint = buildEventLogFingerprint(
        eventLogWallResolvedEntityId,
        eventLogWallPreviousSnapshot,
        eventLogWallNextSnapshot,
        eventLogWallResolvedChange,
      ),
      eventLogWallDisplayKey =
        eventLogWallResolvedEntityId + "|" + eventLogWallResolvedChange.label,
      eventLogWallDisplayName = eventLogWallEntityName(
        eventLogWallResolvedEntityId,
        eventLogWallNextSnapshot,
        eventLogWallRenderEnvironment.entityMetadata?.get?.(eventLogWallResolvedEntityId),
      ),
      eventLogWallEntry = createEventLogEntry(
        eventLogWallResolvedEntityId,
        eventLogWallResolvedChange,
        eventLogWallDisplayName,
      );
    if (!eventLogWallBuffer.push(eventLogWallEntry, eventLogWallFingerprint, eventLogWallDisplayKey))
      return;
    eventLogWallListElement.prepend(createEventLogWallEntryElement(eventLogWallEntry));
    while (eventLogWallListElement.children.length > eventLogWallMaxEntries)
      eventLogWallListElement.lastElementChild?.remove();
    eventLogWallScrollElement.scrollTop = 0;
    requestAnimationFrame(revealEventLogWallEntries);
    showEventLogWall();
  };

  if (eventLogWallEditable) eventLogWallRootElement.classList.add("is-visible", "is-editing");
  eventLogWallRenderEnvironment.cleanup?.(clearEventLogWallHideTimer);
  return eventLogWallRootElement;
}
registerComponent("event-log-wall", {
  render: renderEventLogWall,
});
const buttonComponentRenderers = {
  render(buttonComponent: any, buttonRenderEnvironment: any) {
    const buttonProperties = buttonComponent.properties || {},
      isDeviceButton = buttonComponent.type === "device-button",
      boundEntityId = buttonComponent.bindings?.entity?.entityId || "",
      boundEntityState = buttonRenderEnvironment.states?.get(boundEntityId),
      entityStatePayload = resolveStatePayload(boundEntityState),
      isButtonActive = isCoverComponentActive(buttonComponent, buttonRenderEnvironment),
      buttonWidthPx = Math.max(20, Number(buttonComponent.position?.width || 144)),
      buttonHeightPx = Math.max(20, Number(buttonComponent.position?.height || 150)),
      { height: buttonUnitHeight } = componentContentUnitsPx(
        buttonComponent,
        buttonRenderEnvironment,
      ),
      cornerCutSize =
        (Math.min(buttonWidthPx, buttonHeightPx) *
          clampNumber(buttonProperties.cutCorner, 0, 50, 20)) /
        100,
      frameStrokeWidth = clampNumber(buttonProperties.frameWidth, 0, 12, 1),
      frameGradientAngle = clampNumber(buttonProperties.frameAngle, 0, 360, 45),
      frameOnOpacity = clampNumber(
        isButtonActive ? buttonProperties.frameOnOpacity : buttonProperties.frameOffOpacity,
        0,
        1,
        isButtonActive ? 1 : 0.8,
      ),
      softLightColor = normalizeCssColor(buttonProperties.softLightColor, "#ffffff"),
      softLightStrength = clampNumber(buttonProperties.softLightStrength, 0, 5, 1),
      softLightSize = clampNumber(buttonProperties.softLightSize, 0, 3, 1),
      softLightAngle = clampNumber(buttonProperties.softLightAngle, 0, 360, 45),
      buttonGlowColor = normalizeCssColor(buttonProperties.glowColor, "#ffffff"),
      glowStrength = clampNumber(buttonProperties.glowStrength, 0, 5, 1),
      glowSize = clampNumber(buttonProperties.glowSize, 0, 3, 1),
      buttonGlowAngle = clampNumber(buttonProperties.glowAngle, 0, 360, 220),
      buttonCenterX = buttonWidthPx / 2,
      buttonCenterY = buttonHeightPx / 2,
      glowAngleRadians = (buttonGlowAngle * Math.PI) / 180,
      glowCenterX = buttonCenterX + Math.cos(glowAngleRadians) * buttonWidthPx * 0.16,
      glowCenterY = buttonCenterY + Math.sin(glowAngleRadians) * buttonHeightPx * 0.18,
      filterIdPrefix =
        (buttonRenderEnvironment.renderNamespace || "renderer") +
        "-icon-button-" +
        String(buttonComponent.id || "").replace(/[^a-z0-9_-]/gi, ""),
      deviceButtonElement = document.createElement("div");
    if (
      ((deviceButtonElement.className = "hb-icon-button" + (isButtonActive ? " active" : "")),
      deviceButtonElement.style.setProperty(
        "--icon-button-main-left",
        clampNumber(buttonProperties.mainTextLeft, -100, 200, 9) + "%",
      ),
      deviceButtonElement.style.setProperty(
        "--icon-button-main-top",
        clampNumber(buttonProperties.mainTextTop, -100, 200, 78) + "%",
      ),
      deviceButtonElement.style.setProperty(
        "--icon-button-secondary-left",
        clampNumber(buttonProperties.secondaryTextLeft, -100, 200, 9) + "%",
      ),
      deviceButtonElement.style.setProperty(
        "--icon-button-secondary-top",
        clampNumber(buttonProperties.secondaryTextTop, -100, 200, 91) + "%",
      ),
      deviceButtonElement.style.setProperty(
        "--icon-button-icon-left",
        clampNumber(buttonProperties.iconLeft, -100, 200, 50) + "%",
      ),
      deviceButtonElement.style.setProperty(
        "--icon-button-icon-top",
        clampNumber(buttonProperties.iconTop, -100, 200, 34) + "%",
      ),
      deviceButtonElement.style.setProperty(
        "--icon-button-icon-glow-size",
        9 * buttonUnitHeight + "px",
      ),
      deviceButtonElement.style.setProperty(
        "--device-button-icon-glow-size",
        5 * buttonUnitHeight + "px",
      ),
      deviceButtonElement.style.setProperty(
        "--device-button-icon-active-glow-size",
        7 * buttonUnitHeight + "px",
      ),
      deviceButtonElement.style.setProperty(
        "--hb-on-fill-fade-duration",
        clampNumber(buttonProperties.onFillFadeDuration, 0, 3, 0.3) + "s",
      ),
      !isDeviceButton)
    ) {
      const buttonSvgElement = createSvgElement(deviceButtonElement, "svg", {
          viewBox: "0 0 " + buttonWidthPx + " " + buttonHeightPx,
          preserveAspectRatio: "none",
          "aria-hidden": "true",
        }),
        svgDefsElement = createSvgElement(buttonSvgElement, "defs"),
        clipPolygonPoints =
          "0,0 " +
          (buttonWidthPx - cornerCutSize) +
          ",0 " +
          buttonWidthPx +
          "," +
          cornerCutSize +
          " " +
          buttonWidthPx +
          "," +
          buttonHeightPx +
          " 0," +
          buttonHeightPx,
        clipPathElement = createSvgElement(svgDefsElement, "clipPath", {
          id: filterIdPrefix + "-clip",
        });
      createSvgElement(clipPathElement, "polygon", {
        points: clipPolygonPoints,
      });
      const softLightRadius = buttonWidthPx * 0.5 * softLightSize,
        softLightGradientElement = createSvgElement(svgDefsElement, "linearGradient", {
          id: filterIdPrefix + "-soft-light",
          gradientUnits: "userSpaceOnUse",
          x1: buttonCenterX - softLightRadius,
          y1: buttonCenterY,
          x2: buttonCenterX + softLightRadius,
          y2: buttonCenterY,
          gradientTransform:
            "rotate(" + softLightAngle + " " + buttonCenterX + " " + buttonCenterY + ")",
        });
      (createSvgElement(softLightGradientElement, "stop", {
        offset: 0,
        "stop-color": softLightColor,
        "stop-opacity": Math.min(1, 0.055 * softLightStrength),
      }),
        createSvgElement(softLightGradientElement, "stop", {
          offset: 0.55,
          "stop-color": softLightColor,
          "stop-opacity": Math.min(1, 0.018 * softLightStrength),
        }),
        createSvgElement(softLightGradientElement, "stop", {
          offset: 1,
          "stop-color": softLightColor,
          "stop-opacity": Math.min(1, 0.085 * softLightStrength),
        }));
      const edgeGradientElement = createSvgElement(svgDefsElement, "linearGradient", {
        id: filterIdPrefix + "-edge",
        gradientUnits: "userSpaceOnUse",
        x1: 0,
        y1: buttonCenterY,
        x2: buttonWidthPx,
        y2: buttonCenterY,
        gradientTransform:
          "rotate(" + frameGradientAngle + " " + buttonCenterX + " " + buttonCenterY + ")",
      });
      (createSvgElement(edgeGradientElement, "stop", {
        offset: 0,
        "stop-color": "#ffffff",
        "stop-opacity": frameOnOpacity,
      }),
        createSvgElement(edgeGradientElement, "stop", {
          offset: 0.48,
          "stop-color": "#ffffff",
          "stop-opacity": frameOnOpacity * 0.49,
        }),
        createSvgElement(edgeGradientElement, "stop", {
          offset: 1,
          "stop-color": "#ffffff",
          "stop-opacity": frameOnOpacity * 0.66,
        }));
      const glowGradientElement = createSvgElement(svgDefsElement, "radialGradient", {
        id: filterIdPrefix + "-glow",
        gradientUnits: "userSpaceOnUse",
        cx: glowCenterX,
        cy: glowCenterY,
        r: Math.min(buttonWidthPx, buttonHeightPx) * 0.42 * glowSize,
      });
      (createSvgElement(glowGradientElement, "stop", {
        offset: 0,
        "stop-color": buttonGlowColor,
        "stop-opacity": Math.min(1, 0.12 * glowStrength),
      }),
        createSvgElement(glowGradientElement, "stop", {
          offset: 0.52,
          "stop-color": buttonGlowColor,
          "stop-opacity": Math.min(1, 0.025 * glowStrength),
        }),
        createSvgElement(glowGradientElement, "stop", {
          offset: 1,
          "stop-color": buttonGlowColor,
          "stop-opacity": 0,
        }));
      const glowFilterElement = createSvgElement(svgDefsElement, "filter", {
        id: filterIdPrefix + "-glow-blur",
        x: "-40%",
        y: "-40%",
        width: "180%",
        height: "180%",
      });
      createSvgElement(glowFilterElement, "feGaussianBlur", {
        stdDeviation: Math.min(buttonWidthPx, buttonHeightPx) * 0.03,
      });
      const glowGroupElement = createSvgElement(buttonSvgElement, "g", {
        "clip-path": "url(#" + filterIdPrefix + "-clip)",
      });
      (buttonProperties.onFillVisible !== false &&
        createSvgElement(glowGroupElement, "polygon", {
          class: "hb-icon-button-on-fill",
          points: clipPolygonPoints,
          fill: normalizeCssColor(buttonProperties.onFillColor, "#dfb64f"),
          "fill-opacity": clampNumber(buttonProperties.onFillStrength, 0, 1, 1),
        }),
        buttonProperties.softLightVisible !== false &&
          softLightSize > 0 &&
          createSvgElement(glowGroupElement, "polygon", {
            points: clipPolygonPoints,
            fill: "url(#" + filterIdPrefix + "-soft-light)",
          }),
        buttonProperties.glowVisible !== false &&
          glowSize > 0 &&
          createSvgElement(glowGroupElement, "ellipse", {
            cx: glowCenterX,
            cy: glowCenterY,
            rx: buttonWidthPx * 0.42 * glowSize,
            ry: buttonHeightPx * 0.42 * glowSize,
            fill: "url(#" + filterIdPrefix + "-glow)",
            filter: "url(#" + filterIdPrefix + "-glow-blur)",
          }),
        buttonProperties.frameVisible !== false &&
          frameStrokeWidth > 0 &&
          createSvgElement(glowGroupElement, "polygon", {
            points: clipPolygonPoints,
            fill: "none",
            stroke: "url(#" + filterIdPrefix + "-edge)",
            "stroke-width": frameStrokeWidth,
            "vector-effect": "non-scaling-stroke",
          }));
    }
    const iconSource =
        String(buttonProperties.icon || "").trim() ||
        (isDeviceButton ? resolveEntityIcon(boundEntityId, boundEntityState) : "mdi:ceiling-light"),
      iconUrl = resolveMdiIconUrl(iconSource);
    if (
      iconUrl &&
      (!isDeviceButton ||
        buttonProperties.iconVisible !== false ||
        buttonProperties.hiddenContentClickable === true)
    ) {
      const buttonIconElement = document.createElement("i");
      if (
        ((buttonIconElement.className = isDeviceButton
          ? "hb-device-button-icon"
          : "hb-icon-button-icon"),
        isDeviceButton ||
          ((buttonIconElement.style.width =
            clampNumber(buttonProperties.iconSize, 1, 100, 42) + "%"),
          (buttonIconElement.style.height =
            clampNumber(buttonProperties.iconSize, 1, 100, 42) + "%")),
        (buttonIconElement.style.backgroundColor =
          isDeviceButton && isButtonActive
            ? normalizeCssColor(buttonProperties.iconOnColor, "#379bff")
            : normalizeCssColor(
                buttonProperties.iconColor ||
                  buttonProperties.iconOffColor ||
                  buttonProperties.iconOnColor,
                "#d7d8da",
              )),
        (buttonIconElement.style.opacity = isDeviceButton
          ? "1"
          : String(
              clampNumber(
                isButtonActive ? buttonProperties.iconOnOpacity : buttonProperties.iconOffOpacity,
                0,
                1,
                1,
              ),
            )),
        buttonIconElement.style.setProperty("mask-image", 'url("' + iconUrl + '")'),
        buttonIconElement.style.setProperty("-webkit-mask-image", 'url("' + iconUrl + '")'),
        isDeviceButton)
      ) {
        const baseIconSize = clampNumber(buttonProperties.iconSize, 1, 100, 28),
          badgeSize = clampNumber(buttonProperties.badgeSize ?? baseIconSize, 1, 100, baseIconSize),
          symbolSize = clampNumber(
            buttonProperties.symbolSize ?? baseIconSize * 0.5,
            1,
            100,
            baseIconSize * 0.5,
          ),
          symbolScale = clampNumber((symbolSize / badgeSize) * 100, 1, 100, 50);
        ((buttonIconElement.style.width = symbolScale + "%"),
          (buttonIconElement.style.height = symbolScale + "%"));
        const badgeElement = document.createElement("span");
        ((badgeElement.className =
          "hb-device-button-icon-badge" + (isButtonActive ? " active" : "")),
          buttonProperties.iconVisible === false && (badgeElement.style.visibility = "hidden"),
          (badgeElement.style.width = badgeSize * buttonUnitHeight + "px"),
          (badgeElement.style.height = badgeSize * buttonUnitHeight + "px"),
          badgeElement.style.setProperty(
            "--device-badge-color",
            normalizeCssColor(buttonProperties.badgeColor, "#5b5e66"),
          ),
          badgeElement.style.setProperty(
            "--device-badge-opacity",
            clampNumber(buttonProperties.badgeOpacity, 0, 1, 0.58) * 100 + "%",
          ),
          badgeElement.append(buttonIconElement),
          deviceButtonElement.append(badgeElement));
      } else deviceButtonElement.append(buttonIconElement);
    }
    const buttonTextElement = document.createElement("span");
    buttonTextElement.className = "hb-icon-button-text";
    const mainTextSize = clampNumber(buttonProperties.mainSize, 6, 120, 25),
      primaryTextElement = document.createElement("strong");
    ((primaryTextElement.textContent = isDeviceButton
      ? String(buttonProperties.mainText || "").trim() ||
        String(entityStatePayload?.attributes?.friendly_name || boundEntityId || "未选择实体")
      : String(buttonProperties.mainText || "主灯")),
      (primaryTextElement.style.color = normalizeCssColor(
        buttonProperties.mainColor || buttonProperties.mainOffColor || buttonProperties.mainOnColor,
        "#c7c8cb",
      )),
      (primaryTextElement.style.opacity = isDeviceButton
        ? "1"
        : String(
            clampNumber(
              isButtonActive ? buttonProperties.mainOnOpacity : buttonProperties.mainOffOpacity,
              0,
              1,
              1,
            ),
          )),
      (primaryTextElement.style.fontSize = mainTextSize * buttonUnitHeight + "px"),
      (primaryTextElement.style.letterSpacing =
        clampNumber(buttonProperties.mainSpacing, -20, 100, 1) * buttonUnitHeight + "px"),
      applyTextOutline(primaryTextElement, buttonProperties.mainWeight, mainTextSize),
      (primaryTextElement.hidden =
        isDeviceButton &&
        buttonProperties.mainTextVisible === false &&
        buttonProperties.hiddenContentClickable !== true),
      isDeviceButton &&
        buttonProperties.mainTextVisible === false &&
        buttonProperties.hiddenContentClickable === true &&
        (primaryTextElement.style.visibility = "hidden"));
    const secondaryTextSize = clampNumber(buttonProperties.secondarySize, 5, 80, 10),
      secondaryLabelElement = document.createElement("small");
    return (
      (secondaryLabelElement.textContent = isDeviceButton
        ? String(buttonProperties.secondaryText || "").trim() ||
          (boundEntityId
            ? formatEntityState(boundEntityState, boundEntityId, {
                ...buttonRenderEnvironment,
                component: buttonComponent,
              })
            : "未选择实体")
        : String(buttonProperties.secondaryText || "MAIN LIGHT")),
      (secondaryLabelElement.style.color = normalizeCssColor(
        buttonProperties.secondaryColor ||
          buttonProperties.secondaryOffColor ||
          buttonProperties.secondaryOnColor,
        "#75777d",
      )),
      (secondaryLabelElement.style.opacity = isDeviceButton
        ? "1"
        : String(
            clampNumber(
              isButtonActive
                ? buttonProperties.secondaryOnOpacity
                : buttonProperties.secondaryOffOpacity,
              0,
              1,
              1,
            ),
          )),
      (secondaryLabelElement.style.fontSize = secondaryTextSize * buttonUnitHeight + "px"),
      (secondaryLabelElement.style.letterSpacing =
        clampNumber(buttonProperties.secondarySpacing, -20, 100, 0.7) * buttonUnitHeight + "px"),
      applyTextOutline(secondaryLabelElement, buttonProperties.secondaryWeight, secondaryTextSize),
      (secondaryLabelElement.hidden =
        isDeviceButton &&
        buttonProperties.secondaryTextVisible === false &&
        buttonProperties.hiddenContentClickable !== true),
      isDeviceButton &&
        buttonProperties.secondaryTextVisible === false &&
        buttonProperties.hiddenContentClickable === true &&
        (secondaryLabelElement.style.visibility = "hidden"),
      buttonTextElement.append(primaryTextElement, secondaryLabelElement),
      deviceButtonElement.append(buttonTextElement),
      deviceButtonElement
    );
  },
};
(registerComponent("icon-button", buttonComponentRenderers),
  registerComponent("device-button", buttonComponentRenderers));
function createDoorWindowSensorView(
  sensorComponent: any,
  doorWindowProperties: any,
  sensorState: any,
  sensorRenderEnvironment: any,
) {
  const sensorAccentColor = normalizeCssColor(
      doorWindowProperties.iconOnColor || doorWindowProperties.occupiedColor,
      "#ffffff",
    ),
    isDoorWindowOpen = sensorState.key === "occupied",
    sensorStateLabel = isDoorWindowOpen
      ? "打开"
      : sensorState.key === "clear"
        ? "关闭"
        : sensorState.key === "unavailable"
          ? "离线"
          : "未知",
    doorWindowSensorElement = document.createElement("div");
  ((doorWindowSensorElement.className =
    "hb-door-window-sensor is-" + (isDoorWindowOpen ? "open" : sensorState.key)),
    (doorWindowSensorElement.dataset.sensorState = isDoorWindowOpen ? "open" : sensorState.key),
    doorWindowSensorElement.style.setProperty("--hb-door-window-accent", sensorAccentColor),
    doorWindowSensorElement.setAttribute("role", "img"),
    doorWindowSensorElement.setAttribute("aria-label", "门窗传感器：" + sensorStateLabel));
  const doorWindowVisualElement = document.createElement("div");
  doorWindowVisualElement.className = "hb-door-window-visual";
  const componentScale = Math.max(
      0.01,
      Number(sensorRenderEnvironment.document?.canvas?.componentScale || 1),
    ),
    visualWidth = Math.max(1, Number(sensorComponent.position?.width || 100) / componentScale),
    visualHeight = Math.max(1, Number(sensorComponent.position?.height || 100) / componentScale);
  doorWindowVisualElement.style.transform = doorWindowPerspectiveMatrix(
    visualWidth,
    visualHeight,
    doorWindowProperties.perspectiveCorners,
  );
  const doorWindowFrameElement = document.createElement("span");
  doorWindowFrameElement.className = "hb-door-window-frame";
  const leftPanelElement = document.createElement("span");
  leftPanelElement.className = "hb-door-window-panel left";
  const rightPanelElement = document.createElement("span");
  ((rightPanelElement.className = "hb-door-window-panel right"),
    leftPanelElement.append(document.createElement("i")),
    rightPanelElement.append(document.createElement("i")),
    doorWindowFrameElement.append(leftPanelElement, rightPanelElement));
  const airflowElement = document.createElement("span");
  airflowElement.className = "hb-door-window-airflow";
  for (let airflowDotIndex = 0; airflowDotIndex < 3; airflowDotIndex += 1)
    airflowElement.append(document.createElement("i"));
  return (
    doorWindowVisualElement.append(doorWindowFrameElement, airflowElement),
    doorWindowSensorElement.append(doorWindowVisualElement),
    doorWindowSensorElement
  );
}
function createWaterLeakSensorView(waterLeakProperties: any, waterLeakState: any) {
  const waterLeakColor = normalizeCssColor(waterLeakProperties.waterLeakColor, "#42c8ff"),
    isWaterLeakWet = waterLeakState.key === "occupied",
    waterLeakStateLabel = isWaterLeakWet
      ? "检测到水浸"
      : waterLeakState.key === "clear"
        ? "正常"
        : waterLeakState.key === "unavailable"
          ? "离线"
          : "未知",
    waterLeakSensorElement = document.createElement("div");
  ((waterLeakSensorElement.className =
    "hb-water-leak-sensor is-" + (isWaterLeakWet ? "wet" : waterLeakState.key)),
    (waterLeakSensorElement.dataset.sensorState = isWaterLeakWet ? "wet" : waterLeakState.key),
    waterLeakSensorElement.style.setProperty("--hb-water-leak-accent", waterLeakColor),
    waterLeakSensorElement.setAttribute("role", "img"),
    waterLeakSensorElement.setAttribute("aria-label", "水浸传感器：" + waterLeakStateLabel));
  const waterLeakVisualElement = document.createElement("div");
  waterLeakVisualElement.className = "hb-water-leak-visual";
  const puddleElement = document.createElement("span");
  puddleElement.className = "hb-water-leak-puddle";
  const ripplesElement = document.createElement("span");
  ripplesElement.className = "hb-water-leak-ripples";
  for (let rippleIndex = 0; rippleIndex < 3; rippleIndex += 1)
    ripplesElement.append(document.createElement("i"));
  const svgUrl = "http://www.w3.org/2000/svg",
    dropletSvgElement = document.createElementNS(svgUrl, "svg");
  (dropletSvgElement.setAttribute("class", "hb-water-leak-droplet"),
    dropletSvgElement.setAttribute("viewBox", "0 0 48 64"),
    dropletSvgElement.setAttribute("aria-hidden", "true"));
  const dropletBodyPathElement = document.createElementNS(svgUrl, "path");
  (dropletBodyPathElement.setAttribute("class", "body"),
    dropletBodyPathElement.setAttribute(
      "d",
      "M24 3C20 10 6 27 6 40c0 11 8 20 18 20s18-9 18-20C42 27 28 10 24 3Z",
    ));
  const dropletHighlightPathElement = document.createElementNS(svgUrl, "path");
  return (
    dropletHighlightPathElement.setAttribute("class", "highlight"),
    dropletHighlightPathElement.setAttribute("d", "M15 40c0-6 3-12 8-18"),
    dropletSvgElement.append(dropletBodyPathElement, dropletHighlightPathElement),
    waterLeakVisualElement.append(puddleElement, ripplesElement, dropletSvgElement),
    waterLeakSensorElement.append(waterLeakVisualElement),
    waterLeakSensorElement
  );
}
function createSmokeSensorView(smokeProperties: any, smokeState: any) {
  const smokeColor = normalizeCssColor(smokeProperties.smokeColor, "#ffffff"),
    isSmokeAlert = smokeState.key === "occupied",
    smokeStateLabel = isSmokeAlert
      ? "检测到烟雾"
      : smokeState.key === "clear"
        ? "正常"
        : smokeState.key === "unavailable"
          ? "离线"
          : "未知",
    smokeSensorElement = document.createElement("div");
  ((smokeSensorElement.className =
    "hb-smoke-sensor is-" + (isSmokeAlert ? "alert" : smokeState.key)),
    (smokeSensorElement.dataset.sensorState = isSmokeAlert ? "alert" : smokeState.key),
    smokeSensorElement.style.setProperty("--hb-smoke-accent", smokeColor),
    smokeSensorElement.setAttribute("role", "img"),
    smokeSensorElement.setAttribute("aria-label", "烟雾传感器：" + smokeStateLabel));
  const smokeVisualElement = document.createElement("span");
  smokeVisualElement.className = "hb-smoke-visual";
  const smokeGroundElement = document.createElement("span");
  smokeGroundElement.className = "hb-smoke-ground";
  const smokeSvgUrl = "http://www.w3.org/2000/svg",
    smokeWispsSvgElement = document.createElementNS(smokeSvgUrl, "svg");
  (smokeWispsSvgElement.setAttribute("class", "hb-smoke-wisps"),
    smokeWispsSvgElement.setAttribute("viewBox", "0 0 100 100"),
    smokeWispsSvgElement.setAttribute("aria-hidden", "true"));
  for (const wispPathDefinition of [
    "M27 94C12 76 41 67 27 49C13 32 38 22 30 7",
    "M50 97C34 79 65 69 49 50C35 33 61 21 52 3",
    "M73 93C60 77 86 66 72 48C59 32 83 22 75 8",
  ]) {
    const wispPathElement = document.createElementNS(smokeSvgUrl, "path");
    (wispPathElement.setAttribute("d", wispPathDefinition),
      smokeWispsSvgElement.append(wispPathElement));
  }
  return (
    smokeVisualElement.append(smokeGroundElement, smokeWispsSvgElement),
    smokeSensorElement.append(smokeVisualElement),
    smokeSensorElement
  );
}
function createNaturalGasSensorView(naturalGasProperties: any, naturalGasState: any) {
  const naturalGasColor = normalizeCssColor(naturalGasProperties.naturalGasColor, "#ffb347"),
    isNaturalGasAlert = naturalGasState.key === "occupied",
    naturalGasStateLabel = isNaturalGasAlert
      ? "检测到天然气"
      : naturalGasState.key === "clear"
        ? "正常"
        : naturalGasState.key === "unavailable"
          ? "离线"
          : "未知",
    naturalGasSensorElement = document.createElement("div");
  ((naturalGasSensorElement.className =
    "hb-natural-gas-sensor is-" + (isNaturalGasAlert ? "alert" : naturalGasState.key)),
    (naturalGasSensorElement.dataset.sensorState = isNaturalGasAlert
      ? "alert"
      : naturalGasState.key),
    naturalGasSensorElement.style.setProperty("--hb-natural-gas-accent", naturalGasColor),
    naturalGasSensorElement.setAttribute("role", "img"),
    naturalGasSensorElement.setAttribute("aria-label", "天然气传感器：" + naturalGasStateLabel));
  const naturalGasVisualElement = document.createElement("span");
  naturalGasVisualElement.className = "hb-natural-gas-visual";
  const naturalGasHazeElement = document.createElement("span");
  naturalGasHazeElement.className = "hb-natural-gas-haze";
  const naturalGasSvgUrl = "http://www.w3.org/2000/svg",
    naturalGasSvgElement = document.createElementNS(naturalGasSvgUrl, "svg");
  (naturalGasSvgElement.setAttribute("class", "hb-natural-gas-currents"),
    naturalGasSvgElement.setAttribute("viewBox", "0 0 120 80"),
    naturalGasSvgElement.setAttribute("aria-hidden", "true"));
  for (const currentPathDefinition of [
    "M3 19C23 5 38 32 58 18C78 4 94 29 117 13",
    "M0 40C20 26 35 53 55 39C76 24 94 54 120 35",
    "M5 62C26 47 42 74 64 58C85 43 101 67 117 54",
  ]) {
    const currentPathElement = document.createElementNS(naturalGasSvgUrl, "path");
    (currentPathElement.setAttribute("d", currentPathDefinition),
      naturalGasSvgElement.append(currentPathElement));
  }
  return (
    naturalGasVisualElement.append(naturalGasHazeElement, naturalGasSvgElement),
    naturalGasSensorElement.append(naturalGasVisualElement),
    naturalGasSensorElement
  );
}
(registerComponent("presence-sensor", {
  render(sensorViewComponent: any, sensorViewRenderEnvironment: any) {
    const sensorProperties = sensorViewComponent.properties || {},
      sensorEntityId = sensorViewComponent.bindings?.entity?.entityId || "",
      sensorEntityState = sensorViewRenderEnvironment.states?.get(sensorEntityId),
      presenceMotionConfig = presenceMotionEventConfig(
        sensorEntityId,
        sensorEntityState,
        sensorViewRenderEnvironment.entityMetadata,
        sensorViewRenderEnvironment.states,
        sensorProperties,
      ),
      presencePresentation = presenceSensorPresentation(
        sensorEntityState,
        sensorViewRenderEnvironment.editable ? sensorViewRenderEnvironment.previewState : "auto",
        presenceMotionConfig,
      );
    if (sensorProperties.sensorKind === "door-window")
      return createDoorWindowSensorView(
        sensorViewComponent,
        sensorProperties,
        presencePresentation,
        sensorViewRenderEnvironment,
      );
    if (sensorProperties.sensorKind === "water-leak")
      return createWaterLeakSensorView(sensorProperties, presencePresentation);
    if (sensorProperties.sensorKind === "smoke")
      return createSmokeSensorView(sensorProperties, presencePresentation);
    if (sensorProperties.sensorKind === "natural-gas")
      return createNaturalGasSensorView(sensorProperties, presencePresentation);
    const occupiedAccentColor = normalizeCssColor(
        sensorProperties.iconOnColor || sensorProperties.occupiedColor,
        "#ffffff",
      ),
      clearAccentColor = normalizeCssColor(
        sensorProperties.iconColor || sensorProperties.clearColor,
        "#758189",
      ),
      contentUnits = componentContentUnitsPx(sensorViewComponent, sensorViewRenderEnvironment),
      presenceSensorElement = document.createElement("div");
    ((presenceSensorElement.className = "hb-presence-sensor is-" + presencePresentation.key),
      presenceSensorElement.classList.toggle(
        "is-halo-hidden",
        sensorProperties.haloVisible === false,
      ),
      presenceSensorElement.classList.toggle(
        "is-person-hidden",
        sensorProperties.personVisible === false,
      ),
      (presenceSensorElement.dataset.presenceState = presencePresentation.key),
      presenceSensorElement.style.setProperty("--hb-presence-occupied", occupiedAccentColor),
      presenceSensorElement.style.setProperty("--hb-presence-clear", clearAccentColor));
    const animationStrength = clampNumber(sensorProperties.animationStrength, 0, 1, 0.72),
      haloScale = clampNumber(sensorProperties.haloScale, 0.2, 3, 1),
      haloScaleX = clampNumber(sensorProperties.haloScaleX, 0.2, 3, haloScale),
      haloScaleY = clampNumber(sensorProperties.haloScaleY, 0.2, 3, haloScale),
      haloRotation = clampNumber(sensorProperties.haloRotation, -360, 360, 0),
      haloOpacity = clampNumber(sensorProperties.haloOpacity, 0, 1, 1),
      personScale = clampNumber(sensorProperties.personScale, 0.2, 3, 1),
      personRotation = clampNumber(sensorProperties.personRotation, -360, 360, 0),
      personOpacity = clampNumber(sensorProperties.personOpacity, 0, 1, 1),
      orbitDuration = clampNumber(sensorProperties.orbitDuration, 2, 60, 8);
    presenceSensorElement.style.setProperty("--hb-presence-motion", String(animationStrength));
    const waveDurationSeconds = Number((3.2 - animationStrength * 0.8).toFixed(2));
    if (
      (presenceSensorElement.style.setProperty(
        "--hb-presence-wave-duration",
        waveDurationSeconds + "s",
      ),
      presenceSensorElement.style.setProperty("--hb-presence-halo-scale-x", String(haloScaleX)),
      presenceSensorElement.style.setProperty("--hb-presence-halo-scale-y", String(haloScaleY)),
      presenceSensorElement.style.setProperty("--hb-presence-halo-rotation", haloRotation + "deg"),
      presenceSensorElement.style.setProperty("--hb-presence-halo-opacity", String(haloOpacity)),
      presenceSensorElement.style.setProperty("--hb-presence-person-scale", String(personScale)),
      presenceSensorElement.style.setProperty(
        "--hb-presence-person-rotation",
        personRotation + "deg",
      ),
      presenceSensorElement.style.setProperty(
        "--hb-presence-person-opacity",
        String(personOpacity),
      ),
      presenceSensorElement.style.setProperty("--hb-presence-orbit-duration", orbitDuration + "s"),
      presencePresentation.key === "occupied")
    ) {
      const animationPhase = presenceAnimationPhase(sensorEntityState, {
        orbit: orbitDuration,
        wave: waveDurationSeconds,
      });
      (presenceSensorElement.style.setProperty(
        "--hb-presence-orbit-delay",
        animationPhase.orbitDelay,
      ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-wave-delay",
          animationPhase.waveDelay,
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-floor-delay",
          animationPhase.floorDelay,
        ),
        presenceSensorElement.style.setProperty(
          "--hb-presence-step-delay",
          animationPhase.stepDelay,
        ));
    }
    const orbitOffsetX = 32 * haloScaleX * contentUnits.width,
      orbitOffsetY = 13 * haloScaleY * contentUnits.height;
    (presenceSensorElement.style.setProperty(
      "--hb-presence-orbit-x",
      orbitOffsetX.toFixed(4) + "px",
    ),
      presenceSensorElement.style.setProperty(
        "--hb-presence-orbit-x-negative",
        (-orbitOffsetX).toFixed(4) + "px",
      ),
      presenceSensorElement.style.setProperty(
        "--hb-presence-orbit-y",
        orbitOffsetY.toFixed(4) + "px",
      ),
      presenceSensorElement.style.setProperty(
        "--hb-presence-orbit-y-negative",
        (-orbitOffsetY).toFixed(4) + "px",
      ),
      presenceSensorElement.style.setProperty(
        "--hb-presence-orbit-x-diagonal",
        (orbitOffsetX * 0.707).toFixed(4) + "px",
      ),
      presenceSensorElement.style.setProperty(
        "--hb-presence-orbit-x-diagonal-negative",
        (-orbitOffsetX * 0.707).toFixed(4) + "px",
      ),
      presenceSensorElement.style.setProperty(
        "--hb-presence-orbit-y-diagonal",
        (orbitOffsetY * 0.707).toFixed(4) + "px",
      ),
      presenceSensorElement.style.setProperty(
        "--hb-presence-orbit-y-diagonal-negative",
        (-orbitOffsetY * 0.707).toFixed(4) + "px",
      ),
      presenceSensorElement.style.setProperty(
        "--hb-presence-orbit-x-shallow",
        (orbitOffsetX * 0.382683).toFixed(4) + "px",
      ),
      presenceSensorElement.style.setProperty(
        "--hb-presence-orbit-x-shallow-negative",
        (-orbitOffsetX * 0.382683).toFixed(4) + "px",
      ),
      presenceSensorElement.style.setProperty(
        "--hb-presence-orbit-x-steep",
        (orbitOffsetX * 0.92388).toFixed(4) + "px",
      ),
      presenceSensorElement.style.setProperty(
        "--hb-presence-orbit-x-steep-negative",
        (-orbitOffsetX * 0.92388).toFixed(4) + "px",
      ),
      presenceSensorElement.style.setProperty(
        "--hb-presence-orbit-y-shallow",
        (orbitOffsetY * 0.382683).toFixed(4) + "px",
      ),
      presenceSensorElement.style.setProperty(
        "--hb-presence-orbit-y-shallow-negative",
        (-orbitOffsetY * 0.382683).toFixed(4) + "px",
      ),
      presenceSensorElement.style.setProperty(
        "--hb-presence-orbit-y-steep",
        (orbitOffsetY * 0.92388).toFixed(4) + "px",
      ),
      presenceSensorElement.style.setProperty(
        "--hb-presence-orbit-y-steep-negative",
        (-orbitOffsetY * 0.92388).toFixed(4) + "px",
      ),
      presenceSensorElement.style.setProperty(
        "--hb-presence-person-width",
        22 * contentUnits.width + "px",
      ),
      presenceSensorElement.style.setProperty(
        "--hb-presence-person-height",
        62 * contentUnits.height + "px",
      ),
      presenceSensorElement.style.setProperty(
        "--hb-presence-copy-gap",
        7 * contentUnits.height + "px",
      ),
      presenceSensorElement.style.setProperty(
        "--hb-presence-copy-main-size",
        20 * contentUnits.height + "px",
      ),
      presenceSensorElement.style.setProperty(
        "--hb-presence-copy-secondary-size",
        10 * contentUnits.height + "px",
      ),
      presenceSensorElement.setAttribute("role", "img"),
      presenceSensorElement.setAttribute(
        "aria-label",
        "人在传感器：" + presencePresentation.label,
      ));
    const presenceVisualElement = document.createElement("div");
    presenceVisualElement.className = "hb-presence-sensor-visual";
    const presenceHaloElement = document.createElement("span");
    presenceHaloElement.className = "hb-presence-sensor-halo";
    const presenceSpaceElement = document.createElement("span");
    presenceSpaceElement.className = "hb-presence-sensor-space";
    for (let spaceDotIndex = 0; spaceDotIndex < 3; spaceDotIndex += 1)
      presenceSpaceElement.append(document.createElement("i"));
    const presencePersonElement = document.createElement("span");
    presencePersonElement.className = "hb-presence-sensor-person";
    const personHeadElement = document.createElement("i"),
      personTorsoElement = document.createElement("b"),
      personLeftArmElement = document.createElement("span");
    personLeftArmElement.className = "arm left";
    const personRightArmElement = document.createElement("span");
    personRightArmElement.className = "arm right";
    const personLeftLegElement = document.createElement("span");
    personLeftLegElement.className = "leg left";
    const personRightLegElement = document.createElement("span");
    ((personRightLegElement.className = "leg right"),
      presencePersonElement.append(
        personHeadElement,
        personTorsoElement,
        personLeftArmElement,
        personRightArmElement,
        personLeftLegElement,
        personRightLegElement,
      ));
    const presenceFloorElement = document.createElement("span");
    ((presenceFloorElement.className = "hb-presence-sensor-floor"),
      presenceHaloElement.append(presenceSpaceElement, presenceFloorElement));
    const presenceOrbitElement = document.createElement("span");
    presenceOrbitElement.className = "hb-presence-sensor-orbit";
    const presenceTravelerElement = document.createElement("span");
    if (
      ((presenceTravelerElement.className = "hb-presence-sensor-traveler"),
      presenceTravelerElement.append(presencePersonElement),
      presenceOrbitElement.append(presenceTravelerElement),
      presenceVisualElement.append(presenceHaloElement, presenceOrbitElement),
      presenceSensorElement.append(presenceVisualElement),
      !sensorViewRenderEnvironment.editable &&
        presenceMotionConfig.motionEvent &&
        presencePresentation.key === "occupied")
    ) {
      const stateTimestamp = presenceStateTimestamp(sensorEntityState),
        motionTimeoutRemainingMs = Number.isFinite(stateTimestamp)
          ? presenceMotionConfig.motionTimeoutSeconds * 1000 - (Date.now() - stateTimestamp!)
          : 0;
      if (motionTimeoutRemainingMs > 0) {
        const motionTimeoutHandle = window.setTimeout(
          () => sensorViewRenderEnvironment.invalidate?.(),
          motionTimeoutRemainingMs + 80,
        );
        sensorViewRenderEnvironment.cleanup(() => window.clearTimeout(motionTimeoutHandle));
      }
    }
    return presenceSensorElement;
  },
}),
  registerComponent("air-conditioner", {
    render(airConditionerComponent: any, airConditionerRenderEnvironment: any) {
      const airConditionerProperties = airConditionerComponent.properties || {},
        airConditionerEntityId = airConditionerComponent.bindings?.entity?.entityId || "",
        airConditionerEntityState = resolveStatePayload(
          airConditionerRenderEnvironment.states?.get(airConditionerEntityId),
        ),
        airConditionerDeviceType = resolveClimateDeviceType(
          airConditionerComponent,
          airConditionerEntityState,
          airConditionerEntityId,
        ),
        isClimatePowered = isClimatePoweredOn(
          airConditionerComponent,
          airConditionerRenderEnvironment,
        ),
        { height: contentUnitHeight } = componentContentUnitsPx(
          airConditionerComponent,
          airConditionerRenderEnvironment,
        ),
        airConditionerElement = document.createElement("div");
      ((airConditionerElement.className =
        "hb-air-conditioner" + (isClimatePowered ? " active" : "")),
        airConditionerElement.style.setProperty(
          "--climate-icon-left",
          clampNumber(airConditionerProperties.iconLeft, -100, 200, 20) + "%",
        ),
        airConditionerElement.style.setProperty(
          "--climate-icon-top",
          clampNumber(airConditionerProperties.iconTop, -100, 200, 50) + "%",
        ),
        airConditionerElement.style.setProperty(
          "--climate-main-left",
          clampNumber(airConditionerProperties.mainTextLeft, -100, 200, 39) + "%",
        ),
        airConditionerElement.style.setProperty(
          "--climate-main-top",
          clampNumber(airConditionerProperties.mainTextTop, -100, 200, 40) + "%",
        ),
        airConditionerElement.style.setProperty(
          "--climate-secondary-left",
          clampNumber(airConditionerProperties.secondaryTextLeft, -100, 200, 39) + "%",
        ),
        airConditionerElement.style.setProperty(
          "--climate-secondary-top",
          clampNumber(airConditionerProperties.secondaryTextTop, -100, 200, 67) + "%",
        ),
        airConditionerElement.style.setProperty(
          "--climate-badge-color",
          normalizeCssColor(airConditionerProperties.badgeColor, "#5b5e66"),
        ),
        airConditionerElement.style.setProperty(
          "--climate-badge-opacity",
          clampNumber(airConditionerProperties.badgeOpacity, 0, 1, 0.58) * 100 + "%",
        ));
      const airConditionerIconColor = normalizeCssColor(
        isClimatePowered
          ? airConditionerProperties.iconOnColor
          : airConditionerProperties.iconOffColor,
        isClimatePowered ? "#73c8ff" : "#9aa5ad",
      );
      (airConditionerElement.style.setProperty("--climate-icon-color", airConditionerIconColor),
        airConditionerElement.style.setProperty(
          "--climate-icon-glow-size",
          7 * contentUnitHeight + "px",
        ));
      const badgeSizePx = clampNumber(airConditionerProperties.badgeSize, 1, 100, 28),
        symbolSizePx = clampNumber(airConditionerProperties.symbolSize, 1, 100, 14);
      if (airConditionerProperties.iconVisible !== false) {
        const iconBadgeElement = document.createElement("span");
        ((iconBadgeElement.className = "hb-air-conditioner-icon-badge"),
          (iconBadgeElement.style.width = badgeSizePx * contentUnitHeight + "px"),
          (iconBadgeElement.style.height = badgeSizePx * contentUnitHeight + "px"));
        const configuredIconName = String(airConditionerProperties.icon || ""),
          resolvedIconName =
            airConditionerDeviceType === "bath-heater" &&
            (!configuredIconName || configuredIconName === "mdi:air-conditioner")
              ? climateDefaultIcon(airConditionerDeviceType)
              : configuredIconName || climateDefaultIcon(airConditionerDeviceType),
          resolvedIconUrl = resolveMdiIconUrl(resolvedIconName);
        if (resolvedIconUrl) {
          const airConditionerIconElement = document.createElement("i");
          airConditionerIconElement.className = "hb-air-conditioner-icon";
          const iconScalePercent = clampNumber((symbolSizePx / badgeSizePx) * 100, 1, 100, 50);
          ((airConditionerIconElement.style.width = iconScalePercent + "%"),
            (airConditionerIconElement.style.height = iconScalePercent + "%"),
            (airConditionerIconElement.style.backgroundColor = airConditionerIconColor),
            airConditionerIconElement.style.setProperty(
              "mask-image",
              'url("' + resolvedIconUrl + '")',
            ),
            airConditionerIconElement.style.setProperty(
              "-webkit-mask-image",
              'url("' + resolvedIconUrl + '")',
            ),
            iconBadgeElement.append(airConditionerIconElement));
        }
        airConditionerElement.append(iconBadgeElement);
      }
      const airConditionerTextElement = document.createElement("span");
      airConditionerTextElement.className = "hb-air-conditioner-text";
      const mainTextSizePx = clampNumber(airConditionerProperties.mainSize, 6, 120, 21),
        airConditionerMainTextElement = document.createElement("strong");
      ((airConditionerMainTextElement.textContent =
        String(airConditionerProperties.mainText || "").trim() ||
        String(
          airConditionerEntityState?.attributes?.friendly_name ||
            airConditionerEntityId ||
            (airConditionerDeviceType === "bath-heater" ? "未选择浴霸实体" : "未选择空调实体"),
        )),
        (airConditionerMainTextElement.style.color = normalizeCssColor(
          airConditionerProperties.mainColor,
          "#c7c8cb",
        )),
        (airConditionerMainTextElement.style.fontSize = mainTextSizePx * contentUnitHeight + "px"),
        (airConditionerMainTextElement.style.letterSpacing =
          clampNumber(airConditionerProperties.mainSpacing, -20, 100, 0.5) * contentUnitHeight +
          "px"),
        applyTextOutline(
          airConditionerMainTextElement,
          airConditionerProperties.mainWeight,
          mainTextSizePx,
        ));
      const secondaryTextSizePx = clampNumber(airConditionerProperties.secondarySize, 5, 80, 12),
        airConditionerSecondaryTextElement = document.createElement("small");
      return (
        (airConditionerSecondaryTextElement.textContent = airConditionerEntityId
          ? formatClimateStateLabel(airConditionerComponent, airConditionerRenderEnvironment)
          : "未选择实体"),
        (airConditionerSecondaryTextElement.style.color = normalizeCssColor(
          airConditionerProperties.secondaryColor,
          "#75777d",
        )),
        (airConditionerSecondaryTextElement.style.fontSize =
          secondaryTextSizePx * contentUnitHeight + "px"),
        (airConditionerSecondaryTextElement.style.letterSpacing =
          clampNumber(airConditionerProperties.secondarySpacing, -20, 100, 0.3) *
            contentUnitHeight +
          "px"),
        applyTextOutline(
          airConditionerSecondaryTextElement,
          airConditionerProperties.secondaryWeight,
          secondaryTextSizePx,
        ),
        airConditionerProperties.mainTextVisible !== false &&
          airConditionerTextElement.append(airConditionerMainTextElement),
        airConditionerProperties.secondaryTextVisible !== false &&
          airConditionerTextElement.append(airConditionerSecondaryTextElement),
        airConditionerTextElement.childElementCount &&
          airConditionerElement.append(airConditionerTextElement),
        airConditionerElement
      );
    },
  }));
function cameraRadiusRatio(rawRadiusRatio: any, fallbackRadiusRatio = 0.04) {
  const numericRadiusRatio = Number(rawRadiusRatio);
  return Number.isFinite(numericRadiusRatio)
    ? clampNumber(
        numericRadiusRatio > 0.5 ? numericRadiusRatio / 100 : numericRadiusRatio,
        0,
        0.5,
        fallbackRadiusRatio,
      )
    : fallbackRadiusRatio;
}
function appendCameraFrame(
  frameHostElement: any,
  targetEntityFrame: any,
  cameraFrameOptions: RenderPropertyBag = {},
  frameIdPrefix = "renderer",
) {
  if (!frameHostElement || cameraFrameOptions.frameVisible === false) return null;
  const viewportPixelWidth = Math.max(
      20,
      Number(targetEntityFrame?.position?.width || frameHostElement.clientWidth || 320),
    ),
    viewportPixelHeight = Math.max(
      20,
      Number(targetEntityFrame?.position?.height || frameHostElement.clientHeight || 180),
    ),
    cameraFrameStrokeWidth = clampNumber(cameraFrameOptions.frameWidth, 0, 20, 1);
  if (cameraFrameStrokeWidth <= 0) return null;
  const frameStrokeInset = Math.max(0.5, cameraFrameStrokeWidth / 2 + 0.5),
    frameInnerWidth = Math.max(1, viewportPixelWidth - frameStrokeInset * 2),
    frameInnerHeight = Math.max(1, viewportPixelHeight - frameStrokeInset * 2),
    cornerRadiusRatio = cameraRadiusRatio(cameraFrameOptions.radius),
    frameCornerRadius = Math.min(frameInnerWidth, frameInnerHeight) * cornerRadiusRatio,
    cameraFrameOpacity = clampNumber(cameraFrameOptions.frameOpacity, 0, 1, 0.9),
    cameraFrameColor = normalizeCssColor(cameraFrameOptions.frameColor, "#d4d4d4"),
    cameraFrameId =
      frameIdPrefix +
      "-camera-frame-" +
      String(targetEntityFrame?.id || "").replace(/[^a-z0-9_-]/gi, ""),
    cameraFrameSvgElement = createSvgElement(frameHostElement, "svg", {
      class: "hb-camera-frame",
      viewBox: "0 0 " + viewportPixelWidth + " " + viewportPixelHeight,
      preserveAspectRatio: "none",
      "aria-hidden": "true",
    }),
    cameraFrameDefsElement = createSvgElement(cameraFrameSvgElement, "defs"),
    cameraFrameGradientElement = createSvgElement(cameraFrameDefsElement, "linearGradient", {
      id: cameraFrameId + "-edge",
      gradientUnits: "userSpaceOnUse",
      x1: 0,
      y1: viewportPixelHeight / 2,
      x2: viewportPixelWidth,
      y2: viewportPixelHeight / 2,
      gradientTransform:
        "rotate(" +
        clampNumber(cameraFrameOptions.frameAngle, 0, 360, 45) +
        " " +
        viewportPixelWidth / 2 +
        " " +
        viewportPixelHeight / 2 +
        ")",
    });
  for (const [gradientStopOffset, gradientStopOpacity] of [
    [0, 0.96],
    [0.22, 0.72],
    [0.52, 0.3],
    [0.78, 0.66],
    [1, 0.42],
  ])
    createSvgElement(cameraFrameGradientElement, "stop", {
      offset: gradientStopOffset,
      "stop-color": cameraFrameColor,
      "stop-opacity": gradientStopOpacity * cameraFrameOpacity,
    });
  return (
    createSvgElement(cameraFrameSvgElement, "rect", {
      x: frameStrokeInset,
      y: frameStrokeInset,
      width: frameInnerWidth,
      height: frameInnerHeight,
      rx: frameCornerRadius,
      fill: "none",
      stroke: "url(#" + cameraFrameId + "-edge)",
      "stroke-width": cameraFrameStrokeWidth,
      "vector-effect": "non-scaling-stroke",
    }),
    cameraFrameSvgElement
  );
}
const CAMERA_SOURCE_CACHE_TTL_MS = 30000,
  CAMERA_MAX_SOURCES = 4,
  cameraSourceByEntityId = new Map(),
  pendingSourceRequestByEntityId = new Map();
async function resolveCameraStreamSource(sourceEntityId: any) {
  const normalizedCameraEntityId = String(sourceEntityId || "").trim();
  if (!normalizedCameraEntityId) throw new Error("Camera entity is required");
  const requestTimestampMs = Date.now(),
    cachedSourceRecord = cameraSourceByEntityId.get(normalizedCameraEntityId);
  if (
    cachedSourceRecord &&
    requestTimestampMs - cachedSourceRecord.createdAt < CAMERA_SOURCE_CACHE_TTL_MS
  )
    return cachedSourceRecord.source;
  const pendingSourceRequest = pendingSourceRequestByEntityId.get(normalizedCameraEntityId);
  if (pendingSourceRequest) return pendingSourceRequest;
  const sourceRequestPromise = (async () => {
    const cameraHlsResponse = await fetch(
      "/api/camera_hls/" + encodeURIComponent(normalizedCameraEntityId),
    );
    if (!cameraHlsResponse.ok)
      throw new Error("Camera HLS request failed: " + cameraHlsResponse.status);
    const cameraHlsPayload = await cameraHlsResponse.json(),
      cameraStreamUrl = typeof cameraHlsPayload?.url == "string" ? cameraHlsPayload.url.trim() : "";
    if (!cameraStreamUrl.startsWith("/")) throw new Error("Camera HLS response has no proxy URL");
    return (
      cameraSourceByEntityId.set(normalizedCameraEntityId, {
        source: cameraStreamUrl,
        createdAt: Date.now(),
      }),
      cameraStreamUrl
    );
  })();
  pendingSourceRequestByEntityId.set(normalizedCameraEntityId, sourceRequestPromise);
  try {
    return await sourceRequestPromise;
  } finally {
    pendingSourceRequestByEntityId.get(normalizedCameraEntityId) === sourceRequestPromise &&
      pendingSourceRequestByEntityId.delete(normalizedCameraEntityId);
  }
}
export async function prewarmCameraMedia(cameraEntityIds: any[] = []) {
  if (document.visibilityState === "hidden") return;
  const uniqueCameraEntityIds = [
    ...new Set(
      (cameraEntityIds || [])
        .map((cameraEntityIdCandidate) => String(cameraEntityIdCandidate || "").trim())
        .filter(Boolean),
    ),
  ].slice(0, CAMERA_MAX_SOURCES);
  await Promise.allSettled(
    uniqueCameraEntityIds.map((prewarmEntityId) => resolveCameraStreamSource(prewarmEntityId)),
  );
}
function mountCameraSnapshot({
  container: cameraContainerElement,
  entityId: snapshotEntityId,
  label: cameraLabel,
  objectFit: cameraObjectFit = "cover",
  refreshInterval: refreshIntervalSeconds = 10,
  placeholder: placeholderElement,
  cleanup: registerCleanup = (_cleanupRegistration: any) => {},
}: any) {
  const cameraImageElement = document.createElement("img");
  ((cameraImageElement.className = "hb-camera-image"),
    (cameraImageElement.alt = cameraLabel || snapshotEntityId),
    (cameraImageElement.draggable = false),
    (cameraImageElement.style.objectFit = cameraObjectFit));
  const rawRefreshInterval = Number(refreshIntervalSeconds),
    refreshInterval = Number.isFinite(rawRefreshInterval)
      ? Math.max(6, Math.round(rawRefreshInterval))
      : 10,
    refreshIntervalMs = Math.min(2147483000, refreshInterval * 1000);
  let isSnapshotLoading = false,
    isDocumentHidden = document.visibilityState === "hidden",
    refreshTimerId = 0,
    hasLoadedSnapshot = false,
    currentObjectUrl: any = null,
    activeAbortController: any = null;
  const entityRequestPolicy1 = new EntityRequestPolicy(),
    clearRefreshTimer = () => {
      (window.clearTimeout(refreshTimerId), (refreshTimerId = 0));
    },
    scheduleRefresh = (refreshDelayMs = refreshIntervalMs) => {
      (clearRefreshTimer(),
        !(isSnapshotLoading || isDocumentHidden || !Number.isFinite(refreshDelayMs)) &&
          (refreshTimerId = window.setTimeout(loadCameraSnapshot, refreshDelayMs)));
    },
    loadCameraSnapshot = async () => {
      if (isSnapshotLoading || isDocumentHidden || activeAbortController) return;
      if (!entityRequestPolicy1.canRequest(snapshotEntityId)) {
        entityRequestPolicy1.authBlocked ||
          scheduleRefresh(
            Math.max(
              0,
              (entityRequestPolicy1.entries.get(snapshotEntityId)?.nextAt ?? Infinity) - Date.now(),
            ),
          );
        return;
      }
      clearRefreshTimer();
      const snapshotAbortController = new AbortController();
      activeAbortController = snapshotAbortController;
      const abortTimeoutHandle = window.setTimeout(() => snapshotAbortController.abort(), 12000);
      try {
        cameraContainerElement.dataset.cameraState = "snapshot-loading";
        const snapshotResponse = await fetch(
          "/api/camera_proxy/" + encodeURIComponent(snapshotEntityId) + "?hb=" + Date.now(),
          {
            credentials: "same-origin",
            signal: snapshotAbortController.signal,
          },
        );
        if (
          isSnapshotLoading ||
          isDocumentHidden ||
          activeAbortController !== snapshotAbortController
        )
          return;
        if (!snapshotResponse.ok) {
          const failureRetryDelayMs = entityRequestPolicy1.failure(
            snapshotEntityId,
            snapshotResponse.status,
          );
          (hasLoadedSnapshot ||
            ((placeholderElement.hidden = false),
            (placeholderElement.textContent =
              snapshotResponse.status === 404
                ? "摄像头实体不可用，请检查绑定"
                : snapshotResponse.status === 401
                  ? "请登录后查看摄像头"
                  : "摄像头快照不可用")),
            (cameraContainerElement.dataset.cameraState = hasLoadedSnapshot
              ? "snapshot-stale"
              : "snapshot-unavailable"),
            scheduleRefresh(
              Number.isFinite(failureRetryDelayMs)
                ? Math.max(refreshIntervalMs, failureRetryDelayMs)
                : failureRetryDelayMs,
            ));
          return;
        }
        const snapshotBlob = await snapshotResponse.blob();
        if (
          isSnapshotLoading ||
          isDocumentHidden ||
          activeAbortController !== snapshotAbortController
        )
          return;
        if (!snapshotBlob.size) throw new Error("Empty camera snapshot");
        const snapshotObjectUrl = URL.createObjectURL(snapshotBlob),
          previousObjectUrl = currentObjectUrl;
        ((currentObjectUrl = snapshotObjectUrl),
          (cameraImageElement.src = snapshotObjectUrl),
          previousObjectUrl && URL.revokeObjectURL(previousObjectUrl));
      } catch {
        if (
          isSnapshotLoading ||
          isDocumentHidden ||
          activeAbortController !== snapshotAbortController
        )
          return;
        const unavailableRetryDelayMs = entityRequestPolicy1.failure(snapshotEntityId);
        ((cameraContainerElement.dataset.cameraState = hasLoadedSnapshot
          ? "snapshot-stale"
          : "snapshot-unavailable"),
          hasLoadedSnapshot ||
            ((placeholderElement.hidden = false),
            (placeholderElement.textContent = "摄像头快照不可用")),
          scheduleRefresh(Math.max(refreshIntervalMs, unavailableRetryDelayMs)));
      } finally {
        (window.clearTimeout(abortTimeoutHandle),
          activeAbortController === snapshotAbortController && (activeAbortController = null));
      }
    };
  (cameraImageElement.addEventListener("load", () => {
    isSnapshotLoading ||
      isDocumentHidden ||
      (entityRequestPolicy1.success(snapshotEntityId),
      (hasLoadedSnapshot = true),
      (placeholderElement.hidden = true),
      (cameraContainerElement.dataset.cameraState = "snapshot-ready"),
      scheduleRefresh());
  }),
    cameraImageElement.addEventListener("error", () => {
      isSnapshotLoading ||
        isDocumentHidden ||
        ((cameraContainerElement.dataset.cameraState = "snapshot-unavailable"),
        (placeholderElement.hidden = false),
        (placeholderElement.textContent = "摄像头快照不可用"),
        scheduleRefresh(
          Math.max(refreshIntervalMs, entityRequestPolicy1.failure(snapshotEntityId)),
        ));
    }));
  const suspendSnapshotRefresh = () => {
      (activeAbortController?.abort(), (activeAbortController = null), clearRefreshTimer());
    },
    handleRuntimeResume = (resumeEvent: any) => {
      isSnapshotLoading ||
        (resumeEvent?.type === "hb-runtime-ready"
          ? (entityRequestPolicy1.authenticated(),
            resumeEvent.detail?.entityIds?.includes(snapshotEntityId) &&
              entityRequestPolicy1.success(snapshotEntityId))
          : entityRequestPolicy1.resume(),
        !isDocumentHidden && loadCameraSnapshot());
    },
    handleVisibilityChange = () => {
      ((isDocumentHidden = document.visibilityState === "hidden"),
        isDocumentHidden
          ? (suspendSnapshotRefresh(),
            (cameraContainerElement.dataset.cameraState = "snapshot-suspended"))
          : loadCameraSnapshot());
    };
  return (
    (cameraContainerElement.dataset.cameraTransport = "snapshot"),
    cameraContainerElement.prepend(cameraImageElement),
    document.addEventListener("visibilitychange", handleVisibilityChange),
    window.addEventListener("online", handleRuntimeResume),
    window.addEventListener("hb-runtime-ready", handleRuntimeResume),
    isDocumentHidden
      ? (cameraContainerElement.dataset.cameraState = "snapshot-suspended")
      : loadCameraSnapshot(),
    registerCleanup(() => {
      ((isSnapshotLoading = true),
        suspendSnapshotRefresh(),
        document.removeEventListener("visibilitychange", handleVisibilityChange),
        window.removeEventListener("online", handleRuntimeResume),
        window.removeEventListener("hb-runtime-ready", handleRuntimeResume),
        cameraImageElement.removeAttribute("src"),
        currentObjectUrl && URL.revokeObjectURL(currentObjectUrl));
    }),
    {
      image: cameraImageElement,
    }
  );
}
export function mountCameraMedia({
  container: legacyContainerElement,
  entityId: legacySnapshotEntityId,
  label: legacyCameraLabel,
  objectFit: legacyObjectFit = "cover",
  placeholder: legacyPlaceholderElement,
  onReady: onTransportReady = () => {},
  onUnavailable: onTransportUnavailable = () => {},
  cleanup: registerLegacyCleanup = (_cleanupRegistration: () => void) => {},
}: any) {
  const cameraVideoElement = document.createElement("video");
  ((cameraVideoElement.className = "hb-camera-video"),
    cameraVideoElement.setAttribute("aria-label", legacyCameraLabel || legacySnapshotEntityId),
    (cameraVideoElement.autoplay = true),
    (cameraVideoElement.muted = true),
    (cameraVideoElement.playsInline = true),
    (cameraVideoElement.disablePictureInPicture = true),
    (cameraVideoElement.style.objectFit = legacyObjectFit));
  const fallbackImageElement = document.createElement("img");
  ((fallbackImageElement.className = "hb-camera-image"),
    (fallbackImageElement.alt = legacyCameraLabel || legacySnapshotEntityId),
    (fallbackImageElement.draggable = false),
    (fallbackImageElement.style.objectFit = legacyObjectFit));
  let isTransportDisposed = false,
    isLegacyTransport = false,
    hasRequestedFallbackImage = false,
    hlsManifestTimerId = 0,
    hlsStartTimerId = 0,
    legacyProbeTimerId = 0,
    hlsPlayer: any = null,
    hasVideoStarted = false,
    transportGeneration = 0,
    isPageHidden = document.visibilityState === "hidden";
  const disposeCameraTransport = () => {
      ((transportGeneration += 1),
        window.clearTimeout(hlsManifestTimerId),
        window.clearTimeout(hlsStartTimerId),
        window.clearTimeout(legacyProbeTimerId),
        (hlsManifestTimerId = 0),
        (hlsStartTimerId = 0),
        (legacyProbeTimerId = 0),
        hlsPlayer?.destroy(),
        (hlsPlayer = null),
        cameraVideoElement.pause(),
        cameraVideoElement.removeAttribute("src"),
        cameraVideoElement.load(),
        fallbackImageElement.removeAttribute("src"),
        (isLegacyTransport = false),
        (hasRequestedFallbackImage = false),
        (hasVideoStarted = false));
    },
    restoreVideoElement = () => {
      (fallbackImageElement.remove(),
        cameraVideoElement.isConnected || legacyContainerElement.prepend(cameraVideoElement));
    },
    handleTransportReady = () => {
      isTransportDisposed ||
        isPageHidden ||
        hasVideoStarted ||
        ((hasVideoStarted = true),
        window.clearTimeout(hlsStartTimerId),
        window.clearTimeout(legacyProbeTimerId),
        (legacyPlaceholderElement.hidden = true),
        onTransportReady());
    },
    reportTransportUnavailable = () => {
      isTransportDisposed ||
        isPageHidden ||
        ((hasVideoStarted = false),
        (legacyPlaceholderElement.hidden = false),
        (legacyPlaceholderElement.textContent = "摄像头实时预览不可用"),
        onTransportUnavailable());
    },
    loadFallbackSnapshot = () => {
      !isTransportDisposed &&
        !isPageHidden &&
        (fallbackImageElement.src =
          "/api/camera_proxy/" + encodeURIComponent(legacySnapshotEntityId) + "?hb=" + Date.now());
    },
    scheduleFallbackRequest = (fallbackGeneration = transportGeneration) => {
      isTransportDisposed ||
        isPageHidden ||
        fallbackGeneration !== transportGeneration ||
        hasRequestedFallbackImage ||
        ((hasRequestedFallbackImage = true),
        window.clearTimeout(legacyProbeTimerId),
        loadFallbackSnapshot());
    },
    switchToLegacyTransport = (legacyGeneration = transportGeneration) => {
      isTransportDisposed ||
        isPageHidden ||
        legacyGeneration !== transportGeneration ||
        isLegacyTransport ||
        ((isLegacyTransport = true),
        (legacyContainerElement.dataset.cameraTransport = "legacy"),
        window.clearTimeout(hlsStartTimerId),
        hlsPlayer?.destroy(),
        (hlsPlayer = null),
        cameraVideoElement.pause(),
        cameraVideoElement.removeAttribute("src"),
        cameraVideoElement.load(),
        cameraVideoElement.remove(),
        legacyContainerElement.prepend(fallbackImageElement),
        (fallbackImageElement.src =
          "/api/camera_proxy_stream/" + encodeURIComponent(legacySnapshotEntityId)),
        (legacyProbeTimerId = window.setTimeout(() => {
          fallbackImageElement.naturalWidth || scheduleFallbackRequest(legacyGeneration);
        }, 7000)));
    };
  (cameraVideoElement.addEventListener("loadeddata", handleTransportReady),
    cameraVideoElement.addEventListener("playing", handleTransportReady),
    cameraVideoElement.addEventListener(
      "error",
      () => {
        hlsPlayer || switchToLegacyTransport();
      },
      {
        once: true,
      },
    ),
    fallbackImageElement.addEventListener("load", handleTransportReady),
    fallbackImageElement.addEventListener("error", () => {
      isTransportDisposed ||
        isPageHidden ||
        (hasRequestedFallbackImage ? reportTransportUnavailable() : scheduleFallbackRequest());
    }),
    legacyContainerElement.prepend(cameraVideoElement));
  const startHlsPlayback = async (playbackGeneration: any) => {
      try {
        const hlsSourceUrl = await resolveCameraStreamSource(legacySnapshotEntityId),
          hlsRuntime = window.Hls as HlsRuntime | undefined;
        if (isTransportDisposed || isPageHidden || playbackGeneration !== transportGeneration)
          return;
        ((legacyContainerElement.dataset.cameraHlsSource = hlsSourceUrl),
          (legacyContainerElement.dataset.cameraTransport = "hls"),
          hlsRuntime?.isSupported?.()
            ? ((hlsPlayer = new hlsRuntime({
                lowLatencyMode: true,
                backBufferLength: 15,
                maxBufferLength: 15,
              })),
              hlsPlayer.on(hlsRuntime.Events.MEDIA_ATTACHED, () =>
                hlsPlayer?.loadSource(hlsSourceUrl),
              ),
              hlsPlayer.on(hlsRuntime.Events.MANIFEST_PARSED, () => {
                ((legacyContainerElement.dataset.cameraState = "manifest-parsed"),
                  cameraVideoElement.play().catch(() => {}));
              }),
              hlsPlayer.on(hlsRuntime.Events.ERROR, (_hlsEventName: any, hlsErrorPayload: any) => {
                isTransportDisposed ||
                  isPageHidden ||
                  playbackGeneration !== transportGeneration ||
                  (hlsErrorPayload?.fatal &&
                    (cameraSourceByEntityId.delete(String(legacySnapshotEntityId || "").trim()),
                    (legacyContainerElement.dataset.cameraState = "hls-failed"),
                    (legacyContainerElement.dataset.cameraError = [
                      hlsErrorPayload.type,
                      hlsErrorPayload.details,
                      hlsErrorPayload.url || hlsErrorPayload.response?.url || "",
                      hlsErrorPayload.response?.code || 0,
                      hlsErrorPayload.reason || hlsErrorPayload.error?.message || "",
                    ].join(" | ")),
                    window.HomeOSLog?.report!(
                      "error",
                      "摄像头",
                      "摄像头播放失败：" +
                        (hlsErrorPayload.type || "") +
                        " / " +
                        (hlsErrorPayload.details || ""),
                      {
                        entityId: legacySnapshotEntityId,
                        phase: "hls-playback",
                        status: hlsErrorPayload.response?.code || 0,
                        path: hlsErrorPayload.url || hlsErrorPayload.response?.url || "",
                      },
                    )!,
                    console.warn("[HomeOS camera] HLS playback failed", {
                      entityId: legacySnapshotEntityId,
                      type: hlsErrorPayload.type,
                      details: hlsErrorPayload.details,
                      url: hlsErrorPayload.url || hlsErrorPayload.response?.url || "",
                      status: hlsErrorPayload.response?.code || 0,
                      reason: hlsErrorPayload.reason || hlsErrorPayload.error?.message || "",
                    }),
                    switchToLegacyTransport(playbackGeneration)));
              }),
              hlsPlayer.attachMedia(cameraVideoElement))
            : ((cameraVideoElement.src = hlsSourceUrl), cameraVideoElement.play().catch(() => {})));
      } catch (hlsPlaybackError: any) {
        if (isTransportDisposed || isPageHidden || playbackGeneration !== transportGeneration)
          return;
        ((legacyContainerElement.dataset.cameraState = "setup-failed"),
          (legacyContainerElement.dataset.cameraError = String(hlsPlaybackError)),
          window.HomeOSLog?.error!(
            hlsPlaybackError,
            {
              entityId: legacySnapshotEntityId,
              phase: "hls-setup",
            },
            "摄像头连接失败：" + (hlsPlaybackError?.message || hlsPlaybackError),
          )!,
          console.warn("[HomeOS camera] HLS setup failed", {
            entityId: legacySnapshotEntityId,
            error: String(hlsPlaybackError),
          }),
          switchToLegacyTransport(playbackGeneration));
      }
    },
    resumeDeferredPlayback = () => {
      if (isTransportDisposed || isPageHidden) return;
      (restoreVideoElement(),
        (hasVideoStarted = false),
        (legacyPlaceholderElement.hidden = false),
        (legacyPlaceholderElement.textContent = "摄像头正在连接"));
      const transportGenerationSnapshot = transportGeneration;
      ((legacyContainerElement.dataset.cameraState = "starting"),
        startHlsPlayback(transportGenerationSnapshot),
        (hlsStartTimerId = window.setTimeout(
          () => switchToLegacyTransport(transportGenerationSnapshot),
          12000,
        )));
    },
    handlePageHidden = () => {
      if (document.visibilityState === "hidden") {
        if (isPageHidden) return;
        ((isPageHidden = true),
          disposeCameraTransport(),
          (legacyContainerElement.dataset.cameraState = "suspended"),
          (legacyPlaceholderElement.hidden = false),
          (legacyPlaceholderElement.textContent = "摄像头已在后台暂停"));
        return;
      }
      isPageHidden && ((isPageHidden = false), resumeDeferredPlayback());
    };
  return (
    document.addEventListener("visibilitychange", handlePageHidden),
    isPageHidden
      ? ((legacyContainerElement.dataset.cameraState = "suspended"),
        (legacyPlaceholderElement.hidden = false),
        (legacyPlaceholderElement.textContent = "摄像头已在后台暂停"))
      : ((legacyContainerElement.dataset.cameraState = "deferred"),
        (hlsManifestTimerId = window.setTimeout(resumeDeferredPlayback, 0))),
    registerLegacyCleanup(() => {
      ((isTransportDisposed = true),
        document.removeEventListener("visibilitychange", handlePageHidden),
        disposeCameraTransport());
    }),
    {
      video: cameraVideoElement,
      image: fallbackImageElement,
    }
  );
}
(registerComponent("camera", {
  render(cameraComponent: any, cameraRenderEnvironment: any) {
    const cameraProperties = cameraComponent.properties || {},
      boundCameraEntityId = cameraComponent.bindings?.entity?.entityId || "",
      cameraComponentElement = document.createElement("div");
    cameraComponentElement.className = "hb-camera-component";
    const cameraWidth = Math.max(1, Number(cameraComponent.position?.width || 320)),
      cameraHeight = Math.max(1, Number(cameraComponent.position?.height || 180)),
      cameraComponentScale = Math.max(
        0.01,
        Number(cameraRenderEnvironment.document?.canvas?.componentScale || 1),
      ),
      cornerRadiusPx =
        (Math.min(cameraWidth, cameraHeight) * cameraRadiusRatio(cameraProperties.radius)) /
        cameraComponentScale;
    if (
      ((cameraComponentElement.style.borderRadius = cornerRadiusPx + "px"),
      cameraRenderEnvironment.editable)
    ) {
      const editableCameraPlaceholderElement = document.createElement("div");
      ((editableCameraPlaceholderElement.className = "hb-camera-placeholder"),
        (editableCameraPlaceholderElement.textContent =
          cameraProperties.mediaVisible === false ? "摄像头画面已隐藏" : "编辑模式不加载实时画面"),
        cameraComponentElement.append(editableCameraPlaceholderElement));
    } else {
      if (cameraRenderEnvironment.liveMedia !== false && cameraProperties.mediaVisible !== false) {
        const runtimeCameraPlaceholderElement = document.createElement("div");
        runtimeCameraPlaceholderElement.className = "hb-camera-placeholder";
        const isSnapshotMode = cameraProperties.displayMode === "snapshot";
        if (
          ((runtimeCameraPlaceholderElement.textContent = boundCameraEntityId
            ? isSnapshotMode
              ? "正在载入摄像头快照"
              : "正在载入摄像头实时预览"
            : "未选择摄像头实体"),
          cameraComponentElement.append(runtimeCameraPlaceholderElement),
          boundCameraEntityId)
        ) {
          const cameraMountOptions = {
            container: cameraComponentElement,
            entityId: boundCameraEntityId,
            label:
              resolveStatePayload(cameraRenderEnvironment.states?.get(boundCameraEntityId))
                ?.attributes?.friendly_name || boundCameraEntityId,
            objectFit: cameraProperties.fit === "contain" ? "contain" : "fill",
            placeholder: runtimeCameraPlaceholderElement,
            cleanup: (onComponentCleanup: any) => cameraRenderEnvironment.cleanup(onComponentCleanup),
          };
          isSnapshotMode
            ? mountCameraSnapshot({
                ...cameraMountOptions,
                refreshInterval: cameraProperties.refreshInterval,
              })
            : mountCameraMedia(cameraMountOptions);
        }
      }
    }
    return (
      appendCameraFrame(
        cameraComponentElement,
        cameraComponent,
        cameraProperties,
        cameraRenderEnvironment.renderNamespace,
      ),
      cameraComponentElement
    );
  },
}),
  registerComponent("vacuum-map", {
    render(vacuumMapComponent: any, vacuumMapRenderEnvironment: any) {
      const vacuumMapProperties = vacuumMapComponent.properties || {},
        vacuumMapBoundEntityId = vacuumMapComponent.bindings?.entity?.entityId || "",
        vacuumMapComponentElement = document.createElement("div");
      if (
        ((vacuumMapComponentElement.className = "hb-vacuum-map-component"),
        (vacuumMapComponentElement.style.opacity = String(
          clampNumber(vacuumMapProperties.opacity, 0, 1, 0.5),
        )),
        vacuumMapComponentElement.setAttribute(
          "aria-label",
          vacuumMapProperties.label || "扫地机器人实时地图",
        ),
        !vacuumMapBoundEntityId)
      ) {
        if (vacuumMapRenderEnvironment.editable) {
          const missingEntityPlaceholderElement = document.createElement("span");
          ((missingEntityPlaceholderElement.className = "hb-vacuum-map-placeholder"),
            (missingEntityPlaceholderElement.textContent = "请选择实时地图实体"),
            vacuumMapComponentElement.append(missingEntityPlaceholderElement));
        }
        return vacuumMapComponentElement;
      }
      let vacuumMapImageElement: HTMLImageElement & ComponentControllerHooks = document.createElement("img");
      ((vacuumMapImageElement.className = "hb-vacuum-map-image"),
        (vacuumMapImageElement.alt =
          vacuumMapProperties.label ||
          resolveStatePayload(vacuumMapRenderEnvironment.states?.get(vacuumMapBoundEntityId))
            ?.attributes?.friendly_name ||
          vacuumMapBoundEntityId),
        (vacuumMapImageElement.draggable = false));
      const unavailableMapPlaceholderElement = document.createElement("span");
      ((unavailableMapPlaceholderElement.className = "hb-vacuum-map-placeholder"),
        (unavailableMapPlaceholderElement.textContent = "实时地图暂时不可用"),
        (unavailableMapPlaceholderElement.hidden = true),
        (vacuumMapImageElement.hidden = true),
        vacuumMapComponentElement.append(vacuumMapImageElement, unavailableMapPlaceholderElement));
      const vacuumMapImageLoader = createVacuumMapImageLoader({
          entityId: vacuumMapBoundEntityId,
          getState: () => vacuumMapRenderEnvironment.states?.get(vacuumMapBoundEntityId),
          isActive: () =>
            vacuumMapRenderEnvironment.liveMedia !== false &&
            document.visibilityState !== "hidden" &&
            vacuumMapImageElement.dataset.vacuumMapSuspended !== "true",
          onFrame(mapFramePayload: any) {
            ((mapFramePayload.className = vacuumMapImageElement.className),
              (mapFramePayload.alt = vacuumMapImageElement.alt),
              (mapFramePayload.draggable = false),
              (mapFramePayload.hbSyncVacuumMap = syncVacuumMapImage),
              vacuumMapImageElement.replaceWith(mapFramePayload),
              (vacuumMapImageElement = mapFramePayload),
              (vacuumMapImageElement.hidden = false),
              (unavailableMapPlaceholderElement.hidden = true));
          },
          onUnavailable() {
            ((vacuumMapImageElement.hidden = true),
              vacuumMapImageElement.removeAttribute("src"),
              (unavailableMapPlaceholderElement.hidden = !vacuumMapRenderEnvironment.editable));
          },
        }),
        syncVacuumMapImage = () => vacuumMapImageLoader.sync();
      vacuumMapImageElement.hbSyncVacuumMap = syncVacuumMapImage;
      const handleMapVisibilityChange = () => syncVacuumMapImage();
      return (
        document.addEventListener("visibilitychange", handleMapVisibilityChange),
        vacuumMapRenderEnvironment.liveMedia !== false && syncVacuumMapImage(),
        vacuumMapRenderEnvironment.cleanup(() => {
          (document.removeEventListener("visibilitychange", handleMapVisibilityChange),
            delete vacuumMapImageElement.hbSyncVacuumMap,
            vacuumMapImageLoader.dispose());
        }),
        vacuumMapComponentElement
      );
    },
  }),
  registerComponent("time", {
    render(timeComponent: any, timeRenderEnvironment: any) {
      const timeProperties = timeComponent.properties || {},
        timeFontSize = clampNumber(timeProperties.fontSize, 12, 500, 96),
        timeComponentElement = document.createElement("time");
      ((timeComponentElement.className = "hb-time-component"),
        (timeComponentElement.style.color = normalizeCssColor(timeProperties.color, "#248eb2")),
        (timeComponentElement.style.fontSize = timeFontSize + "px"),
        (timeComponentElement.style.letterSpacing =
          clampNumber(timeProperties.letterSpacing, -20, 100, 2.2) + "px"),
        (timeComponentElement.style.opacity = String(
          clampNumber(timeProperties.opacity, 0, 1, 1),
        )));
      const timeValueElement = document.createElement("span");
      ((timeValueElement.className = "hb-time-value"),
        applyTextOutline(timeValueElement, timeProperties.fontWeight, timeFontSize));
      const timePeriodElement = document.createElement("small");
      ((timePeriodElement.className = "hb-time-period"),
        applyTextOutline(timePeriodElement, timeProperties.fontWeight, timeFontSize * 0.5),
        timeComponentElement.append(timeValueElement, timePeriodElement));
      const updateClockDisplay = () => {
        const currentDate = new Date(),
          formattedTime = formatLocalTime(timeProperties, currentDate);
        ((timeComponentElement.dateTime = currentDate.toISOString()),
          (timeValueElement.textContent = formattedTime.value),
          (timePeriodElement.textContent = formattedTime.suffix),
          (timePeriodElement.hidden = !formattedTime.suffix));
      };
      updateClockDisplay();
      const clockTimerId = window.setInterval(
        updateClockDisplay,
        timeProperties.showSeconds === true ? 250 : 1000,
      );
      return (
        timeRenderEnvironment.cleanup(() => window.clearInterval(clockTimerId)),
        timeComponentElement
      );
    },
  }),
  registerComponent("date", {
    render(dateComponent: any, dateRenderEnvironment: any) {
      const dateProperties = dateComponent.properties || {},
        dateComponentElement = document.createElement("div");
      ((dateComponentElement.className = "hb-date-component"),
        (dateComponentElement.style.opacity = String(clampNumber(dateProperties.opacity, 0, 1, 1))),
        (dateComponentElement.style.gap = clampNumber(dateProperties.lineGap, 0, 200, 8) + "px"));
      const datePrimaryElement = document.createElement("strong");
      ((datePrimaryElement.className = "hb-date-primary"),
        (datePrimaryElement.style.color = normalizeCssColor(
          dateProperties.primaryColor,
          "#8d9296",
        )));
      const primaryFontSize = clampNumber(dateProperties.primarySize, 12, 500, 36);
      ((datePrimaryElement.style.fontSize = primaryFontSize + "px"),
        applyTextOutline(datePrimaryElement, dateProperties.primaryWeight, primaryFontSize),
        (datePrimaryElement.style.letterSpacing =
          clampNumber(dateProperties.primarySpacing, -20, 100, 1) + "px"),
        dateComponentElement.append(datePrimaryElement));
      let lunarElement: any = null;
      if (dateProperties.showLunar === true) {
        ((lunarElement = document.createElement("small")),
          (lunarElement.className = "hb-date-lunar"),
          (lunarElement.style.color = normalizeCssColor(dateProperties.lunarColor, "#7f878c")));
        const lunarFontSize = clampNumber(dateProperties.lunarSize, 10, 500, 24);
        ((lunarElement.style.fontSize = lunarFontSize + "px"),
          applyTextOutline(lunarElement, dateProperties.lunarWeight, lunarFontSize),
          (lunarElement.style.letterSpacing =
            clampNumber(dateProperties.lunarSpacing, -20, 100, 1) + "px"),
          dateComponentElement.append(lunarElement));
      }
      const updateDateDisplay = () => {
        const nowDate = new Date();
        ((datePrimaryElement.textContent = formatLocalDate(dateProperties, nowDate)),
          lunarElement && (lunarElement.textContent = formatLunarDate(nowDate)));
      };
      updateDateDisplay();
      const dateTimerId = window.setInterval(updateDateDisplay, 30000);
      return (
        dateRenderEnvironment.cleanup(() => window.clearInterval(dateTimerId)),
        dateComponentElement
      );
    },
  }),
  registerComponent("weather", {
    render(weatherComponent: any, weatherRenderEnvironment: any) {
      const weatherProperties = weatherComponent.properties || {},
        weatherEntityId = weatherComponent.bindings?.entity?.entityId || "",
        sunEntityId = weatherComponent.bindings?.sun?.entityId || "sun.sun",
        weatherEntityState = weatherRenderEnvironment.states.get(weatherEntityId),
        sunEntityState = weatherRenderEnvironment.states.get(sunEntityId)?.state || "",
        weatherAttributes = weatherEntityState?.attributes || {},
        [weatherIconSlug, weatherConditionLabel] = weatherVisual(
          weatherEntityState?.state,
          sunEntityState,
        ),
        weatherComponentElement = document.createElement("div");
      if (
        ((weatherComponentElement.className = "hb-weather-component"),
        (weatherComponentElement.style.gap =
          clampNumber(weatherProperties.iconGap, 0, 300, 22) + "px"),
        (weatherComponentElement.style.opacity = String(
          clampNumber(weatherProperties.opacity, 0, 1, 1),
        )),
        weatherProperties.iconVisible !== false)
      ) {
        const weatherIconElement = document.createElement("img");
        ((weatherIconElement.className = "hb-weather-icon"),
          (weatherIconElement.src = meteoconUrl(weatherIconSlug)),
          (weatherIconElement.alt = weatherConditionLabel),
          (weatherIconElement.draggable = false),
          (weatherIconElement.style.width =
            clampNumber(weatherProperties.iconSize, 12, 500, 64) + "px"),
          (weatherIconElement.style.height =
            clampNumber(weatherProperties.iconSize, 12, 500, 64) + "px"),
          weatherComponentElement.append(weatherIconElement));
      }
      const weatherContentElement = document.createElement("span");
      if (
        ((weatherContentElement.className = "hb-weather-content"),
        (weatherContentElement.style.gap =
          clampNumber(weatherProperties.lineGap, 0, 200, 7) + "px"),
        weatherProperties.temperatureVisible !== false)
      ) {
        const temperatureElement = document.createElement("strong"),
          temperatureValue = Number(weatherAttributes.temperature),
          temperatureUnit = String(
            weatherAttributes.temperature_unit || weatherAttributes.unit_of_measurement || "°C",
          );
        ((temperatureElement.textContent = Number.isFinite(temperatureValue)
          ? "" + temperatureValue + temperatureUnit
          : "--" + temperatureUnit),
          (temperatureElement.style.color = normalizeCssColor(
            weatherProperties.temperatureColor,
            "#aeb3b7",
          )));
        const temperatureFontSize = clampNumber(weatherProperties.temperatureSize, 12, 500, 32);
        ((temperatureElement.style.fontSize = temperatureFontSize + "px"),
          applyTextOutline(
            temperatureElement,
            weatherProperties.temperatureWeight,
            temperatureFontSize,
          ),
          (temperatureElement.style.letterSpacing =
            clampNumber(weatherProperties.temperatureSpacing, -20, 100, 1) + "px"),
          weatherContentElement.append(temperatureElement));
      }
      if (
        weatherProperties.conditionVisible !== false ||
        weatherProperties.humidityVisible !== false
      ) {
        const weatherDetailElement = document.createElement("small"),
          weatherDetailParts: any[] = [];
        weatherProperties.conditionVisible !== false &&
          weatherDetailParts.push(weatherConditionLabel);
        const humidityValue = Number(weatherAttributes.humidity);
        (weatherProperties.humidityVisible !== false &&
          weatherDetailParts.push(
            Number.isFinite(humidityValue) ? "湿度 " + humidityValue + "%" : "湿度 --",
          ),
          (weatherDetailElement.textContent = weatherDetailParts.join(" · ")),
          (weatherDetailElement.style.color = normalizeCssColor(
            weatherProperties.secondaryColor,
            "#8d9296",
          )));
        const weatherDetailFontSize = clampNumber(weatherProperties.secondarySize, 10, 500, 18);
        ((weatherDetailElement.style.fontSize = weatherDetailFontSize + "px"),
          applyTextOutline(
            weatherDetailElement,
            weatherProperties.secondaryWeight,
            weatherDetailFontSize,
          ),
          (weatherDetailElement.style.letterSpacing =
            clampNumber(weatherProperties.secondarySpacing, -20, 100, 1) + "px"),
          weatherContentElement.append(weatherDetailElement));
      }
      return (
        weatherContentElement.childElementCount &&
          weatherComponentElement.append(weatherContentElement),
        weatherComponentElement
      );
    },
  }),
  registerComponent("line-chart", {
    render(lineChartComponent: any, lineChartRenderEnvironment: any) {
      const lineChartProperties = lineChartComponent.properties || {},
        lineChartEntityId = lineChartComponent.bindings?.entity?.entityId || "",
        lineChartEntityState = lineChartRenderEnvironment.states.get(lineChartEntityId),
        lineChartUnit = String(lineChartEntityState?.attributes?.unit_of_measurement || ""),
        lineChartStateValue = Number.parseFloat(lineChartEntityState?.state),
        historySeries = buildHistorySeries(
          lineChartRenderEnvironment,
          lineChartEntityId,
          lineChartStateValue,
          lineChartProperties.hours,
        ),
        resolvedThresholdList = resolvedThresholds(
          lineChartProperties.thresholds,
          historySeries,
          lineChartProperties.thresholdMode,
        ),
        lineChartComponentElement: HTMLDivElement & ComponentControllerHooks = document.createElement("div");
      ((lineChartComponentElement.className = "hb-line-chart-component"),
        (lineChartComponentElement.style.borderRadius =
          clampNumber(lineChartProperties.cornerRadius, 0, 50, 10) + "%"));
      const lineChartValueElement = document.createElement("span");
      ((lineChartValueElement.className = "hb-line-chart-value"),
        (lineChartValueElement.hidden = lineChartProperties.valueVisible === false),
        (lineChartValueElement.style.color = normalizeCssColor(
          lineChartProperties.valueColor,
          "#dce1e5",
        )),
        (lineChartValueElement.style.fontSize =
          Math.max(
            10,
            (Number(lineChartComponent.position?.height || 300) *
              0.12 *
              clampNumber(lineChartProperties.valueScale, 10, 500, 100)) /
              100,
          ) + "px"),
        (lineChartValueElement.style.left =
          95 + clampNumber(lineChartProperties.valueOffsetX, -100, 100, 0) + "%"),
        (lineChartValueElement.style.top =
          8 + clampNumber(lineChartProperties.valueOffsetY, -100, 100, 0) + "%"));
      const stateValueElement = document.createElement("strong");
      stateValueElement.textContent = formatLineChartValue(
        lineChartStateValue,
        lineChartProperties.statePrecision,
      );
      const stateUnitElement = document.createElement("small");
      ((stateUnitElement.textContent = lineChartUnit),
        lineChartValueElement.append(stateValueElement, stateUnitElement),
        lineChartComponentElement.append(lineChartValueElement),
        (lineChartComponentElement.syncLineChartState = (syncedEntityState) => {
          const syncedStateValue = Number.parseFloat(syncedEntityState?.state);
          ((stateValueElement.textContent = formatLineChartValue(
            syncedStateValue,
            lineChartProperties.statePrecision,
          )),
            (stateUnitElement.textContent = String(
              syncedEntityState?.attributes?.unit_of_measurement || "",
            )),
            lineChartComponentElement.style.setProperty(
              "--hb-chart-current-color",
              Number.isFinite(syncedStateValue)
                ? thresholdColor(resolvedThresholdList, syncedStateValue)
                : "#68cc3e",
            ));
        }));
      const lineChartSvgElement = createSvgElement(lineChartComponentElement, "svg", {
        viewBox: "0 0 100 70",
        preserveAspectRatio: "none",
        "aria-hidden": "true",
      });
      if ((lineChartSvgElement.classList.add("hb-line-chart-graph"), historySeries.length)) {
        const chartGeometry = lineChartGeometry(historySeries),
          {
            minimum: minimumValue,
            maximum: maximumValue,
            span: valueSpan,
            points: chartPoints,
          } = chartGeometry,
          chartPathDefinition = smoothChartPath(chartPoints),
          lineChartGradientId =
            (lineChartRenderEnvironment.renderNamespace || "renderer") +
            "-chart-" +
            String(lineChartComponent.id || "").replace(/[^a-z0-9_-]/gi, ""),
          chartDefsElement = createSvgElement(lineChartSvgElement, "defs"),
          gradientElement = createSvgElement(chartDefsElement, "linearGradient", {
            id: lineChartGradientId + "-line",
            gradientUnits: "userSpaceOnUse",
            x1: 0,
            y1: 0,
            x2: 0,
            y2: 70,
          }),
          thresholdEntries = resolvedThresholdList.length
            ? resolvedThresholdList
            : [
                {
                  value: minimumValue,
                  color: "#68cc3e",
                },
              ];
        for (const thresholdEntry of [...thresholdEntries].sort(
          (leftThreshold, rightThreshold) => rightThreshold.value - leftThreshold.value,
        ))
          createSvgElement(gradientElement, "stop", {
            offset:
              clampNumber(((maximumValue - thresholdEntry.value) / valueSpan) * 100, 0, 100, 0) +
              "%",
            "stop-color": thresholdEntry.color,
          });
        if (
          (createSvgElement(lineChartSvgElement, "path", {
            d: chartPathDefinition + " L100 70 L0 70 Z",
            fill: "url(#" + lineChartGradientId + "-line)",
            opacity: 0.18,
          }),
          createSvgElement(lineChartSvgElement, "path", {
            d: chartPathDefinition,
            fill: "none",
            stroke: "url(#" + lineChartGradientId + "-line)",
            "stroke-width": 1.6,
            "vector-effect": "non-scaling-stroke",
          }),
          !lineChartRenderEnvironment.editable)
        ) {
          const hoverLayerElement = document.createElement("span");
          ((hoverLayerElement.className = "hb-line-chart-hover-layer"),
            lineChartComponentElement.append(hoverLayerElement));
          const chartHoverOverlayElement = createHoverLineChart(
            hoverLayerElement,
            lineChartComponentElement,
            chartGeometry,
            lineChartUnit,
            (chartPoint: any) => ({
              x: chartPoint.x,
              y: (chartPoint.y / 70) * 100,
            }),
            lineChartProperties.statePrecision,
          );
          lineChartRenderEnvironment.cleanup?.(chartHoverOverlayElement);
        }
      } else lineChartComponentElement.classList.add("history-loading");
      return (
        lineChartComponentElement.style.setProperty(
          "--hb-chart-current-color",
          Number.isFinite(lineChartStateValue)
            ? thresholdColor(resolvedThresholdList, lineChartStateValue)
            : "#68cc3e",
        ),
        lineChartComponentElement
      );
    },
  }));
export function renderLineChartDetails(
  lineChartDetailsComponent: any,
  lineChartDetailsRenderEnvironment: any,
) {
  const detailsEntityId = lineChartDetailsComponent.bindings?.entity?.entityId || "",
    detailsEntityState = lineChartDetailsRenderEnvironment.states.get(detailsEntityId),
    detailsUnit = String(detailsEntityState?.attributes?.unit_of_measurement || ""),
    detailsStateValue = Number.parseFloat(detailsEntityState?.state),
    detailsHistorySeries = buildHistorySeries(
      lineChartDetailsRenderEnvironment,
      detailsEntityId,
      detailsStateValue,
      lineChartDetailsComponent.properties?.hours,
    ),
    lineChartDetailsElement: HTMLElement & ComponentControllerHooks = document.createElement("section");
  lineChartDetailsElement.className = "hb-line-chart-details";
  const detailsThresholdList = resolvedThresholds(
    lineChartDetailsComponent.properties?.thresholds,
    detailsHistorySeries,
    lineChartDetailsComponent.properties?.thresholdMode,
  );
  if (
    (lineChartDetailsElement.style.setProperty(
      "--hb-chart-current-color",
      Number.isFinite(detailsStateValue)
        ? thresholdColor(detailsThresholdList, detailsStateValue)
        : "#68cc3e",
    ),
    (lineChartDetailsElement.syncLineChartState = (detailsSyncedEntityState) => {
      const syncedDetailsValue = Number.parseFloat(detailsSyncedEntityState?.state);
      lineChartDetailsElement.style.setProperty(
        "--hb-chart-current-color",
        Number.isFinite(syncedDetailsValue)
          ? thresholdColor(detailsThresholdList, syncedDetailsValue)
          : "#68cc3e",
      );
    }),
    !detailsHistorySeries.length)
  ) {
    const emptyHistoryMessageElement = document.createElement("p");
    return (
      (emptyHistoryMessageElement.textContent = "暂无历史数据。"),
      lineChartDetailsElement.append(emptyHistoryMessageElement),
      lineChartDetailsElement
    );
  }
  const isCompactDetailsHorizontal =
      lineChartDetailsComponent.properties?.compactDetailsHorizontal === true,
    detailsViewWidth = isCompactDetailsHorizontal ? 790 : 720,
    detailsHeightOffset = isCompactDetailsHorizontal ? 0 : 56,
    detailsViewHeight = 340 + detailsHeightOffset,
    detailsInsetLeft = isCompactDetailsHorizontal ? 44 : 66,
    detailsInsetRight = isCompactDetailsHorizontal ? 44 : 26,
    plotRect = {
      left: detailsInsetLeft,
      top: 24,
      width: detailsViewWidth - detailsInsetLeft - detailsInsetRight,
      height: 258 + detailsHeightOffset,
    },
    detailsGeometry = lineChartGeometry(
      detailsHistorySeries,
      plotRect.left,
      plotRect.top,
      plotRect.width,
      plotRect.height,
    ),
    detailsSvgElement = createSvgElement(lineChartDetailsElement, "svg", {
      viewBox: "0 0 " + detailsViewWidth + " " + detailsViewHeight,
      preserveAspectRatio: "xMidYMid meet",
      role: "img",
      "aria-label": "带时间轴和数值轴的历史折线图",
    }),
    detailsGradientId =
      (lineChartDetailsRenderEnvironment.renderNamespace || "renderer") +
      "-chart-details-" +
      String(lineChartDetailsComponent.id || "").replace(/[^a-z0-9_-]/gi, ""),
    detailsDefsElement = createSvgElement(detailsSvgElement, "defs"),
    detailsGradientElement = createSvgElement(detailsDefsElement, "linearGradient", {
      id: detailsGradientId + "-line",
      gradientUnits: "userSpaceOnUse",
      x1: 0,
      y1: plotRect.top,
      x2: 0,
      y2: plotRect.top + plotRect.height,
    }),
    detailsThresholdEntries = detailsThresholdList.length
      ? detailsThresholdList
      : [
          {
            value: detailsGeometry.minimum,
            color: "#68cc3e",
          },
        ];
  for (const detailsThresholdEntry of [...detailsThresholdEntries].sort(
    (leftDetailsThreshold, rightDetailsThreshold) =>
      rightDetailsThreshold.value - leftDetailsThreshold.value,
  ))
    createSvgElement(detailsGradientElement, "stop", {
      offset:
        clampNumber(
          ((detailsGeometry.maximum - detailsThresholdEntry.value) / detailsGeometry.span) * 100,
          0,
          100,
          0,
        ) + "%",
      "stop-color": detailsThresholdEntry.color,
    });
  for (let gridTickIndex = 0; gridTickIndex <= 4; gridTickIndex += 1) {
    const gridTickRatio = gridTickIndex / 4,
      gridLineY = plotRect.top + gridTickRatio * plotRect.height,
      gridTickValue = detailsGeometry.maximum - gridTickRatio * detailsGeometry.span;
    createSvgElement(detailsSvgElement, "line", {
      x1: plotRect.left,
      y1: gridLineY,
      x2: plotRect.left + plotRect.width,
      y2: gridLineY,
      class: "hb-line-chart-details-grid",
    });
    const axisLabelElement = createSvgElement(detailsSvgElement, "text", {
      x: plotRect.left - (isCompactDetailsHorizontal ? 8 : 12),
      y: gridLineY + 4,
      "text-anchor": "end",
      class: "hb-line-chart-details-axis-label",
    });
    axisLabelElement.textContent = formatLineChartValue(
      gridTickValue,
      lineChartDetailsComponent.properties?.statePrecision,
    );
  }
  const hasTimeAxis = Number(lineChartDetailsComponent.properties?.hours || 24) > 24;
  for (let timeTickIndex = 0; timeTickIndex <= 5; timeTickIndex += 1) {
    const timeTickRatio = timeTickIndex / 5,
      timeTickX = plotRect.left + timeTickRatio * plotRect.width,
      tickTimestamp =
        detailsGeometry.firstTime +
        timeTickRatio * (detailsGeometry.lastTime - detailsGeometry.firstTime);
    createSvgElement(detailsSvgElement, "line", {
      x1: timeTickX,
      y1: plotRect.top,
      x2: timeTickX,
      y2: plotRect.top + plotRect.height,
      class: "hb-line-chart-details-grid vertical",
    });
    const timeAxisLabelElement = createSvgElement(detailsSvgElement, "text", {
      x: timeTickX,
      y: plotRect.top + plotRect.height + 25,
      "text-anchor": "middle",
      class: "hb-line-chart-details-axis-label",
    });
    timeAxisLabelElement.textContent = formatTimestamp(tickTimestamp, hasTimeAxis);
  }
  (createSvgElement(detailsSvgElement, "line", {
    x1: plotRect.left,
    y1: plotRect.top,
    x2: plotRect.left,
    y2: plotRect.top + plotRect.height,
    class: "hb-line-chart-details-axis",
  }),
    createSvgElement(detailsSvgElement, "line", {
      x1: plotRect.left,
      y1: plotRect.top + plotRect.height,
      x2: plotRect.left + plotRect.width,
      y2: plotRect.top + plotRect.height,
      class: "hb-line-chart-details-axis",
    }));
  const unitLabelElement = createSvgElement(detailsSvgElement, "text", {
    x: plotRect.left,
    y: 20,
    class: "hb-line-chart-details-axis-title",
  });
  unitLabelElement.textContent = detailsUnit || "数值";
  const detailsChartPath = smoothChartPath(detailsGeometry.points);
  (createSvgElement(detailsSvgElement, "path", {
    d:
      detailsChartPath +
      " L" +
      (plotRect.left + plotRect.width) +
      " " +
      (plotRect.top + plotRect.height) +
      " L" +
      plotRect.left +
      " " +
      (plotRect.top + plotRect.height) +
      " Z",
    fill: "url(#" + detailsGradientId + "-line)",
    opacity: 0.12,
    class: "hb-line-chart-details-fill",
  }),
    createSvgElement(detailsSvgElement, "path", {
      d: detailsChartPath,
      fill: "none",
      stroke: "url(#" + detailsGradientId + "-line)",
      "stroke-width": 2.4,
      pathLength: 100,
      "vector-effect": "non-scaling-stroke",
      class: "hb-line-chart-details-line",
    }));
  const movingDotElement = createSvgElement(detailsSvgElement, "circle", {
    cx: 0,
    cy: 0,
    r: 4.2,
    class: "hb-line-chart-details-lead-dot",
  });
  return (
    lineChartDetailsRenderEnvironment.animate !== false &&
      createSvgElement(movingDotElement, "animateMotion", {
        path: detailsChartPath,
        dur: "1.1s",
        begin: ".28s",
        fill: "freeze",
      }),
    (lineChartDetailsElement.cleanupLineChartHover = () => {}),
    lineChartDetailsRenderEnvironment.interactive !== false &&
      (lineChartDetailsElement.cleanupLineChartHover = createHoverLineChart(
        detailsSvgElement,
        lineChartDetailsElement,
        detailsGeometry,
        detailsUnit,
        (geometryPoint: any) => ({
          x: (geometryPoint.x / detailsViewWidth) * 100,
          y: (geometryPoint.y / detailsViewHeight) * 100,
        }),
        lineChartDetailsComponent.properties?.statePrecision,
        {
          start: plotRect.left / detailsViewWidth,
          end: (plotRect.left + plotRect.width) / detailsViewWidth,
        },
        lineChartDetailsElement,
      )),
    lineChartDetailsElement
  );
}
registerComponent("panel-frame", {
  render(panelFrameComponent: any, panelFrameRenderEnvironment: any) {
    const panelFrameProperties = panelFrameComponent.properties || {},
      panelFrameWidth = Math.max(20, Number(panelFrameComponent.position?.width || 528)),
      panelFrameHeight = Math.max(20, Number(panelFrameComponent.position?.height || 300)),
      edgeStrokeWidth = clampNumber(panelFrameProperties.edgeWidth, 0, 20, 0.9),
      edgeInset = Math.max(0.5, edgeStrokeWidth / 2 + 0.5),
      innerFrameWidth = Math.max(1, panelFrameWidth - edgeInset * 2),
      innerFrameHeight = Math.max(1, panelFrameHeight - edgeInset * 2),
      panelCornerRadius =
        Math.min(innerFrameWidth, innerFrameHeight) *
        clampNumber(panelFrameProperties.radius, 0, 0.5, 0.195),
      edgeOpacity = clampNumber(panelFrameProperties.edgeOpacity, 0, 1, 1),
      panelGlowStrength = clampNumber(panelFrameProperties.glowStrength, 0, 5, 0.5),
      panelGlowSize = clampNumber(panelFrameProperties.glowSize, 0, 3, 1.5),
      panelGlowRadius = Math.min(innerFrameWidth, innerFrameHeight) * 0.22 * panelGlowSize,
      panelGlowBlur = Math.min(innerFrameWidth, innerFrameHeight) * 0.06 * panelGlowSize,
      edgeStrokeColor = normalizeCssColor(panelFrameProperties.edgeColor, "#d4d4d4"),
      panelGlowColor = normalizeCssColor(panelFrameProperties.glowColor, "#ffffff"),
      panelFrameId =
        (panelFrameRenderEnvironment.renderNamespace || "renderer") +
        "-frame-" +
        String(panelFrameComponent.id || "").replace(/[^a-z0-9_-]/gi, ""),
      panelFrameElement = document.createElement("div");
    panelFrameElement.className = "hb-panel-frame-component";
    const panelFrameSvgElement = createSvgElement(panelFrameElement, "svg", {
        viewBox: "0 0 " + panelFrameWidth + " " + panelFrameHeight,
        preserveAspectRatio: "none",
        "aria-hidden": "true",
      }),
      panelFrameDefsElement = createSvgElement(panelFrameSvgElement, "defs"),
      panelGlowGradientElement = createSvgElement(panelFrameDefsElement, "linearGradient", {
        id: panelFrameId + "-glass",
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
      });
    (createSvgElement(panelGlowGradientElement, "stop", {
      offset: 0,
      "stop-color": panelGlowColor,
      "stop-opacity": Math.min(0.35, 0.035 * panelGlowStrength),
    }),
      createSvgElement(panelGlowGradientElement, "stop", {
        offset: 0.52,
        "stop-color": panelGlowColor,
        "stop-opacity": Math.min(0.12, 0.01 * panelGlowStrength),
      }),
      createSvgElement(panelGlowGradientElement, "stop", {
        offset: 1,
        "stop-color": panelGlowColor,
        "stop-opacity": Math.min(0.25, 0.025 * panelGlowStrength),
      }));
    const panelEdgeGradientElement = createSvgElement(panelFrameDefsElement, "linearGradient", {
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
        ")",
    });
    for (const [panelStopOffset, panelStopOpacity] of [
      [0, 0.96],
      [0.22, 0.72],
      [0.52, 0.3],
      [0.78, 0.66],
      [1, 0.42],
    ])
      createSvgElement(panelEdgeGradientElement, "stop", {
        offset: panelStopOffset,
        "stop-color": edgeStrokeColor,
        "stop-opacity": panelStopOpacity * edgeOpacity,
      });
    const panelGlassGradientElement = createSvgElement(panelFrameDefsElement, "linearGradient", {
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
        ")",
    });
    for (const [panelGlassStopOffset, panelGlassStopOpacity] of [
      [0, 0.32],
      [0.42, 0.09],
      [0.72, 0.05],
      [1, 0.22],
    ])
      createSvgElement(panelGlassGradientElement, "stop", {
        offset: panelGlassStopOffset,
        "stop-color": panelGlowColor,
        "stop-opacity": Math.min(1, panelGlassStopOpacity * panelGlowStrength),
      });
    const panelClipPathElement = createSvgElement(panelFrameDefsElement, "clipPath", {
      id: panelFrameId + "-clip",
    });
    createSvgElement(panelClipPathElement, "rect", {
      x: edgeInset,
      y: edgeInset,
      width: innerFrameWidth,
      height: innerFrameHeight,
      rx: panelCornerRadius,
    });
    const panelGlowFilterElement = createSvgElement(panelFrameDefsElement, "filter", {
      id: panelFrameId + "-blur",
      x: "-35%",
      y: "-55%",
      width: "170%",
      height: "210%",
    });
    if (
      (createSvgElement(panelGlowFilterElement, "feGaussianBlur", {
        stdDeviation: panelGlowBlur,
      }),
      panelFrameProperties.glowVisible !== false)
    ) {
      const panelEdgeGroupElement = createSvgElement(panelFrameSvgElement, "g", {
        "clip-path": "url(#" + panelFrameId + "-clip)",
      });
      (createSvgElement(panelEdgeGroupElement, "rect", {
        x: edgeInset,
        y: edgeInset,
        width: innerFrameWidth,
        height: innerFrameHeight,
        rx: panelCornerRadius,
        fill: "url(#" + panelFrameId + "-glass)",
      }),
        panelGlowRadius > 0 &&
          panelGlowStrength > 0 &&
          createSvgElement(panelEdgeGroupElement, "rect", {
            x: edgeInset,
            y: edgeInset,
            width: innerFrameWidth,
            height: innerFrameHeight,
            rx: panelCornerRadius,
            fill: "none",
            stroke: "url(#" + panelFrameId + "-glow)",
            "stroke-width": panelGlowRadius,
            filter: "url(#" + panelFrameId + "-blur)",
          }));
    }
    panelFrameProperties.edgeVisible !== false &&
      createSvgElement(panelFrameSvgElement, "rect", {
        x: edgeInset,
        y: edgeInset,
        width: innerFrameWidth,
        height: innerFrameHeight,
        rx: panelCornerRadius,
        fill: "none",
        stroke: "url(#" + panelFrameId + "-edge)",
        "stroke-width": edgeStrokeWidth,
      });
    const textLeftPercent = clampNumber(panelFrameProperties.textLeft, -100, 200, 5.2),
      textTopPercent = clampNumber(panelFrameProperties.textTop, -100, 200, 28),
      mainTextX =
        (panelFrameWidth *
          clampNumber(panelFrameProperties.mainTextLeft, -100, 200, textLeftPercent)) /
        100,
      mainTextY =
        (panelFrameHeight *
          clampNumber(
            panelFrameProperties.mainTextTop,
            -100,
            200,
            textTopPercent -
              (clampNumber(panelFrameProperties.lineGap, 0, 500, 24) / panelFrameHeight) * 100,
          )) /
        100,
      secondaryTextX =
        (panelFrameWidth *
          clampNumber(panelFrameProperties.secondaryTextLeft, -100, 200, textLeftPercent)) /
        100,
      secondaryTextY =
        (panelFrameHeight *
          clampNumber(panelFrameProperties.secondaryTextTop, -100, 200, textTopPercent)) /
        100,
      mainTextOpacity = clampNumber(panelFrameProperties.mainOpacity, 0, 1, 0.72),
      secondaryTextOpacity = clampNumber(panelFrameProperties.secondaryOpacity, 0, 1, 0.36);
    if (panelFrameProperties.mainTextVisible !== false) {
      const panelMainTextElement = createSvgElement(panelFrameSvgElement, "text", {
          x: mainTextX,
          y: mainTextY,
          "text-anchor": "start",
          fill: normalizeCssColor(panelFrameProperties.mainColor, "#ffffff"),
          "fill-opacity": mainTextOpacity,
          "font-family": "PingFang SC,Noto Sans SC,Microsoft YaHei,sans-serif",
          "font-size": clampNumber(panelFrameProperties.mainSize, 8, 500, 30),
          "font-weight": 300,
          "letter-spacing": clampNumber(panelFrameProperties.mainSpacing, -20, 100, 2),
        }),
        mainTextWeight = clampNumber(panelFrameProperties.mainWeight, 0, 3, 0);
      (mainTextWeight > 0 &&
        Object.entries({
          stroke: normalizeCssColor(panelFrameProperties.mainColor, "#ffffff"),
          "stroke-opacity": mainTextOpacity,
          "stroke-width": mainTextWeight,
          "paint-order": "stroke fill",
        }).forEach(([attributeName, attributeValue]) =>
          panelMainTextElement.setAttribute(attributeName, attributeValue),
        ),
        (panelMainTextElement.textContent = String(panelFrameProperties.mainText || "")));
    }
    if (panelFrameProperties.secondaryTextVisible !== false) {
      const panelSecondaryTextElement = createSvgElement(panelFrameSvgElement, "text", {
          x: secondaryTextX,
          y: secondaryTextY,
          "text-anchor": "start",
          fill: normalizeCssColor(panelFrameProperties.secondaryColor, "#ffffff"),
          "fill-opacity": secondaryTextOpacity,
          "font-family": "Helvetica Neue,Arial,sans-serif",
          "font-size": clampNumber(panelFrameProperties.secondarySize, 6, 500, 15),
          "font-weight": 300,
          "letter-spacing": clampNumber(panelFrameProperties.secondarySpacing, -20, 100, 2.1),
        }),
        secondaryTextWeight = clampNumber(panelFrameProperties.secondaryWeight, 0, 3, 0);
      (secondaryTextWeight > 0 &&
        Object.entries({
          stroke: normalizeCssColor(panelFrameProperties.secondaryColor, "#ffffff"),
          "stroke-opacity": secondaryTextOpacity,
          "stroke-width": secondaryTextWeight,
          "paint-order": "stroke fill",
        }).forEach(([secondaryAttributeName, secondaryAttributeValue]) =>
          panelSecondaryTextElement.setAttribute(secondaryAttributeName, secondaryAttributeValue),
        ),
        (panelSecondaryTextElement.textContent = String(panelFrameProperties.secondaryText || "")));
    }
    return panelFrameElement;
  },
});
function componentContentUnitsPx(unitsComponent: any, unitsRenderEnvironment: any) {
  const unitsComponentScale = Math.max(
    0.01,
    Number(unitsRenderEnvironment?.document?.canvas?.componentScale || 1),
  );
  return {
    width: Math.max(1, Number(unitsComponent?.position?.width || 100)) / unitsComponentScale / 100,
    height:
      Math.max(1, Number(unitsComponent?.position?.height || 100)) / unitsComponentScale / 100,
  };
}
function navigationContentUnitPx(
  navigationUnitsComponent: any,
  navigationUnitsRenderEnvironment: any,
) {
  return (
    (componentContentUnitsPx(navigationUnitsComponent, navigationUnitsRenderEnvironment).height *
      100) /
    64.36
  );
}
function navigationComponentRenderer(navigationButtonComponent: any, navigationButtonRenderEnvironment: any) {
  const navigationButtonProperties = navigationButtonComponent.properties || {},
    resolvedTargetPage =
      ["tap", "doubleTap", "hold"]
        .map((actionKey) => navigationButtonComponent.actions?.[actionKey])
        .find(
          (navigationAction) => navigationAction?.type === "navigate" && navigationAction.target,
        )?.target ||
      navigationButtonProperties.targetPage ||
      "",
    boundNavigationEntityId = navigationButtonComponent.bindings?.entity?.entityId || "",
    navigationPreviewState =
      navigationButtonRenderEnvironment.editable &&
      ["off", "on"].includes(navigationButtonRenderEnvironment.previewState)
        ? navigationButtonRenderEnvironment.previewState
        : "auto",
    isBoundEntityActive = !!(
      boundNavigationEntityId &&
      isEntityComponentActive(
        navigationButtonComponent,
        boundNavigationEntityId,
        navigationButtonRenderEnvironment.states?.get(boundNavigationEntityId),
        navigationButtonRenderEnvironment,
      )
    ),
    isNavigationButtonActive = navigationButtonIsActive({
      targetPage: resolvedTargetPage,
      currentPagePath: navigationButtonRenderEnvironment.page?.path || "",
      entityId: boundNavigationEntityId,
      entityActive: isBoundEntityActive,
      previewState: navigationPreviewState,
    }),
    textOpacity = clampNumber(
      isNavigationButtonActive
        ? (navigationButtonProperties.textActiveOpacity ?? navigationButtonProperties.activeOpacity)
        : (navigationButtonProperties.textIdleOpacity ?? navigationButtonProperties.idleOpacity),
      0,
      1,
      isNavigationButtonActive ? 0.96 : 0.3,
    ),
    iconOpacity = clampNumber(
      isNavigationButtonActive
        ? (navigationButtonProperties.iconActiveOpacity ?? navigationButtonProperties.activeOpacity)
        : (navigationButtonProperties.iconIdleOpacity ?? navigationButtonProperties.idleOpacity),
      0,
      1,
      isNavigationButtonActive ? 0.96 : 0.3,
    ),
    navigationIntensityMultiplier = clampNumber(
      isNavigationButtonActive
        ? navigationButtonProperties.frameActiveOpacity
        : navigationButtonProperties.frameIdleOpacity,
      0,
      1,
      isNavigationButtonActive ? 0.98 : 0.48,
    ),
    navigationGlowIntensity = clampNumber(
      isNavigationButtonActive
        ? navigationButtonProperties.glowActiveStrength
        : navigationButtonProperties.glowIdleStrength,
      0,
      5,
      isNavigationButtonActive ? 2.2 : 0.5,
    ),
    navigationGlowSpreadScale = clampNumber(
      isNavigationButtonActive
        ? navigationButtonProperties.glowActiveSize
        : navigationButtonProperties.glowIdleSize,
      0,
      3,
      isNavigationButtonActive ? 3 : 1.5,
    ),
    mainTextColor = normalizeCssColor(navigationButtonProperties.mainColor, "#e9edf0"),
    secondaryTextColor = normalizeCssColor(navigationButtonProperties.secondaryColor, "#e9edf0"),
    navigationUnitScale = 100 / 64.36,
    contentUnitScale = navigationContentUnitPx(
      navigationButtonComponent,
      navigationButtonRenderEnvironment,
    ),
    navigationTextLeft = clampNumber(navigationButtonProperties.textLeft, -100, 200, 27.5),
    navigationTextTop = clampNumber(navigationButtonProperties.textTop, -100, 200, 81.5),
    mainTextLeft = clampNumber(
      navigationButtonProperties.mainTextLeft,
      -100,
      200,
      navigationTextLeft,
    ),
    mainTextTop = clampNumber(
      navigationButtonProperties.mainTextTop,
      -100,
      200,
      navigationTextTop - 18 * navigationUnitScale,
    ),
    secondaryTextLeft = clampNumber(
      navigationButtonProperties.secondaryTextLeft,
      -100,
      200,
      navigationTextLeft,
    ),
    secondaryTextTop = clampNumber(
      navigationButtonProperties.secondaryTextTop,
      -100,
      200,
      navigationTextTop,
    ),
    navigationButtonElement = document.createElement("div");
  if (
    ((navigationButtonElement.className =
      "hb-navigation-button" + (isNavigationButtonActive ? " active" : "")),
    (navigationButtonElement.dataset.targetPage = resolvedTargetPage),
    navigationButtonElement.style.setProperty("--navigation-text-opacity", String(textOpacity)),
    navigationButtonElement.style.setProperty("--navigation-icon-opacity", String(iconOpacity)),
    navigationButtonElement.style.setProperty(
      "--navigation-icon-size",
      clampNumber(navigationButtonProperties.iconSize, 1, 500, 50) * contentUnitScale + "px",
    ),
    navigationButtonElement.style.setProperty(
      "--navigation-icon-left",
      clampNumber(navigationButtonProperties.iconLeft, -100, 200, 14) + "%",
    ),
    navigationButtonElement.style.setProperty(
      "--navigation-icon-top",
      clampNumber(navigationButtonProperties.iconTop, -100, 200, 50) + "%",
    ),
    navigationButtonElement.style.setProperty(
      "--navigation-main-size",
      clampNumber(navigationButtonProperties.mainSize, 1, 500, 30) * contentUnitScale + "px",
    ),
    navigationButtonElement.style.setProperty(
      "--navigation-secondary-size",
      clampNumber(navigationButtonProperties.secondarySize, 1, 500, 11) * contentUnitScale + "px",
    ),
    navigationButtonElement.style.setProperty(
      "--navigation-main-spacing",
      clampNumber(navigationButtonProperties.mainSpacing, -20, 100, 8) * contentUnitScale + "px",
    ),
    navigationButtonElement.style.setProperty(
      "--navigation-secondary-spacing",
      clampNumber(navigationButtonProperties.secondarySpacing, -20, 100, 3) * contentUnitScale +
        "px",
    ),
    navigationButtonElement.style.setProperty("--navigation-main-left", mainTextLeft + "%"),
    navigationButtonElement.style.setProperty(
      "--navigation-secondary-left",
      secondaryTextLeft + "%",
    ),
    navigationButtonElement.style.setProperty("--navigation-main-top", mainTextTop + "%"),
    navigationButtonElement.style.setProperty("--navigation-secondary-top", secondaryTextTop + "%"),
    (navigationButtonProperties.glowVisible !== false ||
      navigationButtonProperties.frameVisible !== false) &&
      navigationButtonElement.append(
        createNavigationEffectsSvg(
          navigationButtonComponent,
          navigationButtonProperties,
          isNavigationButtonActive,
          navigationIntensityMultiplier,
          navigationGlowIntensity,
          navigationGlowSpreadScale,
        ),
      ),
    navigationButtonProperties.iconVisible !== false)
  ) {
    const navigationIconUrl = resolveMdiIconUrl(
      navigationButtonProperties.icon || "mdi:home-lightbulb-outline",
    );
    if (navigationIconUrl) {
      const navigationIconElement = document.createElement("i");
      ((navigationIconElement.className = "hb-navigation-icon"),
        navigationIconElement.setAttribute("aria-hidden", "true"),
        (navigationIconElement.style.backgroundColor = normalizeCssColor(
          navigationButtonProperties.iconColor,
          "#e9edf0",
        )),
        navigationIconElement.style.setProperty("mask-image", 'url("' + navigationIconUrl + '")'),
        navigationIconElement.style.setProperty(
          "-webkit-mask-image",
          'url("' + navigationIconUrl + '")',
        ),
        navigationButtonElement.append(navigationIconElement));
    }
  }
  const navigationTextElement = document.createElement("span");
  if (
    ((navigationTextElement.className = "hb-navigation-text"),
    navigationButtonProperties.mainTextVisible !== false)
  ) {
    const navigationMainTextElement = document.createElement("strong");
    ((navigationMainTextElement.textContent = navigationButtonProperties.mainText || "页面导航"),
      (navigationMainTextElement.style.color = mainTextColor),
      (navigationMainTextElement.style.webkitTextStrokeColor = mainTextColor),
      (navigationMainTextElement.style.webkitTextStrokeWidth =
        clampNumber(navigationButtonProperties.mainWeight, 0, 3, 0) * contentUnitScale + "px"),
      navigationTextElement.append(navigationMainTextElement));
  }
  if (navigationButtonProperties.secondaryTextVisible !== false) {
    const navigationSecondaryTextElement = document.createElement("small");
    ((navigationSecondaryTextElement.textContent =
      navigationButtonProperties.secondaryText || "NAVIGATION"),
      (navigationSecondaryTextElement.style.color = secondaryTextColor),
      (navigationSecondaryTextElement.style.webkitTextStrokeColor = secondaryTextColor),
      (navigationSecondaryTextElement.style.webkitTextStrokeWidth =
        clampNumber(navigationButtonProperties.secondaryWeight, 0, 3, 0) * contentUnitScale + "px"),
      navigationTextElement.append(navigationSecondaryTextElement));
  }
  return (
    navigationTextElement.childElementCount &&
      navigationButtonElement.append(navigationTextElement),
    navigationButtonElement
  );
}
(registerComponent("navigation-button", {
  render: navigationComponentRenderer,
}),
  registerComponent("scene-mode", {
    render(sceneModeComponent: any, sceneModeRenderEnvironment: any) {
      const sceneModeElement = document.createElement("button");
      ((sceneModeElement.type = "button"),
        (sceneModeElement.className = "hb-scene-mode"),
        sceneModeElement.setAttribute(
          "aria-label",
          sceneModeComponent.properties?.mainText || "情景模式",
        ));
      const navigationButtonViewElement = navigationComponentRenderer(
        {
          ...sceneModeComponent,
          actions: {} as Record<string, any>,
          bindings: {} as Record<string, any>,
          properties: {
            ...sceneModeComponent.properties,
            targetPage: "",
            frameVisible: false,
            glowVisible: false,
          },
        },
        {
          ...sceneModeRenderEnvironment,
          editable: true,
          previewState: "off",
        },
      );
      return (
        sceneModeElement.append(navigationButtonViewElement),
        bindSceneMode(
          sceneModeElement,
          navigationButtonViewElement,
          sceneModeComponent,
          sceneModeRenderEnvironment,
        ),
        sceneModeElement
      );
    },
  }),
  registerComponent("percentage-bar", {
    render: renderPercentageBarControl,
  }));
