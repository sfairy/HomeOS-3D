/**
 * WS 推送负载与 Redis 状态消息构造工具。
 *
 * 职责：
 * - 将 HaStateChangeEvent 转换为 WS 客户端 state_changed 负载，自动选择全量或 delta 模式以节省带宽。
 * - 维护 80ms 短窗口 diff 缓存：高频 sensor 同值事件（仅时间戳变化）命中缓存，避免重复 diff。
 * - 提供客户端重连 state_replay 参数解析与是否需要重放的判定。
 * - 构造 redis_status 广播负载，与首连推送格式保持一致。
 *
 * 关键依赖：entity-state-diff.util（属性 diff）、shared/types（HA 事件类型）。
 */
import type { HaEntity, HaStateChangeEvent } from '../../shared/types';
import { pickChangedAttributes } from '../../shared/ha/entity-state-diff.util';

interface WsStateChangePayload {
  entity_id: string;
  old_state: HaEntity | null;
  new_state: HaEntity | null;
  changed_at: string;
  /** 增量推送：仅携带变更字段，前端需 merge 到现有实体 */
  _delta?: true;
  state?: string;
  changed_attributes?: Record<string, unknown>;
  /**
   * 增量推送：本次被删除的属性名列表（属性删除传播）。
   * 协议扩展字段：旧客户端会忽略，新客户端兼容无该字段的旧服务端。
   */
  removed_attributes?: string[];
  /** HomeOS 入站 epoch ms，供前端算 E2E apply 延迟 */
  _pipelineTs?: number;
}

const DELTA_ATTR_SKIP = new Set(['last_changed', 'last_updated', 'last_reported']);

/**
 * 单次 diff 的计算结果（变更/删除属性 + state 是否变化）
 */
interface DeltaDiffResult {
  changed: Record<string, unknown> | null;
  removed: string[] | null;
  stateChanged: boolean;
}

/** 缓存条目：在 diff 结果基础上附加过期时间 */
interface DeltaDiffCacheEntry extends DeltaDiffResult {
  expiresAt: number;
}

/** 广播属性 diff 结果缓存短窗口 TTL（毫秒）：覆盖高频 sensor 同值事件的重复 diff 窗口 */
const DELTA_DIFF_CACHE_TTL_MS = 80;
/** 缓存容量上限：超过时整体清空（冷路径低频访问，重建成本可接受） */
const DELTA_DIFF_CACHE_MAX = 4096;

const deltaDiffCache = new Map<string, DeltaDiffCacheEntry>();

/**
 * 计算单次 diff 结果（不含缓存）：提取变更/删除属性与 state 是否变化。
 */
function computeStateDiff(event: HaStateChangeEvent): DeltaDiffResult {
  const { changed, removed } = pickChangedAttributes(
    event.old_state?.attributes,
    event.new_state?.attributes,
    DELTA_ATTR_SKIP,
  );
  return {
    changed,
    removed,
    stateChanged: event.old_state?.state !== event.new_state?.state,
  };
}

/**
 * 构造 diff 缓存 key：entity_id + 新旧状态轻量指纹。
 * 指纹覆盖 diff 的全部依赖输入（state + attributes），但排除被 DELTA_ATTR_SKIP 跳过的时间戳类属性，
 * 使高频 sensor 同值事件（仅时间戳变化）命中缓存；状态再变更时指纹变化即自然失效/覆盖旧条目。
 */
function buildDeltaDiffCacheKey(event: HaStateChangeEvent): string {
  const oldS = event.old_state;
  const newS = event.new_state;
  let key = `${event.entity_id}|${oldS?.state ?? ''}|${newS?.state ?? ''}`;
  key += `|o:${fingerprintAttributes(oldS?.attributes)}`;
  key += `|n:${fingerprintAttributes(newS?.attributes)}`;
  return key;
}

/** 属性轻量指纹：按插入顺序序列化非跳过属性（相同 JSON 解析后属性顺序稳定，无需排序） */
function fingerprintAttributes(attrs: Record<string, unknown> | undefined): string {
  if (!attrs) return '';
  let s = '';
  for (const k of Object.keys(attrs)) {
    if (DELTA_ATTR_SKIP.has(k)) continue;
    const v = attrs[k];
    s += `${k}:${v === undefined ? 'undefined' : JSON.stringify(v)};`;
  }
  return s;
}

/** 读取未过期的缓存 diff；过期条目惰性删除 */
function readDeltaDiffCache(key: string): DeltaDiffCacheEntry | null {
  const entry = deltaDiffCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    deltaDiffCache.delete(key);
    return null;
  }
  return entry;
}

/** 写入缓存：容量超限时整体清空，防止高频实体集长期占用内存 */
function writeDeltaDiffCache(key: string, diff: DeltaDiffResult): void {
  if (deltaDiffCache.size >= DELTA_DIFF_CACHE_MAX) {
    deltaDiffCache.clear();
  }
  deltaDiffCache.set(key, { ...diff, expiresAt: Date.now() + DELTA_DIFF_CACHE_TTL_MS });
}

/** 构建 WS 推送负载：在可能时发送 delta 以减少带宽与序列化开销 */
export function toWsStateChangePayload(event: HaStateChangeEvent): WsStateChangePayload {
  const pipelineTs =
    typeof event.pipeline_ts === 'number' && Number.isFinite(event.pipeline_ts)
      ? event.pipeline_ts
      : undefined;
  const base: WsStateChangePayload = {
    entity_id: event.entity_id,
    old_state: event.old_state,
    new_state: event.new_state,
    changed_at: event.changed_at,
    ...(pipelineTs != null ? { _pipelineTs: pipelineTs } : {}),
  };

  if (!event.new_state || !event.old_state) return base;

  // 广播属性 diff 结果缓存：同一实体在短窗口内以相同状态输入重复计算时直接复用，
  // 避免高频 sensor 同值事件（仅 last_changed/last_updated 等时间戳属性变化）重复执行属性 diff。
  // 缓存仅保存 diff 结果，payload 仍以当前事件字段重建，保证 changed_at / 实体快照始终为最新。
  const cacheKey = buildDeltaDiffCacheKey(event);
  // 以 DeltaDiffResult 为声明类型：缓存命中（CacheEntry 是其子类型）与未命中重算（computeStateDiff 返回该类型）均可赋值
  let diff: DeltaDiffResult | null = readDeltaDiffCache(cacheKey);
  if (!diff) {
    diff = computeStateDiff(event);
    writeDeltaDiffCache(cacheKey, diff);
  }
  const { changed: changedAttrs, removed: removedAttrs, stateChanged } = diff;

  // 变更规模 = 变更/新增属性数 + 删除属性数，决定是否值得走 delta
  const deltaAttrCount =
    (changedAttrs ? Object.keys(changedAttrs).length : 0) + (removedAttrs?.length ?? 0);

  if (!stateChanged && deltaAttrCount === 0) {
    return base;
  }

  const oldAttrCount = Object.keys(event.old_state.attributes || {}).length;
  const newAttrCount = Object.keys(event.new_state.attributes || {}).length;

  if (deltaAttrCount > 0 && deltaAttrCount < Math.min(oldAttrCount, newAttrCount) * 0.6) {
    return {
      entity_id: event.entity_id,
      old_state: null,
      new_state: null,
      changed_at: event.changed_at,
      _delta: true,
      state: event.new_state.state,
      ...(changedAttrs ? { changed_attributes: changedAttrs } : {}),
      ...(removedAttrs ? { removed_attributes: removedAttrs } : {}),
      ...(pipelineTs != null ? { _pipelineTs: pipelineTs } : {}),
    };
  }

  if (stateChanged && deltaAttrCount <= 8) {
    return {
      entity_id: event.entity_id,
      old_state: null,
      new_state: null,
      changed_at: event.changed_at,
      _delta: true,
      state: event.new_state.state,
      ...(changedAttrs ? { changed_attributes: changedAttrs } : {}),
      ...(removedAttrs ? { removed_attributes: removedAttrs } : {}),
      ...(pipelineTs != null ? { _pipelineTs: pipelineTs } : {}),
    };
  }

  return base;
}

type RedisWsStatus = 'unavailable' | 'offline' | 'connected';

function buildRedisWsStatus(configured: boolean, ready: boolean): RedisWsStatus {
  if (!configured) return 'unavailable';
  if (!ready) return 'offline';
  return 'connected';
}

/** 构造 Redis 状态广播负载（type/status/configured/timestamp），供 WsPushGateway 在 Redis 连接变更时调用 */
export function buildRedisWsStatusPayload(configured: boolean, ready: boolean) {
  return {
    type: 'redis_status' as const,
    status: buildRedisWsStatus(configured, ready),
    configured,
    timestamp: new Date().toISOString(),
  };
}

/**
 * 解析客户端重连握手参数 since / lastEventId，转为数值（无效则归零）。
 * since 用 Date.parse 解析为毫秒时间戳，lastEventId 用 parseInt 解析为整数。
 */
export function parseStateReplayParams(
  sinceRaw: unknown,
  lastEventIdRaw: unknown,
): { sinceMs: number; lastEventId: number } {
  const sinceMs = sinceRaw ? Date.parse(String(sinceRaw)) : 0;
  const lastEventId = lastEventIdRaw ? parseInt(String(lastEventIdRaw), 10) : 0;
  return {
    sinceMs: Number.isFinite(sinceMs) ? sinceMs : 0,
    lastEventId: Number.isFinite(lastEventId) ? lastEventId : 0,
  };
}

/** 判定是否需要触发 state_replay：since 或 lastEventId 任一有效即重放增量 */
export function shouldReplayState(sinceMs: number, lastEventId: number): boolean {
  return sinceMs > 0 || lastEventId > 0;
}
