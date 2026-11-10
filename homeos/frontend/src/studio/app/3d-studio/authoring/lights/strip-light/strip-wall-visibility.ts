/**
 * 灯带（面光）的墙体可见性：极坐标遮挡距离图（2D 版的点光源阴影）。
 *
 * `RectAreaLight` 向整个半球发光、没有距离截断，也不投影：隔着一堵墙，隔壁房间照样被
 * 照亮。以前烘过一张俯视可见性网格，但格子（0.15~0.4 m）比墙（0.2 m）还宽，线性过滤
 * 会把墙这边的「可见」糊到墙那边，墙根和墙面上留下一团团光斑。
 *
 * 现在每条灯带占图集里的一行：开头两个像素存射线起点（灯带中心和两端，世界 xz），
 * 后面 `STRIP_VISIBILITY_ANGLES` 个像素按方位角存「从各起点出发第一次碰到墙的距离」。
 * 着色器算出片元到起点的方位角和距离，与那一格的碰墙距离比较（见 `floorLightShaderPars`
 * 的 `userFloorAreaVisibility`）：墙的边界是精确的，不随房间大小变糊。
 *
 * 只有灯带位姿、影响范围或墙体变了才重画对应的行；亮度渐变不会触发。
 * 坐标全部是世界空间；楼层堆叠动画会让墙的世界矩阵变化，这时按墙的矩阵签名重新收集线段。
 */
import {
  projectMeshTriangles,
  segmentsWithin,
  type OccluderMesh,
  type Scratch,
  type VisibilityRenderer,
  type VisibilityThree,
} from '../../../plan/studio-region-wall-visibility'

/** 每行开头存射线起点的像素数：`(o0.xz, o1.xz)`、`(o2.xz, 起点数, 影响半径)`。 */
export const STRIP_VISIBILITY_HEADER = 2
/** 方位角分格数；行宽 = 表头 + 分格 = 2048，WebGL2 保证的最小纹理边长。 */
export const STRIP_VISIBILITY_ANGLES = 2046
const STRIP_VISIBILITY_WIDTH = STRIP_VISIBILITY_HEADER + STRIP_VISIBILITY_ANGLES
/** 这个方向上没有墙。 */
const STRIP_NO_HIT = 1e4
/** 影响半径上限（米），与 `stripInfluenceRadius` 的上限一致。 */
const STRIP_MAX_INFLUENCE = 12
/** 射线起点沿水平出光方向前移的距离：洗墙灯带贴墙安装，起点不能落在墙里。 */
const STRIP_ORIGIN_LIFT = 0.05
/** 两端起点往里收的距离：灯带常常顶到两头的墙，端点不能落进墙里。 */
const STRIP_END_INSET = 0.1

/** 墙要从地面起连续这么高才挡光：门洞过梁、窗台下的矮墙都不算。 */
const MIN_OCCLUDER_HEIGHT = 1.2
const FLOOR_TOLERANCE = 0.1
/** 合并同一条墙线的高度区间时允许的缝隙（米）：相邻墙带之间的浮点误差。 */
const STACK_GAP = 0.02
/** 墙线端点的量化步长（米），同一面墙各层墙带的投影落到同一个键上。 */
const SEGMENT_KEY_STEP = 0.01
/**
 * 忽略比这更近的墙命中（米）。
 *
 * 灯带贴墙安装时起点会擦到墙面三角网，第一下命中只有几厘米；当真遮挡会把同房间
 * 乘成 0。阈值必须小于墙厚（默认 0.2 m），否则会把整堵墙「看穿」漏到隔壁。
 */
const MIN_WALL_HIT = 0.05

type Elements = ArrayLike<number>

export interface StripVisibilityLight {
  uuid?: string
  width?: number
  matrixWorld?: { elements: Elements }
  userData?: Record<string, unknown>
}

interface StripVisibilityMesh {
  isMesh?: boolean
  userData?: Record<string, unknown>
}

/** 灯带在图集里的行号。 */
export interface StripVisibilityTile {
  tile: number
}

interface StripTexture {
  image: { data: Float32Array }
  minFilter: number
  magFilter: number
  generateMipmaps: boolean
  needsUpdate: boolean
  dispose(): void
}

interface FloorRecord {
  meshes: OccluderMesh[]
  segments: Float32Array | null
  signature: string
}

interface TileRecord extends StripVisibilityTile {
  key: string
}

type StripVisibilityThree = Pick<VisibilityThree, 'Vector3' | 'Matrix4'> & {
  Vector2: new (x: number, y: number) => { x: number; y: number; set(x: number, y: number): unknown }
  DataTexture: new (data: Float32Array, width: number, height: number, format: number, type: number) => StripTexture
  RGBAFormat: number
  FloatType: number
  NearestFilter: number
}

/** 墙线的键：端点量化后按字典序排好，两个方向投影出来的同一条线落到同一个键。 */
function segmentKey(triangles: number[], offset: number) {
  const q = (value: number) => Math.round(value / SEGMENT_KEY_STEP),
    a = `${q(triangles[offset])},${q(triangles[offset + 1])}`,
    b = `${q(triangles[offset + 2])},${q(triangles[offset + 3])}`
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/** 高度区间按下沿排序后，从地面起连续覆盖到的最高点。 */
function contiguousTop(intervals: number[][], floorY: number) {
  intervals.sort((first, second) => first[0] - second[0])
  if (intervals[0][0] > floorY + FLOOR_TOLERANCE) return floorY
  let top = floorY
  for (const [bottom, upper] of intervals) {
    if (bottom > top + STACK_GAP) break
    top = Math.max(top, upper)
  }
  return top
}

/**
 * 本层墙带投影成 `[ax, az, bx, bz]` 线段。
 *
 * 编辑器的墙是一层层 0.2 m 高的墙带叠起来的（每层一个网格），单个三角形永远不够高；
 * 所以先把投影到同一条墙线上的三角形高度区间合并，再判断是否「从地面起连续够高」。
 */
function collectStackedSegments(meshes: OccluderMesh[], scratch: Scratch) {
  const triangles: number[] = [],
    lines = new Map<string, { offset: number; intervals: number[][] }>(),
    segments: number[] = []
  for (const mesh of meshes) projectMeshTriangles(mesh, null, scratch, triangles)
  let floorY = Infinity
  for (let offset = 0; offset < triangles.length; offset += 6) floorY = Math.min(floorY, triangles[offset + 4])
  for (let offset = 0; offset < triangles.length; offset += 6) {
    if (triangles[offset + 5] - triangles[offset + 4] < STACK_GAP) continue
    const key = segmentKey(triangles, offset),
      line = lines.get(key) || { offset, intervals: [] }
    line.intervals.push([triangles[offset + 4], triangles[offset + 5]])
    lines.set(key, line)
  }
  for (const { offset, intervals } of lines.values())
    if (contiguousTop(intervals, floorY) - floorY >= MIN_OCCLUDER_HEIGHT - STACK_GAP)
      segments.push(...triangles.slice(offset, offset + 4))
  return new Float32Array(segments)
}

/** 墙带世界矩阵的签名：楼层堆叠 / 旋转户型时变化，线段要重新投影。 */
function meshesSignature(meshes: OccluderMesh[]) {
  const first = meshes[0] as (OccluderMesh & { matrixWorld: { elements?: Elements } }) | undefined,
    elements = first?.matrixWorld?.elements
  if (!elements) return String(meshes.length)
  return [meshes.length, elements[0], elements[2], elements[12], elements[13], elements[14]]
    .map((value) => Number(value).toFixed(3))
    .join(',')
}

/**
 * 灯带的射线起点（世界 xz）：中心 + 两端（各往里收一点）；竖装灯带两端在同一竖线上，只留中心。
 * 起点沿出光方向的水平分量前移一点，避免贴墙安装时起点落进墙体。
 */
export function stripRayOrigins(elements: Elements, width: number) {
  const axisX = elements[0],
    axisY = elements[1],
    axisZ = elements[2],
    axisLength = Math.hypot(axisX, axisY, axisZ) || 1,
    emitX = -elements[8],
    emitZ = -elements[10],
    emitHorizontal = Math.hypot(emitX, emitZ),
    liftX = emitHorizontal > 0.2 ? (emitX / emitHorizontal) * STRIP_ORIGIN_LIFT : 0,
    liftZ = emitHorizontal > 0.2 ? (emitZ / emitHorizontal) * STRIP_ORIGIN_LIFT : 0,
    centerX = elements[12] + liftX,
    centerZ = elements[14] + liftZ,
    halfLength = Math.max(Number(width) || 0, 0) / 2,
    inset = Math.max(halfLength - STRIP_END_INSET, halfLength * 0.5),
    endX = (axisX / axisLength) * inset,
    endZ = (axisZ / axisLength) * inset
  if (Math.hypot(endX, endZ) < 0.05) return [[centerX, centerZ]]
  return [
    [centerX, centerZ],
    [centerX - endX, centerZ - endZ],
    [centerX + endX, centerZ + endZ],
  ]
}

/** 从起点沿 `(dirX, dirZ)` 出发第一次碰到墙线的距离；碰不到返回 `STRIP_NO_HIT`。 */
function firstWallHit(segments: ArrayLike<number>, origin: number[], dirX: number, dirZ: number) {
  let nearest = STRIP_NO_HIT
  for (let offset = 0; offset < segments.length; offset += 4) {
    const ax = segments[offset],
      az = segments[offset + 1],
      segmentX = segments[offset + 2] - ax,
      segmentZ = segments[offset + 3] - az,
      denominator = dirX * segmentZ - dirZ * segmentX
    if (Math.abs(denominator) < 1e-9) continue
    const toStartX = ax - origin[0],
      toStartZ = az - origin[1],
      alongRay = (toStartX * segmentZ - toStartZ * segmentX) / denominator,
      alongSegment = (toStartX * dirZ - toStartZ * dirX) / denominator
    // 比墙厚还近的命中几乎一定是「起点落在墙里」，不能拿来挡同房间的光。
    if (alongRay > MIN_WALL_HIT && alongRay < nearest && alongSegment >= 0 && alongSegment <= 1) nearest = alongRay
  }
  return nearest
}

/** 第 `bin` 格的方位角（弧度，`atan2(z, x)` 的取值范围 [-π, π]，取格子中心）。 */
function stripBinAngle(bin: number) {
  return ((bin + 0.5) / STRIP_VISIBILITY_ANGLES) * 2 * Math.PI - Math.PI
}

/** 画一行：表头写起点和影响半径，各分格的 r/g/b 写三个起点的碰墙距离。 */
function paintStripRow(
  data: Float32Array,
  row: number,
  origins: number[][],
  segments: ArrayLike<number>,
  radius: number,
) {
  const base = row * STRIP_VISIBILITY_WIDTH * 4
  data.fill(0, base, base + STRIP_VISIBILITY_WIDTH * 4)
  origins.forEach(([x, z], index) => {
    const header = base + index * 2
    ;(data[header] = x), (data[header + 1] = z)
  })
  ;(data[base + 6] = origins.length), (data[base + 7] = radius)
  for (let bin = 0; bin < STRIP_VISIBILITY_ANGLES; bin++) {
    const angle = stripBinAngle(bin),
      dirX = Math.cos(angle),
      dirZ = Math.sin(angle),
      texel = base + (STRIP_VISIBILITY_HEADER + bin) * 4
    origins.forEach((origin, index) => (data[texel + index] = firstWallHit(segments, origin, dirX, dirZ)))
  }
}

function influenceRadius(light: StripVisibilityLight) {
  const radius = Number(light.userData?.stripInfluenceRadius)
  return Number.isFinite(radius) && radius > 0 ? Math.min(radius, STRIP_MAX_INFLUENCE) : STRIP_MAX_INFLUENCE
}

/** 本层墙带线段；墙的世界矩阵变了就重新投影，并让所有行重画。 */
function floorSegments(record: FloorRecord | undefined, scratch: Scratch, invalidateTiles: () => void) {
  if (!record?.meshes.length) return null
  const signature = meshesSignature(record.meshes)
  if (!record.segments || record.signature !== signature) {
    ;(record.segments = collectStackedSegments(record.meshes, scratch)), (record.signature = signature)
    invalidateTiles()
  }
  return record.segments.length ? record.segments : null
}

/** 灯带位姿或影响半径变了才重画它那一行；返回是否画过。 */
function repaintLightRow(
  data: Float32Array,
  tile: TileRecord,
  light: StripVisibilityLight,
  elements: Elements,
  segments: Float32Array,
) {
  const width = Number(light.width) || 0,
    radius = influenceRadius(light),
    origins = stripRayOrigins(elements, width),
    // 出光轴 / 长度轴也进缓存键：原地扭转而不动中心时也要重画。
    key = [radius, elements[0], elements[2], elements[8], elements[10], ...origins.flat()]
      .map((v) => Number(v).toFixed(3))
      .join(',')
  if (tile.key === key) return false
  tile.key = key
  const reach = radius + width / 2 + STRIP_ORIGIN_LIFT,
    [centerX, centerZ] = origins[0]
  paintStripRow(
    data,
    tile.tile,
    origins,
    segmentsWithin(segments, [centerX - reach, centerX + reach, centerZ - reach, centerZ + reach]),
    radius,
  )
  return true
}

function createBlankTexture(THREE: StripVisibilityThree, width: number, height: number) {
  const texture = new THREE.DataTexture(
    new Float32Array(width * height * 4),
    width,
    height,
    THREE.RGBAFormat,
    THREE.FloatType,
  )
  ;(texture.minFilter = texture.magFilter = THREE.NearestFilter),
    (texture.generateMipmaps = false),
    (texture.needsUpdate = true)
  return texture
}

/** 一行一条灯带的浮点图集：放不下时容量翻倍（受最大纹理边长限制），换纹理后由调用方重画。 */
function createRowAtlas(THREE: StripVisibilityThree, renderer: VisibilityRenderer | null | undefined) {
  const maxTextureSize = Number(renderer?.capabilities?.maxTextureSize) || 4096,
    maxCapacity = maxTextureSize >= STRIP_VISIBILITY_WIDTH ? maxTextureSize : 0,
    // 先挂 1×1 占位图：材质编译时 sampler 不能是 null，否则 WebGL 报警、个别驱动整段面光丢掉。
    // layout.x = 0 时着色器仍跳过遮挡采样。
    texture = { value: createBlankTexture(THREE, 1, 1) as StripTexture | null },
    /** x = 行数（0 = 不做遮挡），y = 方位角分格数。 */
    layout = { value: new THREE.Vector2(0, STRIP_VISIBILITY_ANGLES) }
  let capacity = 0
  return {
    texture,
    layout,
    /** 返回 true 表示已经换了一张新纹理。 */
    grow(required: number) {
      const nextCapacity = Math.min(maxCapacity, Math.max(4, capacity * 2, required))
      if (required <= capacity || nextCapacity < required) return false
      texture.value?.dispose()
      ;(texture.value = createBlankTexture(THREE, STRIP_VISIBILITY_WIDTH, nextCapacity)),
        (capacity = nextCapacity),
        layout.value.set(capacity, STRIP_VISIBILITY_ANGLES)
      return true
    },
    fits: (required: number) => required <= capacity,
    dispose() {
      // 仍挂 1×1 占位：材质可能晚一帧才拆，sampler 不能回到 null。
      texture.value?.dispose()
      ;(texture.value = createBlankTexture(THREE, 1, 1)), (capacity = 0)
      layout.value.set(0, STRIP_VISIBILITY_ANGLES)
    },
  }
}

export function createStripWallVisibility(
  THREE: StripVisibilityThree,
  renderer: VisibilityRenderer | null | undefined,
  ltc: { ltc1: unknown; ltc2: unknown } = { ltc1: null, ltc2: null },
) {
  const floors = new Map<string, FloorRecord>(),
    tiles = new Map<string, TileRecord>(),
    scratch: Scratch = { vertex: new THREE.Vector3(), matrix: new THREE.Matrix4() },
    atlas = createRowAtlas(THREE, renderer),
    invalidateTiles = () => tiles.forEach((tile) => (tile.key = ''))

  /** 这盏灯的行；新灯放不下图集时返回 null。 */
  function tileFor(light: StripVisibilityLight) {
    const lightKey = String(light.uuid || ''),
      existing = tiles.get(lightKey)
    if (existing) return existing
    if (!atlas.fits(tiles.size + 1)) {
      if (!atlas.grow(tiles.size + 1)) return null
      invalidateTiles()
    }
    const tile: TileRecord = { tile: tiles.size, key: '' }
    tiles.set(lightKey, tile)
    return tile
  }

  return {
    /** 面光要用的全部 uniform：LTC 查找表 + 遮挡距离图集。 */
    uniforms: {
      userLtc1: { value: ltc.ltc1 },
      userLtc2: { value: ltc.ltc2 },
      userStripVisibility: atlas.texture,
      userStripVisibilityLayout: atlas.layout,
    },
    /** 场景结构变了（楼层缓冲重扫时调用）：按楼层重收墙带，丢掉所有行分配。 */
    prepare(meshes: ReadonlyArray<{ object: StripVisibilityMesh; floor: string }>) {
      floors.clear(), tiles.clear()
      for (const { object, floor } of meshes) {
        if (object.userData?.lightOccluder !== true) continue
        let record = floors.get(floor)
        if (!record) floors.set(floor, (record = { meshes: [], segments: null, signature: '' }))
        record.meshes.push(object as unknown as OccluderMesh)
      }
    },
    /** 取（必要时重画）一条灯带的行；null 表示不做墙体遮挡（本层没有墙、图集放不下）。 */
    lookup(light: StripVisibilityLight, floorId: string): StripVisibilityTile | null {
      const elements = light.matrixWorld?.elements,
        segments = elements ? floorSegments(floors.get(floorId), scratch, invalidateTiles) : null,
        tile = segments ? tileFor(light) : null,
        texture = atlas.texture.value
      if (!elements || !segments || !tile || !texture) return null
      if (repaintLightRow(texture.image.data, tile, light, elements, segments)) texture.needsUpdate = true
      return tile
    },
    dispose() {
      atlas.dispose(), floors.clear(), tiles.clear()
    },
  }
}
