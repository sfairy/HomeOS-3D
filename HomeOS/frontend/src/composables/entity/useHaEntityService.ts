/**
 * HA 实体服务调用与离线控制守卫组合式函数模块。
 *
 * 职责：
 * - useHaControlGuard：在 HA 离线时拦截阀/锁/报警等高风险 service 调用（UI 层预检）；
 * - useHaEntityService：封装 entities store 的 callService，提供统一的错误日志输出与守卫能力。
 *
 * 依赖：entities store、getEntityDomain、logger、ha-url 离线拦截工具。
 */
import { useEntitiesStore } from '@/stores/entities.store'
import { getEntityDomain } from '@homeos/shared'
import { logger } from '@/utils/core/logger'
import {
  blockDangerousHaServiceWhenOffline,
  HA_OFFLINE_DANGEROUS_CONTROL_MSG,
} from '@/utils/ha/url'

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
    if (
      blockDangerousHaServiceWhenOffline(
        entitiesStore.connected,
        getEntityDomain(entityId),
        service,
        entityId,
      )
    ) {
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
 * @returns {{ callService, entitiesStore, canControlEntity, guardServiceCall }}
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
  return { callService, entitiesStore: es, canControlEntity, guardServiceCall }
}