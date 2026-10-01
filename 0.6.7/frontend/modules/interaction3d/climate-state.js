const w = await (import.meta.url.startsWith("file:")
    ? import(new URL("../../static/renderer/climate.js", import.meta.url))
    : import(
        new URL(
          "../../../../bridge-static/renderer/climate.js?v=20260908-climate-v1",
          import.meta.url,
        )
      )),
  b = await (import.meta.url.startsWith("file:")
    ? import(new URL("../../static/renderer/water-heater.js", import.meta.url))
    : import(
        new URL(
          "../../../../bridge-static/renderer/water-heater.js?v=20260925-water-heater-v1",
          import.meta.url,
        )
      ));
export const { createWaterHeaterFeedback, waterHeaterCapabilities } = b;
export function waterHeaterStatusLabel(arg1) {
  const value1 = b.waterHeaterCapabilities(arg1);
  if (!value1.available)
    return arg1?.state === "unavailable" || arg1?.available === false ? "设备不可用" : "状态未知";
  if (value1.away) return "离家模式";
  if (arg1.state === "off") return "已关闭";
  const value2 = w.climatePresentationMode(arg1, "water-heater");
  return value2 === "on"
    ? "已开启"
    : "当前模式 · " +
        (value2 === "high_demand" ? "高需求" : w.climateModeLabel(value2, "water-heater"));
}
const {
  normalizeClimateCapabilities: O,
  climateIsPoweredOn: M,
  climateIsRunning: $,
  climatePowerCommand: j,
} = w;
export const {
  climateModeLabel,
  climateModeIcon,
  climateSwingModeLabel,
  climateOptionPresentation,
} = w;
const d = (arg2) =>
  arg2 != null && arg2 !== "" && typeof arg2 != "boolean" && Number.isFinite(Number(arg2))
    ? Number(arg2)
    : null;
export function purifierSpeedLevels(arg3) {
  const value3 = d(arg3);
  if (value3 === null || value3 <= 0 || value3 > 100) return [];
  const value4 = Math.round(100 / value3);
  return value4 < 1 || value4 > 10 || Math.abs(value3 - 100 / value4) > 0.02
    ? []
    : Array.from(
        {
          length: value4,
        },
        (arg4, arg5) => ({
          label: value4 === 3 ? ["低档", "中档", "高档"][arg5] : arg5 + 1 + " 档",
          percentage: Math.floor((100 * (arg5 + 1)) / value4),
        }),
      );
}
export function climateState(arg6, arg7) {
  const value5 = arg7?.newState || arg7 || {},
    value6 = value5.attributes || {};
  if (/^water_heater\.[a-z0-9_]+$/.test(arg6)) {
    const value23 = b.waterHeaterCapabilities(value5),
      value24 = value23.available && M(value5, "water-heater");
    return {
      entityId: arg6,
      raw: value5,
      waterHeater: true,
      ...value23,
      available: value23.available,
      on: value24,
      running: false,
      name: value6.friendly_name || "热水器",
      mode: w.climatePresentationMode(value5, "water-heater"),
      visualMode: value24 ? "heat" : "off",
      temperatureUnit: value23.unit,
      rangeSupported: false,
      fanModes: [],
      swingModes: [],
      presetModes: [],
      turnOnSupported: value23.nativePower,
    };
  }
  if (/^fan\.[a-z0-9_]+$/.test(arg6)) {
    const value25 = value5.available !== false && ["on", "off"].includes(value5.state),
      value26 = d(value6.percentage),
      value27 = d(value6.supported_features) || 0,
      value28 = d(value6.supported_features) !== null,
      value29 = value28 ? !!(value27 & 1) : value26 !== null,
      value30 = !!(value27 & 2),
      value31 = !!(value27 & 4),
      value32 =
        (!value28 || value27 & 8) && Array.isArray(value6.preset_modes)
          ? [
              ...new Set(
                value6.preset_modes.filter((arg8) => typeof arg8 == "string" && arg8.trim()),
              ),
            ]
          : [];
    return {
      entityId: arg6,
      raw: value5,
      purifier: true,
      available: value25,
      on: value25 && value5.state === "on",
      running: value25 && value5.state === "on",
      name: value6.friendly_name || "空气净化器",
      mode: value5.state,
      visualMode: value5.state === "on" ? "other" : "off",
      temperature: null,
      currentTemperature: null,
      temperatureSupported: false,
      rangeSupported: false,
      percentage: value26,
      percentageSupported: value29,
      percentageStep: d(value6.percentage_step) || 1,
      speedLevels: value29 ? purifierSpeedLevels(value6.percentage_step) : [],
      modes: ["off", "on"],
      fanModes: [],
      swingModes: [],
      presetModes: value32,
      presetMode: value6.preset_mode || "",
      oscillating: value6.oscillating === true,
      oscillatingSupported: value30,
      direction: value6.direction || "",
      directionSupported: value31,
      turnOnSupported: true,
    };
  }
  const value7 = O(value5),
    value8 = typeof value5.state == "string" ? value5.state : "",
    value9 = d(value6.min_temp),
    value10 = d(value6.max_temp),
    value11 = d(value6.temperature),
    value12 = d(value6.supported_features) || 0,
    value13 = d(value6.target_temp_low),
    value14 = d(value6.target_temp_high),
    value15 = d(value6.supported_features) !== null,
    fn1 = (arg9, arg10) => (value15 ? !!(value12 & arg9) : arg10),
    value16 = value9 !== null && value10 !== null && value10 > value9,
    value17 = ["°C", "°F", "K"].includes(value6.temperature_unit) ? value6.temperature_unit : "°",
    value18 = d(value6.target_temp_step),
    value19 = value18 > 0 ? value18 : value17 === "°F" ? 1 : 0.5,
    value20 = value16 && fn1(1, value11 !== null),
    value21 = value16 && fn1(2, value13 !== null || value14 !== null),
    value22 =
      /^(climate|water_heater)\.[a-z0-9_]+$/.test(arg6) &&
      value5.available !== false &&
      !!value8 &&
      !["unknown", "unavailable"].includes(value8);
  return {
    entityId: arg6,
    raw: value5,
    available: value22,
    on: value22 && M(value5, "air-conditioner"),
    running:
      value22 &&
      !["unknown", "unavailable"].includes(
        String(value6.hvac_action || "")
          .trim()
          .toLowerCase(),
      ) &&
      $(value5, "air-conditioner"),
    name: String(value6.friendly_name || arg6 || "空调"),
    mode: value8,
    visualMode:
      !value22 || !M(value5, "air-conditioner")
        ? "off"
        : value8 === "cool"
          ? "cool"
          : value8 === "heat"
            ? "heat"
            : "other",
    temperature: value11,
    currentTemperature: d(value6.current_temperature),
    targetLow: value13,
    targetHigh: value14,
    minimum: value9,
    maximum: value10,
    step: value19,
    temperatureUnit: value17,
    temperatureSupported: value20,
    rangeSupported: value21,
    useTemperatureRange: value21 && (value8 === "heat_cool" || !value20),
    modes: value7.hvacModes,
    fanModes: fn1(8, true) ? value7.fanModes : [],
    turnOnSupported: !!(value12 & 256),
    turnOffSupported: !!(value12 & 128),
    canTurnOn: !!(value12 & 256) || value7.hvacModes.some((arg11) => arg11 !== "off"),
    canTurnOff: !!(value12 & 128) || value7.hvacModes.includes("off"),
    swingModes: fn1(32, true) ? value7.swingModes : [],
    horizontalSwingModes: fn1(512, true) ? value7.horizontalSwingModes : [],
    presetModes: fn1(16, true) ? value7.presetModes : [],
    fanMode: value6.fan_mode || "",
    swingMode: value6.swing_mode || "",
    horizontalSwingMode: value6.swing_horizontal_mode || "",
    presetMode: value6.preset_mode || "",
  };
}
export function climatePowerControl(arg12, arg13 = !arg12.on, arg14 = "") {
  if (!arg12.available) throw new Error("设备当前不可用。");
  if (arg12.waterHeater)
    return {
      entityId: arg12.entityId,
      ...b.waterHeaterPowerCommand(arg12.raw, arg13, arg14),
    };
  if (arg12.purifier)
    return {
      entityId: arg12.entityId,
      domain: "fan",
      service: arg13 ? "turn_on" : "turn_off",
      data: {},
    };
  if (!arg13 && arg12.turnOffSupported)
    return {
      entityId: arg12.entityId,
      domain: "climate",
      service: "turn_off",
      data: {},
    };
  if (arg13) {
    const value34 = arg14 || (arg12.on ? arg12.mode : "");
    if (value34 && value34 !== "off" && arg12.modes.includes(value34))
      return {
        entityId: arg12.entityId,
        domain: "climate",
        service: "set_hvac_mode",
        data: {
          hvac_mode: value34,
        },
      };
    if (arg12.turnOnSupported)
      return {
        entityId: arg12.entityId,
        domain: "climate",
        service: "turn_on",
        data: {},
      };
  }
  const value33 = j(arg12.entityId, arg12.raw, arg13, "air-conditioner", arg14);
  if (value33.domain !== "climate" || value33.service !== "set_hvac_mode")
    throw new Error("设备尚未提供可用的开关模式。");
  return {
    entityId: arg12.entityId,
    domain: "climate",
    service: value33.service,
    data: value33.data,
  };
}
export function createClimateModeHistory({ storage: arg15, scope: arg16 = "" } = {}) {
  const map1 = new Map();
  let value35 = true;
  const fn2 = (arg17) =>
      typeof arg17 == "string" &&
      !!arg17.trim() &&
      arg17.length <= 120 &&
      !/[{}\[\]\x00-\x1f]/.test(arg17) &&
      !["off", "unknown", "unavailable"].includes(arg17),
    fn3 = (arg18) =>
      arg16 && /^(climate|water_heater)\.[a-z0-9_]+$/.test(arg18)
        ? "ha-bridge:i3d-climate-mode:v1:" + arg16 + ":" + arg18
        : "";
  function fn4(arg19) {
    const value36 = fn3(arg19);
    try {
      const value37 = value35 && value36 && arg15?.getItem(value36);
      if (fn2(value37)) return (map1.set(arg19, value37), value37);
    } catch {
      value35 = false;
    }
    return map1.get(arg19) || "";
  }
  function fn5(arg20, arg21) {
    const value38 = climateState(arg20, arg21);
    if (
      !(
        !value38.available ||
        !value38.on ||
        !fn2(value38.mode) ||
        !value38.modes.includes(value38.mode)
      ) &&
      fn4(arg20) !== value38.mode
    ) {
      map1.set(arg20, value38.mode);
      try {
        const value39 = fn3(arg20);
        value35 && value39 && arg15?.setItem(value39, value38.mode);
      } catch {
        value35 = false;
      }
    }
  }
  return {
    get: fn4,
    observe: fn5,
  };
}
export function climateControl(arg22, arg23, arg24) {
  if (arg22.purifier) {
    if (!arg22.available) throw new Error("设备当前不可用。");
    if (
      arg23 === "set_percentage" &&
      arg22.percentageSupported &&
      Number.isFinite(Number(arg24)) &&
      Number(arg24) >= 0 &&
      Number(arg24) <= 100
    )
      return {
        entityId: arg22.entityId,
        domain: "fan",
        service: arg23,
        data: {
          percentage: Number(arg24),
        },
      };
    if (arg23 === "set_preset_mode" && arg22.presetModes.includes(arg24))
      return {
        entityId: arg22.entityId,
        domain: "fan",
        service: arg23,
        data: {
          preset_mode: arg24,
        },
      };
    if (arg23 === "oscillate" && arg22.oscillatingSupported && typeof arg24 == "boolean")
      return {
        entityId: arg22.entityId,
        domain: "fan",
        service: arg23,
        data: {
          oscillating: arg24,
        },
      };
    if (
      arg23 === "set_direction" &&
      arg22.directionSupported &&
      ["forward", "reverse"].includes(arg24)
    )
      return {
        entityId: arg22.entityId,
        domain: "fan",
        service: arg23,
        data: {
          direction: arg24,
        },
      };
    throw new Error("空气净化器不支持此操作。");
  }
  if (!arg22.available) throw new Error("设备当前不可用。");
  let value40;
  if (arg22.waterHeater && arg23 === "set_away_mode") {
    if (!arg22.awaySupported || typeof arg24 != "boolean") throw new Error("设备不支持离家模式。");
    return {
      entityId: arg22.entityId,
      domain: "water_heater",
      service: arg23,
      data: {
        away_mode: arg24,
      },
    };
  }
  if (arg23 === "set_temperature") {
    const value41 = arg24 !== null && typeof arg24 == "object";
    if (
      value41
        ? !arg22.rangeSupported ||
          Object.keys(arg24).sort().join(",") !== "target_temp_high,target_temp_low"
        : !arg22.temperatureSupported
    )
      throw new Error("设备尚未提供可用的温度控制。");
    const value42 = Math.min(
        8,
        Math.max(
          String(arg22.step).split(".")[1]?.length || 0,
          String(arg22.minimum).split(".")[1]?.length || 0,
        ),
      ),
      fn6 = (arg25) => {
        const value43 = d(arg25);
        if (value43 === null) throw new Error("设备尚未提供可用的温度控制。");
        const value44 = Math.floor((arg22.maximum - arg22.minimum) / arg22.step + 1e-8),
          value45 = Math.max(
            0,
            Math.min(value44, Math.round((value43 - arg22.minimum) / arg22.step)),
          );
        return Number((arg22.minimum + value45 * arg22.step).toFixed(value42));
      };
    if (
      ((value40 = value41
        ? {
            target_temp_low: fn6(arg24.target_temp_low),
            target_temp_high: fn6(arg24.target_temp_high),
          }
        : {
            temperature: fn6(arg24),
          }),
      value41 && value40.target_temp_low > value40.target_temp_high)
    )
      throw new Error("温区下限不能高于上限。");
  } else {
    const value46 = (
      arg22.waterHeater
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
    )[arg23];
    if (!value46 || !arg22[value46[0]].includes(arg24)) throw new Error("设备不支持此控制选项。");
    value40 = {
      [value46[1]]: arg24,
    };
  }
  return {
    entityId: arg22.entityId,
    domain: arg22.waterHeater ? "water_heater" : "climate",
    service: arg23,
    data: value40,
  };
}
