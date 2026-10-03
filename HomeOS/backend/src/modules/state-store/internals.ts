/**
 * 状态存储内部工具集
 *
 * 所属模块：state-store
 * 职责：合并自多个历史 util 文件，提供：
 *  - Redis shadow key 常量与生成函数（shadow:entity:*）
 *  - 近期变更环形缓冲（recentChanges）的推送与过滤
 *  - 域分桶索引（domainBuckets）的构建与查询
 *  - 内存诊断与数据陈旧度判定
 *  - 游标分页与实体过滤/排序
 * 依赖：@homeos/shared（域工具）
 *
 * 合并自：shadow-keys / recent-changes / domain-index / diagnostics / pagination / filter 等 util
 */
import type { HaEntity } from '../../shared/types';
import { entityMatchesAreaFilter, getEntityDomain, isControllableEntityId } from '@homeos/shared';

// ── state-store-shadow-keys.util ──
/**
 * SHADOW_KEY_PREFIX：常量。
 * - 语义：见定义处字面量；来源为硬编码预设/默认值；
 * - 跨端一致性：仅 backend 内部使用；如需跨端同步 packages/shared；
 * - 反射拼接：可能被模板字符串动态访问，重命名需全仓检索
 */
export const SHADOW_KEY_PREFIX = 'shadow:entity:';
/**
 * SHADOW_KEYS_SET：常量。
 * - 语义：见定义处字面量；来源为硬编码预设/默认值；
 * - 跨端一致性：仅 backend 内部使用；如需跨端同步 packages/shared；
 * - 反射拼接：可能被模板字符串动态访问，重命名需全仓检索
 */
export const SHADOW_KEYS_SET = 'shadow:entity:keys';
/**
 * SHADOW_SNAPSHOT_META_KEY：常量。
 * - 语义：见定义处字面量；来源为硬编码预设/默认值；
 * - 跨端一致性：仅 backend 内部使用；如需跨端同步 packages/shared；
 * - 反射拼接：可能被模板字符串动态访问，重命名需全仓检索
 */
export const SHADOW_SNAPSHOT_META_KEY = 'shadow:snapshot:meta';

/** 构造实体在 Redis shadow 中的 key：shadow:entity:{entityId} */
export function entityShadowKey(entityId: string): string {
  return `${SHADOW_KEY_PREFIX}${entityId}`;
}

// ── state-store-recent-changes.util ──
/** 近期变更缓冲条目（仅存 entity_id，读取时从 L1 store 解析 new_state） */
interface RecentChangeEntry {
  id: number;
  entity_id: string;
  at: number;
}

/** 近期变更解析后条目（含从 store 解析出的 new_state 实体） */
interface RecentChangeResolved {
  id: number;
  entity_id: string;
  at: number;
  new_state: HaEntity;
}

/**
 * 近期变更环形缓冲：定长数组 + 头尾指针，读写均为 O(1)。
 * 替代旧实现的「数组 push + 满时 shift」（shift 为 O(n) 头部搬移），
 * 消除高频 sensor 状态变更下热路径的 O(n) 开销。
 * 通过 toArray() 提供按插入顺序的数组视图，兼容现有过滤/遍历等数组式消费方。
 */
export class RecentChangeRingBuffer {
  private items: (RecentChangeEntry | undefined)[];
  /** 下一写入槽位（环形头指针） */
  private head = 0;
  /** 当前有效条目数 */
  private count = 0;
  private capacity: number;

  constructor(capacity: number) {
    this.capacity = Math.max(1, Math.floor(capacity) || 1);
    this.items = new Array(this.capacity);
  }

  /** 当前有效条目数（兼容数组式 .length 读取） */
  get length(): number {
    return this.count;
  }

  /** O(1) 写入：写入头指针槽位并推进；满时覆盖最旧条目 */
  push(entry: RecentChangeEntry): void {
    this.items[this.head] = entry;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count += 1;
    }
  }

  /** 按插入顺序返回全部条目（最旧在前），供过滤/遍历等消费方使用 */
  toArray(): RecentChangeEntry[] {
    const out: RecentChangeEntry[] = new Array(this.count);
    const start =
      this.count === 0 ? 0 : (this.head - this.count + this.capacity) % this.capacity;
    for (let i = 0; i < this.count; i++) {
      out[i] = this.items[(start + i) % this.capacity] as RecentChangeEntry;
    }
    return out;
  }

  /**
   * 按最新上限收缩/扩张容量，仅保留最近 maxSize 条（与旧实现「满时 shift」语义一致）。
   * @remarks 容量与目标一致时为空操作；不一致时重建底层数组（配置热更新时低频发生，非热路径）。
   */
  trimTo(maxSize: number): void {
    const target = Math.max(1, Math.floor(maxSize) || 1);
    if (target === this.capacity) return;
    const ordered = this.toArray();
    this.capacity = target;
    this.items = new Array(this.capacity);
    const keep = Math.min(ordered.length, this.capacity);
    const from = ordered.length - keep;
    for (let i = 0; i < keep; i++) {
      this.items[i] = ordered[from + i];
    }
    this.count = keep;
    this.head = keep % this.capacity;
  }
}

/**
 * 向环形缓冲推入一条变更条目并返回递增序号。
 * @param buffer 近期变更环形缓冲
 * @param seq 当前序号
 * @param entityId 实体 ID
 * @param maxSize 缓冲上限，超出时覆盖最旧条目（O(1)，无数组 shift）
 * @returns 下一个序号
 */
export function pushRecentChangeEntry(
  buffer: RecentChangeRingBuffer,
  seq: number,
  entityId: string,
  maxSize: number,
): number {
  const nextSeq = seq + 1;
  buffer.push({
    id: nextSeq,
    entity_id: entityId,
    at: Date.now(),
  });
  buffer.trimTo(maxSize);
  return nextSeq;
}

/**
 * 按 since（时间戳）和/或 lastEventId（序号）过滤近期变更，并从 store 解析 new_state。
 * @remarks since 与 lastEventId 同时提供时取交集；store 中已不存在的实体跳过。
 */
export function filterRecentChangesSince(
  buffer: RecentChangeRingBuffer,
  store: Map<string, HaEntity>,
  sinceMs?: number,
  lastEventId?: number,
): RecentChangeResolved[] {
  const since = sinceMs && sinceMs > 0 ? sinceMs : 0;
  const minId = lastEventId && lastEventId > 0 ? lastEventId : 0;
  return buffer
    .toArray()
    .filter((c) => {
      if (since > 0 && minId > 0) return c.at >= since && c.id > minId;
      if (minId > 0) return c.id > minId;
      if (since > 0) return c.at >= since;
      return false;
    })
    .map((c) => {
      const new_state = store.get(c.entity_id);
      if (!new_state) return null;
      return { id: c.id, entity_id: c.entity_id, at: c.at, new_state };
    })
    .filter((c): c is RecentChangeResolved => c != null);
}

// ── state-store-domain-index.util ──
/** 将实体 ID 加入域分桶索引（domain → entity_id Set） */
export function indexEntityInDomainBuckets(
  domainBuckets: Map<string, Set<string>>,
  entityId: string,
): void {
  const domain = getEntityDomain(entityId);
  let bucket = domainBuckets.get(domain);
  if (!bucket) {
    bucket = new Set();
    domainBuckets.set(domain, bucket);
  }
  bucket.add(entityId);
}

/** 从域分桶索引中移除实体 ID */
export function unindexEntityFromDomainBuckets(
  domainBuckets: Map<string, Set<string>>,
  entityId: string,
): void {
  const domain = getEntityDomain(entityId);
  domainBuckets.get(domain)?.delete(entityId);
}

/** 从实体数组构建完整的域分桶索引 */
export function buildDomainBuckets(entities: HaEntity[]): Map<string, Set<string>> {
  const buckets = new Map<string, Set<string>>();
  for (const entity of entities) {
    indexEntityInDomainBuckets(buckets, entity.entity_id);
  }
  return buckets;
}

/**
 * 按域获取实体列表；未指定 domain 时返回全部。
 * @remarks 通过 domainBuckets 索引加速，避免全 store 遍历过滤。
 */
export function getEntitiesByDomain(
  store: Map<string, HaEntity>,
  domainBuckets: Map<string, Set<string>>,
  domain?: string,
): HaEntity[] {
  if (!domain) return Array.from(store.values());
  const ids = domainBuckets.get(domain);
  if (!ids || ids.size === 0) return [];
  const result: HaEntity[] = [];
  for (const id of ids) {
    const entity = store.get(id);
    if (entity) result.push(entity);
  }
  return result;
}

/** 统计各域实体数量，按数量降序排列 */
export function getDomainCounts(store: Map<string, HaEntity>) {
  const domainMap = new Map<string, number>();
  for (const entityId of store.keys()) {
    const domain = getEntityDomain(entityId);
    domainMap.set(domain, (domainMap.get(domain) || 0) + 1);
  }
  return Array.from(domainMap.entries())
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count);
}

// ── state-store-diagnostics.util ──
interface StateStoreDiagnosticsInput {
  store: Map<string, HaEntity>;
  /** 近期变更缓冲（环形缓冲或数组均可，仅读取 length 计数） */
  recentChanges: { readonly length: number };
  maxRecentChanges: number;
  trackedRedisKeys: number;
  redisPendingWrites: number;
  haInitialStatesCached: boolean;
}

/**
 * 估算 StateStore 内存占用：采样 150 个实体取平均字节后乘以总数。
 * @returns 实体数、估算占用 MB、recentChanges 计数、Redis 待写计数等诊断指标。
 */
export function computeStateStoreMemoryDiagnostics(input: StateStoreDiagnosticsInput) {
  const entityCount = input.store.size;
  let sampleBytes = 0;
  let sampleN = 0;
  const sampleCap = 150;
  for (const entity of input.store.values()) {
    sampleBytes += JSON.stringify(entity).length;
    sampleN += 1;
    if (sampleN >= sampleCap) break;
  }
  const estimatedEntityStoreBytes =
    sampleN > 0 ? Math.round((sampleBytes / sampleN) * entityCount) : 0;

  return {
    entityCount,
    estimatedEntityStoreMb: Math.round((estimatedEntityStoreBytes / 1024 / 1024) * 10) / 10,
    recentChangesCount: input.recentChanges.length,
    recentChangesMax: input.maxRecentChanges,
    trackedRedisKeys: input.trackedRedisKeys,
    redisPendingWrites: input.redisPendingWrites,
    haInitialStatesCached: input.haInitialStatesCached,
  };
}

interface StateStoreStaleInput {
  haConnected: boolean;
  haSynced: boolean;
  storeSize: number;
  lastStateChangeAt: number | null;
  lastSyncedAt: string | null;
  haDisconnectedAt: number | null;
  staleThresholdMs: number;
}

/**
 * 判定数据是否陈旧：HA 断连超过阈值、或未同步且断连时标记为 stale。
 * @returns stale 标记、最近同步时间、断连时长（毫秒）
 * @remarks 阈值内刚刷新的数据不算陈旧，避免短暂断连误报。
 */
export function computeStateStoreStaleInfo(input: StateStoreStaleInput): {
  stale: boolean;
  syncedAt: string | null;
  disconnectedMs?: number;
} {
  const threshold = input.staleThresholdMs;
  if (!input.haConnected && input.storeSize > 0) {
    const lastFreshMs = Math.max(
      input.lastStateChangeAt ?? 0,
      input.lastSyncedAt ? Date.parse(input.lastSyncedAt) : 0,
    );
    if (lastFreshMs > 0 && Date.now() - lastFreshMs < threshold) {
      return { stale: false, syncedAt: input.lastSyncedAt };
    }
    const disconnectedMs = input.haDisconnectedAt
      ? Date.now() - input.haDisconnectedAt
      : threshold + 1;
    if (disconnectedMs >= threshold) {
      return { stale: true, syncedAt: input.lastSyncedAt, disconnectedMs };
    }
  }
  if (!input.haSynced && input.storeSize > 0 && !input.haConnected) {
    return { stale: true, syncedAt: input.lastSyncedAt };
  }
  return { stale: false, syncedAt: input.lastSyncedAt };
}

// ── state-store-pagination.util ──
/** 游标分页结果（entities + total + nextCursor） */
interface EntityCursorPage {
  entities: HaEntity[];
  total: number;
  nextCursor: string | null;
}

/** 按 entity_id 稳定排序后做 cursor 分页（cursor 为上一页最后一条 entity_id） */
export function sliceEntitiesByCursor(
  entities: HaEntity[],
  cursor: string | undefined,
  limit: number,
): EntityCursorPage {
  const sorted = [...entities].sort((a, b) => a.entity_id.localeCompare(b.entity_id));
  const total = sorted.length;
  const safeLimit = Math.min(Math.max(limit, 1), 2000);

  let startIdx = 0;
  if (cursor?.trim()) {
    const idx = sorted.findIndex((e) => e.entity_id > cursor);
    startIdx = idx >= 0 ? idx : total;
  }

  const slice = sorted.slice(startIdx, startIdx + safeLimit);
  const hasMore = startIdx + slice.length < total;
  const nextCursor = hasMore && slice.length > 0 ? slice[slice.length - 1].entity_id : null;

  return { entities: slice, total, nextCursor };
}

// ── state-store-filter.util ──
type EntityStatusFilter = 'online' | 'offline' | 'low_battery' | '';
type EntitySortFilter = 'name_asc' | 'name_desc' | 'status' | 'last_changed' | '';

function entityName(e: HaEntity): string {
  return String(e.attributes?.friendly_name || e.entity_id || '');
}

function isUnavailable(e: HaEntity): boolean {
  return e.state === 'unavailable' || e.state === 'unknown';
}

function batteryLevel(e: HaEntity): number | null {
  const v = e.attributes?.battery_level;
  return typeof v === 'number' ? v : null;
}

/**
 * 按状态 / 区域 / 可控性过滤实体并排序。
 * @param opts.status online/offline/low_battery
 * @param opts.area 区域 ID 过滤
 * @param opts.sort name_asc/name_desc/status/last_changed
 * @param opts.controllable 仅保留可控实体
 * @returns 过滤排序后的实体数组
 */
export function filterEntitiesByQuery(
  entities: HaEntity[],
  opts: {
    status?: EntityStatusFilter;
    area?: string;
    sort?: EntitySortFilter;
    controllable?: boolean;
  },
): HaEntity[] {
  let result = entities;

  if (opts.controllable) {
    result = result.filter((e) => isControllableEntityId(e.entity_id));
  }

  if (opts.status === 'online') {
    result = result.filter((e) => !isUnavailable(e));
  } else if (opts.status === 'offline') {
    result = result.filter((e) => isUnavailable(e));
  } else if (opts.status === 'low_battery') {
    result = result.filter((e) => {
      const level = batteryLevel(e);
      return level != null && level <= 20;
    });
  }

  if (opts.area) {
    const area = opts.area.trim();
    result = result.filter((e) => entityMatchesAreaFilter(e.attributes, area));
  }

  const sort = opts.sort || 'name_asc';
  if (sort === 'name_asc') {
    result = [...result].sort((a, b) => entityName(a).localeCompare(entityName(b), 'zh'));
  } else if (sort === 'name_desc') {
    result = [...result].sort((a, b) => entityName(b).localeCompare(entityName(a), 'zh'));
  } else if (sort === 'status') {
    result = [...result].sort((a, b) => {
      const ua = isUnavailable(a);
      const ub = isUnavailable(b);
      if (ua !== ub) return ua ? 1 : -1;
      return entityName(a).localeCompare(entityName(b), 'zh');
    });
  } else if (sort === 'last_changed') {
    result = [...result].sort((a, b) => {
      const ta = a.last_changed ? new Date(a.last_changed).getTime() : 0;
      const tb = b.last_changed ? new Date(b.last_changed).getTime() : 0;
      return tb - ta;
    });
  }

  return result;
}

/** 将前端传入的状态过滤参数规范化（支持 low-battery → low_battery 等变体） */
export function normalizeEntityStatusFilter(raw?: string): EntityStatusFilter {
  if (raw === 'online' || raw === 'offline' || raw === 'low_battery' || raw === 'low-battery') {
    return raw === 'low-battery' ? 'low_battery' : raw;
  }
  return '';
}

/** 将前端传入的排序参数规范化（支持 kebab-case 与 snake_case 变体） */
export function normalizeEntitySortFilter(raw?: string): EntitySortFilter {
  if (raw === 'name-asc') return 'name_asc';
  if (raw === 'name-desc') return 'name_desc';
  if (raw === 'status' || raw === 'last-changed' || raw === 'last_changed') {
    return raw === 'last-changed' ? 'last_changed' : (raw as EntitySortFilter);
  }
  return raw === 'name_asc' || raw === 'name_desc' ? raw : '';
}
