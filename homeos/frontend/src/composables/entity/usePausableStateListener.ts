/**
 * 可暂停实体状态监听器组合式函数
 *
 * 职责：在页面隐藏（document.hidden）或 keep-alive 组件停用时自动暂停实体状态变更回调，
 *      页面恢复时自动恢复，减少后台期间大量批更新的扇出开销；支持按 entityIds / domains
 *      精确过滤监听范围，避免全局监听引发不必要的重渲染。
 * 入参：
 *   - callback：实体状态变更回调（接收 entity_id / new_state / old_state payload）
 *   - options.filter：自定义过滤器函数；options.entityIds：指定监听实体 ID；options.domains：指定监听域
 * 返回：手动取消订阅函数
 * 内部副作用：注册 visibilitychange 事件监听；卸载自动清理。
 * 性能：实体/域列表变更以 join 指纹替代 deep watch，避免大型数组逐元素比较。
 */
import {
  onMounted,
  onUnmounted,
  onActivated,
  onDeactivated,
  watch,
  unref,
  type MaybeRefOrGetter,
} from 'vue'
import { getEntityDomain } from '@homeos/shared'
import { useEntitiesStore } from '@/stores/entities.store'
import type { EntityStateListenerPayload } from '@/types/entity-store'
/**
 * 在页面隐藏或 keep-alive 停用时暂停实体状态监听，减少批更新扇出。
 * @param {(payload: { entity_id: string, new_state: object | null, old_state: object | null }) => void} callback
 * @param {{
 *   filter?: (payload: { entity_id: string }) => boolean
 *   entityIds?: import('vue').MaybeRefOrGetter<string | string[] | undefined | null>
 *   domains?: import('vue').MaybeRefOrGetter<string[] | undefined | null>
 *   onResume?: () => void
 * }} [options] onResume：全局监听（未传 entityIds/domains）时恢复后的补同步钩子
 * @returns {() => void} 手动取消订阅
 */
export function usePausableStateListener(
  callback: {
    bivarianceHack(payload: EntityStateListenerPayload): void
  }['bivarianceHack'],
  options: {
    filter?: (payload: EntityStateListenerPayload) => boolean
    entityIds?: MaybeRefOrGetter<string | string[] | undefined | null>
    domains?: MaybeRefOrGetter<string[] | undefined | null>
    /** 全局监听场景下恢复后的补同步钩子（范围已知时框架会按缓存现值自动补发） */
    onResume?: () => void
  } = {},
) {
  const entitiesStore = useEntitiesStore()
  let paused = false
  let unsub = () => {}
  const { filter, entityIds: entityIdsRef, domains: domainsRef } = options
  /** 未传 entityIds/domains 选项时为 intentional 全局监听 */
  const scoped =
    Object.prototype.hasOwnProperty.call(options, 'entityIds') ||
    Object.prototype.hasOwnProperty.call(options, 'domains')
  const wrapped = (payload: EntityStateListenerPayload) => {
    if (paused) return
    if (filter && !filter(payload)) return
    callback(payload)
  }
  function resolveEntityIds() {
    if (entityIdsRef == null) return undefined
    const raw = typeof entityIdsRef === 'function' ? entityIdsRef() : unref(entityIdsRef)
    if (raw == null || raw === '') return undefined
    return raw
  }
  function resolveDomains() {
    if (domainsRef == null) return undefined
    const raw = typeof domainsRef === 'function' ? domainsRef() : unref(domainsRef)
    if (!raw?.length) return undefined
    return raw
  }
  function resubscribe() {
    unsub()
    if (!scoped) {
      unsub = entitiesStore.onStateChanged(wrapped, {})
      return
    }
    const domains = resolveDomains()
    const ids = resolveEntityIds()
    if (
      (ids == null || ids === '' || (Array.isArray(ids) && ids.length === 0)) &&
      !domains?.length
    ) {
      unsub = () => {}
      return
    }
    unsub = entitiesStore.onStateChanged(wrapped, {
      entityIds: ids,
      domains,
    })
  }
  resubscribe()
  // 订阅源用轻量指纹替代 deep watch：实体/域列表常为大型数组，
  // deep 比较逐元素遍历开销大；join 指纹在内容变化时才产生新字符串，触发重订阅语义等价。
  if (entityIdsRef != null) {
    watch(
      () => {
        const ids = resolveEntityIds()
        if (Array.isArray(ids)) return ids.join('\u0000')
        return ids ?? null
      },
      resubscribe,
    )
  }
  if (domainsRef != null) {
    watch(
      () => {
        const domains = resolveDomains()
        if (Array.isArray(domains)) return domains.join('\u0000')
        return domains ?? null
      },
      resubscribe,
    )
  }
  const refreshPaused = () => {
    paused = typeof document !== 'undefined' && document.hidden
  }

  /** 按缓存现值给订阅者补一次回调（不依赖网络，也不会放大成全局扇出） */
  function emitCurrentState(entityId: string) {
    const state = entitiesStore.getEntity(entityId)
    if (!state) return
    wrapped({ entity_id: entityId, new_state: state, old_state: state })
  }

  /**
   * 恢复时补同步：暂停期间被丢弃的推送不会重放，若只等下一次推送，
   * 常亮/壁挂屏在恢复后可能长期停留在暂停前的旧值（冷门实体可能数十分钟才有一次推送）。
   */
  function resyncScope() {
    const ids = resolveEntityIds()
    if (Array.isArray(ids)) {
      for (const id of ids) emitCurrentState(id)
      return
    }
    if (typeof ids === 'string' && ids) {
      emitCurrentState(ids)
      return
    }
    const domains = resolveDomains()
    if (domains?.length) {
      const wanted = new Set(domains)
      // 仅遍历当前订阅的域，避免全局扇出
      for (const id of Object.keys(entitiesStore.entities)) {
        if (wanted.has(getEntityDomain(id))) emitCurrentState(id)
      }
      return
    }
    // 全局监听（无范围）：实体量级上千，逐条补发代价过高，交由调用方自定义钩子
    options.onResume?.()
  }

  /** 退出暂停并补一次同步 */
  function resumeListener() {
    if (!paused) return
    paused = false
    resyncScope()
  }

  const onVisibility = () => {
    if (typeof document !== 'undefined' && document.hidden) {
      paused = true
      return
    }
    resumeListener()
  }
  onMounted(refreshPaused)
  onActivated(resumeListener)
  onDeactivated(() => {
    paused = true
  })
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility)
  }
  onUnmounted(() => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibility)
    }
    unsub()
  })
  return unsub
}
