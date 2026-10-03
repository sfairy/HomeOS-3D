/**
 * 联动器 service call 动作参数面板工具
 *
 * 职责：
 * - 判定动作是否支持参数面板（light / climate / cover / media_player / fan / humidifier / lock / input_number / input_select / alarm_control_panel）。
 * - 参数面板与 action.data（JSON 字符串）的双向同步。
 * - 面板展开 / 折叠 / 重置等 UI 状态控制。
 *
 * 依赖：
 * - ./yaml-preview-helpers.util 的 buildServiceDataFromPanel。
 * - ../ui/progress-bar.util 的 haColorTempToKelvin（mired → kelvin）。
 * - ./domain-capabilities.util 的 domain/service 识别。
 *
 * 注意：domain / service / data key 为 HA 配置值，不翻译。
 */
import { buildServiceDataFromPanel } from './yaml-preview-helpers.util'
import { haColorTempToKelvin } from '../ui/progress-bar.util'
import { isLightService, isCoverService, isMediaService } from './domain-capabilities.util'

/** 联动器 call_service 动作的精简结构（兼容 showParamsKey 动态键） */
export interface OrchestratorServiceAction {
  domain?: string
  service?: string
  data?: string
  entityId?: string
  [showParamsKey: string]: unknown
}

/** 参数面板字段集合：覆盖灯具/恒温/窗帘/媒体/风扇/加湿器/门锁/输入类设备 */
export interface ServiceDataPanel {
  brightness_pct?: number
  color_temp?: number
  transition?: number
  rgb_color?: string
  effect?: string
  temperature?: number
  position?: number
  volume_level?: number
  percentage?: number
  humidity?: number
  hvac_mode?: string
  code?: string
  value?: number
  option?: string
}

/** call_service 动作是否支持参数面板（按 domain+service 白名单匹配） */
export function supportsServiceDataBuilder(action: OrchestratorServiceAction | null | undefined) {
  if (!action?.domain) return false
  const a = action
  const is = (dom: string, svc: string) => a.domain === dom && a.service === svc
  const isLock = () => a.domain === 'lock' && ['lock', 'unlock', 'open'].includes(String(a.service))
  const isAlarm = () => a.domain === 'alarm_control_panel' && String(a.service).startsWith('alarm_')
  return (
    is('light', 'turn_on') ||
    is('climate', 'set_temperature') ||
    is('cover', 'set_cover_position') ||
    is('media_player', 'volume_set') ||
    is('fan', 'set_percentage') ||
    is('humidifier', 'set_humidity') ||
    is('climate', 'set_hvac_mode') ||
    isLock() ||
    is('input_number', 'set_value') ||
    is('input_select', 'select_option') ||
    isAlarm()
  )
}

/** 是否为 light.turn_on */
export function isLightTurnOn(a: OrchestratorServiceAction | null | undefined) {
  return isLightService(a?.domain, a?.service)
}

/** 是否为 climate.set_temperature */
export function isClimateSetTemp(a: OrchestratorServiceAction | null | undefined) {
  return a?.domain === 'climate' && a?.service === 'set_temperature'
}

/** 是否为窗帘位置/开合服务 */
export function isCoverPosition(a: OrchestratorServiceAction | null | undefined) {
  return isCoverService(a?.domain, a?.service)
}

/** 是否为媒体播放器音量/源/播放服务 */
export function isMediaPlayerVolume(a: OrchestratorServiceAction | null | undefined) {
  return isMediaService(a?.domain, a?.service)
}

/** 是否为 fan.set_percentage */
export function isFanSetPct(a: OrchestratorServiceAction | null | undefined) {
  return a?.domain === 'fan' && a?.service === 'set_percentage'
}

/** 是否为 humidifier.set_humidity */
export function isHumidifierSet(a: OrchestratorServiceAction | null | undefined) {
  return a?.domain === 'humidifier' && a?.service === 'set_humidity'
}

/** 是否为 climate.set_hvac_mode */
export function isClimateSetHvac(a: OrchestratorServiceAction | null | undefined) {
  return a?.domain === 'climate' && a?.service === 'set_hvac_mode'
}

/** 是否为门锁开锁 / 解锁 / 打开服务 */
export function isLockService(a: OrchestratorServiceAction | null | undefined) {
  return a?.domain === 'lock' && ['lock', 'unlock', 'open'].includes(String(a?.service))
}

/** 是否为 input_number.set_value */
export function isInputNumberSet(a: OrchestratorServiceAction | null | undefined) {
  return a?.domain === 'input_number' && a?.service === 'set_value'
}

/** 是否为 input_select.select_option */
export function isInputSelectOpt(a: OrchestratorServiceAction | null | undefined) {
  return a?.domain === 'input_select' && a?.service === 'select_option'
}

/** 是否为 alarm_control_panel.alarm_* 服务 */
export function isAlarmService(a: OrchestratorServiceAction | null | undefined) {
  return a?.domain === 'alarm_control_panel' && String(a?.service).startsWith('alarm_')
}

/**
 * 将参数面板写入 action.data（JSON 字符串）。
 *
 * 内部复用 buildServiceDataFromPanel 做按 domain+service 的字段裁剪；
 * 成功写入返回 true，无需写入（如面板无值）返回 false。
 */
function applyServiceDataFromPanel(
  action: OrchestratorServiceAction,
  panel: ServiceDataPanel,
) {
  const data = buildServiceDataFromPanel(action, panel)
  if (!data) return false
  action.data = JSON.stringify(data)
  return true
}

/**
 * 从 action.data 回填参数面板。
 *
 * - color_temp 自动 mired → kelvin。
 * - rgb_color 数组 → #RRGGBB。
 * - 解析失败静默忽略，避免无效 JSON 阻塞 UI。
 */
export function syncPanelFromActionData(
  action: OrchestratorServiceAction,
  panel: ServiceDataPanel,
) {
  if (!action?.data) return
  try {
    const d = JSON.parse(action.data) as Record<string, unknown>
    if (d.brightness_pct !== undefined) panel.brightness_pct = Number(d.brightness_pct)
    if (d.color_temp !== undefined) panel.color_temp = haColorTempToKelvin(Number(d.color_temp))
    if (d.transition !== undefined) panel.transition = Number(d.transition)
    if (Array.isArray(d.rgb_color)) {
      panel.rgb_color = `#${d.rgb_color.map((v: number) => v.toString(16).padStart(2, '0')).join('')}`
    }
    if (d.temperature !== undefined) panel.temperature = Number(d.temperature)
    if (d.position !== undefined) panel.position = Number(d.position)
    if (d.volume_level !== undefined) panel.volume_level = Number(d.volume_level)
    if (d.percentage !== undefined) panel.percentage = Number(d.percentage)
    if (d.humidity !== undefined) panel.humidity = Number(d.humidity)
    if (d.hvac_mode !== undefined) panel.hvac_mode = String(d.hvac_mode)
    if (d.effect !== undefined) panel.effect = String(d.effect)
    if (d.code !== undefined) panel.code = String(d.code)
    if (d.value !== undefined) panel.value = Number(d.value)
    if (d.option !== undefined) panel.option = String(d.option)
  } catch {
    /* 忽略无效 JSON */
  }
}

/** 参数面板默认值：覆盖各 domain 的合理初始值，便于新建动作即用 */
export const DEFAULT_SERVICE_DATA_PANEL: ServiceDataPanel = {
  brightness_pct: 100,
  color_temp: 0,
  transition: 0,
  rgb_color: '',
  effect: '',
  temperature: 22,
  position: 50,
  volume_level: 0.5,
  percentage: 50,
  humidity: 50,
  hvac_mode: 'heat',
  code: '',
  value: 0,
  option: '',
}

/** 将面板字段重置为 DEFAULT_SERVICE_DATA_PANEL */
export function resetServiceDataPanel(panel: ServiceDataPanel) {
  Object.assign(panel, DEFAULT_SERVICE_DATA_PANEL)
}

/** 参数面板是否处于展开态：showParamsKey 已置或已有 action.data */
export function actionServiceDataExpanded(
  action: OrchestratorServiceAction,
  showParamsKey: string,
) {
  return Boolean(action[showParamsKey]) || !!action.data
}

/** 设置动作的参数面板展开 / 折叠状态 */
export function setActionServiceDataExpanded(
  action: OrchestratorServiceAction,
  showParamsKey: string,
  value: boolean,
) {
  action[showParamsKey] = value
}

/**
 * 切换参数面板展开 / 折叠态。
 *
 * - 关闭：仅折叠。
 * - 打开：展开并在无 data 时重置为默认值，避免显示陈旧字段。
 */
export function toggleActionServiceDataPanel(
  action: OrchestratorServiceAction,
  panel: ServiceDataPanel,
  showParamsKey: string,
) {
  if (action[showParamsKey]) {
    setActionServiceDataExpanded(action, showParamsKey, false)
    return
  }
  setActionServiceDataExpanded(action, showParamsKey, true)
  if (!action.data) resetServiceDataPanel(panel)
}

/**
 * 应用参数面板到 action.data，成功后自动折叠面板。
 *
 * 返回值表示是否成功写入（用于 UI 显示成功 / 失败提示）。
 */
export function applyActionServiceDataPanel(
  action: OrchestratorServiceAction,
  panel: ServiceDataPanel,
  showParamsKey: string,
) {
  const ok = applyServiceDataFromPanel(action, panel)
  if (ok) setActionServiceDataExpanded(action, showParamsKey, false)
  return ok
}
