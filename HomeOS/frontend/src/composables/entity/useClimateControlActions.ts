/**
 * @module useClimateControlActions
 * @description 温控类实体（climate 及地暖/新风等）统一服务调用封装。
 *
 * 职责：
 * - 一律经 useHaEntityService → entitiesStore.callService，复用 store 乐观更新与
 *   去重窗口，替代弹窗内直连 apiClient.post('/services/call') 的分叉路径。
 * - 温度按实体 min_temp/max_temp clamp；调用失败弹出统一错误提示。
 *
 * 依赖：
 * - @homeos/shared：getEntityDomain 解析 domain。
 * - @/composables/entity/useHaEntityService：统一服务调用入口。
 * - @/services/notify：notifyError 错误提示。
 * - @/types/entity-store：HaEntityState 实体状态类型。
 */
import { getEntityDomain } from '@homeos/shared'
import { useHaEntityService } from '@/composables/entity/useHaEntityService'
import { notifyError } from '@/services/notify'
import { clampNum } from '@/utils/core/misc.util'
import type { HaEntityState } from '@/types/entity-store'

/** 温控动作选项，label 用于错误提示与日志归因。 */
interface ClimateControlActionsOptions {
  label?: string
}

/** 温度上下界，min/max 用于 clamp 目标温度。 */
interface TempBounds {
  min: number
  max: number
}

/**
 * 温控类实体（climate 及地暖/新风等）的统一服务调用。
 *
 * 一律经 useHaEntityService → entitiesStore.callService，复用 store 乐观更新与
 * 去重窗口，替代弹窗内直连 apiClient.post('/services/call') 的分叉路径。
 * 温度按实体 min_temp/max_temp clamp；调用失败弹出统一错误提示。
 *
 * @param getEntity 返回当前实体的 getter（避免直接传 ref 以兼容多种来源）。
 * @param opts 选项对象，可指定 label 用于错误提示归因。
 * @returns 温度设置、开关、模式切换等一系列动作方法。
 */
export function useClimateControlActions(
  getEntity: () => HaEntityState | Record<string, unknown> | null | undefined,
  opts: ClimateControlActionsOptions = {},
) {
  const { callService } = useHaEntityService()
  /** 错误提示与日志归因用的标签，默认"温控控制"。 */
  const label = opts.label || '温控控制'

  /** 取当前实体，统一类型断言。 */
  function entity() {
    return getEntity() as HaEntityState | null | undefined
  }
  /** 取当前实体 entity_id，无实体时返回空串。 */
  function entityId() {
    return entity()?.entity_id || ''
  }
  /** 取当前实体 domain，缺省回退到 climate。 */
  function domain() {
    return getEntityDomain(entityId()) || 'climate'
  }
  /**
   * 取温度上下界：优先读 attributes.min_temp/max_temp，缺省分别回退 16/30。
   * @returns 包含 min/max 的界对象。
   */
  function bounds(): TempBounds {
    const a = entity()?.attributes || {}
    return {
      min: typeof a.min_temp === 'number' ? a.min_temp : 16,
      max: typeof a.max_temp === 'number' ? a.max_temp : 30,
    }
  }

  /**
   * 统一服务调用入口，失败时通过 notifyError 弹出错误提示。
   *
   * @param service HA 服务名（如 set_temperature、turn_on）。
   * @param data 服务数据负载。
   */
  async function call(service: string, data?: Record<string, unknown>) {
    const eid = entityId()
    if (!eid) return
    try {
      await callService(domain(), service, eid, data, label)
    } catch (err) {
      notifyError(err, label)
    }
  }

  /**
   * 设置目标温度：先 clamp 到 [min, max]，若实体处于 off 状态先调用 turn_on。
   *
   * @param val 期望目标温度。
   */
  async function setTargetTemp(val: number) {
    const { min, max } = bounds()
    const clamped = clampNum(val, min, max)
    // 关机状态下先开机，否则部分设备会忽略温度设置
    if (entity()?.state === 'off') await call('turn_on')
    await call('set_temperature', { temperature: clamped })
  }

  /**
   * 判断当前是否处于开机状态。
   * 排除 off/unavailable/unknown 三种视为非开机的状态。
   * @returns 是否开机。
   */
  function isPowerOn() {
    const st = entity()?.state
    return !!st && st !== 'off' && st !== 'unavailable' && st !== 'unknown'
  }
  /** 开机。 */
  function turnOn() {
    return call('turn_on')
  }
  /** 关机。 */
  function turnOff() {
    return call('turn_off')
  }
  /** 切换开关：开机则关，关机则开。 */
  function togglePower() {
    return isPowerOn() ? call('turn_off') : call('turn_on')
  }
  /**
   * 设置风扇模式。
   * @param mode fan_mode 值。
   */
  function setFanMode(mode: string) {
    return call('set_fan_mode', { fan_mode: mode })
  }
  /**
   * 设置 HVAC 模式（自动/制冷/制热等）。
   * @param mode hvac_mode 值。
   */
  function setHvacMode(mode: string) {
    return call('set_hvac_mode', { hvac_mode: mode })
  }
  return {
    setTargetTemp,
    turnOn,
    turnOff,
    togglePower,
    setFanMode,
    setHvacMode,
    callClimate: call,
    getBounds: bounds,
  }
}