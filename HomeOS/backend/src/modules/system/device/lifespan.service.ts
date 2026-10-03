/**
 * 设备寿命预估服务：从 HA 状态变更统计开关次数 / 运行时长 / 平均周期，估算剩余寿命并告警。
 *
 * 所属模块：modules/system/device（由 SystemModule 装配，可跨场景读取设备健康分）。
 * 核心职责：
 *  - 订阅 HA 状态变更（冷批处理），按设备域（light/switch/fan/cover/climate 等）维护计数与运行时长；
 *  - 以「额定寿命典型值」为基准，综合开关次数、运行时长估算剩余次数与健康分；
 *  - 持久化到 DeviceLifespan 表，PERSIST_INTERVAL（5 分钟）节流 + 并发上限 3 避免冷启动雪崩；
 *  - 低健康度时可通过 NotificationService（可选）推送提醒。
 * 关键依赖：PrismaService、AppConfigService（额定寿命 / 阈值 / 开关）、NotificationService（可选）、HA_EVENTS。
 */

import { getErrorMessage } from '../../../common/utils';
import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { getEntityDomain } from '@homeos/shared';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../shared/prisma/service';
import { AppConfigService } from '../../../shared/app-config/service';
import { NotificationService } from '../../notification/service';
import type { HaStateChangeBatchEvent, HaStateChangeEvent } from '../../../shared/types';
import { HA_EVENTS } from '../../../shared/types';
import { forEachColdBatchEvent } from '../../../shared/ha/cold-batch.util';
import { summarizeLifespanCounts } from './lifespan.util';

/**
 * 设备寿命追踪记录（内存模型）。
 *
 * 反映单台设备的开关次数、累计运行时长与综合健康分，
 * 由 HA 状态变更事件实时维护，并周期性落库到 DeviceLifespan 表。
 */
interface DeviceLifespan {
  entityId: string;
  friendlyName: string;
  domain: string;
  switchCount: number; // 开关次数
  totalRuntimeSeconds: number; // 总运行时长
  avgCycleSeconds: number; // 平均单次运行时长
  firstSeen: string;
  lastSeen: string;
  estimatedRemainingCycles: number | null;
  healthScore: number; // 100 = 全新，0 = 建议更换
}

/**
 * 设备寿命预估服务
 *
 * 所属模块：system/device
 * 依赖：PrismaService（持久化）、AppConfigService（额定寿命/阈值配置）、
 *  NotificationService（可选，低健康度告警通知）、@nestjs/event-emitter（订阅 HA 状态变更）。
 *
 * 基于 HA 状态变更事件实时追踪：
 *  1. 开关次数 — 对比制造商额定次数估算剩余寿命
 *  2. 总运行时长 — 电机类设备（风扇/水泵）的轴承寿命
 *  3. 平均周期时长 — 用于异常检测（突然变短/变长）
 *
 * 额定寿命参考（典型值）：
 *  继电器 (light/switch): 100,000 次
 *  智能插座 (switch):      50,000 次
 *  电机 (fan/cover):       10,000 小时
 *  LED 灯泡 (light):       15,000 小时
 */
@Injectable()
export class DeviceLifespanService implements OnModuleInit {
  private readonly logger = new Logger(DeviceLifespanService.name);

  private devices = new Map<string, DeviceLifespan>();
  private lastPersisted = new Map<string, number>(); // entityId → last persisted timestamp
  // 冷启动并发落库上限：3。小规格 NAS 部署 Docker 端口转发只有单进程，超过会触发 accept queue 积压；
  // 大实例最多也不需要过高，寿命计数非关键路径可延后。
  private readonly PERSIST_CONCURRENCY = 3;
  private persistInFlight = 0;
  private readonly persistQueue: DeviceLifespan[] = [];
  private readonly persistQueued = new Set<string>();
  // 同设备两次落库最小间隔：300_000ms（5 分钟）。开关每秒都会抖动，节流后把数千台设备写 QPS 压到可接受范围；
  // 与 switchCount/totalRuntimeSeconds 聚合量级匹配，不损失寿命评估精度。
  private readonly PERSIST_INTERVAL = 300_000;
  private dbLoaded = false;
  private loadPromise: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly appConfig: AppConfigService,
    @Optional() private readonly notifications?: NotificationService,
  ) {}

  /** 模块初始化时确保 DB 数据已加载到内存，避免事件早到导致计数丢失。 */
  async onModuleInit() {
    await this.ensureLoaded();
  }

  /**
   * 确保 DB 寿命数据已加载（幂等，并发安全）。
   * 使用 loadPromise 串行化加载，避免多个调用并发触发重复查询。
   */
  private async ensureLoaded() {
    if (this.dbLoaded) return;
    if (!this.loadPromise) this.loadPromise = this.loadFromDb();
    await this.loadPromise;
  }

  /**
   * 从 DB 加载全部设备寿命数据到内存。
   *
   * 注意：若内存中已存在该实体的记录（事件可能在加载完成前到达并先行创建），
   * 不覆盖内存中的较新计数，以避免回退。
   *
   * 副作用：将 dbLoaded 置为 true，无论成功与否（失败时不阻塞事件处理）。
   */
  private async loadFromDb() {
    try {
      const records = await this.prisma.deviceLifespan.findMany({ take: 2000 });
      for (const r of records) {
        // 不覆盖已有内存中的更新计数（事件可能在加载完成前到达）
        if (this.devices.has(r.entityId)) continue;
        this.devices.set(r.entityId, {
          entityId: r.entityId,
          friendlyName: r.friendlyName,
          domain: r.domain,
          switchCount: r.switchCount,
          totalRuntimeSeconds: r.totalRuntimeSeconds,
          avgCycleSeconds: r.avgCycleSeconds,
          firstSeen: r.firstSeen.toISOString(),
          lastSeen: r.lastSeen?.toISOString() ?? '',
          estimatedRemainingCycles: null,
          healthScore: r.healthScore,
        });
      }
      this.logger.log(`设备寿命数据已加载: ${records.length} 台`);
    } catch (err) {
      this.logger.warn(`加载设备寿命数据失败: ${(err as Error).message}`);
    } finally {
      this.dbLoaded = true;
    }
  }

  /**
   * 异步持久化单台设备的寿命数据到 DB。
   *
   * 节流策略：同一设备在 PERSIST_INTERVAL（5 分钟）内只写一次，
   * 避免高频状态变更打爆 DB。实际写入通过 setImmediate 推迟到下一轮事件循环，
   * 不阻塞当前事件处理；写入失败仅记录告警，不影响内存数据。
   *
   * @param device 待持久化的设备寿命记录。
   */
  private async persistDevice(device: DeviceLifespan) {
    const now = Date.now();
    const lastTime = this.lastPersisted.get(device.entityId) || 0;
    if (now - lastTime < this.PERSIST_INTERVAL) return;
    this.lastPersisted.set(device.entityId, now);

    if (this.persistQueued.has(device.entityId)) return;
    this.persistQueued.add(device.entityId);
    this.persistQueue.push(device);
    setImmediate(() => void this.drainPersistQueue());
  }

  private async drainPersistQueue() {
    while (this.persistInFlight < this.PERSIST_CONCURRENCY && this.persistQueue.length > 0) {
      const device = this.persistQueue.shift();
      if (!device) break;
      this.persistQueued.delete(device.entityId);
      this.persistInFlight += 1;
      void this.writeDevice(device).finally(() => {
        this.persistInFlight -= 1;
        void this.drainPersistQueue();
      });
    }
  }

  private async writeDevice(device: DeviceLifespan) {
    try {
      await this.prisma.deviceLifespan.upsert({
        where: { entityId: device.entityId },
        create: {
          entityId: device.entityId,
          friendlyName: device.friendlyName,
          domain: device.domain,
          switchCount: device.switchCount,
          totalRuntimeSeconds: Math.round(device.totalRuntimeSeconds),
          avgCycleSeconds: device.avgCycleSeconds,
          firstSeen: new Date(device.firstSeen),
          lastSeen: device.lastSeen ? new Date(device.lastSeen) : new Date(device.firstSeen),
          healthScore: device.healthScore,
        },
        update: {
          switchCount: device.switchCount,
          totalRuntimeSeconds: Math.round(device.totalRuntimeSeconds),
          avgCycleSeconds: device.avgCycleSeconds,
          lastSeen: device.lastSeen ? new Date(device.lastSeen) : undefined,
          healthScore: device.healthScore,
        },
      });
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      this.logger.warn(`持久化设备寿命失败 [${device.entityId}]: ${message}`);
    }
  }

  /** 设备额定寿命（从配置中心读取） */
  private get RATED_CYCLES() {
    return this.appConfig.get('device').ratedCycles;
  }

  private get RATED_HOURS() {
    return this.appConfig.get('device').ratedHours;
  }

  /** 上次状态记录 (entityId → {state, timestamp}) */
  private lastState = new Map<string, { state: string; ts: number }>();

  /**
   * HA 状态变更（冷启动快照）事件处理入口。
   *
   * 仅对关键字段做快照后通过 setImmediate 延迟执行实际处理，
   * 避免 EventEmitter 复用同一 event 对象导致读取到被覆盖的字段。
   *
   * @param event HA 状态变更事件（含 entity_id 与 new_state）。
   */
  @OnEvent(HA_EVENTS.STATE_CHANGED_COLD_BATCH)
  handleStateChange(payload: HaStateChangeBatchEvent) {
    forEachColdBatchEvent(payload, (event) => {
      // 快照关键字段后延迟执行，避免 event 对象被 EventEmitter 重用
      const snap = { entity_id: event?.entity_id, new_state: event?.new_state };
      setImmediate(() => this._handleStateChange(snap));
    });
  }

  /**
   * 实际的状态变更处理逻辑（关键 Hot Path）。
   *
   * 流程：
   *  1. 过滤出可开关的二态设备（on/off、open/closed、playing/idle 等）；
   *  2. 首次出现的设备初始化记录（健康分 100）；
   *  3. 关键算法 — 开关计数：仅当从"去激活态"切换到"激活态"时 switchCount++；
   *  4. 关键算法 — 运行时长累加：仅当从"激活态"切换到"去激活态"时，
   *     用本次与上次时间差累加 totalRuntimeSeconds，并更新平均周期；
   *  5. 重算健康分，异步落库；低于阈值且开关次数足够时触发告警通知。
   *
   * @param event 仅含 entity_id 与 new_state 的快照。
   */
  private _handleStateChange(event: Pick<HaStateChangeEvent, 'entity_id' | 'new_state'>) {
    const entityId: string = event?.entity_id || '';
    const state = event?.new_state?.state;
    if (!state || !entityId) return;

    const domain = getEntityDomain(entityId);
    const attrs = event?.new_state?.attributes as Record<string, unknown> | undefined;
    const friendlyName = (attrs?.friendly_name as string) || entityId;

    // 仅追踪可开关状态的设备
    const isBinaryState =
      state === 'on' ||
      state === 'off' ||
      state === 'open' ||
      state === 'closed' ||
      state === 'playing' ||
      state === 'paused' ||
      state === 'idle' ||
      state === 'home' ||
      state === 'not_home' ||
      state === 'heat' ||
      state === 'cool' ||
      state === 'off';

    if (!isBinaryState) return;

    const now = Date.now();
    let device = this.devices.get(entityId);
    if (!device) {
      device = {
        entityId,
        friendlyName,
        domain,
        switchCount: 0,
        totalRuntimeSeconds: 0,
        avgCycleSeconds: 0,
        firstSeen: new Date(now).toISOString(),
        lastSeen: '',
        estimatedRemainingCycles: null,
        healthScore: 100,
      };
      this.devices.set(entityId, device);
    }

    const last = this.lastState.get(entityId);

    // 激活态：设备处于"工作/在家/制热制冷"等耗能状态
    const activationStates = new Set(['on', 'open', 'playing', 'home', 'heat', 'cool']);
    // 去激活态：设备处于"关闭/暂停/外出"等静止状态
    const deactivationStates = new Set(['off', 'closed', 'paused', 'idle', 'not_home']);

    // 开关计数：off→on / closed→open / idle→playing 等转换
    if (last && activationStates.has(state) && deactivationStates.has(last.state)) {
      device.switchCount++;
    }

    // 运行时长累加：on→off / open→closed 等关闭时刻，用时间差累加运行时长
    if (last && activationStates.has(last.state) && deactivationStates.has(state)) {
      const runtime = (now - last.ts) / 1000;
      device.totalRuntimeSeconds += runtime;
      if (device.switchCount > 0) {
        device.avgCycleSeconds = Math.round(device.totalRuntimeSeconds / device.switchCount);
      }
    }

    device.lastSeen = new Date(now).toISOString();
    this.lastState.set(entityId, { state, ts: now });

    // 计算健康分
    this.recalcHealth(device);

    // 异步持久化到 DB
    this.persistDevice(device);

    // 低健康度警告 → 可配置通知（冷却避免刷屏）
    if (
      device.healthScore < this.appConfig.get('device').healthAlertThreshold &&
      device.switchCount > 100
    ) {
      this.logger.warn(
        `⚠️ 设备寿命预警: ${device.friendlyName} (${entityId}) 健康度 ${device.healthScore}%, 开关 ${device.switchCount} 次`,
      );
      void this.notifyLowHealth(device);
    }
  }

  /**
   * 发送低健康度通知（按健康分梯度给出更换建议）。
   *
   * 建议梯度：低于阈值 1/4 → 立即更换；低于阈值 1/2 → 近期更换；否则 → 关注状态。
   * 通知服务不可用或发送失败时静默忽略，不影响寿命追踪主流程。
   *
   * @param device 健康分低于阈值的设备记录。
   */
  private async notifyLowHealth(device: DeviceLifespan) {
    if (!this.notifications) return;
    const threshold = this.appConfig.get('device').healthAlertThreshold;
    const tip =
      device.healthScore < threshold / 4
        ? '建议立即更换'
        : device.healthScore < threshold / 2
          ? '近期准备更换'
          : '请关注状态';
    try {
      await this.notifications.checkDeviceHealth(
        device.entityId,
        device.friendlyName,
        device.healthScore,
        tip,
      );
    } catch {
      /* 忽略 */
    }
  }

  /**
   * 关键算法 — 重算设备健康分。
   *
   * 健康分 = min(开关次数健康分, 运行时长健康分)，取两者中更悲观的一方：
   *  - cycleHealth = 100 - (开关次数 / 额定次数) * 100，按域配置的额定次数计算；
   *  - hourHealth  = 100 - (运行小时数 / 额定小时) * 100，按域配置的额定小时计算；
   *  - 任一维度超出额定值则该维度归 0；未配置额定的维度按 100（满分）处理。
   *
   * 同时估算剩余可用次数 = max(0, 额定次数 - 已开关次数)。
   *
   * @param device 待重算的设备记录（原地更新 healthScore 与 estimatedRemainingCycles）。
   */
  private recalcHealth(device: DeviceLifespan) {
    const cycleHealth = this.RATED_CYCLES[device.domain]
      ? Math.max(0, 100 - (device.switchCount / this.RATED_CYCLES[device.domain]) * 100)
      : 100;

    const hourHealth = this.RATED_HOURS[device.domain]
      ? Math.max(
          0,
          100 - (device.totalRuntimeSeconds / 3600 / this.RATED_HOURS[device.domain]) * 100,
        )
      : 100;

    device.healthScore = Math.round(Math.min(cycleHealth, hourHealth));

    // 估算剩余次数
    const ratedCycles = this.RATED_CYCLES[device.domain];
    device.estimatedRemainingCycles = ratedCycles
      ? Math.max(0, ratedCycles - device.switchCount)
      : null;
  }

  /**
   * 查询单台设备的寿命记录。
   * @param entityId HA 实体 ID（如 light.living_room）
   * @returns 设备寿命记录，不存在时返回 null。
   */
  getDeviceLifespan(entityId: string): DeviceLifespan | null {
    return this.devices.get(entityId) || null;
  }

  /**
   * 僵尸实体解绑时清理内存中的寿命追踪记录（含持久化节流与状态快照）。
   * DB 记录由 DeviceManagementService 统一删除，本方法仅清理内存，避免残留脏数据。
   * @param entityId HA 实体 ID
   */
  removeDeviceFromMemory(entityId: string) {
    this.devices.delete(entityId);
    this.lastPersisted.delete(entityId);
    this.lastState.delete(entityId);
  }

  /**
   * 返回全部设备寿命记录，按健康分升序排列（最差的排最前，便于优先关注）。
   * @returns 设备寿命记录数组。
   */
  getAllLifespans() {
    return [...this.devices.values()].sort((a, b) => a.healthScore - b.healthScore); // 最差的排前面
  }

  /**
   * 返回健康分低于告警阈值的设备清单及更换建议。
   * @returns 告警数组，每项含实体、名称、域、开关次数、总运行小时、健康分、阈值与建议。
   */
  getAlerts() {
    const threshold = this.appConfig.get('device').healthAlertThreshold;
    return this.getAllLifespans()
      .filter((d) => d.healthScore < threshold)
      .map((d) => ({
        entityId: d.entityId,
        name: d.friendlyName,
        domain: d.domain,
        switchCount: d.switchCount,
        totalHours: Math.round(d.totalRuntimeSeconds / 3600),
        healthScore: d.healthScore,
        threshold,
        recommendation:
          d.healthScore < threshold / 4
            ? '建议立即更换'
            : d.healthScore < threshold / 2
              ? '近期准备更换'
              : '关注状态',
      }));
  }

  /**
   * 生成寿命摘要（供设备健康概览与仪表盘使用）。
   *
   * 包含：设备总数、健康档位分布（healthy/warning/critical）、
   * 开关次数 Top 5、运行时长 Top 5，以及告警列表。
   *
   * @returns 寿命摘要对象。
   */
  getSummary() {
    const threshold = this.appConfig.get('device').healthAlertThreshold;
    const all = this.getAllLifespans();
    const counts = summarizeLifespanCounts(
      all.map((d) => d.healthScore),
      threshold,
    );
    return {
      totalDevices: all.length,
      healthAlertThreshold: threshold,
      ...counts,
      topSwitchCounts: all.slice(0, 5).map((d) => ({
        entityId: d.entityId,
        name: d.friendlyName,
        switchCount: d.switchCount,
        healthScore: d.healthScore,
      })),
      topRuntimes: [...all]
        .sort((a, b) => b.totalRuntimeSeconds - a.totalRuntimeSeconds)
        .slice(0, 5)
        .map((d) => ({
          entityId: d.entityId,
          name: d.friendlyName,
          totalHours: Math.round(d.totalRuntimeSeconds / 3600),
          healthScore: d.healthScore,
        })),
      alerts: this.getAlerts(),
    };
  }
}