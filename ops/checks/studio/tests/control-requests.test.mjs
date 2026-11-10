import { expect, test } from 'bun:test'
import {
  settleControlRequest,
  trackControlRequest,
} from '../../../../homeos/frontend/src/studio/runtime/core/stage/control-requests.ts'

const track = (requests, id, timeoutMs, onTimeout = () => {}) =>
  new Promise((resolve, reject) => {
    trackControlRequest(requests, id, { resolve, reject, entityId: 'media_player.tv' }, timeoutMs, onTimeout)
  })

test('结果先到：清除计时器并 resolve，附加字段可读', async () => {
  const requests = new Map()
  const pending = track(requests, 'tv-1', 10_000)
  expect(requests.get('tv-1').entityId).toBe('media_player.tv')
  settleControlRequest(requests, 'tv-1', '')
  await expect(pending).resolves.toBeUndefined()
  expect(requests.size).toBe(0)
})

test('带错误信息结算：reject 并移出挂起表', async () => {
  const requests = new Map()
  const pending = track(requests, 'lock-1', 10_000)
  settleControlRequest(requests, 'lock-1', '设备离线')
  await expect(pending).rejects.toThrow('设备离线')
  expect(requests.has('lock-1')).toBe(false)
})

test('超时回调按 requestId 结算；已结算的 id 再次结算无副作用', async () => {
  const requests = new Map()
  const pending = track(requests, 'climate-1', 5, () => settleControlRequest(requests, 'climate-1', '请求超时'))
  await expect(pending).rejects.toThrow('请求超时')
  expect(() => settleControlRequest(requests, 'climate-1', '')).not.toThrow()
})
