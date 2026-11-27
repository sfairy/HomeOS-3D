import { computed, ref, toValue, type MaybeRefOrGetter } from 'vue'
import { useEntitiesStore } from '@/domain/entity/store/entities.store'
import { useChromeStore } from '@/kernel/ui/chrome/chrome-store'
import { getEntityDomain } from '@homeos/shared'
import { logger } from '@/kernel/utils/core/logger'
import { blockDangerousHaServiceWhenOffline, HA_OFFLINE_DANGEROUS_CONTROL_MSG } from '@/kernel/utils/ha/url'

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

/** useHaDegrade 配置项 */
interface UseHaDegradeOptions {
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
    () => !entitiesStore.connected || entitiesStore.reconnecting || entitiesStore.entitiesStale,
  )

  // 降级判定：优先使用调用方传入的自定义状态
  const connectionDegraded = computed(() => (options.degraded ? toValue(options.degraded) : defaultDegraded.value))

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

/** HA 实体服务调用与离线控制守卫组合式函数模块。 */

/**
 * HA 离线时拦截阀/锁/报警等高风险 service 调用（UI 层预检，store.callService 亦有同逻辑）。
 *
 * 调用场景：弹窗/卡片按钮在调用 service 前先 canControlEntity 判断是否可执行，
 * 失败时可展示 blockedMessage 提示用户。
 *
 * @returns {{ canControlEntity, guardServiceCall, blockedMessage }}
 */
function useHaControlGuard() {
  const entitiesStore = useEntitiesStore()

  /**
   * 判断指定实体当前是否可被控制（HA 在线或 service 不在高风险列表）。
   * @param entityId 实体 ID
   * @param service 待执行的 service（默认 turn_on）
   * @returns 是否允许调用
   */
  function canControlEntity(entityId: string, service = 'turn_on') {
    if (blockDangerousHaServiceWhenOffline(entitiesStore.connected, getEntityDomain(entityId), service, entityId)) {
      return false
    }
    return true
  }

  /**
   * 守卫 service 调用（与 canControlEntity 等价，但以 domain/service 显式入参）。
   * @param domain HA domain（如 valve/lock/alarm_control_panel）
   * @param service HA service 名（如 open_valve/lock_arm等）
   * @param entityId 实体 ID
   * @returns 是否允许调用
   */
  function guardServiceCall(domain: string, service: string, entityId: string) {
    return !blockDangerousHaServiceWhenOffline(entitiesStore.connected, domain, service, entityId)
  }

  return { canControlEntity, guardServiceCall, blockedMessage: HA_OFFLINE_DANGEROUS_CONTROL_MSG }
}

/**
 * entities store HA service 调用的薄封装，提供统一的错误日志输出。
 *
 * 调用场景：弹窗/卡片组件控制实体时统一使用 callService，避免每个调用点重复 try/catch 与日志。
 *
 * @returns {{ callService, entitiesStore, canControlEntity, guardServiceCall, isCallPending }}
 */
export function useHaEntityService() {
  const es = useEntitiesStore()
  const { canControlEntity, guardServiceCall } = useHaControlGuard()
  /**
   * 调用 HA service，失败时记录错误日志并向上抛出。
   *
   * @param domain HA domain
   * @param service HA service 名
   * @param entityId 实体 ID
   * @param data service payload
   * @param logLabel 日志标签（缺省时使用 `${domain}.${service} 失败`）
   * @throws 原始错误向上抛出，由调用方决定 UI 反馈
   */
  async function callService(
    domain: string,
    service: string,
    entityId: string,
    data?: Record<string, unknown>,
    logLabel?: string,
  ) {
    try {
      await es.callService(domain, service, entityId, data, false)
    } catch (e) {
      logger.error(logLabel || `${domain}.${service} 失败`, e)
      throw e
    }
  }
  /**
   * 该实体是否有指令在途（供按钮 loading 态）。
   *
   * 卡片/弹窗据此禁用重复点击并显示进度；没有它时用户只能看到乐观态翻转，
   * 命令失败后才出现一次回滚 —— 中间过程完全不可见。
   */
  function isCallPending(entityId: string): boolean {
    return !!entityId && es.isEntityCallPending(entityId)
  }

  return { callService, entitiesStore: es, canControlEntity, guardServiceCall, isCallPending }
}
