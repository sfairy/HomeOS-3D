import { DEFAULT_PERSPECTIVE_CORNERS } from "../../metadata/editor-perspective-constants";
import {
  applyFlowLineStyle as applyFlowLineStyle2,
} from "../../../shared/flow-line-model";
import {
  applyPercentageBarChange as applyPercentageBarChange2,
  percentageBarDefaults as percentageBarDefaults2,
} from "../../../shared/percentage-bar-model";




import {
  createComponentFromTemplate as createComponentFromTemplate2,
} from "../../component-templates";
import {
  clone as clone2,
  newId as newId2,
  normalizedHexColor as normalizedHexColor2,
  rgbToHex as rgbToHex2,
  clampNumber as clampNumber2,
} from "../../editor-utils";
// 3/6 位校验 + 非法回落黑（原 studio 副本不校验输入，非法值产 NaN 通道，已删）
import {
  packPopupModules as packPopupModules2,
} from "../../../shared/popup-layout";
import {
  countComponentsOutsideCanvas as countComponentsOutsideCanvas2,
  resizeDashboardDocument as resizeDashboardDocument2,
} from "../../dashboard-resize";
import {
  copyComponentsAcrossDocuments as copyComponentsAcrossDocuments2,
  copyComponentsToTarget as copyComponentsToTarget2,
} from "../../component-page-copy";
import {
  manualRelatedEntityConfig as manualRelatedEntityConfig2,
  relatedPopupContext as relatedPopupContext2,
} from "../../../shared/related-entities";
import { createButtonSound as createButtonSound2 } from "../../../shared/sound-effects";
import { createUserImageUploader } from "../../../shared/user-image-upload";
import type { UserImageUploadState } from "../../../shared/user-image-upload";
import { ensureRegistryComponents as ensureRegistryComponents2 } from "../../../renderer/registry";
import {
  deferHiddenEditorDialogs as deferHiddenEditorDialogs2,
  installSettingsDialogBackdropGuard as installSettingsDialogBackdropGuard2,
} from "../../editor-dialogs";
import { createEditorPickerElements as createEditorPickerElements2 } from "../../picker/editor-picker-elements";


import { createEditorPickerQueries as createEditorPickerQueries2 } from "../../picker/editor-picker-queries";
import { createEditorAssetMatcher as createEditorAssetMatcher2 } from "../../picker/editor-asset-queries";
import { createEditorPickerLifecycle as createEditorPickerLifecycle2 } from "../../picker/editor-picker-lifecycle";
import { createInteraction3dEditorPickers as createInteraction3dEditorPickers2 } from "../../../bridge/pickers/editor-pickers";


import { createEditorAssetToolbar as createEditorAssetToolbar2 } from "../../picker/editor-asset-toolbar";
import {
  actionNeedsCurrentEntity as actionNeedsCurrentEntity2,
} from "../../../shared/action-rules";
import {
  findComponent as findComponent2,
  findComponentInItems as findComponentInItems2,
  findComponentLocation as findComponentLocation2,
} from "../../component-tree";
import {
  applyCollectionLayerOrder as applyCollectionLayerOrder2,
  componentLabel as componentLabel2,
  nextTemplateInstanceName as nextTemplateInstanceName2,
  syncSharedComponentReferenceOrder as syncSharedComponentReferenceOrder2,
} from "../../editor-component-collections";


import {
  clonePageWithFreshIds as clonePageWithFreshIds2,
  findCustomPopup as findCustomPopup2,
  normalizedPopupClimateDeviceType as normalizedPopupClimateDeviceType2,
  uniquePagePath as uniquePagePath2,
} from "../../editor-document-management";
import {
  createRecoveryWriter as createRecoveryWriter2,
} from "../../editor-history";
import {
  DEFAULT_BASE_LIGHTING as DEFAULT_BASE_LIGHTING2,
  normalizeBaseLighting as normalizeBaseLighting2,
} from "../../../3d-studio/loaders/studio-normalization";
import { floorplanAutoDiagramExportResolution as floorplanAutoDiagramExportResolution2 } from "../../floorplan-auto-diagram-layout";


import { createLegacyScope } from '@/studio/platform/legacy-scope';
import { navigateInShell } from '@/studio/platform/shell-navigation';
import { schedulePoll } from '@/shared/utils/core/poll-scheduler';
import {
  patchEditorFacadeState,
  registerEditorCommandHandler,
  resetEditorFacade,
} from '../../../../engine';
import { setupEventLogWallInspector } from "../../home-event-log-wall";
import { setupPanelFrameInspector } from "../../home-panel-frame";


import { setupRelatedPopup } from "../../home-related-popup";


import {
  clientPointToCanvas,
  normalizeMarquee,
  pickComponentsInMarquee,
} from '../../editor-selection-tools';
import { removeComponent } from "../../editor-component-collections";
import { createDateTimeWeatherLineChartInputTables } from "../../metadata/date-weather-linechart-input-tables";
import { createNavigationInputTables } from "../../metadata/navigation-input-tables";


import { createEffectPreviewInputTables } from "../../metadata/effect-preview-input-tables";
import { createInspectorSubmitTables } from "../../metadata/inspector-submit-tables";
import { createExportSpliceTables } from "../../metadata/export-splice-tables";
import { attachDateInspectorSubmit } from "../../bindings/date-inspector-submit";
import { attachDocumentEntityPickerDismiss } from "../../bindings/document-entity-picker-dismiss";
import { attachLineChartInspectorInput } from "../../bindings/line-chart-inspector-input";
import { attachNavigationInspectorInput } from "../../bindings/navigation-inspector-input";
import { attachFloorplanDiagramInspectorInput } from "../../bindings/floorplan-diagram-inspector-input";
import { attachPageshowDiagramPreviewRestore } from "../../bindings/pageshow-diagram-preview-restore";
import { createEditorContext } from "../editor-context";
import { bindDeps } from "../functions/bind-deps";
import { bindCanvasMarquee } from "./canvas-marquee";
import { createInspectorContexts } from "./inspector-contexts";
import { bindAssetDialogWiring } from "./asset-dialog-wiring";
import { bindNavigationStyleWiring } from "./navigation-style-wiring";
import { bindFloorplanAutoDiagramMessages } from "./floorplan-messages";

import { queryEditorElements } from "../elements/editor-elements";
import { refreshEditorViewportFit as refreshEditorViewportFitImpl, refreshComponentDialogScale as refreshComponentDialogScaleImpl, refreshSoundToggle as refreshSoundToggleImpl, syncIconButtonInspector as syncIconButtonInspectorImpl, syncNavigationInspector as syncNavigationInspectorImpl, syncLineChartInspector as syncLineChartInspectorImpl, syncAirConditionerInspector as syncAirConditionerInspectorImpl, requestJson as requestJsonImpl, formatLastSeen as formatLastSeenImpl, setSettingsMessage as setSettingsMessageImpl, handleOperationError as handleOperationErrorImpl, errorPhase as errorPhaseImpl, value as valueImpl, hidePopupActionsMenu as hidePopupActionsMenuImpl, closeCustomSelect as closeCustomSelectImpl, positionCustomSelectMenu as positionCustomSelectMenuImpl, selectableEntities as selectableEntitiesImpl, openEntityPicker as openEntityPickerImpl, closeAllDropdownMenus as closeAllDropdownMenusImpl, closeDropdownMenu as closeDropdownMenuImpl, openColorPickerForInput as openColorPickerForInputImpl, setWorkspaceHasProject as setWorkspaceHasProjectImpl, hasActiveProject as hasActiveProjectImpl, destroyDashboardPreview as destroyDashboardPreviewImpl, syncWorkspaceEmptyState as syncWorkspaceEmptyStateImpl, type ShellControlsDeps } from "../functions/shell-controls";
import { destroyDashboardPreviewRenderer as destroyDashboardPreviewRendererImpl, renderDashboardPreview as renderDashboardPreviewImpl, unbindDisplayDeviceError as unbindDisplayDeviceErrorImpl, renderWorkspaceResolution as renderWorkspaceResolutionImpl, setEditorMode as setEditorModeImpl, syncDefaultPageAction as syncDefaultPageActionImpl, setPageControlsEnabled as setPageControlsEnabledImpl, resizeWorkspaceCanvas as resizeWorkspaceCanvasImpl, ensureMarqueeOverlay as ensureMarqueeOverlayImpl, currentPage as currentPageImpl, groupSelectedComponents as groupSelectedComponentsImpl, ungroupComponent as ungroupComponentImpl, openGroupRenameDialog as openGroupRenameDialogImpl, normalizeHexColor as normalizeHexColorImpl, removedComponent as removedComponentImpl, removalPageEntry as removalPageEntryImpl, componentListForScope as componentListForScopeImpl, collectComponentsByType as collectComponentsByTypeImpl, findPageComponentsByType as findPageComponentsByTypeImpl, findReplaceableComponents as findReplaceableComponentsImpl, syncRendererSelection as syncRendererSelectionImpl, clearComponentSelection as clearComponentSelectionImpl, resetPreviewStates as resetPreviewStatesImpl, selectComponent as selectComponentImpl, mutateDocument as mutateDocumentImpl, type WorkspaceDocumentDeps } from "../functions/workspace-document";
import { scaledSelectionPlacements as scaledSelectionPlacementsImpl, selectedComponentIdsFromDom as selectedComponentIdsFromDomImpl, setComponentsRotation as setComponentsRotationImpl, setComponentsVisibility as setComponentsVisibilityImpl, closeComponentMenu as closeComponentMenuImpl, openComponentMenu as openComponentMenuImpl, findCommonCopyTargets as findCommonCopyTargetsImpl, showCopySuccessDialog as showCopySuccessDialogImpl, handleCopySuccessConfirm as handleCopySuccessConfirmImpl, duplicateComponents as duplicateComponentsImpl, copyTargetsForDocument as copyTargetsForDocumentImpl, renderCopyTargetOptions as renderCopyTargetOptionsImpl, getDocumentCanvasSize as getDocumentCanvasSizeImpl, renderCopyScaleOptions as renderCopyScaleOptionsImpl, renderCopyComponentDialog as renderCopyComponentDialogImpl, openCopyComponentDialog as openCopyComponentDialogImpl, deleteComponentIds as deleteComponentIdsImpl, setComponentsLabelColor as setComponentsLabelColorImpl, renderComponentList as renderComponentListImpl, prependGroupBackButton as prependGroupBackButtonImpl, renderComponentLists as renderComponentListsImpl, setComponentScope as setComponentScopeImpl, syncAddComponentButton as syncAddComponentButtonImpl, renderComponentTemplates as renderComponentTemplatesImpl, renderNavigationIconPreview as renderNavigationIconPreviewImpl, type ComponentEditingDeps } from "../functions/component-editing";
import { describeEntityDomain as describeEntityDomainImpl, normalizeWhitespace as normalizeWhitespaceImpl, navigationIconValue as navigationIconValueImpl, resolveEntityDisplayName as resolveEntityDisplayNameImpl, formatEntityLabel as formatEntityLabelImpl, formatEntitySummary as formatEntitySummaryImpl, collectEntityIds as collectEntityIdsImpl, describeEntityState as describeEntityStateImpl, showLightStatisticsMessage as showLightStatisticsMessageImpl, clearLightStatisticsSelection as clearLightStatisticsSelectionImpl, renderLightStatisticsEntityOptions as renderLightStatisticsEntityOptionsImpl, addLightStatisticsEntity as addLightStatisticsEntityImpl, effectIconName as effectIconNameImpl, removeLightStatisticsEntityAt as removeLightStatisticsEntityAtImpl, renderLightStatisticsEntityList as renderLightStatisticsEntityListImpl, flattenComponentTree as flattenComponentTreeImpl, collectPageComponents as collectPageComponentsImpl, findIconVisibilityVirtualEntity as findIconVisibilityVirtualEntityImpl, resolveEntityCatalog as resolveEntityCatalogImpl, registerOverflowScrollPreviewRow as registerOverflowScrollPreviewRowImpl, resolveOverflowScrollPreviewContainer as resolveOverflowScrollPreviewContainerImpl, findEnclosingScrollPreviewRow as findEnclosingScrollPreviewRowImpl, stopOverflowScrollAnimation as stopOverflowScrollAnimationImpl, ensureInspectorPickerValueSpan as ensureInspectorPickerValueSpanImpl, setPickerButtonLabel as setPickerButtonLabelImpl, type EntityLabelsDeps } from "../functions/entity-labels";
import { closePickerMenu as closePickerMenuImpl, closeOtherPickerMenus as closeOtherPickerMenusImpl, resolveMdiIconUrl as resolveMdiIconUrlImpl, renderNavigationIconButton as renderNavigationIconButtonImpl, renderTitleButtonIconPreview as renderTitleButtonIconPreviewImpl, renderEntityIconButtonPreview as renderEntityIconButtonPreviewImpl, renderLightStatisticsIconPreview as renderLightStatisticsIconPreviewImpl, renderLightStatisticsButtonIcon as renderLightStatisticsButtonIconImpl, copyTextToClipboard as copyTextToClipboardImpl, enhanceEntityCopyButton as enhanceEntityCopyButtonImpl, enhanceEntityCopyButtons as enhanceEntityCopyButtonsImpl, ensureIconListPaginationState as ensureIconListPaginationStateImpl, hideIconNameTooltip as hideIconNameTooltipImpl, showIconNameTooltip as showIconNameTooltipImpl, bindIconNameTooltipEvents as bindIconNameTooltipEventsImpl, bindIconListInfiniteScroll as bindIconListInfiniteScrollImpl, iconTooltipElementCount as iconTooltipElementCountImpl, iconTooltipElementFlag as iconTooltipElementFlagImpl, iconTooltipElementStep as iconTooltipElementStepImpl, iconTooltipElementStore as iconTooltipElementStoreImpl, iconTooltipElementBuffer as iconTooltipElementBufferImpl, positionNavigationIconMenu as positionNavigationIconMenuImpl, positionIbeIconMenu as positionIbeIconMenuImpl, positionIconButtonIconMenu as positionIconButtonIconMenuImpl, layoutTitleButtonIconMenu as layoutTitleButtonIconMenuImpl, type IconPickersDeps } from "../functions/icon-pickers";
import { positionLightStatisticsIconMenu as positionLightStatisticsIconMenuImpl, positionLightStatisticsEntityMenu as positionLightStatisticsEntityMenuImpl, resolveEntityPickerConfig as resolveEntityPickerConfigImpl, renderRelatedPopupEntityOptions as renderRelatedPopupEntityOptionsImpl, syncPopupEntityPickerButton as syncPopupEntityPickerButtonImpl, resolveAssetPreviewUrl as resolveAssetPreviewUrlImpl, refreshImageAssetPickerPreview as refreshImageAssetPickerPreviewImpl, resolveAssetFileUrl as resolveAssetFileUrlImpl, resolveEffectAssetUrl as resolveEffectAssetUrlImpl, assetMatchesId as assetMatchesIdImpl, allAssets as allAssetsImpl, findAssetById as findAssetByIdImpl, assetDisplayName as assetDisplayNameImpl, exportedAssetsInFolder as exportedAssetsInFolderImpl, canDeleteAssetFolder as canDeleteAssetFolderImpl, syncAssetFolderOptions as syncAssetFolderOptionsImpl, leftFolderName as leftFolderNameImpl, measureAssetImageSize as measureAssetImageSizeImpl, applyAssetNaturalSize as applyAssetNaturalSizeImpl, readEffectNaturalSize as readEffectNaturalSizeImpl, probeAssetNaturalSize as probeAssetNaturalSizeImpl, positionImageAssetMenu as positionImageAssetMenuImpl, positionAssetLargePreview as positionAssetLargePreviewImpl, scheduleAssetPreview as scheduleAssetPreviewImpl, hideAssetLargePreview as hideAssetLargePreviewImpl, type AssetPickerDeps } from "../functions/asset-picker";
import { createAssetOptionButton as createAssetOptionButtonImpl, renderImageAssetOptions as renderImageAssetOptionsImpl, syncImageAssetSelection as syncImageAssetSelectionImpl, positionEffectAssetMenu as positionEffectAssetMenuImpl, renderEffectAssetOptions as renderEffectAssetOptionsImpl, syncEffectAssetSelection as syncEffectAssetSelectionImpl, assignActionControlIds as assignActionControlIdsImpl, initActionPopupConfig as initActionPopupConfigImpl, closePopupEntityMenus as closePopupEntityMenusImpl, syncPopupEntityButton as syncPopupEntityButtonImpl, renderPopupEntityOptions as renderPopupEntityOptionsImpl, positionPopupEntityMenu as positionPopupEntityMenuImpl, timeFitComponent as timeFitComponentImpl, renderTimeInspector as renderTimeInspectorImpl, weatherProperties as weatherPropertiesImpl, fitWeatherComponentToDimensions as fitWeatherComponentToDimensionsImpl, entitiesByEntityId as entitiesByEntityIdImpl, devicesByDeviceId as devicesByDeviceIdImpl, buildCustomPopupEditorContext as buildCustomPopupEditorContextImpl, renderCustomPopupEditor as renderCustomPopupEditorImpl, syncCustomPopupStage as syncCustomPopupStageImpl, buildTimeInspectorContext as buildTimeInspectorContextImpl, syncTimeInspector as syncTimeInspectorImpl, buildWeatherInspectorContext as buildWeatherInspectorContextImpl, syncWeatherInspector as syncWeatherInspectorImpl, type PopupInspectorsDeps } from "../functions/popup-inspectors";
import { buildTitleButtonInspectorContext as buildTitleButtonInspectorContextImpl, syncTitleButtonInspector as syncTitleButtonInspectorImpl, buildLightStatisticsInspectorContext as buildLightStatisticsInspectorContextImpl, syncLightStatisticsInspector as syncLightStatisticsInspectorImpl, buildCameraInspectorContext as buildCameraInspectorContextImpl, syncCameraInspector as syncCameraInspectorImpl, buildVacuumMapInspectorContext as buildVacuumMapInspectorContextImpl, syncVacuumMapInspector as syncVacuumMapInspectorImpl, buildCoverMotorInspectorContext as buildCoverMotorInspectorContextImpl, coverMotorButtonElement as coverMotorButtonElementImpl, computeCoverMotorStyleChanges as computeCoverMotorStyleChangesImpl, reloadAssetCatalog as reloadAssetCatalogImpl, pollAssetCatalogVersion as pollAssetCatalogVersionImpl, ensureEntitiesLoaded as ensureEntitiesLoadedImpl, renderCustomPopupSelector as renderCustomPopupSelectorImpl, syncPopupEntityInputs as syncPopupEntityInputsImpl, syncPopupModuleClimateDeviceType as syncPopupModuleClimateDeviceTypeImpl, deviceNameValue as deviceNameValueImpl, initialPopupId as initialPopupIdImpl, renderPopupModuleEntityOptions as renderPopupModuleEntityOptionsImpl, closePopupModuleEntityMenu as closePopupModuleEntityMenuImpl, openPopupModuleDialog as openPopupModuleDialogImpl, renderPageSelect as renderPageSelectImpl, retainExistingSelection as retainExistingSelectionImpl, collectChangedComponents as collectChangedComponentsImpl, type InspectorContextsDeps } from "../functions/inspector-contexts";
import { collectPageComponentBounds as collectPageComponentBoundsImpl, alignSelectedComponents as alignSelectedComponentsImpl, ensureEditorRenderer as ensureEditorRendererImpl, renderEditorWorkspace as renderEditorWorkspaceImpl, syncHistoryButtons as syncHistoryButtonsImpl, applyEditorCanvasZoom as applyEditorCanvasZoomImpl, selectAllPageComponents as selectAllPageComponentsImpl, discardRecoverySnapshot as discardRecoverySnapshotImpl, readRecoverySnapshot as readRecoverySnapshotImpl, scheduleRecoverySnapshot as scheduleRecoverySnapshotImpl, persistRecoverySnapshot as persistRecoverySnapshotImpl, writeError as writeErrorImpl, resetHistoryState as resetHistoryStateImpl, refreshDirtyState as refreshDirtyStateImpl, historyEntries as historyEntriesImpl, historyEntry as historyEntryImpl, initialPagePath as initialPagePathImpl, projectSummary as projectSummaryImpl, recoverDraftConflict as recoverDraftConflictImpl, saveDraft as saveDraftImpl, interaction3dEntryActive as interaction3dEntryActiveImpl, loadHaConnection as loadHaConnectionImpl, entityLoadError as entityLoadErrorImpl, reuseTokenForNewUrl as reuseTokenForNewUrlImpl, syncAspectLockButton as syncAspectLockButtonImpl, type WorkspaceHistoryDeps } from "../functions/workspace-history";
import { actionDraftDocument as actionDraftDocumentImpl, targetPageCandidate as targetPageCandidateImpl, buttonVisibilityDraftDocument as buttonVisibilityDraftDocumentImpl, titleButtonIconOptionClickEvent as titleButtonIconOptionClickEventImpl, titleButtonIconDraftDocument as titleButtonIconDraftDocumentImpl, lightStatisticsIconCopyError as lightStatisticsIconCopyErrorImpl, lightStatisticsEntityListClickEvent as lightStatisticsEntityListClickEventImpl, imageEntityDraftDocument as imageEntityDraftDocumentImpl, openAssetPicker as openAssetPickerImpl, assetIdToDelete as assetIdToDeleteImpl, folderDocumentNode as folderDocumentNodeImpl, closeDeletePopupDialog as closeDeletePopupDialogImpl, documentSource as documentSourceImpl, popupId as popupIdImpl, triggerKey as triggerKeyImpl, findDiagramPreviewFrame as findDiagramPreviewFrameImpl, lightInputElement as lightInputElementImpl, cancelRemovesComponent as cancelRemovesComponentImpl, lightingPayload as lightingPayloadImpl, lightFieldElement as lightFieldElementImpl, openLightingPanel as openLightingPanelImpl, lightInputNode as lightInputNodeImpl, onFloorplanAutoLightingResetButtonClick as onFloorplanAutoLightingResetButtonClickImpl, onFloorplanAutoLightingCloseButtonClick as onFloorplanAutoLightingCloseButtonClickImpl, applyLightingPanelDragMove as applyLightingPanelDragMoveImpl, type LightingPanelDeps } from "../functions/lighting-panel";
import { bindFloorplanAutoDiagramControls } from "../functions/floorplan-auto-diagram-wiring";
import { closeAutoDiagramDialog as closeAutoDiagramDialogImpl, settleAutoDiagramDialog as settleAutoDiagramDialogImpl, cancelRemoveDraftDocument as cancelRemoveDraftDocumentImpl, bindMessageSection as bindMessageSectionImpl, onWindowMessage as onWindowMessageImpl, exportSpliceError as exportSpliceErrorImpl, collectPageImages as collectPageImagesImpl, createImageAlignOption as createImageAlignOptionImpl, openImageAlignDialog as openImageAlignDialogImpl, applyAirConditionerPreviewState as applyAirConditionerPreviewStateImpl, airflowSectionEvent as airflowSectionEventImpl, previewSyncEventName as previewSyncEventNameImpl, onCoverSettingsKindClick as onCoverSettingsKindClickImpl, coverKindDraftDocument as coverKindDraftDocumentImpl, navigationSavedPropertyKey as navigationSavedPropertyKeyImpl, previewDateResize as previewDateResizeImpl, previewWeatherComponentResize as previewWeatherComponentResizeImpl, setNavigationPreviewState as setNavigationPreviewStateImpl, applyNavigationPreviewState as applyNavigationPreviewStateImpl, syncNavigationPreviewFromElement as syncNavigationPreviewFromElementImpl, navigationPropertyNameFromElement as navigationPropertyNameFromElementImpl, resolveComponentStyleValue as resolveComponentStyleValueImpl, collectChangedLineChartStyleKeys as collectChangedLineChartStyleKeysImpl, formatLineChartStyleValue as formatLineChartStyleValueImpl, resolveNavigationStyleValue as resolveNavigationStyleValueImpl, type NavigationPreviewDeps } from "../functions/navigation-preview";
import { collectChangedTitleButtonStyleKeys as collectChangedTitleButtonStyleKeysImpl, onNavigationStyleApplyCancelButtonClick as onNavigationStyleApplyCancelButtonClickImpl, onNavigationStyleApplyConfirmButtonClick as onNavigationStyleApplyConfirmButtonClickImpl, collectChangedAirConditionerStyleKeys as collectChangedAirConditionerStyleKeysImpl, formatAirConditionerStyleValue as formatAirConditionerStyleValueImpl, resolveAirConditionerStyleValue as resolveAirConditionerStyleValueImpl, collectChangedIconButtonEffectStyleKeys as collectChangedIconButtonEffectStyleKeysImpl, formatIconButtonEffectStyleValue as formatIconButtonEffectStyleValueImpl, normalizeSensorKind as normalizeSensorKindImpl, formatSensorKindLabel as formatSensorKindLabelImpl, resolvePresenceSensorStyleKeys as resolvePresenceSensorStyleKeysImpl, styleTargetCheckbox as styleTargetCheckboxImpl, appliedStylePropertyKey as appliedStylePropertyKeyImpl, onNavigationIconCopyButtonClick as onNavigationIconCopyButtonClickImpl, navigationIconCopyError as navigationIconCopyErrorImpl, resolveCameraStyleValue as resolveCameraStyleValueImpl, collectChangedCameraStyleKeys as collectChangedCameraStyleKeysImpl, formatCameraStyleValue as formatCameraStyleValueImpl, resolvePanelFrameStyleValue as resolvePanelFrameStyleValueImpl, collectChangedPanelFrameStyleKeys as collectChangedPanelFrameStyleKeysImpl, formatPanelFrameStyleValue as formatPanelFrameStyleValueImpl, entryStateRecord as entryStateRecordImpl, areStyleValuesEqual as areStyleValuesEqualImpl, onImageAssetUploadButtonClick as onImageAssetUploadButtonClickImpl, onAssetOptionsClick as onAssetOptionsClickImpl, resetStyleApplyBaselines, type StyleApplyDeps } from "../functions/style-apply";
import { collectPendingNavigationStyleKeys as collectPendingNavigationStyleKeysImpl, onDeleteAssetCancelButtonClick as onDeleteAssetCancelButtonClickImpl, applyNavigationStyleToTargets as applyNavigationStyleToTargetsImpl, openNavigationStyleApplyDialog as openNavigationStyleApplyDialogImpl, onImageAssetFolderSelectChange as onImageAssetFolderSelectChangeImpl, imageAssetPointerOverEvent as imageAssetPointerOverEventImpl, imageAssetClickEvent as imageAssetClickEventImpl, openCameraStyleApplyDialog as openCameraStyleApplyDialogImpl, openTitleButtonStyleApplyDialog as openTitleButtonStyleApplyDialogImpl, openIconButtonEffectStyleApplyDialog as openIconButtonEffectStyleApplyDialogImpl, openAirConditionerStyleApplyDialog as openAirConditionerStyleApplyDialogImpl, openIconButtonStyleApplyDialog as openIconButtonStyleApplyDialogImpl, imageAssetMeasureError as imageAssetMeasureErrorImpl, applyInspectorDimensionChange as applyInspectorDimensionChangeImpl, onIconButtonEffectAssetFolderSelectChange as onIconButtonEffectAssetFolderSelectChangeImpl, applyEffectAssetDimensionChange as applyEffectAssetDimensionChangeImpl, applyCameraDimensionChange as applyCameraDimensionChangeImpl, applyLineChartDimensionChange as applyLineChartDimensionChangeImpl, recoveredComponentId as recoveredComponentIdImpl, onErrorDialogCloseButtonClick as onErrorDialogCloseButtonClickImpl, onShowSharedComponentsButtonClick as onShowSharedComponentsButtonClickImpl, onComponentTemplateDialogClick as onComponentTemplateDialogClickImpl, closePopupRenameDialog as closePopupRenameDialogImpl, createCopyBackupDeps as createCopyBackupDepsImpl, renderCopyBackupDialog as renderCopyBackupDialogImpl, type StyleDialogsDeps } from "../functions/style-dialogs";
import { titleButtonMenuDeps as titleButtonMenuDepsImpl, loadNavigationIconOptions as loadNavigationIconOptionsImpl, positionTitleButtonIconMenu as positionTitleButtonIconMenuImpl, stopHoverScroll as stopHoverScrollImpl, iconTooltipElementValue as iconTooltipElementValueImpl, inspectorSyncDeps as inspectorSyncDepsImpl, syncComponentActionControls as syncComponentActionControlsImpl, applyTransformToInspector as applyTransformToInspectorImpl, previewModeForIcon as previewModeForIconImpl, sharedReferenceId as sharedReferenceIdImpl, nudgeDeps as nudgeDepsImpl, nudgeDeltaX as nudgeDeltaXImpl, clickPopupListOption as clickPopupListOptionImpl, onPopupListContextmenu as onPopupListContextmenuImpl, openEntityCopyBackupPicker as openEntityCopyBackupPickerImpl, openLightStatisticsCopyBackupPicker as openLightStatisticsCopyBackupPickerImpl, openPopupEntityCopyBackupPicker as openPopupEntityCopyBackupPickerImpl, onPopupModuleCancelButtonClick as onPopupModuleCancelButtonClickImpl, type CopyBackupPickersDeps } from "../functions/copy-backup-pickers";
import { onPopupModuleClimateDeviceTypeClick as onPopupModuleClimateDeviceTypeClickImpl, selectAssetFolder as selectAssetFolderImpl, popupModuleTypeValue as popupModuleTypeValueImpl, requestDeleteUserAsset as requestDeleteUserAssetImpl, requestDeleteAssetFolder as requestDeleteAssetFolderImpl, refreshAssetPickers as refreshAssetPickersImpl, scaleDraftDocument as scaleDraftDocumentImpl, cancelDeletePopupDialog as cancelDeletePopupDialogImpl, onSessionsRevokeOthersConfirmButtonClick as onSessionsRevokeOthersConfirmButtonClickImpl, onGlobalColorPickerHexTextInputInput as onGlobalColorPickerHexTextInputInputImpl, saturationPointerMoveEventState as saturationPointerMoveEventStateImpl, mutationRecord as mutationRecordImpl, type AssetManagementDeps } from "../functions/asset-management";
let disposeActiveEditor: (() => void) | null = null;

/**
 * 引导仪表盘编辑器（重复调用会先回收上一次）。
 *
 * 由 `EditorView.vue` 在 `onMounted` 调用、`onBeforeUnmount` 调 `teardownEditor()`。
 * 原实现是「模块求值即执行的一次性引导脚本」（顶层直接读 DOM 契约、起定时器、注册全局
 * 监听）——ESM 只求值一次，卸载后回到同一文档必然白屏，所以视图只能整页跳转。现在整包
 * 搬入本函数内：每次挂载重新采集 DOM 契约与全部模块状态，卸载时统一回收。
 */
export function bootEditor(): void {
  const scope = createLegacyScope('editor-home');
  const innerCleanup = scope.executeInLegacyScope(() => {
  const editorCtx = createEditorContext();

// ── 依赖域绑定（原 355 条手写转发包装）：deps 容器构造一次，对外函数同形 ──
const { refreshEditorViewportFit, refreshComponentDialogScale, refreshSoundToggle, syncIconButtonInspector, syncNavigationInspector, syncLineChartInspector, syncAirConditionerInspector, requestJson, formatLastSeen, setSettingsMessage, handleOperationError, errorPhase, value, hidePopupActionsMenu, closeCustomSelect, positionCustomSelectMenu, selectableEntities, openEntityPicker, closeAllDropdownMenus, closeDropdownMenu, openColorPickerForInput, setWorkspaceHasProject, hasActiveProject, destroyDashboardPreview, syncWorkspaceEmptyState } = bindDeps(shellControlsDeps)({ refreshEditorViewportFit: refreshEditorViewportFitImpl, refreshComponentDialogScale: refreshComponentDialogScaleImpl, refreshSoundToggle: refreshSoundToggleImpl, syncIconButtonInspector: syncIconButtonInspectorImpl, syncNavigationInspector: syncNavigationInspectorImpl, syncLineChartInspector: syncLineChartInspectorImpl, syncAirConditionerInspector: syncAirConditionerInspectorImpl, requestJson: requestJsonImpl, formatLastSeen: formatLastSeenImpl, setSettingsMessage: setSettingsMessageImpl, handleOperationError: handleOperationErrorImpl, errorPhase: errorPhaseImpl, value: valueImpl, hidePopupActionsMenu: hidePopupActionsMenuImpl, closeCustomSelect: closeCustomSelectImpl, positionCustomSelectMenu: positionCustomSelectMenuImpl, selectableEntities: selectableEntitiesImpl, openEntityPicker: openEntityPickerImpl, closeAllDropdownMenus: closeAllDropdownMenusImpl, closeDropdownMenu: closeDropdownMenuImpl, openColorPickerForInput: openColorPickerForInputImpl, setWorkspaceHasProject: setWorkspaceHasProjectImpl, hasActiveProject: hasActiveProjectImpl, destroyDashboardPreview: destroyDashboardPreviewImpl, syncWorkspaceEmptyState: syncWorkspaceEmptyStateImpl })
const { destroyDashboardPreviewRenderer, renderDashboardPreview, unbindDisplayDeviceError, renderWorkspaceResolution, setEditorMode, syncDefaultPageAction, setPageControlsEnabled, resizeWorkspaceCanvas, ensureMarqueeOverlay, currentPage, groupSelectedComponents, ungroupComponent, openGroupRenameDialog, normalizeHexColor, removedComponent, removalPageEntry, componentListForScope, collectComponentsByType, findPageComponentsByType, findReplaceableComponents, syncRendererSelection, clearComponentSelection, resetPreviewStates, selectComponent, mutateDocument } = bindDeps(workspaceDocumentDeps)({ destroyDashboardPreviewRenderer: destroyDashboardPreviewRendererImpl, renderDashboardPreview: renderDashboardPreviewImpl, unbindDisplayDeviceError: unbindDisplayDeviceErrorImpl, renderWorkspaceResolution: renderWorkspaceResolutionImpl, setEditorMode: setEditorModeImpl, syncDefaultPageAction: syncDefaultPageActionImpl, setPageControlsEnabled: setPageControlsEnabledImpl, resizeWorkspaceCanvas: resizeWorkspaceCanvasImpl, ensureMarqueeOverlay: ensureMarqueeOverlayImpl, currentPage: currentPageImpl, groupSelectedComponents: groupSelectedComponentsImpl, ungroupComponent: ungroupComponentImpl, openGroupRenameDialog: openGroupRenameDialogImpl, normalizeHexColor: normalizeHexColorImpl, removedComponent: removedComponentImpl, removalPageEntry: removalPageEntryImpl, componentListForScope: componentListForScopeImpl, collectComponentsByType: collectComponentsByTypeImpl, findPageComponentsByType: findPageComponentsByTypeImpl, findReplaceableComponents: findReplaceableComponentsImpl, syncRendererSelection: syncRendererSelectionImpl, clearComponentSelection: clearComponentSelectionImpl, resetPreviewStates: resetPreviewStatesImpl, selectComponent: selectComponentImpl, mutateDocument: mutateDocumentImpl })
const { scaledSelectionPlacements, selectedComponentIdsFromDom, setComponentsRotation, setComponentsVisibility, closeComponentMenu, openComponentMenu, findCommonCopyTargets, showCopySuccessDialog, handleCopySuccessConfirm, duplicateComponents, copyTargetsForDocument, renderCopyTargetOptions, getDocumentCanvasSize, renderCopyScaleOptions, renderCopyComponentDialog, openCopyComponentDialog, deleteComponentIds, setComponentsLabelColor, renderComponentList, prependGroupBackButton, renderComponentLists, setComponentScope, syncAddComponentButton, renderComponentTemplates, renderNavigationIconPreview } = bindDeps(componentEditingDeps)({ scaledSelectionPlacements: scaledSelectionPlacementsImpl, selectedComponentIdsFromDom: selectedComponentIdsFromDomImpl, setComponentsRotation: setComponentsRotationImpl, setComponentsVisibility: setComponentsVisibilityImpl, closeComponentMenu: closeComponentMenuImpl, openComponentMenu: openComponentMenuImpl, findCommonCopyTargets: findCommonCopyTargetsImpl, showCopySuccessDialog: showCopySuccessDialogImpl, handleCopySuccessConfirm: handleCopySuccessConfirmImpl, duplicateComponents: duplicateComponentsImpl, copyTargetsForDocument: copyTargetsForDocumentImpl, renderCopyTargetOptions: renderCopyTargetOptionsImpl, getDocumentCanvasSize: getDocumentCanvasSizeImpl, renderCopyScaleOptions: renderCopyScaleOptionsImpl, renderCopyComponentDialog: renderCopyComponentDialogImpl, openCopyComponentDialog: openCopyComponentDialogImpl, deleteComponentIds: deleteComponentIdsImpl, setComponentsLabelColor: setComponentsLabelColorImpl, renderComponentList: renderComponentListImpl, prependGroupBackButton: prependGroupBackButtonImpl, renderComponentLists: renderComponentListsImpl, setComponentScope: setComponentScopeImpl, syncAddComponentButton: syncAddComponentButtonImpl, renderComponentTemplates: renderComponentTemplatesImpl, renderNavigationIconPreview: renderNavigationIconPreviewImpl })
const { describeEntityDomain, normalizeWhitespace, navigationIconValue, resolveEntityDisplayName, formatEntityLabel, formatEntitySummary, collectEntityIds, describeEntityState, showLightStatisticsMessage, clearLightStatisticsSelection, renderLightStatisticsEntityOptions, addLightStatisticsEntity, effectIconName, removeLightStatisticsEntityAt, renderLightStatisticsEntityList, flattenComponentTree, collectPageComponents, findIconVisibilityVirtualEntity, resolveEntityCatalog, registerOverflowScrollPreviewRow, resolveOverflowScrollPreviewContainer, findEnclosingScrollPreviewRow, stopOverflowScrollAnimation, ensureInspectorPickerValueSpan, setPickerButtonLabel } = bindDeps(entityLabelsDeps)({ describeEntityDomain: describeEntityDomainImpl, normalizeWhitespace: normalizeWhitespaceImpl, navigationIconValue: navigationIconValueImpl, resolveEntityDisplayName: resolveEntityDisplayNameImpl, formatEntityLabel: formatEntityLabelImpl, formatEntitySummary: formatEntitySummaryImpl, collectEntityIds: collectEntityIdsImpl, describeEntityState: describeEntityStateImpl, showLightStatisticsMessage: showLightStatisticsMessageImpl, clearLightStatisticsSelection: clearLightStatisticsSelectionImpl, renderLightStatisticsEntityOptions: renderLightStatisticsEntityOptionsImpl, addLightStatisticsEntity: addLightStatisticsEntityImpl, effectIconName: effectIconNameImpl, removeLightStatisticsEntityAt: removeLightStatisticsEntityAtImpl, renderLightStatisticsEntityList: renderLightStatisticsEntityListImpl, flattenComponentTree: flattenComponentTreeImpl, collectPageComponents: collectPageComponentsImpl, findIconVisibilityVirtualEntity: findIconVisibilityVirtualEntityImpl, resolveEntityCatalog: resolveEntityCatalogImpl, registerOverflowScrollPreviewRow: registerOverflowScrollPreviewRowImpl, resolveOverflowScrollPreviewContainer: resolveOverflowScrollPreviewContainerImpl, findEnclosingScrollPreviewRow: findEnclosingScrollPreviewRowImpl, stopOverflowScrollAnimation: stopOverflowScrollAnimationImpl, ensureInspectorPickerValueSpan: ensureInspectorPickerValueSpanImpl, setPickerButtonLabel: setPickerButtonLabelImpl })
const { closePickerMenu, closeOtherPickerMenus, resolveMdiIconUrl, renderNavigationIconButton, renderTitleButtonIconPreview, renderEntityIconButtonPreview, renderLightStatisticsIconPreview, renderLightStatisticsButtonIcon, copyTextToClipboard, enhanceEntityCopyButton, enhanceEntityCopyButtons, ensureIconListPaginationState, hideIconNameTooltip, showIconNameTooltip, bindIconNameTooltipEvents, bindIconListInfiniteScroll, iconTooltipElementCount, iconTooltipElementFlag, iconTooltipElementStep, iconTooltipElementStore, iconTooltipElementBuffer, positionNavigationIconMenu, positionIbeIconMenu, positionIconButtonIconMenu, layoutTitleButtonIconMenu } = bindDeps(iconPickersDeps)({ closePickerMenu: closePickerMenuImpl, closeOtherPickerMenus: closeOtherPickerMenusImpl, resolveMdiIconUrl: resolveMdiIconUrlImpl, renderNavigationIconButton: renderNavigationIconButtonImpl, renderTitleButtonIconPreview: renderTitleButtonIconPreviewImpl, renderEntityIconButtonPreview: renderEntityIconButtonPreviewImpl, renderLightStatisticsIconPreview: renderLightStatisticsIconPreviewImpl, renderLightStatisticsButtonIcon: renderLightStatisticsButtonIconImpl, copyTextToClipboard: copyTextToClipboardImpl, enhanceEntityCopyButton: enhanceEntityCopyButtonImpl, enhanceEntityCopyButtons: enhanceEntityCopyButtonsImpl, ensureIconListPaginationState: ensureIconListPaginationStateImpl, hideIconNameTooltip: hideIconNameTooltipImpl, showIconNameTooltip: showIconNameTooltipImpl, bindIconNameTooltipEvents: bindIconNameTooltipEventsImpl, bindIconListInfiniteScroll: bindIconListInfiniteScrollImpl, iconTooltipElementCount: iconTooltipElementCountImpl, iconTooltipElementFlag: iconTooltipElementFlagImpl, iconTooltipElementStep: iconTooltipElementStepImpl, iconTooltipElementStore: iconTooltipElementStoreImpl, iconTooltipElementBuffer: iconTooltipElementBufferImpl, positionNavigationIconMenu: positionNavigationIconMenuImpl, positionIbeIconMenu: positionIbeIconMenuImpl, positionIconButtonIconMenu: positionIconButtonIconMenuImpl, layoutTitleButtonIconMenu: layoutTitleButtonIconMenuImpl })
const { positionLightStatisticsIconMenu, positionLightStatisticsEntityMenu, resolveEntityPickerConfig, renderRelatedPopupEntityOptions, syncPopupEntityPickerButton, resolveAssetPreviewUrl, refreshImageAssetPickerPreview, resolveAssetFileUrl, resolveEffectAssetUrl, assetMatchesId, allAssets, findAssetById, assetDisplayName, exportedAssetsInFolder, canDeleteAssetFolder, syncAssetFolderOptions, leftFolderName, measureAssetImageSize, applyAssetNaturalSize, readEffectNaturalSize, probeAssetNaturalSize, positionImageAssetMenu, positionAssetLargePreview, scheduleAssetPreview, hideAssetLargePreview } = bindDeps(assetPickerDeps)({ positionLightStatisticsIconMenu: positionLightStatisticsIconMenuImpl, positionLightStatisticsEntityMenu: positionLightStatisticsEntityMenuImpl, resolveEntityPickerConfig: resolveEntityPickerConfigImpl, renderRelatedPopupEntityOptions: renderRelatedPopupEntityOptionsImpl, syncPopupEntityPickerButton: syncPopupEntityPickerButtonImpl, resolveAssetPreviewUrl: resolveAssetPreviewUrlImpl, refreshImageAssetPickerPreview: refreshImageAssetPickerPreviewImpl, resolveAssetFileUrl: resolveAssetFileUrlImpl, resolveEffectAssetUrl: resolveEffectAssetUrlImpl, assetMatchesId: assetMatchesIdImpl, allAssets: allAssetsImpl, findAssetById: findAssetByIdImpl, assetDisplayName: assetDisplayNameImpl, exportedAssetsInFolder: exportedAssetsInFolderImpl, canDeleteAssetFolder: canDeleteAssetFolderImpl, syncAssetFolderOptions: syncAssetFolderOptionsImpl, leftFolderName: leftFolderNameImpl, measureAssetImageSize: measureAssetImageSizeImpl, applyAssetNaturalSize: applyAssetNaturalSizeImpl, readEffectNaturalSize: readEffectNaturalSizeImpl, probeAssetNaturalSize: probeAssetNaturalSizeImpl, positionImageAssetMenu: positionImageAssetMenuImpl, positionAssetLargePreview: positionAssetLargePreviewImpl, scheduleAssetPreview: scheduleAssetPreviewImpl, hideAssetLargePreview: hideAssetLargePreviewImpl })
const { createAssetOptionButton, renderImageAssetOptions, syncImageAssetSelection, positionEffectAssetMenu, renderEffectAssetOptions, syncEffectAssetSelection, assignActionControlIds, initActionPopupConfig, closePopupEntityMenus, syncPopupEntityButton, renderPopupEntityOptions, positionPopupEntityMenu, timeFitComponent, renderTimeInspector, weatherProperties, fitWeatherComponentToDimensions, entitiesByEntityId, devicesByDeviceId, buildCustomPopupEditorContext, renderCustomPopupEditor, syncCustomPopupStage, buildTimeInspectorContext, syncTimeInspector, buildWeatherInspectorContext, syncWeatherInspector } = bindDeps(popupInspectorsDeps)({ createAssetOptionButton: createAssetOptionButtonImpl, renderImageAssetOptions: renderImageAssetOptionsImpl, syncImageAssetSelection: syncImageAssetSelectionImpl, positionEffectAssetMenu: positionEffectAssetMenuImpl, renderEffectAssetOptions: renderEffectAssetOptionsImpl, syncEffectAssetSelection: syncEffectAssetSelectionImpl, assignActionControlIds: assignActionControlIdsImpl, initActionPopupConfig: initActionPopupConfigImpl, closePopupEntityMenus: closePopupEntityMenusImpl, syncPopupEntityButton: syncPopupEntityButtonImpl, renderPopupEntityOptions: renderPopupEntityOptionsImpl, positionPopupEntityMenu: positionPopupEntityMenuImpl, timeFitComponent: timeFitComponentImpl, renderTimeInspector: renderTimeInspectorImpl, weatherProperties: weatherPropertiesImpl, fitWeatherComponentToDimensions: fitWeatherComponentToDimensionsImpl, entitiesByEntityId: entitiesByEntityIdImpl, devicesByDeviceId: devicesByDeviceIdImpl, buildCustomPopupEditorContext: buildCustomPopupEditorContextImpl, renderCustomPopupEditor: renderCustomPopupEditorImpl, syncCustomPopupStage: syncCustomPopupStageImpl, buildTimeInspectorContext: buildTimeInspectorContextImpl, syncTimeInspector: syncTimeInspectorImpl, buildWeatherInspectorContext: buildWeatherInspectorContextImpl, syncWeatherInspector: syncWeatherInspectorImpl })
const { buildTitleButtonInspectorContext, syncTitleButtonInspector, buildLightStatisticsInspectorContext, syncLightStatisticsInspector, buildCameraInspectorContext, syncCameraInspector, buildVacuumMapInspectorContext, syncVacuumMapInspector, buildCoverMotorInspectorContext, coverMotorButtonElement, computeCoverMotorStyleChanges, reloadAssetCatalog, pollAssetCatalogVersion, ensureEntitiesLoaded, renderCustomPopupSelector, syncPopupEntityInputs, syncPopupModuleClimateDeviceType, deviceNameValue, initialPopupId, renderPopupModuleEntityOptions, closePopupModuleEntityMenu, openPopupModuleDialog, renderPageSelect, retainExistingSelection, collectChangedComponents } = bindDeps(inspectorContextsDeps)({ buildTitleButtonInspectorContext: buildTitleButtonInspectorContextImpl, syncTitleButtonInspector: syncTitleButtonInspectorImpl, buildLightStatisticsInspectorContext: buildLightStatisticsInspectorContextImpl, syncLightStatisticsInspector: syncLightStatisticsInspectorImpl, buildCameraInspectorContext: buildCameraInspectorContextImpl, syncCameraInspector: syncCameraInspectorImpl, buildVacuumMapInspectorContext: buildVacuumMapInspectorContextImpl, syncVacuumMapInspector: syncVacuumMapInspectorImpl, buildCoverMotorInspectorContext: buildCoverMotorInspectorContextImpl, coverMotorButtonElement: coverMotorButtonElementImpl, computeCoverMotorStyleChanges: computeCoverMotorStyleChangesImpl, reloadAssetCatalog: reloadAssetCatalogImpl, pollAssetCatalogVersion: pollAssetCatalogVersionImpl, ensureEntitiesLoaded: ensureEntitiesLoadedImpl, renderCustomPopupSelector: renderCustomPopupSelectorImpl, syncPopupEntityInputs: syncPopupEntityInputsImpl, syncPopupModuleClimateDeviceType: syncPopupModuleClimateDeviceTypeImpl, deviceNameValue: deviceNameValueImpl, initialPopupId: initialPopupIdImpl, renderPopupModuleEntityOptions: renderPopupModuleEntityOptionsImpl, closePopupModuleEntityMenu: closePopupModuleEntityMenuImpl, openPopupModuleDialog: openPopupModuleDialogImpl, renderPageSelect: renderPageSelectImpl, retainExistingSelection: retainExistingSelectionImpl, collectChangedComponents: collectChangedComponentsImpl })
const { collectPageComponentBounds, alignSelectedComponents, ensureEditorRenderer, renderEditorWorkspace, syncHistoryButtons, applyEditorCanvasZoom, selectAllPageComponents, discardRecoverySnapshot, readRecoverySnapshot, scheduleRecoverySnapshot, persistRecoverySnapshot, writeError, resetHistoryState, refreshDirtyState, historyEntries, historyEntry, initialPagePath, projectSummary, recoverDraftConflict, saveDraft, interaction3dEntryActive, loadHaConnection, entityLoadError, reuseTokenForNewUrl, syncAspectLockButton } = bindDeps(workspaceHistoryDeps)({ collectPageComponentBounds: collectPageComponentBoundsImpl, alignSelectedComponents: alignSelectedComponentsImpl, ensureEditorRenderer: ensureEditorRendererImpl, renderEditorWorkspace: renderEditorWorkspaceImpl, syncHistoryButtons: syncHistoryButtonsImpl, applyEditorCanvasZoom: applyEditorCanvasZoomImpl, selectAllPageComponents: selectAllPageComponentsImpl, discardRecoverySnapshot: discardRecoverySnapshotImpl, readRecoverySnapshot: readRecoverySnapshotImpl, scheduleRecoverySnapshot: scheduleRecoverySnapshotImpl, persistRecoverySnapshot: persistRecoverySnapshotImpl, writeError: writeErrorImpl, resetHistoryState: resetHistoryStateImpl, refreshDirtyState: refreshDirtyStateImpl, historyEntries: historyEntriesImpl, historyEntry: historyEntryImpl, initialPagePath: initialPagePathImpl, projectSummary: projectSummaryImpl, recoverDraftConflict: recoverDraftConflictImpl, saveDraft: saveDraftImpl, interaction3dEntryActive: interaction3dEntryActiveImpl, loadHaConnection: loadHaConnectionImpl, entityLoadError: entityLoadErrorImpl, reuseTokenForNewUrl: reuseTokenForNewUrlImpl, syncAspectLockButton: syncAspectLockButtonImpl })
const { actionDraftDocument, targetPageCandidate, buttonVisibilityDraftDocument, titleButtonIconOptionClickEvent, titleButtonIconDraftDocument, lightStatisticsIconCopyError, lightStatisticsEntityListClickEvent, imageEntityDraftDocument, openAssetPicker, assetIdToDelete, folderDocumentNode, closeDeletePopupDialog, documentSource, popupId, triggerKey, findDiagramPreviewFrame, lightInputElement, cancelRemovesComponent, lightingPayload, lightFieldElement, openLightingPanel, lightInputNode, onFloorplanAutoLightingResetButtonClick, onFloorplanAutoLightingCloseButtonClick, applyLightingPanelDragMove } = bindDeps(lightingPanelDeps)({ actionDraftDocument: actionDraftDocumentImpl, targetPageCandidate: targetPageCandidateImpl, buttonVisibilityDraftDocument: buttonVisibilityDraftDocumentImpl, titleButtonIconOptionClickEvent: titleButtonIconOptionClickEventImpl, titleButtonIconDraftDocument: titleButtonIconDraftDocumentImpl, lightStatisticsIconCopyError: lightStatisticsIconCopyErrorImpl, lightStatisticsEntityListClickEvent: lightStatisticsEntityListClickEventImpl, imageEntityDraftDocument: imageEntityDraftDocumentImpl, openAssetPicker: openAssetPickerImpl, assetIdToDelete: assetIdToDeleteImpl, folderDocumentNode: folderDocumentNodeImpl, closeDeletePopupDialog: closeDeletePopupDialogImpl, documentSource: documentSourceImpl, popupId: popupIdImpl, triggerKey: triggerKeyImpl, findDiagramPreviewFrame: findDiagramPreviewFrameImpl, lightInputElement: lightInputElementImpl, cancelRemovesComponent: cancelRemovesComponentImpl, lightingPayload: lightingPayloadImpl, lightFieldElement: lightFieldElementImpl, openLightingPanel: openLightingPanelImpl, lightInputNode: lightInputNodeImpl, onFloorplanAutoLightingResetButtonClick: onFloorplanAutoLightingResetButtonClickImpl, onFloorplanAutoLightingCloseButtonClick: onFloorplanAutoLightingCloseButtonClickImpl, applyLightingPanelDragMove: applyLightingPanelDragMoveImpl })
const { closeAutoDiagramDialog, settleAutoDiagramDialog, cancelRemoveDraftDocument, bindMessageSection, onWindowMessage, exportSpliceError, collectPageImages, createImageAlignOption, openImageAlignDialog, applyAirConditionerPreviewState, airflowSectionEvent, previewSyncEventName, onCoverSettingsKindClick, coverKindDraftDocument, navigationSavedPropertyKey, previewDateResize, previewWeatherComponentResize, setNavigationPreviewState, applyNavigationPreviewState, syncNavigationPreviewFromElement, navigationPropertyNameFromElement, resolveComponentStyleValue, collectChangedLineChartStyleKeys, formatLineChartStyleValue, resolveNavigationStyleValue } = bindDeps(navigationPreviewDeps)({ closeAutoDiagramDialog: closeAutoDiagramDialogImpl, settleAutoDiagramDialog: settleAutoDiagramDialogImpl, cancelRemoveDraftDocument: cancelRemoveDraftDocumentImpl, bindMessageSection: bindMessageSectionImpl, onWindowMessage: onWindowMessageImpl, exportSpliceError: exportSpliceErrorImpl, collectPageImages: collectPageImagesImpl, createImageAlignOption: createImageAlignOptionImpl, openImageAlignDialog: openImageAlignDialogImpl, applyAirConditionerPreviewState: applyAirConditionerPreviewStateImpl, airflowSectionEvent: airflowSectionEventImpl, previewSyncEventName: previewSyncEventNameImpl, onCoverSettingsKindClick: onCoverSettingsKindClickImpl, coverKindDraftDocument: coverKindDraftDocumentImpl, navigationSavedPropertyKey: navigationSavedPropertyKeyImpl, previewDateResize: previewDateResizeImpl, previewWeatherComponentResize: previewWeatherComponentResizeImpl, setNavigationPreviewState: setNavigationPreviewStateImpl, applyNavigationPreviewState: applyNavigationPreviewStateImpl, syncNavigationPreviewFromElement: syncNavigationPreviewFromElementImpl, navigationPropertyNameFromElement: navigationPropertyNameFromElementImpl, resolveComponentStyleValue: resolveComponentStyleValueImpl, collectChangedLineChartStyleKeys: collectChangedLineChartStyleKeysImpl, formatLineChartStyleValue: formatLineChartStyleValueImpl, resolveNavigationStyleValue: resolveNavigationStyleValueImpl })
const { collectChangedTitleButtonStyleKeys, onNavigationStyleApplyCancelButtonClick, onNavigationStyleApplyConfirmButtonClick, collectChangedAirConditionerStyleKeys, formatAirConditionerStyleValue, resolveAirConditionerStyleValue, collectChangedIconButtonEffectStyleKeys, formatIconButtonEffectStyleValue, normalizeSensorKind, formatSensorKindLabel, resolvePresenceSensorStyleKeys, styleTargetCheckbox, appliedStylePropertyKey, onNavigationIconCopyButtonClick, navigationIconCopyError, resolveCameraStyleValue, collectChangedCameraStyleKeys, formatCameraStyleValue, resolvePanelFrameStyleValue, collectChangedPanelFrameStyleKeys, formatPanelFrameStyleValue, entryStateRecord, areStyleValuesEqual, onImageAssetUploadButtonClick, onAssetOptionsClick } = bindDeps(styleApplyDeps)({ collectChangedTitleButtonStyleKeys: collectChangedTitleButtonStyleKeysImpl, onNavigationStyleApplyCancelButtonClick: onNavigationStyleApplyCancelButtonClickImpl, onNavigationStyleApplyConfirmButtonClick: onNavigationStyleApplyConfirmButtonClickImpl, collectChangedAirConditionerStyleKeys: collectChangedAirConditionerStyleKeysImpl, formatAirConditionerStyleValue: formatAirConditionerStyleValueImpl, resolveAirConditionerStyleValue: resolveAirConditionerStyleValueImpl, collectChangedIconButtonEffectStyleKeys: collectChangedIconButtonEffectStyleKeysImpl, formatIconButtonEffectStyleValue: formatIconButtonEffectStyleValueImpl, normalizeSensorKind: normalizeSensorKindImpl, formatSensorKindLabel: formatSensorKindLabelImpl, resolvePresenceSensorStyleKeys: resolvePresenceSensorStyleKeysImpl, styleTargetCheckbox: styleTargetCheckboxImpl, appliedStylePropertyKey: appliedStylePropertyKeyImpl, onNavigationIconCopyButtonClick: onNavigationIconCopyButtonClickImpl, navigationIconCopyError: navigationIconCopyErrorImpl, resolveCameraStyleValue: resolveCameraStyleValueImpl, collectChangedCameraStyleKeys: collectChangedCameraStyleKeysImpl, formatCameraStyleValue: formatCameraStyleValueImpl, resolvePanelFrameStyleValue: resolvePanelFrameStyleValueImpl, collectChangedPanelFrameStyleKeys: collectChangedPanelFrameStyleKeysImpl, formatPanelFrameStyleValue: formatPanelFrameStyleValueImpl, entryStateRecord: entryStateRecordImpl, areStyleValuesEqual: areStyleValuesEqualImpl, onImageAssetUploadButtonClick: onImageAssetUploadButtonClickImpl, onAssetOptionsClick: onAssetOptionsClickImpl })
const { collectPendingNavigationStyleKeys, onDeleteAssetCancelButtonClick, applyNavigationStyleToTargets, openNavigationStyleApplyDialog, onImageAssetFolderSelectChange, imageAssetPointerOverEvent, imageAssetClickEvent, openCameraStyleApplyDialog, openTitleButtonStyleApplyDialog, openIconButtonEffectStyleApplyDialog, openAirConditionerStyleApplyDialog, openIconButtonStyleApplyDialog, imageAssetMeasureError, applyInspectorDimensionChange, onIconButtonEffectAssetFolderSelectChange, applyEffectAssetDimensionChange, applyCameraDimensionChange, applyLineChartDimensionChange, recoveredComponentId, onErrorDialogCloseButtonClick, onShowSharedComponentsButtonClick, onComponentTemplateDialogClick, closePopupRenameDialog, createCopyBackupDeps, renderCopyBackupDialog } = bindDeps(styleDialogsDeps)({ collectPendingNavigationStyleKeys: collectPendingNavigationStyleKeysImpl, onDeleteAssetCancelButtonClick: onDeleteAssetCancelButtonClickImpl, applyNavigationStyleToTargets: applyNavigationStyleToTargetsImpl, openNavigationStyleApplyDialog: openNavigationStyleApplyDialogImpl, onImageAssetFolderSelectChange: onImageAssetFolderSelectChangeImpl, imageAssetPointerOverEvent: imageAssetPointerOverEventImpl, imageAssetClickEvent: imageAssetClickEventImpl, openCameraStyleApplyDialog: openCameraStyleApplyDialogImpl, openTitleButtonStyleApplyDialog: openTitleButtonStyleApplyDialogImpl, openIconButtonEffectStyleApplyDialog: openIconButtonEffectStyleApplyDialogImpl, openAirConditionerStyleApplyDialog: openAirConditionerStyleApplyDialogImpl, openIconButtonStyleApplyDialog: openIconButtonStyleApplyDialogImpl, imageAssetMeasureError: imageAssetMeasureErrorImpl, applyInspectorDimensionChange: applyInspectorDimensionChangeImpl, onIconButtonEffectAssetFolderSelectChange: onIconButtonEffectAssetFolderSelectChangeImpl, applyEffectAssetDimensionChange: applyEffectAssetDimensionChangeImpl, applyCameraDimensionChange: applyCameraDimensionChangeImpl, applyLineChartDimensionChange: applyLineChartDimensionChangeImpl, recoveredComponentId: recoveredComponentIdImpl, onErrorDialogCloseButtonClick: onErrorDialogCloseButtonClickImpl, onShowSharedComponentsButtonClick: onShowSharedComponentsButtonClickImpl, onComponentTemplateDialogClick: onComponentTemplateDialogClickImpl, closePopupRenameDialog: closePopupRenameDialogImpl, createCopyBackupDeps: createCopyBackupDepsImpl, renderCopyBackupDialog: renderCopyBackupDialogImpl })
const { titleButtonMenuDeps, loadNavigationIconOptions, positionTitleButtonIconMenu, stopHoverScroll, iconTooltipElementValue, inspectorSyncDeps, syncComponentActionControls, applyTransformToInspector, previewModeForIcon, sharedReferenceId, nudgeDeps, nudgeDeltaX, clickPopupListOption, onPopupListContextmenu, openEntityCopyBackupPicker, openLightStatisticsCopyBackupPicker, openPopupEntityCopyBackupPicker, onPopupModuleCancelButtonClick } = bindDeps(copyBackupPickersDeps)({ titleButtonMenuDeps: titleButtonMenuDepsImpl, loadNavigationIconOptions: loadNavigationIconOptionsImpl, positionTitleButtonIconMenu: positionTitleButtonIconMenuImpl, stopHoverScroll: stopHoverScrollImpl, iconTooltipElementValue: iconTooltipElementValueImpl, inspectorSyncDeps: inspectorSyncDepsImpl, syncComponentActionControls: syncComponentActionControlsImpl, applyTransformToInspector: applyTransformToInspectorImpl, previewModeForIcon: previewModeForIconImpl, sharedReferenceId: sharedReferenceIdImpl, nudgeDeps: nudgeDepsImpl, nudgeDeltaX: nudgeDeltaXImpl, clickPopupListOption: clickPopupListOptionImpl, onPopupListContextmenu: onPopupListContextmenuImpl, openEntityCopyBackupPicker: openEntityCopyBackupPickerImpl, openLightStatisticsCopyBackupPicker: openLightStatisticsCopyBackupPickerImpl, openPopupEntityCopyBackupPicker: openPopupEntityCopyBackupPickerImpl, onPopupModuleCancelButtonClick: onPopupModuleCancelButtonClickImpl })
const { onPopupModuleClimateDeviceTypeClick, selectAssetFolder, popupModuleTypeValue, requestDeleteUserAsset, requestDeleteAssetFolder, refreshAssetPickers, scaleDraftDocument, cancelDeletePopupDialog, onSessionsRevokeOthersConfirmButtonClick, onGlobalColorPickerHexTextInputInput, saturationPointerMoveEventState, mutationRecord } = bindDeps(assetManagementDeps)({ onPopupModuleClimateDeviceTypeClick: onPopupModuleClimateDeviceTypeClickImpl, selectAssetFolder: selectAssetFolderImpl, popupModuleTypeValue: popupModuleTypeValueImpl, requestDeleteUserAsset: requestDeleteUserAssetImpl, requestDeleteAssetFolder: requestDeleteAssetFolderImpl, refreshAssetPickers: refreshAssetPickersImpl, scaleDraftDocument: scaleDraftDocumentImpl, cancelDeletePopupDialog: cancelDeletePopupDialogImpl, onSessionsRevokeOthersConfirmButtonClick: onSessionsRevokeOthersConfirmButtonClickImpl, onGlobalColorPickerHexTextInputInput: onGlobalColorPickerHexTextInputInputImpl, saturationPointerMoveEventState: saturationPointerMoveEventStateImpl, mutationRecord: mutationRecordImpl })

// 路由 fade 过渡期间户型页与编辑器会短暂共存；限定在本页根节点内查询，避免撞 id。
  const editorRootElement =
    document.querySelector(".editor-chrome-root") || document;
  const findElement = (selectorState: any) =>
    editorRootElement.querySelector(selectorState);
// 拆分后 deps 工厂会用 ...homeElements 展开；先放稳定空对象，查询完成后原地填充。
const homeElements: any = {};
// 引导期注册的全局副作用句柄：卸载时必须显式释放（此前两个定时器与 body 级
// MutationObserver 都是「一次性注册、永不解绑」，切走编辑器后仍在后台唤醒主线程）。
let editorBodyObserver: MutationObserver | null = null;
const editorPollCleanups: Array<() => void> = [];
installSettingsDialogBackdropGuard2();
// 组件族是全量的按需 chunk：编辑器里用户随时能插入任意类型，所以这里**在引导阶段就预取全量**，
// 不跟着某份草稿裁剪。预取与随后的取数/建 DOM 并行，正常情况下第一次 setDocument 时已就绪；
// 万一没赶上，`PanelRenderer.setDocument` 末尾还有一次「补到新族就重渲染」的兜底。
ensureRegistryComponents2().catch((registryError: unknown) => {
  console.error("[editor] 组件族 chunk 预取失败", registryError);
});
const EDITOR_DESIGN_WIDTH = 1020,
  AUTO_DIAGRAM_LAYOUT_VERSION = 2,
  COMPONENT_DIALOG_DESIGN_WIDTH = 1920,
  COMPONENT_DIALOG_DESIGN_HEIGHT = 1080,
  COMPONENT_DIALOG_SCALE_MULTIPLIER = 1,
  editorHeaderElement = findElement(".editor-header"),
  editorShellElement = findElement(".editor-shell");
/** 整页 scale 已废弃：改由 Vue 壳层自适应 + 画布独立 zoom。 */
function shellControlsDeps(): ShellControlsDeps {
  return {
    ...homeElements,
    get airConditionerInspectorContext() { return airConditionerInspectorContext; },
    get buttonSoundController() { return buttonSoundController; },
    get closeDropdownMenu() { return closeDropdownMenu; },
    get colorPickerBoundInputById() { return colorPickerBoundInputById; },
    get COMPONENT_DIALOG_DESIGN_HEIGHT() { return COMPONENT_DIALOG_DESIGN_HEIGHT; },
    get COMPONENT_DIALOG_DESIGN_WIDTH() { return COMPONENT_DIALOG_DESIGN_WIDTH; },
    get COMPONENT_DIALOG_SCALE_MULTIPLIER() { return COMPONENT_DIALOG_SCALE_MULTIPLIER; },
    get coverKindDraftDocument() { return coverKindDraftDocument; },
    get EDITOR_DESIGN_WIDTH() { return EDITOR_DESIGN_WIDTH; },
    get editorCtx() { return editorCtx; },
    get editorHeaderElement() { return editorHeaderElement; },
    get editorShellElement() { return editorShellElement; },
    get errorPhase() { return errorPhase; },
    get iconButtonInspectorContext() { return iconButtonInspectorContext; },
    get lineChartInspectorContext() { return lineChartInspectorContext; },
    get navigationInspectorContext() { return navigationInspectorContext; },
    get numberStepperDeps() { return numberStepperDeps; },
    get openEntityPicker() { return openEntityPicker; },
    get positionTitleButtonIconMenu() { return positionTitleButtonIconMenu; },
    get refreshSoundToggle() { return refreshSoundToggle; },
    get renderWorkspaceResolution() { return renderWorkspaceResolution; },
    get requestJsonDeps() { return requestJsonDeps; },
    get runEntry() { return openColorPickerForInput; },
    get setWorkspaceHasProject() { return setWorkspaceHasProject; },
    get unbindDisplayDeviceError() { return unbindDisplayDeviceError; },
    get value() { return value; },
  };
}
(refreshEditorViewportFit(), refreshComponentDialogScale());
Object.assign(homeElements, queryEditorElements(findElement));
const {
  saveButtonElement, projectNewElement, projectSelectElement, projectActionsButtonElement, projectActionsMenuElement, projectFloorplanOpenElement, navigatorContentElement, showPopupEditorButtonElement,
  pageNewButtonElement, showPageEditorElement, showPopupEditorElement, pageNewElement, pageSelectElement, pageActionsButtonElement, pageActionsMenuElement, defaultPageActionElement,
  popupNewElement, popupSelectElement, popupListElement, popupActionsButtonElement, popupActionsMenuElement, showSharedComponentsElement, showPageComponentsElement, addComponentButtonElement,
  componentTemplateDialogElement, componentTemplateCloseElement, componentTemplateScopeElement, componentTemplateListElement, sharedComponentListElement, pageComponentListElement, componentMenuElement, projectDialogElement,
  projectDialogKickerElement, projectDialogTitleElement, projectCloseElement, projectCancelElement, projectFormElement, projectSubmitElement, projectMessageElement, projectTemplateFieldsElement,
  projectTemplateOptionsElement, projectPreviewDialogElement, projectPreviewTitleElement, projectPreviewCountElement, projectPreviewImageElement, projectPreviewPreviousElement, projectPreviewNextElement, projectPreviewCloseElement,
  projectCanvasFieldsElement, projectCanvasWidthElement, projectCanvasHeightElement, projectAspectRatioElement, projectAspectLockElement, projectAspectLockLabelElement, projectCanvasHintElement, projectContentLockFieldsElement,
  projectContentLockElement, projectResizeWarningDialogElement, projectResizeWarningTextElement, projectResizeWarningCloseElement, projectResizeWarningCancelElement, projectResizeWarningConfirmElement, pageDialogElement, pageDialogKickerElement,
  pageDialogTitleElement, pageCloseElement, pageCancelElement, pageFormElement, pageSubmitElement, pageMessageElement, componentGroupRenameDialogElement, componentGroupRenameCloseElement,
  componentGroupRenameCancelElement, componentGroupRenameFormElement, componentGroupRenameInputElement, componentGroupRenameMessageElement, editorCanvasElement, displayDeviceCountElement, workspaceTitleElement, workspaceResolutionElement,
  soundToggleButtonElement, deleteProjectDialogElement, deleteProjectCloseButtonElement, deleteProjectCancelButtonElement, deleteProjectFormElement, deleteProjectNameElement, deleteProjectMessageElement, deletePageDialogElement,
  deletePageCloseButtonElement, deletePageCancelButtonElement, deletePageConfirmButtonElement, deletePageNameElement, deletePageMessageElement, deleteComponentDialogElement, deleteComponentCloseButtonElement, deleteComponentCancelButtonElement,
  deleteComponentConfirmButtonElement, deleteComponentNameElement, copyComponentPageDialogElement, copyComponentPageCloseButtonElement, copyComponentPageCancelButtonElement, copyComponentPageFormElement, copyComponentPageNameElement, copyComponentPageScopeSelectElement,
  copyComponentPageProjectFieldElement, copyComponentPageProjectSelectElement, copyComponentPageTargetLabelElement, copyComponentPageTargetElement, copyComponentScaleOptionsElement, copyComponentResolutionSummaryElement, copyComponentPageMessageElement, copyComponentPageSubmitElement,
  copyComponentSuccessDialogElement, copyComponentSuccessMessageElement, copyComponentSuccessStayElement, copyComponentSuccessGoElement, errorDialogCloseButtonElement, errorDialogCloseElement, errorDialogConfirmElement, errorDialogMessageElement,
  recoveryDialogElement, recoveryDiscardElement, recoveryRestoreElement, undoElement, redoElement, inspectorEmptyElement, navigatorElement, imageInspectorElement,
  imageTypeElement, imageLabelElement, imageEntityButtonElement, imageEntityMenuElement, imageEntitySearchElement, imageEntityOptionsElement, imageAssetButtonElement, imageAssetMenuElement,
  imageAssetFolderSelectElement, imageAssetSearchInputElement, imageAssetOptionsElement, imageAssetUploadButtonElement, imageAssetUploadInputElement, imageAssetUploadHintElement, imageAssetLargePreviewImageElement, imageAssetLargePreviewImageElementElement,
  imageAssetLargePreviewNameElement, globalColorPickerElement, globalColorPickerSvElement, globalColorPickerMarkerElement, globalColorPickerHueRangeInputElement, globalColorPickerSwatchElement, globalColorPickerHexTextInputElement, globalColorPickerCopyButtonElement,
  globalColorPickerPasteButtonElement, globalColorPickerRedInputElement, globalColorPickerGreenInputElement, globalColorPickerBlueInputElement, imageOpacityInputElement, imageLayoutOptionsElement, imageLeftInputElement, imageTopInputElement,
  imageScaleInputElement, imageRotationInputElement, floorplanAutoDiagramInspectorFormElement, floorplanAutoDiagramStatusElement, floorplanAutoDiagramOpenStudioButtonElement, floorplanAutoDiagramViewToggleButtonElement, floorplanAutoDiagramLabelTextInputElement, floorplanAutoDiagramFolderTextInputElement,
  floorplanAutoDiagramLayoutElement, floorplanAutoDiagramLeftInputElement, floorplanAutoDiagramTopInputElement, floorplanAutoDiagramWidthInputElement, floorplanAutoDiagramHeightInputElement, floorplanAutoDiagramScaleInputElement, floorplanAutoDiagramRotationInputElement, floorplanAutoDiagramFloorSelectElement,
  floorplanAutoDiagramCameraViewElement, floorplanAutoDiagramCameraModeElement, floorplanAutoDiagramFocalLengthInputElement, floorplanAutoDiagramRotateTopButtonElement, floorplanAutoDiagramOpenBaseLightingButtonElement, floorplanAutoDiagramBindingsElement, floorplanAutoDiagramBindingListElement, floorplanAutoLightingPanelElement,
  floorplanAutoLightingHandleElement, floorplanAutoLightingCloseButtonElement, floorplanAutoLightingResetButtonElement, floorplanAutoLightingSaveButtonElement, floorplanAutoLightingStatusElement, floorplanBaseLightElements, componentActionControlsElement, floorplanAutoDiagramDialogElement,
  floorplanAutoDiagramCloseButtonElement, floorplanAutoDiagramGuideElement, floorplanAutoDiagramLaterButtonElement, floorplanAutoDiagramContinueElement, iconButtonEffectInspectorElement, ibeLabelElement, ibeEntityButtonElement, ibeEntityMenuElement,
  ibeEntitySearchElement, ibeEntityOptionsElement, ibeColorTemperatureRealtimeElement, ibeBrightnessRealtimeElement, ibePreviewStateElement, ibeLayerOptionsElement, ibeButtonSectionElement, ibeEffectSectionElement,
  ibeButtonVisibleElement, ibeEffectVisibleElement, ibeButtonTransformSectionElement, ibeActionSectionElement, ibeIconButtonElement, ibeIconCopyElement, ibeIconMenuElement, ibeIconSearchElement,
  ibeIconOptionsElement, ibeIconOffColorElement, ibeIconOnColorElement, ibeIconSizeElement, ibeButtonOffColorElement, ibeButtonOnColorElement, ibeButtonOpacityElement, ibeFrameColorElement,
  ibeFrameWidthElement, ibeFrameOpacityElement, ibeRadiusElement, ibeGlowColorElement, ibeGlowOffStrengthElement, ibeGlowOnStrengthElement, ibeAssetButtonElement, ibeAssetMenuElement,
  ibeAssetFolderElement, ibeAssetSearchElement, ibeAssetOptionsElement, ibeAssetUploadElement, ibeAssetUploadInputElement, ibeAssetUploadHintElement, ibeEffectOpacityElement, ibeEffectFadeDurationElement,
  ibeEffectLayoutOptionsElement, ibeEffectAlignImageElement, ibeEffectLeftElement, ibeEffectTopElement, ibeEffectScaleElement, ibeEffectRotationElement, ibeEffectSizeHintElement, effectImageAlignDialogElement,
  effectImageAlignCloseElement, effectImageAlignCancelElement, effectImageAlignConfirmElement, effectImageAlignOptionsElement, effectImageAlignMessageElement, ibeLeftElement, ibeTopElement, ibeWidthElement,
  ibeHeightElement, ibeScaleElement, ibeRotationElement, ibeActionControlsElement, ibeApplyStyleElement, ibeApplyCountElement, titleButtonInspectorElement, titleButtonLabelElement,
  titleButtonEntityButtonElement, titleButtonEntityMenuElement, titleButtonEntitySearchElement, titleButtonEntityOptionsElement, titleButtonMainVisibleElement, titleButtonSecondaryVisibleElement, titleButtonMainTextElement, titleButtonSecondaryLine1Element,
  titleButtonSecondaryLine2Element, titleButtonMainColorElement, titleButtonSecondaryColorElement, titleButtonMainSizeElement, titleButtonSecondarySizeElement, titleButtonMainWeightElement, titleButtonSecondaryWeightElement, titleButtonMainSpacingElement,
  titleButtonSecondarySpacingElement, titleButtonSecondaryLineGapElement, titleButtonMainLeftElement, titleButtonMainTopElement, titleButtonSecondaryLeftElement, titleButtonSecondaryTopElement, titleButtonIconVisibleElement, titleButtonIconButtonElement,
  titleButtonIconCopyElement, titleButtonIconMenuElement, titleButtonIconSearchElement, titleButtonIconOptionsElement, titleButtonIconColorElement, titleButtonIconSizeElement, titleButtonIconLeftElement, titleButtonIconTopElement,
  titleButtonFrameColorElement, titleButtonFrameVisibleElement, titleButtonFrameWidthElement, titleButtonFrameSizeElement, titleButtonFrameSpacingElement, titleButtonFrameOffsetXElement, titleButtonFrameOffsetYElement, titleButtonMarkerVisibleElement,
  titleButtonMarkerColorElement, titleButtonMarkerSizeElement, titleButtonMarkerLeftElement, titleButtonMarkerTopElement, titleButtonLeftElement, titleButtonTopElement, titleButtonWidthElement, titleButtonHeightElement,
  titleButtonScaleElement, titleButtonRotationElement, titleButtonActionControlsElement, titleButtonApplyStyleElement, titleButtonApplyCountElement, lightStatisticsInspectorElement, lightStatisticsLabelElement, lightStatisticsTitleElement,
  lightStatisticsEntityButtonElement, lightStatisticsEntityMenuElement, lightStatisticsEntitySearchElement, lightStatisticsEntityOptionsElement, lightStatisticsEntityPendingElement, lightStatisticsEntityConfirmElement, lightStatisticsEntityMessageElement, lightStatisticsEntityListElement,
  lightStatisticsEntityCountElement, lightStatisticsActionEntityButtonElement, lightStatisticsActionEntityMenuElement, lightStatisticsActionEntitySearchElement, lightStatisticsActionEntityOptionsElement, lightStatisticsActionNoteElement, lightStatisticsActionControlsElement, lightStatisticsIconButtonElement,
  lightStatisticsIconCopyElement, lightStatisticsIconMenuElement, lightStatisticsIconSearchElement, lightStatisticsIconOptionsElement, lightStatisticsIconVisibleElement, lightStatisticsIconColorElement, lightStatisticsIconActiveColorElement, lightStatisticsIconSizeElement,
  lightStatisticsTitleVisibleElement, lightStatisticsTitleColorElement, lightStatisticsTitleSizeElement, lightStatisticsTitleWeightElement, lightStatisticsTitleSpacingElement, lightStatisticsCountVisibleElement, lightStatisticsCountColorElement, lightStatisticsCountActiveColorElement,
  lightStatisticsCountSizeElement, lightStatisticsCountWeightElement, lightStatisticsCountSpacingElement, lightStatisticsIconGapElement, lightStatisticsCountGapElement, lightStatisticsLeftElement, lightStatisticsTopElement, lightStatisticsWidthElement,
  lightStatisticsHeightElement, lightStatisticsScaleElement, lightStatisticsRotationElement, iconButtonInspectorElement, iconButtonTypeLabelElement, iconButtonTypeElement, iconButtonLabelElement, presenceSensorKindLabelElement,
  presenceSensorKindElement, iconButtonEntityButtonElement, iconButtonEntityMenuElement, iconButtonEntitySearchElement, iconButtonEntityOptionsElement, coverSettingsInspectorElement, coverSettingsKindElement, coverSettingsDirectionElement,
  coverSettingsMotorDirectionElement, iconButtonPreviewStateElement, iconButtonPreviewControlElement, iconButtonIconButtonElement, iconButtonIconCopyElement, iconButtonIconMenuElement, iconButtonIconSearchElement, iconButtonIconOptionsElement,
  iconButtonIconColorElement, iconButtonIconColorLabelElement, deviceButtonIconVisibleElement, deviceButtonIconOnColorElement, deviceButtonIconOnColorLabelElement, deviceButtonBadgeColorElement, deviceButtonBadgeColorLabelElement, deviceButtonBadgeOpacityElement,
  deviceButtonBadgeOpacityLabelElement, iconButtonIconSizeElement, iconButtonIconSizeLabelElement, deviceButtonSymbolSizeElement, deviceButtonSymbolSizeLabelElement, deviceButtonBadgeSizeElement, deviceButtonBadgeSizeLabelElement, deviceButtonStatePrecisionElement,
  deviceButtonStatePrecisionLabelElement, iconButtonIconOffOpacityElement, iconButtonIconOnOpacityElement, iconButtonIconOffOpacityLabelElement, iconButtonIconOnOpacityLabelElement, iconButtonIconLeftElement, iconButtonIconTopElement, iconButtonMainTextElement,
  iconButtonSecondaryTextElement, iconButtonMainHeadingElement, deviceButtonMainVisibleElement, iconButtonSecondaryHeadingElement, deviceButtonSecondaryVisibleElement, iconButtonMainContentLabelElement, iconButtonSecondaryContentLabelElement, iconButtonMainColorElement,
  iconButtonSecondaryColorElement, iconButtonMainOffOpacityElement, iconButtonMainOnOpacityElement, iconButtonSecondaryOffOpacityElement, iconButtonSecondaryOnOpacityElement, iconButtonMainOffOpacityLabelElement, iconButtonMainOnOpacityLabelElement, iconButtonSecondaryOffOpacityLabelElement,
  iconButtonSecondaryOnOpacityLabelElement, iconButtonMainSizeElement, iconButtonSecondarySizeElement, iconButtonMainWeightElement, iconButtonSecondaryWeightElement, iconButtonMainSpacingElement, iconButtonSecondarySpacingElement, iconButtonMainLeftElement,
  iconButtonMainTopElement, iconButtonSecondaryLeftElement, iconButtonSecondaryTopElement, iconButtonOnFillVisibleElement, iconButtonFillSectionElement, iconButtonOnFillColorElement, iconButtonOnFillStrengthElement, iconButtonOnFillFadeDurationElement,
  iconButtonFrameVisibleElement, iconButtonFrameSectionElement, iconButtonFrameWidthElement, iconButtonFrameAngleElement, iconButtonFrameOffOpacityElement, iconButtonFrameOnOpacityElement, iconButtonCutCornerElement, iconButtonSoftLightVisibleElement,
  iconButtonSoftLightSectionElement, iconButtonSoftLightColorElement, iconButtonSoftLightStrengthElement, iconButtonSoftLightSizeElement, iconButtonSoftLightAngleElement, iconButtonGlowVisibleElement, iconButtonGlowSectionElement, iconButtonGlowColorElement,
  iconButtonGlowStrengthElement, iconButtonGlowSizeElement, iconButtonGlowAngleElement, iconButtonLeftElement, iconButtonTopElement, iconButtonWidthElement, iconButtonHeightElement, iconButtonScaleElement,
  iconButtonRotationElement, iconButtonActionControlsElement, iconButtonActionSectionElement, iconButtonPreviewDetailsElement, iconButtonApplyStyleElement, iconButtonApplyCountElement, presenceMotionSectionElement, doorWindowPerspectiveSectionElement,
  doorWindowPerspectiveEditElement, doorWindowPerspectiveResetElement, doorWindowPerspectiveSaveElement, presenceHaloVisibleElement, presenceHaloScaleXElement, presenceHaloScaleYElement, presenceHaloRotationElement, presenceHaloOpacityElement,
  presencePersonVisibleElement, presencePersonScaleElement, presencePersonRotationElement, presencePersonOpacityElement, presenceOrbitDurationElement, airConditionerInspectorElement, airConditionerLabelElement, airConditionerDeviceTypeElement,
  airConditionerEntityButtonElement, airConditionerEntityMenuElement, airConditionerEntitySearchElement, airConditionerEntityOptionsElement, airConditionerPreviewStateElement, airConditionerLayerOptionsElement, airConditionerButtonSectionElement, airConditionerAirflowSectionElement,
  airConditionerTransformSectionElement, airConditionerActionSectionElement, airConditionerIconVisibleElement, airConditionerIconOffColorElement, airConditionerIconOnColorElement, airConditionerBadgeColorElement, airConditionerBadgeOpacityElement, airConditionerSymbolSizeElement,
  airConditionerBadgeSizeElement, airConditionerIconLeftElement, airConditionerIconTopElement, airConditionerMainVisibleElement, airConditionerMainTextElement, airConditionerMainColorElement, airConditionerMainSizeElement, airConditionerMainWeightElement,
  airConditionerMainSpacingElement, airConditionerMainLeftElement, airConditionerMainTopElement, airConditionerSecondaryVisibleElement, airConditionerSecondaryTextElement, airConditionerSecondaryColorElement, airConditionerSecondarySizeElement, airConditionerSecondaryWeightElement,
  airConditionerSecondarySpacingElement, airConditionerSecondaryLeftElement, airConditionerSecondaryTopElement, airConditionerAirflowVisibleElement, airConditionerAirflowMotionElement, airConditionerAirflowCoolColorElement, airConditionerAirflowHeatColorElement, airConditionerAirflowOtherColorElement,
  airConditionerAirflowAngleElement, airConditionerAirflowCurveElement, airConditionerAirflowLengthElement, airConditionerAirflowFadeElement, airConditionerAirflowSpreadElement, airConditionerAirflowDensityElement, airConditionerAirflowIrregularityElement, airConditionerAirflowThicknessElement,
  airConditionerAirflowStrengthElement, airConditionerAirflowBlurElement, airConditionerAirflowSpeedElement, airConditionerAirflowOffsetXElement, airConditionerAirflowOffsetYElement, airConditionerAirflowWidthElement, airConditionerAirflowHeightElement, airConditionerAirflowScaleElement,
  airConditionerAirflowRotationElement, airConditionerLeftElement, airConditionerTopElement, airConditionerWidthElement, airConditionerHeightElement, airConditionerScaleElement, airConditionerRotationElement, airConditionerActionControlsElement,
  airConditionerPreviewDetailsElement, airConditionerApplyStyleElement, airConditionerApplyCountElement, vacuumMapInspectorElement, vacuumMapLabelElement, vacuumMapEntityButtonElement, vacuumMapEntityMenuElement, vacuumMapEntitySearchElement,
  vacuumMapEntityOptionsElement, vacuumMapOpacityElement, vacuumMapLeftElement, vacuumMapTopElement, vacuumMapScaleElement, vacuumMapRotationElement, cameraInspectorElement, cameraLabelElement,
  cameraSourceOptionsElement, cameraEntityPickerElement, cameraGo2rtcUrlFieldElement, cameraGo2rtcUrlElement, cameraGo2rtcNoteElement, cameraEntityButtonElement, cameraEntityMenuElement, cameraEntitySearchElement,
  cameraEntityOptionsElement, cameraFitOptionsElement, cameraDisplayModeOptionsElement, cameraRefreshIntervalFieldElement, cameraRefreshIntervalElement, cameraMediaVisibleElement, cameraFrameVisibleElement, cameraFrameColorElement,
  cameraFrameWidthElement, cameraRadiusElement, cameraFrameAngleElement, cameraFrameOpacityElement, cameraLeftElement, cameraTopElement, cameraWidthElement, cameraHeightElement,
  cameraScaleElement, cameraRotationElement, cameraActionControlsElement, cameraApplyStyleElement, cameraApplyCountElement, timeInspectorElement, timeTypeElement, timeLabelElement,
  timeHourFormatElement, timeSecondsElement, timeColorElement, timeFontSizeElement, timeFontWeightElement, timeLetterSpacingElement, timeOpacityElement, timeLeftElement,
  timeTopElement, timeScaleElement, timeRotationElement, dateInspectorElement, dateTypeElement, dateLabelElement, dateWeekdayElement, dateLunarElement,
  datePrimaryColorElement, datePrimarySizeElement, datePrimaryWeightElement, datePrimarySpacingElement, dateLunarColorElement, dateLunarSizeElement, dateLunarWeightElement, dateLunarSpacingElement,
  dateLineGapElement, dateOpacityElement, dateLeftElement, dateTopElement, dateScaleElement, dateRotationElement, weatherInspectorElement, weatherTypeElement,
  weatherLabelElement, weatherEntityButtonElement, weatherEntityMenuElement, weatherEntitySearchElement, weatherEntityOptionsElement, weatherIconVisibleElement, weatherTemperatureVisibleElement, weatherConditionVisibleElement,
  weatherHumidityVisibleElement, weatherIconSizeElement, weatherIconGapElement, weatherTemperatureColorElement, weatherTemperatureSizeElement, weatherTemperatureWeightElement, weatherTemperatureSpacingElement, weatherSecondaryColorElement,
  weatherSecondarySizeElement, weatherSecondaryWeightElement, weatherSecondarySpacingElement, weatherLineGapElement, weatherOpacityElement, weatherLeftElement, weatherTopElement, weatherScaleElement,
  weatherRotationElement, lineChartInspectorElement, eventLogWallInspectorElement, eventLogWallTypeElement, eventLogWallLabelElement, eventLogWallEnabledElement, eventLogWallTitleElement, eventLogWallTitleVisibleElement,
  eventLogWallTitleSizeElement, eventLogWallTitleColorElement, eventLogWallTitleAlignElement, eventLogWallMaxEntriesElement, eventLogWallDisplayDurationElement, eventLogWallWatchScopeElement, eventLogWallEntityIdsElement, eventLogWallFontSizeElement,
  eventLogWallRadiusElement, eventLogWallBgOpacityElement, eventLogWallBlurElement, eventLogWallClickModeElement, eventLogWallShowFooterElement, eventLogWallFooterTextElement, eventLogWallOnColorElement, eventLogWallOffColorElement,
  eventLogWallAttrColorElement, eventLogWallClimateColorElement, eventLogWallAlertColorElement, eventLogWallMutedColorElement, lineChartTypeElement, lineChartLabelElement, lineChartEntityButtonElement, lineChartEntityMenuElement,
  lineChartEntitySearchInputElement, lineChartEntityOptionsElement, lineChartValueVisibleElement, lineChartValueScaleInputElement, lineChartValueColorInputElement, lineChartStatePrecisionSelectElement, lineChartValueOffsetXInputElement, lineChartValueOffsetYInputElement,
  lineChartUpdateIntervalInputElement, lineChartHoursInputElement, lineChartCurveRadiusInputElement, lineChartThresholdModeSelectElement, lineChartThresholdInputs, lineChartLeftInputElement, lineChartTopInputElement, lineChartWidthInputElement,
  lineChartHeightInputElement, lineChartScaleInputElement, lineChartRotationInputElement, lineChartActionControlsElement, lineChartApplyStyleButtonElement, lineChartApplyCountElement, panelFrameInspectorFormElement, panelFrameTypeTextInputElement,
  panelFrameLabelTextInputElement, panelFrameMainVisibleButtonElement, panelFrameMainTextInputElement, panelFrameMainColorInputElement, panelFrameMainSizeInputElement, panelFrameMainWeightInputElement, panelFrameMainOpacityInputElement, panelFrameMainSpacingInputElement,
  panelFrameMainLeftInputElement, panelFrameMainTopInputElement, panelFrameSecondaryVisibleButtonElement, panelFrameSecondaryTextInputElement, panelFrameSecondaryColorInputElement, panelFrameSecondarySizeInputElement, panelFrameSecondaryWeightInputElement, panelFrameSecondaryOpacityInputElement,
  panelFrameSecondarySpacingInputElement, panelFrameSecondaryLeftInputElement, panelFrameSecondaryTopInputElement, panelFrameEdgeVisibleButtonElement, panelFrameEdgeColorInputElement, panelFrameEdgeWidthInputElement, panelFrameEdgeOpacityInputElement, panelFrameRadiusInputElement,
  panelFrameEdgeAngleInputElement, panelFrameGlowVisibleButtonElement, panelFrameGlowColorInputElement, panelFrameGlowStrengthInputElement, panelFrameGlowSizeInputElement, panelFrameGlowAngleInputElement, panelFrameLeftInputElement, panelFrameTopInputElement,
  panelFrameWidthInputElement, panelFrameHeightInputElement, panelFrameScaleInputElement, panelFrameRotationInputElement, panelFrameApplyStyleButtonElement, panelFrameApplyCountElement, navigationInspectorFormElement, sceneModeControlElement,
  sceneModeHintElement, navigationLabelTextInputElement, navigationTypeElement, navigationLabelElement, navigationPreviewStateElement, navigationEntityButtonElement, navigationEntityMenuElement, navigationEntitySearchElement,
  navigationEntityOptionsElement, navigationMainTextElement, navigationSecondaryTextElement, navigationMainVisibleElement, navigationSecondaryVisibleElement, navigationIconVisibleElement, navigationFrameVisibleElement, navigationGlowVisibleElement,
  navigationIconButtonElement, navigationIconCopyElement, navigationIconMenuElement, navigationIconSearchElement, navigationIconOptionsElement, navigationMainColorElement, navigationSecondaryColorElement, navigationMainSizeElement,
  navigationSecondarySizeElement, navigationMainWeightElement, navigationSecondaryWeightElement, navigationMainSpacingElement, navigationSecondarySpacingElement, navigationMainTextLeftElement, navigationMainTextTopElement, navigationSecondaryTextLeftElement,
  navigationSecondaryTextTopElement, navigationTextIdleOpacityElement, navigationTextActiveOpacityElement, navigationIconColorElement, navigationIconSizeElement, navigationIconLeftElement, navigationIconTopElement, navigationIconIdleOpacityElement,
  navigationIconActiveOpacityElement, navigationFrameColorElement, navigationFrameWidthElement, navigationFrameIdleOpacityElement, navigationFrameActiveOpacityElement, navigationFrameAngleElement, navigationGlowColorElement, navigationGlowAngleElement,
  navigationGlowIdleStrengthElement, navigationGlowIdleSizeElement, navigationGlowActiveStrengthElement, navigationGlowActiveSizeElement, navigationRadiusElement, navigationLeftElement, navigationTopElement, navigationWidthElement,
  navigationHeightElement, navigationScaleElement, navigationRotationElement, navigationActionControlsElement, navigationApplyStyleElement, navigationApplyCountElement, navigationStyleApplyDialogElement, navigationStyleApplyCloseElement,
  navigationStyleApplyTitleElement, navigationStyleApplySummaryElement, navigationStyleApplyPropertiesElement, navigationStyleApplyTargetHeadingElement, navigationStyleApplyTargetScopeElement, navigationStyleApplyTargetsElement, navigationStyleApplyMessageElement, navigationStyleApplyCancelElement,
  navigationStyleApplyConfirmElement, popupNameDialogElement, popupNameDialogTitleElement, popupNameFormElement, popupNameCloseElement, popupNameCancelElement, popupModuleDialogElement, popupModuleDialogTitleElement,
  popupModuleFormElement, popupModuleCloseElement, popupModuleCancelElement, popupModuleEntityButtonElement, popupModuleEntityMenuElement, popupModuleEntitySearchElement, popupModuleEntityOptionsElement, popupModuleClimateDeviceTypeElement,
  deletePopupDialogElement, deletePopupCloseElement, deletePopupCancelElement, deletePopupConfirmElement, deletePopupNameElement, deleteAssetDialogElement, deleteAssetCloseButtonElement, deleteAssetCancelButtonElement,
  deleteAssetConfirmButtonElement, deleteAssetNameElement, deleteAssetFolderDialogElement, deleteAssetFolderCloseButtonElement, deleteAssetFolderCancelButtonElement, deleteAssetFolderConfirmButtonElement, deleteAssetFolderNameElement, deleteAssetFolderCountElement,
} = homeElements;
((soundToggleButtonElement.id = "dashboard-sound-toggle"),
  (soundToggleButtonElement.className = "workspace-sound-toggle"),
  (soundToggleButtonElement.type = "button"),
  soundToggleButtonElement.setAttribute("aria-pressed", "true"),
  soundToggleButtonElement.setAttribute("aria-label", "关闭仪表盘音效"),
  (soundToggleButtonElement.title = "关闭仪表盘音效"),
  (soundToggleButtonElement.innerHTML =
    '<svg class="sound-icon sound-icon-on" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="M16 9.5a4 4 0 0 1 0 5"/><path d="M18.5 7a7.5 7.5 0 0 1 0 10"/></svg><svg class="sound-icon sound-icon-off" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="m17 9 5 6M22 9l-5 6"/></svg><span class="sound-label">按键音效</span>'),
  workspaceResolutionElement.after(soundToggleButtonElement));
const dashboardDisplayHintElement = findElement("#dashboard-display-hint"),
  dashboardDisplayLinkElement = findElement("#dashboard-display-link");
const showEditorPreviewButtonElement = findElement("#show-editor-preview"),
  showDashboardPreviewButtonElement = findElement("#show-dashboard-preview"),
  dashboardPreviewElement = findElement("#dashboard-preview"),
  customPopupEditorElement = findElement("#custom-popup-editor"),
  buttonSoundController = createButtonSound2();

editorCtx.baseLightingSettings = normalizeBaseLighting2(DEFAULT_BASE_LIGHTING2);

const historySeriesCacheById = new Map(),
  runtimeStateCacheById = new Map(),
  virtualEntityStateCacheById = new Map();
editorCtx.lastComponentClick = { componentId: null as any, at: 0, };
editorCtx.deviceNamesByDeviceId = new Map();
editorCtx.writeQueuePromise = Promise.resolve();
const pendingAssetProbeKeysSet = new Set();
editorCtx.selectedComponentIdsSet = new Set<string>();
const { syncEventLogWallInspector } = setupEventLogWallInspector({
  eventLogWallInspectorElement, eventLogWallTypeElement, eventLogWallLabelElement,
  eventLogWallEnabledElement, eventLogWallTitleElement, eventLogWallTitleVisibleElement,
  eventLogWallTitleSizeElement, eventLogWallTitleColorElement, eventLogWallTitleAlignElement,
  eventLogWallMaxEntriesElement, eventLogWallDisplayDurationElement, eventLogWallWatchScopeElement,
  eventLogWallEntityIdsElement, eventLogWallFontSizeElement, eventLogWallRadiusElement,
  eventLogWallBgOpacityElement, eventLogWallBlurElement, eventLogWallClickModeElement,
  eventLogWallFooterTextElement, eventLogWallShowFooterElement, eventLogWallOnColorElement,
  eventLogWallOffColorElement, eventLogWallAttrColorElement, eventLogWallClimateColorElement,
  eventLogWallAlertColorElement, eventLogWallMutedColorElement,
  getSelectedComponentId: () => editorCtx.selectedComponentId,
  getEditorRenderer: () => editorCtx.editorRenderer,
  mutateDocument,
  removedComponent,
});
const { syncPanelFrameInspector } = setupPanelFrameInspector({
  panelFrameInspectorFormElement, panelFrameTypeTextInputElement, panelFrameLabelTextInputElement,
  panelFrameMainVisibleButtonElement, panelFrameMainTextInputElement, panelFrameMainColorInputElement,
  panelFrameMainSizeInputElement, panelFrameMainWeightInputElement, panelFrameMainOpacityInputElement,
  panelFrameMainSpacingInputElement, panelFrameMainLeftInputElement, panelFrameMainTopInputElement,
  panelFrameSecondaryVisibleButtonElement, panelFrameSecondaryTextInputElement, panelFrameSecondaryColorInputElement,
  panelFrameSecondarySizeInputElement, panelFrameSecondaryWeightInputElement, panelFrameSecondaryOpacityInputElement,
  panelFrameSecondarySpacingInputElement, panelFrameSecondaryLeftInputElement, panelFrameSecondaryTopInputElement,
  panelFrameEdgeVisibleButtonElement, panelFrameEdgeColorInputElement, panelFrameEdgeWidthInputElement,
  panelFrameEdgeOpacityInputElement, panelFrameRadiusInputElement, panelFrameEdgeAngleInputElement,
  panelFrameGlowVisibleButtonElement, panelFrameGlowColorInputElement, panelFrameGlowStrengthInputElement,
  panelFrameGlowSizeInputElement, panelFrameGlowAngleInputElement, panelFrameLeftInputElement,
  panelFrameTopInputElement, panelFrameWidthInputElement, panelFrameHeightInputElement,
  panelFrameScaleInputElement, panelFrameRotationInputElement, panelFrameApplyStyleButtonElement,
  panelFrameApplyCountElement,
  getSelectedComponentId: () => editorCtx.selectedComponentId,
  getSelectedComponentIdsSet: () => editorCtx.selectedComponentIdsSet,
  getActiveProject: () => editorCtx.activeProject,
  getEditorRenderer: () => editorCtx.editorRenderer,
  removedComponent,
  mutateDocument,
  findReplaceableComponents,
  collectChangedPanelFrameStyleKeys,
  coverMotorButtonElement,
  setComponentsRotation,
});
const historyState = {
    undo: [] as any[],
    redo: [] as any[],
    busy: false,
  },
  MAX_HISTORY_ENTRIES = 50,
  RECOVERY_STORAGE_PREFIX = "homeos:unsaved:";
const navigationPreviewStateByComponentId = new Map(),
  iconButtonEffectPreviewStateByComponentId = new Map(),
  iconButtonPreviewStateByComponentId = new Map(),
  doorWindowPerspectiveEditIdsSet = new Set(),
  iconButtonEffectLayerByComponentId = new Map(),
  airConditionerPreviewStateByComponentId = new Map(),
  floorplanAutoDiagramStateByComponentId = new Map(),
  airConditionerLayerByComponentId = new Map(),
  navigationButtonSavedSettingsByComponentId = new Map(),
  panelFrameBaselineByComponentId = new Map(),
  lineChartBaselineByComponentId = new Map(),
  iconButtonEffectBaselineByComponentId = new Map(),
  iconButtonBaselineByComponentId = new Map(),
  airConditionerBaselineByComponentId = new Map(),
  customSelectsBySelectElement = new Map(),
  colorPickerBoundInputById = new Map(),
  enhancedNumberInputsSet = new WeakSet();
const {
  iconButtonInspectorContext,
  navigationInspectorContext,
  lineChartInspectorContext,
  airConditionerInspectorContext,
} = createInspectorContexts({
  airConditionerActionControlsElement, airConditionerActionSectionElement, airConditionerAirflowAngleElement,
  airConditionerAirflowBlurElement, airConditionerAirflowCoolColorElement, airConditionerAirflowCurveElement,
  airConditionerAirflowDensityElement, airConditionerAirflowFadeElement, airConditionerAirflowHeatColorElement,
  airConditionerAirflowHeightElement, airConditionerAirflowIrregularityElement,
  airConditionerAirflowLengthElement, airConditionerAirflowMotionElement, airConditionerAirflowOffsetXElement,
  airConditionerAirflowOffsetYElement, airConditionerAirflowOtherColorElement,
  airConditionerAirflowRotationElement, airConditionerAirflowScaleElement, airConditionerAirflowSectionElement,
  airConditionerAirflowSpeedElement, airConditionerAirflowSpreadElement, airConditionerAirflowStrengthElement,
  airConditionerAirflowThicknessElement, airConditionerAirflowVisibleElement, airConditionerAirflowWidthElement,
  airConditionerApplyCountElement, airConditionerApplyStyleElement, airConditionerBadgeColorElement,
  airConditionerBadgeOpacityElement, airConditionerBadgeSizeElement, airConditionerButtonSectionElement,
  airConditionerDeviceTypeElement, airConditionerHeightElement, airConditionerIconLeftElement,
  airConditionerIconOffColorElement, airConditionerIconOnColorElement, airConditionerIconTopElement,
  airConditionerIconVisibleElement, airConditionerLabelElement, airConditionerLayerByComponentId,
  airConditionerLayerOptionsElement, airConditionerLeftElement, airConditionerMainColorElement,
  airConditionerMainLeftElement, airConditionerMainSizeElement, airConditionerMainSpacingElement,
  airConditionerMainTextElement, airConditionerMainTopElement, airConditionerMainVisibleElement,
  airConditionerMainWeightElement, airConditionerPreviewDetailsElement, airConditionerPreviewStateByComponentId,
  airConditionerPreviewStateElement, airConditionerRotationElement, airConditionerScaleElement,
  airConditionerSecondaryColorElement, airConditionerSecondaryLeftElement, airConditionerSecondarySizeElement,
  airConditionerSecondarySpacingElement, airConditionerSecondaryTextElement, airConditionerSecondaryTopElement,
  airConditionerSecondaryVisibleElement, airConditionerSecondaryWeightElement, airConditionerSymbolSizeElement,
  airConditionerTopElement, airConditionerTransformSectionElement, airConditionerWidthElement,
  appliedStylePropertyKey, collectChangedAirConditionerStyleKeys, collectChangedLineChartStyleKeys,
  collectPendingNavigationStyleKeys, deviceButtonBadgeColorElement, deviceButtonBadgeColorLabelElement,
  deviceButtonBadgeOpacityElement, deviceButtonBadgeOpacityLabelElement, deviceButtonBadgeSizeElement,
  deviceButtonBadgeSizeLabelElement, deviceButtonIconOnColorElement, deviceButtonIconOnColorLabelElement,
  deviceButtonIconVisibleElement, deviceButtonMainVisibleElement, deviceButtonSecondaryVisibleElement,
  deviceButtonStatePrecisionElement, deviceButtonStatePrecisionLabelElement, deviceButtonSymbolSizeElement,
  deviceButtonSymbolSizeLabelElement, doorWindowPerspectiveEditElement, doorWindowPerspectiveEditIdsSet,
  doorWindowPerspectiveSaveElement, doorWindowPerspectiveSectionElement, editorCtx, findReplaceableComponents,
  iconButtonActionControlsElement, iconButtonActionSectionElement, iconButtonApplyCountElement,
  iconButtonApplyStyleElement, iconButtonCutCornerElement, iconButtonFillSectionElement,
  iconButtonFrameAngleElement, iconButtonFrameOffOpacityElement, iconButtonFrameOnOpacityElement,
  iconButtonFrameSectionElement, iconButtonFrameVisibleElement, iconButtonFrameWidthElement,
  iconButtonGlowAngleElement, iconButtonGlowColorElement, iconButtonGlowSectionElement,
  iconButtonGlowSizeElement, iconButtonGlowStrengthElement, iconButtonGlowVisibleElement,
  iconButtonHeightElement, iconButtonIconButtonElement, iconButtonIconColorElement,
  iconButtonIconColorLabelElement, iconButtonIconLeftElement, iconButtonIconOffOpacityElement,
  iconButtonIconOffOpacityLabelElement, iconButtonIconOnOpacityElement, iconButtonIconOnOpacityLabelElement,
  iconButtonIconSizeElement, iconButtonIconSizeLabelElement, iconButtonIconTopElement, iconButtonLabelElement,
  iconButtonLeftElement, iconButtonMainColorElement, iconButtonMainContentLabelElement,
  iconButtonMainHeadingElement, iconButtonMainLeftElement, iconButtonMainOffOpacityElement,
  iconButtonMainOffOpacityLabelElement, iconButtonMainOnOpacityElement, iconButtonMainOnOpacityLabelElement,
  iconButtonMainSizeElement, iconButtonMainSpacingElement, iconButtonMainTextElement, iconButtonMainTopElement,
  iconButtonMainWeightElement, iconButtonOnFillColorElement, iconButtonOnFillFadeDurationElement,
  iconButtonOnFillStrengthElement, iconButtonOnFillVisibleElement, iconButtonPreviewControlElement,
  iconButtonPreviewDetailsElement, iconButtonPreviewStateByComponentId, iconButtonPreviewStateElement,
  iconButtonRotationElement, iconButtonScaleElement, iconButtonSecondaryColorElement,
  iconButtonSecondaryContentLabelElement, iconButtonSecondaryHeadingElement, iconButtonSecondaryLeftElement,
  iconButtonSecondaryOffOpacityElement, iconButtonSecondaryOffOpacityLabelElement,
  iconButtonSecondaryOnOpacityElement, iconButtonSecondaryOnOpacityLabelElement, iconButtonSecondarySizeElement,
  iconButtonSecondarySpacingElement, iconButtonSecondaryTextElement, iconButtonSecondaryTopElement,
  iconButtonSecondaryWeightElement, iconButtonSoftLightAngleElement, iconButtonSoftLightColorElement,
  iconButtonSoftLightSectionElement, iconButtonSoftLightSizeElement, iconButtonSoftLightStrengthElement,
  iconButtonSoftLightVisibleElement, iconButtonTopElement, iconButtonTypeElement, iconButtonTypeLabelElement,
  iconButtonWidthElement, lineChartActionControlsElement, lineChartApplyCountElement,
  lineChartApplyStyleButtonElement, lineChartCurveRadiusInputElement, lineChartHeightInputElement,
  lineChartHoursInputElement, lineChartLabelElement, lineChartLeftInputElement, lineChartRotationInputElement,
  lineChartScaleInputElement, lineChartStatePrecisionSelectElement, lineChartThresholdInputs,
  lineChartThresholdModeSelectElement, lineChartTopInputElement, lineChartTypeElement,
  lineChartUpdateIntervalInputElement, lineChartValueColorInputElement, lineChartValueOffsetXInputElement,
  lineChartValueOffsetYInputElement, lineChartValueScaleInputElement, lineChartValueVisibleElement,
  lineChartWidthInputElement, loadNavigationIconOptions, navigationActionControlsElement,
  navigationApplyCountElement, navigationApplyStyleElement, navigationEntityButtonElement,
  navigationFrameActiveOpacityElement, navigationFrameAngleElement, navigationFrameColorElement,
  navigationFrameIdleOpacityElement, navigationFrameVisibleElement, navigationFrameWidthElement,
  navigationGlowActiveSizeElement, navigationGlowActiveStrengthElement, navigationGlowAngleElement,
  navigationGlowColorElement, navigationGlowIdleSizeElement, navigationGlowIdleStrengthElement,
  navigationGlowVisibleElement, navigationHeightElement, navigationIconActiveOpacityElement,
  navigationIconColorElement, navigationIconIdleOpacityElement, navigationIconLeftElement,
  navigationIconSizeElement, navigationIconTopElement, navigationIconVisibleElement,
  navigationInspectorFormElement, navigationLabelElement, navigationLeftElement, navigationMainColorElement,
  navigationMainSizeElement, navigationMainSpacingElement, navigationMainTextElement,
  navigationMainTextLeftElement, navigationMainTextTopElement, navigationMainVisibleElement,
  navigationMainWeightElement, navigationPreviewStateByComponentId, navigationPreviewStateElement,
  navigationRadiusElement, navigationRotationElement, navigationScaleElement, navigationSecondaryColorElement,
  navigationSecondarySizeElement, navigationSecondarySpacingElement, navigationSecondaryTextElement,
  navigationSecondaryTextLeftElement, navigationSecondaryTextTopElement, navigationSecondaryVisibleElement,
  navigationSecondaryWeightElement, navigationTextActiveOpacityElement, navigationTextIdleOpacityElement,
  navigationTopElement, navigationTypeElement, navigationWidthElement, presenceHaloOpacityElement,
  presenceHaloRotationElement, presenceHaloScaleXElement, presenceHaloScaleYElement, presenceHaloVisibleElement,
  presenceMotionSectionElement, presenceOrbitDurationElement, presencePersonOpacityElement,
  presencePersonRotationElement, presencePersonScaleElement, presencePersonVisibleElement,
  presenceSensorKindElement, presenceSensorKindLabelElement, renderEntityIconButtonPreview,
  renderNavigationIconButton, sceneModeControlElement, sceneModeHintElement, syncComponentActionControls,
  syncPopupEntityPickerButton
});


/** 认证跳转闩（原 `let authRedirectStarted`）：每实例一份，交给 `net/request-json` 读写。 */
const authRedirectState = { started: false };
const requestJsonDeps = () => ({ authRedirectState });
/**
 * 请求封装（P4 搬进 `net/request-json`）：超时 / 中止 / CSRF / 401-403 跳转。
 * 本身是 `async`，薄绑定只返回 Promise（不写 `async`，免得撞 `require-await`）。
 */

/** 数字步进器去重集合（P4 搬进 `controls/number-stepper`，按引用注入）。 */
const numberStepperDeps = () => ({ enhancedNumberInputsSet });
/**
 * 检查器数字输入增强（P4 搬进 `controls/number-stepper`）：**保留原签名** —— 本函数在 6xxx 行
 * 被当作裸函数值交给外部 ctx（`formatLastSeen,`），多一个 `deps` 首参会把调用方的实参顶掉。
 */
function workspaceDocumentDeps(): WorkspaceDocumentDeps {
  return {
    ...homeElements,
    get airConditionerPreviewStateByComponentId() { return airConditionerPreviewStateByComponentId; },
    get buttonSoundController() { return buttonSoundController; },
    get clearComponentSelection() { return clearComponentSelection; },
    get collectComponentsByType() { return collectComponentsByType; },
    get componentListForScope() { return componentListForScope; },
    get coverMotorButtonElement() { return coverMotorButtonElement; },
    get currentPage() { return currentPage; },
    get customPopupEditorElement() { return customPopupEditorElement; },
    get dashboardDisplayHintElement() { return dashboardDisplayHintElement; },
    get dashboardDisplayLinkElement() { return dashboardDisplayLinkElement; },
    get dashboardPreviewElement() { return dashboardPreviewElement; },
    get editorCtx() { return editorCtx; },
    get ensureEditorRenderer() { return ensureEditorRenderer; },
    get findPageComponentsByType() { return findPageComponentsByType; },
    get handleOperationError() { return handleOperationError; },
    get historySeriesCacheById() { return historySeriesCacheById; },
    get iconButtonEffectPreviewStateByComponentId() { return iconButtonEffectPreviewStateByComponentId; },
    get iconButtonPreviewStateByComponentId() { return iconButtonPreviewStateByComponentId; },
    get loadNavigationIconOptions() { return loadNavigationIconOptions; },
    get mutateDocument() { return mutateDocument; },
    get navigationPreviewStateByComponentId() { return navigationPreviewStateByComponentId; },
    get projectSummary() { return projectSummary; },
    get refreshSoundToggle() { return refreshSoundToggle; },
    get renderComponentLists() { return renderComponentLists; },
    get renderCustomPopupEditor() { return renderCustomPopupEditor; },
    get renderWorkspaceResolution() { return renderWorkspaceResolution; },
    get resetPreviewStates() { return resetPreviewStates; },
    get resizeWorkspaceCanvas() { return resizeWorkspaceCanvas; },
    get runAuxBackup() { return normalizeSensorKind; },
    get runCase() { return renderDashboardPreview; },
    get runSlot() { return destroyDashboardPreviewRenderer; },
    get runtimeStateCacheById() { return runtimeStateCacheById; },
    get setComponentScope() { return setComponentScope; },
    get setSettingsMessage() { return setSettingsMessage; },
    get showDashboardPreviewButtonElement() { return showDashboardPreviewButtonElement; },
    get showEditorPreviewButtonElement() { return showEditorPreviewButtonElement; },
    get syncAddComponentButton() { return syncAddComponentButton; },
    get syncDefaultPageAction() { return syncDefaultPageAction; },
    get syncRendererSelection() { return syncRendererSelection; },
    get unbindDisplayDeviceError() { return unbindDisplayDeviceError; },
    get value() { return value; },
    get virtualEntityStateCacheById() { return virtualEntityStateCacheById; },
  };
}
const { workspaceResizeObserver } = bindCanvasMarquee({
  clearComponentSelection,
  clientPointToCanvas,
  collectPageComponentBounds,
  coverMotorButtonElement,
  displayDeviceCountElement,
  editorCanvasElement,
  editorCtx,
  ensureMarqueeOverlay,
  normalizeMarquee,
  pickComponentsInMarquee,
  renderComponentLists,
  resizeWorkspaceCanvas,
  syncCustomPopupStage,
  syncHistoryButtons,
  syncRendererSelection,
});
setupRelatedPopup({
  get entities() {
    return editorCtx.entities;
  },
  get devices() {
    return editorCtx.devices;
  },
  getSelectedComponentId: () => editorCtx.selectedComponentId,
  removedComponent,
  mutateDocument,
  registerOverflowScrollPreviewRow,
  formatEntityLabel,
});
function componentEditingDeps(): ComponentEditingDeps {
  return {
    ...homeElements,
    get clearComponentSelection() { return clearComponentSelection; },
    get copyTargetsForDocument() { return copyTargetsForDocument; },
    get coverMotorButtonElement() { return coverMotorButtonElement; },
    get currentPage() { return currentPage; },
    get editorCtx() { return editorCtx; },
    get findCommonCopyTargets() { return findCommonCopyTargets; },
    get getDocumentCanvasSize() { return getDocumentCanvasSize; },
    get handleOperationError() { return handleOperationError; },
    get historyEntry() { return historyEntry; },
    get loadNavigationIconOptions() { return loadNavigationIconOptions; },
    get mutateDocument() { return mutateDocument; },
    get openComponentMenu() { return openComponentMenu; },
    get prependGroupBackButton() { return prependGroupBackButton; },
    get removalPageEntry() { return removalPageEntry; },
    get renderComponentList() { return renderComponentList; },
    get renderComponentLists() { return renderComponentLists; },
    get renderCopyComponentDialog() { return renderCopyComponentDialog; },
    get renderCopyScaleOptions() { return renderCopyScaleOptions; },
    get renderCopyTargetOptions() { return renderCopyTargetOptions; },
    get requestJson() { return requestJson; },
    get runStore() { return normalizeHexColor; },
    get selectComponent() { return selectComponent; },
    get setComponentScope() { return setComponentScope; },
    get setComponentsVisibility() { return setComponentsVisibility; },
    get setSettingsMessage() { return setSettingsMessage; },
    get syncAddComponentButton() { return syncAddComponentButton; },
    get syncRendererSelection() { return syncRendererSelection; },
  };
}
const hELPER_ENTITY_DOMAINSSet = new Set([
    "input_boolean",
    "input_button",
    "input_datetime",
    "input_number",
    "input_select",
    "input_text",
    "counter",
    "timer",
    "schedule",
  ]),
  ENTITY_DOMAIN_LABELS = {
    alarm_control_panel: "安防",
    automation: "自动化",
    binary_sensor: "二元传感器",
    button: "按钮",
    calendar: "日历",
    camera: "摄像头",
    climate: "空调/浴霸",
    cover: "窗帘",
    device_tracker: "设备追踪",
    event: "事件",
    fan: "风扇",
    image: "图像",
    light: "灯光",
    lock: "门锁",
    media_player: "媒体播放器",
    number: "数值",
    person: "人员",
    remote: "遥控器",
    scene: "场景",
    script: "脚本",
    select: "选择器",
    sensor: "传感器",
    sun: "太阳",
    switch: "开关",
    text: "文本",
    update: "更新",
    vacuum: "扫地机",
    weather: "天气",
    zone: "区域",
  };
function entityLabelsDeps(): EntityLabelsDeps {
  return {
    ...homeElements,
    get currentPage() { return currentPage; },
    get editorCtx() { return editorCtx; },
    get effectIconLabelElementById() { return effectIconLabelElementById; },
    get effectIconLabelElementByIdById() { return effectIconLabelElementByIdById; },
    get effectIconLabelSelector() { return effectIconLabelSelector; },
    get effectIconName() { return effectIconName; },
    get ENTITY_DOMAIN_LABELS() { return ENTITY_DOMAIN_LABELS; },
    get hELPER_ENTITY_DOMAINSSet() { return hELPER_ENTITY_DOMAINSSet; },
    get MAX_LIGHT_STATISTICS_ENTITIES() { return MAX_LIGHT_STATISTICS_ENTITIES; },
    get mutateDocument() { return mutateDocument; },
    get navigationIconValue() { return navigationIconValue; },
    get removedComponent() { return removedComponent; },
    get renderNavigationIconPreview() { return renderNavigationIconPreview; },
    get runAlt() { return registerOverflowScrollPreviewRow; },
    get runBackup() { return setPickerButtonLabel; },
    get runChunk() { return collectPageComponents; },
    get runCursor() { return normalizeWhitespace; },
    get runDelta() { return showLightStatisticsMessage; },
    get runFallback() { return ensureInspectorPickerValueSpan; },
    get runGroup() { return flattenComponentTree; },
    get runLimit() { return clearLightStatisticsSelection; },
    get runMode() { return formatEntitySummary; },
    get runOrder() { return collectEntityIds; },
    get runPortion() { return resolveEntityCatalog; },
    get runQueue() { return describeEntityDomain; },
    get runRange() { return describeEntityState; },
    get runSegment() { return findIconVisibilityVirtualEntity; },
    get runSnapshot() { return formatEntityLabel; },
    get runSource() { return resolveEntityDisplayName; },
  };
}
const MAX_LIGHT_STATISTICS_ENTITIES = 100;
const effectIconLabelElementById = new WeakMap(),
  effectIconLabelElementByIdById = new WeakMap(),
  effectIconLabelSelector =
    "[data-overflow-scroll-preview], .inspector-picker-value, .inspector-entity-name-line";
(document.addEventListener("pointerover", (iconButtonIconName) => {
  const sw2 = resolveOverflowScrollPreviewContainer(iconButtonIconName.target),
    cw2 = findEnclosingScrollPreviewRow(sw2),
    iconButtonIconValueState =
      iconButtonIconName.relatedTarget instanceof Node &&
      cw2?.contains(iconButtonIconName.relatedTarget);
  if (!sw2 || iconButtonIconValueState || effectIconLabelElementById.has(sw2)) return;
  const iconButtonIconValue = Math.max(0, sw2.scrollWidth - sw2.clientWidth);
  if (iconButtonIconValue <= 2) return;
  const iconButtonIconValueValue = {
    timer: null as any,
    frame: null as any,
  };
  (effectIconLabelElementById.set(sw2, iconButtonIconValueValue),
    (iconButtonIconValueValue.timer = window.setTimeout(() => {
      if (!sw2.isConnected) {
        stopOverflowScrollAnimation(sw2);
        return;
      }
      sw2.classList.add("hover-scrolling");
      const now = performance.now(),
        iconButtonIconValueHandler = (iconButtonIconValueConfig: any) => {
          const iconButtonIconValueRef = (iconButtonIconValueConfig - now) * 0.04;
          ((sw2.scrollLeft = Math.min(iconButtonIconValue, iconButtonIconValueRef)),
            iconButtonIconValueRef < iconButtonIconValue &&
              (iconButtonIconValueValue.frame = window.requestAnimationFrame(
                iconButtonIconValueHandler,
              )));
        };
      iconButtonIconValueValue.frame = window.requestAnimationFrame(iconButtonIconValueHandler);
    }, 350)));
}),
  document.addEventListener("pointerout", (iconButtonIconValueEntry) => {
    const sw3 = resolveOverflowScrollPreviewContainer(iconButtonIconValueEntry.target),
      cw3 = findEnclosingScrollPreviewRow(sw3),
      iconButtonFollowsEntityState =
        iconButtonIconValueEntry.relatedTarget instanceof Node &&
        cw3?.contains(iconButtonIconValueEntry.relatedTarget);
    !sw3 || iconButtonFollowsEntityState || stopOverflowScrollAnimation(sw3);
  }));
function iconPickersDeps(): IconPickersDeps {
  return {
    ...homeElements,
    get copyTextToClipboard() { return copyTextToClipboard; },
    get customSelectsBySelectElement() { return customSelectsBySelectElement; },
    get editorCtx() { return editorCtx; },
    get enhanceEntityCopyButton() { return enhanceEntityCopyButton; },
    get handleOperationError() { return handleOperationError; },
    get hideAssetLargePreview() { return hideAssetLargePreview; },
    get iconListStateByElement() { return iconListStateByElement; },
    get iconTooltipElementValue() { return iconTooltipElementValue; },
    get removedComponent() { return removedComponent; },
    get runDual() { return resolveMdiIconUrl; },
    get runFallback() { return ensureInspectorPickerValueSpan; },
    get runLeft() { return showIconNameTooltip; },
    get runLimit() { return clearLightStatisticsSelection; },
    get runLower() { return hideIconNameTooltip; },
    get runPrimary() { return closePickerMenu; },
    get runState() { return closeCustomSelect; },
  };
}
enhanceEntityCopyButtons();
const ICON_PAGE_SIZE = 160,
  iconListStateByElement = new WeakMap();
(bindIconListInfiniteScroll(navigationIconOptionsElement, () =>
  iconTooltipElementCount(navigationIconSearchElement.value, {
    append: true,
  }),
),
  bindIconListInfiniteScroll(ibeIconOptionsElement, () =>
    iconTooltipElementFlag(ibeIconSearchElement.value, {
      append: true,
    }),
  ),
  bindIconListInfiniteScroll(iconButtonIconOptionsElement, () =>
    iconTooltipElementStep(iconButtonIconSearchElement.value, {
      append: true,
    }),
  ),
  bindIconListInfiniteScroll(titleButtonIconOptionsElement, () =>
    iconTooltipElementStore(titleButtonIconSearchElement.value, {
      append: true,
    }),
  ),
  bindIconListInfiniteScroll(lightStatisticsIconOptionsElement, () =>
    iconTooltipElementBuffer(lightStatisticsIconSearchElement.value, {
      append: true,
    }),
  ));
function assetPickerDeps(): AssetPickerDeps {
  return {
    ...homeElements,
    get allAssets() { return allAssets; },
    get applyAssetNaturalSize() { return applyAssetNaturalSize; },
    get assetMatchesId() { return assetMatchesId; },
    get customSelectsBySelectElement() { return customSelectsBySelectElement; },
    get editorCtx() { return editorCtx; },
    get handleOperationError() { return handleOperationError; },
    get loadNavigationIconOptions() { return loadNavigationIconOptions; },
    get measureAssetImageSize() { return measureAssetImageSize; },
    get mutateDocument() { return mutateDocument; },
    get pendingAssetProbeKeysSet() { return pendingAssetProbeKeysSet; },
    get positionAssetLargePreview() { return positionAssetLargePreview; },
    get removedComponent() { return removedComponent; },
    get renderNavigationIconPreview() { return renderNavigationIconPreview; },
    get resolveAssetPreviewUrl() { return resolveAssetPreviewUrl; },
    get resolveEffectAssetUrl() { return resolveEffectAssetUrl; },
    get runAlt() { return registerOverflowScrollPreviewRow; },
    get runExtraAlt() { return resolveEntityPickerConfig; },
    get runExtraTwin() { return resolveAssetFileUrl; },
    get runExtraVariant() { return renderRelatedPopupEntityOptions; },
    get runMode() { return formatEntitySummary; },
    get runPortion() { return resolveEntityCatalog; },
    get runQueue() { return describeEntityDomain; },
    get runSnapshot() { return formatEntityLabel; },
    get runState() { return closeCustomSelect; },
    get syncAssetFolderOptions() { return syncAssetFolderOptions; },
  };
}
const {
    createIconPickerClearOption: effectVariantUrlState,
    createIconPickerOption: createIconPickerClearOptionState,
    createEditorPickerCurrentIcon: createIconPickerClearOption,
    createEditorEntityPickerOption: createIconPickerOption,
    editorPickerClearAction: createEditorEntityPickerOption,
    createEditorPickerCurrentEntity: createEditorPickerCurrentEntity,
    createEditorPickerCurrentAsset: createEditorPickerCurrentAsset,
  } = createEditorPickerElements2({
    entityKindLabel: describeEntityDomain,
    entityPickerPrimaryName: formatEntityLabel,
    entityPickerText: formatEntitySummary,
    enableEntityTextHoverScroll: registerOverflowScrollPreviewRow,
    assetDisplayName: assetDisplayName,
    assetPreviewUrl: resolveEffectAssetUrl,
    bindEditorIconNameTooltip: bindIconNameTooltipEvents,
    mdiIconUrl: resolveMdiIconUrl,
  }),
  {
    editorEntityMatches: editorEntityMatches,
    editorPickerComponentTypeLabel: editorPickerComponentTypeLabel,
  } = createEditorPickerQueries2({
    entityPickerConfig: resolveEntityPickerConfig,
    pickerEntitiesForComponentType: resolveEntityCatalog,
    entityPickerText: formatEntitySummary,
    entityDomain: renderNavigationIconPreview,
  }),
  editorPickers = createInteraction3dEditorPickers2({
    getState: (stateEntityId) => editorCtx.editorRenderer?.states?.get(stateEntityId),
    openPicker: (pickerPayload) => renderCopyBackupDialog(pickerPayload),
    fetchIcons: (iconQuery, iconLimit, iconOffset) =>
      requestJson(
        "/icons?query=" +
          encodeURIComponent(iconQuery) +
          "&limit=" +
          iconLimit +
          "&offset=" +
          iconOffset,
      ),
    getEntities: () => editorCtx.entities,
    ensureEntities: () =>
      editorCtx.isAreEntitiesLoaded ? Promise.resolve() : editorCtx.entitiesLoadPromise || ensureEntitiesLoaded(),
    entityPickerText: formatEntitySummary,
    elements: {
      createEditorPickerCurrentIcon: createIconPickerClearOption,
      createIconPickerOption: createIconPickerClearOptionState,
      createEditorPickerCurrentEntity: createEditorPickerCurrentEntity,
      createEditorEntityPickerOption: createIconPickerOption,
      editorPickerClearAction: createEditorEntityPickerOption,
    },
  }),
  userImageUploader = createUserImageUploader({
    request: (uploadPath, uploadOptions) => requestJson(uploadPath, uploadOptions),
    onCatalogUpdated: () => reloadAssetCatalog({ refreshInspector: false }),
  }),
  editorAssetMatcher = createEditorAssetMatcher2({
    getImageSource: () => editorCtx.imageAssetFolder,
    getImageFolder: () => editorCtx.imageAssetFolderState,
    getIbeSource: () => editorCtx.effectAssetFolder,
    getIbeFolder: () => editorCtx.effectAssetFolderState,
    getUserAssets: () => editorCtx.userAssets,
    getBuiltinAssets: () => editorCtx.userAssetsState,
  }),
  editorAssetToolbar = createEditorAssetToolbar2({
    documentObject: document,
    getSource: (editorAssetToolbarState: any) =>
      editorAssetToolbarState === "image" ? editorCtx.imageAssetFolder : editorCtx.effectAssetFolder,
    setSource: (editorAssetToolbarValue: any, folderKeyState: any) => {
      editorAssetToolbarValue === "image"
        ? (editorCtx.imageAssetFolder = folderKeyState)
        : (editorCtx.effectAssetFolder = folderKeyState);
    },
    getFolder: (folderKeyValue: any) =>
      folderKeyValue === "image" ? editorCtx.imageAssetFolderState : editorCtx.effectAssetFolderState,
    setFolder: (folderKey: any, nextFolderKey: any) => {
      folderKey === "image"
        ? (editorCtx.imageAssetFolderState = nextFolderKey)
        : (editorCtx.effectAssetFolderState = nextFolderKey);
    },
    getAssets: (folderValue: any) => (folderValue === "user" ? editorCtx.userAssets : editorCtx.userAssetsState),
    getUploadInput: (uploadSourceKey: any) =>
      uploadSourceKey === "image" ? imageAssetUploadInputElement : ibeAssetUploadInputElement,
    canDeleteFolder: (deleteSourceKey: any, folderToDelete: any) =>
      canDeleteAssetFolder(deleteSourceKey, folderToDelete),
    onDeleteFolder: (removedSourceKey: any, removedFolderName: any) =>
      requestDeleteAssetFolder(removedSourceKey, removedFolderName),
    getUploaderState: () => userImageUploader.state,
    subscribeUploader: (uploadListener: (uploadState: UserImageUploadState) => void) =>
      userImageUploader.subscribe(uploadListener),
    retryUploadRefresh: () => userImageUploader.retryRefresh(),
  });
function popupInspectorsDeps(): PopupInspectorsDeps {
  return {
    ...homeElements,
    get assetDisplayName() { return assetDisplayName; },
    get assetMatchesId() { return assetMatchesId; },
    get assignActionControlIds() { return assignActionControlIds; },
    get buildCustomPopupEditorContext() { return buildCustomPopupEditorContext; },
    get buildTimeInspectorContext() { return buildTimeInspectorContext; },
    get buildWeatherInspectorContext() { return buildWeatherInspectorContext; },
    get createAssetOptionButton() { return createAssetOptionButton; },
    get currentPage() { return currentPage; },
    get customPopupEditorElement() { return customPopupEditorElement; },
    get deviceNameValue() { return deviceNameValue; },
    get editorCtx() { return editorCtx; },
    get enhanceEntityCopyButton() { return enhanceEntityCopyButton; },
    get findAssetById() { return findAssetById; },
    get handleOperationError() { return handleOperationError; },
    get hideAssetLargePreview() { return hideAssetLargePreview; },
    get leftFolderName() { return leftFolderName; },
    get mutateDocument() { return mutateDocument; },
    get openPopupModuleDialog() { return openPopupModuleDialog; },
    get probeAssetNaturalSize() { return probeAssetNaturalSize; },
    get removedComponent() { return removedComponent; },
    get resolveEffectAssetUrl() { return resolveEffectAssetUrl; },
    get runAlt() { return registerOverflowScrollPreviewRow; },
    get runBackup() { return setPickerButtonLabel; },
    get runExtraFallback() { return syncPopupEntityPickerButton; },
    get runMode() { return formatEntitySummary; },
    get runQueue() { return describeEntityDomain; },
    get runSnapshot() { return formatEntityLabel; },
    get syncAssetFolderOptions() { return syncAssetFolderOptions; },
  };
}
function inspectorContextsDeps(): InspectorContextsDeps {
  return {
    ...homeElements,
    get airConditionerPreviewStateByComponentId() { return airConditionerPreviewStateByComponentId; },
    get allAssets() { return allAssets; },
    get buildCameraInspectorContext() { return buildCameraInspectorContext; },
    get buildCoverMotorInspectorContext() { return buildCoverMotorInspectorContext; },
    get buildLightStatisticsInspectorContext() { return buildLightStatisticsInspectorContext; },
    get buildTitleButtonInspectorContext() { return buildTitleButtonInspectorContext; },
    get buildVacuumMapInspectorContext() { return buildVacuumMapInspectorContext; },
    get closePopupModuleEntityMenu() { return closePopupModuleEntityMenu; },
    get coverMotorButtonElement() { return coverMotorButtonElement; },
    get destroyDashboardPreview() { return destroyDashboardPreview; },
    get discardRecoverySnapshot() { return discardRecoverySnapshot; },
    get editorCtx() { return editorCtx; },
    get editorPickers() { return editorPickers; },
    get findReplaceableComponents() { return findReplaceableComponents; },
    get floorplanAutoDiagramStateByComponentId() { return floorplanAutoDiagramStateByComponentId; },
    get formatLastSeen() { return formatLastSeen; },
    get handleOperationError() { return handleOperationError; },
    get hasActiveProject() { return hasActiveProject; },
    get historyState() { return historyState; },
    get iconButtonEffectLayerByComponentId() { return iconButtonEffectLayerByComponentId; },
    get iconButtonEffectPreviewStateByComponentId() { return iconButtonEffectPreviewStateByComponentId; },
    get iconButtonPreviewStateByComponentId() { return iconButtonPreviewStateByComponentId; },
    get imageAssetPointerOverEvent() { return imageAssetPointerOverEvent; },
    get initialPopupId() { return initialPopupId; },
    get loadNavigationIconOptions() { return loadNavigationIconOptions; },
    get mutateDocument() { return mutateDocument; },
    get navigationPreviewStateByComponentId() { return navigationPreviewStateByComponentId; },
    get onGlobalColorPickerHexTextInputInput() { return onGlobalColorPickerHexTextInputInput; },
    get onSessionsRevokeOthersConfirmButtonClick() { return onSessionsRevokeOthersConfirmButtonClick; },
    get readEffectNaturalSize() { return readEffectNaturalSize; },
    get reloadAssetCatalog() { return reloadAssetCatalog; },
    get removedComponent() { return removedComponent; },
    get renderComponentLists() { return renderComponentLists; },
    get renderLightStatisticsIconPreview() { return renderLightStatisticsIconPreview; },
    get renderNavigationIconPreview() { return renderNavigationIconPreview; },
    get renderPopupEntityOptions() { return renderPopupEntityOptions; },
    get renderTitleButtonIconPreview() { return renderTitleButtonIconPreview; },
    get requestJson() { return requestJson; },
    get resizeWorkspaceCanvas() { return resizeWorkspaceCanvas; },
    get runAlt() { return registerOverflowScrollPreviewRow; },
    get runAltOuter() { return collectChangedTitleButtonStyleKeys; },
    get runAmount() { return renderLightStatisticsEntityOptions; },
    get runAuxAlt() { return collectChangedIconButtonEffectStyleKeys; },
    get runAuxLower() { return collectChangedCameraStyleKeys; },
    get runBackup() { return setPickerButtonLabel; },
    get runCursor() { return normalizeWhitespace; },
    get runExtraFallback() { return syncPopupEntityPickerButton; },
    get runExtraLeft() { return syncPopupModuleClimateDeviceType; },
    get runExtraLower() { return syncPopupEntityInputs; },
    get runExtraPeer() { return renderTimeInspector; },
    get runLimit() { return clearLightStatisticsSelection; },
    get runLocal() { return renderLightStatisticsButtonIcon; },
    get runMode() { return formatEntitySummary; },
    get runQueue() { return describeEntityDomain; },
    get runShadow() { return closeOtherPickerMenus; },
    get runSnapshot() { return formatEntityLabel; },
    get runZone() { return renderLightStatisticsEntityList; },
    get selectableEntities() { return selectableEntities; },
    get setComponentsRotation() { return setComponentsRotation; },
    get setEditorMode() { return setEditorMode; },
    get stopHoverScroll() { return stopHoverScroll; },
    get structureVolatileTypesSet() { return structureVolatileTypesSet; },
    get syncAirConditionerInspector() { return syncAirConditionerInspector; },
    get syncCameraInspector() { return syncCameraInspector; },
    get syncComponentActionControls() { return syncComponentActionControls; },
    get syncEffectAssetSelection() { return syncEffectAssetSelection; },
    get syncEventLogWallInspector() { return syncEventLogWallInspector; },
    get syncIconButtonInspector() { return syncIconButtonInspector; },
    get syncImageAssetSelection() { return syncImageAssetSelection; },
    get syncLightStatisticsInspector() { return syncLightStatisticsInspector; },
    get syncLineChartInspector() { return syncLineChartInspector; },
    get syncNavigationInspector() { return syncNavigationInspector; },
    get syncPanelFrameInspector() { return syncPanelFrameInspector; },
    get syncPopupEntityButton() { return syncPopupEntityButton; },
    get syncRendererSelection() { return syncRendererSelection; },
    get syncTimeInspector() { return syncTimeInspector; },
    get syncTitleButtonInspector() { return syncTitleButtonInspector; },
    get syncVacuumMapInspector() { return syncVacuumMapInspector; },
    get syncWeatherInspector() { return syncWeatherInspector; },
    get writeError() { return writeError; },
  };
}
const structureVolatileTypesSet = new Set();
function workspaceHistoryDeps(): WorkspaceHistoryDeps {
  return {
    ...homeElements,
    get airConditionerBaselineByComponentId() { return airConditionerBaselineByComponentId; },
    get applyTransformToInspector() { return applyTransformToInspector; },
    get clearComponentSelection() { return clearComponentSelection; },
    get collectChangedComponents() { return collectChangedComponents; },
    get collectPageComponentBounds() { return collectPageComponentBounds; },
    get coverMotorButtonElement() { return coverMotorButtonElement; },
    get currentPage() { return currentPage; },
    get dashboardPreviewElement() { return dashboardPreviewElement; },
    get discardRecoverySnapshot() { return discardRecoverySnapshot; },
    get editorCtx() { return editorCtx; },
    get ensureEditorRenderer() { return ensureEditorRenderer; },
    get ensureEntitiesLoaded() { return ensureEntitiesLoaded; },
    get entryStateRecord() { return entryStateRecord; },
    get handleOperationError() { return handleOperationError; },
    get historyEntries() { return historyEntries; },
    get historyEntry() { return historyEntry; },
    get historySeriesCacheById() { return historySeriesCacheById; },
    get historyState() { return historyState; },
    get iconButtonBaselineByComponentId() { return iconButtonBaselineByComponentId; },
    get iconButtonEffectBaselineByComponentId() { return iconButtonEffectBaselineByComponentId; },
    get interaction3dEntryActive() { return interaction3dEntryActive; },
    get lineChartBaselineByComponentId() { return lineChartBaselineByComponentId; },
    get loadHaConnection() { return loadHaConnection; },
    get loadNavigationIconOptions() { return loadNavigationIconOptions; },
    get MAX_HISTORY_ENTRIES() { return MAX_HISTORY_ENTRIES; },
    get mutateDocument() { return mutateDocument; },
    get navigationButtonSavedSettingsByComponentId() { return navigationButtonSavedSettingsByComponentId; },
    get onImageAssetUploadButtonClick() { return onImageAssetUploadButtonClick; },
    get panelFrameBaselineByComponentId() { return panelFrameBaselineByComponentId; },
    get projectSummary() { return projectSummary; },
    get readRecoverySnapshot() { return readRecoverySnapshot; },
    get recoverDraftConflict() { return recoverDraftConflict; },
    get RECOVERY_STORAGE_PREFIX() { return RECOVERY_STORAGE_PREFIX; },
    get recoveryWriter() { return recoveryWriter; },
    get refreshDirtyState() { return refreshDirtyState; },
    get refreshSoundToggle() { return refreshSoundToggle; },
    get removedComponent() { return removedComponent; },
    get renderComponentLists() { return renderComponentLists; },
    get renderCustomPopupEditor() { return renderCustomPopupEditor; },
    get renderEditorWorkspace() { return renderEditorWorkspace; },
    get renderPageSelect() { return renderPageSelect; },
    get renderWorkspaceResolution() { return renderWorkspaceResolution; },
    get requestJson() { return requestJson; },
    get resizeWorkspaceCanvas() { return resizeWorkspaceCanvas; },
    get retainExistingSelection() { return retainExistingSelection; },
    get runCase() { return renderDashboardPreview; },
    get runExtraLower() { return syncPopupEntityInputs; },
    get runExtraOld() { return resetHistoryState; },
    get runExtraOuter() { return renderCustomPopupSelector; },
    get runKey() { return syncWorkspaceEmptyState; },
    get runSlot() { return destroyDashboardPreviewRenderer; },
    get runtimeStateCacheById() { return runtimeStateCacheById; },
    get runZone() { return renderLightStatisticsEntityList; },
    get saveDraft() { return saveDraft; },
    get scheduleRecoverySnapshot() { return scheduleRecoverySnapshot; },
    get setPageControlsEnabled() { return setPageControlsEnabled; },
    get syncHistoryButtons() { return syncHistoryButtons; },
    get virtualEntityStateCacheById() { return virtualEntityStateCacheById; },
    get writeError() { return writeError; },
  };
}




const recoveryWriter = createRecoveryWriter2(persistRecoverySnapshot);
(window.addEventListener("pagehide", recoveryWriter.flush),
  window.addEventListener("beforeunload", recoveryWriter.flush),
  document.addEventListener("visibilitychange", () => {
    document.hidden && recoveryWriter.flush();
  }));
/**
 * 3D 配置入口 / 弹窗是否正开着。
 *
 * 自动重载（HA 目录变化、撤销重做）时不要重置 2D 画布：否则会把正在编辑的
 * 3D 入口、楼层弹窗或借用中的预览一起关掉。
 */
function lightingPanelDeps(): LightingPanelDeps {
  return {
    ...homeElements,
    get buttonVisibilityDraftDocument() { return buttonVisibilityDraftDocument; },
    get currentPage() { return currentPage; },
    get editorCtx() { return editorCtx; },
    get handleOperationError() { return handleOperationError; },
    get imageEntityDraftDocument() { return imageEntityDraftDocument; },
    get lightFieldElement() { return lightFieldElement; },
    get lightingPayload() { return lightingPayload; },
    get lightStatisticsEntityListClickEvent() { return lightStatisticsEntityListClickEvent; },
    get mutateDocument() { return mutateDocument; },
    get openLightingPanel() { return openLightingPanel; },
    get popupId() { return popupId; },
    get reloadAssetCatalog() { return reloadAssetCatalog; },
    get requestJson() { return requestJson; },
    get setSettingsMessage() { return setSettingsMessage; },
    get syncAspectLockButton() { return syncAspectLockButton; },
    get targetPageCandidate() { return targetPageCandidate; },
    get titleButtonIconOptionClickEvent() { return titleButtonIconOptionClickEvent; },
  };
}
// 保留空实现以维持上方授权门禁函数的调用契约（门禁逻辑本身不在此处）。
  projectNewElement.addEventListener("click", async () => {
    if (!documentSource())
      try {
        lightStatisticsIconCopyError("create");
      } catch (caughtErrorConfig: any) {
        handleOperationError(caughtErrorConfig);
      }
  }),
  projectCloseElement.addEventListener("click", () => projectDialogElement.close()),
  projectCancelElement.addEventListener("click", () => projectDialogElement.close()),
  projectDialogElement.addEventListener("click", (onProjectDialogClick: any) => {
    onProjectDialogClick.target === projectDialogElement && projectDialogElement.close();
  }),
  projectTemplateOptionsElement.addEventListener("click", (projectBackdropEvent: any) => {
    const deleteHaSubmitButtonElement = projectBackdropEvent.target.closest(
      "[data-project-template-id]",
    );
    if (!deleteHaSubmitButtonElement || editorCtx.projectDialogMode !== "create") return;
    const projectPreviewAction = projectBackdropEvent.target.closest(
      "[data-project-preview-action]",
    )?.dataset.projectPreviewAction;
    if (projectPreviewAction) {
      (projectBackdropEvent.stopPropagation(),
        titleButtonIconDraftDocument(deleteHaSubmitButtonElement));
      return;
    }
    targetPageCandidate();
  }),
  projectPreviewCloseElement.addEventListener("click", () => projectPreviewDialogElement.close()),
  projectPreviewPreviousElement.addEventListener("click", () => {
    ((editorCtx.lockedCanvasHeight -= 1), titleButtonIconOptionClickEvent());
  }),
  projectPreviewNextElement.addEventListener("click", () => {
    ((editorCtx.lockedCanvasHeight += 1), titleButtonIconOptionClickEvent());
  }),
  projectPreviewDialogElement.addEventListener("click", (onProjectCanvasHeightInputInput: any) => {
    onProjectCanvasHeightInputInput.target === projectPreviewDialogElement &&
      projectPreviewDialogElement.close();
  }),
  projectPreviewDialogElement.addEventListener("keydown", (onProjectAspectLockButtonClick: any) => {
    (onProjectAspectLockButtonClick.key === "ArrowLeft" &&
      ((editorCtx.lockedCanvasHeight -= 1), titleButtonIconOptionClickEvent()),
      onProjectAspectLockButtonClick.key === "ArrowRight" &&
        ((editorCtx.lockedCanvasHeight += 1), titleButtonIconOptionClickEvent()));
  }),
  projectCanvasWidthElement.addEventListener("input", () => {
    (openAssetPicker("width"),
      editorCtx.resizeWarningResolveState ||
        ((editorCtx.isAspectLockedState = Number(projectCanvasWidthElement.value) || 2778),
        (editorCtx.isAspectLockedValue = Number(projectCanvasHeightElement.value) || 1940)),
      lightStatisticsEntityListClickEvent());
  }),
  projectCanvasHeightElement.addEventListener("input", () => {
    (openAssetPicker("height"),
      editorCtx.resizeWarningResolveState ||
        ((editorCtx.isAspectLockedState = Number(projectCanvasWidthElement.value) || 2778),
        (editorCtx.isAspectLockedValue = Number(projectCanvasHeightElement.value) || 1940)),
      lightStatisticsEntityListClickEvent());
  }),
  projectAspectLockElement.addEventListener("click", () => {
    if (editorCtx.resizeWarningResolveState || !["create", "resize"].includes(editorCtx.projectDialogMode)) return;
    const inputWidthValue = Number(projectCanvasWidthElement.value),
      inputHeightValue = Number(projectCanvasHeightElement.value);
    if (
      !Number.isInteger(inputWidthValue) ||
      !Number.isInteger(inputHeightValue) ||
      inputWidthValue < 320 ||
      inputWidthValue > 7680 ||
      inputHeightValue < 240 ||
      inputHeightValue > 4320
    ) {
      setSettingsMessage(projectMessageElement, "请先输入有效的宽度和高度后再锁定比例。", "error");
      return;
    }
    ((editorCtx.isAspectLocked = !editorCtx.isAspectLocked),
      editorCtx.isAspectLocked &&
        ((editorCtx.lockedCanvasWidthState = inputWidthValue), (editorCtx.lockedCanvasWidth = inputHeightValue)),
      setSettingsMessage(projectMessageElement, ""),
      imageEntityDraftDocument(false));
  }),
  projectResizeWarningCloseElement.addEventListener("click", () => folderDocumentNode(false)),
  projectResizeWarningCancelElement.addEventListener("click", () => folderDocumentNode(false)),
  projectResizeWarningConfirmElement.addEventListener("click", () => folderDocumentNode(true)),
  projectResizeWarningDialogElement.addEventListener("cancel", (onProjectFormSubmit: any) => {
    (onProjectFormSubmit.preventDefault(), folderDocumentNode(false));
  }),
  projectFormElement.addEventListener("submit", async (projectSubmitEvent: any) => {
    projectSubmitEvent.preventDefault();
    const projectForm = new FormData(projectFormElement),
      projectNameInput = String(projectForm.get("name") || "").trim(),
      formCanvasWidth = Number(projectForm.get("canvasWidth")),
      formCanvasHeight = Number(projectForm.get("canvasHeight")),
      checked = editorCtx.projectDialogMode === "resize" && projectContentLockElement.checked;
    if (editorCtx.projectDialogMode === "resize" && checked) {
      const currentCanvasWidth = Number(editorCtx.activeProject?.document?.canvas?.width || 2778),
        currentCanvasHeight = Number(editorCtx.activeProject?.document?.canvas?.height || 1940),
        outsideComponentCount =
          formCanvasWidth !== currentCanvasWidth || formCanvasHeight !== currentCanvasHeight
            ? countComponentsOutsideCanvas2(
                resizeDashboardDocument2(
                  editorCtx.activeProject.document,
                  formCanvasWidth,
                  formCanvasHeight,
                  {
                    lockContent: true,
                  },
                ),
                formCanvasWidth,
                formCanvasHeight,
              )
            : 0;
      if (
        outsideComponentCount > 0 &&
        !(await assetIdToDelete(outsideComponentCount, formCanvasWidth, formCanvasHeight))
      )
        return;
    }
    ((projectSubmitElement.disabled = true),
      setSettingsMessage(
        projectMessageElement,
        editorCtx.projectDialogMode === "resize"
          ? "正在调整整个仪表盘…"
          : editorCtx.projectDialogMode === "edit"
            ? "正在保存仪表盘名称…"
            : editorCtx.resizeWarningResolveState
              ? "正在套用HomeOS整套模板…"
              : "正在创建空白仪表盘…",
      ));
    try {
      if (editorCtx.projectDialogMode === "resize") {
        const resizedDocument = resizeDashboardDocument2(
          editorCtx.activeProject.document,
          formCanvasWidth,
          formCanvasHeight,
          {
            lockContent: checked,
          },
        );
        if (((resizedDocument.name = projectNameInput), !(await projectSummary(resizedDocument))))
          return;
        projectDialogElement.close();
      } else {
        if (editorCtx.projectDialogMode === "edit") {
          const renamedDocument = clone2(editorCtx.activeProject.document);
          if (((renamedDocument.name = projectNameInput), !(await projectSummary(renamedDocument))))
            return;
          projectDialogElement.close();
        } else {
          const createProjectPayload = {
            name: projectNameInput,
            canvasWidth: formCanvasWidth,
            canvasHeight: formCanvasHeight,
          };
          const menuWasHidden = await requestJson("/projects", {
            method: "POST",
            body: JSON.stringify(createProjectPayload),
          });
          (projectDialogElement.close(), await initialPagePath(menuWasHidden.id));
        }
      }
    } catch (onProjectActionsMenuClick: any) {
      setSettingsMessage(projectMessageElement, onProjectActionsMenuClick.message, "error");
    } finally {
      projectSubmitElement.disabled = false;
    }
  }),
  projectActionsButtonElement.addEventListener("click", () => {
    const hidden2 = projectActionsMenuElement.hidden;
    (closeCustomSelect(),
      errorPhase(),
      value(),
      (projectActionsMenuElement.hidden = !hidden2),
      projectActionsButtonElement.setAttribute("aria-expanded", String(hidden2)));
  }),
  projectFloorplanOpenElement.addEventListener("click", () => {
    documentSource() || navigateInShell("/3d-studio");
  }),
  projectActionsMenuElement.addEventListener("click", async (projectActionsClickEvent: any) => {
    const projectAction =
      projectActionsClickEvent.target.closest("[data-project-action]")?.dataset.projectAction;
    if (!(!projectAction || !editorCtx.activeProject) && (errorPhase(), !documentSource())) {
      if (projectAction === "edit") {
        lightStatisticsIconCopyError("edit");
        return;
      }
      if (projectAction === "resize") {
        lightStatisticsIconCopyError("resize");
        return;
      }
      if (projectAction === "duplicate") {
        const sourceProjectName = editorCtx.activeProject.document.name,
          existingProjectNamesSet = new Set(
            editorCtx.projects.map((projectNameCandidate: any) => projectNameCandidate.name),
          );
        let copyName = sourceProjectName + " 副本",
          copyIndex = 2;
        for (; existingProjectNamesSet.has(copyName);)
          copyName = sourceProjectName + " 副本 " + copyIndex++;
        try {
          const duplicatedProject = await requestJson(
            "/projects/" + editorCtx.activeProject.projectId + "/duplicate",
            {
              method: "POST",
              body: JSON.stringify({
                name: copyName,
              }),
            },
          );
          await initialPagePath(duplicatedProject.id);
        } catch (duplicateProjectError: any) {
          handleOperationError(duplicateProjectError);
        }
        return;
      }
      if (projectAction === "delete") {
        const projectToDelete = editorCtx.projects.find(
          (deleteProjectBackdropEvent: any) => deleteProjectBackdropEvent.id === editorCtx.activeProject.projectId,
        );
        if (!projectToDelete) return;
        (deleteProjectFormElement.reset(),
          (deleteProjectNameElement.textContent = "“" + projectToDelete.name + "”"),
          (deleteProjectDialogElement.dataset.projectId = projectToDelete.id),
          (deleteProjectDialogElement.dataset.projectName = projectToDelete.name),
          setSettingsMessage(deleteProjectMessageElement, ""),
          deleteProjectDialogElement.showModal());
      }
    }
  }),
  deleteProjectCloseButtonElement.addEventListener("click", () =>
    deleteProjectDialogElement.close(),
  ),
  deleteProjectCancelButtonElement.addEventListener("click", () =>
    deleteProjectDialogElement.close(),
  ),
  deleteProjectDialogElement.addEventListener("click", (onDeleteProjectFormSubmit: any) => {
    onDeleteProjectFormSubmit.target === deleteProjectDialogElement &&
      deleteProjectDialogElement.close();
  }),
  deleteProjectFormElement.addEventListener("submit", async (deleteProjectSubmitEvent: any) => {
    deleteProjectSubmitEvent.preventDefault();
    const deleteProjectSubmitButton =
        deleteProjectFormElement.querySelector('button[type="submit"]'),
      deleteProjectConfirmText = String(
        new FormData(deleteProjectFormElement).get("confirmation") || "",
      ),
      projectId4 = deleteProjectDialogElement.dataset.projectId,
      projectName = deleteProjectDialogElement.dataset.projectName;
    if (deleteProjectConfirmText !== projectName) {
      setSettingsMessage(
        deleteProjectMessageElement,
        "请输入与项目名称完全一致的确认文字。",
        "error",
      );
      return;
    }
    ((deleteProjectSubmitButton.disabled = true),
      setSettingsMessage(deleteProjectMessageElement, "正在删除项目和草稿…"));
    try {
      (await requestJson("/projects/" + projectId4, {
        method: "DELETE",
        body: JSON.stringify({
          confirmation: deleteProjectConfirmText,
        }),
      }),
        discardRecoverySnapshot(projectId4),
        deleteProjectDialogElement.close(),
        editorCtx.editorRenderer?.destroy(),
        (editorCtx.editorRenderer = null),
        (editorCtx.activeProject = null),
        clearComponentSelection(),
        await initialPagePath());
    } catch (pageBackdropEvent: any) {
      setSettingsMessage(deleteProjectMessageElement, pageBackdropEvent.message, "error");
    } finally {
      deleteProjectSubmitButton.disabled = false;
    }
  }),
  pageNewElement.addEventListener("click", () => closeDeletePopupDialog("create")),
  pageCloseElement.addEventListener("click", () => pageDialogElement.close()),
  pageCancelElement.addEventListener("click", () => pageDialogElement.close()),
  pageDialogElement.addEventListener("click", (onPageFormSubmit: any) => {
    onPageFormSubmit.target === pageDialogElement && pageDialogElement.close();
  }),
  pageFormElement.addEventListener("submit", async (pageSubmitEvent: any) => {
    pageSubmitEvent.preventDefault();
    const pageNameInput = String(new FormData(pageFormElement).get("name") || "").trim(),
      pageDraftDocument = clone2(editorCtx.activeProject.document),
      pageSelectPath = pageSelectElement.value;
    ((pageSubmitElement.disabled = true),
      setSettingsMessage(
        pageMessageElement,
        editorCtx.pageDialogMode === "rename" ? "正在保存页面名称…" : "正在创建页面…",
      ));
    try {
      if (editorCtx.pageDialogMode === "rename") {
        const renamedPage = pageDraftDocument.pages.find(
          (pageCandidate: any) => pageCandidate.path === pageSelectPath,
        );
        if (
          ((renamedPage.name = pageNameInput),
          !(await projectSummary(pageDraftDocument, pageSelectPath)))
        )
          return;
      } else {
        const newPageObject = {
            id: newId2("page"),
            name: pageNameInput,
            path: uniquePagePath2(editorCtx.activeProject?.document?.pages, pageNameInput),
            sharedComponentIds: pageDraftDocument.sharedComponents.map(
              (bindDialogSection: any) => bindDialogSection.id,
            ),
            components: [] as any[],
          },
          insertIndex = Math.max(
            0,
            pageDraftDocument.pages.findIndex(
              (onComponentGroupRenameDialogClick: any) =>
                onComponentGroupRenameDialogClick.path === pageSelectPath,
            ),
          );
        if (
          (pageDraftDocument.pages.splice(insertIndex + 1, 0, newPageObject),
          !(await projectSummary(pageDraftDocument, newPageObject.path)))
        )
          return;
      }
      pageDialogElement.close();
    } catch (groupRenameBackdropEvent: any) {
      setSettingsMessage(pageMessageElement, groupRenameBackdropEvent.message, "error");
    } finally {
      pageSubmitElement.disabled = false;
    }
  }),
  componentGroupRenameCloseElement.addEventListener("click", () =>
    componentGroupRenameDialogElement.close(),
  ),
  componentGroupRenameCancelElement.addEventListener("click", () =>
    componentGroupRenameDialogElement.close(),
  ),
  componentGroupRenameDialogElement.addEventListener(
    "click",
    (onComponentGroupRenameFormSubmit: any) => {
      onComponentGroupRenameFormSubmit.target === componentGroupRenameDialogElement &&
        componentGroupRenameDialogElement.close();
    },
  ),
  componentGroupRenameFormElement.addEventListener("submit", (groupRenameSubmitEvent: any) => {
    groupRenameSubmitEvent.preventDefault();
    const groupComponentId = componentGroupRenameDialogElement.dataset.groupId || "",
      renamedGroupComponent = findComponent2(editorCtx.activeProject?.document, groupComponentId)?.component;
    if (!renamedGroupComponent || renamedGroupComponent.type !== "group") {
      componentGroupRenameDialogElement.close();
      return;
    }
    const currentGroupLabel = componentLabel2(renamedGroupComponent),
      slice4 = String(new FormData(componentGroupRenameFormElement).get("name") || "")
        .trim()
        .slice(0, 128);
    if (!slice4) {
      setSettingsMessage(componentGroupRenameMessageElement, "请输入组合名称。", "error");
      return;
    }
    if (slice4 === currentGroupLabel) {
      componentGroupRenameDialogElement.close();
      return;
    }
    (mutateDocument((onPageActionsButtonClick: any) => {
      const pageMenuWasHidden = findComponent2(
        onPageActionsButtonClick,
        groupComponentId,
      )?.component;
      pageMenuWasHidden?.type === "group" &&
        (pageMenuWasHidden.properties = {
          ...(pageMenuWasHidden.properties || {}),
          label: slice4,
        });
    }),
      componentGroupRenameDialogElement.close());
  }),
  pageActionsButtonElement.addEventListener("click", () => {
    const hidden3 = pageActionsMenuElement.hidden;
    (closeCustomSelect(),
      errorPhase(),
      value(),
      (pageActionsMenuElement.hidden = !hidden3),
      pageActionsButtonElement.setAttribute("aria-expanded", String(hidden3)));
  }),
  pageActionsMenuElement.addEventListener("click", async (pageActionsClickEvent: any) => {
    const pageAction =
        pageActionsClickEvent.target.closest("[data-page-action]")?.dataset.pageAction,
      ct4 = currentPage();
    if (!pageAction || !ct4 || !editorCtx.activeProject) return;
    if ((value(), pageAction === "rename")) {
      closeDeletePopupDialog("rename");
      return;
    }
    const pageActionDocument = clone2(editorCtx.activeProject.document),
      pageIndex = pageActionDocument.pages.findIndex(
        (pageIndexCandidate: any) => pageIndexCandidate.path === ct4.path,
      );
    if (pageAction === "default") {
      if (pageActionDocument.defaultPagePath === ct4.path) return;
      pageActionDocument.defaultPagePath = ct4.path;
      try {
        if (!(await projectSummary(pageActionDocument, ct4.path))) return;
        await saveDraft();
      } catch (defaultPageError: any) {
        handleOperationError(defaultPageError);
      }
      return;
    }
    if (pageAction === "duplicate") {
      const duplicatedPage = clonePageWithFreshIds2(
        ct4,
        ct4.name + " 副本",
        editorCtx.activeProject.document.pages,
      );
      pageActionDocument.pages.splice(pageIndex + 1, 0, duplicatedPage);
      try {
        await projectSummary(pageActionDocument, duplicatedPage.path);
      } catch (deletePageBackdropEvent: any) {
        handleOperationError(deletePageBackdropEvent);
      }
      return;
    }
    pageAction === "delete" &&
      ((deletePageDialogElement.dataset.pagePath = ct4.path),
      (deletePageNameElement.textContent = "“" + ct4.name + "”"),
      setSettingsMessage(deletePageMessageElement, ""),
      deletePageDialogElement.showModal());
  }),
  deletePageCloseButtonElement.addEventListener("click", () => deletePageDialogElement.close()),
  deletePageCancelButtonElement.addEventListener("click", () => deletePageDialogElement.close()),
  deletePageDialogElement.addEventListener("click", (onDeletePageConfirmButtonClick: any) => {
    onDeletePageConfirmButtonClick.target === deletePageDialogElement &&
      deletePageDialogElement.close();
  }),
  deletePageConfirmButtonElement.addEventListener("click", async () => {
    const pagePath = deletePageDialogElement.dataset.pagePath,
      deletePageDocument = clone2(editorCtx.activeProject.document),
      deletedPageIndex = deletePageDocument.pages.findIndex(
        (deletedPageCandidate: any) => deletedPageCandidate.path === pagePath,
      );
    if (deletedPageIndex < 0) {
      setSettingsMessage(deletePageMessageElement, "页面已经不存在，请刷新后重试。", "error");
      return;
    }
    const deletedPage = deletePageDocument.pages[deletedPageIndex];
    deletePageDocument.pages.splice(deletedPageIndex, 1);
    const fallbackPagePath =
        deletePageDocument.pages[Math.max(0, deletedPageIndex - 1)]?.path ||
        deletePageDocument.pages[0]?.path ||
        null,
      fallbackPage = deletePageDocument.pages.find(
        (fallbackCandidate: any) => fallbackCandidate.path === fallbackPagePath,
      );
    deletePageDocument.defaultPagePath === pagePath &&
      (deletePageDocument.defaultPagePath = fallbackPagePath);
    const remapPageReferences = (scannedComponent: any) => {
      for (const actionKind of scannedComponent || []) {
        if (
          ((actionKind.properties = {
            ...(actionKind.properties || {}),
          }),
          actionKind.type === "navigation-button" && actionKind.properties.targetPage === pagePath)
        ) {
          (!actionKind.properties.mainText ||
            actionKind.properties.mainText === "页面导航" ||
            actionKind.properties.mainText === deletedPage?.name) &&
            (actionKind.properties.mainText = fallbackPage?.name || "页面导航");
          const upperCase = String(pagePath).replace(/[-_]+/g, " ").toUpperCase();
          ((!actionKind.properties.secondaryText ||
            actionKind.properties.secondaryText === "NAVIGATION" ||
            actionKind.properties.secondaryText === upperCase) &&
            (actionKind.properties.secondaryText = fallbackPagePath
              ? String(fallbackPagePath).replace(/[-_]+/g, " ").toUpperCase()
              : "NAVIGATION"),
            fallbackPagePath
              ? (actionKind.properties.targetPage = fallbackPagePath)
              : delete actionKind.properties.targetPage);
        }
        actionKind.actions = {
          ...(actionKind.actions || {}),
        };
        for (const scannedPage of ["tap", "doubleTap", "hold"])
          actionKind.actions[scannedPage]?.type === "navigate" &&
            actionKind.actions[scannedPage]?.target === pagePath &&
            (actionKind.type === "navigation-button" && fallbackPagePath
              ? (actionKind.actions[scannedPage] = {
                  type: "navigate",
                  target: fallbackPagePath,
                })
              : delete actionKind.actions[scannedPage]);
        remapPageReferences(actionKind.children);
      }
    };
    remapPageReferences(deletePageDocument.sharedComponents);
    for (const deletePageError of deletePageDocument.pages)
      remapPageReferences(deletePageError.components);
    ((deletePageConfirmButtonElement.disabled = true),
      setSettingsMessage(deletePageMessageElement, "正在删除页面…"));
    try {
      if (!(await projectSummary(deletePageDocument, fallbackPagePath))) return;
      deletePageDialogElement.close();
    } catch (onComponentMenuClick: any) {
      setSettingsMessage(deletePageMessageElement, onComponentMenuClick.message, "error");
    } finally {
      deletePageConfirmButtonElement.disabled = false;
    }
  }),
  componentMenuElement.addEventListener("click", (menuClickEvent: any) => {
    const hp2 = editorCtx.menuComponentId,
      componentAction =
        menuClickEvent.target.closest("[data-component-action]")?.dataset.componentAction,
      labelColorElement = menuClickEvent.target.closest("[data-label-color]");
    if (!hp2 || (!componentAction && !labelColorElement)) return;
    const actionComponentIds = editorCtx.selectedComponentIdsSet.has(hp2)
      ? [...editorCtx.selectedComponentIdsSet]
      : [hp2];
    if ((closeComponentMenu(), componentAction === "copy")) {
      duplicateComponents(actionComponentIds, hp2);
      return;
    }
    if (componentAction === "group") {
      groupSelectedComponents(actionComponentIds);
      return;
    }
    if (componentAction === "ungroup") {
      ungroupComponent(hp2);
      return;
    }
    if (componentAction === "rename-group") {
      openGroupRenameDialog(hp2);
      return;
    }
    if (componentAction === "copy-to-page") {
      openCopyComponentDialog(actionComponentIds);
      return;
    }
    if (componentAction === "visibility") {
      const visibilityFlags = actionComponentIds
        .map(
          (onCopyComponentSuccessGoButtonClick) =>
            findComponent2(editorCtx.activeProject?.document, onCopyComponentSuccessGoButtonClick)?.component,
        )
        .filter(Boolean)
        .map(
          (onCopyComponentSuccessDialogClick) =>
            onCopyComponentSuccessDialogClick.style?.visible !== false,
        );
      if (
        visibilityFlags.length !== actionComponentIds.length ||
        !visibilityFlags.length ||
        !visibilityFlags.every(
          (copySuccessBackdropEvent) => copySuccessBackdropEvent === visibilityFlags[0],
        )
      )
        return;
      setComponentsVisibility(actionComponentIds, !visibilityFlags[0]);
      return;
    }
    if (componentAction === "delete") {
      deleteComponentIds(actionComponentIds);
      return;
    }
    labelColorElement &&
      setComponentsLabelColor(actionComponentIds, labelColorElement.dataset.labelColor);
  }),
  deleteComponentCloseButtonElement.addEventListener("click", () =>
    deleteComponentDialogElement.close(),
  ),
  deleteComponentCancelButtonElement.addEventListener("click", () =>
    deleteComponentDialogElement.close(),
  ),
  deleteComponentDialogElement.addEventListener("click", (onCopyComponentPageScopeSelectChange: any) => {
    onCopyComponentPageScopeSelectChange.target === deleteComponentDialogElement &&
      deleteComponentDialogElement.close();
  }),
  copyComponentPageCloseButtonElement.addEventListener("click", () =>
    copyComponentPageDialogElement.close(),
  ),
  copyComponentPageCancelButtonElement.addEventListener("click", () =>
    copyComponentPageDialogElement.close(),
  ),
  copyComponentPageDialogElement.addEventListener(
    "click",
    (onCopyComponentPageProjectSelectChange: any) => {
      onCopyComponentPageProjectSelectChange.target === copyComponentPageDialogElement &&
        copyComponentPageDialogElement.close();
    },
  ),
  copyComponentSuccessStayElement.addEventListener("click", () => {
    ((editorCtx.copySuccessNavigationTarget = null), copyComponentSuccessDialogElement.close());
  }),
  copyComponentSuccessGoElement.addEventListener("click", () => {
    handleCopySuccessConfirm().catch(handleOperationError);
  }),
  copyComponentSuccessDialogElement.addEventListener("click", (onCopyComponentPageFormSubmit: any) => {
    onCopyComponentPageFormSubmit.target === copyComponentSuccessDialogElement &&
      ((editorCtx.copySuccessNavigationTarget = null), copyComponentSuccessDialogElement.close());
  }),
  copyComponentPageScopeSelectElement.addEventListener("change", () => {
    renderCopyComponentDialog();
  }),
  copyComponentPageProjectSelectElement.addEventListener("change", () => {
    copyComponentPageScopeSelectElement.value === "other" && renderCopyComponentDialog();
  }),
  copyComponentPageFormElement.addEventListener("submit", async (copyComponentSubmitEvent: any) => {
    copyComponentSubmitEvent.preventDefault();
    let componentIdsToCopy: any[] = [];
    try {
      componentIdsToCopy = JSON.parse(copyComponentPageDialogElement.dataset.componentIds || "[]");
    } catch {
      componentIdsToCopy = [];
    }
    const copyTargetValue = copyComponentPageTargetElement.value,
      isCrossProjectCopy = copyComponentPageScopeSelectElement.value === "other";
    if (!(!editorCtx.activeProject || !componentIdsToCopy.length || !copyTargetValue)) {
      ((copyComponentPageSubmitElement.disabled = true),
        setSettingsMessage(copyComponentPageMessageElement, "正在复制控件…"));
      try {
        if (isCrossProjectCopy) {
          const copyTargetProjectId = copyComponentPageProjectSelectElement.value;
          if (
            !copyTargetProjectId ||
            !editorCtx.copyTargetDraft ||
            editorCtx.copyTargetDraft.projectId !== copyTargetProjectId
          )
            throw new Error("目标仪表盘尚未加载完成，请稍后重试。");
          const targetProjectDraftDocument = clone2(editorCtx.copyTargetDraft.document),
            copyScaleMode = copyComponentScaleOptionsElement.hidden
              ? "none"
              : copyComponentPageFormElement.elements.copyScaleMode.value;
          let droppedActionCount = 0;
          const copiedComponents = copyComponentsAcrossDocuments2(
            editorCtx.activeProject.document,
            targetProjectDraftDocument,
            componentIdsToCopy,
            copyTargetValue,
            {
              cloneValue: clone2,
              createId: () => newId2("component"),
              componentLabel: componentLabel2,
              scaleMode: copyScaleMode,
              onInvalidAction: () => {
                droppedActionCount += 1;
              },
            },
          );
          if (!copiedComponents.length) throw new Error("目标页面或源控件已发生变化，请重新操作。");
          const copyDraftResponse = await requestJson(
            "/projects/" + encodeURIComponent(copyTargetProjectId) + "/draft",
            {
              method: "PUT",
              body: JSON.stringify({
                revision: editorCtx.copyTargetDraft.revision,
                globalPopupRevision: editorCtx.copyTargetDraft.globalPopupRevision,
                globalPopupsDirty: false,
                document: targetProjectDraftDocument,
              }),
            },
          );
          editorCtx.copyTargetDraft = copyDraftResponse;
          const copyTargetProject = editorCtx.projects.find(
            (copyTargetCandidate: any) => copyTargetCandidate.id === copyTargetProjectId,
          );
          copyTargetProject && (copyTargetProject.draftRevision = copyDraftResponse.revision);
          const copyTargetProjectName = copyTargetProject?.name || "目标仪表盘",
            copyTargetPageLabel =
              copyComponentPageTargetElement.selectedOptions[0]?.textContent || "目标区域",
            cleanupNotice = droppedActionCount
              ? "（已清理 " + droppedActionCount + " 个目标仪表盘不存在的跳转或弹窗动作）"
              : "";
          (copyComponentPageDialogElement.close(),
            showCopySuccessDialog(
              "已复制 " +
                copiedComponents.length +
                " 个控件到“" +
                copyTargetProjectName +
                "”的“" +
                copyTargetPageLabel +
                "”，并已保存" +
                cleanupNotice +
                "。",
              {
                projectId: copyTargetProjectId,
                pagePath:
                  copyTargetValue === "shared"
                    ? editorCtx.copyTargetDraft.document.pages?.[0]?.path
                    : copyTargetValue.replace(/^page:/, ""),
                scope: copyTargetValue === "shared" ? "shared" : "page",
              },
            ));
          return;
        }
        const localDraftDocument = clone2(editorCtx.activeProject.document),
          copiedLocalComponents = copyComponentsToTarget2(
            localDraftDocument,
            componentIdsToCopy,
            copyTargetValue,
            {
              cloneValue: clone2,
              createId: () => newId2("component"),
              componentLabel: componentLabel2,
            },
          );
        if (!copiedLocalComponents.length)
          throw new Error("目标页面或源控件已发生变化，请重新操作。");
        ((editorCtx.selectedComponentId = copiedLocalComponents[0].id),
          (editorCtx.selectedComponentIdsSet = new Set(
            copiedLocalComponents.map((copiedComponentItem) => copiedComponentItem.id),
          )),
          (editorCtx.selectionAnchorComponentId = copiedLocalComponents[0].id));
        const replace4 =
            copyTargetValue === "shared"
              ? pageSelectElement.value
              : copyTargetValue.replace(/^page:/, ""),
          localCopyTargetLabel =
            copyComponentPageTargetElement.selectedOptions[0]?.textContent || "目标区域";
        if (!(await projectSummary(localDraftDocument, replace4))) return;
        (copyComponentPageDialogElement.close(),
          showCopySuccessDialog(
            "已复制 " +
              copiedLocalComponents.length +
              " 个控件到“" +
              localCopyTargetLabel +
              "”，并已保存。",
            {
              projectId: editorCtx.activeProject.projectId,
              pagePath: replace4,
              scope: copyTargetValue === "shared" ? "shared" : "page",
            },
          ));
      } catch (onDeleteComponentConfirmButtonClick: any) {
        setSettingsMessage(
          copyComponentPageMessageElement,
          onDeleteComponentConfirmButtonClick.message,
          "error",
        );
      } finally {
        (!isCrossProjectCopy || !copyComponentPageMessageElement.classList.contains("success")) &&
          (copyComponentPageSubmitElement.disabled = false);
      }
    }
  }),
  deleteComponentConfirmButtonElement.addEventListener("click", () => {
    let pendingDeleteComponentIds: any[] = [];
    try {
      pendingDeleteComponentIds = JSON.parse(
        deleteComponentDialogElement.dataset.componentIds || "[]",
      );
    } catch {
      pendingDeleteComponentIds = [];
    }
    if (!pendingDeleteComponentIds.length) return;
    deleteComponentDialogElement.close();
    const deleteIdSet = new Set(pendingDeleteComponentIds);
    ((editorCtx.selectedComponentIdsSet = new Set(
      [...editorCtx.selectedComponentIdsSet].filter(
        (deletedComponentId) => !deleteIdSet.has(deletedComponentId),
      ),
    )),
      deleteIdSet.has(editorCtx.selectedComponentId) &&
        (editorCtx.selectedComponentId = editorCtx.selectedComponentIdsSet.values().next().value || null),
      deleteIdSet.has(editorCtx.selectionAnchorComponentId) &&
        (editorCtx.selectionAnchorComponentId = editorCtx.selectedComponentId),
      mutateDocument((onImageInspectorFormSubmit: any) => {
        for (const imageInspectorSubmitEvent of pendingDeleteComponentIds)
          removeComponent(onImageInspectorFormSubmit, imageInspectorSubmitEvent);
      }));
  }),
  imageInspectorElement.addEventListener("submit", (onIconButtonEffectInspectorFormSubmit: any) =>
    onIconButtonEffectInspectorFormSubmit.preventDefault(),
  ),
  iconButtonEffectInspectorElement.addEventListener(
    "submit",
    (iconButtonEffectInspectorSubmitEvent: any) => iconButtonEffectInspectorSubmitEvent.preventDefault(),
  ),
  titleButtonInspectorElement.addEventListener("submit", (onTitleButtonInspectorFormSubmit: any) =>
    onTitleButtonInspectorFormSubmit.preventDefault(),
  ),
  lightStatisticsInspectorElement.addEventListener("submit", (titleButtonInspectorSubmitEvent: any) =>
    titleButtonInspectorSubmitEvent.preventDefault(),
  ),
  iconButtonInspectorElement.addEventListener("submit", (onLightStatisticsInspectorFormSubmit: any) =>
    onLightStatisticsInspectorFormSubmit.preventDefault(),
  ),
  vacuumMapInspectorElement.addEventListener("submit", (lightStatisticsInspectorSubmitEvent: any) =>
    lightStatisticsInspectorSubmitEvent.preventDefault(),
  ),
  cameraInspectorElement.addEventListener("submit", (onIconButtonInspectorFormSubmit: any) =>
    onIconButtonInspectorFormSubmit.preventDefault(),
  ),
  airConditionerInspectorElement.addEventListener("submit", (iconButtonInspectorSubmitEvent: any) =>
    iconButtonInspectorSubmitEvent.preventDefault(),
  ),
  timeInspectorElement.addEventListener("submit", (onVacuumMapInspectorFormSubmit: any) =>
    onVacuumMapInspectorFormSubmit.preventDefault(),
  ),
  dateInspectorElement.addEventListener("submit", (vacuumMapInspectorSubmitEvent: any) =>
    vacuumMapInspectorSubmitEvent.preventDefault(),
  ),
  weatherInspectorElement.addEventListener("submit", (onCameraInspectorFormSubmit: any) =>
    onCameraInspectorFormSubmit.preventDefault(),
  ),
  lineChartInspectorElement.addEventListener("submit", (cameraInspectorSubmitEvent: any) =>
    cameraInspectorSubmitEvent.preventDefault(),
  ),
  panelFrameInspectorFormElement.addEventListener("submit", (onAirConditionerInspectorFormSubmit: any) =>
    onAirConditionerInspectorFormSubmit.preventDefault(),
  ),
  navigationInspectorFormElement.addEventListener("submit", (airConditionerInspectorSubmitEvent: any) =>
    airConditionerInspectorSubmitEvent.preventDefault(),
  );
const {
    airConditionerInspectorSubmitEventById,
    onTimeInspectorFormSubmitById,
  } = createInspectorSubmitTables({
    airConditionerLabelElement,
    airConditionerMainTextElement,
    airConditionerSecondaryTextElement,
    cameraLabelElement,
    dateLabelElement,
    ibeLabelElement,
    iconButtonLabelElement,
    iconButtonMainTextElement,
    iconButtonSecondaryTextElement,
    imageLabelElement,
    lightStatisticsLabelElement,
    lightStatisticsTitleElement,
    lineChartLabelElement,
    navigationLabelElement,
    navigationMainTextElement,
    navigationSecondaryTextElement,
    panelFrameLabelTextInputElement,
    panelFrameMainTextInputElement,
    panelFrameSecondaryTextInputElement,
    timeLabelElement,
    titleButtonLabelElement,
    titleButtonMainTextElement,
    titleButtonSecondaryLine1Element,
    titleButtonSecondaryLine2Element,
    vacuumMapLabelElement,
    weatherLabelElement,
  });
for (const [
  onTimeInspectorFormSubmit,
  timeInspectorSubmitEvent,
] of airConditionerInspectorSubmitEventById)
  (onTimeInspectorFormSubmit.addEventListener("focus", () => {
    !editorCtx.activeProject ||
      !editorCtx.selectedComponentId ||
      onTimeInspectorFormSubmitById.set(onTimeInspectorFormSubmit, {
        componentId: editorCtx.selectedComponentId,
        before: historyEntries(),
        historyRecorded: false,
      });
  }),
    onTimeInspectorFormSubmit.addEventListener("input", () => {
      if (!editorCtx.activeProject || !editorCtx.selectedComponentId) return;
      const timeInspectorSubmitEventState = findComponent2(
          editorCtx.activeProject.document,
          editorCtx.selectedComponentId,
        ),
        timeInspectorSubmitEventValue = timeInspectorSubmitEvent.componentTypes || [
          timeInspectorSubmitEvent.componentType,
        ];
      if (
        !timeInspectorSubmitEventState?.component ||
        !timeInspectorSubmitEventValue.includes(timeInspectorSubmitEventState.component.type)
      )
        return;
      const onDateInspectorFormSubmitState = timeInspectorSubmitEvent.getValue
          ? timeInspectorSubmitEvent.getValue()
          : onTimeInspectorFormSubmit.value,
        onDateInspectorFormSubmitValue = timeInspectorSubmitEvent.trim
          ? onDateInspectorFormSubmitState.trim()
          : onDateInspectorFormSubmitState;
      if (
        String(
          timeInspectorSubmitEventState.component.properties?.[timeInspectorSubmitEvent.property] ||
            "",
        ) === onDateInspectorFormSubmitValue
      )
        return;
      let onDateInspectorFormSubmitConfig =
        onTimeInspectorFormSubmitById.get(onTimeInspectorFormSubmit);
      ((!onDateInspectorFormSubmitConfig ||
        onDateInspectorFormSubmitConfig.componentId !== editorCtx.selectedComponentId) &&
        ((onDateInspectorFormSubmitConfig = {
          componentId: editorCtx.selectedComponentId,
          before: historyEntries(),
          historyRecorded: false,
        }),
        onTimeInspectorFormSubmitById.set(
          onTimeInspectorFormSubmit,
          onDateInspectorFormSubmitConfig,
        )),
        onDateInspectorFormSubmitConfig.historyRecorded ||
          (refreshDirtyState(historyState.undo, onDateInspectorFormSubmitConfig.before),
          (historyState.redo = []),
          (onDateInspectorFormSubmitConfig.historyRecorded = true)),
        (timeInspectorSubmitEventState.component.properties = {
          ...(timeInspectorSubmitEventState.component.properties || {}),
          [timeInspectorSubmitEvent.property]: onDateInspectorFormSubmitValue,
        }),
        timeInspectorSubmitEvent.property === "label" &&
          (renderComponentLists(),
          editorCtx.editorRenderer?.previewComponentProperties(timeInspectorSubmitEventState.component.id, {
            label: onDateInspectorFormSubmitValue,
          }),
          editorCtx.dashboardPreviewRenderer?.previewComponentProperties(
            timeInspectorSubmitEventState.component.id,
            {
              label: onDateInspectorFormSubmitValue,
            },
          )),
        timeInspectorSubmitEvent.componentType === "navigation-button" &&
          timeInspectorSubmitEvent.property !== "label" &&
          editorCtx.editorRenderer?.previewComponentProperties(timeInspectorSubmitEventState.component.id, {
            [timeInspectorSubmitEvent.property]: onDateInspectorFormSubmitValue,
          }),
        timeInspectorSubmitEvent.componentType === "panel-frame" &&
          timeInspectorSubmitEvent.property !== "label" &&
          editorCtx.editorRenderer?.previewComponentProperties(timeInspectorSubmitEventState.component.id, {
            [timeInspectorSubmitEvent.property]: onDateInspectorFormSubmitValue,
          }),
        timeInspectorSubmitEvent.componentType === "icon-button-effect" &&
          timeInspectorSubmitEvent.property !== "label" &&
          editorCtx.editorRenderer?.previewComponentProperties(timeInspectorSubmitEventState.component.id, {
            [timeInspectorSubmitEvent.property]: onDateInspectorFormSubmitValue,
          }),
        ["title-button", "light-statistics", "icon-button", "air-conditioner"].includes(
          timeInspectorSubmitEvent.componentType,
        ) &&
          timeInspectorSubmitEvent.property !== "label" &&
          editorCtx.editorRenderer?.previewComponentProperties(timeInspectorSubmitEventState.component.id, {
            [timeInspectorSubmitEvent.property]: onDateInspectorFormSubmitValue,
          }),
        writeError(),
        syncHistoryButtons());
    }),
    onTimeInspectorFormSubmit.addEventListener("blur", () =>
      onTimeInspectorFormSubmitById.delete(onTimeInspectorFormSubmit),
    ));
initActionPopupConfig();
attachDateInspectorSubmit({
  get selectedComponentId() { return editorCtx.selectedComponentId; },
  get mutateDocument() { return mutateDocument; },
  get entities() { return editorCtx.entities; },
  get pageSelectElement() { return pageSelectElement; },
  get entitiesByEntityId() { return entitiesByEntityId; },
  get devicesByDeviceId() { return devicesByDeviceId; },
  get removedComponent() { return removedComponent; },
  get editorMode() { return editorCtx.editorMode; },
  get handleOperationError() { return handleOperationError; },
  get ensureEditorRenderer() { return ensureEditorRenderer; },
});

attachDocumentEntityPickerDismiss({
  get closePopupEntityMenus() { return closePopupEntityMenus; },
  get renderPopupEntityOptions() { return renderPopupEntityOptions; },
  get positionPopupEntityMenu() { return positionPopupEntityMenu; },
  get syncPopupEntityButton() { return syncPopupEntityButton; },
  get iconButtonPreviewDetailsElement() { return iconButtonPreviewDetailsElement; },
  get removedComponent() { return removedComponent; },
  get ensureEditorRenderer() { return ensureEditorRenderer; },
  get handleOperationError() { return handleOperationError; },
  get airConditionerPreviewDetailsElement() { return airConditionerPreviewDetailsElement; },
  get imageLayoutOptionsElement() { return imageLayoutOptionsElement; },
  get selectedComponentId() { return editorCtx.selectedComponentId; },
  get mutateDocument() { return mutateDocument; },
  get imageInspectorElement() { return imageInspectorElement; },
  get activeProject() { return editorCtx.activeProject; },
  get imageOpacityInputElement() { return imageOpacityInputElement; },
  get editorRenderer() { return editorCtx.editorRenderer; },
  get imageLeftInputElement() { return imageLeftInputElement; },
  get imageTopInputElement() { return imageTopInputElement; },
  get imageScaleInputElement() { return imageScaleInputElement; },
  get imageRotationInputElement() { return imageRotationInputElement; },
  get imageLabelElement() { return imageLabelElement; },
  get coverMotorButtonElement() { return coverMotorButtonElement; },
  get setComponentsRotation() { return setComponentsRotation; },
});

const floorplanDiagramInputSet = new Set([
  floorplanAutoDiagramLeftInputElement,
  floorplanAutoDiagramTopInputElement,
  floorplanAutoDiagramWidthInputElement,
  floorplanAutoDiagramHeightInputElement,
  floorplanAutoDiagramScaleInputElement,
  floorplanAutoDiagramRotationInputElement,
]);
attachFloorplanDiagramInspectorInput({
  get floorplanAutoDiagramInspectorFormElement() { return floorplanAutoDiagramInspectorFormElement; },
  get removedComponent() { return removedComponent; },
  get floorplanDiagramInputSet() { return floorplanDiagramInputSet; },
  get activeProject() { return editorCtx.activeProject; },
  get floorplanAutoDiagramLeftInputElement() { return floorplanAutoDiagramLeftInputElement; },
  get editorRenderer() { return editorCtx.editorRenderer; },
  get floorplanAutoDiagramTopInputElement() { return floorplanAutoDiagramTopInputElement; },
  get floorplanAutoDiagramWidthInputElement() { return floorplanAutoDiagramWidthInputElement; },
  get floorplanAutoDiagramHeightInputElement() { return floorplanAutoDiagramHeightInputElement; },
  get floorplanAutoDiagramScaleInputElement() { return floorplanAutoDiagramScaleInputElement; },
  get floorplanAutoDiagramRotationInputElement() { return floorplanAutoDiagramRotationInputElement; },
  get selectedComponentId() { return editorCtx.selectedComponentId; },
  get floorplanAutoDiagramLabelTextInputElement() { return floorplanAutoDiagramLabelTextInputElement; },
  get floorplanAutoDiagramFolderTextInputElement() { return floorplanAutoDiagramFolderTextInputElement; },
  get coverMotorButtonElement() { return coverMotorButtonElement; },
  get mutateDocument() { return mutateDocument; },
  get setComponentsRotation() { return setComponentsRotation; },
  get floorplanAutoDiagramLayoutElement() { return floorplanAutoDiagramLayoutElement; },
});

attachPageshowDiagramPreviewRestore({
  get cancelRemovesComponent() { return cancelRemovesComponent; },
  get floorplanAutoDiagramCameraViewElement() { return floorplanAutoDiagramCameraViewElement; },
  get selectedComponentId() { return editorCtx.selectedComponentId; },
  get mutateDocument() { return mutateDocument; },
  get findDiagramPreviewFrame() { return findDiagramPreviewFrame; },
  get floorplanAutoDiagramFloorSelectElement() { return floorplanAutoDiagramFloorSelectElement; },
  get removedComponent() { return removedComponent; },
  get lightInputElement() { return lightInputElement; },
  get floorplanAutoDiagramCameraModeElement() { return floorplanAutoDiagramCameraModeElement; },
  get floorplanAutoDiagramFocalLengthInputElement() { return floorplanAutoDiagramFocalLengthInputElement; },
  get coverMotorButtonElement() { return coverMotorButtonElement; },
  get floorplanAutoDiagramRotateTopButtonElement() { return floorplanAutoDiagramRotateTopButtonElement; },
});

floorplanAutoDiagramOpenBaseLightingButtonElement.addEventListener("click", () => {
  onFloorplanAutoLightingCloseButtonClick(editorCtx.selectedComponentId);
});
for (const onFloorplanAutoLightingHandlePointermoveState of floorplanBaseLightElements)
  onFloorplanAutoLightingHandlePointermoveState.addEventListener("input", () => {
    floorplanAutoLightingPanelElement.hidden ||
      ((floorplanAutoLightingStatusElement.textContent =
        "修改已实时预览，保存后同步到全部3D入口。"),
      lightFieldElement("preview", lightInputNode()));
  });
(floorplanAutoLightingResetButtonElement.addEventListener("click", () => {
  (openLightingPanel(DEFAULT_BASE_LIGHTING2),
    (floorplanAutoLightingStatusElement.textContent = "已预览默认光照，点击保存后生效。"),
    lightFieldElement("reset"));
}),
  floorplanAutoLightingSaveButtonElement.addEventListener("click", () => {
    ((floorplanAutoLightingStatusElement.textContent = "正在保存并同步…"),
      floorplanAutoLightingPanelElement.setAttribute("aria-busy", "true"),
      lightFieldElement("save", lightInputNode()));
  }),
  floorplanAutoLightingCloseButtonElement.addEventListener("click", () =>
    onFloorplanAutoLightingResetButtonClick(),
  ),
  floorplanAutoLightingHandleElement.addEventListener(
    "pointerdown",
    (onFloorplanAutoLightingHandlePointermove: any) => {
      if (
        onFloorplanAutoLightingHandlePointermove.button !== 0 ||
        onFloorplanAutoLightingHandlePointermove.target.closest("button")
      )
        return;
      const targetBoundsEntry = floorplanAutoLightingPanelElement.getBoundingClientRect();
      editorCtx.lightingPanelDragStateState = {
        pointerId: onFloorplanAutoLightingHandlePointermove.pointerId,
        startX: onFloorplanAutoLightingHandlePointermove.clientX,
        startY: onFloorplanAutoLightingHandlePointermove.clientY,
        startLeft: targetBoundsEntry.left,
        startTop: targetBoundsEntry.top,
        // 尺寸与「不越出视口」的上限只在按下时量一次：pointermove 里再读
        // getBoundingClientRect 会因刚写过样式而强制同步布局。
        maxLeft: Math.max(8, window.innerWidth - targetBoundsEntry.width - 8),
        maxTop: Math.max(8, window.innerHeight - targetBoundsEntry.height - 8),
      };
      try {
        floorplanAutoLightingHandleElement.setPointerCapture(
          onFloorplanAutoLightingHandlePointermove.pointerId,
        );
      } catch { /* 指针捕获：指针已失效（pointercancel / 元素已卸载）时规范要求抛错，忽略即可 */ }
    },
  ),
  floorplanAutoLightingHandleElement.addEventListener("pointermove", (lightingDragMoveEvent: any) => {
    if (
      !editorCtx.lightingPanelDragStateState ||
      lightingDragMoveEvent.pointerId !== editorCtx.lightingPanelDragStateState.pointerId
    )
      return;
    lightingDragMoveEvent.preventDefault();
    // 只登记目标坐标；实际写样式在下一帧统一执行 —— pointermove 一帧可触发多次，
    // 每次都写样式+读布局会让拖拽跟随变卡（每次两趟布局）。
    editorCtx.lightingPanelDragPending = {
      x: clampNumber2(
        editorCtx.lightingPanelDragStateState.startLeft +
          lightingDragMoveEvent.clientX -
          editorCtx.lightingPanelDragStateState.startX,
        8,
        editorCtx.lightingPanelDragStateState.maxLeft,
      ),
      y: clampNumber2(
        editorCtx.lightingPanelDragStateState.startTop +
          lightingDragMoveEvent.clientY -
          editorCtx.lightingPanelDragStateState.startY,
        8,
        editorCtx.lightingPanelDragStateState.maxTop,
      ),
    };
    if (editorCtx.lightingPanelDragFrame !== null) return;
    editorCtx.lightingPanelDragFrame = requestAnimationFrame(() => {
      editorCtx.lightingPanelDragFrame = null;
      applyLightingPanelDragMove();
    });
  }));
const endLightingPanelDrag = (dragEndEvent: any) => {
  if (
    !editorCtx.lightingPanelDragStateState ||
    dragEndEvent.pointerId !== editorCtx.lightingPanelDragStateState.pointerId
  )
    return;
  // 收尾：把还没落地的那一帧补上，否则松手位置与视觉位置会差一帧。
  if (editorCtx.lightingPanelDragFrame !== null) {
    cancelAnimationFrame(editorCtx.lightingPanelDragFrame);
    editorCtx.lightingPanelDragFrame = null;
  }
  applyLightingPanelDragMove();
  editorCtx.lightingPanelDragPending = null;
  editorCtx.lightingPanelDragStateState = null;
};
(floorplanAutoLightingHandleElement.addEventListener("pointerup", endLightingPanelDrag),
  floorplanAutoLightingHandleElement.addEventListener("pointercancel", endLightingPanelDrag));
function navigationPreviewDeps(): NavigationPreviewDeps {
  return {
    ...homeElements,
    get airConditionerPreviewStateByComponentId() { return airConditionerPreviewStateByComponentId; },
    get airflowSectionEvent() { return airflowSectionEvent; },
    get airflowSectionEventById() { return airflowSectionEventById; },
    get applyNavigationPreviewState() { return applyNavigationPreviewState; },
    get bindMessageSection() { return bindMessageSection; },
    get closeAutoDiagramDialog() { return closeAutoDiagramDialog; },
    get collectPageImages() { return collectPageImages; },
    get createImageAlignOption() { return createImageAlignOption; },
    get currentPage() { return currentPage; },
    get editorCtx() { return editorCtx; },
    get exportSpliceErrorByIdById() { return exportSpliceErrorByIdById; },
    get findAssetById() { return findAssetById; },
    get iconButtonEffectPreviewStateByComponentId() { return iconButtonEffectPreviewStateByComponentId; },
    get iconButtonPreviewStateByComponentId() { return iconButtonPreviewStateByComponentId; },
    get lineChartBaselineByComponentId() { return lineChartBaselineByComponentId; },
    get mutateDocument() { return mutateDocument; },
    get navigationColorPropertiesByElement() { return navigationColorPropertiesByElement; },
    get navigationPreviewStateByComponentId() { return navigationPreviewStateByComponentId; },
    get navigationPropertyConfigsByElement() { return navigationPropertyConfigsByElement; },
    get navigationToggleStateByElement() { return navigationToggleStateByElement; },
    get previewSyncEventName() { return previewSyncEventName; },
    get removedComponent() { return removedComponent; },
    get runAltCopy() { return resolveComponentStyleValue; },
    get runExtraTwin() { return resolveAssetFileUrl; },
    get setNavigationPreviewState() { return setNavigationPreviewState; },
  };
}
bindFloorplanAutoDiagramControls({
  openStudioButton: floorplanAutoDiagramOpenStudioButtonElement,
  viewToggleButton: floorplanAutoDiagramViewToggleButtonElement,
  closeButton: floorplanAutoDiagramCloseButtonElement,
  laterButton: floorplanAutoDiagramLaterButtonElement,
  dialog: floorplanAutoDiagramDialogElement,
  continueButton: floorplanAutoDiagramContinueElement,
  bindingList: floorplanAutoDiagramBindingListElement,
  status: floorplanAutoDiagramStatusElement,
  folderInput: floorplanAutoDiagramFolderTextInputElement,
  floorSelect: floorplanAutoDiagramFloorSelectElement,
  // 选中组件 / 画布必须惰性读取：事件触发时以「当前」选中项为准。
  selectedComponent: removedComponent,
  projectCanvas: () => editorCtx.activeProject?.document?.canvas || {},
  mutateDocument,
  findComponent: findComponent2,
  settleDialog: settleAutoDiagramDialog,
  closeDialog: closeAutoDiagramDialog,
  cancelRemoveDraftDocument,
  exportResolution: floorplanAutoDiagramExportResolution2,
});
bindFloorplanAutoDiagramMessages({
  AUTO_DIAGRAM_LAYOUT_VERSION,
  applyCollectionLayerOrder2,
  clampNumber2,
  clone2,
  coverMotorButtonElement,
  createComponentFromTemplate2,
  editorCtx,
  findComponent2,
  findComponentLocation2,
  floorplanAutoDiagramFloorSelectElement,
  floorplanAutoDiagramFolderTextInputElement,
  floorplanAutoDiagramOpenStudioButtonElement,
  floorplanAutoDiagramStateByComponentId,
  floorplanAutoDiagramStatusElement,
  floorplanAutoLightingPanelElement,
  floorplanAutoLightingStatusElement,
  handleOperationError,
  lightingPayload,
  mutateDocument,
  newId2,
  normalizeBaseLighting2,
  onWindowMessage,
  openLightingPanel,
  pageSelectElement,
  removeComponent,
  renderComponentLists,
  syncSharedComponentReferenceOrder2,
});
const {
    exportSpliceErrorById,
    exportSpliceErrorByIdById,
    exportSpliceErrorSet,
  } = createExportSpliceTables({
    ibeBrightnessRealtimeElement,
    ibeButtonOffColorElement,
    ibeButtonOnColorElement,
    ibeButtonOpacityElement,
    ibeColorTemperatureRealtimeElement,
    ibeEffectFadeDurationElement,
    ibeEffectLeftElement,
    ibeEffectOpacityElement,
    ibeEffectRotationElement,
    ibeEffectScaleElement,
    ibeEffectTopElement,
    ibeFrameColorElement,
    ibeFrameOpacityElement,
    ibeFrameWidthElement,
    ibeGlowColorElement,
    ibeGlowOffStrengthElement,
    ibeGlowOnStrengthElement,
    ibeHeightElement,
    ibeIconOffColorElement,
    ibeIconOnColorElement,
    ibeIconSizeElement,
    ibeLeftElement,
    ibeRadiusElement,
    ibeRotationElement,
    ibeScaleElement,
    ibeTopElement,
    ibeWidthElement,
  });
for (const onIconButtonEffectInspectorFormInputState of ["focusin", "pointerdown"])
  iconButtonEffectInspectorElement.addEventListener(
    onIconButtonEffectInspectorFormInputState,
    (onIconButtonEffectInspectorFormInput: any) =>
      exportSpliceError(onIconButtonEffectInspectorFormInput.target),
  );
(iconButtonEffectInspectorElement.addEventListener("input", (effectInputEvent: any) => {
  const inspectedEffectComponent = removedComponent();
  if (!inspectedEffectComponent || inspectedEffectComponent.type !== "icon-button-effect") return;
  exportSpliceError(effectInputEvent.target);
  const propertyConfig = exportSpliceErrorById.get(effectInputEvent.target);
  if (propertyConfig) {
    let checked2 =
      propertyConfig.type === "boolean"
        ? effectInputEvent.target.checked
        : effectInputEvent.target.type === "color"
          ? effectInputEvent.target.value
          : Number(effectInputEvent.target.value);
    if (propertyConfig.type !== "boolean" && effectInputEvent.target.type !== "color") {
      if (!Number.isFinite(checked2)) return;
      checked2 =
        clampNumber2(checked2, propertyConfig.min!, propertyConfig.max!) /
        (propertyConfig.divisor || 1);
    }
    editorCtx.editorRenderer?.previewComponentProperties(inspectedEffectComponent.id, {
      [propertyConfig.property]: checked2,
    });
    return;
  }
  if (
    !exportSpliceErrorSet.has(effectInputEvent.target) ||
    !Number.isFinite(Number(effectInputEvent.target.value))
  )
    return;
  const transformInputValue = Number(effectInputEvent.target.value),
    effectCanvasWidth = Number(editorCtx.activeProject.document.canvas.width || 2778),
    effectCanvasHeight = Number(editorCtx.activeProject.document.canvas.height || 1940),
    effectPositionWidth = Number(inspectedEffectComponent.position?.width || 100),
    effectPositionHeight = Number(inspectedEffectComponent.position?.height || 100);
  effectInputEvent.target === ibeLeftElement
    ? editorCtx.editorRenderer?.previewComponentTransform(inspectedEffectComponent.id, {
        x:
          (effectCanvasWidth * clampNumber2(transformInputValue, 0, 100)) / 100 -
          effectPositionWidth / 2,
      })
    : effectInputEvent.target === ibeTopElement
      ? editorCtx.editorRenderer?.previewComponentTransform(inspectedEffectComponent.id, {
          y:
            (effectCanvasHeight * clampNumber2(transformInputValue, 0, 100)) / 100 -
            effectPositionHeight / 2,
        })
      : effectInputEvent.target === ibeWidthElement
        ? editorCtx.editorRenderer?.previewComponentTransform(inspectedEffectComponent.id, {
            width: (effectCanvasWidth * clampNumber2(transformInputValue, 0.1, 100)) / 100,
          })
        : effectInputEvent.target === ibeHeightElement
          ? editorCtx.editorRenderer?.previewComponentTransform(inspectedEffectComponent.id, {
              height: (effectCanvasHeight * clampNumber2(transformInputValue, 0.1, 100)) / 100,
            })
          : effectInputEvent.target === ibeScaleElement
            ? editorCtx.editorRenderer?.previewComponentTransform(inspectedEffectComponent.id, {
                scale: clampNumber2(transformInputValue, 1, 500) / 100,
              })
            : effectInputEvent.target === ibeRotationElement &&
              editorCtx.editorRenderer?.previewComponentTransform(inspectedEffectComponent.id, {
                rotation: clampNumber2(transformInputValue, -360, 360),
              });
}),
  iconButtonEffectInspectorElement.addEventListener("change", (effectChangeEvent: any) => {
    const changedEffectInput = effectChangeEvent.target,
      changedPropertyConfig = exportSpliceErrorById.get(changedEffectInput);
    if (!changedPropertyConfig && !exportSpliceErrorSet.has(changedEffectInput)) return;
    if (
      changedEffectInput.type === "number" &&
      !Number.isFinite(Number(changedEffectInput.value))
    ) {
      coverMotorButtonElement();
      return;
    }
    const effectComponentId = editorCtx.selectedComponentId;
    mutateDocument((effectChangeDraftDocument: any) => {
      const effectComponentInDraft = findComponent2(
        effectChangeDraftDocument,
        effectComponentId,
      )?.component;
      if (!effectComponentInDraft || effectComponentInDraft.type !== "icon-button-effect") return;
      if (
        ((effectComponentInDraft.properties = {
          ...(effectComponentInDraft.properties || {}),
        }),
        (effectComponentInDraft.position = {
          ...(effectComponentInDraft.position || {}),
        }),
        (effectComponentInDraft.style = {
          ...(effectComponentInDraft.style || {}),
        }),
        changedPropertyConfig)
      ) {
        effectComponentInDraft.properties[changedPropertyConfig.property] =
          changedPropertyConfig.type === "boolean"
            ? changedEffectInput.checked
            : changedEffectInput.type === "color"
              ? changedEffectInput.value
              : clampNumber2(
                  Number(changedEffectInput.value),
                  changedPropertyConfig.min!,
                  changedPropertyConfig.max!,
                ) / (changedPropertyConfig.divisor || 1);
        return;
      }
      const effectDocCanvasWidth = Number(effectChangeDraftDocument.canvas.width || 2778),
        effectDocCanvasHeight = Number(effectChangeDraftDocument.canvas.height || 1940),
        effectNumericValue = Number(changedEffectInput.value);
      changedEffectInput === ibeLeftElement
        ? (effectComponentInDraft.position.x =
            (effectDocCanvasWidth * clampNumber2(effectNumericValue, 0, 100)) / 100 -
            Number(effectComponentInDraft.position.width || 100) / 2)
        : changedEffectInput === ibeTopElement
          ? (effectComponentInDraft.position.y =
              (effectDocCanvasHeight * clampNumber2(effectNumericValue, 0, 100)) / 100 -
              Number(effectComponentInDraft.position.height || 100) / 2)
          : changedEffectInput === ibeWidthElement
            ? (effectComponentInDraft.position.width =
                (effectDocCanvasWidth * clampNumber2(effectNumericValue, 0.1, 100)) / 100)
            : changedEffectInput === ibeHeightElement
              ? (effectComponentInDraft.position.height =
                  (effectDocCanvasHeight * clampNumber2(effectNumericValue, 0.1, 100)) / 100)
              : changedEffectInput === ibeScaleElement
                ? (effectComponentInDraft.style.scale =
                    clampNumber2(effectNumericValue, 1, 500) / 100)
                : changedEffectInput === ibeRotationElement &&
                  setComponentsRotation(
                    effectChangeDraftDocument,
                    effectComponentId,
                    clampNumber2(effectNumericValue, -360, 360),
                  );
    });
  }),
  ibeEffectLayoutOptionsElement.addEventListener("click", (effectLayoutClickEvent: any) => {
    const effectLayoutOptionElementElement =
        effectLayoutClickEvent.target.closest("[data-ibe-layout]"),
      effectLayoutComponentId = editorCtx.selectedComponentId;
    !effectLayoutOptionElementElement ||
      !effectLayoutComponentId ||
      mutateDocument((effectLayoutDraftDocument: any) => {
        const effectLayoutComponent = findComponent2(
          effectLayoutDraftDocument,
          effectLayoutComponentId,
        )?.component;
        !effectLayoutComponent ||
          effectLayoutComponent.type !== "icon-button-effect" ||
          (effectLayoutComponent.properties = {
            ...(effectLayoutComponent.properties || {}),
            effectLayoutMode:
              effectLayoutOptionElementElement.dataset.ibeLayout === "fill" ? "fill" : "free",
          });
      });
  }));
(ibeEffectAlignImageElement.addEventListener("click", openImageAlignDialog),
  effectImageAlignCloseElement.addEventListener("click", () =>
    effectImageAlignDialogElement.close(),
  ),
  effectImageAlignCancelElement.addEventListener("click", () =>
    effectImageAlignDialogElement.close(),
  ),
  effectImageAlignDialogElement.addEventListener(
    "click",
    (onEffectImageAlignConfirmButtonClick: any) => {
      onEffectImageAlignConfirmButtonClick.target === effectImageAlignDialogElement &&
        effectImageAlignDialogElement.close();
    },
  ),
  effectImageAlignDialogElement.addEventListener("close", () => {
    editorCtx.imageAlignSourceComponentId = null;
  }),
  effectImageAlignConfirmElement.addEventListener("click", () => {
    const pendingAlignComponentId = effectImageAlignOptionsElement.querySelector(
        'input[name="effect-image-align-target"]:checked',
      )?.value,
      pp4 = editorCtx.imageAlignSourceComponentId;
    if (!pp4 || !pendingAlignComponentId) {
      ((effectImageAlignMessageElement.textContent = "请选择一张本页面图片。"),
        (effectImageAlignMessageElement.hidden = false));
      return;
    }
    (effectImageAlignDialogElement.close(),
      mutateDocument((alignDraftDocument: any) => {
        const alignComponent = findComponent2(alignDraftDocument, pp4)?.component,
          currentAlignPage =
            alignDraftDocument.pages?.find(
              (alignPageCandidate: any) => alignPageCandidate.path === pageSelectElement.value,
            ) || alignDraftDocument.pages?.[0],
          referenceImageComponent = findComponentInItems2(
            currentAlignPage?.components,
            pendingAlignComponentId,
          );
        if (
          !alignComponent ||
          alignComponent.type !== "icon-button-effect" ||
          !referenceImageComponent ||
          referenceImageComponent.type !== "image"
        )
          return;
        const alignCanvasWidth = Number(alignDraftDocument.canvas?.width || 2778),
          alignCanvasHeight = Number(alignDraftDocument.canvas?.height || 1940),
          referencePosition = referenceImageComponent.position || {},
          referenceWidth = Number(referencePosition.width || 100),
          referenceHeight = Number(referencePosition.height || 100),
          isReferenceIsFill = referenceImageComponent.properties?.layoutMode === "fill";
        alignComponent.properties = {
          ...(alignComponent.properties || {}),
          effectReferenceImageId: referenceImageComponent.id,
          effectLayoutMode: isReferenceIsFill ? "fill" : "free",
          ...(isReferenceIsFill
            ? {}
            : {
                effectLeft:
                  ((Number(referencePosition.x || 0) + referenceWidth / 2) / alignCanvasWidth) *
                  100,
                effectTop:
                  ((Number(referencePosition.y || 0) + referenceHeight / 2) / alignCanvasHeight) *
                  100,
                effectScale: clampNumber2(
                  Number(referenceImageComponent.style?.scale || 1),
                  0.01,
                  5,
                ),
                effectRotation: Number(referencePosition.rotation || 0),
              }),
        };
      }));
  }),
  ibePreviewStateElement.addEventListener("click", (previewStateClickEvent: any) => {
    const previewStateOptionElement = previewStateClickEvent.target.closest("[data-ibe-preview]"),
      requestedPreviewState = editorCtx.selectedComponentId;
    if (!previewStateOptionElement || !requestedPreviewState) return;
    const ibePreview = ["on", "off"].includes(previewStateOptionElement.dataset.ibePreview)
      ? previewStateOptionElement.dataset.ibePreview
      : "auto";
    (iconButtonEffectPreviewStateByComponentId.set(requestedPreviewState, ibePreview),
      editorCtx.editorRenderer?.setComponentPreviewState(requestedPreviewState, ibePreview),
      coverMotorButtonElement());
  }),
  ibeLayerOptionsElement.addEventListener("click", (layerOptionsClickEvent: any) => {
    const effectLayerOptionElementElement =
        layerOptionsClickEvent.target.closest("[data-ibe-layer]"),
      layerComponentId = editorCtx.selectedComponentId;
    if (!effectLayerOptionElementElement || !layerComponentId) return;
    const requestedLayer =
        effectLayerOptionElementElement.dataset.ibeLayer === "effect" ? "effect" : "button",
      layerPreviewStatus = requestedLayer === "effect" ? "on" : "off";
    (iconButtonEffectLayerByComponentId.set(layerComponentId, requestedLayer),
      iconButtonEffectPreviewStateByComponentId.set(layerComponentId, layerPreviewStatus),
      editorCtx.editorRenderer?.setComponentPreviewState(layerComponentId, layerPreviewStatus),
      editorCtx.editorRenderer?.setComponentSelectionLayer(layerComponentId, requestedLayer),
      closeOtherPickerMenus(),
      coverMotorButtonElement());
  }),
  ibeButtonVisibleElement.addEventListener("click", () => {
    const buttonVisibleComponentId = editorCtx.selectedComponentId;
    buttonVisibleComponentId &&
      mutateDocument((buttonVisibleDraftDocument: any) => {
        const buttonVisibleComponent = findComponent2(
          buttonVisibleDraftDocument,
          buttonVisibleComponentId,
        )?.component;
        !buttonVisibleComponent ||
          buttonVisibleComponent.type !== "icon-button-effect" ||
          (buttonVisibleComponent.properties = {
            ...(buttonVisibleComponent.properties || {}),
            buttonVisible: buttonVisibleComponent.properties?.buttonVisible === false,
          });
      });
  }),
  ibeEffectVisibleElement.addEventListener("click", () => {
    const effectVisibleComponentId = editorCtx.selectedComponentId;
    effectVisibleComponentId &&
      mutateDocument((effectVisibleDraftDocument: any) => {
        const effectVisibleComponent = findComponent2(
          effectVisibleDraftDocument,
          effectVisibleComponentId,
        )?.component;
        !effectVisibleComponent ||
          effectVisibleComponent.type !== "icon-button-effect" ||
          (effectVisibleComponent.properties = {
            ...(effectVisibleComponent.properties || {}),
            effectVisible: effectVisibleComponent.properties?.effectVisible === false,
          });
      });
  }));
const {
    effectVisibleComponentById,
    effectVisibleComponentByIdById,
    previewStateByInputElementById,
    previewStateByInputElementByKey,
    previewStateByInputElement,
    effectVisibleComponentByIdByKey,
    previewStateByInputElementByName,
    previewComponentIdForIconById,
    previewComponentIdForIconByIdById,
    previewModeForIconById,
    previewModeForIconByIdById,
    previewModeForIconByIdByKey,
  } = createEffectPreviewInputTables({
    airConditionerAirflowAngleElement,
    airConditionerAirflowBlurElement,
    airConditionerAirflowCoolColorElement,
    airConditionerAirflowCurveElement,
    airConditionerAirflowDensityElement,
    airConditionerAirflowFadeElement,
    airConditionerAirflowHeatColorElement,
    airConditionerAirflowHeightElement,
    airConditionerAirflowIrregularityElement,
    airConditionerAirflowLengthElement,
    airConditionerAirflowOffsetXElement,
    airConditionerAirflowOffsetYElement,
    airConditionerAirflowOtherColorElement,
    airConditionerAirflowRotationElement,
    airConditionerAirflowScaleElement,
    airConditionerAirflowSpeedElement,
    airConditionerAirflowSpreadElement,
    airConditionerAirflowStrengthElement,
    airConditionerAirflowThicknessElement,
    airConditionerAirflowWidthElement,
    airConditionerBadgeColorElement,
    airConditionerBadgeOpacityElement,
    airConditionerBadgeSizeElement,
    airConditionerHeightElement,
    airConditionerIconLeftElement,
    airConditionerIconOffColorElement,
    airConditionerIconOnColorElement,
    airConditionerIconTopElement,
    airConditionerLeftElement,
    airConditionerMainColorElement,
    airConditionerMainLeftElement,
    airConditionerMainSizeElement,
    airConditionerMainSpacingElement,
    airConditionerMainTopElement,
    airConditionerMainWeightElement,
    airConditionerRotationElement,
    airConditionerScaleElement,
    airConditionerSecondaryColorElement,
    airConditionerSecondaryLeftElement,
    airConditionerSecondarySizeElement,
    airConditionerSecondarySpacingElement,
    airConditionerSecondaryTopElement,
    airConditionerSecondaryWeightElement,
    airConditionerSymbolSizeElement,
    airConditionerTopElement,
    airConditionerWidthElement,
    cameraFrameAngleElement,
    cameraFrameColorElement,
    cameraFrameOpacityElement,
    cameraFrameWidthElement,
    cameraHeightElement,
    cameraLeftElement,
    cameraRadiusElement,
    cameraRotationElement,
    cameraScaleElement,
    cameraTopElement,
    cameraWidthElement,
    deviceButtonBadgeColorElement,
    deviceButtonBadgeOpacityElement,
    deviceButtonBadgeSizeElement,
    deviceButtonIconOnColorElement,
    deviceButtonSymbolSizeElement,
    iconButtonCutCornerElement,
    iconButtonFrameAngleElement,
    iconButtonFrameOffOpacityElement,
    iconButtonFrameOnOpacityElement,
    iconButtonFrameWidthElement,
    iconButtonGlowAngleElement,
    iconButtonGlowColorElement,
    iconButtonGlowSizeElement,
    iconButtonGlowStrengthElement,
    iconButtonHeightElement,
    iconButtonIconColorElement,
    iconButtonIconLeftElement,
    iconButtonIconOffOpacityElement,
    iconButtonIconOnOpacityElement,
    iconButtonIconSizeElement,
    iconButtonIconTopElement,
    iconButtonLeftElement,
    iconButtonMainColorElement,
    iconButtonMainLeftElement,
    iconButtonMainOffOpacityElement,
    iconButtonMainOnOpacityElement,
    iconButtonMainSizeElement,
    iconButtonMainSpacingElement,
    iconButtonMainTopElement,
    iconButtonMainWeightElement,
    iconButtonOnFillColorElement,
    iconButtonOnFillFadeDurationElement,
    iconButtonOnFillStrengthElement,
    iconButtonRotationElement,
    iconButtonScaleElement,
    iconButtonSecondaryColorElement,
    iconButtonSecondaryLeftElement,
    iconButtonSecondaryOffOpacityElement,
    iconButtonSecondaryOnOpacityElement,
    iconButtonSecondarySizeElement,
    iconButtonSecondarySpacingElement,
    iconButtonSecondaryTopElement,
    iconButtonSecondaryWeightElement,
    iconButtonSoftLightAngleElement,
    iconButtonSoftLightColorElement,
    iconButtonSoftLightSizeElement,
    iconButtonSoftLightStrengthElement,
    iconButtonTopElement,
    iconButtonWidthElement,
    lightStatisticsCountActiveColorElement,
    lightStatisticsCountColorElement,
    lightStatisticsCountGapElement,
    lightStatisticsCountSizeElement,
    lightStatisticsCountSpacingElement,
    lightStatisticsCountWeightElement,
    lightStatisticsHeightElement,
    lightStatisticsIconActiveColorElement,
    lightStatisticsIconColorElement,
    lightStatisticsIconGapElement,
    lightStatisticsIconSizeElement,
    lightStatisticsLeftElement,
    lightStatisticsRotationElement,
    lightStatisticsScaleElement,
    lightStatisticsTitleColorElement,
    lightStatisticsTitleSizeElement,
    lightStatisticsTitleSpacingElement,
    lightStatisticsTitleWeightElement,
    lightStatisticsTopElement,
    lightStatisticsWidthElement,
    presenceHaloOpacityElement,
    presenceHaloRotationElement,
    presenceHaloScaleXElement,
    presenceHaloScaleYElement,
    presenceOrbitDurationElement,
    presencePersonOpacityElement,
    presencePersonRotationElement,
    presencePersonScaleElement,
    titleButtonFrameColorElement,
    titleButtonFrameOffsetXElement,
    titleButtonFrameOffsetYElement,
    titleButtonFrameSizeElement,
    titleButtonFrameSpacingElement,
    titleButtonFrameWidthElement,
    titleButtonHeightElement,
    titleButtonIconColorElement,
    titleButtonIconLeftElement,
    titleButtonIconSizeElement,
    titleButtonIconTopElement,
    titleButtonLeftElement,
    titleButtonMainColorElement,
    titleButtonMainLeftElement,
    titleButtonMainSizeElement,
    titleButtonMainSpacingElement,
    titleButtonMainTopElement,
    titleButtonMainWeightElement,
    titleButtonMarkerColorElement,
    titleButtonMarkerLeftElement,
    titleButtonMarkerSizeElement,
    titleButtonMarkerTopElement,
    titleButtonRotationElement,
    titleButtonScaleElement,
    titleButtonSecondaryColorElement,
    titleButtonSecondaryLeftElement,
    titleButtonSecondaryLineGapElement,
    titleButtonSecondarySizeElement,
    titleButtonSecondarySpacingElement,
    titleButtonSecondaryTopElement,
    titleButtonSecondaryWeightElement,
    titleButtonTopElement,
    titleButtonWidthElement,
    vacuumMapLeftElement,
    vacuumMapOpacityElement,
    vacuumMapRotationElement,
    vacuumMapScaleElement,
    vacuumMapTopElement,
  });
(previewModeForIcon(
  titleButtonInspectorElement,
  "title-button",
  effectVisibleComponentById,
  effectVisibleComponentByIdById,
),
  previewModeForIcon(
    lightStatisticsInspectorElement,
    "light-statistics",
    previewStateByInputElementById,
    previewStateByInputElementByKey,
  ),
  previewModeForIcon(
    iconButtonInspectorElement,
    ["icon-button", "device-button", "presence-sensor"],
    previewStateByInputElement,
    effectVisibleComponentByIdByKey,
  ),
  previewModeForIcon(
    airConditionerInspectorElement,
    "air-conditioner",
    previewStateByInputElementByName,
    previewComponentIdForIconById,
  ),
  previewModeForIcon(
    vacuumMapInspectorElement,
    "vacuum-map",
    previewModeForIconById,
    previewModeForIconByIdById,
  ),
  previewModeForIcon(
    cameraInspectorElement,
    "camera",
    previewComponentIdForIconByIdById,
    previewModeForIconByIdByKey,
  ),
  deviceButtonStatePrecisionElement.addEventListener("change", () => {
    const statePrecisionComponentIdState = editorCtx.selectedComponentId;
    statePrecisionComponentIdState &&
      mutateDocument((onDoorWindowPerspectiveResetButtonClick: any) => {
        const statePrecisionComponentValue = findComponent2(
          onDoorWindowPerspectiveResetButtonClick,
          statePrecisionComponentIdState,
        )?.component;
        if (!statePrecisionComponentValue || statePrecisionComponentValue.type !== "device-button")
          return;
        const statePrecisionValueConfig = ["0", "1", "2", "3", "4"].includes(
          deviceButtonStatePrecisionElement.value,
        )
          ? Number(deviceButtonStatePrecisionElement.value)
          : "auto";
        statePrecisionComponentValue.properties = {
          ...(statePrecisionComponentValue.properties || {}),
          statePrecision: statePrecisionValueConfig,
        };
      });
  }),
  presenceSensorKindElement.addEventListener("change", () => {
    const perspectiveResetComponentId = editorCtx.selectedComponentId;
    perspectiveResetComponentId &&
      mutateDocument((perspectiveResetDraftDocument: any) => {
        const sensorKindComponentState = findComponent2(
          perspectiveResetDraftDocument,
          perspectiveResetComponentId,
        )?.component;
        if (!sensorKindComponentState || sensorKindComponentState.type !== "presence-sensor")
          return;
        const requestedSensorKindState = [
          "presence",
          "door-window",
          "water-leak",
          "smoke",
          "natural-gas",
        ].includes(presenceSensorKindElement.value)
          ? presenceSensorKindElement.value
          : "presence";
        ((sensorKindComponentState.properties = {
          ...(sensorKindComponentState.properties || {}),
          sensorKind: requestedSensorKindState,
        }),
          requestedSensorKindState !== "door-window" &&
            (doorWindowPerspectiveEditIdsSet.delete(perspectiveResetComponentId),
            editorCtx.editorRenderer?.setComponentSelectionLayer(perspectiveResetComponentId, "button")));
      });
  }),
  doorWindowPerspectiveEditElement.addEventListener("click", () => {
    const createdInstanceEntry = removedComponent();
    !createdInstanceEntry ||
      createdInstanceEntry.type !== "presence-sensor" ||
      createdInstanceEntry.properties?.sensorKind !== "door-window" ||
      (doorWindowPerspectiveEditIdsSet.add(createdInstanceEntry.id),
      doorWindowPerspectiveEditElement.classList.add("active"),
      doorWindowPerspectiveEditElement.setAttribute("aria-pressed", "true"),
      (doorWindowPerspectiveSaveElement.disabled = false),
      editorCtx.editorRenderer?.setComponentSelectionLayer(createdInstanceEntry.id, "perspective"));
  }),
  doorWindowPerspectiveSaveElement.addEventListener("click", () => {
    const createdInstanceRecord = removedComponent();
    !createdInstanceRecord ||
      createdInstanceRecord.type !== "presence-sensor" ||
      createdInstanceRecord.properties?.sensorKind !== "door-window" ||
      (doorWindowPerspectiveEditIdsSet.delete(createdInstanceRecord.id),
      doorWindowPerspectiveEditElement.classList.remove("active"),
      doorWindowPerspectiveEditElement.setAttribute("aria-pressed", "false"),
      (doorWindowPerspectiveSaveElement.disabled = true),
      editorCtx.editorRenderer?.setComponentSelectionLayer(createdInstanceRecord.id, "button"));
  }),
  doorWindowPerspectiveResetElement.addEventListener("click", () => {
    const perspectiveResetComponent = editorCtx.selectedComponentId;
    perspectiveResetComponent &&
      mutateDocument((onCameraFitOptionsClick: any) => {
        const perspectiveResetComponentState = findComponent2(
          onCameraFitOptionsClick,
          perspectiveResetComponent,
        )?.component;
        !perspectiveResetComponentState ||
          perspectiveResetComponentState.type !== "presence-sensor" ||
          perspectiveResetComponentState.properties?.sensorKind !== "door-window" ||
          (perspectiveResetComponentState.properties = {
            ...(perspectiveResetComponentState.properties || {}),
            perspectiveCorners: [...DEFAULT_PERSPECTIVE_CORNERS],
          });
      });
  }));
(airConditionerPreviewStateElement.addEventListener("click", (acPreviewStateClickEvent: any) => {
  const acPreviewStateOptionElement = acPreviewStateClickEvent.target.closest(
    "[data-air-conditioner-preview]",
  );
  !acPreviewStateOptionElement ||
    !editorCtx.selectedComponentId ||
    (applyAirConditionerPreviewState(
      editorCtx.selectedComponentId,
      acPreviewStateOptionElement.dataset.airConditionerPreview,
    ),
    coverMotorButtonElement());
}),
  airConditionerDeviceTypeElement.addEventListener("click", (acDeviceTypeClickEvent: any) => {
    const acDeviceTypeOptionElement = acDeviceTypeClickEvent.target.closest(
        "[data-air-conditioner-device-type]",
      ),
      requestedAcDeviceType = editorCtx.selectedComponentId;
    if (!acDeviceTypeOptionElement || !requestedAcDeviceType) return;
    const airConditionerDeviceType = ["air-conditioner", "bath-heater"].includes(
      acDeviceTypeOptionElement.dataset.airConditionerDeviceType,
    )
      ? acDeviceTypeOptionElement.dataset.airConditionerDeviceType
      : "auto";
    mutateDocument((acDeviceTypeDraftDocument: any) => {
      const acDeviceTypeComponent = findComponent2(
        acDeviceTypeDraftDocument,
        requestedAcDeviceType,
      )?.component;
      !acDeviceTypeComponent ||
        acDeviceTypeComponent.type !== "air-conditioner" ||
        (acDeviceTypeComponent.properties = {
          ...(acDeviceTypeComponent.properties || {}),
          deviceType: airConditionerDeviceType,
        });
    });
  }),
  airConditionerLayerOptionsElement.addEventListener("click", (acLayerClickEvent: any) => {
    const acLayerOptionElement = acLayerClickEvent.target.closest("[data-air-conditioner-layer]");
    if (!acLayerOptionElement || !editorCtx.selectedComponentId) return;
    const requestedAcLayer =
      acLayerOptionElement.dataset.airConditionerLayer === "airflow" ? "airflow" : "button";
    (airConditionerLayerByComponentId.set(editorCtx.selectedComponentId, requestedAcLayer),
      applyAirConditionerPreviewState(
        editorCtx.selectedComponentId,
        requestedAcLayer === "airflow" ? "on" : "off",
      ),
      editorCtx.editorRenderer?.setComponentSelectionLayer(editorCtx.selectedComponentId, requestedAcLayer),
      closeOtherPickerMenus(),
      coverMotorButtonElement());
  }),
  airConditionerAirflowVisibleElement.addEventListener("click", () => {
    const airflowVisibleComponentId = editorCtx.selectedComponentId;
    airflowVisibleComponentId &&
      (applyAirConditionerPreviewState(airflowVisibleComponentId, "on"),
      mutateDocument((airflowVisibleDraftDocument: any) => {
        const airflowVisibleComponent = findComponent2(
          airflowVisibleDraftDocument,
          airflowVisibleComponentId,
        )?.component;
        !airflowVisibleComponent ||
          airflowVisibleComponent.type !== "air-conditioner" ||
          (airflowVisibleComponent.properties = {
            ...(airflowVisibleComponent.properties || {}),
            airflowVisible: airflowVisibleComponent.properties?.airflowVisible === false,
          });
      }));
  }));
for (const [visibilityPropertyKey, onVisibilityToggleClick] of [
  [airConditionerIconVisibleElement, "iconVisible"],
  [airConditionerMainVisibleElement, "mainTextVisible"],
  [airConditionerSecondaryVisibleElement, "secondaryTextVisible"],
])
  visibilityPropertyKey.addEventListener("click", () => {
    const visibilityToggleComponentId = editorCtx.selectedComponentId;
    visibilityToggleComponentId &&
      mutateDocument((acVisibilityDraftDocument: any) => {
        const acVisibilityComponent = findComponent2(
          acVisibilityDraftDocument,
          visibilityToggleComponentId,
        )?.component;
        !acVisibilityComponent ||
          acVisibilityComponent.type !== "air-conditioner" ||
          (acVisibilityComponent.properties = {
            ...(acVisibilityComponent.properties || {}),
            [onVisibilityToggleClick]:
              acVisibilityComponent.properties?.[onVisibilityToggleClick] === false,
          });
      });
  });
airConditionerAirflowMotionElement.addEventListener("click", (airflowMotionClickEvent: any) => {
  const airflowMotionOptionElement =
      airflowMotionClickEvent.target.closest("[data-airflow-motion]"),
    airflowMotionComponentId = editorCtx.selectedComponentId;
  !airflowMotionOptionElement ||
    !airflowMotionComponentId ||
    (applyAirConditionerPreviewState(airflowMotionComponentId, "on"),
    mutateDocument((airflowMotionDraftDocument: any) => {
      const airflowMotionComponent = findComponent2(
        airflowMotionDraftDocument,
        airflowMotionComponentId,
      )?.component;
      !airflowMotionComponent ||
        airflowMotionComponent.type !== "air-conditioner" ||
        (airflowMotionComponent.properties = {
          ...(airflowMotionComponent.properties || {}),
          airflowMotion:
            airflowMotionOptionElement.dataset.airflowMotion === "static" ? "static" : "dynamic",
        });
    }));
});
for (const airflowSectionEventName of ["focusin", "pointerdown", "input"])
  airConditionerAirflowSectionElement.addEventListener(
    airflowSectionEventName,
    (onAirConditionerAirflowSection: any) => {
      previewStateByInputElementByName.has(onAirConditionerAirflowSection.target) &&
        removedComponent()?.type === "air-conditioner" &&
        applyAirConditionerPreviewState(editorCtx.selectedComponentId, "on");
    },
  );
const airflowSectionEventById = new Map([
  [iconButtonIconOffOpacityElement, "off"],
  [iconButtonMainOffOpacityElement, "off"],
  [iconButtonSecondaryOffOpacityElement, "off"],
  [iconButtonFrameOffOpacityElement, "off"],
  [iconButtonOnFillVisibleElement, "on"],
  [iconButtonIconOnOpacityElement, "on"],
  [iconButtonMainOnOpacityElement, "on"],
  [iconButtonSecondaryOnOpacityElement, "on"],
  [iconButtonOnFillColorElement, "on"],
  [iconButtonOnFillStrengthElement, "on"],
  [iconButtonFrameOnOpacityElement, "on"],
  [deviceButtonIconOnColorElement, "on"],
]);
for (const previewSyncEventState of ["focusin", "pointerdown", "input"])
  iconButtonInspectorElement.addEventListener(
    previewSyncEventState,
    (onCoverSettingsDirectionClick: any) =>
      onCoverSettingsKindClick(onCoverSettingsDirectionClick.target),
  );
(coverSettingsKindElement.addEventListener("click", (coverDirectionClickEvent: any) => {
  const coverDirectionOptionElement = coverDirectionClickEvent.target.closest("[data-cover-kind]"),
    requestedCoverDirection = editorCtx.selectedComponentId;
  if (!coverDirectionOptionElement || !requestedCoverDirection) return;
  const coverKind2 = ["standard", "dream", "airer"].includes(
    coverDirectionOptionElement.dataset.coverKind,
  )
    ? coverDirectionOptionElement.dataset.coverKind
    : "auto";
  mutateDocument((coverDirectionDraftDocument: any) => {
    const coverDirectionComponent = findComponent2(
      coverDirectionDraftDocument,
      requestedCoverDirection,
    )?.component;
    coverDirectionComponent &&
      String(coverDirectionComponent.bindings?.entity?.entityId || "").startsWith("cover.") &&
      (coverDirectionComponent.properties = {
        ...(coverDirectionComponent.properties || {}),
        coverKind: coverKind2,
      });
  });
}),
  coverSettingsDirectionElement.addEventListener("click", (motorDirectionClickEvent: any) => {
    const motorDirectionOptionElement =
        motorDirectionClickEvent.target.closest("[data-cover-direction]"),
      motorDirectionComponentId = editorCtx.selectedComponentId;
    if (!motorDirectionOptionElement || !motorDirectionComponentId) return;
    const coverDirection2 = ["left", "right"].includes(
      motorDirectionOptionElement.dataset.coverDirection,
    )
      ? motorDirectionOptionElement.dataset.coverDirection
      : "split";
    mutateDocument((coverDirectionDraftDocumentState: any) => {
      const requestedMotorDirection = findComponent2(
        coverDirectionDraftDocumentState,
        motorDirectionComponentId,
      )?.component;
      requestedMotorDirection &&
        String(requestedMotorDirection.bindings?.entity?.entityId || "").startsWith("cover.") &&
        (requestedMotorDirection.properties = {
          ...(requestedMotorDirection.properties || {}),
          coverDirection: coverDirection2,
        });
    });
  }),
  coverSettingsMotorDirectionElement.addEventListener("click", (motorDirectionDraftDocument: any) => {
    const motorDirectionOptionElementElement = motorDirectionDraftDocument.target.closest(
        "[data-cover-motor-direction]",
      ),
      motorDirectionComponent = editorCtx.selectedComponentId;
    if (!motorDirectionOptionElementElement || !motorDirectionComponent) return;
    const coverMotorDirection2 = ["normal", "reversed"].includes(
      motorDirectionOptionElementElement.dataset.coverMotorDirection,
    )
      ? motorDirectionOptionElementElement.dataset.coverMotorDirection
      : "auto";
    mutateDocument((onIconButtonInspectorFormFocusout: any) => {
      const motorDirectionComponentState = findComponent2(
        onIconButtonInspectorFormFocusout,
        motorDirectionComponent,
      )?.component;
      motorDirectionComponentState &&
        String(motorDirectionComponentState.bindings?.entity?.entityId || "").startsWith(
          "cover.",
        ) &&
        (motorDirectionComponentState.properties = {
          ...(motorDirectionComponentState.properties || {}),
          coverMotorDirection: coverMotorDirection2,
        });
    });
  }),
  iconButtonInspectorElement.addEventListener("focusout", (previewFocusOutEvent: any) => {
    const focusOutComponent = removedComponent();
    (!airflowSectionEventById.has(previewFocusOutEvent.target) &&
      !(
        focusOutComponent?.type === "device-button" &&
        previewFocusOutEvent.target === iconButtonIconColorElement
      )) ||
      (previewFocusOutEvent.relatedTarget instanceof Node &&
        iconButtonPreviewStateElement.contains(previewFocusOutEvent.relatedTarget)) ||
      window.requestAnimationFrame(() => {
        if (
          editorCtx.activeColorInputElement === previewFocusOutEvent.target &&
          !globalColorPickerElement.hidden
        )
          return;
        airflowSectionEventById.get(document.activeElement) ||
        (removedComponent()?.type === "device-button" &&
        document.activeElement === iconButtonIconColorElement
          ? "off"
          : null)
          ? onCoverSettingsKindClick(document.activeElement)
          : coverKindDraftDocument(previewFocusOutEvent.target);
      });
  }));
for (const [areComponentValuesEqual, firstComponentValue] of [
  [titleButtonMainVisibleElement, "mainTextVisible"],
  [titleButtonSecondaryVisibleElement, "secondaryTextVisible"],
  [titleButtonIconVisibleElement, "iconVisible"],
  [titleButtonFrameVisibleElement, "frameVisible"],
  [titleButtonMarkerVisibleElement, "markerVisible"],
])
  areComponentValuesEqual.addEventListener("click", () => {
    const secondComponentValueState = editorCtx.selectedComponentId;
    mutateDocument((secondComponentValue: any) => {
      const rememberNavigationStyleChangeState = findComponent2(
        secondComponentValue,
        secondComponentValueState,
      )?.component;
      !rememberNavigationStyleChangeState ||
        rememberNavigationStyleChangeState.type !== "title-button" ||
        (rememberNavigationStyleChangeState.properties = {
          ...(rememberNavigationStyleChangeState.properties || {}),
          [firstComponentValue]:
            rememberNavigationStyleChangeState.properties?.[firstComponentValue] === false,
        });
    });
  });
for (const [rememberNavigationStyleChange, navigationComponentId] of [
  [lightStatisticsIconVisibleElement, "iconVisible"],
  [lightStatisticsTitleVisibleElement, "titleVisible"],
  [lightStatisticsCountVisibleElement, "countVisible"],
])
  rememberNavigationStyleChange.addEventListener("click", () => {
    const navigationPropertyKeyState = editorCtx.selectedComponentId;
    navigationPropertyKeyState &&
      mutateDocument((navigationPropertyKey: any) => {
        const previousPropertyValueState = findComponent2(
          navigationPropertyKey,
          navigationPropertyKeyState,
        )?.component;
        !previousPropertyValueState ||
          previousPropertyValueState.type !== "light-statistics" ||
          (previousPropertyValueState.properties = {
            ...(previousPropertyValueState.properties || {}),
            [navigationComponentId]:
              previousPropertyValueState.properties?.[navigationComponentId] === false,
          });
      });
  });
for (const [previousPropertyValue, updatedPropertyValue] of [
  [deviceButtonIconVisibleElement, "iconVisible"],
  [deviceButtonMainVisibleElement, "mainTextVisible"],
  [deviceButtonSecondaryVisibleElement, "secondaryTextVisible"],
  [iconButtonOnFillVisibleElement, "onFillVisible"],
  [iconButtonFrameVisibleElement, "frameVisible"],
  [iconButtonSoftLightVisibleElement, "softLightVisible"],
  [iconButtonGlowVisibleElement, "glowVisible"],
  [presenceHaloVisibleElement, "haloVisible"],
  [presencePersonVisibleElement, "personVisible"],
])
  previousPropertyValue.addEventListener("click", () => {
    const navigationSavedPropertyValues = editorCtx.selectedComponentId;
    mutateDocument((pruneNavigationSavedSettings: any) => {
      const navigationSettingsComponentState = findComponent2(
        pruneNavigationSavedSettings,
        navigationSavedPropertyValues,
      )?.component;
      !navigationSettingsComponentState ||
        !["icon-button", "device-button", "presence-sensor"].includes(
          navigationSettingsComponentState.type,
        ) ||
        (updatedPropertyValue.endsWith("Visible") &&
          ["iconVisible", "mainTextVisible", "secondaryTextVisible"].includes(
            updatedPropertyValue,
          ) &&
          navigationSettingsComponentState.type !== "device-button") ||
        (["haloVisible", "personVisible"].includes(updatedPropertyValue) &&
          navigationSettingsComponentState.type !== "presence-sensor") ||
        (navigationSettingsComponentState.properties = {
          ...(navigationSettingsComponentState.properties || {}),
          [updatedPropertyValue]:
            navigationSettingsComponentState.properties?.[updatedPropertyValue] === false,
        });
    });
  });
iconButtonPreviewStateElement.addEventListener("click", (navigationSettingsComponent: any) => {
  const navigationSavedSettingsElement = navigationSettingsComponent.target.closest(
      "[data-icon-button-preview]",
    ),
    navigationSavedSettings = editorCtx.selectedComponentId;
  if (!navigationSavedSettingsElement || !navigationSavedSettings) return;
  const iconButtonPreview = ["on", "off"].includes(
    navigationSavedSettingsElement.dataset.iconButtonPreview,
  )
    ? navigationSavedSettingsElement.dataset.iconButtonPreview
    : "auto";
  previewSyncEventName(navigationSavedSettings, iconButtonPreview);
});
const navigationSavedSettingById = new Map([[timeColorElement, "color"]]),
  navigationSavedPropertyKeyById = new Map([
    [
      timeFontSizeElement,
      {
        property: "fontSize",
        minimum: 12,
        maximum: 500,
        divisor: 1,
        resizes: true,
      },
    ],
    [
      timeFontWeightElement,
      {
        property: "fontWeight",
        minimum: 0,
        maximum: 1,
        divisor: 1,
        resizes: true,
      },
    ],
    [
      timeLetterSpacingElement,
      {
        property: "letterSpacing",
        minimum: -20,
        maximum: 100,
        divisor: 1,
        resizes: true,
      },
    ],
    [
      timeOpacityElement,
      {
        property: "opacity",
        minimum: 0,
        maximum: 100,
        divisor: 100,
        resizes: false,
      },
    ],
  ]),
  navigationSavedPropertyKeySet = new Set([
    timeLeftElement,
    timeTopElement,
    timeScaleElement,
    timeRotationElement,
  ]);
const bindTransformInspectorInput = (
  inspectorElement: HTMLElement,
  componentType: string,
  colorPropertyByElement: typeof navigationSavedSettingById,
  propertyConfigByElement: typeof navigationSavedPropertyKeyById,
  transformInputSet: typeof navigationSavedPropertyKeySet,
  transformTargets: Record<"left" | "top" | "scale" | "rotation", typeof timeLeftElement>,
  resizePreview: typeof navigationSavedPropertyKey,
) =>
  inspectorElement.addEventListener("input", (inputEvent) => {
    const inspectorComponent = removedComponent();
    if (!inspectorComponent || inspectorComponent.type !== componentType) return;
    const inputElement = inputEvent.target as HTMLInputElement,
      colorPropertyKey = colorPropertyByElement.get(inputElement);
    if (colorPropertyKey) {
      editorCtx.editorRenderer?.previewComponentProperties(inspectorComponent.id, {
        [colorPropertyKey]: inputElement.value,
      });
      return;
    }
    const propertyConfig = propertyConfigByElement.get(inputElement);
    if (propertyConfig) {
      if (String(inputElement.value).trim() === "" || !Number.isFinite(Number(inputElement.value)))
        return;
      const propertyValue =
          clampNumber2(Number(inputElement.value), propertyConfig.minimum, propertyConfig.maximum) /
          propertyConfig.divisor,
        nextProperties = {
          ...(inspectorComponent.properties || {}),
          [propertyConfig.property]: propertyValue,
        };
      (editorCtx.editorRenderer?.previewComponentProperties(inspectorComponent.id, {
        [propertyConfig.property]: propertyValue,
      }),
        propertyConfig.resizes && resizePreview(inspectorComponent, nextProperties));
      return;
    }
    if (
      !transformInputSet.has(inputElement) ||
      String(inputElement.value).trim() === "" ||
      !Number.isFinite(Number(inputElement.value))
    )
      return;
    const numericValue = Number(inputElement.value),
      canvasWidth = Number(editorCtx.activeProject.document.canvas.width || 2778),
      canvasHeight = Number(editorCtx.activeProject.document.canvas.height || 1940),
      positionWidth = Number(inspectorComponent.position?.width || 100),
      positionHeight = Number(inspectorComponent.position?.height || 100);
    if (inputElement === transformTargets.left) {
      const clampedLeft = clampNumber2(numericValue, 0, 100);
      editorCtx.editorRenderer?.previewComponentTransform(inspectorComponent.id, {
        x: (canvasWidth * clampedLeft) / 100 - positionWidth / 2,
      });
    } else {
      if (inputElement === transformTargets.top) {
        const clampedTop = clampNumber2(numericValue, 0, 100);
        editorCtx.editorRenderer?.previewComponentTransform(inspectorComponent.id, {
          y: (canvasHeight * clampedTop) / 100 - positionHeight / 2,
        });
      } else {
        if (inputElement === transformTargets.scale) {
          const clampedScale = clampNumber2(numericValue, 1, 500);
          editorCtx.editorRenderer?.previewComponentTransform(inspectorComponent.id, {
            scale: clampedScale / 100,
          });
        } else {
          if (inputElement === transformTargets.rotation) {
            const clampedRotation = clampNumber2(numericValue, -360, 360);
            editorCtx.editorRenderer?.previewComponentTransform(inspectorComponent.id, {
              rotation: clampedRotation,
            });
          }
        }
      }
    }
  });



(bindTransformInspectorInput(
  timeInspectorElement,
  "time",
  navigationSavedSettingById,
  navigationSavedPropertyKeyById,
  navigationSavedPropertyKeySet,
  {
    left: timeLeftElement,
    top: timeTopElement,
    scale: timeScaleElement,
    rotation: timeRotationElement,
  },
  navigationSavedPropertyKey,
),
  timeInspectorElement.addEventListener("change", (timeChangeEvent: any) => {
    const changedTimeInput = timeChangeEvent.target,
      timeChangeComponentId = editorCtx.selectedComponentId;
    if (!timeChangeComponentId) return;
    const timeColorKey = navigationSavedSettingById.get(changedTimeInput),
      timeChangeConfig = navigationSavedPropertyKeyById.get(changedTimeInput);
    if (!(
      !timeColorKey &&
      !timeChangeConfig &&
      !navigationSavedPropertyKeySet.has(changedTimeInput)
    )) {
      if (
        (timeChangeConfig || navigationSavedPropertyKeySet.has(changedTimeInput)) &&
        (String(changedTimeInput.value).trim() === "" ||
          !Number.isFinite(Number(changedTimeInput.value)))
      ) {
        coverMotorButtonElement();
        return;
      }
      mutateDocument((timeChangeDraftDocument: any) => {
        const timeChangeComponent = findComponent2(
          timeChangeDraftDocument,
          timeChangeComponentId,
        )?.component;
        if (!timeChangeComponent || timeChangeComponent.type !== "time") return;
        ((timeChangeComponent.properties = {
          ...(timeChangeComponent.properties || {}),
        }),
          (timeChangeComponent.position = {
            ...(timeChangeComponent.position || {}),
          }),
          (timeChangeComponent.style = {
            ...(timeChangeComponent.style || {}),
          }));
        const timeDocCanvasWidth = Number(timeChangeDraftDocument.canvas.width || 2778),
          timeDocCanvasHeight = Number(timeChangeDraftDocument.canvas.height || 1940),
          timeChangeValue = Number(changedTimeInput.value);
        timeColorKey
          ? (timeChangeComponent.properties[timeColorKey] = changedTimeInput.value)
          : timeChangeConfig
            ? ((timeChangeComponent.properties[timeChangeConfig.property] =
                clampNumber2(timeChangeValue, timeChangeConfig.minimum, timeChangeConfig.maximum) /
                timeChangeConfig.divisor),
              timeChangeConfig.resizes &&
                timeFitComponent(timeChangeComponent, timeChangeComponent.properties))
            : changedTimeInput === timeLeftElement
              ? (timeChangeComponent.position.x =
                  (timeDocCanvasWidth * clampNumber2(timeChangeValue, 0, 100)) / 100 -
                  Number(timeChangeComponent.position.width || 100) / 2)
              : changedTimeInput === timeTopElement
                ? (timeChangeComponent.position.y =
                    (timeDocCanvasHeight * clampNumber2(timeChangeValue, 0, 100)) / 100 -
                    Number(timeChangeComponent.position.height || 100) / 2)
                : changedTimeInput === timeScaleElement
                  ? (timeChangeComponent.style.scale = clampNumber2(timeChangeValue, 1, 500) / 100)
                  : changedTimeInput === timeRotationElement &&
                    setComponentsRotation(
                      timeChangeDraftDocument,
                      timeChangeComponentId,
                      clampNumber2(timeChangeValue, -360, 360),
                    );
      });
    }
  }));
for (const onTimeToggleClick of [timeHourFormatElement, timeSecondsElement])
  onTimeToggleClick.addEventListener("click", (timeToggleClickEvent: any) => {
    const timeToggleComponentId = editorCtx.selectedComponentId,
      hourFormatOptionElement = timeToggleClickEvent.target.closest("[data-time-hour-format]"),
      secondsOptionElement = timeToggleClickEvent.target.closest("[data-time-seconds]");
    !timeToggleComponentId ||
      (!hourFormatOptionElement && !secondsOptionElement) ||
      mutateDocument((timeToggleDraftDocument: any) => {
        const timeToggleComponent = findComponent2(
          timeToggleDraftDocument,
          timeToggleComponentId,
        )?.component;
        !timeToggleComponent ||
          timeToggleComponent.type !== "time" ||
          ((timeToggleComponent.properties = {
            ...(timeToggleComponent.properties || {}),
          }),
          hourFormatOptionElement &&
            (timeToggleComponent.properties.hour12 =
              hourFormatOptionElement.dataset.timeHourFormat === "12"),
          secondsOptionElement &&
            (timeToggleComponent.properties.showSeconds =
              secondsOptionElement.dataset.timeSeconds === "on"),
          timeFitComponent(timeToggleComponent, timeToggleComponent.properties));
      });
  });
const {
    dateColorPropertyByElement,
    datePropertyConfigsByElement,
    dateTransformInputSet,
    weatherColorPropertiesByElement,
    weatherPropertyConfigsByElement,
    weatherTransformInputSet,
    lineChartColorPropertiesByElement,
    lineChartPropertyConfigsByElement,
    lineChartTransformInputSet,
  } = createDateTimeWeatherLineChartInputTables({
    dateLeftElement,
    dateLineGapElement,
    dateLunarColorElement,
    dateLunarSizeElement,
    dateLunarSpacingElement,
    dateLunarWeightElement,
    dateOpacityElement,
    datePrimaryColorElement,
    datePrimarySizeElement,
    datePrimarySpacingElement,
    datePrimaryWeightElement,
    dateRotationElement,
    dateScaleElement,
    dateTopElement,
    lineChartCurveRadiusInputElement,
    lineChartHeightInputElement,
    lineChartHoursInputElement,
    lineChartLeftInputElement,
    lineChartRotationInputElement,
    lineChartScaleInputElement,
    lineChartStatePrecisionSelectElement,
    lineChartThresholdModeSelectElement,
    lineChartTopInputElement,
    lineChartUpdateIntervalInputElement,
    lineChartValueColorInputElement,
    lineChartValueOffsetXInputElement,
    lineChartValueOffsetYInputElement,
    lineChartValueScaleInputElement,
    lineChartWidthInputElement,
    weatherIconGapElement,
    weatherIconSizeElement,
    weatherLeftElement,
    weatherLineGapElement,
    weatherOpacityElement,
    weatherRotationElement,
    weatherScaleElement,
    weatherSecondaryColorElement,
    weatherSecondarySizeElement,
    weatherSecondarySpacingElement,
    weatherSecondaryWeightElement,
    weatherTemperatureColorElement,
    weatherTemperatureSizeElement,
    weatherTemperatureSpacingElement,
    weatherTemperatureWeightElement,
    weatherTopElement,
  });
(bindTransformInspectorInput(
  dateInspectorElement,
  "date",
  dateColorPropertyByElement,
  datePropertyConfigsByElement,
  dateTransformInputSet,
  {
    left: dateLeftElement,
    top: dateTopElement,
    scale: dateScaleElement,
    rotation: dateRotationElement,
  },
  previewDateResize,
),
  dateInspectorElement.addEventListener("change", (dateChangeEvent: any) => {
    const dateChangeInputElement = dateChangeEvent.target,
      dateChangeComponentId = editorCtx.selectedComponentId;
    if (!dateChangeComponentId) return;
    const dateChangeColorProperty = dateColorPropertyByElement.get(dateChangeInputElement),
      dateChangePropertyConfig = datePropertyConfigsByElement.get(dateChangeInputElement);
    if (!(
      !dateChangeColorProperty &&
      !dateChangePropertyConfig &&
      !dateTransformInputSet.has(dateChangeInputElement)
    )) {
      if (
        (dateChangePropertyConfig || dateTransformInputSet.has(dateChangeInputElement)) &&
        (String(dateChangeInputElement.value).trim() === "" ||
          !Number.isFinite(Number(dateChangeInputElement.value)))
      ) {
        coverMotorButtonElement();
        return;
      }
      mutateDocument((dateChangeDraftDocument: any) => {
        const dateChangeComponent = findComponent2(
          dateChangeDraftDocument,
          dateChangeComponentId,
        )?.component;
        if (!dateChangeComponent || dateChangeComponent.type !== "date") return;
        ((dateChangeComponent.properties = {
          ...(dateChangeComponent.properties || {}),
        }),
          (dateChangeComponent.position = {
            ...(dateChangeComponent.position || {}),
          }),
          (dateChangeComponent.style = {
            ...(dateChangeComponent.style || {}),
          }));
        const dateChangeCanvasWidth = Number(dateChangeDraftDocument.canvas.width || 2778),
          dateChangeCanvasHeight = Number(dateChangeDraftDocument.canvas.height || 1940),
          dateChangeInputNumber = Number(dateChangeInputElement.value);
        dateChangeColorProperty
          ? (dateChangeComponent.properties[dateChangeColorProperty] = dateChangeInputElement.value)
          : dateChangePropertyConfig
            ? ((dateChangeComponent.properties[dateChangePropertyConfig.property] =
                clampNumber2(
                  dateChangeInputNumber,
                  dateChangePropertyConfig.minimum,
                  dateChangePropertyConfig.maximum,
                ) / dateChangePropertyConfig.divisor),
              dateChangePropertyConfig.resizes &&
                weatherProperties(dateChangeComponent, dateChangeComponent.properties))
            : dateChangeInputElement === dateLeftElement
              ? (dateChangeComponent.position.x =
                  (dateChangeCanvasWidth * clampNumber2(dateChangeInputNumber, 0, 100)) / 100 -
                  Number(dateChangeComponent.position.width || 100) / 2)
              : dateChangeInputElement === dateTopElement
                ? (dateChangeComponent.position.y =
                    (dateChangeCanvasHeight * clampNumber2(dateChangeInputNumber, 0, 100)) / 100 -
                    Number(dateChangeComponent.position.height || 100) / 2)
                : dateChangeInputElement === dateScaleElement
                  ? (dateChangeComponent.style.scale =
                      clampNumber2(dateChangeInputNumber, 1, 500) / 100)
                  : dateChangeInputElement === dateRotationElement &&
                    setComponentsRotation(
                      dateChangeDraftDocument,
                      dateChangeComponentId,
                      clampNumber2(dateChangeInputNumber, -360, 360),
                    );
      });
    }
  }));
for (const onDateVisibilityClick of [dateWeekdayElement, dateLunarElement])
  onDateVisibilityClick.addEventListener("click", (dateVisibilityEvent: any) => {
    const dateVisibilityComponentId = editorCtx.selectedComponentId,
      weekdayToggleElement = dateVisibilityEvent.target.closest("[data-date-weekday]"),
      dateLunarToggleElement = dateVisibilityEvent.target.closest("[data-date-lunar]");
    !dateVisibilityComponentId ||
      (!weekdayToggleElement && !dateLunarToggleElement) ||
      mutateDocument((dateVisibilityDraftDocument: any) => {
        const dateVisibilityComponent = findComponent2(
          dateVisibilityDraftDocument,
          dateVisibilityComponentId,
        )?.component;
        !dateVisibilityComponent ||
          dateVisibilityComponent.type !== "date" ||
          ((dateVisibilityComponent.properties = {
            ...(dateVisibilityComponent.properties || {}),
          }),
          weekdayToggleElement &&
            (dateVisibilityComponent.properties.showWeekday =
              weekdayToggleElement.dataset.dateWeekday === "on"),
          dateLunarToggleElement &&
            (dateVisibilityComponent.properties.showLunar =
              dateLunarToggleElement.dataset.dateLunar === "on"),
          weatherProperties(dateVisibilityComponent, dateVisibilityComponent.properties));
      });
  });
(weatherInspectorElement.addEventListener("input", (weatherInputEvent: any) => {
  const weatherInputComponent = removedComponent();
  if (!weatherInputComponent || weatherInputComponent.type !== "weather") return;
  const weatherInputElement = weatherInputEvent.target,
    weatherInputColorProperty = weatherColorPropertiesByElement.get(weatherInputElement);
  if (weatherInputColorProperty) {
    editorCtx.editorRenderer?.previewComponentProperties(weatherInputComponent.id, {
      [weatherInputColorProperty]: weatherInputElement.value,
    });
    return;
  }
  const weatherInputPropertyConfig = weatherPropertyConfigsByElement.get(weatherInputElement);
  if (weatherInputPropertyConfig) {
    if (
      String(weatherInputElement.value).trim() === "" ||
      !Number.isFinite(Number(weatherInputElement.value))
    )
      return;
    const weatherInputPropertyValue =
        clampNumber2(
          Number(weatherInputElement.value),
          weatherInputPropertyConfig.minimum,
          weatherInputPropertyConfig.maximum,
        ) / weatherInputPropertyConfig.divisor,
      weatherResizePropertiesPatch = {
        ...(weatherInputComponent.properties || {}),
        [weatherInputPropertyConfig.property]: weatherInputPropertyValue,
      };
    (editorCtx.editorRenderer?.previewComponentProperties(weatherInputComponent.id, {
      [weatherInputPropertyConfig.property]: weatherInputPropertyValue,
    }),
      weatherInputPropertyConfig.resizes &&
        previewWeatherComponentResize(weatherInputComponent, weatherResizePropertiesPatch));
    return;
  }
  if (
    !weatherTransformInputSet.has(weatherInputElement) ||
    String(weatherInputElement.value).trim() === "" ||
    !Number.isFinite(Number(weatherInputElement.value))
  )
    return;
  const weatherTransformInputNumber = Number(weatherInputElement.value),
    weatherTransformCanvasWidth = Number(editorCtx.activeProject.document.canvas.width || 2778),
    weatherTransformCanvasHeight = Number(editorCtx.activeProject.document.canvas.height || 1940),
    weatherTransformComponentWidth = Number(weatherInputComponent.position?.width || 100),
    weatherTransformComponentHeight = Number(weatherInputComponent.position?.height || 100);
  if (weatherInputElement === weatherLeftElement) {
    const weatherLeftPercent = clampNumber2(weatherTransformInputNumber, 0, 100);
    editorCtx.editorRenderer?.previewComponentTransform(weatherInputComponent.id, {
      x:
        (weatherTransformCanvasWidth * weatherLeftPercent) / 100 -
        weatherTransformComponentWidth / 2,
    });
  } else {
    if (weatherInputElement === weatherTopElement) {
      const weatherTopPercent = clampNumber2(weatherTransformInputNumber, 0, 100);
      editorCtx.editorRenderer?.previewComponentTransform(weatherInputComponent.id, {
        y:
          (weatherTransformCanvasHeight * weatherTopPercent) / 100 -
          weatherTransformComponentHeight / 2,
      });
    } else {
      if (weatherInputElement === weatherScaleElement) {
        const weatherScalePercent = clampNumber2(weatherTransformInputNumber, 1, 500);
        editorCtx.editorRenderer?.previewComponentTransform(weatherInputComponent.id, {
          scale: weatherScalePercent / 100,
        });
      } else {
        if (weatherInputElement === weatherRotationElement) {
          const weatherRotationDegrees = clampNumber2(weatherTransformInputNumber, -360, 360);
          editorCtx.editorRenderer?.previewComponentTransform(weatherInputComponent.id, {
            rotation: weatherRotationDegrees,
          });
        }
      }
    }
  }
}),
  weatherInspectorElement.addEventListener("change", (weatherChangeEvent: any) => {
    const weatherChangeInputElement = weatherChangeEvent.target,
      weatherChangeComponentId = editorCtx.selectedComponentId;
    if (!weatherChangeComponentId) return;
    const weatherChangeColorProperty =
        weatherColorPropertiesByElement.get(weatherChangeInputElement),
      weatherChangePropertyConfig = weatherPropertyConfigsByElement.get(weatherChangeInputElement);
    if (!(
      !weatherChangeColorProperty &&
      !weatherChangePropertyConfig &&
      !weatherTransformInputSet.has(weatherChangeInputElement)
    )) {
      if (
        (weatherChangePropertyConfig || weatherTransformInputSet.has(weatherChangeInputElement)) &&
        (String(weatherChangeInputElement.value).trim() === "" ||
          !Number.isFinite(Number(weatherChangeInputElement.value)))
      ) {
        coverMotorButtonElement();
        return;
      }
      mutateDocument((weatherChangeDraftDocument: any) => {
        const weatherChangeComponent = findComponent2(
          weatherChangeDraftDocument,
          weatherChangeComponentId,
        )?.component;
        if (!weatherChangeComponent || weatherChangeComponent.type !== "weather") return;
        ((weatherChangeComponent.properties = {
          ...(weatherChangeComponent.properties || {}),
        }),
          (weatherChangeComponent.position = {
            ...(weatherChangeComponent.position || {}),
          }),
          (weatherChangeComponent.style = {
            ...(weatherChangeComponent.style || {}),
          }));
        const weatherChangeCanvasWidth = Number(weatherChangeDraftDocument.canvas.width || 2778),
          weatherChangeCanvasHeight = Number(weatherChangeDraftDocument.canvas.height || 1940),
          weatherChangeInputNumber = Number(weatherChangeInputElement.value);
        weatherChangeColorProperty
          ? (weatherChangeComponent.properties[weatherChangeColorProperty] =
              weatherChangeInputElement.value)
          : weatherChangePropertyConfig
            ? ((weatherChangeComponent.properties[weatherChangePropertyConfig.property] =
                clampNumber2(
                  weatherChangeInputNumber,
                  weatherChangePropertyConfig.minimum,
                  weatherChangePropertyConfig.maximum,
                ) / weatherChangePropertyConfig.divisor),
              weatherChangePropertyConfig.resizes &&
                fitWeatherComponentToDimensions(
                  weatherChangeComponent,
                  weatherChangeComponent.properties,
                ))
            : weatherChangeInputElement === weatherLeftElement
              ? (weatherChangeComponent.position.x =
                  (weatherChangeCanvasWidth * clampNumber2(weatherChangeInputNumber, 0, 100)) /
                    100 -
                  Number(weatherChangeComponent.position.width || 100) / 2)
              : weatherChangeInputElement === weatherTopElement
                ? (weatherChangeComponent.position.y =
                    (weatherChangeCanvasHeight * clampNumber2(weatherChangeInputNumber, 0, 100)) /
                      100 -
                    Number(weatherChangeComponent.position.height || 100) / 2)
                : weatherChangeInputElement === weatherScaleElement
                  ? (weatherChangeComponent.style.scale =
                      clampNumber2(weatherChangeInputNumber, 1, 500) / 100)
                  : weatherChangeInputElement === weatherRotationElement &&
                    setComponentsRotation(
                      weatherChangeDraftDocument,
                      weatherChangeComponentId,
                      clampNumber2(weatherChangeInputNumber, -360, 360),
                    );
      });
    }
  }));
for (const onWeatherVisibilityClick of [
  weatherIconVisibleElement,
  weatherTemperatureVisibleElement,
  weatherConditionVisibleElement,
  weatherHumidityVisibleElement,
])
  onWeatherVisibilityClick.addEventListener("click", (weatherVisibilityEvent: any) => {
    const weatherVisibilityComponentId = editorCtx.selectedComponentId,
      weatherVisibilityButtonElement = weatherVisibilityEvent.target.closest("button");
    if (!weatherVisibilityComponentId || !weatherVisibilityButtonElement) return;
    const weatherVisibilityEntry = [
      ["weatherIconVisible", "iconVisible"],
      ["weatherTemperatureVisible", "temperatureVisible"],
      ["weatherConditionVisible", "conditionVisible"],
      ["weatherHumidityVisible", "humidityVisible"],
    ].find(
      ([weatherVisibilityDatasetKey]) =>
        weatherVisibilityButtonElement.dataset[weatherVisibilityDatasetKey] !== undefined,
    );
    if (!weatherVisibilityEntry) return;
    const [weatherVisibilityDatasetKeyName, weatherVisibilityPropertyName] = weatherVisibilityEntry;
    mutateDocument((weatherVisibilityDraftDocument: any) => {
      const weatherVisibilityComponent = findComponent2(
        weatherVisibilityDraftDocument,
        weatherVisibilityComponentId,
      )?.component;
      !weatherVisibilityComponent ||
        weatherVisibilityComponent.type !== "weather" ||
        ((weatherVisibilityComponent.properties = {
          ...(weatherVisibilityComponent.properties || {}),
          [weatherVisibilityPropertyName]:
            weatherVisibilityButtonElement.dataset[weatherVisibilityDatasetKeyName] === "on",
        }),
        fitWeatherComponentToDimensions(
          weatherVisibilityComponent,
          weatherVisibilityComponent.properties,
        ));
    });
  });
attachLineChartInspectorInput({
  get lineChartInspectorElement() { return lineChartInspectorElement; },
  get removedComponent() { return removedComponent; },
  get lineChartColorPropertiesByElement() { return lineChartColorPropertiesByElement; },
  get lineChartPropertyConfigsByElement() { return lineChartPropertyConfigsByElement; },
  get editorRenderer() { return editorCtx.editorRenderer; },
  get lineChartThresholdInputs() { return lineChartThresholdInputs; },
  get lineChartTransformInputSet() { return lineChartTransformInputSet; },
  get activeProject() { return editorCtx.activeProject; },
  get lineChartLeftInputElement() { return lineChartLeftInputElement; },
  get lineChartTopInputElement() { return lineChartTopInputElement; },
  get lineChartWidthInputElement() { return lineChartWidthInputElement; },
  get lineChartHeightInputElement() { return lineChartHeightInputElement; },
  get lineChartScaleInputElement() { return lineChartScaleInputElement; },
  get lineChartRotationInputElement() { return lineChartRotationInputElement; },
  get selectedComponentId() { return editorCtx.selectedComponentId; },
  get coverMotorButtonElement() { return coverMotorButtonElement; },
  get mutateDocument() { return mutateDocument; },
  get lineChartThresholdModeSelectElement() { return lineChartThresholdModeSelectElement; },
  get setComponentsRotation() { return setComponentsRotation; },
  get lineChartValueVisibleElement() { return lineChartValueVisibleElement; },
});

const {
    navigationColorPropertiesByElement,
    navigationPropertyConfigsByElement,
    navigationToggleStateByElement,
    navigationVisibilityPropertiesByButton,
  } = createNavigationInputTables({
    navigationFrameActiveOpacityElement,
    navigationFrameAngleElement,
    navigationFrameColorElement,
    navigationFrameIdleOpacityElement,
    navigationFrameVisibleElement,
    navigationFrameWidthElement,
    navigationGlowActiveSizeElement,
    navigationGlowActiveStrengthElement,
    navigationGlowAngleElement,
    navigationGlowColorElement,
    navigationGlowIdleSizeElement,
    navigationGlowIdleStrengthElement,
    navigationGlowVisibleElement,
    navigationIconActiveOpacityElement,
    navigationIconColorElement,
    navigationIconIdleOpacityElement,
    navigationIconLeftElement,
    navigationIconSizeElement,
    navigationIconTopElement,
    navigationIconVisibleElement,
    navigationMainColorElement,
    navigationMainSizeElement,
    navigationMainSpacingElement,
    navigationMainTextElement,
    navigationMainTextLeftElement,
    navigationMainTextTopElement,
    navigationMainVisibleElement,
    navigationMainWeightElement,
    navigationRadiusElement,
    navigationSecondaryColorElement,
    navigationSecondarySizeElement,
    navigationSecondarySpacingElement,
    navigationSecondaryTextElement,
    navigationSecondaryTextLeftElement,
    navigationSecondaryTextTopElement,
    navigationSecondaryVisibleElement,
    navigationSecondaryWeightElement,
    navigationTextActiveOpacityElement,
    navigationTextIdleOpacityElement,
  });
const navigationTransformInputSet = new Set([
  navigationLeftElement,
  navigationTopElement,
  navigationWidthElement,
  navigationHeightElement,
  navigationScaleElement,
  navigationRotationElement,
]);
attachNavigationInspectorInput({
  get navigationInspectorFormElement() { return navigationInspectorFormElement; },
  get removedComponent() { return removedComponent; },
  get navigationLabelTextInputElement() { return navigationLabelTextInputElement; },
  get navigationColorPropertiesByElement() { return navigationColorPropertiesByElement; },
  get airConditionerInspectorSubmitEventById() { return airConditionerInspectorSubmitEventById; },
  get editorRenderer() { return editorCtx.editorRenderer; },
  get navigationPropertyConfigsByElement() { return navigationPropertyConfigsByElement; },
  get syncNavigationPreviewFromElement() { return syncNavigationPreviewFromElement; },
  get navigationTransformInputSet() { return navigationTransformInputSet; },
  get activeProject() { return editorCtx.activeProject; },
  get navigationLeftElement() { return navigationLeftElement; },
  get navigationTopElement() { return navigationTopElement; },
  get navigationWidthElement() { return navigationWidthElement; },
  get navigationHeightElement() { return navigationHeightElement; },
  get navigationScaleElement() { return navigationScaleElement; },
  get navigationRotationElement() { return navigationRotationElement; },
  get selectedComponentId() { return editorCtx.selectedComponentId; },
  get navigationToggleStateByElement() { return navigationToggleStateByElement; },
  get navigationPropertyNameFromElement() { return navigationPropertyNameFromElement; },
  get navigationLabelElement() { return navigationLabelElement; },
  get coverMotorButtonElement() { return coverMotorButtonElement; },
  get mutateDocument() { return mutateDocument; },
  get entryStateRecord() { return entryStateRecord; },
  get setComponentsRotation() { return setComponentsRotation; },
  get onImageAssetUploadButtonClick() { return onImageAssetUploadButtonClick; },
});

for (const [
  navigationVisibilityButton,
  navigationVisibilityProperty,
] of navigationVisibilityPropertiesByButton)
  navigationVisibilityButton.addEventListener("click", () => {
    const onNavigationVisibilityButtonClickState = editorCtx.selectedComponentId;
    onNavigationVisibilityButtonClickState &&
      mutateDocument((onNavigationVisibilityButtonClick: any) => {
        const navigationVisibilityComponentId = findComponent2(
          onNavigationVisibilityButtonClick,
          onNavigationVisibilityButtonClickState,
        )?.component;
        if (
          !navigationVisibilityComponentId ||
          !navigationLabelTextInputElement(navigationVisibilityComponentId)
        )
          return;
        const $e7 = entryStateRecord(navigationVisibilityComponentId, navigationVisibilityProperty);
        ((navigationVisibilityComponentId.properties = {
          ...(navigationVisibilityComponentId.properties || {}),
          [navigationVisibilityProperty]:
            navigationVisibilityComponentId.properties?.[navigationVisibilityProperty] === false,
        }),
          onImageAssetUploadButtonClick(
            onNavigationVisibilityButtonClickState,
            navigationVisibilityProperty,
            $e7,
            entryStateRecord(navigationVisibilityComponentId, navigationVisibilityProperty),
          ));
      });
  });
navigationPreviewStateElement.addEventListener("click", (navigationVisibilityDraftDocument: any) => {
  const navigationVisibilityComponentElement = navigationVisibilityDraftDocument.target.closest(
      "[data-navigation-preview]",
    ),
    navigationVisibilityComponent = editorCtx.selectedComponentId;
  if (!navigationVisibilityComponentElement || !navigationVisibilityComponent) return;
  const navigationPreview = ["off", "on"].includes(
    navigationVisibilityComponentElement.dataset.navigationPreview,
  )
    ? navigationVisibilityComponentElement.dataset.navigationPreview
    : "auto";
  applyNavigationPreviewState(navigationVisibilityComponent, navigationPreview);
});
function styleApplyDeps(): StyleApplyDeps {
  return {
    get airConditionerBaselineByComponentId() { return airConditionerBaselineByComponentId; },
    get editorCtx() { return editorCtx; },
    get iconButtonBaselineByComponentId() { return iconButtonBaselineByComponentId; },
    get iconButtonEffectBaselineByComponentId() { return iconButtonEffectBaselineByComponentId; },
    get navigationButtonSavedSettingsByComponentId() { return navigationButtonSavedSettingsByComponentId; },
    get onNavigationStyleApplyConfirmButtonClick() { return onNavigationStyleApplyConfirmButtonClick; },
    get panelFrameBaselineByComponentId() { return panelFrameBaselineByComponentId; },
    get runAltNew() { return resolveAirConditionerStyleValue; },
    get runAltPeer() { return resolveNavigationStyleValue; },
    get runAuxBackup() { return normalizeSensorKind; },
    get runAuxInner() { return resolveCameraStyleValue; },
    get runAuxOld() { return resolvePanelFrameStyleValue; },
    get runAuxPeer() { return resolvePresenceSensorStyleKeys; },
    get runVariantFallback() { return areStyleValuesEqual; },
    get styleTargetCheckbox() { return styleTargetCheckbox; },
  };
}
function styleDialogsDeps(): StyleDialogsDeps {
  return {
    ...homeElements,
    get appliedStylePropertyKey() { return appliedStylePropertyKey; },
    get applyInspectorDimensionChange() { return applyInspectorDimensionChange; },
    get editorCtx() { return editorCtx; },
    get entryStateRecord() { return entryStateRecord; },
    get findReplaceableComponents() { return findReplaceableComponents; },
    get handleOperationError() { return handleOperationError; },
    get hideAssetLargePreview() { return hideAssetLargePreview; },
    get navigationButtonSavedSettingsByComponentId() { return navigationButtonSavedSettingsByComponentId; },
    get navigationIconCopyError() { return navigationIconCopyError; },
    get navigationStyleApplyTargetDeps() { return navigationStyleApplyTargetDeps; },
    get onAssetOptionsClick() { return onAssetOptionsClick; },
    get onDeleteAssetCancelButtonClick() { return onDeleteAssetCancelButtonClick; },
    get onImageAssetFolderSelectChange() { return onImageAssetFolderSelectChange; },
    get onNavigationIconCopyButtonClick() { return onNavigationIconCopyButtonClick; },
    get onNavigationStyleApplyCancelButtonClick() { return onNavigationStyleApplyCancelButtonClick; },
    get onNavigationStyleApplyConfirmButtonClick() { return onNavigationStyleApplyConfirmButtonClick; },
    get removedComponent() { return removedComponent; },
    get runAltBackup() { return collectChangedLineChartStyleKeys; },
    get runAltCopy() { return resolveComponentStyleValue; },
    get runAltFirst() { return formatAirConditionerStyleValue; },
    get runAltLeft() { return collectChangedAirConditionerStyleKeys; },
    get runAltNew() { return resolveAirConditionerStyleValue; },
    get runAltOuter() { return collectChangedTitleButtonStyleKeys; },
    get runAltPeer() { return resolveNavigationStyleValue; },
    get runAltTwin() { return formatLineChartStyleValue; },
    get runAuxAlt() { return collectChangedIconButtonEffectStyleKeys; },
    get runAuxInner() { return resolveCameraStyleValue; },
    get runAuxLower() { return collectChangedCameraStyleKeys; },
    get runAuxOld() { return resolvePanelFrameStyleValue; },
    get runAuxRight() { return formatCameraStyleValue; },
    get runAuxTwin() { return formatSensorKindLabel; },
    get runAuxVariant() { return formatIconButtonEffectStyleValue; },
    get runCopyBackupDeps() { return createCopyBackupDeps; },
    get runCopyFallback() { return closePopupRenameDialog; },
    get runExtraLocal() { return computeCoverMotorStyleChanges; },
    get runShadow() { return closeOtherPickerMenus; },
    get runVariantAux() { return formatPanelFrameStyleValue; },
    get runVariantExtra() { return collectChangedPanelFrameStyleKeys; },
    get runVariantFallback() { return areStyleValuesEqual; },
    get runVariantLower() { return applyNavigationStyleToTargets; },
    get runVariantTwin() { return collectPendingNavigationStyleKeys; },
    get styleTargetCheckbox() { return styleTargetCheckbox; },
  };
}
/** 导航「套用到其它控件」目标列表（P4 搬进 `navigation-style-apply/target-options`，此处只转发句柄）。 */
const navigationStyleApplyTargetDeps = () => ({ navigationStyleApplyTargetsElement });
bindNavigationStyleWiring({
  actionNeedsCurrentEntity2, addLightStatisticsEntity, airConditionerApplyStyleElement,
  airConditionerBaselineByComponentId, applyCameraDimensionChange, applyEffectAssetDimensionChange,
  applyFlowLineStyle2, applyLineChartDimensionChange, applyPercentageBarChange2, cameraApplyStyleElement,
  closeOtherPickerMenus, closePickerMenu, copyTextToClipboard, coverMotorButtonElement, devicesByDeviceId,
  editorCtx, effectIconName, entitiesByEntityId, entryStateRecord, findComponent2, findElement,
  handleOperationError, ibeApplyStyleElement, ibeIconButtonElement, ibeIconCopyElement, ibeIconMenuElement,
  ibeIconOptionsElement, ibeIconSearchElement, iconButtonApplyStyleElement, iconButtonBaselineByComponentId,
  iconButtonEffectBaselineByComponentId, iconButtonIconButtonElement, iconButtonIconCopyElement,
  iconButtonIconMenuElement, iconButtonIconOptionsElement, iconButtonIconSearchElement,
  iconTooltipElementBuffer, iconTooltipElementCount, iconTooltipElementFlag, iconTooltipElementStep,
  iconTooltipElementStore, imageAssetClickEvent, imageAssetMeasureError, imageEntityButtonElement,
  imageEntityMenuElement, imageEntityOptionsElement, imageEntitySearchElement, layoutTitleButtonIconMenu,
  lightStatisticsEntityButtonElement, lightStatisticsEntityConfirmElement, lightStatisticsEntityListElement,
  lightStatisticsEntityMenuElement, lightStatisticsEntityOptionsElement, lightStatisticsEntityPendingElement,
  lightStatisticsEntitySearchElement, lightStatisticsIconButtonElement, lightStatisticsIconCopyElement,
  lightStatisticsIconMenuElement, lightStatisticsIconOptionsElement, lightStatisticsIconSearchElement,
  lineChartApplyStyleButtonElement, manualRelatedEntityConfig2, mutateDocument, navigationApplyStyleElement,
  navigationButtonSavedSettingsByComponentId, navigationIconButtonElement, navigationIconCopyElement,
  navigationIconMenuElement, navigationIconOptionsElement, navigationIconSearchElement,
  navigationLabelTextInputElement, navigationStyleApplyCancelElement, navigationStyleApplyCloseElement,
  navigationStyleApplyConfirmElement, navigationStyleApplyDialogElement, navigationStyleApplyMessageElement,
  navigationStyleApplyPropertiesElement, navigationStyleApplyTargetsElement, normalizeSensorKind,
  onComponentTemplateDialogClick, onErrorDialogCloseButtonClick, onIconButtonEffectAssetFolderSelectChange,
  onImageAssetUploadButtonClick, onShowSharedComponentsButtonClick, openAirConditionerStyleApplyDialog,
  openCameraStyleApplyDialog, openIconButtonEffectStyleApplyDialog, openIconButtonStyleApplyDialog,
  openNavigationStyleApplyDialog, openTitleButtonStyleApplyDialog, panelFrameApplyStyleButtonElement,
  panelFrameBaselineByComponentId, percentageBarDefaults2, positionIbeIconMenu, positionIconButtonIconMenu,
  positionLightStatisticsEntityMenu, positionLightStatisticsIconMenu, positionNavigationIconMenu,
  recoveredComponentId, refreshImageAssetPickerPreview, relatedPopupContext2, removeLightStatisticsEntityAt,
  removedComponent, renderLightStatisticsEntityOptions, renderRelatedPopupEntityOptions,
  resetStyleApplyBaselines, setPickerButtonLabel, showLightStatisticsMessage, titleButtonApplyStyleElement,
  titleButtonIconButtonElement, titleButtonIconCopyElement, titleButtonIconMenuElement,
  titleButtonIconOptionsElement, titleButtonIconSearchElement
});
(sharedReferenceId("weather"),
  sharedReferenceId("line-chart"),
  sharedReferenceId("title-button"),
  sharedReferenceId("light-statistics"),
  sharedReferenceId("icon-button-effect"),
  sharedReferenceId("icon-button", ["icon-button", "device-button", "presence-sensor"]),
  sharedReferenceId("vacuum-map"),
  sharedReferenceId("camera"),
  sharedReferenceId("air-conditioner"),
  sharedReferenceId("navigation-button", ["navigation-button", "scene-mode"]),
  sceneModeControlElement.addEventListener("click", (openPopupNameDialog: any) => {
    const openPopupNameDialogElement = openPopupNameDialog.target.closest(
      "[data-scene-control-mode]",
    );
    if (!openPopupNameDialogElement) return;
    const recoveredSnapshotValue = editorCtx.selectedComponentId,
      sceneControlMode = openPopupNameDialogElement.dataset.sceneControlMode;
    ["switch", "scene"].includes(sceneControlMode) &&
      mutateDocument((popupNameMode: any) => {
        const recoveredComponentIdsState = findComponent2(
          popupNameMode,
          recoveredSnapshotValue,
        )?.component;
        recoveredComponentIdsState?.type === "scene-mode" &&
          (recoveredComponentIdsState.properties.controlMode = sceneControlMode);
      });
  }));
const entityPickerHintText = "推荐去 HA 复制实体 ID，粘贴搜索。可精准选择。";
const { deferUntilEntitiesLoaded: popupBeingRenamed }: any = createEditorPickerLifecycle2({
  getEntitiesLoaded: () => editorCtx.isAreEntitiesLoaded,
  getEntityLoadPromise: () => editorCtx.entitiesLoadPromise,
  loadEntities: ensureEntitiesLoaded,
  reportError: handleOperationError,
});
// ── P4 切片转发器（声明级切片：宿主侧薄转发器 + 依赖袋，都是函数声明 → 提升，位置无关）──


function copyBackupPickersDeps(): CopyBackupPickersDeps {
  return {
    ...homeElements,
    get airConditionerLayerByComponentId() { return airConditionerLayerByComponentId; },
    get canDeleteAssetFolder() { return canDeleteAssetFolder; },
    get coverMotorButtonElement() { return coverMotorButtonElement; },
    get createEditorEntityPickerOption() { return createEditorEntityPickerOption; },
    get createEditorPickerCurrentEntity() { return createEditorPickerCurrentEntity; },
    get createIconPickerClearOption() { return createIconPickerClearOption; },
    get createIconPickerClearOptionState() { return createIconPickerClearOptionState; },
    get createIconPickerOption() { return createIconPickerOption; },
    get customSelectsBySelectElement() { return customSelectsBySelectElement; },
    get devicesByDeviceId() { return devicesByDeviceId; },
    get editorCtx() { return editorCtx; },
    get editorEntityMatches() { return editorEntityMatches; },
    get editorPickerComponentTypeLabel() { return editorPickerComponentTypeLabel; },
    get effectVariantUrlState() { return effectVariantUrlState; },
    get entitiesByEntityId() { return entitiesByEntityId; },
    get errorPhase() { return errorPhase; },
    get ICON_PAGE_SIZE() { return ICON_PAGE_SIZE; },
    get initActionPopupConfig() { return initActionPopupConfig; },
    get inspectorSyncDeps() { return inspectorSyncDeps; },
    get loadNavigationIconOptions() { return loadNavigationIconOptions; },
    get mutateDocument() { return mutateDocument; },
    get nudgeDeps() { return nudgeDeps; },
    get popupBeingRenamed() { return popupBeingRenamed; },
    get entityPickerHintText() { return entityPickerHintText; },
    get positionPopupEntityMenu() { return positionPopupEntityMenu; },
    get removalPageEntry() { return removalPageEntry; },
    get removedComponent() { return removedComponent; },
    get renderNavigationIconPreview() { return renderNavigationIconPreview; },
    get renderPopupEntityOptions() { return renderPopupEntityOptions; },
    get requestJson() { return requestJson; },
    get resolveAssetPreviewUrl() { return resolveAssetPreviewUrl; },
    get runConfig() { return positionCustomSelectMenu; },
    get runCopyBackup() { return renderCopyBackupDialog; },
    get runCopyLast() { return requestDeleteAssetFolder; },
    get runCopyTwin() { return clickPopupListOption; },
    get runExtraAlt() { return resolveEntityPickerConfig; },
    get runExtraVariant() { return renderRelatedPopupEntityOptions; },
    get runMode() { return formatEntitySummary; },
    get runOuter() { return ensureIconListPaginationState; },
    get runPortion() { return resolveEntityCatalog; },
    get runSegment() { return findIconVisibilityVirtualEntity; },
    get runShadow() { return closeOtherPickerMenus; },
    get runState() { return closeCustomSelect; },
    get selectedComponentIdsFromDom() { return selectedComponentIdsFromDom; },
    get setComponentsRotation() { return setComponentsRotation; },
    get syncPopupEntityButton() { return syncPopupEntityButton; },
    get titleButtonMenuDeps() { return titleButtonMenuDeps; },
    get value() { return value; },
  };
}






let assetManagementDepsCache: AssetManagementDeps | null = null;
function assetManagementDeps(): AssetManagementDeps {
  // 每次 pointermove / 滑块拖动都重新构造会新建对象并定义 300+ 个 getter 闭包，
  // 是拖动取色器时最明显的分配热点。getter 读的都是活绑定，缓存一次即可。
  if (assetManagementDepsCache) return assetManagementDepsCache;
  const assetManagementDepsValue: AssetManagementDeps = {
    ...homeElements,
    get assetMatchesId() { return assetMatchesId; },
    get canDeleteAssetFolder() { return canDeleteAssetFolder; },
    get createAssetOptionButton() { return createAssetOptionButton; },
    get createEditorEntityPickerOption() { return createEditorEntityPickerOption; },
    get createEditorPickerCurrentAsset() { return createEditorPickerCurrentAsset; },
    get createIconPickerOption() { return createIconPickerOption; },
    get destroyDashboardPreview() { return destroyDashboardPreview; },
    get editorAssetMatcher() { return editorAssetMatcher; },
    get editorAssetToolbar() { return editorAssetToolbar; },
    get editorCtx() { return editorCtx; },
    get ensureEntitiesLoaded() { return ensureEntitiesLoaded; },
    get exportedAssetsInFolder() { return exportedAssetsInFolder; },
    get findAssetById() { return findAssetById; },
    get findReplaceableComponents() { return findReplaceableComponents; },
    get formatLastSeen() { return formatLastSeen; },
    get handleOperationError() { return handleOperationError; },
    get leftFolderName() { return leftFolderName; },
    get mutateDocument() { return mutateDocument; },
    get mutationRecord() { return mutationRecord; },
    get positionEffectAssetMenu() { return positionEffectAssetMenu; },
    get positionImageAssetMenu() { return positionImageAssetMenu; },
    get reloadAssetCatalog() { return reloadAssetCatalog; },
    get removedComponent() { return removedComponent; },
    get renderEffectAssetOptions() { return renderEffectAssetOptions; },
    get renderImageAssetOptions() { return renderImageAssetOptions; },
    get requestJson() { return requestJson; },
    get runCopyBackup() { return renderCopyBackupDialog; },
    get runCopyFirst() { return requestDeleteUserAsset; },
    get runCopyLower() { return selectAssetFolder; },
    get runCopyTwin() { return clickPopupListOption; },
    get runMode() { return formatEntitySummary; },
    get runShadow() { return closeOtherPickerMenus; },
    get runSnapshot() { return formatEntityLabel; },
    get runVariantLower() { return applyNavigationStyleToTargets; },
    get saturationPointerMoveEventState() { return saturationPointerMoveEventState; },
    get scheduleAssetPreview() { return scheduleAssetPreview; },
    get selectableEntities() { return selectableEntities; },
    get selectedComponentIdsFromDom() { return selectedComponentIdsFromDom; },
    get setComponentsRotation() { return setComponentsRotation; },
    get syncAssetFolderOptions() { return syncAssetFolderOptions; },
    get userImageUploader() { return userImageUploader; },
  };
  assetManagementDepsCache = assetManagementDepsValue;
  return assetManagementDepsValue;
}
(imageAssetMenuElement.addEventListener("click", (popupModuleTitleState: any) => {
  const popupModuleTitle = popupModuleTitleState.target.closest("[data-image-asset-source]");
  popupModuleTitle && selectAssetFolder("image", popupModuleTitle.dataset.imageAssetSource);
}),
  ibeAssetMenuElement.addEventListener("click", (popupModuleDeviceType: any) => {
    const popupModuleDeviceTypeElement =
      popupModuleDeviceType.target.closest("[data-ibe-asset-source]");
    popupModuleDeviceTypeElement &&
      selectAssetFolder("ibe", popupModuleDeviceTypeElement.dataset.ibeAssetSource);
  }),
  imageAssetUploadButtonElement.addEventListener("click", () =>
    imageAssetUploadInputElement.click(),
  ),
  ibeAssetUploadElement.addEventListener("click", () => ibeAssetUploadInputElement.click()),
  imageAssetUploadInputElement.addEventListener("change", async () => {
    (await popupModuleTypeValue(imageAssetUploadInputElement.files, "image"),
      (imageAssetUploadInputElement.value = ""));
  }),
  ibeAssetUploadInputElement.addEventListener("change", async () => {
    (await popupModuleTypeValue(ibeAssetUploadInputElement.files, "ibe"),
      (ibeAssetUploadInputElement.value = ""));
  }));
for (const popupModuleDeviceTypeState of [imageAssetOptionsElement, ibeAssetOptionsElement])
  popupModuleDeviceTypeState.addEventListener("click", (popupNameDraftDocumentState: any) => {
    const popupModulePopupElement = popupNameDraftDocumentState.target.closest(
      "[data-delete-user-asset]",
    );
    popupModulePopupElement &&
      (popupNameDraftDocumentState.preventDefault(),
      popupNameDraftDocumentState.stopPropagation(),
      requestDeleteUserAsset(popupModulePopupElement.dataset.deleteUserAsset));
  });
bindAssetDialogWiring({
  addComponentButtonElement, applyAssetNaturalSize, applyCollectionLayerOrder2, clone2, closeOtherPickerMenus,
  componentTemplateCloseElement, componentTemplateDialogElement, componentTemplateListElement,
  coverMotorButtonElement, createComponentFromTemplate2, deleteAssetCancelButtonElement,
  deleteAssetCloseButtonElement, deleteAssetConfirmButtonElement, deleteAssetDialogElement,
  deleteAssetFolderCancelButtonElement, deleteAssetFolderCloseButtonElement,
  deleteAssetFolderConfirmButtonElement, deleteAssetFolderDialogElement, discardRecoverySnapshot,
  documentSource, editorCtx, entityLoadError, errorDialogCloseButtonElement, errorDialogCloseElement,
  errorDialogConfirmElement, errorPhase, findAssetById, findComponent2, handleOperationError,
  hideAssetLargePreview, historyEntry, historyState, ibeAssetButtonElement, ibeAssetFolderElement,
  ibeAssetMenuElement, ibeAssetOptionsElement, ibeAssetSearchElement, imageAssetButtonElement,
  imageAssetFolderSelectElement, imageAssetMenuElement, imageAssetOptionsElement, imageAssetSearchInputElement,
  leftFolderName, loadNavigationIconOptions, measureAssetImageSize, mutateDocument, newId2,
  nextTemplateInstanceName2, pageSelectElement, positionEffectAssetMenu, positionImageAssetMenu,
  projectSelectElement, projectSummary, recoveryDialogElement, recoveryDiscardElement, recoveryRestoreElement,
  redoElement, refreshAssetPickers, refreshComponentDialogScale, reloadAssetCatalog, renderComponentLists,
  renderComponentTemplates, renderEditorWorkspace, renderEffectAssetOptions, renderImageAssetOptions,
  requestJson, saveDraft, scheduleAssetPreview, selectComponent, setComponentScope, setEditorMode,
  settleAutoDiagramDialog, showDashboardPreviewButtonElement, showEditorPreviewButtonElement,
  showPageComponentsElement, showPageEditorElement, showPopupEditorElement, showSharedComponentsElement,
  soundToggleButtonElement, syncAssetFolderOptions, syncDefaultPageAction, syncHistoryButtons,
  syncSharedComponentReferenceOrder2, undoElement, value, writeError
});
(popupNewElement.addEventListener("click", () => scaleDraftDocument("create")),
  popupNameCloseElement.addEventListener("click", () => popupNameDialogElement.close()),
  popupNameCancelElement.addEventListener("click", () => popupNameDialogElement.close()),
  popupNameFormElement.addEventListener("submit", (onDocumentKeydown: any) => {
    onDocumentKeydown.preventDefault();
    const duplicatedPopupState = popupNameFormElement.elements.name.value.trim();
    if (!duplicatedPopupState) return;
    const ce2 = editorCtx.popupDialogMode === "create" ? newId2("custom-popup") : editorCtx.selectedPopupId;
    (popupNameDialogElement.close(),
      mutateDocument((documentKeydownEvent: any) => {
        if (
          ((documentKeydownEvent.customPopups = documentKeydownEvent.customPopups || []),
          editorCtx.popupDialogMode === "rename")
        ) {
          const keyboardTargetElement = documentKeydownEvent.customPopups.find(
            (popupDeleteCandidateValue: any) => popupDeleteCandidateValue.id === editorCtx.selectedPopupId,
          );
          keyboardTargetElement && (keyboardTargetElement.name = duplicatedPopupState);
          return;
        }
        (documentKeydownEvent.customPopups.push({
          id: ce2,
          name: duplicatedPopupState,
          templateRef: {
            templateId: "custom-popup",
            version: 1,
          },
          layout: {
            columns: 3,
          },
          modules: [] as any[],
        }),
          (editorCtx.selectedPopupId = ce2),
          setEditorMode("popup"));
      }));
  }),
  popupSelectElement.addEventListener("change", () => {
    (hidePopupActionsMenu(), (editorCtx.selectedPopupId = popupSelectElement.value || null), setEditorMode("popup"));
  }),
  popupListElement.addEventListener("click", (bindPopupModuleSectionState: any) => {
    const enterTargetElement = bindPopupModuleSectionState.target.closest("[data-popup-id]");
    enterTargetElement &&
      (hidePopupActionsMenu(),
      (editorCtx.selectedPopupId = enterTargetElement.dataset.popupId),
      (popupSelectElement.value = editorCtx.selectedPopupId),
      renderCustomPopupSelector(editorCtx.activeProject.document, editorCtx.selectedPopupId),
      setEditorMode("popup"));
  }),
  popupListElement.addEventListener("contextmenu", (invalidateEditorLayoutMetrics: any) => {
    const invalidateEditorLayoutMetricsElement =
      invalidateEditorLayoutMetrics.target.closest("[data-popup-id]");
    if (!invalidateEditorLayoutMetricsElement) return;
    (invalidateEditorLayoutMetrics.preventDefault(),
      (editorCtx.selectedPopupId = invalidateEditorLayoutMetricsElement.dataset.popupId),
      (popupSelectElement.value = editorCtx.selectedPopupId),
      renderCustomPopupSelector(editorCtx.activeProject.document, editorCtx.selectedPopupId),
      setEditorMode("popup"),
      (editorCtx.moduleDialogPopupId = editorCtx.selectedPopupId),
      (popupActionsMenuElement.hidden = false),
      (popupActionsMenuElement.style.left = "0px"),
      (popupActionsMenuElement.style.top = "0px"));
    const targetBoundsRecord = popupActionsMenuElement.getBoundingClientRect();
    ((popupActionsMenuElement.style.left =
      clampNumber2(
        invalidateEditorLayoutMetrics.clientX,
        8,
        window.innerWidth - targetBoundsRecord.width - 8,
      ) + "px"),
      (popupActionsMenuElement.style.top =
        clampNumber2(
          invalidateEditorLayoutMetrics.clientY,
          8,
          window.innerHeight - targetBoundsRecord.height - 8,
        ) + "px"));
  }),
  popupActionsButtonElement.addEventListener("click", () => {
    if (popupActionsButtonElement.disabled) return;
    const hidden15 = popupActionsMenuElement.hidden;
    (errorPhase(),
      value(),
      (popupActionsMenuElement.hidden = !hidden15),
      popupActionsButtonElement.setAttribute("aria-expanded", String(hidden15)));
  }),
  popupActionsMenuElement.addEventListener("click", (readEditorLayoutPx: any) => {
    const requestedPopupAction =
        readEditorLayoutPx.target.closest("[data-popup-action]")?.dataset.popupAction,
      ce3 = editorCtx.moduleDialogPopupId || editorCtx.selectedPopupId;
    if ((hidePopupActionsMenu(), !(!requestedPopupAction || !ce3))) {
      if (requestedPopupAction === "rename") {
        scaleDraftDocument("rename");
        return;
      }
      if (requestedPopupAction === "duplicate") {
        const cssVarNameState = newId2("custom-popup");
        ((editorCtx.selectedPopupId = cssVarNameState),
          mutateDocument((cssVarName: any) => {
            const fallbackPxState = (cssVarName.customPopups || []).find(
              (fallbackPx: any) => fallbackPx.id === ce3,
            );
            if (!fallbackPxState) return;
            const rawValue = clone2(fallbackPxState);
            ((rawValue.id = cssVarNameState),
              (rawValue.name = fallbackPxState.name + "_副本"),
              (rawValue.modules = (rawValue.modules || []).map((mappedItemsDelta: any) => ({
                ...mappedItemsDelta,
                id: newId2("popup-module"),
              }))),
              cssVarName.customPopups.push(rawValue));
          }));
        return;
      }
      if (requestedPopupAction === "delete") {
        const numericValue = (editorCtx.activeProject?.document?.customPopups || []).find(
          (componentNodeState: any) => componentNodeState.id === ce3,
        );
        if (!numericValue) return;
        ((editorCtx.popupModuleDraft = ce3),
          (deletePopupNameElement.textContent = numericValue.name),
          deletePopupDialogElement.showModal());
      }
    }
  }));
(deletePopupCloseElement.addEventListener("click", cancelDeletePopupDialog),
  deletePopupCancelElement.addEventListener("click", cancelDeletePopupDialog),
  deletePopupDialogElement.addEventListener("close", () => {
    editorCtx.popupModuleDraft = null;
  }),
  deletePopupConfirmElement.addEventListener("click", () => {
    const Va2 = editorCtx.popupModuleDraft;
    Va2 &&
      ((editorCtx.popupModuleDraft = null),
      deletePopupDialogElement.close(),
      (deletePopupConfirmElement.disabled = true),
      mutateDocument((componentActionValueState: any) => {
        componentActionValueState.customPopups = (
          componentActionValueState.customPopups || []
        ).filter((filteredItemsPath: any) => filteredItemsPath.id !== Va2);
        const numericValueHandler = (onPopupModuleCloseButtonClickState: any) => {
          for (const onPopupModuleCancelButtonClickValue of onPopupModuleCloseButtonClickState ||
            []) {
            for (const [
              onPopupModuleEntityButtonClickValue,
              onPopupModuleEntitySearchInputInputState,
            ] of Object.entries<{
              type?: string;
              data?: { popupSource?: string; popupId?: string };
            }>(onPopupModuleCancelButtonClickValue.actions || {}))
              onPopupModuleEntitySearchInputInputState.type === "more-info" &&
                onPopupModuleEntitySearchInputInputState.data?.popupSource === "custom" &&
                onPopupModuleEntitySearchInputInputState.data?.popupId === Va2 &&
                (onPopupModuleCancelButtonClickValue.actions[onPopupModuleEntityButtonClickValue] =
                  {
                    type: "none",
                    data: {} as Record<string, any>,
                  });
            numericValueHandler(onPopupModuleCancelButtonClickValue.children);
          }
        };
        numericValueHandler(componentActionValueState.sharedComponents);
        for (const onPopupModuleEntityOptionsClickState of componentActionValueState.pages || [])
          numericValueHandler(onPopupModuleEntityOptionsClickState.components);
        ((editorCtx.selectedPopupId = componentActionValueState.customPopups[0]?.id || null),
          editorCtx.selectedPopupId || setEditorMode("edit"));
      }).finally(() => {
        deletePopupConfirmElement.disabled = false;
      }));
  }),
  popupModuleCloseElement.addEventListener("click", () => {
    (closePopupModuleEntityMenu(), popupModuleDialogElement.close());
  }),
  popupModuleCancelElement.addEventListener("click", () => {
    (closePopupModuleEntityMenu(), popupModuleDialogElement.close());
  }),
  popupModuleEntityButtonElement.addEventListener("click", () => {
    const hidden16 = popupModuleEntityMenuElement.hidden;
    ((popupModuleEntityMenuElement.hidden = !hidden16),
      popupModuleEntityButtonElement.setAttribute("aria-expanded", String(hidden16)),
      hidden16 &&
        (renderPopupModuleEntityOptions(),
        window.requestAnimationFrame(() =>
          popupModuleEntitySearchElement.focus({
            preventScroll: true,
          }),
        )));
  }),
  popupModuleEntitySearchElement.addEventListener("input", () => renderPopupModuleEntityOptions()),
  popupModuleEntityOptionsElement.addEventListener("click", (readEditorViewportScale: any) => {
    const popupModuleEntityElementElement = readEditorViewportScale.target.closest(
      "[data-popup-module-entity-id]",
    );
    popupModuleEntityElementElement &&
      ((popupModuleFormElement.elements.entityId.value =
        popupModuleEntityElementElement.dataset.popupModuleEntityId),
      initialPopupId(),
      closePopupModuleEntityMenu());
  }),
  popupModuleClimateDeviceTypeElement.addEventListener(
    "click",
    (climateDeviceTypeClickEventValue: any) => {
      const climateDeviceTypeElementElement = climateDeviceTypeClickEventValue.target.closest(
        "[data-popup-module-device-type]",
      );
      !climateDeviceTypeElementElement ||
        popupModuleFormElement.elements.type.value !== "climate" ||
        syncPopupModuleClimateDeviceType(climateDeviceTypeElementElement.dataset.popupModuleDeviceType);
    },
  ),
  popupModuleFormElement.elements.type.addEventListener("change", () => {
    (syncPopupModuleClimateDeviceType(), popupModuleEntityOptionsElement.replaceChildren());
  }),
  popupModuleFormElement.addEventListener("submit", (readEditorLayoutMetrics: any) => {
    readEditorLayoutMetrics.preventDefault();
    const ce4 = editorCtx.selectedPopupId,
      popupModuleTypeKey = popupModuleFormElement.elements.type.value,
      shellWidth = popupModuleFormElement.elements.entityId.value,
      popupModuleTitleValue = popupModuleFormElement.elements.title.value.trim(),
      popupModuleDeviceTypeValue = normalizedPopupClimateDeviceType2(
        popupModuleFormElement.elements.deviceType.value,
      );
    if (!ce4 || !shellWidth) return;
    const columnGapWidth = findCustomPopup2(editorCtx.activeProject?.document, editorCtx.selectedPopupId),
      popupModuleDraftEntryState = {
        id: editorCtx.selectedPopupModuleId || "candidate",
        type: popupModuleTypeKey,
        entityId: shellWidth,
        ...(popupModuleTitleValue
          ? {
              title: popupModuleTitleValue,
            }
          : {}),
        ...(popupModuleTypeKey === "climate"
          ? {
              properties: {
                deviceType: popupModuleDeviceTypeValue,
              },
            }
          : {}),
      },
      overheadWidth = editorCtx.selectedPopupModuleId
        ? (columnGapWidth?.modules || []).map((mappedItemsFactor: any) =>
            mappedItemsFactor.id === editorCtx.selectedPopupModuleId
              ? {
                  ...mappedItemsFactor,
                  ...popupModuleDraftEntryState,
                }
              : mappedItemsFactor,
          )
        : [...(columnGapWidth?.modules || []), popupModuleDraftEntryState];
    if (!columnGapWidth || !packPopupModules2(overheadWidth, columnGapWidth.layout).fits) {
      handleOperationError(new Error("当前布局已超过 3 行，可增加列数或删除其它模块。"));
      return;
    }
    (closePopupModuleEntityMenu(),
      popupModuleDialogElement.close(),
      mutateDocument((popupModulePopupMatchState: any) => {
        const popupModuleExisting = (popupModulePopupMatchState.customPopups || []).find(
          (bindDocumentPointerSectionValue: any) => bindDocumentPointerSectionValue.id === ce4,
        );
        if (!popupModuleExisting) return;
        const editorRenderedPanelWidthState = popupModuleExisting.modules.find(
          (editorRenderedPanelWidth: any) => editorRenderedPanelWidth.id === editorCtx.selectedPopupModuleId,
        );
        if (editorRenderedPanelWidthState) {
          if (
            ((editorRenderedPanelWidthState.type = popupModuleTypeKey),
            (editorRenderedPanelWidthState.entityId = shellWidth),
            popupModuleTitleValue
              ? (editorRenderedPanelWidthState.title = popupModuleTitleValue)
              : delete editorRenderedPanelWidthState.title,
            popupModuleTypeKey === "climate")
          )
            editorRenderedPanelWidthState.properties = {
              ...(editorRenderedPanelWidthState.properties || {}),
              deviceType: popupModuleDeviceTypeValue,
            };
          else {
            if (editorRenderedPanelWidthState.properties?.deviceType) {
              const { deviceType: properties, ...properties2 } =
                editorRenderedPanelWidthState.properties;
              Object.keys(properties2).length
                ? (editorRenderedPanelWidthState.properties = properties2)
                : delete editorRenderedPanelWidthState.properties;
            }
          }
          delete editorRenderedPanelWidthState.deviceType;
          return;
        }
        popupModuleExisting.modules.push({
          id: newId2("popup-module"),
          type: popupModuleTypeKey,
          entityId: shellWidth,
          ...(popupModuleTitleValue
            ? {
                title: popupModuleTitleValue,
              }
            : {}),
          ...(popupModuleTypeKey === "climate"
            ? {
                properties: {
                  deviceType: popupModuleDeviceTypeValue,
                },
              }
            : {}),
        });
      }));
  }),
  document.addEventListener("pointerdown", (panelId) => {
    const deleteAssetFolderDialogElement = (panelId.target as Element).closest(
      "#delete-asset-folder-dialog",
    );
    (componentMenuElement.contains(panelId.target) || closeComponentMenu(),
      !deleteAssetFolderDialogElement &&
        editorCtx.openCustomSelect &&
        !editorCtx.openCustomSelect.button.contains(panelId.target) &&
        !editorCtx.openCustomSelect.menu.contains(panelId.target) &&
        closeCustomSelect(),
      (panelId.target as Element).closest(".dashboard-select-row") || errorPhase(),
      (panelId.target as Element).closest(".page-control .page-select-row") || value(),
      !(panelId.target as Element).closest("#popup-list") &&
        !(panelId.target as Element).closest("#popup-actions-menu") &&
        hidePopupActionsMenu(),
      (panelId.target as Element).closest("#popup-module-entity-picker") || closePopupModuleEntityMenu(),
      (panelId.target as Element).closest(".component-popup-entity-picker") || closePopupEntityMenus(),
      (panelId.target as Element).closest("#image-entity-picker") ||
        closePickerMenu(imageEntityMenuElement, imageEntityButtonElement),
      (panelId.target as Element).closest("#weather-entity-picker") ||
        closePickerMenu(weatherEntityMenuElement, weatherEntityButtonElement),
      (panelId.target as Element).closest("#line-chart-entity-picker") ||
        closePickerMenu(lineChartEntityMenuElement, lineChartEntityButtonElement),
      (panelId.target as Element).closest("#ibe-entity-picker") ||
        closePickerMenu(ibeEntityMenuElement, ibeEntityButtonElement),
      (panelId.target as Element).closest("#icon-button-entity-picker") ||
        closePickerMenu(iconButtonEntityMenuElement, iconButtonEntityButtonElement),
      (panelId.target as Element).closest("#vacuum-map-entity-picker") ||
        closePickerMenu(vacuumMapEntityMenuElement, vacuumMapEntityButtonElement),
      (panelId.target as Element).closest("#camera-entity-picker") ||
        closePickerMenu(cameraEntityMenuElement, cameraEntityButtonElement),
      (panelId.target as Element).closest("#air-conditioner-entity-picker") ||
        closePickerMenu(airConditionerEntityMenuElement, airConditionerEntityButtonElement),
      (panelId.target as Element).closest("#title-button-entity-picker") ||
        closePickerMenu(titleButtonEntityMenuElement, titleButtonEntityButtonElement),
      !lightStatisticsEntityMenuElement.hidden &&
        !(panelId.target as Element).closest("#light-statistics-entity-picker") &&
        !lightStatisticsEntityMenuElement.contains(panelId.target) &&
        (closePickerMenu(lightStatisticsEntityMenuElement, lightStatisticsEntityButtonElement),
        clearLightStatisticsSelection()),
      (panelId.target as Element).closest("#light-statistics-action-entity-picker") ||
        closePickerMenu(
          lightStatisticsActionEntityMenuElement,
          lightStatisticsActionEntityButtonElement,
        ),
      (panelId.target as Element).closest("#navigation-entity-picker") ||
        closePickerMenu(navigationEntityMenuElement, navigationEntityButtonElement));
    const panelElement = customSelectsBySelectElement.get(imageAssetFolderSelectElement)?.menu;
    !deleteAssetFolderDialogElement &&
      !(panelId.target as Element).closest("#image-asset-picker") &&
      !panelElement?.contains(panelId.target) &&
      closePickerMenu(imageAssetMenuElement, imageAssetButtonElement);
    const panelWidth = customSelectsBySelectElement.get(ibeAssetFolderElement)?.menu;
    (!deleteAssetFolderDialogElement &&
      !(panelId.target as Element).closest("#ibe-asset-picker") &&
      !panelWidth?.contains(panelId.target) &&
      closePickerMenu(ibeAssetMenuElement, ibeAssetButtonElement),
      !(panelId.target as Element).closest("#ibe-icon-picker") &&
        !ibeIconMenuElement.contains(panelId.target) &&
        closePickerMenu(ibeIconMenuElement, ibeIconButtonElement),
      !(panelId.target as Element).closest("#icon-button-icon-picker") &&
        !iconButtonIconMenuElement.contains(panelId.target) &&
        closePickerMenu(iconButtonIconMenuElement, iconButtonIconButtonElement),
      !(panelId.target as Element).closest("#title-button-icon-picker") &&
        !titleButtonIconMenuElement.contains(panelId.target) &&
        closePickerMenu(titleButtonIconMenuElement, titleButtonIconButtonElement),
      !(panelId.target as Element).closest("#light-statistics-icon-picker") &&
        !lightStatisticsIconMenuElement.contains(panelId.target) &&
        closePickerMenu(lightStatisticsIconMenuElement, lightStatisticsIconButtonElement),
      !(panelId.target as Element).closest("#navigation-icon-picker") &&
        !navigationIconMenuElement.contains(panelId.target) &&
        closePickerMenu(navigationIconMenuElement, navigationIconButtonElement));
  }));
const scaleInputElementsSet = new Set([
  imageScaleInputElement,
  ibeScaleElement,
  titleButtonScaleElement,
  lightStatisticsScaleElement,
  iconButtonScaleElement,
  airConditionerScaleElement,
  vacuumMapScaleElement,
  cameraScaleElement,
  timeScaleElement,
  dateScaleElement,
  weatherScaleElement,
  lineChartScaleInputElement,
  panelFrameScaleInputElement,
  navigationScaleElement,
]);
(document.addEventListener(
  "input",
  (editorPanelLimits) => {
    if (
      editorCtx.selectedComponentIdsSet.size < 2 ||
      !(
        scaleInputElementsSet.has(editorPanelLimits.target) ||
        (editorPanelLimits.target as Element).id === "flow-line-scale"
      )
    )
      return;
    editorPanelLimits.stopPropagation();
    const scaleInputValueValue = Number((editorPanelLimits.target as HTMLInputElement).value);
    if (!Number.isFinite(scaleInputValueValue)) return;
    const scaledPlacementsState = scaledSelectionPlacements(
      clampNumber2(scaleInputValueValue, 1, 500) / 100,
    );
    scaledPlacementsState.length &&
      editorCtx.editorRenderer?.previewComponentsTransform(scaledPlacementsState, editorCtx.selectedComponentId);
  },
  true,
),
  document.addEventListener(
    "change",
    (documentChangeEventValue) => {
      if (
        editorCtx.selectedComponentIdsSet.size < 2 ||
        !(
          scaleInputElementsSet.has(documentChangeEventValue.target) ||
          (documentChangeEventValue.target as Element).id === "flow-line-scale"
        )
      )
        return;
      documentChangeEventValue.stopPropagation();
      const changeInputValueState = Number((documentChangeEventValue.target as HTMLInputElement).value);
      if (!Number.isFinite(changeInputValueState)) {
        coverMotorButtonElement();
        return;
      }
      const selectedComponentIdIndexSet = new Set(editorCtx.selectedComponentIdsSet),
        changedScaledPlacementsState = scaledSelectionPlacements(
          clampNumber2(changeInputValueState, 1, 500) / 100,
        );
      changedScaledPlacementsState.length &&
        mutateDocument((scaleDraftDocumentState: any) => {
          for (const scaledPlacementState of changedScaledPlacementsState) {
            if (!selectedComponentIdIndexSet.has(scaledPlacementState.componentId)) continue;
            const otherPanelId = findComponent2(
              scaleDraftDocumentState,
              scaledPlacementState.componentId,
            )?.component;
            otherPanelId &&
              ((otherPanelId.position = {
                ...(otherPanelId.position || {}),
                x: scaledPlacementState.x,
                y: scaledPlacementState.y,
              }),
              (otherPanelId.style = {
                ...(otherPanelId.style || {}),
                scale: scaledPlacementState.scale,
              }));
          }
        });
    },
    true,
  ),
  document.addEventListener("keydown", (documentKeydownEventState) => {
    const keyboardInteractionTargetElement = (documentKeydownEventState.target as Element).closest(
      'input, textarea, select, button, [contenteditable="true"], dialog',
    );
    const modKey =
      documentKeydownEventState.metaKey || documentKeydownEventState.ctrlKey;
    const keyLower = documentKeydownEventState.key.toLowerCase();

    if (!keyboardInteractionTargetElement && modKey && !documentKeydownEventState.altKey) {
      if (keyLower === "z") {
        documentKeydownEventState.preventDefault();
        void entityLoadError(documentKeydownEventState.shiftKey ? "redo" : "undo");
        return;
      }
      if (keyLower === "y" && !documentKeydownEventState.shiftKey) {
        documentKeydownEventState.preventDefault();
        void entityLoadError("redo");
        return;
      }
      if (keyLower === "s") {
        documentKeydownEventState.preventDefault();
        void saveDraft();
        return;
      }
      if (keyLower === "a" && editorCtx.editorMode === "edit") {
        documentKeydownEventState.preventDefault();
        selectAllPageComponents();
        return;
      }
      if (keyLower === "c" && editorCtx.editorMode === "edit" && editorCtx.selectedComponentIdsSet.size) {
        documentKeydownEventState.preventDefault();
        editorCtx.editorClipboardComponentIds = [...editorCtx.selectedComponentIdsSet];
        return;
      }
      if (keyLower === "v" && editorCtx.editorMode === "edit" && editorCtx.editorClipboardComponentIds.length) {
        documentKeydownEventState.preventDefault();
        duplicateComponents(editorCtx.editorClipboardComponentIds, editorCtx.editorClipboardComponentIds[0]);
        return;
      }
    }

    if (documentKeydownEventState.code === "Space" && !keyboardInteractionTargetElement && !modKey) {
      editorCtx.editorSpacePanning = true;
      documentKeydownEventState.preventDefault();
      return;
    }

    if (editorCtx.editorMode === "edit" && editorCtx.selectedComponentIdsSet.size && !keyboardInteractionTargetElement) {
      if (
        modKey &&
        !documentKeydownEventState.altKey &&
        !documentKeydownEventState.shiftKey &&
        keyLower === "d"
      ) {
        (documentKeydownEventState.preventDefault(),
          duplicateComponents([...editorCtx.selectedComponentIdsSet], editorCtx.selectedComponentId));
        return;
      }
      if (
        !modKey &&
        !documentKeydownEventState.altKey &&
        (documentKeydownEventState.key === "Delete" ||
          documentKeydownEventState.key === "Backspace")
      ) {
        (documentKeydownEventState.preventDefault(),
          deleteComponentIds([...editorCtx.selectedComponentIdsSet]));
        return;
      }
    }
    const arrowKeyDeltas = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    if (
      (arrowKeyDeltas as any)[documentKeydownEventState.key] &&
      editorCtx.editorMode === "edit" &&
      editorCtx.selectedComponentIdsSet.size &&
      !documentKeydownEventState.metaKey &&
      !documentKeydownEventState.ctrlKey &&
      !documentKeydownEventState.altKey &&
      !keyboardInteractionTargetElement
    ) {
      documentKeydownEventState.preventDefault();
      const cssMinWidth = documentKeydownEventState.shiftKey ? 10 : 1,
        [cssMaxWidth, otherMinWidth] = (arrowKeyDeltas as any)[documentKeydownEventState.key];
      nudgeDeltaX(cssMaxWidth * cssMinWidth, otherMinWidth * cssMinWidth);
      return;
    }
    if (documentKeydownEventState.key !== "Enter" || documentKeydownEventState.isComposing) return;
    const enterTargetElementElement = (documentKeydownEventState.target as Element).closest<HTMLElement>(
      'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"])',
    );
    enterTargetElementElement &&
      (documentKeydownEventState.preventDefault(), enterTargetElementElement.blur());
  }),
  document.addEventListener("keyup", (keyupEvent) => {
    if (keyupEvent.code === "Space") editorCtx.editorSpacePanning = false;
  }),
  navigatorElement.addEventListener("scroll", () => {
    (hideAssetLargePreview(),
      refreshImageAssetPickerPreview(),
      resolveAssetPreviewUrl("weather"),
      resolveAssetPreviewUrl("line-chart"),
      resolveAssetPreviewUrl("icon-button-effect"),
      resolveAssetPreviewUrl("icon-button"),
      resolveAssetPreviewUrl("vacuum-map"),
      resolveAssetPreviewUrl("camera"),
      resolveAssetPreviewUrl("air-conditioner"),
      resolveAssetPreviewUrl("title-button"),
      resolveAssetPreviewUrl("light-statistics"),
      positionLightStatisticsEntityMenu(),
      positionImageAssetMenu(),
      positionEffectAssetMenu(),
      positionIbeIconMenu(),
      positionIconButtonIconMenu(),
      layoutTitleButtonIconMenu(),
      positionLightStatisticsIconMenu(),
      positionNavigationIconMenu(),
      closeDropdownMenu());
    for (const invalidateEditorLayoutMetricsElementElement of document.querySelectorAll(
      "[data-popup-entity-menu]:not([hidden])",
    ))
      positionPopupEntityMenu(
        invalidateEditorLayoutMetricsElementElement.closest("[data-action-trigger]"),
      );
  }),
  window.addEventListener("resize", () => {
    (refreshEditorViewportFit(),
      refreshComponentDialogScale(),
      closeComponentMenu(),
      closeCustomSelect(),
      closeOtherPickerMenus(),
      closePopupEntityMenus(),
      closeDropdownMenu());
  }),
  saveButtonElement.addEventListener("click", async () => {
    const otherWidth = editorCtx.activeProject?.projectId,
      Ie8 = editorCtx.componentScopeState;
    (await editorCtx.writeQueuePromise.catch(() => {}),
      !(editorCtx.componentScopeState !== Ie8 || editorCtx.activeProject?.projectId !== otherWidth) &&
        (await saveDraft()));
  }),
  selectableEntities(),
  destroyDashboardPreview(document),
  formatLastSeen(document));
const entryStateHandler = (pointerEvent: any) => {
  const targetBoundsName = globalColorPickerSvElement.getBoundingClientRect();
  ((editorCtx.colorPickerSaturation = clampNumber2(
    (pointerEvent.clientX - targetBoundsName.left) / Math.max(1, targetBoundsName.width),
    0,
    1,
  )),
    (editorCtx.colorPickerBrightness =
      1 -
      clampNumber2(
        (pointerEvent.clientY - targetBoundsName.top) /
          Math.max(1, targetBoundsName.height),
        0,
        1,
      )),
    closeAllDropdownMenus());
};
(globalColorPickerSvElement.addEventListener("pointerdown", (layoutAction: any) => {
  editorCtx.activeColorInputElement &&
    (layoutAction.preventDefault(),
    (editorCtx.colorPickerDragPointerId = layoutAction.pointerId),
    globalColorPickerSvElement.setPointerCapture(layoutAction.pointerId),
    entryStateHandler(layoutAction));
}),
  globalColorPickerSvElement.addEventListener("pointermove", (onEditorLayoutWindowResize: any) => {
    onEditorLayoutWindowResize.pointerId === editorCtx.colorPickerDragPointerId &&
      entryStateHandler(onEditorLayoutWindowResize);
  }),
  globalColorPickerSvElement.addEventListener("pointerup", (bindInspectorScrollSection: any) => {
    bindInspectorScrollSection.pointerId === editorCtx.colorPickerDragPointerId &&
      ((editorCtx.colorPickerDragPointerId = null),
      globalColorPickerSvElement.releasePointerCapture(bindInspectorScrollSection.pointerId));
  }),
  globalColorPickerHueRangeInputElement.addEventListener("input", () => {
    editorCtx.activeColorInputElement &&
      ((editorCtx.colorPickerHue = clampNumber2(Number(globalColorPickerHueRangeInputElement.value), 0, 360)),
      closeAllDropdownMenus());
  }),
  globalColorPickerHexTextInputElement.addEventListener("input", () => {
    const rawValueState = normalizedHexColor2(globalColorPickerHexTextInputElement.value);
    rawValueState && openEntityPicker(rawValueState, true);
  }),
  globalColorPickerHexTextInputElement.addEventListener("change", () => {
    const numericValueState = normalizedHexColor2(globalColorPickerHexTextInputElement.value);
    numericValueState
      ? openEntityPicker(numericValueState, true)
      : editorCtx.activeColorInputElement &&
        (globalColorPickerHexTextInputElement.value = String(
          editorCtx.activeColorInputElement.value || "",
        ).toUpperCase());
  }));
const readEditorLayoutMetricsHandler = () => {
  if (!editorCtx.activeColorInputElement) return;
  const shellWidthState = clampNumber2(Number(globalColorPickerRedInputElement.value), 0, 255),
    columnGapWidthState = clampNumber2(Number(globalColorPickerGreenInputElement.value), 0, 255),
    overheadWidthState = clampNumber2(Number(globalColorPickerBlueInputElement.value), 0, 255);
  [shellWidthState, columnGapWidthState, overheadWidthState].every(Number.isFinite) &&
    openEntityPicker(rgbToHex2(shellWidthState, columnGapWidthState, overheadWidthState), true);
};
for (const onInspectorScroll of [
  globalColorPickerRedInputElement,
  globalColorPickerGreenInputElement,
  globalColorPickerBlueInputElement,
])
  (onInspectorScroll.addEventListener("input", readEditorLayoutMetricsHandler),
    onInspectorScroll.addEventListener("change", readEditorLayoutMetricsHandler));
(globalColorPickerCopyButtonElement.addEventListener("click", async () => {
  if (editorCtx.activeColorInputElement)
    try {
      (await copyTextToClipboard(String(editorCtx.activeColorInputElement.value || "").toUpperCase()),
        window.clearTimeout(editorCtx.colorPickerCopyResetTimer),
        globalColorPickerCopyButtonElement.classList.add("copied"),
        (editorCtx.colorPickerCopyResetTimer = window.setTimeout(
          () => globalColorPickerCopyButtonElement.classList.remove("copied"),
          1200,
        )));
    } catch (popupEntityScrollMenuElement: any) {
      handleOperationError(popupEntityScrollMenuElement);
    }
}),
  globalColorPickerPasteButtonElement.addEventListener("click", async () => {
    if (editorCtx.activeColorInputElement)
      try {
        const panelElementState = await navigator.clipboard.readText(),
          panelWidthState = normalizedHexColor2(panelElementState);
        if (!panelWidthState) throw new Error("剪贴板中没有可用的十六进制颜色值。");
        ((globalColorPickerHexTextInputElement.value = panelWidthState.toUpperCase()),
          openEntityPicker(panelWidthState, true),
          globalColorPickerPasteButtonElement.classList.add("copied"),
          window.setTimeout(
            () => globalColorPickerPasteButtonElement.classList.remove("copied"),
            1200,
          ));
      } catch (onWindowResize: any) {
        handleOperationError(onWindowResize);
      }
  }),
  document.addEventListener(
    "click",
    (onSaveButtonClick) => {
      const metricsElement = (onSaveButtonClick.target as Element).closest("button");
      if (!metricsElement) return;
      let isNavigator = false;
      ([
        navigationIconButtonElement,
        ibeIconButtonElement,
        iconButtonIconButtonElement,
        titleButtonIconButtonElement,
        lightStatisticsIconButtonElement,
      ].includes(metricsElement)
        ? (isNavigator = onPopupListContextmenu(metricsElement))
        : metricsElement === lightStatisticsEntityButtonElement
          ? (isNavigator = openLightStatisticsCopyBackupPicker())
          : metricsElement.matches("[data-popup-entity-button]")
            ? (isNavigator = openPopupEntityCopyBackupPicker(metricsElement))
            : metricsElement === popupModuleEntityButtonElement
              ? (isNavigator = onPopupModuleCancelButtonClick())
              : [imageAssetButtonElement, ibeAssetButtonElement].includes(metricsElement)
                ? (isNavigator = onPopupModuleClimateDeviceTypeClick(metricsElement))
                : (isNavigator = openEntityCopyBackupPicker(metricsElement)),
        isNavigator &&
          (onSaveButtonClick.preventDefault(), onSaveButtonClick.stopImmediatePropagation()));
    },
    true,
  ),
  document.addEventListener("pointerdown", (onDisplayDevicesCloseButtonClick) => {
    globalColorPickerElement.hidden ||
      globalColorPickerElement.contains(onDisplayDevicesCloseButtonClick.target) ||
      onDisplayDevicesCloseButtonClick.target === editorCtx.activeColorInputElement ||
      setWorkspaceHasProject();
  }),
  (editorBodyObserver = new MutationObserver((records) => {
    for (const record of records)
      for (const node of record.addedNodes)
        node instanceof HTMLElement &&
          (selectableEntities(node),
          destroyDashboardPreview(node),
          formatLastSeen(node));
  })).observe(
    // 观察范围收敛到编辑器根节点：原来监听整个 document.body 的 subtree 插入，
    // 任何全局浮层 / toast / 图表插入都会触发这轮 DOM 处理。
    editorRootElement instanceof HTMLElement ? editorRootElement : document.body,
    {
      childList: true,
      subtree: true,
    },
  ),
  deferHiddenEditorDialogs2(),
  setEditorMode("edit"),
  // 统一走 poll-scheduler：页面隐藏时暂停、可见时立刻补跑一次，且与全站共享同一个刻度
  // 定时器（原来两个 setInterval 在后台标签页里也照常唤醒主线程并各发一次请求）。
  editorPollCleanups.push(
    schedulePoll("studio-editor-refresh", () => {
      actionDraftDocument().catch(() => {});
      triggerKey().catch(() => {});
    }, 15000),
    schedulePoll("studio-asset-catalog", () => {
      pollAssetCatalogVersion().catch(() => {});
    }, 30000),
  ),
  document.addEventListener("visibilitychange", () => {
    document.visibilityState === "visible" &&
      (actionDraftDocument().catch(() => {}),
      pollAssetCatalogVersion().catch(() => {}),
      triggerKey().catch(() => {}));
  }  ),
  // 页面恢复可见时的补跑已由 poll-scheduler 统一处理（可见即刻执行一次），
  // 这里不再重复注册，避免同一次切回标签页发两遍请求。
  Promise.all([
    reuseTokenForNewUrl(),
    triggerKey(),
    actionDraftDocument(),
    initialPagePath(),
    reloadAssetCatalog(),
    ensureEntitiesLoaded(),
  ])
    .then(() => renderComponentLists())
    .catch(handleOperationError));


  registerEditorCommandHandler((command) => {
    switch (command.type) {
      case "undo":
        void entityLoadError("undo");
        break;
      case "redo":
        void entityLoadError("redo");
        break;
      case "save":
        void saveDraft();
        break;
      case "selectAll":
        selectAllPageComponents();
        break;
      case "copy":
        editorCtx.editorClipboardComponentIds = [...editorCtx.selectedComponentIdsSet];
        break;
      case "paste":
        if (editorCtx.editorClipboardComponentIds.length) {
          duplicateComponents(editorCtx.editorClipboardComponentIds, editorCtx.editorClipboardComponentIds[0]);
        }
        break;
      case "delete":
        if (editorCtx.selectedComponentIdsSet.size) {
          deleteComponentIds([...editorCtx.selectedComponentIdsSet]);
        }
        break;
      case "setZoom":
        applyEditorCanvasZoom(command.zoom);
        break;
      case "fitZoom":
        applyEditorCanvasZoom(1);
        break;
      case "setLeftCollapsed":
        document.querySelector(".editor-chrome-root")?.classList.toggle(
          "sc-shell--left-collapsed",
          !!command.collapsed,
        );
        patchEditorFacadeState({ leftCollapsed: !!command.collapsed });
        window.dispatchEvent(new Event("resize"));
        break;
      case "setRightCollapsed":
        document.querySelector(".editor-chrome-root")?.classList.toggle(
          "sc-shell--right-collapsed",
          !!command.collapsed,
        );
        patchEditorFacadeState({ rightCollapsed: !!command.collapsed });
        window.dispatchEvent(new Event("resize"));
        break;
      case "openFloorplan":
        navigateInShell("/3d-studio");
        break;
      case "align":
        alignSelectedComponents(command.mode);
        break;
      default:
        break;
    }
  });
  syncHistoryButtons();

  // ── 显式回收：需要访问引导体内作用域的资源 ──────────────────────────────
  return () => {
    registerEditorCommandHandler(null);
    // 引导期注册的轮询与 DOM 观察者：不释放会在切走后继续唤醒主线程。
    for (const disposePoll of editorPollCleanups.splice(0)) {
      try {
        disposePoll()
      } catch { /* 清理期失败无需处理：调度器可能已重置，继续走后续清理 */ }
    }
    try {
      editorBodyObserver?.disconnect?.()
    } catch { /* 清理期失败无需处理：观察者可能已断开，继续走后续清理 */ }
    editorBodyObserver = null
    // 3D 渲染器：负责释放 WebGL 上下文、渲染循环、WebSocket 与所有运行时监听
    try {
      editorCtx.editorRenderer?.destroy?.()
    } catch { /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */ }
    editorCtx.editorRenderer = null
    // 画布尺寸观察者与文档级定尺残留
    try {
      workspaceResizeObserver?.disconnect?.()
    } catch { /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */ }
    document.documentElement.classList.remove('editor-viewport-fit')
    document.documentElement.style.removeProperty('--editor-layout-height')
    document.documentElement.style.removeProperty('--editor-viewport-scale')
  };
  });

  disposeActiveEditor = () => {
    try {
      innerCleanup?.();
    } finally {
      // 无论显式回收是否成功，登记过的全局监听/定时器/观察器都必须释放
      scope.dispose();
      resetEditorFacade();
    }
  };
}

/** 回收仪表盘编辑器（`/studio/editor`）：释放渲染器、观察者与引导期登记的全局副作用。 */
export function teardownEditor(): void {
  const dispose = disposeActiveEditor;
  disposeActiveEditor = null;
  dispose?.();
}
