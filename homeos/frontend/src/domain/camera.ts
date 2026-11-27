import HlsJs from 'hls.js'
import { onUnmounted, ref, watch, type Ref } from 'vue'
import { logger } from '@/kernel/core/index'

/**
 * hls.js 经典脚本按需加载器。
 *
 * 背景：展示页/编辑器原先在引导阶段无条件 `await` 整份 hls.js 脚本，即使页面上没有任何
 * 摄像头组件也要下载、解析并执行。现在把「脚本就位」推迟到第一次真正需要 HLS 时
 * （`ensureHls`）；页面文档确实含 HLS 摄像头组件时，由 `prewarmCameraMedia` 触发空闲预取
 * （`prefetchHlsOnIdle`），因此无摄像头页面完全不请求该脚本，有摄像头的页面仍能在首帧前拿到播放器。
 *
 * 约定：
 * - 模块级单例 Promise：并发调用只注入一次 <script>，成功后直接返回 window.Hls。
 * - 失败不缓存（loadPromise 置空），网络恢复后下一次调用可重试。
 * - 已由历史路径注入过同版本脚本标签时复用该标签，不重复插入。
 * - 加载器只负责「脚本可用」；播放、降级、卸载由调用方（camera-media / useCameraMediaTransport）负责。
 */

export type HlsCtor = typeof HlsJs

/**
 * light 构建（约 390KB / 120KB gzip，full 为 620KB）：去掉字幕、备用音轨、EME(DRM)、CMCD，
 * 摄像头流只用 m3u8 + TS/fMP4，四者都没用到；接入带字幕的录像回放时须换回 hls.min.js。
 */
const HLS_SCRIPT_SRC = '/static/vendor/hls.js/1.7.4/hls.light.min.js'
/**
 * 0.8.4：Safari / iOS 原生就能播 m3u8。命中时**完全不要**下载 hls.js ——
 * 上游是 `window.Hls || video.canPlayType(mime)` 先行短路，这里把这一步单独导出，
 * 让 `camera-media` 直接把流地址交给 `<video src>`，失败文案才统一成播放器加载失败。
 */
const HLS_NATIVE_MIME = 'application/vnd.apple.mpegurl'

/** 当前浏览器是否原生支持 HLS（`''` / `'maybe'` / `'probably'`，空串表示不支持）。 */
export function canPlayNativeHls(videoElement?: HTMLVideoElement | null): boolean {
  const probeElement = videoElement ?? document.createElement('video')
  try {
    return !!probeElement.canPlayType?.(HLS_NATIVE_MIME)
  } catch {
    return false
  }
}
/** 与 public/static/vendor/hls.js/<version> 目录同步；升级时同时改版本号与脚本 URL。 */
const HLS_SCRIPT_VERSION = '1.7.4'
const HLS_SCRIPT_SELECTOR = `script[data-homeos-hls="${HLS_SCRIPT_VERSION}"]`
/** requestIdleCallback 的兜底超时：空闲回调迟迟不来时也要发起预取。 */
const HLS_PREFETCH_IDLE_TIMEOUT_MS = 3000
/** 无 requestIdleCallback（旧 WebView）时的预取延迟。 */
const HLS_PREFETCH_FALLBACK_DELAY_MS = 1500
/** 复用已存在脚本标签时的探活超时：标签可能早已加载失败，不能无限等待 load 事件。 */
const HLS_EXISTING_SCRIPT_TIMEOUT_MS = 8000

let loadPromise: Promise<HlsCtor | null> | null = null
let prefetchScheduled = false

function readGlobalHls(): HlsCtor | null {
  const runtimeWindow = window as Window & { Hls?: HlsCtor }
  try {
    return runtimeWindow.Hls?.isSupported?.() ? runtimeWindow.Hls : null
  } catch {
    /* 第三方脚本内部异常按「未就绪」处理，由调用方走快照/MJPEG 降级 */
    return null
  }
}

/** 复用失效标签会让后续 ensureHls 永远等不到 load 事件，必须移除后才能重新注入。 */
function dropReusableScript(script: HTMLScriptElement) {
  script.parentNode?.removeChild(script)
}

/** 复用一个已存在的脚本标签：load/error 其一即返回，超时按当前全局状态兜底并清掉失效标签。 */
function waitForExistingScript(script: HTMLScriptElement): Promise<HlsCtor | null> {
  return new Promise((resolve) => {
    let settled = false
    const settle = (runtime: HlsCtor | null) => {
      if (settled) return
      settled = true
      resolve(runtime)
    }
    script.addEventListener('load', () => settle(readGlobalHls()), { once: true })
    script.addEventListener(
      'error',
      () => {
        dropReusableScript(script)
        settle(null)
      },
      { once: true },
    )
    window.setTimeout(() => {
      const runtime = readGlobalHls()
      runtime || dropReusableScript(script)
      settle(runtime)
    }, HLS_EXISTING_SCRIPT_TIMEOUT_MS)
  })
}

function injectHlsScript(): Promise<HlsCtor | null> {
  return new Promise((resolve) => {
    const hlsScript = document.createElement('script')
    hlsScript.src = HLS_SCRIPT_SRC
    hlsScript.async = true
    hlsScript.dataset.homeosHls = HLS_SCRIPT_VERSION
    hlsScript.addEventListener('load', () => resolve(readGlobalHls()), { once: true })
    hlsScript.addEventListener(
      'error',
      () => {
        // 失败的标签必须移除：否则下一次 ensureHls 会复用它并空等探活超时，网络恢复后也无法立刻重试。
        dropReusableScript(hlsScript)
        resolve(null)
      },
      { once: true },
    )
    document.head.appendChild(hlsScript)
  })
}

/** 确保 hls.js 可用；永不 reject（失败解析为 null，调用方自行降级）。 */
export function ensureHls(): Promise<HlsCtor | null> {
  const runtime = readGlobalHls()
  if (runtime) return Promise.resolve(runtime)
  if (loadPromise) return loadPromise
  const existingScript = document.querySelector<HTMLScriptElement>(HLS_SCRIPT_SELECTOR)
  const scriptPromise = existingScript ? waitForExistingScript(existingScript) : injectHlsScript()
  loadPromise = scriptPromise.then((hlsRuntime) => {
    if (!hlsRuntime) loadPromise = null
    return hlsRuntime
  })
  return loadPromise
}

/** hls.js 致命错误负载里判定「地址是否失效」需要的那几个字段（外部脚本给的是 any）。 */
type HlsErrorPayload = {
  type?: string
  details?: string
  response?: { code?: number }
}

/** 这些 details 说明请求打在「某个 HLS 地址」上，而不是解码 / 媒体管线。 */
const STREAM_ADDRESS_DETAILS = ['manifestLoad', 'manifestParsing', 'levelLoad', 'levelParsing']

/**
 * 致命错误是否属于「播放地址已失效」——调用方据此重新换票再试，而不是直接降级。
 *
 * HA 的一路摄像流只对应一个 hls token：流 worker 重建（时间戳不连续、空闲回收）后旧 token
 * 立刻 404，而重新 `camera/stream` 换票通常就能拿到新 token。这里的 `status === 0` 覆盖
 * 「请求没拿到响应」（后端 / 反代抖动），同样值得换一次票再试。
 */
export function isExpiredStreamAddressError(payload: HlsErrorPayload | null | undefined): boolean {
  if (!payload || payload.type !== 'networkError') return false
  const details = String(payload.details || '')
  if (!STREAM_ADDRESS_DETAILS.some((prefix) => details.startsWith(prefix))) return false
  const status = Number(payload.response?.code || 0)
  return status === 0 || status === 404 || status === 410
}

/**
 * 空闲预取 hls.js：仅在页面确实含 HLS 摄像头组件时调用（见 camera-media 的 prewarm 路径）。
 *
 * 只调度一次；预取失败不会影响后续按需加载（ensureHls 仍可重试）。
 */
export function prefetchHlsOnIdle(): void {
  if (prefetchScheduled) return
  // 原生支持 HLS 的浏览器永远用不到这份脚本，连预取都不该发。
  if (canPlayNativeHls()) return
  prefetchScheduled = true
  const runPrefetch = () => {
    void ensureHls()
  }
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(runPrefetch, { timeout: HLS_PREFETCH_IDLE_TIMEOUT_MS })
  } else {
    window.setTimeout(runPrefetch, HLS_PREFETCH_FALLBACK_DELAY_MS)
  }
}

/**
 * MSE（MediaSource）编解码串的兼容归一化（0.8.8 `renderer/registry.js` 的 `wt()`）。
 *
 * 背景：Safari 的 `isTypeSupported()` 只认 FLAC 的规范写法 `fLaC`，而 go2rtc / HLS 的
 * 清单里给的是小写 `flac`。直接用原串探测会被判成「不支持」，表现为**带 FLAC 音轨的
 * 摄像头在 Safari 上永远开不了声音**（视频本身照常，因为视频编解码串没问题）。
 *
 * 归一化只改 `codecs="…"` 列表里那个独立的 `flac` 记号（大小写不敏感），并且：
 * 1. 先试归一化后的串；
 * 2. 被拒再试原串（个别浏览器/版本只认小写）；
 * 3. 都拒才返回空串，调用方据此判定「不支持」。
 *
 * 不改 `flac` 以外的任何编码名 —— `mp4a.40.2`、`opus` 等大小写敏感，不能顺手统一。
 */

/** 只把编解码列表里独立的 `flac` 记号换成规范写法 `fLaC`。 */
const FLAC_CODEC_TOKEN = /([=",]\s*)flac(?=\s*(?:[,"]|$))/gi

export function normalizeMseCodecType(mediaType: string): string {
  return mediaType.replace(FLAC_CODEC_TOKEN, '$1fLaC')
}

/**
 * 返回**浏览器真正接受**的那个编解码串（可能是归一化后的，也可能是原串）。
 *
 * @param isTypeSupported 通常是 `MediaSource.isTypeSupported` 或 `ManagedMediaSource.isTypeSupported`
 *   （直接传方法引用会在部分实现里丢 `this`，调用方应包一层箭头函数）。
 * @param mediaType 完整 MIME，例如 `video/mp4; codecs="avc1.640029,flac"`。
 * @returns 可用的 MIME 串；不支持时返回空串（与上游一致，便于直接当布尔用）。
 */
export function supportedMseCodecType(isTypeSupported: (mediaType: string) => boolean, mediaType: string): string {
  if (typeof mediaType !== 'string') return ''
  const normalizedType = normalizeMseCodecType(mediaType)
  if (isTypeSupported(normalizedType)) return normalizedType
  // 归一化没改过串时不必重复探测。
  if (normalizedType !== mediaType && isTypeSupported(mediaType)) return mediaType
  return ''
}

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
type CameraVisualState = 'idle' | 'connecting' | 'reconnecting' | 'ready' | 'unavailable' | 'suspended'

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
  if (!['http:', 'https:'].includes(parsedTarget.protocol)) throw new Error('go2rtc 地址必须使用 http:// 或 https://')
  if (parsedTarget.pathname.replace(/\/$/, '') !== '/stream.html') throw new Error('go2rtc 地址必须指向 /stream.html')
  if (!parsedTarget.searchParams.get('src')?.trim()) throw new Error('go2rtc 地址必须包含有效的 src')
  if (parsedTarget.username || parsedTarget.password) throw new Error('go2rtc 地址不能包含账号或密码')
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
export function createGo2RtcMseTransport(options: Go2RtcMseTransportOptions): Go2RtcMseTransportHandle {
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
      stalledTicks = Number.isFinite(currentTime) && currentTime > lastCurrentTime ? 0 : stalledTicks + 1
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

    const isCurrent = () => !isDisposed && generation === transportGeneration && activeSocket === socket

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
        // 逐个候选走「fLaC 归一化优先、原串回落」：Safari 只认规范写法，直接用小写
        // `flac` 探测会把整条流判成不支持（等于永远没有声音）。
        supportedMseCodecType(
          (mediaType) => mediaSourceCtor.isTypeSupported(mediaType),
          `video/mp4; codecs="${codec}"`,
        ),
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
            // 中继回的串可能带小写 `flac`：先归一化再探测，并按**被接受的那个串**
            // 添加 SourceBuffer（否则 Safari 上 addSourceBuffer 仍会抛 unsupported codec）。
            const acceptedCodecType = sourceBuffer
              ? ''
              : supportedMseCodecType((mediaType) => mediaSourceCtor.isTypeSupported(mediaType), String(payload.value))
            if (!acceptedCodecType) throw new Error('unsupported codec')
            sourceBuffer = mediaSource.addSourceBuffer(acceptedCodecType)
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
      ;(videoElement as HTMLVideoElement & { disableRemotePlayback: boolean }).disableRemotePlayback = true
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
