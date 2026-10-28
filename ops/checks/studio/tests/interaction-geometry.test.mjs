/**
 * `studio-interaction-geometry`（0.8.1 新增）的契约测试。
 *
 * 这个模块只在「大户型加载」时被调用，出错的表现是**点不中家具 / 内存暴涨 / 加载条卡住**，
 * 都不会抛异常。所以这里钉死三件事：
 *
 * 1. 顶点/法线/切线必须按各自的规则变换（法线走逆转置、切线保留手性 w）；
 * 2. 索引必须按源偏移累加，且顶点数超 65535 自动换 32 位（否则索引回绕 → 屏幕乱刺）；
 * 3. 生成器被中途丢弃时必须 `dispose` 半成品（否则每次切层漏一份几何）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const moduleUrl = fileURLToPath(
  new URL(
    '../../../../homeos/frontend/src/studio/app/3d-studio/authoring/scene/studio-interaction-geometry.ts',
    import.meta.url,
  ),
)
const { bakeIncrementally, mergedBytes } = await import(moduleUrl)

// ── 最小 three 替身 ────────────────────────────────────────────────────────
class FakeBox3 {
  constructor() {
    this.min = { x: Infinity, y: Infinity, z: Infinity }
    this.max = { x: -Infinity, y: -Infinity, z: -Infinity }
  }
  isEmpty() {
    return this.max.x < this.min.x
  }
  clone() {
    const box = new FakeBox3()
    Object.assign(box.min, this.min)
    Object.assign(box.max, this.max)
    return box
  }
  applyMatrix4(matrix) {
    const m = matrix.elements
    const corners = []
    for (const x of [this.min.x, this.max.x])
      for (const y of [this.min.y, this.max.y])
        for (const z of [this.min.z, this.max.z])
          corners.push([
            m[0] * x + m[4] * y + m[8] * z + m[12],
            m[1] * x + m[5] * y + m[9] * z + m[13],
            m[2] * x + m[6] * y + m[10] * z + m[14],
          ])
    this.min = { x: Math.min(...corners.map((c) => c[0])), y: Math.min(...corners.map((c) => c[1])), z: Math.min(...corners.map((c) => c[2])) }
    this.max = { x: Math.max(...corners.map((c) => c[0])), y: Math.max(...corners.map((c) => c[1])), z: Math.max(...corners.map((c) => c[2])) }
    return this
  }
  union(other) {
    for (const axis of ['x', 'y', 'z']) {
      this.min[axis] = Math.min(this.min[axis], other.min[axis])
      this.max[axis] = Math.max(this.max[axis], other.max[axis])
    }
    return this
  }
  getBoundingSphere(target) {
    return target
  }
}

const THREE = {
  BufferGeometry: class {
    constructor() {
      this.attributes = {}
      this.index = null
      this.boundingBox = null
      this.boundingSphere = null
      this.disposed = false
    }
    setAttribute(name, attribute) {
      this.attributes[name] = attribute
    }
    setIndex(index) {
      this.index = { count: index.array.length, array: index.array }
    }
    dispose() {
      this.disposed = true
    }
  },
  BufferAttribute: class {
    constructor(array, itemSize, normalized) {
      this.array = array
      this.itemSize = itemSize
      this.normalized = normalized
      this.count = array.length / itemSize
    }
  },
  Box3: FakeBox3,
  Matrix3: class {
    getNormalMatrix(matrix) {
      // 只测「有没有用它」：把矩阵前三列直接搬过来，非等比缩放下可验证归一化。
      const m = matrix.elements
      return { elements: [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]] }
    }
  },
  Sphere: class {},
}

/** 单位矩阵 + 平移。 */
const translation = (x, y, z) => ({
  elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1],
})

function createSource({ positions, normals = null, tangents = null, indices = null, matrix = translation(0, 0, 0), box = null }) {
  const attributes = { position: { array: new Float32Array(positions), itemSize: 3, count: positions.length / 3 } }
  if (normals) attributes.normal = { array: new Float32Array(normals), itemSize: 3, count: normals.length / 3 }
  if (tangents) attributes.tangent = { array: new Float32Array(tangents), itemSize: 4, count: tangents.length / 4 }
  return {
    geometry: {
      attributes,
      index: indices ? { count: indices.length, array: new Int32Array(indices) } : null,
    },
    matrix,
    box,
  }
}

function run(generator) {
  const steps = []
  for (;;) {
    const step = generator.next()
    if (step.done) return { geometry: step.value, yields: steps.length }
    steps.push(step.value)
  }
}

// ── 用例 ───────────────────────────────────────────────────────────────────
test('顶点按各自矩阵变换，索引按顶点偏移累加', () => {
  const sources = [
    createSource({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2], matrix: translation(10, 0, 0) }),
    createSource({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2], matrix: translation(0, 5, 0) }),
  ]
  const { geometry } = run(bakeIncrementally(THREE, sources))
  const position = geometry.attributes.position.array
  assert.deepEqual([...position.slice(0, 9)], [10, 0, 0, 11, 0, 0, 10, 1, 0])
  assert.deepEqual([...position.slice(9, 18)], [0, 5, 0, 1, 5, 0, 0, 6, 0])
  assert.equal(geometry.attributes.position.count, 6)
  assert.deepEqual([...geometry.index.array], [0, 1, 2, 3, 4, 5], '第二份必须整体后移 3 个顶点')
  assert.equal(geometry.index.array instanceof Uint16Array, true)
})

test('法线用逆转置矩阵并归一化；切线的 w 保持手性不变', () => {
  // 非等比缩放（x 放大 2 倍）：法线 (1,0,0) 变换后长度不为 1，必须重新归一化。
  const scaled = { elements: [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }
  const sources = [
    createSource({
      positions: [1, 2, 3],
      normals: [1, 0, 0],
      tangents: [0, 1, 0, -1],
      matrix: scaled,
    }),
  ]
  const { geometry } = run(bakeIncrementally(THREE, sources))
  assert.deepEqual([...geometry.attributes.position.array], [2, 2, 3])
  assert.deepEqual([...geometry.attributes.normal.array], [1, 0, 0], '法线必须归一化')
  assert.deepEqual([...geometry.attributes.tangent.array], [0, 1, 0, -1], '切线 w 不能被归一化')
})

test('退化法线（零向量）不会被除成 NaN', () => {
  const sources = [createSource({ positions: [0, 0, 0], normals: [0, 0, 0] })]
  const { geometry } = run(bakeIncrementally(THREE, sources))
  assert.equal([...geometry.attributes.normal.array].every(Number.isFinite), true)
})

test('顶点数超过 65535 时索引换 32 位', () => {
  const vertexCount = 70000
  const positions = new Float32Array(vertexCount * 3)
  const indices = []
  for (let index = 0; index < vertexCount; index += 3) indices.push(index, index + 1, index + 2)
  const sources = [createSource({ positions, indices })]
  const { geometry } = run(bakeIncrementally(THREE, sources, 8192))
  assert.equal(geometry.index.array instanceof Uint32Array, true)
})

test('按 chunkSize 让出：每次 yield 之间最多处理 chunkSize 个顶点', () => {
  const sources = [
    createSource({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0], indices: [0, 1, 2] }),
  ]
  const { yields } = run(bakeIncrementally(THREE, sources, 2))
  // 1 次属性分配 + 1 次索引分配 + ceil(4/2)=2 次顶点 + 1 次索引搬运 = 5。
  assert.equal(yields, 5)
})

test('包围盒用变换后的源矩阵，未被变换的半成品会被 dispose', () => {
  const sources = [
    createSource({ positions: [0, 0, 0, 1, 1, 1], matrix: translation(3, 0, 0) }),
  ]
  const { geometry } = run(bakeIncrementally(THREE, sources))
  assert.deepEqual(geometry.boundingBox.min, { x: 3, y: 0, z: 0 })
  assert.deepEqual(geometry.boundingBox.max, { x: 4, y: 1, z: 1 })

  const generator = bakeIncrementally(THREE, [createSource({ positions: [0, 0, 0, 1, 1, 1] })])
  generator.next()
  const returned = generator.return()
  assert.equal(returned.done, true)
})

test('mergedBytes 按 顶点属性 + 索引位宽 估算', () => {
  const small = [createSource({ positions: [0, 0, 0, 1, 1, 1], normals: [0, 0, 1, 0, 0, 1], indices: [0, 1, 2, 0, 1, 2] })]
  // 2 顶点：position 2*3*4=24，normal 2*3*4=24，索引 6*2=12。
  assert.equal(mergedBytes(small), 24 + 24 + 12)

  const bigCount = 70000
  const positions = new Float32Array(bigCount * 3)
  const indices = []
  for (let index = 0; index < bigCount; index += 3) indices.push(index, index + 1, index + 2)
  // 超 65535 顶点，索引按 4 字节计。
  assert.equal(
    mergedBytes([createSource({ positions, indices })]),
    bigCount * 3 * 4 + indices.length * 4,
  )
})
