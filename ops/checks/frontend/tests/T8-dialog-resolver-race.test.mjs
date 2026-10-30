/**
 * T8：共享确认弹窗的 Promise 解析器竞态。
 *
 * confirm.ts / adminDialogs.ts 都用「模块级 resolver 变量 + Promise」把模态弹窗包装成
 * await。旧实现每次打开直接覆盖 resolver：上一次未结算的 Promise 被丢弃，调用方的
 * await 永久悬挂（按钮 loading 不解除、后续流程不执行）。正常交互是模态的、很难并发，
 * 但键盘连按 / 两个入口同时触发仍可达，所以钉住「重复打开时旧请求按取消收敛」。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createPinia, setActivePinia } from 'pinia'

const load = async (relativePath) => {
  const modulePath = fileURLToPath(new URL('../../../../' + relativePath, import.meta.url))
  return import(pathToFileURL(modulePath).href)
}

test('confirm：重复打开时旧的 Promise 按“取消”收敛，不悬挂', async () => {
  setActivePinia(createPinia())
  const { useConfirmStore } = await load('homeos-store/frontend/src/shared/stores/confirm.ts')
  const store = useConfirmStore()

  const first = store.confirm({ title: '删除账号' })
  const second = store.confirm({ title: '删除账号（再次触发）' })
  store.settle(true)

  assert.equal(await first, false, '被覆盖的第一次确认必须结算为 false')
  assert.equal(await second, true, '最新一次确认仍按用户选择结算')
})

test('adminDialogs：askAdjust 重复打开时旧 Promise 结算为 null', async () => {
  setActivePinia(createPinia())
  const { useAdminDialogsStore } = await load(
    'homeos-store/frontend/src/features/admin/stores/adminDialogs.ts',
  )
  const store = useAdminDialogsStore()

  const first = store.askAdjust({ accountId: 'a1', label: 'a@x.com' })
  const second = store.askAdjust({ accountId: 'a2', label: 'b@x.com' })
  const target = { delta: 100, frozenDelta: 0, note: '补偿' }
  store.settleAdjust(target)

  assert.equal(await first, null, '被覆盖的调账请求必须结算为 null（等同取消）')
  assert.deepEqual(await second, target)
})

test('adminDialogs：askPurge 重复打开时旧 Promise 结算为 null', async () => {
  setActivePinia(createPinia())
  const { useAdminDialogsStore } = await load(
    'homeos-store/frontend/src/features/admin/stores/adminDialogs.ts',
  )
  const store = useAdminDialogsStore()

  const first = store.askPurge({ title: '清理', message: 'm', impact: 'i' })
  const second = store.askPurge({ title: '清理（再次触发）', message: 'm', impact: 'i' })
  store.settlePurge(7)

  assert.equal(await first, null, '被覆盖的清理请求必须结算为 null')
  assert.equal(await second, 7)
})
