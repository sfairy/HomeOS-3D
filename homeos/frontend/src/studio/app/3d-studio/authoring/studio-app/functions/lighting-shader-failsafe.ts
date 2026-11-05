/**
 * 灯光注入版 shader 的编译兜底。
 *
 * 分层灯光把全部灯具搬进 `UserFloorLights` UBO，同时把这些灯的 `layers.mask` 清零
 * （不让 three 的原生逐灯路径再算一遍）。这套注入的 GLSL 一旦在某个 GPU/驱动的编译器上
 * 过不去，灯就既不进原生路径、也不进分层循环 —— 画面只剩环境光，而且 three 只会在控制台
 * 打一行，不会自己恢复，用户看到的就是「灯不亮」。
 *
 * 这里把这种失败变成「退原生逐灯」：
 * - `setEnabled(false)`：停掉分层与图集，`layers.mask` 还原、已编材质改 defines 重编；
 * - `setupSceneShadows`：按原生逐灯重新分配阴影；
 * - 结论写进 dataset 与日志，现场可以一眼看出走了哪条路。
 *
 * `checkShaderErrors` 只在首帧附近需要（程序首次使用时会同步读一次 program log），
 * 舞台原本为了省这点开销关掉了它，所以这里临时打开，等分层路径就绪或看门狗超时后还原。
 *
 * 拆成独立模块是为了不让 `createStudioRenderer` 再涨：那里要管渲染器降级、帧循环、
 * 上下文丢失，本来就已经在复杂度与文件规模的边上。
 */

/** 只声明本模块真正用到的 GL 查询接口。 */
type GlLike = {
  getShaderSource?: (shader: unknown) => string | null
  getProgramInfoLog?: (program: unknown) => string | null
  getShaderInfoLog?: (shader: unknown) => string | null
}

/**
 * 从 shader 诊断里抠出出错行号。
 *
 * `program log` 只有一句 "Fragment shader is not compiled."，真正有用的行号在
 * `getShaderInfoLog` 里（形如 `ERROR: 0:123: 'xxx' : syntax error`）。现场只看到
 * program log 时根本定位不到是哪一句注入的 GLSL 编不过，只能整条管线回退。
 */
function shaderErrorLines(shaderInfoLog: string) {
  const errorLines = new Set<number>()
  for (const logMatch of shaderInfoLog.matchAll(/ERROR:\s*\d+:(\d+)/g)) errorLines.add(Number(logMatch[1]))
  return [...errorLines].sort((leftLine, rightLine) => leftLine - rightLine)
}

/** 按出错行号截取源码上下文（最多 3 处、每处 ±3 行），避免把整份 shader 打进日志。 */
function excerptShaderAroundErrors(shaderSource: string, shaderInfoLog: string) {
  const errorLines = shaderErrorLines(shaderInfoLog)
  if (!shaderSource || !errorLines.length) return ''
  const shaderSourceLines = shaderSource.split('\n'),
    excerptLines: string[] = []
  for (const errorLine of errorLines.slice(0, 3)) {
    const excerptStart = Math.max(0, errorLine - 4),
      excerptEnd = Math.min(shaderSourceLines.length, errorLine + 3)
    excerptLines.push(`--- 第 ${errorLine} 行 ---`)
    for (let sourceLineIndex = excerptStart; sourceLineIndex < excerptEnd; sourceLineIndex += 1)
      excerptLines.push(`${sourceLineIndex + 1}: ${shaderSourceLines[sourceLineIndex]}`)
  }
  return excerptLines.join('\n')
}

/** 组装「哪一支 shader、哪一行、那一行长什么样」，同时写进 dataset 供现场核对。 */
function describeShaderFailure(gl: GlLike, vertexShader: unknown, fragmentShader: unknown) {
  const vertexInfoLog = gl?.getShaderInfoLog?.(vertexShader) || '',
    fragmentInfoLog = gl?.getShaderInfoLog?.(fragmentShader) || '',
    failedStage = fragmentInfoLog.trim() ? 'fragment' : vertexInfoLog.trim() ? 'vertex' : 'unknown',
    failedSource = gl?.getShaderSource?.(failedStage === 'vertex' ? vertexShader : fragmentShader) || '',
    failedInfoLog = failedStage === 'vertex' ? vertexInfoLog : fragmentInfoLog,
    excerpt = excerptShaderAroundErrors(failedSource, failedInfoLog)
  return {
    failedStage,
    detail: [failedInfoLog.trim(), excerpt].filter(Boolean).join('\n').slice(0, 4000),
  }
}

type ShaderErrorReporter = (gl: GlLike, program: unknown, vertexShader: unknown, fragmentShader: unknown) => void

type ShaderDebugLike = {
  checkShaderErrors: boolean
  onShaderError: ShaderErrorReporter | null
}

/** 兜底逻辑需要的运行期上下文（只取用得到的字段）。 */
type FailsafeAppCtx = {
  threeRenderer?: {
    debug?: ShaderDebugLike
    domElement: { dataset: Record<string, string | undefined> }
  }
  sceneRootNode?: unknown
  lightPrecompileController?: {
    setEnabled: (enabled: boolean) => void
    prepareRoot: (root: unknown) => void
    isPending: () => boolean
    isBuilding: () => boolean
    activeCount: () => number
  }
}

/** 只出现在我们注入的 chunk 里；命中说明失败的确实是补丁过的材质。 */
const LIGHTING_PATCH_MARKERS = [
  'HB_FLOOR_LIGHTS',
  'UserFloorLights',
  'USE_USER_SPOT_SHADOW_ATLAS',
  'getUserSpotAtlasShadow',
  'userFloorDirectionalShadow',
]

export interface LightingShaderFailsafe {
  /** 卸载：撤销 handler、还原 `checkShaderErrors`。 */
  dispose: () => void
  /** 首轮编译结束后调用，把 `checkShaderErrors` 还原成各模式原本的取值。 */
  restoreChecks: () => void
}

export function installLightingShaderFailsafe({
  appCtx,
  setupSceneShadows,
  scheduleStudioRender,
}: {
  appCtx: FailsafeAppCtx
  setupSceneShadows: (root: unknown, options?: { rebuildAtlas?: boolean }) => number
  scheduleStudioRender: () => void
}): LightingShaderFailsafe {
  const shaderRenderer = appCtx.threeRenderer
  if (!shaderRenderer?.debug) return { dispose: () => {}, restoreChecks: () => {} }
  // 闭包里用独立常量，避免可选链收窄在嵌套函数中失效。
  const shaderDebug: ShaderDebugLike = shaderRenderer.debug
  const previousCheckShaderErrors = shaderDebug.checkShaderErrors,
    previousOnShaderError = shaderDebug.onShaderError
  shaderDebug.checkShaderErrors = true
  let hasFallenBack = false,
    isShaderFailsafeActive = true
  const shaderFailsafeWatchdog = window.setTimeout(restoreShaderChecks, 10000)

  function restoreShaderChecks() {
    if (!isShaderFailsafeActive) return
    ;(isShaderFailsafeActive = false),
      window.clearTimeout(shaderFailsafeWatchdog),
      (shaderDebug.checkShaderErrors = previousCheckShaderErrors)
  }

  shaderDebug.onShaderError = (gl: GlLike, program: unknown, vertexShader: unknown, fragmentShader: unknown) => {
    let shaderSource = ''
    try {
      shaderSource = `${gl?.getShaderSource?.(vertexShader) || ''}\n${gl?.getShaderSource?.(fragmentShader) || ''}`
    } catch {
      /* 上下文丢失时 getShaderSource 会抛：当作「不是我们的补丁」，原始诊断照常输出 */
    }
    if (!LIGHTING_PATCH_MARKERS.some((marker) => shaderSource.includes(marker))) {
      // 与灯光无关的编译失败：保持 three 的诊断信息，不能被兜底逻辑静默掉。
      reportUnrelatedShaderError(previousOnShaderError, gl, program, vertexShader, fragmentShader)
      return
    }
    // 同一批材质会连着失败多次（每套 program 一次），只处理第一次。
    if (hasFallenBack) return
    hasFallenBack = true
    restoreShaderChecks()
    fallBackToNativeLights(appCtx, setupSceneShadows, scheduleStudioRender, shaderRenderer)
    const programLog = gl?.getProgramInfoLog?.(program) || '',
      shaderFailure = describeShaderFailure(gl, vertexShader, fragmentShader),
      failureMessage = `分层灯光着色器编译失败，已退回原生逐灯：${programLog.trim().slice(0, 200)}${
        shaderFailure.detail ? `\n[${shaderFailure.failedStage}]\n${shaderFailure.detail}` : ''
      }`
    // 现场核对入口：整段失败原因（含出错行源码）留在 dataset 上，控制台被刷掉也能查。
    document.documentElement.dataset.lightingShaderError = failureMessage.slice(0, 8000)
    console.error(`[studio-lighting] ${failureMessage}`),
      window.HomeOSLog?.error?.(failureMessage, {
        phase: 'studio-lighting-shader',
        code: 'STUDIO_LIGHTING_SHADER_FAILED',
      })!
  }

  return {
    restoreChecks: restoreShaderChecks,
    dispose() {
      window.clearTimeout(shaderFailsafeWatchdog), restoreShaderChecks()
      // 只还原成「注册前的值」：three 默认是 null，置回 undefined 会让它走不到默认报错分支。
      shaderDebug.onShaderError = previousOnShaderError ?? null
    },
  }
}

function reportUnrelatedShaderError(
  previousOnShaderError: ShaderErrorReporter | null,
  gl: GlLike,
  program: unknown,
  vertexShader: unknown,
  fragmentShader: unknown,
) {
  if (typeof previousOnShaderError === 'function') {
    previousOnShaderError(gl, program, vertexShader, fragmentShader)
    return
  }
  console.error(
    `[studio-lighting] WebGL 程序链接失败：${gl?.getProgramInfoLog?.(program) || '(无 program log)'}`,
    gl?.getShaderInfoLog?.(vertexShader),
    gl?.getShaderInfoLog?.(fragmentShader),
  )
}

function fallBackToNativeLights(
  appCtx: FailsafeAppCtx,
  setupSceneShadows: (root: unknown, options?: { rebuildAtlas?: boolean }) => number,
  scheduleStudioRender: () => void,
  shaderRenderer: NonNullable<FailsafeAppCtx['threeRenderer']>,
) {
  const fallbackRoot = appCtx.sceneRootNode
  try {
    // 顺序要紧：先把分层关掉（还原 layers.mask + defines 重编），再交给原生阴影重排。
    appCtx.lightPrecompileController?.setEnabled(false),
      appCtx.lightPrecompileController?.prepareRoot(fallbackRoot),
      setupSceneShadows(fallbackRoot, {
        rebuildAtlas: false,
      }),
      (shaderRenderer.domElement.dataset.lightingFallback = 'shader-compile'),
      (document.documentElement.dataset.lightingFallback = 'shader-compile'),
      scheduleStudioRender()
  } catch (lightingFallbackError) {
    console.error(lightingFallbackError)
  }
}

/**
 * 分层灯光/图集已经建好（或已判定不可用）就说明补丁材质的首轮编译都跑完了，
 * 可以把为了兜底临时打开的 `checkShaderErrors` 还原。
 */
export function restoreLightingShaderChecksIfReady(appCtx: FailsafeAppCtx, failsafe: LightingShaderFailsafe | null) {
  const precompile = appCtx.lightPrecompileController
  if (!precompile || precompile.isPending() || precompile.isBuilding()) return
  if (precompile.activeCount() <= 0) return
  failsafe?.restoreChecks()
}
