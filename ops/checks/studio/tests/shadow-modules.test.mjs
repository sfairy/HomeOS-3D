/**
 * 阴影组四个纯模块（0.8.1 新增）的契约测试。
 *
 * 这些模块都在 WebGL 边界上工作，出错的表现往往是「画面不对」而不是抛异常，所以这里把
 * **可以被静态断言的部分**钉死：
 *
 * - `createShadowParameterBuffer`：容量反推、每灯 6 个 vec4 的布局、越界拒绝上传；
 * - `createShadowTextureCopy`：没有 blit 时退回 three 路径；有 blit 时必须逐层拷贝并把
 *   帧缓冲/剪裁状态**还原**（还原失败会把 three 当帧的渲染目标搞乱）；
 * - `shellSignature` / `applyReviewedShells`：指纹必须对键序无关、对内容敏感；指纹对不上
 *   时**绝不能**动几何体（否则会误删正常外壳）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const SCENE_DIR = '../../../../homeos/frontend/src/studio/app/3d-studio/authoring/scene/'
const moduleUrl = (name) => fileURLToPath(new URL(SCENE_DIR + name, import.meta.url))

const { createShadowParameterBuffer } = await import(moduleUrl('studio-shadow-parameters.ts'))
const { createShadowTextureCopy } = await import(moduleUrl('studio-shadow-copy.ts'))
const { shellSignature, shellScopes, applyReviewedShells } = await import(
  moduleUrl('studio-reviewed-shells.ts')
)

// ── 射灯阴影参数 UBO ────────────────────────────────────────────────────────
function createFakeGL({ uniformBlockSize = 65536 } = {}) {
  const gl = {
    UNIFORM_BUFFER: 0x8a11,
    DYNAMIC_DRAW: 0x88e8,
    MAX_UNIFORM_BLOCK_SIZE: 0x8a30,
    contextLost: false,
    createdBuffers: [],
    deletedBuffers: [],
    uploads: [],
    bindBufferBase: () => {},
    getParameter: (parameter) =>
      parameter === gl.MAX_UNIFORM_BLOCK_SIZE ? uniformBlockSize : 0,
    createBuffer: () => {
      const buffer = { id: gl.createdBuffers.length + 1 }
      gl.createdBuffers.push(buffer)
      return buffer
    },
    deleteBuffer: (buffer) => gl.deletedBuffers.push(buffer),
    bindBuffer: () => {},
    bufferData: () => {},
    bufferSubData: (_target, offset, data) => gl.uploads.push({ offset, data: Array.from(data) }),
    isContextLost: () => gl.contextLost,
  }
  return gl
}

const vec4 = (values) => ({
  toArray: (array, offset = 0) => {
    values.forEach((value, index) => (array[offset + index] = value))
    return array
  },
})

test('UBO 容量按 MAX_UNIFORM_BLOCK_SIZE 反推，缺 bindBufferBase 时为 0', () => {
  assert.equal(createShadowParameterBuffer(createFakeGL({ uniformBlockSize: 96 * 10 })).capacity, 10)
  // 再大也封顶 128 盏：再多就该换投影方向光了。
  assert.equal(createShadowParameterBuffer(createFakeGL({ uniformBlockSize: 96 * 1000 })).capacity, 128)
  assert.equal(createShadowParameterBuffer(null).capacity, 0)
  const webgl1 = createFakeGL()
  delete webgl1.bindBufferBase
  assert.equal(createShadowParameterBuffer(webgl1).capacity, 0)
})

test('每盏灯写 24 个 float：矩阵 16 + rect 4 + params 4，按灯连续排列', () => {
  const gl = createFakeGL()
  const buffer = createShadowParameterBuffer(gl)
  const uploaded = buffer.update(
    [vec4([0, 1, 2, 3]), vec4([24, 25, 26, 27])],
    [vec4([10, 11, 12, 13]), vec4([34, 35, 36, 37])],
    [vec4([20, 21, 22, 23]), vec4([44, 45, 46, 47])],
  )
  assert.equal(uploaded, true)
  assert.equal(gl.uploads.length, 1)
  const { data } = gl.uploads[0]
  assert.equal(data.length, 48, '两盏灯 = 48 个 float')
  assert.deepEqual(data.slice(0, 4), [0, 1, 2, 3], '第一盏灯的矩阵在偏移 0')
  assert.deepEqual(
    data.slice(16, 24),
    [10, 11, 12, 13, 20, 21, 22, 23],
    'rect/params 紧随矩阵，偏移 16 / 20',
  )
  assert.deepEqual(data.slice(24, 28), [24, 25, 26, 27], '第二盏灯从偏移 24 开始')
  assert.deepEqual(
    data.slice(40, 48),
    [34, 35, 36, 37, 44, 45, 46, 47],
    '第二盏灯不能覆盖第一盏',
  )
  assert.equal(data.slice(4, 16).every((value) => value === 0), true, '未写入的槽位保持 0')
})

test('超出容量、上下文丢失时返回 false 且不上传', () => {
  const gl = createFakeGL({ uniformBlockSize: 96 * 2 })
  const buffer = createShadowParameterBuffer(gl)
  const threeLights = [0, 1, 2].map((index) => vec4([index, index, index, index]))
  assert.equal(buffer.update(threeLights, threeLights, threeLights), false)
  assert.equal(gl.uploads.length, 0)

  const lostGL = createFakeGL()
  lostGL.contextLost = true
  assert.equal(
    createShadowParameterBuffer(lostGL).update([vec4([0, 0, 0, 0])], [vec4([0, 0, 0, 0])], [vec4([0, 0, 0, 0])]),
    false,
  )
})

// ── 阴影纹理拷贝 ───────────────────────────────────────────────────────────
function createFakeRenderer({ withBlit = true } = {}) {
  const calls = { blits: [], attachments: [], boundFramebuffers: [], scissor: [], fallback: 0 }
  // 上下文对象必须**只有一个**：`createShadowTextureCopy` 在构造时抓一次 gl，
  // 每次都新建对象会让测试改不动它持有的状态。
  const gl = withBlit
    ? {
        READ_FRAMEBUFFER: 0x8ca8,
        DRAW_FRAMEBUFFER: 0x8ca9,
        READ_FRAMEBUFFER_BINDING: 0x8caa,
        DRAW_FRAMEBUFFER_BINDING: 0x8cab,
        SCISSOR_TEST: 0xc11,
        COLOR_ATTACHMENT0: 0x8ce0,
        TEXTURE_2D: 0xde1,
        COLOR_BUFFER_BIT: 0x4000,
        NEAREST: 0x2600,
        isContextLost: () => false,
        getParameter: (parameter) => ({ id: 'previous:' + parameter }),
        isEnabled: (capability) => capability === 0xc11,
        createFramebuffer: () => ({ id: 'fb' }),
        deleteFramebuffer: () => {},
        framebufferTextureLayer: (...args) => calls.attachments.push(args),
        framebufferTexture2D: (...args) => calls.attachments.push(args),
        blitFramebuffer: (...args) => calls.blits.push(args),
      }
    : undefined
  const renderer = {
    calls,
    properties: { get: (target) => ({ __webglTexture: { id: target.id } }) },
    state: {
      bindFramebuffer: (target, framebuffer) =>
        calls.boundFramebuffers.push([target, framebuffer && framebuffer.id]),
      setScissorTest: (enabled) => calls.scissor.push(enabled),
    },
    copyTextureToTexture: () => calls.fallback++,
    getContext: () => gl,
  }
  return { renderer, calls, gl }
}

const texture = (id) => ({ id, isDataArrayTexture: true })

test('没有 blitFramebuffer 时退回 three 的 copyTextureToTexture', () => {
  const { renderer, calls } = createFakeRenderer({ withBlit: false })
  const copy = createShadowTextureCopy(renderer)
  copy.copy(texture('a'), texture('b'), { min: { x: 0, y: 0 }, max: { x: 8, y: 8 } }, { x: 0, y: 0 })
  assert.equal(calls.fallback, 1)
})

test('有 blit 时逐层拷贝，并还原帧缓冲绑定与剪裁状态', () => {
  const { renderer, calls } = createFakeRenderer()
  const copy = createShadowTextureCopy(renderer)
  copy.copy(
    texture('source'),
    texture('target'),
    { min: { x: 1, y: 2, z: 3 }, max: { x: 5, y: 6, z: 5 }, isBox3: true },
    { x: 0, y: 0, z: 7 },
  )
  // `max.z - min.z` = 2 层，与上游一致（不是 3 层）。
  assert.equal(calls.blits.length, 2)
  assert.equal(calls.fallback, 0)
  assert.deepEqual(calls.blits[0].slice(0, 8), [1, 2, 5, 6, 0, 0, 4, 4], '矩形宽高按 box 推算')
  // 层号：源从 min.z 起、目标从 targetOrigin.z 起。
  assert.deepEqual(calls.attachments[0].slice(-1), [3])
  assert.deepEqual(calls.attachments[1].slice(-1), [7])
  assert.deepEqual(calls.attachments[2].slice(-1), [4])
  assert.deepEqual(calls.attachments[3].slice(-1), [8])
  // 剪裁：先关，收尾还原成 true。
  assert.deepEqual(calls.scissor, [false, true])
  // 帧缓冲：最后两条必须是还原（读/写各自的 previous）。
  const restored = calls.boundFramebuffers.slice(-2)
  assert.deepEqual(restored.map((entry) => entry[1]), ['previous:36010', 'previous:36011'])
})

test('上下文丢失时抛错且不改动渲染状态', () => {
  const { renderer, calls, gl } = createFakeRenderer()
  gl.isContextLost = () => true
  const copy = createShadowTextureCopy(renderer)
  assert.throws(() => copy.copy(texture('a'), texture('b'), { min: { x: 0, y: 0 }, max: { x: 1, y: 1 } }, { x: 0, y: 0 }))
  assert.equal(calls.boundFramebuffers.length, 0)
  assert.equal(calls.blits.length, 0)
})

// ── 复核外壳 ───────────────────────────────────────────────────────────────
const createFakeThree = () => ({
  BufferAttribute: class {
    constructor(array, itemSize, normalized) {
      this.array = array
      this.itemSize = itemSize
      this.normalized = normalized
      this.count = array.length / itemSize
    }
  },
})

function createNode({ vertexCount = 9, triangles = [0, 1, 2, 3, 4, 5, 6, 7, 8] } = {}) {
  const positionArray = new Float32Array(vertexCount * 3)
  for (let index = 0; index < positionArray.length; index += 1) positionArray[index] = index
  const node = {
    children: [],
    matrix: { elements: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) },
    userData: {},
    material: { transparent: false, opacity: 1 },
    geometry: {
      type: 'BufferGeometry',
      index: { count: triangles.length, array: triangles },
      attributes: {
        position: {
          array: positionArray,
          itemSize: 3,
          count: vertexCount,
          normalized: false,
        },
      },
      groups: [{ start: 0, count: triangles.length, materialIndex: 0 }],
      setAttribute(name, attribute) {
        this.attributes[name] = attribute
      },
      setIndex(index) {
        this.index = { count: index.length, array: index }
      },
      clearGroups() {
        this.groups = []
      },
      addGroup(start, count, materialIndex) {
        this.groups.push({ start, count, materialIndex })
      },
      computeBoundingBox() {},
      computeBoundingSphere() {},
    },
    updateMatrixWorld() {},
  }
  return node
}

test('shellSignature 对内容敏感、对重复计算稳定', () => {
  const first = createNode()
  const second = createNode()
  assert.equal(shellSignature([{ node: first, path: '/0' }]), shellSignature([{ node: second, path: '/0' }]))

  const moved = createNode()
  moved.geometry.attributes.position.array[0] = 999
  assert.notEqual(shellSignature([{ node: first, path: '/0' }]), shellSignature([{ node: moved, path: '/0' }]))

  const scaled = createNode()
  scaled.matrix.elements[0] = 2
  assert.notEqual(shellSignature([{ node: first, path: '/0' }]), shellSignature([{ node: scaled, path: '/0' }]))

  const pathShifted = createNode()
  assert.notEqual(
    shellSignature([{ node: first, path: '/0' }]),
    shellSignature([{ node: pathShifted, path: '/1' }]),
    '路径参与指纹：增删子节点必须让旧掩码失效',
  )
})

test('shellScopes 在部件节点处重置路径', () => {
  const root = createNode()
  const part = createNode()
  part.userData = { fanPart: true }
  part.children = [createNode()]
  root.children = [part]
  const scopes = [...shellScopes(root).values()]
  assert.equal(scopes.length, 2, '根 + 部件 = 两个作用域')
  assert.deepEqual(scopes[0].map((entry) => entry.path), [''])
  assert.deepEqual(scopes[1].map((entry) => entry.path), ['', '/0'])
})

test('指纹对不上时不动几何体（换模型必须自动失效）', () => {
  const node = createNode()
  const originalIndex = [...node.geometry.index.array]
  const removed = applyReviewedShells(createFakeThree(), node, 'fan', [
    { signature: 'deadbeef', masks: { '': [0] } },
  ])
  assert.equal(removed, 0)
  assert.deepEqual(node.geometry.index.array, originalIndex)
})

test('指纹命中时按掩码剔除三角形并压紧顶点', () => {
  const node = createNode()
  const signature = shellSignature([{ node, path: '' }])
  const removed = applyReviewedShells(createFakeThree(), node, 'fan', [{ signature, masks: { '': [1] } }])
  assert.equal(removed, 1, '只剔除掩码点名的那个三角形')
  assert.deepEqual(node.geometry.index.array, [0, 1, 2, 3, 4, 5], '顶点 3/4/5 不再被引用并重映射')
  assert.equal(node.geometry.attributes.position.count, 6, '顶点必须压紧到 6 个')
  assert.equal(node.geometry.attributes.position.array.length, 18)
  assert.equal(node.geometry.type, 'BufferGeometry')
  assert.deepEqual(node.geometry.groups, [{ start: 0, count: 6, materialIndex: 0 }])
})
