/**
 * 地震预警状态管理工具集。
 *
 * 合并自：earthquake-state-redis.util.ts、earthquake-state-persist.util.ts、
 * earthquake-runtime-config.util.ts、earthquake-notify.util.ts
 *
 * 职责：
 *  - Redis 状态：最新预警、历史列表、已关闭事件、WolfX 主节点活跃标记。
 *  - Prisma 持久化：预警历史写入与读取（PostgreSQL）。
 *  - 运行时配置：从项目 layout 解析 EEW 阈值与家庭坐标。
 *  - 通知格式化：EEW 预警消息、目录通知消息、通知级别判定。
 *
 * 依赖：PrismaService、RedisService、AlertLevel、earthquake-feeds.util、@homeos/shared。
 */
import type { PrismaService } from '../../shared/prisma/service';
import type { RedisService } from '../../shared/redis/service';
import type { AlertLevel } from '../notification/service';
import type { GlobalEarthquakeEvent } from './global.types';
import { isValidHomeCoordinate } from './feeds.util';
import type { EarthquakeAlertPayload, EarthquakeRuntimeConfig } from './types';
import type { EewDedupeState } from './eew-eval.util';
import { isEewSimulationEventId, normalizeEewCountdownLead } from '@homeos/shared';
import { formatTimeOnly } from '../../common/utils/push-time.util';
import { evaluateLocalQuakeThresholds } from './threshold.util';

/** 是否为模拟演练历史（source=test 或 eventId 以 test_ 开头） */
export function isSimulationAlertRecord(input: {
  eventId?: string | null;
  source?: string | null;
}): boolean {
  if (String(input.source || '').trim() === 'test') return true;
  return isEewSimulationEventId(input.eventId);
}

// ── earthquake-state-redis.util ──
/** EEW Redis 键名常量 */
const EEW_REDIS = {
  /** 最新预警键 */
  latest: 'homeos:eew:latest',
  /** 历史列表键（Redis List） */
  history: 'homeos:eew:history',
  /** 已关闭事件键前缀，拼接 eventId */
  dismissedPrefix: 'homeos:eew:dismissed:',
  /** WolfX 主节点活跃标记键 */
  wolfxActive: 'homeos:eew:wolfx-active',
  /** EEW 去重状态键（activeEventId + lastMagnitude + updatedAt） */
  dedupe: 'homeos:eew:dedupe',
} as const;

/** 最新预警 TTL（秒），5 分钟过期 */
const LATEST_TTL_SEC = 300;
/** 已关闭事件 TTL（秒），1 小时过期 */
const DISMISSED_TTL_SEC = 3600;
/** 去重状态 TTL（秒），与原内存 90s 清空窗口对齐并稍长，覆盖 Leader 故障转移后的 WolfX 重放窗口 */
const DEDUPE_TTL_SEC = 120;
/** WolfX 主节点活跃标记 TTL（秒），30 秒过期 */
const WOLFX_ACTIVE_TTL_SEC = 30;
/** Redis 历史列表最大保留条数 */
const EEW_REDIS_HISTORY_MAX = 50;
/** Redis 历史列表 TTL（秒），30 天过期 */
const HISTORY_TTL_SEC = 86400 * 30;

interface LatestStored {
  payload: EarthquakeAlertPayload;
  savedAt: number;
}

/**
 * 将最新预警写入 Redis（latest 键 + 历史列表）。
 * @param redis Redis 服务
 * @param payload 预警载荷
 */
export async function saveLatestAlertRedis(
  redis: RedisService,
  payload: EarthquakeAlertPayload,
): Promise<void> {
  if (!redis.isReady()) return;
  const data: LatestStored = { payload, savedAt: Date.now() };
  await redis.set(EEW_REDIS.latest, JSON.stringify(data), LATEST_TTL_SEC);
  await appendAlertHistoryRedis(redis, payload);
}

/**
 * 将预警追加到 Redis 历史列表（LPUSH + LTRIM 保留最近 N 条）。
 * @param redis Redis 服务
 * @param payload 预警载荷
 */
async function appendAlertHistoryRedis(
  redis: RedisService,
  payload: EarthquakeAlertPayload,
): Promise<void> {
  const client = redis.getClient();
  if (!client) return;
  const entry: LatestStored = { payload, savedAt: Date.now() };
  await client.lpush(EEW_REDIS.history, JSON.stringify(entry));
  await client.ltrim(EEW_REDIS.history, 0, EEW_REDIS_HISTORY_MAX - 1);
  await client.expire(EEW_REDIS.history, HISTORY_TTL_SEC);
}

/**
 * 从 Redis 历史列表读取最近 N 条预警。
 * @param redis Redis 服务
 * @param limit 最多返回条数，默认 30
 * @returns 预警记录数组（含 payload 与 savedAt）
 */
export async function loadAlertHistoryRedis(
  redis: RedisService,
  limit = 30,
): Promise<LatestStored[]> {
  const client = redis.getClient();
  if (!client) return [];
  const raw = await client.lrange(EEW_REDIS.history, 0, Math.max(0, limit - 1));
  const out: LatestStored[] = [];
  for (const row of raw) {
    try {
      const parsed = JSON.parse(row) as LatestStored;
      if (parsed?.payload?.eventId) out.push(parsed);
    } catch {
      /* 跳过 */
    }
  }
  return out;
}

/**
 * 从 Redis 历史中删除模拟演练记录。
 * @param eventId 指定事件；省略则清除全部演练记录
 * @returns 删除条数
 */
export async function deleteSimulationHistoryRedis(
  redis: RedisService,
  eventId?: string,
): Promise<number> {
  const client = redis.getClient();
  if (!client) return 0;
  const raw = await client.lrange(EEW_REDIS.history, 0, -1);
  if (!raw.length) return 0;

  const keep: string[] = [];
  let removed = 0;
  const targetId = eventId?.trim() || '';
  for (const row of raw) {
    try {
      const parsed = JSON.parse(row) as LatestStored;
      const payload = parsed?.payload;
      if (!payload?.eventId) {
        keep.push(row);
        continue;
      }
      const isSim = isSimulationAlertRecord(payload);
      const match = targetId ? payload.eventId === targetId && isSim : isSim;
      if (match) {
        removed += 1;
        continue;
      }
      keep.push(row);
    } catch {
      keep.push(row);
    }
  }

  if (!removed) return 0;
  await client.del(EEW_REDIS.history);
  if (keep.length) {
    // lrange 返回的是从左到右（新→旧），需按原顺序 LPUSH 回去：先压入最旧
    for (const row of keep.slice().reverse()) {
      await client.lpush(EEW_REDIS.history, row);
    }
    await client.expire(EEW_REDIS.history, HISTORY_TTL_SEC);
  }
  return removed;
}

/**
 * 从 PostgreSQL 删除模拟演练历史。
 * @param eventId 指定事件；省略则清除全部演练记录
 */
export async function deleteSimulationHistoryPrisma(
  prisma: PrismaService,
  eventId?: string,
): Promise<number> {
  const targetId = eventId?.trim() || '';
  if (targetId) {
    if (!isEewSimulationEventId(targetId)) return 0;
    const result = await prisma.earthquakeAlertHistory.deleteMany({
      where: { eventId: targetId },
    });
    return result.count;
  }

  const result = await prisma.earthquakeAlertHistory.deleteMany({
    where: {
      OR: [{ source: 'test' }, { eventId: { startsWith: 'test_' } }],
    },
  });
  return result.count;
}

/**
 * 从 Redis 读取最新预警。
 * @returns 预警记录，不存在或格式非法时返回 null
 */
export async function loadLatestAlertRedis(redis: RedisService): Promise<LatestStored | null> {
  if (!redis.isReady()) return null;
  const raw = await redis.get(EEW_REDIS.latest);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LatestStored;
    if (!parsed?.payload?.eventId) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * 判断指定事件是否已被用户关闭（dismissed）。
 * @returns true 表示已关闭，不应再次推送
 */
export async function isEventDismissedRedis(
  redis: RedisService,
  eventId: string,
): Promise<boolean> {
  if (!redis.isReady() || !eventId) return false;
  const val = await redis.get(`${EEW_REDIS.dismissedPrefix}${eventId}`);
  return val === '1';
}

/**
 * 标记事件为已关闭（设置 TTL 1 小时）。
 * @param redis Redis 服务
 * @param eventId 事件 ID
 */
export async function markEventDismissedRedis(redis: RedisService, eventId: string): Promise<void> {
  if (!redis.isReady() || !eventId) return;
  await redis.set(`${EEW_REDIS.dismissedPrefix}${eventId}`, '1', DISMISSED_TTL_SEC);
}

/**
 * 清除 Redis 中的最新预警（仅当 eventId 匹配时才清除，避免误删新事件）。
 * @param redis Redis 服务
 * @param eventId 需清除的事件 ID
 */
export async function clearLatestAlertRedis(redis: RedisService, eventId: string): Promise<void> {
  if (!redis.isReady()) return;
  const stored = await loadLatestAlertRedis(redis);
  if (stored?.payload?.eventId === eventId) {
    const client = redis.getClient();
    if (client) await client.del(EEW_REDIS.latest);
  }
}

/**
 * 刷新 WolfX 主节点活跃标记（TTL 30 秒，主节点定期调用）。
 * @param redis Redis 服务
 */
export async function touchWolfxLeaderActive(redis: RedisService): Promise<void> {
  if (!redis.isReady()) return;
  await redis.set(EEW_REDIS.wolfxActive, String(Date.now()), WOLFX_ACTIVE_TTL_SEC);
}

/**
 * 判断集群中是否有 WolfX 主节点活跃（检查活跃标记是否存在）。
 * 从节点据此判断集群是否已连接 WolfX。
 * @returns true 表示有主节点活跃
 */
export async function isWolfxClusterActive(redis: RedisService): Promise<boolean> {
  if (!redis.isReady()) return false;
  const val = await redis.get(EEW_REDIS.wolfxActive);
  return val != null && val !== '';
}

/**
 * 去重状态写入 Lua 脚本：时间戳保护，防止旧实例覆盖新实例状态。
 * 仅当现有记录的 updatedAt 不晚于本次写入时覆盖，否则返回 0 保持原值。
 */
const DEDUPE_SET_SCRIPT = `
local existing = redis.call("get", KEYS[1])
if existing then
  local ok, parsed = pcall(cjson.decode, existing)
  if ok and type(parsed) == "table" and parsed.updatedAt and parsed.updatedAt > tonumber(ARGV[2]) then
    return 0
  end
end
redis.call("set", KEYS[1], ARGV[1], "ex", tonumber(ARGV[3]))
return 1
`;

/**
 * 从 Redis 读取去重状态（activeEventId + lastMagnitude）。
 * Leader 故障转移后，新 Leader 据此识别同一事件，避免重放触发重复预警。
 * @param redis Redis 服务
 * @returns 去重状态，不存在或格式非法时返回 null
 */
export async function loadDedupeStateRedis(redis: RedisService): Promise<EewDedupeState | null> {
  if (!redis.isReady()) return null;
  const raw = await redis.get(EEW_REDIS.dedupe);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as EewDedupeState & { updatedAt?: number };
    if (typeof parsed?.activeEventId !== 'string' || parsed.activeEventId === '') return null;
    const lastMagnitude = Number(parsed.lastMagnitude);
    const recent = Array.isArray(parsed.recent)
      ? parsed.recent.filter(
          (r) =>
            r &&
            typeof r.eventId === 'string' &&
            Number.isFinite(r.originTime) &&
            Number.isFinite(r.latitude) &&
            Number.isFinite(r.longitude) &&
            Number.isFinite(r.magnitude),
        )
      : undefined;
    return {
      activeEventId: parsed.activeEventId,
      lastMagnitude: Number.isFinite(lastMagnitude) ? lastMagnitude : 0,
      ...(recent?.length ? { recent } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * 将去重状态写入 Redis（TTL 过期 + 时间戳保护）。
 * 通过 Lua 原子比较 updatedAt，仅当现有记录不更新时才覆盖，
 * 防止故障转移后旧 Leader 的过期状态覆盖新 Leader 的最新状态。
 * @param redis Redis 服务
 * @param state 去重状态
 * @param updatedAt 状态更新时间戳（毫秒），默认当前时间
 */
export async function saveDedupeStateRedis(
  redis: RedisService,
  state: EewDedupeState,
  updatedAt = Date.now(),
): Promise<void> {
  const client = redis.getClient();
  if (!client) return;
  const value = JSON.stringify({ ...state, updatedAt });
  await client.eval(
    DEDUPE_SET_SCRIPT,
    1,
    EEW_REDIS.dedupe,
    value,
    String(updatedAt),
    String(DEDUPE_TTL_SEC),
  );
}

/**
 * 清除 Redis 中的去重状态（仅当 activeEventId 匹配时清除，避免误删新事件）。
 * @param redis Redis 服务
 * @param eventId 需清除的事件 ID
 */
export async function clearDedupeStateRedis(redis: RedisService, eventId: string): Promise<void> {
  if (!redis.isReady() || !eventId) return;
  const state = await loadDedupeStateRedis(redis);
  if (state?.activeEventId === eventId) {
    const client = redis.getClient();
    if (client) await client.del(EEW_REDIS.dedupe);
  }
}

// ── earthquake-state-persist.util ──
/** Prisma 历史最大保留条数（超出后删除最旧记录） */
const EEW_PRISMA_HISTORY_MAX = 200;

/**
 * 将预警写入 PostgreSQL 历史表，并清理超出上限的旧记录。
 * @param prisma Prisma 服务
 * @param payload 预警载荷
 */
export async function appendAlertHistoryPrisma(
  prisma: PrismaService,
  payload: EarthquakeAlertPayload,
): Promise<void> {
  await prisma.earthquakeAlertHistory.create({
    data: {
      eventId: payload.eventId,
      epicenter: payload.epicenter,
      magnitude: payload.magnitude,
      depth: payload.depth,
      latitude: payload.latitude,
      longitude: payload.longitude,
      originTime: BigInt(payload.originTime),
      distance: payload.distance,
      countdown: payload.countdown,
      localIntensity: payload.localIntensity,
      maxIntensity: payload.maxIntensity ?? null,
      alertKind: payload.alertKind ?? null,
      source: payload.source ? String(payload.source) : null,
    },
  });

  const overflow = await prisma.earthquakeAlertHistory.findMany({
    orderBy: { savedAt: 'desc' },
    skip: EEW_PRISMA_HISTORY_MAX,
    select: { id: true },
    // 单次清理上限：极端积压时分多轮收敛，避免一次拉取/删除过多行
    take: 500,
  });
  if (overflow.length > 0) {
    await prisma.earthquakeAlertHistory.deleteMany({
      where: { id: { in: overflow.map((row) => row.id) } },
    });
  }
}

/**
 * 从 PostgreSQL 读取最近 N 条预警历史。
 * @param prisma Prisma 服务
 * @param limit 最多返回条数，默认 50（上限 200）
 * @returns 预警载荷数组（含 savedAt 时间戳）
 */
export async function loadAlertHistoryPrisma(
  prisma: PrismaService,
  limit = 50,
): Promise<Array<EarthquakeAlertPayload & { savedAt: number }>> {
  const rows = await prisma.earthquakeAlertHistory.findMany({
    orderBy: { savedAt: 'desc' },
    take: Math.max(1, Math.min(limit, 200)),
  });
  return rows.map((row) => ({
    eventId: row.eventId,
    epicenter: row.epicenter,
    magnitude: row.magnitude,
    depth: row.depth,
    latitude: row.latitude,
    longitude: row.longitude,
    originTime: Number(row.originTime),
    distance: row.distance,
    countdown: row.countdown,
    localIntensity: row.localIntensity,
    maxIntensity: row.maxIntensity ?? undefined,
    alertKind: (row.alertKind as EarthquakeAlertPayload['alertKind']) ?? undefined,
    source: row.source ?? undefined,
    savedAt: row.savedAt.getTime(),
  }));
}

// ── earthquake-runtime-config.util ──
/**
 * 从项目 layout 解析 EEW 运行时配置。
 *
 * 解析顺序：
 *  1. 优先读取 layout.earthquakeConfig 嵌套配置，回退到 layout 顶层字段。
 *  2. 家庭坐标：latitude/longitude，校验合法性（isValidHomeCoordinate）。
 *  3. 阈值：maxDistance（默认 500km）、minMagnitude（默认 3）、minLocalIntensity（默认 2）。
 *  4. countdownLeadSec：经 normalizeEewCountdownLead 归一化。
 *
 * @param layout 项目布局配置
 * @returns EEW 运行时配置
 */
export function parseEarthquakeLayout(layout: Record<string, unknown>): EarthquakeRuntimeConfig {
  const nested = layout.earthquakeConfig as Record<string, unknown> | undefined;
  const enabled = nested?.enabled === true;

  const latRaw = nested?.latitude ?? layout.latitude;
  const lonRaw = nested?.longitude ?? layout.longitude;

  const homeLatRaw = latRaw != null && String(latRaw).trim() !== '' ? Number(latRaw) : null;
  const homeLonRaw = lonRaw != null && String(lonRaw).trim() !== '' ? Number(lonRaw) : null;
  const homeLat = isValidHomeCoordinate(homeLatRaw, homeLonRaw) ? homeLatRaw : null;
  const homeLon = isValidHomeCoordinate(homeLatRaw, homeLonRaw) ? homeLonRaw : null;

  const maxDistance = Number(nested?.maxDistance ?? layout.eewMaxDistance ?? 500);
  const minMagnitude = Number(nested?.minMagnitude ?? layout.eewMinMagnitude ?? 3);
  const minLocalIntensity = Number(nested?.minLocalIntensity ?? layout.eewMinLocalIntensity ?? 2);
  const countdownLeadSec = normalizeEewCountdownLead(
    nested?.countdownLeadSec ?? layout.eewCountdownLeadSec,
  );

  return {
    enabled,
    homeLat,
    homeLon,
    maxDistance: Number.isFinite(maxDistance) ? maxDistance : 500,
    minMagnitude: Number.isFinite(minMagnitude) ? minMagnitude : 3,
    minLocalIntensity: Number.isFinite(minLocalIntensity) ? minLocalIntensity : 2,
    countdownLeadSec,
  };
}

// ── earthquake-notify.util ──
/**
 * 格式化 EEW 预警 / 官方速报通知消息（面向用户）。
 *
 * 预警与速报解耦：
 * - `confirmation`（台网迟到正式测定）→「地震速报（官方正式测定·非预警）」，避免与实时预警混淆；
 * - 其余为实时预警 →「地震预警」，保留横波倒计时。
 * 两者均展示实际发震时刻（HH:mm:ss，Asia/Shanghai），与推送时间戳双重对照。
 *
 * @param payload 预警载荷
 * @returns 通知文案字符串
 */
export function formatEewNotifyMessage(payload: EarthquakeAlertPayload): string {
  const mag = Number(payload.magnitude);
  const magText = Number.isFinite(mag) ? mag.toFixed(1) : '?';
  const place = payload.epicenter || '未知震中';
  const distance = payload.distance != null ? `${payload.distance} km` : '—';
  const intensity = payload.localIntensity != null ? `${payload.localIntensity} 度` : '—';
  // 实际发震时刻：与推送时间双重对照，明确震源发生时间；缺失时展示 '—' 而非当前时刻
  const origin = formatTimeOnly(payload.originTime, '—');
  if (payload.alertKind === 'confirmation') {
    return `🌍 地震速报（官方正式测定·非预警）：发震时间 ${origin}，${place} M${magText}，距您 ${distance}，预估烈度 ${intensity}`;
  }
  const countdown = payload.countdown != null ? `${payload.countdown}s` : '—';
  return `🌍 地震预警：发震时间 ${origin}，${place} M${magText}，距您 ${distance}，横波约 ${countdown} 后到达，预估烈度 ${intensity}`;
}

/**
 * 格式化地震目录新增事件通知消息（面向用户）。
 *
 * 目录事件来自台网正式测定（非实时预警），统一标注为「地震速报（官方正式测定·非预警）」，
 * 并展示实际发震时刻（HH:mm:ss）。
 *
 * @param item 地震事件
 * @returns 通知文案字符串
 */
export function formatCatalogNotifyMessage(item: GlobalEarthquakeEvent): string {
  const mag = Number(item.magnitude);
  const magText = Number.isFinite(mag) ? mag.toFixed(1) : '?';
  const place = item.place || '未知位置';
  const depth = item.depth != null ? `${item.depth} km` : '—';
  const distance = item.distanceKm != null ? `，距家 ${item.distanceKm} km` : '';
  const intensity = item.intensity != null ? `，烈度 ${item.intensity}` : '';
  const origin = formatTimeOnly(item.originTime, '—');
  return `🌍 地震速报（官方正式测定·非预警）：发震时间 ${origin}，${place} M${magText}，深度 ${depth}${distance}${intensity}`;
}

/**
 * 根据震级、烈度、距离判定目录通知级别。
 * - danger：震级 >= 6 或烈度 >= 7
 * - warn：震级 >= 4.5 或烈度 >= 5 或距家 <= 200km
 * - info：其他
 * @param item 地震事件
 * @returns 通知级别
 */
export function resolveCatalogNotifyLevel(item: GlobalEarthquakeEvent): AlertLevel {
  const mag = Number(item.magnitude);
  const intensity = Number(item.intensity);
  if ((Number.isFinite(mag) && mag >= 6) || (Number.isFinite(intensity) && intensity >= 7)) {
    return 'danger';
  }
  if (
    (Number.isFinite(mag) && mag >= 4.5) ||
    (Number.isFinite(intensity) && intensity >= 5) ||
    (item.distanceKm != null && item.distanceKm <= 200)
  ) {
    return 'warn';
  }
  return 'info';
}

/**
 * 判断目录事件是否应触发通知 / 记入本地预警。
 *
 * - `aligned`（已启用 EEW）：与 EEW 相同，震级 ∧ 距离 ∧ 预估本地烈度。
 * - `catalog_only`（未启用 EEW）：仅震级 + 可选距离宽松规则（远距 M≥5 仍通知）。
 */
export function shouldNotifyCatalogEvent(
  item: GlobalEarthquakeEvent,
  opts:
    | {
        mode: 'aligned';
        minMagnitude: number;
        maxDistanceKm: number;
        minLocalIntensity: number;
        homeLat: number;
        homeLon: number;
      }
    | {
        mode: 'catalog_only';
        minMagnitude: number;
        maxDistanceKm: number | null;
        homeConfigured: boolean;
      },
): boolean {
  if (opts.mode === 'aligned') {
    return evaluateLocalQuakeThresholds(
      {
        magnitude: item.magnitude,
        latitude: item.latitude,
        longitude: item.longitude,
        distanceKm: item.distanceKm,
      },
      {
        minMagnitude: opts.minMagnitude,
        maxDistanceKm: opts.maxDistanceKm,
        minLocalIntensity: opts.minLocalIntensity,
        homeLat: opts.homeLat,
        homeLon: opts.homeLon,
      },
    ).pass;
  }

  const mag = Number(item.magnitude);
  if (!Number.isFinite(mag) || mag < opts.minMagnitude) return false;

  if (!opts.homeConfigured || opts.maxDistanceKm == null) return true;

  if (item.distanceKm == null) return mag >= 4.5;
  if (item.distanceKm <= opts.maxDistanceKm) return true;
  return mag >= 5;
}
