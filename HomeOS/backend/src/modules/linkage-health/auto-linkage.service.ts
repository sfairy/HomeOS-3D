/**
 * 能源 / 环境自动联动服务：把峰谷电价、漏水、燃气、空气质量、异常活动等 HOMEOS_EVENTS 转译为动作。
 *
 * 所属模块：modules/linkage-health（订阅事件，不反向依赖 EnergyModule 破环）。
 * 核心职责：
 *  - 订阅 HOMEOS_EVENTS.ENERGY_* / IAQ_* / WATER_* / WEATHER 等事件；
 *  - 按 AppConfig 阈值决定是否执行场景、切换家庭模式、下发 HA 空调/热水器服务、调用自适应温控；
 *  - 高危异常经 scheduleSecurityEvent 入安防事件流；通知经 NotificationCooldownService 冷却去抖；
 *  - 维护环形 100 条 actionLog 用于联动动作审计与 UI 排查。
 * 关键依赖：AppConfigService、PrismaService、HomeModeService、SceneService、HaConnectorService、AdaptiveClimateService、NotificationCooldownService。
 */

import { Injectable, Logger } from '@nestjs/common';
import { getEntityDomain } from '@homeos/shared';
import { OnEvent } from '@nestjs/event-emitter';
import { AppConfigService } from '../../shared/app-config/service';
import { PrismaService } from '../../shared/prisma/service';
import { HomeModeService } from '../home-mode/service';
import { SceneService } from '../scene/service';
import { HaConnectorService } from '../ha-connector/service';
import { AdaptiveClimateService } from '../environment/adaptive-climate.service';
import { getErrorMessage } from '../../common/utils';
import { NotificationCooldownService } from '../../common/alert-support/notification-cooldown.service';
import { scheduleSecurityEvent } from '../../common/http-security/hazard.util';
import { HOMEOS_EVENTS } from '../../shared/homeos-events';

/**
 * 能源 / 环境自动联动服务。
 *
 * 所属模块：backend/modules/linkage-health
 * 职责：把能源 / 环境异常（峰谷电价、漏水、燃气、空气污染等 HOMEOS_EVENTS）转译为
 *  可配置的自动动作——执行场景、切换家庭模式、调节空调 / 热水器节能，并在联动后
 *  发出通知（带冷却去抖）。
 *  只订阅 energy/iaq/water 模块发出的 HOMEOS_EVENTS，不反向依赖 EnergyModule，
 *  避免循环依赖。
 *  另维护内存环形缓冲 actionLog（上限 100 条）用于联动动作审计与排查。
 * 关键依赖：
 *  - AppConfigService：能源 / 环境联动开关与阈值
 *  - HomeModeService / SceneService：家庭模式切换与场景执行
 *  - HaConnectorService：直接下发 HA 服务（空调 / 热水器）
 *  - AdaptiveClimateService：自适应温控
 *  - NotificationCooldownService：通知冷却去抖
 *  - scheduleSecurityEvent：高危异常入安防事件流
 */
@Injectable()
export class EnergyAutoLinkageService {
  private readonly logger = new Logger(EnergyAutoLinkageService.name);

  /** 联动动作审计（内存环形缓冲）：记录异常→动作闭环，上限 100 条 */
  private readonly actionLog: Array<{ type: string; detail: string; at: string }> = [];
  // 审计环形缓冲容量：100。对应 UI 「最近动作」面板只看几十条，够用且常驻内存不超过 ~40KB。
  private static readonly ACTION_LOG_MAX = 100;

  constructor(
    private readonly appConfig: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly homeMode: HomeModeService,
    private readonly sceneService: SceneService,
    private readonly haConnector: HaConnectorService,
    private readonly adaptiveClimate: AdaptiveClimateService,
    private readonly cooldownService: NotificationCooldownService,
  ) {}

  /** 记录一次联动动作到审计缓冲 */
  private recordAction(type: string, detail: string) {
    this.actionLog.push({ type, detail, at: new Date().toISOString() });
    if (this.actionLog.length > EnergyAutoLinkageService.ACTION_LOG_MAX) {
      this.actionLog.splice(0, this.actionLog.length - EnergyAutoLinkageService.ACTION_LOG_MAX);
    }
  }

  private energyCfg() {
    return this.appConfig.get('energy');
  }

  private iaqCfg() {
    return this.appConfig.get('iaq');
  }

  private waterCfg() {
    return this.appConfig.get('water');
  }

  private inCooldown(key: string): boolean {
    return this.cooldownService.isInCooldown('energy', key);
  }

  private armCooldown(key: string, minutes: number) {
    this.cooldownService.setCooldown('energy', key, minutes);
  }

  private logLinkageFailure(type: string, detail: string) {
    scheduleSecurityEvent(this.prisma, this.logger, type, detail);
  }

  /**
   * 执行联动场景并记录审计；失败入安防事件流。
   *
   * @param sceneId 目标场景 ID，空值直接返回 false。
   * @param reason 联动原因（用于审计日志）。
   * @returns 是否执行成功。
   */
  private async runScene(sceneId: string, reason: string): Promise<boolean> {
    if (!sceneId) return false;
    try {
      await this.sceneService.execute(sceneId);
      this.recordAction('scene', `${reason} → 场景 ${sceneId}`);
      this.logger.log(`能源联动:已执行场景 ${sceneId}(${reason})`);
      return true;
    } catch (err) {
      this.logLinkageFailure(
        'linkage_energy_scene_failed',
        `能源联动场景失败 [${sceneId}]: ${getErrorMessage(err)}`,
      );
      return false;
    }
  }

  private async activateMode(modeId: string, reason: string): Promise<boolean> {
    if (!modeId) return false;
    try {
      await this.homeMode.activate(modeId, { source: 'energy_linkage', reason });
      this.recordAction('mode', `${reason} → 家庭模式 ${modeId}`);
      this.logger.log(`能源联动:已激活家庭模式 ${modeId}(${reason})`);
      return true;
    } catch (err) {
      this.logLinkageFailure(
        'linkage_energy_mode_failed',
        `能源联动家庭模式失败 [${modeId}]: ${getErrorMessage(err)}`,
      );
      return false;
    }
  }

  private async applyClimateEco(reason: string) {
    const cfg = this.energyCfg();
    if (!cfg.linkageClimateApply) return;
    try {
      const r = await this.adaptiveClimate.apply();
      if (r.applied > 0) this.recordAction('climate', `${reason} → 自适应温控 ${r.applied} 台`);
      this.logger.log(`能源联动:自适应温控已应用 ${r.applied} 台(${reason})`);
    } catch (err) {
      this.logLinkageFailure(
        'linkage_energy_climate_failed',
        `能源联动温控失败: ${getErrorMessage(err)}`,
      );
    }
  }

  /**
   * 将热水器切到 eco 模式以节能；仅在 linkageWaterHeaterEco 开启且绑定了实体时执行，
   * 失败入安防事件流。
   */
  private async ecoWaterHeater(reason: string) {
    const cfg = this.energyCfg();
    const entityId = String(cfg.linkageWaterHeaterEntityId || '').trim();
    if (!cfg.linkageWaterHeaterEco || !entityId) return;
    try {
      await this.haConnector.callService('water_heater', 'set_operation_mode', entityId, {
        operation_mode: 'eco',
      });
      this.recordAction('water_heater', `${reason} → 热水器 ${entityId} 切 eco`);
      this.logger.log(`能源联动:热水器 ${entityId} 已切 eco(${reason})`);
    } catch (err) {
      this.logLinkageFailure(
        'linkage_energy_water_heater_failed',
        `能源联动热水器 eco 失败 [${entityId}]: ${getErrorMessage(err)}`,
      );
    }
  }

  /**
   * 能源预算超支事件处理：激活预算超支家庭模式，触发后按配置冷却去抖。
   * 仅在 linkageEnabled 开启且未在冷却期时执行。
   */
  @OnEvent(HOMEOS_EVENTS.ENERGY_BUDGET_EXCEEDED)
  async onBudgetExceeded() {
    const cfg = this.energyCfg();
    if (!cfg.linkageEnabled || this.inCooldown('budget')) return;
    const ok = await this.activateMode(cfg.linkageBudgetModeId, '能源预算超支');
    if (ok) this.armCooldown('budget', cfg.budgetAlertCooldownMin);
  }

  @OnEvent(HOMEOS_EVENTS.ENERGY_ANOMALY)
  async onEnergyAnomaly(data: { entityId?: string; type?: string }) {
    const cfg = this.energyCfg();
    if (!cfg.linkageEnabled) return;
    const key = `anomaly:${data.entityId || data.type || 'global'}`;
    if (this.inCooldown(key)) return;

    const type = data.type || '';
    const reason = `用电异常 ${type}`;
    let acted = false;

    if (type === 'spike' || type === 'sustained_high') {
      await this.applyClimateEco(reason);
      await this.ecoWaterHeater(reason);
      acted = true;
    }

    if (cfg.linkageAnomalySceneId) {
      acted = (await this.runScene(cfg.linkageAnomalySceneId, reason)) || acted;
    }
    if (acted) this.armCooldown(key, cfg.anomalyCooldownMin);
  }

  @OnEvent(HOMEOS_EVENTS.ENV_MOLD_RISK)
  async onMoldRisk(data: { roomId?: string }) {
    const iaq = this.iaqCfg();
    if (!iaq.linkageMoldSceneId) return;
    const key = `mold:${data.roomId || 'global'}`;
    if (this.inCooldown(key)) return;
    const ok = await this.runScene(iaq.linkageMoldSceneId, `霉菌风险 ${data.roomId || ''}`);
    if (ok) this.armCooldown(key, iaq.moldAlertCooldownMin);
  }

  @OnEvent(HOMEOS_EVENTS.ENV_IAQ_THRESHOLD)
  async onIaqThreshold(data: { roomId?: string; iaq?: number }) {
    const iaq = this.iaqCfg();
    const key = `iaq:${data.roomId || 'global'}`;
    if (this.inCooldown(key)) return;

    const reason = `IAQ 超阈值 ${data.roomId || ''} (${data.iaq ?? ''})`;
    let acted = false;

    if (iaq.linkageIaqSceneId) {
      acted = await this.runScene(iaq.linkageIaqSceneId, reason);
      if (acted) this.armCooldown(key, iaq.moldAlertCooldownMin);
      return;
    }

    const fanId = String(iaq.linkageIaqFanEntityId || '').trim();
    if (fanId) {
      try {
        await this.haConnector.callService('fan', 'turn_on', fanId);
        this.logger.log(`IAQ 联动:已开启新风/排风 ${fanId}(${reason})`);
        acted = true;
      } catch (err) {
        this.logLinkageFailure(
          'linkage_energy_iaq_failed',
          `IAQ 联动排风失败 [${fanId}]: ${getErrorMessage(err)}`,
        );
      }
    }

    const dehumId = String(iaq.linkageDehumidifierEntityId || '').trim();
    if (dehumId) {
      try {
        const domain = getEntityDomain(dehumId) || 'humidifier';
        await this.haConnector.callService(domain, 'turn_on', dehumId);
        this.logger.log(`IAQ 联动:已开启除湿 ${dehumId}(${reason})`);
        acted = true;
      } catch (err) {
        this.logLinkageFailure(
          'linkage_energy_iaq_failed',
          `IAQ 联动除湿失败 [${dehumId}]: ${getErrorMessage(err)}`,
        );
      }
    }
    if (acted) this.armCooldown(key, iaq.moldAlertCooldownMin);
  }

  /**
   * 用水异常事件处理：依次尝试执行用水联动场景、激活用水联动模式，
   *  任一成功即按配置冷却去抖；仅在 linkageWaterEnabled 开启时执行。
   *
   * @param data 异常类型、实体 ID 与友好名称（用于审计文案）。
   */
  @OnEvent(HOMEOS_EVENTS.WATER_ANOMALY)
  async onWaterAnomaly(data: { type?: string; entityId?: string; friendlyName?: string }) {
    const water = this.waterCfg();
    if (!water.linkageWaterEnabled) return;
    const key = `water:${data.type || data.entityId || 'global'}`;
    if (this.inCooldown(key)) return;

    const reason = `用水异常 ${data.type || 'unknown'}（${data.friendlyName || data.entityId || ''}）`;
    let acted = false;

    if (water.linkageWaterAnomalySceneId) {
      acted = (await this.runScene(water.linkageWaterAnomalySceneId, reason)) || acted;
    }
    if (!acted && water.linkageWaterAnomalyModeId) {
      acted = (await this.activateMode(water.linkageWaterAnomalyModeId, reason)) || acted;
    }
    if (acted) {
      this.armCooldown(key, water.linkageWaterAnomalyCooldownMin || 30);
    }
  }

  /** 能源自动联动配置与健康快照（供 linkage-health 展示） */
  getStatus() {
    const cfg = this.energyCfg();
    const iaq = this.iaqCfg();
    const water = this.waterCfg();
    const gaps: string[] = [];
    if (!cfg.linkageEnabled) {
      gaps.push('linkageEnabled 未开启');
    }
    if (cfg.linkageEnabled && !cfg.linkageBudgetModeId?.trim()) {
      gaps.push('未配置 linkageBudgetModeId（预算超支联动模式）');
    }
    if (cfg.linkageEnabled && !cfg.linkageAnomalySceneId?.trim()) {
      gaps.push('未配置 linkageAnomalySceneId（用电异常联动场景）');
    }
    if (
      cfg.linkageClimateApply &&
      !cfg.linkageWaterHeaterEntityId?.trim() &&
      cfg.linkageWaterHeaterEco
    ) {
      gaps.push('热水器节能已启用但未绑定 linkageWaterHeaterEntityId');
    }
    if (
      water.linkageWaterEnabled &&
      !water.linkageWaterAnomalySceneId?.trim() &&
      !water.linkageWaterAnomalyModeId?.trim()
    ) {
      gaps.push('用水联动已启用但未配置联动场景或模式');
    }
    return {
      enabled: Boolean(cfg.linkageEnabled),
      gaps,
      config: {
        linkageBudgetModeId: cfg.linkageBudgetModeId || '',
        linkageAnomalySceneId: cfg.linkageAnomalySceneId || '',
        linkageMoldSceneId: iaq.linkageMoldSceneId || '',
        linkageIaqSceneId: iaq.linkageIaqSceneId || '',
        linkageClimateApply: Boolean(cfg.linkageClimateApply),
        linkageWaterHeaterEco: Boolean(cfg.linkageWaterHeaterEco),
        linkageWaterEnabled: Boolean(water.linkageWaterEnabled),
        linkageWaterAnomalySceneId: water.linkageWaterAnomalySceneId || '',
        linkageWaterAnomalyModeId: water.linkageWaterAnomalyModeId || '',
        linkageWaterAnomalyCooldownMin: water.linkageWaterAnomalyCooldownMin || 30,
      },
      recentActions: [...this.actionLog].reverse(),
    };
  }
}
