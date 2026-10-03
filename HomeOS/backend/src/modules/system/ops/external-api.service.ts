/**
 * 外部 API 集成服务
 *
 * 模块：system/ops
 * 职责：
 *  整合多个外部数据源：
 *   1. 天气预警 API（中国气象局 / OpenWeatherMap Alerts）
 *   2. 电价 API（各地发改委 / 第三方聚合，本地通过 pricing 配置计算峰谷平）
 *   3. CalDAV 日历同步（Google / Apple / Outlook，通过 ICS URL 拉取）
 *
 * 依赖：
 *  - HttpService       axios HTTP 客户端（拉取 ICS / OpenWeather）
 *  - AppConfigService  pricing / external 配置
 *  - EventEmitter2     APP_CONFIG_UPDATED 事件监听
 *  - RedisService      天气预警缓存
 *  - CircuitBreaker    日历 / 天气 API 熔断保护
 *
 * 关键路径：syncCalendarFromConfig / fetchOpenWeatherAlerts / syncPricingFromConfig。
 */
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { getErrorMessage } from '../../../common/utils';
import {
  AppConfigService,
  APP_CONFIG_UPDATED,
} from '../../../shared/app-config/service';
import {
  getPeriodUnitPrice,
  getTimePeriod as resolveTimePeriod,
  resolveEffectivePricing,
  resolveTouUnitPrices,
  timePeriodLabel,
  type TouPriceContext,
} from '../../../shared/app-config/pricing-config.util';
import { RedisService } from '../../../shared/redis/service';
import { CircuitBreaker } from '../../../common/resilience/circuit-breaker.helper';
import { JobRegistryService } from '../../../shared/jobs/registry.service';
import { StateStoreService } from '../../state-store/service';
import { parseICalendar, type ICalendarEvent } from '../../../common/utils/icalendar-parse.util';
import {
  fetchOpenWeatherAlertsWithCache,
  type WeatherAlert,
} from './external-weather-alerts.helper';
import {
  getUpcomingAwayEvents,
  isAwayDuringCalendar,
  syncCalendarFromUrl,
} from './external-calendar-sync.helper';

/** Redis 中天气预警缓存 key 前缀（按经纬度拼后缀） */
const WEATHER_ALERTS_CACHE_KEY = 'homeos:weather:alerts';

/** OpenWeather `/data/2.5/forecast` 单条预报项（调用方按需取字段） */
interface OpenWeatherForecastItem {
  main?: { temp?: number; temp_min?: number; temp_max?: number };
  clouds?: { all?: number };
}

/** 动态电价单条（按 start 递增，跨日循环） */
interface DynamicPriceEntry {
  start: string;
  price: number;
  period: 'peak' | 'valley' | 'flat';
}

/**
 * 外部 API 集成服务
 *
 * 整合多个外部数据源：
 *  1. 天气预警 API（中国气象局 / OpenWeatherMap Alerts）
 *  2. 电价 API（各地发改委 / 第三方聚合）
 *  3. CalDAV 日历同步（Google / Apple / Outlook）
 */
@Injectable()
export class ExternalApiService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExternalApiService.name);
  /** 日历同步熔断器：3 次失败开路，60s 后半开试探 */
  private readonly calendarBreaker: CircuitBreaker;
  /** 天气预警熔断器：3 次失败开路，120s 后半开试探 */
  private readonly weatherBreaker: CircuitBreaker;
  /** 最近一次同步的日历事件列表 */
  private calendarEvents: ICalendarEvent[] = [];
  /** 日历增量同步缓存元数据（ETag / Last-Modified，304 未变更时复用解析结果） */
  private calendarCacheMeta: { etag?: string; lastModified?: string } = {};
  /** 日历自适应周期同步定时器句柄 */
  private calendarSyncTimer: NodeJS.Timeout | null = null;
  /** 上一次"外出"状态，用于检测状态变化并 emit 事件 */
  private lastAwayState = false;
  /** 动态电价调度快照 */
  private dynamicPriceSchedule: {
    region: string;
    currency: string;
    schedule: DynamicPriceEntry[];
    updatedAt: string;
  } = { region: '', currency: 'CNY', schedule: [], updatedAt: '' };
  /** 动态电价最近一次同步错误 */
  private dynamicPriceError = '';
  /** 动态电价周期刷新定时器 */
  private dynamicPriceTimer: NodeJS.Timeout | null = null;

  /**
   * @param httpService   axios HTTP 客户端
   * @param appConfig     应用配置
   * @param eventEmitter  事件总线（监听 APP_CONFIG_UPDATED）
   * @param redis         Redis（天气预警缓存）
   */
  constructor(
    private readonly httpService: HttpService,
    private readonly appConfig: AppConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly redis: RedisService,
    private readonly jobs: JobRegistryService,
    private readonly stateStore: StateStoreService,
  ) {
    this.calendarBreaker = new CircuitBreaker('external-calendar', {
      failureThreshold: 3,
      recoveryTimeout: 60000,
    });
    this.weatherBreaker = new CircuitBreaker('external-weather', {
      failureThreshold: 3,
      recoveryTimeout: 120000,
    });
  }

  /**
   * 模块初始化：
   *  - 同步一次电价配置到内存
   *  - 启动日历周期同步
   *  - 启动动态电价周期刷新
   */
  onModuleInit() {
    this.syncPricingFromConfig();
    this.scheduleCalendarSync();
    this.scheduleDynamicPricingRefresh();
  }

  /**
   * 模块销毁时清理日历同步定时器。
   */
  onModuleDestroy() {
    if (this.calendarSyncTimer) clearTimeout(this.calendarSyncTimer);
    if (this.dynamicPriceTimer) clearTimeout(this.dynamicPriceTimer);
  }

  /**
   * 调度日历周期同步：立即执行一次，之后按「自适应间隔」循环。
   * 自适应策略：当前处于外出中或未来 30 分钟内将开始外出 → 短轮询
   * （calendarSyncShortMin，默认 5 分钟）以捕捉状态切换；否则按 calendarSyncMin。
   */
  private scheduleCalendarSync() {
    const runOnce = () => {
      void this.jobs.run(
        'calendar-sync',
        {
          description: '外部日历周期同步',
          intervalMs: this.nextCalendarDelayMs(),
        },
        async () => {
          await this.syncCalendarFromConfig();
          this.scheduleNextCalendarSync();
        },
      );
    };
    this.calendarSyncTimer = setTimeout(runOnce, 1000);
  }

  /** 计算下次日历同步延迟（毫秒）：临近外出/外出中 → 短轮询，否则常规间隔 */
  private nextCalendarDelayMs(): number {
    const cfg = this.externalCfg;
    const normalMs = Math.max(1, cfg.calendarSyncMin || 60) * 60_000;
    const shortMs = Math.max(1, cfg.calendarSyncShortMin || 5) * 60_000;
    if (isAwayDuringCalendar(this.calendarEvents)) return shortMs;
    const upcoming = getUpcomingAwayEvents(this.calendarEvents, 0.5);
    if (upcoming.length > 0) return shortMs;
    return normalMs;
  }

  private scheduleNextCalendarSync() {
    if (this.calendarSyncTimer) clearTimeout(this.calendarSyncTimer);
    this.calendarSyncTimer = setTimeout(() => {
      void this.jobs.run(
        'calendar-sync',
        {
          description: '外部日历周期同步',
          intervalMs: this.nextCalendarDelayMs(),
        },
        async () => {
          await this.syncCalendarFromConfig();
          this.scheduleNextCalendarSync();
        },
      );
    }, this.nextCalendarDelayMs());
  }

  /**
   * 从配置的 calendarUrl 同步日历（增量 + 自适应短轮询）。
   * 增量：携带 If-None-Match / If-Modified-Since 条件请求头，服务端 304 时复用上次解析结果。
   * 通过熔断器包装 HTTP 请求，避免外部服务故障拖垮主进程。
   * 副作用：更新 calendarEvents；外出状态变化时 emit calendar.awayChanged。
   *
   * @returns 同步结果（synced / count / awayNow / events / error / notModified）
   */
  async syncCalendarFromConfig() {
    const url = this.appConfig.get('external').calendarUrl;
    const incremental = this.externalCfg.calendarIncrementalEnabled !== false;
    const result = await syncCalendarFromUrl(url, {
      fetchIcs: async (calendarUrl) => {
        const { data, status, headers } = await this.calendarBreaker.fire(() =>
          firstValueFrom(
            this.httpService.get(calendarUrl, {
              timeout: 15000,
              responseType: 'text',
              headers: incremental
                ? {
                    ...(this.calendarCacheMeta.etag
                      ? { 'If-None-Match': this.calendarCacheMeta.etag }
                      : {}),
                    ...(this.calendarCacheMeta.lastModified
                      ? { 'If-Modified-Since': this.calendarCacheMeta.lastModified }
                      : {}),
                  }
                : {},
              validateStatus: (s) => s === 200 || s === 304,
            }),
          ),
        );
        if (status === 304) return null; // 未变更：复用上次解析结果
        const h = headers as Record<string, unknown>;
        const etag = h?.etag;
        const lastModified = h?.['last-modified'] ?? h?.['lastModified'];
        if (typeof etag === 'string' && etag) this.calendarCacheMeta.etag = etag;
        if (typeof lastModified === 'string' && lastModified)
          this.calendarCacheMeta.lastModified = lastModified;
        return typeof data === 'string' ? data : String(data);
      },
      parseICalendar,
      onAwayChanged: (away, awayEvents) => {
        // 外出状态切换时通知上层（安防 / 自动化引擎可订阅）
        this.eventEmitter.emit('calendar.awayChanged', { away, events: awayEvents });
      },
      getLastAwayState: () => this.lastAwayState,
      setLastAwayState: (away) => {
        this.lastAwayState = away;
      },
      getLastEvents: () => this.calendarEvents,
      setLastEvents: (events) => {
        this.calendarEvents = events;
      },
    });
    if (result.events) {
      this.calendarEvents = result.events;
    }
    if (!result.synced && result.error) {
      this.logger.warn(`日历同步失败: ${result.error}`);
    } else if (result.notModified) {
      this.logger.debug('日历同步:服务端 304 未变更,复用上次解析结果');
    }
    return result;
  }

  /**
   * 获取日历事件列表 + 当前是否外出 + 即将到来的外出事件。
   */
  getCalendarEvents() {
    return {
      events: this.calendarEvents,
      awayNow: isAwayDuringCalendar(this.calendarEvents),
      upcomingAway: getUpcomingAwayEvents(this.calendarEvents),
    };
  }

  /**
   * 监听配置变更事件：
   *  - pricing 变更 → 重新同步电价
   *  - external 变更 → 重启日历同步定时器（应用新的 URL / 间隔）
   *
   * @param keys 变更的配置 key 列表
   */
  @OnEvent(APP_CONFIG_UPDATED)
  onConfigUpdated(keys: string[]) {
    if (keys.includes('pricing')) this.syncPricingFromConfig();
    if (keys.includes('external')) {
      if (this.calendarSyncTimer) clearTimeout(this.calendarSyncTimer);
      this.scheduleCalendarSync();
      this.scheduleDynamicPricingRefresh();
    }
  }

  /**
   * 从后台 pricing 配置同步峰谷平时电价到内存 electricityPrice。
   * 计算链路：resolveEffectivePricing → resolveTouUnitPrices → 写入 peakPrice/valleyPrice/flatPrice。
   * 副作用：更新 this.electricityPrice 各字段。
   */
  private syncPricingFromConfig() {
    const cfg = this.appConfig.get('pricing');
    const p = resolveEffectivePricing(cfg);
    const pricingMode = p.pricingMode === 'fixed' ? 'fixed' : 'tiered';
    const tier1Price = Number(p.tier1Price) || 0.4883;
    const tier2Price = Number(p.tier2Price) || 0.5383;
    const fixedPrice = Number(p.fixedPrice) || tier1Price;
    const ctx: TouPriceContext = {
      pricingMode,
      tierUnitPrice: pricingMode === 'fixed' ? fixedPrice : tier1Price,
      tier1Price,
      tier2Price,
      tier3Price: Number(p.tier3Price) || 0.7883,
      fixedPrice,
    };
    const periodPrices = resolveTouUnitPrices(p, ctx);
    this.electricityPrice.peakPrice = periodPrices.peak;
    this.electricityPrice.valleyPrice = periodPrices.valley;
    this.electricityPrice.flatPrice = periodPrices.flat;
    this.electricityPrice.unitPrice = ctx.tierUnitPrice;
    this.electricityPrice.nextTierPrice = tier2Price;
    this.electricityPrice.nextTierThreshold = Number(p.tier1Kwh) || 2880;
    this.electricityPrice.region = String(p.regionLabel || '').trim() || '默认';
    this.electricityPrice.lastUpdated = new Date().toISOString();
  }

  // ──────── 天气预警 ────────

  /** 最近一次拉取的天气预警列表（内存缓存） */
  private weatherAlerts: WeatherAlert[] = [];
  /** 最近一次预警检查时间戳（ms） */
  private lastAlertCheck = 0;

  /** 读取 external 配置段的快捷访问器 */
  private get externalCfg() {
    return this.appConfig.get('external');
  }

  /** 天气预警 Redis 缓存 TTL（秒），默认 30 分钟 */
  private weatherAlertsTtlSec() {
    const min = this.externalCfg.weatherAlertsTtlMin;
    return (min > 0 ? min : 30) * 60;
  }

  /** 天气预警刷新间隔（毫秒），默认 30 分钟 */
  private alertRefreshMs() {
    return this.externalCfg.weatherAlertRefreshMs || 30 * 60_000;
  }
  /**
   * 拉取 OpenWeather 天气预警（带 Redis 缓存 + 熔断器）。
   * 缓存策略：先查 Redis；未命中且距上次拉取超过 alertRefreshMs 时才实际请求 API。
   *
   * @param lat     纬度
   * @param lon     经度
   * @param apiKey  OpenWeather API Key
   * @returns alerts 预警列表 / configured 是否已配置 / cached 是否命中缓存
   */
  async fetchOpenWeatherAlerts(lat: number, lon: number, apiKey: string) {
    const cacheKey = `${WEATHER_ALERTS_CACHE_KEY}:${lat.toFixed(2)}:${lon.toFixed(2)}`;
    return fetchOpenWeatherAlertsWithCache(lat, lon, apiKey, {
      cacheKey,
      redisGet: (key) => this.redis.get(key),
      redisSet: (key, value, ttlSec) => this.redis.set(key, value, ttlSec),
      fetchOneCall: async (fetchLat, fetchLon, key) => {
        // 通过熔断器包装 HTTP 请求，失败 3 次后开路
        const { data } = await this.weatherBreaker.fire(() =>
          firstValueFrom(
            this.httpService.get('https://api.openweathermap.org/data/3.0/onecall', {
              params: {
                lat: fetchLat,
                lon: fetchLon,
                appid: key,
                exclude: 'minutely,hourly,daily',
                lang: 'zh_cn',
              },
              timeout: 10000,
            }),
          ),
        );
        return data as Record<string, unknown>;
      },
      getCachedAlerts: () => this.weatherAlerts,
      setCachedAlerts: (alerts) => {
        this.weatherAlerts = alerts;
      },
      getLastAlertCheck: () => this.lastAlertCheck,
      setLastAlertCheck: (ts) => {
        this.lastAlertCheck = ts;
      },
      alertRefreshMs: () => this.alertRefreshMs(),
      weatherAlertsTtlSec: () => this.weatherAlertsTtlSec(),
      onCacheReadError: (err) => this.logger.debug(`天气预警缓存读取失败: ${String(err)}`),
      onFetchError: (e) =>
        this.logger.warn(`天气预警获取失败: ${getErrorMessage(e)}`),
    });
  }

  /** 返回内存中缓存的天气预警列表（不触发 HTTP） */
  getCachedAlerts() {
    return this.weatherAlerts;
  }

  // ──────── 当前天气（OpenWeather） ────────

  /** 最近一次拉取的当前天气快照（内存缓存 30 分钟） */
  private weatherSnapshot: {
    temperature: number | null;
    condition: string;
    fetchedAt: number;
  } | null = null;

  /**
   * 获取当前室外天气（OpenWeather current weather，带熔断器 + 30 分钟内存缓存）。
   * 降级链：OpenWeather → HA weather 实体（weatherFallbackEntityId 或自动识别）。
   * 未配置任何来源时返回 source=null，不抛异常。
   *
   * @returns `{ source, temperature, condition, fetchedAt }`
   */
  async getCurrentWeather() {
    const cfg = this.externalCfg;
    const apiKey = String(cfg.openWeatherApiKey || '').trim();
    if (!apiKey) {
      return this.getHaFallbackWeather();
    }
    const now = Date.now();
    if (this.weatherSnapshot && now - this.weatherSnapshot.fetchedAt < 30 * 60_000) {
      return {
        source: 'openweather' as const,
        ...this.weatherSnapshot,
        fetchedAt: new Date(this.weatherSnapshot.fetchedAt).toISOString(),
      };
    }
    try {
      const { data } = await this.weatherBreaker.fire(() =>
        firstValueFrom(
          this.httpService.get('https://api.openweathermap.org/data/2.5/weather', {
            params: {
              lat: cfg.weatherLat,
              lon: cfg.weatherLon,
              appid: apiKey,
              units: 'metric',
              lang: 'zh_cn',
            },
            timeout: 10000,
          }),
        ),
      );
      const d = data as {
        main?: { temp?: number };
        weather?: Array<{ description?: string }>;
      };
      const temperature = typeof d.main?.temp === 'number' ? d.main.temp : null;
      const condition = String(d.weather?.[0]?.description ?? '');
      if (temperature == null) {
        // OpenWeather 返回但缺温度：降级到 HA 实体
        return this.getHaFallbackWeather();
      }
      this.weatherSnapshot = { temperature, condition, fetchedAt: now };
      return {
        source: 'openweather' as const,
        temperature,
        condition,
        fetchedAt: new Date(now).toISOString(),
      };
    } catch (err) {
      this.logger.debug(`当前天气获取失败,降级 HA 实体: ${getErrorMessage(err)}`);
      // 主源熔断/异常 → 降级到 HA weather 实体
      return this.getHaFallbackWeather();
    }
  }

  /** OpenWeather 5 日/3 小时预报内存缓存（按 cnt 分桶，TTL 30 分钟） */
  private forecastCache = new Map<
    number,
    { fetchedAt: number; list: OpenWeatherForecastItem[] }
  >();

  /**
   * 拉取 OpenWeather `/data/2.5/forecast`（带熔断器 + 30 分钟内存缓存）。
   * 未配置 API Key 或请求失败时返回空 list，不抛异常。
   */
  async fetchForecast(opts?: { cnt?: number }): Promise<{
    list: OpenWeatherForecastItem[];
    cached: boolean;
  }> {
    const cfg = this.externalCfg;
    const apiKey = String(cfg.openWeatherApiKey || '').trim();
    if (!apiKey) return { list: [], cached: false };
    const cnt = Math.min(40, Math.max(1, Math.floor(opts?.cnt ?? 8)));
    const now = Date.now();
    const hit = this.forecastCache.get(cnt);
    if (hit && now - hit.fetchedAt < 30 * 60_000) {
      return { list: hit.list, cached: true };
    }
    try {
      const { data } = await this.weatherBreaker.fire(() =>
        firstValueFrom(
          this.httpService.get('https://api.openweathermap.org/data/2.5/forecast', {
            params: {
              lat: cfg.weatherLat,
              lon: cfg.weatherLon,
              appid: apiKey,
              units: 'metric',
              cnt,
            },
            timeout: 10000,
          }),
        ),
      );
      const raw = data as { list?: OpenWeatherForecastItem[] };
      const list = Array.isArray(raw?.list) ? raw.list : [];
      this.forecastCache.set(cnt, { fetchedAt: now, list });
      return { list, cached: false };
    } catch (err) {
      this.logger.debug(
        `OpenWeather 预报获取失败: ${getErrorMessage(err)}`,
      );
      if (hit) return { list: hit.list, cached: true };
      return { list: [], cached: false };
    }
  }

  /** 解析 HA weather 备用源实体（配置优先，其次自动识别 weather 域） */
  private resolveHaWeatherEntityId(): string | null {
    const configured = String(this.externalCfg.weatherFallbackEntityId || '').trim();
    if (configured && this.stateStore.getById(configured)) return configured;
    const hit = this.stateStore.getAll('weather');
    return hit.length ? hit[0].entity_id : null;
  }

  /** 从 HA weather 实体读取当前天气（无外部依赖，OpenWeather 不可用时兜底） */
  private getHaFallbackWeather() {
    const entityId = this.resolveHaWeatherEntityId();
    if (!entityId) {
      return { source: null as null, temperature: null, condition: '', fetchedAt: '' };
    }
    const ent = this.stateStore.getById(entityId);
    const temperature = parseFloat(String(ent?.state ?? ''));
    const condition = String(ent?.attributes?.condition ?? '');
    return {
      source: 'ha' as const,
      entityId,
      temperature: Number.isFinite(temperature) ? temperature : null,
      condition,
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * 返回日历摘要：当前是否外出 + 即将到来的外出事件（最多 3 条）。
   */
  getCalendarSummary() {
    const { events, awayNow, upcomingAway } = this.getCalendarEvents();
    return {
      away_now: awayNow,
      upcoming_away: upcomingAway.slice(0, 3),
      total_events: events.length,
    };
  }

  // ──────── 阶梯电价查询 ────────

  /** 内存中的电价快照，由 syncPricingFromConfig / updatePricing 维护 */
  private electricityPrice = {
    /** 当前阶梯档位（1/2/3） */
    currentTier: 1,
    /** 当前档位单价（元/kWh） */
    unitPrice: 0.4883,
    /** 下一档单价 */
    nextTierPrice: 0.5383,
    /** 下一档起始年累计电量（kWh） */
    nextTierThreshold: 2880,
    /** 峰时单价 */
    peakPrice: 0.5883,
    /** 谷时单价 */
    valleyPrice: 0.3083,
    /** 平时单价 */
    flatPrice: 0.4883,
    /** 最近一次更新时间 ISO */
    lastUpdated: '',
    /** 区域标签（如 "北京"） */
    region: '北京 (默认)',
  };

  /**
   * 手动更新电价配置（覆盖内存快照）。
   * 副作用：合并到 electricityPrice + 更新 lastUpdated。
   *
   * @param config 待覆盖的字段
   */
  updatePricing(config: Partial<typeof this.electricityPrice>) {
    Object.assign(this.electricityPrice, config);
    this.electricityPrice.lastUpdated = new Date().toISOString();
    this.logger.log(`电价已更新: ${JSON.stringify(config)}`);
  }

  /** 返回当前电价快照（浅拷贝，避免外部修改） */
  getPricing() {
    return { ...this.electricityPrice };
  }

  /**
   * 返回当前时段（peak 峰 / valley 谷 / flat 平 / null 未启用分时）。
   * 基于 pricing 配置的时段规则判定。
   */
  getTimePeriod(): 'peak' | 'valley' | 'flat' | null {
    return resolveTimePeriod(new Date(), this.appConfig.get('pricing'));
  }

  /**
   * 返回当前电价详情：分时是否启用 / 当前时段 / 时段标签 / 单价 / 各时段单价表。
   * 计算链路：resolveEffectivePricing → getPeriodUnitPrice。
   * 动态电价启用时优先返回 API 提供的当前时段与单价。
   */
  getCurrentPrice() {
    const cfg = this.appConfig.get('pricing');
    const p = resolveEffectivePricing(cfg);
    const pricingMode = p.pricingMode === 'fixed' ? 'fixed' : 'tiered';
    const tier1Price = Number(p.tier1Price) || 0.4883;
    const tier2Price = Number(p.tier2Price) || 0.5383;
    const fixedPrice = Number(p.fixedPrice) || tier1Price;
    const ctx: TouPriceContext = {
      pricingMode,
      tierUnitPrice: pricingMode === 'fixed' ? fixedPrice : tier1Price,
      tier1Price,
      tier2Price,
      tier3Price: Number(p.tier3Price) || 0.7883,
      fixedPrice,
    };
    const tou = getPeriodUnitPrice(new Date(), p, ctx);
    const period = tou.period;

    // 动态电价优先：API 未失效且命中当前时段时覆盖静态配置
    const dynamic = this.currentDynamicEntry();
    if (dynamic) {
      const periodLabel = timePeriodLabel(dynamic.period) || '动态';
      return {
        dynamicPricing: true,
        timeOfUseEnabled: true,
        period: dynamic.period,
        periodLabel,
        pricePerKwh: dynamic.price,
        tierUnitPrice: tou.tierUnitPrice,
        allPeriods: tou.periodPrices,
      };
    }
    return {
      dynamicPricing: false,
      timeOfUseEnabled: tou.timeOfUseEnabled,
      period,
      periodLabel: timePeriodLabel(period) || '未启用分时',
      pricePerKwh: tou.pricePerKwh,
      tierUnitPrice: tou.tierUnitPrice,
      allPeriods: tou.periodPrices,
    };
  }

  // ──────── 动态电价 API ────────

  /** 调度动态电价周期刷新（立即一次 + 按 dynamicPricingRefreshHours 循环） */
  private scheduleDynamicPricingRefresh() {
    if (!this.externalCfg.dynamicPricingEnabled) return;
    const hours = Math.max(1, this.externalCfg.dynamicPricingRefreshHours || 24);
    void this.syncDynamicPricing();
    if (this.dynamicPriceTimer) clearTimeout(this.dynamicPriceTimer);
    this.dynamicPriceTimer = setTimeout(() => {
      this.scheduleDynamicPricingRefresh();
    }, hours * 3600_000);
  }

  /**
   * 拉取并解析动态电价 API。
   * 期望响应格式：{ region?, currency?, schedule: [{ start: 'HH:MM', price, period }] }
   * 兼容嵌套 { data: {...} }。
   * 成功后将今日峰/谷/平均价写回电价内存快照，供电量 Widget 展示。
   *
   * @returns 同步结果（enabled / synced / count / error）
   */
  async syncDynamicPricing() {
    const cfg = this.externalCfg;
    if (!cfg.dynamicPricingEnabled) return { enabled: false, reason: '未启用' };
    const url = String(cfg.dynamicPricingUrl || '').trim();
    if (!url) return { enabled: true, reason: '未配置 dynamicPricingUrl' };
    try {
      const { data } = await firstValueFrom(
        this.httpService.get(url, {
          timeout: 10000,
          headers: cfg.dynamicPricingApiKey
            ? { 'X-Api-Key': String(cfg.dynamicPricingApiKey) }
            : {},
        }),
      );
      const rawData = data as { data?: Record<string, unknown> } | Record<string, unknown>;
      const unwrapped = (rawData as { data?: Record<string, unknown> }).data;
      const body: Record<string, unknown> =
        unwrapped && typeof unwrapped === 'object'
          ? (unwrapped as Record<string, unknown>)
          : (rawData as Record<string, unknown>);
      const rawSchedule = Array.isArray(body.schedule) ? body.schedule : [];
      const schedule: DynamicPriceEntry[] = rawSchedule
        .map((e: unknown): DynamicPriceEntry | null => {
          const entry = e as { start?: unknown; price?: unknown; period?: unknown };
          const start = String(entry?.start || '').trim();
          const price = Number(entry?.price);
          const period = String(entry?.period || 'flat');
          if (!/^\d{1,2}:\d{2}$/.test(start) || !Number.isFinite(price) || price < 0) return null;
          return {
            start,
            price,
            period: period === 'peak' || period === 'valley' ? period : 'flat',
          };
        })
        .filter((e: DynamicPriceEntry | null): e is DynamicPriceEntry => e != null)
        .sort((a: DynamicPriceEntry, b: DynamicPriceEntry) => this.toMinutes(a.start) - this.toMinutes(b.start));
      if (!schedule.length) {
        this.dynamicPriceError = '动态电价 API 返回空 schedule';
        return { enabled: true, synced: false, count: 0, error: this.dynamicPriceError };
      }
      this.dynamicPriceSchedule = {
        region: String(body.region || this.electricityPrice.region || '动态'),
        currency: String(body.currency || 'CNY'),
        schedule,
        updatedAt: new Date().toISOString(),
      };
      this.dynamicPriceError = '';
      // 今日各时段均价写回内存快照
      const { peak, valley, flat } = this.todayAveragePrices();
      this.updatePricing({ peakPrice: peak, valleyPrice: valley, flatPrice: flat });
      this.logger.log(`动态电价已同步:${schedule.length} 条(峰 ${peak} / 谷 ${valley} / 平 ${flat})`);
      return { enabled: true, synced: true, count: schedule.length };
    } catch (err) {
      this.dynamicPriceError = getErrorMessage(err);
      this.logger.warn(`动态电价同步失败: ${this.dynamicPriceError}`);
      return { enabled: true, synced: false, error: this.dynamicPriceError };
    }
  }

  /** 当前时段对应的动态电价条目（未启用/未同步时返回 null） */
  private currentDynamicEntry(): DynamicPriceEntry | null {
    if (!this.externalCfg.dynamicPricingEnabled) return null;
    const sched = this.dynamicPriceSchedule.schedule;
    if (!sched.length) return null;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    let cur: DynamicPriceEntry | null = null;
    for (const e of sched) {
      if (this.toMinutes(e.start) <= nowMin) cur = e;
    }
    if (!cur) cur = sched[sched.length - 1]; // 00:00 前：昨夜最后一个条目
    return cur;
  }

  /** 今日各时段均价（供电价 Widget 展示） */
  private todayAveragePrices(): Record<'peak' | 'valley' | 'flat', number> {
    const acc: Record<'peak' | 'valley' | 'flat', { sum: number; count: number }> = {
      peak: { sum: 0, count: 0 },
      valley: { sum: 0, count: 0 },
      flat: { sum: 0, count: 0 },
    };
    for (const e of this.dynamicPriceSchedule.schedule) {
      acc[e.period].sum += e.price;
      acc[e.period].count += 1;
    }
    return {
      peak: acc.peak.count ? +(acc.peak.sum / acc.peak.count).toFixed(4) : this.electricityPrice.peakPrice,
      valley: acc.valley.count
        ? +(acc.valley.sum / acc.valley.count).toFixed(4)
        : this.electricityPrice.valleyPrice,
      flat: acc.flat.count ? +(acc.flat.sum / acc.flat.count).toFixed(4) : this.electricityPrice.flatPrice,
    };
  }

  /** 动态电价总览（供前端展示今日时段表与当前时段） */
  getDynamicPricing() {
    return {
      enabled: this.externalCfg.dynamicPricingEnabled,
      region: this.dynamicPriceSchedule.region,
      currency: this.dynamicPriceSchedule.currency,
      schedule: this.dynamicPriceSchedule.schedule,
      current: this.currentDynamicEntry(),
      updatedAt: this.dynamicPriceSchedule.updatedAt,
      lastError: this.dynamicPriceError || null,
    };
  }

  private toMinutes(t: string): number {
    const [h, m] = t.split(':').map((x) => parseInt(x, 10) || 0);
    return h * 60 + m;
  }

  // ──────── CalDAV 日历 ────────

  /**
   * 解析 ICS 文本为事件列表（委托给公共工具 parseICalendar）。
   *
   * @param icsContent ICS 原始文本
   * @returns 事件列表
   */
  parseICalendar(icsContent: string): ICalendarEvent[] {
    return parseICalendar(icsContent);
  }

  /**
   * 判断当前是否处于"外出"事件中（委托给 helper）。
   *
   * @param events 事件列表
   */
  isAwayDuringCalendar(events: Array<{ start: string; end: string; isAway: boolean }>): boolean {
    return isAwayDuringCalendar(events);
  }

  /**
   * 获取即将发生的外出事件（默认未来 2 小时内，用于提前触发准备）。
   *
   * @param events      事件列表
   * @param withinHours 提前窗口（小时），默认 2
   */
  getUpcomingAwayEvents(
    events: Array<{ title: string; start: string; isAway: boolean }>,
    withinHours = 2,
  ) {
    return getUpcomingAwayEvents(events, withinHours);
  }
}