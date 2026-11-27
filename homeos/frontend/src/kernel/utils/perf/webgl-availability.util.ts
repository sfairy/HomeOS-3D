/**
 * WebGL 可用性预检（0.8.6）。
 *
 * 为什么要在建渲染器之前先问一次：浏览器可能整体把 GL 关掉了。Edge 在 GPU 进程连续
 * 崩溃后会以 `--use-gl=disabled` 重启 GPU 进程（报错里能看到 `GL_VENDOR = Disabled`、
 * `BindToCurrentSequence failed`），这种状态下 `new WebGLRenderer()` 必然失败。three
 * 每次失败都会往控制台打两条同样的报文，而 `createStudioRenderer` 的三级降级会重试
 * 三次 —— 一次页面加载刷六条，还拿不到「是浏览器禁用 GL、还是只不支持 antialias」这个
 * 关键区分，排查时反而被噪音盖住。
 *
 * 这里用一张 1×1 的离屏 canvas 先问一次，问完立刻 `loseContext()` 归还，免得预检
 * 自己占住一个上下文名额。成功结果按页面缓存（同一页面内没必要反复问）；失败**不缓存**
 * —— GPU 进程崩溃后浏览器可能重启它，SPA 内重新进工作室时应该允许再试一次。
 *
 * `?webgl-probe=0` 可关闭预检，回到「先建渲染器、失败再降级」的旧行为。
 */

/** 失败时给用户看的话：只讲可执行的动作，不复述浏览器内部报错。 */
export const WEBGL_UNAVAILABLE_MESSAGE =
  '当前浏览器无法创建 3D 画面：WebGL 已被禁用（常见于浏览器关闭了「使用图形加速」，或 GPU 进程崩溃后被降级）。请开启浏览器图形加速并重启浏览器；仍不行请改用 Chrome / Safari。'

type WebglProbeApi = 'webgl2' | 'webgl'

export interface WebglAvailability {
  available: boolean
  /** 探测拿到的最高版本；不可用时为 null。 */
  api: WebglProbeApi | null
  renderer: string
  vendor: string
  /** SwiftShader / llvmpipe 之类的软件光栅化：能画但很慢，质量档应主动降级。 */
  isSoftware: boolean
}

type ProbeContext = WebGLRenderingContext | WebGL2RenderingContext

const SOFTWARE_RENDERER_PATTERN = /swiftshader|llvmpipe|softpipe|software|microsoft basic|angle \(google/i

const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: true,
  antialias: false,
  depth: true,
  failIfMajorPerformanceCaveat: false,
  powerPreference: 'default',
  preserveDrawingBuffer: false,
  stencil: false,
}

let cachedAvailability: WebglAvailability | null = null
let probeContextsInFlight = false

function isProbeDisabled(): boolean {
  try {
    const flag = String(new URLSearchParams(window.location.search).get('webgl-probe') || '').toLowerCase()
    return flag === '0' || flag === 'false' || flag === 'off'
  } catch {
    return false
  }
}

function readString(gl: ProbeContext, parameter: number): string {
  try {
    return String(gl.getParameter(parameter) ?? '')
  } catch {
    return ''
  }
}

function releaseProbeContext(gl: ProbeContext): void {
  try {
    const loseContextExtension = gl.getExtension('WEBGL_lose_context') as { loseContext?: () => void } | null
    loseContextExtension?.loseContext?.()
  } catch {
    /* 归还失败没有补救手段：预检上下文本身只有 1×1，等 GC 即可 */
  }
}

function createProbeCanvas(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    canvas.style.display = 'none'
    return canvas
  } catch {
    return null
  }
}

function tryContext(canvas: HTMLCanvasElement, api: WebglProbeApi): ProbeContext | null {
  try {
    return (canvas.getContext(api, CONTEXT_ATTRIBUTES) as ProbeContext | null) ?? null
  } catch {
    return null
  }
}

function unavailable(): WebglAvailability {
  return { available: false, api: null, renderer: '', vendor: '', isSoftware: false }
}

/**
 * 探测一次 WebGL。成功结果按页面缓存，失败不缓存（见文件头注释）。
 *
 * 本函数从不同时创建两个探针上下文（`probeContextsInFlight` 只防同一帧重入），
 * 也不参与渲染器创建 —— 它只是把「浏览器到底给不给 GL」这件事变成一个布尔值。
 */
export function probeWebglAvailability(): WebglAvailability {
  if (cachedAvailability) return cachedAvailability
  if (probeContextsInFlight) return unavailable()
  if (isProbeDisabled()) return { available: true, api: 'webgl2', renderer: '', vendor: '', isSoftware: false }

  probeContextsInFlight = true
  try {
    const canvas = createProbeCanvas()
    if (!canvas) return unavailable()
    let api: WebglProbeApi | null = null
    let gl = tryContext(canvas, 'webgl2')
    if (gl) api = 'webgl2'
    else {
      gl = tryContext(canvas, 'webgl')
      if (gl) api = 'webgl'
    }
    if (!gl || !api) return unavailable()
    const renderer = readString(gl, gl.RENDERER)
    const vendor = readString(gl, gl.VENDOR)
    const availability: WebglAvailability = {
      available: true,
      api,
      renderer,
      vendor,
      isSoftware: SOFTWARE_RENDERER_PATTERN.test(`${renderer} ${vendor}`),
    }
    // 只缓存成功：失败多半是临时的（GPU 进程重启后可能又好了），不该被一次探测钉死。
    cachedAvailability = availability
    releaseProbeContext(gl)
    return availability
  } finally {
    probeContextsInFlight = false
  }
}

/** 失败文案；预检没跑（`?webgl-probe=0`）时也能直接用。 */
export function webglUnavailableMessage(): string {
  return WEBGL_UNAVAILABLE_MESSAGE
}
