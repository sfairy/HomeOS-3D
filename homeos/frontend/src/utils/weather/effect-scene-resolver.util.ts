/**
 * @file weather-effect-scene-resolver.util.ts
 * @module frontend/src/utils
 */
import type {
  WeatherEffectKind,
  WeatherEffectProfile,
} from '@/utils/weather/effect-condition.util'
import {
  PRESET_BASE,
  type WeatherEffectPreset,
  type WeatherEffectSceneParams,
  type WeatherEffectsConfig,
  type ResolvedWeatherEffectConfig,
} from '@/utils/weather/effect-presets.util'
import { clampNum as clamp } from '@/utils/core/misc.util'

type SceneConfigKey = keyof WeatherEffectsConfig['scenes']

const KIND_TO_SCENE_KEY: Record<WeatherEffectKind, SceneConfigKey> = {
  'clear-day': 'clearDay',
  'clear-night': 'clearNight',
  'partly-cloudy': 'partlyCloudy',
  cloudy: 'cloudy',
  drizzle: 'drizzle',
  rain: 'rain',
  'heavy-rain': 'heavyRain',
  thunderstorm: 'thunderstorm',
  snow: 'snow',
  sleet: 'sleet',
  windy: 'windy',
  hail: 'hail',
  sandstorm: 'sandstorm',
}

/** 各天气类型使用的场景字段（避免扁平合并互相污染） */
const KIND_SCENE_FIELDS: Partial<Record<WeatherEffectKind, (keyof WeatherEffectSceneParams)[]>> = {
  // 晴天/晴夜不挂 skyTint/skyDarken，避免默认天空罩色蒙版
  'clear-day': ['sunGlow', 'heatHaze', 'dustMotes'],
  'clear-night': ['starBrightness', 'moonGlow', 'aurora'],
  'partly-cloudy': ['sunbeam', 'dustMotes', 'driftSpeed'],
  cloudy: ['opacity', 'driftSpeed'],
  drizzle: ['intensity', 'mist', 'glassDrops', 'puddle'],
  rain: ['intensity', 'mist', 'glassDrops', 'puddle'],
  'heavy-rain': ['intensity', 'darkening', 'mist', 'glassDrops', 'puddle'],
  thunderstorm: [
    'rainIntensity',
    'intensity',
    'darkening',
    'mist',
    'glassDrops',
    'puddle',
    'lightningMinMs',
    'lightningMaxMs',
    'flashStrength',
  ],
  snow: ['intensity', 'accumulation', 'coldTint'],
  sleet: ['rainRatio', 'snowRatio', 'intensity', 'mist'],
  windy: ['leafParticles', 'gustStrength', 'driftSpeed'],
  hail: ['hailDensity', 'hailBounce', 'intensity'],
  sandstorm: ['opacity', 'intensity', 'driftSpeed'],
}

/** 所有天气场景共用的环境氛围字段（天空着色/压暗） */
const COMMON_SCENE_FIELDS: (keyof WeatherEffectSceneParams)[] = ['skyTint', 'skyDarken']

/** 晴空场景不做天空罩色（天气层叠在 UI 上会像蒙版） */
const CLEAR_KINDS = new Set<WeatherEffectKind>(['clear-day', 'clear-night'])

/** 各天气类型固有默认值（防止从其他场景继承 puddle 等字段） */
const KIND_SCENE_DEFAULTS: Partial<Record<WeatherEffectKind, Partial<WeatherEffectSceneParams>>> = {
  drizzle: { glassDrops: 0, puddle: false },
  snow: { glassDrops: 0, puddle: false },
  windy: { glassDrops: 0, puddle: false },
  hail: { glassDrops: 0, puddle: false },
  'clear-day': { puddle: false },
  'clear-night': { puddle: false },
  'partly-cloudy': { puddle: false },
  cloudy: { puddle: false },
  sandstorm: { puddle: false, glassDrops: 0 },
}

function kindToSceneKey(kind: WeatherEffectKind): SceneConfigKey {
  return KIND_TO_SCENE_KEY[kind] || 'clearDay'
}

function pickFields(
  source: Partial<WeatherEffectSceneParams>,
  fields: (keyof WeatherEffectSceneParams)[],
): Partial<WeatherEffectSceneParams> {
  const out: Partial<WeatherEffectSceneParams> = {}
  for (const f of fields) {
    if (source[f] !== undefined) out[f] = source[f] as never
  }
  return out
}

function normalizePuddle(v: unknown): boolean {
  if (v === true || v === 1) return true
  if (v === false || v === 0) return false
  return Boolean(v)
}

/** 逼真模式：根据实体属性计算建议值（不直接写回用户配置） */
function computeRealisticModifiers(
  kind: WeatherEffectKind,
  profile: WeatherEffectProfile,
): Partial<WeatherEffectSceneParams> {
  const { precipIntensity, wind, cloudCover, humidity, temperature, isNight } = profile
  const tempC = Number.isFinite(temperature) ? temperature : 20
  const hum = Number.isFinite(humidity) ? humidity : 50
  const out: Partial<WeatherEffectSceneParams> = {}

  switch (kind) {
    case 'clear-day':
      out.sunGlow = clamp((tempC > 28 ? 1.05 : 0.85) * (isNight ? 0 : 1), 0.4, 1.15)
      out.heatHaze = clamp(
        tempC > 30 ? 0.85 : tempC > 24 ? 0.55 : tempC < 8 ? 0.12 : 0.28,
        0.05,
        1,
      )
      out.dustMotes = clamp(0.32 * (wind > 1 ? 1.15 : 0.85) * (hum < 45 ? 1.2 : 0.9), 0.15, 0.75)
      break
    case 'clear-night':
      out.starBrightness = clamp(1.08 * (hum < 65 ? 1.12 : hum > 85 ? 0.78 : 0.96), 0.62, 1.25)
      out.moonGlow = clamp(0.55 + (hum < 60 ? 0.15 : 0), 0.35, 0.95)
      out.aurora = clamp(hum < 50 && tempC < 5 ? 0.85 : 0.35, 0.2, 1)
      break
    case 'partly-cloudy':
      out.driftSpeed = clamp(0.75 * (0.65 + wind * 0.35), 0.45, 1.9)
      out.sunbeam = clamp(0.5 * (isNight ? 0 : 1) * (1 - cloudCover * 0.45), 0.12, 0.9)
      out.dustMotes = clamp(0.28 * (wind > 1 ? 1.1 : 0.85), 0.12, 0.6)
      break
    case 'cloudy':
      out.opacity = clamp(0.55 * (0.6 + cloudCover * 0.5), 0.4, 0.95)
      out.driftSpeed = clamp(0.7 * (0.7 + wind * 0.28), 0.35, 1.6)
      break
    case 'sandstorm': {
      const vis = Number.isFinite(profile.visibilityKm) ? profile.visibilityKm : 6
      const visDense = vis < 10 ? (10 - vis) / 10 : 0.35
      out.opacity = clamp(0.35 + wind * 0.18 + visDense * 0.35, 0.32, 0.95)
      out.driftSpeed = clamp(1.3 + wind * 0.35, 1, 2.4)
      out.intensity = clamp(0.32 + wind / 2.6 + visDense * 0.25, 0.28, 0.92)
      break
    }
    case 'snow':
      out.intensity = clamp(0.35 + precipIntensity * 0.5, 0.25, 0.85)
      out.accumulation = clamp(0.3 + precipIntensity * 0.45 + Math.max(0, 2 - tempC) / 20, 0.2, 0.85)
      out.coldTint = clamp(0.4 + Math.max(0, 5 - tempC) / 22, 0.28, 0.85)
      break
    case 'windy':
      out.leafParticles = clamp(0.4 + wind / 3.2, 0.3, 1)
      out.gustStrength = clamp(0.85 + wind * 0.4, 0.75, 1.7)
      out.driftSpeed = clamp(1.1 + wind * 0.4, 1, 2.2)
      if (profile.rawState === 'windy-variant') {
        out.opacity = clamp(0.55 + profile.cloudCover * 0.35, 0.45, 0.95)
      }
      break
    case 'drizzle':
      out.intensity = clamp(0.2 + precipIntensity * 0.35, 0.14, 0.48)
      out.mist = clamp(0.28 + hum / 200 + precipIntensity * 0.12, 0.2, 0.55)
      out.glassDrops = 0
      out.puddle = false
      break
    case 'rain':
      out.intensity = clamp(0.4 + precipIntensity * 0.55, 0.35, 0.88)
      out.mist = clamp(0.28 + hum / 240 + precipIntensity * 0.12, 0.2, 0.52)
      out.glassDrops = clamp(0.35 + precipIntensity * 0.45, 0.2, 0.85)
      out.puddle = precipIntensity > 0.35
      break
    case 'heavy-rain':
      out.intensity = clamp(0.65 + precipIntensity * 0.35, 0.6, 1)
      out.darkening = clamp(0.45 + cloudCover * 0.35 + precipIntensity * 0.15, 0.4, 0.9)
      out.mist = clamp(0.38 + precipIntensity * 0.2, 0.28, 0.65)
      out.glassDrops = clamp(0.7 + precipIntensity * 0.3, 0.55, 1.2)
      out.puddle = true
      break
    case 'thunderstorm':
      out.rainIntensity = clamp(0.7 + precipIntensity * 0.3, 0.65, 1)
      out.intensity = out.rainIntensity
      out.darkening = clamp(0.55 + cloudCover * 0.3, 0.5, 0.95)
      out.flashStrength = clamp(0.72 + wind * 0.08, 0.55, 0.98)
      out.lightningMinMs = clamp(4200 - wind * 450, 2800, 7000)
      out.lightningMaxMs = clamp(13000 - hum * 18, 8500, 18000)
      out.glassDrops = clamp(0.65 + precipIntensity * 0.35, 0.5, 1.1)
      out.puddle = true
      break
    case 'sleet': {
      const rainRatio = clamp(0.4 + (tempC > 2 ? 0.25 : 0), 0.35, 0.7)
      out.rainRatio = rainRatio
      out.snowRatio = clamp(1 - rainRatio, 0.3, 0.65)
      out.intensity = clamp(0.4 + precipIntensity * 0.45, 0.3, 0.75)
      out.mist = clamp(0.28 + hum / 280, 0.2, 0.45)
      break
    }
    case 'hail':
      out.hailDensity = clamp(0.45 + precipIntensity * 0.4, 0.35, 0.85)
      out.hailBounce = clamp(0.65 + wind * 0.1, 0.55, 0.9)
      out.intensity = out.hailDensity
      break
    default:
      break
  }

  return out
}

function blendNumeric(userVal: number, autoVal: number, attributeBlend: number): number {
  const autoWeight = attributeBlend * 0.35
  return userVal * (1 - autoWeight) + autoVal * autoWeight
}

/**
 * 按当前天气类型解析场景参数（不扁平合并全部场景）
 * 逼真模式：仅对未手动配置的字段应用实体驱动建议值；已配置字段保留用户值并轻微混合
 */
export function resolveActiveSceneParams(
  kind: WeatherEffectKind,
  preset: WeatherEffectPreset,
  userScenes: WeatherEffectsConfig['scenes'] | undefined,
  profile?: WeatherEffectProfile,
  useEntityAttributes: boolean = true,
  attributeBlend: number = 0.92,
): WeatherEffectSceneParams {
  const presetPack = PRESET_BASE[preset] || PRESET_BASE.realistic
  const fields = [
    ...(KIND_SCENE_FIELDS[kind] || []),
    ...(CLEAR_KINDS.has(kind) ? [] : COMMON_SCENE_FIELDS),
  ]
  const sceneKey = kindToSceneKey(kind)
  const userPatch: Partial<WeatherEffectSceneParams> = userScenes?.[sceneKey] || {}
  const kindDefaults = KIND_SCENE_DEFAULTS[kind] || {}

  const base = {
    ...kindDefaults,
    ...pickFields(presetPack.scene, fields),
  } as WeatherEffectSceneParams
  const merged = { ...base, ...userPatch } as WeatherEffectSceneParams

  if (merged.puddle !== undefined) {
    merged.puddle = normalizePuddle(merged.puddle)
  }

  if (preset === 'realistic' && profile && useEntityAttributes) {
    const auto = computeRealisticModifiers(kind, profile)
    for (const [key, autoVal] of Object.entries(auto)) {
      const k = key as keyof WeatherEffectSceneParams
      if (autoVal === undefined) continue
      const hasUser = userPatch[k] !== undefined
      if (!hasUser) {
        merged[k] = autoVal as never
      } else if (typeof autoVal === 'number' && typeof merged[k] === 'number') {
        merged[k] = blendNumeric(merged[k] as number, autoVal, attributeBlend) as never
      }
    }
  }

  return merged
}

/** 逼真模式：粒子数量随降水强度与场景类型变化 */
export function resolveActiveParticleCounts(
  profile: WeatherEffectProfile,
  config: ResolvedWeatherEffectConfig & { preset?: WeatherEffectPreset },
  scene?: WeatherEffectSceneParams,
): ResolvedWeatherEffectConfig['particleCounts'] {
  const preset = config.preset || 'realistic'
  const base = config.particleCounts
  const dm = config.densityMultiplier
  const pi = profile.precipIntensity
  const wind = profile.wind
  const hailDensity = scene?.hailDensity ?? 1
  const rainRatio = scene?.rainRatio ?? 0.55
  const snowRatio = scene?.snowRatio ?? 0.45

  if (preset === 'balanced') {
    return base
  }

  if (preset === 'cinematic') {
    if (profile.kind === 'hail') {
      return { ...base, hail: Math.round(base.hail * hailDensity) }
    }
    if (profile.kind === 'sleet') {
      return {
        ...base,
        fastRain: Math.round(base.fastRain * rainRatio),
        snowCrystals: Math.round(base.snowCrystals * snowRatio),
      }
    }
    return base
  }

  const scale = (n: number, mul: number = 1) => Math.max(0, Math.round(n * dm * mul))

  switch (profile.kind) {
    case 'drizzle':
      return {
        glassDrops: 0,
        fastRain: scale(70, 0.4 + pi * 0.5),
        snowCrystals: 0,
        leaves: scale(8, wind > 0.8 ? 1.2 : 0.6),
        hail: 0,
      }
    case 'rain':
      return {
        glassDrops: scale(26, 0.45 + pi * 0.5),
        fastRain: scale(140, 0.6 + pi * 0.6),
        snowCrystals: 0,
        leaves: scale(12, wind > 1 ? 1.3 : 0.7),
        hail: 0,
      }
    case 'heavy-rain':
    case 'thunderstorm':
      return {
        glassDrops: scale(42, 0.7 + pi * 0.4),
        fastRain: scale(185, 0.8 + pi * 0.5),
        snowCrystals: 0,
        leaves: scale(14, wind > 1 ? 1.4 : 0.8),
        hail: 0,
      }
    case 'snow':
      return {
        glassDrops: 0,
        fastRain: 0,
        snowCrystals: scale(115, 0.5 + pi * 0.6),
        leaves: scale(6, 0.5),
        hail: 0,
      }
    case 'sleet':
      return {
        glassDrops: scale(12, 0.35),
        fastRain: scale(90, (0.45 + pi * 0.45) * rainRatio),
        snowCrystals: scale(70, (0.45 + pi * 0.5) * snowRatio),
        leaves: scale(8, 0.6),
        hail: 0,
      }
    case 'hail':
      return {
        glassDrops: 0,
        fastRain: scale(40, 0.3),
        snowCrystals: 0,
        leaves: scale(6, 0.5),
        hail: scale(42, (0.55 + pi * 0.45) * hailDensity),
      }
    case 'windy':
      return {
        glassDrops: 0,
        fastRain: scale(30, 0.25),
        snowCrystals: 0,
        leaves: scale(28, 0.5 + wind / 2.5),
        hail: 0,
      }
    case 'sandstorm':
      return {
        glassDrops: 0,
        fastRain: scale(24, 0.2),
        snowCrystals: 0,
        leaves: scale(48, 0.55 + wind / 2.2),
        hail: 0,
      }
    default:
      return {
        glassDrops: scale(10, 0.3),
        fastRain: scale(25, 0.2),
        snowCrystals: scale(15, 0.2),
        leaves: scale(10, wind > 1 ? 1.1 : 0.5),
        hail: 0,
      }
  }
}
