/**
 * @module energy-source.util
 * @description 能源统计绑定解析器（纯函数），支持 convention / entity / multi 三种模式。
 *
 * 职责：
 * - 从 layoutConfig.statsSensors 解析各类别能源的有效配置。
 * - 按字段定义从 HA 实体映射中读取原始字段值（含多账户合计）。
 * - 解析主实体 ID、功率实体 ID、多账户选项、实体前缀等。
 * - 收集能源模块需订阅的实体 ID 集合（供 WS 订阅使用）。
 *
 * 依赖：
 * - `energy-fields`：能源类别、字段定义、约定前缀等常量。
 * - `energy-entity-read.util`：实体属性读取。
 * - `energy-account.util`：账户条目解析与索引选取。
 * - `core/misc.util`：JSON 宽松解析。
 */
import {
  ENERGY_CATEGORIES,
  ENERGY_CONVENTION_PREFIX,
  ENERGY_FIELD_DEFS,
  createDefaultEnergySource,
  getFieldDef,
  balanceAttrCandidatesForField,
  type EnergyCategory,
  type EnergyFieldDef,
} from '@/constants/energy-fields'
import { readEntityAttr } from '@/utils/energy/entity-read.util'
import {
  resolveAccountNumbers,
  resolveAccountEntityEntries,
  resolveMultiAccountEntries,
  resolveMultiAccountEntityMap,
  resolveConfiguredAccountIndices,
  resolveConventionAccountAtIndex,
  resolvePrimaryAccountRowIndex,
  resolveRawAccountRowCount,
} from '@/utils/energy/account.util'
import type { HaEntityState } from '@/types/entity-store'
import type { EnergyAccountSourceLike } from '@/utils/energy/account-types.util'
import { parseJsonLoose } from '@/utils/core/misc.util'

type StatsSensors = {
  energySources?: Partial<Record<EnergyCategory, Record<string, unknown>>>
  powerEntityId?: string
  meterEntityId?: string
}

type EntityMap = Record<string, HaEntityState | undefined>

type EnergySourceCfg = EnergyAccountSourceLike & {
  attrMap?: Record<string, string>
  entities?: Array<{ entityId?: string }>
}

/**
 * entity 模式下解析指定账户索引的主实体 ID。
 * resolveTargetEntityId / resolvePrimaryEntityId 共用，避免双份分支漂移。
 */
function resolveEntityModePrimaryId(cfg: EnergySourceCfg, accountIndex = 0): string {
  if (Array.isArray(cfg.accountEntities) && cfg.accountEntities.length) {
    const rows = cfg.accountEntities
    const direct = String(rows[accountIndex]?.entityId ?? '').trim()
    if (direct) return direct
    const pi = resolvePrimaryAccountRowIndex(cfg, rows.length)
    return (
      String(rows[pi]?.entityId ?? '').trim() ||
      rows.map((r: { entityId?: string }) => String(r?.entityId ?? '').trim()).find(Boolean) ||
      ''
    )
  }
  const entityEntries = resolveAccountEntityEntries(cfg)
  if (entityEntries.length) {
    const direct = String(entityEntries[accountIndex]?.entityId ?? '').trim()
    if (direct) return direct
    const pi = resolvePrimaryAccountRowIndex(cfg, entityEntries.length)
    return entityEntries[pi]?.entityId?.trim() || entityEntries[0]?.entityId?.trim() || ''
  }
  return cfg.entityId?.trim() || ''
}

/**
 * 解析 entity 模式下指定账户索引对应的目标实体 ID；其它模式取顶层 entityId。
 *
 * @param cfg 能源源配置。
 * @param accountIndex 账户索引，默认 0。
 * @returns 目标实体 ID；无可用配置时返回空字符串。
 */
function resolveTargetEntityId(cfg: EnergySourceCfg, accountIndex = 0): string {
  if (cfg.mode === 'entity') {
    return resolveEntityModePrimaryId(cfg, accountIndex)
  }
  return cfg.entityId?.trim() || ''
}

/**
 * 从 layoutConfig.statsSensors 解析指定类别的有效能源配置。
 *
 * 合并默认配置与原始配置；convention 模式下额外 trim account 字段。
 * 同一 stats/cat 连续调用会复用结果，降低账户×字段热路径开销。
 *
 * @param statsSensors 统计传感器配置对象。
 * @param cat 能源类别。
 * @returns 规范化后的能源配置对象。
 */
type NormalizedEnergySourceCfg = EnergySourceCfg & ReturnType<typeof createDefaultEnergySource>

/** 同一 statsSensors 对象上按 category 复用规范化结果（多类别轮询不再单槽互斥）。 */
const normalizeEnergySourceCache = new WeakMap<object, Map<string, NormalizedEnergySourceCfg>>()
let normalizeEnergySourceNullCache: Map<string, NormalizedEnergySourceCfg> | null = null

/** normalizeEnergySource：函数，按签名入参返回处理结果。 */
export function normalizeEnergySource(
  statsSensors: StatsSensors | null | undefined,
  cat: EnergyCategory | string,
) {
  const key = String(cat)
  let byCat: Map<string, NormalizedEnergySourceCfg> | null | undefined
  if (statsSensors && typeof statsSensors === 'object') {
    byCat = normalizeEnergySourceCache.get(statsSensors)
    if (!byCat) {
      byCat = new Map()
      normalizeEnergySourceCache.set(statsSensors, byCat)
    }
  } else {
    byCat = normalizeEnergySourceNullCache || (normalizeEnergySourceNullCache = new Map())
  }
  const hit = byCat.get(key)
  if (hit) return hit
  const stats = statsSensors || {}
  const raw = stats.energySources?.[cat as EnergyCategory]
  const base = {
    ...createDefaultEnergySource(),
    ...((raw || {}) as Partial<ReturnType<typeof createDefaultEnergySource>>),
  } as NormalizedEnergySourceCfg
  const cfg =
    base.mode === 'convention' ? { ...base, account: base.account?.trim() || '' } : base
  byCat.set(key, cfg)
  return cfg
}

/**
 * 按约定规则拼装实体 ID：`sensor.{prefix}_{account后4位}_{suffix}`。
 *
 * @param cat 能源类别。
 * @param account 账户号码。
 * @param suffix 后缀（如 balance / power / 日用量等）。
 * @returns 拼装的实体 ID；账户号或后缀为空时返回空字符串。
 */
function conventionEntityId(
  cat: EnergyCategory | string,
  account: string | null | undefined,
  suffix: string | null | undefined,
) {
  const acc = String(account || '').trim()
  if (!acc || !suffix) return ''
  const prefix = (ENERGY_CONVENTION_PREFIX as Record<string, string>)[cat]
  const base = acc.slice(-4)
  return `sensor.${prefix}_${base}_${suffix}`
}

/**
 * 读取实体的 state 值，过滤 HA 的无效状态（unavailable / unknown）。
 *
 * @param entities 实体映射表。
 * @param entityId 实体 ID。
 * @returns state 字符串；实体不存在或状态无效时返回 undefined。
 */
export function readEntityState(entities: EntityMap, entityId: string | null | undefined) {
  if (!entityId) return undefined
  const ent = entities[entityId]
  if (!ent) return undefined
  const state = ent.state
  if (state === 'unavailable' || state === 'unknown') return undefined
  return state
}

/**
 * 将值宽松解析为 JSON；解析失败时返回原始值（'raw' 模式）。
 *
 * @param val 原始值（可能是 JSON 字符串、数字、对象等）。
 * @returns 解析后的值。
 */
export function parseJsonValue(val: unknown) {
  return parseJsonLoose(val, 'raw')
}

function balanceEntityId(cat: EnergyCategory | string, account: string | null | undefined) {
  return conventionEntityId(cat, account, 'balance')
}

/**
 * 从约定模式的 balance 实体 attributes 中按候选键读取字段值。
 *
 * 依次尝试候选键，返回首个非空值。
 *
 * @param cat 能源类别。
 * @param fieldKey 字段 key。
 * @param def 字段定义。
 * @param entities 实体映射表。
 * @param account 账户号码。
 * @returns 字段值；无法读取时返回 undefined。
 */
function readBalanceField(
  cat: EnergyCategory | string,
  fieldKey: string,
  def: EnergyFieldDef | undefined,
  entities: EntityMap,
  account: string,
) {
  const mainId = balanceEntityId(cat, account)
  if (!mainId) return undefined
  for (const key of balanceAttrCandidatesForField(cat, fieldKey, def)) {
    const val = readEntityAttr(entities, mainId, key)
    if (val !== undefined && val !== null && val !== '') return val
  }
  return undefined
}

/**
 * 解析弹窗场景下的余额实体 ID。
 *
 * entity 模式直接返回主 entityId；约定模式根据激活实体派生前缀后拼接 `balance`；
 * 其余情况回退到主实体 ID。
 *
 * @param cat 能源类别。
 * @param statsSensors 统计传感器配置。
 * @param activeEntityId 当前激活的实体 ID。
 * @returns 余额实体 ID。
 */
export function resolvePopupBalanceId(
  cat: EnergyCategory | string,
  statsSensors: StatsSensors | null | undefined,
  activeEntityId: string | null | undefined,
) {
  const cfg = normalizeEnergySource(statsSensors, cat)
  if (cfg.mode === 'entity' && cfg.entityId?.trim()) return cfg.entityId.trim()
  if (activeEntityId) {
    const prefix = resolveEntityPrefix(cat, statsSensors, activeEntityId)
    if (prefix) return prefix + 'balance'
  }
  return resolvePrimaryEntityId(cat, statsSensors)
}

/**
 * 判断字段是否可跨账户合计。
 *
 * list / object / string 类型不可合计；日期 / 时间类字段不可合计；
 * number 类型、balance 字段、带单位的字段可合计。
 *
 * @param fieldKey 字段 key。
 * @param def 字段定义。
 * @returns 可合计返回 true，否则返回 false。
 */
function isAggregatableField(fieldKey: string, def: EnergyFieldDef | undefined): boolean {
  if (!def) return false
  if (def.type === 'list' || def.type === 'object') return false
  if (def.type === 'string') return false
  if (fieldKey.includes('Date') || fieldKey.includes('Time') || fieldKey === 'refreshTime')
    return false
  return def.type === 'number' || fieldKey === 'balance' || !!def.unit
}

/**
 * 多账户字段合计（底栏 accountIndex = -1 场景）。
 *
 * 仅 1 个账户时直接返回单账户值；不可合计字段返回主账户值；
 * 可合计字段遍历所有已配置账户求和，跳过无效值。
 *
 * @param cat 能源类别。
 * @param fieldKey 字段 key。
 * @param statsSensors 统计传感器配置。
 * @param entities 实体映射表。
 * @returns 合计值；无任何有效值时返回 undefined。
 */
export function resolveFieldRawAggregated(
  cat: EnergyCategory | string,
  fieldKey: string,
  statsSensors: StatsSensors | null | undefined,
  entities: EntityMap,
) {
  const cfg = normalizeEnergySource(statsSensors, cat)
  const def = getFieldDef(cat as EnergyCategory, fieldKey)
  if (!def) return undefined
  const indices = resolveConfiguredAccountIndices(cfg)
  if (indices.length <= 1) {
    return resolveFieldRaw(cat, fieldKey, statsSensors, entities, indices[0] ?? 0, cfg)
  }
  if (!isAggregatableField(fieldKey, def)) {
    const primaryIdx = resolvePrimaryAccountRowIndex(cfg, resolveRawAccountRowCount(cfg))
    const preferred = indices.includes(primaryIdx) ? primaryIdx : indices[0]
    return resolveFieldRaw(cat, fieldKey, statsSensors, entities, preferred, cfg)
  }
  let sum = 0
  let hasAny = false
  for (const idx of indices) {
    const raw = resolveFieldRaw(cat, fieldKey, statsSensors, entities, idx, cfg)
    if (raw == null || raw === '' || raw === '--' || raw === 'unavailable' || raw === 'unknown')
      continue
    const num = parseFloat(String(raw))
    if (Number.isNaN(num)) continue
    sum += num
    hasAny = true
  }
  return hasAny ? sum : undefined
}

/**
 * 解析单个逻辑字段的原始值（非格式化）。
 *
 * 按 convention / entity / multi 三种模式分别处理：
 * - convention：按账户号约定实体 ID，从 balance 实体或同源兄弟实体读取。
 * - entity：按 attrMap / entityMap 映射，从主实体或兄弟实体读取。
 * - multi：按 entityMap 中字段对应的实体 ID 读取 state。
 *
 * list / object 类型字段会尝试 JSON 解析；balance 字段优先读 state。
 *
 * @param cat 能源类别。
 * @param fieldKey 字段 key。
 * @param statsSensors 统计传感器配置。
 * @param entities 实体映射表。
 * @param accountIndex 账户索引，默认 0。
 * @param cfgOverride 已规范化的能源配置；传入时可跳过重复 normalize。
 * @returns 字段原始值；无法解析时返回 undefined。
 */
export function resolveFieldRaw(
  cat: EnergyCategory | string,
  fieldKey: string,
  statsSensors: StatsSensors | null | undefined,
  entities: EntityMap,
  accountIndex = 0,
  cfgOverride?: NormalizedEnergySourceCfg,
) {
  const cfg = cfgOverride ?? normalizeEnergySource(statsSensors, cat)
  const def = getFieldDef(cat as EnergyCategory, fieldKey)
  if (!def) return undefined
  const accounts = resolveAccountNumbers(cfg)
  if (cfg.mode === 'convention') {
    const account =
      Array.isArray(cfg.accountEntries) && cfg.accountEntries.length
        ? resolveConventionAccountAtIndex(cfg, accountIndex)
        : accounts[accountIndex] || accounts[0] || ''
    if (!account) return undefined
    if (def.type === 'list' || def.type === 'object') {
      const mainId = balanceEntityId(cat, account)
      const attrName = def.defaultAttr || def.listAttrFallback
      const val = parseJsonValue(readEntityAttr(entities, mainId, attrName))
      if (val != null && val !== '') return val
      if (def.conventionSuffix) {
        const chartEnt = conventionEntityId(cat, account, def.conventionSuffix)
        const chartAttr = def.listAttrFallback || def.defaultAttr
        return parseJsonValue(readEntityAttr(entities, chartEnt, chartAttr))
      }
      return undefined
    }
    if (fieldKey === 'balance') {
      return readEntityState(entities, balanceEntityId(cat, account))
    }
    if (def.balanceAttrOnly || !def.conventionSuffix) {
      const fromBalance = readBalanceField(cat, fieldKey, def, entities, account)
      if (fromBalance !== undefined) return fromBalance
    }
    if (def.conventionSuffix) {
      const entityId = conventionEntityId(cat, account, def.conventionSuffix)
      const st = readEntityState(entities, entityId)
      if (st !== undefined) return st
    }
    return readBalanceField(cat, fieldKey, def, entities, account)
  }
  if (cfg.mode === 'entity') {
    const entityId = resolveTargetEntityId(cfg, accountIndex)
    if (!entityId) return undefined
    const attrName = cfg.attrMap?.[fieldKey]?.trim()
    if (fieldKey === 'balance' && !attrName) {
      const bal = readEntityState(entities, entityId)
      if (bal !== undefined) return bal
    }
    if (def.type === 'list' || def.type === 'object') {
      const keys = attrName ? [attrName] : balanceAttrCandidatesForField(cat, fieldKey, def)
      for (const key of keys) {
        const val = parseJsonValue(readEntityAttr(entities, entityId, key))
        if (val != null && val !== '') return val
      }
      if (def.conventionSuffix) {
        const prefix = resolveEntityPrefix(cat, statsSensors, entityId)
        const chartEnt = prefix ? prefix + def.conventionSuffix : ''
        if (chartEnt && entities[chartEnt]) {
          return parseJsonValue(
            readEntityAttr(entities, chartEnt, def.listAttrFallback || def.defaultAttr),
          )
        }
      }
      return undefined
    }
    if (attrName) {
      const attrVal = readEntityAttr(entities, entityId, attrName)
      if (attrVal !== undefined) return attrVal
    }
    const mappedEntity = cfg.entityMap?.[fieldKey]?.trim()
    if (mappedEntity) {
      const st = readEntityState(entities, mappedEntity)
      if (st !== undefined) return st
    }
    for (const key of balanceAttrCandidatesForField(cat, fieldKey, def)) {
      const attrVal = readEntityAttr(entities, entityId, key)
      if (attrVal !== undefined && attrVal !== null && attrVal !== '') return attrVal
    }
    const prefix = resolveEntityPrefix(cat, statsSensors, entityId)
    if (prefix && def.conventionSuffix) {
      const sibling = readEntityState(entities, prefix + def.conventionSuffix)
      if (sibling !== undefined) return sibling
    }
    if (fieldKey === 'balance') return readEntityState(entities, entityId)
    return undefined
  }
  if (cfg.mode === 'multi') {
    const map = resolveMultiAccountEntityMap(cfg, accountIndex)
    if (def.type === 'list' || def.type === 'object') {
      const mapped = map[fieldKey]?.trim()
      const candidates = [
        mapped,
        map.balance?.trim(),
        resolvePrimaryEntityId(cat, statsSensors, accountIndex),
      ].filter(Boolean) as string[]
      for (const entityId of candidates) {
        if (mapped && entityId === mapped) {
          const st = readEntityState(entities, entityId)
          if (st !== undefined) {
            const parsed = parseJsonValue(st)
            if (parsed != null && parsed !== '') return parsed
          }
        }
        const keys = balanceAttrCandidatesForField(cat, fieldKey, def)
        for (const key of keys) {
          const val = parseJsonValue(readEntityAttr(entities, entityId, key))
          if (val != null && val !== '') return val
        }
      }
      return undefined
    }
    const entityId = map[fieldKey]?.trim()
    return readEntityState(entities, entityId)
  }
  return undefined
}

/**
 * 解析主实体 ID（弹窗 / 分析用）。
 *
 * 各模式分别选取：
 * - entity：accountEntities 或解析结果中按索引 / 主行取 entityId。
 * - multi：multiAccounts 中按索引 / 主行取 entityId 或 entityMap.balance。
 * - convention：按账户号拼装 balance 实体 ID。
 *
 * @param cat 能源类别。
 * @param statsSensors 统计传感器配置。
 * @param accountIndex 账户索引，默认 0。
 * @returns 主实体 ID；无配置时返回空字符串。
 */
export function resolvePrimaryEntityId(
  cat: EnergyCategory | string,
  statsSensors: StatsSensors | null | undefined,
  accountIndex = 0,
) {
  const cfg = normalizeEnergySource(statsSensors, cat)
  if (cfg.mode === 'entity') {
    return resolveEntityModePrimaryId(cfg, accountIndex)
  }
  if (cfg.mode === 'multi') {
    const rows =
      Array.isArray(cfg.multiAccounts) && cfg.multiAccounts.length
        ? cfg.multiAccounts
        : resolveMultiAccountEntries(cfg)
    if (rows.length) {
      const pi = resolvePrimaryAccountRowIndex(cfg, rows.length)
      const row = rows[accountIndex] || rows[pi] || rows[0]
      return (
        row?.entityId?.trim() ||
        row?.entityMap?.balance?.trim() ||
        Object.values(row?.entityMap || {}).find((v) => String(v || '').trim()) ||
        ''
      )
    }
    return (
      cfg.entityMap?.balance?.trim() ||
      Object.values(cfg.entityMap || {}).find((v) => String(v || '').trim()) ||
      ''
    )
  }
  const account = resolveConventionAccountAtIndex(cfg, accountIndex)
  if (account) {
    return conventionEntityId(cat, account, 'balance')
  }
  return ''
}

/**
 * 解析功率实体 ID（能源分析 API 用，仅 grid 类别）。
 *
 * 禁止用余额实体冒充功率实体：multi / entity 模式从 entityMap.power 取；
 * convention 模式按账户号拼装 power 后缀实体 ID，且需在 entities 中存在。
 *
 * @param statsSensors 统计传感器配置。
 * @param entities 实体映射表（用于校验实体存在性）。
 * @param accountIndex 账户索引，默认 0。
 * @returns 功率实体 ID；不存在时返回空字符串。
 */
export function resolvePowerEntityId(
  statsSensors: StatsSensors | null | undefined,
  entities: EntityMap,
  accountIndex = 0,
) {
  const cfg = normalizeEnergySource(statsSensors, 'grid')
  if (cfg.mode === 'multi') {
    const map = resolveMultiAccountEntityMap(cfg, accountIndex)
    const mapped = map.power?.trim()
    if (mapped && entities[mapped]) return mapped
    return ''
  }
  if (cfg.mode === 'entity') {
    const mapped = cfg.entityMap?.power?.trim()
    if (mapped && entities[mapped]) return mapped
    return ''
  }
  const account = resolveConventionAccountAtIndex(cfg, accountIndex)
  if (!account) return ''
  const id = conventionEntityId('grid', account, 'power')
  return entities[id] ? id : ''
}

/**
 * 解析多账户选项列表（用于弹窗账户切换）。
 *
 * entity 模式返回所有 entityId；multi 模式返回各行的 entityId / balance；
 * convention 模式按账户号拼装 balance 实体 ID。
 *
 * @param cat 能源类别。
 * @param statsSensors 统计传感器配置。
 * @returns 实体 ID 数组。
 */
export function resolveAccountEntityIds(
  cat: EnergyCategory | string,
  statsSensors: StatsSensors | null | undefined,
) {
  const cfg = normalizeEnergySource(statsSensors, cat)
  if (cfg.mode === 'entity') {
    const entityEntries = resolveAccountEntityEntries(cfg)
    if (entityEntries.length) {
      return entityEntries.map((e) => e.entityId).filter(Boolean)
    }
    const id = cfg.entityId?.trim()
    return id ? [id] : []
  }
  if (cfg.mode === 'multi') {
    return resolveMultiAccountEntries(cfg)
      .map((row) => row.entityId?.trim() || row.entityMap?.balance?.trim() || '')
      .filter(Boolean)
  }
  return resolveAccountNumbers(cfg)
    .map((acc) => conventionEntityId(cat, acc, 'balance'))
    .filter(Boolean)
}

/**
 * 解析约定模式的实体 ID 前缀（用于派生兄弟实体，如日用量、曲线等）。
 *
 * entity 模式从主 entityId 截取最后一个 `_` 之前的部分；
 * convention 模式从 eid 或账户号派生前缀 `sensor.{prefix}_{后4位}_`。
 *
 * @param cat 能源类别。
 * @param statsSensors 统计传感器配置。
 * @param entityId 参考实体 ID。
 * @param accountIndex 账户索引，默认 0。
 * @returns 实体 ID 前缀字符串。
 */
export function resolveEntityPrefix(
  cat: EnergyCategory | string,
  statsSensors: StatsSensors | null | undefined,
  entityId: string | null | undefined,
  accountIndex = 0,
) {
  const cfg = normalizeEnergySource(statsSensors, cat)
  const eid = entityId || resolvePrimaryEntityId(cat, statsSensors, accountIndex)
  if (cfg.mode === 'entity') {
    const mainId = String(eid || cfg.entityId || '').trim()
    if (mainId) {
      const i = mainId.lastIndexOf('_')
      if (i > 0) return mainId.substring(0, i + 1)
      return `${mainId}_`
    }
  }
  if (cfg.mode === 'convention' || !cfg.mode) {
    if (eid) {
      const i = eid.lastIndexOf('_')
      if (i > 0) return eid.substring(0, i + 1)
    }
    const account = resolveConventionAccountAtIndex(cfg, accountIndex)
    if (account) {
      const prefix = (ENERGY_CONVENTION_PREFIX as Record<string, string>)[cat]
      return `sensor.${prefix}_${account.slice(-4)}_`
    }
  }
  if (eid) {
    const i = eid.lastIndexOf('_')
    return i > 0 ? eid.substring(0, i + 1) : `${eid}_`
  }
  return ''
}

/**
 * 格式化数字为指定小数位数的字符串。
 *
 * @param val 原始值。
 * @param decimals 小数位数，默认 2。
 * @returns 格式化后的字符串；无效值返回 '--'。
 */
export function formatNum(val: unknown, decimals = 2) {
  if (val === '--' || val === null || val === undefined) return '--'
  const num = parseFloat(String(val))
  return Number.isNaN(num) ? '--' : num.toFixed(decimals)
}

function addWatchedId(ids: Set<string>, id: string | null | undefined) {
  const v = String(id || '').trim()
  if (v) ids.add(v)
}

function addWatchedEntityMap(ids: Set<string>, map: Record<string, string> | null | undefined) {
  if (!map) return
  for (const mapped of Object.values(map)) addWatchedId(ids, mapped)
}

/**
 * 收集约定 / 实体前缀下的兄弟 sensor ID（日用量、曲线列表等）。
 *
 * 遍历字段定义中带 conventionSuffix 的字段，按账户号或前缀拼装兄弟实体 ID。
 * grid 类别额外收集 power 后缀实体。
 *
 * @param ids 收集目标集合。
 * @param cat 能源类别。
 * @param accountOrPrefix 账户号或前缀对象。
 */
function addConventionFieldEntities(
  ids: Set<string>,
  cat: EnergyCategory,
  accountOrPrefix: { account?: string; prefix?: string },
) {
  const fields = ENERGY_FIELD_DEFS[cat] || []
  for (const field of fields) {
    const suffix = String((field as EnergyFieldDef).conventionSuffix || '').trim()
    if (!suffix) continue
    if (accountOrPrefix.account) {
      addWatchedId(ids, conventionEntityId(cat, accountOrPrefix.account, suffix))
    } else if (accountOrPrefix.prefix) {
      addWatchedId(ids, accountOrPrefix.prefix + suffix)
    }
  }
  if (cat === 'grid') {
    if (accountOrPrefix.account) {
      addWatchedId(ids, conventionEntityId(cat, accountOrPrefix.account, 'power'))
    } else if (accountOrPrefix.prefix) {
      addWatchedId(ids, accountOrPrefix.prefix + 'power')
    }
  }
}

/**
 * 收集能源模块需订阅（watch）的全部实体 ID。
 *
 * 遍历所有能源类别，按模式收集：
 * - 多账户选项中的实体 ID。
 * - 主 entityId 与 entityMap 中的映射实体。
 * - convention / entity 模式下的兄弟 sensor。
 * - multi 模式下各行及其 entityMap。
 * - 顶层 powerEntityId / meterEntityId。
 *
 * 用于 WS 订阅注册，确保能源面板数据实时更新。
 *
 * @param statsSensors 统计传感器配置。
 * @returns 去重后的实体 ID 数组。
 */
export function collectEnergyWatchedEntityIds(statsSensors: StatsSensors | null | undefined) {
  const stats = statsSensors || {}
  const ids = new Set<string>()
  for (const cat of ENERGY_CATEGORIES) {
    for (const id of resolveAccountEntityIds(cat, stats)) {
      addWatchedId(ids, id)
    }
    const cfg = normalizeEnergySource(stats, cat)
    addWatchedId(ids, cfg.entityId)
    addWatchedEntityMap(ids, cfg.entityMap)

    if (cfg.mode === 'convention' || !cfg.mode) {
      for (const account of resolveAccountNumbers(cfg)) {
        addConventionFieldEntities(ids, cat, { account })
      }
    }

    if (cfg.mode === 'entity') {
      for (const entry of resolveAccountEntityEntries(cfg)) {
        addWatchedId(ids, entry.entityId)
        if (entry.entityId) {
          const prefix = resolveEntityPrefix(cat, stats, entry.entityId)
          if (prefix) addConventionFieldEntities(ids, cat, { prefix })
        }
      }
      const mainId = cfg.entityId?.trim()
      if (mainId) {
        const prefix = resolveEntityPrefix(cat, stats, mainId)
        if (prefix) addConventionFieldEntities(ids, cat, { prefix })
      }
    }

    if (cfg.mode === 'multi') {
      for (const row of resolveMultiAccountEntries(cfg)) {
        addWatchedId(ids, row.entityId)
        addWatchedEntityMap(ids, row.entityMap)
        if (row.entityId) {
          const prefix = resolveEntityPrefix(cat, stats, row.entityId)
          if (prefix) addConventionFieldEntities(ids, cat, { prefix })
        }
      }
      if (Array.isArray(cfg.entities)) {
        for (const row of cfg.entities) {
          addWatchedId(ids, row?.entityId)
        }
      }
    }
  }
  addWatchedId(ids, stats.powerEntityId || stats.meterEntityId)
  return [...ids]
}

