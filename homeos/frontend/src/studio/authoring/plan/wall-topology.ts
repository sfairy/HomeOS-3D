/**
 * 墙体拓扑的**放置校验**（0.9.0 `wallTopologyPlacementError` / `calibrationPlacementError`）。
 *
 * 两条都是「先算再拦」的纯函数，只返回中文错误串（空串＝放行），不抛异常、不改数据。
 * 这样画布侧可以在**落盘之前**调用它们，用户看到的是「请调整接墙位置」而不是
 * 「保存后才发现开口错位」。
 *
 * ## 状态：已实现、**尚未接线**（勿当死代码删除）
 *
 * 对应 `docs/upgrade-0.9.0/PARITY-MATRIX.md` 的 A11 / A12 两项，算法按反汇编逐行复刻。
 * 目前全仓没有调用点（原计划的调用方 `items/placement/placement.ts` 还没接），
 * 13 项单测随发布要求移除单测目录时一并删除。保留含义是**不要把复刻结果连同推导注释一起丢掉**。
 * 接线时在 `placement/placement.ts` 的围挡改形 / 重标尺路径上，落盘前各调一次。
 *
 * 坐标约定：`wall.start/end` 是**户型像素**，`opening.width / sill / height` 是**米**，
 * 因此所有比较都先把米换算成像素（`pixelsPerMeter`），否则墙体厚度与开口宽度会差 100 倍。
 */

type PlanPoint = { x: number; y: number }

type PlanWall = {
  id?: string
  start: PlanPoint
  end: PlanPoint
  thickness?: number
  height?: number
}

type PlanOpening = {
  id?: string
  wallId?: string
  /** 沿墙方向的中心位置（0–1）。 */
  t?: number
  /** 开口宽度（米）。 */
  width?: number
  /** 窗台高度（米）。 */
  sill?: number
  /** 开口高度（米）。 */
  height?: number
}

type PlanShape = {
  walls?: PlanWall[]
  doors?: PlanOpening[]
  windows?: PlanOpening[]
  railings?: PlanOpening[]
  items?: Array<PlanOpening & { type?: string }>
  settings?: { wallHeight?: number }
}

/** 平面有向包围盒：中心 + 朝向 + 两个半长。 */
type PlanBox = {
  cx: number
  cy: number
  angle: number
  halfLength: number
  halfThickness: number
  bottom: number
  top: number
}

const DEFAULT_WALL_THICKNESS_M = 0.2
const DEFAULT_WALL_HEIGHT_M = 2.8

function planWallBox(wall: PlanWall, pixelsPerMeter: number, wallHeight: number): PlanBox {
  const deltaX = wall.end.x - wall.start.x,
    deltaY = wall.end.y - wall.start.y,
    thickness = (wall.thickness ?? DEFAULT_WALL_THICKNESS_M) * pixelsPerMeter
  return {
    cx: (wall.start.x + wall.end.x) / 2,
    cy: (wall.start.y + wall.end.y) / 2,
    angle: Math.atan2(deltaY, deltaX),
    halfLength: Math.hypot(deltaX, deltaY) / 2,
    halfThickness: thickness / 2,
    bottom: 0,
    top: wall.height ?? wallHeight,
  }
}

function planOpeningBox(
  wall: PlanWall,
  opening: PlanOpening,
  pixelsPerMeter: number,
  wallHeight: number,
): PlanBox | null {
  const width = opening.width
  if (!Number.isFinite(width) || (width as number) <= 0) return null
  const deltaX = wall.end.x - wall.start.x,
    deltaY = wall.end.y - wall.start.y,
    t = Math.min(1, Math.max(0, Number.isFinite(opening.t) ? (opening.t as number) : 0.5)),
    sill = Math.max(0, opening.sill ?? 0),
    height = Math.max(0, opening.height ?? wallHeight - sill)
  return {
    cx: wall.start.x + deltaX * t,
    cy: wall.start.y + deltaY * t,
    angle: Math.atan2(deltaY, deltaX),
    halfLength: ((width as number) * pixelsPerMeter) / 2,
    halfThickness: ((wall.thickness ?? DEFAULT_WALL_THICKNESS_M) * pixelsPerMeter) / 2,
    bottom: sill,
    top: sill + height,
  }
}

/** 分离轴：两个 OBB 在任一轴上的投影不重叠即分离。 */
function projectionRadius(box: PlanBox, axisAngle: number): number {
  const delta = box.angle - axisAngle
  return Math.abs(Math.cos(delta)) * box.halfLength + Math.abs(Math.sin(delta)) * box.halfThickness
}

function boxesOverlap(first: PlanBox, second: PlanBox): boolean {
  // 先比高度：窗台高于墙顶或开口在墙下方都不算冲突。
  if (first.bottom >= second.top - 1e-7 || second.bottom >= first.top - 1e-7) return false
  for (const axisAngle of [first.angle, first.angle + Math.PI / 2, second.angle, second.angle + Math.PI / 2]) {
    const unitX = Math.cos(axisAngle),
      unitY = Math.sin(axisAngle),
      centerDistance = Math.abs((first.cx - second.cx) * unitX + (first.cy - second.cy) * unitY),
      radiusSum = projectionRadius(first, axisAngle) + projectionRadius(second, axisAngle)
    if (centerDistance > radiusSum - 1e-7) return false
  }
  return true
}

function openingsOf(plan: PlanShape, key: 'doors' | 'windows' | 'railings'): PlanOpening[] {
  return plan?.[key] || []
}

/** 排气扇洞口：挂在墙上的 `items`（有 `wallId` 与 `t`）。 */
function exhaustOpenings(plan: PlanShape): PlanOpening[] {
  return (plan?.items || []).filter((item) => item?.type === 'exhaust-fan' && item.wallId)
}

/**
 * 新墙体是否穿过了已有开口。
 *
 * @param previousPlan 改动前的户型（当前实现只用它判断「是否有新增墙」，保留入参以便后续做差异校验）
 * @param nextPlan     改动后的户型（开口从这里读）
 * @param newWallList  本次新增的墙体（空数组＝不是加墙操作，直接放行）
 * @returns 中文错误串；空串表示可以放置
 */
export function wallTopologyPlacementError(
  previousPlan: PlanShape | null | undefined,
  nextPlan: PlanShape,
  pixelsPerMeter: number,
  newWallList: readonly PlanWall[] = [],
): string {
  if (!newWallList.length || !Number.isFinite(pixelsPerMeter) || pixelsPerMeter <= 0) return ''
  const wallHeight = nextPlan.settings?.wallHeight ?? DEFAULT_WALL_HEIGHT_M,
    wallsById = new Map((nextPlan.walls || []).map((wall) => [wall.id, wall])),
    newWallBoxes = newWallList.map((wall) => planWallBox(wall, pixelsPerMeter, wallHeight))

  const hitsOpening = (key: 'doors' | 'windows' | 'railings') =>
    openingsOf(nextPlan, key).some((opening) => {
      const hostWall = wallsById.get(opening.wallId)
      if (!hostWall) return false
      const openingBox = planOpeningBox(hostWall, opening, pixelsPerMeter, wallHeight)
      return !!openingBox && newWallBoxes.some((wallBox) => boxesOverlap(wallBox, openingBox))
    })

  // 门/窗/栏杆共用一句：用户关心的是「这里有个洞」，不必分三种文案。
  if (hitsOpening('doors') || hitsOpening('windows') || hitsOpening('railings'))
    return '新墙体穿过已有门、窗或栏杆的开口，请调整接墙位置。'
  if (
    exhaustOpenings(nextPlan).some((opening) => {
      const hostWall = wallsById.get(opening.wallId)
      if (!hostWall) return false
      const openingBox = planOpeningBox(hostWall, opening, pixelsPerMeter, wallHeight)
      return !!openingBox && newWallBoxes.some((wallBox) => boxesOverlap(wallBox, openingBox))
    })
  )
    return '新墙体穿过已有排气扇洞口，请调整接墙位置。'
  // previousPlan 目前不参与判定；保留形参是为了让调用点与 0.9.0 同名同序。
  void previousPlan
  return ''
}

/**
 * 重新标尺（改 `pixelsPerMeter`）之后，原有开口是否还放得下。
 *
 * 只在比例真的变化时才需要报错：开口宽度是**米**、墙体长度是**像素**，
 * 比例一变「同一段墙能容纳的米数」就变了 —— 庭院门最容易先放不下。
 *
 * @returns 中文错误串（已带「新比例下，」前缀）；空串表示可以应用
 */
export function calibrationPlacementError(
  previousPlan: PlanShape | null | undefined,
  nextPlan: PlanShape,
  pixelsPerMeter: number,
): string {
  if (!Number.isFinite(pixelsPerMeter) || pixelsPerMeter <= 0) return ''
  const wallsById = new Map((nextPlan.walls || []).map((wall) => [wall.id, wall])),
    gateOverflow = (nextPlan.items || []).some((item) => {
      if (!item?.wallId) return false
      const hostWall = wallsById.get(item.wallId)
      if (!hostWall) return false
      const wallLengthMeters =
          Math.hypot(hostWall.end.x - hostWall.start.x, hostWall.end.y - hostWall.start.y) / pixelsPerMeter,
        gateWidthMeters = Number(item.width)
      // 两端各留 1cm，避免「刚好等长」被浮点误差判成放得下。
      return Number.isFinite(gateWidthMeters) && gateWidthMeters > 0 && gateWidthMeters > wallLengthMeters - 0.02
    })
  if (gateOverflow) return '新比例下，这一段围挡放不下原有庭院门，请先移动庭院门或加长直段。'
  void previousPlan
  return ''
}

/* ------------------------------------------------------------------------- *
 * 接墙开口的切分（0.9.0 `cornerWallOpeningCuts`）
 *
 * ## 解决什么
 *
 * 两堵墙在转角相接时，如果转角两侧各有一个开口（门 / 窗 / 栏杆）紧贴转角，那么
 * 「转角那一小段墙」其实是不存在的 —— 但墙体仍是按整条墙建的，于是会在门洞中间
 * 露出一截墙垛。修法是把两侧的开口各向内切一刀，把转角段从墙带里挖掉。
 *
 * ## 判定顺序（与上游一致，改顺序会改变命中集合）
 *
 * 1. 门 + 栏杆总数 < 2 → 没有「转角两侧都有开口」的可能，直接返回空；
 * 2. 只收集**窗与栏杆**贴端点的开口（门不参与：门洞本身就要留全，不能切）；
 * 3. 两两配对，要求：不同墙、共享同一个墙端点、两墙近似垂直、且没有第三堵墙也过这个点；
 * 4. 切分的 `t` 由「开口边缘到墙端点的间隙」决定（`gap / (2 × 墙长)`）。
 * ------------------------------------------------------------------------- */

/** 开口贴到墙端点的判定容差（米）。 */
const CORNER_GAP_TOLERANCE_M = 0.005
/** 两个端点视为同一点的容差（米）。 */
const CORNER_POINT_TOLERANCE_M = 0.001
/** `|sin(夹角)|` 低于该值视为平行（转角必须是近似垂直）。 */
const CORNER_PERPENDICULAR_MIN_SIN = 0.5 - 1e-8

/** 墙上一个开口的位置描述（米制）。 */
type WallOpeningBox = {
  x: number
  y: number
  length: number
  center: number
  width: number
  angle: number
}

/** 贴在墙端点上的开口记录。 */
type CornerEndpoint = {
  key: string
  wall: PlanWall
  end: 'start' | 'end'
  /** 开口边缘到墙端点的间隙（米，≥0）。 */
  gap: number
  /** 墙长（米）。 */
  length: number
  /** 开口宽度（米，已按墙长收口）。 */
  width: number
  angle: number
  bottom: number
  top: number
}

/** 某个开口在墙上的米制位置。 */
function wallOpeningBox(
  wall: PlanWall | undefined,
  opening: PlanOpening,
  pixelsPerMeter: number,
): WallOpeningBox | null {
  if (!wall) return null
  const deltaX = wall.end.x - wall.start.x,
    deltaY = wall.end.y - wall.start.y,
    length = Math.hypot(deltaX, deltaY) / pixelsPerMeter
  if (!length) return null
  const openingT = Math.min(1, Math.max(0, Number.isFinite(opening.t) ? (opening.t as number) : 0.5)),
    width = Math.min(Number(opening.width) || 0, length)
  return {
    x: (wall.start.x + deltaX * openingT) / pixelsPerMeter,
    y: (wall.start.y + deltaY * openingT) / pixelsPerMeter,
    length,
    center: openingT * length,
    width,
    angle: Math.atan2(deltaY, deltaX),
  }
}

/** 找出所有「贴墙端点」的开口，并两两配成转角对。 */
function cornerOpeningPairs(plan: PlanShape, pixelsPerMeter: number): CornerEndpoint[][] {
  // 至少要两个可切开口才可能构成转角对。参与切分的只有窗与栏杆
  // （门洞本身要留全，转角处不能挖）。
  if ((plan.windows?.length || 0) + (plan.railings?.length || 0) < 2) return []
  const wallsById = new Map((plan.walls || []).map((wall) => [wall.id, wall])),
    endpoints: CornerEndpoint[] = []
  for (const openingGroup of ['windows', 'railings'] as const)
    for (const opening of plan[openingGroup] || []) {
      const hostWall = wallsById.get(opening.wallId),
        box = wallOpeningBox(hostWall, opening, pixelsPerMeter)
      if (!hostWall || !box || box.width <= 0) continue
      const wallHeight = hostWall.height ?? plan.settings?.wallHeight ?? DEFAULT_WALL_HEIGHT_M,
        // 窗台以下不算开口；栏杆没有「上沿」（视为到墙顶）。
        sill = openingGroup === 'windows' ? Math.max(0, opening.sill ?? 0) : 0,
        top =
          openingGroup === 'railings' ? Number.POSITIVE_INFINITY : Math.min(wallHeight, sill + (opening.height ?? 0))
      if (!(top > sill)) continue
      for (const wallEnd of ['start', 'end'] as const) {
        const gap = (wallEnd === 'start' ? box.center : box.length - box.center) - box.width / 2
        gap <= CORNER_GAP_TOLERANCE_M &&
          endpoints.push({
            key: openingGroup + ':' + String(opening.id ?? ''),
            wall: hostWall,
            end: wallEnd,
            gap: Math.max(0, gap),
            length: box.length,
            width: box.width,
            angle: box.angle,
            bottom: sill,
            top,
          })
      }
    }
  if (endpoints.length < 2) return []

  const isSamePoint = (first: PlanPoint, second: PlanPoint) =>
      Math.hypot(first.x - second.x, first.y - second.y) <= CORNER_POINT_TOLERANCE_M,
    pairs: CornerEndpoint[][] = []
  for (let firstIndex = 0; firstIndex < endpoints.length; firstIndex += 1)
    for (let secondIndex = firstIndex + 1; secondIndex < endpoints.length; secondIndex += 1) {
      const firstEndpoint = endpoints[firstIndex]!,
        secondEndpoint = endpoints[secondIndex]!,
        sharedPoint = firstEndpoint.wall[firstEndpoint.end]
      if (
        // 同一条墙的两个开口不是转角。
        firstEndpoint.wall === secondEndpoint.wall ||
        !isSamePoint(sharedPoint, secondEndpoint.wall[secondEndpoint.end]) ||
        // 转角必须近似垂直；两堵墙平行对接时不需要切。
        Math.abs(Math.sin(firstEndpoint.angle - secondEndpoint.angle)) < CORNER_PERPENDICULAR_MIN_SIN ||
        // 有第三堵墙也过这个点时，它已经是真正的转角，不能再挖。
        (plan.walls || []).some(
          (candidateWall) =>
            candidateWall !== firstEndpoint.wall &&
            candidateWall !== secondEndpoint.wall &&
            (isSamePoint(sharedPoint, candidateWall.start) || isSamePoint(sharedPoint, candidateWall.end)),
        )
      )
        continue
      const bottom = Math.max(firstEndpoint.bottom, secondEndpoint.bottom),
        top = Math.min(firstEndpoint.top, secondEndpoint.top)
      top > bottom + 1e-7 && pairs.push([firstEndpoint, secondEndpoint])
    }
  return pairs
}

/** 一处切分：沿墙位置 `t`（0–1）与竖直区间。 */
export type CornerWallOpeningCut = {
  wallId: string
  /** 切分宽度（米）。 */
  width: number
  /** 沿墙位置（0 = 起点、1 = 终点）。 */
  t: number
  sill: number
  height: number
}

/**
 * 转角两侧都有开口时，把各自的「转角侧」切掉一段。
 *
 * 返回 `Map<wallId, cuts[]>`：宿主按 `t / width / sill / height` 在墙带上开洞，
 * 那截夹在门洞中间的墙垛就不会再出现。
 */
export function cornerWallOpeningCuts(plan: PlanShape, pixelsPerMeter: number): Map<string, CornerWallOpeningCut[]> {
  const cutsByWallId = new Map<string, CornerWallOpeningCut[]>()
  if (!Number.isFinite(pixelsPerMeter) || pixelsPerMeter <= 0) return cutsByWallId
  for (const endpointPair of cornerOpeningPairs(plan, pixelsPerMeter)) {
    // 两侧的竖直区间取交集：只有两者都开的那个高度段才需要挖。
    const bottom = Math.max(...endpointPair.map((endpoint) => endpoint.bottom)),
      top = Math.min(...endpointPair.map((endpoint) => endpoint.top))
    for (const endpoint of endpointPair) {
      if (endpoint.width <= 1e-7) continue
      const wallId = String(endpoint.wall.id ?? '')
      if (!wallId) continue
      const cutList = cutsByWallId.get(wallId) || []
      cutsByWallId.has(wallId) || cutsByWallId.set(wallId, cutList)
      // 切分位置由「开口边缘到墙端点的间隙」决定；`end` 侧从 1 往回量。
      const gapRatio = endpoint.gap / (2 * endpoint.length)
      cutList.push({
        wallId,
        width: endpoint.width,
        t: endpoint.end === 'start' ? gapRatio : 1 - gapRatio,
        sill: bottom,
        height: top - bottom,
      })
    }
  }
  return cutsByWallId
}
