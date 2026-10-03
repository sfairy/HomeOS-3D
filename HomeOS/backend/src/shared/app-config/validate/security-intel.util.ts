/**
 * @file security-intel.util.ts
 * @module backend/src/shared/app-config/validate
 */
/** 应用配置校验：安防、智能、通知、自动化、设备 */
import { AppConfigFieldError, numIn, requireBool } from './primitives.util';

// ── 安防 ── ────────────────────
/** 校验安全配置段。 */
export function validateSecuritySection(
  section: string,
  partial: Record<string, unknown>,
  errors: AppConfigFieldError[],
  context?: Record<string, unknown>,
): void {
  /** 读取字段合并值：partial 中存在则用 partial 值，否则取上下文（当前配置）中该字段的值 */
  const mergedValue = (key: string): unknown =>
    key in partial
      ? partial[key]
      : (context?.security as Record<string, unknown> | undefined)?.[key];
  if ('sensorAlertCooldownSec' in partial)
    numIn(section, 'sensorAlertCooldownSec', partial.sensorAlertCooldownSec, 0, 86400, errors);
  if ('anomalyCooldownMin' in partial)
    numIn(section, 'anomalyCooldownMin', partial.anomalyCooldownMin, 1, 1440, errors);
  if ('awayConfirmMin' in partial)
    numIn(section, 'awayConfirmMin', partial.awayConfirmMin, 1, 120, errors);
  if ('emergencyCooldownSec' in partial)
    numIn(section, 'emergencyCooldownSec', partial.emergencyCooldownSec, 0, 86400, errors);
  if ('armExitGraceSeconds' in partial)
    numIn(section, 'armExitGraceSeconds', partial.armExitGraceSeconds, 0, 600, errors);
  if ('configCacheTtlMs' in partial)
    numIn(section, 'configCacheTtlMs', partial.configCacheTtlMs, 1000, 3_600_000, errors);
  for (const k of ['nightStart', 'nightEnd', 'deepNightStart', 'deepNightEnd'] as const) {
    if (k in partial) numIn(section, k, partial[k], 0, 23, errors);
  }
  if ('bedroomInactiveHours' in partial)
    numIn(section, 'bedroomInactiveHours', partial.bedroomInactiveHours, 1, 48, errors);
  if ('wholeHouseInactiveDayHours' in partial)
    numIn(section, 'wholeHouseInactiveDayHours', partial.wholeHouseInactiveDayHours, 1, 48, errors);
  if ('wholeHouseInactiveNightHours' in partial)
    numIn(
      section,
      'wholeHouseInactiveNightHours',
      partial.wholeHouseInactiveNightHours,
      1,
      48,
      errors,
    );
  if ('kitchenStayWarnMin' in partial)
    numIn(section, 'kitchenStayWarnMin', partial.kitchenStayWarnMin, 1, 480, errors);
  if ('frigateMaxEvents' in partial)
    numIn(section, 'frigateMaxEvents', partial.frigateMaxEvents, 1, 500, errors);
  if ('frigateDedupMs' in partial)
    numIn(section, 'frigateDedupMs', partial.frigateDedupMs, 1000, 600_000, errors);
  if ('bathroomLongStayHighMin' in partial)
    numIn(section, 'bathroomLongStayHighMin', partial.bathroomLongStayHighMin, 1, 480, errors);
  if ('bathroomLongStayMediumMin' in partial)
    numIn(section, 'bathroomLongStayMediumMin', partial.bathroomLongStayMediumMin, 1, 480, errors);
  const bathroomHighMin = mergedValue('bathroomLongStayHighMin');
  const bathroomMediumMin = mergedValue('bathroomLongStayMediumMin');
  if (bathroomHighMin !== undefined && bathroomMediumMin !== undefined) {
    const high = Number(bathroomHighMin);
    const medium = Number(bathroomMediumMin);
    if (Number.isFinite(high) && Number.isFinite(medium) && medium >= high) {
      errors.push({
        section,
        key: 'bathroomLongStayMediumMin',
        message: '中风险阈值须小于高风险阈值',
      });
    }
  }
  if ('frigatePersonAlarmModes' in partial) {
    const raw = partial.frigatePersonAlarmModes;
    if (typeof raw !== 'string') {
      errors.push({
        section,
        key: 'frigatePersonAlarmModes',
        message: '须为逗号分隔的布防模式字符串',
      });
    } else {
      const allowed = new Set(['disarmed', 'armed_home', 'armed_away', 'armed_night']);
      const modes =
        raw.trim() === 'none'
          ? []
          : raw
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
      if (modes.some((m) => !allowed.has(m))) {
        errors.push({
          section,
          key: 'frigatePersonAlarmModes',
          message: '须为 disarmed / armed_home / armed_away / armed_night 的逗号组合，或 none',
        });
      }
    }
  }
  if ('anomalyPeriodicIntervalMin' in partial)
    numIn(
      section,
      'anomalyPeriodicIntervalMin',
      partial.anomalyPeriodicIntervalMin,
      1,
      1440,
      errors,
    );
  if ('awaySimBrightnessMin' in partial)
    numIn(section, 'awaySimBrightnessMin', partial.awaySimBrightnessMin, 1, 100, errors);
  if ('awaySimBrightnessRange' in partial)
    numIn(section, 'awaySimBrightnessRange', partial.awaySimBrightnessRange, 0, 100, errors);
  if ('presencePersons' in partial) {
    const persons = partial.presencePersons;
    if (!Array.isArray(persons)) {
      errors.push({ section, key: 'presencePersons', message: '须为数组' });
    } else {
      for (let i = 0; i < persons.length; i++) {
        const item = persons[i];
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          errors.push({ section, key: 'presencePersons', message: `第 ${i + 1} 项须为对象` });
          break;
        }
        const o = item as Record<string, unknown>;
        if (typeof o.name !== 'string' || !String(o.name).trim()) {
          errors.push({
            section,
            key: 'presencePersons',
            message: `第 ${i + 1} 项 name 须为非空字符串`,
          });
          break;
        }
        if (
          !Array.isArray(o.entityIds) ||
          o.entityIds.length === 0 ||
          o.entityIds.some((id) => typeof id !== 'string' || !String(id).trim())
        ) {
          errors.push({
            section,
            key: 'presencePersons',
            message: `第 ${i + 1} 项 entityIds 须为非空字符串数组`,
          });
          break;
        }
      }
    }
  }
  for (const k of [
    'requireConfiguredPersons',
    'mmWaveFusePresence',
    'autoArmOnEveryoneLeft',
    'autoUpgradeToAwayOnEveryoneLeft',
    'calendarArmOnAway',
    'autoDisarmOnFirstHome',
    'linkAwaySimOnArmAway',
    'linkHomeModeOnSecurityChange',
  ] as const) {
    if (k in partial) requireBool(section, k, partial[k], errors);
  }
  if ('awaySimIntervalMinMax' in partial && partial.awaySimIntervalMinMax != null) {
    const iv = partial.awaySimIntervalMinMax as Record<string, unknown>;
    if (typeof iv !== 'object' || Array.isArray(iv)) {
      errors.push({ section, key: 'awaySimIntervalMinMax', message: '必须为对象' });
    } else {
      numIn(section, 'awaySimIntervalMinMax.min', iv.min, 1, 120, errors);
      numIn(section, 'awaySimIntervalMinMax.max', iv.max, 1, 180, errors);
      const ctxIv = (context?.security as Record<string, unknown> | undefined)?.awaySimIntervalMinMax;
      const ctxMinMax =
        ctxIv && typeof ctxIv === 'object' && !Array.isArray(ctxIv)
          ? (ctxIv as Record<string, unknown>)
          : undefined;
      const min = iv.min !== undefined ? iv.min : ctxMinMax?.min;
      const max = iv.max !== undefined ? iv.max : ctxMinMax?.max;
      if (min !== undefined && max !== undefined) {
        const minNum = Number(min);
        const maxNum = Number(max);
        if (Number.isFinite(minNum) && Number.isFinite(maxNum) && minNum > maxNum) {
          errors.push({
            section,
            key: 'awaySimIntervalMinMax',
            message: '最小间隔须小于或等于最大间隔',
          });
        }
      }
    }
  }
  if ('alertChannels' in partial) {
    const channels = partial.alertChannels;
    if (!Array.isArray(channels)) {
      errors.push({ section, key: 'alertChannels', message: '须为数组' });
    } else {
      const allowed = new Set(['in_app', 'email', 'webpush']);
      for (let i = 0; i < channels.length; i++) {
        if (typeof channels[i] !== 'string' || !allowed.has(channels[i])) {
          errors.push({
            section,
            key: 'alertChannels',
            message: '每项须为 in_app / email / webpush 之一',
          });
          break;
        }
      }
    }
  }
  if ('alertBypassDnd' in partial)
    requireBool(section, 'alertBypassDnd', partial.alertBypassDnd, errors);
}

// ── 智能 ── ────────────────────
/** 校验智能配置段。 */
export function validateIntelligenceSection(
  section: string,
  partial: Record<string, unknown>,
  errors: AppConfigFieldError[],
): void {
  if ('recommendationMiningEnabled' in partial)
    requireBool(
      section,
      'recommendationMiningEnabled',
      partial.recommendationMiningEnabled,
      errors,
    );
  if ('baselineAggregateEnabled' in partial)
    requireBool(section, 'baselineAggregateEnabled', partial.baselineAggregateEnabled, errors);
  if ('recommendationMaxPending' in partial)
    numIn(section, 'recommendationMaxPending', partial.recommendationMaxPending, 1, 100, errors);
}

// ── 通知 ── ────────────────────
/** 校验通知配置段。 */
export function validateNotificationSection(
  section: string,
  partial: Record<string, unknown>,
  errors: AppConfigFieldError[],
): void {
  for (const k of ['dndStart', 'dndEnd'] as const) {
    if (k in partial) numIn(section, k, partial[k], 0, 23, errors);
  }
  if ('maxNotifications' in partial)
    numIn(section, 'maxNotifications', partial.maxNotifications, 1, 10000, errors);
  if ('offlineCooldownMin' in partial)
    numIn(section, 'offlineCooldownMin', partial.offlineCooldownMin, 1, 1440, errors);
  if ('lowBatteryCooldownMin' in partial)
    numIn(section, 'lowBatteryCooldownMin', partial.lowBatteryCooldownMin, 1, 1440, errors);
  for (const k of [
    'globalNotifyEnabled',
    'importantNotifyEnabled',
    'offlineNotifyEnabled',
    'lowBatteryNotifyEnabled',
  ] as const) {
    if (k in partial) requireBool(section, k, partial[k], errors);
  }
}

// ── 自动化 ── ────────────────────
/** 校验自动化配置段。 */
export function validateAutomationSection(
  section: string,
  partial: Record<string, unknown>,
  errors: AppConfigFieldError[],
): void {
  if ('haAutoImportIntervalMin' in partial)
    numIn(section, 'haAutoImportIntervalMin', partial.haAutoImportIntervalMin, 30, 10080, errors);
  if ('driftRepairIntervalMin' in partial)
    numIn(section, 'driftRepairIntervalMin', partial.driftRepairIntervalMin, 5, 10080, errors);
  if ('haImportConfigConcurrency' in partial)
    numIn(section, 'haImportConfigConcurrency', partial.haImportConfigConcurrency, 1, 16, errors);
  if ('timeScanIntervalSec' in partial)
    numIn(section, 'timeScanIntervalSec', partial.timeScanIntervalSec, 5, 3600, errors);
  if ('patternScanIntervalSec' in partial)
    numIn(section, 'patternScanIntervalSec', partial.patternScanIntervalSec, 5, 3600, errors);
  if ('actionRetryCount' in partial)
    numIn(section, 'actionRetryCount', partial.actionRetryCount, 0, 10, errors);
  if ('actionRetryDelayMs' in partial)
    numIn(section, 'actionRetryDelayMs', partial.actionRetryDelayMs, 0, 60_000, errors);
  if ('maxParallelRuns' in partial)
    numIn(section, 'maxParallelRuns', partial.maxParallelRuns, 1, 50, errors);
  if ('maxQueueLength' in partial)
    numIn(section, 'maxQueueLength', partial.maxQueueLength, 1, 100, errors);
  if ('waitTemplateTimeoutSec' in partial)
    numIn(section, 'waitTemplateTimeoutSec', partial.waitTemplateTimeoutSec, 10, 3600, errors);
  if ('maxDelaySeconds' in partial)
    numIn(section, 'maxDelaySeconds', partial.maxDelaySeconds, 10, 86400, errors);
  if ('maxRepeatIterations' in partial)
    numIn(section, 'maxRepeatIterations', partial.maxRepeatIterations, 10, 1000, errors);
  if ('dagMaxDepth' in partial)
    numIn(section, 'dagMaxDepth', partial.dagMaxDepth, 1, 100, errors);
  if ('entityTriggerDebounceMs' in partial)
    numIn(section, 'entityTriggerDebounceMs', partial.entityTriggerDebounceMs, 0, 60_000, errors);
  if ('triggerCooldownMs' in partial)
    numIn(section, 'triggerCooldownMs', partial.triggerCooldownMs, 0, 600_000, errors);
  for (const k of [
    'haSyncEnabled',
    'autoSyncOnSave',
    'defaultRunOnHa',
    'autoRepairDrift',
    'skipWhenHaStale',
    'haAutoImportEnabled',
  ] as const) {
    if (k in partial) requireBool(section, k, partial[k], errors);
  }
}

// ── 设备 ── ────────────────────
/** 校验设备配置段（额定循环/时长与健康告警阈值） */
export function validateDeviceSection(
  section: string,
  partial: Record<string, unknown>,
  errors: AppConfigFieldError[],
): void {
  for (const rk of ['ratedCycles', 'ratedHours'] as const) {
    if (!(rk in partial)) continue;
    const rec = partial[rk] as Record<string, unknown>;
    if (typeof rec !== 'object' || Array.isArray(rec)) {
      errors.push({ section, key: rk, message: '必须为键值对象' });
    } else {
      for (const [dk, dv] of Object.entries(rec)) {
        numIn(section, `${rk}.${dk}`, dv, 1, 10_000_000, errors);
      }
    }
  }
  if ('healthAlertThreshold' in partial) {
    numIn(section, 'healthAlertThreshold', partial.healthAlertThreshold, 1, 100, errors);
  }
}
