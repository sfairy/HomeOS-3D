/**
 * 区域灯光空间网格（0.7.8 `studio-region-grid`）。
 *
 * 把每层楼的区域灯投影到 8×8 的 2D 网格，shader 里先查网格拿到候选
 * 灯索引，再只遍历候选灯，避免每像素遍历全部灯槽。
 * 网格纹理每行 = `1 + capacity` 个 float：
 *   [0] 候选数量，[1..] 候选灯槽索引（-1 表示空位）。
 */

/** 网格边长（格子数），需与 shader 里的常量保持一致。 */
export const REGION_GRID_SIZE = 8

/**
 * 填充区域灯网格。
 *
 * @param slots           灯槽数组（`{ center, extent, axis }`）
 * @param lightCount      本层有效灯数
 * @param capacity        灯槽容量（对齐到 16）
 * @param gridData        网格 Float32Array，长度 `capacity + 1) * REGION_GRID_SIZE²`
 * @param gridBounds      输出 `Vector4(minX, minZ, 1/width, 1/depth)`
 * @returns 是否成功填充；存在非有限值时返回 false
 */
export function fillRegionGrid(
  slots: any,
  lightCount: any,
  capacity: any,
  gridData: Float32Array,
  gridBounds: any,
): boolean {
  const projectedRects: number[][] = []
  let minX = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxZ = -Infinity
  for (let slotIndex = 0; slotIndex < lightCount; slotIndex++) {
    const { center, extent, axis } = slots[slotIndex]
    if (center.w < 0.00001) continue
    // 线光源（strip）沿 z 轴展开，需要把长度算进矩形范围。
    const halfWidth = Math.max(extent.x, 0.001) + (axis.z > 0.5 && axis.z < 1.5 ? Math.max(extent.z, 0.001) : 0),
      halfDepth = Math.max(extent.z, 0.001),
      projectedHalfWidth = Math.abs(axis.x) * halfWidth + Math.abs(axis.y) * halfDepth,
      projectedHalfDepth = Math.abs(axis.y) * halfWidth + Math.abs(axis.x) * halfDepth,
      epsilon = Math.max(1, Math.abs(center.x), Math.abs(center.z), projectedHalfWidth, projectedHalfDepth) * 0.00001,
      rect = [
        center.x - projectedHalfWidth - epsilon,
        center.z - projectedHalfDepth - epsilon,
        center.x + projectedHalfWidth + epsilon,
        center.z + projectedHalfDepth + epsilon,
        slotIndex,
      ]
    if (!rect.every(Number.isFinite)) return false
    projectedRects.push(rect)
    ;(minX = Math.min(minX, rect[0])),
      (minZ = Math.min(minZ, rect[1])),
      (maxX = Math.max(maxX, rect[2])),
      (maxZ = Math.max(maxZ, rect[3]))
  }

  gridData.fill(0)
  if (!projectedRects.length) {
    gridBounds.set(0, 0, 1, 1)
    return true
  }

  // 行宽必须等于网格纹理宽度 `capacity + 1`（见 `studio-plan2-region-lights.ts`
  // 里 DataTexture 的构造）。这里曾误写成 `REGION_GRID_SIZE + 1`：只要本层有灯，
  // `capacity = alignTo16(n)` 就 ≥ 16，于是每行都错位，shader 读到的候选数全是 0，
  // 整层区域灯直接不发光的假象就是这么来的。
  const stride = capacity + 1,
    scaleX = REGION_GRID_SIZE / Math.max(maxX - minX, 0.001),
    scaleZ = REGION_GRID_SIZE / Math.max(maxZ - minZ, 0.001)
  gridBounds.set(minX, minZ, scaleX, scaleZ)
  const toCell = (value: number) => Math.max(0, Math.min(REGION_GRID_SIZE - 1, Math.floor(value)))

  for (const [left, bottom, right, top, slotIndex] of projectedRects)
    for (let cellZ = toCell((bottom - minZ) * scaleZ); cellZ <= toCell((top - minZ) * scaleZ); cellZ++)
      for (let cellX = toCell((left - minX) * scaleX); cellX <= toCell((right - minX) * scaleX); cellX++) {
        // 每行首列存候选数量，后续列按数量追加灯槽索引。
        const rowOffset = (cellZ * REGION_GRID_SIZE + cellX) * stride
        gridData[rowOffset + ++gridData[rowOffset]] = slotIndex
      }
  return true
}

/**
 * 区域灯（轻量柔光）的墙体遮挡。
 *
 * 区域灯只是按灯心画的椭圆/矩形亮区，本身没有任何遮挡信息：亮区越过墙，就照进了隔壁房间。
 * 这里在 CPU 上给每盏灯烘一张 `WALL_VISIBILITY_SIZE²` 的俯视可见性图（灯心到格子中心的
 * 连线是否穿过墙），着色器每盏灯多采样一次。只有灯的位置/范围或墙体结构变了才重算，
 * 灯光渐变（只改亮度）不会触发。
 *
 * 墙体取墙带（`userData.lightOccluder`）里「从地面起、高度不低于 `MIN_OCCLUDER_HEIGHT`」
 * 的竖直三角形，投影成 2D 线段：门洞上方的过梁从门顶才开始，不会把门堵上；
 * 窗台以下那截矮墙也不算，所以室内窗不挡光。
 *
 * 所有坐标都在区域灯的「布局空间」里（楼层过渡动画期间也不动），所以线段算一次可以一直复用。
 *
 * 本项目的 three 是浏览器直载的外部模块，编译期只有宽泛的影子声明，所以这里用最小结构化
 * 接口描述用到的部分。
 */

/** 每盏灯可见性图的边长（格子数），需与着色器里的 `PLAN2_VISIBILITY_SIZE` 一致。 */
export const WALL_VISIBILITY_SIZE = 32
const MIN_OCCLUDER_HEIGHT = 1.2
const FLOOR_TOLERANCE = 0.1

export interface VisibilityMatrix {
  copy(matrix: VisibilityMatrix): VisibilityMatrix
  premultiply(matrix: VisibilityMatrix): VisibilityMatrix
}

interface VisibilityAttribute {
  count: number
}

interface VisibilityVector {
  x: number
  y: number
  z: number
  fromBufferAttribute(attribute: VisibilityAttribute, index: number): VisibilityVector
  applyMatrix4(matrix: VisibilityMatrix): VisibilityVector
}

export interface VisibilityTexture {
  image: { data: Uint8Array }
  minFilter: number
  magFilter: number
  generateMipmaps: boolean
  needsUpdate: boolean
  dispose(): void
}

export interface VisibilityThree {
  Vector3: new () => VisibilityVector
  Matrix4: new () => VisibilityMatrix
  DataTexture: new (data: Uint8Array, width: number, height: number, format: number, type: number) => VisibilityTexture
  RedFormat: number
  UnsignedByteType: number
  LinearFilter: number
}

export interface VisibilityRenderer {
  capabilities?: { maxTextureSize?: number; maxTextures?: number }
}

export interface OccluderMesh {
  geometry?: {
    attributes?: { position?: VisibilityAttribute }
    index?: { count: number; getX(index: number): number } | null
  }
  matrixWorld: VisibilityMatrix
  userData?: { lightOccluder?: boolean }
  updateWorldMatrix(updateParents: boolean, updateChildren: boolean): void
}

interface RegionLike {
  center: number[]
  lampCenter: number[]
  width: number
  depth: number
  defaults: { axis: number[] }
}

interface FloorVisibility {
  meshes: OccluderMesh[]
  segments: Float32Array | null
  texture: VisibilityTexture | null
  capacity: number
  uniform: { value: VisibilityTexture | null }
  keys: string[]
}

export interface Scratch {
  vertex: VisibilityVector
  matrix: VisibilityMatrix
}

/** `[minX, maxX, minZ, maxZ]` */
export type Bounds = [number, number, number, number]

/** 三角形三个顶点投影后相距最远的一对，当作这块竖直墙面的 2D 线段。 */
function longestEdge(corners: number[]) {
  let best = [0, 1],
    bestLength = -1
  for (const [cornerA, cornerB] of [
    [0, 1],
    [1, 2],
    [0, 2],
  ]) {
    const length = Math.hypot(
      corners[cornerA * 2] - corners[cornerB * 2],
      corners[cornerA * 2 + 1] - corners[cornerB * 2 + 1],
    )
    if (length > bestLength) (best = [cornerA, cornerB]), (bestLength = length)
  }
  return { best, bestLength }
}

/** 把一个网格的三角形逐个投影，按 `[ax, az, bx, bz, minY, maxY]` 追加到 `out`。 */
export function projectMeshTriangles(
  mesh: OccluderMesh,
  motionMatrix: VisibilityMatrix | null,
  scratch: Scratch,
  out: number[],
) {
  const position = mesh.geometry?.attributes?.position,
    index = mesh.geometry?.index
  if (!position) return
  mesh.updateWorldMatrix(true, false), scratch.matrix.copy(mesh.matrixWorld)
  if (motionMatrix) scratch.matrix.premultiply(motionMatrix)
  const vertexCount = index ? index.count : position.count
  for (let first = 0; first + 2 < vertexCount; first += 3) {
    const corners: number[] = []
    let minY = Infinity,
      maxY = -Infinity
    for (let corner = 0; corner < 3; corner++) {
      const vertex = scratch.vertex.fromBufferAttribute(position, index ? index.getX(first + corner) : first + corner)
      vertex.applyMatrix4(scratch.matrix), corners.push(vertex.x, vertex.z)
      ;(minY = Math.min(minY, vertex.y)), (maxY = Math.max(maxY, vertex.y))
    }
    const { best, bestLength } = longestEdge(corners)
    if (bestLength < 0.0001) continue
    out.push(corners[best[0] * 2], corners[best[0] * 2 + 1], corners[best[1] * 2], corners[best[1] * 2 + 1], minY, maxY)
  }
}

/** 把本层墙带里够高、从地面起的竖直三角形投影成 `[ax, az, bx, bz]` 线段。 */
export function collectSegments(meshes: OccluderMesh[], motionMatrix: VisibilityMatrix | null, scratch: Scratch) {
  const triangles: number[] = [],
    segments: number[] = []
  for (const mesh of meshes) projectMeshTriangles(mesh, motionMatrix, scratch, triangles)
  let floorY = Infinity
  for (let offset = 0; offset < triangles.length; offset += 6) floorY = Math.min(floorY, triangles[offset + 4])
  for (let offset = 0; offset < triangles.length; offset += 6) {
    const minY = triangles[offset + 4],
      isTallFromFloor = minY <= floorY + FLOOR_TOLERANCE && triangles[offset + 5] - minY >= MIN_OCCLUDER_HEIGHT
    if (isTallFromFloor) segments.push(...triangles.slice(offset, offset + 4))
  }
  return new Float32Array(segments)
}

/** 从 (originX, originZ) 到 (pointX, pointZ) 的连线是否被墙挡住；终点 `tolerance` 以内的交点不算。 */
export function isBlocked(segments: number[], origin: number[], pointX: number, pointZ: number, tolerance: number) {
  const [originX, originZ] = origin,
    rayX = pointX - originX,
    rayZ = pointZ - originZ,
    rayLength = Math.hypot(rayX, rayZ)
  if (rayLength < 0.0001) return false
  const endLimit = 1 - tolerance / rayLength
  for (let offset = 0; offset < segments.length; offset += 4) {
    const ax = segments[offset],
      az = segments[offset + 1],
      segmentX = segments[offset + 2] - ax,
      segmentZ = segments[offset + 3] - az,
      denominator = rayX * segmentZ - rayZ * segmentX
    if (Math.abs(denominator) < 1e-9) continue
    const toStartX = ax - originX,
      toStartZ = az - originZ,
      alongRay = (toStartX * segmentZ - toStartZ * segmentX) / denominator,
      alongSegment = (toStartX * rayZ - toStartZ * rayX) / denominator
    if (alongRay > 0.0005 && alongRay < endLimit && alongSegment >= 0 && alongSegment <= 1) return true
  }
  return false
}

/** 射线起点：灯心；灯带再加两端，结果取平均。 */
function rayOrigins(region: RegionLike, isStrip: boolean, halfWidth: number) {
  const [lampX, , lampZ] = region.lampCenter,
    [axisX, axisZ] = region.defaults.axis
  if (!isStrip || !(halfWidth > 0)) return [[lampX, lampZ]]
  const stripX = axisX * halfWidth,
    stripZ = axisZ * halfWidth
  return [
    [lampX, lampZ],
    [lampX - stripX, lampZ - stripZ],
    [lampX + stripX, lampZ + stripZ],
  ]
}

/** 可见性图覆盖的范围，并扩到包住所有射线起点。 */
function mapBounds(region: RegionLike, halfSize: number, origins: number[][]): Bounds {
  const [centerX, , centerZ] = region.center,
    xs = [centerX - halfSize, centerX + halfSize, ...origins.map((origin) => origin[0])],
    zs = [centerZ - halfSize, centerZ + halfSize, ...origins.map((origin) => origin[1])]
  return [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]
}

export function segmentsWithin(segments: Float32Array, [minX, maxX, minZ, maxZ]: Bounds) {
  const nearby: number[] = []
  for (let offset = 0; offset < segments.length; offset += 4) {
    const [ax, az, bx, bz] = segments.subarray(offset, offset + 4),
      overlapsX = Math.max(ax, bx) >= minX && Math.min(ax, bx) <= maxX,
      overlapsZ = Math.max(az, bz) >= minZ && Math.min(az, bz) <= maxZ
    if (overlapsX && overlapsZ) nearby.push(ax, az, bx, bz)
  }
  return nearby
}

/** 逐格写入可见比例（0~255）：格子中心被几成射线起点直接看到。 */
function paintVisibility(
  data: Uint8Array,
  slotIndex: number,
  region: RegionLike,
  halfSize: number,
  origins: number[][],
  segments: number[],
) {
  const [centerX, , centerZ] = region.center,
    base = slotIndex * WALL_VISIBILITY_SIZE * WALL_VISIBILITY_SIZE,
    cellSize = (halfSize * 2) / WALL_VISIBILITY_SIZE,
    // 格子中心落在墙体内部时，不能因为穿过墙的近侧面就判成全黑，否则墙根一圈都会发暗。
    tolerance = cellSize * 0.5
  for (let row = 0; row < WALL_VISIBILITY_SIZE; row++)
    for (let column = 0; column < WALL_VISIBILITY_SIZE; column++) {
      const pointX = centerX - halfSize + (column + 0.5) * cellSize,
        pointZ = centerZ - halfSize + (row + 0.5) * cellSize,
        visible = origins.filter((origin) => !isBlocked(segments, origin, pointX, pointZ, tolerance)).length
      data[base + row * WALL_VISIBILITY_SIZE + column] = Math.round((255 * visible) / origins.length)
    }
}

function createVisibilityTexture(THREE: VisibilityThree, capacity: number) {
  const texture = new THREE.DataTexture(
    new Uint8Array(WALL_VISIBILITY_SIZE * WALL_VISIBILITY_SIZE * capacity).fill(255),
    WALL_VISIBILITY_SIZE,
    WALL_VISIBILITY_SIZE * capacity,
    THREE.RedFormat,
    THREE.UnsignedByteType,
  )
  ;(texture.minFilter = texture.magFilter = THREE.LinearFilter), (texture.generateMipmaps = false)
  texture.needsUpdate = true
  return texture
}

function supportsCapacity(renderer: VisibilityRenderer | null | undefined, capacity: number) {
  const maxTextureSize = Number(renderer?.capabilities?.maxTextureSize) || 4096,
    maxTextures = Number(renderer?.capabilities?.maxTextures) || 16
  return capacity > 0 && capacity * WALL_VISIBILITY_SIZE <= maxTextureSize && maxTextures >= 16
}

export function createRegionWallVisibility(THREE: VisibilityThree, renderer: VisibilityRenderer | null | undefined) {
  const floors = new Map<string, FloorVisibility>(),
    scratch: Scratch = { vertex: new THREE.Vector3(), matrix: new THREE.Matrix4() }

  function floorRecord(floorId: string) {
    let record = floors.get(floorId)
    if (!record) {
      record = { meshes: [], segments: null, texture: null, capacity: 0, uniform: { value: null }, keys: [] }
      floors.set(floorId, record)
    }
    return record
  }

  return {
    /** 本层所有区域灯材质共享的可见性纹理 uniform（三类受光体共用同一份）。 */
    uniform: (floorId: string) => floorRecord(floorId).uniform,
    /** 按灯槽容量（重）建纹理；返回本层是否启用墙体遮挡（决定着色器里的分支是否编进去）。 */
    resize(floorId: string, capacity: number) {
      const record = floorRecord(floorId)
      if (record.capacity === capacity) return !!record.texture
      record.texture?.dispose()
      ;(record.capacity = capacity), (record.keys = [])
      record.texture = record.uniform.value = supportsCapacity(renderer, capacity)
        ? createVisibilityTexture(THREE, capacity)
        : null
      return !!record.texture
    },
    /** 结构重扫开始：清掉上一轮收集的墙带与线段缓存。 */
    resetOccluders() {
      for (const record of floors.values()) (record.meshes.length = 0), (record.segments = null), (record.keys = [])
    },
    addOccluder(mesh: OccluderMesh, floorId: string) {
      if (mesh.userData?.lightOccluder === true) floorRecord(floorId).meshes.push(mesh)
    },
    /**
     * 重算一盏灯的可见性图，返回图的半边长（写进灯槽 `color.w`）；0 表示这盏灯不做遮挡。
     * 图以亮区中心为中心、覆盖整个亮区。
     */
    update(
      floorId: string,
      slotIndex: number,
      region: RegionLike,
      motionMatrix: VisibilityMatrix | null,
      isStrip = false,
      halfWidth = 0,
    ) {
      const record = floors.get(floorId),
        halfSize = Math.hypot(region.width / 2, region.depth / 2)
      if (!record?.texture || slotIndex >= record.capacity || !record.meshes.length || !(halfSize > 0.01)) return 0
      const origins = rayOrigins(region, isStrip, halfWidth),
        key = [halfSize, ...region.center, ...origins.flat()].map((value) => value.toFixed(3)).join(',')
      if (record.keys[slotIndex] === key) return halfSize
      record.segments ||= collectSegments(record.meshes, motionMatrix, scratch)
      if (!record.segments.length) return 0
      const nearby = segmentsWithin(record.segments, mapBounds(region, halfSize, origins))
      paintVisibility(record.texture.image.data, slotIndex, region, halfSize, origins, nearby)
      ;(record.keys[slotIndex] = key), (record.texture.needsUpdate = true)
      return halfSize
    },
    dispose() {
      for (const record of floors.values()) record.texture?.dispose()
      floors.clear()
    },
  }
}
