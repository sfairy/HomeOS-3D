import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { syncControlValue as syncControlValue2 } from '../../ui/ui-controls'
import { isCourtyardDrawing as isCourtyardDrawing2 } from '../../../loaders/studio-normalization'
import { refreshStepChecklist } from '../ui/step-checklist'

export function refreshBackground(runtime: StudioAppRuntime) {
  const planTitleText = runtime.appCtx.studioState.items.some(
    (drawingItem) => isCourtyardDrawing2(drawingItem) || drawingItem.type.startsWith('garden-'),
  )
    ? runtime.appCtx.studioState.walls.length
      ? '户型与庭院绘制'
      : '庭院绘制'
    : '户型图绘制'
  ;(runtime.projectNameElement.textContent = planTitleText),
    (document.title = planTitleText),
    runtime.syncSnapControls(),
    runtime.syncGlobalControls(),
    (runtime.toggleBackgroundButton.disabled = !runtime.appCtx.studioState.background),
    (runtime.toggleBackgroundButton.textContent = runtime.appCtx.studioState.settings.backgroundVisible
      ? '隐藏'
      : '显示'),
    (runtime.removePlanButton.disabled = !runtime.appCtx.studioState.background),
    syncControlValue2(runtime.globalWallHeightInput, runtime.appCtx.studioState.settings.wallHeight.toFixed(2)),
    syncControlValue2(runtime.globalWallThicknessInput, runtime.appCtx.studioState.settings.wallThickness.toFixed(2)),
    syncControlValue2(
      runtime.globalWallOpacityInput,
      Math.round(runtime.appCtx.studioState.settings.wallOpacity * 100),
    ),
    (runtime.toggleFloorEdgeButton.textContent =
      runtime.appCtx.studioState.settings.floorEdgeVisible === false ? '隐藏' : '显示'),
    runtime.toggleFloorEdgeButton.setAttribute(
      'aria-pressed',
      String(runtime.appCtx.studioState.settings.floorEdgeVisible !== false),
    ),
    (runtime.canvasEmptyElement.hidden = !!(
      runtime.appCtx.studioState.background ||
      runtime.appCtx.studioState.walls.length ||
      runtime.appCtx.studioState.items.length
    )),
    (runtime.sceneCountsElement.textContent =
      runtime.appCtx.studioState.walls.length +
      ' 墙 · ' +
      runtime.appCtx.studioState.windows.length +
      ' 窗 · ' +
      runtime.appCtx.studioState.doors.length +
      ' 门 · ' +
      runtime.appCtx.studioState.railings.length +
      ' 栏杆 · ' +
      runtime.appCtx.studioState.items.length +
      ' 物件'),
    runtime.syncLightGroupList(),
    runtime.applyPanelRatios(),
    runtime.applyDetailsRatio(),
    runtime.setCameraMode(runtime.getCameraMode()),
    runtime.setCameraView(runtime.getCameraView()),
    runtime.refreshPreviewSync(),
    runtime.refreshFloorControls(),
    runtime.refreshBaseLighting(),
    refreshStepChecklist(runtime.appCtx)
}

/** 刷新整个属性检查器：先跑「按选中类型逐个开关字段」的逻辑，再统一收敛一次分组。 */
export function refreshStudioUi(runtime: StudioAppRuntime, shouldClearActiveElement = false) {
  runtime.refreshStudioUiInner(shouldClearActiveElement)
  runtime.syncInspectorGroups()
  // 复制按钮跟随选择：属性和选择都在这里刷新，剪贴板可用性也搭同一趟车。
  runtime.syncStudioClipboardFacade()
}
