/**
 * @file anomaly-detection.service.ts
 * @module backend/src/modules
 *
 * 异常活动检测服务：基于 RoomContext 与 PresenceService 监测家庭活动异常。
 *
 * 监控模式：
 *  1. 卫生间停留过久（> bathroomLongStayHighMin）→ 老人跌倒风险
 *  2. 卧室长时间无活动（夜间 + bedroomInactiveHours）→ 健康问题
 *  3. 深夜异常活动（deepNightStart~deepNightEnd + 非常规时段房间）→ 异常起床
 *  4. 全屋无活动（> wholeHouseInactiveNightHours/DayHours）→ 外出未归或室内事故
 *  5. 厨房长时间停留（> kitchenStayWarnMin）→ 烹饪后异常（燃气未关/晕倒）
 *
 * 活动基线从 EventLog 学习到 ActivityBaseline 表（hour×dow×room），
 * 冷却由 NotificationCooldownService 实现，重复告警自动升级（low→medium→high）。
 * 运行态写入 Redis（lastWholeHouseActivity + roomStays，TTL 48h）以便重启/Leader 切换后保留进度。
 */
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../shared/prisma/service';
import {
  loadDismissedIdSet,
  persistDismissedIdSet,
} from '../../../common/crud/dismissed-id-set-persist.util';
import { EventBusService } from '../../../shared/redis/event-bus.service';
import {
  AppConfigService,
  APP_CONFIG_UPDATED,
} from '../../../shared/app-config/service';
import { NotificationCooldownService } from '../../../common/alert-support/notification-cooldown.service';
import { JobRegistryService } from '../../../shared/jobs/registry.service';
import type { HaStateChangeBatchEvent, HaStateChangeEvent } from '../../../shared/types';
import { HA_EVENTS } from '../../../shared/types';
import { forEachColdBatchEvent } from '../../../shared/ha/cold-batch.util';
import { RoomContextService } from '../presence/room-context.service';
import { PresenceService } from '../presence/service';
import { RedisService } from '../../../shared/redis/service';
import { getErrorMessage } from '../../../common/utils';

const ANOMALY_DISMISSED_ID = 'security-anomaly-dismissed';
/** 低于此 activityScore 视为该时段通常无活动 */
const BASELINE_QUIET_THRESHOLD = 0.5;

interface RoomStayRecord {
  room: string;
  enteredAt: number;
  lastMotionAt: number;
  area: 'bedroom' | 'bathroom' | 'kitchen' | 'living' | 'other';
}

/**
 * 异常活动检测服务
 *
 * 监控模式：
 *  1. 卫生间停留过久 (bathroom > 30min) → 老人跌倒风险
 *  2. 卧室长时间无活动 (bedroom 无运动 > 8h 且夜间) → 可能的健康问题
 *  3. 夜间异常活动 (2:00-5:00 检测到活动) → 异常起床/夜游
 *  4. 全屋无活动 (> 预期时段) → 可能外出未归或室内事故
 *  5. 厨房长时间活动后无移动 → 烹饪后异常（燃气未关/晕倒）
 */
@Injectable()
export class AnomalyDetectionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnomalyDetectionService.name);
  private periodicTimer: NodeJS.Timeout | null = null;
  private baselineCache = new Map<string, number>();
  private readonly repeatCounts = new Map<string, number>();
  /** emitAlert 衰减计数用的定时器句柄，模块销毁时统一清理 */
  private readonly alertTimers = new Set<NodeJS.Timeout>();
  /** 最近一次全屋活动时间 Redis 键 */
  private static readonly LAST_ACTIVITY_KEY = 'homeos:anomaly:lastWholeHouseActivity';
  /** 房间停留状态 Redis 键 */
  private static readonly ROOM_STAYS_KEY = 'homeos:anomaly:roomStays';

  constructor(
    private readonly eventBus: EventBusService,
    private readonly appConfig: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly cooldownService: NotificationCooldownService,
    private readonly roomContext: RoomContextService,
    private readonly presence: PresenceService,
    private readonly jobs: JobRegistryService,
    private readonly redis: RedisService,
  ) {}

  private periodicIntervalMs() {
    const min = this.appConfig.get('security').anomalyPeriodicIntervalMin;
    return (min > 0 ? min : 5) * 60_000;
  }

  private restartPeriodicTimer() {
    if (this.periodicTimer) clearInterval(this.periodicTimer);
    this.periodicTimer = setInterval(() => {
      void this.jobs
        .run(
          'anomaly-detection',
          { description: '安防异常活动周期巡检', intervalMs: this.periodicIntervalMs() },
          () => this.checkPeriodic(),
        )
        .catch((err) => {
          this.logger.error(`异常活动周期巡检失败: ${(err as Error).message}`);
        });
    }, this.periodicIntervalMs());
  }

  @OnEvent(APP_CONFIG_UPDATED)
  onConfigUpdated(keys: string[]) {
    if (keys.includes('security')) this.restartPeriodicTimer();
  }

  async onModuleInit() {
    this.dismissedAlerts = await loadDismissedIdSet(this.prisma, ANOMALY_DISMISSED_ID);
    await this.restoreRuntimeState();
    await this.refreshBaselineCache();
    this.restartPeriodicTimer();
    this.logger.log(`异常活动检测周期巡检已启动 (每 ${this.periodicIntervalMs() / 60000} 分钟)`);
  }

  /** 从 Redis 恢复运行态：全屋最近活动时间 + 房间停留记录 */
  private async restoreRuntimeState(): Promise<void> {
    try {
      const [lastRaw, staysRaw] = await Promise.all([
        this.redis.get(AnomalyDetectionService.LAST_ACTIVITY_KEY),
        this.redis.get(AnomalyDetectionService.ROOM_STAYS_KEY),
      ]);
      if (lastRaw) {
        const ts = Number(lastRaw);
        if (Number.isFinite(ts) && ts > 0) this.lastWholeHouseActivity = ts;
      }
      if (staysRaw) {
        const parsed = JSON.parse(staysRaw) as Record<string, RoomStayRecord>;
        for (const [room, stay] of Object.entries(parsed)) {
          if (stay && typeof stay.enteredAt === 'number' && stay.enteredAt > 0) {
            this.roomStays.set(room, stay);
          }
        }
        if (this.roomStays.size > 0) {
          this.logger.log(`已恢复 ${this.roomStays.size} 个房间停留记录`);
        }
      }
    } catch (err) {
      this.logger.debug(`恢复异常检测运行态失败: ${getErrorMessage(err)}`);
    }
  }

  /** 将运行态写入 Redis（TTL 48h，leader 切换/重启后保留安全监测进度） */
  private persistRuntimeState(): void {
    void this.redis
      .set(AnomalyDetectionService.LAST_ACTIVITY_KEY, String(this.lastWholeHouseActivity), 48 * 3600)
      .catch((err) => {
        this.logger.warn(`持久化异常检测活动时间失败: ${getErrorMessage(err)}`);
      });
    void this.redis
      .set(
        AnomalyDetectionService.ROOM_STAYS_KEY,
        JSON.stringify(Object.fromEntries(this.roomStays)),
        48 * 3600,
      )
      .catch((err) => {
        this.logger.warn(`持久化异常检测房间停留失败: ${getErrorMessage(err)}`);
      });
  }

  onModuleDestroy() {
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }
    for (const t of this.alertTimers) clearTimeout(t);
    this.alertTimers.clear();
  }

  private get cfg() {
    return this.appConfig.get('security');
  }

  /** 房间停留追踪 */
  private roomStays = new Map<string, RoomStayRecord>();

  /** 最近一次全屋活动时间 */
  private lastWholeHouseActivity = Date.now();

  /** 用户已确认的告警 ID（条件解除后会自动清除，可再次触发） */
  private dismissedAlerts = new Set<string>();

  /** 告警首次出现时间（稳定 timestamp，避免每次轮询变成「现在」） */
  private alertFirstSeenAt = new Map<string, number>();

  /** 是否夜间 */
  private get isNight(): boolean {
    const h = new Date().getHours();
    return h >= this.cfg.nightStart || h < this.cfg.nightEnd;
  }

  /** 是否深夜 */
  private get isDeepNight(): boolean {
    const h = new Date().getHours();
    return h >= this.cfg.deepNightStart && h < this.cfg.deepNightEnd;
  }

  private async refreshBaselineCache() {
    try {
      const rows = await this.prisma.activityBaseline.findMany({ take: 5000 });
      this.baselineCache.clear();
      for (const r of rows) {
        this.baselineCache.set(`${r.room}|${r.hour}|${r.dow}`, r.activityScore);
      }
    } catch (err) {
      this.logger.debug(`活动基线缓存刷新失败: ${(err as Error).message}`);
    }
  }

  private baselineScore(
    room: string,
    hour = new Date().getHours(),
    dow = new Date().getDay(),
  ): number | null {
    return this.baselineCache.get(`${room}|${hour}|${dow}`) ?? null;
  }

  /** 该房间在当前时段基线活跃度是否偏低（非常规活动时段） */
  private isUnexpectedRoomActivity(room: string): boolean {
    const score = this.baselineScore(room);
    if (score == null) return true;
    return score < BASELINE_QUIET_THRESHOLD;
  }

  /** 当前 hour×dow 全屋基线是否处于低活动期 */
  private isExpectedQuietPeriod(): boolean {
    const hour = new Date().getHours();
    const dow = new Date().getDay();
    let total = 0;
    let count = 0;
    for (const [key, score] of this.baselineCache) {
      const [, h, d] = key.split('|');
      if (Number(h) === hour && Number(d) === dow) {
        total += score;
        count++;
      }
    }
    if (count === 0) return false;
    return total / count < BASELINE_QUIET_THRESHOLD;
  }

  @OnEvent('presence.roomChanged')
  handleRoomChange(data: { room: string; occupied: boolean; sensor: string }) {
    const now = Date.now();
    const room = data.room;

    if (data.occupied) {
      const area = this.classifyArea(data.room);
      this.roomStays.set(room, {
        room,
        enteredAt: now,
        lastMotionAt: now,
        area,
      });
      this.lastWholeHouseActivity = now;
      this.persistRuntimeState();
      this.logger.debug(`📍 进入 ${room} (${area})`);
    } else {
      const stay = this.roomStays.get(room);
      if (stay) {
        const duration = (now - stay.enteredAt) / 1000;
        const durationMin = Math.round(duration / 60);
        const snapshot = this.roomContext.getSnapshot();
        const anyoneHome = this.presence.isAnyoneHome() || snapshot.anyoneHome;

        if (stay.area === 'bathroom' && duration > this.cfg.bathroomLongStayHighMin * 60) {
          let level: 'high' | 'medium' = 'high';
          if (!anyoneHome) level = 'high';
          this.emitAlert('bathroom_long_stay', `卫生间停留 ${durationMin} 分钟，可能跌倒`, level);
        } else if (stay.area === 'bathroom' && duration > this.cfg.bathroomLongStayMediumMin * 60) {
          let level: 'high' | 'medium' = 'medium';
          if (!anyoneHome) level = 'high';
          this.emitAlert('bathroom_warning', `卫生间停留 ${durationMin} 分钟，建议查看`, level);
        }

        this.roomStays.delete(room);
        this.persistRuntimeState();
      }
    }
  }

  @OnEvent(HA_EVENTS.STATE_CHANGED_COLD_BATCH)
  handleMotion(payload: HaStateChangeBatchEvent) {
    forEachColdBatchEvent(payload, (event) => {
      const snap = { entity_id: event?.entity_id, new_state: event?.new_state };
      setImmediate(() => this._handleMotion(snap));
    });
  }

  private _handleMotion(event: Pick<HaStateChangeEvent, 'entity_id' | 'new_state'>) {
    const entityId: string = event?.entity_id || '';
    const state = event?.new_state?.state;

    if (state === 'on' && entityId.startsWith('binary_sensor.') && entityId.includes('motion')) {
      const now = Date.now();
      this.lastWholeHouseActivity = now;
      this.persistRuntimeState();

      // 优先按 HA area 解析房间（关键词兜底），再回退到停留记录的名称/区域匹配
      const resolvedRoom = this.roomContext.resolveRoom(entityId, event?.new_state?.attributes);
      for (const [room, stay] of this.roomStays) {
        if (
          (resolvedRoom && resolvedRoom === room) ||
          entityId.includes(room) ||
          entityId.includes(stay.area)
        ) {
          stay.lastMotionAt = now;
        }
      }

      if (this.isDeepNight) {
        if (resolvedRoom && this.isUnexpectedRoomActivity(resolvedRoom)) {
          this.emitAlert('deep_night_activity', `深夜检测到活动: ${entityId}`, 'low');
        }
      }
    }
  }

  /**
   * 定时检查（由 cron 或 setInterval 触发）
   */
  async checkPeriodic() {
    await this.refreshBaselineCache();
    const now = Date.now();
    const snapshot = this.roomContext.getSnapshot();

    if (this.isNight) {
      for (const [room, stay] of this.roomStays) {
        const inactiveSec = (now - stay.lastMotionAt) / 1000;
        const ctxOccupied = snapshot.rooms[room]?.occupied ?? false;
        if (
          stay.area === 'bedroom' &&
          ctxOccupied &&
          inactiveSec > this.cfg.bedroomInactiveHours * 3600
        ) {
          const baseline = this.baselineScore('bedroom');
          if (baseline == null || baseline >= BASELINE_QUIET_THRESHOLD) {
            this.emitAlert(
              'bedroom_inactive',
              `卧室 ${room} ${this.cfg.bedroomInactiveHours}小时无活动`,
              'high',
            );
          }
        }
      }
    }

    const wholeHouseInactiveMin = Math.round((now - this.lastWholeHouseActivity) / 60000);
    const expectedActiveHours = this.isNight
      ? this.cfg.wholeHouseInactiveNightHours
      : this.cfg.wholeHouseInactiveDayHours;
    if (wholeHouseInactiveMin > expectedActiveHours * 60 && !this.isExpectedQuietPeriod()) {
      this.emitAlert('whole_house_inactive', `全屋 ${wholeHouseInactiveMin} 分钟无活动`, 'high');
    }

    for (const [, stay] of this.roomStays) {
      if (stay.area === 'kitchen') {
        const kitchenStaySec = (now - stay.enteredAt) / 1000;
        if (kitchenStaySec > this.cfg.kitchenStayWarnMin * 60) {
          const mins = this.cfg.kitchenStayWarnMin;
          this.emitAlert('kitchen_long_stay', `厨房停留超过 ${mins} 分钟，请检查燃气`, 'high');
        }
      }
      if (stay.area === 'bathroom') {
        const bathroomStaySec = (now - stay.enteredAt) / 1000;
        const durationMin = Math.round(bathroomStaySec / 60);
        const anyoneHome = this.presence.isAnyoneHome() || snapshot.anyoneHome;
        if (bathroomStaySec > this.cfg.bathroomLongStayHighMin * 60) {
          this.emitAlert(
            'bathroom_long_stay',
            `卫生间停留 ${durationMin} 分钟，可能跌倒`,
            'high',
          );
        } else if (bathroomStaySec > this.cfg.bathroomLongStayMediumMin * 60) {
          this.emitAlert(
            'bathroom_warning',
            `卫生间停留 ${durationMin} 分钟，建议查看`,
            anyoneHome ? 'medium' : 'high',
          );
        }
      }
    }
  }

  private classifyArea(room: string): RoomStayRecord['area'] {
    const r = room.toLowerCase();
    if (r.includes('bed') || r.includes('卧')) return 'bedroom';
    if (r.includes('bath') || r.includes('浴') || r.includes('卫') || r.includes('厕'))
      return 'bathroom';
    if (r.includes('kitchen') || r.includes('厨')) return 'kitchen';
    if (r.includes('living') || r.includes('客')) return 'living';
    return 'other';
  }

  private emitAlert(type: string, message: string, level: string) {
    const count = (this.repeatCounts.get(type) || 0) + 1;
    this.repeatCounts.set(type, count);
    // 冷却窗口结束后衰减计数，便于再次升级判断
    const timer = setTimeout(
      () => {
        this.alertTimers.delete(timer);
        const cur = this.repeatCounts.get(type) || 0;
        if (cur <= 1) this.repeatCounts.delete(type);
        else this.repeatCounts.set(type, cur - 1);
      },
      Math.max(60_000, this.cfg.anomalyCooldownMin * 60_000),
    );
    this.alertTimers.add(timer);

    let effectiveLevel = level;
    if (count >= 3) effectiveLevel = 'high';
    else if (count >= 2 && (level === 'low' || level === 'medium')) effectiveLevel = 'medium';

    // 首次 / 升级为 high 时可突破普通冷却再推一次
    const escalate = effectiveLevel === 'high' && count >= 3;
    if (!escalate && this.cooldownService.isInCooldown('security', type)) return;

    this.cooldownService.setCooldown(
      'security',
      type,
      escalate ? Math.max(1, Math.floor(this.cfg.anomalyCooldownMin / 2)) : this.cfg.anomalyCooldownMin,
    );

    this.logger.warn(`⚠️ 异常检测 [${effectiveLevel}] x${count}: ${message}`);
    this.eventBus.emit('security.alarm', {
      type,
      message: count >= 2 ? `${message}（第 ${count} 次）` : message,
      level: effectiveLevel,
      repeatCount: count,
      timestamp: new Date().toISOString(),
    });
  }

  private persistDismissed() {
    persistDismissedIdSet(
      this.logger,
      '异常检测已确认告警持久化',
      this.prisma,
      ANOMALY_DISMISSED_ID,
      this.dismissedAlerts,
    );
  }

  ackAlerts(ids: string[]) {
    for (const id of ids) {
      if (id?.trim()) this.dismissedAlerts.add(id.trim());
    }
    this.persistDismissed();
    return { ok: true, dismissed: ids.length };
  }

  private computeActiveAlerts(statusData: {
    roomStays: Array<{ room: string; area: string; durationMin: number; inactiveMin: number }>;
    wholeHouseInactiveMin: number;
    anyoneHome: boolean;
  }) {
    const cfg = this.cfg;
    const result: Array<{ id: string; level: string; message: string; timestamp: string }> = [];
    const areaLabels: Record<string, string> = {
      bedroom: '卧室',
      bathroom: '卫生间',
      kitchen: '厨房',
      living: '客厅',
      other: '其他区域',
    };
    const fmt = (min: number) => {
      if (min < 1) return '刚刚';
      if (min < 60) return `${Math.round(min)} 分钟`;
      const h = Math.floor(min / 60);
      const m = Math.round(min % 60);
      return m > 0 ? `${h}时${m}分` : `${h} 小时`;
    };
    const pushAlert = (id: string, level: string, message: string) => {
      const first = this.alertFirstSeenAt.get(id) ?? Date.now();
      if (!this.alertFirstSeenAt.has(id)) this.alertFirstSeenAt.set(id, first);
      result.push({
        id,
        level,
        message,
        timestamp: new Date(first).toISOString(),
      });
    };

    for (const s of statusData.roomStays) {
      if (s.area === 'bathroom' && s.durationMin > cfg.bathroomLongStayHighMin) {
        pushAlert(`bath_${s.room}`, 'high', `卫生间停留 ${fmt(s.durationMin)}，请检查人员安全`);
      } else if (s.area === 'bathroom' && s.durationMin > cfg.bathroomLongStayMediumMin) {
        const level = !statusData.anyoneHome ? 'high' : 'medium';
        pushAlert(`bath_warn_${s.room}`, level, `卫生间停留 ${fmt(s.durationMin)}，建议查看`);
      }
      if (s.area === 'kitchen' && s.durationMin > cfg.kitchenStayWarnMin) {
        pushAlert(
          `kitchen_${s.room}`,
          'high',
          `厨房停留超过 ${cfg.kitchenStayWarnMin} 分钟，请检查燃气`,
        );
      }
      if (s.inactiveMin > cfg.bedroomInactiveHours * 60 && s.area === 'bedroom') {
        pushAlert(
          `bed_inactive_${s.room}`,
          'medium',
          `${areaLabels[s.area] || s.room} ${fmt(s.inactiveMin)} 无活动`,
        );
      }
    }

    const nightThresholdMin = cfg.wholeHouseInactiveNightHours * 60;
    const dayThresholdMin = cfg.wholeHouseInactiveDayHours * 60;
    const thresholdMin = this.isNight ? nightThresholdMin : dayThresholdMin;
    if (statusData.wholeHouseInactiveMin > thresholdMin) {
      pushAlert('whole_inactive', 'high', `全屋 ${fmt(statusData.wholeHouseInactiveMin)} 无活动`);
    } else if (statusData.wholeHouseInactiveMin > thresholdMin * 0.5) {
      pushAlert(
        'whole_inactive_warn',
        'medium',
        `全屋 ${fmt(statusData.wholeHouseInactiveMin)} 无活动`,
      );
    }

    // 条件已解除的告警从 dismissed / firstSeen 中移除，便于下次再触发
    const activeIds = new Set(result.map((a) => a.id));
    let dismissedChanged = false;
    for (const id of [...this.dismissedAlerts]) {
      if (!activeIds.has(id)) {
        this.dismissedAlerts.delete(id);
        dismissedChanged = true;
      }
    }
    if (dismissedChanged) this.persistDismissed();
    for (const id of [...this.alertFirstSeenAt.keys()]) {
      if (!activeIds.has(id)) this.alertFirstSeenAt.delete(id);
    }

    return result.filter((a) => !this.dismissedAlerts.has(a.id));
  }

  async getBaselinesSummary() {
    const rows = await this.prisma.activityBaseline.findMany({
      orderBy: [{ room: 'asc' }, { dow: 'asc' }, { hour: 'asc' }],
      take: 5000,
    });
    const byRoom: Record<
      string,
      Array<{ hour: number; dow: number; activityScore: number; sampleCount: number }>
    > = {};
    for (const r of rows) {
      if (!byRoom[r.room]) byRoom[r.room] = [];
      byRoom[r.room].push({
        hour: r.hour,
        dow: r.dow,
        activityScore: r.activityScore,
        sampleCount: r.sampleCount,
      });
    }
    return {
      roomCount: Object.keys(byRoom).length,
      bucketCount: rows.length,
      cachedBuckets: this.baselineCache.size,
      quietThreshold: BASELINE_QUIET_THRESHOLD,
      rooms: byRoom,
    };
  }

  getStatus() {
    const now = Date.now();
    const snapshot = this.roomContext.getSnapshot();
    const roomStays = [...this.roomStays.entries()].map(([room, stay]) => ({
      room,
      area: stay.area,
      durationMin: Math.round((now - stay.enteredAt) / 60000),
      inactiveMin: Math.round((now - stay.lastMotionAt) / 60000),
      occupied: snapshot.rooms[room]?.occupied ?? false,
    }));
    const wholeHouseInactiveMin = Math.round((now - this.lastWholeHouseActivity) / 60000);
    const anyoneHome = this.presence.isAnyoneHome() || snapshot.anyoneHome;
    const base = {
      roomStays,
      wholeHouseInactiveMin,
      lastWholeHouseActivity: new Date(this.lastWholeHouseActivity).toISOString(),
      anyoneHome,
      roomContext: snapshot,
    };
    return {
      ...base,
      activeAlerts: this.computeActiveAlerts({ roomStays, wholeHouseInactiveMin, anyoneHome }),
    };
  }
}
