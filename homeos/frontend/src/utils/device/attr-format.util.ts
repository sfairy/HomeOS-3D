/**
 * 实体属性值友好格式化工具
 *
 * 职责：
 * - 把 HA 实体属性值格式化为面向用户的展示文本。
 * - 覆盖枚举中文、数组、时间戳、百分比、时长、计量单位（温度 / 湿度 / 气压 / 风速 / 照度 / 空气质量等）。
 * - 维护需计量单位化的属性 key 集合，避免裸数值展示。
 *
 * 依赖：@/utils/format/locale-format.util 的本地化格式化。
 *
 * 注意：
 * - 属性 key（temperature / current_temperature / pm25 / ...）为 HA 属性名，不翻译。
 * - 单位（°C / % / hPa / lux / μg/m³ / ...）为计量单位，不翻译。
 * - 仅面向用户的展示文案使用简体中文。
 */
import { HVAC_MODE_LABELS as CLIMATE_HVAC_MODE_LABELS } from '@/constants/climate-labels'
import { formatLocaleString } from '@/utils/format/locale-format.util'

const MEASUREMENT_ATTR_KEYS = new Set([
  'temperature',
  'current_temperature',
  'target_temp_high',
  'target_temp_low',
  'target_temperature',
  'target_humidity',
  'humidity',
  'current_humidity',
  'current_temp',
  'dew_point',
  'apparent_temperature',
  'pressure',
  'wind_speed',
  'precipitation',
  'visibility',
  'illuminance',
  'co2',
  'pm25',
  'pm2_5',
  'voc',
  'aqi',
  'ozone',
  'energy',
  'power',
  'voltage',
  'current',
  'gas',
  'water',
  'cleaned_area',
  'gps_accuracy',
])

const PERCENT_ATTR_KEYS = new Set([
  'battery_level',
  'percentage',
  'current_position',
  'current_tilt_position',
  'position',
  'tilt_position',
  'filter_life',
  'brightness_pct',
  'cloud_coverage',
  'max_percentage',
  'min_percentage',
])

const DURATION_SEC_KEYS = new Set([
  'media_duration',
  'media_position',
  'duration',
  'remaining',
  'remaining_time',
  'cleaning_time',
  'timer_remaining',
  'transition',
  'filter_hours_used',
])

const DEGREE_ATTR_KEYS = new Set([
  'elevation',
  'azimuth',
  'wind_bearing',
  'heading',
  'course',
  'bearing',
])

const TIME_KEY_RE =
  /(^|_)(time|timestamp|epoch|ts|datetime)$|(^|_)(last|next|update|create|current)_(time|at|timestamp)$|_at$|^time$|时间|时间戳|时刻|^(next_dawn|next_dusk|next_midnight|next_noon|next_rising|next_setting|rising|setting|last_changed|last_updated|last_triggered|last_seen)$/i

const FLAG_KEY_RE =
  /(flag|mark|enabled|active|locked|armed|detected|occupied|available|muted|charging|restored|editable|assumed_state|face|battery_low|识别|标记|使能|开关)$|(^|_)(is|has|can|allow|enable)_/i

const FULL_DATETIME_OPTS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
}

const COMPASS_8 = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'] as const

/** HVAC / 运行模式（气候控件核心 + 属性展示扩展） */
const HVAC_MODE_LABELS: Record<string, string> = {
  ...CLIMATE_HVAC_MODE_LABELS,
  heat_cool: '冷暖',
}

const HVAC_ACTION_LABELS: Record<string, string> = {
  off: '关闭',
  idle: '待机',
  heating: '制热中',
  cooling: '制冷中',
  drying: '除湿中',
  fan: '送风中',
  defrosting: '除霜中',
}

const FAN_MODE_LABELS: Record<string, string> = {
  auto: '自动',
  low: '低',
  medium: '中',
  high: '高',
  top: '强劲',
  middle: '中',
  quiet: '静音',
  silent: '静音',
  min: '最低',
  max: '最高',
  soft: '轻柔',
  gentle: '轻柔',
  standard: '标准',
  balanced: '标准',
  strong: '强力',
  turbo: '强力',
  mop: '拖地',
  off: '关闭',
}

const PRESET_MODE_LABELS: Record<string, string> = {
  activity: '活动',
  anti_freeze: '防冻',
  away: '离家',
  boost: '强力',
  comfort: '舒适',
  eco: '节能',
  home: '在家',
  none: '无',
  sleep: '睡眠',
}

const SWING_MODE_LABELS: Record<string, string> = {
  off: '关',
  on: '开',
  vertical: '上下',
  horizontal: '左右',
  both: '全开',
}

const COLOR_MODE_LABELS: Record<string, string> = {
  onoff: '开关',
  brightness: '亮度',
  color_temp: '色温',
  hs: '色相饱和度',
  xy: 'XY 色域',
  rgb: 'RGB',
  rgbw: 'RGBW',
  rgbww: 'RGBWW',
  white: '白光',
  unknown: '未知',
}

const DEVICE_CLASS_LABELS: Record<string, string> = {
  temperature: '温度',
  humidity: '湿度',
  pressure: '气压',
  illuminance: '照度',
  carbon_dioxide: '二氧化碳',
  pm25: 'PM2.5',
  pm2_5: 'PM2.5',
  volatile_organic_compounds: 'VOC',
  battery: '电池',
  power: '功率',
  energy: '电量',
  voltage: '电压',
  current: '电流',
  gas: '燃气',
  moisture: '潮湿',
  motion: '移动',
  occupancy: '占用',
  presence: '存在',
  opening: '开合',
  door: '门',
  window: '窗',
  garage_door: '车库门',
  smoke: '烟雾',
  carbon_monoxide: '一氧化碳',
  problem: '故障',
  safety: '安全',
  connectivity: '连接',
  plug: '插座',
  running: '运行',
  update: '更新',
  timestamp: '时间戳',
  date: '日期',
  enum: '枚举',
  measurement: '测量',
  total: '累计',
  total_increasing: '累计递增',
  duration: '时长',
  distance: '距离',
  speed: '速度',
  weight: '重量',
  volume: '体积',
  water: '水',
  precipitation: '降水',
  wind_speed: '风速',
  aqi: '空气质量',
  ph: '酸碱度',
  signal_strength: '信号强度',
  monetary: '货币',
  data_rate: '数据速率',
  data_size: '数据大小',
  diagnostic: '诊断',
  config: '配置',
}

const STATE_CLASS_LABELS: Record<string, string> = {
  measurement: '瞬时测量',
  total: '累计',
  total_increasing: '累计递增',
}

const ENTITY_CATEGORY_LABELS: Record<string, string> = {
  config: '配置',
  diagnostic: '诊断',
}

const DIRECTION_LABELS: Record<string, string> = {
  forward: '正向',
  reverse: '反向',
}

const REPEAT_LABELS: Record<string, string> = {
  off: '关闭',
  all: '全部循环',
  one: '单曲循环',
}

const STATUS_VALUE_LABELS: Record<string, string> = {
  on: '开启',
  off: '关闭',
  open: '打开',
  closed: '关闭',
  opening: '打开中',
  closing: '关闭中',
  idle: '空闲',
  active: '活动',
  paused: '已暂停',
  playing: '播放中',
  buffering: '缓冲中',
  unavailable: '不可用',
  unknown: '未知',
  home: '在家',
  not_home: '离家',
  locked: '已锁定',
  unlocked: '已解锁',
  locking: '锁定中',
  unlocking: '解锁中',
  jammed: '卡住',
  cleaning: '清扫中',
  docked: '回充中',
  returning: '返回中',
  error: '错误',
}

/** 按属性 key 选择枚举表 */
const ENUM_BY_KEY: Record<string, Record<string, string>> = {
  hvac_mode: HVAC_MODE_LABELS,
  hvac_modes: HVAC_MODE_LABELS,
  hvac_action: HVAC_ACTION_LABELS,
  hvac_state: HVAC_MODE_LABELS,
  fan_mode: FAN_MODE_LABELS,
  fan_modes: FAN_MODE_LABELS,
  fan_speed: FAN_MODE_LABELS,
  fan_speed_list: FAN_MODE_LABELS,
  preset_mode: PRESET_MODE_LABELS,
  preset_modes: PRESET_MODE_LABELS,
  swing_mode: SWING_MODE_LABELS,
  swing_modes: SWING_MODE_LABELS,
  operation_mode: { ...HVAC_MODE_LABELS, ...PRESET_MODE_LABELS },
  operation_list: { ...HVAC_MODE_LABELS, ...PRESET_MODE_LABELS },
  available_modes: { ...HVAC_MODE_LABELS, ...PRESET_MODE_LABELS },
  color_mode: COLOR_MODE_LABELS,
  supported_color_modes: COLOR_MODE_LABELS,
  device_class: DEVICE_CLASS_LABELS,
  state_class: STATE_CLASS_LABELS,
  entity_category: ENTITY_CATEGORY_LABELS,
  direction: DIRECTION_LABELS,
  repeat: REPEAT_LABELS,
}

type FormattedEntityAttr = {
  value: string
  isObject: boolean
  chips?: string[]
}

export function formatEntityAttrValue(
  key: string,
  value: unknown,
  attrs: Record<string, unknown> = {},
): FormattedEntityAttr {
  if (value == null) return { value: '—', isObject: false }

  if (typeof value === 'boolean') {
    return { value: value ? '是' : '否', isObject: false }
  }

  if (Array.isArray(value)) {
    return formatArrayAttr(key, value)
  }

  if (typeof value === 'object') {
    return { value: JSON.stringify(value, null, 2), isObject: true }
  }

  if (typeof value === 'number') {
    const special = formatSpecialNumber(key, value, attrs)
    if (special) return { value: special, isObject: false }

    const asTime = tryFormatUnixLike(key, value)
    if (asTime) return { value: asTime, isObject: false }

    if (isFlagKey(key) && (value === 0 || value === 1)) {
      return { value: value === 1 ? '是' : '否', isObject: false }
    }

    const unit = resolveAttrUnit(key, attrs)
    const pretty = formatPlainNumber(value)
    return { value: unit ? `${pretty} ${unit}` : pretty, isObject: false }
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return { value: '—', isObject: false }

    const enumLabel = formatEnumString(key, trimmed)
    if (enumLabel) return { value: enumLabel, isObject: false }

    const statusLabel = formatStatusLikeString(key, trimmed)
    if (statusLabel) return { value: statusLabel, isObject: false }

    const boolish = formatBoolishString(trimmed)
    if (boolish && (isFlagKey(key) || boolishOnlyKey(key))) {
      return { value: boolish, isObject: false }
    }

    const asIso = tryFormatIsoDateString(key, trimmed)
    if (asIso) return { value: asIso, isObject: false }

    if (/^\d{10,13}$/.test(trimmed)) {
      const asTime = tryFormatUnixLike(key, Number(trimmed))
      if (asTime) return { value: asTime, isObject: false }
    }

    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      const special = formatSpecialNumber(key, Number(trimmed), attrs)
      if (special) return { value: special, isObject: false }
    }

    return { value: trimmed, isObject: false }
  }

  return { value: String(value), isObject: false }
}

function formatEnumString(key: string, value: string): string | null {
  const table = ENUM_BY_KEY[key]
  if (!table) return null
  const lower = value.toLowerCase()
  return table[lower] ?? table[value] ?? null
}

function formatSpecialNumber(
  key: string,
  value: number,
  attrs: Record<string, unknown>,
): string | null {
  if (!Number.isFinite(value)) return null

  if (key === 'brightness') {
    const pct = Math.round((Math.min(255, Math.max(0, value)) / 255) * 100)
    return `${pct}%`
  }
  if (key === 'volume_level') {
    const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
    return `${pct}%`
  }
  if (PERCENT_ATTR_KEYS.has(key)) {
    return `${Math.round(value)}%`
  }
  if (key === 'percentage_step') {
    return formatPercentageStep(value)
  }
  if (key === 'timer_hours') {
    if (value <= 0) return '未设置'
    return `${formatPlainNumber(value)} 小时`
  }
  if (key === 'color_temp') return `${Math.round(value)} mired`
  if (key === 'color_temp_kelvin' || key === 'min_color_temp_kelvin' || key === 'max_color_temp_kelvin') {
    return `${Math.round(value)} K`
  }
  if (key === 'min_mireds' || key === 'max_mireds') {
    return `${Math.round(value)} mired`
  }
  if (DURATION_SEC_KEYS.has(key)) {
    // filter_hours_used 常为小时
    if (key === 'filter_hours_used') return `${formatPlainNumber(value)} 小时`
    return formatDurationSeconds(value)
  }
  if (DEGREE_ATTR_KEYS.has(key)) {
    const deg = Math.round(value * 10) / 10
    if (key === 'wind_bearing' || key === 'bearing' || key === 'heading' || key === 'course') {
      return `${deg}°（${compassLabel(value)}）`
    }
    return `${deg}°`
  }
  if (key === 'linkquality') return `${Math.round(value)} LQI`
  if (key === 'signal_strength' || key === 'rssi') return `${Math.round(value)} dBm`
  if (key === 'cleaned_area') return `${formatPlainNumber(value)} m²`
  if (key === 'gps_accuracy') return `${formatPlainNumber(value)} m`
  if (key === 'latitude' || key === 'longitude') {
    return value.toFixed(6)
  }
  if (key === 'supported_features') {
    return `0x${Math.max(0, Math.round(value)).toString(16).toUpperCase()}（${Math.round(value)}）`
  }
  if (key === 'uv_index') return formatPlainNumber(value)

  if (MEASUREMENT_ATTR_KEYS.has(key)) {
    const unit = resolveAttrUnit(key, attrs) ?? defaultUnitForKey(key)
    return unit ? `${formatPlainNumber(value)} ${unit}` : null
  }

  return null
}

function defaultUnitForKey(key: string): string | null {
  if (key === 'cleaned_area') return 'm²'
  if (key === 'gps_accuracy') return 'm'
  if (key === 'temperature' || key === 'current_temperature' || key === 'dew_point' || key === 'apparent_temperature')
    return '°C'
  if (key === 'humidity' || key === 'current_humidity' || key === 'target_humidity' || key === 'cloud_coverage')
    return '%'
  return null
}

function formatDurationSeconds(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
  return `${m}:${String(r).padStart(2, '0')}`
}

function formatPlainNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  if (Number.isInteger(value)) return String(value)
  const abs = Math.abs(value)
  const digits = abs >= 100 ? 1 : abs >= 1 ? 2 : 3
  return String(Number(value.toFixed(digits)))
}

function formatPercentageStep(value: number): string {
  const step = formatPlainNumber(value)
  if (!(value > 0) || !Number.isFinite(value)) return `${step}%`
  const gears = 100 / value
  if (Math.abs(gears - Math.round(gears)) < 0.08) {
    return `${step}%（${Math.round(gears)} 档）`
  }
  return `${step}%`
}

function formatStatusLikeString(key: string, value: string): string | null {
  const lower = value.toLowerCase()
  const mapped = STATUS_VALUE_LABELS[lower]
  if (!mapped) return null
  if (
    key === 'state' ||
    key === 'timer_status' ||
    key === 'timer_option' ||
    key.endsWith('_status') ||
    key.endsWith('_state') ||
    key === 'activity' ||
    key === 'current_activity'
  ) {
    if (/^[a-z_]+$/i.test(value)) return mapped
  }
  return null
}

function compassLabel(deg: number): string {
  const normalized = ((deg % 360) + 360) % 360
  const idx = Math.round(normalized / 45) % 8
  return COMPASS_8[idx]
}

function formatArrayAttr(key: string, value: unknown[]): FormattedEntityAttr {
  if (value.length === 0) return { value: '（空）', isObject: false }

  if (key === 'forecast') {
    return { value: `共 ${value.length} 条预报`, isObject: false }
  }

  if (
    (key === 'rgb_color' || key === 'hs_color' || key === 'xy_color') &&
    value.every((v) => typeof v === 'number')
  ) {
    if (key === 'rgb_color' && value.length >= 3) {
      const [r, g, b] = value as number[]
      return { value: `RGB(${r}, ${g}, ${b})`, isObject: false }
    }
    return { value: value.join(', '), isObject: false }
  }

  const allPrimitive = value.every(
    (v) => v == null || ['string', 'number', 'boolean'].includes(typeof v),
  )
  if (allPrimitive) {
    const chips = value.map((v) => formatPrimitiveChip(key, v))
    return {
      value: chips.join('、'),
      isObject: false,
      chips,
    }
  }

  return { value: JSON.stringify(value, null, 2), isObject: true }
}

function formatPrimitiveChip(key: string, v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'boolean') return v ? '是' : '否'
  if (typeof v === 'number' && isFlagKey(key) && (v === 0 || v === 1)) {
    return v === 1 ? '是' : '否'
  }
  if (typeof v === 'string') {
    return formatEnumString(key, v) ?? formatStatusLikeString(key, v) ?? v
  }
  return String(v)
}

function isFlagKey(key: string): boolean {
  return FLAG_KEY_RE.test(key)
}

function boolishOnlyKey(key: string): boolean {
  return key === 'oscillating' || key === 'shuffle' || key === 'repeat'
}

function isTimeKey(key: string): boolean {
  return TIME_KEY_RE.test(key)
}

function formatBoolishString(s: string): string | null {
  const lower = s.toLowerCase()
  if (lower === 'true' || lower === 'on' || lower === 'yes' || lower === '1') return '是'
  if (lower === 'false' || lower === 'off' || lower === 'no' || lower === '0') return '否'
  return null
}

function tryFormatUnixLike(key: string, n: number): string | null {
  if (!Number.isFinite(n) || n <= 0) return null
  if (
    key === 'brightness' ||
    key === 'volume_level' ||
    PERCENT_ATTR_KEYS.has(key) ||
    DURATION_SEC_KEYS.has(key) ||
    DEGREE_ATTR_KEYS.has(key) ||
    key === 'supported_features'
  ) {
    return null
  }

  let ms: number | null = null
  if (n >= 1_000_000_000 && n < 4_102_444_800) ms = n * 1000
  else if (n >= 1_000_000_000_000 && n < 4_102_444_800_000) ms = n
  else return null

  if (!isTimeKey(key)) {
    const now = Date.now()
    if (ms < now - 20 * 365.25 * 86400_000 || ms > now + 10 * 365.25 * 86400_000) {
      return null
    }
  }

  try {
    return formatLocaleString(ms, FULL_DATETIME_OPTS)
  } catch {
    return null
  }
}

function tryFormatIsoDateString(key: string, s: string): string | null {
  const looksIso = /^\d{4}-\d{2}-\d{2}/.test(s)
  if (!looksIso) return null
  if (!isTimeKey(key) && !/^\d{4}-\d{2}-\d{2}T/.test(s)) return null
  const t = Date.parse(s)
  if (Number.isNaN(t)) return null
  try {
    return formatLocaleString(t, FULL_DATETIME_OPTS)
  } catch {
    return null
  }
}

function resolveAttrUnit(key: string, attrs: Record<string, unknown>): string | null {
  const unit = attrs.unit_of_measurement
  if (typeof unit === 'string' && unit.trim()) {
    // 仅对计量相关键或通用数值使用 entity 自带单位
    if (MEASUREMENT_ATTR_KEYS.has(key) || key.endsWith('_level') || key.endsWith('_speed')) {
      return unit.trim()
    }
  }
  if (!MEASUREMENT_ATTR_KEYS.has(key)) return null
  return null
}

export function buildEntityAttrEntries(
  attrs: Record<string, unknown>,
  skipKeys: Set<string>,
  limit?: number,
) {
  const rows = Object.entries(attrs)
    .filter(([k, v]) => !skipKeys.has(k) && v != null)
    .map(([key, value]) => {
      const formatted = formatEntityAttrValue(key, value, attrs)
      return { key, ...formatted }
    })
  if (limit != null && limit > 0) return rows.slice(0, limit)
  return rows
}

/** 供时间线等场景：仅返回友好字符串（数组摘要为顿号拼接） */
export function formatEntityAttrValueText(
  key: string,
  value: unknown,
  attrs: Record<string, unknown> = {},
): string {
  const r = formatEntityAttrValue(key, value, attrs)
  return r.value
}

/** 导出常用枚举，便于 UI 复用 */
export {
  HVAC_MODE_LABELS,
  HVAC_ACTION_LABELS,
}
