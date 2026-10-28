/**
 * `studio-floor-lights`（0.8.1 新增）的契约测试。
 *
 * 这个模块决定「哪盏灯照亮哪一层」。它的失败模式全部是**视觉错误**，不会抛异常：
 *
 * - 灯不亮：`layers.mask` 被清零后没有还原（最常见，一旦回归整片黑）；
 * - 隔层漏光：灯被算进了错楼层的缓冲；
 * - 面光当射灯算：着色器按 `header.x` 切分区间，射灯/面光的顺序错了颜色就会乱跳；
 * - 每帧上传 3KB：差分上传失效（`uploaded` 影子数组没起作用）。
 *
 * 这里把这几条都钉死。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const moduleUrl = fileURLToPath(
  new URL(
    '../../../../homeos/frontend/src/studio/app/3d-studio/authoring/scene/studio-floor-lights.ts',
    import.meta.url,
  ),
)
const { createFloorLightBuffer, objectFloorId, floorLightShaderPars, floorLightShaderLoop } =
  await import(moduleUrl)

// ── 最小 four-by-four（列主序，与 three 一致）────────────────────────────────
const identityElements = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

class FakeMatrix4 {
  constructor(elements = identityElements()) {
    this.elements = Float64Array.from(elements)
  }
  copy(other) {
    this.elements.set(other.elements)
    return this
  }
  clone() {
    return new FakeMatrix4([...this.elements])
  }
  multiply(other) {
    return this.multiplyMatrices(this, other)
  }
  multiplyMatrices(a, b) {
    const ae = a.elements
    const be = b.elements
    const out = new Float64Array(16)
    for (let column = 0; column < 4; column++) {
      for (let row = 0; row < 4; row++) {
        out[column * 4 + row] =
          ae[row] * be[column * 4] +
          ae[4 + row] * be[column * 4 + 1] +
          ae[8 + row] * be[column * 4 + 2] +
          ae[12 + row] * be[column * 4 + 3]
      }
    }
    this.elements = out
    return this
  }
  identity() {
    this.elements = Float64Array.from(identityElements())
    return this
  }
  invert() {
    const m = this.elements
    // 只支持仿射（最后一行为 0 0 0 1）：阴影管线里用到的都是仿射矩阵。
    const [
      a11, a21, a31, ,
      a12, a22, a32, ,
      a13, a23, a33, ,
      a14, a24, a34, ,
    ] = m
    const determinant =
      a11 * (a22 * a33 - a23 * a32) -
      a12 * (a21 * a33 - a23 * a31) +
      a13 * (a21 * a32 - a22 * a31)
    const inverseDeterminant = 1 / determinant
    const b11 = (a22 * a33 - a23 * a32) * inverseDeterminant
    const b12 = (a13 * a32 - a12 * a33) * inverseDeterminant
    const b13 = (a12 * a23 - a13 * a22) * inverseDeterminant
    const b21 = (a23 * a31 - a21 * a33) * inverseDeterminant
    const b22 = (a11 * a33 - a13 * a31) * inverseDeterminant
    const b23 = (a13 * a21 - a11 * a23) * inverseDeterminant
    const b31 = (a21 * a32 - a22 * a31) * inverseDeterminant
    const b32 = (a12 * a31 - a11 * a32) * inverseDeterminant
    const b33 = (a11 * a22 - a12 * a21) * inverseDeterminant
    const tx = -(b11 * a14 + b21 * a24 + b31 * a34)
    const ty = -(b12 * a14 + b22 * a24 + b32 * a34)
    const tz = -(b13 * a14 + b23 * a24 + b33 * a34)
    this.elements = Float64Array.from([
      b11, b12, b13, 0,
      b21, b22, b23, 0,
      b31, b32, b33, 0,
      tx, ty, tz, 1,
    ])
    return this
  }
  extractRotation(matrix) {
    const m = matrix.elements
    this.elements = Float64Array.from([
      m[0], m[1], m[2], 0,
      m[4], m[5], m[6], 0,
      m[8], m[9], m[10], 0,
      0, 0, 0, 1,
    ])
    return this
  }
  premultiply(other) {
    const self = this.clone()
    return this.multiplyMatrices(other, self)
  }
  equals(other) {
    return this.elements.every((value, index) => value === other.elements[index])
  }
  toArray(array, offset = 0) {
    for (let index = 0; index < 16; index++) array[offset + index] = this.elements[index]
    return [...array]
  }
}

const THREE = {
  Matrix4: FakeMatrix4,
  Vector4: class {
    constructor(x = 0, y = 0, z = 0, w = 0) {
      Object.assign(this, { x, y, z, w })
    }
    toArray(array, offset = 0) {
      const values = [this.x, this.y, this.z, this.w]
      values.forEach((value, index) => (array[offset + index] = value))
      return values
    }
  },
}

// ── 假 GL ──────────────────────────────────────────────────────────────────
function createFakeGL(capacity) {
  const gl = {
    UNIFORM_BUFFER: 0x8a11,
    DYNAMIC_DRAW: 0x88e8,
    MAX_UNIFORM_BLOCK_SIZE: 0x8a30,
    created: 0,
    deleted: 0,
    uploads: [],
    bindBaseCalls: [],
    contextLost: false,
    bindBufferBase: (...args) => gl.bindBaseCalls.push(args),
    getParameter: (parameter) => (parameter === gl.MAX_UNIFORM_BLOCK_SIZE ? 160 + capacity * 160 : 0),
    isContextLost: () => gl.contextLost,
    createBuffer: () => ({ id: ++gl.created }),
    deleteBuffer: () => (gl.deleted += 1),
    bindBuffer: () => {},
    bufferData: () => {},
    bufferSubData: (_target, offset, data, sourceOffset, length) =>
      gl.uploads.push({ offset, length, values: Array.from(data.slice(sourceOffset, sourceOffset + length)) }),
  }
  return gl
}

// ── 假场景 ────────────────────────────────────────────────────────────────
class FakeNode {
  constructor(properties = {}) {
    this.children = []
    this.parent = null
    this.userData = {}
    this.visible = true
    this.layers = { mask: 1, test: (mask) => (this.layers.mask & mask) !== 0 }
    this.matrixWorld = new FakeMatrix4()
    this.listeners = new Map()
    Object.assign(this, properties)
  }
  add(child) {
    ;(child.parent = this), this.children.push(child)
    return child
  }
  traverse(callback) {
    callback(this)
    for (const child of this.children) child.traverse(callback)
  }
  addEventListener(type, listener) {
    this.listeners.set(type, listener)
  }
  removeEventListener(type) {
    this.listeners.delete(type)
  }
}

const createLight = ({ floor, id, rectArea = false, intensity = 1 }) =>
  new FakeNode({
    isSpotLight: !rectArea,
    isRectAreaLight: rectArea,
    intensity,
    distance: 4,
    angle: 0.6,
    penumbra: 0.2,
    decay: 2,
    color: { r: 1, g: 0.5, b: 0.25 },
    width: rectArea ? 2 : 0,
    height: rectArea ? 1 : 0,
    matrixWorld: new FakeMatrix4(),
    target: { matrixWorld: new FakeMatrix4() },
    userData: { lightItemId: id, lightFloorId: floor },
  })

function createScene() {
  const root = new FakeNode(),
    firstFloor = new FakeNode({ isMesh: false }),
    secondFloor = new FakeNode({ isMesh: false }),
    camera = new FakeNode({ layers: { mask: 1 }, matrixWorldInverse: new FakeMatrix4(), matrixWorld: new FakeMatrix4() })
  ;(firstFloor.userData.floorId = 'f1'), (secondFloor.userData.floorId = 'f2')
  root.add(firstFloor).add(secondFloor)
  const spotA = firstFloor.add(createLight({ floor: 'f1', id: 'a' })),
    areaB = firstFloor.add(createLight({ floor: 'f1', id: 'b', rectArea: true })),
    spotC = secondFloor.add(createLight({ floor: 'f2', id: 'c' })),
    meshOnFirstFloor = firstFloor.add(new FakeNode({ isMesh: true, userData: { floorId: 'f1' } }))
  return { root, camera, firstFloor, secondFloor, spotA, areaB, spotC, meshOnFirstFloor }
}

// ── 用例 ───────────────────────────────────────────────────────────────────
test('objectFloorId 一路向上找四种楼层字段', () => {
  const root = new FakeNode()
  const floor = root.add(new FakeNode())
  floor.userData.floorId = 'f9'
  const region = floor.add(new FakeNode())
  region.userData.regionFloorId = 'region'
  const lamp = region.add(new FakeNode())
  assert.equal(objectFloorId(lamp), 'region', '自身字段优先')
  assert.equal(objectFloorId(region), 'region')
  const plain = floor.add(new FakeNode())
  assert.equal(objectFloorId(plain), 'f9', '找不到自己的就用父级')
  assert.equal(objectFloorId(null), '')
})

test('容量按 (MAX_UNIFORM_BLOCK_SIZE - 160) / 160 反推，封顶 96', () => {
  assert.equal(createFloorLightBuffer({ THREE, gl: createFakeGL(4) }).capacity, 4)
  assert.equal(createFloorLightBuffer({ THREE, gl: createFakeGL(200) }).capacity, 96)
  const webgl1 = createFakeGL(4)
  delete webgl1.bindBufferBase
  assert.equal(createFloorLightBuffer({ THREE, gl: webgl1 }).capacity, 0)
})

test('射灯排在面光前，头部写两个计数，灯位参数按 40 个 float 排布', () => {
  const gl = createFakeGL(4)
  const buffer = createFloorLightBuffer({ THREE, gl })
  const { root, camera, spotA, areaB } = createScene()
  const count = buffer.update(root, camera, new Map())
  assert.equal(count, 3)
  assert.equal(buffer.enabled, true)
  // 每层两次上传：头部 + 已用灯位（浮点偏移 0），方向光块（浮点偏移 4 + capacity*40）。
  const sunBlockOffset = (4 + 4 * 40) * 4
  assert.equal(
    gl.uploads.some((upload) => upload.offset === 0),
    true,
  )
  assert.equal(
    gl.uploads.filter((upload) => upload.offset === sunBlockOffset).length,
    3,
    '每层都要写方向光块',
  )

  // 从最后一次上传里拆出 f1 的头两个 float：射灯 1、面光 1。
  const f1Header = gl.uploads.find((upload) => upload.values[0] === 1 && upload.values[1] === 1)
  assert.ok(f1Header, 'f1 必须是「1 盏射灯 + 1 盏面光」')
  // 射灯在前：槽位 0 的位置来自 spotA（恒等矩阵 → 原点）。
  assert.equal(f1Header.values[4 + 24], 0)
  // 第 2 盏（槽位 1）是面光：`decay` 位（偏移 36）被换成 halfHeight，距离位是 0。
  assert.equal(f1Header.values[4 + 40 + 27], 0, '面光没有 distance')
  // 面光的槽位 36..38 装的是「旋转后的 y 轴 × height/2」：单位旋转下 x 分量为 0、y 分量为 0.5。
  assert.equal(f1Header.values[4 + 40 + 36], 0, 'y 轴的 x 分量')
  assert.equal(f1Header.values[4 + 40 + 37], 0.5, 'halfHeight = height / 2')
  assert.equal(f1Header.values[4 + 40 + 32], 1, '面光同样写 color*intensity（r = 1 × 1）')
  assert.equal(spotA.parent, areaB.parent)
})

test('启用时接管 layers.mask（清零），关闭时逐个还原', () => {
  const gl = createFakeGL(4)
  const buffer = createFloorLightBuffer({ THREE, gl })
  const { root, camera, spotA, areaB, spotC } = createScene()
  ;(spotA.layers.mask = 3), (areaB.layers.mask = 5), (spotC.layers.mask = 7)
  buffer.update(root, camera, new Map())
  assert.deepEqual([spotA.layers.mask, areaB.layers.mask, spotC.layers.mask], [0, 0, 0])
  buffer.setEnabled(false)
  assert.deepEqual([spotA.layers.mask, areaB.layers.mask, spotC.layers.mask], [3, 5, 7])
})

test('某层灯数超过容量时整体退回（不接管 mask、不写缓冲）', () => {
  const gl = createFakeGL(2)
  const buffer = createFloorLightBuffer({ THREE, gl })
  const { root, camera, firstFloor, spotA } = createScene()
  firstFloor.add(createLight({ floor: 'f1', id: 'd' }))
  spotA.layers.mask = 3
  // 真实流程里结构变化会先走 `prepare`，`update` 下一帧才会看到 `enabled = false`。
  buffer.prepare(root)
  assert.equal(buffer.available, false)
  assert.equal(buffer.update(root, camera, new Map()), undefined)
  assert.equal(buffer.enabled, false)
  assert.equal(spotA.layers.mask, 3, '退回路径绝不能改 mask')
  assert.equal(gl.uploads.length, 0)
})

test('结构没变时不重复上传（差分上传生效）', () => {
  const gl = createFakeGL(4)
  const buffer = createFloorLightBuffer({ THREE, gl })
  const { root, camera } = createScene()
  buffer.update(root, camera, new Map())
  const afterFirstFrame = gl.uploads.length
  assert.ok(afterFirstFrame > 0)
  buffer.update(root, camera, new Map())
  assert.equal(gl.uploads.length, afterFirstFrame, '同一帧重算不应产生新上传')

  // 灯一灭，头部计数就要变，必须重传。
  camera.layers.mask = 0
  buffer.update(root, camera, new Map())
  assert.ok(gl.uploads.length > afterFirstFrame)
})

test('不可见的祖先会把灯排除在外', () => {
  const gl = createFakeGL(4)
  const buffer = createFloorLightBuffer({ THREE, gl })
  const { root, camera, secondFloor } = createScene()
  secondFloor.visible = false
  assert.equal(buffer.update(root, camera, new Map()), 2, 'f2 的灯被排除')
})

test('withFloor 临时隐藏其它楼层，返回后恢复', () => {
  const gl = createFakeGL(4)
  const buffer = createFloorLightBuffer({ THREE, gl })
  const { root, meshOnFirstFloor, secondFloor } = createScene()
  const meshOnSecondFloor = secondFloor.add(new FakeNode({ isMesh: true, userData: { floorId: 'f2' } }))
  buffer.prepare(root)
  const visibleDuringFloorOne = buffer.withFloor(meshOnFirstFloor, root, () => [
    meshOnFirstFloor.visible,
    meshOnSecondFloor.visible,
  ])
  assert.deepEqual(visibleDuringFloorOne, [true, false])
  assert.deepEqual([meshOnFirstFloor.visible, meshOnSecondFloor.visible], [true, true])
})

test('着色器声明按容量开数组，循环用 header.x 切分射灯/面光', () => {
  const pars = floorLightShaderPars(4)
  assert.match(pars, /userFloorData\[40\]/, '4 盏灯 = 40 个 vec4')
  assert.match(pars, /userFloorSun\[9\]/)
  const loop = floorLightShaderLoop()
  assert.match(loop, /floorLightIndex<int\(userFloorHeader\.x\)/)
  assert.match(loop, /floorAreaIndex=int\(userFloorHeader\.x\)/)
  assert.match(loop, /userFloorHeader\.x\+userFloorHeader\.y/)
})
