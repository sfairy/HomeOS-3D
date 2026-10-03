/**
 * 天气预警解析与缓存辅助函数
 *
 * 模块：system/ops
 * 职责：
 *  - WEATHER_ALERT_TYPE_MAP：OpenWeather 预警事件类型 → 中英文映射
 *  - mapWeatherAlertType / mapOpenWeatherAlertLevel：类型 / 级别映射
 *  - parseOpenWeatherAlerts：解析 OpenWeather OneCall API 的 alerts 字段
 *  - fetchOpenWeatherAlertsWithCache：带 Redis 缓存的预警拉取（关键路径）
 *
 * 关键路径：fetchOpenWeatherAlertsWithCache 被 ExternalApiService 调用，
 * 修改时注意 Redis 缓存 key 格式与 TTL 一致性。
 */

/**
 * OpenWeather / 通用预警类型 → 中英文映射表
 * key 为小写英文关键词（用于 includes 匹配）
 */
const WEATHER_ALERT_TYPE_MAP: Record<string, { zh: string; en: string }> = {
  rain: { zh: '暴雨', en: 'Rain' },
  thunderstorm: { zh: '雷暴', en: 'Thunderstorm' },
  wind: { zh: '大风', en: 'Wind' },
  snow: { zh: '暴雪', en: 'Snow' },
  fog: { zh: '大雾', en: 'Fog' },
  heat: { zh: '高温', en: 'Heat' },
  cold: { zh: '寒潮', en: 'Cold' },
  tornado: { zh: '龙卷风', en: 'Tornado' },
  flood: { zh: '洪水', en: 'Flood' },
  hurricane: { zh: '台风', en: 'Hurricane' },
  typhoon: { zh: '台风', en: 'Typhoon' },
};

/**
 * 天气预警数据结构
 */
export interface WeatherAlert {
  /** 预警级别（red / orange / yellow） */
  level: string;
  /** 中文类型（如 "暴雨"） */
  type: string;
  /** 英文类型（如 "Rain"） */
  typeEn?: string;
  /** 预警标题（中文） */
  title: string;
  /** 预警描述文本 */
  description: string;
  /** 生效起始时间 ISO */
  effectiveFrom: string;
  /** 生效结束时间 ISO */
  effectiveTo: string;
  /** 数据源（如 OpenWeatherMap） */
  source: string;
}

/**
 * 把 OpenWeather 原始事件名映射为中英文类型。
 * 匹配策略：转小写 + 去除非字母字符，再 includes 命中映射表 key。
 *
 * @param raw 原始事件名（如 "Severe Thunderstorm Warning"）
 * @returns { zh, en } 中英文类型；未命中则原样返回
 */
function mapWeatherAlertType(raw: string): { zh: string; en: string } {
  const key = raw.toLowerCase().replace(/[^a-z]/g, '');
  for (const [k, v] of Object.entries(WEATHER_ALERT_TYPE_MAP)) {
    if (key.includes(k)) return v;
  }
  return { zh: raw || '未知', en: raw || 'Unknown' };
}

/**
 * 根据 OpenWeather tags 映射预警级别。
 *  - red / extreme → red
 *  - orange / severe → orange
 *  - 其他 → yellow
 *
 * @param tags OpenWeather alert.tags 数组
 */
function mapOpenWeatherAlertLevel(tags: string[]): string {
  const t = tags.join(' ').toLowerCase();
  if (t.includes('red') || t.includes('extreme')) return 'red';
  if (t.includes('orange') || t.includes('severe')) return 'orange';
  return 'yellow';
}

/**
 * 解析 OpenWeather OneCall API 的 alerts 字段为 WeatherAlert[]。
 * 字段映射：
 *  - event       → mapWeatherAlertType → type/typeEn/title
 *  - tags        → mapOpenWeatherAlertLevel → level
 *  - start/end   → unix 秒 → ISO 时间
 *  - description → description
 *
 * @param payload OpenWeather OneCall API 响应
 * @returns 预警列表（无 alerts 字段时返回空数组）
 */
function parseOpenWeatherAlerts(payload: Record<string, unknown>): WeatherAlert[] {
  if (!payload.alerts || !Array.isArray(payload.alerts)) return [];
  return payload.alerts.map((raw) => {
    const a = raw as Record<string, unknown>;
    const mapped = mapWeatherAlertType(String(a.event || ''));
    const tags = Array.isArray(a.tags) ? a.tags.map(String) : [];
    const start = typeof a.start === 'number' ? a.start : 0;
    const end = typeof a.end === 'number' ? a.end : 0;
    return {
      level: mapOpenWeatherAlertLevel(tags),
      type: mapped.zh,
      typeEn: mapped.en,
      title: mapped.zh || String(a.event || '天气预警'),
      description: String(a.description || ''),
      effectiveFrom: new Date(start * 1000).toISOString(),
      effectiveTo: new Date(end * 1000).toISOString(),
      source: 'OpenWeatherMap',
    };
  });
}
/**
 * 天气预警拉取依赖注入接口（让 helper 可测试，不直接依赖 HttpService / Redis）
 */
interface WeatherAlertsFetchDeps {
  /** Redis 缓存 key */
  cacheKey: string;
  /** Redis 读取 */
  redisGet: (key: string) => Promise<string | null>;
  /** Redis 写入（带 TTL） */
  redisSet: (key: string, value: string, ttlSec: number) => Promise<void>;
  /** 实际调用 OpenWeather OneCall API */
  fetchOneCall: (lat: number, lon: number, apiKey: string) => Promise<Record<string, unknown>>;
  /** 获取内存缓存的预警列表 */
  getCachedAlerts: () => WeatherAlert[];
  /** 更新内存缓存的预警列表 */
  setCachedAlerts: (alerts: WeatherAlert[]) => void;
  /** 获取上次拉取时间戳 */
  getLastAlertCheck: () => number;
  /** 更新上次拉取时间戳 */
  setLastAlertCheck: (ts: number) => void;
  /** 拉取刷新间隔（毫秒） */
  alertRefreshMs: () => number;
  /** Redis 缓存 TTL（秒） */
  weatherAlertsTtlSec: () => number;
  /** Redis 读取异常回调 */
  onCacheReadError?: (err: unknown) => void;
  /** API 拉取异常回调 */
  onFetchError?: (err: unknown) => void;
}

/**
 * 带缓存的 OpenWeather 预警拉取（关键路径）。
 *
 * 缓存与刷新策略：
 *  1. 未配置 apiKey → 返回空 + configured=false + message
 *  2. Redis 命中 → 直接返回（cached=true），并同步到内存缓存
 *  3. Redis 未命中 + 距上次拉取 < alertRefreshMs + 内存有缓存 → 返回内存缓存
 *  4. 否则实际请求 API，解析后写 Redis + 内存缓存
 *  5. API 失败 → 返回内存缓存（降级），不抛出
 *
 * @param lat     纬度
 * @param lon     经度
 * @param apiKey  OpenWeather API Key
 * @param deps    依赖接口
 * @returns alerts / configured / cached / message
 */
export async function fetchOpenWeatherAlertsWithCache(
  lat: number,
  lon: number,
  apiKey: string,
  deps: WeatherAlertsFetchDeps,
): Promise<{ alerts: WeatherAlert[]; configured: boolean; cached?: boolean; message?: string }> {
  if (!apiKey) {
    return {
      alerts: [],
      configured: false,
      message: '未配置 OpenWeather API Key（高级参数 → external）',
    };
  }

  // 步骤 2：尝试 Redis 缓存
  try {
    const cached = await deps.redisGet(deps.cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      const alerts = parsed.alerts || [];
      deps.setCachedAlerts(alerts);
      deps.setLastAlertCheck(parsed.fetchedAt || Date.now());
      return { alerts, configured: true, cached: true };
    }
  } catch (err: unknown) {
    deps.onCacheReadError?.(err);
  }

  // 步骤 3：Redis 未命中 + 距上次拉取不足间隔 + 内存有缓存 → 用内存缓存
  const now = Date.now();
  const cachedAlerts = deps.getCachedAlerts();
  if (now - deps.getLastAlertCheck() < deps.alertRefreshMs() && cachedAlerts.length > 0) {
    return { alerts: cachedAlerts, configured: true };
  }

  // 步骤 4：实际请求 API
  try {
    const payload = await deps.fetchOneCall(lat, lon, apiKey);
    const alerts = parseOpenWeatherAlerts(payload);
    deps.setCachedAlerts(alerts);
    deps.setLastAlertCheck(now);
    await deps.redisSet(
      deps.cacheKey,
      JSON.stringify({ alerts, fetchedAt: now }),
      deps.weatherAlertsTtlSec(),
    );
    return { alerts, configured: true };
  } catch (e: unknown) {
    // 步骤 5：API 失败 → 降级返回内存缓存，不抛出
    deps.onFetchError?.(e);
    return { alerts: deps.getCachedAlerts(), configured: true };
  }
}