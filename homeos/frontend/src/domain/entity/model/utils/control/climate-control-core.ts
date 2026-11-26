/**
 * 温控控制核心（无 Vue）：HVAC / 风扇 / 预设标签与展示文案。
 * 栈 A ClimateControlPopup 与未来栈 C·D 共用。
 */

import { HVAC_MODE_LABELS, FAN_MODE_LABELS, PRESET_MODE_LABELS } from '@/kernel/constants/climate-labels'

export { HVAC_MODE_LABELS, FAN_MODE_LABELS, PRESET_MODE_LABELS }

/**
 * 开关态 / 运行态判据的**唯一实现**在 `@/shared/device/climate-power`。
 *
 * 这里再导出一层是给 Vue 侧（弹窗、仪表盘卡片）用的固定入口：它们与 3D 面板共用
 * 同一份判据，不必各自写 `state === 'off'`。别在本文件里重新实现这几个函数 ——
 * 浴霸「主开关关着但仍在换气」这类语义只有一处能改对。
 */
export {
  bathHeaterModeUsesAirflow,
  bathHeaterPresentationMode,
  climateIsPoweredOn,
  climateIsRunning,
  climatePresentationMode,
  normalizeClimateModeKey,
  WATER_HEATER_HEATING_TOLERANCE_C,
  type ClimateDeviceTypeInput,
  type ClimateRenderType,
  type ClimateStateSnapshot,
} from '@/domain/entity/model/climate-power'

const FAN_MODE_EMOJI: Record<string, string> = {
  auto: '🤖',
  low: '🌬',
  medium: '💨',
  high: '🌪',
}

const PRESET_MODE_EMOJI: Record<string, string> = {
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

export function climateFanModeLabel(mode: string | null | undefined): string {
  if (mode == null || mode === '') return '—'
  const emoji = FAN_MODE_EMOJI[mode]
  return emoji ? `${emoji} ${FAN_MODE_LABELS[mode] ?? mode}` : mode
}

export function climateHvacStateLabel(state: string | undefined): string | undefined {
  if (!state) return state
  return HVAC_MODE_LABELS[state] ?? state
}

export function climatePresetModeLabel(mode: string | null | undefined): string {
  if (mode == null || mode === '') return '—'
  const emoji = PRESET_MODE_EMOJI[mode]
  const label = PRESET_MODE_LABELS[mode] ?? mode
  return emoji ? `${emoji} ${label}` : label
}

/** 从 attributes 读字符串列表（hvac_modes / fan_modes 等） */
export function climateAttrStringList(attributes: Record<string, unknown> | undefined, key: string): string[] {
  const raw = attributes?.[key]
  return Array.isArray(raw) ? (raw as string[]) : []
}

export function climateHasDualSetpoint(attributes: Record<string, unknown> | undefined): boolean {
  if (!attributes) return false
  return attributes.target_temp_low !== undefined && attributes.target_temp_high !== undefined
}

export function climateHasTargetTemp(attributes: Record<string, unknown> | undefined): boolean {
  if (!attributes) return false
  return (
    attributes.temperature !== undefined ||
    attributes.target_temp_low !== undefined ||
    attributes.target_temp_high !== undefined
  )
}
