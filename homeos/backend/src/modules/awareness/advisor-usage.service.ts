/**
 * @file advisor-usage.service.ts
 * @module awareness
 * @description 顾问「设备使用统计」最小宿主服务。承载 SmartAdvisorUsageHelper：
 *  - 订阅 HA 冷批量状态变更，跟踪设备开关次数与运行时长并持久化到 DeviceUsageStat；
 *  - 定时（15 分钟）检测「灯关了但空调/媒体还开着」等遗忘场景；
 *  - 暴露使用报告 / 单设备统计 / 使用汇总 / 遗忘设备 / 清除统计等查询入口。
 *
 * 说明：每日建议、习惯推荐、配置洞察、离线基线以及能源 / 环境联动已随对应模型整体移除，
 * 本服务仅恢复 usage 相关能力，不引入 AutomationModule / SceneModule / EnvironmentModule /
 * EnergyModule / SystemSetupModule。
 *
 * 依赖：
 *  - PrismaService：DeviceUsageStat 读写
 *  - AppConfigService：envSensorMap / voice 配置
 *  - EventBusService：TTS 播报与建议推送事件出口
 *  - HaConnectorService / StateStoreService / HaStateChangeRouterService：HA 状态来源
 *  - EntityAreaEnrichmentService：HA area 补全，用于房间标签解析
 *  - DistributedLockService：多副本下遗忘检测串行化
 */
import { ConflictException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OnEvent } from '@nestjs/event-emitter';
import { resolveRoomLabelFromHaAreas } from '@homeos/shared';
import { DistributedLockService } from '../../common/resilience/distributed-lock.service';
import { getErrorMessage } from '../../common/utils';
import type { HaStateChangeBatchEvent } from '../../shared/types';
import { HA_EVENTS } from '../../shared/types';
import { forEachColdBatchEvent } from '../../shared/ha/cold-batch.util';
import { PrismaService } from '../../shared/prisma/service';
import { AppConfigService, APP_CONFIG_UPDATED } from '../../shared/app-config/service';
import { EventBusService } from '../../shared/redis/event-bus.service';
import { HaConnectorService } from '../ha-connector/service';
import { HaStateChangeRouterService } from '../../shared/ha/state-change-router.service';
import { StateStoreService } from '../state-store/service';
import { EntityAreaEnrichmentService } from '../state-store/entity-area-enrichment.service';
import { SmartAdvisorUsageHelper } from './smart-advisor-usage.helper';

/** 遗忘检测分布式锁键（与 HEAD SmartAdvisorService 保持一致） */
const FORGOTTEN_LOCK_KEY = 'smart-advisor-check-forgotten';

/**
 * 设备使用统计宿主：包装 SmartAdvisorUsageHelper，负责订阅 / 定时 / 事件出口。
 */
@Injectable()
export class AdvisorUsageService implements OnModuleInit {
  private readonly logger = new Logger(AdvisorUsageService.name);
  private readonly usage: SmartAdvisorUsageHelper;

  constructor(
    private readonly prisma: PrismaService,
    private readonly appConfig: AppConfigService,
    private readonly eventBus: EventBusService,
    private readonly haConnector: HaConnectorService,
    private readonly stateStore: StateStoreService,
    private readonly stateRouter: HaStateChangeRouterService,
    private readonly entityAreaEnrichment: EntityAreaEnrichmentService,
    private readonly lock: DistributedLockService,
  ) {
    this.usage = new SmartAdvisorUsageHelper({
      prisma: this.prisma,
      appConfig: this.appConfig,
      haConnector: this.haConnector,
      stateStore: this.stateStore,
      stateRouter: this.stateRouter,
      logger: this.logger,
      pushTip: (title, message, category) => this.pushTip(title, message, category),
      roomLabel: (room) => this.roomLabel(room),
      voiceConfig: () => this.appConfig.get('voice'),
      // 最小宿主：不恢复实体 / 自定义 TTS 告警（其配置归一化随顾问栈一并移除）
      entityTtsAlerts: () => [],
      customAlerts: () => [],
      queueSpeak: (message, dedupKey, opts) => this.queueSpeak(message, dedupKey, opts),
    });
  }

  async onModuleInit() {
    await this.usage.buildRoomDeviceMapFromConfig();
  }

  @OnEvent(APP_CONFIG_UPDATED)
  async onAppConfigUpdated(sections: string[]) {
    if (!Array.isArray(sections) || !sections.includes('envSensorMap')) return;
    await this.usage.buildRoomDeviceMapFromConfig();
  }

  get deviceUsage() {
    return this.usage.deviceUsage;
  }

  @OnEvent(HA_EVENTS.STATE_CHANGED_COLD_BATCH)
  trackUsage(payload: HaStateChangeBatchEvent) {
    forEachColdBatchEvent(payload, (event) => {
      this.usage.trackUsage(event);
    });
  }

  getUsageReport() {
    return this.usage.getUsageReport();
  }

  getEntityUsage(entityId: string, days?: number) {
    return this.usage.getEntityUsage(entityId, days);
  }

  getUsageSummary(days?: number) {
    return this.usage.getUsageSummary(days);
  }

  clearUsageStats() {
    return this.usage.clearUsageStats();
  }

  registerRoomDevices(room: string, entityIds: string[]) {
    this.usage.registerRoomDevices(room, entityIds);
  }

  getForgottenDevices() {
    return this.usage.getForgottenDevices();
  }

  detectForgottenDevices(
    entities: Map<string, { state: string; attributes?: Record<string, unknown> }>,
  ) {
    return this.usage.detectForgottenDevices(entities);
  }

  // 遗忘设备检测会查库 + 推送建议，多副本下需分布式锁避免重复检测/重复提醒
  @Cron('*/15 * * * *')
  async checkForgottenCron() {
    try {
      await this.lock.runExclusive(
        FORGOTTEN_LOCK_KEY,
        () => this.usage.checkForgottenCron(),
        10 * 60_000,
      );
    } catch (err) {
      if (err instanceof ConflictException) return; // 其他实例持有锁，跳过本轮
      this.logger.warn(`遗忘设备检测失败: ${getErrorMessage(err)}`);
    }
  }

  private pushTip(title: string, message: string, category: string) {
    this.logger.log(`💡 建议: [${category}] ${title} - ${message}`);
    this.eventBus.emit('advisor.tip', { title, message, category, ts: Date.now() });
  }

  private queueSpeak(message: string, dedupKey: string, opts?: { bypassDnd?: boolean }) {
    void dedupKey;
    void opts;
    this.logger.log(`TTS 播报: ${message}`);
    this.eventBus.emit('tts.speak', { message, ts: Date.now() });
  }

  private roomLabel(room: string): string {
    return resolveRoomLabelFromHaAreas(
      room,
      this.appConfig.get('envSensorMap'),
      this.entityAreaEnrichment.getCachedHaAreas(),
    );
  }
}
