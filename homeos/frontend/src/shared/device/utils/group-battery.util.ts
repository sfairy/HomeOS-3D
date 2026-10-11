/** 设备分组：电池实体识别与电量解析工具 */
import { MONITORED_ENTITY_IDS } from '@/shared/constants/device-group'
import { domainIndexToArray } from '@/shared/entity/utils/derived.util'
import type { HaEntityState } from '@/shared/types/entity-store'

export type DeviceGroupEntitiesStoreLike = {
  entities: Record<string, HaEntityState | undefined>
  batteryDevices?: Array<{ entity_id: string; level: number }>
  offlineDevices?: Array<{ entity_id?: string }>
  domainEntityIndex?: Map<string, Set<string>>
  totalCount?: number
  callService?: (
    domain: string,
    service: string,
    entityId: string,
    data?: Record<string, unknown> | null,
    returnResponse?: boolean,
    options?: { quiet?: boolean },
  ) => Promise<unknown>
}

export type DeviceGroupUiStoreLike = {
  layoutConfig: {
    favoriteEntities?: Record<string, string[] | undefined>
    statsSensors?: Record<string, unknown>
    floatingWidgets?: Array<{ config?: Record<string, unknown> | null }>
  }
}

interface BatteryDeviceEntry {
  entity_id: string
  level: number
}

/** 与 DeviceGroupModal 低电量告警分区一致 */
export const BATTERY_LOW_THRESHOLD = 30
function isMonitoredSystemEntity(entityId: string | null | undefined) {
  const lower = String(entityId || '').toLowerCase()
  return MONITORED_ENTITY_IDS.some((x) => lower.includes(x))
}
/** 电池百分比传感器（与弹窗 entityIds 扫描规则一致） */
export function isBatterySensorEntity(
  entity:
    | HaEntityState
    | { entity_id?: string; state?: string; attributes?: Record<string, unknown> }
    | null
    | undefined,
) {
  if (!entity?.entity_id) return false
  const isBattery =
    entity.attributes?.device_class === 'battery' || entity.entity_id.includes('battery')
  if (!isBattery || isMonitoredSystemEntity(entity.entity_id)) return false
  const v = parseFloat(String(entity.state ?? ''))
  return !isNaN(v)
}
/** 解析实体当前电量（sensor 状态 / 属性 / 派生索引） */
export function resolveBatteryLevel(
  entityId: string,
  entity: HaEntityState | null | undefined,
  entitiesStore: DeviceGroupEntitiesStoreLike,
) {
  if (entity) {
    if (isBatterySensorEntity(entity)) return parseFloat(String(entity.state ?? ''))
    const attr = entity.attributes?.battery_level ?? entity.attributes?.battery
    if (attr !== undefined && attr !== null) {
      const lvl = typeof attr === 'number' ? attr : parseInt(String(attr), 10)
      if (!isNaN(lvl)) return lvl
    }
  }
  const derived = (entitiesStore.batteryDevices || []).find((d) => d.entity_id === entityId)
  return derived ? derived.level : NaN
}
function collectBatterySensorIdsFromIndex(entitiesStore: DeviceGroupEntitiesStoreLike) {
  const ids: string[] = []
  for (const domain of ['sensor', 'binary_sensor']) {
    for (const eid of domainIndexToArray(entitiesStore.domainEntityIndex?.get(domain))) {
      const e = entitiesStore.entities[eid]
      if (isBatterySensorEntity(e)) ids.push(eid)
    }
  }
  return ids
}
/** 弹窗展示用的电池实体 ID 列表（优先域索引，回退全表扫描） */
export function listBatteryEntityIds(
  entitiesStore: DeviceGroupEntitiesStoreLike,
  uiStore: DeviceGroupUiStoreLike,
) {
  const favIds = uiStore.layoutConfig.favoriteEntities?.battery || []
  const ids = new Set(favIds)
  for (const eid of collectBatterySensorIdsFromIndex(entitiesStore)) {
    ids.add(eid)
  }
  for (const d of entitiesStore.batteryDevices || []) {
    ids.add(d.entity_id)
  }
  if (ids.size <= favIds.length && (entitiesStore.totalCount ?? 0) < 2000) {
    for (const e of Object.values(entitiesStore.entities) as { entity_id?: string }[]) {
      if (isBatterySensorEntity(e) && e.entity_id) ids.add(e.entity_id)
    }
  }
  return [...ids]
}
/** 低电量计数（使用 batteryDevices 派生索引，避免全表扫描） */
export function countBatteryLow(
  entitiesStore: DeviceGroupEntitiesStoreLike,
  uiStore: DeviceGroupUiStoreLike,
  threshold: number = BATTERY_LOW_THRESHOLD,
) {
  const favIds = uiStore.layoutConfig.favoriteEntities?.battery || []
  const lowIds = new Set(
    (entitiesStore.batteryDevices || [])
      .filter((d: BatteryDeviceEntry) => d.level <= threshold)
      .map((d) => d.entity_id),
  )
  for (const eid of favIds) {
    const e = entitiesStore.entities[eid]
    if (e && !isNaN(Number(e.state)) && Number(e.state) <= threshold) {
      lowIds.add(eid)
    }
  }
  return lowIds.size
}
