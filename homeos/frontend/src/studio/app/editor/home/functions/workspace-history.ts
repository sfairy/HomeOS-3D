/* 工作区与历史（渲染器、画布缩放、撤销历史、恢复快照、草稿） */
import type { EditorContext } from "../editor-context";
import { type AlignMode, computeAlignedPositions } from "../../editor-selection-tools";
import { findComponent as findComponent2 } from "../../component-tree";
import { PanelRenderer as PanelRenderer2 } from "../../../renderer/panel-renderer";
import { duplicateComponent } from "../../editor-component-collections";
import { roundField as roundField2, clone as clone2 } from "../../editor-utils";
import { patchEditorFacadeState } from "../../../../engine";
import { applyEditorZoomCss } from "../../editor-canvas-navigation";
import { recoveryStorageKey as recoveryStorageKey2, documentSignature as documentSignature2 } from "../../editor-history";
import { clearCoverMotorDirectionValueById } from "../../home-cover-motor-inspector";
import { nasProfiles as nasProfiles2, reconcileNasDocument as reconcileNasDocument2 } from "../../../bridge/catalog/nas-catalog";
import { rememberEditorProject as rememberEditorProject2, restoredEditorProject as restoredEditorProject2 } from "../../editor-document-management";
import { guardInteraction3dChanges as guardInteraction3dChanges2 } from "../../../bridge/editor";
import { confirmAction } from "../../../shared/ui-confirm";
import { validateGo2rtcDocument } from "@/studio/platform/go2rtc-url";

export interface WorkspaceHistoryDeps {
  editorCtx: EditorContext;
  MAX_HISTORY_ENTRIES: any;
  RECOVERY_STORAGE_PREFIX: any;
  airConditionerAirflowOffsetXElement: any;
  airConditionerAirflowOffsetYElement: any;
  airConditionerAirflowRotationElement: any;
  airConditionerAirflowScaleElement: any;
  airConditionerBaselineByComponentId: any;
  applyTransformToInspector: any;
  clearComponentSelection: any;
  collectChangedComponents: any;
  collectPageComponentBounds: (...args: any[]) => any[];
  coverMotorButtonElement: any;
  currentPage: any;
  dashboardPreviewElement: any;
  discardRecoverySnapshot: any;
  editorCanvasElement: any;
  ensureEditorRenderer: any;
  ensureEntitiesLoaded: any;
  entryStateRecord: any;
  handleOperationError: any;
  historyEntries: any;
  historyEntry: any;
  historySeriesCacheById: any;
  historyState: any;
  iconButtonBaselineByComponentId: any;
  iconButtonEffectBaselineByComponentId: any;
  interaction3dEntryActive: any;
  lineChartBaselineByComponentId: any;
  loadHaConnection: any;
  loadNavigationIconOptions: any;
  mutateDocument: any;
  navigationButtonSavedSettingsByComponentId: any;
  navigationLabelTextInputElement: any;
  onImageAssetUploadButtonClick: any;
  pageSelectElement: any;
  panelFrameBaselineByComponentId: any;
  popupActionsButtonElement: any;
  popupListElement: any;
  popupSelectElement: any;
  projectSelectElement: any;
  projectSummary: any;
  readRecoverySnapshot: any;
  recoverDraftConflict: any;
  recoveryDialogElement: any;
  recoveryWriter: any;
  redoElement: any;
  refreshDirtyState: any;
  refreshSoundToggle: any;
  removedComponent: any;
  renderComponentLists: any;
  renderCustomPopupEditor: any;
  renderEditorWorkspace: any;
  renderPageSelect: any;
  renderWorkspaceResolution: any;
  requestJson: any;
  resizeWorkspaceCanvas: any;
  retainExistingSelection: any;
  runCase: any;
  runExtraLower: any;
  runExtraOld: any;
  runExtraOuter: any;
  runKey: any;
  runSlot: any;
  runZone: any;
  runtimeStateCacheById: any;
  saveButtonElement: any;
  saveDraft: any;
  scheduleRecoverySnapshot: any;
  setPageControlsEnabled: any;
  syncHistoryButtons: any;
  undoElement: any;
  virtualEntityStateCacheById: any;
  writeError: any;
}

export function collectPageComponentBounds(deps: WorkspaceHistoryDeps): Array<{
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}> {
  const page = deps.currentPage();
  return (page?.components || [])
    .map((componentEntry: any) => ({
      id: componentEntry.id,
      x: Number(componentEntry.position?.x || 0),
      y: Number(componentEntry.position?.y || 0),
      width: Number(componentEntry.position?.width || 100),
      height: Number(componentEntry.position?.height || 100),
    }))
    .filter((bounds: any) => bounds.id);
}

export function alignSelectedComponents(deps: WorkspaceHistoryDeps, mode: AlignMode) {
  const selectedBounds = deps.collectPageComponentBounds().filter((bounds) =>
    deps.editorCtx.selectedComponentIdsSet.has(bounds.id),
  );
  const nextPositions = computeAlignedPositions(selectedBounds, mode);
  if (!nextPositions.length) return;
  deps.mutateDocument((alignDocument: any) => {
    for (const position of nextPositions) {
      const component = findComponent2(alignDocument, position.id)?.component;
      if (!component) continue;
      component.position = {
        ...(component.position || {}),
        x: position.x,
        y: position.y,
      };
    }
  });
}

export function ensureEditorRenderer(deps: WorkspaceHistoryDeps) {
  return (
    deps.editorCtx.editorRenderer ||
    ((deps.editorCtx.editorRenderer = new PanelRenderer2(deps.editorCanvasElement, {
      editable: true,
      editorWorkspace: true,
      historySeriesCache: deps.historySeriesCacheById,
      runtimeStateCache: deps.runtimeStateCacheById,
      virtualEntityStateCache: deps.virtualEntityStateCacheById,
      onSelectionChange(nextIds: string[], primaryId: string | null) {
        deps.editorCtx.selectedComponentIdsSet = new Set(nextIds || []);
        deps.editorCtx.selectedComponentId = primaryId || null;
        deps.editorCtx.selectionAnchorComponentId = deps.editorCtx.selectedComponentId;
        deps.renderComponentLists();
        deps.coverMotorButtonElement();
        deps.syncHistoryButtons();
      },
      onComponentTransform(transformedComponentId: any, componentTransform: any) {
        ((deps.editorCtx.selectedComponentId = transformedComponentId),
          (deps.editorCtx.selectedComponentIdsSet = new Set([transformedComponentId])),
          deps.mutateDocument((transformDocument: any) => {
            const draftComponent = findComponent2(
              transformDocument,
              transformedComponentId,
            )?.component;
            if (!draftComponent) return;
            const $e2 = deps.entryStateRecord(draftComponent, "width"),
              $e3 = deps.entryStateRecord(draftComponent, "height"),
              $e4 = deps.entryStateRecord(draftComponent, "scale"),
              $e5 = deps.entryStateRecord(draftComponent, "rotation"),
              {
                scale: nextScale,
                airflowOffsetX: nextAirflowOffsetX,
                airflowOffsetY: nextAirflowOffsetY,
                ...positionPatch
              } = componentTransform;
            ((draftComponent.position = {
              ...(draftComponent.position || {}),
              ...positionPatch,
            }),
              Number.isFinite(nextScale) &&
                (draftComponent.style = {
                  ...(draftComponent.style || {}),
                  scale: nextScale,
                }),
              draftComponent.type === "air-conditioner" &&
                (Number.isFinite(nextAirflowOffsetX) || Number.isFinite(nextAirflowOffsetY)) &&
                (draftComponent.properties = {
                  ...(draftComponent.properties || {}),
                  ...(Number.isFinite(nextAirflowOffsetX)
                    ? {
                        airflowOffsetX: nextAirflowOffsetX,
                      }
                    : {}),
                  ...(Number.isFinite(nextAirflowOffsetY)
                    ? {
                        airflowOffsetY: nextAirflowOffsetY,
                      }
                    : {}),
                }),
              deps.navigationLabelTextInputElement(draftComponent) &&
                Number.isFinite(componentTransform.width) &&
                deps.onImageAssetUploadButtonClick(
                  transformedComponentId,
                  "width",
                  $e2,
                  deps.entryStateRecord(draftComponent, "width"),
                ),
              deps.navigationLabelTextInputElement(draftComponent) &&
                Number.isFinite(componentTransform.height) &&
                deps.onImageAssetUploadButtonClick(
                  transformedComponentId,
                  "height",
                  $e3,
                  deps.entryStateRecord(draftComponent, "height"),
                ),
              deps.navigationLabelTextInputElement(draftComponent) &&
                Number.isFinite(componentTransform.scale) &&
                deps.onImageAssetUploadButtonClick(
                  transformedComponentId,
                  "scale",
                  $e4,
                  deps.entryStateRecord(draftComponent, "scale"),
                ),
              deps.navigationLabelTextInputElement(draftComponent) &&
                Number.isFinite(componentTransform.rotation) &&
                deps.onImageAssetUploadButtonClick(
                  transformedComponentId,
                  "rotation",
                  $e5,
                  deps.entryStateRecord(draftComponent, "rotation"),
                ));
          }));
      },
      onComponentsTransform(leadComponentId: any, transformDraftDocument: any) {
        ((deps.editorCtx.selectedComponentId = transformDraftDocument),
          deps.mutateDocument((transformEntry: any) => {
            for (const vector of leadComponentId) {
              const entryComponent = findComponent2(transformEntry, vector.componentId)?.component;
              entryComponent &&
                ((entryComponent.position = {
                  ...(entryComponent.position || {}),
                  ...(Number.isFinite(vector.x)
                    ? {
                        x: vector.x,
                      }
                    : {}),
                  ...(Number.isFinite(vector.y)
                    ? {
                        y: vector.y,
                      }
                    : {}),
                  ...(Number.isFinite(vector.rotation)
                    ? {
                        rotation: vector.rotation,
                      }
                    : {}),
                }),
                Number.isFinite(vector.scale) &&
                  (entryComponent.style = {
                    ...(entryComponent.style || {}),
                    scale: vector.scale,
                  }));
            }
          }));
      },
      onComponentDuplicate(sourceComponentIdState: any, sourceComponentId: any) {
        ((deps.editorCtx.selectedComponentId = sourceComponentId.id),
          (deps.editorCtx.selectedComponentIdsSet = new Set([sourceComponentId.id])),
          (deps.editorCtx.selectionAnchorComponentId = sourceComponentId.id),
          deps.mutateDocument((copiedComponent: any) => {
            duplicateComponent(copiedComponent, sourceComponentIdState, sourceComponentId, false);
          }));
      },
      onComponentsDuplicate(duplicateDraftDocument: any, _copiedComponentEntries: any, draggedCopyId: any) {
        const copiedComponentIds = duplicateDraftDocument.map(
          (copiedComponentEntry: any) => copiedComponentEntry.copiedComponent.id,
        );
        ((deps.editorCtx.selectedComponentId = draggedCopyId || copiedComponentIds[0] || null),
          (deps.editorCtx.selectedComponentIdsSet = new Set(copiedComponentIds)),
          (deps.editorCtx.selectionAnchorComponentId = deps.editorCtx.selectedComponentId),
          deps.mutateDocument((duplicateApplyDocument: any) => {
            for (const duplicateEntry of duplicateDraftDocument)
              duplicateComponent(
                duplicateApplyDocument,
                duplicateEntry.sourceComponentId,
                duplicateEntry.copiedComponent,
                false,
              );
          }));
      },
      onComponentTransformPreview(previewedComponentId: any, previewedTransformPatch: any) {
        deps.applyTransformToInspector(previewedComponentId, previewedTransformPatch);
      },
      onComponentProperties(propertyComponentId: any, propertyPatch: any) {
        deps.mutateDocument((propertyDraftDocument: any) => {
          const propertyComponent = findComponent2(
            propertyDraftDocument,
            propertyComponentId,
          )?.component;
          !propertyComponent ||
            !["air-conditioner", "presence-sensor"].includes(propertyComponent.type) ||
            (propertyComponent.type === "presence-sensor" &&
              propertyComponent.properties?.sensorKind !== "door-window") ||
            (propertyComponent.properties = {
              ...(propertyComponent.properties || {}),
              ...propertyPatch,
            });
        });
      },
      onComponentPropertiesPreview(previewPropertyComponentId: any, previewPropertyPatch: any) {
        previewPropertyComponentId === deps.editorCtx.selectedComponentId &&
          (Number.isFinite(previewPropertyPatch.airflowScale) &&
            (deps.airConditionerAirflowScaleElement.value = roundField2(
              previewPropertyPatch.airflowScale * 100,
            )),
          Number.isFinite(previewPropertyPatch.airflowRotation) &&
            (deps.airConditionerAirflowRotationElement.value = roundField2(
              previewPropertyPatch.airflowRotation,
            )),
          Number.isFinite(previewPropertyPatch.airflowOffsetX) &&
            (deps.airConditionerAirflowOffsetXElement.value = roundField2(
              previewPropertyPatch.airflowOffsetX,
            )),
          Number.isFinite(previewPropertyPatch.airflowOffsetY) &&
            (deps.airConditionerAirflowOffsetYElement.value = roundField2(
              previewPropertyPatch.airflowOffsetY,
            )));
      },
      onComponentsTransformPreview(previewTransformList: any, previewLeadComponentId: any) {
        deps.editorCtx.selectedComponentId = previewLeadComponentId;
        const matchedTransformPreview = previewTransformList.find(
          (candidateTransformEntry: any) =>
            candidateTransformEntry.componentId === previewLeadComponentId,
        );
        matchedTransformPreview &&
          deps.applyTransformToInspector(previewLeadComponentId, matchedTransformPreview);
      },
      onError: deps.handleOperationError,
      onRuntimeStateChange() {
        const runtimeSelectedComponent = deps.removedComponent();
        runtimeSelectedComponent?.type === "light-statistics" && deps.runZone(runtimeSelectedComponent);
      },
      onPageChange(pageSelection: any) {
        ((deps.pageSelectElement.value = pageSelection.path),
          deps.loadNavigationIconOptions(deps.pageSelectElement),
          deps.retainExistingSelection(deps.editorCtx.activeProject?.document, pageSelection.path),
          deps.editorCtx.editorRenderer?.setSelectedComponents([...deps.editorCtx.selectedComponentIdsSet], deps.editorCtx.selectedComponentId),
          deps.renderComponentLists(),
          deps.coverMotorButtonElement());
      },
    })),
    deps.editorCtx.editorRenderer.setEntityCatalog(deps.editorCtx.entities, deps.editorCtx.entityResourcesByDeviceId, deps.editorCtx.devices),
    deps.editorCtx.editorRenderer)
  );
}

export function renderEditorWorkspace(deps: WorkspaceHistoryDeps, activePagePath: any = null) {
  (deps.refreshSoundToggle(),
    deps.renderWorkspaceResolution(),
    deps.runExtraOuter(deps.editorCtx.activeProject.document, deps.editorCtx.selectedPopupId));
  const dL2 = deps.renderPageSelect(deps.editorCtx.activeProject.document, activePagePath);
  if ((deps.setPageControlsEnabled(dL2), deps.resizeWorkspaceCanvas(), !dL2)) {
    (deps.clearComponentSelection(),
      deps.editorCtx.editorRenderer?.destroy(),
      (deps.editorCtx.editorRenderer = null),
      (deps.editorCanvasElement.innerHTML =
        '<div class="canvas-message"><strong>请从左侧新建页面。</strong></div>'),
      deps.renderComponentLists(),
      deps.coverMotorButtonElement(),
      deps.runCase(activePagePath),
      deps.editorCtx.editorMode === "popup" && deps.renderCustomPopupEditor());
    return;
  }
  (deps.retainExistingSelection(deps.editorCtx.activeProject.document, deps.pageSelectElement.value),
    deps.editorCtx.editorMode === "edit"
      ? (deps.ensureEditorRenderer().setDocument(deps.editorCtx.activeProject.document, deps.pageSelectElement.value),
        deps.editorCtx.editorRenderer.setActiveGroup(deps.editorCtx.activeGroupId),
        deps.editorCtx.editorRenderer.setSelectedComponents([...deps.editorCtx.selectedComponentIdsSet], deps.editorCtx.selectedComponentId))
      : (deps.editorCtx.editorRenderer?.destroy(), (deps.editorCtx.editorRenderer = null)),
    deps.renderComponentLists(),
    deps.coverMotorButtonElement(),
    deps.editorCtx.editorMode === "dashboard"
      ? deps.runCase(deps.pageSelectElement.value)
      : deps.editorCtx.editorMode === "popup"
        ? deps.renderCustomPopupEditor()
        : deps.runSlot());
}

export function syncHistoryButtons(deps: WorkspaceHistoryDeps) {
  ((deps.undoElement.disabled =
    deps.editorCtx.isSaving || deps.historyState.busy || !deps.historyState.undo.length || !deps.editorCtx.activeProject),
    (deps.redoElement.disabled =
      deps.editorCtx.isSaving || deps.historyState.busy || !deps.historyState.redo.length || !deps.editorCtx.activeProject));
  patchEditorFacadeState({
    dirty: deps.editorCtx.hasUnsavedChanges,
    saveState: deps.editorCtx.isSaving ? "saving" : deps.editorCtx.hasUnsavedChanges ? "dirty" : "idle",
    projectId: deps.editorCtx.activeProject?.projectId || null,
    projectName: deps.editorCtx.activeProject?.name || deps.editorCtx.activeProject?.title || "",
    pagePath: deps.pageSelectElement?.value || null,
    canvasZoom: deps.editorCtx.editorCanvasZoom,
    history: {
      canUndo: !deps.undoElement.disabled,
      canRedo: !deps.redoElement.disabled,
      undoDepth: deps.historyState.undo.length,
      redoDepth: deps.historyState.redo.length,
    },
    selection: {
      ids: [...deps.editorCtx.selectedComponentIdsSet],
      primaryId: deps.editorCtx.selectedComponentId || null,
    },
  });
}

export function applyEditorCanvasZoom(deps: WorkspaceHistoryDeps, nextZoom: number) {
  deps.editorCtx.editorCanvasZoom = applyEditorZoomCss(nextZoom, [deps.editorCanvasElement, deps.dashboardPreviewElement]);
  patchEditorFacadeState({ canvasZoom: deps.editorCtx.editorCanvasZoom });
  deps.resizeWorkspaceCanvas();
}

export function selectAllPageComponents(deps: WorkspaceHistoryDeps) {
  const page = deps.currentPage();
  const ids = (page?.components || []).map((componentEntry: any) => componentEntry.id).filter(Boolean);
  if (!ids.length) return;
  deps.editorCtx.selectedComponentIdsSet = new Set(ids);
  deps.editorCtx.selectedComponentId = ids[0];
  deps.editorCtx.selectionAnchorComponentId = deps.editorCtx.selectedComponentId;
  deps.coverMotorButtonElement();
  deps.syncHistoryButtons();
}

export function discardRecoverySnapshot(deps: WorkspaceHistoryDeps, recoveryProjectId = deps.editorCtx.activeProject?.projectId) {
  if (recoveryProjectId) {
    deps.recoveryWriter.cancel(recoveryProjectId);
    try {
      sessionStorage.removeItem(recoveryStorageKey2(deps.RECOVERY_STORAGE_PREFIX, recoveryProjectId));
    } catch { /* 存储写入是 best-effort：隐私模式 / 配额 / 序列化失败都不应影响本次渲染 */ }
  }
}

export function readRecoverySnapshot(deps: WorkspaceHistoryDeps, snapshotProjectId: any) {
  try {
    const item = sessionStorage.getItem(
      recoveryStorageKey2(deps.RECOVERY_STORAGE_PREFIX, snapshotProjectId),
    );
    if (!item) return null;
    const parsedRecoverySnapshot = JSON.parse(item);
    return !parsedRecoverySnapshot?.document ||
      parsedRecoverySnapshot.projectId !== snapshotProjectId
      ? null
      : parsedRecoverySnapshot;
  } catch {
    return null;
  }
}

export function scheduleRecoverySnapshot(deps: WorkspaceHistoryDeps) {
  if (!deps.editorCtx.activeProject || !deps.editorCtx.hasUnsavedChanges) return;
  const recoveryFailureNotifiedProjectId = {
    projectId: deps.editorCtx.activeProject.projectId,
    revision: deps.editorCtx.activeProject.revision,
    document: deps.editorCtx.activeProject.document,
    selectedPath: deps.pageSelectElement.value,
    selectedComponentId: deps.editorCtx.selectedComponentId,
    selectedComponentIds: [...deps.editorCtx.selectedComponentIdsSet],
    undo: [...deps.historyState.undo],
    redo: [...deps.historyState.redo],
    savedAt: new Date().toISOString(),
  };
  deps.recoveryWriter.schedule(recoveryFailureNotifiedProjectId);
}

export function persistRecoverySnapshot(deps: WorkspaceHistoryDeps, recoveryState: any) {
  try {
    sessionStorage.setItem(
      recoveryStorageKey2(deps.RECOVERY_STORAGE_PREFIX, recoveryState.projectId),
      JSON.stringify(recoveryState),
    );
  } catch {
    try {
      sessionStorage.setItem(
        recoveryStorageKey2(deps.RECOVERY_STORAGE_PREFIX, recoveryState.projectId),
        JSON.stringify({
          projectId: recoveryState.projectId,
          revision: recoveryState.revision,
          document: recoveryState.document,
          selectedPath: recoveryState.selectedPath,
          selectedComponentId: recoveryState.selectedComponentId,
          selectedComponentIds: recoveryState.selectedComponentIds,
          undo: [] as any[],
          redo: [] as any[],
          savedAt: recoveryState.savedAt,
        }),
      );
    } catch { /* 存储写入是 best-effort：隐私模式 / 配额 / 序列化失败都不应影响本次渲染 */ }
  }
}

export function writeError(deps: WorkspaceHistoryDeps, {
  preserveRecovery: notifyRecoveryWriteFailure = false,
  signature: signatureOverride = null,
}: any = {}) {
  ((deps.editorCtx.hasUnsavedChanges =
    !!deps.editorCtx.activeProject &&
    (signatureOverride ?? documentSignature2(deps.editorCtx.activeProject.document)) !== deps.editorCtx.savedDocumentSignature),
    (deps.saveButtonElement.disabled = !deps.editorCtx.activeProject || !deps.editorCtx.hasUnsavedChanges || deps.editorCtx.isSaving),
    deps.editorCtx.hasUnsavedChanges
      ? deps.scheduleRecoverySnapshot()
      : notifyRecoveryWriteFailure || deps.discardRecoverySnapshot());
}

export function resetHistoryState(deps: WorkspaceHistoryDeps) {
  ((deps.historyState.undo = []),
    (deps.historyState.redo = []),
    (deps.historyState.busy = false),
    deps.syncHistoryButtons());
}

export function refreshDirtyState(deps: WorkspaceHistoryDeps, keepRecovery: any, signatureOverride: any) {
  for (
    keepRecovery.push(signatureOverride);
    keepRecovery.filter((resetHistoryState: any) => resetHistoryState.kind !== "save").length >
    deps.MAX_HISTORY_ENTRIES;
  ) {
    const pushHistoryEntryState = keepRecovery.findIndex(
      (pushHistoryEntry: any) => pushHistoryEntry.kind !== "save",
    );
    if (pushHistoryEntryState < 0) break;
    keepRecovery.splice(pushHistoryEntryState, 1);
  }
  keepRecovery.length > deps.MAX_HISTORY_ENTRIES * 2 &&
    keepRecovery.splice(0, keepRecovery.length - deps.MAX_HISTORY_ENTRIES * 2);
}

export function historyEntries(deps: WorkspaceHistoryDeps) {
  return {
    kind: "edit",
    document: clone2(deps.editorCtx.activeProject.document),
    selectedPath: deps.pageSelectElement.value,
    selectedComponentId: deps.editorCtx.selectedComponentId,
    selectedComponentIds: [...deps.editorCtx.selectedComponentIdsSet],
  };
}

export async function historyEntry(deps: WorkspaceHistoryDeps, prunedEntry: any, pruneCandidate: any = null) {
  const createEditHistoryEntryState = ++deps.editorCtx.activeProjectState;
  deps.recoveryWriter.flush();
  let createEditHistoryEntry;
  try {
    if (
      ((createEditHistoryEntry = await deps.requestJson("/projects/" + prunedEntry + "/draft")),
      createEditHistoryEntryState !== deps.editorCtx.activeProjectState)
    )
      return;
  } catch (openProjectDraft: any) {
    if (createEditHistoryEntryState !== deps.editorCtx.activeProjectState) return;
    throw openProjectDraft;
  }
  (deps.recoveryWriter.flush(),
    (deps.editorCtx.activeProject = createEditHistoryEntry),
    (deps.editorCtx.componentScopeState += 1),
    window.HomeOSLog?.setContext!({
      projectId: prunedEntry,
    })!,
    deps.navigationButtonSavedSettingsByComponentId.clear(),
    clearCoverMotorDirectionValueById(),
    deps.panelFrameBaselineByComponentId.clear(),
    deps.lineChartBaselineByComponentId.clear(),
    deps.iconButtonEffectBaselineByComponentId.clear(),
    deps.iconButtonBaselineByComponentId.clear(),
    deps.airConditionerBaselineByComponentId.clear());
  const mappedItemByIdByKey = new Map(
    nasProfiles2(deps.editorCtx.entities, deps.editorCtx.devices).map((requestedProjectId) => [
      requestedProjectId.deviceId,
      requestedProjectId,
    ]),
  );
  (reconcileNasDocument2(deps.editorCtx.activeProject.document, mappedItemByIdByKey),
    (deps.editorCtx.baselineDocument = clone2(deps.editorCtx.activeProject.document)),
    (deps.editorCtx.savedDocumentSignature = documentSignature2(deps.editorCtx.activeProject.document)),
    (deps.editorCtx.recoverySnapshot = deps.readRecoverySnapshot(prunedEntry)),
    deps.editorCtx.recoverySnapshot && reconcileNasDocument2(deps.editorCtx.recoverySnapshot.document, mappedItemByIdByKey),
    deps.editorCtx.recoverySnapshot &&
      (deps.editorCtx.recoverySnapshot.revision !== deps.editorCtx.activeProject.revision ||
        documentSignature2(deps.editorCtx.recoverySnapshot.document) === deps.editorCtx.savedDocumentSignature) &&
      (deps.discardRecoverySnapshot(prunedEntry), (deps.editorCtx.recoverySnapshot = null)),
    deps.clearComponentSelection(),
    deps.runExtraOld(),
    deps.writeError({
      preserveRecovery: !!deps.editorCtx.recoverySnapshot,
    }),
    deps.runKey(true),
    (deps.projectSelectElement.value = prunedEntry),
    deps.loadNavigationIconOptions(deps.projectSelectElement),
    deps.renderEditorWorkspace(pruneCandidate),
    rememberEditorProject2(prunedEntry),
    deps.editorCtx.recoverySnapshot && !deps.editorCtx.isAreEntitiesLoaded && (await deps.ensureEntitiesLoaded().catch(() => {})),
    createEditHistoryEntryState === deps.editorCtx.activeProjectState &&
      deps.editorCtx.recoverySnapshot &&
      deps.editorCtx.activeProject?.projectId === prunedEntry &&
      !deps.recoveryDialogElement.open &&
      deps.recoveryDialogElement.showModal());
}

export async function initialPagePath(deps: WorkspaceHistoryDeps, loadProjects: any = null) {
  if (
    ((deps.editorCtx.projects = (await deps.requestJson("/projects")).items || []),
    deps.projectSelectElement.replaceChildren(),
    !deps.editorCtx.projects.length)
  ) {
    ((deps.editorCtx.activeProjectState += 1),
      (deps.editorCtx.componentScopeState += 1),
      deps.editorCtx.editorRenderer?.destroy(),
      (deps.editorCtx.editorRenderer = null),
      deps.runSlot(),
      (deps.editorCtx.activeProject = null),
      deps.navigationButtonSavedSettingsByComponentId.clear(),
      clearCoverMotorDirectionValueById(),
      deps.panelFrameBaselineByComponentId.clear(),
      deps.lineChartBaselineByComponentId.clear(),
      deps.iconButtonEffectBaselineByComponentId.clear(),
      deps.iconButtonBaselineByComponentId.clear(),
      deps.airConditionerBaselineByComponentId.clear(),
      deps.clearComponentSelection(),
      (deps.editorCtx.baselineDocument = null),
      (deps.editorCtx.savedDocumentSignature = ""),
      (deps.editorCtx.recoverySnapshot = null),
      deps.runExtraOld(),
      deps.writeError(),
      deps.runKey(false),
      deps.setPageControlsEnabled(false),
      deps.projectSelectElement.append(new Option("暂无仪表盘", "")),
      deps.pageSelectElement.replaceChildren(new Option("暂无页面", "")),
      deps.popupSelectElement.replaceChildren(new Option("暂无组合弹窗", "")),
      (deps.popupListElement.innerHTML = '<div class="popup-list-empty">还没有组合弹窗</div>'),
      (deps.projectSelectElement.disabled = true),
      (deps.pageSelectElement.disabled = true),
      (deps.popupSelectElement.disabled = true),
      (deps.popupActionsButtonElement.disabled = true),
      deps.loadNavigationIconOptions(deps.projectSelectElement),
      deps.loadNavigationIconOptions(deps.pageSelectElement),
      deps.loadNavigationIconOptions(deps.popupSelectElement),
      deps.renderComponentLists(),
      deps.runCase());
    return;
  }
  for (const preferredProjectId of deps.editorCtx.projects)
    deps.projectSelectElement.append(new Option(preferredProjectId.name, preferredProjectId.id));
  ((deps.projectSelectElement.disabled = false), deps.loadNavigationIconOptions(deps.projectSelectElement));
  const projectSummaryState = restoredEditorProject2(deps.editorCtx.projects, loadProjects);
  await deps.historyEntry(projectSummaryState);
}

export async function projectSummary(deps: WorkspaceHistoryDeps, 
  applyDocumentChange: any,
  updatedDocument = deps.pageSelectElement.value,
  { recordHistory: targetPagePath = true, expectedSignature: shouldRecordHistory = null }: any = {},
) {
  if (!deps.editorCtx.activeProject) throw new Error("请先选择仪表盘。");
  const projectId = deps.editorCtx.activeProject.projectId,
    Ie3 = deps.editorCtx.componentScopeState,
    document2 = deps.editorCtx.activeProject.document,
    currentDocument = shouldRecordHistory ?? documentSignature2(document2),
    updatedSignature = () => {
      if (documentSignature2(deps.editorCtx.activeProject.document) !== currentDocument)
        throw new Error("等待期间产生了新编辑，已保留最新内容，请重试刚才的操作。");
    };
  updatedSignature();
  const editHistoryEntry = documentSignature2(applyDocumentChange);
  if (currentDocument === editHistoryEntry) return deps.editorCtx.activeProject;
  try {
    await guardInteraction3dChanges2(document2, applyDocumentChange);
  } catch (caughtErrorValue: any) {
    if (deps.editorCtx.componentScopeState !== Ie3 || deps.editorCtx.activeProject?.projectId !== projectId) return null;
    throw caughtErrorValue;
  }
  if (deps.editorCtx.componentScopeState !== Ie3 || deps.editorCtx.activeProject?.projectId !== projectId) return null;
  updatedSignature();
  const vL2 = deps.collectChangedComponents(document2, applyDocumentChange, updatedDocument),
    hl2 = deps.historyEntries();
  ((deps.editorCtx.activeProject = {
    ...deps.editorCtx.activeProject,
    document: clone2(applyDocumentChange),
  }),
    targetPagePath && (deps.refreshDirtyState(deps.historyState.undo, hl2), (deps.historyState.redo = [])));
  const matchingProject = deps.editorCtx.projects.find(
    (candidateProject: any) => candidateProject.id === deps.editorCtx.activeProject.projectId,
  );
  matchingProject && (matchingProject.name = deps.editorCtx.activeProject.document.name);
  const selectedProjectOption = deps.projectSelectElement.selectedOptions[0];
  return (
    selectedProjectOption && (selectedProjectOption.textContent = deps.editorCtx.activeProject.document.name),
    deps.loadNavigationIconOptions(deps.projectSelectElement),
    vL2 && deps.editorCtx.editorRenderer?.applyEditorComponentUpdates(deps.editorCtx.activeProject.document, updatedDocument, vL2)
      ? (deps.renderComponentLists(), deps.coverMotorButtonElement())
      : deps.interaction3dEntryActive() || deps.renderEditorWorkspace(updatedDocument),
    deps.writeError({
      signature: editHistoryEntry,
    }),
    deps.syncHistoryButtons(),
    deps.editorCtx.activeProject
  );
}

export async function recoverDraftConflict(deps: WorkspaceHistoryDeps, projectId2: any) {
  let latestDraft;
  try {
    latestDraft = await deps.requestJson("/projects/" + projectId2 + "/draft");
  } catch (refreshLatestError: any) {
    deps.handleOperationError(refreshLatestError);
    return;
  }
  if (!deps.editorCtx.activeProject || deps.editorCtx.activeProject.projectId !== projectId2) return;
  const useRemote = await confirmAction({
    kicker: "REVISION CONFLICT",
    title: "草稿已在其它页面被更新",
    message: "服务器上的这份草稿比你打开的更新，当前版本号已无法直接保存。",
    detail: "「加载远端」丢弃本页未保存的修改；「保留本地并重试」保留当前编辑，改用最新版本号重新保存。",
    confirmLabel: "加载远端",
    cancelLabel: "保留本地并重试",
    tone: "warning",
  });
  if (!deps.editorCtx.activeProject || deps.editorCtx.activeProject.projectId !== projectId2) return;
  if (useRemote) {
    await deps.historyEntry(projectId2);
    return;
  }

  deps.editorCtx.activeProject = {
    ...deps.editorCtx.activeProject,
    revision: latestDraft.revision,
    globalPopupRevision: latestDraft.globalPopupRevision,
  };
  ((deps.editorCtx.isSaving = false), deps.writeError(), deps.syncHistoryButtons());
  await deps.saveDraft();
}

export async function saveDraft(deps: WorkspaceHistoryDeps) {
  if (!deps.editorCtx.activeProject || !deps.editorCtx.hasUnsavedChanges || deps.editorCtx.isSaving || deps.historyState.busy) return;
  const projectId2 = deps.editorCtx.activeProject.projectId,
    Ie4 = deps.editorCtx.componentScopeState,
    baselineBeforeSave = clone2(deps.editorCtx.baselineDocument),
    draftBeforeSave = clone2(deps.editorCtx.activeProject.document),
    draftSignatureBeforeSave = documentSignature2(draftBeforeSave),
    isPopupsDirty =
      documentSignature2(draftBeforeSave.customPopups || []) !==
      documentSignature2(deps.editorCtx.baselineDocument.customPopups || []);
  ((deps.editorCtx.isSaving = true), deps.writeError(), deps.syncHistoryButtons());
  try {
    // 地址框不必先失焦：保存前先本地校验，非法地址不把整份草稿发上去。
    validateGo2rtcDocument(draftBeforeSave);
    const saveResponse = await deps.requestJson("/projects/" + projectId2 + "/draft", {
      method: "PUT",
      hbLogContext: { projectId: projectId2, phase: "save-draft" },
      body: JSON.stringify({
        revision: deps.editorCtx.activeProject.revision,
        globalPopupRevision: deps.editorCtx.activeProject.globalPopupRevision,
        globalPopupsDirty: isPopupsDirty,
        document: draftBeforeSave,
      }),
    });
    if (deps.editorCtx.componentScopeState !== Ie4 || deps.editorCtx.activeProject?.projectId !== projectId2) return;
    const savedProjectSummary = documentSignature2(deps.editorCtx.activeProject.document),
      isPopupsChanged = savedProjectSummary !== draftSignatureBeforeSave,
      document3 = isPopupsChanged ? clone2(deps.editorCtx.activeProject.document) : saveResponse.document;
    (isPopupsChanged &&
      documentSignature2(document3.customPopups || []) ===
        documentSignature2(draftBeforeSave.customPopups || []) &&
      (document3.customPopups = clone2(saveResponse.document.customPopups || [])),
      (deps.editorCtx.activeProject = {
        ...saveResponse,
        document: document3,
      }),
      (deps.editorCtx.baselineDocument = clone2(saveResponse.document)),
      (deps.editorCtx.savedDocumentSignature = documentSignature2(saveResponse.document)),
      isPopupsChanged ||
        (deps.panelFrameBaselineByComponentId.clear(),
        deps.lineChartBaselineByComponentId.clear(),
        deps.iconButtonEffectBaselineByComponentId.clear(),
        deps.iconButtonBaselineByComponentId.clear(),
        deps.airConditionerBaselineByComponentId.clear()),
      deps.refreshDirtyState(deps.historyState.undo, {
        kind: "save",
        beforeSavedDocument: baselineBeforeSave,
        afterSavedDocument: clone2(saveResponse.document),
      }),
      (deps.historyState.redo = []));
    const currentDraftDocument = deps.editorCtx.projects.find(
      (historyStepDirection: any) => historyStepDirection.id === deps.editorCtx.activeProject.projectId,
    );
    currentDraftDocument && (currentDraftDocument.name = deps.editorCtx.activeProject.document.name);
    const validComponentIds = deps.projectSelectElement.selectedOptions[0];
    (validComponentIds && (validComponentIds.textContent = deps.editorCtx.activeProject.document.name),
      deps.loadNavigationIconOptions(deps.projectSelectElement),
      documentSignature2(deps.editorCtx.activeProject.document) !== savedProjectSummary &&
        deps.renderEditorWorkspace(deps.pageSelectElement.value));
  } catch (refreshAuthSession: any) {
    if (refreshAuthSession?.code === "PROJECT_REVISION_CONFLICT") {
      await deps.recoverDraftConflict(projectId2);
      return;
    }
    deps.handleOperationError(refreshAuthSession);
  } finally {
    ((deps.editorCtx.isSaving = false), deps.writeError(), deps.syncHistoryButtons());
  }
}

export function interaction3dEntryActive(deps: WorkspaceHistoryDeps) {
  return (
    !!document.querySelector('[data-interaction3d-entry-pending="true"]') ||
    !!document.activeElement?.closest?.(
      ".inspector-form, .i3d-editor, .i3d-floor-entry-dialog, [data-i3d-preview-scope]",
    ) ||
    !!document.querySelector(
      "dialog.i3d-editor[open], dialog.i3d-floor-entry-dialog[open], dialog[data-i3d-preview-scope][open]",
    )
  );
}

export async function loadHaConnection(deps: WorkspaceHistoryDeps, keepHaForm: any, refreshHaSyncStatus: any) {
  const projectId3 = deps.editorCtx.activeProject.projectId,
    Ie5 = deps.editorCtx.componentScopeState,
    beforeSavedDocument =
      refreshHaSyncStatus === "undo"
        ? keepHaForm.beforeSavedDocument
        : keepHaForm.afterSavedDocument,
    isPopupsChangedActive =
      documentSignature2(beforeSavedDocument.customPopups || []) !==
      documentSignature2(deps.editorCtx.baselineDocument.customPopups || []),
    connectedSignature = documentSignature2(deps.editorCtx.activeProject.document.customPopups || []),
    previousConnectedSignature = await deps.requestJson("/projects/" + projectId3 + "/draft", {
      method: "PUT",
      body: JSON.stringify({
        revision: deps.editorCtx.activeProject.revision,
        globalPopupRevision: deps.editorCtx.activeProject.globalPopupRevision,
        globalPopupsDirty: isPopupsChangedActive,
        document: beforeSavedDocument,
      }),
    });
  if (deps.editorCtx.componentScopeState !== Ie5 || deps.editorCtx.activeProject?.projectId !== projectId3) return false;
  const entityLoadErrorState = clone2(deps.editorCtx.activeProject.document);
  return (
    (deps.editorCtx.baselineDocument = clone2(previousConnectedSignature.document)),
    (deps.editorCtx.savedDocumentSignature = documentSignature2(previousConnectedSignature.document)),
    !isPopupsChangedActive &&
      documentSignature2(entityLoadErrorState.customPopups || []) === connectedSignature &&
      (entityLoadErrorState.customPopups = clone2(
        previousConnectedSignature.document.customPopups || [],
      )),
    (deps.editorCtx.activeProject = {
      ...previousConnectedSignature,
      document: entityLoadErrorState,
    }),
    deps.interaction3dEntryActive() || deps.renderEditorWorkspace(deps.pageSelectElement.value),
    deps.writeError(),
    true
  );
}

export async function entityLoadError(deps: WorkspaceHistoryDeps, syncHaConnectionUi: any) {
  const haActiveUrl = deps.editorCtx.activeProject?.projectId,
    Ie6 = deps.editorCtx.componentScopeState,
    haDetailWarningHandler = () =>
      deps.editorCtx.componentScopeState === Ie6 && deps.editorCtx.activeProject?.projectId === haActiveUrl;
  if (
    (await deps.editorCtx.writeQueuePromise.catch(() => {}),
    !haDetailWarningHandler() || deps.editorCtx.isSaving || deps.historyState.busy || !deps.editorCtx.activeProject)
  )
    return;
  const undo = syncHaConnectionUi === "undo" ? deps.historyState.undo : deps.historyState.redo,
    haDetailWarning = syncHaConnectionUi === "undo" ? "redo" : "undo",
    pop = undo.pop();
  if (pop) {
    ((deps.historyState.busy = true),
      deps.syncHistoryButtons(),
      deps.panelFrameBaselineByComponentId.clear(),
      deps.lineChartBaselineByComponentId.clear(),
      deps.iconButtonEffectBaselineByComponentId.clear(),
      deps.iconButtonBaselineByComponentId.clear(),
      deps.airConditionerBaselineByComponentId.clear());
    try {
      if (pop.kind === "save") {
        if (!(await deps.loadHaConnection(pop, syncHaConnectionUi))) return;
        deps.refreshDirtyState(deps.historyState[haDetailWarning], pop);
      } else {
        const hl3 = deps.historyEntries(),
          deadlineTime = Array.isArray(pop.selectedComponentIds)
            ? pop.selectedComponentIds.filter((collectHaConnectionInput: any) =>
                findComponent2(pop.document, collectHaConnectionInput),
              )
            : [];
        if (
          ((deps.editorCtx.selectedComponentId = findComponent2(pop.document, pop.selectedComponentId)
            ? pop.selectedComponentId
            : deadlineTime[0] || null),
          (deps.editorCtx.selectedComponentIdsSet = new Set(
            deadlineTime.length ? deadlineTime : deps.editorCtx.selectedComponentId ? [deps.editorCtx.selectedComponentId] : [],
          )),
          (deps.editorCtx.selectionAnchorComponentId = deps.editorCtx.selectedComponentId),
          !(await deps.projectSummary(pop.document, pop.selectedPath, {
            recordHistory: false,
          })))
        )
          return;
        deps.refreshDirtyState(deps.historyState[haDetailWarning], hl3);
      }
    } catch (requireToken: any) {
      haDetailWarningHandler() &&
        (deps.refreshDirtyState(
          syncHaConnectionUi === "undo" ? deps.historyState.undo : deps.historyState.redo,
          pop,
        ),
        deps.handleOperationError(requireToken));
    } finally {
      haDetailWarningHandler() &&
        ((deps.historyState.busy = false),
        deps.syncHistoryButtons(),
        deps.editorCtx.hasUnsavedChanges && deps.scheduleRecoverySnapshot());
    }
  }
}

export async function reuseTokenForNewUrl(deps: WorkspaceHistoryDeps) {
  await deps.requestJson("/auth/me");
}

export async function syncAspectLockButton(deps: WorkspaceHistoryDeps) {
  const isAspectLockActive = await deps.requestJson("/ha/sync/status");
  const pendingResizeResolve = isAspectLockActive.counts || {
    entities: 0,
    devices: 0,
    areas: 0,
  };
  if (!isAspectLockActive.configured) {
    ((deps.editorCtx.lastConnectedSignature = null),
      (deps.editorCtx.isAreEntitiesLoaded = false),
      (deps.editorCtx.entities.length || deps.editorCtx.devices.length || Object.keys(deps.editorCtx.entityResourcesByDeviceId).length) &&
        ((deps.editorCtx.entities = []),
        (deps.editorCtx.devices = []),
        (deps.editorCtx.deviceNamesByDeviceId = new Map()),
        (deps.editorCtx.entityResourcesByDeviceId = {}),
        deps.editorCtx.editorRenderer?.setEntityCatalog([], {}, []),
        deps.editorCtx.dashboardPreviewRenderer?.setEntityCatalog([], {}, []),
        deps.runExtraLower(),
        deps.interaction3dEntryActive() ||
          document.activeElement?.closest?.(".inspector-form") ||
          deps.coverMotorButtonElement()));
    return;
  }
  const stringify = JSON.stringify([
    Number.isFinite(Number(isAspectLockActive.catalogRevision))
      ? Number(isAspectLockActive.catalogRevision)
      : isAspectLockActive.lastFullSyncAt || "",
    Number(pendingResizeResolve.entities || 0),
    Number(pendingResizeResolve.devices || 0),
    Number(pendingResizeResolve.areas || 0),
  ]);
  if (
    (isAspectLockActive.connected || isAspectLockActive.status === "connected") &&
    stringify !== deps.editorCtx.lastConnectedSignature
  ) {
    const Gi2 = deps.editorCtx.lastConnectedSignature;
    deps.editorCtx.lastConnectedSignature = stringify;
    try {
      await deps.ensureEntitiesLoaded({
        afterCurrent: true,
      });
    } catch (openPageDialog: any) {
      throw (
        deps.editorCtx.lastConnectedSignature === stringify && (deps.editorCtx.lastConnectedSignature = Gi2),
        openPageDialog
      );
    }
  }
}

