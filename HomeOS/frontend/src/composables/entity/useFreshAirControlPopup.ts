/**
 * @module useFreshAirControlPopup
 * @description 全热交换器 / 新风系统控制弹窗逻辑（fan / climate）。
 *
 * 依据实体属性：
 * - percentage → 风速档位
 * - preset_mode / preset_modes → 运行模式
 */
import { computed, type ComputedRef } from 'vue'
import { getEntityDomain } from '@homeos/shared'
import {
  useEntityPopupBase,
  type EntityPopupBaseProps,
} from '@/composables/entity/useEntityPopupBase'
import { useSliderCommit } from '@/composables/entity/useSliderCommit'
import { clampInRange } from '@/utils/ui/progress-bar.util'
import {
  buildSpeedPercents,
  buildSpeedLevels,
  nearestSpeedPercent,
  resolveSpeedLevel,
} from '@/utils/entity/fresh-air-control.util'

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((v) => String(v)).filter(Boolean)
}

/** useFreshAirControlPopup：函数，按签名入参返回处理结果。 */
export function useFreshAirControlPopup(props: EntityPopupBaseProps) {
  const { liveEntity, entityName, callService } = useEntityPopupBase(props)

  const attrs = computed(() => (liveEntity.value?.attributes || {}) as Record<string, unknown>)
  const entityId = computed(() => String(liveEntity.value?.entity_id || ''))
  const domain = computed(() => getEntityDomain(entityId.value) || 'fan')

  const isOn = computed(() => {
    const s = liveEntity.value?.state
    return s !== 'off' && s !== 'unavailable' && s != null
  })

  const percentage = computed(() => {
    const v = Number(attrs.value.percentage)
    return Number.isFinite(v) ? clampInRange(v, 0, 100, 0) : 0
  })

  const speedPercents = computed(() => buildSpeedPercents())
  const speedLevels = computed(() => buildSpeedLevels())
  const speedStep = computed(() => 1)

  const presetMode = computed(() => {
    const v = attrs.value.preset_mode
    return v != null && String(v).trim() ? String(v) : ''
  })

  const presetModes = computed(() => {
    const list = asStringList(attrs.value.preset_modes)
    if (list.length) return list
    return []
  })

  const hasPercentage = computed(
    () => attrs.value.percentage != null || Number(attrs.value.percentage_step) > 0,
  )

  const speedSource = computed(() => nearestSpeedPercent(percentage.value, speedPercents.value))

  const {
    localValue: speedLocal,
    rangeValue: speedRange,
    trackStyle: speedTrackStyle,
    onInput: onSpeedInput,
    onChange: onSpeedChange,
    commit: commitSpeed,
  } = useSliderCommit(speedSource, {
    onCommit: (val) => setPercentage(Number(val)),
    track: () => ({
      min: 0,
      max: 100,
      step: speedStep.value,
      color: '#2dd4bf',
    }),
  })

  const liveSpeedPct = computed(() => {
    const local = Number(speedLocal.value)
    return Number.isFinite(local) ? local : percentage.value
  })

  const activeLevel = computed(() => resolveSpeedLevel(liveSpeedPct.value))
  const activeGearIndex = computed(() => activeLevel.value.index)

  const currentSpeedLabel = computed(() => {
    if (!isOn.value) return '已关闭'
    return activeLevel.value.label
  })

  const displayGearName = computed(() => {
    if (!isOn.value) return '—'
    return activeLevel.value.label
  })

  const displayPercent = computed(() => Math.round(liveSpeedPct.value))

  /** 自动档不展示百分比数值 */
  const speedPercentLabel = computed(() => {
    if (!isOn.value) return '风速'
    if (!activeLevel.value.showPercent) return '风速'
    return `${displayPercent.value}%`
  })

  async function togglePower() {
    const svc = isOn.value ? 'turn_off' : 'turn_on'
    await callService(domain.value, svc, entityId.value, undefined, '新风开关失败')
  }

  async function setPercentage(raw: number) {
    const pct = nearestSpeedPercent(clampInRange(raw, 0, 100, 0), speedPercents.value)
    if (!isOn.value) {
      await callService(domain.value, 'turn_on', entityId.value, { percentage: pct }, '开启新风失败')
      return
    }
    await callService(
      domain.value,
      'set_percentage',
      entityId.value,
      { percentage: pct },
      '设置风速失败',
    )
  }

  async function setSpeedGear(pct: number) {
    await setPercentage(pct)
  }

  async function nudgeSpeed(deltaGears: number) {
    const speeds = speedPercents.value
    if (!speeds.length) return
    const next = Math.min(speeds.length - 1, Math.max(0, activeGearIndex.value + deltaGears))
    await setPercentage(speeds[next])
  }

  async function setPreset(mode: string) {
    await callService(
      domain.value,
      'set_preset_mode',
      entityId.value,
      { preset_mode: mode },
      '设置模式失败',
    )
  }

  return {
    liveEntity,
    entityName,
    isOn,
    percentage,
    speedPercents,
    speedLevels,
    speedStep,
    currentSpeedLabel,
    activeGearIndex,
    displayGearName,
    displayPercent,
    speedPercentLabel,
    speedLocal: speedLocal as ComputedRef<number>,
    speedRange,
    speedTrackStyle,
    onSpeedInput,
    onSpeedChange,
    commitSpeed,
    hasPercentage,
    presetMode,
    presetModes,
    togglePower,
    setPercentage,
    setSpeedGear,
    nudgeSpeed,
    setPreset,
  }
}
