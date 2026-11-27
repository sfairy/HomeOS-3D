/** 按路由/布局维护精简实体投影（组件层只读展示字段） */
import { shallowReactive, markRaw } from 'vue'
import { getEntityDomain } from '@homeos/shared'
import { getEntityDisplayName } from '@/domain/entity/utils/derived'
import type { EntitiesMap, EntityProjection, EntityProjectionChange, HaEntityState } from '@/kernel/types/entity'

/** 投影缓存：entity_id → EntityProjection（shallowReactive Map，键级响应） */
const projections = shallowReactive(new Map<string, EntityProjection>())

/**
 * 每个路由视图各自的作用域（owner 用对象身份，取 `useRouteEntityProjection` 里的令牌）。
 *
 * 早期只有一个模块级 `activeIds`：`/devices` 与「设备详情」两个视图各自持有
 * `useRouteEntityProjection`，又在 `keep-alive :max="8"` 下同时存活，于是每一批 WS
 * 更新都会互相把对方的作用域清空再重建一遍（两个视图各自的 watcher 都触发）。
 */
const scopeByOwner = new Map<object, Set<string>>()

/** 未指定 owner 的调用方共用这一份作用域（保持旧 API 语义）。 */
const DEFAULT_SCOPE_OWNER = {}

/** 所有 owner 的并集：投影是否「还有人用」只看它 */
let activeIds = new Set<string>()

/** 上次参与投影的实体对象引用：store 按对象替换更新，引用没变 ⇒ 投影一定没变。 */
const sourceEntityById = new Map<string, HaEntityState>()

/** 重新计算并集，并清掉已经没人引用的投影。 */
function rebuildMergedScope(): void {
  const merged = new Set<string>()
  for (const scope of scopeByOwner.values()) for (const id of scope) merged.add(id)
  activeIds = merged
  for (const key of projections.keys()) {
    if (merged.has(key)) continue
    projections.delete(key)
    sourceEntityById.delete(key)
  }
}

/**
 * 将完整实体状态转换为精简投影
 *
 * 提取组件渲染所需的只读字段：entity_id / state / domain / friendly_name / isOn / attributes。
 * 使用 markRaw 标记，避免 Vue 对投影对象做不必要的深度响应式转换。
 *
 * @param entity - 完整实体状态；为空时返回 null
 * @returns 精简投影对象，或 null（无 entity_id 时）
 */
function toEntityProjection(entity: HaEntityState | null | undefined): EntityProjection | null {
  if (!entity?.entity_id) return null
  const domain = getEntityDomain(entity.entity_id)
  const state = entity.state ?? 'unknown'
  // isOn 判定：覆盖 on / open / playing / home 四种「活跃」状态
  const isOn = state === 'on' || state === 'open' || state === 'playing' || state === 'home'
  return markRaw({
    entity_id: entity.entity_id,
    state,
    domain,
    friendly_name: getEntityDisplayName(entity.entity_id, entity),
    isOn,
    attributes: entity.attributes || {},
  })
}

/**
 * 设置当前路由的投影作用域
 *
 * 更新活跃实体 ID 集合，并清除不在新作用域内的投影缓存。
 * 调用场景：路由切换、楼层切换等导致组件关心的实体集合变化时。
 *
 * @param ids - 当前路由需要的实体 ID 可迭代对象
 * @param owner - 作用域归属（同一时刻多个路由视图并存时必须区分）
 */
export function setProjectionScope(ids: Iterable<string>, owner: object = DEFAULT_SCOPE_OWNER): void {
  scopeByOwner.set(owner, new Set(ids))
  rebuildMergedScope()
}

/**
 * 释放某个 owner 的作用域（视图卸载时调用）。
 *
 * 不传 `owner` 等价于清空全部作用域（登出 / 重置）。
 */
export function clearProjectionScope(owner?: object): void {
  if (owner) scopeByOwner.delete(owner)
  else scopeByOwner.clear()
  if (scopeByOwner.size) rebuildMergedScope()
  else {
    projections.clear()
    sourceEntityById.clear()
    activeIds = new Set<string>()
  }
}

/**
 * 浅比较两个 attributes 对象是否相等
 * @param a - 第一个属性对象
 * @param b - 第二个属性对象
 * @returns 引用相同或所有键值对相等时返回 true
 */
function projectionAttributesEqual(
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown> | undefined,
): boolean {
  if (a === b) return true
  if (!a || !b) return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  for (let i = 0; i < keysA.length; i++) {
    const k = keysA[i]
    if (a[k] !== b[k]) return false
  }
  return true
}

/** 投影展示字段未变时保留旧引用，避免 shallowReactive Map 无意义写入触发依赖循环 */
function projectionContentEqual(
  prev: EntityProjection | null | undefined,
  next: EntityProjection | null | undefined,
): boolean {
  if (!prev || !next) return prev === next
  return (
    prev.state === next.state &&
    prev.friendly_name === next.friendly_name &&
    prev.domain === next.domain &&
    prev.isOn === next.isOn &&
    projectionAttributesEqual(prev.attributes, next.attributes)
  )
}

/**
 * 插入或更新指定实体的投影
 *
 * 若实体不在活跃作用域内则跳过；内容未变时保留旧引用避免无意义写入。
 *
 * @param entityId - 实体 ID
 * @param entity - 完整实体状态；为空时删除现有投影
 */
export function upsertProjection(entityId: string, entity: HaEntityState | null | undefined): void {
  if (!activeIds.has(entityId)) return
  // 快路径：store 按对象整体替换更新，引用没变就说明 state / attributes / friendly_name
  // 都没变（`toEntityProjection` 的全部输入都在这一个对象上）。省掉每批每实体的
  // markRaw 分配 + `getEntityDisplayName` 字符串处理。
  if (entity) {
    if (sourceEntityById.get(entityId) === entity) return
    sourceEntityById.set(entityId, entity)
  } else {
    sourceEntityById.delete(entityId)
  }
  const proj = toEntityProjection(entity)
  if (!proj) {
    if (projections.has(entityId)) projections.delete(entityId)
    return
  }
  const prev = projections.get(entityId)
  if (prev && projectionContentEqual(prev, proj)) return
  projections.set(entityId, proj)
}

/**
 * 批量修补投影：根据状态变更列表从 entities map 重建受影响实体的投影
 *
 * @param changes - 状态变更列表（仅需 entity_id 字段）
 * @param entitiesMap - 当前完整实体状态 map
 */
export function patchProjectionsFromChanges(changes: EntityProjectionChange[], entitiesMap: EntitiesMap): void {
  if (!changes?.length) return
  for (let i = 0; i < changes.length; i++) {
    const c = changes[i]
    const id = c?.entity_id
    if (!id || !activeIds.has(id)) continue
    upsertProjection(id, entitiesMap[id])
  }
}

/**
 * 获取指定实体的投影
 * @param entityId - 实体 ID
 * @returns 投影对象，不存在时返回 null
 */
export function getProjection(entityId: string): EntityProjection | null {
  return projections.get(entityId) ?? null
}

/** 清空所有投影与活跃作用域（登出 / 重置场景调用） */
export function clearProjections(): void {
  projections.clear()
  sourceEntityById.clear()
  scopeByOwner.clear()
  activeIds = new Set<string>()
}

/**
 * 获取当前活跃投影的实体 ID 列表
 * @returns 活跃实体 ID 数组（副本）
 */
export function getActiveProjectionIds(): string[] {
  return [...activeIds]
}
