/**
 * @file infra.util.ts
 * @module backend/src/shared/app-config/validate
 */
/** 应用配置校验：认证、运维、HA 连接器、状态存储、命令代理、WS 推送、WebRTC */
import { AppConfigFieldError, numIn, requireBool } from './primitives.util';

// ── 认证 ── ────────────────────
/** 校验认证配置段（锁定上限与时长、会话有效期、新设备告警冷却与开关） */
export function validateAuthSection(
  section: string,
  partial: Record<string, unknown>,
  errors: AppConfigFieldError[],
): void {
  if ('lockoutMaxAttempts' in partial)
    numIn(section, 'lockoutMaxAttempts', partial.lockoutMaxAttempts, 3, 20, errors);
  if ('lockoutMinutes' in partial)
    numIn(section, 'lockoutMinutes', partial.lockoutMinutes, 1, 1440, errors);
  if ('sessionExpireDays' in partial)
    numIn(section, 'sessionExpireDays', partial.sessionExpireDays, 1, 365, errors);
  if ('newDeviceAlertCooldownMin' in partial)
    numIn(section, 'newDeviceAlertCooldownMin', partial.newDeviceAlertCooldownMin, 10, 10080, errors);
  for (const k of ['loginAlertEnabled', 'newDeviceAlertEnabled', 'bruteForceAlertEnabled'] as const) {
    if (k in partial) requireBool(section, k, partial[k], errors);
  }
}

// ── 运维 ── ────────────────────
/** 校验运维配置段（留存清理、事件日志分层与过滤、配置审计、自动备份、时区） */
export function validateOpsSection(
  section: string,
  partial: Record<string, unknown>,
  errors: AppConfigFieldError[],
): void {
  if ('retentionCleanupIntervalHours' in partial)
    numIn(
      section,
      'retentionCleanupIntervalHours',
      partial.retentionCleanupIntervalHours,
      1,
      168,
      errors,
    );
  if ('eventLogTierCSampleRate' in partial)
    numIn(section, 'eventLogTierCSampleRate', partial.eventLogTierCSampleRate, 0, 1, errors);
  if ('configAuditMaxEntries' in partial)
    numIn(section, 'configAuditMaxEntries', partial.configAuditMaxEntries, 10, 1000, errors);
  if ('configAuditPersistEnabled' in partial)
    requireBool(section, 'configAuditPersistEnabled', partial.configAuditPersistEnabled, errors);
  if ('sceneExecHistoryMax' in partial)
    numIn(section, 'sceneExecHistoryMax', partial.sceneExecHistoryMax, 1, 1000, errors);
  if ('scriptExecHistoryMax' in partial)
    numIn(section, 'scriptExecHistoryMax', partial.scriptExecHistoryMax, 1, 1000, errors);
  if ('eventLogTimelineMax' in partial)
    numIn(section, 'eventLogTimelineMax', partial.eventLogTimelineMax, 1, 5000, errors);
  if ('eventLogTimelineHours' in partial)
    numIn(section, 'eventLogTimelineHours', partial.eventLogTimelineHours, 1, 168, errors);
  if ('eventLogOverlayHours' in partial)
    numIn(section, 'eventLogOverlayHours', partial.eventLogOverlayHours, 1, 72, errors);
  if ('eventLogMaxBuffer' in partial)
    numIn(section, 'eventLogMaxBuffer', partial.eventLogMaxBuffer, 1, 5000, errors);
  if ('eventLogFlushIntervalMs' in partial)
    numIn(
      section,
      'eventLogFlushIntervalMs',
      partial.eventLogFlushIntervalMs,
      500,
      120_000,
      errors,
    );
  if ('orchestratorImportMaxRetry' in partial)
    numIn(section, 'orchestratorImportMaxRetry', partial.orchestratorImportMaxRetry, 0, 20, errors);
  if ('retentionDeleteBatchSize' in partial)
    numIn(
      section,
      'retentionDeleteBatchSize',
      partial.retentionDeleteBatchSize,
      100,
      50_000,
      errors,
    );
  if ('retentionFirstDelaySec' in partial)
    numIn(section, 'retentionFirstDelaySec', partial.retentionFirstDelaySec, 0, 3600, errors);
  if ('eventLogMaxRequeueBuffer' in partial)
    numIn(section, 'eventLogMaxRequeueBuffer', partial.eventLogMaxRequeueBuffer, 1, 10_000, errors);
  if ('autoBackupEnabled' in partial)
    requireBool(section, 'autoBackupEnabled', partial.autoBackupEnabled, errors);
  if ('autoBackupRetainDays' in partial)
    numIn(section, 'autoBackupRetainDays', partial.autoBackupRetainDays, 1, 365, errors);
  for (const k of [
    'eventLogTierEnabled',
    'eventLogSkipSensorTimeline',
    'eventLogRecordFilterEnabled',
  ] as const) {
    if (k in partial) requireBool(section, k, partial[k], errors);
  }
  if ('eventLogRecordFilterMode' in partial) {
    const mode = partial.eventLogRecordFilterMode;
    if (mode !== 'block' && mode !== 'allow_domains') {
      errors.push({
        section,
        key: 'eventLogRecordFilterMode',
        message: '须为 block 或 allow_domains',
      });
    }
  }
  for (const key of ['eventLogRecordBlockDomains', 'eventLogRecordAllowDomains'] as const) {
    if (!(key in partial)) continue;
    const domains = partial[key];
    if (!Array.isArray(domains)) {
      errors.push({ section, key, message: '须为字符串数组' });
    } else if (
      domains.some((d) => typeof d !== 'string' || !/^[a-z0-9_]+$/.test(String(d).trim()))
    ) {
      errors.push({ section, key, message: '每项须为合法 HA domain 名称' });
    }
  }
  if ('eventLogRecordBlockEntityIds' in partial) {
    const ids = partial.eventLogRecordBlockEntityIds;
    if (!Array.isArray(ids)) {
      errors.push({ section, key: 'eventLogRecordBlockEntityIds', message: '须为字符串数组' });
    } else if (ids.some((id) => typeof id !== 'string' || !String(id).trim().includes('.'))) {
      errors.push({
        section,
        key: 'eventLogRecordBlockEntityIds',
        message: '每项须为合法 entity_id（含 domain.）',
      });
    }
  }
  if ('homeTimezone' in partial) {
    const tz = partial.homeTimezone;
    if (typeof tz !== 'string' || !tz.trim()) {
      errors.push({ section, key: 'homeTimezone', message: '必须为非空 IANA 时区字符串' });
    } else {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz.trim() });
      } catch {
        errors.push({ section, key: 'homeTimezone', message: `无效时区: ${tz}` });
      }
    }
  }
}

// ── HA 连接器 ── ────────────────────
/** 校验 HA 连接器配置段。 */
export function validateHaConnectorSection(
  section: string,
  partial: Record<string, unknown>,
  errors: AppConfigFieldError[],
): void {
  if ('reconnectBaseMs' in partial)
    numIn(section, 'reconnectBaseMs', partial.reconnectBaseMs, 100, 60000, errors);
  if ('maxReconnectDelayMs' in partial)
    numIn(section, 'maxReconnectDelayMs', partial.maxReconnectDelayMs, 1000, 300000, errors);
  if ('commandQueueMax' in partial)
    numIn(section, 'commandQueueMax', partial.commandQueueMax, 1, 100, errors);
  if ('commandQueueTtlMs' in partial)
    numIn(section, 'commandQueueTtlMs', partial.commandQueueTtlMs, 1000, 600_000, errors);
  if ('entityRegistryCacheMs' in partial)
    numIn(section, 'entityRegistryCacheMs', partial.entityRegistryCacheMs, 1000, 3_600_000, errors);
  if ('entityRegistryTimeoutMs' in partial)
    numIn(
      section,
      'entityRegistryTimeoutMs',
      partial.entityRegistryTimeoutMs,
      1000,
      120_000,
      errors,
    );
  if ('historyCacheMaxSize' in partial)
    numIn(section, 'historyCacheMaxSize', partial.historyCacheMaxSize, 1, 10_000, errors);
  if ('ingressCoalesceWindowMs' in partial)
    numIn(section, 'ingressCoalesceWindowMs', partial.ingressCoalesceWindowMs, 0, 500, errors);
  if ('disconnectRestPollInitialDelayMs' in partial)
    numIn(
      section,
      'disconnectRestPollInitialDelayMs',
      partial.disconnectRestPollInitialDelayMs,
      0,
      300_000,
      errors,
    );
  if ('disconnectRestPollIntervalMs' in partial)
    numIn(
      section,
      'disconnectRestPollIntervalMs',
      partial.disconnectRestPollIntervalMs,
      1_000,
      600_000,
      errors,
    );
  if ('disconnectRestPollTimeoutMs' in partial)
    numIn(
      section,
      'disconnectRestPollTimeoutMs',
      partial.disconnectRestPollTimeoutMs,
      5_000,
      300_000,
      errors,
    );
  if ('wsPingIntervalMs' in partial)
    numIn(section, 'wsPingIntervalMs', partial.wsPingIntervalMs, 5_000, 300_000, errors);
  if ('wsPongTimeoutMs' in partial)
    numIn(section, 'wsPongTimeoutMs', partial.wsPongTimeoutMs, 1_000, 120_000, errors);
  if ('wsHeartbeatMaxMisses' in partial)
    numIn(section, 'wsHeartbeatMaxMisses', partial.wsHeartbeatMaxMisses, 1, 10, errors);
  if ('coldBatchWindowMs' in partial)
    numIn(section, 'coldBatchWindowMs', partial.coldBatchWindowMs, 0, 500, errors);
  if ('coldBatchMax' in partial)
    numIn(section, 'coldBatchMax', partial.coldBatchMax, 1, 10_000, errors);
  if ('leaderTtlMs' in partial)
    numIn(section, 'leaderTtlMs', partial.leaderTtlMs, 2_000, 120_000, errors);
  if ('leaderRenewMs' in partial)
    numIn(section, 'leaderRenewMs', partial.leaderRenewMs, 500, 60_000, errors);
  for (const k of [
    'ingressCoalesceEnabled',
    'disconnectRestPollEnabled',
    'syncOnlyEnabledEntities',
  ] as const) {
    if (k in partial) requireBool(section, k, partial[k], errors);
  }
  if ('ingressCoalesceDomains' in partial) {
    const domains = partial.ingressCoalesceDomains;
    if (!Array.isArray(domains)) {
      errors.push({ section, key: 'ingressCoalesceDomains', message: '须为字符串数组' });
    } else if (
      domains.some((d) => typeof d !== 'string' || !/^[a-z_][a-z0-9_]*$/i.test(String(d).trim()))
    ) {
      errors.push({
        section,
        key: 'ingressCoalesceDomains',
        message: '每项须为合法 HA domain 名称',
      });
    }
  }
}

// ── 状态存储 ── ────────────────────
/** 校验状态存储配置段。 */
export function validateStateStoreSection(
  section: string,
  partial: Record<string, unknown>,
  errors: AppConfigFieldError[],
): void {
  if ('redisWriteBatch' in partial)
    numIn(section, 'redisWriteBatch', partial.redisWriteBatch, 1, 10_000, errors);
  if ('redisIncrementalFlushMs' in partial)
    numIn(section, 'redisIncrementalFlushMs', partial.redisIncrementalFlushMs, 10, 60_000, errors);
  if ('maxRecentChanges' in partial)
    numIn(section, 'maxRecentChanges', partial.maxRecentChanges, 100, 50_000, errors);
  if ('restCacheTtlMs' in partial)
    numIn(section, 'restCacheTtlMs', partial.restCacheTtlMs, 100, 3_600_000, errors);
  if ('staleThresholdMs' in partial)
    numIn(section, 'staleThresholdMs', partial.staleThresholdMs, 10_000, 3_600_000, errors);
  if ('initialStatesPriorityEnabled' in partial) {
    requireBool(
      section,
      'initialStatesPriorityEnabled',
      partial.initialStatesPriorityEnabled,
      errors,
    );
  }
}

// ── 命令代理 ── ────────────────────
/** 校验指令代理配置段。 */
export function validateCommandProxySection(
  section: string,
  partial: Record<string, unknown>,
  errors: AppConfigFieldError[],
): void {
  if ('idempotencyTtlMs' in partial)
    numIn(section, 'idempotencyTtlMs', partial.idempotencyTtlMs, 100, 60_000, errors);
  if ('idempotencyCleanupIntervalMs' in partial)
    numIn(
      section,
      'idempotencyCleanupIntervalMs',
      partial.idempotencyCleanupIntervalMs,
      1_000,
      600_000,
      errors,
    );
}

// ── WS 推送 ── ────────────────────
/** 校验 WS 推送配置段（各频道刷新间隔、批量上限、延迟档位与关键 domain） */
export function validateWsPushSection(
  section: string,
  partial: Record<string, unknown>,
  errors: AppConfigFieldError[],
): void {
  if ('stateFlushIntervalMs' in partial)
    numIn(section, 'stateFlushIntervalMs', partial.stateFlushIntervalMs, 10, 10_000, errors);
  if ('sensorFlushIntervalMs' in partial)
    numIn(section, 'sensorFlushIntervalMs', partial.sensorFlushIntervalMs, 10, 60_000, errors);
  if ('criticalFlushIntervalMs' in partial)
    numIn(section, 'criticalFlushIntervalMs', partial.criticalFlushIntervalMs, 0, 500, errors);
  if ('pinnedSensorFlushIntervalMs' in partial)
    numIn(
      section,
      'pinnedSensorFlushIntervalMs',
      partial.pinnedSensorFlushIntervalMs,
      0,
      1_000,
      errors,
    );
  if ('stateBatchMax' in partial)
    numIn(section, 'stateBatchMax', partial.stateBatchMax, 10, 2_000, errors);
  if ('haSyncWaitMs' in partial)
    numIn(section, 'haSyncWaitMs', partial.haSyncWaitMs, 1_000, 600_000, errors);
  if ('replayChunkSize' in partial)
    numIn(section, 'replayChunkSize', partial.replayChunkSize, 10, 5_000, errors);
  for (const k of ['coldEntityOnDemand', 'roomBatchEmit'] as const) {
    if (k in partial) requireBool(section, k, partial[k], errors);
  }
  if ('latencyProfile' in partial) {
    const v = partial.latencyProfile;
    if (v !== 'realtime' && v !== 'balanced' && v !== 'bulk') {
      errors.push({
        section,
        key: 'latencyProfile',
        message: '须为 realtime | balanced | bulk',
      });
    }
  }
  if ('criticalDomains' in partial) {
    const domains = partial.criticalDomains;
    if (!Array.isArray(domains)) {
      errors.push({ section, key: 'criticalDomains', message: '须为字符串数组' });
    } else if (
      domains.some((d) => typeof d !== 'string' || !/^[a-z_][a-z0-9_]*$/i.test(String(d).trim()))
    ) {
      errors.push({ section, key: 'criticalDomains', message: '每项须为合法 HA domain 名称' });
    }
  }
}

// ── WebRTC ── ────────────────────
/** 校验 WebRTC 配置段（ICE 服务器 URL、用户名与凭证） */
export function validateWebrtcSection(
  section: string,
  partial: Record<string, unknown>,
  errors: AppConfigFieldError[],
): void {
  if ('iceUrls' in partial && partial.iceUrls != null && typeof partial.iceUrls !== 'string') {
    errors.push({ section, key: 'iceUrls', message: '须为字符串' });
  }
  if (
    'iceUsername' in partial &&
    partial.iceUsername != null &&
    typeof partial.iceUsername !== 'string'
  ) {
    errors.push({ section, key: 'iceUsername', message: '须为字符串' });
  }
  if (
    'iceCredential' in partial &&
    partial.iceCredential != null &&
    typeof partial.iceCredential !== 'string'
  ) {
    errors.push({ section, key: 'iceCredential', message: '须为字符串' });
  }
}
