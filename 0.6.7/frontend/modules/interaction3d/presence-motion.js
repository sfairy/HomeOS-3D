export const PRESENCE_PAGES = [
  ["overview", "ALL（全部楼层）"],
  ["light", "灯光"],
  ["environment", "环境"],
  ["devices", "设备"],
  ["vacuum", "扫地机"],
  ["security", "安防"],
];
export function presenceVisibleOnPage(arg1, arg2) {
  const value1 = arg1.displayPages ?? ["overview", "light", "security"];
  return (
    PRESENCE_PAGES.some(([arg3]) => arg3 === arg2) &&
    (value1 === "all" || (Array.isArray(value1) && value1.includes(arg2)))
  );
}
export function validPresenceRoute(arg4) {
  if (
    !Array.isArray(arg4) ||
    arg4.length < 3 ||
    arg4.length > 128 ||
    arg4.some(
      (arg5) =>
        !arg5 ||
        !Number.isFinite(arg5.x) ||
        !Number.isFinite(arg5.y) ||
        Math.abs(arg5.x) > 1000000 ||
        Math.abs(arg5.y) > 1000000,
    )
  )
    return false;
  const value2 = arg4[0];
  return new Set(arg4.map((arg6) => arg6.x + "," + arg6.y)).size !== arg4.length
    ? false
    : arg4.slice(1, -1).some((arg7, arg8) => {
        const value3 = arg4[arg8 + 2];
        return (
          Math.abs(
            (arg7.x - value2.x) * (value3.y - value2.y) -
              (arg7.y - value2.y) * (value3.x - value2.x),
          ) > 0.000001
        );
      });
}
export function snapsToPresenceStart(arg9, arg10, arg11, arg12 = 16) {
  return (
    validPresenceRoute(arg9) &&
    !!arg10 &&
    Math.hypot(arg10.x - arg9[0].x, arg10.y - arg9[0].y) * Math.abs(arg11) <= arg12
  );
}
export function presenceIsActive(arg13) {
  const value4 = arg13?.newState || arg13;
  return value4?.available !== false && value4?.state === "on";
}
export const PRESENCE_TRIGGER_MODES = [
  ["auto", "自动识别"],
  ["threshold", "数值大于阈值"],
  ["equals", "变为指定值"],
  ["change", "状态值变化"],
];
export function presenceTriggerIsTimed(arg14) {
  return (
    ["equals", "change"].includes(arg14.triggerMode) ||
    ((!arg14.triggerMode || arg14.triggerMode === "auto") && arg14.entityId?.startsWith("event."))
  );
}
export function createPresenceTriggers(arg15 = () => Date.now()) {
  const map1 = new Map();
  return {
    sync(arg16, arg17) {
      const set1 = new Set(arg16.map((arg18) => arg18.id));
      for (const value5 of map1.keys()) set1.has(value5) || map1.delete(value5);
      for (const value6 of arg16) {
        const value7 = arg17[value6.entityId]?.newState || arg17[value6.entityId],
          value8 = typeof value7?.state == "string" ? value7.state.trim() : "",
          value9 =
            value7?.available !== false &&
            !!value8 &&
            !["unknown", "unavailable"].includes(value8.toLowerCase());
        let value10 = value6.triggerMode || "auto";
        if (value10 === "auto") {
          const value19 =
            /person_count|people_count|occupancy_count|human_count|人数|人员数量|人体数量/i.test(
              value6.entityId + " " + (value7?.attributes?.friendly_name || ""),
            );
          value10 = value6.entityId?.startsWith("event.")
            ? "event"
            : value19 && Number.isFinite(Number(value8))
              ? "threshold"
              : "state";
        }
        const value11 = JSON.stringify([
          value6.entityId,
          value6.triggerMode || "auto",
          value6.triggerValue ?? "on",
          value6.triggerThreshold ?? 0,
        ]);
        let value12 = map1.get(value6.id);
        value12?.key !== value11 && (value12 = null);
        const value13 = Date.parse(value7?.lastChanged || value7?.last_changed || ""),
          value14 = Number.isFinite(value13) ? Math.min(value13, arg15()) : null,
          value15 = ["equals", "change", "event"].includes(value10)
            ? value6.displayDuration > 0
              ? value6.displayDuration
              : 30
            : (value6.displayDuration ?? 0);
        if (value10 === "event") {
          const value20 = /^\d{4}-\d{2}-\d{2}T/.test(value8) ? Date.parse(value8) : NaN;
          map1.set(value6.id, {
            key: value11,
            on: value9 && Number.isFinite(value20),
            started: value20,
            duration: value15,
          });
          continue;
        }
        if (value10 === "equals" || value10 === "change") {
          const value21 = value9 && value12?.available && value8 !== value12.value,
            value22 = value14 === null || value12?.timestamp == null || value14 > value12.timestamp,
            value23 =
              value21 &&
              value22 &&
              (value10 === "change" || value8 === String(value6.triggerValue ?? "on").trim());
          map1.set(value6.id, {
            key: value11,
            value: value8,
            available: value9,
            timestamp: value14,
            duration: value15,
            on: value9 && (value23 || !!value12?.on),
            started: value23 ? (value14 ?? arg15()) : (value12?.started ?? arg15()),
          });
          continue;
        }
        const value16 =
            value9 &&
            (value10 === "threshold"
              ? Number.isFinite(Number(value8)) &&
                Number(value8) >
                  (value6.triggerMode === "threshold" ? (value6.triggerThreshold ?? 0) : 0)
              : presenceIsActive(value7)),
          value17 = value12?.value !== value8,
          value18 =
            !value12 || (value16 && (!value12.on || value17))
              ? (value14 ?? arg15())
              : value12.started;
        map1.set(value6.id, {
          key: value11,
          value: value8,
          on: value16,
          timestamp: value14,
          started: value18,
          duration: value15,
        });
      }
    },
    visible(arg19) {
      const value24 = map1.get(arg19);
      return (
        !!value24?.on &&
        arg15() >= value24.started &&
        (!value24.duration || arg15() - value24.started < value24.duration * 1000)
      );
    },
  };
}
export function closedPath(arg20) {
  const list1 = [];
  let value25 = 0;
  for (let value26 = 0; value26 < arg20.length; value26++) {
    const value27 = arg20[value26],
      value28 = arg20[(value26 + 1) % arg20.length],
      value29 = Math.hypot(value28.x - value27.x, value28.y - value27.y, value28.z - value27.z);
    value29 > 1e-8 &&
      (list1.push({
        a: value27,
        b: value28,
        start: value25,
        length: value29,
      }),
      (value25 += value29));
  }
  return {
    length: value25,
    segments: list1,
  };
}
export function sampleClosedPath(arg21, arg22) {
  if (!(arg21.length > 0)) return null;
  const value30 = ((arg22 % arg21.length) + arg21.length) % arg21.length,
    value31 =
      arg21.segments.find((arg23) => value30 < arg23.start + arg23.length) || arg21.segments.at(-1),
    value32 = (value30 - value31.start) / value31.length;
  return {
    x: value31.a.x + (value31.b.x - value31.a.x) * value32,
    y: value31.a.y + (value31.b.y - value31.a.y) * value32,
    z: value31.a.z + (value31.b.z - value31.a.z) * value32,
    heading: Math.atan2(value31.b.x - value31.a.x, value31.b.z - value31.a.z),
  };
}
