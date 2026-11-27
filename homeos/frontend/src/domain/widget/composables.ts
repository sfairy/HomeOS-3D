import { type InjectionKey, ref, computed, watch, toValue, type MaybeRefOrGetter, onMounted, onUnmounted, type ComponentPublicInstance, unref, isRef, type Ref } from 'vue'
import { buildNotificationSourceFilters, matchesNotificationSourceFilter, isLifeSafetyNotification } from '@homeos/shared'
import { normalizeHubTabConfig, resolveHubTab, filterTabsByVisible, resolveHubTabId } from '@/kernel/utils/registry/hub-tabs-options'
import { useRouter } from 'vue-router'
import { Bell, AlertTriangle, Info, CheckCircle2 } from '@lucide/vue'
import { useEntitiesStore } from '@/domain/entity/store/entities.store'
import { useAuthStore } from '@/domain/auth/auth.store'
import { useChromeStore } from '@/kernel/ui/chrome/chrome-store'
import { registerNotificationRefreshHandler } from '@/kernel/utils/bridge/store-bridge'
import { markNotificationRead, markAllNotificationsRead, deleteNotification, clearNotifications, fetchNotifications, fetchNotificationSettings } from '@/domain/api/notifications'
import { notifyError } from '@/kernel/ui/notify'
import { parseNotificationSettings } from '@/domain/notifications/utils/dnd.util'
import { getMaxRemoteNotifications, getWidgetPollInterval, configEpoch } from '@/kernel/config/frontend-config'
import { logger, getApiErrorMessage, schedulePoll } from '@/kernel/utils/core'
import { SETTINGS_ROUTES } from '@/kernel/utils/registry/settings-route.util'

/** 通知中心 Vue provide/inject 上下文：定义 InjectionKey 与类型别名。 */

/** 通知中心上下文类型：等同于 useNotificationCenter 组合式函数的返回值类型，供注入方做类型断言使用 */
type NotificationCenterContext = ReturnType<typeof useNotificationCenter>

/** 通知中心注入键：以 Symbol 形式避免与其它 InjectionKey 冲突，承载完整的上下文对象 */
export const NOTIFICATION_CENTER_KEY: InjectionKey<NotificationCenterContext> = Symbol('notificationCenter')

/**
 * @file notification-center.filters.internals.ts
 * @module frontend/src/composables/widget
 */
/** 通知中心：纯过滤 / 合并工具（不依赖 Vue 生命周期） */

/** 通知中心展示条目（远程 + 本地合并） */
export interface NotificationCenterItem {
  id: string | number
  level?: string
  message?: string
  source?: string
  time?: string
  createdAt?: string
  read?: boolean
  entityId?: string
  monitorKind?: string
  deliveredAt?: string
  /** 系统主动提醒携带的可执行指令：通知中心可一键交给管家 */
  actionPrompt?: string
}

/** 与设置页「通知偏好」对齐的过滤开关 */
interface NotificationCenterPrefs {
  globalNotifyEnabled: boolean
  importantNotifyEnabled: boolean
  offlineNotifyEnabled: boolean
  lowBatteryNotifyEnabled: boolean
}

/** 判断通知是否为「设备离线/恢复在线」类型。 */
function isOfflineNotification(notification: NotificationCenterItem): boolean {
  // 结构化字段优先：后端在 ``_decorate_notification`` 里写入 ``monitorKind``。
  if (notification.monitorKind === 'offline' || notification.monitorKind === 'online') return true
  // HA（中枢）失联 / 恢复不是「设备离线」：它恰恰是解释「为什么一批设备离线告警没来」的
  // 系统性通知，绝不能被「设备离线提醒」开关连带吞掉（后端也已把它归为不可静音类）。
  if (notification.source === 'ha-connection') return false
  // 以下文案匹配只为历史条目（旧版本入库的通知没有 monitorKind）：不要在新代码里
  // 依赖 message 文案做业务判断 —— 改一句文案就改一次行为。
  const message = notification.message || ''
  return (
    notification.source === 'device-monitor' ||
    message.includes('离线') ||
    message.includes('恢复在线') ||
    message.includes('offline') ||
    message.includes('back online')
  )
}

/** 判断通知是否为「低电量」类型。 */
function isLowBatteryNotification(notification: NotificationCenterItem): boolean {
  if (notification.monitorKind === 'low_battery') return true
  // 同上：文案匹配仅兜底历史条目。
  const message = notification.message || ''
  return message.includes('电量') || message.includes('低电量') || message.includes('battery')
}

/**
 * 合并远程 + 本地通知，按时间倒序；同时间戳时远程排在本地前面。
 *
 * 返回值**保留原对象引用**（不克隆）：通知中心是「单一数据源 = 实体 store 的
 * remoteNotifications」，点击/已读/删除都直接改 store 里那一条。早期实现把每条
 * ``{...notification}`` 克隆进合并列表，于是合并出来的 ``read`` 与 store 里的是两份，
 * 按引用修改（``notification.read = true``）永远落不到数据源上，UI 也不会重算。
 */
export function mergeNotificationLists(
  remote: NotificationCenterItem[],
  local: NotificationCenterItem[] = [],
): NotificationCenterItem[] {
  const merged: NotificationCenterItem[] = [...remote, ...local]
  merged.sort((left, right) => {
    const leftTime = Date.parse(left.createdAt || left.time || '') || (typeof left.id === 'number' ? left.id : 0)
    const rightTime = Date.parse(right.createdAt || right.time || '') || (typeof right.id === 'number' ? right.id : 0)
    if (leftTime !== rightTime) return rightTime - leftTime
    const leftIndex = Number(left.id) > 1e15 ? 0 : 1
    const rightIndex = Number(right.id) > 1e15 ? 0 : 1
    return leftIndex - rightIndex
  })
  return merged
}

/** 应用通知偏好：关闭紧急/离线/低电量时移除对应项。 */
export function applyNotifyPrefs(
  list: NotificationCenterItem[],
  prefs: NotificationCenterPrefs,
): NotificationCenterItem[] {
  let filtered = list
  if (!prefs.globalNotifyEnabled) return []
  if (!prefs.importantNotifyEnabled) {
    // 与后端一致：关闭「告警与警告」时仍保留生命安全类（danger / 安防 / EEW 等）
    filtered = filtered.filter(
      (notification) =>
        notification.level === 'info' ||
        notification.level === 'success' ||
        isLifeSafetyNotification(notification.level, notification.source),
    )
  }
  if (!prefs.offlineNotifyEnabled) {
    filtered = filtered.filter((notification) => !isOfflineNotification(notification))
  }
  if (!prefs.lowBatteryNotifyEnabled) {
    filtered = filtered.filter((notification) => !isLowBatteryNotification(notification))
  }
  return filtered
}

/** 按级别过滤（`all` 不过滤）。 */
export function filterByLevel(list: NotificationCenterItem[], level: string): NotificationCenterItem[] {
  if (level === 'all') return list
  return list.filter((notification) => (notification.level || 'info') === level)
}

/** 按来源过滤。 */
export function filterBySource(list: NotificationCenterItem[], source: string): NotificationCenterItem[] {
  return list.filter((notification) => matchesNotificationSourceFilter(notification.source, source))
}

/** 构造来源筛选 tab（最多 `maxTabs` 个）。 */
export function buildSourceFilters(list: NotificationCenterItem[], maxTabs = 9) {
  return buildNotificationSourceFilters(list, { maxTabs })
}

/** 各来源 tab 的数量徽标。 */
export function countBySource(
  list: NotificationCenterItem[],
  sourceKeys: Array<{ key: string }>,
): Record<string, number> {
  const counts: Record<string, number> = { all: list.length }
  for (const filter of sourceKeys) {
    if (filter.key === 'all') continue
    counts[filter.key] = filterBySource(list, filter.key).length
  }
  return counts
}

/** Widget Hub Tab 状态管理：根据布局配置过滤可见 Tab 并解析默认/当前激活项。 */

/** Hub Tab 定义：唯一 key、显示文案与可选徽标（badge） */
interface HubTabDef {
  key: string
  label: string
  badge?: string | number
}

/**
 * Hub Tab 组合式函数：基于 hubType 与配置计算可见 Tab 与激活 Tab。
 *
 * @param {object} options
 * @param {string} options.hubType  Hub 类型标识，用于区分不同面板（如 smartAdvisor、lifeMode 等）
 * @param {MaybeRefOrGetter<Record<string, unknown> | undefined>} options.config  布局配置（含 visibleTabs / defaultTab）
 * @param {MaybeRefOrGetter<string | undefined>} options.defaultTabProp  外部传入的默认 Tab 值（优先级高于配置内 defaultTab）
 * @param {MaybeRefOrGetter<HubTabDef[]>} options.allTabs  该 Hub 的全量 Tab 列表
 * @returns 含 hubTabs（可见 Tab 列表）、activeTab（当前激活）、tabConfig（归一化配置）、resolveActiveTab（手动解析函数）
 */
export function useHubTabs(options: {
  hubType: string
  config: MaybeRefOrGetter<Record<string, unknown> | undefined>
  defaultTabProp?: MaybeRefOrGetter<string | undefined>
  /** 外部再次请求同一 Tab 时递增，强制 activeTab 重新解析 */
  tabSelectToken?: MaybeRefOrGetter<number | undefined>
  allTabs: MaybeRefOrGetter<HubTabDef[]>
}) {
  // 归一化配置：把可见 Tab、默认 Tab 等字段统一成结构化对象
  const tabConfig = computed(() => normalizeHubTabConfig(toValue(options.config), options.hubType))

  const hubTabs = computed(() =>
    filterTabsByVisible(toValue(options.allTabs), toValue(options.config), options.hubType),
  )

  /**
   * 解析当前应该激活的 Tab：优先使用传入的 raw，其次 defaultTabProp，最后回退到配置内 defaultTab。
   * @param {string} [raw]  外部指定值（如 URL query）
   * @returns 解析后实际可激活的 Tab id（保证存在于 hubTabs 中）
   */
  function resolveActiveTab(raw?: string) {
    const ids = hubTabs.value.map((t) => resolveHubTabId(t))
    return resolveHubTab(
      raw || toValue(options.defaultTabProp) || tabConfig.value.defaultTab,
      toValue(options.config),
      options.hubType,
      ids,
    )
  }

  // 当前激活 Tab，初始化时即解析一次
  const activeTab = ref(resolveActiveTab())

  // 监听可见 Tab 列表变化：若当前激活 Tab 不再可见，则回退到默认 Tab
  watch(
    () => tabConfig.value.visibleTabs.join(','),
    () => {
      if (!hubTabs.value.some((t) => resolveHubTabId(t) === activeTab.value)) {
        activeTab.value = resolveActiveTab(toValue(options.defaultTabProp))
      }
    },
    { immediate: true },
  )

  // 监听默认 Tab / 选择令牌：外部可重复请求同一 Tab
  watch(
    () => [toValue(options.defaultTabProp), tabConfig.value.defaultTab, toValue(options.tabSelectToken) ?? 0] as const,
    ([nextDefaultProp, nextDefaultTab, nextToken], prev) => {
      const prevDefaultProp = prev?.[0]
      const prevDefaultTab = prev?.[1]
      const prevToken = prev?.[2] ?? 0
      const tokenBumped = nextToken !== prevToken
      const defaultChanged = nextDefaultProp !== prevDefaultProp || nextDefaultTab !== prevDefaultTab
      if (!defaultChanged && !tokenBumped && hubTabs.value.some((t) => resolveHubTabId(t) === activeTab.value)) {
        return
      }
      activeTab.value = resolveActiveTab(nextDefaultProp)
    },
    { immediate: true },
  )

  return { hubTabs, activeTab, tabConfig, resolveActiveTab }
}

/** 通知中心组合式函数（widget 内嵌）。 */

/** 通知级别过滤选项：UI 显示的「全部/紧急/警告/信息/成功」 */
const levelFilters = [
  { key: 'all', label: '全部级别' },
  { key: 'danger', label: '紧急' },
  { key: 'warn', label: '警告' },
  { key: 'info', label: '信息' },
  { key: 'success', label: '成功' },
]

type NotificationItem = NotificationCenterItem
/**
 * 通知中心组合式函数：返回通知面板所需的全部响应式状态与操作方法。
 *
 * @returns 含 sourceFilters/levelFilters/dndSettings/displayNotifications/filterCounts/unreadCount 等
 *          响应式状态，以及 onNotificationClick/dismiss/markAllRead/clearAll/fetchRemote 等方法
 */
export function useNotificationCenter() {
  const entitiesStore = useEntitiesStore()
  const authStore = useAuthStore()
  const router = useRouter()

  /**
   * 远程通知列表：**唯一数据源**（实体 store）。
   *
   * 早期这里还有一份 `localNotifications`，与 store 的 remoteNotifications 各存一份，
   * 增删改必须两处同步（dismiss 就漏过一处）。本地那份从来没有人写入（恒为空数组），
   * 却让每个写路径都要维护两份快照与两套回滚 —— 已删除，统一只改 store。
   */
  const remoteList = computed(() => entitiesStore.remoteNotifications || [])

  /** 免打扰（DND）原始配置 */
  const dndSettings = ref<unknown>(null)
  /** 解析后的通知偏好（控制是否展示离线/低电量/紧急等） */
  const notifyPrefs = ref(parseNotificationSettings(null))
  /** 远程通知加载中标记 */
  const remoteLoading = ref(false)
  /** 远程通知加载错误信息 */
  const remoteError = ref('')
  /** 当前激活的来源筛选 key */
  const activeSource = ref('all')
  /** 当前激活的级别筛选 key */
  const activeLevel = ref('all')
  /** 键盘导航时聚焦的通知项索引（-1 表示无聚焦） */
  const focusedIndex = ref(-1)
  /** 通知列表容器 ref（用于滚动定位） */
  const listRef = ref<(ComponentPublicInstance & { $el: HTMLElement }) | null>(null)
  /** 来源筛选按钮 ref 数组（用于键盘导航时聚焦） */
  const filterRefs = ref<(HTMLElement | null)[]>([])

  /**
   * 设置来源筛选按钮 DOM 引用，供键盘导航使用。
   * @param {Element | ComponentPublicInstance | null} el  按钮元素或组件实例
   * @param {number} idx  在 filterRefs 中的索引
   */
  function setFilterRef(el: Element | ComponentPublicInstance | null, idx: number) {
    if (el && el instanceof HTMLElement) filterRefs.value[idx] = el
  }

  // 单条通知项的固定行高（用于键盘导航时计算滚动位置）
  const NC_ITEM_HEIGHT = 60

  /**
   * 聚焦指定索引的通知项，并自动滚动到可见区域。
   * @param {number} idx  目标通知项索引
   */
  function focusListItem(idx: number) {
    const list = displayNotifications.value
    if (!list.length) {
      focusedIndex.value = -1
      return
    }
    const next = Math.max(0, Math.min(idx, list.length - 1))
    focusedIndex.value = next
    // 双 rAF：先触发滚动定位，再聚焦 DOM 元素，确保视图已更新
    requestAnimationFrame(() => {
      const root = listRef.value?.$el
      if (!root) return
      root.scrollTop = Math.max(0, next * NC_ITEM_HEIGHT - root.clientHeight / 2)
      requestAnimationFrame(() => {
        root.querySelector(`[data-index="${next}"]`)?.focus?.()
      })
    })
  }

  /**
   * 通知列表键盘导航：上下方向键 / Home / End 移动聚焦。
   * @param {KeyboardEvent} event  键盘事件
   */
  function onListKeydown(event: KeyboardEvent) {
    const len = displayNotifications.value.length
    if (!len) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusListItem(focusedIndex.value < 0 ? 0 : focusedIndex.value + 1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusListItem(focusedIndex.value < 0 ? len - 1 : focusedIndex.value - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusListItem(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      focusListItem(len - 1)
    }
  }

  /**
   * 来源筛选按钮的键盘导航：左右方向键 / Home / End 切换。
   * @param {KeyboardEvent} event  键盘事件
   */
  function onFilterKeydown(event: KeyboardEvent) {
    const tabs = sourceFilters.value
    const cur = tabs.findIndex((tab) => tab.key === activeSource.value)
    if (cur < 0) return
    let next = cur
    if (event.key === 'ArrowRight') next = (cur + 1) % tabs.length
    else if (event.key === 'ArrowLeft') next = (cur - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    else return
    event.preventDefault()
    activeSource.value = tabs[next].key
    filterRefs.value[next]?.focus?.()
  }
  // 全部通知（唯一数据源 = 实体 store 的远程通知列表，按时间倒序）
  const allNotifications = computed(() => mergeNotificationLists(remoteList.value as NotificationItem[]))

  // 应用偏好后的通知列表（不含级别/来源过滤）
  const prefFilteredNotifications = computed(() => applyNotifyPrefs(allNotifications.value, notifyPrefs.value))

  // 来源筛选选项（由 @homeos/shared 工具基于通知来源动态构造，最多 9 个）
  const sourceFilters = computed(() => buildSourceFilters(prefFilteredNotifications.value, 9))

  // 最终展示的通知列表：先级别、再来源过滤后的结果
  const displayNotifications = computed(() =>
    filterBySource(filterByLevel(prefFilteredNotifications.value, activeLevel.value), activeSource.value),
  )

  // 各来源筛选 tab 的通知数量统计（用于徽标显示）
  const filterCounts = computed(() => countBySource(prefFilteredNotifications.value, sourceFilters.value))

  // 来源筛选变化时：若当前激活来源消失，回退到 all
  watch(sourceFilters, (tabs) => {
    if (!tabs.some((tab) => tab.key === activeSource.value)) {
      activeSource.value = 'all'
    }
  })

  // 显示列表变化时：聚焦索引若超出范围则重置
  watch(displayNotifications, () => {
    if (focusedIndex.value >= displayNotifications.value.length) {
      focusedIndex.value = displayNotifications.value.length ? 0 : -1
    }
  })

  watch(activeSource, () => {
    focusedIndex.value = displayNotifications.value.length ? 0 : -1
  })

  watch(activeLevel, () => {
    focusedIndex.value = displayNotifications.value.length ? 0 : -1
  })

  // 未读通知数量
  const unreadCount = computed(() => displayNotifications.value.filter((notification) => !notification.read).length)

  // 局域网推送是否就绪：需要实体连接 + 已登录
  const lanPushReady = computed(() => Boolean(entitiesStore.connected && authStore.isAuthenticated))

  /**
   * 根据通知来源与实体 ID 解析点击后应跳转的路由。
   * @param {NotificationItem} notification  通知项
   * @returns 跳转路径字符串；无对应路由时返回 null
   */
  function resolveNotificationLink(notification: NotificationItem) {
    const src = String(notification.source || '')
    if (src === 'emergency' || src.startsWith('security')) return '/security'
    if (src === 'alert-rule' || src.startsWith('alert-rule')) return SETTINGS_ROUTES.fromNotificationSource(src)
    if (src.startsWith('energy') || src === 'energy-budget' || src === 'energy-anomaly') {
      return SETTINGS_ROUTES.params('energy')
    }
    if (src === 'water-monitor') {
      return SETTINGS_ROUTES.params('water')
    }
    if (src.startsWith('device-health') || src === 'device-monitor') {
      if (notification.entityId) return `/device?id=${encodeURIComponent(notification.entityId)}`
    }
    if (src === 'environment-health') return SETTINGS_ROUTES.envHealth()
    if (src.startsWith('earthquake')) return '/earthquake-history'
    // HA 失联 / 恢复：点进去就是连接设置页，用户在那里能看到连接状态并改地址 / 令牌。
    if (src === 'ha-connection') return SETTINGS_ROUTES.connection()
    if (src === 'home-mode' || src.startsWith('home-mode')) return SETTINGS_ROUTES.homeMode()
    if (src === 'automation') return SETTINGS_ROUTES.homeMode()
    if (src.includes('linkage') || src.includes('linkage_')) return SETTINGS_ROUTES.securityModes('linkage')
    if (src.startsWith('voice')) return SETTINGS_ROUTES.voice()
    if (notification.entityId) return `/device?id=${encodeURIComponent(notification.entityId)}`
    return null
  }
  /**
   * 把一条通知标记为已读：乐观更新 + 失败回滚。
   *
   * 「点通知」与「让管家处理」是两条入口，但都意味着用户已经看过这条提醒；
   * 标记逻辑只写一份，避免两处各改一半（一处漏了，刷新又变回未读）。
   */
  async function markRead(notification: NotificationItem) {
    if (notification.read) return
    // 合并列表保留的是 store 里的同一个对象，这一行就是对数据源的唯一一次乐观更新
    notification.read = true
    try {
      await markNotificationRead(notification.id)
    } catch (error) {
      // 回滚改的是同一个对象，不需要再按 id 找回 store 那份（早期两份快照各写一次，
      // 一处漏改就出现「点了已读、刷新又变未读」）
      notification.read = false
      logger.debug('标记通知为已读失败', error)
    }
  }

  /**
   * 点击通知：标记为已读并跳转到对应路由。
   * @param {NotificationItem} notification  被点击的通知项
   */
  async function onNotificationClick(notification: NotificationItem) {
    await markRead(notification)
    const route = resolveNotificationLink(notification)
    if (route) router.push(route)
  }

  /**
   * 关闭（移除）指定通知：乐观移除，DELETE 失败再按原位置回滚。
   *
   * 早期实现只对远程通知「标记已读」，而列表来自 ``mergeNotificationLists(remote, local)``
   * —— 远程那一路不会 filter，于是点 × 之后条目原地不动，条目**永远关不掉**，只能等
   * 「清空全部」。这里改成：先乐观移除（即时反馈），调用 DELETE 失败再按快照恢复。
   * @param {string | number} id  通知 ID
   */
  async function dismiss(id: string | number) {
    // 摘除与回插都走 store 的 action：通知列表只有 store 一个写入方，composable 不再
    // 直接 splice 数组（早期 compose 直接改数组，回滚越界、期间被重新推送回来时会插重复项）。
    const removed = entitiesStore.removeRemoteNotification(id)
    if (!removed) return
    try {
      await deleteNotification(id)
    } catch (error) {
      entitiesStore.restoreRemoteNotification(removed.entry, removed.index)
      notifyError(error, '关闭通知')
    }
  }

  /**
   * 一键标记全部通知为已读。
   * 失败时按 id 回滚到调用前的已读状态。
   */
  async function markAllRead() {
    const prevRead = new Map(remoteList.value.map((notification) => [notification.id, Boolean(notification.read)]))
    const list = remoteList.value
    for (const notification of list) notification.read = true
    try {
      await markAllNotificationsRead()
    } catch (error) {
      // 只按 id 恢复「调用前那批」的已读状态：整体替换数组会把 await 期间新到达的
      // 通知一起抹掉。
      for (const notification of list) {
        const previous = prevRead.get(notification.id)
        if (previous !== undefined) notification.read = previous
      }
      notifyError(error, '标记已读')
    }
  }

  /**
   * 清空全部通知：先确认，再清 store，最后调用远程清空接口；
   * 失败时按快照回滚。
   */
  async function clearAll() {
    const chrome = useChromeStore()
    const ok = await chrome.confirm('确定清空全部通知？此操作不可撤销。', '清空通知', {
      confirmText: '清空',
      cancelText: '取消',
      type: 'danger',
    })
    if (!ok) return
    const prevRemote = [...remoteList.value]
    entitiesStore.clearRemoteNotifications()
    try {
      await clearNotifications()
    } catch (error) {
      // 失败回滚：addRemoteNotification 是 unshift，倒序回填才能还原原有时间顺序
      for (const notification of [...prevRemote].reverse()) {
        entitiesStore.addRemoteNotification(notification)
      }
      notifyError(error, '清空通知')
    }
  }

  /**
   * 拉取远程通知并写入 store。
   * 仅在已登录时执行，失败时记录错误信息。
   *
   * 同一时刻只允许一个请求在飞：WS 的 ``notification`` 事件是逐条触发的，一轮告警风暴
   * （比如断电恢复后补推 20 条）会在 RTT 内触发 20 次调用，每次拉回来的都是同一份列表。
   * 飞行中再次触发直接复用同一个 promise，风暴结束后自然只多一次刷新。
   */
  let inflight: Promise<void> | null = null

  function fetchRemote(): Promise<void> {
    if (!authStore.isAuthenticated) return Promise.resolve()
    if (inflight) return inflight
    inflight = runFetchRemote()
    return inflight.finally(() => {
      inflight = null
    })
  }

  async function runFetchRemote(): Promise<void> {
    remoteLoading.value = true
    remoteError.value = ''
    try {
      const res = await fetchNotifications({ limit: getMaxRemoteNotifications() })
      if (res.data && Array.isArray(res.data)) {
        for (const notification of res.data) {
          entitiesStore.addRemoteNotification(notification)
        }
      }
    } catch (error) {
      remoteError.value = getApiErrorMessage(error, '通知加载失败')
      logger.warn('远程通知加载失败', error)
    } finally {
      remoteLoading.value = false
    }
  }

  /**
   * 加载免打扰（DND）与通知偏好配置。
   * 失败时不抛错，仅记录调试日志并清空配置。
   */
  async function fetchDnd() {
    if (!authStore.isAuthenticated) return
    try {
      const res = await fetchNotificationSettings()
      dndSettings.value = res.data
      notifyPrefs.value = parseNotificationSettings(res.data)
    } catch (error) {
      logger.debug('通知免打扰设置加载失败', error)
      dndSettings.value = null
    }
  }

  /**
   * 根据级别返回对应的图标组件。
   * @param {string} level  级别 key
   * @returns lucide 图标组件
   */
  function levelIcon(level: string) {
    if (level === 'danger') return AlertTriangle
    if (level === 'warn') return Bell
    if (level === 'success') return CheckCircle2
    return Info
  }

  /**
   * 根据级别返回对应的 Tailwind 文字颜色 class。
   * @param {string} level  级别 key
   * @returns 颜色 class 字符串
   */
  function levelColor(level: string) {
    if (level === 'danger') return 'text-red-400'
    if (level === 'warn') return 'text-yellow-400'
    if (level === 'success') return 'text-green-400'
    return 'text-blue-400'
  }

  onMounted(() => {
    fetchRemote()
    fetchDnd()
    // 注册全局刷新处理器：其它模块（如桥接层）可触发通知刷新
    registerNotificationRefreshHandler(fetchRemote)
  })

  onUnmounted(() => {
    registerNotificationRefreshHandler(null)
  })

  // 每 120 秒定时刷新免打扰配置，及时响应用户偏好变化
  useScheduledPoll(fetchDnd, 120_000, { configKey: 'notificationCenter' })

  return {
    authStore,
    sourceFilters,
    levelFilters,
    dndSettings,
    notifyPrefs,
    remoteLoading,
    remoteError,
    activeSource,
    activeLevel,
    focusedIndex,
    listRef,
    prefFilteredNotifications,
    displayNotifications,
    filterCounts,
    unreadCount,
    lanPushReady,
    setFilterRef,
    onListKeydown,
    onFilterKeydown,
    onNotificationClick,
    markRead,
    dismiss,
    markAllRead,
    clearAll,
    fetchRemote,
    levelIcon,
    levelColor,
    resolveNotificationLink,
  }
}

/** 小组件轮询调度组合式函数：走全局调度器，页面隐藏时暂停。 */
// 轮询实例自增序号，用于在没有显式 key 时生成唯一 key
let pollInstanceSeq = 0

/** 轮询可选项 */
interface ScheduledPollOptions {
  /** 是否在 onMounted 时立即执行一次回调（默认 true） */
  immediate?: boolean
  /** 页面隐藏时是否暂停（保留给调度器内部使用） */
  pauseWhenHidden?: boolean
  /** 自定义轮询 key，相同 key 会复用调度；未提供时使用组件 uid 或自增序号 */
  key?: string
  /**
   * 小组件轮询键：命中「高级参数 → widgetPollIntervals[key]」时用其毫秒值
   * 覆盖代码内置的 intervalMs（如 'weather' / 'homeClimateChart'）。
   */
  configKey?: string
}

/**
 * 注册一个小组件轮询任务，遵循组件生命周期（挂载时启动、卸载时取消）。
 *
 * @param {() => void} callback  轮询回调
 * @param {number | Ref<number> | (() => number)} intervalMs  轮询间隔（毫秒），支持静态值、ref 或 getter
 * @param {ScheduledPollOptions} [options]  轮询可选项
 * @returns {{ refresh: () => void, restart: () => void }} refresh=手动触发一次回调；restart=重新注册（间隔变化时使用）
 */
export function useScheduledPoll(
  callback: () => void,
  intervalMs: number | Ref<number> | (() => number),
  options: ScheduledPollOptions = {},
) {
  const { immediate = true, key: explicitKey, configKey } = options
  let cancel: (() => void) | null = null
  // 计算 key：优先使用显式 key，否则以模块级自增序号生成，保证同一组件内多次调用也互不冲突
  const pollKey = explicitKey || `poll:${++pollInstanceSeq}`

  /** 解析当前轮询间隔：兼容 number / Ref / getter 三种入参形态 */
  function baseMs() {
    if (typeof intervalMs === 'function') return intervalMs()
    if (isRef(intervalMs)) return unref(intervalMs)
    return intervalMs
  }

  /** 解析最终间隔：configKey 命中高级参数覆写时优先使用配置值 */
  function resolveMs() {
    const base = baseMs()
    return configKey ? getWidgetPollInterval(configKey, base) : base
  }

  /** 注册（或重新注册）当前轮询任务到全局调度器 */
  function register() {
    if (cancel) cancel()
    cancel = schedulePoll(pollKey, callback, resolveMs())
  }

  let active = false
  onMounted(() => {
    // 立即执行策略：仅当 immediate 且页面可见时触发一次，避免在后台标签页浪费资源
    if (immediate && !document.hidden) callback()
    register()
    active = true
  })

  // 高级参数（widgetPollIntervals）热更新后重排定时器，无需刷新页面即可生效
  watch(configEpoch, () => {
    if (active) register()
  })

  onUnmounted(() => {
    active = false
    if (cancel) cancel()
    cancel = null
  })

  return { refresh: callback, restart: register }
}

/** - vue（ref/onUnmounted/Ref 类型） */
/** 侧栏需视口门控的 widget（图表 / 轮播 / 媒体 / 天气动画） */
export const PANEL_VISIBILITY_WIDGET_TYPES = new Set([
  'homeEnvironment',
  'homeClimateChart',
  'climateHub',
  'heroSwiper',
  'weather',
  'mediaMini',
  'mediaPlaylist',
  'mediaPlayer',
  'environmentHealth',
  'switchGroup',
])
/**
 * 监听面板 widget 是否在视口内（用于侧栏滚动时暂停图表）。
 *
 * 使用 IntersectionObserver 监听根元素与视口的交集，当交集比例 > 2% 时视为可见。
 * enabled 为 false 时直接返回可见并断开观察，避免不必要的性能开销。
 *
 * @param rootRef 根元素 DOM 引用
 * @param options.enabled 是否启用监听（支持 ref 或布尔值），缺省为 true
 * @returns isVisible 是否可见；bind 绑定元素；disconnect 断开观察
 */
export function useWidgetPanelVisibility(
  _rootRef: Ref<HTMLElement | null> | null,
  options: { enabled?: Ref<boolean> | boolean } = {},
) {
  // 是否可见（默认 true，由 IntersectionObserver 更新）
  const isVisible = ref(true)
  let observer: IntersectionObserver | null = null
  /** 断开 IntersectionObserver */
  function disconnect() {
    if (observer) {
      observer.disconnect()
      observer = null
    }
  }
  /** 连接 IntersectionObserver 监听指定元素 */
  function connect(el: HTMLElement | null) {
    disconnect()
    if (!el) return
    observer = new IntersectionObserver(
      ([entry]) => {
        // 交集比例 > 2% 才视为可见，避免边缘像素抖动
        isVisible.value = entry.isIntersecting && entry.intersectionRatio > 0.02
      },
      { threshold: [0, 0.02, 0.1, 0.25] },
    )
    observer.observe(el)
  }
  /** 绑定元素：根据 enabled 决定是否连接观察器 */
  function bind(el: HTMLElement | null) {
    const enabled = options.enabled
    const active = enabled == null ? true : typeof enabled === 'object' ? enabled.value : enabled
    if (!active) {
      // 未启用时直接视为可见并断开，减少性能开销
      isVisible.value = true
      disconnect()
      return
    }
    connect(el)
  }
  onUnmounted(disconnect)
  return { isVisible, bind, disconnect }
}
