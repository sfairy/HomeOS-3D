/**
 * 地震数据源解析工具集。
 *
 * 合并自：earthquake-cenc-feed.util.ts、earthquake-global-feed.util.ts、earthquake-wolfx-parse.util.ts
 *
 * 职责：
 *  - 解析 CENC（中国地震台网）目录：CEIC speedsearch 接口 + WolfX CENC 列表。
 *  - 解析 USGS GeoJSON 全球地震目录。
 *  - 解析 WolfX WebSocket EEW 消息为内部 EewRawMessage。
 *  - 统一地震时间字符串为 UTC 毫秒时间戳（JMA 源 UTC+9，中国源 UTC+8）。
 *
 * 依赖：@homeos/shared 提供震中距计算 haversineDistanceKm。
 */
import { haversineDistanceKm } from '@homeos/shared';
import type { GlobalEarthquakeEvent, GlobalEarthquakePeriod, GlobalEarthquakeSource } from './global.types';
import type { EewRawMessage } from './types';

// ── earthquake-cenc-feed.util ──
/** WolfX CENC 地震列表 API 地址 */
export const WOLFX_CENC_EQ_LIST_URL = 'https://api.wolfx.jp/cenc_eqlist.json';
/** CEIC speedsearch 接口基础地址，需拼接 num 参数 */
const CEIC_SPEEDSEARCH_BASE = 'http://www.ceic.ac.cn/ajax/speedsearch?num=';

/** 各查询窗口对应的毫秒数 */
const PERIOD_MS: Record<GlobalEarthquakePeriod, number> = {
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

/**
 * 将查询窗口映射为 CEIC speedsearch 的 num 参数。
 * CEIC speedsearch num 参数：1=24h, 2=48h, 3=7d, 4=30d
 * @param period 查询窗口
 * @returns CEIC num 参数值
 */
function resolveCeicSpeedsearchNum(period: GlobalEarthquakePeriod): number {
  switch (period) {
    case 'hour':
    case 'day':
      return 1;
    case 'week':
      return 3;
    case 'month':
      return 4;
    default:
      return 1;
  }
}

/** @returns 拼接好 num 参数的 CEIC speedsearch 完整 URL */
export function resolveCeicSpeedsearchUrl(period: GlobalEarthquakePeriod): string {
  return `${CEIC_SPEEDSEARCH_BASE}${resolveCeicSpeedsearchNum(period)}`;
}

/**
 * 计算查询窗口的截止时间戳（毫秒），早于此时间的事件将被过滤。
 * @param period 查询窗口
 * @param now 当前时间戳，默认 Date.now()
 * @returns 截止时间戳
 */
function periodCutoffMs(period: GlobalEarthquakePeriod, now = Date.now()): number {
  return now - (PERIOD_MS[period] ?? PERIOD_MS.day);
}

/**
 * 解析 CEIC speedsearch 接口返回的 JSONP 文本。
 * 接口返回格式为 `( {...} )`，需去除外层括号并修复 page 字段后 JSON.parse。
 * @param text 原始响应文本
 * @returns 解析出的行数组，解析失败返回空数组
 */
export function parseCeicSpeedsearchText(text: string): Record<string, unknown>[] {
  const trimmed = String(text || '').trim();
  if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) return [];
  try {
    const inner = trimmed.slice(1, -1).replace(/,"page":"(.*?)","num":/, ',"num":');
    const json = JSON.parse(inner) as { shuju?: unknown[] };
    if (!Array.isArray(json.shuju)) return [];
    return json.shuju.filter(
      (row): row is Record<string, unknown> => !!row && typeof row === 'object',
    );
  } catch {
    return [];
  }
}

/**
 * 过滤并解析 CEIC speedsearch 行数据为地震事件列表。
 * 按时间窗口、最低震级过滤，最多返回 limit 条，并计算家庭距离（如配置坐标）。
 * @param rows parseCeicSpeedsearchText 解析出的原始行
 * @param opts 过滤选项（窗口、震级下限、数量上限、家庭坐标）
 * @returns 地震事件数组
 */
export function parseCeicSpeedsearch(
  rows: Record<string, unknown>[],
  opts: {
    period: GlobalEarthquakePeriod;
    minMagnitude: number;
    limit: number;
    homeLat?: number | null;
    homeLon?: number | null;
    now?: number;
  },
): GlobalEarthquakeEvent[] {
  const cutoff = periodCutoffMs(opts.period, opts.now);
  const items: GlobalEarthquakeEvent[] = [];

  for (const row of rows) {
    const parsed = parseCeicRow(row, opts.homeLat, opts.homeLon);
    if (!parsed) continue;
    if (parsed.originTime < cutoff) continue;
    if (parsed.magnitude < opts.minMagnitude) continue;
    items.push(parsed);
    if (items.length >= opts.limit) break;
  }

  return items;
}

/**
 * 解析单行 CEIC speedsearch 数据为地震事件。
 * 字段映射：M→magnitude, EPI_LAT→latitude, EPI_LON→longitude, EPI_DEPTH→depth,
 * O_TIME→originTime, SAVE_TIME→reportTime, LOCATION_C→place, NEW_DID→id。
 * @returns 解析失败或数值非法时返回 null
 */
function parseCeicRow(
  row: Record<string, unknown>,
  homeLat?: number | null,
  homeLon?: number | null,
): GlobalEarthquakeEvent | null {
  const magnitude = Number(row.M);
  const latitude = Number(row.EPI_LAT);
  const longitude = Number(row.EPI_LON);
  if (!Number.isFinite(magnitude) || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const originTime = parseWolfxTimeMs(row.O_TIME, 'cenc');
  const reportTime = parseWolfxTimeMs(row.SAVE_TIME ?? row.O_TIME, 'cenc');
  const depth = Number(row.EPI_DEPTH);
  const newDid = row.NEW_DID != null ? String(row.NEW_DID).trim() : '';
  const place = String(row.LOCATION_C || '未知位置').trim();
  const id = newDid || `${originTime}-${latitude}-${longitude}`;

  let distanceKm: number | null = null;
  if (homeLat != null && homeLon != null && Number.isFinite(homeLat) && Number.isFinite(homeLon)) {
    distanceKm = Math.round(haversineDistanceKm(homeLat, homeLon, latitude, longitude));
  }

  return {
    id,
    magnitude: Math.round(magnitude * 10) / 10,
    magType: 'M',
    place,
    latitude,
    longitude,
    depth: Number.isFinite(depth) ? Math.round(depth * 10) / 10 : 0,
    originTime,
    updatedTime: reportTime || originTime,
    url: newDid ? `https://www.ceic.ac.cn/${newDid}.html` : '',
    tsunami: false,
    status: 'reviewed',
    intensity: null,
    distanceKm,
  };
}

/**
 * 解析 WolfX CENC 地震列表 JSON 为地震事件数组。
 * WolfX 列表以事件 ID 为 key 的对象集合，需提取并按时间倒序排列后过滤。
 * @param body WolfX API 返回的 JSON 对象
 * @param opts 过滤选项
 * @returns 地震事件数组
 */
export function parseCencWolfxEqlist(
  body: unknown,
  opts: {
    period: GlobalEarthquakePeriod;
    minMagnitude: number;
    limit: number;
    homeLat?: number | null;
    homeLon?: number | null;
    now?: number;
  },
): GlobalEarthquakeEvent[] {
  const obj = body as Record<string, unknown>;
  if (!obj || typeof obj !== 'object') return [];

  const entries: Record<string, unknown>[] = [];
  for (const [key, val] of Object.entries(obj)) {
    if (key === 'md5' || !val || typeof val !== 'object') continue;
    entries.push(val as Record<string, unknown>);
  }

  entries.sort((a, b) => {
    const ta = parseWolfxTimeMs(a.time, 'cenc');
    const tb = parseWolfxTimeMs(b.time, 'cenc');
    return tb - ta;
  });

  const cutoff = periodCutoffMs(opts.period, opts.now);
  const items: GlobalEarthquakeEvent[] = [];

  for (const row of entries) {
    const parsed = parseCencWolfxRow(row, opts.homeLat, opts.homeLon);
    if (!parsed) continue;
    if (parsed.originTime < cutoff) continue;
    if (parsed.magnitude < opts.minMagnitude) continue;
    items.push(parsed);
    if (items.length >= opts.limit) break;
  }

  return items;
}

/**
 * 解析单行 WolfX CENC 列表数据为地震事件。
 * 字段映射：magnitude→magnitude, latitude→latitude, longitude→longitude,
 * depth→depth, time→originTime, ReportTime→updatedTime, EventID→id, location→place。
 * @returns 解析失败或数值非法时返回 null
 */
function parseCencWolfxRow(
  row: Record<string, unknown>,
  homeLat?: number | null,
  homeLon?: number | null,
): GlobalEarthquakeEvent | null {
  const magnitude = Number(row.magnitude);
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);
  if (!Number.isFinite(magnitude) || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const originTime = parseWolfxTimeMs(row.time, 'cenc');
  const updatedTime = parseWolfxTimeMs(row.ReportTime ?? row.time, 'cenc');
  const depth = Number(row.depth);
  const eventId = String(row.EventID || '').trim();
  const place = String(row.location ?? row.placeName ?? '未知位置').trim();
  const intensityRaw = row.intensity;
  const intensity =
    intensityRaw != null && String(intensityRaw).trim() !== '' ? Number(intensityRaw) : null;

  let distanceKm: number | null = null;
  if (homeLat != null && homeLon != null && Number.isFinite(homeLat) && Number.isFinite(homeLon)) {
    distanceKm = Math.round(haversineDistanceKm(homeLat, homeLon, latitude, longitude));
  }

  return {
    id: eventId || `${originTime}-${latitude}-${longitude}`,
    magnitude: Math.round(magnitude * 10) / 10,
    magType: 'M',
    place,
    latitude,
    longitude,
    depth: Number.isFinite(depth) ? Math.round(depth * 10) / 10 : 0,
    originTime,
    updatedTime: updatedTime || originTime,
    url: 'https://news.ceic.ac.cn/',
    tsunami: false,
    status: String(row.type || 'reviewed'),
    intensity: Number.isFinite(intensity) ? intensity : null,
    distanceKm,
  };
}

// ── earthquake-global-feed.util ──
/** USGS 地震目录 Feed 基础地址 */
const USGS_FEED_BASE = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary';

/** 各查询窗口对应的 USGS Feed 文件路径（hour/day/week 用全量） */
const PERIOD_PATH: Record<Exclude<GlobalEarthquakePeriod, 'month'>, string> = {
  hour: 'all_hour.geojson',
  day: 'all_day.geojson',
  week: 'all_week.geojson',
};

/**
 * @returns 拼接好的 USGS GeoJSON Feed URL。
 * month 按最低震级选分档 feed（1.0/2.5/4.5），与 CENC「近 30 天」语义对齐，
 * 避免 significant_month（仅显著事件）造成同源筛选项含义不一致。
 */
export function resolveUsgsFeedUrl(
  period: GlobalEarthquakePeriod,
  minMagnitude = 4,
): string {
  if (period === 'month') {
    const mag = Number.isFinite(minMagnitude) ? minMagnitude : 4;
    const tier = mag >= 4.5 ? '4.5' : mag >= 2.5 ? '2.5' : '1.0';
    return `${USGS_FEED_BASE}/${tier}_month.geojson`;
  }
  const path = PERIOD_PATH[period] ?? PERIOD_PATH.day;
  return `${USGS_FEED_BASE}/${path}`;
}

/**
 * 将任意输入归一化为合法的查询窗口，非法值回退为 'day'。
 * @param raw 原始输入
 * @returns 合法的 GlobalEarthquakePeriod
 */
export function normalizeGlobalPeriod(raw: unknown): GlobalEarthquakePeriod {
  const p = String(raw || 'day').toLowerCase();
  if (p === 'hour' || p === 'day' || p === 'week' || p === 'month') return p;
  return 'day';
}

/**
 * 解析 USGS GeoJSON Feed 为地震事件数组。
 * 按最低震级过滤，最多返回 limit 条，并计算家庭距离（如配置坐标）。
 * @param body USGS GeoJSON 响应体
 * @param opts 过滤选项
 * @returns 地震事件数组
 */
export function parseUsgsGeoJson(
  body: unknown,
  opts: { minMagnitude: number; limit: number; homeLat?: number | null; homeLon?: number | null },
): GlobalEarthquakeEvent[] {
  const features = (body as { features?: unknown[] })?.features;
  if (!Array.isArray(features)) return [];

  const items: GlobalEarthquakeEvent[] = [];
  for (const feature of features) {
    const parsed = parseUsgsFeature(feature, opts.homeLat, opts.homeLon);
    if (!parsed) continue;
    if (parsed.magnitude < opts.minMagnitude) continue;
    items.push(parsed);
    if (items.length >= opts.limit) break;
  }
  return items;
}

/**
 * 解析单个 USGS GeoJSON Feature 为地震事件。
 * 字段映射：properties.mag→magnitude, coordinates[0]→longitude, [1]→latitude, [2]→depth,
 * properties.time→originTime, properties.place→place。
 * @returns 解析失败或数值非法时返回 null
 */
function parseUsgsFeature(
  feature: unknown,
  homeLat?: number | null,
  homeLon?: number | null,
): GlobalEarthquakeEvent | null {
  const f = feature as {
    id?: string;
    properties?: Record<string, unknown>;
    geometry?: { coordinates?: number[] };
  };
  const props = f.properties;
  const coords = f.geometry?.coordinates;
  if (!props || !Array.isArray(coords) || coords.length < 2) return null;

  const magnitude = Number(props.mag);
  if (!Number.isFinite(magnitude)) return null;

  const longitude = Number(coords[0]);
  const latitude = Number(coords[1]);
  const depth = Number(coords[2] ?? 0);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const originTime = Number(props.time);
  const updatedTime = Number(props.updated ?? props.time);
  const id = String(f.id || props.code || props.ids || `${originTime}-${latitude}`).trim();

  let distanceKm: number | null = null;
  if (homeLat != null && homeLon != null && Number.isFinite(homeLat) && Number.isFinite(homeLon)) {
    distanceKm = Math.round(haversineDistanceKm(homeLat, homeLon, latitude, longitude));
  }

  return {
    id,
    magnitude: Math.round(magnitude * 10) / 10,
    magType: String(props.magType || 'ml'),
    place: String(props.place || props.title || '未知位置'),
    latitude,
    longitude,
    depth: Number.isFinite(depth) ? Math.round(depth * 10) / 10 : 0,
    originTime: Number.isFinite(originTime) ? originTime : 0,
    updatedTime: Number.isFinite(updatedTime) ? updatedTime : originTime,
    url: String(props.url || ''),
    tsunami: Number(props.tsunami) === 1,
    status: String(props.status || ''),
    intensity: null,
    distanceKm,
  };
}

/**
 * 将任意输入归一化为合法的数据源，非法值回退为 'cenc'。
 * @param raw 原始输入
 * @returns 'usgs' 或 'cenc'
 */
export function normalizeGlobalSource(raw: unknown): GlobalEarthquakeSource {
  const s = String(raw || 'cenc').toLowerCase();
  if (s === 'usgs') return 'usgs';
  return 'cenc';
}

// ── earthquake-wolfx-parse.util ──
/** JMA 源使用 UTC+9，中国区域源使用 UTC+8 */
const JMA_EEW_TYPES = new Set(['jma_eew']);

/** 匹配 `YYYY-MM-DD HH:MM:SS` 或 `YYYY/MM/DD HH:MM:SS` 格式的时间字符串 */
const DATE_TIME_RE = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})[:\s]+(\d{1,2}):(\d{2}):(\d{2})$/;

/** 将多种"真值"表示统一转为布尔值 */
function readBool(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

/**
 * 解析 Wolfx OriginTime / ReportTime 为 UTC 毫秒时间戳。
 *
 * 处理顺序：
 *  1. 数值型：>1e12 视为毫秒，>1e9 视为秒并乘 1000。
 *  2. 日期时间字符串：按 DATE_TIME_RE 匹配，根据来源类型扣除时区偏移（JMA -9h，中国 -8h）。
 *  3. ISO 字符串：直接 Date.parse。
 *  4. 数值字符串：按数值型规则处理。
 *
 * @param value 原始值（数值或字符串）
 * @param type 消息类型（用于判断时区，如 jma_eew）
 * @returns UTC 毫秒时间戳，无法解析返回 0
 */
function parseWolfxTimeMs(value: unknown, type: string): number {
  if (value == null || value === '') return 0;

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 1e12) return Math.round(value);
    if (value > 1e9) return Math.round(value * 1000);
    return 0;
  }

  const str = String(value).trim();
  if (!str) return 0;

  const m = str.match(DATE_TIME_RE);
  if (m) {
    const [, y, mo, d, h, mi, s] = m;
    const offsetHours = JMA_EEW_TYPES.has(String(type).toLowerCase()) ? 9 : 8;
    return Date.UTC(+y, +mo - 1, +d, +h - offsetHours, +mi, +s);
  }

  const iso = Date.parse(str);
  if (Number.isFinite(iso)) return iso;

  const num = Number(str);
  if (!Number.isFinite(num)) return 0;
  if (num > 1e12) return Math.round(num);
  if (num > 1e9) return Math.round(num * 1000);
  return 0;
}

/**
 * 判断 WolfX 消息是否为取消报（isCancel / IsCancel / cancel / Issue.Status 含 cancel）。
 * 取消报表示该事件已撤销，不应触发预警。
 * @returns 是否为取消报
 */
export function isWolfxCancelled(msg: Record<string, unknown>): boolean {
  return (
    readBool(msg.isCancel) ||
    readBool(msg.IsCancel) ||
    readBool(msg.cancel) ||
    String(msg['Issue.Status'] ?? '')
      .toLowerCase()
      .includes('cancel')
  );
}

/**
 * 判断 WolfX 消息是否为训练/演练报（isTraining / IsTraining / isDrill /
 * Issue.Status 含 training/train/试验/训练/演练）。
 * 训练报不应触发真实预警。
 * @returns 是否为训练报
 */
function isWolfxTraining(msg: Record<string, unknown>): boolean {
  if (readBool(msg.isTraining) || readBool(msg.IsTraining) || readBool(msg.isDrill)) {
    return true;
  }
  const status = String(msg['Issue.Status'] ?? msg.issueStatus ?? msg.CodeType ?? '').toLowerCase();
  return (
    status.includes('training') ||
    status.includes('train') ||
    status.includes('试验') ||
    status.includes('训练') ||
    status.includes('演练')
  );
}

/** 安全数值转换，非有限数返回 0 */
function readNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 从消息中提取震中地点描述（兼容多种字段名）。
 * @returns 震中字符串，缺失时返回 '未知震中'
 */
function readEpicenter(msg: Record<string, unknown>): string {
  const raw =
    msg.epicenter ??
    msg.Epicenter ??
    msg.HypoCenter ??
    msg.hypoCenter ??
    msg.location ??
    msg.region ??
    msg.Title;
  const text = raw != null ? String(raw).trim() : '';
  return text || '未知震中';
}

/** 从消息中提取最大烈度字符串，缺失时返回 undefined */
function readMaxIntensity(msg: Record<string, unknown>): string | undefined {
  const raw = msg.maxIntensity ?? msg.MaxIntensity ?? msg.intensity;
  if (raw == null || raw === '') return undefined;
  return String(raw);
}

/**
 * 将 Wolfx WebSocket JSON 转为内部 EewRawMessage。
 *
 * 处理流程：
 *  1. 跳过 heartbeat / pong 心跳消息。
 *  2. 提取 eventId，缺失则返回 null。
 *  3. 过滤取消报与训练报（返回 null）。
 *  4. 解析 originTime / latitude / longitude / magnitude / depth / epicenter / maxIntensity。
 *  5. 校验经纬度范围（-90~90, -180~180）与震级正值。
 *
 * @param msg WolfX WebSocket 原始 JSON 消息
 * @returns 解析后的 EewRawMessage，无法解析时返回 null
 */
export function parseWolfxMessage(msg: Record<string, unknown>): EewRawMessage | null {
  const type = String(msg.type ?? 'eew');
  const typeLower = type.toLowerCase();

  if (typeLower === 'heartbeat' || typeLower === 'pong') return null;

  const eventId = String(msg.eventId ?? msg.event_id ?? msg.EventID ?? '').trim();
  if (!eventId) return null;

  if (isWolfxCancelled(msg) || isWolfxTraining(msg)) {
    return null;
  }

  const originTime = parseWolfxTimeMs(
    msg.originTime ?? msg.origin_time ?? msg.OriginTime,
    typeLower,
  );
  const latitude = readNumber(
    msg.latitude ?? msg.Latitude ?? (msg.hypocenter as { latitude?: number })?.latitude,
  );
  const longitude = readNumber(
    msg.longitude ?? msg.Longitude ?? (msg.hypocenter as { longitude?: number })?.longitude,
  );
  const magnitude = readNumber(msg.magnitude ?? msg.Magnitude ?? msg.mag ?? msg.Magunitude);
  const depthRaw = msg.depth ?? msg.Depth ?? (msg.hypocenter as { depth?: number })?.depth;
  const depth = depthRaw == null ? 0 : readNumber(depthRaw);

  if (!Number.isFinite(originTime) || originTime <= 0) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  if (magnitude <= 0) return null;

  return {
    type,
    eventId,
    reportId: readNumber(msg.reportId ?? msg.report_id ?? msg.ReportNum ?? msg.Serial),
    originTime,
    latitude,
    longitude,
    magnitude,
    depth,
    epicenter: readEpicenter(msg),
    maxIntensity: readMaxIntensity(msg),
    source: inferWolfxSource(typeLower),
  };
}

function inferWolfxSource(typeLower: string): string {
  if (typeLower.includes('cenc')) return 'cenc_eew';
  if (typeLower.includes('sc_') || typeLower === 'sc_eew' || typeLower.includes('sichuan'))
    return 'sc_eew';
  if (typeLower.includes('usgs')) return 'usgs';
  return 'wolfx';
}

/** Wolfx SC / CENC EEW HTTP JSON → EewRawMessage */
export function parseWolfxEewHttpJson(
  body: unknown,
  source: 'sc_eew' | 'cenc_eew',
): EewRawMessage | null {
  if (!body || typeof body !== 'object') return null;
  const msg = body as Record<string, unknown>;
  // 空对象或无有效震级时视为无最新报
  if (Object.keys(msg).length === 0) return null;
  const withType = {
    ...msg,
    type: String(msg.type || source),
  };
  const parsed = parseWolfxMessage(withType);
  if (!parsed) return null;
  return { ...parsed, source, type: source };
}

/** USGS GeoJSON feature → EewRawMessage（兜底） */
export function parseUsgsFeatureAsEew(feature: unknown): EewRawMessage | null {
  const f = feature as {
    id?: string;
    properties?: Record<string, unknown>;
    geometry?: { coordinates?: number[] };
  };
  const props = f.properties;
  const coords = f.geometry?.coordinates;
  if (!props || !Array.isArray(coords) || coords.length < 2) return null;

  const magnitude = Number(props.mag);
  const longitude = Number(coords[0]);
  const latitude = Number(coords[1]);
  const depth = Number(coords[2] ?? 0);
  const originTime = Number(props.time);
  if (!Number.isFinite(magnitude) || magnitude <= 0) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (!Number.isFinite(originTime) || originTime <= 0) return null;

  const id = String(f.id || props.code || `${originTime}-${latitude}`).trim();
  if (!id) return null;

  return {
    type: 'usgs',
    source: 'usgs',
    eventId: `usgs_${id}`,
    originTime,
    latitude,
    longitude,
    magnitude: Math.round(magnitude * 10) / 10,
    depth: Number.isFinite(depth) ? Math.round(depth * 10) / 10 : 0,
    epicenter: String(props.place || props.title || '未知震中'),
  };
}

/**
 * 校验家庭坐标是否合法（非 null、有限数、经纬度范围内）。
 * @param lat 纬度 latitude
 * @param lon 经度 longitude
 * @returns 是否合法
 */
export function isValidHomeCoordinate(lat: number | null, lon: number | null): boolean {
  if (lat == null || lon == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}
