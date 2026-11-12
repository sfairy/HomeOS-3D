import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { syncHtmlRangeProgress as syncHtmlRangeProgress2 } from '../../../../shared/util/range-progress'
import { clamp as clamp2 } from '../../../plan/geometry'
import { syncControlValue as syncControlValue2 } from '../../ui/ui-controls'
import { finite as finite2 } from '../../../loaders/studio-normalization'

export function isSnapEnabled(runtime: StudioAppRuntime) {
  return runtime.appCtx.studioState.settings.snapEnabled !== false && !runtime.appCtx.isSnapTemporarilyOff
}

export function setSnapSettingsOpen(runtime: StudioAppRuntime, settingsOpen: any) {
  ;(runtime.snapSettingsPanel.hidden = !settingsOpen),
    runtime.snapSettingsToggleButton.setAttribute('aria-expanded', String(settingsOpen))
}

export function syncSnapControls(runtime: StudioAppRuntime) {
  const isSnapOn = runtime.appCtx.studioState.settings.snapEnabled !== false
  runtime.snapToggleButton.classList.toggle('active', isSnapOn),
    runtime.snapToggleButton.setAttribute('aria-pressed', String(isSnapOn)),
    (runtime.snapToggleStateElement.textContent = isSnapOn ? '开' : '关')
  for (const snapSettingInput of runtime.snapSettingControls)
    snapSettingInput.checked =
      (runtime.appCtx.studioState.settings as any)[snapSettingInput.dataset.snapSetting!] !== false
  syncControlValue2(
    runtime.snapToleranceInput,
    clamp2(Math.round(finite2(runtime.appCtx.studioState.settings.snapTolerance, 13)), 6, 24),
  ),
    /* `hos-range-ui` 的左侧金色段靠 `--progress-pct` 裁切：每次回填数值都要同步一次，
       否则改档位后条子还停在旧进度。 */
    syncHtmlRangeProgress2(runtime.snapToleranceInput),
    (runtime.snapToleranceValueElement.textContent = runtime.snapToleranceInput.value + ' px'),
    runtime.appCtx.activeSnapTarget ||
      (runtime.snapIndicatorElement.textContent = isSnapOn ? '吸附：开启' : '吸附：关闭')
}

export function applySnapTolerance(runtime: StudioAppRuntime, resizeMoveEvent: any) {
  if (!runtime.appCtx.dragStart) return
  const draggedDetailsPanelRect = runtime.detailsPanelElement.getBoundingClientRect(),
    draggedStudioShellRect = runtime.studioShellElement.getBoundingClientRect()
  if (draggedDetailsPanelRect.height <= 0 || draggedStudioShellRect.width <= 0) return
  const yl4 = runtime.getPanelRatioLimits(),
    dragDeltaX = resizeMoveEvent.clientX - runtime.appCtx.dragStart.startX,
    dragDeltaY = resizeMoveEvent.clientY - runtime.appCtx.dragStart.startY
  if (Math.hypot(dragDeltaX, dragDeltaY) < 2) return
  runtime.detailsResizerElement.dataset.resizeAxis = 'both'
  const heightRatioDelta = dragDeltaY / draggedDetailsPanelRect.height,
    widthRatioDelta = dragDeltaX / draggedStudioShellRect.width
  ;(runtime.appCtx.studioState.settings.previewPanelRatio = clamp2(
    runtime.appCtx.dragStart.startPreviewRatio + heightRatioDelta,
    yl4.minimumHeightRatio,
    yl4.maximumHeightRatio,
  )),
    (runtime.appCtx.studioState.settings.detailsPanelWidthRatio = clamp2(
      runtime.appCtx.dragStart.startWidthRatio - widthRatioDelta,
      yl4.minimumWidthRatio,
      yl4.maximumWidthRatio,
    )),
    runtime.applyPanelRatios(),
    runtime.applyDetailsRatio()
}
