import { getEntityDisplayName } from '@/domain/entity/model/utils/derived.util'

/**
 * 天启（tianqi）气象站「生活指数」实体约定。
 * 实体 ID 形如 sensor.{station}_{suffix}，状态为等级文本，描述常在 *_des_s 属性。
 */

type LifeIndexTone = 'ok' | 'caution' | 'warn' | 'neutral'

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

const ALL_LIFE_INDEX_DEFS: LifeIndexDef[] = [...PRIMARY_LIFE_INDEX_DEFS, ...OPTIONAL_LIFE_INDEX_DEFS]

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

type EntityGetter = (eid: string) => { state?: unknown; attributes?: Record<string, unknown> } | undefined

function isUsable(state: unknown): boolean {
  return state !== undefined && state !== null && state !== 'unavailable' && state !== 'unknown'
}

/** weather.beijing → beijing */
function weatherStationCode(weatherEid: string): string {
  const m = String(weatherEid || '')
    .trim()
    .match(/^weather\.(.+)$/i)
  return m ? m[1] : ''
}

function lifeIndexEntityId(station: string, suffix: string): string {
  return `sensor.${station}_${suffix}`
}

function weatherWarningEntityId(station: string): string {
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
function readLifeIndexDescription(suffix: string, attrs: Record<string, unknown> | undefined): string {
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
    const unit = String(ent.attributes?.unit_of_measurement || '').trim() || meta.unit
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
export function resolveWeatherWarning(getEntity: EntityGetter, weatherEid: string): WeatherWarningSnapshot | null {
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

/** 日出日落时间解析与昼夜相位计算工具 */
interface SunTimes {
  sunrise: Date | null
  sunset: Date | null
}

/** 解析 HA next_rising/next_setting ISO 字符串为 Date；空或非法返回 null */
function parseSunIso(value: unknown): Date | null {
  if (value == null || value === '') return null
  const d = new Date(String(value))
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * 将 HA sun.sun 的 next_rising / next_setting 解析为「当日」日出、日落。
 * 白昼时 next_rising 为次日日出、next_setting 为当日日落，不可直接配对。
 */
export function resolveSunriseSunset(attrs: Record<string, unknown> | undefined): SunTimes {
  const nextRising = parseSunIso(attrs?.next_rising)
  const nextSetting = parseSunIso(attrs?.next_setting)
  if (!nextRising || !nextSetting) return { sunrise: null, sunset: null }

  const riseMs = nextRising.getTime()
  const setMs = nextSetting.getTime()

  if (riseMs <= setMs) {
    return { sunrise: nextRising, sunset: nextSetting }
  }

  return {
    sunrise: new Date(riseMs - 24 * 60 * 60 * 1000),
    sunset: nextSetting,
  }
}

export function computeSunProgress(sunrise: Date | null, sunset: Date | null, nowMs = Date.now()): number {
  if (!sunrise || !sunset) return 50
  const rise = sunrise.getTime()
  const set = sunset.getTime()
  if (set <= rise) return 50
  if (nowMs <= rise) return 0
  if (nowMs >= set) return 100
  return Math.round(((nowMs - rise) / (set - rise)) * 100)
}

/** 日照时长文案（形如「日照 13h25m」）；无数据或日落≤日出时返回空串 */
export function formatDaylightDuration(sunrise: Date | null, sunset: Date | null): string {
  if (!sunrise || !sunset) return ''
  const diff = sunset.getTime() - sunrise.getTime()
  if (diff <= 0) return ''
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  return `日照 ${h}h${m}m`
}

function formatDurationShort(ms: number): string {
  if (ms <= 0) return ''
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h${m}m` : `${m}m`
}

/** 距下一次日出/日落的倒计时文案（Hub 嵌入紧凑展示） */
export function formatSunCountdown(
  attrs: Record<string, unknown> | undefined,
  isDay: boolean,
  nowMs = Date.now(),
): string {
  const { sunrise, sunset } = resolveSunriseSunset(attrs)
  const target = isDay ? sunset : (parseSunIso(attrs?.next_rising) ?? sunrise)
  if (!target) return ''
  const diff = target.getTime() - nowMs
  if (diff <= 0) return isDay ? '已日落' : '已日出'
  const time = formatDurationShort(diff)
  return isDay ? `距日落 ${time}` : `距日出 ${time}`
}

/** 天气业务指标：体感温度、AQI 分级与传感器查找 */

/** 体感温度：优先实体属性，缺失时按热指数与风寒效应估算 */
export function computeFeelsLike(tempC: number, humidityPct: number, windMs: number): number {
  if (!Number.isFinite(tempC)) return tempC
  const hum = Number.isFinite(humidityPct) ? humidityPct : 50
  const wind = Number.isFinite(windMs) ? windMs : 0

  // 热指数（Rothfusz 回归，适用高温高湿）
  if (tempC >= 27 && hum >= 40) {
    const temperature = tempC
    const humidity = hum
    const heatIndex =
      -8.784694 +
      1.61139411 * temperature +
      2.338548838 * humidity +
      -0.14611605 * temperature * humidity +
      -0.012308094 * temperature * temperature +
      -0.016424828 * humidity * humidity +
      0.002211732 * temperature * temperature * humidity +
      0.00072546 * temperature * humidity * humidity +
      -0.000003582 * temperature * temperature * humidity * humidity
    return heatIndex
  }

  // 风寒效应（低温大风）
  if (tempC <= 10 && wind > 1.34) {
    const windKmh = wind * 3.6 // m/s -> km/h
    return 13.12 + 0.6215 * tempC - 11.37 * Math.pow(windKmh, 0.16) + 0.3965 * tempC * Math.pow(windKmh, 0.16)
  }

  return tempC
}

type WeatherEntityGetter = (eid: string) => { state?: unknown; attributes?: Record<string, unknown> } | undefined

function isUsableEntityState(state: unknown): boolean {
  return state !== undefined && state !== null && state !== 'unavailable' && state !== 'unknown'
}

/** 是否为 PM2.5 浓度传感器（绝不能当作 AQI 指数） */
function isPm25ConcentrationSensor(eid: string, entity?: { attributes?: Record<string, unknown> } | null): boolean {
  const id = eid.toLowerCase()
  if (id.includes('pm25') || id.includes('pm2_5') || id.includes('pm2.5') || id.includes('aqi_pm25')) {
    return true
  }
  const deviceClass = String(entity?.attributes?.device_class || '').toLowerCase()
  if (deviceClass === 'pm25') return true
  const unit = String(entity?.attributes?.unit_of_measurement || '').toLowerCase()
  // AQI 无浓度单位；µg/m³ 属于颗粒物浓度
  if (unit.includes('µg/m') || unit.includes('ug/m') || unit.includes('μg/m')) return true
  return false
}

/** 是否像室外 AQI 指数实体（约定 sensor.*_aqi） */
function isAqiIndexSensor(eid: string, entity?: { attributes?: Record<string, unknown> } | null): boolean {
  if (!eid.startsWith('sensor.')) return false
  if (isPm25ConcentrationSensor(eid, entity)) return false
  const id = eid.toLowerCase()
  if (id.endsWith('_aqi') || id.endsWith('_aqi_2')) return true
  const deviceClass = String(entity?.attributes?.device_class || '').toLowerCase()
  if (deviceClass === 'aqi') return true
  const name = getEntityDisplayName(eid, entity)
  if (name.includes('空气质量指数')) return true
  return false
}

/**
 * 室外 AQI：只认 `sensor.{城市名}_aqi`（及同类指数实体）。
 * 明确排除 PM2.5 浓度与 weather.attributes.aqi（tianqi 等集成里该属性常与 aqi_pm25 同值）。
 */
export function resolveAqiSensorId(
  getEntity: WeatherEntityGetter,
  weatherEid: string,
  sensorIds?: Iterable<string>,
): string {
  const locMatch = weatherEid.match(/^weather\.(.+)$/)
  const preferred: string[] = []
  if (locMatch) {
    preferred.push(`sensor.${locMatch[1]}_aqi`)
    preferred.push(`sensor.${locMatch[1]}_aqi_2`)
  }

  const tryId = (id: string): string => {
    const entity = getEntity(id)
    if (!entity || !isUsableEntityState(entity.state)) return ''
    if (!isAqiIndexSensor(id, entity)) return ''
    return id
  }

  for (const id of preferred) {
    const hit = tryId(id)
    if (hit) return hit
  }

  if (!sensorIds) return ''

  // 同前缀优先，再任意 *_aqi
  const prefix = locMatch ? `sensor.${locMatch[1]}_` : ''
  let fallback = ''
  for (const id of sensorIds) {
    if (!isAqiIndexSensor(id, getEntity(id))) continue
    if (!isUsableEntityState(getEntity(id)?.state)) continue
    if (prefix && id.startsWith(prefix)) return id
    if (!fallback) fallback = id
  }
  return fallback
}

/** 读取 AQI 数值；无可用实体或非法值时返回 null（绝不回退 PM2.5 / weather.attrs.aqi） */
export function readAqiNumber(
  getEntity: WeatherEntityGetter,
  weatherEid: string,
  sensorIds?: Iterable<string>,
): number | null {
  const eid = resolveAqiSensorId(getEntity, weatherEid, sensorIds)
  if (!eid) return null
  const raw = getEntity(eid)?.state
  const numericValue = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10)
  return Number.isFinite(numericValue) ? numericValue : null
}

/** 汇总可用于 AQI 发现的 sensor 实体 ID 列表 */
export function collectSensorEntityIds(opts: {
  sensorIndexIds?: Iterable<string> | null
  domainSensorIds?: Iterable<string> | null
  allEntityIds?: Iterable<string> | null
}): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (id: string) => {
    if (!id.startsWith('sensor.') || seen.has(id)) return
    seen.add(id)
    out.push(id)
  }
  for (const id of opts.sensorIndexIds || []) push(id)
  for (const id of opts.domainSensorIds || []) push(id)
  if (out.length === 0) {
    for (const id of opts.allEntityIds || []) push(id)
  }
  return out
}

/** 数值容错转换：非法值返回 fallback */
export function numOr(rawValue: unknown, fallback: number): number {
  const numericValue = Number(rawValue)
  return Number.isFinite(numericValue) ? numericValue : fallback
}

/** 风速归一化为 m/s（支持 km/h / mph / 节） */
export function normalizeWindSpeedMs(speed?: number, unit?: string): number {
  if (speed == null || Number.isNaN(speed)) return 0
  const normalizedUnit = String(unit || 'm/s').toLowerCase()
  if (normalizedUnit.includes('km')) return speed / 3.6
  if (normalizedUnit.includes('mph')) return speed * 0.447
  if (normalizedUnit.includes('kn')) return speed * 0.514
  return speed
}
