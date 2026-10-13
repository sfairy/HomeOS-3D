/* eslint-disable no-console -- 冒烟脚本的唯一交付物就是控制台 PASS/FAIL 记录 */
/**
 * go2rtc MSE 传输回归（`shared/camera/composables/useGo2RtcMseTransport.ts`）。
 *
 * 守护的故障（每条都对应一次真实踩坑）：
 *  1. **地址归一**：用户填的是 `stream.html?src=…`，前端必须转成同源中继
 *     `/api/v1/go2rtc/ws`（带 `projectId`/`componentId`/`cameraId`），**不能**自己去连
 *     局域网主机 —— 这是「不让前端当开放代理」的第一道约定；空地址返回空串，让调用方
 *     落回 HLS/MJPEG 通路。
 *  2. **终态关闭码**：`{4400,4401,4403}` 必须停止重连并报「请检查登录、授权及已保存的
 *     摄像头配置」。若当成普通断线，配错的摄像头会按 3s→30s 退避无限重连，画面永远转圈。
 *  3. **非终态关闭码**：必须退避重连（初值 3000ms），逐次翻倍，上限 30000ms。
 *  4. **环境不支持的终态**：浏览器无 `MediaSource`/`ManagedMediaSource`、地址非法、
 *     未填地址，都要走 `onUnavailable`，否则 `HaCameraStream.vue` 不会落回既有通路。
 *  5. **首帧协商 + 缓冲治理**：首帧必须是 `{type:'mse', value:<按 isTypeSupported 过滤的
 *     编解码串>}`，服务端回 `{type:'mse'}` 后建 `SourceBuffer`，二进制段入队后**串行**
 *     append（`updating` 期间只排队，等 `updateend` 再写下一段）。
 *  6. **dispose 幂等且摘回调**：不摘 socket 回调直接关会再触发一轮重连。
 *
 * 运行环境说明：Bun 里没有浏览器 DOM —— `window`（`location` / `MediaSource` / WebSocket /
 * 定时器）与 `URL.createObjectURL`（Bun 只接受 Blob，浏览器接受 MediaSource）由
 * `_smoke_harness` 统一打桩；定时器是**虚拟时钟**（`FakeTimers`），所以退避序列能用
 * `advance` 真实推进，而不是只看「排了一个 3000ms」。
 *
 * 用法：`bun run scripts/_go2rtc_mse_smoke.ts`（在 homeos/frontend 下执行）。
 */
import {
  GO2RTC_AUTH_HINT,
  createGo2RtcMseTransport,
  normalizeGo2rtcTarget,
  type CameraVisualState,
} from '@/shared/camera/composables/useGo2RtcMseTransport'

import {
  FakeMediaSource,
  FakeTimers,
  FakeWebSocket,
  check,
  createFakeVideo,
  installGlobal,
  installObjectUrl,
  installWindow,
  report,
  section,
} from '../_smoke_harness'

/* ------------------------------------------------------------------ *
 * 环境桩（模块内的 window 访问都是懒的，但桩必须在任何 push 之前生效）
 * ------------------------------------------------------------------ */

const timers = new FakeTimers()
const fakeWindow = installWindow({
  location: { href: 'https://home.local/security/' },
  MediaSource: FakeMediaSource as unknown,
  setTimeout: timers.setTimeout,
  clearTimeout: timers.clearTimeout,
})
installGlobal('WebSocket', FakeWebSocket)
installObjectUrl('blob:go2rtc-smoke')

/* ------------------------------------------------------------------ *
 * ① 地址归一
 * ------------------------------------------------------------------ */

section('① 地址归一（用户填的 stream.html → 同源中继）')
const relayUrl = normalizeGo2rtcTarget(
  'http://192.168.1.5:1984/stream.html?src=cam1',
  'p1',
  'c1',
  'camera-2',
)
check(
  '带齐三个标识的同源 wss 地址',
  relayUrl === 'wss://home.local/api/v1/go2rtc/ws?cameraId=camera-2&projectId=p1&componentId=c1',
  relayUrl,
)
check('缺地址 → 空串（降级 HLS/MJPEG）', normalizeGo2rtcTarget('  ') === '')

for (const [label, url] of [
  ['非 http(s) → 抛错', 'rtsp://192.168.1.5/s'],
  ['非 /stream.html → 抛错', 'http://192.168.1.5:1984/x.html?src=a'],
  ['缺 src → 抛错', 'http://192.168.1.5:1984/stream.html'],
  ['带账号密码 → 抛错', 'http://u:p@192.168.1.5:1984/stream.html?src=a'],
] as const) {
  let threw = false
  try {
    normalizeGo2rtcTarget(url)
  } catch {
    threw = true
  }
  check(label, threw)
}

/* ------------------------------------------------------------------ *
 * ② 环境不支持的终态
 * ------------------------------------------------------------------ */

section('② 不支持 / 非法 / 未填 → onUnavailable（调用方据此落回既有通路）')
{
  const unavailable: string[] = []
  delete (fakeWindow as { MediaSource?: unknown }).MediaSource
  const handle = createGo2RtcMseTransport({
    video: createFakeVideo() as unknown as HTMLVideoElement,
    url: 'http://192.168.1.5:1984/stream.html?src=a',
    onUnavailable: (message) => unavailable.push(message),
  })
  check(
    '无 MediaSource → 终态不可用',
    unavailable[0] === '当前浏览器不支持 go2rtc 视频中转',
    unavailable,
  )
  check('句柄存活到调用方 dispose', handle.isActive() === true)
  handle.dispose()
  check('dispose 后句柄不再存活', handle.isActive() === false)
  fakeWindow.MediaSource = FakeMediaSource as unknown
}
{
  const unavailable: string[] = []
  const socketCountBefore = FakeWebSocket.created.length
  const handle = createGo2RtcMseTransport({
    video: createFakeVideo() as unknown as HTMLVideoElement,
    url: 'http://8.8.8.8:1984/index.html',
    onUnavailable: (message) => unavailable.push(message),
  })
  check('地址非法 → 终态', unavailable[0] === 'go2rtc 地址必须指向 /stream.html', unavailable)
  check('地址非法 → 不发 socket', FakeWebSocket.created.length === socketCountBefore)
  handle.dispose()
}

/* ------------------------------------------------------------------ *
 * ③ 正常通路：首帧协商 → SourceBuffer → ready
 * ------------------------------------------------------------------ */

section('③ 正常通路')
{
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
  check('relay 地址带齐标识', socket.url.includes('/api/v1/go2rtc/ws?cameraId=camera-2'), socket.url)
  check('binaryType=arraybuffer', socket.binaryType === 'arraybuffer')
  socket.onopen?.()
  const signaling = socket.sent[0] ? JSON.parse(socket.sent[0]) : null
  check(
    '首帧是 mse 协商（编解码串按 isTypeSupported 过滤）',
    signaling?.type === 'mse' && String(signaling.value).includes('avc1.640029'),
    signaling,
  )
  socket.onmessage?.({
    data: JSON.stringify({ type: 'mse', value: 'video/mp4; codecs="avc1.640029"' }),
  })
  const sourceBuffer = FakeMediaSource.last?.sourceBuffers[0]
  check('服务端协商回来 → 建 SourceBuffer', !!sourceBuffer)
  check('SourceBuffer 用 segments 模式', sourceBuffer?.mode === 'segments')

  socket.onmessage?.({ data: new Uint8Array([1, 2, 3]).buffer })
  check('二进制段入队并 append', sourceBuffer?.appended.length === 1, sourceBuffer?.appended)

  // 串行队列：`updating` 期间只排队，`updateend` 到了才写下一段。
  sourceBuffer!.updating = true
  socket.onmessage?.({ data: new Uint8Array([4]).buffer })
  socket.onmessage?.({ data: new Uint8Array([5]).buffer })
  check(
    'updating 期间新段只排队不 append',
    sourceBuffer?.appended.length === 1,
    sourceBuffer?.appended,
  )
  sourceBuffer!.updating = false
  sourceBuffer!.emit('updateend')
  check('updateend → 写队列里的第 2 段', sourceBuffer?.appended.length === 2, sourceBuffer?.appended)
  sourceBuffer!.emit('updateend')
  check('再一个 updateend → 写第 3 段（顺序不乱）', sourceBuffer?.appended.length === 3, sourceBuffer?.appended)

  video.readyState = 2
  video.emit('playing')
  check('首帧播放 → ready', readyCount === 1 && states.at(-1)?.[0] === 'ready', states)

  const socketCountBefore = FakeWebSocket.created.length
  socket.onclose?.({ code: 4401 })
  check('4401 终态不再重连', FakeWebSocket.created.length === socketCountBefore)
  check('4401 提示登录 / 授权 / 已保存配置', states.at(-1)?.[1] === GO2RTC_AUTH_HINT, states.at(-1))
  handle.dispose()
  handle.dispose()
  check('dispose 幂等', handle.isActive() === false)
}

/* ------------------------------------------------------------------ *
 * ④ 非终态关闭码 → 退避重连
 * ------------------------------------------------------------------ */

section('④ 非终态关闭码 → 退避重连（3000 起、翻倍、封顶 30000）')
{
  const states: Array<[CameraVisualState, string | undefined]> = []
  timers.reset()
  const handle = createGo2RtcMseTransport({
    video: createFakeVideo() as unknown as HTMLVideoElement,
    url: 'http://192.168.1.5:1984/stream.html?src=cam1',
    onStateChange: (state, message) => states.push([state, message]),
  })
  const closeCurrent = (code: number) =>
    (FakeWebSocket.last as FakeWebSocket).onclose?.({ code } as CloseEvent)

  const socketCountAfterConnect = FakeWebSocket.created.length
  closeCurrent(1006)
  const scheduled: number[] = [timers.delays()[0]]
  check(
    '1006 → 排 3000ms 重连并报 reconnecting',
    scheduled[0] === 3000 && states.at(-1)?.[0] === 'reconnecting',
    { delays: timers.delays(), state: states.at(-1) },
  )
  check('重连期间句柄仍存活', handle.isActive() === true)

  // 推进虚拟时钟真的执行重连，再断一次，读下一次排程 —— 覆盖「翻倍」与「封顶」。
  for (let step = 0; step < 5; step += 1) {
    timers.advance(scheduled.at(-1) as number)
    closeCurrent(1006)
    scheduled.push(timers.delays()[0])
  }
  check(
    '退避序列 3000→6000→12000→24000→30000→30000（封顶）',
    JSON.stringify(scheduled) === JSON.stringify([3000, 6000, 12000, 24000, 30000, 30000]),
    scheduled,
  )
  check(
    '每次推进都真的重建了 socket',
    FakeWebSocket.created.length === socketCountAfterConnect + 5,
    FakeWebSocket.created.length - socketCountAfterConnect,
  )
  handle.dispose()
}

report('go2rtc MSE 传输回归')
