/**
 * 分布式锁服务（Redis SET NX + Lua 原子释放；Redis 不可用时降级进程内锁）
 *
 * 所属模块：backend/src/common/resilience
 * 职责：
 *   - acquire / release / runExclusive 三件套，覆盖跨实例互斥场景
 *     （数据保留清理、HA 同步串行化、定时任务单实例执行等）；
 *   - Redis 主路径：SET key token PX ttlMs NX 加锁，Lua 脚本「校验 token 后 del」释放，
 *     保证只有持锁者能释放；SET NX 瞬时故障短退避重试；
 *   - 降级路径：未配置 REDIS_URL 或 Redis 故障时回退进程内 Map 锁，
 *     单副本部署下互斥语义完整，仅一次性告警避免日志噪声；
 *   - runExclusive：获取失败抛 ConflictException(LOCK_BUSY)，业务侧可直接转 HTTP 409。
 * 关键依赖：
 *   - ../../shared/redis/service#RedisService：Redis 客户端与就绪状态判定
 *   - ../errors/api-error-messages#API_ERROR：LOCK_BUSY 错误码与中文文案
 */
import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import type { Redis } from 'ioredis';
import { RedisService } from '../../shared/redis/service';
import { API_ERROR } from '../errors/api-error-messages';
import { sleep } from '../utils/sleep.util';

/**
 * 原子释放脚本：仅当 KEYS[1] 当前值等于 ARGV[1]（持锁 token）时才 del。
 * 防止持锁者超时后误释放他人接管的锁。
 */
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

/** Redis 锁瞬时故障的额外重试次数与短退避基数（ms） */
const LOCK_RETRY_COUNT = 2;
const LOCK_RETRY_BASE_DELAY_MS = 50;

/**
 * 分布式锁服务。
 *
 * 双路径策略：
 *   - 优先 Redis SET NX（跨进程互斥）；
 *   - Redis 不可用时降级进程内 Map 锁（单副本语义完整）。
 * 进程内锁 TTL 由 until 字段维护，过期后允许覆盖。
 */
@Injectable()
export class DistributedLockService {
  private readonly logger = new Logger(DistributedLockService.name);
  private readonly localLocks = new Map<string, { token: string; until: number }>();
  /** Redis 不可用时回退进程内锁的一次性告警标记 */
  private fallbackWarned = false;

  constructor(private readonly redis: RedisService) {}

  /**
   * Redis 不可用、回退进程内锁的一次性告警。
   * 单副本无跨进程互斥需求，进程内锁互斥语义完整。
   */
  private warnFallbackOnce(detail: string) {
    if (this.fallbackWarned) return;
    this.fallbackWarned = true;
    this.logger.warn(
      `[降级] 分布式锁回退进程内锁(${detail}).单副本部署下无跨进程互斥需求.`,
    );
  }

  /**
   * 带短退避重试的 SET NX：应对 Redis 瞬时抖动，
   * 超过 LOCK_RETRY_COUNT 后将异常上抛触发降级。
   */
  private async setNxWithRetry(
    client: Redis,
    redisKey: string,
    token: string,
    ttlMs: number,
  ): Promise<'OK' | null> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await client.set(redisKey, token, 'PX', ttlMs, 'NX');
      } catch (e) {
        if (attempt >= LOCK_RETRY_COUNT) throw e;
        await sleep(LOCK_RETRY_BASE_DELAY_MS * (attempt + 1));
      }
    }
  }

  /**
   * 获取分布式锁。
   * 路径：Redis 已配置且就绪 → SET NX；否则降级进程内锁。
   * 进程内锁覆盖：仅当 key 不存在或已过期（until <= now）时获取成功。
   *
   * @param key   业务锁名（不含 lock: 前缀，方法内会拼装）
   * @param ttlMs 锁过期时间，防止持锁者崩溃后死锁；默认 60000
   * @returns 成功返回 token（释放时需回传）；失败返回 null
   */
  async acquire(key: string, ttlMs = 60_000): Promise<string | null> {
    const token = randomBytes(12).toString('hex');
    const redisKey = `lock:${key}`;

    // ── Redis 已配置：优先分布式锁；不可用时降级进程内锁 ──
    if (this.redis.isConfigured()) {
      if (!this.redis.isReady()) {
        this.warnFallbackOnce('Redis 未就绪');
      }

      const client = this.redis.getClient();
      if (client && this.redis.isReady()) {
        try {
          const ok = await this.setNxWithRetry(client, redisKey, token, ttlMs);
          return ok === 'OK' ? token : null;
        } catch (e) {
          this.warnFallbackOnce(`Redis 锁获取失败: ${e}`);
        }
      }
    }

    // ── 未配置 REDIS_URL 或 Redis 故障降级：进程内锁 ──
    const now = Date.now();
    const existing = this.localLocks.get(key);
    if (existing && existing.until > now) return null;
    this.localLocks.set(key, { token, until: now + ttlMs });
    return token;
  }

  /**
   * 释放锁。
   * - Redis 路径：执行 Lua 释放脚本，仅持锁 token 匹配时才 del；
   * - 进程内锁路径：仅当 token 匹配才删除，避免误释放他人锁。
   *
   * @param key   业务锁名
   * @param token acquire 返回的 token
   */
  async release(key: string, token: string) {
    const redisKey = `lock:${key}`;
    const client = this.redis.getClient();

    if (client) {
      try {
        await client.eval(RELEASE_SCRIPT, 1, redisKey, token);
        return;
      } catch (e) {
        this.logger.warn(`Redis 锁释放失败: ${e}`);
      }
    }

    const existing = this.localLocks.get(key);
    if (existing?.token === token) {
      this.localLocks.delete(key);
    }
  }

  /**
   * 在持锁上下文中执行异步任务，无论成功或失败都自动释放锁。
   * 获取锁失败时抛 ConflictException(LOCK_BUSY) → HTTP 409，调用方无需手动处理释放。
   *
   * @param key   业务锁名
   * @param fn    临界区异步任务
   * @param ttlMs 锁过期时间，默认 60000
   * @returns fn 的返回值
   * @throws ConflictException 锁被占用时抛出
   */
  async runExclusive<T>(key: string, fn: () => Promise<T>, ttlMs = 60_000): Promise<T> {
    const token = await this.acquire(key, ttlMs);
    if (!token) {
      throw new ConflictException(API_ERROR.LOCK_BUSY);
    }
    try {
      return await fn();
    } finally {
      await this.release(key, token);
    }
  }
}
