import { DEFAULT_PERSPECTIVE_CORNERS } from "./metadata/editor-perspective-constants";
import {
  applyFlowLineStyle as applyFlowLineStyle2,
} from "../shared/flow-line-model";
import {
  applyPercentageBarChange as applyPercentageBarChange2,
  percentageBarDefaults as percentageBarDefaults2,
} from "../shared/percentage-bar-model";




import {
  createComponentFromTemplate as createComponentFromTemplate2,
} from "./component-templates";
import {
  clone as clone2,
  newId as newId2,
  normalizedHexColor as normalizedHexColor2,
  rgbToHex as rgbToHex2,
  clampNumber as clampNumber2,
} from "./editor-utils";
// 3/6 位校验 + 非法回落黑（原 studio 副本不校验输入，非法值产 NaN 通道，已删）
import {
  packPopupModules as packPopupModules2,
} from "../shared/popup-layout";
import {
  countComponentsOutsideCanvas as countComponentsOutsideCanvas2,
  resizeDashboardDocument as resizeDashboardDocument2,
} from "./dashboard-resize";
import {
  copyComponentsAcrossDocuments as copyComponentsAcrossDocuments2,
  copyComponentsToTarget as copyComponentsToTarget2,
} from "./component-page-copy";
import {
  manualRelatedEntityConfig as manualRelatedEntityConfig2,
  relatedPopupContext as relatedPopupContext2,
} from "../shared/related-entities";
import { createButtonSound as createButtonSound2 } from "../shared/sound-effects";
import {
  deferHiddenEditorDialogs as deferHiddenEditorDialogs2,
  installSettingsDialogBackdropGuard as installSettingsDialogBackdropGuard2,
} from "./editor-dialogs";
import { createEditorPickerElements as createEditorPickerElements2 } from "./picker/editor-picker-elements";


import { createEditorPickerQueries as createEditorPickerQueries2 } from "./picker/editor-picker-queries";
import { createEditorAssetMatcher as createEditorAssetMatcher2 } from "./picker/editor-asset-queries";
import { createEditorPickerLifecycle as createEditorPickerLifecycle2 } from "./picker/editor-picker-lifecycle";
import { createInteraction3dEditorPickers as createInteraction3dEditorPickers2 } from "../bridge/pickers/editor-pickers";


import { createEditorAssetToolbar as createEditorAssetToolbar2 } from "./picker/editor-asset-toolbar";
import {
  actionNeedsCurrentEntity as actionNeedsCurrentEntity2,
} from "../shared/action-rules";
import {
  findComponent as findComponent2,
  findComponentInItems as findComponentInItems2,
  findComponentLocation as findComponentLocation2,
} from "./component-tree";
import {
  applyCollectionLayerOrder as applyCollectionLayerOrder2,
  componentLabel as componentLabel2,
  nextTemplateInstanceName as nextTemplateInstanceName2,
  syncSharedComponentReferenceOrder as syncSharedComponentReferenceOrder2,
} from "./editor-component-collections";


import {
  clonePageWithFreshIds as clonePageWithFreshIds2,
  findCustomPopup as findCustomPopup2,
  normalizedPopupClimateDeviceType as normalizedPopupClimateDeviceType2,
  uniquePagePath as uniquePagePath2,
} from "./editor-document-management";
import {
  createRecoveryWriter as createRecoveryWriter2,
} from "./editor-history";
import {
  DEFAULT_BASE_LIGHTING as DEFAULT_BASE_LIGHTING2,
  normalizeBaseLighting as normalizeBaseLighting2,
} from "../3d-studio/loaders/studio-normalization";
import { floorplanAutoDiagramExportResolution as floorplanAutoDiagramExportResolution2 } from "./floorplan-auto-diagram-layout";


import { createLegacyScope } from '@/studio/platform/legacy-scope';
import { navigateInShell } from '@/studio/platform/shell-navigation';
import {
  patchEditorFacadeState,
  registerEditorCommandHandler,
  resetEditorFacade,
} from '../../engine';
import { setupEventLogWallInspector } from "./home-event-log-wall";
import { setupPanelFrameInspector } from "./home-panel-frame";
import {
  type IconButtonInspectorContext,
} from "./home-icon-button-inspector";
import {
  type NavigationInspectorContext,
} from "./home-navigation-inspector";
import {
  type LineChartInspectorContext,
} from "./home-line-chart-inspector";
import {
  type AirConditionerInspectorContext,
} from "./home-air-conditioner-inspector";


import { setupRelatedPopup } from "./home-related-popup";


import {
  clientPointToCanvas,
  normalizeMarquee,
  pickComponentsInMarquee,
} from './editor-selection-tools';
import { removeComponent } from "./editor-component-collections";
import { createDateTimeWeatherLineChartInputTables } from "./metadata/date-weather-linechart-input-tables";
import { createNavigationInputTables } from "./metadata/navigation-input-tables";


import { createEffectPreviewInputTables } from "./metadata/effect-preview-input-tables";
import { createInspectorSubmitTables } from "./metadata/inspector-submit-tables";
import { createExportSpliceTables } from "./metadata/export-splice-tables";
import { attachDateInspectorSubmit } from "./bindings/date-inspector-submit";
import { attachDocumentEntityPickerDismiss } from "./bindings/document-entity-picker-dismiss";
import { attachLineChartInspectorInput } from "./bindings/line-chart-inspector-input";
import { attachNavigationInspectorInput } from "./bindings/navigation-inspector-input";
import { attachFloorplanDiagramInspectorInput } from "./bindings/floorplan-diagram-inspector-input";
import { attachPageshowDiagramPreviewRestore } from "./bindings/pageshow-diagram-preview-restore";
import { createEditorContext } from "./home/editor-context";

import { queryEditorElements } from "./home/elements/editor-elements";
import { refreshEditorViewportFit as refreshEditorViewportFitImpl, refreshComponentDialogScale as refreshComponentDialogScaleImpl, refreshSoundToggle as refreshSoundToggleImpl, syncIconButtonInspector as syncIconButtonInspectorImpl, syncNavigationInspector as syncNavigationInspectorImpl, syncLineChartInspector as syncLineChartInspectorImpl, syncAirConditionerInspector as syncAirConditionerInspectorImpl, requestJson as requestJsonImpl, formatLastSeen as formatLastSeenImpl, setSettingsMessage as setSettingsMessageImpl, handleOperationError as handleOperationErrorImpl, errorPhase as errorPhaseImpl, value as valueImpl, hidePopupActionsMenu as hidePopupActionsMenuImpl, closeCustomSelect as closeCustomSelectImpl, positionCustomSelectMenu as positionCustomSelectMenuImpl, selectableEntities as selectableEntitiesImpl, openEntityPicker as openEntityPickerImpl, closeAllDropdownMenus as closeAllDropdownMenusImpl, closeDropdownMenu as closeDropdownMenuImpl, openColorPickerForInput as openColorPickerForInputImpl, setWorkspaceHasProject as setWorkspaceHasProjectImpl, hasActiveProject as hasActiveProjectImpl, destroyDashboardPreview as destroyDashboardPreviewImpl, syncWorkspaceEmptyState as syncWorkspaceEmptyStateImpl, type ShellControlsDeps } from "./home/functions/shell-controls";
import { destroyDashboardPreviewRenderer as destroyDashboardPreviewRendererImpl, renderDashboardPreview as renderDashboardPreviewImpl, unbindDisplayDeviceError as unbindDisplayDeviceErrorImpl, renderWorkspaceResolution as renderWorkspaceResolutionImpl, setEditorMode as setEditorModeImpl, syncDefaultPageAction as syncDefaultPageActionImpl, setPageControlsEnabled as setPageControlsEnabledImpl, resizeWorkspaceCanvas as resizeWorkspaceCanvasImpl, ensureMarqueeOverlay as ensureMarqueeOverlayImpl, currentPage as currentPageImpl, groupSelectedComponents as groupSelectedComponentsImpl, ungroupComponent as ungroupComponentImpl, openGroupRenameDialog as openGroupRenameDialogImpl, normalizeHexColor as normalizeHexColorImpl, removedComponent as removedComponentImpl, removalPageEntry as removalPageEntryImpl, componentListForScope as componentListForScopeImpl, collectComponentsByType as collectComponentsByTypeImpl, findPageComponentsByType as findPageComponentsByTypeImpl, findReplaceableComponents as findReplaceableComponentsImpl, syncRendererSelection as syncRendererSelectionImpl, clearComponentSelection as clearComponentSelectionImpl, resetPreviewStates as resetPreviewStatesImpl, selectComponent as selectComponentImpl, mutateDocument as mutateDocumentImpl, type WorkspaceDocumentDeps } from "./home/functions/workspace-document";
import { scaledSelectionPlacements as scaledSelectionPlacementsImpl, selectedComponentIdsFromDom as selectedComponentIdsFromDomImpl, setComponentsRotation as setComponentsRotationImpl, setComponentsVisibility as setComponentsVisibilityImpl, closeComponentMenu as closeComponentMenuImpl, openComponentMenu as openComponentMenuImpl, findCommonCopyTargets as findCommonCopyTargetsImpl, showCopySuccessDialog as showCopySuccessDialogImpl, handleCopySuccessConfirm as handleCopySuccessConfirmImpl, duplicateComponents as duplicateComponentsImpl, copyTargetsForDocument as copyTargetsForDocumentImpl, renderCopyTargetOptions as renderCopyTargetOptionsImpl, getDocumentCanvasSize as getDocumentCanvasSizeImpl, renderCopyScaleOptions as renderCopyScaleOptionsImpl, renderCopyComponentDialog as renderCopyComponentDialogImpl, openCopyComponentDialog as openCopyComponentDialogImpl, deleteComponentIds as deleteComponentIdsImpl, setComponentsLabelColor as setComponentsLabelColorImpl, renderComponentList as renderComponentListImpl, prependGroupBackButton as prependGroupBackButtonImpl, renderComponentLists as renderComponentListsImpl, setComponentScope as setComponentScopeImpl, syncAddComponentButton as syncAddComponentButtonImpl, renderComponentTemplates as renderComponentTemplatesImpl, renderNavigationIconPreview as renderNavigationIconPreviewImpl, type ComponentEditingDeps } from "./home/functions/component-editing";
import { describeEntityDomain as describeEntityDomainImpl, normalizeWhitespace as normalizeWhitespaceImpl, navigationIconValue as navigationIconValueImpl, resolveEntityDisplayName as resolveEntityDisplayNameImpl, formatEntityLabel as formatEntityLabelImpl, formatEntitySummary as formatEntitySummaryImpl, collectEntityIds as collectEntityIdsImpl, describeEntityState as describeEntityStateImpl, showLightStatisticsMessage as showLightStatisticsMessageImpl, clearLightStatisticsSelection as clearLightStatisticsSelectionImpl, renderLightStatisticsEntityOptions as renderLightStatisticsEntityOptionsImpl, addLightStatisticsEntity as addLightStatisticsEntityImpl, effectIconName as effectIconNameImpl, removeLightStatisticsEntityAt as removeLightStatisticsEntityAtImpl, renderLightStatisticsEntityList as renderLightStatisticsEntityListImpl, flattenComponentTree as flattenComponentTreeImpl, collectPageComponents as collectPageComponentsImpl, findIconVisibilityVirtualEntity as findIconVisibilityVirtualEntityImpl, resolveEntityCatalog as resolveEntityCatalogImpl, registerOverflowScrollPreviewRow as registerOverflowScrollPreviewRowImpl, resolveOverflowScrollPreviewContainer as resolveOverflowScrollPreviewContainerImpl, findEnclosingScrollPreviewRow as findEnclosingScrollPreviewRowImpl, stopOverflowScrollAnimation as stopOverflowScrollAnimationImpl, ensureInspectorPickerValueSpan as ensureInspectorPickerValueSpanImpl, setPickerButtonLabel as setPickerButtonLabelImpl, type EntityLabelsDeps } from "./home/functions/entity-labels";
import { closePickerMenu as closePickerMenuImpl, closeOtherPickerMenus as closeOtherPickerMenusImpl, resolveMdiIconUrl as resolveMdiIconUrlImpl, renderNavigationIconButton as renderNavigationIconButtonImpl, renderTitleButtonIconPreview as renderTitleButtonIconPreviewImpl, renderEntityIconButtonPreview as renderEntityIconButtonPreviewImpl, renderLightStatisticsIconPreview as renderLightStatisticsIconPreviewImpl, renderLightStatisticsButtonIcon as renderLightStatisticsButtonIconImpl, copyTextToClipboard as copyTextToClipboardImpl, enhanceEntityCopyButton as enhanceEntityCopyButtonImpl, enhanceEntityCopyButtons as enhanceEntityCopyButtonsImpl, ensureIconListPaginationState as ensureIconListPaginationStateImpl, hideIconNameTooltip as hideIconNameTooltipImpl, showIconNameTooltip as showIconNameTooltipImpl, bindIconNameTooltipEvents as bindIconNameTooltipEventsImpl, bindIconListInfiniteScroll as bindIconListInfiniteScrollImpl, iconTooltipElementCount as iconTooltipElementCountImpl, iconTooltipElementFlag as iconTooltipElementFlagImpl, iconTooltipElementStep as iconTooltipElementStepImpl, iconTooltipElementStore as iconTooltipElementStoreImpl, iconTooltipElementBuffer as iconTooltipElementBufferImpl, positionNavigationIconMenu as positionNavigationIconMenuImpl, positionIbeIconMenu as positionIbeIconMenuImpl, positionIconButtonIconMenu as positionIconButtonIconMenuImpl, layoutTitleButtonIconMenu as layoutTitleButtonIconMenuImpl, type IconPickersDeps } from "./home/functions/icon-pickers";
import { positionLightStatisticsIconMenu as positionLightStatisticsIconMenuImpl, positionLightStatisticsEntityMenu as positionLightStatisticsEntityMenuImpl, resolveEntityPickerConfig as resolveEntityPickerConfigImpl, renderRelatedPopupEntityOptions as renderRelatedPopupEntityOptionsImpl, syncPopupEntityPickerButton as syncPopupEntityPickerButtonImpl, resolveAssetPreviewUrl as resolveAssetPreviewUrlImpl, refreshImageAssetPickerPreview as refreshImageAssetPickerPreviewImpl, resolveAssetFileUrl as resolveAssetFileUrlImpl, resolveEffectAssetUrl as resolveEffectAssetUrlImpl, assetMatchesId as assetMatchesIdImpl, allAssets as allAssetsImpl, findAssetById as findAssetByIdImpl, assetDisplayName as assetDisplayNameImpl, exportedAssetsInFolder as exportedAssetsInFolderImpl, canDeleteAssetFolder as canDeleteAssetFolderImpl, syncAssetFolderOptions as syncAssetFolderOptionsImpl, leftFolderName as leftFolderNameImpl, measureAssetImageSize as measureAssetImageSizeImpl, applyAssetNaturalSize as applyAssetNaturalSizeImpl, readEffectNaturalSize as readEffectNaturalSizeImpl, probeAssetNaturalSize as probeAssetNaturalSizeImpl, positionImageAssetMenu as positionImageAssetMenuImpl, positionAssetLargePreview as positionAssetLargePreviewImpl, scheduleAssetPreview as scheduleAssetPreviewImpl, hideAssetLargePreview as hideAssetLargePreviewImpl, type AssetPickerDeps } from "./home/functions/asset-picker";
import { createAssetOptionButton as createAssetOptionButtonImpl, renderImageAssetOptions as renderImageAssetOptionsImpl, syncImageAssetSelection as syncImageAssetSelectionImpl, positionEffectAssetMenu as positionEffectAssetMenuImpl, renderEffectAssetOptions as renderEffectAssetOptionsImpl, syncEffectAssetSelection as syncEffectAssetSelectionImpl, assignActionControlIds as assignActionControlIdsImpl, initActionPopupConfig as initActionPopupConfigImpl, closePopupEntityMenus as closePopupEntityMenusImpl, syncPopupEntityButton as syncPopupEntityButtonImpl, renderPopupEntityOptions as renderPopupEntityOptionsImpl, positionPopupEntityMenu as positionPopupEntityMenuImpl, timeFitComponent as timeFitComponentImpl, renderTimeInspector as renderTimeInspectorImpl, weatherProperties as weatherPropertiesImpl, fitWeatherComponentToDimensions as fitWeatherComponentToDimensionsImpl, entitiesByEntityId as entitiesByEntityIdImpl, devicesByDeviceId as devicesByDeviceIdImpl, buildCustomPopupEditorContext as buildCustomPopupEditorContextImpl, renderCustomPopupEditor as renderCustomPopupEditorImpl, syncCustomPopupStage as syncCustomPopupStageImpl, buildTimeInspectorContext as buildTimeInspectorContextImpl, syncTimeInspector as syncTimeInspectorImpl, buildWeatherInspectorContext as buildWeatherInspectorContextImpl, syncWeatherInspector as syncWeatherInspectorImpl, type PopupInspectorsDeps } from "./home/functions/popup-inspectors";
import { buildTitleButtonInspectorContext as buildTitleButtonInspectorContextImpl, syncTitleButtonInspector as syncTitleButtonInspectorImpl, buildLightStatisticsInspectorContext as buildLightStatisticsInspectorContextImpl, syncLightStatisticsInspector as syncLightStatisticsInspectorImpl, buildCameraInspectorContext as buildCameraInspectorContextImpl, syncCameraInspector as syncCameraInspectorImpl, buildVacuumMapInspectorContext as buildVacuumMapInspectorContextImpl, syncVacuumMapInspector as syncVacuumMapInspectorImpl, buildCoverMotorInspectorContext as buildCoverMotorInspectorContextImpl, coverMotorButtonElement as coverMotorButtonElementImpl, computeCoverMotorStyleChanges as computeCoverMotorStyleChangesImpl, reloadAssetCatalog as reloadAssetCatalogImpl, pollAssetCatalogVersion as pollAssetCatalogVersionImpl, ensureEntitiesLoaded as ensureEntitiesLoadedImpl, renderCustomPopupSelector as renderCustomPopupSelectorImpl, syncPopupEntityInputs as syncPopupEntityInputsImpl, syncPopupModuleClimateDeviceType as syncPopupModuleClimateDeviceTypeImpl, deviceNameValue as deviceNameValueImpl, initialPopupId as initialPopupIdImpl, renderPopupModuleEntityOptions as renderPopupModuleEntityOptionsImpl, closePopupModuleEntityMenu as closePopupModuleEntityMenuImpl, openPopupModuleDialog as openPopupModuleDialogImpl, renderPageSelect as renderPageSelectImpl, retainExistingSelection as retainExistingSelectionImpl, collectChangedComponents as collectChangedComponentsImpl, type InspectorContextsDeps } from "./home/functions/inspector-contexts";
import { collectPageComponentBounds as collectPageComponentBoundsImpl, alignSelectedComponents as alignSelectedComponentsImpl, ensureEditorRenderer as ensureEditorRendererImpl, renderEditorWorkspace as renderEditorWorkspaceImpl, syncHistoryButtons as syncHistoryButtonsImpl, applyEditorCanvasZoom as applyEditorCanvasZoomImpl, selectAllPageComponents as selectAllPageComponentsImpl, discardRecoverySnapshot as discardRecoverySnapshotImpl, readRecoverySnapshot as readRecoverySnapshotImpl, scheduleRecoverySnapshot as scheduleRecoverySnapshotImpl, persistRecoverySnapshot as persistRecoverySnapshotImpl, writeError as writeErrorImpl, resetHistoryState as resetHistoryStateImpl, refreshDirtyState as refreshDirtyStateImpl, historyEntries as historyEntriesImpl, historyEntry as historyEntryImpl, initialPagePath as initialPagePathImpl, projectSummary as projectSummaryImpl, recoverDraftConflict as recoverDraftConflictImpl, saveDraft as saveDraftImpl, interaction3dEntryActive as interaction3dEntryActiveImpl, loadHaConnection as loadHaConnectionImpl, entityLoadError as entityLoadErrorImpl, reuseTokenForNewUrl as reuseTokenForNewUrlImpl, syncAspectLockButton as syncAspectLockButtonImpl, type WorkspaceHistoryDeps } from "./home/functions/workspace-history";
import { actionDraftDocument as actionDraftDocumentImpl, targetPageCandidate as targetPageCandidateImpl, buttonVisibilityDraftDocument as buttonVisibilityDraftDocumentImpl, titleButtonIconOptionClickEvent as titleButtonIconOptionClickEventImpl, titleButtonIconDraftDocument as titleButtonIconDraftDocumentImpl, lightStatisticsIconCopyError as lightStatisticsIconCopyErrorImpl, lightStatisticsEntityListClickEvent as lightStatisticsEntityListClickEventImpl, imageEntityDraftDocument as imageEntityDraftDocumentImpl, openAssetPicker as openAssetPickerImpl, assetIdToDelete as assetIdToDeleteImpl, folderDocumentNode as folderDocumentNodeImpl, closeDeletePopupDialog as closeDeletePopupDialogImpl, documentSource as documentSourceImpl, popupId as popupIdImpl, triggerKey as triggerKeyImpl, findDiagramPreviewFrame as findDiagramPreviewFrameImpl, lightInputElement as lightInputElementImpl, cancelRemovesComponent as cancelRemovesComponentImpl, lightingPayload as lightingPayloadImpl, lightFieldElement as lightFieldElementImpl, openLightingPanel as openLightingPanelImpl, lightInputNode as lightInputNodeImpl, onFloorplanAutoLightingResetButtonClick as onFloorplanAutoLightingResetButtonClickImpl, onFloorplanAutoLightingCloseButtonClick as onFloorplanAutoLightingCloseButtonClickImpl, applyLightingPanelDragMove as applyLightingPanelDragMoveImpl, type LightingPanelDeps } from "./home/functions/lighting-panel";
import { bindFloorplanAutoDiagramControls } from "./home/functions/floorplan-auto-diagram-wiring";
import { closeAutoDiagramDialog as closeAutoDiagramDialogImpl, settleAutoDiagramDialog as settleAutoDiagramDialogImpl, cancelRemoveDraftDocument as cancelRemoveDraftDocumentImpl, bindMessageSection as bindMessageSectionImpl, onWindowMessage as onWindowMessageImpl, exportSpliceError as exportSpliceErrorImpl, collectPageImages as collectPageImagesImpl, createImageAlignOption as createImageAlignOptionImpl, openImageAlignDialog as openImageAlignDialogImpl, applyAirConditionerPreviewState as applyAirConditionerPreviewStateImpl, airflowSectionEvent as airflowSectionEventImpl, previewSyncEventName as previewSyncEventNameImpl, onCoverSettingsKindClick as onCoverSettingsKindClickImpl, coverKindDraftDocument as coverKindDraftDocumentImpl, navigationSavedPropertyKey as navigationSavedPropertyKeyImpl, previewDateResize as previewDateResizeImpl, previewWeatherComponentResize as previewWeatherComponentResizeImpl, setNavigationPreviewState as setNavigationPreviewStateImpl, applyNavigationPreviewState as applyNavigationPreviewStateImpl, syncNavigationPreviewFromElement as syncNavigationPreviewFromElementImpl, navigationPropertyNameFromElement as navigationPropertyNameFromElementImpl, resolveComponentStyleValue as resolveComponentStyleValueImpl, collectChangedLineChartStyleKeys as collectChangedLineChartStyleKeysImpl, formatLineChartStyleValue as formatLineChartStyleValueImpl, resolveNavigationStyleValue as resolveNavigationStyleValueImpl, type NavigationPreviewDeps } from "./home/functions/navigation-preview";
import { collectChangedTitleButtonStyleKeys as collectChangedTitleButtonStyleKeysImpl, onNavigationStyleApplyCancelButtonClick as onNavigationStyleApplyCancelButtonClickImpl, onNavigationStyleApplyConfirmButtonClick as onNavigationStyleApplyConfirmButtonClickImpl, collectChangedAirConditionerStyleKeys as collectChangedAirConditionerStyleKeysImpl, formatAirConditionerStyleValue as formatAirConditionerStyleValueImpl, resolveAirConditionerStyleValue as resolveAirConditionerStyleValueImpl, collectChangedIconButtonEffectStyleKeys as collectChangedIconButtonEffectStyleKeysImpl, formatIconButtonEffectStyleValue as formatIconButtonEffectStyleValueImpl, normalizeSensorKind as normalizeSensorKindImpl, formatSensorKindLabel as formatSensorKindLabelImpl, resolvePresenceSensorStyleKeys as resolvePresenceSensorStyleKeysImpl, styleTargetCheckbox as styleTargetCheckboxImpl, appliedStylePropertyKey as appliedStylePropertyKeyImpl, onNavigationIconCopyButtonClick as onNavigationIconCopyButtonClickImpl, navigationIconCopyError as navigationIconCopyErrorImpl, resolveCameraStyleValue as resolveCameraStyleValueImpl, collectChangedCameraStyleKeys as collectChangedCameraStyleKeysImpl, formatCameraStyleValue as formatCameraStyleValueImpl, resolvePanelFrameStyleValue as resolvePanelFrameStyleValueImpl, collectChangedPanelFrameStyleKeys as collectChangedPanelFrameStyleKeysImpl, formatPanelFrameStyleValue as formatPanelFrameStyleValueImpl, entryStateRecord as entryStateRecordImpl, areStyleValuesEqual as areStyleValuesEqualImpl, onImageAssetUploadButtonClick as onImageAssetUploadButtonClickImpl, onAssetOptionsClick as onAssetOptionsClickImpl, type StyleApplyDeps } from "./home/functions/style-apply";
import { collectPendingNavigationStyleKeys as collectPendingNavigationStyleKeysImpl, onDeleteAssetCancelButtonClick as onDeleteAssetCancelButtonClickImpl, applyNavigationStyleToTargets as applyNavigationStyleToTargetsImpl, openNavigationStyleApplyDialog as openNavigationStyleApplyDialogImpl, onImageAssetFolderSelectChange as onImageAssetFolderSelectChangeImpl, imageAssetPointerOverEvent as imageAssetPointerOverEventImpl, imageAssetClickEvent as imageAssetClickEventImpl, openCameraStyleApplyDialog as openCameraStyleApplyDialogImpl, openTitleButtonStyleApplyDialog as openTitleButtonStyleApplyDialogImpl, openIconButtonEffectStyleApplyDialog as openIconButtonEffectStyleApplyDialogImpl, openAirConditionerStyleApplyDialog as openAirConditionerStyleApplyDialogImpl, openIconButtonStyleApplyDialog as openIconButtonStyleApplyDialogImpl, imageAssetMeasureError as imageAssetMeasureErrorImpl, applyInspectorDimensionChange as applyInspectorDimensionChangeImpl, onIconButtonEffectAssetFolderSelectChange as onIconButtonEffectAssetFolderSelectChangeImpl, applyEffectAssetDimensionChange as applyEffectAssetDimensionChangeImpl, applyCameraDimensionChange as applyCameraDimensionChangeImpl, applyLineChartDimensionChange as applyLineChartDimensionChangeImpl, recoveredComponentId as recoveredComponentIdImpl, onErrorDialogCloseButtonClick as onErrorDialogCloseButtonClickImpl, onShowSharedComponentsButtonClick as onShowSharedComponentsButtonClickImpl, onComponentTemplateDialogClick as onComponentTemplateDialogClickImpl, closePopupRenameDialog as closePopupRenameDialogImpl, createCopyBackupDeps as createCopyBackupDepsImpl, renderCopyBackupDialog as renderCopyBackupDialogImpl, type StyleDialogsDeps } from "./home/functions/style-dialogs";
import { titleButtonMenuDeps as titleButtonMenuDepsImpl, loadNavigationIconOptions as loadNavigationIconOptionsImpl, positionTitleButtonIconMenu as positionTitleButtonIconMenuImpl, stopHoverScroll as stopHoverScrollImpl, iconTooltipElementValue as iconTooltipElementValueImpl, inspectorSyncDeps as inspectorSyncDepsImpl, syncComponentActionControls as syncComponentActionControlsImpl, applyTransformToInspector as applyTransformToInspectorImpl, previewModeForIcon as previewModeForIconImpl, sharedReferenceId as sharedReferenceIdImpl, nudgeDeps as nudgeDepsImpl, nudgeDeltaX as nudgeDeltaXImpl, clickPopupListOption as clickPopupListOptionImpl, onPopupListContextmenu as onPopupListContextmenuImpl, openEntityCopyBackupPicker as openEntityCopyBackupPickerImpl, openLightStatisticsCopyBackupPicker as openLightStatisticsCopyBackupPickerImpl, openPopupEntityCopyBackupPicker as openPopupEntityCopyBackupPickerImpl, onPopupModuleCancelButtonClick as onPopupModuleCancelButtonClickImpl, type CopyBackupPickersDeps } from "./home/functions/copy-backup-pickers";
import { onPopupModuleClimateDeviceTypeClick as onPopupModuleClimateDeviceTypeClickImpl, selectAssetFolder as selectAssetFolderImpl, popupModuleTypeValue as popupModuleTypeValueImpl, requestDeleteUserAsset as requestDeleteUserAssetImpl, requestDeleteAssetFolder as requestDeleteAssetFolderImpl, refreshAssetPickers as refreshAssetPickersImpl, scaleDraftDocument as scaleDraftDocumentImpl, cancelDeletePopupDialog as cancelDeletePopupDialogImpl, onSessionsRevokeOthersConfirmButtonClick as onSessionsRevokeOthersConfirmButtonClickImpl, onGlobalColorPickerHexTextInputInput as onGlobalColorPickerHexTextInputInputImpl, saturationPointerMoveEventState as saturationPointerMoveEventStateImpl, mutationRecord as mutationRecordImpl, type AssetManagementDeps } from "./home/functions/asset-management";
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

// 路由 fade 过渡期间户型页与编辑器会短暂共存；限定在本页根节点内查询，避免撞 id。
  const editorRootElement =
    document.querySelector(".editor-chrome-root") || document;
  const findElement = (selectorState: any) =>
    editorRootElement.querySelector(selectorState);
// 拆分后 deps 工厂会用 ...homeElements 展开；先放稳定空对象，查询完成后原地填充。
const homeElements: any = {};
installSettingsDialogBackdropGuard2();
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
function refreshEditorViewportFit(...args: any[]): ReturnType<typeof refreshEditorViewportFitImpl> { return (refreshEditorViewportFitImpl as any)(shellControlsDeps(), ...args); }
function refreshComponentDialogScale(...args: any[]): ReturnType<typeof refreshComponentDialogScaleImpl> { return (refreshComponentDialogScaleImpl as any)(shellControlsDeps(), ...args); }
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
function refreshSoundToggle(...args: any[]): ReturnType<typeof refreshSoundToggleImpl> { return (refreshSoundToggleImpl as any)(shellControlsDeps(), ...args); }

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
const iconButtonInspectorContext: IconButtonInspectorContext = {
  get activeProject() {
    return editorCtx.activeProject;
  },
  get selectedComponentIdsSet() {
    return editorCtx.selectedComponentIdsSet;
  },
  doorWindowPerspectiveEditIdsSet,
  iconButtonPreviewStateByComponentId,
  get editorRenderer() {
    return editorCtx.editorRenderer;
  },
  findReplaceableComponents,
  appliedStylePropertyKey,
  syncComponentActionControls,
  loadNavigationIconOptions,
  syncPopupEntityPickerButton,
  renderEntityIconButtonPreview,
  iconButtonTypeElement,
  iconButtonTypeLabelElement,
  presenceSensorKindLabelElement,
  presenceSensorKindElement,
  iconButtonMainHeadingElement,
  iconButtonSecondaryHeadingElement,
  iconButtonMainContentLabelElement,
  iconButtonSecondaryContentLabelElement,
  iconButtonMainTextElement,
  iconButtonSecondaryTextElement,
  iconButtonPreviewControlElement,
  iconButtonActionSectionElement,
  iconButtonPreviewDetailsElement,
  presenceMotionSectionElement,
  doorWindowPerspectiveSectionElement,
  doorWindowPerspectiveEditElement,
  doorWindowPerspectiveSaveElement,
  iconButtonIconButtonElement,
  iconButtonFillSectionElement,
  iconButtonFrameSectionElement,
  iconButtonSoftLightSectionElement,
  iconButtonGlowSectionElement,
  iconButtonIconColorLabelElement,
  deviceButtonIconVisibleElement,
  deviceButtonMainVisibleElement,
  deviceButtonSecondaryVisibleElement,
  deviceButtonIconOnColorLabelElement,
  deviceButtonBadgeColorLabelElement,
  deviceButtonBadgeOpacityLabelElement,
  iconButtonIconSizeLabelElement,
  deviceButtonSymbolSizeLabelElement,
  deviceButtonBadgeSizeLabelElement,
  deviceButtonStatePrecisionLabelElement,
  iconButtonIconLeftElement,
  iconButtonIconTopElement,
  iconButtonIconOffOpacityLabelElement,
  iconButtonIconOnOpacityLabelElement,
  iconButtonMainOffOpacityLabelElement,
  iconButtonMainOnOpacityLabelElement,
  iconButtonSecondaryOffOpacityLabelElement,
  iconButtonSecondaryOnOpacityLabelElement,
  iconButtonLabelElement,
  iconButtonIconColorElement,
  deviceButtonIconOnColorElement,
  deviceButtonBadgeColorElement,
  deviceButtonBadgeOpacityElement,
  deviceButtonBadgeSizeElement,
  deviceButtonSymbolSizeElement,
  deviceButtonStatePrecisionElement,
  presenceHaloScaleXElement,
  presenceHaloScaleYElement,
  presenceHaloRotationElement,
  presenceHaloOpacityElement,
  presencePersonScaleElement,
  presencePersonRotationElement,
  presencePersonOpacityElement,
  presenceOrbitDurationElement,
  presenceHaloVisibleElement,
  presencePersonVisibleElement,
  iconButtonIconSizeElement,
  iconButtonIconOffOpacityElement,
  iconButtonIconOnOpacityElement,
  iconButtonMainColorElement,
  iconButtonSecondaryColorElement,
  iconButtonMainOffOpacityElement,
  iconButtonMainOnOpacityElement,
  iconButtonSecondaryOffOpacityElement,
  iconButtonSecondaryOnOpacityElement,
  iconButtonMainSizeElement,
  iconButtonSecondarySizeElement,
  iconButtonMainWeightElement,
  iconButtonSecondaryWeightElement,
  iconButtonMainSpacingElement,
  iconButtonSecondarySpacingElement,
  iconButtonMainLeftElement,
  iconButtonMainTopElement,
  iconButtonSecondaryLeftElement,
  iconButtonSecondaryTopElement,
  iconButtonOnFillVisibleElement,
  iconButtonOnFillColorElement,
  iconButtonOnFillStrengthElement,
  iconButtonOnFillFadeDurationElement,
  iconButtonFrameVisibleElement,
  iconButtonFrameWidthElement,
  iconButtonFrameAngleElement,
  iconButtonFrameOffOpacityElement,
  iconButtonFrameOnOpacityElement,
  iconButtonCutCornerElement,
  iconButtonSoftLightVisibleElement,
  iconButtonSoftLightColorElement,
  iconButtonSoftLightStrengthElement,
  iconButtonSoftLightSizeElement,
  iconButtonSoftLightAngleElement,
  iconButtonGlowVisibleElement,
  iconButtonGlowColorElement,
  iconButtonGlowStrengthElement,
  iconButtonGlowSizeElement,
  iconButtonGlowAngleElement,
  iconButtonLeftElement,
  iconButtonTopElement,
  iconButtonWidthElement,
  iconButtonHeightElement,
  iconButtonScaleElement,
  iconButtonRotationElement,
  iconButtonPreviewStateElement,
  iconButtonApplyStyleElement,
  iconButtonApplyCountElement,
  iconButtonActionControlsElement,
};
function syncIconButtonInspector(...args: any[]): ReturnType<typeof syncIconButtonInspectorImpl> { return (syncIconButtonInspectorImpl as any)(shellControlsDeps(), ...args); }
const navigationInspectorContext: NavigationInspectorContext = {
  get activeProject() {
    return editorCtx.activeProject;
  },
  findReplaceableComponents,
  navigationActionControlsElement,
  navigationApplyCountElement,
  navigationApplyStyleElement,
  navigationEntityButtonElement,
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
  navigationHeightElement,
  navigationIconActiveOpacityElement,
  navigationIconColorElement,
  navigationIconIdleOpacityElement,
  navigationIconLeftElement,
  navigationIconSizeElement,
  navigationIconTopElement,
  navigationIconVisibleElement,
  navigationInspectorFormElement,
  navigationLabelElement,
  navigationLeftElement,
  navigationMainColorElement,
  navigationMainSizeElement,
  navigationMainSpacingElement,
  navigationMainTextElement,
  navigationMainTextLeftElement,
  navigationMainTextTopElement,
  navigationMainVisibleElement,
  navigationMainWeightElement,
  navigationPreviewStateByComponentId,
  navigationPreviewStateElement,
  navigationRadiusElement,
  navigationRotationElement,
  navigationScaleElement,
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
  navigationTopElement,
  navigationTypeElement,
  navigationWidthElement,
  renderNavigationIconButton,
  syncPopupEntityPickerButton,
  collectPendingNavigationStyleKeys,
  sceneModeControlElement,
  sceneModeHintElement,
  get selectedComponentIdsSet() {
    return editorCtx.selectedComponentIdsSet;
  },
  syncComponentActionControls,
};
function syncNavigationInspector(...args: any[]): ReturnType<typeof syncNavigationInspectorImpl> { return (syncNavigationInspectorImpl as any)(shellControlsDeps(), ...args); }
const lineChartInspectorContext: LineChartInspectorContext = {
  get activeProject() {
    return editorCtx.activeProject;
  },
  findReplaceableComponents,
  lineChartActionControlsElement,
  lineChartApplyCountElement,
  lineChartApplyStyleButtonElement,
  lineChartCurveRadiusInputElement,
  lineChartHeightInputElement,
  lineChartHoursInputElement,
  lineChartLabelElement,
  lineChartLeftInputElement,
  lineChartRotationInputElement,
  lineChartScaleInputElement,
  lineChartStatePrecisionSelectElement,
  lineChartThresholdModeSelectElement,
  lineChartTopInputElement,
  lineChartTypeElement,
  lineChartUpdateIntervalInputElement,
  lineChartValueColorInputElement,
  lineChartValueOffsetXInputElement,
  lineChartValueOffsetYInputElement,
  lineChartValueScaleInputElement,
  lineChartValueVisibleElement,
  lineChartThresholdInputs,
  lineChartWidthInputElement,
  collectChangedLineChartStyleKeys,
  syncPopupEntityPickerButton,
  get selectedComponentIdsSet() {
    return editorCtx.selectedComponentIdsSet;
  },
  syncComponentActionControls,
};
function syncLineChartInspector(...args: any[]): ReturnType<typeof syncLineChartInspectorImpl> { return (syncLineChartInspectorImpl as any)(shellControlsDeps(), ...args); }
const airConditionerInspectorContext: AirConditionerInspectorContext = {
  get activeProject() {
    return editorCtx.activeProject;
  },
  airConditionerActionControlsElement,
  airConditionerActionSectionElement,
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
  airConditionerAirflowMotionElement,
  airConditionerAirflowOffsetXElement,
  airConditionerAirflowOffsetYElement,
  airConditionerAirflowOtherColorElement,
  airConditionerAirflowRotationElement,
  airConditionerAirflowScaleElement,
  airConditionerAirflowSectionElement,
  airConditionerAirflowSpeedElement,
  airConditionerAirflowSpreadElement,
  airConditionerAirflowStrengthElement,
  airConditionerAirflowThicknessElement,
  airConditionerAirflowVisibleElement,
  airConditionerAirflowWidthElement,
  airConditionerApplyCountElement,
  airConditionerApplyStyleElement,
  airConditionerBadgeColorElement,
  airConditionerBadgeOpacityElement,
  airConditionerBadgeSizeElement,
  airConditionerButtonSectionElement,
  airConditionerDeviceTypeElement,
  airConditionerHeightElement,
  airConditionerIconLeftElement,
  airConditionerIconOffColorElement,
  airConditionerIconOnColorElement,
  airConditionerIconTopElement,
  airConditionerIconVisibleElement,
  airConditionerLabelElement,
  airConditionerLayerByComponentId,
  airConditionerLayerOptionsElement,
  airConditionerLeftElement,
  airConditionerMainColorElement,
  airConditionerMainLeftElement,
  airConditionerMainSizeElement,
  airConditionerMainSpacingElement,
  airConditionerMainTextElement,
  airConditionerMainTopElement,
  airConditionerMainVisibleElement,
  airConditionerMainWeightElement,
  airConditionerPreviewDetailsElement,
  airConditionerPreviewStateByComponentId,
  airConditionerPreviewStateElement,
  airConditionerRotationElement,
  airConditionerScaleElement,
  airConditionerSecondaryColorElement,
  airConditionerSecondaryLeftElement,
  airConditionerSecondarySizeElement,
  airConditionerSecondarySpacingElement,
  airConditionerSecondaryTextElement,
  airConditionerSecondaryTopElement,
  airConditionerSecondaryVisibleElement,
  airConditionerSecondaryWeightElement,
  airConditionerSymbolSizeElement,
  airConditionerTopElement,
  airConditionerTransformSectionElement,
  airConditionerWidthElement,
  get editorRenderer() {
    return editorCtx.editorRenderer;
  },
  findReplaceableComponents,
  collectChangedAirConditionerStyleKeys,
  syncPopupEntityPickerButton,
  get selectedComponentIdsSet() {
    return editorCtx.selectedComponentIdsSet;
  },
  syncComponentActionControls,
};
function syncAirConditionerInspector(...args: any[]): ReturnType<typeof syncAirConditionerInspectorImpl> { return (syncAirConditionerInspectorImpl as any)(shellControlsDeps(), ...args); }


/** 认证跳转闩（原 `let authRedirectStarted`）：每实例一份，交给 `net/request-json` 读写。 */
const authRedirectState = { started: false };
const requestJsonDeps = () => ({ authRedirectState });
/**
 * 请求封装（P4 搬进 `net/request-json`）：超时 / 中止 / CSRF / 401-403 跳转。
 * 本身是 `async`，薄绑定只返回 Promise（不写 `async`，免得撞 `require-await`）。
 */
function requestJson(...args: any[]): ReturnType<typeof requestJsonImpl> { return (requestJsonImpl as any)(shellControlsDeps(), ...args); }

/** 数字步进器去重集合（P4 搬进 `controls/number-stepper`，按引用注入）。 */
const numberStepperDeps = () => ({ enhancedNumberInputsSet });
/**
 * 检查器数字输入增强（P4 搬进 `controls/number-stepper`）：**保留原签名** —— 本函数在 6xxx 行
 * 被当作裸函数值交给外部 ctx（`formatLastSeen,`），多一个 `deps` 首参会把调用方的实参顶掉。
 */
function formatLastSeen(...args: any[]): ReturnType<typeof formatLastSeenImpl> { return (formatLastSeenImpl as any)(shellControlsDeps(), ...args); }
function setSettingsMessage(...args: any[]): ReturnType<typeof setSettingsMessageImpl> { return (setSettingsMessageImpl as any)(shellControlsDeps(), ...args); }
function handleOperationError(...args: any[]): ReturnType<typeof handleOperationErrorImpl> { return (handleOperationErrorImpl as any)(shellControlsDeps(), ...args); }
function errorPhase(...args: any[]): ReturnType<typeof errorPhaseImpl> { return (errorPhaseImpl as any)(shellControlsDeps(), ...args); }
function value(...args: any[]): ReturnType<typeof valueImpl> { return (valueImpl as any)(shellControlsDeps(), ...args); }
function hidePopupActionsMenu(...args: any[]): ReturnType<typeof hidePopupActionsMenuImpl> { return (hidePopupActionsMenuImpl as any)(shellControlsDeps(), ...args); }
function closeCustomSelect(...args: any[]): ReturnType<typeof closeCustomSelectImpl> { return (closeCustomSelectImpl as any)(shellControlsDeps(), ...args); }
function positionCustomSelectMenu(...args: any[]): ReturnType<typeof positionCustomSelectMenuImpl> { return (positionCustomSelectMenuImpl as any)(shellControlsDeps(), ...args); }
function selectableEntities(...args: any[]): ReturnType<typeof selectableEntitiesImpl> { return (selectableEntitiesImpl as any)(shellControlsDeps(), ...args); }
function openEntityPicker(...args: any[]): ReturnType<typeof openEntityPickerImpl> { return (openEntityPickerImpl as any)(shellControlsDeps(), ...args); }
function closeAllDropdownMenus(...args: any[]): ReturnType<typeof closeAllDropdownMenusImpl> { return (closeAllDropdownMenusImpl as any)(shellControlsDeps(), ...args); }
function closeDropdownMenu(...args: any[]): ReturnType<typeof closeDropdownMenuImpl> { return (closeDropdownMenuImpl as any)(shellControlsDeps(), ...args); }
function openColorPickerForInput(...args: any[]): ReturnType<typeof openColorPickerForInputImpl> { return (openColorPickerForInputImpl as any)(shellControlsDeps(), ...args); }
function setWorkspaceHasProject(...args: any[]): ReturnType<typeof setWorkspaceHasProjectImpl> { return (setWorkspaceHasProjectImpl as any)(shellControlsDeps(), ...args); }
function hasActiveProject(...args: any[]): ReturnType<typeof hasActiveProjectImpl> { return (hasActiveProjectImpl as any)(shellControlsDeps(), ...args); }
function destroyDashboardPreview(...args: any[]): ReturnType<typeof destroyDashboardPreviewImpl> { return (destroyDashboardPreviewImpl as any)(shellControlsDeps(), ...args); }
function syncWorkspaceEmptyState(...args: any[]): ReturnType<typeof syncWorkspaceEmptyStateImpl> { return (syncWorkspaceEmptyStateImpl as any)(shellControlsDeps(), ...args); }
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
function destroyDashboardPreviewRenderer(...args: any[]): ReturnType<typeof destroyDashboardPreviewRendererImpl> { return (destroyDashboardPreviewRendererImpl as any)(workspaceDocumentDeps(), ...args); }
function renderDashboardPreview(...args: any[]): ReturnType<typeof renderDashboardPreviewImpl> { return (renderDashboardPreviewImpl as any)(workspaceDocumentDeps(), ...args); }
function unbindDisplayDeviceError(...args: any[]): ReturnType<typeof unbindDisplayDeviceErrorImpl> { return (unbindDisplayDeviceErrorImpl as any)(workspaceDocumentDeps(), ...args); }
function renderWorkspaceResolution(...args: any[]): ReturnType<typeof renderWorkspaceResolutionImpl> { return (renderWorkspaceResolutionImpl as any)(workspaceDocumentDeps(), ...args); }
function setEditorMode(...args: any[]): ReturnType<typeof setEditorModeImpl> { return (setEditorModeImpl as any)(workspaceDocumentDeps(), ...args); }
function syncDefaultPageAction(...args: any[]): ReturnType<typeof syncDefaultPageActionImpl> { return (syncDefaultPageActionImpl as any)(workspaceDocumentDeps(), ...args); }
function setPageControlsEnabled(...args: any[]): ReturnType<typeof setPageControlsEnabledImpl> { return (setPageControlsEnabledImpl as any)(workspaceDocumentDeps(), ...args); }
function resizeWorkspaceCanvas(...args: any[]): ReturnType<typeof resizeWorkspaceCanvasImpl> { return (resizeWorkspaceCanvasImpl as any)(workspaceDocumentDeps(), ...args); }
const workspaceResizeObserver = new ResizeObserver(() => {
  (resizeWorkspaceCanvas(), syncCustomPopupStage(), editorCtx.dashboardPreviewRenderer?.resize());
});
workspaceResizeObserver.observe(displayDeviceCountElement);

/** 空白画布框选 */
function ensureMarqueeOverlay(...args: any[]): ReturnType<typeof ensureMarqueeOverlayImpl> { return (ensureMarqueeOverlayImpl as any)(workspaceDocumentDeps(), ...args); }
editorCanvasElement.addEventListener("pointerdown", (marqueeDownEvent: PointerEvent) => {
  if (
    editorCtx.editorMode !== "edit" ||
    marqueeDownEvent.button !== 0 ||
    editorCtx.editorSpacePanning ||
    (marqueeDownEvent.target as Element).closest(
      ".editable, .hb-transform-handle, .hb-multi-selection, button, input, select, a",
    )
  )
    return;
  const canvasWidth = Number(editorCtx.activeProject?.document?.canvas?.width || 2778);
  const canvasHeight = Number(editorCtx.activeProject?.document?.canvas?.height || 1940);
  const start = clientPointToCanvas(
    marqueeDownEvent.clientX,
    marqueeDownEvent.clientY,
    editorCanvasElement,
    canvasWidth,
    canvasHeight,
  );
  const overlay = ensureMarqueeOverlay();
  editorCtx.marqueeState = { startX: start.x, startY: start.y, overlay };
  overlay.hidden = false;
  overlay.style.cssText = "left:0;top:0;width:0;height:0;";
  try {
    editorCanvasElement.setPointerCapture(marqueeDownEvent.pointerId);
  } catch {
    /* ignore */
  }
  marqueeDownEvent.preventDefault();
});
editorCanvasElement.addEventListener("pointermove", (marqueeMoveEvent: PointerEvent) => {
  if (!editorCtx.marqueeState || !editorCtx.activeProject) return;
  const canvasWidth = Number(editorCtx.activeProject.document.canvas.width || 2778);
  const canvasHeight = Number(editorCtx.activeProject.document.canvas.height || 1940);
  const current = clientPointToCanvas(
    marqueeMoveEvent.clientX,
    marqueeMoveEvent.clientY,
    editorCanvasElement,
    canvasWidth,
    canvasHeight,
  );
  const box = normalizeMarquee(
    editorCtx.marqueeState.startX,
    editorCtx.marqueeState.startY,
    current.x,
    current.y,
  );
  const scaleX = editorCanvasElement.clientWidth / canvasWidth;
  const scaleY = editorCanvasElement.clientHeight / canvasHeight;
  editorCtx.marqueeState.overlay.style.left = box.x * scaleX + "px";
  editorCtx.marqueeState.overlay.style.top = box.y * scaleY + "px";
  editorCtx.marqueeState.overlay.style.width = box.width * scaleX + "px";
  editorCtx.marqueeState.overlay.style.height = box.height * scaleY + "px";
});
editorCanvasElement.addEventListener("pointerup", (marqueeUpEvent: PointerEvent) => {
  if (!editorCtx.marqueeState || !editorCtx.activeProject) return;
  const canvasWidth = Number(editorCtx.activeProject.document.canvas.width || 2778);
  const canvasHeight = Number(editorCtx.activeProject.document.canvas.height || 1940);
  const end = clientPointToCanvas(
    marqueeUpEvent.clientX,
    marqueeUpEvent.clientY,
    editorCanvasElement,
    canvasWidth,
    canvasHeight,
  );
  const box = normalizeMarquee(editorCtx.marqueeState.startX, editorCtx.marqueeState.startY, end.x, end.y);
  editorCtx.marqueeState.overlay.hidden = true;
  editorCtx.marqueeState = null;
  try {
    editorCanvasElement.releasePointerCapture(marqueeUpEvent.pointerId);
  } catch {
    /* ignore */
  }
  if (box.width < 4 && box.height < 4) {
    clearComponentSelection();
    syncRendererSelection();
    renderComponentLists();
    coverMotorButtonElement();
    return;
  }
  const hitIds = pickComponentsInMarquee(collectPageComponentBounds(), box);
  editorCtx.selectedComponentIdsSet = new Set(hitIds);
  editorCtx.selectedComponentId = hitIds[0] || null;
  editorCtx.selectionAnchorComponentId = editorCtx.selectedComponentId;
  syncRendererSelection();
  renderComponentLists();
  coverMotorButtonElement();
  syncHistoryButtons();
});
function currentPage(...args: any[]): ReturnType<typeof currentPageImpl> { return (currentPageImpl as any)(workspaceDocumentDeps(), ...args); }
function groupSelectedComponents(...args: any[]): ReturnType<typeof groupSelectedComponentsImpl> { return (groupSelectedComponentsImpl as any)(workspaceDocumentDeps(), ...args); }
function ungroupComponent(...args: any[]): ReturnType<typeof ungroupComponentImpl> { return (ungroupComponentImpl as any)(workspaceDocumentDeps(), ...args); }
function openGroupRenameDialog(...args: any[]): ReturnType<typeof openGroupRenameDialogImpl> { return (openGroupRenameDialogImpl as any)(workspaceDocumentDeps(), ...args); }
function normalizeHexColor(...args: any[]): ReturnType<typeof normalizeHexColorImpl> { return (normalizeHexColorImpl as any)(workspaceDocumentDeps(), ...args); }
function removedComponent(...args: any[]): ReturnType<typeof removedComponentImpl> { return (removedComponentImpl as any)(workspaceDocumentDeps(), ...args); }
function removalPageEntry(...args: any[]): ReturnType<typeof removalPageEntryImpl> { return (removalPageEntryImpl as any)(workspaceDocumentDeps(), ...args); }
function componentListForScope(...args: any[]): ReturnType<typeof componentListForScopeImpl> { return (componentListForScopeImpl as any)(workspaceDocumentDeps(), ...args); }
function collectComponentsByType(...args: any[]): ReturnType<typeof collectComponentsByTypeImpl> { return (collectComponentsByTypeImpl as any)(workspaceDocumentDeps(), ...args); }
function findPageComponentsByType(...args: any[]): ReturnType<typeof findPageComponentsByTypeImpl> { return (findPageComponentsByTypeImpl as any)(workspaceDocumentDeps(), ...args); }
function findReplaceableComponents(...args: any[]): ReturnType<typeof findReplaceableComponentsImpl> { return (findReplaceableComponentsImpl as any)(workspaceDocumentDeps(), ...args); }
function syncRendererSelection(...args: any[]): ReturnType<typeof syncRendererSelectionImpl> { return (syncRendererSelectionImpl as any)(workspaceDocumentDeps(), ...args); }
function clearComponentSelection(...args: any[]): ReturnType<typeof clearComponentSelectionImpl> { return (clearComponentSelectionImpl as any)(workspaceDocumentDeps(), ...args); }
function resetPreviewStates(...args: any[]): ReturnType<typeof resetPreviewStatesImpl> { return (resetPreviewStatesImpl as any)(workspaceDocumentDeps(), ...args); }
function selectComponent(...args: any[]): ReturnType<typeof selectComponentImpl> { return (selectComponentImpl as any)(workspaceDocumentDeps(), ...args); }
function mutateDocument(...args: any[]): ReturnType<typeof mutateDocumentImpl> { return (mutateDocumentImpl as any)(workspaceDocumentDeps(), ...args); }
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
function scaledSelectionPlacements(...args: any[]): ReturnType<typeof scaledSelectionPlacementsImpl> { return (scaledSelectionPlacementsImpl as any)(componentEditingDeps(), ...args); }
function selectedComponentIdsFromDom(...args: any[]): ReturnType<typeof selectedComponentIdsFromDomImpl> { return (selectedComponentIdsFromDomImpl as any)(componentEditingDeps(), ...args); }
function setComponentsRotation(...args: any[]): ReturnType<typeof setComponentsRotationImpl> { return (setComponentsRotationImpl as any)(componentEditingDeps(), ...args); }
function setComponentsVisibility(...args: any[]): ReturnType<typeof setComponentsVisibilityImpl> { return (setComponentsVisibilityImpl as any)(componentEditingDeps(), ...args); }
function closeComponentMenu(...args: any[]): ReturnType<typeof closeComponentMenuImpl> { return (closeComponentMenuImpl as any)(componentEditingDeps(), ...args); }
function openComponentMenu(...args: any[]): ReturnType<typeof openComponentMenuImpl> { return (openComponentMenuImpl as any)(componentEditingDeps(), ...args); }
function findCommonCopyTargets(...args: any[]): ReturnType<typeof findCommonCopyTargetsImpl> { return (findCommonCopyTargetsImpl as any)(componentEditingDeps(), ...args); }
function showCopySuccessDialog(...args: any[]): ReturnType<typeof showCopySuccessDialogImpl> { return (showCopySuccessDialogImpl as any)(componentEditingDeps(), ...args); }
function handleCopySuccessConfirm(...args: any[]): ReturnType<typeof handleCopySuccessConfirmImpl> { return (handleCopySuccessConfirmImpl as any)(componentEditingDeps(), ...args); }
function duplicateComponents(...args: any[]): ReturnType<typeof duplicateComponentsImpl> { return (duplicateComponentsImpl as any)(componentEditingDeps(), ...args); }
function copyTargetsForDocument(...args: any[]): ReturnType<typeof copyTargetsForDocumentImpl> { return (copyTargetsForDocumentImpl as any)(componentEditingDeps(), ...args); }
function renderCopyTargetOptions(...args: any[]): ReturnType<typeof renderCopyTargetOptionsImpl> { return (renderCopyTargetOptionsImpl as any)(componentEditingDeps(), ...args); }
function getDocumentCanvasSize(...args: any[]): ReturnType<typeof getDocumentCanvasSizeImpl> { return (getDocumentCanvasSizeImpl as any)(componentEditingDeps(), ...args); }
function renderCopyScaleOptions(...args: any[]): ReturnType<typeof renderCopyScaleOptionsImpl> { return (renderCopyScaleOptionsImpl as any)(componentEditingDeps(), ...args); }
function renderCopyComponentDialog(...args: any[]): ReturnType<typeof renderCopyComponentDialogImpl> { return (renderCopyComponentDialogImpl as any)(componentEditingDeps(), ...args); }
function openCopyComponentDialog(...args: any[]): ReturnType<typeof openCopyComponentDialogImpl> { return (openCopyComponentDialogImpl as any)(componentEditingDeps(), ...args); }
function deleteComponentIds(...args: any[]): ReturnType<typeof deleteComponentIdsImpl> { return (deleteComponentIdsImpl as any)(componentEditingDeps(), ...args); }
function setComponentsLabelColor(...args: any[]): ReturnType<typeof setComponentsLabelColorImpl> { return (setComponentsLabelColorImpl as any)(componentEditingDeps(), ...args); }
function renderComponentList(...args: any[]): ReturnType<typeof renderComponentListImpl> { return (renderComponentListImpl as any)(componentEditingDeps(), ...args); }
function prependGroupBackButton(...args: any[]): ReturnType<typeof prependGroupBackButtonImpl> { return (prependGroupBackButtonImpl as any)(componentEditingDeps(), ...args); }
function renderComponentLists(...args: any[]): ReturnType<typeof renderComponentListsImpl> { return (renderComponentListsImpl as any)(componentEditingDeps(), ...args); }
function setComponentScope(...args: any[]): ReturnType<typeof setComponentScopeImpl> { return (setComponentScopeImpl as any)(componentEditingDeps(), ...args); }
function syncAddComponentButton(...args: any[]): ReturnType<typeof syncAddComponentButtonImpl> { return (syncAddComponentButtonImpl as any)(componentEditingDeps(), ...args); }
function renderComponentTemplates(...args: any[]): ReturnType<typeof renderComponentTemplatesImpl> { return (renderComponentTemplatesImpl as any)(componentEditingDeps(), ...args); }
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
function renderNavigationIconPreview(...args: any[]): ReturnType<typeof renderNavigationIconPreviewImpl> { return (renderNavigationIconPreviewImpl as any)(componentEditingDeps(), ...args); }
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
function describeEntityDomain(...args: any[]): ReturnType<typeof describeEntityDomainImpl> { return (describeEntityDomainImpl as any)(entityLabelsDeps(), ...args); }
function normalizeWhitespace(...args: any[]): ReturnType<typeof normalizeWhitespaceImpl> { return (normalizeWhitespaceImpl as any)(entityLabelsDeps(), ...args); }
function navigationIconValue(...args: any[]): ReturnType<typeof navigationIconValueImpl> { return (navigationIconValueImpl as any)(entityLabelsDeps(), ...args); }
function resolveEntityDisplayName(...args: any[]): ReturnType<typeof resolveEntityDisplayNameImpl> { return (resolveEntityDisplayNameImpl as any)(entityLabelsDeps(), ...args); }
function formatEntityLabel(...args: any[]): ReturnType<typeof formatEntityLabelImpl> { return (formatEntityLabelImpl as any)(entityLabelsDeps(), ...args); }
function formatEntitySummary(...args: any[]): ReturnType<typeof formatEntitySummaryImpl> { return (formatEntitySummaryImpl as any)(entityLabelsDeps(), ...args); }
function collectEntityIds(...args: any[]): ReturnType<typeof collectEntityIdsImpl> { return (collectEntityIdsImpl as any)(entityLabelsDeps(), ...args); }
function describeEntityState(...args: any[]): ReturnType<typeof describeEntityStateImpl> { return (describeEntityStateImpl as any)(entityLabelsDeps(), ...args); }
function showLightStatisticsMessage(...args: any[]): ReturnType<typeof showLightStatisticsMessageImpl> { return (showLightStatisticsMessageImpl as any)(entityLabelsDeps(), ...args); }
const MAX_LIGHT_STATISTICS_ENTITIES = 100;
function clearLightStatisticsSelection(...args: any[]): ReturnType<typeof clearLightStatisticsSelectionImpl> { return (clearLightStatisticsSelectionImpl as any)(entityLabelsDeps(), ...args); }
function renderLightStatisticsEntityOptions(...args: any[]): ReturnType<typeof renderLightStatisticsEntityOptionsImpl> { return (renderLightStatisticsEntityOptionsImpl as any)(entityLabelsDeps(), ...args); }
function addLightStatisticsEntity(...args: any[]): ReturnType<typeof addLightStatisticsEntityImpl> { return (addLightStatisticsEntityImpl as any)(entityLabelsDeps(), ...args); }
function effectIconName(...args: any[]): ReturnType<typeof effectIconNameImpl> { return (effectIconNameImpl as any)(entityLabelsDeps(), ...args); }
function removeLightStatisticsEntityAt(...args: any[]): ReturnType<typeof removeLightStatisticsEntityAtImpl> { return (removeLightStatisticsEntityAtImpl as any)(entityLabelsDeps(), ...args); }
function renderLightStatisticsEntityList(...args: any[]): ReturnType<typeof renderLightStatisticsEntityListImpl> { return (renderLightStatisticsEntityListImpl as any)(entityLabelsDeps(), ...args); }
function flattenComponentTree(...args: any[]): ReturnType<typeof flattenComponentTreeImpl> { return (flattenComponentTreeImpl as any)(entityLabelsDeps(), ...args); }
function collectPageComponents(...args: any[]): ReturnType<typeof collectPageComponentsImpl> { return (collectPageComponentsImpl as any)(entityLabelsDeps(), ...args); }
function findIconVisibilityVirtualEntity(...args: any[]): ReturnType<typeof findIconVisibilityVirtualEntityImpl> { return (findIconVisibilityVirtualEntityImpl as any)(entityLabelsDeps(), ...args); }
function resolveEntityCatalog(...args: any[]): ReturnType<typeof resolveEntityCatalogImpl> { return (resolveEntityCatalogImpl as any)(entityLabelsDeps(), ...args); }
const effectIconLabelElementById = new WeakMap(),
  effectIconLabelElementByIdById = new WeakMap(),
  effectIconLabelSelector =
    "[data-overflow-scroll-preview], .inspector-picker-value, .inspector-entity-name-line";
function registerOverflowScrollPreviewRow(...args: any[]): ReturnType<typeof registerOverflowScrollPreviewRowImpl> { return (registerOverflowScrollPreviewRowImpl as any)(entityLabelsDeps(), ...args); }
function resolveOverflowScrollPreviewContainer(...args: any[]): ReturnType<typeof resolveOverflowScrollPreviewContainerImpl> { return (resolveOverflowScrollPreviewContainerImpl as any)(entityLabelsDeps(), ...args); }
function findEnclosingScrollPreviewRow(...args: any[]): ReturnType<typeof findEnclosingScrollPreviewRowImpl> { return (findEnclosingScrollPreviewRowImpl as any)(entityLabelsDeps(), ...args); }
function stopOverflowScrollAnimation(...args: any[]): ReturnType<typeof stopOverflowScrollAnimationImpl> { return (stopOverflowScrollAnimationImpl as any)(entityLabelsDeps(), ...args); }
function ensureInspectorPickerValueSpan(...args: any[]): ReturnType<typeof ensureInspectorPickerValueSpanImpl> { return (ensureInspectorPickerValueSpanImpl as any)(entityLabelsDeps(), ...args); }
function setPickerButtonLabel(...args: any[]): ReturnType<typeof setPickerButtonLabelImpl> { return (setPickerButtonLabelImpl as any)(entityLabelsDeps(), ...args); }
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
function closePickerMenu(...args: any[]): ReturnType<typeof closePickerMenuImpl> { return (closePickerMenuImpl as any)(iconPickersDeps(), ...args); }
function closeOtherPickerMenus(...args: any[]): ReturnType<typeof closeOtherPickerMenusImpl> { return (closeOtherPickerMenusImpl as any)(iconPickersDeps(), ...args); }
function resolveMdiIconUrl(...args: any[]): ReturnType<typeof resolveMdiIconUrlImpl> { return (resolveMdiIconUrlImpl as any)(iconPickersDeps(), ...args); }
function renderNavigationIconButton(...args: any[]): ReturnType<typeof renderNavigationIconButtonImpl> { return (renderNavigationIconButtonImpl as any)(iconPickersDeps(), ...args); }
function renderTitleButtonIconPreview(...args: any[]): ReturnType<typeof renderTitleButtonIconPreviewImpl> { return (renderTitleButtonIconPreviewImpl as any)(iconPickersDeps(), ...args); }
function renderEntityIconButtonPreview(...args: any[]): ReturnType<typeof renderEntityIconButtonPreviewImpl> { return (renderEntityIconButtonPreviewImpl as any)(iconPickersDeps(), ...args); }
function renderLightStatisticsIconPreview(...args: any[]): ReturnType<typeof renderLightStatisticsIconPreviewImpl> { return (renderLightStatisticsIconPreviewImpl as any)(iconPickersDeps(), ...args); }
function renderLightStatisticsButtonIcon(...args: any[]): ReturnType<typeof renderLightStatisticsButtonIconImpl> { return (renderLightStatisticsButtonIconImpl as any)(iconPickersDeps(), ...args); }
function copyTextToClipboard(...args: any[]): ReturnType<typeof copyTextToClipboardImpl> { return (copyTextToClipboardImpl as any)(iconPickersDeps(), ...args); }
function enhanceEntityCopyButton(...args: any[]): ReturnType<typeof enhanceEntityCopyButtonImpl> { return (enhanceEntityCopyButtonImpl as any)(iconPickersDeps(), ...args); }
function enhanceEntityCopyButtons(...args: any[]): ReturnType<typeof enhanceEntityCopyButtonsImpl> { return (enhanceEntityCopyButtonsImpl as any)(iconPickersDeps(), ...args); }
enhanceEntityCopyButtons();
const ICON_PAGE_SIZE = 160,
  iconListStateByElement = new WeakMap();
function ensureIconListPaginationState(...args: any[]): ReturnType<typeof ensureIconListPaginationStateImpl> { return (ensureIconListPaginationStateImpl as any)(iconPickersDeps(), ...args); }
function hideIconNameTooltip(...args: any[]): ReturnType<typeof hideIconNameTooltipImpl> { return (hideIconNameTooltipImpl as any)(iconPickersDeps(), ...args); }
function showIconNameTooltip(...args: any[]): ReturnType<typeof showIconNameTooltipImpl> { return (showIconNameTooltipImpl as any)(iconPickersDeps(), ...args); }
function bindIconNameTooltipEvents(...args: any[]): ReturnType<typeof bindIconNameTooltipEventsImpl> { return (bindIconNameTooltipEventsImpl as any)(iconPickersDeps(), ...args); }
function bindIconListInfiniteScroll(...args: any[]): ReturnType<typeof bindIconListInfiniteScrollImpl> { return (bindIconListInfiniteScrollImpl as any)(iconPickersDeps(), ...args); }
function iconTooltipElementCount(...args: any[]): ReturnType<typeof iconTooltipElementCountImpl> { return (iconTooltipElementCountImpl as any)(iconPickersDeps(), ...args); }
function iconTooltipElementFlag(...args: any[]): ReturnType<typeof iconTooltipElementFlagImpl> { return (iconTooltipElementFlagImpl as any)(iconPickersDeps(), ...args); }
function iconTooltipElementStep(...args: any[]): ReturnType<typeof iconTooltipElementStepImpl> { return (iconTooltipElementStepImpl as any)(iconPickersDeps(), ...args); }
function iconTooltipElementStore(...args: any[]): ReturnType<typeof iconTooltipElementStoreImpl> { return (iconTooltipElementStoreImpl as any)(iconPickersDeps(), ...args); }
function iconTooltipElementBuffer(...args: any[]): ReturnType<typeof iconTooltipElementBufferImpl> { return (iconTooltipElementBufferImpl as any)(iconPickersDeps(), ...args); }
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
function positionNavigationIconMenu(...args: any[]): ReturnType<typeof positionNavigationIconMenuImpl> { return (positionNavigationIconMenuImpl as any)(iconPickersDeps(), ...args); }
function positionIbeIconMenu(...args: any[]): ReturnType<typeof positionIbeIconMenuImpl> { return (positionIbeIconMenuImpl as any)(iconPickersDeps(), ...args); }
function positionIconButtonIconMenu(...args: any[]): ReturnType<typeof positionIconButtonIconMenuImpl> { return (positionIconButtonIconMenuImpl as any)(iconPickersDeps(), ...args); }
function layoutTitleButtonIconMenu(...args: any[]): ReturnType<typeof layoutTitleButtonIconMenuImpl> { return (layoutTitleButtonIconMenuImpl as any)(iconPickersDeps(), ...args); }
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
function positionLightStatisticsIconMenu(...args: any[]): ReturnType<typeof positionLightStatisticsIconMenuImpl> { return (positionLightStatisticsIconMenuImpl as any)(assetPickerDeps(), ...args); }
function positionLightStatisticsEntityMenu(...args: any[]): ReturnType<typeof positionLightStatisticsEntityMenuImpl> { return (positionLightStatisticsEntityMenuImpl as any)(assetPickerDeps(), ...args); }
function resolveEntityPickerConfig(...args: any[]): ReturnType<typeof resolveEntityPickerConfigImpl> { return (resolveEntityPickerConfigImpl as any)(assetPickerDeps(), ...args); }
function renderRelatedPopupEntityOptions(...args: any[]): ReturnType<typeof renderRelatedPopupEntityOptionsImpl> { return (renderRelatedPopupEntityOptionsImpl as any)(assetPickerDeps(), ...args); }
function syncPopupEntityPickerButton(...args: any[]): ReturnType<typeof syncPopupEntityPickerButtonImpl> { return (syncPopupEntityPickerButtonImpl as any)(assetPickerDeps(), ...args); }
function resolveAssetPreviewUrl(...args: any[]): ReturnType<typeof resolveAssetPreviewUrlImpl> { return (resolveAssetPreviewUrlImpl as any)(assetPickerDeps(), ...args); }
function refreshImageAssetPickerPreview(...args: any[]): ReturnType<typeof refreshImageAssetPickerPreviewImpl> { return (refreshImageAssetPickerPreviewImpl as any)(assetPickerDeps(), ...args); }
function resolveAssetFileUrl(...args: any[]): ReturnType<typeof resolveAssetFileUrlImpl> { return (resolveAssetFileUrlImpl as any)(assetPickerDeps(), ...args); }
function resolveEffectAssetUrl(...args: any[]): ReturnType<typeof resolveEffectAssetUrlImpl> { return (resolveEffectAssetUrlImpl as any)(assetPickerDeps(), ...args); }
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
  });
function assetMatchesId(...args: any[]): ReturnType<typeof assetMatchesIdImpl> { return (assetMatchesIdImpl as any)(assetPickerDeps(), ...args); }
function allAssets(...args: any[]): ReturnType<typeof allAssetsImpl> { return (allAssetsImpl as any)(assetPickerDeps(), ...args); }
function findAssetById(...args: any[]): ReturnType<typeof findAssetByIdImpl> { return (findAssetByIdImpl as any)(assetPickerDeps(), ...args); }
function assetDisplayName(...args: any[]): ReturnType<typeof assetDisplayNameImpl> { return (assetDisplayNameImpl as any)(assetPickerDeps(), ...args); }
function exportedAssetsInFolder(...args: any[]): ReturnType<typeof exportedAssetsInFolderImpl> { return (exportedAssetsInFolderImpl as any)(assetPickerDeps(), ...args); }
function canDeleteAssetFolder(...args: any[]): ReturnType<typeof canDeleteAssetFolderImpl> { return (canDeleteAssetFolderImpl as any)(assetPickerDeps(), ...args); }
function syncAssetFolderOptions(...args: any[]): ReturnType<typeof syncAssetFolderOptionsImpl> { return (syncAssetFolderOptionsImpl as any)(assetPickerDeps(), ...args); }
function leftFolderName(...args: any[]): ReturnType<typeof leftFolderNameImpl> { return (leftFolderNameImpl as any)(assetPickerDeps(), ...args); }
function measureAssetImageSize(...args: any[]): ReturnType<typeof measureAssetImageSizeImpl> { return (measureAssetImageSizeImpl as any)(assetPickerDeps(), ...args); }
function applyAssetNaturalSize(...args: any[]): ReturnType<typeof applyAssetNaturalSizeImpl> { return (applyAssetNaturalSizeImpl as any)(assetPickerDeps(), ...args); }
function readEffectNaturalSize(...args: any[]): ReturnType<typeof readEffectNaturalSizeImpl> { return (readEffectNaturalSizeImpl as any)(assetPickerDeps(), ...args); }
function probeAssetNaturalSize(...args: any[]): ReturnType<typeof probeAssetNaturalSizeImpl> { return (probeAssetNaturalSizeImpl as any)(assetPickerDeps(), ...args); }
function positionImageAssetMenu(...args: any[]): ReturnType<typeof positionImageAssetMenuImpl> { return (positionImageAssetMenuImpl as any)(assetPickerDeps(), ...args); }
function positionAssetLargePreview(...args: any[]): ReturnType<typeof positionAssetLargePreviewImpl> { return (positionAssetLargePreviewImpl as any)(assetPickerDeps(), ...args); }
function scheduleAssetPreview(...args: any[]): ReturnType<typeof scheduleAssetPreviewImpl> { return (scheduleAssetPreviewImpl as any)(assetPickerDeps(), ...args); }
function hideAssetLargePreview(...args: any[]): ReturnType<typeof hideAssetLargePreviewImpl> { return (hideAssetLargePreviewImpl as any)(assetPickerDeps(), ...args); }
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
function createAssetOptionButton(...args: any[]): ReturnType<typeof createAssetOptionButtonImpl> { return (createAssetOptionButtonImpl as any)(popupInspectorsDeps(), ...args); }
function renderImageAssetOptions(...args: any[]): ReturnType<typeof renderImageAssetOptionsImpl> { return (renderImageAssetOptionsImpl as any)(popupInspectorsDeps(), ...args); }
function syncImageAssetSelection(...args: any[]): ReturnType<typeof syncImageAssetSelectionImpl> { return (syncImageAssetSelectionImpl as any)(popupInspectorsDeps(), ...args); }
function positionEffectAssetMenu(...args: any[]): ReturnType<typeof positionEffectAssetMenuImpl> { return (positionEffectAssetMenuImpl as any)(popupInspectorsDeps(), ...args); }
function renderEffectAssetOptions(...args: any[]): ReturnType<typeof renderEffectAssetOptionsImpl> { return (renderEffectAssetOptionsImpl as any)(popupInspectorsDeps(), ...args); }
function syncEffectAssetSelection(...args: any[]): ReturnType<typeof syncEffectAssetSelectionImpl> { return (syncEffectAssetSelectionImpl as any)(popupInspectorsDeps(), ...args); }
function assignActionControlIds(...args: any[]): ReturnType<typeof assignActionControlIdsImpl> { return (assignActionControlIdsImpl as any)(popupInspectorsDeps(), ...args); }
function initActionPopupConfig(...args: any[]): ReturnType<typeof initActionPopupConfigImpl> { return (initActionPopupConfigImpl as any)(popupInspectorsDeps(), ...args); }
function closePopupEntityMenus(...args: any[]): ReturnType<typeof closePopupEntityMenusImpl> { return (closePopupEntityMenusImpl as any)(popupInspectorsDeps(), ...args); }
function syncPopupEntityButton(...args: any[]): ReturnType<typeof syncPopupEntityButtonImpl> { return (syncPopupEntityButtonImpl as any)(popupInspectorsDeps(), ...args); }
function renderPopupEntityOptions(...args: any[]): ReturnType<typeof renderPopupEntityOptionsImpl> { return (renderPopupEntityOptionsImpl as any)(popupInspectorsDeps(), ...args); }
function positionPopupEntityMenu(...args: any[]): ReturnType<typeof positionPopupEntityMenuImpl> { return (positionPopupEntityMenuImpl as any)(popupInspectorsDeps(), ...args); }
function timeFitComponent(...args: any[]): ReturnType<typeof timeFitComponentImpl> { return (timeFitComponentImpl as any)(popupInspectorsDeps(), ...args); }
function renderTimeInspector(...args: any[]): ReturnType<typeof renderTimeInspectorImpl> { return (renderTimeInspectorImpl as any)(popupInspectorsDeps(), ...args); }
function weatherProperties(...args: any[]): ReturnType<typeof weatherPropertiesImpl> { return (weatherPropertiesImpl as any)(popupInspectorsDeps(), ...args); }
function fitWeatherComponentToDimensions(...args: any[]): ReturnType<typeof fitWeatherComponentToDimensionsImpl> { return (fitWeatherComponentToDimensionsImpl as any)(popupInspectorsDeps(), ...args); }
function entitiesByEntityId(...args: any[]): ReturnType<typeof entitiesByEntityIdImpl> { return (entitiesByEntityIdImpl as any)(popupInspectorsDeps(), ...args); }
function devicesByDeviceId(...args: any[]): ReturnType<typeof devicesByDeviceIdImpl> { return (devicesByDeviceIdImpl as any)(popupInspectorsDeps(), ...args); }
function buildCustomPopupEditorContext(...args: any[]): ReturnType<typeof buildCustomPopupEditorContextImpl> { return (buildCustomPopupEditorContextImpl as any)(popupInspectorsDeps(), ...args); }
function renderCustomPopupEditor(...args: any[]): ReturnType<typeof renderCustomPopupEditorImpl> { return (renderCustomPopupEditorImpl as any)(popupInspectorsDeps(), ...args); }
function syncCustomPopupStage(...args: any[]): ReturnType<typeof syncCustomPopupStageImpl> { return (syncCustomPopupStageImpl as any)(popupInspectorsDeps(), ...args); }
function buildTimeInspectorContext(...args: any[]): ReturnType<typeof buildTimeInspectorContextImpl> { return (buildTimeInspectorContextImpl as any)(popupInspectorsDeps(), ...args); }
function syncTimeInspector(...args: any[]): ReturnType<typeof syncTimeInspectorImpl> { return (syncTimeInspectorImpl as any)(popupInspectorsDeps(), ...args); }
function buildWeatherInspectorContext(...args: any[]): ReturnType<typeof buildWeatherInspectorContextImpl> { return (buildWeatherInspectorContextImpl as any)(popupInspectorsDeps(), ...args); }
function syncWeatherInspector(...args: any[]): ReturnType<typeof syncWeatherInspectorImpl> { return (syncWeatherInspectorImpl as any)(popupInspectorsDeps(), ...args); }
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
function buildTitleButtonInspectorContext(...args: any[]): ReturnType<typeof buildTitleButtonInspectorContextImpl> { return (buildTitleButtonInspectorContextImpl as any)(inspectorContextsDeps(), ...args); }
function syncTitleButtonInspector(...args: any[]): ReturnType<typeof syncTitleButtonInspectorImpl> { return (syncTitleButtonInspectorImpl as any)(inspectorContextsDeps(), ...args); }
function buildLightStatisticsInspectorContext(...args: any[]): ReturnType<typeof buildLightStatisticsInspectorContextImpl> { return (buildLightStatisticsInspectorContextImpl as any)(inspectorContextsDeps(), ...args); }
function syncLightStatisticsInspector(...args: any[]): ReturnType<typeof syncLightStatisticsInspectorImpl> { return (syncLightStatisticsInspectorImpl as any)(inspectorContextsDeps(), ...args); }
function buildCameraInspectorContext(...args: any[]): ReturnType<typeof buildCameraInspectorContextImpl> { return (buildCameraInspectorContextImpl as any)(inspectorContextsDeps(), ...args); }
function syncCameraInspector(...args: any[]): ReturnType<typeof syncCameraInspectorImpl> { return (syncCameraInspectorImpl as any)(inspectorContextsDeps(), ...args); }
function buildVacuumMapInspectorContext(...args: any[]): ReturnType<typeof buildVacuumMapInspectorContextImpl> { return (buildVacuumMapInspectorContextImpl as any)(inspectorContextsDeps(), ...args); }
function syncVacuumMapInspector(...args: any[]): ReturnType<typeof syncVacuumMapInspectorImpl> { return (syncVacuumMapInspectorImpl as any)(inspectorContextsDeps(), ...args); }
function buildCoverMotorInspectorContext(...args: any[]): ReturnType<typeof buildCoverMotorInspectorContextImpl> { return (buildCoverMotorInspectorContextImpl as any)(inspectorContextsDeps(), ...args); }
function coverMotorButtonElement(...args: any[]): ReturnType<typeof coverMotorButtonElementImpl> { return (coverMotorButtonElementImpl as any)(inspectorContextsDeps(), ...args); }
function computeCoverMotorStyleChanges(...args: any[]): ReturnType<typeof computeCoverMotorStyleChangesImpl> { return (computeCoverMotorStyleChangesImpl as any)(inspectorContextsDeps(), ...args); }
function reloadAssetCatalog(...args: any[]): ReturnType<typeof reloadAssetCatalogImpl> { return (reloadAssetCatalogImpl as any)(inspectorContextsDeps(), ...args); }
function pollAssetCatalogVersion(...args: any[]): ReturnType<typeof pollAssetCatalogVersionImpl> { return (pollAssetCatalogVersionImpl as any)(inspectorContextsDeps(), ...args); }
function ensureEntitiesLoaded(...args: any[]): ReturnType<typeof ensureEntitiesLoadedImpl> { return (ensureEntitiesLoadedImpl as any)(inspectorContextsDeps(), ...args); }
function renderCustomPopupSelector(...args: any[]): ReturnType<typeof renderCustomPopupSelectorImpl> { return (renderCustomPopupSelectorImpl as any)(inspectorContextsDeps(), ...args); }
function syncPopupEntityInputs(...args: any[]): ReturnType<typeof syncPopupEntityInputsImpl> { return (syncPopupEntityInputsImpl as any)(inspectorContextsDeps(), ...args); }
function syncPopupModuleClimateDeviceType(...args: any[]): ReturnType<typeof syncPopupModuleClimateDeviceTypeImpl> { return (syncPopupModuleClimateDeviceTypeImpl as any)(inspectorContextsDeps(), ...args); }
function deviceNameValue(...args: any[]): ReturnType<typeof deviceNameValueImpl> { return (deviceNameValueImpl as any)(inspectorContextsDeps(), ...args); }
function initialPopupId(...args: any[]): ReturnType<typeof initialPopupIdImpl> { return (initialPopupIdImpl as any)(inspectorContextsDeps(), ...args); }
function renderPopupModuleEntityOptions(...args: any[]): ReturnType<typeof renderPopupModuleEntityOptionsImpl> { return (renderPopupModuleEntityOptionsImpl as any)(inspectorContextsDeps(), ...args); }
function closePopupModuleEntityMenu(...args: any[]): ReturnType<typeof closePopupModuleEntityMenuImpl> { return (closePopupModuleEntityMenuImpl as any)(inspectorContextsDeps(), ...args); }
function openPopupModuleDialog(...args: any[]): ReturnType<typeof openPopupModuleDialogImpl> { return (openPopupModuleDialogImpl as any)(inspectorContextsDeps(), ...args); }
function renderPageSelect(...args: any[]): ReturnType<typeof renderPageSelectImpl> { return (renderPageSelectImpl as any)(inspectorContextsDeps(), ...args); }
function retainExistingSelection(...args: any[]): ReturnType<typeof retainExistingSelectionImpl> { return (retainExistingSelectionImpl as any)(inspectorContextsDeps(), ...args); }
const structureVolatileTypesSet = new Set();
function collectChangedComponents(...args: any[]): ReturnType<typeof collectChangedComponentsImpl> { return (collectChangedComponentsImpl as any)(inspectorContextsDeps(), ...args); }
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
function collectPageComponentBounds(...args: any[]): ReturnType<typeof collectPageComponentBoundsImpl> { return (collectPageComponentBoundsImpl as any)(workspaceHistoryDeps(), ...args); }

function alignSelectedComponents(...args: any[]): ReturnType<typeof alignSelectedComponentsImpl> { return (alignSelectedComponentsImpl as any)(workspaceHistoryDeps(), ...args); }

function ensureEditorRenderer(...args: any[]): ReturnType<typeof ensureEditorRendererImpl> { return (ensureEditorRendererImpl as any)(workspaceHistoryDeps(), ...args); }
function renderEditorWorkspace(...args: any[]): ReturnType<typeof renderEditorWorkspaceImpl> { return (renderEditorWorkspaceImpl as any)(workspaceHistoryDeps(), ...args); }
function syncHistoryButtons(...args: any[]): ReturnType<typeof syncHistoryButtonsImpl> { return (syncHistoryButtonsImpl as any)(workspaceHistoryDeps(), ...args); }

function applyEditorCanvasZoom(...args: any[]): ReturnType<typeof applyEditorCanvasZoomImpl> { return (applyEditorCanvasZoomImpl as any)(workspaceHistoryDeps(), ...args); }

function selectAllPageComponents(...args: any[]): ReturnType<typeof selectAllPageComponentsImpl> { return (selectAllPageComponentsImpl as any)(workspaceHistoryDeps(), ...args); }
function discardRecoverySnapshot(...args: any[]): ReturnType<typeof discardRecoverySnapshotImpl> { return (discardRecoverySnapshotImpl as any)(workspaceHistoryDeps(), ...args); }
function readRecoverySnapshot(...args: any[]): ReturnType<typeof readRecoverySnapshotImpl> { return (readRecoverySnapshotImpl as any)(workspaceHistoryDeps(), ...args); }
const recoveryWriter = createRecoveryWriter2(persistRecoverySnapshot);
(window.addEventListener("pagehide", recoveryWriter.flush),
  window.addEventListener("beforeunload", recoveryWriter.flush),
  document.addEventListener("visibilitychange", () => {
    document.hidden && recoveryWriter.flush();
  }));
function scheduleRecoverySnapshot(...args: any[]): ReturnType<typeof scheduleRecoverySnapshotImpl> { return (scheduleRecoverySnapshotImpl as any)(workspaceHistoryDeps(), ...args); }
function persistRecoverySnapshot(...args: any[]): ReturnType<typeof persistRecoverySnapshotImpl> { return (persistRecoverySnapshotImpl as any)(workspaceHistoryDeps(), ...args); }
function writeError(...args: any[]): ReturnType<typeof writeErrorImpl> { return (writeErrorImpl as any)(workspaceHistoryDeps(), ...args); }
function resetHistoryState(...args: any[]): ReturnType<typeof resetHistoryStateImpl> { return (resetHistoryStateImpl as any)(workspaceHistoryDeps(), ...args); }
function refreshDirtyState(...args: any[]): ReturnType<typeof refreshDirtyStateImpl> { return (refreshDirtyStateImpl as any)(workspaceHistoryDeps(), ...args); }
function historyEntries(...args: any[]): ReturnType<typeof historyEntriesImpl> { return (historyEntriesImpl as any)(workspaceHistoryDeps(), ...args); }
function historyEntry(...args: any[]): ReturnType<typeof historyEntryImpl> { return (historyEntryImpl as any)(workspaceHistoryDeps(), ...args); }
function initialPagePath(...args: any[]): ReturnType<typeof initialPagePathImpl> { return (initialPagePathImpl as any)(workspaceHistoryDeps(), ...args); }
function projectSummary(...args: any[]): ReturnType<typeof projectSummaryImpl> { return (projectSummaryImpl as any)(workspaceHistoryDeps(), ...args); }
function recoverDraftConflict(...args: any[]): ReturnType<typeof recoverDraftConflictImpl> { return (recoverDraftConflictImpl as any)(workspaceHistoryDeps(), ...args); }
function saveDraft(...args: any[]): ReturnType<typeof saveDraftImpl> { return (saveDraftImpl as any)(workspaceHistoryDeps(), ...args); }
/**
 * 3D 配置入口 / 弹窗是否正开着。
 *
 * 自动重载（HA 目录变化、撤销重做）时不要重置 2D 画布：否则会把正在编辑的
 * 3D 入口、楼层弹窗或借用中的预览一起关掉。
 */
function interaction3dEntryActive(...args: any[]): ReturnType<typeof interaction3dEntryActiveImpl> { return (interaction3dEntryActiveImpl as any)(workspaceHistoryDeps(), ...args); }
function loadHaConnection(...args: any[]): ReturnType<typeof loadHaConnectionImpl> { return (loadHaConnectionImpl as any)(workspaceHistoryDeps(), ...args); }
function entityLoadError(...args: any[]): ReturnType<typeof entityLoadErrorImpl> { return (entityLoadErrorImpl as any)(workspaceHistoryDeps(), ...args); }
function reuseTokenForNewUrl(...args: any[]): ReturnType<typeof reuseTokenForNewUrlImpl> { return (reuseTokenForNewUrlImpl as any)(workspaceHistoryDeps(), ...args); }
function syncAspectLockButton(...args: any[]): ReturnType<typeof syncAspectLockButtonImpl> { return (syncAspectLockButtonImpl as any)(workspaceHistoryDeps(), ...args); }
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
function actionDraftDocument(...args: any[]): ReturnType<typeof actionDraftDocumentImpl> { return (actionDraftDocumentImpl as any)(lightingPanelDeps(), ...args); }
function targetPageCandidate(...args: any[]): ReturnType<typeof targetPageCandidateImpl> { return (targetPageCandidateImpl as any)(lightingPanelDeps(), ...args); }
function buttonVisibilityDraftDocument(...args: any[]): ReturnType<typeof buttonVisibilityDraftDocumentImpl> { return (buttonVisibilityDraftDocumentImpl as any)(lightingPanelDeps(), ...args); }
function titleButtonIconOptionClickEvent(...args: any[]): ReturnType<typeof titleButtonIconOptionClickEventImpl> { return (titleButtonIconOptionClickEventImpl as any)(lightingPanelDeps(), ...args); }
function titleButtonIconDraftDocument(...args: any[]): ReturnType<typeof titleButtonIconDraftDocumentImpl> { return (titleButtonIconDraftDocumentImpl as any)(lightingPanelDeps(), ...args); }
function lightStatisticsIconCopyError(...args: any[]): ReturnType<typeof lightStatisticsIconCopyErrorImpl> { return (lightStatisticsIconCopyErrorImpl as any)(lightingPanelDeps(), ...args); }
function lightStatisticsEntityListClickEvent(...args: any[]): ReturnType<typeof lightStatisticsEntityListClickEventImpl> { return (lightStatisticsEntityListClickEventImpl as any)(lightingPanelDeps(), ...args); }
function imageEntityDraftDocument(...args: any[]): ReturnType<typeof imageEntityDraftDocumentImpl> { return (imageEntityDraftDocumentImpl as any)(lightingPanelDeps(), ...args); }
function openAssetPicker(...args: any[]): ReturnType<typeof openAssetPickerImpl> { return (openAssetPickerImpl as any)(lightingPanelDeps(), ...args); }
function assetIdToDelete(...args: any[]): ReturnType<typeof assetIdToDeleteImpl> { return (assetIdToDeleteImpl as any)(lightingPanelDeps(), ...args); }
function folderDocumentNode(...args: any[]): ReturnType<typeof folderDocumentNodeImpl> { return (folderDocumentNodeImpl as any)(lightingPanelDeps(), ...args); }
function closeDeletePopupDialog(...args: any[]): ReturnType<typeof closeDeletePopupDialogImpl> { return (closeDeletePopupDialogImpl as any)(lightingPanelDeps(), ...args); }
function documentSource(...args: any[]): ReturnType<typeof documentSourceImpl> { return (documentSourceImpl as any)(lightingPanelDeps(), ...args); }
// 保留空实现以维持上方授权门禁函数的调用契约（门禁逻辑本身不在此处）。
function popupId(...args: any[]): ReturnType<typeof popupIdImpl> { return (popupIdImpl as any)(lightingPanelDeps(), ...args); }
function triggerKey(...args: any[]): ReturnType<typeof triggerKeyImpl> { return (triggerKeyImpl as any)(lightingPanelDeps(), ...args); }
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

function findDiagramPreviewFrame(...args: any[]): ReturnType<typeof findDiagramPreviewFrameImpl> { return (findDiagramPreviewFrameImpl as any)(lightingPanelDeps(), ...args); }
function lightInputElement(...args: any[]): ReturnType<typeof lightInputElementImpl> { return (lightInputElementImpl as any)(lightingPanelDeps(), ...args); }
function cancelRemovesComponent(...args: any[]): ReturnType<typeof cancelRemovesComponentImpl> { return (cancelRemovesComponentImpl as any)(lightingPanelDeps(), ...args); }
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

function lightingPayload(...args: any[]): ReturnType<typeof lightingPayloadImpl> { return (lightingPayloadImpl as any)(lightingPanelDeps(), ...args); }
function lightFieldElement(...args: any[]): ReturnType<typeof lightFieldElementImpl> { return (lightFieldElementImpl as any)(lightingPanelDeps(), ...args); }
function openLightingPanel(...args: any[]): ReturnType<typeof openLightingPanelImpl> { return (openLightingPanelImpl as any)(lightingPanelDeps(), ...args); }
function lightInputNode(...args: any[]): ReturnType<typeof lightInputNodeImpl> { return (lightInputNodeImpl as any)(lightingPanelDeps(), ...args); }
function onFloorplanAutoLightingResetButtonClick(...args: any[]): ReturnType<typeof onFloorplanAutoLightingResetButtonClickImpl> { return (onFloorplanAutoLightingResetButtonClickImpl as any)(lightingPanelDeps(), ...args); }
function onFloorplanAutoLightingCloseButtonClick(...args: any[]): ReturnType<typeof onFloorplanAutoLightingCloseButtonClickImpl> { return (onFloorplanAutoLightingCloseButtonClickImpl as any)(lightingPanelDeps(), ...args); }
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
function applyLightingPanelDragMove(...args: any[]): ReturnType<typeof applyLightingPanelDragMoveImpl> { return (applyLightingPanelDragMoveImpl as any)(lightingPanelDeps(), ...args); }
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
function closeAutoDiagramDialog(...args: any[]): ReturnType<typeof closeAutoDiagramDialogImpl> { return (closeAutoDiagramDialogImpl as any)(navigationPreviewDeps(), ...args); }
function settleAutoDiagramDialog(...args: any[]): ReturnType<typeof settleAutoDiagramDialogImpl> { return (settleAutoDiagramDialogImpl as any)(navigationPreviewDeps(), ...args); }
function cancelRemoveDraftDocument(...args: any[]): ReturnType<typeof cancelRemoveDraftDocumentImpl> { return (cancelRemoveDraftDocumentImpl as any)(navigationPreviewDeps(), ...args); }
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
function bindMessageSection(...args: any[]): ReturnType<typeof bindMessageSectionImpl> { return (bindMessageSectionImpl as any)(navigationPreviewDeps(), ...args); }
function onWindowMessage(...args: any[]): ReturnType<typeof onWindowMessageImpl> { return (onWindowMessageImpl as any)(navigationPreviewDeps(), ...args); }
window.addEventListener("message", (lightingStateFrameState) => {
  if (lightingStateFrameState.origin !== window.location.origin) return;
  const data = lightingStateFrameState.data;
  if (data?.type === "homeos-floorplan-auto-diagram-base-lighting-state") {
    const lightingStateFrame = String(data.componentId || ""),
      gm4 = lightingPayload(lightingStateFrame);
    if (
      !gm4 ||
      lightingStateFrameState.source !== gm4.contentWindow ||
      lightingStateFrame !== editorCtx.baseLightingComponentId
    )
      return;
    ((data.status === "ready" || data.status === "saved") &&
      ((editorCtx.baseLightingSettings = normalizeBaseLighting2(data.savedLighting || data.lighting)),
      openLightingPanel(data.lighting || editorCtx.baseLightingSettings)),
      floorplanAutoLightingPanelElement.setAttribute("aria-busy", "false"),
      data.status === "saved"
        ? (floorplanAutoLightingStatusElement.textContent =
            "已保存，并同步到实时预览、手动导图和自动导图。")
        : data.status === "ready" &&
          (floorplanAutoLightingStatusElement.textContent = "修改会实时同步到当前3D预览。"));
    return;
  }
  if (data?.type === "homeos-floorplan-auto-diagram-ready") {
    const readyComponentId = String(data.componentId || ""),
      readyFrame = document.querySelector<HTMLIFrameElement>(
        '.hb-component[data-component-id="' +
          CSS.escape(readyComponentId) +
          '"] .hb-floorplan-auto-diagram-preview',
      );
    if (!readyFrame || lightingStateFrameState.source !== readyFrame.contentWindow) return;
    (readyFrame.classList.add("is-ready"),
      readyFrame.parentElement?.querySelector(".hb-floorplan-auto-diagram-loading")?.remove());
    const readyComponent = findComponent2(editorCtx.activeProject?.document, readyComponentId)?.component;
    if (readyComponent?.type === "floorplan-auto-diagram") {
      const reportedFloors = (Array.isArray(data.floors) ? data.floors : [])
          .map((floorEntry: any) => ({
            id: String(floorEntry?.id || ""),
            name: String(floorEntry?.name || ""),
          }))
          .filter((validFloor: any) => validFloor.id),
        reportedFloorSelection = String(data.floorSelection || "");
      floorplanAutoDiagramStateByComponentId.set(readyComponentId, {
        floors: reportedFloors,
        selected: reportedFloorSelection,
      });
      const readyProperties = readyComponent.properties || {};
      (Object.prototype.hasOwnProperty.call(readyProperties, "floorSelection") &&
        reportedFloorSelection &&
        readyProperties.floorSelection !== reportedFloorSelection &&
        mutateDocument((floorSyncDraftDocument: any) => {
          const floorSyncComponent = findComponent2(
            floorSyncDraftDocument,
            readyComponentId,
          )?.component;
          floorSyncComponent?.type === "floorplan-auto-diagram" &&
            (floorSyncComponent.properties = {
              ...(floorSyncComponent.properties || {}),
              floorSelection: reportedFloorSelection,
            });
        }),
        coverMotorButtonElement(),
        readyFrame.contentWindow!.postMessage(
          {
            type: "homeos-floorplan-auto-diagram-camera",
            componentId: readyComponentId,
            command: "restore",
            value: {
              view: readyComponent.properties?.cameraView || "free",
              mode: readyComponent.properties?.cameraMode || "orthographic",
              topRotation: Number(readyComponent.properties?.cameraTopRotation || 0),
              focalLength: Number(readyComponent.properties?.cameraFocalLength || 50),
            },
          },
          window.location.origin,
        ));
    }
    return;
  }
  if (data?.type === "homeos-floorplan-auto-diagram-floor-state") {
    const floorStateComponentId = String(data.componentId || ""),
      floorStateFrame = document.querySelector<HTMLIFrameElement>(
        '.hb-component[data-component-id="' +
          CSS.escape(floorStateComponentId) +
          '"] .hb-floorplan-auto-diagram-preview',
      );
    if (!floorStateFrame || lightingStateFrameState.source !== floorStateFrame.contentWindow)
      return;
    const floorStateFloors = (Array.isArray(data.floors) ? data.floors : [])
        .map((floorStateEntry: any) => ({
          id: String(floorStateEntry?.id || ""),
          name: String(floorStateEntry?.name || ""),
        }))
        .filter((validFloorState: any) => validFloorState.id),
      floorStateSelection = String(data.floorSelection || "");
    floorplanAutoDiagramStateByComponentId.set(floorStateComponentId, {
      floors: floorStateFloors,
      selected: floorStateSelection,
    });
    const floorStateComponent = findComponent2(
      editorCtx.activeProject?.document,
      floorStateComponentId,
    )?.component;
    (floorStateComponent?.type === "floorplan-auto-diagram" &&
      floorStateSelection &&
      floorStateComponent.properties?.floorSelection !== floorStateSelection &&
      mutateDocument((floorStateDraftDocument: any) => {
        const floorStateComponentInDraft = findComponent2(
          floorStateDraftDocument,
          floorStateComponentId,
        )?.component;
        floorStateComponentInDraft?.type === "floorplan-auto-diagram" &&
          (floorStateComponentInDraft.properties = {
            ...(floorStateComponentInDraft.properties || {}),
            floorSelection: floorStateSelection,
          });
      }),
      floorStateComponentId === editorCtx.selectedComponentId && coverMotorButtonElement());
    return;
  }
  if (data?.type === "homeos-floorplan-auto-diagram-stopped") {
    const stoppedComponentId = String(data.componentId || ""),
      stoppedFrame = document.querySelector<HTMLIFrameElement>(
        '.hb-component[data-component-id="' +
          CSS.escape(stoppedComponentId) +
          '"] .hb-floorplan-auto-diagram-preview',
      );
    if (!stoppedFrame || lightingStateFrameState.source !== stoppedFrame.contentWindow) return;
    ((floorplanAutoDiagramOpenStudioButtonElement.disabled = false),
      stoppedComponentId === editorCtx.selectedComponentId &&
        (floorplanAutoDiagramFloorSelectElement.disabled = false),
      (floorplanAutoDiagramOpenStudioButtonElement.textContent = "确定位置大小并后台生成"),
      (floorplanAutoDiagramStatusElement.textContent = data.message || "已停止本次生成。"),
      data.reason === "rename" && floorplanAutoDiagramFolderTextInputElement.focus());
    return;
  }
  if (data?.type === "homeos-floorplan-auto-diagram-error") {
    const errorComponentId = String(data.componentId || ""),
      errorFrame = document.querySelector<HTMLIFrameElement>(
        '.hb-component[data-component-id="' +
          CSS.escape(errorComponentId) +
          '"] .hb-floorplan-auto-diagram-preview',
      );
    if (!errorFrame || lightingStateFrameState.source !== errorFrame.contentWindow) return;
    ((floorplanAutoDiagramOpenStudioButtonElement.disabled = false),
      errorComponentId === editorCtx.selectedComponentId &&
        (floorplanAutoDiagramFloorSelectElement.disabled = false),
      (floorplanAutoDiagramOpenStudioButtonElement.textContent = "确定位置大小并后台生成"),
      (floorplanAutoDiagramStatusElement.textContent = data.message || "后台生成失败，请重试。"));
    return;
  }
  if (!data || data.type !== "homeos-floorplan-auto-diagram-export") return;
  const exportComponentId = String(data.componentId || ""),
    exportFrame = document.querySelector<HTMLIFrameElement>(
      '.hb-component[data-component-id="' +
        CSS.escape(exportComponentId) +
        '"] .hb-floorplan-auto-diagram-preview',
    );
  if (!exportFrame || lightingStateFrameState.source !== exportFrame.contentWindow) return;
  const manifest = data.manifest,
    exportFolderId = String(data.folderName || manifest?.exportName || "").trim(),
    exportComponentElementState = data.saved || {
      relativePath: "exports/" + exportFolderId,
      overwritten: false,
    };
  if (!exportComponentId || !manifest || !exportFolderId) return;
  ((floorplanAutoDiagramOpenStudioButtonElement.disabled = false),
    (floorplanAutoDiagramOpenStudioButtonElement.textContent = "确定位置大小并后台生成"),
    (floorplanAutoDiagramStatusElement.textContent = "已生成，正在置换到仪表盘…"));
  const exportComponentElement = exportFrame.closest<HTMLElement>(".hb-component");
  (exportComponentElement && (exportComponentElement.hidden = true),
    mutateDocument(
      (exportDraftDocument: any) => {
        let componentLocation = findComponentLocation2(exportDraftDocument, exportComponentId);
        const diagramPage = componentLocation?.component;
        if (!diagramPage || diagramPage.type !== "floorplan-auto-diagram") return null;
        const scope2 = componentLocation.scope,
          root = scope2 === "shared" && componentLocation.root,
          sharedComponents2 =
            scope2 === "shared"
              ? exportDraftDocument.sharedComponents
              : componentLocation.page?.components || componentLocation.collection,
          autoDiagramComponents: any = [],
          collectAutoDiagramComponents = (componentBranch: any) => {
            for (const branchComponent of componentBranch || [])
              (branchComponent?.properties?.autoDiagramFolder === exportFolderId &&
                autoDiagramComponents.push(branchComponent),
                collectAutoDiagramComponents(branchComponent?.children));
          };
        collectAutoDiagramComponents(sharedComponents2);
        const baseImagesByRole = new Map<string, any>(
            autoDiagramComponents
              .filter((imageCandidate: any) => imageCandidate.type === "image")
              .map((imageComponentEntry: any) => [
                imageComponentEntry.properties?.autoDiagramRole === "base"
                  ? "background-with-plan"
                  : String(imageComponentEntry.properties?.autoDiagramRole || ""),
                imageComponentEntry,
              ]),
          ),
          lightEffectsByKey = new Map<string, any>(
            autoDiagramComponents
              .filter((effectCandidate: any) => effectCandidate.type === "icon-button-effect")
              .map((lightEffectComponent: any) => {
                const effectRoleKey = String(
                    lightEffectComponent.properties?.autoDiagramRole || "light-group",
                  ),
                  effectLayerId = String(
                    lightEffectComponent.properties?.autoDiagramLayerId ||
                      lightEffectComponent.properties?.autoDiagramGroupId ||
                      "",
                  );
                return [effectRoleKey + ":" + effectLayerId, lightEffectComponent];
              }),
          );
        for (const staleComponent of autoDiagramComponents)
          removeComponent(exportDraftDocument, staleComponent.id);
        if (
          ((componentLocation = findComponentLocation2(exportDraftDocument, exportComponentId)),
          !componentLocation)
        )
          return null;
        const documentWidthPx = Number(exportDraftDocument.canvas?.width || 2778),
          documentHeightPx = Number(exportDraftDocument.canvas?.height || 1940),
          resolutionWidth = Math.max(
            1,
            Number(manifest.resolution?.width || diagramPage.position?.width || 1),
          ),
          resolutionHeight = Math.max(
            1,
            Number(manifest.resolution?.height || diagramPage.position?.height || 1),
          ),
          sourceLayoutMode = diagramPage.properties?.layoutMode === "fill" ? "fill" : "free",
          diagramPositionValue = diagramPage.position || {},
          diagramScale =
            sourceLayoutMode === "fill"
              ? 1
              : Math.max(0.01, Math.min(5, Number(diagramPage.style?.scale || 1))),
          sourceWidth =
            sourceLayoutMode === "fill"
              ? documentWidthPx
              : Number(diagramPositionValue.width || 100),
          sourceHeight =
            sourceLayoutMode === "fill"
              ? documentHeightPx
              : Number(diagramPositionValue.height || 100),
          scaledWidth = sourceWidth * diagramScale,
          scaledHeight = sourceHeight * diagramScale,
          diagramX =
            sourceLayoutMode === "fill"
              ? 0
              : Number(diagramPositionValue.x || 0) - (scaledWidth - sourceWidth) / 2,
          diagramY =
            sourceLayoutMode === "fill"
              ? 0
              : Number(diagramPositionValue.y || 0) - (scaledHeight - sourceHeight) / 2,
          diagramRotation =
            sourceLayoutMode === "fill" ? 0 : Number(diagramPositionValue.rotation || 0),
          imageLayerComponents = [
            {
              role: "background",
              file: manifest.backgroundImage,
              label: "00底图",
              visible: true,
            },
            {
              role: "floor-plan",
              file: manifest.floorPlanImage,
              label: "00户型图",
              visible: true,
            },
            {
              role: "background-with-plan",
              file: manifest.baseImage,
              label: "00底图带户型",
              visible: false,
            },
          ]
            .filter((imageSpec) => imageSpec.file)
            .map((layerSpec) => {
              const existingLayerComponent = baseImagesByRole.get(layerSpec.role),
                layerComponent = existingLayerComponent
                  ? clone2(existingLayerComponent)
                  : createComponentFromTemplate2("image", {
                      id: newId2("component"),
                      instanceName: layerSpec.label,
                      canvas: exportDraftDocument.canvas,
                    });
              return (
                (layerComponent.position = {
                  ...(layerComponent.position || {}),
                  x: diagramX,
                  y: diagramY,
                  width: scaledWidth,
                  height: scaledHeight,
                  rotation: diagramRotation,
                }),
                (layerComponent.style = {
                  ...(layerComponent.style || {}),
                  scale: 1,
                  visible: existingLayerComponent
                    ? existingLayerComponent.style?.visible !== false
                    : layerSpec.visible,
                }),
                (layerComponent.bindings = {}),
                (layerComponent.actions = {}),
                (layerComponent.properties = {
                  ...(layerComponent.properties || {}),
                  instanceName: layerSpec.label,
                  label: layerSpec.label,
                  assetId: "studio3d:" + exportFolderId + "/" + layerSpec.file,
                  naturalWidth: resolutionWidth,
                  naturalHeight: resolutionHeight,
                  opacity: 1,
                  fit: "contain",
                  layoutMode: sourceLayoutMode,
                  autoDiagramFolder: exportFolderId,
                  autoDiagramRole: layerSpec.role,
                  autoDiagramCamera: manifest.camera || null,
                }),
                layerComponent
              );
            }),
          backgroundLayer = imageLayerComponents.find(
            (backgroundCandidate) =>
              backgroundCandidate.properties?.autoDiagramRole === "background",
          ),
          floorPlanLayer = imageLayerComponents.find(
            (floorPlanCandidate) => floorPlanCandidate.properties?.autoDiagramRole === "floor-plan",
          ),
          baseWithPlanLayer = imageLayerComponents.find(
            (baseWithPlanCandidate) =>
              baseWithPlanCandidate.properties?.autoDiagramRole === "background-with-plan",
          ),
          preferredBaseLayer = baseWithPlanLayer || floorPlanLayer || backgroundLayer,
          lightGroupSpecs = (Array.isArray(manifest.groups) ? manifest.groups : [])
            .filter(
              (groupEntry: any) =>
                String(groupEntry?.id || groupEntry?.groupId || "") && groupEntry?.file,
            )
            .map((groupSpec: any) => ({
              role: "light-group",
              id: String(groupSpec.id || groupSpec.groupId || ""),
              name: String(groupSpec.name || groupSpec.note || "灯组"),
              note: String(groupSpec.note || groupSpec.name || "灯组"),
              file: groupSpec.file,
              icon: "mdi:lightbulb-outline",
              anchor: groupSpec.anchor,
            })),
          screenSpecs = (Array.isArray(manifest.screens) ? manifest.screens : [])
            .filter(
              (screenEntry: any) =>
                String(screenEntry?.id || screenEntry?.itemId || "") && screenEntry?.file,
            )
            .map((screenSpec: any) => ({
              role: "television",
              id: String(screenSpec.id || screenSpec.itemId || ""),
              name: String(screenSpec.name || "电视画面"),
              note: String(screenSpec.name || "电视画面"),
              file: screenSpec.file,
              icon: "mdi:television",
              anchor: screenSpec.anchor,
            })),
          vehicleSpecs = (Array.isArray(manifest.vehicles) ? manifest.vehicles : [])
            .filter(
              (vehicleEntry: any) =>
                String(vehicleEntry?.id || vehicleEntry?.itemId || "") && vehicleEntry?.file,
            )
            .map((vehicleSpec: any) => ({
              role: "vehicle",
              id: String(vehicleSpec.id || vehicleSpec.itemId || ""),
              name: String(vehicleSpec.name || "汽车充电"),
              note: String(vehicleSpec.name || "汽车充电"),
              file: vehicleSpec.file,
              icon: "mdi:car-electric",
              anchor: vehicleSpec.anchor,
            })),
          overlaySpecs = [...screenSpecs, ...vehicleSpecs, ...lightGroupSpecs],
          diagramCenterX = diagramX + scaledWidth / 2,
          diagramCenterY = diagramY + scaledHeight / 2,
          diagramRotationRad = (diagramRotation * Math.PI) / 180,
          overlayScale = Math.min(scaledWidth / resolutionWidth, scaledHeight / resolutionHeight),
          overlaySourceWidth = resolutionWidth * overlayScale,
          overlaySourceHeight = resolutionHeight * overlayScale,
          placedOverlayAnchors: any = [],
          placeOverlayAnchor = (overlaySpecItem: any, overlayIndex: any, overlayWidthPx: any, overlayHeightPx: any) => {
            const anchorX = Number(overlaySpecItem.anchor?.x),
              anchorY = Number(overlaySpecItem.anchor?.y),
              defaultState = {
                x: overlaySpecs.length > 1 ? (overlayIndex + 1) / (overlaySpecs.length + 1) : 0.5,
                y: 0.9,
              },
              preferredAnchor =
                Number.isFinite(anchorX) && Number.isFinite(anchorY)
                  ? {
                      x: anchorX,
                      y: anchorY,
                    }
                  : defaultState,
              anchorSpacingX = Math.max(
                0.035,
                (overlayWidthPx / Math.max(overlaySourceWidth, 1)) * 1.08,
              ),
              anchorSpacingY = Math.max(
                0.045,
                (overlayHeightPx / Math.max(overlaySourceHeight, 1)) * 1.08,
              ),
              anchorCandidates = [[0, 0]];
            for (let ringIndex = 1; ringIndex <= 4; ringIndex += 1)
              anchorCandidates.push(
                [0, -anchorSpacingY * ringIndex],
                [anchorSpacingX * ringIndex, 0],
                [0, anchorSpacingY * ringIndex],
                [-anchorSpacingX * ringIndex, 0],
                [anchorSpacingX * ringIndex, -anchorSpacingY * ringIndex],
                [anchorSpacingX * ringIndex, anchorSpacingY * ringIndex],
                [-anchorSpacingX * ringIndex, anchorSpacingY * ringIndex],
                [-anchorSpacingX * ringIndex, -anchorSpacingY * ringIndex],
              );
            let chosenAnchor: any = null;
            for (const [offsetX, offsetY] of anchorCandidates) {
              const candidateState = {
                x: clampNumber2(
                  preferredAnchor.x + offsetX,
                  anchorSpacingX / 2,
                  1 - anchorSpacingX / 2,
                ),
                y: clampNumber2(
                  preferredAnchor.y + offsetY,
                  anchorSpacingY / 2,
                  1 - anchorSpacingY / 2,
                ),
              };
              if (
                !placedOverlayAnchors.some(
                  (placedAnchor: any) =>
                    Math.abs(candidateState.x - placedAnchor.x) <
                      (anchorSpacingX + placedAnchor.spacingX) / 2 &&
                    Math.abs(candidateState.y - placedAnchor.y) <
                      (anchorSpacingY + placedAnchor.spacingY) / 2,
                )
              ) {
                chosenAnchor = candidateState;
                break;
              }
            }
            return (
              (chosenAnchor ||= {
                x: clampNumber2(defaultState.x, anchorSpacingX / 2, 1 - anchorSpacingX / 2),
                y: clampNumber2(defaultState.y, anchorSpacingY / 2, 1 - anchorSpacingY / 2),
              }),
              placedOverlayAnchors.push({
                ...chosenAnchor,
                spacingX: anchorSpacingX,
                spacingY: anchorSpacingY,
              }),
              chosenAnchor
            );
          },
          placedEffectComponents = overlaySpecs.map((overlaySpec, overlaySpecIndex) => {
            const existingEffectComponent = lightEffectsByKey.get(
                overlaySpec.role + ":" + overlaySpec.id,
              ),
              effectComponentToPlace = existingEffectComponent
                ? clone2(existingEffectComponent)
                : createComponentFromTemplate2("icon-button-effect", {
                    id: newId2("component"),
                    instanceName: overlaySpec.name,
                    canvas: exportDraftDocument.canvas,
                  }),
              savedSceneAnchor = existingEffectComponent?.properties?.autoDiagramSceneAnchor,
              sceneAnchorChanged =
                !savedSceneAnchor ||
                Math.abs(Number(savedSceneAnchor.x) - Number(overlaySpec.anchor?.x)) > 0.002 ||
                Math.abs(Number(savedSceneAnchor.y) - Number(overlaySpec.anchor?.y)) > 0.002,
              layoutVersionStale =
                !!existingEffectComponent &&
                Number(existingEffectComponent.properties?.autoDiagramLayoutVersion || 0) <
                  AUTO_DIAGRAM_LAYOUT_VERSION,
              needsLayoutRefresh =
                !existingEffectComponent ||
                layoutVersionStale ||
                (overlaySpec.role === "light-group" && sceneAnchorChanged);
            let buttonAnchor = existingEffectComponent?.properties?.autoDiagramButtonAnchor || null;
            if (needsLayoutRefresh) {
              const placedEffectWidth = Number(
                  effectComponentToPlace.position?.width || documentWidthPx * 0.075,
                ),
                placedEffectHeight = Number(
                  effectComponentToPlace.position?.height || placedEffectWidth,
                ),
                effectScale = Math.max(
                  0.01,
                  Math.min(5, Number(effectComponentToPlace.style?.scale || 1)),
                );
              buttonAnchor = placeOverlayAnchor(
                overlaySpec,
                overlaySpecIndex,
                placedEffectWidth * effectScale,
                placedEffectHeight * effectScale,
              );
              const sourceAnchorX = -overlaySourceWidth / 2 + buttonAnchor.x * overlaySourceWidth,
                sourceAnchorY = -overlaySourceHeight / 2 + buttonAnchor.y * overlaySourceHeight,
                rotatedAnchorX =
                  sourceAnchorX * Math.cos(diagramRotationRad) -
                  sourceAnchorY * Math.sin(diagramRotationRad),
                rotatedAnchorY =
                  sourceAnchorX * Math.sin(diagramRotationRad) +
                  sourceAnchorY * Math.cos(diagramRotationRad);
              effectComponentToPlace.position = {
                ...(effectComponentToPlace.position || {}),
                x: diagramCenterX + rotatedAnchorX - placedEffectWidth / 2,
                y: diagramCenterY + rotatedAnchorY - placedEffectHeight / 2,
                rotation: diagramRotation,
              };
            } else {
              if (
                Number.isFinite(Number(buttonAnchor?.x)) &&
                Number.isFinite(Number(buttonAnchor?.y))
              ) {
                const existingEffectWidth = Number(
                    effectComponentToPlace.position?.width || documentWidthPx * 0.075,
                  ),
                  existingEffectHeight = Number(
                    effectComponentToPlace.position?.height || existingEffectWidth,
                  ),
                  existingEffectScale = Math.max(
                    0.01,
                    Math.min(5, Number(effectComponentToPlace.style?.scale || 1)),
                  );
                placedOverlayAnchors.push({
                  x: Number(buttonAnchor.x),
                  y: Number(buttonAnchor.y),
                  spacingX: Math.max(
                    0.035,
                    ((existingEffectWidth * existingEffectScale) /
                      Math.max(overlaySourceWidth, 1)) *
                      1.08,
                  ),
                  spacingY: Math.max(
                    0.045,
                    ((existingEffectHeight * existingEffectScale) /
                      Math.max(overlaySourceHeight, 1)) *
                      1.08,
                  ),
                });
              }
            }
            if (
              ((effectComponentToPlace.style = {
                ...(effectComponentToPlace.style || {}),
                visible: true,
              }),
              (effectComponentToPlace.bindings = {
                ...(effectComponentToPlace.bindings || {}),
              }),
              !existingEffectComponent && overlaySpec.role === "light-group")
            ) {
              const lightGroupBinding = diagramPage.bindings?.["lightGroup:" + overlaySpec.id];
              lightGroupBinding?.entityId &&
                (effectComponentToPlace.bindings.entity = {
                  entityId: lightGroupBinding.entityId,
                });
            }
            return (
              (effectComponentToPlace.actions = Object.keys(effectComponentToPlace.actions || {})
                .length
                ? {
                    ...(effectComponentToPlace.actions || {}),
                  }
                : {
                    tap: {
                      type: "toggle",
                    },
                  }),
              (effectComponentToPlace.properties = {
                ...(effectComponentToPlace.properties || {}),
                instanceName: overlaySpec.name,
                label: overlaySpec.name,
                note: overlaySpec.note,
                icon: existingEffectComponent?.properties?.icon || overlaySpec.icon,
                effectAssetId: "studio3d:" + exportFolderId + "/" + overlaySpec.file,
                effectNaturalWidth: resolutionWidth,
                effectNaturalHeight: resolutionHeight,
                effectReferenceImageId: preferredBaseLayer?.id || "",
                effectLayoutMode: sourceLayoutMode,
                effectLeft: (diagramCenterX / documentWidthPx) * 100,
                effectTop: (diagramCenterY / documentHeightPx) * 100,
                effectScale: 1,
                effectRotation: diagramRotation,
                autoDiagramFolder: exportFolderId,
                autoDiagramRole: overlaySpec.role,
                autoDiagramLayerId: overlaySpec.id,
                autoDiagramSceneAnchor: overlaySpec.anchor || null,
                autoDiagramButtonAnchor: buttonAnchor,
                autoDiagramLayoutVersion: AUTO_DIAGRAM_LAYOUT_VERSION,
                ...(overlaySpec.role === "light-group"
                  ? {
                      autoDiagramGroupId: overlaySpec.id,
                    }
                  : {}),
              }),
              effectComponentToPlace
            );
          }),
          filteredItemsRef = [floorPlanLayer, backgroundLayer, baseWithPlanLayer].filter(Boolean),
          baseLayerComponents = [...placedEffectComponents, ...filteredItemsRef],
          removedComponentIndex = componentLocation.index;
        if (
          (componentLocation.collection.splice(removedComponentIndex, 1, ...baseLayerComponents),
          applyCollectionLayerOrder2(componentLocation.collection),
          root)
        ) {
          const mappedItemsTarget = baseLayerComponents.map(
            (mappedItemsSource) => mappedItemsSource.id,
          );
          for (const spliceResult of exportDraftDocument.pages || []) {
            const selectedPlacedId = spliceResult.sharedComponentIds || [],
              indexOf6 = selectedPlacedId.indexOf(exportComponentId);
            indexOf6 < 0 ||
              (selectedPlacedId.splice(indexOf6, 1, ...mappedItemsTarget),
              (spliceResult.sharedComponentIds = [...new Set(selectedPlacedId)]));
          }
          syncSharedComponentReferenceOrder2(exportDraftDocument);
        }
        return {
          removed: true,
          selectedId:
            (backgroundLayer || floorPlanLayer || baseWithPlanLayer || placedEffectComponents[0])
              ?.id || null,
          buttonCount: placedEffectComponents.length,
          imageCount: filteredItemsRef.length,
        };
      },
      pageSelectElement.value,
      {
        throwOnError: true,
      },
    )
      .then((selectedPlacedIdState: any) => {
        if (!selectedPlacedIdState?.removed) {
          (exportComponentElement?.isConnected && (exportComponentElement.hidden = false),
            (floorplanAutoDiagramStatusElement.textContent =
              "图片已生成，但控件置换失败，请重试。"));
          return;
        }
        const selectedId = selectedPlacedIdState.selectedId;
        ((editorCtx.selectedComponentId = selectedId),
          (editorCtx.selectedComponentIdsSet = selectedId ? new Set([selectedId]) : new Set()),
          (editorCtx.selectionAnchorComponentId = selectedId),
          editorCtx.editorRenderer?.setSelectedComponents(selectedId ? [selectedId] : [], selectedId),
          renderComponentLists(),
          coverMotorButtonElement(),
          onWindowMessage(exportComponentElementState, selectedPlacedIdState));
      })
      .catch((caughtErrorEntry: any) => {
        (exportComponentElement?.isConnected && (exportComponentElement.hidden = false),
          (floorplanAutoDiagramStatusElement.textContent = "图片已生成，但控件置换失败，请重试。"),
          handleOperationError(caughtErrorEntry));
      }));
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
function exportSpliceError(...args: any[]): ReturnType<typeof exportSpliceErrorImpl> { return (exportSpliceErrorImpl as any)(navigationPreviewDeps(), ...args); }
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
function collectPageImages(...args: any[]): ReturnType<typeof collectPageImagesImpl> { return (collectPageImagesImpl as any)(navigationPreviewDeps(), ...args); }
function createImageAlignOption(...args: any[]): ReturnType<typeof createImageAlignOptionImpl> { return (createImageAlignOptionImpl as any)(navigationPreviewDeps(), ...args); }
function openImageAlignDialog(...args: any[]): ReturnType<typeof openImageAlignDialogImpl> { return (openImageAlignDialogImpl as any)(navigationPreviewDeps(), ...args); }
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
function applyAirConditionerPreviewState(...args: any[]): ReturnType<typeof applyAirConditionerPreviewStateImpl> { return (applyAirConditionerPreviewStateImpl as any)(navigationPreviewDeps(), ...args); }
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
function airflowSectionEvent(...args: any[]): ReturnType<typeof airflowSectionEventImpl> { return (airflowSectionEventImpl as any)(navigationPreviewDeps(), ...args); }
function previewSyncEventName(...args: any[]): ReturnType<typeof previewSyncEventNameImpl> { return (previewSyncEventNameImpl as any)(navigationPreviewDeps(), ...args); }
function onCoverSettingsKindClick(...args: any[]): ReturnType<typeof onCoverSettingsKindClickImpl> { return (onCoverSettingsKindClickImpl as any)(navigationPreviewDeps(), ...args); }
function coverKindDraftDocument(...args: any[]): ReturnType<typeof coverKindDraftDocumentImpl> { return (coverKindDraftDocumentImpl as any)(navigationPreviewDeps(), ...args); }
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
function navigationSavedPropertyKey(...args: any[]): ReturnType<typeof navigationSavedPropertyKeyImpl> { return (navigationSavedPropertyKeyImpl as any)(navigationPreviewDeps(), ...args); }
(timeInspectorElement.addEventListener("input", (timeInputEvent: any) => {
  const timeInspectorComponent = removedComponent();
  if (!timeInspectorComponent || timeInspectorComponent.type !== "time") return;
  const timeInputElement = timeInputEvent.target,
    colorPropertyKey = navigationSavedSettingById.get(timeInputElement);
  if (colorPropertyKey) {
    editorCtx.editorRenderer?.previewComponentProperties(timeInspectorComponent.id, {
      [colorPropertyKey]: timeInputElement.value,
    });
    return;
  }
  const timeConfig = navigationSavedPropertyKeyById.get(timeInputElement);
  if (timeConfig) {
    if (
      String(timeInputElement.value).trim() === "" ||
      !Number.isFinite(Number(timeInputElement.value))
    )
      return;
    const timePropertyValue =
        clampNumber2(Number(timeInputElement.value), timeConfig.minimum, timeConfig.maximum) /
        timeConfig.divisor,
      nextTimeProperties = {
        ...(timeInspectorComponent.properties || {}),
        [timeConfig.property]: timePropertyValue,
      };
    (editorCtx.editorRenderer?.previewComponentProperties(timeInspectorComponent.id, {
      [timeConfig.property]: timePropertyValue,
    }),
      timeConfig.resizes && navigationSavedPropertyKey(timeInspectorComponent, nextTimeProperties));
    return;
  }
  if (
    !navigationSavedPropertyKeySet.has(timeInputElement) ||
    String(timeInputElement.value).trim() === "" ||
    !Number.isFinite(Number(timeInputElement.value))
  )
    return;
  const timeNumericValue = Number(timeInputElement.value),
    timeCanvasWidth = Number(editorCtx.activeProject.document.canvas.width || 2778),
    timeCanvasHeight = Number(editorCtx.activeProject.document.canvas.height || 1940),
    timePositionWidth = Number(timeInspectorComponent.position?.width || 100),
    timePositionHeight = Number(timeInspectorComponent.position?.height || 100);
  if (timeInputElement === timeLeftElement) {
    const clampedTimeLeft = clampNumber2(timeNumericValue, 0, 100);
    editorCtx.editorRenderer?.previewComponentTransform(timeInspectorComponent.id, {
      x: (timeCanvasWidth * clampedTimeLeft) / 100 - timePositionWidth / 2,
    });
  } else {
    if (timeInputElement === timeTopElement) {
      const clampedTimeTop = clampNumber2(timeNumericValue, 0, 100);
      editorCtx.editorRenderer?.previewComponentTransform(timeInspectorComponent.id, {
        y: (timeCanvasHeight * clampedTimeTop) / 100 - timePositionHeight / 2,
      });
    } else {
      if (timeInputElement === timeScaleElement) {
        const clampedTimeScale = clampNumber2(timeNumericValue, 1, 500);
        editorCtx.editorRenderer?.previewComponentTransform(timeInspectorComponent.id, {
          scale: clampedTimeScale / 100,
        });
      } else {
        if (timeInputElement === timeRotationElement) {
          const clampedTimeRotation = clampNumber2(timeNumericValue, -360, 360);
          editorCtx.editorRenderer?.previewComponentTransform(timeInspectorComponent.id, {
            rotation: clampedTimeRotation,
          });
        }
      }
    }
  }
}),
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
function previewDateResize(...args: any[]): ReturnType<typeof previewDateResizeImpl> { return (previewDateResizeImpl as any)(navigationPreviewDeps(), ...args); }
(dateInspectorElement.addEventListener("input", (dateInputEvent: any) => {
  const dateInspectorComponent = removedComponent();
  if (!dateInspectorComponent || dateInspectorComponent.type !== "date") return;
  const dateInputElement = dateInputEvent.target,
    dateColorKey = dateColorPropertyByElement.get(dateInputElement);
  if (dateColorKey) {
    editorCtx.editorRenderer?.previewComponentProperties(dateInspectorComponent.id, {
      [dateColorKey]: dateInputElement.value,
    });
    return;
  }
  const dateConfig = datePropertyConfigsByElement.get(dateInputElement);
  if (dateConfig) {
    if (
      String(dateInputElement.value).trim() === "" ||
      !Number.isFinite(Number(dateInputElement.value))
    )
      return;
    const dateColorClampedValue =
        clampNumber2(Number(dateInputElement.value), dateConfig.minimum, dateConfig.maximum) /
        dateConfig.divisor,
      dateColorPropertyPatch = {
        ...(dateInspectorComponent.properties || {}),
        [dateConfig.property]: dateColorClampedValue,
      };
    (editorCtx.editorRenderer?.previewComponentProperties(dateInspectorComponent.id, {
      [dateConfig.property]: dateColorClampedValue,
    }),
      dateConfig.resizes && previewDateResize(dateInspectorComponent, dateColorPropertyPatch));
    return;
  }
  if (
    !dateTransformInputSet.has(dateInputElement) ||
    String(dateInputElement.value).trim() === "" ||
    !Number.isFinite(Number(dateInputElement.value))
  )
    return;
  const dateTransformInputNumber = Number(dateInputElement.value),
    dateTransformCanvasWidth = Number(editorCtx.activeProject.document.canvas.width || 2778),
    dateTransformCanvasHeight = Number(editorCtx.activeProject.document.canvas.height || 1940),
    dateTransformComponentWidth = Number(dateInspectorComponent.position?.width || 100),
    dateTransformComponentHeight = Number(dateInspectorComponent.position?.height || 100);
  if (dateInputElement === dateLeftElement) {
    const dateLeftPercent = clampNumber2(dateTransformInputNumber, 0, 100);
    editorCtx.editorRenderer?.previewComponentTransform(dateInspectorComponent.id, {
      x: (dateTransformCanvasWidth * dateLeftPercent) / 100 - dateTransformComponentWidth / 2,
    });
  } else {
    if (dateInputElement === dateTopElement) {
      const dateTopPercent = clampNumber2(dateTransformInputNumber, 0, 100);
      editorCtx.editorRenderer?.previewComponentTransform(dateInspectorComponent.id, {
        y: (dateTransformCanvasHeight * dateTopPercent) / 100 - dateTransformComponentHeight / 2,
      });
    } else {
      if (dateInputElement === dateScaleElement) {
        const dateScalePercent = clampNumber2(dateTransformInputNumber, 1, 500);
        editorCtx.editorRenderer?.previewComponentTransform(dateInspectorComponent.id, {
          scale: dateScalePercent / 100,
        });
      } else {
        if (dateInputElement === dateRotationElement) {
          const dateRotationDegrees = clampNumber2(dateTransformInputNumber, -360, 360);
          editorCtx.editorRenderer?.previewComponentTransform(dateInspectorComponent.id, {
            rotation: dateRotationDegrees,
          });
        }
      }
    }
  }
}),
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
function previewWeatherComponentResize(...args: any[]): ReturnType<typeof previewWeatherComponentResizeImpl> { return (previewWeatherComponentResizeImpl as any)(navigationPreviewDeps(), ...args); }
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
function setNavigationPreviewState(...args: any[]): ReturnType<typeof setNavigationPreviewStateImpl> { return (setNavigationPreviewStateImpl as any)(navigationPreviewDeps(), ...args); }
function applyNavigationPreviewState(...args: any[]): ReturnType<typeof applyNavigationPreviewStateImpl> { return (applyNavigationPreviewStateImpl as any)(navigationPreviewDeps(), ...args); }
function syncNavigationPreviewFromElement(...args: any[]): ReturnType<typeof syncNavigationPreviewFromElementImpl> { return (syncNavigationPreviewFromElementImpl as any)(navigationPreviewDeps(), ...args); }
const navigationTransformInputSet = new Set([
  navigationLeftElement,
  navigationTopElement,
  navigationWidthElement,
  navigationHeightElement,
  navigationScaleElement,
  navigationRotationElement,
]);
function navigationPropertyNameFromElement(...args: any[]): ReturnType<typeof navigationPropertyNameFromElementImpl> { return (navigationPropertyNameFromElementImpl as any)(navigationPreviewDeps(), ...args); }
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
function resolveComponentStyleValue(...args: any[]): ReturnType<typeof resolveComponentStyleValueImpl> { return (resolveComponentStyleValueImpl as any)(navigationPreviewDeps(), ...args); }
function collectChangedLineChartStyleKeys(...args: any[]): ReturnType<typeof collectChangedLineChartStyleKeysImpl> { return (collectChangedLineChartStyleKeysImpl as any)(navigationPreviewDeps(), ...args); }
function formatLineChartStyleValue(...args: any[]): ReturnType<typeof formatLineChartStyleValueImpl> { return (formatLineChartStyleValueImpl as any)(navigationPreviewDeps(), ...args); }
function resolveNavigationStyleValue(...args: any[]): ReturnType<typeof resolveNavigationStyleValueImpl> { return (resolveNavigationStyleValueImpl as any)(navigationPreviewDeps(), ...args); }
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
function collectChangedTitleButtonStyleKeys(...args: any[]): ReturnType<typeof collectChangedTitleButtonStyleKeysImpl> { return (collectChangedTitleButtonStyleKeysImpl as any)(styleApplyDeps(), ...args); }
function onNavigationStyleApplyCancelButtonClick(...args: any[]): ReturnType<typeof onNavigationStyleApplyCancelButtonClickImpl> { return (onNavigationStyleApplyCancelButtonClickImpl as any)(styleApplyDeps(), ...args); }
function onNavigationStyleApplyConfirmButtonClick(...args: any[]): ReturnType<typeof onNavigationStyleApplyConfirmButtonClickImpl> { return (onNavigationStyleApplyConfirmButtonClickImpl as any)(styleApplyDeps(), ...args); }
function collectChangedAirConditionerStyleKeys(...args: any[]): ReturnType<typeof collectChangedAirConditionerStyleKeysImpl> { return (collectChangedAirConditionerStyleKeysImpl as any)(styleApplyDeps(), ...args); }
function formatAirConditionerStyleValue(...args: any[]): ReturnType<typeof formatAirConditionerStyleValueImpl> { return (formatAirConditionerStyleValueImpl as any)(styleApplyDeps(), ...args); }
function resolveAirConditionerStyleValue(...args: any[]): ReturnType<typeof resolveAirConditionerStyleValueImpl> { return (resolveAirConditionerStyleValueImpl as any)(styleApplyDeps(), ...args); }
function collectChangedIconButtonEffectStyleKeys(...args: any[]): ReturnType<typeof collectChangedIconButtonEffectStyleKeysImpl> { return (collectChangedIconButtonEffectStyleKeysImpl as any)(styleApplyDeps(), ...args); }
function formatIconButtonEffectStyleValue(...args: any[]): ReturnType<typeof formatIconButtonEffectStyleValueImpl> { return (formatIconButtonEffectStyleValueImpl as any)(styleApplyDeps(), ...args); }
function normalizeSensorKind(...args: any[]): ReturnType<typeof normalizeSensorKindImpl> { return (normalizeSensorKindImpl as any)(styleApplyDeps(), ...args); }
function formatSensorKindLabel(...args: any[]): ReturnType<typeof formatSensorKindLabelImpl> { return (formatSensorKindLabelImpl as any)(styleApplyDeps(), ...args); }
function resolvePresenceSensorStyleKeys(...args: any[]): ReturnType<typeof resolvePresenceSensorStyleKeysImpl> { return (resolvePresenceSensorStyleKeysImpl as any)(styleApplyDeps(), ...args); }
function styleTargetCheckbox(...args: any[]): ReturnType<typeof styleTargetCheckboxImpl> { return (styleTargetCheckboxImpl as any)(styleApplyDeps(), ...args); }
function appliedStylePropertyKey(...args: any[]): ReturnType<typeof appliedStylePropertyKeyImpl> { return (appliedStylePropertyKeyImpl as any)(styleApplyDeps(), ...args); }
function onNavigationIconCopyButtonClick(...args: any[]): ReturnType<typeof onNavigationIconCopyButtonClickImpl> { return (onNavigationIconCopyButtonClickImpl as any)(styleApplyDeps(), ...args); }
function navigationIconCopyError(...args: any[]): ReturnType<typeof navigationIconCopyErrorImpl> { return (navigationIconCopyErrorImpl as any)(styleApplyDeps(), ...args); }
function resolveCameraStyleValue(...args: any[]): ReturnType<typeof resolveCameraStyleValueImpl> { return (resolveCameraStyleValueImpl as any)(styleApplyDeps(), ...args); }
function collectChangedCameraStyleKeys(...args: any[]): ReturnType<typeof collectChangedCameraStyleKeysImpl> { return (collectChangedCameraStyleKeysImpl as any)(styleApplyDeps(), ...args); }
function formatCameraStyleValue(...args: any[]): ReturnType<typeof formatCameraStyleValueImpl> { return (formatCameraStyleValueImpl as any)(styleApplyDeps(), ...args); }
function resolvePanelFrameStyleValue(...args: any[]): ReturnType<typeof resolvePanelFrameStyleValueImpl> { return (resolvePanelFrameStyleValueImpl as any)(styleApplyDeps(), ...args); }
function collectChangedPanelFrameStyleKeys(...args: any[]): ReturnType<typeof collectChangedPanelFrameStyleKeysImpl> { return (collectChangedPanelFrameStyleKeysImpl as any)(styleApplyDeps(), ...args); }
function formatPanelFrameStyleValue(...args: any[]): ReturnType<typeof formatPanelFrameStyleValueImpl> { return (formatPanelFrameStyleValueImpl as any)(styleApplyDeps(), ...args); }
function entryStateRecord(...args: any[]): ReturnType<typeof entryStateRecordImpl> { return (entryStateRecordImpl as any)(styleApplyDeps(), ...args); }
function areStyleValuesEqual(...args: any[]): ReturnType<typeof areStyleValuesEqualImpl> { return (areStyleValuesEqualImpl as any)(styleApplyDeps(), ...args); }
function onImageAssetUploadButtonClick(...args: any[]): ReturnType<typeof onImageAssetUploadButtonClickImpl> { return (onImageAssetUploadButtonClickImpl as any)(styleApplyDeps(), ...args); }
function onAssetOptionsClick(...args: any[]): ReturnType<typeof onAssetOptionsClickImpl> { return (onAssetOptionsClickImpl as any)(styleApplyDeps(), ...args); }
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
function collectPendingNavigationStyleKeys(...args: any[]): ReturnType<typeof collectPendingNavigationStyleKeysImpl> { return (collectPendingNavigationStyleKeysImpl as any)(styleDialogsDeps(), ...args); }
function onDeleteAssetCancelButtonClick(...args: any[]): ReturnType<typeof onDeleteAssetCancelButtonClickImpl> { return (onDeleteAssetCancelButtonClickImpl as any)(styleDialogsDeps(), ...args); }
/** 导航「套用到其它控件」目标列表（P4 搬进 `navigation-style-apply/target-options`，此处只转发句柄）。 */
const navigationStyleApplyTargetDeps = () => ({ navigationStyleApplyTargetsElement });
function applyNavigationStyleToTargets(...args: any[]): ReturnType<typeof applyNavigationStyleToTargetsImpl> { return (applyNavigationStyleToTargetsImpl as any)(styleDialogsDeps(), ...args); }
function openNavigationStyleApplyDialog(...args: any[]): ReturnType<typeof openNavigationStyleApplyDialogImpl> { return (openNavigationStyleApplyDialogImpl as any)(styleDialogsDeps(), ...args); }
function onImageAssetFolderSelectChange(...args: any[]): ReturnType<typeof onImageAssetFolderSelectChangeImpl> { return (onImageAssetFolderSelectChangeImpl as any)(styleDialogsDeps(), ...args); }
function imageAssetPointerOverEvent(...args: any[]): ReturnType<typeof imageAssetPointerOverEventImpl> { return (imageAssetPointerOverEventImpl as any)(styleDialogsDeps(), ...args); }
function imageAssetClickEvent(...args: any[]): ReturnType<typeof imageAssetClickEventImpl> { return (imageAssetClickEventImpl as any)(styleDialogsDeps(), ...args); }
function openCameraStyleApplyDialog(...args: any[]): ReturnType<typeof openCameraStyleApplyDialogImpl> { return (openCameraStyleApplyDialogImpl as any)(styleDialogsDeps(), ...args); }
function openTitleButtonStyleApplyDialog(...args: any[]): ReturnType<typeof openTitleButtonStyleApplyDialogImpl> { return (openTitleButtonStyleApplyDialogImpl as any)(styleDialogsDeps(), ...args); }
function openIconButtonEffectStyleApplyDialog(...args: any[]): ReturnType<typeof openIconButtonEffectStyleApplyDialogImpl> { return (openIconButtonEffectStyleApplyDialogImpl as any)(styleDialogsDeps(), ...args); }
function openAirConditionerStyleApplyDialog(...args: any[]): ReturnType<typeof openAirConditionerStyleApplyDialogImpl> { return (openAirConditionerStyleApplyDialogImpl as any)(styleDialogsDeps(), ...args); }
function openIconButtonStyleApplyDialog(...args: any[]): ReturnType<typeof openIconButtonStyleApplyDialogImpl> { return (openIconButtonStyleApplyDialogImpl as any)(styleDialogsDeps(), ...args); }
function imageAssetMeasureError(...args: any[]): ReturnType<typeof imageAssetMeasureErrorImpl> { return (imageAssetMeasureErrorImpl as any)(styleDialogsDeps(), ...args); }
function applyInspectorDimensionChange(...args: any[]): ReturnType<typeof applyInspectorDimensionChangeImpl> { return (applyInspectorDimensionChangeImpl as any)(styleDialogsDeps(), ...args); }
function onIconButtonEffectAssetFolderSelectChange(...args: any[]): ReturnType<typeof onIconButtonEffectAssetFolderSelectChangeImpl> { return (onIconButtonEffectAssetFolderSelectChangeImpl as any)(styleDialogsDeps(), ...args); }
function applyEffectAssetDimensionChange(...args: any[]): ReturnType<typeof applyEffectAssetDimensionChangeImpl> { return (applyEffectAssetDimensionChangeImpl as any)(styleDialogsDeps(), ...args); }
function applyCameraDimensionChange(...args: any[]): ReturnType<typeof applyCameraDimensionChangeImpl> { return (applyCameraDimensionChangeImpl as any)(styleDialogsDeps(), ...args); }
function applyLineChartDimensionChange(...args: any[]): ReturnType<typeof applyLineChartDimensionChangeImpl> { return (applyLineChartDimensionChangeImpl as any)(styleDialogsDeps(), ...args); }
function recoveredComponentId(...args: any[]): ReturnType<typeof recoveredComponentIdImpl> { return (recoveredComponentIdImpl as any)(styleDialogsDeps(), ...args); }
function onErrorDialogCloseButtonClick(...args: any[]): ReturnType<typeof onErrorDialogCloseButtonClickImpl> { return (onErrorDialogCloseButtonClickImpl as any)(styleDialogsDeps(), ...args); }
function onShowSharedComponentsButtonClick(...args: any[]): ReturnType<typeof onShowSharedComponentsButtonClickImpl> { return (onShowSharedComponentsButtonClickImpl as any)(styleDialogsDeps(), ...args); }
function onComponentTemplateDialogClick(...args: any[]): ReturnType<typeof onComponentTemplateDialogClickImpl> { return (onComponentTemplateDialogClickImpl as any)(styleDialogsDeps(), ...args); }
(navigationApplyStyleElement.addEventListener("click", openNavigationStyleApplyDialog),
  panelFrameApplyStyleButtonElement.addEventListener("click", imageAssetClickEvent),
  cameraApplyStyleElement.addEventListener("click", openCameraStyleApplyDialog),
  titleButtonApplyStyleElement.addEventListener("click", openTitleButtonStyleApplyDialog),
  lineChartApplyStyleButtonElement.addEventListener("click", imageAssetMeasureError),
  ibeApplyStyleElement.addEventListener("click", openIconButtonEffectStyleApplyDialog),
  iconButtonApplyStyleElement.addEventListener("click", openIconButtonStyleApplyDialog),
  airConditionerApplyStyleElement.addEventListener("click", openAirConditionerStyleApplyDialog),
  navigationStyleApplyCloseElement.addEventListener("click", () =>
    navigationStyleApplyDialogElement.close(),
  ),
  navigationStyleApplyCancelElement.addEventListener("click", () =>
    navigationStyleApplyDialogElement.close(),
  ),
  navigationStyleApplyDialogElement.addEventListener("click", (onImageAssetButtonClickState: any) => {
    onImageAssetButtonClickState.target === navigationStyleApplyDialogElement &&
      navigationStyleApplyDialogElement.close();
  }),
  navigationStyleApplyDialogElement.addEventListener("close", () => {
    editorCtx.appliedStyleRecord = null;
  }),
  navigationStyleApplyConfirmElement.addEventListener("click", () => {
    const templateItemElementState = editorCtx.appliedStyleRecord?.sourceId,
      isImageAssetMenuHiddenState = editorCtx.appliedStyleRecord?.type,
      mappedItemsMode = [
        ...navigationStyleApplyPropertiesElement.querySelectorAll(
          "[data-navigation-style-property]:checked",
        ),
      ].map(
        (imageAssetCatalogErrorElement) =>
          imageAssetCatalogErrorElement.dataset.navigationStyleProperty,
      ),
      mappedItemsLevel = [
        ...navigationStyleApplyTargetsElement.querySelectorAll(
          "[data-navigation-target-id]:checked",
        ),
      ].map(
        (onImageAssetFolderSelectChangeElement) =>
          onImageAssetFolderSelectChangeElement.dataset.navigationTargetId,
      );
    if (!templateItemElementState || !mappedItemsMode.length || !mappedItemsLevel.length) {
      const templatePagePathState =
        isImageAssetMenuHiddenState === "percentage-bar"
          ? "百分比柱状图"
          : isImageAssetMenuHiddenState === "flow-line"
            ? "流水线条"
            : isImageAssetMenuHiddenState === "panel-frame"
              ? "底图框"
              : isImageAssetMenuHiddenState === "camera"
                ? "摄像头实时预览"
                : isImageAssetMenuHiddenState === "title-button"
                  ? "标题按钮"
                  : isImageAssetMenuHiddenState === "air-conditioner"
                    ? "空调"
                    : isImageAssetMenuHiddenState === "line-chart"
                      ? "折线图"
                      : isImageAssetMenuHiddenState === "icon-button-effect"
                        ? "图标按钮（效果）"
                        : isImageAssetMenuHiddenState === "icon-button"
                          ? "图标按钮"
                          : isImageAssetMenuHiddenState === "device-button"
                            ? "设备按钮"
                            : isImageAssetMenuHiddenState === "presence-sensor"
                              ? "传感器"
                              : isImageAssetMenuHiddenState === "scene-mode"
                                ? "情景模式"
                                : "导航按钮";
      ((navigationStyleApplyMessageElement.textContent =
        "请至少选择一项修改和一个目标" + templatePagePathState + "。"),
        (navigationStyleApplyMessageElement.hidden = false));
      return;
    }
    (navigationStyleApplyDialogElement.close(),
      mutateDocument((onImageAssetSearchInputInputState: any) => {
        const templatePagePath = findComponent2(
          onImageAssetSearchInputInputState,
          templateItemElementState,
        )?.component;
        if (!(!templatePagePath || templatePagePath.type !== isImageAssetMenuHiddenState))
          for (const onImageAssetOptionsPointeroverState of mappedItemsLevel) {
            const currentComponentScope = findComponent2(
              onImageAssetSearchInputInputState,
              onImageAssetOptionsPointeroverState,
            )?.component;
            if (
              !(
                !currentComponentScope || currentComponentScope.type !== isImageAssetMenuHiddenState
              ) &&
              !(
                isImageAssetMenuHiddenState === "presence-sensor" &&
                normalizeSensorKind(currentComponentScope) !== normalizeSensorKind(templatePagePath)
              )
            ) {
              for (const imageAssetPointerOverEventState of mappedItemsMode)
                isImageAssetMenuHiddenState === "flow-line"
                  ? applyFlowLineStyle2(templatePagePath, currentComponentScope, [
                      imageAssetPointerOverEventState,
                    ])
                  : isImageAssetMenuHiddenState === "panel-frame"
                    ? applyEffectAssetDimensionChange(
                        templatePagePath,
                        currentComponentScope,
                        imageAssetPointerOverEventState,
                      )
                    : isImageAssetMenuHiddenState === "camera"
                      ? applyCameraDimensionChange(
                          templatePagePath,
                          currentComponentScope,
                          imageAssetPointerOverEventState,
                        )
                      : isImageAssetMenuHiddenState === "title-button"
                        ? onErrorDialogCloseButtonClick(
                            templatePagePath,
                            currentComponentScope,
                            imageAssetPointerOverEventState,
                          )
                        : isImageAssetMenuHiddenState === "line-chart"
                          ? applyLineChartDimensionChange(
                              templatePagePath,
                              currentComponentScope,
                              imageAssetPointerOverEventState,
                            )
                          : isImageAssetMenuHiddenState === "percentage-bar"
                            ? applyPercentageBarChange2(
                                currentComponentScope,
                                {
                                  property: imageAssetPointerOverEventState,
                                  value:
                                    templatePagePath.properties?.[
                                      imageAssetPointerOverEventState
                                    ] ?? (percentageBarDefaults2 as any)[imageAssetPointerOverEventState],
                                },
                                onImageAssetSearchInputInputState.canvas,
                              )
                            : isImageAssetMenuHiddenState === "icon-button-effect"
                              ? recoveredComponentId(
                                  templatePagePath,
                                  currentComponentScope,
                                  imageAssetPointerOverEventState,
                                )
                              : isImageAssetMenuHiddenState === "air-conditioner"
                                ? onComponentTemplateDialogClick(
                                    templatePagePath,
                                    currentComponentScope,
                                    imageAssetPointerOverEventState,
                                  )
                                : ["icon-button", "device-button", "presence-sensor"].includes(
                                      isImageAssetMenuHiddenState,
                                    )
                                  ? onShowSharedComponentsButtonClick(
                                      templatePagePath,
                                      currentComponentScope,
                                      imageAssetPointerOverEventState,
                                    )
                                  : onIconButtonEffectAssetFolderSelectChange(
                                      templatePagePath,
                                      currentComponentScope,
                                      imageAssetPointerOverEventState,
                                    );
            }
          }
      }).then(() => {
        if (isImageAssetMenuHiddenState === "flow-line") {
          const flowLineApplyStyleElement = findElement("#flow-line-apply-style");
          (window.clearTimeout(editorCtx.coverMotorDirectionValue),
            flowLineApplyStyleElement?.classList.add("applied"),
            (editorCtx.coverMotorDirectionValue = window.setTimeout(() => {
              (flowLineApplyStyleElement?.classList.remove("applied"),
                editorCtx.selectedComponentId === templateItemElementState && coverMotorButtonElement());
            }, 1800)));
          return;
        }
        if (isImageAssetMenuHiddenState === "percentage-bar") {
          coverMotorButtonElement();
          return;
        }
        const $c2 =
          isImageAssetMenuHiddenState === "panel-frame"
            ? panelFrameApplyStyleButtonElement
            : isImageAssetMenuHiddenState === "camera"
              ? cameraApplyStyleElement
              : isImageAssetMenuHiddenState === "title-button"
                ? titleButtonApplyStyleElement
                : isImageAssetMenuHiddenState === "air-conditioner"
                  ? airConditionerApplyStyleElement
                  : isImageAssetMenuHiddenState === "line-chart"
                    ? lineChartApplyStyleButtonElement
                    : isImageAssetMenuHiddenState === "icon-button-effect"
                      ? ibeApplyStyleElement
                      : ["icon-button", "device-button", "presence-sensor"].includes(
                            isImageAssetMenuHiddenState,
                          )
                        ? iconButtonApplyStyleElement
                        : navigationApplyStyleElement;
        (isImageAssetMenuHiddenState === "panel-frame"
          ? window.clearTimeout(editorCtx.panelFrameApplyFeedbackTimeoutId)
          : isImageAssetMenuHiddenState === "camera"
            ? window.clearTimeout(editorCtx.cameraApplyFeedbackTimeoutId)
            : isImageAssetMenuHiddenState === "title-button"
              ? window.clearTimeout(editorCtx.titleButtonApplyFeedbackTimeoutId)
              : isImageAssetMenuHiddenState === "air-conditioner"
                ? window.clearTimeout(editorCtx.airConditionerApplyFeedbackTimeoutId)
                : isImageAssetMenuHiddenState === "line-chart"
                  ? window.clearTimeout(editorCtx.lineChartApplyFeedbackTimeoutId)
                  : isImageAssetMenuHiddenState === "icon-button-effect"
                    ? window.clearTimeout(editorCtx.effectApplyFeedbackTimeoutId)
                    : ["icon-button", "device-button", "presence-sensor"].includes(
                          isImageAssetMenuHiddenState,
                        )
                      ? window.clearTimeout(editorCtx.deviceButtonApplyFeedbackTimeoutId)
                      : window.clearTimeout(editorCtx.navigationApplyFeedbackTimeoutId),
          $c2.classList.add("applied"));
        const hoveredAssetState = window.setTimeout(() => {
          ($c2.classList.remove("applied"),
            editorCtx.selectedComponentId === templateItemElementState && coverMotorButtonElement());
        }, 1800);
        isImageAssetMenuHiddenState === "panel-frame"
          ? (editorCtx.panelFrameApplyFeedbackTimeoutId = hoveredAssetState)
          : isImageAssetMenuHiddenState === "camera"
            ? (editorCtx.cameraApplyFeedbackTimeoutId = hoveredAssetState)
            : isImageAssetMenuHiddenState === "title-button"
              ? (editorCtx.titleButtonApplyFeedbackTimeoutId = hoveredAssetState)
              : isImageAssetMenuHiddenState === "air-conditioner"
                ? (editorCtx.airConditionerApplyFeedbackTimeoutId = hoveredAssetState)
                : isImageAssetMenuHiddenState === "line-chart"
                  ? (editorCtx.lineChartApplyFeedbackTimeoutId = hoveredAssetState)
                  : isImageAssetMenuHiddenState === "icon-button-effect"
                    ? (editorCtx.effectApplyFeedbackTimeoutId = hoveredAssetState)
                    : ["icon-button", "device-button", "presence-sensor"].includes(
                          isImageAssetMenuHiddenState,
                        )
                      ? (editorCtx.deviceButtonApplyFeedbackTimeoutId = hoveredAssetState)
                      : (editorCtx.navigationApplyFeedbackTimeoutId = hoveredAssetState);
      }));
  }),
  navigationIconButtonElement.addEventListener("click", () => {
    const hidden5 = navigationIconMenuElement.hidden;
    (closeOtherPickerMenus(hidden5 ? "navigation-icon" : null),
      (navigationIconMenuElement.hidden = !hidden5),
      navigationIconButtonElement.setAttribute("aria-expanded", String(hidden5)),
      hidden5 &&
        iconTooltipElementCount(navigationIconSearchElement.value)
          .then(() => {
            (positionNavigationIconMenu(),
              navigationIconSearchElement.focus({
                preventScroll: true,
              }));
          })
          .catch(handleOperationError));
  }),
  navigationIconCopyElement.addEventListener("click", async () => {
    const activeGroupEntry = removedComponent()?.properties?.icon || "";
    if (activeGroupEntry)
      try {
        (await copyTextToClipboard(activeGroupEntry),
          window.clearTimeout(editorCtx.navigationIconCopiedTimeoutId),
          navigationIconCopyElement.classList.add("copied"),
          (editorCtx.navigationIconCopiedTimeoutId = window.setTimeout(
            () => navigationIconCopyElement.classList.remove("copied"),
            1200,
          )));
      } catch (caughtErrorRecord: any) {
        handleOperationError(caughtErrorRecord);
      }
  }),
  navigationIconSearchElement.addEventListener("input", () => {
    (window.clearTimeout(editorCtx.navigationIconSearchDebounceTimeoutId),
      (editorCtx.navigationIconSearchDebounceTimeoutId = window.setTimeout(() => {
        iconTooltipElementCount(navigationIconSearchElement.value).catch(handleOperationError);
      }, 160)));
  }),
  navigationIconOptionsElement.addEventListener("click", (onImageAssetOptionsClickState: any) => {
    const activeGroupChildComponentElement =
        onImageAssetOptionsClickState.target.closest("[data-icon-name]"),
      activeGroupChildComponent = editorCtx.selectedComponentId;
    if (!activeGroupChildComponentElement || !activeGroupChildComponent) return;
    const iconName = activeGroupChildComponentElement.dataset.iconName;
    (closeOtherPickerMenus(),
      mutateDocument((imageAssetClickEventState: any) => {
        const templateTargetScope = findComponent2(
          imageAssetClickEventState,
          activeGroupChildComponent,
        )?.component;
        if (!templateTargetScope || !navigationLabelTextInputElement(templateTargetScope)) return;
        const $e9 = entryStateRecord(templateTargetScope, "icon"),
          newComponentId = entryStateRecord(templateTargetScope, "iconVisible");
        ((templateTargetScope.properties = {
          ...(templateTargetScope.properties || {}),
          icon: iconName,
          iconVisible: !!iconName,
        }),
          onImageAssetUploadButtonClick(
            activeGroupChildComponent,
            "icon",
            $e9,
            entryStateRecord(templateTargetScope, "icon"),
          ),
          onImageAssetUploadButtonClick(
            activeGroupChildComponent,
            "iconVisible",
            newComponentId,
            entryStateRecord(templateTargetScope, "iconVisible"),
          ));
      }));
  }),
  ibeIconButtonElement.addEventListener("click", () => {
    const hidden6 = ibeIconMenuElement.hidden;
    (closeOtherPickerMenus(hidden6 ? "ibe-icon" : null),
      (ibeIconMenuElement.hidden = !hidden6),
      ibeIconButtonElement.setAttribute("aria-expanded", String(hidden6)),
      hidden6 &&
        iconTooltipElementFlag(ibeIconSearchElement.value)
          .then(() => {
            (positionIbeIconMenu(),
              ibeIconSearchElement.focus({
                preventScroll: true,
              }));
          })
          .catch(handleOperationError));
  }),
  ibeIconCopyElement.addEventListener("click", async () => {
    const createdInstanceTotal = removedComponent()?.properties?.icon || "";
    if (createdInstanceTotal)
      try {
        (await copyTextToClipboard(createdInstanceTotal),
          window.clearTimeout(editorCtx.effectIconCopiedTimeoutId),
          ibeIconCopyElement.classList.add("copied"),
          (editorCtx.effectIconCopiedTimeoutId = window.setTimeout(
            () => ibeIconCopyElement.classList.remove("copied"),
            1200,
          )));
      } catch (createComponentPromise: any) {
        handleOperationError(createComponentPromise);
      }
  }),
  ibeIconSearchElement.addEventListener("input", () => {
    (window.clearTimeout(editorCtx.effectIconSearchDebounceTimeoutId),
      (editorCtx.effectIconSearchDebounceTimeoutId = window.setTimeout(
        () => iconTooltipElementFlag(ibeIconSearchElement.value).catch(handleOperationError),
        160,
      )));
  }),
  ibeIconOptionsElement.addEventListener("click", (createComponentPromiseState: any) => {
    const createComponentPromiseElement =
        createComponentPromiseState.target.closest("[data-icon-name]"),
      imageAssetIdState = editorCtx.selectedComponentId;
    if (!createComponentPromiseElement || !imageAssetIdState) return;
    const iconName2 = createComponentPromiseElement.dataset.iconName;
    (closeOtherPickerMenus(),
      mutateDocument((imageAssetDraftDocumentState: any) => {
        const templateDraftDocumentState = findComponent2(
          imageAssetDraftDocumentState,
          imageAssetIdState,
        )?.component;
        !templateDraftDocumentState ||
          templateDraftDocumentState.type !== "icon-button-effect" ||
          (templateDraftDocumentState.properties = {
            ...(templateDraftDocumentState.properties || {}),
            icon: iconName2,
          });
      }));
  }),
  iconButtonIconButtonElement.addEventListener("click", () => {
    const hidden7 = iconButtonIconMenuElement.hidden;
    (closeOtherPickerMenus(hidden7 ? "icon-button-icon" : null),
      (iconButtonIconMenuElement.hidden = !hidden7),
      iconButtonIconButtonElement.setAttribute("aria-expanded", String(hidden7)),
      hidden7 &&
        iconTooltipElementStep(iconButtonIconSearchElement.value)
          .then(() => {
            (positionIconButtonIconMenu(),
              iconButtonIconSearchElement.focus({
                preventScroll: true,
              }));
          })
          .catch(handleOperationError));
  }),
  iconButtonIconCopyElement.addEventListener("click", async () => {
    const createdInstanceFlag = removedComponent()?.properties?.icon || "";
    if (createdInstanceFlag)
      try {
        (await copyTextToClipboard(createdInstanceFlag),
          window.clearTimeout(editorCtx.deviceIconCopiedTimeoutId),
          iconButtonIconCopyElement.classList.add("copied"),
          (editorCtx.deviceIconCopiedTimeoutId = window.setTimeout(
            () => iconButtonIconCopyElement.classList.remove("copied"),
            1200,
          )));
      } catch (caughtErrorName: any) {
        handleOperationError(caughtErrorName);
      }
  }),
  iconButtonIconSearchElement.addEventListener("input", () => {
    (window.clearTimeout(editorCtx.deviceIconSearchDebounceTimeoutId),
      (editorCtx.deviceIconSearchDebounceTimeoutId = window.setTimeout(
        () => iconTooltipElementStep(iconButtonIconSearchElement.value).catch(handleOperationError),
        160,
      )));
  }),
  iconButtonIconOptionsElement.addEventListener("click", (templateDraftDocument: any) => {
    const templateTargetPageElement = templateDraftDocument.target.closest("[data-icon-name]"),
      templatePageMatchState = editorCtx.selectedComponentId;
    if (!templateTargetPageElement || !templatePageMatchState) return;
    const iconName3 = templateTargetPageElement.dataset.iconName;
    (closeOtherPickerMenus(),
      mutateDocument((templatePageMatch: any) => {
        const draftGroupEntry = findComponent2(
          templatePageMatch,
          templatePageMatchState,
        )?.component;
        !draftGroupEntry ||
          !["icon-button", "device-button", "presence-sensor"].includes(draftGroupEntry.type) ||
          (draftGroupEntry.properties = {
            ...(draftGroupEntry.properties || {}),
            icon: iconName3,
          });
      }));
  }),
  titleButtonIconButtonElement.addEventListener("click", (draftGroupComponentState: any) => {
    (draftGroupComponentState.preventDefault(), draftGroupComponentState.stopPropagation());
    const hidden8 = titleButtonIconMenuElement.hidden;
    (closeOtherPickerMenus(hidden8 ? "title-button-icon" : null),
      hidden8 &&
        titleButtonIconMenuElement.parentElement !== document.body &&
        document.body.append(titleButtonIconMenuElement),
      (titleButtonIconMenuElement.hidden = !hidden8),
      (titleButtonIconMenuElement.style.position = "fixed"),
      (titleButtonIconMenuElement.style.zIndex = "760"),
      titleButtonIconButtonElement.setAttribute("aria-expanded", String(hidden8)),
      hidden8 &&
        (layoutTitleButtonIconMenu(),
        iconTooltipElementStore(titleButtonIconSearchElement.value)
          .then(() => {
            (layoutTitleButtonIconMenu(),
              titleButtonIconSearchElement.focus({
                preventScroll: true,
              }));
          })
          .catch(handleOperationError)));
  }),
  titleButtonIconCopyElement.addEventListener("click", async () => {
    const draftGroupComponent = removedComponent()?.properties?.icon || "";
    if (draftGroupComponent)
      try {
        (await copyTextToClipboard(draftGroupComponent),
          window.clearTimeout(editorCtx.titleButtonIconCopiedTimeoutId),
          titleButtonIconCopyElement.classList.add("copied"),
          (editorCtx.titleButtonIconCopiedTimeoutId = window.setTimeout(
            () => titleButtonIconCopyElement.classList.remove("copied"),
            1200,
          )));
      } catch (caughtErrorKey: any) {
        handleOperationError(caughtErrorKey);
      }
  }),
  titleButtonIconSearchElement.addEventListener("input", () => {
    (window.clearTimeout(editorCtx.titleButtonIconSearchDebounceTimeoutId),
      (editorCtx.titleButtonIconSearchDebounceTimeoutId = window.setTimeout(
        () =>
          iconTooltipElementStore(titleButtonIconSearchElement.value).catch(handleOperationError),
        160,
      )));
  }),
  titleButtonIconOptionsElement.addEventListener("click", (imageAssetSizeDraftDocumentState: any) => {
    const targetComponentCollectionElement =
        imageAssetSizeDraftDocumentState.target.closest("[data-icon-name]"),
      targetComponentCollection = editorCtx.selectedComponentId;
    if (!targetComponentCollectionElement || !targetComponentCollection) return;
    const iconName4 = targetComponentCollectionElement.dataset.iconName;
    (closeOtherPickerMenus(),
      mutateDocument((imageAssetMeasureErrorState: any) => {
        const insertionCollection = findComponent2(
          imageAssetMeasureErrorState,
          targetComponentCollection,
        )?.component;
        !insertionCollection ||
          insertionCollection.type !== "title-button" ||
          (insertionCollection.properties = {
            ...(insertionCollection.properties || {}),
            icon: iconName4,
            iconVisible: !!iconName4,
          });
      }));
  }),
  lightStatisticsIconButtonElement.addEventListener(
    "click",
    (onIconButtonEffectAssetButtonClickState: any) => {
      (onIconButtonEffectAssetButtonClickState.preventDefault(),
        onIconButtonEffectAssetButtonClickState.stopPropagation());
      const hidden9 = lightStatisticsIconMenuElement.hidden;
      (closeOtherPickerMenus(hidden9 ? "light-statistics-icon" : null),
        hidden9 &&
          lightStatisticsIconMenuElement.parentElement !== document.body &&
          document.body.append(lightStatisticsIconMenuElement),
        (lightStatisticsIconMenuElement.hidden = !hidden9),
        (lightStatisticsIconMenuElement.style.position = "fixed"),
        (lightStatisticsIconMenuElement.style.zIndex = "760"),
        lightStatisticsIconButtonElement.setAttribute("aria-expanded", String(hidden9)),
        hidden9 &&
          (positionLightStatisticsIconMenu(),
          iconTooltipElementBuffer(lightStatisticsIconSearchElement.value)
            .then(() => {
              (positionLightStatisticsIconMenu(),
                lightStatisticsIconSearchElement.focus({
                  preventScroll: true,
                }));
            })
            .catch(handleOperationError)));
    },
  ),
  lightStatisticsIconCopyElement.addEventListener("click", async () => {
    const templateLabel = removedComponent()?.properties?.icon || "";
    if (templateLabel)
      try {
        (await copyTextToClipboard(templateLabel),
          window.clearTimeout(editorCtx.lightStatisticsIconCopiedTimeoutId),
          lightStatisticsIconCopyElement.classList.add("copied"),
          (editorCtx.lightStatisticsIconCopiedTimeoutId = window.setTimeout(
            () => lightStatisticsIconCopyElement.classList.remove("copied"),
            1200,
          )));
      } catch (caughtErrorPath: any) {
        handleOperationError(caughtErrorPath);
      }
  }),
  lightStatisticsIconSearchElement.addEventListener("input", () => {
    (window.clearTimeout(editorCtx.lightStatisticsIconSearchDebounceTimeoutId),
      (editorCtx.lightStatisticsIconSearchDebounceTimeoutId = window.setTimeout(
        () =>
          iconTooltipElementBuffer(lightStatisticsIconSearchElement.value).catch(
            handleOperationError,
          ),
        160,
      )));
  }),
  lightStatisticsIconOptionsElement.addEventListener(
    "click",
    (onIconButtonEffectAssetFolderSelectChangeState: any) => {
      const templateInstanceNameElement =
          onIconButtonEffectAssetFolderSelectChangeState.target.closest(
            "[data-light-statistics-icon-name]",
          ),
        templateInstanceName = editorCtx.selectedComponentId;
      if (!templateInstanceNameElement || !templateInstanceName) return;
      const lightStatisticsIconName = templateInstanceNameElement.dataset.lightStatisticsIconName;
      (closeOtherPickerMenus(),
        mutateDocument((onIconButtonEffectAssetSearchInputInputState: any) => {
          const createdComponent = findComponent2(
            onIconButtonEffectAssetSearchInputInputState,
            templateInstanceName,
          )?.component;
          !createdComponent ||
            createdComponent.type !== "light-statistics" ||
            (createdComponent.properties = {
              ...(createdComponent.properties || {}),
              icon: lightStatisticsIconName,
            });
        }));
    },
  ),
  lightStatisticsEntityButtonElement.addEventListener(
    "click",
    (onIconButtonEffectAssetOptionsPointeroverState: any) => {
      (onIconButtonEffectAssetOptionsPointeroverState.preventDefault(),
        onIconButtonEffectAssetOptionsPointeroverState.stopPropagation());
      const hidden10 = lightStatisticsEntityMenuElement.hidden;
      (closeOtherPickerMenus(hidden10 ? "light-statistics-entity" : null),
        hidden10 &&
          lightStatisticsEntityMenuElement.parentElement !== document.body &&
          document.body.append(lightStatisticsEntityMenuElement),
        (lightStatisticsEntityMenuElement.hidden = !hidden10),
        (lightStatisticsEntityMenuElement.style.position = "fixed"),
        (lightStatisticsEntityMenuElement.style.zIndex = "760"),
        lightStatisticsEntityButtonElement.setAttribute("aria-expanded", String(hidden10)),
        hidden10 &&
          (renderLightStatisticsEntityOptions(lightStatisticsEntitySearchElement.value),
          positionLightStatisticsEntityMenu(),
          window.requestAnimationFrame(() => {
            (positionLightStatisticsEntityMenu(),
              lightStatisticsEntitySearchElement.focus({
                preventScroll: true,
              }));
          })));
    },
  ),
  lightStatisticsEntitySearchElement.addEventListener("input", () =>
    renderLightStatisticsEntityOptions(lightStatisticsEntitySearchElement.value),
  ),
  lightStatisticsEntityOptionsElement.addEventListener(
    "click",
    (effectAssetPointerOverEventState: any) => {
      const createdComponentElement = effectAssetPointerOverEventState.target.closest(
        "[data-light-statistics-entity-id]",
      );
      createdComponentElement &&
        (closePickerMenu(lightStatisticsEntityMenuElement, lightStatisticsEntityButtonElement),
        addLightStatisticsEntity(createdComponentElement.dataset.lightStatisticsEntityId));
    },
  ),
  lightStatisticsEntityConfirmElement.addEventListener("click", () => effectIconName()),
  lightStatisticsEntityListElement.addEventListener(
    "click",
    (onIconButtonEffectAssetOptionsClickState: any) => {
      const groupWidthElement = onIconButtonEffectAssetOptionsClickState.target.closest(
          "[data-light-statistics-replace-index]",
        ),
        groupHeightElement = onIconButtonEffectAssetOptionsClickState.target.closest(
          "[data-light-statistics-remove-index]",
        );
      if (groupHeightElement) {
        removeLightStatisticsEntityAt(Number(groupHeightElement.dataset.lightStatisticsRemoveIndex));
        return;
      }
      groupWidthElement &&
        ((editorCtx.statisticsEntityId = ""),
        (editorCtx.statisticsReplaceIndex = Number(groupWidthElement.dataset.lightStatisticsReplaceIndex)),
        (editorCtx.statisticsComponentId = editorCtx.selectedComponentId || ""),
        (lightStatisticsEntityPendingElement.hidden = true),
        showLightStatisticsMessage("请选择新的实体。"),
        setPickerButtonLabel(lightStatisticsEntityButtonElement, "选择替换实体"),
        lightStatisticsEntityButtonElement.click());
    },
  ),
  imageEntityButtonElement.addEventListener("click", () => {
    const hidden11 = imageEntityMenuElement.hidden;
    (closeOtherPickerMenus(hidden11 ? "entity" : null),
      (imageEntityMenuElement.hidden = !hidden11),
      imageEntityButtonElement.setAttribute("aria-expanded", String(hidden11)),
      hidden11 &&
        (renderRelatedPopupEntityOptions(imageEntitySearchElement.value),
        refreshImageAssetPickerPreview(),
        window.requestAnimationFrame(() => {
          (refreshImageAssetPickerPreview(),
            imageEntitySearchElement.focus({
              preventScroll: true,
            }));
        })));
  }),
  imageEntitySearchElement.addEventListener("input", () =>
    renderRelatedPopupEntityOptions(imageEntitySearchElement.value),
  ),
  imageEntityOptionsElement.addEventListener("click", (effectAssetClickEventState: any) => {
    const createdWidthElement = effectAssetClickEventState.target.closest("[data-entity-id]");
    if (!createdWidthElement || !editorCtx.selectedComponentId) return;
    const createdWidth = editorCtx.selectedComponentId,
      entityId = createdWidthElement.dataset.entityId;
    (closeOtherPickerMenus(),
      mutateDocument((createdHeightState: any) => {
        const effectAssetComponentId = findComponent2(createdHeightState, createdWidth)?.component;
        if (!effectAssetComponentId || effectAssetComponentId.type !== "image") return;
        const createdHeight = String(effectAssetComponentId.bindings?.entity?.entityId || "");
        if (
          ((effectAssetComponentId.bindings = {
            ...(effectAssetComponentId.bindings || {}),
          }),
          (effectAssetComponentId.properties = {
            ...(effectAssetComponentId.properties || {}),
            fit: "contain",
          }),
          entityId)
        )
          effectAssetComponentId.bindings.entity = {
            entityId: entityId,
          };
        else {
          delete effectAssetComponentId.bindings.entity;
          for (const sharedReferencePage of ["tap", "doubleTap", "hold"])
            actionNeedsCurrentEntity2(effectAssetComponentId.actions?.[sharedReferencePage]) &&
              delete effectAssetComponentId.actions[sharedReferencePage];
        }
        entityId !== createdHeight &&
          ((
            entityId
              ? relatedPopupContext2(
                  effectAssetComponentId,
                  entitiesByEntityId(),
                  devicesByDeviceId(),
                )
              : null
          )
            ? (effectAssetComponentId.properties.relatedEntities = manualRelatedEntityConfig2([]))
            : delete effectAssetComponentId.properties.relatedEntities);
      }));
  }));
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
function closePopupRenameDialog(...args: any[]): ReturnType<typeof closePopupRenameDialogImpl> { return (closePopupRenameDialogImpl as any)(styleDialogsDeps(), ...args); }
// ── P4 切片转发器（声明级切片：宿主侧薄转发器 + 依赖袋，都是函数声明 → 提升，位置无关）──
function createCopyBackupDeps(...args: any[]): ReturnType<typeof createCopyBackupDepsImpl> { return (createCopyBackupDepsImpl as any)(styleDialogsDeps(), ...args); }

function renderCopyBackupDialog(...args: any[]): ReturnType<typeof renderCopyBackupDialogImpl> { return (renderCopyBackupDialogImpl as any)(styleDialogsDeps(), ...args); }

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
function titleButtonMenuDeps(...args: any[]): ReturnType<typeof titleButtonMenuDepsImpl> { return (titleButtonMenuDepsImpl as any)(copyBackupPickersDeps(), ...args); }

function loadNavigationIconOptions(...args: any[]): ReturnType<typeof loadNavigationIconOptionsImpl> { return (loadNavigationIconOptionsImpl as any)(copyBackupPickersDeps(), ...args); }
function positionTitleButtonIconMenu(...args: any[]): ReturnType<typeof positionTitleButtonIconMenuImpl> { return (positionTitleButtonIconMenuImpl as any)(copyBackupPickersDeps(), ...args); }
function stopHoverScroll(...args: any[]): ReturnType<typeof stopHoverScrollImpl> { return (stopHoverScrollImpl as any)(copyBackupPickersDeps(), ...args); }
function iconTooltipElementValue(...args: any[]): ReturnType<typeof iconTooltipElementValueImpl> { return (iconTooltipElementValueImpl as any)(copyBackupPickersDeps(), ...args); }

function inspectorSyncDeps(...args: any[]): ReturnType<typeof inspectorSyncDepsImpl> { return (inspectorSyncDepsImpl as any)(copyBackupPickersDeps(), ...args); }

function syncComponentActionControls(...args: any[]): ReturnType<typeof syncComponentActionControlsImpl> { return (syncComponentActionControlsImpl as any)(copyBackupPickersDeps(), ...args); }
function applyTransformToInspector(...args: any[]): ReturnType<typeof applyTransformToInspectorImpl> { return (applyTransformToInspectorImpl as any)(copyBackupPickersDeps(), ...args); }
function previewModeForIcon(...args: any[]): ReturnType<typeof previewModeForIconImpl> { return (previewModeForIconImpl as any)(copyBackupPickersDeps(), ...args); }
function sharedReferenceId(...args: any[]): ReturnType<typeof sharedReferenceIdImpl> { return (sharedReferenceIdImpl as any)(copyBackupPickersDeps(), ...args); }

function nudgeDeps(...args: any[]): ReturnType<typeof nudgeDepsImpl> { return (nudgeDepsImpl as any)(copyBackupPickersDeps(), ...args); }

function nudgeDeltaX(...args: any[]): ReturnType<typeof nudgeDeltaXImpl> { return (nudgeDeltaXImpl as any)(copyBackupPickersDeps(), ...args); }

function clickPopupListOption(...args: any[]): ReturnType<typeof clickPopupListOptionImpl> { return (clickPopupListOptionImpl as any)(copyBackupPickersDeps(), ...args); }
function onPopupListContextmenu(...args: any[]): ReturnType<typeof onPopupListContextmenuImpl> { return (onPopupListContextmenuImpl as any)(copyBackupPickersDeps(), ...args); }
function openEntityCopyBackupPicker(...args: any[]): ReturnType<typeof openEntityCopyBackupPickerImpl> { return (openEntityCopyBackupPickerImpl as any)(copyBackupPickersDeps(), ...args); }
function openLightStatisticsCopyBackupPicker(...args: any[]): ReturnType<typeof openLightStatisticsCopyBackupPickerImpl> { return (openLightStatisticsCopyBackupPickerImpl as any)(copyBackupPickersDeps(), ...args); }
function openPopupEntityCopyBackupPicker(...args: any[]): ReturnType<typeof openPopupEntityCopyBackupPickerImpl> { return (openPopupEntityCopyBackupPickerImpl as any)(copyBackupPickersDeps(), ...args); }
function onPopupModuleCancelButtonClick(...args: any[]): ReturnType<typeof onPopupModuleCancelButtonClickImpl> { return (onPopupModuleCancelButtonClickImpl as any)(copyBackupPickersDeps(), ...args); }
function assetManagementDeps(): AssetManagementDeps {
  return {
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
  };
}
function onPopupModuleClimateDeviceTypeClick(...args: any[]): ReturnType<typeof onPopupModuleClimateDeviceTypeClickImpl> { return (onPopupModuleClimateDeviceTypeClickImpl as any)(assetManagementDeps(), ...args); }
function selectAssetFolder(...args: any[]): ReturnType<typeof selectAssetFolderImpl> { return (selectAssetFolderImpl as any)(assetManagementDeps(), ...args); }
function popupModuleTypeValue(...args: any[]): ReturnType<typeof popupModuleTypeValueImpl> { return (popupModuleTypeValueImpl as any)(assetManagementDeps(), ...args); }
function requestDeleteUserAsset(...args: any[]): ReturnType<typeof requestDeleteUserAssetImpl> { return (requestDeleteUserAssetImpl as any)(assetManagementDeps(), ...args); }
function requestDeleteAssetFolder(...args: any[]): ReturnType<typeof requestDeleteAssetFolderImpl> { return (requestDeleteAssetFolderImpl as any)(assetManagementDeps(), ...args); }
function refreshAssetPickers(...args: any[]): ReturnType<typeof refreshAssetPickersImpl> { return (refreshAssetPickersImpl as any)(assetManagementDeps(), ...args); }
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
(deleteAssetCloseButtonElement.addEventListener("click", () => deleteAssetDialogElement.close()),
  deleteAssetCancelButtonElement.addEventListener("click", () => deleteAssetDialogElement.close()),
  deleteAssetDialogElement.addEventListener("click", (popupModuleDraftEntry: any) => {
    popupModuleDraftEntry.target === deleteAssetDialogElement && deleteAssetDialogElement.close();
  }),
  deleteAssetConfirmButtonElement.addEventListener("click", async () => {
    const replace5 = String(editorCtx.pendingDeleteAssetId || "").replace(/^user:/, "");
    if (/^[0-9a-f]{32}$/.test(replace5)) {
      deleteAssetConfirmButtonElement.disabled = true;
      try {
        (await requestJson("/assets/user/" + replace5, {
          method: "DELETE",
        }),
          (editorCtx.pendingDeleteAssetId = null),
          deleteAssetDialogElement.close(),
          await reloadAssetCatalog());
      } catch (caughtErrorIndex: any) {
        caughtErrorIndex?.code === "ASSET_IN_USE"
          ? handleOperationError(
              new Error("这张图片仍被户型图绘制或仪表盘使用，请先移除引用后再删除。"),
            )
          : handleOperationError(caughtErrorIndex);
      } finally {
        deleteAssetConfirmButtonElement.disabled = false;
      }
    }
  }),
  deleteAssetFolderCloseButtonElement.addEventListener("click", () =>
    deleteAssetFolderDialogElement.close(),
  ),
  deleteAssetFolderCancelButtonElement.addEventListener("click", () =>
    deleteAssetFolderDialogElement.close(),
  ),
  deleteAssetFolderDialogElement.addEventListener("click", (nextPopupModules: any) => {
    nextPopupModules.target === deleteAssetFolderDialogElement &&
      deleteAssetFolderDialogElement.close();
  }),
  deleteAssetFolderDialogElement.addEventListener("close", () => {
    deleteAssetFolderConfirmButtonElement.disabled || (editorCtx.pendingDeleteAssetFolder = null);
  }),
  deleteAssetFolderConfirmButtonElement.addEventListener("click", async () => {
    const Uc2 = editorCtx.pendingDeleteAssetFolder;
    if (Uc2?.folderName) {
      deleteAssetFolderConfirmButtonElement.disabled = true;
      try {
        (await requestJson("/studio3d/exports", {
          method: "DELETE",
          headers: {
            "X-Export-Folder": encodeURIComponent(Uc2.folderName),
          },
        }),
          (editorCtx.pendingDeleteAssetFolder = null),
          deleteAssetFolderDialogElement.close(),
          await reloadAssetCatalog({
            refreshInspector: false,
          }),
          refreshAssetPickers());
      } catch (caughtErrorTotal: any) {
        caughtErrorTotal?.code === "STUDIO3D_EXPORT_IN_USE"
          ? handleOperationError(
              new Error(
                "这个文件夹中的图片仍被仪表盘、弹窗或户型图绘制使用，请先移除引用后再删除。",
              ),
            )
          : handleOperationError(caughtErrorTotal);
      } finally {
        deleteAssetFolderConfirmButtonElement.disabled = false;
      }
    }
  }),
  imageAssetButtonElement.addEventListener("click", async () => {
    const hidden13 = imageAssetMenuElement.hidden;
    if (
      (closeOtherPickerMenus(hidden13 ? "asset" : null),
      (imageAssetMenuElement.hidden = !hidden13),
      imageAssetButtonElement.setAttribute("aria-expanded", String(hidden13)),
      hidden13)
    ) {
      try {
        (await reloadAssetCatalog({
          refreshInspector: false,
        }),
          leftFolderName("image"));
      } catch (existingPopupModule: any) {
        handleOperationError(existingPopupModule);
      }
      (renderImageAssetOptions(imageAssetSearchInputElement.value),
        positionImageAssetMenu(),
        window.requestAnimationFrame(() => {
          (positionImageAssetMenu(),
            imageAssetSearchInputElement.focus({
              preventScroll: true,
            }));
        }));
    }
  }),
  imageAssetFolderSelectElement.addEventListener("change", () => {
    ((editorCtx.imageAssetFolderState = imageAssetFolderSelectElement.value),
      (imageAssetSearchInputElement.value = ""),
      syncAssetFolderOptions("image"),
      renderImageAssetOptions());
  }),
  imageAssetSearchInputElement.addEventListener("input", () =>
    renderImageAssetOptions(imageAssetSearchInputElement.value),
  ),
  imageAssetOptionsElement.addEventListener("pointerover", (popupModuleDraftDocument: any) => {
    const popupModuleDraftPopupElement = popupModuleDraftDocument.target.closest("[data-asset-id]");
    if (
      !popupModuleDraftPopupElement ||
      popupModuleDraftPopupElement.contains(popupModuleDraftDocument.relatedTarget)
    )
      return;
    const sn7 = findAssetById(popupModuleDraftPopupElement.dataset.assetId);
    scheduleAssetPreview(sn7, popupModuleDraftPopupElement);
  }),
  imageAssetOptionsElement.addEventListener("pointerleave", hideAssetLargePreview),
  imageAssetOptionsElement.addEventListener("scroll", hideAssetLargePreview),
  imageAssetOptionsElement.addEventListener("click", async (popupModulePopupMatch: any) => {
    const popupModuleExistingElement = popupModulePopupMatch.target.closest("[data-asset-id]");
    if (!popupModuleExistingElement || !editorCtx.selectedComponentId) return;
    const popupModuleMatchState = editorCtx.selectedComponentId,
      assetId = popupModuleExistingElement.dataset.assetId;
    if ((hideAssetLargePreview(), closeOtherPickerMenus(), !assetId)) {
      mutateDocument((popupModuleMatch: any) => {
        const removedDeviceType = findComponent2(
          popupModuleMatch,
          popupModuleMatchState,
        )?.component;
        !removedDeviceType ||
          removedDeviceType.type !== "image" ||
          ((removedDeviceType.properties = {
            ...(removedDeviceType.properties || {}),
            fit: "contain",
          }),
          delete removedDeviceType.properties.assetId,
          delete removedDeviceType.properties.naturalWidth,
          delete removedDeviceType.properties.naturalHeight);
      });
      return;
    }
    const sn8 = findAssetById(assetId);
    if (sn8)
      try {
        const em2 = await measureAssetImageSize(sn8);
        mutateDocument((remainingPopupPropertiesState: any) => {
          const remainingPopupProperties = findComponent2(
            remainingPopupPropertiesState,
            popupModuleMatchState,
          )?.component;
          !remainingPopupProperties ||
            remainingPopupProperties.type !== "image" ||
            applyAssetNaturalSize(remainingPopupProperties, assetId, em2);
        });
      } catch (caughtErrorFlag: any) {
        handleOperationError(caughtErrorFlag);
      }
  }),
  ibeAssetButtonElement.addEventListener("click", async () => {
    const hidden14 = ibeAssetMenuElement.hidden;
    if (
      (closeOtherPickerMenus(hidden14 ? "ibe-asset" : null),
      (ibeAssetMenuElement.hidden = !hidden14),
      ibeAssetButtonElement.setAttribute("aria-expanded", String(hidden14)),
      !!hidden14)
    ) {
      try {
        (await reloadAssetCatalog({
          refreshInspector: false,
        }),
          leftFolderName("ibe"));
      } catch (caughtErrorSlot: any) {
        handleOperationError(caughtErrorSlot);
      }
      (renderEffectAssetOptions(ibeAssetSearchElement.value),
        positionEffectAssetMenu(),
        window.requestAnimationFrame(() => {
          (positionEffectAssetMenu(),
            ibeAssetSearchElement.focus({
              preventScroll: true,
            }));
        }));
    }
  }),
  ibeAssetFolderElement.addEventListener("change", () => {
    ((editorCtx.effectAssetFolderState = ibeAssetFolderElement.value),
      (ibeAssetSearchElement.value = ""),
      syncAssetFolderOptions("ibe"),
      renderEffectAssetOptions());
  }),
  ibeAssetSearchElement.addEventListener("input", () =>
    renderEffectAssetOptions(ibeAssetSearchElement.value),
  ),
  ibeAssetOptionsElement.addEventListener("pointerover", (bindDocumentPointerSectionState: any) => {
    const bindDocumentPointerSectionElement =
      bindDocumentPointerSectionState.target.closest("[data-asset-id]");
    !bindDocumentPointerSectionElement ||
      bindDocumentPointerSectionElement.contains(bindDocumentPointerSectionState.relatedTarget) ||
      scheduleAssetPreview(
        findAssetById(bindDocumentPointerSectionElement.dataset.assetId),
        bindDocumentPointerSectionElement,
        ibeAssetMenuElement,
      );
  }),
  ibeAssetOptionsElement.addEventListener("pointerleave", hideAssetLargePreview),
  ibeAssetOptionsElement.addEventListener("scroll", hideAssetLargePreview),
  ibeAssetOptionsElement.addEventListener("click", async (bindDocumentPointerSection: any) => {
    const popupMenuRectElementElement =
        bindDocumentPointerSection.target.closest("[data-asset-id]"),
      entryStateKey = editorCtx.selectedComponentId;
    if (!popupMenuRectElementElement || !entryStateKey) return;
    const assetId2 = popupMenuRectElementElement.dataset.assetId;
    (hideAssetLargePreview(), closeOtherPickerMenus());
    const sn9 = assetId2 ? findAssetById(assetId2) : null;
    let entryStatePath: any = null;
    if (sn9)
      try {
        entryStatePath = await measureAssetImageSize(sn9);
      } catch (entryStateText: any) {
        handleOperationError(entryStateText);
        return;
      }
    mutateDocument((entryStateCount: any) => {
      const onDocumentPointerdownState = findComponent2(entryStateCount, entryStateKey)?.component;
      !onDocumentPointerdownState ||
        onDocumentPointerdownState.type !== "icon-button-effect" ||
        ((onDocumentPointerdownState.properties = {
          ...(onDocumentPointerdownState.properties || {}),
        }),
        assetId2 && entryStatePath
          ? ((onDocumentPointerdownState.properties.effectAssetId = assetId2),
            (onDocumentPointerdownState.properties.effectNaturalWidth = entryStatePath.width),
            (onDocumentPointerdownState.properties.effectNaturalHeight = entryStatePath.height),
            delete onDocumentPointerdownState.properties.effectWidth,
            delete onDocumentPointerdownState.properties.effectHeight)
          : (delete onDocumentPointerdownState.properties.effectAssetId,
            delete onDocumentPointerdownState.properties.effectNaturalWidth,
            delete onDocumentPointerdownState.properties.effectNaturalHeight));
    });
  }),
  undoElement.addEventListener("click", () => entityLoadError("undo")),
  redoElement.addEventListener("click", () => entityLoadError("redo")),
  recoveryRestoreElement.addEventListener("click", () => {
    if (!editorCtx.recoverySnapshot || !editorCtx.activeProject) {
      recoveryDialogElement.close();
      return;
    }
    const Ne2 = editorCtx.recoverySnapshot;
    ((editorCtx.recoverySnapshot = null),
      (editorCtx.activeProject = {
        ...editorCtx.activeProject,
        document: clone2(Ne2.document),
      }),
      (editorCtx.selectedComponentId = findComponent2(editorCtx.activeProject.document, Ne2.selectedComponentId)
        ? Ne2.selectedComponentId
        : null));
    const onDocumentPointerdownValue = Array.isArray(Ne2.selectedComponentIds)
      ? Ne2.selectedComponentIds.filter((filteredItemsKey: any) =>
          findComponent2(editorCtx.activeProject.document, filteredItemsKey),
        )
      : [];
    ((editorCtx.selectedComponentIdsSet = new Set(
      onDocumentPointerdownValue.length
        ? onDocumentPointerdownValue
        : editorCtx.selectedComponentId
          ? [editorCtx.selectedComponentId]
          : [],
    )),
      (editorCtx.selectionAnchorComponentId = editorCtx.selectedComponentId),
      (historyState.undo = Array.isArray(Ne2.undo) ? clone2(Ne2.undo) : []),
      (historyState.redo = Array.isArray(Ne2.redo) ? clone2(Ne2.redo) : []),
      recoveryDialogElement.close(),
      renderEditorWorkspace(Ne2.selectedPath || null),
      writeError(),
      syncHistoryButtons());
  }),
  recoveryDiscardElement.addEventListener("click", () => {
    (discardRecoverySnapshot(editorCtx.activeProject?.projectId),
      (editorCtx.recoverySnapshot = null),
      recoveryDialogElement.close(),
      writeError(),
      syncHistoryButtons());
  }),
  recoveryDialogElement.addEventListener("cancel", (onDocumentPointerdownConfig: any) =>
    onDocumentPointerdownConfig.preventDefault(),
  ),
  errorDialogCloseElement.addEventListener("click", () => errorDialogCloseButtonElement.close()),
  errorDialogConfirmElement.addEventListener("click", () => errorDialogCloseButtonElement.close()),
  errorDialogCloseButtonElement.addEventListener("click", (onDocumentPointerdownRef: any) => {
    onDocumentPointerdownRef.target === errorDialogCloseButtonElement &&
      errorDialogCloseButtonElement.close();
  }),
  showSharedComponentsElement.addEventListener("click", () => setComponentScope("shared")),
  showPageComponentsElement.addEventListener("click", () => setComponentScope("page")),
  addComponentButtonElement.addEventListener("click", () => {
    addComponentButtonElement.disabled ||
      (renderComponentTemplates(),
      componentTemplateDialogElement.showModal(),
      refreshComponentDialogScale());
  }),
  componentTemplateCloseElement.addEventListener("click", () =>
    componentTemplateDialogElement.close(),
  ),
  componentTemplateDialogElement.addEventListener("click", (onDocumentPointerdown: any) => {
    onDocumentPointerdown.target === componentTemplateDialogElement &&
      componentTemplateDialogElement.close();
  }),
  componentTemplateListElement.addEventListener("click", (documentPointerDownEvent: any) => {
    const deleteAssetFolderClosestElement =
        documentPointerDownEvent.target.closest("[data-template-id]"),
      imageAssetFolderMenuElement = pageSelectElement.value;
    if (
      !deleteAssetFolderClosestElement ||
      deleteAssetFolderClosestElement.disabled ||
      !imageAssetFolderMenuElement
    )
      return;
    const Ie7 = editorCtx.componentScopeState,
      jc5 = editorCtx.componentScope,
      effectAssetFolderMenuElement = editorCtx.activeGroupId
        ? findComponent2(editorCtx.activeProject?.document, editorCtx.activeGroupId)
        : null,
      component7 =
        effectAssetFolderMenuElement?.component?.type === "group"
          ? effectAssetFolderMenuElement.component
          : null,
      scope3 = component7 ? effectAssetFolderMenuElement!.scope : jc5,
      scaleInputElements = newId2("component");
    (componentTemplateDialogElement.close(),
      (editorCtx.selectedComponentId = scaleInputElements),
      (editorCtx.selectedComponentIdsSet = new Set([scaleInputElements])),
      (editorCtx.selectionAnchorComponentId = scaleInputElements));
    const scaleInputElementsState = mutateDocument((onPopupActionsMenuClickState: any) => {
      const scaleInputCaptureEventState = onPopupActionsMenuClickState.pages.find(
        (scaleInputCaptureEvent: any) => scaleInputCaptureEvent.path === imageAssetFolderMenuElement,
      );
      if (!scaleInputCaptureEventState) throw new Error("当前页面不存在。");
      const popupActionNameState = component7
          ? findComponent2(onPopupActionsMenuClickState, component7.id)
          : null,
        component8 =
          popupActionNameState?.component?.type === "group" ? popupActionNameState.component : null,
        sharedComponents3 =
          jc5 === "shared"
            ? onPopupActionsMenuClickState.sharedComponents
            : scaleInputCaptureEventState.components,
        children2 = component8
          ? component8.children || (component8.children = [])
          : sharedComponents3,
        popupActionTargetIdConfig =
          deleteAssetFolderClosestElement.dataset.templateId === "flow-line"
            ? "流水线条"
            : deleteAssetFolderClosestElement.dataset.templateId === "scene-mode"
              ? "情景模式"
              : deleteAssetFolderClosestElement.dataset.templateId === "navigation-button"
                ? "导航按钮"
                : deleteAssetFolderClosestElement.dataset.templateId === "interaction3d"
                  ? "3D 交互"
                  : deleteAssetFolderClosestElement.dataset.templateId === "floorplan-auto-diagram"
                    ? "户型图自动导图"
                    : deleteAssetFolderClosestElement.dataset.templateId === "icon-button-effect"
                      ? "图标按钮（效果）"
                      : deleteAssetFolderClosestElement.dataset.templateId === "title-button"
                        ? "标题按钮"
                        : deleteAssetFolderClosestElement.dataset.templateId === "light-statistics"
                          ? "数量统计"
                          : deleteAssetFolderClosestElement.dataset.templateId === "icon-button"
                            ? "图标按钮"
                            : deleteAssetFolderClosestElement.dataset.templateId === "device-button"
                              ? "设备按钮"
                              : deleteAssetFolderClosestElement.dataset.templateId ===
                                  "presence-sensor"
                                ? "传感器"
                                : deleteAssetFolderClosestElement.dataset.templateId ===
                                    "air-conditioner"
                                  ? "空调 / 浴霸"
                                  : deleteAssetFolderClosestElement.dataset.templateId ===
                                      "vacuum-map"
                                    ? "扫地机器人实时地图"
                                    : deleteAssetFolderClosestElement.dataset.templateId ===
                                        "camera"
                                      ? "摄像头实时预览"
                                      : deleteAssetFolderClosestElement.dataset.templateId ===
                                          "time"
                                        ? "时间"
                                        : deleteAssetFolderClosestElement.dataset.templateId ===
                                            "date"
                                          ? "日期"
                                          : deleteAssetFolderClosestElement.dataset.templateId ===
                                              "weather"
                                            ? "天气"
                                            : deleteAssetFolderClosestElement.dataset.templateId ===
                                                "percentage-bar"
                                              ? "百分比柱状图"
                                              : deleteAssetFolderClosestElement.dataset
                                                    .templateId === "line-chart"
                                                ? "折线图"
                                                : deleteAssetFolderClosestElement.dataset
                                                      .templateId === "panel-frame"
                                                  ? "底图框"
                                                  : deleteAssetFolderClosestElement.dataset
                                                        .templateId === "event-log-wall"
                                                    ? "即时消息墙"
                                                    : "图片",
        scaleInputCaptureEventValue = nextTemplateInstanceName2(
          children2,
          popupActionTargetIdConfig,
        ),
        scaleInputValueState = createComponentFromTemplate2(
          deleteAssetFolderClosestElement.dataset.templateId,
          {
            id: scaleInputElements,
            instanceName: scaleInputCaptureEventValue,
            canvas: onPopupActionsMenuClickState.canvas,
          },
        );
      if (component8) {
        const measuredBoundsOrigin = Number(component8.position?.width || 100),
          measuredBoundsDraft = Number(component8.position?.height || 100),
          scaleInputValue = Number(scaleInputValueState.position?.width || 100),
          scaledPlacements = Number(scaleInputValueState.position?.height || 100);
        scaleInputValueState.position = {
          ...(scaleInputValueState.position || {}),
          x: (measuredBoundsOrigin - scaleInputValue) / 2,
          y: (measuredBoundsDraft - scaledPlacements) / 2,
        };
      }
      if (
        (children2.unshift(scaleInputValueState),
        applyCollectionLayerOrder2(children2),
        scope3 === "shared" && !component8)
      ) {
        for (const documentChangeEventState of onPopupActionsMenuClickState.pages)
          documentChangeEventState.sharedComponentIds = [
            scaleInputValueState.id,
            ...(documentChangeEventState.sharedComponentIds || []).filter(
              (documentChangeEvent: any) => documentChangeEvent !== scaleInputValueState.id,
            ),
          ];
        syncSharedComponentReferenceOrder2(onPopupActionsMenuClickState);
      }
    }, imageAssetFolderMenuElement);
    deleteAssetFolderClosestElement.dataset.templateId === "floorplan-auto-diagram" &&
      scaleInputElementsState.then(() => {
        editorCtx.componentScopeState === Ie7 &&
          findComponent2(editorCtx.activeProject?.document, scaleInputElements) &&
          settleAutoDiagramDialog(scaleInputElements, {
            cancelRemovesComponent: true,
          });
      });
  }),
  showEditorPreviewButtonElement.addEventListener("click", () => setEditorMode("edit")),
  showDashboardPreviewButtonElement.addEventListener("click", () => setEditorMode("dashboard")),
  soundToggleButtonElement.addEventListener("click", async () => {
    if (!editorCtx.activeProject) return;
    const changeInputValue = clone2(editorCtx.activeProject.document);
    changeInputValue.soundEnabled = editorCtx.activeProject.document.soundEnabled === false;
    try {
      if (!(await projectSummary(changeInputValue))) return;
      await saveDraft();
    } catch (selectedComponentIdSet: any) {
      handleOperationError(selectedComponentIdSet);
    }
  }),
  showPageEditorElement.addEventListener("click", () => setEditorMode("edit")),
  showPopupEditorElement.addEventListener("click", () => setEditorMode("popup")),
  projectSelectElement.addEventListener("change", () => {
    if (
      (errorPhase(),
      editorCtx.hasUnsavedChanges && editorCtx.activeProject && projectSelectElement.value !== editorCtx.activeProject.projectId)
    ) {
      ((projectSelectElement.value = editorCtx.activeProject.projectId),
        loadNavigationIconOptions(projectSelectElement),
        documentSource());
      return;
    }
    projectSelectElement.value &&
      historyEntry(projectSelectElement.value).catch(handleOperationError);
  }),
  pageSelectElement.addEventListener("change", () => {
    (value(),
      syncDefaultPageAction(),
      (editorCtx.activeGroupId = null),
      editorCtx.editorMode === "popup" && setEditorMode("edit"),
      editorCtx.editorRenderer?.navigate(pageSelectElement.value),
      editorCtx.dashboardPreviewRenderer?.navigate(pageSelectElement.value));
    const changedScaledPlacements = findComponent2(editorCtx.activeProject?.document, editorCtx.selectedComponentId);
    (changedScaledPlacements?.scope === "page" &&
      changedScaledPlacements.page?.path !== pageSelectElement.value &&
      selectComponent(null),
      renderComponentLists(),
      coverMotorButtonElement());
  }));
function scaleDraftDocument(...args: any[]): ReturnType<typeof scaleDraftDocumentImpl> { return (scaleDraftDocumentImpl as any)(assetManagementDeps(), ...args); }
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
function cancelDeletePopupDialog(...args: any[]): ReturnType<typeof cancelDeletePopupDialogImpl> { return (cancelDeletePopupDialogImpl as any)(assetManagementDeps(), ...args); }
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
  new MutationObserver((onSessionsCloseButtonClick) => {
    for (const onSessionsRevokeOthersCloseButtonClick of onSessionsCloseButtonClick)
      for (const onSessionsRevokeOthersCancelButtonClick of onSessionsRevokeOthersCloseButtonClick.addedNodes)
        onSessionsRevokeOthersCancelButtonClick instanceof HTMLElement &&
          (selectableEntities(onSessionsRevokeOthersCancelButtonClick),
          destroyDashboardPreview(onSessionsRevokeOthersCancelButtonClick),
          formatLastSeen(onSessionsRevokeOthersCancelButtonClick));
  }).observe(document.body, {
    childList: true,
    subtree: true,
  }),
  deferHiddenEditorDialogs2(),
  setEditorMode("edit"),
  window.setInterval(() => {
    document.visibilityState === "visible" &&
      (actionDraftDocument().catch(() => {}), triggerKey().catch(() => {}));
  }, 15000),
  window.setInterval(() => {
    document.visibilityState === "visible" && pollAssetCatalogVersion().catch(() => {});
  }, 30000),
  document.addEventListener("visibilitychange", () => {
    document.visibilityState === "visible" &&
      (actionDraftDocument().catch(() => {}),
      pollAssetCatalogVersion().catch(() => {}),
      triggerKey().catch(() => {}));
  }),
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
function onSessionsRevokeOthersConfirmButtonClick(...args: any[]): ReturnType<typeof onSessionsRevokeOthersConfirmButtonClickImpl> { return (onSessionsRevokeOthersConfirmButtonClickImpl as any)(assetManagementDeps(), ...args); }
function onGlobalColorPickerHexTextInputInput(...args: any[]): ReturnType<typeof onGlobalColorPickerHexTextInputInputImpl> { return (onGlobalColorPickerHexTextInputInputImpl as any)(assetManagementDeps(), ...args); }
function saturationPointerMoveEventState(...args: any[]): ReturnType<typeof saturationPointerMoveEventStateImpl> { return (saturationPointerMoveEventStateImpl as any)(assetManagementDeps(), ...args); }
function mutationRecord(...args: any[]): ReturnType<typeof mutationRecordImpl> { return (mutationRecordImpl as any)(assetManagementDeps(), ...args); }


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
