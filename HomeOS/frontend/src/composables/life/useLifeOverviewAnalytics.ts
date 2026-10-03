/**
 * @file useLifeOverviewAnalytics.ts
 * @module frontend/src/composables
 */
import { computed, onMounted, ref } from 'vue'
import { createSharedComposable } from '@vueuse/core'
import { getEnergyRanking } from '@/services/api/energy'
import { fetchEnvTrend, fetchEnvSeasonalTips } from '@/services/api/system'
import { resolvePowerEntityId } from '@/utils/energy/source.util'
import { getEnergyChartHours, configEpoch } from '@/utils/config/frontend-config'
import { useHaBindingsStore } from '@/stores/ha-bindings.store'
import { useEntitiesStore } from '@/stores/entities.store'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import { loadEnergyTrendWithFallback } from '@/utils/chart/energy-trend-source.util'

/** LifeTrendPoint：类型定义，字段语义见声明。 */
export type LifeTrendPoint = { label: string; value: number; ts?: number }
type LifeRankRow = { name: string; entityId: string; kwh: number }
/** LifeEnvDay：类型定义，字段语义见声明。 */
export type LifeEnvDay = { date: string; avgTemperature: number | null; avgHumidity: number | null }

function formatTrendLabel(ts: number | string | undefined, index: number, total: number) {
  if (ts == null) return String(index + 1)
  const d = new Date(typeof ts === 'number' ? (ts < 1e12 ? ts * 1000 : ts) : ts)
  if (Number.isNaN(d.getTime())) return String(index + 1)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  if (total > 48) return `${hh}`
  return `${hh}:${mm}`
}

function mapPowerPoints(points: Array<Record<string, unknown>>): LifeTrendPoint[] {
  return points.map((p, i) => {
    const value = Number(p.value ?? p.state ?? 0) || 0
    const tsRaw = (p.ts ?? p.timestamp ?? p.time) as number | string | undefined
    let ts: number | undefined
    if (typeof tsRaw === 'number') ts = tsRaw < 1e12 ? tsRaw * 1000 : tsRaw
    else if (typeof tsRaw === 'string') {
      const parsed = new Date(tsRaw).getTime()
      ts = Number.isFinite(parsed) ? parsed : undefined
    }
    return {
      value,
      ts,
      label: formatTrendLabel(ts ?? tsRaw, i, points.length),
    }
  })
}

function useLifeOverviewAnalyticsState() {
  const haBindingsStore = useHaBindingsStore()
  const entitiesStore = useEntitiesStore()

  const loading = ref(false)
  const error = ref('')
  const powerTrend = ref<LifeTrendPoint[]>([])
  const ranking = ref<LifeRankRow[]>([])
  const envTrend = ref<LifeEnvDay[]>([])
  const seasonalTips = ref<string[]>([])
  const seasonalLabel = ref('')
  const redisDegraded = ref(false)
  /** 功率趋势是否使用 HA Recorder 降级 */
  const usingHaHistory = ref(false)

  const chartHours = computed(() => {
    void configEpoch.value
    return getEnergyChartHours()
  })

  const powerEntity = computed(() => {
    void entitiesStore.getDomainEpoch('sensor')
    return resolvePowerEntityId(
      haBindingsStore.statsSensors || {},
      entitiesStore.entities,
    )
  })

  async function load() {
    loading.value = true
    error.value = ''
    redisDegraded.value = false
    usingHaHistory.value = false
    const errors: string[] = []

    try {
      try {
        const tipRes = await fetchEnvSeasonalTips()
        const tipData = tipRes.data || {}
        seasonalTips.value = Array.isArray(tipData.tips) ? tipData.tips.slice(0, 4) : []
        seasonalLabel.value = tipData.season ? `${tipData.season}季提醒` : '季节提醒'
      } catch {
        seasonalTips.value = []
        seasonalLabel.value = '季节提醒'
      }

      try {
        const envRes = await fetchEnvTrend({ days: 14 })
        const rows = Array.isArray(envRes.data) ? envRes.data : envRes.data?.days || []
        envTrend.value = (rows as Array<Record<string, unknown>>).map((d) => ({
          date: String(d.date || ''),
          avgTemperature:
            d.avgTemperature != null && d.avgTemperature !== ''
              ? Number(d.avgTemperature)
              : null,
          avgHumidity:
            d.avgHumidity != null && d.avgHumidity !== '' ? Number(d.avgHumidity) : null,
        }))
      } catch {
        envTrend.value = []
        errors.push('环境趋势')
      }

      try {
        const rankRes = await getEnergyRanking(8)
        const rows = Array.isArray(rankRes.data) ? rankRes.data : []
        ranking.value = rows.map((row: Record<string, unknown>) => {
          const entityId = String(row.entityId || row.id || '')
          const friendly = getEntityDisplayName(entityId, entitiesStore.entities[entityId])
          return {
            entityId,
            name: String(friendly).slice(0, 16),
            kwh: Number(row.kwh ?? row.value ?? 0) || 0,
          }
        })
      } catch {
        ranking.value = []
        errors.push('能耗排名')
      }

      if (powerEntity.value) {
        const result = await loadEnergyTrendWithFallback(powerEntity.value, chartHours.value)
        redisDegraded.value = result.redisDegraded
        usingHaHistory.value = result.usingHaHistory
        powerTrend.value = mapPowerPoints(result.points as Array<Record<string, unknown>>)
        if (!powerTrend.value.length) errors.push('功率趋势')
      } else {
        powerTrend.value = []
      }

      if (
        errors.length &&
        !powerTrend.value.length &&
        !ranking.value.length &&
        !envTrend.value.length
      ) {
        error.value = `${errors[0]}加载失败`
      }
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    void load()
  })

  const hasChartData = computed(
    () =>
      powerTrend.value.some((p) => p.value > 0) ||
      ranking.value.some((r) => r.kwh > 0) ||
      envTrend.value.some((d) => d.avgTemperature != null || d.avgHumidity != null),
  )

  return {
    loading,
    error,
    powerTrend,
    ranking,
    envTrend,
    seasonalTips,
    seasonalLabel,
    redisDegraded,
    usingHaHistory,
    chartHours,
    hasChartData,
    reload: load,
  }
}

/** 生活路由内共享分析数据，刷新按钮与总览/能耗轨同一实例 */
export const useLifeOverviewAnalytics = createSharedComposable(useLifeOverviewAnalyticsState)
