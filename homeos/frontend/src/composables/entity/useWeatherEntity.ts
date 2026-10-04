/**
 * 天气实体解析组合式函数
 *
 * 职责：按优先级解析当前应使用的天气实体，支持 widget 覆盖 > 集成绑定（与 circadian 同步）> 首个 weather.* 域实体三级策略；
 *      派生是否为兜底命中、天气实体是否可用等状态。
 * 返回结构：
 *   - boundEid：配置中绑定的天气实体 ID（含覆盖与集成）
 *   - resolvedEid：最终解析出的有效实体 ID
 *   - entity：解析出的 HA 实体快照（computed）
 *   - isFallback：是否命中兜底（未配置绑定，自动取首个 weather.*）
 *   - hasWeather：实体存在且状态非 unavailable
 * 性能：通过 getDomainEpoch 建立域级响应式依赖，仅在 weather 域索引重建时重算。
 */
import { computed, unref, type MaybeRef } from 'vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useLayoutStore } from '@/stores/layout.store'
import { domainIndexToArray } from '@/utils/entity/derived.util'

/**
 * 解析天气实体：widget 覆盖 > 集成绑定（与 circadian 双向同步）> 首个 weather.*
 */
export function useWeatherEntity(entityIdOverride?: MaybeRef<string | undefined>) {
  const entitiesStore = useEntitiesStore()
  const layoutStore = useLayoutStore()

  const overrideEid = computed(() => String(unref(entityIdOverride) || '').trim())
  const boundEid = computed(
    () => overrideEid.value || layoutStore.layoutConfig.haConfig?.weatherEntityId?.trim() || '',
  )

  const resolvedEid = computed(() => {
    if (boundEid.value && entitiesStore.entities[boundEid.value]) return boundEid.value
    // domainEntityIndex 是普通 Map（非响应式），附带读取域版本号建立响应式依赖：
    // weather 派生索引重建时该 computed 才会重算
    void entitiesStore.getDomainEpoch('weather')
    const weatherIds = domainIndexToArray(entitiesStore.domainEntityIndex.get('weather'))
    if (weatherIds.length) return weatherIds[0]
    return boundEid.value || ''
  })

  const entity = computed(() => {
    const eid = resolvedEid.value
    return eid ? entitiesStore.getEntity(eid) : null
  })

  const isFallback = computed(() => !boundEid.value && !!resolvedEid.value)
  const hasWeather = computed(() => !!entity.value && entity.value.state !== 'unavailable')

  return { boundEid, resolvedEid, entity, isFallback, hasWeather }
}
