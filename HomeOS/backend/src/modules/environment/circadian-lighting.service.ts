/**
 * @file circadian-lighting.service.ts
 * @module environment
 * @description 昼夜节律照明服务。根据太阳高度角 / 时间 / 室内照度反馈 / 天气云量预报
 * 动态调节灯具色温与亮度，支持新开灯即时应用、房间级占用感知与离家场景暂停。
 *
 * 关键策略：
 *  - 太阳高度角优先，缺省回退到时段映射；夜间强制低色温低亮度
 *  - 家庭偏好色温按 35% 权重混入目标色温（夜间不混入）
 *  - 照度反馈闭环：白天 lux 偏离目标时按比例上调 / 下调亮度
 *  - 云量预报预调：阴天按 (1-cloudFactor)*0.5 提升亮度
 *  - 安防 armed_away 或离家模拟期间暂停调度，避免与 away-sim 抢灯
 *  - 仅 HA WS 主节点下发
 *
 * 依赖：
 *  - HaConnectorService / HaWsLeaderService：HA 服务调用与 leader 选举
 *  - HomeModeService：睡眠相关模式激活时自动停用节律
 *  - RoomContextService / PresenceService：房间占用与家庭偏好解析
 *  - AppConfigService：circadian / external 配置
 *  - PrismaService：AdaptiveOverride（light 类）偏好学习持久化
 *  - ExternalApiService：OpenWeather 云量预报备选数据源
 *  - JobRegistryService：偏好刷新任务监控
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { HaConnectorService } from '../ha-connector/service';
import { HaWsLeaderService } from '../ha-connector/ha-ws-leader.service';
import { HomeModeService } from '../home-mode/service';
import {
  RoomContextService,
  type RoomContextSnapshot,
} from '../security/presence/room-context.service';
import { AppConfigService } from '../../shared/app-config/service';
import { PrismaService } from '../../shared/prisma/service';
import { JobRegistryService } from '../../shared/jobs/registry.service';
import { ExternalApiService } from '../system/ops/external-api.service';
import {
  DEFAULT_USER_PREFERENCES,
  getActiveHomePreferencesDetailed,
  type ResolvedHomePreferences,
} from '../auth/preferences.util';
import { PresenceService } from '../security/presence/service';
import { HOMEOS_EVENTS } from '../../shared/homeos-events';
import { HA_EVENTS } from '../../shared/types';
import type { HaStateChangeBatchEvent } from '../../shared/types';
import { forEachColdBatchEvent } from '../../shared/ha/cold-batch.util';
import { getErrorMessage } from '../../common/utils';

interface CircadianTarget {
  colorTempKelvin: number;
  brightnessPct: number;
  phase: 'day' | 'evening' | 'night' | 'morning';
}

/**
 * 昼夜节律照明服务
 *
 * 根据时间/太阳高度角/照度反馈/天气预报动态调节色温与亮度。
 */
@Injectable()
export class CircadianLightingService implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(CircadianLightingService.name);
  private enabled = false;
  private timer: NodeJS.Timeout | null = null;
  private readonly INTERVAL_MS = 5 * 60 * 1000;

  private sunElevation: number | null = null;
  private readonly lightStates = new Map<string, boolean>();
  private readonly lightRooms = new Map<string, string | null>();
  private readonly roomLux = new Map<string, number>();
  private forecastCloudFactor = 1;
  private overrideCache = new Map<string, number>();
  /** 新开灯即时应用的待执行定时器（entityId → timeout） */
  private pendingLightApplies: Map<string, NodeJS.Timeout> | null = null;
  private householdPrefs = { ...DEFAULT_USER_PREFERENCES };
  private prefsMeta: Pick<ResolvedHomePreferences, 'source' | 'matchedMembers' | 'summary'> = {
    source: 'household_default',
    matchedMembers: [],
    summary: '家庭默认偏好',
  };
  private prefsTimer: NodeJS.Timeout | null = null;
  /** armed_away / 离家模拟期间暂停节律调光，避免与 away-sim 抢灯 */
  private pauseForAway = false;
  /** 安防外出布防导致的节律暂停 */
  private pauseForSecurityAway = false;
  /** 离家模拟导致的节律暂停 */
  private pauseForSimulation = false;

  constructor(
    private readonly haConnector: HaConnectorService,
    private readonly haLeader: HaWsLeaderService,
    private readonly homeMode: HomeModeService,
    private readonly roomContext: RoomContextService,
    private readonly appConfig: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
    private readonly jobs: JobRegistryService,
    private readonly externalApi: ExternalApiService,
  ) {}

  async onModuleInit() {
    await this.refreshHouseholdPrefs();
    this.prefsTimer = setInterval(() => {
      void this.jobs.run(
        'circadian-prefs-refresh',
        { description: '昼夜节律家庭偏好刷新', intervalMs: 10 * 60 * 1000 },
        () => this.refreshHouseholdPrefs(),
      );
    }, 10 * 60 * 1000);
    if (this.appConfig.get('circadian').overrideLearningEnabled) {
      await this.loadOverrides();
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

  private async loadOverrides() {
    try {
      const rows = await this.prisma.adaptiveOverride.findMany({
        where: { kind: 'light' },
        take: 500,
      });
      this.overrideCache.clear();
      for (const r of rows) this.overrideCache.set(r.scope, r.offset);
    } catch {
      /* 忽略 */
    }
  }

  private isSleepRelatedMode(name?: string | null): boolean {
    return !!name && /睡眠|助眠|sleep|night|影院|影音|movie/i.test(name);
  }

  private shouldPauseForAway(): boolean {
    return this.pauseForAway;
  }

  private syncPauseForAway() {
    const next = this.pauseForSecurityAway || this.pauseForSimulation;
    if (next === this.pauseForAway) return;
    this.pauseForAway = next;
    if (next && this.enabled) {
      this.logger.log(
        this.pauseForSimulation ? '离家模拟启用:暂停昼夜节律照明调度' : '安防外出布防:暂停昼夜节律照明调度',
      );
    }
  }

  @OnEvent('security.modeChanged')
  handleSecurityModeForAway(data: { mode?: string }) {
    this.pauseForSecurityAway = data?.mode === 'armed_away';
    this.syncPauseForAway();
  }

  @OnEvent(HOMEOS_EVENTS.SECURITY_AWAY_SIMULATION)
  handleAwaySimulation(data: { enabled?: boolean }) {
    this.pauseForSimulation = !!data?.enabled;
    this.syncPauseForAway();
  }

  onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
    if (this.prefsTimer) {
      clearInterval(this.prefsTimer);
      this.prefsTimer = null;
    }
    if (this.pendingLightApplies) {
      for (const t of this.pendingLightApplies.values()) clearTimeout(t);
      this.pendingLightApplies.clear();
    }
  }

  private inferRoom(id: string, name?: string): string | null {
    const n = `${id} ${name || ''}`.toLowerCase();
    if (/bedroom|主卧|卧室/.test(n)) return 'bedroom';
    if (/living|客厅|起居室/.test(n)) return 'living';
    if (/kitchen|厨房/.test(n)) return 'kitchen';
    if (/bathroom|卫浴|卫生间|浴室/.test(n)) return 'bathroom';
    if (/study|书房/.test(n)) return 'study';
    return null;
  }

  @OnEvent(HA_EVENTS.STATE_CHANGED_COLD_BATCH)
  handleStateChange(payload: HaStateChangeBatchEvent) {
    forEachColdBatchEvent(payload, (event) => {
      const id = event.entity_id;
      const attrs = event.new_state?.attributes as Record<string, unknown> | undefined;
      const name = (attrs?.friendly_name as string) || id;

      if (id === 'sun.sun') {
        const elev = attrs?.elevation;
        if (typeof elev === 'number') this.sunElevation = elev;
      } else if (id.startsWith('light.')) {
        const wasOn = this.lightStates.get(id) === true;
        const isOn = event.new_state?.state === 'on';
        this.lightStates.set(id, isOn);
        this.lightRooms.set(id, this.inferRoom(id, name));
        // 新开灯即时应用昼夜节律目标（避免刚开的灯以“白热”色温点亮）
        if (this.enabled && isOn && !wasOn) {
          this.scheduleNewLightApply(id);
        }
      } else if (
        id.includes('illuminance') ||
        (id.startsWith('sensor.') && String(name).includes('照度'))
      ) {
        const room = this.inferRoom(id, name);
        const lux = parseFloat(event.new_state?.state || '');
        if (room && !isNaN(lux)) this.roomLux.set(room, lux);
      }
    });
  }

  /** 新开灯即时应用：300ms 去抖后对单灯应用节律目标（合并同一事件内的连续开灯） */
  private scheduleNewLightApply(id: string) {
    if (this.shouldPauseForAway()) return;
    const apply = () => {
      if (!this.enabled || !this.haLeader.isHaWsLeader() || this.shouldPauseForAway()) return;
      const room = this.lightRooms.get(id) ?? this.inferRoom(id);
      if (this.appConfig.get('circadian').perRoomEnabled && room) {
        const snapshot = this.roomContext.getSnapshot();
        if (!(snapshot.rooms[room]?.occupied ?? false)) return;
      }
      const target = this.computeTarget(new Date(), room);
      this.haConnector
        .callService('light', 'turn_on', id, {
          color_temp_kelvin: target.colorTempKelvin,
          brightness_pct: target.brightnessPct,
        })
        .then(() => this.logger.log(`新开灯已应用节律: ${id} → ${target.colorTempKelvin}K / ${target.brightnessPct}%`))
        .catch((err: unknown) =>
          this.logger.debug(`新开灯节律应用失败 [${id}]: ${getErrorMessage(err)}`),
        );
    };
    const existing = this.pendingLightApplies?.get(id);
    if (existing) clearTimeout(existing);
    if (!this.pendingLightApplies) this.pendingLightApplies = new Map();
    this.pendingLightApplies.set(id, setTimeout(apply, 300));
  }

  @OnEvent(HOMEOS_EVENTS.ROOM_CONTEXT)
  handleRoomContext(payload: RoomContextSnapshot & { changedRoom?: string }) {
    if (!this.haLeader.isHaWsLeader()) return;
    if (!this.enabled || !this.appConfig.get('circadian').perRoomEnabled) return;
    const changed = payload.changedRoom;
    if (!changed || !payload.rooms[changed]?.occupied) return;
    void this.applyForRoom(changed);
  }

  /** 根据当前时间/太阳高度角计算目标色温与亮度 */
  computeTarget(now: Date = new Date(), room?: string | null): CircadianTarget {
    const h = now.getHours() + now.getMinutes() / 60;
    let target: CircadianTarget;

    if (this.sunElevation != null) {
      if (this.sunElevation > 15)
        target = { colorTempKelvin: 5500, brightnessPct: 100, phase: 'day' };
      else if (this.sunElevation > 0)
        target = { colorTempKelvin: 4000, brightnessPct: 85, phase: 'evening' };
      else if (this.sunElevation > -6)
        target = { colorTempKelvin: 3000, brightnessPct: 60, phase: 'evening' };
      else target = { colorTempKelvin: 2200, brightnessPct: 25, phase: 'night' };
    } else if (h >= 6 && h < 9) {
      target = { colorTempKelvin: 4500, brightnessPct: 80, phase: 'morning' };
    } else if (h >= 9 && h < 17) {
      target = { colorTempKelvin: 5500, brightnessPct: 100, phase: 'day' };
    } else if (h >= 17 && h < 20) {
      target = { colorTempKelvin: 3500, brightnessPct: 75, phase: 'evening' };
    } else if (h >= 20 && h < 23) {
      target = { colorTempKelvin: 2700, brightnessPct: 50, phase: 'evening' };
    } else {
      target = { colorTempKelvin: 2200, brightnessPct: 25, phase: 'night' };
    }

    // 家庭偏好色温：向 preferredLightKelvin 轻微偏置（约 35%）
    const preferredK = Number(this.householdPrefs.preferredLightKelvin) || 4000;
    if (preferredK >= 2000 && preferredK <= 6500 && target.phase !== 'night') {
      const blended = Math.round(target.colorTempKelvin * 0.65 + preferredK * 0.35);
      target = { ...target, colorTempKelvin: Math.max(2000, Math.min(6500, blended)) };
    }

    // 自动夜间模式：到达 nightModeTime 后强制进入 night 相位
    if (this.householdPrefs.autoNightMode !== false) {
      const nightAt = String(this.householdPrefs.nightModeTime || '22:00');
      const [nh, nm] = nightAt.split(':').map((x) => Number(x));
      if (Number.isFinite(nh)) {
        const nightStart = nh + (Number.isFinite(nm) ? nm / 60 : 0);
        if (h >= nightStart || h < 6) {
          target = { colorTempKelvin: 2200, brightnessPct: 25, phase: 'night' };
        }
      }
    }

    const cfg = this.appConfig.get('circadian');
    if (cfg.forecastPreAdjust && this.forecastCloudFactor < 1 && target.phase !== 'night') {
      // 连续补偿：云量越少补偿越弱，阴天（0.5）补偿 +25%，晴天不补偿
      const cloudyCompensation = (1 - this.forecastCloudFactor) * 0.5;
      target = {
        ...target,
        brightnessPct: Math.min(
          100,
          Math.round(target.brightnessPct * (1 + cloudyCompensation)),
        ),
      };
    }

    if (cfg.luxFeedbackEnabled && room) {
      const lux = this.roomLux.get(room);
      const targetLux = cfg.luxTargetDay;
      if (lux != null && targetLux > 0 && target.phase === 'day') {
        const ratio = lux / targetLux;
        if (ratio < 0.7)
          target = {
            ...target,
            brightnessPct: Math.min(100, Math.round(target.brightnessPct * 1.2)),
          };
        else if (ratio > 1.3)
          target = {
            ...target,
            brightnessPct: Math.max(20, Math.round(target.brightnessPct * 0.85)),
          };
      }
    }

    const scope = room || 'global';
    const offset = this.overrideCache.get(scope);
    if (offset != null && cfg.overrideLearningEnabled) {
      target = {
        ...target,
        brightnessPct: Math.max(5, Math.min(100, Math.round(target.brightnessPct + offset))),
      };
    }

    return target;
  }

  getStatus() {
    const cfg = this.appConfig.get('circadian');
    return {
      enabled: this.enabled,
      sunElevation: this.sunElevation,
      currentTarget: this.computeTarget(),
      trackedLights: this.lightStates.size,
      roomLux: Object.fromEntries(this.roomLux),
      forecastCloudFactor: this.forecastCloudFactor,
      preference: {
        preferredLightKelvin: Number(this.householdPrefs.preferredLightKelvin) || 4000,
        autoNightMode: this.householdPrefs.autoNightMode !== false,
        nightModeTime: String(this.householdPrefs.nightModeTime || '22:00'),
        source: this.prefsMeta.source,
        matchedMembers: this.prefsMeta.matchedMembers,
        summary: this.prefsMeta.summary,
      },
      config: {
        luxFeedbackEnabled: cfg.luxFeedbackEnabled,
        forecastPreAdjust: cfg.forecastPreAdjust,
        perRoomEnabled: cfg.perRoomEnabled,
      },
    };
  }

  getRoomStatus() {
    const snapshot = this.roomContext.getSnapshot();
    const rooms: Record<
      string,
      {
        occupied: boolean;
        lux: number | null;
        target: CircadianTarget;
        lights: string[];
      }
    > = {};

    for (const [room, entry] of Object.entries(snapshot.rooms)) {
      const lights = [...this.lightRooms.entries()].filter(([, r]) => r === room).map(([id]) => id);
      rooms[room] = {
        occupied: entry.occupied,
        lux: this.roomLux.get(room) ?? null,
        target: this.computeTarget(new Date(), room),
        lights,
      };
    }

    return { updatedAt: snapshot.updatedAt, anyoneHome: snapshot.anyoneHome, rooms };
  }

  private filterCandidates(lights?: string[], room?: string): string[] {
    const cfg = this.appConfig.get('circadian');
    let candidates: string[];

    if (lights?.length) {
      candidates = lights;
    } else {
      candidates = [...this.lightStates.entries()].filter(([, on]) => on).map(([id]) => id);
      if (candidates.length === 0) {
        return [];
      }
    }

    if (cfg.perRoomEnabled) {
      const snapshot = this.roomContext.getSnapshot();
      candidates = candidates.filter((id) => {
        const r = this.lightRooms.get(id) ?? this.inferRoom(id);
        if (!r) return true;
        return snapshot.rooms[r]?.occupied ?? false;
      });
    }

    if (room) {
      candidates = candidates.filter(
        (id) => (this.lightRooms.get(id) ?? this.inferRoom(id)) === room,
      );
    }

    return candidates;
  }

  async applyForRoom(room: string) {
    const lights = this.filterCandidates(undefined, room);
    return this.applyLights(lights, room);
  }

  /** 立即对当前开启的灯具应用昼夜节律目标值 */
  async apply(lights?: string[]) {
    if (this.shouldPauseForAway()) {
      return { applied: 0, target: this.computeTarget(new Date()), paused: true };
    }
    let candidates = this.filterCandidates(lights);
    if (candidates.length === 0 && !lights?.length) {
      try {
        const all = await this.haConnector.fetchEntitiesByDomain('light');
        candidates = all.filter((l) => l.state === 'on').map((l) => l.entity_id);
        candidates = this.filterCandidates(candidates);
      } catch (err: unknown) {
        this.logger.debug(`拉取 light 实体失败: ${String(err)}`);
        candidates = [];
      }
    }
    return this.applyLights(candidates);
  }

  private async applyLights(candidates: string[], room?: string | null) {
    if (!this.haLeader.isHaWsLeader()) {
      const target = this.computeTarget(new Date(), room);
      return { applied: 0, target };
    }
    let applied = 0;
    for (const id of candidates) {
      const r = room ?? this.lightRooms.get(id) ?? this.inferRoom(id);
      const target = this.computeTarget(new Date(), r);
      try {
        await this.haConnector.callService('light', 'turn_on', id, {
          color_temp_kelvin: target.colorTempKelvin,
          brightness_pct: target.brightnessPct,
        });
        applied++;
      } catch (err) {
        this.logger.debug(`昼夜节律应用失败 [${id}]: ${getErrorMessage(err)}`);
      }
    }
    const target = this.computeTarget(new Date(), room);
    this.logger.log(
      `昼夜节律已应用: ${applied} 个灯具 → ${target.colorTempKelvin}K / ${target.brightnessPct}% (${target.phase})`,
    );
    return { applied, target };
  }

  private async refreshForecast() {
    const cfg = this.appConfig.get('circadian');
    if (!cfg.forecastPreAdjust) return;

    const weatherId = cfg.weatherEntityId?.trim();
    if (weatherId) {
      try {
        const resp = (await this.haConnector.callService(
          'weather',
          'get_forecasts',
          weatherId,
          { type: 'daily' },
          true,
        )) as { response?: Record<string, { forecast?: Array<{ condition?: string }> }> };
        const forecast = resp?.response?.[weatherId]?.forecast?.[0];
        const cond = String(forecast?.condition || '').toLowerCase();
        // 连续化：晴天 1.0 → 多云 0.85 → 阴天 0.7 → 雨/雪/强对流 0.5
        this.forecastCloudFactor = continuousCloudFactorFromCondition(cond);
        return;
      } catch (err) {
        this.logger.debug(`HA 天气预报获取失败: ${getErrorMessage(err)}`);
      }
    }

    if (this.appConfig.get('external').openWeatherApiKey) {
      try {
        const { list } = await this.externalApi.fetchForecast({ cnt: 8 });
        const clouds = list[0]?.clouds?.all ?? 0;
        // 云量 0% → 1.0，100% → 0.5，线性插值避免跳变
        this.forecastCloudFactor = continuousCloudFactorFromCloudPct(clouds);
      } catch (err) {
        this.logger.debug(`OpenWeather 预报获取失败: ${getErrorMessage(err)}`);
      }
    }
  }

  async enable() {
    const active = await this.homeMode.getActive();
    if (this.isSleepRelatedMode(active?.name)) {
      this.logger.warn(`家庭模式"${active?.name}"激活中,拒绝启用昼夜节律`);
      return {
        ...this.getStatus(),
        blocked: true,
        blockedReason: `当前家庭模式为「${active?.name}」，与节律照明冲突`,
      };
    }
    this.enabled = true;
    await this.refreshForecast();
    this.scheduleNext();
    void this.apply();
    this.logger.log('昼夜节律照明已启用');
    return this.getStatus();
  }

  @OnEvent('homeMode.activated')
  handleHomeModeActivated(payload: { modeName?: string }) {
    if (!this.isSleepRelatedMode(payload?.modeName) || !this.enabled) return;
    this.disable();
    this.logger.log(`家庭模式"${payload?.modeName}"已激活,自动停用昼夜节律照明`);
  }

  disable() {
    this.enabled = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.logger.log('昼夜节律照明已停用');
    return this.getStatus();
  }

  private scheduleNext() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(async () => {
      if (this.enabled) {
        if (!this.shouldPauseForAway()) {
          await this.refreshForecast().catch((err) => {
            this.logger.warn(`昼夜节律刷新预报失败: ${(err as Error).message}`);
          });
          await this.apply().catch((err) => {
            this.logger.warn(`昼夜节律应用失败: ${(err as Error).message}`);
          });
        }
        this.scheduleNext();
      }
    }, this.INTERVAL_MS);
  }
}

/** 由 HA 天气 condition 映射连续云量系数：晴天 1.0 → 多云 0.85 → 阴 0.7 → 雨/雪 0.5 */
function continuousCloudFactorFromCondition(cond: string): number {
  const c = String(cond || '').toLowerCase();
  if (!c) return 1;
  if (/clear|sunny|fair|晴/.test(c)) return 1;
  if (/partly|few|clouds?/.test(c)) return 0.85;
  if (/overcast|阴/.test(c)) return 0.7;
  if (/rain|drizzle|shower|storm|雨|雷/.test(c)) return 0.55;
  if (/snow|雪/.test(c)) return 0.5;
  if (/fog|mist|haze|霾|雾/.test(c)) return 0.65;
  return 0.85;
}

/** 由云量百分比（0-100）线性插值云量系数：0% → 1.0，100% → 0.5 */
function continuousCloudFactorFromCloudPct(cloudsPct: number): number {
  const pct = Math.max(0, Math.min(100, Number(cloudsPct) || 0));
  return Math.round((1 - pct * 0.005) * 100) / 100;
}
