/**
 * 网格几何操作（纯函数，输入输出都是 `Float32Array` / `Uint32Array`）。
 *
 * 这一层的判定口径与审计脚本（`ops/checks/studio/audit_glb_geometry.mjs`）刻意分开实现：
 * 审计用只读解析做**独立复核**，这里用纯 JS 做修复循环里的快速迭代。两边的语义必须一致：
 * - **非流形边**按「位置焊接后的边」统计（法线/UV 缝合点不算断边）—— 一个闭合实体
 *   每条边恰好被 2 个面共用；薄片（叶片 / 地毯 / 玻璃）会有大量 1 面边，属合法例外。
 * - **壳数**按位置焊接后的连通分量统计。
 * - **有向体积**用散度定理；朝向反了会得到负数，可据此定位需要翻面的壳。
 *
 * 焊接键默认是「位置 + 法线 + UV」：只按位置焊会把硬边焊成软边（箱子会变成圆角的假象），
 * 只按位置统计拓扑才用 `positionOnly` 口径。
 */

/** 默认焊接容差：1e-5 m = 0.01 mm（米制世界坐标），足以合并导出器的重复顶点，又不会误合并近邻面。 */
export const DEFAULT_WELD_TOLERANCE = 1e-5

/** 位置键：按容差取整（`Math.round` 比 `toFixed` 快一个量级，668 个文件才跑得动）。 */
export function positionKey(x, y, z, tolerance = DEFAULT_WELD_TOLERANCE) {
  return `${Math.round(x / tolerance)},${Math.round(y / tolerance)},${Math.round(z / tolerance)}`
}

/**
 * 焊接重复顶点。
 *
 * @param {{positions: Float32Array, normals?: Float32Array, uvs?: Float32Array, indices: Uint32Array}} primitive
 * @param {{positionOnly?: boolean, tolerance?: number, uvTolerance?: number}} options
 * @returns {{primitive: object, removedVertices: number}}
 */
export function weldPrimitive(primitive, options = {}) {
  const {
    positionOnly = false,
    tolerance = DEFAULT_WELD_TOLERANCE,
    uvTolerance = 1e-4,
  } = options
  const { positions, normals, uvs, indices } = primitive
  const vertexCount = positions.length / 3
  const lookup = new Map()
  const remap = new Uint32Array(vertexCount)
  const nextPositions = []
  const nextNormals = normals ? [] : null
  const nextUvs = uvs ? [] : null
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const px = positions[vertex * 3]
    const py = positions[vertex * 3 + 1]
    const pz = positions[vertex * 3 + 2]
    let key = positionKey(px, py, pz, tolerance)
    if (!positionOnly && normals) {
      // 法线也参与键：位置相同但法线不同的顶点必须保留，否则硬边会被焊成圆角。
      key += `|${Math.round(normals[vertex * 3] * 1000)},${Math.round(normals[vertex * 3 + 1] * 1000)},${Math.round(normals[vertex * 3 + 2] * 1000)}`
    }
    if (!positionOnly && uvs) {
      key += `|${Math.round(uvs[vertex * 2] / uvTolerance)},${Math.round(uvs[vertex * 2 + 1] / uvTolerance)}`
    }
    let target = lookup.get(key)
    if (target === undefined) {
      target = nextPositions.length / 3
      lookup.set(key, target)
      nextPositions.push(px, py, pz)
      if (nextNormals) nextNormals.push(normals[vertex * 3], normals[vertex * 3 + 1], normals[vertex * 3 + 2])
      if (nextUvs) nextUvs.push(uvs[vertex * 2], uvs[vertex * 2 + 1])
    }
    remap[vertex] = target
  }
  const nextIndices = new Uint32Array(indices.length)
  for (let index = 0; index < indices.length; index += 1) nextIndices[index] = remap[indices[index]]
  return {
    primitive: {
      positions: new Float32Array(nextPositions),
      normals: nextNormals ? new Float32Array(nextNormals) : undefined,
      uvs: nextUvs ? new Float32Array(nextUvs) : undefined,
      indices: nextIndices,
    },
    removedVertices: vertexCount - nextPositions.length / 3,
    vertexCount: nextPositions.length / 3,
    remap,
  }
}

/** 三角形面积（世界单位²）。 */
export function triangleArea(positions, a, b, c) {
  const ax = positions[a * 3]
  const ay = positions[a * 3 + 1]
  const az = positions[a * 3 + 2]
  const abx = positions[b * 3] - ax
  const aby = positions[b * 3 + 1] - ay
  const abz = positions[b * 3 + 2] - az
  const acx = positions[c * 3] - ax
  const acy = positions[c * 3 + 1] - ay
  const acz = positions[c * 3 + 2] - az
  const crossX = aby * acz - abz * acy
  const crossY = abz * acx - abx * acz
  const crossZ = abx * acy - aby * acx
  return Math.hypot(crossX, crossY, crossZ) / 2
}

/**
 * 删除退化面（面积为 0 或出现重复顶点下标），并顺带按「位置 + 绕序」去重完全重叠面。
 *
 * @param {{positions: Float32Array, indices: Uint32Array}} primitive
 * @param {{mergeable?: boolean, areaEpsilon?: number}} options `mergeable` 为真时同时去掉未使用的顶点
 */
export function cleanTriangles(primitive, { mergeable = true, areaEpsilon = 1e-10 } = {}) {
  const { positions, indices } = primitive
  const kept = []
  const seen = new Set()
  let degenerate = 0
  let duplicated = 0
  for (let offset = 0; offset < indices.length; offset += 3) {
    const a = indices[offset]
    const b = indices[offset + 1]
    const c = indices[offset + 2]
    if (a === b || b === c || a === c) {
      degenerate += 1
      continue
    }
    if (triangleArea(positions, a, b, c) <= areaEpsilon) {
      degenerate += 1
      continue
    }
    const faceKey = [a, b, c].sort((left, right) => left - right).join(',')
    if (seen.has(faceKey)) {
      duplicated += 1
      continue
    }
    seen.add(faceKey)
    kept.push(a, b, c)
  }
  const nextIndices = new Uint32Array(kept)
  if (!mergeable) return { primitive: { ...primitive, indices: nextIndices }, degenerate, duplicated }
  const used = new Uint8Array(positions.length / 3)
  for (const index of nextIndices) used[index] = 1
  const remap = new Uint32Array(used.length)
  const nextPositions = []
  const nextNormals = primitive.normals ? [] : null
  const nextUvs = primitive.uvs ? [] : null
  for (let vertex = 0; vertex < used.length; vertex += 1) {
    if (!used[vertex]) continue
    remap[vertex] = nextPositions.length / 3
    nextPositions.push(positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2])
    if (nextNormals) nextNormals.push(primitive.normals[vertex * 3], primitive.normals[vertex * 3 + 1], primitive.normals[vertex * 3 + 2])
    if (nextUvs) nextUvs.push(primitive.uvs[vertex * 2], primitive.uvs[vertex * 2 + 1])
  }
  for (let index = 0; index < nextIndices.length; index += 1) nextIndices[index] = remap[nextIndices[index]]
  return {
    primitive: {
      positions: new Float32Array(nextPositions),
      normals: nextNormals ? new Float32Array(nextNormals) : undefined,
      uvs: nextUvs ? new Float32Array(nextUvs) : undefined,
      indices: nextIndices,
    },
    degenerate,
    duplicated,
  }
}

/**
 * 拓扑统计（按**位置焊接**口径）。
 *
 * @returns {{
 *   vertices: number, triangles: number, nonManifoldEdges: number, boundaryEdges: number,
 *   shells: number, boundaryLoops: number[][], signedVolume: number, eulerCharacteristic: number
 * }}
 */
export function analyzeTopology(primitive, { tolerance = DEFAULT_WELD_TOLERANCE } = {}) {
  const welded = weldPrimitive(primitive, { positionOnly: true, tolerance })
  const { indices: weldedIndices } = welded.primitive
  const weldedPositions = welded.primitive.positions
  const vertexCount = weldedPositions.length / 3
  const edgeCount = new Map()
  const directed = new Map()
  for (let offset = 0; offset < weldedIndices.length; offset += 3) {
    const triangle = [weldedIndices[offset], weldedIndices[offset + 1], weldedIndices[offset + 2]]
    for (let corner = 0; corner < 3; corner += 1) {
      const from = triangle[corner]
      const to = triangle[(corner + 1) % 3]
      const undirected = from < to ? `${from}|${to}` : `${to}|${from}`
      edgeCount.set(undirected, (edgeCount.get(undirected) ?? 0) + 1)
      directed.set(`${from}|${to}`, (directed.get(`${from}|${to}`) ?? 0) + 1)
    }
  }
  let nonManifoldEdges = 0
  let boundaryEdges = 0
  for (const count of edgeCount.values()) {
    if (count > 2) nonManifoldEdges += 1
    else if (count === 1) boundaryEdges += 1
  }
  const shells = countShells(weldedIndices, vertexCount)
  return {
    vertices: vertexCount,
    triangles: weldedIndices.length / 3,
    nonManifoldEdges,
    boundaryEdges,
    shells,
    boundaryLoops: boundaryLoops(weldedIndices),
    signedVolume: signedVolume(weldedPositions, weldedIndices),
    eulerCharacteristic: vertexCount - edgeCount.size + weldedIndices.length / 3,
  }
}

/** 连通分量数（按三角面串起来的顶点并查集）。 */
export function countShells(indices, vertexCount) {
  const parent = new Int32Array(vertexCount)
  for (let index = 0; index < vertexCount; index += 1) parent[index] = index
  const find = (node) => {
    let current = node
    while (parent[current] !== current) {
      parent[current] = parent[parent[current]]
      current = parent[current]
    }
    return current
  }
  const union = (left, right) => {
    const leftRoot = find(left)
    const rightRoot = find(right)
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot
  }
  for (let offset = 0; offset < indices.length; offset += 3) {
    union(indices[offset], indices[offset + 1])
    union(indices[offset + 1], indices[offset + 2])
  }
  const roots = new Set()
  for (let index = 0; index < indices.length; index += 1) roots.add(find(indices[index]))
  return roots.size
}

/** 边界环（只含 1 个面的边串成的闭合环），按顶点下标序列返回。 */
export function boundaryLoops(indices) {
  const edgeUse = new Map()
  const addEdge = (from, to) => {
    const key = from < to ? `${from}|${to}` : `${to}|${from}`
    const record = edgeUse.get(key) ?? { count: 0, from, to }
    record.count += 1
    edgeUse.set(key, record)
  }
  for (let offset = 0; offset < indices.length; offset += 3) {
    addEdge(indices[offset], indices[offset + 1])
    addEdge(indices[offset + 1], indices[offset + 2])
    addEdge(indices[offset + 2], indices[offset])
  }
  const adjacency = new Map()
  for (const record of edgeUse.values()) {
    if (record.count !== 1) continue
    if (!adjacency.has(record.from)) adjacency.set(record.from, [])
    if (!adjacency.has(record.to)) adjacency.set(record.to, [])
    adjacency.get(record.from).push(record.to)
    adjacency.get(record.to).push(record.from)
  }
  const visited = new Set()
  const loops = []
  for (const start of adjacency.keys()) {
    if (visited.has(start)) continue
    const stack = [start]
    const component = []
    visited.add(start)
    while (stack.length) {
      const node = stack.pop()
      component.push(node)
      for (const neighbour of adjacency.get(node) ?? []) {
        if (visited.has(neighbour)) continue
        visited.add(neighbour)
        stack.push(neighbour)
      }
    }
    if (component.length >= 3) loops.push(component)
  }
  return loops
}

/** 散度定理算有向体积（m³）。 */
export function signedVolume(positions, indices) {
  let volume = 0
  for (let offset = 0; offset < indices.length; offset += 3) {
    const a = indices[offset] * 3
    const b = indices[offset + 1] * 3
    const c = indices[offset + 2] * 3
    const ax = positions[a]
    const ay = positions[a + 1]
    const az = positions[a + 2]
    const bx = positions[b]
    const by = positions[b + 1]
    const bz = positions[b + 2]
    const cx = positions[c]
    const cy = positions[c + 1]
    const cz = positions[c + 2]
    volume +=
      (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
  }
  return volume
}

/** 投影多边形的有向面积（鞋带公式，取绝对值）。 */
function polygonArea(points) {
  let twice = 0
  for (let index = 0; index < points.length; index += 1) {
    const next = (index + 1) % points.length
    twice += points[index][0] * points[next][1] - points[next][0] * points[index][1]
  }
  return Math.abs(twice) / 2
}

/**
 * 平面洞补齐（**凸平面环**用中心扇形，非平面 / 非凸环跳过并报出来）。
 *
 * 为什么不用耳切：这批模型的洞基本都是矩形柜口、圆形扇孔、管口这类**凸平面环**，
 * 中心扇形三角形必然落在环内，不需要处理凹多边形；而耳切在近共线的短边上极易退化。
 * 非凸 / 曲面洞直接跳过，交给 Blender 探针或人工判断，避免硬补出一块翘面。
 *
 * 绕序：沿边界环的**有向边**走完一圈后反转，补洞面与相邻面朝向一致（法线朝外）。
 *
 * @returns {{primitive: object, filledLoops: number, skippedLoops: number, addedTriangles: number}}
 */
export function fillPlanarHoles(
  primitive,
  {
    planarityTolerance = 0.0015,
    maxLoopVertices = 64,
    minLoopVertices = 4,
    // 补洞的最小「洞面积占比」：孔洞小于整个 primitive 表面积的 0.4% 一律不补。
    // 实测空气净化器的进风格栅有 360 个 1–4cm² 的穿孔，照补会把格栅封成一块平板
    // （三角面 +41%）。真正的缺面（柜子丢一块板）面积远大于此。
    minLoopAreaRatio = 0.004,
    tolerance = DEFAULT_WELD_TOLERANCE,
  } = {},
) {
  const { positions, indices } = primitive
  const vertexCount = positions.length / 3
  // 拓扑用「位置代表点」口径，但**不动原有顶点**：补出来的三角形直接引用代表点下标，
  // 原始顶点、法线、UV 全部保留（否则补完洞整件会丢 UV / 硬边）。
  const representative = new Uint32Array(vertexCount)
  const lookup = new Map()
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const key = positionKey(positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2], tolerance)
    const existing = lookup.get(key)
    if (existing === undefined) {
      lookup.set(key, vertex)
      representative[vertex] = vertex
    } else {
      representative[vertex] = existing
    }
  }
  const remapped = new Uint32Array(indices.length)
  for (let index = 0; index < indices.length; index += 1) remapped[index] = representative[indices[index]]
  const loops = directedBoundaryLoops(remapped)
  let surfaceArea = 0
  for (let offset = 0; offset < indices.length; offset += 3) {
    surfaceArea += triangleArea(positions, indices[offset], indices[offset + 1], indices[offset + 2])
  }
  const minLoopArea = Math.max(surfaceArea * minLoopAreaRatio, tolerance * tolerance * 4)
  const extraPositions = []
  const extraNormals = []
  const extraIndices = []
  let filledLoops = 0
  let skippedLoops = 0
  for (const loop of loops) {
    // 3 个顶点的「环」不是洞，是开放边角的副产品（SimLab 导入件里大量存在）：
    // 补上去只会多出一片靠不住的面，所以最小环长默认 4。
    if (loop.length < minLoopVertices || loop.length > maxLoopVertices) {
      skippedLoops += 1
      continue
    }
    const points = loop.map((vertex) => [
      positions[vertex * 3],
      positions[vertex * 3 + 1],
      positions[vertex * 3 + 2],
    ])
    const plane = fitPlane(points)
    if (!plane) {
      skippedLoops += 1
      continue
    }
    const deviation = Math.max(
      ...points.map(
        (point) =>
          Math.abs(
            (point[0] - plane.origin[0]) * plane.normal[0] +
              (point[1] - plane.origin[1]) * plane.normal[1] +
              (point[2] - plane.origin[2]) * plane.normal[2],
          ),
      ),
    )
    if (deviation > planarityTolerance) {
      skippedLoops += 1
      continue
    }
    const basis = planeBasis(plane)
    const projected = points.map((point) => projectPoint(point, plane, basis))
    if (!isConvex(projected)) {
      skippedLoops += 1
      continue
    }
    // 面积闸门在凸性判定之后：投影多边形面积必须够大，否则就是穿孔/接缝，不补。
    if (polygonArea(projected) < minLoopArea) {
      skippedLoops += 1
      continue
    }
    const centroid = plane.origin
    const centroidIndex = vertexCount + extraPositions.length / 3
    extraPositions.push(...centroid)
    extraNormals.push(...plane.normal)
    // 反转边界走向：边界有向边来自相邻面，补洞面要反向绕才法线一致。
    for (let index = loop.length - 1; index >= 0; index -= 1) {
      const current = loop[index]
      const next = loop[(index - 1 + loop.length) % loop.length]
      if (current === next) continue
      extraIndices.push(centroidIndex, current, next)
    }
    filledLoops += 1
  }
  if (!extraIndices.length) return { primitive, filledLoops, skippedLoops, addedTriangles: 0 }
  const nextPositions = new Float32Array(positions.length + extraPositions.length)
  nextPositions.set(positions, 0)
  nextPositions.set(extraPositions, positions.length)
  const nextNormals = new Float32Array(positions.length + extraPositions.length)
  if (primitive.normals) nextNormals.set(primitive.normals, 0)
  nextNormals.set(extraNormals, positions.length)
  const nextUvs = primitive.uvs ? new Float32Array((vertexCount + extraPositions.length / 3) * 2) : undefined
  if (nextUvs && primitive.uvs) nextUvs.set(primitive.uvs, 0)
  return {
    primitive: {
      positions: nextPositions,
      normals: nextNormals,
      uvs: nextUvs,
      indices: new Uint32Array([...indices, ...extraIndices]),
    },
    filledLoops,
    skippedLoops,
    addedTriangles: extraIndices.length / 3,
  }
}

/** 有向边界环：每条边只被 1 个面用，按面里的走向 `from→to` 串成环。 */
export function directedBoundaryLoops(indices) {
  const edgeUse = new Map()
  for (let offset = 0; offset < indices.length; offset += 3) {
    const corners = [indices[offset], indices[offset + 1], indices[offset + 2]]
    for (let corner = 0; corner < 3; corner += 1) {
      const from = corners[corner]
      const to = corners[(corner + 1) % 3]
      const key = from < to ? `${from}|${to}` : `${to}|${from}`
      const record = edgeUse.get(key) ?? { count: 0, from, to }
      record.count += 1
      edgeUse.set(key, record)
    }
  }
  const outgoing = new Map()
  for (const record of edgeUse.values()) {
    if (record.count !== 1) continue
    if (!outgoing.has(record.from)) outgoing.set(record.from, [])
    outgoing.get(record.from).push(record.to)
  }
  const loops = []
  const consumed = new Set()
  for (const [start, targets] of outgoing) {
    for (const firstTarget of targets) {
      const edgeKey = `${start}>${firstTarget}`
      if (consumed.has(edgeKey)) continue
      const loop = [start]
      consumed.add(edgeKey)
      let current = firstTarget
      let guard = indices.length
      while (current !== start && guard > 0) {
        guard -= 1
        loop.push(current)
        const nextTargets = (outgoing.get(current) ?? []).filter(
          (target) => !consumed.has(`${current}>${target}`),
        )
        if (!nextTargets.length) break
        const next = nextTargets[0]
        consumed.add(`${current}>${next}`)
        current = next
      }
      if (current === start && loop.length >= 3) loops.push(loop)
    }
  }
  return loops
}

/** Newell 法线拟合平面：对平面环稳定，对近似平面环也够用。 */
function fitPlane(points) {
  let nx = 0
  let ny = 0
  let nz = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    nx += (current[1] - next[1]) * (current[2] + next[2])
    ny += (current[2] - next[2]) * (current[0] + next[0])
    nz += (current[0] - next[0]) * (current[1] + next[1])
  }
  const length = Math.hypot(nx, ny, nz)
  if (length < 1e-9) return null
  const origin = points
    .reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1], sum[2] + point[2]], [0, 0, 0])
    .map((component) => component / points.length)
  const normal = [nx / length, ny / length, nz / length]
  return { normal, origin }
}

/** 平面正交基：`u` 任意但与法线正交，`v = n × u`。 */
function planeBasis(plane) {
  const reference = Math.abs(plane.normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
  const u = normalize(cross(reference, plane.normal))
  return { u, v: cross(plane.normal, u) }
}

function projectPoint(point, plane, basis) {
  const delta = [point[0] - plane.origin[0], point[1] - plane.origin[1], point[2] - plane.origin[2]]
  return [dot(delta, basis.u), dot(delta, basis.v)]
}

/** 二维凸性：所有相邻边的叉积同号。 */
function isConvex(projected) {
  let positive = 0
  let negative = 0
  for (let index = 0; index < projected.length; index += 1) {
    const a = projected[index]
    const b = projected[(index + 1) % projected.length]
    const c = projected[(index + 2) % projected.length]
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])
    if (area > 1e-12) positive += 1
    else if (area < -1e-12) negative += 1
  }
  return positive === 0 || negative === 0
}

function dot(left, right) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2]
}

function cross(left, right) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ]
}

function normalize(vector) {
  const length = Math.hypot(...vector) || 1
  return vector.map((component) => component / length)
}

/**
 * 单次「清理一条 primitive」：焊接 → 去退化/重叠 → （可选）补平面洞。
 * 返回的 `report` 是审计报告里的「修正操作」字段。
 */
export function cleanPrimitive(primitive, options = {}) {
  const {
    weld = true,
    fillHoles = false,
    positionOnlyWeld = false,
    tolerance = DEFAULT_WELD_TOLERANCE,
    minLoopAreaRatio = 0.004,
  } = options
  const before = analyzeTopology(primitive, { tolerance })
  let current = primitive
  let removedVertices = 0
  if (weld) {
    const welded = weldPrimitive(primitive, { positionOnly: positionOnlyWeld, tolerance })
    removedVertices = welded.removedVertices
    current = welded.primitive
  }
  const cleaned = cleanTriangles(current)
  current = cleaned.primitive
  let filled = { filledLoops: 0, skippedLoops: 0, addedTriangles: 0 }
  if (fillHoles) {
    const result = fillPlanarHoles(current, { tolerance, minLoopAreaRatio })
    current = result.primitive
    filled = { filledLoops: result.filledLoops, skippedLoops: result.skippedLoops, addedTriangles: result.addedTriangles }
  }
  const after = analyzeTopology(current, { tolerance })
  return {
    primitive: current,
    report: {
      weld: { removedVertices, positionOnlyWeld },
      degenerateFaces: cleaned.degenerate,
      duplicatedFaces: cleaned.duplicated,
      holesFilled: filled.filledLoops,
      holesSkipped: filled.skippedLoops,
      addedTriangles: filled.addedTriangles,
      before,
      after,
    },
  }
}
