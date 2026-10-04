/**
 * @file earthquake-global.service.ts
 * @module backend/src/modules
 *
 * 全球 / 区域地震目录服务：CENC + USGS 双源拉取、Redis 缓存与
 * USGS 英文地名中文翻译。
 *
 * 缓存策略：
 *  - 新鲜窗口 5 分钟：命中则直接返回（cached=true, stale=false）
 *  - 陈旧窗口 24 小时：拉取失败时回退（cached=true, stale=true）
 *  - 缓存键按 source:period:minMagnitude:limit 分桶
 *
 * 数据源：
 *  - CENC：优先 CEIC speedsearch 直连，失败回退 Wolfx CENC 列表 API
 *  - USGS：GeoJSON Feed，英文地名通过 enrichUsgsPlacesWithChinese 翻译为中文
 */
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { RedisService } from '../../shared/redis/service';
import { BusinessException, ErrorCode } from '../../common/utils';
import { EarthquakeService } from './service';
import { haversineDistanceKm } from '@homeos/shared';
import {
  parseCeicSpeedsearch,
  parseCeicSpeedsearchText,
  parseCencWolfxEqlist,
  resolveCeicSpeedsearchUrl,
  WOLFX_CENC_EQ_LIST_URL,
} from './feeds.util';
import {
  normalizeGlobalPeriod,
  normalizeGlobalSource,
  parseUsgsGeoJson,
  resolveUsgsFeedUrl,
} from './feeds.util';
import { enrichUsgsPlacesWithChinese } from './place-localize.util';
import type { GlobalEarthquakeFeedResult, GlobalEarthquakeQuery } from './global.types';

/** 新鲜缓存窗口：命中则跳过外源拉取 */
const CACHE_FRESH_SEC = 300;
/** Redis 保留时长：过期后仍可作为 stale 回退 */
const CACHE_STALE_SEC = 86_400;
const CACHE_PREFIX = 'homeos:eew:global:';

/**
 * 全球 / 区域地震目录服务（@Injectable）。
 *
 * 提供 getRecentFeed 接口供控制器调用，内部封装缓存命中、源拉取与
 * 陈旧回退逻辑；USGS 项会通过 enrichUsgsPlacesWithChinese 补充中文地名。
 */
@Injectable()
export class EarthquakeGlobalService {
  private readonly logger = new Logger(EarthquakeGlobalService.name);

  constructor(
    private readonly http: HttpService,
    private readonly redis: RedisService,
    private readonly earthquakeService: EarthquakeService,
  ) {}

  /**
   * 获取全球 / 区域地震目录。
   *
   * 步骤：
   *  1. 归一化查询参数（source / period / minMagnitude / limit）
   *  2. 加载家庭坐标（用于计算 distanceKm）
   *  3. 命中新鲜缓存（<5min）直接返回
   *  4. 拉取对应数据源；失败时回退陈旧缓存（<24h）；均失败抛 SERVICE_UNAVAILABLE
   *  5. 成功后写缓存并返回（cached=false）
   *
   * @param query 查询参数（source/period/minMagnitude/limit，全部可选）
   */
  async getRecentFeed(query: GlobalEarthquakeQuery = {}): Promise<GlobalEarthquakeFeedResult> {
    const source = normalizeGlobalSource(query.source);
    const period = normalizeGlobalPeriod(query.period);
    const minMagnitude = clamp(Number(query.minMagnitude ?? (source === 'cenc' ? 3 : 4)), 2, 8);
    const limit = clamp(Math.floor(Number(query.limit ?? 50)), 1, 100);

    await this.earthquakeService.ensureRuntimeConfig();
    const home = this.earthquakeService.getHomeCoordinates();
    const homeCoordinates =
      home.lat != null && home.lon != null ? { lat: home.lat, lon: home.lon } : null;

    const cacheKey = `${CACHE_PREFIX}${source}:${period}:${minMagnitude}:${limit}`;
    const fresh = await this.loadCache(cacheKey, { allowStale: false });
    if (fresh) {
      return this.withHome(fresh, homeCoordinates, { cached: true, stale: false });
    }

    let items: GlobalEarthquakeFeedResult['items'];
    try {
      items =
        source === 'cenc'
          ? await this.fetchCencItems(period, minMagnitude, limit, homeCoordinates)
          : await this.fetchUsgsItems(period, minMagnitude, limit, homeCoordinates);
    } catch (err: unknown) {
      const label = source === 'cenc' ? '中国地震台网' : 'USGS';
      this.logger.warn(`${label} 震情拉取失败: ${String(err)}`);
      const stale = await this.loadCache(cacheKey, { allowStale: true });
      if (stale) {
        this.logger.warn(`${label} 使用过期缓存(fetchedAt=${stale.fetchedAt})`);
        return this.withHome(stale, homeCoordinates, { cached: true, stale: true });
      }
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        `${label} 数据源暂不可用，请稍后重试`,
      );
    }

    const result: GlobalEarthquakeFeedResult = {
      source,
      period,
      minMagnitude,
      fetchedAt: Date.now(),
      cached: false,
      stale: false,
      homeCoordinates,
      items,
    };

    await this.saveCache(cacheKey, result);
    return result;
  }

  private withHome(
    cached: Omit<GlobalEarthquakeFeedResult, 'cached' | 'homeCoordinates' | 'stale'> & {
      stale?: boolean;
    },
    homeCoordinates: { lat: number; lon: number } | null,
    flags: { cached: boolean; stale: boolean },
  ): GlobalEarthquakeFeedResult {
    return {
      ...cached,
      homeCoordinates,
      items: this.enrichDistances(cached.items, homeCoordinates),
      cached: flags.cached,
      stale: flags.stale,
    };
  }

  private async fetchUsgsItems(
    period: GlobalEarthquakeFeedResult['period'],
    minMagnitude: number,
    limit: number,
    homeCoordinates: { lat: number; lon: number } | null,
  ): Promise<GlobalEarthquakeFeedResult['items']> {
    const url = resolveUsgsFeedUrl(period, minMagnitude);
    const response = await firstValueFrom(
      this.http.get(url, {
        timeout: 15_000,
        headers: { Accept: 'application/json' },
      }),
    );
    const items = parseUsgsGeoJson(response.data, {
      minMagnitude,
      limit,
      homeLat: homeCoordinates?.lat,
      homeLon: homeCoordinates?.lon,
    });
    return enrichUsgsPlacesWithChinese(items, {
      get: (url, config) => firstValueFrom(this.http.get(url, config)),
      redisGet: (key) => this.redis.get(key),
      redisSet: (key, value, ttlSec) => this.redis.set(key, value, ttlSec),
    });
  }

  private async fetchCencItems(
    period: GlobalEarthquakeFeedResult['period'],
    minMagnitude: number,
    limit: number,
    homeCoordinates: { lat: number; lon: number } | null,
  ): Promise<GlobalEarthquakeFeedResult['items']> {
    const ceicItems = await this.tryFetchCeicDirect(period, minMagnitude, limit, homeCoordinates);
    if (ceicItems.length > 0) return ceicItems;

    const response = await firstValueFrom(
      this.http.get(WOLFX_CENC_EQ_LIST_URL, {
        timeout: 15_000,
        headers: { Accept: 'application/json' },
      }),
    );
    const raw = response.data;
    const items = parseCencWolfxEqlist(raw, {
      period,
      minMagnitude,
      limit,
      homeLat: homeCoordinates?.lat,
      homeLon: homeCoordinates?.lon,
    });
    // 过滤后为空属正常（如近 24h 无 M3+），勿当成数据源故障
    if (!items.length) {
      const feedKeys =
        raw && typeof raw === 'object'
          ? Object.keys(raw as Record<string, unknown>).filter((k) => k !== 'md5')
          : [];
      if (!feedKeys.length) {
        throw new BusinessException(ErrorCode.EXTERNAL_ERROR, 'CENC 返回空列表');
      }
    }
    return items;
  }

  private async tryFetchCeicDirect(
    period: GlobalEarthquakeFeedResult['period'],
    minMagnitude: number,
    limit: number,
    homeCoordinates: { lat: number; lon: number } | null,
  ): Promise<GlobalEarthquakeFeedResult['items']> {
    const url = resolveCeicSpeedsearchUrl(period);
    try {
      const response = await firstValueFrom(
        this.http.get(url, {
          timeout: 10_000,
          headers: {
            Accept: '*/*',
            'User-Agent': 'Mozilla/5.0 (compatible; HomeOS/1.0)',
          },
          maxRedirects: 5,
          responseType: 'text',
          validateStatus: (status) => status >= 200 && status < 400,
        }),
      );
      const rows = parseCeicSpeedsearchText(String(response.data ?? ''));
      if (!rows.length) return [];
      return parseCeicSpeedsearch(rows, {
        period,
        minMagnitude,
        limit,
        homeLat: homeCoordinates?.lat,
        homeLon: homeCoordinates?.lon,
      });
    } catch (err: unknown) {
      this.logger.debug(`CEIC 直连不可用,回退 Wolfx CENC: ${String(err)}`);
      return [];
    }
  }

  private enrichDistances(
    items: GlobalEarthquakeFeedResult['items'],
    home: { lat: number; lon: number } | null,
  ) {
    if (!home) {
      return items.map((item) => ({ ...item, distanceKm: null }));
    }
    return items.map((item) => ({
      ...item,
      distanceKm: Math.round(
        haversineDistanceKm(home.lat, home.lon, item.latitude, item.longitude),
      ),
    }));
  }

  private async loadCache(
    key: string,
    opts: { allowStale: boolean },
  ): Promise<Omit<GlobalEarthquakeFeedResult, 'cached' | 'homeCoordinates' | 'stale'> | null> {
    if (!this.redis.isReady()) return null;
    try {
      const raw = await this.redis.get(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as GlobalEarthquakeFeedResult;
      if (!parsed?.items || !Array.isArray(parsed.items)) return null;
      const fetchedAt = Number(parsed.fetchedAt) || 0;
      if (!fetchedAt) return null;
      const ageSec = (Date.now() - fetchedAt) / 1000;
      if (ageSec < 0) return null;
      if (!opts.allowStale && ageSec > CACHE_FRESH_SEC) return null;
      if (opts.allowStale && ageSec > CACHE_STALE_SEC) return null;
      return {
        source: parsed.source,
        period: parsed.period,
        minMagnitude: parsed.minMagnitude,
        fetchedAt,
        items: parsed.items,
      };
    } catch {
      return null;
    }
  }

  private async saveCache(key: string, result: GlobalEarthquakeFeedResult): Promise<void> {
    if (!this.redis.isReady()) return;
    try {
      const { cached: _c, homeCoordinates: _h, stale: _s, ...payload } = result;
      await this.redis.set(key, JSON.stringify(payload), CACHE_STALE_SEC);
    } catch (err: unknown) {
      this.logger.debug(`全球震情缓存写入失败: ${String(err)}`);
    }
  }
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
