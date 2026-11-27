import type {
  EntitiesMap,
  HaEntityState,
  EntityStateListenerFlushDeps,
  EntityStateListenerFn,
  EntityStateListenerLogger,
  EntityStateListenerPayload,
  RegisterStateListenerOptions,
  EntityStateNotifyArgs,
  ResolveListenerOldStateArgs,
} from '@/kernel/entity'
import { describeAttrChange } from '../control-attr-change'
import { logger } from '@/kernel/core/index'
import { getEntityDomain } from '@homeos/shared'

/**
 * 合并 WS delta 状态变更到本地实体对象
 */

export interface WsDeltaChange {
  _delta?: boolean
  entity_id: string
  state?: string
  changed_attributes?: Record<string, unknown>
  /** 本次 delta 中被删除的属性名；服务端未提供时为 undefined */
  removed_attributes?: string[]
  changed_at?: string
  old_state?: HaEntityState | null
  new_state?: HaEntityState | null
  /**
   * 实体已被 HA 删除（服务端 ``removed: true`` 且 ``new_state=null``）。
   *
   * 必须显式区分：``new_state`` 为空也可能是「这条 delta 没带完整状态」，
   * 那种情况要合并缓存，而删除必须清缓存 —— 混为一谈会让幽灵实体永久残留。
   */
  removed?: boolean
  /** HomeOS 入站 epoch ms，用于 E2E apply 延迟 */
  _pipelineTs?: number
}

interface NormalizedWsBatchChange {
  entity_id: string
  old_state: HaEntityState | null
  new_state: HaEntityState | null
  changed_at?: string
  changed_attributes?: Record<string, unknown>
  removed_attributes?: string[]
  _delta?: boolean
  _pipelineTs?: number
}

export function mergeWsStateChange(existing: HaEntityState | null, change: WsDeltaChange): HaEntityState | null {
  if (!change?._delta) {
    return change.new_state ?? null
  }

  if (!existing) {
    return {
      entity_id: change.entity_id,
      state: change.state ?? 'unknown',
      attributes: { ...(change.changed_attributes || {}) },
    }
  }

  const attributes = { ...(existing.attributes || {}) }
  // 删除服务端标记为已移除的属性，避免 merge 后残留已删除的脏属性
  const removed = change.removed_attributes
  if (Array.isArray(removed)) {
    for (const key of removed) {
      delete attributes[key]
    }
  }

  return {
    ...existing,
    state: change.state !== undefined ? change.state : existing.state,
    // delta 也要推进时间戳：否则缓存里的 ``last_updated`` 永远停在最后一次整包同步，
    // 既让「最近更新」显示不动，也让 ``isStaleState`` 失去比较基准（永远判不出陈旧）。
    ...deltaTimestamps(existing, change),
    attributes: {
      ...attributes,
      ...(change.changed_attributes || {}),
    },
  }
}

/** delta 时间戳推进：状态值真的变了才动 ``last_changed``（HA 语义）。 */
function deltaTimestamps(
  existing: HaEntityState,
  change: WsDeltaChange,
): Pick<HaEntityState, 'last_updated' | 'last_changed'> | Record<string, never> {
  const at = change.changed_at
  if (typeof at !== 'string' || !at) return {}
  const stateChanged = change.state !== undefined && change.state !== existing.state
  return stateChanged ? { last_updated: at, last_changed: at } : { last_updated: at }
}

/** 将 WS batch 条目规范化为 applyEntityStateUpdate 所需的 old/new 结构 */
export function normalizeWsBatchChange(
  change: WsDeltaChange,
  entities: EntitiesMap,
): WsDeltaChange | NormalizedWsBatchChange {
  if (!change?._delta) return change

  const existing = entities[change.entity_id] || null
  const merged = mergeWsStateChange(existing, change)
  return {
    entity_id: change.entity_id,
    // old_state 的 attributes 浅拷贝，避免与主缓存共享引用被后续合并/乐观叠加污染
    old_state: existing ? { ...existing, attributes: { ...(existing.attributes || {}) } } : null,
    new_state: merged,
    changed_at: change.changed_at,
    // 透传 changed_attributes，供 apply 阶段精确判断属性级变更通知
    changed_attributes: change.changed_attributes,
    // 透传 removed_attributes，供 apply 阶段从合并结果中删除已移除属性
    removed_attributes: change.removed_attributes,
    ...(typeof change._pipelineTs === 'number' ? { _pipelineTs: change._pipelineTs } : {}),
  }
}

export type NormalizedWsBatchItem = WsDeltaChange | NormalizedWsBatchChange

/**
 * 解析 HA 时间戳（``2026-11-01T00:00:00.123456+00:00``）为 epoch ms。
 *
 * 为什么不直接 ``Date.parse``：HA 的时间戳带**微秒**（6 位小数），而 ECMAScript 只规定
 * 到毫秒，Safari 等引擎会直接返回 ``Invalid Date``。先截到 3 位再交给 ``Date.parse``，
 * 各引擎行为才一致。
 */
export function parseHaTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text) return null
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:?\d{2})?$/.exec(text)
  if (!match) {
    const fallback = Date.parse(text)
    return Number.isFinite(fallback) ? fallback : null
  }
  const [, base, fraction = '', zone = 'Z'] = match
  const millis = Number(`${fraction}000`.slice(0, 3))
  const parsed = Date.parse(`${base}.${String(millis).padStart(3, '0')}${zone}`)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * 判断一条推送是否**陈旧**（比本地已有的状态更旧）。
 *
 * WS 增量、断线补发的整包、启动分片三路可能乱序到达：一条先发出、后到达的 delta 会把
 * 新状态写回旧值，而之后没有任何机制能自愈（HA 只在真正变化时才推送，界面会一直停在
 * 错误状态，直到用户手动刷新）。因此凡是「按时间戳可比较」的写入都必须先过这一关。
 *
 * 缺时间戳（``changed_at`` 为空）时**不判定**陈旧：宁可多合并一次，也不能因为字段缺失
 * 把真实更新丢掉。
 */
export function isStaleState(
  changedAt: string | null | undefined,
  existing: HaEntityState | null | undefined,
): boolean {
  if (!existing) return false
  return isOlderFrameTimestamp(changedAt, existing.last_updated ?? existing.last_changed)
}

/**
 * 两份「带时间戳的帧」谁更新：``incoming`` 是否严格早于 ``existing``。
 *
 * socket.io 侧比的是实体的 ``last_updated``，``/ws/runtime`` 侧比的是 hub 归一后的
 * ``updatedAt`` / ``lastChanged`` —— 字段名不同、判据必须是同一份实现，否则两条通道
 * 对「旧帧」的处理会出现分歧（一条丢弃、另一条把界面推回过去）。
 *
 * 任一侧缺时间戳时返回 ``false``：拿不到凭据就不判陈旧，宁可多合并一次也不丢真实更新。
 */
export function isOlderFrameTimestamp(incoming: unknown, existing: unknown): boolean {
  const incomingMs = parseHaTimestamp(incoming)
  if (incomingMs === null) return false
  const existingMs = parseHaTimestamp(existing)
  return existingMs !== null && incomingMs < existingMs
}

/**
 * 分块快照与本地已有实体合并（chunk 比本地旧时使用）。
 *
 * 早期实现直接整条跳过：但本地那份可能只是**半实体** —— 它来自一条先到的 delta，
 * 只带了 ``state`` 与变动属性，缺失的属性键永远补不回来（HA 只在变化时推送，
 * 缺的键不会自己出现）。用 chunk 补全缺失键、保留本地的 state / 时间戳即可两全。
 *
 * 合并规则（逐层「本地优先、chunk 补缺」）：
 * - 顶层字段：本地有值就用本地（``undefined`` 不算有值，让 chunk 补）；
 * - ``attributes``：先铺 chunk 的全部属性，再盖上本地的（本地是更新的一次快照）。
 */
export function mergeChunkIntoNewerEntity(local: HaEntityState, chunk: HaEntityState): HaEntityState {
  const definedLocal = Object.fromEntries(
    Object.entries(local).filter(([, value]) => value !== undefined),
  ) as HaEntityState
  return {
    ...chunk,
    ...definedLocal,
    attributes: { ...(chunk.attributes || {}), ...(local.attributes || {}) },
  }
}

/**
 * 拆出真正需要归一化的 delta 条目（连同其原始下标）。
 * 非 delta 条目（断线补发的整包实体状态）不含增量语义，规范化只是原样透传；
 * 把它们一起送进 Worker 只会白付整包实体的结构化克隆成本，重连补发时最容易拖到超时。
 */
export function splitDeltaChanges(changes: WsDeltaChange[]): {
  deltas: WsDeltaChange[]
  positions: number[]
} {
  const deltas: WsDeltaChange[] = []
  const positions: number[] = []
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i]
    if (!change?._delta) continue
    deltas.push(change)
    positions.push(i)
  }
  return { deltas, positions }
}

/**
 * 把 delta 的规范化结果按原始下标写回整批，非 delta 位置保持原条目（引用不变）。
 * 长度对不上（结果缺失）时返回 null，由调用方回退整批同步规范化。
 */
export function mergeNormalizedDeltas(
  changes: WsDeltaChange[],
  positions: number[],
  normalized: NormalizedWsBatchItem[],
): NormalizedWsBatchItem[] | null {
  if (normalized.length !== positions.length) return null
  const out = changes.slice() as NormalizedWsBatchItem[]
  for (let i = 0; i < positions.length; i++) {
    out[positions[i]] = normalized[i]
  }
  return out
}

/**
 * 同步规范化整批 WS delta。
 * 同批次内同一实体多条 delta 需依次叠加：用 overrides 记录上一条合并结果，
 * 避免后一条基于旧快照覆盖前一条（如先 state 后 brightness 时丢失 state 变更）。
 * Worker 与主线程 bridge 共用，禁止双份实现。
 */
export function normalizeWsBatchChangesSync(
  changes: WsDeltaChange[],
  entitySnapshots: EntitiesMap,
): NormalizedWsBatchItem[] {
  const overrides: EntitiesMap = {}
  const out: NormalizedWsBatchItem[] = []
  for (let i = 0; i < changes.length; i++) {
    const raw = changes[i]
    if (!raw) continue
    if (!raw._delta) {
      out.push(raw)
      continue
    }
    const id = raw.entity_id
    const base = id in overrides ? overrides[id] : (entitySnapshots[id] ?? null)
    const norm = normalizeWsBatchChange(raw, base ? { [id]: base } : {})
    if (norm?.new_state) overrides[id] = norm.new_state
    out.push(norm)
  }
  return out
}

/** 实体状态监听注册表 + 批量派发 */

// ── entity-state-listener-registry.util ──
/**
 * 实体状态监听器索引注册表：按 entity_id / domain 定向派发，避免 O(batch × listeners) 全量广播
 */

const WILDCARD = '*'
const DOMAIN_PREFIX = '@domain:'

const byEntity = new Map<string, Set<EntityStateListenerFn>>()
const listenerKeys = new Map<EntityStateListenerFn, Set<string>>()

function ensureSet(key: string): Set<EntityStateListenerFn> {
  let set = byEntity.get(key)
  if (!set) {
    set = new Set<EntityStateListenerFn>()
    byEntity.set(key, set)
  }
  return set
}

function domainKey(domain: string): string {
  return `${DOMAIN_PREFIX}${domain}`
}

function normalizeKeys(
  entityIds: string | string[] | undefined | null,
  domains: string[] | undefined | null,
): Set<string> {
  const keys = new Set<string>()
  if (Array.isArray(domains) && domains.length > 0) {
    for (const d of domains) {
      if (d) keys.add(domainKey(d))
    }
  }
  if (entityIds == null || entityIds === '') {
    if (!keys.size) keys.add(WILDCARD)
    return keys
  }
  const arr = Array.isArray(entityIds) ? entityIds : [entityIds]
  for (const id of arr) {
    if (id) keys.add(id)
  }
  if (!keys.size) keys.add(WILDCARD)
  return keys
}

export function registerStateListener(
  fn: EntityStateListenerFn,
  options: RegisterStateListenerOptions = {},
): () => void {
  if (typeof fn !== 'function') return () => {}
  unregisterStateListener(fn)
  const keys = normalizeKeys(options.entityIds, options.domains)
  listenerKeys.set(fn, keys)
  for (const key of keys) {
    ensureSet(key).add(fn)
  }
  return () => unregisterStateListener(fn)
}

function unregisterStateListener(fn: EntityStateListenerFn): void {
  const keys = listenerKeys.get(fn)
  if (!keys) return
  for (const key of keys) {
    byEntity.get(key)?.delete(fn)
    if (byEntity.get(key)?.size === 0) byEntity.delete(key)
  }
  listenerKeys.delete(fn)
}

/** 向一组监听器派发 payload（跳过已通知过的，单条异常不阻断其余派发） */
function dispatchToSet(
  set: Set<EntityStateListenerFn> | undefined,
  payload: EntityStateListenerPayload,
  notified: Set<EntityStateListenerFn>,
  logger: EntityStateListenerLogger | undefined,
): void {
  if (!set) return
  for (const fn of set) {
    if (notified.has(fn)) continue
    notified.add(fn)
    try {
      fn(payload)
    } catch (e) {
      logger?.error?.('状态监听器错误:', e)
    }
  }
}

export function dispatchStateListener(
  payload: EntityStateListenerPayload,
  logger: EntityStateListenerLogger | undefined,
): void {
  const entityId = payload?.entity_id
  const notified = new Set<EntityStateListenerFn>()

  dispatchToSet(byEntity.get(WILDCARD), payload, notified, logger)

  if (entityId) {
    dispatchToSet(byEntity.get(entityId), payload, notified, logger)
    const domain = getEntityDomain(entityId)
    if (domain) {
      dispatchToSet(byEntity.get(domainKey(domain)), payload, notified, logger)
    }
  }
}

export function stateListenerPayloadFingerprint(payload: EntityStateListenerPayload): string {
  const eid = payload?.entity_id ?? ''
  const oldS = payload?.old_state
  const newS = payload?.new_state
  const attrText = describeAttrChange(eid, oldS?.attributes, newS?.attributes)
  if (attrText) return `${eid}|attr|${attrText}`
  return `${eid}|state|${oldS?.state ?? ''}|${newS?.state ?? ''}`
}

function notificationFingerprint(payload: EntityStateListenerPayload): string {
  return stateListenerPayloadFingerprint(payload)
}

/**
 * 批内去重：仅折叠与上一条完全相同的通知，保留同实体连续不同变更。
 */
function dedupeNotificationBatch(batch: EntityStateListenerPayload[]): EntityStateListenerPayload[] {
  const out: EntityStateListenerPayload[] = []
  let lastFp = ''
  for (let i = 0; i < batch.length; i++) {
    const payload = batch[i]
    if (!payload?.entity_id) continue
    const fp = notificationFingerprint(payload)
    if (fp === lastFp) continue
    out.push(payload)
    lastFp = fp
  }
  return out
}

function dispatchBatchNotifications(
  batch: EntityStateListenerPayload[],
  logger: EntityStateListenerLogger | undefined,
): void {
  const deduped = dedupeNotificationBatch(batch)
  for (const payload of deduped) {
    dispatchStateListener(payload, logger)
  }
}

export function getStateListenerCount(): number {
  return listenerKeys.size
}

export function getStateListenerStats(): {
  total: number
  global: number
  indexed: number
  domainScoped: number
  indexBuckets: number
} {
  let global = 0
  let indexed = 0
  let domainScoped = 0
  for (const keys of listenerKeys.values()) {
    if (keys.size === 1 && keys.has(WILDCARD)) {
      global++
    } else if ([...keys].every((k) => k.startsWith(DOMAIN_PREFIX))) {
      domainScoped++
    } else {
      indexed++
    }
  }
  return {
    total: listenerKeys.size,
    global,
    indexed,
    domainScoped,
    indexBuckets: byEntity.size,
  }
}

// ── entity-state-listener-batch.util ──
let pendingNotifications: EntityStateListenerPayload[] = []
let flushScheduled = false
let listenersPaused = false
let onPageVisible: (() => void) | null = null

const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn: () => void) => setTimeout(fn, 16)

let flushDeps: EntityStateListenerFlushDeps | null = null

/** 后台标签页期间最多积压多少条；超出按实体合并、只保留最后一帧。 */
const MAX_PENDING_NOTIFICATIONS = 500

const FALLBACK_FLUSH_DEPS: EntityStateListenerFlushDeps = { logger }

// 模块顶层一次性注册：监听器集合是模块级单例，可见性钩子无归属对象可挂，不配对移除。
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      listenersPaused = true
      return
    }
    listenersPaused = false
    onPageVisible?.()
    if (pendingNotifications.length) resumeListenerFlush()
  })
}

function getFlushDeps(): EntityStateListenerFlushDeps {
  return flushDeps || FALLBACK_FLUSH_DEPS
}

function rememberFlushDeps(deps: EntityStateListenerFlushDeps | null | undefined): void {
  if (deps) flushDeps = deps
}

function resumeListenerFlush(): void {
  if (!pendingNotifications.length || listenersPaused) return
  scheduleListenerFlush(getFlushDeps())
}

function flushListenerNotifications(): void {
  flushScheduled = false
  if (listenersPaused || !pendingNotifications.length) return

  const batch = pendingNotifications
  pendingNotifications = []
  dispatchBatchNotifications(batch, getFlushDeps().logger)
}

function scheduleListenerFlush(deps: EntityStateListenerFlushDeps): void {
  rememberFlushDeps(deps)
  if (flushScheduled || listenersPaused) return
  flushScheduled = true
  raf(flushListenerNotifications)
}

export function enqueueStateListenerNotifications(
  deps: EntityStateListenerFlushDeps,
  notifications: EntityStateListenerPayload[],
): void {
  if (!notifications?.length) return
  rememberFlushDeps(deps)
  pendingNotifications.push(...notifications)
  // 隐藏标签页时这里只入队不派发（entity socket 仍然连着）：电表/传感器一秒钟十几条，
  // 挂后台一小时就是几万条完整 state（含属性包）。按实体合并只留最后一帧，
  // 仍超限就截断到最新的 N 条 —— 回前台不会因为一次性同步派发而卡死。
  if (pendingNotifications.length > MAX_PENDING_NOTIFICATIONS) {
    pendingNotifications = compactPendingNotifications(pendingNotifications)
  }
  if (listenersPaused) return
  scheduleListenerFlush(deps)
}

/** 按实体只保留最后一次出现，并保持相对顺序；无 entity_id 的条目原样保留。 */
function compactPendingNotifications(list: EntityStateListenerPayload[]): EntityStateListenerPayload[] {
  const seen = new Set<string>()
  const kept: EntityStateListenerPayload[] = []
  for (let i = list.length - 1; i >= 0; i--) {
    const payload = list[i]
    const entityId = payload?.entity_id
    if (entityId) {
      if (seen.has(entityId)) continue
      seen.add(entityId)
    }
    kept.push(payload)
  }
  kept.reverse()
  return kept.length > MAX_PENDING_NOTIFICATIONS ? kept.slice(kept.length - MAX_PENDING_NOTIFICATIONS) : kept
}

/**
 * 单条更新路径：关键域即时通知，sensor 等走 rAF 合并
 */
export function notifyStateListener(
  deps: EntityStateListenerFlushDeps,
  payload: EntityStateListenerPayload,
  flushOptions: { immediate?: boolean } = {},
): void {
  if (flushOptions.immediate) {
    dispatchStateListener(payload, deps.logger)
    return
  }
  enqueueStateListenerNotifications(deps, [payload])
}

export function setStateListenerVisibilityHandler(fn: (() => void) | null): void {
  onPageVisible = fn
}

export function getPendingListenerCount(): number {
  return pendingNotifications.length
}

/**
 * 判断是否应向 onStateChanged 监听器派发事件（避免乐观更新 + WS 回显重复）
 */

function attributesChanged(
  cached: HaEntityState | null | undefined,
  newState: HaEntityState | null | undefined,
  changedAttributes: Record<string, unknown> | undefined,
): boolean {
  if (changedAttributes != null) {
    return Object.keys(changedAttributes).length > 0
  }
  if (!cached || !newState) return false
  return cached.attributes !== newState.attributes
}

export function shouldNotifyStateChange({
  cached,
  cachedOld,
  newStateValue,
  oldState,
  newState,
  changedAttributes,
}: EntityStateNotifyArgs): boolean {
  if (!newState) return true

  const serverAttrDelta = changedAttributes != null && Object.keys(changedAttributes).length > 0
  const haReportedChange = !!(oldState && newState && oldState.state !== newState.state)
  const attrsChanged = attributesChanged(cached, newState, changedAttributes)

  // 服务端 WS delta 确认的属性变更（常见于空调调温/风速后的乐观回显）
  if (serverAttrDelta && attrsChanged) {
    return true
  }

  // 乐观更新已派发监听器：WS/REST 回显确认同一目标态时不再重复通知
  if (cached?._optimistic) {
    if (haReportedChange && newStateValue !== cachedOld) return true
    return false
  }

  const alreadyAtNewState = cachedOld === newStateValue
  const localChanged = cachedOld !== newStateValue

  if (!haReportedChange && !localChanged && attrsChanged) {
    return true
  }

  return (haReportedChange && !alreadyAtNewState) || (localChanged && !alreadyAtNewState)
}

/** 监听器 old_state：优先 HA 上报的真实旧态 */
export function resolveListenerOldState({
  haReportedChange,
  oldState,
  cached,
}: ResolveListenerOldStateArgs): HaEntityState | null {
  const haChanged = !!haReportedChange
  return (haChanged ? oldState : null) ?? cached ?? null
}

export function haStateChanged(
  oldState: HaEntityState | null | undefined,
  newState: HaEntityState | null | undefined,
): boolean {
  return !!(oldState && newState && oldState.state !== newState.state)
}

/**
 * 实体类型识别（生活账户：水 / 电 / 气 / 通讯）。
 */
/**
 * 判断是否为电力实体（entity_id 以 sensor.ele_ 开头）。
 */
export function isElectricityEntity(id: string | null | undefined): boolean {
  return !!id && id.startsWith('sensor.ele_')
}

/**
 * 判断是否为燃气实体（entity_id 以 sensor.gas_ 开头）。
 */
export function isGasEntity(id: string | null | undefined): boolean {
  return !!id && id.startsWith('sensor.gas_')
}

/**
 * 判断是否为水务实体（entity_id 以 sensor.water_ 开头）。
 */
export function isWaterEntity(id: string | null | undefined): boolean {
  return !!id && id.startsWith('sensor.water_')
}

/**
 * 判断是否为通讯实体（entity_id 以 sensor.ct_/sensor.cu_ 开头）。
 */
export function isCommEntity(id: string | null | undefined): boolean {
  return !!id && (id.startsWith('sensor.ct_') || id.startsWith('sensor.cu_'))
}

/**
 * 判断是否为公用事业实体（电力/燃气/水务/通讯任一）。
 */
export function isUtilityEntity(id: string | null | undefined): boolean {
  return isElectricityEntity(id) || isGasEntity(id) || isWaterEntity(id) || isCommEntity(id)
}
