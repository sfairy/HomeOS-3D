/**
 * @file index.ts
 * @module @homeos/shared
 * @brief @homeos/shared 包统一导出入口（barrel），按子域分组再导出 YAML / HA / 模板 / 房间 / 联动 / 配置等工具。
 *
 * 职责：
 *  - 作为前后端引用 @homeos/shared 的唯一入口，隐藏各子文件路径；
 *  - 按功能域（YAML / HA / 模板 / 房间 / 联动 / 通知 / 配置等）分组再导出，便于检索与 tree-shaking。
 *
 * 关键依赖：
 *  - 所有子域模块（yaml / ha / template / room / time / auth / config / setup / entity / notification 等）；
 *  - 被 backend 与 frontend 的 package.json dependencies 共同引用，须保持双端版本一致。
 *
 * 约定：
 *  - 分组使用段前注释（如 // ===== YAML 序列化 =====）标识；
 *  - 本 barrel 不对 export { x } 加 JSDoc，导出声明的 JSDoc 均位于各自的声明源文件。
 */

// YAML 序列化
export {
  HA_YAML_SCHEMA,
  HA_YAML_LOAD_OPTS,
  HA_YAML_DUMP_OPTS,
  loadHaYaml,
  loadHaYamlObject,
  loadHaYamlObject as parseOrchestratorYaml,
  dumpHaYaml,
} from './yaml/ha-yaml';
export { isLocalhostHaUrl, normalizeHaUrl, validateHaUrlForDeploy } from './ha/url';
export { isDangerousHaControl } from './ha/dangerous-control.util';
export {
  haversineDistanceKm,
  computeSWaveCountdown,
  estimateLocalIntensity,
  refineAlertCountdown,
  isInSichuanBasin,
  type IntensityEstimateOpts,
} from './earthquake/geo.util';
export {
  EEW_COUNTDOWN_LEAD_OPTIONS,
  type EewCountdownLeadSec,
  normalizeEewCountdownLead,
  shouldShowEewCountdown,
  isEewSimulationEventId,
  eewCountdownLeadLabel,
} from './earthquake/eew-countdown-lead.util';
export { getEntityDomain, getEntityLeaf } from './entity/domain';
export { attrValueEquals } from './entity/attr-value-equals.util';
export { isControllableEntityDomain, isControllableEntityId } from './entity/controllable';
export {
  type JwtUserLike,
  resolveEntityRestrictions,
  isEntityAllowed,
  filterEntitiesByAccess,
  canControlEntity,
} from './entity/access';
export {
  type EntityAreaAttrs,
  type EntityAreaInfo,
  resolveEntityArea,
  entityMatchesAreaFilter,
} from './entity/area';
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
} from './notification/voice-alert';
export {
  VOICE_ALERT_PRIORITY,
  compareVoiceAlertPriority,
} from './notification/voice-alert-priority';
export {
  resolveTtsRoute,
  sortAlertsByVoicePriority,
  type TtsRoute,
  type ResolveTtsRouteInput,
} from './notification/tts-route.util';
export { TEMPLATE_META_KEYS } from './template/meta-keys';
export {
  collectTemplateBlocks,
  isTriggerBasedTemplateParsed,
  extractFirstTemplateItemFromParsed,
  normalizeTemplateRoot,
} from './template/yaml-blocks';
export {
  TEMPLATE_FLOW_TO_YAML_KEYS,
  TEMPLATE_YAML_TO_FLOW_KEYS,
  flowKeyToYamlKey,
  yamlKeyToFlowKey,
} from './template/flow-yaml-keys';
export {
  APPLIANCE_TYPES,
  APPLIANCE_TYPE_MAP,
  APPLIANCE_TYPE_IDS,
  SPECIAL_TEMPLATE_TYPES,
  getApplianceType,
  getBuiltinSlots,
  type ApplianceTypeDef,
  type ApplianceSlotDef,
  type ApplianceDeployMode,
  type ApplianceKind,
} from './template/appliance-catalog';
export {
  buildApplianceTemplateYaml,
  type BuildApplianceYamlInput,
} from './template/appliance-yaml-gen';
export {
  buildSlotPayload,
  normalizeSlotPayload,
  restoreSlotsFromPayload,
  isSlotSchemaPayload,
  type SlotSchemaPayload,
  type SlotMeta,
} from './template/slot-schema';
export {
  inferTemplateEntityType,
  inferTemplateEntityImportMeta,
  hydrateTemplateEntitySlots,
  inferAppTypeFromHints,
  type InferTemplateEntityTypeOptions,
} from './template/appliance-type-infer';
export {
  APPLIANCE_TEMPLATE_TYPES,
  isPlaceholderEntityId,
  findPlaceholderEntityIdsInYaml,
  getRequiredSlotGroups,
  validateApplianceSlotMapping,
  yamlHasNonStandardTemplateAttributes,
} from './template/entity-validate';
export {
  extractEntityIdsFromTemplateYaml,
  mapYamlToSlotsByKey,
  type TemplateSlotDef,
} from './template/slot-parse';
export {
  ORCHESTRATOR_PLACEHOLDER_RE,
  hasOrchestratorPlaceholder,
} from './template/placeholder-marker.util';
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
} from './notification/source';
export {
  HOME_MODE_LOG_SOURCE_LABELS,
  HOME_MODE_LOG_REASON_LABELS,
  homeModeLogSourceLabel,
  homeModeLogReasonLabel,
  aggregateHomeModeTriggerLogs,
  type HomeModeTriggerLogAnalytics,
} from './home/mode-log';
export {
  type HomeModeTriggerLogSource,
  type HomeModeTriggerLogEntry,
  type HomeModeTriggerLogLike,
} from './home/mode-trigger-log';
export {
  type RoomCatalogEntry,
  type EnvSensorMap,
  type EnvSensorMapEntry,
  DEFAULT_ROOM_CATALOG,
  getDefaultRoomCatalog,
  getDefaultEnvRoomDefs,
  buildDefaultEnvSensorMap,
  getDefaultVoiceRoomLabels,
  getVoiceRoomsFromCatalog,
  resolveRoomLabel,
  roomTabEmoji,
  buildRoomInferKeywordsMap,
  inferRoomIdFromEntityId,
  listVisibleEnvSensorMapRoomIds,
  buildAreaToRoomMap,
  getDeviceGroupRoomKeywords,
  inferDeviceGroupRoomFromCatalog,
  isRoomHiddenInMap,
  sortEnvSensorMapRoomIds,
  resolveDeviceGroupLabel,
  buildDeviceGroupLabelMap,
  buildPublicRoomMeta,
  buildRoomEntityMatchers,
  entityMatchesEnvRoom,
} from './room/catalog';
export {
  type HaAreaRef,
  type HaEnvRoomListItem,
  type VoiceRoomLike,
  lookupHaArea,
  findCatalogForHaArea,
  findHaAreaForCatalogRoom,
  filterEnvSensorMapToKnownAreas,
  buildRoomListFromHaAreas,
  resolveRoomLabelFromHaAreas,
  resolveVoiceRoomsFromHaAreas,
  buildPublicRoomMetaFromHaAreas,
} from './room/ha-area-env-map';
export {
  type RoomBackgroundPreset,
  ROOM_BACKGROUND_PRESETS,
  resolveRoomBackgroundUrl,
} from './room/background';
export {
  type BindingGapItem,
  type BindingGapSection,
  type CollectBindingGapsInput,
  collectBindingGaps,
  resolveBindingGapSection,
  filterBindingGapsBySection,
} from './setup/bindings-gaps.util';
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
} from './setup/hazard-config.util';
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
} from './setup/account-binding-categories.util';
export {
  type StatsSensorsLike,
  type EnergySourceConfig,
  getFirstAccount,
  normalizeEnergySource,
  hasEnergyConfig,
} from './setup/energy-config.util';
export { normalizeHomeModeTimeAt, homeModeMinuteKey } from './home/mode-time.util';
export {
  type ZonedDateParts,
  zonedDateParts,
  dateFromZonedWallClock,
  dateFromZonedHourFraction,
  matchCronExpression,
} from './time/zoned-time.util';
export {
  type TouWindowFields,
  clockRangesOverlap,
  validateTouWindows,
} from './energy/tou-windows.util';
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
} from './home/security-map';
export {
  type EmbedFallbackRequestLike,
  isEmbedFallbackNavigationDest,
  isHomeosFrontendResourcePath,
  parseEmbedIdFromContextCookie,
  parseEmbedIdFromReferer,
  resolveEmbedProxyFallbackRedirect,
} from './embed/fallback-core.util';
export {
  WS_CLIENT_EVENTS,
  type WsClientEventName,
  type WsHaConnectionStatus,
  type WsHaStatusPayload,
  type WsEntityStatePayload,
  type WsStateChangedBatchPayload,
} from './ws/client-events';
export {
  type EntityReferenceKind,
  type EntityReferenceRole,
  type EntityReferenceItem,
  type EntityReferencesResponse,
  type EntityReferenceUnlinkRequest,
  type EntityReferenceUnlinkAction,
  type EntityReferenceUnlinkResult,
  ENTITY_REFERENCE_KIND_LABELS,
  ENTITY_REFERENCE_ROLE_LABELS,
  ENTITY_REFERENCE_KIND_ORDER,
  LAYOUT_ENTITY_REFERENCE_KINDS,
  SYSTEM_CONFIG_ENTITY_REFERENCE_KINDS,
  UNLINKABLE_ENTITY_REFERENCE_KINDS,
} from './entity/references';
export {
  DEFAULT_CRITICAL_DOMAINS,
  WS_PUSH_CRITICAL_DOMAINS,
  type EntityIdLike,
  sortEntitiesBySyncPriority,
} from './entity/sync-priority';
export {
  type HaEntity,
  type HaStateChangeEvent,
  type HaStateChangeBatchEvent,
} from './ha/entity-types';
export {
  type EarthquakeAlertPayload,
  type EarthquakeAlertKind,
  type EarthquakeEewSource,
  type GlobalEarthquakePeriod,
  type GlobalEarthquakeSource,
  type GlobalEarthquakeEvent,
  type GlobalEarthquakeFeedResult,
  type GlobalEarthquakeQuery,
} from './earthquake/types';
export {
  type HomeRole,
  HOME_ROLES,
  isHomeRole,
  type AlertLevel,
  ALERT_LEVELS,
} from './auth/roles';
export {
  CHILD_RESTRICTED_DOMAIN_LIST,
  CHILD_RESTRICTED_DOMAINS,
  type ChildRestrictedDomain,
  isChildRestrictedDomain,
  isChildDomainAccessDenied,
} from './auth/child-restricted-domains';
export {
  DEFAULT_DND_START,
  DEFAULT_DND_END,
  type DndWindowConfig,
  isDndActive,
  isDndActiveNow,
  dndDurationHours,
} from './notification/dnd.util';
export {
  type PresencePerson,
  normalizePresencePersons,
  getPresencePersonsFromSecurity,
  collectPresenceEntityIds,
  computePersonAtHome,
} from './home/presence-person.util'
export type {
  SharedAuthConfig,
  SharedNotificationConfig,
  SharedStateStoreConfig,
  SharedWsPushConfig,
  SharedCommandProxyConfig,
  SharedHomeModeConfig,
  SharedEnergyConfig,
  SharedIaqConfig,
  SharedChildModeConfig,
  SharedPricingConfig,
  SharedCircadianConfig,
  SharedWaterConfig,
  SharedWebrtcConfig,
  SharedFrontendConfig,
  SharedUiConfig,
  SharedScreensaverConfig,
  SharedEnvSensorMap,
  SharedEnvSensorMapEntry,
  SharedOpsConfig,
  SharedSecurityConfig,
  SharedHaConnectorConfig,
  SharedExternalConfig,
  SharedVoiceConfig,
  SharedOtherConfig,
  SharedAppConfigSections,
} from './config/sections';
export { DEFAULT_AUTH_SECURITY } from './config/sections';
export type {
  ClientPowerClient,
  ClientPowerSelfCharge,
  ClientPowerSettings,
} from './config/client-power';
export {
  DEFAULT_CLIENT_POWER_SELF_CHARGE,
  DEFAULT_CLIENT_POWER_SETTINGS,
} from './config/client-power';
export type {
  ChargerWakeResolveKind,
  ChargerWakeResolveResult,
  ClientPowerWakeClientPublic,
  ClientPowerWakePublic,
  ClientPowerWakeSource,
  ClientPowerWakeSourceClient,
} from './config/client-power-wake.util';
export {
  buildClientPowerWakePublic,
  isSwitchOffToOn,
  resolveChargerSwitchWakeEntityId,
  resolveChargerSwitchWakeEntityIdForDevice,
  resolveChargerSwitchWakeForDevice,
  shouldDismissScreensaverOnChargerSwitch,
} from './config/client-power-wake.util';
export type { AlertRule } from './notification/alert-rule';
export type {
  RuntimeLogLevel,
  RuntimeLogEntry,
  RuntimeLogQuery,
  RuntimeLogQueryResult,
} from './observability/runtime-log';
export type { PaginatedResult } from './crud/pagination';
export {
  HTTP_MESSAGE_TEXTS,
  HTTP_STATUS_MESSAGES,
  HTTP_MESSAGE_PATTERNS,
} from './errors/http-messages';
