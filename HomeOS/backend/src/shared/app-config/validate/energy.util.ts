/**
 * @file energy.util.ts
 * @module backend/src/shared/app-config/validate
 */
/** 应用配置校验：能源、能耗预算、电价 */
import { validateTouWindows } from '@homeos/shared';
import { AppConfigFieldError, numIn, requireBool, validateEntityIdList, validateOptionalEntityId, validateOptionalNonEmptyString } from './primitives.util';

/** 已从 energy 迁到 iaq 的键；PATCH energy 时直接拒绝，避免写进错误分区 */
const ENERGY_REJECTED_IAQ_KEYS = [
  'iaqAlertThreshold',
  'iaqTargetTemp',
  'iaqTargetHumidity',
  'iaqWeightPm25',
  'iaqWeightCo2',
  'iaqWeightTvoc',
  'iaqWeightTemp',
  'iaqWeightHumidity',
  'moldAlertCooldownMin',
  'linkageIaqFanEntityId',
  'linkageDehumidifierEntityId',
  'linkageMoldSceneId',
  'linkageIaqSceneId',
] as const;

// ── 能源 ── ────────────────────
/** 校验能源配置段（基线学习、联动开关、储能调度等字段） */
export function validateEnergySection(
  section: string,
  partial: Record<string, unknown>,
  errors: AppConfigFieldError[],
): void {
  if ('baselineSize' in partial)
    numIn(section, 'baselineSize', partial.baselineSize, 1, 100, errors);
  if ('sustainedMs' in partial)
    numIn(section, 'sustainedMs', partial.sustainedMs, 60000, 86400000, errors);
  if ('learningPeriodDays' in partial)
    numIn(section, 'learningPeriodDays', partial.learningPeriodDays, 0, 90, errors);
  if ('budgetAlertCooldownMin' in partial)
    numIn(section, 'budgetAlertCooldownMin', partial.budgetAlertCooldownMin, 30, 10080, errors);
  if ('standbyThresholdW' in partial)
    numIn(section, 'standbyThresholdW', partial.standbyThresholdW, 1, 10000, errors);
  if ('spikeRatio' in partial) numIn(section, 'spikeRatio', partial.spikeRatio, 1, 20, errors);
  if ('anomalyCooldownMin' in partial)
    numIn(section, 'anomalyCooldownMin', partial.anomalyCooldownMin, 1, 1440, errors);
  if ('meterEntityId' in partial)
    validateOptionalEntityId(section, 'meterEntityId', partial.meterEntityId, errors);
  if ('circuitEntityIds' in partial)
    validateEntityIdList(section, 'circuitEntityIds', partial.circuitEntityIds, errors);
  for (const k of [
    'linkageEnabled',
    'linkageClimateApply',
    'linkageWaterHeaterEco',
  ] as const) {
    if (k in partial) requireBool(section, k, partial[k], errors);
  }
  if ('linkageWaterHeaterEntityId' in partial)
    validateOptionalEntityId(section, 'linkageWaterHeaterEntityId', partial.linkageWaterHeaterEntityId, errors);
  for (const k of ['linkageBudgetModeId', 'linkageAnomalySceneId'] as const) {
    if (k in partial) validateOptionalNonEmptyString(section, k, partial[k], errors);
  }
  if ('storageDispatchEnabled' in partial)
    requireBool(section, 'storageDispatchEnabled', partial.storageDispatchEnabled, errors);
  if ('storageDispatchBatteryEntityId' in partial)
    validateOptionalEntityId(section, 'storageDispatchBatteryEntityId', partial.storageDispatchBatteryEntityId, errors);
  for (const k of ['storageDispatchChargeEntities', 'storageDispatchDischargeEntities'] as const) {
    if (k in partial) validateEntityIdList(section, k, partial[k], errors);
  }
  for (const k of [
    'storageDispatchChargeSocTarget',
    'storageDispatchDischargeSocThreshold',
    'storageDispatchDischargeSocMin',
  ] as const) {
    if (k in partial) numIn(section, k, partial[k], 0, 100, errors);
  }
  if ('storageDispatchCooldownMin' in partial)
    numIn(section, 'storageDispatchCooldownMin', partial.storageDispatchCooldownMin, 1, 1440, errors);

  for (const k of ENERGY_REJECTED_IAQ_KEYS) {
    if (k in partial) {
      errors.push({ section, key: k, message: '已迁至 iaq 分区' });
    }
  }
}

// ── 能耗预算 ── ────────────────────
/** 校验能耗预算配置段。 */
export function validateEnergyBudgetSection(
  section: string,
  partial: Record<string, unknown>,
  errors: AppConfigFieldError[],
): void {
  if ('monthlyKwh' in partial) numIn(section, 'monthlyKwh', partial.monthlyKwh, 0, 100_000, errors);
  if ('monthlyCost' in partial)
    numIn(section, 'monthlyCost', partial.monthlyCost, 0, 10_000_000, errors);
  if ('tempSensitivityKwh' in partial)
    numIn(section, 'tempSensitivityKwh', partial.tempSensitivityKwh, 0, 10, errors);
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
  if ('tier2Kwh' in partial) numIn(section, 'tier2Kwh', partial.tier2Kwh, 0, 100_000, errors);
  if (!fixedMode) {
    const tier1Raw = mergedValue('tier1Kwh');
    const tier2Raw = mergedValue('tier2Kwh');
    if (tier1Raw !== undefined && tier2Raw !== undefined) {
      const t1 = Number(tier1Raw);
      const t2 = Number(tier2Raw);
      if (Number.isFinite(t1) && Number.isFinite(t2) && t2 <= t1) {
        errors.push({ section, key: 'tier2Kwh', message: '第二阶梯电量须大于第一阶梯电量' });
      }
    }
  }
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
