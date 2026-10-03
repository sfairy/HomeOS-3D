/**
 * 天气特效预设与运行时合并
 *
 * 职责：
 * - 维护天气特效预设档位（逼真 / 均衡 / 电影）与场景参数模型。
 * - 把预设与用户运行时配置合并为已解析的 ResolvedWeatherEffectConfig。
 *
 * 依赖：@/utils/weather/display-routes.util 的路由规范化。
 *
 * 注意：
 * - `WeatherEffectPreset`（realistic / balanced / cinematic）为预设 key，不翻译。
 * - 场景参数（sunGlow / heatHaze / ...）为数值配置 key，不翻译。
 */
/** 天气特效预设与运行时合并 */

import { normalizeDisplayRoutes } from '@/utils/weather/display-routes.util'

/** WeatherEffectPreset：类型定义，字段语义见声明。 */
export type WeatherEffectPreset = 'realistic' | 'balanced' | 'cinematic'

/** WeatherEffectSceneParams：类型定义，字段语义见声明。 */
export interface WeatherEffectSceneParams {
  sunGlow: number
  heatHaze: number
  dustMotes: number
  starBrightness: number
  moonGlow: number
  sunbeam: number
  opacity: number
  driftSpeed: number
  /** 天空氛围层着色强度（0=不染色，1=标准，>1 增强） */
  skyTint: number
  /** 天空氛围层压暗系数（0=不压暗，1=最暗，雨/雷暴/夜晚自动增强） */
  skyDarken: number
  /** 极光强度（晴朗夜间 rich 效果，0=关闭） */
  aurora: number
  intensity: number
  mist: number
  glassDrops: number
  puddle: boolean
  darkening: number
  rainIntensity: number
  lightningMinMs: number
  lightningMaxMs: number
  flashStrength: number
  accumulation: number
  coldTint: number
  rainRatio: number
  snowRatio: number
  fogOpacity: number
  fogLayers: number
  fogDrift: number
  leafParticles: number
  gustStrength: number
  hailDensity: number
  hailBounce: number
}

/** WeatherEffectsConfig：类型定义，字段语义见声明。 */
export interface WeatherEffectsConfig {
  enabled: boolean
  preset: WeatherEffectPreset
  displayRoutes: string[]
  useEntityAttributes: boolean
  densityMultiplier: number
  windMultiplier: number
  attributeBlend: number
  starCount: number
  cloudLayers: number
  shootingStarRate: number
  scenes: {
    clearDay: Partial<Pick<WeatherEffectSceneParams, 'sunGlow' | 'heatHaze' | 'dustMotes' | 'skyTint' | 'skyDarken'>>
    clearNight: Partial<
      Pick<WeatherEffectSceneParams, 'starBrightness' | 'moonGlow' | 'aurora' | 'skyTint' | 'skyDarken'>
    >
    partlyCloudy: Partial<
      Pick<WeatherEffectSceneParams, 'sunbeam' | 'dustMotes' | 'driftSpeed' | 'skyTint' | 'skyDarken'>
    >
    cloudy: Partial<Pick<WeatherEffectSceneParams, 'opacity' | 'driftSpeed' | 'skyTint' | 'skyDarken'>>
    drizzle: Partial<Pick<WeatherEffectSceneParams, 'intensity' | 'mist' | 'skyTint' | 'skyDarken'>>
    rain: Partial<
      Pick<WeatherEffectSceneParams, 'intensity' | 'glassDrops' | 'puddle' | 'skyTint' | 'skyDarken'>
    >
    heavyRain: Partial<
      Pick<WeatherEffectSceneParams, 'intensity' | 'darkening' | 'skyTint' | 'skyDarken'>
    >
    thunderstorm: Partial<
      Pick<
        WeatherEffectSceneParams,
        'rainIntensity' | 'lightningMinMs' | 'lightningMaxMs' | 'flashStrength' | 'skyTint' | 'skyDarken'
      >
    >
    snow: Partial<
      Pick<WeatherEffectSceneParams, 'intensity' | 'accumulation' | 'coldTint' | 'skyTint' | 'skyDarken'>
    >
    sleet: Partial<Pick<WeatherEffectSceneParams, 'rainRatio' | 'snowRatio' | 'skyTint' | 'skyDarken'>>
    windy: Partial<
      Pick<WeatherEffectSceneParams, 'leafParticles' | 'gustStrength' | 'skyTint' | 'skyDarken'>
    >
    hail: Partial<Pick<WeatherEffectSceneParams, 'hailDensity' | 'hailBounce' | 'skyTint' | 'skyDarken'>>
    sandstorm: Partial<
      Pick<WeatherEffectSceneParams, 'opacity' | 'intensity' | 'driftSpeed' | 'skyTint' | 'skyDarken'>
    >
  }
}

/** ResolvedWeatherEffectConfig：类型定义，字段语义见声明。 */
export interface ResolvedWeatherEffectConfig {
  enabled: boolean
  preset: WeatherEffectPreset
  displayRoutes: string[]
  useEntityAttributes: boolean
  densityMultiplier: number
  windMultiplier: number
  attributeBlend: number
  starCount: number
  cloudLayers: number
  shootingStarRate: number
  /** 当前天气的已解析场景参数：由 useWeatherEffectConfig().activeScene 填充，渲染层统一经 renderConfig.scene 读取 */
  scene?: WeatherEffectSceneParams
  scenes: WeatherEffectsConfig['scenes']
  particleCounts: {
    glassDrops: number
    fastRain: number
    snowCrystals: number
    leaves: number
    hail: number
  }
}

type WeatherEffectPresetPack = {
  densityMultiplier: number
  windMultiplier: number
  attributeBlend: number
  starCount: number
  cloudLayers: number
  shootingStarRate: number
  scene: WeatherEffectSceneParams
  particleCounts: ResolvedWeatherEffectConfig['particleCounts']
}

/** PRESET_BASE：对象常量，字段 / 方法语义见定义处。 */
export const PRESET_BASE: Record<WeatherEffectPreset, WeatherEffectPresetPack> = {
  realistic: {
    densityMultiplier: 0.78,
    windMultiplier: 1,
    attributeBlend: 0.92,
    starCount: 110,
    cloudLayers: 5,
    shootingStarRate: 0.00035,
    scene: {
      sunGlow: 0.82,
      heatHaze: 0.45,
      dustMotes: 0.38,
      starBrightness: 1,
      moonGlow: 0.62,
      sunbeam: 0.42,
      opacity: 0.62,
      driftSpeed: 0.85,
      skyTint: 0.85,
      skyDarken: 0.55,
      aurora: 0.5,
      intensity: 0.48,
      mist: 0.32,
      glassDrops: 0.55,
      puddle: true,
      darkening: 0.48,
      rainIntensity: 0.68,
      lightningMinMs: 5000,
      lightningMaxMs: 15000,
      flashStrength: 0.72,
      accumulation: 0.38,
      coldTint: 0.4,
      rainRatio: 0.52,
      snowRatio: 0.48,
      fogOpacity: 0.48,
      fogLayers: 3,
      fogDrift: 0.65,
      leafParticles: 0.48,
      gustStrength: 0.95,
      hailDensity: 0.55,
      hailBounce: 0.72,
    },
    particleCounts: { glassDrops: 28, fastRain: 135, snowCrystals: 115, leaves: 14, hail: 32 },
  },
  balanced: {
    densityMultiplier: 1,
    windMultiplier: 1,
    attributeBlend: 0.5,
    starCount: 160,
    cloudLayers: 6,
    shootingStarRate: 0.0006,
    scene: {
      sunGlow: 1,
      heatHaze: 0.5,
      dustMotes: 0.6,
      starBrightness: 1,
      moonGlow: 0.75,
      sunbeam: 0.6,
      opacity: 0.75,
      driftSpeed: 1.2,
      skyTint: 1,
      skyDarken: 0.65,
      aurora: 0.7,
      intensity: 0.7,
      mist: 0.4,
      glassDrops: 1,
      puddle: true,
      darkening: 0.65,
      rainIntensity: 0.85,
      lightningMinMs: 2500,
      lightningMaxMs: 10000,
      flashStrength: 1,
      accumulation: 0.6,
      coldTint: 0.5,
      rainRatio: 0.5,
      snowRatio: 0.5,
      fogOpacity: 0.6,
      fogLayers: 3,
      fogDrift: 1,
      leafParticles: 0.75,
      gustStrength: 1.3,
      hailDensity: 0.75,
      hailBounce: 0.85,
    },
    particleCounts: { glassDrops: 40, fastRain: 180, snowCrystals: 155, leaves: 22, hail: 50 },
  },
  cinematic: {
    densityMultiplier: 1.35,
    windMultiplier: 1.15,
    attributeBlend: 0.35,
    starCount: 210,
    cloudLayers: 8,
    shootingStarRate: 0.0012,
    scene: {
      sunGlow: 1.25,
      heatHaze: 0.85,
      dustMotes: 0.9,
      starBrightness: 1.2,
      moonGlow: 1,
      sunbeam: 0.85,
      opacity: 0.85,
      driftSpeed: 1.5,
      skyTint: 1.2,
      skyDarken: 0.8,
      aurora: 1,
      intensity: 0.95,
      mist: 0.55,
      glassDrops: 1.4,
      puddle: true,
      darkening: 0.8,
      rainIntensity: 1,
      lightningMinMs: 1800,
      lightningMaxMs: 7000,
      flashStrength: 1.25,
      accumulation: 0.8,
      coldTint: 0.65,
      rainRatio: 0.55,
      snowRatio: 0.55,
      fogOpacity: 0.75,
      fogLayers: 4,
      fogDrift: 1.2,
      leafParticles: 1.1,
      gustStrength: 1.6,
      hailDensity: 0.95,
      hailBounce: 1,
    },
    particleCounts: { glassDrops: 55, fastRain: 235, snowCrystals: 195, leaves: 35, hail: 70 },
  },
}

/** DEFAULT_WEATHER_EFFECTS_CONFIG：对象常量，字段 / 方法语义见定义处。 */
export const DEFAULT_WEATHER_EFFECTS_CONFIG: WeatherEffectsConfig = {
  enabled: true,
  preset: 'realistic',
  displayRoutes: ['dashboard'],
  useEntityAttributes: true,
  densityMultiplier: 0.78,
  windMultiplier: 1,
  attributeBlend: 0.92,
  starCount: 110,
  cloudLayers: 5,
  shootingStarRate: 0.00035,
  scenes: {
    clearDay: {},
    clearNight: {},
    partlyCloudy: {},
    cloudy: {},
    drizzle: {},
    rain: {},
    heavyRain: {},
    thunderstorm: {},
    snow: {},
    sleet: {},
    windy: {},
    hail: {},
    sandstorm: {},
  },
}

/** 剥离空场景覆盖，避免无意义的 {} 阻断预设生效 */
export function pruneEmptySceneOverrides(
  scenes: WeatherEffectsConfig['scenes'] | undefined,
): WeatherEffectsConfig['scenes'] {
  const base = DEFAULT_WEATHER_EFFECTS_CONFIG.scenes
  const out = { ...base }
  if (!scenes || typeof scenes !== 'object') return out
  for (const [key, val] of Object.entries(scenes)) {
    if (val && typeof val === 'object' && Object.keys(val).length > 0) {
      ;(out as Record<string, unknown>)[key] = val
    }
  }
  return out
}

/** resolveWeatherEffectConfig：函数，按签名入参返回处理结果。 */
export function resolveWeatherEffectConfig(
  raw?: Partial<WeatherEffectsConfig> | null,
): ResolvedWeatherEffectConfig {
  const explicit = raw || {}
  const presetKey = (explicit.preset ??
    DEFAULT_WEATHER_EFFECTS_CONFIG.preset) as WeatherEffectPreset
  const preset = PRESET_BASE[presetKey] || PRESET_BASE.realistic
  const scenes = pruneEmptySceneOverrides(
    explicit.scenes
      ? { ...DEFAULT_WEATHER_EFFECTS_CONFIG.scenes, ...explicit.scenes }
      : DEFAULT_WEATHER_EFFECTS_CONFIG.scenes,
  )
  const dm = explicit.densityMultiplier ?? preset.densityMultiplier

  const scale = (n: number) => Math.round(n * dm)
  return {
    enabled: explicit.enabled ?? DEFAULT_WEATHER_EFFECTS_CONFIG.enabled !== false,
    preset: presetKey,
    displayRoutes: normalizeDisplayRoutes(
      explicit.displayRoutes ?? DEFAULT_WEATHER_EFFECTS_CONFIG.displayRoutes,
    ),
    useEntityAttributes:
      explicit.useEntityAttributes ?? DEFAULT_WEATHER_EFFECTS_CONFIG.useEntityAttributes !== false,
    densityMultiplier: dm,
    windMultiplier: explicit.windMultiplier ?? preset.windMultiplier,
    attributeBlend: explicit.attributeBlend ?? preset.attributeBlend,
    starCount: explicit.starCount ?? preset.starCount,
    cloudLayers: explicit.cloudLayers ?? preset.cloudLayers,
    shootingStarRate: explicit.shootingStarRate ?? preset.shootingStarRate,
    scenes,
    particleCounts: {
      glassDrops: scale(preset.particleCounts.glassDrops),
      fastRain: scale(preset.particleCounts.fastRain),
      snowCrystals: scale(preset.particleCounts.snowCrystals),
      leaves: scale(preset.particleCounts.leaves),
      hail: scale(preset.particleCounts.hail),
    },
  }
}
