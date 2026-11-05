/**
 * presented 前的 shader 预热（B12）。
 *
 * three 0.187 的 `WebGLRenderer.compileAsync` 走 KHR_parallel_shader_compile：
 * 在真正呈现第一帧前并行编译静态场景的 program，摊平首帧 near-presented 的编译停顿。
 * 纯优化：不支持 compileAsync 的渲染器/浏览器静默跳过；`?shader-warmup=0` 可回退。
 */

/** 只依赖 compileAsync 的最小渲染器契约，避免把 three 类型拖进宿主侧构建。 */
type CompilableRenderer = {
  compileAsync?: (scene: unknown, camera: unknown) => Promise<unknown> | undefined
}

type ShaderWarmupOptions = {
  renderer: CompilableRenderer
  scene: unknown
  camera: unknown
  idleTimeoutMs?: number
}

/** requestIdleCallback 在部分宿主（Safari 旧版 / 测试环境）不存在，按可选能力访问。 */
type IdleCapableGlobal = typeof globalThis & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number
  cancelIdleCallback?: (handle: number) => void
}

function idleCapableGlobal(): IdleCapableGlobal {
  return globalThis as IdleCapableGlobal
}

/** URL 开关：?shader-warmup=0 关闭（排查首帧亮度/耗时问题时回退用）。 */
export function isShaderWarmupEnabled(): boolean {
  try {
    const flag = String(new URLSearchParams(window.location.search).get('shader-warmup') || '').toLowerCase()
    return flag !== '0' && flag !== 'false' && flag !== 'off'
  } catch {
    return true
  }
}

/**
 * 在空闲时段预热 scene/camera 的 program；返回取消函数（渲染器销毁时调用）。
 * 失败静默：预热只影响流畅度，任何异常都不应打断渲染器初始化。
 */
export function scheduleShaderWarmup({
  renderer,
  scene,
  camera,
  idleTimeoutMs = 1200,
}: ShaderWarmupOptions): () => void {
  if (!isShaderWarmupEnabled() || typeof renderer?.compileAsync !== 'function') return () => {}
  const idleGlobal = idleCapableGlobal()
  let canceled = false
  let idleCallbackId: number | null = null
  const runWarmup = () => {
    idleCallbackId = null
    if (canceled) return
    try {
      const compilePromise = renderer.compileAsync?.(scene, camera)
      compilePromise?.catch?.(() => {})
    } catch {
      /* 预热失败静默降级 */
    }
  }
  if (typeof idleGlobal.requestIdleCallback !== 'function') runWarmup()
  else idleCallbackId = idleGlobal.requestIdleCallback(runWarmup, { timeout: idleTimeoutMs })
  return () => {
    canceled = true
    if (idleCallbackId !== null) {
      idleGlobal.cancelIdleCallback?.(idleCallbackId)
      idleCallbackId = null
    }
  }
}
