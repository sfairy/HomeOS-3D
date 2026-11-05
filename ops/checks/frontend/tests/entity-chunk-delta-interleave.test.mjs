/**
 * 分块初态（initial_states chunk）与实时 delta 交错到达的契约测试。
 *
 * 守的是那条「半实体」缺陷：``INITIAL_STATES_CHUNK`` 与 ``state_changed`` 会被网关分到
 * 两个不同的帧里，先到的那条 delta 只能合成本地没有基线的残缺实体（只有 state + 变动属性）。
 * 旧实现遇到「chunk 比本地旧」就整条跳过，缺失的属性键**永远补不回来** —— HA 只在真正
 * 变化时才推送，而界面照常显示「已连接」，看起来一切正常。
 *
 * 所以这里锁死两件事：
 * 1. chunk 比本地旧时按「本地优先、chunk 补缺」合并，不能整条丢弃；
 * 2. 合并后的实体能继续被后续 delta 正常叠加（补全的键不会反过来被覆盖掉）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const MODULE = fileURLToPath(
  new URL('../../../../homeos/frontend/src/shared/entity/utils/state-delta.util.ts', import.meta.url),
)
const { isOlderFrameTimestamp, isStaleState, mergeChunkIntoNewerEntity, mergeWsStateChange } = await import(MODULE)

/** 本地先用一条 delta 合出来的「半实体」：只有 state 和一个变动属性。 */
function halfEntity(entityId = 'light.kitchen') {
  return {
    entity_id: entityId,
    state: 'on',
    last_updated: '2026-11-01T10:00:09.000Z',
    last_changed: '2026-11-01T10:00:09.000Z',
    attributes: { brightness: 80 },
  }
}

test('chunk 比本地旧时补全缺失属性，state 与时间戳仍以本地为准', () => {
  const local = halfEntity()
  const chunk = {
    entity_id: 'light.kitchen',
    state: 'off',
    last_updated: '2026-11-01T10:00:05.000Z',
    last_changed: '2026-11-01T10:00:05.000Z',
    attributes: { brightness: 40, color_temp: 300, friendly_name: '厨房灯' },
  }

  assert.equal(isStaleState(chunk.last_updated, local), true, 'chunk 明确比本地旧')

  const merged = mergeChunkIntoNewerEntity(local, chunk)

  // 本地是更新的一次快照：状态、时间戳、同键属性都不能被旧 chunk 盖回。
  assert.equal(merged.state, 'on')
  assert.equal(merged.last_updated, '2026-11-01T10:00:09.000Z')
  assert.equal(merged.last_changed, '2026-11-01T10:00:09.000Z')
  assert.equal(merged.attributes.brightness, 80)
  // 缺失的键只能靠 chunk 补：这正是「不整条跳过」的意义。
  assert.equal(merged.attributes.color_temp, 300)
  assert.equal(merged.attributes.friendly_name, '厨房灯')
  assert.equal(Object.values(merged.attributes).includes(undefined), false)
})

test('chunk 更新或时间戳缺失时不判陈旧，由调用方整条采用', () => {
  const local = halfEntity()

  assert.equal(isStaleState('2026-11-01T10:00:12.000Z', local), false, '更新的 chunk 不陈旧')
  assert.equal(isStaleState('2026-11-01T10:00:09.000Z', local), false, '同一时刻不算陈旧')
  // 拿不到凭据就不判陈旧：宁可整条覆盖，也不把真实更新丢掉。
  assert.equal(isStaleState(undefined, local), false)
  assert.equal(isStaleState(undefined, null), false)
})

test('交错：delta 半实体 → 旧 chunk 补全 → 后续 delta 继续叠加', () => {
  let entity = null

  entity = mergeWsStateChange(entity, {
    _delta: true,
    entity_id: 'light.kitchen',
    state: 'on',
    changed_attributes: { brightness: 80 },
    changed_at: '2026-11-01T10:00:09.000Z',
  })
  assert.equal(entity.state, 'on')
  assert.equal(entity.attributes.color_temp, undefined, 'delta 里本来就没有这个键')

  entity = mergeChunkIntoNewerEntity(entity, {
    entity_id: 'light.kitchen',
    state: 'off',
    last_updated: '2026-11-01T10:00:05.000Z',
    last_changed: '2026-11-01T10:00:05.000Z',
    attributes: { brightness: 40, color_temp: 300, friendly_name: '厨房灯' },
  })
  assert.equal(entity.state, 'on')
  assert.equal(entity.attributes.color_temp, 300)

  entity = mergeWsStateChange(entity, {
    _delta: true,
    entity_id: 'light.kitchen',
    changed_attributes: { brightness: 100 },
    changed_at: '2026-11-01T10:00:12.000Z',
  })
  assert.equal(entity.state, 'on')
  assert.equal(entity.attributes.brightness, 100)
  // 补全的键在后续 delta 合并中必须保留（否则又是半实体）。
  assert.equal(entity.attributes.color_temp, 300)
  assert.equal(entity.attributes.friendly_name, '厨房灯')
  assert.equal(entity.last_updated, '2026-11-01T10:00:12.000Z')
})

test('/ws/runtime 旧帧判定与 socket.io 侧共用同一份实现', () => {
  const current = '2026-11-01T10:00:09.000Z'

  assert.equal(isOlderFrameTimestamp('2026-11-01T10:00:05.000Z', current), true)
  assert.equal(isOlderFrameTimestamp('2026-11-01T10:00:12.000Z', current), false)
  assert.equal(isOlderFrameTimestamp(current, current), false)
  // hub 归一后的字段可能缺 updatedAt，退回 lastChanged；两边都缺时不能判陈旧。
  assert.equal(isOlderFrameTimestamp(undefined, current), false)
  assert.equal(isOlderFrameTimestamp('2026-11-01T10:00:05.000Z', undefined), false)
  // HA 时间戳带微秒：必须与 parseHaTimestamp 同口径解析（截到毫秒），不能被引擎差异判成 Invalid。
  assert.equal(isOlderFrameTimestamp('2026-11-01T10:00:05.123456+00:00', '2026-11-01T10:00:05.124999+00:00'), true)
})
