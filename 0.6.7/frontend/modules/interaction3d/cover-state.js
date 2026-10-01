const d = (arg1) =>
    ["number", "string"].includes(typeof arg1) &&
    !(typeof arg1 == "string" && arg1.trim() === "") &&
    Number.isFinite(Number(arg1))
      ? Number(arg1)
      : null,
  m = {
    open: "已打开",
    closed: "已关闭",
    opening: "正在打开",
    closing: "正在关闭",
  };
export function coverStateLabel(arg2) {
  return Object.hasOwn(m, arg2) ? m[arg2] : "设备不可用";
}
export function coverIconIsOn(arg3, arg4) {
  if (!arg4?.available) return false;
  const value1 =
    arg3?.airer || arg3?.coverKind === "airer"
      ? arg4.closing ||
        (arg4.position !== null && arg4.position !== undefined
          ? arg4.position < 100
          : arg4.state === "closed")
      : arg4.on;
  return !!(arg3?.iconStateReversed === true ? !value1 : value1);
}
export function coverState(arg5, arg6, arg7 = {}) {
  const value2 = arg6?.newState || arg6 || {},
    value3 = value2.attributes || {},
    value4 = String(value2.state || "")
      .trim()
      .toLowerCase(),
    value5 = d(value3.current_position),
    value6 = d(value3.current_tilt_position),
    value7 = arg7.coverKind === "dream",
    value8 = d(value3.supported_features),
    value9 = Number.isSafeInteger(value8) && value8 >= 0 ? value8 : 0,
    value10 = value6 !== null || !!(value9 & 240),
    value11 = !value7 || value10,
    value12 = value11 ? value4 : "unknown",
    value13 = value11
      ? value5 === null
        ? value12 === "closed"
          ? 0
          : null
        : Math.max(0, Math.min(100, value5))
      : null,
    value14 = value10 ? value6 : value5,
    value15 =
      /^cover\.[a-z0-9_]+$/.test(arg5) && value2.available !== false && Object.hasOwn(m, value4);
  return {
    entityId: arg5,
    raw: value2,
    available: value15,
    dream: value7,
    overallFeedbackAvailable: value11,
    name: String(value3.friendly_name || arg5 || "窗帘"),
    state: value12,
    position: value13,
    positionKnown: value13 !== null,
    positionReported: value11 && value5 !== null,
    features: value9,
    closedConfirmed: value15 && value11 && value12 === "closed" && value13 === 0,
    tiltPosition: value14 === null ? null : Math.max(0, Math.min(100, value14)),
    tiltPositionKnown: value14 !== null,
    opening: value15 && value12 === "opening",
    closing: value15 && value12 === "closing",
    moving: value15 && ["opening", "closing"].includes(value12),
    on: value15 && (value12 === "opening" || (value13 !== null ? value13 > 0 : value12 === "open")),
    openSupported: !!(value9 & 1),
    closeSupported: !!(value9 & 2),
    positionSupported: !!(value9 & 4),
    stopSupported: !!(value9 & 8),
    tiltSupported: !!(value9 & 128),
    bladeSupported: !!(value9 & 128) || (!value10 && !!(value9 & 4)),
  };
}
export function coverCanAdjustBlades(arg8, arg9 = arg8) {
  return !arg8.available || !arg8.bladeSupported
    ? false
    : arg8.overallFeedbackAvailable
      ? arg9.closedConfirmed === true
      : arg9.moving || ["opening", "closing"].includes(arg8.raw?.state)
        ? false
        : !(arg9.estimated && arg9.position > 0);
}
export function coverControl(arg10, arg11, arg12) {
  if (!arg10.available) throw new Error("窗帘当前不可用。");
  const value16 = {
    open_cover: "openSupported",
    close_cover: "closeSupported",
    stop_cover: "stopSupported",
    set_cover_position: "positionSupported",
    set_cover_tilt_position: "tiltSupported",
  }[arg11];
  if (!value16 || !arg10[value16]) throw new Error("设备不支持此窗帘操作。");
  if (
    arg10.dream &&
    ["set_cover_position", "set_cover_tilt_position"].includes(arg11) &&
    !coverCanAdjustBlades(arg10)
  )
    throw new Error("只有确认整体完全关闭且停止后，才能调整叶片。");
  let object1 = {};
  if (arg11 === "set_cover_position" || arg11 === "set_cover_tilt_position") {
    const value17 = d(arg12);
    if (!Number.isInteger(value17) || value17 < 0 || value17 > 100)
      throw new Error("目标位置必须是 0–100 之间的整数。");
    object1 =
      arg11 === "set_cover_tilt_position"
        ? {
            tilt_position: value17,
          }
        : {
            position: value17,
          };
  }
  return {
    entityId: arg10.entityId,
    domain: "cover",
    service: arg11,
    data: object1,
  };
}
