/**
 * @file devices-view-map.internals.ts
 * @module frontend/src/features/device/composables
 */
/** /devices：实体行 → DeviceListItem 映射（纯函数） */

import { getEntityDomain, resolveEntityArea } from '@homeos/shared'
import type { HaEntityState, HaEntityView } from '@/shared/types/entity-store'
import type { DeviceListItem } from '@/shared/types/device'
import { resolveListRowEntity } from '@/composables/entity/projection-row.util'
import { getEntityDisplayName } from '@/shared/entity/utils/derived.util'
import { getDomainLabel } from '@/shared/device/utils/domain-labels.util'

const DEVICES_TOGGLE_DOMAINS = new Set([
  'light',
  'switch',
  'fan',
  'cover',
  'lock',
  'input_boolean',
])

const DEVICES_PREFERRED_DOMAINS = [
  'light',
  'climate',
  'cover',
  'switch',
  'sensor',
  'binary_sensor',
  'media_player',
  'camera',
]

type DevicesDomainTab = {
  id: string
  label: string
  count: number | null
}

/** 构建域 Tab：优先常用域，再按数量补其余域。 */
export function buildDevicesDomainTabs(
  memoryItems: DeviceListItem[],
  useRestList: boolean,
): DevicesDomainTab[] {
  if (useRestList) {
    const tabs: DevicesDomainTab[] = [{ id: 'all', label: '全部', count: null }]
    for (const domain of DEVICES_PREFERRED_DOMAINS) {
      tabs.push({ id: domain, label: getDomainLabel(domain), count: null })
    }
    return tabs
  }
  const counts = new Map<string, number>()
  for (const device of memoryItems) {
    counts.set(device.domain, (counts.get(device.domain) || 0) + 1)
  }
  const tabs: DevicesDomainTab[] = [
    { id: 'all', label: '全部', count: memoryItems.length },
  ]
  for (const domain of DEVICES_PREFERRED_DOMAINS) {
    if (counts.has(domain)) {
      tabs.push({ id: domain, label: getDomainLabel(domain), count: counts.get(domain)! })
    }
  }
  for (const [domain, count] of [...counts.entries()].sort((left, right) => right[1] - left[1])) {
    if (!DEVICES_PREFERRED_DOMAINS.includes(domain)) {
      tabs.push({ id: domain, label: getDomainLabel(domain), count })
    }
  }
  return tabs
}

type MapDeviceEntityRowOptions = {
  preferProjection?: boolean
  rawEntities: Record<string, HaEntityState>
  isEntityAllowed: (entityId: string) => boolean
}

/** 将 HA 实体视图映射为设备列表行；缺 id / 投影失败返回 null。 */
export function mapDeviceEntityRow(
  entity: HaEntityView & { entity_id: string },
  options: MapDeviceEntityRowOptions,
): DeviceListItem | null {
  const key = entity.entity_id || ''
  if (!key) return null
  const preferProjection = options.preferProjection ?? true
  const src = preferProjection ? resolveListRowEntity(key, entity) : entity
  if (!src) return null
  const rawAttrs = options.rawEntities[key]?.attributes
  const mergedAttrs = { ...rawAttrs, ...src.attributes }
  const domain = getEntityDomain(key)
  const batteryLevel = mergedAttrs?.battery_level ?? src.attributes?.battery_level
  return {
    entity_id: key,
    domain,
    name: getEntityDisplayName(key, src),
    state: src.state || '',
    area: resolveEntityArea(mergedAttrs),
    unavailable: src.state === 'unavailable' || src.state === 'unknown',
    toggleable: DEVICES_TOGGLE_DOMAINS.has(domain) && options.isEntityAllowed(key),
    controllable: options.isEntityAllowed(key),
    batteryLevel: typeof batteryLevel === 'number' ? batteryLevel : null,
    lastChanged: src.last_changed,
  }
}
