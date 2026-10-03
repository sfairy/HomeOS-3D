/**
 * 能源功率趋势数据源：优先 Redis 时间线，失败/为空则降级到 HA Recorder 历史。
 * Life 总览与能源分析 Widget 共用，消除重复的 try/catch 降级流程。
 *
 * 所属模块：能源 / 趋势数据源
 * 职责：统一封装功率趋势的拉取与降级逻辑——主源（Redis 时间线）不可用时回退 HA 历史；
 *   归一化不同响应形态（裸数组 vs { points, meta }）；对稠密历史做降采样。
 * 依赖：energy API、entities API（HA 历史）、ha-history-trend.util（解析 + 降采样）。
 */
import { getEnergyTrend } from '@/services/api/energy'
import { fetchHaHistory } from '@/services/api/entities'
import {
  downsampleTrendPoints,
  parseHaHistoryTrendPoints,
} from '@/utils/chart/ha-history-trend.util'

/** 能源趋势点最小形状（兼容 Redis / HA 历史多种字段命名） */
interface EnergyTrendPoint {
  value?: number | string
  state?: number | string
  ts?: number | string
  time?: string
  timestamp?: number | string
  [key: string]: unknown
}

/** 能源趋势拉取结果（含降级标记） */
interface EnergyTrendResult {
  points: EnergyTrendPoint[]
  /** Redis 时间线不可用或为空，已尝试回退 HA 历史 */
  redisDegraded: boolean
  /** 当前展示的数据来自 HA Recorder 历史 */
  usingHaHistory: boolean
}

/** HA 历史拉取的最大小时数上限（避免单次请求过重） */
const HA_MAX_HOURS = 168

/**
 * 拉取并解析 HA Recorder 历史为趋势点（含降采样）。
 *
 * @param entityId 实体 id
 * @param hours 拉取时长（小时），会被夹取到 [1, 168]
 * @returns 降采样后的趋势点数组
 */
async function loadHaHistoryTrendPoints(
  entityId: string,
  hours: number,
): Promise<EnergyTrendPoint[]> {
  const haHours = Math.min(Math.max(hours, 1), HA_MAX_HOURS)
  const res = await fetchHaHistory(entityId, haHours)
  return downsampleTrendPoints(parseHaHistoryTrendPoints(res.data, entityId))
}

/**
 * 归一化 `/energy/trend` 响应（兼容裸数组与 { points, meta } 两种形态）。
 *
 * @param data 原始响应数据
 * @returns { points, redisDegraded }；redisDegraded 为 true 表示 meta.redisReady === false
 */
function normalizeEnergyTrendPayload(data: unknown): {
  points: EnergyTrendPoint[]
  redisDegraded: boolean
} {
  const raw = data as { points?: unknown; meta?: { redisReady?: boolean } } | null
  const hasWrapper =
    raw !== null && typeof raw === 'object' && 'points' in raw && raw.points != null
  const payload = hasWrapper
    ? (raw as { points?: unknown; meta?: { redisReady?: boolean } })
    : { points: data, meta: {} as { redisReady?: boolean } }
  const redisDegraded = payload.meta?.redisReady === false
  const points = Array.isArray(payload.points) ? (payload.points as EnergyTrendPoint[]) : []
  return { points, redisDegraded }
}

/**
 * 获取功率趋势，主源为空则回退 HA 历史。
 * @param options.isPrimaryUsable 判定主源数据是否可用（默认为「有任意点」）；
 *   能源分析 Widget 需要「存在正值样本」，可自定义此断言。
 */
export async function loadEnergyTrendWithFallback(
  entityId: string,
  hours: number,
  options: { isPrimaryUsable?: (points: EnergyTrendPoint[]) => boolean } = {},
): Promise<EnergyTrendResult> {
  const isPrimaryUsable = options.isPrimaryUsable ?? ((points) => points.length > 0)
  let redisDegraded = false
  let usingHaHistory = false
  let points: EnergyTrendPoint[] = []

  try {
    const trendRes = await getEnergyTrend(entityId, hours)
    const normalized = normalizeEnergyTrendPayload(trendRes.data)
    redisDegraded = normalized.redisDegraded
    points = normalized.points
    if (!isPrimaryUsable(points)) {
      const haPoints = await loadHaHistoryTrendPoints(entityId, hours).catch(
        () => [] as EnergyTrendPoint[],
      )
      if (isPrimaryUsable(haPoints)) {
        points = haPoints
        usingHaHistory = true
        redisDegraded = true
      } else if (!points.length) {
        points = haPoints
      }
    }
  } catch {
    const haPoints = await loadHaHistoryTrendPoints(entityId, hours).catch(
      () => [] as EnergyTrendPoint[],
    )
    redisDegraded = true
    points = haPoints
    usingHaHistory = isPrimaryUsable(haPoints)
  }

  return { points, redisDegraded, usingHaHistory }
}