/** `notification` 域的公开面：由根 barrel（`src/index.ts`）转发，调用方仍可只 import `@homeos/shared`。 */

export {
  type VoiceAlertRules,
  type CustomTtsAlertRule,
  type EntityTtsAlertRule,
  DEFAULT_VOICE_ALERT_RULES,
  VOICE_ALERT_CATALOG,
  VOICE_ALERT_GROUP_LABELS,
  DEFAULT_DAILY_ADVISOR_TTS_DAYTIME,
  DEFAULT_DAILY_ADVISOR_TTS_EVENING,
  resolveVoiceAlertRules,
  mergeVoiceAlertRules,
  normalizeWakeWords,
  normalizeCustomTtsAlerts,
  normalizeEntityTtsAlerts,
  matchEntityTtsAlert,
  isExactEntityId,
} from './voice-alert';
export {
  VOICE_ALERT_PRIORITY,
  compareVoiceAlertPriority,
} from './voice-alert-priority';
export {
  resolveTtsRoute,
  sortAlertsByVoicePriority,
  type TtsRoute,
  type ResolveTtsRouteInput,
} from './tts-route.util';
export {
  NOTIFICATION_SOURCE_SHORT_LABELS,
  NOTIFICATION_FILTER_PRIORITY,
  normalizeNotificationSource,
  normalizeNotificationFilterKey,
  notificationSourceLabel,
  isLifeSafetyNotification,
  matchesNotificationSourceFilter,
  buildNotificationSourceFilters,
  buildNotificationSourceDbFilter,
  type NotificationSourceFilter,
  type NotificationSourceDbFilter,
} from './source';
export {
  type AlertLevel,
  ALERT_LEVELS,
} from './alert-level';
export {
  DEFAULT_DND_START,
  DEFAULT_DND_END,
  type DndWindowConfig,
  isDndActive,
  isDndActiveNow,
  dndDurationHours,
} from './dnd.util';
export type { AlertRule } from './alert-rule';
