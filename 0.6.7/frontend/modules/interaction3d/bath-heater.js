export const bathEffects = {
    fan: "运行出风",
    light: "照明",
  },
  bathRawState = (arg1, arg2) => {
    const v1 = arg1 instanceof Map ? arg1.get(arg2) : arg1?.[arg2];
    return v1?.newState || v1;
  };
const u = (arg3) =>
    String(arg3 ?? "")
      .trim()
      .toLowerCase(),
  c = (arg4) =>
    arg4 && arg4.available !== false && !["", "unknown", "unavailable"].includes(u(arg4.state)),
  v = (arg5) =>
    ["off", "idle", "standby", "unknown", "unavailable", "待机", "关闭", "停止"].includes(u(arg5)),
  y = (arg6) => ["light", "light_only", "lighting", "照明", "仅照明", "灯光"].includes(u(arg6)),
  w = (arg7) =>
    ["heat", "fan", "exhaust"].includes(arg7) ? "fan" : arg7 === "light" ? "light" : "";
export function bathHeaterState(arg8, v2 = {}) {
  const bathRawState2 = bathRawState(v2, arg8.entityId),
    list = arg8.bathEffects || [],
    set = new Set(),
    set2 = new Set(list.map((arg9) => w(arg9.effect))),
    c2 = c(bathRawState2) && !v(bathRawState2.state);
  let v3 = false;
  if (c(bathRawState2)) {
    v3 = true;
    const v4 = bathRawState2.attributes?.hvac_action,
      some = [bathRawState2.state, bathRawState2.attributes?.preset_mode, v4].some(y);
    c2 &&
      (some && !set2.has("light") && set.add("light"),
      !some && !v(v4) && !set2.has("fan") && set.add("fan"));
  }
  for (const v5 of list) {
    const bathRawState3 = bathRawState(v2, v5.entityId);
    if (!c(bathRawState3)) continue;
    const state = v5.attribute ? bathRawState3.attributes?.[v5.attribute] : bathRawState3.state;
    if (state == null || ["unknown", "unavailable"].includes(state)) continue;
    v3 = true;
    const w2 = w(v5.effect);
    String(state) === v5.value && w2 && set.add(w2);
  }
  const filter = (arg8.extraControls || [])
    .filter((arg10) => !["button", "input_button", "event"].includes(arg10.entityId.split(".")[0]))
    .map((arg11) => bathRawState(v2, arg11.entityId))
    .filter(c);
  v3 ||= filter.length > 0;
  const some2 = set.size > 0 || c2 || filter.some((arg12) => arg12.state === "on"),
    filter2 = Object.keys(bathEffects).filter((arg13) => set.has(arg13));
  return {
    available: v3,
    on: some2,
    active: filter2,
    running: set.has("fan"),
    visualMode: some2 ? "other" : "off",
    label: filter2.length
      ? filter2.map((arg14) => bathEffects[arg14]).join(" · ")
      : v3
        ? some2
          ? "已开启"
          : "已关闭"
        : "状态未知",
  };
}
