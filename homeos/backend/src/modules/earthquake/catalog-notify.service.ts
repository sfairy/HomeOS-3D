/**
 * @file earthquake-catalog-notify.service.ts
 * @module backend/src/modules
 *
 * CENC 震情目录新增事件定时通知服务。
 *
 * 工作机制：
 *  - 每 5 分钟拉取一次 CENC「近 24 小时」目录（max 50 条）。
 *  - 维护 Redis 中最近 200 个已通知 eventId（7 天 TTL），避免重复通知；
 *    Redis 不可用时回退进程内集合，保证目录速报不会永久静默。
 *  - 启用 EEW 且配置了家庭坐标时，按与 EEW 相同的阈值（aligned）通知；
 *    未启用时按 catalog_only 宽松规则通知（远距 M≥5 仍通知）。
 *  - 启用 EEW 时同步将达标事件记入本地预警（recordCatalogLocalAlert）；
 *    直投成功后占位与确认通报共用的冷却键，避免同事件双发。
 *  - 仅 EEW Leader 实例执行实际拉取与通知，避免重复发送。
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NotificationService } from '../notification/service';
import { NotificationCooldownService } from '../../common/alert-support/notification-cooldown.service';
import { RedisService } from '../../shared/redis/service';
import { JobRegistryService } from '../../shared/jobs/registry.service';
import { EarthquakeService } from './service';
import { EarthquakeGlobalService } from './global.service';
import { EewLeaderService } from './eew-leader.service';
import { eewCatalogCooldownKey } from './types';
import {
  formatCatalogNotifyMessage,
  resolveCatalogNotifyLevel,
  shouldNotifyCatalogEvent,
} from './state.util';

const POLL_MS = 5 * 60 * 1000;
const BOOT_DELAY_MS = 15_000;
const SEEN_KEY = 'homeos:eew:cenc-notified-ids';
const SEEN_MAX = 200;
/** 目录速报的通知冷却（分钟）：与 notification 模块确认通报共用同一冷却键 */
const CATALOG_NOTIFY_COOLDOWN_MIN = 10;

/**
 * CENC 震情目录通知服务（@Injectable）。
 *
 * 启动后延迟 15 秒开始首次轮询，避免与 HA / Redis 初始化竞争资源。
 * 通过 JobRegistryService 注册定时任务，便于运维侧查看运行状态与历史。
 */
@Injectable()
export class EarthquakeCatalogNotifyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EarthquakeCatalogNotifyService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private bootTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * 进程内已通知 eventId 兜底集合。
   *
   * Redis 不可用（未就绪 / 读取异常）时作为去重来源，避免 `loadSeenIds` 恒返回空集
   * 触发「首次初始化」短路，导致目录速报永久静默。
   */
  private readonly memSeenIds = new Set<string>();

  constructor(
    private readonly earthquakeService: EarthquakeService,
    private readonly earthquakeGlobalService: EarthquakeGlobalService,
    private readonly eewLeader: EewLeaderService,
    private readonly notificationService: NotificationService,
    private readonly cooldownService: NotificationCooldownService,
    private readonly redis: RedisService,
    private readonly jobs: JobRegistryService,
  ) {}

  onModuleInit() {
    this.bootTimer = setTimeout(() => {
      void this.tick();
      this.timer = setInterval(() => {
        void this.jobs
          .run('earthquake-catalog-notify', { description: 'CENC 震情目录轮询通知', intervalMs: POLL_MS }, () =>
            this.tick(),
          )
          .catch(() => {
            // jobs.run 已记录错误，避免 unhandled rejection
          });
      }, POLL_MS);
    }, BOOT_DELAY_MS);
  }

  onModuleDestroy() {
    if (this.bootTimer) clearTimeout(this.bootTimer);
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (!this.eewLeader.isEewLeader()) return;

    try {
      await this.checkNewCencEvents();
    } catch (err: unknown) {
      this.logger.debug(`CENC 震情通知轮询失败: ${String(err)}`);
    }
  }

  private async checkNewCencEvents(): Promise<void> {
    await this.earthquakeService.ensureRuntimeConfig();
    const runtime = this.earthquakeService.getRuntimeConfig();
    const home = this.earthquakeService.getHomeCoordinates();
    const homeConfigured = home.lat != null && home.lon != null;

    const feed = await this.earthquakeGlobalService.getRecentFeed({
      source: 'cenc',
      period: 'day',
      minMagnitude: 2,
      limit: 50,
    });

    const ids = feed.items.map((item) => item.id).filter(Boolean);
    if (!ids.length) return;

    const seen = await this.loadSeenIds();
    if (!seen.size) {
      await this.saveSeenIds(ids);
      this.logger.log(`CENC 震情通知:已初始化 ${ids.length} 条已知事件`);
      return;
    }

    const notifyOpts =
      runtime.enabled && home.lat != null && home.lon != null
        ? ({
            mode: 'aligned' as const,
            minMagnitude: runtime.minMagnitude,
            maxDistanceKm: runtime.maxDistance,
            minLocalIntensity: runtime.minLocalIntensity,
            homeLat: home.lat,
            homeLon: home.lon,
          })
        : ({
            mode: 'catalog_only' as const,
            minMagnitude: runtime.enabled ? runtime.minMagnitude : 4,
            maxDistanceKm: runtime.enabled ? runtime.maxDistance : null,
            homeConfigured,
          });

    const newIds: string[] = [];
    for (const item of feed.items) {
      if (!item.id || seen.has(item.id)) continue;
      newIds.push(item.id);
      if (!shouldNotifyCatalogEvent(item, notifyOpts)) continue;

      const level = resolveCatalogNotifyLevel(item);
      const delivered = await this.notificationService.notify(
        level,
        formatCatalogNotifyMessage(item),
        'earthquake-catalog',
        item.id,
        {
          channels: ['in_app', 'socket', 'webpush'],
          // 目录事件为台网正式测定结果，与实时预警标题分流
          title: '地震速报(官方已确认)',
        },
      );

      // 目录轮询已直投：占位与确认通报共用的冷却键，避免 recordCatalogLocalAlert
      // 随后 emit 的 CONFIRMATION 再投递一条同源同事件的通知（双发）
      if (delivered) {
        this.cooldownService.setCooldown(
          'notify',
          eewCatalogCooldownKey(item.id),
          CATALOG_NOTIFY_COOLDOWN_MIN,
        );
      }

      // 启用 EEW 时：达标目录事件同步写入本地预警，与设置阈值一致
      if (notifyOpts.mode === 'aligned') {
        try {
          await this.earthquakeService.recordCatalogLocalAlert(item);
        } catch (err: unknown) {
          this.logger.debug(`目录震情写入本地预警失败: ${String(err)}`);
        }
      }
    }

    if (newIds.length) {
      await this.saveSeenIds([...seen, ...newIds]);
      this.logger.log(`CENC 震情通知:发现 ${newIds.length} 条新事件`);
    }
  }

  /**
   * 读取已通知 eventId 集合。
   *
   * Redis 就绪且键存在时，取其结果与进程内兜底集合的**并集**；Redis 未就绪 / 读取异常 /
   * 键被清空时仅用兜底集合。回退路径保证 Redis 故障期间目录速报不会因「空集 = 首次初始化」
   * 而永久静默。
   *
   * 必须取并集而非二选一：Redis 不可用期间通知过的事件只会写进 memSeenIds，若恢复后
   * 直接以 Redis 中的旧结果覆盖，这些事件会被重新判定为「新事件」而重复推送。
   */
  private async loadSeenIds(): Promise<Set<string>> {
    const memFallback = new Set(this.memSeenIds);
    if (!this.redis.isReady()) return memFallback;
    try {
      const raw = await this.redis.get(SEEN_KEY);
      // 键不存在：Redis 可能刚被清空，优先信任进程内已知集合，避免重复通知历史事件
      if (!raw) return memFallback;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return memFallback;
      const ids = parsed.filter((id) => typeof id === 'string' && id.trim());
      // Redis 结果在前（较旧）、内存集合在后（较新），按 SEEN_MAX 从后截断，
      // 与 saveSeenIds 的 `unique.slice(-SEEN_MAX)` 保持同一有界语义。
      const merged = [...new Set([...ids, ...memFallback])];
      return new Set(merged.slice(-SEEN_MAX));
    } catch {
      return memFallback;
    }
  }

  /** 写入已通知 eventId：进程内兜底集合始终更新，Redis 就绪时尽力持久化 */
  private async saveSeenIds(ids: Iterable<string>): Promise<void> {
    const unique = [...new Set([...ids].filter(Boolean))];
    const trimmed = unique.slice(-SEEN_MAX);
    for (const id of trimmed) this.memSeenIds.add(id);
    // 进程内集合同样按 SEEN_MAX 有界，防止长跑内存增长
    while (this.memSeenIds.size > SEEN_MAX) {
      const oldest = this.memSeenIds.values().next().value;
      if (oldest === undefined) break;
      this.memSeenIds.delete(oldest);
    }

    if (!this.redis.isReady()) return;
    try {
      await this.redis.set(SEEN_KEY, JSON.stringify(trimmed), 7 * 24 * 3600);
    } catch (err: unknown) {
      this.logger.debug(`CENC 已知事件写入失败: ${String(err)}`);
    }
  }
}
