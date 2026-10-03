/**
 * 系统配置可编辑视图构建工具
 *
 * 职责：
 * - 把后端 SystemConfig 转换为可编辑分节视图（EditableConfigSection[]）。
 * - 字段值适配为表单展示值（object→JSON 文本，array→逗号串）。
 * - 密码类字段识别掩码占位（•••••••• / ********），避免覆盖回写。
 * - 处理草稿差异、待保存字段收集与回写补全。
 *
 * 依赖：
 * - @/composables/config/system-config-core.internals 的 getSectionLabels。
 * - ./field.util 的字段类型推断。
 * - ./field.meta 的字段白名单。
 * - @/types/system-config、@/types/system-config-editor 类型。
 *
 * 注意：
 * - EXCLUDED_SECTIONS 中的配置段（voice / energyBudget / ...）由专属页面维护，
 *   不进入通用编辑器，避免误编辑。
 * - CONFIG_MASK 为密码掩码占位，不翻译。
 */
import { getSectionLabels } from '@/composables/config/system-config-core.internals'
import { inferSystemConfigFieldType, NESTED_JSON_FIELDS } from './field.util'
import { SYSTEM_CONFIG_FIELD_KEYS } from './field.meta'
import type { SystemConfig } from '@/types/system-config'
import type {
  EditableConfigSection,
  EditableConfigSnapshot,
  SystemConfigPendingFieldKey,
} from '@/types/system-config-editor'

const CONFIG_MASK = '••••••••'

const EXCLUDED_SECTIONS = new Set([
  'voice',
  'energyBudget',
  'envSensorMap',
  'mediaPlaylists',
  'voiceCommands',
  'profiles',
  'clientPower',
  'weatherEffects',
  'auth',
])

/** 把字段值适配为表单展示值：object→JSON 文本，array→逗号串，其余原样 */
function fieldDisplayValue(type: string, v: unknown): string | number | boolean {
  if (type === 'object') return JSON.stringify(v ?? {}, null, 2)
  if (Array.isArray(v)) return v.map((item) => String(item)).join(', ')
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v
  return v == null ? '' : String(v)
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
    const val = record[key]
    if (!val || typeof val !== 'object' || Array.isArray(val)) continue
      if (EXCLUDED_SECTIONS.has(key)) continue
      const section = val as Record<string, unknown>
      const fields: EditableConfigSection['fields'] = []
      for (const fk of Object.keys(section)) {
        if (!SYSTEM_CONFIG_FIELD_KEYS.has(fk)) continue
      const v = section[fk]
      if (v && typeof v === 'object' && !Array.isArray(v) && !NESTED_JSON_FIELDS.has(fk)) continue
      const type = inferSystemConfigFieldType(v, fk)
      const isMasked = type === 'password' && (v === CONFIG_MASK || v === '********')
      fields.push({
        key: fk,
        type,
        value: fieldDisplayValue(type, v),
        isMasked,
      })
    }
    if (fields.length) {
      sections.push({ key, label: getSectionLabels()[key] || '运行参数', fields })
    }
  }
  return sections
}

/** fromEditableSections：函数，按签名入参返回处理结果。 */
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
      let v: unknown = field.value
      if (field.type === 'object') {
        try {
          v = JSON.parse(String(v || '{}'))
        } catch {
          throw new Error(`${section.key}.${field.key} JSON 格式无效`)
        }
      } else if (field.type === 'array' || field.type === 'entity-list') {
        v = Array.isArray(v)
          ? v.map((item) => String(item ?? '').trim()).filter(Boolean)
          : String(v ?? '')
              .split(/[,，\s]+/)
              .map((s) => s.trim())
              .filter(Boolean)
      } else if (field.type === 'number') {
        v = Number(v)
      }
      out[section.key][field.key] = v
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
    for (const fk of Object.keys(cur[sk] || {})) {
      const a = cur[sk][fk]
      const b = prev[sk]?.[fk]
      if (JSON.stringify(a) !== JSON.stringify(b)) keys.add(`${sk}:${fk}`)
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
    let n = 0
    for (const fk of Object.keys(cur[sk] || {})) {
      const a = cur[sk][fk]
      const b = prev[sk]?.[fk]
      if (JSON.stringify(a) !== JSON.stringify(b)) n++
    }
    if (n) map[sk] = n
  }
  return map
}

const PRICING_TIER_ONLY_KEYS = new Set([
  'tier1Kwh',
  'tier2Kwh',
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
  const modeField = fields.find((f) => f.key === 'pricingMode')
  const mode = String(modeField?.value ?? 'tiered')
  const touField = fields.find((f) => f.key === 'timeOfUseEnabled')
  const touOn = touField?.value !== false && touField?.value !== 'false'
  return fields.filter((f) => {
    if (PRICING_FIXED_ONLY_KEYS.has(f.key)) return mode === 'fixed'
    if (PRICING_TIER_ONLY_KEYS.has(f.key)) return mode === 'tiered'
    if (PRICING_TOU_ONLY_KEYS.has(f.key)) return touOn
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
      const v = snapSection[field.key]
      field.value = fieldDisplayValue(field.type, v)
      if (field.type === 'password') {
        field.isMasked = v === CONFIG_MASK || v === '********'
      }
    }
  }
  return true
}
