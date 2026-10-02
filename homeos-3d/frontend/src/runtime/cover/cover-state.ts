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
    effectiveState = hasOverallFeedback ? normalizedState : "unknown",
    effectivePosition = hasOverallFeedback
      ? currentPosition === null
        ? effectiveState === "closed"
          ? 0
          : null
        : Math.max(0, Math.min(100, currentPosition))
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
      isAvailable && hasOverallFeedback && effectiveState === "closed" && effectivePosition === 0,
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
      : estimatedStatus.moving || ["opening", "closing"].includes(coverStatus.raw?.state)
        ? false
        : !(estimatedStatus.estimated && estimatedStatus.position > 0);
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
