import { computed, type ComputedRef, type Ref, type PropType, ref, watch, onMounted, onBeforeUnmount, onUnmounted, unref, type MaybeRef } from 'vue'
import { getEntityDomain } from '@homeos/shared'
import { Settings, ThermometerSnowflake, Droplets, Fan, Flame, Power } from '@lucide/vue'
import { useEntitiesStore } from '@/domain/entity/store/entities.store'
import { useSliderCommit } from '@/domain/entity/composables/use-slider-commit'
import { clampInRange, sliderTrackStyle, colorTempSliderTrackStyle, kelvinToMireds, clampKelvinForDevice, resolveKelvinBounds, resolveEntityColorTempKelvinForUi, resolveColorTempStep, progressFillStyle } from '@/kernel/utils/ui'
import { resolveTemperatureUnit } from '@/domain/entity/model/utils/temperature-unit.util'
import { notifyError } from '@/kernel/ui/notify'
import { getEntityDisplayName } from '@/domain/entity/model/utils/derived.util'
import { HVAC_MODE_LABELS, climateFanModeLabel, climateHvacStateLabel, climatePresetModeLabel, climateAttrStringList, climateHasDualSetpoint, climateHasTargetTemp } from '@/domain/entity/model/utils/control/climate-control-core'
import { coverHasPositionControl, coverIsMoving, coverPositionFromAttributes, coverActionErrorMessage } from '@/domain/entity/model/utils/control/cover-control-core'
import { useFixedPopupPosition, usePopupPosition } from '@/kernel/ui/popup/use-popup-position'
import { type PopupNumericInput } from '@/kernel/ui/popup/popup-position-shared.util'
import { popupDomainStateLabel } from '@/kernel/constants'
import { useLiveEntity } from '@/domain/entity/composables/use-live-entity'
import { useHaEntityService } from '@/domain/entity/composables/ha'
import { type HaEntityState } from '@/kernel/types/entity'
import { fetchEntityById } from '@/domain/entity/model/utils/cold-fetch.util'
import { LIGHT_COLOR_PRESETS as COLOR_PRESETS, pickLightCapabilityAttrs, lightSupportsRgb, lightSupportsColorTemp, lightBrightnessPct, lightBrightnessFromPct, hsvToRgb, rgbToHs, buildLightTurnOnData } from '@/domain/entity/model/utils/control/light-control-core'
import { hexToRgbOrBlack as hexToRgb } from '@/kernel/utils/ui'
import { useHaConnectionStore } from '@/domain/ha/ha-connection.store'
import { resolveHaEntityPicture } from '@/kernel/utils/ha'
import { volumeLevelFromPercent, volumeLevelToPercent } from '@/domain/entity/model/utils/control/media-player-control-core'
import { useTtsSpeak } from '@/domain/voice/use-tts-speak'

/** - 基于 useEntityPopupBase 获取实时实体，并派生模式/温度/湿度等展示信息。 */

/** HVAC 模式展示信息：图标、图标色 class、激活态 class（UI 壳层，标签在 control core）。 */
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
/**
 * 温控弹窗控制组合式函数。
 *
 * @param props 弹窗基座 props，提供实体 ID 等基础信息。
 * @returns 实时实体、派生展示信息及一系列服务调用方法。
 */
export function useClimateControlPopup(props: EntityPopupBaseProps) {
  const { liveEntity } = useEntityPopupBase(props)
  const entitiesStore = useEntitiesStore()

  /** 支持的 HVAC 模式列表（含 off）。 */
  const hvacModes = computed(() =>
    climateAttrStringList(liveEntity.value?.attributes as Record<string, unknown>, 'hvac_modes'),
  )
  /** 可切换的 HVAC 模式列表（剔除 off，off 由独立开关控制）。 */
  const activeHvacModes = computed(() => hvacModes.value.filter((mode: string) => mode !== 'off'))
  /** 支持的风扇模式列表。 */
  const fanModes = computed(() =>
    climateAttrStringList(liveEntity.value?.attributes as Record<string, unknown>, 'fan_modes'),
  )
  /** 支持的摆风模式列表。 */
  const swingModes = computed(() =>
    climateAttrStringList(liveEntity.value?.attributes as Record<string, unknown>, 'swing_modes'),
  )
  /** 支持的预设模式列表。 */
  const presetModes = computed(() =>
    climateAttrStringList(liveEntity.value?.attributes as Record<string, unknown>, 'preset_modes'),
  )
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

  function getFanModeLabel(mode: string | null | undefined) {
    return climateFanModeLabel(mode)
  }

  function getHvacStateLabel(state: string | undefined) {
    return climateHvacStateLabel(state)
  }

  /** 实体显示名，用于弹窗标题。 */
  const entityName = computed(() => getEntityDisplayName(liveEntity.value?.entity_id ?? '', liveEntity.value))

  /** 状态色 class：制冷蓝、制热橙、关闭灰、其它默认。 */
  const stateColor = computed(() => {
    const state = liveEntity.value?.state
    if (state === 'cool') return 'ccp-state-cool'
    if (state === 'heat') return 'ccp-state-heat'
    if (state === 'off') return 'ccp-state-off'
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
    const attributes = liveEntity.value?.attributes || {}
    let targetValue
    if (attributes.temperature !== undefined) targetValue = Number(attributes.temperature)
    else if (attributes.target_temp_low !== undefined) targetValue = Number(attributes.target_temp_low)
    else targetValue = 24
    return clampInRange(targetValue, minTemp.value, maxTemp.value, 24)
  })

  /** 是否为双温区设定（同时存在 target_temp_low 与 target_temp_high）。 */
  const hasDualSetpoint = computed(() =>
    climateHasDualSetpoint(liveEntity.value?.attributes as Record<string, unknown>),
  )

  /** 双温区下限，缺省取 minTemp。 */
  const dualTempLow = computed(() => Number(liveEntity.value?.attributes?.target_temp_low ?? minTemp.value))
  /** 双温区上限，缺省取 maxTemp。 */
  const dualTempHigh = computed(() => Number(liveEntity.value?.attributes?.target_temp_high ?? maxTemp.value))

  /** 是否存在任何目标温度字段（用于决定是否展示温度控制区）。 */
  const hasTargetTemp = computed(() => climateHasTargetTemp(liveEntity.value?.attributes as Record<string, unknown>))

  /**
   * 提交目标温度到 HA。
   *
   * 双温区（heat_cool 类）设备只接受 `target_temp_low` / `target_temp_high`，
   * 单温区设备只接受 `temperature`：两者混发会被 HA 判为无效参数（命令被拒或静默忽略），
   * 因此这里按 `climateHasDualSetpoint` 二选一，且保证 high 至少比 low 大 2 度。
   * @param val 目标温度值。
   */
  async function setTempValue(val: number) {
    const domain = getEntityDomain(entityId()) || 'climate'
    const attrs = (liveEntity.value?.attributes || {}) as Record<string, unknown>
    const data: Record<string, number> = {}
    if (climateHasDualSetpoint(attrs)) {
      const curHigh = Number(attrs.target_temp_high)
      data.target_temp_low = val
      // 保证 high 不低于 low+2，避免温区交叉
      data.target_temp_high = Number.isFinite(curHigh) ? Math.max(val + 2, curHigh) : val + 2
    } else {
      data.temperature = val
    }
    try {
      await entitiesStore.callService(domain, 'set_temperature', entityId(), data, false)
    } catch (error) {
      notifyError(error, '设置空调温度')
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
    const rawTemperature = liveEntity.value?.attributes?.current_temperature
    return rawTemperature != null && !Number.isNaN(Number(rawTemperature)) ? Number(rawTemperature) : null
  })

  /** 当前温度展示文本，无值时显示 '--'。 */
  const currentTempDisplay = computed(() => (currentTemp.value == null ? '--' : currentTemp.value))

  /**
   * 温度单位（`°C` / `°F` / `K`）。
   *
   * 原先模板写死 `°C`，°F 部署下会显示「23°C」。单位取自实体自身的
   * `temperature_unit`（climate 的权威字段），取不到再回落 `unit_of_measurement`。
   */
  const temperatureUnit = computed(() => resolveTemperatureUnit(liveEntity.value?.attributes))

  /** 当前温度色调 class：按温度区间映射 hot/warm/comfy/cool/cold/muted。 */
  const currentTempTone = computed(() => {
    const temperature = currentTemp.value
    if (temperature == null) return 'tone-muted'
    if (temperature >= 35) return 'tone-hot'
    if (temperature >= 28) return 'tone-warm'
    if (temperature >= 22) return 'tone-comfy'
    if (temperature >= 16) return 'tone-cool'
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
      await entitiesStore.callService(domain, 'set_swing_mode', entityId(), { swing_mode: mode }, false)
    } catch (error) {
      notifyError(error, '设置摆风模式')
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
      await entitiesStore.callService(domain, 'set_temperature', entityId(), data, false)
    } catch (error) {
      notifyError(error, '设置双温区')
    }
  }

  /**
   * 设置 HVAC 模式。
   * @param mode hvac_mode 值。
   */
  async function setHvacMode(mode: string) {
    try {
      const domain = getEntityDomain(entityId())
      await entitiesStore.callService(domain, 'set_hvac_mode', entityId(), { hvac_mode: mode }, false)
    } catch (error) {
      notifyError(error, '设置空调模式')
    }
  }

  /**
   * 设置风扇模式。
   * @param mode fan_mode 值。
   */
  async function setFanMode(mode: string) {
    try {
      const domain = getEntityDomain(entityId()) || 'climate'
      await entitiesStore.callService(domain, 'set_fan_mode', entityId(), { fan_mode: mode }, false)
    } catch (error) {
      notifyError(error, '设置风扇模式')
    }
  }

  /** 切换风扇开关：根据当前 state 决定 turn_on/turn_off。 */
  async function toggleFan() {
    try {
      const svc = liveEntity.value?.state === 'on' ? 'turn_off' : 'turn_on'
      await entitiesStore.callService('fan', svc, entityId(), null, false)
    } catch (error) {
      notifyError(error, '切换风量')
    }
  }

  /**
   * 取预设模式展示文本：emoji + 中文标签，无 emoji 时仅返回标签；
   * 未配置（undefined/null/空串）时回退为「—」。
   * @param mode preset_mode 值。
   */
  function getPresetLabel(mode: string | null | undefined) {
    return climatePresetModeLabel(mode)
  }

  /**
   * 设置预设模式。
   * @param mode preset_mode 值。
   */
  async function setPreset(mode: string) {
    const domain = getEntityDomain(entityId()) || 'climate'
    try {
      await entitiesStore.callService(domain, 'set_preset_mode', entityId(), { preset_mode: mode }, false)
    } catch (error) {
      notifyError(error, '设置预设')
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
    temperatureUnit,
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

/**
 * 窗帘控制弹窗组合式函数：壳层状态 + 调用 cover-control-core。
 */

export function useCoverControlPopup(props: EntityPopupBaseProps) {
  const { liveEntity, entityRef, entityName, callService } = useEntityPopupBase(props)
  const { stateLabel } = useEntityPopupHeader(entityRef, {
    stateLabelDomain: 'cover',
  })

  const isMoving = computed(() => coverIsMoving(liveEntity.value?.state))

  const positionSource = computed(() =>
    coverPositionFromAttributes(liveEntity.value?.attributes as Record<string, unknown>),
  )

  const {
    localValue: positionLocal,
    rangeValue: positionRange,
    trackStyle: positionTrackStyle,
    onInput: onPositionInput,
    onChange: onPositionChange,
    commit: commitPosition,
  } = useSliderCommit(positionSource, {
    parse: (v: unknown) => parseInt(String(v), 10),
    onCommit: (pos: number) => setPosition(pos),
    track: () => ({
      min: 0,
      max: 100,
      step: 1,
      color: '#a78bfa',
      trackColor: 'rgba(255,255,255,0.1)',
    }),
  })

  const hasPositionControl = computed(() => coverHasPositionControl(liveEntity.value?.attributes?.supported_features))

  async function setPosition(pos: number) {
    const entityId = liveEntity.value?.entity_id
    if (!entityId) return
    await callService('cover', 'set_cover_position', entityId, { position: pos }, '设置窗帘位置失败')
  }

  async function handleAction(action: string) {
    const entityId = liveEntity.value?.entity_id
    if (!entityId) return
    await callService('cover', action, entityId, undefined, coverActionErrorMessage(action))
  }

  return {
    liveEntity,
    entityName,
    stateLabel,
    isMoving,
    positionLocal,
    positionRange,
    positionTrackStyle,
    onPositionInput,
    onPositionChange,
    commitPosition,
    hasPositionControl,
    handleAction,
  }
}

/** 统一输出弹窗 style、popupClass、箭头 style。 */

/** 弹窗锚点 props：anchorX/Y 为像素锚点，xPct/yPct 为百分比锚点 */
interface EntityPopupAnchorProps {
  anchorX?: number | null
  anchorY?: number | null
  xPct?: number | string
  yPct?: number | string
}

/**
 * 实体控制弹窗锚点定位（户型图像素锚点 / 百分比锚点）。
 *
 * @param props 锚点配置（anchorX/Y 与 xPct/yPct 二选一）
 * @param pw 弹窗宽度（数字或返回数字的函数）
 * @param ph 弹窗高度（数字或返回数字的函数）
 * @param margin 弹窗与边界的最小间距（默认 16）
 * @returns useAnchor 是否使用像素锚点；anchorStyle 弹窗定位样式；popupClass 弹窗 class；arrowStyle 箭头样式
 */
export function useEntityPopupAnchor(
  props: EntityPopupAnchorProps,
  pw: PopupNumericInput,
  ph: PopupNumericInput,
  margin: number | PopupNumericInput = 16,
) {
  // 同时存在 anchorX 与 anchorY 时启用像素锚点模式
  const useAnchor = computed(() => props.anchorX != null && props.anchorY != null)
  const fr = useFixedPopupPosition(
    () => props.anchorX ?? 0,
    () => props.anchorY ?? 0,
    pw,
    ph,
    typeof margin === 'number' ? margin : 16,
  )
  const pr = usePopupPosition(
    () => props.xPct,
    () => props.yPct,
    pw,
    ph,
    typeof margin === 'number' ? margin : 16,
  )
  // 根据锚点模式选择对应的样式 / class / 箭头
  const anchorStyle = computed(() => (useAnchor.value ? fr.fixedStyle.value : pr.popupStyle.value))
  const popupClass = computed(() => (useAnchor.value ? fr.popupClassArray.value : pr.popupClassArray.value))
  // 像素锚点才有箭头样式，百分比锚点模式下不展示
  const arrowStyle = computed(() => (useAnchor.value ? fr.arrowStyle.value : {}))
  return {
    useAnchor,
    anchorStyle,
    popupClass,
    arrowStyle,
  }
}

/** 实体弹窗通用基础组合式函数模块。 */

/** 实体引用类型：可为 Ref 或 ComputedRef，统一为只读快照。 */
type EntityRefLike =
  | Ref<HaEntityState | Record<string, unknown> | null | undefined>
  | ComputedRef<HaEntityState | Record<string, unknown> | null | undefined>

/**
 * 共享的实体弹窗头部：名称、状态标签、颜色、活跃脉冲。
 *
 * 通过传入实体引用与可选的状态映射配置，派生弹窗头部所需的展示信息；
 * 状态标签优先使用 domain 专属映射，缺省时直接回退原始 state 字符串。
 *
 * @param entityRef 实体引用（Ref 或 ComputedRef）
 * @param options 配置项
 * @param {string} [options.stateLabelDomain] lock | cover | valve | vacuum 等 domain，用于查表获取状态文案
 * @param {Record<string, string>} [options.stateColorMap] 状态 → Tailwind 文本色类的映射
 * @param {(state: string | undefined) => boolean} [options.isActiveFn] 自定义"活跃"判断（默认非 off/unavailable/null）
 * @returns 头部所需的派生计算属性集合
 */
export function useEntityPopupHeader(
  entityRef: EntityRefLike,
  options: {
    stateLabelDomain?: string
    stateColorMap?: Record<string, string>
    isActiveFn?: (state: string | undefined) => boolean
  } = {},
) {
  const {
    // 默认空串，表示无 domain 映射，直接展示原始 state
    stateLabelDomain = '',
    // 默认无颜色映射，统一回退到中性灰
    stateColorMap = {} as Record<string, string>,
    // 默认活跃判断：非 off、非 unavailable、非 null/undefined
    isActiveFn = (state: string | undefined) => state !== 'off' && state !== 'unavailable' && state != null,
  } = options
  // 实体友好名称（依赖 entity_id 与 attributes.friendly_name）
  const entityName = computed(() =>
    getEntityDisplayName(
      String((entityRef.value as HaEntityState | null | undefined)?.entity_id ?? ''),
      entityRef.value as HaEntityState | null | undefined,
    ),
  )
  // 当前 state 原始值
  const state = computed(() => (entityRef.value as HaEntityState | null | undefined)?.state)
  // 状态展示文案：优先 domain 映射，无映射或空 state 时回退占位符 '--'
  const stateLabel = computed(() => {
    const s = state.value
    if (!s) return '--'
    if (stateLabelDomain) {
      return popupDomainStateLabel(stateLabelDomain, s)
    }
    return s
  })
  // 状态对应文本色：命中映射则使用映射色，否则统一回退中性灰
  const stateColor = computed(() => {
    const s = state.value
    if (s && stateColorMap[s]) return stateColorMap[s]
    return 'text-slate-500'
  })
  // 活跃状态（用于脉冲指示等）
  const isActive = computed(() => isActiveFn(state.value))
  return { entityName, state, stateLabel, stateColor, isActive }
}

/**
 * 定义实体弹窗组件的 props 工厂。
 *
 * 用于在 `<script setup>` 中通过 `defineProps(useEntityPopupProps())` 复用，
 * 包含实体对象、相对坐标（百分比）、锚点绝对坐标等通用字段。
 *
 * @returns props 定义对象（带 const 断言）
 */
export function defineEntityPopupProps() {
  return {
    // 实体 ID（列表/详情打开时必传，避免 store 尚未 hydrate 时弹窗空白）
    entityId: { type: String, default: '' },
    // 实体原始对象（可能为 null）
    entity: { type: Object as PropType<Record<string, unknown> | null>, default: null },
    // 弹窗中心在视口中的相对位置（百分比），支持 number/string
    xPct: { type: [Number, String] as PropType<number | string>, default: 50 },
    yPct: { type: [Number, String] as PropType<number | string>, default: 50 },
    // 锚点绝对坐标（像素），用于贴附到触发元素
    anchorX: { type: Number as PropType<number | null>, default: null },
    anchorY: { type: Number as PropType<number | null>, default: null },
  } as const
}

/** 实体弹窗组件 props 的类型定义（与 defineEntityPopupProps 对应） */
export type EntityPopupBaseProps = {
  entity: Record<string, unknown> | null
  xPct: number | string
  yPct: number | string
  anchorX: number | null
  anchorY: number | null
  entityId?: string
}

/**
 * 实体弹窗通用基座：liveEntity、entityName、callService。
 *
 * 调用场景：作为各类实体控制弹窗（light/climate/cover 等）的统一初始化入口，
 * 通过 props.entityId 或 props.entity.entity_id 解析实体，并提供 HA 服务调用。
 *
 * @param props 组件 props，至少需提供 entity 或 entityId
 * @returns liveEntity 计算引用、entityRef 别名、entityName、callService 函数
 */
export function useEntityPopupBase(props: EntityPopupBaseProps) {
  // 优先使用显式 entityId，否则回退到 entity 对象内的 entity_id
  const liveEntity = useLiveEntity(
    () => props.entityId || (props.entity?.entity_id as string | undefined),
    () => props.entity,
  )
  // 暴露 entityRef 别名，方便上层使用统一命名
  const entityRef = computed(() => liveEntity.value)
  const { entityName } = useEntityPopupHeader(entityRef)
  const { callService } = useHaEntityService()

  return { liveEntity, entityRef, entityName, callService }
}

/** 灯光控制弹窗组合式函数模块。 */

// `hexToRgb` 的**唯一实现**在 `@/shared/utils/ui/color.util`（3/6 位校验 + 非法回落黑）；
// `light-control-core` 里那份不校验的副本已删（非法输入会产出 NaN 通道）。

/**
 * 灯光控制弹窗组合式函数。
 *
 * 调用场景：LightControlPopup 组件 setup 中调用，提供开关、亮度、色温、
 * 颜色色盘/预设、过渡时间等控制能力。
 *
 * @param props 组件 props，需提供 entity.entity_id
 * @returns 灯光弹窗所需的全部响应式状态与控制方法
 */
export function useLightControlPopup(props: { entityId?: string; entity?: { entity_id?: string } | null }) {
  const { callService } = useHaEntityService()
  // 能力属性（supported_color_modes/Kelvin 范围等），需通过 REST 刷新获取完整值
  const capabilityAttrs = ref<Record<string, unknown>>({})
  const liveEntity = useLiveEntity(
    () => props.entityId || props.entity?.entity_id,
    () => props.entity,
  )
  const resolveEntityId = () => props.entityId || props.entity?.entity_id || liveEntity.value?.entity_id

  /**
   * 通过 REST 刷新灯光能力属性（WS 推送可能不含 min/max_color_temp_kelvin 等字段）。
   * 仅在返回的 entity_id 匹配时更新 capabilityAttrs，避免切换实体时回写旧值。
   */
  async function refreshLightCapabilities() {
    const entityId = resolveEntityId()
    if (!entityId) return
    const fresh = await fetchEntityById(entityId, { refresh: true })
    if (fresh?.entity_id === entityId && fresh) {
      capabilityAttrs.value = pickLightCapabilityAttrs(fresh.attributes as Record<string, unknown>)
    }
  }

  onMounted(refreshLightCapabilities)
  // 实体切换时清空能力属性并重新刷新
  watch(
    () => props.entityId || props.entity?.entity_id || liveEntity.value?.entity_id,
    () => {
      capabilityAttrs.value = {}
      refreshLightCapabilities()
    },
  )

  // 合并实时 attributes 与能力 attributes（能力字段优先，覆盖 WS 不完整值）
  const lightAttrs = computed(() => ({
    ...(liveEntity.value?.attributes ?? {}),
    ...capabilityAttrs.value,
  }))
  const entityRef = computed(() => liveEntity.value)
  const { entityName } = useEntityPopupHeader(entityRef)
  // 是否点亮
  const isOn = computed(() => liveEntity.value?.state === 'on')

  // 是否支持 RGB/HS/XY/RGBW/RGBWW 颜色模式
  const hasRgb = computed(() => lightSupportsRgb(lightAttrs.value?.supported_color_modes))

  // 是否支持色温（color_temp 模式）
  const hasColorTemp = computed(() => lightSupportsColorTemp(lightAttrs.value?.supported_color_modes))

  // 弹窗高度：RGB 模式最高（含色盘），色温模式中等，纯亮度最低
  const popupHeight = computed(() => (hasRgb.value ? 460 : hasColorTemp.value ? 320 : 260))

  // 亮度百分比：brightness(0-255) → 0-100，关灯时为 1（避免滑块完全归零）
  const brightnessPct = computed(() =>
    lightBrightnessPct(liveEntity.value?.state, liveEntity.value?.attributes?.brightness),
  )

  // 是否使用 Kelvin API（部分灯具支持 color_temp_kelvin 而非 mireds）
  const usesKelvinApi = computed(() => {
    const attrs = lightAttrs.value
    return attrs.min_color_temp_kelvin != null || attrs.max_color_temp_kelvin != null
  })

  // 设备 Kelvin 范围、步长、当前 UI 色温值
  const deviceKelvinBounds = computed(() => resolveKelvinBounds(lightAttrs.value))
  const minKelvin = computed(() => deviceKelvinBounds.value.min)
  const maxKelvin = computed(() => deviceKelvinBounds.value.max)
  const colorTempStep = computed(() => resolveColorTempStep(minKelvin.value, maxKelvin.value))
  const colorTempVal = computed(() => resolveEntityColorTempKelvinForUi(lightAttrs.value))

  // 色温滑块：拖拽本地值与提交解耦，释放时调用 setColorTemp
  const {
    localValue: colorTempLocal,
    rangeValue: colorTempRange,
    trackStyle: colorTempTrackStyle,
    onInput: onColorTempInput,
    onChange: onColorTempChange,
    commit: commitColorTemp,
  } = useSliderCommit(colorTempVal, {
    onCommit: (nextColorTemp: number) => setColorTemp(nextColorTemp),
    track: () => ({ min: minKelvin.value, max: maxKelvin.value, step: colorTempStep.value }),
    buildTrackStyle: (value: number, { min, max, step }: { min: number; max: number; step: number }) =>
      colorTempSliderTrackStyle(value, min, max, 'rgba(255,255,255,0.1)', step),
  })

  // 亮度滑块：amber 变体，释放时调用 setBrightness
  const {
    localValue: brightnessLocal,
    rangeValue: brightnessRange,
    trackStyle: brightnessTrackStyle,
    onInput: onBrightnessInput,
    onChange: onBrightnessChange,
    commit: commitBrightness,
  } = useSliderCommit(brightnessPct, {
    onCommit: (nextBrightness: number) => setBrightness(nextBrightness),
    track: () => ({
      min: 1,
      max: 100,
      step: 1,
      variant: 'amber',
      trackColor: 'rgba(255,255,255,0.1)',
    }),
  })

  // 过渡时间（秒）、色盘 DOM 引用、色盘坐标（hueX 0-100，satY 0-100 自上而下）
  const transitionTime = ref(0)
  const paletteRef = ref<HTMLElement | null>(null)
  const hueX = ref(50)
  const satY = ref(50)

  // 过渡时间滑块轨道样式（0-10 秒，步长 0.5）
  const transitionTrackStyle = computed(() =>
    sliderTrackStyle({
      value: transitionTime.value,
      min: 0,
      max: 10,
      step: 0.5,
      color: 'rgba(255,255,255,0.58)',
      colorEnd: 'rgba(255,255,255,0.55)',
      trackColor: 'rgba(255,255,255,0.06)',
    }),
  )
  /**
   * 根据实体 hs_color 或 rgb_color 同步色盘坐标。
   * 优先使用 hs_color，其次将 rgb_color 转为 HS 后映射到色盘。
   */
  function syncColorPickerFromEntity() {
    const entity = liveEntity.value
    const hsColor = entity?.attributes?.hs_color as number[] | undefined
    if (hsColor && hsColor.length >= 2) {
      // hue 0-360 → 0-100，sat 0-100 → 0-100（自上而下取反）
      hueX.value = Math.round(hsColor[0] / 3.6)
      satY.value = 100 - hsColor[1]
      return
    }
    const rgb = entity?.attributes?.rgb_color as number[] | undefined
    if (rgb && rgb.length >= 3) {
      const converted = rgbToHs(rgb[0], rgb[1], rgb[2])
      hueX.value = Math.round(converted.h / 3.6)
      satY.value = 100 - converted.s
    }
  }

  onMounted(syncColorPickerFromEntity)
  watch(() => liveEntity.value?.entity_id, syncColorPickerFromEntity)
  // 实体上报 transition 时同步本地过渡时间
  watch(
    () => liveEntity.value?.attributes?.transition,
    (nextTransition) => {
      if (nextTransition != null && !Number.isNaN(Number(nextTransition))) transitionTime.value = Number(nextTransition)
    },
    { immediate: true },
  )

  // 当前 RGB 颜色：优先 rgb_color，其次 hs_color 转换，缺省暖黄
  const rgbColor = computed(() => {
    const rgb = liveEntity.value?.attributes?.rgb_color as number[] | undefined
    if (rgb && rgb.length >= 3) return { r: rgb[0], g: rgb[1], b: rgb[2] }
    const hsColor = liveEntity.value?.attributes?.hs_color as number[] | undefined
    if (hsColor && hsColor.length >= 2) return hsvToRgb(hsColor[0], hsColor[1])
    return { r: 255, g: 200, b: 100 }
  })

  // HEX 颜色字符串（大写，无 # 前缀）
  const hexColor = computed(() => {
    const { r: red, g: green, b: blue } = rgbColor.value
    return [red, green, blue]
      .map((channel) => channel.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  })

  /**
   * 色盘按下时启动拖拽：注册 mousemove/touchmove/mouseup/touchend 监听，
   * 释放时提交颜色。
   * @param e 鼠标或触摸事件
   */
  /**
   * 色盘拖拽的全局监听清理句柄。
   *
   * 拖拽过程中弹窗可能被关闭或组件卸载（popup 消失、路由切换、实体切换等），
   * 仅在 mouseup/touchend 解绑会漏掉全局监听，之后任意 mouseup 都会对已关闭的
   * 面板下发多余的 light.turn_on。因此把清理句柄保留在作用域上，由
   * onBeforeUnmount 兜底解绑，并禁止卸载后的意外提交。
   */
  let stopPicking: (() => void) | null = null

  function startPickColor(event: MouseEvent | TouchEvent) {
    const rect = paletteRef.value?.getBoundingClientRect()
    if (!rect) return
    if (stopPicking) stopPicking()
    updateFromEvent(event, rect)
    const move = (ev: MouseEvent | TouchEvent) => updateFromEvent(ev, rect)
    const handlePointerUp = (ev: MouseEvent | TouchEvent) => {
      stopPicking?.()
      stopPicking = null
      if (ev) updateFromEvent(ev, rect)
      commitPickerColor()
    }
    // 卸载兜底 / 触摸被打断：只解绑监听，不提交颜色（用户没有完成这次取色）
    stopPicking = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', handlePointerUp)
      window.removeEventListener('touchmove', move)
      window.removeEventListener('touchend', handlePointerUp)
      window.removeEventListener('touchcancel', cancel)
    }
    const cancel = () => {
      stopPicking?.()
      stopPicking = null
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', handlePointerUp)
    window.addEventListener('touchmove', move)
    window.addEventListener('touchend', handlePointerUp)
    // 触摸被系统打断（来电、手势返回等）时结束拖拽，避免监听残留与误提交
    window.addEventListener('touchcancel', cancel)
  }

  onBeforeUnmount(() => {
    stopPicking?.()
    stopPicking = null
  })

  /**
   * 根据事件坐标更新色盘 hueX/satY（clamp 到 0-100）。
   * @param event 鼠标或触摸事件
   * @param rect 色盘 boundingClientRect
   */
  function updateFromEvent(event: MouseEvent | TouchEvent, rect: DOMRect) {
    const point = 'touches' in event ? event.touches[0] : event
    const x = Math.max(0, Math.min(100, ((point.clientX - rect.left) / rect.width) * 100))
    const y = Math.max(0, Math.min(100, ((point.clientY - rect.top) / rect.height) * 100))
    hueX.value = Math.round(x)
    satY.value = Math.round(y)
  }

  /**
   * 色盘键盘操作：左/右调整色相，上/下调整饱和度，Shift 加速，操作即提交。
   * 使色盘满足键盘可用性（role=slider + 方向键）。
   * @param event 键盘事件
   */
  function handlePaletteKeydown(event: KeyboardEvent) {
    const step = event.shiftKey ? 10 : 2
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault()
        hueX.value = Math.max(0, hueX.value - step)
        commitPickerColor()
        break
      case 'ArrowRight':
        event.preventDefault()
        hueX.value = Math.min(100, hueX.value + step)
        commitPickerColor()
        break
      case 'ArrowUp':
        event.preventDefault()
        satY.value = Math.max(0, satY.value - step)
        commitPickerColor()
        break
      case 'ArrowDown':
        event.preventDefault()
        satY.value = Math.min(100, satY.value + step)
        commitPickerColor()
        break
    }
  }

  /** 提交色盘当前颜色（hueX/satY → RGB → HA service） */
  function commitPickerColor() {
    const h = Math.round(hueX.value * 3.6)
    const saturation = 100 - satY.value
    applyRgbColor(hsvToRgb(h, saturation))
  }

  /**
   * 下发 RGB 颜色到 HA light.turn_on。
   * @param param0 RGB 对象
   */
  async function applyRgbColor({ r: red, g: green, b: blue }: { r: number; g: number; b: number }) {
    const entityId = liveEntity.value?.entity_id
    if (!entityId) return
    await callService(
      'light',
      'turn_on',
      entityId,
      buildLightTurnOnData({ rgbColor: [red, green, blue] }),
      '设置颜色失败',
    )
  }

  /**
   * 应用预设颜色：更新色盘坐标并立即下发 RGB。
   * @param hex HEX 字符串
   */
  function applyPresetColor(hex: string) {
    const { r: red, g: green, b: blue } = hexToRgb(hex)
    const hsColor = rgbToHs(red, green, blue)
    hueX.value = Math.round(hsColor.h / 3.6)
    satY.value = 100 - hsColor.s
    applyRgbColor({ r: red, g: green, b: blue })
  }

  /** 切换灯光开关 */
  async function togglePower() {
    const entityId = liveEntity.value?.entity_id
    if (!entityId) return
    const svc = isOn.value ? 'turn_off' : 'turn_on'
    await callService('light', svc, entityId, undefined, '开关失败')
  }

  /**
   * 设置亮度百分比。
   * @param brightnessValue 0-100
   */
  async function setBrightness(brightnessValue: number) {
    const entityId = liveEntity.value?.entity_id
    if (!entityId) return
    // HA 同时接受 brightness_pct 与 brightness；核心统一转 brightness 位
    await callService(
      'light',
      'turn_on',
      entityId,
      { brightness_pct: brightnessValue, brightness: lightBrightnessFromPct(brightnessValue) },
      '亮度设置失败',
    )
  }
  /**
   * 构建色温 service data：支持 Kelvin API 的设备用 color_temp_kelvin，
   * 否则转换为 mireds（color_temp）并 clamp 到设备范围。
   * @param kelvin Kelvin 色温值
   * @returns service payload
   */
  function buildColorTempServiceData(kelvin: number) {
    const attrs = lightAttrs.value
    const k = clampKelvinForDevice(kelvin, attrs) ?? kelvin
    if (usesKelvinApi.value) return { color_temp_kelvin: k }
    const minM = Number(readAttrNumber(attrs, 'min_mireds', 'min_mired') ?? 153)
    const maxM = Number(readAttrNumber(attrs, 'max_mireds', 'max_mired') ?? 500)
    const mireds = Math.max(minM, Math.min(maxM, kelvinToMireds(Number(k)) ?? minM))
    return { color_temp: mireds }
  }

  /**
   * 从 attributes 中按候选 key 顺序读取第一个有效数值。
   * @param attrs 属性对象
   * @param keys 候选 key 列表
   * @returns 第一个有效数值或 null
   */
  function readAttrNumber(attrs: Record<string, unknown>, ...keys: string[]) {
    for (const key of keys) {
      if (attrs[key] == null) continue
      const numericValue = Number(attrs[key])
      if (Number.isFinite(numericValue)) return numericValue
    }
    return null
  }

  /**
   * 设置色温（Kelvin）。
   * @param colorTempValue Kelvin 色温值
   */
  async function setColorTemp(colorTempValue: number) {
    const entityId = liveEntity.value?.entity_id
    if (!entityId) return
    await callService('light', 'turn_on', entityId, buildColorTempServiceData(colorTempValue), '色温设置失败')
  }

  /** 应用过渡时间到灯光 */
  async function applyTransition() {
    const entityId = liveEntity.value?.entity_id
    if (!entityId) return
    await callService('light', 'turn_on', entityId, { transition: transitionTime.value }, '过渡设置失败')
  }

  return {
    liveEntity,
    entityName,
    isOn,
    popupHeight,
    hasRgb,
    hasColorTemp,
    minKelvin,
    maxKelvin,
    colorTempStep,
    colorTempLocal,
    colorTempRange,
    colorTempTrackStyle,
    onColorTempInput,
    onColorTempChange,
    commitColorTemp,
    brightnessLocal,
    brightnessRange,
    brightnessTrackStyle,
    onBrightnessInput,
    onBrightnessChange,
    commitBrightness,
    transitionTime,
    transitionTrackStyle,
    paletteRef,
    hueX,
    satY,
    rgbColor,
    hexColor,
    colorPresets: COLOR_PRESETS,
    startPickColor,
    handlePaletteKeydown,
    applyPresetColor,
    togglePower,
    applyTransition,
  }
}

/** 媒体播放器控制组合式函数模块。 */

/** 媒体播放器数据源：可为 entity_id 字符串、实体对象、null/undefined */
type MediaPlayerSource =
  | string
  | { entity_id?: string; state?: string; attributes?: HaEntityState['attributes'] }
  | null
  | undefined

/**
 * MediaPlayerModal 与 MediaPlayerPopup 共用的 media_player 控制逻辑。
 *
 * 调用场景：MediaPlayerModal/MediaPlayerPopup 组件 setup 中调用，
 * 提供播放控制、进度计算、音量调节、元数据/歌词展示等全部响应式状态。
 *
 * @param source entity_id 或实体对象
 * @returns 媒体播放器控制所需的全部响应式状态与控制方法
 */
export function useMediaPlayerControls(
  source: MaybeRef<MediaPlayerSource> | (() => MediaPlayerSource) | Ref<MediaPlayerSource>,
) {
  const entitiesStore = useEntitiesStore()
  const haConnectionStore = useHaConnectionStore()
  /** 解析数据源（兼容 ref/getter/ref 值） */
  function resolveSource() {
    if (typeof source === 'function') return source()
    return unref(source)
  }
  // 当前 entity_id：字符串直接取，对象取 entity_id 字段
  const entityId = computed(() => {
    const s = resolveSource()
    if (typeof s === 'string') return s
    return s?.entity_id || ''
  })
  // 实体快照：优先 store 实时值，回退到外部传入对象
  const entity = computed(() => {
    const id = entityId.value
    if (!id) return null
    const fromStore = entitiesStore.entities[id]
    if (fromStore) return fromStore
    const s = resolveSource()
    return typeof s === 'object' && s?.entity_id ? s : null
  })
  // 状态：缺省 'off'
  const state = computed(() => entity.value?.state || 'off')
  // attributes：缺省空对象
  const attrs = computed(() => (entity.value?.attributes || {}) as Record<string, unknown>)
  const isPlaying = computed(() => state.value === 'playing')
  const isMuted = computed(() => !!attrs.value.is_volume_muted)
  // HA media_player 支持特性位掩码（MediaPlayerEntityFeature）
  const MEDIA_FEATURE = {
    PAUSE: 1,
    SEEK: 2,
    VOLUME_SET: 4,
    VOLUME_MUTE: 8,
    PREVIOUS_TRACK: 16,
    NEXT_TRACK: 32,
    TURN_ON: 128,
    TURN_OFF: 256,
    PLAY_MEDIA: 512,
    VOLUME_STEP: 1024,
    SELECT_SOURCE: 2048,
    STOP: 4096,
    CLEAR_PLAYLIST: 8192,
    PLAY: 16384,
    SHUFFLE_SET: 32768,
    SELECT_SOUND_MODE: 65536,
    BROWSE_MEDIA: 131072,
    REPEAT_SET: 262144,
    GROUPING: 524288,
  } as const
  // 当前实体支持特性位掩码
  const supportedFeatures = computed(() => Number(attrs.value.supported_features) || 0)
  /** 判断是否支持指定特性位 */
  function hasFeature(bit: number) {
    return (supportedFeatures.value & bit) === bit
  }
  // 各类控制能力（按特性位判断）
  const supports = computed(() => ({
    pause: hasFeature(MEDIA_FEATURE.PAUSE),
    play: hasFeature(MEDIA_FEATURE.PLAY),
    seek: hasFeature(MEDIA_FEATURE.SEEK),
    volumeSet: hasFeature(MEDIA_FEATURE.VOLUME_SET),
    volumeMute: hasFeature(MEDIA_FEATURE.VOLUME_MUTE),
    previousTrack: hasFeature(MEDIA_FEATURE.PREVIOUS_TRACK),
    nextTrack: hasFeature(MEDIA_FEATURE.NEXT_TRACK),
    selectSource: hasFeature(MEDIA_FEATURE.SELECT_SOURCE),
    shuffleSet: hasFeature(MEDIA_FEATURE.SHUFFLE_SET),
    repeatSet: hasFeature(MEDIA_FEATURE.REPEAT_SET),
  }))
  // 媒体封面图：通过 resolveHaEntityPicture 拼接 HA base URL
  const entityPicture = computed(() => {
    const pic = attrs.value.entity_picture
    if (!pic) return null
    return resolveHaEntityPicture(haConnectionStore.baseUrl, String(pic))
  })
  // 标题：优先 media_title，否则按状态展示中文文案
  const title = computed(() => {
    const mediaTitle = attrs.value.media_title
    if (mediaTitle) return String(mediaTitle)
    const s = state.value
    if (s === 'playing') return '播放中...'
    if (s === 'paused') return '已暂停'
    if (s === 'off' || s === 'standby') return '已关机'
    return '就绪'
  })
  // 媒体元数据
  const mediaArtist = computed(() => String(attrs.value.media_artist || ''))
  const mediaAlbum = computed(() => String(attrs.value.media_album_name || ''))
  const appName = computed(() => String(attrs.value.app_name || ''))
  const contentType = computed(() => String(attrs.value.media_content_type || ''))
  const deviceName = computed(() => String(attrs.value.friendly_name || ''))
  // 副标题：优先 artist · album，其次 series · episode，最后 channel
  const subtitle = computed(() => {
    const parts = [mediaArtist.value, mediaAlbum.value].filter(Boolean)
    if (parts.length) return parts.join(' · ')
    const series = attrs.value.media_series_title
    const episode = attrs.value.media_episode
    const channel = attrs.value.media_channel
    if (series || episode) return [series, episode].filter(Boolean).map(String).join(' · ')
    if (channel) return String(channel)
    return ''
  })
  /** 解析歌词：支持 lyrics / media_lyrics / lyric / lrc 等常见 HA 属性 */
  const lyricsLines = computed(() => {
    const raw = attrs.value.lyrics ?? attrs.value.media_lyrics ?? attrs.value.lyric ?? attrs.value.lrc ?? null
    if (!raw) return []
    if (Array.isArray(raw)) {
      return raw.map((line) => String(line).trim()).filter(Boolean)
    }
    if (typeof raw === 'string') {
      // 字符串歌词：按行拆分，去除 LRC 时间戳 [mm:ss.xxx]
      return raw
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.replace(/^\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]\s*/, ''))
    }
    return []
  })
  const hasLyrics = computed(() => lyricsLines.value.length > 0)
  // 媒体总时长（秒）
  const mediaDuration = computed(() => Number(attrs.value.media_duration) || 0)
  const hasProgress = computed(() => mediaDuration.value > 0)
  const sourceList = computed(() =>
    Array.isArray(attrs.value.source_list) ? (attrs.value.source_list as string[]) : [],
  )
  // 实时播放位置（秒）+ seek 状态（拖拽中暂停外部更新）
  const livePosition = ref(0)
  const isSeeking = ref(false)
  const seekPreviewPct = ref<number | null>(null)
  /** requestAnimationFrame 句柄 */
  let rafId: number | null = null
  /**
   * 计算实时播放位置：基于 media_position + media_position_updated_at 推算（播放中持续累加）。
   * @returns 当前播放秒数（clamp 到 0~duration）
   */
  function resolveLivePosition() {
    const duration = mediaDuration.value
    if (!duration) return 0
    let pos = Number(attrs.value.media_position) || 0
    if (state.value === 'playing' && attrs.value.media_position_updated_at) {
      const updatedAt = new Date(String(attrs.value.media_position_updated_at)).getTime()
      pos += (Date.now() - updatedAt) / 1000
    }
    return Math.min(duration, Math.max(0, pos))
  }
  /** rAF tick：非拖拽时更新 livePosition，循环调度 */
  function tick() {
    if (!hasProgress.value) {
      livePosition.value = 0
      rafId = requestAnimationFrame(tick)
      return
    }
    if (!isSeeking.value) livePosition.value = resolveLivePosition()
    rafId = requestAnimationFrame(tick)
  }
  /** 启动 rAF 播放循环 */
  function startPlaybackLoop() {
    if (rafId != null) cancelAnimationFrame(rafId)
    rafId = requestAnimationFrame(tick)
  }
  /** 停止 rAF 播放循环 */
  function stopPlaybackLoop() {
    if (rafId != null) cancelAnimationFrame(rafId)
    rafId = null
  }
  // hasProgress 变化时启停播放循环
  watch(
    hasProgress,
    (active) => {
      stopPlaybackLoop()
      if (active) startPlaybackLoop()
      else livePosition.value = 0
    },
    { immediate: true },
  )
  watch(entityId, () => {
    isSeeking.value = false
    seekPreviewPct.value = null
    startPlaybackLoop()
  })
  onUnmounted(stopPlaybackLoop)
  // 进度百分比：拖拽中使用预览值，否则用 livePosition / duration
  const progressPct = computed(() => {
    if (!hasProgress.value) return 0
    if (isSeeking.value && seekPreviewPct.value != null) return seekPreviewPct.value
    return Math.min(100, (livePosition.value / mediaDuration.value) * 100)
  })
  // seekVal 双向：get 取进度百分比，set 仅更新预览（不立即下发）
  const seekVal = computed({
    get: () => progressPct.value,
    set: (v) => {
      seekPreviewPct.value = v
    },
  })
  // 进度条填充样式（media 变体）
  const progressFillStyleComputed = computed(() => progressFillStyle({ value: progressPct.value, variant: 'media' }))
  /**
   * 调用 media_player service，失败时统一 notifyError。
   * @param service media_player.* service 名（如 media_play/media_pause）
   * @param data service payload
   */
  async function callMedia(service: string, data?: Record<string, unknown>) {
    const id = entityId.value
    if (!id) return
    try {
      await entitiesStore.callService('media_player', service, id, data, false)
    } catch (e) {
      notifyError(e, '媒体控制')
    }
  }
  // 音量源：volume_level(0-1) → 0-100（与属性展示、乐观写入共用同一份口径）
  const volumeSource = computed(() => volumeLevelToPercent(attrs.value.volume_level) ?? 0)
  // 音量滑块：拖拽本地值与提交解耦，释放时调用 volume_set
  const {
    localValue: sliderVolume,
    rangeValue: sliderVolumeRange,
    isDragging: isVolumeDragging,
    trackStyle: volumeTrackStyle,
    onInput: onVolumeInput,
    onChange: onVolumeChange,
    commit: commitVolume,
  } = useSliderCommit(volumeSource, {
    onCommit: (val: number) => callMedia('volume_set', { volume_level: volumeLevelFromPercent(val) }),
    track: () => ({
      min: 0,
      max: 100,
      step: 1,
      variant: 'media',
      trackColor: 'rgba(255,255,255,0.1)',
    }),
  })
  /**
   * 格式化时间为 m:ss 或 h:mm:ss。
   * @param seconds 秒数
   * @returns 格式化后的时间字符串
   */
  function formatTime(seconds: number | null | undefined) {
    if (!seconds || Number.isNaN(seconds)) return '0:00'
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    const h = Math.floor(seconds / 3600)
    if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${m}:${String(s).padStart(2, '0')}`
  }
  // 当前时间标签：拖拽中显示预览时间
  const currentTimeLabel = computed(() => {
    if (isSeeking.value && seekPreviewPct.value != null) {
      return formatTime((seekPreviewPct.value / 100) * mediaDuration.value)
    }
    return formatTime(livePosition.value)
  })
  // 总时长标签
  const totalTimeLabel = computed(() => formatTime(mediaDuration.value))
  /** 切换播放/暂停 */
  function togglePlay() {
    callMedia(state.value === 'playing' ? 'media_pause' : 'media_play')
  }
  /** 上一曲 */
  function prevTrack() {
    callMedia('media_previous_track')
  }
  /** 下一曲 */
  function nextTrack() {
    callMedia('media_next_track')
  }
  /** 切换静音 */
  function toggleMute() {
    callMedia('volume_mute', { is_volume_muted: !attrs.value.is_volume_muted })
  }
  /** 切换随机播放 */
  function toggleShuffle() {
    callMedia('shuffle_set', { shuffle: !attrs.value.shuffle })
  }
  /** 切换循环模式：off → one → all → off */
  function toggleRepeat() {
    const current = attrs.value.repeat || 'off'
    const next = current === 'off' ? 'one' : current === 'one' ? 'all' : 'off'
    callMedia('repeat_set', { repeat: next })
  }
  /**
   * 切换音源。
   * @param sourceId 音源名称
   */
  function setSource(sourceId: string) {
    callMedia('select_source', { source: sourceId })
  }
  /**
   * seek 输入（拖拽中）：更新预览百分比与本地 livePosition。
   * @param pct 0-100
   */
  function onSeekInput(pct: number) {
    isSeeking.value = true
    seekPreviewPct.value = pct
    livePosition.value = (pct / 100) * Number(mediaDuration.value)
  }
  /**
   * seek 拖拽（与 onSeekInput 同义，供 slider 拖拽事件调用）。
   * @param pct 0-100
   */
  function onSeekDrag(pct: number) {
    onSeekInput(pct)
  }
  /**
   * 从百分比提交 seek：清除拖拽状态，下发 media_seek。
   * @param pct 0-100
   */
  function seekFromPct(pct: number) {
    isSeeking.value = false
    seekPreviewPct.value = null
    const pos = Math.round((pct / 100) * Number(mediaDuration.value))
    livePosition.value = pos
    callMedia('media_seek', { seek_position: pos })
  }
  /** seek 变更（释放）提交 */
  function onSeekChange() {
    seekFromPct(seekVal.value)
  }
  return {
    entity,
    entityId,
    state,
    attrs,
    isPlaying,
    isMuted,
    supports,
    entityPicture,
    title,
    subtitle,
    mediaArtist,
    mediaAlbum,
    appName,
    contentType,
    deviceName,
    lyricsLines,
    hasLyrics,
    mediaDuration,
    hasProgress,
    progressPct,
    seekVal,
    livePosition,
    isSeeking,
    seekPreviewPct,
    sliderVolume,
    sliderVolumeRange,
    isVolumeDragging,
    volumeTrackStyle,
    progressFillStyle: progressFillStyleComputed,
    currentTimeLabel,
    totalTimeLabel,
    sourceList,
    formatTime,
    togglePlay,
    prevTrack,
    nextTrack,
    toggleMute,
    onVolumeInput,
    onVolumeChange,
    commitVolume,
    toggleShuffle,
    toggleRepeat,
    setSource,
    onSeekDrag,
    seekFromPct,
    onSeekChange,
    onSeekInput,
    startPlaybackLoop,
    stopPlaybackLoop,
  }
}

/**
 * @file useMediaPlayerModalDisplay.ts
 * @module frontend/src/composables
 */

interface MediaPlayerModalDisplayDeps {
  state: Ref<string | undefined>
  attrs: Ref<Record<string, unknown> | null | undefined>
  modalSubtitle: Ref<string>
  mediaArtist: Ref<string>
  mediaAlbum: Ref<string>
  appName: Ref<string>
  hasProgress: Ref<boolean>
  isSeeking: Ref<boolean>
  seekPreviewPct: Ref<number | null | undefined>
  mediaDuration: Ref<number>
  currentTime: Ref<string>
  formatTime: (seconds: number) => string
  entityId: Ref<string | undefined>
  showMore: Ref<boolean>
  ttsText: Ref<string>
  onClose: () => void
}

export function useMediaPlayerModalDisplay(deps: MediaPlayerModalDisplayDeps) {
  const {
    state,
    attrs,
    modalSubtitle,
    mediaArtist,
    mediaAlbum,
    appName,
    hasProgress,
    isSeeking,
    seekPreviewPct,
    mediaDuration,
    currentTime,
    formatTime,
    entityId,
    showMore,
    ttsText,
    onClose,
  } = deps

  const { speak: speakTtsMessage } = useTtsSpeak()

  const hasTts = computed(() => !!entityId.value?.startsWith('media_player.'))

  const stateLabel = computed(() => {
    const s = state.value
    if (s === 'playing') return '播放中...'
    if (s === 'paused') return '已暂停'
    if (s === 'off' || s === 'standby') return '已关机'
    return '就绪'
  })

  const stateLabelUpper = computed(() => stateLabel.value.replace(/\.{3}$/, '').toUpperCase())

  const stateDotClass = computed(() => {
    const s = state.value
    if (s === 'playing') return 'media-modal__status-dot--playing'
    if (s === 'paused') return 'media-modal__status-dot--paused'
    if (s === 'off' || s === 'standby' || s === 'unavailable') return 'media-modal__status-dot--off'
    return 'media-modal__status-dot--idle'
  })

  const displaySubtitle = computed(() => {
    if (modalSubtitle.value) return modalSubtitle.value
    if (state.value === 'off' || state.value === 'standby') return '已关机'
    return '就绪'
  })

  const repeatLabel = computed(() => {
    const r = attrs.value?.repeat
    if (r === 'one') return '单曲循环'
    if (r === 'all') return '列表循环'
    return '关闭循环'
  })

  const metaChips = computed(() => {
    const chips: Array<{ key: string; label: string; value: string }> = []
    if (mediaArtist.value) chips.push({ key: 'artist', label: mediaArtist.value, value: mediaArtist.value })
    if (mediaAlbum.value) chips.push({ key: 'album', label: mediaAlbum.value, value: mediaAlbum.value })
    if (appName.value) chips.push({ key: 'app', label: appName.value, value: appName.value })
    return chips
  })

  const seekDisplayCurrent = computed(() => {
    if (!hasProgress.value) return '0:00'
    if (isSeeking.value && seekPreviewPct.value != null) {
      return formatTime((seekPreviewPct.value / 100) * mediaDuration.value)
    }
    return currentTime.value
  })

  function closeAll() {
    showMore.value = false
    onClose()
  }

  async function speakTts() {
    const id = entityId.value
    if (!id || !ttsText.value.trim()) return
    const r = await speakTtsMessage(ttsText.value, { mediaPlayer: id, manual: true })
    if (r.ok) ttsText.value = ''
    else notifyError(r.message || new Error('TTS 播报失败'), 'TTS 播报')
  }

  return {
    hasTts,
    stateLabel,
    stateLabelUpper,
    stateDotClass,
    displaySubtitle,
    repeatLabel,
    metaChips,
    seekDisplayCurrent,
    closeAll,
    speakTts,
  }
}
