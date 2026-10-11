/**
 * 安防区域模式工具模块。
 *
 * 职责：
 * - 前端镜像后端 zoneType × mode 告警逻辑，判定来源委托 @homeos/shared；
 * - 提供区域模式提示文案、传感器告警状态判定、传感器状态标签；
 * - 重新导出共享的 ArmingMode/SecurityZoneType 类型与 shouldZoneAlarmInMode 函数。
 *
 * 依赖：SecurityArmingMode、SecurityZoneType、shouldZoneAlarmInMode（@homeos/shared）。
 */
/** 前端镜像后端 zoneType × mode 告警逻辑 — 判定自 @homeos/shared */
import {
  type SecurityArmingMode,
  type SecurityZoneType,
  shouldZoneAlarmInMode,
} from '@homeos/shared'

/** 安防布防模式类型（armed_away/armed_home/armed_night/disarmed） */
export type ArmingMode = SecurityArmingMode
export type { SecurityZoneType }
export { shouldZoneAlarmInMode }

/**
 * 根据布防模式与区域类型生成提示文案。
 *
 * @param mode 当前布防模式
 * @param zoneType 区域类型（perimeter/interior/all）
 * @returns 提示文案，说明该区域在当前模式下是否参与告警
 */
export function zoneModeHint(mode: string, zoneType: SecurityZoneType | undefined) {
  if (mode === 'disarmed') return '撤防中 · 不触发告警'
  if (shouldZoneAlarmInMode(mode, zoneType)) {
    if (mode === 'armed_away') return '外出模式 · 参与告警'
    if (mode === 'armed_home') return '居家模式 · 参与告警'
    if (mode === 'armed_night') return '夜间模式 · 参与告警'
    return '当前模式 · 参与告警'
  }
  return '居家/夜间 · 室内区静默'
}

/**
 * 判定传感器是否处于告警状态。
 *
 * 支持多种 HA 状态：
 * - on/wet/open：直接判定告警；
 * - 数值型状态：解析为数字，大于 0 视为告警；
 * - off/closed：正常；
 * - unavailable/空：非告警。
 *
 * @param state 传感器状态字符串
 * @returns true 表示处于告警状态
 */
export function isSensorAlertState(state: string | undefined) {
  if (!state || state === 'unavailable') return false
  return (
    state === 'on' ||
    state === 'wet' ||
    state === 'open' ||
    (state !== 'off' &&
      state !== 'closed' &&
      !Number.isNaN(parseFloat(String(state))) &&
      parseFloat(String(state)) > 0)
  )
}

/**
 * 生成传感器状态展示标签。
 *
 * @param state 原始状态字符串
 * @param alert 是否处于告警状态
 * @param offline 是否离线
 * @returns 中文状态标签
 */
export function sensorStateLabel(state: string | undefined, alert: boolean, offline: boolean) {
  if (offline) return '离线'
  if (alert) return '告警'
  if (state === 'off' || state === 'closed') return '正常'
  return state || '—'
}