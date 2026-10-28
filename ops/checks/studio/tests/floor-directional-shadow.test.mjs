/**
 * `planFloorShadowCrops`（0.8.1 新增）的契约测试。
 *
 * 这是分层阴影里唯一能脱离 GPU 验证的一步，但它决定了「阴影糊不糊」：
 *
 * - 裁剪矩形必须**包住**该层所有投影物体（少一个像素就是一条硬边）；
 * - 统一尺寸必须按 32 对齐（否则每次微调都重分配整张纹理数组）；
 * - 退化输入（空层 / NaN 矩阵）必须有兜底，不能让着色器采样越界；
 * - 居中后必须夹回贴图边界内。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const moduleUrl = fileURLToPath(
  new URL(
    '../../../../homeos/frontend/src/studio/app/3d-studio/authoring/scene/studio-floor-directional-shadow.ts',
    import.meta.url,
  ),
)
const { planFloorShadowCrops, floorDirectionalShader, createFloorDirectionalShadow } = await import(moduleUrl)

// ── 最小几何替身 ───────────────────────────────────────────────────────────
class Point {
  constructor(x = 0, y = 0, z = 0) {
    Object.assign(this, { x, y, z })
  }
  clone() {
    return new Point(this.x, this.y, this.z)
  }
  set(x, y, z) {
    Object.assign(this, { x, y, z })
    return this
  }
  applyMatrix4(matrix) {
    const m = matrix.elements
    const { x, y, z } = this
    this.x = m[0] * x + m[4] * y + m[8] * z + m[12]
    this.y = m[1] * x + m[5] * y + m[9] * z + m[13]
    this.z = m[2] * x + m[6] * y + m[10] * z + m[14]
    return this
  }
}

class Box3 {
  constructor(min = new Point(), max = new Point()) {
    this.min = min
    this.max = max
  }
  isEmpty() {
    return this.max.x < this.min.x || this.max.y < this.min.y || this.max.z < this.min.z
  }
  clone() {
    return new Box3(this.min.clone(), this.max.clone())
  }
  applyMatrix4(matrix) {
    const corners = []
    for (const x of [this.min.x, this.max.x])
      for (const y of [this.min.y, this.max.y])
        for (const z of [this.min.z, this.max.z]) corners.push(new Point(x, y, z).applyMatrix4(matrix))
    this.min = new Point(Math.min(...corners.map((c) => c.x)), Math.min(...corners.map((c) => c.y)), Math.min(...corners.map((c) => c.z)))
    this.max = new Point(Math.max(...corners.map((c) => c.x)), Math.max(...corners.map((c) => c.y)), Math.max(...corners.map((c) => c.z)))
    return this
  }
  union(other) {
    ;(this.min = new Point(Math.min(this.min.x, other.min.x), Math.min(this.min.y, other.min.y), Math.min(this.min.z, other.min.z))),
      (this.max = new Point(Math.max(this.max.x, other.max.x), Math.max(this.max.y, other.max.y), Math.max(this.max.z, other.max.z)))
    return this
  }
}

/** 列主序 4×4：`multiply` 保持 three 的「this = this × other」语义。 */
function createMatrix(x = 0, y = 0, z = 0) {
  return {
    elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1],
    clone() {
      return { ...this, elements: [...this.elements] }
    },
    multiply(other) {
      const a = this.elements
      const b = other.elements
      const out = new Array(16).fill(0)
      for (let column = 0; column < 4; column++)
        for (let row = 0; row < 4; row++)
          out[column * 4 + row] =
            a[row] * b[column * 4] +
            a[4 + row] * b[column * 4 + 1] +
            a[8 + row] * b[column * 4 + 2] +
            a[12 + row] * b[column * 4 + 3]
      return { ...this, elements: out }
    },
  }
}

const translation = (x, y, z) => createMatrix(x, y, z)
const IDENTITY = createMatrix()

const MAP = { x: 256, y: 256 }

function createSource({ floorId, min, max, matrix = IDENTITY, projection = IDENTITY, objects = null }) {
  return {
    id: floorId,
    anchor: {},
    bounds: new Box3(),
    frameFromAnchor: IDENTITY,
    projection,
    shadowObjects:
      objects ||
      [
        {
          matrixWorld: matrix,
          geometry: { boundingBox: new Box3(new Point(...min), new Point(...max)) },
        },
      ],
  }
}

// ── 用例 ───────────────────────────────────────────────────────────────────
test('裁剪矩形包住投影后的包围盒，并按 32 对齐、夹回贴图内', () => {
  const plan = planFloorShadowCrops([createSource({ floorId: 'f1', min: [0, 0, 0], max: [0.5, 0.5, 0] })], IDENTITY, MAP)
  assert.equal(plan.width, 160, '144 像素宽的盒子向上对齐到 160')
  assert.equal(plan.height, 160)
  // 盒子贴着原点，外扩 padding 后是 [-16,144]，居中到 160 的框里会被夹回 0。
  assert.deepEqual(plan.crops, [{ x: 0, y: 0, width: 160, height: 160 }])
})

test('多层取最大尺寸，每层各自居中', () => {
  const plan = planFloorShadowCrops(
    [
      createSource({ floorId: 'small', min: [0, 0, 0], max: [0.2, 0.2, 0] }),
      // 第二层整体偏右下，投影后占 [0.5, 1]
      createSource({ floorId: 'large', min: [0, 0, 0], max: [0.5, 0.5, 0], matrix: translation(0.5, 0.5, 0) }),
    ],
    IDENTITY,
    MAP,
  )
  assert.equal(plan.width, 160, '统一尺寸取最大的那层')
  assert.equal(plan.height, 160)
  assert.equal(plan.crops.length, 2)
  for (const crop of plan.crops) {
    assert.ok(crop.x >= 0 && crop.x + crop.width <= MAP.x, '不能越界')
    assert.ok(crop.y >= 0 && crop.y + crop.height <= MAP.y, '不能越界')
  }
  assert.equal(plan.crops[0].x, 0, '小层靠左上的内容不能被推到负坐标')
})

test('空层给 1×1 兜底，再被对齐成最小块', () => {
  const plan = planFloorShadowCrops([createSource({ floorId: 'empty', min: [0, 0, 0], max: [0, 0, 0], objects: [] })], IDENTITY, MAP)
  assert.equal(plan.width, 32)
  assert.equal(plan.height, 32)
  assert.deepEqual(plan.crops[0], { x: 0, y: 0, width: 32, height: 32 })
})

test('坏矩阵（NaN）退回整张贴图，宁可糊不可黑屏', () => {
  const broken = { ...IDENTITY, elements: [NaN, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }
  const plan = planFloorShadowCrops([createSource({ floorId: 'bad', min: [0, 0, 0], max: [1, 1, 0], matrix: broken })], IDENTITY, MAP)
  assert.equal(plan.width, 256)
  assert.equal(plan.height, 256)
  assert.deepEqual(plan.crops[0], { x: 0, y: 0, width: 256, height: 256 })
})

test('容量上限：对齐不会超过贴图尺寸', () => {
  const plan = planFloorShadowCrops(
    [createSource({ floorId: 'full', min: [0, 0, 0], max: [1, 1, 0] })],
    IDENTITY,
    { x: 100, y: 70 },
  )
  assert.equal(plan.width, 100, '贴图只有 100 宽时不能被对齐成 128')
  assert.equal(plan.height, 70, '夹回贴图尺寸优先于对齐（96 > 70）')
})

test('方向光着色器用 variance shadow map 并读当前楼层的数组层', () => {
  const shader = floorDirectionalShader()
  assert.match(shader, /sampler2DArray userFloorDirectionalMap/)
  assert.match(shader, /vec3\(croppedUv,userFloorHeader\.z\)/, '层号来自 header.z')
  assert.match(shader, /mix\(1\.0,shadow,params\.y\)/)
  assert.match(shader, /cropUv|userFloorSun\[5\]/)
})

// ── 构建守卫（曾经把取消判定写反，整条分层方向光静默失效） ──────────────────
//
// 图集侧传给 `buildSteps` 的第二个参数是「这一轮构建还有效吗」，不是「要不要取消」。
// 语义一旦反了，构建会在第一次 `yield` 后立刻返回：没有异常、没有日志，只有
// `stats.layers = 0`，画面表现为「阴影还是整栋楼共用一张图」。
const fakeTHREE = {
  Matrix4: class Matrix4 {
    constructor() {
      this.elements = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    }
    clone() {
      return new this.constructor()
    }
    invert() {
      return this
    }
    multiply() {
      return this
    }
    multiplyMatrices() {
      return this
    }
  },
  Box3: class Box3 {
    constructor() {
      this.min = new Point()
      this.max = new Point()
    }
    isEmpty() {
      return true
    }
    union() {
      return this
    }
    clone() {
      return this
    }
    setFromPoints() {
      return this
    }
  },
}

const sunNode = () => ({
  isDirectionalLight: true,
  castShadow: true,
  shadow: { needsUpdate: false },
})

function createGuardHarness({ sun = true } = {}) {
  const nodes = sun ? [sunNode()] : []
  return createFloorDirectionalShadow({
    THREE: fakeTHREE,
    renderer: {},
    scene: { traverse: (callback) => nodes.forEach(callback), updateMatrixWorld: () => {} },
    renderDepth: () => {},
    requestFrame: () => {},
  })
}

const emptyRoot = { traverse: () => {} }

test('场景里没有投影方向光时给出 no-sun，而不是静默不动', () => {
  const controller = createGuardHarness({ sun: false })
  for (const _step of controller.buildSteps(emptyRoot, () => true)) {
    assert.fail('没有太阳时不该进入构建循环')
  }
  assert.equal(controller.stats.reason, 'no-sun')
  assert.equal(controller.stats.sun, 0)
  assert.equal(controller.stats.layers, 0)
})

test('构建被新的一轮取代（有效性谓词为 false）时必须停手', () => {
  const controller = createGuardHarness()
  for (const _step of controller.buildSteps(emptyRoot, () => false)) {
    assert.fail('构建已失效时不该继续渲染阴影层')
  }
  assert.equal(controller.stats.reason, 'stale')
  assert.equal(controller.stats.layers, 0)
  assert.equal(controller.entries.size, 0, '半成品不能写回条目表')
})

test('有效性谓词为 true 时不提前退出：没有楼层分组时继续走到 no-floor-groups', () => {
  const controller = createGuardHarness()
  for (const _step of controller.buildSteps(emptyRoot, () => true)) {
    assert.fail('没有楼层分组时不该进入逐层渲染')
  }
  assert.equal(controller.stats.reason, 'no-floor-groups', '谓词为 true 时不能报 stale')
  assert.equal(controller.stats.floors, 0)
  assert.equal(controller.stats.layers, 0)
})

