/**
 * Redis 事件总线桥接瘦负载工具：压缩跨副本广播的 HA 状态事件，节省 Pub/Sub 带宽。
 *
 * 核心职责：
 *  - STATE_CHANGED/STATE_CHANGED_BATCH：剥离 old_state，接收方从本地 L1 补全；
 *  - INITIAL_STATES：超过阈值时改为引用占位符，避免一次推送数 MB 实体快照；
 *  - 提供类型守卫，供 Follower 端判断 payload 结构并走对应补全路径。
 * 关键依赖：../types 中 HA_EVENTS/HaStateChange* 类型、../ha/entity-state-diff.util 同步计划判定。
 */

import { HA_EVENTS } from '../types';
import type { HaEntity, HaStateChangeEvent, HaStateChangeBatchEvent } from '../types';
import { isInitialStatesSyncPlan } from '../ha/entity-state-diff.util';

/**
 * Redis 桥接：INITIAL_STATES 引用（避免 Pub/Sub 传输多 MB 数组）。
 * 仅携带 count 与时间戳，Follower 收到后主动拉取全量状态。
 */
interface InitialStatesRefPayload {
  _bridgeType: 'initial_states_ref';
  /** 实体状态条目数 */
  count: number;
  /** 引用生成时间（ISO 字符串） */
  at: string;
}

/**
 * 类型守卫：判断 payload 是否为 INITIAL_STATES 引用占位符。
 * @param payload - 待判断的未知值
 * @returns 当且仅当 payload 含 `_bridgeType === 'initial_states_ref'` 时为 true
 */
export function isInitialStatesRefPayload(payload: unknown): payload is InitialStatesRefPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    (payload as InitialStatesRefPayload)._bridgeType === 'initial_states_ref'
  );
}

/**
 * Redis 桥接：STATE_CHANGED 瘦负载（省略 old_state，Follower 从 L1 补全）。
 * 通过 `_slim: true` 标记，接收方据此判断是否需要补全 old_state。
 */
interface SlimStateChangeEvent extends HaStateChangeEvent {
  /** 瘦负载标记；为 true 表示 old_state 已被省略，需接收方补全 */
  _slim?: true;
}

/**
 * 类型守卫：判断事件是否为瘦负载。
 * @param event - HA 状态变更事件
 * @returns 当且仅当事件携带 `_slim === true` 时为 true
 */
function isSlimStateChangeEvent(event: HaStateChangeEvent): event is SlimStateChangeEvent {
  return (event as SlimStateChangeEvent)._slim === true;
}

// INITIAL_STATES 超过该阈值改用引用占位符：50 条（50 * HaEntity ≈ 10~20KB 仍可 Pub/Sub；
// 超过后典型家庭实体 1000~3000 条会达数 MB，改为引用后由 Follower 主动从 Leader/L2 拉取）。
const INITIAL_STATES_REF_THRESHOLD = 50;

/**
 * 根据 Redis 桥接策略转换原始事件负载。
 *
 * 处理规则：
 *  - STATE_CHANGED：转为 SlimStateChangeEvent，省略 old_state；
 *  - STATE_CHANGED_BATCH：批量转为瘦负载数组；
 *  - INITIAL_STATES：当条目数 >= 阈值（50）时转为引用占位符，避免传输多 MB 数组；
 *  - 其他事件：原样返回。
 *
 * @param event - HA 事件名（HA_EVENTS 枚举值）
 * @param payload - 原始事件负载
 * @returns 桥接后的负载（瘦负载 / 引用占位符 / 原值）
 */
export function prepareBridgedPayload(event: string, payload: unknown): unknown {
  if (event === HA_EVENTS.STATE_CHANGED && payload && typeof payload === 'object') {
    const e = payload as HaStateChangeEvent;
    // 省略 old_state：Follower 端收到后从本地 L1 缓存补全
    return {
      entity_id: e.entity_id,
      new_state: e.new_state,
      old_state: null,
      changed_at: e.changed_at,
      _slim: true,
    } satisfies SlimStateChangeEvent;
  }
  if (event === HA_EVENTS.STATE_CHANGED_BATCH && payload && typeof payload === 'object') {
    const batch = payload as HaStateChangeBatchEvent;
    const changes = Array.isArray(batch.changes) ? batch.changes : [];
    // 批量场景同样省略每条变更的 old_state
    return {
      _bridgeType: 'state_changed_batch',
      changes: changes.map((e) => ({
        entity_id: e.entity_id,
        new_state: e.new_state,
        old_state: null,
        changed_at: e.changed_at,
        _slim: true,
      })),
    };
  }
  if (
    event === HA_EVENTS.INITIAL_STATES &&
    (Array.isArray(payload) || isInitialStatesSyncPlan(payload))
  ) {
    const count = Array.isArray(payload) ? payload.length : payload.entities.length;
    // 超过阈值时改发引用占位符，Follower 主动拉取全量状态
    if (count >= INITIAL_STATES_REF_THRESHOLD) {
      return {
        _bridgeType: 'initial_states_ref',
        count,
        at: new Date().toISOString(),
      } satisfies InitialStatesRefPayload;
    }
  }
  return payload;
}

/**
 * 补全瘦负载事件的 old_state。
 * 若事件非瘦负载或 old_state 已存在则原样返回；否则通过 getPreviousState 查询本地缓存。
 *
 * @param event - 接收到的 HA 状态变更事件
 * @param getPreviousState - 从本地 L1 缓存查询实体上一状态的回调
 * @returns 补全 old_state 后的事件
 */
export function enrichSlimStateChangeEvent(
  event: HaStateChangeEvent,
  getPreviousState: (entityId: string) => HaEntity | undefined,
): HaStateChangeEvent {
  if (!isSlimStateChangeEvent(event) || event.old_state != null) return event;
  return {
    ...event,
    old_state: getPreviousState(event.entity_id) ?? null,
  };
}