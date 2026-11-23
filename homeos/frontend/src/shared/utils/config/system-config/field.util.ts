/** 系统配置字段类型推断与表单控件选项 */
import { resolveSystemConfigFieldLabel, systemConfigFieldHint } from './field.meta'

const WIDE_FIELD_RE = /entity|path|url|password|dir|player|domains|logo|title|key/i

/** HA entity_id 字段（排除 entityCache* / entityRegistry* 等运行参数键名） */
const HA_ENTITY_FIELD_RE = /EntityIds?$/i

const HA_ENTITY_DOMAIN_FILTERS: Record<string, string> = {
  mainValveEntityId: 'switch',
}

/** NESTED_JSON_FIELDS：常量集合，成员语义见定义处。 */
export const NESTED_JSON_FIELDS = new Set([
  'widgetPollIntervals',
  'awaySimIntervalMinMax',
  'advisorTipActions',
  'presencePersons',
  'clients',
  'scenes',
])

/** 枚举类配置字段的下拉选项（key → { value, label }[]） */
const SYSTEM_CONFIG_SELECT_OPTIONS: Record<string, { value: string; label: string }[]> = {
  defaultMode: [
    { value: 'random', label: '随机切换' },
    { value: 'clock', label: '时钟' },
    { value: 'weather', label: '天气' },
  ],
  pricingMode: [
    { value: 'tiered', label: '年阶梯电价' },
    { value: 'fixed', label: '固定单价' },
  ],
}

/**
 * 固定选项**多选**字段（值仍是字符串数组，只是控件换成可点的 chip）。
 *
 * 为什么需要：``mutedSources`` / ``dndWeekdays`` 让用户手填逗号串，等于要求他记住
 * ``earthquake-eew`` 这种内部来源名 —— 填错不会有任何报错，只是静音不生效。
 * 选项直接来自后端实际使用的枚举，点选即可。
 */
const SYSTEM_CONFIG_MULTI_OPTIONS: Record<string, { value: string; label: string }[]> = {
  mutedSources: [
    { value: 'home-mode', label: '家庭模式切换' },
    { value: 'automation', label: '自动化' },
    { value: 'device-timer', label: '设备倒计时' },
    { value: 'energy-anomaly', label: '能耗异常' },
    { value: 'energy-budget', label: '能源预算' },
    { value: 'energy-balance', label: '余额不足' },
    { value: 'water-monitor', label: '用水/漏水' },
    { value: 'environment-health', label: '空气质量' },
    { value: 'device-monitor', label: '设备离线' },
    { value: 'presence', label: '人员在家' },
    { value: 'advisor', label: '智能顾问' },
    { value: 'voice', label: '语音' },
  ],
  dndWeekdays: [
    { value: '1', label: '周一' },
    { value: '2', label: '周二' },
    { value: '3', label: '周三' },
    { value: '4', label: '周四' },
    { value: '5', label: '周五' },
    { value: '6', label: '周六' },
    { value: '0', label: '周日' },
  ],
}

/** 多选字段的可选值（未登记时返回空数组 = 按普通文本处理）。 */
export function systemConfigMultiOptions(key = '') {
  return SYSTEM_CONFIG_MULTI_OPTIONS[key] || []
}

/** 多选字段的值是否为数字（``dndWeekdays`` 是 0–6 的整数，其余是字符串）。 */
export function isNumericMultiField(key = '') {
  const options = SYSTEM_CONFIG_MULTI_OPTIONS[key]
  return !!options?.length && options.every((opt) => /^\d+$/.test(String(opt.value)))
}

export function systemConfigSelectOptions(key = '') {
  return SYSTEM_CONFIG_SELECT_OPTIONS[key] || []
}

function isHaEntityConfigField(key = '') {
  if (/^entity(cache|registry)/i.test(key)) return false
  return HA_ENTITY_FIELD_RE.test(key)
}

export function haEntityDomainFilter(key = '') {
  return HA_ENTITY_DOMAIN_FILTERS[key] || ''
}

import type { EditableConfigField } from '@/shared/types/system-config-editor'

export function systemConfigCellClass(field: Pick<EditableConfigField, 'type' | 'key'>) {
  const wide =
    field.type === 'password' ||
    field.type === 'array' ||
    field.type === 'object' ||
    field.type === 'entity' ||
    field.type === 'entity-list' ||
    WIDE_FIELD_RE.test(field.key)
  return {
    'params-cell--bool': field.type === 'boolean',
    'params-cell--wide': wide,
  }
}

/**
 * 按字段名就能确定的控件类型（与值无关）。查表而不是 if 链：每加一种特殊控件
 * 只需加一行，不让类型推断函数的分支数量继续涨。
 */
function specialFieldType(key: string, isArray: boolean): string | null {
  if (SYSTEM_CONFIG_SELECT_OPTIONS[key]?.length) return 'select'
  if (isArray && SYSTEM_CONFIG_MULTI_OPTIONS[key]?.length) return 'multi-select'
  if (NESTED_JSON_FIELDS.has(key)) return 'object'
  if (/password|token|secret|apikey|webhook|key$/i.test(key)) return 'password'
  if (isHaEntityConfigField(key)) return isArray ? 'entity-list' : 'entity'
  return null
}

export function inferSystemConfigFieldType(value: unknown, key = '') {
  const isArray = Array.isArray(value)
  const special = specialFieldType(key, isArray)
  if (special) return special
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  if (isArray) return 'array'
  if (value && typeof value === 'object') return 'object'
  return 'string'
}

export function systemConfigFieldMatchesQuery(field: Pick<EditableConfigField, 'key'>, q: string, sectionKey: string) {
  const label = resolveSystemConfigFieldLabel(field.key, sectionKey)
  return (
    field.key.toLowerCase().includes(q) ||
    label.toLowerCase().includes(q) ||
    systemConfigFieldHint(field.key, sectionKey).toLowerCase().includes(q)
  )
}
