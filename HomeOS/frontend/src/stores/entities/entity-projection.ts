/**
 * 按路由/布局维护精简实体投影（组件层只读展示字段）
 *
 * 本模块维护一份「精简投影」缓存：仅包含组件渲染所需的只读字段
 *（entity_id / state / domain / friendly_name / isOn / attributes），
 * 通过 setProjectionScope 限定当前路由关心的实体 ID 集合，
 * 避免组件直接订阅完整 entities map 导致的过度重渲染。
 *
 * 数据流：
 * 1. setProjectionScope(ids) → 设定当前路由的活跃实体 ID 集合，清除非活跃投影
 * 2. WS 推送 / 乐观更新 → patchProjectionsFromChanges → upsertProjection
 * 3. 组件通过 getProjection(entityId) 读取只读投影
 *
 * 依赖：
 * - @homeos/shared：getEntityDomain（域解析）
 * - @/utils/entity/entity-derived.util：getEntityDisplayName（友好名称）
 * - @/types/entity-store：类型定义
 */
import { shallowReactive, markRaw } from 'vue'
import { getEntityDomain } from '@homeos/shared'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import type {
  EntitiesMap,
  EntityProjection,
  EntityProjectionChange,
  HaEntityState,
} from '@/types/entity-store'

/** 投影缓存：entity_id → EntityProjection（shallowReactive Map，键级响应） */
const projections = shallowReactive(new Map<string, EntityProjection>())

/** 当前路由活跃的实体 ID 集合（setProjectionScope 设定） */
let activeIds = new Set<string>()

/**
 * 将完整实体状态转换为精简投影
 *
 * 提取组件渲染所需的只读字段：entity_id / state / domain / friendly_name / isOn / attributes。
 * 使用 markRaw 标记，避免 Vue 对投影对象做不必要的深度响应式转换。
 *
 * @param entity - 完整实体状态；为空时返回 null
 * @returns 精简投影对象，或 null（无 entity_id 时）
 */
function toEntityProjection(
  entity: HaEntityState | null | undefined,
): EntityProjection | null {
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
 */
export function setProjectionScope(ids: Iterable<string>): void {
  activeIds = new Set(ids)
  for (const key of projections.keys()) {
    if (!activeIds.has(key)) projections.delete(key)
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
export function patchProjectionsFromChanges(
  changes: EntityProjectionChange[],
  entitiesMap: EntitiesMap,
): void {
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
  activeIds = new Set<string>()
}

/**
 * 获取当前活跃投影的实体 ID 列表
 * @returns 活跃实体 ID 数组（副本）
 */
export function getActiveProjectionIds(): string[] {
  return [...activeIds]
}