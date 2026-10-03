/**
 * 系统配置字段类型推断与表单控件选项
 *
 * 职责：
 * - 维护宽字段 / HA entity_id 字段 / 嵌套 JSON 字段的正则与集合。
 * - 维护枚举类配置字段的下拉选项表（SYSTEM_CONFIG_SELECT_OPTIONS）。
 * - 提供字段类型推断（password / number / object / array / entity-list / select / ...）
 *   与选项解析工具，供编辑器渲染对应表单控件。
 *
 * 依赖：./field.meta 的字段标签与提示查询函数。
 *
 * 注意：
 * - 字段 key（mainValveEntityId / ...）为配置 key，不翻译。
 * - 选项 value 为配置值，不翻译；仅 label 使用简体中文。
 */
import { resolveSystemConfigFieldLabel, systemConfigFieldHint } from './field.meta'

const WIDE_FIELD_RE = /entity|path|url|password|dir|player|domains|logo|title|key/i

/** HA entity_id 字段（排除 entityCache* / entityRegistry* 等运行参数键名） */
const HA_ENTITY_FIELD_RE = /EntityIds?$/i

const HA_ENTITY_DOMAIN_FILTERS: Record<string, string> = {
  mainValveEntityId: 'switch',
  linkageWaterHeaterEntityId: 'water_heater',
  linkageIaqFanEntityId: 'fan',
  linkageDehumidifierEntityId: 'humidifier',
}

/** NESTED_JSON_FIELDS：常量集合，成员语义见定义处。 */
export const NESTED_JSON_FIELDS = new Set([
  'ratedCycles',
  'ratedHours',
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

/** systemConfigSelectOptions：函数，按签名入参返回处理结果。 */
export function systemConfigSelectOptions(key = '') {
  return SYSTEM_CONFIG_SELECT_OPTIONS[key] || []
}

function isHaEntityConfigField(key = '') {
  if (/^entity(cache|registry)/i.test(key)) return false
  return HA_ENTITY_FIELD_RE.test(key)
}

/** haEntityDomainFilter：函数，按签名入参返回处理结果。 */
export function haEntityDomainFilter(key = '') {
  return HA_ENTITY_DOMAIN_FILTERS[key] || ''
}

import type { EditableConfigField } from '@/types/system-config-editor'

/** systemConfigCellClass：函数，按签名入参返回处理结果。 */
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

/** inferSystemConfigFieldType：函数，按签名入参返回处理结果。 */
export function inferSystemConfigFieldType(value: unknown, key = '') {
  if (SYSTEM_CONFIG_SELECT_OPTIONS[key]?.length) return 'select'
  if (NESTED_JSON_FIELDS.has(key)) return 'object'
  if (/password|token|secret|apikey|webhook|key$/i.test(key)) return 'password'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  if (isHaEntityConfigField(key)) {
    return Array.isArray(value) ? 'entity-list' : 'entity'
  }
  if (Array.isArray(value)) return 'array'
  if (value && typeof value === 'object') return 'object'
  return 'string'
}

/** systemConfigFieldMatchesQuery：函数，按签名入参返回处理结果。 */
export function systemConfigFieldMatchesQuery(
  field: Pick<EditableConfigField, 'key'>,
  q: string,
  sectionKey: string,
) {
  const label = resolveSystemConfigFieldLabel(field.key, sectionKey)
  return (
    field.key.toLowerCase().includes(q) ||
    label.toLowerCase().includes(q) ||
    systemConfigFieldHint(field.key, sectionKey).toLowerCase().includes(q)
  )
}
