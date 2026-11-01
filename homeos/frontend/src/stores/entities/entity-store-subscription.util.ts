import { logger } from '@/shared/utils/core/logger'
/** 实体 store 状态订阅与远程通知（从 entity-store-support.ts 拆回）。 */
import { reactive, shallowReactive } from 'vue'
import type {
  EntityStateListenerFn,
  EntitySubscriptionDeps,
  HaEntityState,
  RegisterStateListenerOptions,
  RemoteNotificationEntry,
  RemoteNotificationPayload,
} from '@/shared/types/entity-store'
import {
  getFrontendConfig,
  getMaxStateListeners,
  reloadFrontendConfig,
} from '@/shared/utils/config/frontend-config'
import {
  dispatchStateListener,
  getStateListenerCount,
  getStateListenerStats,
  registerStateListener,
} from '@/shared/entity/utils/state-listener'
import { formatLocaleTime } from '@/shared/utils/format/locale-format.util'

// ── entity-store-subscription.util ──
/**
 * 实体 store 状态订阅与远程通知（从 entities.store 抽离）
 * @param deps 依赖注入对象（logger / perfStats）
 * @returns remoteNotifications / emitStateListeners / onStateChanged / addRemoteNotification / clearRemoteNotifications
 */
export function createEntitySubscriptionHelpers(deps: EntitySubscriptionDeps) {
  // 远程通知列表（shallowReactive，按 id 去重后 unshift）；条目本身是 reactive，
  // 单条打已读（`entry.read = true`）能直接驱动依赖它的 computed 重算。
  const remoteNotifications = shallowReactive<RemoteNotificationEntry[]>([])
  // 监听器上限警告节流时间戳（30s 一次警告）
  let listenerLimitWarnAt = 0
  // 监听器上限配置热重载节流时间戳（5s 一次 reload）
  let listenerLimitConfigSyncAt = 0

  // 最大监听器数（动态读取，支持热配置）
  const maxListeners = () => getMaxStateListeners()
  // 最大远程通知数（动态读取）
  const maxRemoteNotifications = () => getFrontendConfig().maxRemoteNotifications

  /**
   * 派发状态变更到所有匹配的监听器
   * @param entityId 实体 ID
   * @param newState 新状态（删除时为 null）
   * @param oldState 旧状态（新增时为 null）
   */
  function emitStateListeners(
    entityId: string,
    newState: HaEntityState | null,
    oldState: HaEntityState | null,
  ): void {
    dispatchStateListener(
      { entity_id: entityId, new_state: newState, old_state: oldState },
      deps.logger,
    )
  }

  /**
   * 添加一条远程通知到列表。
   * - 缺 id 时用时间戳 + 随机串生成
   * - 按 id 去重：命中已存在条目则原地合并（保留已读状态等最新值），避免列表出现重复项
   * - 超过 maxRemoteNotifications 时截断
   * @param data 通知载荷
   */
  function addRemoteNotification(data: RemoteNotificationPayload): void {
    const id = data.id || Date.now() + '_' + Math.random().toString(36).slice(2)
    const createdAt = data.createdAt ? String(data.createdAt) : new Date().toISOString()
    const entry: RemoteNotificationEntry = reactive({
      id,
      level: data.level || 'info',
      message: data.message || '',
      source: data.source || 'system',
      time: formatLocaleTime(createdAt, { hour: '2-digit', minute: '2-digit' }),
      createdAt,
      read: data.read || false,
      deliveredAt: data.deliveredAt ? String(data.deliveredAt) : undefined,
    })
    // 按 id 去重：同一通知可能经 Socket 即时推送与 REST 重新拉取（如重连刷新）多次到达，
    // 命中已存在条目则原地合并（保留已读状态等最新值），避免列表出现重复项。
    const existingIdx = remoteNotifications.findIndex((n) => n.id === id)
    if (existingIdx !== -1) {
      const existing = remoteNotifications[existingIdx]
      remoteNotifications[existingIdx] = reactive({
        ...existing,
        ...entry,
        // 合并时保留已读：推送缺省 read 时不要把已读打回未读
        read: data.read != null ? Boolean(data.read) : existing.read,
      })
      return
    }
    remoteNotifications.unshift(entry)
    if (remoteNotifications.length > maxRemoteNotifications()) {
      remoteNotifications.length = maxRemoteNotifications()
    }
  }

  /** 清空远程通知列表 */
  function clearRemoteNotifications(): void {
    remoteNotifications.length = 0
  }

  /**
   * 按 id 摘掉一条远程通知（通知中心点 × 的唯一写入路径）。
   *
   * 返回被摘掉的条目与它的原始下标：调用方要调 DELETE，成功就不管，失败时用
   * :func:`restoreRemoteNotification` 插回原位。把「摘 / 插」放在 store 里而不是让
   * composable 直接 `splice` 数组，是为了让列表只被 store 改写 —— 否则任何新写入方
   * 都要再写一遍边界处理，迟早漏一处（重复通知、越界回滚都出过）。
   *
   * @param id 通知 ID
   * @returns 被摘掉的条目与原始下标；未命中返回 ``null``
   */
  function removeRemoteNotification(
    id: string | number,
  ): { entry: RemoteNotificationEntry; index: number } | null {
    const index = remoteNotifications.findIndex((notification) => notification.id === id)
    if (index < 0) return null
    const [entry] = remoteNotifications.splice(index, 1)
    return { entry, index }
  }

  /**
   * 把 :func:`removeRemoteNotification` 摘掉的条目插回原下标（失败的乐观回滚）。
   *
   * @param entry 被摘掉的条目
   * @param index 原始下标；越界时追加到末尾（期间可能已清空/截断列表）
   */
  function restoreRemoteNotification(entry: RemoteNotificationEntry, index: number): void {
    // 期间已被重新推送回来：不要再插一条，保留先到的那份即可。
    if (remoteNotifications.some((notification) => notification.id === entry.id)) return
    remoteNotifications.splice(Math.min(Math.max(0, index), remoteNotifications.length), 0, entry)
  }

  /**
   * 订阅实体状态变化（组件 mounted 时调用，unmounted 时调用返回的退订函数）。
   * 上限保护：
   * - 达上限时先 reloadFrontendConfig 热重载（5s 节流），重新读取 maxListeners
   * - 仍超限时返回空操作函数并打印警告（30s 节流），提示用户提高 maxListeners 或检查未退订监听器
   * @param fn 状态变更处理函数
   * @param options 注册选项（如按 entity_id 索引）
   * @returns 退订函数
   */
  function onStateChanged(
    fn: EntityStateListenerFn,
    options: RegisterStateListenerOptions = {},
  ): () => void {
    if (typeof fn !== 'function') return () => {}
    const count = getStateListenerCount()
    let limit = maxListeners()
    if (count >= limit) {
      const now = Date.now()
      if (now - listenerLimitConfigSyncAt > 5000) {
        listenerLimitConfigSyncAt = now
        reloadFrontendConfig().catch((err) => logger.debug('刷新前端配置失败', err))
      }
      limit = maxListeners()
    }
    if (count >= limit) {
      const now = Date.now()
      if (now - listenerLimitWarnAt > 30_000) {
        listenerLimitWarnAt = now
        const stats = getStateListenerStats()
        deps.logger.warn(
          `[entities] 状态监听器已达上限 ${count}/${limit}(全局 ${stats.global} · 索引 ${stats.indexed}).` +
            '若已在高级参数提高 maxListeners,请保存后刷新页面;并确保组件 unmounted 时 unsubscribe().',
        )
      }
      return () => {}
    }
    const unsub = registerStateListener(fn, options)
    deps.perfStats.listenerCount = getStateListenerCount()
    return () => {
      unsub()
      deps.perfStats.listenerCount = getStateListenerCount()
    }
  }

  return {
    remoteNotifications,
    emitStateListeners,
    onStateChanged,
    addRemoteNotification,
    removeRemoteNotification,
    restoreRemoteNotification,
    clearRemoteNotifications,
  }
}
