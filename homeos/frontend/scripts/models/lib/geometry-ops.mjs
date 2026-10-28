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
  const nonManifoldSamples = []
  for (const [key, count] of edgeCount) {
    if (count > 2) {
      nonManifoldEdges += 1
      // 只留前若干条用于排错：顶点位置 + fan 数，够定位是哪种接缝。
      if (nonManifoldSamples.length < 4) {
        const [from, to] = key.split('|').map(Number)
        nonManifoldSamples.push({
          fan: count,
          from: [weldedPositions[from * 3], weldedPositions[from * 3 + 1], weldedPositions[from * 3 + 2]],
          to: [weldedPositions[to * 3], weldedPositions[to * 3 + 1], weldedPositions[to * 3 + 2]],
        })
      }
    } else if (count === 1) boundaryEdges += 1
  }
  const shells = countShells(weldedIndices, vertexCount)
  return {
    vertices: vertexCount,
    triangles: weldedIndices.length / 3,
    nonManifoldEdges,
    nonManifoldSamples,
    boundaryEdges,
    shells,
    boundaryLoops: boundaryLoops(weldedIndices),
    signedVolume: signedVolume(weldedPositions, weldedIndices),
    eulerCharacteristic: vertexCount - edgeCount.size + weldedIndices.length / 3,
  }
}

/**
 * 位置代表点映射（`vertex -> 首个同位置顶点下标`）。
 *
 * 与 `analyzeTopology` 的焊接口径**完全一致**（同一个 `positionKey` + 同一个容差），
 * 否则「修复后审计仍报开口」这种自欺欺人的结果就会出现。
 */
export function canonicalVertices(positions, tolerance = DEFAULT_WELD_TOLERANCE) {
  const vertexCount = positions.length / 3
  const canonical = new Uint32Array(vertexCount)
  const lookup = new Map()
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const key = positionKey(positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2], tolerance)
    const existing = lookup.get(key)
    if (existing === undefined) {
      lookup.set(key, vertex)
      canonical[vertex] = vertex
    } else {
      canonical[vertex] = existing
    }
  }
  return canonical
}

/**
 * 把三角面切成若干**连通片**。
 *
 * 连通口径是「**共享位置焊接后的顶点**」，与 `analyzeTopology` 的壳数口径一致。
 * 为什么不用「共享恰好 2 个面的边」：两块只在**一个点**相接的面片（bowtie / pinch 顶点）
 * 会因此被切成两片，两片各自加厚时那个共享点要各算一次法线 —— 法线相同时两份内层顶点
 * 落在同一位置，加厚反而凭空造出 4 面共用的边（router 实测 0 → 72 条）。
 * 按顶点连通把它们并成一片，共享点只算一次法线、只有一份内层顶点，这个来源就消失了。
 *
 * 返回的 `patchOfFace` 与面下标一一对应，供 `solidifyShells` 直接用。
 */
export function partitionManifoldPatches(canonical, indices) {
  const faceCount = indices.length / 3
  const edgeFaces = new Map()
  for (let face = 0; face < faceCount; face += 1) {
    for (let corner = 0; corner < 3; corner += 1) {
      const a = canonical[indices[face * 3 + corner]]
      const b = canonical[indices[face * 3 + ((corner + 1) % 3)]]
      if (a === b) continue
      const key = a < b ? `${a}|${b}` : `${b}|${a}`
      const list = edgeFaces.get(key)
      if (list) list.push(face)
      else edgeFaces.set(key, [face])
    }
  }
  const parent = new Int32Array(faceCount)
  for (let face = 0; face < faceCount; face += 1) parent[face] = face
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
  // 按顶点连通：每个代表点记住第一个用到它的面，后续面直接并进去。
  const ownerOfVertex = new Map()
  let nonManifoldEdges = 0
  for (let face = 0; face < faceCount; face += 1) {
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = canonical[indices[face * 3 + corner]]
      const owner = ownerOfVertex.get(vertex)
      if (owner === undefined) ownerOfVertex.set(vertex, face)
      else union(owner, face)
    }
  }
  for (const faces of edgeFaces.values()) if (faces.length > 2) nonManifoldEdges += 1
  const patchOfFace = new Int32Array(faceCount)
  const patchByRoot = new Map()
  for (let face = 0; face < faceCount; face += 1) {
    const root = find(face)
    let patch = patchByRoot.get(root)
    if (patch === undefined) {
      patch = patchByRoot.size
      patchByRoot.set(root, patch)
    }
    patchOfFace[face] = patch
  }
  return { patchOfFace, patchCount: patchByRoot.size, nonManifoldEdges, edgeCount: edgeFaces.size }
}

/**
 * 拆分非流形接缝：先把面切成流形片，再给「同一顶点被多个片共用」的地方各复制一份顶点。
 *
 * 为什么必须复制顶点：一片加厚时会把顶点的位置沿法线挪动；若两个片共用同一个顶点，
 * 后处理的片会把前一片的几何一起拖走。拆开之后每片各有一份同位顶点，加厚互不干扰。
 *
 * @returns {{primitive: object, patchOfFace: Int32Array, patchCount: number, splitEdges: number, duplicatedVertices: number}}
 */
export function splitNonManifoldEdges(primitive, { tolerance = DEFAULT_WELD_TOLERANCE } = {}) {
  const { positions, normals, uvs } = primitive
  const indices = primitive.indices
  const vertexCount = positions.length / 3
  const faceCount = indices.length / 3
  const canonical = canonicalVertices(positions, tolerance)
  const { patchOfFace, patchCount, nonManifoldEdges } = partitionManifoldPatches(canonical, indices)

  const nextPositions = []
  const nextNormals = normals ? [] : null
  const nextUvs = uvs ? [] : null
  const nextIndices = new Uint32Array(indices.length)
  const assigned = new Map()
  for (let face = 0; face < faceCount; face += 1) {
    const patch = patchOfFace[face]
    for (let corner = 0; corner < 3; corner += 1) {
      const raw = indices[face * 3 + corner]
      const key = patch * vertexCount + raw
      let target = assigned.get(key)
      if (target === undefined) {
        target = nextPositions.length / 3
        assigned.set(key, target)
        nextPositions.push(positions[raw * 3], positions[raw * 3 + 1], positions[raw * 3 + 2])
        if (nextNormals) {
          nextNormals.push(normals[raw * 3], normals[raw * 3 + 1], normals[raw * 3 + 2])
        }
        if (nextUvs) nextUvs.push(uvs[raw * 2], uvs[raw * 2 + 1])
      }
      nextIndices[face * 3 + corner] = target
    }
  }
  const duplicatedVertices = nextPositions.length / 3 - vertexCount
  return {
    primitive: {
      positions: new Float32Array(nextPositions),
      normals: nextNormals ? new Float32Array(nextNormals) : undefined,
      uvs: nextUvs ? new Float32Array(nextUvs) : undefined,
      indices: nextIndices,
    },
    patchOfFace,
    patchCount: patchCount,
    splitEdges: nonManifoldEdges,
    duplicatedVertices,
  }
}

/**
 * 薄壳加厚（solidify）：只处理**有边界边**的片，闭合片原样返回、零开销。
 *
 * 做法是标准的「内偏移 + 反向副本 + 侧壁」：
 * 1. 每个顶点沿 `-法线` 内移 `thickness`，得到内层顶点（法线取反）；
 * 2. 原面原样保留，再加一份用内层顶点、绕序反转的副本；
 * 3. 每条边界有向边 `a→b` 补一个四边形 `(b, a, a', b')`，两侧接缝方向相反。
 *
 * 这样原可见表面**一个像素都不动**（位置不变、法线不变），只多出一层放在物体内部的
 * 背面和一圈亚毫米侧壁。闭合之后每条边恰好 2 个面：原面与反向副本各 1 个。
 *
 * ## 为什么按「位置焊接后的片」算，而不是按索引拆顶点
 *
 * 审计（`analyzeTopology`）按 1e-5 m 焊接位置统计边。把重合顶点拆成两份**对审计毫无作用**
 * ——位置相同就等于同一个点；反过来，拆开再加侧壁会让两个片的侧壁落在同一位置，
 * 非流形边从 0 涨到两百多条（router 实测）。所以这里全程用位置代表点划分片，
 * 索引保持原样，不对顶点做任何拆分。
 *
 * ## 为什么已经是非流形的位置不加侧壁
 *
 * 一条边被 3 个以上面共用时，那条边在数学上就已经不是流形；在它上面补侧壁只会让面数
 * 从 3 涨到 6。这种接缝必须靠重拓扑（或删掉多余面）解决，不是加厚能处理的，
 * 因此这里跳过、并在 `skippedRimEdges` 里如实报出来，绝不制造更大的烂摊子。
 *
 * 为什么不用「平面补洞封口」：这批模型大量开口是薄片 / 板件的边缘，补出来的面
 * 与母面共面（z-fighting），还会把空气净化器的进风格栅三百多个穿孔封成一块平板。
 *
 * @param {{positions: Float32Array, normals?: Float32Array, uvs?: Float32Array, indices: Uint32Array}} primitive
 * @param {{thickness?: number, tolerance?: number}} options
 */
export function solidifyShells(primitive, { thickness, tolerance = DEFAULT_WELD_TOLERANCE } = {}) {
  const { positions, uvs } = primitive
  const indices = primitive.indices
  const vertexCount = positions.length / 3
  const faceCount = indices.length / 3

  // 位置代表点：与 `analyzeTopology` 完全相同的 1e-5 m 焊接口径，片划分就按它来。
  const vertexId = canonicalVertices(positions, tolerance)
  const edgeKeyOf = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`)

  const faceNormals = new Float32Array(faceCount * 3)
  const vertexNormals = primitive.normals ? null : new Float32Array(positions.length)
  for (let face = 0; face < faceCount; face += 1) {
    const a = indices[face * 3]
    const b = indices[face * 3 + 1]
    const c = indices[face * 3 + 2]
    const ax = positions[a * 3]
    const ay = positions[a * 3 + 1]
    const az = positions[a * 3 + 2]
    const abx = positions[b * 3] - ax
    const aby = positions[b * 3 + 1] - ay
    const abz = positions[b * 3 + 2] - az
    const acx = positions[c * 3] - ax
    const acy = positions[c * 3 + 1] - ay
    const acz = positions[c * 3 + 2] - az
    const nx = aby * acz - abz * acy
    const ny = abz * acx - abx * acz
    const nz = abx * acy - aby * acx
    const length = Math.hypot(nx, ny, nz) || 1
    faceNormals[face * 3] = nx / length
    faceNormals[face * 3 + 1] = ny / length
    faceNormals[face * 3 + 2] = nz / length
    if (vertexNormals) {
      for (const vertex of [a, b, c]) {
        vertexNormals[vertex * 3] += nx
        vertexNormals[vertex * 3 + 1] += ny
        vertexNormals[vertex * 3 + 2] += nz
      }
    }
  }
  const sourceNormals = primitive.normals ?? vertexNormals

  const thicknessOf = (() => {
    if (typeof thickness === 'number' && thickness > 0) return thickness
    let maxDimension = 0
    for (let axis = 0; axis < 3; axis += 1) {
      let min = Infinity
      let max = -Infinity
      for (let vertex = 0; vertex < vertexCount; vertex += 1) {
        const value = positions[vertex * 3 + axis]
        if (value < min) min = value
        if (value > max) max = value
      }
      maxDimension = Math.max(maxDimension, max - min)
    }
    // 0.4mm 起、最大件封顶 1.5mm：86mm 的插座取 0.4mm，4.7m 的 SUV 取 1.5mm，都看不出来。
    return Math.min(Math.max(0.0004, maxDimension * 0.0004), 0.0015)
  })()

  const { patchOfFace, patchCount } = partitionManifoldPatches(vertexId, indices)
  const patchFaces = Array.from({ length: patchCount }, () => [])
  for (let face = 0; face < faceCount; face += 1) patchFaces[patchOfFace[face]].push(face)

  const extraPositions = []
  const extraNormals = []
  const extraUvs = uvs ? [] : null
  const extraIndices = []
  const extraAnchors = []
  let thickenedPatches = 0
  let closedPatches = 0
  let rejectedPatches = 0
  let rejectedOverflow = 0
  let rejectedNoGain = 0
  let skippedComplexPatches = 0
  const noGainSamples = []
  let boundaryEdgesBefore = 0
  let boundaryEdgesAfter = 0

  for (let patch = 0; patch < patchCount; patch += 1) {
    const faces = patchFaces[patch]
    if (!faces.length) continue
    const localUse = new Map()
    const vertices = new Set()
    for (const face of faces) {
      for (let corner = 0; corner < 3; corner += 1) {
        const from = indices[face * 3 + corner]
        const to = indices[face * 3 + ((corner + 1) % 3)]
        vertices.add(from)
        const a = vertexId[from]
        const b = vertexId[to]
        if (a === b) continue
        const key = edgeKeyOf(a, b)
        const record = localUse.get(key) ?? { count: 0, from, to }
        record.count += 1
        localUse.set(key, record)
      }
    }
    const boundary = []
    for (const record of localUse.values()) if (record.count === 1) boundary.push(record)
    if (!boundary.length) {
      closedPatches += 1
      continue
    }

    // 顶点法线：面法线按面积加权；完全对消（两层面片重合）时回落到文件里的 NORMAL。
    const patchNormal = new Float32Array(positions.length)
    const summed = new Float32Array(positions.length)
    for (const face of faces) {
      const nx = faceNormals[face * 3]
      const ny = faceNormals[face * 3 + 1]
      const nz = faceNormals[face * 3 + 2]
      for (const vertex of [indices[face * 3], indices[face * 3 + 1], indices[face * 3 + 2]]) {
        summed[vertex * 3] += nx
        summed[vertex * 3 + 1] += ny
        summed[vertex * 3 + 2] += nz
      }
    }
    for (const vertex of vertices) {
      let nx = summed[vertex * 3]
      let ny = summed[vertex * 3 + 1]
      let nz = summed[vertex * 3 + 2]
      let length = Math.hypot(nx, ny, nz)
      if (length < 1e-9 && sourceNormals) {
        nx = sourceNormals[vertex * 3]
        ny = sourceNormals[vertex * 3 + 1]
        nz = sourceNormals[vertex * 3 + 2]
        length = Math.hypot(nx, ny, nz)
      }
      if (length < 1e-9) {
        let fallback = null
        for (const candidateFace of faces) {
          if (
            indices[candidateFace * 3] === vertex ||
            indices[candidateFace * 3 + 1] === vertex ||
            indices[candidateFace * 3 + 2] === vertex
          ) {
            fallback = candidateFace
            break
          }
        }
        if (fallback === null) continue
        nx = faceNormals[fallback * 3]
        ny = faceNormals[fallback * 3 + 1]
        nz = faceNormals[fallback * 3 + 2]
        length = 1
      }
      patchNormal[vertex * 3] = nx / length
      patchNormal[vertex * 3 + 1] = ny / length
      patchNormal[vertex * 3 + 2] = nz / length
    }

    // 子网格的「修之前」基线（只含本片原面），与厚度无关，算一次就够。
    const patchVertices = [...vertices]
    const localOf = new Map()
    for (let slot = 0; slot < patchVertices.length; slot += 1) localOf.set(patchVertices[slot], slot)
    const originalSubIndices = new Uint32Array(faces.length * 3)
    const basePositions = new Float32Array(patchVertices.length * 3)
    for (let slot = 0; slot < patchVertices.length; slot += 1) {
      const vertex = patchVertices[slot]
      basePositions[slot * 3] = positions[vertex * 3]
      basePositions[slot * 3 + 1] = positions[vertex * 3 + 1]
      basePositions[slot * 3 + 2] = positions[vertex * 3 + 2]
    }
    for (let slot = 0; slot < faces.length; slot += 1) {
      originalSubIndices[slot * 3] = localOf.get(indices[faces[slot] * 3])
      originalSubIndices[slot * 3 + 1] = localOf.get(indices[faces[slot] * 3 + 1])
      originalSubIndices[slot * 3 + 2] = localOf.get(indices[faces[slot] * 3 + 2])
    }
    const beforeVerdict = analyzeTopology({ positions: basePositions, indices: originalSubIndices })
    boundaryEdgesBefore += beforeVerdict.boundaryEdges

    // 内层顶点按**位置代表点**建，不能按原始下标建：
    // 同一个代表点在导出件里常被拆成多个下标（UV 缝 / 硬边），边界边记的 from 是其中一个，
    // 内层副本用的是另一个 —— 两边的内层顶点位置一样但不是同一个点，侧壁就接不上，
    // 闭合后留下一圈开口（glass-stairs 实测 4 条边界边修完变 24 条）。
    const representativeOf = new Map()
    for (const vertex of vertices) {
      const id = vertexId[vertex]
      if (!representativeOf.has(id)) representativeOf.set(id, [])
      representativeOf.get(id).push(vertex)
    }
    const canonicalNormal = new Map()
    for (const [id, members] of representativeOf) {
      let nx = 0
      let ny = 0
      let nz = 0
      for (const member of members) {
        nx += patchNormal[member * 3]
        ny += patchNormal[member * 3 + 1]
        nz += patchNormal[member * 3 + 2]
      }
      const length = Math.hypot(nx, ny, nz)
      if (length > 1e-9) {
        nx /= length
        ny /= length
        nz /= length
      }
      canonicalNormal.set(id, [nx, ny, nz])
    }

    // 厚度从 1 倍开始逐次减半重试：加厚层在极小零件上可能与本体自相接触，
    // 减薄后通常就躲开了。内层朝内、肉眼看不到，0.05mm 也完全够用。
    let accepted = null
    let lastVerdict = beforeVerdict
    for (const scale of [1, 0.5, 0.25, 0.125]) {
      const thicknessNow = thicknessOf * scale
      const base = vertexCount + extraPositions.length / 3
      const pendingPositions = []
      const pendingNormals = []
      const pendingUvs = uvs ? [] : null
      const innerIndex = new Map()
      const anchors = []
      for (const [id, members] of representativeOf) {
        const [nx, ny, nz] = canonicalNormal.get(id)
        const anchor = members[0]
        anchors.push(anchor)
        innerIndex.set(id, base + pendingPositions.length / 3)
        pendingPositions.push(
          positions[anchor * 3] - nx * thicknessNow,
          positions[anchor * 3 + 1] - ny * thicknessNow,
          positions[anchor * 3 + 2] - nz * thicknessNow,
        )
        pendingNormals.push(-nx, -ny, -nz)
        if (pendingUvs) pendingUvs.push(uvs[anchor * 2], uvs[anchor * 2 + 1])
      }

      const candidate = []
      // 反向副本：绕序反转，法线朝内。
      for (const face of faces) {
        candidate.push(
          innerIndex.get(vertexId[indices[face * 3 + 2]]),
          innerIndex.get(vertexId[indices[face * 3 + 1]]),
          innerIndex.get(vertexId[indices[face * 3]]),
        )
      }
      // 侧壁：边界有向边 a→b 说明缺的那一面必须走 b→a，四边形取 (b, a, a', b')。
      for (const record of boundary) {
        const a = record.from
        const b = record.to
        const aInner = innerIndex.get(vertexId[a])
        const bInner = innerIndex.get(vertexId[b])
        candidate.push(b, a, aInner)
        candidate.push(b, aInner, bInner)
      }

      // 实测判定：把「本片原面 + 反向副本 + 侧壁」单独拼成子网格跑一次拓扑分析，
      // 只有真正变成 0 边界边、0 非流形边才落地。
      // 片按共享顶点划分，片与片之间不共边，所以子网格的结论与全件一致；
      // 这比手工推算哪条边会撞在一起可靠得多。
      const toSub = (index) => (index < vertexCount ? localOf.get(index) : patchVertices.length + (index - base))
      const subPositions = new Float32Array(basePositions.length + pendingPositions.length)
      subPositions.set(basePositions, 0)
      subPositions.set(pendingPositions, basePositions.length)
      const subIndices = new Uint32Array(originalSubIndices.length + candidate.length)
      subIndices.set(originalSubIndices, 0)
      for (let offset = 0; offset < candidate.length; offset += 1) {
        subIndices[originalSubIndices.length + offset] = toSub(candidate[offset])
      }
      const verdict = analyzeTopology({ positions: subPositions, indices: subIndices })
      lastVerdict = verdict
      if (verdict.boundaryEdges === 0 && verdict.nonManifoldEdges === 0) {
        accepted = { positions: pendingPositions, normals: pendingNormals, uvs: pendingUvs, candidate, anchors }
        break
      }
    }

    if (!accepted) {
      // 退一步：加厚盖不住就改走「扇形端盖」——每条边界环单独封一个锥形盖，
      // 环心沿环法线内移 t 当作锥顶。这样每条环边正好补 1 个面（共边补齐 2 个），
      // 锥顶是本环私有顶点，bowtie 上两条环各用各的锥顶，不会互相撞。
      // 几乎闭合的壳（洞在面上）也走这条路：补的面与周围几乎共面，正是它缺的那一块。
      const capPositions = []
      const capAnchors = []
      const capNormals = []
      const capUvs = uvs ? [] : null
      const capIndices = []
      const fromOf = new Map()
      for (const record of boundary) fromOf.set(record.from, record.to)
      const visited = new Set()
      let capTopologyOk = true
      for (const record of boundary) {
        if (visited.has(record.from)) continue
        const loop = []
        let cursor = record.from
        for (let guard = 0; guard <= boundary.length + 1; guard += 1) {
          if (visited.has(cursor)) break
          visited.add(cursor)
          loop.push(cursor)
          const next = fromOf.get(cursor)
          if (next === undefined) break
          cursor = next
        }
        if (loop.length < 3) {
          capTopologyOk = false
          break
        }
        // Newell 法线：有向边界环的法线与相邻面同向外，锥顶取反向即朝内。
        let nx = 0
        let ny = 0
        let nz = 0
        let cx = 0
        let cy = 0
        let cz = 0
        let uAvg = 0
        let vAvg = 0
        for (let slot = 0; slot < loop.length; slot += 1) {
          const p = loop[slot]
          const q = loop[(slot + 1) % loop.length]
          cx += positions[p * 3]
          cy += positions[p * 3 + 1]
          cz += positions[p * 3 + 2]
          nx += (positions[p * 3 + 1] - positions[q * 3 + 1]) * (positions[p * 3 + 2] + positions[q * 3 + 2])
          ny += (positions[p * 3 + 2] - positions[q * 3 + 2]) * (positions[p * 3] + positions[q * 3])
          nz += (positions[p * 3] - positions[q * 3]) * (positions[p * 3 + 1] + positions[q * 3 + 1])
          if (uvs) {
            uAvg += uvs[p * 2]
            vAvg += uvs[p * 2 + 1]
          }
        }
        const scale = 1 / loop.length
        cx *= scale
        cy *= scale
        cz *= scale
        const length = Math.hypot(nx, ny, nz)
        if (!(length > 1e-12)) {
          capTopologyOk = false
          break
        }
        nx /= length
        ny /= length
        nz /= length
        const apex = vertexCount + extraPositions.length / 3 + capPositions.length / 3
        capAnchors.push(loop[0])
        capPositions.push(cx - nx * thicknessOf, cy - ny * thicknessOf, cz - nz * thicknessOf)
        capNormals.push(-nx, -ny, -nz)
        if (capUvs) capUvs.push(uAvg * scale, vAvg * scale)
        for (let slot = 0; slot < loop.length; slot += 1) {
          capIndices.push(loop[(slot + 1) % loop.length], loop[slot], apex)
        }
      }

      if (capTopologyOk && capIndices.length) {
        const base2 = vertexCount + extraPositions.length / 3
        const toSub2 = (index) => (index < vertexCount ? localOf.get(index) : patchVertices.length + (index - base2))
        const subPositions2 = new Float32Array(basePositions.length + capPositions.length)
        subPositions2.set(basePositions, 0)
        subPositions2.set(capPositions, basePositions.length)
        const subIndices2 = new Uint32Array(originalSubIndices.length + capIndices.length)
        subIndices2.set(originalSubIndices, 0)
        for (let offset = 0; offset < capIndices.length; offset += 1) {
          subIndices2[originalSubIndices.length + offset] = toSub2(capIndices[offset])
        }
        const capVerdict = analyzeTopology({ positions: subPositions2, indices: subIndices2 })
        if (capVerdict.boundaryEdges === 0 && capVerdict.nonManifoldEdges === 0) {
          accepted = { positions: capPositions, normals: capNormals, uvs: capUvs, candidate: capIndices, anchors: capAnchors }
          lastVerdict = capVerdict
        } else {
          lastVerdict = capVerdict
        }
      }
    }

    if (!accepted) {
      // 加厚盖不住这条接缝（bowtie 边界 / 与相邻件贴在一起）：保持原样，
      // 绝不制造更大的烂摊子，也不写任何例外。
      if (lastVerdict.nonManifoldEdges > beforeVerdict.nonManifoldEdges) rejectedOverflow += 1
      else rejectedNoGain += 1
      if (noGainSamples.length < 6) {
        noGainSamples.push({
          faces: faces.length,
          boundary: boundary.length,
          before: { b: beforeVerdict.boundaryEdges, n: beforeVerdict.nonManifoldEdges, t: beforeVerdict.triangles },
          after: { b: lastVerdict.boundaryEdges, n: lastVerdict.nonManifoldEdges, t: lastVerdict.triangles },
        })
      }
      rejectedPatches += 1
      continue
    }

    boundaryEdgesAfter += lastVerdict.boundaryEdges
    extraPositions.push(...accepted.positions)
    extraNormals.push(...accepted.normals)
    extraAnchors.push(...accepted.anchors)
    if (extraUvs) extraUvs.push(...accepted.uvs)
    for (const index of accepted.candidate) extraIndices.push(index)
    thickenedPatches += 1
  }

  if (!extraIndices.length) {
    return {
      primitive,
      thickenedPatches: 0,
      closedPatches,
      rejectedPatches,
      rejectedOverflow,
      rejectedNoGain,
      skippedComplexPatches,
      noGainSamples,
      addedTriangles: 0,
      addedAnchors: [],
      boundaryEdgesBefore: 0,
      boundaryEdgesAfter: 0,
      thickness: thicknessOf,
    }
  }

  const nextPositions = new Float32Array(positions.length + extraPositions.length)
  nextPositions.set(positions, 0)
  nextPositions.set(extraPositions, positions.length)
  const baseNormals = sourceNormals ?? new Float32Array(positions.length)
  const nextNormals = new Float32Array(positions.length + extraNormals.length)
  nextNormals.set(baseNormals, 0)
  nextNormals.set(extraNormals, positions.length)
  let nextUvs
  if (uvs) {
    nextUvs = new Float32Array(uvs.length + extraUvs.length)
    nextUvs.set(uvs, 0)
    nextUvs.set(extraUvs, uvs.length)
  }
  const nextIndices = new Uint32Array(indices.length + extraIndices.length)
  nextIndices.set(indices, 0)
  nextIndices.set(extraIndices, indices.length)
  return {
    primitive: {
      positions: nextPositions,
      normals: nextNormals,
      uvs: nextUvs,
      indices: nextIndices,
    },
    thickenedPatches,
    closedPatches,
    rejectedPatches,
    rejectedOverflow,
    rejectedNoGain,
    skippedComplexPatches,
    noGainSamples,
    addedTriangles: extraIndices.length / 3,
    addedAnchors: extraAnchors,
    boundaryEdgesBefore,
    boundaryEdgesAfter,
    thickness: thicknessOf,
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
