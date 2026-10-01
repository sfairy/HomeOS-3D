const g = (arg1, arg2) => {
    const value1 = arg1?.get?.(arg2) ?? arg1?.[arg2];
    return value1?.newState ?? value1;
  },
  b = (arg3) =>
    arg3 &&
    arg3.available !== false &&
    arg3.state != null &&
    !["", "unknown", "unavailable", "none", "null"].includes(
      String(arg3.state).trim().toLowerCase(),
    );
export function carChargingMappingError(arg4) {
  const list1 = [arg4?.inactive, arg4?.active];
  return list1.some((arg5) => typeof arg5 != "string" || !arg5.trim())
    ? "自定义时，请同时填写不充电和充电的原始状态值；两项都留空可恢复自动识别。"
    : list1.some((arg6) => arg6.length > 120 || /[\r\n]/.test(arg6))
      ? "每个输入框只填一个原始状态值，不超过 120 个字符。"
      : list1.some((arg7) =>
            ["unknown", "unavailable", "none", "null"].includes(arg7.trim().toLowerCase()),
          )
        ? "unknown、unavailable、none、null 表示未知或不可用，不能用作充电或不充电的状态值。"
        : arg4.active.trim() === arg4.inactive.trim()
          ? "充电和不充电的状态值不能相同。"
          : "";
}
const y = {
  charging: "充电中",
  not_charging: "未充电",
  disconnected: "未连接",
  stopped: "已停止",
  complete: "充电完成",
  completed: "充电完成",
  paused: "充电暂停",
  idle: "空闲",
};
export function carState(arg8, arg9 = {}) {
  const value2 = g(arg9, arg8.batteryEntityId),
    value3 = g(arg9, arg8.chargingEntityId),
    value4 =
      b(value2) && /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(value2.state).trim())
        ? Number(value2.state)
        : NaN,
    value5 = value2?.attributes?.unit_of_measurement,
    value6 = Number.isFinite(value4) && value4 >= 0 && value4 <= 100 && (!value5 || value5 === "%"),
    value7 = arg8.chargingStates,
    value8 = b(value3) ? String(value3.state).trim() : "",
    value9 = arg8.chargingEntityId?.startsWith("binary_sensor."),
    value10 = value8.toLowerCase(),
    value11 = value8
      ? value7
        ? carChargingMappingError(value7)
          ? null
          : value8 === value7.active.trim()
            ? true
            : value8 === value7.inactive.trim()
              ? false
              : null
        : value9
          ? value10 === "on"
            ? true
            : value10 === "off"
              ? false
              : null
          : ["charging", "充电中", "正在充电"].includes(value10)
            ? true
            : [
                  "not_charging",
                  "disconnected",
                  "stopped",
                  "complete",
                  "completed",
                  "paused",
                  "idle",
                  "未充电",
                  "充电完成",
                  "未连接",
                  "充电暂停",
                ].includes(value10)
              ? false
              : null
      : null,
    value12 =
      value3?.available === false || String(value3?.state).trim().toLowerCase() === "unavailable",
    value13 = value8
      ? value9 && value11 !== null
        ? value11
          ? "充电中"
          : "未充电"
        : !value7 && Object.hasOwn(y, value10)
          ? y[value10]
          : value8
      : value12
        ? "充电状态不可用"
        : "充电状态未知";
  return {
    battery: value6 ? value4 : null,
    batteryAvailable: value6,
    charging: value11,
    chargingRaw: value8,
    available: value6 || !!value8,
    on: value11 === true,
    batteryText: value6 ? Math.round(value4 * 10) / 10 + "%" : "—",
    status: value13,
  };
}
export function standardCarBindings(arg10 = []) {
  const fn1 = (arg11, arg12) => {
    const value14 = arg10.filter(
      (arg13) =>
        arg13.entityId?.startsWith(arg11 + ".") &&
        arg13.attributes?.device_class === arg12 &&
        arg13.enabled !== false &&
        !arg13.disabledBy &&
        !arg13.disabled_by &&
        !["missing", "disabled"].includes(arg13.status),
    );
    return value14.length === 1 ? value14[0].entityId : "";
  };
  return {
    batteryEntityId: fn1("sensor", "battery"),
    chargingEntityId: fn1("binary_sensor", "battery_charging"),
  };
}
