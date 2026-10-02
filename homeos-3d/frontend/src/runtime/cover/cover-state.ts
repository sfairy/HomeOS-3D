const parseFiniteNumber = (rawInput) =>
    ["number", "string"].includes(typeof rawInput) &&
    !(typeof rawInput == "string" && rawInput.trim() === "") &&
    Number.isFinite(Number(rawInput))
      ? Number(rawInput)
      : null,
  stateLabelByState = {
    open: "已打开",
    closed: "已关闭",
    opening: "正在打开",
    closing: "正在关闭",
  };
export function coverStateLabel(stateKey) {
  return Object.hasOwn(stateLabelByState, stateKey) ? stateLabelByState[stateKey] : "设备不可用";
}
export function coverIconIsOn(component, coverFeedback) {
  if (!coverFeedback?.available) return false;
  const isCoverOn =
    component?.airer || component?.coverKind === "airer"
      ? coverFeedback.closing ||
        (coverFeedback.position !== null && coverFeedback.position !== undefined
          ? coverFeedback.position < 100
          : coverFeedback.state === "closed")
      : coverFeedback.on;
  return !!(component?.iconStateReversed === true ? !isCoverOn : isCoverOn);
}
export function coverState(entityId, stateChange, options: { coverKind?: string } = {}) {
  const rawState = stateChange?.newState || stateChange || {},
    stateAttributes = rawState.attributes || {},
    normalizedState = String(rawState.state || "")
      .trim()
      .toLowerCase(),
    currentPosition = parseFiniteNumber(stateAttributes.current_position),
    currentTiltPosition = parseFiniteNumber(stateAttributes.current_tilt_position),
    isDreamCover = options.coverKind === "dream",
    parsedSupportedFeatures = parseFiniteNumber(stateAttributes.supported_features),
    supportedFeatures =
      Number.isSafeInteger(parsedSupportedFeatures) && parsedSupportedFeatures >= 0
        ? parsedSupportedFeatures
        : 0,
    hasTiltFeedback = currentTiltPosition !== null || !!(supportedFeatures & 240),
    hasOverallFeedback = !isDreamCover || hasTiltFeedback,
    // 没有独立叶片通道的梦幻帘（hasOverallFeedback=false）：上报的 current_position 是
    // 叶片角度，但 state（open/closed/opening/closing）仍是整体开合的可用信息。
    // 之前一律置成 "unknown" 会连带丢掉整体状态，3D 窗帘的整体开合也就无从驱动。
    hasRailState = hasOverallFeedback || Object.hasOwn(stateLabelByState, normalizedState),
    effectiveState = hasRailState ? normalizedState : "unknown",
    effectivePosition = hasOverallFeedback
      ? currentPosition === null
        ? effectiveState === "closed"
          ? 0
          : null
        : Math.max(0, Math.min(100, currentPosition))
      : // 无独立叶片通道时整体只有开/合两态可辨（没有行程百分比）：
        // 把 state 映射成 0/100 供 3D 整体开合使用，running 方向按终点取值。
        effectiveState === "closed" || effectiveState === "closing"
        ? 0
        : effectiveState === "open" || effectiveState === "opening"
          ? 100
          : null,
    computedTiltPosition = hasTiltFeedback ? currentTiltPosition : currentPosition,
    isAvailable =
      /^cover\.[a-z0-9_]+$/.test(entityId) &&
      rawState.available !== false &&
      Object.hasOwn(stateLabelByState, normalizedState);
  return {
    entityId: entityId,
    raw: rawState,
    available: isAvailable,
    dream: isDreamCover,
    overallFeedbackAvailable: hasOverallFeedback,
    name: String(stateAttributes.friendly_name || entityId || "窗帘"),
    state: effectiveState,
    position: effectivePosition,
    positionKnown: effectivePosition !== null,
    positionReported: hasOverallFeedback && currentPosition !== null,
    features: supportedFeatures,
    closedConfirmed:
      // 整体确认全关：有独立叶片通道时靠整体行程 0 判定；无独立叶片通道的梦幻帘
      // 没有行程百分比，只能信 state === "closed"（此时 effectivePosition 也被映射成 0）。
      // 这里放开 hasOverallFeedback 不会重新锁死叶片：coverCanAdjustBlades 对这类设备直接返回 true。
      isAvailable && effectiveState === "closed" && effectivePosition === 0,
    tiltPosition:
      computedTiltPosition === null ? null : Math.max(0, Math.min(100, computedTiltPosition)),
    tiltPositionKnown: computedTiltPosition !== null,
    opening: isAvailable && effectiveState === "opening",
    closing: isAvailable && effectiveState === "closing",
    moving: isAvailable && ["opening", "closing"].includes(effectiveState),
    on:
      isAvailable &&
      (effectiveState === "opening" ||
        (effectivePosition !== null ? effectivePosition > 0 : effectiveState === "open")),
    openSupported: !!(supportedFeatures & 1),
    closeSupported: !!(supportedFeatures & 2),
    positionSupported: !!(supportedFeatures & 4),
    stopSupported: !!(supportedFeatures & 8),
    tiltSupported: !!(supportedFeatures & 128),
    bladeSupported: !!(supportedFeatures & 128) || (!hasTiltFeedback && !!(supportedFeatures & 4)),
  };
}
export function coverCanAdjustBlades(coverStatus, estimatedStatus = coverStatus) {
  return !coverStatus.available || !coverStatus.bladeSupported
    ? false
    : coverStatus.overallFeedbackAvailable
      ? estimatedStatus.closedConfirmed === true
      : // 没有独立叶片通道的梦幻帘：上报的 position 就是唯一的可调轴（叶片角度），
        // 不应再用整体运行/估算状态设门禁 —— 设备可能长时间停在 opening/closing 的
        // 陈旧上报或持久化的估算位置上，一旦据此禁用就会把滑杆永久锁死。
        true;
}
export function coverControl(coverDevice, serviceName, targetPosition) {
  if (!coverDevice.available) throw new Error("窗帘当前不可用。");
  const capabilityKey = {
    open_cover: "openSupported",
    close_cover: "closeSupported",
    stop_cover: "stopSupported",
    set_cover_position: "positionSupported",
    set_cover_tilt_position: "tiltSupported",
  }[serviceName];
  if (!capabilityKey || !coverDevice[capabilityKey]) throw new Error("设备不支持此窗帘操作。");
  if (
    coverDevice.dream &&
    ["set_cover_position", "set_cover_tilt_position"].includes(serviceName) &&
    !coverCanAdjustBlades(coverDevice)
  )
    throw new Error("只有确认整体完全关闭且停止后，才能调整叶片。");
  let serviceData = {};
  if (serviceName === "set_cover_position" || serviceName === "set_cover_tilt_position") {
    const parsedPosition = parseFiniteNumber(targetPosition);
    if (!Number.isInteger(parsedPosition) || parsedPosition < 0 || parsedPosition > 100)
      throw new Error("目标位置必须是 0–100 之间的整数。");
    serviceData =
      serviceName === "set_cover_tilt_position"
        ? {
            tilt_position: parsedPosition,
          }
        : {
            position: parsedPosition,
          };
  }
  return {
    entityId: coverDevice.entityId,
    domain: "cover",
    service: serviceName,
    data: serviceData,
  };
}
