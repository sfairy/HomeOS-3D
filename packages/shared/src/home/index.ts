/** `home` 域的公开面：由根 barrel（`src/index.ts`）转发，调用方仍可只 import `@homeos/shared`。 */

export {
  HOME_MODE_LOG_SOURCE_LABELS,
  HOME_MODE_LOG_REASON_LABELS,
  homeModeLogSourceLabel,
  homeModeLogReasonLabel,
  aggregateHomeModeTriggerLogs,
  type HomeModeTriggerLogAnalytics,
} from './mode-log';
export {
  type HomeModeTriggerLogSource,
  type HomeModeTriggerLogEntry,
  type HomeModeTriggerLogLike,
} from './mode-trigger-log';
export { normalizeHomeModeTimeAt, homeModeMinuteKey } from './mode-time.util';
export {
  type SecurityArmingMode,
  type SecurityZoneType,
  SECURITY_ARMING_MODES,
  SECURITY_TO_HOME_MODE_NAME_PATTERN,
  HOME_SECURITY_LINK_ROWS,
  shouldZoneAlarmInMode,
  normalizeZoneType,
  inferSecurityModeFromHomeModeName,
  buildHomeModeSecurityAction,
  isSecurityArmingEntityId,
  resolveHomeModeLinkForSecurityChange,
} from './security-map';
export {
  type PresencePerson,
  normalizePresencePersons,
  getPresencePersonsFromSecurity,
  collectPresenceEntityIds,
  computePersonAtHome,
} from './presence-person.util';
