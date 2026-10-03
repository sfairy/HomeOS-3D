/**
 * @file session-revocation.service.ts
 * @module common/http-security
 *
 * 单会话吊销服务（按 JWT jti 黑名单）。
 *
 * 职责：
 * - 登出当前设备时，将对应 JWT 的 jti 写入 Redis 黑名单，TTL 设为 token 剩余有效期。
 * - 鉴权时查询 jti 是否命中黑名单，命中则拒绝该 token。
 *
 * 外部依赖：
 * - @nestjs/common（Injectable、Logger）
 * - ../redis/redis.service（Redis 客户端，黑名单存储）
 *
 * 安全相关：Redis 不可用时放行并依赖 user.tokenVersion 全局失效兜底
 *（revoke 失败时由调用方回退 tokenVersion，见 AuthService.revokeSessionByToken），
 * 避免 Redis 故障窗口内全站会话被误判为已吊销而全部登出。
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../../shared/redis/service';

/** Redis 中吊销表的 key 前缀，完整 key 为 `auth:revoked:{jti}` */
const REVOKED_PREFIX = 'auth:revoked:';
/** Redis Pub/Sub 频道：会话吊销「未吊销」正向缓存失效广播 */
const REVOKE_INVALIDATE_CHANNEL = 'homeos:session-revocation:invalidate';

/**
 * 单会话吊销表（按 JWT jti）。
 *
 * 用于"仅登出当前设备"：登出时把该 token 的 jti 写入 Redis 黑名单，
 * TTL 设为 token 剩余有效期；校验时命中黑名单即拒绝。其余设备的 token
 * jti 不同，故不受影响。改密码等"全设备失效"仍走 user.tokenVersion。
 *
 * Redis 不可用时，revoke() 返回 false 以告知调用方写入未持久化，
 * 由上层回退到 user.tokenVersion 全局失效，确保服务端确实登出。
 *
 * 在 NestJS DI 容器中作为单例 Provider 注册，供 AuthService / JwtStrategy 注入
 * 以实现单设备登出与 token 校验。
 */
@Injectable()
export class SessionRevocationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SessionRevocationService.name);
  /** Redis 不可用时放行会话校验的一次性告警标记 */
  private fallbackWarned = false;
  /** 「未吊销」正向缓存：jti → 写入时间戳；仅缓存未吊销，绝不缓存已吊销 */
  private readonly notRevokedCache = new Map<string, number>();
  /** 正向缓存 TTL（毫秒）：与 tokenVersion 缓存 60s 同量级的安全窗口 */
  private readonly notRevokedTtlMs = 30_000;
  /** 正向缓存上限：超过后整体清空（缓存为纯性能优化，清空安全） */
  private readonly notRevokedMax = 2000;
  /** 失效频道订阅取消函数 */
  private unsubInvalidate: (() => void) | null = null;

  constructor(private readonly redis: RedisService) {}

  /**
   * 模块初始化：订阅会话吊销失效频道，跨实例清除「未吊销」正向缓存。
   * Redis 未就绪时跳过订阅，缓存退化为纯本地 + TTL（最终一致由 TTL 保证）。
   */
  async onModuleInit() {
    if (!this.redis.isReady()) return;
    try {
      this.unsubInvalidate = await this.redis.subscribe(REVOKE_INVALIDATE_CHANNEL, (msg) => {
        const jti =
          typeof msg === 'string' ? msg : String((msg as { jti?: string })?.jti || '');
        if (jti) this.notRevokedCache.delete(jti);
      });
    } catch (err) {
      this.logger.warn(`会话吊销失效订阅失败: ${(err as Error).message}`);
    }
  }

  /** 模块销毁：取消失效频道订阅，释放资源 */
  onModuleDestroy() {
    this.unsubInvalidate?.();
    this.unsubInvalidate = null;
  }

  /** 广播本实例的吊销动作，让其他实例立即清除对应 jti 的「未吊销」缓存 */
  private broadcastRevoke(jti: string): void {
    if (this.redis.isReady()) {
      void this.redis.publish(REVOKE_INVALIDATE_CHANNEL, { jti });
    }
  }

  /**
   * Redis 不可用、放行会话校验的一次性告警。
   * 依赖 user.tokenVersion 兜底全设备失效。
   */
  private warnFallbackOnce(detail: string) {
    if (this.fallbackWarned) return;
    this.fallbackWarned = true;
    this.logger.warn(
      `[降级] 会话吊销校验放行(${detail}).依赖 user.tokenVersion 兜底全设备失效.`,
    );
  }

  /**
   * 吊销单个会话；ttlSeconds 应为该 token 的剩余有效期（秒）。
   *
   * @param jti JWT 的唯一标识符（JSON Token ID）。为空时无法吊销，返回 false。
   * @param ttlSeconds 黑名单条目存活时间，应等于 token 剩余有效期，过期自动清理。
   * @returns 是否已成功持久化到 Redis；false 表示 Redis 不可用/写入失败，
   *          调用方应回退到全局失效（tokenVersion）以免登出失效。
   */
  async revoke(jti: string | undefined, ttlSeconds: number): Promise<boolean> {
    if (!jti) return false;
    if (!this.redis.getClient()) return false;
    // TTL 至少 1 秒，避免 0 或负值导致 Redis 立即删除
    const ttl = Math.max(1, Math.floor(ttlSeconds));
    try {
      await this.redis.set(`${REVOKED_PREFIX}${jti}`, '1', ttl);
      // 本实例立即清除「未吊销」缓存，并广播让其他实例同步清除
      this.notRevokedCache.delete(jti);
      this.broadcastRevoke(jti);
      return true;
    } catch (e) {
      this.logger.warn(`吊销会话失败 jti=${jti}: ${e}`);
    }
    return false;
  }

  /**
   * 该 jti 是否已被吊销。
   *
   * 安全意图：
   * - Redis 未配置：不启用黑名单机制，返回 false（依赖 tokenVersion 兜底）。
   * - Redis 已配置但不可用：返回 false 放行，依赖 user.tokenVersion 兜底全设备失效。
   * - 查询异常：视为已吊销，保守拒绝。
   *
   * @param jti JWT 的唯一标识符。为空时无法查询，返回 false（不阻断）。
   * @returns true 表示该 jti 已被吊销或无法确认安全（fail-closed）。
   */
  async isRevoked(jti: string | undefined): Promise<boolean> {
    if (!jti) return false;
    if (!this.redis.isConfigured()) {
      return false;
    }

    // 正向缓存命中（未过期）→ 直接放行，省去每次请求一次 Redis RTT；
    // 仅缓存「未吊销」，已吊销永不缓存，故不引入误放行窗口
    const cachedAt = this.notRevokedCache.get(jti);
    if (cachedAt !== undefined && Date.now() - cachedAt < this.notRevokedTtlMs) {
      return false;
    }

    if (!this.redis.isReady() || !this.redis.getClient()) {
      this.warnFallbackOnce('Redis 不可用');
      return false;
    }

    try {
      const revoked = (await this.redis.get(`${REVOKED_PREFIX}${jti}`)) !== null;
      if (revoked) {
        this.notRevokedCache.delete(jti);
      } else {
        this.notRevokedCache.set(jti, Date.now());
        if (this.notRevokedCache.size > this.notRevokedMax) this.notRevokedCache.clear();
      }
      return revoked;
    } catch (e) {
      this.logger.warn(`查询会话吊销状态失败 jti=${jti}: ${e}`);
      return true;
    }
  }
}
