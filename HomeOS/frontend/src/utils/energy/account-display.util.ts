/**
 * @module energy-account-display.util
 * @description 生活账户展示行、标签与索引反查工具模块。
 *
 * 职责：
 * - 根据账户配置（实体模式 / 多账户模式 / 传统账户号模式）生成展示行。
 * - 在弹窗或底栏中，根据当前选中的实体 ID 反查账户索引与备注。
 * - 计算已配置账户的索引列表，供下拉选择等场景使用。
 *
 * 依赖：
 * - `energy-account-types.util`：账户展示行与源数据类型。
 * - `energy-account-input.util`：账户号字符串解析。
 * - `energy-account-entity.util`：实体 / 多账户条目解析。
 * - `energy-account-resolve.util`：账户条目聚合与主账户索引解析。
 */
import { getEntityLeaf } from '@homeos/shared'
import type {
  AccountDisplayRow,
  EnergyAccountSourceLike,
} from '@/utils/energy/account-types.util'
import { parseAccountString } from '@/utils/energy/account-input.util'
import {
  conventionBalanceEntityId,
  hasEntityMapValues,
  multiAccountEntryLabel,
  resolveAccountEntityEntries,
  resolveMultiAccountEntries,
} from '@/utils/energy/account-entity.util'
import {
  accountEntryLabel,
  resolveAccountEntries,
  resolveAccountNumbers,
  resolvePrimaryAccountIndex,
} from '@/utils/energy/account-resolve.util'

/**
 * 解析已配置账户的展示行列表（跳过空行，保留原始 rowIndex）。
 *
 * 根据配置模式分别处理：
 * - `entity`：以账户实体条目为单位，entityId 作为 key。
 * - `multi`：以多账户行为单位，entityId 或 `multi-${rowIndex}` 作为 key。
 * - 默认（传统账户号）：以账户号为 key。
 *
 * @param cfg 账户配置源数据，可能为 null / undefined。
 * @returns 展示行数组；cfg 为空时返回空数组。
 */
export function resolveAccountDisplayRows(
  cfg: EnergyAccountSourceLike | null | undefined,
): AccountDisplayRow[] {
  if (!cfg) return []
  if (cfg.mode === 'entity') {
    const rows = Array.isArray(cfg.accountEntities)
      ? cfg.accountEntities
      : resolveAccountEntityEntries(cfg)
    return rows
      .map((entry, rowIndex) => ({ entry, rowIndex }))
      .filter(({ entry }) => String(entry?.entityId ?? '').trim())
      .map(({ entry, rowIndex }) => ({
        rowIndex,
        key: String(entry.entityId).trim(),
        label: entry.label?.trim() || getEntityLeaf(entry.entityId) || `账户 ${rowIndex + 1}`,
      }))
  }
  if (cfg.mode === 'multi') {
    const rows = Array.isArray(cfg.multiAccounts)
      ? cfg.multiAccounts
      : resolveMultiAccountEntries(cfg)
    return rows
      .map((row, rowIndex) => ({ row, rowIndex }))
      .filter(({ row }) => row.entityId.trim() || hasEntityMapValues(row.entityMap))
      .map(({ row, rowIndex }) => ({
        rowIndex,
        key: row.entityId.trim() || `multi-${rowIndex}`,
        label: multiAccountEntryLabel(row, rowIndex),
      }))
  }
  const rows = Array.isArray(cfg.accountEntries)
    ? cfg.accountEntries
    : parseAccountString(cfg.account)
  return rows
    .map((entry, rowIndex) => ({ entry, rowIndex }))
    .filter(({ entry }) => String(entry?.number ?? '').trim())
    .map(({ entry, rowIndex }) => ({
      rowIndex,
      key: String(entry.number).trim(),
      label: accountEntryLabel(
        { number: String(entry.number).trim(), label: String(entry.label ?? '').trim() },
        rowIndex,
      ),
    }))
}

/**
 * 弹窗场景：根据当前选中实体 ID 反查账户索引。
 *
 * 查找顺序：
 * 1. 若未提供实体 ID，则按各模式条目数计算主账户索引。
 * 2. entity 模式：在账户实体条目中按 entityId 匹配。
 * 3. multi 模式：在多账户行的 entityId 及 entityMap 值中匹配。
 * 4. convention / 默认模式：通过 `conventionBalanceEntityId` 推算余额实体 ID 后比对。
 * 5. 仍未命中时回退到主账户索引。
 *
 * @param cfg 账户配置源数据。
 * @param cat 账户类别（用于约定式实体 ID 推算）。
 * @param activeEntityId 当前选中的实体 ID。
 * @returns 命中的账户索引；未命中时返回主账户索引（默认 0）。
 */
export function resolveAccountIndexForEntityId(
  cfg: EnergyAccountSourceLike | null | undefined,
  cat: string,
  activeEntityId: string | null | undefined,
): number {
  const eid = String(activeEntityId || '').trim()
  if (!cfg) return 0
  if (!eid) {
    const count =
      cfg.mode === 'entity'
        ? resolveAccountEntityEntries(cfg).length
        : cfg.mode === 'multi'
          ? resolveMultiAccountEntries(cfg).length
          : resolveAccountNumbers(cfg).length
    return resolvePrimaryAccountIndex(cfg, count || undefined)
  }
  if (cfg.mode === 'entity') {
    const idx = resolveAccountEntityEntries(cfg).findIndex((entry) => entry.entityId === eid)
    if (idx >= 0) return idx
  }
  if (cfg.mode === 'multi') {
    const idx = resolveMultiAccountEntries(cfg).findIndex((row) => {
      if (row.entityId === eid) return true
      return Object.values(row.entityMap || {}).some((v) => String(v || '').trim() === eid)
    })
    if (idx >= 0) return idx
  }
  if (cfg.mode === 'convention' || !cfg.mode) {
    if (Array.isArray(cfg.accountEntries)) {
      for (let i = 0; i < cfg.accountEntries.length; i += 1) {
        const num = String(cfg.accountEntries[i]?.number ?? '').trim()
        if (num && conventionBalanceEntityId(cat, num) === eid) return i
      }
    }
    const numbers = resolveAccountNumbers(cfg)
    for (let i = 0; i < numbers.length; i += 1) {
      if (conventionBalanceEntityId(cat, numbers[i]) === eid) return i
    }
  }
  const fallbackCount =
    cfg.mode === 'entity'
      ? resolveAccountEntityEntries(cfg).length
      : cfg.mode === 'multi'
        ? resolveMultiAccountEntries(cfg).length
        : resolveAccountNumbers(cfg).length
  return resolvePrimaryAccountIndex(cfg, fallbackCount || undefined)
}

/**
 * 弹窗 / 底栏场景：按实体 ID 反查账户备注（展示标签）。
 *
 * 依次在实体条目、传统账户条目、多账户行中查找匹配的 entityId，
 * 命中后返回对应条目的展示标签；未命中返回空字符串。
 *
 * @param cat 账户类别（用于约定式实体 ID 推算）。
 * @param entityId 待查询的实体 ID。
 * @param cfg 账户配置源数据。
 * @returns 账户备注 / 标签；未命中时返回空字符串。
 */
export function resolveAccountLabelForEntityId(
  cat: string,
  entityId: string,
  cfg: EnergyAccountSourceLike | null | undefined,
): string {
  const eid = String(entityId || '').trim()
  if (!eid || !cfg) return ''

  const entityEntries = resolveAccountEntityEntries(cfg)
  const entityIdx = entityEntries.findIndex((e) => e.entityId === eid)
  if (entityIdx >= 0) {
    const entry = entityEntries[entityIdx]
    return entry.label?.trim() || `账户 ${entityIdx + 1}`
  }

  const convEntries = resolveAccountEntries(cfg)
  const convIdx = convEntries.findIndex(
    (entry) => conventionBalanceEntityId(cat, entry.number) === eid,
  )
  if (convIdx >= 0) return accountEntryLabel(convEntries[convIdx], convIdx)

  const multiEntries = resolveMultiAccountEntries(cfg)
  const multiIdx = multiEntries.findIndex((row) => {
    if (row.entityId === eid) return true
    return Object.values(row.entityMap || {}).includes(eid)
  })
  if (multiIdx >= 0) return multiAccountEntryLabel(multiEntries[multiIdx], multiIdx)

  return ''
}

/**
 * 解析已配置账户的索引列表（跳过空行）。
 *
 * 用于下拉选择等场景，仅返回存在有效条目的索引；
 * 若全部为空则回退为 `[0]`，保证调用方至少有一个可选项。
 *
 * @param cfg 账户配置源数据。
 * @returns 已配置账户的索引数组；无任何配置时返回 `[0]`。
 */
export function resolveConfiguredAccountIndices(
  cfg: EnergyAccountSourceLike | null | undefined,
): number[] {
  if (!cfg) return [0]
  if (cfg.mode === 'entity') {
    const indices = resolveAccountEntityEntries(cfg)
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.entityId.trim())
      .map(({ index }) => index)
    return indices.length ? indices : [0]
  }
  if (cfg.mode === 'multi') {
    const indices = resolveMultiAccountEntries(cfg)
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.entityId.trim() || hasEntityMapValues(row.entityMap))
      .map(({ index }) => index)
    return indices.length ? indices : [0]
  }
  const numbers = resolveAccountNumbers(cfg)
  if (Array.isArray(cfg.accountEntries) && cfg.accountEntries.length) {
    const indices = cfg.accountEntries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => String(entry?.number ?? '').trim())
      .map(({ index }) => index)
    return indices.length ? indices : [0]
  }
  return numbers.length ? numbers.map((_, index) => index) : [0]
}
