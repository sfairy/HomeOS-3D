/**
 * 能源字段：查询 / 推断逻辑（静态表见 energy-attr-maps）
 *
 * 职责：
 * - 转发 energy-attr-maps 中的静态映射表与类别常量。
 * - 提供能源来源（energySources）的默认配置工厂。
 * - 提供字段定义查询、可映射字段筛选、entity_id 前缀提取等工具。
 * - 提供从综合实体 / 同设备兄弟传感器推断字段映射的核心算法 inferEnergyMapping。
 *
 * 依赖：
 * - ./energy-attr-maps 静态映射表。
 * - @/utils/entity/derived.util 中的 getEntityDisplayName。
 *
 * 注意：
 * - `mode`（convention / entity / multi）为能源来源模式 key，不翻译。
 * - 字段 key（balance / dailyNum / ...）为配置 key，不翻译。
 */
import { getEntityDisplayName } from '@/utils/entity/derived.util'
export {
  type EnergyCategory,
  ENERGY_CONVENTION_PREFIX,
  ENERGY_FIELD_DEFS,
} from './energy-attr-maps'
import {
  ENERGY_CATEGORIES,
  type EnergyCategory,
  ENERGY_BALANCE_ATTR_KEYS,
  ENERGY_FIELD_ALIASES,
  ENERGY_FIELD_DEFS,
} from './energy-attr-maps'

/** 能源字段定义：在静态表项基础上扩展可选的列表回退与仅余额标记 */
export type EnergyFieldDef = (typeof ENERGY_FIELD_DEFS)[EnergyCategory][number] & {
  listAttrFallback?: string
  balanceAttrOnly?: boolean
}
/** 字段别名表的 key 联合类型 */
type EnergyFieldAliasKey = keyof typeof ENERGY_FIELD_ALIASES
/** 单个类别的默认 energySources 条目 */
export function createDefaultEnergySource() {
  return {
    mode: 'convention',
    account: '',
    accountEntries: [{ number: '', label: '' }],
    accountEntities: [{ entityId: '', label: '' }],
    multiAccounts: [{ label: '', entityId: '', entityMap: {} }],
    primaryAccountIndex: 0,
    entityId: '',
    attrMap: {},
    entityMap: {},
  }
}
/** 全部 6 类别的默认 energySources */
export function createDefaultEnergySources() {
  return Object.fromEntries(
    ENERGY_CATEGORIES.map((cat) => [cat, createDefaultEnergySource()]),
  ) as Record<EnergyCategory, ReturnType<typeof createDefaultEnergySource>>
}
/** UI 映射字段（排除仅用于弹窗图表的 list/object） */
export function getMappableFields(cat: EnergyCategory) {
  return ENERGY_FIELD_DEFS[cat].filter((f) => f.type === 'number' || f.type === 'string')
}
/**
 * 查询指定类别下指定 key 的字段定义。
 *
 * @param cat - 能源类别或字符串；非合法类别时返回 undefined。
 * @param fieldKey - 字段 key（如 `balance`、`dailyNum`）。
 * @returns 字段定义对象；未命中时返回 undefined。
 */
export function getFieldDef(cat: EnergyCategory | string, fieldKey: string): EnergyFieldDef | undefined {
  if (!(ENERGY_CATEGORIES as readonly string[]).includes(cat)) return undefined
  return ENERGY_FIELD_DEFS[cat as EnergyCategory].find((f) => f.key === fieldKey) as
    | EnergyFieldDef
    | undefined
}
/** 从 entityId 提取约定前缀 sensor.{prefix}_{account}_ */
function extractEntityPrefix(entityId: string | null | undefined): string {
  if (!entityId) return ''
  const i = entityId.lastIndexOf('_')
  return i > 0 ? entityId.substring(0, i + 1) : `${entityId}_`
}
/** 收集同前缀兄弟实体 */
function collectSiblingEntities(
  entityId: string,
  entities: Record<
    string,
    | {
        attributes?: Record<string, unknown>
      }
    | undefined
  >,
) {
  const prefix = extractEntityPrefix(entityId)
  if (!prefix) return []
  return Object.keys(entities || {})
    .filter((id) => id.startsWith(prefix) && id !== entityId)
    .map((id) => ({ id, ent: entities[id] }))
}
/**
 * 判定文本是否命中某字段的别名表（大小写不敏感）。
 * - 精确相等始终命中。
 * - ASCII 短别名（len&lt;6）仅精确 / 下划线分词，避免 `tier`⊂`frontier`、`price` 误伤。
 * - friendly_name（label）路径下所有 ASCII 别名均走分词，禁止裸 includes。
 * - 中文或长别名才允许 substring includes。
 */
function matchEnergyFieldAlias(
  fieldKey: string,
  text: string,
  mode: 'attr' | 'label' = 'attr',
): boolean {
  const aliases = ENERGY_FIELD_ALIASES[fieldKey as EnergyFieldAliasKey] || []
  const lower = String(text || '').toLowerCase()
  if (!lower) return false
  return aliases.some((a: string) => {
    const al = String(a).toLowerCase()
    if (!al) return false
    if (lower === al) return true
    const ascii = /^[a-z0-9_]+$/i.test(al)
    const tokenOnly = ascii && (al.length < 6 || mode === 'label')
    if (tokenOnly) {
      return (
        lower.startsWith(`${al}_`) ||
        lower.endsWith(`_${al}`) ||
        lower.includes(`_${al}_`)
      )
    }
    return lower.includes(al)
  })
}

/**
 * 收集某字段在综合实体上的候选属性名（defaultAttr 优先，再 catalog）。
 * source.util / inferEnergyMapping 共用，保证候选顺序一致。
 */
export function balanceAttrCandidatesForField(
  cat: EnergyCategory | string,
  fieldKey: string,
  def: EnergyFieldDef | undefined,
): string[] {
  const fromCatalog =
    (ENERGY_BALANCE_ATTR_KEYS as Record<string, Record<string, string[]>>)[cat]?.[fieldKey] || []
  const defaults = def?.defaultAttr ? [def.defaultAttr] : []
  return [...new Set([...defaults, ...fromCatalog])]
}

/**
 * 从综合实体 / 同设备兄弟传感器推断映射
 *
 * 按 mode（entity / multi / convention）分支：
 * - entity：优先从主实体属性匹配，再从兄弟实体后缀 / 别名匹配。
 * - multi：直接从兄弟实体后缀 / 别名匹配。
 * - list / object 类型字段仅在 entity 模式下从主实体属性匹配。
 *
 * @param cat - 能源类别。
 * @param entityId - 主实体 ID。
 * @param entities - 全量实体映射表。
 * @param mode - 推断模式，默认 `entity`。
 * @returns {{ attrMap: Record<string,string>, entityMap: Record<string,string>, matched: number }}
 *          attrMap 为字段 → 属性名，entityMap 为字段 → 兄弟实体 ID，matched 为命中数。
 */
export function inferEnergyMapping(
  cat: EnergyCategory,
  entityId: string,
  entities: Record<
    string,
    | {
        attributes?: Record<string, unknown>
        state?: string
      }
    | undefined
  >,
  mode: string = 'entity',
) {
  const attrMap: Record<string, string> = {}
  const entityMap: Record<string, string> = {}
  let matched = 0
  if (!entityId?.trim()) return { attrMap, entityMap, matched }
  const mainEnt = entities[entityId]
  const fields = ENERGY_FIELD_DEFS[cat]
  const siblings = collectSiblingEntities(entityId, entities)
  const prefix = extractEntityPrefix(entityId)
  const allCandidates = [{ id: entityId, ent: mainEnt, isMain: true }, ...siblings].filter(
    (c) => c.ent,
  )
  for (const field of fields) {
    if (field.type === 'list' || field.type === 'object') {
      if (mode !== 'entity') continue
      const attrs = mainEnt?.attributes || {}
      let found = false
      for (const key of Object.keys(attrs)) {
        if (matchEnergyFieldAlias(field.key, key) || key === field.defaultAttr) {
          attrMap[field.key] = key
          matched++
          found = true
          break
        }
      }
      if (!found) {
        const listField = field as EnergyFieldDef
        if (listField.listAttrFallback && attrs[listField.listAttrFallback]) {
          attrMap[field.key] = listField.listAttrFallback
          matched++
        }
      }
      continue
    }
    if (mode === 'entity') {
      const attrs = mainEnt?.attributes || {}
      let found = false
      for (const cand of balanceAttrCandidatesForField(cat, field.key, field)) {
        if (attrs[cand] !== undefined) {
          attrMap[field.key] = cand
          matched++
          found = true
          break
        }
      }
      if (found) continue
      for (const key of Object.keys(attrs)) {
        if (matchEnergyFieldAlias(field.key, key)) {
          attrMap[field.key] = key
          matched++
          found = true
          break
        }
      }
      if (found) continue
      for (const { id, ent } of allCandidates) {
        const suffix = id.slice(prefix.length).toLowerCase()
        const conv = (field.conventionSuffix || '').toLowerCase()
        if (
          (conv && suffix === conv) ||
          matchEnergyFieldAlias(field.key, suffix) ||
          matchEnergyFieldAlias(field.key, getEntityDisplayName(id, ent), 'label')
        ) {
          entityMap[field.key] = id
          matched++
          break
        }
      }
      continue
    }
    if (mode === 'multi') {
      for (const { id, ent } of allCandidates) {
        const suffix = id.slice(prefix.length).toLowerCase()
        const conv = (field.conventionSuffix || '').toLowerCase()
        if (
          (conv && suffix === conv) ||
          matchEnergyFieldAlias(field.key, suffix) ||
          matchEnergyFieldAlias(field.key, getEntityDisplayName(id, ent), 'label')
        ) {
          entityMap[field.key] = id
          matched++
          break
        }
      }
    }
  }
  return { attrMap, entityMap, matched }
}
