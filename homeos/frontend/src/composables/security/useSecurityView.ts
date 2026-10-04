/**
 * @file useSecurityView.ts
 * @module composables/security
 * @description 安防视图 composable，管理安防页的 Tab 切换、监控状态、门禁事件日历等。
 *   - 定义三个 Tab（总览/监控/事件）的元信息与跳转配置
 *   - 组合 useSecuritySensors / useSecurityPanelStatus 提供告警数与布防状态
 *   - 派生 hero 指标、降级横幅文案、HA 重连逻辑
 *   - 提供门禁事件日历：按月渲染、按日筛选、视频预览、缩略图滚动
 * @dependencies vue, vue-router, @lucide/vue, @/utils/core/logger, @/stores/entities.store, @/stores/layout.store, @/services/api/security, @/composables/security/*, @/composables/entity/*, @homeos/shared, @/composables/orchestrator/useYamlValidation, @/composables/ui/useHaDegrade, @/utils/format/locale-format.util, @/utils/registry/settings-route.util
 */
import { ref, computed, watch } from 'vue'
import type { Component } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Shield, Video, Clock } from '@lucide/vue'
import { logger } from '@/utils/core/logger'
import { useEntitiesStore } from '@/stores/entities.store'
import { useLayoutStore } from '@/stores/layout.store'
import { fetchSecurityEvents, validateSecurityEvents } from '@/services/api/security'
import { useSecuritySensors } from '@/composables/security/useSecuritySensors'
import { useSecurityPanelStatus } from '@/composables/security/useSecurityPanelStatus'
import { useRouteEntityProjection } from '@/composables/entity/useRouteEntityProjection'
import { useEnsureVisibleEntities } from '@/composables/entity/useEnsureVisibleEntities'
import { useHaDegrade } from '@/composables/ui/useHaDegrade'
import { collectHazardWatchedEntityIds } from '@homeos/shared'
import { useYamlValidation } from '@/composables/security/useYamlValidation'
import { formatLocaleDate } from '@/utils/format/locale-format.util'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'

/** 安防页 Tab ID 常量列表 */
const SEC_TAB_IDS = ['overview', 'monitor', 'events'] as const
/** 安防页 Tab ID 类型 */
type SecTabId = (typeof SEC_TAB_IDS)[number]

/** 单个 Tab 的元信息结构 */
type SecTabMeta = {
  /** Tab ID */
  id: SecTabId
  /** Tab 显示名称 */
  label: string
  /** Tab 提示文案 */
  hint: string
  /** 主题色调 */
  tone: string
  /** 图标组件 */
  icon: Component
  /** 设置页跳转路径 */
  settingsTo: string
  /** 设置入口按钮文案 */
  settingsLabel: string
}

// Tab ID 集合，用于快速校验
const SEC_TAB_SET = new Set<string>(SEC_TAB_IDS)

/** Tab 元信息映射 */
const SEC_TAB_META: Record<SecTabId, SecTabMeta> = {
  overview: {
    id: 'overview',
    label: '安防总览',
    hint: '布防状态、区域传感器与告警一览',
    tone: 'pink',
    icon: Shield,
    settingsTo: SETTINGS_ROUTES.securityModes(),
    settingsLabel: '场景配置',
  },
  monitor: {
    id: 'monitor',
    label: '监控中心',
    hint: '摄像头画面与监控回放',
    tone: 'pink',
    icon: Video,
    settingsTo: SETTINGS_ROUTES.securityModes(),
    settingsLabel: '场景配置',
  },
  events: {
    id: 'events',
    label: '门禁事件',
    hint: '门铃抓拍与门禁活动时间轴',
    tone: 'pink',
    icon: Clock,
    settingsTo: SETTINGS_ROUTES.securityModes(),
    settingsLabel: '场景配置',
  },
}

/**
 * 解析路由参数为合法 Tab ID
 * @param raw 原始路由参数
 * @returns 合法 Tab ID，非法时回退为 overview
 */
function resolveSecTab(raw: unknown): SecTabId {
  const id = String(Array.isArray(raw) ? raw[0] : raw || '').trim()
  return SEC_TAB_SET.has(id) ? (id as SecTabId) : 'overview'
}
/**
 * 安防视图 composable
 * @returns 响应式状态、Tab 信息、监控指标、门禁事件日历与方法
 */
export function useSecurityView() {
  const router = useRouter()
  const route = useRoute()
  const entitiesStore = useEntitiesStore()
  const layoutStore = useLayoutStore()

  // 当前 Tab，从路由 query.tab 解析
  const secTab = ref<SecTabId>(resolveSecTab(route.query.tab))

  // 路由 query.tab 变化时同步当前 Tab
  watch(
    () => route.query.tab,
    (tab) => {
      secTab.value = resolveSecTab(tab)
    },
  )

  const { alertCount } = useSecuritySensors()
  const { currentMode, zones, refresh: refreshPanel } = useSecurityPanelStatus()

  // Hub Tab 列表：总览 Tab 显示告警数角标
  const hubTabs = computed(() =>
    SEC_TAB_IDS.map((id) => {
      const meta = SEC_TAB_META[id]
      return {
        id,
        label: meta.label,
        // 仅总览 Tab 在有告警时显示角标
        count: id === 'overview' && alertCount.value > 0 ? alertCount.value : undefined,
      }
    }),
  )

  // 当前 Tab 的元信息
  const tabMeta = computed(() => SEC_TAB_META[secTab.value])

  // 配置入口链接列表
  const configLinks = computed(() => [
    { label: '场景配置', to: SETTINGS_ROUTES.securityModes() },
    { label: '集成绑定', to: SETTINGS_ROUTES.bindings() },
  ])

  // 全部摄像头实体 ID 列表
  const allCameras = computed(() => layoutStore.layoutConfig.haConfig.securityCameras || [])

  // 当前模式名称：优先使用配置名称，缺省回退到中文映射
  const modeLabel = computed(() => {
    const mode = currentMode.value
    const named = (layoutStore.layoutConfig.securityModes || []).find((m) => m.key === mode)
    if (named?.name) return named.name
    const fallback: Record<string, string> = {
      disarmed: '撤防',
      armed_home: '在家',
      armed_away: '离家',
      armed_night: '夜间',
    }
    return fallback[mode] || mode || '—'
  })

  // 已布防区域数量
  const armedZoneCount = computed(() => zones.value.filter((z) => z.armed).length)

  // 危险传感器受监测的实体 ID 列表
  const hazardWatchedIds = computed(() =>
    collectHazardWatchedEntityIds(layoutStore.layoutConfig.haConfig || {}),
  )

  // 安防相关实体 ID 集合：摄像头 + 危险传感器 + 区域传感器
  const securityEntityIds = computed(() => {
    const ids = [...allCameras.value, ...hazardWatchedIds.value]
    for (const z of zones.value) {
      for (const sid of z.sensors || []) ids.push(sid)
    }
    // 去重并过滤空值
    return [...new Set(ids.filter(Boolean))]
  })

  // 投影路由实体并确保可见，供详情面板使用
  useRouteEntityProjection(securityEntityIds)
  useEnsureVisibleEntities(securityEntityIds)

  /**
   * 判断摄像头是否离线
   * @param camId 摄像头实体 ID
   * @returns 离线返回 true；无 ID、实体不存在或状态为 unavailable/unknown 时均视为离线
   */
  function isCameraOffline(camId: string) {
    if (!camId) return true
    void entitiesStore.getDomainEpoch('camera')
    const entity = entitiesStore.entities[camId]
    return !entity || entity.state === 'unavailable' || entity.state === 'unknown'
  }

  // 离线传感器数量：遍历所有区域的传感器
  const offlineSensorCount = computed(() => {
    void entitiesStore.getDomainEpoch('binary_sensor')
    void entitiesStore.getDomainEpoch('sensor')
    let count = 0
    for (const zone of zones.value) {
      for (const sid of zone.sensors || []) {
        const entity = entitiesStore.entities[sid]
        if (!entity || entity.state === 'unavailable' || entity.state === 'unknown') count++
      }
    }
    return count
  })

  // 离线摄像头数量
  const offlineCameraCount = computed(
    () => allCameras.value.filter((camId) => isCameraOffline(camId)).length,
  )

  // 在线摄像头数量
  const onlineCameraCount = computed(
    () => allCameras.value.length - offlineCameraCount.value,
  )

  // Hero 区指标：布防/告警/区域/监控
  const heroMetrics = computed(() => {
    const zoneTotal = zones.value.length
    const camTotal = allCameras.value.length
    const alerts = alertCount.value
    const armed = currentMode.value !== 'disarmed'
    return [
      {
        key: 'mode',
        label: '布防',
        value: modeLabel.value,
        // 未布防灰色；告警红色；已布防琥珀色
        tone: !armed ? 'muted' : alerts > 0 ? 'red' : 'amber',
      },
      {
        key: 'alert',
        label: '告警',
        value: String(alerts),
        tone: alerts > 0 ? 'red' : 'emerald',
      },
      {
        key: 'zones',
        label: '区域',
        value: zoneTotal ? `${armedZoneCount.value}/${zoneTotal}` : '—',
        tone: 'pink',
      },
      {
        key: 'cams',
        label: '监控',
        value: camTotal ? String(onlineCameraCount.value) : '—',
        // 存在离线摄像头时橙色，否则紫色
        tone: camTotal && offlineCameraCount.value > 0 ? 'orange' : 'violet',
      },
    ]
  })
  // 是否展示降级横幅：连接异常或存在离线设备时显示
  const showSecDegradeBanner = computed(
    () =>
      !entitiesStore.connected ||
      entitiesStore.reconnecting ||
      entitiesStore.entitiesStale ||
      offlineSensorCount.value > 0 ||
      offlineCameraCount.value > 0,
  )

  // HA 重连流程复用 useHaDegrade（保留安防域原有的重连通知文案）
  const { retryHaConnection } = useHaDegrade({
    reconnectingMessage: '正在重新连接 HA…',
  })

  // 降级横幅文案：聚合各项异常原因
  const secDegradeText = computed(() => {
    const parts: string[] = []
    if (entitiesStore.reconnecting) parts.push('正在重新连接 Home Assistant')
    else if (!entitiesStore.connected) parts.push('HA 已断连，布防/传感器读数来自最后缓存')
    else if (entitiesStore.entitiesStale) parts.push('实体数据可能已过期')
    if (offlineSensorCount.value > 0) {
      parts.push('{n} 个区域传感器离线或未同步'.replace('{n}', String(offlineSensorCount.value)))
    }
    if (offlineCameraCount.value > 0) {
      parts.push('{n} 路监控 camera 不可用'.replace('{n}', String(offlineCameraCount.value)))
    }
    if (parts.length === 0) return '部分安防数据源不可用'
    return `${parts.join('；')}${'。新告警可能无法实时显示，恢复 HA 连接后请刷新页面。'}`
  })

  // 星期标签：日,一,二,三,四,五,六
  const weekdayLabels = computed(() => '日,一,二,三,四,五,六'.split(','))
  // 是否配置了门禁事件路径
  const hasEvents = computed(() => !!layoutStore.layoutConfig.haConfig.eventsPath?.trim())
  // 事件加载中标记
  const loadingEvents = ref(false)
  // 事件路径连通性校验
  const eventsValidation = useYamlValidation({
    method: 'get',
    endpoint: '/security/events/validate',
    request: async () => {
      const { data } = await validateSecurityEvents()
      return (data || {}) as Record<string, unknown>
    },
    mapMessage: (data: { message?: string } | undefined, ok: boolean) =>
      data?.message || (ok ? '连通正常' : '校验失败'),
  })
  const validatingEvents = eventsValidation.validating
  const eventsValidateMsg = eventsValidation.message
  const eventsValidateOk = eventsValidation.valid

  /**
   * 触发事件路径连通性校验
   */
  async function validateEventsPath() {
    await eventsValidation.validate('')
  }

  // 门禁事件列表
  const events = ref<
    Array<{
      date?: string
      video?: string
      clip?: string
      mp4?: string
      recording?: string
      thumbnail?: string
      [key: string]: unknown
    }>
  >([])
  // 日历选中日期
  const selectedDate = ref(new Date())
  // 选中日期内的事件索引
  const selectedEventIdx = ref(0)
  // 是否全屏查看视频
  const isFullscreenViewer = ref(false)
  // 是否显示视频（而非缩略图）
  const eventShowVideo = ref(false)
  // 视频加载失败标记（例如录像已被删除/过期），失败时回退显示截图
  const videoError = ref(false)
  // 缩略图容器引用，用于滚动定位
  const thumbnailsContainerRef = ref<HTMLElement | null>(null)

  // 当前选中年份
  const currentYear = computed(() => selectedDate.value.getFullYear())
  // 当前选中月份
  const currentMonth = computed(() => selectedDate.value.getMonth())
  // 日历天数网格：包含上月末尾、本月全部、下月开头，凑齐整周
  const calendarDays = computed(() => {
    const y = currentYear.value
    const m = currentMonth.value
    // 本月第一天是星期几（0=周日）
    const firstDay = new Date(y, m, 1).getDay()
    // 本月总天数
    const lastDate = new Date(y, m + 1, 0).getDate()
    // 上月总天数
    const prevLastDate = new Date(y, m, 0).getDate()
    const days: Array<{ day: number; isCurrentMonth: boolean; date: Date }> = []
    // 上月末尾几天填充首周
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({
        day: prevLastDate - i,
        isCurrentMonth: false,
        date: new Date(y, m - 1, prevLastDate - i),
      })
    }
    // 本月全部天数
    for (let i = 1; i <= lastDate; i++) {
      days.push({ day: i, isCurrentMonth: true, date: new Date(y, m, i) })
    }
    // 仅补齐最后一周（多数月份 5 行），不强制 6 行，避免空白过多
    const remaining = (7 - (days.length % 7)) % 7
    for (let i = 1; i <= remaining; i++) {
      days.push({ day: i, isCurrentMonth: false, date: new Date(y, m + 1, i) })
    }
    return days
  })

  /**
   * 判断两个日期是否同一天
   * @param a 日期 a
   * @param b 日期 b
   * @returns 同一天返回 true
   */
  function isSameDay(a: Date, b: Date) {
    return (
      a &&
      b &&
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    )
  }

  // 选中日期的 ISO 字符串（en-CA 格式：YYYY-MM-DD），用于匹配事件 date 字段
  const selectedDateStr = computed(() =>
    formatLocaleDate(
      selectedDate.value,
      { year: 'numeric', month: '2-digit', day: '2-digit' },
      'en-CA',
    ),
  )
  // 选中日期内的事件列表
  const dayEvents = computed(() => events.value.filter((e) => e.date === selectedDateStr.value))

  // 当前选中事件的视频地址：优先 video，依次回退 clip/mp4/recording
  const currentEventVideo = computed(() => {
    const ev = dayEvents.value[selectedEventIdx.value]
    return ev?.video || ev?.clip || ev?.mp4 || ev?.recording || ''
  })

  /**
   * 钳制选中事件索引到合法范围
   */
  function clampSelectedEventIdx() {
    const max = Math.max(0, dayEvents.value.length - 1)
    if (selectedEventIdx.value > max) selectedEventIdx.value = max
  }

  /** 切换到上个月 */
  function prevMonth() {
    selectedDate.value = new Date(currentYear.value, currentMonth.value - 1, 1)
  }

  /** 切换到下个月 */
  function nextMonth() {
    selectedDate.value = new Date(currentYear.value, currentMonth.value + 1, 1)
  }

  /**
   * 选择某个日期，并重置事件索引
   * @param d 目标日期
   */
  function selectDate(d: Date) {
    selectedDate.value = d
    selectedEventIdx.value = 0
  }

  /**
   * 点击事件项：更新选中索引并根据是否有视频切换显示
   * @param idx 事件索引
   */
  function onEventClick(idx: number) {
    selectedEventIdx.value = idx
    const ev = dayEvents.value[idx]
    const hasVideo = !!(ev?.video || ev?.clip || ev?.mp4 || ev?.recording)
    eventShowVideo.value = hasVideo
    videoError.value = false
  }

  // 切换事件/日期时重置视频失败标记
  watch(
    () => [selectedEventIdx.value, currentEventVideo.value, selectedDateStr.value],
    () => {
      videoError.value = false
    },
  )

  // 选中事件索引变化时，滚动缩略图到视口中央
  watch(selectedEventIdx, () => {
    if (thumbnailsContainerRef.value) {
      const imgs = thumbnailsContainerRef.value.querySelectorAll('img')
      const target = imgs[selectedEventIdx.value] as HTMLElement | undefined
      if (target) {
        thumbnailsContainerRef.value.scrollTo({
          left:
            target.offsetLeft -
            thumbnailsContainerRef.value.offsetWidth / 2 +
            target.offsetWidth / 2,
          behavior: 'smooth',
        })
      }
    }
  })

  // 当日事件列表变化时，钳制选中索引
  watch(dayEvents, () => {
    clampSelectedEventIdx()
  })
  /**
   * 拉取门禁事件列表
   * @sideEffects 更新 events/loadingEvents/eventsValidateOk/eventsValidateMsg
   * @exceptions 捕获异常后记录 error 日志并提示用户校验 eventsPath
   */
  async function fetchEvents() {
    const path = layoutStore.layoutConfig.haConfig.eventsPath?.trim()
    // 未配置路径时清空事件列表
    if (!path) {
      events.value = []
      return
    }
    loadingEvents.value = true
    try {
      const res = await fetchSecurityEvents()
      events.value = res.data || []
      // 路径可读但无事件记录时标记校验失败
      if (!events.value.length) {
        eventsValidateOk.value = false
        eventsValidateMsg.value = '路径可读但暂无事件记录'
      }
    } catch (e) {
      logger.error('获取安全事件失败', e)
      events.value = []
      eventsValidateOk.value = false
      eventsValidateMsg.value = '拉取事件失败，请点击「测试连通」检查 eventsPath'
    } finally {
      loadingEvents.value = false
      clampSelectedEventIdx()
    }
  }

  // 刷新进行中标记
  const refreshing = ref(false)

  /**
   * 刷新安防数据：并行刷新面板状态与门禁事件
   * @sideEffects 已在刷新时跳过
   */
  async function refreshSecurity() {
    // 防止重复刷新
    if (refreshing.value) return
    refreshing.value = true
    try {
      await Promise.all([refreshPanel(), fetchEvents()])
    } finally {
      refreshing.value = false
    }
  }

  // 配置加载完成且 eventsPath 存在时自动拉取事件
  watch(
    [() => layoutStore.isConfigLoaded, () => layoutStore.layoutConfig.haConfig.eventsPath],
    ([loaded, path]) => {
      if (loaded && path) fetchEvents()
    },
    { immediate: true },
  )

  return {
    router,
    layoutStore,
    entitiesStore,
    secTab,
    hubTabs,
    tabMeta,
    configLinks,
    heroMetrics,
    refreshing,
    refreshSecurity,
    alertCount,
    showSecDegradeBanner,
    secDegradeText,
    retryHaConnection,
    hasEvents,
    loadingEvents,
    validatingEvents,
    eventsValidateMsg,
    eventsValidateOk,
    validateEventsPath,
    weekdayLabels,
    currentYear,
    currentMonth,
    calendarDays,
    isSameDay,
    selectedDate,
    selectedEventIdx,
    dayEvents,
    currentEventVideo,
    isFullscreenViewer,
    eventShowVideo,
    videoError,
    thumbnailsContainerRef,
    prevMonth,
    nextMonth,
    selectDate,
    onEventClick,
    fetchEvents,
  }
}