/**
 * 即时消息墙运行时逻辑（纯函数，不依赖 DOM）
 *
 * - 控制类实体域白名单（EVENT_LOG_OVERLAY_DOMAINS）；
 * - 各域「控制 / 设定类」属性白名单与属性变更文案（control-attr-change.util）；
 * - state 变更文案解析与事件指纹（用于窗口期去重）；
 * - 状态颜色分类、展示条目模型与「实体 + 标签」去重缓冲。
 */

/** 即时消息墙监听的控制类实体域（与源 EVENT_LOG_OVERLAY_DOMAINS 对齐）。 */
export const EVENT_LOG_WALL_DOMAINS = [
  "light",
  "switch",
  "fan",
  "climate",
  "binary_sensor",
  "lock",
  "cover",
  "media_player",
  "vacuum",
  "water_heater",
  "alarm_control_panel",
] as const;

const EVENT_LOG_WALL_DOMAIN_SET = new Set<string>(EVENT_LOG_WALL_DOMAINS);

/** 相同事件指纹 / 相同「实体 + 标签」的去重时间窗（毫秒）。 */
const EVENT_LOG_WALL_DEDUP_MS = 2000;

/** 去重表容量上限，超过后清理过期键，避免内存无限增长。 */
const EVENT_LOG_WALL_DEDUP_MAX_KEYS = 200;

/** 自动监听模式下最多订阅的实体数量（避免逼近渲染器 1000 订阅上限）。 */
export const EVENT_LOG_WALL_AUTO_ENTITY_LIMIT = 400;

/**
 * 即时消息墙的实体引用：宿主既传字符串 id，也传对象，且两种字段名（`entityId` / `entity_id`）并存。
 * 这里写成显式形状，替代原先三处 `as any` 直穿 —— 非法形状会在下面两个收窄点被挡掉。
 */
interface EventLogEntityRef {
  entityId?: unknown;
  entity_id?: unknown;
  domain?: unknown;
}

/** 把未知入参收窄成实体引用：非对象一律当空引用处理。 */
function toEventLogEntityRef(value: unknown): EventLogEntityRef {
  return value !== null && typeof value === "object" ? (value as EventLogEntityRef) : {};
}

/** 取第一个非空字符串字段（`entityId` / `entity_id` 两种写法混用，按声明顺序兜底）。 */
function firstEntityRefText(source: EventLogEntityRef, keys: readonly (keyof EventLogEntityRef)[]): string {
  for (const key of keys) {
    const raw = source[key];
    if (typeof raw === "string" && raw) return raw;
  }
  return "";
}

/** 从实体对象或实体 id 解析域名（对象优先取显式 `domain`，否则取 id 前缀）。 */
function eventLogWallDomainOf(entityRef: unknown): string {
  if (typeof entityRef === "string") {
    return entityRef.split(".", 1)[0].toLowerCase();
  }
  const ref = toEventLogEntityRef(entityRef);
  const declaredDomain = firstEntityRefText(ref, ["domain"]).trim().toLowerCase();
  if (declaredDomain) return declaredDomain;
  return firstEntityRefText(ref, ["entityId", "entity_id"]).split(".", 1)[0].toLowerCase();
}

/** 该实体是否属于即时消息墙监听的域。 */
export function isEventLogWallDomain(entityRef: unknown): boolean {
  return EVENT_LOG_WALL_DOMAIN_SET.has(eventLogWallDomainOf(entityRef));
}

/**
 * 属性白名单与「首处变更 → 文案」的控制流**只在** `@/shared/entity/utils/control-attr-change.util` 一份：
 * 本文件此前抄了同一张 `ATTR_CHANGE_TRIGGERS` / `ATTR_CHANGE_LABELS` 与同一段循环（文件头注释也写着
 * 「与源保持一致」），任一边改动就会分叉。这里改为注入本文件自己的紧凑值格式化口径。
 */
import {
  ATTR_CHANGE_TRIGGERS,
  describeAttrChange as describeAttrChangeCore,
} from "@/shared/entity/utils/control-attr-change.util";

/** 该域是否有属性白名单（无 → 共享实现必返回 null，可提前跳过 JSON 深比较）。 */
function hasEventLogAttrTriggers(domain: string): boolean {
  return Boolean(ATTR_CHANGE_TRIGGERS[domain]);
}

/** 常见枚举属性值 → 中文标签。 */
const ATTR_VALUE_LABELS: Record<string, string> = {
  auto: "自动",
  high: "高",
  medium: "中",
  middle: "中",
  low: "低",
  silent: "静音",
  strong: "强力",
  on: "开",
  off: "关",
  cool: "制冷",
  heat: "制热",
  heat_cool: "自动",
  dry: "除湿",
  fan_only: "送风",
  horizontal: "水平",
  vertical: "垂直",
  both: "双向",
  swing: "摆动",
  open: "打开",
  closed: "关闭",
  opening: "打开中",
  closing: "关闭中",
  locked: "已上锁",
  unlocked: "已解锁",
};

/** HA state 值 → 中文短标签。 */
const STATE_LABELS: Record<string, string> = {
  on: "开启",
  off: "关闭",
  open: "打开",
  closed: "关闭",
  opening: "打开中",
  closing: "关闭中",
  locked: "已上锁",
  unlocked: "已解锁",
  locking: "上锁中",
  unlocking: "解锁中",
  jammed: "卡住",
  playing: "播放中",
  paused: "已暂停",
  idle: "空闲",
  standby: "待机",
  docked: "已回充",
  cleaning: "清扫中",
  returning: "返回中",
  error: "异常",
  unavailable: "不可用",
  unknown: "未知",
  detected: "检测到",
  clear: "正常",
  wet: "潮湿",
  home: "在家",
  not_home: "离家",
  heating: "制热",
  cooling: "制冷",
  drying: "除湿",
  fan: "送风",
  heat: "制热",
  cool: "制冷",
  dry: "除湿",
  fan_only: "送风",
  auto: "自动",
  heat_cool: "自动",
  triggered: "已触发",
  armed_away: "离家布防",
  armed_home: "在家布防",
  armed_night: "夜间布防",
  disarmed: "已撤防",
};

/** state 值 → 中文短标签。 */
function resolveEventLogStateLabel(state: unknown): string {
  const normalizedState = String(state ?? "")
    .trim()
    .toLowerCase();
  if (!normalizedState) return "";
  return STATE_LABELS[normalizedState] || String(state ?? "");
}

/** 把属性原始值格式化为可读文案。 */
function formatAttrValueText(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "开" : "关";
  if (Array.isArray(value)) {
    const numericValues = value.filter((entry) => typeof entry === "number");
    if (numericValues.length === value.length && numericValues.length >= 2)
      return String(key).includes("color") || key === "rgb_color" || key === "hs_color"
        ? "自定义"
        : numericValues.join(", ");
    return value.map((entry) => String(entry)).join(", ");
  }
  if (typeof value === "number") {
    if (key === "volume_level") return Math.round(value * 100) + "%";
    if (key === "color_temp_kelvin") return Math.round(value) + "K";
    if (key === "brightness") return Math.round(value) + "/255";
    if (["percentage", "current_position", "current_tilt_position"].includes(key))
      return Math.round(value) + "%";
    if (key === "humidity") return Math.round(value) + "%";
    if (String(key).includes("temperature")) return roundNumber(value) + "°C";
    return String(roundNumber(value));
  }
  const text = String(value).trim();
  return ATTR_VALUE_LABELS[text.toLowerCase()] || text;
}

function roundNumber(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 比较新旧属性，返回首个变化的控制属性描述（如「风速 自动 → 高」）。
 * 白名单与控制流复用共享实现，仅注入本文件的紧凑值格式化口径；无白名单域 / 无变化返回 null。
 */
function describeEventLogAttrChange(
  entityId: string,
  oldAttributes: Record<string, unknown> | undefined | null,
  newAttributes: Record<string, unknown> | undefined | null,
): string | null {
  if (!hasEventLogAttrTriggers(eventLogWallDomainOf(entityId))) return null;
  return describeAttrChangeCore(
    entityId,
    oldAttributes ?? undefined,
    newAttributes ?? undefined,
    formatAttrValueText,
  );
}

/** 状态快照最小形状：运行时 states Map 中可能包裹一层 newState。 */
type StateSnapshot = { state?: unknown; attributes?: Record<string, unknown> } | null | undefined;

/** 运行时状态记录：宿主两处写法并存 —— 直接一层 `state`，或包一层 `newState`。 */
interface StateRecordEntry {
  newState?: unknown;
  state?: unknown;
  attributes?: Record<string, unknown>;
}

/** 把未知入参收窄成状态记录（非对象 → null，不再 `as any` 直穿）。 */
function toStateRecordEntry(value: unknown): StateRecordEntry | null {
  return value !== null && typeof value === "object" ? (value as StateRecordEntry) : null;
}

/** 从运行时状态记录中取出真正的状态快照（兼容 `{ newState }` 包裹）。 */
export function resolveStateSnapshot(stateEntry: unknown): StateSnapshot {
  const entry = toStateRecordEntry(stateEntry);
  if (!entry) return null;
  const wrapped = toStateRecordEntry(entry.newState);
  if (wrapped) return wrapped;
  return { state: entry.state, attributes: entry.attributes };
}

/** 状态变更解析结果。 */
interface EventLogStateChangeResolved {
  state: string;
  attrText: string | null;
  label: string;
}

/**
 * 解析实体状态变更文案：
 * - state 未变但控制属性变化 → 属性变更描述；
 * - state 变化 → 新 state 中文标签；
 * - 无变化 / 新状态为空 → null。
 */
export function resolveEntityStateChangeMessage(
  entityId: string,
  oldState: StateSnapshot,
  newState: StateSnapshot,
): EventLogStateChangeResolved | null {
  if (!newState) return null;
  const newStateValue = newState.state == null ? "" : String(newState.state);
  const oldStateValue = oldState?.state == null ? undefined : String(oldState.state);

  if (oldState && oldStateValue === newStateValue) {
    const attrText = describeEventLogAttrChange(entityId, oldState.attributes, newState.attributes);
    if (!attrText) return null;
    return { state: newStateValue, attrText, label: attrText };
  }

  if (!newStateValue) return null;
  return { state: newStateValue, attrText: null, label: resolveEventLogStateLabel(newStateValue) };
}

/** 构建事件指纹（属性变更：entity|attr|text；状态变更：entity|state|old|new）。 */
export function buildEventLogFingerprint(
  entityId: string,
  oldState: StateSnapshot,
  newState: StateSnapshot,
  resolved: Pick<EventLogStateChangeResolved, "state" | "attrText">,
): string {
  if (resolved.attrText) return `${entityId}|attr|${resolved.attrText}`;
  const oldStateValue = oldState?.state == null ? "" : String(oldState.state);
  const newStateValue = resolved.state || (newState?.state == null ? "" : String(newState.state));
  return `${entityId}|state|${oldStateValue}|${newStateValue}`;
}

/** 从实体元数据取出设备 id。 */
export function eventLogWallDeviceId(metadata: Record<string, unknown> | null | undefined): string {
  const deviceId = metadata?.deviceId ?? metadata?.device_id;
  return typeof deviceId === "string" ? deviceId.trim() : "";
}

/** 去重键入参：一条事件墙条目参与去重所需的字段。 */
interface EventLogWallDedupOptions {
  entityId: string;
  label: string;
  fingerprint: string | null;
  displayName: string;
  deviceId?: string;
}

/**
 * 窗口期去重键：同一实体、同一设备、同一展示名在短时间内的相同标签只保留一条。
 * 灯实体常与同设备 switch 各推一次 state_changed，仅按 entityId 会显示成两行。
 */
export function eventLogWallDedupKeys(options: EventLogWallDedupOptions): string[] {
  const keys: string[] = [];
  const label = String(options.label || "").trim();
  if (options.fingerprint) keys.push(options.fingerprint);
  if (options.entityId && label) keys.push(`entity:${options.entityId}|${label}`);
  const deviceId = String(options.deviceId || "").trim();
  if (deviceId && label) keys.push(`device:${deviceId}|${label}`);
  const displayName = String(options.displayName || "")
    .trim()
    .toLowerCase();
  if (displayName && label) keys.push(`name:${displayName}|${label}`);
  return keys;
}

/** 状态颜色分类 token（渲染器映射为 CSS 类）。 */
function resolveStateColorToken(state: string, attrText: string | null): string {
  if (attrText) return "attr";
  const normalizedState = String(state || "")
    .trim()
    .toLowerCase();
  if (normalizedState === "on" || normalizedState === "open") return "on";
  if (normalizedState === "off" || normalizedState === "closed") return "off";
  if (normalizedState === "unavailable") return "alert";
  if (["cool", "heat", "auto", "dry", "fan_only", "heat_cool"].includes(normalizedState))
    return "climate";
  return "muted";
}

/** 即时消息墙展示的单条事件。 */
interface EventLogWallEntry {
  id: string;
  entityId: string;
  name: string;
  state: string;
  timestamp: string;
  colorToken: string;
}

/** 格式化事件时间（HH:MM:SS）。 */
function formatEventLogTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

/** 实体元数据：宿主传 `name` / `originalName` / `deviceId` 等，值类型不定。 */
interface EventLogEntityMetadata {
  name?: unknown;
  originalName?: unknown;
  deviceId?: unknown;
  device_id?: unknown;
}

/** 把未知入参收窄成元数据对象；非对象 → 空对象（调用方不必再判空）。 */
function toEventLogEntityMetadata(value: unknown): EventLogEntityMetadata {
  return value !== null && typeof value === "object" ? (value as EventLogEntityMetadata) : {};
}

/** 取第一个非空字符串字段（元数据的同义字段名混用，按声明顺序兜底）。 */
function firstMetadataText(source: EventLogEntityMetadata, keys: readonly (keyof EventLogEntityMetadata)[]): string {
  for (const key of keys) {
    const raw = source[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return "";
}

/** 解析实体显示名，依次回退：friendly_name → 元数据名 → 实体 id 主体。 */
export function eventLogWallEntityName(
  entityId: string,
  stateSnapshot: { attributes?: Record<string, unknown> } | null | undefined,
  metadata: Record<string, unknown> | null | undefined,
): string {
  const friendlyName = stateSnapshot?.attributes?.friendly_name;
  const label =
    (typeof friendlyName === "string" && friendlyName.trim()) ||
    firstMetadataText(toEventLogEntityMetadata(metadata), ["name", "originalName"]) ||
    entityId.split(".", 2)[1] ||
    entityId;
  return String(label).replace(/_/g, " ").trim();
}

/** 生成一条展示条目。 */
export function createEventLogEntry(
  entityId: string,
  resolved: EventLogStateChangeResolved,
  displayName: string,
  timestamp: Date = new Date(),
): EventLogWallEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    entityId,
    name: displayName,
    state: resolved.label,
    timestamp: formatEventLogTime(timestamp),
    colorToken: resolveStateColorToken(resolved.state, resolved.attrText),
  };
}

/**
 * 即时消息墙去重缓冲：负责窗口期去重、头插与条数截断。
 *
 * 去重语义：
 * - 相同事件指纹 / 实体+标签 / 设备+标签 / 展示名+标签，窗口期内只显示一次。
 */
export class EventLogWallBuffer {
  entries: EventLogWallEntry[] = [];
  private maxEntries: number;
  private recentKeys = new Map<string, number>();

  constructor(maxEntries = 20) {
    this.maxEntries = clampEntryLimit(maxEntries);
  }

  private mark(key: string): void {
    this.recentKeys.set(key, Date.now());
    if (this.recentKeys.size > EVENT_LOG_WALL_DEDUP_MAX_KEYS) {
      const now = Date.now();
      for (const [trackedKey, trackedAt] of this.recentKeys) {
        if (now - trackedAt > EVENT_LOG_WALL_DEDUP_MS) this.recentKeys.delete(trackedKey);
      }
    }
  }

  private seenRecently(key: string): boolean {
    const lastSeenAt = this.recentKeys.get(key);
    return lastSeenAt != null && Date.now() - lastSeenAt < EVENT_LOG_WALL_DEDUP_MS;
  }

  setMaxEntries(maxEntries: number): void {
    this.maxEntries = clampEntryLimit(maxEntries);
    if (this.entries.length > this.maxEntries) this.entries.length = this.maxEntries;
  }

  /** 尝试写入一条事件；被去重返回 false，写入成功返回 true。 */
  push(entry: EventLogWallEntry, dedupKeys: readonly string[]): boolean {
    const keys = [...new Set(dedupKeys.filter(Boolean))];
    for (const key of keys) {
      if (this.seenRecently(key)) return false;
    }
    for (const key of keys) this.mark(key);
    this.entries.unshift(entry);
    if (this.entries.length > this.maxEntries) this.entries.length = this.maxEntries;
    return true;
  }

  clear(): void {
    this.entries.length = 0;
    this.recentKeys.clear();
  }
}

function clampEntryLimit(maxEntries: number): number {
  const numericLimit = Math.round(Number(maxEntries));
  if (!Number.isFinite(numericLimit)) return 20;
  return Math.max(1, Math.min(200, numericLimit));
}
