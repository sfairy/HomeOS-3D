/**
 * @file security-panel.service.ts
 * @module backend/src/modules
 *
 * 安防面板服务：维护布防模式（disarmed / armed_home / armed_away / armed_night）与
 * 区域传感器配置，对接 HA 状态变更做入侵告警与危险传感器（烟雾/燃气/漏水）自动联动，
 * 并提供紧急求助的设备联动执行。多副本部署下仅 Leader 实例执行实际布防与告警判定，
 * Follower 通过事件总线转发请求并按广播同步内存态。
 *
 * 组成：
 * - SecurityPanelStateHelper：持久化 mode/zones/armedAt 到 RuntimeKv。
 * - SecurityLinkageHelper：按 layout.securityModes 执行 HA 服务联动动作。
 * - SecurityAlarmHelper：传感器触发 → 入侵告警 / 危险传感器自动关阀排风。
 * - SecurityEmergencyRunnerHelper：紧急求助的内置 + 自定义设备联动。
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { API_ERROR } from '../../../common/errors/api-error-messages';
import { badRequest } from '../../../common/utils/business-exception';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { EventBusService } from '../../../shared/redis/event-bus.service';
import { HaConnectorService } from '../../ha-connector/service';
import { HaWsLeaderService } from '../../ha-connector/ha-ws-leader.service';
import { AppConfigService } from '../../../shared/app-config/service';
import { PrismaService } from '../../../shared/prisma/service';
import { NotificationCooldownService } from '../../../common/alert-support/notification-cooldown.service';
import { HOMEOS_EVENTS } from '../../../shared/homeos-events';
import { HA_EVENTS } from '../../../shared/types';
import type { HaStateChangeBatchEvent } from '../../../shared/types';
import { coldBatchChanges, forEachColdBatchEvent } from '../../../shared/ha/cold-batch.util';
import { scheduleBackgroundTask } from '../../../common/resilience/circuit-breaker.helper';
import { DistributedLockService } from '../../../common/resilience/distributed-lock.service';
import { normalizeZoneType, SecurityPanelStateHelper, SecurityLinkageHelper, SecurityEmergencyRunnerHelper, SecurityAlarmHelper, type SecurityZoneType } from './security-panel.internals';
import { resolveNotificationFetchLimit } from '../../../common/alert-support/notification-channels.util';

import type { SecurityArmingMode } from '@homeos/shared';

/**
 * ArmingMode：业务类型别名。
 * - 表示：modules/security/panel/security-panel.service.ts 域内联合/映射/函数签名一组相关值；
 * - 用途：避免重复字面量、统一跨文件类型引用
 */
export type ArmingMode = SecurityArmingMode;
type SecurityModeChangeSource =
  'manual' | 'emergency' | 'presence' | 'home-mode' | 'schedule' | 'calendar';

/**
 * SecurityZone：业务接口定义。
 * - 表示：modules/security/panel/security-panel.service.ts 域内的数据结构或依赖注入契约；
 * - 关键字段：见接口属性行内注释；必选/可选由 ? 修饰符表达
 */
export interface SecurityZone {
  id: string;
  name: string;
  sensors: string[];
  armed: boolean;
  /** perimeter=外围 | interior=室内 | all=全部（默认） */
  zoneType?: SecurityZoneType;
  /** 关联 HA 区域 ID（持久化，供前端恢复房间绑定） */
  roomId?: string;
}

/**
 * SecurityModeAction：业务接口定义。
 * - 表示：modules/security/panel/security-panel.service.ts 域内的数据结构或依赖注入契约；
 * - 关键字段：见接口属性行内注释；必选/可选由 ? 修饰符表达
 */
export interface SecurityModeAction {
  entity_id: string;
  domain?: string;
  service: string;
  service_data?: Record<string, unknown>;
}

/**
 * SecurityPanelOptions：业务接口定义。
 * - 表示：modules/security/panel/security-panel.service.ts 域内的数据结构或依赖注入契约；
 * - 关键字段：见接口属性行内注释；必选/可选由 ? 修饰符表达
 */
export interface SecurityPanelOptions {
  source?: SecurityModeChangeSource;
  /** 同模式重复切换时不执行联动动作 */
  skipActionsIfSameMode?: boolean;
  /** 强制切换（忽略同模式跳过） */
  force?: boolean;
  /** 跳过 layout 联动动作（仅更新模式/区域） */
  skipActions?: boolean;
}

@Injectable()
/**
 * SecurityPanelService：Nest @Injectable 服务。
 * - 职责：承载域内核心业务逻辑；
 * - 装配：由对应 Module 的 providers 数组注入；
 * - 生命周期：可能实现 onModuleInit/onModuleDestroy（连接/订阅管理）；
 * @class SecurityPanelService
 */
export class SecurityPanelService implements OnModuleInit {
  private readonly logger = new Logger(SecurityPanelService.name);
  /** 布防/撤防过渡互斥锁 key：串行化状态切换，避免并发 arm/disarm 交错导致模式与区域 armed 不一致 */
  private static readonly TRANSITION_LOCK_KEY = 'security:panel:transition';
  private currentMode: ArmingMode = 'disarmed';
  private zones: SecurityZone[] = [];
  private emergencyRunning = false;
  private lastEmergencyAt = 0;
  /** 最近一次布防的进程内时间戳（毫秒），用于撤防宽限期判定；撤防后重置为 null */
  private armedAt: number | null = null;

  private readonly stateHelper: SecurityPanelStateHelper;
  private readonly linkageHelper: SecurityLinkageHelper;
  private readonly emergencyRunner: SecurityEmergencyRunnerHelper;
  private readonly alarmHelper: SecurityAlarmHelper;

  constructor(
    private readonly haConnector: HaConnectorService,
    private readonly eventEmitter: EventEmitter2,
    private readonly eventBus: EventBusService,
    private readonly appConfig: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly haLeader: HaWsLeaderService,
    private readonly cooldownService: NotificationCooldownService,
    private readonly lock: DistributedLockService,
  ) {
    this.stateHelper = new SecurityPanelStateHelper(
      { logger: this.logger, prisma: this.prisma },
      {
        getMode: () => this.currentMode,
        setMode: (mode) => {
          this.currentMode = mode;
        },
        getZones: () => this.zones,
        setZones: (zones) => {
          this.zones = zones;
        },
        getArmedAt: () => this.armedAt,
        setArmedAt: (t) => {
          this.armedAt = t;
        },
      },
    );
    this.linkageHelper = new SecurityLinkageHelper({
      logger: this.logger,
      prisma: this.prisma,
      appConfig: this.appConfig,
      haConnector: this.haConnector,
    });
    this.emergencyRunner = new SecurityEmergencyRunnerHelper({
      logger: this.logger,
      prisma: this.prisma,
      eventBus: this.eventBus,
      haConnector: this.haConnector,
      linkage: this.linkageHelper,
      getCurrentMode: () => this.currentMode,
      arm: (mode, zoneIds, opts) => this.arm(mode, zoneIds, opts),
    });
    this.alarmHelper = new SecurityAlarmHelper({
      logger: this.logger,
      eventBus: this.eventBus,
      haConnector: this.haConnector,
      appConfig: this.appConfig,
      prisma: this.prisma,
      stateHelper: this.stateHelper,
      getCurrentMode: () => this.currentMode,
      getZones: () => this.zones,
      getArmedAt: () => this.armedAt,
      isZoneAlarmInCooldown: (zoneId) =>
        this.cooldownService.isInCooldown('security', `zone-alarm:${zoneId}`),
      setZoneAlarmCooldown: (zoneId, minutes) => {
        this.cooldownService.setCooldown('security', `zone-alarm:${zoneId}`, minutes);
      },
    });
  }

  async onModuleInit() {
    await this.stateHelper.loadPersistedState();
  }

  getMode(): ArmingMode {
    return this.currentMode;
  }

  getZones(): SecurityZone[] {
    return this.zones;
  }

  configureZones(zones: SecurityZone[]) {
    if (!Array.isArray(zones) || zones.length === 0) {
      this.zones = [];
      this.stateHelper.persistPanelState();
      this.eventBus.emit(HOMEOS_EVENTS.SECURITY_ZONES_CONFIGURED, {
        count: 0,
        zones: [],
        timestamp: new Date().toISOString(),
      });
      this.logger.log('已清空安防区域配置');
      return;
    }

    const seen = new Set<string>();
    for (const z of zones) {
      if (!z?.id?.trim() || !z?.name?.trim()) {
        badRequest(API_ERROR.SECURITY_ZONE_ID_NAME_REQUIRED);
      }
      if (seen.has(z.id)) {
        badRequest(API_ERROR.SECURITY_ZONE_ID_DUPLICATE(z.id));
      }
      seen.add(z.id);
      for (const sid of z.sensors || []) {
        if (!/^[\w.]+\.[\w]+$/.test(String(sid || '').trim())) {
          badRequest(API_ERROR.SECURITY_SENSOR_ENTITY_INVALID(String(sid)));
        }
      }
    }
    const prevArmed = new Map(this.zones.map((z) => [z.id, z.armed]));
    this.zones = zones.map((z) => ({
      id: z.id.trim(),
      name: z.name.trim(),
      sensors: z.sensors || [],
      armed: prevArmed.get(z.id) ?? false,
      zoneType: normalizeZoneType(z.zoneType),
      roomId: z.roomId?.trim() || undefined,
    }));
    this.stateHelper.persistPanelState();
    this.eventBus.emit(HOMEOS_EVENTS.SECURITY_ZONES_CONFIGURED, {
      count: this.zones.length,
      zones: this.zones.map((z) => ({ ...z, sensors: [...z.sensors] })),
      timestamp: new Date().toISOString(),
    });
    this.logger.log(`已配置 ${zones.length} 个安防区域`);
  }

  async arm(mode: ArmingMode, zoneIds?: string[], opts?: SecurityPanelOptions) {
    if (mode === 'disarmed') {
      return this.disarm(opts);
    }

    // 多副本：仅 Leader 实例执行实际布防（传感器告警只在 Leader 判定），
    // Follower 收到请求时转发至 Leader，Leader 布防后经 security.modeChanged 广播回同步
    if (this.haLeader.isHaWsFollower()) {
      this.logger.warn(`安防布防请求转发至 Leader 实例执行: ${mode}`);
      this.eventBus.emit(HOMEOS_EVENTS.SECURITY_PANEL_REQUEST_SET_MODE, {
        mode,
        zoneIds,
        opts,
      });
      return { success: true, mode, forwarded: true };
    }

    // 串行化布防/撤防过渡：并发 arm/disarm（手动点按 + 存在感知自动布防 + home-mode 联动）
    // 会在 await executeSecurityModeActions 期间交错读写 currentMode/zones，
    // 导致面板模式与区域 armed 标记不一致（漏报/误报传感器告警）
    return this.lock.runExclusive(SecurityPanelService.TRANSITION_LOCK_KEY, () =>
      this.armInner(mode, zoneIds, opts),
    );
  }

  private async armInner(
    mode: ArmingMode,
    zoneIds?: string[],
    opts?: SecurityPanelOptions,
  ) {
    const sameMode = this.currentMode === mode;
    if (sameMode && opts?.skipActionsIfSameMode !== false && !opts?.force) {
      return {
        success: true,
        mode,
        zoneCount: this.zones.filter((z) => z.armed).length,
        actions: { executed: 0, failed: 0, failedItems: [] },
        skipped: true,
      };
    }

    const targetZones =
      zoneIds && zoneIds.length > 0 ? this.zones.filter((z) => zoneIds.includes(z.id)) : this.zones;
    // 传入的 zoneIds 无任何匹配时拒绝布防，避免「0 区布防」的假安全
    if (zoneIds && zoneIds.length > 0 && targetZones.length === 0) {
      badRequest(API_ERROR.SECURITY_ZONE_NOT_FOUND);
    }

    // 两阶段：先执行联动动作（保持旧 mode），全部成功后再提交 mode/zones 并广播。
    // fail-closed：任一联动失败则不提交布防态，避免「面板已布防但门锁未锁」的假安全。
    const actionResult = opts?.skipActions
      ? { executed: 0, failed: 0, failedItems: [] }
      : await this.linkageHelper.executeSecurityModeActions(mode);

    const degraded = actionResult.failed > 0;
    if (degraded) {
      this.logger.warn(
        `安防布防失败(联动未完成): ${mode},失败 ${actionResult.failed} 条,保持模式=${this.currentMode}`,
      );
      this.stateHelper.scheduleSecurityEvent('arm_failed', `布防失败: ${mode}`, {
        mode: this.currentMode,
      });
      return {
        success: false,
        degraded: true,
        mode: this.currentMode,
        requestedMode: mode,
        zoneCount: this.zones.filter((z) => z.armed).length,
        actions: actionResult,
        failedItems: actionResult.failedItems,
      };
    }

    for (const zone of this.zones) {
      zone.armed = false;
    }
    for (const zone of targetZones) {
      zone.armed = true;
    }

    this.currentMode = mode;
    this.armedAt = Date.now();

    const armedZoneIds = this.zones.filter((z) => z.armed).map((z) => z.id);

    this.eventBus.emit(HOMEOS_EVENTS.SECURITY_MODE_CHANGED, {
      mode,
      zones: armedZoneIds,
      zonesDetail: this.zones.map((z) => ({ ...z, sensors: [...z.sensors] })),
      armedAt: this.armedAt,
      timestamp: new Date().toISOString(),
      source: opts?.source || 'manual',
      degraded: false,
      failedItems: [],
    });

    this.logger.log(`安防已布防: ${mode} (${targetZones.length} 个区域)`);
    this.stateHelper.persistPanelState();
    this.stateHelper.scheduleSecurityEvent('arm', `布防: ${mode}`, { mode, zones: armedZoneIds });
    return {
      success: true,
      degraded: false,
      mode,
      zoneCount: targetZones.length,
      actions: actionResult,
      failedItems: actionResult.failedItems,
    };
  }

  @OnEvent('security.panel.setMode')
  async handlePanelSetMode(data: { mode?: string; source?: SecurityModeChangeSource }) {
    const mode = (data?.mode || 'disarmed') as ArmingMode;
    const opts: SecurityPanelOptions = { source: data?.source || 'home-mode' };
    if (mode === 'disarmed') {
      return this.disarm(opts);
    }
    return this.arm(mode, undefined, opts);
  }

  /**
   * 跨实例布防/撤防请求：由 Follower 实例转发至 Leader 执行。
   * Leader 执行完会广播 security.modeChanged，各实例通过 handleModeChangedSync 同步。
   */
  @OnEvent('security.panel.setMode.request')
  async handlePanelSetModeRequest(data: {
    mode?: string;
    zoneIds?: string[];
    opts?: SecurityPanelOptions;
  }) {
    if (this.haLeader.isHaWsFollower()) return;
    const mode = (data?.mode || 'disarmed') as ArmingMode;
    const opts: SecurityPanelOptions = data?.opts ?? {};
    if (mode === 'disarmed') {
      await this.disarm(opts);
    } else {
      await this.arm(mode, data?.zoneIds, opts);
    }
  }

  /**
   * 跨实例状态同步：非 Leader 实例收到 Leader 广播的 modeChanged 后，将内存态
   * 对齐为 Leader 提交的状态（currentMode / zones armed / armedAt），避免
   * “Follower 显示已布防而 Leader 内存仍为撤防”导致传感器告警漏报。
   */
  @OnEvent('security.modeChanged')
  async handleModeChangedSync(data: {
    mode?: ArmingMode;
    zonesDetail?: SecurityZone[];
    armedAt?: number | null;
  }) {
    if (!data?.mode) return;
    // Leader 已持有最新内存态，无需重复同步
    if (this.haLeader.isHaWsLeader() && this.currentMode === data.mode) return;
    this.currentMode = data.mode;
    if (Array.isArray(data.zonesDetail)) {
      this.zones = data.zonesDetail.map((z) => ({
        id: z.id,
        name: z.name,
        sensors: [...(z.sensors || [])],
        armed: z.armed ?? false,
        zoneType: normalizeZoneType(z.zoneType),
        roomId: z.roomId?.trim() || undefined,
      }));
    }
    this.armedAt = typeof data.armedAt === 'number' ? data.armedAt : null;
    this.stateHelper.persistPanelState();
    this.logger.log(`安防状态已同步至 Leader: mode=${this.currentMode}`);
  }

  /** 跨实例区域配置同步：Follower 收到 zonesConfigured 后对齐区域与 armed 状态 */
  @OnEvent('security.zonesConfigured')
  handleZonesConfiguredSync(data: { zones?: SecurityZone[] }) {
    if (!Array.isArray(data.zones)) return;
    this.zones = data.zones.map((z) => ({
      id: z.id,
      name: z.name,
      sensors: [...(z.sensors || [])],
      armed: z.armed ?? false,
      zoneType: normalizeZoneType(z.zoneType),
      roomId: z.roomId?.trim() || undefined,
    }));
    this.stateHelper.persistPanelState();
  }

  async disarm(opts?: SecurityPanelOptions) {
    // 多副本：Follower 转发至 Leader 执行，避免多实例内存态分裂
    if (this.haLeader.isHaWsFollower()) {
      this.logger.warn('安防撤防请求转发至 Leader 实例执行');
      this.eventBus.emit(HOMEOS_EVENTS.SECURITY_PANEL_REQUEST_SET_MODE, {
        mode: 'disarmed',
        opts,
      });
      return { success: true, mode: 'disarmed' as const, forwarded: true };
    }

    return this.lock.runExclusive(SecurityPanelService.TRANSITION_LOCK_KEY, () =>
      this.disarmInner(opts),
    );
  }

  private async disarmInner(opts?: SecurityPanelOptions) {
    if (this.currentMode === 'disarmed' && opts?.skipActionsIfSameMode !== false && !opts?.force) {
      return {
        success: true,
        mode: 'disarmed',
        actions: { executed: 0, failed: 0, failedItems: [] },
        skipped: true,
      };
    }

    // 两阶段：先执行联动动作（保持旧 mode），再提交撤防状态
    const actionResult = opts?.skipActions
      ? { executed: 0, failed: 0, failedItems: [] }
      : await this.linkageHelper.executeSecurityModeActions('disarmed');

    const degraded = actionResult.failed > 0;

    for (const zone of this.zones) {
      zone.armed = false;
    }
    this.currentMode = 'disarmed';
    this.armedAt = null;

    this.eventBus.emit(HOMEOS_EVENTS.SECURITY_MODE_CHANGED, {
      mode: 'disarmed',
      zones: [],
      zonesDetail: this.zones.map((z) => ({ ...z, sensors: [...z.sensors] })),
      armedAt: null,
      timestamp: new Date().toISOString(),
      source: opts?.source || 'manual',
      degraded,
      failedItems: actionResult.failedItems,
    });

    this.logger.log(`安防已撤防${degraded ? ' [联动降级]' : ''}`);
    this.stateHelper.persistPanelState();
    this.stateHelper.scheduleSecurityEvent('disarm', '撤防');
    return {
      success: !degraded,
      degraded,
      mode: 'disarmed' as const,
      actions: actionResult,
      failedItems: actionResult.failedItems,
    };
  }

  @OnEvent(HA_EVENTS.STATE_CHANGED_COLD_BATCH)
  handleSensorTrigger(payload: HaStateChangeBatchEvent) {
    if (!this.haLeader.isHaWsLeader()) return;
    forEachColdBatchEvent(payload, (event) => {
      this.alarmHelper.handleSensorTrigger(event);
    });
  }

  /**
   * 安全传感器联动：烟雾、燃气、漏水传感器触发时自动关阀 + 排风
   *
   * 仅识别真正的“探测/报警”类 binary_sensor（优先依据 device_class），
   * 并排除家电本体（如燃气热水器/灶具/壁挂炉）的运行状态传感器，
   * 避免把“燃气热水器 火焰有无/水流状态/出水温度”等误判为燃气泄漏。
   */
  @OnEvent(HA_EVENTS.STATE_CHANGED_COLD_BATCH)
  async handleSafetySensor(payload: HaStateChangeBatchEvent) {
    if (!this.haLeader.isHaWsLeader()) return;
    for (const event of coldBatchChanges(payload)) {
      await this.alarmHelper.handleSafetySensor(event);
    }
  }

  async triggerEmergency(action: string) {
    const now = Date.now();
    const cooldownMs = this.appConfig.get('security').emergencyCooldownSec * 1000;
    if (this.emergencyRunning || (cooldownMs > 0 && now - this.lastEmergencyAt < cooldownMs)) {
      return {
        success: false,
        action,
        queued: false,
        reason: this.emergencyRunning ? 'in_progress' : 'cooldown',
      };
    }
    this.lastEmergencyAt = now;

    this.eventBus.emit('security.emergency', {
      action,
      timestamp: new Date().toISOString(),
    });
    this.stateHelper.scheduleSecurityEvent('emergency', `紧急求助: ${action}`);
    this.logger.warn(`🆘 紧急求助触发: ${action}`);

    scheduleBackgroundTask(this.logger, '紧急求助联动', async () => {
      if (this.emergencyRunning) return;
      this.emergencyRunning = true;
      try {
        await this.emergencyRunner.runEmergencyActions();
      } finally {
        this.emergencyRunning = false;
      }
    });

    return { success: true, action, queued: true };
  }

  async getEvents(type?: string, limit?: number) {
    const fetchLimit = resolveNotificationFetchLimit(
      limit,
      this.appConfig.get('frontend'),
      this.appConfig.get('notification'),
    );
    return this.prisma.securityEvent.findMany({
      where: type ? { type } : undefined,
      orderBy: { createdAt: 'desc' },
      take: fetchLimit,
    });
  }
}
