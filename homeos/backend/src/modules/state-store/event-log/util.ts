/**
 * 事件日志内部工具集
 *
 * 职责：合并自多个历史 util 文件，提供：
 *  - 缓冲区失败回灌（requeueFailedBatch）
 *  - stateDiff 解析与历史行映射
 *  - 统计聚合（域 / 实体 / 时间序列构建）
 *  - 分批清理与 Redis 时间线清理
 *  - 记录过滤器（域黑白名单 + 实体屏蔽）
 *  - 查询 ACL（Prisma where / 原始 SQL 片段 / 实体列表过滤）
 *  - 持久化分级（Tier A 全量 / Tier B compact / Tier C 跳过）与控制属性变更检测
 * 依赖：@homeos/shared（域工具、ACL）、Prisma（where 类型）、ioredis（Redis 客户端）
 *
 * 合并自：event-log-buffer / query / stats / clear / record-filter / access / tier 等 util
 */
import type { HaEntity, HaStateChangeEvent } from '../../../shared/types';
import type { Prisma } from '../../../generated/prisma/client';
import { Prisma as PrismaNs } from '../../../generated/prisma/client';
import type { JwtUserLike } from '@homeos/shared';
import { getEntityDomain, isEntityAllowed, resolveEntityRestrictions } from '@homeos/shared';
import type { Redis } from 'ioredis';

// ── event-log-buffer.util ──
/**
 * 将失败批次回灌到缓冲区头部（unshift），受 maxBuffer 上限约束。
 * @returns 实际回灌的条数
 */
export function requeueFailedBatch(
  buffer: unknown[],
  failedBatch: unknown[],
  maxBuffer: number,
): number {
  const room = Math.max(0, maxBuffer - buffer.length);
  if (room <= 0 || failedBatch.length === 0) return 0;
  const slice = failedBatch.slice(0, room);
  buffer.unshift(...slice);
  return slice.length;
}

// ── event-log-query.util ──
type ParsedStateDiff = {
  state: string;
  oldState: string;
  attrText: string | null;
};

/** 从 stateDiff 解析展示字段：on→off 或 attr:fan_mode:auto→high */
function parseStateDiff(stateDiff: string | null | undefined): ParsedStateDiff {
  if (!stateDiff) return { state: '', oldState: '', attrText: null };
  if (stateDiff.startsWith('attr:')) {
    const body = stateDiff.slice(5);
    const arrow = body.indexOf('→');
    if (arrow < 0) {
      return { state: '', oldState: '', attrText: body };
    }
    const keyPart = body.slice(0, arrow);
    const colon = keyPart.indexOf(':');
    const key = colon >= 0 ? keyPart.slice(0, colon) : keyPart;
    const oldRaw = colon >= 0 ? keyPart.slice(colon + 1) : '';
    const newRaw = body.slice(arrow + 1);
    const attrText = colon >= 0 ? `${key}: ${oldRaw} → ${newRaw}` : body;
    return { state: '', oldState: '', attrText };
  }
  const parts = stateDiff.split('→');
  if (parts.length >= 2) {
    return {
      oldState: parts[0] ?? '',
      state: parts[parts.length - 1] ?? '',
      attrText: null,
    };
  }
  return { state: stateDiff, oldState: '', attrText: null };
}

type EventLogListRow = {
  id: number;
  entityId: string;
  stateDiff: string | null;
  createdAt: Date;
};

/** 将数据库行映射为前端展示行（解析 stateDiff 为 state / oldState / attrText） */
export function mapEventLogHistoryRow(row: EventLogListRow) {
  const { state, oldState, attrText } = parseStateDiff(row.stateDiff);
  return {
    id: row.id,
    entityId: row.entityId,
    state,
    oldState,
    attrText,
    stateDiff: row.stateDiff,
    createdAt: row.createdAt,
  };
}

// ── event-log-stats.util ──
type EventLogDomainRow = { domain: string; count: number };
type EventLogEntityRow = { entityId: string; count: number };
type EventLogTimeRow = { bucket: Date | string; count: number };

/** 根据查询窗口决定时间粒度：≤48h 按小时，否则按天 */
export function resolveEventLogTimeGranularity(windowHours: number): 'hour' | 'day' {
  return windowHours <= 48 ? 'hour' : 'day';
}

/**
 * 构建时间序列：按粒度分桶填充零值缺口，确保连续时间轴。
 * @returns 排序后的 { ts, count, label } 数组
 */
function buildEventLogTimeSeries(
  rows: EventLogTimeRow[],
  windowHours: number,
  nowMs = Date.now(),
): Array<{ label: string; count: number; ts: number }> {
  const granularity = resolveEventLogTimeGranularity(windowHours);
  const bucketMs = granularity === 'hour' ? 3600_000 : 86_400_000;
  const windowMs = windowHours * 3600_000;
  const start = Math.floor((nowMs - windowMs) / bucketMs) * bucketMs;
  const end = Math.floor(nowMs / bucketMs) * bucketMs;
  const map = new Map<number, number>();

  for (let ts = start; ts <= end; ts += bucketMs) map.set(ts, 0);

  for (const row of rows) {
    const raw = row.bucket instanceof Date ? row.bucket.getTime() : new Date(row.bucket).getTime();
    if (!Number.isFinite(raw)) continue;
    const key = Math.floor(raw / bucketMs) * bucketMs;
    if (!map.has(key)) map.set(key, 0);
    map.set(key, (map.get(key) || 0) + Number(row.count) || 0);
  }

  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ts, count]) => ({
      ts,
      count,
      label: formatEventLogTimeLabel(ts, granularity),
    }));
}

function formatEventLogTimeLabel(ts: number, granularity: 'hour' | 'day'): string {
  const d = new Date(ts);
  if (granularity === 'hour') {
    return `${String(d.getHours()).padStart(2, '0')}:00`;
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 聚合统计结果：总数、按域计数、时间序列、Top 实体 */
export function buildEventLogStats(
  domainRows: EventLogDomainRow[],
  entityRows: EventLogEntityRow[],
  timeRows: EventLogTimeRow[] = [],
  windowHours = 24,
) {
  const byDomain: Record<string, number> = {};
  let total = 0;
  for (const row of domainRows) {
    byDomain[row.domain] = row.count;
    total += row.count;
  }
  return {
    total,
    byDomain,
    byTime: buildEventLogTimeSeries(timeRows, windowHours),
    topEntities: entityRows.map((row) => ({
      entityId: row.entityId,
      count: row.count,
    })),
  };
}

// ── event-log-clear.util ──
/** 分批删除 EventLog 全表记录，避免长事务锁表 */
export async function deleteAllEventLogsInBatches(
  findBatch: (take: number) => Promise<Array<{ id: number }>>,
  deleteBatch: (ids: number[]) => Promise<{ count: number }>,
  batchSize = 5000,
): Promise<number> {
  let total = 0;
  const maxBatches = 500;
  for (let i = 0; i < maxBatches; i++) {
    const rows = await findBatch(batchSize);
    if (!rows.length) break;
    const ids = rows.map((r) => r.id);
    const result = await deleteBatch(ids);
    total += result.count;
    if (rows.length < batchSize) break;
  }
  return total;
}

/** 清空 Redis 中事件时间线与流（与 EventLog 写入侧一致） */
export async function clearEventLogRedisTimeline(client: Redis): Promise<number> {
  let removed = 0;
  try {
    const mainType = await client.type('timeline:all');
    if (mainType === 'zset' || mainType === 'none') {
      removed += await client.del('timeline:all');
    }
  } catch {
    // 忽略单 key 删除失败
  }

  let cursor = '0';
  do {
    const [next, keys] = await client.scan(cursor, 'MATCH', 'timeline:entity:*', 'COUNT', 200);
    cursor = next;
    if (keys.length) removed += await client.del(...keys);
  } while (cursor !== '0');

  try {
    removed += await client.del('stream:ha_events');
  } catch {
    // 忽略 stream 删除失败
  }

  return removed;
}

// ── event-log-record-filter.util ──
type EventLogRecordFilterMode = 'block' | 'allow_domains';

interface EventLogRecordFilterConfig {
  enabled: boolean;
  mode: EventLogRecordFilterMode;
  blockDomains: string[];
  allowDomains: string[];
  blockEntityIds: string[];
}

const DOMAIN_RE = /^[a-z0-9_]+$/;

/** 规范化域列表：小写、去重、校验格式（仅允许小写字母/数字/下划线） */
function normalizeDomainList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const domain = String(raw || '')
      .trim()
      .toLowerCase();
    if (!domain || !DOMAIN_RE.test(domain) || seen.has(domain)) continue;
    seen.add(domain);
    out.push(domain);
  }
  return out;
}

/** 规范化实体 ID 列表：去重、校验含域前缀（.） */
function normalizeEntityIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const id = String(raw || '').trim();
    if (!id || !id.includes('.') || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** 规范化事件日志记录过滤器配置（默认 block 模式） */
function normalizeEventLogRecordFilter(
  raw: Partial<EventLogRecordFilterConfig> | null | undefined,
): EventLogRecordFilterConfig {
  const mode: EventLogRecordFilterMode = raw?.mode === 'allow_domains' ? 'allow_domains' : 'block';
  return {
    enabled: raw?.enabled === true,
    mode,
    blockDomains: normalizeDomainList(raw?.blockDomains),
    allowDomains: normalizeDomainList(raw?.allowDomains),
    blockEntityIds: normalizeEntityIdList(raw?.blockEntityIds),
  };
}

/** 从 ops 配置对象构建事件日志记录过滤器 */
export function buildEventLogRecordFilterFromOps(
  ops: Record<string, unknown> | null | undefined,
): EventLogRecordFilterConfig {
  return normalizeEventLogRecordFilter({
    enabled: ops?.eventLogRecordFilterEnabled === true,
    mode: ops?.eventLogRecordFilterMode === 'allow_domains' ? 'allow_domains' : 'block',
    blockDomains: normalizeDomainList(ops?.eventLogRecordBlockDomains),
    allowDomains: normalizeDomainList(ops?.eventLogRecordAllowDomains),
    blockEntityIds: normalizeEntityIdList(ops?.eventLogRecordBlockEntityIds),
  });
}

/** 是否应写入 EventLog（在 tier 分级之前调用） */
export function isEventLogRecordable(
  entityId: string,
  cfg: Partial<EventLogRecordFilterConfig> | null | undefined,
): boolean {
  const c = normalizeEventLogRecordFilter(cfg);
  if (!c.enabled) return true;

  const id = String(entityId || '').trim();
  if (!id) return false;
  if (c.blockEntityIds.includes(id)) return false;

  const domain = getEntityDomain(id);
  if (c.mode === 'allow_domains') {
    return c.allowDomains.length > 0 && c.allowDomains.includes(domain);
  }
  if (c.blockDomains.includes(domain)) return false;
  return true;
}

// ── event-log-access.util ──
/** 将 JWT 用户解析为 EventLog 查询用的 restrictions（null = 无限制） */
export function resolveEventLogRestrictions(user?: JwtUserLike | null): string[] | null {
  return resolveEntityRestrictions(user);
}

/**
 * 构建 Prisma where 片段：限制可见 entityId（与 isEntityAllowed 前缀/域规则对齐）
 * null = 不追加过滤；[] = 无可见实体
 */
function buildEventLogAccessWhere(
  restrictions: string[] | null | undefined,
): Prisma.EventLogWhereInput | null {
  if (restrictions === null || restrictions === undefined) return null;
  if (restrictions.length === 0) {
    return { entityId: { in: [] } };
  }
  const or: Prisma.EventLogWhereInput[] = [];
  for (const prefix of restrictions) {
    if (!prefix) continue;
    if (prefix.includes('.')) {
      or.push({ entityId: { startsWith: prefix } });
    } else {
      // 纯域名走 domain 列索引，避免 entityId LIKE 前缀扫描
      or.push({ domain: prefix });
    }
  }
  if (!or.length) return { entityId: { in: [] } };
  return { OR: or };
}

/** 合并基础 where 与 ACL where 片段（AND 组合） */
export function mergeEventLogWhere(
  base: Prisma.EventLogWhereInput,
  restrictions: string[] | null | undefined,
): Prisma.EventLogWhereInput {
  const access = buildEventLogAccessWhere(restrictions);
  if (!access) return base;
  return { AND: [base, access] };
}

/** 原始 SQL 统计查询用的 ACL 片段（域名用 domain 列，实体前缀用 entityId LIKE） */
export function eventLogAccessSql(restrictions: string[] | null | undefined): PrismaNs.Sql {
  if (restrictions === null || restrictions === undefined) return PrismaNs.empty;
  if (restrictions.length === 0) return PrismaNs.sql`AND FALSE`;
  const parts = restrictions.map((prefix) => {
    if (prefix.includes('.')) {
      return PrismaNs.sql`"entityId" LIKE ${`${prefix}%`}`;
    }
    return PrismaNs.sql`"domain" = ${prefix}`;
  });
  return PrismaNs.sql`AND (${PrismaNs.join(parts, ' OR ')})`;
}

/** 按 ACL 过滤实体 ID 列表（restrictions 为 null 时全部放行） */
export function filterEntityIdsByAccess(
  entityIds: string[],
  restrictions: string[] | null | undefined,
): string[] {
  if (restrictions === null || restrictions === undefined) return entityIds;
  return entityIds.filter((id) => isEntityAllowed(id, restrictions));
}

// ── event-log-tier.util ──
/**
 * EventLog 持久化策略（智能家居取向）
 *
 * ┌──────────────┬────────────────────────────────────────────────────────────┐
 * │ 必写 full    │ 灯/开关/窗帘/锁/空调/风扇/影音/扫地机/阀门/安防面板/场景脚本 │
 * │              │ + 用户输入类（input_* / button / remote）                      │
 * ├──────────────┼────────────────────────────────────────────────────────────┤
 * │ 条件 compact │ binary_sensor：门窗/烟感/水浸/运动等安防与在场                 │
 * │              │ sensor：仅电/气/水表等计量类（温湿度走 EnvironmentRecord/HA）   │
 * ├──────────────┼────────────────────────────────────────────────────────────┤
 * │ 默认跳过     │ camera/update/device_tracker/GPS/天气太阳等元数据与流媒体     │
 * │              │ + 连续环境遥测（temp/humidity/illuminance/battery…）           │
 * └──────────────┴────────────────────────────────────────────────────────────┘
 */
type EventLogPersistTier = 'full' | 'compact' | 'skip';

/** 用户可感知的控制 / 安防 / 编排 — 全量 JSONB */
const TIER_FULL_DOMAINS = new Set([
  'light',
  'switch',
  'cover',
  'climate',
  'lock',
  'fan',
  'media_player',
  'alarm_control_panel',
  'vacuum',
  'water_heater',
  'valve',
  'scene',
  'script',
  'humidifier',
  'dehumidifier',
  'siren',
  'lawn_mower',
  'remote',
  'button',
  'input_boolean',
  'input_button',
  'input_select',
  'input_number',
  'person',
]);

/** 条件写入域：按实体名关键词筛选 */
const TIER_CONDITIONAL_DOMAINS = new Set(['sensor', 'binary_sensor']);

/**
 * 默认跳过：高频噪声 / 流媒体 / 元数据。
 * （与 ops.eventLogRecordBlockDomains 默认黑名单对齐，双保险）
 */
const TIER_SKIP_DOMAINS = new Set([
  'camera',
  'image',
  'update',
  'device_tracker',
  'event',
  'sun',
  'weather',
  'zone',
  'calendar',
  'todo',
  'conversation',
  'stt',
  'tts',
  'ai_task',
  'assist_satellite',
  'tag',
]);

/** 计量类 sensor：能耗学习 + Redis timeline */
const METER_SENSOR_HINTS = [
  'energy',
  'power_meter',
  'power',
  'watt',
  'kwh',
  'electricity',
  '用电',
  '功耗',
  '_wattage',
  'gas_meter',
  'gas_consumption',
  'water_meter',
  'water_consumption',
] as const;

/** 明确排除的连续遥测（即使名字误含 power 等也不靠谱时优先排除） */
const TELEMETRY_SENSOR_HINTS = [
  'temperature',
  'humidity',
  'dewpoint',
  'pressure',
  'illuminance',
  'lux',
  'battery',
  'signal_strength',
  'rssi',
  'linkquality',
  'wifi',
  'pm25',
  'pm2_5',
  'pm10',
  'co2',
  'tvoc',
  'aqi',
  'voc',
] as const;

/**
 * binary_sensor 值得记入家史：安防触点 / 安全告警 / 在场活动。
 * 不含无语义的「通用开关量」杂项。
 */
const MEANINGFUL_BINARY_HINTS = [
  // 在场 / 活动
  'motion',
  'occupancy',
  'presence',
  // 门窗 / 开口
  'door',
  'window',
  'contact',
  'opening',
  'garage',
  // 烟感 / 燃气 / 一氧化碳
  'smoke',
  'gas',
  'carbon_monoxide',
  'co_',
  '_co',
  'fire',
  // 水浸
  'moisture',
  'leak',
  'flood',
  'water_leak',
  // 其它安防
  'safety',
  'tamper',
  'vibration',
  'glass',
  'break',
  'intrusion',
] as const;

function entityIdLower(entityId: string): string {
  return String(entityId || '').toLowerCase();
}

function hintsMatch(id: string, hints: readonly string[]): boolean {
  return hints.some((h) => id.includes(h));
}

/** 是否为计量类 sensor（电/气/水） */
function isEnergyRelatedSensor(entityId: string): boolean {
  if (getEntityDomain(entityId) !== 'sensor') return false;
  const id = entityIdLower(entityId);
  if (hintsMatch(id, TELEMETRY_SENSOR_HINTS) && !hintsMatch(id, METER_SENSOR_HINTS)) {
    return false;
  }
  return hintsMatch(id, METER_SENSOR_HINTS);
}

/** 能耗计量实体关键词（与能耗排名/小时基线查询语义对齐；区别于 isEnergyRelatedSensor 的气/水计量） */
const ENERGY_METER_HINTS = ['energy', 'power_meter', 'kwh', 'electricity'] as const;

/**
 * 是否为能耗计量实体：sensor 域且 ID 含 energy/power_meter/kwh/electricity。
 * 供 EventLog 写入流水线增量维护 EnergyCandidateEntity 候选表
 * （能耗排名/基线查询改为精确 ID 集合，避免 contains 前导通配全窗口扫描）。
 */
export function isEnergyMeterEntity(entityId: string): boolean {
  if (getEntityDomain(entityId) !== 'sensor') return false;
  return hintsMatch(entityIdLower(entityId), ENERGY_METER_HINTS);
}

/**
 * sensor / binary_sensor 是否为智能家居有意义事件（应 compact 持久化）
 */
function isEventLogMeaningfulSensor(entityId: string): boolean {
  const domain = getEntityDomain(entityId);
  const id = entityIdLower(entityId);
  if (domain === 'binary_sensor') {
    return hintsMatch(id, MEANINGFUL_BINARY_HINTS);
  }
  if (domain === 'sensor') {
    return isEnergyRelatedSensor(entityId);
  }
  return false;
}

interface EventLogTierConfig {
  enabled: boolean;
  tierCSampleRate: number;
  skipSensorTimeline: boolean;
}

const DEFAULT_TIER_CONFIG: EventLogTierConfig = {
  enabled: true,
  tierCSampleRate: 0,
  skipSensorTimeline: true,
};

/**
 * 判定实体的持久化分级（见文件上方策略表）。
 */
export function resolveEventLogTier(
  entityId: string,
  cfg: Partial<EventLogTierConfig> = {},
): EventLogPersistTier {
  const c = { ...DEFAULT_TIER_CONFIG, ...cfg };
  if (!c.enabled) return 'full';
  const domain = getEntityDomain(entityId);
  if (TIER_SKIP_DOMAINS.has(domain)) {
    if (c.tierCSampleRate <= 0) return 'skip';
    return Math.random() < c.tierCSampleRate ? 'compact' : 'skip';
  }
  if (TIER_FULL_DOMAINS.has(domain)) return 'full';
  if (TIER_CONDITIONAL_DOMAINS.has(domain)) {
    return isEventLogMeaningfulSensor(entityId) ? 'compact' : 'skip';
  }
  // 其余低频域（如 select / number 个别集成）：只存 compact，避免未知域全量 JSONB
  return 'compact';
}

/**
 * 按 tier 序列化事件的 old/new state（写入 Prisma Json / JSONB，须传对象而非 JSON 字符串）。
 * @remarks skip 返回 null/null；full 存 state + attributes；
 * compact 默认仅存 new.state；能耗累计表计额外保留两侧 state（及单位属性）供差分聚合。
 */
export function serializeEventLogStates(
  event: HaStateChangeEvent,
  tier: EventLogPersistTier,
): { oldState: Record<string, unknown> | null; newState: Record<string, unknown> | null } {
  if (tier === 'skip') {
    return { oldState: null, newState: null };
  }
  if (tier === 'full') {
    return {
      oldState: event.old_state
        ? { state: event.old_state.state, attributes: event.old_state.attributes }
        : null,
      newState: event.new_state
        ? { state: event.new_state.state, attributes: event.new_state.attributes }
        : null,
    };
  }
  // compact：能耗累计表计需 old+new 才能算 kWh 增量；其余只保留 new.state
  if (isEnergyMeterEntity(event.entity_id)) {
    const pickMeter = (
      s: HaStateChangeEvent['old_state'] | HaStateChangeEvent['new_state'],
    ): Record<string, unknown> | null => {
      if (!s) return null;
      const attrs = s.attributes || {};
      return {
        state: s.state,
        attributes: {
          device_class: attrs.device_class,
          unit_of_measurement: attrs.unit_of_measurement,
        },
      };
    };
    return {
      oldState: pickMeter(event.old_state),
      newState: pickMeter(event.new_state),
    };
  }
  return {
    oldState: null,
    newState: event.new_state ? { _diff: true, state: event.new_state.state } : null,
  };
}

/** 从 EventLog.newState JSON 取出 state 字符串（供 Redis 时间线回填） */
export function extractEventLogState(newState: unknown): string | null {
  if (!newState || typeof newState !== 'object') return null;
  const state = (newState as { state?: unknown }).state;
  return typeof state === 'string' ? state : state == null ? null : String(state);
}

/**
 * 是否跳过 Redis 时间线。
 * 默认跳过 sensor/binary_sensor；计量类 sensor 例外（能耗小时基线依赖 timeline）。
 */
export function shouldSkipRedisTimeline(
  entityId: string,
  cfg: Partial<EventLogTierConfig> = {},
): boolean {
  const c = { ...DEFAULT_TIER_CONFIG, ...cfg };
  if (!c.skipSensorTimeline) return false;
  const domain = getEntityDomain(entityId);
  if (domain !== 'sensor' && domain !== 'binary_sensor') return false;
  if (domain === 'sensor' && isEnergyRelatedSensor(entityId)) return false;
  return true;
}

/**
 * 各域「控制/设定类」属性白名单：state 未变但这些属性变化时也应记录为一条事件
 * （如空调调温、灯光调亮度）。刻意排除 current_temperature / media_position 等高频读数，
 * 防止事件爆炸。
 */
const ATTR_CHANGE_TRIGGERS: Record<string, readonly string[]> = {
  climate: [
    'temperature',
    'target_temp_high',
    'target_temp_low',
    'humidity',
    'fan_mode',
    'preset_mode',
    'swing_mode',
    'hvac_mode',
  ],
  light: ['brightness', 'color_temp', 'color_temp_kelvin', 'rgb_color', 'hs_color', 'effect'],
  fan: ['percentage', 'preset_mode', 'oscillating', 'direction'],
  cover: ['current_position', 'current_tilt_position'],
  media_player: ['volume_level', 'source'],
  water_heater: ['temperature', 'operation_mode'],
  vacuum: ['fan_speed'],
};

/**
 * 当 state 未变时，检测是否存在「控制类」属性变更，返回首个变化属性的描述串
 * （如 `temperature:24→26`）；无变更返回 null。仅 'full' tier 的域参与。
 */
export function getChangedControlAttr(
  entityId: string,
  oldState: HaEntity | null | undefined,
  newState: HaEntity | null | undefined,
): string | null {
  if (!oldState || !newState) return null;
  const domain = getEntityDomain(entityId);
  const triggers = ATTR_CHANGE_TRIGGERS[domain];
  if (!triggers) return null;
  const oldAttrs = oldState.attributes || {};
  const newAttrs = newState.attributes || {};
  for (const key of triggers) {
    if (JSON.stringify(oldAttrs[key]) !== JSON.stringify(newAttrs[key])) {
      return `${key}:${formatAttrForDiff(oldAttrs[key])}→${formatAttrForDiff(newAttrs[key])}`;
    }
  }
  return null;
}

function formatAttrForDiff(val: unknown): string {
  if (val == null) return '';
  if (Array.isArray(val) || typeof val === 'object') return JSON.stringify(val);
  return String(val);
}
