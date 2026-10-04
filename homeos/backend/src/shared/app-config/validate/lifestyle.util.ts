/**
 * 职责：
 *  - 生活方式配置 zod 校验；
 * 关键依赖：
 *  - zod；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import {
  AppConfigFieldError,
  isEntityId,
  numIn,
  requireBool,
  validateOptionalEntityId,
} from './primitives.util';

// ── 语音 ── ────────────────────
/** 校验语音配置段。 */
export function validateVoiceSection(
  section: string,
  partial: Record<string, unknown>,
  errors: AppConfigFieldError[],
): void {
  if ('sttMode' in partial) {
    const m = partial.sttMode;
    if (m !== 'browser' && m !== 'ha' && m !== 'auto') {
      errors.push({ section, key: 'sttMode', message: '须为 browser | ha | auto' });
    }
  }
  if ('ttsOutputMode' in partial) {
    const m = partial.ttsOutputMode;
    if (m !== 'local' && m !== 'ha' && m !== 'auto') {
      errors.push({ section, key: 'ttsOutputMode', message: '须为 local | ha | auto' });
    }
  }
  if ('dailyAdvisorSpeakHour' in partial)
    numIn(section, 'dailyAdvisorSpeakHour', partial.dailyAdvisorSpeakHour, 0, 23, errors);
  if ('ttsEnabled' in partial && typeof partial.ttsEnabled !== 'boolean') {
    errors.push({ section, key: 'ttsEnabled', message: '须为布尔值' });
  }
  if ('continuousConversation' in partial && typeof partial.continuousConversation !== 'boolean') {
    errors.push({ section, key: 'continuousConversation', message: '须为布尔值' });
  }
  if ('agentFallback' in partial && typeof partial.agentFallback !== 'boolean') {
    errors.push({ section, key: 'agentFallback', message: '须为布尔值' });
  }
  if ('sttEntityId' in partial)
    validateOptionalEntityId(section, 'sttEntityId', partial.sttEntityId, errors);
  if ('wakeWords' in partial) {
    const ww = partial.wakeWords;
    if (!Array.isArray(ww)) {
      errors.push({ section, key: 'wakeWords', message: '必须为字符串数组' });
    } else {
      for (let i = 0; i < ww.length; i++) {
        if (typeof ww[i] !== 'string' || !ww[i].trim()) {
          errors.push({ section, key: `wakeWords[${i}]`, message: '唤醒词不能为空' });
        }
      }
    }
  }
}

// ── 语音命令 ── ────────────────────
const DOMAIN_RE = /^[a-z_][a-z0-9_]*$/i;
const SERVICE_RE = /^[a-z_][a-z0-9_]*$/i;

/** 校验 voiceCommands 数组元素结构（import replace / PUT 全量替换） */
export function validateVoiceCommandsArray(
  commands: unknown,
  errors: AppConfigFieldError[] = [],
): void {
  if (!Array.isArray(commands)) {
    errors.push({ section: 'voiceCommands', key: '*', message: '须为数组' });
    return;
  }
  commands.forEach((cmd, index) => {
    const prefix = `[${index}]`;
    if (!cmd || typeof cmd !== 'object' || Array.isArray(cmd)) {
      errors.push({ section: 'voiceCommands', key: prefix, message: '须为对象' });
      return;
    }
    const row = cmd as Record<string, unknown>;
    if (!Array.isArray(row.phrases)) {
      errors.push({
        section: 'voiceCommands',
        key: `${prefix}.phrases`,
        message: '须为字符串数组',
      });
    } else if (row.phrases.length === 0) {
      errors.push({ section: 'voiceCommands', key: `${prefix}.phrases`, message: '至少一条短语' });
    } else {
      row.phrases.forEach((p, pi) => {
        if (typeof p !== 'string' || !p.trim()) {
          errors.push({
            section: 'voiceCommands',
            key: `${prefix}.phrases[${pi}]`,
            message: '须为非空字符串',
          });
        }
      });
    }
    const domain = typeof row.domain === 'string' ? row.domain.trim() : '';
    if (!domain || !DOMAIN_RE.test(domain)) {
      errors.push({
        section: 'voiceCommands',
        key: `${prefix}.domain`,
        message: '须为有效 HA domain',
      });
    }
    const service = typeof row.service === 'string' ? row.service.trim() : '';
    if (!service || !SERVICE_RE.test(service)) {
      errors.push({
        section: 'voiceCommands',
        key: `${prefix}.service`,
        message: '须为有效 HA service',
      });
    }
    if ('entityMatch' in row && row.entityMatch != null && row.entityMatch !== '') {
      if (typeof row.entityMatch !== 'string') {
        errors.push({
          section: 'voiceCommands',
          key: `${prefix}.entityMatch`,
          message: '须为字符串',
        });
      }
    }
    if ('serviceData' in row && row.serviceData != null) {
      if (typeof row.serviceData !== 'object' || Array.isArray(row.serviceData)) {
        errors.push({
          section: 'voiceCommands',
          key: `${prefix}.serviceData`,
          message: '须为对象',
        });
      }
    }
  });
}

// ── 屏保 ── ────────────────────
const SCREENSAVER_MODES = new Set(['clock', 'weather', 'random']);

/** 校验屏保配置段（模式、亮度、字号等显示参数） */
export function validateScreensaverSection(
  section: string,
  partial: Record<string, unknown>,
  errors: AppConfigFieldError[],
): void {
  if ('scale' in partial) numIn(section, 'scale', partial.scale, 0.5, 5, errors);
  if ('defaultMode' in partial) {
    const mode = partial.defaultMode;
    if (typeof mode !== 'string' || !SCREENSAVER_MODES.has(mode.trim())) {
      errors.push({ section, key: 'defaultMode', message: '须为 clock / weather / random' });
    }
  }
  for (const k of [
    'enableWeatherMode',
    'instantEnter',
    'instantLeave',
    'showBrand',
    'showSeconds',
    'showGregorianDate',
    'showLunar',
    'showWeatherIcon',
    'showWeatherDesc',
    'showWeatherStats',
    'showWeatherMeta',
  ] as const) {
    if (k in partial) requireBool(section, k, partial[k], errors);
  }
  if ('brightness' in partial) numIn(section, 'brightness', partial.brightness, 0.3, 1, errors);
  if ('timeSizeVw' in partial) numIn(section, 'timeSizeVw', partial.timeSizeVw, 4, 60, errors);
  if ('sepSizeVw' in partial) numIn(section, 'sepSizeVw', partial.sepSizeVw, 1, 40, errors);
  if ('secSizeVw' in partial) numIn(section, 'secSizeVw', partial.secSizeVw, 2, 30, errors);
  if ('metaSizeVw' in partial) numIn(section, 'metaSizeVw', partial.metaSizeVw, 1, 20, errors);
  if ('subMetaSizeVw' in partial)
    numIn(section, 'subMetaSizeVw', partial.subMetaSizeVw, 1, 20, errors);
  if ('brandSizePx' in partial) numIn(section, 'brandSizePx', partial.brandSizePx, 8, 120, errors);
  if ('brandTopVh' in partial) numIn(section, 'brandTopVh', partial.brandTopVh, 0, 50, errors);
  if ('contentShiftVh' in partial)
    numIn(section, 'contentShiftVh', partial.contentShiftVh, -30, 30, errors);
  if ('weatherTempSizeVw' in partial)
    numIn(section, 'weatherTempSizeVw', partial.weatherTempSizeVw, 4, 60, errors);
  if ('weatherIconSizeVw' in partial)
    numIn(section, 'weatherIconSizeVw', partial.weatherIconSizeVw, 2, 40, errors);
  if ('weatherStatsSizePx' in partial)
    numIn(section, 'weatherStatsSizePx', partial.weatherStatsSizePx, 8, 48, errors);
}

// ── 媒体播放列表 ── ────────────────────
/** 校验媒体播放列表配置段。 */
export function validateMediaPlaylistsSection(
  section: string,
  partial: Record<string, unknown>,
  errors: AppConfigFieldError[],
): void {
  for (const [playerId, val] of Object.entries(partial)) {
    if (!isEntityId(playerId)) {
      errors.push({ section, key: playerId, message: '播放器键须为合法 entity_id' });
      break;
    }
    if (!val || typeof val !== 'object' || Array.isArray(val)) {
      errors.push({ section, key: playerId, message: '须为 { items, index } 对象' });
      break;
    }
    const o = val as Record<string, unknown>;
    if (!Array.isArray(o.items)) {
      errors.push({ section, key: playerId, message: 'items 须为数组' });
      break;
    }
    if ('index' in o) numIn(section, `${playerId}.index`, o.index, 0, 10_000, errors);
  }
}

// ── 家庭模式 ── ────────────────────
/** 校验家庭模式配置段（应用重试、触发冷却、执行历史上限等） */
export function validateHomeModeSection(
  section: string,
  partial: Record<string, unknown>,
  errors: AppConfigFieldError[],
): void {
  if ('applyMaxRetries' in partial)
    numIn(section, 'applyMaxRetries', partial.applyMaxRetries, 0, 10, errors);
  if ('triggerCooldownMs' in partial)
    numIn(section, 'triggerCooldownMs', partial.triggerCooldownMs, 0, 600_000, errors);
  if ('maxTriggerLogs' in partial)
    numIn(section, 'maxTriggerLogs', partial.maxTriggerLogs, 1, 500, errors);
  if ('maxExecHistory' in partial)
    numIn(section, 'maxExecHistory', partial.maxExecHistory, 1, 500, errors);
  for (const k of ['showAwayButton', 'showHomeMode'] as const) {
    if (k in partial) requireBool(section, k, partial[k], errors);
  }
  if ('manualLockTtlMin' in partial)
    numIn(section, 'manualLockTtlMin', partial.manualLockTtlMin, 0, 1440, errors);
  if ('linkageClaimTtlMin' in partial)
    numIn(section, 'linkageClaimTtlMin', partial.linkageClaimTtlMin, 1, 1440, errors);
}

// ── 前端 ── ────────────────────
/** 校验前端配置段。 */
export function validateFrontendSection(
  section: string,
  partial: Record<string, unknown>,
  errors: AppConfigFieldError[],
): void {
  if ('apiTimeoutMs' in partial)
    numIn(section, 'apiTimeoutMs', partial.apiTimeoutMs, 1000, 120000, errors);
  if ('apiRetryMax' in partial) numIn(section, 'apiRetryMax', partial.apiRetryMax, 0, 10, errors);
  if ('apiRetryDelayMs' in partial)
    numIn(section, 'apiRetryDelayMs', partial.apiRetryDelayMs, 100, 30_000, errors);
  if ('haDisconnectDebounceMs' in partial)
    numIn(section, 'haDisconnectDebounceMs', partial.haDisconnectDebounceMs, 0, 60_000, errors);
  if ('initialStatesWaitMs' in partial)
    numIn(section, 'initialStatesWaitMs', partial.initialStatesWaitMs, 1000, 300_000, errors);
  if ('entityCacheEnabled' in partial)
    requireBool(section, 'entityCacheEnabled', partial.entityCacheEnabled, errors);
  if ('entityCacheMaxAgeMs' in partial)
    numIn(
      section,
      'entityCacheMaxAgeMs',
      partial.entityCacheMaxAgeMs,
      60_000,
      7 * 86400_000,
      errors,
    );
  if ('entityCacheSaveDebounceMs' in partial)
    numIn(
      section,
      'entityCacheSaveDebounceMs',
      partial.entityCacheSaveDebounceMs,
      1000,
      120_000,
      errors,
    );
  if ('rebuildChunkSize' in partial)
    numIn(section, 'rebuildChunkSize', partial.rebuildChunkSize, 50, 5000, errors);
  if ('largeEntityThreshold' in partial)
    numIn(section, 'largeEntityThreshold', partial.largeEntityThreshold, 100, 50000, errors);
  if ('workerDerivedThreshold' in partial)
    numIn(section, 'workerDerivedThreshold', partial.workerDerivedThreshold, 500, 100000, errors);
  if ('rebuildDebounceMs' in partial)
    numIn(section, 'rebuildDebounceMs', partial.rebuildDebounceMs, 10, 2000, errors);
  if ('maxListeners' in partial)
    numIn(section, 'maxListeners', partial.maxListeners, 10, 500, errors);
  if ('callDedupWindowMs' in partial)
    numIn(section, 'callDedupWindowMs', partial.callDedupWindowMs, 0, 10_000, errors);
  if ('maxRemoteNotifications' in partial)
    numIn(section, 'maxRemoteNotifications', partial.maxRemoteNotifications, 1, 1000, errors);
  if ('sessionRefreshHours' in partial)
    numIn(section, 'sessionRefreshHours', partial.sessionRefreshHours, 1, 168, errors);
  if ('optimisticTtlMs' in partial)
    numIn(section, 'optimisticTtlMs', partial.optimisticTtlMs, 500, 30_000, errors);
  if ('initStatesBatchSize' in partial)
    numIn(section, 'initStatesBatchSize', partial.initStatesBatchSize, 10, 5000, errors);
  if ('widgetPollIntervals' in partial && partial.widgetPollIntervals != null) {
    const wpi = partial.widgetPollIntervals as Record<string, unknown>;
    if (typeof wpi !== 'object' || Array.isArray(wpi)) {
      errors.push({ section, key: 'widgetPollIntervals', message: '必须为对象' });
    } else {
      for (const [wk, wv] of Object.entries(wpi)) {
        numIn(section, `widgetPollIntervals.${wk}`, wv, 1000, 600000, errors);
      }
    }
  }
}

// ── UI ── ────────────────────
/** 校验 UI 配置段（缩放基准尺寸、屏保启用、主题色） */
export function validateUiSection(
  section: string,
  partial: Record<string, unknown>,
  errors: AppConfigFieldError[],
): void {
  if ('scaleBaseWidth' in partial)
    numIn(section, 'scaleBaseWidth', partial.scaleBaseWidth, 800, 7680, errors);
  if ('scaleBaseHeight' in partial)
    numIn(section, 'scaleBaseHeight', partial.scaleBaseHeight, 600, 4320, errors);
  if ('screensaverEnabled' in partial)
    requireBool(section, 'screensaverEnabled', partial.screensaverEnabled, errors);
  if ('screensaverIdleMs' in partial)
    numIn(section, 'screensaverIdleMs', partial.screensaverIdleMs, 10_000, 3_600_000, errors);
  if ('accentColor' in partial) {
    const val = partial.accentColor;
    if (typeof val !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(val.trim())) {
      errors.push({ section, key: 'accentColor', message: '须为 #RRGGBB 格式十六进制颜色' });
    }
  }
}

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** 儿童模式：开关、媒体时长、白名单与时间窗 */
export function validateChildModeSection(
  section: string,
  partial: Record<string, unknown>,
  errors: AppConfigFieldError[],
): void {
  if ('enabled' in partial) requireBool(section, 'enabled', partial.enabled, errors);
  if ('dailyMediaLimitMin' in partial)
    numIn(section, 'dailyMediaLimitMin', partial.dailyMediaLimitMin, 0, 1440, errors);
  if ('deviceWhitelist' in partial) {
    if (!Array.isArray(partial.deviceWhitelist)) {
      errors.push({ section, key: 'deviceWhitelist', message: '须为数组' });
    } else {
      partial.deviceWhitelist.forEach((id, i) => {
        if (typeof id !== 'string' || !id.trim() || !isEntityId(id.trim())) {
          errors.push({
            section,
            key: `deviceWhitelist[${i}]`,
            message: '须为有效实体 ID',
          });
        }
      });
    }
  }
  if ('timeWindows' in partial) {
    if (!Array.isArray(partial.timeWindows)) {
      errors.push({ section, key: 'timeWindows', message: '须为数组' });
    } else {
      partial.timeWindows.forEach((raw, i) => {
        const prefix = `timeWindows[${i}]`;
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
          errors.push({ section, key: prefix, message: '须为对象' });
          return;
        }
        const w = raw as Record<string, unknown>;
        const days = w.days;
        const daysOk =
          days === 'weekday' ||
          days === 'weekend' ||
          (Array.isArray(days) &&
            days.every((d) => typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6));
        if (!daysOk) {
          errors.push({
            section,
            key: `${prefix}.days`,
            message: '须为 weekday / weekend 或 0-6 整数数组',
          });
        }
        for (const k of ['start', 'end'] as const) {
          const v = w[k];
          if (v == null || v === '') continue;
          if (typeof v !== 'string' || !HHMM_RE.test(v.trim())) {
            errors.push({ section, key: `${prefix}.${k}`, message: '须为 HH:mm' });
          }
        }
      });
    }
  }
}
