/**
 * @module useApplianceSiblings
 * @description 家电兄弟实体查找组合式函数。
 *
 * 职责：
 * - 依据当前实体的 entity_id 设备前缀，从 entitiesStore 中查找共享同一前缀的兄弟实体
 *   （例如 water_dispenser_* 这类多 domain 拆分实体）。
 * - 提供按 domain / 标签匹配的便捷查询方法（number、switch、select 等）。
 *
 * 依赖：
 * - vue：computed 响应式计算。
 * - @homeos/shared：getEntityDomain 用于解析实体 domain。
 * - @/stores/entities.store：实体全量映射。
 * - @/utils/entity/entity-derived.util：getEntityDisplayName 解析显示名。
 * - @/types/entity-store：HaEntityState 实体状态类型。
 */
import { computed, type ComputedRef, type Ref } from 'vue'
import { getEntityDomain } from '@homeos/shared'
import { useEntitiesStore } from '@/stores/entities.store'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import type { EntitiesMap, HaEntityState } from '@/types/entity-store'

type EntityRefLike =
  | Ref<HaEntityState | Record<string, unknown> | null | undefined>
  | ComputedRef<HaEntityState | Record<string, unknown> | null | undefined>

interface SiblingEntitySummary {
  entity_id: string
  domain: string
  state?: string
  attributes?: HaEntityState['attributes']
}

interface SwitchSiblingResult {
  entity_id: string
  isOn: boolean
}

interface SelectSiblingResult {
  entity_id: string
  name: string
  current: string | undefined
  options: string[]
}

/** object_id 索引：实体增删时按 key 集合失效，状态刷新可复用解析结果 */
type ObjectIdIndexEntry = { eid: string; objLower: string; domain: string }
let cachedKeySet: Set<string> | null = null
let cachedObjectIdIndex: ObjectIdIndexEntry[] = []

function entityKeysUnchanged(keys: string[]): boolean {
  if (!cachedKeySet || cachedKeySet.size !== keys.length) return false
  for (const k of keys) {
    if (!cachedKeySet.has(k)) return false
  }
  return true
}

function getObjectIdIndex(entities: EntitiesMap): ObjectIdIndexEntry[] {
  const keys = Object.keys(entities)
  if (entityKeysUnchanged(keys) && cachedObjectIdIndex.length) {
    return cachedObjectIdIndex
  }
  cachedKeySet = new Set(keys)
  const list: ObjectIdIndexEntry[] = []
  for (const eid of keys) {
    const obj = eid.split('.')[1]
    if (!obj) continue
    list.push({
      eid,
      objLower: obj.toLowerCase(),
      domain: getEntityDomain(eid),
    })
  }
  cachedObjectIdIndex = list
  return list
}

/**
 * 查找共享相同设备 ID 前缀的兄弟实体（例如 water_dispenser_*）。
 */
export function useApplianceSiblings(entityRef: EntityRefLike) {
  const entitiesStore = useEntitiesStore()

  const deviceId = computed(() => {
    const eid = (entityRef.value as HaEntityState | null | undefined)?.entity_id
    if (!eid) return null
    return eid.split('.')[1] || null
  })

  const siblingEntities = computed(() => {
    if (!deviceId.value) return []
    const did = deviceId.value.toLowerCase()
    const selfId = (entityRef.value as HaEntityState | null | undefined)?.entity_id
    const entities = entitiesStore.entities
    // 触发 shallowReactive 依赖（任意实体变更时 key 访问会通知；索引按数量缓存）
    const index = getObjectIdIndex(entities)
    const list: SiblingEntitySummary[] = []
    for (const entry of index) {
      if (entry.eid === selfId) continue
      if (!entry.objLower.startsWith(did)) continue
      const ent = entities[entry.eid]
      list.push({
        entity_id: entry.eid,
        domain: entry.domain,
        state: ent?.state,
        attributes: ent?.attributes,
      })
    }
    return list
  })

  function findByDomain(domain: string, labelMatchers: string[] = []) {
    for (const sib of siblingEntities.value) {
      if (sib.domain !== domain) continue
      if (!labelMatchers.length) return sib
      const name = getEntityDisplayName(sib.entity_id, sib).toLowerCase()
      if (labelMatchers.some((l) => name.includes(String(l).toLowerCase()))) return sib
    }
    return null
  }

  function findNumber(labelMatchers: string[]) {
    return findByDomain('number', labelMatchers)
  }

  function findSwitch(labelMatchers: string[]): SwitchSiblingResult | null {
    const sib = findByDomain('switch', labelMatchers)
    if (!sib) return null
    return { entity_id: sib.entity_id, isOn: sib.state === 'on' }
  }

  function findSelects(): SelectSiblingResult[] {
    return siblingEntities.value
      .filter((sib) => sib.domain === 'select')
      .map((sib) => ({
        entity_id: sib.entity_id,
        name: getEntityDisplayName(sib.entity_id, sib),
        current: sib.state,
        options: Array.isArray(sib.attributes?.options)
          ? sib.attributes.options.filter((o): o is string => typeof o === 'string')
          : [],
      }))
  }

  return {
    deviceId,
    siblingEntities,
    findByDomain,
    findNumber,
    findSwitch,
    findSelects,
  }
}
