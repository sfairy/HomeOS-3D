/**
 * @file entity-input.internals.ts
 * @module frontend/src/composables/entity
 */
/** EntityInput：分组构建 / placeholder 推断 device_class（纯函数） */

import { getEntityDomain } from '@homeos/shared'
import { getEntityDisplayName } from '@/shared/entity/utils/derived.util'
import type { HaEntityState } from '@/shared/types/entity-store'

export interface EntityInputItem {
  entity_id: string
  name: string
  domain: string
  isSuggested?: boolean
}

export interface EntityInputGroup {
  domain: string
  items: EntityInputItem[]
}

export type EntityInputEntry = { key: string; e: HaEntityState | undefined }

export type BuildEntityInputGroupsOptions = {
  entries: EntityInputEntry[]
  query: string
  activeSuggest: string
  selectedDomain: string
  filterDomainSet: Set<string> | null
}

/** 将实体条目按域分组、过滤、建议置顶与排序。 */
export function buildEntityInputGroups(options: BuildEntityInputGroupsOptions): EntityInputGroup[] {
  const q = options.query
  const filterSet = options.filterDomainSet
  const groups = new Map<string, EntityInputItem[]>()

  for (const { key, e: entity } of options.entries) {
    if (!entity) continue
    const domain = getEntityDomain(key)
    if (filterSet && !filterSet.has(domain)) continue
    if (options.selectedDomain && domain !== options.selectedDomain) continue
    const name = getEntityDisplayName(key, entity).toLowerCase()
    const entityId = key.toLowerCase()
    const rawDeviceClass = entity.attributes?.device_class
    const deviceClass =
      typeof rawDeviceClass === 'string' ? rawDeviceClass.toLowerCase() : undefined
    const isSuggested = !!(options.activeSuggest && deviceClass === options.activeSuggest)
    if (!q || entityId.includes(q) || name.includes(q)) {
      if (!groups.has(domain)) groups.set(domain, [])
      groups.get(domain)!.push({
        entity_id: key,
        name: getEntityDisplayName(key, entity),
        domain,
        isSuggested,
      })
    }
  }

  const result: EntityInputGroup[] = []
  for (const [domain, items] of groups) {
    items.sort((left, right) => {
      if (left.isSuggested && !right.isSuggested) return -1
      if (!left.isSuggested && right.isSuggested) return 1
      return left.name.localeCompare(right.name)
    })
    result.push({ domain, items })
  }
  result.sort((left, right) => left.domain.localeCompare(right.domain))
  return result
}

/** 从 placeholder 文案推断建议 device_class（无显式 suggest 时）。 */
export function inferSuggestDeviceClassFromPlaceholder(placeholder: string): string {
  const hint = (placeholder || '').toLowerCase()

  if (hint.includes('temperature') || hint.includes('_temp') || hint.includes('温度'))
    return 'temperature'
  if (hint.includes('humidity') || hint.includes('湿度')) return 'humidity'
  if (hint.includes('pm25') || hint.includes('pm2.5') || hint.includes('空气质量')) return 'pm25'
  if (hint.includes('co2') || hint.includes('carbon_dioxide') || hint.includes('二氧化碳'))
    return 'carbon_dioxide'
  if (hint.includes('battery') || hint.includes('电池')) return 'battery'
  if (
    hint.includes('power') ||
    hint.includes('energy') ||
    hint.includes('功率') ||
    hint.includes('能耗')
  )
    return 'power'
  if (hint.includes('voltage') || hint.includes('电压')) return 'voltage'
  if (hint.includes('current') || hint.includes('电流')) return 'current'
  if (
    hint.includes('presence') ||
    hint.includes('mmwave') ||
    hint.includes('occupancy') ||
    hint.includes('存在') ||
    hint.includes('人体')
  )
    return 'occupancy'
  if (hint.includes('motion') || hint.includes('运动')) return 'motion'
  if (hint.includes('lock') || hint.includes('door') || hint.includes('门锁')) return 'door'
  if (hint.includes('window') || hint.includes('窗户')) return 'window'
  if (hint.includes('smoke') || hint.includes('烟雾')) return 'smoke'
  if (hint.includes('carbon_monoxide') || hint.includes('co') || hint.includes('一氧化碳'))
    return 'carbon_monoxide'
  if (
    hint.includes('water') ||
    hint.includes('leak') ||
    hint.includes('漏水') ||
    hint.includes('水浸')
  )
    return 'moisture'

  return ''
}
