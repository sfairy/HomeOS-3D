import type { HaEntityEntry } from "@app/utils/ha-entity";
function resolveStateEntry(stateOrChange) {
  return stateOrChange?.newState || stateOrChange || null;
}
/** 人在传感器运动事件解析所需的选项。 */
type PresenceEventOptions = {
  /** 运动超时时间（秒）。 */
  motionTimeoutSeconds?: number | null;
  [optionName: string]: any;
};

/** 人在传感器展示状态计算所需的选项。 */
type PresencePresentationOptions = {
  /** 触发动画的运动事件实体 id。 */
  motionEvent?: any;
  entityId?: string;
  /** 显式注入当前时间，便于测试。 */
  now?: number;
  motionTimeoutSeconds?: number | null;
  noMotionSeconds?: number | null;
  noMotionStateTimestamp?: number | null;
  [optionName: string]: any;
};

/** 人形动画各段时长（秒）。 */
type PresenceAnimationDurations = {
  orbit?: number;
  wave?: number;
  floor?: number;
  step?: number;
  [animationName: string]: any;
};

function entitySearchTextOf(entity: HaEntityEntry = {}) {
  return (
    (entity.entityId || "") +
    " " +
    (entity.name || "") +
    " " +
    (entity.originalName || "") +
    " " +
    (entity.translationKey || "")
  ).trim();
}
function durationSecondsFromState(stateEntity, defaultUnit = "s") {
  const entityState = resolveStateEntry(stateEntity) || {},
    rawSeconds = Number(entityState.state);
  if (!Number.isFinite(rawSeconds) || rawSeconds < 0) return null;
  const unit = String(entityState.attributes?.unit_of_measurement || defaultUnit)
    .trim()
    .toLowerCase();
  return ["min", "minute", "minutes", "分钟"].includes(unit)
    ? rawSeconds * 60
    : ["h", "hr", "hour", "hours", "小时"].includes(unit)
      ? rawSeconds * 3600
      : rawSeconds;
}
function findMotionCompanionSensors(entitiesById, targetEntityId) {
  const entityMetadata = entitiesById?.get?.(targetEntityId);
  if (!entityMetadata?.deviceId)
    return {
      timeout: null,
      noMotion: null,
    };
  const deviceSensorEntities = [...entitiesById.values()].filter(
      (candidateSensor) =>
        candidateSensor.deviceId === entityMetadata.deviceId &&
        candidateSensor.domain === "sensor" &&
        candidateSensor.status !== "missing" &&
        !candidateSensor.disabledBy,
    ),
    timeoutSensor =
      deviceSensorEntities.find((timeoutCandidate) =>
        /custom[_ -]?no[_ -]?motion[_ -]?time|no[_ -]?motion[_ -]?timeout|自定义超时无人移动时间/i.test(
          entitySearchTextOf(timeoutCandidate),
        ),
      ) || null,
    noMotionSensor =
      deviceSensorEntities.find((noMotionCandidate) =>
        /no[_ -]?motion[_ -]?duration|无移动状态持续时间/i.test(
          entitySearchTextOf(noMotionCandidate),
        ),
      ) || null;
  return {
    timeout: timeoutSensor,
    noMotion: noMotionSensor,
  };
}
export function presenceMotionEventConfig(
  entityId,
  eventState = null,
  entityRegistry = new Map(),
  statesByEntityId = new Map(),
  eventOptions: PresenceEventOptions = {},
) {
  const registryEntry = entityRegistry?.get?.(entityId) || {},
    stateObject = resolveStateEntry(eventState) || {},
    searchText =
      entitySearchTextOf({
        ...registryEntry,
        entityId: entityId,
      }) +
      " " +
      (stateObject.attributes?.device_class || "") +
      " " +
      (stateObject.attributes?.event_type || "");
  if (!(
    String(entityId || "").startsWith("event.") &&
    /motion|occupancy|presence|pir|moving|移动|运动|人体|有人/i.test(searchText)
  ))
    return {
      entityId: entityId,
      motionEvent: false,
      motionTimeoutSeconds: null,
      noMotionSeconds: null,
      noMotionStateTimestamp: null,
      companionEntityIds: [],
    };
  const companionSensors = findMotionCompanionSensors(entityRegistry, entityId),
    optionsTimeoutSeconds = Number(eventOptions.motionTimeoutSeconds),
    timeoutState = companionSensors.timeout?.entityId
      ? statesByEntityId?.get?.(companionSensors.timeout.entityId)
      : null,
    timeoutSeconds = durationSecondsFromState(timeoutState, "min"),
    resolvedTimeoutSeconds = Math.max(
      1,
      Math.min(
        3600,
        Number.isFinite(timeoutSeconds) && timeoutSeconds > 0
          ? timeoutSeconds
          : Number.isFinite(optionsTimeoutSeconds) && optionsTimeoutSeconds > 0
            ? optionsTimeoutSeconds
            : 60,
      ),
    ),
    noMotionState = companionSensors.noMotion?.entityId
      ? statesByEntityId?.get?.(companionSensors.noMotion.entityId)
      : null;
  return {
    entityId: entityId,
    motionEvent: true,
    motionTimeoutSeconds: resolvedTimeoutSeconds,
    noMotionSeconds: durationSecondsFromState(noMotionState),
    noMotionStateTimestamp: presenceStateTimestamp(noMotionState),
    companionEntityIds: [
      companionSensors.timeout?.entityId,
      companionSensors.noMotion?.entityId,
    ].filter(Boolean),
  };
}
export function presenceSensorPresentation(
  stateSource,
  overrideState = "auto",
  presentationOptions: PresencePresentationOptions = {},
) {
  if (overrideState === "on")
    return {
      key: "occupied",
      label: "有人",
      active: true,
      available: true,
    };
  if (overrideState === "off")
    return {
      key: "clear",
      label: "无人",
      active: false,
      available: true,
    };
  const rawState = resolveStateEntry(stateSource);
  if (!rawState)
    return {
      key: "unknown",
      label: "未知",
      active: false,
      available: false,
    };
  const normalizedState = String(rawState.state ?? "")
    .trim()
    .toLowerCase();
  if (normalizedState === "unavailable")
    return {
      key: "unavailable",
      label: "离线",
      active: false,
      available: false,
    };
  if (
    !normalizedState ||
    normalizedState === "unknown" ||
    normalizedState === "none" ||
    normalizedState === "null"
  )
    return {
      key: "unknown",
      label: "未知",
      active: false,
      available: false,
    };
  if (
    presentationOptions.motionEvent ||
    String(presentationOptions.entityId || "").startsWith("event.")
  ) {
    const eventType = String(rawState.attributes?.event_type || "")
      .trim()
      .toLowerCase();
    if (
      /no[_ -]?motion|motion[_ -]?(?:clear|ended)|clear|inactive|vacant|absent|not[_ -]?detected|无人|无移动|未检测到(?:移动|人体)/i.test(
        eventType,
      )
    )
      return {
        key: "clear",
        label: "无人",
        active: false,
        available: true,
      };
    const motionStateTimestamp = presenceStateTimestamp(rawState),
      nowMs = Number.isFinite(Number(presentationOptions.now))
        ? Number(presentationOptions.now)
        : Date.now(),
      motionTimeoutSeconds = Math.max(1, Number(presentationOptions.motionTimeoutSeconds) || 60),
      rawElapsedSinceChangeMs = Number.isFinite(motionStateTimestamp)
        ? nowMs - motionStateTimestamp
        : null,
      noMotionSeconds = Number(presentationOptions.noMotionSeconds),
      noMotionTimestamp = Number(presentationOptions.noMotionStateTimestamp),
      noMotionIsFresh =
        Number.isFinite(noMotionSeconds) &&
        (!Number.isFinite(motionStateTimestamp) ||
          !Number.isFinite(noMotionTimestamp) ||
          noMotionTimestamp >= motionStateTimestamp);
    return (eventType
      ? !noMotionIsFresh || noMotionSeconds < motionTimeoutSeconds
      : Number.isFinite(motionStateTimestamp)) &&
      (rawElapsedSinceChangeMs === null ||
        (rawElapsedSinceChangeMs >= 0 && rawElapsedSinceChangeMs <= motionTimeoutSeconds * 1000))
      ? {
          key: "occupied",
          label: "有人",
          active: true,
          available: true,
        }
      : {
          key: "clear",
          label: "无人",
          active: false,
          available: true,
        };
  }
  if (
    ["on", "home", "true", "present", "presence", "occupied", "detected"].includes(normalizedState)
  )
    return {
      key: "occupied",
      label: "有人",
      active: true,
      available: true,
    };
  if (
    ["off", "not_home", "false", "absent", "away", "clear", "empty", "vacant"].includes(
      normalizedState,
    )
  )
    return {
      key: "clear",
      label: "无人",
      active: false,
      available: true,
    };
  const numericState = Number(normalizedState);
  return Number.isFinite(numericState)
    ? numericState > 0
      ? {
          key: "occupied",
          label: "有人",
          active: true,
          available: true,
        }
      : {
          key: "clear",
          label: "无人",
          active: false,
          available: true,
        }
    : {
        key: "unknown",
        label: "未知",
        active: false,
        available: false,
      };
}
export function presenceStateTimestamp(stateRecord) {
  const resolvedState = resolveStateEntry(stateRecord) || {},
    rawTimestamp =
      resolvedState.lastChanged ||
      resolvedState.last_changed ||
      resolvedState.updatedAt ||
      resolvedState.lastUpdated ||
      resolvedState.last_updated ||
      resolvedState.state ||
      "",
    parsedTimestamp = Date.parse(rawTimestamp);
  return Number.isFinite(parsedTimestamp) ? parsedTimestamp : null;
}
export function presenceAnimationPhase(
  stateInput,
  durations: PresenceAnimationDurations = {},
  animationNowMs = Date.now(),
) {
  const stateTimestamp = presenceStateTimestamp(stateInput),
    elapsedMs = Number.isFinite(stateTimestamp)
      ? Math.max(0, Number(animationNowMs) - stateTimestamp)
      : 0,
    formatDelayForPeriod = (durationSeconds, defaultSeconds) => {
      const periodMs = Math.max(0.001, Number(durationSeconds) || defaultSeconds) * 1000,
        delayMs = Math.round(elapsedMs % periodMs);
      return delayMs > 0 ? "-" + delayMs + "ms" : "0ms";
    };
  return {
    orbitDelay: formatDelayForPeriod(durations.orbit, 8),
    waveDelay: formatDelayForPeriod(durations.wave, 2.62),
    floorDelay: formatDelayForPeriod(durations.floor, 2.8),
    stepDelay: formatDelayForPeriod(durations.step, 0.72),
  };
}
export function formatPresenceDuration(timestamp, referenceNowMs = Date.now()) {
  const timestampValue = Number(timestamp);
  if (!Number.isFinite(timestampValue)) return "--";
  const elapsedSeconds = Math.max(0, Math.floor((Number(referenceNowMs) - timestampValue) / 1000));
  if (elapsedSeconds < 60) return "刚刚";
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return elapsedMinutes + " 分钟";
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    const remainingMinutes = elapsedMinutes % 60;
    return remainingMinutes
      ? elapsedHours + " 小时 " + remainingMinutes + " 分钟"
      : elapsedHours + " 小时";
  }
  const elapsedDays = Math.floor(elapsedHours / 24),
    remainingHours = elapsedHours % 24;
  return remainingHours ? elapsedDays + " 天 " + remainingHours + " 小时" : elapsedDays + " 天";
}
export function presenceHistoryBuckets(
  historyEntries = [],
  currentState = null,
  nowTimestampMs = Date.now(),
  windowHours = 24,
  bucketCount = 48,
  bucketOptions = {},
) {
  const nowValue = Number(nowTimestampMs),
    windowMs = Math.max(1, Number(windowHours) || 24) * 60 * 60 * 1000,
    windowStartMs = nowValue - windowMs,
    entries = (Array.isArray(historyEntries) ? historyEntries : [])
      .map((historyEntry) => ({
        timestamp: Date.parse(historyEntry?.timestamp),
        state: {
          state: historyEntry?.value,
          lastChanged: historyEntry?.timestamp,
        },
      }))
      .filter((validEntry) => Number.isFinite(validEntry.timestamp))
      .sort((firstEntry, secondEntry) => firstEntry.timestamp - secondEntry.timestamp),
    currentTimestamp = presenceStateTimestamp(currentState);
  (currentState &&
    Number.isFinite(currentTimestamp) &&
    entries.push({
      timestamp: currentTimestamp,
      state: resolveStateEntry(currentState),
    }),
    entries.sort((leftEntry, rightEntry) => leftEntry.timestamp - rightEntry.timestamp));
  const bucketStates = [],
    bucketCountClamped = Math.max(1, Math.min(288, Math.round(Number(bucketCount) || 48)));
  let entryIndex = 0,
    previousEntry = null;
  for (let bucketIndex = 0; bucketIndex < bucketCountClamped; bucketIndex += 1) {
    const bucketEndMs = windowStartMs + (windowMs * (bucketIndex + 1)) / bucketCountClamped;
    for (; entryIndex < entries.length && entries[entryIndex].timestamp <= bucketEndMs;)
      ((previousEntry = entries[entryIndex]), (entryIndex += 1));
    const entryAtBucket = previousEntry || entries[entryIndex] || null;
    bucketStates.push(
      presenceSensorPresentation(entryAtBucket?.state, "auto", {
        ...bucketOptions,
        now: bucketEndMs,
        noMotionSeconds: null,
        noMotionStateTimestamp: null,
      }).key,
    );
  }
  return (
    currentState &&
      bucketStates.length &&
      (bucketStates[bucketStates.length - 1] = presenceSensorPresentation(currentState, "auto", {
        ...bucketOptions,
        now: nowValue,
      }).key),
    bucketStates
  );
}
