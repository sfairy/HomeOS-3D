/**
 * `createDeviceStateMemo` 的契约测试（0.8.1 新增）。
 *
 * 它守的是每帧都会走的一条路：`sync` 接收整份 HA 实体状态表，但一件设备只关心
 * 自己绑定的几个实体。没有 memo 时，**任何**实体（隔壁房间的灯）一变，所有设备
 * 都会重新摆姿势 —— 表现是「家里有个传感器在跳，全屋家具都在抖」。
 *
 * 断言四件事：
 * - 首次调用必定 resolve + apply；
 * - context 与绑定实体状态都没变 → 跳过，且**不重新解析绑定**（缓存对象同一性）；
 * - 绑定的实体状态变了 → 用**上次解析好的**绑定 apply（不重解析）；
 * - 未绑定的实体变化 → 跳过；context 变化或 invalidate 后 → 重解析。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const modulePath = fileURLToPath(
  new URL(
    '../../../../homeos/frontend/src/studio/runtime/core/state-update-plan.ts',
    import.meta.url,
  ),
)
const { createDeviceStateMemo } = await import(modulePath)

const KEY = {}
const bindingsFor = (calls) => () => {
  calls.resolve += 1
  return {
    lighting: { 'light.kitchen': { on: true } },
    environment: { 'climate.living': { temperature: 24 } },
  }
}

const run = (memo, options) => {
  const calls = options.calls
  return memo.run(
    options.key ?? KEY,
    options.context ?? [1],
    options.states,
    bindingsFor(calls),
    () => {
      calls.apply += 1
    },
  )
}

test('首次调用必定解析并应用', () => {
  const memo = createDeviceStateMemo()
  const calls = { resolve: 0, apply: 0 }
  const applied = run(memo, { calls, states: { 'light.kitchen': { on: false } } })
  assert.equal(applied, true)
  assert.deepEqual(calls, { resolve: 1, apply: 1 })
})

test('状态表换了但绑定实体值没变 → 跳过且不重解析', () => {
  const memo = createDeviceStateMemo()
  const calls = { resolve: 0, apply: 0 }
  const kitchen = { on: false }
  run(memo, { calls, states: { 'light.kitchen': kitchen, 'light.hall': { on: true } } })
  const applied = run(memo, {
    calls,
    // 新状态表（每轮都是新引用），但 light.kitchen 仍是同一个值引用 —— HA store 里
    // 没变的实体不会换对象，这正是 memo 能省掉重绘的前提。
    states: { 'light.kitchen': kitchen, 'light.hall': { on: false } },
  })
  assert.equal(applied, false)
  assert.deepEqual(calls, { resolve: 1, apply: 1 })
})

test('绑定实体换了值引用就算变化（比较是引用相等，不是深比较）', () => {
  const memo = createDeviceStateMemo()
  const calls = { resolve: 0, apply: 0 }
  run(memo, { calls, states: { 'light.kitchen': { on: false } } })
  assert.equal(run(memo, { calls, states: { 'light.kitchen': { on: false } } }), true)
  assert.deepEqual(calls, { resolve: 1, apply: 2 })
})

test('同一份状态对象直接短路', () => {
  const memo = createDeviceStateMemo()
  const calls = { resolve: 0, apply: 0 }
  const states = { 'light.kitchen': { on: false } }
  run(memo, { calls, states })
  assert.equal(run(memo, { calls, states }), false)
  assert.deepEqual(calls, { resolve: 1, apply: 1 })
})

test('绑定实体状态变了 → 用缓存绑定重绘，不重解析', () => {
  const memo = createDeviceStateMemo()
  const calls = { resolve: 0, apply: 0 }
  run(memo, { calls, states: { 'light.kitchen': { on: false } } })
  const applied = run(memo, { calls, states: { 'light.kitchen': { on: true } } })
  assert.equal(applied, true)
  assert.deepEqual(calls, { resolve: 1, apply: 2 })
})

test('未绑定的实体变化不触发重绘', () => {
  const memo = createDeviceStateMemo()
  const calls = { resolve: 0, apply: 0 }
  run(memo, { calls, states: { 'light.hall': { on: false } } })
  const applied = run(memo, {
    calls,
    states: { 'light.hall': { on: true }, 'sensor.noise': { value: 12 } },
  })
  assert.equal(applied, false)
  assert.deepEqual(calls, { resolve: 1, apply: 1 })
})

test('context 变化 → 重解析并重绘', () => {
  const memo = createDeviceStateMemo()
  const calls = { resolve: 0, apply: 0 }
  run(memo, { calls, states: {} })
  const applied = run(memo, { calls, context: [2], states: {} })
  assert.equal(applied, true)
  assert.deepEqual(calls, { resolve: 2, apply: 2 })
})

test('context 逐项比较，长度不同也算变化', () => {
  const memo = createDeviceStateMemo()
  const calls = { resolve: 0, apply: 0 }
  run(memo, { calls, context: [1, 'a'], states: {} })
  assert.equal(run(memo, { calls, context: [1, 'a'], states: {} }), false)
  assert.deepEqual(calls, { resolve: 1, apply: 1 })
  assert.equal(run(memo, { calls, context: [1], states: {} }), true)
  assert.deepEqual(calls, { resolve: 2, apply: 2 })
})

test('不同 key 各自独立（多设备共用一个 memo）', () => {
  const memo = createDeviceStateMemo()
  const calls = { resolve: 0, apply: 0 }
  const other = {}
  run(memo, { calls, states: {} })
  const applied = run(memo, { calls, key: other, states: {} })
  assert.equal(applied, true)
  assert.deepEqual(calls, { resolve: 2, apply: 2 })
})

test('Map 与普通对象两种状态表都支持', () => {
  const memo = createDeviceStateMemo()
  const calls = { resolve: 0, apply: 0 }
  const off = { on: false }
  const on = { on: true }
  run(memo, { calls, states: new Map([['light.kitchen', off]]) })
  assert.equal(run(memo, { calls, states: new Map([['light.kitchen', off]]) }), false)
  assert.equal(run(memo, { calls, states: new Map([['light.kitchen', on]]) }), true)
  assert.deepEqual(calls, { resolve: 1, apply: 2 })
})

test('invalidate 之后重新解析', () => {
  const memo = createDeviceStateMemo()
  const calls = { resolve: 0, apply: 0 }
  run(memo, { calls, states: {} })
  memo.invalidate()
  assert.equal(run(memo, { calls, states: {} }), true)
  assert.deepEqual(calls, { resolve: 2, apply: 2 })
})
