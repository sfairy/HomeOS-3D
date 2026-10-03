/**
 * @module energy-account-resolve.util
 * @description 生活账户条目解析与主账户选取工具模块。
 *
 * 职责：
 * - 解析有效账户条目列表（优先 accountEntries，回退 account 逗号串）。
 * - 计算主账户索引与主账户号码（兼容 entity / multi / convention 三种模式）。
 * - 生成账户条目的展示标签。
 * - 统计原始账户行数（含空行，用于编辑场景）。
 *
 * 依赖：
 * - `energy-account-types.util`：账户类型与主账户行索引解析。
 * - `energy-account-input.util`：账户号字符串解析。
 * - `energy-account-entity.util`：实体 / 多账户条目解析。
 */
import {
  resolvePrimaryAccountRowIndex,
  type EnergyAccountEntry,
  type EnergyAccountSourceLike,
} from '@/utils/energy/account-types.util'
import { parseAccountString } from '@/utils/energy/account-input.util'
import {
  resolveAccountEntityEntries,
  resolveMultiAccountEntries,
} from '@/utils/energy/account-entity.util'

/**
 * 解析有效账户条目列表（优先 accountEntries，回退 account 逗号串）。
 *
 * @param cfg 账户配置源数据。
 * @returns 去除空号后的账户条目数组；无配置时返回空数组。
 */
export function resolveAccountEntries(
  cfg: EnergyAccountSourceLike | null | undefined,
): EnergyAccountEntry[] {
  const fromEntries = Array.isArray(cfg?.accountEntries)
    ? cfg!.accountEntries!.filter((e) => String(e?.number ?? '').trim())
    : []
  if (fromEntries.length) {
    return fromEntries.map((e) => ({
      number: String(e.number).trim(),
      label: String(e.label ?? '').trim(),
    }))
  }
  return parseAccountString(cfg?.account)
}

/**
 * 解析有效账户号码列表。
 *
 * @param cfg 账户配置源数据。
 * @returns 账户号码字符串数组。
 */
export function resolveAccountNumbers(cfg: EnergyAccountSourceLike | null | undefined): string[] {
  return resolveAccountEntries(cfg).map((e) => e.number)
}

/**
 * 解析主账户索引。
 *
 * 根据配置模式自动计算账户数量，再委托 `resolvePrimaryAccountRowIndex` 选取主索引。
 * 若显式传入 accountCount 则直接使用，跳过数量推断。
 *
 * @param cfg 账户配置源数据。
 * @param accountCount 可选的账户数量，省略时自动推断。
 * @returns 主账户索引（从 0 开始；无账户时返回 0）。
 */
export function resolvePrimaryAccountIndex(
  cfg: EnergyAccountSourceLike | null | undefined,
  accountCount?: number,
): number {
  let count = accountCount
  if (count == null) {
    if (cfg?.mode === 'entity') count = resolveAccountEntityEntries(cfg).length
    else if (cfg?.mode === 'multi') count = resolveMultiAccountEntries(cfg).length
    else if (Array.isArray(cfg?.accountEntries) && cfg.accountEntries.length) {
      count = cfg.accountEntries.length
    } else count = resolveAccountNumbers(cfg).length
  }
  return resolvePrimaryAccountRowIndex(cfg, count || 1)
}

/**
 * 约定模式：按行索引取账户号码。
 *
 * 优先取指定索引的户号；若为空则取主账户行；仍为空则取首个非空户号。
 * 用于在弹窗中根据选中索引展示对应账户。
 *
 * @param cfg 账户配置源数据。
 * @param accountIndex 账户索引，默认 0。
 * @returns 对应索引的账户号码；无可用账户时返回空字符串。
 */
export function resolveConventionAccountAtIndex(
  cfg: EnergyAccountSourceLike | null | undefined,
  accountIndex = 0,
): string {
  const rows = Array.isArray(cfg?.accountEntries)
    ? cfg.accountEntries
    : parseAccountString(cfg?.account)
  if (!rows.length) return ''
  const direct = String(rows[accountIndex]?.number ?? '').trim()
  if (direct) return direct
  const primaryIdx = resolvePrimaryAccountRowIndex(cfg, rows.length)
  const fromPrimary = String(rows[primaryIdx]?.number ?? '').trim()
  if (fromPrimary) return fromPrimary
  for (const row of rows) {
    const n = String(row?.number ?? '').trim()
    if (n) return n
  }
  return ''
}

/**
 * 解析主账户号码。
 *
 * 优先从 accountEntries 中按主索引取号；若为空则遍历取首个非空号码。
 * accountEntries 不存在时回退到 account 字符串解析。
 *
 * @param cfg 账户配置源数据。
 * @returns 主账户号码；无可用账户时返回空字符串。
 */
export function resolvePrimaryAccount(cfg: EnergyAccountSourceLike | null | undefined): string {
  if (Array.isArray(cfg?.accountEntries) && cfg.accountEntries.length) {
    const idx = resolvePrimaryAccountRowIndex(cfg, cfg.accountEntries.length)
    const preferred = String(cfg.accountEntries[idx]?.number ?? '').trim()
    if (preferred) return preferred
    for (const row of cfg.accountEntries) {
      const n = String(row?.number ?? '').trim()
      if (n) return n
    }
    return ''
  }
  const numbers = resolveAccountNumbers(cfg)
  const idx = resolvePrimaryAccountIndex(cfg, numbers.length || undefined)
  return numbers[idx] || numbers[0] || ''
}

/**
 * 生成账户条目的展示标签。
 *
 * 优先使用自定义 label；其次对 4 位及以上号码取后 4 位并加 `···` 前缀脱敏；
 * 短号码直接展示；无号码时回退为 `账户 {index + 1}`。
 *
 * @param entry 账户条目。
 * @param index 条目索引（用于生成回退标签）。
 * @returns 展示标签字符串。
 */
export function accountEntryLabel(entry: EnergyAccountEntry, index: number): string {
  if (entry.label?.trim()) return entry.label.trim()
  const n = entry.number.trim()
  if (n.length >= 4) return `···${n.slice(-4)}`
  return n || `账户 ${index + 1}`
}

/**
 * 统计原始账户行数（包含空行，用于编辑场景的行数占位）。
 *
 * 各模式分别统计：
 * - entity：accountEntities 或解析后的长度。
 * - multi：multiAccounts 或解析后的长度。
 * - 默认：accountEntries 或解析后的账户号数量。
 *
 * @param cfg 账户配置源数据。
 * @returns 原始行数；cfg 为空时返回 0。
 */
export function resolveRawAccountRowCount(cfg: EnergyAccountSourceLike | null | undefined): number {
  if (!cfg) return 0
  if (cfg.mode === 'entity') {
    if (Array.isArray(cfg.accountEntities)) return cfg.accountEntities.length
    return resolveAccountEntityEntries(cfg).length
  }
  if (cfg.mode === 'multi') {
    if (Array.isArray(cfg.multiAccounts)) return cfg.multiAccounts.length
    return resolveMultiAccountEntries(cfg).length
  }
  if (Array.isArray(cfg.accountEntries)) return cfg.accountEntries.length
  return resolveAccountNumbers(cfg).length
}
