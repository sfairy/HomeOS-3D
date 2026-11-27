/** 灯光预编译：把「切灯/切楼层」后要用的 shader program 提前编译，避免首次切灯抖一下。
 *
 * WaveUI-C Q01：可见优先编译 → 首帧 → idle 补全非可见 program；不改材质本身。
 *
 * 从 `../studio-app.ts` 的巨型闭包抽出（P4 拆单体）：入参全显式，只读时间预算常量。
 */

import * as threeModuleMin from '/static/vendor/three/0.187.0/three.module.min.js'

const lightPrecompileBudgetMs = 4500
/** 可见优先阶段更短：尽快让出首帧，剩余由 idle fill 补。 */
export const visiblePrecompileBudgetMs = 1800

type PrecompileCamera = {
  layers: { test: (other: unknown) => boolean }
}

type PrecompileMaterial = {
  transmission?: number
}

type PrecompileNode = {
  material?: PrecompileMaterial | PrecompileMaterial[]
  layers: { test: (other: unknown) => boolean }
}

type PrecompileScene = {
  traverseVisible: (visit: (node: PrecompileNode) => void) => void
  traverse?: (visit: (node: PrecompileNode) => void) => void
}

type PrecompileProgram = {
  program?: unknown
  isReady: () => boolean
  getUniforms: () => unknown
  getAttributes: () => unknown
}

type PrecompileRenderer = {
  getContext: () => WebGLRenderingContext
  extensions?: { has: (name: string) => boolean }
  compile: (root: unknown, camera: PrecompileCamera, scene?: PrecompileScene) => void
  info: { programs: PrecompileProgram[] }
  getRenderTarget: () => unknown
  getActiveCubeFace: () => number
  getActiveMipmapLevel: () => number
  setRenderTarget: (target: unknown, cubeFace?: number, mipmap?: number) => void
}

type PrecompileRoot = PrecompileScene & {
  traverse?: (visit: (node: PrecompileNode) => void) => void
}

export function precompileShaderPrograms(
  targetRenderer: PrecompileRenderer,
  targetScene: PrecompileScene,
  precompileShaderProgramsTargetCamera: PrecompileCamera,
  shouldContinueCompile: () => boolean,
  {
    visibleOnly: shouldCompileVisibleOnly = false,
    pollInterval: pollIntervalMs = 32,
    budgetMs: compileBudgetMs = lightPrecompileBudgetMs,
  }: {
    visibleOnly?: boolean
    pollInterval?: number
    budgetMs?: number
  } = {},
) {
  const webglApi = targetRenderer.getContext()
  if (
    !shouldContinueCompile() ||
    webglApi.isContextLost() ||
    targetRenderer.extensions?.has('KHR_parallel_shader_compile') === false
  )
    return Promise.resolve(false)
  const precompileRoot: PrecompileRoot = shouldCompileVisibleOnly
    ? (new threeModuleMin.Group() as unknown as PrecompileRoot)
    : targetScene
  shouldCompileVisibleOnly &&
    (precompileRoot.traverse = (visitNode) =>
      targetScene.traverseVisible((visibleNode) => {
        visibleNode.layers.test(precompileShaderProgramsTargetCamera.layers) && visitNode(visibleNode)
      }))
  const compileScene = () =>
    shouldCompileVisibleOnly
      ? targetRenderer.compile(precompileRoot, precompileShaderProgramsTargetCamera, targetScene)
      : targetRenderer.compile(targetScene, precompileShaderProgramsTargetCamera)
  compileScene()
  let hasTransmission = false
  if (
    (precompileRoot.traverse?.((compiledNode) => {
      ;(Array.isArray(compiledNode.material) ? compiledNode.material : [compiledNode.material]).some(
        (precompileShaderProgramsNodeMaterial) => Number(precompileShaderProgramsNodeMaterial?.transmission) > 0,
      ) && (hasTransmission = true)
    }),
    hasTransmission)
  ) {
    const renderTarget = targetRenderer.getRenderTarget(),
      activeCubeFace = targetRenderer.getActiveCubeFace(),
      activeMipmapLevel = targetRenderer.getActiveMipmapLevel(),
      transmissionTarget = new threeModuleMin.WebGLRenderTarget(1, 1)
    try {
      targetRenderer.setRenderTarget(transmissionTarget), compileScene()
    } finally {
      targetRenderer.setRenderTarget(renderTarget, activeCubeFace, activeMipmapLevel), transmissionTarget.dispose()
    }
  }
  const initialPrograms = [...targetRenderer.info.programs],
    compileDeadlineMs = performance.now() + compileBudgetMs
  return new Promise((resolveCompile, rejectCompile) => {
    const pollProgramStatus = () => {
      try {
        if (!shouldContinueCompile() || targetRenderer.getContext() !== webglApi || webglApi.isContextLost()) {
          resolveCompile(false)
          return
        }
        const liveProgramSet = new Set(targetRenderer.info.programs),
          isLiveProgram = (shaderProgram: PrecompileProgram) =>
            liveProgramSet.has(shaderProgram) &&
            shaderProgram.program &&
            webglApi.isProgram(shaderProgram.program as WebGLProgram)
        if (initialPrograms.some((pendingProgram) => !isLiveProgram(pendingProgram))) {
          resolveCompile(false)
          return
        }
        if (initialPrograms.every((readyCandidateProgram) => readyCandidateProgram.isReady())) {
          for (const trackedProgram of initialPrograms) {
            if (!isLiveProgram(trackedProgram)) {
              resolveCompile(false)
              return
            }
            if ((trackedProgram.getUniforms(), !isLiveProgram(trackedProgram))) {
              resolveCompile(false)
              return
            }
            trackedProgram.getAttributes()
          }
          resolveCompile(true)
        } else
          performance.now() >= compileDeadlineMs
            ? resolveCompile(false)
            : window.setTimeout(pollProgramStatus, pollIntervalMs)
      } catch (compileError: unknown) {
        rejectCompile(compileError)
      }
    }
    window.setTimeout(pollProgramStatus, 0)
  })
}

/**
 * 首帧之后在空闲时补全非可见 shader（不阻塞 iframeReady / 首绘）。
 * 失败静默：按需编译仍正确。
 */
export function scheduleIdleShaderPrecompileFill(
  targetRenderer: PrecompileRenderer,
  targetScene: PrecompileScene,
  targetCamera: PrecompileCamera,
  shouldContinueCompile: () => boolean,
) {
  if (typeof window === 'undefined' || !targetRenderer || !targetScene || !targetCamera) return
  const runFill = () => {
    if (!shouldContinueCompile()) return
    precompileShaderPrograms(targetRenderer, targetScene, targetCamera, shouldContinueCompile, {
      visibleOnly: false,
      pollInterval: 48,
      budgetMs: lightPrecompileBudgetMs,
    }).catch(() => {
      /* idle 补全失败不影响渲染正确性 */
    })
  }
  const idleWindow = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
  }
  if (typeof idleWindow.requestIdleCallback === 'function') {
    idleWindow.requestIdleCallback(runFill, { timeout: 2500 })
  } else {
    window.setTimeout(runFill, 120)
  }
}
