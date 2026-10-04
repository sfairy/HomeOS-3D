import { logger } from '@/utils/core/logger'
/**
 * @file entity-store-subscription.util.ts
 * @module frontend/src/stores
 * 实体 store 状态订阅与远程通知（从 entity-store-support.ts 拆回）。
 *
 * 职责：
 * - onStateChanged：组件订阅实体状态变化（基于 registerStateListener 的全局监听器表）
 *   含上限保护（达上限时尝试热重载配置并提示，30s 节流警告）
 * - emitStateListeners：状态变更时派发到所有匹配的监听器
 * - addRemoteNotification：接收后端推送的远程通知（按 id 去重 + 原地合并保留已读）
 * - clearRemoteNotifications：清空通知列表
 *
 * 关键依赖：
 * - @/utils/entity/state-listener：监听器注册 / 派发 / 计数 / 统计
 * - @/utils/config/frontend-config：maxStateListeners / maxRemoteNotifications / 热重载
 * - @/utils/format/locale-format.util：时间格式化
 *
 * 实现说明：
 * - 同一通知可能经 Socket 即时推送与 REST 重新拉取（如重连刷新）多次到达，按 id 去重避免重复
 * - 监听器上限保护：达上限时先 reloadFrontendConfig 重读（5s 节流），再判定，仍超限则警告（30s 节流）
 */
import { shallowReactive } from 'vue'
import type {
  EntityStateListenerFn,
  EntitySubscriptionDeps,
  HaEntityState,
  RegisterStateListenerOptions,
  RemoteNotificationEntry,
  RemoteNotificationPayload,
} from '@/types/entity-store'
import {
  getFrontendConfig,
  getMaxStateListeners,
  reloadFrontendConfig,
} from '@/utils/config/frontend-config'
import {
  dispatchStateListener,
  getStateListenerCount,
  getStateListenerStats,
  registerStateListener,
} from '@/utils/entity/state-listener'
import { formatLocaleTime } from '@/utils/format/locale-format.util'

// ── entity-store-subscription.util ──
/**
 * 实体 store 状态订阅与远程通知（从 entities.store 抽离）
 * @param deps 依赖注入对象（logger / perfStats）
 * @returns remoteNotifications / emitStateListeners / onStateChanged / addRemoteNotification / clearRemoteNotifications
 */
export function createEntitySubscriptionHelpers(deps: EntitySubscriptionDeps) {
  // 远程通知列表（shallowReactive，按 id 去重后 unshift）
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
    const entry: RemoteNotificationEntry = {
      id,
      level: data.level || 'info',
      message: data.message || '',
      source: data.source || 'system',
      time: formatLocaleTime(createdAt, { hour: '2-digit', minute: '2-digit' }),
      createdAt,
      read: data.read || false,
      deliveredAt: data.deliveredAt ? String(data.deliveredAt) : undefined,
    }
    // 按 id 去重：同一通知可能经 Socket 即时推送与 REST 重新拉取（如重连刷新）多次到达，
    // 命中已存在条目则原地合并（保留已读状态等最新值），避免列表出现重复项。
    const existingIdx = remoteNotifications.findIndex((n) => n.id === id)
    if (existingIdx !== -1) {
      const existing = remoteNotifications[existingIdx]
      remoteNotifications[existingIdx] = {
        ...existing,
        ...entry,
        // 合并时保留已读：推送缺省 read 时不要把已读打回未读
        read: data.read != null ? Boolean(data.read) : existing.read,
      }
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
    clearRemoteNotifications,
  }
}
