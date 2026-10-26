/**
 * 场景同步控制器的契约测试（`kind === "replace"` 这条分支以前是空实现）。
 *
 * 背景：`studio-app.ts` 曾经注入 `replaceScene: () => {}`，全量变更被吞掉却仍上报
 * `full-reload` —— 调用方按「已重建」继续走，界面停在旧场景，且日志里没有任何线索。
 * 现在 `replaceScene` 是可选依赖：没注入时必须返回 `reload-unavailable`，且**不能**先
 * flush（保存一次却仍停在旧场景，等于白推一次版本）。
 *
 * 用 `bun test` 跑：被测模块有扩展名省略的相对 import，Node 的 type-stripping 解析不了。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const MODULE = fileURLToPath(
  new URL(
    '../../../../homeos/frontend/src/studio/app/3d-studio/authoring/store/scene-sync-controller.ts',
    import.meta.url,
  ),
)
const { StudioSceneSyncController, mergeFloors } = await import(MODULE)

/** 一层的基线场景：`settings` 里带本地视图键，用来验证合并时不被远端覆盖。 */
function floor(id, overrides = {}) {
  return {
    id,
    name: `${id} 层`,
    scene: { settings: { cameraView: 'local', snapGrid: 10 }, components: [] },
    ...overrides,
  }
}

function scene(floors, extra = {}) {
  return { floors, baseLighting: { power: 1 }, ...extra }
}

/** 构造控制器依赖；`calls` 记录副作用顺序，便于断言「先 flush 再 replace」。 */
function makeController(overrides = {}) {
  const calls = []
  const state = { flush: 'saved' }
  const deps = {
    getRuntimeScene: () => overrides.runtimeScene,
    isDirty: () => overrides.isDirty ?? false,
    flush: async () => {
      calls.push('flush')
      return state.flush
    },
    ...(overrides.withReplace
      ? {
          replaceScene: () => {
            calls.push('replace')
          },
        }
      : {}),
    ...(overrides.isEmbedded ? { isEmbedded: () => true } : {}),
  }
  return { controller: new StudioSceneSyncController(deps), calls, state }
}

test('全量变更：注入了 replaceScene 才上报 full-reload', async () => {
  const runtimeScene = scene([floor('f1')])
  const remoteScene = scene([floor('f1'), floor('f2')])
  const { controller, calls } = makeController({
    runtimeScene,
    withReplace: true,
  })

  const outcome = await controller.handleRemoteScene(remoteScene)

  assert.deepEqual(outcome, { kind: 'full-reload', afterFlush: false })
  assert.deepEqual(calls, ['replace'])
})

test('全量变更 + 未注入 replaceScene：返回 reload-unavailable 且不 flush', async () => {
  const runtimeScene = scene([floor('f1')])
  const remoteScene = scene([floor('f1'), floor('f2')])
  const { controller, calls } = makeController({ runtimeScene })

  const outcome = await controller.handleRemoteScene(remoteScene)

  assert.deepEqual(outcome, { kind: 'deferred', reason: 'reload-unavailable' })
  // 关键：不能在「没人重建」的情况下先把本地改动保存掉。
  assert.deepEqual(calls, [])
})

test('本地脏：先 flush 再 replace', async () => {
  const runtimeScene = scene([floor('f1')])
  const remoteScene = scene([floor('f1'), floor('f2')])
  const { controller, calls } = makeController({
    runtimeScene,
    isDirty: true,
    withReplace: true,
  })

  const outcome = await controller.handleRemoteScene(remoteScene)

  assert.deepEqual(outcome, { kind: 'full-reload', afterFlush: true })
  assert.deepEqual(calls, ['flush', 'replace'])
})

test('flush 冲突：不覆盖本地，也不重建', async () => {
  const { controller, calls, state } = makeController({
    runtimeScene: scene([floor('f1')]),
    isDirty: true,
    withReplace: true,
  })
  state.flush = 'conflict'

  const outcome = await controller.handleRemoteScene(scene([floor('f1'), floor('f2')]))

  assert.deepEqual(outcome, { kind: 'conflict', reason: 'local-dirty' })
  assert.deepEqual(calls, ['flush'])
})

test('flush 失败：本轮搁置，不重建', async () => {
  const { controller, calls, state } = makeController({
    runtimeScene: scene([floor('f1')]),
    isDirty: true,
    withReplace: true,
  })
  state.flush = 'failed'

  const outcome = await controller.handleRemoteScene(scene([floor('f1'), floor('f2')]))

  assert.deepEqual(outcome, { kind: 'stalled', reason: 'flush-failed' })
  assert.deepEqual(calls, ['flush'])
})

test('仅楼层名变化：metadata-only，就地改名', async () => {
  const runtimeScene = scene([floor('f1')])
  const remoteScene = scene([floor('f1', { name: '客厅' })])
  const { controller } = makeController({ runtimeScene })

  const outcome = await controller.handleRemoteScene(remoteScene)

  assert.equal(outcome.kind, 'metadata-only')
  assert.equal(runtimeScene.floors[0].name, '客厅')
})

test('embedded 舞台：忽略同步（不 flush、不改场景）', async () => {
  const runtimeScene = scene([floor('f1')])
  const { controller, calls } = makeController({
    runtimeScene,
    isDirty: true,
    withReplace: true,
    isEmbedded: true,
  })

  const outcome = await controller.handleRemoteScene(scene([floor('f1'), floor('f2')]))

  assert.deepEqual(outcome, { kind: 'ignored', reason: 'embedded' })
  assert.deepEqual(calls, [])
  assert.equal(runtimeScene.floors.length, 1)
})

test('楼层合并：只替换指定楼层，并保留本地视图设置', () => {
  const runtimeScene = scene([floor('f1'), floor('f2')])
  const remoteScene = scene([
    floor('f1', { scene: { settings: { cameraView: 'remote' }, components: [{ id: 'c1' }] } }),
    floor('f2', { scene: { settings: {}, components: [{ id: 'c2' }] } }),
  ])

  const replaced = mergeFloors(runtimeScene, remoteScene, ['f1'])

  assert.deepEqual(replaced, ['f1'])
  // 内容来自远端，视图键来自本地。
  assert.deepEqual(runtimeScene.floors[0].scene.components, [{ id: 'c1' }])
  assert.equal(runtimeScene.floors[0].scene.settings.cameraView, 'local')
  assert.equal(runtimeScene.floors[0].scene.settings.snapGrid, 10)
  // 未点名的楼层原样保留。
  assert.deepEqual(runtimeScene.floors[1].scene.components, [])
})

test('decide 是纯函数：只决策不改场景', () => {
  const runtimeScene = scene([floor('f1')])
  const snapshot = JSON.stringify(runtimeScene)
  const { controller } = makeController({ runtimeScene })

  const decision = controller.decide(scene([floor('f1', { name: '客厅' })]))

  assert.equal(decision.kind, 'metadata-only')
  assert.equal(JSON.stringify(runtimeScene), snapshot)
})
