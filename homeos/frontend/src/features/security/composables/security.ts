import { formatSecurityTime, formatLocaleDate } from '@/kernel/utils/format'
import { ref, computed, type Ref, type Component, watch, type ComputedRef, shallowRef, onMounted, onUnmounted, toRaw } from 'vue'
import { fetchSecurityPanelEvents, fetchSecurityEvents, validateSecurityEvents, fetchSecurityPanelStatus } from '@/domain/api/security'
import { logger } from '@/kernel/utils/core/index'
import { getApiErrorMessage } from '@/kernel/utils/core/index'
import { useChromeStore } from '@/kernel/ui/chrome/chrome-store'
import { getMaxRemoteNotifications } from '@/kernel/config/frontend-config'
import { mapSecurityEventRow, filterSecurityEvents, recentLinkageFailures, type SecurityEventDisplayItem } from '@/features/security/utils/index'
import { Shield, ShieldOff, ShieldCheck, AlertTriangle, Siren, Bell, WifiOff, Activity, Flame, Droplets, Wind, DoorOpen } from '@lucide/vue'
import { useYamlValidation } from '@/features/security/composables/use-yaml-validation'
import { buildSecurityCalendarDays, isSameCalendarDay, resolveSecurityEventVideo, type SecurityDoorEvent } from '@/features/security/composables/security-view'
import { useAuthStore } from '@/domain/auth/auth.store'
import { registerSecurityPanelRefreshHandler, registerSecurityPanelModeHandler, type SecurityModeSocketPayload } from '@/kernel/utils/bridge/store-bridge'
import { sharedFetch, schedulePoll, invalidateSharedFetch } from '@/kernel/utils/core/index'
import { getEntityDomain, buildHazardBindingMap, type HazardSensorKind, getEntityLeaf } from '@homeos/shared'
import { useEntitiesStore } from '@/domain/entity/store/entities.store'
import { useLayoutStore } from '@/domain/layout/store/index'
import { getEntityDisplayName } from '@/domain/entity/model/utils/derived'
import { isSecurityUtilityNoise } from '@/features/security/utils/index'
import { isSensorAlertState } from '@/features/security/utils/index'

/* ── 原 useSecurityAuditEvents.ts 的实现 ── */

/**
 * 会话内即时事件结构
 */
interface SecSessionEvent {
  /** 事件唯一 ID（基于时间戳与自增序列） */
  id: string
  /** 图标组件 */
  icon: Component
  /** 事件文案 */
  label: string
  /** 本地化时间字符串 */
  time: string
  /** CSS 类名 */
  css: string
  /** 时间戳（毫秒） */
  ts: number
  /** 关联区域 ID 列表 */
  zoneIds?: string[]
}

/**
 * 安防审计事件日志：会话内即时事件 + 后端审计事件的合并、过滤与拉取。
 * 从 SecurityOverview.vue 抽出，便于复用与单测。
 * @param liveZones 实时区域列表，用于生成区域过滤项
 * @returns 响应式状态与操作方法
 */
export function useSecurityAuditEvents(liveZones: Ref<Array<{ id: string; name: string }>> = ref([])) {
  const chrome = useChromeStore()
  // 会话内即时事件队列，最多保留 30 条
  const secSessionEvents = ref<SecSessionEvent[]>([])
  const secDbEvents = ref<SecurityEventDisplayItem[]>([])
  // 当前过滤项：all / hazard / linkage / false_alarm_feedback / zone:{id}
  const secEventFilter = ref('all')
  // 审计事件加载中标记
  const secAuditLoading = ref(false)
  const secAuditError = ref('')
  // 事件类型到图标组件的映射
  const secEventIconMap: Record<string, Component> = {
    shield: Shield,
    shieldOff: ShieldOff,
    shieldCheck: ShieldCheck,
    alert: AlertTriangle,
    siren: Siren,
    bell: Bell,
    wifiOff: WifiOff,
    activity: Activity,
  }
  // 过滤选项列表：基础类型 + 最多 8 个区域过滤项
  const secEventFilters = computed(() => {
    const base = [
      { key: 'all', label: '全部' },
      { key: 'hazard', label: '危险传感器' },
      { key: 'linkage', label: '联动失败' },
      { key: 'false_alarm_feedback', label: '误报' },
    ]
    // 仅保留有 id 与 name 的区域，最多取前 8 个，避免过滤栏过长
    const zoneFilters = (liveZones.value || [])
      .filter((z) => z.id && z.name)
      .slice(0, 8)
      .map((z) => ({ key: `zone:${z.id}`, label: z.name }))
    return zoneFilters.length ? [...base, ...zoneFilters] : base
  })
  // 合并会话事件与后端事件，按时间戳倒序后裁剪到上限
  const secEvents = computed(() => {
    const cap = getMaxRemoteNotifications()
    return [...secSessionEvents.value, ...secDbEvents.value].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, cap)
  })
  // 按当前过滤项过滤后的事件列表
  const displayedSecEvents = computed(() =>
    filterSecurityEvents(secEvents.value as SecurityEventDisplayItem[], secEventFilter.value),
  )
  // 最近的联动失败事件，用于提示用户
  const linkageFailureRecent = computed(() => recentLinkageFailures(secDbEvents.value))
  // 会话事件自增序列，配合时间戳生成唯一 ID
  let secSessionEventSeq = 0

  /**
   * 推送一条会话内即时事件
   * @param icon 图标组件
   * @param label 事件文案
   * @param css CSS 类名
   * @param meta.zoneIds 关联区域 ID 列表
   * @sideEffects 在队列头部插入新事件，超过 30 条时裁剪
   */
  function addSecEvent(icon: Component, label: string, css: string, meta?: { zoneIds?: string[] }) {
    const ts = Date.now()
    const time = formatSecurityTime(ts)
    secSessionEvents.value.unshift({
      id: `session-${ts}-${++secSessionEventSeq}`,
      icon,
      label,
      time,
      css,
      ts,
      zoneIds: meta?.zoneIds,
    })
    // 会话事件最多保留 30 条，超出部分截断
    if (secSessionEvents.value.length > 30) secSessionEvents.value.length = 30
  }

  /**
   * 拉取后端审计事件
   * @sideEffects 更新 secDbEvents/secAuditLoading
   * @exceptions 捕获异常后 toast 并记录 error 日志，不向上抛出
   */
  async function fetchSecAuditEvents() {
    secAuditLoading.value = true
    secAuditError.value = ''
    try {
      const { data } = await fetchSecurityPanelEvents({ limit: getMaxRemoteNotifications() })
      // 后端返回非数组时回退为空数组
      secDbEvents.value = (Array.isArray(data) ? data : []).map(mapSecurityEventRow)
    } catch (e) {
      logger.error('加载安防审计日志失败', e)
      secAuditError.value = getApiErrorMessage(e, '加载安防审计日志失败')
      chrome.notify(secAuditError.value, 'error')
    } finally {
      secAuditLoading.value = false
    }
  }

  return {
    secSessionEvents,
    secDbEvents,
    secEventFilter,
    secAuditLoading,
    secAuditError,
    secEventIconMap,
    secEventFilters,
    secEvents,
    displayedSecEvents,
    linkageFailureRecent,
    addSecEvent,
    fetchSecAuditEvents,
  }
}

/* ── 原 useSecurityEventsCalendar.ts 的实现 ── */
/** 安防页门禁事件日历：按月网格、按日筛选、视频预览、缩略图滚动 */


export function useSecurityEventsCalendar(eventsPath: Ref<string> | ComputedRef<string>) {
  const weekdayLabels = computed(() => '日,一,二,三,四,五,六'.split(','))
  const hasEvents = computed(() => !!eventsPath.value.trim())
  const loadingEvents = ref(false)
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

  async function validateEventsPath() {
    await eventsValidation.validate('')
  }

  const events = ref<SecurityDoorEvent[]>([])
  const selectedDate = ref(new Date())
  const selectedEventIdx = ref(0)
  const isFullscreenViewer = ref(false)
  const eventShowVideo = ref(false)
  const videoError = ref(false)
  const thumbnailsContainerRef = ref<HTMLElement | null>(null)

  const currentYear = computed(() => selectedDate.value.getFullYear())
  const currentMonth = computed(() => selectedDate.value.getMonth())
  const calendarDays = computed(() => buildSecurityCalendarDays(currentYear.value, currentMonth.value))
  const isSameDay = isSameCalendarDay

  const selectedDateStr = computed(() =>
    formatLocaleDate(selectedDate.value, { year: 'numeric', month: '2-digit', day: '2-digit' }, 'en-CA'),
  )
  const dayEvents = computed(() => events.value.filter((event) => event.date === selectedDateStr.value))
  const currentEventVideo = computed(() => resolveSecurityEventVideo(dayEvents.value[selectedEventIdx.value]))

  function clampSelectedEventIdx() {
    const max = Math.max(0, dayEvents.value.length - 1)
    if (selectedEventIdx.value > max) selectedEventIdx.value = max
  }

  function prevMonth() {
    selectedDate.value = new Date(currentYear.value, currentMonth.value - 1, 1)
  }

  function nextMonth() {
    selectedDate.value = new Date(currentYear.value, currentMonth.value + 1, 1)
  }

  function selectDate(date: Date) {
    selectedDate.value = date
    selectedEventIdx.value = 0
  }

  function onEventClick(idx: number) {
    selectedEventIdx.value = idx
    eventShowVideo.value = !!resolveSecurityEventVideo(dayEvents.value[idx])
    videoError.value = false
  }

  watch(
    () => [selectedEventIdx.value, currentEventVideo.value, selectedDateStr.value],
    () => {
      videoError.value = false
    },
  )

  watch(selectedEventIdx, () => {
    if (thumbnailsContainerRef.value) {
      const imgs = thumbnailsContainerRef.value.querySelectorAll('img')
      const target = imgs[selectedEventIdx.value] as HTMLElement | undefined
      if (target) {
        thumbnailsContainerRef.value.scrollTo({
          left: target.offsetLeft - thumbnailsContainerRef.value.offsetWidth / 2 + target.offsetWidth / 2,
          behavior: 'smooth',
        })
      }
    }
  })

  watch(dayEvents, () => {
    clampSelectedEventIdx()
  })

  async function fetchEvents() {
    const path = eventsPath.value.trim()
    if (!path) {
      events.value = []
      return
    }
    loadingEvents.value = true
    try {
      const res = await fetchSecurityEvents()
      events.value = res.data || []
      if (!events.value.length) {
        eventsValidateOk.value = false
        eventsValidateMsg.value = '路径可读但暂无事件记录'
      }
    } catch (error) {
      logger.error('获取安全事件失败', error)
      events.value = []
      eventsValidateOk.value = false
      eventsValidateMsg.value = '拉取事件失败，请点击「测试连通」检查 eventsPath'
    } finally {
      loadingEvents.value = false
      clampSelectedEventIdx()
    }
  }

  return {
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

/* ── 原 useSecurityPanelStatus.ts 的实现 ── */

/** 安防面板区域结构 */
type SecurityPanelZone = {
  /** 区域 ID */
  id: string
  /** 区域名称 */
  name: string
  /** 区域传感器 ID 列表 */
  sensors?: string[]
  /** 是否已布防 */
  armed?: boolean
  /** 区域类型（all/perimeter/room 等） */
  zoneType?: string
  /** 关联房间 ID */
  roomId?: string
}

// 模块级共享状态：跨组件复用同一份轮询结果
const currentMode = ref('disarmed')
// 使用 shallowRef 避免 zones 数组深层响应式带来的性能开销
const zones = shallowRef<SecurityPanelZone[]>([])
const loading = ref(true)
const ready = ref(false)
const error = ref<string>('')
let subscriberCount = 0
// 轮询任务取消函数（注册到全局调度器，页面隐藏时由调度器统一暂停）
let pollCancel: (() => void) | null = null
const POLL_MS = 10000
/** 状态代际：布防/WS patch 后递增，丢弃在途 poll 写回的旧 mode */
let statusGeneration = 0

/** 有订阅者（浮动图层 / 安防页）且页面可见时轮询 */
function shouldPoll() {
  if (subscriberCount <= 0) return false
  if (typeof document !== 'undefined' && document.hidden) return false
  return true
}

/**
 * 拉取最新面板状态（带去重与认证校验）
 * @sideEffects 更新 currentMode/zones/ready/error/loading
 * @exceptions 404 时静默清空 error；其他错误写入 error 文案
 */
async function refresh(force = false) {
  const authStore = useAuthStore()
  if (!authStore.isAuthenticated) {
    loading.value = false
    return
  }
  if (!force && !shouldPoll()) return
  if (force) {
    // force 的语义是「务必读到最新状态」：不清共享缓存会拿到 10s 内的旧快照，
    // 布防/撤防后手动刷新仍显示旧模式。
    invalidateSharedFetch('security:panel-status')
  }
  const generation = statusGeneration
  try {
    // sharedFetch 在 POLL_MS 窗口内合并重复请求
    await sharedFetch(
      'security:panel-status',
      async () => {
        const { data } = await fetchSecurityPanelStatus()
        // 在途 poll 不得盖掉布防/WS 刚写入的更新 mode
        if (generation !== statusGeneration) return data
        currentMode.value = data.mode || 'disarmed'
        zones.value = data.zones || []
        ready.value = true
        error.value = ''
        return data
      },
      POLL_MS,
    )
  } catch (e) {
    const status = (e as { response?: { status?: number } })?.response?.status
    if (status === 404) {
      // 404 表示后端未启用安防面板，静默处理。
      if (!ready.value) ready.value = false
      error.value = ''
    } else {
      // 注意：**不要**把已就绪的 ready 打回 false。ready 的语义是「已完成首次加载、
      // 后端区域列表已经是权威数据源」，区域配置页据此决定是否还能回退布局。
      // 一次轮询抖动就打回未就绪，会让页面重新拿（可能已过期的）布局做 bootstrap，
      // 用户随后保存就把已删除的区域又「复活」了。
      error.value = '安防面板状态不可用，请稍后重试'
    }
  } finally {
    loading.value = false
  }
}

/**
 * 应用 WebSocket 推送的安防模式变更
 * @param data 模式变更 payload
 * @sideEffects 更新 currentMode/zones；zones 为空时触发 refresh
 */
function applyModeFromSocket(data: SecurityModeSocketPayload) {
  statusGeneration++
  invalidateSharedFetch('security:panel-status')
  if (data?.mode) currentMode.value = data.mode
  const list = zones.value
  if (!list.length) {
    void refresh(true)
    return
  }
  if (data.mode === 'disarmed') {
    zones.value = list.map((z) => ({ ...z, armed: false }))
    return
  }
  if (Array.isArray(data.zones)) {
    const armedSet = new Set(data.zones)
    zones.value = list.map((z) => ({ ...z, armed: armedSet.has(z.id) }))
    return
  }
  void refresh(true)
}

// 注册刷新与模式变更处理器（模块级一次性注册）
registerSecurityPanelRefreshHandler(() => {
  void refresh()
})
registerSecurityPanelModeHandler(applyModeFromSocket)

/** 启动轮询：已注册时跳过 */
function startPolling() {
  if (!shouldPoll()) return
  // 避免重复注册轮询任务
  if (pollCancel) return
  void refresh()
  // 经全局调度器轮询：页面隐藏时自动暂停，恢复可见时立即刷新
  pollCancel = schedulePoll(
    'security:panel-status-poll',
    () => {
      void refresh()
    },
    POLL_MS,
  )
}

/** 停止轮询并取消调度任务 */
function stopPolling() {
  if (pollCancel) {
    pollCancel()
    pollCancel = null
  }
}

/** 根据订阅者数量同步轮询状态 */
function syncPollingForSubscribers() {
  if (subscriberCount <= 0) {
    stopPolling()
    return
  }
  if (shouldPoll()) startPolling()
  else stopPolling()
}

/** 页面可见性变化回调 */
function onVisibilityChange() {
  syncPollingForSubscribers()
}

/**
 * 安防面板状态 composable
 * @returns 共享状态与方法
 *   - currentMode/zones/loading/ready/error: 响应式状态
 *   - refresh: 手动刷新
 *   - patchModeFromSocket: 应用 WebSocket 模式变更
 */
export function useSecurityPanelStatus() {
  const authStore = useAuthStore()
  onMounted(() => {
    subscriberCount++
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange)
    }
    syncPollingForSubscribers()
    // 已有缓存时立即结束 loading，避免闪烁
    if (ready.value) {
      loading.value = false
    }
  })
  onUnmounted(() => {
    subscriberCount--
    if (subscriberCount === 0 && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
    syncPollingForSubscribers()
  })
  watch(
    () => authStore.isAuthenticated,
    (ok: boolean) => {
      if (ok && subscriberCount > 0 && shouldPoll()) refresh()
    },
  )
  return {
    currentMode,
    zones,
    loading,
    ready,
    error,
    refresh,
    patchModeFromSocket: applyModeFromSocket,
  }
}

/* ── 原 useSecuritySensors.ts 的实现 ── */

// 移动传感器关键字（中英文）
const MOTION_KEYS = ['motion', 'occupancy', 'presence', '移动', '人体', '存在', '占位']
// 门窗传感器关键字
const DOOR_KEYS = ['door', 'window', 'contact', '门磁', '窗磁', '门', '窗']
// 烟感传感器关键字
const SMOKE_KEYS = ['smoke', '烟雾', '烟感']
// 燃气传感器关键字
const GAS_KEYS = ['gas', 'methane', '燃气', '甲烷', '天然气']
// 水浸传感器关键字
const LEAK_KEYS = ['leak', 'moisture', '漏水', '水浸']
// 一氧化碳传感器关键字
const CO_KEYS = ['co', 'carbon_monoxide', '一氧化碳']

/** 传感器类型到中文标签的映射 */
const SENSOR_TYPE_LABELS: Record<string, string> = {
  smoke: '烟感',
  gas: '燃气',
  co: 'CO',
  leak: '水浸',
  door: '门窗',
  motion: '移动',
}

/** 危险传感器种类到内部类型字符串的映射 */
const HAZARD_KIND_TO_TYPE: Record<HazardSensorKind, string> = {
  smoke: 'smoke',
  gas: 'gas',
  leak: 'leak',
}

/**
 * 获取传感器类型标签
 * @param type 传感器类型
 * @returns 中文标签，未知类型原样返回
 */
function sensorLabel(type: string) {
  return SENSOR_TYPE_LABELS[type] ?? type
}

/**
 * 判断实体 ID 或名称是否包含任一关键字
 * @param id 实体 ID
 * @param name 实体名称
 * @param keys 关键字列表
 * @returns 是否匹配
 */
function matchAny(id: string, name: string, keys: string[]) {
  const lowerId = id.toLowerCase()
  const lowerName = (name || '').toLowerCase()
  return keys.some((k) => lowerId.includes(k) || lowerName.includes(k))
}

/**
 * 按关键字对未绑定传感器分类
 * @param id 实体 ID
 * @param name 实体名称
 * @returns 分类结果（含类型、排序、图标、颜色、CSS）；非安全传感器返回 null
 */
function classifySensor(id: string, name: string) {
  // 工具噪声（如空调状态）不归入安全传感器
  if (isSecurityUtilityNoise(id, name)) return null
  if (matchAny(id, name, SMOKE_KEYS))
    return {
      type: 'smoke',
      order: 0,
      iconComp: Flame,
      iconColor: 'text-red-400',
      css: 'sec-event-item--danger',
    }
  if (matchAny(id, name, GAS_KEYS))
    return {
      type: 'gas',
      order: 1,
      iconComp: Wind,
      iconColor: 'text-orange-400',
      css: 'sec-event-item--danger',
    }
  if (matchAny(id, name, CO_KEYS))
    return {
      type: 'co',
      order: 2,
      iconComp: Wind,
      iconColor: 'text-amber-400',
      css: 'sec-event-item--danger',
    }
  if (matchAny(id, name, LEAK_KEYS))
    return {
      type: 'leak',
      order: 3,
      iconComp: Droplets,
      iconColor: 'text-blue-400',
      css: 'sec-event-item--danger',
    }
  if (matchAny(id, name, DOOR_KEYS))
    return {
      type: 'door',
      order: 4,
      iconComp: DoorOpen,
      iconColor: 'text-sky-400',
      css: 'sec-event-item--sensor',
    }
  if (matchAny(id, name, MOTION_KEYS))
    return {
      type: 'motion',
      order: 5,
      iconComp: Activity,
      iconColor: 'text-yellow-400',
      css: 'sec-event-item--sensor',
    }
  return null
}
/**
 * 对已绑定的危险传感器分类（基于 HazardSensorKind）
 * @param kind 危险传感器种类
 * @returns 分类结果（含类型、排序、图标、颜色、CSS）
 */
function classifyBoundHazard(kind: HazardSensorKind) {
  const type = HAZARD_KIND_TO_TYPE[kind]
  if (type === 'smoke')
    return {
      type,
      order: 0,
      iconComp: Flame,
      iconColor: 'text-red-400',
      css: 'sec-event-item--danger',
    }
  if (type === 'gas')
    return {
      type,
      order: 1,
      iconComp: Wind,
      iconColor: 'text-orange-400',
      css: 'sec-event-item--danger',
    }
  // 水浸类型
  return {
    type,
    order: 3,
    iconComp: Droplets,
    iconColor: 'text-blue-400',
    css: 'sec-event-item--danger',
  }
}

type SensorClassification = ReturnType<typeof classifySensor>

/** 实体名称与未绑定分类缓存（键为实体对象引用，见 sensorInfoFor 注释） */
type EntitySensorInfo = {
  name: string
  sensor: SensorClassification
}
const entitySensorInfoCache = new WeakMap<object, EntitySensorInfo>()

/** 模块级共享：告警确认状态在导航角标与总览间一致 */
const acknowledgedSensorIds = ref(new Set<string>())

/**
 * 安防传感器聚合 composable
 * @returns 全量传感器列表、告警数、告警 Chip、统计卡片、过滤器与操作方法
 */
export function useSecuritySensors() {
  const entitiesStore = useEntitiesStore()
  const layoutStore = useLayoutStore()

  // 危险传感器绑定映射：entity_id -> HazardSensorKind
  const hazardBindingMap = computed(() => buildHazardBindingMap(layoutStore.layoutConfig.haConfig || {}))

  // 全量传感器列表：绑定优先，未绑定按关键字分类
  const allSensors = computed(() => {
    // 触发传感器 domain 与 haConfig 的响应式依赖
    void entitiesStore.getDomainEpoch('binary_sensor')
    void entitiesStore.getDomainEpoch('sensor')
    void layoutStore.layoutConfig.haConfig

    const bindingMap = hazardBindingMap.value
    // toRaw 快照：避免对全量实体逐键建立响应式依赖；失效由显式域 epoch 承担
    const raw = toRaw(entitiesStore.entities)

    /**
     * 解析名称与未绑定分类，按实体对象引用缓存。
     * state-update 每次写入都以新对象整体替换实体，因此同一对象引用必然对应同一份
     * 名称与属性，不会读到旧值；分类/关键字匹配因此只在新实体对象上执行一次。
     */
    function sensorInfoFor(eid: string, entity: (typeof raw)[string]) {
      if (!entity) return { name: getEntityLeaf(eid), sensor: null }
      const cached = entitySensorInfoCache.get(entity)
      if (cached) return cached
      const name = getEntityDisplayName(eid, entity)
      const info: EntitySensorInfo = { name, sensor: classifySensor(eid.toLowerCase(), name) }
      entitySensorInfoCache.set(entity, info)
      return info
    }

    // 去重集合：避免同一实体被绑定与未绑定两次计入
    const seen = new Set<string>()
    const list: Array<{
      entity_id: string
      name: string
      domain: string
      alert: boolean
      type: string
      label: string
      order: number
      iconComp: typeof Flame
      iconColor: string
      css: string
      bound: boolean
      offline: boolean
    }> = []

    /**
     * 推送一个传感器到列表
     * @param eid 实体 ID
     * @param bound 是否为已绑定传感器
     */
    function pushSensor(eid: string, bound: boolean) {
      if (!eid || seen.has(eid)) return
      seen.add(eid)
      const entity = raw[eid]
      // 离线判定：实体不存在或状态为 unavailable
      const offline = !entity || entity.state === 'unavailable'
      const { name, sensor } = sensorInfoFor(eid, entity)
      // 绑定传感器优先用绑定类型分类，否则按关键字分类
      const boundKind = bindingMap.get(eid)
      const cls = boundKind ? classifyBoundHazard(boundKind) : sensor
      // 未分类传感器跳过
      if (!cls) return
      const isAlert = entity ? isSensorAlertState(entity.state) : false
      list.push({
        entity_id: eid,
        name,
        domain: getEntityDomain(eid),
        alert: isAlert,
        type: cls.type,
        label: sensorLabel(cls.type),
        order: cls.order,
        iconComp: cls.iconComp,
        iconColor: cls.iconColor,
        css: cls.css,
        // 绑定标记：显式传入或通过 bindingMap 命中
        bound: bound || !!boundKind,
        offline,
      })
    }

    // 先推送所有绑定传感器，确保排序靠前
    for (const eid of bindingMap.keys()) pushSensor(eid, true)

    // 再推送未绑定的可用传感器
    // 直接扫描实体快照：binary_sensor/sensor 域 epoch 已覆盖其增删改，
    // 不依赖 domainEntityIndex 的异步刷新，避免短暂漏掉新建实体。
    for (const eid of Object.keys(raw)) {
      const domain = getEntityDomain(eid)
      if (domain !== 'binary_sensor' && domain !== 'sensor') continue
      const entity = raw[eid]
      // 跳过离线传感器，避免列表过长
      if (!entity || entity.state === 'unavailable') continue
      pushSensor(eid, false)
    }

    // 排序：绑定优先 > 类型顺序 > 名称（中文 localeCompare）
    return list.sort((a, b) => {
      if (a.bound !== b.bound) return a.bound ? -1 : 1
      if (a.order !== b.order) return a.order - b.order
      return a.name.localeCompare(b.name, 'zh-CN')
    })
  })
  // 告警数：排除已确认的告警
  const alertCount = computed(
    () =>
      allSensors.value.filter((sensor) => sensor.alert && !acknowledgedSensorIds.value.has(sensor.entity_id)).length,
  )
  // 告警 Chip：按类型聚合计数
  const activeAlertChips = computed(() => {
    const alerts = allSensors.value.filter(
      (sensor) => sensor.alert && !acknowledgedSensorIds.value.has(sensor.entity_id),
    )
    const byType: Record<string, number> = {}
    for (const alert of alerts) {
      byType[alert.label] = (byType[alert.label] || 0) + 1
    }
    return Object.entries(byType).map(([label, count]) => ({ label, count }))
  })
  // 统计卡片：按类型聚合总数与告警数
  const statCards = computed(() => {
    const cats: Record<
      string,
      {
        key: string
        label: string
        total: number
        alerts: number
        icon: typeof Flame
        color: string
      }
    > = {}
    for (const sensor of allSensors.value) {
      if (!cats[sensor.type]) {
        cats[sensor.type] = {
          key: sensor.type,
          label: sensor.label,
          total: 0,
          alerts: 0,
          icon: sensor.iconComp,
          color: sensor.iconColor,
        }
      }
      cats[sensor.type].total++
      if (sensor.alert) cats[sensor.type].alerts++
    }
    // 按预设类型顺序排序
    return Object.values(cats).sort((a, b) => {
      const order: Record<string, number> = {
        smoke: 0,
        gas: 1,
        co: 2,
        leak: 3,
        door: 4,
        motion: 5,
      }
      return (order[a.key] || 99) - (order[b.key] || 99)
    })
  })
  // 传感器过滤器：每类传感器的数量与告警数
  const sensorFilters = computed(() => {
    const counts: Record<string, { key: string; label: string; count: number; alertCount: number }> = {}
    for (const sensor of allSensors.value) {
      if (!counts[sensor.type]) {
        counts[sensor.type] = { key: sensor.type, label: sensor.label, count: 0, alertCount: 0 }
      }
      counts[sensor.type].count++
      if (sensor.alert) counts[sensor.type].alertCount++
    }
    return Object.values(counts)
  })

  /**
   * 查询单个传感器是否告警
   * @param eid 实体 ID
   * @returns 是否告警；实体不存在时返回 false
   */
  function getSensorAlert(eid: string) {
    const entity = entitiesStore.entities[eid]
    if (!entity) return false
    return isSensorAlertState(entity.state)
  }

  /**
   * 查询单个传感器显示名称
   * @param eid 实体 ID
   * @returns 显示名称
   */
  function getSensorName(eid: string) {
    return getEntityDisplayName(eid, entitiesStore.entities[eid])
  }

  /**
   * 确认全部告警：将当前告警实体 ID 加入已确认集合
   * @sideEffects 更新 acknowledgedSensorIds
   */
  function acknowledgeAllAlerts() {
    const ids = allSensors.value.filter((sensor) => sensor.alert).map((sensor) => sensor.entity_id)
    acknowledgedSensorIds.value = new Set([...acknowledgedSensorIds.value, ...ids])
  }

  // 告警恢复（非告警边沿）后清掉确认标记：否则同一传感器下一次真实告警会被永久静音。
  watch(
    () => allSensors.value.filter((sensor) => sensor.alert).map((sensor) => sensor.entity_id),
    (alertIds) => {
      if (acknowledgedSensorIds.value.size === 0) return
      const stillAlerting = new Set(alertIds)
      const pruned = [...acknowledgedSensorIds.value].filter((id) => stillAlerting.has(id))
      if (pruned.length !== acknowledgedSensorIds.value.size) {
        acknowledgedSensorIds.value = new Set(pruned)
      }
    },
  )

  return {
    allSensors,
    alertCount,
    activeAlertChips,
    statCards,
    sensorFilters,
    acknowledgedSensorIds,
    getSensorAlert,
    getSensorName,
    acknowledgeAllAlerts,
  }
}
