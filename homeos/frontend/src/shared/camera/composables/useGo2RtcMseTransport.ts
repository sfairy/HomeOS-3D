/**
 * go2rtc MSE（fMP4 + MediaSource）传输，Vue 与 Studio 共用一份实现。
 *
 * 与 HA Bridge 0.7.6 发布包的 `registry.js` 协议逐条对齐：
 * - 信令是**服务端**拼的：前端只上报 projectId/componentId/cameraId，地址由 `/api/v1/go2rtc/ws`
 *   从已保存的配置里取（Studio 查仪表盘文档，Vue 安防页查布局方案），前端这份
 *   `normalizeGo2rtcTarget` 只负责把用户填的 `stream.html?src=…` 转成那条同源 WebSocket
 *   （真正的白名单校验在后端）。
 * - 首帧必须发 `{type:'mse', value:'<编解码串>'}`，编解码串按 `isTypeSupported` 过滤。
 * - 缓冲治理：落后 >3s 跳到 `buffered.end - 0.3`；跨度 >12s 从头部 `remove` 到 `end - 10`；
 *   待写入队列上限 8MiB，超了直接重连。
 * - 断线退避 3000ms → 30000ms；关闭码 `{4400,4401,4403}` 是终态不再重连，
 *   其中 4401/4403 额外提示“请检查登录、授权及已保存的摄像头配置”。
 * - 画面停滞看门狗：每 5s 采样 `currentTime`，连续 3 次不动即重连。
 * - `{type:'error'}` 直接把中继给的原因透传给用户（后端已把地址打码成 `[视频源]`），
 *   末尾补“（正在重连）”；`fail` 缺省文案是“摄像头连接中断，正在重连”。
 *
 * Studio 侧由 `studio/app/renderer/registry/camera-media.ts` 继续导出复用，避免两份协议漂移。
 */
import { onUnmounted, ref, watch, type Ref } from 'vue'
import { logger } from '@/shared/utils/core/logger'

/** 同源中继路径（后端 `api/go2rtc.py` 挂在 API 前缀 `/api/v1` 下）。 */
const GO2RTC_WS_PATH = '/api/v1/go2rtc/ws'

/** MSE 编解码协商候选，顺序即偏好；实际发送前按浏览器 `isTypeSupported` 过滤。 */
const GO2RTC_CODEC_CANDIDATES = [
  'avc1.640029',
  'avc1.64002A',
  'avc1.640033',
  'hvc1.1.6.L153.B0',
  'mp4a.40.2',
  'mp4a.40.5',
  'flac',
  'opus',
] as const

/** `dataset.cameraTransport` / `container.dataset.cameraTransport` 的取值。 */
export const GO2RTC_TRANSPORT_NAME = 'go2rtc-mse'

/** 登录态/授权类关闭码的提示文案。 */
const GO2RTC_AUTH_HINT = '请检查登录、授权及已保存的摄像头配置'

const MEDIA_QUEUE_MAX_BYTES = 8 * 1024 * 1024
const CATCHUP_LAG_SECONDS = 3
const CATCHUP_RESUME_SECONDS = 0.3
const PRUNE_SPAN_SECONDS = 12
const PRUNE_KEEP_SECONDS = 10
const RECONNECT_INITIAL_DELAY_MS = 3000
const RECONNECT_MAX_DELAY_MS = 30000
const CONNECT_TIMEOUT_MS = 12000
const STALL_WATCH_INTERVAL_MS = 5000
const STALL_TICKS_BEFORE_RECONNECT = 3
/** 中继 `error` 消息透传给用户的长度上限，避免畸形报文把提示区撑爆。 */
const RELAY_MESSAGE_MAX_LENGTH = 400

/** 终态关闭码：中继认定这次连接不该再重试（参数非法 / 未登录 / 来源或授权不允许）。 */
const TERMINAL_CLOSE_CODES = new Set([4400, 4401, 4403])
/** 终态里属于“登录或授权有问题”的子集，给更具体的提示。 */
const AUTH_CLOSE_CODES = new Set([4401, 4403])

/** 摄像机舞台的视觉状态（写入 `dataset.cameraVisualState`）。 */
type CameraVisualState =
  | 'idle'
  | 'connecting'
  | 'reconnecting'
  | 'ready'
  | 'unavailable'
  | 'suspended'

/** `window.ManagedMediaSource` / `window.MediaSource`：vite-env.d.ts 的 Window 只有索引签名，这里补局部类型。 */
type MediaSourceRuntimeCtor = {
  isTypeSupported: (mediaType: string) => boolean
  new (): MediaSource
}

function resolveMediaSourceCtor(): {
  mediaSourceCtor: MediaSourceRuntimeCtor
  isManaged: boolean
} | null {
  const runtimeWindow = window as Window & {
    ManagedMediaSource?: MediaSourceRuntimeCtor
    MediaSource?: MediaSourceRuntimeCtor
  }
  if (runtimeWindow.ManagedMediaSource?.isTypeSupported)
    return { mediaSourceCtor: runtimeWindow.ManagedMediaSource, isManaged: true }
  if (runtimeWindow.MediaSource?.isTypeSupported)
    return { mediaSourceCtor: runtimeWindow.MediaSource, isManaged: false }
  return null
}

/**
 * 把用户填写的 go2rtc `stream.html` 地址转成同源中继 WebSocket 地址。
 *
 * 返回空串表示“没填地址”，调用方据此退回 HLS/MJPEG 通路；
 * 地址格式非法直接抛错（`go2rtcUrl` 是用户手填的，必须给明确反馈）。
 */
export function normalizeGo2rtcTarget(
  rawValue: unknown,
  projectId?: string,
  componentId?: string,
  cameraId?: string,
): string {
  const rawTarget = String(rawValue || '').trim()
  if (!rawTarget) return ''
  let parsedTarget: URL
  try {
    parsedTarget = new URL(rawTarget)
  } catch {
    throw new Error('go2rtc 地址无效')
  }
  if (!['http:', 'https:'].includes(parsedTarget.protocol))
    throw new Error('go2rtc 地址必须使用 http:// 或 https://')
  if (parsedTarget.pathname.replace(/\/$/, '') !== '/stream.html')
    throw new Error('go2rtc 地址必须指向 /stream.html')
  if (!parsedTarget.searchParams.get('src')?.trim())
    throw new Error('go2rtc 地址必须包含有效的 src')
  if (parsedTarget.username || parsedTarget.password)
    throw new Error('go2rtc 地址不能包含账号或密码')
  const relayUrl = new URL(GO2RTC_WS_PATH, window.location.href)
  if (cameraId) relayUrl.searchParams.set('cameraId', String(cameraId))
  relayUrl.protocol = relayUrl.protocol === 'https:' ? 'wss:' : 'ws:'
  relayUrl.searchParams.set('projectId', String(projectId || ''))
  relayUrl.searchParams.set('componentId', String(componentId || ''))
  return relayUrl.href
}

interface Go2RtcMseTransportOptions {
  /** 承载 MSE 的 video 元素（会写入 `srcObject` 或 blob URL）。 */
  video: HTMLVideoElement
  /** 用户填写的 go2rtc `stream.html` 地址。 */
  url: string
  projectId?: string
  componentId?: string
  cameraId?: string
  /** 状态变化（connecting/reconnecting/ready/unavailable），用于驱动占位文案与视觉类。 */
  onStateChange?: (state: CameraVisualState, message?: string) => void
  /** 首帧到达并开始播放。 */
  onReady?: () => void
  /** 不再重试（终态关闭码 / 地址或浏览器不支持 / 连接超时耗尽重试后仍失败）。 */
  onUnavailable?: (message: string) => void
}

export interface Go2RtcMseTransportHandle {
  /** 释放 socket / MediaSource / 定时器；幂等。 */
  dispose: () => void
  /**
   * 句柄是否仍存活（`dispose()` 之后才是 `false`）。
   *
   * 注意：**不是**「此刻是否在出画」—— 终态失败（地址非法 / 4400 / 4401 / 4403 / 不支持 MSE）
   * 后内部已停止重连，但句柄仍存活到调用方 `dispose()`，调用方要判断「该不该换通路」请用
   * `onUnavailable` 回调（Studio 的 `dataset.cameraState`、Vue 的 `isGo2rtcUnavailable` 都是这么做的）。
   */
  isActive: () => boolean
}

/**
 * 创建一条 go2rtc MSE 传输。
 *
 * 内部自带重连与画面停滞看门狗，调用方只需在页面挂起/卸载时 `dispose()`。
 */
export function createGo2RtcMseTransport(
  options: Go2RtcMseTransportOptions,
): Go2RtcMseTransportHandle {
  const {
    video: videoElement,
    url: rawGo2rtcUrl,
    projectId,
    componentId,
    cameraId,
    onStateChange = () => {},
    onReady = () => {},
    onUnavailable = () => {},
  } = options

  let isDisposed = false
  let isReady = false
  let transportGeneration = 0
  let reconnectTimerId = 0
  let connectTimerId = 0
  let stallTimerId = 0
  let reconnectDelayMs = RECONNECT_INITIAL_DELAY_MS
  let activeSocket: WebSocket | null = null
  let activeMediaSource: MediaSource | null = null
  let objectUrl = ''
  let resetStreamQueue = () => {}

  const clearConnectTimers = () => {
    window.clearTimeout(connectTimerId)
    window.clearTimeout(reconnectTimerId)
    connectTimerId = 0
    reconnectTimerId = 0
  }

  const stopStallWatch = () => {
    window.clearTimeout(stallTimerId)
    stallTimerId = 0
  }

  const releaseActiveStream = () => {
    const socket = activeSocket
    const mediaSource = activeMediaSource
    activeSocket = null
    activeMediaSource = null
    if (socket) {
      // 先摘掉回调再关，否则关闭会再触发一轮重连。
      socket.onopen = null
      socket.onmessage = null
      socket.onclose = null
      socket.onerror = null
      try {
        socket.close()
      } catch {
        /* 已关闭 */
      }
    }
    try {
      if (mediaSource && mediaSource.readyState === 'open') mediaSource.endOfStream()
    } catch {
      /* 已在关闭途中 */
    }
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl)
      objectUrl = ''
    }
    videoElement.pause()
    videoElement.removeAttribute('src')
    videoElement.srcObject = null
  }

  const dispose = () => {
    if (isDisposed) return
    isDisposed = true
    transportGeneration += 1
    clearConnectTimers()
    stopStallWatch()
    releaseActiveStream()
  }

  /**
   * 结束当前这一代连接并决定是否重连。
   *
   * `message` 有缺省值（与发布包的 `fail(generation, message = '摄像头连接中断，正在重连')`
   * 一致）：`sourceBuffer` 的 `error` 事件不带任何原因，只能落到这条通用文案。
   */
  const fail = (generation: number, message = '摄像头连接中断，正在重连', { retry = true } = {}) => {
    if (isDisposed || generation !== transportGeneration) return
    clearConnectTimers()
    stopStallWatch()
    releaseActiveStream()
    if (!retry) {
      onStateChange('unavailable', message)
      onUnavailable(message)
      return
    }
    // 退避重连：断线越频繁，间隔越长，上限 30s。
    onStateChange('reconnecting', message)
    reconnectTimerId = window.setTimeout(connect, reconnectDelayMs)
    reconnectDelayMs = Math.min(RECONNECT_MAX_DELAY_MS, reconnectDelayMs * 2)
  }

  const armStallWatch = (generation: number) => {
    stopStallWatch()
    let lastCurrentTime = videoElement.currentTime
    let stalledTicks = 0
    const sample = () => {
      stallTimerId = 0
      if (isDisposed || generation !== transportGeneration) return
      const currentTime = videoElement.currentTime
      // currentTime 只要前进过就清零；否则累计停滞次数。
      stalledTicks =
        Number.isFinite(currentTime) && currentTime > lastCurrentTime ? 0 : stalledTicks + 1
      lastCurrentTime = currentTime
      if (stalledTicks >= STALL_TICKS_BEFORE_RECONNECT) {
        fail(generation, '摄像头画面停滞，正在重连')
        return
      }
      stallTimerId = window.setTimeout(sample, STALL_WATCH_INTERVAL_MS)
    }
    stallTimerId = window.setTimeout(sample, STALL_WATCH_INTERVAL_MS)
  }

  const startPlayback = (generation: number) => {
    let relayUrl = ''
    try {
      relayUrl = normalizeGo2rtcTarget(rawGo2rtcUrl, projectId, componentId, cameraId)
    } catch (error) {
      fail(generation, error instanceof Error ? error.message : 'go2rtc 地址无效', { retry: false })
      return
    }
    if (!relayUrl) {
      fail(generation, '请先填写 go2rtc 地址', { retry: false })
      return
    }
    const mediaSourceRuntime = resolveMediaSourceCtor()
    if (!mediaSourceRuntime) {
      fail(generation, '当前浏览器不支持 go2rtc 视频中转', { retry: false })
      return
    }
    const { mediaSourceCtor, isManaged } = mediaSourceRuntime

    let socket: WebSocket
    let mediaSource: MediaSource
    try {
      mediaSource = new mediaSourceCtor()
      socket = new WebSocket(relayUrl)
    } catch {
      fail(generation, '摄像头连接中断，正在重连')
      return
    }
    socket.binaryType = 'arraybuffer'
    activeSocket = socket
    activeMediaSource = mediaSource

    const isCurrent = () =>
      !isDisposed && generation === transportGeneration && activeSocket === socket

    let sourceBuffer: SourceBuffer | null = null
    let pendingChunks: ArrayBuffer[] = []
    let pendingBytes = 0
    let hasSentSignaling = false

    resetStreamQueue = () => {
      pendingChunks = []
      pendingBytes = 0
    }

    const sendSignaling = () => {
      if (!isCurrent() || hasSentSignaling) return
      if (mediaSource.readyState !== 'open' || socket.readyState !== WebSocket.OPEN) return
      const codecList = GO2RTC_CODEC_CANDIDATES.filter((codec) =>
        mediaSourceCtor.isTypeSupported(`video/mp4; codecs="${codec}"`),
      ).join(',')
      if (!codecList) {
        fail(generation, '当前浏览器不支持摄像头视频格式', { retry: false })
        return
      }
      hasSentSignaling = true
      window.clearTimeout(connectTimerId)
      connectTimerId = 0
      socket.send(JSON.stringify({ type: 'mse', value: codecList }))
    }

    const flushStreamQueue = () => {
      if (!isCurrent() || !sourceBuffer || sourceBuffer.updating) return
      if (mediaSource.readyState !== 'open') return
      try {
        if (sourceBuffer.buffered.length) {
          const bufferEnd = sourceBuffer.buffered.end(sourceBuffer.buffered.length - 1)
          const bufferStart = sourceBuffer.buffered.start(0)
          // 落后太多就跳帧追到尾部附近，否则会越播越慢。
          if (bufferEnd - videoElement.currentTime > CATCHUP_LAG_SECONDS)
            videoElement.currentTime = Math.max(bufferStart, bufferEnd - CATCHUP_RESUME_SECONDS)
          // 跨度太大先裁员，避免 SourceBuffer 无限增长。
          if (bufferEnd - bufferStart > PRUNE_SPAN_SECONDS) {
            sourceBuffer.remove(bufferStart, bufferEnd - PRUNE_KEEP_SECONDS)
            return
          }
        }
        if (pendingChunks.length) {
          const chunk = pendingChunks.shift()
          if (chunk) {
            pendingBytes -= chunk.byteLength
            sourceBuffer.appendBuffer(chunk)
          }
        }
      } catch {
        fail(generation, '摄像头视频缓冲失败，正在重连')
      }
    }

    // 本段是 MediaSource / SourceBuffer 的一次性生命周期监听：sourceopen 触发即自摘（once），
    // updateend 挂在**本次** SourceBuffer 上、随流对象回收；video 元素上的两个已配对摘除（见下方清理）。
    mediaSource.addEventListener('sourceopen', sendSignaling, { once: true })
    socket.onopen = sendSignaling
    socket.onmessage = (messageEvent: MessageEvent) => {
      if (!isCurrent()) return
      try {
        if (typeof messageEvent.data === 'string') {
          const payload = JSON.parse(messageEvent.data)
          if (payload?.type === 'mse') {
            if (sourceBuffer || !mediaSourceCtor.isTypeSupported(String(payload.value)))
              throw new Error('unsupported codec')
            sourceBuffer = mediaSource.addSourceBuffer(String(payload.value))
            sourceBuffer.mode = 'segments'
            sourceBuffer.addEventListener('updateend', flushStreamQueue)
            sourceBuffer.addEventListener('error', () => fail(generation))
            flushStreamQueue()
          } else if (payload?.type === 'error') {
            // 中继把失败原因放在 value 里（后端 `go2rtc.py` 已把地址打码成 [视频源]），
            // 直接透传给用户比笼统的“中转失败”更有用；超长截断，缺省才回落到通用文案。
            const relayMessage =
              typeof payload.value === 'string' && payload.value.trim()
                ? payload.value.trim().slice(0, RELAY_MESSAGE_MAX_LENGTH)
                : 'go2rtc 视频中转失败'
            fail(generation, `${relayMessage}（正在重连）`)
          }
          return
        }
        const mediaChunk = messageEvent.data as ArrayBuffer
        pendingBytes += mediaChunk.byteLength
        if (pendingBytes > MEDIA_QUEUE_MAX_BYTES) throw new Error('media queue overflow')
        pendingChunks.push(mediaChunk)
        flushStreamQueue()
      } catch {
        fail(generation, '摄像头视频缓冲失败，正在重连')
      }
    }
    socket.onclose = (closeEvent: CloseEvent) => {
      if (!isCurrent()) return
      const closeCode = Number(closeEvent?.code || 0)
      if (TERMINAL_CLOSE_CODES.has(closeCode)) {
        fail(generation, AUTH_CLOSE_CODES.has(closeCode) ? GO2RTC_AUTH_HINT : 'go2rtc 视频中转失败', {
          retry: false,
        })
        return
      }
      fail(generation, '摄像头连接中断，正在重连')
    }

    // ManagedMediaSource 支持 srcObject 直连，普通 MediaSource 只能走 blob URL。
    if (isManaged) {
      ;(
        videoElement as HTMLVideoElement & { disableRemotePlayback: boolean }
      ).disableRemotePlayback = true
      videoElement.srcObject = mediaSource
    } else {
      objectUrl = URL.createObjectURL(mediaSource)
      videoElement.src = objectUrl
    }
    videoElement.play().catch(() => {})

    // 只等“协商 + 首帧”：超时就当作断线重连（不降级到 MJPEG，MSE 才是 go2rtc 的正路）。
    connectTimerId = window.setTimeout(() => {
      fail(generation, '摄像头连接超时，正在重连')
    }, CONNECT_TIMEOUT_MS)
    armStallWatch(generation)
  }

  const connect = () => {
    if (isDisposed) return
    resetStreamQueue()
    transportGeneration += 1
    const generation = transportGeneration
    // 每次重连都要重新等首帧：断线重连后的 `ready` 得再报一次，调用方才能把占位收起来。
    isReady = false
    releaseActiveStream()
    clearConnectTimers()
    onStateChange('connecting', '摄像头正在连接')
    startPlayback(generation)
  }

  const handleVideoPlaying = () => {
    if (isDisposed || isReady) return
    if (videoElement.readyState < 2) return
    isReady = true
    clearConnectTimers()
    onStateChange('ready')
    onReady()
  }
  videoElement.addEventListener('loadeddata', handleVideoPlaying)
  videoElement.addEventListener('playing', handleVideoPlaying)

  connect()

  return {
    dispose: () => {
      videoElement.removeEventListener('loadeddata', handleVideoPlaying)
      videoElement.removeEventListener('playing', handleVideoPlaying)
      dispose()
    },
    isActive: () => !isDisposed,
  }
}

interface UseGo2RtcMseTransportOptions {
  /** 非空即启用 MSE 通路；变化会重连。 */
  url: Ref<string | undefined> | (() => string | undefined)
  projectId?: Ref<string | undefined> | (() => string | undefined)
  componentId?: Ref<string | undefined> | (() => string | undefined)
  cameraId?: Ref<string | undefined> | (() => string | undefined)
  video: Ref<HTMLVideoElement | null>
  enabled?: Ref<boolean> | (() => boolean)
  onStateChange?: (state: CameraVisualState, message?: string) => void
  onReady?: () => void
  onUnavailable?: (message: string) => void
}

function readOptionValue<T>(source: Ref<T> | (() => T) | undefined): T | undefined {
  if (typeof source === 'function') return (source as () => T)()
  return source?.value
}

/**
 * Vue 侧薄封装：把视频元素与地址 ref 交给共用的 MSE 传输，并随依赖变化重建。
 *
 * 复用 `shared/camera/composables` 惯例（`HaCameraStream.vue` 消费），
 * Studio 侧直接用下面的 `createGo2RtcMseTransport` + `normalizeGo2rtcTarget`。
 */
export function useGo2RtcMseTransport(options: UseGo2RtcMseTransportOptions) {
  const activeTransport = ref<Go2RtcMseTransportHandle | null>(null)

  const stop = () => {
    activeTransport.value?.dispose()
    activeTransport.value = null
  }

  const start = () => {
    stop()
    const enabled = readOptionValue(options.enabled) ?? true
    const url = String(readOptionValue(options.url) || '').trim()
    const videoElement = readOptionValue(options.video)
    if (!enabled || !url || !videoElement) return
    try {
      activeTransport.value = createGo2RtcMseTransport({
        video: videoElement,
        url,
        projectId: readOptionValue(options.projectId),
        componentId: readOptionValue(options.componentId),
        cameraId: readOptionValue(options.cameraId),
        onStateChange: options.onStateChange,
        onReady: options.onReady,
        onUnavailable: options.onUnavailable,
      })
    } catch (error) {
      logger.warn('[go2rtc-mse] 传输启动失败', error)
      options.onUnavailable?.(error instanceof Error ? error.message : 'go2rtc 地址无效')
    }
  }

  watch(
    () => [
      readOptionValue(options.enabled) ?? true,
      String(readOptionValue(options.url) || '').trim(),
      readOptionValue(options.video),
    ],
    () => start(),
    { immediate: true, flush: 'post' },
  )

  onUnmounted(stop)

  return { stop, isActive: () => !!activeTransport.value?.isActive() }
}
