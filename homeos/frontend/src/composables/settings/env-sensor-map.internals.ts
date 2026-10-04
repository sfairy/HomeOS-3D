/**
 * 环境传感器映射组合式函数（合并自环境传感器映射 util 与 useEnvSensorMap）。
 *
 * 职责：
 *   - 提供 HA 环境传感器（温度/湿度/PM2.5/CO2/TVOC）与人体感应器的字段定义；
 *   - 根据实体 ID/device_class/area_id 推断传感器类型与所属房间；
 *   - 维护 envSensorMap 单例状态（房间列表、HA 区域、映射表、隐藏房间等）；
 *   - 合并 HA 区域与本地映射，输出环境健康 Widget 所需的房间展示列表；
 *   - 持久化映射到 systemConfig，处理乐观锁冲突并自动重试。
 * 依赖：
 *   - vue（ref / computed）
 *   - @/composables/config/system-config-core.internals（系统配置读写与冲突处理）
 *   - @/stores/chrome.store / entities.store / layout.store
 *   - @homeos/shared（房间关键词、区域列表构建、映射过滤等工具）
 *   - @/services/api/entities（HA 区域列表拉取）
 */
import { useSettingsSave } from './hub-ui.internals'
import {
  fetchSystemConfigFresh,
  isSystemConfigConflictError,
  patchSystemConfig,
  useSystemConfig,
} from '@/composables/config/system-config-core.internals'
import { fetchAreasList } from '@/services/api/entities'
import { useChromeStore } from '@/stores/chrome.store'
import type { EntitiesMap } from '@/types/entity-store'
import type { RoomListItem } from '@/types/env-room'
import { reloadFrontendConfig } from '@/utils/config/frontend-config'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { logger } from '@/utils/core/logger'
import { invalidateSharedFetchPrefix } from '@/utils/core/poll-scheduler'
import { ENV_IAQ_CACHE_PREFIX } from '@/composables/climate/useEnvIaq'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import type { EnvSensorMap, EnvSensorMapEntry, HaAreaRef } from '@homeos/shared'
import { buildRoomInferKeywordsMap, buildRoomListFromHaAreas, filterEnvSensorMapToKnownAreas } from '@homeos/shared'
import { computed, ref } from 'vue'

/** HA 实体属性（仅暴露环境推断所需字段） */
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

const ROOM_KEYWORDS = buildRoomInferKeywordsMap()

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

  for (const [roomId, keywords] of Object.entries(ROOM_KEYWORDS)) {
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
function inferEnvSensorMap(
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

function exportEnvSensorMapCsv(
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

function importEnvSensorMapCsv(
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
export function getEnvSensorFields() {
  return {
    temperature: {
      key: 'temperature',
      label: '温度传感器',
      labelClass: 'text-orange-400/90',
      placeholder: 'sensor.living_room_temperature',
      hint: '用于露点与霉菌风险计算，建议绑定带 <span class="text-orange-400">device_class: temperature</span> 的实体。',
      deviceClass: 'temperature',
    },
    humidity: {
      key: 'humidity',
      label: '湿度传感器',
      labelClass: 'text-cyan-400/90',
      placeholder: 'sensor.living_room_humidity',
      hint: '与温度配对后可计算露点；建议绑定 <span class="text-cyan-400">device_class: humidity</span> 实体。',
      deviceClass: 'humidity',
    },
    pm25: {
      key: 'pm25',
      label: 'PM2.5 传感器',
      labelClass: 'text-violet-400/90',
      placeholder: 'sensor.living_room_pm25',
      hint: '参与 IAQ 综合评分；实体 ID 通常含 <span class="text-violet-400">pm25</span> 或 <span class="text-violet-400">pm2_5</span>。',
      deviceClass: 'pm25',
    },
    co2: {
      key: 'co2',
      label: 'CO₂ 传感器',
      labelClass: 'text-emerald-400/90',
      placeholder: 'sensor.living_room_co2',
      hint: '参与 IAQ 综合评分；实体 ID 通常含 <span class="text-emerald-400">co2</span> 或 <span class="text-emerald-400">carbon_dioxide</span>。',
      deviceClass: 'carbon_dioxide',
    },
    tvoc: {
      key: 'tvoc',
      label: 'TVOC 传感器',
      labelClass: 'text-fuchsia-400/90',
      placeholder: 'sensor.living_room_tvoc',
      hint: '参与 IAQ 综合评分；实体 ID 通常含 <span class="text-fuchsia-400">tvoc</span>，或 device_class: volatile_organic_compounds。',
      deviceClass: 'volatile_organic_compounds',
    },
  }
}

/** 快捷规则字段定义：返回人体感应等 binary_sensor 字段的标签、占位符、提示与 domain，供「人来灯亮」等快捷规则绑定使用 */
export function getQuickRuleFields() {
  return {
    motion: {
      key: 'motion',
      label: '人体传感器',
      labelClass: 'text-amber-400/90',
      placeholder: 'binary_sensor.living_motion',
      hint: '人来灯亮触发源；建议绑定 device_class: motion / occupancy 的实体。',
      domain: 'binary_sensor',
      deviceClass: 'motion',
      shortLabel: '人体',
    },
    light: {
      key: 'light',
      label: '灯光',
      labelClass: 'text-yellow-400/90',
      placeholder: 'light.living',
      hint: '人来灯亮动作目标。',
      domain: 'light',
      shortLabel: '灯光',
    },
    climate: {
      key: 'climate',
      label: '空调',
      labelClass: 'text-sky-400/90',
      placeholder: 'climate.living',
      hint: '高温空调动作目标。',
      domain: 'climate',
      shortLabel: '空调',
    },
  }
}

function normalizeEntry(
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

function buildRoomList(map: EnvSensorMap = {}, haAreas: HaAreaRef[] = []): RoomListItem[] {
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
function serializeEnvSensorMapForPersist(map: EnvSensorMap = {}): EnvSensorMap {
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

function ensureSensorMap(
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

// ── useEnvSensorMap ──
let envSensorMapSingleton: ReturnType<typeof createEnvSensorMapState> | null = null

/** 创建环境传感器映射单例状态：聚合 HA 区域列表、传感器映射表、房间列表与持久化能力，供 rooms / env-health / 首装向导共享 */
function createEnvSensorMapState() {
  const haAreas = ref<HaAreaRef[]>([])
  const registryDegraded = ref(false)
  const registryError = ref<string | null>(null)
  const sensorFields = computed(() => getEnvSensorFields())
  const sensorMap = ref(ensureSensorMap({}))
  const roomList = ref(buildRoomList({}))
  const initialized = ref(false)

  function syncRoomList() {
    roomList.value = buildRoomList(sensorMap.value, haAreas.value)
    sensorMap.value = ensureSensorMap(sensorMap.value, roomList.value)
  }

  async function refreshHaAreas() {
    try {
      const { data } = await fetchAreasList<{
        areas?: HaAreaRef[]
        registryDegraded?: boolean
        registryError?: string | null
      }>()
      const rows = Array.isArray(data?.areas) ? data.areas : []
      registryDegraded.value = Boolean(data?.registryDegraded)
      registryError.value = data?.registryError ? String(data.registryError) : null
      haAreas.value = rows
        .map((row) => ({
          id: String(row.id || '').trim(),
          name: String(row.name || row.id || '').trim(),
        }))
        .filter((row) => row.id)
      if (data?.registryDegraded && !rows.length) {
        logger.warn('HA 区域注册表不可用,环境传感器映射将缺少 HA 区域列表')
      }
      sensorMap.value = ensureSensorMap(
        filterEnvSensorMapToKnownAreas(sensorMap.value, haAreas.value),
      )
      syncRoomList()
      return haAreas.value.length
    } catch {
      haAreas.value = []
      return 0
    }
  }

  const loading = ref(false)
  const chrome = useChromeStore()
  const { saving, runSave } = useSettingsSave()
  const { load: loadSystemConfig } = useSystemConfig()

  async function load(opts?: { force?: boolean }) {
    if (initialized.value && !opts?.force) return
    loading.value = true
    try {
      await refreshHaAreas()
      const data = await loadSystemConfig({ force: Boolean(opts?.force) })
      const filtered = filterEnvSensorMapToKnownAreas(data?.envSensorMap || {}, haAreas.value)
      sensorMap.value = ensureSensorMap(filtered, buildRoomListFromHaAreas(haAreas.value, filtered))
      syncRoomList()
      initialized.value = true
    } catch (e) {
      logger.error('加载环境传感器映射失败', e)
      chrome.notify(getApiErrorMessage(e, '加载环境传感器映射失败'), 'error')
      sensorMap.value = ensureSensorMap({})
      syncRoomList()
    } finally {
      loading.value = false
    }
  }

  function applyInference(entities: EntitiesMap) {
    const { result, matchedCount } = inferEnvSensorMap(entities, sensorMap.value, haAreas.value)
    sensorMap.value = result
    syncRoomList()
    return { sensorMap: sensorMap.value, matchedCount }
  }

  function hideRoom(roomId: string) {
    const room = roomList.value.find((r) => r.id === roomId)
    if (!room) return false
    sensorMap.value = {
      ...sensorMap.value,
      [roomId]: {
        ...normalizeEntry(sensorMap.value[roomId] || {}, room.defaultLabel),
        _hidden: true,
      },
    }
    syncRoomList()
    return true
  }

  function removeRoom(roomId: string) {
    return hideRoom(roomId)
  }

  function restoreHiddenRooms() {
    const next = { ...sensorMap.value }
    let restored = 0
    for (const [roomId, entryRaw] of Object.entries(next)) {
      const entry = entryRaw
      if (!entry?._hidden) continue
      const room = haAreas.value.find((area) => area.id === roomId)
      next[roomId] = normalizeEntry({}, room?.name || entry?.label || roomId)
      restored++
    }
    if (!restored) return 0
    sensorMap.value = ensureSensorMap(next, buildRoomList(next, haAreas.value))
    syncRoomList()
    return restored
  }

  const hiddenRoomCount = computed(
    () => Object.values(sensorMap.value).filter((entry) => entry?._hidden === true).length,
  )

  const activeRoom = computed(() => roomList.value)

  async function save() {
    return runSave(
      async () => {
        const persist = async () => {
          const filtered = filterEnvSensorMapToKnownAreas(sensorMap.value, haAreas.value)
          const cleaned = serializeEnvSensorMapForPersist(filtered)
          await patchSystemConfig({ envSensorMap: cleaned })
          sensorMap.value = ensureSensorMap(cleaned, buildRoomListFromHaAreas(haAreas.value, cleaned))
          syncRoomList()
          invalidateSharedFetchPrefix(ENV_IAQ_CACHE_PREFIX)
          void reloadFrontendConfig().catch((err) => logger.debug('环境传感器保存后刷新配置失败', err))
          return true
        }
        try {
          return await persist()
        } catch (e) {
          // HA 后台同步等会 bump revision：保留本地编辑，仅刷新乐观锁后重试一次
          if (!isSystemConfigConflictError(e)) throw e
          const localMap = serializeEnvSensorMapForPersist(
            filterEnvSensorMapToKnownAreas(sensorMap.value, haAreas.value),
          )
          await fetchSystemConfigFresh()
          await patchSystemConfig({ envSensorMap: localMap })
          sensorMap.value = ensureSensorMap(localMap, buildRoomListFromHaAreas(haAreas.value, localMap))
          syncRoomList()
          invalidateSharedFetchPrefix(ENV_IAQ_CACHE_PREFIX)
          void reloadFrontendConfig().catch((err) => logger.debug('环境传感器保存后刷新配置失败', err))
          return true
        }
      },
      {
        onError: async (e: unknown) => {
          if (isSystemConfigConflictError(e)) {
            await load({ force: true })
            return
          }
          chrome.notify(getApiErrorMessage(e, '保存环境传感器映射失败'), 'error')
          logger.error('保存环境传感器映射失败', e)
        },
      },
    )
  }

  function exportCsv() {
    return exportEnvSensorMapCsv(roomList.value, sensorMap.value)
  }

  function importCsv(text: string) {
    const {
      sensorMap: nextMap,
      roomList: nextList,
      count,
    } = importEnvSensorMapCsv(text, sensorMap.value, haAreas.value)
    sensorMap.value = nextMap
    roomList.value = nextList
    return count
  }

  function syncRoomEntries() {
    sensorMap.value = ensureSensorMap(sensorMap.value, roomList.value)
  }

  return {
    sensorMap,
    roomList,
    haAreas,
    registryDegraded,
    registryError,
    activeRoom,
    loading,
    saving,
    initialized,
    load,
    save,
    applyInference,
    removeRoom,
    hideRoom,
    restoreHiddenRooms,
    hiddenRoomCount,
    exportCsv,
    importCsv,
    syncRoomEntries,
    refreshHaAreas,
    sensorFields,
  }
}

/** rooms / env-health / 首装向导共享同一 envSensorMap 实例，避免 Tab 切换时状态分裂 */
export function useEnvSensorMap() {
  if (!envSensorMapSingleton) {
    envSensorMapSingleton = createEnvSensorMapState()
  }
  return envSensorMapSingleton
}
