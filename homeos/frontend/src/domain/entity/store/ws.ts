import type { Socket } from 'socket.io-client'
import { getActivePinia } from 'pinia'
import { useLayoutStore } from '@/domain/layout/store/layout.store'
import {
  getActiveSubscribeDomains,
  collectWsPinnedEntityIds,
  getActiveSubscriptionScope,
  clearEntitySocketSyncTimers,
  incrementalBatchIncomplete,
  resetChunkBaselineTracking,
  scheduleIncrementalEnd,
  waitForPendingChunkApplies,
} from '@/domain/entity/ws-subscription'
import { resolveActivePopupEntityId } from '@/domain/entity/store/active-popup-entity'
import { getEntityDomain, isEewSimulationEventId, WS_CLIENT_EVENTS } from '@homeos/shared'
import type { Ref } from 'vue'
import { optimisticExpectationSatisfied } from '@/domain/entity/store/optimistic-expectation'
import type { OptimisticEntry } from '@/domain/entity/store/entity-store-optimistic'
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
  EntitySocketHandlerContext,
  EntitySocketSyncState,
  SecurityEntryPendingSocketPayload,
} from '@/kernel/entity'
import {
  isStaleState,
  mergeWsStateChange,
  normalizeWsBatchChange,
  type WsDeltaChange,
  dispatchStateListener,
  enqueueStateListenerNotifications,
  notifyStateListener,
  stateListenerPayloadFingerprint,
} from '@/domain/entity/entity-state'
import { EVENT_LOG_OVERLAY_DOMAINS } from '@/domain/entity/event-log-domains'
import { notificationLevelToToastType, shouldSkipNotificationToast } from '@/domain/notifications/ws-sync'
import { refreshEnergyFromSocket } from '@/kernel/bridge/store-bridge'
import { speakLocal } from '@/domain/voice/local-speech'
import { isEarthquakeAlertEnabled } from '@/domain/earthquake/earthquake-layout'
import { useEarthquakeStore } from '@/domain/earthquake/earthquake.store'
import type { EarthquakeAlertPayload } from '@/kernel/earthquake'
import { handleEntityFallbackFailure } from '@/domain/entity/sync-guards'

/** 实体 WebSocket（Socket.IO）连接构建工具 */

/** 构建前端 Socket.IO 连接参数（从 entities.store 抽离） */
export function buildEntitySocketUrl(): string | undefined {
  const direct = import.meta.env.VITE_BACKEND_URL?.trim()
  if (direct) return direct
  // 开发环境默认走 Vite 同源代理（/socket.io → 127.0.0.1:8801），避免直连 localhost:8801 在 Windows/IPv6 下失败
  return undefined
}

/**
 * 构建握手 auth：since/lastEventId 增量游标 + 订阅域 + pinned 实体 ID
 *
 * @param lastSocketEventAt - 上次收到事件的时间戳；缺失时回退当前时间减 60s。
 * @param lastEventId - 上次收到的事件序号；缺失时回退 0。
 * @param hasBaseline - 本地是否已有完整基线（发生过一次成功同步）。
 *   服务端据此决定「只发增量回放」还是「必须发全量快照」：首次打开页面时为 false，
 *   否则服务端会以为我们已经持有全部实体，只补 60s 的增量。
 * @returns Socket.IO auth 对象；Pinia 未就绪时跳过 pinned（后续 update_subscription 补发）。
 */
export function buildEntitySocketAuth(
  lastSocketEventAt: number | null | undefined,
  lastEventId: number | null | undefined,
  hasBaseline = false,
): Record<string, unknown> {
  const auth: Record<string, unknown> = {
    since: lastSocketEventAt || Date.now() - 60_000,
    lastEventId: lastEventId || 0,
    hasBaseline: Boolean(hasBaseline),
  }
  const domains = getActiveSubscribeDomains()
  if (domains?.length) {
    auth.subscribeDomains = domains
  }
  // 按区域 / 设备订阅：未声明时**不带**这两个键，服务端按「不收窄」处理。
  const scope = getActiveSubscriptionScope()
  if (scope) {
    if (scope.areaIds.length) auth.areaIds = scope.areaIds
    if (scope.deviceIds.length) auth.deviceIds = scope.deviceIds
  }
  try {
    const pinia = getActivePinia()
    if (pinia) {
      const layout = useLayoutStore(pinia)
      const pinned = collectWsPinnedEntityIds(layout.layoutConfig, resolveActivePopupEntityId())
      if (pinned.length) auth.pinnedEntityIds = pinned
    }
  } catch {
    /* Pinia 未就绪时跳过 pinned，后续 update_subscription 补发 */
  }
  return auth
}

/** 重连前刷新握手游标，使服务端 state_replay 更精确 */
export function refreshEntitySocketAuth(
  socket: Socket | null | undefined,
  lastSocketEventAt: number | null | undefined,
  lastEventId: number | null | undefined,
): void {
  if (!socket) return
  // 能走到重连说明此前至少同步过一次；时间为 0（从未收到事件）时仍按「无基线」处理。
  const hasBaseline = Boolean(lastSocketEventAt && lastSocketEventAt > 0)
  socket.auth = buildEntitySocketAuth(lastSocketEventAt, lastEventId, hasBaseline)
}

/** 构建 Socket.IO 连接 options：withCredentials + msgpack + polling 优先 + 无限重连。
 * parser 由传输层按需动态加载后传入（B21：socket.io 不进首屏静态依赖）。 */
export function buildEntitySocketOptions(auth: Record<string, unknown>, parser: unknown) {
  return {
    withCredentials: true,
    auth,
    parser,
    // polling 优先：先经 HTTP 握手（后端不可达时 Vite 代理回 503 → 安静的 connect_error），
    // 会话建立后再升级到 WebSocket。若 websocket 优先，后端重启/未就绪时每次重连都会
    // 触发浏览器级「WebSocket is closed before the connection is established」报错。
    transports: ['polling', 'websocket'] as ('polling' | 'websocket')[],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
    randomizationFactor: 0.3,
  }
}

/** 实体状态更新核心逻辑（从 entities.store 抽离） */

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
  haStateChanged: (oldState: HaEntityState | null | undefined, newState: HaEntityState | null | undefined) => boolean
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
    derivedPatch: deps.patchDerivedChanges ? { entity_id: entityId, oldEntity: cached, newEntity: null } : null,
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
function writeEntityState(deps: EntityStateUpdateDeps, entityId: string, mergedNew: HaEntityState | null): void {
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

function applyEntityChange(deps: EntityStateUpdateDeps, raw: WsDeltaChange): EntityChangeOutcome | null {
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
  const hadOptimistic = deps.optimisticState.size > 0 && deps.optimisticState.has?.(data.entity_id)
  let mergedNew = finalizeMergedEntity(raw?._delta ? mergeWsStateChange(cached, raw) : data.new_state)
  if (!raw?._delta && hadOptimistic && data?.changed_attributes && mergedNew) {
    mergedNew = overlayAttributesOnOptimistic(cached, data, mergedNew)
  }
  mergedNew = reconcileOptimistic(deps, data.entity_id, cached, mergedNew)
  writeEntityState(deps, data.entity_id, mergedNew)
  deps.markEntityCacheDirty?.(data.entity_id)

  const notifyPayload = buildNotifyPayload(deps, raw, data, cached, cachedOld, mergedNew)
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
    notifyStateListener(getListenerDeps(deps), outcome.notifyPayload, {
      immediate: isImmediateListenerEntity(outcome.entityId),
    })
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

export function applyEntityStatesBatch(deps: EntityStateUpdateDeps, changes: WsDeltaChange[]): void {
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

/* ── 原 ws-bind-domain.ts 的实现 ── */
/** entity WebSocket：家庭模式 / 通知 / 安防 / 在场 / 能源 / 地震等业务域事件 */

export function bindEntitySocketDomainEvents(socket: Socket, ctx: EntitySocketHandlerContext): void {
  const { logger, actions, listeners } = ctx

  const dispatchToModeListeners = (arr: Array<(payload: unknown) => void>, data: unknown, label: string) => {
    for (let i = 0; i < arr.length; i++) {
      try {
        arr[i](data)
      } catch (e) {
        logger.error(`${label} 监听器错误:`, e)
      }
    }
  }

  socket.on(WS_CLIENT_EVENTS.HOME_MODE, (data: unknown) => {
    dispatchToModeListeners(listeners.homeModeListeners, data, 'home_mode')
  })

  socket.on(WS_CLIENT_EVENTS.NOTIFICATION, (data: Record<string, unknown>) => {
    actions.addRemoteNotification(data)
    // 门铃型通知：直接复用主布局的 homeos:open-camera 事件打开实时画面，
    // 不新增第二套门铃通道（布局驱动与通知驱动最终落到同一个模态框）。
    if (data.type === 'doorbell' && typeof data.cameraEntityId === 'string' && data.cameraEntityId.trim()) {
      window.dispatchEvent(
        new CustomEvent('homeos:open-camera', { detail: { cameraEntityId: data.cameraEntityId.trim() } }),
      )
      return
    }
    if (shouldSkipNotificationToast(data)) return
    const message = String(data.message || '').trim()
    if (!message) return
    void actions.appNotify(message, notificationLevelToToastType(data.level))
  })

  socket.on(WS_CLIENT_EVENTS.SECURITY_MODE, (data: { mode?: string; zones?: string[] }) => {
    actions.applySecurityModeFromSocket?.(data)
  })

  socket.on(WS_CLIENT_EVENTS.SECURITY_ZONES, () => {
    actions.refreshSecurityPanelFromSocket()
  })

  socket.on(WS_CLIENT_EVENTS.SECURITY_ENTRY_PENDING, (data: SecurityEntryPendingSocketPayload) => {
    // 进入延时窗口：前端据此显示倒计时与「立即撤防」，否则用户只能等告警响。
    actions.applySecurityEntryPendingFromSocket?.(data)
  })

  socket.on(WS_CLIENT_EVENTS.SECURITY_ENTRY_RESOLVED, (data: SecurityEntryPendingSocketPayload) => {
    // 必须有这一条：撤防取消 / 到点派发后倒计时不清掉会永久停在界面上。
    actions.applySecurityEntryResolvedFromSocket?.(data)
  })

  socket.on(WS_CLIENT_EVENTS.SECURITY_EMERGENCY, () => {
    actions.refreshSecurityPanelFromSocket()
  })

  socket.on(WS_CLIENT_EVENTS.SECURITY_EMERGENCY_COMPLETED, (data: { failed?: number }) => {
    actions.refreshSecurityPanelFromSocket()
    if (data?.failed && data.failed > 0) {
      actions.appNotify(`紧急联动完成，${data.failed} 项失败`, 'warning')
    }
  })

  socket.on(
    WS_CLIENT_EVENTS.TTS_SPEAK,
    (data: {
      message?: string
      success?: boolean | null
      detail?: string
      delivery?: 'client' | 'ha' | 'skipped'
      reason?: string
    }) => {
      if (!data?.message) return
      // skipped：总开关关闭或落在播报冷却期内。这是**预期**的静默，不是失败，
      // 更不能弹「自动播报失败」——那会让用户以为系统坏了。
      if (data.delivery === 'skipped') {
        logger.debug?.(`自动播报已跳过（${data.reason || 'unknown'}）：${data.message}`)
        return
      }
      // client：服务端把「让谁说」交给本终端（local 模式，或 auto 模式且有终端在线）。
      // 这里必须真的出声，否则 local 模式的自动播报会彻底失声。
      if (data.delivery === 'client') {
        void speakLocal(data.message).catch(() => false)
        return
      }
      if (data.success === false) {
        const detail = data.detail || data.message || '未知错误'
        logger.warn(`TTS 播报未成功: ${detail}`)
        void actions.appNotify(`自动播报失败：${detail}`, 'error')
      }
    },
  )

  // 领域事件监听（自动化 / 安防 / 在场 / 能源 / Frigate / 房间占用）
  // payload 字段以后端 ws-push-domain-events.helper.ts 为准；后端为 Record<string,unknown>
  // 的事件此处用合理的最小可选字段类型，访问均带兜底，避免使用 any。

  socket.on(
    'automation_executed',
    (data: { automationId?: string; name?: string; success?: boolean; timestamp?: string }) => {
      const name = data?.name || data?.automationId || '自动化'
      logger.info(`自动化已执行: ${name}`)
      // ``success`` 必须显式判真：旧实现把 undefined 也当成成功，于是只要事件里没有这个
      // 字段（当前后端就是）就无条件弹「已执行」—— 失败时同样弹成功，属于会误导用户的
      // 假成功提示。未知结果只记日志，不打扰用户。
      if (data?.success === false) {
        void actions.appNotify(`自动化「${name}」执行失败`, 'warning')
      } else if (data?.success === true) {
        void actions.appNotify(`自动化「${name}」已执行`, 'info')
      } else {
        logger.debug?.(`自动化「${name}」执行结果未知（payload 无 success 字段）`)
      }
    },
  )

  socket.on(
    WS_CLIENT_EVENTS.SECURITY_ALARM,
    (data: {
      entityId?: string
      friendlyName?: string
      zones?: string[]
      zoneNames?: string
      mode?: string
      type?: string
      actionFailures?: string[]
      timestamp?: string
    }) => {
      const target = data?.friendlyName || data?.zoneNames || data?.entityId || '安防区域'
      const typeLabel =
        data?.type === 'smoke'
          ? '烟雾告警'
          : data?.type === 'gas_leak'
            ? '燃气泄漏'
            : data?.type === 'water_leak'
              ? '漏水告警'
              : data?.mode === 'safety'
                ? '安全传感器告警'
                : '安防告警'
      logger.warn(`${typeLabel}: ${target}(模式 ${data?.mode || 'unknown'})`)
      actions.refreshSecurityPanelFromSocket()
      // 持久化通知已由 notification 通道推送并弹 toast，此处仅刷新安防面板
    },
  )

  socket.on(
    WS_CLIENT_EVENTS.PRESENCE_CHANGED,
    (data: { memberId?: string; name?: string; atHome?: boolean; timestamp?: string }) => {
      const name = data?.name || data?.memberId || '成员'
      const status = data?.atHome ? '已到家' : '已离家'
      logger.info(`在场状态变化: ${name} ${status}`)
      void actions.appNotify(`${name}${status}`, 'info')
    },
  )

  socket.on(WS_CLIENT_EVENTS.PRESENCE_ALL_LEFT, (data: { lastMember?: string; timestamp?: string }) => {
    logger.info(`所有成员均已离家(最后一位: ${data?.lastMember || '未知'})`)
    void actions.appNotify('所有成员均已离家', 'info')
  })

  socket.on(
    WS_CLIENT_EVENTS.ENERGY_ANOMALY,
    (data: { friendlyName?: string; current?: number; average?: number; message?: string; entityId?: string }) => {
      const name = data?.friendlyName || data?.entityId || '设备'
      const cur = typeof data?.current === 'number' ? `${data.current}W` : ''
      const detail = data?.message || (cur ? `${name} 当前功耗 ${cur}` : name)
      logger.warn(`能源异常: ${detail}`)
      refreshEnergyFromSocket(data?.entityId)
      // 持久化通知已由 notification 通道推送并弹 toast，此处仅刷新能源 UI
    },
  )

  socket.on(
    WS_CLIENT_EVENTS.FRIGATE_DETECTION,
    (data: { camera?: string; label?: string; message?: string; entityId?: string }) => {
      const target = data?.camera || data?.label || data?.message || data?.entityId || '摄像头'
      logger.info(`Frigate 检测: ${target}`)
      // 人物高置信度检测会同步触发 security.alarm → notification，避免双 toast
      if (String(data?.label || '').toLowerCase() === 'person') return
      void actions.appNotify(`检测到活动：${target}`, 'info')
    },
  )

  socket.on(WS_CLIENT_EVENTS.ROOM_PRESENCE, (data: { room?: string; occupied?: boolean; sensor?: string }) => {
    const room = data?.room || data?.sensor || '房间'
    const status = data?.occupied ? '有人' : '无人'
    logger.info(`房间占用变化: ${room} ${status}`)
    void actions.appNotify(`${room}${status}`, 'info')
  })

  socket.on(
    WS_CLIENT_EVENTS.EARTHQUAKE_ALERT,
    (data: {
      eventId?: string
      latitude?: number
      longitude?: number
      originTime?: number
      magnitude?: number
      depth?: number
      epicenter?: string
      distance?: number
      countdown?: number
      localIntensity?: number
      maxIntensity?: string
      alertKind?: string
      source?: string
      timestamp?: string
    }) => {
      const eventId = String(data?.eventId || '').trim()
      if (!eventId) return
      // 模拟演练与后端一致：即使未启用 EEW 也允许弹出，便于验证全屏链路
      if (!isEarthquakeAlertEnabled() && !isEewSimulationEventId(eventId)) return
      const store = useEarthquakeStore()
      if (store.isEventDismissed(eventId)) return
      store.triggerAlert({
        eventId,
        latitude: Number(data.latitude ?? 0),
        longitude: Number(data.longitude ?? 0),
        originTime: Number(data.originTime ?? Date.now()),
        magnitude: Number(data.magnitude ?? 0),
        depth: Number(data.depth ?? 0),
        epicenter: String(data.epicenter ?? '未知震中'),
        distance: Number(data.distance ?? 0),
        countdown: Number(data.countdown ?? 0),
        localIntensity: Number(data.localIntensity ?? 0),
        maxIntensity: data.maxIntensity,
        alertKind: data.alertKind === 'confirmation' ? 'confirmation' : 'early',
        source: data.source as EarthquakeAlertPayload['source'] | undefined,
        timestamp: data.timestamp,
      })
    },
  )

  socket.on(
    WS_CLIENT_EVENTS.EARTHQUAKE_CONFIRMATION,
    (data: {
      eventId?: string
      latitude?: number
      longitude?: number
      originTime?: number
      magnitude?: number
      depth?: number
      epicenter?: string
      distance?: number
      countdown?: number
      localIntensity?: number
      maxIntensity?: string
      source?: string
      timestamp?: string
    }) => {
      const eventId = String(data?.eventId || '').trim()
      if (!eventId) return
      if (!isEarthquakeAlertEnabled() && !isEewSimulationEventId(eventId)) return
      const store = useEarthquakeStore()
      store.triggerConfirmation({
        eventId,
        latitude: Number(data.latitude ?? 0),
        longitude: Number(data.longitude ?? 0),
        originTime: Number(data.originTime ?? Date.now()),
        magnitude: Number(data.magnitude ?? 0),
        depth: Number(data.depth ?? 0),
        epicenter: String(data.epicenter ?? '未知震中'),
        distance: Number(data.distance ?? 0),
        countdown: Number(data.countdown ?? 0),
        localIntensity: Number(data.localIntensity ?? 0),
        maxIntensity: data.maxIntensity,
        alertKind: 'confirmation',
        source: data.source as EarthquakeAlertPayload['source'] | undefined,
        timestamp: data.timestamp,
      })
    },
  )
}

/* ── 原 ws-bind-ha-sync.ts 的实现 ── */
/** entity WebSocket：HA 状态 / 全量同步 / 增量补发 */

/** 暂存 delta 的上限：异常流量下宁可丢掉一部分（下次全量兜底），也不让内存无界增长。 */
const MAX_PENDING_PRE_CHUNK_DELTAS = 2000

/**
 * 全量同步完成前的增量过滤。
 *
 * 只丢弃「本地完全没有该实体」的 delta：这种情况下合并结果只能是
 * ``{state}`` + 少量属性，属于残缺实体，等全量快照更安全。
 * 本地已有该实体（重连前的基线 / IndexedDB 缓存 hydrate）时必须照常应用 ——
 * 服务端在断线重连时只做 ``state_replay`` 增量回放，不会再发 ``initial_states``，
 * 若一律丢弃，实体状态会永久冻结在断线前的快照里（只有整包推送才偶尔落地），
 * 表现为「页面数据不再实时刷新，手动刷新才恢复正常」。
 *
 * 分块同步进行中（``INITIAL_STATES_BEGIN`` 之后、``INITIAL_STATES_END`` 之前）有第三种情况：
 * 实体基线就在**还没落地**的那几个 chunk 里。不能丢，也不能现在合并（会生成半实体），
 * 于是暂存到 ``pendingPreChunkDeltas``，等对应 chunk 落地后再合并。
 */
function filterDeltaBeforeFullSync(
  changes: Record<string, unknown>[],
  sync: EntitySocketSyncState,
  entities: Record<string, unknown>,
  logger: EntitySocketHandlerContext['logger'],
): Record<string, unknown>[] {
  if (sync.initialStatesReceived || !changes.length) return changes
  const chunkedEntityIds = sync.chunkedEntityIds
  const applicable: Record<string, unknown>[] = []
  let dropped = 0
  let buffered = 0
  for (const change of changes) {
    const item = change as { _delta?: boolean; entity_id?: string }
    if (!item?._delta) {
      applicable.push(change)
      continue
    }
    const entityId = String(item.entity_id || '')
    // 本地已有基线，或分块同步里该实体的 chunk 已经落地：delta 可安全合并
    if (entityId && (entities[entityId] || chunkedEntityIds?.has(entityId))) {
      applicable.push(change)
      continue
    }
    // 该实体属于本批分块、但基线还没到：暂存，等 chunk 落地后再合并（比丢弃更省一次整表）
    if (entityId && chunkedEntityIds) {
      const pending = (sync.pendingPreChunkDeltas ??= [])
      if (pending.length < MAX_PENDING_PRE_CHUNK_DELTAS) {
        pending.push(change)
        buffered++
        continue
      }
    }
    dropped++
  }
  if (dropped > 0) {
    // 后端侧已避免向未就绪客户端广播增量（见 gateway._baseline_ready），此处仅作兜底，
    // 降级 debug 以免产生误导性告警。
    logger.debug?.(`全量同步完成前丢弃 ${dropped} 条 delta 增量(本地缺少该实体基线)`)
  }
  if (buffered > 0) {
    logger.debug?.(`全量分块同步中暂存 ${buffered} 条 delta 增量(等对应 chunk 落地)`)
  }
  return applicable
}

export function bindEntitySocketHaSync(
  socket: Socket,
  ctx: EntitySocketHandlerContext,
  sync: EntitySocketSyncState,
): void {
  const { logger, refs, entities, track, actions } = ctx

  /**
   * ``replay_truncated``（游标来自旧进程 / 缓冲已淘汰）后的 REST 兜底定时器。
   *
   * 服务端在 connect 流程里发出 ``resync_suggested`` 后**紧接着**会推全量
   * ``initial_states``，所以以前「收到就立刻打整包 REST」等于把同一份 700+ 实体
   * 拉两遍（后端每次重启，所有打开的页面都会各拉一次）。改为先等 WS 快照：
   * 收到任一同步事件就取消；窗口内没来（帧被背压挤掉等）才回退整包。
   */
  let replayResyncFallbackTimer: ReturnType<typeof setTimeout> | null = null
  const clearReplayResyncFallback = () => {
    if (replayResyncFallbackTimer !== null) {
      clearTimeout(replayResyncFallbackTimer)
      replayResyncFallbackTimer = null
    }
  }

  const clearSyncTimers = () => {
    clearEntitySocketSyncTimers(sync)
    clearReplayResyncFallback()
  }

  /**
   * 合并分块批次中因「基线还没到」而暂存的 delta。
   *
   * 只放行基线已经落地（或整批已结束）的条目，其余继续挂着 —— 现在合并会生成半实体。
   * 返回真正提交的条数。
   */
  const flushPendingPreChunkDeltas = (): number => {
    const pending = sync.pendingPreChunkDeltas
    if (!pending?.length) return 0
    if (sync.initialStatesReceived) {
      sync.pendingPreChunkDeltas = []
      actions.updateStatesBatch(pending)
      return pending.length
    }
    const chunkedEntityIds = sync.chunkedEntityIds
    if (!chunkedEntityIds?.size) return 0
    const ready: Record<string, unknown>[] = []
    const rest: Record<string, unknown>[] = []
    for (const change of pending) {
      const entityId = String((change as { entity_id?: string })?.entity_id || '')
      if (entityId && chunkedEntityIds.has(entityId)) ready.push(change)
      else rest.push(change)
    }
    sync.pendingPreChunkDeltas = rest
    if (ready.length) actions.updateStatesBatch(ready)
    return ready.length
  }

  /** 一轮全量同步结束（成功或降级）：解除基线门禁，并放行 / 丢弃暂存的 delta。 */
  const completeFullSync = (options: { flushPending: boolean }): void => {
    sync.initialStatesReceived = true
    if (options.flushPending) flushPendingPreChunkDeltas()
    else sync.pendingPreChunkDeltas = []
    resetChunkBaselineTracking(sync)
  }

  /** WS 降级统一处理：REST 回退成功则标记已收到全量，失败走 sync-failure 兜底 */
  const runFallbackAndMarkSynced = (reason: string) =>
    actions
      .fetchEntitiesFallback(reason, { force: true })
      .then((ok: boolean) => {
        // REST 整包快照是权威数据：暂存 delta 已被它覆盖或更旧，直接丢弃。
        if (ok) completeFullSync({ flushPending: false })
      })
      .catch((e: unknown) => handleEntityFallbackFailure(reason, e, refs))

  socket.on(WS_CLIENT_EVENTS.HA_STATUS, (data: { status?: string }) => {
    logger.info('HA 连接状态:', data.status)
    const status = data.status
    if (status === 'connected' || status === 'disconnected' || status === 'reconnecting') {
      refs.haStatus.value = status
    }
    if (status === 'connected') {
      actions.clearHaDisconnectDebounce()
      actions.setConnected(true)
      refs.entitiesStale.value = false
      if (refs.totalCount.value > 0) {
        refs.loading.value = false
      }
    } else if (status === 'disconnected') {
      actions.setConnected(false)
      actions.startHaDisconnectDebounce()
      // 推送可能被 socket 抖动吞掉：降级持续时补一次主动核对，避免横幅永久卡在重连
      actions.scheduleHaStatusProbe?.()
    } else if (status === 'reconnecting') {
      refs.reconnecting.value = true
      actions.setConnected(false)
      actions.scheduleHaStatusProbe?.()
    }
  })

  socket.on(WS_CLIENT_EVENTS.ENTITIES_STALE, () => {
    refs.entitiesStale.value = true
    logger.warn('实体数据已标记为陈旧,等待 HA 重连同步...')
    actions.onEntitiesStale?.()
  })

  let lastResyncAt = 0
  socket.on(WS_CLIENT_EVENTS.RESYNC_SUGGESTED, (data: { reason?: string }) => {
    // 节流：至少间隔 30s，避免极端情况下的重同步风暴
    const now = Date.now()
    if (now - lastResyncAt < 30_000) return
    lastResyncAt = now
    logger.warn('服务端建议重同步:', data?.reason || 'backpressure')
    refs.entitiesStale.value = true
    const rolled = actions.rollbackAllOptimistic?.() ?? 0
    if (rolled > 0) logger.info(`背压重同步前已回滚 ${rolled} 条乐观更新`)
    // ``replay_truncated`` 的语义是「你的游标不可信」（环形缓冲已淘汰，或游标来自上一个
    // 进程）—— 增量必然有洞，只有整包快照能收敛。走软重同步会拿同一个坏游标再试一次。
    if (data?.reason === 'replay_truncated') {
      // 服务端返回 ``resync`` 后会在同一轮 connect 里补发全量 ``initial_states``，
      // 立即打整包 REST 只是把同一份实体再拉一遍。先给 WS 快照一个窗口，
      // 收到 initial_states / begin / end / state_replay / sync_error 任一即取消
      // （这些分支都会走 ``clearSyncTimers``）；窗口内没来才回退整包。
      clearReplayResyncFallback()
      replayResyncFallbackTimer = setTimeout(() => {
        replayResyncFallbackTimer = null
        if (!socket.connected) return
        logger.warn('增量游标失效且未收到 WS 全量快照,回退 REST 整包')
        void runFallbackAndMarkSynced('增量游标失效且 WS 快照未到')
      }, ctx.getInitialStatesWaitMs())
      return
    }
    // 其余（背压 / 增量过大）：优先增量 / 服务端 resync；冷却内不全量连环 REST
    // （由 fetchEntitiesFallback 内部去重）。
    void (async () => {
      const soft = await actions.requestSoftResync?.('服务端背压建议重同步')
      if (soft) return
      void actions.fetchEntitiesFallback?.('服务端背压建议重同步', { force: true })
    })()
  })

  socket.on(
    WS_CLIENT_EVENTS.HA_QUEUE_DROPPED,
    (data: { total?: number; timestamp?: string; count?: number; reason?: string }) => {
      const total = Number(data?.total ?? 0)
      if (refs.haQueueDroppedTotal) refs.haQueueDroppedTotal.value = total
      if (refs.lastQueueDropAt) refs.lastQueueDropAt.value = data?.timestamp || new Date().toISOString()
      const dropped = data?.count ?? 1
      logger.warn(`HA 实时状态积压丢弃: ${dropped} 条 (${data?.reason || '未知'})`)
      // 语义：这条事件表示「状态推送积压，本端漏掉了一些**状态**更新」，
      // 不是「控制指令下发失败」。旧文案（「N 条控制指令未能下发，请重试」）会让用户
      // 在设备其实已经执行成功时重复操作；这里只需要把状态重新对齐。
      // 同理不做乐观态回滚：指令确实发出去了，回滚反而会把正确的结果抹掉。
      void actions.appNotify?.(`实时状态积压，已丢弃 ${dropped} 条更新，正在重新对齐实体状态`, 'warning')
      refs.entitiesStale.value = true
      // 优先增量对齐（服务端有 since 游标，代价很小），失败再退回整表。
      // F10：对齐完成后按缓存真值结清仍挂着的乐观态，避免丢包窗口留下「假恢复」展示。
      void (async () => {
        const soft = await actions.requestSoftResync?.('HA 状态队列积压')
        if (!soft) {
          await actions.fetchEntitiesFallback?.('HA 状态队列积压', { force: true, quiet: true })
        }
        actions.confirmOptimisticAfterResync?.('HA 状态队列积压')
      })()
    },
  )

  socket.on(WS_CLIENT_EVENTS.INITIAL_STATES, (data: { entities?: HaEntityState[]; count?: number }) => {
    clearSyncTimers()
    if (sync.loadingFallbackTimer) clearTimeout(sync.loadingFallbackTimer)
    const count = data.entities?.length ?? data.count ?? 0
    logger.info(`已通过 WebSocket 同步 ${count} 个实体`)
    refs.entitiesStale.value = false
    refs.entitiesCacheHydrated.value = false
    actions.clearHaDisconnectDebounce()
    actions.setConnected(true)
    actions.initStates(data.entities || [], { force: true, reason: 'WebSocket initial_states' })
    refs.loading.value = false
    // 整包快照是权威数据：分块批次与暂存 delta 全部作废。
    completeFullSync({ flushPending: false })
  })

  socket.on(WS_CLIENT_EVENTS.INITIAL_STATES_BEGIN, (data: { count?: number }) => {
    // 注意：这里**不能**把 ``initialStatesReceived`` 置真。分块只是全量快照的切片，
    // 一个 chunk 都没落地之前本地还没有基线，置真会让紧随其后的 delta 直接合并成
    // 半实体（只有 state、没有属性），并且再没有任何推送会把它补全。
    clearSyncTimers()
    sync.incrementalExpected = data?.count ?? 0
    sync.incrementalReceivedCount = 0
    sync.pendingChunkApplies = 0
    sync.incrementalEndScheduled = false
    resetChunkBaselineTracking(sync)
    sync.incrementalToken = actions.beginIncrementalInitialStates?.(sync.incrementalExpected) ?? null
    logger.info(`开始分块同步 initial_states(共 ${sync.incrementalExpected || '?'} 个实体)`)
  })

  socket.on(
    WS_CLIENT_EVENTS.INITIAL_STATES_CHUNK,
    (data: { entities?: HaEntityState[]; count?: number; total?: number }) => {
      const list = data?.entities
      if (!Array.isArray(list) || !list.length) return
      // 后端 chunk.count = 本块大小，total = 全量实体数；勿用 count 覆盖 expected
      if (data?.total) sync.incrementalExpected = data.total
      if (!sync.incrementalToken && actions.beginIncrementalInitialStates) {
        sync.incrementalToken = actions.beginIncrementalInitialStates(sync.incrementalExpected)
      }
      sync.incrementalReceivedCount += list.length
      const token = sync.incrementalToken
      const expected = sync.incrementalExpected
      // 先登记本块覆盖的实体 id：紧随其后的 delta 只要命中这里就能安全合并
      // （否则会被 filterDeltaBeforeFullSync 暂存到 chunk 落地之后）。
      const chunkedEntityIds = (sync.chunkedEntityIds ??= new Set<string>())
      for (const chunkEntity of list) {
        const chunkEntityId = String(chunkEntity?.entity_id || '')
        if (chunkEntityId) chunkedEntityIds.add(chunkEntityId)
      }
      sync.pendingChunkApplies++
      const apply = () => {
        try {
          actions.mergeInitialStatesChunk?.(list, token, expected)
          // chunk 落地后再放行之前暂存的 delta：此时基线已就绪，合并结果不会是半实体。
          flushPendingPreChunkDeltas()
        } finally {
          sync.pendingChunkApplies = Math.max(0, sync.pendingChunkApplies - 1)
        }
      }
      if (list.length > 80 && typeof requestIdleCallback === 'function') {
        requestIdleCallback(apply, { timeout: 48 })
      } else {
        apply()
      }
    },
  )

  socket.on(WS_CLIENT_EVENTS.INITIAL_STATES_END, (data: { count?: number }) => {
    clearSyncTimers()
    if (sync.loadingFallbackTimer) clearTimeout(sync.loadingFallbackTimer)
    const expected = data?.count ?? sync.incrementalExpected ?? 0

    if (sync.incrementalEndScheduled && sync.incrementalToken == null) {
      logger.debug?.('忽略重复的 initial_states_end(本批已完成)')
      return
    }

    if (sync.incrementalToken != null && actions.finishIncrementalInitialStates) {
      const endSnapshot = scheduleIncrementalEnd(sync)
      if (!endSnapshot) {
        logger.debug?.('忽略重复的 initial_states_end(本批已在收尾)')
        return
      }
      const finishIncremental = actions.finishIncrementalInitialStates
      waitForPendingChunkApplies(sync, () => {
        if (endSnapshot.token !== sync.incrementalToken) return
        const received = Math.max(endSnapshot.received, sync.incrementalReceivedCount)
        const visible = refs.totalCount.value
        if (incrementalBatchIncomplete(expected, received)) {
          if (sync.pendingChunkApplies > 0) {
            logger.warn(`分块渐进同步 apply 超时(仍 pending ${sync.pendingChunkApplies}),改用 REST 回退`)
          } else {
            logger.warn(`分块渐进同步不完整 ${received}/${expected},改用 REST 回退`)
          }
          sync.incrementalToken = null
          sync.incrementalExpected = 0
          sync.incrementalReceivedCount = 0
          sync.pendingChunkApplies = 0
          // 回退到 REST 整包：暂存 delta 会被快照覆盖，先丢掉（成功后再解除门禁）。
          sync.pendingPreChunkDeltas = []
          resetChunkBaselineTracking(sync)
          runFallbackAndMarkSynced('WebSocket 分块渐进不完整')
          refs.loading.value = false
          return
        }
        finishIncremental(endSnapshot.token, expected)
        sync.incrementalToken = null
        sync.incrementalExpected = 0
        sync.incrementalReceivedCount = 0
        sync.pendingChunkApplies = 0
        // 整批收齐：暂存的 delta 现在都能安全合并（它们的基线已在上面落地）。
        completeFullSync({ flushPending: true })
        actions.clearHaDisconnectDebounce()
        actions.setConnected(true)
        refs.loading.value = false
        if (expected > 0 && visible > 0 && visible < expected * 0.9 && received >= expected * 0.9) {
          logger.debug?.(`分块同步已收齐 ${received}/${expected}，可见实体 ${visible}（权限/域过滤）`)
        }
      })
      return
    }

    // 没有增量批次可收尾（例如服务端只发了 initial_states_end）：按空批结束本次同步。
    // 分块实体一律走 mergeInitialStatesChunk 增量合并，这里不再保留整批缓冲。
    logger.info(`已通过 WebSocket 分块同步 ${expected} 个实体`)
    refs.entitiesStale.value = false
    refs.entitiesCacheHydrated.value = false
    actions.clearHaDisconnectDebounce()
    actions.setConnected(true)
    actions.initStates([], { force: true, reason: 'WebSocket initial_states_end' })
    refs.loading.value = false
    completeFullSync({ flushPending: true })
  })

  socket.on(
    WS_CLIENT_EVENTS.ENTITY_CATALOG_CHANGED,
    (data: { operation?: string; counts?: Record<string, number>; timestamp?: string }) => {
      const operation = String(data?.operation || 'updated')
      logger.info(`实体目录已变更(${operation})`, data?.counts || {})
      // 目录（有哪些实体 / 叫什么 / 属于哪个设备）与状态是两条数据流：
      // 只靠状态增量的话，新设备永远进不了选择器，删掉的实体也留在列表里。
      // 这里做一次轻量校准：优先增量（新实体会带新的 last_updated），失败再退回整表。
      void actions.refreshEntityCatalog?.(`实体目录变更(${operation})`).catch(() => false)
      // 墙屏 / 编辑器目录来自各自的一次性快照，用一个全局事件让它们同样校准一次。
      try {
        window.dispatchEvent(
          new CustomEvent('hb-entity-catalog-changed', {
            detail: { operation, counts: data?.counts || {} },
          }),
        )
      } catch {
        /* CustomEvent 不可用（非浏览器环境）：忽略 */
      }
    },
  )

  socket.on(WS_CLIENT_EVENTS.SYNC_ERROR, (data: { message?: string; code?: string }) => {
    logger.warn('WebSocket 全量同步失败,将使用 REST 回退', data?.message || data?.code)
    // 服务端明确报错说明这一轮不会再推快照：取消等待，直接 REST 回退。
    clearSyncTimers()
    runFallbackAndMarkSynced('WebSocket sync_error')
  })

  socket.on(
    WS_CLIENT_EVENTS.STATE_REPLAY,
    (data: {
      changes?: Record<string, unknown>[]
      entities?: HaEntityState[]
      lastEventId?: number
      count?: number
    }) => {
      // state_replay 是服务端对「本地已有基线」的权威补齐：只要回放返回 replayed，
      // 服务端就不会再发 initial_states。因此收到回放（哪怕 0 条变更）即视为同步完成，
      // 否则 initialStatesReceived 永远为 false、entitiesCacheHydrated 永远为 true，
      // 连带的后果是：实体缓存不再持久化、增量被基线门禁拦掉、
      // 重连横幅卡在「正在重新连接」，只有手动刷新页面才恢复。
      // 回放是服务端对本进程历史的权威补齐：暂存 delta 可能比回放还旧，直接作废。
      completeFullSync({ flushPending: false })
      refs.entitiesCacheHydrated.value = false
      refs.entitiesStale.value = false
      clearSyncTimers()
      if (refs.totalCount.value > 0) refs.loading.value = false
      // 回放游标即使本轮 0 条变更也要推进：否则下次重连仍从旧游标回放，
      // 环形缓冲淘汰后会退化成「建议重同步」的整包 REST 拉取。
      if (data?.lastEventId) track.lastEventId = data.lastEventId
      track.lastSocketEventAt = Date.now()
      const changes = data?.changes
      if (Array.isArray(changes) && changes.length) {
        // baseline 保护：与 state_changed_batch 一致，仅丢弃本地缺实体的 delta 条目
        const applicable = filterDeltaBeforeFullSync(changes, sync, entities, logger)
        if (applicable.length) {
          actions.updateStatesBatch(applicable)
        }
        logger.info(`WS 断线补发 ${applicable.length} 条增量状态(delta)`)
        return
      }

      const list = data?.entities || []
      if (list.length) {
        const changes = list
          .filter((ent): ent is typeof ent & { entity_id: string } => {
            const eid = ent?.entity_id
            return typeof eid === 'string' && eid.length > 0 && actions.entityVisible(eid)
          })
          .map((ent) => ({
            entity_id: ent.entity_id,
            new_state: ent,
            old_state: entities[ent.entity_id] ?? null,
          }))
        if (changes.length) {
          void actions.updateStatesBatch(changes)
        }
        logger.info(`WS 断线补发 ${changes.length} 条实体状态`)
      }
    },
  )

  socket.on(
    WS_CLIENT_EVENTS.STATE_CHANGED_BATCH,
    (data: { lastEventId?: number; changes?: Record<string, unknown>[] }) => {
      track.lastSocketEventAt = Date.now()
      if (data?.lastEventId) track.lastEventId = data.lastEventId
      const changes = data?.changes || []
      if (changes.length) {
        // baseline 保护：全量同步完成前只丢弃缺实体的 delta，避免 merge 到残缺基线上产生残缺实体
        const applicable = filterDeltaBeforeFullSync(changes, sync, entities, logger)
        if (!applicable.length) return
        refs.entitiesStale.value = false
        actions.updateStatesBatch(applicable)
      }
    },
  )
}

/* ── 原 ws-bind-lifecycle.ts 的实现 ── */
/** entity WebSocket：连接 / 断线 / 重连生命周期 */

export function bindEntitySocketLifecycle(
  socket: Socket,
  ctx: EntitySocketHandlerContext,
  sync: EntitySocketSyncState,
): void {
  const { logger, getInitialStatesWaitMs, getPreloadPromise, refs, track, actions } = ctx

  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  /**
   * 服务端主动断开（``io server disconnect``）后的重连计数。
   *
   * 该分支下 socket.io **不会**自动重连，必须手工 ``socket.connect()``；原实现立刻重连、
   * 不设上限，于是后端滚动重启 / 反复拒绝握手时会变成一条**同步忙循环**：连上→被踢→
   * 立刻连上，浏览器与后端都被拖住，控制台每秒刷屏。这里按指数退避（上限 30s）重试。
   */
  let serverDisconnectAttempt = 0
  let serverReconnectTimer: ReturnType<typeof setTimeout> | null = null
  const clearSyncTimers = () => {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (serverReconnectTimer !== null) {
      clearTimeout(serverReconnectTimer)
      serverReconnectTimer = null
    }
    clearEntitySocketSyncTimers(sync)
  }

  /**
   * 本页是否已有一份可信基线：已完成过一次 WS 全量同步（而不是只靠 IndexedDB 缓存 hydrate）。
   * 缓存可能是几小时前的（服务端 since 只回放最近 60s），因此不能凭缓存宣称「已同步」。
   */
  const hasTrustedBaseline = () => refs.totalCount.value > 0 && !refs.entitiesCacheHydrated.value

  socket.on('connect', () => {
    logger.info('WebSocket 已连接到 HomeOS 后端')
    // 连接恢复即清零退避，避免一次长时间抖动把后续重连永久钉在 30s。
    serverDisconnectAttempt = 0
    // 断线重连时服务端只做 state_replay 增量回放，不会再发 initial_states。
    // 这里若把「已收到全量」无条件重置为 false，之后所有 delta 增量都会被
    // filterDeltaBeforeFullSync 丢掉，实体状态永久冻结在断线前的快照，
    // 只有手动刷新页面才恢复。已有可信基线时保留该标记。
    sync.initialStatesReceived = hasTrustedBaseline()
    if (refs.totalCount.value > 0) {
      // 已有缓存：短暂标记重连中；收到 initial_states / REST 回退成功后清除
      refs.reconnecting.value = true
      refs.loading.value = false
    } else if (refs.reconnecting.value) {
      refs.loading.value = true
    }

    clearSyncTimers()
    sync.restFallbackTimer = setTimeout(async () => {
      if (sync.initialStatesReceived) return
      const preload = getPreloadPromise()
      if (preload) {
        await preload
        if (sync.initialStatesReceived) {
          actions.clearHaDisconnectDebounce()
          actions.setConnected(true)
          return
        }
      }
      // 后端 waitForHaEntitySync 最长约 90s；8s 内 REST 常拿到更小的未就绪快照，
      // 与 IndexedDB 缓存冲突并误报「拒绝缩小快照」。有可用缓存时继续等 WS。
      if (refs.totalCount.value > 0 && socket.connected && !refs.entitiesStale.value) {
        logger.info(`已有 ${refs.totalCount.value} 个实体缓存,继续等待 WebSocket initial_states(跳过过早 REST 回退)`)
        return
      }
      const ok = await actions.fetchEntitiesFallback('未收到 initial_states', {
        force: refs.entitiesStale.value,
      })
      if (ok) {
        sync.initialStatesReceived = true
        // REST 已补齐实体时勿一直挂着「正在重新连接 Home Assistant」
        actions.clearHaDisconnectDebounce()
        actions.setConnected(true)
      }
    }, getInitialStatesWaitMs())
  })

  socket.on('disconnect', (reason: Socket.DisconnectReason) => {
    logger.info('WebSocket 已断开 HomeOS 后端连接:', reason)
    clearSyncTimers()
    if (refs.totalCount.value > 0) {
      refs.loading.value = false
    }
    // 后端通道断了就无从得知 HA 状态：标记未知，避免沿用旧的「已连接/重连中」去误报
    refs.haStatus.value = 'unknown'
    // 会话失效只由 HTTP 401 处理。WS 断线（含后端重启的 io server disconnect）
    // 绝不能清登录态，否则会在登录后立刻被踢回登录页。
    if (reason === 'io server disconnect') {
      logger.warn('服务端主动断开 WebSocket,尝试重连(不登出)')
      refs.reconnecting.value = true
      actions.setConnected(false)
      refreshEntitySocketAuth(socket, track.lastSocketEventAt, track.lastEventId)
      // 指数退避：1s、2s、4s … 上限 30s。没有上限的立即重连会让后端限流/重启期间变成
      // 忙循环（socket.io 在该分支不会自动重连，所有重试都来自这里）。
      const attempt = (serverDisconnectAttempt += 1)
      const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempt - 1, 5))
      clearSyncTimers()
      serverReconnectTimer = setTimeout(() => {
        serverReconnectTimer = null
        if (socket.connected) {
          serverDisconnectAttempt = 0
          return
        }
        logger.info(`服务端主动断开后重连 (第 ${attempt} 次, 等待 ${delay}ms)`)
        socket.connect()
      }, delay)
      return
    }
    actions.setConnected(false)
    actions.startHaDisconnectDebounce()
  })

  socket.on('connect_error', (err: Error) => {
    logger.error('WebSocket 连接错误:', err.message)
    if (refs.totalCount.value > 0) {
      refs.loading.value = false
    }
    // 认证失败同样不在此登出：由后续 HTTP 请求 401 统一处理，避免误踢
    actions.setConnected(false)
    if (refs.totalCount.value > 0) {
      actions.startHaDisconnectDebounce()
    }
  })

  // Manager 级监听必须可卸载：同 URL 的 io() 会复用 Manager，只 socket.removeAllListeners
  // 会让 reconnect_* 回调叠乘，放大鉴权刷新 / 横幅 / REST 回退风暴。
  const onManagerReconnectAttempt = (attempt: number) => {
    logger.info(`WebSocket 重连尝试 (第 ${attempt} 次)...`)
    refs.reconnecting.value = true
    refreshEntitySocketAuth(socket, track.lastSocketEventAt, track.lastEventId)
  }
  const onManagerReconnect = () => {
    logger.info('WebSocket 已重新连接到 HomeOS 后端')
    // 有本地缓存时仅短暂展示重连态；避免 socket.io 抖动把横幅钉死
    if (refs.totalCount.value === 0) {
      refs.reconnecting.value = true
      refs.loading.value = true
    } else {
      refs.reconnecting.value = true
      refs.loading.value = false
      // 「已恢复」必须等全量同步完成：initial_states 到达或 REST 回退成功后才会收起横幅。
      // 4s 兜底仅处理「服务端已推完但事件漏记」的边角；未收到全量前保持重连横幅，
      // 避免用户在实体状态未对齐窗口内看到误导性的「已连接」。
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        if (socket.connected && refs.totalCount.value > 0 && sync.initialStatesReceived) {
          actions.clearHaDisconnectDebounce()
          actions.setConnected(true)
        }
      }, 4_000)
    }
    actions.refreshNotificationsFromSocket?.()
    actions.refreshEventLogFromSocket?.()
  }
  socket.io.on('reconnect_attempt', onManagerReconnectAttempt)
  socket.io.on('reconnect', onManagerReconnect)
}

/* ── 原 entity-ws-bind.ts 的实现 ── */
/** entity WebSocket: 将 Socket.IO 生命周期 / HA 状态 / 实体分块 / 领域事件绑定到 entities store */

export function bindEntitySocketHandlers(
  socket: Socket,
  ctx: EntitySocketHandlerContext,
  sync: EntitySocketSyncState,
): void {
  bindEntitySocketLifecycle(socket, ctx, sync)
  bindEntitySocketHaSync(socket, ctx, sync)
  bindEntitySocketDomainEvents(socket, ctx)
}
