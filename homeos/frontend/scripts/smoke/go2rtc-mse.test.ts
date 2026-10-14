/**
 * go2rtc MSE 传输回归（`shared/camera/composables/useGo2RtcMseTransport.ts`）—— `bun test` 版。
 *
 * 由脚本式冒烟 `_go2rtc_mse_smoke.ts` 迁移而来（`ops/testing/README.md` ADR-0001 的 P3-b）。
 * 断言逐条保留，换掉的是载体：分节脚本 → `test()` 命名用例 + `test.each` 参数化
 * （地址归一那张表正是 ADR 说的「参数化 × 逐参数定位」场景）。
 *
 * 夹具仍然全部来自 `_smoke_harness`（`window` / `MediaSource` / `WebSocket` / `URL.createObjectURL`
 * 四个浏览器面 + 记录排程的 `FakeTimers`）—— 换框架不换夹具，是 ADR 明确保留的部分。
 *
 * 运行：`bun test scripts/smoke/go2rtc-mse.test.ts`（在 `homeos/frontend` 下执行）。
 */
import { beforeEach, expect, test } from 'bun:test'

import {
  GO2RTC_AUTH_HINT,
  createGo2RtcMseTransport,
  normalizeGo2rtcTarget,
  type CameraVisualState,
} from '../../src/shared/camera/composables/useGo2RtcMseTransport'

import {
  FakeMediaSource,
  FakeTimers,
  FakeWebSocket,
  createFakeVideo,
  installGlobal,
  installObjectUrl,
  installWindow,
} from '../_smoke_harness'

let timers: FakeTimers
let fakeWindow: Record<string, unknown>

/** 每个用例都从「干净桩 + 空静态记录」开始：脚本版靠顺序推进，这里靠隔离。 */
beforeEach(() => {
  timers = new FakeTimers()
  FakeWebSocket.created.length = 0
  FakeWebSocket.last = null
  FakeMediaSource.last = null
  fakeWindow = installWindow({
    location: { href: 'https://home.local/security/' },
    MediaSource: FakeMediaSource as unknown,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  })
  installGlobal('WebSocket', FakeWebSocket)
  installObjectUrl('blob:go2rtc-smoke')
})

const fakeVideo = () => createFakeVideo() as unknown as HTMLVideoElement

/** 旧脚本里的 `closeCurrent`：关掉当前 socket（非终态关闭码驱动退避重连）。 */
const closeCurrent = (code: number) => (FakeWebSocket.last as FakeWebSocket).onclose?.({ code } as CloseEvent)

test('① 地址归一：用户填的 stream.html → 同源中继', () => {
  const relayUrl = normalizeGo2rtcTarget('http://192.168.1.5:1984/stream.html?src=cam1', 'p1', 'c1', 'camera-2')
  expect(relayUrl, '带齐三个标识的同源 wss 地址').toBe(
    'wss://home.local/api/v1/go2rtc/ws?cameraId=camera-2&projectId=p1&componentId=c1',
  )
  expect(normalizeGo2rtcTarget('  '), '缺地址 → 空串（降级 HLS/MJPEG）').toBe('')
})

test.each([
  ['非 http(s) → 抛错', 'rtsp://192.168.1.5/s'],
  ['非 /stream.html → 抛错', 'http://192.168.1.5:1984/x.html?src=a'],
  ['缺 src → 抛错', 'http://192.168.1.5:1984/stream.html'],
  ['带账号密码 → 抛错', 'http://u:p@192.168.1.5:1984/stream.html?src=a'],
] as const)('① %s', (_label, url) => {
  expect(() => normalizeGo2rtcTarget(url)).toThrow()
})

test('② 无 MediaSource → onUnavailable，句柄仍存活到调用方 dispose', () => {
  const unavailable: string[] = []
  delete fakeWindow.MediaSource

  const handle = createGo2RtcMseTransport({
    video: fakeVideo(),
    url: 'http://192.168.1.5:1984/stream.html?src=a',
    onUnavailable: (message) => unavailable.push(message),
  })

  expect(unavailable[0], '无 MediaSource → 终态不可用').toBe('当前浏览器不支持 go2rtc 视频中转')
  expect(handle.isActive(), '句柄存活到调用方 dispose').toBe(true)

  handle.dispose()
  expect(handle.isActive(), 'dispose 后句柄不再存活').toBe(false)
})

test('② 地址非法 → onUnavailable，且不发 socket', () => {
  const unavailable: string[] = []

  const handle = createGo2RtcMseTransport({
    video: fakeVideo(),
    url: 'http://8.8.8.8:1984/index.html',
    onUnavailable: (message) => unavailable.push(message),
  })

  expect(unavailable[0], '地址非法 → 终态').toBe('go2rtc 地址必须指向 /stream.html')
  expect(FakeWebSocket.created.length, '地址非法 → 不发 socket').toBe(0)
  handle.dispose()
})

test('③ 正常通路：首帧协商 → SourceBuffer → 串行 append → ready', () => {
  const states: Array<[CameraVisualState, string | undefined]> = []
  let readyCount = 0
  const video = createFakeVideo()

  const handle = createGo2RtcMseTransport({
    video: video as unknown as HTMLVideoElement,
    url: 'http://192.168.1.5:1984/stream.html?src=cam1',
    projectId: 'p1',
    componentId: 'c1',
    cameraId: 'camera-2',
    onStateChange: (state, message) => states.push([state, message]),
    onReady: () => (readyCount += 1),
  })

  const socket = FakeWebSocket.last as FakeWebSocket
  expect(socket.url.includes('/api/v1/go2rtc/ws?cameraId=camera-2'), 'relay 地址带齐标识').toBe(true)
  expect(socket.binaryType, 'binaryType=arraybuffer').toBe('arraybuffer')

  socket.onopen?.()
  const signaling = socket.sent[0] ? JSON.parse(socket.sent[0]) : null
  expect(signaling?.type, '首帧是 mse 协商').toBe('mse')
  expect(String(signaling?.value).includes('avc1.640029'), '编解码串按 isTypeSupported 过滤').toBe(true)

  socket.onmessage?.({ data: JSON.stringify({ type: 'mse', value: 'video/mp4; codecs="avc1.640029"' }) })
  const sourceBuffer = FakeMediaSource.last?.sourceBuffers[0]
  expect(!!sourceBuffer, '服务端协商回来 → 建 SourceBuffer').toBe(true)
  expect(sourceBuffer?.mode, 'SourceBuffer 用 segments 模式').toBe('segments')

  socket.onmessage?.({ data: new Uint8Array([1, 2, 3]).buffer })
  expect(sourceBuffer?.appended.length, '二进制段入队并 append').toBe(1)

  // 串行队列：`updating` 期间只排队，`updateend` 到了才写下一段。
  sourceBuffer!.updating = true
  socket.onmessage?.({ data: new Uint8Array([4]).buffer })
  socket.onmessage?.({ data: new Uint8Array([5]).buffer })
  expect(sourceBuffer?.appended.length, 'updating 期间新段只排队不 append').toBe(1)

  sourceBuffer!.updating = false
  sourceBuffer!.emit('updateend')
  expect(sourceBuffer?.appended.length, 'updateend → 写队列里的第 2 段').toBe(2)
  sourceBuffer!.emit('updateend')
  expect(sourceBuffer?.appended.length, '再一个 updateend → 写第 3 段（顺序不乱）').toBe(3)

  video.readyState = 2
  video.emit('playing')
  expect(readyCount, '首帧播放 → ready 只报一次').toBe(1)
  expect(states.at(-1)?.[0], '末态是 ready').toBe('ready')

  const socketCountBefore = FakeWebSocket.created.length
  socket.onclose?.({ code: 4401 })
  expect(FakeWebSocket.created.length, '4401 终态不再重连').toBe(socketCountBefore)
  expect(states.at(-1)?.[1], '4401 提示登录 / 授权 / 已保存配置').toBe(GO2RTC_AUTH_HINT)

  handle.dispose()
  handle.dispose()
  expect(handle.isActive(), 'dispose 幂等').toBe(false)
})

test('④ 非终态关闭码 → 退避重连（3000 起、翻倍、封顶 30000）', () => {
  const states: Array<[CameraVisualState, string | undefined]> = []

  const handle = createGo2RtcMseTransport({
    video: fakeVideo(),
    url: 'http://192.168.1.5:1984/stream.html?src=cam1',
    onStateChange: (state, message) => states.push([state, message]),
  })

  const socketCountAfterConnect = FakeWebSocket.created.length
  closeCurrent(1006)
  const scheduled: number[] = [timers.delays()[0]]
  expect(scheduled[0], '1006 → 排 3000ms 重连').toBe(3000)
  expect(states.at(-1)?.[0], '1006 → 报 reconnecting').toBe('reconnecting')
  expect(handle.isActive(), '重连期间句柄仍存活').toBe(true)

  // 推进虚拟时钟真的执行重连，再断一次，读下一次排程 —— 覆盖「翻倍」与「封顶」。
  for (let step = 0; step < 5; step += 1) {
    timers.advance(scheduled.at(-1) as number)
    closeCurrent(1006)
    scheduled.push(timers.delays()[0])
  }

  expect(JSON.stringify(scheduled), '退避序列 3000→6000→12000→24000→30000→30000（封顶）').toBe(
    JSON.stringify([3000, 6000, 12000, 24000, 30000, 30000]),
  )
  expect(FakeWebSocket.created.length - socketCountAfterConnect, '每次推进都真的重建了 socket').toBe(5)
  handle.dispose()
})
