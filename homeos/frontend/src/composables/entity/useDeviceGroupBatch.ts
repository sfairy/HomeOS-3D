/**
 * @module useDeviceGroupBatch
 * @description DeviceGroupModal 批量执行与重试组合式函数。
 *
 * 职责：
 * - 对设备分组中的实体集合执行批量开/关、批量温控关机等操作。
 * - 记录最近一次批量调用的 payload，支持对失败项一键重试。
 * - climate 域走 set_hvac_mode(off)，其它域走 turn_on/turn_off。
 *
 * 依赖：
 * - vue：ref/computed 响应式状态。
 * - @/utils/device/device-group-battery.util：DeviceGroupEntitiesStoreLike 类型。
 * - @/types/entity-store：HaEntityState 实体状态类型。
 */
import { ref, computed, type Ref } from 'vue'
import type { DeviceGroupEntitiesStoreLike } from '@/utils/device/group-battery.util'
import type { HaEntityState } from '@/types/entity-store'
import { getApiErrorMessage } from '@/utils/core/error-message'

/** 批量执行结果项：success 标识单条是否成功，entity_id 用于重试定位。 */
interface BatchExecResultItem {
  entity_id: string
  success: boolean
  error?: string
}

/** 批量执行结果汇总：供 DeviceGroupActions 展示 executed/total/service 与失败明细。 */
interface BatchExecResult {
  /** 是否全部成功 */
  success: boolean
  /** 成功条数 */
  executed: number
  /** 总条数 */
  total: number
  /** 本次批量调用的服务名（展示用） */
  service: string
  /** 逐条执行结果 */
  results: BatchExecResultItem[]
}

/** 批量调用 payload：记录 domain/service/serviceData 供重试复用。 */
interface BatchPayload {
  domain: string
  service: string
  serviceData?: Record<string, unknown>
}

/**
 * DeviceGroupModal 批量执行与重试。
 *
 * @param entityIds 当前分组涉及的实体 ID 列表 ref。
 * @param entitiesStore 实体 store（需提供 callService 与 entities 映射）。
 * @returns 批量执行状态、失败项计算属性、批量开关与重试方法。
 */
export function useDeviceGroupBatch(
  entityIds: Ref<string[]>,
  entitiesStore: DeviceGroupEntitiesStoreLike & {
    callService: NonNullable<DeviceGroupEntitiesStoreLike['callService']>
    entities: Record<string, HaEntityState | undefined>
  },
) {
  /** 是否正在执行批量操作（用于禁用按钮与 loading 态）。 */
  const batchExecuting = ref(false)
  /** 最近一次批量执行的结果（含每条 success/entity_id）。 */
  const batchExecResult = ref<BatchExecResult | null>(null)
  /** 最近一次批量调用的 payload，供 retryFailed 复用。 */
  const lastBatchPayload = ref<BatchPayload | null>(null)
  /** 失败项列表：从 batchExecResult 中过滤出 success 为 false 的条目。 */
  const failedExecItems = computed(() =>
    (batchExecResult.value?.results || []).filter((r) => !r.success),
  )

  /**
   * 执行一组批量调用并把完整结果写入 batchExecResult（成功数/总数/服务名/逐条 success+error）。
   * 所有批量入口统一走此函数，保证 DeviceGroupActions 能拿到 executed/total/service 字段。
   * @param service 服务名（展示用）
   * @param calls 每条调用（含 entity_id 与延迟执行的闭包）
   */
  async function runBatch(
    service: string,
    calls: Array<{ entity_id: string; call: () => Promise<unknown> }>,
  ): Promise<void> {
    const settled = await Promise.allSettled(calls.map((c) => c.call()))
    const results: BatchExecResultItem[] = settled.map((r, i) => {
      if (r.status === 'fulfilled') {
        return { entity_id: calls[i].entity_id, success: true }
      }
      const reason = r.reason
      return {
        entity_id: calls[i].entity_id,
        success: false,
        error: getApiErrorMessage(reason, reason instanceof Error ? reason.message : '失败'),
      }
    })
    const executed = results.filter((r) => r.success).length
    batchExecResult.value = {
      success: executed === results.length,
      executed,
      total: results.length,
      service,
      results,
    }
  }

  /**
   * 取当前分组中处于开机状态的 climate 实体 ID。
   * state 为空或 'off' 视为非活动，不参与批量关机。
   * @returns 活动的 climate entity_id 列表。
   */
  function climateActiveIds() {
    return entityIds.value.filter((eid) => {
      const state = entitiesStore.entities[eid]?.state
      return state && state !== 'off'
    })
  }

  /**
   * 取当前分组中处于关机状态的 climate 实体 ID。
   * state 为空或 'off' 视为可开机目标；unavailable/unknown 不参与批量开机。
   */
  function climateOffIds() {
    return entityIds.value.filter((eid) => {
      const state = String(entitiesStore.entities[eid]?.state || '').toLowerCase()
      return !state || state === 'off'
    })
  }

  /**
   * 为 climate 实体选择开机 HVAC 模式：优先 cool / heat / heat_cool / auto，
   * 再退到 hvac_modes 中第一个非 off 模式。
   */
  function resolveClimateOnMode(eid: string): string | null {
    const attrs = entitiesStore.entities[eid]?.attributes as
      | { hvac_modes?: unknown }
      | undefined
    const modes = Array.isArray(attrs?.hvac_modes)
      ? attrs.hvac_modes.map((m) => String(m).toLowerCase())
      : []
    const preferred = ['cool', 'heat', 'heat_cool', 'auto', 'fan_only', 'dry']
    for (const mode of preferred) {
      if (modes.includes(mode)) return mode
    }
    const fallback = modes.find((m) => m && m !== 'off')
    return fallback || null
  }

  /**
   * 批量关闭分组内所有活动 climate 实体。
   * 通过 set_hvac_mode(off) 实现，记录 payload 供重试。
   * 无活动实体时直接返回。
   */
  async function batchClimateOff() {
    const activeIds = climateActiveIds()
    if (activeIds.length === 0) return
    const serviceData: Record<string, unknown> = { hvac_mode: 'off' }
    batchExecuting.value = true
    lastBatchPayload.value = { domain: 'climate', service: 'set_hvac_mode', serviceData }
    try {
      await runBatch(
        'set_hvac_mode',
        activeIds.map((eid) => ({
          entity_id: eid,
          call: () => entitiesStore.callService('climate', 'set_hvac_mode', eid, serviceData, false),
        })),
      )
    } finally {
      batchExecuting.value = false
    }
  }

  /**
   * 批量开启分组内关机 climate：按实体能力 set_hvac_mode；
   * 若无可用模式列表则回退 turn_on。
   */
  async function batchClimateOn() {
    const offIds = climateOffIds()
    if (offIds.length === 0) return
    batchExecuting.value = true
    lastBatchPayload.value = {
      domain: 'climate',
      service: 'set_hvac_mode',
      serviceData: { hvac_mode: 'cool' },
    }
    try {
      await runBatch(
        'set_hvac_mode',
        offIds.map((eid) => ({
          entity_id: eid,
          call: () => {
            const mode = resolveClimateOnMode(eid)
            if (mode) {
              return entitiesStore.callService('climate', 'set_hvac_mode', eid, { hvac_mode: mode }, false)
            }
            return entitiesStore.callService('climate', 'turn_on', eid, {}, false)
          },
        })),
      )
    } finally {
      batchExecuting.value = false
    }
  }

  /**
   * 批量开关：根据 domain 选择服务路径。
   * climate 域开/关分别走 batchClimateOn / batchClimateOff；
   * 其它域走 turn_on/turn_off。
   *
   * @param turnOn true 开机、false 关机。
   * @param inferDomain 返回当前分组 domain 的函数。
   */
  async function batchToggle(turnOn: boolean, inferDomain: () => string) {
    const domain = inferDomain()
    if (domain === 'climate') {
      if (turnOn) await batchClimateOn()
      else await batchClimateOff()
      return
    }
    const service = turnOn ? 'turn_on' : 'turn_off'
    batchExecuting.value = true
    lastBatchPayload.value = { domain, service }
    try {
      await runBatch(
        service,
        entityIds.value.map((eid) => ({
          entity_id: eid,
          call: () => entitiesStore.callService(domain, service, eid, {}, false),
        })),
      )
    } finally {
      batchExecuting.value = false
    }
  }

  /**
   * 重试最近一次批量调用中失败的实体。
   * 从 failedExecItems 提取 entity_id，复用 lastBatchPayload 重新调用。
   * 无 payload 或无失败项时直接返回。
   */
  async function retryFailed() {
    if (!lastBatchPayload.value || failedExecItems.value.length === 0) return
    const ids = failedExecItems.value
      .map((r) => r.entity_id || '')
      .filter((id) => id.includes('.'))
    if (ids.length === 0) return
    const { domain, service, serviceData } = lastBatchPayload.value
    batchExecuting.value = true
    try {
      await runBatch(
        service,
        ids.map((eid) => ({
          entity_id: eid,
          call: () => {
            // climate 开机重试：按实体能力重新解析模式（含 turn_on 回退），不能用固定的 'cool'
            if (
              domain === 'climate' &&
              service === 'set_hvac_mode' &&
              serviceData?.hvac_mode !== 'off'
            ) {
              const mode = resolveClimateOnMode(eid)
              if (mode) {
                return entitiesStore.callService(
                  'climate',
                  'set_hvac_mode',
                  eid,
                  { hvac_mode: mode },
                  false,
                )
              }
              return entitiesStore.callService('climate', 'turn_on', eid, {}, false)
            }
            return entitiesStore.callService(domain, service, eid, serviceData ?? {}, false)
          },
        })),
      )
    } finally {
      batchExecuting.value = false
    }
  }
  return {
    batchExecuting,
    batchExecResult,
    lastBatchPayload,
    failedExecItems,
    batchToggle,
    retryFailed,
  }
}