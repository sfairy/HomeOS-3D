import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { clamp as clamp2 } from '../../../plan/geometry'
import { syncControlValue as syncControlValue2 } from '../../ui/ui-controls'
import { finite as finite2 } from '../../../loaders/studio-normalization'

export function applyWallHeightInput(runtime: StudioAppRuntime, wallHeightValue: any) {
  runtime.appCtx.activePointerId &&
    runtime.appCtx.activePointerId !== wallHeightValue &&
    runtime.applyWallOpacityInput(),
    !runtime.appCtx.activePointerId &&
      (runtime.deselectAll(), (runtime.appCtx.activePointerId = wallHeightValue), runtime.resetPlanInteraction())
}

export function applyWallThicknessInput(runtime: StudioAppRuntime) {
  runtime.appCtx.pointerMoveCount ||
    (runtime.appCtx.pointerMoveCount = requestAnimationFrame(() => {
      ;(runtime.appCtx.pointerMoveCount = 0), runtime.refreshStudioView()
    }))
}

export function applyWallOpacityInput(runtime: StudioAppRuntime) {
  window.clearTimeout(runtime.appCtx.pointerReleaseTimeoutId),
    (runtime.appCtx.pointerReleaseTimeoutId = null),
    runtime.appCtx.activePointerId &&
      ((runtime.appCtx.activePointerId = null),
      syncControlValue2(runtime.globalWallHeightInput, runtime.appCtx.studioState.settings.wallHeight.toFixed(2)),
      syncControlValue2(runtime.globalWallThicknessInput, runtime.appCtx.studioState.settings.wallThickness.toFixed(2)),
      syncControlValue2(
        runtime.globalWallOpacityInput,
        Math.round(runtime.appCtx.studioState.settings.wallOpacity * 100),
      ),
      runtime.refreshStudioUi(),
      runtime.requestSceneRebuild({
        scope: 'all',
      }),
      runtime.endStudioGesture())
}

export function scheduleWallApply(runtime: StudioAppRuntime, wallApplyDelayMs = 80) {
  window.clearTimeout(runtime.appCtx.pointerReleaseTimeoutId),
    (runtime.appCtx.pointerReleaseTimeoutId = window.setTimeout(runtime.applyWallOpacityInput, wallApplyDelayMs))
}

export function commitWallHeight(runtime: StudioAppRuntime) {
  const committedWallHeight = clamp2(
    finite2(runtime.globalWallHeightInput.value, runtime.appCtx.studioState.settings.wallHeight),
    0.01,
    6,
  )
  if (
    !(
      Math.abs(committedWallHeight - runtime.appCtx.studioState.settings.wallHeight) < 1e-8 &&
      runtime.appCtx.studioState.walls.every(
        (checkedWallHeightTarget) => Math.abs(checkedWallHeightTarget.height - committedWallHeight) < 1e-8,
      )
    )
  ) {
    runtime.applyWallHeightInput(runtime.globalWallHeightInput),
      (runtime.appCtx.studioState.settings.wallHeight = committedWallHeight)
    for (const heightUpdateWall of runtime.appCtx.studioState.walls) heightUpdateWall.height = committedWallHeight
    runtime.markDocumentDirty()
  }
}

export function commitWallThickness(runtime: StudioAppRuntime) {
  const committedWallThickness = clamp2(
    finite2(runtime.globalWallThicknessInput.value, runtime.appCtx.studioState.settings.wallThickness),
    0.01,
    3,
  )
  if (
    !(
      Math.abs(committedWallThickness - runtime.appCtx.studioState.settings.wallThickness) < 1e-8 &&
      runtime.appCtx.studioState.walls.every(
        (checkedWallThicknessTarget) => Math.abs(checkedWallThicknessTarget.thickness - committedWallThickness) < 1e-8,
      )
    )
  ) {
    runtime.applyWallHeightInput(runtime.globalWallThicknessInput),
      (runtime.appCtx.studioState.settings.wallThickness = committedWallThickness)
    for (const thicknessUpdateWall of runtime.appCtx.studioState.walls)
      thicknessUpdateWall.thickness = committedWallThickness
    runtime.applyWallThicknessInput(), runtime.markDocumentDirty()
  }
}

export function commitWallOpacity(runtime: StudioAppRuntime) {
  const committedWallOpacity =
    clamp2(
      finite2(runtime.globalWallOpacityInput.value, runtime.appCtx.studioState.settings.wallOpacity * 100),
      0,
      100,
    ) / 100
  Math.abs(committedWallOpacity - runtime.appCtx.studioState.settings.wallOpacity) < 1e-8 ||
    (runtime.applyWallHeightInput(runtime.globalWallOpacityInput),
    (runtime.appCtx.studioState.settings.wallOpacity = committedWallOpacity),
    /**
     * 全局值必须**写穿**到每面墙。
     *
     * 场景解算时 `wall.opacity ?? settings.wallOpacity` —— 单面墙一旦存过自定义值（`DIY`
     * 沿用户型、或者早先拖过单墙滑条），它就会永久盖住全局值：用户在「通用墙体透明度」
     * 拖到 100%，那几面墙仍然停在 0.25，看上去就是「调到 100% 也不显示墙体」。
     * 和 `commitWallThickness` 一样按「全局字段 = 全屋统一」处理：改全局就把单墙的覆盖
     * 清掉，让它们回到跟随全局。要单独调某面墙，之后在墙面属性里再设即可。
     */
    runtime.appCtx.studioState.walls.forEach((opacityResetWall: { opacity?: number | null }) => {
      opacityResetWall.opacity === null || opacityResetWall.opacity === undefined || (opacityResetWall.opacity = null)
    }),
    runtime.markDocumentDirty(),
    // 滑条拖动时只有 `input` 事件，`change` 要等松手才来。这里按 80ms 合并一次重建，
    // 墙才会跟着手指变浓变淡；否则整段拖动期间场景一直是旧透明度，看着像「调了没反应」。
    runtime.scheduleWallApply(80))
}
