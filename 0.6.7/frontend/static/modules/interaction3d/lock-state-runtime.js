export const LOCK_ENTITY_FIELDS = [
  "entityId",
  "doorEntityId",
  "batteryEntityId",
  "lowBatteryEntityId",
  "tamperEntityId",
];
const x = (arg1) => arg1?.newState || arg1,
  u = (arg2) =>
    arg2 &&
    arg2.available !== false &&
    !["", "unknown", "unavailable"].includes(String(arg2.state ?? "")),
  f = (arg3) =>
    typeof arg3 == "string"
      ? arg3
          .trim()
          .toLowerCase()
          .replace(/[\s_-]+/g, " ")
      : "",
  E = new Set(["contact", "接触", "接觸"]),
  I = new Set(["no contact", "分离", "分離"]);
function m(arg4) {
  if (!u(arg4)) return null;
  const value1 = f(arg4.state);
  return I.has(value1) || ["on", "open", "opened", "打开", "已打开", "开启"].includes(value1)
    ? true
    : E.has(value1) || ["off", "closed", "close", "关闭", "已关闭"].includes(value1)
      ? false
      : null;
}
function O(arg5, arg6) {
  const value2 = arg5.attributes?.options;
  return (
    arg6 === "enum" &&
    Array.isArray(value2) &&
    value2.length === 2 &&
    value2.some((arg7) => I.has(f(arg7))) &&
    value2.some((arg8) => E.has(f(arg8)))
  );
}
function S(arg9) {
  return (
    arg9.platform === "xiaomi_home" &&
    /_contact_state_p_\d+_\d+$/.test(arg9.uniqueId || arg9.unique_id || "")
  );
}
const h = (arg10) => {
  const value3 = arg10?.attributes || {},
    value4 = value3.event_data || value3.eventData || {};
  return [
    arg10?.state,
    value3.event_type,
    value3.event,
    value3.action,
    value4.event_type,
    value4.event,
    value4.action,
  ]
    .filter((arg11) => arg11 != null)
    .join(" ")
    .trim()
    .toLowerCase();
};
export function doorOpenState(arg12) {
  if (!u(arg12)) return null;
  const value5 = m(arg12);
  if (value5 !== null) return value5;
  const value6 = h(arg12);
  return /(^|[\s_.-])(open|opened|opening|door_open|opened_door|开门|打开|开启)(?=$|[\s_.-])/.test(
    value6,
  )
    ? true
    : /(^|[\s_.-])(close|closed|closing|door_close|closed_door|关门|关闭)(?=$|[\s_.-])/.test(value6)
      ? false
      : null;
}
export function lockEntityRole(arg13, arg14) {
  if (
    arg13.disabledBy != null ||
    arg13.disabled_by != null ||
    arg13.enabled === false ||
    ["missing", "disabled"].includes(arg13.status)
  )
    return false;
  const value7 = arg13.entityId || arg13.entity_id || "",
    value8 = value7.split(".")[0],
    value9 = arg13.deviceClass || arg13.device_class || arg13.attributes?.device_class;
  return arg14 === "entityId"
    ? value8 === "lock"
    : arg14 === "doorEntityId"
      ? (value8 === "binary_sensor" && ["door", "opening"].includes(value9)) ||
        (value8 === "sensor" && O(arg13, value9)) ||
        (["sensor", "binary_sensor"].includes(value8) && S(arg13))
      : arg14 === "batteryEntityId"
        ? value8 === "sensor" && value9 === "battery"
        : arg14 === "lowBatteryEntityId"
          ? value8 === "binary_sensor" && value9 === "battery"
          : arg14 === "tamperEntityId"
            ? value8 === "binary_sensor" && value9 === "tamper"
            : false;
}
export function identifyLockEntities(arg15) {
  return Object.fromEntries(
    LOCK_ENTITY_FIELDS.map((arg16) => {
      const value10 = arg15.filter((arg17) => lockEntityRole(arg17, arg16));
      return [arg16, value10.length === 1 ? value10[0].entityId || value10[0].entity_id : ""];
    }),
  );
}
export function doorEventState(arg18, arg19) {
  const fn1 = (arg20) => {
    const value15 = arg19(arg20);
    if (!arg20?.startsWith("event.") || !u(value15)) return null;
    const value16 = /^\d{4}-\d{2}-\d{2}T/.test(String(value15.state))
      ? Date.parse(value15.state)
      : NaN;
    return Number.isFinite(value16) ? value16 : null;
  };
  if (arg18.doorSource === "dual-event") {
    if (
      !arg18.doorOpenEntityId ||
      !arg18.doorCloseEntityId ||
      arg18.doorOpenEntityId === arg18.doorCloseEntityId
    )
      return null;
    const value17 = fn1(arg18.doorOpenEntityId),
      value18 = fn1(arg18.doorCloseEntityId);
    return value17 === value18 ||
      [arg19(arg18.doorOpenEntityId), arg19(arg18.doorCloseEntityId)].some(
        (arg21) => !arg21 || arg21.available === false || arg21.state === "unavailable",
      )
      ? null
      : value17 === null
        ? false
        : value18 === null
          ? true
          : value17 > value18;
  }
  if (fn1(arg18.doorEventEntityId) === null) return null;
  const value11 = arg19(arg18.doorEventEntityId),
    value12 = String(value11.attributes?.[arg18.doorEventAttribute || "event_type"] ?? "").trim(),
    value13 = (arg18.doorOpenValue || "").trim(),
    value14 = (arg18.doorCloseValue || "").trim();
  return !value13 || !value14 || value13 === value14
    ? null
    : value12 === value13
      ? true
      : value12 === value14
        ? false
        : null;
}
export function lockState(arg22, arg23 = {}) {
  const fn2 = (arg24) => x(arg23 instanceof Map ? arg23.get(arg24) : arg23[arg24]),
    value19 = fn2(arg22.entityId),
    value20 = fn2(arg22.doorEntityId),
    value21 = fn2(arg22.batteryEntityId),
    value22 = ["single-event", "dual-event"].includes(arg22.doorSource),
    value23 = value22 ? doorEventState(arg22, fn2) : null,
    value24 = !!(u(value19) || (value22 ? value23 !== null : u(value20)) || u(value21)),
    value25 = u(value19) ? value19.state : "unavailable",
    object1 = {
      locked: "已上锁",
      unlocked: "已解锁",
      locking: "正在上锁",
      unlocking: "正在解锁",
      open: "锁舌已释放",
      opening: "正在释放锁舌",
      jammed: "门锁卡住",
      unavailable: "门锁状态不可用",
    },
    value26 = value22 ? value23 : m(value20),
    fn3 = (arg25) => {
      const value28 = fn2(arg25);
      return u(value28) && value28.state === "on";
    },
    value27 = value19
      ? object1[value25] || "门锁状态未知"
      : value26 === true
        ? "门已打开"
        : value26 === false
          ? "门已关闭"
          : arg22.doorEntityId
            ? "门状态未知"
            : "仅电量";
  return {
    state: value25,
    available: value24,
    label: value27,
    doorOpen: value26,
    doorLabel: arg22.doorEntityId
      ? value26 === null
        ? "门状态未知"
        : value26
          ? "门已打开"
          : "门已关闭"
      : "未绑定门磁",
    busy: ["locking", "unlocking", "opening"].includes(value25),
    canOpen: !!u(value19) && ((Number(value19?.attributes?.supported_features) || 0) & 1) !== 0,
    codeRequired: !!value19?.attributes?.code_format,
    battery: u(value21)
      ? "" + value21.state + (value21.attributes?.unit_of_measurement || "%")
      : "—",
    lowBattery: fn3(arg22.lowBatteryEntityId),
    tamper: fn3(arg22.tamperEntityId),
  };
}
const c = {
  entry: "入户门",
  solid: "木门",
  double: "双开门",
  glass: "玻璃门",
  "sliding-glass": "推拉门",
  "roller-shutter": "卷帘门",
  "frame-only": "门框",
};
export function doorModels(arg26) {
  return (arg26?.scene?.doors?.length ? arg26.scene.doors : arg26?.doors || []).flatMap(
    (arg27, arg28) => {
      const value29 =
        arg27?.modelId || (String(arg27?.id || "").startsWith("door:") ? arg27.id : "");
      if (value29 && !arg27?.wallId) {
        const value33 = c[arg27.doorType] ? arg27.doorType : "solid";
        return [
          {
            ...arg27,
            modelId: value29,
            name: arg27.name || c[value33] + " " + (arg28 + 1),
            doorType: value33,
            doorLabel: arg27.doorLabel || c[value33],
          },
        ];
      }
      const value30 = (arg26.scene?.walls || []).find((arg29) => arg29.id === arg27.wallId);
      if (!value30) return [];
      const value31 = Math.max(0, Math.min(1, Number(arg27.t) || 0)),
        value32 = c[arg27.doorType] ? arg27.doorType : "solid";
      return [
        {
          ...arg27,
          modelId: "door:" + arg27.id,
          name: arg27.name || c[value32] + " " + (arg28 + 1),
          doorLabel: c[value32],
          x: value30.start.x + (value30.end.x - value30.start.x) * value31,
          y: value30.start.y + (value30.end.y - value30.start.y) * value31,
        },
      ];
    },
  );
}
export const entryDoorModels = doorModels;
