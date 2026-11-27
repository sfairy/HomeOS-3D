import { ref, computed, watch, type Component } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Shield, Video, Clock } from '@lucide/vue'
import { useEntitiesStore } from '@/domain/entity/store/entities.store'
import { useLayoutStore } from '@/domain/layout/store/layout.store'
import { useSecuritySensors, useSecurityPanelStatus, useSecurityEventsCalendar } from '@/features/security/security'
import { useRouteEntityProjection } from '@/domain/entity/use-route-entity-projection'
import { useEnsureVisibleEntities } from '@/domain/entity/use-ensure-visible-entities'
import { useHaDegrade } from '@/domain/entity/ha'
import { collectHazardWatchedEntityIds } from '@homeos/shared'
import { SETTINGS_ROUTES } from '@/kernel/registry/settings-route'
import { securityCameraEntityIds } from '@/kernel/layout'
import { countOfflineDevices } from '@/domain/entity/device-group-model'

/* ── 原 security-view-calendar.internals.ts 的实现 ── */
/** 安防页日历：纯日期网格 / 同一天判定（不依赖 Vue） */

type SecurityCalendarDay = {
  day: number
  isCurrentMonth: boolean
  date: Date
}

/**
 * 构造某月的日历天数网格：含上月末尾、本月全部、下月开头，只补齐最后一周。
 */
export function buildSecurityCalendarDays(year: number, month: number): SecurityCalendarDay[] {
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()
  const days: SecurityCalendarDay[] = []

  for (let offset = firstWeekday - 1; offset >= 0; offset--) {
    const day = daysInPrevMonth - offset
    days.push({
      day,
      isCurrentMonth: false,
      date: new Date(year, month - 1, day),
    })
  }
  for (let day = 1; day <= daysInMonth; day++) {
    days.push({ day, isCurrentMonth: true, date: new Date(year, month, day) })
  }
  const remaining = (7 - (days.length % 7)) % 7
  for (let day = 1; day <= remaining; day++) {
    days.push({
      day,
      isCurrentMonth: false,
      date: new Date(year, month + 1, day),
    })
  }
  return days
}

/** 判断两个日期是否同一天（缺任一参数视为 false）。 */
export function isSameCalendarDay(left: Date | null | undefined, right: Date | null | undefined): boolean {
  return Boolean(
    left &&
      right &&
      left.getFullYear() === right.getFullYear() &&
      left.getMonth() === right.getMonth() &&
      left.getDate() === right.getDate(),
  )
}

/* ── 原 security-view-events.internals.ts 的实现 ── */
/** 安防页门禁事件：视频 URL / hero 色调等纯辅助 */

export type SecurityDoorEvent = {
  date?: string
  video?: string
  clip?: string
  mp4?: string
  recording?: string
  thumbnail?: string
  [key: string]: unknown
}

/** 从门禁事件解析可播放视频地址（优先 video，依次 clip/mp4/recording）。 */
export function resolveSecurityEventVideo(event: SecurityDoorEvent | undefined): string {
  if (!event) return ''
  return event.video || event.clip || event.mp4 || event.recording || ''
}

/** 安防总览 hero 色调：未布防 muted，有告警 red，否则 amber。 */
export function resolveSecurityHeroTone(armed: boolean, alertCount: number): 'muted' | 'red' | 'amber' {
  if (!armed) return 'muted'
  if (alertCount > 0) return 'red'
  return 'amber'
}

/* ── 原 useSecurityView.ts 的实现 ── */

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
  /** 设置入口按钮文案 */
  settingsLabel: string
}

// Tab ID 集合，用于快速校验
const SEC_TAB_SET = new Set<string>(SEC_TAB_IDS)

/**
 * Tab 元信息映射。
 *
 * 不要在模块顶层调用 `SETTINGS_ROUTES.*`：本模块与设置路由模块在当前 chunk 图里
 * 处于同一个 ESM 环上（settings-route → … → security-view），模块求值时
 * `SETTINGS_ROUTES` 的绑定尚未初始化（`undefined`），会抛
 * `Cannot read properties of undefined (reading 'securityModes')` 并让路由懒加载失败。
 * 跳转路径改由 `useSecurityView` 的 `tabMeta` 惰性生成。
 */
const SEC_TAB_META: Record<SecTabId, SecTabMeta> = {
  overview: {
    id: 'overview',
    label: '安防总览',
    hint: '布防状态、区域传感器与告警一览',
    tone: 'pink',
    icon: Shield,
    settingsLabel: '场景配置',
  },
  monitor: {
    id: 'monitor',
    label: '监控中心',
    hint: '摄像头画面与监控回放',
    tone: 'pink',
    icon: Video,
    settingsLabel: '场景配置',
  },
  events: {
    id: 'events',
    label: '门禁事件',
    hint: '门铃抓拍与门禁活动时间轴',
    tone: 'pink',
    icon: Clock,
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

  // 当前 Tab 的元信息；settingsTo 惰性生成，避免模块顶层触发设置路由模块求值（见 SEC_TAB_META 注释）
  const tabMeta = computed(() => ({
    ...SEC_TAB_META[secTab.value],
    settingsTo: SETTINGS_ROUTES.securityModes(),
  }))

  const configLinks = computed(() => [
    { label: '场景配置', to: SETTINGS_ROUTES.securityModes() },
    { label: '集成绑定', to: SETTINGS_ROUTES.bindings() },
  ])

  // 全部摄像头实体 ID 列表（haConfig.securityCameras 为结构化绑定，这里只取实体）
  const allCameras = computed(() => securityCameraEntityIds(layoutStore.layoutConfig.haConfig))

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
  const hazardWatchedIds = computed(() => collectHazardWatchedEntityIds(layoutStore.layoutConfig.haConfig || {}))

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
  //
  // 按**设备**计：一行「区域传感器离线」对应的是「几台探测器失联」，
  // 而一台探测器的电量 / 信号 / 报警实体全 unavailable 时会贡献 3 条实体。
  const offlineSensorCount = computed(() => {
    void entitiesStore.getDomainEpoch('binary_sensor')
    void entitiesStore.getDomainEpoch('sensor')
    const offlineIds: string[] = []
    for (const zone of zones.value) {
      for (const sid of zone.sensors || []) {
        const entity = entitiesStore.entities[sid]
        if (!entity || entity.state === 'unavailable' || entity.state === 'unknown') offlineIds.push(sid)
      }
    }
    return countOfflineDevices(offlineIds, entitiesStore.entities)
  })

  // 离线摄像头数量
  const offlineCameraCount = computed(() => allCameras.value.filter((camId) => isCameraOffline(camId)).length)

  // 在线摄像头数量
  const onlineCameraCount = computed(() => allCameras.value.length - offlineCameraCount.value)

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
        tone: resolveSecurityHeroTone(armed, alerts),
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

  /**
   * 降级摘要：只留原因，去掉「新告警可能无法实时显示…」这句通用建议。
   * 工具栏里的状态胶囊只有一行宽度，硬塞整句必然被裁；完整文案改走 tooltip。
   */
  const secDegradeBrief = computed(() => {
    const parts: string[] = []
    if (entitiesStore.reconnecting) parts.push('正在重连 HA')
    else if (!entitiesStore.connected) parts.push('HA 已断连')
    else if (entitiesStore.entitiesStale) parts.push('数据可能过期')
    if (offlineSensorCount.value > 0) {
      parts.push('{n} 个传感器离线'.replace('{n}', String(offlineSensorCount.value)))
    }
    if (offlineCameraCount.value > 0) {
      parts.push('{n} 路监控不可用'.replace('{n}', String(offlineCameraCount.value)))
    }
    if (parts.length === 0) return '部分数据源不可用'
    return parts.join(' · ')
  })

  const eventsPath = computed(() => layoutStore.layoutConfig.haConfig.eventsPath || '')
  const eventsCalendar = useSecurityEventsCalendar(eventsPath)

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
      await Promise.all([refreshPanel(), eventsCalendar.fetchEvents()])
    } finally {
      refreshing.value = false
    }
  }

  // 配置加载完成且 eventsPath 存在时自动拉取事件
  watch(
    [() => layoutStore.isConfigLoaded, eventsPath],
    ([loaded, path]) => {
      if (loaded && path) void eventsCalendar.fetchEvents()
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
    secDegradeBrief,
    retryHaConnection,
    ...eventsCalendar,
  }
}
