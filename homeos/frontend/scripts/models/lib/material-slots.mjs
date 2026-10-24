/**
 * 材质槽位 ↔ 几何构件的对应关系。
 *
 * 为什么单独一层：材质槽位的语义（哪个槽是门板、哪个是玻璃）只能从**几何证据**反推——
 * 面积占比说明它是主体还是饰条，薄厚比说明它是板件还是型材，竖向位置带说明它是底座还是台面。
 * 这一层只做「测量」，不做判断；角色与配方仍来自运行时解析器。
 *
 * 只读 GLB 的 JSON + BIN，不依赖 glTF-Transform，方便审计脚本在没有 Draco 解码器的环境下
 * 也能对未压缩文件出结论。Draco 压缩的变体会显式返回 `null` 指纹（而不是猜）。
 */
import { readGlbFile } from './glb-io.mjs'

const COMPONENT = {
  5120: { array: Int8Array, size: 1 },
  5121: { array: Uint8Array, size: 1 },
  5122: { array: Int16Array, size: 2 },
  5123: { array: Uint16Array, size: 2 },
  5125: { array: Uint32Array, size: 4 },
  5126: { array: Float32Array, size: 4 },
}

const TYPE_SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 }

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

/** glTF 列主序 16 元组 → 行主序 4×4。 */
function fromColumnMajor(array) {
  const m = new Array(16)
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) m[row * 4 + col] = array[col * 4 + row]
  }
  return m
}

/** 行主序 4×4 乘法。 */
export function multiply(a, b) {
  const out = new Array(16)
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      let sum = 0
      for (let k = 0; k < 4; k += 1) sum += a[row * 4 + k] * b[k * 4 + col]
      out[row * 4 + col] = sum
    }
  }
  return out
}

/** 节点的局部矩阵：matrix 优先，否则 TRS。 */
export function localMatrix(node) {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) return fromColumnMajor(node.matrix)
  const [tx, ty, tz] = node.translation ?? [0, 0, 0]
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1]
  const [sx, sy, sz] = node.scale ?? [1, 1, 1]
  const x2 = qx + qx
  const y2 = qy + qy
  const z2 = qz + qz
  const xx = qx * x2
  const xy = qx * y2
  const xz = qx * z2
  const yy = qy * y2
  const yz = qy * z2
  const zz = qz * z2
  const wx = qw * x2
  const wy = qw * y2
  const wz = qw * z2
  return [
    (1 - (yy + zz)) * sx, (xy - wz) * sx, (xz + wy) * sx, tx,
    (xy + wz) * sy, (1 - (xx + zz)) * sy, (yz - wx) * sy, ty,
    (xz - wy) * sz, (yz + wx) * sz, (1 - (xx + yy)) * sz, tz,
    0, 0, 0, 1,
  ]
}

/** 每个节点的世界矩阵，按 node 下标索引。 */
export function nodeWorldMatrices(json) {
  const matrices = new Array((json.nodes ?? []).length).fill(null)
  const nodes = json.nodes ?? []
  const walk = (index, parent) => {
    const node = nodes[index]
    if (!node) return
    const world = multiply(parent, localMatrix(node))
    matrices[index] = world
    for (const child of node.children ?? []) walk(child, world)
  }
  const sceneIndex = typeof json.scene === 'number' ? json.scene : 0
  const scene = (json.scenes ?? [])[sceneIndex]
  if (scene) for (const root of scene.nodes ?? []) walk(root, IDENTITY)
  nodes.forEach((_, index) => {
    if (!matrices[index]) matrices[index] = IDENTITY
  })
  return matrices
}

const readComponent = (bin, arrayType, offset) => {
  if (arrayType === Float32Array) return bin.readFloatLE(offset)
  if (arrayType === Uint32Array) return bin.readUInt32LE(offset)
  if (arrayType === Uint16Array) return bin.readUInt16LE(offset)
  if (arrayType === Uint8Array) return bin.readUInt8(offset)
  if (arrayType === Int16Array) return bin.readInt16LE(offset)
  return bin.readInt8(offset)
}

/** 读 accessor → 扁平 typed array（支持 byteStride 与 sparse）。 */
export function readAccessor(json, bin, index) {
  const accessor = (json.accessors ?? [])[index]
  if (!accessor) throw new Error(`accessor ${index} 不存在`)
  const component = COMPONENT[accessor.componentType]
  const width = TYPE_SIZE[accessor.type]
  if (!component || !width) throw new Error(`accessor ${index} 的 componentType/type 不支持`)
  const count = accessor.count
  const out = new Float64Array(count * width)
  const view = typeof accessor.bufferView === 'number' ? (json.bufferViews ?? [])[accessor.bufferView] : null
  if (view) {
    const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
    const stride = view.byteStride && view.byteStride > 0 ? view.byteStride : component.size * width
    if (!bin || bin.length < base) throw new Error(`accessor ${index} 的 bufferView 越过 BIN 末尾`)
    for (let i = 0; i < count; i += 1) {
      for (let j = 0; j < width; j += 1) {
        out[i * width + j] = readComponent(bin, component.array, base + i * stride + j * component.size)
      }
    }
  }
  if (accessor.sparse) {
    const { sparse } = accessor
    const indicesView = json.bufferViews[sparse.indices.bufferView]
    const valuesView = json.bufferViews[sparse.values.bufferView]
    const indexComponent = COMPONENT[sparse.indices.componentType]
    const indexBase = (indicesView.byteOffset ?? 0) + (sparse.indices.byteOffset ?? 0)
    const valueBase = (valuesView.byteOffset ?? 0) + (sparse.values.byteOffset ?? 0)
    for (let s = 0; s < sparse.count; s += 1) {
      const target = readComponent(bin, indexComponent.array, indexBase + s * indexComponent.size)
      for (let j = 0; j < width; j += 1) {
        out[target * width + j] = readComponent(bin, component.array, valueBase + (s * width + j) * component.size)
      }
    }
  }
  return { values: out, width, count }
}

/** 是否 Draco 压缩（POSITION 不是可直读的 accessor）。 */
export function isDracoCompressed(json) {
  return (json.extensionsRequired ?? []).includes('KHR_draco_mesh_compression')
}

const positionKey = (x, y, z, tolerance = 1e-5) =>
  `${Math.round(x / tolerance)}|${Math.round(y / tolerance)}|${Math.round(z / tolerance)}`

function ensureSlot(map, materialIndex) {
  let slot = map.get(materialIndex)
  if (!slot) {
    slot = {
      triangles: 0,
      area: 0,
      shells: 0,
      primitives: 0,
      volume: 0,
      min: [Infinity, Infinity, Infinity],
      max: [-Infinity, -Infinity, -Infinity],
    }
    map.set(materialIndex, slot)
  }
  return slot
}

/**
 * 逐材质聚合几何指纹。
 *
 * - `areaShare`：该槽位的世界面积 / 模型总世界面积；
 * - `thinness`：槽位包围盒「最小边 / 最大边」，板件接近 0，块体接近 1；
 * - `yBand`：槽位质心在模型竖向的归一化位置（0 = 底，1 = 顶）；
 * - `shells`：按位置焊接后的连通壳数（区分「一体柜体」与「散件拼装」）；
 * - `offset`：槽位质心相对模型中心的偏移（判断门板/把手在正面还是背面）。
 */
export function slotGeometry(json, bin, { weldTolerance = 1e-4 } = {}) {
  const slots = new Map()
  const primitives = []
  const matrices = nodeWorldMatrices(json)
  const meshes = json.meshes ?? []
  const nodes = json.nodes ?? []
  const modelMin = [Infinity, Infinity, Infinity]
  const modelMax = [-Infinity, -Infinity, -Infinity]

  const meshUses = new Map()
  nodes.forEach((node, nodeIndex) => {
    if (typeof node.mesh !== 'number') return
    const list = meshUses.get(node.mesh) ?? []
    list.push(nodeIndex)
    meshUses.set(node.mesh, list)
  })

  let skipped = false
  for (const [meshIndex, mesh] of meshes.entries()) {
    const owners = meshUses.get(meshIndex) ?? []
    if (!owners.length) continue
    for (const primitive of mesh.primitives ?? []) {
      const positionAccessor = primitive.attributes?.POSITION
      if (typeof positionAccessor !== 'number' || primitive.extensions?.KHR_draco_mesh_compression) {
        skipped = true
        continue
      }
      let positions
      let indices
      try {
        positions = readAccessor(json, bin, positionAccessor)
        indices = typeof primitive.indices === 'number'
          ? readAccessor(json, bin, primitive.indices).values
          : null
      } catch {
        skipped = true
        continue
      }
      const triCount = indices ? Math.floor(indices.length / 3) : Math.floor(positions.count / 3)
      const materialIndex = typeof primitive.material === 'number' ? primitive.material : null
      for (const nodeIndex of owners) {
        const matrix = matrices[nodeIndex] ?? IDENTITY
        const slot = materialIndex === null ? null : ensureSlot(slots, materialIndex)
        const localMin = [Infinity, Infinity, Infinity]
        const localMax = [-Infinity, -Infinity, -Infinity]
        let area = 0
        let volume = 0
        const keys = new Map()
        const parent = new Int32Array(positions.count)
        for (let i = 0; i < parent.length; i += 1) parent[i] = i
        const find = (a) => {
          let root = a
          while (parent[root] !== root) root = parent[root]
          while (parent[a] !== root) {
            const next = parent[a]
            parent[a] = root
            a = next
          }
          return root
        }
        const union = (a, b) => {
          const ra = find(a)
          const rb = find(b)
          if (ra !== rb) parent[rb] = ra
        }
        for (let i = 0; i < positions.count; i += 1) {
          const x = positions.values[i * 3]
          const y = positions.values[i * 3 + 1]
          const z = positions.values[i * 3 + 2]
          const wx = matrix[0] * x + matrix[1] * y + matrix[2] * z + matrix[3]
          const wy = matrix[4] * x + matrix[5] * y + matrix[6] * z + matrix[7]
          const wz = matrix[8] * x + matrix[9] * y + matrix[10] * z + matrix[11]
          positions.values[i * 3] = wx
          positions.values[i * 3 + 1] = wy
          positions.values[i * 3 + 2] = wz
          for (let a = 0; a < 3; a += 1) {
            const value = a === 0 ? wx : a === 1 ? wy : wz
            if (value < localMin[a]) localMin[a] = value
            if (value > localMax[a]) localMax[a] = value
            if (value < modelMin[a]) modelMin[a] = value
            if (value > modelMax[a]) modelMax[a] = value
          }
          const key = positionKey(wx, wy, wz, weldTolerance)
          const seen = keys.get(key)
          if (seen === undefined) keys.set(key, i)
          else union(seen, i)
        }
        let shells = 0
        for (let i = 0; i < parent.length; i += 1) if (find(i) === i) shells += 1
        for (let t = 0; t < triCount; t += 1) {
          const i0 = indices ? indices[t * 3] : t * 3
          const i1 = indices ? indices[t * 3 + 1] : t * 3 + 1
          const i2 = indices ? indices[t * 3 + 2] : t * 3 + 2
          const ax = positions.values[i0 * 3]
          const ay = positions.values[i0 * 3 + 1]
          const az = positions.values[i0 * 3 + 2]
          const bx = positions.values[i1 * 3]
          const by = positions.values[i1 * 3 + 1]
          const bz = positions.values[i1 * 3 + 2]
          const cx = positions.values[i2 * 3]
          const cy = positions.values[i2 * 3 + 1]
          const cz = positions.values[i2 * 3 + 2]
          const ux = bx - ax
          const uy = by - ay
          const uz = bz - az
          const vx = cx - ax
          const vy = cy - ay
          const vz = cz - az
          const nx = uy * vz - uz * vy
          const ny = uz * vx - ux * vz
          const nz = ux * vy - uy * vx
          area += Math.sqrt(nx * nx + ny * ny + nz * nz) / 2
          volume += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6
        }
        primitives.push({ materialIndex, triangles: triCount, area, shells })
        if (slot) {
          slot.triangles += triCount
          slot.area += area
          slot.shells += shells
          slot.primitives += 1
          slot.volume += volume
          for (let a = 0; a < 3; a += 1) {
            if (localMin[a] < slot.min[a]) slot.min[a] = localMin[a]
            if (localMax[a] > slot.max[a]) slot.max[a] = localMax[a]
          }
        }
      }
    }
  }

  const modelSize = [0, 1, 2].map((a) => modelMax[a] - modelMin[a]).map((v) => (Number.isFinite(v) ? v : 0))
  const modelArea = [...slots.values()].reduce((sum, slot) => sum + slot.area, 0)
  const modelCenter = [0, 1, 2].map((a) => (modelMin[a] + modelMax[a]) / 2)
  const fingerprints = new Map()
  for (const [materialIndex, slot] of slots) {
    const size = [0, 1, 2].map((a) => slot.max[a] - slot.min[a])
    const maxExtent = Math.max(...size, 1e-9)
    const minExtent = Math.min(...size)
    const center = [0, 1, 2].map((a) => (slot.min[a] + slot.max[a]) / 2)
    fingerprints.set(materialIndex, {
      materialIndex,
      triangles: slot.triangles,
      primitives: slot.primitives,
      area: Number(slot.area.toFixed(5)),
      areaShare: modelArea > 0 ? Number((slot.area / modelArea).toFixed(3)) : 0,
      size: size.map((v) => Number(v.toFixed(3))),
      thinness: Number((minExtent / maxExtent).toFixed(3)),
      yBand: modelSize[1] > 0 && Number.isFinite(slot.min[1])
        ? Number(Math.max(0, Math.min(1, (center[1] - modelMin[1]) / modelSize[1])).toFixed(2))
        : null,
      offset: [0, 1, 2].map((a) => Number((center[a] - modelCenter[a]).toFixed(3))),
      shells: slot.shells,
      volume: Number(slot.volume.toFixed(5)),
      inverted: slot.volume < 0 && Math.abs(slot.volume) > 1e-6,
      anchor: [0, 1, 2].map((a) => Number((slot.min[a] - modelMin[a]).toFixed(3))),
    })
  }

  return {
    fingerprints,
    primitives,
    skipped,
    modelMin: modelMin.map((v) => Number(v.toFixed(4))),
    modelMax: modelMax.map((v) => Number(v.toFixed(4))),
    modelSize: modelSize.map((v) => Number(v.toFixed(3))),
    modelArea: Number(modelArea.toFixed(4)),
  }
}

/**
 * 枚举一个 GLB 的槽位（材质下标 → 名称 / 是否被引用 / 几何指纹）。
 *
 * 材质**永远来自被枚举的那个文件**：lite 就是运行时真正加载的件，它的槽位集合才是
 * 契约 / 门禁要比对的真值。
 *
 * 几何指纹是唯一允许借用完整件的东西：lite 用 Draco 压缩，纯 JS 解不出顶点，于是
 * 指纹退回完整件计算。借用时按**材质名**对齐（不按下标），lite 缺的槽位没有指纹，
 * 避免「lite 少几个槽位」被完整件的下标掩盖成「两者一致」—— 那正是 2026-10-24 之前
 * `check:slots` 报 0 处漂移、审计却报 9 处 C4 的原因。
 */
export function enumerateSlots(filePath, { fullPath = null } = {}) {
  const parsed = readGlbFile(filePath)
  const source = filePath
  const { json, bin } = parsed
  const materials = json.materials ?? []
  let geometry = isDracoCompressed(json) ? null : slotGeometry(json, bin)
  let geometrySource = geometry ? 'self' : null
  if (!geometry && fullPath && fullPath !== filePath) {
    try {
      const full = readGlbFile(fullPath)
      if (!isDracoCompressed(full.json)) {
        geometry = slotGeometry(full.json, full.bin)
        geometrySource = 'full'
      }
    } catch {
      geometry = null
    }
  }
  const used = new Set()
  const primitiveMaterialCount = new Map()
  let missingMaterial = 0
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      if (typeof primitive.material !== 'number') {
        missingMaterial += 1
        continue
      }
      used.add(primitive.material)
      primitiveMaterialCount.set(primitive.material, (primitiveMaterialCount.get(primitive.material) ?? 0) + 1)
    }
  }
  /**
   * 借用完整件指纹时按材质名对齐：lite 与完整件的下标顺序在导出漂移后并不可靠
   * （lite 会整段丢掉槽位），名字才是两件之间唯一稳定的键。
   */
  const fingerprintByName =
    geometrySource === 'full'
      ? new Map(
          (readGlbFile(fullPath).json.materials ?? []).map((material, index) => [
            String(material.name ?? '').toLowerCase(),
            geometry?.fingerprints.get(index) ?? null,
          ]),
        )
      : null
  const slots = materials.map((material, index) => {
    const fingerprint =
      (fingerprintByName
        ? fingerprintByName.get(String(material.name ?? '').toLowerCase())
        : geometry?.fingerprints.get(index)) ?? null
    const pbr = material.pbrMetallicRoughness ?? {}
    return {
      index,
      name: material.name ?? '',
      used: used.has(index),
      primitiveCount: primitiveMaterialCount.get(index) ?? 0,
      alphaMode: material.alphaMode ?? 'OPAQUE',
      alphaCutoff: typeof material.alphaCutoff === 'number' ? material.alphaCutoff : null,
      doubleSided: material.doubleSided === true,
      emissiveFactor: Array.isArray(material.emissiveFactor) ? material.emissiveFactor : null,
      baseColorFactor: Array.isArray(pbr.baseColorFactor) ? pbr.baseColorFactor : null,
      metallicFactor: typeof pbr.metallicFactor === 'number' ? pbr.metallicFactor : null,
      roughnessFactor: typeof pbr.roughnessFactor === 'number' ? pbr.roughnessFactor : null,
      fingerprint,
    }
  })
  return {
    file: source,
    materialCount: materials.length,
    slots,
    missingMaterialPrimitives: missingMaterial,
    geometryAvailable: Boolean(geometry),
    geometrySkipped: geometry?.skipped ?? false,
    /** 指纹来自哪个文件：`self` 本文件、`full` 借完整件（lite 是 Draco）。 */
    geometrySource,
    modelSize: geometry?.modelSize ?? null,
    modelArea: geometry?.modelArea ?? null,
  }
}

/** 槽位集合指纹（改名/顺序比对用）。 */
export function slotSignature(enumeration) {
  return enumeration.slots.map((slot) => `${slot.index}:${slot.name}`).join('|')
}
