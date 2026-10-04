/**
 * HA 天气状态 → 统一效果档案
 *
 * 职责：
 * - 定义天气效果种类（WeatherEffectKind）与效果档案（WeatherEffectProfile）。
 * - 提供 HA 天气状态 / 实体属性 → 效果档案的解析与降水判定（雨 / 雪 / 雹 / 闪电）。
 * - 提供降水强度量化，供粒子系统调度。
 *
 * 依赖：HA weather 实体 state 与属性。
 *
 * 注意：
 * - `WeatherEffectKind`（clear-day / cloudy / rain / ...）为效果 key，不翻译。
 * - 降水 / 闪电判定布尔字段为内部状态，不翻译。
 */
/** HA 天气状态 → 统一效果档案 */

export type WeatherEffectKind =
  | 'clear-day'
  | 'clear-night'
  | 'partly-cloudy'
  | 'cloudy'
  | 'drizzle'
  | 'rain'
  | 'heavy-rain'
  | 'thunderstorm'
  | 'snow'
  | 'sleet'
  | 'windy'
  | 'hail'
  | 'sandstorm'

export interface WeatherEntityAttributes {
  wind_speed?: number
  wind_speed_unit?: string
  wind_bearing?: number
  humidity?: number
  temperature?: number
  temperature_unit?: string
  precipitation?: number
  precipitation_unit?: string
  precipitation_intensity?: number
  cloud_coverage?: number
  visibility?: number
  visibility_unit?: string
}

export interface WeatherEffectProfile {
  kind: WeatherEffectKind
  rawState: string
  precipIntensity: number
  wind: number
  /** 水平风向：-1 向左，+1 向右（由 wind_bearing 推算） */
  windDir: number
  cloudCover: number
  isNight: boolean
  humidity: number
  temperature: number
  /** 能见度（km），未知时给宽松默认 */
  visibilityKm: number
  /** 霾：走雾场景但偏暖灰 */
  isHaze: boolean
  /** 昼夜相位（0=深夜，1=正午，含黎明/黄昏平滑缓坡） */
  dayPhase: number
}

const STATE_KIND_MAP: Record<string, WeatherEffectKind> = {
  sunny: 'clear-day',
  'clear-night': 'clear-night',
  clear: 'clear-day',
  partlycloudy: 'partly-cloudy',
  'partly-cloudy': 'partly-cloudy',
  cloudy: 'cloudy',
  overcast: 'cloudy',
  fog: 'cloudy',
  mist: 'cloudy',
  haze: 'cloudy',
  smoke: 'cloudy',
  lightning: 'thunderstorm',
  'lightning-rainy': 'thunderstorm',
  pouring: 'heavy-rain',
  rainy: 'rain',
  rain: 'rain',
  drizzle: 'drizzle',
  snowy: 'snow',
  snow: 'snow',
  'snowy-rainy': 'sleet',
  sleet: 'sleet',
  windy: 'windy',
  'windy-variant': 'windy',
  hail: 'hail',
  storm: 'thunderstorm',
  thunderstorm: 'thunderstorm',
  rainbow: 'partly-cloudy',
  sandstorm: 'sandstorm',
  dust: 'sandstorm',
  'dust-storm': 'sandstorm',
  sandy: 'sandstorm',
  aurora: 'clear-night',
}

const HAZE_STATES = new Set(['haze', 'smoke'])

const BASE_PRECIP: Partial<Record<WeatherEffectKind, number>> = {
  drizzle: 0.18,
  rain: 0.48,
  'heavy-rain': 0.78,
  thunderstorm: 0.82,
  snow: 0.52,
  sleet: 0.42,
  hail: 0.62,
}

const BASE_CLOUD: Partial<Record<WeatherEffectKind, number>> = {
  'clear-day': 0.1,
  'clear-night': 0.15,
  'partly-cloudy': 0.45,
  cloudy: 0.75,
  drizzle: 0.6,
  rain: 0.7,
  'heavy-rain': 0.85,
  thunderstorm: 0.9,
  snow: 0.65,
  sleet: 0.7,
  windy: 0.5,
  hail: 0.8,
  sandstorm: 0.6,
}

function normalizeWindSpeedMs(speed?: number, unit?: string): number {
  if (speed == null || Number.isNaN(speed)) return 0
  const u = String(unit || 'm/s').toLowerCase()
  if (u.includes('km')) return speed / 3.6
  if (u.includes('mph')) return speed * 0.447
  if (u.includes('kn')) return speed * 0.514
  return speed
}

function normalizeTempC(temp?: number, unit?: string): number {
  if (temp == null || Number.isNaN(temp)) return 20
  const u = String(unit || '°C').toLowerCase()
  if (u.includes('f')) return ((temp - 32) * 5) / 9
  if (u.includes('k') && !u.includes('km')) return temp - 273.15
  return temp
}

/** 能见度转 km。>50 视为米（部分集成用 m）。 */
function normalizeVisibilityKm(visibility?: number, unit?: string): number {
  if (visibility == null || Number.isNaN(visibility) || visibility < 0) return 12
  const u = String(unit || '').toLowerCase()
  if (u.includes('mi')) return visibility * 1.609
  if (u.includes('ft')) return visibility * 0.0003048
  if (u.includes('m') && !u.includes('km')) return visibility / 1000
  if (!u && visibility > 50) return visibility / 1000
  return visibility
}

function normalizeCloudCover(raw?: number): number | null {
  if (raw == null || Number.isNaN(raw)) return null
  if (raw <= 1) return Math.min(1, Math.max(0, raw))
  return Math.min(1, Math.max(0, raw / 100))
}

/** 气象风向（来向 0=北）→ 画面水平分量：东风为正（粒子向左），西风为负 */
function windDirFromBearing(bearing?: number): number {
  if (bearing == null || Number.isNaN(bearing)) return 1
  const rad = (bearing * Math.PI) / 180
  const x = -Math.sin(rad)
  if (Math.abs(x) < 0.12) return 1
  return x >= 0 ? 1 : -1
}

function windFromAttributes(attrs?: WeatherEntityAttributes): number {
  const raw = normalizeWindSpeedMs(attrs?.wind_speed, attrs?.wind_speed_unit)
  if (raw <= 0) return 0
  return Math.min(3, raw / 8)
}

function precipFromAttributes(attrs?: WeatherEntityAttributes, base = 0): number {
  const intensity = attrs?.precipitation_intensity
  const p = attrs?.precipitation
  const unit = String(attrs?.precipitation_unit || 'mm').toLowerCase()
  let mm = 0
  let hasSensor = false
  if (intensity != null && !Number.isNaN(intensity) && intensity > 0) {
    mm = unit.includes('in') ? intensity * 25.4 : intensity
    hasSensor = true
  } else if (p != null && !Number.isNaN(p)) {
    mm = unit.includes('in') ? p * 25.4 : p
    hasSensor = true
  }
  if (!hasSensor) return base
  if (mm <= 0) return base * 0.85
  const fromSensor = Math.min(1, Math.pow(mm / 7.5, 0.62))
  return Math.min(1, Math.max(base * 0.55, fromSensor * 0.88 + base * 0.12))
}

function inferExceptionalKind(attrs: WeatherEntityAttributes | undefined, isNight: boolean): WeatherEffectKind {
  const vis = normalizeVisibilityKm(attrs?.visibility, attrs?.visibility_unit)
  if (vis < 1.2) return 'cloudy'
  const temp = normalizeTempC(attrs?.temperature, attrs?.temperature_unit)
  const precip = precipFromAttributes(attrs, 0)
  if (precip > 0.55) return temp < 1 ? 'snow' : 'heavy-rain'
  if (precip > 0.25) return temp < 1 ? 'sleet' : 'rain'
  const cloud = normalizeCloudCover(attrs?.cloud_coverage)
  if (cloud != null && cloud > 0.7) return 'cloudy'
  if (cloud != null && cloud > 0.35) return 'partly-cloudy'
  return isNight ? 'clear-night' : 'cloudy'
}

/** 将 HA state 字符串映射为效果类型 */
function mapStateToKind(
  state: string,
  isNight: boolean,
  attrs?: WeatherEntityAttributes,
): WeatherEffectKind {
  const s = String(state || 'sunny')
    .toLowerCase()
    .trim()
  if (s === 'night' || s === 'day') return isNight ? 'clear-night' : 'clear-day'
  if (s === 'exceptional') return inferExceptionalKind(attrs, isNight)
  if (STATE_KIND_MAP[s]) {
    const kind = STATE_KIND_MAP[s]
    if (kind === 'clear-day' && isNight) return 'clear-night'
    return kind
  }
  if (s.includes('hail')) return 'hail'
  if (s.includes('thunder') || s.includes('lightning')) return 'thunderstorm'
  if (s.includes('pouring') || s.includes('heavy')) return 'heavy-rain'
  if (s.includes('drizzle')) return 'drizzle'
  if (s.includes('sleet') || s.includes('snowy-rainy')) return 'sleet'
  if (s.includes('snow')) return 'snow'
  if (s.includes('haze') || s.includes('smoke')) return 'cloudy'
  if (s.includes('fog') || s.includes('mist')) return 'cloudy'
  if (s.includes('sand') || s.includes('dust')) return 'sandstorm'
  if (s.includes('wind')) return 'windy'
  if (s.includes('storm')) return 'thunderstorm'
  if (s.includes('rain')) return 'rain'
  if (s.includes('partly')) return 'partly-cloudy'
  if (s.includes('cloud') || s.includes('overcast')) return 'cloudy'
  if (s.includes('clear') || s.includes('sunny')) return isNight ? 'clear-night' : 'clear-day'
  return isNight ? 'clear-night' : 'clear-day'
}

export function resolveWeatherEffectProfile(
  state: string,
  isNight: boolean,
  attrs?: WeatherEntityAttributes,
  options: {
    useEntityAttributes?: boolean
    attributeBlend?: number
    windMultiplier?: number
    preset?: 'realistic' | 'balanced' | 'cinematic'
    /** 昼夜相位（0-1），缺省按 isNight 兜底 */
    dayPhase?: number
  } = {},
): WeatherEffectProfile {
  const blend = options.attributeBlend ?? 0.7
  const useAttrs = options.useEntityAttributes !== false
  const windMul = options.windMultiplier ?? 1
  const realistic = options.preset === 'realistic'
  const dayPhase =
    options.dayPhase != null && Number.isFinite(options.dayPhase)
      ? Math.min(1, Math.max(0, options.dayPhase))
      : isNight
        ? 0
        : 1
  const rawState = String(state || 'sunny').toLowerCase()
  const kind = mapStateToKind(state, isNight, attrs)
  const isHaze = HAZE_STATES.has(rawState) || rawState.includes('haze') || rawState.includes('smoke')
  let precipIntensity = BASE_PRECIP[kind] ?? 0
  let wind = kind === 'windy' ? 1.6 : kind === 'thunderstorm' ? 1.05 : kind === 'sandstorm' ? 1.8 : 0.25
  let cloudCover = BASE_CLOUD[kind] ?? 0.3
  if (rawState === 'windy-variant') cloudCover = Math.max(cloudCover, 0.68)
  const humidity = attrs?.humidity ?? 50
  const temperature = normalizeTempC(attrs?.temperature, attrs?.temperature_unit)
  const visibilityKm = normalizeVisibilityKm(attrs?.visibility, attrs?.visibility_unit)
  const windDir = windDirFromBearing(attrs?.wind_bearing)

  if (useAttrs && attrs) {
    const attrWind = windFromAttributes(attrs)
    const windBlend = realistic ? Math.min(1, blend + 0.05) : blend
    if (attrWind > 0) {
      wind = wind * (1 - windBlend) + attrWind * windBlend
    } else if (kind === 'windy') {
      wind = Math.max(wind, realistic ? 1.2 : 1.5)
    }
    const precipBlend = realistic ? Math.min(1, blend + 0.08) : blend
    const fromAttrs = precipFromAttributes(attrs, precipIntensity)
    precipIntensity = precipIntensity * (1 - precipBlend) + fromAttrs * precipBlend

    const cloudFromSensor = normalizeCloudCover(attrs.cloud_coverage)
    if (cloudFromSensor != null) {
      const cloudBlend = realistic ? Math.min(1, blend + 0.1) : blend * 0.85
      cloudCover = cloudCover * (1 - cloudBlend) + cloudFromSensor * cloudBlend
    } else if (humidity > 72) {
      const humBoost = (humidity - 72) / 120
      cloudCover = Math.min(1, cloudCover + humBoost)
      if (
        realistic &&
        humidity > 90 &&
        (kind === 'partly-cloudy' || kind === 'cloudy' || kind === 'drizzle')
      ) {
        cloudCover = Math.min(1, cloudCover + 0.12)
      }
    }
    if (realistic && temperature < 3 && (kind === 'rain' || kind === 'drizzle')) {
      precipIntensity *= 0.85
    }
  }

  wind = Math.min(3, Math.max(0, wind * windMul))
  precipIntensity = Math.min(1, Math.max(0, precipIntensity))

  return {
    kind,
    rawState,
    precipIntensity,
    wind,
    windDir,
    cloudCover,
    isNight,
    humidity,
    temperature,
    visibilityKm,
    isHaze,
    dayPhase,
  }
}

export function profileHasRain(profile: WeatherEffectProfile): boolean {
  return ['drizzle', 'rain', 'heavy-rain', 'thunderstorm'].includes(profile.kind)
}

export function profileHasSnow(profile: WeatherEffectProfile): boolean {
  return profile.kind === 'snow'
}

export function profileHasSleet(profile: WeatherEffectProfile): boolean {
  return profile.kind === 'sleet'
}

export function profileHasLightning(profile: WeatherEffectProfile): boolean {
  return profile.kind === 'thunderstorm'
}

export function profileHasHail(profile: WeatherEffectProfile): boolean {
  return profile.kind === 'hail'
}

export function profileRainIntensity(profile: WeatherEffectProfile): number {
  if (!profileHasRain(profile)) return 0
  const pi = profile.precipIntensity
  switch (profile.kind) {
    case 'drizzle':
      return 0.18 + pi * 0.32
    case 'rain':
      return 0.42 + pi * 0.48
    case 'heavy-rain':
      return 0.62 + pi * 0.35
    case 'thunderstorm':
      return 0.68 + pi * 0.28
    default:
      return pi * 0.45
  }
}

/** 降水类场景强度（含雨雪混合） */
export function profilePrecipIntensity(profile: WeatherEffectProfile): number {
  if (profileHasSleet(profile)) {
    return 0.32 + profile.precipIntensity * 0.38
  }
  return profileRainIntensity(profile)
}
