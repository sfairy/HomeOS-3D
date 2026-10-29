/**
 * WS 批次规范化「只送 delta」拆分与回填的契约测试。
 *
 * 守的是那条把 `worker 规范化失败,回退主线程` 刷出来的真实缺陷：
 * 断线补发（`state_replay`）会把整包实体状态以非 delta 条目塞进同一批，
 * 而规范化对它们只是原样透传。旧实现按整批条数判定是否走 Worker，
 * 于是整包实体被结构化克隆进 Worker 再克隆回来，只为拿回同样的引用——
 * 重连后最容易拖到 3s 超时，降级后主线程还要再同步算一遍。
 *
 * 所以这里锁死三件事：
 * 1. 拆分只挑 `_delta`，非 delta 一个都不送；
 * 2. 回填按原始下标写回，非 delta 位置引用不变（不再克隆）；
 * 3. 拆分 + 回填的结果与整批同步规范化逐条一致（含同实体多条 delta 依次叠加）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const MODULE = fileURLToPath(
  new URL('../../../../homeos/frontend/src/shared/entity/utils/state-delta.util.ts', import.meta.url),
)
const {
  mergeNormalizedDeltas,
  normalizeWsBatchChangesSync,
  splitDeltaChanges,
} = await import(MODULE)

/** 造一个非 delta 的整包实体状态补发条目 */
function fullState(entities, entityId, state) {
  return {
    entity_id: entityId,
    old_state: entities[entityId] ?? null,
    new_state: { entity_id: entityId, state, attributes: { friendly_name: entityId } },
  }
}

test('splitDeltaChanges 只挑 delta，并记住原始下标', () => {
  const changes = [
    fullState({}, 'light.a', 'on'),
    { _delta: true, entity_id: 'light.b', state: 'off', changed_attributes: { brightness: 3 } },
    fullState({}, 'light.c', 'on'),
    { _delta: true, entity_id: 'sensor.t', state: '21' },
  ]

  const { deltas, positions } = splitDeltaChanges(changes)

  assert.equal(deltas.length, 2)
  assert.deepEqual(positions, [1, 3])
  assert.equal(deltas[0].entity_id, 'light.b')
  assert.equal(deltas[1].entity_id, 'sensor.t')
})

test('mergeNormalizedDeltas 按原始下标回填，非 delta 引用保持不变', () => {
  const entities = { 'light.b': { entity_id: 'light.b', state: 'on', attributes: { a: 1 } } }
  const first = fullState(entities, 'light.a', 'on')
  const second = fullState(entities, 'light.c', 'off')
  const changes = [
    first,
    { _delta: true, entity_id: 'light.b', state: 'off' },
    second,
    { _delta: true, entity_id: 'sensor.t', state: '21' },
  ]
  const { deltas, positions } = splitDeltaChanges(changes)
  const normalizedDeltas = normalizeWsBatchChangesSync(deltas, entities)

  const merged = mergeNormalizedDeltas(changes, positions, normalizedDeltas)

  assert.ok(merged)
  assert.equal(merged.length, changes.length)
  // 非 delta 位置必须是同一个对象：回填不再复制整包实体
  assert.equal(merged[0], first)
  assert.equal(merged[2], second)
  assert.equal(merged[1].entity_id, 'light.b')
  assert.equal(merged[1].new_state.state, 'off')
  assert.deepEqual(merged[1].old_state.attributes, { a: 1 })
})

test('拆分 + 回填与整批同步规范化结果逐条一致', () => {
  const entities = {
    'light.b': { entity_id: 'light.b', state: 'on', attributes: { brightness: 40, color_temp: 300 } },
  }
  const changes = [
    { _delta: true, entity_id: 'light.b', state: 'off' },
    fullState(entities, 'light.c', 'on'),
    // 同实体两条 delta 必须依次叠加：后一条基于前一条的合并结果
    { _delta: true, entity_id: 'light.b', changed_attributes: { brightness: 80 } },
  ]
  const { deltas, positions } = splitDeltaChanges(changes)

  const merged = mergeNormalizedDeltas(
    changes,
    positions,
    normalizeWsBatchChangesSync(deltas, entities),
  )
  const expected = normalizeWsBatchChangesSync(changes, entities)

  assert.ok(merged)
  assert.deepEqual(merged, expected)
  assert.equal(merged[0].new_state.state, 'off')
  assert.equal(merged[0].new_state.attributes.brightness, 40)
  // 第二条 delta 必须看到第一条合并后的 state=off，而不是快照里的 on
  assert.equal(merged[2].old_state.state, 'off')
  assert.equal(merged[2].new_state.state, 'off')
  assert.equal(merged[2].new_state.attributes.brightness, 80)
})

test('结果条数与下标对不上时返回 null，交由调用方整批回退', () => {
  const changes = [{ _delta: true, entity_id: 'light.b', state: 'off' }]
  assert.equal(mergeNormalizedDeltas(changes, [0], []), null)
  assert.equal(mergeNormalizedDeltas(changes, [0, 1], [{}]), null)
})
