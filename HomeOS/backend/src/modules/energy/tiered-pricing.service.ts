/**
 * @file tiered-pricing.service.ts
 * @module backend/src/modules
 *
 * 阶梯电价服务：维护阶梯档位 / 固定单价 / 分时峰谷平电价配置，
 * 订阅 HA 主电表状态自动累计当月 / 年度用电量，提供电价分析与预测。
 *
 * 关键能力：
 *  - 配置：从高级参数 pricing 同步三档阶梯或固定单价；支持 Widget 快捷编辑。
 *  - 累加：订阅 HA 电表状态变更，通过分布式锁串行化「累加 + 落库」临界区，多副本安全。
 *  - 锚点持久化：电表上次读数写入 Redis（Lua 时间戳保护）+ app-config 回退，重启后恢复。
 *  - 月切换：跨月时按时间比例拆分上月/本月用电量，避免整段计入本月。
 *  - 异常跳变保护：单次增量 > LARGE_DELTA_KWH 且间隔短视为表计异常，忽略本次增量。
 *  - 预测：linearForecast 基于当月日序列预测月末用量与触档警告。
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { dateFromZonedWallClock, zonedDateParts } from '@homeos/shared';
import { PrismaService } from '../../shared/prisma/service';
import {
  APP_CONFIG_UPDATED,
  AppConfigService,
} from '../../shared/app-config/service';
import { RedisService } from '../../shared/redis/service';
import { getErrorMessage } from '../../common/utils';
import { toInputJson } from '../../common/utils/json-field.util';
import { linearForecast } from '../../common/utils/stats.util';
import {
  getPeriodUnitPrice,
  type TouPriceContext,
} from '../../shared/app-config/pricing-config.util';
import type { AppConfigData } from '../../shared/app-config/types';
import { HA_EVENTS } from '../../shared/types';
import type { HaStateChangeBatchEvent } from '../../shared/types';
import { coldBatchChanges } from '../../shared/ha/cold-batch.util';
import type { UpdateTieredPricingDto } from './dto';
import { isCumulativeEnergyMeter, readingToKwh } from './meter.util';
import { HaWsLeaderService } from '../ha-connector/ha-ws-leader.service';
import { DistributedLockService } from '../../common/resilience/distributed-lock.service';
import { localDateKey } from '../../common/utils/local-date.util';
import { parseTimelineSnapshot } from '../../common/utils/timeline-snapshot.util';
import { StateStoreService } from '../state-store/service';

/** 电表锚点：最近一次已计数的电表读数（增量累计基准），持久化用于重启后恢复 */
interface MeterAnchor {
  meterEntityId: string;
  kwh: number;
  month: string;
  updatedAt: number;
}

/**
 * 阶梯电价预警服务
 *
 * 配置参考中国居民阶梯电价（各地略有差异，以北京为例）：
 *  档位1: 0-2880 kWh/年 → 0.4883 元/kWh
 *  档位2: 2881-4800 kWh/年 → 0.5383 元/kWh
 *  档位3: >4800 kWh/年 → 0.7883 元/kWh
 *
 * 用户可在 config 中自定义各档位阈值和单价。
 */
@Injectable()
export class TieredPricingService implements OnModuleInit {
  private readonly logger = new Logger(TieredPricingService.name);

  /** 用电累加互斥锁键（多副本下串行化“累加+落库”临界区） */
  private static readonly USAGE_LOCK_KEY = 'tiered-pricing:usage';

  /** 电表锚点持久化 Redis key（重启后恢复 lastMeterKwh，避免停机/重启期间用量丢失） */
  private static readonly METER_ANCHOR_KEY = 'tiered-pricing:meter-anchor';

  /** 单次事件增量超过该值（kWh）且时间间隔很短时，视为表计异常跳变而非真实用电 */
  private static readonly LARGE_DELTA_KWH = 500;

  /** 大增量判定“长时间跨度”的最小间隔（6 小时）：间隔更长视为真实跨时段用电 */
  private static readonly LARGE_DELTA_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;

  /** 电表锚点写保护 Lua：仅当本地时间戳 >= 已存时间戳时覆盖，避免多副本旧值覆盖新值 */
  private static readonly ANCHOR_SET_SCRIPT = `
local cur = redis.call('get', KEYS[1])
if cur then
  local curTs = 0
  local ok, decoded = pcall(cjson.decode, cur)
  if ok and type(decoded) == 'table' then
    curTs = tonumber(decoded.updatedAt) or 0
  end
  if tonumber(ARGV[2]) < curTs then return 0 end
end
redis.call('set', KEYS[1], ARGV[1])
return 1
`;

  /** 配置落库串行队列：同一进程内 upsert 严格按序，避免并发覆盖 */
  private persistChain: Promise<void> = Promise.resolve();

  /** 默认阶梯电价配置 */
  private config = {
    tiers: [
      { maxKwh: 2880, pricePerKwh: 0.4883, label: '一档' },
      { maxKwh: 4800, pricePerKwh: 0.5383, label: '二档' },
      { maxKwh: Infinity, pricePerKwh: 0.7883, label: '三档' },
    ],
    /** 当月累计用电量（kWh），前端/状态驱动更新 */
    monthUsage: 0,
    yearUsage: 0,
    daysInMonth: 30,
    currentDay: 1,
  };

  /** 电表上次读数（用于增量累计，单位 kWh） */
  private lastMeterKwh: number | null = null;
  private lastMeterMonth = '';
  /** 上次电表事件时间戳（毫秒）：用于区分真实大用电与异常跳变 */
  private lastMeterEventAt = 0;
  /** 当前已绑定的主电表（用于检测解绑/换绑） */
  private boundMeterId = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly appConfig: AppConfigService,
    private readonly redisService: RedisService,
    private readonly haLeader: HaWsLeaderService,
    private readonly lock: DistributedLockService,
    private readonly stateStore: StateStoreService,
  ) {}

  async onModuleInit() {
    await this.loadFromDb();
    this.syncTiersFromAppConfig();
    this.boundMeterId = String(this.appConfig.get('energy').meterEntityId || '').trim();
    // 恢复持久化电表锚点：Leader 重启/漂移后从上次读数续算，避免停机期间用量丢失
    await this.restoreMeterAnchor();
  }

  @OnEvent(APP_CONFIG_UPDATED)
  onConfigUpdated(keys: string[]) {
    if (keys.includes('pricing')) this.syncTiersFromAppConfig();
    if (keys.includes('energy')) this.syncMeterBindingFromAppConfig();
  }

  /** 主电表解绑或更换时清零累加并清除持久化锚点，避免脏数据继续污染 */
  private async syncMeterBindingFromAppConfig() {
    const next = String(this.appConfig.get('energy').meterEntityId || '').trim();
    const prev = this.boundMeterId;
    if (prev === next) return;
    this.boundMeterId = next;
    this.lastMeterKwh = null;
    this.lastMeterMonth = '';
    this.lastMeterEventAt = 0;
    this.config.monthUsage = 0;
    this.config.yearUsage = 0;
    const now = new Date();
    this.config.currentDay = now.getDate();
    this.config.daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    this.persistConfig();
    await this.clearMeterAnchor();
    this.logger.log(
      next
        ? `主电表已更换为 ${next},已重置当月/年度用电累加`
        : '主电表已解绑,已清空当月/年度用电累加',
    );
  }

  /** 从高级参数 pricing 同步三档阶梯或固定单价 */
  private syncTiersFromAppConfig() {
    const p = this.appConfig.get('pricing');
    if (p.pricingMode === 'fixed') {
      const price = Number(p.fixedPrice) || Number(p.tier1Price) || 0.4883;
      const label = String(p.regionLabel || '').trim() || '固定';
      this.config.tiers = [{ maxKwh: Infinity, pricePerKwh: price, label }];
      this.persistConfig();
      return;
    }
    const tier1Kwh = Number(p.tier1Kwh) || 2880;
    const tier2Kwh = Number(p.tier2Kwh) || 4800;
    const tier1Price = Number(p.tier1Price) || 0.4883;
    const tier2Price = Number(p.tier2Price) || 0.5383;
    const tier3Price = Number(p.tier3Price) || 0.7883;
    this.config.tiers = [
      { maxKwh: tier1Kwh, pricePerKwh: tier1Price, label: '一档' },
      { maxKwh: tier2Kwh, pricePerKwh: tier2Price, label: '二档' },
      { maxKwh: Infinity, pricePerKwh: tier3Price, label: '三档' },
    ];
    this.persistConfig();
  }

  /** Infinity / null 开放档在 JSON 中统一为 null，读回还原为 Infinity */
  private normalizeTiers(
    tiers: Array<{ maxKwh: number | null; pricePerKwh: number; label: string }>,
  ) {
    return tiers.map((t) => ({
      ...t,
      maxKwh:
        t.maxKwh == null || !Number.isFinite(Number(t.maxKwh)) ? Infinity : Number(t.maxKwh),
    }));
  }

  private serializeTiers() {
    return this.config.tiers.map((t) => ({
      ...t,
      maxKwh: t.maxKwh === Infinity || !Number.isFinite(t.maxKwh) ? null : t.maxKwh,
    }));
  }

  private async loadFromDb() {
    try {
      const record = await this.prisma.pricingConfig.findUnique({ where: { id: 'default' } });
      if (record) {
        let tiers = this.config.tiers;
        const parsed = Array.isArray(record.tiers)
          ? (record.tiers as Array<{
              maxKwh: number | null;
              pricePerKwh: number;
              label: string;
            }>)
          : [];
        if (parsed.length) tiers = this.normalizeTiers(parsed);
        this.config = {
          tiers,
          monthUsage: record.monthUsage,
          yearUsage: record.yearUsage,
          daysInMonth: record.daysInMonth,
          currentDay: record.currentDay,
        };
      }
      this.logger.log('阶梯电价配置已加载');
    } catch (err) {
      this.logger.warn(`加载阶梯电价配置失败: ${(err as Error).message}`);
    }
  }

  /**
   * 捕获当前配置快照并排队持久化。
   * - 快照捕获：避免落库执行时 config 已被后续事件改动导致写错值；
   * - 串行队列：同一进程内 upsert 严格按序，杜绝并发覆盖；
   * - 返回队列 Promise，供锁内临界区等待落库完成后再释放锁。
   */
  private persistConfig(): Promise<void> {
    const snapshot = {
      tiers: toInputJson(this.serializeTiers(), []),
      monthUsage: this.config.monthUsage,
      yearUsage: this.config.yearUsage,
      daysInMonth: this.config.daysInMonth,
      currentDay: this.config.currentDay,
    };
    this.persistChain = this.persistChain.then(() =>
      this.prisma.pricingConfig
        .upsert({
          where: { id: 'default' },
          create: { id: 'default', ...snapshot },
          update: { ...snapshot },
        })
        .then(() => undefined)
        .catch((err: unknown) =>
          this.logger.warn(`持久化电价配置失败: ${getErrorMessage(err)}`),
        ),
    );
    return this.persistChain;
  }

  /** 解析 Redis 锚点 JSON，损坏/缺字段时返回 null */
  private parseMeterAnchor(raw: string): MeterAnchor | null {
    try {
      const obj = JSON.parse(raw) as Partial<MeterAnchor>;
      const kwh = Number(obj.kwh);
      if (!Number.isFinite(kwh) || obj.month == null) return null;
      return {
        meterEntityId: String(obj.meterEntityId || ''),
        kwh,
        month: String(obj.month),
        updatedAt: Number(obj.updatedAt) || 0,
      };
    } catch {
      return null;
    }
  }

  /** 从 app-config energy 分区读取锚点（Redis 不可用时的回退持久化） */
  private readMeterAnchorFromAppConfig(): MeterAnchor | null {
    const energy = this.appConfig.get('energy') as AppConfigData['energy'] & {
      meterAnchorKwh?: number | null;
      meterAnchorMonth?: string;
      meterAnchorEntityId?: string;
      meterAnchorUpdatedAt?: string;
    };
    const kwh = Number(energy.meterAnchorKwh);
    if (energy.meterAnchorKwh == null || !Number.isFinite(kwh)) return null;
    return {
      meterEntityId: String(energy.meterAnchorEntityId || ''),
      kwh,
      month: String(energy.meterAnchorMonth || ''),
      updatedAt: energy.meterAnchorUpdatedAt
        ? new Date(energy.meterAnchorUpdatedAt).getTime() || 0
        : 0,
    };
  }

  /**
   * 重启后从持久化存储恢复电表锚点：用电量从上次持久化的读数起算，
   * 修复断线/停机期间用量永久丢失的问题（月切换锚定逻辑保持不变）。
   */
  private async restoreMeterAnchor(): Promise<void> {
    let anchor: MeterAnchor | null = null;
    if (this.redisService.isReady()) {
      try {
        const raw = await this.redisService.get(TieredPricingService.METER_ANCHOR_KEY);
        if (raw) anchor = this.parseMeterAnchor(raw);
      } catch (err) {
        this.logger.debug(`读取 Redis 电表锚点失败: ${getErrorMessage(err)}`);
      }
    }
    if (!anchor) anchor = this.readMeterAnchorFromAppConfig();
    if (!anchor) return;
    if (anchor.meterEntityId && anchor.meterEntityId !== this.boundMeterId) {
      this.logger.warn(
        `持久化电表锚点属于 ${anchor.meterEntityId},与当前绑定电表 ${this.boundMeterId} 不一致,忽略`,
      );
      return;
    }
    this.lastMeterKwh = anchor.kwh;
    this.lastMeterMonth = anchor.month;
    this.logger.log(`已恢复电表锚点:上次读数 ${anchor.kwh} kWh(月份 ${anchor.month || '-'})`);
  }

  /**
   * 持久化电表锚点：优先写 Redis（Lua 时间戳写保护，避免多副本旧值覆盖新值）；
   * Redis 不可用时回退 app-config energy 分区，保证重启后用量不丢失。
   */
  private async persistMeterAnchor(): Promise<void> {
    if (this.lastMeterKwh == null) return;
    const payload: MeterAnchor = {
      meterEntityId: this.boundMeterId,
      kwh: this.lastMeterKwh,
      month: this.lastMeterMonth,
      updatedAt: Date.now(),
    };
    const raw = JSON.stringify(payload);
    const client = this.redisService.getClient();
    if (client && this.redisService.isReady()) {
      try {
        await client.eval(
          TieredPricingService.ANCHOR_SET_SCRIPT,
          1,
          TieredPricingService.METER_ANCHOR_KEY,
          raw,
          String(payload.updatedAt),
        );
        return;
      } catch (err) {
        this.logger.debug(
          `Redis 电表锚点写入失败,回退 app-config: ${getErrorMessage(err)}`,
        );
      }
    }
    await this.persistMeterAnchorToAppConfig(payload);
  }

  /** 回退持久化：写入 app-config energy 分区（Redis 不可用时的低频回退路径） */
  private async persistMeterAnchorToAppConfig(payload: MeterAnchor): Promise<void> {
    try {
      await this.appConfig.update({
        energy: {
          meterAnchorKwh: payload.kwh,
          meterAnchorMonth: payload.month,
          meterAnchorEntityId: payload.meterEntityId,
          meterAnchorUpdatedAt: new Date(payload.updatedAt).toISOString(),
        },
      } as Parameters<AppConfigService['update']>[0]);
    } catch (err) {
      this.logger.warn(`电表锚点回退持久化失败: ${getErrorMessage(err)}`);
    }
  }

  /** 解绑/换绑电表时清除持久化锚点，避免旧电表锚点污染新电表 */
  private async clearMeterAnchor(): Promise<void> {
    const client = this.redisService.getClient();
    if (client && this.redisService.isReady()) {
      try {
        await client.del(TieredPricingService.METER_ANCHOR_KEY);
      } catch (err) {
        this.logger.debug(`Redis 电表锚点清除失败: ${String(err)}`);
      }
    }
    try {
      await this.appConfig.update({
        energy: {
          meterAnchorKwh: null,
          meterAnchorMonth: '',
          meterAnchorEntityId: '',
          meterAnchorUpdatedAt: '',
        },
      } as Parameters<AppConfigService['update']>[0]);
    } catch (err) {
      this.logger.debug(`app-config 电表锚点清除失败: ${String(err)}`);
    }
  }

  /** 订阅 HA 电表状态，自动累计当月/年度用电量（必须显式绑定累计 kWh 电表） */
  @OnEvent(HA_EVENTS.STATE_CHANGED_COLD_BATCH)
  async handleMeterStateChange(payload: HaStateChangeBatchEvent) {
    for (const event of coldBatchChanges(payload)) {
      // 主实例过滤：仅 HA-WS Leader 实例参与累加，避免多副本重复计数（风格同 water-monitor）
      try {
        if (!this.haLeader.isHaWsLeader()) return;
      } catch (err) {
        // Leader 状态查询异常时按单实例降级处理，绝不让事件处理器崩溃
        this.logger.debug(`HA Leader 状态查询失败,按单实例继续: ${String(err)}`);
      }

      const entityId = event.entity_id;
      const configured = String(this.appConfig.get('energy').meterEntityId || '').trim();
      if (!configured || entityId !== configured) continue;

      const attrs = event.new_state?.attributes;
      if (!isCumulativeEnergyMeter(attrs)) {
        this.logger.debug(
          `忽略非累计电量实体 ${entityId}(device_class=${attrs?.device_class} unit=${attrs?.unit_of_measurement})`,
        );
        continue;
      }

      const raw = parseFloat(event.new_state?.state || '');
      if (Number.isNaN(raw) || raw < 0) continue;
      const kwh = readingToKwh(raw, attrs);

      // “累加 + 落库”临界区经分布式锁串行化：Leader 漂移窗口内防止多副本互踩覆盖；
      // Redis 未配置时由 DistributedLockService 降级为进程内互斥（锁降级由 A7 完善）
      try {
        await this.lock.runExclusive(TieredPricingService.USAGE_LOCK_KEY, async () => {
          const now = new Date();
          const nowMs = now.getTime();
          const tz = this.appConfig.getHomeTimezone();
          const zoned = zonedDateParts(now, tz);
          const monthKey = `${zoned.year}-${zoned.month}`;

          // Leader 重启/漂移后首次事件：先尝试恢复持久化锚点，避免把锚点后到本次的用电整段丢弃
          if (this.lastMeterKwh == null) {
            await this.restoreMeterAnchor();
          }

          if (this.lastMeterMonth !== monthKey) {
            const isFirstAnchor = this.lastMeterMonth === '';
            if (!isFirstAnchor && this.lastMeterKwh != null) {
              const crossDelta = kwh - this.lastMeterKwh;
              if (crossDelta > 0) {
                const prevAt = this.lastMeterEventAt > 0 ? this.lastMeterEventAt : nowMs;
                const monthStartMs = dateFromZonedWallClock(
                  tz,
                  zoned.year,
                  zoned.month,
                  1,
                  0,
                  0,
                ).getTime();
                const span = Math.max(nowMs - prevAt, 1);
                const oldMonthShare =
                  prevAt < monthStartMs
                    ? (crossDelta * (Math.min(monthStartMs, nowMs) - prevAt)) / span
                    : 0;
                const newMonthShare = crossDelta - oldMonthShare;
                const prevYear = parseInt(this.lastMeterMonth.split('-')[0], 10);
                const crossedYear = prevYear !== zoned.year;

                this.config.monthUsage += oldMonthShare;
                this.config.yearUsage += oldMonthShare;
                await this.persistConfig();

                this.config.monthUsage = newMonthShare;
                if (crossedYear) this.config.yearUsage = newMonthShare;
                else this.config.yearUsage += newMonthShare;
              } else {
                const prevYear = parseInt(this.lastMeterMonth.split('-')[0], 10);
                if (prevYear !== zoned.year) this.config.yearUsage = 0;
                this.config.monthUsage = 0;
              }
              this.lastMeterMonth = monthKey;
              this.lastMeterKwh = kwh;
              this.lastMeterEventAt = nowMs;
              this.config.currentDay = zoned.day;
              this.config.daysInMonth = new Date(zoned.year, zoned.month, 0).getDate();
              await this.persistMeterAnchor();
              if (!isFirstAnchor) await this.persistConfig();
              return;
            }
            this.lastMeterMonth = monthKey;
            this.lastMeterKwh = kwh;
            this.lastMeterEventAt = nowMs;
            this.config.currentDay = zoned.day;
            this.config.daysInMonth = new Date(zoned.year, zoned.month, 0).getDate();
            await this.persistMeterAnchor();
            if (!isFirstAnchor) await this.persistConfig();
            return;
          }

          if (this.lastMeterKwh == null) {
            this.lastMeterKwh = kwh;
            this.lastMeterEventAt = nowMs;
            await this.persistMeterAnchor();
            return;
          }

          const delta = kwh - this.lastMeterKwh;
          const prevEventAt = this.lastMeterEventAt;
          this.lastMeterKwh = kwh;
          this.lastMeterEventAt = nowMs;
          await this.persistMeterAnchor();
          if (delta <= 0) return; // 读数回退 = 表计复位，忽略

          if (delta > TieredPricingService.LARGE_DELTA_KWH) {
            // 大增量：间隔很长（或重启后首次无法确认间隔）视为真实跨时段用电；
            // 间隔很短则视为表计异常跳变，忽略本次增量
            const unknownInterval = prevEventAt === 0;
            const elapsedMs = nowMs - prevEventAt;
            if (!unknownInterval && elapsedMs < TieredPricingService.LARGE_DELTA_MIN_INTERVAL_MS) {
              this.logger.warn(
                `电表读数异常跳变 ${delta.toFixed(1)} kWh(间隔 ${Math.round(elapsedMs / 60000)} 分钟),忽略本次增量`,
              );
              return;
            }
            this.logger.log(
              `电表读数大增量 ${delta.toFixed(1)} kWh(跨度 ${Math.round(elapsedMs / 3600000)}h),计入用电`,
            );
          }

          this.config.monthUsage += delta;
          this.config.yearUsage += delta;
          this.config.currentDay = now.getDate();
          this.config.daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
          await this.persistConfig();
        });
      } catch (err) {
        // 锁被占用/瞬时不可用时跳过本次事件：差值会并入下一次事件，避免处理器崩溃
        this.logger.warn(`阶梯用电累加被跳过: ${getErrorMessage(err)}`);
      }
    }
  }

  /** 更新配置 */
  updateConfig(partial: Partial<typeof this.config>) {
    if (partial.tiers) {
      partial = {
        ...partial,
        tiers: this.normalizeTiers(
          partial.tiers as Array<{ maxKwh: number | null; pricePerKwh: number; label: string }>,
        ),
      };
    }
    Object.assign(this.config, partial);
    this.persistConfig();
  }

  /** Widget 快捷编辑：同步阶梯用量与 pricing 分区（阶梯/固定/峰谷平） */
  async updateFromWidget(body: UpdateTieredPricingDto) {
    const usageKeys = ['monthUsage', 'yearUsage', 'daysInMonth', 'currentDay'] as const;
    const usagePatch: Partial<typeof this.config> = {};
    for (const key of usageKeys) {
      if (body[key] != null) usagePatch[key] = body[key] as number;
    }
    if (Object.keys(usagePatch).length) this.updateConfig(usagePatch);

    const pricingPatch: Partial<AppConfigData['pricing']> = {};

    if (body.pricingMode === 'tiered' || body.pricingMode === 'fixed') {
      pricingPatch.pricingMode = body.pricingMode;
      if (body.pricingMode === 'fixed' && body.timeOfUseEnabled == null) {
        pricingPatch.timeOfUseEnabled = false;
      }
    }
    if (body.fixedPrice != null) pricingPatch.fixedPrice = body.fixedPrice;
    if (body.regionLabel != null) pricingPatch.regionLabel = body.regionLabel;

    if (body.tiers?.length) {
      const normalized = this.normalizeTiers(
        body.tiers as Array<{ maxKwh: number | null; pricePerKwh: number; label: string }>,
      );
      const [t1, t2, t3] = normalized;
      if (t1) {
        pricingPatch.tier1Price = t1.pricePerKwh;
        if (Number.isFinite(t1.maxKwh) && t1.maxKwh !== Infinity) {
          pricingPatch.tier1Kwh = t1.maxKwh;
        }
      }
      if (t2) {
        pricingPatch.tier2Price = t2.pricePerKwh;
        if (Number.isFinite(t2.maxKwh) && t2.maxKwh !== Infinity) {
          pricingPatch.tier2Kwh = t2.maxKwh;
        }
      }
      if (t3) pricingPatch.tier3Price = t3.pricePerKwh;
      pricingPatch.pricingMode = 'tiered';
      this.updateConfig({ tiers: normalized });
    }

    if (body.timeOfUseEnabled != null) pricingPatch.timeOfUseEnabled = body.timeOfUseEnabled;
    for (const key of [
      'peakStart1',
      'peakEnd1',
      'peakStart2',
      'peakEnd2',
      'valleyStart',
      'valleyEnd',
    ] as const) {
      if (body[key] != null) pricingPatch[key] = body[key];
    }
    for (const key of ['peakPrice', 'valleyPrice', 'flatPrice'] as const) {
      if (body[key] != null) pricingPatch[key] = body[key];
    }

    if (Object.keys(pricingPatch).length) {
      await this.appConfig.update({ pricing: pricingPatch } as Parameters<
        AppConfigService['update']
      >[0]);
    }
  }

  private buildPricingSettings(): AppConfigData['pricing'] {
    return { ...this.appConfig.get('pricing') };
  }

  /** 获取完整配置 */
  getConfig() {
    return { ...this.config };
  }

  /** 当月日用电量序列（timeline 增量或均匀估算） */
  async getDailyUsageSeries(): Promise<number[]> {
    const { currentDay } = this.config;
    const days = Math.max(currentDay, 1);
    const meterId = String(this.appConfig.get('energy').meterEntityId || '').trim();

    if (meterId && this.redisService.isReady()) {
      const now = new Date();
      const tz = this.appConfig.getHomeTimezone();
      const zoned = zonedDateParts(now, tz);
      const monthStart = dateFromZonedWallClock(tz, zoned.year, zoned.month, 1, 0, 0).getTime();
      const raw = await this.redisService.zrangebyscore(
        `timeline:entity:${meterId}`,
        monthStart,
        Date.now(),
        10000,
      );
      const meterAttrs = this.stateStore.getById(meterId)?.attributes;
      const byDay = new Map<string, number>();
      let prev: number | null = null;
      for (const item of raw) {
        try {
          const snap = parseTimelineSnapshot(item);
          if (!snap) continue;
          const rawVal = parseFloat(snap.state);
          if (!Number.isFinite(rawVal)) continue;
          const val = readingToKwh(rawVal, meterAttrs);
          const day = localDateKey(new Date(snap.ts), tz);
          const delta = prev != null && val >= prev ? val - prev : 0;
          prev = val;
          if (delta > 0 && delta < 500) byDay.set(day, (byDay.get(day) || 0) + delta);
        } catch {
          /* 跳过 */
        }
      }
      if (byDay.size >= 2) {
        const series: number[] = [];
        for (let d = 1; d <= days; d++) {
          const key = localDateKey(
            dateFromZonedWallClock(tz, zoned.year, zoned.month, d, 0, 0),
            tz,
          );
          series.push(+(byDay.get(key) || 0).toFixed(3));
        }
        return series;
      }
    }

    // 无足够 timeline 样本时不捏造平坦日序列，避免虚假预测
    return [];
  }

  /**
   * 获取电价分析
   */
  async getAnalysis() {
    const { tiers, yearUsage, monthUsage, daysInMonth, currentDay } = this.config;
    const pricingCfg = this.appConfig.get('pricing');
    const meterEntityId = String(this.appConfig.get('energy').meterEntityId || '').trim();
    const meterBound = Boolean(meterEntityId);
    const pricingMode = pricingCfg.pricingMode === 'fixed' ? 'fixed' : 'tiered';
    const regionLabel = String(pricingCfg.regionLabel || '').trim();

    const usageMonth = meterBound ? monthUsage : null;
    const usageYear = meterBound ? yearUsage : null;

    const dailySeries = meterBound ? await this.getDailyUsageSeries() : [];
    const forecast = meterBound ? linearForecast(dailySeries) : null;

    let currentTier = tiers[0];
    for (const tier of tiers) {
      if ((usageYear ?? 0) < tier.maxKwh) {
        currentTier = tier;
        break;
      }
    }

    const tier1Price = Number(pricingCfg.tier1Price) || tiers[0]?.pricePerKwh || 0.4883;
    const tier2Price = Number(pricingCfg.tier2Price) || tiers[1]?.pricePerKwh || 0.5383;
    const tier3Price = Number(pricingCfg.tier3Price) || tiers[2]?.pricePerKwh || 0.7883;
    const fixedPrice = Number(pricingCfg.fixedPrice) || tier1Price;
    const baseUnitPrice = pricingMode === 'fixed' ? fixedPrice : currentTier.pricePerKwh;
    const touCtx: TouPriceContext = {
      pricingMode,
      tierUnitPrice: baseUnitPrice,
      tier1Price,
      tier2Price,
      tier3Price,
      fixedPrice,
    };
    const tou = getPeriodUnitPrice(new Date(), pricingCfg, touCtx);

    const remainingInTier = currentTier.maxKwh - (usageYear ?? 0);
    const remainingStr =
      !meterBound
        ? null
        : pricingMode === 'fixed'
          ? '不适用'
          : currentTier.maxKwh === Infinity
            ? '无限'
            : `${remainingInTier.toFixed(0)} kWh`;

    const nextTier = tiers[tiers.indexOf(currentTier) + 1];
    const priceIncrease =
      pricingMode === 'fixed'
        ? '固定单价'
        : nextTier
          ? `+${((nextTier.pricePerKwh - currentTier.pricePerKwh) * 100).toFixed(0)}%`
          : '已是最高档';

    const dailyAvg =
      meterBound && currentDay > 0 && usageMonth != null ? usageMonth / currentDay : 0;
    const estimatedMonth = meterBound ? dailyAvg * daysInMonth : null;

    let warning: string | null = null;
    if (meterBound && pricingMode === 'tiered' && estimatedMonth != null && usageMonth != null) {
      if (remainingInTier < estimatedMonth - usageMonth && remainingInTier !== Infinity) {
        warning = `⚠️ 本月预计 ${estimatedMonth.toFixed(0)} kWh，将触达${nextTier?.label || '最高档'}`;
      } else if (remainingInTier < 100 && remainingInTier !== Infinity && remainingInTier > 0) {
        warning = `⚡ 距${currentTier.label}上限仅剩 ${remainingInTier.toFixed(0)} kWh`;
      }
    }

    return {
      pricingMode,
      regionLabel,
      meterBound,
      meterEntityId: meterEntityId || null,
      pricingSettings: this.buildPricingSettings(),
      timeOfUseEnabled: tou.timeOfUseEnabled,
      timePeriod: tou.period,
      baseUnitPrice,
      tierUnitPrice: tou.tierUnitPrice,
      periodPrices: tou.periodPrices,
      yearUsage: usageYear,
      monthUsage: usageMonth,
      estimatedMonth: estimatedMonth != null ? estimatedMonth.toFixed(0) : null,
      currentTier: pricingMode === 'fixed' ? regionLabel || currentTier.label : currentTier.label,
      currentPrice: tou.pricePerKwh,
      remainingInTier: remainingStr,
      priceIncrease,
      tiers:
        pricingMode === 'fixed'
          ? [
              {
                label: regionLabel || currentTier.label,
                maxKwh: '固定单价',
                price: currentTier.pricePerKwh,
                active: true,
              },
            ]
          : tiers.map((t) => ({
              label: t.label,
              maxKwh: t.maxKwh === Infinity ? '以上' : `≤${t.maxKwh}`,
              price: t.pricePerKwh,
              active: t === currentTier,
            })),
      warning,
      forecast,
    };
  }
}
