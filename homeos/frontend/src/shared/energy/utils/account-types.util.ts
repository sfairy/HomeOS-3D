/**
 * @module energy-account-types.util
 * @description 生活账户多账户类型定义与主账户索引解析。
 *
 * 职责：
 * - 定义账户条目、综合实体条目、多实体条目等核心类型。
 * - 定义账户配置源数据结构（EnergyAccountSourceLike），兼容多种模式。
 * - 提供主账户行索引的纯函数解析（不依赖实体系统，供 sync 流程使用）。
 */

/**
 * 传统账户条目：户号 + 可选备注。
 * 用于 convention 模式（按户号后 4 位约定实体 ID）。
 */
export interface EnergyAccountEntry {
  number: string
  label?: string
}

/**
 * 综合实体模式条目：每账户直接绑定一个 entityId。
 * label 为可选的展示备注。
 */
export interface EnergyAccountEntityEntry {
  entityId: string
  label?: string
}

/**
 * 多实体模式条目：每账户可绑定多个不同类型的实体（通过 entityMap 映射）。
 * entityId 通常为该账户的主实体（如 balance 实体）。
 */
export interface EnergyMultiAccountEntry {
  label?: string
  entityId: string
  entityMap?: Record<string, string>
}

/**
 * 账户配置源数据结构。
 *
 * 三种模式：
 * - convention：使用 accountEntries（account 为 sync 写回的主账户镜像串）。
 * - entity：使用 accountEntities（entityId 为 sync 写回的主行镜像）。
 * - multi：使用 multiAccounts（entityId / entityMap 为 sync 写回的主行镜像）。
 */
export type EnergyAccountSourceLike = {
  account?: string
  accountEntries?: EnergyAccountEntry[]
  accountEntities?: EnergyAccountEntityEntry[]
  multiAccounts?: EnergyMultiAccountEntry[]
  entityMap?: Record<string, string>
  primaryAccountIndex?: number
  mode?: string
  entityId?: string
}

/**
 * 展示层账户行（rowIndex = 源数组中的行号，全链路统一）。
 * 用于下拉选择、弹窗列表等 UI 场景。
 */
export interface AccountDisplayRow {
  rowIndex: number
  key: string
  label: string
}

/**
 * 底栏"全部账户合计"对应的 accountIndex 常量值。
 * 用于在数据查询中区分"单账户"与"全部账户合计"。
 */
export const FOOTER_ACCOUNT_INDEX_ALL = -1

/**
 * 解析生活账户主账户行索引（无 entity 依赖，供 sync 使用）。
 *
 * 读取 cfg.primaryAccountIndex 并夹紧到 `[0, rowCount - 1]` 区间；
 * 未配置时默认为 0。本函数不依赖实体系统，可在数据同步阶段安全调用。
 *
 * @param cfg 账户配置源数据。
 * @param rowCount 当前行数。
 * @returns 合法的主账户行索引；rowCount <= 0 时返回 0。
 */
export function resolvePrimaryAccountRowIndex(
  cfg: EnergyAccountSourceLike | null | undefined,
  rowCount: number,
): number {
  if (rowCount <= 0) return 0
  const idx = typeof cfg?.primaryAccountIndex === 'number' ? cfg.primaryAccountIndex : 0
  return Math.min(Math.max(0, idx), rowCount - 1)
}
