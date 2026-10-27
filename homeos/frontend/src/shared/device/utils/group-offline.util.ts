/** 设备分组：离线实体集合计算 */
import { getEntityDomain } from '@homeos/shared'
import { DOMAIN_LIST, MONITORED_ENTITY_IDS } from '@/shared/constants/device-group'
import type {
  DeviceGroupEntitiesStoreLike,
  DeviceGroupUiStoreLike,
} from '@/shared/device/utils/group-battery.util'

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
/**
 * 离线设备候选集合（不含 critical 集合内的实体）。
 *
 * 索引只提供**候选 ID**，是否离线一律读 entities 的实时状态：
 * `offlineDevices` 是派生二级索引，而仪表盘路由下 sensor / binary_sensor /
 * device_tracker / event / image / update 的派生 patch 会被跳过
 * （见 derived-route.util 的 DASHBOARD_SKIP_DERIVED_DOMAINS），索引里的离线集合会停在
 * 最后一次全量重建的时刻。若直接按索引判定，这些域的设备上下线后
 * 离线角标与弹窗列表就再也不刷新（传感器域往往是离线设备的大头）。
 * 读实时状态同时也建立了逐实体的响应式依赖，WS 推送落地即可重算。
 *
 * @param entitiesStore 实体 store（entities / offlineDevices / domainEntityIndex）
 * @param criticalSet 首页收藏与浮动组件构成的严重告警集合
 * @returns 离线实体 ID 列表（稳定顺序：先派生索引，再域索引补齐）
 */
export function listOfflineOtherEntityIds(
  entitiesStore: DeviceGroupEntitiesStoreLike,
  criticalSet: Set<string>,
) {
  const ids: string[] = []
  const seen = new Set<string>()
  const consider = (rawEid: string | null | undefined) => {
    const eid = rawEid ?? ''
    if (!eid || seen.has(eid)) return
    seen.add(eid)
    if (!DOMAIN_LIST.includes(getEntityDomain(eid))) return
    if (criticalSet.has(eid) || isMonitoredExcludedEntity(eid)) return
    if (entitiesStore.entities[eid]?.state !== 'unavailable') return
    ids.push(eid)
  }
  // 派生索引：最近一次全量重建时已离线的设备
  for (const e of entitiesStore.offlineDevices || []) consider(e.entity_id)
  // 域索引：补齐派生 patch 被跳过、派生索引里没有的离线实体（遍历 Set 不额外分配）
  for (const domain of DOMAIN_LIST) {
    const bucket = entitiesStore.domainEntityIndex?.get(domain) as
      | Set<string>
      | string[]
      | undefined
    if (!bucket) continue
    for (const eid of bucket) consider(eid)
  }
  return ids
}
