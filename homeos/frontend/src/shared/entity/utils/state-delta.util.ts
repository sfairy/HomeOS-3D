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

export function mergeWsStateChange(
  existing: HaEntityState | null,
  change: WsDeltaChange,
): HaEntityState | null {
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
    attributes: {
      ...attributes,
      ...(change.changed_attributes || {}),
    },
  }
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
