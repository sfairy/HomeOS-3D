/** 供上层业务代码统一从 `@/shared/energy/utils/account.util` 导入，避免直接依赖子模块路径。 */
export { FOOTER_ACCOUNT_INDEX_ALL, resolvePrimaryAccountRowIndex } from '@/domain/energy/account-types'

export {
  hasAccountNumberSeparator,
  isLonelyAccountSeparator,
  sanitizeAccountNumberInput,
  resolveFirstAccountSegment,
  resolveFocusRowAfterCommaSplit,
  expandAccountRowsFromInput,
  findAccountSuffixConflicts,
} from '@/domain/energy/account-input'

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
} from '@/domain/energy/account-entity'

export {
  resolveAccountNumbers,
  resolvePrimaryAccountIndex,
  resolveConventionAccountAtIndex,
  resolveRawAccountRowCount,
} from '@/domain/energy/account-resolve'

export {
  resolveAccountDisplayRows,
  resolveAccountIndexForEntityId,
  resolveAccountLabelForEntityId,
  resolveConfiguredAccountIndices,
} from '@/domain/energy/account-display'

export {
  bootstrapAccountStructForMode,
  ensureAccountEntriesOnSource,
  syncAccountString,
} from '@/domain/energy/account-sync'
