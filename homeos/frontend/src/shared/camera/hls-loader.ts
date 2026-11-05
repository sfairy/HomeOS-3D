/**
 * hls.js 经典脚本按需加载器。
 *
 * 背景：展示页/编辑器原先在引导阶段无条件 `await` 620KB 的 hls.min.js，即使页面上没有任何
 * 摄像头组件也要下载、解析并执行。现在把「脚本就位」推迟到第一次真正需要 HLS 时
 * （`ensureHls`）；页面文档确实含 HLS 摄像头组件时，由 `prewarmCameraMedia` 触发空闲预取
 * （`prefetchHlsOnIdle`），因此无摄像头页面完全不请求该脚本，有摄像头的页面仍能在首帧前拿到播放器。
 *
 * 用的是 **light 构建**（1.7.4，380KB → gzip 约 115KB；full 构建 609KB）：
 * light 去掉的是字幕 / 备用音轨 / EME(DRM) / CMCD —— 本项目的摄像头流只用最基本的
 * m3u8 + TS/fMP4 播放，四个特性一个都没用到。若将来要接带字幕的录像回放，
 * 必须换回 full 构建（见 `docs/perf` 的字节预算），否则 `Hls.subtitleTracks` 会不存在。
 *
 * 约定：
 * - 模块级单例 Promise：并发调用只注入一次 <script>，成功后直接返回 window.Hls。
 * - 失败不缓存（loadPromise 置空），网络恢复后下一次调用可重试。
 * - 已由历史路径注入过同版本脚本标签时复用该标签，不重复插入。
 * - 加载器只负责「脚本可用」；播放、降级、卸载由调用方（camera-media / useCameraMediaTransport）负责。
 */
import type HlsJs from 'hls.js'

export type HlsCtor = typeof HlsJs

/** 与 `package.json` 的 hls.js 版本、`public/static/vendor/hls.js/<version>/` 目录三者一致。 */
const HLS_SCRIPT_VERSION = '1.7.4'
const HLS_SCRIPT_SRC = `/static/vendor/hls.js/${HLS_SCRIPT_VERSION}/hls.light.min.js`
/**
 * 0.8.4：Safari / iOS 原生就能播 m3u8。命中时**完全不要**下载 380KB 的 hls.js ——
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
