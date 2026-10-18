/**
 * hls.js 经典脚本按需加载器。
 *
 * 背景：展示页/编辑器原先在引导阶段无条件 `await` 620KB 的 hls.min.js，即使页面上没有任何
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
import type HlsJs from 'hls.js'

export type HlsCtor = typeof HlsJs

const HLS_SCRIPT_SRC = '/static/vendor/hls.js/1.7.3/hls.min.js'
/** 与 public/static/vendor/hls.js/<version> 目录同步；升级时同时改版本号与脚本 URL。 */
const HLS_SCRIPT_VERSION = '1.7.3'
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
  const scriptPromise = existingScript
    ? waitForExistingScript(existingScript)
    : injectHlsScript()
  loadPromise = scriptPromise.then((hlsRuntime) => {
    if (!hlsRuntime) loadPromise = null
    return hlsRuntime
  })
  return loadPromise
}

/**
 * 空闲预取 hls.js：仅在页面确实含 HLS 摄像头组件时调用（见 camera-media 的 prewarm 路径）。
 *
 * 只调度一次；预取失败不会影响后续按需加载（ensureHls 仍可重试）。
 */
export function prefetchHlsOnIdle(): void {
  if (prefetchScheduled) return
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
