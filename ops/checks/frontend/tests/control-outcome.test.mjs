/**
 * 控制响应语义回归（`ok` / `pending` / `skipped` / `verified`）。
 *
 * 背景：这三条入口（`/services/call`、`/ha/services/call`、3D 控制）历史上各自判定成功，
 * `/ha` 甚至**恒报成功**。于是「幂等键命中、首次请求仍在下发」与「实体被 HA 跳过」都让
 * 前端以为已生效：乐观态不回落，用户看到「点了一直没反应」或反过来「显示已开但灯是灭的」。
 *
 * 这里钉住后端统一判据在前端的落地：
 * - `ok === false` 且非 pending ⇒ 回滚；
 * - `pending` ⇒ **不回滚**（等 WS 推送），但提示「正在下发」；
 * - `verified === null`（未确认）⇒ 不回滚、不提示（避免噪声）；
 * - 提示优先级：pending > verified:false > skipped > queued > ok:false。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath, pathToFileURL } from 'node:url'

const { describeControlOutcome, resolveControlNotice } = await import(
  pathToFileURL(
    fileURLToPath(new URL('../../../../homeos/frontend/src/stores/entities/control-outcome.util.ts', import.meta.url)),
  ).href
)

test('受理且已确认：不回滚', () => {
  const outcome = describeControlOutcome({ ok: true, verified: true })
  assert.equal(outcome.shouldRollback, false)
  assert.equal(outcome.skipped, false)
  assert.equal(outcome.verifyFailed, false)
})

test('pending 不回滚（首次请求仍在下发，乐观态应等推送）', () => {
  const outcome = describeControlOutcome({ ok: false, pending: true, skipped: true })
  assert.equal(outcome.shouldRollback, false, 'pending 必须例外，否则界面会先恢复再跳变')
})

test('ok:false 且非 pending ⇒ 回滚', () => {
  assert.equal(describeControlOutcome({ ok: false }).shouldRollback, true)
})

test('skipped ⇒ 回滚', () => {
  assert.equal(describeControlOutcome({ ok: true, skipped: true }).shouldRollback, true)
  // 兼容历史字段位置：data.skipped
  assert.equal(describeControlOutcome({ ok: true, data: { skipped: true } }).shouldRollback, true)
})

test('verified:false ⇒ 回滚；verified:null 不回滚', () => {
  assert.equal(describeControlOutcome({ ok: true, verified: false }).shouldRollback, true)
  assert.equal(describeControlOutcome({ ok: true, verified: null }).shouldRollback, false, '未确认不等于失败')
})

test('空载荷 / null 不回滚（没有可判定的信息时不要动乐观态）', () => {
  assert.equal(describeControlOutcome(null).shouldRollback, false)
  assert.equal(describeControlOutcome({}).shouldRollback, false)
})

test('提示优先级：pending 优先于其它', () => {
  const payload = { ok: false, pending: true, skipped: true, verified: false }
  const notice = resolveControlNotice(payload, describeControlOutcome(payload))
  assert.equal(notice?.message, '相同指令正在下发中，请稍后确认设备状态')
  assert.equal(notice?.level, 'info')
})

test('提示优先级：verified:false 优先于 skipped', () => {
  const payload = { ok: true, verified: false, skipped: true }
  const notice = resolveControlNotice(payload, describeControlOutcome(payload))
  assert.equal(notice?.message, '指令已下发，但设备状态与预期不符')
  assert.equal(notice?.level, 'warning')
})

test('queued 有提示，ok:false 有提示', () => {
  const queued = { ok: true, queued: true }
  assert.equal(resolveControlNotice(queued, describeControlOutcome(queued))?.message, '命令已通过重连队列送达')

  const rejected = { ok: false }
  assert.equal(resolveControlNotice(rejected, describeControlOutcome(rejected))?.level, 'warning')
})

test('正常成功不产生任何提示（避免每次点灯都弹 toast）', () => {
  const payload = { ok: true, verified: true }
  assert.equal(resolveControlNotice(payload, describeControlOutcome(payload)), null)
})

test('verified:null 不提示（未知态提示只会变成噪声）', () => {
  const payload = { ok: true, verified: null }
  assert.equal(resolveControlNotice(payload, describeControlOutcome(payload)), null)
})
