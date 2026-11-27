import { formatSecurityTime } from '@/kernel/utils/format'
import { type SecurityArmingMode, shouldZoneAlarmInMode } from '@homeos/shared'
import { getEntityDisplayName } from '@/domain/entity/model/utils/derived.util'
import { type EntitiesMap } from '@/kernel/types/entity'
import { type RoomListItem } from '@/kernel/types/env-room'

/** 安防事件展示工具模块。 */
/** 安防 SecurityEvent 类型 → 展示元数据（图标 key 由视图层映射为组件） */

/**
 * 已知的联动失败事件类型集合。
 * 以 linkage_ 或 away_sim_ 开头且包含 failed 的类型也视为联动失败。
 */
const SECURITY_EVENT_LINKAGE_TYPES = [
  'linkage_auto_arm_failed',
  'linkage_away_sim_failed',
  'linkage_home_mode_failed',
  'linkage_action_failed',
  'emergency_action_failed',
  'away_sim_enable_failed',
  'away_sim_action_failed',
]

/**
 * 判定事件类型是否属于联动失败。
 *
 * @param type 事件类型字符串
 * @returns true 表示联动失败类事件
 */
function isSecurityLinkageFailureType(type: string | null | undefined) {
  if (!type) return false
  if (SECURITY_EVENT_LINKAGE_TYPES.includes(type)) return true
  // 兜底：未知联动/离家模拟失败类型也按联动失败处理
  return type.startsWith('linkage_') || (type.startsWith('away_sim_') && type.includes('failed'))
}

/** 安防事件类型展示元数据：图标 key、CSS 类、短标签 */
type SecurityEventTypeMeta = { iconKey: string; css: string; shortLabel: string }

/**
 * 事件类型 → 展示元数据映射表。
 * CSS 类名保持原样（视图层样式钩子），不翻译。
 */
const TYPE_META: Record<string, SecurityEventTypeMeta> = {
  arm: { iconKey: 'shield', css: 'sec-event-item--mode', shortLabel: '布防' },
  disarm: { iconKey: 'shieldOff', css: 'sec-event-item--mode', shortLabel: '撤防' },
  alarm: { iconKey: 'alert', css: 'sec-event-item--danger', shortLabel: '告警' },
  hazard: { iconKey: 'alert', css: 'sec-event-item--danger', shortLabel: '危险传感器' },
  emergency: { iconKey: 'siren', css: 'sec-event-item--danger', shortLabel: '紧急' },
  false_alarm_feedback: {
    iconKey: 'shieldCheck',
    css: 'sec-event-item--ok',
    shortLabel: '误报反馈',
  },
  linkage_auto_arm_failed: {
    iconKey: 'wifiOff',
    css: 'sec-event-item--danger',
    shortLabel: '联动失败',
  },
  linkage_away_sim_failed: {
    iconKey: 'wifiOff',
    css: 'sec-event-item--danger',
    shortLabel: '联动失败',
  },
  linkage_home_mode_failed: {
    iconKey: 'wifiOff',
    css: 'sec-event-item--danger',
    shortLabel: '联动失败',
  },
  linkage_action_failed: {
    iconKey: 'wifiOff',
    css: 'sec-event-item--danger',
    shortLabel: '联动失败',
  },
  emergency_action_failed: {
    iconKey: 'wifiOff',
    css: 'sec-event-item--danger',
    shortLabel: '联动失败',
  },
  away_sim_enable_failed: {
    iconKey: 'wifiOff',
    css: 'sec-event-item--danger',
    shortLabel: '联动失败',
  },
  away_sim_action_failed: {
    iconKey: 'wifiOff',
    css: 'sec-event-item--danger',
    shortLabel: '联动失败',
  },
}

/**
 * 根据事件类型解析展示元数据。
 *
 * @param type 事件类型
 * @returns 元数据对象；未知联动失败类型返回统一「联动失败」元数据，其余返回默认「事件」
 */
function metaForType(type: string) {
  if (TYPE_META[type]) return TYPE_META[type]
  if (isSecurityLinkageFailureType(type)) {
    return { iconKey: 'wifiOff', css: 'sec-event-item--danger', shortLabel: '联动失败' }
  }
  return { iconKey: 'bell', css: 'sec-event-item--sensor', shortLabel: '事件' }
}

/**
 * 格式化安防事件时间。
 *
 * @param createdAt 创建时间（Date/字符串/时间戳）
 * @returns 格式化后的时间字符串
 */
function formatSecurityEventTime(createdAt: Date | string | number | null | undefined) {
  return formatSecurityTime(createdAt)
}

/**
 * 将 API 返回的 SecurityEvent 行映射为安防页展示项。
 *
 * zones 字段可能为 JSON 字符串或数组，统一解析为 zone ID 列表。
 *
 * @param raw 原始 zones 数据
 * @returns zone ID 数组；解析失败返回空数组
 */
function parseEventZones(raw: unknown): string[] {
  if (!raw) return []
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((z) => (typeof z === 'string' ? z : (z as { id?: string })?.id))
      .filter((z): z is string => Boolean(z))
  } catch {
    return []
  }
}

/** 后端 SecurityEvent 行结构 */
type SecurityEventRow = {
  id?: string
  type?: string
  createdAt?: string | number | Date
  detail?: string
  zones?: unknown
}

/** 安防页展示项类型 */
export type SecurityEventDisplayItem = {
  id: string
  type: string
  iconKey: string
  label: string
  time: string
  css: string
  ts: number
  zoneIds: string[]
  linkageFailure: boolean
  fromDb: boolean
}

/**
 * 将单条 SecurityEvent 行映射为展示项。
 *
 * @param row 后端事件行
 * @returns 展示项；label 优先用 detail，无 detail 时用类型短标签
 */
export function mapSecurityEventRow(row: SecurityEventRow | null | undefined): SecurityEventDisplayItem {
  const type = row?.type || 'event'
  const meta = metaForType(type)
  const createdAt = row?.createdAt
  const ts = createdAt ? new Date(createdAt).getTime() : 0
  const detail = String(row?.detail || '').trim()
  // label 优先使用 detail 文案，无 detail 时回退到类型短标签
  const label = detail || meta.shortLabel
  const zoneIds = parseEventZones(row?.zones)
  return {
    id: row?.id || `${type}-${ts}`,
    type,
    iconKey: meta.iconKey,
    label,
    time: formatSecurityEventTime(createdAt),
    css: meta.css,
    ts,
    zoneIds,
    linkageFailure: isSecurityLinkageFailureType(type),
    fromDb: true,
  }
}

/**
 * 按过滤器筛选安防事件。
 *
 * 支持的 filter 值：
 * - 'all' 或空：返回全部；
 * - 'zone:<zoneId>'：按区域筛选；
 * - 'linkage'：仅返回联动失败事件；
 * - 其他字符串：按事件类型精确匹配。
 *
 * @param events 展示项列表
 * @param filter 过滤器字符串
 * @returns 过滤后的列表
 */
export function filterSecurityEvents(events: SecurityEventDisplayItem[], filter: string | null | undefined) {
  if (!filter || filter === 'all') return events
  if (typeof filter === 'string' && filter.startsWith('zone:')) {
    const zoneId = filter.slice(5)
    return events.filter((e) => e.zoneIds?.includes(zoneId))
  }
  if (filter === 'linkage') return events.filter((e) => e.linkageFailure)
  return events.filter((e) => e.type === filter)
}

/**
 * 筛选指定时间窗口内的近期联动失败事件。
 *
 * @param events 展示项列表
 * @param withinMs 时间窗口毫秒数，默认 24 小时
 * @returns 时间窗口内的联动失败事件
 */
export function recentLinkageFailures(events: SecurityEventDisplayItem[], withinMs = 24 * 60 * 60 * 1000) {
  const cutoff = Date.now() - withinMs
  return events.filter((e) => e.linkageFailure && e.ts >= cutoff)
}

/**
 * 将安防事件 CSS 类名映射为审计日志 modifier key。
 *
 * @param css 事件 CSS 类名
 * @returns modifier key：danger/mode/ok/default
 */
export function securityEventCssKey(css: string) {
  if (css.includes('danger')) return 'danger'
  if (css.includes('mode')) return 'mode'
  if (css.includes('ok')) return 'ok'
  return 'default'
}

/** 安防传感器噪音过滤模块。 */

/** 排除抄表/计价等公用事业类实体，避免误入安防传感器列表 */
const UTILITY_NOISE_KEYS = [
  '抄表',
  '单价',
  '计价',
  '阶梯',
  '系数',
  '余额',
  '读数',
  '用量',
  '流量',
  'meter_read',
  'tariff',
  'billing',
  'tier_step',
  'gas_price',
  'unit_price',
  'current_read',
  'gas_meter',
  'utility',
  'consumption',
  'volume_total',
]

/**
 * 判定实体是否为公用事业类噪音（抄表/计价等）。
 *
 * 将 entity_id 与 friendly_name 拼接后小写化，匹配任一噪音关键词即判定为噪音。
 *
 * @param entityId 实体 ID
 * @param friendlyName 实体友好名称（可选）
 * @returns true 表示该实体应被排除出安防传感器列表
 */
export function isSecurityUtilityNoise(entityId: string, friendlyName = '') {
  const hay = `${entityId} ${friendlyName}`.toLowerCase()
  return UTILITY_NOISE_KEYS.some((k) => hay.includes(k.toLowerCase()))
}

/** 安防区域模式工具模块。 */
/** 前端镜像后端 zoneType × mode 告警逻辑 — 判定自 @homeos/shared */

/** 安防布防模式类型（armed_away/armed_home/armed_night/disarmed） */
export type ArmingMode = SecurityArmingMode
export { shouldZoneAlarmInMode }

/**
 * 根据布防模式与区域类型生成提示文案。
 *
 * @param mode 当前布防模式
 * @param zoneType 区域类型（perimeter/interior/all）
 * @param armed 该区域是否实际处于布防状态（未勾选布防时为 false）
 * @returns 提示文案，说明该区域在当前模式下是否参与告警
 */
export function zoneModeHint(mode: string, zoneType: SecurityZoneType | undefined, armed = true) {
  if (mode === 'disarmed') return '撤防中 · 不触发告警'
  // 「模式允许」不等于「实际参与」：选择性布防时没被勾选的区域不会告警，
  // 只按 mode×zoneType 给「参与告警」会把用户骗了。
  if (!armed) return '未布防 · 不参与告警'
  if (shouldZoneAlarmInMode(mode, zoneType)) {
    if (mode === 'armed_away') return '外出模式 · 参与告警'
    if (mode === 'armed_home') return '居家模式 · 参与告警'
    if (mode === 'armed_night') return '夜间模式 · 参与告警'
    return '当前模式 · 参与告警'
  }
  return '居家/夜间 · 室内区静默'
}

/**
 * 判定传感器是否处于告警状态。
 *
 * 支持多种 HA 状态：
 * - on/wet/open：直接判定告警；
 * - 数值型状态：解析为数字，大于 0 视为告警；
 * - off/closed：正常；
 * - unavailable/空：非告警。
 *
 * @param state 传感器状态字符串
 * @returns true 表示处于告警状态
 */
export function isSensorAlertState(state: string | undefined) {
  if (!state || state === 'unavailable') return false
  return (
    state === 'on' ||
    state === 'wet' ||
    state === 'open' ||
    (state !== 'off' && state !== 'closed' && !Number.isNaN(parseFloat(String(state))) && parseFloat(String(state)) > 0)
  )
}

/**
 * 生成传感器状态展示标签。
 *
 * @param state 原始状态字符串
 * @param alert 是否处于告警状态
 * @param offline 是否离线
 * @returns 中文状态标签
 */
export function sensorStateLabel(state: string | undefined, alert: boolean, offline: boolean) {
  if (offline) return '离线'
  if (alert) return '告警'
  if (state === 'off' || state === 'closed') return '正常'
  return state || '—'
}

/** 安防区域房间分组工具模块。 */

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

/**
 * 载体/家电运行状态词：命中说明这条名字描述的是「某台设备的运行读数」，
 * 而不是危险源或入侵探测本身。
 *
 * 两类真实误判（都出自本机数据）：
 * - `binary_sensor.xxx_flowstatus`（「燃气热水器 水流状态」）因名字含「燃气」被判成
 *   燃气泄漏探测 —— 每次开热水都会在 `armed_home` 下触发一次入侵告警；
 * - `binary_sensor.xxx_refrigeratordoorstatus`（冰箱门）因含 `door` 被判成门窗磁 ——
 *   开冰箱门同样会告警。
 *
 * 危险源/门窗类关键词只应在「探测器」语境下生效，不能因为设备烧燃气、或者设备
 * 本身有门，就当成安防传感器。
 */
const NON_SECURITY_CARRIER_KEYS = [
  // 水系统读数
  '水流',
  '水压',
  '水温',
  'flowstatus',
  'flow_status',
  'water_flow',
  'water_temp',
  'water_pressure',
  // 热源设备
  '热水器',
  '壁挂炉',
  '锅炉',
  'water_heater',
  'boiler',
  // 家电门体（冰箱/冷柜/洗衣机/洗碗机/烤箱/微波炉）
  '冰箱',
  '冷柜',
  '洗衣机',
  '洗碗机',
  '烤箱',
  '微波炉',
  'refrigerator',
  'freezer',
  'fridge',
  'washing_machine',
  'washer',
  'dishwasher',
  'oven',
  'microwave',
]

/** HA `binary_sensor` 的 `device_class` → 安防分类（存在时的权威口径）。 */
const DEVICE_CLASS_TYPES: Record<string, { type: string; label: string }> = {
  gas: { type: 'gas', label: '燃气' },
  smoke: { type: 'smoke', label: '烟感' },
  carbon_monoxide: { type: 'co', label: 'CO' },
  moisture: { type: 'leak', label: '水浸' },
  door: { type: 'door', label: '门窗' },
  window: { type: 'door', label: '门窗' },
  garage_door: { type: 'door', label: '门窗' },
  opening: { type: 'door', label: '门窗' },
  motion: { type: 'motion', label: '移动' },
  occupancy: { type: 'motion', label: '移动' },
  presence: { type: 'motion', label: '移动' },
}

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

/** 名字兜底的关键词表，按优先级排列（烟感 > 燃气 > CO > 水浸 > 门窗 > 移动）。 */
const KEYWORD_CLASSIFIERS: Array<{ keys: string[]; type: string }> = [
  { keys: SMOKE_KEYS, type: 'smoke' },
  { keys: GAS_KEYS, type: 'gas' },
  { keys: CO_KEYS, type: 'co' },
  { keys: LEAK_KEYS, type: 'leak' },
  { keys: DOOR_KEYS, type: 'door' },
  { keys: MOTION_KEYS, type: 'motion' },
]

/**
 * 名字兜底分类（仅在实体没有 `device_class` 时使用）。
 *
 * @param id 小写化的 entity_id
 * @param name 友好名称
 * @returns 分类结果；没有命中返回 null
 */
function classifyByKeywords(id: string, name: string) {
  for (const entry of KEYWORD_CLASSIFIERS) {
    if (matchAny(id, name, entry.keys)) {
      return { type: entry.type, label: SENSOR_TYPE_LABELS[entry.type] }
    }
  }
  return null
}

/**
 * 对 binary_sensor 实体进行安防分类。
 *
 * 两种口径，按可信度排序：
 * 1. **家电/载体状态优先排除**：冰箱门、水流状态这类实体的名字里虽然带 `door`、
 *    「燃气」，但它们描述的是设备自身运行，进安防区域只会制造误报。
 * 2. **`device_class` 权威**：存在时直接映射，映射不到就判定「不是安防传感器」。
 *    `device_class=running` 的水流状态、`battery`、`plug` 等都不会被误收。
 * 3. **名字兜底**（老实体没有 `device_class`）：关键词匹配（见
 *    `NON_SECURITY_CARRIER_KEYS` 已先排除载体）。
 *
 * 公用事业类噪音实体（抄表/计价）直接返回 null 排除。
 *
 * @param entityId 实体 ID
 * @param friendlyName 实体友好名称
 * @param deviceClass 实体的 `attributes.device_class`（有则优先，缺省走名字兜底）
 * @returns 分类结果（type + label）；无法分类返回 null
 */
export function classifySecurityBinarySensor(entityId: string, friendlyName = '', deviceClass = '') {
  const name = friendlyName || ''
  if (isSecurityUtilityNoise(entityId, name)) return null
  const id = entityId.toLowerCase()
  // 家电/载体状态优先排除：`refrigerator` 里也有 `door`，顺序不能反。
  if (matchAny(id, name, NON_SECURITY_CARRIER_KEYS)) return null
  const dc = String(deviceClass || '')
    .trim()
    .toLowerCase()
  // `device_class` 存在时以它为准：名字里的「燃气」是设备载体，不是探测对象。
  if (dc) return DEVICE_CLASS_TYPES[dc] ?? null
  return classifyByKeywords(id, name)
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
/**
 * 从实体快照里取该用的安防分类（把 `device_class` 一并交给分类器）。
 * 不是安防传感器时返回 null。
 */
function classifyEntity(entityId: string, name: string, ent: { attributes?: Record<string, unknown> } | undefined) {
  return classifySecurityBinarySensor(entityId, name, String(ent?.attributes?.device_class || ''))
}

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
    // device_class 是权威口径：传进去才能真正区分「燃气探测器」与「燃气热水器的水流状态」。
    const cls = classifyEntity(entityId, name, ent)
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
      id: group.roomId === '__unassigned__' ? `zone-unassigned-${Date.now()}` : `zone-room-${group.roomId}`,
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
export function sensorsForRoomSelection(roomId: string, groups: Map<string, RoomSensorGroup>): SecuritySensorRef[] {
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
