const climateRendererModule = await (import("@app/renderer/controls/climate")),
  waterHeaterRendererModule = await (import("@app/renderer/controls/water-heater"));
export const { createWaterHeaterFeedback, waterHeaterCapabilities } = waterHeaterRendererModule;
export function waterHeaterStatusLabel(entityState) {
  const capabilities = waterHeaterRendererModule.waterHeaterCapabilities(entityState);
  if (!capabilities.available)
    return entityState?.state === "unavailable" || entityState?.available === false
      ? "设备不可用"
      : "状态未知";
  if (capabilities.away) return "离家模式";
  if (entityState.state === "off") return "已关闭";
  const presentationMode = climateRendererModule.climatePresentationMode(
    entityState,
    "water-heater",
  );
  return presentationMode === "on"
    ? "已开启"
    : "当前模式 · " +
        (presentationMode === "high_demand"
          ? "高需求"
          : climateRendererModule.climateModeLabel(presentationMode, "water-heater"));
}
const {
  normalizeClimateCapabilities: normalizeClimateCapabilities,
  climateIsPoweredOn: climateIsPoweredOn,
  climateIsRunning: climateIsRunning,
  climatePowerCommand: climatePowerCommand,
} = climateRendererModule;
export const {
  climateModeLabel,
  climateModeIcon,
  climateSwingModeLabel,
  climateOptionPresentation,
} = climateRendererModule;
const finiteNumberOrNull = (rawValue) =>
  rawValue != null &&
  rawValue !== "" &&
  typeof rawValue != "boolean" &&
  Number.isFinite(Number(rawValue))
    ? Number(rawValue)
    : null;
function purifierSpeedLevels(percentageStep) {
  const step = finiteNumberOrNull(percentageStep);
  if (step === null || step <= 0 || step > 100) return [];
  const levelCount = Math.round(100 / step);
  return levelCount < 1 || levelCount > 10 || Math.abs(step - 100 / levelCount) > 0.02
    ? []
    : Array.from(
        {
          length: levelCount,
        },
        (_levelUnused, levelIndex) => ({
          label: levelCount === 3 ? ["低档", "中档", "高档"][levelIndex] : levelIndex + 1 + " 档",
          percentage: Math.floor((100 * (levelIndex + 1)) / levelCount),
        }),
      );
}
export function climateState(entityId, receivedState) {
  const stateObject = receivedState?.newState || receivedState || {},
    attributes = stateObject.attributes || {};
  if (/^water_heater\.[a-z0-9_]+$/.test(entityId)) {
    const heaterCapabilities = waterHeaterRendererModule.waterHeaterCapabilities(stateObject),
      isWaterHeaterOn =
        heaterCapabilities.available && climateIsPoweredOn(stateObject, "water-heater");
    return {
      entityId: entityId,
      raw: stateObject,
      waterHeater: true,
      ...heaterCapabilities,
      available: heaterCapabilities.available,
      on: isWaterHeaterOn,
      running: false,
      name: attributes.friendly_name || "热水器",
      mode: climateRendererModule.climatePresentationMode(stateObject, "water-heater"),
      visualMode: isWaterHeaterOn ? "heat" : "off",
      temperatureUnit: heaterCapabilities.unit,
      rangeSupported: false,
      fanModes: [],
      swingModes: [],
      presetModes: [],
      turnOnSupported: heaterCapabilities.nativePower,
    };
  }
  if (/^fan\.[a-z0-9_]+$/.test(entityId)) {
    const isPurifierAvailable =
        stateObject.available !== false && ["on", "off"].includes(stateObject.state),
      percentage = finiteNumberOrNull(attributes.percentage),
      purifierFeatures = finiteNumberOrNull(attributes.supported_features) || 0,
      hasSupportedFeatures = finiteNumberOrNull(attributes.supported_features) !== null,
      percentageSupported = hasSupportedFeatures ? !!(purifierFeatures & 1) : percentage !== null,
      isOscillatingSupported = !!(purifierFeatures & 2),
      isDirectionSupported = !!(purifierFeatures & 4),
      presetModes =
        (!hasSupportedFeatures || purifierFeatures & 8) && Array.isArray(attributes.preset_modes)
          ? [
              ...new Set(
                attributes.preset_modes.filter(
                  (presetMode) => typeof presetMode == "string" && presetMode.trim(),
                ),
              ),
            ]
          : [];
    return {
      entityId: entityId,
      raw: stateObject,
      purifier: true,
      available: isPurifierAvailable,
      on: isPurifierAvailable && stateObject.state === "on",
      running: isPurifierAvailable && stateObject.state === "on",
      name: attributes.friendly_name || "空气净化器",
      mode: stateObject.state,
      visualMode: stateObject.state === "on" ? "other" : "off",
      temperature: null,
      currentTemperature: null,
      temperatureSupported: false,
      rangeSupported: false,
      percentage: percentage,
      percentageSupported: percentageSupported,
      percentageStep: finiteNumberOrNull(attributes.percentage_step) || 1,
      speedLevels: percentageSupported ? purifierSpeedLevels(attributes.percentage_step) : [],
      modes: ["off", "on"],
      fanModes: [],
      swingModes: [],
      presetModes: presetModes,
      presetMode: attributes.preset_mode || "",
      oscillating: attributes.oscillating === true,
      oscillatingSupported: isOscillatingSupported,
      direction: attributes.direction || "",
      directionSupported: isDirectionSupported,
      turnOnSupported: true,
    };
  }
  const climateCapabilities = normalizeClimateCapabilities(stateObject),
    stateValue = typeof stateObject.state == "string" ? stateObject.state : "",
    minimum = finiteNumberOrNull(attributes.min_temp),
    maximum = finiteNumberOrNull(attributes.max_temp),
    temperature = finiteNumberOrNull(attributes.temperature),
    supportedFeatures = finiteNumberOrNull(attributes.supported_features) || 0,
    targetLow = finiteNumberOrNull(attributes.target_temp_low),
    targetHigh = finiteNumberOrNull(attributes.target_temp_high),
    hasSupportedFeaturesAttribute = finiteNumberOrNull(attributes.supported_features) !== null,
    resolveFeatureSupport = (featureBit, fallbackResult) =>
      hasSupportedFeaturesAttribute ? !!(supportedFeatures & featureBit) : fallbackResult,
    hasTemperatureRange = minimum !== null && maximum !== null && maximum > minimum,
    temperatureUnit = ["°C", "°F", "K"].includes(attributes.temperature_unit)
      ? attributes.temperature_unit
      : "°",
    parsedTargetStep = finiteNumberOrNull(attributes.target_temp_step),
    temperatureStep = parsedTargetStep > 0 ? parsedTargetStep : temperatureUnit === "°F" ? 1 : 0.5,
    temperatureSupported = hasTemperatureRange && resolveFeatureSupport(1, temperature !== null),
    rangeSupported =
      hasTemperatureRange && resolveFeatureSupport(2, targetLow !== null || targetHigh !== null),
    available =
      /^(climate|water_heater)\.[a-z0-9_]+$/.test(entityId) &&
      stateObject.available !== false &&
      !!stateValue &&
      !["unknown", "unavailable"].includes(stateValue);
  return {
    entityId: entityId,
    raw: stateObject,
    available: available,
    on: available && climateIsPoweredOn(stateObject, "air-conditioner"),
    running:
      available &&
      !["unknown", "unavailable"].includes(
        String(attributes.hvac_action || "")
          .trim()
          .toLowerCase(),
      ) &&
      climateIsRunning(stateObject, "air-conditioner"),
    name: String(attributes.friendly_name || entityId || "空调"),
    mode: stateValue,
    visualMode:
      !available || !climateIsPoweredOn(stateObject, "air-conditioner")
        ? "off"
        : stateValue === "cool"
          ? "cool"
          : stateValue === "heat"
            ? "heat"
            : "other",
    temperature: temperature,
    currentTemperature: finiteNumberOrNull(attributes.current_temperature),
    targetLow: targetLow,
    targetHigh: targetHigh,
    minimum: minimum,
    maximum: maximum,
    step: temperatureStep,
    temperatureUnit: temperatureUnit,
    temperatureSupported: temperatureSupported,
    rangeSupported: rangeSupported,
    useTemperatureRange: rangeSupported && (stateValue === "heat_cool" || !temperatureSupported),
    modes: climateCapabilities.hvacModes,
    fanModes: resolveFeatureSupport(8, true) ? climateCapabilities.fanModes : [],
    turnOnSupported: !!(supportedFeatures & 256),
    turnOffSupported: !!(supportedFeatures & 128),
    canTurnOn:
      !!(supportedFeatures & 256) || climateCapabilities.hvacModes.some((mode) => mode !== "off"),
    canTurnOff: !!(supportedFeatures & 128) || climateCapabilities.hvacModes.includes("off"),
    swingModes: resolveFeatureSupport(32, true) ? climateCapabilities.swingModes : [],
    horizontalSwingModes: resolveFeatureSupport(512, true)
      ? climateCapabilities.horizontalSwingModes
      : [],
    presetModes: resolveFeatureSupport(16, true) ? climateCapabilities.presetModes : [],
    fanMode: attributes.fan_mode || "",
    swingMode: attributes.swing_mode || "",
    horizontalSwingMode: attributes.swing_horizontal_mode || "",
    presetMode: attributes.preset_mode || "",
  };
}
export function climatePowerControl(state, desiredOn = !state.on, lastMode = "") {
  if (!state.available) throw new Error("设备当前不可用。");
  if (state.waterHeater)
    return {
      entityId: state.entityId,
      ...waterHeaterRendererModule.waterHeaterPowerCommand(state.raw, desiredOn, lastMode),
    };
  if (state.purifier)
    return {
      entityId: state.entityId,
      domain: "fan",
      service: desiredOn ? "turn_on" : "turn_off",
      data: {},
    };
  if (!desiredOn && state.turnOffSupported)
    return {
      entityId: state.entityId,
      domain: "climate",
      service: "turn_off",
      data: {},
    };
  if (desiredOn) {
    const restoreMode = lastMode || (state.on ? state.mode : "");
    if (restoreMode && restoreMode !== "off" && state.modes.includes(restoreMode))
      return {
        entityId: state.entityId,
        domain: "climate",
        service: "set_hvac_mode",
        data: {
          hvac_mode: restoreMode,
        },
      };
    if (state.turnOnSupported)
      return {
        entityId: state.entityId,
        domain: "climate",
        service: "turn_on",
        data: {},
      };
  }
  const command = climatePowerCommand(
    state.entityId,
    state.raw,
    desiredOn,
    "air-conditioner",
    lastMode,
  );
  if (command.domain !== "climate" || command.service !== "set_hvac_mode")
    throw new Error("设备尚未提供可用的开关模式。");
  return {
    entityId: state.entityId,
    domain: "climate",
    service: command.service,
    data: command.data,
  };
}
export function createClimateModeHistory({
  storage: storage,
  scope: scope = "",
}: { storage?: Storage; scope?: string } = {}) {
  const modesByEntityId = new Map();
  let isStorageUsable = true;
  const isUsableMode = (candidateMode) =>
      typeof candidateMode == "string" &&
      !!candidateMode.trim() &&
      candidateMode.length <= 120 &&
      !/[{}\[\]\x00-\x1f]/.test(candidateMode) &&
      !["off", "unknown", "unavailable"].includes(candidateMode),
    storageKeyFor = (historyEntityId) =>
      scope && /^(climate|water_heater)\.[a-z0-9_]+$/.test(historyEntityId)
        ? "homeos:i3d-climate-mode:v1:" + scope + ":" + historyEntityId
        : "";
  function getStoredMode(lookupEntityId) {
    const storageKey = storageKeyFor(lookupEntityId);
    try {
      const storedMode = isStorageUsable && storageKey && storage?.getItem(storageKey);
      if (isUsableMode(storedMode))
        return (modesByEntityId.set(lookupEntityId, storedMode), storedMode);
    } catch {
      isStorageUsable = false;
    }
    return modesByEntityId.get(lookupEntityId) || "";
  }
  function observeClimateState(observedEntityId, observedReceivedState) {
    const observedState = climateState(observedEntityId, observedReceivedState);
    if (
      !(
        !observedState.available ||
        !observedState.on ||
        !isUsableMode(observedState.mode) ||
        !observedState.modes.includes(observedState.mode)
      ) &&
      getStoredMode(observedEntityId) !== observedState.mode
    ) {
      modesByEntityId.set(observedEntityId, observedState.mode);
      try {
        const observedStorageKey = storageKeyFor(observedEntityId);
        isStorageUsable &&
          observedStorageKey &&
          storage?.setItem(observedStorageKey, observedState.mode);
      } catch {
        isStorageUsable = false;
      }
    }
  }
  return {
    get: getStoredMode,
    observe: observeClimateState,
  };
}
export function climateControl(deviceState, service, value) {
  if (deviceState.purifier) {
    if (!deviceState.available) throw new Error("设备当前不可用。");
    if (
      service === "set_percentage" &&
      deviceState.percentageSupported &&
      Number.isFinite(Number(value)) &&
      Number(value) >= 0 &&
      Number(value) <= 100
    )
      return {
        entityId: deviceState.entityId,
        domain: "fan",
        service: service,
        data: {
          percentage: Number(value),
        },
      };
    if (service === "set_preset_mode" && deviceState.presetModes.includes(value))
      return {
        entityId: deviceState.entityId,
        domain: "fan",
        service: service,
        data: {
          preset_mode: value,
        },
      };
    if (service === "oscillate" && deviceState.oscillatingSupported && typeof value == "boolean")
      return {
        entityId: deviceState.entityId,
        domain: "fan",
        service: service,
        data: {
          oscillating: value,
        },
      };
    if (
      service === "set_direction" &&
      deviceState.directionSupported &&
      ["forward", "reverse"].includes(value)
    )
      return {
        entityId: deviceState.entityId,
        domain: "fan",
        service: service,
        data: {
          direction: value,
        },
      };
    throw new Error("空气净化器不支持此操作。");
  }
  if (!deviceState.available) throw new Error("设备当前不可用。");
  let serviceData;
  if (deviceState.waterHeater && service === "set_away_mode") {
    if (!deviceState.awaySupported || typeof value != "boolean")
      throw new Error("设备不支持离家模式。");
    return {
      entityId: deviceState.entityId,
      domain: "water_heater",
      service: service,
      data: {
        away_mode: value,
      },
    };
  }
  if (service === "set_temperature") {
    const isRangeRequest = value !== null && typeof value == "object";
    if (
      isRangeRequest
        ? !deviceState.rangeSupported ||
          Object.keys(value).sort().join(",") !== "target_temp_high,target_temp_low"
        : !deviceState.temperatureSupported
    )
      throw new Error("设备尚未提供可用的温度控制。");
    const fractionDigits = Math.min(
        8,
        Math.max(
          String(deviceState.step).split(".")[1]?.length || 0,
          String(deviceState.minimum).split(".")[1]?.length || 0,
        ),
      ),
      alignTemperature = (requestedTemperature) => {
        const parsedTemperature = finiteNumberOrNull(requestedTemperature);
        if (parsedTemperature === null) throw new Error("设备尚未提供可用的温度控制。");
        const maxSteps = Math.floor(
            (deviceState.maximum - deviceState.minimum) / deviceState.step + 1e-8,
          ),
          stepIndex = Math.max(
            0,
            Math.min(
              maxSteps,
              Math.round((parsedTemperature - deviceState.minimum) / deviceState.step),
            ),
          );
        return Number((deviceState.minimum + stepIndex * deviceState.step).toFixed(fractionDigits));
      };
    if (
      ((serviceData = isRangeRequest
        ? {
            target_temp_low: alignTemperature(value.target_temp_low),
            target_temp_high: alignTemperature(value.target_temp_high),
          }
        : {
            temperature: alignTemperature(value),
          }),
      isRangeRequest && serviceData.target_temp_low > serviceData.target_temp_high)
    )
      throw new Error("温区下限不能高于上限。");
  } else {
    const serviceSpec = (
      deviceState.waterHeater
        ? {
            set_operation_mode: ["modes", "operation_mode"],
          }
        : {
            set_hvac_mode: ["modes", "hvac_mode"],
            set_fan_mode: ["fanModes", "fan_mode"],
            set_swing_mode: ["swingModes", "swing_mode"],
            set_swing_horizontal_mode: ["horizontalSwingModes", "swing_horizontal_mode"],
            set_preset_mode: ["presetModes", "preset_mode"],
          }
    )[service];
    if (!serviceSpec || !deviceState[serviceSpec[0]].includes(value))
      throw new Error("设备不支持此控制选项。");
    serviceData = {
      [serviceSpec[1]]: value,
    };
  }
  return {
    entityId: deviceState.entityId,
    domain: deviceState.waterHeater ? "water_heater" : "climate",
    service: service,
    data: serviceData,
  };
}
