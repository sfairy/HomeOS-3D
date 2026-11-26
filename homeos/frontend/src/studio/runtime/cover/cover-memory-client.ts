/**
 * 窗帘 / 晾衣架 / 开窗器的**展示用**姿态记忆（0.8.4 `cover-memory` 前端消费端）。
 *
 * 为什么需要它：HA 的 `cover` 实体在 `opening` / `closing` 期间通常只报方向、不报实时
 * 位置，部分电机甚至到位后才更新 `current_position`。后端 `cover_memory.py` 会把这些
 * 观察攒成「上次位置 + 补间样本」，本模块负责两件事：
 *
 * 1. 拉取 `GET /cover-memory` 并把后端条目归一成渲染层认识的形状；
 * 2. 把本地 HA 状态观测（`current_position` / `current_tilt_position` / `state=closed`）
 *    按 `at` 取新合并进去 —— 后端快照是低频的，实时状态才是「刚刚停在哪」的权威。
 *
 * 三条硬边界（与上游一致）：只读、按 `scope` 失效（换 HA 连接后旧历史一律作废）、
 * 失败静默（拿不到记忆只影响动画，绝不能影响控制）。
 *
 * 条目形状（`cover-state.ts` 的 `coverMemorySample` 直接消费）：
 *
 * ```ts
 * {
 *   position?: { position: 0-100, at: ms, nativeTilt: boolean },
 *   tilt?: { position: 0-100, at: ms },
 *   closedAt?: ms,
 *   closedNative?: boolean,
 *   estimates: { rail?: { position, at, target?, duration? }, dream?: ..., "airer:0:0"?: ... }
 * }
 * ```
 */

import {
  isAssumedState,
  mergeTravelState,
  nextTravelState,
  observedTimestamp,
  readLastState,
  readTravelPayload,
  supportedFeatureBits,
  type CoverMemoryTravel,
} from './cover-memory-travel'

export type { CoverMemoryTravel }

/** 记忆里的一条「位置 + 时刻」。 */
export interface CoverMemoryPoint {
  position: number
  at: number
  nativeTilt?: boolean
  /**
   * HA 标了 `assumed_state`：这个位置是**推测**出来的（红外/射频控制的电机、
   * 重启后恢复的状态）。带这个标记的点仍然要更新显示，但渲染层不该把它当成
   * 精确值去做「还差几厘米」的判断。
   */
  assumed?: boolean
}

/** 记忆里的一条补间样本（后端 `sample()` 的产物）。 */
export interface CoverMemoryEstimate {
  position: number
  at: number
  target?: number
  duration?: number
  delay?: number
}

/** 单个实体的记忆条目。 */
export interface CoverMemoryEntry {
  position?: CoverMemoryPoint
  tilt?: CoverMemoryPoint
  closedAt?: number
  closedNative?: boolean
  estimates: Record<string, CoverMemoryEstimate>
  /**
   * 本段行程的起点（0.8.9）。没有它就只能在「最后一次上报」和「估算目标」之间插值，
   * 而行程刚开始时最后一次上报可能已经过时几百毫秒 —— 起点让补间从正确的像素位置出发。
   */
  travel?: CoverMemoryTravel
  /** 上一次观察到的开合状态（用于识别「刚进入 opening/closing」这个瞬间）。 */
  lastState?: string
}

/** 归约后的实体记忆表。 */
export type CoverMemoryMap = Record<string, CoverMemoryEntry>

/** 只认 `cover.` 域的实体：其它域即使被后端误写进来也不参与补间。 */
const COVER_ENTITY_PATTERN = /^cover\.[a-z0-9_]+$/
/** 允许参与记忆聚合的 HA 状态（瞬态也要，方向本身就是证据）。 */
const COVER_MEMORY_STATES = ['open', 'closed', 'opening', 'closing']

/** 有限数字；`bool` 不算数字（`true` 在 JS 里会被 `Number()` 变成 1）。 */
function finiteNumber(value: any): number | null {
  return typeof value == 'number' && Number.isFinite(value) ? value : null
}

/** 0–100 的位置；越界视为脏数据。 */
function coverPosition(value: any): number | null {
  const numericValue = typeof value == 'number' ? value : typeof value == 'string' && value.trim() ? Number(value) : NaN
  return Number.isFinite(numericValue) && numericValue >= 0 && numericValue <= 100 ? numericValue : null
}

/** 毫秒时间戳：只接受正数，避免 0 / NaN 把「更新」判定搞反。 */
function timestamp(value: any): number | null {
  const numericValue = finiteNumber(value)
  return numericValue !== null && numericValue > 0 ? numericValue : null
}

/** 单轴「位置 + 时刻」点：`nativeTilt` / `assumed` 只在为真时写入（保持条目精简）。 */
function readAxisPoint(value: unknown, fallbackAt: number | null): CoverMemoryPoint | null {
  if (!value || typeof value != 'object') return null
  const point = value as Record<string, unknown>
  const pointPosition = coverPosition(point.position),
    pointAt = timestamp(point.at) ?? fallbackAt
  if (pointPosition === null || pointAt === null) return null
  return {
    position: pointPosition,
    at: pointAt,
    ...(point.nativeTilt === true ? { nativeTilt: true } : {}),
    ...(point.assumed === true ? { assumed: true } : {}),
  }
}

/**
 * 读位置与倾角两轴。
 *
 * 两套形状都要认：上游 `{position: {...}, tilt: {...}}`，本仓库 `{open, attributes: {...}}`。
 * 认不出来就留空，不猜。
 */
function readAxisPoints(raw: any, fallbackAt: number | null) {
  const points: Pick<CoverMemoryEntry, 'position' | 'tilt'> = {}
  const positionPoint = readAxisPoint(raw.position, fallbackAt)
  if (positionPoint) points.position = positionPoint
  else {
    // 本仓库形状：`open` 是最近一次上报的位置，`reportAt` 是它的时刻。
    const legacyPosition = coverPosition(raw.open ?? raw.attributes?.current_position)
    if (legacyPosition !== null && fallbackAt !== null)
      points.position = {
        position: legacyPosition,
        at: fallbackAt,
        ...(raw.nativeTilt === true ? { nativeTilt: true } : {}),
      }
  }
  const tiltPoint = readAxisPoint(raw.tilt, fallbackAt)
  if (tiltPoint) points.tilt = tiltPoint
  else {
    const legacyTilt = coverPosition(raw.attributes?.tilt ?? raw.attributes?.current_tilt_position)
    if (legacyTilt !== null && fallbackAt !== null) points.tilt = { position: legacyTilt, at: fallbackAt }
  }
  return points
}

/**
 * 把后端（0.8.4 上游或本仓库 `cover_memory.py`）的一条记录归一成 `CoverMemoryEntry`。
 *
 * 两套形状都要认：
 * - 上游：`{position: {position, at, nativeTilt}, tilt: {...}, closedAt, estimates: {rail: ...}}`；
 * - 本仓库：`{open, attributes: {current_position, tilt}, reportAt, identity, estimates: [...]}`。
 *
 * 认不出来的字段一律丢掉，不猜。
 */
export function normalizeCoverMemoryEntry(raw: any): CoverMemoryEntry | null {
  if (!raw || typeof raw != 'object') return null
  const entry: CoverMemoryEntry = { estimates: {} }
  const fallbackAt = timestamp(raw.reportAt) ?? timestamp(raw.at) ?? timestamp(raw.last_updated) ?? null

  Object.assign(entry, readAxisPoints(raw, fallbackAt))

  // 0.8.9：行程起点与上次状态。
  const travel = readTravelPayload(raw.travel ?? raw.knownStart ?? raw.known_start)
  if (travel) entry.travel = travel
  const lastState = readLastState(raw.lastState, COVER_MEMORY_STATES)
  if (lastState) entry.lastState = lastState

  const closedAt = timestamp(raw.closedAt)
  if (closedAt !== null) {
    entry.closedAt = closedAt
    entry.closedNative = raw.closedNative === true
  }

  const readEstimate = (value: any): CoverMemoryEstimate | null => {
    if (!value || typeof value != 'object') return null
    const estimatePosition = coverPosition(value.position),
      estimateAt = timestamp(value.at) ?? fallbackAt
    if (estimatePosition === null || estimateAt === null) return null
    const estimate: CoverMemoryEstimate = { position: estimatePosition, at: estimateAt }
    const target = coverPosition(value.target)
    if (target !== null) estimate.target = target
    if (finiteNumber(value.duration) !== null && value.duration >= 0 && value.duration <= 600)
      estimate.duration = value.duration
    if (finiteNumber(value.delay) !== null && value.delay >= 0 && value.delay <= 2400) estimate.delay = value.delay
    return estimate
  }

  if (Array.isArray(raw.estimates)) {
    // 本仓库：`estimates` 是一个数组，最后一条才是当前这一段行程。
    const axis = typeof raw.identity == 'string' && raw.identity ? raw.identity : 'rail',
      latestEstimate = readEstimate(raw.estimates[raw.estimates.length - 1])
    if (latestEstimate) entry.estimates[axis] = latestEstimate
  } else if (raw.estimates && typeof raw.estimates == 'object') {
    for (const [axis, value] of Object.entries(raw.estimates)) {
      const estimate = readEstimate(value)
      estimate && axis && (entry.estimates[axis] = estimate)
    }
  }

  return entry.position || entry.tilt || entry.closedAt || Object.keys(entry.estimates).length ? entry : null
}

/** 取 `at` 更晚的那条；相同时保留已有值（后端快照不覆盖刚刚的本地观测）。 */
function laterPoint(
  current: CoverMemoryPoint | undefined,
  candidate: CoverMemoryPoint | null,
): CoverMemoryPoint | undefined {
  if (!candidate) return current
  if (!current || candidate.at > current.at) return candidate
  return current
}

/** 合并两条记忆：逐轴、逐通道按 `at` 取新。 */
export function mergeCoverMemoryEntries(
  current: CoverMemoryEntry | undefined,
  incoming: CoverMemoryEntry | null,
): CoverMemoryEntry | undefined {
  if (!incoming) return current
  const merged: CoverMemoryEntry = {
    ...(current || { estimates: {} }),
    estimates: { ...(current?.estimates || {}) },
  }
  const position = laterPoint(merged.position, incoming.position || null)
  if (position) merged.position = position
  const tilt = laterPoint(merged.tilt, incoming.tilt || null)
  if (tilt) merged.tilt = tilt
  if (incoming.closedAt && (!merged.closedAt || incoming.closedAt > merged.closedAt)) {
    merged.closedAt = incoming.closedAt
    merged.closedNative = incoming.closedNative === true
  }
  for (const [axis, estimate] of Object.entries(incoming.estimates)) {
    const existingEstimate = merged.estimates[axis]
    if (!existingEstimate || estimate.at >= existingEstimate.at) merged.estimates[axis] = estimate
  }
  // 行程字段（起点 / 上次状态）单独合并，见 `mergeTravelState`。
  mergeTravelState(merged, incoming)
  return merged
}

/**
 * 本地观察：把一帧 HA 状态压进记忆。
 *
 * 与上游 `_0x3b59f2` 同口径 —— 只认 `cover.` 域、可用、且状态在开合四态里的实体；
 * `current_position` 比已有记录新才覆盖；`closed` 直接记成「已合拢」的时刻。
 */
export function observeCoverMemoryState(
  current: CoverMemoryEntry | undefined,
  stateChange: any,
): CoverMemoryEntry | undefined {
  const rawState = stateChange?.newState || stateChange
  if (!rawState || typeof rawState != 'object') return current
  if (rawState.available === false) return current
  const stateText = String(rawState.state || '')
    .trim()
    .toLowerCase()
  if (!COVER_MEMORY_STATES.includes(stateText)) return current
  const attributes = rawState.attributes && typeof rawState.attributes == 'object' ? rawState.attributes : {}
  const observedAt = observedTimestamp(rawState),
    supportedFeatures = supportedFeatureBits(attributes)
  const next: CoverMemoryEntry = {
    ...(current || { estimates: {} }),
    estimates: { ...(current?.estimates || {}) },
  }
  /*
   * `assumed_state`（0.8.9）：HA 只在「它自己也不确定」时给这个标记 —— 红外/射频控制的
   * 电机、重启后从 `restore_state` 恢复的位置。带标记的读数仍然要更新（否则显示会停在
   * 旧值），但打上 `assumed` 让渲染层知道它不该被当成精确值。
   */
  const assumedState = isAssumedState(attributes, rawState)
  const reportedPosition = coverPosition(attributes.current_position)
  if (reportedPosition !== null && observedAt >= (next.position?.at || 0))
    next.position = {
      position: reportedPosition,
      at: observedAt,
      nativeTilt: coverPosition(attributes.current_tilt_position) !== null || !!(supportedFeatures & 240),
      ...(assumedState ? { assumed: true } : {}),
    }
  // 行程起点（0.8.9 `known_start`）：see `nextTravelState` for the "once per travel" rule.
  Object.assign(next, nextTravelState(next, stateText, reportedPosition, observedAt))
  const reportedTilt = coverPosition(attributes.current_tilt_position)
  if (reportedTilt !== null && observedAt >= (next.tilt?.at || 0))
    next.tilt = { position: reportedTilt, at: observedAt }
  if (stateText == 'closed') {
    const closedAt = Math.max(observedAt, next.closedAt || 0)
    next.closedAt = closedAt
    next.closedNative = true
  }
  return next.position || next.tilt || next.closedAt || Object.keys(next.estimates).length ? next : current
}

/** 把记忆挂到实体状态上（与上游 `{...state, coverMemory}` 同口径）。 */
export function attachCoverMemory(states: Record<string, any>, memory: CoverMemoryMap) {
  if (!states || typeof states != 'object') return states
  let patchedStates: Record<string, any> | null = null
  for (const entityId of Object.keys(memory)) {
    const entry = memory[entityId],
      stateValue = states[entityId]
    if (!entry) continue
    if (!stateValue) {
      patchedStates ||= { ...states }
      patchedStates[entityId] = {
        entityId: entityId,
        state: 'unavailable',
        available: false,
        attributes: {},
        coverMemory: entry,
      }
      continue
    }
    const rawState = stateValue.newState || stateValue
    if (rawState.coverMemory === entry) continue
    patchedStates ||= { ...states }
    patchedStates[entityId] = { ...rawState, coverMemory: entry }
  }
  return patchedStates || states
}

export interface CoverMemoryClientOptions {
  projectId?: string
  componentId?: string
  /** 注入用（单测 / 宿主自带的 fetch）；默认 `window.fetch`。 */
  fetchImpl?: typeof fetch | null
  /** 拉取超时；上游 10s。 */
  timeoutMs?: number
}

export interface CoverMemoryClient {
  /** 记录一批 HA 状态（不传 `patch` 时按整表替换实体集合）。 */
  observe(states: Record<string, any> | null | undefined, options?: { patch?: boolean }): void
  /** 按实体状态生成带 `coverMemory` 的副本；没有记忆时原样返回。 */
  hydrate(states: Record<string, any>): Record<string, any>
  /** 拉取后端快照；`force` 时忽略节流。返回是否成功（失败静默）。 */
  load(force?: boolean): Promise<boolean>
  /** `cover_memory_changed` 推送：合并后重新拉取（单飞 + 40ms 合并窗口）。 */
  notifyChanged(entityId?: string): void
  /** 当前记忆表（只读快照，调试用）。 */
  entries(): CoverMemoryMap
  dispose(): void
}

/** 同一组件被多次挂载时不重复打接口：40ms 内的拉取合并成一次。 */
const MIN_FETCH_INTERVAL_MS = 40

/**
 * 创建记忆客户端。
 *
 * 生命周期：`observe` 持续喂状态；`load` 在舞台就绪后拉一次，之后由
 * `cover_memory_changed` 驱动；`dispose` 之后所有回调都变成空操作。
 */
export function createCoverMemoryClient({
  projectId = '',
  componentId = '',
  fetchImpl = typeof fetch == 'function' ? fetch.bind(globalThis) : null,
  timeoutMs = 10000,
}: CoverMemoryClientOptions = {}): CoverMemoryClient {
  const resolvedFetch: typeof fetch =
    fetchImpl ?? ((() => Promise.reject(new Error('fetch unavailable'))) as typeof fetch)
  let memory: CoverMemoryMap = {},
    // 本地观测单独存一份：后端快照回来时不能把它覆盖掉（本地往往更新）。
    localMemory: CoverMemoryMap = {},
    scope: string | null = null,
    isDisposed = false,
    activeAbortController: AbortController | null = null,
    inflightLoad: Promise<boolean> | null = null,
    pendingReloadTimerId: ReturnType<typeof setTimeout> | null = null,
    lastLoadAt = 0,
    subscribedEntityIds: Set<string> | null = null

  /** 作用域变化（换了 HA 连接）：旧历史全部作废，等下一次拉取重建。 */
  const applyScope = (nextScope: string) => {
    if (nextScope === scope) return
    scope = nextScope
    memory = {}
  }

  /** 只保留当前订阅集合里的实体；整表模式下 `null` 表示不过滤。 */
  const pruneMemory = () => {
    if (!subscribedEntityIds) return
    for (const entityId of Object.keys(memory)) subscribedEntityIds.has(entityId) || delete memory[entityId]
    // 本地观测同样要裁掉：否则下一次 `rebuildMemory` 会把已退订的实体又并回来。
    for (const entityId of Object.keys(localMemory)) subscribedEntityIds.has(entityId) || delete localMemory[entityId]
  }

  const rebuildMemory = () => {
    const mergedMemory: CoverMemoryMap = { ...memory }
    for (const [entityId, localEntry] of Object.entries(localMemory))
      mergedMemory[entityId] = mergeCoverMemoryEntries(mergedMemory[entityId], localEntry) || localEntry
    memory = mergedMemory
  }

  async function fetchSnapshot(): Promise<boolean> {
    if (isDisposed || !resolvedFetch || !projectId || !componentId) return false
    activeAbortController?.abort()
    const abortController = new AbortController()
    activeAbortController = abortController
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs)
    try {
      const response = await resolvedFetch(
        '/api/v1/modules/interaction3d/cover-memory?projectId=' +
          encodeURIComponent(projectId) +
          '&componentId=' +
          encodeURIComponent(componentId),
        { credentials: 'same-origin', signal: abortController.signal },
      )
      if (isDisposed || activeAbortController !== abortController) return false
      if (!response.ok) return false
      const payload = await response.json()
      if (isDisposed || activeAbortController !== abortController) return false
      if (!payload || typeof payload != 'object') return false
      const nextScope = typeof payload.scope == 'string' ? payload.scope : '',
        entries = payload.entries && typeof payload.entries == 'object' ? payload.entries : {}
      if (scope === null) scope = nextScope
      else applyScope(nextScope)
      for (const [entityId, rawEntry] of Object.entries(entries)) {
        if (!COVER_ENTITY_PATTERN.test(entityId)) continue
        if (subscribedEntityIds && !subscribedEntityIds.has(entityId)) continue
        const normalizedEntry = normalizeCoverMemoryEntry(rawEntry)
        if (!normalizedEntry) continue
        memory[entityId] = mergeCoverMemoryEntries(memory[entityId], normalizedEntry) || normalizedEntry
      }
      lastLoadAt = Date.now()
      return true
    } catch {
      // 超时 / 断网 / 非 JSON：记忆只是展示增强，失败静默。
      return false
    } finally {
      clearTimeout(timeoutId)
      if (activeAbortController === abortController) activeAbortController = null
    }
  }

  const startLoad = (force: boolean) => {
    if (isDisposed) return Promise.resolve(false)
    if (inflightLoad) return inflightLoad
    const elapsedMs = Date.now() - lastLoadAt
    if (!force && elapsedMs < MIN_FETCH_INTERVAL_MS) return Promise.resolve(false)
    const loadPromise = fetchSnapshot().finally(() => {
      inflightLoad === loadPromise && (inflightLoad = null)
    })
    inflightLoad = loadPromise
    return loadPromise
  }

  return {
    observe(states, options = {}) {
      if (isDisposed || !states || typeof states != 'object') return
      const isPatch = options.patch === true,
        stateEntries = Object.entries(states)
      if (!isPatch) subscribedEntityIds = new Set()
      subscribedEntityIds ||= new Set()
      for (const [entityId, stateChange] of stateEntries) {
        if (!COVER_ENTITY_PATTERN.test(entityId)) continue
        subscribedEntityIds.add(entityId)
        localMemory[entityId] = observeCoverMemoryState(localMemory[entityId], stateChange) || localMemory[entityId]
        const localEntry = localMemory[entityId]
        if (localEntry) {
          memory[entityId] = mergeCoverMemoryEntries(memory[entityId], localEntry) || localEntry
        }
      }
      if (!isPatch) pruneMemory()
    },
    hydrate(states) {
      if (isDisposed) return states
      rebuildMemory()
      return attachCoverMemory(states, memory)
    },
    load(force = false) {
      return startLoad(force)
    },
    notifyChanged(entityId?: string) {
      if (isDisposed) return
      if (entityId && COVER_ENTITY_PATTERN.test(entityId)) {
        // 后端只会在该实体真的变了时推送；把它标脏即可，拉取一次会带回全部条目。
        const localEntry = localMemory[entityId]
        localEntry && (memory[entityId] = mergeCoverMemoryEntries(memory[entityId], localEntry) || localEntry)
      }
      if (pendingReloadTimerId !== null) return
      pendingReloadTimerId = setTimeout(() => {
        pendingReloadTimerId = null
        void startLoad(true)
      }, MIN_FETCH_INTERVAL_MS)
    },
    entries() {
      rebuildMemory()
      return { ...memory }
    },
    dispose() {
      if (isDisposed) return
      isDisposed = true
      pendingReloadTimerId !== null && (clearTimeout(pendingReloadTimerId), (pendingReloadTimerId = null))
      activeAbortController?.abort()
      activeAbortController = null
      inflightLoad = null
      memory = {}
      localMemory = {}
    },
  }
}
