import { attributesOf, featureFlags, haNumber } from "../device/entity-capabilities";
const stateLabelByState = {
    open: "已打开",
    closed: "已关闭",
    opening: "正在打开",
    closing: "正在关闭",
  };
export function coverStateLabel(stateKey: any) {
  return Object.hasOwn(stateLabelByState, stateKey) ? (stateLabelByState as any)[stateKey] : "设备不可用";
}
export function coverIconIsOn(component: any, coverFeedback: any) {
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
export function coverState(entityId: any, stateChange: any, options: { coverKind?: string } = {}) {
  const rawState = stateChange?.newState || stateChange || {},
    stateAttributes = attributesOf(rawState),
    normalizedState = String(rawState.state || "")
      .trim()
      .toLowerCase(),
    currentPosition = haNumber(stateAttributes.current_position),
    currentTiltPosition = haNumber(stateAttributes.current_tilt_position),
    isDreamCover = options.coverKind === "dream",
    supportedFeatures = featureFlags(stateAttributes),
    hasTiltFeedback = currentTiltPosition !== null || !!(supportedFeatures! & 240),
    hasOverallFeedback = !isDreamCover || hasTiltFeedback,


    hasRailState = hasOverallFeedback || Object.hasOwn(stateLabelByState, normalizedState),
    effectiveState = hasRailState ? normalizedState : "unknown",
    effectivePosition = hasOverallFeedback
      ? currentPosition === null
        ? effectiveState === "closed"
          ? 0
          : null
        : Math.max(0, Math.min(100, currentPosition))
      :

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
    openSupported: !!(supportedFeatures! & 1),
    closeSupported: !!(supportedFeatures! & 2),
    positionSupported: !!(supportedFeatures! & 4),
    stopSupported: !!(supportedFeatures! & 8),
    tiltSupported: !!(supportedFeatures! & 128),
    tiltOpenSupported: !!(supportedFeatures! & 16),
    tiltCloseSupported: !!(supportedFeatures! & 32),
    tiltStopSupported: !!(supportedFeatures! & 64),
    bladeSupported: !!(supportedFeatures! & 128) || (!hasTiltFeedback && !!(supportedFeatures! & 4)),
  };
}
export function coverCanAdjustBlades(coverStatus: any, estimatedStatus = coverStatus) {
  return !coverStatus.available ||
    !(coverStatus.bladeSupported || coverStatus.tiltOpenSupported || coverStatus.tiltCloseSupported)
    ? false
    : coverStatus.dream
      ? coverStatus.overallFeedbackAvailable
        ? estimatedStatus.closedConfirmed === true
        : estimatedStatus.moving || ["opening", "closing"].includes(coverStatus.raw?.state)
          ? false
          : !(estimatedStatus.estimated && estimatedStatus.position > 0)
      : true;
}
export function coverControl(coverDevice: any, serviceName: any, targetPosition: any) {
  if (!coverDevice.available) throw new Error("窗帘当前不可用。");
  const capabilityKey = ({
    open_cover: "openSupported",
    close_cover: "closeSupported",
    stop_cover: "stopSupported",
    set_cover_position: "positionSupported",
    set_cover_tilt_position: "tiltSupported",
    open_cover_tilt: "tiltOpenSupported",
    close_cover_tilt: "tiltCloseSupported",
    stop_cover_tilt: "tiltStopSupported",
  } as any)[serviceName];
  if (!capabilityKey || !coverDevice[capabilityKey]) throw new Error("设备不支持此窗帘操作。");
  if (
    coverDevice.dream &&
    [
      "set_cover_position",
      "set_cover_tilt_position",
      "open_cover_tilt",
      "close_cover_tilt",
    ].includes(serviceName) &&
    !coverCanAdjustBlades(coverDevice)
  )
    throw new Error("只有确认整体完全关闭且停止后，才能调整叶片。");
  let serviceData: Record<string, any> = {};
  if (serviceName === "set_cover_position" || serviceName === "set_cover_tilt_position") {
    const parsedPosition = haNumber(targetPosition);
    if (!Number.isInteger(parsedPosition) || parsedPosition! < 0 || parsedPosition! > 100)
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
