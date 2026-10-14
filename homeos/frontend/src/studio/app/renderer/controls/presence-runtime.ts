import type { HaEntityEntry } from "@app/shared/util/ha-entity";

/**
 * HA 状态记录：一层 `{ state, attributes, lastChanged, … }`，或宿主包一层 `newState`（两处写法并存）。
 * 显式列字段，替代原先的 `any` 直穿 —— 不认识的字段读出来就是 `undefined`，不再是「随便点」。
 */
export interface PresenceStateEntry {
  state?: unknown;
  attributes?: Record<string, unknown>;
  lastChanged?: unknown;
  last_changed?: unknown;
  updatedAt?: unknown;
  lastUpdated?: unknown;
  last_updated?: unknown;
}

/** 状态来源的包裹形态（宿主 `states` 表里可能存 `{ newState }`）。 */
export interface PresenceStateWrapper {
  newState?: unknown;
}

/** 人在传感器运动事件解析所需的选项。 */
export interface PresenceEventOptions {
  /** 运动超时时间（秒）。 */
  motionTimeoutSeconds?: number | null;
}

/** 人在传感器展示状态计算所需的选项。 */
export interface PresencePresentationOptions {
  /** 触发动画的运动事件实体 id（只做真值判断，形状不定）。 */
  motionEvent?: unknown;
  entityId?: unknown;
  /** 显式注入当前时间，便于测试。 */
  now?: unknown;
  motionTimeoutSeconds?: number | null;
  noMotionSeconds?: number | null;
  noMotionStateTimestamp?: number | null;
}

/** 人形动画各段时长（秒）。 */
export interface PresenceAnimationDurations {
  orbit?: number;
  wave?: number;
  floor?: number;
  step?: number;
}

/** 人在传感器展示结果（渲染器据此上色）。 */
export interface PresencePresentationResult {
  key: string;
  label: string;
  active: boolean;
  available: boolean;
}

/** 运动事件判定结果：`motionEvent` 是判别字段 —— 命中时超时参数已解析成数值。 */
export interface PresenceMotionEventConfigInactive {
  entityId: unknown;
  motionEvent: false;
  motionTimeoutSeconds: null;
  noMotionSeconds: null;
  noMotionStateTimestamp: null;
  companionEntityIds: string[];
}

/** 运动事件命中：`motionTimeoutSeconds` 必有值（渲染器据此排重绘定时器）。 */
export interface PresenceMotionEventConfigActive {
  entityId: unknown;
  motionEvent: true;
  motionTimeoutSeconds: number;
  noMotionSeconds: number | null;
  noMotionStateTimestamp: number | null;
  companionEntityIds: string[];
}

export type PresenceMotionEventConfig =
  | PresenceMotionEventConfigInactive
  | PresenceMotionEventConfigActive;

/** 人形动画各段延迟（CSS 负延迟字符串）。 */
export interface PresenceAnimationDelays {
  orbitDelay: string;
  waveDelay: string;
  floorDelay: string;
  stepDelay: string;
}

/** 历史条目（`presenceHistoryBuckets` 入参形状）。 */
export interface PresenceHistoryEntry {
  timestamp?: unknown;
  value?: unknown;
}

/** 实体注册表条目（即时消息墙 / 人在传感器只用到这几个字段）。 */
export interface PresenceRegistryEntry {
  entityId?: string;
  name?: string;
  originalName?: string;
  translationKey?: string;
  deviceId?: string;
  domain?: string;
  status?: string;
  disabledBy?: string;
}

/** 注册表 / 状态表的最小接口：宿主可能传 Map，也可能传 undefined。 */
export interface PresenceEntityLookup {
  get?: (key: string) => unknown;
  values?: () => Iterable<unknown>;
}

/** 运动伴随传感器：超时传感器与「无移动时长」传感器。 */
export interface PresenceCompanionSensors {
  timeout: PresenceRegistryEntry | null;
  noMotion: PresenceRegistryEntry | null;
}

/** 收窄成状态记录；非对象 → null。 */
function toPresenceStateEntry(value: unknown): PresenceStateEntry | null {
  return value && typeof value === "object" ? (value as PresenceStateEntry) : null;
}

/** 收窄成注册表条目；非对象 → 空条目（调用方不必再判空）。 */
function toPresenceRegistryEntry(value: unknown): PresenceRegistryEntry {
  return value && typeof value === "object" ? (value as PresenceRegistryEntry) : {};
}

/** 取出状态记录：兼容 `newState` 包裹，保持原 `||` 回退语义。 */
function resolveStateEntry(stateOrChange: unknown): PresenceStateEntry | null {
  const wrapper = toPresenceStateEntry(stateOrChange) as PresenceStateWrapper | null;
  if (wrapper?.newState) return toPresenceStateEntry(wrapper.newState);
  return toPresenceStateEntry(stateOrChange);
}

/** 取出状态记录并保证可读（非法入参 → 空条目，替代原先的 `|| {}`）。 */
function resolveStateEntryOrEmpty(value: unknown): PresenceStateEntry {
  return resolveStateEntry(value) ?? {};
}

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
function durationSecondsFromState(stateEntity: unknown, defaultUnit = "s") {
  const entityState = resolveStateEntryOrEmpty(stateEntity),
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
function findMotionCompanionSensors(
  entitiesById: PresenceEntityLookup,
  targetEntityId: string,
): PresenceCompanionSensors {
  const entityMetadata = toPresenceRegistryEntry(entitiesById.get?.(targetEntityId));
  if (!entityMetadata.deviceId) return { timeout: null, noMotion: null };
  const deviceSensorEntities = [...(entitiesById.values?.() ?? [])]
      .map((candidateSensor) => toPresenceRegistryEntry(candidateSensor))
      .filter(
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
  entityId: string,
  eventState: unknown = null,
  entityRegistry: PresenceEntityLookup = new Map(),
  statesByEntityId: PresenceEntityLookup = new Map(),
  eventOptions: PresenceEventOptions = {},
): PresenceMotionEventConfig {
  const registryEntry = toPresenceRegistryEntry(entityRegistry?.get?.(entityId)),
    stateObject = resolveStateEntryOrEmpty(eventState),
    searchText =
      entitySearchTextOf({
        ...registryEntry,
        entityId: entityId,
      }) +
      " " +
      String(stateObject.attributes?.device_class || "") +
      " " +
      String(stateObject.attributes?.event_type || "");
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
        Number.isFinite(timeoutSeconds) && timeoutSeconds! > 0
          ? timeoutSeconds!
          : Number.isFinite(optionsTimeoutSeconds) && optionsTimeoutSeconds > 0
            ? optionsTimeoutSeconds
            : 60!,
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
    companionEntityIds: [companionSensors.timeout?.entityId, companionSensors.noMotion?.entityId].filter(
      (companionEntityId): companionEntityId is string => Boolean(companionEntityId),
    ),
  };
}
export function presenceSensorPresentation(
  stateSource: unknown,
  overrideState = "auto",
  presentationOptions: PresencePresentationOptions = {},
): PresencePresentationResult {
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
        ? nowMs - motionStateTimestamp!
        : null,
      noMotionSeconds = Number(presentationOptions.noMotionSeconds),
      noMotionTimestamp = Number(presentationOptions.noMotionStateTimestamp),
      noMotionIsFresh =
        Number.isFinite(noMotionSeconds) &&
        (!Number.isFinite(motionStateTimestamp) ||
          !Number.isFinite(noMotionTimestamp) ||
          noMotionTimestamp >= motionStateTimestamp!);
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
export function presenceStateTimestamp(stateRecord: unknown): number | null {
  const resolvedState = resolveStateEntryOrEmpty(stateRecord),
    rawTimestamp =
      resolvedState.lastChanged ||
      resolvedState.last_changed ||
      resolvedState.updatedAt ||
      resolvedState.lastUpdated ||
      resolvedState.last_updated ||
      resolvedState.state ||
      "",
    parsedTimestamp = Date.parse(String(rawTimestamp ?? ""));
  return Number.isFinite(parsedTimestamp) ? parsedTimestamp : null;
}
export function presenceAnimationPhase(
  stateInput: unknown,
  durations: PresenceAnimationDurations = {},
  animationNowMs = Date.now(),
): PresenceAnimationDelays {
  const stateTimestamp = presenceStateTimestamp(stateInput),
    elapsedMs = Number.isFinite(stateTimestamp)
      ? Math.max(0, Number(animationNowMs) - stateTimestamp!)
      : 0,
    formatDelayForPeriod = (durationSeconds: number | undefined, defaultSeconds: number) => {
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
export function formatPresenceDuration(timestamp: unknown, referenceNowMs = Date.now()): string {
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
  historyEntries: readonly PresenceHistoryEntry[] = [],
  currentState: unknown = null,
  nowTimestampMs = Date.now(),
  windowHours = 24,
  bucketCount = 48,
  bucketOptions: PresencePresentationOptions = {},
): string[] {
  const nowValue = Number(nowTimestampMs),
    windowMs = Math.max(1, Number(windowHours) || 24) * 60 * 60 * 1000,
    windowStartMs = nowValue - windowMs,
    entries = (Array.isArray(historyEntries) ? historyEntries : [])
      .map((historyEntry) => ({
        timestamp: Date.parse(String(historyEntry?.timestamp ?? "")),
        state: {
          state: historyEntry?.value,
          lastChanged: historyEntry?.timestamp,
        } as PresenceStateEntry,
      }))
      .filter((validEntry) => Number.isFinite(validEntry.timestamp))
      .sort((firstEntry, secondEntry) => firstEntry.timestamp - secondEntry.timestamp),
    currentTimestamp = presenceStateTimestamp(currentState);
  (currentState &&
    Number.isFinite(currentTimestamp) &&
    entries.push({
      timestamp: currentTimestamp!,
      state: resolveStateEntryOrEmpty(currentState),
    }),
    entries.sort((leftEntry, rightEntry) => leftEntry.timestamp - rightEntry.timestamp));
  const bucketStates: string[] = [],
    bucketCountClamped = Math.max(1, Math.min(288, Math.round(Number(bucketCount) || 48)));
  let entryIndex = 0,
    previousEntry: { timestamp: number; state: PresenceStateEntry } | null = null;
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
