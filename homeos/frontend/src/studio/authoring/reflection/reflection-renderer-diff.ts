/**
 * Q06：地面反射捕获路径的 renderer/scene 差分 save/restore。
 *
 * 只记录本轮实际改动的字段，避免每帧全量 save/restore viewport/scissor。
 */

export type ReflectionRendererDiff = {
  target: unknown
  cubeFace: number
  mipmap: number
  xr: boolean
  shadow: boolean
  alpha: number
  color: unknown
  background: unknown
  scissorTest: boolean
  autoClear: boolean
  matrixWorldAutoUpdate: boolean
  changedXr: boolean
  changedShadow: boolean
  changedClear: boolean
  changedBackground: boolean
  changedScissorTest: boolean
  changedAutoClear: boolean
  changedMatrixWorld: boolean
  changedTarget: boolean
}

type ReflectionRenderer = {
  getRenderTarget: () => unknown
  getActiveCubeFace: () => number
  getActiveMipmapLevel: () => number
  xr: { enabled: boolean }
  shadowMap: { autoUpdate: boolean }
  getClearAlpha: () => number
  getClearColor: (scratch: unknown) => unknown
  getScissorTest: () => boolean
  autoClear: boolean
  setClearColor: (color: unknown, alpha?: number) => void
  setScissorTest: (enabled: boolean) => void
  setRenderTarget: (target: unknown, cubeFace?: number, mipmap?: number) => void
}

type ReflectionScene = {
  background: unknown
  matrixWorldAutoUpdate: boolean
}

/** 捕获开始前快照当前 renderer/scene 相关字段。 */
export function captureReflectionRendererDiff(
  renderer: ReflectionRenderer,
  scene: ReflectionScene,
  clearColorScratch: unknown,
): ReflectionRendererDiff {
  return {
    target: renderer.getRenderTarget(),
    cubeFace: renderer.getActiveCubeFace(),
    mipmap: renderer.getActiveMipmapLevel(),
    xr: renderer.xr.enabled,
    shadow: renderer.shadowMap.autoUpdate,
    alpha: renderer.getClearAlpha(),
    color: renderer.getClearColor(clearColorScratch),
    background: scene.background,
    scissorTest: renderer.getScissorTest(),
    autoClear: renderer.autoClear,
    matrixWorldAutoUpdate: scene.matrixWorldAutoUpdate,
    changedXr: false,
    changedShadow: false,
    changedClear: false,
    changedBackground: false,
    changedScissorTest: false,
    changedAutoClear: false,
    changedMatrixWorld: false,
    changedTarget: false,
  }
}

/** 进入捕获态：关 XR/阴影/背景，开 autoClear，关 scissor。 */
export function beginReflectionCaptureState(
  renderer: ReflectionRenderer,
  scene: ReflectionScene,
  diff: ReflectionRendererDiff,
): void {
  scene.matrixWorldAutoUpdate = false
  diff.changedMatrixWorld = true
  renderer.xr.enabled = false
  diff.changedXr = true
  renderer.shadowMap.autoUpdate = false
  diff.changedShadow = true
  renderer.autoClear = true
  diff.changedAutoClear = true
  scene.background = null
  diff.changedBackground = true
  renderer.setClearColor(0, 0)
  diff.changedClear = true
  renderer.setScissorTest(false)
  diff.changedScissorTest = true
}

/** 按差分位恢复 renderer/scene（未改动的字段跳过）。 */
export function restoreReflectionRendererDiff(
  renderer: ReflectionRenderer,
  scene: ReflectionScene,
  diff: ReflectionRendererDiff,
): void {
  diff.changedMatrixWorld && (scene.matrixWorldAutoUpdate = diff.matrixWorldAutoUpdate)
  diff.changedBackground && (scene.background = diff.background)
  diff.changedClear && renderer.setClearColor(diff.color, diff.alpha)
  diff.changedScissorTest && renderer.setScissorTest(diff.scissorTest)
  diff.changedTarget && renderer.setRenderTarget(diff.target, diff.cubeFace, diff.mipmap)
  diff.changedXr && (renderer.xr.enabled = diff.xr)
  diff.changedShadow && (renderer.shadowMap.autoUpdate = diff.shadow)
  diff.changedAutoClear && (renderer.autoClear = diff.autoClear)
}
