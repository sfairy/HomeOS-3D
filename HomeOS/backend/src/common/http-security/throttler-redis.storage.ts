/**
 * 限流存储：进程内存滑动窗口（单副本部署）。
 *
 * 所属模块：common/http-security。
 * 职责：实现 @nestjs/throttler 的 ThrottlerStorage 接口，以进程内 Map 维护每个限流键的
 *   请求时间戳滑动窗口与封禁状态，供 ThrottlerGuard 在请求进入时计数。
 * 行为与 @nestjs/throttler 默认内存存储一致；单副本无跨实例稀释问题。
 * 命名沿用 RedisThrottlerStorage 是历史遗留（曾规划基于 Redis 的分布式限流），
 * 当前为纯进程内实现；多副本部署需替换为真正的 Redis 存储以避免按副本稀释。
 * 关键依赖：@nestjs/throttler#ThrottlerStorage（接口契约）。
 */
import { Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';

/** 与 @nestjs/throttler 的 ThrottlerStorageRecord 结构一致（该类型未从包根导出） */
interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * 进程内存限流存储（滑动窗口 + 封禁期）。
 *
 * 通过 AppModule providers 中 `getStorageToken()` 注入，替换 throttler 默认存储。
 * 维护两份内存状态：
 *   - hits：限流键 → 请求时间戳数组（滑动窗口内有效命中）；
 *   - blockedUntil：限流键 → 封禁截止时间戳，触发 limit 后进入封禁期。
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  /** 滑动窗口内每个限流键的请求时间戳列表（毫秒） */
  private readonly hits = new Map<string, number[]>();
  /** 触发限流后的封禁截止时间戳（毫秒）；过期后自动解封 */
  private readonly blockedUntil = new Map<string, number>();

  /**
   * 记录一次请求并返回当前窗口状态。
   *
   * 处理流程：
   * 1. 仍处于封禁期 → 直接返回 isBlocked=true（拒绝）；
   * 2. 封禁已过期 → 清理封禁标记；
   * 3. 滑动窗口过滤掉已过期的时间戳；
   * 4. 窗口内命中数 ≥ limit → 进入封禁期并返回 isBlocked=true；
   * 5. 否则累加本次时间戳，返回 isBlocked=false。
   *
   * @param key           限流键（通常为 IP 或 IP+路由）
   * @param ttl           时间窗口长度（毫秒）
   * @param limit         窗口内最大允许请求数
   * @param blockDuration 触发限流后的封禁时长（毫秒）
   * @param _throttlerName 限流器名称（多限流器场景区分，当前未使用）
   * @returns 当前窗口计数与封禁状态（供 ThrottlerGuard 判断放行/拒绝）
   */
  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    _throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const now = Date.now();
    const windowStart = now - ttl;
    const blockUntil = this.blockedUntil.get(key) ?? 0;
    // 仍在封禁期内：直接拒绝，返回剩余封禁时间
    if (blockUntil > now) {
      return {
        totalHits: limit,
        timeToExpire: Math.max(1, Math.ceil((blockUntil - now) / 1000)),
        isBlocked: true,
        timeToBlockExpire: Math.max(1, Math.ceil((blockUntil - now) / 1000)),
      };
    }
    // 封禁已过期：清理封禁标记，恢复正常计数
    if (blockUntil !== 0) this.blockedUntil.delete(key);

    // 滑动窗口：剔除窗口起点之前的过期时间戳
    const stamps = (this.hits.get(key) ?? []).filter((t) => t > windowStart);
    // 窗口内命中数已达上限：进入封禁期
    if (stamps.length >= limit) {
      const blockUntilMs = now + blockDuration;
      this.blockedUntil.set(key, blockUntilMs);
      this.hits.delete(key);
      return {
        totalHits: limit,
        timeToExpire: Math.ceil(blockDuration / 1000),
        isBlocked: true,
        timeToBlockExpire: Math.ceil(blockDuration / 1000),
      };
    }
    // 未达上限：记录本次时间戳，放行
    stamps.push(now);
    this.hits.set(key, stamps);
    return {
      totalHits: stamps.length,
      timeToExpire: Math.ceil(ttl / 1000),
      isBlocked: false,
      timeToBlockExpire: 0,
    };
  }
}
