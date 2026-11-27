/** 设备分组：实体列表与计数同步解析 */
import {
  computeOfflineCriticalSet,
  groupOfflineByDevice,
  listOfflineOtherEntityIds,
} from '@/domain/entity/model/utils/group-offline.util'
import {
  BATTERY_LOW_THRESHOLD,
  countBatteryLow,
  listBatteryEntityIds,
  resolveBatteryLevel,
} from '@/domain/entity/model/utils/group-battery.util'
import { touchEntityStoreDisplayDeps } from '@/domain/entity/composables/use-entity-display-epoch'
import { domainIndexToArray } from '@/domain/entity/model/utils/derived.util'
import type { HaEntityState } from '@/kernel/types/entity'
import type { DeviceGroupEntitiesStoreLike, DeviceGroupUiStoreLike } from '@/domain/entity/model/utils/group-battery.util'

type EntityStoreSlice = DeviceGroupEntitiesStoreLike & {
  friendlyNamesMap?: Record<string, string> | Record<string, { entity_id?: string } | undefined>
  getDomainEpoch?: (domain: string) => unknown
  derivedEpoch?: unknown
}

type UiStoreSlice = DeviceGroupUiStoreLike

type StatsSensorEntity = HaEntityState & {
  attributes?: Record<string, unknown>
}

/** 从统计 sensor 属性解析实体列表（与 DeviceGroupModal 一致） */
function entityIdsFromStatsSensor(
  ent: StatsSensorEntity | null | undefined,
  domain: string,
  entitiesStore: EntityStoreSlice,
) {
  const attrs = ent?.attributes
  const list =
    attrs?.all_entities ??
    attrs?.entities ??
    attrs?.[`${domain}s_list`] ??
    attrs?.[`${domain}_list`] ??
    attrs?.monitored_entities
  if (!list) return null
  let arr = Array.isArray(list)
    ? (list as string[])
    : typeof list === 'string'
      ? list.split(',').map((s) => s.trim().replace(/^\[|\]$/g, ''))
      : []
  if (arr.length > 0 && !arr[0].includes('.')) {
    arr = arr
      .map((name) => {
        const entry = entitiesStore.friendlyNamesMap?.[name]
        if (typeof entry === 'string') return entry
        return entry && typeof entry === 'object' ? entry.entity_id : undefined
      })
      .filter(Boolean) as string[]
  }
  return arr
}

/**
 * 同步计算 DeviceGroupModal 实体列表（不含自定义 deviceGroup API）
 */
export function resolveDeviceGroupEntityIds(
  domain: string,
  entitiesStore: EntityStoreSlice,
  uiStore: UiStoreSlice,
  statsSensors?: Record<string, string | undefined> | null,
) {
  const statsId = statsSensors || uiStore.layoutConfig.statsSensors
  if (domain === 'offline') {
    const criticalSet = computeOfflineCriticalSet(uiStore, entitiesStore)
    const others = listOfflineOtherEntityIds(entitiesStore, criticalSet)
    return [...criticalSet, ...others]
  }
  if (domain === 'battery') {
    return listBatteryEntityIds(entitiesStore, uiStore)
  }
  const favIds = uiStore.layoutConfig.favoriteEntities?.[domain] || []
  if (favIds.length > 0) return [...favIds]
  const selectorKey = domain === 'climate' ? 'climates' : domain === 'light' ? 'lights' : domain
  const rawSensorId = statsId?.[selectorKey] || statsId?.[domain]
  const sensorId = typeof rawSensorId === 'string' ? rawSensorId : ''
  const sensorEnt = sensorId ? entitiesStore.entities[sensorId] : null
  if (sensorEnt) {
    const fromSensor = entityIdsFromStatsSensor(sensorEnt, domain, entitiesStore)
    if (fromSensor) return fromSensor
  }
  return domainIndexToArray(
    (entitiesStore as { domainEntityIndex?: Map<string, Set<string>> }).domainEntityIndex?.get(domain),
  )
}

/** 离线设备数：与弹窗「共 N 个设备」一致 */
export function countQuickActionOffline(
  entitiesStore: EntityStoreSlice,
  uiStore: UiStoreSlice,
  statsSensors?: Record<string, string | undefined> | null,
) {
  touchEntityStoreDisplayDeps(entitiesStore)
  const ids = resolveDeviceGroupEntityIds('offline', entitiesStore, uiStore, statsSensors)
  // 按**设备**计数而不是实体：一台掉线的多传感器设备会贡献 5~10 条实体，
  // 按实体数会让角标写成「131」而实际只有十几台设备连不上。
  return groupOfflineByDevice(ids, entitiesStore.entities).length
}

/**
 * 离线设备（按设备聚合）：传给弹窗展示，与 `countQuickActionOffline` 同源。
 *
 * 弹窗此前按实体逐个列卡片，同一台设备会重复出现；这里返回「一台设备一条」，
 * `entityIds` 仍保留明细，供展开查看。
 */
export function listOfflineDevices(
  entitiesStore: EntityStoreSlice,
  uiStore: UiStoreSlice,
  statsSensors?: Record<string, string | undefined> | null,
) {
  touchEntityStoreDisplayDeps(entitiesStore)
  const ids = resolveDeviceGroupEntityIds('offline', entitiesStore, uiStore, statsSensors)
  return groupOfflineByDevice(ids, entitiesStore.entities)
}

/** 低电量数：与弹窗「低电量告警」分区一致 */
export function countQuickActionBatteryLow(entitiesStore: EntityStoreSlice, uiStore: UiStoreSlice) {
  touchEntityStoreDisplayDeps(entitiesStore)
  const ids = listBatteryEntityIds(entitiesStore, uiStore)
  if (ids.length === 0) return countBatteryLow(entitiesStore, uiStore)
  let count = 0
  for (const eid of ids) {
    const entity = entitiesStore.entities[eid as string]
    const level = resolveBatteryLevel(eid as string, entity, entitiesStore)
    if (entity && !isNaN(level) && level <= BATTERY_LOW_THRESHOLD) count++
  }
  return count
}

/** 灯光开启数：基于与弹窗相同的实体范围实时统计 */
export function countQuickActionLightsOn(
  entitiesStore: EntityStoreSlice,
  uiStore: UiStoreSlice,
  statsSensors?: Record<string, string | undefined> | null,
) {
  touchEntityStoreDisplayDeps(entitiesStore)
  const ids = resolveDeviceGroupEntityIds('light', entitiesStore, uiStore, statsSensors)
  let count = 0
  for (const eid of ids) {
    const st = entitiesStore.entities[eid]?.state
    if (st === 'on') count++
  }
  return count
}

/** 空调运行数 */
export function countQuickActionClimateActive(
  entitiesStore: EntityStoreSlice,
  uiStore: UiStoreSlice,
  statsSensors?: Record<string, string | undefined> | null,
) {
  touchEntityStoreDisplayDeps(entitiesStore)
  const ids = resolveDeviceGroupEntityIds('climate', entitiesStore, uiStore, statsSensors)
  let count = 0
  for (const eid of ids) {
    const st = entitiesStore.entities[eid]?.state
    if (st && st !== 'off' && st !== 'idle') count++
  }
  return count
}

/** 通用域活跃数：基于与弹窗相同的实体范围，按 activeStates 统计（扩展快捷按钮用） */
export function countQuickActionDomainActive(
  domain: string,
  activeStates: string[],
  entitiesStore: EntityStoreSlice,
  uiStore: UiStoreSlice,
  statsSensors?: Record<string, string | undefined> | null,
) {
  touchEntityStoreDisplayDeps(entitiesStore)
  const ids = resolveDeviceGroupEntityIds(domain, entitiesStore, uiStore, statsSensors)
  const activeSet = new Set(activeStates)
  let count = 0
  for (const eid of ids) {
    const st = entitiesStore.entities[eid]?.state
    if (st && activeSet.has(st)) count++
  }
  return count
}
