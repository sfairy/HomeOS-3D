/**
 * 联动器/场景 Builder 实体状态选项工具
 *
 * 所属模块：utils/entity
 * 职责：为联动器与场景 Builder 的条件/动作节点提供实体的可选状态枚举、
 *      本地化标签、单位提取与全量域列表查询能力，统一各 Builder 视图的实体状态下拉渲染。
 * 导出：
 *   - DOMAIN_STATES：按 domain 预置的典型状态枚举（lock/cover/alarm/media_player/climate 等）
 *   - possibleStatesForEntity(eid)：查询实体的可选状态，未知域兜底 on/off
 *   - stateLabelForEntity(state)：状态值本地化标签映射
 *   - unitForEntity(store, eid)：读取实体的 unit_of_measurement 属性
 *   - allEntityDomains(store)：枚举当前实体集合中出现的全部 domain（已排序）
 */
import { getEntityDomain } from '@homeos/shared'
/** 联动器 / 场景 Builder 共用的实体状态选项 */

import { entityStateLabel } from '@/constants/entity-state-labels'
import type { EntitiesMap, HaEntityState } from '@/types/entity-store'

const DOMAIN_STATES: Record<string, string[]> = {
  lock: ['locked', 'unlocked'],
  cover: ['open', 'closed', 'opening', 'closing'],
  alarm_control_panel: ['disarmed', 'armed_home', 'armed_away', 'armed_night', 'triggered'],
  media_player: ['playing', 'paused', 'idle', 'off'],
  climate: ['heat', 'cool', 'off', 'auto', 'dry', 'fan_only'],
  vacuum: ['cleaning', 'docked', 'returning', 'idle', 'paused'],
  person: ['home', 'not_home'],
  fan: ['on', 'off'],
  humidifier: ['on', 'off'],
  input_boolean: ['on', 'off'],
  switch: ['on', 'off'],
  automation: ['on', 'off'],
}

/** possibleStatesForEntity：函数，按签名入参返回处理结果。 */
export function possibleStatesForEntity(eid: string): string[] {
  if (!eid) return ['on', 'off']
  const dom = getEntityDomain(eid)
  return DOMAIN_STATES[dom] || ['on', 'off']
}

/** stateLabelForEntity：函数，按签名入参返回处理结果。 */
export function stateLabelForEntity(state: string): string {
  return entityStateLabel(state)
}

interface EntityReaderStore {
  getEntity: (id: string) => HaEntityState | undefined
}

/** unitForEntity：函数，按签名入参返回处理结果。 */
export function unitForEntity(entitiesStore: EntityReaderStore, eid: string): string {
  if (!eid) return ''
  return entitiesStore.getEntity(eid)?.attributes?.unit_of_measurement || ''
}

interface EntitiesDomainStore {
  entities: EntitiesMap
  domains?: string[]
}

/** allEntityDomains：函数，按签名入参返回处理结果。 */
export function allEntityDomains(entitiesStore: EntitiesDomainStore): string[] {
  if (entitiesStore.domains?.length) return [...entitiesStore.domains].sort()
  const set = new Set<string>()
  for (const key in entitiesStore.entities) {
    set.add(getEntityDomain(key))
  }
  return [...set].sort()
}
