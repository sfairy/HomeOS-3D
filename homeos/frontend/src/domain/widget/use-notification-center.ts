/** 通知中心组合式函数（widget 内嵌）。 */
import { ref, computed, onMounted, onUnmounted, watch, type ComponentPublicInstance } from 'vue'
import { useRouter } from 'vue-router'
import { Bell, AlertTriangle, Info, CheckCircle2 } from '@lucide/vue'
import { useEntitiesStore } from '@/domain/entity/store/entities.store'
import { useAuthStore } from '@/domain/auth/auth.store'
import { useChromeStore } from '@/kernel/ui/chrome/chrome-store'
import { registerNotificationRefreshHandler } from '@/kernel/bridge/store-bridge'
import {
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearNotifications,
  fetchNotifications,
  fetchNotificationsPage,
  fetchNotificationSettings,
} from '@/domain/api/notifications'

import { notifyError } from '@/kernel/ui/notify'
import { useScheduledPoll } from '@/domain/widget/use-scheduled-poll'
import { parseNotificationSettings } from '@/domain/notifications/dnd'
import { getMaxRemoteNotifications } from '@/kernel/config/frontend-config'
import { logger } from '@/kernel/core/logger'
import { getApiErrorMessage } from '@/kernel/core/error-message'
import { SETTINGS_ROUTES } from '@/kernel/registry/settings-route'
import {
  applyNotifyPrefs,
  buildSourceFilters,
  countBySource,
  filterByLevel,
  filterBySource,
  mergeNotificationLists,
  type NotificationCenterItem,
} from '@/domain/widget/notification-center.filters'

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
  // 全部通知（唯一数据源 = 实体 store 的远程通知列表 + 分页「加载更多」追加的旧数据）
  //
  // 分页结果**不能**塞进 `entities.store.remoteNotifications`：那里每来一条 WS 通知就按
  // `maxRemoteNotifications`（默认 100）截断，翻出来的旧页会被立刻挤掉。所以另存一份
  // `pagedExtra`，在展示层按 id 去重合并。
  const pagedExtra = ref<NotificationCenterItem[]>([])
  /**
   * 分页缓存里的同 id 条目。
   *
   * WS 列表与分页结果是两份对象（id 相同），只改其中一份会出现「列表里已读、
   * 翻到旧页又变未读」——已读 / 删除这类写操作必须两份一起改。
   */
  function pagedTwin(id: string | number): NotificationCenterItem | undefined {
    return pagedExtra.value.find((item) => item.id === id)
  }
  const allNotifications = computed(() =>
    mergeNotificationLists(remoteList.value as NotificationItem[], pagedExtra.value),
  )

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
    // 游标是「某条记录在某个来源下的位置」：换了来源还沿用旧游标，下一页会从旧来源的
    // 位置往后取，漏掉新来源里比它更新的记录。
    resetPaging()
  })

  watch(activeLevel, () => {
    focusedIndex.value = displayNotifications.value.length ? 0 : -1
  })

  // 未读通知数量
  const unreadCount = computed(() => displayNotifications.value.filter((notification) => !notification.read).length)

  /**
   * 全量未读数（不受来源 / 级别筛选影响）。
   *
   * 外壳顶栏的铃铛角标必须用它：筛选面板里点一下「安防」来源，`displayNotifications`
   * 就只剩安防这一类，角标会跟着掉到该子集甚至整块消失（`v-if="unread > 0"`），
   * 而实际还有几十条未读。`unreadCount` 仍给抽屉头部的「当前筛选」自用。
   */
  const totalUnreadCount = computed(
    () => prefFilteredNotifications.value.filter((notification) => !notification.read).length,
  )

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
    // 分页缓存里可能是另一份对象：不同步改会出现「列表已读、翻回旧页又未读」。
    const twin = pagedTwin(notification.id)
    if (twin && twin !== notification) twin.read = true
    try {
      await markNotificationRead(notification.id)
    } catch (error) {
      // 回滚改的是同一个对象，不需要再按 id 找回 store 那份（早期两份快照各写一次，
      // 一处漏改就出现「点了已读、刷新又变未读」）
      notification.read = false
      if (twin && twin !== notification) twin.read = false
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
    // 旧页里的条目只在 pagedExtra 里：以前这里 `if (!removed) return`，于是点 × 完全没反应
    // （连 DELETE 都不发），只能等下一次刷新才消失。两份都要摘。
    const pagedIndex = pagedExtra.value.findIndex((item) => item.id === id)
    const pagedRemoved = pagedIndex >= 0 ? pagedExtra.value[pagedIndex] : null
    if (pagedIndex >= 0) pagedExtra.value = pagedExtra.value.filter((_, index) => index !== pagedIndex)
    if (!removed && !pagedRemoved) return
    try {
      await deleteNotification(id)
    } catch (error) {
      if (removed) entitiesStore.restoreRemoteNotification(removed.entry, removed.index)
      if (pagedRemoved) {
        pagedExtra.value = [
          ...pagedExtra.value.slice(0, pagedIndex),
          pagedRemoved,
          ...pagedExtra.value.slice(pagedIndex),
        ]
      }
      notifyError(error, '关闭通知')
    }
  }

  /**
   * 一键标记全部通知为已读。
   * 失败时按 id 回滚到调用前的已读状态。
   */
  async function markAllRead() {
    // 两份列表都要改：只遍历 remoteList 会让「翻出来的旧页」保持未读，
    // 未读徽标与底部计数就会和真实已读状态对不上。
    const targets = [
      ...remoteList.value,
      ...pagedExtra.value.filter((item) => !remoteList.value.some((other) => other.id === item.id)),
    ]
    const prevRead = new Map(targets.map((notification) => [notification.id, Boolean(notification.read)]))
    for (const notification of targets) notification.read = true
    try {
      await markAllNotificationsRead()
    } catch (error) {
      // 只按 id 恢复「调用前那批」的已读状态：整体替换数组会把 await 期间新到达的
      // 通知一起抹掉。
      for (const notification of targets) {
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
    // 分页里缓存的是旧页，不清掉会让「清空全部」之后列表又冒出历史记录。
    resetPaging()
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

  // ── 游标分页（「加载更多」）──────────────────────────────────
  /** 下一页的游标：`null` = 还没有翻过页，也 = 没有更多。 */
  const nextBefore = ref<string | null>(null)
  const hasMore = ref(false)
  const loadingMore = ref(false)
  /** 分页是否已经被用户触发过：首屏不预取，避免与 WS 首屏列表重复请求。 */
  let pagedStarted = false

  /** 重载分页状态（刷新 / 切账号 / 清空时调用）。 */
  function resetPaging(): void {
    pagedExtra.value = []
    nextBefore.value = null
    hasMore.value = false
    loadingMore.value = false
    pagedStarted = false
  }

  /**
   * 加载下一页。
   *
   * 第一次调用先取一页（`before` 为空）并把 `nextBefore` 记下来；之后按游标往后翻。
   * 失败时保留已有数据，只把错误写进 `remoteError`（翻页失败不该清空列表）。
   */
  async function loadMore(): Promise<void> {
    if (!authStore.isAuthenticated || loadingMore.value) return
    if (pagedStarted && !hasMore.value) return
    loadingMore.value = true
    const firstPage = !pagedStarted
    pagedStarted = true
    try {
      const res = await fetchNotificationsPage<NotificationCenterItem>({
        before: firstPage ? null : nextBefore.value,
        source: activeSource.value === 'all' ? undefined : activeSource.value,
      })
      const page = res.data
      if (page && Array.isArray(page.items)) {
        // 与已有 id 去重后再追加：两次翻页之间 WS 可能补进了同样的记录。
        const known = new Set(pagedExtra.value.map((item) => String(item.id)))
        const fresh = page.items.filter((item) => !known.has(String(item.id)))
        pagedExtra.value = [...pagedExtra.value, ...fresh]
        nextBefore.value = page.nextBefore ?? null
        hasMore.value = Boolean(page.nextBefore)
      } else {
        hasMore.value = false
      }
    } catch (error) {
      remoteError.value = getApiErrorMessage(error, '加载更多通知失败')
      logger.warn('通知分页加载失败', error)
    } finally {
      loadingMore.value = false
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

  // 登录态变化时必须清掉分页缓存与远程列表：
  // 否则登出再登录后，新会话会先看到上一个账号翻出来的旧页（它们不在新列表的 id 集合里，
  // 去重也拦不住）。`clearRemoteNotifications` 由实体 store 提供，和其它写路径同一份数据源。
  watch(
    () => authStore.isAuthenticated,
    (authenticated) => {
      resetPaging()
      if (!authenticated) entitiesStore.clearRemoteNotifications()
    },
  )

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
    totalUnreadCount,
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
    loadMore,
    resetPaging,
    nextBefore,
    hasMore,
    loadingMore,
    levelIcon,
    levelColor,
    resolveNotificationLink,
  }
}
