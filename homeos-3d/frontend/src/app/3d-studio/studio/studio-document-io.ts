/**
 * 自 studio-app.ts 外提的独立单元（Phase A：安全外提）。
 * 对本模块之外的 studio-app.ts 内部零依赖：只引用 import 与自身成员，故不存在循环引用。
 */
import {
  handleSaveConflict,
  handleSaveInteractionConfirmation,
  markDocumentDirty,
  normalizeStudioDocument,
  putStudioScene,
  requestStudioApi,
  resolveSaveInteraction,
  saveInteractionDialogElement,
  saveStudioDraft,
  setSaveState,
  showToast,
  snapshotDocumentForSave
} from "./studio-document-save.js";
import {
  applyCameraMode,
  currentCameraMode,
  pushHistorySnapshot,
  resetCameraView,
  restoreStoredCameraView,
  savedCameraView
} from "./studio-camera-mode.js";
import { state } from "./studio-state.js";
import {
  currentPreviewFloorMode,
  getCurrentFloor,
  planCanvasElement,
  planContext,
  selectElement
} from "./studio-plan-render.js";
import {
  clearSelection,
  currentFloorModelTypes,
  fitViewToBounds,
  loadBackgroundTexture,
  refreshStudio,
  resetScaleInteractionState,
  syncPreviewFloorButtons,
  updateFloorAlignmentControls
} from "./studio-ui-refresh.js";
import { activateTool } from "./studio-plan-interaction.js";
import {
  applySceneRefresh,
  currentCameraView,
  isAutoDiagramEmbed,
  loadExternalItemModel,
  scheduleDeferredModelLoad,
  scheduleLightPrecompile,
  updateModelLoadingStatus
} from "./studio-render-pipeline.js";
import {
  currentFocalLength,
  currentTopRotationDeg,
  measureVisibleHeight
} from "./studio-camera-presets.js";
import { syncCameraViewControls } from "./studio-control-sync.js";
import {
  applyBaseLightingSettings,
  exportStatusElement,
  floorSelectionParam
} from "./studio-export-dialogs.js";
import { stageStartup } from "../stage-startup.js";
import { prepareSceneDocument } from "../scene-persistent-cache.js";
import { isStageViewerMode } from "./studio-architecture.js";
import { renderPlanView } from "./studio-plan-draw.js";
import { createLoadTiming } from "../../bridge/load-timing.js";

/**
 * 首屏分段埋点（`?debug=1` 或 `?performance-diagnostics=1` 时才输出）。
 */
export const loadTiming = createLoadTiming("studio");

export const planStageElement = selectElement("#plan-stage");

export const importPlanButton = selectElement("#import-plan");

/**
 * 跳过防抖立刻重建预览，用于展示页「已就绪」与导出前这类必须同步完成的时机。
 */
export function forcePreviewRebuild() {
  updateModelLoadingStatus();
  state.isPrecompilePending = false;
  window.clearTimeout(state.precompileRenderTimer);
  state.precompileRenderTimer = null;
  applySceneRefresh({
    force: true,
    precompile: true
  });
}

/**
 * 载入一份草稿记录（首次打开、冲突后切换版本、埋点刷新都走这里）。sceneLoadToken 自增做竞态守卫，
 */
export async function loadStudioRecord(record: any) {
  const loadToken = ++state.sceneLoadToken;
  window.clearTimeout(state.deferredModelTimer);
  state.deferredModelTimer = null;
  state.deferredModelTypes = [];
  state.areExternalModelsDeferred = false;
  state.savedSceneRecord = record;
  const preparedScene = stageStartup
    ? prepareSceneDocument(record, stageStartup.cache.peek(stageStartup.key), normalizeStudioDocument)
    : null;
  state.studioDocument = preparedScene ? preparedScene.document : normalizeStudioDocument(record.scene);
  if (preparedScene) {
    loadTiming(preparedScene.reused ? "scene-preparation-reused" : "scene-preparation-built");
    if (!preparedScene.reused) {
      // 写回缓存：下一次打开就能命中。异步、静默，写不进去只是下次还要重新归一。
      stageStartup!.cache.schedule(stageStartup!.key, record, state.studioDocument);
    }
  }
  if (isStageViewerMode) {
    for (const livePreviewFloor of state.studioDocument.floors) {
      livePreviewFloor.scene.settings.livePreviewEnabled = true;
    }
  }
  applyBaseLightingSettings(state.studioDocument.baseLighting);
  state.activeFloorId = state.studioDocument.activeFloorId;
  if (isAutoDiagramEmbed && floorSelectionParam !== null) {
    const selectedFloor = state.studioDocument.floors.find(
      (selectedFloorParam: any) => selectedFloorParam.id === floorSelectionParam
    );
    if (floorSelectionParam === "all" && state.studioDocument.floors.length > 1) {
      state.studioDocument.previewFloorMode = "all";
    } else if (selectedFloor) {
      state.studioDocument.previewFloorMode = "active";
      state.studioDocument.activeFloorId = selectedFloor.id;
      state.activeFloorId = selectedFloor.id;
    }
  }
  state.activeScene = getCurrentFloor().scene;
  state.activeLightGroupId = "";
  clearSelection();
  resetScaleInteractionState();
  state.undoStack = [];
  state.redoStack = [];
  const modelTypeList = currentFloorModelTypes();
  const isEmbedded = isAutoDiagramEmbed;
  if (isEmbedded) {
    state.isAutoDiagramLoading = true;
  }
  let embedLoadPromises = [];
  if (isEmbedded) {
    embedLoadPromises = modelTypeList.map(pendingModelType =>
      loadExternalItemModel(pendingModelType)
    );
  }
  state.areExternalModelsDeferred = !isEmbedded;
  state.deferredModelTypes = isEmbedded ? [] : modelTypeList;
  if (!isEmbedded) {
    scheduleDeferredModelLoad();
  }
  updateModelLoadingStatus();
  syncPreviewFloorButtons();
  updateFloorAlignmentControls();
  state.viewTransform.rotation = state.activeScene.settings.planViewRotation;
  await loadBackgroundTexture();
  refreshStudio(isEmbedded ? "none" : "all");
  if (!isEmbedded) {
    scheduleLightPrecompile(1200);
  }
  if (isEmbedded) {
    try {
      const loadPromise = Promise.allSettled(embedLoadPromises);
      await Promise.race([loadPromise, new Promise(resolve => window.setTimeout(resolve, 3500))]);
      Promise.allSettled(embedLoadPromises).then(() => {
        if (loadToken === state.sceneLoadToken) {
          forcePreviewRebuild();
        }
      });
    } finally {
      if (loadToken === state.sceneLoadToken) {
        window.clearTimeout(state.precompileRenderTimer);
        state.precompileRenderTimer = null;
        state.isAutoDiagramLoading = false;
        updateModelLoadingStatus();
      }
    }
  } else {
    applySceneRefresh({
      force: true
    });
    Promise.allSettled(embedLoadPromises).then(() => {
      if (loadToken === state.sceneLoadToken) {
        forcePreviewRebuild();
      }
    });
  }
  resizePlanCanvas();
  fitViewToBounds();
  if (!isEmbedded) {
    requestAnimationFrame(() => {
      if (savedCameraView()) {
        restoreStoredCameraView({
          recordChange: false,
          silent: true
        });
      } else {
        applyCameraMode(currentCameraMode(), {
          preserveView: false
        });
        resetCameraView();
      }
    });
  }
}

/**
 * 「确认删除并保存」：带令牌、连同 428 当时捕获的**同一个 revision 与场景快照**重发，服务端才会
 */
export async function confirmSaveInteraction() {
  const confirmation = state.saveInteractionConfirmation;
  if (!confirmation) {
    saveInteractionDialogElement.close();
    return;
  }
  if (state.isSaving) {
    return;
  }
  if (confirmation.localRevision !== state.changeRevision) {
    resolveSaveInteraction();
    saveStudioDraft();
    return;
  }
  // 用户这次是主动确认，不再处于「保留模型」的挂起态：失败时保持对话框与挂起记录（不放行自动保存），
  state.saveInteractionDeferred = false;
  state.isSaving = true;
  setSaveState("正在保存…", "saving");
  try {
    // 关键：revision 与 scene 都用 428 当时捕获的那一份，令牌是它们的哈希，换了就落不到同一份计划。
    state.savedSceneRecord = await putStudioScene(
      { revision: confirmation.revision },
      confirmation.scene,
      confirmation.token
    );
    resolveSaveInteraction();
    state.savedRevision = confirmation.localRevision;
    if (state.changeRevision === state.savedRevision) {
      setSaveState("已自动保存", "saved");
      showToast("已删除模型并同步清理交互配置。", "success");
    }
  } catch (saveRequestError: any) {
    if (saveRequestError.status === 428 && saveRequestError.code === "STUDIO3D_INTERACTION_CONFIRMATION") {
      // 期间场景或关联仪表盘变了：服务端回了新令牌，重新弹框（更新令牌），绝不静默重试。
      handleSaveInteractionConfirmation(
        saveRequestError.payload?.detail,
        confirmation.revision,
        confirmation.scene,
        confirmation.localRevision,
        {
          reopenDialog: true
        }
      );
      return;
    }
    if (saveRequestError.status === 409 && saveRequestError.code === "STUDIO3D_REVISION_CONFLICT") {
      // 重发期间草稿被别处更新：这次确认已作废，转交 409 冲突流程让用户选版本。
      resolveSaveInteraction();
      try {
        const remoteScene = await requestStudioApi("/studio3d");
        handleSaveConflict(remoteScene, snapshotDocumentForSave(), confirmation.localRevision, {
          reopenDialog: true
        });
      } catch (conflictLoadError: any) {
        setSaveState("保存失败", "error");
        showToast(conflictLoadError.message || "3D 草稿保存失败。", "error");
      }
      return;
    }
    window.HABridgeLog?.error?.(saveRequestError, {
      phase: "studio-save"
    });
    setSaveState("保存失败", "error");
    showToast(saveRequestError.message || "3D 草稿保存失败。", "error");
  } finally {
    state.isSaving = false;
    // 与 saveStudioDraft 同一口径：重发期间又落了新编辑（changeRevision 前进）且没有挂着的
    if (!state.saveConflict && !state.saveInteractionConfirmation && state.changeRevision !== state.savedRevision) {
      window.clearTimeout(state.autosaveTimer);
      state.autosaveTimer = window.setTimeout(saveStudioDraft, 500);
    }
  }
}

/**
 * 按容器尺寸重设画布分辨率与绘制上下文（窗口 resize、侧栏折叠时调用）。设备像素比封顶 2：
 */
export function resizePlanCanvas() {
  const stageRect = planStageElement.getBoundingClientRect();
  state.viewportWidthPx = Math.max(Math.round(stageRect.width), 1);
  state.viewportHeightPx = Math.max(Math.round(stageRect.height), 1);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  planCanvasElement.width = Math.round(state.viewportWidthPx * pixelRatio);
  planCanvasElement.height = Math.round(state.viewportHeightPx * pixelRatio);
  planContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  if (state.isViewFitted) {
    renderPlanView();
  } else {
    fitViewToBounds();
  }
}

/**
 * 上传用户选中的底图文件并设为当前楼层底图。前端先按扩展名粗筛（后端仍复验）。上传期间禁用按钮并改文案，防止同一张图
 */
export async function uploadPlanImage(file: any) {
  if (file) {
    if (!/\.(png|jpe?g|webp|svg)$/i.test(file.name)) {
      showToast("仅支持 PNG、JPG、JPEG、WebP 和 SVG 图片。", "error");
      return;
    }
    importPlanButton.disabled = true;
    importPlanButton.textContent = "上传中…";
    try {
      const uploadResponse = await requestStudioApi("/assets/user", {
        method: "POST",
        body: file,
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "X-File-Name": encodeURIComponent(file.name)
        }
      });
      pushHistorySnapshot();
      state.activeScene.background = {
        assetId: uploadResponse.assetId,
        url: uploadResponse.url,
        name: uploadResponse.name,
        width: uploadResponse.width,
        height: uploadResponse.height
      };
      const backgroundFloor = getCurrentFloor();
      if (backgroundFloor && !backgroundFloor.originInitialized) {
        backgroundFloor.originX = uploadResponse.width / 2;
        backgroundFloor.originY = uploadResponse.height / 2;
        backgroundFloor.originInitialized = true;
      }
      state.activeScene.settings.backgroundVisible = true;
      await loadBackgroundTexture();
      fitViewToBounds();
      refreshStudio();
      markDocumentDirty();
      activateTool("scale");
      showToast("底图已导入，请在图上画一条已知长度的参考线。");
    } catch (uploadError: any) {
      showToast(uploadError.message || "底图上传失败。", "error");
    } finally {
      importPlanButton.disabled = false;
      importPlanButton.textContent = "导入";
    }
  }
}

export function storeCameraView(cameraViewSnapshot: any) {
  if (currentPreviewFloorMode() === "all") {
    state.studioDocument.combinedFixedCameraView = cameraViewSnapshot;
  } else {
    state.activeScene.settings.fixedCameraView = cameraViewSnapshot;
  }
}

/**
 * 把当前相机状态存成「固定视角」书签并立即落盘。快照覆盖恢复所需的一切：投影方式、视角标识、顶旋角、位置与 target、
 */
export async function saveCurrentCameraView() {
  if (!state.previewCamera || !state.orbitControls) {
    return;
  }
  const viewLabel = currentPreviewFloorMode() === "all" ? "总览视角" : "当前层视角";
  if (!state.exportRenderState) {
    pushHistorySnapshot();
  }
  const savedTarget = state.orbitControls.target;
  storeCameraView({
    mode: state.previewCamera.isPerspectiveCamera ? "perspective" : "orthographic",
    view: currentCameraView(),
    topRotation: currentTopRotationDeg(),
    position: {
      x: state.previewCamera.position.x,
      y: state.previewCamera.position.y,
      z: state.previewCamera.position.z
    },
    target: {
      x: savedTarget.x,
      y: savedTarget.y,
      z: savedTarget.z
    },
    visibleHeight: measureVisibleHeight(state.previewCamera, savedTarget),
    fov: state.previewCamera.isPerspectiveCamera ? state.previewCamera.fov : 36,
    focalLength: state.previewCamera.isPerspectiveCamera ? currentFocalLength() : null
  });
  syncCameraViewControls();
  if (state.exportRenderState) {
    exportStatusElement.textContent = viewLabel + "已保存";
    const exportViewSaveOutcome = await saveStudioDraft();
    showToast(
      exportViewSaveOutcome === "saved" || exportViewSaveOutcome === "no-changes"
        ? viewLabel + "已保存。"
        : viewLabel + "已记录，待顶栏保存提示处理后再落盘。"
    );
    return;
  }
  markDocumentDirty();
  window.clearTimeout(state.autosaveTimer);
  state.autosaveTimer = null;
  const cameraViewSaveOutcome = await saveStudioDraft();
  // 冲突 / 未确认的删除影响 / 失败时不能说「已保存」：那正是用户以为改动落盘了、实际没有的那种情况。
  if (
    cameraViewSaveOutcome === "blocked-by-conflict" ||
    cameraViewSaveOutcome === "blocked-by-interaction-confirmation" ||
    cameraViewSaveOutcome === "failed"
  ) {
    showToast(viewLabel + "已记录，待顶栏保存提示处理后再落盘。", "error");
  } else if (state.changeRevision === state.savedRevision) {
    showToast(viewLabel + "已保存。");
  } else {
    showToast(viewLabel + "已记录，正在保存…");
  }
}
