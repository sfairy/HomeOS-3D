/** Cover / climate / entity presentation helpers shared by registry component renderers. */
import {
  climateEffectMode,
  climateIsPoweredOn,
  climateModeLabel,
  climatePresentationMode,
  normalizeClimateCapabilities,
  resolveClimateDeviceType,
} from "../../controls/climate";
import { entityPowerIsOn } from "../entity-power";
import { lightRealtimeCapabilities } from "../../controls/light-runtime";
import { resolveStatePayload, isActiveStateText } from "./_shared";
import { formatNumericValue } from "../../controls/line-chart-runtime";

type RenderPropertyBag = any;

const COVER_POSITION_THRESHOLD = 1;
export function isCoverMotorReversed(component: any) {
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
export function isEntityComponentActive(
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
export function resolveEntityIcon(iconEntityId: any, iconStatePayload: any) {
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
export function formatEntityState(
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
export function isCoverAuthoredActive(authoredComponent: any, authoredRenderEnvironment: any) {
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
export function isCoverComponentActive(toggleComponent: any, toggleRenderEnvironment: any) {
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
export function resolveClimateEffectMode(climateComponent: any, climateRenderEnvironment: any) {
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
export function isClimatePoweredOn(climatePowerComponent: any, climatePowerRenderEnvironment: any) {
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

export function resolveAirflowMotionKind(airflowComponent: any, airflowRenderEnvironment: any) {
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

export function formatClimateStateLabel(labelComponent: any, labelRenderEnvironment: any) {
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
