import {
  climateIsPoweredOn,
  climatePowerCommand,
  resolveClimateDeviceType,
} from "../controls/climate";
function readEntityState(state: any) {
  return (
    state?.newState ||
    state || {
      state: "",
      attributes: {} as Record<string, any>,
    }
  );
}
export function entityPowerTarget(
  entityId: string,
  componentConfig: { type?: string } = {},
  deviceProfile: any = null,
) {
  return componentConfig?.type !== "air-conditioner" &&
    deviceProfile?.deviceType === "bath-heater" &&
    deviceProfile.roles?.light
    ? String(deviceProfile.roles.light)
    : String(entityId || "");
}
export function entityPowerIsOn(targetEntityId: any, reportedState: any, targetDevice: Record<string, any> = {}) {
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
export function entityToggleCommand(commandEntityId: any, commandState: any, commandDevice: Record<string, any> = {}) {
  const commandStateEntry = readEntityState(commandState),
    commandDomain = String(commandEntityId || "").split(".", 1)[0];
  if (commandDomain === "button")
    return {
      domain: "button",
      service: "press",
      data: {} as Record<string, any>,
    };
  if (commandDomain === "script")
    return {
      domain: "script",
      service: "turn_on",
      data: {} as Record<string, any>,
    };
  if (commandDomain === "media_player")
    return {
      domain: "media_player",
      service: "media_play_pause",
      data: {} as Record<string, any>,
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
    data: {} as Record<string, any>,
  };
}
export function optimisticToggleState(optimisticEntityId: any, optimisticState: any, optimisticDevice: Record<string, any> = {}) {
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
