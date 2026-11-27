import { MONITORED_ENTITY_IDS, DOMAIN_LIST } from '@/kernel/index'
import { domainIndexToArray } from '@/domain/entity/derived'
import type { HaEntityState } from '@/kernel/entity'
import { touchEntityStoreDisplayDeps } from '@/domain/entity/entity'
import { getEntityDomain, isControllableEntityId } from '@homeos/shared'

/* ── 原 group-battery.util.ts 的实现 ── */

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
  const looksLikeBattery = entity.attributes?.device_class === 'battery' || entity.entity_id.includes('battery')
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
      const batteryLevel = typeof rawLevel === 'number' ? rawLevel : parseInt(String(rawLevel), 10)
      if (!isNaN(batteryLevel)) return batteryLevel
    }
  }
  const derived = (entitiesStore.batteryDevices || []).find((deviceEntry) => deviceEntry.entity_id === entityId)
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
export function listBatteryEntityIds(entitiesStore: DeviceGroupEntitiesStoreLike, uiStore: DeviceGroupUiStoreLike) {
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

/** 设备分组：实体列表与计数同步解析 */

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

/** 设备分组：离线实体集合计算 */

/** 域白名单预编译成 Set：`DOMAIN_LIST.includes()` 每次都是线性查找。 */
const DOMAIN_SET = new Set(DOMAIN_LIST)
/**
 * 「监控类噪声实体」的片段表预编译成正则。
 *
 * 原实现是 `MONITORED_ENTITY_IDS.some((x) => entityId.toLowerCase().includes(x))`：
 * 每个候选实体都要**新分配一个小写字符串** + 9 次 `includes`。这个函数在离线角标
 * 计算里对全屋每个实体各跑一次，而角标是常驻首页的 computed。
 */
const MONITORED_ENTITY_PATTERN = new RegExp(MONITORED_ENTITY_IDS.join('|'))

function isMonitoredExcludedEntity(entityId: string) {
  return MONITORED_ENTITY_PATTERN.test(entityId.toLowerCase())
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

/** 一台「设备」的离线聚合结果。 */
export interface OfflineDeviceGroup {
  /** 设备标识：优先 `attributes.device_id`；没有注册表归属时退化为实体 ID。 */
  deviceKey: string
  /** 代表实体：打开详情 / 控制弹窗用它。选择规则见 `pickRepresentative`。 */
  entityId: string
  /** 该设备下**所有**离线实体（含代表）。 */
  entityIds: string[]
}

/**
 * 代表实体：优先可控域（用户点开能操作），否则取字典序最小者。
 *
 * 为什么需要它：一台设备常挂多个实体（开关 + 电量 + 信号强度），全都 unavailable 时
 * 若按实体逐个展示，用户会看到同一台设备出现三次；点进去还得自己猜哪个是开关。
 * 取可控实体当代表，点开就是能操作的那个面板。
 *
 * 字典序兜底是为了**输出稳定** —— 同一批离线设备每次渲染顺序一致，不随对象键序抖动。
 */
function pickRepresentative(entityIds: string[]): string {
  const controllable = entityIds.find((eid) => isControllableEntityId(eid))
  if (controllable) return controllable
  return [...entityIds].sort()[0] ?? ''
}

/**
 * 把离线实体按**设备**聚合（同一台设备只计一次）。
 *
 * 为什么必须按设备：`listOfflineOtherEntityIds` 返回的是离线**实体**。一台掉线的
 * 多传感器设备会贡献 5~10 条实体，于是首页角标写着「离线 131」，实际可能只有十几台
 * 设备 —— 数字与用户的直觉（「几台设备连不上」）差一个数量级。
 *
 * 归属规则：
 * - 有 `attributes.device_id` 的按它归组（HA 实体注册表给的设备归属）；
 * - 没有的（未进注册表的集成、模板实体、纯 YAML 实体）**各自算一台**，用实体 ID 作 key。
 *   这类实体没有设备可言，把它们并到一起会把不相关的故障混成一条。
 *
 * @param entityIds 离线实体 ID 列表（顺序即展示顺序的优先级）
 * @param entities 实体表（用于读 `attributes.device_id`）
 * @returns 按设备聚合的结果，顺序沿用**代表实体**在入参中的先后
 */
export function groupOfflineByDevice(
  entityIds: string[],
  entities: Record<string, { attributes?: Record<string, unknown> } | undefined>,
): OfflineDeviceGroup[] {
  const groups = new Map<string, string[]>()
  for (const eid of entityIds) {
    const raw = entities[eid]?.attributes?.device_id
    // 非字符串 / 空串：当作「没有设备归属」，退化成独立一台
    const deviceKey = typeof raw === 'string' && raw ? raw : eid
    const bucket = groups.get(deviceKey)
    if (bucket) bucket.push(eid)
    else groups.set(deviceKey, [eid])
  }

  const result: OfflineDeviceGroup[] = []
  for (const [deviceKey, ids] of groups) {
    const entityId = pickRepresentative(ids)
    if (!entityId) continue
    result.push({ deviceKey, entityId, entityIds: ids })
  }
  // 代表实体在入参里的位置决定组顺序：入参本身已有优先级（critical 在前）
  const order = new Map(entityIds.map((eid, index) => [eid, index]))
  return result.sort((a, b) => (order.get(a.entityId) ?? 0) - (order.get(b.entityId) ?? 0))
}

/**
 * 离线**设备**数（全站唯一口径）。
 *
 * 所有「离线 N」都要经过这里，而不是各页面自己 `filter(state === 'unavailable').length` ——
 * 后者的量纲是**实体**：一台掉线的多传感器设备会贡献 5~10 条，于是同一个故障在首页写 131、
 * 在设备页写 131、在诊断页写 131，而用户心里想的是「十几台设备连不上」。
 *
 * @param entityIds 候选离线实体 ID（调用方可以传全量、也可以只传一个域/区域的范围）
 * @param entities 实体表（读 `attributes.device_id`）
 * @returns 去重后的设备台数
 */
export function countOfflineDevices(
  entityIds: string[],
  entities: Record<string, { attributes?: Record<string, unknown> } | undefined>,
): number {
  return groupOfflineByDevice(entityIds, entities).length
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
export function listOfflineOtherEntityIds(entitiesStore: DeviceGroupEntitiesStoreLike, criticalSet: Set<string>) {
  const ids: string[] = []
  const seen = new Set<string>()
  const consider = (rawEid: string | null | undefined) => {
    const eid = rawEid ?? ''
    if (!eid || seen.has(eid)) return
    seen.add(eid)
    if (!DOMAIN_SET.has(getEntityDomain(eid))) return
    if (criticalSet.has(eid) || isMonitoredExcludedEntity(eid)) return
    if (entitiesStore.entities[eid]?.state !== 'unavailable') return
    ids.push(eid)
  }
  // 派生索引：最近一次全量重建时已离线的设备
  for (const e of entitiesStore.offlineDevices || []) consider(e.entity_id)
  // 域索引：补齐派生 patch 被跳过、派生索引里没有的离线实体（遍历 Set 不额外分配）
  for (const domain of DOMAIN_LIST) {
    const bucket = entitiesStore.domainEntityIndex?.get(domain) as Set<string> | string[] | undefined
    if (!bucket) continue
    for (const eid of bucket) consider(eid)
  }
  return ids
}
