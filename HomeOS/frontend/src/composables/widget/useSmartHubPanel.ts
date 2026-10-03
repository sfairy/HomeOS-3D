/**
 * 智能管家面板（Smart Hub Panel）组合式函数。
 *
 * 所属模块：widget/composables
 * 职责：负责智能管家面板的 Tab 切换、子面板引用管理、各 Tab 数据按需加载与刷新、
 *      待处理事项计数与状态文案展示，以及面板可见时的轮询刷新。
 * 依赖：
 *   - vue（ref / watch / computed / onMounted / nextTick）
 *   - @lucide/vue（Tab 图标）
 *   - @/composables/widget/useWidgetStatusPoll（状态轮询）
 *   - @/composables/widget/useHubTabs（Tab 过滤与激活解析）
 */
import { ref, watch, computed, onMounted, nextTick } from 'vue'
import {
  Brain,
  RefreshCw,
  Lightbulb,
  Sparkles,
  Activity,
  Link2,
  BarChart3,
  Settings2,
  LayoutDashboard,
} from '@lucide/vue'
import { useWidgetStatusPoll } from '@/composables/widget/useWidgetStatusPoll'
import { useHubTabs } from '@/composables/widget/useHubTabs'

/** Tab 提示文案表：每个 Tab 在 UI 上对应的一段简介 */
const TAB_HINTS: Record<string, string> = {
  overview: '习惯、节能、联动与偏好来源一览',
  advisor: '能耗、安防与设备状态的每日洞察',
  habits: '根据使用习惯推荐场景与自动化',
  config: '绑定、筛选、常用设备等配置优化建议',
  timeline: '关键设备状态变化时间线',
  linkage: '安防联动与 HA 配置同步健康',
  analytics: '自动化执行成功率与失败分析',
}

/**
 * 智能管家面板组合式函数。
 *
 * @param {object} props  面板属性
 * @param {string} [props.defaultTab]  默认激活 Tab
 * @param {boolean} [props.panelVisible]  面板是否可见（false 时暂停轮询）
 * @param {Record<string, unknown>} [props.config]  布局配置（含 visibleTabs 等）
 * @returns 含 hubTabs / activeTab / pendingCount / statusText / 各子面板 ref / selectTab / refreshActive 等
 */
export function useSmartHubPanel(props: {
  defaultTab?: string
  tabSelectToken?: number
  panelVisible?: boolean
  config?: Record<string, unknown>
}) {
  /** Tab -> 图标组件映射 */
  const tabIcons = {
    overview: LayoutDashboard,
    advisor: Lightbulb,
    habits: Sparkles,
    config: Settings2,
    timeline: Activity,
    linkage: Link2,
    analytics: BarChart3,
  }

  /** 建议面板的「遗忘事项」计数（来自 advisor 子面板） */
  const forgottenCount = ref(0)
  /** 习惯面板的待处理建议计数 */
  const habitsCount = ref(0)

  /** 配置建议面板的待处理计数 */
  const configCount = ref(0)

  // 全量 Tab 列表（含徽标数字，0 时置 undefined 不展示）
  const allHubTabs = computed(() => [
    { key: 'overview', label: '总览' },
    { key: 'advisor', label: '建议', badge: forgottenCount.value || undefined },
    { key: 'habits', label: '习惯', badge: habitsCount.value || undefined },
    { key: 'config', label: '配置建议', badge: configCount.value || undefined },
    { key: 'timeline', label: '事件' },
    { key: 'linkage', label: '联动' },
    { key: 'analytics', label: '分析' },
  ])
  /** 配置可见 Tab 时始终保留总览，避免生活页 default-tab=overview 被过滤成空白 */
  const hubConfig = computed(() => {
    const raw = (props.config || {}) as Record<string, unknown>
    const visibleRaw = Array.isArray(raw.visibleTabs) ? raw.visibleTabs.map(String) : null
    if (!visibleRaw?.length) return raw
    if (visibleRaw.includes('overview')) return raw
    return { ...raw, visibleTabs: ['overview', ...visibleRaw] }
  })

  const { hubTabs: filteredTabs, activeTab } = useHubTabs({
    hubType: 'smartAdvisor',
    config: () => hubConfig.value,
    defaultTabProp: () => props.defaultTab || 'overview',
    tabSelectToken: () => props.tabSelectToken ?? 0,
    allTabs: allHubTabs,
  })

  const hubTabs = filteredTabs

  // 待处理事项总数（建议 + 习惯 + 配置）
  const pendingCount = computed(() => forgottenCount.value + habitsCount.value + configCount.value)
  // 状态文案：有待处理事项时显示数量，否则提示一切正常
  const statusText = computed(() =>
    pendingCount.value > 0 ? `${pendingCount.value} 条待处理` : '一切正常',
  )
  // 当前激活 Tab 对应的提示文案
  const activeTabHint = computed(() => TAB_HINTS[activeTab.value] || '')

  // 已挂载的 Tab 集合：用于懒加载与保留已渲染的子面板
  const mountedTabs = ref(new Set<string>(['overview', activeTab.value].filter(Boolean)))
  // 子面板引用类型：约定每个子面板暴露 load 方法以加载数据
  type LoadablePanel = { load?: (opts?: { quiet?: boolean }) => void | Promise<void> }
  // 各子面板的组件实例引用
  const configRef = ref<LoadablePanel | null>(null)
  const overviewRef = ref<LoadablePanel | null>(null)
  const advisorRef = ref<LoadablePanel | null>(null)
  const habitsRef = ref<LoadablePanel | null>(null)
  const timelineRef = ref<LoadablePanel | null>(null)
  const linkageRef = ref<LoadablePanel | null>(null)
  const analyticsRef = ref<LoadablePanel | null>(null)
  // 刷新中标记
  const refreshing = ref(false)

  /**
   * 标记某个 Tab 为已挂载（首次访问时调用，避免重复挂载）。
   * @param {string} tab  Tab key
   */
  function ensureTabMounted(tab: string) {
    if (mountedTabs.value.has(tab)) return
    mountedTabs.value = new Set([...mountedTabs.value, tab])
  }

  // 切换 Tab 时标记挂载
  watch(activeTab, (tab) => {
    ensureTabMounted(tab)
  })

  /**
   * 加载指定 Tab 的数据：通过对应子面板 ref 的 load 方法触发。
   * @param {string} resolved  已解析的 Tab key
   */
  async function loadTabData(resolved: string) {
    // 双 nextTick：等待子面板组件完成挂载后再调用 load
    await nextTick()
    await nextTick()
    if (resolved === 'overview') overviewRef.value?.load?.({ quiet: true })
    if (resolved === 'habits') habitsRef.value?.load?.({ quiet: true })
    if (resolved === 'config') configRef.value?.load?.({ quiet: true })
    if (resolved === 'timeline') timelineRef.value?.load?.()
    if (resolved === 'linkage') linkageRef.value?.load?.()
    if (resolved === 'analytics') analyticsRef.value?.load?.({ quiet: true })
    if (resolved === 'advisor') advisorRef.value?.load?.()
  }

  /**
   * 切换到指定 Tab。
   * @param {string} tab  目标 Tab key
   */
  function selectTab(tab: string) {
    if (!hubTabs.value.some((t) => t.key === tab)) return
    activeTab.value = tab
    ensureTabMounted(tab)
    void loadTabData(tab)
  }

  /**
   * advisor 子面板统计回调：更新遗忘事项计数。
   * @param {{ forgotten?: number }} [payload]  统计数据
   */
  function onAdvisorStats({ forgotten = 0 } = {}) {
    forgottenCount.value = forgotten
  }

  /**
   * habits 子面板统计回调：更新待处理建议计数。
   * @param {{ pending?: number }} [payload]  统计数据
   */
  function onHabitsStats({ pending = 0 } = {}) {
    habitsCount.value = pending
  }

  /**
   * config 子面板统计回调：更新配置待处理计数。
   * @param {{ pending?: number }} [payload]  统计数据
   */
  function onConfigStats({ pending = 0 } = {}) {
    configCount.value = pending
  }
  /**
   * 刷新当前激活 Tab 的数据。
   * 根据当前 Tab 调用对应子面板的 load 方法（不带 quiet 以触发完整刷新反馈）。
   */
  async function refreshActive() {
    refreshing.value = true
    try {
      if (activeTab.value === 'overview') {
        await overviewRef.value?.load?.()
      } else if (activeTab.value === 'timeline') {
        await timelineRef.value?.load?.()
      } else if (activeTab.value === 'linkage') {
        await linkageRef.value?.load?.()
      } else if (activeTab.value === 'analytics') {
        await analyticsRef.value?.load?.({ quiet: true })
      } else if (activeTab.value === 'config') {
        await configRef.value?.load?.({ quiet: true })
      } else {
        // habits 与 advisor 共用同一段刷新逻辑
        const target = activeTab.value === 'habits' ? habitsRef.value : advisorRef.value
        if (target?.load) await target.load()
      }
    } finally {
      refreshing.value = false
    }
  }

  /**
   * 轮询当前激活 Tab：面板不可见时直接跳过，避免后台无意义刷新。
   * 已挂载的 timeline 也顺带刷新，保持事件流实时性。
   */
  function pollActiveTab() {
    if (props.panelVisible === false) return
    if (mountedTabs.value.has('timeline')) {
      timelineRef.value?.load?.({ quiet: true })
    }
    if (activeTab.value === 'timeline') return
    if (activeTab.value === 'overview') overviewRef.value?.load?.({ quiet: true })
    else if (activeTab.value === 'habits') habitsRef.value?.load?.({ quiet: true })
    else if (activeTab.value === 'config') configRef.value?.load?.({ quiet: true })
    else if (activeTab.value === 'linkage') linkageRef.value?.load?.()
    else if (activeTab.value === 'analytics') analyticsRef.value?.load?.({ quiet: true })
    else advisorRef.value?.load?.()
  }

  // 注册 widget 状态轮询：每 60 秒触发一次 pollActiveTab，immediate=false 避免与首次加载重复
  useWidgetStatusPoll('smartAdvisor', pollActiveTab, 60_000, {
    key: 'widget:SmartHubPanel',
    immediate: false,
  })

  // 面板可见性变化：变为可见时立即拉一次数据
  watch(
    () => props.panelVisible,
    (visible) => {
      if (visible) pollActiveTab()
    },
    { immediate: true },
  )

  // 挂载时按当前 Tab 触发首轮加载
  onMounted(async () => {
    await nextTick()
    if (activeTab.value === 'overview') overviewRef.value?.load?.({ quiet: true })
    if (activeTab.value === 'timeline') timelineRef.value?.load?.()
    if (activeTab.value === 'habits') habitsRef.value?.load?.({ quiet: true })
    if (activeTab.value === 'config') configRef.value?.load?.({ quiet: true })
    if (activeTab.value === 'linkage') linkageRef.value?.load?.()
    if (activeTab.value === 'analytics') analyticsRef.value?.load?.({ quiet: true })
  })

  return {
    tabIcons,
    hubTabs,
    activeTab,
    pendingCount,
    statusText,
    activeTabHint,
    mountedTabs,
    overviewRef,
    configRef,
    advisorRef,
    habitsRef,
    timelineRef,
    linkageRef,
    analyticsRef,
    refreshing,
    selectTab,
    onAdvisorStats,
    onHabitsStats,
    onConfigStats,
    refreshActive,
    Brain,
    RefreshCw,
  }
}