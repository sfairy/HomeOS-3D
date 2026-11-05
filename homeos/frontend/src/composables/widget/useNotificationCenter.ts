/** 通知中心组合式函数（widget 内嵌）。 */
import { ref, computed, onMounted, onUnmounted, watch, type ComponentPublicInstance } from 'vue'
import { useRouter } from 'vue-router'
import { Bell, AlertTriangle, Info, CheckCircle2 } from '@lucide/vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useAuthStore } from '@/stores/auth.store'
import { useChromeStore } from '@/stores/chrome.store'
import { registerNotificationRefreshHandler } from '@/shared/utils/bridge/store-bridge'
import {
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearNotifications,
  fetchNotifications,
  fetchNotificationSettings,
} from '@/services/api/notifications'
import { notifyError } from '@/services/notify'
import { useScheduledPoll } from '@/shared/widget/composables/useScheduledPoll'
import { parseNotificationSettings } from '@/shared/notifications/utils/dnd.util'
import { getMaxRemoteNotifications } from '@/shared/utils/config/frontend-config'
import { logger } from '@/shared/utils/core/logger'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import { SETTINGS_ROUTES } from '@/shared/utils/registry/settings-route.util'
import {
  applyNotifyPrefs,
  buildSourceFilters,
  countBySource,
  filterByLevel,
  filterBySource,
  mergeNotificationLists,
  type NotificationCenterItem,
} from '@/composables/widget/notification-center.filters.internals'

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
   */
  async function fetchRemote() {
    if (!authStore.isAuthenticated) return
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
