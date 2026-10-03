/**
 * 儿童模式服务
 *
 * 模块：system/lifestyle
 * 职责：
 *  - 白名单 + 时间窗：非白名单设备一律拦截；白名单设备仅在允许时段内可用，窗外强制关闭
 *  - 媒体时长限制：累计媒体播放时长超过上限后自动关闭
 *  - 实时拦截：白名单设备在允许时段外被打开会被立即关闭
 *
 * 依赖：
 *  - HaConnectorService：调用 HA 服务关闭受限设备
 *  - EventBusService：广播 childMode.* 事件
 *  - PrismaService：运行时持久化（mediaUsedMin / overrideUntil）
 *  - AppConfigService：儿童模式配置（enabled / 白名单 / 时间窗）
 *  - HaStateChangeRouterService：HA 状态变更路由（按订阅分发）
 *  - HaWsLeaderService：仅 leader 节点执行拦截逻辑，避免多实例重复关设备
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { getEntityDomain } from '@homeos/shared';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../shared/prisma/service';
import { AppConfigService, APP_CONFIG_UPDATED } from '../../shared/app-config/service';
import { HaConnectorService } from '../ha-connector/service';
import { HA_EVENTS } from '../../shared/types';
import type { HaStateChangeBatchEvent } from '../../shared/types';
import { coldBatchChanges } from '../../shared/ha/cold-batch.util';
import { EventBusService } from '../../shared/redis/event-bus.service';
import { JobRegistryService } from '../../shared/jobs/registry.service';
import { getErrorMessage, localDateKey } from '../../common/utils';
import { HaStateChangeRouterService } from '../../shared/ha/state-change-router.service';
import { HaWsLeaderService } from '../ha-connector/ha-ws-leader.service';
import { scheduleBackgroundTask } from '../../common/resilience/circuit-breaker.helper';

/**
 * 儿童模式时间窗适用日期维度：
 *  - number[]：0-6 星期几数组（0=周日）
 *  - 'weekday'：周一至周五
 *  - 'weekend'：周六与周日
 */
type ChildModeDays = number[] | 'weekday' | 'weekend';

/**
 * 儿童模式允许使用白名单设备的时间窗。
 * 例：{ days: 'weekday', start: '19:00', end: '21:00' } 表示工作日 19:00-21:00 可看电视。
 */
interface ChildModeTimeWindow {
  /** 适用日期维度 */
  days: ChildModeDays;
  /** 开始时间 HH:mm（24 小时制） */
  start: string;
  /** 结束时间 HH:mm（24 小时制），支持跨午夜（如 21:00-07:00） */
  end: string;
}

/**
 * 儿童模式运行时配置
 */
interface ChildModeConfig {
  /** 是否启用儿童模式 */
  enabled: boolean;
  /** 媒体每日可用时长（分钟），0 = 不限制 */
  dailyMediaLimitMin: number;
  /** 设备白名单（entity_id 列表）；非空时启用「白名单 + 时间窗」模式 */
  deviceWhitelist: string[];
  /** 白名单设备允许使用的时间窗数组 */
  timeWindows: ChildModeTimeWindow[];
}

const CHILD_MODE_RUNTIME_ID = 'default';

/**
 * 儿童模式服务
 *
 * - 白名单 + 时间窗：非白名单设备一律拦截；白名单设备仅在允许时段内可用，窗外强制关闭
 * - 媒体时长限制：累计媒体播放时长超过上限后自动关闭
 * - 实时拦截：白名单设备在允许时段外被打开会被立即关闭
 *
 * 该 Service 由 ChildModeModule 提供，并被 SystemController / 自动化引擎等调用。
 */
@Injectable()
export class ChildModeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChildModeService.name);
  /** 周期性强制执行句柄；仅在 enabled 时启动 */
  private timer: NodeJS.Timeout | null = null;
  /** 儿童模式周期性检查间隔（毫秒） */
  private readonly CHECK_INTERVAL_MS = 60_000;

  private config: ChildModeConfig = {
    enabled: false,
    dailyMediaLimitMin: 0,
    deviceWhitelist: [],
    timeWindows: [],
  };

  /** 当日媒体累计已用时长（分钟），跨日由 resetDailyIfNeeded 清零 */
  private mediaUsedMin = 0;
  /** 当前累计时长所属日期（YYYY-MM-DD），用于跨日重置 */
  private usageDate = '';
  /** 各媒体播放器进入 playing 状态的时间戳（ms），用于增量累计在播时长 */
  private mediaPlayingSince = new Map<string, number>();
  /** 家长临时 override 截止时间戳（毫秒） */
  private overrideUntil = 0;
  /**
   * @param haConnector HA 服务调用入口（关闭设备）
   * @param eventBus    跨实例事件总线（广播 childMode.override / changed / blocked 等）
   * @param prisma      持久化访问
   * @param stateRouter HA 状态变更路由器，决定本实例是否处理该事件
   * @param haLeader    HA WebSocket leader 选举，仅 leader 节点执行拦截
   */
  constructor(
    private readonly haConnector: HaConnectorService,
    private readonly eventBus: EventBusService,
    private readonly prisma: PrismaService,
    private readonly appConfig: AppConfigService,
    private readonly stateRouter: HaStateChangeRouterService,
    private readonly haLeader: HaWsLeaderService,
    private readonly jobs: JobRegistryService,
  ) {}

  /**
   * 模块初始化时加载持久化状态；若上次处于启用状态则恢复周期定时器。
   */
  async onModuleInit() {
    await this.loadPersistedState();
  }

  /**
   * 从 AppConfig.childMode 恢复配置，从 ChildModeRuntime 恢复媒体时长 / override。
   * 启用状态下重新启动 enforce 周期定时器。
   */
  private async loadPersistedState() {
    this.mergeConfig(this.appConfig.get('childMode'));
    try {
      const row = await this.prisma.childModeRuntime.findUnique({
        where: { id: CHILD_MODE_RUNTIME_ID },
      });
      if (row) {
        this.mediaUsedMin = row.mediaUsedMin;
        this.usageDate = row.usageDate;
        this.overrideUntil = Number(row.overrideUntil);
      }
    } catch (err) {
      this.logger.warn(`加载儿童模式运行时失败: ${getErrorMessage(err)}`);
    }
    if (this.config.enabled) {
      this.startEnforceTimer();
    }
  }

  @OnEvent(APP_CONFIG_UPDATED)
  onAppConfigUpdated(sections: string[]) {
    if (sections?.length && !sections.includes('childMode')) return;
    this.applyConfig(this.appConfig.get('childMode'), { persist: false });
  }

  /** 启动儿童模式 enforce 周期定时器（带作业监控） */
  private startEnforceTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      void this.jobs.run(
        'child-mode-enforce',
        { description: '儿童模式设备规则执行', intervalMs: this.CHECK_INTERVAL_MS },
        () => this.enforce(),
      );
    }, this.CHECK_INTERVAL_MS);
  }

  private mergeConfig(partial: Partial<ChildModeConfig>) {
    this.config = {
      ...this.config,
      ...partial,
      deviceWhitelist: Array.isArray(partial.deviceWhitelist)
        ? partial.deviceWhitelist
        : this.config.deviceWhitelist,
      timeWindows: Array.isArray(partial.timeWindows)
        ? partial.timeWindows
        : this.config.timeWindows,
    };
  }

  /**
   * 将配置写入内存；persist=true 时同步到 AppConfig.childMode。
   */
  private applyConfig(partial: Partial<ChildModeConfig>, opts: { persist: boolean }) {
    const wasEnabled = this.config.enabled;
    this.mergeConfig(partial);
    if (this.config.enabled && !wasEnabled) {
      this.startEnforceTimer();
      void this.enforce();
      this.logger.log('儿童模式已启用');
    } else if (!this.config.enabled && wasEnabled) {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
      this.logger.log('儿童模式已停用');
    }
    if (opts.persist) {
      void this.appConfig.update({ childMode: this.config }).catch((err) => {
        this.logger.warn(`持久化儿童模式配置失败: ${getErrorMessage(err)}`);
      });
    }
  }

  /** 异步落库运行时（媒体时长 / override），不写 AppConfig。 */
  private persistRuntime() {
    scheduleBackgroundTask(this.logger, '儿童模式运行时持久化', () =>
      this.prisma.childModeRuntime.upsert({
        where: { id: CHILD_MODE_RUNTIME_ID },
        create: {
          id: CHILD_MODE_RUNTIME_ID,
          mediaUsedMin: this.mediaUsedMin,
          usageDate: this.usageDate,
          overrideUntil: BigInt(this.overrideUntil),
        },
        update: {
          mediaUsedMin: this.mediaUsedMin,
          usageDate: this.usageDate,
          overrideUntil: BigInt(this.overrideUntil),
        },
      }),
    );
  }

  /**
   * 模块销毁时清理周期定时器，避免句柄泄漏。
   */
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  /**
   * API 调用前校验：儿童模式是否允许控制该实体。
   * 调用场景：自动化引擎 / REST API 在下发前预检，避免触发后立即被拦截。
   *
   * 判定规则：
   *  - 未启用 / 家长 override 期间放行；
   *  - 「白名单 + 时间窗」模式（deviceWhitelist 非空时启用）：
   *      * 非白名单设备一律拦截；
   *      * 白名单设备仅在允许时间窗内放行，窗外拦截并提示时段信息；
   *  - 媒体每日时长限制（对所有媒体播放器生效）。
   *
   * @param entityId 待控制实体 ID
   * @returns allowed=true 通过；allowed=false 时 reason 描述拒绝原因
   */
  canControl(entityId: string): { allowed: boolean; reason?: string } {
    if (!this.config.enabled) return { allowed: true };
    if (this.isOverrideActive()) return { allowed: true };
    // 白名单 + 时间窗模式：非白名单设备一律拦截
    if (this.config.deviceWhitelist.length > 0) {
      if (!this.config.deviceWhitelist.includes(entityId)) {
        return { allowed: false, reason: '儿童模式：该设备未加入允许白名单' };
      }
      // 白名单设备：窗外一律拦截，并提示可用时段
      if (!this.isInAllowedWindow()) {
        return { allowed: false, reason: this.outsideWindowReason() };
      }
    }
    if (this.config.dailyMediaLimitMin > 0 && entityId.startsWith('media_player.')) {
      // 累计 = 已落库时长 + 当前在播增量
      let active = this.mediaUsedMin;
      for (const since of this.mediaPlayingSince.values()) {
        active += (Date.now() - since) / 60000;
      }
      if (active >= this.config.dailyMediaLimitMin) {
        return { allowed: false, reason: '儿童模式媒体时长已达上限' };
      }
    }
    return { allowed: true };
  }

  /**
   * 返回当前儿童模式状态快照（用于 UI 展示）。
   * 包含 config / 已用时长 / 白名单时段状态 / 家长 override 状态。
   */
  getStatus() {
    const overrideActive = this.isOverrideActive();
    return {
      ...this.config,
      mediaUsedMin: Math.round(this.mediaUsedMin),
      /** 白名单模式下：当前是否处于任一允许时间窗内 */
      inAllowedWindow: this.isInAllowedWindow(),
      overrideActive,
      overrideUntil: overrideActive ? new Date(this.overrideUntil).toISOString() : null,
    };
  }

  /**
   * 家长临时解除拦截（override 语义为「临时解除」）。
   * 副作用：设置 overrideUntil，emit childMode.override 事件，落库状态。
   *
   * @param minutes 解除时长（分钟），会被 clamp 到 [5, 180]
   * @returns 最新状态
   */
  requestOverride(minutes = 30) {
    const mins = Math.min(Math.max(minutes, 5), 180);
    this.overrideUntil = Date.now() + mins * 60_000;
    this.logger.log(`儿童模式家长 override:${mins} 分钟`);
    this.eventBus.emit('childMode.override', { until: this.overrideUntil, minutes: mins });
    this.persistRuntime();
    return this.getStatus();
  }

  /**
   * 判断家长 override 是否仍在有效期内；过期则自动归零。
   */
  private isOverrideActive(): boolean {
    if (this.overrideUntil <= Date.now()) {
      this.overrideUntil = 0;
      return false;
    }
    return true;
  }
  /**
   * 更新儿童模式配置（部分字段）。
   * 副作用：
   *  - 启用 / 禁用切换时启停周期定时器
   *  - 启用时立即触发一次 enforce
   *  - emit childMode.changed 事件
   *  - 落库
   *
   * @returns 最新状态
   */
  updateConfig(partial: Partial<ChildModeConfig>) {
    this.applyConfig(partial, { persist: true });
    this.eventBus.emit('childMode.changed', { enabled: this.config.enabled });
    return this.getStatus();
  }

  /** 解析 'HH:mm' 为当天分钟数；格式非法时返回 NaN */
  private parseTimeToMin(t: string): number {
    const [h, m] = String(t ?? '').split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return Number.NaN;
    return h * 60 + m;
  }

  /** 判断给定星期几（0=周日）是否命中时间窗的 days 维度 */
  private isDayMatched(days: ChildModeDays, day: number): boolean {
    if (days === 'weekday') return day >= 1 && day <= 5;
    if (days === 'weekend') return day === 0 || day === 6;
    return Array.isArray(days) && days.includes(day);
  }

  /** 判断当前时刻是否处于指定时间窗内（支持跨午夜，如 21:00-07:00） */
  private isWithinWindow(w: ChildModeTimeWindow, now: Date): boolean {
    const startMin = this.parseTimeToMin(w.start);
    const endMin = this.parseTimeToMin(w.end);
    if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) return false;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    // start<=end：同日区间；start>end：跨午夜区间
    return startMin <= endMin
      ? nowMin >= startMin && nowMin < endMin
      : nowMin >= startMin || nowMin < endMin;
  }

  /**
   * 当前时刻命中的允许时间窗（含日期维度匹配）；无命中返回 undefined。
   *
   * @param now 当前时刻，默认 new Date()
   */
  private currentAllowedWindow(now = new Date()): ChildModeTimeWindow | undefined {
    const day = now.getDay();
    return this.config.timeWindows.find(
      (w) => this.isDayMatched(w.days, day) && this.isWithinWindow(w, now),
    );
  }

  /**
   * 当前时刻是否处于任一允许时间窗内（白名单模式「窗外一律拦截」的判据）。
   *
   * @param now 当前时刻，默认 new Date()
   */
  private isInAllowedWindow(now = new Date()): boolean {
    return this.currentAllowedWindow(now) !== undefined;
  }

  /** 将时间窗 days 维度描述为中文文案 */
  private describeWindowDays(days: ChildModeDays): string {
    if (days === 'weekday') return '工作日';
    if (days === 'weekend') return '周末';
    const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return days.map((d) => WEEK[d] ?? '').filter(Boolean).join('、');
  }

  /** 将单个时间窗描述为人类可读文案，如「工作日 19:00-21:00」 */
  private describeTimeWindow(w: ChildModeTimeWindow): string {
    return `${this.describeWindowDays(w.days)} ${w.start}-${w.end}`;
  }

  /** 生成「当前不在允许时段」的拦截提示文案（带时段信息） */
  private outsideWindowReason(): string {
    if (this.config.timeWindows.length === 0) {
      return '儿童模式：该设备当前不在允许使用时段';
    }
    const desc = this.config.timeWindows
      .slice(0, 3)
      .map((w) => this.describeTimeWindow(w))
      .join('；');
    const suffix = this.config.timeWindows.length > 3 ? ' 等' : '';
    return `儿童模式：当前不在允许使用时段（${desc}${suffix}）`;
  }

  /**
   * 跨日时重置媒体累计：usageDate 与今天不一致则清零 mediaUsedMin 和 mediaPlayingSince。
   */
  private resetDailyIfNeeded() {
    const today = localDateKey();
    if (this.usageDate !== today) {
      this.usageDate = today;
      this.mediaUsedMin = 0;
      this.mediaPlayingSince.clear();
    }
  }
  /**
   * 实时拦截：监听 HA 状态变更，白名单设备在允许时段外被打开 → 立即关闭。
   * 仅 leader 节点处理，避免多实例重复下发。
   *
   * 同时累计媒体播放器 playing 状态时长，用于媒体时长限制判断。
   *
   * @param event HA state_changed 事件
   */
  @OnEvent(HA_EVENTS.STATE_CHANGED_COLD_BATCH)
  async handleStateChange(payload: HaStateChangeBatchEvent) {
    for (const event of coldBatchChanges(payload)) {
      if (!this.haLeader.isHaWsLeader()) return;
      if (!this.stateRouter.shouldProcess('child_mode', event)) continue;
      if (!this.config.enabled) return;
      const id = event.entity_id;
      const state = event.new_state?.state;

      // 媒体时长累计：playing 记录起始时间戳；离开 playing 则结算增量
      if (id.startsWith('media_player.')) {
        this.resetDailyIfNeeded();
        if (state === 'playing') {
          if (!this.mediaPlayingSince.has(id)) this.mediaPlayingSince.set(id, Date.now());
        } else {
          const since = this.mediaPlayingSince.get(id);
          if (since) {
            this.mediaUsedMin += (Date.now() - since) / 60000;
            this.mediaPlayingSince.delete(id);
            this.persistRuntime();
          }
        }
      }

      // 受儿童模式管控的实体：白名单非空时仅白名单设备受管控
      const governed =
        this.config.deviceWhitelist.length > 0 && this.config.deviceWhitelist.includes(id);
      if (!governed) continue;
      if (this.isOverrideActive()) continue;
      // 白名单模式：窗外一律拦截
      const blocked = !this.isInAllowedWindow();
      // 设备"开"状态判定：on / playing / open 均视为开
      const isOn = state === 'on' || state === 'playing' || state === 'open';
      if (isOn && blocked) {
        await this.turnOff(id);
        this.eventBus.emit('childMode.blocked', {
          entityId: id,
          reason: this.outsideWindowReason(),
        });
        this.logger.log(`儿童模式拦截: ${id} 非允许时段被打开,已关闭`);
      }
    }
  }

  /**
   * 周期性强制执行（每分钟触发）：
   *  - 白名单 + 时间窗模式：非允许时段关闭全部白名单设备
   *  - 媒体时长超限：关闭所有在播媒体
   * 跳过条件：未启用 / override 期间。
   */
  private async enforce() {
    if (!this.config.enabled) return;
    this.resetDailyIfNeeded();
    if (this.isOverrideActive()) return;

    // 白名单 + 时间窗模式：窗外一律拦截
    if (this.config.deviceWhitelist.length > 0 && !this.isInAllowedWindow()) {
      for (const id of this.config.deviceWhitelist) {
        await this.turnOff(id);
      }
    }

    // 媒体时长超限：累计在播时长后判断
    if (this.config.dailyMediaLimitMin > 0) {
      let active = this.mediaUsedMin;
      for (const since of this.mediaPlayingSince.values()) {
        active += (Date.now() - since) / 60000;
      }
      if (active >= this.config.dailyMediaLimitMin) {
        for (const [id] of this.mediaPlayingSince) {
          await this.turnOff(id);
        }
        this.eventBus.emit('childMode.mediaLimitReached', { usedMin: Math.round(active) });
        this.logger.log(`儿童模式: 媒体每日时长已达上限 ${this.config.dailyMediaLimitMin} 分钟`);
      }
    }
  }

  /**
   * 关闭指定实体。根据 domain 选择 HA service：
   *  - media_player → turn_off
   *  - cover        → close_cover
   *  - 其他         → turn_off
   * 失败仅 debug 记录，不抛出，避免单个设备故障阻断整体 enforce。
   */
  private async turnOff(entityId: string) {
    const domain = getEntityDomain(entityId);
    const service =
      domain === 'media_player' ? 'turn_off' : domain === 'cover' ? 'close_cover' : 'turn_off';
    try {
      await this.haConnector.callService(domain, service, entityId, {});
    } catch (err) {
      this.logger.debug(`儿童模式关闭设备失败 [${entityId}]: ${getErrorMessage(err)}`);
    }
  }
}