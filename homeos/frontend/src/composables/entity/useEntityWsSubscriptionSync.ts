/**
 * 路由/布局变更时同步 WebSocket domain 订阅；重连后补发 pinned（生产环境关键）
 *
 * 职责：
 * - 监听路由 path、布局配置与公开配置变化，重新解析并下发 WebSocket 订阅域与 pinned 实体；
 * - 使用浅指纹 + debounce 避免编辑布局时 deep watch 抖动频繁刷 update_subscription；
 * - 监听 wsTransportEpoch 与 connected，在 socket 重连/恢复时强制补发一次订阅。
 *
 * 依赖：vue watch/onUnmounted、vue-router useRoute、ui store、entities store、
 * entity-ws 工具（域解析/pinned 收集/布局订阅 key）。
 */
import { watch, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useLayoutStore } from '@/stores/layout.store'
import { useEntitiesStore } from '@/stores/entities.store'
import {
  resolveSubscribeDomains,
  setActiveSubscribeDomains,
  getActiveSubscribeDomains,
  collectWsPinnedEntityIds,
  buildLayoutSubscriptionKey,
} from '@/utils/entity/ws-subscription'
import { configEpoch } from '@/utils/config/frontend-config'

/** 同步防抖间隔（毫秒）：略低于旧 120ms，加快换页/弹窗后的域与 pinned 生效 */
const SYNC_DEBOUNCE_MS = 50

/**
 * WebSocket 订阅同步组合式函数。
 *
 * 调用场景：在主视图根组件 setup 中调用一次，托管全局 WS 订阅生命周期。
 * 返回 syncSubscription（手动强制同步）与 getActiveSubscribeDomains（查询当前激活域）。
 *
 * @returns {{ syncSubscription: () => void, getActiveSubscribeDomains: typeof getActiveSubscribeDomains }}
 */
export function useEntityWsSubscriptionSync() {
  const route = useRoute()
  const layoutStore = useLayoutStore()
  const entitiesStore = useEntitiesStore()

  /** 最近一次下发的订阅指纹（避免重复 emit） */
  let lastEmittedKey = ''
  /** debounce 计时器句柄 */
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  /** 收集当前布局下需要 pin 的实体 ID（如打开的弹窗实体） */
  function resolvePinnedEntityIds() {
    return collectWsPinnedEntityIds(layoutStore.layoutConfig, layoutStore.activeFloorplanPopupId)
  }

  /**
   * 执行一次订阅同步。
   *
   * @param force 是否强制下发（忽略指纹相同短路）
   */
  function syncSubscription(force = false) {
    const domains = resolveSubscribeDomains(route.path, layoutStore.layoutConfig)
    const pinnedEntityIds = resolvePinnedEntityIds()
    // 浅指纹：path + domains + pinned + 布局 key + 公开配置世代（人来亮屏钉选随配置生效）
    const key = JSON.stringify({
      path: route.path,
      domains,
      pinned: pinnedEntityIds,
      layout: buildLayoutSubscriptionKey(layoutStore.layoutConfig, layoutStore.activeFloorplanPopupId),
      cfg: configEpoch.value,
    })
    // 指纹一致且非强制：跳过，避免无谓 emit
    if (!force && key === lastEmittedKey) return
    lastEmittedKey = key
    setActiveSubscribeDomains(domains)
    const socket = entitiesStore.getSocket()
    // 仅在 socket 已连接时下发；未连接时由 connect 事件补发
    if (socket?.connected) {
      socket.emit('update_subscription', {
        subscribeDomains: domains,
        pinnedEntityIds,
      })
    }
  }

  /** 防抖版同步：合并短时间内的多次触发 */
  function scheduleSync() {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      syncSubscription()
    }, SYNC_DEBOUNCE_MS)
  }

  // 浅指纹 + debounce，避免编辑布局时 deep watch 抖动刷 update_subscription
  watch(
    () =>
      buildLayoutSubscriptionKey(layoutStore.layoutConfig, layoutStore.activeFloorplanPopupId) +
      '|' +
      route.path +
      '|' +
      configEpoch.value,
    scheduleSync,
  )

  /** 当前 socket connect 事件解绑函数 */
  let detachConnect: (() => void) | null = null

  /**
   * 绑定 socket connect 事件，重连后强制补发订阅。
   * @param onConnect connect 回调
   * @returns 解绑函数（socket 不存在时返回 null）
   */
  function bindSocketSubscriptionSync(onConnect: () => void): (() => void) | null {
    const socket = entitiesStore.getSocket()
    if (!socket) return null
    socket.on('connect', onConnect)
    return () => socket.off('connect', onConnect)
  }

  // wsTransportEpoch 变化表示 socket 实例重建：重新绑定 connect 事件并立即强制同步
  watch(
    () => entitiesStore.wsTransportEpoch,
    () => {
      detachConnect?.()
      detachConnect = bindSocketSubscriptionSync(() => syncSubscription(true))
      const socket = entitiesStore.getSocket()
      if (socket?.connected) syncSubscription(true)
    },
    { immediate: true },
  )

  // 连接恢复时强制同步一次（覆盖 connect 事件未触发的边界场景）
  watch(
    () => entitiesStore.connected,
    (connected) => {
      if (connected) syncSubscription(true)
    },
  )

  onUnmounted(() => {
    if (debounceTimer) clearTimeout(debounceTimer)
    detachConnect?.()
  })

  return {
    syncSubscription: () => syncSubscription(true),
    getActiveSubscribeDomains,
  }
}