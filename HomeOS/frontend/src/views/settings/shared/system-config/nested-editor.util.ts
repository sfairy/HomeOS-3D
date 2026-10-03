/**
 * 文件：nested-editor.util.ts
 * 所属模块：frontend / src / views / settings / shared / system-config
 * 职责：高级参数中 JSON 嵌套字段的可视化编辑器配置与工具。提供编辑器类型判定（record-table / fixed-form / json）、
 *       记录行与对象互转、JSON 解析/序列化、重复键检测与固定表单范围校验。
 * 关键依赖：无外部依赖，纯工具函数
 */

type NestedObjectEditorKind = 'record-table' | 'fixed-form' | 'json'

const NESTED_RECORD_TABLE_FIELDS = new Set([
  'ratedCycles',
  'ratedHours',
  'widgetPollIntervals',
])

/** NESTED_RECORD_TABLE_META：符号语义见下方声明。 */
export const NESTED_RECORD_TABLE_META: Record<
  string,
  {
    keyLabel: string
    valueLabel: string
    keyPlaceholder?: string
    valueMin?: number
    valueMax?: number
  }
> = {
  ratedCycles: {
    keyLabel: '设备域',
    valueLabel: '额定次数',
    keyPlaceholder: 'light',
    valueMin: 1,
    valueMax: 10_000_000,
  },
  ratedHours: {
    keyLabel: '设备域',
    valueLabel: '额定小时',
    keyPlaceholder: 'fan',
    valueMin: 1,
    valueMax: 10_000_000,
  },
  widgetPollIntervals: {
    keyLabel: '微件键',
    valueLabel: '轮询间隔（ms）',
    keyPlaceholder: 'energy',
    valueMin: 1000,
    valueMax: 600_000,
  },
}

type NestedFixedFieldSpec = {
  key: string
  label: string
  type: 'number'
  min?: number
  max?: number
}

/** NESTED_FIXED_OBJECT_FIELDS：对象常量，字段 / 方法语义见定义处。 */
export const NESTED_FIXED_OBJECT_FIELDS: Record<string, { fields: NestedFixedFieldSpec[] }> = {
  awaySimIntervalMinMax: {
    fields: [
      { key: 'min', label: '最小间隔（分钟）', type: 'number', min: 1, max: 120 },
      { key: 'max', label: '最大间隔（分钟）', type: 'number', min: 1, max: 180 },
    ],
  },
}

/** getNestedObjectEditorKind：函数，按签名入参返回处理结果。 */
export function getNestedObjectEditorKind(fieldKey: string): NestedObjectEditorKind {
  if (NESTED_RECORD_TABLE_FIELDS.has(fieldKey)) return 'record-table'
  if (fieldKey in NESTED_FIXED_OBJECT_FIELDS) return 'fixed-form'
  return 'json'
}

/** parseNestedObjectJson：函数，按签名入参返回处理结果。 */
export function parseNestedObjectJson(raw: unknown): Record<string, unknown> {
  return tryParseNestedObjectJson(raw).value
}

/** 解析嵌套 JSON；失败时 value 为空对象，ok 为 false */
export function tryParseNestedObjectJson(raw: unknown): {
  ok: boolean
  value: Record<string, unknown>
} {
  if (raw == null || raw === '') return { ok: true, value: {} }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return { ok: true, value: { ...(raw as Record<string, unknown>) } }
  }
  if (typeof raw !== 'string') return { ok: false, value: {} }
  const text = raw.trim()
  if (!text) return { ok: true, value: {} }
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { ok: true, value: parsed as Record<string, unknown> }
    }
    return { ok: false, value: {} }
  } catch {
    return { ok: false, value: {} }
  }
}

/** stringifyNestedObject：函数，按签名入参返回处理结果。 */
export function stringifyNestedObject(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, null, 2)
}

/** recordRowsFromObject：函数，按签名入参返回处理结果。 */
export function recordRowsFromObject(obj: Record<string, unknown>) {
  return Object.entries(obj).map(([key, value], index) => ({
    id: `${key}-${index}`,
    key,
    value: value == null || value === '' ? '' : Number(value),
  }))
}

/** objectFromRecordRows：函数，按签名入参返回处理结果。 */
export function objectFromRecordRows(
  rows: Array<{ key: string; value: number | string }>,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const row of rows) {
    const k = String(row.key || '').trim()
    if (!k) continue
    // 避免 Number('') === 0 把清空误写成 0
    if (row.value === '' || row.value == null) continue
    const n = typeof row.value === 'number' ? row.value : Number(String(row.value).trim())
    if (Number.isFinite(n)) out[k] = n
  }
  return out
}

/** 非空键出现多次时返回重复的键名（保存时后者会覆盖前者） */
export function findDuplicateRecordKeys(rows: Array<{ key: string }>): string[] {
  const seen = new Set<string>()
  const dup = new Set<string>()
  for (const row of rows) {
    const k = String(row.key || '').trim()
    if (!k) continue
    if (seen.has(k)) dup.add(k)
    else seen.add(k)
  }
  return [...dup]
}

/** fixed-form 字段：min 须 ≤ max */
export function findFixedFormRangeErrors(
  fieldKey: string,
  values: Record<string, number | string>,
): string[] {
  if (fieldKey !== 'awaySimIntervalMinMax') return []
  const min = Number(values.min)
  const max = Number(values.max)
  if (Number.isFinite(min) && Number.isFinite(max) && min > max) {
    return ['最小间隔不能大于最大间隔']
  }
  return []
}
