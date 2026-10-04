/**
 * @module energy-account-entity.util
 * @description 生活账户综合实体 / 多实体模式解析与同步工具模块。
 *
 * 职责：
 * - 解析约定模式下的 balance 实体 ID。
 * - 解析综合实体模式（accountEntities）与多实体模式（multiAccounts）的账户列表。
 * - 在编辑过程中保留空行，避免输入过程中列表抖动。
 * - 同步主账户镜像字段（entityId / entityMap / primaryAccountIndex）。
 *
 * 依赖：
 * - `energy-fields` 常量：约定式实体 ID 前缀。
 * - `energy-account-types.util`：账户类型定义与主账户行索引解析。
 */
import { getEntityLeaf } from '@homeos/shared'
import { ENERGY_CONVENTION_PREFIX } from '@/constants/energy-fields'
import {
  resolvePrimaryAccountRowIndex,
  type EnergyAccountEntityEntry,
  type EnergyAccountSourceLike,
  type EnergyMultiAccountEntry,
} from '@/utils/energy/account-types.util'

/**
 * 判断实体映射表（entityMap）中是否存在至少一个非空值。
 *
 * @param map 实体类型到实体 ID 的映射表，可能为 null / undefined。
 * @returns 存在非空值返回 true，否则返回 false。
 */
function hasEntityMapValues(map: Record<string, string> | null | undefined): boolean {
  return Object.values(map || {}).some((v) => String(v || '').trim())
}

/**
 * 按约定规则推算指定账户的 balance 实体 ID。
 *
 * 规则：`sensor.{prefix}_{account后4位}_balance`，其中 prefix 由账户类别决定。
 * 例如：电费账户 `1234567890` 在前缀为 `ele` 时，得到 `sensor.ele_7890_balance`。
 *
 * @param cat 账户类别（如 'electricity' / 'water' / 'gas' 等）。
 * @param account 账户号字符串。
 * @returns 推算出的实体 ID；类别未配置前缀或账户号为空时返回空字符串。
 */
export function conventionBalanceEntityId(cat: string, account: string): string {
  const prefix = (ENERGY_CONVENTION_PREFIX as Record<string, string>)[cat]
  const acc = account.trim()
  if (!prefix || !acc) return ''
  return `sensor.${prefix}_${acc.slice(-4)}_balance`
}

/**
 * 解析综合实体模式的账户条目列表（保留编辑中的空行）。
 *
 * 仅读取 `accountEntities` 数组；不以顶层 entityId 回填。
 * 保留空行是为了让用户在编辑过程中不会因为某行暂时清空而导致后续行索引错位。
 *
 * @param cfg 账户配置源数据。
 * @returns 账户实体条目数组；无数组时返回空数组。
 */
export function resolveAccountEntityEntries(
  cfg: Pick<EnergyAccountSourceLike, 'mode' | 'entityId' | 'accountEntities'> | null | undefined,
): EnergyAccountEntityEntry[] {
  const fromList = Array.isArray(cfg?.accountEntities) ? cfg!.accountEntities! : []
  return fromList.map((e) => ({
    entityId: String(e?.entityId ?? '').trim(),
    label: String(e?.label ?? '').trim(),
  }))
}

/**
 * 判断是否已有有效的综合实体账户配置。
 *
 * @param cfg 账户配置源数据。
 * @returns 存在至少一个非空 entityId 时返回 true，否则返回 false。
 */
export function hasEntityAccountConfig(
  cfg: Pick<EnergyAccountSourceLike, 'mode' | 'entityId' | 'accountEntities'> | null | undefined,
): boolean {
  return resolveAccountEntityEntries(cfg).some((e) => e.entityId.trim())
}

/**
 * 解析多实体模式的账户行列表（保留编辑中的空行）。
 *
 * 仅读取 `multiAccounts` 数组；不以顶层 entityId / entityMap 回填。
 *
 * @param cfg 账户配置源数据。
 * @returns 多账户行数组；无数组时返回空数组。
 */
export function resolveMultiAccountEntries(
  cfg:
    | Pick<EnergyAccountSourceLike, 'mode' | 'entityId' | 'entityMap' | 'multiAccounts'>
    | null
    | undefined,
): EnergyMultiAccountEntry[] {
  const fromList = Array.isArray(cfg?.multiAccounts) ? cfg!.multiAccounts! : []
  return fromList.map((row) => ({
    label: String(row?.label ?? '').trim(),
    entityId: String(row?.entityId ?? '').trim(),
    entityMap: { ...(row?.entityMap || {}) },
  }))
}

/**
 * 判断是否已有有效的多实体账户配置。
 *
 * @param cfg 账户配置源数据。
 * @returns 存在至少一个非空 entityId 或 entityMap 值时返回 true，否则返回 false。
 */
export function hasMultiAccountConfig(
  cfg:
    | Pick<EnergyAccountSourceLike, 'mode' | 'entityId' | 'entityMap' | 'multiAccounts'>
    | null
    | undefined,
): boolean {
  return resolveMultiAccountEntries(cfg).some(
    (row) => row.entityId.trim() || hasEntityMapValues(row.entityMap),
  )
}

/**
 * 解析指定账户索引处的多实体映射表（entityMap）。
 *
 * 若 `multiAccounts` 数组存在，则优先取指定索引的行；
 * 索引越界时回退到主账户行或首行。否则从解析结果或顶层 entityMap 中取。
 *
 * @param cfg 账户配置源数据。
 * @param accountIndex 账户索引，默认 0。
 * @returns 实体类型到实体 ID 的映射表；无配置时返回空对象。
 */
export function resolveMultiAccountEntityMap(
  cfg: EnergyAccountSourceLike | null | undefined,
  accountIndex = 0,
): Record<string, string> {
  if (Array.isArray(cfg?.multiAccounts) && cfg.multiAccounts.length) {
    const count = cfg.multiAccounts.length
    const idx = resolvePrimaryAccountRowIndex(cfg, count)
    const row = cfg.multiAccounts[accountIndex] || cfg.multiAccounts[idx] || cfg.multiAccounts[0]
    return row?.entityMap || {}
  }
  const rows = resolveMultiAccountEntries(cfg)
  const row = rows[accountIndex] || rows[0]
  return row?.entityMap || cfg?.entityMap || {}
}

/**
 * 生成多账户行的展示标签。
 *
 * 优先使用自定义 label；其次取 entityId 的末尾段（domain 之后的部分）；
 * 都不可用时回退为 `账户 {index + 1}`。
 *
 * @param entry 多账户行数据。
 * @param index 行索引（用于生成回退标签）。
 * @returns 展示标签字符串。
 */
export function multiAccountEntryLabel(entry: EnergyMultiAccountEntry, index: number): string {
  if (entry.label?.trim()) return entry.label.trim()
  const eid = entry.entityId.trim()
  if (eid) return getEntityLeaf(eid) || `账户 ${index + 1}`
  return `账户 ${index + 1}`
}

export { hasEntityMapValues }

/**
 * 初始化综合实体多账户列表。
 *
 * 若源数据中 `accountEntities` 缺失，则初始化为空默认行；
 * 同时确保 `primaryAccountIndex` 存在，并同步主账户镜像字段。
 * 用于配置加载 / 保存前的数据规整。
 *
 * @param src 源数据对象，会被原地修改。
 */
export function ensureEntityAccountsOnSource(src: Record<string, unknown>): void {
  if (!Array.isArray(src.accountEntities)) {
    src.accountEntities = [{ entityId: '', label: '' }]
  }
  if (typeof src.primaryAccountIndex !== 'number') {
    src.primaryAccountIndex = 0
  }
  syncEntityAccounts(src)
}

/**
 * 同步主综合实体 ID（写回顶层 entityId 镜像）。
 *
 * 根据 `primaryAccountIndex` 选出主行，将其 entityId 写回顶层 `src.entityId`。
 *
 * @param src 源数据对象，会被原地修改。
 */
export function syncEntityAccounts(src: Record<string, unknown>): void {
  const rows = Array.isArray(src.accountEntities)
    ? (src.accountEntities as EnergyAccountEntityEntry[])
    : []
  const count = rows.length
  if (count > 0) {
    src.primaryAccountIndex = resolvePrimaryAccountRowIndex(src as EnergyAccountSourceLike, count)
  }
  const idx = typeof src.primaryAccountIndex === 'number' ? src.primaryAccountIndex : 0
  const primary = rows[idx] || rows[0]
  const nextEntityId = primary?.entityId?.trim() || ''
  if (src.entityId !== nextEntityId) src.entityId = nextEntityId
}

/**
 * 初始化多实体多账户列表。
 *
 * 若源数据中 `multiAccounts` 缺失，则初始化为空默认行；
 * 确保每行都有 entityMap，并设置 `primaryAccountIndex`，最后同步主账户镜像字段。
 *
 * @param src 源数据对象，会被原地修改。
 */
export function ensureMultiAccountsOnSource(src: Record<string, unknown>): void {
  if (!Array.isArray(src.multiAccounts)) {
    src.multiAccounts = [{ label: '', entityId: '', entityMap: {} }]
  }
  for (const row of src.multiAccounts as EnergyMultiAccountEntry[]) {
    if (!row.entityMap) row.entityMap = {}
  }
  if (typeof src.primaryAccountIndex !== 'number') {
    src.primaryAccountIndex = 0
  }
  syncMultiAccounts(src)
}

/**
 * 同步主账户的 entityId / entityMap（写回顶层镜像字段）。
 *
 * 根据 `primaryAccountIndex` 选出主行，将其 entityId 与 entityMap 写回顶层字段。
 * entityMap 的比较使用 JSON 序列化以检测深拷贝差异，避免不必要的写入。
 *
 * @param src 源数据对象，会被原地修改。
 */
export function syncMultiAccounts(src: Record<string, unknown>): void {
  const rows = Array.isArray(src.multiAccounts)
    ? (src.multiAccounts as EnergyMultiAccountEntry[])
    : []
  if (!rows.length) {
    src.multiAccounts = [{ label: '', entityId: '', entityMap: {} }]
  }
  for (const row of src.multiAccounts as EnergyMultiAccountEntry[]) {
    if (!row.entityMap) row.entityMap = {}
  }
  const count = (src.multiAccounts as EnergyMultiAccountEntry[]).length
  if (count > 0) {
    src.primaryAccountIndex = resolvePrimaryAccountRowIndex(src as EnergyAccountSourceLike, count)
  }
  const idx = typeof src.primaryAccountIndex === 'number' ? src.primaryAccountIndex : 0
  const primary =
    (src.multiAccounts as EnergyMultiAccountEntry[])[idx] ||
    (src.multiAccounts as EnergyMultiAccountEntry[])[0]
  const nextEntityId = primary?.entityId?.trim() || ''
  const nextEntityMap = { ...(primary?.entityMap || {}) }
  if (src.entityId !== nextEntityId) src.entityId = nextEntityId
  const prevMap = src.entityMap as Record<string, string> | undefined
  if (!prevMap || JSON.stringify(prevMap) !== JSON.stringify(nextEntityMap)) {
    src.entityMap = nextEntityMap
  }
}
