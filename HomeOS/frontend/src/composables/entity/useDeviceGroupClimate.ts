/**
 * @module useDeviceGroupClimate
 * @description DeviceGroupModal 空调控制与展示辅助组合式函数。
 *
 * 职责：
 * - 提供分组内 climate 实体的当前/目标温度读取、温度色调与背景色映射。
 * - 封装温度调节、HVAC 模式、风扇模式等服务调用。
 * - 维护模式/状态/风扇模式的中文标签与图标 emoji 映射。
 *
 * 依赖：
 * - @lucide/vue：模式图标组件。
 * - @/utils/device/device-group-battery.util：DeviceGroupEntitiesStoreLike 类型。
 * - @/types/entity-store：HaEntityState 实体状态类型。
 */
import { Settings, ThermometerSnowflake, Droplets, Fan, Flame, Power } from '@lucide/vue'
import type { DeviceGroupEntitiesStoreLike } from '@/utils/device/group-battery.util'
import type { HaEntityState } from '@/types/entity-store'

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
    const v = getEntity(eid)?.attributes?.current_temperature
    return v != null && !Number.isNaN(Number(v)) ? Number(v) : null
  }

  function getClimateTargetTemp(eid: string) {
    const v = getEntity(eid)?.attributes?.temperature
    return v != null && !Number.isNaN(Number(v)) ? Number(v) : null
  }

  /** 数值文本；单位 ° 由模板另行渲染 */
  function formatClimateTemp(v: number | null | undefined) {
    return v != null ? String(v) : '--'
  }

  function climateTempTone(cur: number | null | undefined) {
    if (cur == null) return ''
    if (cur >= 28) return 'text-orange-400'
    if (cur <= 18) return 'text-blue-400'
    return 'text-emerald-400'
  }

  async function adjustClimateTemp(eid: string, delta: number) {
    const entity = getEntity(eid)
    const cur = entity?.attributes?.temperature
    if (cur == null) return
    const next = Math.min(30, Math.max(16, Number(cur) + delta))
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
    return modes.filter((m): m is string => typeof m === 'string' && m !== 'off')
  }

  function climateModeInfo(m: string) {
    return (
      getClimateModeMap()[m] || {
        icon: Settings,
        label: m,
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
