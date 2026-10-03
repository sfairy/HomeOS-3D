/**
 * @module energy-account.util
 * @description 生活账户多账户解析与同步的公共 API 入口。
 *
 * 职责：作为聚合桶（barrel）模块，从各子模块 re-export 公共 API，
 * 供上层业务代码统一从 `@/utils/energy/account.util` 导入，避免直接依赖子模块路径。
 *
 * 涵盖能力：
 * - 户号输入解析与逗号拆行（input 子模块）。
 * - 综合实体 / 多实体模式解析与同步（entity 子模块）。
 * - 账户条目聚合与主账户选取（resolve 子模块）。
 * - 展示行与索引反查（display 子模块）。
 * - 源对象 bootstrap 与字段同步（sync 子模块）。
 */
export { FOOTER_ACCOUNT_INDEX_ALL, resolvePrimaryAccountRowIndex } from '@/utils/energy/account-types.util'

export {
  hasAccountNumberSeparator,
  isLonelyAccountSeparator,
  sanitizeAccountNumberInput,
  getFirstAccount,
  resolveFirstAccountSegment,
  resolveFocusRowAfterCommaSplit,
  expandAccountRowsFromInput,
  findAccountSuffixConflicts,
} from '@/utils/energy/account-input.util'

export {
  resolveAccountEntityEntries,
  hasEntityAccountConfig,
  resolveMultiAccountEntries,
  hasMultiAccountConfig,
  resolveMultiAccountEntityMap,
  multiAccountEntryLabel,
  ensureEntityAccountsOnSource,
  syncEntityAccounts,
  ensureMultiAccountsOnSource,
  syncMultiAccounts,
} from '@/utils/energy/account-entity.util'

export {
  resolveAccountNumbers,
  resolvePrimaryAccountIndex,
  resolveConventionAccountAtIndex,
  resolvePrimaryAccount,
  resolveRawAccountRowCount,
} from '@/utils/energy/account-resolve.util'

export {
  resolveAccountDisplayRows,
  resolveAccountIndexForEntityId,
  resolveAccountLabelForEntityId,
  resolveConfiguredAccountIndices,
} from '@/utils/energy/account-display.util'

export {
  bootstrapAccountStructForMode,
  ensureAccountEntriesOnSource,
  syncAccountString,
} from '@/utils/energy/account-sync.util'
