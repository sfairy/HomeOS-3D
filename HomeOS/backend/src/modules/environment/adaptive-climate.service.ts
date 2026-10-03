/**
 * @file adaptive-climate.service.ts
 * @module environment
 * @description 自适应温控服务。基于室外温度 / 在家状态 / 当前电价时段 / 室内传感器闭环，
 * 为 HA climate 实体推荐设定温度，支持自动应用、用户偏好学习与天气预报预调。
 *
 * 关键策略：
 *  - 家庭默认温度偏好为基准，叠加无人在家节能回调、峰电错峰、预报预调、用户偏好偏移
 *  - 仅 HA WS 主节点下发，避免多实例重复调温
 *  - 用户手动调温进入 manualHold 暂缓自动应用；hold 过期后恢复
 *  - 用户偏好偏移按 scope（房间或 global）落库到 AdaptiveOverride 表
 *
 * 依赖：
 *  - HaConnectorService / HaWsLeaderService：HA 服务调用与 leader 选举
 *  - PresenceService / RoomContextService：在家与房间占用判定
 *  - EntityAreaEnrichmentService：实体 area_id 补全，提升房间识别准确度
 *  - AppConfigService：adaptiveClimate / circadian / external / pricing 配置
 *  - PrismaService：AdaptiveOverride 偏好学习持久化
 *  - ExternalApiService：OpenWeather 预报备选数据源
 *  - JobRegistryService：周期任务监控（偏好刷新 / 预报 / 自动应用）
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { HaConnectorService } from '../ha-connector/service';
import { HaWsLeaderService } from '../ha-connector/ha-ws-leader.service';
import { PresenceService } from '../security/presence/service';
import {
  RoomContextService,
  type RoomContextSnapshot,
} from '../security/presence/room-context.service';
import {
  AppConfigService,
  APP_CONFIG_UPDATED,
} from '../../shared/app-config/service';
import { isPeakShiftActive } from '../../shared/app-config/pricing-config.util';
import { resolveEntityArea } from '@homeos/shared';
import { EntityAreaEnrichmentService } from '../state-store/entity-area-enrichment.service';
import { PrismaService } from '../../shared/prisma/service';
import { JobRegistryService } from '../../shared/jobs/registry.service';
import { ExternalApiService } from '../system/ops/external-api.service';
import {
  DEFAULT_USER_PREFERENCES,
  getActiveHomePreferencesDetailed,
  type ResolvedHomePreferences,
} from '../auth/preferences.util';
import { HOMEOS_EVENTS } from '../../shared/homeos-events';
import { HA_EVENTS } from '../../shared/types';
import type { HaStateChangeBatchEvent } from '../../shared/types';
import { forEachColdBatchEvent } from '../../shared/ha/cold-batch.util';
import { getErrorMessage } from '../../common/utils';

interface ClimateRecommendation {
  entityId: string;
  friendlyName: string;
  currentSetpoint: number | null;
  recommendedSetpoint: number;
  mode: 'cool' | 'heat';
  reasons: string[];
  room?: string | null;
}

/**
 * 自适应温控服务
 *
 * 根据室外温度 / 是否有人在家 / 当前电价时段 / 室内传感器闭环，为 climate 实体推荐设定温度。
 */
@Injectable()
export class AdaptiveClimateService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AdaptiveClimateService.name);
  private readonly FORECAST_INTERVAL_MS = 30 * 60 * 1000;

  private outdoorTemp: number | null = null;
  private readonly roomIndoorTemp = new Map<string, number>();
  private readonly climates = new Map<
    string,
    { name: string; setpoint: number | null; hvac: string; room: string | null }
  >();
  /** 用户手动调温 hold：entityId → 过期时间戳 */
  private readonly manualHoldUntil = new Map<string, number>();
  private overrideCache = new Map<string, number>();
  /** 日历外出时段：强制按无人在家处理（不受 presence 判定影响） */
  private calendarAway = false;
  /** 预报相对当前室外温度的预调偏移（℃） */
  private forecastAdjustC = 0;
  private forecastTimer: NodeJS.Timeout | null = null;
  private autoApplyTimer: NodeJS.Timeout | null = null;
  private householdPrefs = { ...DEFAULT_USER_PREFERENCES };
  private prefsMeta: Pick<ResolvedHomePreferences, 'source' | 'matchedMembers' | 'summary'> = {
    source: 'household_default',
    matchedMembers: [],
    summary: '家庭默认偏好',
  };
  private prefsTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly haConnector: HaConnectorService,
    private readonly haLeader: HaWsLeaderService,
    private readonly presence: PresenceService,
    private readonly roomContext: RoomContextService,
    private readonly entityAreaEnrichment: EntityAreaEnrichmentService,
    private readonly appConfig: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly jobs: JobRegistryService,
    private readonly externalApi: ExternalApiService,
  ) {}

  async onModuleInit() {
    await this.loadOverrides();
    await this.refreshHouseholdPrefs();
    this.prefsTimer = setInterval(() => {
      void this.jobs.run(
        'adaptive-climate-prefs-refresh',
        { description: '自适应温控家庭偏好刷新', intervalMs: 10 * 60 * 1000 },
        () => this.refreshHouseholdPrefs(),
      );
    }, 10 * 60 * 1000);
    this.scheduleForecastRefresh();
    this.scheduleAutoApply();
  }

  onModuleDestroy() {
    if (this.forecastTimer) {
      clearInterval(this.forecastTimer);
      this.forecastTimer = null;
    }
    if (this.prefsTimer) {
      clearInterval(this.prefsTimer);
      this.prefsTimer = null;
    }
    if (this.autoApplyTimer) {
      clearInterval(this.autoApplyTimer);
      this.autoApplyTimer = null;
    }
  }

  private async refreshHouseholdPrefs() {
    try {
      const members = this.presence.getAllMembers().map((m) => ({
        id: m.id,
        name: m.name,
        atHome: m.atHome,
        userId: m.userId,
      }));
      const resolved = await getActiveHomePreferencesDetailed(
        { prisma: this.prisma, logger: this.logger },
        members,
      );
      this.householdPrefs = resolved.prefs;
      this.prefsMeta = {
        source: resolved.source,
        matchedMembers: resolved.matchedMembers,
        summary: resolved.summary,
      };
    } catch {
      /* 保留缓存 */
    }
  }

  @OnEvent(APP_CONFIG_UPDATED)
  onConfigUpdated(keys: string[]) {
    if (
      keys.includes('adaptiveClimate') ||
      keys.includes('circadian') ||
      keys.includes('external')
    ) {
      void this.refreshForecast();
      this.scheduleForecastRefresh();
    }
    if (keys.includes('adaptiveClimate')) {
      this.scheduleAutoApply();
    }
  }

  /**
   * 按配置调度自动应用：启用时以 autoApplyIntervalMin 为周期调用 apply()，
   * 仅当 HomeOS 为 HA WS 主节点时才实际下发，避免多实例重复调温。
   */
  private scheduleAutoApply() {
    if (this.autoApplyTimer) {
      clearInterval(this.autoApplyTimer);
      this.autoApplyTimer = null;
    }
    const cfg = this.appConfig.get('adaptiveClimate');
    if (!cfg.autoApplyEnabled) return;
    const intervalMs = Math.max(5, Math.min(cfg.autoApplyIntervalMin, 1440)) * 60 * 1000;
    // 首个周期先立即评估一次，避免开启后需等待一个完整周期
    void this.jobs.run(
      'adaptive-climate-auto-apply',
      { description: '自适应温控自动应用', intervalMs },
      () => this.applyAutoApply(),
    );
    this.autoApplyTimer = setInterval(() => {
      void this.jobs.run(
        'adaptive-climate-auto-apply',
        { description: '自适应温控自动应用', intervalMs },
        () => this.applyAutoApply(),
      );
    }, intervalMs);
  }

  /** 自动应用入口：仅主节点执行，无差异时不产生任何下发 */
  private async applyAutoApply() {
    if (!this.haLeader.isHaWsLeader()) return;
    try {
      const r = await this.apply();
      if (r.applied > 0) {
        this.logger.log(`自适应温控自动应用: ${r.applied} 台已调整`);
      }
    } catch (err) {
      this.logger.debug(`自适应温控自动应用失败: ${getErrorMessage(err)}`);
    }
  }

  /** 在家状态变化时按房间立即评估应用（有人到家恢复、全员离家节能） */
  @OnEvent('presence.changed')
  handlePresenceChanged(payload: { atHome?: boolean }) {
    if (!this.haLeader.isHaWsLeader()) return;
    if (!this.appConfig.get('adaptiveClimate').autoApplyEnabled) return;
    // 有人到家时立即应用；离家时等待确认由周期任务兜底，避免误触发
    if (payload.atHome) {
      void this.applyAutoApply();
    }
  }

  /** 日历外出时段联动：外出开始时强制节能（无人回退温度），结束恢复按实际在场评估 */
  @OnEvent('calendar.awayChanged')
  handleCalendarAway(data: { away?: boolean }) {
    if (!this.haLeader.isHaWsLeader()) return;
    if (!this.appConfig.get('adaptiveClimate').autoApplyEnabled) return;
    this.calendarAway = !!data.away;
    void this.applyAutoApply();
  }

  private scheduleForecastRefresh() {
    if (this.forecastTimer) {
      clearInterval(this.forecastTimer);
      this.forecastTimer = null;
    }
    if (!this.appConfig.get('adaptiveClimate').forecastPreAdjust) {
      this.forecastAdjustC = 0;
      return;
    }
    void this.refreshForecast();
    this.forecastTimer = setInterval(() => {
      void this.jobs.run(
        'adaptive-climate-forecast',
        { description: '自适应温控天气预报刷新', intervalMs: this.FORECAST_INTERVAL_MS },
        () => this.refreshForecast(),
      );
    }, this.FORECAST_INTERVAL_MS);
  }

  private async refreshForecast() {
    const cfg = this.appConfig.get('adaptiveClimate');
    if (!cfg.forecastPreAdjust) {
      this.forecastAdjustC = 0;
      return;
    }

    const circadian = this.appConfig.get('circadian');
    const weatherId = circadian.weatherEntityId?.trim();
    if (weatherId) {
      try {
        const resp = (await this.haConnector.callService(
          'weather',
          'get_forecasts',
          weatherId,
          { type: 'daily' },
          true,
        )) as {
          response?: Record<
            string,
            { forecast?: Array<{ temperature?: number; templow?: number }> }
          >;
        };
        const forecast = resp?.response?.[weatherId]?.forecast?.[0];
        const high = typeof forecast?.temperature === 'number' ? forecast.temperature : null;
        const low = typeof forecast?.templow === 'number' ? forecast.templow : null;
        this.forecastAdjustC = this.computeForecastAdjust(high, low);
        return;
      } catch (err) {
        this.logger.debug(`HA 天气预报获取失败: ${getErrorMessage(err)}`);
      }
    }

    if (this.appConfig.get('external').openWeatherApiKey) {
      try {
        const { list } = await this.externalApi.fetchForecast({ cnt: 8 });
        const next = list[0]?.main;
        this.forecastAdjustC = this.computeForecastAdjust(
          next?.temp_max ?? null,
          next?.temp_min ?? null,
        );
      } catch (err) {
        this.logger.debug(`OpenWeather 预报获取失败: ${getErrorMessage(err)}`);
      }
    }
  }

  private currentSeason(): 'cool' | 'heat' {
    if (this.outdoorTemp != null) {
      return this.outdoorTemp >= 24 ? 'cool' : 'heat';
    }
    const m = new Date().getMonth() + 1;
    return m >= 5 && m <= 9 ? 'cool' : 'heat';
  }

  private computeForecastAdjust(forecastHigh: number | null, forecastLow: number | null): number {
    const base = this.outdoorTemp;
    if (base == null) return 0;
    const season = this.currentSeason();
    let adjust = 0;
    // 热浪：制冷季预冷（目标↓）；寒潮：制热季预热（目标↑）
    if (season === 'cool' && forecastHigh != null && forecastHigh >= base + 3) adjust -= 1;
    if (season === 'heat' && forecastLow != null && forecastLow <= base - 3) adjust += 1;
    return adjust;
  }

  private async loadOverrides() {
    try {
      const rows = await this.prisma.adaptiveOverride.findMany({
        where: { kind: 'climate' },
        take: 500,
      });
      this.overrideCache.clear();
      for (const r of rows) {
        this.overrideCache.set(r.scope, r.offset);
      }
    } catch {
      /* 忽略 */
    }
  }

  /**
   * 房间识别：HA area 绑定优先（area_id / area_name），关键词正则兜底。
   * area 维度来自实体注册表补全（EntityAreaEnrichmentService），
   * 比单纯按实体 id/名称猜房间更可靠（如 climate.ac_bedroom2 可绑定到「主卧」区域）。
   */
  private inferRoom(id: string, name?: string, attrs?: Record<string, unknown>): string | null {
    const area = resolveEntityArea(attrs as { area_id?: unknown; area_name?: unknown });
    if (area) {
      const byArea = this.roomFromKeywords(`${area.id} ${area.name}`);
      if (byArea) return byArea;
    }
    const n = `${id} ${name || ''}`.toLowerCase();
    return this.roomFromKeywords(n);
  }

  /** 关键词 → 房间 slug（与 room-context 保持一致的简化房间维度） */
  private roomFromKeywords(haystack: string): string | null {
    const n = haystack.toLowerCase();
    if (/bedroom|主卧|卧室/.test(n)) return 'bedroom';
    if (/living|客厅|起居室/.test(n)) return 'living';
    if (/kitchen|厨房/.test(n)) return 'kitchen';
    if (/bathroom|卫浴|卫生间|浴室/.test(n)) return 'bathroom';
    if (/study|书房|办公/.test(n)) return 'study';
    return null;
  }

  private isOutdoorTempSensor(id: string, name: string): boolean {
    const i = (id + ' ' + name).toLowerCase();
    return (
      i.includes('temp') &&
      (i.includes('outdoor') || i.includes('室外') || i.includes('outside') || i.includes('户外'))
    );
  }

  private isIndoorTempSensor(id: string, name: string): boolean {
    const i = (id + ' ' + name).toLowerCase();
    if (!i.includes('temp') && !id.startsWith('sensor.')) return false;
    if (this.isOutdoorTempSensor(id, name)) return false;
    return /bedroom|living|kitchen|bathroom|study|卧|客|厨|卫|书房/.test(i);
  }

  @OnEvent(HA_EVENTS.STATE_CHANGED_COLD_BATCH)
  handleStateChange(payload: HaStateChangeBatchEvent) {
    forEachColdBatchEvent(payload, (event) => {
      const id = event.entity_id;
      // 先按实体注册表补全区域信息，确保 area_id / area_name 参与房间识别
      const enriched = event.new_state
        ? this.entityAreaEnrichment.enrichEntitySync(event.new_state)
        : null;
      const attrs = (enriched?.attributes ??
        event.new_state?.attributes) as Record<string, unknown> | undefined;
      const oldAttrs = event.old_state?.attributes as Record<string, unknown> | undefined;
      const name = (attrs?.friendly_name as string) || id;
      const room = this.inferRoom(id, name, attrs);

      if (id.startsWith('climate.')) {
        const setpoint =
          typeof attrs?.temperature === 'number' ? (attrs.temperature as number) : null;
        const oldSetpoint =
          typeof oldAttrs?.temperature === 'number' ? (oldAttrs.temperature as number) : null;
        this.climates.set(id, { name, setpoint, hvac: event.new_state?.state || 'off', room });

        if (
          oldSetpoint != null &&
          setpoint != null &&
          Math.abs(oldSetpoint - setpoint) >= 0.3 &&
          event.old_state?.state === event.new_state?.state
        ) {
          const holdMin = this.appConfig.get('adaptiveClimate').manualHoldMin ?? 90;
          if (holdMin > 0) {
            this.manualHoldUntil.set(id, Date.now() + holdMin * 60_000);
          }
          if (this.appConfig.get('adaptiveClimate').overrideLearningEnabled) {
            const rec = this.recommendForEntity(id);
            if (rec) {
              const offset = setpoint - rec.recommendedSetpoint;
              void this.recordOverride(room || 'global', offset);
            }
          }
        }
      } else if (this.isOutdoorTempSensor(id, name)) {
        const v = parseFloat(event.new_state?.state || '');
        if (!isNaN(v)) this.outdoorTemp = v;
      } else if (room && this.isIndoorTempSensor(id, name)) {
        const v = parseFloat(event.new_state?.state || '');
        if (!isNaN(v)) this.roomIndoorTemp.set(room, v);
      }
    });
  }

  @OnEvent(HOMEOS_EVENTS.ROOM_CONTEXT)
  handleRoomContext(payload: RoomContextSnapshot & { changedRoom?: string }) {
    if (!this.haLeader.isHaWsLeader()) return;
    if (!this.appConfig.get('adaptiveClimate').perRoomEnabled) return;
    const changed = payload.changedRoom;
    if (!changed) return;
    const entry = payload.rooms[changed];
    if (!entry?.occupied) return;
    void this.applyForRoom(changed);
  }

  private get anyoneHomeNow(): boolean {
    return this.presence.isAnyoneHome() || this.roomContext.getSnapshot().anyoneHome;
  }

  private isPeakNow(now = new Date()): boolean {
    return isPeakShiftActive(now, this.appConfig.get('pricing'));
  }

  private recommendForEntity(entityId: string): ClimateRecommendation | null {
    const rec = this.recommend();
    return rec.items.find((i) => i.entityId === entityId) ?? null;
  }

  /** 为所有 climate 实体生成推荐设定温度 */
  recommend(): {
    season: 'cool' | 'heat';
    outdoorTemp: number | null;
    anyoneHome: boolean;
    calendarAway: boolean;
    peak: boolean;
    items: ClimateRecommendation[];
    autoApply: { enabled: boolean; intervalMin: number };
    preference: {
      defaultTemperature: number;
      source: ResolvedHomePreferences['source'];
      matchedMembers: string[];
      summary: string;
    };
  } {
    const cfg = this.appConfig.get('adaptiveClimate');
    const peak = this.isPeakNow();
    const season = this.currentSeason();

    const items: ClimateRecommendation[] = [];
    const preferredTemp = Number(this.householdPrefs.defaultTemperature) || 24;
    for (const [entityId, info] of this.climates) {
      if (info.hvac === 'off' || info.hvac === 'unavailable') continue;
      const reasons: string[] = [];
      // 以家庭默认温度偏好为基准，再叠加无人/峰电/学习偏移
      let target = preferredTemp;
      reasons.push(`家庭偏好基准 ${preferredTemp}℃`);

      const room = info.room;
      // 日历外出时段强制视为无人，跳过 perRoom 与 presence 判定，优先节能
      const anyoneHome = this.calendarAway
        ? false
        : room && cfg.perRoomEnabled
          ? this.roomContext.isRoomOccupied(room)
          : this.anyoneHomeNow;

      if (!anyoneHome) {
        target += season === 'cool' ? 2 : -2;
        reasons.push(`无人在家节能回调 ${season === 'cool' ? '+2' : '-2'}℃`);
      }
      if (peak) {
        target += season === 'cool' ? 1 : -1;
        reasons.push(`峰电时段错峰 ${season === 'cool' ? '+1' : '-1'}℃`);
      }

      if (cfg.forecastPreAdjust && this.forecastAdjustC !== 0) {
        target += this.forecastAdjustC;
        reasons.push(`天气预报预调 ${this.forecastAdjustC > 0 ? '+' : ''}${this.forecastAdjustC}℃`);
      }

      const scope = room || 'global';
      const override = this.overrideCache.get(scope);
      if (override != null && cfg.overrideLearningEnabled) {
        target += override;
        reasons.push(`用户偏好偏移 ${override > 0 ? '+' : ''}${override.toFixed(1)}℃`);
      }

      if (room) {
        const indoor = this.roomIndoorTemp.get(room);
        if (indoor != null) {
          const tol = cfg.closedLoopToleranceC;
          if (season === 'cool' && indoor > target + tol) {
            target -= 0.5;
            reasons.push(`室内 ${indoor.toFixed(1)}℃ 偏高，闭环下调`);
          } else if (season === 'heat' && indoor < target - tol) {
            target += 0.5;
            reasons.push(`室内 ${indoor.toFixed(1)}℃ 偏低，闭环上调`);
          }
        }
      }

      target = Math.max(18, Math.min(29, target));

      items.push({
        entityId,
        friendlyName: info.name,
        currentSetpoint: info.setpoint,
        recommendedSetpoint: target,
        mode: season,
        reasons,
        room,
      });
    }
    return {
      season,
      outdoorTemp: this.outdoorTemp,
      anyoneHome: this.anyoneHomeNow,
      calendarAway: this.calendarAway,
      peak,
      items,
      autoApply: {
        enabled: cfg.autoApplyEnabled,
        intervalMin: cfg.autoApplyIntervalMin,
      },
      preference: {
        defaultTemperature: Number(this.householdPrefs.defaultTemperature) || 24,
        source: this.prefsMeta.source,
        matchedMembers: this.prefsMeta.matchedMembers,
        summary: this.prefsMeta.summary,
      },
    };
  }

  async applyForRoom(room: string) {
    const rec = this.recommend();
    const targets = rec.items.filter((i) => i.room === room);
    return this.applyEntities(targets);
  }

  /** 应用推荐设定温度到 climate 实体 */
  async apply(entityIds?: string[]) {
    const rec = this.recommend();
    const targets = entityIds?.length
      ? rec.items.filter((i) => entityIds.includes(i.entityId))
      : rec.items;
    return this.applyEntities(targets, rec);
  }

  private isManualHeld(entityId: string, now = Date.now()): boolean {
    const until = this.manualHoldUntil.get(entityId);
    if (until == null) return false;
    if (until <= now) {
      this.manualHoldUntil.delete(entityId);
      return false;
    }
    return true;
  }

  private async applyEntities(
    targets: ClimateRecommendation[],
    fullRec?: ReturnType<AdaptiveClimateService['recommend']>,
  ) {
    if (!this.haLeader.isHaWsLeader()) {
      return { applied: 0, recommendation: fullRec ?? this.recommend() };
    }
    let applied = 0;
    for (const item of targets) {
      if (this.isManualHeld(item.entityId)) continue;
      if (
        item.currentSetpoint != null &&
        Math.abs(item.currentSetpoint - item.recommendedSetpoint) < 0.5
      )
        continue;
      try {
        await this.haConnector.callService('climate', 'set_temperature', item.entityId, {
          temperature: item.recommendedSetpoint,
        });
        applied++;
      } catch (err) {
        this.logger.debug(`自适应温控应用失败 [${item.entityId}]: ${getErrorMessage(err)}`);
      }
    }
    const rec = fullRec ?? this.recommend();
    this.logger.log(`自适应温控已应用: ${applied}/${targets.length} 个空调 (${rec.season})`);
    return { applied, recommendation: rec };
  }

  private async recordOverride(scope: string, offset: number) {
    this.overrideCache.set(scope, offset);
    try {
      await this.prisma.adaptiveOverride.upsert({
        where: { scope_kind: { scope, kind: 'climate' } },
        create: { scope, kind: 'climate', offset, sampleCount: 1 },
        update: { offset, sampleCount: { increment: 1 } },
      });
    } catch (err) {
      this.logger.debug(`自适应覆盖写入失败: ${getErrorMessage(err)}`);
    }
  }

  async listOverrides() {
    const rows = await this.prisma.adaptiveOverride.findMany({
      where: { kind: 'climate' },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });
    return {
      count: rows.length,
      roomIndoorTemps: Object.fromEntries(this.roomIndoorTemp),
      items: rows.map((r) => ({
        scope: r.scope,
        offset: r.offset,
        sampleCount: r.sampleCount,
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  }
}
