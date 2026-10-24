/**
 * 庭院植物参数化构件库：树干 / 分枝 / 叶簇 / 竹节 / 草叶 / 花簇。
 *
 * 为什么单独一层：`primitive-kit.mjs` 只有盒 / 柱 / 回转体 / 单面四边形，够做家具，
 * 不够做植物 —— 植物没有直角，靠「大量小体量的有机团块 + 逐级变细的枝」堆出轮廓。
 * 这里把这几类构件收敛成可复用的函数，15 个配方只写「尺寸 + 数量 + 分布」，不再各自推导坐标。
 *
 * 三条硬约定（会被门禁检查，写错就要返工）：
 * 1. **闭合**：植物走 `open-sheet` 拓扑类别，但运行时材质是单面（GLB `doubleSided=false`），
 *    所以叶片不做单面四边形，而是很薄的闭合棱柱 —— 单面片从背面看会整片消失。
 * 2. **朝外绕序**：所有体量按「外法线」绕序生成（与 `primitive-kit.cylinder` 同一口径），
 *    三视图 / 运行时都不会因背面剔除而缺面。
 * 3. **确定性**：随机全部走 `random(seed)`，同一 seed 每次重出得到同一株，审计基线不漂。
 *
 * 坐标：+Y 向上、米制、**绝对坐标**；配方末尾用 `fitSize` 收到规格包围盒
 * （`rebuild-items.mjs` 再居中 + 落地面，这里只保证比例，不做最终定位）。
 */
import { box, merge, transform } from './primitive-kit.mjs'

const TAU = Math.PI * 2

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const normalize = (a) => {
  const length = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / length, a[1] / length, a[2] / length]
}

/**
 * 确定性伪随机（mulberry32）。
 * 植物要让「每次重出都长出同一株」，否则审计基线（面积占比 / 壳数）每次都会漂。
 */
export function random(seed = 1) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 区间取值。 */
const between = (rng, min, max) => min + rng() * (max - min)

/* ------------------------------------------------------------------ *
 * 体量：球 / 椭球
 * ------------------------------------------------------------------ */

/**
 * UV 球（闭合，平滑法线）。叶簇 / 花簇 / 云片都从这里长出来。
 * @param {{radius?:number,segments?:number,rings?:number,center?:number[],squash?:number[],rotateY?:number}} options
 */
export function sphere({
  radius = 1,
  segments = 10,
  rings = 7,
  center = [0, 0, 0],
  squash = [1, 1, 1],
  rotateY = 0,
}) {
  const positions = []
  const normals = []
  const uvs = []
  const indices = []
  const cosY = Math.cos(rotateY)
  const sinY = Math.sin(rotateY)
  const push = (x, y, z) => {
    // 椭球法线 ∝ (x/a², y/b², z/c²)；点 = (a·ux, b·uy, c·uz) ⇒ 法线 ∝ (ux/a, uy/b, uz/c)
    const wx = x * squash[0]
    const wy = y * squash[1]
    const wz = z * squash[2]
    const nx = x / Math.max(1e-6, squash[0])
    const ny = y / Math.max(1e-6, squash[1])
    const nz = z / Math.max(1e-6, squash[2])
    const length = Math.hypot(nx, ny, nz) || 1
    // 先绕 Y 旋转，再落到中心
    positions.push(
      center[0] + wx * cosY + wz * sinY,
      center[1] + wy,
      center[2] - wx * sinY + wz * cosY,
    )
    normals.push(
      (nx * cosY + nz * sinY) / length,
      ny / length,
      (-nx * sinY + nz * cosY) / length,
    )
  }

  const top = 0
  push(0, radius, 0)
  uvs.push(0.5, 1)
  for (let ring = 1; ring < rings; ring += 1) {
    const phi = (Math.PI * ring) / rings
    const y = Math.cos(phi) * radius
    const ringRadius = Math.sin(phi) * radius
    for (let segment = 0; segment < segments; segment += 1) {
      const theta = (segment / segments) * TAU
      push(Math.cos(theta) * ringRadius, y, Math.sin(theta) * ringRadius)
      uvs.push(segment / segments, 1 - ring / rings)
    }
  }
  const bottom = 1 + (rings - 1) * segments
  push(0, -radius, 0)
  uvs.push(0.5, 0)

  const at = (ring, segment) => 1 + (ring - 1) * segments + (((segment % segments) + segments) % segments)

  for (let segment = 0; segment < segments; segment += 1) {
    indices.push(top, at(1, segment + 1), at(1, segment))
  }
  for (let ring = 1; ring < rings - 1; ring += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const a = at(ring, segment)
      const b = at(ring, segment + 1)
      const c = at(ring + 1, segment + 1)
      const d = at(ring + 1, segment)
      indices.push(a, b, c, a, c, d)
    }
  }
  for (let segment = 0; segment < segments; segment += 1) {
    indices.push(at(rings - 1, segment), at(rings - 1, segment + 1), bottom)
  }
  return { positions, normals, uvs, indices }
}

/* ------------------------------------------------------------------ *
 * 体量：定向圆台（枝 / 干 / 秆）
 * ------------------------------------------------------------------ */

/**
 * 两点之间的圆台（可分别关掉两端封盖）。树干、分枝、竹秆、花茎都用它。
 * @param {{from:number[],to:number[],radiusStart:number,radiusEnd?:number,segments?:number,capStart?:boolean,capEnd?:boolean}} options
 */
export function tube({
  from,
  to,
  radiusStart,
  radiusEnd = radiusStart,
  segments = 8,
  capStart = true,
  capEnd = true,
}) {
  const axis = normalize(sub(to, from))
  const helper = Math.abs(axis[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]
  const u = normalize(cross(helper, axis))
  // v = u × axis ⇒ cross(u, v) = -axis，与 primitive-kit.cylinder 的绕序口径一致。
  const v = cross(u, axis)
  const positions = []
  const normals = []
  const uvs = []
  const indices = []

  const startRing = []
  const endRing = []
  for (let segment = 0; segment < segments; segment += 1) {
    const angle = (segment / segments) * TAU
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const direction = normalize([
      u[0] * cos + v[0] * sin,
      u[1] * cos + v[1] * sin,
      u[2] * cos + v[2] * sin,
    ])
    // 圆台侧面法线要带上锥度：法线向直径变小的方向倾斜。
    const slope = (radiusStart - radiusEnd) / Math.max(1e-6, Math.hypot(...sub(to, from)))
    const normal = normalize([
      direction[0] + axis[0] * slope,
      direction[1] + axis[1] * slope,
      direction[2] + axis[2] * slope,
    ])
    const startPoint = add(from, mul(direction, radiusStart))
    startRing.push(positions.length / 3)
    positions.push(...startPoint)
    normals.push(...normal)
    uvs.push(segment / segments, 0)
    const endPoint = add(to, mul(direction, radiusEnd))
    endRing.push(positions.length / 3)
    positions.push(...endPoint)
    normals.push(...normal)
    uvs.push(segment / segments, 1)
  }

  for (let segment = 0; segment < segments; segment += 1) {
    const next = (segment + 1) % segments
    // 与 cylinder 同一口径：上环（+axis 端 = end）在前，下环（start）在后。
    indices.push(endRing[segment], endRing[next], startRing[next])
    indices.push(endRing[segment], startRing[next], startRing[segment])
  }

  const cap = (ring, center, directionSign) => {
    const centerIndex = positions.length / 3
    positions.push(...center)
    normals.push(axis[0] * directionSign, axis[1] * directionSign, axis[2] * directionSign)
    uvs.push(0.5, 0.5)
    for (let segment = 0; segment < segments; segment += 1) {
      const current = ring[segment]
      const next = ring[(segment + 1) % segments]
      if (directionSign > 0) indices.push(centerIndex, current, next)
      else indices.push(centerIndex, next, current)
    }
  }
  if (capEnd && radiusEnd > 1e-6) cap(endRing, to, 1)
  if (capStart && radiusStart > 1e-6) cap(startRing, from, -1)

  return { positions, normals, uvs, indices }
}

/* ------------------------------------------------------------------ *
 * 体量：多变径连续管（干 / 枝 / 竹秆）
 * ------------------------------------------------------------------ */

/**
 * 多点变径连续管：树干、主枝、竹秆都用它，**内部关节不封盖**。
 *
 * 为什么不用「多段 cylinder 拼」：相邻两段的端环位置完全重合，按位置焊接后
 * 关节处的每条边会被 4 个三角面共用，拓扑上就是非流形边（`garden-tree` 第一版
 * 因此有 10 条非流形边）。连续管共享同一圈顶点，关节天然是流形。
 *
 * @param {{points:number[][],radii:number[],segments?:number,capStart?:boolean,capEnd?:boolean}} options
 */
export function tubeChain({ points, radii, segments = 8, capStart = true, capEnd = true }) {
  const positions = []
  const normals = []
  const uvs = []
  const indices = []
  const rings = []
  let previousU = null

  for (let index = 0; index < points.length; index += 1) {
    const previousPoint = points[Math.max(0, index - 1)]
    const nextPoint = points[Math.min(points.length - 1, index + 1)]
    const tangent = normalize(sub(nextPoint, previousPoint))
    let u
    if (previousU) {
      const projected = sub(previousU, mul(tangent, previousU[0] * tangent[0] + previousU[1] * tangent[1] + previousU[2] * tangent[2]))
      u = normalize(projected)
    } else {
      const helper = Math.abs(tangent[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]
      u = normalize(cross(helper, tangent))
    }
    previousU = u
    const v = cross(u, tangent)
    const radius = radii[index]
    const ring = []
    // 锥度：相邻半径差 / 相邻弧长，法线向细端倾斜。
    const slope =
      (radii[Math.min(radii.length - 1, index + 1)] - radii[Math.max(0, index - 1)]) /
      Math.max(1e-6, Math.hypot(...sub(points[Math.min(points.length - 1, index + 1)], points[Math.max(0, index - 1)])))
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = (segment / segments) * TAU
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      const direction = normalize([
        u[0] * cos + v[0] * sin,
        u[1] * cos + v[1] * sin,
        u[2] * cos + v[2] * sin,
      ])
      const normal = normalize([
        direction[0] + tangent[0] * slope,
        direction[1] + tangent[1] * slope,
        direction[2] + tangent[2] * slope,
      ])
      ring.push(positions.length / 3)
      positions.push(
        points[index][0] + direction[0] * radius,
        points[index][1] + direction[1] * radius,
        points[index][2] + direction[2] * radius,
      )
      normals.push(...normal)
      uvs.push(segment / segments, index / Math.max(1, points.length - 1))
    }
    rings.push(ring)
  }

  for (let index = 0; index < rings.length - 1; index += 1) {
    const start = rings[index]
    const end = rings[index + 1]
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments
      indices.push(end[segment], end[next], start[next])
      indices.push(end[segment], start[next], start[segment])
    }
  }

  const cap = (ring, center, tangent, outward) => {
    const centerIndex = positions.length / 3
    positions.push(...center)
    normals.push(tangent[0] * outward, tangent[1] * outward, tangent[2] * outward)
    uvs.push(0.5, outward > 0 ? 1 : 0)
    for (let segment = 0; segment < segments; segment += 1) {
      const current = ring[segment]
      const next = ring[(segment + 1) % segments]
      if (outward > 0) indices.push(centerIndex, current, next)
      else indices.push(centerIndex, next, current)
    }
  }
  const last = points.length - 1
  if (capEnd && radii[last] > 1e-6) {
    cap(rings[last], points[last], normalize(sub(points[last], points[last - 1])), 1)
  }
  if (capStart && radii[0] > 1e-6) {
    cap(rings[0], points[0], normalize(sub(points[1], points[0])), -1)
  }
  return { positions, normals, uvs, indices }
}

/* ------------------------------------------------------------------ *
 * 竹秆：分节的圆台堆叠（节处略粗，形成可见竹节）
 * ------------------------------------------------------------------ */

/**
 * 一根竹秆。internodes 段之间直径有「节 → 段中 → 节」的起伏，
 * 视觉上是竹节而不是一根等径管子；顶端略弯，底部略粗。
 * @param {{base:number[],top:number[],radius:number,internodes?:number,segments?:number,seed?:number}} options
 */
export function culm({ base, top, radius, internodes = 4, segments = 6, seed = 1 }) {
  const rng = random(seed)
  const points = []
  const radii = []
  const direction = sub(top, base)
  // 每个竹节：先是一圈略粗的「节环」，再收成段内最细 —— 连续管把半径突变读成竹节，
  // 不用额外堆环面（旧版每根秆多 3 圈、整丛多出三百多个面）。
  for (let index = 0; index < internodes; index += 1) {
    const t = index / internodes
    const node = add(base, mul(direction, t))
    const taper = 1 - t * 0.42
    points.push(node)
    radii.push(radius * taper * 1.16)
    if (index < internodes - 1) {
      const mid = add(base, mul(direction, t + 0.5 / internodes))
      points.push(mid)
      radii.push(radius * (1 - (t + 0.5 / internodes) * 0.42) * 0.94)
    }
  }
  points.push(top)
  radii.push(radius * 0.55)
  const pieces = [tubeChain({ points, radii, segments })]
  // 顶端渐尖的梢（略微外倾，竹梢不是笔直的）。
  pieces.push(
    tubeChain({
      points: [
        top,
        add(top, [between(rng, -0.02, 0.02), 0.07, between(rng, -0.02, 0.02)]),
      ],
      radii: [radius * 0.5, radius * 0.1],
      segments: Math.max(4, segments - 2),
    }),
  )
  return merge(pieces)
}

/* ------------------------------------------------------------------ *
 * 叶片：弯曲的薄棱柱（闭合，单面材质也不会消失）
 * ------------------------------------------------------------------ */

/**
 * 一片弯叶 / 草叶：沿 +Y 生长、向 +Z 弯，截面是 4 边的细长棱柱。
 * @param {{length:number,width:number,curve?:number,segments?:number,thickness?:number,
 *          translate?:number[],rotateX?:number,rotateY?:number,rotateZ?:number,bend?:number}} options
 */
export function blade({
  length,
  width,
  curve = 0.35,
  segments = 4,
  thickness = 0.006,
  bend = 0,
  translate = [0, 0, 0],
  rotateX = 0,
  rotateY = 0,
  rotateZ = 0,
}) {
  const rings = []
  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments
    const y = length * t
    const z = curve * length * t * t + bend * Math.sin(t * Math.PI) * length
    // 叶尖收成 0.15 倍的宽度，留一点厚度避免退化面
    const halfWidth = Math.max(0.0015, (width * (1 - t * 0.92)) / 2)
    const halfThickness = Math.max(0.0012, (thickness * (1 - t * 0.7)) / 2)
    const tangent = normalize([0, length / segments, 2 * curve * length * t / segments + (bend * Math.PI * Math.cos(t * Math.PI) * length) / segments])
    const normal = normalize(cross([1, 0, 0], tangent))
    const center = [0, y, z]
    rings.push([
      add(center, mul([1, 0, 0], halfWidth)),
      add(center, mul(normal, halfThickness)),
      add(center, mul([1, 0, 0], -halfWidth)),
      add(center, mul(normal, -halfThickness)),
    ])
  }

  const positions = []
  const normals = []
  const uvs = []
  const indices = []
  const ringIndices = rings.map((ring) => {
    const base = positions.length / 3
    for (const point of ring) {
      positions.push(...point)
      const normal = normalize([point[0] === 0 ? 0 : point[0], 0, 0])
      normals.push(...normal)
      uvs.push(0.5, 0)
    }
    return base
  })
  // 侧面：每圈 4 条棱，逐段连接（与 tube 同口径：end 环在前）。
  for (let index = 0; index < segments; index += 1) {
    const start = ringIndices[index]
    const end = ringIndices[index + 1]
    for (let corner = 0; corner < 4; corner += 1) {
      const nextCorner = (corner + 1) % 4
      indices.push(end + corner, end + nextCorner, start + nextCorner)
      indices.push(end + corner, start + nextCorner, start + corner)
    }
  }
  // 叶基 / 叶尖封盖
  const capRing = (ringIndex, base, outward) => {
    const centerIndex = positions.length / 3
    const ring = rings[ringIndex]
    const center = [
      (ring[0][0] + ring[2][0]) / 2,
      (ring[0][1] + ring[2][1]) / 2,
      (ring[0][2] + ring[2][2]) / 2,
    ]
    positions.push(...center)
    normals.push(0, outward > 0 ? 1 : -1, 0)
    uvs.push(0.5, 0.5)
    for (let corner = 0; corner < 4; corner += 1) {
      const current = base + corner
      const next = base + ((corner + 1) % 4)
      if (outward > 0) indices.push(centerIndex, current, next)
      else indices.push(centerIndex, next, current)
    }
  }
  capRing(0, ringIndices[0], -1)
  capRing(segments, ringIndices[segments], 1)

  // 侧面法线按面重算（叶片是薄棱柱，平滑法线会让棱边糊掉）。
  const shaped = { positions, normals: new Array(positions.length).fill(0), uvs, indices }
  for (let index = 0; index < indices.length; index += 3) {
    const a = indices[index]
    const b = indices[index + 1]
    const c = indices[index + 2]
    const pa = [positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2]]
    const pb = [positions[b * 3], positions[b * 3 + 1], positions[b * 3 + 2]]
    const pc = [positions[c * 3], positions[c * 3 + 1], positions[c * 3 + 2]]
    const normal = normalize(cross(sub(pb, pa), sub(pc, pa)))
    for (const vertex of [a, b, c]) {
      shaped.normals[vertex * 3] += normal[0]
      shaped.normals[vertex * 3 + 1] += normal[1]
      shaped.normals[vertex * 3 + 2] += normal[2]
    }
  }
  for (let index = 0; index < shaped.normals.length; index += 3) {
    const normal = normalize([
      shaped.normals[index],
      shaped.normals[index + 1],
      shaped.normals[index + 2],
    ])
    shaped.normals[index] = normal[0]
    shaped.normals[index + 1] = normal[1]
    shaped.normals[index + 2] = normal[2]
  }
  return transform(shaped, { translate, rotateX, rotateY, rotateZ })
}

/* ------------------------------------------------------------------ *
 * 叶簇 / 花簇：椭球散布
 * ------------------------------------------------------------------ */

/**
 * 在椭球壳上散布叶团。`shape` 决定分布轮廓：
 * - `sphere`：完整树冠；
 * - `dome`：半球（低矮灌木 / 圆顶绿篱）；
 * - `box`：贴长方体表面（绿篱的顶面与侧面起伏）。
 *
 * 叶团本身是扁椭球（纵向压扁 60%–85%），比等径球更像叶片堆叠。
 * @param {{center?:number[],radii:number[],count?:number,blob?:number,shape?:string,seed?:number,
 *          segments?:number,rings?:number,inner?:number,flatten?:number,jitter?:number}} options
 */
export function scatterBlobs({
  center = [0, 0, 0],
  radii,
  count = 12,
  blob = 0.3,
  blobSize,
  shape = 'sphere',
  seed = 1,
  segments = 9,
  rings = 6,
  inner = 0.55,
  flatten = 0.78,
  jitter = 0.32,
}) {
  const rng = random(seed)
  const baseRadius = blobSize ?? Math.min(...radii) * blob
  const pieces = []
  const directionOnSphere = () => {
    const z = between(rng, -1, 1)
    const theta = between(rng, 0, TAU)
    const r = Math.sqrt(Math.max(0, 1 - z * z))
    return [Math.cos(theta) * r, z, Math.sin(theta) * r]
  }
  for (let index = 0; index < count; index += 1) {
    let unit
    if (shape === 'box') {
      // 一半落在顶面，一半落在四个侧面：绿篱的起伏集中在受光面。
      if (rng() < 0.55) unit = [between(rng, -1, 1), 1, between(rng, -1, 1)]
      else {
        const side = Math.floor(rng() * 4)
        const along = between(rng, -1, 1)
        unit = [
          side === 0 ? 1 : side === 1 ? -1 : along,
          between(rng, -0.4, 1),
          side === 2 ? 1 : side === 3 ? -1 : along,
        ]
      }
    } else {
      unit = directionOnSphere()
      if (shape === 'dome') unit = [unit[0], Math.abs(unit[1]), unit[2]]
    }
    const radial = between(rng, inner, 1)
    const size = baseRadius * between(rng, 1 - jitter, 1 + jitter)
    const squash = [
      between(rng, 0.85, 1.18),
      flatten * between(rng, 0.82, 1.1),
      between(rng, 0.85, 1.18),
    ]
    pieces.push(
      sphere({
        radius: size,
        segments,
        rings,
        center: [
          center[0] + unit[0] * radii[0] * radial,
          center[1] + unit[1] * radii[1] * radial,
          center[2] + unit[2] * radii[2] * radial,
        ],
        squash,
        rotateY: between(rng, 0, TAU),
      }),
    )
  }
  return merge(pieces)
}

/**
 * 云片（松 / 景松）：几块扁平叶团拼成一片水平延伸的「云」。
 * 松树的识别度全在这个形态上 —— 不是圆锥，是层层水平伸出的云片。
 * @param {{center:number[],radius:number,thickness:number,blobs?:number,seed?:number,stretch?:number}} options
 */
export function cloudPad({ center, radius, thickness, blobs = 3, seed = 1, stretch = 1.15, segments = 9, rings = 4 }) {
  const rng = random(seed)
  const pieces = []
  for (let index = 0; index < blobs; index += 1) {
    const angle = (index / blobs) * TAU + between(rng, -0.4, 0.4)
    const offset = blobs === 1 ? 0 : radius * between(rng, 0.18, 0.4)
    const size = radius * between(rng, 0.55, 0.78)
    pieces.push(
      sphere({
        radius: size,
        segments,
        rings,
        center: [
          center[0] + Math.cos(angle) * offset,
          center[1] + between(rng, -thickness * 0.25, thickness * 0.25),
          center[2] + Math.sin(angle) * offset,
        ],
        squash: [stretch, thickness / (2 * size), 1],
        rotateY: angle,
      }),
    )
  }
  return merge(pieces)
}

/** 花簇：一小团花瓣 + 花心（两枚扁球，近景能看出「团」而不是一个点）。 */
export function flowerCluster({ center, radius, seed = 1, petals = 1 }) {
  const rng = random(seed)
  const pieces = []
  for (let index = 0; index < petals; index += 1) {
    const offset = petals === 1 ? [0, 0, 0] : [
      between(rng, -radius, radius) * 0.8,
      between(rng, -radius, radius) * 0.4,
      between(rng, -radius, radius) * 0.8,
    ]
    pieces.push(
      sphere({
        radius: radius * between(rng, 0.75, 1),
        segments: 6,
        rings: 4,
        center: add(center, offset),
        squash: [1, 0.72, 1],
        rotateY: between(rng, 0, TAU),
      }),
    )
  }
  return merge(pieces)
}

/** 草穗 / 花茎：细茎 + 顶端一簇小体量。 */
export function seedHead({ base, top, radius = 0.012, seeds = 5, seed = 1, height = 0.06 }) {
  const rng = random(seed)
  const stem = tube({
    from: base,
    to: top,
    radiusStart: radius,
    radiusEnd: radius * 0.6,
    segments: 4,
  })
  const pieces = [stem]
  for (let index = 0; index < seeds; index += 1) {
    const along = between(rng, 0.75, 1)
    const point = add(base, mul(sub(top, base), along))
    const size = radius * between(rng, 2.4, 3.6)
    pieces.push(
      sphere({
        radius: size,
        segments: 5,
        rings: 3,
        center: [
          point[0] + between(rng, -size, size),
          point[1] + between(rng, 0, height),
          point[2] + between(rng, -size, size),
        ],
        squash: [1, 0.65, 1],
      }),
    )
  }
  return merge(pieces)
}

/* ------------------------------------------------------------------ *
 * 绿篱主体
 * ------------------------------------------------------------------ */

/**
 * 绿篱主体：长方体核 + 顶/侧面的叶团起伏。核保证体积连续，叶团打掉「一个盒子」的观感。
 * @param {{width:number,height:number,depth:number,bottom?:number,count?:number,seed?:number}} options
 */
export function hedgeBody({ width, height, depth, bottom = 0, count = 10, seed = 1, segments = 10, rings = 6 }) {
  const rng = random(seed)
  const coreHeight = height * 0.86
  const core = box({
    width: width - 0.045,
    height: coreHeight,
    depth: depth - 0.045,
    center: [0, bottom + coreHeight / 2, 0],
  })
  const ridges = []
  // 顶部起伏
  for (let index = 0; index < count; index += 1) {
    const x = between(rng, -width * 0.42, width * 0.42)
    const z = between(rng, -depth * 0.35, depth * 0.35)
    const size = between(rng, depth * 0.16, depth * 0.24)
    ridges.push(
      sphere({
        radius: size,
        segments,
        rings,
        center: [x, bottom + coreHeight + between(rng, -0.01, height * 0.02), z],
        squash: [1.15, 0.66, 1],
        rotateY: between(rng, 0, TAU),
      }),
    )
  }
  // 侧面外凸（左右各一半）
  for (let index = 0; index < Math.round(count * 0.6); index += 1) {
    const side = index % 2 === 0 ? 1 : -1
    const size = between(rng, depth * 0.09, depth * 0.14)
      ridges.push(
      sphere({
        radius: size,
        segments: Math.max(6, segments - 1),
        rings: Math.max(4, rings - 1),
        center: [
          side * (width / 2 - 0.005),
          bottom + between(rng, coreHeight * 0.25, coreHeight * 0.8),
          between(rng, -depth * 0.34, depth * 0.34),
        ],
        squash: [0.7, 1, 1],
        rotateY: between(rng, 0, TAU),
      }),
    )
  }
  return merge([core, ...ridges])
}

/* ------------------------------------------------------------------ *
 * 收尾：把任意比例的植株收进规格包围盒
 * ------------------------------------------------------------------ */

/** 几何包围盒。 */
export function boundsOf(geometry) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let index = 0; index < geometry.positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = geometry.positions[index + axis]
      if (value < min[axis]) min[axis] = value
      if (value > max[axis]) max[axis] = value
    }
  }
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] }
}

/**
 * 把整株按比例收进 `size`：各轴独立缩放 → 底面落到 y=0、x/z 居中。
 *
 * 15 个配方都按「好看的比例」建模，最后由这一步对齐规格。逐轴缩放的偏差在本批
 * 都在 10% 以内（最宽的差异是柱形乔木的高宽比，脚本里已按规格比例建模），
 * 不会把叶团压成饼。
 */
export function fitSize(geometry, size) {
  const bounds = boundsOf(geometry)
  const scale = size.map((value, axis) => value / Math.max(1e-6, bounds.size[axis]))
  const positions = geometry.positions.map((value, index) => {
    const axis = index % 3
    return axis === 0
      ? (value - (bounds.min[0] + bounds.max[0]) / 2) * scale[0]
      : axis === 1
        ? (value - bounds.min[1]) * scale[1]
        : (value - (bounds.min[2] + bounds.max[2]) / 2) * scale[2]
  })
  // 法线按逆缩放权重重算（非均匀缩放下不能用原法线）。
  const normals = geometry.normals.map((value, index) => {
    const axis = index % 3
    return value / Math.max(1e-6, scale[axis])
  })
  const normalized = normals.map(() => 0)
  for (let index = 0; index < normals.length; index += 3) {
    const length = Math.hypot(normals[index], normals[index + 1], normals[index + 2]) || 1
    normalized[index] = normals[index] / length
    normalized[index + 1] = normals[index + 1] / length
    normalized[index + 2] = normals[index + 2] / length
  }
  return { ...geometry, positions, normals: normalized }
}

/**
 * 把**多组**几何当成一整株收进 `size`：共用同一组缩放/平移，构件之间的相对位置不变。
 * 单组 `fitSize` 只能用于独立零件，逐组调用会把树干、枝叶各自拉满包围盒。
 * @param {{geometry:object}[]} groups
 * @param {number[]} size
 */
export function fitGroups(groups, size) {
  const merged = merge(groups.map((group) => group.geometry))
  const bounds = boundsOf(merged)
  const scale = size.map((value, axis) => value / Math.max(1e-6, bounds.size[axis]))
  const mapped = groups.map((group) => ({
    ...group,
    geometry: fitSizeTo(group.geometry, bounds, scale),
  }))
  return mapped
}

/** `fitGroups` 的内部：按已算好的总包围盒与缩放系数变换一组几何。 */
function fitSizeTo(geometry, bounds, scale) {
  const positions = geometry.positions.map((value, index) => {
    const axis = index % 3
    return axis === 0
      ? (value - (bounds.min[0] + bounds.max[0]) / 2) * scale[0]
      : axis === 1
        ? (value - bounds.min[1]) * scale[1]
        : (value - (bounds.min[2] + bounds.max[2]) / 2) * scale[2]
  })
  const normals = geometry.normals.map((value, index) => value / Math.max(1e-6, scale[index % 3]))
  for (let index = 0; index < normals.length; index += 3) {
    const length = Math.hypot(normals[index], normals[index + 1], normals[index + 2]) || 1
    normals[index] /= length
    normals[index + 1] /= length
    normals[index + 2] /= length
  }
  return { ...geometry, positions, normals }
}

export { add, sub, mul, cross, normalize, between }
