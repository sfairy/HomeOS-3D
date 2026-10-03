/**
 * @file away-simulation.service.ts
 * @module backend/src/modules
 *
 * 离家模拟（度假防盗）服务：在设定活跃时段内按学习到的 hour×dow 开灯概率
 * 随机切换灯具 / 窗帘，模拟有人在家。
 *
 * 工作机制：
 * - 学习数据来自 AwayPatternBucket 表（dow × hour × lightOnProb）。
 * - 每次切换前先回收上次动作（灯关 → 再开新的；窗帘反向动作 → 再切新的）。
 * - 仅 Leader 实例执行实际 HA 调用，Follower 同步状态等待接管。
 * - 运行态写入 Redis（AWAY_SIM_STATE_KEY）以便重启 / Leader 漂移后无缝恢复。
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { HaConnectorService } from '../../ha-connector/service';
import { HaWsLeaderService } from '../../ha-connector/ha-ws-leader.service';
import { EventBusService } from '../../../shared/redis/event-bus.service';
import { RedisService } from '../../../shared/redis/service';
import { PrismaService } from '../../../shared/prisma/service';
import { scheduleSecurityEvent } from '../../../common/http-security/hazard.util';
import { getErrorMessage } from '../../../common/utils';
import { AppConfigService } from '../../../shared/app-config/service';
import { HOMEOS_EVENTS } from '../../../shared/homeos-events';

interface AwayPatternRow {
  dow: number;
  hour: number;
  lightOnProb: number;
}

/** Redis 持久化键：离家模拟运行态（跨实例/重启恢复） */
const AWAY_SIM_STATE_KEY = 'homeos:away-sim:state';

interface AwaySimPersistedState {
  enabled: boolean;
  startedAt: string;
  activeStartHour: number;
  activeEndHour: number;
  lightPool: string[];
  coverPool: string[];
  lastToggled: string | null;
  lastCoverToggled: string | null;
  lastCoverAction: string | null;
}

interface AwaySimSyncPayload extends Partial<AwaySimPersistedState> {
  enabled: boolean;
  timestamp?: string;
}

/**
 * 离家模拟（度假防盗）服务
 *
 * 启用后在设定的活跃时段内，按学习到的 hour×dow 开灯概率模拟有人在家。
 */
@Injectable()
export class AwaySimulationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AwaySimulationService.name);
  private enabled = false;
  private timer: NodeJS.Timeout | null = null;
  private lightPool: string[] = [];
  private coverPool: string[] = [];
  private lastToggled: string | null = null;
  private lastCoverToggled: string | null = null;
  /** 最近一次窗帘动作方向（open_cover / close_cover），用于停用/切换时反向回收 */
  private lastCoverAction: string | null = null;
  private startedAt = '';
  private patternBuckets = new Map<string, AwayPatternRow>();

  private activeStartHour = 18;
  private activeEndHour = 23;

  constructor(
    private readonly haConnector: HaConnectorService,
    private readonly haLeader: HaWsLeaderService,
    private readonly eventBus: EventBusService,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly appConfig: AppConfigService,
  ) {}

  async onModuleInit() {
    await this.restoreState();
  }

  /**
   * 从 Redis 恢复离家模拟运行态，避免重启/Leader 漂移后防盗模拟静默失效。
   *
   * Redis 不可用或未持久化时不阻断启动，仅按默认状态运行。
   */
  private async restoreState() {
    try {
      if (!this.redis.isReady()) return;
      const raw = await this.redis.get(AWAY_SIM_STATE_KEY);
      if (!raw) return;
      const state = JSON.parse(raw) as AwaySimPersistedState;
      if (!state.enabled) return;
      this.enabled = true;
      this.startedAt = state.startedAt ?? '';
      if (typeof state.activeStartHour === 'number') this.activeStartHour = state.activeStartHour;
      if (typeof state.activeEndHour === 'number') this.activeEndHour = state.activeEndHour;
      this.lightPool = Array.isArray(state.lightPool) ? state.lightPool : [];
      this.coverPool = Array.isArray(state.coverPool) ? state.coverPool : [];
      this.lastToggled = state.lastToggled ?? null;
      this.lastCoverToggled = state.lastCoverToggled ?? null;
      this.lastCoverAction = state.lastCoverAction ?? null;
      await this.loadPatternBuckets();
      this.scheduleNext();
      this.logger.log(
        `离家模拟已从 Redis 恢复运行态(灯具池 ${this.lightPool.length},窗帘池 ${this.coverPool.length})`,
      );
    } catch (err) {
      this.logger.warn(`恢复离家模拟运行态失败: ${getErrorMessage(err)}`);
    }
  }

  private persistState() {
    if (!this.redis.isReady()) return;
    const state: AwaySimPersistedState = {
      enabled: this.enabled,
      startedAt: this.startedAt,
      activeStartHour: this.activeStartHour,
      activeEndHour: this.activeEndHour,
      lightPool: this.lightPool,
      coverPool: this.coverPool,
      lastToggled: this.lastToggled,
      lastCoverToggled: this.lastCoverToggled,
      lastCoverAction: this.lastCoverAction,
    };
    void this.redis
      .set(AWAY_SIM_STATE_KEY, JSON.stringify(state))
      .catch((err) => this.logger.warn(`持久化离家模拟运行态失败: ${getErrorMessage(err)}`));
  }

  private clearPersistedState() {
    if (!this.redis.isReady()) return;
    void this.redis
      .set(AWAY_SIM_STATE_KEY, JSON.stringify({ enabled: false }), 60)
      .catch((err) => this.logger.warn(`清除离家模拟运行态失败: ${getErrorMessage(err)}`));
  }

  onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }

  /**
   * 处理跨实例同步的离家模拟启停广播：让所有实例持有一致的运行态，
   * 实际动作仅由 Leader 执行（tick 内门控），Leader 漂移后新 Leader 无缝接管。
   */
  @OnEvent(HOMEOS_EVENTS.SECURITY_AWAY_SIMULATION)
  handleAwaySimSync(payload?: AwaySimSyncPayload) {
    if (!payload || typeof payload.enabled !== 'boolean') return;
    if (payload.enabled) {
      this.enabled = true;
      if (payload.startedAt) this.startedAt = payload.startedAt;
      if (typeof payload.activeStartHour === 'number') this.activeStartHour = payload.activeStartHour;
      if (typeof payload.activeEndHour === 'number') this.activeEndHour = payload.activeEndHour;
      if (Array.isArray(payload.lightPool)) this.lightPool = payload.lightPool;
      if (Array.isArray(payload.coverPool)) this.coverPool = payload.coverPool;
      if (payload.lastToggled !== undefined) this.lastToggled = payload.lastToggled;
      if (payload.lastCoverToggled !== undefined) this.lastCoverToggled = payload.lastCoverToggled;
      if (payload.lastCoverAction !== undefined) this.lastCoverAction = payload.lastCoverAction;
      this.scheduleNext();
    } else {
      this.enabled = false;
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      this.lastToggled = null;
      this.lastCoverToggled = null;
      this.lastCoverAction = null;
    }
  }

  private intervalRangeMs(): { min: number; max: number } {
    const sec = this.appConfig.get('security');
    const minMin = sec.awaySimIntervalMinMax?.min ?? 8;
    const maxMin = sec.awaySimIntervalMinMax?.max ?? 25;
    return { min: minMin * 60_000, max: maxMin * 60_000 };
  }

  getStatus() {
    const iv = this.intervalRangeMs();
    return {
      enabled: this.enabled,
      startedAt: this.startedAt,
      activeStartHour: this.activeStartHour,
      activeEndHour: this.activeEndHour,
      poolSize: this.lightPool.length,
      coverPoolSize: this.coverPool.length,
      patternBucketCount: this.patternBuckets.size,
      intervalMin: { min: iv.min / 60_000, max: iv.max / 60_000 },
      lastToggled: this.lastToggled,
      lastCoverToggled: this.lastCoverToggled,
    };
  }

  async getLearnedPattern() {
    const rows = await this.prisma.awayPatternBucket.findMany({
      orderBy: [{ dow: 'asc' }, { hour: 'asc' }],
      take: 500,
    });
    return {
      bucketCount: rows.length,
      loadedInMemory: this.patternBuckets.size,
      buckets: rows.map((r) => ({
        dow: r.dow,
        hour: r.hour,
        lightOnProb: r.lightOnProb,
        sampleCount: r.sampleCount,
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  }

  private async loadPatternBuckets() {
    try {
      const rows = await this.prisma.awayPatternBucket.findMany({ take: 500 });
      this.patternBuckets.clear();
      for (const r of rows) {
        this.patternBuckets.set(`${r.dow}|${r.hour}`, {
          dow: r.dow,
          hour: r.hour,
          lightOnProb: r.lightOnProb,
        });
      }
      this.logger.log(`离家模拟已加载 ${rows.length} 个 hour×dow 模式桶`);
    } catch (err) {
      this.logger.warn(`加载 AwayPatternBucket 失败: ${getErrorMessage(err)}`);
    }
  }

  private currentBucket(): AwayPatternRow | null {
    const now = new Date();
    return this.patternBuckets.get(`${now.getDay()}|${now.getHours()}`) ?? null;
  }

  async enable(opts?: {
    lights?: string[];
    covers?: string[];
    activeStartHour?: number;
    activeEndHour?: number;
  }) {
    if (opts?.activeStartHour != null) this.activeStartHour = opts.activeStartHour;
    if (opts?.activeEndHour != null) this.activeEndHour = opts.activeEndHour;

    await this.loadPatternBuckets();

    if (opts?.lights?.length) {
      this.lightPool = opts.lights;
    } else {
      try {
        const lights = await this.haConnector.fetchEntitiesByDomain('light');
        this.lightPool = lights.map((l) => l.entity_id);
      } catch (err) {
        const msg = getErrorMessage(err);
        this.logger.warn(`获取灯具列表失败: ${msg}`);
        scheduleSecurityEvent(
          this.prisma,
          this.logger,
          'away_sim_enable_failed',
          `离家模拟启用失败（无法获取灯具列表）: ${msg}`,
        );
        this.lightPool = [];
      }
    }

    if (opts?.covers?.length) {
      this.coverPool = opts.covers;
    } else {
      try {
        const covers = await this.haConnector.fetchEntitiesByDomain('cover');
        this.coverPool = covers.map((c) => c.entity_id);
      } catch {
        this.coverPool = [];
      }
    }

    this.enabled = true;
    this.startedAt = new Date().toISOString();
    this.logger.log(
      `离家模拟已启用,灯具池 ${this.lightPool.length} 个,窗帘池 ${this.coverPool.length} 个,活跃时段 ${this.activeStartHour}:00-${this.activeEndHour}:00`,
    );
    this.scheduleNext();
    this.persistState();
    this.eventBus.emit(HOMEOS_EVENTS.SECURITY_AWAY_SIMULATION, {
      enabled: true,
      timestamp: this.startedAt,
      activeStartHour: this.activeStartHour,
      activeEndHour: this.activeEndHour,
      lightPool: this.lightPool,
      coverPool: this.coverPool,
      lastToggled: this.lastToggled,
      lastCoverToggled: this.lastCoverToggled,
      lastCoverAction: this.lastCoverAction,
    });
    return this.getStatus();
  }

  async disable() {
    this.enabled = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.lastToggled) {
      try {
        await this.haConnector.callService('light', 'turn_off', this.lastToggled, {});
      } catch (err) {
        scheduleSecurityEvent(
          this.prisma,
          this.logger,
          'away_sim_action_failed',
          `离家模拟停用关灯失败 [${this.lastToggled}]: ${getErrorMessage(err)}`,
          { entityId: this.lastToggled },
        );
      }
      this.lastToggled = null;
    }
    // A5：停用离家模拟时固定回收上次切换的窗帘（关闭），并清空方向记录
    if (this.lastCoverToggled) {
      try {
        await this.haConnector.callService('cover', 'close_cover', this.lastCoverToggled, {});
        this.logger.debug(`离家模拟停用:关闭窗帘 ${this.lastCoverToggled}`);
      } catch (err) {
        scheduleSecurityEvent(
          this.prisma,
          this.logger,
          'away_sim_action_failed',
          `离家模拟停用关窗帘失败 [${this.lastCoverToggled}]: ${getErrorMessage(err)}`,
          { entityId: this.lastCoverToggled },
        );
      }
      this.lastCoverToggled = null;
      this.lastCoverAction = null;
    }
    this.logger.log('离家模拟已停用');
    this.clearPersistedState();
    this.eventBus.emit(HOMEOS_EVENTS.SECURITY_AWAY_SIMULATION, {
      enabled: false,
      timestamp: new Date().toISOString(),
    });
    return this.getStatus();
  }

  private scheduleNext() {
    if (this.timer) clearTimeout(this.timer);
    const { min, max } = this.intervalRangeMs();
    const delay = min + Math.random() * (max - min);
    this.timer = setTimeout(() => void this.tick(), delay);
  }

  private isActiveHour(): boolean {
    const h = new Date().getHours();
    if (this.activeStartHour <= this.activeEndHour) {
      return h >= this.activeStartHour && h < this.activeEndHour;
    }
    return h >= this.activeStartHour || h < this.activeEndHour;
  }

  private shouldToggleLight(): boolean {
    const bucket = this.currentBucket();
    if (!bucket) return Math.random() < 0.5;
    return Math.random() < bucket.lightOnProb;
  }

  private async tick() {
    if (!this.enabled) return;
    // 多实例下仅 Leader 执行模拟动作，其余实例保持状态同步等待接管
    if (!this.haLeader.isHaWsLeader()) {
      this.scheduleNext();
      return;
    }
    try {
      if (this.isActiveHour() && this.lightPool.length > 0 && this.shouldToggleLight()) {
        if (this.lastToggled) {
          try {
            await this.haConnector.callService('light', 'turn_off', this.lastToggled, {});
          } catch (err) {
            scheduleSecurityEvent(
              this.prisma,
              this.logger,
              'away_sim_action_failed',
              `离家模拟关灯失败 [${this.lastToggled}]: ${getErrorMessage(err)}`,
              { entityId: this.lastToggled },
            );
          }
        }
        const next = this.lightPool[Math.floor(Math.random() * this.lightPool.length)];
        const sec = this.appConfig.get('security');
        const brightness =
          sec.awaySimBrightnessMin + Math.floor(Math.random() * sec.awaySimBrightnessRange);
        try {
          await this.haConnector.callService('light', 'turn_on', next, {
            brightness_pct: brightness,
          });
          this.lastToggled = next;
          this.logger.debug(`离家模拟:点亮 ${next} (${brightness}%)`);
        } catch (err) {
          scheduleSecurityEvent(
            this.prisma,
            this.logger,
            'away_sim_action_failed',
            `离家模拟点灯失败 [${next}]: ${getErrorMessage(err)}`,
            { entityId: next },
          );
        }
      } else if (!this.isActiveHour() && this.lastToggled) {
        try {
          await this.haConnector.callService('light', 'turn_off', this.lastToggled, {});
        } catch (err) {
          scheduleSecurityEvent(
            this.prisma,
            this.logger,
            'away_sim_action_failed',
            `离家模拟非活跃时段关灯失败 [${this.lastToggled}]: ${getErrorMessage(err)}`,
            { entityId: this.lastToggled },
          );
        }
        this.lastToggled = null;
      }

      const bucket = this.currentBucket();
      if (this.isActiveHour() && this.coverPool.length > 0 && bucket && bucket.lightOnProb > 0.3) {
        // 与灯分支“先回收上次状态再切换”对齐：先对上次切换的窗帘执行反向动作，
        // 使其恢复到上一次切换前的状态，再随机切换新的窗帘
        if (this.lastCoverToggled && this.lastCoverAction) {
          const revertService =
            this.lastCoverAction === 'open_cover' ? 'close_cover' : 'open_cover';
          try {
            await this.haConnector.callService('cover', revertService, this.lastCoverToggled, {});
            this.logger.debug(`离家模拟:回收 ${revertService} ${this.lastCoverToggled}`);
          } catch (err) {
            scheduleSecurityEvent(
              this.prisma,
              this.logger,
              'away_sim_action_failed',
              `离家模拟窗帘回收失败 [${this.lastCoverToggled}]: ${getErrorMessage(err)}`,
              { entityId: this.lastCoverToggled },
            );
          }
        }
        const cover = this.coverPool[Math.floor(Math.random() * this.coverPool.length)];
        const openCover = Math.random() < 0.5;
        const service = openCover ? 'open_cover' : 'close_cover';
        try {
          await this.haConnector.callService('cover', service, cover, {});
          this.lastCoverToggled = cover;
          this.lastCoverAction = service;
          this.logger.debug(`离家模拟:${service} ${cover}`);
        } catch (err) {
          scheduleSecurityEvent(
            this.prisma,
            this.logger,
            'away_sim_action_failed',
            `离家模拟窗帘操作失败 [${cover}]: ${getErrorMessage(err)}`,
            { entityId: cover },
          );
        }
      }
    } catch (err) {
      this.logger.warn(`离家模拟执行失败: ${getErrorMessage(err)}`);
    } finally {
      if (this.enabled) this.scheduleNext();
    }
  }
}
