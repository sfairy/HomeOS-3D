/**
 * USGS 震中坐标 → 中文地名（反向地理编码 + Redis 缓存）。
 *
 * 职责：
 *  - 通过 BigDataCloud / Nominatim 反向地理编码 API 将经纬度转为中文地名。
 *  - 多级缓存：内存 Map → Redis（30 天 TTL）→ 远程 API。
 *  - 批量并发查询（默认 4 并发，最多 40 个坐标），避免阻塞主流程。
 *  - 仅保留含 CJK 字符的结果，过滤无效翻译。
 *
 * 依赖：GlobalEarthquakeEvent 类型、外部 HTTP get 与 Redis get/set（通过依赖注入）。
 */
import type { GlobalEarthquakeEvent } from './global.types';

/** Redis 缓存键前缀 */
const PLACE_ZH_CACHE_PREFIX = 'homeos:eew:place-zh:';
/** Redis 缓存 TTL（秒），30 天 */
const PLACE_ZH_CACHE_TTL_SEC = 30 * 24 * 60 * 60;
/** 单次反向地理编码请求超时（毫秒） */
const PLACE_ZH_LOOKUP_TIMEOUT_MS = 4_000;
/** 单次批量查询最多处理的坐标数 */
const PLACE_ZH_MAX_LOOKUPS = 40;
/** 并发查询数 */
const PLACE_ZH_CONCURRENCY = 4;

/** BigDataCloud 反向地理编码 API 地址（首选） */
const BIGDATACLOUD_REVERSE_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client';
/** Nominatim 反向地理编码 API 地址（备选） */
const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';

/**
 * 地点本地化依赖注入接口。
 * 通过依赖注入解耦 HTTP 与 Redis，便于测试与不同运行环境。
 */
interface PlaceLocalizeLookupDeps {
  /** HTTP GET 请求函数 */
  get: (
    url: string,
    config?: {
      timeout?: number;
      headers?: Record<string, string>;
      params?: Record<string, string | number>;
    },
  ) => Promise<{ data: unknown }>;
  /** Redis 读取函数（可选） */
  redisGet?: (key: string) => Promise<string | null>;
  /** Redis 写入函数（可选，带 TTL） */
  redisSet?: (key: string, value: string, ttlSec: number) => Promise<void>;
}

/** @returns 坐标对应的 Redis 缓存键（精度 2 位小数） */
function placeLocalizeCacheKey(latitude: number, longitude: number): string {
  return `${PLACE_ZH_CACHE_PREFIX}${latitude.toFixed(2)}:${longitude.toFixed(2)}`;
}

/**
 * 将 BigDataCloud 反向地理编码响应格式化为中文地名。
 * 拼接 countryName + principalSubdivision + city + locality；
 * 若主字段为空，回退到 localityInfo.administrative 行政层级。
 * @returns 中文地名，无法提取时返回 null
 */
function formatPlaceZhFromBigDataCloud(body: unknown): string | null {
  const data = body as {
    countryName?: string;
    principalSubdivision?: string;
    city?: string;
    locality?: string;
    localityInfo?: { administrative?: Array<{ name?: string; order?: number }> };
  };
  if (!data || typeof data !== 'object') return null;

  const parts: string[] = [];
  const push = (value: unknown) => {
    const text = String(value || '').trim();
    if (!text || parts.includes(text)) return;
    parts.push(text);
  };

  push(data.countryName);
  push(data.principalSubdivision);
  push(data.city);
  push(data.locality);

  if (!parts.length && Array.isArray(data.localityInfo?.administrative)) {
    const admin = [...data.localityInfo.administrative]
      .filter((row) => row?.name)
      .sort((a, b) => Number(b.order ?? 0) - Number(a.order ?? 0));
    for (const row of admin.slice(0, 4)) push(row.name);
  }

  return parts.length ? parts.join('') : null;
}

/**
 * 将 Nominatim 反向地理编码响应格式化为中文地名。
 * 优先拼接 address 中的 country + state + county + suburb；
 * 若 address 为空，回退到 display_name。
 * @returns 中文地名，无法提取时返回 null
 */
function formatPlaceZhFromNominatim(body: unknown): string | null {
  const data = body as { address?: Record<string, string>; display_name?: string };
  const addr = data?.address;
  if (!addr || typeof addr !== 'object') {
    const display = String(data?.display_name || '').trim();
    return display || null;
  }

  const parts: string[] = [];
  const push = (value: unknown) => {
    const text = String(value || '').trim();
    if (!text || parts.includes(text)) return;
    parts.push(text);
  };

  push(addr.country);
  push(addr.state || addr.province || addr.region);
  push(addr.county || addr.city || addr.town || addr.village || addr.hamlet);
  push(addr.suburb || addr.neighbourhood || addr.isolated_dwelling);

  if (!parts.length) {
    const display = String(data.display_name || '').trim();
    return display || null;
  }
  return parts.join('');
}

/** @returns 文本是否包含 CJK 中日韩字符（用于过滤无效翻译结果） */
function hasCjkText(text: string): boolean {
  return /[\u3400-\u9fff]/.test(text);
}

function coordKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(2)}:${longitude.toFixed(2)}`;
}

/** 从 Redis 读取缓存的中文地名，读取失败返回 null */
async function readCachedPlace(
  deps: PlaceLocalizeLookupDeps,
  latitude: number,
  longitude: number,
): Promise<string | null> {
  if (!deps.redisGet) return null;
  try {
    const raw = await deps.redisGet(placeLocalizeCacheKey(latitude, longitude));
    const text = String(raw || '').trim();
    return text || null;
  } catch {
    return null;
  }
}

/** 将中文地名写入 Redis 缓存，写入失败静默忽略 */
async function writeCachedPlace(
  deps: PlaceLocalizeLookupDeps,
  latitude: number,
  longitude: number,
  placeZh: string,
): Promise<void> {
  if (!deps.redisSet) return;
  try {
    await deps.redisSet(placeLocalizeCacheKey(latitude, longitude), placeZh, PLACE_ZH_CACHE_TTL_SEC);
  } catch {
    // 忽略缓存写入失败
  }
}

/**
 * 远程反向地理编码查询中文地名。
 * 优先 BigDataCloud，失败或结果无 CJK 字符时回退 Nominatim。
 * @returns 中文地名，两次查询均失败时返回 null
 */
async function lookupPlaceZhRemote(
  deps: PlaceLocalizeLookupDeps,
  latitude: number,
  longitude: number,
): Promise<string | null> {
  try {
    const { data } = await deps.get(BIGDATACLOUD_REVERSE_URL, {
      timeout: PLACE_ZH_LOOKUP_TIMEOUT_MS,
      params: {
        latitude,
        longitude,
        localityLanguage: 'zh',
      },
    });
    const fromBdc = formatPlaceZhFromBigDataCloud(data);
    if (fromBdc && hasCjkText(fromBdc)) return fromBdc;
  } catch {
    // 回退到 Nominatim
  }

  try {
    const { data } = await deps.get(NOMINATIM_REVERSE_URL, {
      timeout: PLACE_ZH_LOOKUP_TIMEOUT_MS,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'HomeOS/1.0 (earthquake-place-localize)',
      },
      params: {
        lat: latitude,
        lon: longitude,
        format: 'json',
        'accept-language': 'zh-CN',
        zoom: 8,
      },
    });
    const fromNom = formatPlaceZhFromNominatim(data);
    if (fromNom && hasCjkText(fromNom)) return fromNom;
  } catch {
    return null;
  }

  return null;
}

/**
 * 解析单个坐标的中文地名（内存缓存 → Redis → 远程 API 三级查询）。
 * @param memoryCache 内存缓存 Map，避免同批次重复查询
 * @returns 中文地名，无法解析时返回 null
 */
async function resolvePlaceZh(
  deps: PlaceLocalizeLookupDeps,
  latitude: number,
  longitude: number,
  memoryCache: Map<string, string | null>,
): Promise<string | null> {
  const key = coordKey(latitude, longitude);
  if (memoryCache.has(key)) return memoryCache.get(key) ?? null;

  const cached = await readCachedPlace(deps, latitude, longitude);
  if (cached) {
    memoryCache.set(key, cached);
    return cached;
  }

  const remote = await lookupPlaceZhRemote(deps, latitude, longitude);
  memoryCache.set(key, remote);
  if (remote) await writeCachedPlace(deps, latitude, longitude, remote);
  return remote;
}

/**
 * 并发执行 worker 处理 items，控制最大并发数。
 * @param items 待处理项
 * @param concurrency 最大并发数
 * @param worker 处理函数
 * @returns 结果数组（顺序与 items 一致）
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return [];
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function runWorker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

/**
 * 批量为 USGS 地震事件的英文地名补充中文地名。
 *
 * 流程：
 *  1. 去重提取所有唯一坐标（精度 2 位小数）。
 *  2. 限制最多查询 PLACE_ZH_MAX_LOOKUPS 个坐标。
 *  3. 以 PLACE_ZH_CONCURRENCY 并发查询中文地名（三级缓存）。
 *  4. 将查询到的中文地名写入 item.place，原英文名保留到 item.placeEn。
 *
 * @param items 地震事件数组
 * @param deps 依赖（HTTP get / Redis get/set）
 * @returns 补充了中文地名的事件数组
 */
export async function enrichUsgsPlacesWithChinese(
  items: GlobalEarthquakeEvent[],
  deps: PlaceLocalizeLookupDeps,
): Promise<GlobalEarthquakeEvent[]> {
  if (!items.length) return items;

  const uniqueCoords = new Map<string, { latitude: number; longitude: number }>();
  for (const item of items) {
    if (!Number.isFinite(item.latitude) || !Number.isFinite(item.longitude)) continue;
    const key = coordKey(item.latitude, item.longitude);
    if (!uniqueCoords.has(key)) {
      uniqueCoords.set(key, { latitude: item.latitude, longitude: item.longitude });
    }
  }

  const memoryCache = new Map<string, string | null>();
  const coordList = [...uniqueCoords.entries()].slice(0, PLACE_ZH_MAX_LOOKUPS);

  await mapWithConcurrency(coordList, PLACE_ZH_CONCURRENCY, async ([key, coord]) => {
    await resolvePlaceZh(deps, coord.latitude, coord.longitude, memoryCache);
    return key;
  });

  return items.map((item) => {
    const placeEn = item.place;
    const key = coordKey(item.latitude, item.longitude);
    const placeZh = memoryCache.get(key);
    if (!placeZh || placeZh === placeEn) {
      return item;
    }
    return {
      ...item,
      place: placeZh,
      placeEn,
    };
  });
}
