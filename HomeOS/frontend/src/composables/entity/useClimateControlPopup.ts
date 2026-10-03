/**
 * @module useClimateControlPopup
 * @description 温控弹窗（climate / fan）控制逻辑组合式函数。
 *
 * 职责：
 * - 基于 useEntityPopupBase 获取实时实体，并派生模式/温度/湿度等展示信息。
 * - 提供温度滑块、双温区、HVAC 模式、风扇模式、摆风、预设等交互动作。
 * - 通过 entitiesStore.callService 直连服务调用，失败时统一 notifyError。
 *
 * 依赖：
 * - vue：computed 响应式计算。
 * - @homeos/shared：getEntityDomain 解析 domain。
 * - @lucide/vue：模式图标组件。
 * - @/composables/entity/useEntityPopupBase：弹窗基座与实时实体。
 * - @/stores/entities.store：实体 store 与服务调用。
 * - @/composables/entity/useSliderCommit：温度滑块提交封装。
 * - @/utils/ui/progress-bar.util：clampInRange 数值钳制。
 * - @/services/notify：notifyError 错误提示。
 * - @/utils/entity/entity-derived.util：getEntityDisplayName 显示名。
 */
import { computed } from 'vue'
import { getEntityDomain } from '@homeos/shared'
import { Settings, ThermometerSnowflake, Droplets, Fan, Flame, Power } from '@lucide/vue'
import {
  useEntityPopupBase,
  type EntityPopupBaseProps,
} from '@/composables/entity/useEntityPopupBase'
import { useEntitiesStore } from '@/stores/entities.store'
import { useSliderCommit } from '@/composables/entity/useSliderCommit'
import { clampInRange } from '@/utils/ui/progress-bar.util'
import { notifyError } from '@/services/notify'
import { getEntityDisplayName } from '@/utils/entity/derived.util'

/** HVAC 模式中文标签映射，键为 HA hvac_mode 字符串。 */
const HVAC_MODE_LABELS: Record<string, string> = {
  auto: '自动',
  cool: '制冷',
  dry: '除湿',
  fan_only: '送风',
  heat: '制热',
  off: '关闭',
}

/** 风扇模式中文标签映射，键为 HA fan_mode 字符串。 */
const FAN_MODE_LABELS: Record<string, string> = {
  auto: '自动',
  high: '高风',
  low: '低风',
  medium: '中风',
}

/** 预设模式中文标签映射，键为 HA preset_mode 字符串。 */
const PRESET_MODE_LABELS: Record<string, string> = {
  activity: '活动',
  anti_freeze: '防冻',
  away: '离家',
  boost: '强力',
  comfort: '舒适',
  eco: '节能',
  home: '在家',
  none: '无',
  sleep: '睡眠',
}

/** HVAC 模式展示信息：图标、图标色 class、激活态 class。 */
const modeMap = {
  auto: { icon: Settings, iconColor: 'ccp-ic-auto', activeClass: 'ccp-mode ccp-mode--auto' },
  cool: {
    icon: ThermometerSnowflake,
    iconColor: 'ccp-ic-cool',
    activeClass: 'ccp-mode ccp-mode--cool',
  },
  dry: { icon: Droplets, iconColor: 'ccp-ic-dry', activeClass: 'ccp-mode ccp-mode--dry' },
  fan_only: { icon: Fan, iconColor: 'ccp-ic-fan', activeClass: 'ccp-mode ccp-mode--fan' },
  heat: { icon: Flame, iconColor: 'ccp-ic-heat', activeClass: 'ccp-mode ccp-mode--heat' },
  off: { icon: Power, iconColor: 'ccp-ic-off', activeClass: 'ccp-mode ccp-mode--off' },
}

/** 风扇模式 emoji 前缀映射，用于按钮展示。 */
const FAN_EMOJI: Record<string, string> = { auto: '🤖', low: '🌬', medium: '💨', high: '🌪' }

/** 预设模式 emoji 前缀映射，none 不带 emoji。 */
const PRESET_EMOJI: Record<string, string> = {
  none: '',
  eco: '🌱',
  away: '🚪',
  home: '🏠',
  sleep: '😴',
  comfort: '😊',
  boost: '⚡',
  activity: '🏃',
  anti_freeze: '❄️',
}
/**
 * 温控弹窗控制组合式函数。
 *
 * @param props 弹窗基座 props，提供实体 ID 等基础信息。
 * @returns 实时实体、派生展示信息及一系列服务调用方法。
 */
export function useClimateControlPopup(props: EntityPopupBaseProps) {
  const { liveEntity } = useEntityPopupBase(props)
  const entitiesStore = useEntitiesStore()

  /**
   * 从实体 attributes 中读取字符串列表（如 hvac_modes、fan_modes）。
   * @param key attributes 键名。
   * @returns 字符串数组；非数组时返回空数组。
   */
  function attrStringList(key: string): string[] {
    const raw = liveEntity.value?.attributes?.[key]
    return Array.isArray(raw) ? (raw as string[]) : []
  }

  /** 支持的 HVAC 模式列表（含 off）。 */
  const hvacModes = computed(() => attrStringList('hvac_modes'))
  /** 可切换的 HVAC 模式列表（剔除 off，off 由独立开关控制）。 */
  const activeHvacModes = computed(() => hvacModes.value.filter((mode: string) => mode !== 'off'))
  /** 支持的风扇模式列表。 */
  const fanModes = computed(() => attrStringList('fan_modes'))
  /** 支持的摆风模式列表。 */
  const swingModes = computed(() => attrStringList('swing_modes'))
  /** 支持的预设模式列表。 */
  const presetModes = computed(() => attrStringList('preset_modes'))
  /** 当前实体是否属于 fan domain（风扇走独立服务路径）。 */
  const isFan = computed(() => liveEntity.value?.entity_id?.startsWith('fan.'))

  /** 取当前实体 entity_id，无实体时返回空串。 */
  function entityId(): string {
    return liveEntity.value?.entity_id || ''
  }

  /**
   * 根据 HVAC 模式取展示信息（图标/颜色/激活 class/标签）。
   * 未知模式回退到默认图标与原模式字符串作为标签。
   * @param mode HVAC 模式字符串。
   */
  function modeInfo(mode: string) {
    const base = modeMap[mode as keyof typeof modeMap]
    if (base) return { ...base, label: HVAC_MODE_LABELS[mode] ?? mode }
    return {
      icon: Settings,
      iconColor: 'ccp-ic-default',
      activeClass: 'ccp-mode ccp-mode--default',
      label: mode,
    }
  }

  /**
   * 取风扇模式展示文本：emoji + 中文标签，无 emoji 时直接返回原值；
   * 未配置（undefined/null/空串）时回退为「—」。
   * @param mode 风扇模式字符串。
   */
  function getFanModeLabel(mode: string | null | undefined) {
    if (mode == null || mode === '') return '—'
    return FAN_EMOJI[mode] ? `${FAN_EMOJI[mode]} ${FAN_MODE_LABELS[mode] ?? mode}` : mode
  }

  /**
   * 取 HVAC 状态展示文本：已知模式返回中文标签，未知原样返回。
   * @param state 实体 state 字符串。
   */
  function getHvacStateLabel(state: string | undefined) {
    if (!state) return state
    return modeMap[state as keyof typeof modeMap] ? (HVAC_MODE_LABELS[state] ?? state) : state
  }

  /** 实体显示名，用于弹窗标题。 */
  const entityName = computed(() =>
    getEntityDisplayName(liveEntity.value?.entity_id ?? '', liveEntity.value),
  )

  /** 状态色 class：制冷蓝、制热橙、关闭灰、其它默认。 */
  const stateColor = computed(() => {
    const s = liveEntity.value?.state
    if (s === 'cool') return 'ccp-state-cool'
    if (s === 'heat') return 'ccp-state-heat'
    if (s === 'off') return 'ccp-state-off'
    return 'ccp-state-default'
  })

  /** 温度步进，缺省 1。 */
  const tempStep = computed(() => Number(liveEntity.value?.attributes?.target_temp_step || 1))
  /** 最低温度，缺省 16。 */
  const minTemp = computed(() => Number(liveEntity.value?.attributes?.min_temp ?? 16))
  /** 最高温度，缺省 32。 */
  const maxTemp = computed(() => Number(liveEntity.value?.attributes?.max_temp ?? 32))

  /**
   * 目标温度：优先 temperature，其次 target_temp_low，缺省 24。
   * 最终经 clampInRange 钳制到 [minTemp, maxTemp]，越界回退 24。
   */
  const targetTemp = computed(() => {
    const a = liveEntity.value?.attributes || {}
    let v
    if (a.temperature !== undefined) v = Number(a.temperature)
    else if (a.target_temp_low !== undefined) v = Number(a.target_temp_low)
    else v = 24
    return clampInRange(v, minTemp.value, maxTemp.value, 24)
  })

  /** 是否为双温区设定（同时存在 target_temp_low 与 target_temp_high）。 */
  const hasDualSetpoint = computed(() => {
    const a = liveEntity.value?.attributes || {}
    return a.target_temp_low !== undefined && a.target_temp_high !== undefined
  })

  /** 双温区下限，缺省取 minTemp。 */
  const dualTempLow = computed(() =>
    Number(liveEntity.value?.attributes?.target_temp_low ?? minTemp.value),
  )
  /** 双温区上限，缺省取 maxTemp。 */
  const dualTempHigh = computed(() =>
    Number(liveEntity.value?.attributes?.target_temp_high ?? maxTemp.value),
  )

  /** 是否存在任何目标温度字段（用于决定是否展示温度控制区）。 */
  const hasTargetTemp = computed(() => {
    const a = liveEntity.value?.attributes || {}
    return (
      a.temperature !== undefined ||
      a.target_temp_low !== undefined ||
      a.target_temp_high !== undefined
    )
  })

  /**
   * 提交目标温度到 HA。
   * 双温区场景下同步提交 target_temp_low/high，且 high 至少比 low 大 2 度。
   * @param val 目标温度值。
   */
  async function setTempValue(val: number) {
    const domain = getEntityDomain(entityId()) || 'climate'
    const data: Record<string, number> = { temperature: val }
    if (liveEntity.value?.attributes?.target_temp_low !== undefined) {
      data.target_temp_low = val
      if (liveEntity.value?.attributes?.target_temp_high !== undefined) {
        // 保证 high 不低于 low+2，避免温区交叉
        data.target_temp_high = Math.max(
          val + 2,
          Number(liveEntity.value.attributes.target_temp_high),
        )
      }
    }
    try {
      await entitiesStore.callService(
        domain,
        'set_temperature',
        entityId(),
        data,
        false,
      )
    } catch (e) {
      notifyError(e, '设置空调温度')
    }
  }
  /**
   * 温度滑块提交封装：提供 rangeValue、trackStyle、onInput、onChange、commit。
   * track 配置 min/max/step/color 由当前实体派生。
   */
  const {
    rangeValue: tempRange,
    trackStyle: tempTrackStyle,
    onInput: onTempInput,
    onChange: onTempChange,
    commit: commitTemp,
  } = useSliderCommit(targetTemp, {
    onCommit: (val: number) => setTempValue(val),
    track: () => ({
      min: minTemp.value,
      max: maxTemp.value,
      step: tempStep.value,
      color: '#38bdf8',
    }),
  })

  /** 当前实际温度，无值或非法时返回 null。 */
  const currentTemp = computed(() => {
    const v = liveEntity.value?.attributes?.current_temperature
    return v != null && !Number.isNaN(Number(v)) ? Number(v) : null
  })

  /** 当前温度展示文本，无值时显示 '--'。 */
  const currentTempDisplay = computed(() => (currentTemp.value == null ? '--' : currentTemp.value))

  /** 当前温度色调 class：按温度区间映射 hot/warm/comfy/cool/cold/muted。 */
  const currentTempTone = computed(() => {
    const t = currentTemp.value
    if (t == null) return 'tone-muted'
    if (t >= 35) return 'tone-hot'
    if (t >= 28) return 'tone-warm'
    if (t >= 22) return 'tone-comfy'
    if (t >= 16) return 'tone-cool'
    return 'tone-cold'
  })

  /**
   * 按 step 增减目标温度并提交。
   * 增量经 step 取整后钳制到 [minTemp, maxTemp]。
   * @param delta 步进倍数（正数升温，负数降温）。
   */
  async function adjustTemp(delta: number) {
    const step = tempStep.value
    const current = Number(targetTemp.value)
    let val = Math.round((current + delta * step) / step) * step
    if (val < minTemp.value) val = minTemp.value
    if (val > maxTemp.value) val = maxTemp.value
    await setTempValue(val)
  }

  /**
   * 设置摆风模式。
   * @param mode swing_mode 值。
   */
  async function setSwingMode(mode: string) {
    try {
      const domain = getEntityDomain(entityId()) || 'climate'
      await entitiesStore.callService(
        domain,
        'set_swing_mode',
        entityId(),
        { swing_mode: mode },
        false,
      )
    } catch (e) {
      notifyError(e, '设置摆风模式')
    }
  }

  /**
   * 调整双温区上下限。
   * low 调整时不能超过 high - step；high 调整时不能低于 low + step。
   * @param which 调整哪一端（low/high）。
   * @param delta 温度增量。
   */
  async function adjustDualTemp(which: 'low' | 'high', delta: number) {
    const low = dualTempLow.value
    const high = dualTempHigh.value
    const data: Record<string, number> = {}
    if (which === 'low') {
      const next = clampInRange(low + delta, minTemp.value, high - tempStep.value, low)
      data.target_temp_low = next
      data.target_temp_high = high
    } else {
      const next = clampInRange(high + delta, low + tempStep.value, maxTemp.value, high)
      data.target_temp_low = low
      data.target_temp_high = next
    }
    try {
      const domain = getEntityDomain(entityId()) || 'climate'
      await entitiesStore.callService(
        domain,
        'set_temperature',
        entityId(),
        data,
        false,
      )
    } catch (e) {
      notifyError(e, '设置双温区')
    }
  }

  /**
   * 设置 HVAC 模式。
   * @param mode hvac_mode 值。
   */
  async function setHvacMode(mode: string) {
    try {
      const domain = getEntityDomain(entityId())
      await entitiesStore.callService(
        domain,
        'set_hvac_mode',
        entityId(),
        { hvac_mode: mode },
        false,
      )
    } catch (e) {
      notifyError(e, '设置空调模式')
    }
  }

  /**
   * 设置风扇模式。
   * @param mode fan_mode 值。
   */
  async function setFanMode(mode: string) {
    try {
      const domain = getEntityDomain(entityId()) || 'climate'
      await entitiesStore.callService(
        domain,
        'set_fan_mode',
        entityId(),
        { fan_mode: mode },
        false,
      )
    } catch (e) {
      notifyError(e, '设置风扇模式')
    }
  }

  /** 切换风扇开关：根据当前 state 决定 turn_on/turn_off。 */
  async function toggleFan() {
    try {
      const svc = liveEntity.value?.state === 'on' ? 'turn_off' : 'turn_on'
      await entitiesStore.callService('fan', svc, entityId(), null, false)
    } catch (e) {
      notifyError(e, '切换风量')
    }
  }

  /**
   * 取预设模式展示文本：emoji + 中文标签，无 emoji 时仅返回标签；
   * 未配置（undefined/null/空串）时回退为「—」。
   * @param mode preset_mode 值。
   */
  function getPresetLabel(mode: string | null | undefined) {
    if (mode == null || mode === '') return '—'
    if (!(mode in PRESET_EMOJI)) return mode
    const emoji = PRESET_EMOJI[mode]
    const label = PRESET_MODE_LABELS[mode] ?? mode
    return emoji ? `${emoji} ${label}` : label
  }

  /**
   * 设置预设模式。
   * @param mode preset_mode 值。
   */
  async function setPreset(mode: string) {
    const domain = getEntityDomain(entityId()) || 'climate'
    try {
      await entitiesStore.callService(
        domain,
        'set_preset_mode',
        entityId(),
        { preset_mode: mode },
        false,
      )
    } catch (e) {
      notifyError(e, '设置预设')
    }
  }

  return {
    liveEntity,
    entityName,
    stateColor,
    activeHvacModes,
    fanModes,
    swingModes,
    presetModes,
    isFan,
    modeInfo,
    getFanModeLabel,
    getHvacStateLabel,
    hasTargetTemp,
    currentTemp,
    currentTempDisplay,
    currentTempTone,
    targetTemp,
    minTemp,
    maxTemp,
    tempStep,
    tempRange,
    tempTrackStyle,
    onTempInput,
    onTempChange,
    commitTemp,
    adjustTemp,
    setHvacMode,
    setFanMode,
    toggleFan,
    hasDualSetpoint,
    dualTempLow,
    dualTempHigh,
    adjustDualTemp,
    setSwingMode,
    getPresetLabel,
    setPreset,
  }
}