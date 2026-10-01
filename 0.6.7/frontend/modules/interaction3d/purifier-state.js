const f = (arg1, arg2) => {
  const v1 = arg1 instanceof Map ? arg1.get(arg2) : arg1?.[arg2];
  return v1?.newState || v1;
};
export function purifierState(arg3, v2 = {}) {
  const entityId = arg3.airflowEntityId || arg3.entityId,
    f2 = f(v2, entityId),
    f3 = f(v2, arg3.entityId),
    v3 = !!(f2 && f2.available !== false && ["on", "off"].includes(f2.state)),
    v4 = f3?.attributes?.percentage,
    finite =
      f3?.available !== false &&
      ["on", "off"].includes(f3?.state) &&
      (typeof v4 == "number" || (typeof v4 == "string" && v4.trim() !== "")) &&
      Number.isFinite(Number(v4)),
    max = finite ? Math.max(0, Math.min(1, Number(v4) / 100)) : 0.5,
    v5 = v3 && f2.state === "on" && (!!arg3.airflowEntityId || !finite || max > 0);
  return {
    available: v3,
    on: v3 && f2.state === "on",
    running: v5,
    strength: max,
    visualMode: v5 ? "other" : "off",
    label: entityId ? (v3 ? (v5 ? "净化中" : "已停止") : "状态未知") : "各功能独立控制",
  };
}
