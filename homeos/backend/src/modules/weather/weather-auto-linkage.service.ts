/**
 * 极端天气安全联动服务
 *
 * 职责：监听 weather.alert 事件，按等级门槛过滤（默认 ≥ 橙色），
 *  用 NotificationCooldownService 的 weather: 命名空间去重后，
 *  对红色预警执行安全联动（HA 场景 + 家庭模式），联动动作经 scheduleSecurityEvent 审计。
 */
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AppConfigService } from '../../shared/app-config/service';
import { PrismaService } from '../../shared/prisma/service';
import { NotificationCooldownService } from '../../common/alert-support/notification-cooldown.service';
import { HomeModeService } from '../home-mode/service';
import { HaConnectorService } from '../ha-connector/service';
import { NotificationService } from '../notification/service';
import { getEntityDomain } from '@homeos/shared';
import { getErrorMessage } from '../../common/utils';
import { scheduleSecurityEvent } from '../../common/http-security/hazard.util';
import { HOMEOS_EVENTS } from '../../shared/homeos-events';
import type { WeatherAlert } from '../system/ops/external-weather-alerts.helper';

const LEVEL_PRIORITY: Record<string, number> = { yellow: 1, orange: 2, red: 3 };

/** weather.alert 事件载荷（由 WeatherWatchService 广播） */
interface WeatherAlertEventPayload {
  alert: WeatherAlert;
  level: string;
}

@Injectable()
/**
 * WeatherAutoLinkageService：Nest @Injectable 服务。
 * - 职责：承载域内核心业务逻辑；
 * - 装配：由对应 Module 的 providers 数组注入；
 * - 生命周期：可能实现 onModuleInit/onModuleDestroy（连接/订阅管理）；
 */
export class WeatherAutoLinkageService {
  private readonly logger = new Logger(WeatherAutoLinkageService.name);

  constructor(
    private readonly appConfig: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly cooldownService: NotificationCooldownService,
    private readonly haConnector: HaConnectorService,
    private readonly homeMode: HomeModeService,
    private readonly notificationService: NotificationService,
  ) {}

  /** 读取 external 配置（家庭坐标 / 预警阈值 / 联动场景与模式）。 */
  private linkageCfg() {
    return this.appConfig.get('external');
  }

  /**
   * weather.alert 事件处理器：按等级门槛过滤后，对红色预警执行安全联动
   * （关窗 / 拉帘 / 布防场景 + 家庭模式）。联动动作失败经 scheduleSecurityEvent 审计，
   * 联动成功后写入冷却（默认 120 分钟）避免短时间内重复触发。
   */
  @OnEvent(HOMEOS_EVENTS.WEATHER_ALERT)
  async onWeatherAlert(payload: WeatherAlertEventPayload) {
    if (!payload || !payload.alert) return;
    const cfg = this.linkageCfg();
    if (cfg.weatherAlertEnabled === false) return;

    const alert = payload.alert;
    const level = String(alert.level || payload.level || 'yellow');
    const priority = LEVEL_PRIORITY[level] ?? LEVEL_PRIORITY.yellow;

    // 等级门槛过滤（默认 ≥ 橙色）
    const thresholdPriority =
      LEVEL_PRIORITY[cfg.weatherAlertNotifyLevel] ?? LEVEL_PRIORITY.orange;
    if (priority < thresholdPriority) return;

    const key = `alert:${this.alertKey(alert)}`;
    if (this.cooldownService.isInCooldown('weather', key)) return;

    const reason = `极端天气 ${alert.type || alert.title}（${level}）`;
    let acted = false;

    // 红色预警执行安全联动（关窗/拉帘/布防场景 + 家庭模式）
    if (priority >= LEVEL_PRIORITY.red) {
      if (cfg.weatherAlertSceneId) {
        acted = (await this.runScene(cfg.weatherAlertSceneId, reason)) || acted;
      }
      if (cfg.weatherAlertModeId) {
        acted = (await this.activateMode(cfg.weatherAlertModeId, reason)) || acted;
      }
    }

    if (acted) {
      this.cooldownService.setCooldown('weather', key, cfg.weatherAlertCooldownMin || 120);
      await this.notificationService.notify(
        'warn',
        `${reason}：已自动执行安全联动`,
        'weather-linkage',
        key,
        { channels: ['in_app', 'socket'] },
      );
    }
  }

  /** 预警去重键（与 Watch 服务的 alertKey 保持一致） */
  private alertKey(alert: WeatherAlert): string {
    const base = `${alert.level}:${alert.type || alert.title}:${alert.effectiveFrom || ''}`;
    return base.replace(/\s+/g, '').slice(0, 120);
  }

  private async runScene(sceneId: string, reason: string): Promise<boolean> {
    if (!sceneId) return false;
    try {
      await this.haConnector.callService(
        getEntityDomain(sceneId) || 'scene',
        'turn_on',
        sceneId,
        {},
      );
      this.logger.log(`天气联动:已执行场景 ${sceneId}(${reason})`);
      return true;
    } catch (err) {
      scheduleSecurityEvent(
        this.prisma,
        this.logger,
        'linkage_weather_scene_failed',
        `天气联动场景失败 [${sceneId}]: ${getErrorMessage(err)}`,
      );
      return false;
    }
  }

  /** 激活家庭模式（如「安全防护」）；失败写入 hazard 安全审计日志。 */
  private async activateMode(modeId: string, reason: string): Promise<boolean> {
    if (!modeId) return false;
    try {
      await this.homeMode.activate(modeId, { source: 'weather_linkage', reason });
      this.logger.log(`天气联动:已激活家庭模式 ${modeId}(${reason})`);
      return true;
    } catch (err) {
      scheduleSecurityEvent(
        this.prisma,
        this.logger,
        'linkage_weather_mode_failed',
        `天气联动家庭模式失败 [${modeId}]: ${getErrorMessage(err)}`,
      );
      return false;
    }
  }

  /** 天气联动状态快照（供诊断面板展示） */
  getStatus() {
    const cfg = this.linkageCfg();
    const gaps: string[] = [];
    if (cfg.weatherAlertEnabled === false) {
      gaps.push('天气预警联动未开启');
    } else if (!cfg.weatherAlertSceneId?.trim() && !cfg.weatherAlertModeId?.trim()) {
      gaps.push('未配置红色预警联动场景或家庭模式（高级参数 → 外部集成 → 天气 API）');
    }
    return {
      enabled: cfg.weatherAlertEnabled !== false,
      notifyLevel: cfg.weatherAlertNotifyLevel || 'orange',
      sceneId: cfg.weatherAlertSceneId || '',
      modeId: cfg.weatherAlertModeId || '',
      cooldownMin: cfg.weatherAlertCooldownMin || 120,
      gaps,
    };
  }
}
