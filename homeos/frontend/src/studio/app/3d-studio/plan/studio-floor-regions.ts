/**
 * 室内地面分区（0.8.9 `studio-floor-regions.js`）。
 *
 * 一份户型里每个楼层可把地面切成若干**分区**，每块选一种铺面：
 * - `theme`：跟随场景风格（暖阳原木 / 自然木语…）；
 * - `wood`：原色木地板；
 * - `tile`：浅色瓷砖。
 *
 * 铺面深浅（tone）与分区**不是一对一**：同层同 `toneKind`（`wood` / `tile`）的分区
 * **共用一个色档** —— 这正是绘制面板上「本层使用同一色档的分区一起调整」的含义。
 * 所以色档单独存成 `floorFinishTones`，而不是挂在每个分区上。
 *
 * 几何约定与户型一致：点坐标为**户型像素坐标**（`{x, y}`），单位与墙体一致，由
 * `pixelsPerMeter` 换算。`outline` 是外环，`holes` 是洞口环（与地板多边形同向约定）。
 *
 * 本模块只做**纯数据**：跑不了 three，可在 node 里直接断言（`check:scene-payload`）。
 */

/** 可选铺面。顺序即 UI 顺序。 */
export const FLOOR_FINISHES = Object.freeze(['theme', 'wood', 'tile'] as const)

export type FloorFinish = (typeof FLOOR_FINISHES)[number]

/** 色档上下限（`-5..5`，0 为「默认」）。与 0.8.9 `FLOOR_TONE_LIMIT` 一致。 */
export const FLOOR_TONE_LIMIT = 5

/** 只有木地板与瓷砖允许调深浅；`theme` 的深浅由场景风格决定。 */
export type FloorToneKind = Exclude<FloorFinish, 'theme'>

export type FloorPoint = { x: number; y: number }

export type FloorRegion = {
  /** 稳定 id（`floor-region-…`），用于选中/撤销/切分后引用。 */
  id: string
  /** 铺面类型。 */
  finish: FloorFinish
  /** 外环；至少 3 点，闭合由渲染端补齐。 */
  outline: FloorPoint[]
  /** 洞口环；空数组表示没有洞。 */
  holes: FloorPoint[][]
}

/** 单层色档：`wood` / `tile` 各一个，缺省 0。 */
export type FloorTone = Record<FloorToneKind, number>

/** 单区块允许的最大点数（防外部注入撑爆载荷）。 */
const MAX_RING_POINTS = 512
/** 单层允许的最大分区数。 */
const MAX_REGIONS = 128
/** 单层允许的最大洞口环数。 */
const MAX_HOLES = 32
/** 坐标绝对值上限（米 × 像素/米 后仍在 float 安全范围）。 */
const MAX_COORD = 1e6

/** 分区 id 的合法形状：前端生成，后端按同一正则校验。 */
const REGION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/

export const floorToneKind = (finish: FloorFinish): FloorToneKind => (finish === 'tile' ? 'tile' : 'wood')

/** 该铺面是否允许调深浅。 */
export function supportsFloorTone(finish: FloorFinish): boolean {
  return finish === 'wood' || finish === 'tile'
}

export const DEFAULT_FLOOR_TONES: FloorTone = Object.freeze({ wood: 0, tile: 0 })

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function clampNumber(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

function normalizeFinish(value: unknown): FloorFinish {
  return (FLOOR_FINISHES as readonly string[]).includes(String(value) as FloorFinish) ? (value as FloorFinish) : 'theme'
}

/** 环上的单个点：非对象 / 非有限数一律丢弃。 */
function ringPoint(rawPoint: unknown): FloorPoint | null {
  if (!rawPoint || typeof rawPoint !== 'object') return null
  const source = rawPoint as FloorPoint
  const x = clampNumber(finiteNumber(source.x, Number.NaN), -MAX_COORD, MAX_COORD)
  const y = clampNumber(finiteNumber(source.y, Number.NaN), -MAX_COORD, MAX_COORD)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}

function samePoint(left: FloorPoint, right: FloorPoint): boolean {
  return Math.abs(left.x - right.x) < 1e-6 && Math.abs(left.y - right.y) < 1e-6
}

/** 闭合写法（首尾同点）在存储上统一去掉；只剩 3 点时不动（否则会退化成线段）。 */
function dropClosingPoint(points: FloorPoint[]): void {
  if (points.length <= 3) return
  const first = points[0]
  const last = points[points.length - 1]
  if (first && last && samePoint(first, last)) points.pop()
}

/** 环净化：丢弃非点项、夹取坐标、去掉连续重复点与首尾重合；点数不足 3 返回 null。 */
export function normalizeFloorRing(rawRing: unknown): FloorPoint[] | null {
  if (!Array.isArray(rawRing)) return null
  const points: FloorPoint[] = []
  for (const rawPoint of rawRing) {
    const point = ringPoint(rawPoint)
    if (!point) continue
    const previous = points[points.length - 1]
    if (previous && samePoint(previous, point)) continue
    points.push(point)
    if (points.length >= MAX_RING_POINTS) break
  }
  dropClosingPoint(points)
  return points.length >= 3 ? points : null
}

/** 洞口环集合净化：数量超限即停，非法环静默丢弃。 */
function normalizeHoles(rawHoles: unknown): FloorPoint[][] {
  if (!Array.isArray(rawHoles)) return []
  const holes: FloorPoint[][] = []
  for (const rawHole of rawHoles) {
    if (holes.length >= MAX_HOLES) break
    const hole = normalizeFloorRing(rawHole)
    if (hole) holes.push(hole)
  }
  return holes
}

/** 单块分区的净化；任何一处不合法返回 null（调用方静默丢弃）。 */
function normalizeRegion(rawRegion: unknown, seen: ReadonlySet<string>): FloorRegion | null {
  if (!rawRegion || typeof rawRegion !== 'object') return null
  const source = rawRegion as FloorRegion
  const id = String(source.id || '')
  if (!REGION_ID.test(id) || seen.has(id)) return null
  const outline = normalizeFloorRing(source.outline)
  if (!outline) return null
  return { id, finish: normalizeFinish(source.finish), outline, holes: normalizeHoles(source.holes) }
}

/**
 * 分区数组净化。非法条目**静默丢弃**（与场景负载其它部分一致：宁可少画一块，
 * 也不能让一份坏草稿让整层打不开）。
 */
export function normalizeFloorRegions(rawRegions: unknown): FloorRegion[] {
  if (!Array.isArray(rawRegions)) return []
  const seen = new Set<string>()
  const regions: FloorRegion[] = []
  for (const rawRegion of rawRegions) {
    if (regions.length >= MAX_REGIONS) break
    const region = normalizeRegion(rawRegion, seen)
    if (!region) continue
    seen.add(region.id)
    regions.push(region)
  }
  return regions
}

/** 色档净化：夹到 `±FLOOR_TONE_LIMIT` 并取整；缺省 0（不复用分区对象，避免共享引用）。 */
export function normalizeFloorTones(rawTones: unknown): FloorTone {
  const source = (rawTones && typeof rawTones === 'object' ? rawTones : {}) as Partial<FloorTone>
  const pick = (value: unknown): number =>
    clampNumber(Math.round(finiteNumber(value, 0)), -FLOOR_TONE_LIMIT, FLOOR_TONE_LIMIT)
  return { wood: pick(source.wood), tile: pick(source.tile) }
}

/**
 * 分区在 3D 里需要的「挖洞」层：返回该分区相对整层的洞口环。
 *
 * 目前分区不互挖，只有自身 holes；保留独立函数是为了让渲染端只依赖这里，
 * 将来支持「分区之间扣减」时改一处即可。
 */
export function floorRegionVoids(region: FloorRegion): FloorPoint[][] {
  return region.holes
}

/** 点是否落在环内（射线法，uv 坐标与场景同单位）。 */
export function floorRingContainsPoint(ring: readonly FloorPoint[], point: FloorPoint): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!
    const b = ring[j]!
    const intersects =
      a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || 1e-9) + a.x
    if (intersects) inside = !inside
  }
  return inside
}

/** 命中测试：先查外环再扣掉洞口。返回最上层命中的分区。 */
export function selectFloorRegion(regions: readonly FloorRegion[], point: FloorPoint): FloorRegion | null {
  for (let index = regions.length - 1; index >= 0; index--) {
    const region = regions[index]!
    if (!floorRingContainsPoint(region.outline, point)) continue
    if (region.holes.some((hole) => floorRingContainsPoint(hole, point))) continue
    return region
  }
  return null
}

/** 两个色档是否等价（保存前用于跳过无变化的写入）。 */
export function sameFloorTones(left: FloorTone, right: FloorTone): boolean {
  return left.wood === right.wood && left.tile === right.tile
}

/**
 * 铺面分层（0.8.9 `floorFinishLayers`）。
 *
 * 返回「一项铺面由哪几层组成」：底材 + 表层贴图键 + 是否可调深浅。
 * 上游返回 three 层对象；本项目返回**描述**，three 构造留在渲染层
 * （`plan/studio-floor-render.ts`），保证本模块可在 node 里断言。
 */
export function floorFinishLayers(finish: FloorFinish): Array<{ key: string; finish: FloorFinish; tone: boolean }> {
  const kind = floorToneKind(finish)
  return [
    { key: `${kind}:base`, finish, tone: false },
    { key: `${kind}:surface`, finish, tone: supportsFloorTone(finish) },
  ]
}

/**
 * 保存后「哪些铺面色档变了」（0.8.9 `savedFloorToneChanges`）。
 *
 * 返回变化的分区 key（`wood` / `tile`），空数组表示没变。用途：只重建受影响的分区板，
 * 而不是整层地面 —— 与 `savedLightRangesOnlyChanged` 是同一类优化。
 */
export function savedFloorToneChanges(previous: unknown, next: unknown): string[] {
  const before = normalizeFloorTones(previous)
  const after = normalizeFloorTones(next)
  return (Object.keys(after) as string[]).filter(
    (key) => before[key as keyof typeof before] !== after[key as keyof typeof after],
  )
}
