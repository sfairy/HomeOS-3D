/**
 * 家居气候图表业务逻辑 composable：
 * - 拉取温度/湿度实体近 24h HA 历史，映射为图表系列；
 * - 维护 ECharts 实例生命周期：双轴/单轴切换时销毁重建，容器不可见时 dispose；
 * - 提供图例数据、切换、空态文案，并响应可见性、认证、WS 重连与配置变化；
 * - 通过 scheduleEchartsTask 队列化渲染任务，避免高频更新抢占主线程。
 */
import {
  ref,
  computed,
  watch,
  onMounted,
  onUnmounted,
  nextTick,
  type Ref,
  type ComputedRef,
} from 'vue'
import { useScheduledPoll } from '@/shared/widget/composables/useScheduledPoll'
import type * as EchartsModuleNS from '@/shared/utils/chart/echarts'
import { useAuthStore } from '@/stores/auth.store'
import { useEntitiesStore } from '@/stores/entities.store'
import { fetchHaHistory, type HaHistoryPoint } from '@/services/api/entities'
import { notifyError } from '@/services/notify'
import {
  observeChartResize,
  scheduleEchartsTask,
  cancelScheduledEchartsTask,
} from '@/shared/utils/ui/chart-resize.util'
import { useFetchGeneration } from '@/composables/ui/useFetchGeneration'
import {
  HOME_CLIMATE_CHART_VIEW_OPTIONS,
  HOME_CLIMATE_CHART_HOURS,
  normalizeHomeClimateChartConfig,
  type HomeClimateChartView,
} from '@/shared/utils/registry/home-climate-chart-options'
import { TEMP_COLORS, HUM_COLORS, MAX_CHART_RETRIES } from './constants'
import {
  humidityLevel,
  temperatureLevel,
  toCelsius,
  type ClimateLevel,
  type HumidityLevelKey,
} from './climate-levels'
import {
  buildClimateChartOption,
  chartSeriesName,
  climateEntityBaseName,
  formatLegendValue,
  isChartContainerReady,
  mapHistorySeries,
  type ClimateLegendItem,
  type ClimateSeries,
} from './echarts.util'

/** 图表实例类型：来自按需加载 echarts 入口模块的 init 返回值 */
type EchartsModule = typeof EchartsModuleNS
type ChartInst = ReturnType<EchartsModule['default']['init']>

interface UseHomeClimateChartOptions {
  config: ComputedRef<Record<string, unknown>>
  panelVisible: ComputedRef<boolean>
  chartRef: Ref<HTMLElement | null>
}

/** 卡片底部文字摘要的一行：同一房间的温度与湿度并排显示 */
export interface ClimateSummaryRow {
  key: string
  name: string
  temperature: number | null
  humidity: number | null
  /** 温度舒适度分级（按摄氏阈值算，显示值仍是原始单位）；无读数时为 null */
  temperatureLevel: ClimateLevel | null
  /** 湿度舒适度分级；无读数时为 null */
  humidityLevel: ClimateLevel<HumidityLevelKey> | null
}

/**
 * 读取实体当前读数。
 * `unknown` / `unavailable` / 空串都不算读数（`Number('')` 会得到 0，必须显式挡掉）。
 */
function readEntityNumber(
  entityId: string,
  entities: Record<string, { state?: string } | undefined>,
): number | null {
  const raw = entityId ? entities[entityId]?.state : undefined
  if (raw == null || String(raw).trim() === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

/** 读取实体单位（`°C` / `%` / `°F`…），缺失时为空串。 */
function readEntityUnit(
  entityId: string,
  entities: Record<string, { attributes?: Record<string, unknown> } | undefined>,
): string {
  const unit = entityId ? entities[entityId]?.attributes?.unit_of_measurement : undefined
  return unit == null ? '' : String(unit)
}

export function useHomeClimateChart(options: UseHomeClimateChartOptions) {
  const { config, panelVisible, chartRef } = options

  const authStore = useAuthStore()
  const entitiesStore = useEntitiesStore()
  const loading = ref(true)
  const { bumpGeneration, isStale } = useFetchGeneration()
  const legendHidden = ref<boolean[]>([])
  let chartInstance: ChartInst | null = null
  let chartAxisMode: 'dual' | 'single' | null = null
  const chartTaskOwner: Record<string, unknown> = {}

  const hubConfig = computed(() => normalizeHomeClimateChartConfig(config.value))
  const viewOptions = HOME_CLIMATE_CHART_VIEW_OPTIONS
  const activeView = ref<HomeClimateChartView>(hubConfig.value.defaultView)

  watch(
    () => hubConfig.value.defaultView,
    (view) => {
      activeView.value = view
    },
  )

  const temperatureSeries = ref<ClimateSeries[]>([])
  const humiditySeries = ref<ClimateSeries[]>([])

  const hasEntities = computed(
    () =>
      hubConfig.value.temperatureEntities.length > 0 || hubConfig.value.humidityEntities.length > 0,
  )

  const hasSeries = computed(
    () => temperatureSeries.value.length > 0 || humiditySeries.value.length > 0,
  )

  const hasViewSeries = computed(() => {
    if (activeView.value === 'temperature') return temperatureSeries.value.length > 0
    if (activeView.value === 'humidity') return humiditySeries.value.length > 0
    return hasSeries.value
  })

  const viewEmptyTitle = computed(() => {
    if (activeView.value === 'temperature') return '暂无温度历史数据'
    if (activeView.value === 'humidity') return '暂无湿度历史数据'
    return '暂无历史数据'
  })

  /** 解析图例实时值：优先使用实体当前状态，回退到历史最后一个采样点 */
  function resolveLegendValue(entityId: string, seriesData: ClimateSeries['data']) {
    const live = parseFloat(entitiesStore.entities[entityId]?.state ?? '')
    if (!Number.isNaN(live)) return live
    const last = seriesData?.[seriesData.length - 1]
    if (last?.y != null && !Number.isNaN(last.y)) return last.y
    return null
  }

  const legendItems = computed<ClimateLegendItem[]>(() => {
    const items: ClimateLegendItem[] = []
    if (activeView.value === 'all' || activeView.value === 'temperature') {
      temperatureSeries.value.forEach((s, i) => {
        const value = resolveLegendValue(s.entityId, s.data)
        items.push({
          key: `t-${s.entityId}`,
          name: s.name,
          kind: 'temp',
          kindLabel: '°C',
          formattedValue: formatLegendValue(value, 'temp'),
          color: TEMP_COLORS[i % TEMP_COLORS.length],
          seriesName: chartSeriesName(s.entityId, 'temp'),
        })
      })
    }
    if (activeView.value === 'all' || activeView.value === 'humidity') {
      humiditySeries.value.forEach((s, i) => {
        const value = resolveLegendValue(s.entityId, s.data)
        items.push({
          key: `h-${s.entityId}`,
          name: s.name,
          kind: 'hum',
          kindLabel: '%',
          formattedValue: formatLegendValue(value, 'hum'),
          color: HUM_COLORS[i % HUM_COLORS.length],
          seriesName: chartSeriesName(s.entityId, 'hum'),
        })
      })
    }
    return items
  })

  /**
   * 底部文字摘要：按房间聚合当前读数，行数由已绑定的温湿度实体决定。
   *
   * 房间名取自实体显示名去掉「温湿度(计)」「温度 / 湿度」等字样，因此同一房间的
   * 温度实体与湿度实体折叠成同一行（`客厅 25° 38%`）；湿度实体单独存在时另起一行。
   */
  const summaryRows = computed<ClimateSummaryRow[]>(() => {
    const rows: ClimateSummaryRow[] = []
    const rowByKey = new Map<string, ClimateSummaryRow>()
    const occupied = { temp: new Set<string>(), hum: new Set<string>() }

    const attach = (entityId: string, kind: 'temp' | 'hum') => {
      if (!entityId) return
      const name = climateEntityBaseName(
        entityId,
        entitiesStore.entities,
        hubConfig.value.entityNames,
      )
      // 同名不同实体（例如两个房间都只叫「环境」）时用实体 id 兜底，避免读数互相覆盖。
      const key = occupied[kind].has(name) ? `${name}#${entityId}` : name
      occupied[kind].add(key)
      let row = rowByKey.get(key)
      if (!row) {
        row = {
          key,
          name,
          temperature: null,
          humidity: null,
          temperatureLevel: null,
          humidityLevel: null,
        }
        rowByKey.set(key, row)
        rows.push(row)
      }
      const value = readEntityNumber(entityId, entitiesStore.entities)
      if (kind === 'temp') {
        row.temperature = value
        // 分级按摄氏阈值算：传感器报 °F 时先折算，显示的仍是原始读数。
        row.temperatureLevel =
          value == null
            ? null
            : temperatureLevel(
                toCelsius(value, readEntityUnit(entityId, entitiesStore.entities)),
              )
      } else {
        row.humidity = value
        row.humidityLevel = humidityLevel(value)
      }
    }

    hubConfig.value.temperatureEntities.forEach((entityId) => attach(entityId, 'temp'))
    hubConfig.value.humidityEntities.forEach((entityId) => attach(entityId, 'hum'))
    return rows
  })

  /** 切换图例显示/隐藏：同步本地状态并派发 ECharts legend 事件 */
  function toggleLegend(i: number) {
    const hidden = !legendHidden.value[i]
    legendHidden.value = legendHidden.value.map((v, j) => (j === i ? hidden : v))
    const item = legendItems.value[i]
    if (!chartInstance || !item) return
    chartInstance.dispatchAction({ type: 'legendToggleSelect', name: item.seriesName })
  }

  function now() {
    return Date.now()
  }
  const xMin = computed(() => now() - HOME_CLIMATE_CHART_HOURS * 3600 * 1000)
  const xMax = computed(() => now())

  function buildOption() {
    return buildClimateChartOption({
      activeView: activeView.value,
      temperatureSeries: temperatureSeries.value,
      humiditySeries: humiditySeries.value,
      legendItems: legendItems.value,
      legendHidden: legendHidden.value,
      xMin: xMin.value,
      xMax: xMax.value,
    })
  }

  /** 当前视图对应的轴模式：综合视图双轴，温度/湿度单轴 */
  function resolveChartAxisMode() {
    return activeView.value === 'all' ? 'dual' : 'single'
  }

  /** 销毁图表实例并取消已排队的渲染任务 */
  function disposeChartInstance() {
    cancelScheduledEchartsTask(chartTaskOwner)
    chartInstance?.dispose()
    chartInstance = null
    chartAxisMode = null
  }

  /** 立即渲染图表：容器未就绪时按指数退避重试 */
  async function updateChartNow(retry = 0) {
    if (!panelVisible.value || !hasViewSeries.value) return
    const el = chartRef.value
    if (!isChartContainerReady(el)) {
      if (retry < MAX_CHART_RETRIES) {
        scheduleEchartsTask(chartTaskOwner, () => updateChartNow(retry + 1))
      }
      return
    }
    const nextAxisMode = resolveChartAxisMode()
    // 容器或轴模式变化时重建实例，避免 setOption 在跨轴模式时残留旧轴
    if (chartInstance && (chartInstance.getDom() !== el || chartAxisMode !== nextAxisMode)) {
      chartInstance.dispose()
      chartInstance = null
      chartAxisMode = null
    }
    if (!chartInstance) {
      // 动态 import echarts vendor：保持大依赖独立分包、按需加载
      const echarts = (await import('@/shared/utils/chart/echarts')).default
      // 导入是异步的：期间面板可能隐藏或容器被替换，重新校验避免僵尸实例
      if (
        !panelVisible.value ||
        !hasViewSeries.value ||
        chartRef.value !== el ||
        !isChartContainerReady(chartRef.value)
      ) {
        return
      }
      // 并发调用可能已在 await 期间完成初始化
      if (!chartInstance) chartInstance = echarts.init(chartRef.value)
    }
    chartInstance.setOption(buildOption(), { notMerge: true, lazyUpdate: false })
    chartAxisMode = nextAxisMode
    chartInstance.resize()
  }

  function scheduleChartUpdate() {
    scheduleEchartsTask(chartTaskOwner, () => updateChartNow(0))
  }

  /** 容器 resize 回调：已有实例则直接 resize，否则排队等待重建 */
  function onResize() {
    if (!panelVisible.value || !hasViewSeries.value) return
    if (!chartInstance || !isChartContainerReady(chartRef.value)) {
      scheduleChartUpdate()
      return
    }
    chartInstance.resize()
  }

  /** 拉取温湿度历史并映射为系列；使用 generation 防止并发请求结果错位 */
  async function fetchData() {
    if (!panelVisible.value) return
    if (!authStore.isAuthenticated) {
      loading.value = false
      return
    }
    const tempIds = hubConfig.value.temperatureEntities
    const humIds = hubConfig.value.humidityEntities
    const allIds = [...tempIds, ...humIds]
    if (!allIds.length) {
      temperatureSeries.value = []
      humiditySeries.value = []
      loading.value = false
      return
    }
    const token = bumpGeneration()
    try {
      loading.value = true
      // 单实体契约：并发拉取（服务端有并发信号量 + 30s 结果缓存承接）。单个实体失败
      // 只丢该条曲线，不让整图报错 —— 对齐原批量接口「缺席实体返回空序列」的语义。
      const settled = await Promise.allSettled(
        allIds.map((id) => fetchHaHistory(id, HOME_CLIMATE_CHART_HOURS)),
      )
      if (isStale(token)) return
      const byId = new Map<string, HaHistoryPoint[]>()
      let firstError: unknown
      for (const item of settled) {
        if (item.status === 'fulfilled') {
          const result = item.value.data
          if (result?.entityId && result.points?.length) byId.set(result.entityId, result.points)
        } else if (firstError === undefined) {
          firstError = item.reason
        }
      }
      if (byId.size === 0 && firstError !== undefined) throw firstError
      temperatureSeries.value = mapHistorySeries(
        tempIds,
        byId,
        entitiesStore.entities,
        hubConfig.value.entityNames,
      )
      humiditySeries.value = mapHistorySeries(
        humIds,
        byId,
        entitiesStore.entities,
        hubConfig.value.entityNames,
      )
      legendHidden.value = legendItems.value.map(() => false)
    } catch (e) {
      notifyError(e, '获取温湿度历史')
    } finally {
      loading.value = false
      if (hasViewSeries.value) nextTick(() => scheduleChartUpdate())
    }
  }

  // 视图切换：重置图例隐藏状态，轴模式变化时销毁旧实例以重建双轴/单轴
  watch(activeView, async () => {
    legendHidden.value = legendItems.value.map(() => false)
    const nextAxisMode = resolveChartAxisMode()
    if (chartAxisMode != null && chartAxisMode !== nextAxisMode) {
      disposeChartInstance()
    }
    await nextTick()
    if (nextAxisMode === 'dual') await nextTick()
    scheduleChartUpdate()
  })

  watch(
    [temperatureSeries, humiditySeries],
    () => {
      legendHidden.value = legendItems.value.map(() => false)
    },
    { deep: true },
  )

  watch(hasViewSeries, (ready) => {
    if (ready) nextTick(() => scheduleChartUpdate())
  })

  // 配置中的实体列表变化时重新拉取历史
  watch(
    () => hubConfig.value.temperatureEntities,
    () => {
      void fetchData()
    },
    { deep: true },
  )
  watch(
    () => hubConfig.value.humidityEntities,
    () => {
      void fetchData()
    },
    { deep: true },
  )
  watch(
    () => authStore.isAuthenticated,
    (ok) => {
      if (ok) void fetchData()
    },
  )
  // WS 重连后恢复，重新拉取一次保证数据新鲜
  watch(
    () => entitiesStore.connected,
    (ok, was) => {
      if (ok && !was && panelVisible.value) void fetchData()
    },
  )
  watch(panelVisible, (visible) => {
    if (visible) {
      if (!hasSeries.value) void fetchData()
      else nextTick(() => scheduleChartUpdate())
    } else {
      disposeChartInstance()
    }
  })

  let disposeResize: (() => void) | null = null
  // 图表容器 ref 绑定/解绑时挂载或释放 resize 观察器
  watch(
    chartRef,
    (el) => {
      disposeResize?.()
      if (el) {
        disposeResize = observeChartResize(el, onResize, chartTaskOwner)
        nextTick(() => scheduleChartUpdate())
      }
    },
    { flush: 'post' },
  )

  onMounted(() => {
    if (panelVisible.value) void fetchData()
  })

  // 每 5 分钟轮询刷新一次历史，immediate:false 避免与 onMounted 重复
  useScheduledPoll(
    () => {
      if (panelVisible.value) return fetchData()
    },
    5 * 60 * 1000,
    { key: 'widget:HomeClimateChartWidget', immediate: false, configKey: 'homeClimateChart' },
  )

  onUnmounted(() => {
    disposeChartInstance()
    disposeResize?.()
  })

  return {
    loading,
    viewOptions,
    activeView,
    hasEntities,
    hasSeries,
    hasViewSeries,
    viewEmptyTitle,
    legendItems,
    legendHidden,
    toggleLegend,
    summaryRows,
  }
}
