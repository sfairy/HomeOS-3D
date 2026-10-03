/**
 * Redis NX + TTL Leader 选举（HA-WS / EEW 等共用）。
 *
 * 所属模块：shared/redis
 * 职责：
 *   - 通过 SET NX PX 抢占 leader key，定期续约保持 leader 身份；
 *   - 模块销毁时用 Lua 脚本安全释放（仅持有者可删），避免误删他人锁；
 *   - Redis 不可用时降级为 standalone leader，保证单副本场景调度/推送不中断。
 * 关键依赖：./service（RedisService 提供 client）、ioredis（eval 执行 Lua 脚本）。
 * 关键逻辑：RENEW_SCRIPT 续约（校验 token 后 pexpire）、RELEASE_SCRIPT 释放（校验 token 后 del）。
 */
import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'crypto';
import type { RedisService } from './service';

/** Lua 续约脚本：仅当 KEY 持有者为 ARGV[1]（本实例 token）时刷新过期时间 */
const RENEW_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
else
  return 0
end
`;

/** Lua 释放脚本：仅当 KEY 持有者为 ARGV[1] 时删除，避免误删其他副本的锁 */
const RELEASE_SCRIPT =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';

/** Leader 选举运行模式：standalone（Redis 不可用，单副本独占）/ leader / follower */
type RedisLeaderMode = 'standalone' | 'leader' | 'follower';

/** Leader 选举构造参数：注入 RedisService 与差异化配置 */
type RedisLeaderElectionOptions = {
  redis: RedisService;
  /** Redis key，如 homeos:ha-ws-leader */
  key: string;
  /** Logger context / 日志前缀 */
  label: string;
  /** standalone 警告文案 */
  standaloneWarning: string;
  ttlMs?: number;
  renewMs?: number;
  logger?: Logger;
};

/** Redis NX + TTL Leader 选举实现：抢占/续约/安全释放锁并维护 leader/follower 状态 */
export class RedisLeaderElection implements OnModuleInit, OnModuleDestroy {
  private readonly logger: Logger;
  private readonly redis: RedisService;
  private readonly key: string;
  private readonly label: string;
  private readonly standaloneWarning: string;
  private ttlMs: number;
  private renewMs: number;

  private token: string | null = null;
  private isLeader = false;
  private mode: RedisLeaderMode = 'standalone';
  private renewTimer: NodeJS.Timeout | null = null;
  private onLeader?: () => void;
  private onFollower?: () => void;
  private standaloneWarned = false;

  constructor(opts: RedisLeaderElectionOptions) {
    this.redis = opts.redis;
    this.key = opts.key;
    this.label = opts.label;
    this.standaloneWarning = opts.standaloneWarning;
    this.ttlMs = opts.ttlMs ?? 15_000;
    this.renewMs = opts.renewMs ?? 5_000;
    this.logger = opts.logger ?? new Logger(`RedisLeader:${opts.label}`);
  }

  /** 热更新租约 TTL / 续约间隔（配置变更后无需重启，正在运行的续约定时器会按新间隔重建） */
  updateTiming(opts: { ttlMs?: number; renewMs?: number }): void {
    if (opts.ttlMs != null && opts.ttlMs > 0 && opts.ttlMs !== this.ttlMs) {
      this.ttlMs = opts.ttlMs;
    }
    if (opts.renewMs != null && opts.renewMs > 0 && opts.renewMs !== this.renewMs) {
      this.renewMs = opts.renewMs;
      if (this.renewTimer) {
        clearInterval(this.renewTimer);
        this.renewTimer = setInterval(() => {
          void this.tick();
        }, this.renewMs);
      }
    }
  }

  /** 注入 leader/follower 状态切换回调（在身份变化时由 setLeaderState 触发） */
  setCallbacks(cb: { onLeader?: () => void; onFollower?: () => void }) {
    this.onLeader = cb.onLeader;
    this.onFollower = cb.onFollower;
  }

  /** NestJS 生命周期：启动时立即触发一次选举，并按 renewMs 周期续约/重选 */
  async onModuleInit() {
    await this.tick();
    this.renewTimer = setInterval(() => {
      void this.tick();
    }, this.renewMs);
  }

  /** NestJS 生命周期：销毁时停掉续约定时器并安全释放当前持有的锁 */
  onModuleDestroy() {
    if (this.renewTimer) clearInterval(this.renewTimer);
    void this.release();
  }

  /** 当前实例是否为 leader（含 standalone 模式下的单副本独占） */
  getIsLeader(): boolean {
    return this.isLeader;
  }

  /** 当前运行模式（standalone / leader / follower） */
  getMode(): RedisLeaderMode {
    return this.mode;
  }

  /** 综合状态快照：isLeader + mode */
  getStatus() {
    return { isLeader: this.isLeader, mode: this.mode };
  }

  /**
   * 选举核心循环：每次 tick 完成「续约 or 竞选」一轮。
   *
   * 流程：
   *  1. Redis 未就绪 → 降级 standalone leader（单副本不中断）；
   *  2. 当前为 leader 且持 token → 用 RENEW_SCRIPT 续约；续约失败转 follower；
   *  3. 用 SET NX PX 抢占 key，成功则成为新 leader；
   *  4. 仍未拿到 key → 维持 / 转为 follower。
   */
  private async tick() {
    if (!this.redis.isReady()) {
      // Redis 不可用：单副本允许 standalone leader，保证调度/推送不中断
      this.setLeaderState(true, 'standalone');
      return;
    }

    const client = this.redis.getClient();
    if (!client) {
      this.setLeaderState(true, 'standalone');
      return;
    }

    if (this.isLeader && this.token) {
      try {
        const renewed = await client.eval(
          RENEW_SCRIPT,
          1,
          this.key,
          this.token,
          String(this.ttlMs),
        );
        if (renewed === 1) return;
      } catch (e) {
        this.logger.warn(`${this.label} Leader 续租失败: ${e}`);
      }
      this.setLeaderState(false, 'follower');
      this.token = null;
    }

    const candidate = randomBytes(8).toString('hex');
    try {
      const ok = await client.set(this.key, candidate, 'PX', this.ttlMs, 'NX');
      if (ok === 'OK') {
        this.token = candidate;
        this.setLeaderState(true, 'leader');
        return;
      }
    } catch (e) {
      this.logger.warn(`${this.label} Leader 竞选失败: ${e}`);
    }

    if (this.isLeader) {
      this.token = null;
      this.setLeaderState(false, 'follower');
    } else if (this.mode !== 'follower') {
      this.setLeaderState(false, 'follower');
    }
  }

  /**
   * 切换 leader 状态并触发回调。
   * - standalone 模式首次进入时输出告警（仅一次）；
   * - 由 follower→leader 触发 onLeader；leader→follower 触发 onFollower。
   */
  private setLeaderState(leader: boolean, mode: RedisLeaderMode) {
    const wasLeader = this.isLeader;
    this.isLeader = leader;
    this.mode = mode;
    if (mode === 'standalone' && !this.standaloneWarned) {
      this.standaloneWarned = true;
      this.logger.warn(this.standaloneWarning);
    }
    if (!wasLeader && leader) {
      this.logger.log(`本实例成为 ${this.label} Leader(${mode})`);
      this.onLeader?.();
    } else if (wasLeader && !leader) {
      this.logger.warn(`本实例失去 ${this.label} Leader,进入 follower`);
      this.onFollower?.();
    }
  }

  /**
   * 释放当前持有的 leader 锁（模块销毁时调用）。
   * 使用 RELEASE_SCRIPT 校验 token 后删除，仅持有者可删，避免误删其他副本的锁；
   * Redis 不可用或未持 token 时直接转 follower（无需删 key）。
   */
  private async release() {
    if (!this.token || !this.redis.isReady()) return;
    const client = this.redis.getClient();
    if (!client) return;
    try {
      await client.eval(RELEASE_SCRIPT, 1, this.key, this.token);
    } catch {
      /* 忽略 */
    }
    this.token = null;
    this.setLeaderState(false, 'follower');
  }
}
