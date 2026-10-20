/** 天气业务指标：体感温度、AQI 分级与传感器查找 */
import { getEntityDisplayName } from '@/shared/entity/utils/derived.util'

/** 体感温度：优先实体属性，缺失时按热指数与风寒效应估算 */
export function computeFeelsLike(
  tempC: number,
  humidityPct: number,
  windMs: number,
): number {
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

type WeatherEntityGetter = (
  eid: string,
) => { state?: unknown; attributes?: Record<string, unknown> } | undefined

function isUsableEntityState(state: unknown): boolean {
  return state !== undefined && state !== null && state !== 'unavailable' && state !== 'unknown'
}

/** 是否为 PM2.5 浓度传感器（绝不能当作 AQI 指数） */
function isPm25ConcentrationSensor(
  eid: string,
  entity?: { attributes?: Record<string, unknown> } | null,
): boolean {
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
function isAqiIndexSensor(
  eid: string,
  entity?: { attributes?: Record<string, unknown> } | null,
): boolean {
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
