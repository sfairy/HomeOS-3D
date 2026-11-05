/**
 * 合并 WS delta 状态变更到本地实体对象
 */
import type { EntitiesMap, HaEntityState } from '@/shared/types/entity-store'

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
