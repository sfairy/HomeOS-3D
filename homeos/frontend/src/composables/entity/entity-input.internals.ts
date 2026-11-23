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

type EntityInputEntry = { key: string; e: HaEntityState | undefined }

type BuildEntityInputGroupsOptions = {
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
    const deviceClass = typeof rawDeviceClass === 'string' ? rawDeviceClass.toLowerCase() : undefined
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

/** 从 placeholder 文案推断建议 device_class（无显式 suggest 时）。
 *
 * 实现已收敛到 `@/shared/entity/utils/suggest-device-class.util`：此前这里与
 * `useEntityMultiSelect` 各写了一份判据，两处不一致时同一个 placeholder 会给出不同的建议。
 */
export { inferSuggestDeviceClassFromPlaceholder } from '@/shared/entity/utils/suggest-device-class.util'
