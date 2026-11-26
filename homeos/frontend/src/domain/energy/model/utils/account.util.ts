/** 供上层业务代码统一从 `@/shared/energy/utils/account.util` 导入，避免直接依赖子模块路径。 */
export { FOOTER_ACCOUNT_INDEX_ALL, resolvePrimaryAccountRowIndex } from '@/domain/energy/model/utils/account-types.util'

export {
  hasAccountNumberSeparator,
  isLonelyAccountSeparator,
  sanitizeAccountNumberInput,
  resolveFirstAccountSegment,
  resolveFocusRowAfterCommaSplit,
  expandAccountRowsFromInput,
  findAccountSuffixConflicts,
} from '@/domain/energy/model/utils/account-input.util'

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
} from '@/domain/energy/model/utils/account-entity.util'

export {
  resolveAccountNumbers,
  resolvePrimaryAccountIndex,
  resolveConventionAccountAtIndex,
  resolveRawAccountRowCount,
} from '@/domain/energy/model/utils/account-resolve.util'

export {
  resolveAccountDisplayRows,
  resolveAccountIndexForEntityId,
  resolveAccountLabelForEntityId,
  resolveConfiguredAccountIndices,
} from '@/domain/energy/model/utils/account-display.util'

export {
  bootstrapAccountStructForMode,
  ensureAccountEntriesOnSource,
  syncAccountString,
} from '@/domain/energy/model/utils/account-sync.util'
