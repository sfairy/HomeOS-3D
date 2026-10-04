/**
 * @module energy-account-input.util
 * @description 生活账户户号输入解析与逗号拆行工具模块。
 *
 * 职责：
 * - 规范化户号输入（全角逗号转半角）。
 * - 检测分隔符、拆分多账户户号字符串。
 * - 在输入框粘贴 / 输入逗号时自动拆成多行，并计算聚焦行索引。
 * - 检测户号后 4 位冲突（约定命名实体 ID 会碰撞）。
 *
 * 依赖：`energy-account-types.util` 提供账户条目类型。
 */
import type { EnergyAccountEntry } from '@/utils/energy/account-types.util'

/** 账户号码分隔符正则：匹配半角 `,` 与全角 `，` */
const ACCOUNT_NUMBER_SEPARATOR = /[,，]/

/**
 * 规范化账户输入：将全角逗号 `，` 转换为半角 `,`，便于后续统一处理。
 *
 * @param raw 原始输入字符串，可能为 null / undefined。
 * @returns 规范化后的字符串（仅含半角逗号）；raw 为空时返回空字符串。
 */
function normalizeAccountInput(raw: string | null | undefined): string {
  return String(raw ?? '').replace(/，/g, ',')
}

/**
 * 判断输入中是否包含账户号码分隔符（半角或全角逗号）。
 *
 * @param raw 原始输入字符串。
 * @returns 包含分隔符返回 true，否则返回 false。
 */
export function hasAccountNumberSeparator(raw: string | null | undefined): boolean {
  return ACCOUNT_NUMBER_SEPARATOR.test(String(raw ?? ''))
}

/**
 * 判断输入是否仅由分隔符（逗号 / 空白）组成。
 *
 * 主要用于处理 IME 输入法落到新行时产生的全角逗号场景，
 * 此类输入应被视为无效，不应写入行数据。
 *
 * @param raw 原始输入字符串。
 * @returns 仅含分隔符返回 true，空字符串返回 false。
 */
export function isLonelyAccountSeparator(raw: string | null | undefined): boolean {
  const s = String(raw ?? '').trim()
  if (!s) return false
  return /^[,，\s]+$/.test(s)
}

/**
 * 写入行前的户号清理。
 *
 * - 若输入仅由分隔符组成，返回空字符串。
 * - 否则规范化后去掉开头的逗号与空白，避免行首出现孤立分隔符。
 *
 * @param raw 原始输入字符串。
 * @returns 清理后的户号字符串。
 */
export function sanitizeAccountNumberInput(raw: string | null | undefined): string {
  const s = String(raw ?? '')
  if (isLonelyAccountSeparator(s)) return ''
  return normalizeAccountInput(s).replace(/^,\s*/, '')
}

/**
 * 判断规范化后的输入是否以逗号（含尾随空白）结尾。
 *
 * 用于判断用户是否正在输入新的一行（输入逗号表示要新增行）。
 *
 * @param raw 原始输入字符串。
 * @returns 以逗号结尾返回 true，否则返回 false。
 */
function hasTrailingAccountSeparator(raw: string | null | undefined): boolean {
  return /,\s*$/.test(normalizeAccountInput(raw))
}

/**
 * 将输入字符串按逗号拆分为账户号码列表。
 *
 * @param raw 原始输入字符串。
 * @returns 去除空白与空段后的账户号码数组；输入为空时返回空数组。
 */
function getAccountList(raw: string | null | undefined): string[] {
  const normalized = normalizeAccountInput(raw)
  if (!normalized) return []
  return normalized
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * 解析拆行后第一行的展示内容。
 *
 * 若能拆分出多段，返回第一段；否则去掉末尾分隔符后返回剩余内容。
 * 用于在输入框中只展示首段户号，避免显示尾随逗号。
 *
 * @param raw 原始输入字符串。
 * @returns 第一行展示内容。
 */
export function resolveFirstAccountSegment(raw: string | null | undefined): string {
  const parts = getAccountList(raw)
  if (parts.length) return parts[0]
  return normalizeAccountInput(raw).replace(/,\s*$/, '').trim()
}

/**
 * 将账户号码字符串解析为账户条目数组（label 为空）。
 *
 * @param raw 原始输入字符串。
 * @returns 账户条目数组；输入为空时返回空数组。
 */
export function parseAccountString(raw: string | null | undefined): EnergyAccountEntry[] {
  return getAccountList(raw).map((number) => ({ number, label: '' }))
}

/**
 * 将账户条目数组序列化为逗号分隔的字符串。
 *
 * @param entries 账户条目数组。
 * @returns 逗号分隔的账户号码字符串；无条目时返回空字符串。
 */
export function serializeAccountEntries(entries: EnergyAccountEntry[] | null | undefined): string {
  return (entries || [])
    .map((e) => String(e?.number ?? '').trim())
    .filter(Boolean)
    .join(',')
}

/**
 * 计算逗号拆分后应聚焦的行索引（相对源 rowIndex）。
 *
 * - 若以逗号结尾（用户正在新增行），聚焦到新增的空行。
 * - 若拆分出多段但无尾随逗号，聚焦到最后一段。
 * - 其他情况保持原行索引。
 *
 * @param rowIndex 当前编辑行索引。
 * @param rawValue 当前输入值。
 * @returns 拆分后应聚焦的行索引。
 */
export function resolveFocusRowAfterCommaSplit(rowIndex: number, rawValue: string): number {
  const raw = normalizeAccountInput(rawValue)
  const hasTrailingComma = hasTrailingAccountSeparator(raw)
  const parts = getAccountList(raw)
  if (hasTrailingComma) {
    return rowIndex + Math.max(parts.length, 1)
  }
  if (parts.length <= 1) return rowIndex
  return rowIndex + parts.length - 1
}

/**
 * 比较两组账户条目行是否完全相等（number 与 label 均一致）。
 *
 * @param a 第一组条目。
 * @param b 第二组条目。
 * @returns 长度与逐行内容均一致返回 true，否则返回 false。
 */
function accountEntryRowsEqual(a: EnergyAccountEntry[], b: EnergyAccountEntry[]): boolean {
  if (a.length !== b.length) return false
  return a.every((row, i) => {
    const other = b[i]
    return (
      String(row?.number ?? '').trim() === String(other?.number ?? '').trim() &&
      String(row?.label ?? '').trim() === String(other?.label ?? '').trim()
    )
  })
}

/**
 * 输入框粘贴 / 输入逗号分隔时拆成多行（保留首行备注）。
 *
 * 将当前行的输入按逗号拆分，替换原行并插入新行；
 * 首行保留原有 label，其余新行 label 为空。
 * 若以逗号结尾，则额外追加一个空行供继续输入。
 * 若拆分结果与现有行完全一致，则直接返回原数组避免无谓更新。
 *
 * @param entries 当前全部条目数组。
 * @param rowIndex 触发拆分的行索引。
 * @param rawValue 触发拆分的输入值。
 * @returns 拆分后的新条目数组；无需拆分时返回原数组。
 */
export function expandAccountRowsFromInput(
  entries: EnergyAccountEntry[],
  rowIndex: number,
  rawValue: string,
): EnergyAccountEntry[] {
  const raw = normalizeAccountInput(rawValue)
  if (!raw.includes(',')) return entries

  const hasTrailingComma = hasTrailingAccountSeparator(raw)
  const parts = getAccountList(raw)
  if (parts.length <= 1 && !hasTrailingComma) return entries

  const next = [...entries]
  const keepLabel = String(next[rowIndex]?.label ?? '').trim()
  const inserted = parts.map((number, index) => ({
    number,
    label: index === 0 ? keepLabel : '',
  }))
  if (hasTrailingComma) {
    inserted.push({ number: '', label: '' })
  }
  const existingSlice = entries.slice(rowIndex, rowIndex + inserted.length)
  if (accountEntryRowsEqual(existingSlice, inserted)) {
    return entries
  }
  next.splice(rowIndex, 1, ...inserted)
  return next
}

/**
 * 检测户号后 4 位冲突（约定命名实体 ID 会碰撞）。
 *
 * 约定模式的实体 ID 取户号后 4 位，因此多个户号后 4 位相同时会产生碰撞。
 * 本函数收集所有冲突的后 4 位字符串，去重后返回。
 *
 * @param entries 账户条目数组。
 * @returns 冲突的后 4 位字符串数组（已去重）。
 */
export function findAccountSuffixConflicts(entries: EnergyAccountEntry[]): string[] {
  const seen = new Map<string, number>()
  const conflicts: string[] = []
  for (const entry of entries) {
    const n = entry.number.trim()
    if (n.length < 4) continue
    const suffix = n.slice(-4)
    const prev = seen.get(suffix)
    if (prev != null) {
      conflicts.push(suffix)
    } else {
      seen.set(suffix, 1)
    }
  }
  return [...new Set(conflicts)]
}
