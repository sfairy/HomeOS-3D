import { coverComponentIsDream } from "./registry.js?v=20260915211726";
import { entityMetadataIsAvailable } from "./entity-metadata.js?v=20260915211726";
export function runtimeEntityStateIsActive(eventState) {
  const normalizedState = String(eventState?.newState?.state ?? eventState?.state ?? "")
    .trim()
    .toLowerCase();
  return ["on", "open", "true", "home"].includes(normalizedState);
}
const PERCENT_EPSILON = 1;
function coverPositionPercent(positionStateInput) {
  const positionStateObject = positionStateInput?.newState || positionStateInput || {};
  const currentPositionAttribute = Number(positionStateObject.attributes?.current_position);
  if (Number.isFinite(currentPositionAttribute)) {
    return Math.max(0, Math.min(100, currentPositionAttribute));
  } else {
    return null;
  }
}
export function coverPositionReachedTarget(currentPosition, targetPosition, direction) {
  const clampedReported = Math.max(0, Math.min(100, Number(currentPosition) || 0));
  const clampedTarget = Math.max(0, Math.min(100, Number(targetPosition) || 0));
  if (direction < 0) {
    return clampedReported <= clampedTarget + 0.5;
  } else {
    return clampedReported >= clampedTarget - 0.5;
  }
}
export function coverPendingDisplayPosition(fromPosition, toPosition, moveDirection) {
  if (moveDirection < 0) {
    return Math.min(fromPosition, toPosition);
  } else {
    return Math.max(fromPosition, toPosition);
  }
}
export function runtimeCoverStateIsActive(coverEventState) {
  const coverState = coverEventState?.newState || coverEventState || {};
  const rawCoverState = String(coverState.state || "")
    .trim()
    .toLowerCase();
  if (rawCoverState === "opening") {
    return true;
  }
  if (rawCoverState === "closing") {
    return false;
  }
  const resolvedPositionAttribute = coverPositionPercent(coverState);
  if (resolvedPositionAttribute !== null) {
    return resolvedPositionAttribute > PERCENT_EPSILON;
  } else {
    return runtimeEntityStateIsActive(coverState);
  }
}
export function relatedDeviceEntity(
  entitiesById,
  entityId,
  domain,
  translationKey,
  preferredEntityId = ""
) {
  const sourceEntity = entitiesById.get(entityId);
  if (!sourceEntity?.deviceId) {
    return null;
  }
  const relatedEntities = [...entitiesById.values()].filter(
    candidateEntity =>
      candidateEntity.deviceId === sourceEntity.deviceId &&
      candidateEntity.domain === domain &&
      candidateEntity.translationKey === translationKey &&
      entityMetadataIsAvailable(candidateEntity)
  );
  relatedEntities.sort((leftEntity, rightEntity) => {
    const leftEntityId = String(leftEntity.entityId || "");
    const rightEntityId = String(rightEntity.entityId || "");
    if (leftEntityId === preferredEntityId) {
      return -1;
    }
    if (rightEntityId === preferredEntityId) {
      return 1;
    }
    const leftIsRoomEntity = /_room_\d+_/.test(leftEntityId);
    const rightIsRoomEntity = /_room_\d+_/.test(rightEntityId);
    if (leftIsRoomEntity !== rightIsRoomEntity) {
      if (leftIsRoomEntity) {
        return 1;
      } else {
        return -1;
      }
    } else {
      return (
        leftEntityId.length - rightEntityId.length || leftEntityId.localeCompare(rightEntityId)
      );
    }
  });
  return relatedEntities[0] || null;
}
export function relatedDeviceDomainEntity(domainEntitiesById, domainEntityId, matchDomain) {
  const domainSourceEntity = domainEntitiesById.get(domainEntityId);
  if (!domainSourceEntity?.deviceId) {
    return null;
  }
  const domainRelatedEntities = [...domainEntitiesById.values()].filter(
    domainCandidate =>
      domainCandidate.deviceId === domainSourceEntity.deviceId &&
      domainCandidate.domain === matchDomain &&
      entityMetadataIsAvailable(domainCandidate)
  );
  domainRelatedEntities.sort((leftDomainEntity, rightDomainEntity) => {
    const leftLooksLikeLight = /灯|照明|light/i.test(
      (leftDomainEntity.name || "") + " " + (leftDomainEntity.entityId || "")
    )
      ? 0
      : 1;
    const rightLooksLikeLight = /灯|照明|light/i.test(
      (rightDomainEntity.name || "") + " " + (rightDomainEntity.entityId || "")
    )
      ? 0
      : 1;
    return (
      leftLooksLikeLight - rightLooksLikeLight ||
      String(leftDomainEntity.entityId || "").length -
        String(rightDomainEntity.entityId || "").length ||
      String(leftDomainEntity.entityId || "").localeCompare(
        String(rightDomainEntity.entityId || "")
      )
    );
  });
  return domainRelatedEntities[0] || null;
}
const AIRER_NAME_PATTERN = /airer|clothes.?rack|laundry.?rack|晾衣机|晾衣架/i;
const LIGHT_NAME_PATTERN = /light|lamp|灯光|照明|灯(?:$|[\s_-])/i;
const SET_POSITION_NAME_PATTERN =
  /set[_\s-]?position|target[_\s-]?position|设定位置|设置位置|目标位置/i;
const CURRENT_POSITION_NAME_PATTERN = /current[_\s-]?position|当前位置|当前高度/i;
const MOTOR_SPEED_NAME_PATTERN = /motor[_\s-]?speed|电机速度/i;
const MOTOR_CONTROL_PATTERNS = {
  up: /motor[_\s-]?control[_\s-]?up|晾杆控制[^\n]*(?:上升|升起)/i,
  down: /motor[_\s-]?control[_\s-]?down|晾杆控制[^\n]*下降/i,
  pause: /motor[_\s-]?control[_\s-]?(?:pause|stop)|晾杆控制[^\n]*(?:停止|暂停)/i
};
export function coverComponentIsAirer(
  component,
  airerComponentEntityId = "",
  componentState = null,
  airerEntitiesById = new Map(),
  devicesById = new Map()
) {
  const coverKind = component?.properties?.coverKind;
  if (coverKind === "airer") {
    return true;
  }
  if (["standard", "dream"].includes(coverKind)) {
    return false;
  }
  const airerStateObject = componentState?.newState || componentState || {};
  const airerEntityMetadata = airerEntitiesById.get(airerComponentEntityId) || {};
  const airerDeviceMetadata = airerEntityMetadata.deviceId
    ? devicesById.get(airerEntityMetadata.deviceId) || {}
    : {};
  return AIRER_NAME_PATTERN.test(
    [
      airerComponentEntityId,
      airerStateObject.attributes?.friendly_name,
      airerEntityMetadata.name,
      airerEntityMetadata.originalName,
      airerEntityMetadata.translationKey,
      airerEntityMetadata.uniqueId,
      airerDeviceMetadata.name,
      airerDeviceMetadata.model
    ]
      .filter(Boolean)
      .join(" ")
  );
}
function collectAirerSlotNumbers(slotSourceEntityId) {
  return new Set(
    [...String(slotSourceEntityId || "").matchAll(/_(?:s|p)_(\d+)(?:_|$)/gi)].map(
      slotMatch => slotMatch[1]
    )
  );
}
export function relatedAirerLightEntity(lightEntitiesById, lightSourceEntityId) {
  const lightSourceEntity = lightEntitiesById.get(lightSourceEntityId);
  if (!lightSourceEntity?.deviceId) {
    return null;
  }
  const lightSourceSlots = collectAirerSlotNumbers(lightSourceEntity.entityId);
  return (
    [...lightEntitiesById.values()]
      .filter(
        candidateLightEntity =>
          candidateLightEntity.entityId !== lightSourceEntityId &&
          candidateLightEntity.deviceId === lightSourceEntity.deviceId &&
          ["light", "switch"].includes(String(candidateLightEntity.domain || "")) &&
          entityMetadataIsAvailable(candidateLightEntity)
      )
      .map(lightCandidate => {
        const lightSearchText =
          (lightCandidate.entityId || "") +
          " " +
          (lightCandidate.name || "") +
          " " +
          (lightCandidate.originalName || "") +
          " " +
          (lightCandidate.translationKey || "");
        if (lightCandidate.domain === "switch" && !LIGHT_NAME_PATTERN.test(lightSearchText)) {
          return null;
        }
        const candidateSlots = collectAirerSlotNumbers(lightCandidate.entityId);
        const sharesSlot = [...lightSourceSlots].some(slotNumber => candidateSlots.has(slotNumber));
        let lightScore = lightCandidate.domain === "light" ? 180 : 80;
        if (sharesSlot) {
          lightScore += 360;
        }
        if (AIRER_NAME_PATTERN.test(lightSearchText)) {
          lightScore += 180;
        }
        if (LIGHT_NAME_PATTERN.test(lightSearchText)) {
          lightScore += 90;
        }
        if (/night.?light|夜灯/i.test(lightSearchText)) {
          lightScore -= 60;
        }
        return {
          item: lightCandidate,
          score: lightScore
        };
      })
      .filter(Boolean)
      .sort(
        (leftLightScore, rightLightScore) =>
          rightLightScore.score - leftLightScore.score ||
          String(leftLightScore.item.entityId || "").length -
            String(rightLightScore.item.entityId || "").length ||
          String(leftLightScore.item.entityId || "").localeCompare(
            String(rightLightScore.item.entityId || "")
          )
      )[0]?.item || null
  );
}
function findAirerEntityByPattern(
  airerLookupEntitiesById,
  airerEntityId,
  patternDomain,
  namePattern
) {
  const airerSourceEntity = airerLookupEntitiesById.get(airerEntityId);
  if (!airerSourceEntity?.deviceId) {
    const entityIdMatch = String(airerEntityId || "").match(
      /^cover\.(hyd_cn_[a-z0-9]+_pro2)_s_\d+_airer$/i
    );
    if (entityIdMatch) {
      if (patternDomain === "number" && namePattern === SET_POSITION_NAME_PATTERN) {
        return {
          entityId: "number." + entityIdMatch[1] + "_set_position_p_4_9",
          domain: "number"
        };
      } else if (patternDomain === "sensor" && namePattern === CURRENT_POSITION_NAME_PATTERN) {
        return {
          entityId: "sensor." + entityIdMatch[1] + "_current_position_p_4_11",
          domain: "sensor"
        };
      } else if (patternDomain === "sensor" && namePattern === MOTOR_SPEED_NAME_PATTERN) {
        return {
          entityId: "sensor." + entityIdMatch[1] + "_motor_speed_p_4_12",
          domain: "sensor"
        };
      } else {
        return null;
      }
    } else {
      return null;
    }
  }
  return (
    [...airerLookupEntitiesById.values()]
      .filter(
        candidate =>
          candidate.entityId !== airerEntityId &&
          candidate.deviceId === airerSourceEntity.deviceId &&
          candidate.domain === patternDomain &&
          entityMetadataIsAvailable(candidate)
      )
      .map(scoredCandidate => {
        const candidateSearchText =
          (scoredCandidate.entityId || "") +
          " " +
          (scoredCandidate.name || "") +
          " " +
          (scoredCandidate.originalName || "") +
          " " +
          (scoredCandidate.translationKey || "");
        if (!namePattern.test(candidateSearchText)) {
          return null;
        }
        let candidateScore = 0;
        if (namePattern.test(String(scoredCandidate.translationKey || ""))) {
          candidateScore += 300;
        }
        if (namePattern.test(String(scoredCandidate.entityId || ""))) {
          candidateScore += 180;
        }
        if (AIRER_NAME_PATTERN.test(candidateSearchText)) {
          candidateScore += 90;
        }
        return {
          item: scoredCandidate,
          score: candidateScore
        };
      })
      .filter(Boolean)
      .sort(
        (leftAirerScore, rightAirerScore) =>
          rightAirerScore.score - leftAirerScore.score ||
          String(leftAirerScore.item.entityId || "").length -
            String(rightAirerScore.item.entityId || "").length ||
          String(leftAirerScore.item.entityId || "").localeCompare(
            String(rightAirerScore.item.entityId || "")
          )
      )[0]?.item || null
  );
}
export function relatedAirerPositionNumberEntity(positionEntitiesById, positionEntityId) {
  return findAirerEntityByPattern(
    positionEntitiesById,
    positionEntityId,
    "number",
    SET_POSITION_NAME_PATTERN
  );
}
export function relatedAirerCurrentPositionSensor(
  currentPositionEntitiesById,
  currentPositionEntityId
) {
  return findAirerEntityByPattern(
    currentPositionEntitiesById,
    currentPositionEntityId,
    "sensor",
    CURRENT_POSITION_NAME_PATTERN
  );
}
export function relatedAirerMotorSpeedSensor(motorSpeedEntitiesById, motorSpeedEntityId) {
  return findAirerEntityByPattern(
    motorSpeedEntitiesById,
    motorSpeedEntityId,
    "sensor",
    MOTOR_SPEED_NAME_PATTERN
  );
}
export function relatedAirerMotorActionEntities(actionEntitiesById, actionEntityId) {
  const actionSourceEntity = actionEntitiesById.get(actionEntityId);
  if (!actionSourceEntity?.deviceId) {
    return {
      up: null,
      down: null,
      pause: null
    };
  }
  const motorActionButtons = [...actionEntitiesById.values()].filter(
    motorButtonCandidate =>
      motorButtonCandidate.entityId !== actionEntityId &&
      motorButtonCandidate.deviceId === actionSourceEntity.deviceId &&
      motorButtonCandidate.domain === "button" &&
      entityMetadataIsAvailable(motorButtonCandidate)
  );
  return Object.fromEntries(
    Object.entries(MOTOR_CONTROL_PATTERNS).map(([actionKey, actionPattern]) => {
      const matchedButton = motorActionButtons.find(buttonCandidate =>
        actionPattern.test(
          (buttonCandidate.entityId || "") +
            " " +
            (buttonCandidate.name || "") +
            " " +
            (buttonCandidate.originalName || "") +
            " " +
            (buttonCandidate.translationKey || "")
        )
      );
      return [actionKey, matchedButton || null];
    })
  );
}
export function airerVisualDrop(positionPercent, airerStateName = "", visualCalibration = {}) {
  if (airerStateName === "open") {
    return 2;
  }
  if (airerStateName === "closed") {
    return 40;
  }
  const visualClampedPosition = Math.max(0, Math.min(100, Number(positionPercent) || 0));
  const visualRaised =
    visualCalibration.raised === null || visualCalibration.raised === undefined
      ? Number.NaN
      : Number(visualCalibration.raised);
  const visualLowered =
    visualCalibration.lowered === null || visualCalibration.lowered === undefined
      ? Number.NaN
      : Number(visualCalibration.lowered);
  const visualCommandRaised = Number.isFinite(visualRaised)
    ? visualRaised
    : Number.isFinite(visualLowered) && visualLowered >= 50
      ? 0
      : 100;
  const visualCommandSpan =
    (Number.isFinite(visualLowered) ? visualLowered : visualCommandRaised < 50 ? 100 : 0) -
    visualCommandRaised;
  return (
    2 +
    (Math.abs(visualCommandSpan) < 0.5
      ? 0
      : Math.max(
          0,
          Math.min(1, (visualClampedPosition - visualCommandRaised) / visualCommandSpan)
        )) *
      38
  );
}
export function airerPositionCalibration(
  calibrationEntitiesById,
  calibrationDevicesById,
  calibrationEntityId
) {
  const calibrationEntityMetadata = calibrationEntitiesById.get(calibrationEntityId);
  const calibrationDeviceMetadata = calibrationEntityMetadata?.deviceId
    ? calibrationDevicesById.get(calibrationEntityMetadata.deviceId)
    : null;
  const calibrationSearchText =
    (calibrationDeviceMetadata?.model || "") +
    " " +
    (calibrationDeviceMetadata?.name || "") +
    " " +
    (calibrationEntityMetadata?.entityId || "") +
    " " +
    (calibrationEntityId || "");
  if (/hyd\.airer\.pro2|hyd_cn_[a-z0-9_]*_pro2(?:_|$)/i.test(calibrationSearchText)) {
    return {
      raised: null,
      lowered: null,
      commandRaised: 0,
      commandLowered: 100
    };
  } else {
    return {
      raised: null,
      lowered: null,
      commandRaised: null,
      commandLowered: null
    };
  }
}
export function learnAirerPositionCalibration(
  calibration = {},
  reportedPosition,
  commandPosition,
  motorSpeed
) {
  const reportedValue = Number(reportedPosition);
  const commandValue = Number(commandPosition);
  const motorSpeedValue = Number(motorSpeed);
  const commandRaisedPosition =
    calibration.commandRaised === null || calibration.commandRaised === undefined
      ? Number.NaN
      : Number(calibration.commandRaised);
  const commandLoweredPosition =
    calibration.commandLowered === null || calibration.commandLowered === undefined
      ? Number.NaN
      : Number(calibration.commandLowered);
  if (
    !!Number.isFinite(reportedValue) &&
    !!Number.isFinite(commandValue) &&
    !!Number.isFinite(motorSpeedValue) &&
    !(Math.abs(motorSpeedValue) >= 0.5)
  ) {
    if (
      Number.isFinite(commandRaisedPosition) &&
      Math.abs(commandValue - commandRaisedPosition) <= 0.5
    ) {
      calibration.raised = Math.max(0, Math.min(100, reportedValue));
    }
    if (
      Number.isFinite(commandLoweredPosition) &&
      Math.abs(commandValue - commandLoweredPosition) <= 0.5
    ) {
      calibration.lowered = Math.max(0, Math.min(100, reportedValue));
    }
  }
  return calibration;
}
export function airerPresentationPosition(airerPosition, presentationCalibration = {}) {
  const clampedPosition = Math.max(0, Math.min(100, Number(airerPosition) || 0));
  const raisedPosition =
    presentationCalibration.raised === null || presentationCalibration.raised === undefined
      ? Number.NaN
      : Number(presentationCalibration.raised);
  const loweredPosition =
    presentationCalibration.lowered === null || presentationCalibration.lowered === undefined
      ? Number.NaN
      : Number(presentationCalibration.lowered);
  if (!Number.isFinite(raisedPosition) && !Number.isFinite(loweredPosition)) {
    return clampedPosition;
  }
  const effectiveRaised = Number.isFinite(raisedPosition) ? raisedPosition : 0;
  const effectiveLowered = Number.isFinite(loweredPosition) ? loweredPosition : 100;
  if (Math.abs(effectiveLowered - effectiveRaised) < 0.5) {
    return clampedPosition;
  } else {
    return Math.max(
      0,
      Math.min(
        100,
        ((effectiveLowered - clampedPosition) / (effectiveLowered - effectiveRaised)) * 100
      )
    );
  }
}
export function airerPresentationPositionForState(
  statePosition,
  coverStateInput,
  stateCalibration = {},
  isReversed = false
) {
  const physicalState = physicalCoverState(coverStateInput, isReversed);
  if (physicalState === "open") {
    return 100;
  } else if (physicalState === "closed") {
    return 0;
  } else {
    return airerPresentationPosition(statePosition, stateCalibration);
  }
}
export function airerReportedPosition(entityState, entityAttributes, reportedCalibration = {}) {
  const stateNumber = Number(entityState?.state);
  const attributePosition = Number(entityAttributes?.attributes?.current_position);
  const hasRaisedPosition =
    reportedCalibration.raised !== null &&
    reportedCalibration.raised !== undefined &&
    Number.isFinite(Number(reportedCalibration.raised));
  const hasLoweredPosition =
    reportedCalibration.lowered !== null &&
    reportedCalibration.lowered !== undefined &&
    Number.isFinite(Number(reportedCalibration.lowered));
  if (
    hasRaisedPosition &&
    hasLoweredPosition &&
    Math.abs(Number(reportedCalibration.lowered) - Number(reportedCalibration.raised)) >= 0.5 &&
    Number.isFinite(stateNumber)
  ) {
    return stateNumber;
  } else if (Number.isFinite(attributePosition)) {
    return attributePosition;
  } else {
    return stateNumber;
  }
}
export function airerDevicePosition(reportedPercent, deviceCalibration = {}) {
  const clampedDevicePosition = Math.max(0, Math.min(100, Number(reportedPercent) || 0));
  const commandRaised =
    deviceCalibration.commandRaised === null || deviceCalibration.commandRaised === undefined
      ? Number(deviceCalibration.raised)
      : Number(deviceCalibration.commandRaised);
  const commandLowered =
    deviceCalibration.commandLowered === null || deviceCalibration.commandLowered === undefined
      ? Number(deviceCalibration.lowered)
      : Number(deviceCalibration.commandLowered);
  if (
    !Number.isFinite(commandRaised) ||
    !Number.isFinite(commandLowered) ||
    Math.abs(commandLowered - commandRaised) < 0.5
  ) {
    return clampedDevicePosition;
  }
  const spanStart = commandRaised;
  const spanEnd = commandLowered;
  return spanEnd - (clampedDevicePosition / 100) * (spanEnd - spanStart);
}
const WATER_HEATER_DOMAINS = new Set(["switch", "select", "number", "button"]);
export function relatedWaterHeaterEntities(waterHeaterEntitiesById, waterHeaterEntityId) {
  const waterHeaterSourceEntity = waterHeaterEntitiesById.get(waterHeaterEntityId);
  if (!waterHeaterSourceEntity?.deviceId) {
    return [];
  }
  const domainOrder = new Map([
    ["switch", 0],
    ["select", 1],
    ["number", 2],
    ["button", 3]
  ]);
  return [...waterHeaterEntitiesById.values()]
    .filter(
      waterHeaterCandidate =>
        waterHeaterCandidate.entityId !== waterHeaterEntityId &&
        waterHeaterCandidate.deviceId === waterHeaterSourceEntity.deviceId &&
        WATER_HEATER_DOMAINS.has(String(waterHeaterCandidate.domain || "")) &&
        entityMetadataIsAvailable(waterHeaterCandidate)
    )
    .sort(
      (leftWaterHeaterEntity, rightWaterHeaterEntity) =>
        (domainOrder.get(leftWaterHeaterEntity.domain) ?? 99) -
          (domainOrder.get(rightWaterHeaterEntity.domain) ?? 99) ||
        String(leftWaterHeaterEntity.entityId || "").localeCompare(
          String(rightWaterHeaterEntity.entityId || "")
        )
    );
}
export function waterHeaterRelatedEntityLabel(labelComponent, entityMetadata) {
  let label = String(entityMetadata?.name || entityMetadata?.originalName || "")
    .replace(/\s+/g, " ")
    .trim();
  const parentNameCandidates = [
    ...new Set(
      [labelComponent?.originalName, labelComponent?.name]
        .map(nameCandidate =>
          String(nameCandidate || "")
            .replace(/\s+/g, " ")
            .trim()
        )
        .filter(Boolean)
    )
  ].sort((leftParentName, rightParentName) => rightParentName.length - leftParentName.length);
  for (const parentName of parentNameCandidates) {
    while (label !== parentName && label.startsWith(parentName + " ")) {
      label = label.slice(parentName.length).trim();
    }
  }
  return (
    label ||
    (String(entityMetadata?.entityId || "").split(".", 2)[1] || "扩展功能").replace(/_/g, " ")
  );
}
export function relatedCoverMotorReverseEntity(motorReverseEntitiesById, reverseEntityId) {
  const motorReverseSourceEntity = motorReverseEntitiesById.get(reverseEntityId);
  return (
    (motorReverseSourceEntity?.deviceId &&
      [...motorReverseEntitiesById.values()].find(
        motorReverseCandidate =>
          motorReverseCandidate.deviceId === motorReverseSourceEntity.deviceId &&
          ["switch", "select"].includes(String(motorReverseCandidate.domain || "")) &&
          /motor_reverse|电机反向/i.test(
            (motorReverseCandidate.entityId || "") + " " + (motorReverseCandidate.name || "")
          ) &&
          entityMetadataIsAvailable(motorReverseCandidate)
      )) ||
    null
  );
}
function stateIsTruthy(truthyStateInput) {
  const lowercasedState = String(truthyStateInput?.newState?.state ?? truthyStateInput?.state ?? "")
    .trim()
    .toLowerCase();
  return ["on", "true", "1", "enabled", "开启", "打开"].includes(lowercasedState);
}
function isCoverMotorReversed(motorEntitiesById, coverStateByEntityId, motorEntityId) {
  const motorReverseEntity = relatedCoverMotorReverseEntity(motorEntitiesById, motorEntityId);
  return (
    !!motorReverseEntity?.entityId &&
    !!stateIsTruthy(coverStateByEntityId.get(motorReverseEntity.entityId))
  );
}
export function coverMotorIsReversedForComponent(
  directionComponent,
  componentStatesByEntityId,
  componentEntitiesById,
  componentTargetEntityId
) {
  const motorDirection = directionComponent?.properties?.coverMotorDirection;
  if (motorDirection === "normal") {
    return false;
  } else {
    return motorDirection === "reversed";
  }
}
export function physicalCoverState(stateInput, reverseOverride = false) {
  const stateName = String(stateInput || "");
  return (
    (reverseOverride &&
      {
        open: "closed",
        closed: "open",
        opening: "closing",
        closing: "opening"
      }[stateName]) ||
    stateName
  );
}
export function coverPresentationState(presentationStateInput, isReversedOverride = false) {
  const stateObject = presentationStateInput?.newState || presentationStateInput || {};
  const presentedState = physicalCoverState(stateObject.state, isReversedOverride);
  if (presentedState === "opening" || presentedState === "closing") {
    return presentedState;
  }
  const statePositionPercent = coverPositionPercent(stateObject);
  if (statePositionPercent === null) {
    return presentedState;
  } else if (
    (isReversedOverride ? 100 - statePositionPercent : statePositionPercent) <= PERCENT_EPSILON
  ) {
    return "closed";
  } else {
    return "open";
  }
}
function resolvedCoverState(physicalStateInput, motorReversed = false) {
  const coverStateObject = physicalStateInput?.newState || physicalStateInput || {};
  return physicalCoverState(coverStateObject.state, motorReversed);
}
export function dreamCurtainBladeLabel(bladePosition) {
  const clampedBladePosition = Math.max(0, Math.min(100, Number(bladePosition) || 0));
  if (clampedBladePosition <= PERCENT_EPSILON) {
    return "一侧闭合";
  } else if (clampedBladePosition >= 100 - PERCENT_EPSILON) {
    return "反向闭合";
  } else if (Math.abs(clampedBladePosition - 50) <= 2) {
    return "90°打开";
  } else {
    return Math.round(clampedBladePosition * 1.8) + "°";
  }
}
export function dreamCurtainStatusText(coverStateName, bladeAngle, reverseFlag = false) {
  const resolvedPhysicalState = physicalCoverState(coverStateName, reverseFlag);
  return (
    "整体：" +
    ({
      open: "开启",
      closed: "关闭",
      opening: "正在开启",
      closing: "正在关闭"
    }[resolvedPhysicalState] || "未知") +
    " · 叶片：" +
    dreamCurtainBladeLabel(bladeAngle)
  );
}
export function dreamCurtainStatusFromRetraction(isRetracting, isMoving, bladePercent) {
  return (
    "整体：" +
    (isMoving ? (isRetracting ? "正在开启" : "正在关闭") : isRetracting ? "开启" : "关闭") +
    " · 叶片：" +
    dreamCurtainBladeLabel(bladePercent)
  );
}
export function dreamCurtainIsRetracted(retractionStateInput, retractionReversed = false) {
  const retractedState = physicalCoverState(retractionStateInput, retractionReversed);
  return retractedState === "open" || retractedState === "opening";
}
export function dreamCurtainToggleService(isRetracted, openService, closeService) {
  if (isRetracted) {
    return closeService;
  } else {
    return openService;
  }
}
export function coverToggleServiceForComponent(
  toggleComponent,
  stateByEntityId,
  componentEntitiesByIdLookup,
  componentEntityId
) {
  const componentEntity = componentEntitiesByIdLookup.get(componentEntityId);
  const isMotorReversed = coverMotorIsReversedForComponent(
    toggleComponent,
    stateByEntityId,
    componentEntitiesByIdLookup,
    componentEntityId
  );
  const presentationState = coverComponentIsDream(
    toggleComponent,
    componentEntityId,
    componentEntity,
    stateByEntityId
  )
    ? resolvedCoverState(componentEntity, isMotorReversed)
    : coverPresentationState(componentEntity, isMotorReversed);
  if (presentationState === "open" || presentationState === "opening") {
    if (isMotorReversed) {
      return "open_cover";
    } else {
      return "close_cover";
    }
  } else if (isMotorReversed) {
    return "close_cover";
  } else {
    return "open_cover";
  }
}
