/**
 * 户型图部件展示状态解析工具
 *
 * 职责：
 * - 解析部件（widget）当前的展示状态：是否开启、状态文案、状态语义色、传感器量纲等。
 * - 维护「非 off/unavailable 即视为开启」的部件类型白名单。
 * - 提供部件状态图标 URL 解析（自定义 stateIcons 优先，否则回退域名默认）。
 *
 * 依赖：
 * - @homeos/shared 提供 getEntityDomain。
 * - @/utils/entity/derived.util 提供 getEntityDisplayName。
 * - @/constants/entity-state-labels 与 @/constants/entity-state-meta 提供状态标签 / 语义色。
 * - @/constants/sensor-reading-colors 提供传感器量纲识别与读数色阶。
 *
 * 注意：部件 type key、entity_id、HA state、CSS 颜色值均为配置 / 标识符，不翻译；
 *   仅面向用户的标签文案使用简体中文。
 */
import { getEntityDomain } from '@homeos/shared'
import type { EntitySnapshot } from '@/types/entity'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import {
  entityStateLabel,
  resolveWidgetStateLabel,
} from '@/constants/entity-state-labels'
import { entityStateColor } from '@/constants/entity-state-meta'
import {
  detectSensorReadingKind,
  resolveSensorReadingColor,
  type SensorReadingKind,
} from '@/constants/sensor-reading-colors'

/** 部件最小形状：含 id / 可选 type / 可选自定义状态标签映射 */
type FloorWidgetLike = {
  id: string
  type?: string
  stateLabels?: Record<string, string>
}

/** 部件展示状态：是否开启 / 状态值 / 标签 / 状态文本 / 语义色 / 传感器量纲 */
export type WidgetDisplayState = {
  isOn: boolean
  state: string
  label: string
  stateText: string | null
  /** 当前状态语义色（hex），用于圆点/图标光晕/徽章 */
  stateColor: string | null
  /** 传感器量纲（徽章温湿度图标等） */
  readingKind: SensorReadingKind | null
}

/** 非 off/unavailable 即视为开启的部件类型 */
const ACTIVE_UNLESS_OFF_WIDGET_TYPES = new Set([
  'ClimateWidget',
  'FanWidget',
  'WaterPurifierWidget',
  'AirPurifierWidget',
  'DispenserWidget',
  'FridgeWidget',
  'FreshAirWidget',
  'WashingMachineWidget',
  'RangeHoodWidget',
  'GasStoveWidget',
  'MotionSensorWidget',
  'LeakSensorWidget',
  'GasSensorWidget',
  'SmokeSensorWidget',
  'CoSensorWidget',
  'EnvironmentSensorWidget',
  'HumidifierWidget',
  'CameraWidget',
  'VacuumWidget',
])

/** 根据实体状态与部件类型推导热点「开启」态（与 FloorplanCanvas 渲染一致） */
function deriveWidgetIsOn(
  widget: FloorWidgetLike,
  entity: EntitySnapshot | null | undefined,
): boolean {
  const s = entity?.state
  const domain = getEntityDomain(widget.id) ?? ''
  const wt = widget.type

  if (wt && ACTIVE_UNLESS_OFF_WIDGET_TYPES.has(wt)) {
    return s !== 'off' && s !== 'unavailable' && s !== undefined
  }
  if (wt === 'WaterHeaterWidget') return s === 'gas' || s === 'on'
  if (wt === 'LockWidget') return s === 'locked' || s === 'unlocked'
  if (wt === 'AlarmWidget') return Boolean(s && s !== 'disarmed')
  if (wt === 'SirenWidget') return s === 'on' || s === 'sounding'
  if (wt === 'ValveWidget') return s === 'open' || s === 'opening'
  if (wt === 'RemoteWidget') return s === 'on'
  if (wt === 'SceneWidget') return s !== 'off' && s !== 'unavailable' && s !== undefined
  if (wt === 'CoverWidget') return s === 'opening' || s === 'open'
  if (wt === 'MediaWidget' || domain === 'media_player') {
    return s !== 'off' && s !== 'unavailable' && s !== undefined
  }
  if (domain === 'water_heater') return s === 'gas' || s === 'on'
  if (domain === 'lock') {
    return (
      s === 'locked' || s === 'unlocked' || s === 'locking' || s === 'unlocking' || s === 'jammed'
    )
  }
  if (domain === 'cover') return s === 'opening' || s === 'open'
  if (domain === 'alarm_control_panel') return Boolean(s && s !== 'disarmed')
  if (domain === 'input_boolean') return s === 'on'
  if (
    domain === 'select' ||
    domain === 'input_select' ||
    domain === 'number' ||
    domain === 'input_number'
  ) {
    return s !== 'unavailable' && s !== undefined
  }
  if (domain === 'button' || domain === 'input_button') return true
  return s === 'on'
}

function buildWidgetStateText(
  widget: FloorWidgetLike,
  entity: EntitySnapshot | null | undefined,
  state: string,
): string | null {
  const mapped = resolveWidgetStateLabel(state, widget.stateLabels)
  if (widget.type === 'BadgeWidget') {
    const hasCustom = Boolean(widget.stateLabels?.[state]?.trim())
    const hasBuiltinZh = entityStateLabel(state) !== state
    if (hasCustom || hasBuiltinZh) return mapped
    return `${state ?? '?'} ${entity?.attributes?.unit_of_measurement ?? ''}`.trim()
  }
  return mapped || null
}

function resolveDisplayStateColor(
  widget: FloorWidgetLike,
  entity: EntitySnapshot | null | undefined,
  state: string,
): string | null {
  const reading = resolveSensorReadingColor(widget.id, state, entity)
  if (reading) return reading
  return entityStateColor(state)
}

export function buildWidgetDisplayState(
  widget: FloorWidgetLike,
  entity: EntitySnapshot | null | undefined,
): WidgetDisplayState {
  const s = entity?.state || 'off'
  return {
    isOn: deriveWidgetIsOn(widget, entity),
    state: s,
    label: getEntityDisplayName(widget.id, entity),
    stateText: buildWidgetStateText(widget, entity, s),
    stateColor: resolveDisplayStateColor(widget, entity, s),
    readingKind: detectSensorReadingKind(widget.id, entity),
  }
}

/** 解析状态图标路径（AssetPicker 存相对路径；兼容已带 /icons/ 前缀或绝对 URL） */
export function resolveStateIconUrl(iconRef: string | undefined | null): string | null {
  if (!iconRef) return null
  if (iconRef.startsWith('http://') || iconRef.startsWith('https://')) {
    return iconRef
  }

  let rel = iconRef
  if (rel.startsWith('/icons/')) {
    try {
      rel = decodeURIComponent(rel.slice('/icons/'.length))
    } catch {
      rel = rel.slice('/icons/'.length)
    }
  } else if (rel.startsWith('/')) {
    return iconRef
  }

  const encoded = rel
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/')
  return `/icons/${encoded}`
}

/** 预览模式下短按是否应 toggle（light/switch/input_boolean） */
export function shouldToggleOnQuickClick(entityId: string): boolean {
  const domain = getEntityDomain(entityId)
  return domain === 'light' || domain === 'switch' || domain === 'input_boolean'
}
