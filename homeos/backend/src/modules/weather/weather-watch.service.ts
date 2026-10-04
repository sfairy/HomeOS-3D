/**
 * 天气预警后台监听服务
 *
 * 职责：启动延迟后定时轮询 OpenWeather 预警（复用 ExternalApiService.fetchOpenWeatherAlerts），
 *  对 Redis 中已通知预警 ID 去重（homeos:weather:alert-notified-ids，cap 200），
 *  新预警按等级阈值（默认 ≥ 橙色）经 NotificationService 推送，
 *  并通过 EventEmitter2 广播 weather.alert 事件（供天气联动服务消费）。
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppConfigService } from '../../shared/app-config/service';
import { RedisService } from '../../shared/redis/service';
import { JobRegistryService } from '../../shared/jobs/registry.service';
import { NotificationService } from '../notification/service';
import { ExternalApiService } from '../system/ops/external-api.service';
import type { WeatherAlert } from '../system/ops/external-weather-alerts.helper';
import { HOMEOS_EVENTS } from '../../shared/homeos-events';

const BOOT_DELAY_MS = 20_000;
const SEEN_KEY = 'homeos:weather:alert-notified-ids';
const SEEN_MAX = 200;

const LEVEL_PRIORITY: Record<string, number> = { yellow: 1, orange: 2, red: 3 };
const ALERT_LEVEL_TO_NOTIFY: Record<string, 'info' | 'warn' | 'danger'> = {
  yellow: 'info',
  orange: 'warn',
  red: 'danger',
};

@Injectable()
/**
 * WeatherWatchService：Nest @Injectable 服务。
 * - 职责：承载域内核心业务逻辑；
 * - 装配：由对应 Module 的 providers 数组注入；
 * - 生命周期：可能实现 onModuleInit/onModuleDestroy（连接/订阅管理）；
 */
export class WeatherWatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WeatherWatchService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private bootTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly externalApi: ExternalApiService,
    private readonly notificationService: NotificationService,
    private readonly redis: RedisService,
    private readonly jobs: JobRegistryService,
    private readonly appConfig: AppConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleInit() {
    this.bootTimer = setTimeout(() => {
      void this.tick();
      const pollMs = this.pollMs();
      this.timer = setInterval(() => {
        void this.jobs
          .run('weather-watch', { description: '天气预警轮询监听', intervalMs: pollMs }, () => this.tick())
          .catch(() => {
            // jobs.run 已记录错误，避免 unhandled rejection
          });
      }, pollMs);
    }, BOOT_DELAY_MS);
  }

  /** 清理启动延迟定时器与轮询定时器，避免组件销毁后悬挂回调。 */
  onModuleDestroy() {
    if (this.bootTimer) clearTimeout(this.bootTimer);
    if (this.timer) clearInterval(this.timer);
  }

  /** 轮询间隔（毫秒），下限 60s 防止误配置过频请求 OpenWeather */
  private pollMs(): number {
    const cfg = this.appConfig.get('external');
    return Math.max(60_000, cfg.weatherAlertRefreshMs || 30 * 60_000);
  }

  /** 单次轮询入口：捕获异常后仅 debug 记录，避免轮询任务中断。 */
  private async tick() {
    try {
      await this.checkNewAlerts();
    } catch (err: unknown) {
      this.logger.debug(`天气预警轮询失败: ${String(err)}`);
    }
  }

  /**
   * 检查新预警：拉取 OpenWeather → Redis 已通知集合去重 →
   * 按等级阈值过滤（默认 ≥ 橙色）→ 通知 + 广播 weather.alert 事件。
   * 配置缺失（未启用 / 无坐标 / 无 API Key）时直接返回。
   */
  private async checkNewAlerts(): Promise<void> {
    const cfg = this.appConfig.get('external');
    if (cfg.weatherAlertEnabled === false) return;
    const { weatherLat: lat, weatherLon: lon, openWeatherApiKey: apiKey } = cfg;
    if (!lat || !lon || !apiKey) return;

    const res = await this.externalApi.fetchOpenWeatherAlerts(lat, lon, apiKey);
    const alerts = Array.isArray(res?.alerts) ? (res.alerts as WeatherAlert[]) : [];
    if (!alerts.length) return;

    const seen = await this.loadSeenIds();
    const thresholdPriority =
      LEVEL_PRIORITY[cfg.weatherAlertNotifyLevel] ?? LEVEL_PRIORITY.orange;

    const newKeys: string[] = [];
    for (const alert of alerts) {
      const key = this.alertKey(alert);
      if (seen.has(key)) continue;
      newKeys.push(key);

      const priority = LEVEL_PRIORITY[alert.level] ?? LEVEL_PRIORITY.yellow;
      if (priority < thresholdPriority) continue;

      const message = `${alert.title}${alert.description ? `：${alert.description}` : ''}`;
      await this.notificationService.notify(
        ALERT_LEVEL_TO_NOTIFY[alert.level] ?? 'warn',
        message,
        'weather-alert',
        key,
        { channels: ['in_app', 'socket'] },
      );
      this.eventEmitter.emit(HOMEOS_EVENTS.WEATHER_ALERT, {
        alert,
        level: alert.level,
      });
      this.logger.log(`天气预警推送:${alert.level} ${alert.title}`);
    }

    if (newKeys.length) {
      await this.saveSeenIds([...seen, ...newKeys]);
      this.logger.log(`天气预警监听:发现 ${newKeys.length} 条新预警`);
    }
  }

  /** 预警去重键：级别 + 类型/标题 + 生效起始时间（去除空白，控制长度） */
  private alertKey(alert: WeatherAlert): string {
    const base = `${alert.level}:${alert.type || alert.title}:${alert.effectiveFrom || ''}`;
    return base.replace(/\s+/g, '').slice(0, 120);
  }

  private async loadSeenIds(): Promise<Set<string>> {
    if (!this.redis.isReady()) return new Set();
    try {
      const raw = await this.redis.get(SEEN_KEY);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return new Set();
      return new Set(parsed.filter((id) => typeof id === 'string' && id.trim()));
    } catch {
      return new Set();
    }
  }

  private async saveSeenIds(ids: Iterable<string>): Promise<void> {
    if (!this.redis.isReady()) return;
    const unique = [...new Set([...ids].filter(Boolean))];
    const trimmed = unique.slice(-SEEN_MAX);
    try {
      await this.redis.set(SEEN_KEY, JSON.stringify(trimmed), 7 * 24 * 3600);
    } catch (err: unknown) {
      this.logger.debug(`天气预警已通知写入失败: ${String(err)}`);
    }
  }
}
