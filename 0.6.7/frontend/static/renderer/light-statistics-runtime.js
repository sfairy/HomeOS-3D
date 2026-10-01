const S = new Set(["light", "switch", "input_boolean", "fan", "humidifier", "siren"]),
  p = new Set(["climate", "water_heater"]);
function f(arg1) {
  const value1 = typeof arg1 == "string" ? arg1 : String(arg1?.entityId || arg1?.entity_id || "");
  return (
    String(typeof arg1 == "string" ? "" : arg1?.domain || "")
      .trim()
      .toLowerCase() || value1.split(".", 1)[0].toLowerCase()
  );
}
function g(arg2) {
  const value2 = typeof arg2 == "string" ? arg2 : String(arg2?.entityId || arg2?.entity_id || "");
  return (
    f(arg2) === "sensor" &&
    /(?:^|_)bt_online_status(?:_p_\d+_\d+)?(?:_\d+)?$/i.test(value2.split(".").slice(1).join("."))
  );
}
export function lightStatisticsEntitySupport(arg3) {
  const value3 = f(arg3);
  return value3 === "virtual" || arg3?.virtual
    ? {
        supported: true,
        message: "虚拟实体按当前显示状态统计。",
      }
    : value3 === "group"
      ? {
          supported: true,
          message: "群组将作为 1 个实体统计。",
        }
      : S.has(value3)
        ? {
            supported: true,
            message: "按开启/关闭状态统计。",
          }
        : p.has(value3)
          ? {
              supported: true,
              message: "按关闭/运行状态统计。",
            }
          : g(arg3)
            ? {
                supported: true,
                message: "按在线/离线状态统计，在线计入数量。",
              }
            : {
                supported: false,
                message: "该实体没有明确的开启/关闭状态。",
              };
}
export function lightStatisticsEntityStateStatus(arg4, arg5) {
  if (!lightStatisticsEntitySupport(arg4).supported) return "abnormal";
  const value4 = f(arg4),
    value5 = String(arg5?.state ?? arg5 ?? "")
      .trim()
      .toLowerCase();
  if (!value5 || ["unknown", "unavailable"].includes(value5)) return "abnormal";
  if (g(arg4)) {
    const value6 = value5.replace(/^设备\s*\d+\s*-\s*/, "");
    return ["在线", "online", "on"].includes(value6)
      ? "on"
      : ["离线", "offline", "off"].includes(value6)
        ? "off"
        : "abnormal";
  }
  return value5 === "off" ? "off" : value5 === "on" || p.has(value4) ? "on" : "abnormal";
}
function h(arg6, arg7) {
  return typeof arg6?.get == "function"
    ? arg6.get(arg7) || null
    : (arg6 && typeof arg6 == "object" && arg6[arg7]) || null;
}
function d(arg8, arg9) {
  const value7 = typeof arg8?.get == "function" ? arg8.get(arg9) : arg8?.[arg9];
  return value7 &&
    typeof value7 == "object" &&
    Object.prototype.hasOwnProperty.call(value7, "newState")
    ? value7.newState || null
    : value7 || null;
}
export function lightStatisticsSummary(arg10, arg11 = new Map(), arg12 = new Map()) {
  const list1 = [],
    set1 = new Set();
  for (const value9 of Array.isArray(arg10) ? arg10 : []) {
    const value10 = String(value9 || "").trim();
    !value10 || set1.has(value10) || (set1.add(value10), list1.push(value10));
  }
  const value8 = list1.map((arg13) => {
    const value11 = h(arg12, arg13) || {},
      value12 = d(arg11, arg13),
      value13 = String(value12?.state || "")
        .trim()
        .toLowerCase(),
      value14 = lightStatisticsEntitySupport({
        ...value11,
        entityId: arg13,
      }),
      value15 = lightStatisticsEntityStateStatus(
        {
          ...value11,
          entityId: arg13,
        },
        value12,
      );
    return {
      entityId: arg13,
      label: String(
        value12?.attributes?.friendly_name || value11.name || value11.originalName || arg13,
      ),
      state: value13,
      status: value15,
      message: value15 === "abnormal" && value14.supported ? "当前状态无法判断" : value14.message,
    };
  });
  return {
    total: value8.length,
    on: value8.filter((arg14) => arg14.status === "on").length,
    off: value8.filter((arg15) => arg15.status === "off").length,
    abnormal: value8.filter((arg16) => arg16.status === "abnormal").length,
    items: value8,
  };
}
