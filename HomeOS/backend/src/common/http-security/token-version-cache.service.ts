/**
 * @file token-version-cache.service.ts
 * @module common/http-security
 *
 * JWT 用户鉴权快照进程内缓存，通过 Redis Pub/Sub 实现跨实例失效。
 *
 * 职责：
 * - 缓存用户的 tokenVersion、username、role、preferences 等鉴权快照，减少每次请求
 *   都查数据库的开销（热路径优化）。
 * - 缓存项带 60 秒 TTL，过期自动失效。
 * - 改密码/登出全设备等场景调用 invalidate()，通过 Redis Pub/Sub 通知所有实例清除
 *   该用户的缓存，确保 tokenVersion 提升后立即生效。
 *
 * 关键依赖：
 * - @nestjs/common（Injectable、Logger、OnModuleInit、OnModuleDestroy 生命周期）
 * - ../redis/redis.service（Pub/Sub 订阅与发布）
 *
 * 安全相关：tokenVersion 是"全设备登出"的核心机制，缓存失效延迟会导致旧 token 短暂
 * 可用；TTL 设为 60 秒即最大延迟窗口，invalidate 通过 Pub/Sub 实时清除以缩小窗口。
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../../shared/redis/service';

/** Redis Pub/Sub 频道：token-version 失效广播 */
const INVALIDATE_CHANNEL = 'homeos:token-version:invalidate';

/**
 * 用户鉴权快照（缓存行结构）。
 */
export interface UserAuthSnapshot {
  /** 用户当前 tokenVersion，JWT 中的版本号须与之匹配 */
  tokenVersion: number;
  /** 用户名 */
  username: string;
  /** 角色（admin / adult / child / guest / user） */
  role: string;
  /** 用户偏好设置（透传，结构不限定） */
  preferences: unknown;
  /** 快照写入时间戳（ms），用于 TTL 判定 */
  at: number;
}

/**
 * JWT 用户鉴权快照进程内缓存；Redis Pub/Sub 跨实例失效。
 *
 * 在 NestJS DI 容器中作为单例 Provider 注册，实现 OnModuleInit / OnModuleDestroy
 * 生命周期钩子以管理 Redis 订阅。供 JwtStrategy / AuthGuard 等鉴权链路注入，避免
 * 每次请求都查询数据库获取 tokenVersion。
 *
 * 安全意图：缓存可降低鉴权延迟，但 tokenVersion 失效必须及时传播；本服务通过
 * Pub/Sub 广播 + 60 秒 TTL 双重保证最终一致，最坏情况下旧 token 在 60 秒后失效。
 */
@Injectable()
export class TokenVersionCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TokenVersionCacheService.name);
  /** 进程内缓存：userId -> 鉴权快照 */
  private readonly cache = new Map<string, UserAuthSnapshot>();
  /** 缓存 TTL（毫秒），过期项在读取时惰性清除 */
  private readonly ttlMs = 60_000;
  /** Redis 订阅取消函数，模块销毁时调用以释放连接 */
  private unsubInvalidate: (() => void) | null = null;

  constructor(private readonly redis: RedisService) {}

  /**
   * 模块初始化：订阅 Redis 失效频道。
   *
   * 收到消息后解析 userId 并删除本地缓存，实现跨实例失效。
   * Redis 未就绪时跳过订阅，缓存退化为纯本地 + TTL（最终一致仍由 TTL 保证）。
   */
  async onModuleInit() {
    if (!this.redis.isReady()) return;
    try {
      this.unsubInvalidate = await this.redis.subscribe(INVALIDATE_CHANNEL, (msg) => {
        // 消息可能是纯字符串 userId 或 { userId: string } 对象，统一兼容
        const userId =
          typeof msg === 'string' ? msg : String((msg as { userId?: string })?.userId || '');
        if (userId) this.cache.delete(userId);
      });
    } catch (err) {
      this.logger.warn(`令牌版本失效订阅失败: ${(err as Error).message}`);
    }
  }

  /**
   * 模块销毁：取消 Redis 订阅，释放资源。
   */
  onModuleDestroy() {
    this.unsubInvalidate?.();
    this.unsubInvalidate = null;
  }

  /**
   * 获取用户鉴权快照（含 TTL 惰性清除）。
   *
   * @param userId 用户 ID。
   * @returns 未过期快照；无缓存或已过期返回 undefined（过期项同步删除）。
   */
  getSnapshot(userId: string): UserAuthSnapshot | undefined {
    const row = this.cache.get(userId);
    if (!row) return undefined;
    // 惰性 TTL：读取时检查是否过期，过期则删除并返回 undefined
    if (Date.now() - row.at > this.ttlMs) {
      this.cache.delete(userId);
      return undefined;
    }
    return row;
  }

  /**
   * 写入/覆盖用户鉴权快照，刷新 at 时间戳。
   *
   * @param userId 用户 ID。
   * @param data 鉴权字段（不含 at，由本方法填充）。
   */
  setSnapshot(
    userId: string,
    data: Pick<UserAuthSnapshot, 'tokenVersion' | 'username' | 'role' | 'preferences'>,
  ): void {
    this.cache.set(userId, { ...data, at: Date.now() });
  }

  /**
   * 仅获取 tokenVersion（便捷方法）。
   *
   * @param userId 用户 ID。
   * @returns 当前 tokenVersion；无缓存或已过期返回 undefined。
   */
  get(userId: string): number | undefined {
    return this.getSnapshot(userId)?.tokenVersion;
  }

  /**
   * 仅更新 tokenVersion（保留已有 username/role/preferences）。
   *
   * 用于改密等场景局部刷新版本号而不覆盖其他字段；无缓存行时以默认值创建。
   *
   * @param userId 用户 ID。
   * @param version 新的 tokenVersion。
   */
  set(userId: string, version: number): void {
    const row = this.cache.get(userId);
    if (row) {
      row.tokenVersion = version;
      row.at = Date.now();
      return;
    }
    // 无缓存行时以空值占位创建，后续 setSnapshot 会补全
    this.setSnapshot(userId, {
      tokenVersion: version,
      username: '',
      role: 'user',
      preferences: {},
    });
  }

  /**
   * 失效指定用户的缓存，并广播到所有实例。
   *
   * 安全意图：改密码/登出全设备等操作后调用，确保所有实例立即清除该用户缓存，
   * 后续请求将回源数据库获取最新 tokenVersion，使旧 token 失效。
   *
   * @param userId 用户 ID。
   */
  invalidate(userId: string) {
    this.cache.delete(userId);
    if (this.redis.isReady()) {
      // void 表示不 await，发布失败不阻塞主流程（TTL 兜底）
      void this.redis.publish(INVALIDATE_CHANNEL, { userId });
    }
  }
}