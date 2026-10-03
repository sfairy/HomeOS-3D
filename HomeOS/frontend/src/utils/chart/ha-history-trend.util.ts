/**
 * 将 HA Recorder `/ha/history` 响应解析为能量趋势点
 *
 * 所属模块：图表 / HA 历史解析
 * 职责：将 HA Recorder 返回的多序列历史数据扁平化为统一的趋势点数组；
 *   对稠密历史做等步长降采样，避免图表渲染过载。
 * 依赖：无外部依赖，纯函数。
 */

/** HA 历史趋势点（时间戳 + 数值 + ISO 时间字符串） */
type HaHistoryTrendPoint = { time: string; value: number; ts: number }

/**
 * 解析 HA Recorder `/ha/history` 响应为趋势点数组。
 *
 * @param payload HA 历史响应（外层数组，每个元素为某实体的状态序列）
 * @param entityId 目标实体 id；非空时用于过滤序列（entity_id 不匹配则跳过）
 * @returns 按 ts 升序排列的趋势点数组；过滤掉 last_changed / state 非法的条目
 */
export function parseHaHistoryTrendPoints(
  payload: unknown,
  entityId: string,
): HaHistoryTrendPoint[] {
  const rows = Array.isArray(payload) ? payload : []
  const points: HaHistoryTrendPoint[] = []

  for (const series of rows) {
    if (!Array.isArray(series) || !series.length) continue
    const first = series[0] as { entity_id?: string }
    const id = String(first?.entity_id || '')
    if (id && entityId && id !== entityId) continue

    for (const raw of series) {
      const item = raw as { last_changed?: string; state?: string; entity_id?: string }
      const ts = item.last_changed ? new Date(item.last_changed).getTime() : NaN
      const value = parseFloat(String(item.state ?? ''))
      if (!Number.isFinite(ts) || !Number.isFinite(value)) continue
      points.push({ time: new Date(ts).toISOString(), value, ts })
    }
  }

  points.sort((a, b) => a.ts - b.ts)
  return points
}

/**
 * 对稠密 HA 历史做降采样，避免图表过载。
 * 算法：等步长抽样（步长 = ceil(点数 / maxPoints)），并强制保留最后一个点以保证末尾精度。
 *
 * @param points 待降采样的点数组（需已按 ts 升序）
 * @param maxPoints 降采样后最大点数（默认 180）
 * @returns 降采样后的点数组；点数不超过 maxPoints 时原样返回
 */
export function downsampleTrendPoints<T extends { ts?: number; time?: string }>(
  points: T[],
  maxPoints = 180,
): T[] {
  if (points.length <= maxPoints) return points
  const step = Math.ceil(points.length / maxPoints)
  const out: T[] = []
  for (let i = 0; i < points.length; i += step) out.push(points[i]!)
  const last = points[points.length - 1]!
  if (out[out.length - 1] !== last) out.push(last)
  return out
}