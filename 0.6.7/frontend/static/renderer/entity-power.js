import {
  climateIsPoweredOn,
  climatePowerCommand,
  resolveClimateDeviceType,
} from "./climate.js?v=20260812-presence-phase-v79";
function s(arg1) {
  return (
    arg1?.newState ||
    arg1 || {
      state: "",
      attributes: {},
    }
  );
}
export function entityPowerTarget(arg2, arg3 = {}, arg4 = null) {
  return arg3?.type !== "air-conditioner" && arg4?.deviceType === "bath-heater" && arg4.roles?.light
    ? String(arg4.roles.light)
    : String(arg2 || "");
}
export function entityPowerIsOn(arg5, arg6, arg7 = {}) {
  const value1 = s(arg6),
    value2 = String(arg5 || "").split(".", 1)[0],
    value3 = String(value1.state || "")
      .trim()
      .toLowerCase();
  return value2 === "climate"
    ? climateIsPoweredOn(value1, resolveClimateDeviceType(arg7, value1, arg5))
    : value2 === "fan"
      ? !["", "off", "unknown", "unavailable"].includes(value3)
      : value2 === "water_heater"
        ? climateIsPoweredOn(value1, "water-heater")
        : value2 === "media_player"
          ? ["playing", "buffering"].includes(value3)
          : ["on", "open", "true", "home"].includes(value3);
}
export function entityToggleCommand(arg8, arg9, arg10 = {}) {
  const value4 = s(arg9),
    value5 = String(arg8 || "").split(".", 1)[0];
  if (value5 === "button")
    return {
      domain: "button",
      service: "press",
      data: {},
    };
  if (value5 === "script")
    return {
      domain: "script",
      service: "turn_on",
      data: {},
    };
  if (value5 === "media_player")
    return {
      domain: "media_player",
      service: "media_play_pause",
      data: {},
    };
  if (["climate", "fan", "water_heater"].includes(value5)) {
    const value6 =
      value5 === "water_heater" ? "water-heater" : resolveClimateDeviceType(arg10, value4, arg8);
    return climatePowerCommand(arg8, value4, !entityPowerIsOn(arg8, value4, arg10), value6);
  }
  return {
    domain: "homeassistant",
    service: "toggle",
    data: {},
  };
}
export function optimisticToggleState(arg11, arg12, arg13 = {}) {
  const value7 = s(arg12),
    value8 = String(arg11 || "").split(".", 1)[0],
    value9 = entityPowerIsOn(arg11, value7, arg13);
  if (value8 === "media_player")
    return {
      ...value7,
      state: entityPowerIsOn(arg11, value7, arg13) ? "paused" : "playing",
    };
  if (value8 === "climate") {
    const object1 = {
      ...(value7.attributes || {}),
    };
    return (
      value9 || (delete object1.preset_mode, delete object1.mode),
      {
        ...value7,
        state: value9 ? "off" : "auto",
        attributes: object1,
      }
    );
  }
  return {
    ...value7,
    state: value9 ? "off" : "on",
  };
}
