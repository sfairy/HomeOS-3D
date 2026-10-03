/**
 * @module room-metrics.util
 * @description 移动端房间页的「微景观」指标派生：温度 / 湿度 / 开灯统计。
 *
 * 设计要点：
 * - 纯函数 + 注入式查询接口（`RoomMetricsLookup`），不直接依赖 Pinia，便于单测；
 * - 不新建房间级派生索引：房间绑定实体数量很小，逐实体读取 `getEntityRevision`
 *   即可建立细粒度响应式依赖（仅该实体变化时重算）；
 * - 温度优先级：`layout.mobileRoomStats[roomId].temp` 显式映射 → `climate.current_temperature`
 *   → `sensor.*`（device_class=temperature，或实体 ID 含 temp）数值状态；
 * - 湿度优先级：`layout.mobileRoomStats[roomId].humidity` 显式映射 → `sensor.*` 湿度传感器
 *   → `climate.current_humidity`；
 * - 开灯统计沿用全库既有规则（见 `utils/entity/derived-internals.ts`）：`light.` 前缀且
 *   `state === 'on'` 记为已开，`total` 为房间内存活灯具总数。
 */
import { isEntityAlive } from '@/utils/entity/entity-alive.util'

/** 房间指标所需的最小实体视图（与 HaEntityState 兼容） */
export interface RoomMetricEntityView {
  entity_id?: string
  state?: string
  attributes?: {
    friendly_name?: string
    unit_of_measurement?: string
    device_class?: unknown
    current_temperature?: unknown
    current_humidity?: unknown
    [key: string]: unknown
  }
}

/** 房间指标查询接口：由调用方（组件）注入 store 能力 */
export interface RoomMetricsLookup {
  /** 读取实体快照 */
  getEntity(entityId: string): RoomMetricEntityView | undefined
  /** 读取实体变更版本号（读取动作本身建立响应式依赖） */
  getEntityRevision(entityId: string): number
  /** 实体映射表（用于存活判定） */
  entities: Record<string, unknown> | null | undefined
}

/** 房间绑定实体行（与 AreaRow.entities 对齐） */
export interface RoomBoundEntityRow {
  entityId: string
}

/** `layout.mobileRoomStats[roomId]` 单房间的温湿度传感器映射 */
export type RoomStatSensors = { temp?: string; humidity?: string } | undefined

/** 带单位的数值指标（温度用） */
export interface RoomMetricNumber {
  /** 数值文本（已去除单位） */
  value: string
  /** 单位文本（如 `°C`），可能为空字符串 */
  unit: string
}

/** 开灯统计：`on` 为已开灯具数，`total` 为存活灯具总数 */
export interface RoomLightStats {
  on: number
  total: number
}

/** 默认温度单位（无 unit_of_measurement 时回退） */
const DEFAULT_TEMP_UNIT = '°C'

/**
 * 把实体状态解析为有限数值。
 * @param state HA 状态字符串
 * @returns 数值；非数字 / unknown / unavailable 返回 null
 */
function toFiniteNumber(state: unknown): number | null {
  if (state === undefined || state === null) return null
  const text = String(state).trim()
  if (!text || text === 'unknown' || text === 'unavailable') return null
  const num = Number.parseFloat(text)
  return Number.isFinite(num) ? num : null
}

/**
 * 读取实体的数值状态 + 单位（用于显式配置的温湿度传感器）。
 * @param entity 实体快照
 * @returns 数值与单位；不可解析时返回 null
 */
function readNumericEntity(entity: RoomMetricEntityView | undefined): RoomMetricNumber | null {
  if (!entity) return null
  const num = toFiniteNumber(entity.state)
  if (num === null) return null
  const unit = String(entity.attributes?.unit_of_measurement ?? '').trim()
  return { value: String(num), unit }
}

/**
 * 读取房间显式配置的温湿度传感器指标。
 * @param stats 该房间的传感器映射
 * @param key 指标 key（temp / humidity）
 * @param lookup 注入的查询接口
 * @returns 数值与单位；未配置或不可读时返回 null
 */
function readConfiguredSensor(
  stats: RoomStatSensors,
  key: 'temp' | 'humidity',
  lookup: RoomMetricsLookup,
): RoomMetricNumber | null {
  const entityId = String(stats?.[key] ?? '').trim()
  if (!entityId) return null
  lookup.getEntityRevision(entityId)
  return readNumericEntity(lookup.getEntity(entityId))
}

/**
 * 从房间绑定实体中挑第一个满足条件的实体（读取其版本号以建立响应式依赖）。
 * @param rows 房间绑定实体行
 * @param lookup 注入的查询接口
 * @param match 判定函数
 * @returns 命中的实体快照；未命中返回 null
 */
function findBoundEntity(
  rows: RoomBoundEntityRow[],
  lookup: RoomMetricsLookup,
  match: (entityId: string, entity: RoomMetricEntityView) => boolean,
): RoomMetricEntityView | null {
  for (const row of rows) {
    const entityId = String(row?.entityId ?? '').trim()
    if (!entityId) continue
    lookup.getEntityRevision(entityId)
    const entity = lookup.getEntity(entityId)
    if (!entity) continue
    if (match(entityId, entity)) return entity
  }
  return null
}

/** 实体是否为温度传感器（device_class=temperature，或实体 ID 含 temp） */
function isTemperatureSensor(entityId: string, entity: RoomMetricEntityView): boolean {
  if (!entityId.startsWith('sensor.')) return false
  if (String(entity.attributes?.device_class ?? '') === 'temperature') return true
  return entityId.includes('temp')
}

/** 实体是否为湿度传感器（device_class=humidity，或实体 ID 含 humi） */
function isHumiditySensor(entityId: string, entity: RoomMetricEntityView): boolean {
  if (!entityId.startsWith('sensor.')) return false
  if (String(entity.attributes?.device_class ?? '') === 'humidity') return true
  return /humi/i.test(entityId)
}

/**
 * 派生房间温度。
 *
 * 优先级：显式映射传感器 → 房间内空调 `current_temperature` → 房间内温度传感器。
 *
 * @param rows 房间绑定实体行
 * @param stats 该房间的传感器映射（`layout.mobileRoomStats[roomId]`）
 * @param lookup 注入的查询接口
 * @returns 温度数值与单位；无可用数据时返回 null
 */
export function readRoomTemperature(
  rows: RoomBoundEntityRow[] | null | undefined,
  stats: RoomStatSensors,
  lookup: RoomMetricsLookup,
): RoomMetricNumber | null {
  const list = Array.isArray(rows) ? rows : []

  const configured = readConfiguredSensor(stats, 'temp', lookup)
  if (configured) return configured

  const climate = findBoundEntity(list, lookup, (entityId, entity) => {
    if (!entityId.startsWith('climate.')) return false
    return toFiniteNumber(entity.attributes?.current_temperature) !== null
  })
  if (climate) {
    const num = toFiniteNumber(climate.attributes?.current_temperature)
    if (num !== null) {
      const unit = String(climate.attributes?.unit_of_measurement ?? '').trim()
      return { value: num.toFixed(1), unit: unit || DEFAULT_TEMP_UNIT }
    }
  }

  const sensor = findBoundEntity(list, lookup, (entityId, entity) => {
    if (!isTemperatureSensor(entityId, entity)) return false
    return toFiniteNumber(entity.state) !== null
  })
  if (sensor) {
    const num = toFiniteNumber(sensor.state)
    if (num !== null) {
      const unit = String(sensor.attributes?.unit_of_measurement ?? '').trim()
      return { value: num.toFixed(1), unit: unit || DEFAULT_TEMP_UNIT }
    }
  }

  return null
}

/**
 * 派生房间湿度（带 `%` 的展示文本）。
 *
 * 优先级：显式映射传感器 → 房间内湿度传感器 → 房间内空调 `current_humidity`。
 *
 * @param rows 房间绑定实体行
 * @param stats 该房间的传感器映射（`layout.mobileRoomStats[roomId]`）
 * @param lookup 注入的查询接口
 * @returns 形如 `56%` 的展示文本；无可用数据时返回 null
 */
export function readRoomHumidity(
  rows: RoomBoundEntityRow[] | null | undefined,
  stats: RoomStatSensors,
  lookup: RoomMetricsLookup,
): string | null {
  const list = Array.isArray(rows) ? rows : []

  const configured = readConfiguredSensor(stats, 'humidity', lookup)
  if (configured)
    return `${Math.round(Number.parseFloat(configured.value))}${configured.unit || '%'}`

  const sensor = findBoundEntity(list, lookup, (entityId, entity) => {
    if (!isHumiditySensor(entityId, entity)) return false
    return toFiniteNumber(entity.state) !== null
  })
  if (sensor) {
    const num = toFiniteNumber(sensor.state)
    if (num !== null) return `${Math.round(num)}%`
  }

  const climate = findBoundEntity(list, lookup, (entityId, entity) => {
    if (!entityId.startsWith('climate.')) return false
    return toFiniteNumber(entity.attributes?.current_humidity) !== null
  })
  if (climate) {
    const num = toFiniteNumber(climate.attributes?.current_humidity)
    if (num !== null) return `${Math.round(num)}%`
  }

  return null
}

/**
 * 统计房间内灯具开关数量（幽灵实体不计入）。
 *
 * @param rows 房间绑定实体行
 * @param lookup 注入的查询接口
 * @returns `{ on, total }`；`total === 0` 时调用方不应渲染开灯胶囊
 */
export function readRoomLightStats(
  rows: RoomBoundEntityRow[] | null | undefined,
  lookup: RoomMetricsLookup,
): RoomLightStats {
  const list = Array.isArray(rows) ? rows : []
  let on = 0
  let total = 0

  for (const row of list) {
    const entityId = String(row?.entityId ?? '').trim()
    if (!entityId.startsWith('light.')) continue
    lookup.getEntityRevision(entityId)
    if (!isEntityAlive(entityId, lookup.entities)) continue
    total += 1
    if (lookup.getEntity(entityId)?.state === 'on') on += 1
  }

  return { on, total }
}

/** 房间分类卡片 key（顺序即渲染顺序） */
export type RoomCategoryKey = 'lights' | 'climate' | 'media' | 'switch' | 'cover' | 'other'

/** 房间分类卡片数据 */
export interface RoomCategory {
  key: RoomCategoryKey
  /** 中文分类名 */
  label: string
  /** 该分类下存活实体 ID（保持房间绑定顺序） */
  entityIds: string[]
  /** 实体总数 */
  count: number
  /** 处于开启 / 运行态的实体数 */
  activeCount: number
  /** 是否有任一实体处于开启 / 运行态 */
  isActive: boolean
}

/** 分类定义：key → 中文名 + 命中域名 */
const CATEGORY_DEFS: Array<{ key: RoomCategoryKey; label: string; domains: Set<string> }> = [
  { key: 'lights', label: '灯光', domains: new Set(['light']) },
  { key: 'climate', label: '空调', domains: new Set(['climate']) },
  { key: 'media', label: '多媒体', domains: new Set(['media_player']) },
  { key: 'switch', label: '开关', domains: new Set(['switch', 'input_boolean', 'button']) },
  { key: 'cover', label: '窗帘', domains: new Set(['cover']) },
]

/** 解析实体域名（`domain.object_id` 的 domain 部分） */
function entityDomainOf(entityId: string): string {
  const idx = entityId.indexOf('.')
  return idx > 0 ? entityId.slice(0, idx) : ''
}

/**
 * 实体是否处于「开启 / 运行」态。
 *
 * 与全站既有判定保持一致：状态属于 on/open/playing/home/cooling/heating，
 * 或空调类实体状态不为 off。
 *
 * @param entity 实体快照
 * @param domain 实体域
 * @returns 是否活跃
 */
export function isRoomEntityActive(
  entity: RoomMetricEntityView | undefined,
  domain: string,
): boolean {
  if (!entity) return false
  const state = String(entity.state ?? '').toLowerCase()
  if (['on', 'open', 'playing', 'home', 'cooling', 'heating'].includes(state)) return true
  return domain === 'climate' && state !== '' && state !== 'off' && state !== 'unavailable'
}

/**
 * 把房间绑定实体归类为 6 类分类卡片数据（count === 0 的分类不返回）。
 *
 * @param rows 房间绑定实体行
 * @param lookup 注入的查询接口
 * @returns 分类卡片数组，顺序：灯光 / 空调 / 多媒体 / 开关 / 窗帘 / 其他
 */
export function buildRoomCategories(
  rows: RoomBoundEntityRow[] | null | undefined,
  lookup: RoomMetricsLookup,
): RoomCategory[] {
  const list = Array.isArray(rows) ? rows : []
  const buckets = new Map<RoomCategoryKey, string[]>()

  for (const row of list) {
    const entityId = String(row?.entityId ?? '').trim()
    if (!entityId) continue
    lookup.getEntityRevision(entityId)
    if (!isEntityAlive(entityId, lookup.entities)) continue
    const domain = entityDomainOf(entityId)
    const def = CATEGORY_DEFS.find((item) => item.domains.has(domain))
    const key: RoomCategoryKey = def?.key ?? 'other'
    const bucket = buckets.get(key)
    if (bucket) bucket.push(entityId)
    else buckets.set(key, [entityId])
  }

  const result: RoomCategory[] = []
  const orderedKeys: RoomCategoryKey[] = [
    'lights',
    'climate',
    'media',
    'switch',
    'cover',
    'other',
  ]

  for (const key of orderedKeys) {
    const entityIds = buckets.get(key)
    if (!entityIds?.length) continue
    const activeCount = entityIds.filter((entityId) =>
      isRoomEntityActive(lookup.getEntity(entityId), entityDomainOf(entityId)),
    ).length
    const def = CATEGORY_DEFS.find((item) => item.key === key)
    result.push({
      key,
      label: def?.label ?? '其他',
      entityIds,
      count: entityIds.length,
      activeCount,
      isActive: activeCount > 0,
    })
  }

  return result
}
