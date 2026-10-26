/**
 * @file group-battery.util.ts
 * @module frontend/src/shared/device/utils
 *
 * 设备分组弹窗的电池分区：识别电池实体、解析电量、统计低电量数量。
 * 全部为纯函数（入参是结构化 store 形状，不 import store），因此可被
 * `components/` `composables/` `features/` 任意层安全复用。
 */
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

/**
 * 是否属于「系统自身」的电池实体（路由器、网关、HomeOS 主机等）。
 *
 * 这些实体的电量不代表用户关心的设备，混进电池分区会把列表刷成噪声，
 * 且它们的低电量告警没有处置手段。判定用前缀/子串包含，与弹窗 entityIds 扫描规则一致。
 */
function isMonitoredSystemEntity(entityId: string | null | undefined) {
  const lowerId = String(entityId || '').toLowerCase()
  return MONITORED_ENTITY_IDS.some((monitoredFragment) => lowerId.includes(monitoredFragment))
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
  const looksLikeBattery =
    entity.attributes?.device_class === 'battery' || entity.entity_id.includes('battery')
  if (!looksLikeBattery || isMonitoredSystemEntity(entity.entity_id)) return false
  const parsedState = parseFloat(String(entity.state ?? ''))
  return !isNaN(parsedState)
}

/** 解析实体当前电量（sensor 状态 / 属性 / 派生索引） */
export function resolveBatteryLevel(
  entityId: string,
  entity: HaEntityState | null | undefined,
  entitiesStore: DeviceGroupEntitiesStoreLike,
) {
  if (entity) {
    if (isBatterySensorEntity(entity)) return parseFloat(String(entity.state ?? ''))
    const rawLevel = entity.attributes?.battery_level ?? entity.attributes?.battery
    if (rawLevel !== undefined && rawLevel !== null) {
      const batteryLevel =
        typeof rawLevel === 'number' ? rawLevel : parseInt(String(rawLevel), 10)
      if (!isNaN(batteryLevel)) return batteryLevel
    }
  }
  const derived = (entitiesStore.batteryDevices || []).find(
    (deviceEntry) => deviceEntry.entity_id === entityId,
  )
  return derived ? derived.level : NaN
}

/** 从域索引扫出电池传感器 ID（只扫 sensor / binary_sensor 两个域）。 */
function collectBatterySensorIdsFromIndex(entitiesStore: DeviceGroupEntitiesStoreLike) {
  const entityIds: string[] = []
  for (const domain of ['sensor', 'binary_sensor']) {
    for (const entityId of domainIndexToArray(entitiesStore.domainEntityIndex?.get(domain))) {
      const entity = entitiesStore.entities[entityId]
      if (isBatterySensorEntity(entity)) entityIds.push(entityId)
    }
  }
  return entityIds
}

/** 弹窗展示用的电池实体 ID 列表（优先域索引，回退全表扫描） */
export function listBatteryEntityIds(
  entitiesStore: DeviceGroupEntitiesStoreLike,
  uiStore: DeviceGroupUiStoreLike,
) {
  const favoriteIds = uiStore.layoutConfig.favoriteEntities?.battery || []
  const entityIds = new Set(favoriteIds)
  for (const entityId of collectBatterySensorIdsFromIndex(entitiesStore)) {
    entityIds.add(entityId)
  }
  for (const deviceEntry of entitiesStore.batteryDevices || []) {
    entityIds.add(deviceEntry.entity_id)
  }
  // 索引与实际不一致时（收藏项比索引多、或实体还没进派生索引）回退全表扫描。
  // 2000 条上限是为了避免大户型首次渲染时全表扫成卡顿。
  if (entityIds.size <= favoriteIds.length && (entitiesStore.totalCount ?? 0) < 2000) {
    for (const entity of Object.values(entitiesStore.entities) as { entity_id?: string }[]) {
      if (isBatterySensorEntity(entity) && entity.entity_id) entityIds.add(entity.entity_id)
    }
  }
  return [...entityIds]
}

/** 低电量计数（使用 batteryDevices 派生索引，避免全表扫描） */
export function countBatteryLow(
  entitiesStore: DeviceGroupEntitiesStoreLike,
  uiStore: DeviceGroupUiStoreLike,
  threshold: number = BATTERY_LOW_THRESHOLD,
) {
  const favoriteIds = uiStore.layoutConfig.favoriteEntities?.battery || []
  const lowIds = new Set(
    (entitiesStore.batteryDevices || [])
      .filter((deviceEntry: BatteryDeviceEntry) => deviceEntry.level <= threshold)
      .map((deviceEntry) => deviceEntry.entity_id),
  )
  // 收藏项可能不在派生索引里（刚添加、尚未刷新），按原始 state 补一遍。
  for (const entityId of favoriteIds) {
    const entity = entitiesStore.entities[entityId]
    if (entity && !isNaN(Number(entity.state)) && Number(entity.state) <= threshold) {
      lowIds.add(entityId)
    }
  }
  return lowIds.size
}
