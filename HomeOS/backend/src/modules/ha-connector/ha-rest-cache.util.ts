/**
 * HA REST 响应缓存（纯函数式，无副作用依赖）
 *
 * 所属模块：ha-connector
 * 职责：为 REST 历史查询与全量状态查询提供短时缓存 + 单飞去重，
 *      避免断连 REST 补同步期间频繁打到 HA /api/states 与 /api/history/period。
 * 关键依赖：HaEntity 类型。
 */
import type { HaEntity } from '../../shared/types';

/** 全量状态缓存 TTL（ms）：断连补同步期间避免重复拉 /api/states */
const ALL_STATES_CACHE_MS = 3_000;

interface HistoryCacheEntry {
  data: unknown;
  timestamp: number;
}

/**
 * REST 历史查询缓存：TTL + 容量上限 + 单飞去重。
 * 相同 cacheKey 的并发请求合并为一次 fetch，结果缓存至 TTL 过期或容量满时 LRU 淘汰。
 */
export class HaRestHistoryCache {
  private readonly cache = new Map<string, HistoryCacheEntry>();
  /** 单飞去重：相同 cacheKey 的进行中请求 */
  private readonly pending = new Map<string, Promise<unknown>>();

  constructor(
    private readonly getTtlMs: () => number,
    private readonly getMaxSize: () => number,
  ) {}

  /** 命中未过期缓存时返回数据，否则返回 undefined。 */
  getCached(cacheKey: string): unknown | undefined {
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.getTtlMs()) {
      return cached.data;
    }
    return undefined;
  }

  /** 返回进行中的同 key 请求（用于外层合并等待）。 */
  getPending(cacheKey: string): Promise<unknown> | undefined {
    return this.pending.get(cacheKey);
  }

  /**
   * 单飞执行：同 key 并发请求合并为一次 fetcher 调用，结果写缓存（带 LRU 淘汰）。
   * @param cacheKey 缓存键。
   * @param fetcher 实际 fetch 函数。
   * @returns fetcher 的结果（并发请求共享同一 Promise）。
   */
  async runDeduped(cacheKey: string, fetcher: () => Promise<unknown>): Promise<unknown> {
    const pending = this.pending.get(cacheKey);
    if (pending) return pending;

    const requestPromise = fetcher();
    this.pending.set(cacheKey, requestPromise);
    try {
      const data = await requestPromise;
      this.evictIfNeeded();
      this.cache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    } finally {
      this.pending.delete(cacheKey);
    }
  }

  /** 清空缓存与进行中请求。 */
  clear(): void {
    this.cache.clear();
    this.pending.clear();
  }

  /**
   * 容量满时先清过期项，仍满则淘汰最旧项（简易 LRU）。
   * 在写入新缓存前调用，保证缓存大小不超上限。
   */
  private evictIfNeeded(): void {
    if (this.cache.size < this.getMaxSize()) return;
    const now = Date.now();
    const ttl = this.getTtlMs();
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > ttl) {
        this.cache.delete(key);
      }
    }
    if (this.cache.size >= this.getMaxSize()) {
      let oldestKey = '';
      let oldestTime = Infinity;
      for (const [key, entry] of this.cache) {
        if (entry.timestamp < oldestTime) {
          oldestTime = entry.timestamp;
          oldestKey = key;
        }
      }
      if (oldestKey) this.cache.delete(oldestKey);
    }
  }
}

/**
 * REST 全量状态缓存：3s TTL + 单飞去重。
 * 避免断连 REST 补同步期间频繁拉取 /api/states。
 */
export class HaRestAllStatesCache {
  private cache: { data: HaEntity[]; at: number } | null = null;
  /** 进行中的请求（单飞去重） */
  private inflight: Promise<HaEntity[]> | null = null;

  /** 返回 3s 内的缓存数据，过期返回 null。 */
  getFresh(now = Date.now()): HaEntity[] | null {
    if (this.cache && now - this.cache.at < ALL_STATES_CACHE_MS) {
      return this.cache.data;
    }
    return null;
  }

  /** 返回进行中的全量状态请求（用于合并等待）。 */
  getInflight(): Promise<HaEntity[]> | null {
    return this.inflight;
  }

  /**
   * 单飞执行全量状态拉取：进行中请求直接复用，否则发起新请求并写缓存。
   * @param fetcher 实际 fetch 函数（接收 timeoutMs）。
   * @param timeoutMs 超时毫秒数。
   * @returns 全量实体数组（并发请求共享同一 Promise）。
   */
  runDeduped(
    fetcher: (timeoutMs: number) => Promise<HaEntity[]>,
    timeoutMs: number,
  ): Promise<HaEntity[]> {
    if (this.inflight) return this.inflight;

    this.inflight = fetcher(timeoutMs)
      .then((data) => {
        this.cache = { data, at: Date.now() };
        return data;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  /** 清空缓存与进行中请求。 */
  clear(): void {
    this.cache = null;
    this.inflight = null;
  }
}
