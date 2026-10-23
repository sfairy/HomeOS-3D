/**
 * 参数化几何基元：30 款精修件的重建配方只写「尺寸 + 构件」，出网格交给这里。
 *
 * 为什么自己写在 glTF accessor 层而不是用 three.js 的 BoxGeometry：
 * 1. 需要精确的米制尺寸和**硬边**法线（一个盒子 24 顶点，不是 8 个顶点共享法线）；
 * 2. 需要按「槽位 → 连续网格」分组，一个材质一组 primitive，禁止空槽位；
 * 3. 不引入 three 的运行时依赖，脚本可以直接跑在 bun 里。
 *
 * 坐标约定（与现有资产一致，已实测）：+Y 向上、+Z 朝前（椅子/床/电视的正面朝 +Z，
 * 靠背在 -Z），原点在**底面中心**（y=0 落地）。
 */

const TAU = Math.PI * 2

const vec3 = (x, y, z) => [x, y, z]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const normalize = (a) => {
  const length = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / length, a[1] / length, a[2] / length]
}

/**
 * 轴对齐盒子：6 个独立面，法线硬边。
 * @param {{width:number,height:number,depth:number,center?:number[],uvScale?:number}} options
 */
export function box({ width, height, depth, center = [0, 0, 0], uvScale = 1 }) {
  const [cx, cy, cz] = center
  const hx = width / 2
  const hy = height / 2
  const hz = depth / 2
  const positions = []
  const normals = []
  const uvs = []
  const indices = []

  const face = (normal, corners) => {
    const base = positions.length / 3
    for (const corner of corners) {
      positions.push(cx + corner[0] * hx, cy + corner[1] * hy, cz + corner[2] * hz)
      normals.push(...normal)
    }
    const u = Math.max(width, depth) * uvScale
    const v = Math.max(height, depth) * uvScale
    uvs.push(0, 0, u, 0, u, v, 0, v)
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  face([0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]])
  face([0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]])
  face([1, 0, 0], [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]])
  face([-1, 0, 0], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]])
  face([0, 1, 0], [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]])
  face([0, -1, 0], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]])

  return { positions, normals, uvs, indices }
}

/**
 * 圆柱 / 圆台（可分别关掉上下盖）。侧面法线沿轴向平滑、盖面硬边。
 * @param {{radiusTop?:number,radiusBottom?:number,height:number,segments?:number,center?:number[],capTop?:boolean,capBottom?:boolean}} options
 */
export function cylinder({
  radiusTop,
  radiusBottom = radiusTop,
  height,
  segments = 24,
  center = [0, 0, 0],
  capTop = true,
  capBottom = true,
}) {
  const [cx, cy, cz] = center
  const positions = []
  const normals = []
  const uvs = []
  const indices = []
  const top = cy + height / 2
  const bottom = cy - height / 2

  // 侧面：每个竖条独立两列顶点，避免环形 UV 接缝处的法线平均。
  const slope = (radiusBottom - radiusTop) / height
  for (let segment = 0; segment < segments; segment += 1) {
    const a0 = (segment / segments) * TAU
    const a1 = ((segment + 1) / segments) * TAU
    const midpoint = (a0 + a1) / 2
    const normal = normalize([Math.cos(midpoint), slope, Math.sin(midpoint)])
    const base = positions.length / 3
    const u0 = segment / segments
    const u1 = (segment + 1) / segments
    positions.push(cx + Math.cos(a0) * radiusTop, top, cz + Math.sin(a0) * radiusTop)
    positions.push(cx + Math.cos(a1) * radiusTop, top, cz + Math.sin(a1) * radiusTop)
    positions.push(cx + Math.cos(a1) * radiusBottom, bottom, cz + Math.sin(a1) * radiusBottom)
    positions.push(cx + Math.cos(a0) * radiusBottom, bottom, cz + Math.sin(a0) * radiusBottom)
    for (let i = 0; i < 4; i += 1) normals.push(...normal)
    uvs.push(u0, 1, u1, 1, u1, 0, u0, 0)
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  const cap = (radius, y, upward) => {
    if (radius <= 1e-6) return
    const centerIndex = positions.length / 3
    positions.push(cx, y, cz)
    normals.push(0, upward ? 1 : -1, 0)
    uvs.push(0.5, 0.5)
    const ringStart = positions.length / 3
    for (let segment = 0; segment <= segments; segment += 1) {
      const angle = (segment / segments) * TAU
      positions.push(cx + Math.cos(angle) * radius, y, cz + Math.sin(angle) * radius)
      normals.push(0, upward ? 1 : -1, 0)
      uvs.push(0.5 + Math.cos(angle) * 0.5, 0.5 + Math.sin(angle) * 0.5)
    }
    for (let segment = 0; segment < segments; segment += 1) {
      if (upward) indices.push(centerIndex, ringStart + segment, ringStart + segment + 1)
      else indices.push(centerIndex, ringStart + segment + 1, ringStart + segment)
    }
  }
  if (capTop) cap(radiusTop, top, true)
  if (capBottom) cap(radiusBottom, bottom, false)

  return { positions, normals, uvs, indices }
}

/**
 * 旋转体（lathe）：把一条 `[半径, 高度]` 剖面绕 Y 轴旋成回转面。
 * 每条剖面段独立成环，段与段之间硬边 —— 盆沿、灯罩的折角才不会糊掉。
 * @param {{profile:number[][], segments?:number, center?:number[], closeBottom?:boolean, closeTop?:boolean}} options
 */
export function lathe({ profile, segments = 32, center = [0, 0, 0], closeBottom = false, closeTop = false }) {
  const [cx, cy, cz] = center
  const positions = []
  const normals = []
  const uvs = []
  const indices = []
  for (let step = 0; step < profile.length - 1; step += 1) {
    const [r0, y0] = profile[step]
    const [r1, y1] = profile[step + 1]
    if (r0 === r1 && y0 === y1) continue
    const dr = r1 - r0
    const dy = y1 - y0
    for (let segment = 0; segment < segments; segment += 1) {
      const a0 = (segment / segments) * TAU
      const a1 = ((segment + 1) / segments) * TAU
      const midpoint = (a0 + a1) / 2
      // 剖面切线 (dr,dy) 的法线把半径方向与高度方向组合，保证回转面朝向正确。
      const radial = normalize([dy, 0, -dr])
      const normal = normalize([
        Math.cos(midpoint) * radial[0],
        radial[1],
        Math.sin(midpoint) * radial[0],
      ])
      const base = positions.length / 3
      const u0 = segment / segments
      const u1 = (segment + 1) / segments
      const v0 = step / (profile.length - 1)
      const v1 = (step + 1) / (profile.length - 1)
      positions.push(cx + Math.cos(a0) * r0, cy + y0, cz + Math.sin(a0) * r0)
      positions.push(cx + Math.cos(a1) * r0, cy + y0, cz + Math.sin(a1) * r0)
      positions.push(cx + Math.cos(a1) * r1, cy + y1, cz + Math.sin(a1) * r1)
      positions.push(cx + Math.cos(a0) * r1, cy + y1, cz + Math.sin(a0) * r1)
      for (let i = 0; i < 4; i += 1) normals.push(...normal)
      uvs.push(u0, v0, u1, v0, u1, v1, u0, v1)
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
  }
  if (closeBottom) {
    const [radius, y] = profile[0]
    if (radius > 1e-6) {
      const centerIndex = positions.length / 3
      positions.push(cx, cy + y, cz)
      normals.push(0, -1, 0)
      uvs.push(0.5, 0.5)
      const ringStart = positions.length / 3
      for (let segment = 0; segment <= segments; segment += 1) {
        const angle = (segment / segments) * TAU
        positions.push(cx + Math.cos(angle) * radius, cy + y, cz + Math.sin(angle) * radius)
        normals.push(0, -1, 0)
        uvs.push(0.5 + Math.cos(angle) * 0.5, 0.5 + Math.sin(angle) * 0.5)
      }
      for (let segment = 0; segment < segments; segment += 1) {
        indices.push(centerIndex, ringStart + segment + 1, ringStart + segment)
      }
    }
  }
  if (closeTop) {
    const [radius, y] = profile[profile.length - 1]
    if (radius > 1e-6) {
      const centerIndex = positions.length / 3
      positions.push(cx, cy + y, cz)
      normals.push(0, 1, 0)
      uvs.push(0.5, 0.5)
      const ringStart = positions.length / 3
      for (let segment = 0; segment <= segments; segment += 1) {
        const angle = (segment / segments) * TAU
        positions.push(cx + Math.cos(angle) * radius, cy + y, cz + Math.sin(angle) * radius)
        normals.push(0, 1, 0)
        uvs.push(0.5 + Math.cos(angle) * 0.5, 0.5 + Math.sin(angle) * 0.5)
      }
      for (let segment = 0; segment < segments; segment += 1) {
        indices.push(centerIndex, ringStart + segment, ringStart + segment + 1)
      }
    }
  }
  return { positions, normals, uvs, indices }
}

/** 单面四边形（叶片 / 布帘 / 画布），双面材质用。 */
export function quad({ width, height, center = [0, 0, 0], axis = 'z' }) {
  const [cx, cy, cz] = center
  const hx = width / 2
  const hy = height / 2
  const normal = axis === 'z' ? [0, 0, 1] : axis === 'y' ? [0, 1, 0] : [1, 0, 0]
  let corners
  if (axis === 'z') corners = [[-hx, -hy, 0], [hx, -hy, 0], [hx, hy, 0], [-hx, hy, 0]]
  else if (axis === 'y') corners = [[-hx, 0, -hy], [hx, 0, -hy], [hx, 0, hy], [-hx, 0, hy]]
  else corners = [[0, -hy, -hx], [0, -hy, hx], [0, hy, hx], [0, hy, -hx]]
  return {
    positions: corners.flatMap((corner) => [cx + corner[0], cy + corner[1], cz + corner[2]]),
    normals: [...normal, ...normal, ...normal, ...normal],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    indices: [0, 1, 2, 0, 2, 3],
  }
}

/** 合并几何（attributes 必须齐全，缺 UV 的按 0 补齐）。 */
export function merge(geometries) {
  const positions = []
  const normals = []
  const uvs = []
  const indices = []
  for (const geometry of geometries) {
    if (!geometry) continue
    const offset = positions.length / 3
    positions.push(...geometry.positions)
    normals.push(...geometry.normals)
    if (geometry.uvs) uvs.push(...geometry.uvs)
    else uvs.push(...new Array((geometry.positions.length / 3) * 2).fill(0))
    for (const index of geometry.indices) indices.push(index + offset)
  }
  return { positions, normals, uvs, indices }
}

/** 平移 / 绕轴旋转 / 缩放整块几何。 */
export function transform(geometry, { translate = [0, 0, 0], rotateY = 0, rotateX = 0, rotateZ = 0, scale = 1 } = {}) {
  const cosY = Math.cos(rotateY)
  const sinY = Math.sin(rotateY)
  const cosX = Math.cos(rotateX)
  const sinX = Math.sin(rotateX)
  const cosZ = Math.cos(rotateZ)
  const sinZ = Math.sin(rotateZ)
  const positions = []
  const normals = []
  for (let index = 0; index < geometry.positions.length; index += 3) {
    let x = geometry.positions[index] * scale
    let y = geometry.positions[index + 1] * scale
    let z = geometry.positions[index + 2] * scale
    // X 轴
    let ny = y * cosX - z * sinX
    let nz = y * sinX + z * cosX
    y = ny
    z = nz
    // Z 轴
    let nx = x * cosZ - y * sinZ
    ny = x * sinZ + y * cosZ
    x = nx
    y = ny
    // Y 轴
    nx = x * cosY + z * sinY
    nz = -x * sinY + z * cosY
    x = nx
    z = nz
    positions.push(x + translate[0], y + translate[1], z + translate[2])

    let ax = geometry.normals[index]
    let ay = geometry.normals[index + 1]
    let az = geometry.normals[index + 2]
    let by = ay * cosX - az * sinX
    let bz = ay * sinX + az * cosX
    ay = by
    az = bz
    let bx = ax * cosZ - ay * sinZ
    by = ax * sinZ + ay * cosZ
    ax = bx
    ay = by
    bx = ax * cosY + az * sinY
    bz = -ax * sinY + az * cosY
    ax = bx
    az = bz
    normals.push(ax, ay, az)
  }
  return { positions, normals, uvs: geometry.uvs, indices: geometry.indices }
}

/** 旋转复制（四条腿 / 扇叶）。 */
export function repeat(geometry, count, { radius = 0, phase = 0, center = [0, 0, 0] } = {}) {
  const copies = []
  for (let index = 0; index < count; index += 1) {
    const angle = phase + (index / count) * TAU
    copies.push(
      transform(geometry, {
        translate: [center[0] + Math.cos(angle) * radius, center[1], center[2] + Math.sin(angle) * radius],
        rotateY: angle,
      }),
    )
  }
  return merge(copies)
}

export { vec3, sub, cross, normalize }
