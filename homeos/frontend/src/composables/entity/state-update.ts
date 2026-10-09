/**
 * 实体状态更新核心逻辑（从 entities.store 抽离）
 *
 * 职责：封装单条实体写入与批量实体写入的共享核心 applyEntityChange，
 *      规范化 → 乐观匹配 → 合并 → 写缓存 → 通知判定 → totalCount → derived patch 全流程；
 *      单条路径即时通知、批量路径按 immediate 域分流即时 + rAF 聚合通知，两路径仅保留
 *      派发与聚合策略差异，收敛约 90% 重复逻辑。
 * 关键常量：IMMEDIATE_DOMAINS（事件日志白名单域，即时通知）
 * 导出接口：applyEntityStateUpdate（单条）、applyEntityStatesBatch（批量）、EntityStateUpdateDeps（依赖注入契约）
 * 依赖：state-delta.util（WS 增量合并）、state-listener（监听器派发与聚合）、event-log-domains.util（即时域集）。
 */
import { attrValueEquals, getEntityDomain } from '@homeos/shared'
import type { Ref } from 'vue'
import type { OptimisticEntry } from '@/stores/entities/entity-store-optimistic.util'
import type {
  EntitiesMap,
  EntityPatch,
  EntityStateListenerFlushDeps,
  EntityStateListenerLogger,
  EntityStateListenerPayload,
  EntityStateNotifyArgs,
  HaEntityState,
  OptimisticPrediction,
  ResolveListenerOldStateArgs,
} from '@/types/entity-store'
import {
  mergeWsStateChange,
  normalizeWsBatchChange,
  type WsDeltaChange,
} from '@/utils/entity/state-delta.util'
import {
  dispatchStateListener,
  enqueueStateListenerNotifications,
  notifyStateListener,
  stateListenerPayloadFingerprint,
} from '@/utils/entity/state-listener'
import { EVENT_LOG_OVERLAY_DOMAINS } from '@/utils/entity/event-log-domains.util'

const IMMEDIATE_DOMAINS = new Set<string>(EVENT_LOG_OVERLAY_DOMAINS)

export interface EntityStateUpdateDeps {
  entities: EntitiesMap
  totalCount: Ref<number>
  entityVisible: (entityId: string) => boolean
  optimisticState: Map<string, OptimisticEntry>
  clearOptimistic: (entityId: string) => void
  scheduleRebuildDerived: () => void
  patchDerivedChanges?: (patches: EntityPatch[]) => void
  patchProjectionsFromChanges?: (changes: Array<{ entity_id: string }>) => void
  entitiesCacheHydrated: Ref<boolean>
  schedulePersistEntityCache: () => void
  markEntityCacheDirty?: (entityId: string) => void
  bumpEntityStateRevision?: (entityId?: string) => void
  /** 批量递增版本号：一次性 bump 全局 + 按实体/按域去重，避免逐实体 3 次响应式写 */
  bumpEntityStateRevisionBatch?: (entityIds: string[]) => void
  haStateChanged: (
    oldState: HaEntityState | null | undefined,
    newState: HaEntityState | null | undefined,
  ) => boolean
  shouldNotifyStateChange: (args: EntityStateNotifyArgs) => boolean
  resolveListenerOldState: (args: ResolveListenerOldStateArgs) => HaEntityState | null
  logger?: EntityStateListenerLogger
}

function isImmediateListenerEntity(entityId: string): boolean {
  return IMMEDIATE_DOMAINS.has(getEntityDomain(entityId))
}

function getListenerDeps(deps: EntityStateUpdateDeps): EntityStateListenerFlushDeps {
  return { logger: deps.logger ?? { error: () => undefined } }
}

/** WS 合并后移除乐观标记，避免实体长期携带 _optimistic 并阻断监听器派发 */
function finalizeMergedEntity(mergedNew: HaEntityState | null | undefined): HaEntityState | null {
  if (!mergedNew?._optimistic) return mergedNew ?? null
  const next: HaEntityState = { ...mergedNew }
  delete next._optimistic
  return next
}

/**
 * B4: 复合值递归浅比较已下沉到 @homeos/shared 的 attrValueEquals（前端乐观匹配与后端共享同一真相源）。
 * 维护点统一到 packages/shared/src/entity/attr-value-equals.util.ts，避免两处实现漂移。
 */

/**
 * B4: 判断服务端推送是否与乐观预测一致。
 * expected 为预测的 state/attributes 并集；任一期望字段未被推送命中即视为未确认，
 * 保留乐观标记由 TTL 回滚兜底，避免无关推送提前终结乐观保护。
 */
function optimisticPushMatches(
  entry: OptimisticEntry | undefined,
  mergedNew: HaEntityState | null | undefined,
): boolean {
  const expected = entry?.expected
  if (!expected) return true
  if (expected.state !== undefined && mergedNew?.state !== expected.state) return false
  const expectedAttrs = expected.attributes
  if (expectedAttrs) {
    const curAttrs = mergedNew?.attributes || {}
    for (const key of Object.keys(expectedAttrs)) {
      if (!attrValueEquals(curAttrs[key], expectedAttrs[key])) return false
    }
  }
  return true
}

/**
 * 未确认推送的字段级合并：预测字段保持乐观值，其余字段照常落地。
 *
 * 之前对「与预测不一致」的推送直接整条丢弃（返回 cached），代价是同实体的其它
 * 真实变化（如空调周期性上报当前温度、灯具上报 linkquality）被一起吞掉，
 * 界面要等下一次推送才恢复。这里改为按字段合并：只锁住乐观预测涉及的字段。
 */
function mergeUnconfirmedOptimistic(
  cached: HaEntityState | null,
  pushed: HaEntityState | null,
  expected: OptimisticPrediction | undefined,
): HaEntityState | null {
  const base = cached || pushed
  if (!base) return pushed
  const next: HaEntityState = { ...base }
  if (pushed) {
    // 逐字段显式覆盖：HaEntityState 无索引签名，不能用 Record 强转
    next.entity_id = pushed.entity_id || next.entity_id
    next.state = pushed.state
    if (pushed.last_changed !== undefined) next.last_changed = pushed.last_changed
    if (pushed.last_updated !== undefined) next.last_updated = pushed.last_updated
  }
  const attrs: Record<string, unknown> = {
    ...((base.attributes as Record<string, unknown>) || {}),
    ...((pushed?.attributes as Record<string, unknown>) || {}),
  }
  const expectedAttrs = expected?.attributes
  if (expectedAttrs) {
    for (const key of Object.keys(expectedAttrs)) {
      const value = expectedAttrs[key]
      // 预测为「删除该属性」时同样保持删除，避免被推送值复活
      if (value === undefined) delete attrs[key]
      else attrs[key] = value
    }
  }
  next.attributes = attrs
  if (expected?.state !== undefined) next.state = expected.state
  next._optimistic = true
  return next
}

/**
 * per-entity 应用核心：规范化 → 乐观匹配 → 合并 → 写缓存 → 通知判定 → totalCount → derived patch。
 * 单条与批量共用，收敛乐观匹配、shouldNotify、derived patch、totalCount、revision 递增等约 90% 重复逻辑；
 * 派发/聚合策略（即时通知 vs 批量 rAF、逐条 bump vs 批量 bump）由两路径各自保留。
 */
interface EntityChangeOutcome {
  entityId: string
  mergedNew: HaEntityState | null
  notifyPayload: EntityStateListenerPayload | null
  derivedPatch: EntityPatch | null
  countDelta: -1 | 0 | 1
}

function applyEntityChange(
  deps: EntityStateUpdateDeps,
  raw: WsDeltaChange,
): EntityChangeOutcome | null {
  const data = raw?._delta ? normalizeWsBatchChange(raw, deps.entities) : raw
  if (!data?.entity_id || !deps.entityVisible(data.entity_id)) return null

  const cached = deps.entities[data.entity_id] || null
  const cachedOld = cached?.state
  const hadOptimistic =
    deps.optimisticState.size > 0 && deps.optimisticState.has?.(data.entity_id)
  let mergedNew = finalizeMergedEntity(
    raw?._delta ? mergeWsStateChange(cached, raw) : data.new_state,
  )
  // Worker 预规范化路径（_delta 已剥离）下，new_state 基于入队时快照计算；
  // 若该实体此刻存在挂起乐观更新，改以 live cached 属性为底叠加透传的 changed_attributes，
  // 避免用旧快照覆盖并发乐观写入的未变更属性（极窄竞态，仅乐观态实体走此分支）。
  if (!raw?._delta && hadOptimistic && data?.changed_attributes && mergedNew) {
    const attrs = { ...(cached?.attributes || {}), ...data.changed_attributes }
    // delta 携带的删除属性同样生效，避免从缓存回填时复活已删除的属性
    if (Array.isArray(data.removed_attributes)) {
      for (const key of data.removed_attributes) delete attrs[key]
    }
    mergedNew = finalizeMergedEntity({
      ...mergedNew,
      attributes: attrs,
    })
  }
  const newStateValue = mergedNew?.state
  // 仅当推送与预测一致（或对应 service 确认）时才清除乐观标记；
  // 无关推送（如同实体的周期性属性上报）不再提前终结 TTL，由乐观 TTL 回滚兜底
  if (deps.optimisticState.has(data.entity_id)) {
    const entry = deps.optimisticState.get(data.entity_id)
    if (optimisticPushMatches(entry, mergedNew)) {
      deps.clearOptimistic(data.entity_id)
    } else {
      // 未确认：字段级合并（预测字段保持乐观值，其余字段照常落地），
      // 由乐观 TTL 回滚 + 到期 REST 校正兜底，而不是把整条推送丢掉
      mergedNew = mergeUnconfirmedOptimistic(cached, mergedNew, entry?.expected)
    }
  }

  if (mergedNew) {
    deps.entities[data.entity_id] = mergedNew
  } else {
    delete deps.entities[data.entity_id]
  }
  deps.markEntityCacheDirty?.(data.entity_id)

  const haReportedChange = deps.haStateChanged(data.old_state, mergedNew)
  const shouldNotify = deps.shouldNotifyStateChange({
    cached,
    cachedOld,
    newStateValue,
    oldState: data.old_state,
    newState: mergedNew,
    changedAttributes: raw?._delta ? raw.changed_attributes : data?.changed_attributes,
  })

  let notifyPayload: EntityStateListenerPayload | null = null
  if (shouldNotify) {
    const oldForListener = deps.resolveListenerOldState({
      haReportedChange,
      oldState: data.old_state,
      cached,
    })
    notifyPayload = {
      entity_id: data.entity_id,
      new_state: mergedNew,
      old_state: oldForListener,
    }
  }

  const hadEntity = Boolean(cached)
  const hasEntity = Boolean(mergedNew)
  const countDelta = !hadEntity && hasEntity ? 1 : hadEntity && !hasEntity ? -1 : 0

  const derivedPatch: EntityPatch | null = deps.patchDerivedChanges
    ? { entity_id: data.entity_id, oldEntity: cached, newEntity: mergedNew || null }
    : null

  return { entityId: data.entity_id, mergedNew, notifyPayload, derivedPatch, countDelta }
}

export function applyEntityStateUpdate(deps: EntityStateUpdateDeps, data: WsDeltaChange): void {
  const outcome = applyEntityChange(deps, data)
  if (!outcome) return

  deps.patchProjectionsFromChanges?.([{ entity_id: outcome.entityId }])

  if (outcome.notifyPayload) {
    notifyStateListener(
      getListenerDeps(deps),
      outcome.notifyPayload,
      { immediate: isImmediateListenerEntity(outcome.entityId) },
    )
  }

  if (outcome.countDelta !== 0) {
    deps.totalCount.value = Math.max(0, deps.totalCount.value + outcome.countDelta)
  }

  if (deps.patchDerivedChanges) {
    if (outcome.derivedPatch) deps.patchDerivedChanges([outcome.derivedPatch])
  } else {
    deps.scheduleRebuildDerived()
  }
  if (!deps.entitiesCacheHydrated.value) deps.schedulePersistEntityCache()
  // 传入实体 ID：仅递增该实体与其所属域的版本号，避免全局扇出
  deps.bumpEntityStateRevision?.(outcome.entityId)
}

export function applyEntityStatesBatch(
  deps: EntityStateUpdateDeps,
  changes: WsDeltaChange[],
): void {
  if (!changes?.length) return
  let countDelta = 0
  // 本批次实际写入的实体 ID 集合（用于逐实体递增版本号，粒度化失效）
  const updatedIds: string[] = []
  const notifications: EntityStateListenerPayload[] = []
  const derivedPatches: EntityPatch[] = []

  for (let i = 0; i < changes.length; i++) {
    const outcome = applyEntityChange(deps, changes[i])
    if (!outcome) continue
    if (outcome.notifyPayload) notifications.push(outcome.notifyPayload)
    countDelta += outcome.countDelta
    updatedIds.push(outcome.entityId)
    if (outcome.derivedPatch) derivedPatches.push(outcome.derivedPatch)
  }

  if (countDelta !== 0) {
    deps.totalCount.value = Math.max(0, deps.totalCount.value + countDelta)
  }

  if (deps.patchProjectionsFromChanges && derivedPatches.length) {
    deps.patchProjectionsFromChanges(derivedPatches.map((p) => ({ entity_id: p.entity_id })))
  }

  if (notifications.length) {
    const listenerDeps = getListenerDeps(deps)
    const batched: EntityStateListenerPayload[] = []
    const seenImmediate = new Set<string>()
    for (let i = 0; i < notifications.length; i++) {
      const payload = notifications[i]
      if (isImmediateListenerEntity(payload.entity_id)) {
        const fp = stateListenerPayloadFingerprint(payload)
        if (seenImmediate.has(fp)) continue
        seenImmediate.add(fp)
        dispatchStateListener(payload, listenerDeps.logger)
      } else {
        batched.push(payload)
      }
    }
    if (batched.length) {
      enqueueStateListenerNotifications(listenerDeps, batched)
    }
  }

  if (deps.patchDerivedChanges) {
    if (derivedPatches.length) deps.patchDerivedChanges(derivedPatches)
  } else {
    deps.scheduleRebuildDerived()
  }
  if (!deps.entitiesCacheHydrated.value) deps.schedulePersistEntityCache()
  // 批量递增版本号（粒度化失效：仅受影响实体/域重算）：
  // 全量/回退批次常含上千实体，逐实体 bump 会产生 3×N 次响应式写；
  // 改为一次全局 bump + 实体/域去重批量 bump，语义不变（同宏任务内多次递增本就只触发一次响应式更新）
  if (updatedIds.length) {
    if (deps.bumpEntityStateRevisionBatch) {
      deps.bumpEntityStateRevisionBatch(updatedIds)
    } else {
      for (let i = 0; i < updatedIds.length; i++) {
        deps.bumpEntityStateRevision?.(updatedIds[i])
      }
    }
  }
}
