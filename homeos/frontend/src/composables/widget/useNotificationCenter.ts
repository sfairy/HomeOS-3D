/**
 * 通知中心组合式函数（widget 内嵌）。
 *
 * 职责：聚合远程通知与本地通知，提供按级别/来源过滤、键盘导航、点击跳转、
 *      标记已读、清空、免打扰（DND）配置加载、远程通知定时刷新等完整能力，
 *      面向通知中心面板组件暴露统一状态与方法。
 * 依赖：
 *   - vue（ref / computed / onMounted / onUnmounted / watch / ComponentPublicInstance）
 *   - vue-router（点击通知后跳转）
 *   - @lucide/vue（图标组件）
 *   - @/stores/entities.store（实体与远程通知状态）
 *   - @/stores/auth.store（鉴权状态）
 *   - @/utils/bridge/store-bridge（注册通知刷新处理器）
 *   - @/services/api/notifications（通知远程 API）
 *   - @/services/notify（错误提示）
 *   - @/composables/widget/useScheduledPoll（DND 定时刷新）
 *   - @/utils/notification/dnd.util（免打扰配置解析）
 *   - @/utils/config/frontend-config（远程通知拉取条数上限）
 *   - @/utils/core/logger & error-message（日志与错误信息提取）
 *   - @/utils/registry/settings-route.util（通知跳转目标路由解析）
 *   - @homeos/shared（来源过滤构造）
 */
import { ref, computed, onMounted, onUnmounted, watch, type ComponentPublicInstance } from 'vue'
import { useRouter } from 'vue-router'
import { Bell, AlertTriangle, Info, CheckCircle2 } from '@lucide/vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useAuthStore } from '@/stores/auth.store'
import { useChromeStore } from '@/stores/chrome.store'
import { registerNotificationRefreshHandler } from '@/utils/bridge/store-bridge'
import {
  markNotificationRead,
  markAllNotificationsRead,
  clearNotifications,
  fetchNotifications,
  fetchNotificationSettings,
} from '@/services/api/notifications'
import { notifyError } from '@/services/notify'
import { useScheduledPoll } from '@/composables/widget/useScheduledPoll'
import { parseNotificationSettings } from '@/utils/notification/dnd.util'
import { getMaxRemoteNotifications } from '@/utils/config/frontend-config'
import { logger } from '@/utils/core/logger'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import {
  buildNotificationSourceFilters,
  matchesNotificationSourceFilter,
  isLifeSafetyNotification,
} from '@homeos/shared'
import type { RemoteNotificationPayload } from '@/types/entity-store'

/** 通知级别过滤选项：UI 显示的「全部/紧急/警告/信息/成功」 */
const levelFilters = [
  { key: 'all', label: '全部级别' },
  { key: 'danger', label: '紧急' },
  { key: 'warn', label: '警告' },
  { key: 'info', label: '信息' },
  { key: 'success', label: '成功' },
]

/** 通知中心展示条目（远程 + 本地合并） */
interface NotificationItem {
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
}
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
  // entitiesStore 上可能挂载 addRemoteNotification 方法（用于回填远程通知）
  type EntitiesNotifyApi = {
    addRemoteNotification?: (data: RemoteNotificationPayload) => void
  }
  const notifyApi = entitiesStore as typeof entitiesStore & EntitiesNotifyApi

  /** 本地通知列表（不含远程） */
  const localNotifications = ref<NotificationItem[]>([])
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
   * @param {KeyboardEvent} e  键盘事件
   */
  function onListKeydown(e: KeyboardEvent) {
    const len = displayNotifications.value.length
    if (!len) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      focusListItem(focusedIndex.value < 0 ? 0 : focusedIndex.value + 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      focusListItem(focusedIndex.value < 0 ? len - 1 : focusedIndex.value - 1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      focusListItem(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      focusListItem(len - 1)
    }
  }

  /**
   * 来源筛选按钮的键盘导航：左右方向键 / Home / End 切换。
   * @param {KeyboardEvent} e  键盘事件
   */
  function onFilterKeydown(e: KeyboardEvent) {
    const tabs = sourceFilters.value
    const cur = tabs.findIndex((f) => f.key === activeSource.value)
    if (cur < 0) return
    let next = cur
    if (e.key === 'ArrowRight') next = (cur + 1) % tabs.length
    else if (e.key === 'ArrowLeft') next = (cur - 1 + tabs.length) % tabs.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = tabs.length - 1
    else return
    e.preventDefault()
    activeSource.value = tabs[next].key
    filterRefs.value[next]?.focus?.()
  }
  // 全部通知（远程 + 本地合并，按时间倒序）
  const allNotifications = computed(() => {
    const remote = entitiesStore.remoteNotifications || []
    const local = localNotifications.value
    const merged: NotificationItem[] = [
      ...remote.map((n) => ({ ...n, read: n.read || false })),
      ...local,
    ]
    merged.sort((a, b) => {
      const aTime = Date.parse(a.createdAt || a.time || '') || (typeof a.id === 'number' ? a.id : 0)
      const bTime = Date.parse(b.createdAt || b.time || '') || (typeof b.id === 'number' ? b.id : 0)
      if (aTime !== bTime) return bTime - aTime
      // 同时间戳时区分本地（id 超大）与远程，远程排在前面
      const aIdx = Number(a.id) > 1e15 ? 0 : 1
      const bIdx = Number(b.id) > 1e15 ? 0 : 1
      return aIdx - bIdx
    })
    return merged
  })

  /**
   * 判断通知是否为「设备离线/恢复在线」类型。
   * @param {NotificationItem} n  通知项
   * @returns 是否为离线类通知
   */
  function isOfflineNotification(n: NotificationItem) {
    if (n.monitorKind === 'offline' || n.monitorKind === 'online') return true
    const msg = n.message || ''
    return (
      n.source === 'device-monitor' ||
      msg.includes('离线') ||
      msg.includes('恢复在线') ||
      msg.includes('offline') ||
      msg.includes('back online')
    )
  }

  /**
   * 判断通知是否为「低电量」类型。
   * @param {NotificationItem} n  通知项
   * @returns 是否为低电量类通知
   */
  function isLowBatteryNotification(n: NotificationItem) {
    if (n.monitorKind === 'low_battery') return true
    const msg = n.message || ''
    return msg.includes('电量') || msg.includes('低电量') || msg.includes('battery')
  }

  /**
   * 应用通知偏好：根据 notifyPrefs 过滤通知（如关闭紧急/离线/低电量通知时移除对应项）。
   * @param {NotificationItem[]} list  原始通知列表
   * @returns 过滤后的通知列表
   */
  function applyNotifyPrefs(list: NotificationItem[]) {
    let out = list
    if (!notifyPrefs.value.globalNotifyEnabled) return []
    if (!notifyPrefs.value.importantNotifyEnabled) {
      // 与后端一致：关闭「告警与警告」时仍保留生命安全类（danger / 安防 / EEW 等）
      out = out.filter(
        (n) =>
          n.level === 'info' ||
          n.level === 'success' ||
          isLifeSafetyNotification(n.level, n.source),
      )
    }
    if (!notifyPrefs.value.offlineNotifyEnabled) {
      out = out.filter((n) => !isOfflineNotification(n))
    }
    if (!notifyPrefs.value.lowBatteryNotifyEnabled) {
      out = out.filter((n) => !isLowBatteryNotification(n))
    }
    return out
  }

  /**
   * 按级别过滤通知。
   * @param {NotificationItem[]} list  通知列表
   * @param {string} level  级别 key（all=不过滤）
   * @returns 过滤后的通知列表
   */
  function filterByLevel(list: NotificationItem[], level: string) {
    if (level === 'all') return list
    return list.filter((n) => (n.level || 'info') === level)
  }

  /**
   * 按来源过滤通知（来源匹配由 matchesNotificationSourceFilter 完成）。
   * @param {NotificationItem[]} list  通知列表
   * @param {string} source  来源 key
   * @returns 过滤后的通知列表
   */
  function filterBySource(list: NotificationItem[], source: string) {
    return list.filter((n) => matchesNotificationSourceFilter(n.source, source))
  }
  // 应用偏好后的通知列表（不含级别/来源过滤）
  const prefFilteredNotifications = computed(() => applyNotifyPrefs(allNotifications.value))

  // 来源筛选选项（由 @homeos/shared 工具基于通知来源动态构造，最多 9 个）
  const sourceFilters = computed(() =>
    buildNotificationSourceFilters(prefFilteredNotifications.value, { maxTabs: 9 }),
  )

  // 最终展示的通知列表：先级别、再来源过滤后的结果
  const displayNotifications = computed(() =>
    filterBySource(
      filterByLevel(prefFilteredNotifications.value, activeLevel.value),
      activeSource.value,
    ),
  )

  // 各来源筛选 tab 的通知数量统计（用于徽标显示）
  const filterCounts = computed(() => {
    const base = prefFilteredNotifications.value
    const counts: Record<string, number> = { all: base.length }
    for (const f of sourceFilters.value) {
      if (f.key === 'all') continue
      counts[f.key] = filterBySource(base, f.key).length
    }
    return counts
  })

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

  // 切换来源时重置聚焦
  watch(activeSource, () => {
    focusedIndex.value = displayNotifications.value.length ? 0 : -1
  })

  // 切换级别时重置聚焦
  watch(activeLevel, () => {
    focusedIndex.value = displayNotifications.value.length ? 0 : -1
  })

  // 未读通知数量
  const unreadCount = computed(() => displayNotifications.value.filter((n) => !n.read).length)

  // 局域网推送是否就绪：需要实体连接 + 已登录
  const lanPushReady = computed(() => Boolean(entitiesStore.connected && authStore.isAuthenticated))

  /**
   * 根据通知来源与实体 ID 解析点击后应跳转的路由。
   * @param {NotificationItem} n  通知项
   * @returns 跳转路径字符串；无对应路由时返回 null
   */
  function resolveNotificationLink(n: NotificationItem) {
    const src = String(n.source || '')
    if (src === 'emergency' || src.startsWith('security')) return '/security'
    if (src === 'alert-rule' || src.startsWith('alert-rule'))
      return SETTINGS_ROUTES.fromNotificationSource(src)
    if (src.startsWith('energy') || src === 'energy-budget' || src === 'energy-anomaly') {
      return SETTINGS_ROUTES.params('energy')
    }
    if (src === 'water-monitor') {
      return SETTINGS_ROUTES.params('water')
    }
    if (src.startsWith('device-health') || src === 'device-monitor') {
      if (n.entityId) return `/device?id=${encodeURIComponent(n.entityId)}`
    }
    if (src === 'environment-health') return SETTINGS_ROUTES.envHealth()
    if (src.startsWith('earthquake')) return '/earthquake-history'
    if (src === 'home-mode' || src.startsWith('home-mode')) return SETTINGS_ROUTES.homeMode()
    if (src === 'automation') return SETTINGS_ROUTES.homeMode()
    if (src.includes('linkage') || src.includes('linkage_'))
      return SETTINGS_ROUTES.securityModes('linkage')
    if (src.startsWith('voice')) return SETTINGS_ROUTES.voice()
    if (n.entityId) return `/device?id=${encodeURIComponent(n.entityId)}`
    return null
  }
  /**
   * 点击通知：标记为已读（远程 + 本地）并跳转到对应路由。
   * @param {NotificationItem} n  被点击的通知项
   */
  async function onNotificationClick(n: NotificationItem) {
    if (!n.read) {
      const remote = entitiesStore.remoteNotifications?.find((r) => r.id === n.id)
      if (remote) {
        try {
          await markNotificationRead(n.id)
          remote.read = true
        } catch (e) {
          logger.debug('标记通知为已读失败', e)
        }
      }
      n.read = true
      const local = localNotifications.value.find((l) => l.id === n.id)
      if (local) local.read = true
    }
    const to = resolveNotificationLink(n)
    if (to) router.push(to)
  }

  /**
   * 关闭（移除）指定通知：远程调用标记已读，本地从列表中过滤掉。
   * @param {string | number} id  通知 ID
   */
  async function dismiss(id: string | number) {
    const remote = entitiesStore.remoteNotifications?.find((n) => n.id === id)
    if (remote) {
      const prevRead = remote.read
      try {
        await markNotificationRead(id)
        remote.read = true
      } catch (e) {
        // 失败回滚已读状态并提示
        remote.read = prevRead
        notifyError(e, '关闭通知')
        return
      }
    }
    localNotifications.value = localNotifications.value.filter((n) => n.id !== id)
  }

  /**
   * 一键标记全部通知为已读（本地 + 远程）。
   * 失败时回滚到调用前的状态。
   */
  async function markAllRead() {
    const prevLocal = localNotifications.value.map((n) => ({ ...n }))
    const prevRemoteRead = new Map(
      (entitiesStore.remoteNotifications || []).map((n) => [n.id, n.read]),
    )
    try {
      await markAllNotificationsRead()
      localNotifications.value.forEach((n) => {
        n.read = true
      })
      for (const n of entitiesStore.remoteNotifications || []) {
        n.read = true
      }
    } catch (e) {
      // 失败回滚：恢复本地通知与远程已读状态
      localNotifications.value = prevLocal
      for (const n of entitiesStore.remoteNotifications || []) {
        if (prevRemoteRead.has(n.id)) n.read = prevRemoteRead.get(n.id)!
      }
      notifyError(e, '标记已读')
    }
  }

  /**
   * 清空全部通知：先确认，再清本地与 store，最后调用远程清空接口；
   * 失败时回滚本地与远程通知列表。
   */
  async function clearAll() {
    const chrome = useChromeStore()
    const ok = await chrome.confirm(
      '确定清空全部通知？此操作不可撤销。',
      '清空通知',
      { confirmText: '清空', cancelText: '取消', type: 'danger' },
    )
    if (!ok) return
    const prevLocal = [...localNotifications.value]
    const prevRemote = [...(entitiesStore.remoteNotifications || [])]
    localNotifications.value = []
    entitiesStore.clearRemoteNotifications()
    try {
      await clearNotifications()
    } catch (e) {
      // 失败回滚：恢复本地与远程通知
      localNotifications.value = prevLocal
      for (const n of prevRemote) {
        notifyApi.addRemoteNotification?.(n)
      }
      notifyError(e, '清空通知')
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
        for (const n of res.data) {
          notifyApi.addRemoteNotification?.(n)
        }
      }
    } catch (e) {
      remoteError.value = getApiErrorMessage(e, '通知加载失败')
      logger.warn('远程通知加载失败', e)
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
    } catch (e) {
      logger.debug('通知免打扰设置加载失败', e)
      dndSettings.value = null
    }
  }

  /**
   * 根据级别返回对应的图标组件。
   * @param {string} l  级别 key
   * @returns lucide 图标组件
   */
  function levelIcon(l: string) {
    if (l === 'danger') return AlertTriangle
    if (l === 'warn') return Bell
    if (l === 'success') return CheckCircle2
    return Info
  }

  /**
   * 根据级别返回对应的 Tailwind 文字颜色 class。
   * @param {string} l  级别 key
   * @returns 颜色 class 字符串
   */
  function levelColor(l: string) {
    if (l === 'danger') return 'text-red-400'
    if (l === 'warn') return 'text-yellow-400'
    if (l === 'success') return 'text-green-400'
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
  useScheduledPoll(fetchDnd, 120_000)

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
    dismiss,
    markAllRead,
    clearAll,
    fetchRemote,
    levelIcon,
    levelColor,
    resolveNotificationLink,
  }
}