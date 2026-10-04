/**
 * 户型图传感器徽章：按读数阈值着色（系统预设，无需配置）
 *
 * 职责：
 * - 覆盖温湿度、空气质量、照度、气压、噪声、电量等常见 HA sensor 的阈值配色。
 * - 提供传感器量纲识别（按 device_class / 实体 id / 单位推断 SensorReadingKind）。
 * - 提供读数 → 语义色的阈值查色函数，供户型图徽章按读数着色。
 *
 * 依赖：无外部依赖，纯静态色阶与纯函数。
 *
 * 注意：
 * - `SensorReadingKind`（temperature / humidity / pm25 ...）为量纲标识符，不翻译。
 * - `device_class`（battery / pm25 ...）为 HA 属性值，不翻译。
 * - 色阶 value 为 CSS HEX 颜色值，不翻译。
 */

export type SensorReadingKind =
  | 'temperature'
  | 'humidity'
  | 'pm25'
  | 'pm10'
  | 'co2'
  | 'tvoc'
  | 'formaldehyde'
  | 'aqi'
  | 'illuminance'
  | 'pressure'
  | 'noise'
  | 'battery'
  | 'carbon_monoxide'

/** HA 实体属性子集（仅取着色识别所需字段） */
type EntityAttrs = {
  device_class?: string
  unit_of_measurement?: string
  [key: string]: unknown
}

/** HA 实体最小结构（state + attributes），用于着色推断 */
type EntityLike = {
  state?: string
  attributes?: EntityAttrs
}

/** 通用色阶：优 → 差（绿 → 紫） */
const TIER = {
  ideal: '#34C759',
  good: '#7AE582',
  mild: '#FFCC00',
  warn: '#FF9500',
  high: '#FF6B00',
  bad: '#FF3B30',
  extreme: '#AF52DE',
} as const

/**
 * 把实体 ID、device_class、单位拼接为小写文本，用于别名匹配。
 *
 * @param entityId - HA 实体 ID。
 * @param entity - 实体对象（可选）。
 * @returns 拼接后的小写字符串（空格分隔）。
 */
function haystack(entityId: string, entity?: EntityLike | null): string {
  const attrs = entity?.attributes || {}
  return [
    entityId,
    attrs.device_class,
    attrs.unit_of_measurement,
  ]
    .map((s) => String(s || '').toLowerCase())
    .join(' ')
}

/** 识别传感器量纲（device_class / 实体 id / 单位） */
export function detectSensorReadingKind(
  entityId: string | null | undefined,
  entity?: EntityLike | null,
): SensorReadingKind | null {
  if (!entityId) return null
  const id = entityId.toLowerCase()
  const deviceClass = String(entity?.attributes?.device_class || '').toLowerCase()
  const unit = String(entity?.attributes?.unit_of_measurement || '').toLowerCase()
  const hay = haystack(entityId, entity)

  if (deviceClass === 'battery' || id.includes('battery') || id.includes('电量')) return 'battery'

  if (
    deviceClass === 'pm25' ||
    id.includes('pm25') ||
    id.includes('pm2.5') ||
    id.includes('pm_2_5') ||
    id.includes('pm2_5')
  )
    return 'pm25'

  if (deviceClass === 'pm10' || id.includes('pm10') || id.includes('pm_10') || id.includes('pm1_0'))
    return 'pm10'

  if (
    deviceClass === 'carbon_dioxide' ||
    id.includes('co2') ||
    id.includes('carbon_dioxide') ||
    id.includes('二氧化碳') ||
    unit === 'ppm' && (id.includes('co2') || hay.includes('carbon_dioxide'))
  )
    return 'co2'

  if (
    deviceClass === 'carbon_monoxide' ||
    id.includes('carbon_monoxide') ||
    /(?:^|_)co(?:$|_)/.test(id) ||
    id.includes('一氧化碳')
  )
    return 'carbon_monoxide'

  if (
    deviceClass === 'volatile_organic_compounds' ||
    id.includes('tvoc') ||
    id.includes('voc') ||
    id.includes('有机物')
  )
    return 'tvoc'

  if (
    id.includes('formaldehyde') ||
    id.includes('hcho') ||
    id.includes('甲醛') ||
    deviceClass === 'volatile_organic_compounds_parts' && id.includes('hcho')
  )
    return 'formaldehyde'

  if (deviceClass === 'aqi' || id.includes('aqi') || id.includes('空气质量指数')) return 'aqi'

  if (
    deviceClass === 'illuminance' ||
    id.includes('illuminance') ||
    id.includes('illumination') ||
    id.includes('lux') ||
    id.includes('亮度') ||
    id.includes('照度') ||
    unit === 'lx' ||
    unit === 'lux'
  )
    return 'illuminance'

  if (
    deviceClass === 'pressure' ||
    id.includes('pressure') ||
    id.includes('气压') ||
    unit === 'hpa' ||
    unit === 'mbar' ||
    unit === 'kpa'
  )
    return 'pressure'

  if (
    deviceClass === 'sound_pressure' ||
    id.includes('noise') ||
    id.includes('sound') ||
    id.includes('噪声') ||
    id.includes('分贝') ||
    unit === 'db' ||
    unit === 'dba' ||
    unit === 'db(a)'
  )
    return 'noise'

  if (
    deviceClass === 'humidity' ||
    id.includes('humidity') ||
    id.includes('湿度') ||
    unit.includes('%rh') ||
    unit === '% rh'
  )
    return 'humidity'

  if (
    deviceClass === 'temperature' ||
    id.includes('temperature') ||
    id.includes('温度') ||
    /(?:^|_)temp(?:$|_)/.test(id) ||
    unit === '°c' ||
    unit === '℃' ||
    unit === 'c' ||
    unit === '°f' ||
    unit === '℉'
  )
    return 'temperature'

  // 单位兜底：避免把电池 % 当成湿度（电量已在前面返回）
  if (unit === 'ppm' && (id.includes('co') || hay.includes('dioxide'))) return 'co2'
  if (unit.includes('µg/m') || unit.includes('ug/m') || unit.includes('μg/m')) {
    if (id.includes('pm10')) return 'pm10'
    return 'pm25'
  }

  return null
}

/**
 * 把华氏度转换为摄氏度；非华氏单位原样返回。
 *
 * @param value - 原始读数。
 * @param unit - 单位字符串；包含 `f` 时按华氏转摄氏。
 * @returns 摄氏度数值。
 */
function toCelsius(value: number, unit?: string | null): number {
  const u = String(unit || '').toLowerCase()
  if (u.includes('f')) return ((value - 32) * 5) / 9
  return value
}

/**
 * 把气压读数统一为 hPa（百帕）。
 *
 * @param value - 原始读数。
 * @param unit - 单位字符串；kPa × 10，mbar / mb 原样。
 * @returns hPa 数值。
 */
function toHpa(value: number, unit?: string | null): number {
  const u = String(unit || '').toLowerCase()
  if (u === 'kpa') return value * 10
  if (u === 'mbar' || u === 'mb') return value
  return value
}

/** 甲醛常见单位统一为 µg/m³ 近似（mg/m³ × 1000；ppb 粗略按 ×1.2） */
function toFormaldehydeUgm3(value: number, unit?: string | null): number {
  const u = String(unit || '').toLowerCase()
  if (u.includes('mg')) return value * 1000
  if (u.includes('ppb')) return value * 1.23
  return value
}

/**
 * 根据传感器量纲与读数查色。
 *
 * 内部会按量纲做单位换算（如华氏 → 摄氏、kPa → hPa），再按阈值返回色阶颜色。
 *
 * @param kind - 传感器量纲；为空时返回 null。
 * @param raw - 原始读数；非有限数时返回 null。
 * @param opts - 可选参数，`unit` 用于单位换算。
 * @returns CSS HEX 颜色字符串；无法判定时返回 null。
 */
function sensorReadingColor(
  kind: SensorReadingKind | null | undefined,
  raw: number | null | undefined,
  opts?: { unit?: string | null },
): string | null {
  if (!kind || raw == null || !Number.isFinite(raw)) return null
  const unit = opts?.unit

  if (kind === 'temperature') {
    const v = toCelsius(raw, unit)
    if (v >= 38) return TIER.extreme
    if (v >= 35) return TIER.bad
    if (v >= 32) return TIER.high
    if (v >= 28) return TIER.warn
    if (v >= 26) return TIER.mild
    if (v >= 24) return '#A8E063'
    if (v >= 20) return TIER.ideal
    if (v >= 18) return TIER.good
    if (v >= 16) return '#5AC8FA'
    if (v >= 12) return '#0A84FF'
    if (v >= 8) return '#007AFF'
    if (v >= 0) return '#5856D6'
    return TIER.extreme
  }

  if (kind === 'humidity') {
    const v = raw
    if (v >= 45 && v <= 55) return TIER.ideal
    if ((v >= 40 && v < 45) || (v > 55 && v <= 60)) return TIER.good
    if ((v >= 35 && v < 40) || (v > 60 && v <= 65)) return TIER.mild
    if ((v >= 30 && v < 35) || (v > 65 && v <= 70)) return TIER.warn
    if ((v >= 25 && v < 30) || (v > 70 && v <= 80)) return TIER.high
    return TIER.bad
  }

  if (kind === 'pm25') {
    const v = raw
    if (v <= 12) return TIER.ideal
    if (v <= 25) return TIER.good
    if (v <= 35) return TIER.mild
    if (v <= 55) return TIER.warn
    if (v <= 75) return TIER.high
    if (v <= 115) return TIER.bad
    return TIER.extreme
  }

  if (kind === 'pm10') {
    const v = raw
    if (v <= 20) return TIER.ideal
    if (v <= 40) return TIER.good
    if (v <= 50) return TIER.mild
    if (v <= 100) return TIER.warn
    if (v <= 150) return TIER.high
    if (v <= 250) return TIER.bad
    return TIER.extreme
  }

  if (kind === 'co2') {
    const v = raw
    if (v <= 600) return TIER.ideal
    if (v <= 800) return TIER.good
    if (v <= 1000) return TIER.mild
    if (v <= 1200) return TIER.warn
    if (v <= 1500) return TIER.high
    if (v <= 2000) return TIER.bad
    return TIER.extreme
  }

  if (kind === 'tvoc') {
    const v = raw
    if (v <= 200) return TIER.ideal
    if (v <= 400) return TIER.good
    if (v <= 600) return TIER.mild
    if (v <= 1000) return TIER.warn
    if (v <= 2000) return TIER.high
    if (v <= 3000) return TIER.bad
    return TIER.extreme
  }

  if (kind === 'formaldehyde') {
    const v = toFormaldehydeUgm3(raw, unit)
    // 国标参考约 80 µg/m³（0.08 mg/m³）
    if (v <= 30) return TIER.ideal
    if (v <= 50) return TIER.good
    if (v <= 80) return TIER.mild
    if (v <= 120) return TIER.warn
    if (v <= 200) return TIER.high
    return TIER.bad
  }

  if (kind === 'aqi') {
    const v = raw
    if (v <= 50) return TIER.ideal
    if (v <= 100) return TIER.good
    if (v <= 150) return TIER.mild
    if (v <= 200) return TIER.warn
    if (v <= 300) return TIER.high
    return TIER.bad
  }

  if (kind === 'illuminance') {
    const v = raw
    if (v <= 5) return '#5856D6'
    if (v <= 50) return '#0A84FF'
    if (v <= 200) return '#5AC8FA'
    if (v <= 500) return TIER.ideal
    if (v <= 1000) return TIER.good
    if (v <= 5000) return TIER.mild
    if (v <= 20000) return TIER.warn
    return TIER.high
  }

  if (kind === 'pressure') {
    const v = toHpa(raw, unit)
    const diff = Math.abs(v - 1013)
    if (diff <= 5) return TIER.ideal
    if (diff <= 10) return TIER.good
    if (diff <= 20) return TIER.mild
    if (diff <= 30) return TIER.warn
    return TIER.high
  }

  if (kind === 'noise') {
    const v = raw
    if (v <= 35) return TIER.ideal
    if (v <= 45) return TIER.good
    if (v <= 55) return TIER.mild
    if (v <= 65) return TIER.warn
    if (v <= 75) return TIER.high
    return TIER.bad
  }

  if (kind === 'battery') {
    const v = raw
    if (v >= 80) return TIER.ideal
    if (v >= 50) return TIER.good
    if (v >= 30) return TIER.mild
    if (v >= 20) return TIER.warn
    if (v >= 10) return TIER.high
    return TIER.bad
  }

  if (kind === 'carbon_monoxide') {
    // ppm
    const v = raw
    if (v <= 1) return TIER.ideal
    if (v <= 9) return TIER.good
    if (v <= 25) return TIER.mild
    if (v <= 50) return TIER.warn
    if (v <= 100) return TIER.high
    return TIER.bad
  }

  return null
}

/** 解析实体读数颜色（户型图徽章入口） */
export function resolveSensorReadingColor(
  entityId: string | null | undefined,
  state: string | null | undefined,
  entity?: EntityLike | null,
): string | null {
  const numeric = parseFloat(String(state ?? ''))
  if (!Number.isFinite(numeric)) return null
  const kind = detectSensorReadingKind(entityId, entity)
  return sensorReadingColor(kind, numeric, {
    unit: entity?.attributes?.unit_of_measurement as string | undefined,
  })
}
