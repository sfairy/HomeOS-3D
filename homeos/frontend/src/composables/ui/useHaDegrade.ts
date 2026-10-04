/**
 * @file useHaDegrade.ts
 * @module composables/ui/useHaDegrade
 * @description HA 连接降级 composable，统一封装降级判定与重连流程。
 *   - connectionDegraded：默认按「断连 / 重连中 / 实体数据过期」判定，支持传入自定义降级状态（ref/computed/getter）
 *   - retryHaConnection：先断开再重连，成功/失败 Toast 通知（成功文案可参数化，失败前可回调记录日志）
 *   - retrying：本地重连请求进行中标记（从发起重连到连接建立/失败）
 *   - 降级文案各视图差异较大，由调用方自行计算后传入 HaDegradeBanner 展示
 * @dependencies vue, @/stores/entities.store, @/stores/chrome.store
 */
import { computed, ref, toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useChromeStore } from '@/stores/chrome.store'

/** useHaDegrade 配置项 */
export interface UseHaDegradeOptions {
  /** 自定义降级判定；缺省时按「断连 / 重连中 / 实体数据过期」判定 */
  degraded?: MaybeRefOrGetter<boolean>
  /** 重连发起后的通知文案 */
  reconnectingMessage?: string
  /** 重连失败回调（如记录日志），在错误通知前调用 */
  onRetryFail?: (error: unknown) => void
}

/** 默认重连发起后的通知文案 */
const DEFAULT_RECONNECTING_MESSAGE = '正在重新连接 Home Assistant…'
/** 重连失败的通知文案 */
const RETRY_FAILED_MESSAGE = '重连失败，请检查 HA 地址与网络'

/**
 * HA 连接降级 composable
 * @param options 配置项：自定义降级判定 / 重连通知文案 / 失败回调
 * @returns connectionDegraded 降级判定、retryHaConnection 重连方法、retrying 重连进行中标记
 */
export function useHaDegrade(options: UseHaDegradeOptions = {}) {
  const entitiesStore = useEntitiesStore()
  const chrome = useChromeStore()

  // 本地重连请求进行中标记：从发起重连到连接建立/失败
  const retrying = ref(false)

  // 默认降级判定：断连 / 重连中 / 实体数据过期
  const defaultDegraded = computed(
    () =>
      !entitiesStore.connected ||
      entitiesStore.reconnecting ||
      entitiesStore.entitiesStale,
  )

  // 降级判定：优先使用调用方传入的自定义状态
  const connectionDegraded = computed(() =>
    options.degraded ? toValue(options.degraded) : defaultDegraded.value,
  )

  /**
   * 重试 HA 连接：先断开再重连
   * @sideEffects 成功时 Toast 提示重连中；失败时回调 onRetryFail 并 Toast 错误
   */
  async function retryHaConnection() {
    retrying.value = true
    try {
      entitiesStore.disconnect()
      await entitiesStore.connect()
      chrome.notify(options.reconnectingMessage ?? DEFAULT_RECONNECTING_MESSAGE, 'info')
    } catch (e) {
      options.onRetryFail?.(e)
      chrome.notify(RETRY_FAILED_MESSAGE, 'error')
    } finally {
      retrying.value = false
    }
  }

  return { connectionDegraded, retryHaConnection, retrying }
}
