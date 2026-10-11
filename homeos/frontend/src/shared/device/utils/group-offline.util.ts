/** 设备分组：离线实体集合计算 */
import { getEntityDomain } from '@homeos/shared'
import { DOMAIN_LIST, MONITORED_ENTITY_IDS } from '@/shared/constants/device-group'
import type {
  DeviceGroupEntitiesStoreLike,
  DeviceGroupUiStoreLike,
} from '@/shared/device/utils/group-battery.util'
import { domainIndexToArray } from '@/shared/entity/utils/derived.util'

function isMonitoredExcludedEntity(entityId: string) {
  return MONITORED_ENTITY_IDS.some((x) => entityId.toLowerCase().includes(x))
}
/** 离线设备：收藏 + 顶层浮动组件中不可用实体构成的 critical 集合 */
export function computeOfflineCriticalSet(
  uiStore: DeviceGroupUiStoreLike,
  entitiesStore: DeviceGroupEntitiesStoreLike,
) {
  const favIds = uiStore.layoutConfig.favoriteEntities?.offline || []
  const floatingCritical: string[] = []
  for (const widget of uiStore.layoutConfig.floatingWidgets || []) {
    const raw = widget?.config?.entityId ?? widget?.config?.entity_id
    const eid = raw == null ? '' : String(raw)
    if (eid.includes('.') && entitiesStore.entities[eid]?.state === 'unavailable') {
      floatingCritical.push(eid)
    }
  }
  return new Set([...favIds, ...floatingCritical])
}
export function splitOfflineEntityIds(criticalSet: Set<string>, entityIds: string[]) {
  const critical = [...criticalSet]
  const others = entityIds.filter((eid) => !criticalSet.has(eid))
  return { critical, others }
}
export function listOfflineOtherEntityIds(
  entitiesStore: DeviceGroupEntitiesStoreLike,
  criticalSet: Set<string>,
) {
  const ids: string[] = []
  const seen = new Set<string>()
  const push = (eid: string) => {
    if (!seen.has(eid)) {
      seen.add(eid)
      ids.push(eid)
    }
  }
  for (const e of entitiesStore.offlineDevices || []) {
    const eid = e.entity_id
    if (!eid) continue
    const d = getEntityDomain(eid)
    if (DOMAIN_LIST.includes(d) && !isMonitoredExcludedEntity(eid) && !criticalSet.has(eid)) {
      push(eid)
    }
  }
  if (ids.length || !entitiesStore.domainEntityIndex?.size) return ids
  for (const domain of DOMAIN_LIST) {
    for (const eid of domainIndexToArray(entitiesStore.domainEntityIndex.get(domain))) {
      const ent = entitiesStore.entities[eid]
      if (
        ent?.state === 'unavailable' &&
        !isMonitoredExcludedEntity(eid) &&
        !criticalSet.has(eid)
      ) {
        push(eid)
      }
    }
  }
  return ids
}
