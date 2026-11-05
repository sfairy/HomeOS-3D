/**
 * 分块初态收尾（initial_states_end）的契约测试。
 *
 * 分块同步的三条门禁很容易被「顺手加一行」改坏，而症状都指向同一类故障：界面已连接、
 * 实体表却缺一部分且永不补全。
 *
 * 1. ``INITIAL_STATES_BEGIN`` 不能把 ``initialStatesReceived`` 置真 —— 一个 chunk 都没落地
 *    时置真，紧随其后的 delta 会直接合出半实体；
 * 2. 批次的「已到 chunk 实体集合 / 暂存 delta」在 BEGIN / END 都要清空，否则下一批会
 *    把上一批的实体当成本批已就绪；
 * 3. 收尾时收到数不足期望的 90% → 判不完整，交给 REST 整包回退（缺 chunk 是补不回来的）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const MODULE = fileURLToPath(new URL('../../../../homeos/frontend/src/shared/entity/utils/ws-sync.ts', import.meta.url))
const {
  createEntitySocketSyncState,
  incrementalBatchIncomplete,
  resetChunkBaselineTracking,
  waitForPendingChunkApplies,
} = await import(MODULE)

test('BEGIN 阶段的新同步状态不把 initialStatesReceived 置真', () => {
  const sync = createEntitySocketSyncState()
  assert.equal(sync.initialStatesReceived, false)
  assert.equal(sync.chunkedEntityIds.size, 0)
  assert.deepEqual(sync.pendingPreChunkDeltas, [])
})

test('BEGIN / END 都要清空「已到 chunk 集合」与暂存 delta', () => {
  const sync = createEntitySocketSyncState()
  sync.chunkedEntityIds.add('light.a')
  sync.pendingPreChunkDeltas.push({ _delta: true, entity_id: 'light.b' })
  sync.initialStatesReceived = true

  resetChunkBaselineTracking(sync)

  assert.equal(sync.chunkedEntityIds.size, 0)
  assert.deepEqual(sync.pendingPreChunkDeltas, [])
  // 重置批次跟踪不等于开启新批次：门禁状态由 BEGIN / END 自己负责。
  assert.equal(sync.initialStatesReceived, true)
})

test('分块不完整判据：不足 90% 才回退，少量过滤波动不算丢包', () => {
  assert.equal(incrementalBatchIncomplete(1000, 1000), false)
  assert.equal(incrementalBatchIncomplete(1000, 900), false, '刚好 90% 视为完整')
  assert.equal(incrementalBatchIncomplete(1000, 899), true)
  assert.equal(incrementalBatchIncomplete(1000, 0), true)
  assert.equal(incrementalBatchIncomplete(0, 0), false, '服务端没给总数时无从判断')
  assert.equal(incrementalBatchIncomplete(0, 12), false)
  assert.equal(incrementalBatchIncomplete(100, -1), true, '异常负数不能算作已收到')
})

test('没有待 apply 的 chunk 时收尾立即执行，不做无谓等待', () => {
  const sync = createEntitySocketSyncState()
  let ready = 0
  waitForPendingChunkApplies(sync, () => (ready += 1))
  assert.equal(ready, 1)
})

test('等待超时仍然收尾（不能把整批同步卡死在 END）', () => {
  const sync = createEntitySocketSyncState()
  sync.pendingChunkApplies = 1
  let ready = 0
  waitForPendingChunkApplies(sync, () => (ready += 1), Date.now() - 1)
  assert.equal(ready, 1)
})

test('pendingChunkApplies 归零后收尾', async () => {
  const sync = createEntitySocketSyncState()
  sync.pendingChunkApplies = 1
  let ready = 0
  waitForPendingChunkApplies(sync, () => (ready += 1))
  assert.equal(ready, 0, '还有 chunk 在 apply 时不能收尾')

  sync.pendingChunkApplies = 0
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.equal(ready, 1)
})
