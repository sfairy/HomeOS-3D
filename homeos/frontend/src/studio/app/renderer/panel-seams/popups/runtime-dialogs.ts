import {
  compactTargetOccupancy,
  defaultTargetOccupancy,
  runtimeDialogLayout,
  runtimeDialogViewport,
} from '../../renderer-helpers'
import {
  playStableRuntimeDialogEntrance as playStableRuntimeDialogEntrance2,
  runtimeDialogUsesStableMotion as runtimeDialogUsesStableMotion2,
} from '../../panel-dialog-motion'
import type { PanelRenderer } from '../../panel-renderer'

/** 运行时弹窗统一打开：焦点落在弹窗本身，首个按钮不会一打开就出现焦点框（0.8.6）。 */
export function showRuntimeDialog(dialog: HTMLDialogElement) {
  dialog.tabIndex = -1
  dialog.show()
  dialog.focus({ preventScroll: true })
}

export function registerRuntimeDialogScale(
  self: PanelRenderer,
  dialogLayerElement: any,
  dialogElement: any,
  dialogDesignWidth: any,
  dialogDesignHeight: any,
) {
  const hasStableMotion = runtimeDialogUsesStableMotion2()
  dialogLayerElement.classList.toggle('hb-runtime-stable-motion', hasStableMotion),
    dialogLayerElement.classList.toggle(
      'hb-runtime-simplified-motion',
      hasStableMotion && dialogElement.classList.contains('hb-custom-popup-dialog'),
    )
  const dialogScaleRecord = {
    dialogLayer: dialogLayerElement,
    dialog: dialogElement,
    designWidth: Math.max(1, Number(dialogDesignWidth) || 1),
    designHeight: Math.max(1, Number(dialogDesignHeight) || 1),
    fillAvailable:
      dialogElement.dataset.runtimeDialogLayout === 'fill' || dialogElement.classList.contains('media-player-details'),
    tightFill: dialogElement.classList.contains('media-player-details'),
    targetOccupancy:
      dialogElement.dataset.runtimeDialogLayout === 'compact' ? compactTargetOccupancy : defaultTargetOccupancy,
    measureFrame: 0,
    layoutObserver: null as any,
    entranceAnimations: [] as any[],
  }
  ;(self.runtimeDialogScaleContext = dialogScaleRecord),
    dialogElement.classList.add('hb-runtime-scaled-dialog'),
    (dialogElement.style.width = dialogScaleRecord.designWidth + 'px'),
    (dialogElement.style.minWidth = dialogScaleRecord.designWidth + 'px'),
    (dialogElement.style.maxWidth = 'none'),
    (dialogElement.style.height = 'auto'),
    (dialogElement.style.minHeight = '0'),
    (dialogElement.style.maxHeight = 'none'),
    (dialogElement.style.boxSizing = 'border-box'),
    dialogElement.style.setProperty('--hb-runtime-dialog-design-height', dialogScaleRecord.designHeight + 'px')
  const dialogCardElement = dialogElement.querySelector(':scope > .hb-custom-popup-card')
  dialogCardElement &&
    ((dialogCardElement.style.width = dialogScaleRecord.designWidth + 'px'),
    (dialogCardElement.style.minWidth = dialogScaleRecord.designWidth + 'px'),
    (dialogCardElement.style.maxWidth = 'none')),
    self.updateRuntimeDialogScale(),
    (dialogScaleRecord.measureFrame = window.requestAnimationFrame(() => {
      ;(dialogScaleRecord.measureFrame = 0),
        self.runtimeDialogScaleContext === dialogScaleRecord &&
          (self.updateRuntimeDialogScale(),
          dialogElement.open &&
            (dialogScaleRecord.entranceAnimations = playStableRuntimeDialogEntrance2(
              dialogLayerElement,
              dialogElement,
            )))
    })),
    (dialogScaleRecord.layoutObserver = new ResizeObserver(() => {
      self.runtimeDialogScaleContext !== dialogScaleRecord ||
        dialogScaleRecord.measureFrame ||
        (dialogScaleRecord.measureFrame = window.requestAnimationFrame(() => {
          ;(dialogScaleRecord.measureFrame = 0),
            self.runtimeDialogScaleContext === dialogScaleRecord && self.updateRuntimeDialogScale()
        }))
    })),
    dialogScaleRecord.layoutObserver.observe(dialogElement),
    dialogCardElement && dialogScaleRecord.layoutObserver.observe(dialogCardElement)
}
export function updateRuntimeDialogScale(self: PanelRenderer) {
  const runtimeDialogScaleContext = self.runtimeDialogScaleContext
  if (!runtimeDialogScaleContext?.dialog?.isConnected || !runtimeDialogScaleContext.dialogLayer?.isConnected) return
  const dialogLayerRect = runtimeDialogScaleContext.dialogLayer.getBoundingClientRect(),
    viewportRect = self.viewport?.getBoundingClientRect(),
    // 画布按容器尺寸等比缩放（`canvas.style.transform = scale(…)`，或展示页用 `zoom`），
    // 于是 layer 的 `getBoundingClientRect()` 是**屏幕像素**，而 `left/top`、`offsetWidth`
    // 是**布局像素**。两者差一个缩放系数：混用会让弹窗整体往左上角偏、并且比设计尺寸小一圈
    // （76% 占位算出 68%）。这里先统一折回 layer 的布局坐标系再算。
    layerLayoutWidth = Math.max(
      1,
      Number(runtimeDialogScaleContext.dialogLayer.clientWidth || dialogLayerRect.width || 0) || 1,
    ),
    layerLayoutHeight = Math.max(
      1,
      Number(runtimeDialogScaleContext.dialogLayer.clientHeight || dialogLayerRect.height || 0) || 1,
    ),
    screenPerLayoutX = dialogLayerRect.width / layerLayoutWidth,
    screenPerLayoutY = dialogLayerRect.height / layerLayoutHeight,
    runtimeDialogViewport2 = runtimeDialogViewport({
      layerLeft: 0,
      layerTop: 0,
      layerWidth: layerLayoutWidth,
      layerHeight: layerLayoutHeight,
      dashboardLeft: viewportRect ? (viewportRect.left - dialogLayerRect.left) / screenPerLayoutX : 0,
      dashboardTop: viewportRect ? (viewportRect.top - dialogLayerRect.top) / screenPerLayoutY : 0,
      dashboardWidth: viewportRect?.width ? viewportRect.width / screenPerLayoutX : layerLayoutWidth,
      dashboardHeight: viewportRect?.height ? viewportRect.height / screenPerLayoutY : layerLayoutHeight,
    }),
    width = runtimeDialogViewport2.width,
    height = runtimeDialogViewport2.height,
    measuredDialogWidth = Math.max(
      Number(runtimeDialogScaleContext.dialog.offsetWidth || 0),
      Number(runtimeDialogScaleContext.dialog.scrollWidth || 0),
    ),
    measuredDialogHeight = Math.max(
      Number(runtimeDialogScaleContext.dialog.offsetHeight || 0),
      Number(runtimeDialogScaleContext.dialog.scrollHeight || 0),
    ),
    designWidth = measuredDialogWidth > 1 ? measuredDialogWidth : runtimeDialogScaleContext.designWidth,
    designHeight = measuredDialogHeight > 1 ? measuredDialogHeight : runtimeDialogScaleContext.designHeight,
    runtimeDialogLayout2 = runtimeDialogLayout({
      layerWidth: width,
      layerHeight: height,
      layoutWidth: designWidth,
      layoutHeight: designHeight,
      fillAvailable: runtimeDialogScaleContext.fillAvailable,
      tightFill: runtimeDialogScaleContext.tightFill,
      targetOccupancy: runtimeDialogScaleContext.targetOccupancy,
    }),
    scale5 = runtimeDialogLayout2.scale
  ;(runtimeDialogScaleContext.dialog.style.position = 'absolute'),
    (runtimeDialogScaleContext.dialog.style.inset = 'auto'),
    (runtimeDialogScaleContext.dialog.style.top = runtimeDialogViewport2.centerY + 'px'),
    (runtimeDialogScaleContext.dialog.style.left = runtimeDialogViewport2.centerX + 'px'),
    (runtimeDialogScaleContext.dialog.style.margin = '0'),
    (runtimeDialogScaleContext.dialog.style.transform = 'translate(-50%, -50%) scale(' + scale5 + ')'),
    (runtimeDialogScaleContext.dialog.style.transformOrigin = 'center'),
    runtimeDialogScaleContext.dialog.style.setProperty('--hb-runtime-dialog-scale', String(scale5)),
    (runtimeDialogScaleContext.dialogLayer.dataset.dialogScale = scale5.toFixed(4)),
    (runtimeDialogScaleContext.dialogLayer.dataset.dialogLayoutWidth = String(Math.round(designWidth))),
    (runtimeDialogScaleContext.dialogLayer.dataset.dialogLayoutHeight = String(Math.round(designHeight))),
    (runtimeDialogScaleContext.dialogLayer.dataset.dialogSafeInset = runtimeDialogLayout2.safeInset.toFixed(2)),
    (runtimeDialogScaleContext.dialogLayer.dataset.dialogViewportWidth = String(
      Math.round(runtimeDialogViewport2.width),
    )),
    (runtimeDialogScaleContext.dialogLayer.dataset.dialogViewportHeight = String(
      Math.round(runtimeDialogViewport2.height),
    ))
}
export function clearRuntimeDialogScale(self: PanelRenderer, closingDialogElement: any) {
  if (self.runtimeDialogScaleContext?.dialog === closingDialogElement) {
    window.cancelAnimationFrame(self.runtimeDialogScaleContext.measureFrame || 0),
      self.runtimeDialogScaleContext.layoutObserver?.disconnect()
    for (const entranceAnimation of self.runtimeDialogScaleContext.entranceAnimations || []) entranceAnimation.cancel()
    closingDialogElement.classList.remove('hb-runtime-scaled-dialog'), (self.runtimeDialogScaleContext = null)
  }
}
export function closeRuntimeDialog(
  self: PanelRenderer,
  targetDialogElement = self.detailsDialog,
  { preservePending: shouldPreservePending = false } = {},
) {
  shouldPreservePending || self.cancelPendingEntityDetails(),
    targetDialogElement &&
      (targetDialogElement.open ? targetDialogElement.close() : targetDialogElement.dispatchEvent(new Event('close')),
      targetDialogElement.isConnected && targetDialogElement.remove(),
      self.detailsDialog === targetDialogElement && (self.detailsDialog = null),
      self.detailsStateSync?.dialog === targetDialogElement && (self.detailsStateSync = null))
}
export function bindRuntimeDialogOutsideDismiss(
  _self: PanelRenderer,
  outsideDismissLayer: any,
  outsideClickDialog: any,
  outsideDismissCardElement: any,
) {
  const outsideClickGraceUntilMs = performance.now() + 320
  outsideDismissLayer.addEventListener('click', (outsideClickEvent: any) => {
    outsideDismissCardElement.contains(outsideClickEvent.target) ||
      (outsideClickEvent.preventDefault(),
      outsideClickEvent.stopPropagation(),
      !(performance.now() < outsideClickGraceUntilMs) && outsideClickDialog.close())
  })
}
