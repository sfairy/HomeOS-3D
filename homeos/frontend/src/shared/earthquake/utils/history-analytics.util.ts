/**
 * 地震信息页列表数据聚合与图表序列
 *
 * 职责：
 * - 聚合地震历史数据为概览统计（总数 / 最大震级 / 平均震级 / 最近距离 等）。
 * - 分桶统计震级、时间、深度、地点、距离分布，生成图表序列。
 * - 供地震信息页列表与图表组件渲染。
 *
 * 依赖：地震历史数据快照类型（由调用方注入）。
 *
 * 注意：
 * - 分桶 label（如「M3-4」）为面向用户的文案，使用简体中文。
 * - `color` 为 CSS HEX 颜色值，不翻译。
 */
/** 地震信息页 — 列表数据聚合与图表序列 */

interface EarthquakeAnalyticsSummary {
  total: number
  maxMagnitude: number | null
  avgMagnitude: number | null
  nearestKm: number | null
  farthestKm: number | null
  strongestPlace: string | null
  m4Plus: number
  m5Plus: number
  within200Km: number
  avgDepth: number | null
  maxIntensity: number | null
}

interface MagBucket {
  label: string
  count: number
  color: string
}

interface TimeBucket {
  label: string
  count: number
}

interface DepthBucket {
  label: string
  count: number
}

interface PlaceBucket {
  label: string
  count: number
}

interface DistanceBucket {
  label: string
  count: number
  color: string
}

const MAG_BUCKETS: { label: string; min: number; max: number; color: string }[] = [
  { label: 'M<3', min: 0, max: 3, color: 'rgba(148, 163, 184, 0.85)' },
  { label: 'M3–3.9', min: 3, max: 4, color: 'rgba(125, 211, 252, 0.9)' },
  { label: 'M4–4.9', min: 4, max: 5, color: 'rgba(251, 191, 36, 0.95)' },
  { label: 'M5–5.9', min: 5, max: 6, color: 'rgba(251, 146, 60, 0.95)' },
  { label: 'M6+', min: 6, max: Infinity, color: 'rgba(248, 113, 113, 0.95)' },
]

const DEPTH_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: '0–10 km', min: 0, max: 10 },
  { label: '10–30 km', min: 10, max: 30 },
  { label: '30–60 km', min: 30, max: 60 },
  { label: '60+ km', min: 60, max: Infinity },
]

const DISTANCE_BUCKETS: { label: string; min: number; max: number; color: string }[] = [
  { label: '<100 km', min: 0, max: 100, color: 'rgba(248, 113, 113, 0.9)' },
  { label: '100–300', min: 100, max: 300, color: 'rgba(251, 146, 60, 0.9)' },
  { label: '300–500', min: 300, max: 500, color: 'rgba(251, 191, 36, 0.9)' },
  { label: '500+ km', min: 500, max: Infinity, color: 'rgba(125, 211, 252, 0.85)' },
]

export function buildMagBuckets(
  items: unknown[],
  getMagnitude: (row: unknown) => number | null | undefined,
): MagBucket[] {
  const counts = MAG_BUCKETS.map(() => 0)
  for (const row of items) {
    const mag = Number(getMagnitude(row))
    if (!Number.isFinite(mag)) continue
    const idx = MAG_BUCKETS.findIndex((b) => mag >= b.min && mag < b.max)
    if (idx >= 0) counts[idx] += 1
  }
  return MAG_BUCKETS.map((b, i) => ({ label: b.label, count: counts[i], color: b.color }))
}

export function buildDepthBuckets(
  items: unknown[],
  getDepth: (row: unknown) => number | null | undefined,
): DepthBucket[] {
  const counts = DEPTH_BUCKETS.map(() => 0)
  for (const row of items) {
    const depth = Number(getDepth(row))
    if (!Number.isFinite(depth)) continue
    const idx = DEPTH_BUCKETS.findIndex((b) => depth >= b.min && depth < b.max)
    if (idx >= 0) counts[idx] += 1
  }
  return DEPTH_BUCKETS.map((b, i) => ({ label: b.label, count: counts[i] }))
}

export function buildDistanceBuckets(
  items: unknown[],
  getDistanceKm: (row: unknown) => number | null | undefined,
): DistanceBucket[] {
  const counts = DISTANCE_BUCKETS.map(() => 0)
  for (const row of items) {
    const dist = Number(getDistanceKm(row))
    if (!Number.isFinite(dist)) continue
    const idx = DISTANCE_BUCKETS.findIndex((b) => dist >= b.min && dist < b.max)
    if (idx >= 0) counts[idx] += 1
  }
  return DISTANCE_BUCKETS.map((b, i) => ({
    label: b.label,
    count: counts[i],
    color: b.color,
  }))
}

export function buildTopPlaces(
  items: unknown[],
  getPlace: (row: unknown) => string | null | undefined,
  limit = 5,
): PlaceBucket[] {
  const map = new Map<string, number>()
  for (const row of items) {
    const raw = String(getPlace(row) || '').trim()
    if (!raw) continue
    const key = simplifyPlaceLabel(raw)
    map.set(key, (map.get(key) || 0) + 1)
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }))
}

function simplifyPlaceLabel(place: string): string {
  return place
    .replace(/(附近海域|地区|自治区|自治州|直辖市)/g, '')
    .replace(/\s+/g, '')
    .slice(0, 8)
}

export function buildTimeBuckets(
  items: unknown[],
  getTimeMs: (row: unknown) => number | null | undefined,
  period: string,
): TimeBucket[] {
  const bucketMs =
    period === 'hour'
      ? 15 * 60 * 1000
      : period === 'day'
        ? 3 * 60 * 60 * 1000
        : period === 'week'
          ? 24 * 60 * 60 * 1000
          : 7 * 24 * 60 * 60 * 1000

  const periodMs =
    period === 'hour'
      ? 60 * 60 * 1000
      : period === 'day'
        ? 24 * 60 * 60 * 1000
        : period === 'week'
          ? 7 * 24 * 60 * 60 * 1000
          : 30 * 24 * 60 * 60 * 1000

  const now = Date.now()
  const start = now - periodMs
  const map = new Map<number, number>()

  for (let t = Math.floor(start / bucketMs) * bucketMs; t <= now; t += bucketMs) {
    map.set(t, 0)
  }

  for (const row of items) {
    const ts = Number(getTimeMs(row))
    if (!Number.isFinite(ts) || ts <= 0) continue
    const key = Math.floor(ts / bucketMs) * bucketMs
    if (!map.has(key)) map.set(key, 0)
    map.set(key, (map.get(key) || 0) + 1)
  }

  const entries = [...map.entries()].sort((a, b) => a[0] - b[0])
  if (!entries.length) return [{ label: '—', count: 0 }]

  return entries.map(([ts, count]) => ({
    label: formatBucketLabel(ts, period),
    count,
  }))
}

function formatBucketLabel(ts: number, period: string): string {
  const d = new Date(ts)
  if (period === 'hour' || period === 'day') {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export function computeAnalyticsSummary(
  items: unknown[],
  opts: {
    getMagnitude: (row: unknown) => number | null | undefined
    getDistanceKm: (row: unknown) => number | null | undefined
    getPlace: (row: unknown) => string | null | undefined
    getDepth?: (row: unknown) => number | null | undefined
    getIntensity?: (row: unknown) => number | null | undefined
  },
): EarthquakeAnalyticsSummary {
  let maxMagnitude: number | null = null
  let magSum = 0
  let magCount = 0
  let nearestKm: number | null = null
  let farthestKm: number | null = null
  let strongestPlace: string | null = null
  let m4Plus = 0
  let m5Plus = 0
  let within200Km = 0
  let depthSum = 0
  let depthCount = 0
  let maxIntensity: number | null = null

  for (const row of items) {
    const mag = Number(opts.getMagnitude(row))
    if (Number.isFinite(mag)) {
      magSum += mag
      magCount += 1
      if (mag >= 4) m4Plus += 1
      if (mag >= 5) m5Plus += 1
      if (maxMagnitude == null || mag > maxMagnitude) {
        maxMagnitude = mag
        strongestPlace = String(opts.getPlace(row) || '').trim() || null
      }
    }

    const dist = Number(opts.getDistanceKm(row))
    if (Number.isFinite(dist)) {
      if (nearestKm == null || dist < nearestKm) nearestKm = dist
      if (farthestKm == null || dist > farthestKm) farthestKm = dist
      if (dist <= 200) within200Km += 1
    }

    if (opts.getDepth) {
      const depth = Number(opts.getDepth(row))
      if (Number.isFinite(depth)) {
        depthSum += depth
        depthCount += 1
      }
    }

    if (opts.getIntensity) {
      const intensity = Number(opts.getIntensity(row))
      if (Number.isFinite(intensity) && (maxIntensity == null || intensity > maxIntensity)) {
        maxIntensity = intensity
      }
    }
  }

  return {
    total: items.length,
    maxMagnitude,
    avgMagnitude: magCount ? Math.round((magSum / magCount) * 10) / 10 : null,
    nearestKm,
    farthestKm,
    strongestPlace,
    m4Plus,
    m5Plus,
    within200Km,
    avgDepth: depthCount ? Math.round((depthSum / depthCount) * 10) / 10 : null,
    maxIntensity,
  }
}

export function shortenPlace(place: unknown, maxLen = 14): string {
  const text = String(place || '').trim()
  if (!text) return '未知位置'
  if (text.length <= maxLen) return text
  return `${text.slice(0, maxLen)}…`
}

/** 固定 8 条分页槽位，末页不足时用 null 占位 */
export function buildFixedPageSlots<T>(
  items: T[],
  page: number,
  pageSize: number,
): Array<T | null> {
  const start = (page - 1) * pageSize
  const slice = items.slice(start, start + pageSize)
  const slots: Array<T | null> = [...slice]
  while (slots.length < pageSize) slots.push(null)
  return slots
}
