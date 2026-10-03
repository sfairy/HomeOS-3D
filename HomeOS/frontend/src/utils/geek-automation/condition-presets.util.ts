/**
 * 极客自动化条件预设（米家式中文点选 → AutomationConditionForm）
 *
 * 职责：
 * - 维护常见条件场景的预设表（状态 / 数值 / 时间 / 等）。
 * - 提供 apply（应用预设到表单）与 match（识别表单是否匹配预设）工具。
 * - 提供条件表单反转（invertConditionForm），便于「否则」分支生成。
 *
 * 依赖：
 * - @/types/orchestrator-builder 的 AutomationConditionForm 类型。
 * - ./defaults 的 createGeekCondition 条件节点工厂。
 * - ./capabilities.util 的 domainFromEntityId。
 *
 * 注意：
 * - `id` / `group` 为预设 key，不翻译。
 * - HA state / 运算符为配置值，不翻译。
 * - 仅面向用户的 label / 分组名使用简体中文。
 */
import type { AutomationConditionForm } from '@/types/orchestrator-builder'
import { createGeekCondition } from './defaults'
import { domainFromEntityId } from './capabilities.util'

type GeekConditionPreset = {
  id: string
  label: string
  group: string
  needsEntity?: boolean
  apply: (c: AutomationConditionForm) => void
  match?: (c: AutomationConditionForm) => boolean
}

/** GEEK_CONDITION_PRESETS：常量集合，成员语义见定义处。 */
export const GEEK_CONDITION_PRESETS: GeekConditionPreset[] = [
  {
    id: 'eq_on',
    label: '设备为打开',
    group: '设备',
    needsEntity: true,
    apply: (c) => Object.assign(c, createGeekCondition({ operator: 'eq', state: 'on' })),
    match: (c) => c.operator === 'eq' && String(c.state) === 'on' && !c.negated,
  },
  {
    id: 'eq_off',
    label: '设备为关闭',
    group: '设备',
    needsEntity: true,
    apply: (c) => Object.assign(c, createGeekCondition({ operator: 'eq', state: 'off' })),
    match: (c) => c.operator === 'eq' && String(c.state) === 'off' && !c.negated,
  },
  {
    id: 'neq',
    label: '状态不等于',
    group: '设备',
    needsEntity: true,
    apply: (c) => Object.assign(c, createGeekCondition({ operator: 'neq', state: 'on' })),
    match: (c) => c.operator === 'neq' && !c.negated,
  },
  {
    id: 'state_for',
    label: '已持续…秒',
    group: '设备',
    needsEntity: true,
    apply: (c) =>
      Object.assign(c, createGeekCondition({ operator: 'state_for', state: 'on', forSeconds: 60 })),
    match: (c) => c.operator === 'state_for' && !c.negated,
  },
  {
    id: 'gt',
    label: '数值大于',
    group: '数值',
    needsEntity: true,
    apply: (c) => Object.assign(c, createGeekCondition({ operator: 'gt', state: '50' })),
    match: (c) => c.operator === 'gt' && !c.negated,
  },
  {
    id: 'gte',
    label: '数值大于等于',
    group: '数值',
    needsEntity: true,
    apply: (c) => Object.assign(c, createGeekCondition({ operator: 'gte', state: '50' })),
    match: (c) => c.operator === 'gte' && !c.negated,
  },
  {
    id: 'lt',
    label: '数值小于',
    group: '数值',
    needsEntity: true,
    apply: (c) => Object.assign(c, createGeekCondition({ operator: 'lt', state: '50' })),
    match: (c) => c.operator === 'lt' && !c.negated,
  },
  {
    id: 'lte',
    label: '数值小于等于',
    group: '数值',
    needsEntity: true,
    apply: (c) => Object.assign(c, createGeekCondition({ operator: 'lte', state: '50' })),
    match: (c) => c.operator === 'lte' && !c.negated,
  },
  {
    id: 'contains',
    label: '状态包含',
    group: '设备',
    needsEntity: true,
    apply: (c) => Object.assign(c, createGeekCondition({ operator: 'contains', state: '' })),
    match: (c) => c.operator === 'contains' && !c.negated,
  },
  {
    id: 'between',
    label: '数值介于',
    group: '数值',
    needsEntity: true,
    apply: (c) =>
      Object.assign(c, createGeekCondition({ operator: 'between', state: '10', stateTo: '30' })),
    match: (c) => c.operator === 'between' && !c.negated,
  },
  {
    id: 'weekday',
    label: '工作日',
    group: '时间',
    apply: (c) =>
      Object.assign(c, createGeekCondition({ operator: 'weekday', days: [1, 2, 3, 4, 5], state: '' })),
    match: (c) =>
      !c.negated &&
      c.operator === 'weekday' &&
      Array.isArray(c.days) &&
      c.days.length === 5 &&
      [1, 2, 3, 4, 5].every((d) => c.days!.includes(d)),
  },
  {
    id: 'weekend',
    label: '周末',
    group: '时间',
    apply: (c) =>
      Object.assign(c, createGeekCondition({ operator: 'weekday', days: [0, 6], state: '' })),
    match: (c) =>
      !c.negated &&
      c.operator === 'weekday' &&
      Array.isArray(c.days) &&
      c.days.length === 2 &&
      c.days.includes(0) &&
      c.days.includes(6),
  },
  {
    id: 'days_custom',
    label: '自定义星期',
    group: '时间',
    apply: (c) =>
      Object.assign(c, createGeekCondition({ operator: 'weekday', days: [1], state: '' })),
    match: (c) =>
      !c.negated && c.operator === 'weekday' && Array.isArray(c.days) && c.days.length > 0,
  },
  {
    id: 'time_after',
    label: '晚于某时刻',
    group: '时间',
    apply: (c) =>
      Object.assign(c, createGeekCondition({ operator: 'time_after', state: '18:00:00', days: [] })),
    match: (c) => c.operator === 'time_after' && !c.negated,
  },
  {
    id: 'time_before',
    label: '早于某时刻',
    group: '时间',
    apply: (c) =>
      Object.assign(c, createGeekCondition({ operator: 'time_before', state: '07:00:00', days: [] })),
    match: (c) => c.operator === 'time_before' && !c.negated,
  },
  {
    id: 'after_sunset',
    label: '日落之后',
    group: '时间',
    apply: (c) =>
      Object.assign(c, createGeekCondition({ operator: 'sun_after', state: 'sunset', days: [] })),
    match: (c) => c.operator === 'sun_after' && !c.negated,
  },
  {
    id: 'before_sunrise',
    label: '日出之前',
    group: '时间',
    apply: (c) =>
      Object.assign(c, createGeekCondition({ operator: 'sun_before', state: 'sunrise', days: [] })),
    match: (c) => c.operator === 'sun_before' && !c.negated,
  },
  {
    id: 'var_lt',
    label: '变量小于',
    group: '变量',
    apply: (c) =>
      Object.assign(c, createGeekCondition({ operator: 'var_lt', varKey: '', state: '3' })),
    match: (c) => c.operator === 'var_lt' && !c.negated,
  },
  {
    id: 'var_lte',
    label: '变量小于等于',
    group: '变量',
    apply: (c) =>
      Object.assign(c, createGeekCondition({ operator: 'var_lte', varKey: '', state: '3' })),
    match: (c) => c.operator === 'var_lte' && !c.negated,
  },
  {
    id: 'var_gt',
    label: '变量大于',
    group: '变量',
    apply: (c) =>
      Object.assign(c, createGeekCondition({ operator: 'var_gt', varKey: '', state: '0' })),
    match: (c) => c.operator === 'var_gt' && !c.negated,
  },
  {
    id: 'var_gte',
    label: '变量大于等于',
    group: '变量',
    apply: (c) =>
      Object.assign(c, createGeekCondition({ operator: 'var_gte', varKey: '', state: '0' })),
    match: (c) => c.operator === 'var_gte' && !c.negated,
  },
  {
    id: 'var_eq',
    label: '变量等于',
    group: '变量',
    apply: (c) =>
      Object.assign(c, createGeekCondition({ operator: 'var_eq', varKey: '', state: '' })),
    match: (c) => c.operator === 'var_eq' && !c.negated,
  },
  {
    id: 'var_neq',
    label: '变量不等于',
    group: '变量',
    apply: (c) =>
      Object.assign(c, createGeekCondition({ operator: 'var_neq', varKey: '', state: '' })),
    match: (c) => c.operator === 'var_neq' && !c.negated,
  },
]

/** matchConditionPreset：函数，按签名入参返回处理结果。 */
export function matchConditionPreset(c: AutomationConditionForm): string {
  return GEEK_CONDITION_PRESETS.find((p) => p.match?.(c))?.id || ''
}

/**
 * 对条件取反：有对偶算子则切换（eq↔neq、gt↔lte…）；否则切换 `negated` 标志。
 * 编译层将 `negated` 包成 HA `condition: not`。
 */
const CONDITION_OPERATOR_DUAL: Record<string, string> = {
  eq: 'neq',
  neq: 'eq',
  gt: 'lte',
  lte: 'gt',
  lt: 'gte',
  gte: 'lt',
  var_eq: 'var_neq',
  var_neq: 'var_eq',
  var_gt: 'var_lte',
  var_lte: 'var_gt',
  var_lt: 'var_gte',
  var_gte: 'var_lt',
}

/** invertConditionForm：函数，按签名入参返回处理结果。 */
export function invertConditionForm(c: AutomationConditionForm): void {
  if (c.negated) {
    c.negated = false
    return
  }
  const op = String(c.operator || 'eq')
  const dual = CONDITION_OPERATOR_DUAL[op]
  if (dual) {
    c.operator = dual
    return
  }
  c.negated = true
}

/** applyConditionPreset：函数，按签名入参返回处理结果。 */
export function applyConditionPreset(c: AutomationConditionForm, presetId: string) {
  const p = GEEK_CONDITION_PRESETS.find((x) => x.id === presetId)
  if (!p) return
  const keepEntity = c.entityId
  const keepVar = c.varKey
  const keepScope = c.varScope
  p.apply(c)
  c.negated = false
  if (p.needsEntity && keepEntity) c.entityId = keepEntity
  if (String(c.operator || '').startsWith('var_')) {
    if (keepVar) c.varKey = keepVar
    if (keepScope) c.varScope = keepScope
    else if (!c.varScope) c.varScope = 'global'
  }
}

/** friendlyConditionDetail：函数，按签名入参返回处理结果。 */
export function friendlyConditionDetail(c: AutomationConditionForm): string {
  const preset = GEEK_CONDITION_PRESETS.find((p) => p.match?.(c))
  const prefix = c.negated ? '非·' : ''
  if (c.operator === 'state_for') return `${prefix}${c.entityId || ''} 持续 ${c.forSeconds || 0}s`
  if (c.operator === 'between') return `${prefix}${c.entityId || ''} ${c.state}~${c.stateTo}`
  if (c.operator === 'time_after') return `${prefix}晚于 ${c.state || ''}`
  if (c.operator === 'time_before') return `${prefix}早于 ${c.state || ''}`
  if (c.operator === 'sun_after') return `${prefix}在 ${c.state || 'sunset'} 之后`
  if (c.operator === 'sun_before') return `${prefix}在 ${c.state || 'sunrise'} 之前`
  if (String(c.operator || '').startsWith('var_'))
    return `${prefix}${preset?.label || c.operator} ${c.varKey || ''} ${c.state ?? ''}`
  if (Array.isArray(c.days) && c.days.length) return `${prefix}${preset?.label || '星期过滤'}`
  const domain = domainFromEntityId(c.entityId)
  return `${prefix}${preset?.label || c.operator} ${c.entityId || domain || ''} ${c.state ?? ''}`.trim()
}
