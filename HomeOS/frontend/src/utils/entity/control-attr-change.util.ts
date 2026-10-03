/**
 * @module entity-control-attr-change.util
 * @description 实体控制类属性变更检测与展示文案生成。
 *
 * 职责：
 * - 定义各域（climate / light / fan 等）"控制 / 设定类"属性白名单。
 * - 比较新旧属性，返回首个变化的控制属性描述（如"风速 自动 → 高"）。
 * - 解析 EventLog stateDiff 中的属性变更字符串。
 * - 生成实体状态变更的展示文案，供即时消息墙与时间线共用。
 *
 * 依赖：
 * - `@homeos/shared`：getEntityDomain 域名解析。
 * - `entity-state-labels`：state 中文标签。
 */
import { getEntityDomain } from '@homeos/shared'
import type { EntitySnapshot } from '@/types/entity'
import { formatEntityAttrValueText } from '@/utils/device/attr-format.util'

type EntityAttributes = NonNullable<EntitySnapshot['attributes']>

/**
 * 各域「控制/设定类」属性白名单：state 未变但这些属性变化时也应记录为一条事件
 * （与后端 event-log-tier.util.ts ATTR_CHANGE_TRIGGERS 保持一致）
 */
const ATTR_CHANGE_TRIGGERS: Record<string, readonly string[]> = {
  climate: [
    'temperature',
    'target_temp_high',
    'target_temp_low',
    'humidity',
    'fan_mode',
    'preset_mode',
    'swing_mode',
    'hvac_mode',
  ],
  light: ['brightness', 'color_temp', 'color_temp_kelvin', 'rgb_color', 'hs_color', 'effect'],
  fan: ['percentage', 'preset_mode', 'oscillating', 'direction'],
  cover: ['current_position', 'current_tilt_position'],
  media_player: ['volume_level', 'source'],
  water_heater: ['temperature', 'operation_mode'],
  vacuum: ['fan_speed'],
}

/** ATTR_CHANGE_LABELS：对象常量，字段 / 方法语义见定义处。 */
export const ATTR_CHANGE_LABELS: Record<string, string> = {
  temperature: '目标温度',
  target_temp_high: '温度上限',
  target_temp_low: '温度下限',
  humidity: '目标湿度',
  fan_mode: '风速',
  preset_mode: '模式',
  swing_mode: '摆风',
  hvac_mode: '运行模式',
  brightness: '亮度',
  color_temp: '色温',
  color_temp_kelvin: '色温',
  rgb_color: '颜色',
  hs_color: '颜色',
  effect: '灯效',
  percentage: '风速',
  oscillating: '摆头',
  direction: '风向',
  current_position: '位置',
  current_tilt_position: '角度',
  volume_level: '音量',
  source: '输入源',
  operation_mode: '模式',
  fan_speed: '吸力',
}

/**
 * 将属性原始值格式化为用户可读文案（与属性面板共用 formatEntityAttrValue）。
 */
function formatAttrValue(key: string, val: unknown): string {
  return formatEntityAttrValueText(key, val)
}

/**
 * 比较新旧属性，返回首个变化的控制属性描述（如"风速 自动 → 高"）。
 *
 * 仅检查当前实体域的 ATTR_CHANGE_TRIGGERS 白名单属性，
 * 使用 JSON 序列化做深比较，返回首个变化属性的描述。
 *
 * @param entityId 实体 ID。
 * @param oldAttrs 旧属性对象。
 * @param newAttrs 新属性对象。
 * @returns 属性变更描述；无变化或域无白名单时返回 null。
 */
export function describeAttrChange(
  entityId: string,
  oldAttrs: EntityAttributes | undefined,
  newAttrs: EntityAttributes | undefined,
): string | null {
  const domain = getEntityDomain(entityId)
  const triggers = ATTR_CHANGE_TRIGGERS[domain]
  if (!triggers || !oldAttrs || !newAttrs) return null
  for (const key of triggers) {
    if (JSON.stringify(oldAttrs[key]) !== JSON.stringify(newAttrs[key])) {
      const label = ATTR_CHANGE_LABELS[key] || key
      return `${label} ${formatAttrValue(key, oldAttrs[key])} → ${formatAttrValue(key, newAttrs[key])}`
    }
  }
  return null
}

/**
 * 解析 EventLog stateDiff 中的属性变更字符串。
 *
 * 格式：`attr:{key}:{oldRaw}→{newRaw}`，如 `attr:fan_mode:auto→high`。
 * 解析后返回与 describeAttrChange 一致的描述文案。
 *
 * @param stateDiff stateDiff 字符串。
 * @returns 属性变更描述；格式不匹配时返回 null。
 */
export function parseAttrStateDiff(stateDiff: string): string | null {
  if (!stateDiff || !stateDiff.startsWith('attr:')) return null
  const body = stateDiff.slice(5)
  const sep = body.indexOf(':')
  if (sep < 0) return null
  const key = body.slice(0, sep)
  const rest = body.slice(sep + 1)
  const arrow = rest.indexOf('→')
  if (arrow < 0) return null
  const oldRaw = rest.slice(0, arrow)
  const newRaw = rest.slice(arrow + 1)
  const label = ATTR_CHANGE_LABELS[key] || key
  return `${label} ${formatAttrValue(key, oldRaw)} → ${formatAttrValue(key, newRaw)}`
}

interface EntityStateChangeResolved {
  state: string
  attrText: string | null
  label: string
}

/**
 * 构建即时消息墙事件指纹（与 stateListenerPayloadFingerprint 对齐）。
 *
 * 属性变更指纹：`{entityId}|attr|{attrText}`；
 * 状态变更指纹：`{entityId}|state|{oldS}|{newS}`。
 *
 * @param entityId 实体 ID。
 * @param oldStateObj 旧状态对象。
 * @param newStateObj 新状态对象。
 * @param resolved 已解析的状态变更结果（含 state 与 attrText）。
 * @returns 事件指纹字符串。
 */
export function buildOverlayEventFingerprint(
  entityId: string,
  oldStateObj: EntitySnapshot | null | undefined,
  newStateObj: EntitySnapshot | null | undefined,
  resolved: Pick<EntityStateChangeResolved, 'state' | 'attrText'>,
): string {
  if (resolved.attrText) return `${entityId}|attr|${resolved.attrText}`
  const oldS = oldStateObj?.state ?? ''
  const newS = resolved.state ?? newStateObj?.state ?? ''
  return `${entityId}|state|${oldS}|${newS}`
}

/**
 * 解析实体状态变更的展示文案（即时消息 / 时间线共用）。
 *
 * - state 未变但属性变化：返回属性变更描述。
 * - state 变化：返回新 state 的中文标签。
 * - 无变化或新状态为空：返回 null。
 *
 * @param entityId 实体 ID。
 * @param oldState 旧状态快照。
 * @param newState 新状态快照。
 * @param formatStateLabel state 标签格式化函数。
 * @returns 状态变更解析结果；无变更时返回 null。
 */
export function resolveEntityStateChangeMessage(
  entityId: string,
  oldState: EntitySnapshot | null | undefined,
  newState: EntitySnapshot | null | undefined,
  formatStateLabel: (entityId: string, state: string) => string,
): EntityStateChangeResolved | null {
  if (!newState) return null
  const newS = newState.state
  const oldS = oldState?.state

  if (oldS === newS) {
    const attrText = describeAttrChange(entityId, oldState?.attributes, newState.attributes)
    if (!attrText) return null
    return { state: newS ?? '', attrText, label: attrText }
  }

  if (newS == null || newS === '') return null
  const label = formatStateLabel(entityId, newS)
  return { state: newS, attrText: null, label }
}
