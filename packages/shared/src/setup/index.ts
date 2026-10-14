/** `setup` 域的公开面：由根 barrel（`src/index.ts`）转发，调用方仍可只 import `@homeos/shared`。 */

export {
  type BindingGapItem,
  type BindingGapSection,
  type CollectBindingGapsInput,
  collectBindingGaps,
  resolveBindingGapSection,
  filterBindingGapsBySection,
} from './bindings-gaps.util';
export {
  parseHazardEntityIdList,
  hasAnyHazardSensorBinding,
  collectHazardBindingSummary,
  buildHazardBindingMap,
  formatHazardBindingSummaryText,
  formatSecurityAlarmMessage,
  detectHazardBindingConflicts,
  collectHazardWatchedEntityIds,
  summarizeHazardActionFailures,
  type HazardSensorKind,
  type HazardBindingSummary,
  type HazardBindingConflict,
  type HazardActionKind,
  type HazardActionResult,
} from './hazard-config.util';
export {
  type DashboardFooterItemLike,
  ACCOUNT_BINDING_SOURCE_LABELS,
  COMM_ACCOUNT_BINDING_CATEGORIES,
  ENERGY_ACCOUNT_BINDING_CATEGORIES,
  collectFooterAccountSources,
  collectRequiredAccountBindingCategories,
  formatAccountBindingLabel,
  isCommAccountBindingCategory,
  resolveAccountBindingSettingsRoute,
} from './account-binding-categories.util';
export {
  type StatsSensorsLike,
  type EnergySourceConfig,
  getFirstAccount,
  normalizeEnergySource,
  hasEnergyConfig,
} from './energy-config.util';
