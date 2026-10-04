/**
 * @file useWeatherEffectConfig.ts
 * @module composables/ui
 * @description 天气效果配置 composable：解析天气实体状态为渲染用效果配置。
 *
 * 职责：
 * - 合并默认配置与配置文件 weatherEffects 段，解析为完整效果配置；
 * - 判断当前是否夜间（sun.sun 实体状态）；
 * - 读取天气实体状态与属性（风速/湿度/温度/降水）；
 * - 综合状态/夜间/属性解析出天气效果 profile（粒子类型/强度/风等）；
 * - 解析当前天气对应的场景参数与粒子数量，生成最终渲染配置。
 *
 * 依赖：
 * - vue（computed/ref/watch）
 * - entities.store / chrome.store / useWeatherEntity
 * - frontend-config（getConfigSection/configEpoch）
 * - weather-effect-condition.util / weather-effect-presets.util / weather-effect-scene-resolver.util
 */
import { computed, ref, watch } from 'vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useWeatherEntity } from '@/composables/entity/useWeatherEntity'
import { getConfigSection, configEpoch } from '@/utils/config/frontend-config'
import {
  resolveWeatherEffectProfile,
  type WeatherEffectProfile,
  type WeatherEntityAttributes,
} from '@/utils/weather/effect-condition.util'
import {
  resolveWeatherEffectConfig,
  type ResolvedWeatherEffectConfig,
  type WeatherEffectsConfig,
  DEFAULT_WEATHER_EFFECTS_CONFIG,
} from '@/utils/weather/effect-presets.util'
import {
  resolveActiveSceneParams,
  resolveActiveParticleCounts,
} from '@/utils/weather/effect-scene-resolver.util'
import { resolveSunriseSunset, computeDayPhase } from '@/utils/weather/sun-times.util'

/**
 * 天气效果配置 composable。
 *
 * 调用场景：天气背景组件初始化时调用，返回渲染所需的 profile/renderConfig/isNight 等。
 *
 * @returns renderConfig/activeScene/profile/isNight 等计算属性
 */
export function useWeatherEffectConfig() {
  const entitiesStore = useEntitiesStore()
  const { entity: weatherEntity } = useWeatherEntity()
  const lastGoodWeatherState = ref('sunny')

  // 原始配置：默认值合并配置文件 weatherEffects 段（读取 configEpoch 触发响应）
  const rawConfig = computed<WeatherEffectsConfig>(() => {
    void configEpoch.value
    const section = getConfigSection('weatherEffects') as unknown as
      Partial<WeatherEffectsConfig> | undefined
    return { ...DEFAULT_WEATHER_EFFECTS_CONFIG, ...section }
  })

  // 解析后的配置（预设/场景/属性混合等已展开）
  const resolvedConfig = computed<ResolvedWeatherEffectConfig>(() =>
    resolveWeatherEffectConfig(rawConfig.value),
  )

  // 是否夜间：取 sun.sun 实体状态
  const isNight = computed(() => {
    void entitiesStore.getDomainEpoch('sun')
    return entitiesStore.entities['sun.sun']?.state === 'below_horizon'
  })

  // 昼夜相位：由 sun.sun 的日出/日落计算平滑过渡（0=深夜，1=正午）
  const dayPhase = computed(() => {
    void entitiesStore.getDomainEpoch('sun')
    const attrs = entitiesStore.entities['sun.sun']?.attributes || {}
    const { sunrise, sunset } = resolveSunriseSunset(attrs as Record<string, unknown>)
    return computeDayPhase(sunrise, sunset)
  })

  // 天气状态：unavailable 保持上一有效值
  const weatherState = computed(() => {
    const raw = String(weatherEntity.value?.state || '')
      .toLowerCase()
      .trim()
    if (!raw || raw === 'unavailable' || raw === 'unknown') return lastGoodWeatherState.value
    return raw
  })

  watch(
    weatherState,
    (s) => {
      if (s && s !== 'unavailable' && s !== 'unknown') lastGoodWeatherState.value = s
    },
    { immediate: true },
  )

  // 天气属性：从实体 attributes 提取并做数值容错转换
  const weatherAttributes = computed<WeatherEntityAttributes>(() => {
    const attrs = weatherEntity.value?.attributes || {}
    const num = (v: unknown, fallback: number) => {
      const n = Number(v)
      return Number.isFinite(n) ? n : fallback
    }
    return {
      wind_speed: num(attrs.wind_speed, NaN),
      wind_speed_unit: attrs.wind_speed_unit as string,
      wind_bearing: num(attrs.wind_bearing, NaN),
      humidity: num(attrs.humidity, 50),
      temperature: num(attrs.temperature, 20),
      temperature_unit: (attrs.temperature_unit || attrs.unit_of_measurement) as string,
      precipitation: num(attrs.precipitation, NaN),
      precipitation_unit: attrs.precipitation_unit as string,
      precipitation_intensity: num(attrs.precipitation_intensity, NaN),
      cloud_coverage: num(attrs.cloud_coverage ?? attrs.cloud_cover, NaN),
      visibility: num(attrs.visibility, NaN),
      visibility_unit: attrs.visibility_unit as string,
    }
  })

  // 天气效果 profile：综合状态/夜间/属性/配置解析出粒子类型与强度
  const profile = computed<WeatherEffectProfile>(() =>
    resolveWeatherEffectProfile(weatherState.value, isNight.value, weatherAttributes.value, {
      useEntityAttributes: resolvedConfig.value.useEntityAttributes,
      attributeBlend: resolvedConfig.value.attributeBlend,
      windMultiplier: resolvedConfig.value.windMultiplier,
      preset: resolvedConfig.value.preset,
      dayPhase: dayPhase.value,
    }),
  )

  // 当前天气对应的场景参数（强度/阵风/颜色等）
  const activeScene = computed(() =>
    resolveActiveSceneParams(
      profile.value.kind,
      resolvedConfig.value.preset,
      resolvedConfig.value.scenes,
      profile.value,
      resolvedConfig.value.useEntityAttributes,
      resolvedConfig.value.attributeBlend,
    ),
  )

  // 当前天气对应的粒子数量（雨/雪/星星等）
  const activeParticleCounts = computed(() =>
    resolveActiveParticleCounts(profile.value, resolvedConfig.value, activeScene.value),
  )

  /** 渲染用：当前天气类型的场景参数与粒子数量 */
  const renderConfig = computed<ResolvedWeatherEffectConfig>(() => ({
    ...resolvedConfig.value,
    scene: activeScene.value,
    particleCounts: activeParticleCounts.value,
  }))

  return {
    renderConfig,
    activeScene,
    profile,
    isNight,
    dayPhase,
  }
}