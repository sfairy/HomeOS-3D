/**
 * 温控控制核心（无 Vue）：HVAC / 风扇 / 预设标签与展示文案。
 * 栈 A ClimateControlPopup 与未来栈 C·D 共用。
 */

export const HVAC_MODE_LABELS: Record<string, string> = {
  auto: '自动',
  cool: '制冷',
  dry: '除湿',
  fan_only: '送风',
  heat: '制热',
  off: '关闭',
}

export const FAN_MODE_LABELS: Record<string, string> = {
  auto: '自动',
  high: '高风',
  low: '低风',
  medium: '中风',
}

export const PRESET_MODE_LABELS: Record<string, string> = {
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

export const FAN_MODE_EMOJI: Record<string, string> = {
  auto: '🤖',
  low: '🌬',
  medium: '💨',
  high: '🌪',
}

export const PRESET_MODE_EMOJI: Record<string, string> = {
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
export function climateAttrStringList(
  attributes: Record<string, unknown> | undefined,
  key: string,
): string[] {
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
