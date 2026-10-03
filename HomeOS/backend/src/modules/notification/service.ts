/**
 * 通知模块 - 服务
 *
 * 职责：
 * - 通知的创建、持久化、跨实例分发（EventBus + Redis）
 * - 告警规则的 CRUD、条件求值、边沿触发与冷却控制
 * - 设备健康监控（离线 / 低电量 / 健康度）通知
 * - 全屋与用户级别的通知偏好（DND、开关）管理
 * - 订阅领域事件（安防 / 能耗 / 用水 / 环境 / 日程 / EEW 等）并转为通知
 * - 通过外部通道（Email、WebPush）发送通知
 *
 * 依赖：
 * - PrismaService：通知与告警规则持久化
 * - EventEmitter2：本地事件总线（@OnEvent 装饰器）
 * - RedisService / EventBusService：跨实例通知分发
 * - AppConfigService：读取 notification / energy / water 等配置
 * - HaStateChangeRouterService：按订阅者路由 HA 状态变更
 * - AlertRuleWatchIndexService：告警规则实体订阅索引
 * - NotificationCooldownService：通知冷却（去重）管理
 * - TokenVersionCacheService：偏好变更后作废用户 JWT 缓存
 * - EntityAreaEnrichmentService：解析实体所属房间标签
 * - ChannelsService：外部消息通道服务（Email、WebPush）
 *
 * 设计说明：
 * 该服务将具体逻辑委托给多个 Helper 类（分布于 notification-*.helper.ts / notification-stats.util.ts）
 * （Dispatch / Rules / Settings / Prune / EventHandlers），
 * 自身仅负责 DI 组装与 @OnEvent 注册，保持服务文件可读性。
 */
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../shared/prisma/service';
import { RedisService } from '../../shared/redis/service';
import { EventBusService } from '../../shared/redis/event-bus.service';
import { AppConfigService } from '../../shared/app-config/service';
import { isDndActive as isDndActiveUtil } from '@homeos/shared';
import { mapNotificationRow, buildNotificationStats, clampNotificationStatsHours, prismaNotificationSourceSql, prismaNotificationSourceWhere, resolveNotificationTimeGranularity } from './stats.util';
import { NotificationRulesHelper } from './rules.helper';
import { NotificationDispatchHelper } from './notification-dispatch.helper';
import { NotificationPruneHelper } from './notification-prune.helper';
import { NotificationSettingsHelper } from './notification-settings.helper';
import { NotificationEventHandlersHelper } from './event-handlers.helper';
import { HaStateChangeRouterService } from '../../shared/ha/state-change-router.service';
import { AlertRuleWatchIndexService } from '../../shared/ha/watch-index.services';
import { HA_EVENTS, type HaStateChangeBatchEvent } from '../../shared/types';
import { forEachColdBatchEvent } from '../../shared/ha/cold-batch.util';
import { NotificationCooldownService } from '../../common/alert-support/notification-cooldown.service';
import { HaWsLeaderService } from '../ha-connector/ha-ws-leader.service';
import { type LanNotificationChannel } from '../../common/alert-support/notification-channels.util';
import { TokenVersionCacheService } from '../../common/http-security/token-version-cache.service';
import { EntityAreaEnrichmentService } from '../state-store/entity-area-enrichment.service';
import { ChannelsService } from '../channels/service';
import { resolveRoomLabelFromHaAreas, type AlertLevel, type AlertRule } from '@homeos/shared';
import { isEntityAllowedByRestrictions } from '../../common/http-security/device-access.util';
import { EEW_EVENTS } from '../earthquake/types';
import { HOMEOS_EVENTS } from '../../shared/homeos-events';
import { Prisma } from '../../generated/prisma/client';
import { getErrorMessage } from '../../common/utils';

export type { AlertLevel, AlertRule };

/** 告警规则条件修订记录。条件被修改时，旧条件会被记录到修订历史中。 */
export interface AlertRuleConditionRevision {
  condition: string;
  at: string;
}

/** 通知实体视图。对应数据库 Notification 表的一行，deliveryChannels 从 JSON 解析。 */
export interface Notification {
  id: string;
  level: AlertLevel;
  message: string;
  entityId?: string;
  source: string;
  read: boolean;
  createdAt: string;
  deliveredAt?: string;
  deliveryChannels?: string[];
  channels?: LanNotificationChannel[];
}

/** 通知偏好开关集（全屋或用户级别）。所有字段可选，缺省回退到默认值。 */
export interface NotificationPreferenceToggles {
  globalNotifyEnabled?: boolean;
  importantNotifyEnabled?: boolean;
  offlineNotifyEnabled?: boolean;
  lowBatteryNotifyEnabled?: boolean;
  dndStart?: number;
  dndEnd?: number;
}

/** 通知设置视图。合并全屋与用户偏好后的最终结果，dndActive 表示当前是否处于免打扰时段。 */
export interface NotificationSettingsView extends NotificationPreferenceToggles {
  dndActive: boolean;
}

/**
 * 通知服务（DI 角色：核心业务服务）。
 * 实现 OnModuleInit，启动时刷新规则缓存并加载条件修订历史。
 * 对外导出供场景、脚本、安防等模块调用。
 */
@Injectable()
export class NotificationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationService.name);
  private alertEdgePersistTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly ALERT_EDGE_REDIS_KEY = 'homeos:alert:rule-edge';

  /** 通知配置快捷访问器 */
  private get cfg() {
    return this.appConfig.get('notification');
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly redisService: RedisService,
    private readonly eventBus: EventBusService,
    private readonly appConfig: AppConfigService,
    private readonly stateRouter: HaStateChangeRouterService,
    private readonly alertRuleWatchIndex: AlertRuleWatchIndexService,
    private readonly cooldownService: NotificationCooldownService,
    private readonly haLeader: HaWsLeaderService,
    private readonly tokenVersionCache: TokenVersionCacheService,
    private readonly entityAreaEnrichment: EntityAreaEnrichmentService,
    private readonly channelsService: ChannelsService,
  ) {}
  /** 延迟初始化的通知清理 Helper（合并并发 prune，避免批量通知时重复 count/delete） */
  private _pruneHelper: NotificationPruneHelper | null = null;
  private get pruneHelper(): NotificationPruneHelper {
    if (!this._pruneHelper) {
      this._pruneHelper = new NotificationPruneHelper({
        logger: this.logger,
        prisma: this.prisma,
        getCfg: () => this.cfg,
      });
    }
    return this._pruneHelper;
  }

  /** 延迟初始化的设置 Helper（全屋配置 + 用户偏好读写） */
  private _settingsHelper: NotificationSettingsHelper | null = null;
  private get settingsHelper(): NotificationSettingsHelper {
    if (!this._settingsHelper) {
      this._settingsHelper = new NotificationSettingsHelper({
        prisma: this.prisma,
        appConfig: this.appConfig,
        getCfg: () => this.cfg,
        isDndActive: () => this.isDndActive(),
        invalidateUserAuth: (userId) => this.tokenVersionCache.invalidate(userId),
      });
    }
    return this._settingsHelper;
  }

  /** 延迟初始化的告警规则 Helper（CRUD + 条件求值 + 修订历史） */
  private _rulesHelper: NotificationRulesHelper | null = null;
  private get rulesHelper(): NotificationRulesHelper {
    if (!this._rulesHelper) {
      this._rulesHelper = new NotificationRulesHelper({
        logger: this.logger,
        prisma: this.prisma,
        alertRuleWatchIndex: this.alertRuleWatchIndex,
        isDndActive: () => this.isDndActive(),
        isAlertBypassDnd: () => this.appConfig.get('security').alertBypassDnd === true,
        isInCooldown: (key) => this.isInCooldown(key),
        setCooldown: (key, minutes) => this.setCooldown(key, minutes),
        notify: (level, message, source, entityId, opts) =>
          this.notify(level, message, source, entityId, opts),
        persistEdgeState: (keys) => this.schedulePersistAlertEdge(keys),
        restoreEdgeState: () => this.restoreAlertEdge(),
      });
    }
    return this._rulesHelper;
  }

  /** 延迟初始化的通知分发 Helper（入库 + EventBus 发布） */
  private _dispatchHelper: NotificationDispatchHelper | null = null;
  private get dispatchHelper(): NotificationDispatchHelper {
    if (!this._dispatchHelper) {
      this._dispatchHelper = new NotificationDispatchHelper({
        logger: this.logger,
        prisma: this.prisma,
        redisService: this.redisService,
        eventBus: this.eventBus,
        getCfg: () => this.cfg,
        schedulePrune: () => this.pruneHelper.schedulePruneOldNotifications(),
        channelsService: this.channelsService,
      });
    }
    return this._dispatchHelper;
  }

  /** 延迟初始化的事件处理器 Helper（领域事件 → 通知） */
  private _eventHandlersHelper: NotificationEventHandlersHelper | null = null;
  private get eventHandlersHelper(): NotificationEventHandlersHelper {
    if (!this._eventHandlersHelper) {
      this._eventHandlersHelper = new NotificationEventHandlersHelper({
        appConfig: this.appConfig,
        stateRouter: this.stateRouter,
        notify: (level, message, source, entityId, opts) =>
          this.notify(level, message, source, entityId, opts),
        isInCooldown: (key) => this.isInCooldown(key),
        setCooldown: (key, minutes) => this.setCooldown(key, minutes),
        checkDeviceOffline: (entityId, friendlyName) =>
          this.checkDeviceOffline(entityId, friendlyName),
        checkLowBattery: (entityId, friendlyName, level) =>
          this.checkLowBattery(entityId, friendlyName, level),
        evaluateRules: (entityId, state, attributes) =>
          this.rulesHelper.evaluateRules(entityId, state, attributes),
        resolveRoomLabel: (roomId) => this.resolveNotificationRoomLabel(roomId),
      });
    }
    return this._eventHandlersHelper;
  }
  /**
   * 解析房间 ID 为可读标签（用于环境类通知文案）。
   * @param roomId HA 区域 ID，空值时返回"环境"
   * @returns 房间中文名称
   */
  private resolveNotificationRoomLabel(roomId?: string): string {
    if (!roomId?.trim()) return '环境';
    return resolveRoomLabelFromHaAreas(
      roomId.trim(),
      this.appConfig.get('envSensorMap'),
      this.entityAreaEnrichment.getCachedHaAreas(),
    );
  }

  /**
   * 模块初始化：刷新规则缓存、加载条件修订历史、调度首次清理。
   * 使用 setImmediate 确保清理不阻塞模块启动。
   */
  async onModuleInit() {
    this.logger.log('通知服务已启动 (DB 持久化)');
    await this.rulesHelper.refreshRulesCache();
    await this.rulesHelper.loadConditionHistory();
    await this.rulesHelper.loadEdgeState();
    setImmediate(() => this.pruneHelper.schedulePruneOldNotifications());
  }

  /** 模块销毁时清理通知清理 Helper 的防抖定时器 */
  onModuleDestroy() {
    if (this.alertEdgePersistTimer) {
      clearTimeout(this.alertEdgePersistTimer);
      this.alertEdgePersistTimer = null;
    }
    this._pruneHelper?.dispose();
  }

  private schedulePersistAlertEdge(keys: string[]): void {
    if (this.alertEdgePersistTimer) clearTimeout(this.alertEdgePersistTimer);
    this.alertEdgePersistTimer = setTimeout(() => {
      this.alertEdgePersistTimer = null;
      void this.redisService
        .set(NotificationService.ALERT_EDGE_REDIS_KEY, JSON.stringify(keys), 7 * 24 * 3600)
        .catch((err) => this.logger.debug(`告警边沿状态持久化失败: ${getErrorMessage(err)}`));
    }, 200);
  }

  private async restoreAlertEdge(): Promise<string[]> {
    try {
      const raw = await this.redisService.get(NotificationService.ALERT_EDGE_REDIS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
    } catch (err) {
      this.logger.debug(`恢复告警边沿状态失败: ${getErrorMessage(err)}`);
      return [];
    }
  }

  /**
   * 发送通知（委托给分发 Helper）。
   * @param level 告警级别
   * @param message 通知文案
   * @param source 通知来源标识（如 system / device-monitor / alert-rule）
   * @param entityId 关联的 HA 实体 ID（用于 ACL 过滤）
   * @param opts 可选，指定投递渠道
   * @returns 创建的通知对象；若被全局开关或重要通知开关拦截则返回 null
   */
  async notify(
    level: AlertLevel,
    message: string,
    source: string = 'system',
    entityId?: string,
    opts?: { channels?: string[]; bypassDnd?: boolean; title?: string },
  ): Promise<Notification | null> {
    return this.dispatchHelper.notify(level, message, source, entityId, opts);
  }

  /**
   * 设备离线检查并发送通知。
   * 受全局通知开关与离线通知开关控制，冷却期内不重复通知。
   * @param entityId HA 实体 ID
   * @param friendlyName 设备友好名称（缺省回退到 entityId）
   */
  async checkDeviceOffline(entityId: string, friendlyName: string) {
    const cfg = this.appConfig.get('notification');
    if (cfg.globalNotifyEnabled === false || cfg.offlineNotifyEnabled === false) return;

    const cooldownKey = `offline:${entityId}`;
    if (this.isInCooldown(cooldownKey)) return;

    const name = friendlyName || entityId;
    const sent = await this.notify('warn', `${name} 已离线`, 'device-monitor', entityId);
    if (!sent) return;
    this.setCooldown(cooldownKey, cfg.offlineCooldownMin);
  }

  /**
   * 低电量检查并发送通知。
   * 受全局通知开关与低电量通知开关控制，冷却期内不重复通知。
   * @param entityId HA 实体 ID
   * @param friendlyName 设备友好名称
   * @param level 当前电量百分比
   */
  async checkLowBattery(entityId: string, friendlyName: string, level: number) {
    const cfg = this.appConfig.get('notification');
    if (cfg.globalNotifyEnabled === false || cfg.lowBatteryNotifyEnabled === false) return;

    const cooldownKey = `lowbattery:${entityId}`;
    if (this.isInCooldown(cooldownKey)) return;

    const name = friendlyName || entityId;
    const sent = await this.notify('warn', `${name} 电量低 (${level}%)`, 'device-monitor', entityId);
    if (!sent) return;
    this.setCooldown(cooldownKey, this.appConfig.get('notification').lowBatteryCooldownMin);
  }

  /** 设备寿命健康度过低提醒（默认 12h 冷却） */
  async checkDeviceHealth(
    entityId: string,
    friendlyName: string,
    healthScore: number,
    tip: string,
  ) {
    const cfg = this.appConfig.get('notification');
    if (cfg.globalNotifyEnabled === false) return;
    const cooldownKey = `device_health:${entityId}`;
    if (this.isInCooldown(cooldownKey)) return;
    const name = friendlyName || entityId;
    await this.notify(
      'warn',
      `${name} 健康度 ${healthScore}%（${tip}）`,
      'device-health',
      entityId,
    );
    this.setCooldown(cooldownKey, 12 * 60);
  }

  /** 判断当前时刻是否处于免打扰时段。 */
  private isDndActive(): boolean {
    const cfg = this.cfg;
    return isDndActiveUtil(new Date().getHours(), cfg.dndStart, cfg.dndEnd);
  }

  /** 判断指定冷却 key 是否仍在冷却期内。 */
  private isInCooldown(key: string): boolean {
    return this.cooldownService.isInCooldown('notify', key);
  }

  /** 设置指定冷却 key 的冷却时长（分钟）。 */
  private setCooldown(key: string, minutes: number) {
    this.cooldownService.setCooldown('notify', key, minutes);
  }
  // ======== 持久化查询 ========

  /**
   * 获取通知列表。
   * @param limit 返回条数上限（默认 50）
   * @param source 可选，按来源过滤
   * @param restrictions 可选，实体访问前缀白名单（非 admin 用户）；命中白名单外的
   *        实体通知（安防/门锁等）将被过滤，避免越权看到受限设备相关告警
   * @returns 通知数组（按创建时间倒序）
   */
  async getNotifications(
    limit: number = 50,
    source?: string,
    restrictions?: string[],
  ): Promise<Notification[]> {
    // 受限用户（非 admin）把实体 ACL 下推为 DB 条件，避免「先分页再过滤」导致可见条数被饿死；
    // 下推条件为 startsWith 前缀匹配，与 isEntityAllowedByRestrictions 语义等价（domain-only 亦被 startsWith 覆盖）
    const aclWhere: Prisma.NotificationWhereInput | null = restrictions?.length
      ? {
          OR: [
            // 未绑定实体的通知（系统公告等）不参与实体级 ACL
            { entityId: null },
            ...restrictions.map((prefix) => ({ entityId: { startsWith: prefix } })),
          ],
        }
      : null;
    // 多取 10 倍再过滤：即使 ACL 下推，仍为后续二次校验留出余量
    const fetchLimit = Math.min(Math.max(limit, 10) * 10, 2000);
    const records = await this.prisma.notification.findMany({
      where: {
        ...(source ? { source } : {}),
        ...(aclWhere ?? {}),
      },
      orderBy: { createdAt: 'desc' },
      take: fetchLimit,
    });
    const list = records.map(mapNotificationRow);
    if (!restrictions?.length) return list.slice(0, limit);
    // 二次校验：复用统一 ACL 判定兜底，防止下推条件与运行时判定出现偏差
    return list
      .filter((n) => {
        // 未绑定实体的通知（如系统公告）不参与实体级 ACL
        if (!n.entityId) return true;
        return isEntityAllowedByRestrictions(n.entityId, restrictions);
      })
      .slice(0, limit);
  }

  /**
   * 按多个来源获取通知。
   * @param sources 来源标识数组
   * @param limit 返回条数上限（默认 30）
   * @returns 通知数组；sources 为空时返回空数组
   */
  async getNotificationsBySources(sources: string[], limit = 30): Promise<Notification[]> {
    if (!sources.length) return [];
    const records = await this.prisma.notification.findMany({
      where: { source: { in: sources } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return records.map(mapNotificationRow);
  }

  /**
   * 获取通知统计数据。
   * 包含总数 / 未读 / 已投递 / 按来源 / 按级别 / 时间序列聚合。
   * @param hours 统计时间窗口（小时），会被 clamp 到 1-720
   * @param source 可选，按来源过滤
   */
  async getStats(hours?: number, source?: string) {
    const windowHours = clampNotificationStatsHours(hours, 24);
    const since = new Date(Date.now() - windowHours * 3600_000);
    const sourceFilter = source?.trim() || '';
    const sourceWhere = sourceFilter ? prismaNotificationSourceWhere(sourceFilter) : undefined;
    const sourceSql = sourceFilter ? prismaNotificationSourceSql(sourceFilter) : Prisma.empty;
    const granularity = resolveNotificationTimeGranularity(windowHours);
    const truncUnit = granularity === 'hour' ? 'hour' : 'day';

    const where = {
      createdAt: { gte: since },
      ...(sourceWhere || {}),
    };

    const [total, unread, delivered, sourceRows, levelRows, timeRows] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { ...where, read: false } }),
      this.prisma.notification.count({ where: { ...where, deliveredAt: { not: null } } }),
      this.prisma.notification.groupBy({
        by: ['source'],
        where,
        _count: { _all: true },
      }),
      this.prisma.notification.groupBy({
        by: ['level'],
        where,
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<Array<{ bucket: Date; count: number }>>`
        SELECT date_trunc(${truncUnit}, "createdAt") AS bucket, COUNT(*)::int AS count
        FROM "Notification"
        WHERE "createdAt" >= ${since}
        ${sourceSql}
        GROUP BY bucket
        ORDER BY bucket ASC
      `,
    ]);

    return buildNotificationStats({
      total,
      unread,
      delivered,
      windowHours,
      sourceRows: sourceRows.map((row) => ({
        source: row.source,
        count: row._count._all,
      })),
      levelRows: levelRows.map((row) => ({
        level: row.level,
        count: row._count._all,
      })),
      timeRows,
    });
  }

  /** 标记单条通知为已读。 */
  async markAsRead(id: string) {
    await this.prisma.notification.updateMany({
      where: { id, read: false },
      data: { read: true },
    });
  }

  /** 将全部通知标记为已读，返回更新条数。 */
  async markAllAsRead() {
    const result = await this.prisma.notification.updateMany({
      where: { read: false },
      data: { read: true },
    });
    return { updated: result.count };
  }

  /** 清空所有通知。 */
  async clearAll() {
    const count = await this.prisma.notification.count();
    await this.prisma.notification.deleteMany();
    this.logger.log(`已清理 ${count} 条历史通知`);
    return { deleted: count };
  }

  /**
   * 按来源清空通知。
   * @param sources 来源标识数组
   * @returns 删除条数
   */
  async clearBySources(sources: string[]): Promise<{ deleted: number }> {
    if (!sources.length) return { deleted: 0 };
    const result = await this.prisma.notification.deleteMany({
      where: { source: { in: sources } },
    });
    if (result.count > 0) {
      this.logger.log(`已清理 ${result.count} 条来源为 [${sources.join(', ')}] 的通知`);
    }
    return { deleted: result.count };
  }
  // ======== 告警规则（委托 rules helper） ========

  /** 获取指定规则的的条件修订历史。 */
  getRuleConditionHistory(ruleId: string) {
    return this.rulesHelper.getRuleConditionHistory(ruleId);
  }

  /** 获取全部告警规则列表。 */
  async getRules() {
    return this.rulesHelper.getRules();
  }

  /**
   * 新增告警规则。
   * @param rule 规则定义
   */
  async addRule(rule: AlertRule) {
    return this.rulesHelper.addRule(rule);
  }

  /**
   * 更新告警规则（部分字段）。
   * @param ruleId 规则 ID
   * @param partial 待更新字段
   */
  async updateRule(ruleId: string, partial: Partial<AlertRule>) {
    return this.rulesHelper.updateRule(ruleId, partial);
  }

  /**
   * 模拟评估告警条件（不触发通知）。
   * @param condition 条件表达式
   * @param state 实体状态
   * @param attributes 实体属性
   */
  testCondition(condition: string, state: string, attributes?: Record<string, unknown>) {
    return this.rulesHelper.testCondition(condition, state, attributes);
  }

  /**
   * 删除告警规则。
   * @param ruleId 规则 ID
   */
  async deleteRule(ruleId: string) {
    return this.rulesHelper.deleteRule(ruleId);
  }

  // ======== 通知设置 ========

  /**
   * 获取通知设置视图（合并全屋与用户偏好）。
   * @param userId 当前用户 ID（可选）
   * @param preloadedPrefs JWT 中预加载的偏好（避免额外 DB 查询）
   */
  async getSettings(
    userId?: string,
    preloadedPrefs?: NotificationPreferenceToggles,
  ): Promise<NotificationSettingsView> {
    return this.settingsHelper.getSettings(userId, preloadedPrefs);
  }

  /**
   * 更新通知设置（全屋或用户级别）。
   * @param settings 设置项
   * @param userId 当前用户 ID（可选）
   * @param role 当前用户角色（admin 写全屋；非 admin 仅 toggle 写 prefs）
   */
  async updateSettings(
    settings: NotificationPreferenceToggles,
    userId?: string,
    role?: string,
  ) {
    return this.settingsHelper.updateSettings(settings, userId, role);
  }

  /**
   * 更新当前用户的通知偏好（写入 User.preferences）。
   * @param userId 用户 ID
   * @param settings 偏好开关
   */
  async updateUserPreferences(userId: string, settings: NotificationPreferenceToggles) {
    return this.settingsHelper.updateUserPreferences(userId, settings);
  }
  // ======== 事件处理（委托 event-handlers helper，保留 @OnEvent 注册） ========

  /** 安防告警事件 → 持久化通知（站内 + Socket + TTS） */
  @OnEvent('security.alarm')
  async handleSecurityAlarm(
    data: Parameters<NotificationEventHandlersHelper['handleSecurityAlarm']>[0],
  ) {
    return this.eventHandlersHelper.handleSecurityAlarm(data);
  }

  /** 紧急一键求救事件 → 立即推送 danger 通知 */
  @OnEvent('security.emergency')
  async handleEmergency(data: Parameters<NotificationEventHandlersHelper['handleEmergency']>[0]) {
    return this.eventHandlersHelper.handleEmergency(data);
  }

  /** 日程提醒到期事件 → info 通知 */
  @OnEvent('schedule.reminder')
  async handleScheduleReminder(
    data: Parameters<NotificationEventHandlersHelper['handleScheduleReminder']>[0],
  ) {
    return this.eventHandlersHelper.handleScheduleReminder(data);
  }

  /** 能耗异常事件（待机过高/突增/持续高负荷）→ 通知 */
  @OnEvent('energy.anomaly')
  async handleEnergyAnomaly(
    data: Parameters<NotificationEventHandlersHelper['handleEnergyAnomaly']>[0],
  ) {
    return this.eventHandlersHelper.handleEnergyAnomaly(data);
  }

  /** 能源预算超支事件 → 告警通知 */
  @OnEvent('energy.budgetExceeded')
  async handleBudgetExceeded(
    data: Parameters<NotificationEventHandlersHelper['handleBudgetExceeded']>[0],
  ) {
    return this.eventHandlersHelper.handleBudgetExceeded(data);
  }

  /** 用水异常事件（持续水流/超量）→ danger 通知 */
  @OnEvent('water.anomaly')
  async handleWaterAnomaly(
    data: Parameters<NotificationEventHandlersHelper['handleWaterAnomaly']>[0],
  ) {
    return this.eventHandlersHelper.handleWaterAnomaly(data);
  }

  /** 环境霉菌风险事件 → 告警通知 */
  @OnEvent('env.moldRisk')
  async handleMoldRisk(data: Parameters<NotificationEventHandlersHelper['handleMoldRisk']>[0]) {
    return this.eventHandlersHelper.handleMoldRisk(data);
  }

  /** 环境 IAQ 超阈值事件 → warn 通知 */
  @OnEvent('env.iaqThreshold')
  async handleIaqThreshold(
    data: Parameters<NotificationEventHandlersHelper['handleIaqThreshold']>[0],
  ) {
    return this.eventHandlersHelper.handleIaqThreshold(data);
  }

  /** HomeOS 自动化通知事件 → 站内通知 */
  @OnEvent('notification.homeos.send')
  async handleHomeosAutomationNotify(
    data: Parameters<NotificationEventHandlersHelper['handleHomeosAutomationNotify']>[0],
  ) {
    return this.eventHandlersHelper.handleHomeosAutomationNotify(data);
  }

  /** 自动化执行失败事件 → warn 站内通知 */
  @OnEvent('automation.failed')
  async handleAutomationFailed(
    data: Parameters<NotificationEventHandlersHelper['handleAutomationFailed']>[0],
  ) {
    return this.eventHandlersHelper.handleAutomationFailed(data);
  }

  /** 自动化触发被丢弃（并发超限）事件 → warn 站内通知 */
  @OnEvent('automation.dropped')
  async handleAutomationDropped(
    data: Parameters<NotificationEventHandlersHelper['handleAutomationDropped']>[0],
  ) {
    return this.eventHandlersHelper.handleAutomationDropped(data);
  }

  /** 智能顾问建议事件 → 站内通知 */
  @OnEvent('advisor.tip')
  async handleAdvisorTip(data: Parameters<NotificationEventHandlersHelper['handleAdvisorTip']>[0]) {
    return this.eventHandlersHelper.handleAdvisorTip(data);
  }

  /** 墙面板低电量 → 站内通知 */
  @OnEvent(HOMEOS_EVENTS.CLIENT_POWER_LOW)
  async handleClientPowerLow(
    data: Parameters<NotificationEventHandlersHelper['handleClientPowerLow']>[0],
  ) {
    return this.eventHandlersHelper.handleClientPowerLow(data);
  }

  /** 墙面板充满 → 站内通知 */
  @OnEvent(HOMEOS_EVENTS.CLIENT_POWER_CHARGED)
  async handleClientPowerCharged(
    data: Parameters<NotificationEventHandlersHelper['handleClientPowerCharged']>[0],
  ) {
    return this.eventHandlersHelper.handleClientPowerCharged(data);
  }

  /** 地震 EEW 实时预警事件 → danger 通知（站内 + Socket） */
  @OnEvent(EEW_EVENTS.ALERT)
  async handleEarthquakeEewAlert(
    data: Parameters<NotificationEventHandlersHelper['handleEarthquakeEewAlert']>[0],
  ) {
    return this.eventHandlersHelper.handleEarthquakeEewAlert(data);
  }

  /** 地震确认通报（迟到台网）→ warn 通知，不全屏 */
  @OnEvent(EEW_EVENTS.CONFIRMATION)
  async handleEarthquakeEewConfirmation(
    data: Parameters<NotificationEventHandlersHelper['handleEarthquakeEewConfirmation']>[0],
  ) {
    return this.eventHandlersHelper.handleEarthquakeEewConfirmation(data);
  }

  /** HA 状态变更（冷路径）→ 设备健康检查（离线/低电量） */
  @OnEvent(HA_EVENTS.STATE_CHANGED_COLD_BATCH)
  handleStateChanged(payload: HaStateChangeBatchEvent) {
    forEachColdBatchEvent(payload, (event) => {
      // 多实例下仅 Leader 实例执行（边沿/健康状态为进程内存，避免双副本重复检查与通知）
      if (!this.haLeader.isHaWsLeader()) return;
      this.eventHandlersHelper.handleStateChanged(event);
    });
  }

  /** HA 状态变更（冷路径）→ 告警规则条件求值（边沿触发） */
  @OnEvent(HA_EVENTS.STATE_CHANGED_COLD_BATCH)
  handleAlertRuleStateChanged(payload: HaStateChangeBatchEvent) {
    forEachColdBatchEvent(payload, (event) => {
      // 多实例下仅 Leader 实例执行（边沿匹配态 Redis 共享，冷却已落库）
      if (!this.haLeader.isHaWsLeader()) return;
      this.eventHandlersHelper.handleAlertRuleStateChanged(event);
    });
  }
}