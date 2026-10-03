/**
 * @file energy/budget.service.ts
 * @module backend/src/modules
 *
 * 月度能源预算服务：根据用户设定的月度 kWh / 元预算，结合当月已用量、
 * 日均推算月末预计用量，超支或预计超支时发出告警通知。
 *
 * 关键能力：
 *  - 周期性检查：每 6 小时由 JobRegistryService 调度一次预算检查。
 *  - 预测：星期因子 + 气温修正（OpenWeather 5 日预报均值偏移），更接近月末真实用量。
 *  - 阶梯费用估算：分段累加各档额度 × 单价，避免「当前档单价 × 全部用量」偏差。
 *  - 冷却：超支告警 12 小时内不重复发送；预算调整后立即重置冷却。
 *  - 多实例：通过 EventBusService 跨实例广播 ENERGY_BUDGET_EXCEEDED 事件。
 */
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { APP_CONFIG_UPDATED, AppConfigService } from '../../shared/app-config/service';
import { JobRegistryService } from '../../shared/jobs/registry.service';
import { TieredPricingService } from './tiered-pricing.service';
import { EventBusService } from '../../shared/redis/event-bus.service';
import { weekdayAwareForecast } from '../../common/utils/stats.util';
import { StateStoreService } from '../state-store/service';
import { getPeriodUnitPrice, type TouPriceContext } from '../../shared/app-config/pricing-config.util';
import { ExternalApiService } from '../system/ops/external-api.service';
import { getErrorMessage } from '../../common/utils';
import { HOMEOS_EVENTS } from '../../shared/homeos-events';

/** 气温偏差解析缓存（毫秒） */
const TEMP_FETCH_TTL_MS = 6 * 3600 * 1000;

/**
 * 月度能源预算服务（@Injectable）。
 *
 * - 预算：用户设定月度用电量（kWh）/电费（元）预算，结合当月已用量与日均推算月末，
 *   超支或预计超支时发出告警通知。
 */
@Injectable()
export class EnergyBudgetService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EnergyBudgetService.name);
  private checkTimer: NodeJS.Timeout | null = null;
  private lastAlertAt = 0;
  private readonly ALERT_COOLDOWN_MS = 12 * 3600 * 1000;

  constructor(
    private readonly appConfig: AppConfigService,
    private readonly pricing: TieredPricingService,
    private readonly eventBus: EventBusService,
    private readonly jobs: JobRegistryService,
    private readonly stateStore: StateStoreService,
    private readonly externalApi: ExternalApiService,
  ) {}

  private tempDeviationC = 0;
  private tempDeviationAt = 0;

  onModuleInit() {
    // 每 6 小时检查一次预算
    this.checkTimer = setInterval(
      () =>
        void this.jobs
          .run('energy-budget', { description: '能源预算检查', intervalMs: 6 * 3600 * 1000 }, () =>
            this.checkAndAlert(),
          )
          .catch((err) => {
            this.logger.error(`能源预算检查失败: ${(err as Error).message}`);
          }),
      6 * 3600 * 1000,
    );
  }

  onModuleDestroy() {
    if (this.checkTimer) clearInterval(this.checkTimer);
  }

  async setBudget(body: { monthlyKwh?: number; monthlyCost?: number }) {
    const partial: { monthlyKwh?: number; monthlyCost?: number } = {};
    if (body.monthlyKwh != null) partial.monthlyKwh = Math.max(0, body.monthlyKwh);
    if (body.monthlyCost != null) partial.monthlyCost = Math.max(0, body.monthlyCost);
    await this.appConfig.update({ energyBudget: partial } as Parameters<
      AppConfigService['update']
    >[0]);
    return this.getStatus();
  }

  /** 预算配置变更时重置告警冷却：用户调整预算后应立即按新阈值重新评估，而非沿用旧冷却 */
  @OnEvent(APP_CONFIG_UPDATED)
  onBudgetConfigUpdated(keys: string[]) {
    if (!keys.includes('energyBudget')) return;
    this.lastAlertAt = 0;
    void this.checkAndAlert().catch((err) => {
      this.logger.error(`能源预算检查失败: ${(err as Error).message}`);
    });
  }

  async getStatus() {
    const budget = this.appConfig.get('energyBudget');
    const meterEntityId = String(this.appConfig.get('energy').meterEntityId || '').trim();
    const meterBound = Boolean(meterEntityId);

    if (!meterBound) {
      return {
        meterBound: false,
        meterEntityId: null,
        budget: { monthlyKwh: budget.monthlyKwh, monthlyCost: budget.monthlyCost },
        monthUsage: null,
        monthCost: null,
        projectedKwh: null,
        projectedCost: null,
        kwhUsedPct: null,
        costUsedPct: null,
        dailyAvgKwh: null,
        daysElapsed: null,
        daysInMonth: null,
        projectedOverBudget: false,
        warnings: [] as string[],
        forecast: null,
      };
    }

    const cfg = this.pricing.getConfig();
    const monthUsage = cfg.monthUsage || 0;
    const currentDay = Math.max(cfg.currentDay || 1, 1);
    const daysInMonth = cfg.daysInMonth || 30;

    const dailySeries = await this.pricing.getDailyUsageSeries();
    // 星期因子 + 气温修正预测：周末/工作日用电差异与未来气温波动纳入外推
    const tempDeviation = await this.resolveTempDeviation();
    const forecast = weekdayAwareForecast({
      dailyUsage: dailySeries,
      daysInMonth,
      currentDay,
      todayDow: new Date().getDay(),
      tempDeviationC: tempDeviation,
      tempSensitivityKwh: this.appConfig.get('energyBudget').tempSensitivityKwh,
    });

    const dailyAvg = monthUsage / currentDay;
    const projectedKwh = dailyAvg * daysInMonth;

    // 费用估算：阶梯模式按累计档位分段累加（前 N 度低价、超出部分高价），
    // 避免“当前档单价 × 全部用量”的系统性偏差；fixed 模式保持原逻辑
    const unit = this.estimateUnitPrice(cfg);
    const unitPrice = unit.pricePerKwh;
    const tiers = cfg.tiers || [];
    const isTiered = this.appConfig.get('pricing').pricingMode !== 'fixed' && tiers.length > 0;
    // 分时调制系数：当前时段单价 / 当前档基础单价（未启用分时时为 1）
    const touFactor = isTiered && unit.baseUnitPrice > 0 ? unitPrice / unit.baseUnitPrice : 1;
    const monthCost = isTiered
      ? this.estimateTieredCost(monthUsage, tiers, touFactor)
      : monthUsage * unitPrice;
    const projectedCost = isTiered
      ? this.estimateTieredCost(projectedKwh, tiers, touFactor)
      : projectedKwh * unitPrice;

    const kwhUsedPct =
      budget.monthlyKwh > 0 ? Math.round((monthUsage / budget.monthlyKwh) * 100) : null;
    const costUsedPct =
      budget.monthlyCost > 0 ? Math.round((monthCost / budget.monthlyCost) * 100) : null;

    const overKwh = budget.monthlyKwh > 0 && projectedKwh > budget.monthlyKwh;
    const overCost = budget.monthlyCost > 0 && projectedCost > budget.monthlyCost;

    return {
      meterBound: true,
      meterEntityId,
      budget: { monthlyKwh: budget.monthlyKwh, monthlyCost: budget.monthlyCost },
      monthUsage: Math.round(monthUsage),
      monthCost: Math.round(monthCost * 100) / 100,
      projectedKwh: Math.round(projectedKwh),
      projectedCost: Math.round(projectedCost * 100) / 100,
      kwhUsedPct,
      costUsedPct,
      dailyAvgKwh: Math.round(dailyAvg * 10) / 10,
      daysElapsed: currentDay,
      daysInMonth,
      projectedOverBudget: overKwh || overCost,
      warnings: this.buildWarnings(budget, projectedKwh, projectedCost),
      forecast: {
        next7DaysKwh: forecast.next7Days,
        next30DaysKwh: forecast.next30Days,
        slopePerDay: forecast.slopePerDay,
        method: forecast.method,
        basedOnDays: forecast.basedOnDays,
        weekdayFactors: forecast.weekdayFactors,
        tempDeviationC: tempDeviation,
      },
    };
  }

  /**
   * 解析未来一周平均气温相对当前基线的偏移（℃）。
   * 基线取 circadian.weatherEntityId 的当前温度；预报取 OpenWeather 5 日预报均值。
   * 任一来源不可用时返回 0（不做气温修正）。结果缓存 6 小时。
   */
  private async resolveTempDeviation(): Promise<number> {
    const now = Date.now();
    if (now - this.tempDeviationAt < TEMP_FETCH_TTL_MS) return this.tempDeviationC;
    this.tempDeviationAt = now;
    this.tempDeviationC = 0;

    const ext = this.appConfig.get('external');
    if (!ext.openWeatherApiKey) return 0;

    try {
      const { list } = await this.externalApi.fetchForecast({ cnt: 5 });
      const temps = list
        .map((x) => x.main?.temp)
        .filter((t): t is number => typeof t === 'number');
      if (!temps.length) return 0;
      const forecastAvg = temps.reduce((s, t) => s + t, 0) / temps.length;

      const weatherId = String(this.appConfig.get('circadian').weatherEntityId || '').trim();
      const currentRaw = weatherId ? this.stateStore.getById(weatherId)?.state : null;
      const currentTemp = parseFloat(String(currentRaw ?? ''));
      if (!Number.isFinite(currentTemp)) return 0;

      this.tempDeviationC = Math.round((forecastAvg - currentTemp) * 10) / 10;
    } catch (err) {
      this.logger.debug(`气温偏差解析失败: ${getErrorMessage(err)}`);
      this.tempDeviationC = 0;
    }
    return this.tempDeviationC;
  }

  /**
   * 当前单位电价（含分时调制）。
   * @returns pricePerKwh 当前应使用的电价；baseUnitPrice 阶梯/固定基础单价（未调制，供分时系数计算）
   */
  private estimateUnitPrice(
    cfg: ReturnType<TieredPricingService['getConfig']>,
  ): { pricePerKwh: number; baseUnitPrice: number } {
    const pricingCfg = this.appConfig.get('pricing');
    const tiers = cfg.tiers || [];
    const year = cfg.yearUsage || 0;
    let currentTier = tiers[0];
    for (const t of tiers) {
      if (year < t.maxKwh) {
        currentTier = t;
        break;
      }
    }
    if (!currentTier) return { pricePerKwh: 0.5, baseUnitPrice: 0.5 };
    const pricingMode = pricingCfg.pricingMode === 'fixed' ? 'fixed' : 'tiered';
    const tier1Price = Number(pricingCfg.tier1Price) || tiers[0]?.pricePerKwh || 0.4883;
    const tier2Price = Number(pricingCfg.tier2Price) || tiers[1]?.pricePerKwh || 0.5383;
    const tier3Price = Number(pricingCfg.tier3Price) || tiers[2]?.pricePerKwh || 0.7883;
    const fixedPrice = Number(pricingCfg.fixedPrice) || tier1Price;
    const baseUnitPrice = pricingMode === 'fixed' ? fixedPrice : currentTier.pricePerKwh;
    const ctx: TouPriceContext = {
      pricingMode,
      tierUnitPrice: baseUnitPrice,
      tier1Price,
      tier2Price,
      tier3Price,
      fixedPrice,
    };
    const tou = getPeriodUnitPrice(new Date(), pricingCfg, ctx);
    return { pricePerKwh: tou.pricePerKwh, baseUnitPrice };
  }

  /**
   * 阶梯费用分段估算：从第一档开始按每档额度 × 单价逐段累加，直到用完用电量。
   * @param kwh       待估算用电量（kWh）
   * @param tiers     阶梯档位（maxKwh 为累计阈值，最后一档可为 Infinity）
   * @param touFactor 分时调制系数（当前时段单价 / 当前档基础单价，未启用分时时为 1）
   */
  private estimateTieredCost(
    kwh: number,
    tiers: Array<{ maxKwh: number; pricePerKwh: number; label?: string }>,
    touFactor: number,
  ): number {
    let remaining = Math.max(0, kwh);
    let cost = 0;
    let prevMax = 0;
    for (const tier of tiers) {
      if (remaining <= 0) break;
      const upper = Number.isFinite(tier.maxKwh) ? tier.maxKwh : Number.POSITIVE_INFINITY;
      const quota = Math.max(upper - prevMax, 0);
      const used = Math.min(remaining, quota);
      cost += used * tier.pricePerKwh;
      remaining -= used;
      prevMax = upper;
    }
    return cost * touFactor;
  }

  private buildWarnings(
    budget: { monthlyKwh: number; monthlyCost: number },
    projectedKwh: number,
    projectedCost: number,
  ): string[] {
    const warnings: string[] = [];
    if (budget.monthlyKwh > 0 && projectedKwh > budget.monthlyKwh) {
      warnings.push(
        `本月预计用电 ${Math.round(projectedKwh)} kWh，将超出预算 ${budget.monthlyKwh} kWh`,
      );
    }
    if (budget.monthlyCost > 0 && projectedCost > budget.monthlyCost) {
      warnings.push(
        `本月预计电费 ${projectedCost.toFixed(0)} 元，将超出预算 ${budget.monthlyCost} 元`,
      );
    }
    return warnings;
  }

  private async checkAndAlert() {
    const status = await this.getStatus();
    if (!status.meterBound) return;
    if (!status.projectedOverBudget || status.warnings.length === 0) return;
    if (Date.now() - this.lastAlertAt < this.ALERT_COOLDOWN_MS) return;
    this.lastAlertAt = Date.now();
    this.eventBus.emit(HOMEOS_EVENTS.ENERGY_BUDGET_EXCEEDED, {
      message: status.warnings.join('；'),
      projectedKwh: status.projectedKwh,
      projectedCost: status.projectedCost,
      timestamp: new Date().toISOString(),
    });
    this.logger.warn(`能源预算告警: ${status.warnings.join(';')}`);
  }
}
