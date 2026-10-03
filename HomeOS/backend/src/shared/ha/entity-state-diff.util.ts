/**
 * @module shared/ha
 * @file entity-state-diff.util.ts
 * @brief HA 实体状态差异检测与全量重同步 diff 计算；初始状态批量同步计划守卫。
 *
 * 职责：
 *  - 判定单个实体状态是否发生变化（state 或 attributes）；
 *  - 计算 REST 重同步场景下旧快照与新全量状态之间的 diff（新增 / 移除 / 修改）；
 *  - 提供 InitialStatesSyncPlan 类型守卫，区分初始批量推送与增量事件。
 *
 * 外部依赖：
 *  - HaEntity / HaStateChangeEvent：HA 实体与状态变更事件（来自 ../types）。
 *
 * 注意：attributes 比较使用 JSON.stringify，适用于中等规模快照；超大实例需评估性能。
 */
import type { HaEntity, HaStateChangeEvent } from '../types';

/**
 * 初始状态同步计划。
 * 通过 _syncPlan 品牌字段与增量事件区分，避免下游误将批量快照当作单条变更处理。
 */
export interface InitialStatesSyncPlan {
  /** 品牌字段，固定为 true，用于类型守卫判定 */
  _syncPlan: true;
  /** 初始全量实体列表 */
  entities: HaEntity[];
  /**
   * HA 重连/恢复增量重推：重推前基线（state-store）与新全量快照之间的差异。
   * 仅当存在历史基线且由 syncInitialStatesFromHa 计算时携带；首次连接/无基线/手动构造时不携带，
   * 接收方缺省回退全量重推。
   */
  resyncChanges?: HaStateChangeEvent[];
}

/**
 * 判定未知负载是否为 InitialStatesSyncPlan。
 *
 * @param payload 任意未知值。
 * @returns 类型谓词，true 时 payload 可作为 InitialStatesSyncPlan 使用。
 */
export function isInitialStatesSyncPlan(payload: unknown): payload is InitialStatesSyncPlan {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    (payload as InitialStatesSyncPlan)._syncPlan === true &&
    Array.isArray((payload as InitialStatesSyncPlan).entities)
  );
}

/**
 * 属性级差异提取共用核心（供增量推送 delta.util 与断线重同步两处复用）。
 *
 * 比较语义：键序无关的浅比较。两个值是否不同只取决于键值本身，
 * 与键遍历顺序无关——刻意避免 JSON.stringify 深度比较将"键序差异"误判为变化
 * （值相同仅键序不同的快照会生成无意义的重同步事件）。
 *
 * 安全性：浅比较对任何真实值变化（标量 / 数组逐元素 / 对象键值）均能检出；
 * 仅"纯键序变化且值全同"的零变化输入判为无差异，这正是期望语义。
 */
function valuesShallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
    for (const key of keys) {
      if (ao[key] !== bo[key]) return false;
    }
    return true;
  }
  return false;
}

/**
 * 提取新旧属性之间的差异。
 *
 * @param skipKeys 比较时跳过的属性键（如时间戳类 last_changed/last_updated）；
 *                增量推送传 DELTA_ATTR_SKIP；断线重同步不传（全属性参与判定）。
 * @returns changed：变更/新增的属性；removed：被删除的属性名（旧值存在而新值缺失）。
 */
export function pickChangedAttributes(
  oldAttrs: Record<string, unknown> | undefined,
  newAttrs: Record<string, unknown> | undefined,
  skipKeys?: ReadonlySet<string>,
): { changed: Record<string, unknown> | null; removed: string[] | null } {
  const changed: Record<string, unknown> = {};
  const removed: string[] = [];
  const keys = new Set([...Object.keys(oldAttrs || {}), ...Object.keys(newAttrs || {})]);
  for (const key of keys) {
    if (skipKeys?.has(key)) continue;
    const o = oldAttrs?.[key];
    const n = newAttrs?.[key];
    if (!valuesShallowEqual(o, n)) {
      if (o !== undefined && n === undefined) {
        // 属性删除：旧值存在而新值缺失
        removed.push(key);
      } else if (n !== undefined) {
        changed[key] = n;
      }
    }
  }
  return {
    changed: Object.keys(changed).length > 0 ? changed : null,
    removed: removed.length > 0 ? removed : null,
  };
}

/**
 * 判定两个实体状态是否发生变化。
 *
 * @param prev 旧状态。
 * @param next 新状态。
 * @returns true 表示 state 字符串或 attributes 对象发生变化。
 *          attributes 复用 pickChangedAttributes 的键序无关浅比较判定。
 */
function isEntityStateChanged(prev: HaEntity, next: HaEntity): boolean {
  if (prev.state !== next.state) return true;
  const { changed, removed } = pickChangedAttributes(prev.attributes, next.attributes);
  return changed !== null || removed !== null;
}

/**
 * 计算重同步 diff：对比旧快照与新全量状态，生成状态变更事件列表。
 *
 * 用于 REST 断连重连后，将差异以统一事件形式重放到事件总线，使下游无需感知同步来源。
 *
 * @param previous 旧快照：entity_id -> HaEntity。
 * @param incoming 新全量实体列表。
 * @param changedAt 变更时间戳，默认当前时间；用于事件 changed_at 字段。
 * @returns HaStateChangeEvent[]，包含三类变更：
 *          1. 旧有新无 -> new_state: null（移除）；
 *          2. 旧有新有且变更 -> old_state + new_state（修改）；
 *          3. 旧无新有 -> old_state: null（新增）。
 */
export function computeResyncDiff(
  previous: Map<string, HaEntity>,
  incoming: HaEntity[],
  changedAt = new Date().toISOString(),
): HaStateChangeEvent[] {
  const changes: HaStateChangeEvent[] = [];
  const incomingMap = new Map<string, HaEntity>();
  for (const entity of incoming) {
    incomingMap.set(entity.entity_id, entity);
  }

  // 第一轮：遍历旧快照，检测移除与修改
  for (const [entityId, oldState] of previous) {
    const newState = incomingMap.get(entityId);
    if (!newState) {
      // 旧有新无：实体已移除
      changes.push({
        entity_id: entityId,
        old_state: oldState,
        new_state: null,
        changed_at: changedAt,
      });
      continue;
    }
    if (isEntityStateChanged(oldState, newState)) {
      // 新旧均存在但状态或属性变化
      changes.push({
        entity_id: entityId,
        old_state: oldState,
        new_state: newState,
        changed_at: changedAt,
      });
    }
  }

  // 第二轮：遍历新全量，检测新增（旧快照中不存在）
  for (const entity of incoming) {
    if (!previous.has(entity.entity_id)) {
      changes.push({
        entity_id: entity.entity_id,
        old_state: null,
        new_state: entity,
        changed_at: changedAt,
      });
    }
  }

  return changes;
}
