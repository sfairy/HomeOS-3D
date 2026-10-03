/**
 * 天启（tianqi）气象站「生活指数」实体约定。
 * 实体 ID 形如 sensor.{station}_{suffix}，状态为等级文本，描述常在 *_des_s 属性。
 */

type LifeIndexTone = 'ok' | 'caution' | 'warn' | 'neutral'

/** LifeIndexDef：类型定义，字段语义见声明。 */
export type LifeIndexDef = {
  /** HA 实体后缀（sensor.{station}_{suffix}） */
  suffix: string
  /** 展示名 */
  label: string
  /** 是否为集成默认启用的生活指数 */
  primary: boolean
  /** 分组：出行 / 健康 / 居家 / 休闲 */
  group: 'out' | 'health' | 'home' | 'leisure'
}

/** 默认启用的 14 个生活指数（见 tianqi 实体清单） */
const PRIMARY_LIFE_INDEX_DEFS: LifeIndexDef[] = [
  { suffix: 'clothing', label: '穿衣', primary: true, group: 'home' },
  { suffix: 'uv', label: '紫外线', primary: true, group: 'out' },
  { suffix: 'cold', label: '感冒', primary: true, group: 'health' },
  { suffix: 'car_wash', label: '洗车', primary: true, group: 'home' },
  { suffix: 'sport', label: '运动', primary: true, group: 'out' },
  { suffix: 'comfort', label: '舒适度', primary: true, group: 'home' },
  { suffix: 'air_conditioner', label: '空调', primary: true, group: 'home' },
  { suffix: 'allergy', label: '过敏', primary: true, group: 'health' },
  { suffix: 'sunscreen', label: '防晒', primary: true, group: 'out' },
  { suffix: 'umbrella', label: '雨伞', primary: true, group: 'out' },
  { suffix: 'drying', label: '晾晒', primary: true, group: 'home' },
  { suffix: 'morning_exercise', label: '晨练', primary: true, group: 'out' },
  { suffix: 'travel', label: '旅游', primary: true, group: 'leisure' },
  { suffix: 'heatstroke', label: '中暑', primary: true, group: 'health' },
]

/** 默认禁用的冷门生活指数（启用后自动展示） */
const OPTIONAL_LIFE_INDEX_DEFS: LifeIndexDef[] = [
  { suffix: 'road_condition', label: '路况', primary: false, group: 'out' },
  { suffix: 'shopping', label: '逛街', primary: false, group: 'leisure' },
  { suffix: 'beer', label: '啤酒', primary: false, group: 'leisure' },
  { suffix: 'boating', label: '划船', primary: false, group: 'leisure' },
  { suffix: 'sunglasses', label: '太阳镜', primary: false, group: 'out' },
  { suffix: 'wind_chill', label: '风寒', primary: false, group: 'health' },
  { suffix: 'kite_flying', label: '放风筝', primary: false, group: 'leisure' },
  { suffix: 'fishing', label: '钓鱼', primary: false, group: 'leisure' },
  { suffix: 'nightlife', label: '夜生活', primary: false, group: 'leisure' },
  { suffix: 'mood', label: '心情', primary: false, group: 'leisure' },
  { suffix: 'dating', label: '约会', primary: false, group: 'leisure' },
  { suffix: 'hairstyle', label: '美发', primary: false, group: 'home' },
  { suffix: 'makeup', label: '化妆', primary: false, group: 'home' },
  { suffix: 'traffic', label: '交通', primary: false, group: 'out' },
  { suffix: 'dryness', label: '干燥', primary: false, group: 'health' },
  { suffix: 'pollution_diffusion', label: '污染扩散', primary: false, group: 'health' },
]

const ALL_LIFE_INDEX_DEFS: LifeIndexDef[] = [
  ...PRIMARY_LIFE_INDEX_DEFS,
  ...OPTIONAL_LIFE_INDEX_DEFS,
]

/** 与气象站同前缀的实况 / 预警实体后缀（用于侧栏与冷实体补全） */
const WEATHER_STATION_LIVE_SUFFIXES = [
  'temperature',
  'humidity',
  'atmospheric_pressure',
  'precipitation',
  'precipitation_24h',
  'pm25',
  'visibility',
  'wind_speed',
  'forecast_minutely',
  'aqi',
  'weather',
  'update_time',
  'limit_number',
] as const

/** LifeIndexItem：类型定义，字段语义见声明。 */
export type LifeIndexItem = {
  entityId: string
  suffix: string
  label: string
  state: string
  description: string
  tone: LifeIndexTone
  primary: boolean
  group: LifeIndexDef['group']
  friendlyName: string
}

type WeatherStationLiveMetric = {
  key: string
  label: string
  entityId: string
  value: string
  unit: string
}

type EntityGetter = (
  eid: string,
) => { state?: unknown; attributes?: Record<string, unknown> } | undefined

function isUsable(state: unknown): boolean {
  return state !== undefined && state !== null && state !== 'unavailable' && state !== 'unknown'
}

/** weather.beijing → beijing */
export function weatherStationCode(weatherEid: string): string {
  const m = String(weatherEid || '')
    .trim()
    .match(/^weather\.(.+)$/i)
  return m ? m[1] : ''
}

function lifeIndexEntityId(station: string, suffix: string): string {
  return `sensor.${station}_${suffix}`
}

/** weatherWarningEntityId：函数，按签名入参返回处理结果。 */
export function weatherWarningEntityId(station: string): string {
  return `binary_sensor.${station}_warning`
}

/**
 * 根据气象站前缀生成需要 eager ensure 的实体 ID 列表。
 * 仅含 weather / 预警 / 实况后缀 / 默认启用的生活指数；冷门可选指数见 collectOptionalLifeIndexEntityIds。
 */
export function collectWeatherStationEntityIds(weatherEid: string): string[] {
  const station = weatherStationCode(weatherEid)
  if (!station) return weatherEid ? [weatherEid] : []
  const ids = [weatherEid, weatherWarningEntityId(station)]
  for (const suffix of WEATHER_STATION_LIVE_SUFFIXES) {
    ids.push(lifeIndexEntityId(station, suffix))
  }
  for (const def of PRIMARY_LIFE_INDEX_DEFS) {
    ids.push(lifeIndexEntityId(station, def.suffix))
  }
  return ids
}

/** 冷门可选生活指数 ID（HA 默认禁用；批量探测后启用者自动展示） */
export function collectOptionalLifeIndexEntityIds(weatherEid: string): string[] {
  const station = weatherStationCode(weatherEid)
  if (!station) return []
  return OPTIONAL_LIFE_INDEX_DEFS.map((def) => lifeIndexEntityId(station, def.suffix))
}

/** 读取生活指数描述：优先 {suffix}_des_s，再常见 fallback */
function readLifeIndexDescription(
  suffix: string,
  attrs: Record<string, unknown> | undefined,
): string {
  if (!attrs) return ''
  const preferredKeys = [`${suffix}_des_s`, `${suffix}_des`, 'des_s', 'des', 'description', 'detail']
  for (const key of preferredKeys) {
    const v = attrs[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  for (const [key, v] of Object.entries(attrs)) {
    if (!key.endsWith('_des_s') && !key.endsWith('_des')) continue
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

/**
 * 等级文本 → 语气：适宜/少发偏绿，不宜/易发/极强偏警示。
 */
function lifeIndexTone(state: string): LifeIndexTone {
  const s = String(state || '').trim()
  if (!s) return 'neutral'
  if (/不宜|不适宜|极强|很强|极易|易发|较易发|炎热|严寒|差|危险|高发/.test(s)) return 'warn'
  if (/较不|部分|较强|易|偏|注意|需|谨慎|中等|一般/.test(s)) return 'caution'
  if (/适宜|较适宜|少发|不易|不带|优|良|舒适|开启/.test(s)) return 'ok'
  return 'neutral'
}

/** resolveLifeIndexItems：函数，按签名入参返回处理结果。 */
export function resolveLifeIndexItems(
  getEntity: EntityGetter,
  weatherEid: string,
  opts?: { includeOptionalEmpty?: boolean },
): LifeIndexItem[] {
  const station = weatherStationCode(weatherEid)
  if (!station) return []
  const includeOptionalEmpty = opts?.includeOptionalEmpty === true
  const items: LifeIndexItem[] = []

  for (const def of ALL_LIFE_INDEX_DEFS) {
    const entityId = lifeIndexEntityId(station, def.suffix)
    const ent = getEntity(entityId)
    const rawState = ent?.state
    if (!isUsable(rawState)) {
      if (includeOptionalEmpty && def.primary) {
        items.push({
          entityId,
          suffix: def.suffix,
          label: def.label,
          state: '—',
          description: '',
          tone: 'neutral',
          primary: def.primary,
          group: def.group,
          friendlyName: def.label,
        })
      }
      continue
    }
    const state = String(rawState).trim() || '—'
    const attrs = ent?.attributes || {}
    const friendlyName = String(attrs.friendly_name || '').trim() || def.label
    items.push({
      entityId,
      suffix: def.suffix,
      label: def.label,
      state,
      description: readLifeIndexDescription(def.suffix, attrs),
      tone: lifeIndexTone(state),
      primary: def.primary,
      group: def.group,
      friendlyName,
    })
  }
  return items
}

const LIVE_METRIC_LABELS: Record<string, { label: string; unit: string }> = {
  temperature: { label: '室外温度', unit: '°C' },
  humidity: { label: '湿度', unit: '%' },
  aqi: { label: 'AQI', unit: '' },
  pm25: { label: 'PM2.5', unit: 'µg/m³' },
  weather: { label: '天气', unit: '' },
  precipitation: { label: '降水', unit: 'mm' },
  wind_speed: { label: '风速', unit: 'km/h' },
  visibility: { label: '能见度', unit: 'km' },
  atmospheric_pressure: { label: '气压', unit: 'hPa' },
}

/** 侧栏实况快览（有实体才返回） */
export function resolveWeatherStationLiveMetrics(
  getEntity: EntityGetter,
  weatherEid: string,
): WeatherStationLiveMetric[] {
  const station = weatherStationCode(weatherEid)
  if (!station) return []
  const out: WeatherStationLiveMetric[] = []
  for (const key of Object.keys(LIVE_METRIC_LABELS)) {
    const entityId = lifeIndexEntityId(station, key)
    const ent = getEntity(entityId)
    if (!ent || !isUsable(ent.state)) continue
    const meta = LIVE_METRIC_LABELS[key]
    const unit =
      String(ent.attributes?.unit_of_measurement || '').trim() || meta.unit
    out.push({
      key,
      label: meta.label,
      entityId,
      value: String(ent.state).trim(),
      unit,
    })
  }
  return out
}

type WeatherWarningSnapshot = {
  entityId: string
  active: boolean
  title: string
  details: string[]
}

/** binary_sensor.{station}_warning：state on + title / alarms */
export function resolveWeatherWarning(
  getEntity: EntityGetter,
  weatherEid: string,
): WeatherWarningSnapshot | null {
  const station = weatherStationCode(weatherEid)
  if (!station) return null
  const entityId = weatherWarningEntityId(station)
  const ent = getEntity(entityId)
  if (!ent || !isUsable(ent.state)) return null
  const attrs = ent.attributes || {}
  const active = String(ent.state).toLowerCase() === 'on'
  const title = String(attrs.title || attrs.friendly_name || '天气预警').trim()
  const details: string[] = []
  const alarms = attrs.alarms
  if (Array.isArray(alarms)) {
    for (const row of alarms) {
      if (typeof row === 'string' && row.trim()) {
        details.push(row.trim())
        continue
      }
      if (row && typeof row === 'object') {
        const o = row as Record<string, unknown>
        const text = String(o.title || o.event || o.description || o.text || '').trim()
        if (text) details.push(text)
      }
    }
  } else if (typeof alarms === 'string' && alarms.trim()) {
    details.push(alarms.trim())
  }
  return { entityId, active, title, details }
}

/** lifeIndexGroupLabel：函数，按签名入参返回处理结果。 */
export function lifeIndexGroupLabel(group: LifeIndexDef['group']): string {
  switch (group) {
    case 'out':
      return '出行'
    case 'health':
      return '健康'
    case 'home':
      return '居家'
    case 'leisure':
      return '休闲'
    default:
      return '其他'
  }
}

