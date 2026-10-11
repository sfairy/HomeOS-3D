/** - 解析当前 weather 实体对应的气象站生活指数（穿衣、舒适度、带伞等）； */
import { computed, watch, type MaybeRef, unref } from 'vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useWeatherEntity } from '@/composables/entity/useWeatherEntity'
import { useEnsureVisibleEntities } from '@/composables/entity/useEnsureVisibleEntities'
import { getWsPushPublicConfig } from '@/shared/utils/config/frontend-config'
import { isColdFetchMissing } from '@/shared/entity/utils/cold-fetch.util'
import {
  collectOptionalLifeIndexEntityIds,
  collectWeatherStationEntityIds,
  resolveLifeIndexItems,
  resolveWeatherStationLiveMetrics,
  resolveWeatherWarning,
  type LifeIndexItem,
} from '@/shared/weather/utils/life-indices.util'

/**
 * 解析天气生活指数与气象站实时指标。
 *
 * @param entityIdOverride 可选的 weather 实体 ID 覆盖（ref/getter）
 * @returns weatherEid 解析后的 weather 实体 ID；hasWeather 是否已绑定；isFallback 是否回退到默认气象站；
 *          indices 全部指数；primaryIndices/optionalIndices 主/可选分组；
 *          attentionIndices 关注指数（warn/caution，最多 6 项）；liveMetrics 实时指标；warning 预警；
 *          availableCount/attentionCount 计数；headline 头条索引；overrideEid 覆盖 ID 字符串
 */
export function useLifeIndices(entityIdOverride?: MaybeRef<string | undefined>) {
  const entitiesStore = useEntitiesStore()
  const { resolvedEid, hasWeather, isFallback } = useWeatherEntity(entityIdOverride)

  // 当前气象站需要监听的实体 ID 列表（含主指数与可选指数）
  const watchedIds = computed(() => collectWeatherStationEntityIds(resolvedEid.value))
  useEnsureVisibleEntities(watchedIds)

  // 可选生活指数：单次 batch/get 探测（缺失不 404），启用后自动 hydrate 展示
  watch(
    () => resolvedEid.value,
    (eid) => {
      const wsPush = getWsPushPublicConfig()
      // 未启用 coldEntityOnDemand 时不主动拉取
      if (!wsPush?.coldEntityOnDemand) return
      const optionalIds = collectOptionalLifeIndexEntityIds(eid).filter(
        (id) => !entitiesStore.getEntity(id) && !isColdFetchMissing(id),
      )
      if (!optionalIds.length) return
      void entitiesStore.ensureEntities(optionalIds).catch(() => null)
    },
    { immediate: true },
  )

  // 全部生活指数项（void 触发响应式依赖，保证 WS 推送后重新计算）
  const indices = computed<LifeIndexItem[]>(() => {
    void entitiesStore.derivedEpoch
    void entitiesStore.getDomainEpoch('sensor')
    return resolveLifeIndexItems((id) => entitiesStore.getEntity(id), resolvedEid.value)
  })

  // 主指数（必显示）与可选指数（按需展示）
  const primaryIndices = computed(() => indices.value.filter((i) => i.primary))
  const optionalIndices = computed(() => indices.value.filter((i) => !i.primary))

  // 关注指数：warn/caution 语调，截取前 6 项避免过长
  const attentionIndices = computed(() =>
    indices.value.filter((i) => i.tone === 'warn' || i.tone === 'caution').slice(0, 6),
  )

  // 气象站实时指标（温度、湿度、风速等）
  const liveMetrics = computed(() => {
    void entitiesStore.derivedEpoch
    void entitiesStore.getDomainEpoch('sensor')
    return resolveWeatherStationLiveMetrics(
      (id) => entitiesStore.getEntity(id),
      resolvedEid.value,
    )
  })

  // 气象预警（如 binary_sensor 的 state）
  const warning = computed(() => {
    void entitiesStore.derivedEpoch
    void entitiesStore.getDomainEpoch('binary_sensor')
    return resolveWeatherWarning((id) => entitiesStore.getEntity(id), resolvedEid.value)
  })

  const availableCount = computed(() => indices.value.length)
  const attentionCount = computed(
    () => indices.value.filter((i) => i.tone === 'warn' || i.tone === 'caution').length,
  )

  // 头条索引：按优先级取穿衣 / 舒适度 / 带伞中第一个有效项
  const headline = computed(() => {
    const clothing = indices.value.find((i) => i.suffix === 'clothing')
    const comfort = indices.value.find((i) => i.suffix === 'comfort')
    const umbrella = indices.value.find((i) => i.suffix === 'umbrella')
    if (clothing?.state && clothing.state !== '—') {
      return { label: clothing.label, value: clothing.state, desc: clothing.description }
    }
    if (comfort?.state && comfort.state !== '—') {
      return { label: comfort.label, value: comfort.state, desc: comfort.description }
    }
    if (umbrella?.state && umbrella.state !== '—') {
      return { label: umbrella.label, value: umbrella.state, desc: umbrella.description }
    }
    return null
  })

  return {
    weatherEid: resolvedEid,
    hasWeather,
    isFallback,
    indices,
    primaryIndices,
    optionalIndices,
    attentionIndices,
    liveMetrics,
    warning,
    availableCount,
    attentionCount,
    headline,
    overrideEid: computed(() => String(unref(entityIdOverride) || '').trim()),
  }
}
