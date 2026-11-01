/** 实体状态更新核心逻辑（从 entities.store 抽离） */
import { getEntityDomain } from '@homeos/shared'
import type { Ref } from 'vue'
import { optimisticExpectationSatisfied } from '@/stores/entities/optimistic-expectation.util'
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
} from '@/shared/types/entity-store'
import {
  isStaleState,
  mergeWsStateChange,
  normalizeWsBatchChange,
  type WsDeltaChange,
} from '@/shared/entity/utils/state-delta.util'
import {
  dispatchStateListener,
  enqueueStateListenerNotifications,
  notifyStateListener,
  stateListenerPayloadFingerprint,
} from '@/shared/entity/utils/state-listener'
import { EVENT_LOG_OVERLAY_DOMAINS } from '@/shared/entity/utils/event-log-domains.util'

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
 * 乐观匹配本身见 entity-store-optimistic.util 的 optimisticExpectationSatisfied。
 */

/**
 * B4: 判断服务端推送是否与乐观预测一致。
 * expected 为预测的 state/attributes 并集；任一期望字段未被推送命中即视为未确认，
 * 保留乐观标记由 TTL 回滚兜底，避免无关推送提前终结乐观保护。
 *
 * 判定实现下沉到 ``optimisticExpectationSatisfied``：与「建立乐观态之前的短路」共用
 * 同一份真相源，避免两处判据漂移（一边允许跳过、另一边却认为未确认）。
 */
function optimisticPushMatches(
  entry: OptimisticEntry | undefined,
  mergedNew: HaEntityState | null | undefined,
): boolean {
  return optimisticExpectationSatisfied(entry?.expected, mergedNew)
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

/**
 * 删除事件的落库结果：清缓存 + 递减总数 + 派发一次「新态为空」的监听通知。
 *
 * 派发通知是必要的：看板/设备卡片都按「实体还在不在」决定要不要继续渲染，
 * 不通知的话它们会持有一份已经不在 store 里的 id，直到下一次全量重建。
 */
function removalOutcome(
  deps: EntityStateUpdateDeps,
  entityId: string,
  cached: HaEntityState | null,
): EntityChangeOutcome | null {
  if (deps.optimisticState.has(entityId)) deps.clearOptimistic(entityId)
  delete deps.entities[entityId]
  deps.markEntityCacheDirty?.(entityId)
  const notifyPayload: EntityStateListenerPayload | null = cached
    ? { entity_id: entityId, new_state: null, old_state: cached }
    : null
  return {
    entityId,
    mergedNew: null,
    notifyPayload,
    derivedPatch: deps.patchDerivedChanges
      ? { entity_id: entityId, oldEntity: cached, newEntity: null }
      : null,
    countDelta: cached ? -1 : 0,
  }
}

/**
 * Worker 预规范化路径（``_delta`` 已剥离）下，``new_state`` 基于入队时快照计算；
 * 若该实体此刻存在挂起乐观更新，改以 live cached 属性为底叠加透传的 ``changed_attributes``，
 * 避免用旧快照覆盖并发乐观写入的未变更属性（极窄竞态，仅乐观态实体走此分支）。
 */
function overlayAttributesOnOptimistic(
  cached: HaEntityState | null,
  data: WsDeltaChange,
  mergedNew: HaEntityState,
): HaEntityState {
  const attrs = { ...(cached?.attributes || {}), ...data.changed_attributes }
  // delta 携带的删除属性同样生效，避免从缓存回填时复活已删除的属性
  if (Array.isArray(data.removed_attributes)) {
    for (const key of data.removed_attributes) delete attrs[key]
  }
  return finalizeMergedEntity({ ...mergedNew, attributes: attrs }) as HaEntityState
}

/**
 * 乐观态结算：与预测一致（或对应 service 确认）才清除乐观标记；否则按字段合并 ——
 * 无关推送（同实体的周期性属性上报）不再提前终结 TTL，由乐观 TTL 回滚兜底。
 */
function reconcileOptimistic(
  deps: EntityStateUpdateDeps,
  entityId: string,
  cached: HaEntityState | null,
  mergedNew: HaEntityState | null,
): HaEntityState | null {
  if (!deps.optimisticState.has(entityId)) return mergedNew
  const entry = deps.optimisticState.get(entityId)
  if (optimisticPushMatches(entry, mergedNew)) {
    deps.clearOptimistic(entityId)
    return mergedNew
  }
  return mergeUnconfirmedOptimistic(cached, mergedNew, entry?.expected)
}

/** 落库：有值写缓存；空值视为删除（HA 侧实体被删/禁用），并先撤掉乐观态避免回滚复活。 */
function writeEntityState(
  deps: EntityStateUpdateDeps,
  entityId: string,
  mergedNew: HaEntityState | null,
): void {
  if (mergedNew) {
    deps.entities[entityId] = mergedNew
    return
  }
  // 必须先撤掉乐观态。否则乐观 TTL 到期回滚时会把缓存的旧值写回来 —— 幽灵实体
  // 从「删掉」变成「过几秒自己又出现」，而且之后没有任何推送会再纠正它。
  if (deps.optimisticState.has(entityId)) deps.clearOptimistic(entityId)
  delete deps.entities[entityId]
}

/** 监听器载荷：``shouldNotify`` 判定 + 旧态解析，与单条/批量路径共用。 */
function buildNotifyPayload(
  deps: EntityStateUpdateDeps,
  raw: WsDeltaChange,
  data: WsDeltaChange,
  cached: HaEntityState | null,
  cachedOld: string | undefined,
  mergedNew: HaEntityState | null,
): EntityStateListenerPayload | null {
  const haReportedChange = deps.haStateChanged(data.old_state, mergedNew)
  const shouldNotify = deps.shouldNotifyStateChange({
    cached,
    cachedOld,
    newStateValue: mergedNew?.state,
    oldState: data.old_state,
    newState: mergedNew,
    changedAttributes: raw?._delta ? raw.changed_attributes : data?.changed_attributes,
  })
  if (!shouldNotify) return null
  const oldForListener = deps.resolveListenerOldState({
    haReportedChange,
    oldState: data.old_state,
    cached,
  })
  return { entity_id: data.entity_id, new_state: mergedNew, old_state: oldForListener }
}

function entityCountDelta(cached: HaEntityState | null, mergedNew: HaEntityState | null): -1 | 0 | 1 {
  const hadEntity = Boolean(cached)
  const hasEntity = Boolean(mergedNew)
  if (!hadEntity && hasEntity) return 1
  return hadEntity && !hasEntity ? -1 : 0
}

function applyEntityChange(
  deps: EntityStateUpdateDeps,
  raw: WsDeltaChange,
): EntityChangeOutcome | null {
  const data = raw?._delta ? normalizeWsBatchChange(raw, deps.entities) : raw
  if (!data?.entity_id || !deps.entityVisible(data.entity_id)) return null

  const cached = deps.entities[data.entity_id] || null
  // 删除事件先于一切合并逻辑处理：``new_state`` 为空会让后面的乐观分支走进
  // ``mergeUnconfirmedOptimistic``（它拿 cached 当底），把「删掉」变成「什么都没发生」。
  // 服务端对删除显式标 ``removed``；把「非 delta 且 new_state 为空」也算删除，是因为
  // 那是服务端唯一会发出的空态载荷（增量 delta 一律带 ``_delta``）。
  if (raw?.removed === true || (!raw?._delta && data.new_state === null)) {
    return removalOutcome(deps, data.entity_id, cached)
  }
  // 乱序保护：先发出、后到达的推送不能把新状态写回旧值。丢掉整条（连同其属性级变更）
  // 是对的 —— 本地已有一条**更新**的完整状态，它必然包含了这条旧推送的全部信息。
  if (isStaleState(data.changed_at ?? raw.changed_at, cached)) return null
  const cachedOld = cached?.state
  const hadOptimistic =
    deps.optimisticState.size > 0 && deps.optimisticState.has?.(data.entity_id)
  let mergedNew = finalizeMergedEntity(
    raw?._delta ? mergeWsStateChange(cached, raw) : data.new_state,
  )
  if (!raw?._delta && hadOptimistic && data?.changed_attributes && mergedNew) {
    mergedNew = overlayAttributesOnOptimistic(cached, data, mergedNew)
  }
  mergedNew = reconcileOptimistic(deps, data.entity_id, cached, mergedNew)
  writeEntityState(deps, data.entity_id, mergedNew)
  deps.markEntityCacheDirty?.(data.entity_id)

  const notifyPayload = buildNotifyPayload(
    deps,
    raw,
    data,
    cached,
    cachedOld,
    mergedNew,
  )
  const derivedPatch: EntityPatch | null = deps.patchDerivedChanges
    ? { entity_id: data.entity_id, oldEntity: cached, newEntity: mergedNew || null }
    : null

  return {
    entityId: data.entity_id,
    mergedNew,
    notifyPayload,
    derivedPatch,
    countDelta: entityCountDelta(cached, mergedNew),
  }
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
