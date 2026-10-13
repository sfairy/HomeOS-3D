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
 *  3. **非终态关闭码**：必须退避重连（初值 3000ms），上限 30000ms。
 *  4. **环境不支持的终态**：浏览器无 `MediaSource`/`ManagedMediaSource`、地址非法、
 *     未填地址，都要走 `onUnavailable`，否则 `HaCameraStream.vue` 不会落回既有通路。
 *  5. **首帧协商 + 缓冲治理**：首帧必须是 `{type:'mse', value:<按 isTypeSupported 过滤的
 *     编解码串>}`，服务端回 `{type:'mse'}` 后建 `SourceBuffer`，二进制段入队再 append。
 *  6. **dispose 幂等且摘回调**：不摘 socket 回调直接关会再触发一轮重连。
 *
 * 运行环境说明：Bun 里没有浏览器 DOM —— `window`（`location` / `MediaSource` / WebSocket /
 * 定时器）与 `URL.createObjectURL`（Bun 只接受 Blob，浏览器接受 MediaSource）全部打桩。
 * 用法：`bun run scripts/_go2rtc_mse_smoke.ts`。
 */
import {
  GO2RTC_AUTH_HINT,
  createGo2RtcMseTransport,
  normalizeGo2rtcTarget,
  type CameraVisualState,
} from '@/shared/camera/composables/useGo2RtcMseTransport'

const failures: string[] = []
/** 断言计数（自数，避免加/删断言后末尾的「（N 项）」变成谎言）。 */
let checked = 0

function check(label: string, condition: boolean, detail: unknown = ''): void {
  checked += 1
  console.log(`  [${condition ? 'PASS' : 'FAIL'}] ${label} ${condition ? '' : JSON.stringify(detail)}`)
  if (!condition) failures.push(label)
}

/* ------------------------------------------------------------------ *
 * 环境桩
 * ------------------------------------------------------------------ */

;(globalThis as unknown as { window: unknown }).window = {
  location: { href: 'https://home.local/security/' },
}
;(URL as unknown as { createObjectURL: (value: unknown) => string }).createObjectURL = () =>
  'blob:go2rtc-smoke'

class FakeSourceBuffer {
  mode = ''
  updating = false
  buffered = { length: 0, start: () => 0, end: () => 0 }
  listeners: Record<string, Array<() => void>> = {}
  appended: unknown[] = []
  addEventListener(type: string, handler: () => void) {
    ;(this.listeners[type] ||= []).push(handler)
  }
  appendBuffer(chunk: unknown) {
    this.appended.push(chunk)
  }
  remove() {}
}

class FakeMediaSource {
  static last: FakeMediaSource | null = null
  static isTypeSupported() {
    return true
  }
  readyState = 'open'
  listeners: Record<string, Array<() => void>> = {}
  sourceBuffers: FakeSourceBuffer[] = []
  constructor() {
    FakeMediaSource.last = this
  }
  addEventListener(type: string, handler: () => void) {
    ;(this.listeners[type] ||= []).push(handler)
  }
  addSourceBuffer() {
    const buffer = new FakeSourceBuffer()
    this.sourceBuffers.push(buffer)
    return buffer
  }
  endOfStream() {}
}

class FakeWebSocket {
  static OPEN = 1
  static last: FakeWebSocket | null = null
  static created: string[] = []
  readyState = 1
  binaryType = ''
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null
  onerror: (() => void) | null = null
  constructor(public url: string) {
    FakeWebSocket.last = this
    FakeWebSocket.created.push(url)
  }
  send(payload: string) {
    this.sent.push(payload)
  }
  close() {
    this.readyState = 3
  }
}

const timers: Array<{ delay: number }> = []
const fakeWindow = {
  location: { href: 'https://home.local/security/' },
  MediaSource: FakeMediaSource as unknown,
  setTimeout: (_handler: () => void, delay = 0) => {
    timers.push({ delay })
    return timers.length
  },
  clearTimeout: () => {},
}
;(globalThis as unknown as { window: unknown }).window = fakeWindow
;(globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocket

function makeVideo() {
  const listeners: Record<string, Array<() => void>> = {}
  return {
    readyState: 0,
    currentTime: 0,
    src: '',
    srcObject: null as unknown,
    addEventListener: (type: string, handler: () => void) => {
      ;(listeners[type] ||= []).push(handler)
    },
    removeEventListener: (type: string, handler: () => void) => {
      listeners[type] = (listeners[type] || []).filter((item) => item !== handler)
    },
    emit: (type: string) => (listeners[type] || []).forEach((handler) => handler()),
    pause: () => {},
    removeAttribute: () => {},
    play: () => Promise.resolve(),
  }
}

/* ------------------------------------------------------------------ *
 * ① 地址归一
 * ------------------------------------------------------------------ */

console.log('\n① 地址归一（用户填的 stream.html → 同源中继）')
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

console.log('\n② 不支持 / 非法 / 未填 → onUnavailable（调用方据此落回既有通路）')
{
  const unavailable: string[] = []
  delete (fakeWindow as { MediaSource?: unknown }).MediaSource
  const handle = createGo2RtcMseTransport({
    video: makeVideo() as unknown as HTMLVideoElement,
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
    video: makeVideo() as unknown as HTMLVideoElement,
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

console.log('\n③ 正常通路')
{
  const states: Array<[CameraVisualState, string | undefined]> = []
  let readyCount = 0
  const video = makeVideo()
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
  socket.onmessage?.({ data: new Uint8Array([1, 2, 3]).buffer })
  check('二进制段入队并 append', sourceBuffer?.appended.length === 1)
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

console.log('\n④ 非终态关闭码 → 退避重连')
{
  const states: Array<[CameraVisualState, string | undefined]> = []
  timers.length = 0
  const handle = createGo2RtcMseTransport({
    video: makeVideo() as unknown as HTMLVideoElement,
    url: 'http://192.168.1.5:1984/stream.html?src=cam1',
    onStateChange: (state, message) => states.push([state, message]),
  })
  ;(FakeWebSocket.last as FakeWebSocket).onclose?.({ code: 1006 })
  check(
    '1006 → 排 3000ms 重连',
    timers.filter((timer) => timer.delay === 3000).length === 1 && states.at(-1)?.[0] === 'reconnecting',
    states.at(-1),
  )
  check('重连期间句柄仍存活', handle.isActive() === true)
  handle.dispose()
}

/* ------------------------------------------------------------------ *
 * 结果
 * ------------------------------------------------------------------ */

console.log('')
if (failures.length) {
  console.log(`go2rtc MSE 传输回归失败：${failures.length} 项`)
  for (const label of failures) console.log(`  - ${label}`)
  process.exit(1)
}
console.log(`go2rtc MSE 传输回归全部通过（${checked} 项）。`)
