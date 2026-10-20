/** 系统配置可编辑视图构建工具 */
import { getSectionLabels } from '@/composables/config/system-config-core.internals'
import { inferSystemConfigFieldType, NESTED_JSON_FIELDS } from '@/shared/utils/config/system-config/field.util'
import { SYSTEM_CONFIG_FIELD_KEYS } from '@/shared/utils/config/system-config/field.meta'
import type { SystemConfig } from '@/shared/types/system-config'
import type {
  EditableConfigSection,
  EditableConfigSnapshot,
  SystemConfigPendingFieldKey,
} from '@/shared/types/system-config-editor'

const CONFIG_MASK = '••••••••'

const EXCLUDED_SECTIONS = new Set([
  'voice',
  'envSensorMap',
  'mediaPlaylists',
  'voiceCommands',
  'profiles',
  'clientPower',
  'auth',
])

/** 把字段值适配为表单展示值：object→JSON 文本，array→逗号串，其余原样 */
function fieldDisplayValue(type: string, value: unknown): string | number | boolean {
  if (type === 'object') return JSON.stringify(value ?? {}, null, 2)
  if (Array.isArray(value)) return value.map((item) => String(item)).join(', ')
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  return value == null ? '' : String(value)
}

/**
 * 把 SystemConfig 转换为可编辑分节视图
 *
 * 跳过 _ 前缀字段、非对象、数组、EXCLUDED_SECTIONS 与未在字段白名单内的字段；
 * 密码字段若为掩码则标记 isMasked。
 *
 * @param data - 后端返回的 SystemConfig。
 * @returns 可编辑分节数组；无可编辑字段时分节为空。
 */
export function toEditableSections(
  data: SystemConfig | Record<string, unknown>,
): EditableConfigSection[] {
  const sections: EditableConfigSection[] = []
  const record = data as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (key.startsWith('_')) continue
    const rawValue = record[key]
    if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) continue
      if (EXCLUDED_SECTIONS.has(key)) continue
      const section = rawValue as Record<string, unknown>
      const fields: EditableConfigSection['fields'] = []
      for (const fieldKey of Object.keys(section)) {
        if (!SYSTEM_CONFIG_FIELD_KEYS.has(fieldKey)) continue
      const value = section[fieldKey]
      if (value && typeof value === 'object' && !Array.isArray(value) && !NESTED_JSON_FIELDS.has(fieldKey)) continue
      const type = inferSystemConfigFieldType(value, fieldKey)
      const isMasked = type === 'password' && (value === CONFIG_MASK || value === '********')
      fields.push({
        key: fieldKey,
        type,
        value: fieldDisplayValue(type, value),
        isMasked,
      })
    }
    if (fields.length) {
      sections.push({ key, label: getSectionLabels()[key] || '运行参数', fields })
    }
  }
  return sections
}

export function fromEditableSections(sectionList: EditableConfigSection[]): EditableConfigSnapshot {
  const out: EditableConfigSnapshot = {}
  for (const section of sectionList) {
    out[section.key] = {}
    for (const field of section.fields) {
      if (
        field.type === 'password' &&
        field.isMasked &&
        (field.value === CONFIG_MASK ||
          field.value === '********' ||
          !String(field.value || '').trim())
      ) {
        continue
      }
      let value: unknown = field.value
      if (field.type === 'object') {
        try {
          value = JSON.parse(String(value || '{}'))
        } catch {
          throw new Error(`${section.key}.${field.key} JSON 格式无效`)
        }
      } else if (field.type === 'array' || field.type === 'entity-list') {
        value = Array.isArray(value)
          ? value.map((item) => String(item ?? '').trim()).filter(Boolean)
          : String(value ?? '')
              .split(/[,，\s]+/)
              .map((token) => token.trim())
              .filter(Boolean)
      } else if (field.type === 'number') {
        value = Number(value)
      }
      out[section.key][field.key] = value
    }
  }
  return out
}

/** 仅序列化含 pending 字段的分区（保存时避免覆盖未修改分区） */
export function fromEditableSectionsPending(
  sectionList: EditableConfigSection[],
  pendingFieldKeys: Set<SystemConfigPendingFieldKey | string>,
): EditableConfigSnapshot {
  const full = fromEditableSections(sectionList)
  const out: EditableConfigSnapshot = {}
  for (const sk of Object.keys(full)) {
    const hasPending = [...pendingFieldKeys].some((k) => k.startsWith(`${sk}:`))
    if (hasPending) out[sk] = full[sk]
  }
  return out
}

/** 解析已保存快照 JSON 字符串；空或非法时返回 null（不抛错以容错） */
function parseSavedSnapshot(
  savedSnapshot: string | null | undefined,
): EditableConfigSnapshot | null {
  if (!savedSnapshot) return null
  try {
    const parsed = JSON.parse(savedSnapshot) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as EditableConfigSnapshot) : null
  } catch {
    return null
  }
}

/** 对比当前编辑态与快照，返回 pending 字段键集合（sectionKey:fieldKey） */
export function getSystemConfigPendingFieldKeys(
  sectionList: EditableConfigSection[],
  savedSnapshot: string | null | undefined,
): Set<SystemConfigPendingFieldKey> {
  const prev = parseSavedSnapshot(savedSnapshot)
  if (!prev) return new Set()
  const cur = fromEditableSections(sectionList)
  const keys = new Set<SystemConfigPendingFieldKey>()
  for (const sk of Object.keys(cur)) {
    for (const fieldKey of Object.keys(cur[sk] || {})) {
      const currentValue = cur[sk][fieldKey]
      const previousValue = prev[sk]?.[fieldKey]
      if (JSON.stringify(currentValue) !== JSON.stringify(previousValue)) keys.add(`${sk}:${fieldKey}`)
    }
  }
  return keys
}

/** 各分区未保存字段数量 */
export function getSystemConfigSectionPendingMap(
  sectionList: EditableConfigSection[],
  savedSnapshot: string | null | undefined,
): Record<string, number> {
  const prev = parseSavedSnapshot(savedSnapshot)
  if (!prev) return {}
  const cur = fromEditableSections(sectionList)
  const map: Record<string, number> = {}
  for (const sk of Object.keys(cur)) {
    let count = 0
    for (const fieldKey of Object.keys(cur[sk] || {})) {
      const currentValue = cur[sk][fieldKey]
      const previousValue = prev[sk]?.[fieldKey]
      if (JSON.stringify(currentValue) !== JSON.stringify(previousValue)) count++
    }
    if (count) map[sk] = count
  }
  return map
}

const PRICING_TIER_ONLY_KEYS = new Set([
  'tier1Kwh',
  'tier1Price',
  'tier2Price',
  'tier3Price',
])
const PRICING_FIXED_ONLY_KEYS = new Set(['fixedPrice', 'regionLabel'])
const PRICING_TOU_ONLY_KEYS = new Set([
  'peakStart1',
  'peakEnd1',
  'peakStart2',
  'peakEnd2',
  'valleyStart',
  'valleyEnd',
  'peakPrice',
  'valleyPrice',
  'flatPrice',
])

/** pricing 分区按 pricingMode / timeOfUseEnabled 隐藏无关字段 */
export function filterPricingSectionFields<T extends { key: string; value?: unknown }>(
  fields: T[],
  sectionKey?: string,
): T[] {
  if (sectionKey !== 'pricing') return fields
  const modeField = fields.find((field) => field.key === 'pricingMode')
  const mode = String(modeField?.value ?? 'tiered')
  const touField = fields.find((field) => field.key === 'timeOfUseEnabled')
  const touOn = touField?.value !== false && touField?.value !== 'false'
  return fields.filter((field) => {
    if (PRICING_FIXED_ONLY_KEYS.has(field.key)) return mode === 'fixed'
    if (PRICING_TIER_ONLY_KEYS.has(field.key)) return mode === 'tiered'
    if (PRICING_TOU_ONLY_KEYS.has(field.key)) return touOn
    return true
  })
}

/** 待保存字段总数（用于「保存全部」按钮角标） */
export function countSystemConfigPendingChanges(
  sectionList: EditableConfigSection[],
  savedSnapshot: string | null | undefined,
) {
  return getSystemConfigPendingFieldKeys(sectionList, savedSnapshot).size
}

/** 将已保存快照写回编辑态（取消修改） */
export function applyEditableSnapshotToSections(
  sectionList: EditableConfigSection[],
  savedSnapshot: string | null | undefined,
): boolean {
  const prev = parseSavedSnapshot(savedSnapshot)
  if (!prev) return false
  for (const section of sectionList) {
    const snapSection = prev[section.key]
    if (!snapSection) continue
    for (const field of section.fields) {
      if (!(field.key in snapSection)) continue
      const value = snapSection[field.key]
      field.value = fieldDisplayValue(field.type, value)
      if (field.type === 'password') {
        field.isMasked = value === CONFIG_MASK || value === '********'
      }
    }
  }
  return true
}
