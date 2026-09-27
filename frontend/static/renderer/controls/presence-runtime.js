/**
 * 人体感应控件的状态映射与动画相位计算：把 binary_sensor / device_tracker / 传感器 /
 */
import { entitySearchTextOf } from "../../utils/entities.js?v=2609271226";
import { resolveStateEntry } from "../../utils/state-entry.js?v=2609271226";

/**
 * 把带单位的时长状态换算成秒。
 * @returns {number|null} 秒数；状态不是非负有限数时返回 null（表示「这条信息不可用」）。
 */
function durationSecondsFromState(stateEntity, defaultUnit = "s") {
  const entityState = resolveStateEntry(stateEntity) || {};
  const rawSeconds = Number(entityState.state);
  if (!Number.isFinite(rawSeconds) || rawSeconds < 0) {
    return null;
  }
  const unit = String(entityState.attributes?.unit_of_measurement || defaultUnit)
    .trim()
    .toLowerCase();
  if (["min", "minute", "minutes", "分钟"].includes(unit)) {
    return rawSeconds * 60;
  } else if (["h", "hr", "hour", "hours", "小时"].includes(unit)) {
    return rawSeconds * 3600;
  } else {
    return rawSeconds;
  }
}
/**
 * 找出同一设备上用于判断「多久没动就该走人」的两个传感器：timeout 是自定义超时无人移动时间
 */
function findMotionCompanionSensors(entitiesById, targetEntityId) {
  const entityMetadata = entitiesById?.get?.(targetEntityId);
  if (!entityMetadata?.deviceId) {
    return {
      timeout: null,
      noMotion: null
    };
  }
  const deviceSensorEntities = [...entitiesById.values()].filter(
    candidateSensor =>
      candidateSensor.deviceId === entityMetadata.deviceId &&
      candidateSensor.domain === "sensor" &&
      candidateSensor.status !== "missing" &&
      !candidateSensor.disabledBy
  );
    // 同设备、sensor 域、且可用，缩小到这个小范围后再按名称匹配。
  const timeoutSensor =
    deviceSensorEntities.find(timeoutCandidate =>
      /custom[_ -]?no[_ -]?motion[_ -]?time|no[_ -]?motion[_ -]?timeout|自定义超时无人移动时间/i.test(
        entitySearchTextOf(timeoutCandidate)
      )
    ) || null;
    // 模式与上面一致，只是换成「无移动持续时间」的口径。
  const noMotionSensor =
    deviceSensorEntities.find(noMotionCandidate =>
      /no[_ -]?motion[_ -]?duration|无移动状态持续时间/i.test(entitySearchTextOf(noMotionCandidate))
    ) || null;
  return {
    timeout: timeoutSensor,
    noMotion: noMotionSensor
  };
}
/**
 * 解析 event 型人体感应实体的超时配置：event.* 只有瞬时事件（motion / no_motion），
 * @returns {object} 含 motionEvent 标志、解析出的超时秒数与伴随实体 ID 列表的配置。
 */
export function presenceMotionEventConfig(
  entityId,
  eventState = null,
  entityRegistry = new Map(),
  statesByEntityId = new Map(),
  eventOptions = {}
) {
  const registryEntry = entityRegistry?.get?.(entityId) || {};
  const stateObject = resolveStateEntry(eventState) || {};
  const searchText = entitySearchTextOf(
    { ...registryEntry, entityId: entityId },
    stateObject.attributes?.device_class,
    stateObject.attributes?.event_type
  );
  if (
    !String(entityId || "").startsWith("event.") ||
    !/motion|occupancy|presence|pir|moving|移动|运动|人体|有人/i.test(searchText)
  ) {
    return {
      entityId: entityId,
      motionEvent: false,
      motionTimeoutSeconds: null,
      noMotionSeconds: null,
      noMotionStateTimestamp: null,
      companionEntityIds: []
    };
  }
    // 超时取值优先级：伴随传感器读数 → 调用方配置 → 60 秒兜底；
  const companionSensors = findMotionCompanionSensors(entityRegistry, entityId);
  const optionsTimeoutSeconds = Number(eventOptions.motionTimeoutSeconds);
  const timeoutState = companionSensors.timeout?.entityId
    ? statesByEntityId?.get?.(companionSensors.timeout.entityId)
    : null;
  const timeoutSeconds = durationSecondsFromState(timeoutState, "min");
  const resolvedTimeoutSeconds = Math.max(
    1,
    Math.min(
      3600,
      Number.isFinite(timeoutSeconds) && timeoutSeconds > 0
        ? timeoutSeconds
        : Number.isFinite(optionsTimeoutSeconds) && optionsTimeoutSeconds > 0
          ? optionsTimeoutSeconds
          : 60
    )
  );
  const noMotionState = companionSensors.noMotion?.entityId
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
      companionSensors.noMotion?.entityId
    ].filter(Boolean)
  };
}
/**
 * 把任意状态映射成统一的人体感应展示结果。
 */
export function presenceSensorPresentation(
  stateSource,
  overrideState = "auto",
  presentationOptions = {}
) {
    // 手动覆盖优先于一切真实状态：用户把控件锁成「有人」时不该被传感器读数改回去。
  if (overrideState === "on") {
    return {
      key: "occupied",
      label: "有人",
      active: true,
      available: true
    };
  }
  if (overrideState === "off") {
    return {
      key: "clear",
      label: "无人",
      active: false,
      available: true
    };
  }
  const rawState = resolveStateEntry(stateSource);
  if (!rawState) {
    return {
      key: "unknown",
      label: "未知",
      active: false,
      available: false
    };
  }
  const normalizedState = String(rawState.state ?? "")
    .trim()
    .toLowerCase();
    // 离线与未知必须区分：离线是设备掉线（不可用），未知是设备在但状态读不出来。
  if (normalizedState === "unavailable") {
    return {
      key: "unavailable",
      label: "离线",
      active: false,
      available: false
    };
  }
  if (
    !normalizedState ||
    normalizedState === "unknown" ||
    normalizedState === "none" ||
    normalizedState === "null"
  ) {
    return {
      key: "unknown",
      label: "未知",
      active: false,
      available: false
    };
  }
  if (
    presentationOptions.motionEvent ||
    String(presentationOptions.entityId || "").startsWith("event.")
  ) {
    // event 实体不给出 on / off，只能看 event_type；先判「无人」类事件，命中即直接返回。
    const eventType = String(rawState.attributes?.event_type || "")
      .trim()
      .toLowerCase();
    if (
      /no[_ -]?motion|motion[_ -]?(?:clear|ended)|clear|inactive|vacant|absent|not[_ -]?detected|无人|无移动|未检测到(?:移动|人体)/i.test(
        eventType
      )
    ) {
      return {
        key: "clear",
        label: "无人",
        active: false,
        available: true
      };
    }
    const motionStateTimestamp = presenceStateTimestamp(rawState);
    const nowMs = Number.isFinite(Number(presentationOptions.now))
      ? Number(presentationOptions.now)
      : Date.now();
    const motionTimeoutSeconds = Math.max(
      1,
      Number(presentationOptions.motionTimeoutSeconds) || 60
    );
    const elapsedSinceChangeMs = Number.isFinite(motionStateTimestamp)
      ? nowMs - motionStateTimestamp
      : null;
    // 「无移动持续时间」是比事件本身更权威的走人信号，但它必须比事件更新才算数
    const noMotionSeconds = Number(presentationOptions.noMotionSeconds);
    const noMotionTimestamp = Number(presentationOptions.noMotionStateTimestamp);
    const noMotionIsFresh =
      Number.isFinite(noMotionSeconds) &&
      (!Number.isFinite(motionStateTimestamp) ||
        !Number.isFinite(noMotionTimestamp) ||
        noMotionTimestamp >= motionStateTimestamp);
    if (
      (eventType
        ? !noMotionIsFresh || noMotionSeconds < motionTimeoutSeconds
        : Number.isFinite(motionStateTimestamp)) &&
      (elapsedSinceChangeMs === null ||
        (elapsedSinceChangeMs >= 0 && elapsedSinceChangeMs <= motionTimeoutSeconds * 1000))
    ) {
      return {
        key: "occupied",
        label: "有人",
        active: true,
        available: true
      };
    } else {
      return {
        key: "clear",
        label: "无人",
        active: false,
        available: true
      };
    }
  }
  if (
    ["on", "home", "true", "present", "presence", "occupied", "detected"].includes(normalizedState)
  ) {
    return {
      key: "occupied",
      label: "有人",
      active: true,
      available: true
    };
  }
  if (
    ["off", "not_home", "false", "absent", "away", "clear", "empty", "vacant"].includes(
      normalizedState
    )
  ) {
    return {
      key: "clear",
      label: "无人",
      active: false,
      available: true
    };
  }
    // 模拟量传感器（例如人体存在雷达的距离 / 能量值）没有布尔态：
  const numericState = Number(normalizedState);
  if (Number.isFinite(numericState)) {
    if (numericState > 0) {
      return {
        key: "occupied",
        label: "有人",
        active: true,
        available: true
      };
    } else {
      return {
        key: "clear",
        label: "无人",
        active: false,
        available: true
      };
    }
  } else {
    return {
      key: "unknown",
      label: "未知",
      active: false,
      available: false
    };
  }
}
/**
 * 取状态最后一次变化的毫秒时间戳。
 */
export function presenceStateTimestamp(stateRecord) {
  const resolvedState = resolveStateEntry(stateRecord) || {};
  const rawTimestamp =
    resolvedState.lastChanged ||
    resolvedState.last_changed ||
    resolvedState.updatedAt ||
    resolvedState.lastUpdated ||
    resolvedState.last_updated ||
    resolvedState.state ||
    "";
  const parsedTimestamp = Date.parse(rawTimestamp);
  if (Number.isFinite(parsedTimestamp)) {
    return parsedTimestamp;
  } else {
    return null;
  }
}
/**
 * 计算各个动画应当使用的起始相位（以负延迟表达）。
 */
export function presenceAnimationPhase(stateInput, durations = {}, animationNowMs = Date.now()) {
  const stateTimestamp = presenceStateTimestamp(stateInput);
  const elapsedMs = Number.isFinite(stateTimestamp)
    ? Math.max(0, Number(animationNowMs) - stateTimestamp)
    : 0;
  const formatDelayForPeriod = (durationSeconds, defaultSeconds) => {
    const periodMs = Math.max(0.001, Number(durationSeconds) || defaultSeconds) * 1000;
      // 取模得到「当前周期内的进度」，取负即让动画从该进度继续。
    const delayMs = Math.round(elapsedMs % periodMs);
    if (delayMs > 0) {
      return "-" + delayMs + "ms";
    } else {
      return "0ms";
    }
  };
  return {
    orbitDelay: formatDelayForPeriod(durations.orbit, 8),
    waveDelay: formatDelayForPeriod(durations.wave, 2.62),
    floorDelay: formatDelayForPeriod(durations.floor, 2.8),
    stepDelay: formatDelayForPeriod(durations.step, 0.72)
  };
}
/**
 * 把时间戳格式化成「多久之前」的中文文案。
 */
export function formatPresenceDuration(timestamp, referenceNowMs = Date.now()) {
  const timestampValue = Number(timestamp);
  if (!Number.isFinite(timestampValue)) {
    return "--";
  }
  const elapsedSeconds = Math.max(0, Math.floor((Number(referenceNowMs) - timestampValue) / 1000));
  if (elapsedSeconds < 60) {
    return "刚刚";
  }
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) {
    return elapsedMinutes + " 分钟";
  }
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    const remainingMinutes = elapsedMinutes % 60;
    if (remainingMinutes) {
      return elapsedHours + " 小时 " + remainingMinutes + " 分钟";
    } else {
      return elapsedHours + " 小时";
    }
  }
  const elapsedDays = Math.floor(elapsedHours / 24);
  const remainingHours = elapsedHours % 24;
  if (remainingHours) {
    return elapsedDays + " 天 " + remainingHours + " 小时";
  } else {
    return elapsedDays + " 天";
  }
}
export function presenceHistoryBuckets(
  historyEntries = [],
  currentState = null,
  nowTimestampMs = Date.now(),
  windowHours = 24,
  bucketCount = 48,
  bucketOptions = {}
) {
  const nowValue = Number(nowTimestampMs);
  const windowMs = Math.max(1, Number(windowHours) || 24) * 60 * 60 * 1000;
  const windowStartMs = nowValue - windowMs;
  // 先归一化成 {timestamp, state} 并丢掉时间戳解析失败的记录，后续取桶全部基于这条时间轴。
  const entries = (Array.isArray(historyEntries) ? historyEntries : [])
    .map(historyEntry => ({
      timestamp: Date.parse(historyEntry?.timestamp),
      state: {
        state: historyEntry?.value,
        lastChanged: historyEntry?.timestamp
      }
    }))
    .filter(validEntry => Number.isFinite(validEntry.timestamp))
    .sort((firstEntry, secondEntry) => firstEntry.timestamp - secondEntry.timestamp);
  const currentTimestamp = presenceStateTimestamp(currentState);
  if (currentState && Number.isFinite(currentTimestamp)) {
    entries.push({
      timestamp: currentTimestamp,
      state: resolveStateEntry(currentState)
    });
  }
  entries.sort((leftEntry, rightEntry) => leftEntry.timestamp - rightEntry.timestamp);
  const bucketStates = [];
    // 桶数夹在 1~288：288 是 24 小时按 5 分钟分桶的上限，再多画出来也看不清。
  const bucketCountClamped = Math.max(1, Math.min(288, Math.round(Number(bucketCount) || 48)));
  let entryIndex = 0;
  let previousEntry = null;
  for (let bucketIndex = 0; bucketIndex < bucketCountClamped; bucketIndex += 1) {
    const bucketEndMs = windowStartMs + (windowMs * (bucketIndex + 1)) / bucketCountClamped;
    while (entryIndex < entries.length && entries[entryIndex].timestamp <= bucketEndMs) {
      previousEntry = entries[entryIndex];
      entryIndex += 1;
    }
      // previousEntry 是本桶结束前最近的一条；桶内不传 noMotion 信息，
    const entryAtBucket = previousEntry || entries[entryIndex] || null;
    bucketStates.push(
      presenceSensorPresentation(entryAtBucket?.state, "auto", {
        ...bucketOptions,
        now: bucketEndMs,
        noMotionSeconds: null,
        noMotionStateTimestamp: null
      }).key
    );
  }
    // 最后一个桶跨越「现在」，用实时状态覆盖一次，保证最新一格永远与控件当前显示一致。
  if (currentState && bucketStates.length) {
    bucketStates[bucketStates.length - 1] = presenceSensorPresentation(currentState, "auto", {
      ...bucketOptions,
      now: nowValue
    }).key;
  }
  return bucketStates;
}
