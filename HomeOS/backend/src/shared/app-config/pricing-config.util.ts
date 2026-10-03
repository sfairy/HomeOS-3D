/**
 * @file pricing-config.util.ts
 * @module backend/src/shared/app-config
 */
/**
 * 电价计费解析工具：阶梯/固定单价/分时峰谷平三种模式统一入口。
 *
 * 职责：
 *   - resolveEffectivePricing：读取 pricing 根级字段（兼容历史嵌套结构）；
 *   - isPeakTime / isValleyTime / getTimePeriod：判断当前时刻所处分时段；
 *   - resolveTouUnitPrices / getPeriodUnitPrice：解析峰谷平单价与当前应使用的电价；
 *   - normalizePricingPatch 见 energy.util（切换为 fixed 且未指定分时时默认关闭峰谷平）。
 * 关键依赖：./types#AppConfigData['pricing']、@homeos/shared#validateTouWindows（分时段窗口合法性校验）。
 */
import { zonedDateParts } from '@homeos/shared';
import type { AppConfigData } from './types';

/** pricing 根级字段外加可选 label（兼容历史嵌套结构） */
type EffectivePricingConfig = AppConfigData['pricing'] & {
  label?: string;
};

/** 分时电价上下文：调用方提供当前阶梯档/固定单价等基础参数，供推导峰谷平单价 */
export type TouPriceContext = {
  pricingMode: 'tiered' | 'fixed';
  tierUnitPrice: number;
  tier1Price: number;
  tier2Price: number;
  tier3Price: number;
  fixedPrice: number;
};

/** 分时段：peak（峰）/ valley（谷）/ flat（平） */
type TimePeriod = 'peak' | 'valley' | 'flat';

/** 当前时段电价解析结果：含是否启用分时、当前时段、单价与全部时段单价表 */
type PeriodUnitPriceResult = {
  timeOfUseEnabled: boolean;
  period: TimePeriod | null;
  pricePerKwh: number;
  tierUnitPrice: number;
  periodPrices: Record<TimePeriod, number> | null;
};

/** 直接使用 pricing 根级字段 */
export function resolveEffectivePricing(cfg: AppConfigData['pricing']): EffectivePricingConfig {
  return cfg;
}

/** 将 "H:MM" / "HH:MM" 时刻字符串转换为当日分钟数（0–1439） */
function toMinutes(t: string): number {
  const [h, m] = t.split(':').map((x) => parseInt(x, 10) || 0);
  return h * 60 + m;
}

/** 判断当前时刻是否落在 [start, end) 区间内；支持跨日（如 23:00–07:00） */
function inTimeRange(now: string, start: string, end: string): boolean {
  const n = toMinutes(now);
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s <= e) return n >= s && n < e;
  return n >= s || n < e;
}

/** 将 Date 格式化为 "HH:MM" 字符串，用于分时段判断（可选家庭 IANA 时区） */
function hhmm(now: Date, timeZone?: string): string {
  const p = zonedDateParts(now, timeZone);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** 是否启用分时峰谷平（关闭后统一按阶梯档或固定单价计费，且不触发温控错峰） */
function isTimeOfUseEnabled(cfg: AppConfigData['pricing']): boolean {
  return cfg.timeOfUseEnabled !== false;
}

/** 非分时下的基础单价（固定模式取 fixedPrice，阶梯模式取当前档） */
function resolveBaseUnitPrice(
  cfg: AppConfigData['pricing'],
  ctx: TouPriceContext,
): number {
  if (ctx.pricingMode === 'fixed') {
    return Number(cfg.fixedPrice) > 0 ? Number(cfg.fixedPrice) : ctx.fixedPrice || ctx.tierUnitPrice;
  }
  return ctx.tierUnitPrice;
}

/** 判断给定时刻是否处于峰电时段（仅分时启用时有效） */
export function isPeakTime(
  now: Date,
  cfg: AppConfigData['pricing'],
  timeZone?: string,
): boolean {
  if (!isTimeOfUseEnabled(cfg)) return false;
  const p = resolveEffectivePricing(cfg);
  const hm = hhmm(now, timeZone);
  return (
    inTimeRange(hm, p.peakStart1, p.peakEnd1) || inTimeRange(hm, p.peakStart2, p.peakEnd2)
  );
}

/** 温控/业务侧是否处于需错峰的峰段（与分时开关一致） */
export function isPeakShiftActive(
  now: Date,
  cfg: AppConfigData['pricing'],
  timeZone?: string,
): boolean {
  return isPeakTime(now, cfg, timeZone);
}

/** 判断给定时刻是否处于谷电时段（可配置 valleyStart/valleyEnd，默认 23:00–07:00） */
function isValleyTime(now: Date, cfg: AppConfigData['pricing'], timeZone?: string): boolean {
  if (!isTimeOfUseEnabled(cfg)) return false;
  const p = resolveEffectivePricing(cfg);
  const start = String(p.valleyStart || '23:00').trim() || '23:00';
  const end = String(p.valleyEnd || '07:00').trim() || '07:00';
  return inTimeRange(hhmm(now, timeZone), start, end);
}

/** 当前时段；未启用分时时返回 null */
export function getTimePeriod(
  now: Date,
  cfg: AppConfigData['pricing'],
  timeZone?: string,
): TimePeriod | null {
  if (!isTimeOfUseEnabled(cfg)) return null;
  if (isPeakTime(now, cfg, timeZone)) return 'peak';
  if (isValleyTime(now, cfg, timeZone)) return 'valley';
  return 'flat';
}

/** 解析峰/谷/平单价；为 0 时按阶梯或固定单价推导 */
export function resolveTouUnitPrices(
  cfg: AppConfigData['pricing'],
  ctx: TouPriceContext,
): Record<TimePeriod, number> {
  const t1 = Number(cfg.tier1Price) > 0 ? Number(cfg.tier1Price) : ctx.tier1Price;
  const t2 = Number(cfg.tier2Price) > 0 ? Number(cfg.tier2Price) : ctx.tier2Price;
  const baseFixed =
    Number(cfg.fixedPrice) > 0 ? Number(cfg.fixedPrice) : ctx.fixedPrice || ctx.tierUnitPrice || t1;
  const flatBase = ctx.pricingMode === 'fixed' ? baseFixed : t1;
  const peakBase = ctx.pricingMode === 'fixed' ? baseFixed : t2;
  const valleyBase = ctx.pricingMode === 'fixed' ? baseFixed * 0.63 : flatBase * 0.63;

  const peak = Number(cfg.peakPrice) > 0 ? Number(cfg.peakPrice) : peakBase;
  const valley = Number(cfg.valleyPrice) > 0 ? Number(cfg.valleyPrice) : valleyBase;
  const flat = Number(cfg.flatPrice) > 0 ? Number(cfg.flatPrice) : flatBase;
  return { peak, valley, flat };
}

/** 当前应使用的电价（分时时按峰谷平，否则为阶梯/固定档单价） */
export function getPeriodUnitPrice(
  now: Date,
  cfg: AppConfigData['pricing'],
  ctx: TouPriceContext,
): PeriodUnitPriceResult {
  const baseUnitPrice = resolveBaseUnitPrice(cfg, ctx);
  if (!isTimeOfUseEnabled(cfg)) {
    return {
      timeOfUseEnabled: false,
      period: null,
      pricePerKwh: baseUnitPrice,
      tierUnitPrice: baseUnitPrice,
      periodPrices: null,
    };
  }
  const periodPrices = resolveTouUnitPrices(cfg, ctx);
  const period = getTimePeriod(now, cfg) ?? 'flat';
  return {
    timeOfUseEnabled: true,
    period,
    pricePerKwh: periodPrices[period],
    tierUnitPrice: baseUnitPrice,
    periodPrices,
  };
}

/** 将分时段枚举转为中文标签（峰段/谷段/平段），空值返回空串 */
export function timePeriodLabel(period: TimePeriod | null | undefined): string {
  if (period === 'peak') return '峰段';
  if (period === 'valley') return '谷段';
  if (period === 'flat') return '平段';
  return '';
}
