/**
 * @file security-intel.util.ts
 * @module backend/src/shared/app-config/validate
 */
/** 应用配置校验：安防、通知 */
import { AppConfigFieldError, numIn, requireBool } from './primitives.util';

// ── 安防 ── ────────────────────
/** 校验安全配置段。 */
export function validateSecuritySection(
  section: string,
  partial: Record<string, unknown>,
  errors: AppConfigFieldError[],
  context?: Record<string, unknown>,
): void {
  if ('sensorAlertCooldownSec' in partial)
    numIn(section, 'sensorAlertCooldownSec', partial.sensorAlertCooldownSec, 0, 86400, errors);
  if ('awayConfirmMin' in partial)
    numIn(section, 'awayConfirmMin', partial.awayConfirmMin, 1, 120, errors);
  if ('emergencyCooldownSec' in partial)
    numIn(section, 'emergencyCooldownSec', partial.emergencyCooldownSec, 0, 86400, errors);
  if ('armExitGraceSeconds' in partial)
    numIn(section, 'armExitGraceSeconds', partial.armExitGraceSeconds, 0, 600, errors);
  if ('configCacheTtlMs' in partial)
    numIn(section, 'configCacheTtlMs', partial.configCacheTtlMs, 1000, 3_600_000, errors);
  if ('frigateMaxEvents' in partial)
    numIn(section, 'frigateMaxEvents', partial.frigateMaxEvents, 1, 500, errors);
  if ('frigateDedupMs' in partial)
    numIn(section, 'frigateDedupMs', partial.frigateDedupMs, 1000, 600_000, errors);
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
