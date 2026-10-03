/**
 * @file redis.service.ts
 * @module shared/redis
 * @description
 * Redis 全局可注入服务（NestJS DI 容器中的单例）。
 *
 * 职责：
 *   - 维护三条 ioredis 连接（普通 client / pub / sub），统一监听 ready/close/end/error 事件；
 *   - 提供 Pub/Sub 能力（publish / subscribe），单监听器按 channel 分发，避免重复 on('message')；
 *   - 提供 KV（get/set）与 Sorted Set 时间线（zadd/zrangebyscore/mzRangeByScore/zrangeLatest）能力；
 *   - 连接失败时降级为进程内通信，仅 warn 不抛出，保证单副本场景不阻塞启动；
 *   - 通过 EventEmitter2 广播 REDIS_CONNECTION_CHANGED，供上游模块感知就绪状态切换。
 *
 * 关键依赖：ioredis（Redis 客户端）、@nestjs/event-emitter（连接状态广播）。
 * 降级策略：未配置 REDIS_URL 或连接失败时 isReady() 返回 false，调用方需自行兜底。
 */
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Redis } from 'ioredis';
import { getErrorMessage } from '../../common/utils';

/**
 * REDIS_CONNECTION_CHANGED：常量。
 * - 语义：见定义处字面量；来源为硬编码预设/默认值；
 * - 跨端一致性：仅 backend 内部使用；如需跨端同步 packages/shared；
 * - 反射拼接：可能被模板字符串动态访问，重命名需全仓检索
 */
export const REDIS_CONNECTION_CHANGED = 'redis.connection_changed';

const REDIS_CLIENT_OPTS = {
  retryStrategy: (times: number) => Math.min(times * 1000, 10000),
  maxRetriesPerRequest: 3,
  lazyConnect: true,
} as const;

@Injectable()
/** Redis 全局可注入服务：维护三条 ioredis 连接，提供 KV / Pub-Sub / Sorted Set 能力 */
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;
  /** 上次广播的 ready 状态，避免 ioredis 多连接重复 emit */
  private lastBroadcastReady: boolean | null = null;
  /** 单监听器按 channel 分发，避免每个 subscribe 重复 subClient.on('message') */
  private readonly subHandlers = new Map<string, Set<(message: unknown) => void>>();
  private subMessageDispatcher: ((channel: string, raw: string) => void) | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    const url = this.config.get('REDIS_URL');
    if (!url) {
      this.logger.warn('REDIS_URL 未配置,Redis Pub/Sub 不可用');
      return;
    }
    const client = new Redis(url, REDIS_CLIENT_OPTS);
    const pubClient = new Redis(url, REDIS_CLIENT_OPTS);
    const subClient = new Redis(url, REDIS_CLIENT_OPTS);
    this.client = client;
    this.pubClient = pubClient;
    this.subClient = subClient;
    for (const c of [client, pubClient, subClient]) {
      this.attachClientListeners(c);
    }
    try {
      await client.connect();
      await pubClient.connect();
      await subClient.connect();
      this.logger.log('Redis Pub/Sub 已就绪');
      this.broadcastConnectionChange();
    } catch (e) {
      this.logger.warn(`Redis 连接失败,降级为进程内通信: ${getErrorMessage(e)}`);
      await this.disposeClients();
      this.broadcastConnectionChange();
    }
  }

  private async disposeClients() {
    const clients = [this.client, this.pubClient, this.subClient];
    this.client = null;
    this.pubClient = null;
    this.subClient = null;
    await Promise.all(clients.filter(Boolean).map((c) => (c as Redis).quit().catch(() => {})));
  }

  private attachClientListeners(client: Redis) {
    const notify = () => this.broadcastConnectionChange();
    client.on('error', (err) => {
      this.logger.debug(`Redis 连接异常: ${err}`);
      notify();
    });
    client.on('ready', notify);
    client.on('end', notify);
    client.on('close', notify);
  }

  private broadcastConnectionChange() {
    const configured = Boolean(this.config.get('REDIS_URL'));
    const ready = this.isReady();
    if (this.lastBroadcastReady === ready) return;
    this.lastBroadcastReady = ready;
    this.eventEmitter.emit(REDIS_CONNECTION_CHANGED, { configured, ready });
  }

  async onModuleDestroy() {
    if (this.subClient && this.subMessageDispatcher) {
      this.subClient.off('message', this.subMessageDispatcher);
    }
    this.subHandlers.clear();
    this.subMessageDispatcher = null;
    await this.disposeClients();
  }

  getClient(): Redis | null {
    return this.client;
  }

  /** 是否配置了 Redis（REDIS_URL 存在） */
  isConfigured(): boolean {
    return Boolean(this.config.get('REDIS_URL'));
  }

  isReady(): boolean {
    const clients = [this.client, this.pubClient, this.subClient];
    if (!clients.every(Boolean)) return false;
    return (clients as Redis[]).every((c) => c.status === 'ready');
  }

  async publish(channel: string, message: Record<string, unknown>): Promise<boolean> {
    if (!this.isReady()) return false;
    const pub = this.pubClient;
    if (!pub) return false;
    try {
      await pub.publish(channel, JSON.stringify(message));
      return true;
    } catch (e) {
      this.logger.warn(`Redis 发布失败: ${e}`);
      return false;
    }
  }

  private ensureSubMessageDispatcher() {
    if (!this.subClient || this.subMessageDispatcher) return;
    this.subMessageDispatcher = (channel: string, raw: string) => {
      const handlers = this.subHandlers.get(channel);
      if (!handlers?.size) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return;
      }
      for (const handler of handlers) {
        try {
          handler(parsed);
        } catch (err) {
          this.logger.warn(`Redis 订阅回调异常 [${channel}]: ${err}`);
        }
      }
    };
    this.subClient.on('message', this.subMessageDispatcher);
  }

  async subscribe(channel: string, handler: (message: unknown) => void) {
    if (!this.isReady()) return () => {};
    try {
      let handlers = this.subHandlers.get(channel);
      if (!handlers) {
        handlers = new Set();
        this.subHandlers.set(channel, handlers);
        const sub = this.subClient;
        if (!sub) return () => {};
        await sub.subscribe(channel);
      }
      handlers.add(handler);
      this.ensureSubMessageDispatcher();
      return () => {
        const set = this.subHandlers.get(channel);
        if (!set) return;
        set.delete(handler);
        if (set.size === 0) {
          this.subHandlers.delete(channel);
          this.subClient?.unsubscribe(channel).catch(() => {});
        }
      };
    } catch (e) {
      this.logger.warn(`Redis 订阅失败: ${e}`);
      return () => {};
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number) {
    if (!this.client) return;
    if (ttlSeconds) {
      await this.client.setex(key, ttlSeconds, value);
    } else {
      await this.client.set(key, value);
    }
  }

  // ──────── Sorted Set 时间线操作 ────────

  /**
   * 批量管道查询 Sorted Set（高性能 Energy 分析）
   * 单次往返查询多个 key，避免 N 次 RTT
   */
  async mzRangeByScore(keys: string[], min: number, max: number, limit = 100): Promise<string[][]> {
    if (!this.client) return keys.map(() => []);
    try {
      const pipeline = this.client.pipeline();
      for (const key of keys) {
        pipeline.zrangebyscore(key, min, max, 'LIMIT', 0, limit);
      }
      const results = await pipeline.exec();
      if (!results) return keys.map(() => []);
      return results.map(([err, val]) => (err ? [] : (val as string[]) || []));
    } catch {
      return keys.map(() => []);
    }
  }

  /**
   * 向 Sorted Set 追加带时间戳的记录
   * @param key - Redis key（如 "timeline:entity:light.office"）
   * @param score - 数值分数（通常为 Unix 毫秒时间戳）
   * @param member - 成员值（JSON 序列化的状态快照）
   * @param trimToMax - 保留最近 N 条（默认 1000），0 表示不裁剪
   */
  async zadd(key: string, score: number, member: string, trimToMax = 1000) {
    if (!this.client) return;
    try {
      await this.client.zadd(key, score, member);
      if (trimToMax > 0) {
        await this.client.zremrangebyrank(key, 0, -(trimToMax + 1));
      }
    } catch (e) {
      this.logger.warn(`Redis 有序集合写入失败: ${e}`);
    }
  }

  /**
   * 查询 Sorted Set 中按时间范围的数据
   * @returns 成员数组（按 score 升序）
   */
  async zrangebyscore(key: string, min: number, max: number, limit = 100): Promise<string[]> {
    if (!this.client) return [];
    try {
      return await this.client.zrangebyscore(key, min, max, 'LIMIT', 0, limit);
    } catch {
      return [];
    }
  }

  /**
   * 查询 Sorted Set 中时间范围内「最近 limit 条」（按 score 升序返回）。
   * 注意：zrangebyscore 的 LIMIT 0,n 返回的是范围内最旧 n 条，趋势/基线等取"最近"
   * 的场景会读到陈旧数据；本方法用 ZREVRANGEBYSCORE 取最新 n 条后反转回升序。
   */
  async zrangeLatest(key: string, min: number, max: number, limit = 100): Promise<string[]> {
    if (!this.client) return [];
    try {
      const raw = await this.client.zrevrangebyscore(key, max, min, 'LIMIT', 0, limit);
      return raw.reverse();
    } catch {
      return [];
    }
  }
}
