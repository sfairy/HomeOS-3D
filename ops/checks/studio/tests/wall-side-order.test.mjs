/**
 * `prepareWallSideOrder`（0.8.1 新增）的契约测试。
 *
 * 它做的是**每帧重排合并墙带的 index buffer**：半透明墙带的三角形顺序固定，站到墙背面
 * 看，近侧墙会被远侧墙挡住，表现成「墙面一层雾」。失败模式都是视觉问题，不会抛异常，
 * 所以把这些静态可断言的点钉死：
 *
 * - 面朝向不同的两个三角形，必须「背向的先写、朝向的后写」（半透明走 back-to-front）；
 * - 相机侧写没变化时不得再动 index buffer（否则每帧上传 1 份索引，帧率掉但不报错）；
 * - 只要重排过就必须把 `forceSinglePass` 打开（否则 three 会再画一遍背面，重排白做），
 *   并在 dispose 时还原成 `false`；
 * - 不满足条件的网格（不透明 / 非合并墙带 / 已有索引 / 无侧面材质）必须返回 `null`
 *   且**不碰**几何体。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const moduleUrl = fileURLToPath(
  new URL(
    '../../../../homeos/frontend/src/studio/app/3d-studio/materials/studio-wall-materials.ts',
    import.meta.url,
  ),
)
const { prepareWallSideOrder } = await import(moduleUrl)

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
const isIdentity = (elements) => elements.every((value, index) => value === IDENTITY[index])

class FakeMatrix4 {
  constructor(elements = [...IDENTITY]) {
    this.elements = elements
  }
  equals(other) {
    return this.elements.every((value, index) => value === other.elements[index])
  }
  copy(other) {
    this.elements = [...other.elements]
    return this
  }
  // 测试里所有网格的世界矩阵都是单位矩阵，只支持这一种逆矩阵。
  invert() {
    assert.ok(isIdentity(this.elements), 'fake Matrix4.invert 只支持单位矩阵')
    this.elements = [...IDENTITY]
    return this
  }
}

class FakeVector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x
    this.y = y
    this.z = z
  }
  fromBufferAttribute(attribute, index) {
    return this.set(attribute.getX(index), attribute.getY(index), attribute.getZ(index))
  }
  set(x, y, z) {
    ;(this.x = x), (this.y = y), (this.z = z)
    return this
  }
  sub(vector) {
    return this.set(this.x - vector.x, this.y - vector.y, this.z - vector.z)
  }
  cross(vector) {
    const { x, y, z } = this
    return this.set(y * vector.z - z * vector.y, z * vector.x - x * vector.z, x * vector.y - y * vector.x)
  }
  dot(vector) {
    return this.x * vector.x + this.y * vector.y + this.z * vector.z
  }
  applyMatrix4(matrix) {
    const e = matrix.elements
    const { x, y, z } = this
    return this.set(
      e[0] * x + e[4] * y + e[8] * z + e[12],
      e[1] * x + e[5] * y + e[9] * z + e[13],
      e[2] * x + e[6] * y + e[10] * z + e[14],
    )
  }
}

class FakeVector4 {
  constructor(x = 0, y = 0, z = 0, w = 0) {
    ;(this.x = x), (this.y = y), (this.z = z), (this.w = w)
  }
  set(x, y, z, w) {
    ;(this.x = x), (this.y = y), (this.z = z), (this.w = w)
    return this
  }
  copy(vector) {
    return this.set(vector.x, vector.y, vector.z, vector.w)
  }
  applyMatrix4(matrix) {
    const e = matrix.elements
    const { x, y, z, w } = this
    return this.set(
      e[0] * x + e[4] * y + e[8] * z + e[12] * w,
      e[1] * x + e[5] * y + e[9] * z + e[13] * w,
      e[2] * x + e[6] * y + e[10] * z + e[14] * w,
      e[3] * x + e[7] * y + e[11] * z + e[15] * w,
    )
  }
  multiplyScalar(scale) {
    return this.set(this.x * scale, this.y * scale, this.z * scale, this.w * scale)
  }
  equals(vector) {
    return this.x === vector.x && this.y === vector.y && this.z === vector.z && this.w === vector.w
  }
}

class FakeBufferAttribute {
  constructor(array, itemSize) {
    this.array = array
    this.itemSize = itemSize
    this.version = 0
    this.needsUpdate = false
  }
  setUsage() {
    return this
  }
}

const THREE = {
  Matrix4: FakeMatrix4,
  Vector3: FakeVector3,
  Vector4: FakeVector4,
  BufferAttribute: FakeBufferAttribute,
  DynamicDrawUsage: 35048,
  DoubleSide: 2,
  BackSide: 1,
}

// 两个三角形，法线一正一负：A 的 +z 面向相机，B 的 -z 背向相机。
const POSITIONS = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0]

function createPositionAttribute() {
  const attribute = new FakeBufferAttribute(new Float32Array(POSITIONS), 3)
  attribute.count = POSITIONS.length / 3
  attribute.isInterleavedBufferAttribute = false
  attribute.getX = (index) => POSITIONS[index * 3]
  attribute.getY = (index) => POSITIONS[index * 3 + 1]
  attribute.getZ = (index) => POSITIONS[index * 3 + 2]
  return attribute
}

function createMesh({ transparent = true, merged = true } = {}) {
  const listeners = new Map()
  const geometry = {
    index: null,
    attributes: { position: createPositionAttribute() },
    groups: [{ materialIndex: 1, start: 0, count: 6 }],
    drawRange: { start: 0, count: Infinity },
    setIndex(index) {
      this.index = index
    },
    addEventListener(type, listener) {
      listeners.set(type, listener)
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type)
    },
    dispose() {
      listeners.get('dispose')?.()
    },
  }
  const sideMaterial = {
    isMeshPhysicalMaterial: true,
    transparent,
    side: THREE.DoubleSide,
    forceSinglePass: false,
  }
  const mesh = {
    geometry,
    material: [{ isMeshPhysicalMaterial: false }, sideMaterial],
    userData: merged ? { hbMergeWallBand: true } : {},
    matrixWorld: new FakeMatrix4(),
    onBeforeRender: null,
  }
  return { mesh, geometry, sideMaterial }
}

function createCamera({ flipZ = false } = {}) {
  return {
    matrixWorld: new FakeMatrix4(),
    projectionMatrixInverse: new FakeMatrix4(flipZ ? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1] : undefined),
    isOrthographicCamera: true,
  }
}

function render(mesh, camera) {
  const group = mesh.geometry.groups[0]
  mesh.onBeforeRender(
    {},
    {},
    camera,
    mesh.geometry,
    mesh.material[1],
    group,
  )
}

test('prepareWallSideOrder：背向三角形先写、朝向三角形后写', () => {
  const { mesh, geometry, sideMaterial } = createMesh()
  const stats = prepareWallSideOrder(THREE, mesh)
  assert.ok(stats, '合并墙带应返回统计对象')
  assert.equal(geometry.index.array.length, 6, '索引数量应与顶点数一致')

  render(mesh, createCamera())

  // 正交相机的视线朝 -z：A（顶点 0/1/2，法线 +z）背向相机，先写；B 后写。
  assert.deepEqual(Array.from(geometry.index.array), [0, 1, 2, 3, 4, 5])
  assert.equal(stats.sorts, 1)
  assert.equal(sideMaterial.forceSinglePass, true, '重排后必须关闭双面第二次绘制')
  assert.equal(geometry.index.needsUpdate, true)
})

test('prepareWallSideOrder：相机侧写不变时不再上传索引', () => {
  const { mesh, geometry } = createMesh()
  const stats = prepareWallSideOrder(THREE, mesh)
  const camera = createCamera()

  render(mesh, camera)
  geometry.index.needsUpdate = false
  const before = Array.from(geometry.index.array)

  render(mesh, camera)

  assert.deepEqual(Array.from(geometry.index.array), before)
  assert.equal(geometry.index.needsUpdate, false, '没有变化时不得把 needsUpdate 打开')
  assert.equal(stats.sorts, 1, '只有真正重排才计数')
  assert.equal(stats.checks, 1, '相机点没变时连朝向都不重算')
})

test('prepareWallSideOrder：相机翻到另一侧时顺序反过来', () => {
  const { mesh, geometry } = createMesh()
  const stats = prepareWallSideOrder(THREE, mesh)

  render(mesh, createCamera())
  render(mesh, createCamera({ flipZ: true }))

  // 相机绕到另一侧（正交投影 z 取反）后 A 朝向、B 背向：顺序必须反过来。
  assert.deepEqual(Array.from(geometry.index.array), [3, 4, 5, 0, 1, 2])
  assert.equal(stats.sorts, 2)
})

test('prepareWallSideOrder：不满足条件时返回 null 且不碰几何体', () => {
  const opaque = createMesh({ transparent: false })
  assert.equal(prepareWallSideOrder(THREE, opaque.mesh), null)
  assert.equal(opaque.geometry.index, null)

  const unmerged = createMesh({ merged: false })
  assert.equal(prepareWallSideOrder(THREE, unmerged.mesh), null)
  assert.equal(unmerged.geometry.index, null)

  const indexed = createMesh()
  indexed.geometry.index = { existing: true }
  assert.equal(prepareWallSideOrder(THREE, indexed.mesh), null)

  const noSideMaterial = createMesh()
  noSideMaterial.mesh.material = [{ isMeshPhysicalMaterial: false }]
  assert.equal(prepareWallSideOrder(THREE, noSideMaterial.mesh), null)
})

test('prepareWallSideOrder：dispose 还原 onBeforeRender 与 forceSinglePass', () => {
  const { mesh, geometry, sideMaterial } = createMesh()
  const previous = () => {}
  mesh.onBeforeRender = previous
  const stats = prepareWallSideOrder(THREE, mesh)
  assert.notEqual(mesh.onBeforeRender, previous, '必须接管 onBeforeRender')

  render(mesh, createCamera())
  assert.equal(sideMaterial.forceSinglePass, true)

  geometry.dispose()

  assert.equal(mesh.onBeforeRender, previous, 'dispose 之后必须交还渲染钩子')
  assert.equal(sideMaterial.forceSinglePass, false, 'dispose 之后必须还原单面绘制标记')
  const before = Array.from(geometry.index.array)
  assert.equal(stats.sorts, 1)
  render(mesh, createCamera({ flipZ: true }))
  assert.deepEqual(Array.from(geometry.index.array), before, 'dispose 之后不得再动索引')
})
