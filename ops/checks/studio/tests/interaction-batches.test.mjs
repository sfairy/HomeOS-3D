/**
 * 交互渲染代理（`studio-interaction-batches.ts`，0.8.1 重写版）的契约测试。
 *
 * 这些断言锁的不是「烘焙算法」（`studio-interaction-geometry` 另有单测），而是四条最容易
 * 在接线时写错、且错了就 quietly 退化成「没有优化」或「点不到东西」的语义：
 *
 * 1. 代理只在 `render()` 期间存在 —— 渲染前后成对地隐藏原网格 / 挂上代理，
 *    否则射线检测会打在空气上（拾取失效）。
 * 2. 同布局的两个楼层共用一份烘焙几何（内容键按「相对锚点」算，不含绝对位置）。
 * 3. 预算放不下时必须**退回不合并**，不能为了优化把显存撑爆。
 * 4. 静态版本没变时走快速路径，且不会因为「没重建」而丢掉代理。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const THREE = await import('three')
const MODULE = fileURLToPath(
  new URL('../../../../homeos/frontend/src/studio/app/3d-studio/authoring/studio-interaction-batches.ts',
    import.meta.url),
)
const { createInteractionBatches } = await import(MODULE)

/** 手动驱动的分片调度器：测试里同步把空闲回调跑完，不依赖 requestIdleCallback。 */
function makeDriver() {
  let pending = null
  return {
    schedule(callback) {
      pending = callback
      return { kind: 'timer', id: 1 }
    },
    cancel() {
      pending = null
    },
    pump(limit = 200) {
      let slices = 0
      while (pending && slices++ < limit) {
        const callback = pending
        pending = null
        callback({ didTimeout: true, timeRemaining: () => 10 })
      }
      return slices
    },
    get hasPending() {
      return pending !== null
    },
  }
}

function buildScene({ floors = 1, boxesPerFloor = 2 } = {}) {
  const scene = new THREE.Group()
  const root = new THREE.Group()
  root.userData.environmentModelId = 'house'
  scene.add(root)
  const geometry = new THREE.BoxGeometry(1, 1, 1)
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 })
  const meshes = []
  const addFloor = (floorIndex) => {
    const floor = new THREE.Group()
    floor.userData.environmentModelId = 'house'
    floor.userData.environmentFloorId = `f${floorIndex}`
    root.add(floor)
    for (let boxIndex = 0; boxIndex < boxesPerFloor; boxIndex++) {
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(boxIndex * 2, 0, floorIndex * 5)
      mesh.castShadow = true
      mesh.receiveShadow = true
      floor.add(mesh)
      meshes.push(mesh)
    }
    return floor
  }
  for (let floorIndex = 0; floorIndex < floors; floorIndex++) addFloor(floorIndex)
  scene.updateMatrixWorld(true)
  return { scene, root, geometry, material, meshes, addFloor }
}

function createHarness(options = {}) {
  const world = buildScene(options)
  const driver = makeDriver()
  const renderObservations = []
  const renderer = {
    render() {
      renderObservations.push(world.meshes.map((mesh) => mesh.visible))
    },
  }
  const originalRender = renderer.render
  const batches = createInteractionBatches({
    THREE,
    renderer,
    scene: world.scene,
    schedule: driver.schedule,
    cancel: driver.cancel,
    sliceMs: 100,
    ...options.batches,
  })
  return { ...world, renderer, originalRender, driver, batches, renderObservations }
}

const named = (scene, name) => scene.children.filter((child) => child.name === name)

/**
 * 推进到「代理已经挂上」的状态。
 *
 * 烘焙完成的当帧只生成代理对象，**下一帧 `begin()`** 才把它挂进场景（上游同样如此：
 * 完成回调里只 `requestFrame()`）。所以这里要跑两轮，别把「晚一帧」误当成「没生效」。
 */
function settle(harness) {
  harness.batches.begin(null)
  harness.driver.pump()
  harness.batches.begin(null)
  harness.driver.pump()
}

test('烘焙出的合并代理只在 render() 期间挂上，渲染前后原网格可见性成对恢复', () => {
  const harness = createHarness()
  const { batches, scene, meshes, renderer, renderObservations } = harness
  batches.prepare(harness.root, 'r1')
  settle(harness)

  assert.equal(batches.stats.pending, 0, '分片任务应当跑完')
  assert.equal(named(scene, 'prepared-static-parts').length, 1, '应当生成一个合并代理')
  assert.deepEqual(
    meshes.map((mesh) => mesh.visible),
    [false, false],
    '代理建好后原网格必须隐藏，否则会重复绘制',
  )

  renderer.render()
  assert.deepEqual(
    renderObservations[0],
    [true, true],
    '渲染期间必须看到原始网格（拾取 / 动画读的是它们）',
  )
  assert.deepEqual(
    meshes.map((mesh) => mesh.visible),
    [false, false],
    '渲染结束后代理要重新接回、原网格要再次隐藏',
  )
  batches.dispose()
})

test('两个楼层布局相同 → 共用一份烘焙几何（内容键不含绝对位置）', () => {
  const harness = createHarness({ floors: 2 })
  const { batches, scene, addFloor } = harness
  batches.prepare(harness.root, 'r1')
  settle(harness)
  assert.equal(batches.stats.pending, 0)
  assert.equal(batches.stats.rebuilds, 1)
  // 两个楼层共用同一个分片任务：只烘焙一次，生成两个代理。
  assert.equal(batches.stats.geometryAllocations, 1, '同内容键只应烘焙一次')
  assert.equal(named(scene, 'prepared-static-parts').length, 2, '每个楼层各一个代理')

  // 场景重建后（`prepare` 会撤掉代理但不丢几何缓存），新楼层的同布局分组直接命中缓存。
  addFloor(2)
  harness.scene.updateMatrixWorld(true)
  batches.prepare(harness.root, 'r2')
  settle(harness)
  assert.equal(
    batches.stats.geometryAllocations,
    1,
    '重建后三个楼层都应命中缓存，不该再烘焙第二份几何',
  )
  assert.ok(batches.stats.cacheHits >= 3, '每个楼层分组都应当命中几何缓存')
  batches.dispose()
})

test('预算放不下时退回不合并，原网格保持可见', () => {
  const harness = createHarness({
    batches: { maxBytes: 1, maxCachedBytes: 1 },
  })
  const { batches, scene, meshes } = harness
  batches.prepare(harness.root, 'r1')
  settle(harness)

  assert.ok(batches.stats.fallbacks > 0, '应当记录一次退回')
  assert.equal(named(scene, 'prepared-static-parts').length, 0)
  assert.deepEqual(
    meshes.map((mesh) => mesh.visible),
    [true, true],
    '没有代理就不能隐藏原网格，否则整片场景消失',
  )
  batches.dispose()
})

test('关闭 merge 后退回 InstancedMesh 合并（同几何才合并）', () => {
  const harness = createHarness({ batches: { merge: false } })
  const { batches, scene } = harness
  batches.prepare(harness.root, 'r1')
  settle(harness)

  assert.equal(named(scene, 'prepared-static-instances').length, 1)
  assert.equal(named(scene, 'prepared-static-parts').length, 0)
  batches.dispose()
})

test('静态版本未变的帧走快速路径，代理仍然挂着', () => {
  const harness = createHarness({ batches: { getStaticRevision: () => 'rev-1' } })
  const { batches, scene } = harness
  batches.prepare(harness.root, 'rev-1')
  settle(harness)
  const buildsAfterFirstFrame = batches.stats.rebuilds,
    fastFramesAfterSettle = batches.stats.fastFrames,
    reusedFramesAfterSettle = batches.stats.reusedFrames

  batches.begin(null)
  assert.equal(
    batches.stats.fastFrames,
    fastFramesAfterSettle + 1,
    '同版本再走一帧应当跳过逐网格校验',
  )
  assert.equal(
    batches.stats.reusedFrames,
    reusedFramesAfterSettle + 1,
    '内容没变就不该重建分组',
  )
  assert.equal(batches.stats.rebuilds, buildsAfterFirstFrame)
  assert.equal(
    named(scene, 'prepared-static-parts').length,
    1,
    '快速路径不能把代理弄丢',
  )
  batches.dispose()
})

test('dispose 撤掉全部代理并把 renderer.render 还原', () => {
  const harness = createHarness()
  const { batches, scene, renderer, originalRender, meshes } = harness
  batches.prepare(harness.root, 'r1')
  settle(harness)
  assert.equal(named(scene, 'prepared-static-parts').length, 1)

  batches.dispose()
  assert.equal(named(scene, 'prepared-static-parts').length, 0, '代理必须全部撤下')
  assert.equal(renderer.render, originalRender, 'render 包装必须还原')
  assert.deepEqual(
    meshes.map((mesh) => mesh.visible),
    [true, true],
    'dispose 后原网格必须可见，否则页面会空掉',
  )
})
