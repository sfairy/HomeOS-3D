/**
 * @file auto-backup.service.ts
 * @module system/backup
 * @description 定时自动备份服务：每天 02:30（Asia/Shanghai）生成完整备份包并保留近 N 天产物。
 *
 * - 开关与保留天数读取 ops.autoBackupEnabled / autoBackupRetainDays（SystemConfig 热更新）。
 * - 多实例部署时通过 Redis 互斥锁避免重复备份；Redis 不可用时降级为本地执行。
 * - 每次执行后记录 lastRunAt / lastError，供 GET /system/backup/auto/status 展示。
 *
 * 依赖：AppConfigService（配置）、ServerBackupService（备份与清理）、RedisService（分布式锁）。
 */
import { getErrorMessage } from '../../../common/utils';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { dateFromZonedWallClock, zonedDateParts } from '@homeos/shared';
import { AppConfigService } from '../../../shared/app-config/service';
import { RedisService } from '../../../shared/redis/service';
import { ServerBackupService } from './server-backup.service';

/** Redis 互斥锁 Key：多副本仅一个实例执行自动备份 */
const AUTO_BACKUP_LOCK_KEY = 'homeos:auto-backup:lock';
/** 锁 TTL（秒）：正常备份在秒级完成，30 分钟兜底防止异常卡死占锁 */
const AUTO_BACKUP_LOCK_TTL_SEC = 1800;
/** 自动备份触发时刻（与 @Cron 保持一致，用于计算 nextRunAt） */
const AUTO_BACKUP_HOUR = 2;
const AUTO_BACKUP_MINUTE = 30;
/** 文案与 Cron 固定北京时间，避免容器 UTC 把 02:30 跑成上午 10:30 */
const AUTO_BACKUP_TZ = 'Asia/Shanghai';

interface AutoBackupStatus {
  enabled: boolean;
  retainDays: number;
  lastRunAt: string | null;
  lastError: string | null;
  nextRunAt: string;
}

@Injectable()
/**
 * AutoBackupService：Nest @Injectable 服务。
 * - 职责：承载域内核心业务逻辑；
 * - 装配：由对应 Module 的 providers 数组注入；
 * - 生命周期：可能实现 onModuleInit/onModuleDestroy（连接/订阅管理）；
 */
export class AutoBackupService {
  private readonly logger = new Logger(AutoBackupService.name);
  private lastRunAt: string | null = null;
  private lastError: string | null = null;
  private lockToken: string | null = null;

  constructor(
    private readonly appConfig: AppConfigService,
    private readonly serverBackup: ServerBackupService,
    private readonly redis: RedisService,
  ) {}

  /** 自动备份运行状态（开关 / 保留天数 / 上次执行 / 下次执行） */
  getStatus(): AutoBackupStatus {
    const ops = this.appConfig.get('ops');
    return {
      enabled: ops.autoBackupEnabled,
      retainDays: ops.autoBackupRetainDays,
      lastRunAt: this.lastRunAt,
      lastError: this.lastError,
      nextRunAt: this.computeNextRunAt(),
    };
  }

  @Cron('30 2 * * *', { timeZone: AUTO_BACKUP_TZ })
  async runAutoBackup() {
    const ops = this.appConfig.get('ops');
    if (!ops.autoBackupEnabled) {
      this.logger.debug('自动备份未启用,跳过');
      return;
    }
    if (!(await this.acquireLock())) {
      this.logger.log('自动备份跳过:另一实例正在执行或锁尚未释放');
      return;
    }
    try {
      const { name } = await this.serverBackup.createBackup();
      await this.pruneOldBackups(ops.autoBackupRetainDays);
      this.lastRunAt = new Date().toISOString();
      this.lastError = null;
      this.logger.log(`自动备份完成:${name}`);
    } catch (err) {
      this.lastError = getErrorMessage(err);
      this.logger.error(`自动备份失败: ${this.lastError}`);
    } finally {
      await this.releaseLock();
    }
  }

  /** 清理超出保留天数的历史备份包（按文件 mtime 判定） */
  private async pruneOldBackups(retainDays: number) {
    if (!Number.isFinite(retainDays) || retainDays < 1) return;
    const cutoff = Date.now() - retainDays * 24 * 60 * 60 * 1000;
    const files = await this.serverBackup.listFiles();
    for (const file of files) {
      const mtime = new Date(file.mtime).getTime();
      if (Number.isFinite(mtime) && mtime < cutoff) {
        try {
          await this.serverBackup.deleteFile(file.name);
          this.logger.log(`自动清理过期备份 ${file.name}`);
        } catch (err) {
          this.logger.warn(`清理过期备份 ${file.name} 失败: ${(err as Error).message}`);
        }
      }
    }
  }

  /** Redis SET NX PX 互斥锁；Redis 不可用时放行（standalone 部署无并发风险） */
  private async acquireLock(): Promise<boolean> {
    if (!this.redis.isReady()) return true;
    const client = this.redis.getClient();
    if (!client) return true;
    const token = `${process.pid}:${Date.now()}`;
    const ok = await client.set(
      AUTO_BACKUP_LOCK_KEY,
      token,
      'EX',
      AUTO_BACKUP_LOCK_TTL_SEC,
      'NX',
    );
    if (ok === 'OK') {
      this.lockToken = token;
      return true;
    }
    return false;
  }

  private async releaseLock() {
    if (!this.lockToken || !this.redis.isReady()) {
      this.lockToken = null;
      return;
    }
    const client = this.redis.getClient();
    if (!client) return;
    try {
      const script =
        'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';
      await client.eval(script, 1, AUTO_BACKUP_LOCK_KEY, this.lockToken);
    } catch (err) {
      this.logger.warn(`释放自动备份锁失败: ${(err as Error).message}`);
    } finally {
      this.lockToken = null;
    }
  }

  /** 计算下一个执行时刻（当日/次日 02:30 Asia/Shanghai 的 ISO 时间） */
  private computeNextRunAt(): string {
    const now = new Date();
    const parts = zonedDateParts(now, AUTO_BACKUP_TZ);
    let next = dateFromZonedWallClock(
      AUTO_BACKUP_TZ,
      parts.year,
      parts.month,
      parts.day,
      AUTO_BACKUP_HOUR,
      AUTO_BACKUP_MINUTE,
    );
    if (next.getTime() <= now.getTime()) {
      const noon = dateFromZonedWallClock(AUTO_BACKUP_TZ, parts.year, parts.month, parts.day, 12, 0);
      const nextDay = zonedDateParts(new Date(noon.getTime() + 24 * 60 * 60 * 1000), AUTO_BACKUP_TZ);
      next = dateFromZonedWallClock(
        AUTO_BACKUP_TZ,
        nextDay.year,
        nextDay.month,
        nextDay.day,
        AUTO_BACKUP_HOUR,
        AUTO_BACKUP_MINUTE,
      );
    }
    return next.toISOString();
  }
}
