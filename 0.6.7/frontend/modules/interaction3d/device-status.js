const f = {
    door: ["打开", "关闭"],
    garage_door: ["打开", "关闭"],
    window: ["打开", "关闭"],
    opening: ["打开", "关闭"],
    moisture: ["有漏水", "无漏水"],
    problem: ["有故障", "无故障"],
    safety: ["不安全", "安全"],
    smoke: ["有烟雾", "无烟雾"],
    gas: ["有气体", "无气体"],
    tamper: ["被拆动", "未拆动"],
    connectivity: ["在线", "离线"],
    plug: ["已插电", "未插电"],
    power: ["有电", "无电"],
    battery: ["电量低", "电量正常"],
    battery_charging: ["充电", "未充电"],
    lock: ["未锁定", "已锁定"],
    running: ["运行", "停止"],
    moving: ["移动", "静止"],
    occupancy: ["有人", "无人"],
    presence: ["有人", "无人"],
    motion: ["有移动", "无移动"],
    vibration: ["有振动", "无振动"],
    sound: ["有声音", "无声音"],
    light: ["有光", "无光"],
    heat: ["过热", "正常"],
    cold: ["过冷", "正常"],
    update: ["有更新", "无更新"],
  },
  p = {
    on: "开启",
    off: "关闭",
    open: "打开",
    closed: "关闭",
    online: "在线",
    offline: "离线",
    normal: "正常",
    fault: "故障",
    error: "错误",
  };
export function deviceStatusChoices(arg1 = {}, arg2) {
  const value1 = arg2?.newState || arg2,
    value2 = (arg1.entityId || arg1.entity_id || "").split(".")[0],
    object1 = {
      ...arg1.attributes,
      ...value1?.attributes,
    },
    value3 = object1.device_class || arg1.deviceClass || arg1.device_class;
  if (
    [
      "binary_sensor",
      "switch",
      "input_boolean",
      "light",
      "fan",
      "remote",
      "siren",
      "humidifier",
    ].includes(value2)
  ) {
    const value5 = value2 === "binary_sensor" ? f[value3] || ["开启", "关闭"] : ["开启", "关闭"];
    return {
      options: ["on", "off"].map((arg3, arg4) => ({
        value: arg3,
        label: value5[arg4],
      })),
      reminderValue:
        value2 === "binary_sensor" && ["connectivity", "plug", "power"].includes(value3)
          ? "off"
          : "on",
    };
  }
  const value4 = object1.options;
  return !Array.isArray(value4) ||
    value4.length !== 2 ||
    new Set(value4).size !== 2 ||
    value4.some(
      (arg5) =>
        typeof arg5 != "string" || !arg5.trim() || ["unknown", "unavailable"].includes(arg5),
    )
    ? null
    : {
        options: value4.map((arg6) => ({
          value: arg6,
          label: p[arg6] || arg6,
        })),
        reminderValue: value4[0],
      };
}
export function defaultDeviceStatusRule(arg7, arg8, arg9) {
  const value6 = deviceStatusChoices(arg7, arg8);
  if (!value6) return null;
  const value7 = arg9 === "health" ? value6.reminderValue : value6.options[0].value;
  return {
    entityId: arg7.entityId,
    active: value7,
    inactive: value6.options.find((arg10) => arg10.value !== value7).value,
  };
}
export function deviceStatus(arg11, arg12 = {}) {
  const value8 = arg11?.statusRules,
    value9 = Array.isArray(value8?.health) ? value8.health : value8?.health ? [value8.health] : [];
  if (!value8?.power?.entityId && !value9.some((arg13) => arg13?.entityId))
    return {
      visible: false,
      available: true,
      on: false,
      status: "none",
    };
  const fn1 = (arg14) => {
      if (!arg14?.entityId) return null;
      const value13 = arg12 instanceof Map ? arg12.get(arg14.entityId) : arg12[arg14.entityId],
        value14 = value13?.newState || value13,
        value15 = String(value14?.state ?? "");
      return !value14 ||
        value14.available === false ||
        ["", "unknown", "unavailable"].includes(value15)
        ? "unknown"
        : value15 === arg14.active
          ? "active"
          : value15 === arg14.inactive
            ? "inactive"
            : "unknown";
    },
    value10 = value9.map(fn1),
    value11 = fn1(value8.power),
    value12 = value10.includes("active")
      ? "warning"
      : value10.includes("unknown") || value11 === "unknown"
        ? "unknown"
        : value11 === "inactive"
          ? "off"
          : "normal";
  return {
    visible: true,
    available: value12 !== "unknown",
    on: value12 === "normal",
    status: value12,
    color: {
      normal: "#43ce82",
      warning: "#efa33d",
      unknown: "#89929b",
      off: "#89929b",
    }[value12],
  };
}
export function deviceEntityIds(arg15) {
  const value16 = Array.isArray(arg15?.statusRules?.health)
    ? arg15.statusRules.health
    : [arg15?.statusRules?.health];
  return [
    ...new Set(
      [
        ...(arg15?.extraControls || []).map((arg16) => arg16.entityId),
        arg15?.statusRules?.power?.entityId,
        ...value16.map((arg17) => arg17?.entityId),
      ].filter(Boolean),
    ),
  ];
}
