const climateRendererModule = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../static/renderer/climate.js", import.meta.url))
  : import("/static/renderer/climate.js?v=20260915211726"));
const {
  normalizeClimateCapabilities: normalizeClimateCapabilities,
  climateIsPoweredOn: climateIsPoweredOn,
  climateIsRunning: climateIsRunning,
  climatePowerCommand: climatePowerCommand
} = climateRendererModule;
export const {
  climateModeLabel,
  climateModeIcon,
  climateSwingModeLabel,
  climateOptionPresentation
} = climateRendererModule;
const toFiniteNumber = input =>
  input != null && input !== "" && typeof input != "boolean" && Number.isFinite(Number(input))
    ? Number(input)
    : null;
export function climateState(entityId, receivedState) {
  const stateObject = receivedState?.newState || receivedState || {};
  const attributes = stateObject.attributes || {};
  const capabilities = normalizeClimateCapabilities(stateObject);
  const stateValue = typeof stateObject.state == "string" ? stateObject.state : "";
  const minimum = toFiniteNumber(attributes.min_temp);
  const maximum = toFiniteNumber(attributes.max_temp);
  const temperature = toFiniteNumber(attributes.temperature);
  const supportedFeatures = toFiniteNumber(attributes.supported_features) || 0;
  const targetLow = toFiniteNumber(attributes.target_temp_low);
  const targetHigh = toFiniteNumber(attributes.target_temp_high);
  const available =
    /^climate\.[a-z0-9_]+$/.test(entityId) &&
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
          .toLowerCase()
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
    currentTemperature: toFiniteNumber(attributes.current_temperature),
    targetLow: targetLow,
    targetHigh: targetHigh,
    minimum: minimum,
    maximum: maximum,
    step: capabilities.temperatureStep,
    temperatureSupported:
      minimum !== null &&
      maximum !== null &&
      maximum > minimum &&
      (temperature !== null || !!(supportedFeatures & 1)),
    rangeSupported: !!(supportedFeatures & 2) || targetLow !== null || targetHigh !== null,
    modes: capabilities.hvacModes,
    fanModes: capabilities.fanModes,
    swingModes: capabilities.swingModes,
    horizontalSwingModes: capabilities.horizontalSwingModes,
    presetModes: capabilities.presetModes,
    fanMode: attributes.fan_mode || "",
    swingMode: attributes.swing_mode || "",
    horizontalSwingMode: attributes.swing_horizontal_mode || "",
    presetMode: attributes.preset_mode || ""
  };
}
export function climatePowerControl(state, desiredOn = !state.on, lastMode = "") {
  if (!state.available) {
    throw new Error("设备当前不可用。");
  }
  const command = climatePowerCommand(
    state.entityId,
    state.raw,
    desiredOn,
    "air-conditioner",
    lastMode
  );
  if (command.domain !== "climate" || command.service !== "set_hvac_mode") {
    throw new Error("设备尚未提供可用的开关模式。");
  }
  return {
    entityId: state.entityId,
    domain: "climate",
    service: command.service,
    data: command.data
  };
}
export function climateControl(deviceState, service, value) {
  if (!deviceState.available) {
    throw new Error("设备当前不可用。");
  }
  let serviceData;
  if (service === "set_temperature") {
    const requestedTemperature = toFiniteNumber(value);
    if (!deviceState.temperatureSupported || requestedTemperature === null) {
      throw new Error("设备尚未提供可用的温度控制。");
    }
    const fractionDigits = Math.min(
      8,
      Math.max(
        String(deviceState.step).split(".")[1]?.length || 0,
        String(deviceState.minimum).split(".")[1]?.length || 0
      )
    );
    const normalizedTemperature = Number(
      (
        deviceState.minimum +
        Math.round(
          (Math.max(deviceState.minimum, Math.min(deviceState.maximum, requestedTemperature)) -
            deviceState.minimum) /
            deviceState.step
        ) *
          deviceState.step
      ).toFixed(fractionDigits)
    );
    if (
      normalizedTemperature < deviceState.minimum ||
      normalizedTemperature > deviceState.maximum
    ) {
      throw new Error("设定温度超出设备范围。");
    }
    serviceData = {
      temperature: normalizedTemperature
    };
  } else {
    const serviceSpec = {
      set_hvac_mode: ["modes", "hvac_mode"],
      set_fan_mode: ["fanModes", "fan_mode"],
      set_swing_mode: ["swingModes", "swing_mode"]
    }[service];
    if (!serviceSpec || !deviceState[serviceSpec[0]].includes(value)) {
      throw new Error("设备不支持此控制选项。");
    }
    serviceData = {
      [serviceSpec[1]]: value
    };
  }
  return {
    entityId: deviceState.entityId,
    domain: "climate",
    service: service,
    data: serviceData
  };
}
