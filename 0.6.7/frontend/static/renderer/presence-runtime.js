function h(arg1) {
  return arg1?.newState || arg1 || null;
}
function M(arg2 = {}) {
  return (
    (arg2.entityId || "") +
    " " +
    (arg2.name || "") +
    " " +
    (arg2.originalName || "") +
    " " +
    (arg2.translationKey || "")
  ).trim();
}
function y(arg3, arg4 = "s") {
  const value1 = h(arg3) || {},
    value2 = Number(value1.state);
  if (!Number.isFinite(value2) || value2 < 0) return null;
  const value3 = String(value1.attributes?.unit_of_measurement || arg4)
    .trim()
    .toLowerCase();
  return ["min", "minute", "minutes", "分钟"].includes(value3)
    ? value2 * 60
    : ["h", "hr", "hour", "hours", "小时"].includes(value3)
      ? value2 * 3600
      : value2;
}
function k(arg5, arg6) {
  const value4 = arg5?.get?.(arg6);
  if (!value4?.deviceId)
    return {
      timeout: null,
      noMotion: null,
    };
  const value5 = [...arg5.values()].filter(
      (arg7) =>
        arg7.deviceId === value4.deviceId &&
        arg7.domain === "sensor" &&
        arg7.status !== "missing" &&
        !arg7.disabledBy,
    ),
    value6 =
      value5.find((arg8) =>
        /custom[_ -]?no[_ -]?motion[_ -]?time|no[_ -]?motion[_ -]?timeout|自定义超时无人移动时间/i.test(
          M(arg8),
        ),
      ) || null,
    value7 =
      value5.find((arg9) => /no[_ -]?motion[_ -]?duration|无移动状态持续时间/i.test(M(arg9))) ||
      null;
  return {
    timeout: value6,
    noMotion: value7,
  };
}
export function presenceMotionEventConfig(
  arg10,
  arg11 = null,
  arg12 = new Map(),
  arg13 = new Map(),
  arg14 = {},
) {
  const value8 = arg12?.get?.(arg10) || {},
    value9 = h(arg11) || {},
    value10 =
      M({
        ...value8,
        entityId: arg10,
      }) +
      " " +
      (value9.attributes?.device_class || "") +
      " " +
      (value9.attributes?.event_type || "");
  if (!(
    String(arg10 || "").startsWith("event.") &&
    /motion|occupancy|presence|pir|moving|移动|运动|人体|有人/i.test(value10)
  ))
    return {
      entityId: arg10,
      motionEvent: false,
      motionTimeoutSeconds: null,
      noMotionSeconds: null,
      noMotionStateTimestamp: null,
      companionEntityIds: [],
    };
  const value11 = k(arg12, arg10),
    value12 = Number(arg14.motionTimeoutSeconds),
    value13 = value11.timeout?.entityId ? arg13?.get?.(value11.timeout.entityId) : null,
    value14 = y(value13, "min"),
    value15 = Math.max(
      1,
      Math.min(
        3600,
        Number.isFinite(value14) && value14 > 0
          ? value14
          : Number.isFinite(value12) && value12 > 0
            ? value12
            : 60,
      ),
    ),
    value16 = value11.noMotion?.entityId ? arg13?.get?.(value11.noMotion.entityId) : null;
  return {
    entityId: arg10,
    motionEvent: true,
    motionTimeoutSeconds: value15,
    noMotionSeconds: y(value16),
    noMotionStateTimestamp: presenceStateTimestamp(value16),
    companionEntityIds: [value11.timeout?.entityId, value11.noMotion?.entityId].filter(Boolean),
  };
}
export function presenceSensorPresentation(arg15, arg16 = "auto", arg17 = {}) {
  if (arg16 === "on")
    return {
      key: "occupied",
      label: "有人",
      active: true,
      available: true,
    };
  if (arg16 === "off")
    return {
      key: "clear",
      label: "无人",
      active: false,
      available: true,
    };
  const value17 = h(arg15);
  if (!value17)
    return {
      key: "unknown",
      label: "未知",
      active: false,
      available: false,
    };
  const value18 = String(value17.state ?? "")
    .trim()
    .toLowerCase();
  if (value18 === "unavailable")
    return {
      key: "unavailable",
      label: "离线",
      active: false,
      available: false,
    };
  if (!value18 || value18 === "unknown" || value18 === "none" || value18 === "null")
    return {
      key: "unknown",
      label: "未知",
      active: false,
      available: false,
    };
  if (arg17.motionEvent || String(arg17.entityId || "").startsWith("event.")) {
    const value20 = String(value17.attributes?.event_type || "")
      .trim()
      .toLowerCase();
    if (
      /no[_ -]?motion|motion[_ -]?(?:clear|ended)|clear|inactive|vacant|absent|not[_ -]?detected|无人|无移动|未检测到(?:移动|人体)/i.test(
        value20,
      )
    )
      return {
        key: "clear",
        label: "无人",
        active: false,
        available: true,
      };
    const value21 = presenceStateTimestamp(value17),
      value22 = Number.isFinite(Number(arg17.now)) ? Number(arg17.now) : Date.now(),
      value23 = Math.max(1, Number(arg17.motionTimeoutSeconds) || 60),
      value24 = Number.isFinite(value21) ? value22 - value21 : null,
      value25 = Number(arg17.noMotionSeconds),
      value26 = Number(arg17.noMotionStateTimestamp),
      value27 =
        Number.isFinite(value25) &&
        (!Number.isFinite(value21) || !Number.isFinite(value26) || value26 >= value21);
    return (value20 ? !value27 || value25 < value23 : Number.isFinite(value21)) &&
      (value24 === null || (value24 >= 0 && value24 <= value23 * 1000))
      ? {
          key: "occupied",
          label: "有人",
          active: true,
          available: true,
        }
      : {
          key: "clear",
          label: "无人",
          active: false,
          available: true,
        };
  }
  if (["on", "home", "true", "present", "presence", "occupied", "detected"].includes(value18))
    return {
      key: "occupied",
      label: "有人",
      active: true,
      available: true,
    };
  if (["off", "not_home", "false", "absent", "away", "clear", "empty", "vacant"].includes(value18))
    return {
      key: "clear",
      label: "无人",
      active: false,
      available: true,
    };
  const value19 = Number(value18);
  return Number.isFinite(value19)
    ? value19 > 0
      ? {
          key: "occupied",
          label: "有人",
          active: true,
          available: true,
        }
      : {
          key: "clear",
          label: "无人",
          active: false,
          available: true,
        }
    : {
        key: "unknown",
        label: "未知",
        active: false,
        available: false,
      };
}
export function presenceStateTimestamp(arg18) {
  const value28 = h(arg18) || {},
    value29 =
      value28.lastChanged ||
      value28.last_changed ||
      value28.updatedAt ||
      value28.lastUpdated ||
      value28.last_updated ||
      value28.state ||
      "",
    value30 = Date.parse(value29);
  return Number.isFinite(value30) ? value30 : null;
}
export function presenceAnimationPhase(arg19, arg20 = {}, arg21 = Date.now()) {
  const value31 = presenceStateTimestamp(arg19),
    value32 = Number.isFinite(value31) ? Math.max(0, Number(arg21) - value31) : 0,
    fn1 = (arg22, arg23) => {
      const value33 = Math.max(0.001, Number(arg22) || arg23) * 1000,
        value34 = Math.round(value32 % value33);
      return value34 > 0 ? "-" + value34 + "ms" : "0ms";
    };
  return {
    orbitDelay: fn1(arg20.orbit, 8),
    waveDelay: fn1(arg20.wave, 2.62),
    floorDelay: fn1(arg20.floor, 2.8),
    stepDelay: fn1(arg20.step, 0.72),
  };
}
export function formatPresenceDuration(arg24, arg25 = Date.now()) {
  const value35 = Number(arg24);
  if (!Number.isFinite(value35)) return "--";
  const value36 = Math.max(0, Math.floor((Number(arg25) - value35) / 1000));
  if (value36 < 60) return "刚刚";
  const value37 = Math.floor(value36 / 60);
  if (value37 < 60) return value37 + " 分钟";
  const value38 = Math.floor(value37 / 60);
  if (value38 < 24) {
    const value41 = value37 % 60;
    return value41 ? value38 + " 小时 " + value41 + " 分钟" : value38 + " 小时";
  }
  const value39 = Math.floor(value38 / 24),
    value40 = value38 % 24;
  return value40 ? value39 + " 天 " + value40 + " 小时" : value39 + " 天";
}
export function presenceHistoryBuckets(
  arg26 = [],
  arg27 = null,
  arg28 = Date.now(),
  arg29 = 24,
  arg30 = 48,
  arg31 = {},
) {
  const value42 = Number(arg28),
    value43 = Math.max(1, Number(arg29) || 24) * 60 * 60 * 1000,
    value44 = value42 - value43,
    value45 = (Array.isArray(arg26) ? arg26 : [])
      .map((arg32) => ({
        timestamp: Date.parse(arg32?.timestamp),
        state: {
          state: arg32?.value,
          lastChanged: arg32?.timestamp,
        },
      }))
      .filter((arg33) => Number.isFinite(arg33.timestamp))
      .sort((arg34, arg35) => arg34.timestamp - arg35.timestamp),
    value46 = presenceStateTimestamp(arg27);
  (arg27 &&
    Number.isFinite(value46) &&
    value45.push({
      timestamp: value46,
      state: h(arg27),
    }),
    value45.sort((arg36, arg37) => arg36.timestamp - arg37.timestamp));
  const list1 = [],
    value47 = Math.max(1, Math.min(288, Math.round(Number(arg30) || 48)));
  let value48 = 0,
    value49 = null;
  for (let value50 = 0; value50 < value47; value50 += 1) {
    const value51 = value44 + (value43 * (value50 + 1)) / value47;
    for (; value48 < value45.length && value45[value48].timestamp <= value51;)
      ((value49 = value45[value48]), (value48 += 1));
    const value52 = value49 || value45[value48] || null;
    list1.push(
      presenceSensorPresentation(value52?.state, "auto", {
        ...arg31,
        now: value51,
        noMotionSeconds: null,
        noMotionStateTimestamp: null,
      }).key,
    );
  }
  return (
    arg27 &&
      list1.length &&
      (list1[list1.length - 1] = presenceSensorPresentation(arg27, "auto", {
        ...arg31,
        now: value42,
      }).key),
    list1
  );
}
