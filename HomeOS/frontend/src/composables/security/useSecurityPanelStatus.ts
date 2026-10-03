/**
 * @file useSecurityPanelStatus.ts
 * @module composables/security
 * @description 安防面板状态共享 composable。
 *   多个 SecurityPanelWidget / SecurityView 实例共用同一份轮询，避免重复请求。
 *   - 模块级单例：currentMode/zones/ready/error 跨组件共享
 *   - 订阅计数：仅在有订阅者且页面可见时轮询，节省网络与电量
 *   - WebSocket 推送：通过 store-bridge 接收模式变更并即时应用
 *   - sharedFetch 去重：同一时间窗内的多次请求合并为一次
 * @dependencies vue, @/services/api/security, @/stores/auth.store, @/utils/bridge/store-bridge, @/utils/core/poll-scheduler
 */
import { ref, shallowRef, watch, onMounted, onUnmounted } from 'vue'
import { fetchSecurityPanelStatus } from '@/services/api/security'
import { useAuthStore } from '@/stores/auth.store'
import {
  registerSecurityPanelRefreshHandler,
  registerSecurityPanelModeHandler,
  type SecurityModeSocketPayload,
} from '@/utils/bridge/store-bridge'
import { sharedFetch, schedulePoll } from '@/utils/core/poll-scheduler'

/** 安防面板区域结构 */
type SecurityPanelZone = {
  /** 区域 ID */
  id: string
  /** 区域名称 */
  name: string
  /** 区域传感器 ID 列表 */
  sensors?: string[]
  /** 是否已布防 */
  armed?: boolean
  /** 区域类型（all/perimeter/room 等） */
  zoneType?: string
  /** 关联房间 ID */
  roomId?: string
}

// 模块级共享状态：跨组件复用同一份轮询结果
const currentMode = ref('disarmed')
// 使用 shallowRef 避免 zones 数组深层响应式带来的性能开销
const zones = shallowRef<SecurityPanelZone[]>([])
const loading = ref(true)
const ready = ref(false)
const error = ref<string>('')
// 订阅者计数，控制轮询启停
let subscriberCount = 0
// 轮询任务取消函数（注册到全局调度器，页面隐藏时由调度器统一暂停）
let pollCancel: (() => void) | null = null
// 轮询间隔：10 秒
const POLL_MS = 10000

/** 有订阅者（浮动图层 / 安防页）且页面可见时轮询 */
function shouldPoll() {
  // 无订阅者时停止轮询，节省资源
  if (subscriberCount <= 0) return false
  // 页面隐藏时停止轮询，避免后台浪费
  if (typeof document !== 'undefined' && document.hidden) return false
  return true
}

/**
 * 拉取最新面板状态（带去重与认证校验）
 * @sideEffects 更新 currentMode/zones/ready/error/loading
 * @exceptions 404 时静默清空 error；其他错误写入 error 文案
 */
async function refresh(force = false) {
  const authStore = useAuthStore()
  // 未认证时直接结束，不发请求
  if (!authStore.isAuthenticated) {
    loading.value = false
    return
  }
  if (!force && !shouldPoll()) return
  try {
    // sharedFetch 在 POLL_MS 窗口内合并重复请求
    await sharedFetch(
      'security:panel-status',
      async () => {
        const { data } = await fetchSecurityPanelStatus()
        currentMode.value = data.mode || 'disarmed'
        zones.value = data.zones || []
        ready.value = true
        error.value = ''
        return data
      },
      POLL_MS,
    )
  } catch (e) {
    const status = (e as { response?: { status?: number } })?.response?.status
    if (status === 404) {
      // 404 表示后端未启用安防面板，静默处理
      ready.value = false
      error.value = ''
    } else {
      ready.value = false
      error.value = '安防面板状态不可用，请稍后重试'
    }
  } finally {
    loading.value = false
  }
}

/**
 * 应用 WebSocket 推送的安防模式变更
 * @param data 模式变更 payload
 * @sideEffects 更新 currentMode/zones；zones 为空时触发 refresh
 */
function applyModeFromSocket(data: SecurityModeSocketPayload) {
  if (data?.mode) currentMode.value = data.mode
  const list = zones.value
  // zones 为空时无法增量更新，直接刷新
  if (!list.length) {
    void refresh(true)
    return
  }
  // 撤防：所有区域强制 unarmed
  if (data.mode === 'disarmed') {
    zones.value = list.map((z) => ({ ...z, armed: false }))
    return
  }
  // 带区域列表：按 Set 增量更新 armed 状态
  if (Array.isArray(data.zones)) {
    const armedSet = new Set(data.zones)
    zones.value = list.map((z) => ({ ...z, armed: armedSet.has(z.id) }))
    return
  }
  // 既非撤防也无区域列表，回退到全量刷新
  void refresh(true)
}

// 注册刷新与模式变更处理器（模块级一次性注册）
registerSecurityPanelRefreshHandler(() => {
  void refresh()
})
registerSecurityPanelModeHandler(applyModeFromSocket)

/** 启动轮询：已注册时跳过 */
function startPolling() {
  if (!shouldPoll()) return
  // 避免重复注册轮询任务
  if (pollCancel) return
  void refresh()
  // 经全局调度器轮询：页面隐藏时自动暂停，恢复可见时立即刷新
  pollCancel = schedulePoll(
    'security:panel-status-poll',
    () => {
      void refresh()
    },
    POLL_MS,
  )
}

/** 停止轮询并取消调度任务 */
function stopPolling() {
  if (pollCancel) {
    pollCancel()
    pollCancel = null
  }
}

/** 根据订阅者数量同步轮询状态 */
function syncPollingForSubscribers() {
  // 无订阅者时停止
  if (subscriberCount <= 0) {
    stopPolling()
    return
  }
  // 有订阅者时按可见性决定启停
  if (shouldPoll()) startPolling()
  else stopPolling()
}

/** 页面可见性变化回调 */
function onVisibilityChange() {
  syncPollingForSubscribers()
}

/**
 * 安防面板状态 composable
 * @returns 共享状态与方法
 *   - currentMode/zones/loading/ready/error: 响应式状态
 *   - refresh: 手动刷新
 *   - patchModeFromSocket: 应用 WebSocket 模式变更
 */
export function useSecurityPanelStatus() {
  const authStore = useAuthStore()
  // 挂载时增加订阅者，绑定可见性监听
  onMounted(() => {
    subscriberCount++
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange)
    }
    syncPollingForSubscribers()
    // 已有缓存时立即结束 loading，避免闪烁
    if (ready.value) {
      loading.value = false
    }
  })
  // 卸载时减少订阅者，最后一个订阅者负责解绑可见性监听
  onUnmounted(() => {
    subscriberCount--
    if (subscriberCount === 0 && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
    syncPollingForSubscribers()
  })
  // 登录态恢复后，若有订阅者则立即刷新一次
  watch(
    () => authStore.isAuthenticated,
    (ok: boolean) => {
      if (ok && subscriberCount > 0 && shouldPoll()) refresh()
    },
  )
  return {
    currentMode,
    zones,
    loading,
    ready,
    error,
    refresh,
    patchModeFromSocket: applyModeFromSocket,
  }
}