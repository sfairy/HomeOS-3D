/**
 * 小汽车「玻璃舱」重建：从闭合车身上切出车窗 / 挡风玻璃 / 车顶天幕 / 后窗，外加尾灯带。
 *
 * ## 为什么需要运行时重建（而不是在 GLB 里做）
 *
 * `小汽车.glb` 的车身是一个**闭合实体**（1688 面，边界边 0）：车窗、风挡、天幕、尾灯
 * 这些「面」不是独立几何，原本全靠一张拍摄的参考图上色。那张图已从资产里摘除
 * （1024² 里 58% 的采样是纯黑、且带第三方品牌标识），于是车身只剩一层纯色漆。
 *
 * 与 `prepareSuvRoofGlass` 的思路一致：**几何本身没有窗，就用几何判据把它「认定」出来**，
 * 再单独生成一张网格挂玻璃材质。判据取两类独立证据：
 *
 * 1. **共面证据（侧窗，主）**：开合件里的 `glass` 片就贴在车门内 18mm 处
 *    （实测门板 9.180 / 玻璃 9.198）。车身三角形若「正贴在某块玻璃片上方」，
 *    它所在的表面就是那块窗 —— 把漆面改判为玻璃，玻璃件本身保留（不删几何）。
 *    侧窗玻璃是曲面，多数三角形法线斜着走，纯几何带只能捞到 40 面，所以这条是主路径。
 * 2. **舱段证据（风挡 / 天幕 / 后窗 / 侧窗兜底）**：按「朝上/朝前/朝后/朝侧的
 *    法线 + 高于腰线 + 落在座舱纵向区间」筛。阈值由实测轮廓标定：
 *    车顶最高 1.43m、腰线约 0.95m、座舱纵向 -1.62…1.14m。
 *
 * ## 调用时机与幂等
 *
 * 车身模板与开合件模板的加载先后不确定，所以本函数在**两处**都会调用：
 * 车身就绪时（先用舱段证据建一版）、开合件就绪时（拿到玻璃片后再细化侧窗）。
 * 为支持这种「先建后细化」，实现是**从原始几何重建**而不是增量切分：
 * 首次调用把每个宿主网格的原始 geometry 记进模块级 `WeakMap`，后续调用先把
 * geometry 还原成原始，再重新切。否则第二次调用会把上一版已经切走的三角形当车身、
 * 再把上一版玻璃网格删掉 —— 净效果是风挡/天幕凭空消失。
 *
 * ## 边界
 *
 * - 只动材质名是 `smallcar-bodywork` / `car_tms` 的网格；内饰、轮子、灯腔不碰。
 * - 切分沿用原几何的 attribute（共享 `BufferAttribute`，只换 index），顶点不复制。
 * - 不写 `userData`：模板缓存会把 `userData` 一起打包，WeakMap 既能跨调用记住原始几何，
 *   又不会污染序列化结果。
 */

/** 承载车窗的车身材质名（漆面）。 */
const GLASS_HOST_MATERIALS = ['smallcar-bodywork', 'car_tms']

/**
 * 尾灯判据：车尾上沿、朝后、左右两侧各一条。
 *
 * 实测：尾灯在 `z < -2.16`（车尾最外沿）、`y` 0.74…0.96（腰线略下）、`|x| > 0.34`
 * （中间是牌照区，不能刷成红色）。原图上这块是暗红色，摘图后车尾只剩车漆。
 */
const TAILLIGHT = Object.freeze({
  maxLength: -2.16,
  minHeight: 0.74,
  maxHeight: 0.96,
  minAbsWidth: 0.34,
  maxNormalLength: -0.45,
})

/** 判定「贴在某块玻璃上方」的平面容差（米）。门板与玻璃件实测相距 18mm。 */
const COPLANAR_TOLERANCE = 0.06

/** 玻璃片 2D 范围的外扩容差（米），用来把窗框边缘一起收进来。 */
const PANE_EDGE_MARGIN = 0.02

/**
 * 座舱判定（世界坐标，单位米）。
 *
 * 实测标定（`小汽车-lite.glb` 挂上开合件后）：
 * - 世界包围盒 `X[-1.10,1.10] Y[0,1.43] Z[-2.51,2.50]`，Y 为高度、Z 为车长（+Z 朝前）；
 * - 车顶最高点 1.43m，腰线约 0.95m；
 * - 侧窗玻璃件 y 范围 0.95…1.33、z 范围 -1.75…0.83；
 * - 车顶纵剖面：z=-1.4 处 1.34、z=0 处 1.41、z=0.6 处 1.25、z=0.8 处 1.10（机舱盖）。
 */
const CABIN = Object.freeze({
  /** 座舱纵向区间：后窗下沿 → 风挡下沿。 */
  minLength: -1.62,
  maxLength: 1.14,
  /** 舱段法线门限：车顶朝上、风挡朝前、后窗朝后。 */
  roofNormalY: 0.55,
  glassNormalLength: 0.22,
  /** 朝前/朝后的面还要求接近水平（排除 A/C 柱这类竖直件）。 */
  maxAbsHeightNormal: 0.82,
  /** 高度下限：低于腰线的面一定是车漆（门板 / 翼子板）。 */
  minWindshieldHeight: 0.92,
  maxWindshieldHeight: 1.4,
  minRoofHeight: 1.315,
  minRearGlassHeight: 1.0,
  maxRearGlassHeight: 1.36,
  /** 车顶天幕的横向宽度，避免把车顶两侧的漆面轨道也吃掉。 */
  maxAbsWidthNormal: 0.92,
  /** 侧窗兜底（没有玻璃片时的近似）：朝侧、高于腰线、限在侧窗纵向区间。 */
  sideNormalX: 0.6,
  maxAbsSideNormalY: 0.5,
  minAbsSideCenterX: 0.45,
  minSideHeight: 0.94,
  maxSideHeight: 1.345,
  minSideLength: -1.75,
  maxSideLength: 0.95,
})

/** 宿主网格的原始几何（首次切分前的副本引用）。 */
const originalGeometryByHost = new WeakMap<object, any>()
/** 每台车生成过的网格，供再次调用时移除。 */
const shellsByModel = new WeakMap<object, any[]>()
/** 尾灯材质按车缓存，避免每次调用都新建材质。 */
const taillightMaterialByModel = new WeakMap<object, any>()

type ThreeApi = {
  BufferGeometry: new () => any
  Mesh: new (geometry: any, material: any) => any
  Vector3: new (x?: number, y?: number, z?: number) => any
}

type Vec3Like = any

/** 三角形顶点（世界坐标）。 */
const worldTriangle = (mesh: any, position: any, ia: number, ib: number, ic: number, out: Vec3Like[]) => {
  const read = (index: number, target: Vec3Like) => {
    target.set(position.getX(index), position.getY(index), position.getZ(index))
    const m = mesh.matrixWorld.elements
    const x = target.x
    const y = target.y
    const z = target.z
    target.set(
      m[0] * x + m[4] * y + m[8] * z + m[12],
      m[1] * x + m[5] * y + m[9] * z + m[13],
      m[2] * x + m[6] * y + m[10] * z + m[14],
    )
    return target
  }
  read(ia, out[0])
  read(ib, out[1])
  read(ic, out[2])
  return out
}

/** 三角形的世界法线（顶点法线平均，退化面不会给出 NaN）。 */
const worldNormal = (mesh: any, normal: any, ia: number, ib: number, ic: number, out: Vec3Like) => {
  const m = mesh.matrixWorld.elements
  let x = 0
  let y = 0
  let z = 0
  for (const index of [ia, ib, ic]) {
    const nx = normal.getX(index)
    const ny = normal.getY(index)
    const nz = normal.getZ(index)
    // 法线用 3×3 线性部分（去掉平移），再归一化。
    x += m[0] * nx + m[4] * ny + m[8] * nz
    y += m[1] * nx + m[5] * ny + m[9] * nz
    z += m[2] * nx + m[6] * ny + m[10] * nz
  }
  const length = Math.hypot(x, y, z)
  if (length < 1e-9) return out.set(0, 0, 0)
  return out.set(x / length, y / length, z / length)
}

/** 一块玻璃片的局部坐标系，用于「点是否落在这块玻璃的 2D 范围内」。 */
type GlassPane = {
  origin: Vec3Like
  normal: Vec3Like
  axisU: Vec3Like
  axisV: Vec3Like
  bx: number
  by: number
  cx: number
  cy: number
  denominator: number
  /** 三角形面积的平方根，用来把「米」换算成重心坐标容差。 */
  scale: number
}

/** 收集所有玻璃片三角形（来自已挂载的开合件）。 */
function collectGlassPanes(three: ThreeApi, carModel: any): GlassPane[] {
  const panes: GlassPane[] = []
  const corners = [new three.Vector3(), new three.Vector3(), new three.Vector3()]
  const edge1 = new three.Vector3()
  const edge2 = new three.Vector3()
  const normal = new three.Vector3()
  const dot = (a: Vec3Like, b: Vec3Like) => a.x * b.x + a.y * b.y + a.z * b.z
  carModel.updateMatrixWorld?.(true)
  carModel.traverse?.((mesh: any) => {
    if (!mesh?.isMesh) return
    const materialName = String([mesh.material].flat()[0]?.name ?? '')
    if (!/^glass/i.test(materialName)) return
    const geometry = mesh.geometry
    const position = geometry?.attributes?.position
    if (!position) return
    const index = geometry.index
    const count = index ? index.count : position.count
    for (let corner = 0; corner < count; corner += 3) {
      const ia = index ? index.getX(corner) : corner
      const ib = index ? index.getX(corner + 1) : corner + 1
      const ic = index ? index.getX(corner + 2) : corner + 2
      worldTriangle(mesh, position, ia, ib, ic, corners)
      edge1.set(corners[1].x - corners[0].x, corners[1].y - corners[0].y, corners[1].z - corners[0].z)
      edge2.set(corners[2].x - corners[0].x, corners[2].y - corners[0].y, corners[2].z - corners[0].z)
      normal.set(
        edge1.y * edge2.z - edge1.z * edge2.y,
        edge1.z * edge2.x - edge1.x * edge2.z,
        edge1.x * edge2.y - edge1.y * edge2.x,
      )
      const length = Math.hypot(normal.x, normal.y, normal.z)
      if (!(length > 1e-12)) continue
      normal.multiplyScalar(1 / length)
      const axisU = edge1.clone().normalize()
      const axisV = new three.Vector3().crossVectors(normal, axisU).normalize()
      const bx = dot(edge1, axisU)
      const by = dot(edge1, axisV)
      const cx = dot(edge2, axisU)
      const cy = dot(edge2, axisV)
      const denominator = (by - cy) * (0 - cx) + (cx - bx) * (0 - cy)
      if (Math.abs(denominator) < 1e-14) continue
      panes.push({
        origin: { x: corners[0].x, y: corners[0].y, z: corners[0].z },
        normal: { x: normal.x, y: normal.y, z: normal.z },
        axisU,
        axisV,
        bx,
        by,
        cx,
        cy,
        denominator,
        scale: Math.sqrt(Math.abs(denominator)),
      })
    }
  })
  return panes
}

/** 点是否「正贴」在某块玻璃片的上方（平面距离 + 三角形内 + 外扩容差）。 */
function overGlassPane(panes: GlassPane[], point: Vec3Like): boolean {
  for (const pane of panes) {
    const rx = point.x - pane.origin.x
    const ry = point.y - pane.origin.y
    const rz = point.z - pane.origin.z
    const planeDistance = rx * pane.normal.x + ry * pane.normal.y + rz * pane.normal.z
    if (Math.abs(planeDistance) > COPLANAR_TOLERANCE) continue
    const u = rx * pane.axisU.x + ry * pane.axisU.y + rz * pane.axisU.z
    const v = rx * pane.axisV.x + ry * pane.axisV.y + rz * pane.axisV.z
    const l1 = ((pane.by - pane.cy) * (u - pane.cx) + (pane.cx - pane.bx) * (v - pane.cy)) / pane.denominator
    const l2 = ((pane.cy - 0) * (u - pane.cx) + (0 - pane.bx) * (v - pane.cy)) / pane.denominator
    const l3 = 1 - l1 - l2
    const tolerance = PANE_EDGE_MARGIN / Math.max(1e-6, pane.scale)
    if (l1 > -tolerance && l2 > -tolerance && l3 > -tolerance) return true
  }
  return false
}

/** 该三角形是否属于「玻璃舱」（风挡 / 天幕 / 后窗 / 侧窗兜底）。 */
function inGlassCabin(center: Vec3Like, normal: Vec3Like): boolean {
  if (center.z < CABIN.minLength || center.z > CABIN.maxLength) {
    // 侧窗的纵向区间比座舱略长（后三角窗在 -1.75 一带），单独判。
    return inSideWindow(center, normal)
  }
  const horizontal = Math.abs(normal.y) < CABIN.maxAbsHeightNormal
  // 车顶天幕：朝上、高于车顶腰线、且不靠到车顶两侧的漆面轨道。
  if (normal.y > CABIN.roofNormalY && center.y > CABIN.minRoofHeight && Math.abs(normal.z) < CABIN.maxAbsWidthNormal) {
    return true
  }
  // 前挡：朝前、落在地平线以上到车顶之间。
  if (
    horizontal &&
    normal.z > CABIN.glassNormalLength &&
    center.y > CABIN.minWindshieldHeight &&
    center.y < CABIN.maxWindshieldHeight
  ) {
    return true
  }
  // 后窗：朝后、只取后窗带宽（后风挡在 -1.3 之后，比车顶低）。
  if (
    horizontal &&
    normal.z < -CABIN.glassNormalLength &&
    center.y > CABIN.minRearGlassHeight &&
    center.y < CABIN.maxRearGlassHeight
  ) {
    return true
  }
  return inSideWindow(center, normal)
}

/** 侧窗兜底：没有玻璃片时按「朝侧 + 腰线以上 + 侧窗纵向区间」近似。 */
function inSideWindow(center: Vec3Like, normal: Vec3Like): boolean {
  return (
    Math.abs(normal.x) > CABIN.sideNormalX &&
    Math.abs(normal.y) < CABIN.maxAbsSideNormalY &&
    Math.abs(center.x) > CABIN.minAbsSideCenterX &&
    center.y >= CABIN.minSideHeight &&
    center.y <= CABIN.maxSideHeight &&
    center.z >= CABIN.minSideLength &&
    center.z <= CABIN.maxSideLength
  )
}

/** 拷贝一份「只含给定角标」的几何：attribute 共享，仅换 index。 */
function subsetGeometry(three: ThreeApi, geometry: any, indices: number[]): any {
  const next = new three.BufferGeometry()
  for (const [name, attribute] of Object.entries(geometry.attributes ?? {})) next.setAttribute(name, attribute)
  next.setIndex(indices)
  return next
}

export type CarGlassShellOptions = {
  /** 玻璃材质来源（开合件里的 `glass`）；缺省时新建一个深色半透明材质。 */
  glassMaterial?: any
  /** 尾灯材质（暗红 + 自发光）；不给则沿用上次 / 不切尾灯带。 */
  taillightMaterial?: any
}

/**
 * 为 `smallcar` 重建玻璃舱（含尾灯带）。返回本轮生成的网格（无可切内容时返回 `null`）。
 *
 * 幂等且可重复调用：每次都从**原始车身几何**重新切，所以「先按几何建一版、拿到开合件
 * 玻璃片后再细化」不会丢面。
 */
export function prepareCarGlassShell(three: ThreeApi, carModel: any, options: CarGlassShellOptions = {}) {
  if (!carModel?.traverse || !three?.BufferGeometry) return null
  carModel.updateMatrixWorld?.(true)

  // 1) 撤掉上一轮生成物。
  const previousShells = shellsByModel.get(carModel) ?? []
  for (const mesh of previousShells) {
    mesh?.parent?.remove?.(mesh)
    mesh?.geometry?.dispose?.()
  }
  const created: any[] = []
  shellsByModel.set(carModel, created)

  // 2) 宿主网格的几何先还原成原始（首次调用时记录），保证重复调用结果一致。
  const hostMeshes: any[] = []
  carModel.traverse?.((mesh: any) => {
    if (!mesh?.isMesh) return
    const materialName = String([mesh.material].flat()[0]?.name ?? '')
    if (!GLASS_HOST_MATERIALS.includes(materialName)) return
    hostMeshes.push(mesh)
  })
  for (const mesh of hostMeshes) {
    const original = originalGeometryByHost.get(mesh)
    if (original) mesh.geometry = original
    else originalGeometryByHost.set(mesh, mesh.geometry)
  }

  const panes = collectGlassPanes(three, carModel)
  const glassMaterial =
    options.glassMaterial ??
    (() => {
      const fallback = { color: 0x0d1319, roughness: 0.08, metalness: 0.02, transparent: true, opacity: 0.42 }
      return { name: 'smallcar-glass', ...fallback, isMaterial: true }
    })()

  const corners = [new three.Vector3(), new three.Vector3(), new three.Vector3()]
  const normal = new three.Vector3()
  const center = new three.Vector3()

  for (const mesh of hostMeshes) {
    const geometry = mesh.geometry
    const position = geometry?.attributes?.position
    const vertexNormal = geometry?.attributes?.normal
    if (!position || !vertexNormal) continue
    const index = geometry.index
    const count = index ? index.count : position.count
    const glassIndices: number[] = []
    const taillightIndices: number[] = []
    const bodyIndices: number[] = []
    for (let corner = 0; corner < count; corner += 3) {
      const ia = index ? index.getX(corner) : corner
      const ib = index ? index.getX(corner + 1) : corner + 1
      const ic = index ? index.getX(corner + 2) : corner + 2
      worldTriangle(mesh, position, ia, ib, ic, corners)
      worldNormal(mesh, vertexNormal, ia, ib, ic, normal)
      center.set(
        (corners[0].x + corners[1].x + corners[2].x) / 3,
        (corners[0].y + corners[1].y + corners[2].y) / 3,
        (corners[0].z + corners[1].z + corners[2].z) / 3,
      )
      const isTaillight =
        Boolean(options.taillightMaterial) &&
        normal.z < TAILLIGHT.maxNormalLength &&
        center.z < TAILLIGHT.maxLength &&
        center.y > TAILLIGHT.minHeight &&
        center.y < TAILLIGHT.maxHeight &&
        Math.abs(center.x) > TAILLIGHT.minAbsWidth
      if (isTaillight) taillightIndices.push(ia, ib, ic)
      else if ((panes.length && overGlassPane(panes, center)) || inGlassCabin(center, normal)) {
        glassIndices.push(ia, ib, ic)
      } else bodyIndices.push(ia, ib, ic)
    }
    if (!glassIndices.length && !taillightIndices.length) continue

    const parent = mesh.parent ?? carModel
    if (taillightIndices.length) {
      const taillightMaterial = options.taillightMaterial ?? taillightMaterialByModel.get(carModel)
      if (taillightMaterial) {
        taillightMaterialByModel.set(carModel, taillightMaterial)
        const taillightMesh = new three.Mesh(subsetGeometry(three, geometry, taillightIndices), taillightMaterial)
        taillightMesh.name = `${mesh.name || 'body'}-taillight`
        taillightMesh.castShadow = false
        taillightMesh.receiveShadow = false
        parent.add?.(taillightMesh)
        created.push(taillightMesh)
      }
    }
    // 原网格只保留车身部分（几何重建，不动顶点数据）。
    mesh.geometry = subsetGeometry(three, geometry, bodyIndices)
    if (!glassIndices.length) continue

    const glassMesh = new three.Mesh(subsetGeometry(three, geometry, glassIndices), glassMaterial)
    glassMesh.name = `${mesh.name || 'body'}-glass`
    glassMesh.castShadow = false
    glassMesh.receiveShadow = mesh.receiveShadow === true
    parent.add?.(glassMesh)
    created.push(glassMesh)
  }

  return created.length ? created : null
}
