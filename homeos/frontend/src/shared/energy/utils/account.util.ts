/** 供上层业务代码统一从 `@/shared/energy/utils/account.util` 导入，避免直接依赖子模块路径。 */
export { FOOTER_ACCOUNT_INDEX_ALL, resolvePrimaryAccountRowIndex } from '@/shared/energy/utils/account-types.util'

export {
  hasAccountNumberSeparator,
  isLonelyAccountSeparator,
  sanitizeAccountNumberInput,
  resolveFirstAccountSegment,
  resolveFocusRowAfterCommaSplit,
  expandAccountRowsFromInput,
  findAccountSuffixConflicts,
} from '@/shared/energy/utils/account-input.util'

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
} from '@/shared/energy/utils/account-entity.util'

export {
  resolveAccountNumbers,
  resolvePrimaryAccountIndex,
  resolveConventionAccountAtIndex,
  resolveRawAccountRowCount,
} from '@/shared/energy/utils/account-resolve.util'

export {
  resolveAccountDisplayRows,
  resolveAccountIndexForEntityId,
  resolveAccountLabelForEntityId,
  resolveConfiguredAccountIndices,
} from '@/shared/energy/utils/account-display.util'

export {
  bootstrapAccountStructForMode,
  ensureAccountEntriesOnSource,
  syncAccountString,
} from '@/shared/energy/utils/account-sync.util'
