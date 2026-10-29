/**
 * `resolveRuntimeFloor` 的契约测试（0.8.1 `floor-navigation`）。
 *
 * 失败模式很隐蔽：单层户型里「全屋」是合法字符串，于是运行时切到 overview，
 * 而那里根本没有第二层可看 —— 不报错、不空白，只是站在一个空的总览视角上，
 * 用户以为「3D 卡住了」。这里钉死三条：
 *
 * - 只有**多于一层**时 `"all"` 才被接受；
 * - 选中的楼层不存在（户型被改过）时回落到第一层，而不是保留悬空 id；
 * - 没有楼层时返回 `undefined`（调用方据此不渲染楼层态，而不是画个 `undefined` 层）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const modulePath = fileURLToPath(
  new URL(
    '../../../../homeos/frontend/src/studio/runtime/core/stage/floor-navigation.ts',
    import.meta.url,
  ),
)
const { resolveRuntimeFloor } = await import(modulePath)

const ONE = [{ id: 'f1' }]
const TWO = [{ id: 'f1' }, { id: 'f2' }]

test('单层户型拒绝 "all"，回落到第一层', () => {
  assert.equal(resolveRuntimeFloor(ONE, 'all'), 'f1')
  assert.equal(resolveRuntimeFloor([{ id: 'basement' }], 'all'), 'basement')
})

test('多层户型接受 "all"', () => {
  assert.equal(resolveRuntimeFloor(TWO, 'all'), 'all')
  assert.equal(resolveRuntimeFloor([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 'all'), 'all')
})

test('存在的楼层原样返回', () => {
  assert.equal(resolveRuntimeFloor(TWO, 'f2'), 'f2')
  assert.equal(resolveRuntimeFloor(ONE, 'f1'), 'f1')
})

test('悬空楼层 id 回落到第一层', () => {
  assert.equal(resolveRuntimeFloor(ONE, 'f-deleted'), 'f1')
  assert.equal(resolveRuntimeFloor(TWO, 'f-deleted'), 'f1')
})

test('空/缺省选择与空列表', () => {
  assert.equal(resolveRuntimeFloor(TWO, null), 'f1')
  assert.equal(resolveRuntimeFloor(TWO, undefined), 'f1')
  assert.equal(resolveRuntimeFloor(TWO, ''), 'f1')
  assert.equal(resolveRuntimeFloor(null, 'all'), undefined)
  assert.equal(resolveRuntimeFloor(undefined, 'f1'), undefined)
  assert.equal(resolveRuntimeFloor([], 'all'), undefined)
})

test('楼层条目为 null 时不抛异常', () => {
  assert.equal(resolveRuntimeFloor(null, 'all'), undefined)
  assert.equal(resolveRuntimeFloor([], 'f1'), undefined)
})

test('守卫就写在 "all" 分支上（而不是事后纠正）', () => {
  const source = readFileSync(modulePath, 'utf8')
  const allBranch = source.split('\n').find((line) => line.includes('"all"') && line.includes('return'))
  assert.ok(allBranch, '找不到 "all" 的返回分支')
  assert.match(allBranch, /length\s*>\s*1/, '"all" 必须带 floors.length > 1 守卫')
})
