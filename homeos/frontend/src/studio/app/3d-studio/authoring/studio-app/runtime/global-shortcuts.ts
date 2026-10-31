/* 全局键盘/窗口消息短路（撤销重做、相机、导出快捷键等）。
 *
 * 从 `studio-app/boot.ts` 整块搬出：读 `appCtx` / DOM 句柄与选中的实现函数，
 * 写的是 `appCtx.*` 与文档对象，不回写闭包里的可变绑定。
 */
import type { StudioControlElement } from '../../types/studio-app-types';

export function bindGlobalShortcuts(deps: Record<string, any>): void {
  const {
    anchorGate2, appCtx, applyPlacementChange, buildItemModel, cancelFloorAlign, captureUndoSnapshot,
    clearSelection, closeDrawingToolGroups, disposeObjectTree, drawingToolSections, duplicateSelection,
    endStudioGesture, exportDialogElement, getCurrentPreviewScope, getPixelsPerMeter, getPreviewScopeSelection,
    hasUnsavedChanges, hideLightGroupActionMenu, isCourtyardGate2, isEmbeddedStage, itemTypeCatalog,
    markDocumentDirty, mirrorSelection, moveStepMeters2, planCanvasElement, planDirectionForScreenArrow,
    redoStudioHistory, refreshSceneRender, refreshScopeItems, refreshSelection, refreshStudioUi,
    refreshStudioView, resetCameraView, rotateSelection, scaleDialogElement, scheduleAutosave, selectStudioTool,
    setPreviewScope, setSnapSettingsOpen, snapSettingsPanel, undoStudioHistory,
    updateSnapIndicator, validateSelectionChange
  } = deps;
if (
  (window.addEventListener("keydown", (windowKeyDownEvent) => {
    if (isEmbeddedStage || windowKeyDownEvent.defaultPrevented || exportDialogElement.open) return;
    if (windowKeyDownEvent.key === "Escape" && !snapSettingsPanel.hidden) {
      setSnapSettingsOpen(false);
      return;
    }
    if (
      windowKeyDownEvent.key === "Escape" &&
      drawingToolSections.some((drawingToolSection: StudioControlElement) => drawingToolSection.classList.contains("open"))
    ) {
      closeDrawingToolGroups();
      return;
    }
    const open =
      windowKeyDownEvent.target instanceof HTMLInputElement ||
      windowKeyDownEvent.target instanceof HTMLTextAreaElement ||
      scaleDialogElement.open;
    if (
      (windowKeyDownEvent.code === "Space" &&
        !open &&
        ((appCtx.isMiddleButtonPanning = true), windowKeyDownEvent.preventDefault()),
      windowKeyDownEvent.key.toLowerCase() === "s" &&
        !open &&
        ((appCtx.isSnapTemporarilyOff = true), updateSnapIndicator(), refreshStudioView()),
      open)
    )
      return;
    windowKeyDownEvent.key === "Shift" &&
      !appCtx.marqueeBox &&
      (appCtx.activeToolName === "scale" || appCtx.activeToolName === "wall") &&
      ((appCtx.isForceSnapDisabled = true), updateSnapIndicator(), refreshStudioView());
    const ctrlKey = windowKeyDownEvent.metaKey || windowKeyDownEvent.ctrlKey;
    const keyLowerStudio = windowKeyDownEvent.key.toLowerCase();
    if (ctrlKey && keyLowerStudio === "z") {
      (windowKeyDownEvent.preventDefault(),
        windowKeyDownEvent.shiftKey ? void redoStudioHistory() : void undoStudioHistory());
      return;
    }
    if (ctrlKey && keyLowerStudio === "y" && !windowKeyDownEvent.shiftKey) {
      (windowKeyDownEvent.preventDefault(), void redoStudioHistory());
      return;
    }
    if (ctrlKey && keyLowerStudio === "d") {
      (windowKeyDownEvent.preventDefault(), duplicateSelection());
      return;
    }
    // mirrorSelection / rotateSelection 虽名误导，语义实为 copy / paste
    if (ctrlKey && keyLowerStudio === "c" && !windowKeyDownEvent.shiftKey) {
      (windowKeyDownEvent.preventDefault(), mirrorSelection());
      return;
    }
    if (ctrlKey && keyLowerStudio === "v" && !windowKeyDownEvent.shiftKey) {
      (windowKeyDownEvent.preventDefault(), rotateSelection());
      return;
    }
    if (windowKeyDownEvent.key === "Delete" || windowKeyDownEvent.key === "Backspace") {
      (windowKeyDownEvent.preventDefault(), clearSelection());
      return;
    }
    const arrowKeyDirections = {
      ArrowLeft: {
        x: -1,
        y: 0,
      },
      ArrowRight: {
        x: 1,
        y: 0,
      },
      ArrowUp: {
        x: 0,
        y: -1,
      },
      ArrowDown: {
        x: 0,
        y: 1,
      },
    }[windowKeyDownEvent.key];
    if (arrowKeyDirections && !ctrlKey) {
      const selectedItemIds =
        appCtx.selectedItem?.kind === "item"
          ? [appCtx.selectedItem.id]
          : appCtx.selectedItems
              .filter((selectedHistoryEntry: any) => selectedHistoryEntry.kind === "item")
              .map((selectedItemEntry: any) => selectedItemEntry.id);
      if (selectedItemIds.length) {
        windowKeyDownEvent.preventDefault();
        // 方向键说的是「屏幕上」的上下左右，而平面图可以被旋转（`#rotate-plan-view`
        // 会把角度写进草稿的 `planViewRotation`）。直接把方向键当平面坐标增量，转
        // 180° 后上下左右正好全反，转 90° 后上下变左右 —— 这就是「方向反了」的根因。
        const nudgedPlanDirection = planDirectionForScreenArrow(
            arrowKeyDirections,
            appCtx.planView.rotation,
          ),
          elementSnapshotBeforeMove = captureUndoSnapshot(),
          nudgeStep =
            moveStepMeters2(windowKeyDownEvent) * (getPixelsPerMeter() || 1),
          selectedItemIdSet = new Set(selectedItemIds);
        for (const movedSceneItem of appCtx.studioState.items)
          selectedItemIdSet.has(movedSceneItem.id) &&
            ((movedSceneItem.x += nudgedPlanDirection.x * nudgeStep),
            (movedSceneItem.y += nudgedPlanDirection.y * nudgeStep),
            selectedItemIds.length === 1 &&
              isCourtyardGate2(movedSceneItem) &&
              anchorGate2(
                movedSceneItem,
                appCtx.studioState.items,
                getPixelsPerMeter(),
                24 / appCtx.planView.zoom,
              ));
        if (!validateSelectionChange(elementSnapshotBeforeMove)) {
          refreshScopeItems(getCurrentPreviewScope());
          return;
        }
        (applyPlacementChange(elementSnapshotBeforeMove),
          refreshScopeItems(getCurrentPreviewScope()),
          markDocumentDirty());
        return;
      }
    }
    if (windowKeyDownEvent.key === "Escape") {
      if (
        appCtx.activeToolName === "courtyard-gate" ||
        appCtx.activeToolName === "flooropening" ||
        appCtx.marqueeBox?.type === "draw-flooropening"
      ) {
        if ((windowKeyDownEvent.preventDefault(), appCtx.marqueeBox?.type === "draw-flooropening")) {
          try {
            planCanvasElement.releasePointerCapture(appCtx.marqueeBox.pointerId);
          } catch { /* 指针捕获：指针已失效（pointercancel / 元素已卸载）时规范要求抛错，忽略即可 */ }
          ((appCtx.marqueeBox = null), endStudioGesture());
        }
        selectStudioTool("select");
        return;
      }
      if (appCtx.alignmentState) {
        (windowKeyDownEvent.preventDefault(), cancelFloorAlign());
        return;
      }
      (hideLightGroupActionMenu(), resetCameraView());
      const ao8 = getPreviewScopeSelection();
      (refreshSelection(), refreshStudioUi(), refreshStudioView(), setPreviewScope(ao8));
    }
  }),
  window.addEventListener("keyup", (windowKeyUpEvent) => {
    (windowKeyUpEvent.code === "Space" && (appCtx.isMiddleButtonPanning = false),
      windowKeyUpEvent.key.toLowerCase() === "s" &&
        ((appCtx.isSnapTemporarilyOff = false), updateSnapIndicator(), refreshStudioView()),
      windowKeyUpEvent.key === "Shift" &&
        ((appCtx.isForceSnapDisabled = false), updateSnapIndicator(), refreshStudioView()));
  }),
  window.addEventListener("blur", () => {
    ((appCtx.isMiddleButtonPanning = false),
      (appCtx.isForceSnapDisabled = false),
      (appCtx.isSnapTemporarilyOff = false));
  }),
  window.addEventListener("online", () => {
    ((appCtx.saveRetryDueAt = 0), deps.studioSaveStore?.setOnline(true), scheduleAutosave(0));
  }),
  window.addEventListener("offline", () => {
    (deps.studioSaveStore?.setOnline(false),
      window.clearTimeout(appCtx.autosaveTimeoutId),
      (appCtx.autosaveTimeoutId = null));
  }),
  window.addEventListener("pagehide", () => {
    ((appCtx.isPageSuspended = true),
      window.clearTimeout(appCtx.autosaveTimeoutId),
      (appCtx.autosaveTimeoutId = null),
      // pagehide 用 keepalive PUT 尽力而为；不乐观推进 revision，下次 GET 为准。
      !isEmbeddedStage && !appCtx.isLeavingStudio && deps.studioSaveStore?.flushOnPageHide());
  }),
  window.addEventListener("pageshow", () => {
    ((appCtx.isPageSuspended = false), (appCtx.isLeavingStudio = false), scheduleAutosave());
  }),
  window.addEventListener("beforeunload", (beforeUnloadEvent) => {
    isEmbeddedStage ||
      appCtx.isLeavingStudio ||
      !hasUnsavedChanges() ||
      (beforeUnloadEvent.preventDefault(), (beforeUnloadEvent.returnValue = ""));
  }),
  document.addEventListener("visibilitychange", () => {
    (document.hidden || refreshSceneRender(), scheduleAutosave());
  }),
  new URLSearchParams(window.location.search).has("model-export"))
) {
  window.__homeosExportFurnitureJson = (furnitureExportType, exportOverrides: Record<string, any> = {}) => {
    const furnitureDefinition = (itemTypeCatalog as any)[furnitureExportType];
    if (!furnitureDefinition) throw new Error("Unknown furniture type: " + furnitureExportType);
    const furnitureExportItem = {
        id: "offline-export-" + furnitureExportType,
        type: furnitureExportType,
        width: furnitureDefinition.width,
        height: furnitureDefinition.height,
        depth: furnitureDefinition.depth,
        elevation: furnitureDefinition.elevation || 0,
        rotation: 0,
        curtainPosition: "split",
        roundTableTurntable: false,
        stairDirection: "right",
        shoeCabinetMirrored: false,
        tvMountStyle: "standard",
        screenEnabled: true,
        offlineModelExport: true,
        ...exportOverrides,
      },
      vu4 = buildItemModel(furnitureExportItem);
    ((vu4.name = "homeos-v1-" + furnitureExportType), vu4.updateMatrixWorld(true));
    const jSON = vu4.toJSON();
    return (disposeObjectTree(vu4), jSON);
  };
  const modelExportType = new URLSearchParams(window.location.search).get("model-export");
  if (modelExportType && modelExportType !== "1") {
    const modelExportPresets =
        {
          curtain_left: {
            type: "curtain",
            curtainPosition: "left",
          },
          curtain_right: {
            type: "curtain",
            curtainPosition: "right",
          },
          curtain_split: {
            type: "curtain",
            curtainPosition: "split",
          },
          rounddiningtable_turntable: {
            type: "rounddiningtable",
            roundTableTurntable: true,
          },
          tv_standard: {
            type: "tv",
            tvMountStyle: "standard",
          },
          tv_tabletop: {
            type: "tv",
            tvMountStyle: "tabletop",
          },
          tv_mobile: {
            type: "tv",
            tvMountStyle: "mobile",
          },
        }[modelExportType] || {},
      resolvedExportType = modelExportPresets.type || modelExportType;
    requestAnimationFrame(() => {
      try {
        const exportPayloadField = document.createElement("textarea");
        ((exportPayloadField.id = "homeos-model-export"), (exportPayloadField.hidden = true));
        const exportPayloadJson = JSON.stringify(
          window.__homeosExportFurnitureJson!(resolvedExportType, modelExportPresets),
        );
        ((exportPayloadField.value = exportPayloadJson),
          (exportPayloadField.textContent = exportPayloadJson),
          document.body.append(exportPayloadField),
          (document.documentElement.dataset.modelExportReady = modelExportType));
      } catch (exportError: any) {
        document.documentElement.dataset.modelExportError =
          exportError?.message || String(exportError);
      }
    });
  }
}
}
