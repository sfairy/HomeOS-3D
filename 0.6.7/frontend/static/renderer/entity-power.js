import {
  climateIsPoweredOn,
  climatePowerCommand,
  resolveClimateDeviceType,
} from "./climate.js?v=20260812-presence-phase-v79";
function readEntityState(state) {
  return (
    state?.newState ||
    state || {
      state: "",
      attributes: {},
    }
  );
}
export function entityPowerTarget(entityId, componentConfig = {}, deviceProfile = null) {
  return componentConfig?.type !== "air-conditioner" &&
    deviceProfile?.deviceType === "bath-heater" &&
    deviceProfile.roles?.light
    ? String(deviceProfile.roles.light)
    : String(entityId || "");
}
export function entityPowerIsOn(targetEntityId, reportedState, targetDevice = {}) {
  const stateEntry = readEntityState(reportedState),
    domain = String(targetEntityId || "").split(".", 1)[0],
    normalizedState = String(stateEntry.state || "")
      .trim()
      .toLowerCase();
  return domain === "climate"
    ? climateIsPoweredOn(
        stateEntry,
        resolveClimateDeviceType(targetDevice, stateEntry, targetEntityId),
      )
    : domain === "fan"
      ? !["", "off", "unknown", "unavailable"].includes(normalizedState)
      : domain === "water_heater"
        ? climateIsPoweredOn(stateEntry, "water-heater")
        : domain === "media_player"
          ? ["playing", "buffering"].includes(normalizedState)
          : ["on", "open", "true", "home"].includes(normalizedState);
}
export function entityToggleCommand(commandEntityId, commandState, commandDevice = {}) {
  const commandStateEntry = readEntityState(commandState),
    commandDomain = String(commandEntityId || "").split(".", 1)[0];
  if (commandDomain === "button")
    return {
      domain: "button",
      service: "press",
      data: {},
    };
  if (commandDomain === "script")
    return {
      domain: "script",
      service: "turn_on",
      data: {},
    };
  if (commandDomain === "media_player")
    return {
      domain: "media_player",
      service: "media_play_pause",
      data: {},
    };
  if (["climate", "fan", "water_heater"].includes(commandDomain)) {
    const climateDeviceType =
      commandDomain === "water_heater"
        ? "water-heater"
        : resolveClimateDeviceType(commandDevice, commandStateEntry, commandEntityId);
    return climatePowerCommand(
      commandEntityId,
      commandStateEntry,
      !entityPowerIsOn(commandEntityId, commandStateEntry, commandDevice),
      climateDeviceType,
    );
  }
  return {
    domain: "homeassistant",
    service: "toggle",
    data: {},
  };
}
export function optimisticToggleState(optimisticEntityId, optimisticState, optimisticDevice = {}) {
  const optimisticStateEntry = readEntityState(optimisticState),
    optimisticDomain = String(optimisticEntityId || "").split(".", 1)[0],
    wasOn = entityPowerIsOn(optimisticEntityId, optimisticStateEntry, optimisticDevice);
  if (optimisticDomain === "media_player")
    return {
      ...optimisticStateEntry,
      state: entityPowerIsOn(optimisticEntityId, optimisticStateEntry, optimisticDevice)
        ? "paused"
        : "playing",
    };
  if (optimisticDomain === "climate") {
    const attributes = {
      ...(optimisticStateEntry.attributes || {}),
    };
    return (
      wasOn || (delete attributes.preset_mode, delete attributes.mode),
      {
        ...optimisticStateEntry,
        state: wasOn ? "off" : "auto",
        attributes: attributes,
      }
    );
  }
  return {
    ...optimisticStateEntry,
    state: wasOn ? "off" : "on",
  };
}
