import {
  climateIsPoweredOn,
  climatePowerCommand,
  resolveClimateDeviceType
} from "./climate.js?v=20260915211726";
function unwrapStateChange(stateOrChange) {
  return (
    stateOrChange?.newState ||
    stateOrChange || {
      state: "",
      attributes: {}
    }
  );
}
export function entityPowerTarget(runtimeEntityId, component = {}, deviceProfile = null) {
  if (
    component?.type !== "air-conditioner" &&
    deviceProfile?.deviceType === "bath-heater" &&
    deviceProfile.roles?.light
  ) {
    return String(deviceProfile.roles.light);
  } else {
    return String(runtimeEntityId || "");
  }
}
export function entityPowerIsOn(entityId, stateInput, ownerComponent = {}) {
  const stateObject = unwrapStateChange(stateInput);
  const domain = String(entityId || "").split(".", 1)[0];
  const normalizedState = String(stateObject.state || "")
    .trim()
    .toLowerCase();
  if (domain === "climate") {
    return climateIsPoweredOn(
      stateObject,
      resolveClimateDeviceType(ownerComponent, stateObject, entityId)
    );
  } else if (domain === "fan") {
    return !["", "off", "unknown", "unavailable"].includes(normalizedState);
  } else if (domain === "water_heater") {
    return climateIsPoweredOn(stateObject, "water-heater");
  } else if (domain === "media_player") {
    return ["playing", "buffering"].includes(normalizedState);
  } else {
    return ["on", "open", "true", "home"].includes(normalizedState);
  }
}
export function entityToggleCommand(targetEntityId, stateSource, toggleComponent = {}) {
  const entityState = unwrapStateChange(stateSource);
  const toggleDomain = String(targetEntityId || "").split(".", 1)[0];
  if (toggleDomain === "button") {
    return {
      domain: "button",
      service: "press",
      data: {}
    };
  }
  if (toggleDomain === "script") {
    return {
      domain: "script",
      service: "turn_on",
      data: {}
    };
  }
  if (toggleDomain === "media_player") {
    return {
      domain: "media_player",
      service: "media_play_pause",
      data: {}
    };
  }
  if (["climate", "fan", "water_heater"].includes(toggleDomain)) {
    const deviceType =
      toggleDomain === "water_heater"
        ? "water-heater"
        : resolveClimateDeviceType(toggleComponent, entityState, targetEntityId);
    return climatePowerCommand(
      targetEntityId,
      entityState,
      !entityPowerIsOn(targetEntityId, entityState, toggleComponent),
      deviceType
    );
  }
  return {
    domain: "homeassistant",
    service: "toggle",
    data: {}
  };
}
export function optimisticToggleState(sourceEntityId, stateValue, sourceComponent = {}) {
  const currentState = unwrapStateChange(stateValue);
  const entityDomain = String(sourceEntityId || "").split(".", 1)[0];
  const isPoweredOn = entityPowerIsOn(sourceEntityId, currentState, sourceComponent);
  if (entityDomain === "media_player") {
    return {
      ...currentState,
      state: entityPowerIsOn(sourceEntityId, currentState, sourceComponent) ? "paused" : "playing"
    };
  }
  if (entityDomain === "climate") {
    const nextAttributes = {
      ...(currentState.attributes || {})
    };
    if (!isPoweredOn) {
      delete nextAttributes.preset_mode;
      delete nextAttributes.mode;
    }
    return {
      ...currentState,
      state: isPoweredOn ? "off" : "auto",
      attributes: nextAttributes
    };
  }
  return {
    ...currentState,
    state: isPoweredOn ? "off" : "on"
  };
}
