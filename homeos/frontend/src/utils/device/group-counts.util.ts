/**
 * 设备分组：实体列表与计数同步解析
 *
 * 职责：
 * - 同步计算 DeviceGroupModal 各分组（offline / battery / 各 domain）的实体 ID 列表，
 *   与图表筛选、角标计数共用同一份数据来源。
 * - 优先级链：自定义收藏 favoriteEntities → 统计 sensor 属性 → 楼层 widget → 域索引兜底。
 * - 从统计 sensor 属性解析实体列表（兼容 all_entities / entities / {domain}s_list /
 *   monitored_entities 多种字段命名与友好名→entity_id 映射）。
 *
 * 依赖：
 * - @/utils/device/group-offline.util 提供 offline 分组的 critical 集合与其他离线实体。
 * - @/utils/device/group-battery.util 提供 battery 分组查询与 DeviceGroup*StoreLike 共享类型。
 * - @/composables/entity/useEntityDisplayEpoch 触摸派生 epoch，确保读取最新派生索引。
 * - @/utils/entity/derived.util 的 domainIndexToArray。
 *
 * 注意：domain key（offline / battery / climate / light ...）为分组标识符，不翻译。
 */
import { computeOfflineCriticalSet, listOfflineOtherEntityIds } from '@/utils/device/group-offline.util'
import {
  BATTERY_LOW_THRESHOLD,
  countBatteryLow,
  listBatteryEntityIds,
  resolveBatteryLevel,
} from '@/utils/device/group-battery.util'
import { touchEntityStoreDisplayDeps } from '@/composables/entity/useEntityDisplayEpoch'
import { domainIndexToArray } from '@/utils/entity/derived.util'
import type { HaEntityState } from '@/types/entity-store'
import type {
  DeviceGroupEntitiesStoreLike,
  DeviceGroupUiStoreLike,
} from '@/utils/device/group-battery.util'

type EntityStoreSlice = DeviceGroupEntitiesStoreLike & {
  friendlyNamesMap?: Record<string, string> | Record<string, { entity_id?: string } | undefined>
  getDomainEpoch?: (domain: string) => unknown
  derivedEpoch?: unknown
}

type UiStoreSlice = DeviceGroupUiStoreLike

type FloorSlice = {
  id?: string
  widgets?: Array<{ id?: string }>
}

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
  floors: FloorSlice[] | { value?: FloorSlice[] } | null | undefined,
  statsSensors?: Record<string, string | undefined> | null,
) {
  const statsId = statsSensors || uiStore.layoutConfig.statsSensors
  if (domain === 'offline') {
    const criticalSet = computeOfflineCriticalSet(uiStore, floors, entitiesStore)
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
  const floorList = Array.isArray(floors) ? floors : (floors?.value ?? [])
  const floor = floorList.find((f: FloorSlice) => f.id === uiStore.layoutConfig.activeFloorId)
  if (floor) {
    return (
      floor.widgets
        ?.filter((w) => w.id && w.id.startsWith(`${domain}.`))
        .map((w) => w.id as string) ?? []
    )
  }
  return domainIndexToArray(
    (entitiesStore as { domainEntityIndex?: Map<string, Set<string>> }).domainEntityIndex?.get(
      domain,
    ),
  )
}

/** 离线设备数：与弹窗「共 N 个设备」一致 */
export function countQuickActionOffline(
  entitiesStore: EntityStoreSlice,
  uiStore: UiStoreSlice,
  floors: FloorSlice[] | { value?: FloorSlice[] } | null | undefined,
  statsSensors?: Record<string, string | undefined> | null,
) {
  touchEntityStoreDisplayDeps(entitiesStore)
  return resolveDeviceGroupEntityIds('offline', entitiesStore, uiStore, floors, statsSensors).length
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
  floors: FloorSlice[] | { value?: FloorSlice[] } | null | undefined,
  statsSensors?: Record<string, string | undefined> | null,
) {
  touchEntityStoreDisplayDeps(entitiesStore)
  const ids = resolveDeviceGroupEntityIds('light', entitiesStore, uiStore, floors, statsSensors)
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
  floors: FloorSlice[] | { value?: FloorSlice[] } | null | undefined,
  statsSensors?: Record<string, string | undefined> | null,
) {
  touchEntityStoreDisplayDeps(entitiesStore)
  const ids = resolveDeviceGroupEntityIds('climate', entitiesStore, uiStore, floors, statsSensors)
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
  floors: FloorSlice[] | { value?: FloorSlice[] } | null | undefined,
  statsSensors?: Record<string, string | undefined> | null,
) {
  touchEntityStoreDisplayDeps(entitiesStore)
  const ids = resolveDeviceGroupEntityIds(domain, entitiesStore, uiStore, floors, statsSensors)
  const activeSet = new Set(activeStates)
  let count = 0
  for (const eid of ids) {
    const st = entitiesStore.entities[eid]?.state
    if (st && activeSet.has(st)) count++
  }
  return count
}
