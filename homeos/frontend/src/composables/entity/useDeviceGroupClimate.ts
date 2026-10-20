/** - 提供分组内 climate 实体的当前/目标温度读取、温度色调与背景色映射。 */
import { Settings, ThermometerSnowflake, Droplets, Fan, Flame, Power } from '@lucide/vue'
import { climateHasDualSetpoint } from '@/shared/entity/utils/control/climate-control-core'
import type { DeviceGroupEntitiesStoreLike } from '@/shared/device/utils/group-battery.util'
import type { HaEntityState } from '@/shared/types/entity-store'

/** 实体 store 类型，需提供 callService 方法。 */
type EntitiesStore = DeviceGroupEntitiesStoreLike & {
  callService: NonNullable<DeviceGroupEntitiesStoreLike['callService']>
}

/** 空调模式展示信息（对齐 getClimateModeMap 返回值结构） */
interface ClimateModeEntry {
  icon: typeof Settings
  label: string
  iconColor: string
  activeClass: string
}

/**
 * 取空调模式展示映射：图标、中文标签、图标色 class、激活态 class。
 * @returns 模式字符串到展示信息的映射对象。
 */
function getClimateModeMap(): Record<string, ClimateModeEntry> {
  return {
    auto: {
      icon: Settings,
      label: '自动',
      iconColor: 'text-purple-400',
      activeClass:
        'bg-purple-400/15 text-purple-300 border-purple-400/30 shadow-[0_0_16px_rgba(168,85,247,0.18)]',
    },
    cool: {
      icon: ThermometerSnowflake,
      label: '制冷',
      iconColor: 'text-blue-400',
      activeClass:
        'bg-blue-400/15 text-blue-300 border-blue-400/30 shadow-[0_0_16px_rgba(96,165,250,0.18)]',
    },
    dry: {
      icon: Droplets,
      label: '除湿',
      iconColor: 'text-yellow-400',
      activeClass:
        'bg-yellow-400/15 text-yellow-300 border-yellow-400/30 shadow-[0_0_16px_rgba(250,204,21,0.18)]',
    },
    fan_only: {
      icon: Fan,
      label: '送风',
      iconColor: 'text-cyan-400',
      activeClass:
        'bg-cyan-400/15 text-cyan-300 border-cyan-400/30 shadow-[0_0_16px_rgba(34,211,238,0.18)]',
    },
    heat: {
      icon: Flame,
      label: '制热',
      iconColor: 'text-orange-400',
      activeClass:
        'bg-orange-400/15 text-orange-300 border-orange-400/30 shadow-[0_0_16px_rgba(251,146,60,0.18)]',
    },
    off: {
      icon: Power,
      label: '关闭',
      iconColor: 'text-slate-400',
      activeClass: 'bg-slate-400/15 text-slate-300 border-slate-400/30',
    },
  }
}

/**
 * 取空调状态中文标签映射。
 * @returns 状态字符串到中文标签的映射对象。
 */
function getClimateStateLabels(): Record<string, string> {
  return {
    auto: '自动',
    cool: '制冷',
    dry: '除湿',
    fan_only: '送风',
    heat: '制热',
    off: '关闭',
  }
}

/**
 * 取风扇模式中文标签映射。
 * @returns 风扇模式字符串到中文标签的映射对象。
 */
function getFanModeLabels(): Record<string, string> {
  return {
    low: '低风',
    medium: '中风',
    high: '高风',
    quiet: '静音',
  }
}

/** DeviceGroupModal 空调控制与展示辅助 */
export function useDeviceGroupClimate(
  getEntity: (eid: string) => HaEntityState | null | undefined,
  entitiesStore: EntitiesStore,
) {
  function getClimateCurrentTemp(eid: string) {
    const currentTemperature = getEntity(eid)?.attributes?.current_temperature
    return currentTemperature != null && !Number.isNaN(Number(currentTemperature)) ? Number(currentTemperature) : null
  }

  function getClimateTargetTemp(eid: string) {
    const targetTemperature = getEntity(eid)?.attributes?.temperature
    return targetTemperature != null && !Number.isNaN(Number(targetTemperature)) ? Number(targetTemperature) : null
  }

  /** 数值文本；单位 ° 由模板另行渲染 */
  function formatClimateTemp(temperature: number | null | undefined) {
    return temperature != null ? String(temperature) : '--'
  }

  function climateTempTone(cur: number | null | undefined) {
    if (cur == null) return ''
    if (cur >= 28) return 'text-orange-400'
    if (cur <= 18) return 'text-blue-400'
    return 'text-emerald-400'
  }

  /** 空调目标温度可调范围与步进（读实体的 min_temp / max_temp / target_temp_step，缺省 16–30/1） */
  function climateTempRange(eid: string) {
    const attributes = (getEntity(eid)?.attributes || {}) as Record<string, unknown>
    const min = Number(attributes.min_temp)
    const max = Number(attributes.max_temp)
    const step = Number(attributes.target_temp_step)
    const minValue = Number.isFinite(min) ? min : 16
    const maxValue = Number.isFinite(max) && max > minValue ? max : Math.max(minValue + 1, 30)
    return {
      min: minValue,
      max: maxValue,
      step: Number.isFinite(step) && step > 0 ? step : 1,
      dual: climateHasDualSetpoint(attributes),
    }
  }

  async function adjustClimateTemp(eid: string, delta: number) {
    const attributes = (getEntity(eid)?.attributes || {}) as Record<string, unknown>
    const { min, max, dual } = climateTempRange(eid)
    if (dual) {
      // 双温区设备只接受 target_temp_low/high：混发 temperature 会被 HA 拒绝
      const low = Number(attributes.target_temp_low)
      if (!Number.isFinite(low)) return
      const highRaw = Number(attributes.target_temp_high)
      const high = Number.isFinite(highRaw) ? highRaw : max
      const upper = Math.max(min, high - 2)
      const next = Math.min(Math.max(low + delta, min), upper)
      await entitiesStore.callService(
        'climate',
        'set_temperature',
        eid,
        { target_temp_low: next, target_temp_high: high },
        false,
      )
      return
    }
    const raw = attributes.temperature
    if (raw == null) return
    const cur = Number(raw)
    if (!Number.isFinite(cur)) return
    // 用实体自身上下限钳制，避免把支持 12–35 的机型硬卡在 16–30
    const next = Math.min(max, Math.max(min, cur + delta))
    await entitiesStore.callService('climate', 'set_temperature', eid, { temperature: next }, false)
  }

  async function setHvacMode(eid: string, mode: string) {
    await entitiesStore.callService('climate', 'set_hvac_mode', eid, { hvac_mode: mode }, false)
  }

  async function turnOffClimate(eid: string) {
    await setHvacMode(eid, 'off')
  }

  async function setFanMode(eid: string, mode: string) {
    await entitiesStore.callService('climate', 'set_fan_mode', eid, { fan_mode: mode }, false)
  }

  function getFanModeLabel(mode: string) {
    return getFanModeLabels()[mode] || mode
  }

  function hvacModes(eid: string) {
    const entity = getEntity(eid)
    const modes = entity?.attributes?.hvac_modes
    if (!Array.isArray(modes)) return []
    return modes.filter((mode): mode is string => typeof mode === 'string' && mode !== 'off')
  }

  function climateModeInfo(mode: string) {
    return (
      getClimateModeMap()[mode] || {
        icon: Settings,
        label: mode,
        iconColor: 'text-slate-300',
        activeClass: 'bg-slate-600/20 text-slate-300 border-slate-600/30',
      }
    )
  }

  function climateStateLabel(state: string | undefined) {
    if (!state) return '未知'
    return getClimateStateLabels()[state] || state
  }

  function climateBgColor(state: string | undefined) {
    return state === 'cool'
      ? 'rgba(96,165,250,0.15)'
      : state === 'heat'
        ? 'rgba(251,146,60,0.15)'
        : state === 'dry'
          ? 'rgba(250,204,21,0.15)'
          : state === 'fan_only'
            ? 'rgba(34,211,238,0.15)'
            : state === 'auto'
              ? 'rgba(168,85,247,0.15)'
              : state === 'off'
                ? 'rgba(75,85,99,0.3)'
                : 'rgba(34,197,94,0.15)'
  }

  function climateBorderColor(state: string | undefined) {
    return state === 'cool'
      ? 'rgba(96,165,250,0.3)'
      : state === 'heat'
        ? 'rgba(251,146,60,0.3)'
        : state === 'dry'
          ? 'rgba(250,204,21,0.3)'
          : state === 'fan_only'
            ? 'rgba(34,211,238,0.3)'
            : state === 'auto'
              ? 'rgba(168,85,247,0.3)'
              : state === 'off'
                ? 'rgba(255,255,255,0.1)'
                : 'rgba(34,197,94,0.3)'
  }

  function climateIconEmoji(state: string | undefined) {
    return state === 'cool'
      ? '❄️'
      : state === 'heat'
        ? '🔥'
        : state === 'dry'
          ? '💧'
          : state === 'fan_only'
            ? '🌀'
            : state === 'auto'
              ? '🤖'
              : state === 'off'
                ? '⏸️'
                : '✅'
  }

  return {
    getClimateCurrentTemp,
    getClimateTargetTemp,
    formatClimateTemp,
    climateTempTone,
    adjustClimateTemp,
    setHvacMode,
    turnOffClimate,
    setFanMode,
    getFanModeLabel,
    hvacModes,
    climateModeInfo,
    climateStateLabel,
    climateBgColor,
    climateBorderColor,
    climateIconEmoji,
  }
}
