import { coverComponentIsDream } from "./registry.js?v=20260926-integration-v1-20260930-flow-line-sign-v1-20260930-percentage-text-offset-v1";
import { entityMetadataIsAvailable } from "./entity-metadata.js?v=20260901-renderer-entity-metadata-v1";
export function runtimeEntityStateIsActive(runtimeEntity) {
  const normalizedStateText = String(runtimeEntity?.newState?.state ?? runtimeEntity?.state ?? "")
    .trim()
    .toLowerCase();
  return ["on", "open", "true", "home"].includes(normalizedStateText);
}
const POSITION_TOLERANCE_PERCENT = 1;
function airerPositionFromState(entityState) {
  const runtimeStateData = entityState?.newState || entityState || {},
    rawPositionValue = Number(runtimeStateData.attributes?.current_position);
  return Number.isFinite(rawPositionValue) ? Math.max(0, Math.min(100, rawPositionValue)) : null;
}
export function coverPositionReachedTarget(currentPosition, targetPosition, motorDirection) {
  const clampedCurrentPosition = Math.max(0, Math.min(100, Number(currentPosition) || 0)),
    clampedTargetPosition = Math.max(0, Math.min(100, Number(targetPosition) || 0));
  return motorDirection < 0
    ? clampedCurrentPosition <= clampedTargetPosition + 0.5
    : clampedCurrentPosition >= clampedTargetPosition - 0.5;
}
export function coverPendingDisplayPosition(
  pendingCurrentPosition,
  pendingTargetPosition,
  pendingMotorDirection,
) {
  return pendingMotorDirection < 0
    ? Math.min(pendingCurrentPosition, pendingTargetPosition)
    : Math.max(pendingCurrentPosition, pendingTargetPosition);
}
export function runtimeCoverStateIsActive(coverEntityState) {
  const coverStateData = coverEntityState?.newState || coverEntityState || {},
    coverStateText = String(coverStateData.state || "")
      .trim()
      .toLowerCase();
  if (coverStateText === "opening") return true;
  if (coverStateText === "closing") return false;
  const coverPositionValue = airerPositionFromState(coverStateData);
  return coverPositionValue !== null
    ? coverPositionValue > POSITION_TOLERANCE_PERCENT
    : runtimeEntityStateIsActive(coverStateData);
}
export function relatedDeviceEntity(
  entityByEntityId,
  entityId,
  domain,
  translationKey,
  preferredEntityId = "",
) {
  const sourceEntity = entityByEntityId.get(entityId);
  if (!sourceEntity?.deviceId) return null;
  const deviceCandidates = [...entityByEntityId.values()].filter(
    (deviceCandidate) =>
      deviceCandidate.deviceId === sourceEntity.deviceId &&
      deviceCandidate.domain === domain &&
      deviceCandidate.translationKey === translationKey &&
      entityMetadataIsAvailable(deviceCandidate),
  );
  return (
    deviceCandidates.sort((leftDeviceCandidate, rightDeviceCandidate) => {
      const leftDeviceEntityId = String(leftDeviceCandidate.entityId || ""),
        rightDeviceEntityId = String(rightDeviceCandidate.entityId || "");
      if (leftDeviceEntityId === preferredEntityId) return -1;
      if (rightDeviceEntityId === preferredEntityId) return 1;
      const leftIsRoomScoped = /_room_\d+_/.test(leftDeviceEntityId),
        rightIsRoomScoped = /_room_\d+_/.test(rightDeviceEntityId);
      return leftIsRoomScoped !== rightIsRoomScoped
        ? leftIsRoomScoped
          ? 1
          : -1
        : leftDeviceEntityId.length - rightDeviceEntityId.length ||
            leftDeviceEntityId.localeCompare(rightDeviceEntityId);
    }),
    deviceCandidates[0] || null
  );
}
export function relatedDeviceDomainEntity(domainEntityByEntityId, targetEntityId, targetDomain) {
  const domainSourceEntity = domainEntityByEntityId.get(targetEntityId);
  if (!domainSourceEntity?.deviceId) return null;
  const domainCandidates = [...domainEntityByEntityId.values()].filter(
    (domainCandidate) =>
      domainCandidate.deviceId === domainSourceEntity.deviceId &&
      domainCandidate.domain === targetDomain &&
      entityMetadataIsAvailable(domainCandidate),
  );
  return (
    domainCandidates.sort((leftDomainCandidate, rightDomainCandidate) => {
      const leftLightScore = /灯|照明|light/i.test(
          (leftDomainCandidate.name || "") + " " + (leftDomainCandidate.entityId || ""),
        )
          ? 0
          : 1,
        rightLightScore = /灯|照明|light/i.test(
          (rightDomainCandidate.name || "") + " " + (rightDomainCandidate.entityId || ""),
        )
          ? 0
          : 1;
      return (
        leftLightScore - rightLightScore ||
        String(leftDomainCandidate.entityId || "").length -
          String(rightDomainCandidate.entityId || "").length ||
        String(leftDomainCandidate.entityId || "").localeCompare(
          String(rightDomainCandidate.entityId || ""),
        )
      );
    }),
    domainCandidates[0] || null
  );
}
const airerNamePattern = /airer|clothes.?rack|laundry.?rack|晾衣机|晾衣架/i,
  lightNamePattern = /light|lamp|灯光|照明|灯(?:$|[\s_-])/i,
  setPositionPattern = /set[_\s-]?position|target[_\s-]?position|设定位置|设置位置|目标位置/i,
  currentPositionPattern = /current[_\s-]?position|当前位置|当前高度/i,
  motorSpeedPattern = /motor[_\s-]?speed|电机速度/i,
  motorActionPatterns = {
    up: /motor[_\s-]?control[_\s-]?up|晾杆控制[^\n]*(?:上升|升起)/i,
    down: /motor[_\s-]?control[_\s-]?down|晾杆控制[^\n]*下降/i,
    pause: /motor[_\s-]?control[_\s-]?(?:pause|stop)|晾杆控制[^\n]*(?:停止|暂停)/i,
  };
export function coverComponentIsAirer(
  component,
  airerEntityId = "",
  airerEntityState = null,
  airerEntityByEntityId = new Map(),
  deviceById = new Map(),
) {
  const coverKind = component?.properties?.coverKind;
  if (coverKind === "airer") return true;
  if (["standard", "dream"].includes(coverKind)) return false;
  const airerStateData = airerEntityState?.newState || airerEntityState || {},
    airerEntityRecord = airerEntityByEntityId.get(airerEntityId) || {},
    airerDeviceRecord = airerEntityRecord.deviceId
      ? deviceById.get(airerEntityRecord.deviceId) || {}
      : {};
  return airerNamePattern.test(
    [
      airerEntityId,
      airerStateData.attributes?.friendly_name,
      airerEntityRecord.name,
      airerEntityRecord.originalName,
      airerEntityRecord.translationKey,
      airerEntityRecord.uniqueId,
      airerDeviceRecord.name,
      airerDeviceRecord.model,
    ]
      .filter(Boolean)
      .join(" "),
  );
}
function airerEntityNumberIds(numberSourceEntityId) {
  return new Set(
    [...String(numberSourceEntityId || "").matchAll(/_(?:s|p)_(\d+)(?:_|$)/gi)].map(
      (numberIdMatch) => numberIdMatch[1],
    ),
  );
}
export function relatedAirerLightEntity(lightEntityByEntityId, lightSourceEntityId) {
  const lightSourceEntity = lightEntityByEntityId.get(lightSourceEntityId);
  if (!lightSourceEntity?.deviceId) return null;
  const sourceNumberIds = airerEntityNumberIds(lightSourceEntity.entityId);
  return (
    [...lightEntityByEntityId.values()]
      .filter(
        (lightCandidate) =>
          lightCandidate.entityId !== lightSourceEntityId &&
          lightCandidate.deviceId === lightSourceEntity.deviceId &&
          ["light", "switch"].includes(String(lightCandidate.domain || "")) &&
          entityMetadataIsAvailable(lightCandidate),
      )
      .map((scoredLightCandidate) => {
        const lightCandidateText =
          (scoredLightCandidate.entityId || "") +
          " " +
          (scoredLightCandidate.name || "") +
          " " +
          (scoredLightCandidate.originalName || "") +
          " " +
          (scoredLightCandidate.translationKey || "");
        if (scoredLightCandidate.domain === "switch" && !lightNamePattern.test(lightCandidateText))
          return null;
        const lightCandidateNumberIds = airerEntityNumberIds(scoredLightCandidate.entityId),
          sharesNumberId = [...sourceNumberIds].some((numberId) =>
            lightCandidateNumberIds.has(numberId),
          );
        let lightScore = scoredLightCandidate.domain === "light" ? 180 : 80;
        return (
          sharesNumberId && (lightScore += 360),
          airerNamePattern.test(lightCandidateText) && (lightScore += 180),
          lightNamePattern.test(lightCandidateText) && (lightScore += 90),
          /night.?light|夜灯/i.test(lightCandidateText) && (lightScore -= 60),
          {
            item: scoredLightCandidate,
            score: lightScore,
          }
        );
      })
      .filter(Boolean)
      .sort(
        (leftLightEntry, rightLightEntry) =>
          rightLightEntry.score - leftLightEntry.score ||
          String(leftLightEntry.item.entityId || "").length -
            String(rightLightEntry.item.entityId || "").length ||
          String(leftLightEntry.item.entityId || "").localeCompare(
            String(rightLightEntry.item.entityId || ""),
          ),
      )[0]?.item || null
  );
}
function findRelatedAirerEntity(
  airerLookupByEntityId,
  airerTargetEntityId,
  airerTargetDomain,
  airerNameMatcher,
) {
  const airerSourceEntity = airerLookupByEntityId.get(airerTargetEntityId);
  if (!airerSourceEntity?.deviceId) {
    const airerDevicePatternMatch = String(airerTargetEntityId || "").match(
      /^cover\.(hyd_cn_[a-z0-9]+_pro2)_s_\d+_airer$/i,
    );
    return airerDevicePatternMatch
      ? airerTargetDomain === "number" && airerNameMatcher === setPositionPattern
        ? {
            entityId: "number." + airerDevicePatternMatch[1] + "_set_position_p_4_9",
            domain: "number",
          }
        : airerTargetDomain === "sensor" && airerNameMatcher === currentPositionPattern
          ? {
              entityId: "sensor." + airerDevicePatternMatch[1] + "_current_position_p_4_11",
              domain: "sensor",
            }
          : airerTargetDomain === "sensor" && airerNameMatcher === motorSpeedPattern
            ? {
                entityId: "sensor." + airerDevicePatternMatch[1] + "_motor_speed_p_4_12",
                domain: "sensor",
              }
            : null
      : null;
  }
  return (
    [...airerLookupByEntityId.values()]
      .filter(
        (airerCandidate) =>
          airerCandidate.entityId !== airerTargetEntityId &&
          airerCandidate.deviceId === airerSourceEntity.deviceId &&
          airerCandidate.domain === airerTargetDomain &&
          entityMetadataIsAvailable(airerCandidate),
      )
      .map((scoredAirerCandidate) => {
        const airerCandidateText =
          (scoredAirerCandidate.entityId || "") +
          " " +
          (scoredAirerCandidate.name || "") +
          " " +
          (scoredAirerCandidate.originalName || "") +
          " " +
          (scoredAirerCandidate.translationKey || "");
        if (!airerNameMatcher.test(airerCandidateText)) return null;
        let airerCandidateScore = 0;
        return (
          airerNameMatcher.test(String(scoredAirerCandidate.translationKey || "")) &&
            (airerCandidateScore += 300),
          airerNameMatcher.test(String(scoredAirerCandidate.entityId || "")) &&
            (airerCandidateScore += 180),
          airerNamePattern.test(airerCandidateText) && (airerCandidateScore += 90),
          {
            item: scoredAirerCandidate,
            score: airerCandidateScore,
          }
        );
      })
      .filter(Boolean)
      .sort(
        (leftAirerEntry, rightAirerEntry) =>
          rightAirerEntry.score - leftAirerEntry.score ||
          String(leftAirerEntry.item.entityId || "").length -
            String(rightAirerEntry.item.entityId || "").length ||
          String(leftAirerEntry.item.entityId || "").localeCompare(
            String(rightAirerEntry.item.entityId || ""),
          ),
      )[0]?.item || null
  );
}
export function relatedAirerPositionNumberEntity(positionEntityByEntityId, positionEntityId) {
  return findRelatedAirerEntity(
    positionEntityByEntityId,
    positionEntityId,
    "number",
    setPositionPattern,
  );
}
export function relatedAirerCurrentPositionSensor(
  positionSensorByEntityId,
  positionSensorEntityId,
) {
  return findRelatedAirerEntity(
    positionSensorByEntityId,
    positionSensorEntityId,
    "sensor",
    currentPositionPattern,
  );
}
export function relatedAirerMotorSpeedSensor(motorSensorByEntityId, motorSensorEntityId) {
  return findRelatedAirerEntity(
    motorSensorByEntityId,
    motorSensorEntityId,
    "sensor",
    motorSpeedPattern,
  );
}
export function relatedAirerMotorActionEntities(motorEntityByEntityId, motorSourceEntityId) {
  const motorSourceEntity = motorEntityByEntityId.get(motorSourceEntityId);
  if (!motorSourceEntity?.deviceId)
    return {
      up: null,
      down: null,
      pause: null,
    };
  const motorButtonEntities = [...motorEntityByEntityId.values()].filter(
    (motorButtonCandidate) =>
      motorButtonCandidate.entityId !== motorSourceEntityId &&
      motorButtonCandidate.deviceId === motorSourceEntity.deviceId &&
      motorButtonCandidate.domain === "button" &&
      entityMetadataIsAvailable(motorButtonCandidate),
  );
  return Object.fromEntries(
    Object.entries(motorActionPatterns).map(([motorActionName, motorActionMatcher]) => {
      const matchedMotorButton = motorButtonEntities.find((motorButtonEntity) =>
        motorActionMatcher.test(
          (motorButtonEntity.entityId || "") +
            " " +
            (motorButtonEntity.name || "") +
            " " +
            (motorButtonEntity.originalName || "") +
            " " +
            (motorButtonEntity.translationKey || ""),
        ),
      );
      return [motorActionName, matchedMotorButton || null];
    }),
  );
}
export function airerVisualDrop(airerRawPosition, airerStateText = "", airerCalibration = {}) {
  if (airerStateText === "open") return 2;
  if (airerStateText === "closed") return 40;
  const clampedAirerPosition = Math.max(0, Math.min(100, Number(airerRawPosition) || 0)),
    raisedCalibrationValue =
      airerCalibration.raised === null || airerCalibration.raised === undefined
        ? Number.NaN
        : Number(airerCalibration.raised),
    loweredCalibrationValue =
      airerCalibration.lowered === null || airerCalibration.lowered === undefined
        ? Number.NaN
        : Number(airerCalibration.lowered),
    raisedFallbackPosition = Number.isFinite(raisedCalibrationValue)
      ? raisedCalibrationValue
      : Number.isFinite(loweredCalibrationValue) && loweredCalibrationValue >= 50
        ? 0
        : 100,
    airerTravelSpan =
      (Number.isFinite(loweredCalibrationValue)
        ? loweredCalibrationValue
        : raisedFallbackPosition < 50
          ? 100
          : 0) - raisedFallbackPosition;
  return (
    2 +
    (Math.abs(airerTravelSpan) < 0.5
      ? 0
      : Math.max(
          0,
          Math.min(1, (clampedAirerPosition - raisedFallbackPosition) / airerTravelSpan),
        )) *
      38
  );
}
export function airerPositionCalibration(
  calibrationEntityByEntityId,
  calibrationDeviceById,
  calibrationEntityId,
) {
  const calibrationEntityRecord = calibrationEntityByEntityId.get(calibrationEntityId),
    calibrationDeviceRecord = calibrationEntityRecord?.deviceId
      ? calibrationDeviceById.get(calibrationEntityRecord.deviceId)
      : null,
    calibrationIdentityText =
      (calibrationDeviceRecord?.model || "") +
      " " +
      (calibrationDeviceRecord?.name || "") +
      " " +
      (calibrationEntityRecord?.entityId || "") +
      " " +
      (calibrationEntityId || "");
  return /hyd\.airer\.pro2|hyd_cn_[a-z0-9_]*_pro2(?:_|$)/i.test(calibrationIdentityText)
    ? {
        raised: null,
        lowered: null,
        commandRaised: 0,
        commandLowered: 100,
      }
    : {
        raised: null,
        lowered: null,
        commandRaised: null,
        commandLowered: null,
      };
}
export function learnAirerPositionCalibration(
  calibrationState = {},
  reachedPosition,
  commandReferencePosition,
  positionErrorValue,
) {
  const reachedPositionNumber = Number(reachedPosition),
    commandReferenceNumber = Number(commandReferencePosition),
    positionErrorNumber = Number(positionErrorValue),
    commandRaisedValue =
      calibrationState.commandRaised === null || calibrationState.commandRaised === undefined
        ? Number.NaN
        : Number(calibrationState.commandRaised),
    commandLoweredValue =
      calibrationState.commandLowered === null || calibrationState.commandLowered === undefined
        ? Number.NaN
        : Number(calibrationState.commandLowered);
  return (
    !Number.isFinite(reachedPositionNumber) ||
      !Number.isFinite(commandReferenceNumber) ||
      !Number.isFinite(positionErrorNumber) ||
      Math.abs(positionErrorNumber) >= 0.5 ||
      (Number.isFinite(commandRaisedValue) &&
        Math.abs(commandReferenceNumber - commandRaisedValue) <= 0.5 &&
        (calibrationState.raised = Math.max(0, Math.min(100, reachedPositionNumber))),
      Number.isFinite(commandLoweredValue) &&
        Math.abs(commandReferenceNumber - commandLoweredValue) <= 0.5 &&
        (calibrationState.lowered = Math.max(0, Math.min(100, reachedPositionNumber)))),
    calibrationState
  );
}
export function airerPresentationPosition(presentationRawPosition, presentationCalibration = {}) {
  const clampedPresentationPosition = Math.max(
      0,
      Math.min(100, Number(presentationRawPosition) || 0),
    ),
    raisedBound =
      presentationCalibration.raised === null || presentationCalibration.raised === undefined
        ? Number.NaN
        : Number(presentationCalibration.raised),
    loweredBound =
      presentationCalibration.lowered === null || presentationCalibration.lowered === undefined
        ? Number.NaN
        : Number(presentationCalibration.lowered);
  if (!Number.isFinite(raisedBound) && !Number.isFinite(loweredBound))
    return clampedPresentationPosition;
  const effectiveRaisedBound = Number.isFinite(raisedBound) ? raisedBound : 0,
    effectiveLoweredBound = Number.isFinite(loweredBound) ? loweredBound : 100;
  return Math.abs(effectiveLoweredBound - effectiveRaisedBound) < 0.5
    ? clampedPresentationPosition
    : Math.max(
        0,
        Math.min(
          100,
          ((effectiveLoweredBound - clampedPresentationPosition) /
            (effectiveLoweredBound - effectiveRaisedBound)) *
            100,
        ),
      );
}
export function airerPresentationPositionForState(
  statePresentationPosition,
  stateEntityState,
  stateCalibration = {},
  isStateReversed = false,
) {
  const statePhysicalCoverState = physicalCoverState(stateEntityState, isStateReversed);
  return statePhysicalCoverState === "open"
    ? 100
    : statePhysicalCoverState === "closed"
      ? 0
      : airerPresentationPosition(statePresentationPosition, stateCalibration);
}
export function airerReportedPosition(
  stateCoverEntity,
  attributeCoverEntity,
  reportedCalibration = {},
) {
  const entityStatePosition = Number(stateCoverEntity?.state),
    attributeCurrentPosition = Number(attributeCoverEntity?.attributes?.current_position),
    hasRaisedCalibration =
      reportedCalibration.raised !== null &&
      reportedCalibration.raised !== undefined &&
      Number.isFinite(Number(reportedCalibration.raised)),
    hasLoweredCalibration =
      reportedCalibration.lowered !== null &&
      reportedCalibration.lowered !== undefined &&
      Number.isFinite(Number(reportedCalibration.lowered));
  return hasRaisedCalibration &&
    hasLoweredCalibration &&
    Math.abs(Number(reportedCalibration.lowered) - Number(reportedCalibration.raised)) >= 0.5 &&
    Number.isFinite(entityStatePosition)
    ? entityStatePosition
    : Number.isFinite(attributeCurrentPosition)
      ? attributeCurrentPosition
      : entityStatePosition;
}
export function airerDevicePosition(deviceRawPosition, deviceCalibration = {}) {
  const clampedDevicePosition = Math.max(0, Math.min(100, Number(deviceRawPosition) || 0)),
    deviceCommandRaised =
      deviceCalibration.commandRaised === null || deviceCalibration.commandRaised === undefined
        ? Number(deviceCalibration.raised)
        : Number(deviceCalibration.commandRaised),
    deviceCommandLowered =
      deviceCalibration.commandLowered === null || deviceCalibration.commandLowered === undefined
        ? Number(deviceCalibration.lowered)
        : Number(deviceCalibration.commandLowered);
  if (
    !Number.isFinite(deviceCommandRaised) ||
    !Number.isFinite(deviceCommandLowered) ||
    Math.abs(deviceCommandLowered - deviceCommandRaised) < 0.5
  )
    return clampedDevicePosition;
  const deviceRaisedBound = deviceCommandRaised,
    deviceLoweredBound = deviceCommandLowered;
  return (
    deviceLoweredBound - (clampedDevicePosition / 100) * (deviceLoweredBound - deviceRaisedBound)
  );
}
const waterHeaterControlDomains = new Set(["switch", "select", "number", "button"]);
export function relatedWaterHeaterEntities(waterHeaterEntityByEntityId, waterHeaterSourceEntityId) {
  const waterHeaterSourceEntity = waterHeaterEntityByEntityId.get(waterHeaterSourceEntityId);
  if (!waterHeaterSourceEntity?.deviceId) return [];
  const waterHeaterDomainOrder = new Map([
    ["switch", 0],
    ["select", 1],
    ["number", 2],
    ["button", 3],
  ]);
  return [...waterHeaterEntityByEntityId.values()]
    .filter(
      (waterHeaterCandidate) =>
        waterHeaterCandidate.entityId !== waterHeaterSourceEntityId &&
        waterHeaterCandidate.deviceId === waterHeaterSourceEntity.deviceId &&
        waterHeaterControlDomains.has(String(waterHeaterCandidate.domain || "")) &&
        entityMetadataIsAvailable(waterHeaterCandidate),
    )
    .sort(
      (leftWaterHeaterEntity, rightWaterHeaterEntity) =>
        (waterHeaterDomainOrder.get(leftWaterHeaterEntity.domain) ?? 99) -
          (waterHeaterDomainOrder.get(rightWaterHeaterEntity.domain) ?? 99) ||
        String(leftWaterHeaterEntity.entityId || "").localeCompare(
          String(rightWaterHeaterEntity.entityId || ""),
        ),
    );
}
export function waterHeaterRelatedEntityLabel(waterHeaterComponent, waterHeaterRelatedEntity) {
  let relatedEntityLabel = String(
    waterHeaterRelatedEntity?.name || waterHeaterRelatedEntity?.originalName || "",
  )
    .replace(/\s+/g, " ")
    .trim();
  const componentNameVariants = [
    ...new Set(
      [waterHeaterComponent?.originalName, waterHeaterComponent?.name]
        .map((componentName) =>
          String(componentName || "")
            .replace(/\s+/g, " ")
            .trim(),
        )
        .filter(Boolean),
    ),
  ].sort((leftNameVariant, rightNameVariant) => rightNameVariant.length - leftNameVariant.length);
  for (const nameVariant of componentNameVariants)
    for (; relatedEntityLabel !== nameVariant && relatedEntityLabel.startsWith(nameVariant + " ");)
      relatedEntityLabel = relatedEntityLabel.slice(nameVariant.length).trim();
  return (
    relatedEntityLabel ||
    (String(waterHeaterRelatedEntity?.entityId || "").split(".", 2)[1] || "扩展功能").replace(
      /_/g,
      " ",
    )
  );
}
export function relatedCoverMotorReverseEntity(reverseEntityByEntityId, reverseSourceEntityId) {
  const reverseSourceEntity = reverseEntityByEntityId.get(reverseSourceEntityId);
  return (
    (reverseSourceEntity?.deviceId &&
      [...reverseEntityByEntityId.values()].find(
        (reverseCandidate) =>
          reverseCandidate.deviceId === reverseSourceEntity.deviceId &&
          ["switch", "select"].includes(String(reverseCandidate.domain || "")) &&
          /motor_reverse|电机反向/i.test(
            (reverseCandidate.entityId || "") + " " + (reverseCandidate.name || ""),
          ) &&
          entityMetadataIsAvailable(reverseCandidate),
      )) ||
    null
  );
}
function entityStateIsEnabled(toggleStateInput) {
  const toggleStateText = String(toggleStateInput?.newState?.state ?? toggleStateInput?.state ?? "")
    .trim()
    .toLowerCase();
  return ["on", "true", "1", "enabled", "开启", "打开"].includes(toggleStateText);
}
function resolveCoverMotorReversed(
  motorReverseLookupByEntityId,
  motorStateByEntityId,
  motorComponentEntityId,
) {
  const motorReverseEntity = relatedCoverMotorReverseEntity(
    motorReverseLookupByEntityId,
    motorComponentEntityId,
  );
  return !!(
    motorReverseEntity?.entityId &&
    entityStateIsEnabled(motorStateByEntityId.get(motorReverseEntity.entityId))
  );
}
export function coverMotorIsReversedForComponent(
  motorComponent,
  motorDeviceById,
  motorComponentByEntityId,
  motorComponentEntityId2,
) {
  const coverMotorDirection = motorComponent?.properties?.coverMotorDirection;
  return coverMotorDirection === "normal" ? false : coverMotorDirection === "reversed";
}
export function physicalCoverState(physicalStateText, isMotorReversed = false) {
  const rawPhysicalState = String(physicalStateText || "");
  return (
    (isMotorReversed &&
      {
        open: "closed",
        closed: "open",
        opening: "closing",
        closing: "opening",
      }[rawPhysicalState]) ||
    rawPhysicalState
  );
}
export function coverPresentationState(dreamEntityState, isDreamReversed = false) {
  const dreamStateData = dreamEntityState?.newState || dreamEntityState || {},
    dreamPhysicalState = physicalCoverState(dreamStateData.state, isDreamReversed);
  if (dreamPhysicalState === "opening" || dreamPhysicalState === "closing")
    return dreamPhysicalState;
  const dreamPositionValue = airerPositionFromState(dreamStateData);
  return dreamPositionValue === null
    ? dreamPhysicalState
    : (isDreamReversed ? 100 - dreamPositionValue : dreamPositionValue) <=
        POSITION_TOLERANCE_PERCENT
      ? "closed"
      : "open";
}
function resolvePhysicalCoverState(physicalEntityState, isPhysicalReversed = false) {
  const physicalStateData = physicalEntityState?.newState || physicalEntityState || {};
  return physicalCoverState(physicalStateData.state, isPhysicalReversed);
}
export function dreamCurtainBladeLabel(bladeRawPosition) {
  const bladeClampedPosition = Math.max(0, Math.min(100, Number(bladeRawPosition) || 0));
  return bladeClampedPosition <= POSITION_TOLERANCE_PERCENT
    ? "一侧闭合"
    : bladeClampedPosition >= 100 - POSITION_TOLERANCE_PERCENT
      ? "反向闭合"
      : Math.abs(bladeClampedPosition - 50) <= 2
        ? "90°打开"
        : Math.round(bladeClampedPosition * 1.8) + "°";
}
export function dreamCurtainStatusText(
  curtainStateText,
  curtainBladePosition,
  isCurtainReversed = false,
) {
  const curtainPhysicalState = physicalCoverState(curtainStateText, isCurtainReversed);
  return (
    "整体：" +
    ({
      open: "开启",
      closed: "关闭",
      opening: "正在开启",
      closing: "正在关闭",
    }[curtainPhysicalState] || "未知") +
    " · 叶片：" +
    dreamCurtainBladeLabel(curtainBladePosition)
  );
}
export function dreamCurtainStatusFromRetraction(
  isCurtainRetracted,
  isCurtainInMotion,
  motionBladePosition,
) {
  return (
    "整体：" +
    (isCurtainInMotion
      ? isCurtainRetracted
        ? "正在开启"
        : "正在关闭"
      : isCurtainRetracted
        ? "开启"
        : "关闭") +
    " · 叶片：" +
    dreamCurtainBladeLabel(motionBladePosition)
  );
}
export function dreamCurtainIsRetracted(retractionStateText, isRetractionReversed = false) {
  const retractionPhysicalState = physicalCoverState(retractionStateText, isRetractionReversed);
  return retractionPhysicalState === "open" || retractionPhysicalState === "opening";
}
export function dreamCurtainToggleService(
  isRetractedForToggle,
  openCurtainService,
  closeCurtainService,
) {
  return isRetractedForToggle ? closeCurtainService : openCurtainService;
}
export function coverToggleServiceForComponent(
  toggleComponent,
  toggleDeviceById,
  toggleEntityByEntityId,
  toggleEntityId,
) {
  const toggleCoverState = toggleEntityByEntityId.get(toggleEntityId),
    toggleMotorReversed = coverMotorIsReversedForComponent(
      toggleComponent,
      toggleDeviceById,
      toggleEntityByEntityId,
      toggleEntityId,
    ),
    togglePresentationState = coverComponentIsDream(
      toggleComponent,
      toggleEntityId,
      toggleCoverState,
      toggleDeviceById,
    )
      ? resolvePhysicalCoverState(toggleCoverState, toggleMotorReversed)
      : coverPresentationState(toggleCoverState, toggleMotorReversed);
  return togglePresentationState === "open" || togglePresentationState === "opening"
    ? toggleMotorReversed
      ? "open_cover"
      : "close_cover"
    : toggleMotorReversed
      ? "close_cover"
      : "open_cover";
}
