/**
 * @file env-sensor-map-util.internals.ts
 * @module frontend/src/views
 */
/** 环境传感器映射：推断与 CSV 工具 */
import type { EntitiesMap } from '@/shared/types/entity-store'
import type { RoomListItem } from '@/shared/types/env-room'
import { getEntityDisplayName } from '@/shared/entity/utils/derived.util'
import type { EnvSensorMap, EnvSensorMapEntry, HaAreaRef } from '@homeos/shared'
import { buildRoomInferKeywordsMap, buildRoomListFromHaAreas } from '@homeos/shared'

interface EnvSensorHaEntityAttributes {
  device_class?: string
  friendly_name?: string
  area_id?: string
  [key: string]: unknown
}

/** 环境传感器映射用的实体窄类型（避免与 @homeos/shared HaEntity 同名） */
interface EnvSensorHaEntity {
  state?: string
  attributes?: EnvSensorHaEntityAttributes
  [key: string]: unknown
}

// ── env-sensor-map.util ──
const DEVICE_CLASS_MAP: Record<string, string[]> = {
  temperature: ['temperature'],
  humidity: ['humidity'],
  pm25: ['pm25'],
  co2: ['carbon_dioxide'],
  tvoc: ['volatile_organic_compounds', 'voc'],
}

const MOTION_DEVICE_CLASSES = new Set(['motion', 'occupancy', 'moving'])

/**
 * 房间关键词表按需构建（首次匹配时才调用 `buildRoomInferKeywordsMap`）。
 *
 * 不能在模块顶层直接调用：本模块与 `@homeos/shared` 的房间目录可能被 rolldown 分到
 * 互相 import 的 shared-* chunk 里（跨 chunk 环）。环内被 import 的模块若尚未求值，
 * 其 `var` 绑定仍是 undefined，而目录函数的默认参数正是该绑定，
 * 于是 `for (const room of catalog)` 抛 `TypeError: e is not iterable`，
 * 整个懒加载 chunk 求值失败（表现为 Uncaught (in promise)）。
 * 延迟到运行时调用可彻底摆脱 chunk 求值顺序依赖。
 */
let roomKeywordsCache: Record<string, string[]> | null = null
function getRoomKeywords(): Record<string, string[]> {
  roomKeywordsCache ??= buildRoomInferKeywordsMap()
  return roomKeywordsCache
}

function matchRoomId(
  eid: string,
  friendlyName: string | undefined,
  sensorMap: EnvSensorMap,
  areaId: string | undefined,
): string | null {
  const hay = `${eid} ${friendlyName || ''}`.toLowerCase()

  if (areaId) {
    const direct = areaId.trim()
    if (direct) {
      if (sensorMap[direct] && !isRoomHidden(sensorMap, direct)) return direct
      return direct
    }
  }

  for (const [roomId, keywords] of Object.entries(getRoomKeywords())) {
    if (keywords.some((k) => hay.includes(k))) return roomId
  }

  for (const [roomId, entryRaw] of Object.entries(sensorMap)) {
    if (isRoomHidden(sensorMap, roomId)) continue
    const label = entryRaw?.label?.trim()
    if (label && hay.includes(label.toLowerCase())) return roomId
  }

  return null
}

function matchSensorType(eid: string, entity: EnvSensorHaEntity) {
  const id = eid.toLowerCase()

  const deviceClass = entity?.attributes?.device_class?.toLowerCase()
  if (deviceClass) {
    for (const [sensorType, classes] of Object.entries(DEVICE_CLASS_MAP)) {
      if (classes.includes(deviceClass)) {
        return sensorType
      }
    }
  }

  if (id.includes('temperature') || id.includes('_temp')) return 'temperature'
  if (id.includes('humidity')) return 'humidity'
  if (id.includes('pm25') || id.includes('pm2.5') || id.includes('pm_2_5')) return 'pm25'
  if (id.includes('co2') || id.includes('carbon_dioxide')) return 'co2'
  if (id.includes('tvoc') || id.includes('volatile_organic')) return 'tvoc'

  return null
}

function matchQuickRuleType(eid: string, entity: EnvSensorHaEntity): string | null {
  const id = eid.toLowerCase()
  const deviceClass = entity?.attributes?.device_class?.toLowerCase()

  if (eid.startsWith('binary_sensor.')) {
    if (deviceClass && MOTION_DEVICE_CLASSES.has(deviceClass)) return 'motion'
    if (id.includes('motion') || id.includes('occupancy') || id.includes('presence')) {
      return 'motion'
    }
    return null
  }

  if (eid.startsWith('light.')) {
    if (/\.all$/i.test(eid) || eid === 'light.all') return null
    return 'light'
  }
  if (eid.startsWith('climate.')) return 'climate'
  if (eid.startsWith('sensor.')) return matchSensorType(eid, entity)

  return null
}

/** 从实体列表智能推断各房间传感器（仅填充空槽位） */
export function inferEnvSensorMap(
  entities: EntitiesMap | Record<string, EnvSensorHaEntity>,
  baseMap: EnvSensorMap = {},
  haAreas: HaAreaRef[] = [],
): { result: Record<string, RuntimeEnvSensorEntry>; matchedCount: number } {
  const roomList = buildRoomList(baseMap, haAreas)
  const result = ensureSensorMap(baseMap, roomList)
  if (!entities || typeof entities !== 'object') return { result, matchedCount: 0 }

  const matchedEntities = new Set<string>()

  for (const [eid, entRaw] of Object.entries(entities)) {
    const ent = entRaw
    if (!ent || ent.state === 'unavailable' || ent.state === 'unknown') continue

    const slotType = matchQuickRuleType(eid, ent)
    if (!slotType) continue

    const areaId = ent.attributes?.area_id
    const roomId = matchRoomId(eid, getEntityDisplayName(eid, ent), result, areaId)
    if (!roomId || !result[roomId]) continue

    const room = result[roomId]
    if (!room[slotType]) {
      room[slotType] = eid
      matchedEntities.add(eid)
    }
  }

  return { result, matchedCount: matchedEntities.size }
}

// ── env-sensor-map-csv.util ──
const CSV_COLUMNS = [
  'roomId',
  'label',
  'temperature',
  'humidity',
  'pm25',
  'co2',
  'tvoc',
  'motion',
  'light',
  'climate',
  '_hidden',
] as const

export function exportEnvSensorMapCsv(
  roomList: RoomListItem[],
  sensorMap: Record<string, RuntimeEnvSensorEntry>,
) {
  const rows: string[][] = [[...CSV_COLUMNS]]
  for (const room of roomList) {
    const s = sensorMap[room.id]
    rows.push([
      room.id,
      s?.label || room.defaultLabel,
      s?.temperature || '',
      s?.humidity || '',
      s?.pm25 || '',
      s?.co2 || '',
      s?.tvoc || '',
      s?.motion || '',
      s?.light || '',
      s?.climate || '',
      s?._hidden ? 'true' : '',
    ])
  }
  for (const [roomId, entryRaw] of Object.entries(sensorMap)) {
    const entry = entryRaw
    if (!entry?._hidden || roomList.some((r) => r.id === roomId)) continue
    rows.push([roomId, entry.label || roomId, '', '', '', '', '', '', '', '', 'true'])
  }
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
}

export function importEnvSensorMapCsv(
  text: string,
  currentMap: Record<string, RuntimeEnvSensorEntry>,
  haAreas: HaAreaRef[],
): { sensorMap: Record<string, RuntimeEnvSensorEntry>; roomList: RoomListItem[]; count: number } {
  const lines = String(text || '')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
  if (lines.length < 2) throw new Error('CSV 无数据行')
  const header = lines[0].split(',').map((h) => h.replace(/^"|"$/g, '').trim().toLowerCase())
  const idx = (k: string) => header.indexOf(k)
  const next: Record<string, RuntimeEnvSensorEntry> = { ...currentMap }
  for (let i = 1; i < lines.length; i++) {
    const cols =
      lines[i]
        .match(/("([^"]|"")*"|[^,]+)/g)
        ?.map((c) => c.replace(/^"|"$/g, '').replace(/""/g, '"').trim()) || []
    const roomId = cols[idx('roomid')] || cols[0]
    if (!roomId) continue
    const hiddenRaw = cols[idx('_hidden')] || cols[idx('hidden')] || ''
    const hidden = hiddenRaw === 'true' || hiddenRaw === '1'
    next[roomId] = {
      ...normalizeEntry(
        {
          label: cols[idx('label')] || '',
          temperature: cols[idx('temperature')] || '',
          humidity: cols[idx('humidity')] || '',
          pm25: cols[idx('pm25')] || '',
          co2: cols[idx('co2')] || '',
          tvoc: cols[idx('tvoc')] || '',
          motion: cols[idx('motion')] || '',
          light: cols[idx('light')] || '',
          climate: cols[idx('climate')] || '',
        },
        cols[idx('label')] || roomId,
      ),
      ...(hidden ? { _hidden: true } : {}),
    }
  }
  const roomList = buildRoomList(next, haAreas)
  const sensorMap = ensureSensorMap(next, roomList)
  return { sensorMap, roomList, count: Object.keys(next).length }
}

/** 运行时环境传感器映射条目：归一化后基础字段保证存在，并允许动态传感器键索引 */
interface RuntimeEnvSensorEntry {
  label: string
  temperature: string
  humidity: string
  pm25: string
  co2: string
  tvoc: string
  motion: string
  light: string
  climate: string
  _hidden?: boolean
  [key: string]: string | boolean | undefined
}

/** 环境传感器字段定义：返回温度/湿度/PM2.5/CO2/TVOC 等字段的标签、占位符、提示与 device_class，供设置面板表单渲染 */
export function normalizeEntry(
  cur: EnvSensorMapEntry | undefined | null,
  fallbackLabel = '',
): RuntimeEnvSensorEntry {
  return {
    label: (cur?.label ?? fallbackLabel ?? '').trim() || fallbackLabel || '',
    temperature: cur?.temperature ?? '',
    humidity: cur?.humidity ?? '',
    pm25: cur?.pm25 ?? '',
    co2: cur?.co2 ?? '',
    tvoc: cur?.tvoc ?? '',
    motion: cur?.motion ?? '',
    light: cur?.light ?? '',
    climate: cur?.climate ?? '',
    _hidden: cur?._hidden === true,
  }
}

function isRoomHidden(map: EnvSensorMap, roomId: string) {
  return map?.[roomId]?._hidden === true
}

export function buildRoomList(map: EnvSensorMap = {}, haAreas: HaAreaRef[] = []): RoomListItem[] {
  if (haAreas.length) {
    return buildRoomListFromHaAreas(haAreas, map)
  }
  const rooms: RoomListItem[] = []
  for (const [id, entryRaw] of Object.entries(map)) {
    const entry = entryRaw
    if (!entry || entry._hidden) continue
    rooms.push({
      id,
      defaultLabel: entry.label?.trim() || id,
      fixed: false,
      displayLabel: entry.label?.trim() || id,
    })
  }
  return rooms.sort((a, b) => a.displayLabel.localeCompare(b.displayLabel, 'zh-CN'))
}

/** 持久化 envSensorMap：仅含非空字段；删除的房间不会出现在结果中 */
export function serializeEnvSensorMapForPersist(map: EnvSensorMap = {}): EnvSensorMap {
  const source: EnvSensorMap = map && typeof map === 'object' ? map : {}
  const cleaned: EnvSensorMap = {}
  for (const [roomId, sensors] of Object.entries(source)) {
    if (sensors == null) continue
    const entry: EnvSensorMapEntry = {}
    const label = sensors.label?.trim()
    if (label) entry.label = label
    if (sensors.temperature?.trim()) entry.temperature = sensors.temperature.trim()
    if (sensors.humidity?.trim()) entry.humidity = sensors.humidity.trim()
    if (sensors.pm25?.trim()) entry.pm25 = sensors.pm25.trim()
    if (sensors.co2?.trim()) entry.co2 = sensors.co2.trim()
    if (sensors.tvoc?.trim()) entry.tvoc = sensors.tvoc.trim()
    if (sensors.motion?.trim()) entry.motion = sensors.motion.trim()
    if (sensors.light?.trim()) entry.light = sensors.light.trim()
    if (sensors.climate?.trim()) entry.climate = sensors.climate.trim()
    if (sensors._hidden === true) entry._hidden = true
    if (Object.keys(entry).length) cleaned[roomId] = entry
  }
  return cleaned
}

export function ensureSensorMap(
  map: EnvSensorMap = {},
  roomList?: RoomListItem[],
): Record<string, RuntimeEnvSensorEntry> {
  const source: EnvSensorMap = map && typeof map === 'object' ? map : {}
  const list = roomList ?? buildRoomList(source)
  const next: Record<string, RuntimeEnvSensorEntry> = {}

  for (const [roomId, entryRaw] of Object.entries(source)) {
    if (entryRaw?._hidden === true) {
      next[roomId] = {
        ...normalizeEntry(entryRaw, entryRaw?.label || roomId),
        _hidden: true,
      }
    }
  }

  for (const room of list) {
    next[room.id] = {
      ...normalizeEntry(source[room.id], room.defaultLabel),
      _hidden: false,
    }
  }

  return next
}

export {
  getEnvSensorFields,
  getQuickRuleFields,
} from '@/features/settings/composables/env-sensor-map-fields.internals'
