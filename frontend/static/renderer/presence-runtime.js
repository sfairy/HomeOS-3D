/**
 * 人体感应控件的状态映射与动画相位计算。
 *
 * 职责：把五花八门的有人 / 无人实体（binary_sensor 的 on/off、device_tracker 的 home/not_home、
 * 传感器的数值、event 实体的 event_type）统一映射成四态展示；
 * 并给出「已持续多久」的文案与让 CSS 动画接着时间轴播放的负延迟。
 *
 * 位置：纯计算模块，被 interaction3d 的人体感应图层与编辑器预览共用；不碰网络与 DOM。
 *
 * 约定：返回的 key 只有 occupied / clear / unknown / unavailable 四种，
 * 界面文案（有人 / 无人 / 未知 / 离线）与 key 一一对应且会直接上屏。
 *
 * 依赖：关键词检索文本走 `utils/entities.js` 的 `entitySearchTextOf`（P10 B 类收敛）。
 * 本文件原先自带一份 `entitySearchText`（四个固定字段、保留原大小写），与
 * `device-profiles.js` / `home.js` 里那两份口径不同；现在三处共用一份（小写 + 单空格）。
 * 本文件的匹配正则全部带 `i`，所以小写化不影响命中；空段压成单空格只可能把
 * `no  motion` 补成 `no motion`，方向上是少漏判、不会多漏判。
 *
 * 依赖：状态条目归一走 `utils/state-entry.js` 的 `resolveStateEntry`（P10 第六批收敛）。
 * 本文件原先那份 `resolveEventState` 与 `registry.js` 的 `resolveStateEntry`、
 * `vacuum-runtime.js` 的 `unwrapStateChange` 是同一份知识，只是名字各不相同。
 */
import { entitySearchTextOf } from "../utils/entities.js?v=20260919093705";
import { resolveStateEntry } from "../utils/state-entry.js?v=20260919093705";

/**
 * 把带单位的时长状态换算成秒。
 *
 * @param {object} stateEntity 状态对象或变更对象。
 * @param {string} [defaultUnit] 状态里没写单位时的默认单位。
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
 * 找出同一设备上用于判断「多久没动就该走人」的两个传感器。
 *
 * 两类：
 * - timeout：自定义超时无人移动时间，直接给出该等多久（单位通常为分钟）；
 * - noMotion：无移动状态持续时间，给出「已经多久没动」的实时读数。
 * 两者的实体命名在各厂商固件里差异很大，只能按名称正则匹配，匹配不到就返回 null。
 *
 * @param {Map<string, object>} entitiesById 实体元数据索引。
 * @param {string} targetEntityId 人体感应主实体 ID。
 * @returns {{timeout: object|null, noMotion: object|null}} 两个可选伴随传感器。
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
 * 解析 event 型人体感应实体的超时配置。
 *
 * event.* 实体本身只有瞬时事件（motion / no_motion），不携带「持续多久」的信息，
 * 所以必须从伴随传感器或调用方配置里取回超时，否则界面无从判断当前是否仍算有人。
 *
 * @param {string} entityId 实体 ID。
 * @param {object} [eventState] 状态对象或变更对象。
 * @param {Map<string, object>} [entityRegistry] 实体元数据索引。
 * @param {Map<string, object>} [statesByEntityId] 状态索引。
 * @param {object} [eventOptions] 调用方配置，motionTimeoutSeconds 作为第二优先级的超时来源。
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
    // 判定条件同时看实体 ID 前缀（必须是 event.）、实体命名与状态自带的 device_class / event_type，
    // 三者任一方向命中即可，目的是尽量不把确实是人体感应的实体漏掉。
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
    // 最后再夹到 1~3600 秒，防止上游给出 0 或极大值把界面卡死。
  const companionSensors = findMotionCompanionSensors(entityRegistry, entityId);
  const optionsTimeoutSeconds = Number(eventOptions.motionTimeoutSeconds);
  const timeoutState = companionSensors.timeout?.entityId
    ? statesByEntityId?.get?.(companionSensors.timeout.entityId)
    : null;
  const timeoutSeconds = durationSecondsFromState(timeoutState, "min");
    // 上界一小时：超过一小时的「有人」判断在居家场景里没有意义，只会让状态永远停在有人。
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
 *
 * 判定顺序固定，且每一步都是「先返回」：手动覆盖 → 无状态 → 离线 → 未知态 → event 分支 →
 * 通用布尔态列表 → 数值兜底。顺序即优先级，改动会影响已有页面的显示。
 *
 * @param {object} stateSource 状态对象或变更对象。
 * @param {string} [overrideState] 手动覆盖：on / off 时忽略真实状态；其余（含 auto）按状态判定。
 * @param {object} [presentationOptions] 展示选项：motionEvent、entityId、now、
 *   motionTimeoutSeconds、noMotionSeconds、noMotionStateTimestamp。
 * @returns {{key: string, label: string, active: boolean, available: boolean}}
 *   key 为 occupied / clear / unknown / unavailable，label 为对应中文文案。
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
    //（noMotionIsFresh），否则会拿上一次的旧读数误判。
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
    // 大于 0 视为有人，等于 0 视为无人，非数值才是未知。
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
 *
 * 字段名在各数据来源之间不统一（HA 原生用 last_changed，本地缓存用 updatedAt / lastUpdated），
 * 因此逐个尝试；都不合法时返回 null，调用方据此放弃「已持续多久」的展示。
 *
 * @param {object} stateRecord 状态对象或变更对象。
 * @returns {number|null} 毫秒时间戳或 null。
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
 *
 * 原理：CSS 动画如果从头播放，每次重新渲染都会从 0 开始，看起来像是「人刚出现」。
 * 用负的 animation-delay 等于把动画快进到「按状态时间戳算，现在本该在的位置」，
 * 于是重渲染后依然是连续的画面。
 *
 * @param {object} stateInput 状态对象或变更对象。
 * @param {object} [durations] 各动画的周期（秒）：orbit / wave / floor / step。
 * @param {number} [animationNowMs] 当前时间戳，便于测试注入。
 * @returns {{orbitDelay: string, waveDelay: string, floorDelay: string, stepDelay: string}}
 *   CSS 可用的延迟字符串（形如 -1234ms 或 0ms）。
 */
export function presenceAnimationPhase(stateInput, durations = {}, animationNowMs = Date.now()) {
  const stateTimestamp = presenceStateTimestamp(stateInput);
  const elapsedMs = Number.isFinite(stateTimestamp)
    ? Math.max(0, Number(animationNowMs) - stateTimestamp)
    : 0;
  /**
   * 把「已经过去了多久」折算成一个周期的进度，用 CSS 负延迟表达。
   *
   * @param {number|undefined} durationSeconds 该动画的周期（秒），缺失时用 defaultSeconds。
   * @param {number} defaultSeconds 周期兜底值（秒），与控件默认动画配置保持一致。
   * @returns {string} CSS 可用的延迟字符串，形如 `-1234ms` 或 `0ms`。
   */
  const formatDelayForPeriod = (durationSeconds, defaultSeconds) => {
    const periodMs = Math.max(0.001, Number(durationSeconds) || defaultSeconds) * 1000;
      // 取模得到「当前周期内的进度」，取负即让动画从该进度继续。
      // 周期下限 0.001 秒是为了避免上游传 0 时出现除零 / NaN。
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
 *
 * 档位：不足 1 分钟 → 刚刚；不足 1 小时 → N 分钟；不足 1 天 → N 小时 [M 分钟]；
 * 再往上 → N 天 [M 小时]。有较小单位时一并带上，读数更直观。
 *
 * @param {number} timestamp 起始时间戳（毫秒）。
 * @param {number} [referenceNowMs] 参照时刻，便于测试注入。
 * @returns {string} 中文时长文案；时间戳非法时返回 --。
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
/**
 * 把历史记录压成等宽的桶，得到一串用于绘制时间条的状态 key。
 *
 * 每个桶取「桶结束时刻之前最近一条记录」的状态，也就是该时段内的既成事实；
 * 完全没有历史时退化为取下一条记录（前向填充），保证桶不会莫名空着。
 *
 * @param {Array<object>} [historyEntries] 历史记录，每项含 timestamp 与 value。
 * @param {object} [currentState] 当前状态，用于修正最后一个桶。
 * @param {number} [nowTimestampMs] 当前时间戳。
 * @param {number} [windowHours] 时间窗口（小时）。
 * @param {number} [bucketCount] 桶数量。
 * @param {object} [bucketOptions] 透传给 presenceSensorPresentation 的选项。
 * @returns {string[]} 每个桶的状态 key 数组，长度等于归一化后的桶数量。
 */
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
      // 否则历史桶会随时间推移而变化，无法稳定渲染。
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
