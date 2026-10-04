/**
 * 安防区域房间分组工具模块。
 *
 * 职责：
 * - 将 binary_sensor 实体按传感器类型分类（烟感/燃气/CO/水浸/门窗/移动）；
 * - 按房间分组组织传感器，支持通过 area_id 或名称匹配房间；
 * - 从房间分组自动生成安防区域草稿，推断区域类型（外围/室内/全部）；
 * - 提供区域合并、房间推断、传感器选择等辅助能力。
 *
 * 依赖：getEntityDisplayName、isSecurityUtilityNoise、EntitiesMap、RoomListItem 类型。
 */
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import { isSecurityUtilityNoise } from '@/utils/security/sensor-filter.util'
import type { EntitiesMap } from '@/types/entity-store'
import type { RoomListItem } from '@/types/env-room'

/** 安防区域类型：外围/室内/全部 */
export type SecurityZoneType = 'perimeter' | 'interior' | 'all'

/** 安防区域草稿结构（编辑态） */
export interface SecurityZoneDraft {
  id: string
  name: string
  zoneType: SecurityZoneType
  sensors: string[]
  roomId?: string
}

/** 安防传感器引用结构 */
export interface SecuritySensorRef {
  entity_id: string
  name: string
  type: string
  label: string
}

/** 按房间分组的传感器集合 */
interface RoomSensorGroup {
  roomId: string
  label: string
  sensors: SecuritySensorRef[]
}

/** 移动类传感器关键词（中英双语匹配） */
const MOTION_KEYS = ['motion', 'occupancy', 'presence', '移动', '人体', '存在', '占位']
/** 门窗类传感器关键词 */
const DOOR_KEYS = ['door', 'window', 'contact', '门磁', '窗磁', '门', '窗']
/** 烟感类传感器关键词 */
const SMOKE_KEYS = ['smoke', '烟雾', '烟感']
/** 燃气类传感器关键词 */
const GAS_KEYS = ['gas', 'methane', '燃气', '甲烷', '天然气']
/** 水浸类传感器关键词 */
const LEAK_KEYS = ['leak', 'moisture', '漏水', '水浸']
/** 一氧化碳类传感器关键词 */
const CO_KEYS = ['co', 'carbon_monoxide', '一氧化碳']

/** 传感器类型 → 中文标签映射 */
const SENSOR_TYPE_LABELS: Record<string, string> = {
  smoke: '烟感',
  gas: '燃气',
  co: 'CO',
  leak: '水浸',
  door: '门窗',
  motion: '移动',
}

/**
 * 判定 entity_id 或名称是否包含任一关键词（不区分大小写）。
 *
 * @param id 实体 ID（小写化匹配）
 * @param name 友好名称（小写化匹配）
 * @param keys 关键词列表
 * @returns 命中任一关键词返回 true
 */
function matchAny(id: string, name: string, keys: string[]) {
  const l = id.toLowerCase()
  const n = (name || '').toLowerCase()
  return keys.some((k) => l.includes(k) || n.includes(k))
}

/**
 * 对 binary_sensor 实体进行安防分类。
 *
 * 分类优先级：烟感 > 燃气 > CO > 水浸 > 门窗 > 移动。
 * 公用事业类噪音实体（抄表/计价）直接返回 null 排除。
 *
 * @param entityId 实体 ID
 * @param friendlyName 友好名称
 * @returns 分类结果（type + label）；无法分类返回 null
 */
export function classifySecurityBinarySensor(entityId: string, friendlyName = '') {
  const name = friendlyName || ''
  if (isSecurityUtilityNoise(entityId, name)) return null
  const id = entityId.toLowerCase()
  if (matchAny(id, name, SMOKE_KEYS)) return { type: 'smoke', label: SENSOR_TYPE_LABELS.smoke }
  if (matchAny(id, name, GAS_KEYS)) return { type: 'gas', label: SENSOR_TYPE_LABELS.gas }
  if (matchAny(id, name, CO_KEYS)) return { type: 'co', label: SENSOR_TYPE_LABELS.co }
  if (matchAny(id, name, LEAK_KEYS)) return { type: 'leak', label: SENSOR_TYPE_LABELS.leak }
  if (matchAny(id, name, DOOR_KEYS)) return { type: 'door', label: SENSOR_TYPE_LABELS.door }
  if (matchAny(id, name, MOTION_KEYS)) return { type: 'motion', label: SENSOR_TYPE_LABELS.motion }
  return null
}
/**
 * 根据传感器类型集合推断区域类型。
 *
 * - 全为 door → 外围（perimeter）；
 * - 全为 motion → 室内（interior）；
 * - 混合或为空 → 全部（all）。
 *
 * @param types 传感器类型数组
 * @returns 推断的区域类型
 */
export function inferZoneTypeFromSensorTypes(types: string[]): SecurityZoneType {
  const uniq = [...new Set(types.filter(Boolean))]
  if (!uniq.length) return 'all'
  if (uniq.every((t) => t === 'door')) return 'perimeter'
  if (uniq.every((t) => t === 'motion')) return 'interior'
  return 'all'
}

/**
 * 为实体解析所属房间 ID。
 *
 * 解析顺序：
 * 1. 优先使用 HA 的 area_id（需在 rooms 列表中存在）；
 * 2. 否则在 entity_id + friendly_name 中匹配房间 displayLabel 或 id。
 *
 * @param entityId 实体 ID
 * @param friendlyName 友好名称
 * @param areaId HA 区域 ID
 * @param rooms 房间列表
 * @returns 房间 ID；未匹配返回空字符串
 */
function resolveRoomIdForEntity(
  entityId: string,
  friendlyName: string,
  areaId: string | undefined,
  rooms: RoomListItem[],
) {
  const trimmedArea = String(areaId || '').trim()
  if (trimmedArea && rooms.some((r) => r.id === trimmedArea)) return trimmedArea

  const hay = `${entityId} ${friendlyName}`.toLowerCase()
  for (const room of rooms) {
    const label = room.displayLabel.toLowerCase()
    if (label && hay.includes(label)) return room.id
    if (room.id && hay.includes(room.id.toLowerCase())) return room.id
  }
  return ''
}

/**
 * 将实体按房间分组组织为安防传感器集合。
 *
 * 流程：
 * 1. 为每个房间初始化空分组；
 * 2. 遍历 binary_sensor 实体，跳过 unavailable/unknown 与非安防类；
 * 3. 解析房间归属，匹配则入对应分组，未匹配入「未分配房间」；
 * 4. 各分组内传感器按名称（zh-CN）排序。
 *
 * @param entities 实体映射表
 * @param rooms 房间列表
 * @returns roomId → RoomSensorGroup 的映射（含 __unassigned__ 兜底分组）
 */
export function groupSecuritySensorsByRoom(
  entities: EntitiesMap | Record<string, { state?: string; attributes?: Record<string, unknown> }>,
  rooms: RoomListItem[],
): Map<string, RoomSensorGroup> {
  const groups = new Map<string, RoomSensorGroup>()
  for (const room of rooms) {
    groups.set(room.id, { roomId: room.id, label: room.displayLabel, sensors: [] })
  }

  const unassigned: SecuritySensorRef[] = []

  for (const [entityId, entRaw] of Object.entries(entities || {})) {
    if (!entityId.startsWith('binary_sensor.')) continue
    const ent = entRaw as { state?: string; attributes?: Record<string, unknown> }
    // 跳过不可用实体，避免将离线传感器纳入分组
    if (!ent || ent.state === 'unavailable' || ent.state === 'unknown') continue

    const name = getEntityDisplayName(entityId, ent)
    const cls = classifySecurityBinarySensor(entityId, name)
    if (!cls) continue

    const ref: SecuritySensorRef = {
      entity_id: entityId,
      name,
      type: cls.type,
      label: cls.label,
    }

    const areaId = ent.attributes?.area_id as string | undefined
    const roomId = resolveRoomIdForEntity(entityId, name, areaId, rooms)
    if (roomId && groups.has(roomId)) {
      groups.get(roomId)!.sensors.push(ref)
    } else {
      unassigned.push(ref)
    }
  }

  // 未匹配房间的传感器单独分组，便于用户后续手动归置
  if (unassigned.length) {
    groups.set('__unassigned__', {
      roomId: '__unassigned__',
      label: '未分配房间',
      sensors: unassigned.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
    })
  }

  for (const group of groups.values()) {
    group.sensors.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  }

  return groups
}
/**
 * 从房间分组生成安防区域草稿。
 *
 * 每个有传感器的房间生成一个区域，区域类型根据传感器类型推断；
 * __unassigned__ 分组默认不生成区域（可通过 includeUnassigned 包含）。
 *
 * @param groups 房间分组映射
 * @param opts.includeUnassigned 是否包含未分配房间的分组
 * @returns 区域草稿数组（按名称 zh-CN 排序）
 */
export function buildZonesFromRoomGroups(
  groups: Map<string, RoomSensorGroup>,
  { includeUnassigned = false }: { includeUnassigned?: boolean } = {},
): SecurityZoneDraft[] {
  const zones: SecurityZoneDraft[] = []
  for (const group of groups.values()) {
    if (!group.sensors.length) continue
    if (group.roomId === '__unassigned__' && !includeUnassigned) continue
    zones.push({
      id:
        group.roomId === '__unassigned__'
          ? `zone-unassigned-${Date.now()}`
          : `zone-room-${group.roomId}`,
      name: group.label,
      roomId: group.roomId === '__unassigned__' ? '' : group.roomId,
      sensors: group.sensors.map((s) => s.entity_id),
      zoneType: inferZoneTypeFromSensorTypes(group.sensors.map((s) => s.type)),
    })
  }
  return zones.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

/**
 * 将生成的区域合并到已有区域列表。
 *
 * 合并规则：
 * - 已有区域已占用的 roomId 跳过（避免同房间多区域）；
 * - ID 冲突时追加时间戳后缀去重。
 *
 * @param existing 已有区域列表
 * @param generated 生成的区域列表
 * @returns 合并后的区域列表（不修改已有项）
 */
export function mergeGeneratedZones(
  existing: SecurityZoneDraft[],
  generated: SecurityZoneDraft[],
): SecurityZoneDraft[] {
  const usedRoomIds = new Set(existing.map((z) => z.roomId).filter(Boolean))
  const usedIds = new Set(existing.map((z) => z.id))
  const merged = [...existing]
  for (const zone of generated) {
    if (zone.roomId && usedRoomIds.has(zone.roomId)) continue
    let id = zone.id
    while (usedIds.has(id)) id = `${zone.id}-${Date.now()}`
    merged.push({ ...zone, id })
    usedIds.add(id)
    if (zone.roomId) usedRoomIds.add(zone.roomId)
  }
  return merged
}

/**
 * 获取指定房间的传感器列表（用于房间选择时的传感器展示）。
 *
 * @param roomId 房间 ID
 * @param groups 房间分组映射
 * @returns 该房间的传感器引用数组；无匹配返回空数组
 */
export function sensorsForRoomSelection(
  roomId: string,
  groups: Map<string, RoomSensorGroup>,
): SecuritySensorRef[] {
  if (!roomId) return []
  return groups.get(roomId)?.sensors || []
}

/**
 * 区域类型 → 中文标签。
 *
 * @param type 区域类型
 * @returns 中文标签
 */
export function zoneTypeLabel(type: SecurityZoneType) {
  if (type === 'perimeter') return '外围'
  if (type === 'interior') return '室内'
  return '全部'
}