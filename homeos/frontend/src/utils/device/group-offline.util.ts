/**
 * 设备分组：离线实体集合计算
 *
 * 职责：
 * - 计算 offline 分组的 critical 集合：自定义收藏 offline + 顶层浮动组件中 state=unavailable
 *   的实体，这些实体在弹窗中前置展示并标记为 critical。
 * - 列出其他离线实体：扫描 offlineDevices 派生索引或域索引，按 DOMAIN_LIST 过滤、
 *   排除系统监控实体与 critical 实体。
 * - 提供 critical / others 拆分工具，供离线分组按重要性排序展示。
 *
 * 依赖：
 * - @homeos/shared 的 getEntityDomain。
 * - @/composables/entity/useDeviceGroupMembers 的 DOMAIN_LIST / MONITORED_ENTITY_IDS。
 * - @/utils/device/group-battery.util 的 DeviceGroup*StoreLike 共享类型。
 * - @/utils/entity/derived.util 的 domainIndexToArray。
 *
 * 注意：domain key 与 entity_id 为 HA 标识符，不翻译；
 *   HA state（unavailable）为 HA 状态值，不翻译。
 */
import { getEntityDomain } from '@homeos/shared'
import { DOMAIN_LIST, MONITORED_ENTITY_IDS } from '@/composables/entity/useDeviceGroupMembers'
import type {
  DeviceGroupEntitiesStoreLike,
  DeviceGroupUiStoreLike,
} from '@/utils/device/group-battery.util'
import { domainIndexToArray } from '@/utils/entity/derived.util'

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
