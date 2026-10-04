/**
 * @file energy.util.ts
 * @module backend/src/shared/app-config/validate
 */
/** 应用配置校验：能源、能耗预算、电价 */
import { validateTouWindows } from '@homeos/shared';
import { AppConfigFieldError, numIn, validateEntityIdList, validateOptionalEntityId } from './primitives.util';

// ── 能源 ── ────────────────────
/** 校验能源配置段（电表与电路绑定、异常检测冷却） */
export function validateEnergySection(
  section: string,
  partial: Record<string, unknown>,
  errors: AppConfigFieldError[],
): void {
  if ('learningPeriodDays' in partial)
    numIn(section, 'learningPeriodDays', partial.learningPeriodDays, 0, 90, errors);
  if ('budgetAlertCooldownMin' in partial)
    numIn(section, 'budgetAlertCooldownMin', partial.budgetAlertCooldownMin, 30, 10080, errors);
  if ('anomalyCooldownMin' in partial)
    numIn(section, 'anomalyCooldownMin', partial.anomalyCooldownMin, 1, 1440, errors);
  if ('meterEntityId' in partial)
    validateOptionalEntityId(section, 'meterEntityId', partial.meterEntityId, errors);
  if ('circuitEntityIds' in partial)
    validateEntityIdList(section, 'circuitEntityIds', partial.circuitEntityIds, errors);
}

// ── 电价 ── ────────────────────
/** 校验 "H:MM" / "HH:MM" 时刻字符串（0–23 时，0–59 分） */
function validateClockTime(
  section: string,
  key: string,
  val: unknown,
  errors: AppConfigFieldError[],
): void {
  if (typeof val !== 'string') {
    errors.push({ section, key, message: '须为 HH:MM 时刻字符串' });
    return;
  }
  const m = /^(\d{1,2}):(\d{2})$/.exec(val.trim());
  if (!m) {
    errors.push({ section, key, message: '格式须为 HH:MM（如 08:00）' });
    return;
  }
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) {
    errors.push({ section, key, message: '小时须 0–23，分钟须 0–59' });
  }
}

function isFixedPricingMode(
  partial: Record<string, unknown>,
  context?: Record<string, unknown>,
): boolean {
  const mode =
    partial.pricingMode ?? (context?.pricing as Record<string, unknown> | undefined)?.pricingMode;
  return mode === 'fixed';
}

/** 校验电价配置段（峰谷时刻、计价模式、固定电价） */
export function validatePricingSection(
  section: string,
  partial: Record<string, unknown>,
  errors: AppConfigFieldError[],
  context?: Record<string, unknown>,
): void {
  for (const key of ['peakStart1', 'peakEnd1', 'peakStart2', 'peakEnd2', 'valleyStart', 'valleyEnd'] as const) {
    if (key in partial) validateClockTime(section, key, partial[key], errors);
  }
  if ('timeOfUseEnabled' in partial && typeof partial.timeOfUseEnabled !== 'boolean') {
    errors.push({ section, key: 'timeOfUseEnabled', message: '须为布尔值' });
  }
  if ('pricingMode' in partial) {
    const mode = partial.pricingMode;
    if (mode !== 'tiered' && mode !== 'fixed') {
      errors.push({ section, key: 'pricingMode', message: '须为 tiered 或 fixed' });
    }
  }
  if ('fixedPrice' in partial) numIn(section, 'fixedPrice', partial.fixedPrice, 0, 10, errors);
  if ('regionLabel' in partial && partial.regionLabel != null && typeof partial.regionLabel !== 'string') {
    errors.push({ section, key: 'regionLabel', message: '须为字符串' });
  }
  const fixedMode = isFixedPricingMode(partial, context);
  /** 读取字段合并值：partial 中存在则用 partial 值，否则取上下文（当前配置）中该字段的值 */
  const mergedValue = (key: string): unknown =>
    key in partial
      ? partial[key]
      : (context?.pricing as Record<string, unknown> | undefined)?.[key];
  if (fixedMode && 'fixedPrice' in partial && Number(partial.fixedPrice) <= 0) {
    errors.push({ section, key: 'fixedPrice', message: '固定单价须大于 0' });
  }
  if ('tier1Kwh' in partial) numIn(section, 'tier1Kwh', partial.tier1Kwh, 0, 100_000, errors);
  if ('tier1Price' in partial) numIn(section, 'tier1Price', partial.tier1Price, 0, 10, errors);
  if ('tier2Price' in partial) numIn(section, 'tier2Price', partial.tier2Price, 0, 10, errors);
  if ('tier3Price' in partial) numIn(section, 'tier3Price', partial.tier3Price, 0, 10, errors);
  for (const key of ['peakPrice', 'valleyPrice', 'flatPrice'] as const) {
    if (key in partial) numIn(section, key, partial[key], 0, 10, errors);
  }
  const touEnabled = mergedValue('timeOfUseEnabled') !== false;
  const touKeysTouched = [
    'peakStart1',
    'peakEnd1',
    'peakStart2',
    'peakEnd2',
    'valleyStart',
    'valleyEnd',
    'timeOfUseEnabled',
  ].some((k) => k in partial);
  if (touEnabled && touKeysTouched) {
    for (const message of validateTouWindows({
      peakStart1: String(mergedValue('peakStart1') ?? ''),
      peakEnd1: String(mergedValue('peakEnd1') ?? ''),
      peakStart2: String(mergedValue('peakStart2') ?? ''),
      peakEnd2: String(mergedValue('peakEnd2') ?? ''),
      valleyStart: String(mergedValue('valleyStart') ?? ''),
      valleyEnd: String(mergedValue('valleyEnd') ?? ''),
    })) {
      errors.push({ section, key: 'peakStart1', message });
    }
  }
}

/** 切换为 fixed 且本次未指定分时时，默认关闭峰谷平 */
export function normalizePricingPatch(partial: Record<string, unknown>): Record<string, unknown> {
  if ('pricingMode' in partial && partial.pricingMode === 'fixed' && !('timeOfUseEnabled' in partial)) {
    return { ...partial, timeOfUseEnabled: false };
  }
  return partial;
}
