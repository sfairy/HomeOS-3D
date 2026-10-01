const p = (arg1) => (typeof arg1 == "number" && Number.isFinite(arg1) ? arg1 : null);
export function waterHeaterCapabilities(arg2) {
  const value1 = arg2?.attributes || {},
    value2 = Object.hasOwn(value1, "supported_features"),
    fn1 = (arg3, arg4 = false) =>
      value2
        ? Number.isInteger(value1.supported_features) &&
          value1.supported_features >= 0 &&
          !!(value1.supported_features & arg3)
        : arg4,
    list1 = [
      ...new Set(
        (Array.isArray(value1.operation_list) ? value1.operation_list : []).filter(
          (arg5) => typeof arg5 == "string" && arg5.trim() && arg5 !== "空",
        ),
      ),
    ],
    value3 = p(value1.min_temp),
    value4 = p(value1.max_temp),
    value5 = value1.target_temp_step == null ? 0.5 : p(value1.target_temp_step),
    value6 = fn1(2, list1.length > 0),
    value7 = fn1(8),
    value8 = list1.filter((arg6) => arg6 !== "off");
  return {
    available:
      !!arg2?.state && arg2.available !== false && !["unknown", "unavailable"].includes(arg2.state),
    temperature: p(value1.temperature),
    currentTemperature: p(value1.current_temperature),
    minimum: value3,
    maximum: value4,
    step: value5,
    unit: ["°C", "°F", "K"].includes(value1.temperature_unit)
      ? value1.temperature_unit
      : ["°C", "°F", "K"].includes(value1.unit_of_measurement)
        ? value1.unit_of_measurement
        : "°",
    temperatureSupported:
      fn1(1, p(value1.temperature) !== null) &&
      value3 !== null &&
      value4 !== null &&
      value3 < value4 &&
      value5 > 0,
    operationSupported: value6,
    modes: value6 ? list1 : [],
    nativePower: value7,
    canTurnOff: value7 || (value6 && list1.includes("off")),
    canTurnOn: value7 || (value6 && value8.length > 0),
    awaySupported: fn1(4),
    away: value1.away_mode === true || value1.away_mode === "on",
  };
}
export function waterHeaterPowerCommand(arg7, arg8, arg9 = "") {
  const value9 = waterHeaterCapabilities(arg7);
  if (!value9.available) throw new Error("热水器当前不可用。");
  if (value9.nativePower)
    return {
      domain: "water_heater",
      service: arg8 ? "turn_on" : "turn_off",
      data: {},
    };
  const value10 = value9.modes.filter((arg10) => arg10 !== "off"),
    value11 = arg8
      ? value10.includes(arg9)
        ? arg9
        : value10.length === 1
          ? value10[0]
          : ""
      : value9.modes.includes("off")
        ? "off"
        : "";
  if (!value11)
    throw new Error(
      arg8 && value10.length > 1 ? "请选择要开启的运行模式。" : "热水器未提供此开关能力。",
    );
  return {
    domain: "water_heater",
    service: "set_operation_mode",
    data: {
      operation_mode: value11,
    },
  };
}
export function waterHeaterCommandConfirmed(arg11, arg12) {
  const value12 = waterHeaterCapabilities(arg12);
  if (!value12.available) return false;
  const value13 = arg12.attributes?.operation_mode || arg12.state;
  switch (arg11.service) {
    case "turn_on":
      return arg12.state !== "off";
    case "turn_off":
      return arg12.state === "off";
    case "set_operation_mode":
      return value13 === arg11.data.operation_mode;
    case "set_away_mode":
      return (
        (arg12.attributes?.away_mode === "on" || arg12.attributes?.away_mode === true) ===
          arg11.data.away_mode && arg12.attributes?.away_mode != null
      );
    case "set_temperature":
      return (
        value12.temperature !== null &&
        Math.abs(value12.temperature - arg11.data.temperature) <=
          Math.max(0.001, (value12.step || 0.5) / 100)
      );
    default:
      return false;
  }
}
export function createWaterHeaterFeedback({
  onChange: arg13 = () => {},
  timeout: arg14 = 10000,
  schedule: arg15 = setTimeout,
  cancel: arg16 = clearTimeout,
} = {}) {
  const map1 = new Map();
  let value14 = false;
  const fn2 = (arg17) =>
      ["turn_on", "turn_off", "set_operation_mode"].includes(arg17.service)
        ? "mode"
        : arg17.service,
    fn3 = (arg18) => {
      value14 || arg13(arg18);
    },
    fn4 = (arg19) => {
      (arg16(arg19.timer), map1.get(arg19.key) === arg19 && map1.delete(arg19.key));
    };
  return {
    begin(arg20) {
      const value15 = fn2(arg20);
      map1.has(value15) && fn4(map1.get(value15));
      const object1 = {
        key: value15,
        command: arg20,
      };
      return (map1.set(value15, object1), fn3(""), object1);
    },
    sent(arg21) {
      value14 ||
        map1.get(arg21.key) !== arg21 ||
        (fn3(""),
        (arg21.timer = arg15(() => {
          value14 || map1.get(arg21.key) !== arg21 || (fn4(arg21), fn3("设备未响应，请重试"));
        }, arg14)),
        arg21.timer?.unref?.());
    },
    fail(arg22, arg23) {
      value14 ||
        map1.get(arg22.key) !== arg22 ||
        (fn4(arg22), fn3(arg23 || "设备控制失败，请重试"));
    },
    sync(arg24) {
      if (value14 || !map1.size) return;
      if (!waterHeaterCapabilities(arg24).available) {
        for (const value17 of map1.values()) arg16(value17.timer);
        (map1.clear(), fn3("设备已离线，操作结果未确认"));
        return;
      }
      let value16 = false;
      for (const value18 of [...map1.values()])
        waterHeaterCommandConfirmed(value18.command, arg24) && (fn4(value18), (value16 = true));
      value16 && fn3("");
    },
    dispose() {
      value14 = true;
      for (const value19 of map1.values()) arg16(value19.timer);
      map1.clear();
    },
  };
}
