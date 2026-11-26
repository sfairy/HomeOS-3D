/* 模型库拖放到平面画布：dragenter / dragover / drop / dragleave 与落点建物。
 * 从 `studio-app/boot.ts` 整块搬出：读 `appCtx` 与画布句柄，写 `appCtx.*` 与文档。 */

import {
  decorationPlacementFields,
  registerUserDecorationModel,
} from '../../../loaders/external-models/user-decoration-models'

/**
 * 「我的装饰」卡片的拖拽 MIME（上游 `MODEL_DRAG_TYPE`）。
 *
 * 与资源库其它卡片的 `application/x-homeos-item` **分开**是必要的：
 * 前者有效负载是 `assetId`（32 位 hex），后者是类型名（`sofa` / `wallac`）。
 * 两者都是裸字符串，仅凭内容无法可靠区分，必须靠 MIME 分流。
 */
export const USER_DECORATION_DRAG_TYPE = 'application/x-ha-bridge-3d-item'

/** 拖拽是否带了本画布认识的有效负载（任一约定 MIME 命中即可）。 */
export function hasDraggablePayload(dragEvent: { dataTransfer?: DataTransfer | null }): boolean {
  const types = dragEvent.dataTransfer?.types
  if (!types) return false
  return [...types].includes(USER_DECORATION_DRAG_TYPE) || [...types].includes('application/x-homeos-item')
}

/** 装饰的占位尺寸（米）：真实包围盒由加载后的模型写回。 */
const USER_DECORATION_PLACEHOLDER_SIZE = 0.4
export function bindModelDragDrop(deps: Record<string, any>): void {
  const {
    appCtx,
    applyCameraSnapshot,
    applyPlacementChange,
    axisLockedDistance,
    buildingFootprints2,
    captureUndoSnapshot,
    closedWallLoops,
    courtyardPlanColor2,
    createCourtyardDrawingEditor2,
    createSceneItem,
    createSelectionRef,
    cursorPositionElement,
    deselectAll,
    ensureCalibrationReady,
    eventToLocalPoint,
    exportDialogElement,
    exportOverwriteDialogElement,
    exportSaveViewButton,
    fixedCameraViewButton,
    fixedOverviewViewButton,
    generateId,
    getDefaultSelectionScope,
    getPixelsPerMeter,
    getSelectedObject,
    handleCanvasWheel,
    handleInteractionEnded,
    handlePointerDown,
    handlePointerMove,
    handlePointerRelease,
    isSnapEnabled,
    itemTypeCatalog,
    markDocumentDirty,
    openExportPanel,
    planCanvasElement,
    planStageElement,
    planToScreen,
    refreshScopeItems,
    refreshStudioView,
    resetView,
    resolveOverwriteChoice,
    restorePreviewAfterExport,
    rotatePlanView,
    saveCameraView,
    saveCameraViewButton,
    saveOverviewViewButton,
    screenToPlan,
    selectElement,
    selectSceneObject,
    selectStudioTool,
    selectionInspectorElement,
    showToast,
    snapIndicatorElement,
    updateCameraView,
    zoomByScale,
  } = deps
  /**
   * 在落点建一件用户装饰。
   *
   * **先注册模型 URL 再建物品**：建场景靠这条登记把 `user-decoration` 映射到真实 GLB，
   * 顺序反了会得到一件看不见的物品。失败时给出 toast 而不是静默（拖拽最容易「没反应」）。
   */
  function createUserDecorationAt(assetId: string, planPoint: { x: number; y: number }): void {
    const modelKey = registerUserDecorationModel(assetId, {
      width: USER_DECORATION_PLACEHOLDER_SIZE,
      height: USER_DECORATION_PLACEHOLDER_SIZE,
      depth: USER_DECORATION_PLACEHOLDER_SIZE,
    })
    if (!modelKey) {
      showToast('这个装饰模型不可用，请重新上传。', 'error')
      return
    }
    createSceneItem('user-decoration', planPoint, {
      width: USER_DECORATION_PLACEHOLDER_SIZE,
      depth: USER_DECORATION_PLACEHOLDER_SIZE,
      // 与「点击放置」共用同一份字段构造：两条路径各写一份必然漂移
      // （历史上拖拽那条写死了 `name: '我的装饰'`，属性面板于是永远显示目录名）。
      extraFields: decorationPlacementFields(assetId),
    })
  }

  planStageElement.addEventListener('dragenter', (assetDragEnterEvent: any) => {
    hasDraggablePayload(assetDragEnterEvent) && planStageElement.classList.add('dragging-item')
  }),
    planStageElement.addEventListener('dragover', (assetDragOverEvent: any) => {
      hasDraggablePayload(assetDragOverEvent) &&
        (assetDragOverEvent.preventDefault(),
        (assetDragOverEvent.dataTransfer.dropEffect = 'copy'),
        planStageElement.classList.add('dragging-item'))
    }),
    planStageElement.addEventListener('dragleave', (assetDragLeaveEvent: any) => {
      planStageElement.contains(assetDragLeaveEvent.relatedTarget) || planStageElement.classList.remove('dragging-item')
    }),
    planStageElement.addEventListener('drop', (assetDropEvent: any) => {
      assetDropEvent.preventDefault(), planStageElement.classList.remove('dragging-item')
      const dropPoint = screenToPlan(eventToLocalPoint(assetDropEvent))
      // 「我的装饰」卡片带的是 assetId（上游 `x-ha-bridge-3d-item` 契约），
      // 资源库里其它卡片带的是类型名。先判装饰，再走类型名 —— 两者的有效负载
      // 都可能是裸字符串，只靠内容无法区分，必须靠 MIME。
      const decorationAssetId = assetDropEvent.dataTransfer.getData(USER_DECORATION_DRAG_TYPE)
      if (decorationAssetId) {
        createUserDecorationAt(decorationAssetId, dropPoint)
        return
      }
      const data = assetDropEvent.dataTransfer.getData('application/x-homeos-item')
      data && createSceneItem(data, dropPoint)
    }),
    (deps.planPainter = createCourtyardDrawingEditor2({
      canvas: planCanvasElement,
      toolbar: document.querySelector('.plan-toolbar'),
      inspector: selectionInspectorElement,
      scene: () => appCtx.studioState,
      selected: () => (appCtx.selectedItem?.kind === 'item' ? getSelectedObject() : null),
      point: (pointerPlanPoint: any) => screenToPlan(eventToLocalPoint(pointerPlanPoint)),
      screen: planToScreen,
      ppm: () => getPixelsPerMeter() || 100,
      zoom: () => appCtx.planView.zoom,
      feedback: (toolFeedback: any) => {
        ;(snapIndicatorElement.textContent = toolFeedback?.kind
          ? '吸附：' + toolFeedback.label
          : isSnapEnabled()
            ? '吸附：自由'
            : '吸附：关闭'),
          toolFeedback?.point &&
            (cursorPositionElement.textContent =
              'X ' +
              (toolFeedback.point.x / (getPixelsPerMeter() || 100)).toFixed(2) +
              ' m · Y ' +
              (toolFeedback.point.y / (getPixelsPerMeter() || 100)).toFixed(2) +
              ' m')
      },
      snap: axisLockedDistance,
      snapping: isSnapEnabled,
      calibrated: ensureCalibrationReady,
      panning: () => appCtx.isMiddleButtonPanning,
      planColor: (courtyardPlanColor: any) => courtyardPlanColor2(courtyardPlanColor, itemTypeCatalog),
      buildings: () =>
        buildingFootprints2(appCtx.studioState.walls, closedWallLoops(getPixelsPerMeter()), getPixelsPerMeter()),
      clone: captureUndoSnapshot,
      snapshot: deselectAll,
      push: applyPlacementChange,
      changed: markDocumentDirty,
      refresh: () => refreshScopeItems(getDefaultSelectionScope()),
      draw: refreshStudioView,
      interactionEnded: handleInteractionEnded,
      select: (selectedToolItem: any) => selectSceneObject('item', selectedToolItem),
      isSelected: (toolSelectionItem: any) => createSelectionRef('item', toolSelectionItem),
      id: () => generateId('courtyard'),
      setTool: selectStudioTool,
      toast: showToast,
    })),
    planCanvasElement.addEventListener('pointerdown', handlePointerDown),
    planCanvasElement.addEventListener('pointermove', handlePointerMove),
    planCanvasElement.addEventListener('pointerup', handlePointerRelease),
    planCanvasElement.addEventListener('pointercancel', handlePointerRelease),
    planCanvasElement.addEventListener('contextmenu', (canvasMenuEvent: any) => canvasMenuEvent.preventDefault()),
    planCanvasElement.addEventListener(
      'wheel',
      (canvasPointerEvent: any) => {
        canvasPointerEvent.preventDefault(), handleCanvasWheel(canvasPointerEvent)
      },
      {
        passive: false,
      },
    ),
    selectElement('#fit-view').addEventListener('click', resetView),
    selectElement('#rotate-plan-view').addEventListener('click', rotatePlanView),
    selectElement('#zoom-in').addEventListener('click', () => zoomByScale(1.18)),
    selectElement('#zoom-out').addEventListener('click', () => zoomByScale(1 / 1.18)),
    selectElement('#reset-camera').addEventListener('click', updateCameraView),
    saveCameraViewButton.addEventListener('click', saveCameraView),
    fixedCameraViewButton.addEventListener('click', applyCameraSnapshot),
    saveOverviewViewButton.addEventListener('click', saveCameraView),
    fixedOverviewViewButton.addEventListener('click', applyCameraSnapshot),
    exportSaveViewButton.addEventListener('click', saveCameraView),
    selectElement('#open-export').addEventListener('click', openExportPanel),
    selectElement('#export-close').addEventListener('click', () => {
      appCtx.isInteractionLocked || exportDialogElement.close()
    }),
    exportDialogElement.addEventListener('cancel', (exportDialogCancelEvent: any) => {
      exportDialogCancelEvent.preventDefault(), appCtx.isInteractionLocked || exportDialogElement.close()
    }),
    exportDialogElement.addEventListener('close', restorePreviewAfterExport),
    selectElement('#export-overwrite-close').addEventListener('click', () => resolveOverwriteChoice('cancel')),
    selectElement('#export-overwrite-cancel').addEventListener('click', () => resolveOverwriteChoice('cancel')),
    selectElement('#export-overwrite-rename').addEventListener('click', () => resolveOverwriteChoice('rename')),
    selectElement('#export-overwrite-confirm').addEventListener('click', () => resolveOverwriteChoice('overwrite')),
    exportOverwriteDialogElement.addEventListener('cancel', (overwriteDialogCancelEvent: any) => {
      overwriteDialogCancelEvent.preventDefault(), resolveOverwriteChoice('cancel')
    })
}
