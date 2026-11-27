import { buildUnderfloorHeatingPaths } from '../authoring/scene/studio-underfloor-heating'

/**
 * 地面铺面的**材质参数**（0.8.9 `studio-floor-finish.js`）。
 *
 * 三层数据，刻意分开：
 *
 * 1. **铺面类型**（`theme` / `wood` / `tile`）—— 决定用哪套贴图与明度基线；
 * 2. **色档**（`-5..5`）—— 同层同 `toneKind` 的分区共用一个档位（见 `studio-floor-regions.ts`）；
 * 3. **主题**（`default` / `warm-wood` / `natural-wood`）—— `theme` 铺面跟随它。
 *
 * 深浅的实现不是换贴图，而是在**同一张贴图上调明度**：换贴图会让相邻分区出现
 * 纹理错位（木纹对不上），而明度调整在视觉上等价于「同一批木料的不同深浅」。
 *
 * 本模块只产出**数值**（明度偏移、粗糙度、砖缝参数），不碰 three —— 这样
 * 「±5 档到底差多少」「哪种铺面支持调深浅」可以直接断言。
 */


/** 一档色档对应的明度偏移（相对 1.0 的乘数）。±5 档 → 约 ±30%。 */
export const FLOOR_TONE_STEP = 0.06

/** 每种铺面的基线参数。`theme` 没有自己的基线：它由场景风格决定。 */
export type FloorFinishProfile = {
  /** 贴图资源 id（由资源层解析成 URL；这里是稳定键）。 */
  texture: string
  /** 纹理在 1m × 1m 内的重复次数（木地板条 vs 瓷砖）。 */
  tileRepeat: number
  /** 基线粗糙度（木地板更哑光，瓷砖更亮）。 */
  roughness: number
  /** 基线明度乘数。 */
  brightness: number
}

/** 木地板与瓷砖的基线。 */
export const FLOOR_FINISH_PROFILES: Readonly<Record<FloorToneKind, FloorFinishProfile>> = Object.freeze({
  wood: { texture: 'floor-wood', tileRepeat: 1, roughness: 0.72, brightness: 1 },
  tile: { texture: 'floor-tile', tileRepeat: 2, roughness: 0.38, brightness: 1 },
})

/**
 * `theme` 铺面在各场景风格下的落点。
 *
 * 三种风格都落到「木地板」，但基线明度不同：暖阳原木整体偏暖亮，自然木语偏中性。
 * 没登记的风格回落到 `default`（与「未知风格按默认渲染」的既有口径一致）。
 */
export const THEME_FLOOR_BY_SCENE_STYLE: Readonly<Record<string, { kind: FloorToneKind; brightness: number }>> =
  Object.freeze({
    default: { kind: 'wood', brightness: 1 },
    'warm-wood': { kind: 'wood', brightness: 1.08 },
    'natural-wood': { kind: 'wood', brightness: 0.94 },
  })

/** 该铺面是否允许调深浅（`theme` 由场景风格决定，不给用户调）。 */
export function floorFinishSupportsTone(finish: FloorFinish): boolean {
  return finish === 'wood' || finish === 'tile'
}

/** 铺面对应的色档键（`theme` 跟随它的落点）。 */
export function floorFinishToneKind(finish: FloorFinish, sceneStyle: string): FloorToneKind {
  if (finish === 'wood' || finish === 'tile') return finish
  return THEME_FLOOR_BY_SCENE_STYLE[sceneStyle]?.kind ?? 'wood'
}

/** 夹取并取整色档。 */
export function clampFloorTone(tone: unknown): number {
  const parsed = Number(tone)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(-FLOOR_TONE_LIMIT, Math.min(FLOOR_TONE_LIMIT, Math.round(parsed)))
}

/** 色档 → 明度乘数（0 档为 1，正档更亮、负档更暗）。 */
export function floorToneBrightness(tone: number): number {
  return Number((1 + clampFloorTone(tone) * FLOOR_TONE_STEP).toFixed(4))
}

/** 最终材质参数：铺面基线 × 场景风格亮度 × 色档亮度。 */
export type FloorMaterialParams = FloorFinishProfile & {
  /** 最终明度乘数（已合成三者）。 */
  brightness: number
  /** 是否使用了自定义色档（供 UI 显示「已调整」）。 */
  toned: boolean
}

/**
 * 算出一个分区实际使用的材质参数。
 *
 * @param finish     分区铺面
 * @param tone       该分区所在层、该 `toneKind` 的色档
 * @param sceneStyle 当前场景风格（只影响 `theme` 铺面）
 */
export function floorMaterialParams(finish: FloorFinish, tone: number, sceneStyle = 'default'): FloorMaterialParams {
  const toneKind = floorFinishToneKind(finish, sceneStyle)
  const profile = FLOOR_FINISH_PROFILES[toneKind]
  const themeBrightness = finish === 'theme' ? (THEME_FLOOR_BY_SCENE_STYLE[sceneStyle]?.brightness ?? 1) : 1
  const toneValue = floorFinishSupportsTone(finish) ? clampFloorTone(tone) : 0
  return {
    ...profile,
    brightness: Number((profile.brightness * themeBrightness * floorToneBrightness(toneValue)).toFixed(4)),
    toned: floorFinishSupportsTone(finish) && toneValue !== 0,
  }
}

/**
 * 铺面切换时的色档处理（0.8.9 §3.2 的「缺省即旧行为」）。
 *
 * 从 `theme` 切到 `wood` / `tile`：沿用当前层该 `toneKind` 的色档（用户的深浅偏好已表达过）。
 * 切回 `theme`：色档不再生效，但**不清零** —— 用户可能只是临时看一眼默认铺面。
 */
export function floorToneForFinish(
  tones: Readonly<Record<FloorToneKind, number>>,
  finish: FloorFinish,
  sceneStyle = 'default',
): number {
  if (!floorFinishSupportsTone(finish)) return 0
  return clampFloorTone(tones[floorFinishToneKind(finish, sceneStyle)])
}

/**
 * 上游导出名别名（0.8.9 `studio-floor-finish.js`）。
 *
 * 本项目的边界是「纯函数只出参数，three 构造留在渲染层」，所以下面四个函数
 * 都返回**描述**而不是 three 对象。名字保留是为了让排障时能按上游名检索到。
 */
export const createFloorFinishMaterial = floorMaterialParams

/** 「去掉顶面的整板」（0.8.9 `floorSlabWithoutTop`）：分区铺面时隐藏原整板顶面。 */
export function floorSlabWithoutTop<T extends { userData?: Record<string, unknown> }>(slab: T): T {
  const userData = (slab.userData ??= {})
  userData.regionReceiverKind = 'floor'
  userData.slabTopVisible = false
  return slab
}

/** 分区板的顶面几何描述（0.8.9 `floorTopGeometry`）：环 + 洞 + 色档参数。 */
export function floorTopGeometry(
  outline: ReadonlyArray<{ x: number; y: number }>,
  holes: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>> = [],
  finish: FloorFinish = 'theme',
  tone = 0,
  sceneStyle = 'default',
): {
  outline: Array<{ x: number; y: number }>
  holes: Array<Array<{ x: number; y: number }>>
  params: FloorMaterialParams
} {
  return {
    outline: outline.map((point) => ({ x: point.x, y: point.y })),
    holes: holes.map((ring) => ring.map((point) => ({ x: point.x, y: point.y }))),
    params: floorMaterialParams(finish, tone, sceneStyle),
  }
}

/**
 * 实心铺面色档（0.8.9 `setSolidFloorTone`）：返回某一档位下的参数，不改任何对象。
 *
 * 纯函数化是必须的：色档要参与撤销/重做与「按层聚合」，直接改材质会让这两条都失效。
 */
export function setSolidFloorTone(finish: FloorFinish, tone: number, sceneStyle = 'default'): FloorMaterialParams {
  return floorMaterialParams(finish, clampFloorTone(tone), sceneStyle)
}

export function floorOpeningPolygon(opening: any, scale: any) {
  const rotationRad = (opening.rotation * Math.PI) / 180,
    cosRotation = Math.cos(rotationRad),
    sinRotation = Math.sin(rotationRad),
    halfWidth = (opening.width * scale) / 2,
    halfDepth = (opening.depth * scale) / 2
  return [
    [-halfWidth, -halfDepth],
    [halfWidth, -halfDepth],
    [halfWidth, halfDepth],
    [-halfWidth, halfDepth],
  ].map(([localX, localY]) => ({
    x: opening.x + localX * cosRotation - localY * sinRotation,
    y: opening.y + localX * sinRotation + localY * cosRotation,
  }))
}

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

/**
 * 地面分区 / 铺面色档 / 地暖盘管的**渲染规格**（0.8.9）。
 *
 * 三块计算此前各自到位但没人调用（`studio-floor-regions` / `studio-floor-finish` /
 * `studio-underfloor-heating` 只有单测引用）。本模块把它们组装成 three 能直接用的
 * 「一张分区一张板 + 一条盘管一组折线」，并保持**纯函数**边界：
 *
 * - 输入是楼层记录（文档数据）与 `toWorld` 映射，输出是数值/环，不 new 任何 three 对象；
 * - 于是「切了铺面但颜色没变」「盘管越出墙外」这两类错都能在 node 里断言。
 *
 * ## 为什么一块分区一张板
 *
 * 单张大板只能用一种材质。要让「客厅木地板 + 卫生间瓷砖」同时成立，只能按分区拆板。
 * 拆板后**必须隐藏原来的整板**（`regionReceiverKind === 'floor'` 的那张），
 * 否则两张面共面会 z-fighting，表现为地面闪烁。
 *
 * ## 盘管的显示条件
 *
 * 上游公告是「壁挂炉制热时可显示本层盘管」。本仓编辑器里没有 HA 实时状态，
 * 因此用**楼层上的显式开关** `underfloorHeating`（检查器可勾选）代替：
 * 它既是编辑时的预览，也能被运行态按锅炉状态改写 —— 语义一致，且不需要在渲染层
 * 猜设备状态。
 */


/** 一个分区最终要画的板。 */
export type FloorRegionPlate = {
  outline: FloorPoint[]
  holes: FloorPoint[][]
  /** 该分区实际使用的材质参数（明度/粗糙度/贴图键）。 */
  params: FloorMaterialParams
  /** 铺面类型，供渲染层挑贴图。 */
  finish: FloorFinish
}

/** 楼层记录里本模块用到的字段（避免把整份 appCtx 类型拖进来）。 */
export type FloorRenderRecord = {
  floorRegions?: unknown
  floorFinishTones?: unknown
  underfloorHeating?: unknown
}

/**
 * 解析出要画的板。
 *
 * 返回 `null` 表示「这一层没有手工分区」—— 调用方应保留原来的整板，
 * 而不是画一堆空板（空板 = 地面消失）。
 */
export function resolveFloorRegionPlates(
  floorRecord: FloorRenderRecord | null | undefined,
  sceneStyle = 'default',
): FloorRegionPlate[] | null {
  const regions = normalizeFloorRegions(floorRecord?.floorRegions)
  if (regions.length === 0) return null
  const tones = normalizeFloorTones(floorRecord?.floorFinishTones)
  return regions.map((region) => {
    const tone = floorToneForFinish(tones, region.finish, sceneStyle)
    return {
      outline: region.outline,
      holes: region.holes,
      finish: region.finish,
      params: floorMaterialParams(region.finish, tone, sceneStyle),
    }
  })
}

/**
 * 色档是否会让同一 `toneKind` 的分区一起变 —— 供 UI 提示「本层一起调整」。
 *
 * 与 `floorFinishToneKind` 同口径：`theme` 铺面跟随场景风格落的那个档。
 */
export function sharedToneKindFor(plates: readonly FloorRegionPlate[], sceneStyle = 'default'): string[] {
  const kinds = new Set<string>()
  for (const plate of plates) kinds.add(floorFinishToneKind(plate.finish, sceneStyle))
  return [...kinds]
}

/** 盘管的一条折线（世界坐标，米）。 */
export type HeatingPolyline = { points: Array<{ x: number; z: number }> }

/**
 * 盘管折线：每个分区一段蛇形，转到世界坐标。
 *
 * 与分区板共用同一份 `floorRegions`，所以「切分区域后盘管自动跟着分成两套」，
 * 不需要额外同步逻辑。
 */
export function resolveHeatingPolylines(
  floorRecord: FloorRenderRecord | null | undefined,
  toWorld: (point: FloorPoint) => { x: number; z: number },
): HeatingPolyline[] {
  const regions = normalizeFloorRegions(floorRecord?.floorRegions)
  if (regions.length === 0) return []
  const segments = buildUnderfloorHeatingPaths(regions as readonly Pick<FloorRegion, 'outline'>[])
  return segments.map((segment) => ({
    points: [toWorld(segment.from), toWorld(segment.to)],
  }))
}

/**
 * 这一层是否该画盘管。
 *
 * 三个条件缺一不可：楼层开关打开、有分区、盘管段数为正（区域太小铺不下时为空）。
 */
export function shouldRenderHeating(floorRecord: FloorRenderRecord | null | undefined, polylineCount: number): boolean {
  return floorRecord?.underfloorHeating === true && polylineCount > 0
}
