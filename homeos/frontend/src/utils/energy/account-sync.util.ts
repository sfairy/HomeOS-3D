/**
 * @module energy-account-sync.util
 * @description 生活账户源对象 bootstrap 与 accountEntries 同步工具模块。
 *
 * 职责：
 * - 打开设置页时按模式补齐缺失的多账户结构（convention / entity / multi）。
 * - 将 accountEntries 写回顶层 account 镜像字段。
 * - 维护 primaryAccountIndex 字段的一致性。
 *
 * 依赖：
 * - `energy-account-input.util`：账户号字符串解析与序列化。
 * - `energy-account-entity.util`：entity / multi 模式初始化。
 * - `energy-account-types.util`：主账户行索引解析。
 */
import type {
  EnergyAccountEntry,
  EnergyAccountSourceLike,
} from '@/utils/energy/account-types.util'
import { serializeAccountEntries } from '@/utils/energy/account-input.util'
import {
  ensureEntityAccountsOnSource,
  ensureMultiAccountsOnSource,
} from '@/utils/energy/account-entity.util'
import { resolvePrimaryAccountRowIndex } from '@/utils/energy/account-types.util'

/**
 * 打开设置页时补齐缺失的多账户结构（不切换模式）。
 *
 * 根据当前 mode 调用对应的 ensure 函数初始化缺失的数组字段，
 * 保证编辑界面有稳定的行结构可用。不会修改 mode 字段。
 *
 * @param src 源数据对象，会被原地修改。
 */
export function bootstrapAccountStructForMode(src: Record<string, unknown>): void {
  const mode = src.mode
  if (mode === 'convention' && !Array.isArray(src.accountEntries)) {
    ensureAccountEntriesOnSource(src)
  } else if (mode === 'entity' && !Array.isArray(src.accountEntities)) {
    ensureEntityAccountsOnSource(src)
  } else if (mode === 'multi' && !Array.isArray(src.multiAccounts)) {
    ensureMultiAccountsOnSource(src)
  }
}

/**
 * 初始化 accountEntries（仅当字段缺失时）。
 *
 * 不以顶层 account 字符串回填；缺失时初始化为空默认行。
 * 已存在的数组（包括编辑中的空行）不会被覆盖。
 *
 * @param src 源数据对象，会被原地修改。
 */
export function ensureAccountEntriesOnSource(src: Record<string, unknown>): void {
  if (!Array.isArray(src.accountEntries)) {
    src.accountEntries = [{ number: '', label: '' }]
  }
  if (typeof src.primaryAccountIndex !== 'number') {
    src.primaryAccountIndex = 0
  }
  syncAccountString(src)
}

/**
 * 将 accountEntries 序列化为 account 逗号串（写回顶层镜像）。
 *
 * 同时根据行数重新计算 primaryAccountIndex；无行时重置为 0。
 *
 * @param src 源数据对象，会被原地修改。
 */
export function syncAccountString(src: Record<string, unknown>): void {
  src.account = serializeAccountEntries(src.accountEntries as EnergyAccountEntry[] | undefined)
  const rows = Array.isArray(src.accountEntries) ? src.accountEntries : []
  if (rows.length > 0) {
    src.primaryAccountIndex = resolvePrimaryAccountRowIndex(
      src as EnergyAccountSourceLike,
      rows.length,
    )
  } else {
    src.primaryAccountIndex = 0
  }
}
