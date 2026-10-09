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
export const EVENT_LOG_WALL_DEDUP_MS = 2000;

/** 去重表容量上限，超过后清理过期键，避免内存无限增长。 */
export const EVENT_LOG_WALL_DEDUP_MAX_KEYS = 200;

/** 自动监听模式下最多订阅的实体数量（避免逼近渲染器 1000 订阅上限）。 */
export const EVENT_LOG_WALL_AUTO_ENTITY_LIMIT = 400;

/** 从实体对象或实体 id 解析域名。 */
export function eventLogWallDomainOf(entityRef: unknown): string {
  const entityId =
    typeof entityRef === "string"
      ? entityRef
      : String((entityRef as any)?.entityId || (entityRef as any)?.entity_id || "");
  const declaredDomain = typeof entityRef === "string" ? "" : String((entityRef as any)?.domain || "");
  return declaredDomain.trim().toLowerCase() || entityId.split(".", 1)[0].toLowerCase();
}

/** 该实体是否属于即时消息墙监听的域。 */
export function isEventLogWallDomain(entityRef: unknown): boolean {
  return EVENT_LOG_WALL_DOMAIN_SET.has(eventLogWallDomainOf(entityRef));
}

/**
 * 各域「控制 / 设定类」属性白名单：state 未变但这些属性变化时也应记录为一条事件
 * （与源 control-attr-change.util 的 ATTR_CHANGE_TRIGGERS 保持一致）。
 */
export const ATTR_CHANGE_TRIGGERS: Record<string, readonly string[]> = {
  climate: [
    "temperature",
    "target_temp_high",
    "target_temp_low",
    "humidity",
    "fan_mode",
    "preset_mode",
    "swing_mode",
    "hvac_mode",
  ],
  light: ["brightness", "color_temp", "color_temp_kelvin", "rgb_color", "hs_color", "effect"],
  fan: ["percentage", "preset_mode", "oscillating", "direction"],
  cover: ["current_position", "current_tilt_position"],
  media_player: ["volume_level", "source"],
  water_heater: ["temperature", "operation_mode"],
  vacuum: ["fan_speed"],
};

/** 属性 key → 中文标签。 */
export const ATTR_CHANGE_LABELS: Record<string, string> = {
  temperature: "目标温度",
  target_temp_high: "温度上限",
  target_temp_low: "温度下限",
  humidity: "目标湿度",
  fan_mode: "风速",
  preset_mode: "模式",
  swing_mode: "摆风",
  hvac_mode: "运行模式",
  brightness: "亮度",
  color_temp: "色温",
  color_temp_kelvin: "色温",
  rgb_color: "颜色",
  hs_color: "颜色",
  effect: "灯效",
  percentage: "风速",
  oscillating: "摆头",
  direction: "风向",
  current_position: "位置",
  current_tilt_position: "角度",
  volume_level: "音量",
  source: "输入源",
  operation_mode: "模式",
  fan_speed: "吸力",
};

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
export function resolveEventLogStateLabel(state: unknown): string {
  const normalizedState = String(state ?? "")
    .trim()
    .toLowerCase();
  if (!normalizedState) return "";
  return STATE_LABELS[normalizedState] || String(state ?? "");
}

/** 把属性原始值格式化为可读文案。 */
export function formatAttrValueText(key: string, value: unknown): string {
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
 * 无白名单域 / 无变化时返回 null。
 */
export function describeAttrChange(
  entityId: string,
  oldAttributes: Record<string, unknown> | undefined | null,
  newAttributes: Record<string, unknown> | undefined | null,
): string | null {
  const triggers = ATTR_CHANGE_TRIGGERS[eventLogWallDomainOf(entityId)];
  if (!triggers || !oldAttributes || !newAttributes) return null;
  for (const key of triggers) {
    if (JSON.stringify(oldAttributes[key]) !== JSON.stringify(newAttributes[key])) {
      const label = ATTR_CHANGE_LABELS[key] || key;
      return `${label} ${formatAttrValueText(key, oldAttributes[key])} → ${formatAttrValueText(
        key,
        newAttributes[key],
      )}`;
    }
  }
  return null;
}

/** 状态快照最小形状：运行时 states Map 中可能包裹一层 newState。 */
type StateSnapshot = { state?: unknown; attributes?: Record<string, unknown> } | null | undefined;

/** 从运行时状态记录中取出真正的状态快照（兼容 { newState } 包裹）。 */
export function resolveStateSnapshot(stateEntry: unknown): { state?: unknown; attributes?: Record<string, unknown> } | null {
  if (!stateEntry || typeof stateEntry !== "object") return null;
  const wrapped = (stateEntry as any).newState;
  return (wrapped && typeof wrapped === "object" ? wrapped : stateEntry) as {
    state?: unknown;
    attributes?: Record<string, unknown>;
  };
}

/** 状态变更解析结果。 */
export interface EventLogStateChangeResolved {
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
    const attrText = describeAttrChange(entityId, oldState.attributes, newState.attributes);
    if (!attrText) return null;
    return { state: newStateValue, attrText, label: attrText };
  }

  if (!newStateValue) return null;
  return { state: newStateValue, attrText: null as any, label: resolveEventLogStateLabel(newStateValue) };
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

/**
 * 窗口期去重键：同一实体、同一设备、同一展示名在短时间内的相同标签只保留一条。
 * 灯实体常与同设备 switch 各推一次 state_changed，仅按 entityId 会显示成两行。
 */
export function eventLogWallDedupKeys(options: {
  entityId: string;
  label: string;
  fingerprint: string | null;
  displayName: string;
  deviceId?: string;
}): string[] {
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
export function resolveStateColorToken(state: string, attrText: string | null): string {
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
export interface EventLogWallEntry {
  id: string;
  entityId: string;
  name: string;
  state: string;
  timestamp: string;
  colorToken: string;
}

/** 格式化事件时间（HH:MM:SS）。 */
export function formatEventLogTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
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
    String((metadata as any)?.name || "").trim() ||
    String((metadata as any)?.originalName || "").trim() ||
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
