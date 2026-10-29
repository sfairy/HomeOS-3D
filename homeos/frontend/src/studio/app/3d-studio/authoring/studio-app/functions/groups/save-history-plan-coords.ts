import type { StudioAppRuntime } from "../../runtime/studio-app-runtime";
import { validatePlacementChange as validatePlacementChange2 } from "../../../items/studio-placement";
import { sceneContentBounds as sceneContentBounds2, syncCourtyardGates as syncCourtyardGates2 } from "../../../../plan/courtyard-drawing";
import { clamp as clamp2, clampWindowT as clampWindowT2, closedWallFloorPolygons as closedWallFloorPolygons2, unclosedWallEndpoints as unclosedWallEndpoints2, wallIntersections as wallIntersections2, wallJoinExtensions as wallJoinExtensions2 } from "../../../../plan/geometry";
import { itemPlanFootprint as itemPlanFootprint2 } from "../../../items/studio-item-posture";
import { navigateInShell } from "@/studio/platform/shell-navigation";
import { shellNotify } from "@/studio/platform/shell-chrome";
import { getStudioFacadeState, patchStudioFacadeState } from "../../../../../../engine";
import { buildStudioHistoryPatch } from "../../../ui/studio-history";
import type { PlanEditPreviewFlags, StudioApiRequestOptions } from "../../../types/studio-app-types";
import { resolveInteractionCleanup } from "../../../ui/studio-interaction-cleanup";
import { normalizeScenePayload } from "../../../scene/studio-scene-payload";
import { applyDocumentPatch, canApplyDocumentPatch } from "../../../store/document-store";
import type { DocumentPatch } from "../../../store/document-store";
import { diffDocumentPatches, describeDocumentPatch } from "../../../store/document-diff";
import type { SceneSyncOutcome } from "../../../store/scene-sync-controller";
import { StudioSaveStore } from "../../../store/save-store";
import type { FlushResult, SaveStoreState } from "../../../store/save-store";
import { refreshStepChecklist } from "../../ui/step-checklist";
import { historyChangePreviewScope, itemPreviewScope } from "../../../scene/studio-preview-scope";
import type { PreviewScope } from "../../../scene/studio-preview-scope";
import { previewScopeOptions } from "./light-groups-and-list-drag";

export function hideStudioReadonlyBanner(runtime: StudioAppRuntime, ): void {
  if (runtime.studioReadonlyBannerElement) runtime.studioReadonlyBannerElement.hidden = true;
}

/** 保存状态机 → 旧 header 文案 / appCtx 兼容字段 / 退出按钮 / 只读横幅。 */
export function applyStudioSaveState(runtime: StudioAppRuntime, saveState: SaveStoreState): void {
  runtime.appCtx.isSaveInFlight = saveState.isSaveInFlight;
  if (saveState.status === "saved") {
    runtime.appCtx.remoteSaveRevision = runtime.appCtx.localSaveRevision;
    runtime.studioDraftReadonly = false;
    runtime.hideStudioReadonlyBanner();
  }
  switch (saveState.status) {
    case "loading":
      runtime.showSaveState("正在载入…", "saving");
      break;
    case "blocked-readonly":
      runtime.studioDraftReadonly = true;
      runtime.showSaveState("只读：草稿载入失败", "error");
      runtime.renderStudioReadonlyBanner(
        "草稿载入失败，当前为只读视图：修改不会保存。可重试载入，或导出本地副本。",
      );
      break;
    case "saved":
      runtime.showSaveState("已自动保存", "saved");
      break;
    case "dirty":
      runtime.showSaveState("有未保存修改", "saving");
      break;
    case "saving":
      runtime.showSaveState("正在保存…", "saving");
      break;
    case "retrying":
      runtime.showSaveState("保存失败，稍后自动重试", "error");
      break;
    case "failed":
      runtime.showSaveState("保存失败，修改后重试", "error");
      break;
    case "offline":
      runtime.showSaveState("网络不可用，修改尚未保存", "error");
      break;
    case "conflict":
      runtime.showSaveState("等待处理保存冲突", "error");
      break;
    case "blocked":
      runtime.showSaveState("删除未确认，尚未保存", "error");
      break;
    default:
      break;
  }
  runtime.refreshExitDialogButtons();
}

/** 保存状态机（transport 走 fetchStudioApi，保留 401/403 跳转与错误归一化；beacon 走 keepalive）。 */
export function getStudioSaveStore(runtime: StudioAppRuntime, ): StudioSaveStore {
  if (runtime.studioSaveStore) return runtime.studioSaveStore;
  runtime.studioSaveStore = new StudioSaveStore({
    documentStore: runtime.studioDocumentStore,
    transport: {
      load: () => runtime.studioDraftRepository.load(),
      put: async (saveRequest) => {
        try {
          const savedPayload = await runtime.fetchStudioApi("/studio3d", {
            method: "PUT",
            hbLogContext: { phase: "studio-save" },
            body: JSON.stringify({
              revision: saveRequest.revision,
              scene: saveRequest.scene,
              interactionConfirmation: saveRequest.interactionConfirmation || "",
            }),
          });
          if (!savedPayload || typeof savedPayload !== "object" || !("revision" in savedPayload)) {
            return { ok: false, error: { message: "保存响应缺少 revision。" } };
          }
          return {
            ok: true,
            payload: {
              revision: Math.max(0, Math.trunc(Number((savedPayload as any).revision) || 0)),
              scene: (savedPayload as any).scene ?? saveRequest.scene,
              updatedAt: (savedPayload as any).updatedAt ?? null,
            },
          };
        } catch (saveError: any) {
          return {
            ok: false,
            error: {
              status: typeof saveError?.status === "number" ? saveError.status : undefined,
              detail: saveError?.payload?.detail ?? saveError?.detail,
              message: saveError?.message || "保存失败。",
            },
          };
        }
      },
      beacon: (beaconRequest) =>
        runtime.studioDraftRepository.beacon ? runtime.studioDraftRepository.beacon(beaconRequest) : false,
    },
    timers: {
      setTimeout: (timerHandler, delayMs) => window.setTimeout(timerHandler, delayMs),
      clearTimeout: (timerHandle) => window.clearTimeout(timerHandle),
    },
    isEmbedded: () => runtime.isEmbeddedStage,
    isPageSuspended: () => !!runtime.appCtx.isPageSuspended,
    isOnline: () => navigator.onLine !== false,
    getScene: () => (runtime.appCtx.loadedDraft ? runtime.getLocalSaveRevision() : null),
    exportLocalCopy: (localScene) => {
      runtime.downloadStudioLocalCopy(localScene);
    },
    onStateChange: runtime.applyStudioSaveState,
  });
  return runtime.studioSaveStore;
}

/** PUT 成功：document store 已 applySaved，把 appCtx.loadedDraft 对齐成服务器返回的 revision/scene。 */
export function syncDraftPayloadAfterSave(runtime: StudioAppRuntime, ): void {
  runtime.appCtx.loadedDraft = {
    ...(runtime.appCtx.loadedDraft || {}),
    revision: runtime.studioDocumentStore.getLoadedRevision(),
    scene: runtime.studioDocumentStore.getDocument(),
  };
}

/** 409 冲突：取服务器最新版本并打开三出口对话框（GET 失败也打开，载入按钮会重取）。 */
export async function recordSaveConflictFromServer(runtime: StudioAppRuntime, ): Promise<void> {
  try {
    const latestConflictPayload = await runtime.fetchStudioApi("/studio3d");
    runtime.recordSaveConflict(
      latestConflictPayload,
      runtime.getLocalSaveRevision(),
      runtime.studioDocumentStore.getLoadedRevision(),
    );
  } catch (conflictLoadFailure: any) {
    runtime.recordSaveConflict(null, runtime.getLocalSaveRevision(), runtime.studioDocumentStore.getLoadedRevision());
    window.HomeOSLog?.error!(conflictLoadFailure, { phase: "studio-save-conflict-load" });
  }
}

/** 统一收尾：成功同步 loadedDraft；冲突开对话框；428 先确认交互清理；失败只 toast 一次。 */
export async function settleStudioSaveResult(runtime: StudioAppRuntime, saveResult: FlushResult): Promise<FlushResult> {
  const saveStore = runtime.getStudioSaveStore();
  if (saveResult.ok) {
    runtime.syncDraftPayloadAfterSave();
    runtime.appCtx.pendingConflict = null;
    return saveResult;
  }
  if (saveResult.reason === "conflict") {
    await runtime.recordSaveConflictFromServer();
    return saveResult;
  }
  if (saveResult.reason === "confirmation-required") {
    const pendingConfirmation = saveStore.getState().pendingConfirmation;
    const confirmationDetail = {
      code: "STUDIO3D_INTERACTION_CONFIRMATION",
      token: pendingConfirmation?.token || saveResult.token,
      message: pendingConfirmation?.message || "",
      impacts: pendingConfirmation?.impacts ?? null,
      projects: pendingConfirmation?.projects ?? null,
    };
    const shouldConfirmCleanup = await resolveInteractionCleanup(
      confirmationDetail,
      runtime.undoStudioHistory,
      runtime.showToast,
    );
    if (!shouldConfirmCleanup) {
      saveStore.cancelConfirmation();
      runtime.showSaveState("删除未确认，尚未保存", "error");
      return { ok: false, reason: "blocked" };
    }
    return runtime.settleStudioSaveResult(await saveStore.confirmInteraction(confirmationDetail.token));
  }
  if (saveResult.reason === "fatal") {
    runtime.showToast(saveResult.error?.message || "3D 草稿保存失败。", "error");
  } else if (saveResult.reason === "retry-scheduled" && saveStore.getState().attempt === 1) {
    runtime.showToast(saveResult.error?.message || "3D 草稿保存失败，稍后自动重试。", "error");
  }
  return saveResult;
}

/** 退出保存要等交互结束（拖拽 / 画墙期间的场景快照不稳定）。 */
export async function waitForStudioInteractionIdle(runtime: StudioAppRuntime, ): Promise<void> {
  if (!runtime.isInteractionBusy()) return;
  await new Promise<void>((resolve) => runtime.exitWaiterResolvers.add(resolve));
}

export async function flushStudioSaveOnce(runtime: StudioAppRuntime, 
  saveTrigger: "autosave" | "exit" | "overwrite",
): Promise<FlushResult> {
  const saveStore = runtime.getStudioSaveStore();
  if (saveTrigger === "exit") {
    await runtime.waitForStudioInteractionIdle();
    // 等待交互期间用户可能已取消退出：不要再偷偷保存一次。
    if (!runtime.studioExitDialogElement.open) return { ok: false, reason: "deferred" };
    return runtime.settleStudioSaveResult(await saveStore.requestExit());
  }
  const rawResult =
    saveTrigger === "overwrite"
      ? await saveStore.resolveConflictOverwrite()
      : await saveStore.flushNow();
  return runtime.settleStudioSaveResult(rawResult);
}

/** 初载失败（boot 的 GET 抛错）：进入只读，横幅提示重试 / 导出本地副本，不谎报待保存。 */
export function notifyStudioDraftLoadFailure(runtime: StudioAppRuntime, loadError: any): void {
  if (runtime.isEmbeddedStage) return;
  runtime.studioDraftReadonly = true;
  runtime.getStudioSaveStore().markLoadFailed({
    status: typeof loadError?.status === "number" ? loadError.status : undefined,
    detail: loadError?.payload?.detail ?? loadError?.detail,
    message: loadError?.message || "草稿载入失败。",
  });
  // boot 的 catch 会随后写「载入失败」，这里补一次只读状态，确保最终文案是只读。
  window.setTimeout(() => {
    runtime.isStudioDraftReadonly() && runtime.showSaveState("只读：草稿载入失败", "error");
  }, 0);
}

export async function retryStudioDraftLoad(runtime: StudioAppRuntime, ): Promise<void> {
  try {
    const latestDraftPayload = await runtime.fetchStudioApi("/studio3d");
    await runtime.applyLoadedDraft(latestDraftPayload);
    runtime.getStudioSaveStore().acceptLoaded();
    runtime.studioDraftReadonly = false;
    runtime.hideStudioReadonlyBanner();
    runtime.showSaveState("已自动保存", "saved");
    runtime.showToast("草稿已重新载入。", "success");
  } catch (retryFailure: any) {
    runtime.notifyStudioDraftLoadFailure(retryFailure);
    runtime.showToast(retryFailure?.message || "草稿载入失败，可稍后重试。", "error");
  }
}

export async function flushStudioSaveBeforeTeardown(runtime: StudioAppRuntime, ): Promise<void> {
  if (runtime.isEmbeddedStage || runtime.appCtx.isLeavingStudio || runtime.isStudioDraftReadonly()) return;
  const pendingSaveStore = runtime.studioSaveStore;
  if (!pendingSaveStore) return;
  if (!pendingSaveStore.hasUnsavedChanges() && !pendingSaveStore.getState().isSaveInFlight) return;
  try {
    await pendingSaveStore.requestExit();
  } catch (flushFailure: any) {
    window.HomeOSLog?.error!(flushFailure, { phase: "studio-teardown-save" });
  }
}

/**
 * C4 —— 场景同步接线（task-11）。
 *
 * 约束：
 * 1. 轮询只读运行时快照 `appCtx.studioProject`，**绝不读写** `loadedDraft` / document-store 的
 *    `loadedRevision` / `dirty`：非全量推送只就地更新楼层内容、baseLighting 与楼层名。
 * 2. 全量推送且本地脏时先保存；保存冲突 / 失败时**不覆盖**本地（交给 409 三出口）；
 *    保存成功后本轮载荷已是保存前的陈旧快照，直接丢弃，不用它回滚本地。
 * 3. 本地干净的全量推送由 `readSceneUpdate` 把规范化后的远端载荷交回 stage 的 adopt 流程
 *    （保留相机 / 活动楼层 / 灯光过渡），最终由 `replaceScene` → `applyLoadedDraft` 成为
 *    新保存基线；revision 按“载荷带则用、不带则沿用”处理，绝不打回 0。
 */
export function sceneSyncFlushIsDirty(runtime: StudioAppRuntime, ): boolean {
  if (runtime.studioDocumentStore.isDirty()) return true;
  const runtimeSaveStore = runtime.studioSaveStore;
  return (
    !!runtimeSaveStore &&
    (runtimeSaveStore.hasUnsavedChanges() || runtimeSaveStore.getState().isSaveInFlight)
  );
}

export async function flushSceneSyncRuntime(runtime: StudioAppRuntime, ): Promise<"saved" | "conflict" | "failed"> {
  try {
    const sceneSyncFlushResult = await runtime.runStudioSaveOnce("autosave");
    if (sceneSyncFlushResult.ok) return "saved";
    return sceneSyncFlushResult.reason === "conflict" ||
      sceneSyncFlushResult.reason === "confirmation-required"
      ? "conflict"
      : "failed";
  } catch (sceneSyncFlushError: any) {
    window.HomeOSLog?.error!(sceneSyncFlushError, { phase: "studio-scene-sync-flush" });
    return "failed";
  }
}

export function currentSceneSyncSinceKey(runtime: StudioAppRuntime, ): string {
  if (runtime.sceneSyncSinceKey !== null) return runtime.sceneSyncSinceKey;
  return typeof runtime.appCtx.loadedDraft?.syncKey === "string" ? runtime.appCtx.loadedDraft.syncKey : "";
}

export function rememberSceneSyncKey(runtime: StudioAppRuntime, sceneUpdateResponse: any): void {
  if (typeof sceneUpdateResponse?.syncKey === "string" && sceneUpdateResponse.syncKey)
    runtime.sceneSyncSinceKey = sceneUpdateResponse.syncKey;
}

/** 非全量同步后就地刷新派生视图（不触碰保存版本线）。 */
export function refreshAfterSceneSyncOutcome(runtime: StudioAppRuntime, sceneSyncOutcome: SceneSyncOutcome) {
  if (sceneSyncOutcome.kind === "merge-floors") {
    if (sceneSyncOutcome.floorIds.length > 0) {
      const activeFloorRecord = runtime.getActiveFloor();
      if (activeFloorRecord && sceneSyncOutcome.floorIds.includes(activeFloorRecord.id))
        runtime.appCtx.studioState = activeFloorRecord.scene;
      runtime.syncFloorGroups(new Set(sceneSyncOutcome.floorIds));
      Promise.allSettled(runtime.preloadDefaultModels());
      runtime.refreshSelection();
      runtime.refreshPreviewScene();
      runtime.refreshScopeItems();
    }
    if (sceneSyncOutcome.lighting) runtime.refreshSceneSyncLightingDerived?.();
  } else if (sceneSyncOutcome.kind === "lighting-only") {
    if (sceneSyncOutcome.lighting) runtime.refreshSceneSyncLightingDerived?.();
  }
  if (
    (sceneSyncOutcome.kind === "metadata-only" ||
      sceneSyncOutcome.kind === "lighting-only" ||
      sceneSyncOutcome.kind === "merge-floors") &&
    sceneSyncOutcome.floorNameChanges.length > 0
  )
    runtime.renderFloorList();
}

export async function fetchStudioApi(runtime: StudioAppRuntime, 
  apiPath: any,
  requestOptions: StudioApiRequestOptions = {},
  responsePromise: any = null,
) {
  if (runtime.isEmbeddedStage && requestOptions.method && requestOptions.method !== "GET")
    throw new Error("交互户型为只读视图。");
  const httpResponse = await (responsePromise ||
      fetch("/api/v1" + apiPath, {
        cache: "no-store",
        ...requestOptions,
        headers: requestOptions.body
          ? {
              "Content-Type": "application/json",
              ...(requestOptions.headers || {}),
            }
          : requestOptions.headers,
      })),
    responseTextBody = httpResponse.status === 204 ? "" : await httpResponse.text();
  let errorBody: any = null;
  if (responseTextBody)
    try {
      errorBody = JSON.parse(responseTextBody);
    } catch {
      errorBody = null;
    }
  if (httpResponse.status === 401) {
    navigateInShell("/login?next=" + encodeURIComponent(window.location.pathname));
    const ru2 = new runtime.StudioApiError("登录状态已失效。", httpResponse.status, errorBody);
    throw window.HomeOSLog?.linkError!(ru2, httpResponse)! || ru2;
  }
  if (httpResponse.status === 403 && errorBody?.detail?.code === "LICENSE_RESTRICTED") {
    navigateInShell("/activate");
    const ru3 = new runtime.StudioApiError("当前授权无法使用户型图绘制。", httpResponse.status, errorBody);
    throw window.HomeOSLog?.linkError!(ru3, httpResponse)! || ru3;
  }
  if (!httpResponse.ok) {
    const errorDetail = errorBody?.detail,
      ru4 = new runtime.StudioApiError(
        typeof errorDetail == "string"
          ? errorDetail
          : errorDetail?.message || "请求失败（HTTP " + httpResponse.status + "）",
        httpResponse.status,
        errorBody,
      );
    throw window.HomeOSLog?.linkError!(ru4, httpResponse)! || ru4;
  }
  return errorBody;
}

export function showToast(runtime: StudioAppRuntime, toastMessage: any, toastKind = "") {
  // 走外壳 chrome toast（App 根挂载的 VNotification），不再操作本页 .toast DOM。
  shellNotify(String(toastMessage ?? ""), String(toastKind ?? ""));
}

export function showSaveState(runtime: StudioAppRuntime, saveStateText: any, saveStateKind = "") {
  ((runtime.saveStateElement.className = ("save-state " + saveStateKind).trim()),
    (runtime.saveStateElement.innerHTML = "<i></i>" + saveStateText));
  const mapped =
    saveStateKind === "saving"
      ? "saving"
      : saveStateKind === "error"
        ? "error"
        : saveStateKind === "saved"
          ? "saved"
          : saveStateText?.includes?.("未保存") || saveStateKind === "saving"
            ? "dirty"
            : "idle";
  patchStudioFacadeState({
    dirty: mapped === "dirty" || mapped === "saving",
    saveState: mapped as any,
    history: {
      canUndo: runtime.historyUndoDepth() > 0,
      canRedo: runtime.historyRedoDepth() > 0,
      undoDepth: runtime.historyUndoDepth(),
      redoDepth: runtime.historyRedoDepth(),
    },
    activeTool: runtime.appCtx.activeToolName,
  });
}

export function syncStudioHistoryFacade(runtime: StudioAppRuntime, ) {
  patchStudioFacadeState({
    history: buildStudioHistoryPatch(runtime.historyUndoDepth(), runtime.historyRedoDepth()),
    activeTool: runtime.appCtx.activeToolName,
  });
}

/**
 * 复制 / 粘贴按钮的可用性。
 *
 * 选择或剪贴板一变就 patch —— 但**先比对**当前 facade 值，相同则不派发：
 * `refreshStudioUi` 在一次点击里会被调多次，无脑 patch 会让壳层每个事件都整体换一份
 * state 对象，按钮的 `:disabled` 也跟着抖。剪贴板内容不参与比较（不可枚举）。
 */
export function syncStudioClipboardFacade(runtime: StudioAppRuntime) {
  const canCopy = runtime.collectSelectedPlanItems().length > 0;
  const canPaste = runtime.appCtx.clipboardItems.length > 0;
  const currentClipboard = getStudioFacadeState().clipboard;
  if (currentClipboard?.canCopy === canCopy && currentClipboard?.canPaste === canPaste) return;
  patchStudioFacadeState({ clipboard: { canCopy, canPaste } });
}

/** 撤销 / 重做：先 canApply 再出栈；失败不出栈，应用失败由历史 store 压回并回调提示。 */
export function historyFailureMessage(runtime: StudioAppRuntime, direction: "undo" | "redo", reason: string): string {
  const historyActionName = direction === "undo" ? "撤销" : "重做";
  return reason === "not-applicable"
    ? "无法" +
        historyActionName +
        "：该操作与后续改动冲突（例如合并墙上新增了门窗或栏杆）。"
    : historyActionName + "失败：历史状态已失效，未做修改。";
}

export async function undoStudioHistory(runtime: StudioAppRuntime, ) {
  await runtime.applyStudioHistoryDirection("undo");
}

export async function redoStudioHistory(runtime: StudioAppRuntime, ) {
  await runtime.applyStudioHistoryDirection("redo");
}

export async function applyStudioHistoryDirection(runtime: StudioAppRuntime, direction: "undo" | "redo") {
  const historyStore = runtime.studioHistoryStore;
  if (!historyStore) return;
  if (runtime.isStudioDraftReadonly()) {
    runtime.showToast("只读：草稿载入失败，无法撤销 / 重做。", "error");
    return;
  }
  runtime.pendingHistoryScene = null;
  // 补丁是在 `undo()` / `redo()` 内部就地应用的，所以「改前」必须提前拍快照，
  // 否则撤销重做只能保守地整屏重建（`historyChangePreviewScope` 需要前后两份场景）。
  const previousScene = captureHistoryScene(runtime);
  const historyResult = direction === "undo" ? historyStore.undo() : historyStore.redo();
  if (!historyResult.ok) {
    if (historyResult.reason !== "empty")
      runtime.showToast(runtime.historyFailureMessage(direction, historyResult.reason), "warning");
    runtime.syncStudioHistoryFacade();
    return;
  }
  runtime.refreshAfterHistoryChange(historyResult.entry.patch, previousScene);
  runtime.syncStudioHistoryFacade();
}

/** 撤销 / 重做前的场景快照；克隆失败时返回 null，调用方退回整屏重建。 */
function captureHistoryScene(runtime: StudioAppRuntime): Record<string, unknown> | null {
  const scene = runtime.appCtx.studioState;
  if (!scene) return null;
  try {
    return structuredClone(scene) as unknown as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** 补丁影响到的楼层 id（batch 递归展开），用于刷新楼层缩略图与楼层组。 */
export function collectPatchFloorIds(runtime: StudioAppRuntime, 
  documentPatch: DocumentPatch,
  affectedFloorIds = new Set<string>(),
): Set<string> {
  if (documentPatch.kind === "batch") {
    for (const nestedPatch of documentPatch.patches)
      runtime.collectPatchFloorIds(nestedPatch, affectedFloorIds);
    return affectedFloorIds;
  }
  if (documentPatch.floorId) affectedFloorIds.add(documentPatch.floorId);
  return affectedFloorIds;
}

/** 合并墙保护：撤销会改写活动楼层的墙，而当前墙上已有新增门窗 / 栏杆时判定不可应用。 */
export function canApplyHistoryPatch(runtime: StudioAppRuntime, documentPatch: DocumentPatch): boolean {
  try {
    const currentProject = runtime.appCtx.studioProject;
    if (!currentProject || !canApplyDocumentPatch(currentProject, documentPatch)) return false;
    const targetProject = structuredClone(currentProject);
    if (!applyDocumentPatch(targetProject, documentPatch)) return false;
    const activeFloor = runtime.getActiveFloor();
    const targetFloor = targetProject.floors?.find(
      (floorRecord: any) => floorRecord.id === (activeFloor?.id ?? runtime.appCtx.activeFloorId),
    );
    if (!activeFloor?.scene || !targetFloor?.scene) return true;
    const targetWallById = new Map<string, any>(
      (targetFloor.scene.walls || []).map((targetWall: any) => [targetWall.id, targetWall]),
    );
    const changedWallIds = new Set<string>();
    for (const currentWall of activeFloor.scene.walls || []) {
      const targetWall = targetWallById.get(currentWall?.id);
      if (
        targetWall &&
        (targetWall.start?.x !== currentWall.start?.x ||
          targetWall.start?.y !== currentWall.start?.y ||
          targetWall.end?.x !== currentWall.end?.x ||
          targetWall.end?.y !== currentWall.end?.y)
      )
        changedWallIds.add(currentWall.id);
    }
    if (!changedWallIds.size) return true;
    for (const attachmentKey of ["windows", "doors", "railings"]) {
      const targetAttachmentIds = new Set(
        (targetFloor.scene[attachmentKey] || []).map((attachmentRecord: any) => attachmentRecord.id),
      );
      if (
        (activeFloor.scene[attachmentKey] || []).some(
          (attachmentRecord: any) =>
            changedWallIds.has(attachmentRecord.wallId) &&
            !targetAttachmentIds.has(attachmentRecord.id),
        )
      )
        return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * 历史补丁已就地改完文档，这里只同步运行时派生视图（活动楼层场景 / 旋转 / 预览 / 楼层组）。
 *
 * `previousScene` 是补丁应用**之前**的活动楼层场景快照。有了它就能按
 * `historyChangePreviewScope` 精确决定重绘范围：只改备注 / 选择 → `'none'`，改了灯 → `'lights'`，
 * 改了物品 → `'items'`；拿不到快照或判定不出来时退回 `'all'`（保守）。
 */
export function refreshAfterHistoryChange(
  runtime: StudioAppRuntime,
  documentPatch: DocumentPatch,
  previousScene?: Record<string, unknown> | null,
) {
  const affectedFloorIds = runtime.collectPatchFloorIds(documentPatch);
  const activeFloor = runtime.getActiveFloor();
  if (activeFloor && affectedFloorIds.has(activeFloor.id)) {
    runtime.appCtx.studioState = activeFloor.scene;
    runtime.appCtx.planView.rotation =
      runtime.appCtx.studioState?.settings?.planViewRotation ?? runtime.appCtx.planView.rotation;
  }
  (runtime.selectStudioTool("select"),
    runtime.refreshSelection(),
    runtime.refreshPreviewScene(),
    runtime.refreshScopeItems(resolveHistoryPreviewScope(runtime, previousScene)),
    void runtime.loadBackgroundImage(),
    runtime.syncFloorGroups(affectedFloorIds),
    runtime.renderFloorList(),
    runtime.markDocumentDirty());
}

/** 撤销 / 重做需要重绘的作用域；快照缺失或判定失败时保守返回 `'all'`。 */
export function resolveHistoryPreviewScope(
  runtime: StudioAppRuntime,
  previousScene?: Record<string, unknown> | null,
): PreviewScope {
  const nextScene = runtime.appCtx.studioState as unknown as Record<string, unknown> | undefined;
  if (!previousScene || !nextScene) return "all";
  try {
    const options = previewScopeOptions(runtime);
    return historyChangePreviewScope(previousScene, nextScene, {
      itemScope: (item) => itemPreviewScope(item, options),
      selectionScope: () => runtime.getCurrentPreviewScope(),
    });
  } catch {
    return "all";
  }
}

export function validateSelectionChange(runtime: StudioAppRuntime, placementChange: any) {
  const placementError = validatePlacementChange2(
    placementChange,
    runtime.appCtx.studioState,
    runtime.getPixelsPerMeter() || 100,
  );
  return placementError
    ? (runtime.showToast(placementError, "error"),
      runtime.appCtx.selectedItem && !runtime.getSelectedObject() && runtime.refreshSelection(),
      (runtime.appCtx.selectedItems = runtime.appCtx.selectedItems.filter(
        (selectionEntry: any) =>
          selectionEntry.kind !== "item" ||
          runtime.appCtx.studioState.items.some((selectedItemMatch) => selectedItemMatch.id === selectionEntry.id),
      )),
      false)
    : true;
}

/** 编辑前快照：同一楼层只保留最早一份（一次操作 = 一个事务）；切楼层后按新楼层重挂。 */
export function primeHistorySnapshot(runtime: StudioAppRuntime, snapshotScene: any = undefined) {
  const floorId = runtime.getActiveFloor()?.id ?? runtime.appCtx.activeFloorId;
  if (!floorId) return;
  if (runtime.pendingHistoryScene?.floorId === floorId) return;
  runtime.pendingHistoryScene = {
    floorId,
    scene: snapshotScene === undefined ? runtime.captureUndoSnapshot() : snapshotScene,
  };
}

export function deselectAll(runtime: StudioAppRuntime, ) {
  runtime.primeHistorySnapshot();
}

export function applyPlacementChange(runtime: StudioAppRuntime, undoSnapshot: any) {
  runtime.primeHistorySnapshot(undoSnapshot);
}

/** markDocumentDirty 时把「编辑前快照 → 当前文档」的差异记成一条历史；纯选择没有 diff 条目。 */
export function flushPendingHistory(runtime: StudioAppRuntime, ) {
  const pendingSnapshot = runtime.pendingHistoryScene;
  runtime.pendingHistoryScene = null;
  const historyStore = runtime.studioHistoryStore;
  if (!pendingSnapshot || !historyStore) return;
  const currentProject = runtime.appCtx.studioProject;
  if (!currentProject?.floors?.some((floorRecord: any) => floorRecord.id === pendingSnapshot.floorId))
    return;
  let beforeDocument: any;
  try {
    beforeDocument = structuredClone(currentProject);
  } catch {
    return;
  }
  const beforeFloor = beforeDocument.floors.find(
    (floorRecord: any) => floorRecord.id === pendingSnapshot.floorId,
  );
  if (!beforeFloor) return;
  beforeFloor.scene = pendingSnapshot.scene;
  const documentPatch = diffDocumentPatches(beforeDocument, currentProject);
  if (!documentPatch) return;
  historyStore.record(documentPatch, describeDocumentPatch(documentPatch));
  runtime.syncStudioHistoryFacade();
}

export async function restoreSnapshot(runtime: StudioAppRuntime, snapshotDocument: any) {
  /**
   * 合并墙保护：恢复删除备份前，若恢复会改写一面当前仍存在的墙，
   * 而当前场景在这面墙上新增了门窗或栏杆（不在备份的 attachmentIds 内），
   * 说明合并墙在备份之后又发生变化，此时拒绝恢复，提示先撤销这些改动。
   */
  const backupWallById = new Map<string, any>(
      (snapshotDocument.walls || []).map((backupWall: any) => [backupWall.id, backupWall]),
    ),
    changedWallIds = new Set(
      (runtime.appCtx.studioState.walls || [])
        .filter((currentWall) => {
          const backupWall = backupWallById.get(currentWall.id);
          return (
            backupWall &&
            (backupWall.start.x !== currentWall.start.x ||
              backupWall.start.y !== currentWall.start.y ||
              backupWall.end.x !== currentWall.end.x ||
              backupWall.end.y !== currentWall.end.y)
          );
        })
        .map((currentWall) => currentWall.id),
    );
  if (changedWallIds.size)
    for (const attachmentKey of ["windows", "doors", "railings"]) {
      const backupAttachmentIds = new Set(
        (snapshotDocument[attachmentKey] || []).map((attachmentRecord: any) => attachmentRecord.id),
      );
      if (
        ((runtime.appCtx.studioState as any)[attachmentKey] || []).some(
          (attachmentRecord: any) =>
            changedWallIds.has(attachmentRecord.wallId) &&
            !backupAttachmentIds.has(attachmentRecord.id),
        )
      )
        throw new Error("合并墙上已有新增门窗或栏杆，请先撤销这些改动，再撤销删除。");
    }
  (runtime.selectStudioTool("select"), (runtime.appCtx.studioState = normalizeScenePayload(snapshotDocument, runtime.externalModelRegistry)));
  const ae6 = runtime.getActiveFloor();
  (ae6 && (ae6.scene = runtime.appCtx.studioState),
    (runtime.appCtx.planView.rotation = runtime.appCtx.studioState.settings.planViewRotation),
    runtime.refreshSelection(),
    runtime.refreshPreviewScene(),
    await runtime.loadBackgroundImage(),
    runtime.refreshScopeItems(),
    runtime.markDocumentDirty());
}

export function markDocumentDirty(runtime: StudioAppRuntime, ) {
  if (runtime.isEmbeddedStage) {
    runtime.pendingHistoryScene = null;
    return;
  }
  if (runtime.isStudioDraftReadonly()) {
    runtime.pendingHistoryScene = null;
    runtime.showSaveState("只读：草稿载入失败，修改不会保存", "error");
    return;
  }
  // C5：编辑真正落地时才把编辑前快照 diff 成 DocumentPatch 入栈。
  runtime.flushPendingHistory();
  (syncCourtyardGates2(runtime.appCtx.studioState.items, runtime.getPixelsPerMeter() || 100),
    (runtime.appCtx.isExporting = false),
    (runtime.appCtx.localSaveRevision += 1),
    (runtime.appCtx.firstLocalChangeAt ??= Date.now()),
    (runtime.appCtx.lastLocalChangeAt = Date.now()),
    // C3：版本权威在 document store；marked 不产生补丁，但必须让 isDirty 为真。
    runtime.studioDocumentStore.markWholeDocumentDirty(),
    runtime.getStudioSaveStore().markDirty(),
    runtime.showSaveState("有未保存修改", "saving"),
    runtime.scheduleAutosave(),
    refreshStepChecklist(runtime.appCtx));
}

export function recordSaveConflict(runtime: StudioAppRuntime, conflictLatest: any, conflictLocalScene: any, conflictTargetVersion: any) {
  ((runtime.appCtx.pendingConflict = {
    latest: conflictLatest,
    localScene: conflictLocalScene,
    targetVersion: conflictTargetVersion,
  }),
    runtime.showSaveState("等待处理保存冲突", "error"),
    runtime.saveConflictDialogElement.open || runtime.saveConflictDialogElement.showModal());
}

/** 保存失败后的重试状态复位（重试次数、重试到期时间、非重试性失败锁定版本）。 */
export function resetSaveRetryState(runtime: StudioAppRuntime, ) {
  ((runtime.appCtx.saveFailureRetryCount = 0), (runtime.appCtx.saveRetryDueAt = 0), (runtime.appCtx.failedSaveRevision = -1));
}

/** 自动保存调度：宿主只保留闸门，防抖 / 首次 15s 兜底 / 退避重试全部交给 save-store。 */
export function scheduleAutosave(runtime: StudioAppRuntime, explicitDelayMs?: number) {
  const pendingSaveStore = runtime.studioSaveStore;
  if (
    runtime.isEmbeddedStage ||
    runtime.appCtx.isPageSuspended ||
    navigator.onLine === false ||
    !runtime.appCtx.loadedDraft ||
    runtime.isStudioDraftReadonly() ||
    !pendingSaveStore ||
    !runtime.studioDocumentStore.isDirty() ||
    pendingSaveStore.getState().isSaveInFlight ||
    pendingSaveStore.getState().status === "conflict" ||
    pendingSaveStore.getState().status === "blocked" ||
    runtime.studioExitDialogElement.open
  )
    return;
  if (document.hidden && pendingSaveStore.getState().nextRetryAt !== null) return;
  pendingSaveStore.scheduleAutosave(explicitDelayMs);
}

/** 交互（平面拖拽 / 渲染抑制 / 庭院绘制）结束后：释放退出等待者，并补一次被推迟的自动保存。 */
export function handleInteractionEnded(runtime: StudioAppRuntime, ) {
  if (!runtime.isInteractionBusy()) {
    for (const exitWaiter of runtime.exitWaiterResolvers) exitWaiter();
    (runtime.exitWaiterResolvers.clear(),
      runtime.appCtx.isInteractionDeferredSave && ((runtime.appCtx.isInteractionDeferredSave = false), runtime.scheduleAutosave()));
  }
}

export function isInteractionBusy(runtime: StudioAppRuntime, ) {
  return runtime.appCtx.isWindowHidden || runtime.appCtx.isRenderSuppressed || !!runtime.planPainter?.isDragging?.();
}

/** 退出前的未保存判定：以 save-store / document-store 为权威；只读载入失败时不谎报待保存。 */
export function hasUnsavedChanges(runtime: StudioAppRuntime, ) {
  const pendingSaveStore = runtime.studioSaveStore;
  const saveState = pendingSaveStore?.getState();
  return (
    runtime.appCtx.isExportPresetDirty ||
    !!runtime.appCtx.marqueeBox?.moved ||
    !!runtime.planPainter?.hasPendingChange?.() ||
    !!(
      pendingSaveStore &&
      (pendingSaveStore.hasUnsavedChanges() ||
        saveState?.isSaveInFlight ||
        saveState?.status === "conflict")
    )
  );
}

export function refreshExitDialogButtons(runtime: StudioAppRuntime, ) {
  const isSavingNow = !!runtime.appCtx.isSaveInFlight || !!runtime.studioSaveStore?.getState().isSaveInFlight;
  ((runtime.studioExitSaveButton.disabled = runtime.appCtx.isExitSaveInFlight),
    (runtime.studioExitDiscardButton.disabled = isSavingNow || runtime.appCtx.isExitSaveInFlight),
    (runtime.studioExitSaveButton.textContent = runtime.appCtx.isExitSaveInFlight ? "正在保存…" : "保存并退出"));
}

/** 「继续编辑」/ Esc：作废当前退出请求，释放等待者并关闭对话框。 */
export function closeExitDialog(runtime: StudioAppRuntime, ) {
  ((runtime.appCtx.exitSaveRequestId += 1), (runtime.appCtx.isExitSaveInFlight = false));
  for (const exitWaiter of runtime.exitWaiterResolvers) exitWaiter();
  (runtime.exitWaiterResolvers.clear(),
    runtime.studioExitDialogElement.close(),
    runtime.refreshExitDialogButtons(),
    runtime.scheduleAutosave());
}

/** 「不保存并退出」：标记离开状态并跳转回编辑器。 */
export function leaveStudio(runtime: StudioAppRuntime, ) {
  ((runtime.appCtx.isLeavingStudio = true),
    window.clearTimeout(runtime.appCtx.autosaveTimeoutId),
    (runtime.appCtx.autosaveTimeoutId = null),
    navigateInShell(runtime.studioBackLinkElement.href));
}

/**
 * 立即保存（自动保存 / 退出 / 手动保存共用）：闸门在本文件，状态机与退避在 save-store。
 * 在途 PUT 由 save-store 去重；409 / 428 的结果统一在 settleStudioSaveResult 里处理。
 */
export async function flushAutosave(runtime: StudioAppRuntime, ): Promise<void> {
  if (
    runtime.isEmbeddedStage ||
    runtime.appCtx.isPageSuspended ||
    !runtime.appCtx.loadedDraft ||
    runtime.isStudioDraftReadonly()
  )
    return;
  if (runtime.isInteractionBusy()) {
    runtime.appCtx.isInteractionDeferredSave = true;
    return;
  }
  runtime.appCtx.isInteractionDeferredSave = false;
  (window.clearTimeout(runtime.appCtx.autosaveTimeoutId), (runtime.appCtx.autosaveTimeoutId = null));
  try {
    await runtime.runStudioSaveOnce("autosave");
  } finally {
    for (const saveWaiter of runtime.saveWaiterResolvers) saveWaiter();
    (runtime.saveWaiterResolvers.clear(), runtime.scheduleAutosave());
  }
}

export function planToScreen(runtime: StudioAppRuntime, planPointInput: any) {
  return {
    x: planPointInput.x * runtime.appCtx.planView.zoom + runtime.appCtx.planView.offsetX,
    y: planPointInput.y * runtime.appCtx.planView.zoom + runtime.appCtx.planView.offsetY,
  };
}

export function screenToPlanPoint(runtime: StudioAppRuntime, screenPointInput: any) {
  const halfViewWidth = runtime.appCtx.planViewWidth / 2,
    halfViewHeight = runtime.appCtx.planViewHeight / 2,
    viewRotationRadians = (-runtime.appCtx.planView.rotation * Math.PI) / 180,
    cos = Math.cos(viewRotationRadians),
    sin = Math.sin(viewRotationRadians),
    centeredX = screenPointInput.x - halfViewWidth,
    centeredY = screenPointInput.y - halfViewHeight;
  return {
    x: halfViewWidth + centeredX * cos - centeredY * sin,
    y: halfViewHeight + centeredX * sin + centeredY * cos,
  };
}

export function screenToPlan(runtime: StudioAppRuntime, screenPoint: any) {
  const nl2 = runtime.screenToPlanPoint(screenPoint);
  return {
    x: (nl2.x - runtime.appCtx.planView.offsetX) / runtime.appCtx.planView.zoom,
    y: (nl2.y - runtime.appCtx.planView.offsetY) / runtime.appCtx.planView.zoom,
  };
}

export function eventToLocalPoint(runtime: StudioAppRuntime, pointerEventArg: any) {
  const boundingClientRect = runtime.planCanvasElement.getBoundingClientRect();
  return {
    x: pointerEventArg.clientX - boundingClientRect.left,
    y: pointerEventArg.clientY - boundingClientRect.top,
  };
}

export function getCanvasSize(runtime: StudioAppRuntime, ) {
  return sceneContentBounds2(runtime.appCtx.studioState);
}

export function resetView(runtime: StudioAppRuntime, ) {
  const ey2 = runtime.getCanvasSize(),
    viewPadding = clamp2(Math.min(runtime.appCtx.planViewWidth, runtime.appCtx.planViewHeight) * 0.045, 18, 34),
    availableWidth = Math.max(runtime.appCtx.planViewWidth - viewPadding * 2, 80),
    availableHeight = Math.max(runtime.appCtx.planViewHeight - viewPadding * 2, 80),
    isQuarterTurn = Math.abs(runtime.appCtx.planView.rotation / 90) % 2 === 1,
    height2 = isQuarterTurn ? ey2.height : ey2.width,
    width2 = isQuarterTurn ? ey2.width : ey2.height;
  ((runtime.appCtx.planView.zoom = clamp2(Math.min(availableWidth / height2, availableHeight / width2), 0.03, 8)),
    (runtime.appCtx.planView.offsetX = runtime.appCtx.planViewWidth / 2 - (ey2.minX + ey2.width / 2) * runtime.appCtx.planView.zoom),
    (runtime.appCtx.planView.offsetY = runtime.appCtx.planViewHeight / 2 - (ey2.minY + ey2.height / 2) * runtime.appCtx.planView.zoom),
    (runtime.appCtx.isAutoFitRequested = true),
    runtime.refreshStudioView());
}

export function zoomByScale(runtime: StudioAppRuntime, 
  zoomScale: any,
  zoomScreenPoint = {
    x: runtime.appCtx.planViewWidth / 2,
    y: runtime.appCtx.planViewHeight / 2,
  },
) {
  const pr2 = runtime.screenToPlan(zoomScreenPoint),
    nl3 = runtime.screenToPlanPoint(zoomScreenPoint);
  ((runtime.appCtx.planView.zoom = clamp2(runtime.appCtx.planView.zoom * zoomScale, 0.03, 12)),
    (runtime.appCtx.planView.offsetX = nl3.x - pr2.x * runtime.appCtx.planView.zoom),
    (runtime.appCtx.planView.offsetY = nl3.y - pr2.y * runtime.appCtx.planView.zoom),
    runtime.refreshStudioView());
}

export function rotatePlanView(runtime: StudioAppRuntime, ) {
  ((runtime.appCtx.planView.rotation = (runtime.appCtx.planView.rotation + 90) % 360),
    (runtime.appCtx.studioState.settings.planViewRotation = runtime.appCtx.planView.rotation),
    runtime.resetView(),
    runtime.markDocumentDirty());
}

export function resizePlanStage(runtime: StudioAppRuntime, ) {
  const planStageRect = runtime.planStageElement.getBoundingClientRect();
  ((runtime.appCtx.planViewWidth = Math.max(Math.round(planStageRect.width), 1)),
    (runtime.appCtx.planViewHeight = Math.max(Math.round(planStageRect.height), 1)));
  const min = Math.min(window.devicePixelRatio || 1, 2);
  ((runtime.planCanvasElement.width = Math.round(runtime.appCtx.planViewWidth * min)),
    (runtime.planCanvasElement.height = Math.round(runtime.appCtx.planViewHeight * min)),
    runtime.planCanvasRenderer.setTransform(min, 0, 0, min, 0, 0),
    runtime.appCtx.isAutoFitRequested ? runtime.refreshStudioView() : runtime.resetView());
}

export function buildSnapIndex(runtime: StudioAppRuntime, snapTolerancePx: any) {
  const snapTolerance = Math.max(1, snapTolerancePx * 0.01),
    join = runtime.appCtx.studioState.walls
      .map(
        (snapWallRecord) =>
          snapWallRecord.id +
          "," +
          snapWallRecord.start.x +
          "," +
          snapWallRecord.start.y +
          "," +
          snapWallRecord.end.x +
          "," +
          snapWallRecord.end.y +
          "," +
          snapWallRecord.thickness +
          "," +
          (snapWallRecord.allowOpenEnd === true ? 1 : 0),
      )
      .join(";");
  let cachedSnapIndex = runtime.wallJoinCacheByWall.get(runtime.appCtx.studioState);
  return (
    (!cachedSnapIndex || cachedSnapIndex.signature !== snapTolerance + "|" + join) &&
      ((cachedSnapIndex = {
        signature: snapTolerance + "|" + join,
        tolerance: snapTolerance,
        floorPolygons: null as any,
        intersections: null as any,
        joinExtensions: null as any,
        unclosedEndpoints: null as any,
      }),
      runtime.wallJoinCacheByWall.set(runtime.appCtx.studioState, cachedSnapIndex)),
    cachedSnapIndex
  );
}

export function closedWallLoops(runtime: StudioAppRuntime, wallLoopList: any) {
  const _l2 = runtime.buildSnapIndex(wallLoopList);
  return (
    (_l2.floorPolygons ||= closedWallFloorPolygons2(runtime.appCtx.studioState.walls, _l2.tolerance)),
    _l2.floorPolygons
  );
}

export function computeWallIntersections(runtime: StudioAppRuntime, intersectWallList: any) {
  const _l3 = runtime.buildSnapIndex(intersectWallList);
  return ((_l3.intersections ||= wallIntersections2(runtime.appCtx.studioState.walls)), _l3.intersections);
}

export function computeSurfaceExclusions(runtime: StudioAppRuntime, exclusionWallList: any) {
  const _l4 = runtime.buildSnapIndex(exclusionWallList);
  return ((_l4.joinExtensions ||= wallJoinExtensions2(runtime.appCtx.studioState.walls)), _l4.joinExtensions);
}

export function computeWallPolygons(runtime: StudioAppRuntime, polygonWallList: any) {
  const _l5 = runtime.buildSnapIndex(polygonWallList);
  return (
    (_l5.unclosedEndpoints ||= unclosedWallEndpoints2(
      runtime.appCtx.studioState.walls,
      _l5.tolerance,
      runtime.closedWallLoops(polygonWallList),
    )),
    _l5.unclosedEndpoints
  );
}

export function wallWindowSpan(runtime: StudioAppRuntime, windowRecord: any) {
  const owningWall = runtime.appCtx.studioState.walls.find((wallMatch) => wallMatch.id === windowRecord.wallId);
  if (!owningWall) return null;
  const wallDeltaX = owningWall.end.x - owningWall.start.x,
    wallDeltaY = owningWall.end.y - owningWall.start.y,
    hypot = Math.hypot(wallDeltaX, wallDeltaY);
  if (!hypot) return null;
  const windowClampT = clampWindowT2(owningWall, windowRecord, runtime.getPixelsPerMeter() || 1),
    windowCenterPoint = {
      x: owningWall.start.x + wallDeltaX * windowClampT,
      y: owningWall.start.y + wallDeltaY * windowClampT,
    },
    windowHalfWidth = Math.min((windowRecord.width * (runtime.getPixelsPerMeter() || 1)) / 2, hypot / 2),
    wallUnitVector = {
      x: wallDeltaX / hypot,
      y: wallDeltaY / hypot,
    };
  return {
    wall: owningWall,
    center: windowCenterPoint,
    start: {
      x: windowCenterPoint.x - wallUnitVector.x * windowHalfWidth,
      y: windowCenterPoint.y - wallUnitVector.y * windowHalfWidth,
    },
    end: {
      x: windowCenterPoint.x + wallUnitVector.x * windowHalfWidth,
      y: windowCenterPoint.y + wallUnitVector.y * windowHalfWidth,
    },
    unit: wallUnitVector,
  };
}

export function drawRailing(runtime: StudioAppRuntime, railingRecord: any, railingView: PlanEditPreviewFlags = {}) {
  const xo2 = runtime.wallWindowSpan(railingRecord);
  if (!xo2) return;
  const railingSelected = runtime.createSelectionRef("railing", railingRecord.id),
    railingColor = railingView.preview
      ? "rgba(123, 220, 240, .72)"
      : railingSelected
        ? "#ffaf46"
        : "#8bd7e8",
    railingLineWidth = Math.max(
      10,
      xo2.wall.thickness * (runtime.getPixelsPerMeter() || 100) * runtime.appCtx.planView.zoom + 5,
    );
  (runtime.drawGuideSegment(xo2.start, xo2.end, {
    color: "rgba(7, 16, 21, .94)",
    width: railingLineWidth,
    cap: "butt",
  }),
    runtime.drawGuideSegment(xo2.start, xo2.end, {
      color: railingColor,
      width: railingSelected ? 5 : 3,
      cap: "butt",
    }),
    runtime.drawGuideSegment(xo2.start, xo2.end, {
      color: "rgba(224, 250, 255, .72)",
      width: 1,
      cap: "butt",
    }),
    runtime.drawPointMarker(xo2.start, railingColor, railingSelected ? 3 : 2),
    runtime.drawPointMarker(xo2.end, railingColor, railingSelected ? 3 : 2),
    railingSelected &&
      !railingView.preview &&
      runtime.drawLabelText(xo2.center, "玻璃栏杆 · " + railingRecord.width.toFixed(2) + " m", "#8bd7e8"));
}

/** 抬亮上限：抬到这个比例还没达标就认了，免得把颜色冲成纯白、丢掉档位辨识度。 */

/** WCAG 口径的相对亮度（sRGB → 线性）。 */

/** 平面图这扇门用哪块料代表（取「最占视线」的部件； */

/** 平面图门色：**与 3D 同一条取色链**（档位配方 → 主题键 → 逐门覆盖色）。 */
export function rotateLocalPoint(runtime: StudioAppRuntime, originPoint: any, localOffsetX: any, localOffsetY: any) {
  const rotationRad = ((Number(originPoint.rotation) || 0) * Math.PI) / 180;
  return {
    x: originPoint.x + localOffsetX * Math.cos(rotationRad) - localOffsetY * Math.sin(rotationRad),
    y: originPoint.y + localOffsetX * Math.sin(rotationRad) + localOffsetY * Math.cos(rotationRad),
  };
}

export function buildHandleGeometry(runtime: StudioAppRuntime, geometryItem: any) {
  const handlePixelsPerMeter = runtime.getPixelsPerMeter() || 100,
    handleFootprint = itemPlanFootprint2(geometryItem),
    halfItemWidth = (handleFootprint.width * handlePixelsPerMeter) / 2,
    halfItemDepth = (handleFootprint.depth * handlePixelsPerMeter) / 2;
  return {
    corners: [
      {
        x: -1,
        y: -1,
      },
      {
        x: 1,
        y: -1,
      },
      {
        x: 1,
        y: 1,
      },
      {
        x: -1,
        y: 1,
      },
    ].map((handleDirections) => ({
      ...handleDirections,
      point: runtime.rotateLocalPoint(
        geometryItem,
        handleDirections.x * halfItemWidth,
        handleDirections.y * halfItemDepth,
      ),
      opposite: runtime.rotateLocalPoint(
        geometryItem,
        -handleDirections.x * halfItemWidth,
        -handleDirections.y * halfItemDepth,
      ),
    })),
    rotationStem: runtime.rotateLocalPoint(geometryItem, 0, -halfItemDepth),
    rotationHandle: runtime.rotateLocalPoint(
      geometryItem,
      0,
      -halfItemDepth - 17 / Math.max(runtime.appCtx.planView.zoom, 0.01),
    ),
  };
}
