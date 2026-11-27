import { fetchEarthquakeHaConfig, fetchEarthquakeLatest, fetchEarthquakeStatus, type EarthquakeStatusPayload } from '@/domain/api/earthquake'
import { useChromeStore } from '@/kernel/ui/chrome/chrome-store'
import { readLocalStorageFlag, removeLocalStorage, logger, writeLocalStorage, getApiErrorMessage } from '@/kernel/utils/core'
import { onMounted, onUnmounted, ref, watch, computed, type ToRefs, unref, type Ref } from 'vue'
import { useEarthquakeStore } from '@/domain/earthquake/earthquake.store'
import { isEarthquakeAlertEnabled, formatEarthquakeMagnitude } from '@/domain/earthquake/earthquake-layout.util'
import { useLayoutStore } from '@/domain/layout/store'
import { useHaConnectionStore } from '@/domain/ha/ha-connection.store'
import { useEchartsHost } from '@/domain/layout/composables/use-echarts-host'
import { barGradient, CHART_LABEL_MUTED, countCategoryAxis, countValueAxis, createChartTooltip, pieSeries, rankCategoryAxis } from '@/kernel/utils/chart'
import { buildDepthBuckets, buildDistanceBuckets, buildMagBuckets, buildPeriodTimeBuckets, buildTopPlaces, computeAnalyticsSummary, shortenPlace } from '@/features/earthquake/model/utils/history-analytics.util'
import { testHaConnection } from '@/domain/api/ha'
import { useAuthStore } from '@/domain/auth/auth.store'
import { useEntitiesStore } from '@/domain/entity/store/entities.store'
import { EEW_CITY_PRESETS, createDefaultEarthquakeConfig, type EarthquakeAlertPayload } from '@/kernel/types/earthquake'
import { useApiQuery } from '@/features/settings/composables/use-api-query'
import { speakVoiceMultiple } from '@/kernel/http/index'
import { resolveTtsMediaPlayerIds } from '@/features/voice/model/utils'
import { cancelLocalSpeech, getLoadedVoices, getSpeechSynth, resetLocalSpeechVoice, speakViaLocalRaw, waitForVoices } from '@/domain/voice/local-speech.util'

/** 流程：调用 fetchEarthquakeHaConfig 获取 HA 中的家庭坐标 → 通过 applyCoords 回调写入 → 弹出通知。 */

/**
 * 从 HA 同步家庭经纬度，并弹出通知。
 * @param applyCoords 坐标写入回调 (latitude, longitude)
 * @param options.silent 为 true 时抑制失败/缺失坐标的警告通知（用于向导进入坐标步骤时的
 *   静默自动同步，避免打断流程）；成功通知仍然保留，让用户知道坐标已被填好。
 * @returns true 表示坐标已通过 applyCoords 写入；false 表示同步失败或无坐标
 */
export async function syncEarthquakeHomeCoordsFromHa(
  applyCoords: (latitude: string, longitude: string) => void,
  options: { silent?: boolean } = {},
): Promise<boolean> {
  const chrome = useChromeStore()
  const res = await fetchEarthquakeHaConfig()
  if (!res?.success) {
    if (!options.silent) {
      chrome.notify(res?.message || '同步失败，请先完成 HA 连接配置', 'warning')
    }
    return false
  }
  const data = res.data
  if (data?.latitude != null && data?.longitude != null) {
    applyCoords(String(data.latitude), String(data.longitude))
    chrome.notify('已从 Home Assistant 同步家庭坐标', 'success')
    return true
  }
  if (!options.silent) {
    chrome.notify('HA 配置中未找到坐标', 'warning')
  }
  return false
}

/** 地震预警应用启动引导模块 */


/**
 * 地震预警应用启动引导模块
 * - 应用启动时从后端恢复最近一次地震预警状态（若仍处于活动期）；
 * - 检测 EEW（地震预警）配置缺失情况，必要时延迟弹出 EEW 配置向导。
 */

/** localStorage 中标记"已完成后端 EEW 配置向导"的 key */
const WIZARD_DONE_KEY = 'eew_wizard_completed'

/**
 * 判断是否应当提示用户进入 EEW 配置向导。
 *
 * 判定逻辑（任一成立即提示）：
 *  1. localStorage 未标记已完成向导；
 *  2. HOME ASSISTANT 连接未配置（无连接记录或未保存令牌）；
 *  3. 地震配置中缺少经纬度坐标。
 *
 * 若用户已在配置中填写了经纬度且启用地震预警，则跳过提示。
 *
 * @param layoutStore UI 状态存储实例
 * @param haConfigured 是否已保存 HA 连接（单源：stores/ha-connection.store.ts）
 * @returns true 表示应当弹出向导
 */
function shouldPromptWizard(layoutStore: ReturnType<typeof useLayoutStore>, haConfigured: boolean): boolean {
  if (readLocalStorageFlag(WIZARD_DONE_KEY)) return false
  const cfg = layoutStore.layoutConfig?.earthquakeConfig
  if (cfg?.enabled && cfg.latitude && cfg.longitude) return false
  const noCoords = !cfg?.latitude || !cfg?.longitude
  return !haConfigured || noCoords
}

/**
 * 重新打开 EEW 配置向导。
 * 通过清除 localStorage 中的"已完成"标记，使下次启动时重新触发提示。
 * 副作用：会修改 localStorage。
 */
export function reopenEarthquakeWizard() {
  removeLocalStorage(WIZARD_DONE_KEY)
}

/**
 * 地震预警应用启动引导 composable。
 *
 * 在组件挂载时：
 *  1. 监听 window 的 'homeos:eew-wizard-open' 事件（外部触发打开向导）；
 *  2. 拉取后端最新地震预警，若仍处于活动期且用户未 dismissal，则触发预警；
 *  3. 监听 UI 配置加载完成，按需延迟 1.2 秒弹出 EEW 配置向导。
 *
 * 在组件卸载时清理事件监听与定时器。
 *
 * @returns showSetupWizard：是否显示 EEW 配置向导的响应式引用
 */
export function useEarthquakeBootstrap() {
  const showSetupWizard = ref(false)
  let wizardTimer: ReturnType<typeof setTimeout> | null = null
  let stopConfigWatch: (() => void) | null = null

  /** 'homeos:eew-wizard-open' 事件回调：打开向导 */
  function onWizardOpen() {
    showSetupWizard.value = true
  }

  /** 清理延迟打开向导的定时器 */
  function clearWizardTimer() {
    if (wizardTimer) {
      clearTimeout(wizardTimer)
      wizardTimer = null
    }
  }

  /**
   * 在配置加载完成后，按需延迟 1.2 秒弹出 EEW 配置向导。
   * 延迟是为了避免首屏初始化期间弹窗抢夺焦点。
   * @param layoutStore UI 状态存储实例
   */
  function scheduleWizardIfNeeded(layoutStore: ReturnType<typeof useLayoutStore>, haConfigured: boolean) {
    clearWizardTimer()
    if (!layoutStore.isConfigLoaded) return
    if (!shouldPromptWizard(layoutStore, haConfigured)) return
    wizardTimer = setTimeout(() => {
      showSetupWizard.value = true
      wizardTimer = null
    }, 1200)
  }

  onMounted(async () => {
    window.addEventListener('homeos:eew-wizard-open', onWizardOpen)

    try {
      const res = await fetchEarthquakeLatest()
      const { isActive, payload } = res.data || {}
      const eventId = String(payload?.eventId || '').trim()
      const store = useEarthquakeStore()
      if (isActive && eventId && isEarthquakeAlertEnabled() && !store.isEventDismissed(eventId)) {
        store.triggerAlert(payload)
      }
    } catch (e) {
      // 后端拉取预警失败不影响主流程，仅记录调试日志
      logger.debug('跳过获取 EEW 最新警报', e)
    }

    const layoutStore = useLayoutStore()
    const haConnectionStore = useHaConnectionStore()
    stopConfigWatch = watch(
      () => [layoutStore.isConfigLoaded, haConnectionStore.loaded] as const,
      ([configLoaded]) => {
        if (!configLoaded) return
        // 连接状态是「是否需要引导」的判定输入之一，等它加载完成再决定弹不弹。
        if (!haConnectionStore.loaded) {
          void haConnectionStore.load()
          return
        }
        scheduleWizardIfNeeded(layoutStore, haConnectionStore.configured && haConnectionStore.hasToken)
      },
      { immediate: true },
    )
    void haConnectionStore.load()
  })

  onUnmounted(() => {
    window.removeEventListener('homeos:eew-wizard-open', onWizardOpen)
    stopConfigWatch?.()
    clearWizardTimer()
  })

  return { showSetupWizard }
}

/**
 * @file useEarthquakeHistoryAnalytics.ts
 * @module frontend/src/composables
 */

/**
 * 地震预警历史分析 composable
 * - 接收地震事件列表（本地 EEW 记录或远端筛选结果），派生统计摘要与分桶数据；
 * - 渲染 4 个 ECharts 图表：震级分布、距离分布、时间分布、附加维度（深度/震中 Top）；
 * - 提供 KPI 单元格数据供模板渲染（事件总数、最大震级、强震数、近距事件等）；
 * - 自动响应容器尺寸变化与可见性变化，重渲染图表。
 */

/**
 * 地震历史分析 composable。
 *
 * @param props.items  地震事件原始列表（local 与远端 schema 不同，通过 accessors 适配）
 * @param props.tab    当前标签页：'local' = 本地 EEW 记录；其他值 = 远端筛选
 * @param props.period 时间范围（影响时间分桶的粒度）
 * @returns 图表 ref、KPI 单元格等供模板使用
 */
export function useEarthquakeHistoryAnalytics(
  props: ToRefs<{
    items: unknown[]
    tab: string
    period: string
  }>,
) {
  // —— 图表 DOM 引用 ——
  /** 震级分布图 DOM */
  const magChartRef = ref<HTMLElement | null>(null)
  /** 距离分布图 DOM */
  const distChartRef = ref<HTMLElement | null>(null)
  /** 时间分布图 DOM */
  const timeChartRef = ref<HTMLElement | null>(null)
  /** 附加维度图 DOM（local 为震中 Top，远端为深度分布） */
  const extraChartRef = ref<HTMLElement | null>(null)

  // 保持原语义：resize 观察与渲染共用调度 owner；渲染调度/重试/清理由 useEchartsHost 承担
  const { schedule, getChartBase } = useEchartsHost({
    charts: {
      mag: { el: () => magChartRef.value, build: buildMagOption },
      dist: { el: () => distChartRef.value, build: buildDistOption },
      time: { el: () => timeChartRef.value, build: buildTimeOption },
      extra: { el: () => extraChartRef.value, build: buildExtraOption },
    },
    sharedResizeOwner: true,
  })

  /**
   * 字段访问器：根据 tab（local/远端）从原始行中提取震级、距离、震中、时间、深度、烈度。
   * local 模式字段名与远端不同，需分别适配。
   */
  const accessors = computed(() => {
    if (unref(props.tab) === 'local') {
      return {
        getMagnitude: (row: unknown) => (row as { magnitude?: number | null }).magnitude,
        getDistanceKm: (row: unknown) => (row as { distance?: number | null }).distance,
        getPlace: (row: unknown) => (row as { epicenter?: string | null }).epicenter,
        getTimeMs: (row: unknown) => {
          const rowData = row as { savedAt?: number | null; originTime?: number | null }
          return rowData.savedAt || rowData.originTime
        },
        getDepth: () => null,
        getIntensity: (row: unknown) => {
          const intensityRow = row as { localIntensity?: number | null; maxIntensity?: number | null }
          return intensityRow.localIntensity ?? intensityRow.maxIntensity
        },
      }
    }
    return {
      getMagnitude: (row: unknown) => (row as { magnitude?: number | null }).magnitude,
      getDistanceKm: (row: unknown) => (row as { distanceKm?: number | null }).distanceKm,
      getPlace: (row: unknown) => (row as { place?: string | null }).place,
      getTimeMs: (row: unknown) => (row as { originTime?: number | null }).originTime,
      getDepth: (row: unknown) => (row as { depth?: number | null }).depth,
      getIntensity: (row: unknown) => (row as { intensity?: number | null }).intensity,
    }
  })

  const items = computed(() => unref(props.items))
  const tab = computed(() => unref(props.tab))
  const period = computed(() => unref(props.period))

  // —— 统计摘要与各维度分桶（均由 util 函数计算） ——
  const summary = computed(() => computeAnalyticsSummary(items.value, accessors.value))
  const magBuckets = computed(() => buildMagBuckets(items.value, accessors.value.getMagnitude))
  const distBuckets = computed(() => buildDistanceBuckets(items.value, accessors.value.getDistanceKm))
  const timeBuckets = computed(() => buildPeriodTimeBuckets(items.value, accessors.value.getTimeMs, period.value))
  const depthBuckets = computed(() => buildDepthBuckets(items.value, accessors.value.getDepth))
  const topPlaces = computed(() => buildTopPlaces(items.value, accessors.value.getPlace, 5))
  /**
   * KPI 单元格数据（供模板渲染顶部指标行）。
   *  - total：事件总数（local=EEW 记录数，远端=筛选范围）；
   *  - max：最大震级（>=5 标记 warn tone）；
   *  - m4：M4+ 强震数（M5+ 进一步标记 danger tone）；
   *  - near：200km 内事件数（>0 标记 danger）；
   *  - avg：平均震级与平均深度；
   *  - intensity：最大烈度（>=6 标记 warn）。
   */
  const kpiCells = computed(() => {
    const summaryValue = summary.value
    return [
      {
        key: 'total',
        label: '事件总数',
        value: String(summaryValue.total),
        hint: tab.value === 'local' ? 'EEW 记录' : '筛选范围',
      },
      {
        key: 'max',
        label: '最大震级',
        value: summaryValue.maxMagnitude != null ? `M${formatEarthquakeMagnitude(summaryValue.maxMagnitude)}` : '—',
        hint: summaryValue.strongestPlace ? shortenPlace(summaryValue.strongestPlace, 8) : '',
        tone: summaryValue.maxMagnitude != null && summaryValue.maxMagnitude >= 5 ? 'warn' : 'accent',
      },
      {
        key: 'm4',
        label: '强震 M4+',
        value: String(summaryValue.m4Plus),
        hint: summaryValue.m5Plus ? `M5+ ${summaryValue.m5Plus} 次` : '无 M5+',
        tone: summaryValue.m5Plus ? 'danger' : 'muted',
      },
      {
        key: 'near',
        label: '200km 内',
        value: String(summaryValue.within200Km),
        hint: summaryValue.nearestKm != null ? `最近 ${summaryValue.nearestKm} km` : '无坐标',
        tone: summaryValue.within200Km > 0 ? 'danger' : 'muted',
      },
      {
        key: 'avg',
        label: '平均震级',
        value: summaryValue.avgMagnitude != null ? `M${summaryValue.avgMagnitude.toFixed(1)}` : '—',
        hint: summaryValue.avgDepth != null ? `均深 ${summaryValue.avgDepth} km` : '',
      },
      {
        key: 'intensity',
        label: tab.value === 'local' ? '最高烈度' : '最大烈度',
        value: summaryValue.maxIntensity != null ? `${summaryValue.maxIntensity} 度` : '—',
        hint: summaryValue.farthestKm != null ? `最远 ${summaryValue.farthestKm} km` : '',
        tone: summaryValue.maxIntensity != null && summaryValue.maxIntensity >= 6 ? 'warn' : 'muted',
      },
    ]
  })

  /** 震级分桶配色（按桶序，从灰到红渐变） */
  const MAG_COLORS = ['#94a3b8', '#7dd3fc', '#fbbf24', '#fb923c', '#f87171']

  /** 图表 tooltip 共用样式（深色背景 + 暖色文字） */
  const chartTooltip = createChartTooltip('rgba(12, 12, 18, 0.94)', {
    borderColor: 'rgba(251, 191, 36, 0.32)',
    borderWidth: 1,
    padding: [8, 12],
    extraCssText: 'border-radius: 10px; backdrop-filter: blur(12px); box-shadow: 0 8px 28px rgba(0,0,0,0.35);',
    textStyle: { color: '#fde68a', fontSize: 12, fontWeight: 600 },
  })

  /**
   * 构造震级分布柱状图 option。
   * 每个震级分桶一个柱子，颜色按 MAG_COLORS 映射，柱顶显示数值。
   * @returns ECharts option
   */
  function buildMagOption() {
    const buckets = magBuckets.value
    return {
      ...getChartBase(),
      grid: { left: 36, right: 12, top: 16, bottom: 24 },
      xAxis: countCategoryAxis(
        buckets.map((bucket) => bucket.label),
        { labelFontSize: 10, labelColor: CHART_LABEL_MUTED },
      ),
      yAxis: countValueAxis(buckets.map((bucket) => bucket.count)),
      series: [
        {
          type: 'bar',
          data: buckets.map((bucket, i) => ({
            value: bucket.count,
            itemStyle: {
              color: barGradient(MAG_COLORS[i] || '#fbbf24'),
              borderRadius: [6, 6, 0, 0],
              shadowBlur: 8,
              shadowColor: `${MAG_COLORS[i] || '#fbbf24'}44`,
            },
          })),
          barWidth: '52%',
          label: {
            show: true,
            position: 'top',
            color: 'rgba(255,255,255,0.65)',
            fontSize: 10,
            formatter: ({ value }: { value?: number }) => String(value ?? 0),
          },
        },
      ],
      tooltip: { ...chartTooltip, trigger: 'axis' },
    }
  }

  /**
   * 构造距离分布环形图 option。
   * 过滤掉 count=0 的桶；若全为 0 则显示"无距离数据"占位扇区。
   * @returns ECharts option
   */
  function buildDistOption() {
    const buckets = distBuckets.value.filter((bucket) => bucket.count > 0)
    const data = buckets.length
      ? buckets.map((bucket) => ({ name: bucket.label, value: bucket.count, itemStyle: { color: bucket.color } }))
      : [{ name: '无距离数据', value: 1, itemStyle: { color: '#64748b' } }]
    return {
      ...getChartBase(),
      tooltip: { ...chartTooltip, trigger: 'item' },
      series: [pieSeries(data)],
    }
  }

  /**
   * 构造时间分布柱状图 option。
   * 标签数 > 6 时旋转 32 度避免重叠。
   * @returns ECharts option
   */
  function buildTimeOption() {
    const buckets = timeBuckets.value
    const counts = buckets.map((bucket) => bucket.count)
    return {
      ...getChartBase(),
      grid: { left: 36, right: 12, top: 16, bottom: buckets.length > 6 ? 36 : 24 },
      xAxis: countCategoryAxis(
        buckets.map((bucket) => bucket.label),
        { adaptive: true, labelFontSize: 9, rotateThreshold: 6, sparseThreshold: Number.POSITIVE_INFINITY },
      ),
      yAxis: countValueAxis(counts),
      series: [
        {
          type: 'bar',
          data: counts,
          barWidth: '55%',
          itemStyle: {
            color: barGradient('#fbbf24'),
            borderRadius: [6, 6, 0, 0],
            shadowBlur: 8,
            shadowColor: 'rgba(251, 191, 36, 0.25)',
          },
        },
      ],
      tooltip: { ...chartTooltip, trigger: 'axis' },
    }
  }
  /**
   * 构造附加维度图 option。
   *  - local 模式：震中 Top 5 横向柱状图（按事件数排序）；
   *  - 远端模式：震源深度分布纵向柱状图。
   * @returns ECharts option
   */
  function buildExtraOption() {
    if (tab.value === 'local') {
      const places = topPlaces.value
      const labels = places.length ? places.map((place) => place.label) : ['暂无']
      const values = places.length ? places.map((place) => place.count) : [0]
      return {
        ...getChartBase(),
        grid: {
          left: 56,
          right: 16,
          top: 8,
          bottom: 8,
          outerBoundsMode: 'same',
          outerBoundsContain: 'axisLabel',
        },
        xAxis: countValueAxis(values, { minInterval: false }),
        yAxis: rankCategoryAxis(labels),
        series: [
          {
            type: 'bar',
            data: values,
            barWidth: 10,
            itemStyle: {
              color: barGradient('#7dd3fc'),
              borderRadius: [0, 6, 6, 0],
              shadowBlur: 6,
              shadowColor: 'rgba(125, 211, 252, 0.2)',
            },
          },
        ],
        tooltip: { ...chartTooltip, trigger: 'axis' },
      }
    }

    const buckets = depthBuckets.value
    const counts = buckets.map((bucket) => bucket.count)
    return {
      ...getChartBase(),
      grid: { left: 36, right: 12, top: 16, bottom: 24 },
      xAxis: countCategoryAxis(
        buckets.map((bucket) => bucket.label),
        { showAxisLine: false, hideAxisTick: false },
      ),
      yAxis: countValueAxis(counts, { showAxisLine: true }),
      series: [
        {
          type: 'bar',
          data: counts,
          barWidth: '52%',
          itemStyle: {
            color: barGradient('#7dd3fc'),
            borderRadius: [6, 6, 0, 0],
            shadowBlur: 6,
            shadowColor: 'rgba(125, 211, 252, 0.2)',
          },
        },
      ],
      tooltip: { ...chartTooltip, trigger: 'axis' },
    }
  }

  // 数据/周期/标签变化时重新调度渲染（深度监听以感知 items 内部变化）
  watch(
    [() => unref(props.items), () => unref(props.period), () => unref(props.tab)],
    () => {
      schedule()
    },
    { deep: true },
  )

  return {
    magChartRef,
    distChartRef,
    timeChartRef,
    extraChartRef,
    kpiCells,
  }
}

/** 地震预警配置向导组合式函数 */


/**
 * 地震预警配置向导 composable
 * - 引导用户完成 EEW（地震预警）配置：HOME ASSISTANT 连接 → 坐标 → 完成；
 * - 提供 HA 连接测试、城市预设选择、从 HA 同步坐标等交互能力；
 * - 完成后写入 localStorage 标记，避免重复弹出。
 */

/**
 * 地震预警配置向导 composable。
 *
 * @param props.modelValue 向导是否打开（v-model）
 * @param emit.update:modelValue 同步打开状态
 * @param emit.close        关闭事件
 * @returns 向导所需的响应式状态与方法（step / haUrl / haToken / 坐标 / testHa / syncFromHa / finish / skip 等）
 */
export function useEarthquakeSetupWizard(
  props: { modelValue: boolean },
  emit: {
    (e: 'update:modelValue', value: boolean): void
    (e: 'close'): void
  },
) {
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()
  const authStore = useAuthStore()
  const entitiesStore = useEntitiesStore()
  const haConnectionStore = useHaConnectionStore()

  // v-model 代理：读写 props.modelValue
  const open = computed({
    get: () => props.modelValue,
    set: (v) => emit('update:modelValue', v),
  })

  /**
   * 确保 layoutConfig.earthquakeConfig 存在；不存在则创建默认结构。
   * @returns 当前地震预警配置对象（确保非空）
   */
  function ensureEarthquakeConfig() {
    if (!layoutStore.layoutConfig.earthquakeConfig) {
      layoutStore.layoutConfig.earthquakeConfig = createDefaultEarthquakeConfig()
    }
    return layoutStore.layoutConfig.earthquakeConfig
  }

  /** 当前生效的 HA 地址（只读展示；连接地址单源在 stores/ha-connection.store.ts）。 */
  const haUrl = computed(() => haConnectionStore.baseUrl)

  /**
   * 判断系统中是否已配置 HOME ASSISTANT（有连接记录且保存过令牌）。
   *
   * 连接地址与令牌的唯一来源是 ha-connection store，不读 `layoutConfig.haConfig`。
   */
  function isHaConfiguredInSystem() {
    return haConnectionStore.configured && haConnectionStore.hasToken
  }

  /**
   * 解析向导初始步骤。
   *  - 若系统中已配置 HA 或 HA 实体已连接，跳过第 1 步（HA 配置），从第 2 步（坐标）开始；
   *  - 否则从第 1 步开始。
   * @returns 初始步骤序号（1 或 2）
   */
  function resolveInitialStep() {
    if (isHaConfiguredInSystem() || entitiesStore.connected) return 2
    return 1
  }

  // —— 表单响应式状态 ——
  /** 当前向导步骤（1=HA 配置，2=坐标，3=完成） */
  const step = ref(1)
  /** 纬度输入 */
  const latitude = ref('')
  /** 经度输入 */
  const longitude = ref('')
  /** HA 连接测试进行中 */
  const testingHa = ref(false)
  /** HA 测试状态：'' | 'success' | 'failed' */
  const haTestStatus = ref('')
  /** 测试失败时的具体原因（例如地址不合法 / 令牌无效 / 容器内不可达），用于替代笼统的"连接失败" */
  const haTestMessage = ref('')
  /** 测试成功时返回的 HA 版本号 */
  const haVersion = ref('')
  /** 从 HA 同步坐标进行中 */
  const syncing = ref(false)
  /** 保存配置进行中 */
  const saving = ref(false)
  /** 城市预设列表（来自 EEW_CITY_PRESETS 常量） */
  const cityPresets = EEW_CITY_PRESETS

  const cfg = computed(() => ensureEarthquakeConfig())
  const systemHaConfigured = computed(() => isHaConfiguredInSystem())

  /** 是否可以发起 HA 连接测试（有地址即可；令牌留在服务端，无需前端持有）。 */
  const canTestHa = computed(() => Boolean(haUrl.value.trim()))

  /**
   * 从服务端与本店配置加载向导初始状态。
   *  - HA 地址只读展示（来自连接记录），不再由向导编辑；
   *  - 若 HA 实体已连接，直接标记测试状态为 success；
   *  - 通过 resolveInitialStep 决定起始步骤。
   */
  async function loadFromSystem() {
    const eq = ensureEarthquakeConfig()

    // 连接记录是地址的唯一来源；向导只读展示，编辑入口在「设置 → 连接」。
    await haConnectionStore.load()
    latitude.value = String(eq.latitude || '')
    longitude.value = String(eq.longitude || '')
    haTestStatus.value = ''
    haTestMessage.value = ''
    haVersion.value = ''
    // 重新打开向导视为新会话，允许再次自动同步
    autoSyncAttempted = false
    step.value = resolveInitialStep()

    if (entitiesStore.connected) {
      haTestStatus.value = 'success'
    }

    // 已配置 HA 时直接落在坐标步骤，同样触发一次静默自动同步
    if (step.value === 2) void maybeAutoSyncCoords()
  }

  // 向导打开时：若配置未加载且已认证，则先加载配置；再从系统填充表单
  watch(open, async (v) => {
    if (!v) return
    if (!layoutStore.isConfigLoaded && authStore.isAuthenticated) {
      try {
        await layoutStore.loadConfig()
      } catch {
        /* 使用内存中已有配置 */
      }
    }
    await loadFromSystem()
  })

  /**
   * 选择城市预设，自动填充经纬度。
   * @param city 城市预设对象（含 lat / lon）
   */
  function selectCity(city: { lat: number; lon: number }) {
    latitude.value = String(city.lat)
    longitude.value = String(city.lon)
  }

  /**
   * 测试 HOME ASSISTANT 连接。
   * 调用后端 testHaConnection 接口，成功时记录 HA 版本并标记 success。
   * @throws 不抛出，所有异常都转化为 haTestStatus='failed'
   */
  async function testHa() {
    testingHa.value = true
    haTestStatus.value = ''
    haTestMessage.value = ''
    try {
      // 令牌留在服务端：只发地址，后端用已保存的令牌探测（/ha/test 的 accessToken 可省略）。
      const { data } = await testHaConnection({ baseUrl: haUrl.value.trim() })
      if (data.endpoints?.some((item) => item.ok)) {
        haVersion.value = data.version || ''
        haTestStatus.value = 'success'
      } else {
        haTestStatus.value = 'failed'
        // 后端返回不可达端点与原因，透传给用户，避免笼统误报为「连接失败」
        const failed = (data.endpoints || []).filter((item) => !item.ok)
        haTestMessage.value = failed.length
          ? `地址不可达：${failed.map((item) => `${item.label}（${item.error || '失败'}）`).join('；')}`
          : ''
      }
    } catch (e: unknown) {
      haTestStatus.value = 'failed'
      haTestMessage.value = getApiErrorMessage(e, '')
    } finally {
      testingHa.value = false
    }
  }

  /**
   * 从 HOME ASSISTANT 同步家庭坐标。
   *  1. 调用 syncEarthquakeHomeCoordsFromHa 拉取 HA 中的家庭坐标（后端从连接记录取地址）；
   *  2. 回填到表单的 latitude / longitude。
   * 失败时通过 chrome.notify 提示用户。
   */
  async function syncFromHa() {
    syncing.value = true
    try {
      await syncEarthquakeHomeCoordsFromHa((lat, lon) => {
        latitude.value = lat
        longitude.value = lon
      })
    } catch {
      chrome.notify('同步失败', 'error')
    } finally {
      syncing.value = false
    }
  }

  /** 本次向导会话内是否已尝试过自动同步（成功或失败都只尝试一次，避免反复请求） */
  let autoSyncAttempted = false

  /**
   * 判断当前是否适合自动同步坐标。
   * 条件：本次会话未尝试过、当前未在同步中、坐标尚未填写、且 HA 已配置或已连接。
   * @returns true 表示可以发起自动同步
   */
  function canAutoSyncCoords() {
    return (
      !autoSyncAttempted &&
      !syncing.value &&
      !latitude.value.trim() &&
      !longitude.value.trim() &&
      (systemHaConfigured.value || entitiesStore.connected)
    )
  }

  /**
   * 进入坐标步骤时静默自动同步一次家庭坐标。
   *  失败不打断流程也不弹警告（用户仍可点击「从 HA 自动同步」或选城市预设），
   *  成功则由 syncEarthquakeHomeCoordsFromHa 给出提示并回填经纬度。
   */
  async function maybeAutoSyncCoords() {
    if (!canAutoSyncCoords()) return
    autoSyncAttempted = true
    syncing.value = true
    try {
      // 不调用 applyHaFormToStore：后端从自身 HA 配置读取坐标，与前端表单未保存的编辑无关，
      // 写入 store 既无助于同步结果，还可能在 URL 为空时把默认 localhost 回填进内存配置。
      await syncEarthquakeHomeCoordsFromHa(
        (lat, lon) => {
          latitude.value = lat
          longitude.value = lon
        },
        { silent: true },
      )
    } catch {
      /* 自动同步失败保持静默，交由用户手动重试 */
    } finally {
      syncing.value = false
    }
  }

  /**
   * 进入下一步。
   *  - step 1 → 2：直接进入坐标步骤（HA 连接已在「设置 → 连接」保存，向导不再写连接配置）；
   *  - step 2 → 3：保存坐标到 cfg，若坐标有效则启用地震预警，进入完成步骤。
   */
  function nextStep() {
    if (step.value === 1) {
      step.value = 2
      // 进入坐标步骤时静默同步一次家庭坐标，省去用户手动点击
      void maybeAutoSyncCoords()
      return
    }
    if (step.value === 2) {
      cfg.value.latitude = latitude.value
      cfg.value.longitude = longitude.value
      if (latitude.value && longitude.value) cfg.value.enabled = true
      step.value = 3
    }
  }

  /**
   * 完成向导并保存配置。
   *  1. 写入 HA 表单到 store；
   *  2. 写入坐标到 cfg 并强制启用地震预警与 TTS（enableTts 默认开启）；
   *  3. 保存布局（saveLayout(true)）；
   *  4. 若已认证，重新加载配置以同步后端；
   *  5. 标记 localStorage 'eew_wizard_completed' = '1'；
   *  6. 关闭向导并发出 success 通知。
   * 失败时通过 notify 提示错误信息。
   * @throws 不抛出，所有异常都转化为错误通知
   */
  async function finish() {
    saving.value = true
    try {
      cfg.value.latitude = latitude.value
      cfg.value.longitude = longitude.value
      cfg.value.enabled = true
      cfg.value.enableTts = cfg.value.enableTts !== false
      const ok = await layoutStore.saveLayout(true)
      if (!ok) return
      if (authStore.isAuthenticated) await layoutStore.loadConfig()
      writeLocalStorage('eew_wizard_completed', '1')
      open.value = false
      emit('close')
      chrome.notify('地震预警配置已保存', 'success')
    } catch (e: unknown) {
      chrome.notify(`保存失败: ${getApiErrorMessage(e, '请稍后重试')}`, 'error')
    } finally {
      saving.value = false
    }
  }

  /**
   * 跳过向导。
   *  - 禁用地震预警（cfg.enabled = false）；
   *  - 立即标记 localStorage 并关闭向导（勿阻塞于 saveLayout，否则保存失败/慢时像“点了没反应”）；
   *  - 后台尽力保存布局；失败时已关闭向导且不再弹出，避免挡住主流程。
   *  - 发出 warning 通知提示用户可在设置中启用。
   */
  function skip() {
    cfg.value.enabled = false
    writeLocalStorage('eew_wizard_completed', '1')
    open.value = false
    emit('close')
    chrome.notify('已跳过地震预警配置，可在设置中随时启用', 'warning', 5000)
    void layoutStore.saveLayout(true)
  }

  return {
    open,
    step,
    haUrl,
    latitude,
    longitude,
    testingHa,
    haTestStatus,
    haTestMessage,
    haVersion,
    syncing,
    saving,
    cityPresets,
    cfg,
    systemHaConfigured,
    canTestHa,
    entitiesStore,
    haConnectionStore,
    selectCity,
    testHa,
    syncFromHa,
    nextStep,
    finish,
    skip,
  }
}

/** 地震预警数据源连接状态查询组合式函数 */

/**
 * 地震预警连接状态查询 composable（配合轮询或手动 refresh）。
 * - 封装对后端地震预警状态接口的查询；
 * - 从 payload 中派生 connected（已连接）/ connecting（连接中）状态。
 */
export function useEarthquakeStatusQuery(options: { immediate?: boolean } = {}) {
  const query = useApiQuery<EarthquakeStatusPayload>(async () => ({ data: await fetchEarthquakeStatus() }), {
    immediate: options.immediate !== false,
  })

  /** 是否已连接到预警数据源 */
  const connected = ref(false)
  /** 是否正在连接中（未连接且 wolfx.state === 'connecting'） */
  const connecting = ref(false)

  watch(
    query.data,
    (payload) => {
      if (!payload) {
        // payload 为空时统一重置为未连接
        connected.value = false
        connecting.value = false
        return
      }
      const wolfx = payload.wolfx
      // connected 优先取顶层字段，其次取 wolfx 集群/单点的 connected 字段
      connected.value = Boolean(payload.connected ?? wolfx?.clusterConnected ?? wolfx?.connected)
      connecting.value = !connected.value && wolfx?.state === 'connecting'
    },
    { immediate: true },
  )

  return {
    ...query,
    connected,
    connecting,
  }
}

/** 地震预警语音播报（TTS）模块 */

/**
 * 地震预警 TTS（文本转语音）模块
 * - 在地震预警倒计时阶段进行语音播报（震级、横波到达倒计时、烈度等）；
 * - 优先使用浏览器本地 SpeechSynthesis API，失败时回退到后端 HA 媒体播放器播报；
 * - 自动探测 TTS 模式（local/backend），避免每次播报都做静默失败的判定开销。
 */

/** 本地 TTS 静默失败判定窗口（毫秒） */
const SILENT_FAIL_MS = 800
/** 等待 voices 加载的超时时间（毫秒）：地震预警场景不能等太久 */
const VOICE_LOAD_TIMEOUT_MS = 500
/** 后端 TTS 失败后重试的间隔（毫秒） */
const BACKEND_TTS_RETRY_MS = 1500

/** 长相位循环播报的定时器（>15 秒阶段每 2 秒重复播报） */
let loopTimer: ReturnType<typeof setTimeout> | null = null
/** 静默失败检测定时器 */
let detectTimer: ReturnType<typeof setTimeout> | null = null
/** 当前正在播报的 utterance（用于在 stopSpeech 时清理回调） */
let activeUtterance: SpeechSynthesisUtterance | null = null
/** 上一次播报的倒计时秒数（用于避免同一秒重复播报） */
let lastSpokenSecond = -1
/** "横波已到达"提示是否已播报（避免重复播报） */
let arrivedSpoken = false
// TTS 模式状态机：
// 'unknown' → 首次调用时探测；
// 'local'   → 本地 TTS 可用并已确认；
// 'backend' → 本地不可用或失败，回退到后端 TTS。
let ttsMode: 'unknown' | 'local' | 'backend' = 'unknown'
/** 本地 TTS 连续失败计数（达到 LOCAL_FAIL_THRESHOLD 时切换到后端） */
let localFailCount = 0
/** 本地 TTS 连续失败多少次后切换到后端 */
const LOCAL_FAIL_THRESHOLD = 2
/** 是否已警告过本地回退（避免日志刷屏） */
let localFallbackWarned = false
/** 是否已警告过后端缺少音箱（避免日志刷屏） */
let backendMissingWarned = false
/** 是否已警告过后端紧急回退（避免日志刷屏） */
let backendFallbackWarned = false

/**
 * 仅警告一次本地 TTS 回退（避免重复刷屏）。
 * @param message 警告消息
 */
function warnLocalFallback(message: string) {
  if (localFallbackWarned) return
  localFallbackWarned = true
  logger.warn(message)
}

// Android WebView 上 AudioContext 默认是 suspended 状态，需要主动 resume。
async function ensureAudioContextResumed(ctx: AudioContext): Promise<void> {
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume()
    } catch {
      // 忽略：部分 WebView 不允许 resume
    }
  }
}

/**
 * 播放"横波已到达"的蜂鸣提示音。
 * 使用 800/600/400Hz 三个方波组成短促警示音。
 */
function playArrivalBeep() {
  try {
    const Ctx =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    void ensureAudioContextResumed(ctx).then(() => {
      const t0 = ctx.currentTime
      ;[800, 600, 400].forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'square'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.2, t0 + i * 0.15)
        gain.gain.exponentialRampToValueAtTime(0.01, t0 + i * 0.15 + 0.15)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(t0 + i * 0.15)
        osc.stop(t0 + i * 0.15 + 0.18)
      })
      setTimeout(() => void ctx.close(), 800)
    })
  } catch {
    /* ignore：蜂鸣失败不影响 TTS 主流程 */
  }
}

/**
 * 构造完整预警播报文本。
 * @param p            地震预警 payload
 * @param countdownSec 横波到达倒计时（秒）
 * @returns 完整的播报文案
 */
function buildFullAlertText(p: EarthquakeAlertPayload, countdownSec: number): string {
  return `地震预警！地震预警！检测到地震，震级${p.magnitude.toFixed(1)}级，横波${countdownSec}秒后到达，预估烈度${p.localIntensity}度。立即避险！`
}

/**
 * 通过后端 HA 媒体播放器进行 TTS 播报。
 */
async function speakViaBackend(text: string, retry = true): Promise<boolean> {
  try {
    const entitiesStore = useEntitiesStore()
    const mediaPlayerIds = resolveTtsMediaPlayerIds(entitiesStore.entities, {
      emergencyFallback: true,
    })

    if (mediaPlayerIds.length === 0) {
      if (!backendMissingWarned) {
        backendMissingWarned = true
        logger.warn('地震预警 TTS:未配置后端播报音箱,请在设置 → 语音中配置播报音箱')
      }
      return false
    }

    const configured = resolveTtsMediaPlayerIds(entitiesStore.entities)
    if (!configured.length && !backendFallbackWarned) {
      backendFallbackWarned = true
      logger.warn(`地震预警 TTS:未配置播报音箱,紧急回退到 ${mediaPlayerIds[0]}`)
    }

    const { data } = await speakVoiceMultiple({
      message: text,
      mediaPlayers: mediaPlayerIds,
    })

    return !!data?.success
  } catch (e) {
    logger.warn('地震预警后端 TTS 失败', e)
    if (retry) {
      await new Promise((resolve) => setTimeout(resolve, BACKEND_TTS_RETRY_MS))
      return speakViaBackend(text, false)
    }
    return false
  }
}

/**
 * 地震预警 TTS composable。
 */
export function useEarthquakeTts(
  enabled: () => boolean,
  isAlerting: Ref<boolean>,
  payload: () => EarthquakeAlertPayload | null,
  currentCountdown: Ref<number>,
) {
  /**
   * 停止所有 TTS 播报。
   */
  function stopSpeech() {
    if (loopTimer) {
      clearTimeout(loopTimer)
      loopTimer = null
    }
    if (detectTimer) {
      clearTimeout(detectTimer)
      detectTimer = null
    }
    if (activeUtterance) {
      activeUtterance.onend = null
      activeUtterance.onerror = null
      activeUtterance = null
    }
    cancelLocalSpeech()
  }

  /**
   * 重置 TTS 模式探测状态。
   */
  function resetTtsMode() {
    ttsMode = 'unknown'
    localFailCount = 0
    resetLocalSpeechVoice()
    localFallbackWarned = false
    backendMissingWarned = false
    backendFallbackWarned = false
    logger.info('TTS 模式已重置')
  }

  /**
   * 播报文本（本机优先，失败回退 HA）。
   */
  async function speak(text: string, rate = 0.85, onEnd?: () => void) {
    if (!enabled() || !isAlerting.value) return

    if (ttsMode === 'backend') {
      await speakViaBackend(text)
      onEnd?.()
      return
    }

    if (ttsMode === 'local') {
      const synth = getSpeechSynth()
      if (!synth) {
        ttsMode = 'backend'
        await speakViaBackend(text)
        onEnd?.()
        return
      }
      synth.cancel()
      const raw = speakViaLocalRaw(text, rate)
      if (!raw) {
        ttsMode = 'backend'
        await speakViaBackend(text)
        onEnd?.()
        return
      }
      const { utter } = raw
      utter.onend = () => {
        activeUtterance = null
        onEnd?.()
      }
      utter.onerror = () => {
        activeUtterance = null
        localFailCount++
        if (localFailCount >= LOCAL_FAIL_THRESHOLD) {
          warnLocalFallback(`本地 TTS 连续失败 ${localFailCount} 次，切换到后端 TTS`)
          ttsMode = 'backend'
          localFailCount = 0
          void speakViaBackend(text).then(() => onEnd?.())
        } else {
          onEnd?.()
        }
      }
      activeUtterance = utter
      return
    }

    const voices = await waitForVoices(VOICE_LOAD_TIMEOUT_MS)

    if (voices.length === 0) {
      warnLocalFallback('本地 TTS 无可用语音，使用后端 TTS')
      ttsMode = 'backend'
      await speakViaBackend(text)
      onEnd?.()
      return
    }

    const synth = getSpeechSynth()!
    synth.cancel()
    const raw = speakViaLocalRaw(text, rate)
    if (!raw) {
      warnLocalFallback('本地 TTS 不可用，切换到后端 TTS')
      ttsMode = 'backend'
      await speakViaBackend(text)
      onEnd?.()
      return
    }
    const { utter, hasStarted } = raw

    utter.onend = () => {
      activeUtterance = null
      localFailCount = 0
      onEnd?.()
    }
    utter.onerror = (e) => {
      activeUtterance = null
      if (!hasStarted() && e.error !== 'canceled') {
        warnLocalFallback('本地 TTS 报错，切换到后端 TTS')
        ttsMode = 'backend'
        void speakViaBackend(text).then(() => onEnd?.())
      } else {
        onEnd?.()
      }
    }
    activeUtterance = utter

    detectTimer = setTimeout(() => {
      detectTimer = null
      if (activeUtterance !== utter) return
      if (hasStarted()) {
        ttsMode = 'local'
        localFailCount = 0
        return
      }
      warnLocalFallback('本地 TTS 静默失败，切换到后端 TTS')
      ttsMode = 'backend'
      synth.cancel()
      activeUtterance = null
      void speakViaBackend(text).then(() => onEnd?.())
    }, SILENT_FAIL_MS)
  }

  function startLongPhaseLoop() {
    const p = payload()
    if (!p || !enabled() || !isAlerting.value) return
    const sec = Math.max(0, Math.round(currentCountdown.value))
    speak(buildFullAlertText(p, sec), 0.9, () => {
      if (isAlerting.value && currentCountdown.value > 15) {
        loopTimer = setTimeout(startLongPhaseLoop, 2000)
      }
    })
  }

  function handleCountdownChange(countdown: number) {
    if (!enabled() || !isAlerting.value) return
    const sec = Math.round(countdown)

    if (countdown > 15) {
      arrivedSpoken = false
      if (sec !== lastSpokenSecond && (sec % 15 === 0 || lastSpokenSecond === -1)) {
        stopSpeech()
        lastSpokenSecond = sec
        startLongPhaseLoop()
      }
      return
    }

    if (countdown > 0) {
      arrivedSpoken = false
      if (sec !== lastSpokenSecond) {
        stopSpeech()
        lastSpokenSecond = sec
        speak(String(sec), 0.8)
      }
      return
    }

    if (!arrivedSpoken) {
      stopSpeech()
      arrivedSpoken = true
      lastSpokenSecond = 0
      playArrivalBeep()
      speak('横波已到达！请保持避险姿势！', 0.85)
    }
  }

  watch(
    () => enabled() && isAlerting.value,
    (active) => {
      if (active) {
        lastSpokenSecond = -1
        arrivedSpoken = false
        getLoadedVoices()
        handleCountdownChange(currentCountdown.value)
      } else {
        stopSpeech()
        lastSpokenSecond = -1
        arrivedSpoken = false
      }
    },
    { immediate: true },
  )

  watch(currentCountdown, (val) => {
    if (enabled() && isAlerting.value) handleCountdownChange(val)
  })

  onUnmounted(stopSpeech)

  return { stopSpeech, resetTtsMode }
}
