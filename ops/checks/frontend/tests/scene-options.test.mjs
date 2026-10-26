/**
 * 「HA 场景」下拉派生逻辑的回归（`features/home-mode/composables/scene-options.util.ts`）。
 *
 * 守的是两个真实修过的 bug：
 * 1. 冷启动时实体缓存是空的、`scene.*` 之后才陆续到达 —— 所以必须有「签名」能反映
 *    `scene.*` 的增删改名，否则下拉框会永久空白；
 * 2. 签名只该看 `scene.*` 的 id + friendly_name，不能被其他实体的状态推送带着重算。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const MODULE = fileURLToPath(
  new URL(
    '../../../../homeos/frontend/src/features/home-mode/composables/scene-options.util.ts',
    import.meta.url,
  ),
)
const { buildSceneOptions, sceneEntitiesSignature } = await import(MODULE)

test('场景映射为选项：name 优先，缺 name 回退 id', () => {
  const options = buildSceneOptions(
    [
      { id: 'scene.movie', name: '观影模式' },
      { id: 'scene.sleep' },
    ],
    { includeEmpty: false, emptyLabel: '不联动场景' },
  )

  assert.deepEqual(
    options.map((option) => [option.value, option.label]),
    [
      ['scene.movie', '观影模式'],
      ['scene.sleep', 'scene.sleep'],
    ],
  )
})

test('空 id 的脏数据不进入选项（否则会出现选不中的幽灵项）', () => {
  const options = buildSceneOptions(
    [{ id: '' }, { id: '   ' }, { id: 'scene.ok', name: '回家' }],
    { includeEmpty: false, emptyLabel: '不联动场景' },
  )

  assert.deepEqual(options.map((option) => option.value), ['scene.ok'])
})

test('includeEmpty 默认语义：前置一个值为空串的「不联动场景」', () => {
  const options = buildSceneOptions([{ id: 'scene.a', name: 'A' }], {
    includeEmpty: true,
    emptyLabel: '不联动场景',
  })

  assert.equal(options[0].value, '')
  assert.equal(options[0].label, '不联动场景')
  assert.equal(options.length, 2)
})

test('签名为空时稳定为空串（冷启动 / 无实体）', () => {
  assert.equal(sceneEntitiesSignature(undefined), '')
  assert.equal(sceneEntitiesSignature(null), '')
  assert.equal(sceneEntitiesSignature({}), '')
})

test('冷启动后场景到达：签名从空变为非空', () => {
  assert.equal(sceneEntitiesSignature({ 'light.a': { state: 'on' } }), '')

  const afterArrival = sceneEntitiesSignature({
    'light.a': { state: 'on' },
    'scene.movie': { attributes: { friendly_name: '观影模式' } },
  })

  assert.equal(afterArrival, 'scene.movie:观影模式')
})

test('非 scene.* 实体的状态推送不改变签名（不触发下拉重建）', () => {
  const before = sceneEntitiesSignature({
    'scene.movie': { attributes: { friendly_name: '观影模式' } },
    'light.a': { state: 'off', attributes: { brightness: 0 } },
  })
  const after = sceneEntitiesSignature({
    'scene.movie': { attributes: { friendly_name: '观影模式' } },
    'light.a': { state: 'on', attributes: { brightness: 200 } },
  })

  assert.equal(before, after)
})

test('场景改名 / 删除都会改变签名，且按 id 排序保证稳定', () => {
  const base = sceneEntitiesSignature({
    'scene.b': { attributes: { friendly_name: 'B' } },
    'scene.a': { attributes: { friendly_name: 'A' } },
  })
  assert.equal(base, 'scene.a:A|scene.b:B')

  const renamed = sceneEntitiesSignature({
    'scene.b': { attributes: { friendly_name: 'B2' } },
    'scene.a': { attributes: { friendly_name: 'A' } },
  })
  assert.notEqual(renamed, base)

  const removed = sceneEntitiesSignature({
    'scene.a': { attributes: { friendly_name: 'A' } },
  })
  assert.notEqual(removed, base)
})
