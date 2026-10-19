import { confirmAction } from "../shared/ui-confirm";
import { DEFAULT_PERSPECTIVE_CORNERS } from "./metadata/editor-perspective-constants";
import {
  normalizeFlowLine as normalizeFlowLine2,
  FLOW_LINE_FIELDS as FLOW_LINE_FIELDS2,
  applyFlowLineStyle as applyFlowLineStyle2,
} from "../shared/flow-line-model";
import {
  applyPercentageBarChange as applyPercentageBarChange2,
  percentageBarDefaults as percentageBarDefaults2,
} from "../shared/percentage-bar-model";
import {
  PanelRenderer as PanelRenderer2,
  setBuiltinAssetVersions as setBuiltinAssetVersions2,
} from "../renderer/panel-renderer";
import {
  lightStatisticsEntityStateStatus as lightStatisticsEntityStateStatus2,
  lightStatisticsEntitySupport as lightStatisticsEntitySupport2,
} from "../renderer/registry";
import {
  createComponentFromTemplate as createComponentFromTemplate2,
  dateComponentDimensions as dateComponentDimensions2,
  listComponentTemplates as listComponentTemplates2,
  timeComponentDimensions as timeComponentDimensions2,
  weatherComponentDimensions as weatherComponentDimensions2,
} from "./component-templates";
import {
  clone as clone2,
  newId as newId2,
  normalizedHexColor as normalizedHexColor2,
  rgbToHex as rgbToHex2,
  rgbToHsv as rgbToHsv2,
  hsvToRgb255 as hsvToRgb2,
  roundField as roundField2,
  clampNumber as clampNumber2,
  normalizedFontWeight as normalizedFontWeight2,
  visibilityIconSvg as visibilityIconSvg2,
} from "./editor-utils";
import { hexToRgbOrBlack as hexToRgb2 } from "@/shared/utils/ui/color.util"; // 3/6 位校验 + 非法回落黑（原 studio 副本不校验输入，非法值产 NaN 通道，已删）
import {
  packPopupModules as packPopupModules2,
} from "../shared/popup-layout";
import {
  countComponentsOutsideCanvas as countComponentsOutsideCanvas2,
  resizeDashboardDocument as resizeDashboardDocument2,
} from "./dashboard-resize";
import {
  copyComponentsAcrossDocuments as copyComponentsAcrossDocuments2,
  copyComponentTargets as copyComponentTargets2,
  copyComponentsToTarget as copyComponentsToTarget2,
} from "./component-page-copy";
import {
  manualRelatedEntityConfig as manualRelatedEntityConfig2,
  relatedPopupContext as relatedPopupContext2,
} from "../shared/related-entities";
import { createIconVisibilityVirtualEntity as createIconVisibilityVirtualEntity2 } from "../shared/virtual-entities";
import { createButtonSound as createButtonSound2 } from "../shared/sound-effects";
import {
  deferHiddenEditorDialogs as deferHiddenEditorDialogs2,
  installSettingsDialogBackdropGuard as installSettingsDialogBackdropGuard2,
} from "./editor-dialogs";
import { createEditorPickerElements as createEditorPickerElements2 } from "./picker/editor-picker-elements";
import {
  EDITOR_PICKER_PAGE_SIZES as EDITOR_PICKER_PAGE_SIZES2,
  editorEntityPickerInitialPage as editorEntityPickerInitialPage2,
  editorEntityPickerPage as editorEntityPickerPage2,
} from "./picker/editor-picker-pagination";
import { createEditorPickerQueries as createEditorPickerQueries2 } from "./picker/editor-picker-queries";
import { createEditorAssetMatcher as createEditorAssetMatcher2 } from "./picker/editor-asset-queries";
import { createEditorPickerLifecycle as createEditorPickerLifecycle2 } from "./picker/editor-picker-lifecycle";
import { createInteraction3dEditorPickers as createInteraction3dEditorPickers2 } from "../bridge/pickers/editor-pickers";
import {
  nasProfiles as nasProfiles2,
  reconcileNasDocument as reconcileNasDocument2,
} from "../bridge/catalog/nas-catalog";
import { createEditorAssetToolbar as createEditorAssetToolbar2 } from "./picker/editor-asset-toolbar";
import {
  TOGGLE_ENTITY_DOMAINS as TOGGLE_ENTITY_DOMAINS2,
  actionNeedsCurrentEntity as actionNeedsCurrentEntity2,
} from "../shared/action-rules";
import {
  componentDirectLocation as componentDirectLocation2,
  findComponent as findComponent2,
  findComponentInItems as findComponentInItems2,
  findComponentLocation as findComponentLocation2,
} from "./component-tree";
import {
  applyCollectionLayerOrder as applyCollectionLayerOrder2,
  componentLabel as componentLabel2,
  ensureSharedComponentReference as ensureSharedComponentReference2,
  groupNameForCollection as groupNameForCollection2,
  nextTemplateInstanceName as nextTemplateInstanceName2,
  syncSharedComponentReferenceOrder as syncSharedComponentReferenceOrder2,
  canGroupComponents as canGroupComponents2,
} from "./editor-component-collections";
import {
  fitInspectorComponentToDimensions as fitInspectorComponentToDimensions2,
  inspectorComponentMetrics as inspectorComponentMetrics2,
} from "./editor-basic-inspectors";
import {
  rememberEditorProject as rememberEditorProject2,
  restoredEditorProject as restoredEditorProject2,
  clonePageWithFreshIds as clonePageWithFreshIds2,
  findCustomPopup as findCustomPopup2,
  greatestCommonDivisor as greatestCommonDivisor2,
  normalizedPopupClimateDeviceType as normalizedPopupClimateDeviceType2,
  popupModuleEntityRecommended as popupModuleEntityRecommended2,
  uniquePagePath as uniquePagePath2,
} from "./editor-document-management";
import {
  createRecoveryWriter as createRecoveryWriter2,
  documentSignature as documentSignature2,
  editorComponentEntries as editorComponentEntries2,
  editorComponentStructure as editorComponentStructure2,
  editorDocumentFrameSignature as editorDocumentFrameSignature2,
  recoveryStorageKey as recoveryStorageKey2,
} from "./editor-history";
import { validateGo2rtcDocument } from "@/studio/platform/go2rtc-url";
import {
  DEFAULT_BASE_LIGHTING as DEFAULT_BASE_LIGHTING2,
  normalizeBaseLighting as normalizeBaseLighting2,
} from "../3d-studio/loaders/studio-normalization";
import { floorplanAutoDiagramExportResolution as floorplanAutoDiagramExportResolution2 } from "./floorplan-auto-diagram-layout";
import {
  guardInteraction3dChanges as guardInteraction3dChanges2,
  renderInteraction3dThumbnail as renderInteraction3dThumbnail2,
  updateInteraction3dCard as updateInteraction3dCard2,
} from "../bridge/editor";
import { createLegacyScope } from '@/studio/platform/legacy-scope';
import { navigateInShell } from '@/studio/platform/shell-navigation';
import {
  patchEditorFacadeState,
  registerEditorCommandHandler,
  resetEditorFacade,
} from '../../engine';
import { applyEditorZoomCss } from './editor-canvas-navigation';
import { setupEventLogWallInspector } from "./home-event-log-wall";
import { setupPanelFrameInspector } from "./home-panel-frame";
import {
  syncIconButtonInspector as syncIconButtonInspectorExternal,
  type IconButtonInspectorContext,
} from "./home-icon-button-inspector";
import {
  syncNavigationInspector as syncNavigationInspectorExternal,
  type NavigationInspectorContext,
} from "./home-navigation-inspector";
import {
  syncLineChartInspector as syncLineChartInspectorExternal,
  type LineChartInspectorContext,
} from "./home-line-chart-inspector";
import {
  syncAirConditionerInspector as syncAirConditionerInspectorExternal,
  type AirConditionerInspectorContext,
} from "./home-air-conditioner-inspector";
import {
  coverMotorButtonElement as coverMotorButtonElementSync,
  runExtraLocal as runExtraLocalCover,
  clearCoverMotorDirectionValueById,
  type CoverMotorInspectorContext,
} from "./home-cover-motor-inspector";
import { setupRelatedPopup, updateRelatedPopup } from "./home-related-popup";
import {
  renderCustomPopupEditor as renderCustomPopupEditorExternal,
  syncCustomPopupStage as syncCustomPopupStageExternal,
  type CustomPopupEditorContext,
} from "./home-custom-popup-editor";
import { syncTimeInspector as syncTimeInspectorExternal } from "./home-time-inspector";
import { syncWeatherInspector as syncWeatherInspectorExternal } from "./home-weather-inspector";
import { syncTitleButtonInspector as syncTitleButtonInspectorExternal } from "./home-title-button-inspector";
import { syncLightStatisticsInspector as syncLightStatisticsInspectorExternal } from "./home-light-statistics-inspector";
import { syncCameraInspector as syncCameraInspectorExternal } from "./home-camera-inspector";
import { syncVacuumMapInspector as syncVacuumMapInspectorExternal } from "./home-vacuum-map-inspector";
import {
  clientPointToCanvas,
  computeAlignedPositions,
  normalizeMarquee,
  pickComponentsInMarquee,
  type AlignMode,
  componentBounds as componentBounds2,
} from './editor-selection-tools';
import { duplicateComponent, removeComponent } from "./editor-component-collections";
import { navigationVisibilityComponentState, navigationVisibilityComponentValue, navigationPreviewClickComponentId, navigationPreviewClickComponentIdState, onNavigationStyleApplyDialogCloseValue, onNavigationStyleApplyConfirmButtonClickState, onNavigationStyleApplyConfirmButtonClickValue, styleSourceComponentIdState, styleComponentTypeState, styleComponentTypeValue, styleComponentTypeConfig, navigationIconOptionState, navigationIconOptionStateState, navigationIconDraftDocumentValue, navigationIconDraftDocumentConfig, entryStateRef, entryStateEntry } from "./metadata/editor-navigation-style-metadata";
import { requestJson as requestJsonCore } from "./net/request-json";
import { createDateTimeWeatherLineChartInputTables } from "./metadata/date-weather-linechart-input-tables";
import { createNavigationInputTables } from "./metadata/navigation-input-tables";
import {
  runVariantLower as runVariantLowerCore,
  runVariantPeer,
} from "./navigation-style-apply/target-options";
import { formatLastSeen as formatLastSeenCore } from "./controls/number-stepper";
import { createEffectPreviewInputTables } from "./metadata/effect-preview-input-tables";
import { createInspectorSubmitTables } from "./metadata/inspector-submit-tables";
import { createExportSpliceTables } from "./metadata/export-splice-tables";
import { attachDateInspectorSubmit } from "./bindings/date-inspector-submit";
import { attachDocumentEntityPickerDismiss } from "./bindings/document-entity-picker-dismiss";
import { attachLineChartInspectorInput } from "./bindings/line-chart-inspector-input";
import { attachNavigationInspectorInput } from "./bindings/navigation-inspector-input";
import { attachFloorplanDiagramInspectorInput } from "./bindings/floorplan-diagram-inspector-input";
import { attachPageshowDiagramPreviewRestore } from "./bindings/pageshow-diagram-preview-restore";
import { syncProjectTemplateOptions } from "./bindings/project-template-options-render";
import { runCopyBackupCore } from "./copy-backup/run-copy-backup";
import { loadNavigationIconOptionsCore, positionTitleButtonIconMenuCore, stopHoverScrollCore, iconTooltipElementValueCore } from "./menus/title-button-menu";
import { syncComponentActionControlsCore, applyTransformToInspectorCore, previewModeForIconCore, sharedReferenceIdCore } from "./inspectors/inspector-sync";
import { nudgeDeltaXCore } from "./selection/nudge";
import { createEditorContext } from "./home/editor-context";

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
  const innerCleanup = scope.run(() => {
  const editorCtx = createEditorContext();

// 路由 fade 过渡期间户型页与编辑器会短暂共存；限定在本页根节点内查询，避免撞 id。
  const editorRootElement =
    document.querySelector(".editor-chrome-root") || document;
  const findElement = (selectorState: any) =>
    editorRootElement.querySelector(selectorState);
installSettingsDialogBackdropGuard2();
const EDITOR_DESIGN_WIDTH = 1020,
  AUTO_DIAGRAM_LAYOUT_VERSION = 2,
  COMPONENT_DIALOG_DESIGN_WIDTH = 1920,
  COMPONENT_DIALOG_DESIGN_HEIGHT = 1080,
  COMPONENT_DIALOG_SCALE_MULTIPLIER = 1,
  editorHeaderElement = findElement(".editor-header"),
  editorShellElement = findElement(".editor-shell");
/** 整页 scale 已废弃：改由 Vue 壳层自适应 + 画布独立 zoom。 */
function refreshEditorViewportFit() {
  document.documentElement.classList.remove("editor-viewport-fit");
  document.documentElement.style.removeProperty("--editor-layout-height");
  document.documentElement.style.setProperty("--editor-viewport-scale", "1");
  void EDITOR_DESIGN_WIDTH;
  void editorHeaderElement;
  void editorShellElement;
}
function refreshComponentDialogScale() {
  const componentDialogElement = document.getElementById(
    "component-template-dialog",
  ) as HTMLDialogElement | null;
  if (!componentDialogElement?.open || window.innerWidth <= 1180) return;
  const designedScale =
      COMPONENT_DIALOG_SCALE_MULTIPLIER *
      Math.min(
        window.innerWidth / COMPONENT_DIALOG_DESIGN_WIDTH,
        window.innerHeight / COMPONENT_DIALOG_DESIGN_HEIGHT,
      ),
    componentDialogScale = Math.min(
      designedScale,
      (window.innerWidth * 0.9) / componentDialogElement.offsetWidth,
      (window.innerHeight * 0.9) / componentDialogElement.offsetHeight,
    );
  document.documentElement.style.setProperty(
    "--component-template-dialog-scale",
    String(componentDialogScale),
  );
}
(refreshEditorViewportFit(), refreshComponentDialogScale());
const saveButtonElement = findElement("#save"),
  projectNewElement = findElement("#project-new"),
  projectSelectElement = findElement("#project-select"),
  projectActionsButtonElement = findElement("#project-actions-button"),
  projectActionsMenuElement = findElement("#project-actions-menu"),
  projectFloorplanOpenElement = findElement("#project-floorplan-open"),
  navigatorContentElement = findElement("#navigator-content"),
  showPopupEditorButtonElement = findElement(".page-control"),
  pageNewButtonElement = findElement(".popup-control"),
  showPageEditorElement = findElement("#show-page-editor"),
  showPopupEditorElement = findElement("#show-popup-editor"),
  pageNewElement = findElement("#page-new"),
  pageSelectElement = findElement("#page-select"),
  pageActionsButtonElement = findElement("#page-actions-button"),
  pageActionsMenuElement = findElement("#page-actions-menu"),
  defaultPageActionElement = findElement("#default-page-action"),
  popupNewElement = findElement("#popup-new"),
  popupSelectElement = findElement("#popup-select"),
  popupListElement = findElement("#popup-list"),
  popupActionsButtonElement = findElement("#popup-actions-button"),
  popupActionsMenuElement = findElement("#popup-actions-menu"),
  showSharedComponentsElement = findElement("#show-shared-components"),
  showPageComponentsElement = findElement("#show-page-components"),
  addComponentButtonElement = findElement("#add-component-button"),
  componentTemplateDialogElement = findElement("#component-template-dialog"),
  componentTemplateCloseElement = findElement("#component-template-close"),
  componentTemplateScopeElement = findElement("#component-template-scope"),
  componentTemplateListElement = findElement("#component-template-list"),
  sharedComponentListElement = findElement("#shared-component-list"),
  pageComponentListElement = findElement("#page-component-list"),
  componentMenuElement = findElement("#component-context-menu"),
  projectDialogElement = findElement("#project-dialog"),
  projectDialogKickerElement = findElement("#project-dialog-kicker"),
  projectDialogTitleElement = findElement("#project-dialog-title"),
  projectCloseElement = findElement("#project-close"),
  projectCancelElement = findElement("#project-cancel"),
  projectFormElement = findElement("#project-form"),
  projectSubmitElement = findElement("#project-submit"),
  projectMessageElement = findElement("#project-message"),
  projectTemplateFieldsElement = findElement("#project-template-fields"),
  projectTemplateOptionsElement = findElement("#project-template-options"),
  projectPreviewDialogElement = findElement("#project-preview-dialog"),
  projectPreviewTitleElement = findElement("#project-preview-title"),
  projectPreviewCountElement = findElement("#project-preview-count"),
  projectPreviewImageElement = findElement("#project-preview-image"),
  projectPreviewPreviousElement = findElement("#project-preview-previous"),
  projectPreviewNextElement = findElement("#project-preview-next"),
  projectPreviewCloseElement = findElement("#project-preview-close"),
  projectCanvasFieldsElement = findElement("#project-canvas-fields"),
  projectCanvasWidthElement = findElement("#project-canvas-width"),
  projectCanvasHeightElement = findElement("#project-canvas-height"),
  projectAspectRatioElement = findElement("#project-aspect-ratio"),
  projectAspectLockElement = findElement("#project-aspect-lock"),
  projectAspectLockLabelElement = findElement("#project-aspect-lock-label"),
  projectCanvasHintElement = findElement("#project-canvas-hint"),
  projectContentLockFieldsElement = findElement("#project-content-lock-fields"),
  projectContentLockElement = findElement("#project-content-lock"),
  projectResizeWarningDialogElement = findElement("#project-resize-warning-dialog"),
  projectResizeWarningTextElement = findElement("#project-resize-warning-text"),
  projectResizeWarningCloseElement = findElement("#project-resize-warning-close"),
  projectResizeWarningCancelElement = findElement("#project-resize-warning-cancel"),
  projectResizeWarningConfirmElement = findElement("#project-resize-warning-confirm"),
  pageDialogElement = findElement("#page-dialog"),
  pageDialogKickerElement = findElement("#page-dialog-kicker"),
  pageDialogTitleElement = findElement("#page-dialog-title"),
  pageCloseElement = findElement("#page-close"),
  pageCancelElement = findElement("#page-cancel"),
  pageFormElement = findElement("#page-form"),
  pageSubmitElement = findElement("#page-submit"),
  pageMessageElement = findElement("#page-message"),
  componentGroupRenameDialogElement = findElement("#component-group-rename-dialog"),
  componentGroupRenameCloseElement = findElement("#component-group-rename-close"),
  componentGroupRenameCancelElement = findElement("#component-group-rename-cancel"),
  componentGroupRenameFormElement = findElement("#component-group-rename-form"),
  componentGroupRenameInputElement = findElement("#component-group-rename-input"),
  componentGroupRenameMessageElement = findElement("#component-group-rename-message"),
  editorCanvasElement = findElement("#editor-canvas"),
  displayDeviceCountElement = findElement(".workspace"),
  workspaceTitleElement = findElement("#workspace-title"),
  workspaceResolutionElement = findElement("#workspace-resolution"),
  soundToggleButtonElement = document.createElement("button");
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
function refreshSoundToggle() {
  if (!soundToggleButtonElement) return;
  const isEditMode = editorCtx.editorMode === "edit";
  ((soundToggleButtonElement.hidden = !isEditMode),
    (soundToggleButtonElement.disabled = !editorCtx.activeProject),
    editorCtx.activeProject &&
      typeof editorCtx.activeProject.document?.soundEnabled == "boolean" &&
      buttonSoundController.isEnabled() !== editorCtx.activeProject.document.soundEnabled &&
      buttonSoundController.setEnabled(editorCtx.activeProject.document.soundEnabled),
    soundToggleButtonElement.setAttribute(
      "aria-pressed",
      String(buttonSoundController.isEnabled()),
    ),
    (soundToggleButtonElement.title = buttonSoundController.isEnabled()
      ? "关闭仪表盘音效"
      : "开启仪表盘音效"),
    soundToggleButtonElement.setAttribute("aria-label", soundToggleButtonElement.title),
    soundToggleButtonElement.classList.toggle("is-muted", !buttonSoundController.isEnabled()));
}
const deleteProjectDialogElement = findElement("#delete-project-dialog"),
  deleteProjectCloseButtonElement = findElement("#delete-project-close"),
  deleteProjectCancelButtonElement = findElement("#delete-project-cancel"),
  deleteProjectFormElement = findElement("#delete-project-form"),
  deleteProjectNameElement = findElement("#delete-project-name"),
  deleteProjectMessageElement = findElement("#delete-project-message"),
  deletePageDialogElement = findElement("#delete-page-dialog"),
  deletePageCloseButtonElement = findElement("#delete-page-close"),
  deletePageCancelButtonElement = findElement("#delete-page-cancel"),
  deletePageConfirmButtonElement = findElement("#delete-page-confirm"),
  deletePageNameElement = findElement("#delete-page-name"),
  deletePageMessageElement = findElement("#delete-page-message"),
  deleteComponentDialogElement = findElement("#delete-component-dialog"),
  deleteComponentCloseButtonElement = findElement("#delete-component-close"),
  deleteComponentCancelButtonElement = findElement("#delete-component-cancel"),
  deleteComponentConfirmButtonElement = findElement("#delete-component-confirm"),
  deleteComponentNameElement = findElement("#delete-component-name"),
  copyComponentPageDialogElement = findElement("#copy-component-page-dialog"),
  copyComponentPageCloseButtonElement = findElement("#copy-component-page-close"),
  copyComponentPageCancelButtonElement = findElement("#copy-component-page-cancel"),
  copyComponentPageFormElement = findElement("#copy-component-page-form"),
  copyComponentPageNameElement = findElement("#copy-component-page-name"),
  copyComponentPageScopeSelectElement = findElement("#copy-component-page-scope"),
  copyComponentPageProjectFieldElement = findElement("#copy-component-page-project-field"),
  copyComponentPageProjectSelectElement = findElement("#copy-component-page-project"),
  copyComponentPageTargetLabelElement = findElement("#copy-component-page-target-label"),
  copyComponentPageTargetElement = findElement("#copy-component-page-target"),
  copyComponentScaleOptionsElement = findElement("#copy-component-scale-options"),
  copyComponentResolutionSummaryElement = findElement("#copy-component-resolution-summary"),
  copyComponentPageMessageElement = findElement("#copy-component-page-message"),
  copyComponentPageSubmitElement = findElement("#copy-component-page-submit"),
  copyComponentSuccessDialogElement = findElement("#copy-component-success-dialog"),
  copyComponentSuccessMessageElement = findElement("#copy-component-success-message"),
  copyComponentSuccessStayElement = findElement("#copy-component-success-stay"),
  copyComponentSuccessGoElement = findElement("#copy-component-success-go"),
  errorDialogCloseButtonElement = findElement("#error-dialog"),
  errorDialogCloseElement = findElement("#error-dialog-close"),
  errorDialogConfirmElement = findElement("#error-dialog-confirm"),
  errorDialogMessageElement = findElement("#error-dialog-message"),
  recoveryDialogElement = findElement("#recovery-dialog"),
  recoveryDiscardElement = findElement("#recovery-discard"),
  recoveryRestoreElement = findElement("#recovery-restore"),
  undoElement = findElement("#undo"),
  redoElement = findElement("#redo"),
  inspectorEmptyElement = findElement("#inspector-empty"),
  navigatorElement = findElement(".inspector"),
  imageInspectorElement = findElement("#image-inspector"),
  imageTypeElement = findElement("#image-type"),
  imageLabelElement = findElement("#image-label"),
  imageEntityButtonElement = findElement("#image-entity-button"),
  imageEntityMenuElement = findElement("#image-entity-menu"),
  imageEntitySearchElement = findElement("#image-entity-search"),
  imageEntityOptionsElement = findElement("#image-entity-options"),
  imageAssetButtonElement = findElement("#image-asset-button"),
  imageAssetMenuElement = findElement("#image-asset-menu"),
  imageAssetFolderSelectElement = findElement("#image-asset-folder"),
  imageAssetSearchInputElement = findElement("#image-asset-search"),
  imageAssetOptionsElement = findElement("#image-asset-options"),
  imageAssetUploadButtonElement = findElement("#image-asset-upload"),
  imageAssetUploadInputElement = findElement("#image-asset-upload-input"),
  imageAssetUploadHintElement = findElement("#image-asset-upload-hint"),
  imageAssetLargePreviewImageElement = findElement("#image-asset-large-preview"),
  imageAssetLargePreviewImageElementElement = findElement("#image-asset-large-preview-image"),
  imageAssetLargePreviewNameElement = findElement("#image-asset-large-preview-name"),
  globalColorPickerElement = findElement("#global-color-picker"),
  globalColorPickerSvElement = findElement("#global-color-picker-sv"),
  globalColorPickerMarkerElement = findElement("#global-color-picker-marker"),
  globalColorPickerHueRangeInputElement = findElement("#global-color-picker-hue"),
  globalColorPickerSwatchElement = findElement("#global-color-picker-swatch"),
  globalColorPickerHexTextInputElement = findElement("#global-color-picker-hex"),
  globalColorPickerCopyButtonElement = findElement("#global-color-picker-copy"),
  globalColorPickerPasteButtonElement = findElement("#global-color-picker-paste"),
  globalColorPickerRedInputElement = findElement("#global-color-picker-r"),
  globalColorPickerGreenInputElement = findElement("#global-color-picker-g"),
  globalColorPickerBlueInputElement = findElement("#global-color-picker-b"),
  imageOpacityInputElement = findElement("#image-opacity"),
  imageLayoutOptionsElement = findElement("#image-layout-options"),
  imageLeftInputElement = findElement("#image-left"),
  imageTopInputElement = findElement("#image-top"),
  imageScaleInputElement = findElement("#image-scale"),
  imageRotationInputElement = findElement("#image-rotation"),
  floorplanAutoDiagramInspectorFormElement = findElement("#floorplan-auto-diagram-inspector"),
  floorplanAutoDiagramStatusElement = findElement("#floorplan-auto-diagram-status"),
  floorplanAutoDiagramOpenStudioButtonElement = findElement("#floorplan-auto-diagram-open-studio"),
  floorplanAutoDiagramViewToggleButtonElement = findElement("#floorplan-auto-diagram-view-toggle"),
  floorplanAutoDiagramLabelTextInputElement = findElement("#floorplan-auto-diagram-label"),
  floorplanAutoDiagramFolderTextInputElement = findElement("#floorplan-auto-diagram-folder"),
  floorplanAutoDiagramLayoutElement = findElement("#floorplan-auto-diagram-layout"),
  floorplanAutoDiagramLeftInputElement = findElement("#floorplan-auto-diagram-left"),
  floorplanAutoDiagramTopInputElement = findElement("#floorplan-auto-diagram-top"),
  floorplanAutoDiagramWidthInputElement = findElement("#floorplan-auto-diagram-width"),
  floorplanAutoDiagramHeightInputElement = findElement("#floorplan-auto-diagram-height"),
  floorplanAutoDiagramScaleInputElement = findElement("#floorplan-auto-diagram-scale"),
  floorplanAutoDiagramRotationInputElement = findElement("#floorplan-auto-diagram-rotation"),
  floorplanAutoDiagramFloorSelectElement = findElement("#floorplan-auto-diagram-floor"),
  floorplanAutoDiagramCameraViewElement = findElement("#floorplan-auto-diagram-camera-view"),
  floorplanAutoDiagramCameraModeElement = findElement("#floorplan-auto-diagram-camera-mode"),
  floorplanAutoDiagramFocalLengthInputElement = findElement("#floorplan-auto-diagram-focal-length"),
  floorplanAutoDiagramRotateTopButtonElement = findElement("#floorplan-auto-diagram-rotate-top"),
  floorplanAutoDiagramOpenBaseLightingButtonElement = findElement(
    "#floorplan-auto-diagram-open-base-lighting",
  ),
  floorplanAutoDiagramBindingsElement = findElement("#floorplan-auto-diagram-bindings"),
  floorplanAutoDiagramBindingListElement = findElement("#floorplan-auto-diagram-binding-list"),
  floorplanAutoLightingPanelElement = findElement("#floorplan-auto-lighting-panel"),
  floorplanAutoLightingHandleElement = findElement("#floorplan-auto-lighting-handle"),
  floorplanAutoLightingCloseButtonElement = findElement("#floorplan-auto-lighting-close"),
  floorplanAutoLightingResetButtonElement = findElement("#floorplan-auto-lighting-reset"),
  floorplanAutoLightingSaveButtonElement = findElement("#floorplan-auto-lighting-save"),
  floorplanAutoLightingStatusElement = findElement("#floorplan-auto-lighting-status"),
  floorplanBaseLightElements = [...document.querySelectorAll<HTMLInputElement>("[data-floorplan-base-light]")];
editorCtx.baseLightingSettings = normalizeBaseLighting2(DEFAULT_BASE_LIGHTING2);
const componentActionControlsElement = findElement("#component-action-controls"),
  floorplanAutoDiagramDialogElement = findElement("#floorplan-auto-diagram-dialog"),
  floorplanAutoDiagramCloseButtonElement = findElement("#floorplan-auto-diagram-close"),
  floorplanAutoDiagramGuideElement = findElement("#floorplan-auto-diagram-guide"),
  floorplanAutoDiagramLaterButtonElement = findElement("#floorplan-auto-diagram-later"),
  floorplanAutoDiagramContinueElement = findElement("#floorplan-auto-diagram-continue"),
  iconButtonEffectInspectorElement = findElement("#icon-button-effect-inspector"),
  ibeLabelElement = findElement("#ibe-label"),
  ibeEntityButtonElement = findElement("#ibe-entity-button"),
  ibeEntityMenuElement = findElement("#ibe-entity-menu"),
  ibeEntitySearchElement = findElement("#ibe-entity-search"),
  ibeEntityOptionsElement = findElement("#ibe-entity-options"),
  ibeColorTemperatureRealtimeElement = findElement("#ibe-color-temperature-realtime"),
  ibeBrightnessRealtimeElement = findElement("#ibe-brightness-realtime"),
  ibePreviewStateElement = findElement("#ibe-preview-state"),
  ibeLayerOptionsElement = findElement("#ibe-layer-options"),
  ibeButtonSectionElement = findElement("#ibe-button-section"),
  ibeEffectSectionElement = findElement("#ibe-effect-section"),
  ibeButtonVisibleElement = findElement("#ibe-button-visible"),
  ibeEffectVisibleElement = findElement("#ibe-effect-visible"),
  ibeButtonTransformSectionElement = findElement("#ibe-button-transform-section"),
  ibeActionSectionElement = findElement("#ibe-action-section"),
  ibeIconButtonElement = findElement("#ibe-icon-button"),
  ibeIconCopyElement = findElement("#ibe-icon-copy"),
  ibeIconMenuElement = findElement("#ibe-icon-menu"),
  ibeIconSearchElement = findElement("#ibe-icon-search"),
  ibeIconOptionsElement = findElement("#ibe-icon-options"),
  ibeIconOffColorElement = findElement("#ibe-icon-off-color"),
  ibeIconOnColorElement = findElement("#ibe-icon-on-color"),
  ibeIconSizeElement = findElement("#ibe-icon-size"),
  ibeButtonOffColorElement = findElement("#ibe-button-off-color"),
  ibeButtonOnColorElement = findElement("#ibe-button-on-color"),
  ibeButtonOpacityElement = findElement("#ibe-button-opacity"),
  ibeFrameColorElement = findElement("#ibe-frame-color"),
  ibeFrameWidthElement = findElement("#ibe-frame-width"),
  ibeFrameOpacityElement = findElement("#ibe-frame-opacity"),
  ibeRadiusElement = findElement("#ibe-radius"),
  ibeGlowColorElement = findElement("#ibe-glow-color"),
  ibeGlowOffStrengthElement = findElement("#ibe-glow-off-strength"),
  ibeGlowOnStrengthElement = findElement("#ibe-glow-on-strength"),
  ibeAssetButtonElement = findElement("#ibe-asset-button"),
  ibeAssetMenuElement = findElement("#ibe-asset-menu"),
  ibeAssetFolderElement = findElement("#ibe-asset-folder"),
  ibeAssetSearchElement = findElement("#ibe-asset-search"),
  ibeAssetOptionsElement = findElement("#ibe-asset-options"),
  ibeAssetUploadElement = findElement("#ibe-asset-upload"),
  ibeAssetUploadInputElement = findElement("#ibe-asset-upload-input"),
  ibeAssetUploadHintElement = findElement("#ibe-asset-upload-hint"),
  ibeEffectOpacityElement = findElement("#ibe-effect-opacity"),
  ibeEffectFadeDurationElement = findElement("#ibe-effect-fade-duration"),
  ibeEffectLayoutOptionsElement = findElement("#ibe-effect-layout-options"),
  ibeEffectAlignImageElement = findElement("#ibe-effect-align-image"),
  ibeEffectLeftElement = findElement("#ibe-effect-left"),
  ibeEffectTopElement = findElement("#ibe-effect-top"),
  ibeEffectScaleElement = findElement("#ibe-effect-scale"),
  ibeEffectRotationElement = findElement("#ibe-effect-rotation"),
  ibeEffectSizeHintElement = findElement("#ibe-effect-size-hint"),
  effectImageAlignDialogElement = findElement("#effect-image-align-dialog"),
  effectImageAlignCloseElement = findElement("#effect-image-align-close"),
  effectImageAlignCancelElement = findElement("#effect-image-align-cancel"),
  effectImageAlignConfirmElement = findElement("#effect-image-align-confirm"),
  effectImageAlignOptionsElement = findElement("#effect-image-align-options"),
  effectImageAlignMessageElement = findElement("#effect-image-align-message"),
  ibeLeftElement = findElement("#ibe-left"),
  ibeTopElement = findElement("#ibe-top"),
  ibeWidthElement = findElement("#ibe-width"),
  ibeHeightElement = findElement("#ibe-height"),
  ibeScaleElement = findElement("#ibe-scale"),
  ibeRotationElement = findElement("#ibe-rotation"),
  ibeActionControlsElement = findElement("#ibe-action-controls"),
  ibeApplyStyleElement = findElement("#ibe-apply-style"),
  ibeApplyCountElement = findElement("#ibe-apply-count"),
  titleButtonInspectorElement = findElement("#title-button-inspector"),
  titleButtonLabelElement = findElement("#title-button-label"),
  titleButtonEntityButtonElement = findElement("#title-button-entity-button"),
  titleButtonEntityMenuElement = findElement("#title-button-entity-menu"),
  titleButtonEntitySearchElement = findElement("#title-button-entity-search"),
  titleButtonEntityOptionsElement = findElement("#title-button-entity-options"),
  titleButtonMainVisibleElement = findElement("#title-button-main-visible"),
  titleButtonSecondaryVisibleElement = findElement("#title-button-secondary-visible"),
  titleButtonMainTextElement = findElement("#title-button-main-text"),
  titleButtonSecondaryLine1Element = findElement("#title-button-secondary-line-1"),
  titleButtonSecondaryLine2Element = findElement("#title-button-secondary-line-2"),
  titleButtonMainColorElement = findElement("#title-button-main-color"),
  titleButtonSecondaryColorElement = findElement("#title-button-secondary-color"),
  titleButtonMainSizeElement = findElement("#title-button-main-size"),
  titleButtonSecondarySizeElement = findElement("#title-button-secondary-size"),
  titleButtonMainWeightElement = findElement("#title-button-main-weight"),
  titleButtonSecondaryWeightElement = findElement("#title-button-secondary-weight"),
  titleButtonMainSpacingElement = findElement("#title-button-main-spacing"),
  titleButtonSecondarySpacingElement = findElement("#title-button-secondary-spacing"),
  titleButtonSecondaryLineGapElement = findElement("#title-button-secondary-line-gap"),
  titleButtonMainLeftElement = findElement("#title-button-main-left"),
  titleButtonMainTopElement = findElement("#title-button-main-top"),
  titleButtonSecondaryLeftElement = findElement("#title-button-secondary-left"),
  titleButtonSecondaryTopElement = findElement("#title-button-secondary-top"),
  titleButtonIconVisibleElement = findElement("#title-button-icon-visible"),
  titleButtonIconButtonElement = findElement("#title-button-icon-button"),
  titleButtonIconCopyElement = findElement("#title-button-icon-copy"),
  titleButtonIconMenuElement = findElement("#title-button-icon-menu"),
  titleButtonIconSearchElement = findElement("#title-button-icon-search"),
  titleButtonIconOptionsElement = findElement("#title-button-icon-options"),
  titleButtonIconColorElement = findElement("#title-button-icon-color"),
  titleButtonIconSizeElement = findElement("#title-button-icon-size"),
  titleButtonIconLeftElement = findElement("#title-button-icon-left"),
  titleButtonIconTopElement = findElement("#title-button-icon-top"),
  titleButtonFrameColorElement = findElement("#title-button-frame-color"),
  titleButtonFrameVisibleElement = findElement("#title-button-frame-visible"),
  titleButtonFrameWidthElement = findElement("#title-button-frame-width"),
  titleButtonFrameSizeElement = findElement("#title-button-frame-size"),
  titleButtonFrameSpacingElement = findElement("#title-button-frame-spacing"),
  titleButtonFrameOffsetXElement = findElement("#title-button-frame-offset-x"),
  titleButtonFrameOffsetYElement = findElement("#title-button-frame-offset-y"),
  titleButtonMarkerVisibleElement = findElement("#title-button-marker-visible"),
  titleButtonMarkerColorElement = findElement("#title-button-marker-color"),
  titleButtonMarkerSizeElement = findElement("#title-button-marker-size"),
  titleButtonMarkerLeftElement = findElement("#title-button-marker-left"),
  titleButtonMarkerTopElement = findElement("#title-button-marker-top"),
  titleButtonLeftElement = findElement("#title-button-left"),
  titleButtonTopElement = findElement("#title-button-top"),
  titleButtonWidthElement = findElement("#title-button-width"),
  titleButtonHeightElement = findElement("#title-button-height"),
  titleButtonScaleElement = findElement("#title-button-scale"),
  titleButtonRotationElement = findElement("#title-button-rotation"),
  titleButtonActionControlsElement = findElement("#title-button-action-controls"),
  titleButtonApplyStyleElement = findElement("#title-button-apply-style"),
  titleButtonApplyCountElement = findElement("#title-button-apply-count"),
  lightStatisticsInspectorElement = findElement("#light-statistics-inspector"),
  lightStatisticsLabelElement = findElement("#light-statistics-label"),
  lightStatisticsTitleElement = findElement("#light-statistics-title"),
  lightStatisticsEntityButtonElement = findElement("#light-statistics-entity-button"),
  lightStatisticsEntityMenuElement = findElement("#light-statistics-entity-menu"),
  lightStatisticsEntitySearchElement = findElement("#light-statistics-entity-search"),
  lightStatisticsEntityOptionsElement = findElement("#light-statistics-entity-options"),
  lightStatisticsEntityPendingElement = findElement("#light-statistics-entity-pending"),
  lightStatisticsEntityConfirmElement = findElement("#light-statistics-entity-confirm"),
  lightStatisticsEntityMessageElement = findElement("#light-statistics-entity-message"),
  lightStatisticsEntityListElement = findElement("#light-statistics-entity-list"),
  lightStatisticsEntityCountElement = findElement("#light-statistics-entity-count"),
  lightStatisticsActionEntityButtonElement = findElement("#light-statistics-action-entity-button"),
  lightStatisticsActionEntityMenuElement = findElement("#light-statistics-action-entity-menu"),
  lightStatisticsActionEntitySearchElement = findElement("#light-statistics-action-entity-search"),
  lightStatisticsActionEntityOptionsElement = findElement(
    "#light-statistics-action-entity-options",
  ),
  lightStatisticsActionNoteElement = findElement("#light-statistics-action-note"),
  lightStatisticsActionControlsElement = findElement("#light-statistics-action-controls"),
  lightStatisticsIconButtonElement = findElement("#light-statistics-icon-button"),
  lightStatisticsIconCopyElement = findElement("#light-statistics-icon-copy"),
  lightStatisticsIconMenuElement = findElement("#light-statistics-icon-menu"),
  lightStatisticsIconSearchElement = findElement("#light-statistics-icon-search"),
  lightStatisticsIconOptionsElement = findElement("#light-statistics-icon-options"),
  lightStatisticsIconVisibleElement = findElement("#light-statistics-icon-visible"),
  lightStatisticsIconColorElement = findElement("#light-statistics-icon-color"),
  lightStatisticsIconActiveColorElement = findElement("#light-statistics-icon-active-color"),
  lightStatisticsIconSizeElement = findElement("#light-statistics-icon-size"),
  lightStatisticsTitleVisibleElement = findElement("#light-statistics-title-visible"),
  lightStatisticsTitleColorElement = findElement("#light-statistics-title-color"),
  lightStatisticsTitleSizeElement = findElement("#light-statistics-title-size"),
  lightStatisticsTitleWeightElement = findElement("#light-statistics-title-weight"),
  lightStatisticsTitleSpacingElement = findElement("#light-statistics-title-spacing"),
  lightStatisticsCountVisibleElement = findElement("#light-statistics-count-visible"),
  lightStatisticsCountColorElement = findElement("#light-statistics-count-color"),
  lightStatisticsCountActiveColorElement = findElement("#light-statistics-count-active-color"),
  lightStatisticsCountSizeElement = findElement("#light-statistics-count-size"),
  lightStatisticsCountWeightElement = findElement("#light-statistics-count-weight"),
  lightStatisticsCountSpacingElement = findElement("#light-statistics-count-spacing"),
  lightStatisticsIconGapElement = findElement("#light-statistics-icon-gap"),
  lightStatisticsCountGapElement = findElement("#light-statistics-count-gap"),
  lightStatisticsLeftElement = findElement("#light-statistics-left"),
  lightStatisticsTopElement = findElement("#light-statistics-top"),
  lightStatisticsWidthElement = findElement("#light-statistics-width"),
  lightStatisticsHeightElement = findElement("#light-statistics-height"),
  lightStatisticsScaleElement = findElement("#light-statistics-scale"),
  lightStatisticsRotationElement = findElement("#light-statistics-rotation"),
  iconButtonInspectorElement = findElement("#icon-button-inspector"),
  iconButtonTypeLabelElement = findElement("#icon-button-type-label"),
  iconButtonTypeElement = findElement("#icon-button-type"),
  iconButtonLabelElement = findElement("#icon-button-label"),
  presenceSensorKindLabelElement = findElement("#presence-sensor-kind-label"),
  presenceSensorKindElement = findElement("#presence-sensor-kind"),
  iconButtonEntityButtonElement = findElement("#icon-button-entity-button"),
  iconButtonEntityMenuElement = findElement("#icon-button-entity-menu"),
  iconButtonEntitySearchElement = findElement("#icon-button-entity-search"),
  iconButtonEntityOptionsElement = findElement("#icon-button-entity-options"),
  coverSettingsInspectorElement = findElement("#cover-settings-inspector"),
  coverSettingsKindElement = findElement("#cover-settings-kind"),
  coverSettingsDirectionElement = findElement("#cover-settings-direction"),
  coverSettingsMotorDirectionElement = findElement("#cover-settings-motor-direction"),
  iconButtonPreviewStateElement = findElement("#icon-button-preview-state"),
  iconButtonPreviewControlElement = findElement("#icon-button-preview-control"),
  iconButtonIconButtonElement = findElement("#icon-button-icon-button"),
  iconButtonIconCopyElement = findElement("#icon-button-icon-copy"),
  iconButtonIconMenuElement = findElement("#icon-button-icon-menu"),
  iconButtonIconSearchElement = findElement("#icon-button-icon-search"),
  iconButtonIconOptionsElement = findElement("#icon-button-icon-options"),
  iconButtonIconColorElement = findElement("#icon-button-icon-color"),
  iconButtonIconColorLabelElement = findElement("#icon-button-icon-color-label"),
  deviceButtonIconVisibleElement = findElement("#device-button-icon-visible"),
  deviceButtonIconOnColorElement = findElement("#device-button-icon-on-color"),
  deviceButtonIconOnColorLabelElement = findElement("#device-button-icon-on-color-label"),
  deviceButtonBadgeColorElement = findElement("#device-button-badge-color"),
  deviceButtonBadgeColorLabelElement = findElement("#device-button-badge-color-label"),
  deviceButtonBadgeOpacityElement = findElement("#device-button-badge-opacity"),
  deviceButtonBadgeOpacityLabelElement = findElement("#device-button-badge-opacity-label"),
  iconButtonIconSizeElement = findElement("#icon-button-icon-size"),
  iconButtonIconSizeLabelElement = findElement("#icon-button-icon-size-label"),
  deviceButtonSymbolSizeElement = findElement("#device-button-symbol-size"),
  deviceButtonSymbolSizeLabelElement = findElement("#device-button-symbol-size-label"),
  deviceButtonBadgeSizeElement = findElement("#device-button-badge-size"),
  deviceButtonBadgeSizeLabelElement = findElement("#device-button-badge-size-label"),
  deviceButtonStatePrecisionElement = findElement("#device-button-state-precision"),
  deviceButtonStatePrecisionLabelElement = findElement("#device-button-state-precision-label"),
  iconButtonIconOffOpacityElement = findElement("#icon-button-icon-off-opacity"),
  iconButtonIconOnOpacityElement = findElement("#icon-button-icon-on-opacity"),
  iconButtonIconOffOpacityLabelElement = findElement("#icon-button-icon-off-opacity-label"),
  iconButtonIconOnOpacityLabelElement = findElement("#icon-button-icon-on-opacity-label"),
  iconButtonIconLeftElement = findElement("#icon-button-icon-left"),
  iconButtonIconTopElement = findElement("#icon-button-icon-top"),
  iconButtonMainTextElement = findElement("#icon-button-main-text"),
  iconButtonSecondaryTextElement = findElement("#icon-button-secondary-text"),
  iconButtonMainHeadingElement = findElement("#icon-button-main-heading"),
  deviceButtonMainVisibleElement = findElement("#device-button-main-visible"),
  iconButtonSecondaryHeadingElement = findElement("#icon-button-secondary-heading"),
  deviceButtonSecondaryVisibleElement = findElement("#device-button-secondary-visible"),
  iconButtonMainContentLabelElement = findElement("#icon-button-main-content-label"),
  iconButtonSecondaryContentLabelElement = findElement("#icon-button-secondary-content-label"),
  iconButtonMainColorElement = findElement("#icon-button-main-color"),
  iconButtonSecondaryColorElement = findElement("#icon-button-secondary-color"),
  iconButtonMainOffOpacityElement = findElement("#icon-button-main-off-opacity"),
  iconButtonMainOnOpacityElement = findElement("#icon-button-main-on-opacity"),
  iconButtonSecondaryOffOpacityElement = findElement("#icon-button-secondary-off-opacity"),
  iconButtonSecondaryOnOpacityElement = findElement("#icon-button-secondary-on-opacity"),
  iconButtonMainOffOpacityLabelElement = findElement("#icon-button-main-off-opacity-label"),
  iconButtonMainOnOpacityLabelElement = findElement("#icon-button-main-on-opacity-label"),
  iconButtonSecondaryOffOpacityLabelElement = findElement(
    "#icon-button-secondary-off-opacity-label",
  ),
  iconButtonSecondaryOnOpacityLabelElement = findElement("#icon-button-secondary-on-opacity-label"),
  iconButtonMainSizeElement = findElement("#icon-button-main-size"),
  iconButtonSecondarySizeElement = findElement("#icon-button-secondary-size"),
  iconButtonMainWeightElement = findElement("#icon-button-main-weight"),
  iconButtonSecondaryWeightElement = findElement("#icon-button-secondary-weight"),
  iconButtonMainSpacingElement = findElement("#icon-button-main-spacing"),
  iconButtonSecondarySpacingElement = findElement("#icon-button-secondary-spacing"),
  iconButtonMainLeftElement = findElement("#icon-button-main-left"),
  iconButtonMainTopElement = findElement("#icon-button-main-top"),
  iconButtonSecondaryLeftElement = findElement("#icon-button-secondary-left"),
  iconButtonSecondaryTopElement = findElement("#icon-button-secondary-top"),
  iconButtonOnFillVisibleElement = findElement("#icon-button-on-fill-visible"),
  iconButtonFillSectionElement = findElement("#icon-button-fill-section"),
  iconButtonOnFillColorElement = findElement("#icon-button-on-fill-color"),
  iconButtonOnFillStrengthElement = findElement("#icon-button-on-fill-strength"),
  iconButtonOnFillFadeDurationElement = findElement("#icon-button-on-fill-fade-duration"),
  iconButtonFrameVisibleElement = findElement("#icon-button-frame-visible"),
  iconButtonFrameSectionElement = findElement("#icon-button-frame-section"),
  iconButtonFrameWidthElement = findElement("#icon-button-frame-width"),
  iconButtonFrameAngleElement = findElement("#icon-button-frame-angle"),
  iconButtonFrameOffOpacityElement = findElement("#icon-button-frame-off-opacity"),
  iconButtonFrameOnOpacityElement = findElement("#icon-button-frame-on-opacity"),
  iconButtonCutCornerElement = findElement("#icon-button-cut-corner"),
  iconButtonSoftLightVisibleElement = findElement("#icon-button-soft-light-visible"),
  iconButtonSoftLightSectionElement = findElement("#icon-button-soft-light-section"),
  iconButtonSoftLightColorElement = findElement("#icon-button-soft-light-color"),
  iconButtonSoftLightStrengthElement = findElement("#icon-button-soft-light-strength"),
  iconButtonSoftLightSizeElement = findElement("#icon-button-soft-light-size"),
  iconButtonSoftLightAngleElement = findElement("#icon-button-soft-light-angle"),
  iconButtonGlowVisibleElement = findElement("#icon-button-glow-visible"),
  iconButtonGlowSectionElement = findElement("#icon-button-glow-section"),
  iconButtonGlowColorElement = findElement("#icon-button-glow-color"),
  iconButtonGlowStrengthElement = findElement("#icon-button-glow-strength"),
  iconButtonGlowSizeElement = findElement("#icon-button-glow-size"),
  iconButtonGlowAngleElement = findElement("#icon-button-glow-angle"),
  iconButtonLeftElement = findElement("#icon-button-left"),
  iconButtonTopElement = findElement("#icon-button-top"),
  iconButtonWidthElement = findElement("#icon-button-width"),
  iconButtonHeightElement = findElement("#icon-button-height"),
  iconButtonScaleElement = findElement("#icon-button-scale"),
  iconButtonRotationElement = findElement("#icon-button-rotation"),
  iconButtonActionControlsElement = findElement("#icon-button-action-controls"),
  iconButtonActionSectionElement = findElement("#icon-button-action-section"),
  iconButtonPreviewDetailsElement = findElement("#icon-button-preview-details"),
  iconButtonApplyStyleElement = findElement("#icon-button-apply-style"),
  iconButtonApplyCountElement = findElement("#icon-button-apply-count"),
  presenceMotionSectionElement = findElement("#presence-motion-section"),
  doorWindowPerspectiveSectionElement = findElement("#door-window-perspective-section"),
  doorWindowPerspectiveEditElement = findElement("#door-window-perspective-edit"),
  doorWindowPerspectiveResetElement = findElement("#door-window-perspective-reset"),
  doorWindowPerspectiveSaveElement = findElement("#door-window-perspective-save"),
  presenceHaloVisibleElement = findElement("#presence-halo-visible"),
  presenceHaloScaleXElement = findElement("#presence-halo-scale-x"),
  presenceHaloScaleYElement = findElement("#presence-halo-scale-y"),
  presenceHaloRotationElement = findElement("#presence-halo-rotation"),
  presenceHaloOpacityElement = findElement("#presence-halo-opacity"),
  presencePersonVisibleElement = findElement("#presence-person-visible"),
  presencePersonScaleElement = findElement("#presence-person-scale"),
  presencePersonRotationElement = findElement("#presence-person-rotation"),
  presencePersonOpacityElement = findElement("#presence-person-opacity"),
  presenceOrbitDurationElement = findElement("#presence-orbit-duration"),
  airConditionerInspectorElement = findElement("#air-conditioner-inspector"),
  airConditionerLabelElement = findElement("#air-conditioner-label"),
  airConditionerDeviceTypeElement = findElement("#air-conditioner-device-type"),
  airConditionerEntityButtonElement = findElement("#air-conditioner-entity-button"),
  airConditionerEntityMenuElement = findElement("#air-conditioner-entity-menu"),
  airConditionerEntitySearchElement = findElement("#air-conditioner-entity-search"),
  airConditionerEntityOptionsElement = findElement("#air-conditioner-entity-options"),
  airConditionerPreviewStateElement = findElement("#air-conditioner-preview-state"),
  airConditionerLayerOptionsElement = findElement("#air-conditioner-layer-options"),
  airConditionerButtonSectionElement = findElement("#air-conditioner-button-section"),
  airConditionerAirflowSectionElement = findElement("#air-conditioner-airflow-section"),
  airConditionerTransformSectionElement = findElement("#air-conditioner-transform-section"),
  airConditionerActionSectionElement = findElement("#air-conditioner-action-section"),
  airConditionerIconVisibleElement = findElement("#air-conditioner-icon-visible"),
  airConditionerIconOffColorElement = findElement("#air-conditioner-icon-off-color"),
  airConditionerIconOnColorElement = findElement("#air-conditioner-icon-on-color"),
  airConditionerBadgeColorElement = findElement("#air-conditioner-badge-color"),
  airConditionerBadgeOpacityElement = findElement("#air-conditioner-badge-opacity"),
  airConditionerSymbolSizeElement = findElement("#air-conditioner-symbol-size"),
  airConditionerBadgeSizeElement = findElement("#air-conditioner-badge-size"),
  airConditionerIconLeftElement = findElement("#air-conditioner-icon-left"),
  airConditionerIconTopElement = findElement("#air-conditioner-icon-top"),
  airConditionerMainVisibleElement = findElement("#air-conditioner-main-visible"),
  airConditionerMainTextElement = findElement("#air-conditioner-main-text"),
  airConditionerMainColorElement = findElement("#air-conditioner-main-color"),
  airConditionerMainSizeElement = findElement("#air-conditioner-main-size"),
  airConditionerMainWeightElement = findElement("#air-conditioner-main-weight"),
  airConditionerMainSpacingElement = findElement("#air-conditioner-main-spacing"),
  airConditionerMainLeftElement = findElement("#air-conditioner-main-left"),
  airConditionerMainTopElement = findElement("#air-conditioner-main-top"),
  airConditionerSecondaryVisibleElement = findElement("#air-conditioner-secondary-visible"),
  airConditionerSecondaryTextElement = findElement("#air-conditioner-secondary-text"),
  airConditionerSecondaryColorElement = findElement("#air-conditioner-secondary-color"),
  airConditionerSecondarySizeElement = findElement("#air-conditioner-secondary-size"),
  airConditionerSecondaryWeightElement = findElement("#air-conditioner-secondary-weight"),
  airConditionerSecondarySpacingElement = findElement("#air-conditioner-secondary-spacing"),
  airConditionerSecondaryLeftElement = findElement("#air-conditioner-secondary-left"),
  airConditionerSecondaryTopElement = findElement("#air-conditioner-secondary-top"),
  airConditionerAirflowVisibleElement = findElement("#air-conditioner-airflow-visible"),
  airConditionerAirflowMotionElement = findElement("#air-conditioner-airflow-motion"),
  airConditionerAirflowCoolColorElement = findElement("#air-conditioner-airflow-cool-color"),
  airConditionerAirflowHeatColorElement = findElement("#air-conditioner-airflow-heat-color"),
  airConditionerAirflowOtherColorElement = findElement("#air-conditioner-airflow-other-color"),
  airConditionerAirflowAngleElement = findElement("#air-conditioner-airflow-angle"),
  airConditionerAirflowCurveElement = findElement("#air-conditioner-airflow-curve"),
  airConditionerAirflowLengthElement = findElement("#air-conditioner-airflow-length"),
  airConditionerAirflowFadeElement = findElement("#air-conditioner-airflow-fade"),
  airConditionerAirflowSpreadElement = findElement("#air-conditioner-airflow-spread"),
  airConditionerAirflowDensityElement = findElement("#air-conditioner-airflow-density"),
  airConditionerAirflowIrregularityElement = findElement("#air-conditioner-airflow-irregularity"),
  airConditionerAirflowThicknessElement = findElement("#air-conditioner-airflow-thickness"),
  airConditionerAirflowStrengthElement = findElement("#air-conditioner-airflow-strength"),
  airConditionerAirflowBlurElement = findElement("#air-conditioner-airflow-blur"),
  airConditionerAirflowSpeedElement = findElement("#air-conditioner-airflow-speed"),
  airConditionerAirflowOffsetXElement = findElement("#air-conditioner-airflow-offset-x"),
  airConditionerAirflowOffsetYElement = findElement("#air-conditioner-airflow-offset-y"),
  airConditionerAirflowWidthElement = findElement("#air-conditioner-airflow-width"),
  airConditionerAirflowHeightElement = findElement("#air-conditioner-airflow-height"),
  airConditionerAirflowScaleElement = findElement("#air-conditioner-airflow-scale"),
  airConditionerAirflowRotationElement = findElement("#air-conditioner-airflow-rotation"),
  airConditionerLeftElement = findElement("#air-conditioner-left"),
  airConditionerTopElement = findElement("#air-conditioner-top"),
  airConditionerWidthElement = findElement("#air-conditioner-width"),
  airConditionerHeightElement = findElement("#air-conditioner-height"),
  airConditionerScaleElement = findElement("#air-conditioner-scale"),
  airConditionerRotationElement = findElement("#air-conditioner-rotation"),
  airConditionerActionControlsElement = findElement("#air-conditioner-action-controls"),
  airConditionerPreviewDetailsElement = findElement("#air-conditioner-preview-details"),
  airConditionerApplyStyleElement = findElement("#air-conditioner-apply-style"),
  airConditionerApplyCountElement = findElement("#air-conditioner-apply-count"),
  vacuumMapInspectorElement = findElement("#vacuum-map-inspector"),
  vacuumMapLabelElement = findElement("#vacuum-map-label"),
  vacuumMapEntityButtonElement = findElement("#vacuum-map-entity-button"),
  vacuumMapEntityMenuElement = findElement("#vacuum-map-entity-menu"),
  vacuumMapEntitySearchElement = findElement("#vacuum-map-entity-search"),
  vacuumMapEntityOptionsElement = findElement("#vacuum-map-entity-options"),
  vacuumMapOpacityElement = findElement("#vacuum-map-opacity"),
  vacuumMapLeftElement = findElement("#vacuum-map-left"),
  vacuumMapTopElement = findElement("#vacuum-map-top"),
  vacuumMapScaleElement = findElement("#vacuum-map-scale"),
  vacuumMapRotationElement = findElement("#vacuum-map-rotation"),
  cameraInspectorElement = findElement("#camera-inspector"),
  cameraLabelElement = findElement("#camera-label"),
  cameraSourceOptionsElement = findElement("#camera-source-options"),
  cameraEntityPickerElement = findElement("#camera-entity-picker"),
  cameraGo2rtcUrlFieldElement = findElement("#camera-go2rtc-url-field"),
  cameraGo2rtcUrlElement = findElement("#camera-go2rtc-url"),
  cameraGo2rtcNoteElement = findElement("#camera-go2rtc-note"),
  cameraEntityButtonElement = findElement("#camera-entity-button"),
  cameraEntityMenuElement = findElement("#camera-entity-menu"),
  cameraEntitySearchElement = findElement("#camera-entity-search"),
  cameraEntityOptionsElement = findElement("#camera-entity-options"),
  cameraFitOptionsElement = findElement("#camera-fit-options"),
  cameraDisplayModeOptionsElement = findElement("#camera-display-mode-options"),
  cameraRefreshIntervalFieldElement = findElement("#camera-refresh-interval-field"),
  cameraRefreshIntervalElement = findElement("#camera-refresh-interval"),
  cameraMediaVisibleElement = findElement("#camera-media-visible"),
  cameraFrameVisibleElement = findElement("#camera-frame-visible"),
  cameraFrameColorElement = findElement("#camera-frame-color"),
  cameraFrameWidthElement = findElement("#camera-frame-width"),
  cameraRadiusElement = findElement("#camera-radius"),
  cameraFrameAngleElement = findElement("#camera-frame-angle"),
  cameraFrameOpacityElement = findElement("#camera-frame-opacity"),
  cameraLeftElement = findElement("#camera-left"),
  cameraTopElement = findElement("#camera-top"),
  cameraWidthElement = findElement("#camera-width"),
  cameraHeightElement = findElement("#camera-height"),
  cameraScaleElement = findElement("#camera-scale"),
  cameraRotationElement = findElement("#camera-rotation"),
  cameraActionControlsElement = findElement("#camera-action-controls"),
  cameraApplyStyleElement = findElement("#camera-apply-style"),
  cameraApplyCountElement = findElement("#camera-apply-count"),
  timeInspectorElement = findElement("#time-inspector"),
  timeTypeElement = findElement("#time-type"),
  timeLabelElement = findElement("#time-label"),
  timeHourFormatElement = findElement("#time-hour-format"),
  timeSecondsElement = findElement("#time-seconds"),
  timeColorElement = findElement("#time-color"),
  timeFontSizeElement = findElement("#time-font-size"),
  timeFontWeightElement = findElement("#time-font-weight"),
  timeLetterSpacingElement = findElement("#time-letter-spacing"),
  timeOpacityElement = findElement("#time-opacity"),
  timeLeftElement = findElement("#time-left"),
  timeTopElement = findElement("#time-top"),
  timeScaleElement = findElement("#time-scale"),
  timeRotationElement = findElement("#time-rotation"),
  dateInspectorElement = findElement("#date-inspector"),
  dateTypeElement = findElement("#date-type"),
  dateLabelElement = findElement("#date-label"),
  dateWeekdayElement = findElement("#date-weekday"),
  dateLunarElement = findElement("#date-lunar"),
  datePrimaryColorElement = findElement("#date-primary-color"),
  datePrimarySizeElement = findElement("#date-primary-size"),
  datePrimaryWeightElement = findElement("#date-primary-weight"),
  datePrimarySpacingElement = findElement("#date-primary-spacing"),
  dateLunarColorElement = findElement("#date-lunar-color"),
  dateLunarSizeElement = findElement("#date-lunar-size"),
  dateLunarWeightElement = findElement("#date-lunar-weight"),
  dateLunarSpacingElement = findElement("#date-lunar-spacing"),
  dateLineGapElement = findElement("#date-line-gap"),
  dateOpacityElement = findElement("#date-opacity"),
  dateLeftElement = findElement("#date-left"),
  dateTopElement = findElement("#date-top"),
  dateScaleElement = findElement("#date-scale"),
  dateRotationElement = findElement("#date-rotation"),
  weatherInspectorElement = findElement("#weather-inspector"),
  weatherTypeElement = findElement("#weather-type"),
  weatherLabelElement = findElement("#weather-label"),
  weatherEntityButtonElement = findElement("#weather-entity-button"),
  weatherEntityMenuElement = findElement("#weather-entity-menu"),
  weatherEntitySearchElement = findElement("#weather-entity-search"),
  weatherEntityOptionsElement = findElement("#weather-entity-options"),
  weatherIconVisibleElement = findElement("#weather-icon-visible"),
  weatherTemperatureVisibleElement = findElement("#weather-temperature-visible"),
  weatherConditionVisibleElement = findElement("#weather-condition-visible"),
  weatherHumidityVisibleElement = findElement("#weather-humidity-visible"),
  weatherIconSizeElement = findElement("#weather-icon-size"),
  weatherIconGapElement = findElement("#weather-icon-gap"),
  weatherTemperatureColorElement = findElement("#weather-temperature-color"),
  weatherTemperatureSizeElement = findElement("#weather-temperature-size"),
  weatherTemperatureWeightElement = findElement("#weather-temperature-weight"),
  weatherTemperatureSpacingElement = findElement("#weather-temperature-spacing"),
  weatherSecondaryColorElement = findElement("#weather-secondary-color"),
  weatherSecondarySizeElement = findElement("#weather-secondary-size"),
  weatherSecondaryWeightElement = findElement("#weather-secondary-weight"),
  weatherSecondarySpacingElement = findElement("#weather-secondary-spacing"),
  weatherLineGapElement = findElement("#weather-line-gap"),
  weatherOpacityElement = findElement("#weather-opacity"),
  weatherLeftElement = findElement("#weather-left"),
  weatherTopElement = findElement("#weather-top"),
  weatherScaleElement = findElement("#weather-scale"),
  weatherRotationElement = findElement("#weather-rotation"),
  lineChartInspectorElement = findElement("#line-chart-inspector"),
  eventLogWallInspectorElement = findElement("#event-log-wall-inspector"),
  eventLogWallTypeElement = findElement("#event-log-wall-type"),
  eventLogWallLabelElement = findElement("#event-log-wall-label"),
  eventLogWallEnabledElement = findElement("#event-log-wall-enabled"),
  eventLogWallTitleElement = findElement("#event-log-wall-title"),
  eventLogWallTitleVisibleElement = findElement("#event-log-wall-title-visible"),
  eventLogWallTitleSizeElement = findElement("#event-log-wall-title-size"),
  eventLogWallTitleColorElement = findElement("#event-log-wall-title-color"),
  eventLogWallTitleAlignElement = findElement("#event-log-wall-title-align"),
  eventLogWallMaxEntriesElement = findElement("#event-log-wall-max-entries"),
  eventLogWallDisplayDurationElement = findElement("#event-log-wall-display-duration"),
  eventLogWallWatchScopeElement = findElement("#event-log-wall-watch-scope"),
  eventLogWallEntityIdsElement = findElement("#event-log-wall-entity-ids"),
  eventLogWallFontSizeElement = findElement("#event-log-wall-font-size"),
  eventLogWallRadiusElement = findElement("#event-log-wall-radius"),
  eventLogWallBgOpacityElement = findElement("#event-log-wall-bg-opacity"),
  eventLogWallBlurElement = findElement("#event-log-wall-blur"),
  eventLogWallClickModeElement = findElement("#event-log-wall-click-mode"),
  eventLogWallShowFooterElement = findElement("#event-log-wall-show-footer"),
  eventLogWallFooterTextElement = findElement("#event-log-wall-footer-text"),
  eventLogWallOnColorElement = findElement("#event-log-wall-on-color"),
  eventLogWallOffColorElement = findElement("#event-log-wall-off-color"),
  eventLogWallAttrColorElement = findElement("#event-log-wall-attr-color"),
  eventLogWallClimateColorElement = findElement("#event-log-wall-climate-color"),
  eventLogWallAlertColorElement = findElement("#event-log-wall-alert-color"),
  eventLogWallMutedColorElement = findElement("#event-log-wall-muted-color"),
  lineChartTypeElement = findElement("#line-chart-type"),
  lineChartLabelElement = findElement("#line-chart-label"),
  lineChartEntityButtonElement = findElement("#line-chart-entity-button"),
  lineChartEntityMenuElement = findElement("#line-chart-entity-menu"),
  lineChartEntitySearchInputElement = findElement("#line-chart-entity-search"),
  lineChartEntityOptionsElement = findElement("#line-chart-entity-options"),
  lineChartValueVisibleElement = findElement("#line-chart-value-visible"),
  lineChartValueScaleInputElement = findElement("#line-chart-value-scale"),
  lineChartValueColorInputElement = findElement("#line-chart-value-color"),
  lineChartStatePrecisionSelectElement = findElement("#line-chart-state-precision"),
  lineChartValueOffsetXInputElement = findElement("#line-chart-value-offset-x"),
  lineChartValueOffsetYInputElement = findElement("#line-chart-value-offset-y"),
  lineChartUpdateIntervalInputElement = findElement("#line-chart-update-interval"),
  lineChartHoursInputElement = findElement("#line-chart-hours"),
  lineChartCurveRadiusInputElement = findElement("#line-chart-curve-radius"),
  lineChartThresholdModeSelectElement = findElement("#line-chart-threshold-mode"),
  lineChartThresholdInputs = [1, 2, 3, 4].map((thresholdIndex) => ({
    value: findElement("#line-chart-threshold-" + thresholdIndex + "-value"),
    color: findElement("#line-chart-threshold-" + thresholdIndex + "-color"),
  })),
  lineChartLeftInputElement = findElement("#line-chart-left"),
  lineChartTopInputElement = findElement("#line-chart-top"),
  lineChartWidthInputElement = findElement("#line-chart-width"),
  lineChartHeightInputElement = findElement("#line-chart-height"),
  lineChartScaleInputElement = findElement("#line-chart-scale"),
  lineChartRotationInputElement = findElement("#line-chart-rotation"),
  lineChartActionControlsElement = findElement("#line-chart-action-controls"),
  lineChartApplyStyleButtonElement = findElement("#line-chart-apply-style"),
  lineChartApplyCountElement = findElement("#line-chart-apply-count"),
  panelFrameInspectorFormElement = findElement("#panel-frame-inspector"),
  panelFrameTypeTextInputElement = findElement("#panel-frame-type"),
  panelFrameLabelTextInputElement = findElement("#panel-frame-label"),
  panelFrameMainVisibleButtonElement = findElement("#panel-frame-main-visible"),
  panelFrameMainTextInputElement = findElement("#panel-frame-main-text"),
  panelFrameMainColorInputElement = findElement("#panel-frame-main-color"),
  panelFrameMainSizeInputElement = findElement("#panel-frame-main-size"),
  panelFrameMainWeightInputElement = findElement("#panel-frame-main-weight"),
  panelFrameMainOpacityInputElement = findElement("#panel-frame-main-opacity"),
  panelFrameMainSpacingInputElement = findElement("#panel-frame-main-spacing"),
  panelFrameMainLeftInputElement = findElement("#panel-frame-main-left"),
  panelFrameMainTopInputElement = findElement("#panel-frame-main-top"),
  panelFrameSecondaryVisibleButtonElement = findElement("#panel-frame-secondary-visible"),
  panelFrameSecondaryTextInputElement = findElement("#panel-frame-secondary-text"),
  panelFrameSecondaryColorInputElement = findElement("#panel-frame-secondary-color"),
  panelFrameSecondarySizeInputElement = findElement("#panel-frame-secondary-size"),
  panelFrameSecondaryWeightInputElement = findElement("#panel-frame-secondary-weight"),
  panelFrameSecondaryOpacityInputElement = findElement("#panel-frame-secondary-opacity"),
  panelFrameSecondarySpacingInputElement = findElement("#panel-frame-secondary-spacing"),
  panelFrameSecondaryLeftInputElement = findElement("#panel-frame-secondary-left"),
  panelFrameSecondaryTopInputElement = findElement("#panel-frame-secondary-top"),
  panelFrameEdgeVisibleButtonElement = findElement("#panel-frame-edge-visible"),
  panelFrameEdgeColorInputElement = findElement("#panel-frame-edge-color"),
  panelFrameEdgeWidthInputElement = findElement("#panel-frame-edge-width"),
  panelFrameEdgeOpacityInputElement = findElement("#panel-frame-edge-opacity"),
  panelFrameRadiusInputElement = findElement("#panel-frame-radius"),
  panelFrameEdgeAngleInputElement = findElement("#panel-frame-edge-angle"),
  panelFrameGlowVisibleButtonElement = findElement("#panel-frame-glow-visible"),
  panelFrameGlowColorInputElement = findElement("#panel-frame-glow-color"),
  panelFrameGlowStrengthInputElement = findElement("#panel-frame-glow-strength"),
  panelFrameGlowSizeInputElement = findElement("#panel-frame-glow-size"),
  panelFrameGlowAngleInputElement = findElement("#panel-frame-glow-angle"),
  panelFrameLeftInputElement = findElement("#panel-frame-left"),
  panelFrameTopInputElement = findElement("#panel-frame-top"),
  panelFrameWidthInputElement = findElement("#panel-frame-width"),
  panelFrameHeightInputElement = findElement("#panel-frame-height"),
  panelFrameScaleInputElement = findElement("#panel-frame-scale"),
  panelFrameRotationInputElement = findElement("#panel-frame-rotation"),
  panelFrameApplyStyleButtonElement = findElement("#panel-frame-apply-style"),
  panelFrameApplyCountElement = findElement("#panel-frame-apply-count"),
  navigationInspectorFormElement = findElement("#navigation-inspector"),
  sceneModeControlElement = findElement("#scene-mode-control"),
  sceneModeHintElement = findElement("#scene-mode-hint"),
  navigationLabelTextInputElement = (navigationPreviewStateElementState: any) =>
    ["navigation-button", "scene-mode"].includes(navigationPreviewStateElementState?.type),
  navigationTypeElement = findElement("#navigation-type"),
  navigationLabelElement = findElement("#navigation-label"),
  navigationPreviewStateElement = findElement("#navigation-preview-state"),
  navigationEntityButtonElement = findElement("#navigation-entity-button"),
  navigationEntityMenuElement = findElement("#navigation-entity-menu"),
  navigationEntitySearchElement = findElement("#navigation-entity-search"),
  navigationEntityOptionsElement = findElement("#navigation-entity-options"),
  navigationMainTextElement = findElement("#navigation-main-text"),
  navigationSecondaryTextElement = findElement("#navigation-secondary-text"),
  navigationMainVisibleElement = findElement("#navigation-main-visible"),
  navigationSecondaryVisibleElement = findElement("#navigation-secondary-visible"),
  navigationIconVisibleElement = findElement("#navigation-icon-visible"),
  navigationFrameVisibleElement = findElement("#navigation-frame-visible"),
  navigationGlowVisibleElement = findElement("#navigation-glow-visible"),
  navigationIconButtonElement = findElement("#navigation-icon-button"),
  navigationIconCopyElement = findElement("#navigation-icon-copy"),
  navigationIconMenuElement = findElement("#navigation-icon-menu"),
  navigationIconSearchElement = findElement("#navigation-icon-search"),
  navigationIconOptionsElement = findElement("#navigation-icon-options"),
  navigationMainColorElement = findElement("#navigation-main-color"),
  navigationSecondaryColorElement = findElement("#navigation-secondary-color"),
  navigationMainSizeElement = findElement("#navigation-main-size"),
  navigationSecondarySizeElement = findElement("#navigation-secondary-size"),
  navigationMainWeightElement = findElement("#navigation-main-weight"),
  navigationSecondaryWeightElement = findElement("#navigation-secondary-weight"),
  navigationMainSpacingElement = findElement("#navigation-main-spacing"),
  navigationSecondarySpacingElement = findElement("#navigation-secondary-spacing"),
  navigationMainTextLeftElement = findElement("#navigation-main-text-left"),
  navigationMainTextTopElement = findElement("#navigation-main-text-top"),
  navigationSecondaryTextLeftElement = findElement("#navigation-secondary-text-left"),
  navigationSecondaryTextTopElement = findElement("#navigation-secondary-text-top"),
  navigationTextIdleOpacityElement = findElement("#navigation-text-idle-opacity"),
  navigationTextActiveOpacityElement = findElement("#navigation-text-active-opacity"),
  navigationIconColorElement = findElement("#navigation-icon-color"),
  navigationIconSizeElement = findElement("#navigation-icon-size"),
  navigationIconLeftElement = findElement("#navigation-icon-left"),
  navigationIconTopElement = findElement("#navigation-icon-top"),
  navigationIconIdleOpacityElement = findElement("#navigation-icon-idle-opacity"),
  navigationIconActiveOpacityElement = findElement("#navigation-icon-active-opacity"),
  navigationFrameColorElement = findElement("#navigation-frame-color"),
  navigationFrameWidthElement = findElement("#navigation-frame-width"),
  navigationFrameIdleOpacityElement = findElement("#navigation-frame-idle-opacity"),
  navigationFrameActiveOpacityElement = findElement("#navigation-frame-active-opacity"),
  navigationFrameAngleElement = findElement("#navigation-frame-angle"),
  navigationGlowColorElement = findElement("#navigation-glow-color"),
  navigationGlowAngleElement = findElement("#navigation-glow-angle"),
  navigationGlowIdleStrengthElement = findElement("#navigation-glow-idle-strength"),
  navigationGlowIdleSizeElement = findElement("#navigation-glow-idle-size"),
  navigationGlowActiveStrengthElement = findElement("#navigation-glow-active-strength"),
  navigationGlowActiveSizeElement = findElement("#navigation-glow-active-size"),
  navigationRadiusElement = findElement("#navigation-radius"),
  navigationLeftElement = findElement("#navigation-left"),
  navigationTopElement = findElement("#navigation-top"),
  navigationWidthElement = findElement("#navigation-width"),
  navigationHeightElement = findElement("#navigation-height"),
  navigationScaleElement = findElement("#navigation-scale"),
  navigationRotationElement = findElement("#navigation-rotation"),
  navigationActionControlsElement = findElement("#navigation-action-controls"),
  navigationApplyStyleElement = findElement("#navigation-apply-style"),
  navigationApplyCountElement = findElement("#navigation-apply-count"),
  navigationStyleApplyDialogElement = findElement("#navigation-style-apply-dialog"),
  navigationStyleApplyCloseElement = findElement("#navigation-style-apply-close"),
  navigationStyleApplyTitleElement = findElement("#navigation-style-apply-title"),
  navigationStyleApplySummaryElement = findElement("#navigation-style-apply-summary"),
  navigationStyleApplyPropertiesElement = findElement("#navigation-style-apply-properties"),
  navigationStyleApplyTargetHeadingElement = findElement("#navigation-style-apply-target-heading"),
  navigationStyleApplyTargetScopeElement = findElement("#navigation-style-apply-target-scope"),
  navigationStyleApplyTargetsElement = findElement("#navigation-style-apply-targets"),
  navigationStyleApplyMessageElement = findElement("#navigation-style-apply-message"),
  navigationStyleApplyCancelElement = findElement("#navigation-style-apply-cancel"),
  navigationStyleApplyConfirmElement = findElement("#navigation-style-apply-confirm"),
  popupNameDialogElement = findElement("#popup-name-dialog"),
  popupNameDialogTitleElement = findElement("#popup-name-dialog-title"),
  popupNameFormElement = findElement("#popup-name-form"),
  popupNameCloseElement = findElement("#popup-name-close"),
  popupNameCancelElement = findElement("#popup-name-cancel"),
  popupModuleDialogElement = findElement("#popup-module-dialog"),
  popupModuleDialogTitleElement = findElement("#popup-module-dialog-title"),
  popupModuleFormElement = findElement("#popup-module-form"),
  popupModuleCloseElement = findElement("#popup-module-close"),
  popupModuleCancelElement = findElement("#popup-module-cancel"),
  popupModuleEntityButtonElement = findElement("#popup-module-entity-button"),
  popupModuleEntityMenuElement = findElement("#popup-module-entity-menu"),
  popupModuleEntitySearchElement = findElement("#popup-module-entity-search"),
  popupModuleEntityOptionsElement = findElement("#popup-module-entity-options"),
  popupModuleClimateDeviceTypeElement = findElement("#popup-module-climate-device-type"),
  deletePopupDialogElement = findElement("#delete-popup-dialog"),
  deletePopupCloseElement = findElement("#delete-popup-close"),
  deletePopupCancelElement = findElement("#delete-popup-cancel"),
  deletePopupConfirmElement = findElement("#delete-popup-confirm"),
  deletePopupNameElement = findElement("#delete-popup-name"),
  deleteAssetDialogElement = findElement("#delete-asset-dialog"),
  deleteAssetCloseButtonElement = findElement("#delete-asset-close"),
  deleteAssetCancelButtonElement = findElement("#delete-asset-cancel"),
  deleteAssetConfirmButtonElement = findElement("#delete-asset-confirm"),
  deleteAssetNameElement = findElement("#delete-asset-name"),
  deleteAssetFolderDialogElement = findElement("#delete-asset-folder-dialog"),
  deleteAssetFolderCloseButtonElement = findElement("#delete-asset-folder-close"),
  deleteAssetFolderCancelButtonElement = findElement("#delete-asset-folder-cancel"),
  deleteAssetFolderConfirmButtonElement = findElement("#delete-asset-folder-confirm"),
  deleteAssetFolderNameElement = findElement("#delete-asset-folder-name"),
  deleteAssetFolderCountElement = findElement("#delete-asset-folder-count");
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
  runVariantExtra,
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
  runExtraFallback,
  runSplit,
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
function syncIconButtonInspector(iconButtonComponent: any) {
  syncIconButtonInspectorExternal(iconButtonInspectorContext, iconButtonComponent);
}
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
  runClone,
  runExtraFallback,
  runVariantTwin,
  sceneModeControlElement,
  sceneModeHintElement,
  get selectedComponentIdsSet() {
    return editorCtx.selectedComponentIdsSet;
  },
  syncComponentActionControls,
};
function syncNavigationInspector(navigationComponent: any) {
  syncNavigationInspectorExternal(navigationInspectorContext, navigationComponent);
}
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
  runAltBackup,
  runExtraFallback,
  get selectedComponentIdsSet() {
    return editorCtx.selectedComponentIdsSet;
  },
  syncComponentActionControls,
};
function syncLineChartInspector(lineChartComponent: any) {
  syncLineChartInspectorExternal(lineChartInspectorContext, lineChartComponent);
}
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
  runAltLeft,
  runExtraFallback,
  get selectedComponentIdsSet() {
    return editorCtx.selectedComponentIdsSet;
  },
  syncComponentActionControls,
};
function syncAirConditionerInspector(airConditionerComponent: any) {
  syncAirConditionerInspectorExternal(airConditionerInspectorContext, airConditionerComponent);
}


/** 认证跳转闩（原 `let authRedirectStarted`）：每实例一份，交给 `net/request-json` 读写。 */
const authRedirectState = { started: false };
const requestJsonDeps = () => ({ authRedirectState });
/**
 * 请求封装（P4 搬进 `net/request-json`）：超时 / 中止 / CSRF / 401-403 跳转。
 * 本身是 `async`，薄绑定只返回 Promise（不写 `async`，免得撞 `require-await`）。
 */
function requestJson(requestPath: any, requestOptions: Record<string, any> = {}) {
  return requestJsonCore(requestJsonDeps(), requestPath, requestOptions);
}

/** 数字步进器去重集合（P4 搬进 `controls/number-stepper`，按引用注入）。 */
const numberStepperDeps = () => ({ enhancedNumberInputsSet });
/**
 * 检查器数字输入增强（P4 搬进 `controls/number-stepper`）：**保留原签名** —— 本函数在 6xxx 行
 * 被当作裸函数值交给外部 ctx（`formatLastSeen,`），多一个 `deps` 首参会把调用方的实参顶掉。
 */
function formatLastSeen(lastSeenTimestamp: Document | HTMLElement = document) {
  return formatLastSeenCore(numberStepperDeps(), lastSeenTimestamp);
}
function setSettingsMessage(messageElement: any, messageText: any, toneClass = "") {
  ((messageElement.hidden = !messageText),
    (messageElement.textContent = messageText),
    (messageElement.className = ("settings-message " + toneClass).trim()));
}
function handleOperationError(operationError: any) {
  (window.HomeOSLog?.error!(operationError, {
    projectId: editorCtx.activeProject?.projectId || "",
    componentId: editorCtx.selectedComponentId || "",
    phase: "editor-operation",
  }),
    (errorDialogMessageElement.textContent = operationError?.message || "操作失败。"),
    errorDialogCloseButtonElement.open || errorDialogCloseButtonElement.showModal());
}
function errorPhase() {
  ((projectActionsMenuElement.hidden = true),
    projectActionsButtonElement.setAttribute("aria-expanded", "false"));
}
function value() {
  ((pageActionsMenuElement.hidden = true),
    pageActionsButtonElement.setAttribute("aria-expanded", "false"));
}
function run() {
  ((popupActionsMenuElement.hidden = true),
    popupActionsButtonElement.setAttribute("aria-expanded", "false"),
    (editorCtx.moduleDialogPopupId = null));
}
function runState(runValue = editorCtx.openCustomSelect) {
  runValue &&
    ((runValue.menu.hidden = true),
    runValue.button.setAttribute("aria-expanded", "false"),
    editorCtx.openCustomSelect === runValue && (editorCtx.openCustomSelect = null));
}
function runConfig(runRef: any) {
  if (runRef.menu.hidden) return;
  const boundingClientRect = runRef.button.getBoundingClientRect(),
    hoverScrollStateByRow = Math.max(80, Math.min(320, window.innerHeight - 16));
  ((runRef.menu.style.width = boundingClientRect.width + "px"),
    (runRef.menu.style.maxHeight = hoverScrollStateByRow + "px"));
  const iconVisibilityVirtualEntities = Math.min(runRef.menu.scrollHeight, hoverScrollStateByRow),
    loadIconButtonEffectIconOptions = Math.max(
      8,
      Math.min(window.innerWidth - boundingClientRect.width - 8, boundingClientRect.left),
    ),
    loadIconButtonIconOptions = boundingClientRect.bottom + 4,
    loadLightStatisticsIconOptions =
      loadIconButtonIconOptions + iconVisibilityVirtualEntities <= window.innerHeight - 8
        ? loadIconButtonIconOptions
        : Math.max(8, boundingClientRect.top - iconVisibilityVirtualEntities - 4);
  ((runRef.menu.style.left = loadIconButtonEffectIconOptions + "px"),
    (runRef.menu.style.top = loadLightStatisticsIconOptions + "px"));
}
function selectableEntities(setLightStatisticsMessage: Document | HTMLElement = document) {
  (setLightStatisticsMessage instanceof HTMLSelectElement &&
    positionTitleButtonIconMenu(setLightStatisticsMessage),
    setLightStatisticsMessage
      .querySelectorAll?.("select")
      .forEach((setPickerButtonLabel) => positionTitleButtonIconMenu(setPickerButtonLabel)));
}
function openEntityPicker(openIconPicker: any, openLightStatisticsEntityPicker = false) {
  const closeColorPicker = normalizedHexColor2(openIconPicker);
  if (!closeColorPicker || !editorCtx.activeColorInputElement) return;
  const commitColorPickerFromRgb = hexToRgb2(closeColorPicker),
    commitColorPickerHsv = rgbToHsv2(commitColorPickerFromRgb);
  ((editorCtx.colorPickerHue = commitColorPickerHsv.s > 0 ? commitColorPickerHsv.h : editorCtx.colorPickerHue),
    (editorCtx.colorPickerSaturation = commitColorPickerHsv.s),
    (editorCtx.colorPickerBrightness = commitColorPickerHsv.v),
    globalColorPickerElement.style.setProperty(
      "--picker-hue",
      "hsl(" + editorCtx.colorPickerHue + " 100% 50%)",
    ),
    globalColorPickerElement.style.setProperty("--picker-color", closeColorPicker),
    (globalColorPickerMarkerElement.style.left = editorCtx.colorPickerSaturation * 100 + "%"),
    (globalColorPickerMarkerElement.style.top = (1 - editorCtx.colorPickerBrightness) * 100 + "%"),
    (globalColorPickerHueRangeInputElement.value = String(Math.round(editorCtx.colorPickerHue))),
    document.activeElement !== globalColorPickerHexTextInputElement &&
      (globalColorPickerHexTextInputElement.value = closeColorPicker.toUpperCase()),
    (globalColorPickerRedInputElement.value = String(Math.round(commitColorPickerFromRgb.r))),
    (globalColorPickerGreenInputElement.value = String(Math.round(commitColorPickerFromRgb.g))),
    (globalColorPickerBlueInputElement.value = String(Math.round(commitColorPickerFromRgb.b))),
    (globalColorPickerSwatchElement.style.background = closeColorPicker),
    editorCtx.activeColorInputElement.value !== closeColorPicker &&
      ((editorCtx.activeColorInputElement.value = closeColorPicker),
      openLightStatisticsEntityPicker &&
        editorCtx.activeColorInputElement.dispatchEvent(
          new Event("input", {
            bubbles: true,
          }),
        )));
}
function closeAllDropdownMenus() {
  const enhanceColorInputsIn = hsvToRgb2(
    editorCtx.colorPickerHue,
    editorCtx.colorPickerSaturation,
    editorCtx.colorPickerBrightness,
  );
  openEntityPicker(
    rgbToHex2(enhanceColorInputsIn.r, enhanceColorInputsIn.g, enhanceColorInputsIn.b),
    true,
  );
}
function closeDropdownMenu() {
  if (globalColorPickerElement.hidden || !editorCtx.activeColorInputElement) return;
  const positionColorPicker = editorCtx.activeColorInputElement.getBoundingClientRect(),
    syncColorPickerFromHex = globalColorPickerElement.getBoundingClientRect(),
    num = 9,
    closeProjectActionsState = 8,
    enhanceNativeSelectsIn = positionColorPicker.left - syncColorPickerFromHex.width - num,
    enhanceNumberInputsIn =
      enhanceNativeSelectsIn >= closeProjectActionsState
        ? enhanceNativeSelectsIn
        : Math.min(
            window.innerWidth - syncColorPickerFromHex.width - closeProjectActionsState,
            positionColorPicker.right + num,
          ),
    syncOpenColorPicker = clampNumber2(
      positionColorPicker.top,
      closeProjectActionsState,
      Math.max(
        closeProjectActionsState,
        window.innerHeight - syncColorPickerFromHex.height - closeProjectActionsState,
      ),
    );
  ((globalColorPickerElement.style.left =
    Math.max(closeProjectActionsState, enhanceNumberInputsIn) + "px"),
    (globalColorPickerElement.style.top = syncOpenColorPicker + "px"));
}
function runEntry(commitColorPickerFromRgbElement: any) {
  if (!commitColorPickerFromRgbElement || commitColorPickerFromRgbElement.disabled) return;
  (editorCtx.activeColorInputElement &&
    editorCtx.activeColorInputElement !== commitColorPickerFromRgbElement &&
    setWorkspaceHasProject(),
    (editorCtx.activeColorInputElement = commitColorPickerFromRgbElement),
    (editorCtx.activeColorHex = normalizedHexColor2(commitColorPickerFromRgbElement.value) || "#000000"));
  const updateColorPickerFromPointer = rgbToHsv2(hexToRgb2(editorCtx.activeColorHex));
  ((editorCtx.colorPickerHue = updateColorPickerFromPointer.h),
    (editorCtx.colorPickerSaturation = updateColorPickerFromPointer.s),
    (editorCtx.colorPickerBrightness = updateColorPickerFromPointer.v),
    (globalColorPickerElement.hidden = false),
    openEntityPicker(editorCtx.activeColorHex),
    window.requestAnimationFrame(closeDropdownMenu));
}
function setWorkspaceHasProject() {
  if (!editorCtx.activeColorInputElement) return;
  const he2 = editorCtx.activeColorInputElement,
    isPositionColorPicker = normalizedHexColor2(he2.value) !== editorCtx.activeColorHex;
  ((globalColorPickerElement.hidden = true),
    (editorCtx.activeColorInputElement = null),
    (editorCtx.colorPickerDragPointerId = null),
    isPositionColorPicker &&
      he2.dispatchEvent(
        new Event("change", {
          bubbles: true,
        }),
      ),
    coverKindDraftDocument(he2));
}
function hasActiveProject() {
  !globalColorPickerElement.hidden &&
    editorCtx.activeColorInputElement?.isConnected &&
    openEntityPicker(editorCtx.activeColorInputElement.value);
}
function destroyDashboardPreview(renderDashboardPreview: Document | HTMLElement = document) {
  (renderDashboardPreview instanceof HTMLInputElement && renderDashboardPreview.type === "color"
    ? [renderDashboardPreview]
    : [...(renderDashboardPreview.querySelectorAll?.<HTMLElement>('input[type="color"]') || [])]
  ).forEach((previewPagePath) => {
    colorPickerBoundInputById.has(previewPagePath) ||
      (colorPickerBoundInputById.set(previewPagePath, true),
      (previewPagePath.title = "打开颜色选择器"),
      previewPagePath.addEventListener("pointerdown", (changedPagePath) => {
        (changedPagePath.preventDefault(), runEntry(previewPagePath));
      }),
      previewPagePath.addEventListener("click", (renderDashboardDisplayLink) =>
        renderDashboardDisplayLink.preventDefault(),
      ),
      previewPagePath.addEventListener("keydown", (renderDashboardPreviewState) => {
        ["Enter", " "].includes(renderDashboardPreviewState.key) &&
          (renderDashboardPreviewState.preventDefault(), runEntry(previewPagePath));
      }));
  });
}
function runKey(runPath: any) {
  (displayDeviceCountElement.classList.toggle("empty", !runPath),
    editorCanvasElement.classList.toggle("workspace-empty-state", !runPath),
    editorCanvasElement.classList.toggle("canvas-placeholder", runPath),
    (projectActionsButtonElement.disabled = !runPath),
    (pageNewElement.disabled = !runPath),
    (popupNewElement.disabled = !runPath),
    runPath ||
      (editorCanvasElement.removeAttribute("style"),
      (editorCanvasElement.innerHTML =
        '<div class="canvas-message"><strong>请从左侧新建仪表盘。</strong></div>'),
      errorPhase(),
      value()),
    renderWorkspaceResolution(),
    unbindDisplayDeviceError(),
    refreshSoundToggle());
}
function runSlot() {
  (editorCtx.dashboardPreviewRenderer?.destroy(), (editorCtx.dashboardPreviewRenderer = null));
}
function runCase(displayDeviceUnbindButtonElement = pageSelectElement.value) {
  if (editorCtx.editorMode !== "dashboard") {
    runSlot();
    return;
  }
  if (!editorCtx.activeProject?.document?.pages?.length) {
    (runSlot(),
      (dashboardPreviewElement.innerHTML =
        '<div class="canvas-message"><strong>' +
        (editorCtx.activeProject ? "请从左侧新建页面。" : "请从左侧新建仪表盘。") +
        "</strong></div>"));
    return;
  }
  (editorCtx.dashboardPreviewRenderer ||
    ((editorCtx.dashboardPreviewRenderer = new PanelRenderer2(dashboardPreviewElement, {
      editable: false,
      editorWorkspace: true,
      historySeriesCache: historySeriesCacheById,
      runtimeStateCache: runtimeStateCacheById,
      virtualEntityStateCache: virtualEntityStateCacheById,
      onError: handleOperationError,
      onRuntimeButtonPress() {
        buttonSoundController.play();
      },
      onPageChange(confirmedUnbind: any) {
        ((pageSelectElement.value = confirmedUnbind.path),
          loadNavigationIconOptions(pageSelectElement));
      },
    })),
    editorCtx.dashboardPreviewRenderer.setEntityCatalog(editorCtx.entities, editorCtx.entityResourcesByDeviceId, editorCtx.devices)),
    editorCtx.dashboardPreviewRenderer.setDocument(editorCtx.activeProject.document, displayDeviceUnbindButtonElement));
}
function unbindDisplayDeviceError() {
  const trim = String(editorCtx.activeProject?.document?.name || "").trim(),
    openDisplayDevicesDialogState = editorCtx.editorMode === "dashboard" && !!trim;
  if (
    ((dashboardDisplayHintElement.hidden = !openDisplayDevicesDialogState),
    !openDisplayDevicesDialogState)
  ) {
    (dashboardDisplayLinkElement.removeAttribute("href"),
      (dashboardDisplayLinkElement.textContent = ""));
    return;
  }
  // 用仪表盘名称寻址（/homeos/{name}）：地址简洁、可手抄/做书签；后端 named_display_page 与
  // /display/{project_id} 同一套鉴权。projectId 形态留给展示页内部按主键定位。
  const uRL = new URL("/homeos/" + encodeURIComponent(trim), window.location.origin);
  ((dashboardDisplayLinkElement.href = uRL.href),
    (dashboardDisplayLinkElement.textContent = decodeURI(uRL.href)),
    (dashboardDisplayLinkElement.title = uRL.href));
}
function renderWorkspaceResolution() {
  const documentCanvas = editorCtx.activeProject?.document?.canvas,
    canvasWidthValue = Number(documentCanvas?.width),
    canvasHeightValue = Number(documentCanvas?.height),
    finite =
      editorCtx.editorMode !== "popup" &&
      Number.isFinite(canvasWidthValue) &&
      canvasWidthValue > 0 &&
      Number.isFinite(canvasHeightValue) &&
      canvasHeightValue > 0;
  ((workspaceResolutionElement.hidden = !finite),
    (workspaceResolutionElement.textContent = finite
      ? Math.round(canvasWidthValue) + " × " + Math.round(canvasHeightValue)
      : ""));
}
function setEditorMode(editorModeValue: any) {
  editorCtx.editorMode = ["edit", "dashboard", "popup"].includes(editorModeValue) ? editorModeValue : "edit";
  const isEditingPage = editorCtx.editorMode === "edit",
    isDashboardMode = editorCtx.editorMode === "dashboard",
    isPopupMode = editorCtx.editorMode === "popup";
  ((showPopupEditorButtonElement.hidden = isPopupMode),
    (pageNewButtonElement.hidden = !isPopupMode),
    navigatorContentElement.classList.toggle("popup-mode", isPopupMode),
    showPageEditorElement.classList.toggle("active", !isPopupMode),
    showPageEditorElement.setAttribute("aria-selected", String(!isPopupMode)),
    showPopupEditorElement.classList.toggle("active", isPopupMode),
    showPopupEditorElement.setAttribute("aria-selected", String(isPopupMode)),
    isEditingPage || resetPreviewStates(),
    (editorCanvasElement.hidden = !isEditingPage),
    (dashboardPreviewElement.hidden = !isDashboardMode),
    (customPopupEditorElement.hidden = !isPopupMode),
    displayDeviceCountElement.classList.toggle("empty", !editorCtx.activeProject),
    (workspaceTitleElement.textContent = isDashboardMode
      ? "仪表盘"
      : isPopupMode
        ? "组合弹窗"
        : "页面画布"),
    renderWorkspaceResolution(),
    unbindDisplayDeviceError(),
    refreshSoundToggle());
  for (const [modeToggleButton, modeToggleActive] of [
    [showEditorPreviewButtonElement, isEditingPage],
    [showDashboardPreviewButtonElement, isDashboardMode],
  ])
    (modeToggleButton.classList.toggle("active", modeToggleActive),
      modeToggleButton.setAttribute("aria-selected", String(modeToggleActive)));
  isEditingPage
    ? (runSlot(),
      editorCtx.activeProject?.document?.pages?.length &&
        (ensureEditorRenderer().setDocument(editorCtx.activeProject.document, pageSelectElement.value),
        editorCtx.editorRenderer.setSelectedComponents([...editorCtx.selectedComponentIdsSet], editorCtx.selectedComponentId)),
      window.requestAnimationFrame(resizeWorkspaceCanvas))
    : isDashboardMode
      ? (editorCtx.editorRenderer?.destroy(),
        (editorCtx.editorRenderer = null),
        runCase(),
        window.requestAnimationFrame(() => editorCtx.dashboardPreviewRenderer?.resize()))
      : isPopupMode &&
        (clearComponentSelection(),
        renderComponentLists(),
        coverMotorButtonElement(),
        editorCtx.editorRenderer?.destroy(),
        (editorCtx.editorRenderer = null),
        runSlot(),
        renderCustomPopupEditor());
}
function syncDefaultPageAction(hasPages = !!editorCtx.activeProject?.document?.pages?.length) {
  if (defaultPageActionElement) {
    const ct2 = currentPage(),
      isCurrentDefaultPage = !!(ct2 && editorCtx.activeProject?.document?.defaultPagePath === ct2.path);
    ((defaultPageActionElement.textContent = isCurrentDefaultPage
      ? "已是默认首屏"
      : "设为默认首屏"),
      (defaultPageActionElement.disabled = !hasPages || isCurrentDefaultPage));
  }
}
function setPageControlsEnabled(controlsEnabled: any) {
  ((pageSelectElement.disabled = !controlsEnabled),
    (pageActionsButtonElement.disabled = !controlsEnabled),
    syncDefaultPageAction(controlsEnabled),
    syncAddComponentButton(),
    loadNavigationIconOptions(pageSelectElement),
    controlsEnabled || value());
}
function resizeWorkspaceCanvas() {
  if (!editorCtx.activeProject) return;
  const computedStyle = window.getComputedStyle(displayDeviceCountElement),
    availableWidthPx =
      displayDeviceCountElement.clientWidth -
      Number.parseFloat(computedStyle.paddingLeft) -
      Number.parseFloat(computedStyle.paddingRight),
    availableHeightPx =
      displayDeviceCountElement.clientHeight -
      Number.parseFloat(computedStyle.paddingTop) -
      Number.parseFloat(computedStyle.paddingBottom),
    canvasWidthPx = editorCtx.activeProject.document.canvas.width || 2778,
    canvasHeightPx = editorCtx.activeProject.document.canvas.height || 1940,
    canvasAspectRatio = canvasWidthPx / canvasHeightPx,
    isHeightLimited = availableWidthPx / availableHeightPx > canvasAspectRatio,
    renderWidthPx = isHeightLimited ? availableHeightPx * canvasAspectRatio : availableWidthPx,
    renderHeightPx = isHeightLimited ? availableHeightPx : availableWidthPx / canvasAspectRatio;
  ((editorCanvasElement.style.width = Math.max(1, renderWidthPx) + "px"),
    (editorCanvasElement.style.height = Math.max(1, renderHeightPx) + "px"),
    (dashboardPreviewElement.style.width = Math.max(1, renderWidthPx) + "px"),
    (dashboardPreviewElement.style.height = Math.max(1, renderHeightPx) + "px"),
    window.requestAnimationFrame(() => {
      (editorCtx.editorRenderer?.resize(), editorCtx.dashboardPreviewRenderer?.resize());
    }));
}
const workspaceResizeObserver = new ResizeObserver(() => {
  (resizeWorkspaceCanvas(), syncCustomPopupStage(), editorCtx.dashboardPreviewRenderer?.resize());
});
workspaceResizeObserver.observe(displayDeviceCountElement);

/** 空白画布框选 */
function ensureMarqueeOverlay() {
  let overlay = editorCanvasElement.querySelector(".sc-marquee") as HTMLDivElement | null;
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "sc-marquee";
    overlay.hidden = true;
    editorCanvasElement.appendChild(overlay);
  }
  return overlay;
}
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
function currentPage() {
  return (
    editorCtx.activeProject?.document?.pages?.find(
      (pageEntryCandidate: any) => pageEntryCandidate.path === pageSelectElement.value,
    ) ||
    editorCtx.activeProject?.document?.pages?.[0] ||
    null
  );
}
function groupSelectedComponents(requestedComponentIds: any) {
  const groupedComponentIds = [...new Set(requestedComponentIds || [])];
  if (!canGroupComponents2(groupedComponentIds, editorCtx.activeProject?.document)) {
    handleOperationError(new Error("请选择同一页面或同一侧边栏中的两个或更多控件后再成组。"));
    return;
  }
  const newGroupId = newId2("group");
  return (
    (editorCtx.selectedComponentId = newGroupId),
    (editorCtx.selectedComponentIdsSet = new Set([newGroupId])),
    (editorCtx.selectionAnchorComponentId = newGroupId),
    (editorCtx.activeGroupId = null),
    mutateDocument((groupDocument: any) => {
      const groupComponentLocations = groupedComponentIds.map((groupIdItem) =>
        componentDirectLocation2(groupDocument, groupIdItem),
      );
      if (groupComponentLocations.some((resolvedLocation) => !resolvedLocation)) return;
      const collection = groupComponentLocations[0].collection,
        sort = groupComponentLocations
          .map((componentLocationItem) => componentLocationItem.component)
          .sort(
            (componentA, componentB) =>
              collection.indexOf(componentA) - collection.indexOf(componentB),
          ),
        memberBounds = sort.map((boundsMemberComponent) => componentBounds2(boundsMemberComponent)),
        groupMinLeft = Math.min(...memberBounds.map((minLeftBounds) => minLeftBounds.left)),
        groupMinTop = Math.min(...memberBounds.map((minTopBounds) => minTopBounds.top)),
        groupMaxRight = Math.max(...memberBounds.map((maxRightBounds) => maxRightBounds.right)),
        groupMaxBottom = Math.max(...memberBounds.map((maxBottomBounds) => maxBottomBounds.bottom)),
        groupInsertIndex = Math.min(
          ...sort.map((insertMemberComponent) => collection.indexOf(insertMemberComponent)),
        ),
        groupChildComponents = sort.map((childSourceComponent) => ({
          ...childSourceComponent,
          position: {
            ...(childSourceComponent.position || {}),
            x: Number(childSourceComponent.position?.x || 0) - groupMinLeft,
            y: Number(childSourceComponent.position?.y || 0) - groupMinTop,
          },
        })),
        groupComponent = {
          id: newGroupId,
          type: "group",
          componentVersion: 1,
          position: {
            x: groupMinLeft,
            y: groupMinTop,
            width: Math.max(1, groupMaxRight - groupMinLeft),
            height: Math.max(1, groupMaxBottom - groupMinTop),
            rotation: 0,
            zIndex: 1,
          },
          properties: {
            label: groupNameForCollection2(collection),
          },
          bindings: {} as Record<string, any>,
          actions: {} as Record<string, any>,
          style: {} as Record<string, any>,
          children: groupChildComponents,
        },
        set = new Set(groupedComponentIds),
        filter = collection.filter((collectionComponent: any) => !set.has(collectionComponent.id));
      if (
        (filter.splice(Math.min(groupInsertIndex, filter.length), 0, groupComponent),
        collection.splice(0, collection.length, ...filter),
        applyCollectionLayerOrder2(collection),
        groupComponentLocations[0].scope === "shared")
      ) {
        for (const sharedSyncPageEntry of groupDocument.pages || []) {
          const pageSharedIds = sharedSyncPageEntry.sharedComponentIds || [],
            matchedSharedIndexes = pageSharedIds
              .map((sharedIdEntry: any, sharedIdIndex: any) => (set.has(sharedIdEntry) ? sharedIdIndex : -1))
              .filter((sharedIndex: any) => sharedIndex >= 0);
          if (!matchedSharedIndexes.length) continue;
          const firstSharedIndex = Math.min(...matchedSharedIndexes),
            remainingSharedIds = pageSharedIds.filter(
              (remainingSharedIdEntry: any) => !set.has(remainingSharedIdEntry),
            );
          (remainingSharedIds.splice(
            Math.min(firstSharedIndex, remainingSharedIds.length),
            0,
            newGroupId,
          ),
            (sharedSyncPageEntry.sharedComponentIds = [...new Set(remainingSharedIds)]));
        }
        syncSharedComponentReferenceOrder2(groupDocument);
      }
    })
  );
}
function ungroupComponent(groupIdToUngroup: any) {
  const groupLocationEntry = findComponentLocation2(editorCtx.activeProject?.document, groupIdToUngroup);
  if (!groupLocationEntry || groupLocationEntry.component.type !== "group") return;
  const groupChildIds = (groupLocationEntry.component.children || []).map(
    (groupChildComponent: any) => groupChildComponent.id,
  );
  ((editorCtx.selectedComponentId = groupChildIds[0] || null),
    (editorCtx.selectedComponentIdsSet = new Set(groupChildIds)),
    (editorCtx.selectionAnchorComponentId = editorCtx.selectedComponentId),
    (editorCtx.activeGroupId = null),
    mutateDocument((ungroupDocument: any) => {
      const ungroupLocation = findComponentLocation2(ungroupDocument, groupIdToUngroup);
      if (!ungroupLocation || ungroupLocation.component.type !== "group") return;
      const groupPosition = ungroupLocation.component.position || {},
        groupStyle = ungroupLocation.component.style || {},
        groupRotationDeg = Number(groupPosition.rotation || 0),
        groupScale = Math.max(0.01, Math.min(5, Number(groupStyle.scale || 1))),
        groupRotationRad = (groupRotationDeg * Math.PI) / 180,
        cos = Math.cos(groupRotationRad),
        sin = Math.sin(groupRotationRad),
        groupWidthPx = Number(groupPosition.width || 100),
        groupHeightPx = Number(groupPosition.height || 100),
        groupCenterX = Number(groupPosition.x || 0) + groupWidthPx / 2,
        groupCenterY = Number(groupPosition.y || 0) + groupHeightPx / 2,
        ungroupedChildren = (ungroupLocation.component.children || []).map(
          (ungroupChildComponent: any) => {
            const childPosition = ungroupChildComponent.position || {},
              childWidthPx = Number(childPosition.width || 100),
              childHeightPx = Number(childPosition.height || 100),
              childOffsetX = Number(childPosition.x || 0) + childWidthPx / 2 - groupWidthPx / 2,
              childOffsetY = Number(childPosition.y || 0) + childHeightPx / 2 - groupHeightPx / 2,
              childScaledOffsetX = childOffsetX * groupScale,
              childScaledOffsetY = childOffsetY * groupScale,
              childRotatedX = groupCenterX + childScaledOffsetX * cos - childScaledOffsetY * sin,
              childRotatedY = groupCenterY + childScaledOffsetX * sin + childScaledOffsetY * cos,
              childStyle = {
                ...(ungroupChildComponent.style || {}),
              },
              childNextScale = Math.max(
                0.01,
                Math.min(5, Number(childStyle.scale || 1) * groupScale),
              );
            return (
              groupStyle.visible === false && (childStyle.visible = false),
              (childStyle.scale = childNextScale),
              {
                ...ungroupChildComponent,
                position: {
                  ...childPosition,
                  x: childRotatedX - childWidthPx / 2,
                  y: childRotatedY - childHeightPx / 2,
                  rotation: Number(childPosition.rotation || 0) + groupRotationDeg,
                },
                style: childStyle,
              }
            );
          },
        );
      if (
        (ungroupLocation.collection.splice(ungroupLocation.index, 1, ...ungroupedChildren),
        applyCollectionLayerOrder2(ungroupLocation.collection),
        ungroupLocation.scope === "shared" && ungroupLocation.root)
      ) {
        for (const ungroupPageEntry of ungroupDocument.pages || []) {
          const ungroupPageSharedIds = ungroupPageEntry.sharedComponentIds || [],
            indexOf2 = ungroupPageSharedIds.indexOf(groupIdToUngroup);
          indexOf2 < 0 ||
            (ungroupPageSharedIds.splice(
              indexOf2,
              1,
              ...ungroupedChildren.map((ungroupedChild: any) => ungroupedChild.id),
            ),
            (ungroupPageEntry.sharedComponentIds = [...new Set(ungroupPageSharedIds)]));
        }
        syncSharedComponentReferenceOrder2(ungroupDocument);
      }
    }));
}
function openGroupRenameDialog(renameGroupId: any) {
  const groupComponentForRename = findComponent2(editorCtx.activeProject?.document, renameGroupId)?.component;
  !groupComponentForRename ||
    groupComponentForRename.type !== "group" ||
    ((componentGroupRenameDialogElement.dataset.groupId = renameGroupId),
    (componentGroupRenameInputElement.value = componentLabel2(groupComponentForRename)),
    setSettingsMessage(componentGroupRenameMessageElement, ""),
    componentGroupRenameDialogElement.showModal(),
    window.setTimeout(() => componentGroupRenameInputElement.focus(), 0));
}
function runStore(runCache: any) {
  const lowerCase = String(runCache || "")
    .trim()
    .toLowerCase();
  return /^#[\da-f]{6}$/.test(lowerCase) ? lowerCase : "";
}
function removedComponent() {
  return findComponent2(editorCtx.activeProject?.document, editorCtx.selectedComponentId)?.component || null;
}
function removalPageEntry(remainingSharedId: any) {
  return [...new Set(remainingSharedId || [])].filter(
    (selectedComponent) => !!findComponent2(editorCtx.activeProject?.document, selectedComponent)?.component,
  );
}
function componentListForScope(groupListScope: any) {
  if (editorCtx.activeGroupId) {
    const groupScopeComponent = findComponent2(editorCtx.activeProject?.document, editorCtx.activeGroupId)?.component;
    if (groupScopeComponent?.type === "group") return groupScopeComponent.children || [];
  }
  return groupListScope === "shared"
    ? editorCtx.activeProject?.document?.sharedComponents || []
    : currentPage()?.components || [];
}
function collectComponentsByType(componentTreeNode: any, componentTypeFilter: any, collectedComponents: any[] = []) {
  for (const treeComponent of componentTreeNode || [])
    (treeComponent?.type === componentTypeFilter && collectedComponents.push(treeComponent),
      collectComponentsByType(treeComponent?.children, componentTypeFilter, collectedComponents));
  return collectedComponents;
}
function findPageComponentsByType(typeFilter: any) {
  return (editorCtx.activeProject?.document?.pages || []).flatMap((typeMatchPage: any) =>
    collectComponentsByType(typeMatchPage.components, typeFilter).map((matchedComponent) => ({
      component: matchedComponent,
      page: typeMatchPage,
    })),
  );
}
function findReplaceableComponents(sourceComponent: any) {
  if (!sourceComponent) return [];
  const rr2 = runAuxBackup(sourceComponent);
  return [
    ...collectComponentsByType(editorCtx.activeProject?.document?.sharedComponents, sourceComponent.type).map(
      (sharedComponent) => ({
        component: sharedComponent,
        scope: "shared",
      }),
    ),
    ...findPageComponentsByType(sourceComponent.type).map((pageMatch: any) => ({
      ...pageMatch,
      scope: "page",
    })),
  ].filter(
    ({ component: filterMatch }) =>
      filterMatch.id !== sourceComponent.id &&
      (sourceComponent.type !== "presence-sensor" || runAuxBackup(filterMatch) === rr2),
  );
}
function syncRendererSelection() {
  (editorCtx.editorRenderer?.setActiveGroup(editorCtx.activeGroupId),
    editorCtx.editorRenderer?.setSelectedComponents([...editorCtx.selectedComponentIdsSet], editorCtx.selectedComponentId));
}
function clearComponentSelection() {
  (resetPreviewStates(),
    (editorCtx.selectedComponentId = null),
    (editorCtx.selectedComponentIdsSet = new Set()),
    (editorCtx.selectionAnchorComponentId = null));
}
function resetPreviewStates() {
  for (const previewStateMap of [
    navigationPreviewStateByComponentId,
    iconButtonEffectPreviewStateByComponentId,
    iconButtonPreviewStateByComponentId,
    airConditionerPreviewStateByComponentId,
  ]) {
    for (const previewStateComponentId of previewStateMap.keys())
      editorCtx.editorRenderer?.setComponentPreviewState(previewStateComponentId, "auto");
    previewStateMap.clear();
  }
}
function selectComponent(
  clickedComponentId: any,
  {
    toggle: toggleSelection = false,
    range: rangeSelection = false,
    preserveGroup: preserveGroupSelection = false,
  } = {},
) {
  const clickedLocation = findComponent2(editorCtx.activeProject?.document, clickedComponentId);
  if (!clickedLocation) {
    (clearComponentSelection(),
      syncRendererSelection(),
      renderComponentLists(),
      coverMotorButtonElement());
    return;
  }
  const anchorComponentLocation = findComponent2(editorCtx.activeProject?.document, editorCtx.selectedComponentId),
    isSameComponentScope =
      anchorComponentLocation?.scope === clickedLocation.scope &&
      (clickedLocation.scope !== "page" ||
        anchorComponentLocation.page?.path === clickedLocation.page?.path);
  if (preserveGroupSelection && editorCtx.selectedComponentIdsSet.has(clickedComponentId))
    editorCtx.selectedComponentId = clickedComponentId;
  else {
    if (rangeSelection && isSameComponentScope && editorCtx.selectionAnchorComponentId) {
      const bE2 = componentListForScope(clickedLocation.scope),
        index = bE2.findIndex(
          (anchorListComponent: any) => anchorListComponent.id === editorCtx.selectionAnchorComponentId,
        ),
        clickedIndexInList = bE2.findIndex(
          (clickedListComponent: any) => clickedListComponent.id === clickedComponentId,
        );
      if (index >= 0 && clickedIndexInList >= 0) {
        const [rangeStartIndex, rangeEndIndex] =
          index <= clickedIndexInList ? [index, clickedIndexInList] : [clickedIndexInList, index];
        ((editorCtx.selectedComponentIdsSet = new Set(
          bE2
            .slice(rangeStartIndex, rangeEndIndex + 1)
            .map((rangedComponent: any) => rangedComponent.id),
        )),
          (editorCtx.selectedComponentId = clickedComponentId));
      } else
        ((editorCtx.selectedComponentIdsSet = new Set([clickedComponentId])),
          (editorCtx.selectedComponentId = clickedComponentId),
          (editorCtx.selectionAnchorComponentId = clickedComponentId));
    } else {
      if (toggleSelection && isSameComponentScope) {
        const toggledSelectionSet = new Set(editorCtx.selectedComponentIdsSet);
        (toggledSelectionSet.has(clickedComponentId)
          ? toggledSelectionSet.delete(clickedComponentId)
          : toggledSelectionSet.add(clickedComponentId),
          (editorCtx.selectedComponentIdsSet = toggledSelectionSet),
          (editorCtx.selectedComponentId = toggledSelectionSet.has(clickedComponentId)
            ? clickedComponentId
            : toggledSelectionSet.values().next().value || null),
          (editorCtx.selectionAnchorComponentId = clickedComponentId));
      } else
        !toggleSelection &&
        !rangeSelection &&
        editorCtx.selectedComponentIdsSet.size === 1 &&
        editorCtx.selectedComponentIdsSet.has(clickedComponentId)
          ? clearComponentSelection()
          : ((editorCtx.selectedComponentIdsSet = new Set([clickedComponentId])),
            (editorCtx.selectedComponentId = clickedComponentId),
            (editorCtx.selectionAnchorComponentId = clickedComponentId));
    }
  }
  if (clickedLocation.scope === "shared" && currentPage()?.path) {
    const pendingDocument = clone2(editorCtx.activeProject.document);
    ensureSharedComponentReference2(pendingDocument, clickedComponentId, currentPage().path) &&
      projectSummary(pendingDocument, currentPage().path).catch(handleOperationError);
  }
  (editorCtx.selectedComponentId && setComponentScope(clickedLocation.scope),
    syncRendererSelection(),
    renderComponentLists(),
    coverMotorButtonElement());
}
function mutateDocument(
  documentMutator: any,
  writePagePath = pageSelectElement.value,
  { throwOnError: throwOnWriteError = false } = {},
) {
  const throwOnWriteErrorState = editorCtx.activeProject?.projectId,
    Ie2 = editorCtx.componentScopeState,
    queuedWriteHandler = () =>
      editorCtx.componentScopeState === Ie2 && editorCtx.activeProject?.projectId === throwOnWriteErrorState,
    caughtError = editorCtx.writeQueuePromise
      .catch(() => {})
      .then(async () => {
        if (!queuedWriteHandler()) return;
        if (!editorCtx.activeProject) throw new Error("请先选择仪表盘。");
        const queuedWrite = documentSignature2(editorCtx.activeProject.document),
          workingDocument = clone2(editorCtx.activeProject.document),
          mutatorResult = await documentMutator(workingDocument);
        if (!(
          !queuedWriteHandler() ||
          !(await projectSummary(workingDocument, writePagePath, {
            expectedSignature: queuedWrite,
          }))
        ))
          return mutatorResult;
      })
      .catch((nudgeSelectedComponents: any) => {
        if (queuedWriteHandler()) throw nudgeSelectedComponents;
      });
  return (
    (editorCtx.writeQueuePromise = caughtError.catch(handleOperationError)),
    throwOnWriteError ? caughtError : editorCtx.writeQueuePromise
  );
}
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
  runAlt,
  runSnapshot,
});
function scaledSelectionPlacements(targetSelectionScale: any) {
  if (editorCtx.selectedComponentIdsSet.size < 2 || !editorCtx.activeProject || !editorCtx.selectedComponentId) return [];
  const selectedComponentsList = [...editorCtx.selectedComponentIdsSet]
      .map(
        (selectedComponentIdItem) =>
          findComponent2(editorCtx.activeProject.document, selectedComponentIdItem)?.component,
      )
      .filter(Boolean),
    primarySelectedComponent = selectedComponentsList.find(
      (primaryCandidateComponent) => primaryCandidateComponent.id === editorCtx.selectedComponentId,
    );
  if (
    !primarySelectedComponent ||
    selectedComponentsList.length !== editorCtx.selectedComponentIdsSet.size ||
    selectedComponentsList.some(
      (fillModeComponent) => fillModeComponent.properties?.layoutMode === "fill",
    )
  )
    return [];
  const primaryComponentScale = Math.max(
      0.01,
      Math.min(5, Number(primarySelectedComponent.style?.scale || 1)),
    ),
    requestedScaleRatio =
      Math.max(0.01, Math.min(5, Number(targetSelectionScale))) / primaryComponentScale,
    minAllowedRatio = Math.max(
      ...selectedComponentsList.map(
        (minRatioComponent) => 0.01 / Math.max(0.01, Number(minRatioComponent.style?.scale || 1)),
      ),
    ),
    maxAllowedRatio = Math.min(
      ...selectedComponentsList.map(
        (maxRatioComponent) => 5 / Math.max(0.01, Number(maxRatioComponent.style?.scale || 1)),
      ),
    ),
    appliedScaleRatio = clampNumber2(requestedScaleRatio, minAllowedRatio, maxAllowedRatio),
    selectionBoundsList = selectedComponentsList.map(componentBounds2),
    selectionAnchorX =
      (Math.min(...selectionBoundsList.map((leftBoundsItem) => leftBoundsItem.left)) +
        Math.max(...selectionBoundsList.map((rightBoundsItem) => rightBoundsItem.right))) /
      2,
    selectionAnchorY =
      (Math.min(...selectionBoundsList.map((topBoundsItem) => topBoundsItem.top)) +
        Math.max(...selectionBoundsList.map((bottomBoundsItem) => bottomBoundsItem.bottom))) /
      2;
  return selectedComponentsList.map((scaledComponent) => {
    const scaledComponentPosition = scaledComponent.position || {},
      scaledComponentWidth = Number(scaledComponentPosition.width || 100),
      scaledComponentHeight = Number(scaledComponentPosition.height || 100),
      scaledComponentCenterX = Number(scaledComponentPosition.x || 0) + scaledComponentWidth / 2,
      scaledComponentCenterY = Number(scaledComponentPosition.y || 0) + scaledComponentHeight / 2;
    return {
      componentId: scaledComponent.id,
      x:
        selectionAnchorX +
        (scaledComponentCenterX - selectionAnchorX) * appliedScaleRatio -
        scaledComponentWidth / 2,
      y:
        selectionAnchorY +
        (scaledComponentCenterY - selectionAnchorY) * appliedScaleRatio -
        scaledComponentHeight / 2,
      scale: Math.max(
        0.01,
        Math.min(5, Number(scaledComponent.style?.scale || 1) * appliedScaleRatio),
      ),
    };
  });
}
function selectedComponentIdsFromDom() {
  const domSelectedIds = [...document.querySelectorAll<HTMLElement>(".element-item.selected[data-component-id]")]
    .map((elementItemElement) => elementItemElement.dataset.componentId)
    .filter(Boolean);
  return editorCtx.selectedComponentIdsSet.size > 1 ? [...editorCtx.selectedComponentIdsSet] : domSelectedIds;
}
function setComponentsRotation(
  rotationDocument: any,
  rotationComponentId: any,
  rotationDegrees: any,
  rotationComponentIds: any[] = [],
) {
  const rotationTargetIds =
    rotationComponentIds.length > 1 ? rotationComponentIds : [rotationComponentId];
  for (const rotationTargetId of rotationTargetIds) {
    const rotationComponent = findComponent2(rotationDocument, rotationTargetId)?.component;
    rotationComponent &&
      (rotationComponent.position = {
        ...(rotationComponent.position || {}),
        rotation: rotationDegrees,
      });
  }
}
function setComponentsVisibility(visibilityComponentIds: any, visibilityTarget: any) {
  const nl3 = removalPageEntry(visibilityComponentIds);
  nl3.length &&
    mutateDocument((visibilityDocument: any) => {
      for (const visibilityComponentId of nl3) {
        const visibilityComponent = findComponent2(
          visibilityDocument,
          visibilityComponentId,
        )?.component;
        visibilityComponent &&
          (visibilityComponent.style = {
            ...(visibilityComponent.style || {}),
            visible: visibilityTarget,
          });
      }
    });
}
function closeComponentMenu() {
  ((componentMenuElement.hidden = true), (editorCtx.menuComponentId = null));
}
function openComponentMenu(menuEvent: any, openedMenuComponentId: any) {
  (menuEvent.preventDefault(), menuEvent.stopPropagation());
  (selectComponent(openedMenuComponentId, {
    preserveGroup: true,
  }),
    (editorCtx.menuComponentId = openedMenuComponentId));
  const menuCount = editorCtx.selectedComponentIdsSet.has(openedMenuComponentId)
      ? [...editorCtx.selectedComponentIdsSet]
      : [openedMenuComponentId],
    copyMenuButtonElement = menuCount.length,
    selector = componentMenuElement.querySelector('[data-component-action="copy"]'),
    copyToPageMenuButtonElement = componentMenuElement.querySelector(
      '[data-component-action="copy-to-page"]',
    ),
    visibilityMenuButtonElement = componentMenuElement.querySelector(
      '[data-component-action="visibility"]',
    ),
    deleteMenuButtonElement = componentMenuElement.querySelector(
      '[data-component-action="delete"]',
    ),
    groupMenuButtonElement = componentMenuElement.querySelector('[data-component-action="group"]'),
    ungroupMenuButtonElement = componentMenuElement.querySelector(
      '[data-component-action="ungroup"]',
    ),
    renameGroupMenuButtonElement = componentMenuElement.querySelector(
      '[data-component-action="rename-group"]',
    ),
    menuTitleTextElement = componentMenuElement.querySelector(":scope > strong");
  selector.textContent =
    copyMenuButtonElement > 1 ? "复制 " + copyMenuButtonElement + " 个控件" : "复制控件";
  const menuComponent = findComponent2(editorCtx.activeProject?.document, openedMenuComponentId)?.component,
    menuVisibilityList = menuCount
      .map(
        (menuComponentIdItem) =>
          findComponent2(editorCtx.activeProject?.document, menuComponentIdItem)?.component,
      )
      .filter(Boolean)
      .map((menuComponentItem) => menuComponentItem.style?.visible !== false),
    every =
      menuVisibilityList.length === menuCount.length &&
      menuVisibilityList.every((visibility) => visibility === menuVisibilityList[0]);
  ((visibilityMenuButtonElement.disabled = !every),
    (visibilityMenuButtonElement.textContent = every
      ? menuVisibilityList[0]
        ? copyMenuButtonElement > 1
          ? "批量隐藏 " + copyMenuButtonElement + " 个"
          : "隐藏控件"
        : copyMenuButtonElement > 1
          ? "批量显示 " + copyMenuButtonElement + " 个"
          : "显示控件"
      : "批量隐藏/显示"),
    (visibilityMenuButtonElement.title = every
      ? ""
      : "选中的控件包含隐藏和显示状态，无法批量处理"));
  const hasOtherProject = canGroupComponents2(menuCount, editorCtx.activeProject?.document);
  ((groupMenuButtonElement.hidden = !hasOtherProject),
    (ungroupMenuButtonElement.hidden =
      menuComponent?.type !== "group" || copyMenuButtonElement !== 1),
    (renameGroupMenuButtonElement.hidden =
      menuComponent?.type !== "group" || copyMenuButtonElement !== 1),
    (copyToPageMenuButtonElement.textContent = "复制到其他区域"));
  const some = editorCtx.projects.some(
      (menuProjectEntry: any) => menuProjectEntry.id !== editorCtx.activeProject?.projectId,
    ),
    copyTargets = findCommonCopyTargets(editorCtx.activeProject?.document, menuCount);
  ((copyToPageMenuButtonElement.disabled = copyTargets.length === 0 && !some),
    (copyToPageMenuButtonElement.title = copyToPageMenuButtonElement.disabled
      ? "当前没有可复制的目标区域"
      : copyMenuButtonElement > 1
        ? "完整复制选中的 " + copyMenuButtonElement + " 个控件到其他页面、侧边栏或其他仪表盘"
        : "完整复制当前控件到其他页面、侧边栏或其他仪表盘"),
    (deleteMenuButtonElement.textContent =
      copyMenuButtonElement > 1 ? "删除 " + copyMenuButtonElement + " 个控件" : "删除控件"),
    (menuTitleTextElement.textContent =
      copyMenuButtonElement > 1 ? "颜色标签（" + copyMenuButtonElement + " 个控件）" : "颜色标签"));
  const labelColorValues = menuCount.map((labelColorComponentId) => {
      const labelColorComponent = findComponent2(
        editorCtx.activeProject?.document,
        labelColorComponentId,
      )?.component;
      return runStore(labelColorComponent?.style?.editorLabelColor);
    }),
    sharedLabelColor = labelColorValues.every(
      (labelColorValue) => labelColorValue === labelColorValues[0],
    )
      ? labelColorValues[0]
      : null;
  for (const labelColorButton of componentMenuElement.querySelectorAll("[data-label-color]"))
    labelColorButton.classList.toggle(
      "active",
      sharedLabelColor !== null && labelColorButton.dataset.labelColor === sharedLabelColor,
    );
  ((componentMenuElement.hidden = false),
    (componentMenuElement.style.left = "0px"),
    (componentMenuElement.style.top = "0px"),
    window.requestAnimationFrame(() => {
      const menuRect = componentMenuElement.getBoundingClientRect(),
        menuLeftPx = clampNumber2(
          menuEvent.clientX,
          8,
          Math.max(8, window.innerWidth - menuRect.width - 8),
        ),
        menuTopPx = clampNumber2(
          menuEvent.clientY,
          8,
          Math.max(8, window.innerHeight - menuRect.height - 8),
        );
      ((componentMenuElement.style.left = menuLeftPx + "px"),
        (componentMenuElement.style.top = menuTopPx + "px"));
    }));
}
function findCommonCopyTargets(copyTargetDocument: any, copySourceComponentIds: any) {
  const copySourceIds = [...new Set(copySourceComponentIds || [])].filter(Boolean);
  if (!copyTargetDocument || !copySourceIds.length) return [];
  const copyTargetKeysBySource = copySourceIds.map(
      (copySourceId) =>
        new Set(
          copyComponentTargets2(copyTargetDocument, copySourceId).map(
            (copyTargetEntry: any) => copyTargetEntry.key,
          ),
        ),
    ),
    commonCopyTargetKeys = [...(copyTargetKeysBySource[0] || [])].filter((copyTargetKey) =>
      copyTargetKeysBySource.every((copyTargetKeySet) => copyTargetKeySet.has(copyTargetKey)),
    ),
    copyTargetsOfFirst = copyComponentTargets2(copyTargetDocument, copySourceIds[0]);
  return commonCopyTargetKeys
    .map((matchedCopyTargetKey) =>
      copyTargetsOfFirst.find(
        (matchedCopyTargetEntry: any) => matchedCopyTargetEntry.key === matchedCopyTargetKey,
      ),
    )
    .filter(Boolean);
}
function showCopySuccessDialog(copySuccessMessage: any, copySuccessTarget: any) {
  ((editorCtx.copySuccessNavigationTarget = copySuccessTarget || null),
    (copyComponentSuccessMessageElement.textContent = copySuccessMessage),
    copyComponentSuccessDialogElement.showModal());
}
async function handleCopySuccessConfirm() {
  const Ha2 = editorCtx.copySuccessNavigationTarget;
  ((editorCtx.copySuccessNavigationTarget = null),
    copyComponentSuccessDialogElement.close(),
    Ha2 &&
      (Ha2.projectId && Ha2.projectId !== editorCtx.activeProject?.projectId
        ? await historyEntry(Ha2.projectId, Ha2.pagePath)
        : Ha2.pagePath &&
          Ha2.pagePath !== pageSelectElement.value &&
          ((pageSelectElement.value = Ha2.pagePath),
          loadNavigationIconOptions(pageSelectElement),
          editorCtx.editorRenderer?.navigate(Ha2.pagePath),
          editorCtx.dashboardPreviewRenderer?.navigate(Ha2.pagePath),
          renderComponentLists(),
          coverMotorButtonElement()),
      setComponentScope(Ha2.scope)));
}
function duplicateComponents(
  duplicatedComponentIds: any,
  duplicateFocusComponentId = editorCtx.selectedComponentId,
) {
  const nl4 = removalPageEntry(duplicatedComponentIds);
  nl4.length &&
    mutateDocument((duplicateDocument: any) => {
      const copyLocationByComponentId = new Map(
          nl4.map((duplicateComponentId) => [
            duplicateComponentId,
            findComponentLocation2(duplicateDocument, duplicateComponentId),
          ]),
        ),
        sort2 = nl4
          .filter((sortedDuplicateComponentId) =>
            copyLocationByComponentId.get(sortedDuplicateComponentId),
          )
          .sort((duplicateIdA, duplicateIdB) => {
            const locationOfA = copyLocationByComponentId.get(duplicateIdA),
              locationOfB = copyLocationByComponentId.get(duplicateIdB);
            return locationOfA.collection === locationOfB.collection
              ? locationOfA.index - locationOfB.index
              : 0;
          }),
        createdDuplicateIds: any[] = [],
        newIdBySourceId = new Map();
      for (const duplicateSourceId of sort2) {
        const tp2 = duplicateComponent(duplicateDocument, duplicateSourceId);
        tp2 && (createdDuplicateIds.push(tp2.id), newIdBySourceId.set(duplicateSourceId, tp2.id));
      }
      createdDuplicateIds.length &&
        ((editorCtx.selectedComponentId =
          newIdBySourceId.get(duplicateFocusComponentId) || createdDuplicateIds[0]),
        (editorCtx.selectedComponentIdsSet = new Set(createdDuplicateIds)),
        (editorCtx.selectionAnchorComponentId = editorCtx.selectedComponentId));
    });
}
function copyTargetsForDocument(
  copyTargetSourceDocument: any,
  {
    includeShared: includeSharedTargets = true,
    sourceComponentId: explicitSourceComponentId = null,
  }: any = {},
) {
  if (!copyTargetSourceDocument) return [];
  if (explicitSourceComponentId)
    return copyComponentTargets2(copyTargetSourceDocument, explicitSourceComponentId);
  const pageCopyTargets = (copyTargetSourceDocument.pages || []).map((copyTargetPage: any) => ({
    key: "page:" + copyTargetPage.path,
    name: copyTargetPage.name,
    scope: "page",
    page: copyTargetPage,
  }));
  return includeSharedTargets
    ? [
        {
          key: "shared",
          name: "侧边栏",
          scope: "shared",
        },
        ...pageCopyTargets,
      ]
    : pageCopyTargets;
}
function renderCopyTargetOptions(copyTargetOptionList: any) {
  (copyComponentPageTargetElement.replaceChildren(
    ...copyTargetOptionList.map(
      (copyTargetOption: any) => new Option(copyTargetOption.name, copyTargetOption.key),
    ),
  ),
    (copyComponentPageTargetElement.disabled = !copyTargetOptionList.length),
    (copyComponentPageTargetElement.value = copyTargetOptionList[0]?.key || ""),
    loadNavigationIconOptions(copyComponentPageTargetElement));
}
function getDocumentCanvasSize(canvasSizeDocument: any) {
  return {
    width: Number(canvasSizeDocument?.canvas?.width || 2778),
    height: Number(canvasSizeDocument?.canvas?.height || 1940),
  };
}
function renderCopyScaleOptions() {
  if (!(copyComponentPageScopeSelectElement.value === "other" && editorCtx.copyTargetDraft)) {
    ((copyComponentScaleOptionsElement.hidden = true),
      (copyComponentResolutionSummaryElement.textContent = ""));
    return;
  }
  const sourceCanvasSize = getDocumentCanvasSize(editorCtx.activeProject?.document),
    targetCanvasSize = getDocumentCanvasSize(editorCtx.copyTargetDraft.document),
    canvasSizeMismatch =
      sourceCanvasSize.width !== targetCanvasSize.width ||
      sourceCanvasSize.height !== targetCanvasSize.height;
  ((copyComponentScaleOptionsElement.hidden = !canvasSizeMismatch),
    (copyComponentResolutionSummaryElement.textContent = canvasSizeMismatch
      ? sourceCanvasSize.width +
        " × " +
        sourceCanvasSize.height +
        " → " +
        targetCanvasSize.width +
        " × " +
        targetCanvasSize.height
      : ""));
}
async function renderCopyComponentDialog() {
  const isOtherProjectTarget = copyComponentPageScopeSelectElement.value === "other";
  let copyDialogComponentIds: any[] = [];
  try {
    copyDialogComponentIds = JSON.parse(
      copyComponentPageDialogElement.dataset.componentIds || "[]",
    );
  } catch {
    copyDialogComponentIds = [];
  }
  const copyDialogFirstLocation = findComponent2(
      editorCtx.activeProject?.document,
      copyDialogComponentIds[0],
    ),
    copyDialogComponentCount = copyDialogComponentIds.length,
    copyDialogDescriptionElement = copyComponentPageDialogElement.querySelector(
      "[data-copy-component-description]",
    );
  if (
    ((copyComponentPageProjectFieldElement.hidden = !isOtherProjectTarget),
    (copyComponentPageTargetLabelElement.textContent = isOtherProjectTarget
      ? "其他仪表盘目标页面"
      : "本仪表盘目标页面"),
    (copyComponentPageSubmitElement.textContent = isOtherProjectTarget
      ? "复制到目标仪表盘"
      : "复制并前往"),
    (copyDialogDescriptionElement.textContent = isOtherProjectTarget
      ? "将选中的 " +
        copyDialogComponentCount +
        " 个控件完整复制到其他仪表盘的目标页面或侧边栏，源控件不受影响。"
      : copyDialogFirstLocation?.scope === "shared"
        ? "将选中的 " +
          copyDialogComponentCount +
          " 个侧边栏控件完整复制到指定主页面，复制后为该页面的独立控件。"
        : "将选中的 " +
          copyDialogComponentCount +
          " 个控件完整复制到侧边栏或其他主页面，保留位置、尺寸、样式、实体绑定和动作配置。"),
    (editorCtx.copyTargetDraft = null),
    (copyComponentScaleOptionsElement.hidden = true),
    setSettingsMessage(copyComponentPageMessageElement, ""),
    !isOtherProjectTarget)
  ) {
    const localCopyTargets = findCommonCopyTargets(editorCtx.activeProject?.document, copyDialogComponentIds);
    (renderCopyTargetOptions(localCopyTargets),
      (copyComponentPageSubmitElement.disabled = !localCopyTargets.length));
    return;
  }
  const targetProjectId = copyComponentPageProjectSelectElement.value;
  if (!targetProjectId) {
    (renderCopyTargetOptions([]),
      (copyComponentPageSubmitElement.disabled = true),
      setSettingsMessage(copyComponentPageMessageElement, "当前没有其他仪表盘可以复制。"));
    return;
  }
  const copyTargetLoadTokenSnapshot = ++editorCtx.copyTargetLoadToken;
  (renderCopyTargetOptions([]),
    (copyComponentPageSubmitElement.disabled = true),
    setSettingsMessage(copyComponentPageMessageElement, "正在读取目标仪表盘…"));
  try {
    const targetDraftResponse = await requestJson(
      "/projects/" + encodeURIComponent(targetProjectId) + "/draft",
    );
    if (
      copyTargetLoadTokenSnapshot !== editorCtx.copyTargetLoadToken ||
      copyComponentPageScopeSelectElement.value !== "other"
    )
      return;
    editorCtx.copyTargetDraft = targetDraftResponse;
    const wE2 = copyTargetsForDocument(targetDraftResponse.document);
    (renderCopyTargetOptions(wE2),
      renderCopyScaleOptions(),
      setSettingsMessage(
        copyComponentPageMessageElement,
        wE2.length ? "" : "目标仪表盘还没有可复制到的区域。",
      ),
      (copyComponentPageSubmitElement.disabled = !wE2.length));
  } catch (copyTargetLoadError: any) {
    if (copyTargetLoadTokenSnapshot !== editorCtx.copyTargetLoadToken) return;
    setSettingsMessage(copyComponentPageMessageElement, copyTargetLoadError.message, "error");
  }
}
function openCopyComponentDialog(copyComponentSelectionIds: any) {
  const copySourceDocument = editorCtx.activeProject?.document,
    validCopyComponentIds = [...new Set(copyComponentSelectionIds || [])].filter(
      (copyComponentId) => findComponent2(copySourceDocument, copyComponentId),
    ),
    copyAnchorLocation = findComponent2(copySourceDocument, validCopyComponentIds[0]);
  if (!copyAnchorLocation || !validCopyComponentIds.length) {
    handleOperationError(new Error("没有找到要复制的控件。"));
    return;
  }
  ((copyComponentPageDialogElement.dataset.componentIds = JSON.stringify(validCopyComponentIds)),
    (copyComponentPageNameElement.textContent =
      validCopyComponentIds.length > 1
        ? "已选择 " + validCopyComponentIds.length + " 个控件"
        : "“" + componentLabel2(copyAnchorLocation.component) + "”"),
    (copyComponentPageDialogElement.querySelector("[data-copy-component-description]").textContent =
      validCopyComponentIds.length > 1
        ? "将选中的 " + validCopyComponentIds.length + " 个控件完整复制到目标区域。"
        : copyAnchorLocation.scope === "shared"
          ? "将侧边栏控件完整复制到指定主页面，复制后为该页面的独立控件。"
          : "将当前控件完整复制到侧边栏或其他主页面，保留位置、尺寸、样式、实体绑定和动作配置。"),
    (copyComponentPageScopeSelectElement.value = "current"),
    loadNavigationIconOptions(copyComponentPageScopeSelectElement));
  const otherProjectList = editorCtx.projects.filter(
    (otherProjectOption: any) => otherProjectOption.id !== editorCtx.activeProject.projectId,
  );
  (copyComponentPageProjectSelectElement.replaceChildren(
    ...otherProjectList.map(
      (openDeleteComponentDialog: any) =>
        new Option(openDeleteComponentDialog.name, openDeleteComponentDialog.id),
    ),
  ),
    (copyComponentPageProjectSelectElement.disabled = !otherProjectList.length),
    loadNavigationIconOptions(copyComponentPageProjectSelectElement),
    (copyComponentPageFormElement.elements.copyScaleMode.value = "proportional"),
    copyComponentPageDialogElement.showModal(),
    renderCopyComponentDialog());
}
function deleteComponentIds(deleteComponentId: any) {
  const nl5 = removalPageEntry(deleteComponentId);
  if (!nl5.length) {
    handleOperationError(new Error("没有找到要删除的控件。"));
    return;
  }
  if (((deleteComponentDialogElement.dataset.componentIds = JSON.stringify(nl5)), nl5.length > 1))
    deleteComponentNameElement.textContent = "“已选择的 " + nl5.length + " 个控件”";
  else {
    const deleteAnchorComponent = findComponent2(editorCtx.activeProject?.document, nl5[0])?.component;
    deleteComponentNameElement.textContent =
      "“" +
      componentLabel2(
        deleteAnchorComponent || {
          type: "控件",
        },
      ) +
      "”";
  }
  deleteComponentDialogElement.showModal();
}
function setComponentsLabelColor(labelColorComponentIds: any, newLabelColorValue: any) {
  const labelColorTargetIds = [...new Set(labelColorComponentIds || [])];
  if (!labelColorTargetIds.length) return;
  const pp2 = runStore(newLabelColorValue);
  mutateDocument((labelColorDocument: any) => {
    for (const sortedLabelColorComponentId of labelColorTargetIds) {
      const targetLabelColorComponent = findComponent2(
        labelColorDocument,
        sortedLabelColorComponentId,
      )?.component;
      targetLabelColorComponent &&
        ((targetLabelColorComponent.style = {
          ...(targetLabelColorComponent.style || {}),
        }),
        pp2
          ? (targetLabelColorComponent.style.editorLabelColor = pp2)
          : delete targetLabelColorComponent.style.editorLabelColor);
    }
  });
}
function renderComponentList(componentListElement: any, listComponents: any, listEmptyText: any, listScope: any) {
  if ((componentListElement.replaceChildren(), !listComponents.length)) {
    const listEmptyElement = document.createElement("div");
    ((listEmptyElement.className = "element-list-empty"),
      (listEmptyElement.textContent = listEmptyText),
      componentListElement.append(listEmptyElement));
    return;
  }
  for (const listComponent of listComponents) {
    const componentItemElement = document.createElement("div");
    ((componentItemElement.className = "element-item"),
      (componentItemElement.dataset.componentId = listComponent.id),
      (componentItemElement.dataset.scope = listScope),
      (componentItemElement.draggable = !editorCtx.activeGroupId),
      componentItemElement.classList.toggle(
        "selected",
        editorCtx.selectedComponentIdsSet.has(listComponent.id),
      ),
      componentItemElement.classList.toggle(
        "selection-primary",
        listComponent.id === editorCtx.selectedComponentId,
      ),
      componentItemElement.classList.toggle("group-item", listComponent.type === "group"));
    const pp3 = runStore(listComponent.style?.editorLabelColor);
    (componentItemElement.classList.toggle("has-color-label", !!pp3),
      pp3 && componentItemElement.style.setProperty("--element-label-color", pp3));
    const itemIconElement = document.createElement("i");
    ((itemIconElement.className =
      listComponent.type === "group" ? "element-group-icon" : "element-label-color"),
      itemIconElement.setAttribute("aria-hidden", "true"),
      listComponent.type === "group" &&
        (itemIconElement.innerHTML =
          '<svg viewBox="0 0 24 24" focusable="false"><path d="M3.5 7.5h6l1.8 2h9.2v9.5h-17z"/><path d="M3.5 7.5v-1h6l1.8 2"/></svg>'));
    const itemLabelElement = document.createElement("span");
    itemLabelElement.textContent = componentLabel2(listComponent);
    const isItemIsVisible = listComponent.style?.visible !== false,
      itemVisibilityButtonElement = document.createElement("button");
    ((itemVisibilityButtonElement.type = "button"),
      (itemVisibilityButtonElement.className =
        "element-visibility" + (isItemIsVisible ? "" : " hidden-element")),
      itemVisibilityButtonElement.setAttribute(
        "aria-label",
        isItemIsVisible
          ? "隐藏" + componentLabel2(listComponent)
          : "显示" + componentLabel2(listComponent),
      ),
      (itemVisibilityButtonElement.innerHTML = visibilityIconSvg2(isItemIsVisible)));
    const stopItemEventPropagation = (itemEvent: any) => {
      ((editorCtx.lastComponentClick = {
        componentId: listComponent.id,
        at: Date.now(),
      }),
        itemEvent.stopPropagation());
    };
    (itemVisibilityButtonElement.addEventListener("pointerdown", stopItemEventPropagation),
      itemVisibilityButtonElement.addEventListener("click", (visibilityClickEvent) => {
        ((editorCtx.lastComponentClick = {
          componentId: listComponent.id,
          at: Date.now(),
        }),
          visibilityClickEvent.stopPropagation(),
          selectComponent(listComponent.id, {
            preserveGroup: true,
          }),
          setComponentsVisibility([listComponent.id], !isItemIsVisible));
      }),
      itemVisibilityButtonElement.addEventListener("dblclick", stopItemEventPropagation),
      componentItemElement.append(itemIconElement, itemLabelElement, itemVisibilityButtonElement),
      componentItemElement.addEventListener("click", (itemClickEvent) => {
        selectComponent(listComponent.id, {
          toggle: itemClickEvent.metaKey || itemClickEvent.ctrlKey,
          range: itemClickEvent.shiftKey,
        });
      }),
      componentItemElement.addEventListener("dblclick", (itemDoubleClickEvent) => {
        if (
          listComponent.type !== "group" ||
          (itemDoubleClickEvent.target as Element).closest(".element-visibility")
        )
          return;
        if (
          editorCtx.lastComponentClick.componentId === listComponent.id &&
          Date.now() - editorCtx.lastComponentClick.at < 600
        ) {
          (itemDoubleClickEvent.preventDefault(), itemDoubleClickEvent.stopPropagation());
          return;
        }
        (itemDoubleClickEvent.preventDefault(),
          itemDoubleClickEvent.stopPropagation(),
          (editorCtx.activeGroupId = listComponent.id),
          clearComponentSelection(),
          renderComponentLists(),
          syncRendererSelection(),
          coverMotorButtonElement());
      }),
      componentItemElement.addEventListener("contextmenu", (itemMenuEvent) =>
        openComponentMenu(itemMenuEvent, listComponent.id),
      ),
      componentItemElement.addEventListener("dragstart", (itemDragStartEvent) => {
        editorCtx.selectedComponentIdsSet.has(listComponent.id)
          ? (editorCtx.selectedComponentId = listComponent.id)
          : ((editorCtx.selectedComponentIdsSet = new Set([listComponent.id])),
            (editorCtx.selectedComponentId = listComponent.id),
            (editorCtx.selectionAnchorComponentId = listComponent.id));
        const draggingComponentIds = [...editorCtx.selectedComponentIdsSet];
        ((itemDragStartEvent.dataTransfer!.effectAllowed = "move"),
          itemDragStartEvent.dataTransfer!.setData(
            "text/plain",
            JSON.stringify({
              scope: listScope,
              sourceId: listComponent.id,
              movingIds: draggingComponentIds,
            }),
          ),
          componentListElement.querySelectorAll(".element-item").forEach((listItemElement: any) => {
            listItemElement.classList.toggle(
              "dragging",
              draggingComponentIds.includes(listItemElement.dataset.componentId),
            );
          }));
      }),
      componentItemElement.addEventListener("dragend", () => {
        (componentListElement
          .querySelectorAll(".dragging")
          .forEach((draggingElement: any) => draggingElement.classList.remove("dragging")),
          componentListElement
            .querySelectorAll(".drop-before, .drop-after")
            .forEach((dropMarkerElement: any) =>
              dropMarkerElement.classList.remove("drop-before", "drop-after"),
            ));
      }),
      componentItemElement.addEventListener("dragover", (itemDragOverEvent) => {
        if (!itemDragOverEvent.dataTransfer!.types.includes("text/plain")) return;
        (itemDragOverEvent.preventDefault(), (itemDragOverEvent.dataTransfer!.dropEffect = "move"));
        const isDropAfter =
          itemDragOverEvent.clientY >=
          componentItemElement.getBoundingClientRect().top +
            componentItemElement.getBoundingClientRect().height / 2;
        (componentItemElement.classList.toggle("drop-before", !isDropAfter),
          componentItemElement.classList.toggle("drop-after", isDropAfter));
      }),
      componentItemElement.addEventListener("dragleave", () =>
        componentItemElement.classList.remove("drop-before", "drop-after"),
      ),
      componentItemElement.addEventListener("drop", (itemDropEvent) => {
        itemDropEvent.preventDefault();
        let dragPayload;
        try {
          dragPayload = JSON.parse(itemDropEvent.dataTransfer!.getData("text/plain"));
        } catch {
          return;
        }
        const { scope: payloadSourceId, sourceId: payloadMovingIds } = dragPayload,
          movingIds = Array.isArray(dragPayload.movingIds)
            ? dragPayload.movingIds
            : [payloadMovingIds],
          contains3 = componentItemElement.classList.contains("drop-after");
        (componentItemElement.classList.remove("drop-before", "drop-after"),
          !(
            payloadSourceId !== listScope ||
            !payloadMovingIds ||
            movingIds.includes(listComponent.id)
          ) &&
            ((editorCtx.selectedComponentId = payloadMovingIds),
            (editorCtx.selectedComponentIdsSet = new Set(movingIds)),
            mutateDocument((dropDocument: any) => {
              const sharedComponents =
                listScope === "shared"
                  ? dropDocument.sharedComponents
                  : dropDocument.pages.find(
                      (dropPageEntry: any) => dropPageEntry.path === pageSelectElement.value,
                    )?.components;
              if (!sharedComponents) return;
              const payloadMovingIdSet = new Set(movingIds),
                movedDropComponents = sharedComponents.filter((movedDropCollectionComponent: any) =>
                  payloadMovingIdSet.has(movedDropCollectionComponent.id),
                );
              if (!movedDropComponents.length) return;
              const remainingDropComponents = sharedComponents.filter(
                  (remainingDropCollectionComponent: any) =>
                    !payloadMovingIdSet.has(remainingDropCollectionComponent.id),
                ),
                dropTargetIndex = remainingDropComponents.findIndex(
                  (dropIndexCollectionComponent: any) =>
                    dropIndexCollectionComponent.id === listComponent.id,
                );
              dropTargetIndex < 0 ||
                (remainingDropComponents.splice(
                  dropTargetIndex + (contains3 ? 1 : 0),
                  0,
                  ...movedDropComponents,
                ),
                sharedComponents.splice(0, sharedComponents.length, ...remainingDropComponents),
                applyCollectionLayerOrder2(sharedComponents),
                listScope === "shared" && syncSharedComponentReferenceOrder2(dropDocument));
            })));
      }),
      componentListElement.append(componentItemElement));
  }
}
function prependGroupBackButton(groupBackListElement: any, groupBackComponent: any) {
  if (!groupBackComponent) return;
  const groupBackButtonElement = document.createElement("button");
  ((groupBackButtonElement.type = "button"),
    (groupBackButtonElement.className = "element-group-back"),
    (groupBackButtonElement.textContent = "← 返回" + componentLabel2(groupBackComponent)),
    groupBackButtonElement.addEventListener("click", () => {
      ((editorCtx.activeGroupId = null),
        clearComponentSelection(),
        renderComponentLists(),
        syncRendererSelection(),
        coverMotorButtonElement());
    }),
    groupBackListElement.prepend(groupBackButtonElement));
}
function renderComponentLists() {
  const ct3 = currentPage(),
    activeGroupComponent = editorCtx.activeGroupId
      ? findComponent2(editorCtx.activeProject?.document, editorCtx.activeGroupId)
      : null,
    component2 =
      activeGroupComponent?.component?.type === "group" ? activeGroupComponent.component : null;
  editorCtx.activeGroupId && !component2 && (editorCtx.activeGroupId = null);
  const sharedListComponents =
      component2 && activeGroupComponent!.scope === "shared"
        ? component2.children || []
        : editorCtx.activeProject?.document?.sharedComponents || [],
    pageListComponents =
      component2 && activeGroupComponent!.scope === "page"
        ? component2.children || []
        : ct3?.components || [];
  (renderComponentList(
    sharedComponentListElement,
    sharedListComponents,
    "暂无侧边栏控件",
    "shared",
  ),
    renderComponentList(pageComponentListElement, pageListComponents, "暂无主页面控件", "page"),
    component2 &&
      prependGroupBackButton(
        activeGroupComponent!.scope === "shared"
          ? sharedComponentListElement
          : pageComponentListElement,
        component2,
      ));
}
function setComponentScope(componentScopeName: any) {
  editorCtx.componentScope = componentScopeName === "page" ? "page" : "shared";
  const isSharedScope = editorCtx.componentScope === "shared";
  (showSharedComponentsElement.classList.toggle("active", isSharedScope),
    showPageComponentsElement.classList.toggle("active", !isSharedScope),
    (sharedComponentListElement.hidden = !isSharedScope),
    (pageComponentListElement.hidden = isSharedScope),
    syncAddComponentButton());
}
function syncAddComponentButton() {
  const hasCurrentPage = !!currentPage(),
    some2 = ["shared", "page"].some(
      (templateScope) => listComponentTemplates2(templateScope).length > 0,
    );
  ((addComponentButtonElement.disabled = !hasCurrentPage || !some2),
    (addComponentButtonElement.title = hasCurrentPage
      ? some2
        ? "从模板库添加控件"
        : "该区域暂无可用控件模板"
      : "请先新建页面"));
}
function renderComponentTemplates() {
  const componentTemplates = [
      ...listComponentTemplates2("shared"),
      ...listComponentTemplates2("page"),
    ].filter(
      (templateEntry, templateIndex, templateList) =>
        templateList.findIndex((templateEntryItem) => templateEntryItem.id === templateEntry.id) ===
        templateIndex,
    );
  if (
    ((componentTemplateScopeElement.textContent =
      editorCtx.componentScope === "shared"
        ? "当前添加到侧边栏，添加后会在所有页面显示。"
        : "当前添加到主页面，仅在“" + (currentPage()?.name || "当前页面") + "”显示。"),
    !componentTemplates.length)
  ) {
    const templateEmptyElement = document.createElement("div");
    ((templateEmptyElement.className = "component-template-empty"),
      (templateEmptyElement.textContent = "暂无可用控件模板。"),
      componentTemplateListElement.replaceChildren(templateEmptyElement));
    return;
  }
  componentTemplateListElement.replaceChildren(
    ...componentTemplates.map((componentTemplate) => {
      const templateCardElement = document.createElement("button");
      ((templateCardElement.type = "button"),
        (templateCardElement.className = "component-template-card"),
        (templateCardElement.dataset.templateId = componentTemplate.id));
      const templatePreviewElement = document.createElement("span");
      if (
        ((templatePreviewElement.className = "component-template-preview"),
        templatePreviewElement.setAttribute("aria-hidden", "true"),
        componentTemplate.id === "interaction3d")
      )
        renderInteraction3dThumbnail2(templatePreviewElement);
      else {
        if (componentTemplate.id === "flow-line")
          (templatePreviewElement.classList.add("flow-line-template-preview"),
            (templatePreviewElement.innerHTML =
              '<svg viewBox="0 0 180 100"><path d="M 15 78 H 65 Q 75 78 75 68 V 32 Q 75 22 85 22 H 165" fill="none" stroke="#42d9ef" stroke-opacity=".2" stroke-width="4"/><path d="M 15 78 H 65 Q 75 78 75 68 V 32 Q 75 22 85 22 H 165" fill="none" stroke="#42d9ef" stroke-width="3" stroke-linecap="round" stroke-dasharray="18 18"/></svg>'));
        else {
          if (componentTemplate.id === "scene-mode")
            (templatePreviewElement.classList.add("scene-mode-template-preview"),
              (templatePreviewElement.innerHTML =
                '<span class="scene-mode-template-content"><span class="scene-mode-template-icon"></span><span class="scene-mode-template-text"><strong>情景模式</strong><small>SCENE</small></span></span>'));
          else {
            if (componentTemplate.id === "percentage-bar")
              templatePreviewElement.innerHTML =
                '<svg class="percentage-template-chart" viewBox="0 0 520 260" aria-hidden="true">\n        <defs>\n          <linearGradient id="percentage-thumb-amber" x2="0" y2="1"><stop stop-color="#f2a20d" stop-opacity=".75"/><stop offset="1" stop-color="#f2a20d" stop-opacity=".08"/></linearGradient>\n          <linearGradient id="percentage-thumb-green" x2="0" y2="1"><stop stop-color="#68cc3e" stop-opacity=".75"/><stop offset="1" stop-color="#68cc3e" stop-opacity=".08"/></linearGradient>\n          <linearGradient id="percentage-thumb-gray" x2="0" y2="1"><stop stop-color="#94a5b3" stop-opacity=".75"/><stop offset="1" stop-color="#94a5b3" stop-opacity=".08"/></linearGradient>\n        </defs>\n        <g fill="#dce1e5" font-family="Helvetica Neue, sans-serif" font-size="42" text-anchor="middle" font-weight="300">\n          <text x="130" y="85">68<tspan font-size="22">%</tspan></text><text x="260" y="43">92<tspan font-size="22">%</tspan></text><text x="390" y="126">46<tspan font-size="22">%</tspan></text>\n        </g>\n        <rect x="94" y="99" width="72" height="123" rx="4" fill="url(#percentage-thumb-amber)" stroke="#f2a20d" stroke-opacity=".7" stroke-width="2"/>\n        <rect x="224" y="56" width="72" height="166" rx="4" fill="url(#percentage-thumb-green)" stroke="#68cc3e" stroke-opacity=".7" stroke-width="2"/>\n        <rect x="354" y="139" width="72" height="83" rx="4" fill="url(#percentage-thumb-gray)" stroke="#94a5b3" stroke-opacity=".7" stroke-width="2"/>\n        <g fill="#94a5b3" font-family="sans-serif" font-size="24" text-anchor="middle"><text x="130" y="251">液位</text><text x="260" y="251">电量</text><text x="390" y="251">湿度</text></g>\n      </svg>';
            else {
              const templateThumbnailElement = document.createElement("img"),
                thumbnailId = componentTemplate.thumbnailId || componentTemplate.id;
              ((templateThumbnailElement.src =
                "/static/component-thumbnails/" +
                encodeURIComponent(thumbnailId) +
                ".jpg"),
                (templateThumbnailElement.alt = ""),
                templatePreviewElement.append(templateThumbnailElement));
            }
          }
        }
      }
      const templateCopyElement = document.createElement("span");
      templateCopyElement.className = "component-template-copy";
      const templateNameElement = document.createElement("strong");
      templateNameElement.textContent = componentTemplate.name;
      const templateDescriptionElement = document.createElement("span");
      return (
        (templateDescriptionElement.textContent = componentTemplate.description),
        templateCopyElement.append(templateNameElement, templateDescriptionElement),
        templateCardElement.append(templatePreviewElement, templateCopyElement),
        componentTemplate.id === "interaction3d" && updateInteraction3dCard2(templateCardElement),
        templateCardElement
      );
    }),
  );
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
function renderNavigationIconPreview(navigationIconName: any) {
  return navigationIconName?.domain || String(navigationIconName?.entityId || "").split(".")[0];
}
function runQueue(runBuffer: any) {
  const be2 = renderNavigationIconPreview(runBuffer);
  return runBuffer?.virtual
    ? "虚拟实体"
    : hELPER_ENTITY_DOMAINSSet.has(be2)
      ? "辅助元素"
      : (ENTITY_DOMAIN_LABELS as any)[be2] || be2 || "实体";
}
function runCursor(runPointer: any) {
  return String(runPointer || "")
    .replace(/\s+/g, " ")
    .trim();
}
function navigationIconValue(runTarget: any) {
  return runCursor(editorCtx.deviceNamesByDeviceId.get(String(runTarget?.deviceId || "")));
}
function runSource(runOrigin: any, runDraft = navigationIconValue(runOrigin)) {
  const ja2 = runCursor(runOrigin?.name),
    ja3 = runCursor(runOrigin?.originalName);
  if (!runDraft) return ja2 || ja3 || runOrigin?.entityId || "";
  const navigationIconValueState =
    ja2 === runDraft
      ? ""
      : ja2.startsWith(runDraft + " ")
        ? ja2.slice(runDraft.length).trim()
        : ja2.startsWith(runDraft + "·")
          ? ja2.slice(runDraft.length + 1).trim()
          : ja2;
  return navigationIconValueState && navigationIconValueState !== runDraft
    ? navigationIconValueState
    : ja3 && ja3 !== runDraft
      ? ja3
      : "";
}
function runSnapshot(runSample: any, navigationIconPreviewElement = "") {
  if (runSample?.virtual) return runSample.name || runSample.entityId || "";
  const nw2 = navigationIconValue(runSample),
    yE2 = runCursor(navigationIconPreviewElement) || runSource(runSample, nw2);
  return nw2 ? (yE2 && yE2 !== nw2 ? nw2 + " · " + yE2 : nw2) : yE2 || runSample?.entityId || "";
}
function runMode(runLevel: any) {
  const vt2 = runSnapshot(runLevel),
    navigationIconPreviewElementState = runLevel?.entityId || "";
  return (
    "[" +
    runQueue(runLevel) +
    "] " +
    vt2 +
    (vt2 && vt2 !== navigationIconPreviewElementState
      ? " · " + navigationIconPreviewElementState
      : "")
  );
}
function runOrder(runScope = removedComponent()) {
  return [
    ...new Set(
      (Array.isArray(runScope?.properties?.entityIds) ? runScope.properties.entityIds : [])
        .map((mappedItemsState: any) => String(mappedItemsState || "").trim())
        .filter(Boolean),
    ),
  ];
}
function runRange(runSpan: any, runOffset: any = null) {
  if (!runOffset)
    return {
      label: "实体已删除",
      tone: "missing",
    };
  const navigationIconLabelElementState = editorCtx.editorRenderer?.states?.get?.(runSpan),
    navigationIconLabelElementValue =
      navigationIconLabelElementState?.newState || navigationIconLabelElementState,
    lowerCase2 = String(navigationIconLabelElementValue?.state ?? "")
      .trim()
      .toLowerCase(),
    navigationIconLabelElement = lightStatisticsEntityStateStatus2(
      runOffset,
      navigationIconLabelElementValue,
    );
  return navigationIconLabelElement === "on"
    ? {
        label: "已开启/运行",
        tone: "on",
      }
    : navigationIconLabelElement === "off"
      ? {
          label: "已关闭",
          tone: "off",
        }
      : lowerCase2 === "unavailable"
        ? {
            label: "暂时不可用",
            tone: "abnormal",
          }
        : lowerCase2 === "unknown"
          ? {
              label: "状态未知",
              tone: "abnormal",
            }
          : lowerCase2
            ? {
                label: "无法判断：" + lowerCase2,
                tone: "abnormal",
              }
            : {
                label: "等待状态",
                tone: "abnormal",
              };
}
function runDelta(runFactor = "", runScale = false) {
  ((lightStatisticsEntityMessageElement.textContent = runFactor),
    (lightStatisticsEntityMessageElement.hidden = !runFactor),
    lightStatisticsEntityMessageElement.classList.toggle("error", !!runScale));
}
const MAX_LIGHT_STATISTICS_ENTITIES = 100;
function runLimit({ clearMessage: runBound = true } = {}) {
  ((editorCtx.statisticsEntityId = ""),
    (editorCtx.statisticsReplaceIndex = -1),
    (editorCtx.statisticsComponentId = ""),
    (lightStatisticsEntityPendingElement.hidden = true),
    runBackup(lightStatisticsEntityButtonElement, "选择一个实体"),
    runBound && runDelta(""));
}
function runAmount(runSize = "") {
  if (removedComponent()?.type !== "light-statistics") return;
  const localeLowerCase = runSize.trim().toLocaleLowerCase("zh-CN"),
    navigationIconLabelElementConfig: HTMLElement[] = runPortion("light-statistics")
      .map((mappedItemsValue: any, mappedItemsConfig: any) => ({
        entity: mappedItemsValue,
        index: mappedItemsConfig,
        support: lightStatisticsEntitySupport2(mappedItemsValue),
      }))
      .filter(
        ({ entity: navigationIconLabelElementRef }: any) =>
          !localeLowerCase ||
          (
            runMode(navigationIconLabelElementRef) +
            " " +
            renderNavigationIconPreview(navigationIconLabelElementRef)
          )
            .toLocaleLowerCase("zh-CN")
            .includes(localeLowerCase),
      )
      .sort(
        (navigationIconLabelElementEntry: any, navigationIconUrlState: any) =>
          Number(navigationIconUrlState.support.supported) -
            Number(navigationIconLabelElementEntry.support.supported) ||
          +(renderNavigationIconPreview(navigationIconUrlState.entity) === "light") -
            +(renderNavigationIconPreview(navigationIconLabelElementEntry.entity) === "light") ||
          navigationIconLabelElementEntry.index - navigationIconUrlState.index,
      )
      .map(({ entity: mappedItemsRef }: any) => {
        const navigationIconUrlElement = document.createElement("button");
        ((navigationIconUrlElement.type = "button"),
          (navigationIconUrlElement.className =
            "inspector-entity-option" +
            (mappedItemsRef.entityId === editorCtx.statisticsEntityId ? " selected" : "")),
          (navigationIconUrlElement.dataset.lightStatisticsEntityId = mappedItemsRef.entityId),
          navigationIconUrlElement.setAttribute("role", "option"),
          navigationIconUrlElement.setAttribute(
            "aria-selected",
            String(mappedItemsRef.entityId === editorCtx.statisticsEntityId),
          ));
        const navigationIconUrlElementElement = document.createElement("span");
        ((navigationIconUrlElementElement.className = "inspector-entity-option-content"),
          (navigationIconUrlElementElement.title = runMode(mappedItemsRef)));
        const navigationIconUrlElementPanel = document.createElement("span");
        navigationIconUrlElementPanel.className =
          "inspector-entity-option-line inspector-entity-name-line";
        const navigationIconUrlElementSection = document.createElement("span");
        ((navigationIconUrlElementSection.className = "inspector-entity-kind"),
          (navigationIconUrlElementSection.textContent = "[" + runQueue(mappedItemsRef) + "] "));
        const navigationIconUrlElementCard = document.createElement("span");
        ((navigationIconUrlElementCard.className = "inspector-entity-name"),
          (navigationIconUrlElementCard.textContent = runSnapshot(mappedItemsRef)),
          navigationIconUrlElementPanel.append(
            navigationIconUrlElementSection,
            navigationIconUrlElementCard,
          ));
        const navigationIconUrlElementBar = document.createElement("span");
        return (
          (navigationIconUrlElementBar.className =
            "inspector-entity-option-line inspector-entity-id"),
          (navigationIconUrlElementBar.textContent = mappedItemsRef.entityId),
          (navigationIconUrlElementBar.title = mappedItemsRef.entityId),
          navigationIconUrlElementElement.append(
            navigationIconUrlElementPanel,
            navigationIconUrlElementBar,
          ),
          runAlt(navigationIconUrlElement, navigationIconUrlElementPanel),
          navigationIconUrlElement.append(navigationIconUrlElementElement),
          navigationIconUrlElement
        );
      });
  if (!navigationIconLabelElementConfig.length) {
    const navigationIconUrlElementList = document.createElement("div");
    ((navigationIconUrlElementList.className = "inspector-picker-empty"),
      (navigationIconUrlElementList.textContent = "没有匹配的实体"),
      navigationIconLabelElementConfig.push(navigationIconUrlElementList));
  }
  (lightStatisticsEntityOptionsElement.replaceChildren(...navigationIconLabelElementConfig),
    (lightStatisticsEntityOptionsElement.scrollTop = 0));
}
function runLength(runDepth: any, runPosition = editorCtx.statisticsReplaceIndex) {
  const navigationIconUrl = removedComponent();
  if (
    navigationIconUrl?.type !== "light-statistics" ||
    !runPortion("light-statistics").find(
      (renderIconButtonEffectIconPreview: any) =>
        renderIconButtonEffectIconPreview.entityId === runDepth,
    )
  )
    return;
  const indexOf4 = runOrder(navigationIconUrl).indexOf(runDepth);
  if (indexOf4 >= 0 && indexOf4 !== runPosition) {
    runDelta("该实体已添加，请选择其它实体。", true);
    return;
  }
  return (
    (editorCtx.statisticsEntityId = runDepth),
    (editorCtx.statisticsReplaceIndex = Number.isInteger(runPosition) ? runPosition : -1),
    (editorCtx.statisticsComponentId = navigationIconUrl.id),
    effectIconName()
  );
}
function effectIconName() {
  const effectIconValueState = editorCtx.selectedComponentId,
    tn2 = editorCtx.statisticsEntityId,
    Ko2 = editorCtx.statisticsReplaceIndex,
    effectIconValue = editorCtx.entities.find(
      (effectIconPreviewElementState: any) => effectIconPreviewElementState.entityId === tn2,
    );
  if (!effectIconValueState || !tn2 || !effectIconValue) return;
  const effectIconPreviewElement = removedComponent();
  if (Ko2 < 0 && runOrder(effectIconPreviewElement).length >= MAX_LIGHT_STATISTICS_ENTITIES) {
    runDelta("每个统计控件最多添加 " + MAX_LIGHT_STATISTICS_ENTITIES + " 个实体。", true);
    return;
  }
  return mutateDocument((effectIconPreviewElementValue: any) => {
    const effectIconPreviewElementConfig = findComponent2(
      effectIconPreviewElementValue,
      effectIconValueState,
    )?.component;
    if (
      !effectIconPreviewElementConfig ||
      effectIconPreviewElementConfig.type !== "light-statistics"
    )
      return "component-invalid";
    const qa2 = runOrder(effectIconPreviewElementConfig),
      indexOf5 = qa2.indexOf(tn2);
    if (indexOf5 >= 0 && indexOf5 !== Ko2) return "duplicate";
    const effectIconPreviewElementRef = Ko2 >= 0 && Ko2 < qa2.length ? qa2[Ko2] : "";
    if (!effectIconPreviewElementRef && qa2.length >= MAX_LIGHT_STATISTICS_ENTITIES)
      return "limit-reached";
    if (Ko2 >= 0 && !effectIconPreviewElementRef) return "component-invalid";
    effectIconPreviewElementRef ? qa2.splice(Ko2, 1, tn2) : qa2.push(tn2);
    const effectIconPreviewState = {
      ...(effectIconPreviewElementConfig.properties?.entityLabels || {}),
    };
    return (
      effectIconPreviewElementRef &&
        effectIconPreviewElementRef !== tn2 &&
        delete effectIconPreviewState[String(effectIconPreviewElementRef)],
      (effectIconPreviewState[tn2] = runSnapshot(effectIconValue)),
      (effectIconPreviewElementConfig.properties = {
        ...(effectIconPreviewElementConfig.properties || {}),
        entityIds: qa2,
        entityLabels: effectIconPreviewState,
      }),
      effectIconPreviewElementRef ? "replaced" : "added"
    );
  }).then((effectIconPreviewElementEntry: any) =>
    effectIconPreviewElementEntry === "limit-reached"
      ? (runDelta("每个统计控件最多添加 " + MAX_LIGHT_STATISTICS_ENTITIES + " 个实体。", true),
        effectIconPreviewElementEntry)
      : effectIconPreviewElementEntry === "duplicate"
        ? (runDelta("该实体已添加，请选择其它实体。", true), effectIconPreviewElementEntry)
        : effectIconPreviewElementEntry === "component-invalid"
          ? (runDelta("当前统计控件已发生变化，请重新选择。", true), effectIconPreviewElementEntry)
          : ((effectIconPreviewElementEntry !== "added" &&
              effectIconPreviewElementEntry !== "replaced") ||
              (runLimit({
                clearMessage: false,
              }),
              runDelta(
                effectIconPreviewElementEntry === "replaced"
                  ? "已更换统计实体。"
                  : "已加入统计列表。",
              )),
            effectIconPreviewElementEntry),
  );
}
function runLocation(runRegion: any) {
  const effectIconPreviewElementRecord = editorCtx.selectedComponentId;
  !effectIconPreviewElementRecord ||
    !Number.isInteger(runRegion) ||
    runRegion < 0 ||
    (mutateDocument((effectIconPreviewElementName: any) => {
      const effectIconPreviewElementKey = findComponent2(
        effectIconPreviewElementName,
        effectIconPreviewElementRecord,
      )?.component;
      if (!effectIconPreviewElementKey || effectIconPreviewElementKey.type !== "light-statistics")
        return;
      const qa3 = runOrder(effectIconPreviewElementKey),
        [splice2] = qa3.splice(runRegion, 1),
        effectIconPreviewStateState = {
          ...(effectIconPreviewElementKey.properties?.entityLabels || {}),
        };
      (splice2 && delete effectIconPreviewStateState[String(splice2)],
        (effectIconPreviewElementKey.properties = {
          ...(effectIconPreviewElementKey.properties || {}),
          entityIds: qa3,
          entityLabels: effectIconPreviewStateState,
        }));
    }),
    runLimit());
}
function runZone(runBundle = removedComponent()) {
  if (runBundle?.type !== "light-statistics") return;
  const qa4 = runOrder(runBundle),
    effectIconPreviewElementPath = runBundle.properties?.entityLabels || {};
  lightStatisticsEntityCountElement.textContent = qa4.length + " 个";
  const mappedItemsRecord = qa4.map((mappedItemsName, mappedItemsKey) => {
    const effectIconPreviewElementText =
        runPortion("light-statistics").find(
          (effectIconNameState: any) => effectIconNameState.entityId === mappedItemsName,
        ) || null,
      xE2 = runRange(mappedItemsName, effectIconPreviewElementText),
      effectIconPreviewElementElement = document.createElement("div");
    effectIconPreviewElementElement.className =
      "light-statistics-entity-row " + xE2.tone + (effectIconPreviewElementText ? "" : " missing");
    const effectIconPreviewElementPanel = document.createElement("div"),
      effectIconPreviewElementSection = document.createElement("strong");
    effectIconPreviewElementSection.textContent = effectIconPreviewElementText
      ? runSnapshot(effectIconPreviewElementText)
      : effectIconPreviewElementPath[String(mappedItemsName)] || mappedItemsName;
    const effectIconValueElement = document.createElement("small");
    ((effectIconValueElement.textContent = mappedItemsName + " · " + xE2.label),
      effectIconPreviewElementPanel.append(
        effectIconPreviewElementSection,
        effectIconValueElement,
      ));
    const effectIconPreviewElementCard = document.createElement("span");
    effectIconPreviewElementCard.className = "light-statistics-entity-actions";
    const effectIconLabelElementElement = document.createElement("button");
    ((effectIconLabelElementElement.type = "button"),
      (effectIconLabelElementElement.dataset.lightStatisticsReplaceIndex = String(mappedItemsKey)),
      (effectIconLabelElementElement.textContent = "更换"));
    const effectIconUrlElement = document.createElement("button");
    return (
      (effectIconUrlElement.type = "button"),
      (effectIconUrlElement.dataset.lightStatisticsRemoveIndex = String(mappedItemsKey)),
      (effectIconUrlElement.textContent = "删除"),
      effectIconPreviewElementCard.append(effectIconLabelElementElement, effectIconUrlElement),
      effectIconPreviewElementElement.append(
        effectIconPreviewElementPanel,
        effectIconPreviewElementCard,
      ),
      effectIconPreviewElementElement
    );
  });
  lightStatisticsEntityListElement.replaceChildren(...mappedItemsRecord);
}
function runGroup(runPair: any, runBatch: any[] = []) {
  for (const effectIconLabelElementState of runPair || [])
    (runBatch.push(effectIconLabelElementState),
      runGroup(effectIconLabelElementState.children, runBatch));
  return runBatch;
}
function runChunk(runBlock = currentPage()) {
  if (!runBlock || !editorCtx.activeProject?.document) return [];
  const mappedItemById = new Map(
      (editorCtx.activeProject.document.sharedComponents || []).map((mappedItemsPath: any) => [
        mappedItemsPath.id,
        mappedItemsPath,
      ]),
    ),
    mappedItemsText = (runBlock.sharedComponentIds || [])
      .map((mappedItemsCount: any) => mappedItemById.get(mappedItemsCount))
      .filter(Boolean);
  return runGroup([...(runBlock.components || []), ...mappedItemsText]);
}
function runSegment(runSlice = currentPage()) {
  return runChunk(runSlice).some(
    (effectIconLabelElementValue) => effectIconLabelElementValue.type === "icon-button-effect",
  )
    ? [createIconVisibilityVirtualEntity2(runSlice?.path)]
    : [];
}
function runPortion(runExtra = "image") {
  return runExtra === "scene-mode" ? editorCtx.entities : [...editorCtx.entities, ...runSegment()];
}
const effectIconLabelElementById = new WeakMap(),
  effectIconLabelElementByIdById = new WeakMap(),
  effectIconLabelState =
    "[data-overflow-scroll-preview], .inspector-picker-value, .inspector-entity-name-line";
function runAlt(effectIconLabelElementPanel: any, runAux: any) {
  const iconButtonFollowsEntity = (Array.isArray(runAux) ? runAux : [runAux]).filter(Boolean);
  for (const effectIconLabelElementSection of iconButtonFollowsEntity)
    effectIconLabelElementSection.dataset.overflowScrollPreview = "true";
  effectIconLabelElementPanel &&
    iconButtonFollowsEntity.length &&
    ((effectIconLabelElementPanel.dataset.overflowScrollPreviewRow = "true"),
    effectIconLabelElementByIdById.set(effectIconLabelElementPanel, iconButtonFollowsEntity));
}
function runVariant(runVersion: any) {
  const effectIconLabelElementConfig = runVersion.closest?.(effectIconLabelState);
  if (effectIconLabelElementConfig) return effectIconLabelElementConfig;
  const effectIconLabelElementRef = runVersion.closest?.("[data-overflow-scroll-preview-row]");
  return effectIconLabelElementByIdById.get(effectIconLabelElementRef)?.[0] || null;
}
function runCopy(runAlias: any) {
  return runAlias?.closest?.("[data-overflow-scroll-preview-row]") || runAlias;
}
function runStandin(effectIconLabelElementCard: any) {
  const effectIconLabelElement = effectIconLabelElementById.get(effectIconLabelElementCard);
  (effectIconLabelElement &&
    (window.clearTimeout(effectIconLabelElement.timer),
    window.cancelAnimationFrame(effectIconLabelElement.frame),
    effectIconLabelElementById.delete(effectIconLabelElementCard)),
    (effectIconLabelElementCard.scrollLeft = 0),
    effectIconLabelElementCard.classList.remove("hover-scrolling"));
}
function runFallback(effectIconUrlElementElement: any) {
  if (!effectIconUrlElementElement) return null;
  let effectIconUrl = effectIconUrlElementElement.querySelector(".inspector-picker-value");
  return (
    effectIconUrl ||
      ((effectIconUrl = document.createElement("span")),
      (effectIconUrl.className = "inspector-picker-value"),
      (effectIconUrl.textContent = effectIconUrlElementElement.textContent.trim()),
      effectIconUrlElementElement.replaceChildren(effectIconUrl)),
    runAlt(effectIconUrlElementElement, effectIconUrl),
    effectIconUrl
  );
}
function runBackup(runSpare: any, runSecondary: any, renderIconButtonIconPreview = "") {
  const dw2 = runFallback(runSpare);
  dw2 &&
    ((dw2.textContent = runSecondary),
    (dw2.title = renderIconButtonIconPreview || runSecondary),
    (runSpare.title = renderIconButtonIconPreview || runSecondary));
}
(document.addEventListener("pointerover", (iconButtonIconName) => {
  const sw2 = runVariant(iconButtonIconName.target),
    cw2 = runCopy(sw2),
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
        runStandin(sw2);
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
    const sw3 = runVariant(iconButtonIconValueEntry.target),
      cw3 = runCopy(sw3),
      iconButtonFollowsEntityState =
        iconButtonIconValueEntry.relatedTarget instanceof Node &&
        cw3?.contains(iconButtonIconValueEntry.relatedTarget);
    !sw3 || iconButtonFollowsEntityState || runStandin(sw3);
  }));
function runPrimary(iconButtonFollowsEntityElement: any, runTertiary: any) {
  ((iconButtonFollowsEntityElement.hidden = true),
    runTertiary.setAttribute("aria-expanded", "false"),
    iconButtonFollowsEntityElement === imageAssetMenuElement &&
      (hideAssetLargePreview(),
      runState(customSelectsBySelectElement.get(imageAssetFolderSelectElement))),
    iconButtonFollowsEntityElement === ibeAssetMenuElement &&
      (hideAssetLargePreview(), runState(customSelectsBySelectElement.get(ibeAssetFolderElement))));
}
function runShadow(runMirror: any = null) {
  if (
    (runMirror !== "entity" && runPrimary(imageEntityMenuElement, imageEntityButtonElement),
    runMirror !== "weather-entity" &&
      runPrimary(weatherEntityMenuElement, weatherEntityButtonElement),
    runMirror !== "line-chart-entity" &&
      runPrimary(lineChartEntityMenuElement, lineChartEntityButtonElement),
    runMirror !== "ibe-entity" && runPrimary(ibeEntityMenuElement, ibeEntityButtonElement),
    runMirror !== "icon-button-entity" &&
      runPrimary(iconButtonEntityMenuElement, iconButtonEntityButtonElement),
    runMirror !== "vacuum-map-entity" &&
      runPrimary(vacuumMapEntityMenuElement, vacuumMapEntityButtonElement),
    runMirror !== "camera-entity" && runPrimary(cameraEntityMenuElement, cameraEntityButtonElement),
    runMirror !== "air-conditioner-entity" &&
      runPrimary(airConditionerEntityMenuElement, airConditionerEntityButtonElement),
    runMirror !== "title-button-entity" &&
      runPrimary(titleButtonEntityMenuElement, titleButtonEntityButtonElement),
    runMirror !== "light-statistics-entity")
  ) {
    const isIconButtonFollowsEntity = !lightStatisticsEntityMenuElement.hidden;
    (runPrimary(lightStatisticsEntityMenuElement, lightStatisticsEntityButtonElement),
      isIconButtonFollowsEntity && runLimit());
  }
  (runMirror !== "light-statistics-action-entity" &&
    runPrimary(lightStatisticsActionEntityMenuElement, lightStatisticsActionEntityButtonElement),
    runMirror !== "navigation-entity" &&
      runPrimary(navigationEntityMenuElement, navigationEntityButtonElement),
    runMirror !== "asset" && runPrimary(imageAssetMenuElement, imageAssetButtonElement),
    runMirror !== "ibe-asset" && runPrimary(ibeAssetMenuElement, ibeAssetButtonElement),
    runMirror !== "ibe-icon" && runPrimary(ibeIconMenuElement, ibeIconButtonElement),
    runMirror !== "icon-button-icon" &&
      runPrimary(iconButtonIconMenuElement, iconButtonIconButtonElement),
    runMirror !== "title-button-icon" &&
      runPrimary(titleButtonIconMenuElement, titleButtonIconButtonElement),
    runMirror !== "light-statistics-icon" &&
      runPrimary(lightStatisticsIconMenuElement, lightStatisticsIconButtonElement),
    runMirror !== "navigation-icon" &&
      runPrimary(navigationIconMenuElement, navigationIconButtonElement));
}
function runDual(runTwin: any) {
  const replace = String(runTwin || "")
    .trim()
    .replace(/^mdi:/, "");
  return /^[a-z0-9-]+$/.test(replace)
    ? "/static/vendor/mdi/7.4.47/svg/" + replace + ".svg"
    : "";
}
function runClone(runBranch: any) {
  const iconButtonIconPreviewElement = String(runBranch || ""),
    iconButtonIconLabelElement = navigationIconButtonElement.querySelector("i"),
    iconButtonIconUrl = navigationIconButtonElement.querySelector("span"),
    zi2 = runDual(iconButtonIconPreviewElement);
  ((iconButtonIconLabelElement.hidden = !zi2),
    (iconButtonIconLabelElement.style.maskImage = zi2 ? 'url("' + zi2 + '")' : ""),
    (iconButtonIconLabelElement.style.webkitMaskImage = zi2 ? 'url("' + zi2 + '")' : ""),
    (iconButtonIconUrl.textContent = iconButtonIconPreviewElement || "不使用图标"),
    (navigationIconCopyElement.disabled = !iconButtonIconPreviewElement),
    (navigationIconCopyElement.title = iconButtonIconPreviewElement
      ? "复制 " + iconButtonIconPreviewElement
      : "当前未使用图标"));
}
function renderTitleButtonIconPreview(titleButtonIconName: any) {
  const effectIconValueValue = String(titleButtonIconName || ""),
    effectIconPreviewElementBar = ibeIconButtonElement.querySelector("i"),
    titleButtonIconValue = ibeIconButtonElement.querySelector("span"),
    zi3 = runDual(effectIconValueValue);
  ((effectIconPreviewElementBar.hidden = !zi3),
    (effectIconPreviewElementBar.style.maskImage = zi3 ? 'url("' + zi3 + '")' : ""),
    (effectIconPreviewElementBar.style.webkitMaskImage = zi3 ? 'url("' + zi3 + '")' : ""),
    (titleButtonIconValue.textContent = effectIconValueValue || "不使用图标"),
    (ibeIconCopyElement.disabled = !effectIconValueValue),
    (ibeIconCopyElement.title = effectIconValueValue
      ? "复制 " + effectIconValueValue
      : "当前未使用图标"));
}
function runSplit(runSibling: any) {
  const titleIconPreviewElement = String(runSibling || ""),
    includes = ["device-button", "presence-sensor"].includes(removedComponent()?.type),
    titleIconLabelElement = iconButtonIconButtonElement.querySelector("i"),
    titleIconUrl = iconButtonIconButtonElement.querySelector("span"),
    zi4 = runDual(titleIconPreviewElement);
  ((titleIconLabelElement.hidden = !zi4),
    (titleIconLabelElement.style.maskImage = zi4 ? 'url("' + zi4 + '")' : ""),
    (titleIconLabelElement.style.webkitMaskImage = zi4 ? 'url("' + zi4 + '")' : ""),
    (titleIconUrl.textContent =
      titleIconPreviewElement || (includes ? "跟随实体图标" : "不使用图标")),
    (iconButtonIconCopyElement.disabled = !titleIconPreviewElement),
    (iconButtonIconCopyElement.title = titleIconPreviewElement
      ? "复制 " + titleIconPreviewElement
      : "当前未使用图标"));
}
function renderLightStatisticsIconPreview(runPeer: any) {
  const titleButtonIconValueState = String(runPeer || ""),
    titleIconPreviewElementElement = titleButtonIconButtonElement.querySelector("i"),
    statisticsIconValue = titleButtonIconButtonElement.querySelector("span"),
    zi5 = runDual(titleButtonIconValueState);
  ((titleIconPreviewElementElement.hidden = !zi5),
    (titleIconPreviewElementElement.style.maskImage = zi5 ? 'url("' + zi5 + '")' : ""),
    (titleIconPreviewElementElement.style.webkitMaskImage = zi5 ? 'url("' + zi5 + '")' : ""),
    (statisticsIconValue.textContent = titleButtonIconValueState || "不使用图标"),
    (titleButtonIconCopyElement.disabled = !titleButtonIconValueState),
    (titleButtonIconCopyElement.title = titleButtonIconValueState
      ? "复制 " + titleButtonIconValueState
      : "当前未使用图标"));
}
function runLocal(runInner: any) {
  const statisticsIconPreviewElement = String(runInner ?? "mdi:lightbulb-group-outline"),
    statisticsIconLabelElement = lightStatisticsIconButtonElement.querySelector("i"),
    statisticsIconUrl = lightStatisticsIconButtonElement.querySelector("span"),
    zi6 = runDual(statisticsIconPreviewElement);
  ((statisticsIconLabelElement.hidden = !zi6),
    (statisticsIconLabelElement.style.maskImage = zi6 ? 'url("' + zi6 + '")' : ""),
    (statisticsIconLabelElement.style.webkitMaskImage = zi6 ? 'url("' + zi6 + '")' : ""),
    (statisticsIconUrl.textContent = statisticsIconPreviewElement || "不使用图标"),
    (lightStatisticsIconCopyElement.disabled = !statisticsIconPreviewElement),
    (lightStatisticsIconCopyElement.title = statisticsIconPreviewElement
      ? "复制 " + statisticsIconPreviewElement
      : "当前未使用图标"));
}
async function copyTextToClipboard(clipboardText: any) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(clipboardText);
    return;
  }
  const clipboardTextAreaElement = document.createElement("textarea");
  ((clipboardTextAreaElement.value = clipboardText),
    clipboardTextAreaElement.setAttribute("readonly", ""),
    (clipboardTextAreaElement.style.position = "fixed"),
    (clipboardTextAreaElement.style.opacity = "0"),
    document.body.append(clipboardTextAreaElement),
    clipboardTextAreaElement.select());
  const execCommand = document.execCommand("copy");
  if ((clipboardTextAreaElement.remove(), !execCommand)) throw new Error("复制失败。");
}
function enhanceEntityCopyButton(
  copyButtonHostElement: any,
  entityIdGetter = () => copyButtonHostElement.dataset.entityId || "",
) {
  if (!copyButtonHostElement || copyButtonHostElement.dataset.entityCopyReady === "true")
    return copyButtonHostElement._entityCopySync;
  runFallback(copyButtonHostElement);
  const entityCopyRowElement = document.createElement("div");
  entityCopyRowElement.className = "entity-picker-field-row";
  const entityCopyButtonElement = document.createElement("button");
  ((entityCopyButtonElement.type = "button"),
    (entityCopyButtonElement.className = "navigation-icon-copy entity-picker-copy"),
    (entityCopyButtonElement.title = "复制实体 ID"),
    entityCopyButtonElement.setAttribute("aria-label", "复制实体 ID"),
    (entityCopyButtonElement.disabled = true),
    (entityCopyButtonElement.innerHTML =
      '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="8" height="8" rx="1.3"></rect><path d="M10.5 5V3.5A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9A1.5 1.5 0 0 0 3.5 10.5H5"></path></svg><span aria-hidden="true">✓</span>'));
  const syncEntityCopyButton = () => {
    const currentEntityId = String(entityIdGetter() || "");
    ((entityCopyButtonElement.dataset.entityId = currentEntityId),
      (entityCopyButtonElement.disabled = !currentEntityId),
      (entityCopyButtonElement.title = currentEntityId
        ? "复制 " + currentEntityId
        : "当前未选择实体"));
  };
  return (
    entityCopyButtonElement.addEventListener("click", async (entityCopyClickEvent) => {
      (entityCopyClickEvent.preventDefault(), entityCopyClickEvent.stopPropagation());
      const clickedEntityId = entityCopyButtonElement.dataset.entityId || "";
      if (clickedEntityId)
        try {
          (await copyTextToClipboard(clickedEntityId),
            entityCopyButtonElement.classList.add("copied"),
            window.setTimeout(() => entityCopyButtonElement.classList.remove("copied"), 1000));
        } catch (entityCopyError: any) {
          handleOperationError(entityCopyError);
        }
    }),
    copyButtonHostElement.replaceWith(entityCopyRowElement),
    entityCopyRowElement.append(copyButtonHostElement, entityCopyButtonElement),
    (copyButtonHostElement.dataset.entityCopyReady = "true"),
    (copyButtonHostElement._entityCopySync = syncEntityCopyButton),
    syncEntityCopyButton(),
    syncEntityCopyButton
  );
}
function enhanceEntityCopyButtons() {
  for (const entityButtonId of [
    "image-entity-button",
    "ibe-entity-button",
    "icon-button-entity-button",
    "air-conditioner-entity-button",
    "vacuum-map-entity-button",
    "camera-entity-button",
    "weather-entity-button",
    "line-chart-entity-button",
    "navigation-entity-button",
    "popup-module-entity-button",
  ]) {
    const elementById = document.getElementById(entityButtonId);
    elementById && enhanceEntityCopyButton(elementById);
  }
}
enhanceEntityCopyButtons();
const ICON_PAGE_SIZE = 160,
  iconListStateByElement = new WeakMap();
function runOuter(runUpper: any) {
  let iconTooltipElementState = iconListStateByElement.get(runUpper);
  return (
    iconTooltipElementState ||
      ((iconTooltipElementState = {
        query: "",
        offset: 0,
        total: 0,
        loading: false,
        complete: false,
        generation: 0,
      }),
      iconListStateByElement.set(runUpper, iconTooltipElementState)),
    iconTooltipElementState
  );
}
function runLower() {
  (editorCtx.iconTooltipElement?.remove(), (editorCtx.iconTooltipElement = null));
}
function runLeft(iconTooltipElementElement: any, runRight: any) {
  runLower();
  const iconTooltipElementPanel = iconTooltipElementElement.closest("dialog");
  if (!iconTooltipElementPanel?.open || !runRight) return;
  const iconTooltipElementSection = document.createElement("div");
  ((iconTooltipElementSection.className = "editor-icon-name-tooltip"),
    (iconTooltipElementSection.textContent = runRight),
    iconTooltipElementPanel.append(iconTooltipElementSection));
  const targetBounds = iconTooltipElementElement.getBoundingClientRect(),
    targetBoundsState = iconTooltipElementSection.getBoundingClientRect(),
    clampedUpper = Math.min(
      window.innerWidth - targetBoundsState.width - 8,
      Math.max(8, targetBounds.left + (targetBounds.width - targetBoundsState.width) / 2),
    );
  let measuredBounds = targetBounds.top - targetBoundsState.height - 8;
  (measuredBounds < 8 && (measuredBounds = targetBounds.bottom + 8),
    (iconTooltipElementSection.style.left = clampedUpper + "px"),
    (iconTooltipElementSection.style.top = measuredBounds + "px"),
    (editorCtx.iconTooltipElement = iconTooltipElementSection));
}
function runFirst(runSecond: any, runThird: any) {
  (runSecond.addEventListener("pointerenter", () => runLeft(runSecond, runThird)),
    runSecond.addEventListener("pointerleave", runLower),
    runSecond.addEventListener("focus", () => runLeft(runSecond, runThird)),
    runSecond.addEventListener("blur", runLower));
}
function runLast(iconTooltipElementList: any, runPrev: any) {
  iconTooltipElementList.addEventListener("scroll", () => {
    iconTooltipElementList.scrollHeight -
      iconTooltipElementList.scrollTop -
      iconTooltipElementList.clientHeight >
      120 || runPrev().catch(handleOperationError);
  });
}
async function iconTooltipElementCount(
  iconTooltipElementIndex = "",
  { append: iconTooltipElementTotal = false } = {},
) {
  return iconTooltipElementValue({
    optionsElement: navigationIconOptionsElement,
    query: iconTooltipElementIndex,
    currentIcon: removedComponent()?.properties?.icon || "",
    append: iconTooltipElementTotal,
  });
}
async function iconTooltipElementFlag(
  iconTooltipElementSlot = "",
  { append: iconTooltipElementCase = false } = {},
) {
  return iconTooltipElementValue({
    optionsElement: ibeIconOptionsElement,
    query: iconTooltipElementSlot,
    currentIcon: removedComponent()?.properties?.icon || "",
    append: iconTooltipElementCase,
  });
}
async function iconTooltipElementStep(
  iconTooltipElementPhase = "",
  { append: iconTooltipElementView = false } = {},
) {
  const createdInstanceValue = removedComponent();
  return iconTooltipElementValue({
    optionsElement: iconButtonIconOptionsElement,
    query: iconTooltipElementPhase,
    currentIcon: createdInstanceValue?.properties?.icon || "",
    clearLabel: createdInstanceValue?.type === "device-button" ? "跟随实体图标" : "不使用图标",
    append: iconTooltipElementView,
  });
}
async function iconTooltipElementStore(
  iconTooltipElementCache = "",
  { append: iconTooltipElementQueue = false } = {},
) {
  return iconTooltipElementValue({
    optionsElement: titleButtonIconOptionsElement,
    query: iconTooltipElementCache,
    currentIcon: removedComponent()?.properties?.icon || "",
    append: iconTooltipElementQueue,
  });
}
async function iconTooltipElementBuffer(
  iconTooltipElementCursor = "",
  { append: iconTooltipElementPointer = false } = {},
) {
  const availableProperties = removedComponent()?.properties || {},
    iconTooltipElementTarget = String(
      Object.hasOwn(availableProperties, "icon")
        ? availableProperties.icon || ""
        : "mdi:lightbulb-group-outline",
    );
  return iconTooltipElementValue({
    optionsElement: lightStatisticsIconOptionsElement,
    query: iconTooltipElementCursor,
    currentIcon: iconTooltipElementTarget,
    datasetKey: "lightStatisticsIconName",
    append: iconTooltipElementPointer,
  });
}
(runLast(navigationIconOptionsElement, () =>
  iconTooltipElementCount(navigationIconSearchElement.value, {
    append: true,
  }),
),
  runLast(ibeIconOptionsElement, () =>
    iconTooltipElementFlag(ibeIconSearchElement.value, {
      append: true,
    }),
  ),
  runLast(iconButtonIconOptionsElement, () =>
    iconTooltipElementStep(iconButtonIconSearchElement.value, {
      append: true,
    }),
  ),
  runLast(titleButtonIconOptionsElement, () =>
    iconTooltipElementStore(titleButtonIconSearchElement.value, {
      append: true,
    }),
  ),
  runLast(lightStatisticsIconOptionsElement, () =>
    iconTooltipElementBuffer(lightStatisticsIconSearchElement.value, {
      append: true,
    }),
  ));
function runNext() {
  if (navigationIconMenuElement.hidden) return;
  const parentBounds = navigationIconButtonElement.parentElement.getBoundingClientRect(),
    iconTooltipState = 5,
    iconTooltipStateState = 8,
    availableSize =
      window.innerHeight - parentBounds.bottom - iconTooltipState - iconTooltipStateState,
    measuredBoundsState = parentBounds.top - iconTooltipState - iconTooltipStateState,
    iconTooltipElementSource = availableSize >= 250 || availableSize >= measuredBoundsState,
    clampedLower = Math.max(
      150,
      Math.min(390, iconTooltipElementSource ? availableSize : measuredBoundsState),
    );
  ((navigationIconMenuElement.style.left =
    clampNumber2(
      parentBounds.left,
      iconTooltipStateState,
      Math.max(
        iconTooltipStateState,
        window.innerWidth - parentBounds.width - iconTooltipStateState,
      ),
    ) + "px"),
    (navigationIconMenuElement.style.top = iconTooltipElementSource
      ? parentBounds.bottom + iconTooltipState + "px"
      : Math.max(iconTooltipStateState, parentBounds.top - clampedLower - iconTooltipState) + "px"),
    (navigationIconMenuElement.style.width = parentBounds.width + "px"),
    (navigationIconMenuElement.style.maxHeight = clampedLower + "px"),
    (navigationIconOptionsElement.style.maxHeight = Math.max(90, clampedLower - 57) + "px"));
}
function runOld() {
  if (ibeIconMenuElement.hidden) return;
  const parentBoundsState = ibeIconButtonElement.parentElement.getBoundingClientRect(),
    iconTooltipStateValue = 5,
    iconTooltipStateConfig = 8,
    availableSizeState =
      window.innerHeight -
      parentBoundsState.bottom -
      iconTooltipStateValue -
      iconTooltipStateConfig,
    measuredBoundsValue = parentBoundsState.top - iconTooltipStateValue - iconTooltipStateConfig,
    iconTooltipElementOrigin =
      availableSizeState >= 250 || availableSizeState >= measuredBoundsValue,
    clampedLowerState = Math.max(
      150,
      Math.min(390, iconTooltipElementOrigin ? availableSizeState : measuredBoundsValue),
    );
  ((ibeIconMenuElement.style.left =
    clampNumber2(
      parentBoundsState.left,
      iconTooltipStateConfig,
      Math.max(
        iconTooltipStateConfig,
        window.innerWidth - parentBoundsState.width - iconTooltipStateConfig,
      ),
    ) + "px"),
    (ibeIconMenuElement.style.top = iconTooltipElementOrigin
      ? parentBoundsState.bottom + iconTooltipStateValue + "px"
      : Math.max(
          iconTooltipStateConfig,
          parentBoundsState.top - clampedLowerState - iconTooltipStateValue,
        ) + "px"),
    (ibeIconMenuElement.style.width = parentBoundsState.width + "px"),
    (ibeIconMenuElement.style.maxHeight = clampedLowerState + "px"),
    (ibeIconOptionsElement.style.maxHeight = Math.max(90, clampedLowerState - 57) + "px"));
}
function runNew() {
  if (iconButtonIconMenuElement.hidden) return;
  const parentBoundsValue = iconButtonIconButtonElement.parentElement.getBoundingClientRect(),
    iconTooltipStateRef = 5,
    iconTooltipStateEntry = 8,
    availableSizeValue =
      window.innerHeight - parentBoundsValue.bottom - iconTooltipStateRef - iconTooltipStateEntry,
    measuredBoundsConfig = parentBoundsValue.top - iconTooltipStateRef - iconTooltipStateEntry,
    iconTooltipElementDraft =
      availableSizeValue >= 250 || availableSizeValue >= measuredBoundsConfig,
    clampedLowerValue = Math.max(
      150,
      Math.min(390, iconTooltipElementDraft ? availableSizeValue : measuredBoundsConfig),
    );
  ((iconButtonIconMenuElement.style.left =
    clampNumber2(
      parentBoundsValue.left,
      iconTooltipStateEntry,
      Math.max(
        iconTooltipStateEntry,
        window.innerWidth - parentBoundsValue.width - iconTooltipStateEntry,
      ),
    ) + "px"),
    (iconButtonIconMenuElement.style.top = iconTooltipElementDraft
      ? parentBoundsValue.bottom + iconTooltipStateRef + "px"
      : Math.max(
          iconTooltipStateEntry,
          parentBoundsValue.top - clampedLowerValue - iconTooltipStateRef,
        ) + "px"),
    (iconButtonIconMenuElement.style.width = parentBoundsValue.width + "px"),
    (iconButtonIconMenuElement.style.maxHeight = clampedLowerValue + "px"),
    (iconButtonIconOptionsElement.style.maxHeight = Math.max(90, clampedLowerValue - 57) + "px"));
}
function runShort() {
  if (titleButtonIconMenuElement.hidden) return;
  const parentBoundsConfig = titleButtonIconButtonElement.parentElement.getBoundingClientRect(),
    relatedPopupState = 5,
    relatedPopupStateState = 8,
    availableSizeConfig =
      window.innerHeight - parentBoundsConfig.bottom - relatedPopupState - relatedPopupStateState,
    measuredBoundsRef = parentBoundsConfig.top - relatedPopupState - relatedPopupStateState,
    relatedPopupElementState =
      availableSizeConfig >= 250 || availableSizeConfig >= measuredBoundsRef,
    clampedLowerConfig = Math.max(
      150,
      Math.min(390, relatedPopupElementState ? availableSizeConfig : measuredBoundsRef),
    );
  ((titleButtonIconMenuElement.style.left =
    clampNumber2(
      parentBoundsConfig.left,
      relatedPopupStateState,
      Math.max(
        relatedPopupStateState,
        window.innerWidth - parentBoundsConfig.width - relatedPopupStateState,
      ),
    ) + "px"),
    (titleButtonIconMenuElement.style.top = relatedPopupElementState
      ? parentBoundsConfig.bottom + relatedPopupState + "px"
      : Math.max(
          relatedPopupStateState,
          parentBoundsConfig.top - clampedLowerConfig - relatedPopupState,
        ) + "px"),
    (titleButtonIconMenuElement.style.width = parentBoundsConfig.width + "px"),
    (titleButtonIconMenuElement.style.maxHeight = clampedLowerConfig + "px"),
    (titleButtonIconOptionsElement.style.maxHeight = Math.max(90, clampedLowerConfig - 57) + "px"));
}
function runLong() {
  if (lightStatisticsIconMenuElement.hidden) return;
  const parentBoundsRef = lightStatisticsIconButtonElement.parentElement.getBoundingClientRect(),
    relatedPopupStateValue = 5,
    relatedPopupStateConfig = 8,
    availableSizeRef =
      window.innerHeight -
      parentBoundsRef.bottom -
      relatedPopupStateValue -
      relatedPopupStateConfig,
    measuredBoundsEntry = parentBoundsRef.top - relatedPopupStateValue - relatedPopupStateConfig,
    relatedPopupElementValue = availableSizeRef >= 250 || availableSizeRef >= measuredBoundsEntry,
    clampedLowerRef = Math.max(
      150,
      Math.min(390, relatedPopupElementValue ? availableSizeRef : measuredBoundsEntry),
    );
  ((lightStatisticsIconMenuElement.style.left =
    clampNumber2(
      parentBoundsRef.left,
      relatedPopupStateConfig,
      Math.max(
        relatedPopupStateConfig,
        window.innerWidth - parentBoundsRef.width - relatedPopupStateConfig,
      ),
    ) + "px"),
    (lightStatisticsIconMenuElement.style.top = relatedPopupElementValue
      ? parentBoundsRef.bottom + relatedPopupStateValue + "px"
      : Math.max(
          relatedPopupStateConfig,
          parentBoundsRef.top - clampedLowerRef - relatedPopupStateValue,
        ) + "px"),
    (lightStatisticsIconMenuElement.style.width = parentBoundsRef.width + "px"),
    (lightStatisticsIconMenuElement.style.maxHeight = clampedLowerRef + "px"),
    (lightStatisticsIconOptionsElement.style.maxHeight =
      Math.max(90, clampedLowerRef - 57) + "px"));
}
function runExtraExtra() {
  if (lightStatisticsEntityMenuElement.hidden) return;
  const targetBoundsValue = lightStatisticsEntityButtonElement.getBoundingClientRect(),
    relatedPopupStateRef = 5,
    relatedPopupStateEntry = 8,
    availableSizeEntry = Math.min(
      targetBoundsValue.width,
      window.innerWidth - relatedPopupStateEntry * 2,
    ),
    availableSizeRecord =
      window.innerHeight - targetBoundsValue.bottom - relatedPopupStateRef - relatedPopupStateEntry,
    measuredBoundsRecord = targetBoundsValue.top - relatedPopupStateRef - relatedPopupStateEntry,
    relatedPopupElementConfig =
      availableSizeRecord >= 250 || availableSizeRecord >= measuredBoundsRecord,
    clampedLowerEntry = Math.max(
      150,
      Math.min(430, relatedPopupElementConfig ? availableSizeRecord : measuredBoundsRecord),
    );
  ((lightStatisticsEntityMenuElement.style.left =
    clampNumber2(
      targetBoundsValue.left,
      relatedPopupStateEntry,
      Math.max(
        relatedPopupStateEntry,
        window.innerWidth - availableSizeEntry - relatedPopupStateEntry,
      ),
    ) + "px"),
    (lightStatisticsEntityMenuElement.style.top = relatedPopupElementConfig
      ? targetBoundsValue.bottom + relatedPopupStateRef + "px"
      : Math.max(
          relatedPopupStateEntry,
          targetBoundsValue.top - clampedLowerEntry - relatedPopupStateRef,
        ) + "px"),
    (lightStatisticsEntityMenuElement.style.width = availableSizeEntry + "px"),
    (lightStatisticsEntityMenuElement.style.maxHeight = clampedLowerEntry + "px"),
    (lightStatisticsEntityOptionsElement.style.maxHeight =
      Math.max(90, clampedLowerEntry - 58) + "px"));
}
function runExtraAlt(runExtraAux = "image") {
  return runExtraAux === "light-statistics"
    ? {
        componentType: runExtraAux,
        button: lightStatisticsActionEntityButtonElement,
        menu: lightStatisticsActionEntityMenuElement,
        search: lightStatisticsActionEntitySearchElement,
        options: lightStatisticsActionEntityOptionsElement,
        except: "light-statistics-action-entity",
        relatedSettings: false,
        recommended: (relatedPopupElementRef: any) =>
          TOGGLE_ENTITY_DOMAINS2.has(renderNavigationIconPreview(relatedPopupElementRef)) ? 2 : 0,
      }
    : ["navigation-button", "scene-mode"].includes(runExtraAux)
      ? {
          componentType: runExtraAux,
          button: navigationEntityButtonElement,
          menu: navigationEntityMenuElement,
          search: navigationEntitySearchElement,
          options: navigationEntityOptionsElement,
          except: "navigation-entity",
          relatedSettings: runExtraAux !== "scene-mode",
          recommended: (relatedPopupElementEntry: any) =>
            relatedPopupElementEntry?.virtual
              ? 3
              : TOGGLE_ENTITY_DOMAINS2.has(renderNavigationIconPreview(relatedPopupElementEntry))
                ? 2
                : 0,
        }
      : runExtraAux === "title-button"
        ? {
            componentType: runExtraAux,
            button: titleButtonEntityButtonElement,
            menu: titleButtonEntityMenuElement,
            search: titleButtonEntitySearchElement,
            options: titleButtonEntityOptionsElement,
            except: "title-button-entity",
            recommended: (relatedPopupElementRecord: any) =>
              relatedPopupElementRecord?.virtual
                ? 3
                : TOGGLE_ENTITY_DOMAINS2.has(renderNavigationIconPreview(relatedPopupElementRecord))
                  ? 2
                  : 0,
          }
        : runExtraAux === "vacuum-map"
          ? {
              componentType: runExtraAux,
              button: vacuumMapEntityButtonElement,
              menu: vacuumMapEntityMenuElement,
              search: vacuumMapEntitySearchElement,
              options: vacuumMapEntityOptionsElement,
              except: "vacuum-map-entity",
              recommended: (relatedPopupElementName: any) =>
                ["camera", "image"].includes(renderNavigationIconPreview(relatedPopupElementName))
                  ? /(?:^|[_.\s-])map(?:$|[_.\s-])|地图/i.test(
                      (relatedPopupElementName.entityId || "") +
                        " " +
                        (relatedPopupElementName.name || ""),
                    )
                    ? 2
                    : 1
                  : 0,
            }
          : runExtraAux === "camera"
            ? {
                componentType: runExtraAux,
                button: cameraEntityButtonElement,
                menu: cameraEntityMenuElement,
                search: cameraEntitySearchElement,
                options: cameraEntityOptionsElement,
                except: "camera-entity",
                recommended: (relatedPopupElementKey: any) =>
                  renderNavigationIconPreview(relatedPopupElementKey) === "camera",
              }
            : runExtraAux === "air-conditioner"
              ? {
                  componentType: runExtraAux,
                  button: airConditionerEntityButtonElement,
                  menu: airConditionerEntityMenuElement,
                  search: airConditionerEntitySearchElement,
                  options: airConditionerEntityOptionsElement,
                  except: "air-conditioner-entity",
                  recommended: (relatedPopupElementPath: any) =>
                    renderNavigationIconPreview(relatedPopupElementPath) === "climate"
                      ? 2
                      : renderNavigationIconPreview(relatedPopupElementPath) === "fan"
                        ? 1
                        : 0,
                }
              : runExtraAux === "device-button"
                ? {
                    componentType: runExtraAux,
                    button: iconButtonEntityButtonElement,
                    menu: iconButtonEntityMenuElement,
                    search: iconButtonEntitySearchElement,
                    options: iconButtonEntityOptionsElement,
                    except: "icon-button-entity",
                    recommended: (relatedPopupElementText: any) =>
                      TOGGLE_ENTITY_DOMAINS2.has(
                        renderNavigationIconPreview(relatedPopupElementText),
                      ),
                  }
                : runExtraAux === "presence-sensor"
                  ? {
                      componentType: runExtraAux,
                      button: iconButtonEntityButtonElement,
                      menu: iconButtonEntityMenuElement,
                      search: iconButtonEntitySearchElement,
                      options: iconButtonEntityOptionsElement,
                      except: "icon-button-entity",
                      recommended: (relatedPopupElementCount: any) => {
                        const relatedPopupElementIndex =
                            (relatedPopupElementCount.entityId || "") +
                            " " +
                            (relatedPopupElementCount.name || "") +
                            " " +
                            (relatedPopupElementCount.originalName || "") +
                            " " +
                            (relatedPopupElementCount.translationKey || ""),
                          relatedPopupElementTotal =
                            removedComponent()?.properties?.sensorKind || "presence",
                          be3 = renderNavigationIconPreview(relatedPopupElementCount);
                        return be3 === "event"
                          ? relatedPopupElementTotal === "presence" &&
                            /motion|occupancy|presence|pir|moving|移动|运动|人体|有人/i.test(
                              relatedPopupElementIndex,
                            )
                            ? 4
                            : 0
                          : be3 !== "binary_sensor"
                            ? 0
                            : relatedPopupElementTotal === "water-leak"
                              ? /moisture|water|leak|flood|wet|水浸|漏水|积水|湿/i.test(
                                  relatedPopupElementIndex,
                                )
                                ? 3
                                : 1
                              : relatedPopupElementTotal === "smoke"
                                ? /smoke|fire|烟雾|烟感|火警/i.test(relatedPopupElementIndex)
                                  ? 3
                                  : 1
                                : relatedPopupElementTotal === "natural-gas"
                                  ? /natural[_ -]?gas|combustible|gas|燃气|天然气|可燃气/i.test(
                                      relatedPopupElementIndex,
                                    )
                                    ? 3
                                    : 1
                                  : relatedPopupElementTotal === "door-window"
                                    ? /door|window|contact|opening|门|窗|接触/i.test(
                                        relatedPopupElementIndex,
                                      )
                                      ? 3
                                      : 1
                                    : /presence|occupancy|人在|有人|存在|人体/i.test(
                                          relatedPopupElementIndex,
                                        )
                                      ? 3
                                      : /motion|移动|运动/i.test(relatedPopupElementIndex)
                                        ? 1
                                        : 2;
                      },
                    }
                  : runExtraAux === "icon-button"
                    ? {
                        componentType: runExtraAux,
                        button: iconButtonEntityButtonElement,
                        menu: iconButtonEntityMenuElement,
                        search: iconButtonEntitySearchElement,
                        options: iconButtonEntityOptionsElement,
                        except: "icon-button-entity",
                        recommended: (relatedPopupElementFlag: any) =>
                          renderNavigationIconPreview(relatedPopupElementFlag) === "light",
                      }
                    : runExtraAux === "icon-button-effect"
                      ? {
                          componentType: runExtraAux,
                          button: ibeEntityButtonElement,
                          menu: ibeEntityMenuElement,
                          search: ibeEntitySearchElement,
                          options: ibeEntityOptionsElement,
                          except: "ibe-entity",
                          recommended: (relatedPopupElementSlot: any) =>
                            renderNavigationIconPreview(relatedPopupElementSlot) === "light",
                        }
                      : runExtraAux === "weather"
                        ? {
                            componentType: runExtraAux,
                            button: weatherEntityButtonElement,
                            menu: weatherEntityMenuElement,
                            search: weatherEntitySearchElement,
                            options: weatherEntityOptionsElement,
                            except: "weather-entity",
                            recommended: (relatedPopupElementCase: any) =>
                              renderNavigationIconPreview(relatedPopupElementCase) === "weather",
                          }
                        : runExtraAux === "line-chart"
                          ? {
                              componentType: runExtraAux,
                              button: lineChartEntityButtonElement,
                              menu: lineChartEntityMenuElement,
                              search: lineChartEntitySearchInputElement,
                              options: lineChartEntityOptionsElement,
                              except: "line-chart-entity",
                              recommended: (relatedPopupElementStep: any) =>
                                renderNavigationIconPreview(relatedPopupElementStep) === "sensor",
                            }
                          : {
                              componentType: "image",
                              button: imageEntityButtonElement,
                              menu: imageEntityMenuElement,
                              search: imageEntitySearchElement,
                              options: imageEntityOptionsElement,
                              except: "entity",
                              recommended: (relatedPopupElementPhase: any) =>
                                ["image", "camera"].includes(
                                  renderNavigationIconPreview(relatedPopupElementPhase),
                                ),
                            };
}
function runExtraVariant(runExtraCopy = "", runExtraAlias = "image") {
  const ao2 = runExtraAlt(runExtraAlias),
    relatedPopupElementView = removedComponent()?.bindings?.entity?.entityId || "",
    relatedPopupElementStore = runExtraCopy.trim().toLocaleLowerCase("zh-CN"),
    relatedPopupElementCache = runPortion(runExtraAlias)
      .map((mappedItemsFlag: any, mappedItemsSlot: any) => ({
        entity: mappedItemsFlag,
        index: mappedItemsSlot,
      }))
      .filter(
        ({ entity: relatedPopupElementQueue }: any) =>
          !relatedPopupElementStore ||
          (
            runMode(relatedPopupElementQueue) +
            " " +
            renderNavigationIconPreview(relatedPopupElementQueue)
          )
            .toLocaleLowerCase("zh-CN")
            .includes(relatedPopupElementStore),
      )
      .sort((relatedPopupElementBuffer: any, relatedPopupElementCursor: any) => {
        const relatedPopupElementHandler = (relatedPopupElementPointer: any) =>
          relatedPopupElementPointer?.virtual
            ? 100
            : Number(ao2.recommended(relatedPopupElementPointer));
        return (
          relatedPopupElementHandler(relatedPopupElementCursor.entity) -
            relatedPopupElementHandler(relatedPopupElementBuffer.entity) ||
          relatedPopupElementBuffer.index - relatedPopupElementCursor.index
        );
      })
      .map(({ entity: mappedItemsCase }: any) => mappedItemsCase),
    relatedPopupElementElement = document.createElement("button");
  ((relatedPopupElementElement.type = "button"),
    (relatedPopupElementElement.className =
      "inspector-entity-option inspector-entity-clear" +
      (relatedPopupElementView ? "" : " selected")),
    (relatedPopupElementElement.dataset.entityId = ""),
    relatedPopupElementElement.setAttribute("role", "option"),
    relatedPopupElementElement.setAttribute("aria-selected", String(!relatedPopupElementView)),
    (relatedPopupElementElement.textContent = "不使用实体"));
  const mappedItemsStep = relatedPopupElementCache.map((mappedItemsPhase: any) => {
      const relatedPopupElementPanel = document.createElement("button");
      ((relatedPopupElementPanel.type = "button"),
        (relatedPopupElementPanel.className =
          "inspector-entity-option" +
          (mappedItemsPhase.entityId === relatedPopupElementView ? " selected" : "")),
        (relatedPopupElementPanel.dataset.entityId = mappedItemsPhase.entityId),
        relatedPopupElementPanel.setAttribute("role", "option"),
        relatedPopupElementPanel.setAttribute(
          "aria-selected",
          String(mappedItemsPhase.entityId === relatedPopupElementView),
        ));
      const relatedPopupElementSection = document.createElement("span");
      ((relatedPopupElementSection.className = "inspector-entity-option-content"),
        (relatedPopupElementSection.title = runMode(mappedItemsPhase)));
      const relatedPopupElementCard = document.createElement("span");
      relatedPopupElementCard.className = "inspector-entity-option-line inspector-entity-name-line";
      const relatedPopupElementBar = document.createElement("span");
      ((relatedPopupElementBar.className = "inspector-entity-kind"),
        (relatedPopupElementBar.textContent = "[" + runQueue(mappedItemsPhase) + "] "));
      const relatedPopupElementList = document.createElement("span");
      ((relatedPopupElementList.className = "inspector-entity-name"),
        (relatedPopupElementList.textContent = runSnapshot(mappedItemsPhase)),
        relatedPopupElementCard.append(relatedPopupElementBar, relatedPopupElementList));
      const relatedPopupElementRow = document.createElement("span");
      return (
        (relatedPopupElementRow.className = "inspector-entity-option-line inspector-entity-id"),
        (relatedPopupElementRow.textContent = mappedItemsPhase.entityId),
        (relatedPopupElementRow.title = mappedItemsPhase.entityId),
        relatedPopupElementSection.append(relatedPopupElementCard, relatedPopupElementRow),
        runAlt(relatedPopupElementPanel, relatedPopupElementCard),
        relatedPopupElementPanel.append(relatedPopupElementSection),
        relatedPopupElementPanel
      );
    }),
    relatedPopupElementBox = document.createElement("div");
  ((relatedPopupElementBox.className = "inspector-picker-empty"),
    relatedPopupElementCache.length || (relatedPopupElementBox.textContent = "没有匹配的实体"),
    ao2.options.replaceChildren(
      relatedPopupElementElement,
      ...mappedItemsStep,
      ...(relatedPopupElementBox.textContent ? [relatedPopupElementBox] : []),
    ),
    (ao2.options.scrollTop = 0));
}
function runExtraFallback(runExtraBackup: any) {
  const ao3 = runExtraAlt(runExtraBackup.type),
    relatedPopupElementTarget = runExtraBackup.bindings?.entity?.entityId || "",
    relatedPopupElementSource = runPortion(runExtraBackup.type).find(
      (relatedPopupElementOrigin: any) =>
        relatedPopupElementOrigin.entityId === relatedPopupElementTarget,
    ),
    rt2 = relatedPopupElementSource
      ? runMode(relatedPopupElementSource)
      : relatedPopupElementTarget || "不使用实体";
  let relatedPopupElementDraft = ao3.button.querySelector(".inspector-picker-value");
  (relatedPopupElementDraft ||
    ((relatedPopupElementDraft = document.createElement("span")),
    (relatedPopupElementDraft.className = "inspector-picker-value"),
    ao3.button.replaceChildren(relatedPopupElementDraft),
    runAlt(ao3.button, relatedPopupElementDraft)),
    (relatedPopupElementDraft.textContent = rt2),
    (relatedPopupElementDraft.title = rt2),
    (ao3.button.dataset.entityId = relatedPopupElementTarget),
    ao3.button._entityCopySync?.(),
    (ao3.search.value = ""),
    ao3.menu.hidden || runExtraVariant("", runExtraBackup.type),
    updateRelatedPopup(
      runExtraBackup,
      ao3.relatedSettings === false ? null : ao3.button.closest(".inspector-picker"),
    ));
}
function resolveAssetPreviewUrl(asset = "image") {
  const ao4 = runExtraAlt(asset);
  if (ao4.menu.hidden) return;
  const assetIdText = ao4.button.getBoundingClientRect(),
    userAssetId = 5,
    userAssetIdState = 8,
    availableSizeName = Math.min(assetIdText.width, window.innerWidth - userAssetIdState * 2),
    availableSizeKey = window.innerHeight - assetIdText.bottom - userAssetId - userAssetIdState,
    measuredBoundsName = assetIdText.top - userAssetId - userAssetIdState,
    assetRelativePathState = availableSizeKey >= 250 || availableSizeKey >= measuredBoundsName,
    assetRelativePath = Math.max(
      150,
      Math.min(430, assetRelativePathState ? availableSizeKey : measuredBoundsName),
    ),
    left2 = assetIdText.left;
  ((ao4.menu.style.left =
    clampNumber2(
      left2,
      userAssetIdState,
      Math.max(userAssetIdState, window.innerWidth - availableSizeName - userAssetIdState),
    ) + "px"),
    (ao4.menu.style.width = availableSizeName + "px"),
    (ao4.menu.style.maxHeight = assetRelativePath + "px"),
    (ao4.options.style.maxHeight = Math.max(90, assetRelativePath - 58) + "px"),
    (ao4.menu.style.top = assetRelativePathState
      ? assetIdText.bottom + userAssetId + "px"
      : Math.max(userAssetIdState, assetIdText.top - assetRelativePath - userAssetId) + "px"));
}
function runExtraShadow() {
  resolveAssetPreviewUrl("image");
}
function runExtraTwin(runExtraBranch: any) {
  if (runExtraBranch?.url) return String(runExtraBranch.url);
  const encodedAssetPath = String(runExtraBranch?.assetId || "");
  if (encodedAssetPath.startsWith("user:")) {
    const slice2 = encodedAssetPath.slice(5);
    return /^[0-9a-f]{32}$/.test(slice2) ? "/api/v1/assets/user/" + slice2 : "";
  }
  const replace2 = String(runExtraBranch?.relativePath || encodedAssetPath).replace(
      /^builtin:/,
      "",
    ),
    join = (
      replace2.startsWith("v1/2D/") || replace2.startsWith("v1/3D/")
        ? replace2.replace(/^v1\//, "v1/户型图示例/")
        : replace2
    )
      .split("/")
      .filter(Boolean)
      .map((pathSegment) => encodeURIComponent(pathSegment))
      .join("/");
  if (!join) return "";
  return "/assets/builtin/" + join;
}
function resolveEffectAssetUrl(effectAsset: any) {
  const effectVariantUrl = effectAsset?.effectVariant?.url;
  return typeof effectVariantUrl == "string" &&
    effectVariantUrl.startsWith("/api/v1/assets/effect-variant?")
    ? effectVariantUrl
    : runExtraTwin(effectAsset);
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
    entityKindLabel: runQueue,
    entityPickerPrimaryName: runSnapshot,
    entityPickerText: runMode,
    enableEntityTextHoverScroll: runAlt,
    assetDisplayName: assetDisplayName,
    assetPreviewUrl: resolveEffectAssetUrl,
    bindEditorIconNameTooltip: runFirst,
    mdiIconUrl: runDual,
  }),
  {
    editorEntityMatches: editorEntityMatches,
    editorPickerComponentTypeLabel: editorPickerComponentTypeLabel,
  } = createEditorPickerQueries2({
    entityPickerConfig: runExtraAlt,
    pickerEntitiesForComponentType: runPortion,
    entityPickerText: runMode,
    entityDomain: renderNavigationIconPreview,
  }),
  editorPickers = createInteraction3dEditorPickers2({
    getState: (stateEntityId) => editorCtx.editorRenderer?.states?.get(stateEntityId),
    openPicker: (pickerPayload) => runCopyBackup(pickerPayload),
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
    entityPickerText: runMode,
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
      runCopyLast(removedSourceKey, removedFolderName),
  });
function assetMatchesId(assetRecord: any, targetAssetId: any) {

  return assetRecord?.assetId === targetAssetId;
}
function allAssets() {
  return [...editorCtx.userAssetsState, ...editorCtx.userAssets];
}
function findAssetById(wantedAssetId: any) {
  return allAssets().find((assetCandidate) => assetMatchesId(assetCandidate, wantedAssetId));
}
function assetDisplayName(namedAsset: any) {
  return String(namedAsset?.name || namedAsset?.relativePath || namedAsset?.assetId || "").replace(
    /\.(?:png|jpe?g|webp|gif|svg)$/i,
    "",
  );
}
function exportedAssetsInFolder(targetFolderName: any) {
  return editorCtx.userAssets.filter(
    (folderAsset: any) =>
      folderAsset.folder === targetFolderName && folderAsset.source === "studio3d-export",
  );
}
function canDeleteAssetFolder(folderSource: any, assetFolderName: any) {
  if (folderSource !== "user" || !assetFolderName) return false;
  const folderAssets = editorCtx.userAssets.filter(
    (folderAssetRecord: any) => folderAssetRecord.folder === assetFolderName,
  );
  return (
    folderAssets.length > 0 &&
    folderAssets.every((checkedAsset: any) => checkedAsset.source === "studio3d-export")
  );
}
function syncAssetFolderOptions(assetSourceKind: any) {
  const isImageKind = assetSourceKind === "image",
    Zt3 = isImageKind ? editorCtx.imageAssetFolder : editorCtx.effectAssetFolder,
    et2 = isImageKind ? imageAssetMenuElement : ibeAssetMenuElement,
    Ao2 = isImageKind ? imageAssetFolderSelectElement : ibeAssetFolderElement,
    folderSelectInputElement = isImageKind
      ? imageAssetUploadHintElement
      : ibeAssetUploadHintElement,
    folderSelectInput = isImageKind ? "[data-image-asset-source]" : "[data-ibe-asset-source]";
  for (const folderNamesElement of et2.querySelectorAll(folderSelectInput))
    folderNamesElement.classList.toggle(
      "active",
      folderNamesElement.dataset[isImageKind ? "imageAssetSource" : "ibeAssetSource"] === Zt3,
    );
  const folderNames = customSelectsBySelectElement.get(Ao2);
  if (folderNames) {
    const Nt2 = Zt3 === "user" ? editorCtx.userAssets : editorCtx.userAssetsState;
    ((folderNames.wrapper.hidden = !Nt2.some((sourceAssetItem: any) => sourceAssetItem.folder)),
      folderNames.wrapper.hidden && runState(folderNames));
  }
  folderSelectInputElement.hidden = Zt3 !== "user";
}
function leftFolderName(rightFolderName: any) {
  const isCurrentFolder = rightFolderName === "image",
    Zt4 = isCurrentFolder ? editorCtx.imageAssetFolder : editorCtx.effectAssetFolder,
    Ao3 = isCurrentFolder ? imageAssetFolderSelectElement : ibeAssetFolderElement,
    Nt3 = Zt4 === "user" ? editorCtx.userAssets : editorCtx.userAssetsState,
    sort3 = [
      ...new Set<string>(
        Nt3.map((mappedItemsView: any) => String(mappedItemsView.folder ?? "")).filter(Boolean),
      ),
    ].sort((leftFolderLabel: string, rightFolderLabel: string) =>
      leftFolderLabel.localeCompare(rightFolderLabel, "zh-CN"),
    ),
    xn2 = isCurrentFolder ? editorCtx.imageAssetFolderState : editorCtx.effectAssetFolderState,
    nextFolder = sort3.includes(xn2) ? xn2 : sort3[0] || "";
  (isCurrentFolder ? (editorCtx.imageAssetFolderState = nextFolder) : (editorCtx.effectAssetFolderState = nextFolder),
    Ao3.replaceChildren(
      ...sort3.map(
        (folderNameToOption) =>
          new Option(
            folderNameToOption === "." ? "根目录" : String(folderNameToOption),
            String(folderNameToOption),
          ),
      ),
    ),
    (Ao3.value = nextFolder),
    loadNavigationIconOptions(Ao3),
    syncAssetFolderOptions(rightFolderName));
}
function measureAssetImageSize(measuredAsset: any) {
  return Number(measuredAsset?.width) > 0 && Number(measuredAsset?.height) > 0
    ? Promise.resolve({
        width: Number(measuredAsset.width),
        height: Number(measuredAsset.height),
      })
    : new Promise<{ width: number; height: number }>((resolveImageSize, rejectImageSize) => {
        const image = new Image();
        ((image.decoding = "async"),
          image.addEventListener(
            "load",
            () => {
              ((measuredAsset.width = image.naturalWidth),
                (measuredAsset.height = image.naturalHeight),
                resolveImageSize({
                  width: measuredAsset.width,
                  height: measuredAsset.height,
                }));
            },
            {
              once: true,
            },
          ),
          image.addEventListener(
            "error",
            () => rejectImageSize(new Error("无法读取图片尺寸：" + (measuredAsset?.name || ""))),
            {
              once: true,
            },
          ),
          (image.src = runExtraTwin(measuredAsset)));
      });
}
function applyAssetNaturalSize(assetComponent: any, appliedAssetId: any, naturalSize: any) {
  const buildAssetLayout = (layoutPosition: any, layoutScale: any) => {
    const naturalWidth = Number(layoutPosition?.width || naturalSize.width),
      naturalHeight = Number(layoutPosition?.height || naturalSize.height),
      scaleFactor = clampNumber2(Number(layoutScale || 1), 0.01, 5),
      centerY = Number(layoutPosition?.x || 0) + naturalWidth / 2,
      centerYState = Number(layoutPosition?.y || 0) + naturalHeight / 2;
    return {
      position: {
        ...(layoutPosition || {}),
        x: centerY - naturalSize.width / 2,
        y: centerYState - naturalSize.height / 2,
        width: naturalSize.width,
        height: naturalSize.height,
      },
      scale: clampNumber2((naturalWidth * scaleFactor) / naturalSize.width, 0.01, 5),
    };
  };
  if (
    ((assetComponent.properties = {
      ...(assetComponent.properties || {}),
    }),
    assetComponent.properties.layoutMode === "fill")
  ) {
    const freeLayout = assetComponent.properties.freeLayout;
    if (freeLayout?.position) {
      const filledLayout = buildAssetLayout(freeLayout.position, freeLayout.scale);
      assetComponent.properties.freeLayout = filledLayout;
    }
  } else {
    const computedLayout = buildAssetLayout(assetComponent.position, assetComponent.style?.scale);
    ((assetComponent.position = computedLayout.position),
      (assetComponent.style = {
        ...(assetComponent.style || {}),
        scale: computedLayout.scale,
      }));
  }
  assetComponent.properties = {
    ...(assetComponent.properties || {}),
    assetId: appliedAssetId,
    fit: "contain",
    naturalWidth: naturalSize.width,
    naturalHeight: naturalSize.height,
  };
}
function readEffectNaturalSize(effectSourceComponent: any, fallbackSize: any = null) {
  const effectNaturalWidth = Number(
      effectSourceComponent?.effectNaturalWidth || fallbackSize?.width || 0,
    ),
    effectNaturalHeight = Number(
      effectSourceComponent?.effectNaturalHeight || fallbackSize?.height || 0,
    );
  return effectNaturalWidth > 0 && effectNaturalHeight > 0
    ? {
        width: effectNaturalWidth,
        height: effectNaturalHeight,
      }
    : null;
}
function probeAssetNaturalSize(probedComponent: any, probedAsset: any) {
  if (!probedComponent || !probedAsset) return;
  const probeKey = probedComponent.id + ":" + probedAsset.assetId;
  pendingAssetProbeKeysSet.has(probeKey) ||
    (pendingAssetProbeKeysSet.add(probeKey),
    measureAssetImageSize(probedAsset)
      .then((measuredSize) => {
        const liveComponent = findComponent2(
          editorCtx.activeProject?.document,
          probedComponent.id,
        )?.component;
        !liveComponent ||
          liveComponent.properties?.assetId !== probedAsset.assetId ||
          ((liveComponent.properties?.layoutMode === "fill" ||
            (Number(liveComponent.position?.width) === measuredSize.width &&
              Number(liveComponent.position?.height) === measuredSize.height)) &&
            Number(liveComponent.properties?.naturalWidth) === measuredSize.width &&
            Number(liveComponent.properties?.naturalHeight) === measuredSize.height) ||
          mutateDocument((mutatedDocument: any) => {
            const matchedDocumentComponent = findComponent2(
              mutatedDocument,
              probedComponent.id,
            )?.component;
            !matchedDocumentComponent ||
              matchedDocumentComponent.properties?.assetId !== probedAsset.assetId ||
              applyAssetNaturalSize(matchedDocumentComponent, probedAsset.assetId, measuredSize);
          });
      })
      .catch(handleOperationError)
      .finally(() => pendingAssetProbeKeysSet.delete(probeKey)));
}
function positionImageAssetMenu() {
  if (imageAssetMenuElement.hidden) return;
  const targetBoundsConfig = imageAssetButtonElement.getBoundingClientRect(),
    positionImageAssetState = 5,
    positionImageAssetStateState = 8,
    availableSizePath =
      window.innerHeight -
      targetBoundsConfig.bottom -
      positionImageAssetState -
      positionImageAssetStateState,
    measuredBoundsKey =
      targetBoundsConfig.top - positionImageAssetState - positionImageAssetStateState,
    positionAssetLargePreviewState =
      availableSizePath >= 260 || availableSizePath >= measuredBoundsKey,
    clampedLowerRecord = Math.max(
      150,
      Math.min(470, positionAssetLargePreviewState ? availableSizePath : measuredBoundsKey),
    );
  ((imageAssetMenuElement.style.left =
    clampNumber2(
      targetBoundsConfig.left,
      positionImageAssetStateState,
      Math.max(
        positionImageAssetStateState,
        window.innerWidth - targetBoundsConfig.width - positionImageAssetStateState,
      ),
    ) + "px"),
    (imageAssetMenuElement.style.width = targetBoundsConfig.width + "px"),
    (imageAssetMenuElement.style.maxHeight = clampedLowerRecord + "px"),
    (imageAssetOptionsElement.style.maxHeight = Math.max(80, clampedLowerRecord - 150) + "px"),
    (imageAssetMenuElement.style.top = positionAssetLargePreviewState
      ? targetBoundsConfig.bottom + positionImageAssetState + "px"
      : Math.max(
          positionImageAssetStateState,
          targetBoundsConfig.top - clampedLowerRecord - positionImageAssetState,
        ) + "px"));
}
function positionAssetLargePreview(hoveredOptionElement: any, assetMenuElement = imageAssetMenuElement) {
  if (imageAssetLargePreviewImageElement.hidden || !hoveredOptionElement?.isConnected) return;
  const optionRect = hoveredOptionElement.getBoundingClientRect(),
    menuRectState = assetMenuElement.getBoundingClientRect(),
    previewRect = imageAssetLargePreviewImageElement.getBoundingClientRect(),
    previewGapPx = 18,
    previewLeftPx =
      menuRectState.left < window.innerWidth / 2
        ? menuRectState.right + previewGapPx
        : menuRectState.left - previewRect.width - previewGapPx;
  ((imageAssetLargePreviewImageElement.style.left =
    clampNumber2(previewLeftPx, 12, Math.max(12, window.innerWidth - previewRect.width - 12)) +
    "px"),
    (imageAssetLargePreviewImageElement.style.top =
      clampNumber2(optionRect.top, 12, Math.max(12, window.innerHeight - previewRect.height - 12)) +
      "px"));
}
function scheduleAssetPreview(
  previewAsset: any,
  previewAnchorElement: any,
  previewMenuElement = imageAssetMenuElement,
) {
  !previewAsset ||
    !previewAnchorElement ||
    (clearTimeout(editorCtx.assetPreviewTimeoutId),
    (editorCtx.assetPreviewTimeoutId = window.setTimeout(() => {
      const jp2 = resolveEffectAssetUrl(previewAsset);
      !jp2 ||
        previewMenuElement.hidden ||
        !previewAnchorElement.isConnected ||
        ((imageAssetLargePreviewImageElementElement.onload = () =>
          positionAssetLargePreview(previewAnchorElement, previewMenuElement)),
        (imageAssetLargePreviewImageElementElement.src = jp2),
        (imageAssetLargePreviewNameElement.textContent =
          previewAsset.name || previewAsset.relativePath),
        (imageAssetLargePreviewImageElement.hidden = false),
        window.requestAnimationFrame(() =>
          positionAssetLargePreview(previewAnchorElement, previewMenuElement),
        ));
    }, 300)));
}
function hideAssetLargePreview() {
  (clearTimeout(editorCtx.assetPreviewTimeoutId),
    (editorCtx.assetPreviewTimeoutId = null),
    (imageAssetLargePreviewImageElement.hidden = true),
    (imageAssetLargePreviewImageElementElement.onload = null));
}
function createAssetOptionButton(optionAsset: any, selectedAssetId: any) {
  const assetOptionButton = document.createElement("button");
  ((assetOptionButton.type = "button"),
    (assetOptionButton.className =
      "inspector-asset-option" + (assetMatchesId(optionAsset, selectedAssetId) ? " selected" : "")),
    (assetOptionButton.dataset.assetId = optionAsset.assetId),
    (assetOptionButton.title = optionAsset.name),
    assetOptionButton.setAttribute("role", "option"),
    assetOptionButton.setAttribute(
      "aria-selected",
      String(assetMatchesId(optionAsset, selectedAssetId)),
    ));
  const previewImageElement = document.createElement("img");
  ((previewImageElement.src = resolveEffectAssetUrl(optionAsset)),
    (previewImageElement.alt = optionAsset.name),
    (previewImageElement.loading = "lazy"),
    previewImageElement.addEventListener("error", () =>
      assetOptionButton.classList.add("image-load-error"),
    ));
  const assetNameElement = document.createElement("span");
  if (
    ((assetNameElement.textContent = assetDisplayName(optionAsset)),
    assetOptionButton.append(previewImageElement, assetNameElement),
    optionAsset.source === "studio3d-export" || optionAsset.source !== "user")
  )
    return assetOptionButton;
  const deleteWrapElement = document.createElement("div");
  deleteWrapElement.className = "user-asset-option-wrap";
  const deleteButtonElement = document.createElement("button");
  return (
    (deleteButtonElement.type = "button"),
    (deleteButtonElement.className = "user-asset-delete"),
    (deleteButtonElement.dataset.deleteUserAsset = optionAsset.assetId),
    (deleteButtonElement.title = "删除 " + optionAsset.name),
    deleteButtonElement.setAttribute("aria-label", "删除 " + optionAsset.name),
    (deleteButtonElement.textContent = "×"),
    deleteWrapElement.append(assetOptionButton, deleteButtonElement),
    deleteWrapElement
  );
}
function renderImageAssetOptions(assetSearchQuery = "") {
  hideAssetLargePreview();
  const boundAssetId = removedComponent()?.properties?.assetId || "",
    normalizedAssetQuery = assetSearchQuery.trim().toLocaleLowerCase("zh-CN"),
    filteredAssets = (editorCtx.imageAssetFolder === "user" ? editorCtx.userAssets : editorCtx.userAssetsState).filter(
      (matchingAsset: any) => {
        const matchesQuery =
            !normalizedAssetQuery ||
            (matchingAsset.name + " " + matchingAsset.relativePath)
              .toLocaleLowerCase("zh-CN")
              .includes(normalizedAssetQuery),
          matchesFolder = !!normalizedAssetQuery || matchingAsset.folder === editorCtx.imageAssetFolderState;
        return matchesQuery && matchesFolder;
      },
    ),
    clearAssetButton = document.createElement("button");
  if (
    ((clearAssetButton.type = "button"),
    (clearAssetButton.className = "inspector-asset-clear" + (boundAssetId ? "" : " selected")),
    (clearAssetButton.dataset.assetId = ""),
    clearAssetButton.setAttribute("role", "option"),
    clearAssetButton.setAttribute("aria-selected", String(!boundAssetId)),
    (clearAssetButton.textContent = "不使用图片"),
    !filteredAssets.length)
  ) {
    const assetNoMatchElement = document.createElement("div");
    ((assetNoMatchElement.className = "inspector-picker-empty"),
      (assetNoMatchElement.textContent = "没有匹配的图片"),
      imageAssetOptionsElement.replaceChildren(clearAssetButton, assetNoMatchElement));
    return;
  }
  imageAssetOptionsElement.replaceChildren(
    clearAssetButton,
    ...filteredAssets.map((assetForOption: any) =>
      createAssetOptionButton(assetForOption, boundAssetId),
    ),
  );
}
function syncImageAssetSelection(imageComponent: any) {
  const currentAssetId = imageComponent.properties?.assetId || "",
    sn2 = findAssetById(currentAssetId);
  ((editorCtx.imageAssetFolder =
    ["user", "studio3d-export"].includes(sn2?.source) || (editorCtx.userAssets.length && !sn2)
      ? "user"
      : "builtin"),
    (editorCtx.imageAssetFolderState = sn2?.folder || "" || editorCtx.imageAssetFolderState),
    leftFolderName("image"),
    syncAssetFolderOptions("image"),
    (imageAssetButtonElement.textContent = sn2?.name || currentAssetId || "不使用图片"),
    (imageAssetSearchInputElement.value = ""),
    imageAssetOptionsElement.replaceChildren(),
    probeAssetNaturalSize(imageComponent, sn2));
}
function positionEffectAssetMenu() {
  if (ibeAssetMenuElement.hidden) return;
  const matchedAsset = ibeAssetButtonElement.getBoundingClientRect(),
    positionEffectAssetState = 5,
    positionEffectAssetStateState = 8,
    availableSizeText =
      window.innerHeight -
      matchedAsset.bottom -
      positionEffectAssetState -
      positionEffectAssetStateState,
    measuredBoundsPath =
      matchedAsset.top - positionEffectAssetState - positionEffectAssetStateState,
    renderEffectAssetOptionsState =
      availableSizeText >= 260 || availableSizeText >= measuredBoundsPath,
    clampedLowerName = Math.max(
      150,
      Math.min(470, renderEffectAssetOptionsState ? availableSizeText : measuredBoundsPath),
    );
  ((ibeAssetMenuElement.style.left =
    clampNumber2(
      matchedAsset.left,
      positionEffectAssetStateState,
      Math.max(
        positionEffectAssetStateState,
        window.innerWidth - matchedAsset.width - positionEffectAssetStateState,
      ),
    ) + "px"),
    (ibeAssetMenuElement.style.width = matchedAsset.width + "px"),
    (ibeAssetMenuElement.style.maxHeight = clampedLowerName + "px"),
    (ibeAssetOptionsElement.style.maxHeight = Math.max(80, clampedLowerName - 150) + "px"),
    (ibeAssetMenuElement.style.top = renderEffectAssetOptionsState
      ? matchedAsset.bottom + positionEffectAssetState + "px"
      : Math.max(
          positionEffectAssetStateState,
          matchedAsset.top - clampedLowerName - positionEffectAssetState,
        ) + "px"));
}
function renderEffectAssetOptions(effectAssetSearchQuery = "") {
  hideAssetLargePreview();
  const boundEffectAssetId = removedComponent()?.properties?.effectAssetId || "",
    normalizedEffectQuery = effectAssetSearchQuery.trim().toLocaleLowerCase("zh-CN"),
    filteredEffectAssets = (editorCtx.effectAssetFolder === "user" ? editorCtx.userAssets : editorCtx.userAssetsState).filter(
      (effectMatchingAsset: any) =>
        (!normalizedEffectQuery ||
          (effectMatchingAsset.name + " " + effectMatchingAsset.relativePath)
            .toLocaleLowerCase("zh-CN")
            .includes(normalizedEffectQuery)) &&
        (!!normalizedEffectQuery || effectMatchingAsset.folder === editorCtx.effectAssetFolderState),
    ),
    effectClearAssetButton = document.createElement("button");
  ((effectClearAssetButton.type = "button"),
    (effectClearAssetButton.className =
      "inspector-asset-clear" + (boundEffectAssetId ? "" : " selected")),
    (effectClearAssetButton.dataset.assetId = ""),
    effectClearAssetButton.setAttribute("role", "option"),
    effectClearAssetButton.setAttribute("aria-selected", String(!boundEffectAssetId)),
    (effectClearAssetButton.textContent = "不使用图片"));
  const effectAssetOptionButtons = filteredEffectAssets.map((effectOptionAsset: any) =>
      createAssetOptionButton(effectOptionAsset, boundEffectAssetId),
    ),
    effectNoMatchElement = document.createElement("div");
  ((effectNoMatchElement.className = "inspector-picker-empty"),
    effectAssetOptionButtons.length || (effectNoMatchElement.textContent = "没有匹配的图片"),
    ibeAssetOptionsElement.replaceChildren(
      effectClearAssetButton,
      ...effectAssetOptionButtons,
      ...(effectNoMatchElement.textContent ? [effectNoMatchElement] : []),
    ));
}
function syncEffectAssetSelection(effectOwnerComponent: any) {
  const currentEffectAssetId = effectOwnerComponent.properties?.effectAssetId || "",
    sn3 = findAssetById(currentEffectAssetId);
  ((editorCtx.effectAssetFolder =
    ["user", "studio3d-export"].includes(sn3?.source) || (editorCtx.userAssets.length && !sn3)
      ? "user"
      : "builtin"),
    (editorCtx.effectAssetFolderState = sn3?.folder || editorCtx.effectAssetFolderState),
    leftFolderName("ibe"),
    syncAssetFolderOptions("ibe"),
    (ibeAssetButtonElement.textContent = sn3?.name || currentEffectAssetId || "不使用图片"),
    (ibeAssetSearchElement.value = ""),
    ibeAssetOptionsElement.replaceChildren());
}
function assignActionControlIds(controlElement: any) {
  const formId = controlElement.closest(".inspector-form[id]")?.id || "component-action",
    replace3 = String(controlElement.dataset.actionTrigger || "action").replace(
      /[^a-zA-Z0-9_-]/g,
      "-",
    ),
    idSelectorPairs = [
      ["[data-action-target]", "target"],
      ["[data-popup-source]", "popup-source"],
      ["[data-popup-entity-search]", "popup-entity-search"],
      ["[data-popup-entity]", "popup-entity"],
      ["[data-popup-custom]", "popup-custom"],
    ];
  for (const [selectorKey, idSuffix] of idSelectorPairs) {
    const targetControlElement = controlElement.querySelector(selectorKey);
    targetControlElement &&
      !targetControlElement.id &&
      !targetControlElement.name &&
      (targetControlElement.id = formId + "-" + replace3 + "-" + idSuffix);
  }
}
function initActionPopupConfig() {
  for (const moreElement of document.querySelectorAll('[data-action-type="more-info"]'))
    moreElement.textContent = "打开弹窗";
  for (const actionControlElement of document.querySelectorAll(
    ".component-action-control[data-action-trigger]",
  )) {
    if (
      (assignActionControlIds(actionControlElement),
      actionControlElement.querySelector(".component-popup-config"))
    )
      continue;
    const popupSettingsElement = document.createElement("div");
    ((popupSettingsElement.className = "component-popup-config"),
      (popupSettingsElement.hidden = true),
      (popupSettingsElement.innerHTML =
        '\n      <label class="component-popup-config-row"><span>弹窗来源</span><select data-popup-source><option value="current">当前实体</option><option value="entity">其它实体</option><option value="custom">组合弹窗</option></select></label>\n      <div class="component-popup-config-row" data-popup-entity-row><span>选择实体</span><div class="component-popup-entity-picker"><button class="inspector-picker-button" type="button" data-popup-entity-button aria-haspopup="listbox" aria-expanded="false">选择实体</button><div class="inspector-picker-menu component-popup-entity-menu" data-popup-entity-menu hidden><input type="search" data-popup-entity-search placeholder="搜索实体名称或 ID" autocomplete="off"><div class="inspector-entity-options" data-popup-entity-options role="listbox"></div></div><input type="hidden" data-popup-entity></div></div>\n      <label class="component-popup-config-row" data-popup-custom-row><span>选择弹窗</span><select data-popup-custom></select></label>\n      <button class="component-popup-preview" type="button" data-popup-preview>预览弹窗</button>'),
      actionControlElement.append(popupSettingsElement),
      assignActionControlIds(actionControlElement));
    const popupEntityButtonElement = popupSettingsElement.querySelector(
        "[data-popup-entity-button]",
      ),
      popupEntityInputElement = popupSettingsElement.querySelector<HTMLInputElement>("[data-popup-entity]");
    enhanceEntityCopyButton(popupEntityButtonElement, () => popupEntityInputElement?.value || "");
  }
}
function closePopupEntityMenus(activeTriggerElement: any = null) {
  for (const popupMenuElement of document.querySelectorAll<HTMLElement>("[data-popup-entity-menu]")) {
    const triggerElement = popupMenuElement.closest("[data-action-trigger]");
    triggerElement !== activeTriggerElement &&
      ((popupMenuElement.hidden = true),
      triggerElement
        ?.querySelector("[data-popup-entity-button]")
        ?.setAttribute("aria-expanded", "false"));
  }
}
function syncPopupEntityButton(configElement: any) {
  const popupEntityId = configElement?.querySelector("[data-popup-entity]")?.value || "",
    popupEntity = editorCtx.entities.find(
      (popupCandidateEntity: any) => popupCandidateEntity.entityId === popupEntityId,
    ),
    popupPickerButtonElement = configElement?.querySelector("[data-popup-entity-button]");
  if (!popupPickerButtonElement) return;
  const buttonLabel = popupEntity
    ? "[" + runQueue(popupEntity) + "] " + runSnapshot(popupEntity)
    : popupEntityId || "选择实体";
  (runBackup(popupPickerButtonElement, buttonLabel, popupEntityId || buttonLabel),
    (popupPickerButtonElement.dataset.entityId = popupEntityId),
    popupPickerButtonElement._entityCopySync?.());
}
function renderPopupEntityOptions(popupConfigElement: any, popupSearchQuery = "") {
  const optionsElement = popupConfigElement?.querySelector("[data-popup-entity-options]"),
    popupSelectedEntityId = popupConfigElement?.querySelector("[data-popup-entity]")?.value || "";
  if (!optionsElement) return;
  const normalizedPopupQuery = String(popupSearchQuery || "")
      .trim()
      .toLocaleLowerCase("zh-CN"),
    filteredEntities = editorCtx.entities.filter(
      (listedPopupEntity: any) =>
        !normalizedPopupQuery ||
        (runMode(listedPopupEntity) + " " + listedPopupEntity.entityId)
          .toLocaleLowerCase("zh-CN")
          .includes(normalizedPopupQuery),
    );
  if (
    (optionsElement.replaceChildren(
      ...filteredEntities.map((optionEntity: any) => {
        const popupOptionButton = document.createElement("button");
        ((popupOptionButton.type = "button"),
          (popupOptionButton.className =
            "inspector-entity-option" +
            (optionEntity.entityId === popupSelectedEntityId ? " selected" : "")),
          (popupOptionButton.dataset.popupActionEntityId = optionEntity.entityId),
          popupOptionButton.setAttribute("role", "option"),
          popupOptionButton.setAttribute(
            "aria-selected",
            String(optionEntity.entityId === popupSelectedEntityId),
          ));
        const popupOptionContentElement = document.createElement("span");
        popupOptionContentElement.className = "inspector-entity-option-content";
        const popupNameLineElement = document.createElement("span");
        ((popupNameLineElement.className =
          "inspector-entity-option-line inspector-entity-name-line"),
          (popupNameLineElement.textContent =
            "[" + runQueue(optionEntity) + "] " + runSnapshot(optionEntity)));
        const popupIdElement = document.createElement("span");
        return (
          (popupIdElement.className = "inspector-entity-option-line inspector-entity-id"),
          (popupIdElement.textContent = optionEntity.entityId),
          popupOptionContentElement.append(popupNameLineElement, popupIdElement),
          runAlt(popupOptionButton, popupNameLineElement),
          popupOptionButton.append(popupOptionContentElement),
          popupOptionButton
        );
      }),
    ),
    !filteredEntities.length)
  ) {
    const popupNoMatchElement = document.createElement("div");
    ((popupNoMatchElement.className = "inspector-picker-empty"),
      (popupNoMatchElement.textContent = "没有匹配的实体"),
      optionsElement.append(popupNoMatchElement));
  }
}
function positionPopupEntityMenu(triggerConfigElement: any) {
  const popupEntityButtonPanel = triggerConfigElement?.querySelector("[data-popup-entity-button]"),
    entityMenuElementElement = triggerConfigElement?.querySelector("[data-popup-entity-menu]");
  if (!popupEntityButtonPanel || !entityMenuElementElement || entityMenuElementElement.hidden)
    return;
  const targetBoundsRef = popupEntityButtonPanel.getBoundingClientRect(),
    availableSizeCount = Math.min(targetBoundsRef.width, window.innerWidth - 16),
    availableSizeIndex = Math.min(340, window.innerHeight - 16);
  ((entityMenuElementElement.style.width = availableSizeCount + "px"),
    (entityMenuElementElement.style.maxHeight = availableSizeIndex + "px"));
  const popupEntityButtonState = entityMenuElementElement.querySelector(
    "[data-popup-entity-options]",
  );
  popupEntityButtonState &&
    (popupEntityButtonState.style.maxHeight = Math.max(120, availableSizeIndex - 58) + "px");
  const availableSizeTotal = clampNumber2(
      targetBoundsRef.left,
      8,
      window.innerWidth - availableSizeCount - 8,
    ),
    clampedUpperState = Math.min(entityMenuElementElement.scrollHeight, availableSizeIndex),
    popupEntityButton = targetBoundsRef.bottom + 5,
    entityMenuElement =
      popupEntityButton + clampedUpperState <= window.innerHeight - 8
        ? popupEntityButton
        : Math.max(8, targetBoundsRef.top - clampedUpperState - 5);
  ((entityMenuElementElement.style.left = availableSizeTotal + "px"),
    (entityMenuElementElement.style.top = entityMenuElement + "px"));
}
function timeFitComponent(timeFitProperties: any, timeProperties = timeFitProperties?.properties || {}) {
  fitInspectorComponentToDimensions2(timeFitProperties, timeProperties, timeComponentDimensions2);
}
function runExtraPeer(dateProperties: any) {
  const availablePropertiesState = dateProperties.properties || {},
    {
      left: datePropertiesState,
      top: DATE_INSPECTOR_FIELDS,
      scale: DATE_INSPECTOR_TOGGLES,
      rotation: datePropertiesValue,
    }: any = inspectorComponentMetrics2(dateProperties, editorCtx.activeProject.document);
  ((timeTypeElement.value = "时间"),
    (timeLabelElement.value = availablePropertiesState.label || ""));
  for (const datePropertiesElement of timeHourFormatElement.querySelectorAll(
    "[data-time-hour-format]",
  ))
    datePropertiesElement.classList.toggle(
      "active",
      datePropertiesElement.dataset.timeHourFormat ===
        (availablePropertiesState.hour12 === true ? "12" : "24"),
    );
  for (const weatherPropertiesElement of timeSecondsElement.querySelectorAll("[data-time-seconds]"))
    weatherPropertiesElement.classList.toggle(
      "active",
      weatherPropertiesElement.dataset.timeSeconds ===
        (availablePropertiesState.showSeconds === true ? "on" : "off"),
    );
  ((timeColorElement.value = availablePropertiesState.color || "#248eb2"),
    (timeFontSizeElement.value = roundField2(
      clampNumber2(Number(availablePropertiesState.fontSize ?? 96), 12, 500),
    )),
    (timeFontWeightElement.value = roundField2(
      normalizedFontWeight2(availablePropertiesState.fontWeight),
    )),
    (timeLetterSpacingElement.value = roundField2(
      clampNumber2(Number(availablePropertiesState.letterSpacing ?? 2.2), -20, 100),
    )),
    (timeOpacityElement.value = roundField2(
      clampNumber2(Number(availablePropertiesState.opacity ?? 1) * 100, 0, 100),
    )),
    (timeLeftElement.value = datePropertiesState),
    (timeTopElement.value = DATE_INSPECTOR_FIELDS),
    (timeScaleElement.value = DATE_INSPECTOR_TOGGLES),
    (timeRotationElement.value = datePropertiesValue),
    (timeScaleElement.disabled = false),
    (timeRotationElement.disabled = false));
}
function weatherProperties(
  availablePropertiesValue: any,
  availablePropertiesConfig = availablePropertiesValue?.properties || {},
) {
  fitInspectorComponentToDimensions2(
    availablePropertiesValue,
    availablePropertiesConfig,
    dateComponentDimensions2,
  );
}
function fitWeatherComponentToDimensions(
  weatherFitComponent: any,
  weatherFitProperties = weatherFitComponent?.properties || {},
) {
  fitInspectorComponentToDimensions2(
    weatherFitComponent,
    weatherFitProperties,
    weatherComponentDimensions2,
  );
}
function entitiesByEntityId() {
  return new Map(
    editorCtx.entities
      .map((entityRecord: any) => [String(entityRecord.entityId || ""), entityRecord] as const)
      .filter(([entityValue]: any) => entityValue),
  );
}
function devicesByDeviceId() {
  return new Map(
    editorCtx.devices
      .map((deviceRecord: any) => [String(deviceRecord.deviceId || ""), deviceRecord] as const)
      .filter(([deviceValue]: any) => deviceValue),
  );
}
function buildCustomPopupEditorContext(): CustomPopupEditorContext {
  return {
    get editorMode() {
      return editorCtx.editorMode;
    },
    get activeProject() {
      return editorCtx.activeProject;
    },
    get selectedPopupId() {
      return editorCtx.selectedPopupId;
    },
    customPopupEditorElement,
    mutateDocument,
    handleOperationError,
    currentPage,
    deviceNameValue,
    openPopupModuleDialog,
  };
}
function renderCustomPopupEditor() {
  renderCustomPopupEditorExternal(buildCustomPopupEditorContext());
}
function syncCustomPopupStage() {
  syncCustomPopupStageExternal(buildCustomPopupEditorContext());
}
function buildTimeInspectorContext() {
  return {
    get activeProject() {
      return editorCtx.activeProject;
    },
    dateTypeElement,
    dateLabelElement,
    dateWeekdayElement,
    dateLunarElement,
    datePrimaryColorElement,
    datePrimarySizeElement,
    datePrimaryWeightElement,
    datePrimarySpacingElement,
    dateLunarColorElement,
    dateLunarSizeElement,
    dateLunarWeightElement,
    dateLunarSpacingElement,
    dateLineGapElement,
    dateOpacityElement,
    dateLeftElement,
    dateTopElement,
    dateScaleElement,
    dateRotationElement,
  };
}
function syncTimeInspector(timeComponent: any) {
  syncTimeInspectorExternal(buildTimeInspectorContext(), timeComponent);
}
function buildWeatherInspectorContext() {
  return {
    get activeProject() {
      return editorCtx.activeProject;
    },
    runExtraFallback,
    weatherTypeElement,
    weatherLabelElement,
    weatherIconVisibleElement,
    weatherTemperatureVisibleElement,
    weatherConditionVisibleElement,
    weatherHumidityVisibleElement,
    weatherIconSizeElement,
    weatherIconGapElement,
    weatherTemperatureColorElement,
    weatherTemperatureSizeElement,
    weatherTemperatureWeightElement,
    weatherTemperatureSpacingElement,
    weatherSecondaryColorElement,
    weatherSecondarySizeElement,
    weatherSecondaryWeightElement,
    weatherSecondarySpacingElement,
    weatherLineGapElement,
    weatherOpacityElement,
    weatherLeftElement,
    weatherTopElement,
    weatherScaleElement,
    weatherRotationElement,
  };
}
function syncWeatherInspector(weatherComponent: any) {
  syncWeatherInspectorExternal(buildWeatherInspectorContext(), weatherComponent);
}
function buildTitleButtonInspectorContext() {
  return {
    get activeProject() {
      return editorCtx.activeProject;
    },
    get selectedComponentIdsSet() {
      return editorCtx.selectedComponentIdsSet;
    },
    titleButtonLabelElement,
    runExtraFallback,
    titleButtonMainVisibleElement,
    titleButtonSecondaryVisibleElement,
    titleButtonFrameVisibleElement,
    titleButtonIconVisibleElement,
    titleButtonMainTextElement,
    titleButtonSecondaryLine1Element,
    titleButtonSecondaryLine2Element,
    titleButtonMainColorElement,
    titleButtonSecondaryColorElement,
    titleButtonMainSizeElement,
    titleButtonSecondarySizeElement,
    titleButtonMainWeightElement,
    titleButtonSecondaryWeightElement,
    titleButtonMainSpacingElement,
    titleButtonSecondarySpacingElement,
    titleButtonSecondaryLineGapElement,
    titleButtonMainLeftElement,
    titleButtonMainTopElement,
    titleButtonSecondaryLeftElement,
    titleButtonSecondaryTopElement,
    renderLightStatisticsIconPreview,
    titleButtonIconColorElement,
    titleButtonIconSizeElement,
    titleButtonIconLeftElement,
    titleButtonIconTopElement,
    titleButtonFrameColorElement,
    titleButtonFrameWidthElement,
    titleButtonFrameSizeElement,
    titleButtonFrameSpacingElement,
    titleButtonFrameOffsetXElement,
    titleButtonFrameOffsetYElement,
    titleButtonMarkerColorElement,
    titleButtonMarkerSizeElement,
    titleButtonMarkerLeftElement,
    titleButtonMarkerTopElement,
    titleButtonMarkerVisibleElement,
    titleButtonLeftElement,
    titleButtonTopElement,
    titleButtonWidthElement,
    titleButtonHeightElement,
    titleButtonScaleElement,
    titleButtonRotationElement,
    findReplaceableComponents,
    runAltOuter,
    titleButtonApplyStyleElement,
    titleButtonApplyCountElement,
    syncComponentActionControls,
    titleButtonActionControlsElement,
  };
}
function syncTitleButtonInspector(titleButtonComponent: any) {
  syncTitleButtonInspectorExternal(buildTitleButtonInspectorContext(), titleButtonComponent);
}
function buildLightStatisticsInspectorContext() {
  return {
    get activeProject() {
      return editorCtx.activeProject;
    },
    get statisticsComponentId() {
      return editorCtx.statisticsComponentId;
    },
    set statisticsComponentId(value: any) {
      editorCtx.statisticsComponentId = value;
    },
    runLimit,
    lightStatisticsLabelElement,
    lightStatisticsTitleElement,
    runExtraFallback,
    lightStatisticsIconVisibleElement,
    lightStatisticsTitleVisibleElement,
    lightStatisticsCountVisibleElement,
    runLocal,
    lightStatisticsIconColorElement,
    lightStatisticsIconActiveColorElement,
    lightStatisticsIconSizeElement,
    lightStatisticsTitleColorElement,
    lightStatisticsTitleSizeElement,
    lightStatisticsTitleWeightElement,
    lightStatisticsTitleSpacingElement,
    lightStatisticsCountColorElement,
    lightStatisticsCountActiveColorElement,
    lightStatisticsCountSizeElement,
    lightStatisticsCountWeightElement,
    lightStatisticsCountSpacingElement,
    lightStatisticsIconGapElement,
    lightStatisticsCountGapElement,
    lightStatisticsLeftElement,
    lightStatisticsTopElement,
    lightStatisticsWidthElement,
    lightStatisticsHeightElement,
    lightStatisticsScaleElement,
    lightStatisticsRotationElement,
    get selectedComponentIdsSet() {
      return editorCtx.selectedComponentIdsSet;
    },
    runBackup,
    lightStatisticsEntityButtonElement,
    statisticsReplaceIndex: editorCtx.statisticsReplaceIndex,
    runZone,
    lightStatisticsEntityMenuElement,
    runAmount,
    lightStatisticsEntitySearchElement,
    syncComponentActionControls,
    lightStatisticsActionControlsElement,
  };
}
function syncLightStatisticsInspector(lightStatisticsComponent: any) {
  syncLightStatisticsInspectorExternal(
    buildLightStatisticsInspectorContext(),
    lightStatisticsComponent,
  );
}
function buildCameraInspectorContext() {
  return {
    get activeProject() {
      return editorCtx.activeProject;
    },
    cameraLabelElement,
    runExtraFallback,
    cameraMediaVisibleElement,
    cameraSourceOptionsElement,
    cameraEntityPickerElement,
    cameraGo2rtcUrlFieldElement,
    cameraGo2rtcUrlElement,
    cameraGo2rtcNoteElement,
    cameraDisplayModeOptionsElement,
    cameraRefreshIntervalElement,
    cameraRefreshIntervalFieldElement,
    cameraFitOptionsElement,
    cameraFrameVisibleElement,
    cameraFrameColorElement,
    cameraFrameWidthElement,
    cameraRadiusElement,
    cameraFrameAngleElement,
    cameraFrameOpacityElement,
    cameraLeftElement,
    cameraTopElement,
    cameraWidthElement,
    cameraHeightElement,
    cameraScaleElement,
    cameraRotationElement,
    get selectedComponentIdsSet() {
      return editorCtx.selectedComponentIdsSet;
    },
    findReplaceableComponents,
    runAuxLower,
    cameraApplyStyleElement,
    cameraApplyCountElement,
    syncComponentActionControls,
    cameraActionControlsElement,
    // 摄像头检查器的写属性控件交互在 `home-camera-inspector.ts` 里挂（宿主只减不增）。
    mutateDocument,
    findComponent: findComponent2,
    getSelectedComponentId: () => editorCtx.selectedComponentId,
  };
}
function syncCameraInspector(cameraComponent: any) {
  syncCameraInspectorExternal(buildCameraInspectorContext(), cameraComponent);
}
function buildVacuumMapInspectorContext() {
  return {
    get activeProject() {
      return editorCtx.activeProject;
    },
    vacuumMapLabelElement,
    runExtraFallback,
    vacuumMapOpacityElement,
    vacuumMapLeftElement,
    vacuumMapTopElement,
    vacuumMapScaleElement,
    vacuumMapRotationElement,
  };
}
function syncVacuumMapInspector(vacuumMapComponent: any) {
  syncVacuumMapInspectorExternal(buildVacuumMapInspectorContext(), vacuumMapComponent);
}
function buildCoverMotorInspectorContext(): CoverMotorInspectorContext {
  return {
    activeProject: editorCtx.activeProject,
    airConditionerEntityMenuElement,
    airConditionerInspectorElement,
    airConditionerPreviewStateByComponentId,
    cameraEntityMenuElement,
    cameraInspectorElement,
    componentActionControlsElement,
    coverSettingsDirectionElement,
    coverSettingsInspectorElement,
    coverSettingsKindElement,
    coverSettingsMotorDirectionElement,
    dateInspectorElement,
    destroyDashboardPreview,
    displayDeviceCountElement,
    editorCanvasElement,
    editorMode: editorCtx.editorMode,
    editorPickers,
    editorRenderer: editorCtx.editorRenderer,
    entities: editorCtx.entities,
    eventLogWallInspectorElement,
    findReplaceableComponents,
    floorplanAutoDiagramBindingListElement,
    floorplanAutoDiagramBindingsElement,
    floorplanAutoDiagramCameraModeElement,
    floorplanAutoDiagramCameraViewElement,
    floorplanAutoDiagramFloorSelectElement,
    floorplanAutoDiagramFocalLengthInputElement,
    floorplanAutoDiagramFolderTextInputElement,
    floorplanAutoDiagramHeightInputElement,
    floorplanAutoDiagramInspectorFormElement,
    floorplanAutoDiagramLabelTextInputElement,
    floorplanAutoDiagramLayoutElement,
    floorplanAutoDiagramLeftInputElement,
    floorplanAutoDiagramOpenBaseLightingButtonElement,
    floorplanAutoDiagramOpenStudioButtonElement,
    floorplanAutoDiagramRotateTopButtonElement,
    floorplanAutoDiagramRotationInputElement,
    floorplanAutoDiagramScaleInputElement,
    floorplanAutoDiagramStateByComponentId,
    floorplanAutoDiagramStatusElement,
    floorplanAutoDiagramTopInputElement,
    floorplanAutoDiagramViewToggleButtonElement,
    floorplanAutoDiagramWidthInputElement,
    formatLastSeen,
    handleOperationError,
    hasActiveProject,
    ibeActionControlsElement,
    ibeActionSectionElement,
    ibeApplyCountElement,
    ibeApplyStyleElement,
    ibeAssetMenuElement,
    ibeBrightnessRealtimeElement,
    ibeButtonOffColorElement,
    ibeButtonOnColorElement,
    ibeButtonOpacityElement,
    ibeButtonSectionElement,
    ibeButtonTransformSectionElement,
    ibeButtonVisibleElement,
    ibeColorTemperatureRealtimeElement,
    ibeEffectFadeDurationElement,
    ibeEffectLayoutOptionsElement,
    ibeEffectLeftElement,
    ibeEffectOpacityElement,
    ibeEffectRotationElement,
    ibeEffectScaleElement,
    ibeEffectSectionElement,
    ibeEffectSizeHintElement,
    ibeEffectTopElement,
    ibeEffectVisibleElement,
    ibeEntityMenuElement,
    ibeFrameColorElement,
    ibeFrameOpacityElement,
    ibeFrameWidthElement,
    ibeGlowColorElement,
    ibeGlowOffStrengthElement,
    ibeGlowOnStrengthElement,
    ibeHeightElement,
    ibeIconMenuElement,
    ibeIconOffColorElement,
    ibeIconOnColorElement,
    ibeIconSizeElement,
    ibeLabelElement,
    ibeLayerOptionsElement,
    ibeLeftElement,
    ibePreviewStateElement,
    ibeRadiusElement,
    ibeRotationElement,
    ibeScaleElement,
    ibeTopElement,
    ibeWidthElement,
    iconButtonEffectInspectorElement,
    iconButtonEffectLayerByComponentId,
    iconButtonEffectPreviewStateByComponentId,
    iconButtonEntityMenuElement,
    iconButtonIconMenuElement,
    iconButtonInspectorElement,
    iconButtonPreviewStateByComponentId,
    imageAssetPointerOverEvent,
    imageInspectorElement,
    imageLabelElement,
    imageLayoutOptionsElement,
    imageLeftInputElement,
    imageOpacityInputElement,
    imageRotationInputElement,
    imageScaleInputElement,
    imageTopInputElement,
    imageTypeElement,
    inspectorEmptyElement,
    lightStatisticsActionEntityMenuElement,
    lightStatisticsEntityMenuElement,
    lightStatisticsIconMenuElement,
    lightStatisticsInspectorElement,
    lineChartInspectorElement,
    loadNavigationIconOptions,
    mutateDocument,
    navigationIconMenuElement,
    navigationInspectorFormElement,
    navigationLabelTextInputElement,
    navigationPreviewStateByComponentId,
    navigatorContentElement,
    navigatorElement,
    onGlobalColorPickerHexTextInputInput,
    onSessionsRevokeOthersConfirmButtonClick,
    pageSelectElement,
    panelFrameInspectorFormElement,
    readEffectNaturalSize,
    removedComponent,
    renderComponentLists,
    renderNavigationIconPreview,
    renderTitleButtonIconPreview,
    resizeWorkspaceCanvas,
    runAuxAlt,
    runExtraFallback,
    runExtraPeer,
    runMode,
    runShadow,
    selectableEntities,
    selectedComponentIdsSet: editorCtx.selectedComponentIdsSet,
    setComponentsRotation,
    setEditorMode,
    stopHoverScroll,
    syncAirConditionerInspector,
    syncCameraInspector,
    syncComponentActionControls,
    syncEffectAssetSelection,
    syncEventLogWallInspector,
    syncIconButtonInspector,
    syncImageAssetSelection,
    syncLightStatisticsInspector,
    syncLineChartInspector,
    syncNavigationInspector,
    syncPanelFrameInspector,
    syncRendererSelection,
    syncTimeInspector,
    syncTitleButtonInspector,
    syncVacuumMapInspector,
    syncWeatherInspector,
    timeInspectorElement,
    titleButtonEntityMenuElement,
    titleButtonIconMenuElement,
    titleButtonInspectorElement,
    vacuumMapEntityMenuElement,
    vacuumMapInspectorElement,
    weatherInspectorElement,
  };
}
function coverMotorButtonElement() {
  coverMotorButtonElementSync(buildCoverMotorInspectorContext());
}
function runExtraLocal(runExtraInner: any) {
  return runExtraLocalCover(buildCoverMotorInspectorContext(), runExtraInner);
}
async function reloadAssetCatalog({ refreshInspector: refreshInspector = true } = {}) {
  const [all, all2] = await Promise.all([
    requestJson("/assets/builtin?_=" + Date.now()),
    requestJson("/assets/user?_=" + Date.now()),
  ]);
  ((editorCtx.userAssetsState = all.items || []),
    (editorCtx.userAssets = all2.items || []),
    (editorCtx.catalogVersionSignature = (all.catalogVersion || "") + ":" + (all2.catalogVersion || "")));
  const didVersionsChange = setBuiltinAssetVersions2(allAssets());
  return (
    didVersionsChange &&
      (editorCtx.editorRenderer?.renderComponents(true), editorCtx.dashboardPreviewRenderer?.renderComponents(true)),
    refreshInspector && coverMotorButtonElement(),
    didVersionsChange
  );
}
async function pollAssetCatalogVersion() {
  const versionResponse = await requestJson("/assets/version"),
    versionSignature = (versionResponse.builtin || "") + ":" + (versionResponse.user || "");
  editorCtx.catalogVersionSignature !== versionSignature &&
    (await reloadAssetCatalog({
      refreshInspector: true,
    }));
}
async function ensureEntitiesLoaded({ afterCurrent: waitForCurrent = false } = {}): Promise<any> {
  return editorCtx.entitiesLoadPromise
    ? waitForCurrent
      ? (await editorCtx.entitiesLoadPromise, ensureEntitiesLoaded())
      : editorCtx.entitiesLoadPromise
    : ((editorCtx.entitiesLoadPromise = (async () => {
        const collectedEntities: any[] = [];
        let entityOffset = 0,
          entityTotal = 0;
        do {
          const entitiesResponse = await requestJson(
            "/ha/entities?limit=500&offset=" + entityOffset,
          );
          (collectedEntities.push(...(entitiesResponse.items || [])),
            (entityTotal = Number(entitiesResponse.total || 0)),
            (entityOffset += Number(entitiesResponse.limit || 500)));
        } while (collectedEntities.length < entityTotal);
        editorCtx.entities = collectedEntities.filter(
          (filteredItemsConfig) => filteredItemsConfig.status !== "missing",
        );
        const [all3, all4] = await Promise.all([
          requestJson("/ha/devices").catch(() => ({
            items: [] as any[],
          })),
          requestJson("/ha/translations").catch(() => ({
            resources: {} as Record<string, any>,
          })),
        ]);
        ((editorCtx.devices = all3?.items || []),
          (editorCtx.deviceNamesByDeviceId = new Map(
            editorCtx.devices
              .map((mappedItemsCache: any) => [
                String(mappedItemsCache.deviceId || ""),
                runCursor(mappedItemsCache.name),
              ] as const)
              .filter(
                ([entitiesResponseState, entitiesResponseValue]: any) =>
                  entitiesResponseState && entitiesResponseValue,
              ),
          )),
          (editorCtx.entityResourcesByDeviceId = all4?.resources || {}),
          (editorCtx.isAreEntitiesLoaded = true));
        const mappedItemByIdById = new Map(
            nasProfiles2(editorCtx.entities, editorCtx.devices).map((mappedItemsQueue) => [
              mappedItemsQueue.deviceId,
              mappedItemsQueue,
            ]),
          ),
          entitiesResponseConfig = reconcileNasDocument2(
            editorCtx.activeProject?.document,
            mappedItemByIdById,
          ),
          devicesResponseState = reconcileNasDocument2(editorCtx.baselineDocument, mappedItemByIdById);
        editorCtx.savedDocumentSignature = documentSignature2(editorCtx.baselineDocument);
        for (const translationsResponse of [...historyState.undo, ...historyState.redo])
          for (const deviceState of ["document", "beforeSavedDocument", "afterSavedDocument"])
            reconcileNasDocument2(translationsResponse[deviceState], mappedItemByIdById);
        if (editorCtx.recoverySnapshot) {
          reconcileNasDocument2(editorCtx.recoverySnapshot.document, mappedItemByIdById);
          for (const deviceIdKey of [
            ...(editorCtx.recoverySnapshot.undo || []),
            ...(editorCtx.recoverySnapshot.redo || []),
          ])
            for (const deviceNameValueState of [
              "document",
              "beforeSavedDocument",
              "afterSavedDocument",
            ])
              reconcileNasDocument2(deviceIdKey[deviceNameValueState], mappedItemByIdById);
          documentSignature2(editorCtx.recoverySnapshot.document) === editorCtx.savedDocumentSignature &&
            (discardRecoverySnapshot(editorCtx.activeProject.projectId),
            (editorCtx.recoverySnapshot = null),
            recoveryDialogElement.open && recoveryDialogElement.close());
        }
        (editorCtx.editorRenderer?.setEntityCatalog(editorCtx.entities, editorCtx.entityResourcesByDeviceId, editorCtx.devices),
          editorCtx.dashboardPreviewRenderer?.setEntityCatalog(editorCtx.entities, editorCtx.entityResourcesByDeviceId, editorCtx.devices),
          runExtraLower(),
          (entitiesResponseConfig || devicesResponseState) &&
            writeError({
              preserveRecovery: !!editorCtx.recoverySnapshot,
            }),
          document.activeElement?.closest?.(".inspector-form") || coverMotorButtonElement());
      })().finally(() => {
        editorCtx.entitiesLoadPromise = null;
      })),
      editorCtx.entitiesLoadPromise);
}
function runExtraOuter(runExtraUpper: any, catalogEntityRecord = editorCtx.selectedPopupId) {
  const devicesResponse = runExtraUpper?.customPopups || [];
  if (
    (popupSelectElement.replaceChildren(),
    popupListElement.replaceChildren(),
    !devicesResponse.length)
  ) {
    ((editorCtx.selectedPopupId = null),
      popupSelectElement.append(new Option("暂无组合弹窗", "")),
      (popupSelectElement.disabled = true),
      (popupActionsButtonElement.disabled = true),
      loadNavigationIconOptions(popupSelectElement));
    const popupEmptyElement = document.createElement("div");
    ((popupEmptyElement.className = "popup-list-empty"),
      (popupEmptyElement.textContent = "还没有组合弹窗"),
      popupListElement.append(popupEmptyElement));
    return;
  }
  for (const popupEntryState of devicesResponse)
    popupSelectElement.append(new Option(popupEntryState.name, popupEntryState.id));
  ((editorCtx.selectedPopupId = devicesResponse.some(
    (candidatePopupState: any) => candidatePopupState.id === catalogEntityRecord,
  )
    ? catalogEntityRecord
    : devicesResponse[0].id),
    (popupSelectElement.value = editorCtx.selectedPopupId),
    (popupSelectElement.disabled = false),
    (popupActionsButtonElement.disabled = false),
    loadNavigationIconOptions(popupSelectElement));
  for (const popupItemState of devicesResponse) {
    const popupItemButtonElement = document.createElement("button");
    ((popupItemButtonElement.type = "button"),
      (popupItemButtonElement.className =
        "popup-list-item" + (popupItemState.id === editorCtx.selectedPopupId ? " selected" : "")),
      (popupItemButtonElement.dataset.popupId = popupItemState.id),
      popupItemButtonElement.setAttribute("role", "option"),
      popupItemButtonElement.setAttribute(
        "aria-selected",
        String(popupItemState.id === editorCtx.selectedPopupId),
      ));
    const popupItemNameElementElement = document.createElement("span");
    popupItemNameElementElement.textContent = popupItemState.name;
    const popupItemMetaElementElement = document.createElement("small");
    ((popupItemMetaElementElement.textContent = (popupItemState.modules || []).length + " 个模块"),
      popupItemButtonElement.append(popupItemNameElementElement, popupItemMetaElementElement),
      popupListElement.append(popupItemButtonElement));
  }
}
function runExtraLower() {
  for (const translationsResponseElementElement of document.querySelectorAll<HTMLInputElement>(
    "[data-popup-entity]",
  )) {
    const translationsResponseElementPanel =
      translationsResponseElementElement.closest("[data-action-trigger]");
    (!translationsResponseElementElement.value &&
      editorCtx.entities[0]?.entityId &&
      (translationsResponseElementElement.value = editorCtx.entities[0].entityId),
      syncPopupEntityButton(translationsResponseElementPanel));
    const translationsResponseElement = translationsResponseElementPanel?.querySelector<HTMLElement>(
      "[data-popup-entity-menu]",
    );
    translationsResponseElement &&
      !translationsResponseElement.hidden &&
      renderPopupEntityOptions(
        translationsResponseElementPanel,
        translationsResponseElementPanel!.querySelector<HTMLInputElement>("[data-popup-entity-search]")?.value || "",
      );
  }
}
function runExtraLeft(device = popupModuleFormElement.elements.deviceType.value) {
  const isDevice = popupModuleFormElement.elements.type.value === "climate",
    deviceIdKeyState = normalizedPopupClimateDeviceType2(device);
  ((popupModuleClimateDeviceTypeElement.hidden = !isDevice),
    (popupModuleFormElement.elements.deviceType.value = deviceIdKeyState));
  for (const deviceIdKeyElement of popupModuleClimateDeviceTypeElement.querySelectorAll(
    "[data-popup-module-device-type]",
  )) {
    const isDeviceNameValue = deviceIdKeyElement.dataset.popupModuleDeviceType === deviceIdKeyState;
    (deviceIdKeyElement.classList.toggle("active", isDeviceNameValue),
      deviceIdKeyElement.setAttribute("aria-pressed", String(isDeviceNameValue)));
  }
}
function deviceNameValue(renderPopupList: any) {
  return (
    editorCtx.entities.find((sourceDocument: any) => sourceDocument.entityId === renderPopupList)?.name ||
    renderPopupList ||
    "未选择实体"
  );
}
function initialPopupId() {
  const customPopupList = popupModuleFormElement.elements.entityId.value,
    customPopupListState = editorCtx.entities.find(
      (renderPopupListState: any) => renderPopupListState.entityId === customPopupList,
    ),
    customPopupListValue = customPopupListState
      ? "[" + runQueue(customPopupListState) + "] " + runSnapshot(customPopupListState)
      : customPopupList || "选择实体";
  (runBackup(
    popupModuleEntityButtonElement,
    customPopupListValue,
    customPopupList || customPopupListValue,
  ),
    (popupModuleEntityButtonElement.dataset.entityId = customPopupList),
    popupModuleEntityButtonElement._entityCopySync?.());
}
function runExtraRight(runExtraFirst = popupModuleEntitySearchElement.value) {
  const customPopupListConfig = popupModuleFormElement.elements.entityId.value,
    popupEmptyElementState = String(runExtraFirst || "")
      .trim()
      .toLocaleLowerCase("zh-CN"),
    mappedItemsBuffer = editorCtx.entities
      .map((mappedItemsCursor: any, mappedItemsPointer: any) => ({
        entity: mappedItemsCursor,
        index: mappedItemsPointer,
      }))
      .filter(
        ({ entity: popupEntryValue }: any) =>
          !popupEmptyElementState ||
          (runMode(popupEntryValue) + " " + popupEntryValue.entityId)
            .toLocaleLowerCase("zh-CN")
            .includes(popupEmptyElementState),
      )
      .sort(
        (popupEntryConfig: any, popupEntry: any) =>
          Number(
            popupModuleEntityRecommended2(
              popupEntry.entity,
              popupModuleFormElement.elements.type.value,
            ),
          ) -
            Number(
              popupModuleEntityRecommended2(
                popupEntryConfig.entity,
                popupModuleFormElement.elements.type.value,
              ),
            ) || popupEntryConfig.index - popupEntry.index,
      )
      .map(({ entity: candidatePopup }: any) => candidatePopup);
  if (
    (popupModuleEntityOptionsElement.replaceChildren(
      ...mappedItemsBuffer.map((popupItem: any) => {
        const popupItemElementElement = document.createElement("button");
        ((popupItemElementElement.type = "button"),
          (popupItemElementElement.className =
            "inspector-entity-option" +
            (popupItem.entityId === customPopupListConfig ? " selected" : "")),
          (popupItemElementElement.dataset.popupModuleEntityId = popupItem.entityId),
          popupItemElementElement.setAttribute("role", "option"),
          popupItemElementElement.setAttribute(
            "aria-selected",
            String(popupItem.entityId === customPopupListConfig),
          ));
        const popupItemButtonPanel = document.createElement("span");
        popupItemButtonPanel.className = "inspector-entity-option-content";
        const popupItemButton = document.createElement("span");
        ((popupItemButton.className = "inspector-entity-option-line inspector-entity-name-line"),
          (popupItemButton.textContent =
            "[" + runQueue(popupItem) + "] " + runSnapshot(popupItem)));
        const popupItemNameElement = document.createElement("span");
        return (
          (popupItemNameElement.className = "inspector-entity-option-line inspector-entity-id"),
          (popupItemNameElement.textContent = popupItem.entityId),
          popupItemButtonPanel.append(popupItemButton, popupItemNameElement),
          runAlt(popupItemElementElement, popupItemButton),
          popupItemElementElement.append(popupItemButtonPanel),
          popupItemElementElement
        );
      }),
    ),
    !mappedItemsBuffer.length)
  ) {
    const popupItemMetaElement = document.createElement("div");
    ((popupItemMetaElement.className = "inspector-picker-empty"),
      (popupItemMetaElement.textContent = "没有匹配的实体"),
      popupModuleEntityOptionsElement.append(popupItemMetaElement));
  }
}
function closePopupModuleEntityMenu() {
  ((popupModuleEntityMenuElement.hidden = true),
    popupModuleEntityButtonElement.setAttribute("aria-expanded", "false"));
}
function openPopupModuleDialog(popupModule: any = null) {
  if (!findCustomPopup2(editorCtx.activeProject?.document, editorCtx.selectedPopupId)) return;
  ((editorCtx.selectedPopupModuleId = popupModule?.id || null),
    (popupModuleDialogTitleElement.textContent = popupModule ? "编辑弹窗模块" : "添加弹窗模块"));
  const moduleTypeName = popupModule?.type === "capability-device" ? "generic" : popupModule?.type;
  ((popupModuleFormElement.elements.type.value = [
    "light",
    "climate",
    "air-purifier",
    "water-heater",
    "media-player",
    "electric-bed",
    "switch",
    "cover",
    "camera",
    "line-chart",
    "generic",
  ].includes(moduleTypeName)
    ? moduleTypeName
    : "light"),
    loadNavigationIconOptions(popupModuleFormElement.elements.type));
  const defaultEntity =
    editorCtx.entities.find((entityCandidate: any) =>
      popupModuleEntityRecommended2(entityCandidate, popupModuleFormElement.elements.type.value),
    ) || editorCtx.entities[0];
  ((popupModuleFormElement.elements.entityId.value =
    popupModule?.entityId || defaultEntity?.entityId || ""),
    (popupModuleFormElement.elements.title.value = popupModule?.title || ""),
    runExtraLeft(popupModule?.properties?.deviceType || popupModule?.deviceType || "auto"),
    (popupModuleEntitySearchElement.value = ""),
    initialPopupId(),
    popupModuleEntityOptionsElement.replaceChildren(),
    closePopupModuleEntityMenu(),
    popupModuleDialogElement.showModal());
}
function renderPageSelect(projectDocument: any, preferredPagePath: any = null) {
  if ((pageSelectElement.replaceChildren(), !projectDocument.pages.length))
    return (
      pageSelectElement.append(new Option("暂无页面", "")),
      (pageSelectElement.disabled = true),
      loadNavigationIconOptions(pageSelectElement),
      false
    );
  const defaultPagePath = projectDocument.pages.some(
    (pageRecord: any) => pageRecord.path === projectDocument.defaultPagePath,
  )
    ? projectDocument.defaultPagePath
    : null;
  for (const pageEntry of projectDocument.pages) {
    const option = new Option(pageEntry.name, pageEntry.path);
    ((option.dataset.defaultPage = String(pageEntry.path === defaultPagePath)),
      pageSelectElement.append(option));
  }
  return (
    (pageSelectElement.disabled = false),
    (pageSelectElement.value =
      preferredPagePath &&
      projectDocument.pages.some((pageCheck: any) => pageCheck.path === preferredPagePath)
        ? preferredPagePath
        : defaultPagePath || projectDocument.pages[0].path),
    loadNavigationIconOptions(pageSelectElement),
    true
  );
}
function retainExistingSelection(documentToCheck: any, pagePathFilter: any) {
  const candidateSelectionIds = editorCtx.selectedComponentIdsSet.size
    ? [...editorCtx.selectedComponentIdsSet]
    : editorCtx.selectedComponentId
      ? [editorCtx.selectedComponentId]
      : [];
  ((editorCtx.selectedComponentIdsSet = new Set(
    candidateSelectionIds.filter((componentIdCandidate) => {
      const candidateComponent = findComponent2(documentToCheck, componentIdCandidate);
      return (
        candidateComponent &&
        (candidateComponent.scope !== "page" || candidateComponent.page?.path === pagePathFilter)
      );
    }),
  )),
    editorCtx.selectedComponentIdsSet.has(editorCtx.selectedComponentId) ||
      (editorCtx.selectedComponentId = editorCtx.selectedComponentIdsSet.values().next().value || null),
    editorCtx.selectedComponentId || (editorCtx.selectionAnchorComponentId = null));
}
const structureVolatileTypesSet = new Set();
function collectChangedComponents(previousDocument: any, nextDocument: any, runExtraSecond: any) {
  if (
    editorCtx.editorMode !== "edit" ||
    !editorCtx.editorRenderer ||
    editorCtx.editorRenderer.page?.path !== runExtraSecond ||
    editorDocumentFrameSignature2(previousDocument) !== editorDocumentFrameSignature2(nextDocument)
  )
    return null;
  const previousEntries = editorComponentEntries2(previousDocument),
    nextEntries = editorComponentEntries2(nextDocument);
  if (
    previousEntries.order.length !== nextEntries.order.length ||
    previousEntries.order.some(
      (orderComponentId: any, orderIndex: any) => orderComponentId !== nextEntries.order[orderIndex],
    ) ||
    previousEntries.entries.size !== nextEntries.entries.size
  )
    return null;
  const changedComponents: any[] = [];
  for (const [componentIdKey, previousEntry] of previousEntries.entries) {
    const nextEntry = nextEntries.entries.get(componentIdKey);
    if (
      !nextEntry ||
      previousEntry.scope !== nextEntry.scope ||
      previousEntry.pagePath !== nextEntry.pagePath ||
      previousEntry.parentId !== nextEntry.parentId ||
      structureVolatileTypesSet.has(previousEntry.component.type) ||
      editorComponentStructure2(previousEntry.component) !==
        editorComponentStructure2(nextEntry.component)
    )
      return null;
    const { children: component3, ...component4 } = previousEntry.component,
      { children: component5, ...component6 } = nextEntry.component;
    if (JSON.stringify(component4) !== JSON.stringify(component6)) {
      if (!editorCtx.editorRenderer.componentHosts.has(componentIdKey)) {
        let ancestorEntry = nextEntry;
        for (; ancestorEntry.parentId;)
          ancestorEntry = nextEntries.entries.get(ancestorEntry.parentId);
        if (
          nextEntry.scope === "shared"
            ? (editorCtx.editorRenderer.page.sharedComponentIds || []).includes(ancestorEntry.component.id)
            : nextEntry.pagePath === runExtraSecond
        )
          return null;
        continue;
      }
      changedComponents.push({
        componentId: componentIdKey,
        component: nextEntry.component,
      });
    }
  }
  return changedComponents;
}
function collectPageComponentBounds(): Array<{
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}> {
  const page = currentPage();
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

function alignSelectedComponents(mode: AlignMode) {
  const selectedBounds = collectPageComponentBounds().filter((bounds) =>
    editorCtx.selectedComponentIdsSet.has(bounds.id),
  );
  const nextPositions = computeAlignedPositions(selectedBounds, mode);
  if (!nextPositions.length) return;
  mutateDocument((alignDocument: any) => {
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

function ensureEditorRenderer() {
  return (
    editorCtx.editorRenderer ||
    ((editorCtx.editorRenderer = new PanelRenderer2(editorCanvasElement, {
      editable: true,
      editorWorkspace: true,
      historySeriesCache: historySeriesCacheById,
      runtimeStateCache: runtimeStateCacheById,
      virtualEntityStateCache: virtualEntityStateCacheById,
      onSelectionChange(nextIds: string[], primaryId: string | null) {
        editorCtx.selectedComponentIdsSet = new Set(nextIds || []);
        editorCtx.selectedComponentId = primaryId || null;
        editorCtx.selectionAnchorComponentId = editorCtx.selectedComponentId;
        renderComponentLists();
        coverMotorButtonElement();
        syncHistoryButtons();
      },
      onComponentTransform(transformedComponentId: any, componentTransform: any) {
        ((editorCtx.selectedComponentId = transformedComponentId),
          (editorCtx.selectedComponentIdsSet = new Set([transformedComponentId])),
          mutateDocument((transformDocument: any) => {
            const draftComponent = findComponent2(
              transformDocument,
              transformedComponentId,
            )?.component;
            if (!draftComponent) return;
            const $e2 = entryStateRecord(draftComponent, "width"),
              $e3 = entryStateRecord(draftComponent, "height"),
              $e4 = entryStateRecord(draftComponent, "scale"),
              $e5 = entryStateRecord(draftComponent, "rotation"),
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
              navigationLabelTextInputElement(draftComponent) &&
                Number.isFinite(componentTransform.width) &&
                onImageAssetUploadButtonClick(
                  transformedComponentId,
                  "width",
                  $e2,
                  entryStateRecord(draftComponent, "width"),
                ),
              navigationLabelTextInputElement(draftComponent) &&
                Number.isFinite(componentTransform.height) &&
                onImageAssetUploadButtonClick(
                  transformedComponentId,
                  "height",
                  $e3,
                  entryStateRecord(draftComponent, "height"),
                ),
              navigationLabelTextInputElement(draftComponent) &&
                Number.isFinite(componentTransform.scale) &&
                onImageAssetUploadButtonClick(
                  transformedComponentId,
                  "scale",
                  $e4,
                  entryStateRecord(draftComponent, "scale"),
                ),
              navigationLabelTextInputElement(draftComponent) &&
                Number.isFinite(componentTransform.rotation) &&
                onImageAssetUploadButtonClick(
                  transformedComponentId,
                  "rotation",
                  $e5,
                  entryStateRecord(draftComponent, "rotation"),
                ));
          }));
      },
      onComponentsTransform(leadComponentId: any, transformDraftDocument: any) {
        ((editorCtx.selectedComponentId = transformDraftDocument),
          mutateDocument((transformEntry: any) => {
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
        ((editorCtx.selectedComponentId = sourceComponentId.id),
          (editorCtx.selectedComponentIdsSet = new Set([sourceComponentId.id])),
          (editorCtx.selectionAnchorComponentId = sourceComponentId.id),
          mutateDocument((copiedComponent: any) => {
            duplicateComponent(copiedComponent, sourceComponentIdState, sourceComponentId, false);
          }));
      },
      onComponentsDuplicate(duplicateDraftDocument: any, _copiedComponentEntries: any, draggedCopyId: any) {
        const copiedComponentIds = duplicateDraftDocument.map(
          (copiedComponentEntry: any) => copiedComponentEntry.copiedComponent.id,
        );
        ((editorCtx.selectedComponentId = draggedCopyId || copiedComponentIds[0] || null),
          (editorCtx.selectedComponentIdsSet = new Set(copiedComponentIds)),
          (editorCtx.selectionAnchorComponentId = editorCtx.selectedComponentId),
          mutateDocument((duplicateApplyDocument: any) => {
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
        applyTransformToInspector(previewedComponentId, previewedTransformPatch);
      },
      onComponentProperties(propertyComponentId: any, propertyPatch: any) {
        mutateDocument((propertyDraftDocument: any) => {
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
        previewPropertyComponentId === editorCtx.selectedComponentId &&
          (Number.isFinite(previewPropertyPatch.airflowScale) &&
            (airConditionerAirflowScaleElement.value = roundField2(
              previewPropertyPatch.airflowScale * 100,
            )),
          Number.isFinite(previewPropertyPatch.airflowRotation) &&
            (airConditionerAirflowRotationElement.value = roundField2(
              previewPropertyPatch.airflowRotation,
            )),
          Number.isFinite(previewPropertyPatch.airflowOffsetX) &&
            (airConditionerAirflowOffsetXElement.value = roundField2(
              previewPropertyPatch.airflowOffsetX,
            )),
          Number.isFinite(previewPropertyPatch.airflowOffsetY) &&
            (airConditionerAirflowOffsetYElement.value = roundField2(
              previewPropertyPatch.airflowOffsetY,
            )));
      },
      onComponentsTransformPreview(previewTransformList: any, previewLeadComponentId: any) {
        editorCtx.selectedComponentId = previewLeadComponentId;
        const matchedTransformPreview = previewTransformList.find(
          (candidateTransformEntry: any) =>
            candidateTransformEntry.componentId === previewLeadComponentId,
        );
        matchedTransformPreview &&
          applyTransformToInspector(previewLeadComponentId, matchedTransformPreview);
      },
      onError: handleOperationError,
      onRuntimeStateChange() {
        const runtimeSelectedComponent = removedComponent();
        runtimeSelectedComponent?.type === "light-statistics" && runZone(runtimeSelectedComponent);
      },
      onPageChange(pageSelection: any) {
        ((pageSelectElement.value = pageSelection.path),
          loadNavigationIconOptions(pageSelectElement),
          retainExistingSelection(editorCtx.activeProject?.document, pageSelection.path),
          editorCtx.editorRenderer?.setSelectedComponents([...editorCtx.selectedComponentIdsSet], editorCtx.selectedComponentId),
          renderComponentLists(),
          coverMotorButtonElement());
      },
    })),
    editorCtx.editorRenderer.setEntityCatalog(editorCtx.entities, editorCtx.entityResourcesByDeviceId, editorCtx.devices),
    editorCtx.editorRenderer)
  );
}
function renderEditorWorkspace(activePagePath: any = null) {
  (refreshSoundToggle(),
    renderWorkspaceResolution(),
    runExtraOuter(editorCtx.activeProject.document, editorCtx.selectedPopupId));
  const dL2 = renderPageSelect(editorCtx.activeProject.document, activePagePath);
  if ((setPageControlsEnabled(dL2), resizeWorkspaceCanvas(), !dL2)) {
    (clearComponentSelection(),
      editorCtx.editorRenderer?.destroy(),
      (editorCtx.editorRenderer = null),
      (editorCanvasElement.innerHTML =
        '<div class="canvas-message"><strong>请从左侧新建页面。</strong></div>'),
      renderComponentLists(),
      coverMotorButtonElement(),
      runCase(activePagePath),
      editorCtx.editorMode === "popup" && renderCustomPopupEditor());
    return;
  }
  (retainExistingSelection(editorCtx.activeProject.document, pageSelectElement.value),
    editorCtx.editorMode === "edit"
      ? (ensureEditorRenderer().setDocument(editorCtx.activeProject.document, pageSelectElement.value),
        editorCtx.editorRenderer.setActiveGroup(editorCtx.activeGroupId),
        editorCtx.editorRenderer.setSelectedComponents([...editorCtx.selectedComponentIdsSet], editorCtx.selectedComponentId))
      : (editorCtx.editorRenderer?.destroy(), (editorCtx.editorRenderer = null)),
    renderComponentLists(),
    coverMotorButtonElement(),
    editorCtx.editorMode === "dashboard"
      ? runCase(pageSelectElement.value)
      : editorCtx.editorMode === "popup"
        ? renderCustomPopupEditor()
        : runSlot());
}
function syncHistoryButtons() {
  ((undoElement.disabled =
    editorCtx.isSaving || historyState.busy || !historyState.undo.length || !editorCtx.activeProject),
    (redoElement.disabled =
      editorCtx.isSaving || historyState.busy || !historyState.redo.length || !editorCtx.activeProject));
  patchEditorFacadeState({
    dirty: editorCtx.hasUnsavedChanges,
    saveState: editorCtx.isSaving ? "saving" : editorCtx.hasUnsavedChanges ? "dirty" : "idle",
    projectId: editorCtx.activeProject?.projectId || null,
    projectName: editorCtx.activeProject?.name || editorCtx.activeProject?.title || "",
    pagePath: pageSelectElement?.value || null,
    canvasZoom: editorCtx.editorCanvasZoom,
    history: {
      canUndo: !undoElement.disabled,
      canRedo: !redoElement.disabled,
      undoDepth: historyState.undo.length,
      redoDepth: historyState.redo.length,
    },
    selection: {
      ids: [...editorCtx.selectedComponentIdsSet],
      primaryId: editorCtx.selectedComponentId || null,
    },
  });
}

function applyEditorCanvasZoom(nextZoom: number) {
  editorCtx.editorCanvasZoom = applyEditorZoomCss(nextZoom, [editorCanvasElement, dashboardPreviewElement]);
  patchEditorFacadeState({ canvasZoom: editorCtx.editorCanvasZoom });
  resizeWorkspaceCanvas();
}

function selectAllPageComponents() {
  const page = currentPage();
  const ids = (page?.components || []).map((componentEntry: any) => componentEntry.id).filter(Boolean);
  if (!ids.length) return;
  editorCtx.selectedComponentIdsSet = new Set(ids);
  editorCtx.selectedComponentId = ids[0];
  editorCtx.selectionAnchorComponentId = editorCtx.selectedComponentId;
  coverMotorButtonElement();
  syncHistoryButtons();
}
function discardRecoverySnapshot(recoveryProjectId = editorCtx.activeProject?.projectId) {
  if (recoveryProjectId) {
    recoveryWriter.cancel(recoveryProjectId);
    try {
      sessionStorage.removeItem(recoveryStorageKey2(RECOVERY_STORAGE_PREFIX, recoveryProjectId));
    } catch { /* 存储写入是 best-effort：隐私模式 / 配额 / 序列化失败都不应影响本次渲染 */ }
  }
}
function readRecoverySnapshot(snapshotProjectId: any) {
  try {
    const item = sessionStorage.getItem(
      recoveryStorageKey2(RECOVERY_STORAGE_PREFIX, snapshotProjectId),
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
const recoveryWriter = createRecoveryWriter2(persistRecoverySnapshot);
(window.addEventListener("pagehide", recoveryWriter.flush),
  window.addEventListener("beforeunload", recoveryWriter.flush),
  document.addEventListener("visibilitychange", () => {
    document.hidden && recoveryWriter.flush();
  }));
function scheduleRecoverySnapshot() {
  if (!editorCtx.activeProject || !editorCtx.hasUnsavedChanges) return;
  const recoveryFailureNotifiedProjectId = {
    projectId: editorCtx.activeProject.projectId,
    revision: editorCtx.activeProject.revision,
    document: editorCtx.activeProject.document,
    selectedPath: pageSelectElement.value,
    selectedComponentId: editorCtx.selectedComponentId,
    selectedComponentIds: [...editorCtx.selectedComponentIdsSet],
    undo: [...historyState.undo],
    redo: [...historyState.redo],
    savedAt: new Date().toISOString(),
  };
  recoveryWriter.schedule(recoveryFailureNotifiedProjectId);
}
function persistRecoverySnapshot(recoveryState: any) {
  try {
    sessionStorage.setItem(
      recoveryStorageKey2(RECOVERY_STORAGE_PREFIX, recoveryState.projectId),
      JSON.stringify(recoveryState),
    );
  } catch {
    try {
      sessionStorage.setItem(
        recoveryStorageKey2(RECOVERY_STORAGE_PREFIX, recoveryState.projectId),
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
function writeError({
  preserveRecovery: notifyRecoveryWriteFailure = false,
  signature: runExtraLast = null,
}: any = {}) {
  ((editorCtx.hasUnsavedChanges =
    !!editorCtx.activeProject &&
    (runExtraLast ?? documentSignature2(editorCtx.activeProject.document)) !== editorCtx.savedDocumentSignature),
    (saveButtonElement.disabled = !editorCtx.activeProject || !editorCtx.hasUnsavedChanges || editorCtx.isSaving),
    editorCtx.hasUnsavedChanges
      ? scheduleRecoverySnapshot()
      : notifyRecoveryWriteFailure || discardRecoverySnapshot());
}
function runExtraOld() {
  ((historyState.undo = []),
    (historyState.redo = []),
    (historyState.busy = false),
    syncHistoryButtons());
}
function refreshDirtyState(keepRecovery: any, signatureOverride: any) {
  for (
    keepRecovery.push(signatureOverride);
    keepRecovery.filter((resetHistoryState: any) => resetHistoryState.kind !== "save").length >
    MAX_HISTORY_ENTRIES;
  ) {
    const pushHistoryEntryState = keepRecovery.findIndex(
      (pushHistoryEntry: any) => pushHistoryEntry.kind !== "save",
    );
    if (pushHistoryEntryState < 0) break;
    keepRecovery.splice(pushHistoryEntryState, 1);
  }
  keepRecovery.length > MAX_HISTORY_ENTRIES * 2 &&
    keepRecovery.splice(0, keepRecovery.length - MAX_HISTORY_ENTRIES * 2);
}
function historyEntries() {
  return {
    kind: "edit",
    document: clone2(editorCtx.activeProject.document),
    selectedPath: pageSelectElement.value,
    selectedComponentId: editorCtx.selectedComponentId,
    selectedComponentIds: [...editorCtx.selectedComponentIdsSet],
  };
}
async function historyEntry(prunedEntry: any, pruneCandidate: any = null) {
  const createEditHistoryEntryState = ++editorCtx.activeProjectState;
  recoveryWriter.flush();
  let createEditHistoryEntry;
  try {
    if (
      ((createEditHistoryEntry = await requestJson("/projects/" + prunedEntry + "/draft")),
      createEditHistoryEntryState !== editorCtx.activeProjectState)
    )
      return;
  } catch (openProjectDraft: any) {
    if (createEditHistoryEntryState !== editorCtx.activeProjectState) return;
    throw openProjectDraft;
  }
  (recoveryWriter.flush(),
    (editorCtx.activeProject = createEditHistoryEntry),
    (editorCtx.componentScopeState += 1),
    window.HomeOSLog?.setContext!({
      projectId: prunedEntry,
    })!,
    navigationButtonSavedSettingsByComponentId.clear(),
    clearCoverMotorDirectionValueById(),
    panelFrameBaselineByComponentId.clear(),
    lineChartBaselineByComponentId.clear(),
    iconButtonEffectBaselineByComponentId.clear(),
    iconButtonBaselineByComponentId.clear(),
    airConditionerBaselineByComponentId.clear());
  const mappedItemByIdByKey = new Map(
    nasProfiles2(editorCtx.entities, editorCtx.devices).map((requestedProjectId) => [
      requestedProjectId.deviceId,
      requestedProjectId,
    ]),
  );
  (reconcileNasDocument2(editorCtx.activeProject.document, mappedItemByIdByKey),
    (editorCtx.baselineDocument = clone2(editorCtx.activeProject.document)),
    (editorCtx.savedDocumentSignature = documentSignature2(editorCtx.activeProject.document)),
    (editorCtx.recoverySnapshot = readRecoverySnapshot(prunedEntry)),
    editorCtx.recoverySnapshot && reconcileNasDocument2(editorCtx.recoverySnapshot.document, mappedItemByIdByKey),
    editorCtx.recoverySnapshot &&
      (editorCtx.recoverySnapshot.revision !== editorCtx.activeProject.revision ||
        documentSignature2(editorCtx.recoverySnapshot.document) === editorCtx.savedDocumentSignature) &&
      (discardRecoverySnapshot(prunedEntry), (editorCtx.recoverySnapshot = null)),
    clearComponentSelection(),
    runExtraOld(),
    writeError({
      preserveRecovery: !!editorCtx.recoverySnapshot,
    }),
    runKey(true),
    (projectSelectElement.value = prunedEntry),
    loadNavigationIconOptions(projectSelectElement),
    renderEditorWorkspace(pruneCandidate),
    rememberEditorProject2(prunedEntry),
    editorCtx.recoverySnapshot && !editorCtx.isAreEntitiesLoaded && (await ensureEntitiesLoaded().catch(() => {})),
    createEditHistoryEntryState === editorCtx.activeProjectState &&
      editorCtx.recoverySnapshot &&
      editorCtx.activeProject?.projectId === prunedEntry &&
      !recoveryDialogElement.open &&
      recoveryDialogElement.showModal());
}
async function initialPagePath(loadProjects: any = null) {
  if (
    ((editorCtx.projects = (await requestJson("/projects")).items || []),
    projectSelectElement.replaceChildren(),
    !editorCtx.projects.length)
  ) {
    ((editorCtx.activeProjectState += 1),
      (editorCtx.componentScopeState += 1),
      editorCtx.editorRenderer?.destroy(),
      (editorCtx.editorRenderer = null),
      runSlot(),
      (editorCtx.activeProject = null),
      navigationButtonSavedSettingsByComponentId.clear(),
      clearCoverMotorDirectionValueById(),
      panelFrameBaselineByComponentId.clear(),
      lineChartBaselineByComponentId.clear(),
      iconButtonEffectBaselineByComponentId.clear(),
      iconButtonBaselineByComponentId.clear(),
      airConditionerBaselineByComponentId.clear(),
      clearComponentSelection(),
      (editorCtx.baselineDocument = null),
      (editorCtx.savedDocumentSignature = ""),
      (editorCtx.recoverySnapshot = null),
      runExtraOld(),
      writeError(),
      runKey(false),
      setPageControlsEnabled(false),
      projectSelectElement.append(new Option("暂无仪表盘", "")),
      pageSelectElement.replaceChildren(new Option("暂无页面", "")),
      popupSelectElement.replaceChildren(new Option("暂无组合弹窗", "")),
      (popupListElement.innerHTML = '<div class="popup-list-empty">还没有组合弹窗</div>'),
      (projectSelectElement.disabled = true),
      (pageSelectElement.disabled = true),
      (popupSelectElement.disabled = true),
      (popupActionsButtonElement.disabled = true),
      loadNavigationIconOptions(projectSelectElement),
      loadNavigationIconOptions(pageSelectElement),
      loadNavigationIconOptions(popupSelectElement),
      renderComponentLists(),
      runCase());
    return;
  }
  for (const preferredProjectId of editorCtx.projects)
    projectSelectElement.append(new Option(preferredProjectId.name, preferredProjectId.id));
  ((projectSelectElement.disabled = false), loadNavigationIconOptions(projectSelectElement));
  const projectSummaryState = restoredEditorProject2(editorCtx.projects, loadProjects);
  await historyEntry(projectSummaryState);
}
async function projectSummary(
  applyDocumentChange: any,
  updatedDocument = pageSelectElement.value,
  { recordHistory: targetPagePath = true, expectedSignature: shouldRecordHistory = null }: any = {},
) {
  if (!editorCtx.activeProject) throw new Error("请先选择仪表盘。");
  const projectId = editorCtx.activeProject.projectId,
    Ie3 = editorCtx.componentScopeState,
    document2 = editorCtx.activeProject.document,
    currentDocument = shouldRecordHistory ?? documentSignature2(document2),
    updatedSignature = () => {
      if (documentSignature2(editorCtx.activeProject.document) !== currentDocument)
        throw new Error("等待期间产生了新编辑，已保留最新内容，请重试刚才的操作。");
    };
  updatedSignature();
  const editHistoryEntry = documentSignature2(applyDocumentChange);
  if (currentDocument === editHistoryEntry) return editorCtx.activeProject;
  try {
    await guardInteraction3dChanges2(document2, applyDocumentChange);
  } catch (caughtErrorValue: any) {
    if (editorCtx.componentScopeState !== Ie3 || editorCtx.activeProject?.projectId !== projectId) return null;
    throw caughtErrorValue;
  }
  if (editorCtx.componentScopeState !== Ie3 || editorCtx.activeProject?.projectId !== projectId) return null;
  updatedSignature();
  const vL2 = collectChangedComponents(document2, applyDocumentChange, updatedDocument),
    hl2 = historyEntries();
  ((editorCtx.activeProject = {
    ...editorCtx.activeProject,
    document: clone2(applyDocumentChange),
  }),
    targetPagePath && (refreshDirtyState(historyState.undo, hl2), (historyState.redo = [])));
  const matchingProject = editorCtx.projects.find(
    (candidateProject: any) => candidateProject.id === editorCtx.activeProject.projectId,
  );
  matchingProject && (matchingProject.name = editorCtx.activeProject.document.name);
  const selectedProjectOption = projectSelectElement.selectedOptions[0];
  return (
    selectedProjectOption && (selectedProjectOption.textContent = editorCtx.activeProject.document.name),
    loadNavigationIconOptions(projectSelectElement),
    vL2 && editorCtx.editorRenderer?.applyEditorComponentUpdates(editorCtx.activeProject.document, updatedDocument, vL2)
      ? (renderComponentLists(), coverMotorButtonElement())
      : interaction3dEntryActive() || renderEditorWorkspace(updatedDocument),
    writeError({
      signature: editHistoryEntry,
    }),
    syncHistoryButtons(),
    editorCtx.activeProject
  );
}
async function recoverDraftConflict(projectId2: any) {
  let latestDraft;
  try {
    latestDraft = await requestJson("/projects/" + projectId2 + "/draft");
  } catch (refreshLatestError: any) {
    handleOperationError(refreshLatestError);
    return;
  }
  if (!editorCtx.activeProject || editorCtx.activeProject.projectId !== projectId2) return;
  const useRemote = await confirmAction({
    kicker: "REVISION CONFLICT",
    title: "草稿已在其它页面被更新",
    message: "服务器上的这份草稿比你打开的更新，当前版本号已无法直接保存。",
    detail: "「加载远端」丢弃本页未保存的修改；「保留本地并重试」保留当前编辑，改用最新版本号重新保存。",
    confirmLabel: "加载远端",
    cancelLabel: "保留本地并重试",
    tone: "warning",
  });
  if (!editorCtx.activeProject || editorCtx.activeProject.projectId !== projectId2) return;
  if (useRemote) {
    await historyEntry(projectId2);
    return;
  }

  editorCtx.activeProject = {
    ...editorCtx.activeProject,
    revision: latestDraft.revision,
    globalPopupRevision: latestDraft.globalPopupRevision,
  };
  ((editorCtx.isSaving = false), writeError(), syncHistoryButtons());
  await saveDraft();
}
async function saveDraft() {
  if (!editorCtx.activeProject || !editorCtx.hasUnsavedChanges || editorCtx.isSaving || historyState.busy) return;
  const projectId2 = editorCtx.activeProject.projectId,
    Ie4 = editorCtx.componentScopeState,
    baselineBeforeSave = clone2(editorCtx.baselineDocument),
    draftBeforeSave = clone2(editorCtx.activeProject.document),
    draftSignatureBeforeSave = documentSignature2(draftBeforeSave),
    isPopupsDirty =
      documentSignature2(draftBeforeSave.customPopups || []) !==
      documentSignature2(editorCtx.baselineDocument.customPopups || []);
  ((editorCtx.isSaving = true), writeError(), syncHistoryButtons());
  try {
    // 地址框不必先失焦：保存前先本地校验，非法地址不把整份草稿发上去。
    validateGo2rtcDocument(draftBeforeSave);
    const saveResponse = await requestJson("/projects/" + projectId2 + "/draft", {
      method: "PUT",
      hbLogContext: { projectId: projectId2, phase: "save-draft" },
      body: JSON.stringify({
        revision: editorCtx.activeProject.revision,
        globalPopupRevision: editorCtx.activeProject.globalPopupRevision,
        globalPopupsDirty: isPopupsDirty,
        document: draftBeforeSave,
      }),
    });
    if (editorCtx.componentScopeState !== Ie4 || editorCtx.activeProject?.projectId !== projectId2) return;
    const savedProjectSummary = documentSignature2(editorCtx.activeProject.document),
      isPopupsChanged = savedProjectSummary !== draftSignatureBeforeSave,
      document3 = isPopupsChanged ? clone2(editorCtx.activeProject.document) : saveResponse.document;
    (isPopupsChanged &&
      documentSignature2(document3.customPopups || []) ===
        documentSignature2(draftBeforeSave.customPopups || []) &&
      (document3.customPopups = clone2(saveResponse.document.customPopups || [])),
      (editorCtx.activeProject = {
        ...saveResponse,
        document: document3,
      }),
      (editorCtx.baselineDocument = clone2(saveResponse.document)),
      (editorCtx.savedDocumentSignature = documentSignature2(saveResponse.document)),
      isPopupsChanged ||
        (panelFrameBaselineByComponentId.clear(),
        lineChartBaselineByComponentId.clear(),
        iconButtonEffectBaselineByComponentId.clear(),
        iconButtonBaselineByComponentId.clear(),
        airConditionerBaselineByComponentId.clear()),
      refreshDirtyState(historyState.undo, {
        kind: "save",
        beforeSavedDocument: baselineBeforeSave,
        afterSavedDocument: clone2(saveResponse.document),
      }),
      (historyState.redo = []));
    const currentDraftDocument = editorCtx.projects.find(
      (historyStepDirection: any) => historyStepDirection.id === editorCtx.activeProject.projectId,
    );
    currentDraftDocument && (currentDraftDocument.name = editorCtx.activeProject.document.name);
    const validComponentIds = projectSelectElement.selectedOptions[0];
    (validComponentIds && (validComponentIds.textContent = editorCtx.activeProject.document.name),
      loadNavigationIconOptions(projectSelectElement),
      documentSignature2(editorCtx.activeProject.document) !== savedProjectSummary &&
        renderEditorWorkspace(pageSelectElement.value));
  } catch (refreshAuthSession: any) {
    if (refreshAuthSession?.code === "PROJECT_REVISION_CONFLICT") {
      await recoverDraftConflict(projectId2);
      return;
    }
    handleOperationError(refreshAuthSession);
  } finally {
    ((editorCtx.isSaving = false), writeError(), syncHistoryButtons());
  }
}
/**
 * 3D 配置入口 / 弹窗是否正开着。
 *
 * 自动重载（HA 目录变化、撤销重做）时不要重置 2D 画布：否则会把正在编辑的
 * 3D 入口、楼层弹窗或借用中的预览一起关掉。
 */
function interaction3dEntryActive() {
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
async function loadHaConnection(keepHaForm: any, refreshHaSyncStatus: any) {
  const projectId3 = editorCtx.activeProject.projectId,
    Ie5 = editorCtx.componentScopeState,
    beforeSavedDocument =
      refreshHaSyncStatus === "undo"
        ? keepHaForm.beforeSavedDocument
        : keepHaForm.afterSavedDocument,
    isPopupsChangedActive =
      documentSignature2(beforeSavedDocument.customPopups || []) !==
      documentSignature2(editorCtx.baselineDocument.customPopups || []),
    connectedSignature = documentSignature2(editorCtx.activeProject.document.customPopups || []),
    previousConnectedSignature = await requestJson("/projects/" + projectId3 + "/draft", {
      method: "PUT",
      body: JSON.stringify({
        revision: editorCtx.activeProject.revision,
        globalPopupRevision: editorCtx.activeProject.globalPopupRevision,
        globalPopupsDirty: isPopupsChangedActive,
        document: beforeSavedDocument,
      }),
    });
  if (editorCtx.componentScopeState !== Ie5 || editorCtx.activeProject?.projectId !== projectId3) return false;
  const entityLoadErrorState = clone2(editorCtx.activeProject.document);
  return (
    (editorCtx.baselineDocument = clone2(previousConnectedSignature.document)),
    (editorCtx.savedDocumentSignature = documentSignature2(previousConnectedSignature.document)),
    !isPopupsChangedActive &&
      documentSignature2(entityLoadErrorState.customPopups || []) === connectedSignature &&
      (entityLoadErrorState.customPopups = clone2(
        previousConnectedSignature.document.customPopups || [],
      )),
    (editorCtx.activeProject = {
      ...previousConnectedSignature,
      document: entityLoadErrorState,
    }),
    interaction3dEntryActive() || renderEditorWorkspace(pageSelectElement.value),
    writeError(),
    true
  );
}
async function entityLoadError(syncHaConnectionUi: any) {
  const haActiveUrl = editorCtx.activeProject?.projectId,
    Ie6 = editorCtx.componentScopeState,
    haDetailWarningHandler = () =>
      editorCtx.componentScopeState === Ie6 && editorCtx.activeProject?.projectId === haActiveUrl;
  if (
    (await editorCtx.writeQueuePromise.catch(() => {}),
    !haDetailWarningHandler() || editorCtx.isSaving || historyState.busy || !editorCtx.activeProject)
  )
    return;
  const undo = syncHaConnectionUi === "undo" ? historyState.undo : historyState.redo,
    haDetailWarning = syncHaConnectionUi === "undo" ? "redo" : "undo",
    pop = undo.pop();
  if (pop) {
    ((historyState.busy = true),
      syncHistoryButtons(),
      panelFrameBaselineByComponentId.clear(),
      lineChartBaselineByComponentId.clear(),
      iconButtonEffectBaselineByComponentId.clear(),
      iconButtonBaselineByComponentId.clear(),
      airConditionerBaselineByComponentId.clear());
    try {
      if (pop.kind === "save") {
        if (!(await loadHaConnection(pop, syncHaConnectionUi))) return;
        refreshDirtyState(historyState[haDetailWarning], pop);
      } else {
        const hl3 = historyEntries(),
          deadlineTime = Array.isArray(pop.selectedComponentIds)
            ? pop.selectedComponentIds.filter((collectHaConnectionInput: any) =>
                findComponent2(pop.document, collectHaConnectionInput),
              )
            : [];
        if (
          ((editorCtx.selectedComponentId = findComponent2(pop.document, pop.selectedComponentId)
            ? pop.selectedComponentId
            : deadlineTime[0] || null),
          (editorCtx.selectedComponentIdsSet = new Set(
            deadlineTime.length ? deadlineTime : editorCtx.selectedComponentId ? [editorCtx.selectedComponentId] : [],
          )),
          (editorCtx.selectionAnchorComponentId = editorCtx.selectedComponentId),
          !(await projectSummary(pop.document, pop.selectedPath, {
            recordHistory: false,
          })))
        )
          return;
        refreshDirtyState(historyState[haDetailWarning], hl3);
      }
    } catch (requireToken: any) {
      haDetailWarningHandler() &&
        (refreshDirtyState(
          syncHaConnectionUi === "undo" ? historyState.undo : historyState.redo,
          pop,
        ),
        handleOperationError(requireToken));
    } finally {
      haDetailWarningHandler() &&
        ((historyState.busy = false),
        syncHistoryButtons(),
        editorCtx.hasUnsavedChanges && scheduleRecoverySnapshot());
    }
  }
}
async function reuseTokenForNewUrl() {
  await requestJson("/auth/me");
}
async function syncAspectLockButton() {
  const isAspectLockActive = await requestJson("/ha/sync/status");
  const pendingResizeResolve = isAspectLockActive.counts || {
    entities: 0,
    devices: 0,
    areas: 0,
  };
  if (!isAspectLockActive.configured) {
    ((editorCtx.lastConnectedSignature = null),
      (editorCtx.isAreEntitiesLoaded = false),
      (editorCtx.entities.length || editorCtx.devices.length || Object.keys(editorCtx.entityResourcesByDeviceId).length) &&
        ((editorCtx.entities = []),
        (editorCtx.devices = []),
        (editorCtx.deviceNamesByDeviceId = new Map()),
        (editorCtx.entityResourcesByDeviceId = {}),
        editorCtx.editorRenderer?.setEntityCatalog([], {}, []),
        editorCtx.dashboardPreviewRenderer?.setEntityCatalog([], {}, []),
        runExtraLower(),
        interaction3dEntryActive() ||
          document.activeElement?.closest?.(".inspector-form") ||
          coverMotorButtonElement()));
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
    stringify !== editorCtx.lastConnectedSignature
  ) {
    const Gi2 = editorCtx.lastConnectedSignature;
    editorCtx.lastConnectedSignature = stringify;
    try {
      await ensureEntitiesLoaded({
        afterCurrent: true,
      });
    } catch (openPageDialog: any) {
      throw (
        editorCtx.lastConnectedSignature === stringify && (editorCtx.lastConnectedSignature = Gi2),
        openPageDialog
      );
    }
  }
}
async function actionDraftDocument() {
  return syncAspectLockButton();
}
function targetPageCandidate() {
  editorCtx.resizeWarningResolveState = "";
  const cameraCommandState = [
    {
      id: "",
      name: "空白仪表盘",
      description: "创建空白画布，不预置页面、控件或弹窗。",
      previewUrls: [] as any[],
      previewLabels: [] as any[],
      canvasWidth: null as any,
      canvasHeight: null as any,
    },
  ];
  syncProjectTemplateOptions({
  get projectTemplateOptionsElement() { return projectTemplateOptionsElement; },
  get cameraCommandState() { return cameraCommandState; },
  get resizeWarningResolveState() { return editorCtx.resizeWarningResolveState; },
  get projectCanvasFieldsElement() { return projectCanvasFieldsElement; },
  get projectDialogMode() { return editorCtx.projectDialogMode; },
  get projectFormElement() { return projectFormElement; },
  get projectCanvasWidthElement() { return projectCanvasWidthElement; },
  get projectCanvasHeightElement() { return projectCanvasHeightElement; },
  get isAspectLockedState() { return editorCtx.isAspectLockedState; },
  get isAspectLockedValue() { return editorCtx.isAspectLockedValue; },
  get projectCanvasHintElement() { return projectCanvasHintElement; },
  get lightStatisticsEntityListClickEvent() { return lightStatisticsEntityListClickEvent; },
  get imageEntityDraftDocument() { return imageEntityDraftDocument; },
  });

}
function buttonVisibilityDraftDocument(iconPreviewStateClickEventElement: any) {
  try {
    return {
      urls: JSON.parse(iconPreviewStateClickEventElement.dataset.previewUrls || "[]"),
      labels: JSON.parse(iconPreviewStateClickEventElement.dataset.previewLabels || "[]"),
    };
  } catch {
    return {
      urls: [] as any[],
      labels: [] as any[],
    };
  }
}
function titleButtonIconOptionClickEvent() {
  editorCtx.lockedCanvasWidthValue.length &&
    ((editorCtx.lockedCanvasHeight =
      ((editorCtx.lockedCanvasHeight % editorCtx.lockedCanvasWidthValue.length) + editorCtx.lockedCanvasWidthValue.length) %
      editorCtx.lockedCanvasWidthValue.length),
    (projectPreviewImageElement.src = editorCtx.lockedCanvasWidthValue[editorCtx.lockedCanvasHeight]),
    (projectPreviewImageElement.alt =
      editorCtx.lockedCanvasHeightState[editorCtx.lockedCanvasHeight] || "HomeOS预览 " + (editorCtx.lockedCanvasHeight + 1)),
    (projectPreviewTitleElement.textContent =
      editorCtx.lockedCanvasHeightState[editorCtx.lockedCanvasHeight] || "HomeOS预览"),
    (projectPreviewCountElement.textContent =
      editorCtx.lockedCanvasHeight + 1 + " / " + editorCtx.lockedCanvasWidthValue.length));
}
function titleButtonIconDraftDocument(lightStatisticsIconClickEventElement: any) {
  const { urls: qw4, labels: qw5 } = buttonVisibilityDraftDocument(
    lightStatisticsIconClickEventElement,
  );
  qw4.length &&
    ((editorCtx.lockedCanvasWidthValue = qw4),
    (editorCtx.lockedCanvasHeightState = qw5),
    (editorCtx.lockedCanvasHeight = Number(lightStatisticsIconClickEventElement.dataset.previewIndex || 0)),
    titleButtonIconOptionClickEvent(),
    projectPreviewDialogElement.showModal());
}
function lightStatisticsIconCopyError(lightStatisticsIconOptionClickEvent = "create") {
  editorCtx.projectDialogMode = lightStatisticsIconOptionClickEvent;
  const isClosed = lightStatisticsIconOptionClickEvent === "edit",
    isPreviewActiveActive = lightStatisticsIconOptionClickEvent === "resize";
  if (
    (projectFormElement.reset(),
    (projectDialogKickerElement.textContent = isPreviewActiveActive
      ? "RESIZE DASHBOARD"
      : isClosed
        ? "EDIT PROJECT"
        : "NEW PROJECT"),
    (projectDialogTitleElement.textContent = isPreviewActiveActive
      ? "修改仪表盘分辨率"
      : isClosed
        ? "修改仪表盘"
        : "创建仪表盘项目"),
    (projectSubmitElement.textContent = isPreviewActiveActive
      ? "应用修改"
      : isClosed
        ? "保存修改"
        : "创建项目"),
    (projectFormElement.elements.name.value =
      isClosed || isPreviewActiveActive ? editorCtx.activeProject?.document?.name || "" : "我的仪表盘"),
    (projectTemplateFieldsElement.hidden = isClosed || isPreviewActiveActive),
    (projectCanvasWidthElement.readOnly = false),
    (projectCanvasHeightElement.readOnly = false),
    (projectContentLockElement.checked = false),
    (projectContentLockFieldsElement.hidden = !isPreviewActiveActive),
    projectCanvasFieldsElement.classList.remove("fixed", "name-only"),
    !isClosed && !isPreviewActiveActive)
  )
    ((editorCtx.isAspectLockedState = 2778),
      (editorCtx.isAspectLockedValue = 1940),
      (editorCtx.isAspectLocked = false),
      (editorCtx.lockedCanvasWidthState = 2778),
      (editorCtx.lockedCanvasWidth = 1940),
      (projectCanvasWidthElement.value = "2778"),
      (projectCanvasHeightElement.value = "1940"),
      lightStatisticsEntityListClickEvent(),
      targetPageCandidate());
  else {
    if (isClosed)
      ((projectCanvasFieldsElement.hidden = false),
        projectCanvasFieldsElement.classList.add("name-only"));
    else {
      editorCtx.resizeWarningResolveState = "";
      const lightStatisticsIconOptionElement = Number(
          editorCtx.activeProject?.document?.canvas?.width || 2778,
        ),
        lightStatisticsEntityOptionElement = Number(
          editorCtx.activeProject?.document?.canvas?.height || 1940,
        );
      ((editorCtx.isAspectLockedState = lightStatisticsIconOptionElement),
        (editorCtx.isAspectLockedValue = lightStatisticsEntityOptionElement),
        (editorCtx.isAspectLocked = true),
        (editorCtx.lockedCanvasWidthState = lightStatisticsIconOptionElement),
        (editorCtx.lockedCanvasWidth = lightStatisticsEntityOptionElement),
        (projectCanvasFieldsElement.hidden = false),
        (projectCanvasWidthElement.value = String(lightStatisticsIconOptionElement)),
        (projectCanvasHeightElement.value = String(lightStatisticsEntityOptionElement)),
        (projectCanvasHintElement.textContent =
          "默认会同步调整所有页面、控件和弹窗；勾选“锁定控件大小及位置”后保留普通控件的位置和尺寸，3D 交互外框始终跟随画布宽高。"),
        lightStatisticsEntityListClickEvent(),
        imageEntityDraftDocument(false));
    }
  }
  (setSettingsMessage(projectMessageElement, ""), projectDialogElement.showModal());
}
function lightStatisticsEntityListClickEvent() {
  const statisticsReplaceElement = Number(projectCanvasWidthElement.value),
    statisticsRemoveElement = Number(projectCanvasHeightElement.value);
  if (
    !Number.isInteger(statisticsReplaceElement) ||
    !Number.isInteger(statisticsRemoveElement) ||
    statisticsReplaceElement <= 0 ||
    statisticsRemoveElement <= 0
  ) {
    projectAspectRatioElement.textContent = "等待输入有效分辨率";
    return;
  }
  const $a2 =
      !editorCtx.resizeWarningResolveState && editorCtx.isAspectLocked
        ? editorCtx.lockedCanvasWidthState
        : statisticsReplaceElement,
    Fa2 =
      !editorCtx.resizeWarningResolveState && editorCtx.isAspectLocked ? editorCtx.lockedCanvasWidth : statisticsRemoveElement,
    imageEntityOptionElement = greatestCommonDivisor2($a2, Fa2);
  projectAspectRatioElement.textContent =
    $a2 / imageEntityOptionElement + " : " + Fa2 / imageEntityOptionElement;
}
function imageEntityDraftDocument(imageActionKey = !!editorCtx.resizeWarningResolveState) {
  const Sn2 = imageActionKey || editorCtx.isAspectLocked;
  ((projectAspectLockElement.disabled = imageActionKey),
    projectAspectLockElement.setAttribute("aria-pressed", String(Sn2)),
    projectAspectLockElement.classList.toggle("locked", Sn2),
    (projectAspectLockLabelElement.textContent = imageActionKey ? "固定" : Sn2 ? "已锁定" : "锁定"),
    (projectAspectLockElement.title = imageActionKey
      ? "HomeOS画布使用固定比例"
      : Sn2
        ? "点击解锁画布比例"
        : "锁定当前画布比例"));
}
function openAssetPicker(assetTriggerButton: any) {
  if (editorCtx.resizeWarningResolveState || !editorCtx.isAspectLocked) return;
  const assetCurrentRecord = Number(editorCtx.lockedCanvasWidthState),
    assetInitialIndex = Number(editorCtx.lockedCanvasWidth);
  if (!(!assetCurrentRecord || !assetInitialIndex)) {
    if (assetTriggerButton === "width") {
      let assetMatches = Number(projectCanvasWidthElement.value);
      if (!Number.isInteger(assetMatches) || assetMatches < 320 || assetMatches > 7680) return;
      let round = Math.round((assetMatches * assetInitialIndex) / assetCurrentRecord);
      ((round < 240 || round > 4320) &&
        ((round = Math.max(240, Math.min(4320, round))),
        (assetMatches = Math.max(
          320,
          Math.min(7680, Math.round((round * assetCurrentRecord) / assetInitialIndex)),
        )),
        (projectCanvasWidthElement.value = String(assetMatches))),
        (projectCanvasHeightElement.value = String(round)));
    } else {
      let assetOptionButtonElement = Number(projectCanvasHeightElement.value);
      if (
        !Number.isInteger(assetOptionButtonElement) ||
        assetOptionButtonElement < 240 ||
        assetOptionButtonElement > 4320
      )
        return;
      let round2 = Math.round((assetOptionButtonElement * assetCurrentRecord) / assetInitialIndex);
      ((round2 < 320 || round2 > 7680) &&
        ((round2 = Math.max(320, Math.min(7680, round2))),
        (assetOptionButtonElement = Math.max(
          240,
          Math.min(4320, Math.round((round2 * assetInitialIndex) / assetCurrentRecord)),
        )),
        (projectCanvasHeightElement.value = String(assetOptionButtonElement))),
        (projectCanvasWidthElement.value = String(round2)));
    }
  }
}
function assetIdToDelete(assetDocumentNode: any, requestDeleteAssetFolder: any, folderKind: any) {
  return (
    (projectResizeWarningTextElement.textContent =
      "当前分辨率为 " +
      requestDeleteAssetFolder +
      " × " +
      folderKind +
      "，预计有 " +
      assetDocumentNode +
      " 个控件会部分或全部位于画布范围之外。"),
    new Promise((folderName) => {
      ((editorCtx.resizeWarningResolve = folderName), projectResizeWarningDialogElement.showModal());
    })
  );
}
function folderDocumentNode(refreshAssetPickerViews: any) {
  const rp2 = editorCtx.resizeWarningResolve;
  ((editorCtx.resizeWarningResolve = null),
    projectResizeWarningDialogElement.open && projectResizeWarningDialogElement.close(),
    rp2?.(refreshAssetPickerViews));
}
function closeDeletePopupDialog(popupDeleteUsageEntries = "create") {
  if (!editorCtx.activeProject) return;
  editorCtx.pageDialogMode = popupDeleteUsageEntries;
  const isImageAssetPicker = popupDeleteUsageEntries === "rename";
  (pageFormElement.reset(),
    (pageDialogKickerElement.textContent = isImageAssetPicker ? "EDIT PAGE" : "NEW PAGE"),
    (pageDialogTitleElement.textContent = isImageAssetPicker ? "重命名页面" : "新建页面"),
    (pageSubmitElement.textContent = isImageAssetPicker ? "保存修改" : "创建页面"),
    (pageFormElement.elements.name.value = (isImageAssetPicker && currentPage()?.name) || ""),
    setSettingsMessage(pageMessageElement, ""),
    pageDialogElement.showModal());
}
function documentSource() {
  return editorCtx.hasUnsavedChanges
    ? (handleOperationError(new Error("当前有未保存修改，请先点击顶部的“保存”。")), true)
    : false;
}
// 保留空实现以维持上方授权门禁函数的调用契约（门禁逻辑本身不在此处）。
function popupId(_entityLabelFor: any) {}
async function triggerKey() {
  const documentPages = await requestJson("/license/status");
  if (documentPages?.required && !documentPages.allowed)
    return (navigateInShell("/activate"), documentPages);
  const sharedUsages = JSON.stringify([...(documentPages?.features || [])].sort()),
    sharedScopeText =
      editorCtx.lastLicenseFeatureSignature !== null && editorCtx.lastLicenseFeatureSignature !== sharedUsages;
  editorCtx.lastLicenseFeatureSignature = sharedUsages;
  return (
    sharedScopeText && (await reloadAssetCatalog({ refreshInspector: false })),
    popupId(documentPages),
    documentPages
  );
}
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
    const onProjectDialogClickState = projectBackdropEvent.target.closest(
      "[data-project-preview-action]",
    )?.dataset.projectPreviewAction;
    if (onProjectDialogClickState) {
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
    (runState(),
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
    (runState(),
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

function findDiagramPreviewFrame(
  lightingComponentId: any,
  applyBaseLightingToPanel: any,
  baseLighting: any = null,
) {
  const normalizedLightingElement = document.querySelector<HTMLIFrameElement>(
    '.hb-component[data-component-id="' +
      CSS.escape(lightingComponentId) +
      '"] .hb-floorplan-auto-diagram-preview',
  );
  return normalizedLightingElement?.contentWindow
    ? (normalizedLightingElement.contentWindow.postMessage(
        {
          type: "homeos-floorplan-auto-diagram-camera",
          componentId: lightingComponentId,
          command: applyBaseLightingToPanel,
          value: baseLighting,
        },
        window.location.origin,
      ),
      true)
    : false;
}
function lightInputElement(openAutoDiagramDialog: any, dialogComponentId: any) {
  const cancelRemovesComponentElement = document.querySelector<HTMLIFrameElement>(
    '.hb-component[data-component-id="' +
      CSS.escape(openAutoDiagramDialog) +
      '"] .hb-floorplan-auto-diagram-preview',
  );
  return cancelRemovesComponentElement?.contentWindow
    ? (cancelRemovesComponentElement.contentWindow.postMessage(
        {
          type: "homeos-floorplan-auto-diagram-floor",
          componentId: openAutoDiagramDialog,
          command: "set-floor",
          value: dialogComponentId,
        },
        window.location.origin,
      ),
      true)
    : false;
}
function cancelRemovesComponent(bindFloorplanSection: any) {
  if (!bindFloorplanSection?.isConnected) return;
  const onElement = bindFloorplanSection.closest(".hb-floorplan-auto-diagram");
  if (!onElement) return;
  bindFloorplanSection.classList.remove("is-ready");
  let onWindowPageshowElement = onElement.querySelector(".hb-floorplan-auto-diagram-loading");
  onWindowPageshowElement ||
    ((onWindowPageshowElement = document.createElement("div")),
    (onWindowPageshowElement.className = "hb-floorplan-auto-diagram-loading"),
    (onWindowPageshowElement.innerHTML =
      '<i aria-hidden="true"></i><strong>正在重新载入3D户型…</strong>'),
    onElement.append(onWindowPageshowElement));
  const pageshowEvent = new URL(bindFloorplanSection.src, window.location.origin);
  (pageshowEvent.searchParams.set("auto-diagram-refresh", String(Date.now())),
    (bindFloorplanSection.src = pageshowEvent.toString()));
}
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

function lightingPayload(readBaseLightingFromPanel = editorCtx.baseLightingComponentId) {
  return readBaseLightingFromPanel
    ? document.querySelector<HTMLIFrameElement>(
        '.hb-component[data-component-id="' +
          CSS.escape(readBaseLightingFromPanel) +
          '"] .hb-floorplan-auto-diagram-preview',
      )
    : null;
}
function lightFieldElement(closeLightingPanel: any, cancelLightingPreview: any = null) {
  const gm2 = lightingPayload();
  return gm2?.contentWindow
    ? (gm2.contentWindow.postMessage(
        {
          type: "homeos-floorplan-auto-diagram-base-lighting",
          componentId: editorCtx.baseLightingComponentId,
          command: closeLightingPanel,
          ...(cancelLightingPreview
            ? {
                lighting: cancelLightingPreview,
              }
            : {}),
        },
        window.location.origin,
      ),
      true)
    : false;
}
function openLightingPanel(lightingHostComponentId: any) {
  const lightingPreviewFrame = normalizeBaseLighting2(lightingHostComponentId);
  for (const interactionModeDraftDocumentElement of floorplanBaseLightElements) {
    const interactionModeComponent =
      (lightingPreviewFrame as any)[interactionModeDraftDocumentElement.dataset.floorplanBaseLight!];
    interactionModeDraftDocumentElement.value =
      interactionModeDraftDocumentElement.step === "5"
        ? String(Math.round(interactionModeComponent))
        : String(Number(interactionModeComponent.toFixed(2)));
  }
  return lightingPreviewFrame;
}
function lightInputNode() {
  const onLightInputNodeState: Record<string, any> = {};
  for (const onLightInputNodeInput of floorplanBaseLightElements)
    onLightInputNodeState[onLightInputNodeInput.dataset.floorplanBaseLight!] = Number(
      onLightInputNodeInput.value,
    );
  return normalizeBaseLighting2(onLightInputNodeState);
}
function onFloorplanAutoLightingResetButtonClick({
  cancelPreview: onFloorplanAutoLightingSaveButtonClick = true,
} = {}) {
  floorplanAutoLightingPanelElement.hidden ||
    (onFloorplanAutoLightingSaveButtonClick && lightFieldElement("cancel"),
    (floorplanAutoLightingPanelElement.hidden = true),
    floorplanAutoLightingPanelElement.setAttribute("aria-busy", "false"),
    (editorCtx.baseLightingComponentId = ""),
    (editorCtx.lightingPanelDragStateState = null));
}
function onFloorplanAutoLightingCloseButtonClick(onFloorplanAutoLightingHandlePointerdown: any) {
  const gm3 = lightingPayload(onFloorplanAutoLightingHandlePointerdown);
  if (!onFloorplanAutoLightingHandlePointerdown || !gm3?.contentWindow) return;
  ((editorCtx.baseLightingComponentId = onFloorplanAutoLightingHandlePointerdown),
    gm3.classList.remove("is-position-mode"),
    gm3.classList.add("is-view-mode"),
    mutateDocument((lightingDragEvent: any) => {
      const lightingDragEventState = findComponent2(
        lightingDragEvent,
        onFloorplanAutoLightingHandlePointerdown,
      )?.component;
      lightingDragEventState?.type === "floorplan-auto-diagram" &&
        (lightingDragEventState.properties = {
          ...(lightingDragEventState.properties || {}),
          interactionMode: "view",
        });
    }),
    openLightingPanel(editorCtx.baseLightingSettings),
    (floorplanAutoLightingStatusElement.textContent = "正在读取当前光照设置…"),
    (floorplanAutoLightingPanelElement.hidden = false),
    floorplanAutoLightingPanelElement.setAttribute("aria-busy", "true"));
  const lightingPanelBounds = floorplanAutoLightingPanelElement.getBoundingClientRect();
  ((lightingPanelBounds.right > window.innerWidth - 8 ||
    lightingPanelBounds.bottom > window.innerHeight - 8 ||
    lightingPanelBounds.left < 8 ||
    lightingPanelBounds.top < 8) &&
    ((floorplanAutoLightingPanelElement.style.right = "auto"),
    (floorplanAutoLightingPanelElement.style.left =
      clampNumber2(
        lightingPanelBounds.left,
        8,
        Math.max(8, window.innerWidth - lightingPanelBounds.width - 8),
      ) + "px"),
    (floorplanAutoLightingPanelElement.style.top =
      clampNumber2(
        lightingPanelBounds.top,
        8,
        Math.max(8, window.innerHeight - lightingPanelBounds.height - 8),
      ) + "px")),
    lightFieldElement("request-state"));
}
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
function applyLightingPanelDragMove() {
  if (!editorCtx.lightingPanelDragPending) return;
  (floorplanAutoLightingPanelElement.style.right = "auto"),
    (floorplanAutoLightingPanelElement.style.left = editorCtx.lightingPanelDragPending.x + "px"),
    (floorplanAutoLightingPanelElement.style.top = editorCtx.lightingPanelDragPending.y + "px");
}
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
function closeAutoDiagramDialog() {
  (floorplanAutoDiagramDialogElement.open && floorplanAutoDiagramDialogElement.close(),
    (floorplanAutoDiagramDialogElement.dataset.componentId = ""),
    (floorplanAutoDiagramDialogElement.dataset.cancelRemovesComponent = "false"),
    (floorplanAutoDiagramGuideElement.hidden = false));
}
function settleAutoDiagramDialog(
  runExtraNew: any,
  { cancelRemovesComponent: runAltExtra = false } = {},
) {
  runExtraNew &&
    ((floorplanAutoDiagramDialogElement.dataset.componentId = runExtraNew),
    (floorplanAutoDiagramDialogElement.dataset.cancelRemovesComponent = String(runAltExtra)),
    (floorplanAutoDiagramGuideElement.hidden = false),
    floorplanAutoDiagramDialogElement.open || floorplanAutoDiagramDialogElement.showModal());
}
function cancelRemoveDraftDocument() {
  const componentId = floorplanAutoDiagramDialogElement.dataset.componentId,
    shouldRemoveOnCancel =
      floorplanAutoDiagramDialogElement.dataset.cancelRemovesComponent === "true";
  (closeAutoDiagramDialog(),
    !(!shouldRemoveOnCancel || !componentId) &&
      (editorCtx.selectedComponentIdsSet.delete(componentId),
      editorCtx.selectedComponentId === componentId &&
        (editorCtx.selectedComponentId = editorCtx.selectedComponentIdsSet.values().next().value || null),
      editorCtx.selectionAnchorComponentId === componentId &&
        (editorCtx.selectionAnchorComponentId = editorCtx.selectedComponentId),
      mutateDocument((onFloorplanAutoDiagramOpenStudioButtonClick: any) => {
        removeComponent(onFloorplanAutoDiagramOpenStudioButtonClick, componentId);
      })));
}
(floorplanAutoDiagramOpenStudioButtonElement.addEventListener("click", () => {
  const diagramStudioComponent = removedComponent();
  if (diagramStudioComponent?.type !== "floorplan-auto-diagram") return;
  if (
    diagramStudioComponent.properties?.generated === true &&
    diagramStudioComponent.properties?.previewing !== true
  ) {
    mutateDocument((previewingDraftDocument: any) => {
      const previewingComponent = findComponent2(
        previewingDraftDocument,
        diagramStudioComponent.id,
      )?.component;
      previewingComponent?.type === "floorplan-auto-diagram" &&
        (previewingComponent.properties = {
          ...(previewingComponent.properties || {}),
          previewReady: true,
          previewing: true,
          interactionMode: "position",
        });
    });
    return;
  }
  const studioDialogFrame = document.querySelector<HTMLIFrameElement>(
    '.hb-component[data-component-id="' +
      CSS.escape(diagramStudioComponent.id) +
      '"] .hb-floorplan-auto-diagram-preview',
  );
  if (!studioDialogFrame?.contentWindow) {
    settleAutoDiagramDialog(diagramStudioComponent.id);
    return;
  }
  const exportFolderName = String(diagramStudioComponent.properties?.exportFolder || "").trim();
  if (
    !exportFolderName ||
    /[<>:"/\\|?*\x00-\x1f\x7f]/.test(exportFolderName) ||
    exportFolderName.startsWith(".") ||
    /[. ]$/.test(exportFolderName)
  ) {
    ((floorplanAutoDiagramStatusElement.textContent = "请先填写有效的导图文件夹名称。"),
      floorplanAutoDiagramFolderTextInputElement.focus());
    return;
  }
  const sourceComponentPosition = diagramStudioComponent.position || {},
    projectCanvas = editorCtx.activeProject.document.canvas || {},
    exportResolution = floorplanAutoDiagramExportResolution2(
      sourceComponentPosition,
      projectCanvas,
    );
  ((floorplanAutoDiagramStatusElement.textContent = "正在后台生成底图和灯组效果，请稍候…"),
    (floorplanAutoDiagramOpenStudioButtonElement.disabled = true),
    (floorplanAutoDiagramFloorSelectElement.disabled = true),
    (floorplanAutoDiagramOpenStudioButtonElement.textContent = "正在后台生成…"),
    studioDialogFrame.contentWindow.postMessage(
      {
        type: "homeos-floorplan-auto-diagram-generate",
        componentId: diagramStudioComponent.id,
        width: exportResolution.width,
        height: exportResolution.height,
        folderName: exportFolderName,
      },
      window.location.origin,
    ));
}),
  floorplanAutoDiagramViewToggleButtonElement.addEventListener("click", () => {
    const interactionModeComponentId = editorCtx.selectedComponentId;
    interactionModeComponentId &&
      mutateDocument((toggleModeDraftDocument: any) => {
        const toggleModeComponent = findComponent2(
          toggleModeDraftDocument,
          interactionModeComponentId,
        )?.component;
        toggleModeComponent?.type === "floorplan-auto-diagram" &&
          (toggleModeComponent.properties = {
            ...(toggleModeComponent.properties || {}),
            interactionMode:
              toggleModeComponent.properties?.interactionMode === "view" ? "position" : "view",
          });
      });
  }),
  floorplanAutoDiagramCloseButtonElement.addEventListener("click", cancelRemoveDraftDocument),
  floorplanAutoDiagramLaterButtonElement.addEventListener("click", cancelRemoveDraftDocument),
  floorplanAutoDiagramDialogElement.addEventListener(
    "cancel",
    (onFloorplanAutoDiagramContinueButtonClick: any) => {
      (onFloorplanAutoDiagramContinueButtonClick.preventDefault(), cancelRemoveDraftDocument());
    },
  ),
  floorplanAutoDiagramContinueElement.addEventListener("click", () => {
    const componentId2 = floorplanAutoDiagramDialogElement.dataset.componentId;
    componentId2 &&
      (mutateDocument((continueDraftDocument: any) => {
        const continueComponent = findComponent2(continueDraftDocument, componentId2)?.component;
        continueComponent?.type === "floorplan-auto-diagram" &&
          (continueComponent.properties = {
            ...(continueComponent.properties || {}),
            previewReady: true,
            previewing: true,
            interactionMode: "position",
          });
      }),
      closeAutoDiagramDialog());
  }),
  floorplanAutoDiagramBindingListElement.addEventListener("change", (lightGroupChangeEvent: any) => {
    const lightGroupSelect = lightGroupChangeEvent.target.closest(
        "[data-floorplan-light-group-id]",
      ),
      lightGroupId = editorCtx.selectedComponentId;
    if (!lightGroupSelect || !lightGroupId) return;
    const floorplanLightGroupId = lightGroupSelect.dataset.floorplanLightGroupId;
    mutateDocument((lightGroupDraftDocument: any) => {
      const lightGroupComponent = findComponent2(lightGroupDraftDocument, lightGroupId)?.component;
      if (!lightGroupComponent || lightGroupComponent.type !== "floorplan-auto-diagram") return;
      lightGroupComponent.bindings = {
        ...(lightGroupComponent.bindings || {}),
      };
      const lightGroupBindingKey = "lightGroup:" + floorplanLightGroupId;
      lightGroupSelect.value
        ? (lightGroupComponent.bindings[lightGroupBindingKey] = {
            entityId: lightGroupSelect.value,
          })
        : delete lightGroupComponent.bindings[lightGroupBindingKey];
    });
  }));
function bindMessageSection() {
  const zr2 = editorCtx.lightingPanelDragState;
  zr2 && ((editorCtx.lightingPanelDragState = null), zr2.remove());
}
function onWindowMessage(
  messageEvent: any,
  { buttonCount: runAltAlt = 0, imageCount: runAltAux = 0 } = {},
) {
  bindMessageSection();
  const isMessage = messageEvent?.overwritten === true,
    lightingStateComponentIdElement = document.createElement("div");
  ((lightingStateComponentIdElement.className = "floorplan-auto-diagram-complete-overlay"),
    lightingStateComponentIdElement.setAttribute("role", "dialog"),
    lightingStateComponentIdElement.setAttribute("aria-modal", "true"),
    lightingStateComponentIdElement.setAttribute(
      "aria-label",
      isMessage ? "导图覆盖完成" : "导图保存完成",
    ),
    (lightingStateComponentIdElement.innerHTML =
      '<section class="settings-dialog floorplan-auto-diagram-dialog floorplan-auto-diagram-complete-dialog" tabindex="-1"><div class="dialog-heading"><div><span>EXPORT COMPLETE</span><h2 data-export-complete-title></h2></div><button type="button" class="icon-button" data-export-complete-close aria-label="关闭导图完成提示">×</button></div>\n    <div class="floorplan-auto-diagram-guide">\n      <p data-export-complete-message></p>\n      <div class="export-notice-summary"><span>保存位置</span><strong data-export-complete-path></strong></div>\n      <div class="dialog-actions"><button type="button" class="primary" data-export-complete-confirm>完成</button></div>\n    </div></section>'),
    (lightingStateComponentIdElement.querySelector("[data-export-complete-title]")!.textContent =
      isMessage ? "导图覆盖完成" : "导图保存完成"),
    (lightingStateComponentIdElement.querySelector("[data-export-complete-message]")!.textContent =
      isMessage
        ? "新导图已安全替换，并更新 " + runAltAux + " 张图片和 " + runAltAlt + " 个效果按钮。"
        : "导图已置入仪表盘，共生成 " + runAltAux + " 张图片和 " + runAltAlt + " 个效果按钮。"),
    (lightingStateComponentIdElement.querySelector("[data-export-complete-path]")!.textContent =
      "data/" + (messageEvent?.relativePath || "exports")));
  let isMessageActive = false;
  const lightingStateComponentId = () => {
      isMessageActive ||
        ((isMessageActive = true),
        window.removeEventListener("pagehide", lightingStateComponentId),
        document.removeEventListener("keydown", lightingStateComponentIdHandler, true),
        lightingStateComponentIdElement.remove(),
        editorCtx.lightingPanelDragState === lightingStateComponentIdElement &&
          (editorCtx.lightingPanelDragState = null));
    },
    lightingStateComponentIdHandler = (lightingStateComponentIdState: any) => {
      lightingStateComponentIdState.key === "Escape" &&
        (lightingStateComponentIdState.preventDefault(), lightingStateComponentId());
    };
  lightingStateComponentIdElement.addEventListener("click", (onWindowMessageState) => {
    onWindowMessageState.target === lightingStateComponentIdElement && lightingStateComponentId();
  });
  for (const messageEventState of lightingStateComponentIdElement.querySelectorAll(
    "[data-export-complete-close], [data-export-complete-confirm]",
  ))
    messageEventState.addEventListener("click", lightingStateComponentId);
  (window.addEventListener("pagehide", lightingStateComponentId),
    document.addEventListener("keydown", lightingStateComponentIdHandler, true),
    (editorCtx.lightingPanelDragState = lightingStateComponentIdElement),
    document.body.append(lightingStateComponentIdElement),
    lightingStateComponentIdElement.querySelector<HTMLElement>("[data-export-complete-confirm]")?.focus());
}
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
function exportSpliceError(bindIconButtonEffectSection: any) {
  const entryStateValue = exportSpliceErrorByIdById.get(bindIconButtonEffectSection),
    entryStateConfig = removedComponent();
  if (!(!entryStateValue || entryStateConfig?.type !== "icon-button-effect")) {
    (iconButtonEffectPreviewStateByComponentId.set(entryStateConfig.id, entryStateValue),
      editorCtx.editorRenderer?.setComponentPreviewState(entryStateConfig.id, entryStateValue));
    for (const onElementElement of ibePreviewStateElement.querySelectorAll("[data-ibe-preview]")) {
      const isOnIconButtonEffectInspectorFormInput =
        onElementElement.dataset.ibePreview === entryStateValue;
      (onElementElement.classList.toggle("active", isOnIconButtonEffectInspectorFormInput),
        onElementElement.setAttribute(
          "aria-pressed",
          String(isOnIconButtonEffectInspectorFormInput),
        ));
    }
  }
}
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
function collectPageImages(pageSource: any) {
  const pageImages: any = [],
    collectImageComponents = (componentItems: any) => {
      for (const imageItem of componentItems || [])
        (imageItem.type === "image" && pageImages.push(imageItem),
          collectImageComponents(imageItem.children));
    };
  return (collectImageComponents(pageSource?.components), pageImages);
}
function createImageAlignOption(imageComponentOption: any, isChosenImage: any) {
  const optionLabelElement = document.createElement("label");
  optionLabelElement.className = "effect-image-align-option";
  const optionRadioElement = document.createElement("input");
  ((optionRadioElement.type = "radio"),
    (optionRadioElement.name = "effect-image-align-target"),
    (optionRadioElement.value = imageComponentOption.id),
    (optionRadioElement.checked = isChosenImage));
  const optionPreviewElement = document.createElement("span");
  optionPreviewElement.className = "effect-image-align-option-preview";
  const sn4 = findAssetById(imageComponentOption.properties?.assetId || ""),
    kp2 = runExtraTwin(sn4);
  if (kp2) {
    const optionPreviewImage = document.createElement("img");
    ((optionPreviewImage.src = kp2),
      (optionPreviewImage.alt = ""),
      optionPreviewElement.append(optionPreviewImage));
  } else optionPreviewElement.textContent = "无预览";
  const optionCopyElement = document.createElement("span");
  optionCopyElement.className = "effect-image-align-option-copy";
  const optionTitleElement = document.createElement("strong");
  optionTitleElement.textContent = componentLabel2(imageComponentOption);
  const optionLayoutElement = document.createElement("small"),
    isFillLayout = imageComponentOption.properties?.layoutMode === "fill",
    visibilityLabel = imageComponentOption.style?.visible === false ? "隐藏" : "显示",
    optionCanvasWidth = Number(editorCtx.activeProject?.document?.canvas?.width || 2778),
    optionCanvasHeight = Number(editorCtx.activeProject?.document?.canvas?.height || 1940),
    optionPosition = imageComponentOption.position || {},
    optionWidth = Number(optionPosition.width || 100),
    optionHeight = Number(optionPosition.height || 100),
    centerLeftPercent = roundField2(
      ((Number(optionPosition.x || 0) + optionWidth / 2) / optionCanvasWidth) * 100,
    ),
    centerTopPercent = roundField2(
      ((Number(optionPosition.y || 0) + optionHeight / 2) / optionCanvasHeight) * 100,
    ),
    optionScalePercent = roundField2(Number(imageComponentOption.style?.scale || 1) * 100),
    optionRotationDeg = roundField2(Number(optionPosition.rotation || 0));
  optionLayoutElement.textContent = isFillLayout
    ? "铺满 · 覆盖整个画布"
    : "自由 · 左 " + centerLeftPercent + "% · 上 " + centerTopPercent + "%";
  const optionDetailElement = document.createElement("small");
  return (
    (optionDetailElement.textContent = isFillLayout
      ? visibilityLabel
      : "缩放 " + optionScalePercent + "% · 旋转 " + optionRotationDeg + "° · " + visibilityLabel),
    optionCopyElement.append(optionTitleElement, optionLayoutElement, optionDetailElement),
    optionLabelElement.append(optionRadioElement, optionPreviewElement, optionCopyElement),
    optionLabelElement
  );
}
function openImageAlignDialog() {
  const alignableImages = removedComponent(),
    ct5 = currentPage();
  if (!alignableImages || alignableImages.type !== "icon-button-effect" || !ct5) return;
  const aI2 = collectPageImages(ct5),
    referenceImageId = String(alignableImages.properties?.effectReferenceImageId || "");
  (effectImageAlignOptionsElement.replaceChildren(
    ...aI2.map((alignDialogBackdropEvent: any, onEffectImageAlignDialogClose: any) =>
      createImageAlignOption(
        alignDialogBackdropEvent,
        alignDialogBackdropEvent.id === referenceImageId ||
          (!referenceImageId && onEffectImageAlignDialogClose === 0),
      ),
    ),
  ),
    (editorCtx.imageAlignSourceComponentId = alignableImages.id),
    (effectImageAlignMessageElement.hidden = aI2.length > 0),
    (effectImageAlignMessageElement.textContent = aI2.length
      ? ""
      : "本页面没有可以对齐的普通图片。"),
    (effectImageAlignConfirmElement.disabled = aI2.length === 0),
    effectImageAlignDialogElement.showModal());
}
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
      runShadow(),
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
function applyAirConditionerPreviewState(previewTargetComponentId: any, previewModeRequest = "auto") {
  if (!previewTargetComponentId) return;
  const resolvedPreviewMode = ["on", "off"].includes(previewModeRequest)
    ? previewModeRequest
    : "auto";
  (airConditionerPreviewStateByComponentId.set(previewTargetComponentId, resolvedPreviewMode),
    editorCtx.editorRenderer?.setComponentPreviewState(previewTargetComponentId, resolvedPreviewMode));
}
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
      runShadow(),
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
function airflowSectionEvent(activatePreviewForInput: any) {
  for (const previewInputElement of iconButtonPreviewStateElement.querySelectorAll(
    "[data-icon-button-preview]",
  )) {
    const isPreviewOwnerComponent =
      previewInputElement.dataset.iconButtonPreview === activatePreviewForInput;
    (previewInputElement.classList.toggle("active", isPreviewOwnerComponent),
      previewInputElement.setAttribute("aria-pressed", String(isPreviewOwnerComponent)));
  }
}
function previewSyncEventName(onIconButtonInspectorForm: any, previewSyncEvent = "auto") {
  if (!onIconButtonInspectorForm) return;
  const onCoverSettingsKindClickState = ["on", "off"].includes(previewSyncEvent)
    ? previewSyncEvent
    : "auto";
  (onCoverSettingsKindClickState === "auto"
    ? iconButtonPreviewStateByComponentId.delete(onIconButtonInspectorForm)
    : iconButtonPreviewStateByComponentId.set(
        onIconButtonInspectorForm,
        onCoverSettingsKindClickState,
      ),
    editorCtx.editorRenderer?.setComponentPreviewState(
      onIconButtonInspectorForm,
      onCoverSettingsKindClickState,
    ),
    onIconButtonInspectorForm === editorCtx.selectedComponentId &&
      airflowSectionEvent(onCoverSettingsKindClickState));
}
function onCoverSettingsKindClick(coverKindClickEvent: any) {
  const coverKindOption = removedComponent(),
    requestedCoverKind =
      airflowSectionEventById.get(coverKindClickEvent) ||
      (coverKindOption?.type === "device-button" &&
      coverKindClickEvent === iconButtonIconColorElement
        ? "off"
        : null);
  !requestedCoverKind ||
    !["icon-button", "device-button", "presence-sensor"].includes(coverKindOption?.type) ||
    previewSyncEventName(coverKindOption.id, requestedCoverKind);
}
function coverKindDraftDocument(runAltVariant: any) {
  const coverKindComponent = removedComponent();
  (!airflowSectionEventById.has(runAltVariant) &&
    !(
      coverKindComponent?.type === "device-button" && runAltVariant === iconButtonIconColorElement
    )) ||
    (["icon-button", "device-button", "presence-sensor"].includes(coverKindComponent?.type) &&
      previewSyncEventName(coverKindComponent.id, "auto"));
}
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
function navigationSavedPropertyKey(bindInspectorSection: any, onTimeInspectorFormInput: any) {
  const measuredBoundsSlot = Number(bindInspectorSection.position?.width || 100),
    measuredBoundsCase = Number(bindInspectorSection.position?.height || 100),
    onTimeInspectorFormInputState =
      Number(bindInspectorSection.position?.x || 0) + measuredBoundsSlot / 2,
    timeInputEventState = Number(bindInspectorSection.position?.y || 0) + measuredBoundsCase / 2,
    { width: timeInputEventValue, height: onTimeInspectorFormInputValue } =
      timeComponentDimensions2(onTimeInspectorFormInput);
  editorCtx.editorRenderer?.previewComponentTransform(bindInspectorSection.id, {
    x: onTimeInspectorFormInputState - timeInputEventValue / 2,
    y: timeInputEventState - onTimeInspectorFormInputValue / 2,
    width: timeInputEventValue,
    height: onTimeInspectorFormInputValue,
  });
}
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
function previewDateResize(resizedDateComponent: any, dateDimensionProperties: any) {
  const dateWidth = Number(resizedDateComponent.position?.width || 100),
    dateHeight = Number(resizedDateComponent.position?.height || 100),
    dateCenterX = Number(resizedDateComponent.position?.x || 0) + dateWidth / 2,
    dateCenterY = Number(resizedDateComponent.position?.y || 0) + dateHeight / 2,
    { width: nextDateWidth, height: nextDateHeight } =
      dateComponentDimensions2(dateDimensionProperties);
  editorCtx.editorRenderer?.previewComponentTransform(resizedDateComponent.id, {
    x: dateCenterX - nextDateWidth / 2,
    y: dateCenterY - nextDateHeight / 2,
    width: nextDateWidth,
    height: nextDateHeight,
  });
}
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
function previewWeatherComponentResize(weatherResizeComponent: any, weatherResizeProperties: any) {
  const weatherResizeWidth = Number(weatherResizeComponent.position?.width || 100),
    weatherResizeHeight = Number(weatherResizeComponent.position?.height || 100),
    weatherResizeCenterX = Number(weatherResizeComponent.position?.x || 0) + weatherResizeWidth / 2,
    weatherResizeCenterY =
      Number(weatherResizeComponent.position?.y || 0) + weatherResizeHeight / 2,
    { width: weatherResizeTargetWidth, height: weatherResizeTargetHeight } =
      weatherComponentDimensions2(weatherResizeProperties);
  editorCtx.editorRenderer?.previewComponentTransform(weatherResizeComponent.id, {
    x: weatherResizeCenterX - weatherResizeTargetWidth / 2,
    y: weatherResizeCenterY - weatherResizeTargetHeight / 2,
    width: weatherResizeTargetWidth,
    height: weatherResizeTargetHeight,
  });
}
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
function setNavigationPreviewState(navigationPreviewState: any) {
  if (navigationPreviewState) {
    for (const navigationPreviewButton of navigationPreviewStateElement.querySelectorAll(
      "[data-navigation-preview]",
    ))
      navigationPreviewButton.classList.toggle(
        "active",
        navigationPreviewButton.dataset.navigationPreview === navigationPreviewState,
      );
  }
}
function applyNavigationPreviewState(navigationPreviewComponentId: any, navigationPreviewStateValue: any) {
  if (!navigationPreviewComponentId) return;
  const navigationNormalizedPreviewState = ["on", "off"].includes(navigationPreviewStateValue)
    ? navigationPreviewStateValue
    : "auto";
  (navigationNormalizedPreviewState === "auto"
    ? navigationPreviewStateByComponentId.delete(navigationPreviewComponentId)
    : navigationPreviewStateByComponentId.set(
        navigationPreviewComponentId,
        navigationNormalizedPreviewState,
      ),
    editorCtx.editorRenderer?.setComponentPreviewState(
      navigationPreviewComponentId,
      navigationNormalizedPreviewState,
    ),
    navigationPreviewComponentId === editorCtx.selectedComponentId &&
      setNavigationPreviewState(navigationNormalizedPreviewState));
}
function syncNavigationPreviewFromElement(navigationPreviewInputElement: any) {
  const navigationToggleState = navigationToggleStateByElement.get(navigationPreviewInputElement),
    navigationPreviewComponent = removedComponent();
  return !navigationToggleState || !navigationLabelTextInputElement(navigationPreviewComponent)
    ? null
    : (applyNavigationPreviewState(navigationPreviewComponent.id, navigationToggleState),
      navigationToggleState);
}
const navigationTransformInputSet = new Set([
  navigationLeftElement,
  navigationTopElement,
  navigationWidthElement,
  navigationHeightElement,
  navigationScaleElement,
  navigationRotationElement,
]);
function navigationPropertyNameFromElement(navigationPropertyInputElement: any) {
  const navigationColorPropertyName = navigationColorPropertiesByElement.get(
    navigationPropertyInputElement,
  );
  if (navigationColorPropertyName && (entryStateEntry as any)[navigationColorPropertyName])
    return navigationColorPropertyName;
  const navigationConfigPropertyName = navigationPropertyConfigsByElement.get(
    navigationPropertyInputElement,
  )?.property;
  return navigationConfigPropertyName && (entryStateEntry as any)[navigationConfigPropertyName]
    ? navigationConfigPropertyName
    : navigationPropertyInputElement === navigationWidthElement
      ? "width"
      : navigationPropertyInputElement === navigationHeightElement
        ? "height"
        : navigationPropertyInputElement === navigationScaleElement
          ? "scale"
          : navigationPropertyInputElement === navigationRotationElement
            ? "rotation"
            : "";
}
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
function runAltCopy(runAltAlias: any, runAltFallback: any) {
  if (runAltAlias)
    return runAltFallback === "width" || runAltFallback === "height"
      ? Number(runAltAlias.position?.[runAltFallback] || 100)
      : runAltFallback === "scale"
        ? Number(runAltAlias.style?.scale || 1)
        : runAltFallback === "rotation"
          ? Number(runAltAlias.position?.rotation || 0)
          : (runAltAlias.properties?.[runAltFallback] ??
            clone2((navigationVisibilityComponentState as any)[runAltFallback]));
}
function runAltBackup(runAltShadow: any) {
  if (!runAltShadow || runAltShadow.type !== "line-chart") return [];
  let navigationPreviousVisibility = lineChartBaselineByComponentId.get(runAltShadow.id);
  return (
    navigationPreviousVisibility ||
      ((navigationPreviousVisibility = clone2(
        findComponent2(editorCtx.baselineDocument, runAltShadow.id)?.component || runAltShadow,
      )),
      lineChartBaselineByComponentId.set(runAltShadow.id, navigationPreviousVisibility)),
    Object.keys(navigationVisibilityComponentValue).filter(
      (navigationPreviousVisibilityState) =>
        JSON.stringify(runAltCopy(runAltShadow, navigationPreviousVisibilityState)) !==
        JSON.stringify(runAltCopy(navigationPreviousVisibility, navigationPreviousVisibilityState)),
    )
  );
}
function runAltTwin(
  runAltBranch: any,
  onNavigationPreviewStateClick: any,
  navigationPreviewClickEvent = editorCtx.activeProject?.document,
) {
  if (typeof onNavigationPreviewStateClick == "boolean")
    return onNavigationPreviewStateClick ? "显示" : "隐藏";
  if (runAltBranch === "width" || runAltBranch === "height") {
    const navigationPreviewButtonElement = Number(
      navigationPreviewClickEvent?.canvas?.[runAltBranch] ||
        (runAltBranch === "width" ? 2778 : 1940),
    );
    return (
      roundField2(
        (Number(onNavigationPreviewStateClick || 0) / navigationPreviewButtonElement) * 100,
      ) + "%"
    );
  }
  return runAltBranch === "scale"
    ? roundField2(Number(onNavigationPreviewStateClick || 0) * 100) + "%"
    : runAltBranch === "rotation"
      ? roundField2(Number(onNavigationPreviewStateClick || 0)) + "°"
      : ["valueScale", "valueOffsetX", "valueOffsetY", "cornerRadius"].includes(runAltBranch)
        ? roundField2(Number(onNavigationPreviewStateClick || 0)) + "%"
        : runAltBranch === "updateInterval"
          ? roundField2(Number(onNavigationPreviewStateClick || 0)) + " 秒"
          : runAltBranch === "hours"
            ? roundField2(Number(onNavigationPreviewStateClick || 0)) + " 小时"
            : runAltBranch === "thresholds"
              ? (Array.isArray(onNavigationPreviewStateClick)
                  ? onNavigationPreviewStateClick.length
                  : 0) + " 段配色"
              : String(onNavigationPreviewStateClick ?? "");
}
function runAltPeer(runAltLocal: any, runAltInner: any) {
  if (runAltLocal)
    return runAltInner === "width" || runAltInner === "height"
      ? Number(runAltLocal.position?.[runAltInner] || 100)
      : runAltInner === "scale"
        ? Number(runAltLocal.style?.scale || 1)
        : runAltInner === "rotation"
          ? Number(runAltLocal.position?.rotation || 0)
          : (runAltLocal.properties?.[runAltInner] ??
            (navigationPreviewClickComponentId as any)[runAltInner]);
}
function runAltOuter(runAltUpper: any) {
  if (!runAltUpper || runAltUpper.type !== "title-button") return [];
  const navigationPreviewDatasetState =
    findComponent2(editorCtx.baselineDocument, runAltUpper.id)?.component || runAltUpper;
  return Object.keys(navigationPreviewClickComponentIdState).filter(
    (onNavigationStyleApplyCloseButtonClick) =>
      JSON.stringify(runAltPeer(runAltUpper, onNavigationStyleApplyCloseButtonClick)) !==
      JSON.stringify(
        runAltPeer(navigationPreviewDatasetState, onNavigationStyleApplyCloseButtonClick),
      ),
  );
}
function onNavigationStyleApplyCancelButtonClick(
  onNavigationStyleApplyDialogClick: any,
  styleDialogClickEvent: any,
  onNavigationStyleApplyDialogClose = editorCtx.activeProject?.document,
) {
  if (typeof styleDialogClickEvent == "boolean") return styleDialogClickEvent ? "显示" : "隐藏";
  if (
    onNavigationStyleApplyDialogClick === "width" ||
    onNavigationStyleApplyDialogClick === "height"
  ) {
    const onNavigationStyleApplyDialogCloseState = Number(
      onNavigationStyleApplyDialogClose?.canvas?.[onNavigationStyleApplyDialogClick] ||
        (onNavigationStyleApplyDialogClick === "width" ? 2778 : 1940),
    );
    return (
      roundField2(
        (Number(styleDialogClickEvent || 0) / onNavigationStyleApplyDialogCloseState) * 100,
      ) + "%"
    );
  }
  return onNavigationStyleApplyDialogClick === "scale"
    ? roundField2(Number(styleDialogClickEvent || 0) * 100) + "%"
    : onNavigationStyleApplyDialogClick === "rotation"
      ? roundField2(Number(styleDialogClickEvent || 0)) + "°"
      : [
            "mainSize",
            "secondarySize",
            "mainSpacing",
            "secondarySpacing",
            "secondaryLineGap",
            "mainTextLeft",
            "mainTextTop",
            "secondaryTextLeft",
            "secondaryTextTop",
            "iconSize",
            "iconLeft",
            "iconTop",
            "frameSize",
            "frameSpacing",
            "frameOffsetX",
            "frameOffsetY",
            "markerSize",
            "markerLeft",
            "markerTop",
          ].includes(onNavigationStyleApplyDialogClick)
        ? roundField2(Number(styleDialogClickEvent || 0)) + "%"
        : String(styleDialogClickEvent ?? "");
}
function onNavigationStyleApplyConfirmButtonClick(styleSourceComponentId: any, runAltLower: any) {
  if (styleSourceComponentId)
    return runAltLower === "width" || runAltLower === "height"
      ? Number(styleSourceComponentId.position?.[runAltLower] || 100)
      : runAltLower === "scale"
        ? Number(styleSourceComponentId.style?.scale || 1)
        : runAltLower === "rotation"
          ? Number(styleSourceComponentId.position?.rotation || 0)
          : (styleSourceComponentId.properties?.[runAltLower] ??
            (onNavigationStyleApplyConfirmButtonClickState as any)[runAltLower]);
}
function runAltLeft(runAltRight: any) {
  if (!runAltRight || runAltRight.type !== "air-conditioner") return [];
  let selectedStylePropertyKeys = airConditionerBaselineByComponentId.get(runAltRight.id);
  return (
    selectedStylePropertyKeys ||
      ((selectedStylePropertyKeys = clone2(
        findComponent2(editorCtx.baselineDocument, runAltRight.id)?.component || runAltRight,
      )),
      airConditionerBaselineByComponentId.set(runAltRight.id, selectedStylePropertyKeys)),
    Object.keys(onNavigationStyleApplyConfirmButtonClickValue).filter(
      (onNavigationStyleApplyConfirmButtonClickConfig) =>
        JSON.stringify(
          onNavigationStyleApplyConfirmButtonClick(
            runAltRight,
            onNavigationStyleApplyConfirmButtonClickConfig,
          ),
        ) !==
        JSON.stringify(
          onNavigationStyleApplyConfirmButtonClick(
            selectedStylePropertyKeys,
            onNavigationStyleApplyConfirmButtonClickConfig,
          ),
        ),
    )
  );
}
function runAltFirst(runAltSecond: any, runAltLast: any, runAltOld = editorCtx.activeProject?.document) {
  if (typeof runAltLast == "boolean") return runAltLast ? "显示" : "隐藏";
  if (runAltSecond === "width" || runAltSecond === "height") {
    const selectedTargetComponentIdsState = Number(
      runAltOld?.canvas?.[runAltSecond] || (runAltSecond === "width" ? 2778 : 1940),
    );
    return roundField2((Number(runAltLast || 0) / selectedTargetComponentIdsState) * 100) + "%";
  }
  return ["scale", "airflowScale", "badgeOpacity"].includes(runAltSecond)
    ? roundField2(Number(runAltLast || 0) * 100) + "%"
    : ["rotation", "airflowRotation", "airflowAngle"].includes(runAltSecond)
      ? roundField2(Number(runAltLast || 0)) + "°"
      : runAltSecond === "airflowMotion"
        ? runAltLast === "static"
          ? "静态"
          : "动态"
        : typeof runAltLast == "number"
          ? roundField2(runAltLast)
          : String(runAltLast ?? "");
}
function runAltNew(styleTypeLabel: any, runAuxExtra: any) {
  if (styleTypeLabel)
    return runAuxExtra === "width" || runAuxExtra === "height"
      ? Number(styleTypeLabel.position?.[runAuxExtra] || 100)
      : runAuxExtra === "scale"
        ? Number(styleTypeLabel.style?.scale || 1)
        : runAuxExtra === "rotation"
          ? Number(styleTypeLabel.position?.rotation || 0)
          : (styleTypeLabel.properties?.[runAuxExtra] ??
            (onNavigationStyleApplyDialogCloseValue as any)[runAuxExtra]);
}
function runAuxAlt(runAuxAux: any) {
  if (!runAuxAux || runAuxAux.type !== "icon-button-effect") return [];
  let navigationPreviousVisibilityValue = iconButtonEffectBaselineByComponentId.get(runAuxAux.id);
  return (
    navigationPreviousVisibilityValue ||
      ((navigationPreviousVisibilityValue = clone2(
        findComponent2(editorCtx.baselineDocument, runAuxAux.id)?.component || runAuxAux,
      )),
      iconButtonEffectBaselineByComponentId.set(runAuxAux.id, navigationPreviousVisibilityValue)),
    Object.keys(styleSourceComponentIdState).filter(
      (styleSourceComponentIdValue) =>
        JSON.stringify(runAltNew(runAuxAux, styleSourceComponentIdValue)) !==
        JSON.stringify(runAltNew(navigationPreviousVisibilityValue, styleSourceComponentIdValue)),
    )
  );
}
function runAuxVariant(runAuxCopy: any, runAuxAlias: any, runAuxFallback = editorCtx.activeProject?.document) {
  if (typeof runAuxAlias == "boolean") return runAuxAlias ? "显示" : "隐藏";
  if (runAuxCopy === "width" || runAuxCopy === "height") {
    const navigationPreviewButtonElementState = Number(
      runAuxFallback?.canvas?.[runAuxCopy] || (runAuxCopy === "width" ? 2778 : 1940),
    );
    return (
      roundField2((Number(runAuxAlias || 0) / navigationPreviewButtonElementState) * 100) + "%"
    );
  }
  return [
    "buttonOpacity",
    "frameOpacity",
    "glowOffStrength",
    "glowOnStrength",
    "effectOpacity",
    "effectScale",
    "scale",
  ].includes(runAuxCopy)
    ? roundField2(Number(runAuxAlias || 0) * 100) + "%"
    : ["iconSize", "radius", "effectLeft", "effectTop"].includes(runAuxCopy)
      ? roundField2(Number(runAuxAlias || 0)) + "%"
      : ["effectRotation", "rotation"].includes(runAuxCopy)
        ? roundField2(Number(runAuxAlias || 0)) + "°"
        : ["effectFadeDuration", "onFillFadeDuration"].includes(runAuxCopy)
          ? roundField2(Number(runAuxAlias || 0)) + " 秒"
          : runAuxCopy === "effectLayoutMode"
            ? runAuxAlias === "fill"
              ? "铺满"
              : "自由"
            : String(runAuxAlias || "不使用");
}
function runAuxBackup(runAuxShadow: any) {
  const styleComponentType = runAuxShadow?.properties?.sensorKind;
  return ["presence", "door-window", "water-leak", "smoke", "natural-gas"].includes(
    styleComponentType,
  )
    ? styleComponentType
    : "presence";
}
function runAuxTwin(runAuxBranch: any) {
  return ({
    presence: "人体/人在传感器",
    "door-window": "门窗传感器",
    "water-leak": "水浸传感器",
    smoke: "烟雾传感器",
    "natural-gas": "天然气传感器",
  } as any)[runAuxBackup(runAuxBranch)];
}
function runAuxPeer(stylePropertyCheckbox: any) {
  const selectedTargetComponentIds = ["width", "height", "scale", "rotation"],
    rr3 = runAuxBackup(stylePropertyCheckbox);
  return rr3 === "presence"
    ? [
        "iconColor",
        "iconOnColor",
        "haloVisible",
        "haloScaleX",
        "haloScaleY",
        "haloRotation",
        "haloOpacity",
        "personVisible",
        "personScale",
        "personRotation",
        "personOpacity",
        "orbitDuration",
        ...selectedTargetComponentIds,
      ]
    : rr3 === "door-window"
      ? ["iconOnColor", "perspectiveCorners", ...selectedTargetComponentIds]
      : rr3 === "water-leak"
        ? ["waterLeakColor", ...selectedTargetComponentIds]
        : rr3 === "smoke"
          ? ["smokeColor", ...selectedTargetComponentIds]
          : ["naturalGasColor", ...selectedTargetComponentIds];
}
function styleTargetCheckbox(styleApplyDraftDocument: any, styleTargetComponentId: any) {
  if (!styleApplyDraftDocument) return;
  if (styleTargetComponentId === "width" || styleTargetComponentId === "height")
    return Number(styleApplyDraftDocument.position?.[styleTargetComponentId] || 100);
  if (styleTargetComponentId === "scale") return Number(styleApplyDraftDocument.style?.scale || 1);
  if (styleTargetComponentId === "rotation")
    return Number(styleApplyDraftDocument.position?.rotation || 0);
  const styleTargetComponentDraft = styleApplyDraftDocument.properties || {};
  return styleTargetComponentId === "iconColor"
    ? (styleTargetComponentDraft.iconColor ??
        styleTargetComponentDraft.clearColor ??
        styleTargetComponentDraft.iconOffColor ??
        styleTargetComponentDraft.iconOnColor ??
        styleComponentTypeState.iconColor)
    : styleTargetComponentId === "iconOnColor"
      ? (styleTargetComponentDraft.iconOnColor ??
        styleTargetComponentDraft.occupiedColor ??
        styleComponentTypeState.iconOnColor)
      : styleTargetComponentId === "mainColor"
        ? (styleTargetComponentDraft.mainColor ??
          styleTargetComponentDraft.mainOffColor ??
          styleTargetComponentDraft.mainOnColor ??
          styleComponentTypeState.mainColor)
        : styleTargetComponentId === "secondaryColor"
          ? (styleTargetComponentDraft.secondaryColor ??
            styleTargetComponentDraft.secondaryOffColor ??
            styleTargetComponentDraft.secondaryOnColor ??
            styleComponentTypeState.secondaryColor)
          : (styleTargetComponentDraft[styleTargetComponentId] ??
            (styleComponentTypeState as any)[styleTargetComponentId]);
}
function appliedStylePropertyKey(styleApplyButton: any) {
  if (
    !styleApplyButton ||
    !["icon-button", "device-button", "presence-sensor"].includes(styleApplyButton.type)
  )
    return [];
  let styleFeedbackTimeoutId = iconButtonBaselineByComponentId.get(styleApplyButton.id);
  return (
    styleFeedbackTimeoutId ||
      ((styleFeedbackTimeoutId = clone2(
        findComponent2(editorCtx.baselineDocument, styleApplyButton.id)?.component || styleApplyButton,
      )),
      iconButtonBaselineByComponentId.set(styleApplyButton.id, styleFeedbackTimeoutId)),
    (styleApplyButton.type === "presence-sensor"
      ? runAuxPeer(styleApplyButton)
      : styleApplyButton.type === "device-button"
        ? [
            "iconColor",
            "iconOnColor",
            "badgeColor",
            "badgeOpacity",
            "symbolSize",
            "badgeSize",
            "iconLeft",
            "iconTop",
            "mainColor",
            "mainSize",
            "mainWeight",
            "mainSpacing",
            "mainTextLeft",
            "mainTextTop",
            "secondaryColor",
            "secondarySize",
            "secondaryWeight",
            "secondarySpacing",
            "secondaryTextLeft",
            "secondaryTextTop",
            "width",
            "height",
            "scale",
            "rotation",
          ]
        : Object.keys(styleComponentTypeValue)
    ).filter(
      (onNavigationIconButtonClick) =>
        JSON.stringify(styleTargetCheckbox(styleApplyButton, onNavigationIconButtonClick)) !==
        JSON.stringify(styleTargetCheckbox(styleFeedbackTimeoutId, onNavigationIconButtonClick)),
    )
  );
}
function onNavigationIconCopyButtonClick(navigationSelectedIconName: any, runAuxLocal: any) {
  return navigationSelectedIconName?.type === "presence-sensor"
    ? (styleComponentTypeConfig as any)[runAuxLocal]
    : navigationSelectedIconName?.type !== "device-button"
      ? (styleComponentTypeValue as any)[runAuxLocal]
      : runAuxLocal.startsWith("main")
        ? {
            group: "标题",
            label:
              runAuxLocal === "mainOnOpacity"
                ? "透明度"
                : (styleComponentTypeValue as any)[runAuxLocal]?.label?.replace("中文", ""),
          }
        : runAuxLocal.startsWith("secondary")
          ? {
              group: "状态",
              label:
                runAuxLocal === "secondaryOnOpacity"
                  ? "透明度"
                  : (styleComponentTypeValue as any)[runAuxLocal]?.label?.replace("英文", ""),
            }
          : (styleComponentTypeValue as any)[runAuxLocal];
}
function navigationIconCopyError(
  onNavigationIconSearchInputInput: any,
  onNavigationIconOptionsClick: any,
  navigationIconOptionClickEvent = editorCtx.activeProject?.document,
) {
  if (typeof onNavigationIconOptionsClick == "boolean")
    return onNavigationIconOptionsClick ? "显示" : "隐藏";
  if (
    onNavigationIconSearchInputInput === "width" ||
    onNavigationIconSearchInputInput === "height"
  ) {
    const navigationIconOptionElement = Number(
      navigationIconOptionClickEvent?.canvas?.[onNavigationIconSearchInputInput] ||
        (onNavigationIconSearchInputInput === "width" ? 2778 : 1940),
    );
    return (
      roundField2((Number(onNavigationIconOptionsClick || 0) / navigationIconOptionElement) * 100) +
      "%"
    );
  }
  return onNavigationIconSearchInputInput === "scale"
    ? roundField2(Number(onNavigationIconOptionsClick || 0) * 100) + "%"
    : onNavigationIconSearchInputInput === "perspectiveCorners"
      ? JSON.stringify(onNavigationIconOptionsClick) === JSON.stringify(DEFAULT_PERSPECTIVE_CORNERS)
        ? "默认透视"
        : "自定义透视"
      : onNavigationIconSearchInputInput === "orbitDuration"
        ? roundField2(Number(onNavigationIconOptionsClick || 0)) + " 秒"
        : onNavigationIconSearchInputInput === "onFillFadeDuration"
          ? roundField2(Number(onNavigationIconOptionsClick || 0)) + " 秒"
          : [
                "rotation",
                "frameAngle",
                "softLightAngle",
                "glowAngle",
                "haloRotation",
                "personRotation",
              ].includes(onNavigationIconSearchInputInput)
            ? roundField2(Number(onNavigationIconOptionsClick || 0)) + "°"
            : [
                  "iconOffOpacity",
                  "iconOnOpacity",
                  "mainOffOpacity",
                  "mainOnOpacity",
                  "secondaryOffOpacity",
                  "secondaryOnOpacity",
                  "badgeOpacity",
                  "onFillStrength",
                  "frameOffOpacity",
                  "frameOnOpacity",
                  "softLightStrength",
                  "softLightSize",
                  "glowStrength",
                  "glowSize",
                  "haloScaleX",
                  "haloScaleY",
                  "haloOpacity",
                  "personScale",
                  "personOpacity",
                ].includes(onNavigationIconSearchInputInput)
              ? roundField2(Number(onNavigationIconOptionsClick || 0) * 100) + "%"
              : [
                    "iconSize",
                    "symbolSize",
                    "badgeSize",
                    "iconLeft",
                    "iconTop",
                    "mainTextLeft",
                    "mainTextTop",
                    "secondaryTextLeft",
                    "secondaryTextTop",
                    "cutCorner",
                  ].includes(onNavigationIconSearchInputInput)
                ? roundField2(Number(onNavigationIconOptionsClick || 0)) + "%"
                : String(onNavigationIconOptionsClick ?? "");
}
function runAuxInner(runAuxOuter: any, runAuxUpper: any) {
  if (!runAuxOuter) return;
  if (runAuxUpper === "width" || runAuxUpper === "height")
    return Number(runAuxOuter.position?.[runAuxUpper] || 100);
  if (runAuxUpper === "scale") return Number(runAuxOuter.style?.scale || 1);
  if (runAuxUpper === "rotation") return Number(runAuxOuter.position?.rotation || 0);
  const navigationIconComponentId = runAuxOuter.properties || {};
  if (runAuxUpper === "displayMode")
    return navigationIconComponentId.displayMode === "snapshot" ? "snapshot" : "live";
  if (runAuxUpper === "refreshInterval") {
    const navigationIconComponentIdState = Number(navigationIconComponentId.refreshInterval);
    return Number.isFinite(navigationIconComponentIdState)
      ? Math.max(6, Math.round(navigationIconComponentIdState))
      : 10;
  }
  if (runAuxUpper === "fit")
    return navigationIconComponentId.fit === "contain" ? "contain" : "fill";
  if (runAuxUpper === "radius") {
    const styleFeedbackTimeoutIdState = Number(
      navigationIconComponentId.radius ?? navigationIconOptionState.radius,
    );
    return Math.max(
      0,
      Math.min(
        0.5,
        styleFeedbackTimeoutIdState > 0.5
          ? styleFeedbackTimeoutIdState / 100
          : styleFeedbackTimeoutIdState,
      ),
    );
  }
  return navigationIconComponentId[runAuxUpper] ?? (navigationIconOptionState as any)[runAuxUpper];
}
function runAuxLower(runAuxLeft: any) {
  if (!runAuxLeft || runAuxLeft.type !== "camera") return [];
  const navigationIconDatasetName =
    findComponent2(editorCtx.baselineDocument, runAuxLeft.id)?.component || runAuxLeft;
  return Object.keys(navigationIconOptionStateState).filter(
    (navigationIconDatasetNameState) =>
      JSON.stringify(runAuxInner(runAuxLeft, navigationIconDatasetNameState)) !==
      JSON.stringify(runAuxInner(navigationIconDatasetName, navigationIconDatasetNameState)),
  );
}
function runAuxRight(runAuxFirst: any, runAuxSecond: any, runAuxLast = editorCtx.activeProject?.document) {
  if (typeof runAuxSecond == "boolean") return runAuxSecond ? "显示" : "隐藏";
  if (runAuxFirst === "displayMode") return runAuxSecond === "snapshot" ? "快照" : "实时";
  if (runAuxFirst === "refreshInterval") return roundField2(Number(runAuxSecond || 10)) + " 秒";
  if (runAuxFirst === "fit") return runAuxSecond === "contain" ? "原始比例" : "压缩 16:9";
  if (runAuxFirst === "width" || runAuxFirst === "height") {
    const navigationIconDraftDocumentState = Number(
      runAuxLast?.canvas?.[runAuxFirst] || (runAuxFirst === "width" ? 2778 : 1940),
    );
    return roundField2((Number(runAuxSecond || 0) / navigationIconDraftDocumentState) * 100) + "%";
  }
  return runAuxFirst === "scale" || runAuxFirst === "radius" || runAuxFirst === "frameOpacity"
    ? roundField2(Number(runAuxSecond || 0) * 100) + "%"
    : runAuxFirst === "rotation" || runAuxFirst === "frameAngle"
      ? roundField2(Number(runAuxSecond || 0)) + "°"
      : String(runAuxSecond ?? "");
}
function runAuxOld(runAuxNew: any, navigationIconDraftDocument: any) {
  if (!runAuxNew) return;
  if (navigationIconDraftDocument === "width" || navigationIconDraftDocument === "height")
    return Number(runAuxNew.position?.[navigationIconDraftDocument] || 100);
  if (navigationIconDraftDocument === "scale") return Number(runAuxNew.style?.scale || 1);
  if (navigationIconDraftDocument === "rotation") return Number(runAuxNew.position?.rotation || 0);
  const navigationIconComponent = runAuxNew.properties || {};
  if (
    navigationIconDraftDocument === "mainTextLeft" ||
    navigationIconDraftDocument === "secondaryTextLeft"
  )
    return (
      navigationIconComponent[navigationIconDraftDocument] ??
      navigationIconComponent.textLeft ??
      (navigationIconDraftDocumentValue as any)[navigationIconDraftDocument]
    );
  if (navigationIconDraftDocument === "mainTextTop") {
    const navigationIconPreviousValue = Math.max(1, Number(runAuxNew.position?.height || 100));
    return (
      navigationIconComponent.mainTextTop ??
      Number(navigationIconComponent.textTop ?? 28) -
        (Number(navigationIconComponent.lineGap ?? 24) / navigationIconPreviousValue) * 100
    );
  }
  return navigationIconDraftDocument === "secondaryTextTop"
    ? (navigationIconComponent.secondaryTextTop ??
        navigationIconComponent.textTop ??
        navigationIconDraftDocumentValue.secondaryTextTop)
    : (navigationIconComponent[navigationIconDraftDocument] ??
        (navigationIconDraftDocumentValue as any)[navigationIconDraftDocument]);
}
function runVariantExtra(runVariantAlt: any) {
  if (!runVariantAlt || runVariantAlt.type !== "panel-frame") return [];
  let navigationIconVisiblePreviousValue = panelFrameBaselineByComponentId.get(runVariantAlt.id);
  return (
    navigationIconVisiblePreviousValue ||
      ((navigationIconVisiblePreviousValue = clone2(
        findComponent2(editorCtx.baselineDocument, runVariantAlt.id)?.component || runVariantAlt,
      )),
      panelFrameBaselineByComponentId.set(runVariantAlt.id, navigationIconVisiblePreviousValue)),
    Object.keys(navigationIconDraftDocumentConfig).filter((filteredItemsEntry) =>
      !navigationIconVisiblePreviousValue ||
      navigationIconVisiblePreviousValue.type !== "panel-frame"
        ? true
        : JSON.stringify(runAuxOld(runVariantAlt, filteredItemsEntry)) !==
          JSON.stringify(runAuxOld(navigationIconVisiblePreviousValue, filteredItemsEntry)),
    )
  );
}
function runVariantAux(
  runVariantVariant: any,
  runVariantCopy: any,
  bindAssetSection = editorCtx.activeProject?.document,
) {
  if (typeof runVariantCopy == "boolean") return runVariantCopy ? "显示" : "隐藏";
  if (runVariantVariant === "width" || runVariantVariant === "height") {
    const selectedTargetComponentIdsValue = Number(
      bindAssetSection?.canvas?.[runVariantVariant] ||
        (runVariantVariant === "width" ? 2778 : 1940),
    );
    return roundField2((Number(runVariantCopy || 0) / selectedTargetComponentIdsValue) * 100) + "%";
  }
  return runVariantVariant === "scale"
    ? roundField2(Number(runVariantCopy || 0) * 100) + "%"
    : runVariantVariant === "rotation" ||
        runVariantVariant === "edgeAngle" ||
        runVariantVariant === "glowAngle"
      ? roundField2(Number(runVariantCopy || 0)) + "°"
      : [
            "mainOpacity",
            "secondaryOpacity",
            "edgeOpacity",
            "radius",
            "glowStrength",
            "glowSize",
          ].includes(runVariantVariant)
        ? roundField2(Number(runVariantCopy || 0) * 100) + "%"
        : ["mainTextLeft", "mainTextTop", "secondaryTextLeft", "secondaryTextTop"].includes(
              runVariantVariant,
            )
          ? roundField2(Number(runVariantCopy || 0)) + "%"
          : String(runVariantCopy ?? "");
}
function entryStateRecord(entryStateName: any, runVariantAlias: any) {
  if (!entryStateName) return;
  if (runVariantAlias === "width" || runVariantAlias === "height")
    return Number(entryStateName.position?.[runVariantAlias] || 100);
  if (runVariantAlias === "scale") return Number(entryStateName.style?.scale || 1);
  if (runVariantAlias === "rotation") return Number(entryStateName.position?.rotation || 0);
  const availablePropertiesKey = entryStateName.properties || {},
    styleTypeLabelState = (entryStateRef as any)[runVariantAlias];
  return runVariantAlias === "textIdleOpacity"
    ? (availablePropertiesKey[runVariantAlias] ??
        availablePropertiesKey.idleOpacity ??
        styleTypeLabelState)
    : runVariantAlias === "textActiveOpacity"
      ? (availablePropertiesKey[runVariantAlias] ??
        availablePropertiesKey.activeOpacity ??
        styleTypeLabelState)
      : runVariantAlias === "iconIdleOpacity"
        ? (availablePropertiesKey[runVariantAlias] ??
          availablePropertiesKey.idleOpacity ??
          styleTypeLabelState)
        : runVariantAlias === "iconActiveOpacity"
          ? (availablePropertiesKey[runVariantAlias] ??
            availablePropertiesKey.activeOpacity ??
            styleTypeLabelState)
          : runVariantAlias === "mainTextLeft" || runVariantAlias === "secondaryTextLeft"
            ? (availablePropertiesKey[runVariantAlias] ??
              availablePropertiesKey.textLeft ??
              styleTypeLabelState)
            : runVariantAlias === "mainTextTop"
              ? (availablePropertiesKey[runVariantAlias] ??
                Number(availablePropertiesKey.textTop ?? 81.5) - 1800 / 64.36)
              : runVariantAlias === "secondaryTextTop"
                ? (availablePropertiesKey[runVariantAlias] ??
                  availablePropertiesKey.textTop ??
                  styleTypeLabelState)
                : (availablePropertiesKey[runVariantAlias] ?? styleTypeLabelState);
}
function runVariantFallback(runVariantBackup: any, runVariantShadow: any) {
  return JSON.stringify(runVariantBackup) === JSON.stringify(runVariantShadow);
}
function onImageAssetUploadButtonClick(
  onIconButtonEffectAssetUploadButtonClick: any,
  onImageAssetUploadInputChange: any,
  onIconButtonEffectAssetUploadInputChange: any,
  assetOptionsElement: any,
) {
  if (!onIconButtonEffectAssetUploadButtonClick || !(entryStateEntry as any)[onImageAssetUploadInputChange])
    return;
  let navigationIconVisiblePreviousValueState = navigationButtonSavedSettingsByComponentId.get(
    onIconButtonEffectAssetUploadButtonClick,
  );
  (!navigationIconVisiblePreviousValueState &&
    runVariantFallback(onIconButtonEffectAssetUploadInputChange, assetOptionsElement)) ||
    (navigationIconVisiblePreviousValueState ||
      ((navigationIconVisiblePreviousValueState = new Map()),
      navigationButtonSavedSettingsByComponentId.set(
        onIconButtonEffectAssetUploadButtonClick,
        navigationIconVisiblePreviousValueState,
      )),
    navigationIconVisiblePreviousValueState.has(onImageAssetUploadInputChange) ||
      navigationIconVisiblePreviousValueState.set(
        onImageAssetUploadInputChange,
        clone2(onIconButtonEffectAssetUploadInputChange),
      ));
}
function onAssetOptionsClick(assetOptionsClickEvent: any) {
  const deleteUserAssetElement = navigationButtonSavedSettingsByComponentId.get(
    assetOptionsClickEvent?.id,
  );
  if (deleteUserAssetElement) {
    for (const deleteUserAssetElementState of deleteUserAssetElement.keys())
      (entryStateEntry as any)[deleteUserAssetElementState] ||
        deleteUserAssetElement.delete(deleteUserAssetElementState);
    deleteUserAssetElement.size ||
      navigationButtonSavedSettingsByComponentId.delete(assetOptionsClickEvent.id);
  }
}
function runVariantTwin(runVariantBranch: any) {
  return (
    onAssetOptionsClick(runVariantBranch),
    [...(navigationButtonSavedSettingsByComponentId.get(runVariantBranch?.id)?.entries() || [])]
      .filter(
        ([filteredItemsRecord, filteredItemsName]) =>
          !runVariantFallback(
            entryStateRecord(runVariantBranch, filteredItemsRecord),
            filteredItemsName,
          ),
      )
      .map(([onDeleteAssetCloseButtonClick]) => onDeleteAssetCloseButtonClick)
  );
}
function onDeleteAssetCancelButtonClick(
  onDeleteAssetDialogClick: any,
  deleteAssetDialogClickEvent: any,
  onDeleteAssetConfirmButtonClick = editorCtx.activeProject?.document,
) {
  if (typeof deleteAssetDialogClickEvent == "boolean")
    return deleteAssetDialogClickEvent ? "显示" : "隐藏";
  if (onDeleteAssetDialogClick === "width" || onDeleteAssetDialogClick === "height") {
    const deleteAssetRequestId = Number(
      onDeleteAssetConfirmButtonClick?.canvas?.[onDeleteAssetDialogClick] ||
        (onDeleteAssetDialogClick === "width" ? 2778 : 1940),
    );
    return (
      roundField2((Number(deleteAssetDialogClickEvent || 0) / deleteAssetRequestId) * 100) + "%"
    );
  }
  return onDeleteAssetDialogClick === "scale"
    ? roundField2(Number(deleteAssetDialogClickEvent || 0) * 100) + "%"
    : onDeleteAssetDialogClick === "rotation"
      ? roundField2(Number(deleteAssetDialogClickEvent || 0)) + "°"
      : [
            "textIdleOpacity",
            "textActiveOpacity",
            "iconIdleOpacity",
            "iconActiveOpacity",
            "frameIdleOpacity",
            "frameActiveOpacity",
            "radius",
            "glowIdleStrength",
            "glowIdleSize",
            "glowActiveStrength",
            "glowActiveSize",
          ].includes(onDeleteAssetDialogClick)
        ? roundField2(Number(deleteAssetDialogClickEvent || 0) * 100) + "%"
        : [
              "mainTextLeft",
              "mainTextTop",
              "secondaryTextLeft",
              "secondaryTextTop",
              "iconLeft",
              "iconTop",
            ].includes(onDeleteAssetDialogClick)
          ? roundField2(Number(deleteAssetDialogClickEvent || 0)) + "%"
          : onDeleteAssetDialogClick === "frameAngle" || onDeleteAssetDialogClick === "glowAngle"
            ? roundField2(Number(deleteAssetDialogClickEvent || 0)) + "°"
            : String(deleteAssetDialogClickEvent ?? "");
}
/** 导航「套用到其它控件」目标列表（P4 搬进 `navigation-style-apply/target-options`，此处只转发句柄）。 */
const navigationStyleApplyTargetDeps = () => ({ navigationStyleApplyTargetsElement });
function runVariantLower(runVariantLeft: any, runVariantRight: any) {
  return runVariantLowerCore(navigationStyleApplyTargetDeps(), runVariantLeft, runVariantRight);
}
function runVariantFirst() {
  const createdInstanceName = removedComponent();
  if (!navigationLabelTextInputElement(createdInstanceName)) return;
  const mC2 = runVariantTwin(createdInstanceName),
    styleFeedbackTimeoutIdValue = findReplaceableComponents(createdInstanceName);
  !mC2.length ||
    !styleFeedbackTimeoutIdValue.length ||
    ((navigationStyleApplyTitleElement.textContent =
      createdInstanceName.type === "scene-mode" ? "应用情景模式设置" : "应用导航按钮设置"),
    (navigationStyleApplyTargetHeadingElement.textContent =
      createdInstanceName.type === "scene-mode" ? "应用到情景模式" : "应用到导航按钮"),
    (navigationStyleApplyTargetScopeElement.textContent = "按区域与页面区分"),
    (navigationStyleApplySummaryElement.textContent =
      "将“" +
      componentLabel2(createdInstanceName) +
      "”中选定的修改应用到选中的" +
      (createdInstanceName.type === "scene-mode" ? "情景模式" : "导航按钮") +
      "。图标名称、文字内容、目标页面、备注和位置不会改变。"),
    navigationStyleApplyPropertiesElement.replaceChildren(
      ...mC2.map((deleteAssetFolderError) => {
        const isNavigationIconMenuHidden = (entryStateEntry as any)[deleteAssetFolderError],
          $e8 = entryStateRecord(createdInstanceName, deleteAssetFolderError);
        return runVariantPeer({
          value: deleteAssetFolderError,
          label: isNavigationIconMenuHidden.label,
          detail:
            isNavigationIconMenuHidden.group +
            " · " +
            onDeleteAssetCancelButtonClick(deleteAssetFolderError, $e8),
        });
      }),
    ),
    runVariantLower(styleFeedbackTimeoutIdValue, (onImageAssetButtonClick: any) => {
      const isImageAssetMenuHidden =
          onImageAssetButtonClick.properties?.targetPage ||
          onImageAssetButtonClick.actions?.tap?.target ||
          "",
        imageAssetCatalogErrorState = editorCtx.activeProject.document.pages.find(
          (imageAssetCatalogError: any) => imageAssetCatalogError.path === isImageAssetMenuHidden,
        );
      return createdInstanceName.type === "scene-mode"
        ? onImageAssetButtonClick.bindings?.entity?.entityId || "未绑定实体"
        : imageAssetCatalogErrorState
          ? "跳转到：" + imageAssetCatalogErrorState.name
          : "未设置目标页面";
    }),
    (navigationStyleApplyMessageElement.hidden = true),
    (navigationStyleApplyMessageElement.textContent = ""),
    (editorCtx.appliedStyleRecord = {
      sourceId: createdInstanceName.id,
      type: createdInstanceName.type,
    }),
    navigationStyleApplyDialogElement.showModal());
}
function onImageAssetFolderSelectChange(
  onImageAssetSearchInputInput: any,
  onImageAssetOptionsPointerover: any,
) {
  return typeof onImageAssetOptionsPointerover == "boolean"
    ? onImageAssetSearchInputInput === "animated"
      ? onImageAssetOptionsPointerover
        ? "开启"
        : "关闭"
      : onImageAssetOptionsPointerover
        ? "显示"
        : "隐藏"
    : onImageAssetSearchInputInput === "effect"
      ? onImageAssetOptionsPointerover === "energy"
        ? "能量"
        : "水流"
      : onImageAssetSearchInputInput === "shape"
        ? ({
            straight: "折线",
            rounded: "圆角",
            curve: "曲线",
          } as any)[onImageAssetOptionsPointerover]
        : onImageAssetSearchInputInput === "direction"
          ? onImageAssetOptionsPointerover === -1
            ? "反向"
            : "正向"
          : onImageAssetSearchInputInput === "opacity" ||
              onImageAssetSearchInputInput === "baseOpacity"
            ? roundField2(onImageAssetOptionsPointerover * 100) + "%"
            : onImageAssetSearchInputInput === "glow"
              ? onImageAssetOptionsPointerover + "%"
              : String(onImageAssetOptionsPointerover);
}
function imageAssetPointerOverEvent() {
  const imageAssetHoverElement = removedComponent();
  if (imageAssetHoverElement?.type !== "flow-line") return;
  const im2 = runExtraLocal(imageAssetHoverElement),
    pe2 = findReplaceableComponents(imageAssetHoverElement);
  if (!im2.length || !pe2.length) return;
  const hoveredAsset = normalizeFlowLine2(imageAssetHoverElement.properties);
  ((navigationStyleApplyTitleElement.textContent = "应用流水线条设置"),
    (navigationStyleApplyTargetHeadingElement.textContent = "应用到流水线条"),
    (navigationStyleApplyTargetScopeElement.textContent = "按区域与页面区分"),
    (navigationStyleApplySummaryElement.textContent =
      "将“" +
      componentLabel2(imageAssetHoverElement) +
      "”的选定外观修改应用到同类控件。每条线的路径、名称和位置保持各自设置。"),
    navigationStyleApplyPropertiesElement.replaceChildren(
      ...im2.map((onImageAssetOptionsClick) =>
        runVariantPeer({
          value: onImageAssetOptionsClick,
          label: (FLOW_LINE_FIELDS2 as any)[onImageAssetOptionsClick],
          detail: onImageAssetFolderSelectChange(
            onImageAssetOptionsClick,
            (hoveredAsset as any)[onImageAssetOptionsClick],
          ),
        }),
      ),
    ),
    runVariantLower(pe2, "流水线条"),
    (navigationStyleApplyMessageElement.hidden = true),
    (editorCtx.appliedStyleRecord = {
      sourceId: imageAssetHoverElement.id,
      type: "flow-line",
    }),
    navigationStyleApplyDialogElement.showModal());
}
function imageAssetClickEvent() {
  const imageAssetElement = removedComponent();
  if (!imageAssetElement || imageAssetElement.type !== "panel-frame") return;
  const pC2 = runVariantExtra(imageAssetElement),
    pe3 = findReplaceableComponents(imageAssetElement);
  !pC2.length ||
    !pe3.length ||
    ((navigationStyleApplyTitleElement.textContent = "应用底图框设置"),
    (navigationStyleApplyTargetHeadingElement.textContent = "应用到底图框"),
    (navigationStyleApplyTargetScopeElement.textContent = "按区域与页面区分"),
    (navigationStyleApplySummaryElement.textContent =
      "将“" +
      componentLabel2(imageAssetElement) +
      "”中选定的修改应用到选中的底图框。文字内容、备注和位置不会改变。"),
    navigationStyleApplyPropertiesElement.replaceChildren(
      ...pC2.map((mappedItemsOrigin) => {
        const imageAssetComponentId = (navigationIconDraftDocumentConfig as any)[mappedItemsOrigin],
          kl2 = runAuxOld(imageAssetElement, mappedItemsOrigin);
        return runVariantPeer({
          value: mappedItemsOrigin,
          label: imageAssetComponentId.label,
          detail: imageAssetComponentId.group + " · " + runVariantAux(mappedItemsOrigin, kl2),
        });
      }),
    ),
    runVariantLower(pe3, "底图框"),
    (navigationStyleApplyMessageElement.hidden = true),
    (navigationStyleApplyMessageElement.textContent = ""),
    (editorCtx.appliedStyleRecord = {
      sourceId: imageAssetElement.id,
      type: "panel-frame",
    }),
    navigationStyleApplyDialogElement.showModal());
}
function runVariantSecond() {
  const createdInstanceKey = removedComponent();
  if (!createdInstanceKey || createdInstanceKey.type !== "camera") return;
  const tC2 = runAuxLower(createdInstanceKey),
    pe4 = findReplaceableComponents(createdInstanceKey);
  !tC2.length ||
    !pe4.length ||
    ((navigationStyleApplyTitleElement.textContent = "应用摄像头实时预览设置"),
    (navigationStyleApplyTargetHeadingElement.textContent = "应用到摄像头实时预览"),
    (navigationStyleApplyTargetScopeElement.textContent = "按区域与页面区分"),
    (navigationStyleApplySummaryElement.textContent =
      "将“" +
      componentLabel2(createdInstanceKey) +
      "”中选定的修改应用到选中的摄像头实时预览。实体、备注、动作和控件位置不会改变。"),
    navigationStyleApplyPropertiesElement.replaceChildren(
      ...tC2.map((mappedItemsDraft) => {
        const imageAssetId = (navigationIconOptionStateState as any)[mappedItemsDraft],
          pl2 = runAuxInner(createdInstanceKey, mappedItemsDraft);
        return runVariantPeer({
          value: mappedItemsDraft,
          label: imageAssetId.label,
          detail: imageAssetId.group + " · " + runAuxRight(mappedItemsDraft, pl2),
        });
      }),
    ),
    runVariantLower(pe4, "摄像头实时预览"),
    (navigationStyleApplyMessageElement.hidden = true),
    (navigationStyleApplyMessageElement.textContent = ""),
    (editorCtx.appliedStyleRecord = {
      sourceId: createdInstanceKey.id,
      type: "camera",
    }),
    navigationStyleApplyDialogElement.showModal());
}
function runVariantLast() {
  const createdInstancePath = removedComponent();
  if (!createdInstancePath || createdInstancePath.type !== "title-button") return;
  const wC2 = runAltOuter(createdInstancePath),
    pe5 = findReplaceableComponents(createdInstancePath);
  !wC2.length ||
    !pe5.length ||
    ((navigationStyleApplyTitleElement.textContent = "应用标题按钮设置"),
    (navigationStyleApplyTargetHeadingElement.textContent = "应用到标题按钮"),
    (navigationStyleApplyTargetScopeElement.textContent = "按区域与页面区分"),
    (navigationStyleApplySummaryElement.textContent =
      "将“" +
      componentLabel2(createdInstancePath) +
      "”中选定的修改应用到选中的标题按钮。文字内容、图标名称、备注、动作和控件中心位置不会改变。"),
    navigationStyleApplyPropertiesElement.replaceChildren(
      ...wC2.map((imageAssetDraftDocument) => {
        const imageAssetComponent = (navigationPreviewClickComponentIdState as any)[imageAssetDraftDocument],
          ll2 = runAltPeer(createdInstancePath, imageAssetDraftDocument);
        return runVariantPeer({
          value: imageAssetDraftDocument,
          label: imageAssetComponent.label,
          detail:
            imageAssetComponent.group +
            " · " +
            onNavigationStyleApplyCancelButtonClick(imageAssetDraftDocument, ll2),
        });
      }),
    ),
    runVariantLower(pe5, "标题按钮"),
    (navigationStyleApplyMessageElement.hidden = true),
    (navigationStyleApplyMessageElement.textContent = ""),
    (editorCtx.appliedStyleRecord = {
      sourceId: createdInstancePath.id,
      type: "title-button",
    }),
    navigationStyleApplyDialogElement.showModal());
}
function runVariantOld() {
  const imageAssetRecord = removedComponent();
  if (!imageAssetRecord || imageAssetRecord.type !== "icon-button-effect") return;
  const nC2 = runAuxAlt(imageAssetRecord),
    pe6 = findReplaceableComponents(imageAssetRecord);
  !nC2.length ||
    !pe6.length ||
    ((navigationStyleApplyTitleElement.textContent = "应用图标按钮（效果）设置"),
    (navigationStyleApplyTargetHeadingElement.textContent = "应用到同类型控件"),
    (navigationStyleApplyTargetScopeElement.textContent = "按区域与页面区分"),
    (navigationStyleApplySummaryElement.textContent =
      "将“" +
      componentLabel2(imageAssetRecord) +
      "”中选定的修改应用到选中的图标按钮（效果）。实体、备注、动作和按钮位置不会改变。"),
    navigationStyleApplyPropertiesElement.replaceChildren(
      ...nC2.map((mappedItemsSnapshot) => {
        const imageAssetSize = (styleSourceComponentIdState as any)[mappedItemsSnapshot],
          tl2 = runAltNew(imageAssetRecord, mappedItemsSnapshot);
        return runVariantPeer({
          value: mappedItemsSnapshot,
          label: imageAssetSize.label,
          detail: imageAssetSize.group + " · " + runAuxVariant(mappedItemsSnapshot, tl2),
        });
      }),
    ),
    runVariantLower(pe6, "图标按钮（效果）"),
    (navigationStyleApplyMessageElement.hidden = true),
    (navigationStyleApplyMessageElement.textContent = ""),
    (editorCtx.appliedStyleRecord = {
      sourceId: imageAssetRecord.id,
      type: "icon-button-effect",
    }),
    navigationStyleApplyDialogElement.showModal());
}
function runVariantNew() {
  const createdInstanceText = removedComponent();
  if (!createdInstanceText || createdInstanceText.type !== "air-conditioner") return;
  const sC2 = runAltLeft(createdInstanceText),
    pe7 = findReplaceableComponents(createdInstanceText);
  !sC2.length ||
    !pe7.length ||
    ((navigationStyleApplyTitleElement.textContent = "应用空调设置"),
    (navigationStyleApplyTargetHeadingElement.textContent = "应用到同类型控件"),
    (navigationStyleApplyTargetScopeElement.textContent = "按区域与页面区分"),
    (navigationStyleApplySummaryElement.textContent =
      "将“" +
      componentLabel2(createdInstanceText) +
      "”中选定的修改应用到选中的空调控件。实体、备注、文字内容、动作和按钮位置不会改变。"),
    navigationStyleApplyPropertiesElement.replaceChildren(
      ...sC2.map((imageAssetSizeDraftDocument) => {
        const imageAssetSizeComponent =
            (onNavigationStyleApplyConfirmButtonClickValue as any)[imageAssetSizeDraftDocument],
          il3 = onNavigationStyleApplyConfirmButtonClick(
            createdInstanceText,
            imageAssetSizeDraftDocument,
          );
        return runVariantPeer({
          value: imageAssetSizeDraftDocument,
          label: imageAssetSizeComponent.label,
          detail:
            imageAssetSizeComponent.group + " · " + runAltFirst(imageAssetSizeDraftDocument, il3),
        });
      }),
    ),
    runVariantLower(pe7, "空调"),
    (navigationStyleApplyMessageElement.hidden = true),
    (navigationStyleApplyMessageElement.textContent = ""),
    (editorCtx.appliedStyleRecord = {
      sourceId: createdInstanceText.id,
      type: "air-conditioner",
    }),
    navigationStyleApplyDialogElement.showModal());
}
function runCopyExtra() {
  const createdInstanceCount = removedComponent();
  if (
    !createdInstanceCount ||
    !["icon-button", "device-button", "presence-sensor"].includes(createdInstanceCount.type)
  )
    return;
  const fI2 =
      createdInstanceCount.type === "presence-sensor"
        ? runAuxTwin(createdInstanceCount)
        : createdInstanceCount.type === "device-button"
          ? "设备按钮"
          : "图标按钮",
    eC2 = appliedStylePropertyKey(createdInstanceCount),
    pe8 = findReplaceableComponents(createdInstanceCount);
  !eC2.length ||
    !pe8.length ||
    ((navigationStyleApplyTitleElement.textContent = "应用" + fI2 + "设置"),
    (navigationStyleApplyTargetHeadingElement.textContent = "应用到同类型控件"),
    (navigationStyleApplyTargetScopeElement.textContent = "按区域与页面区分"),
    (navigationStyleApplySummaryElement.textContent =
      "将“" +
      componentLabel2(createdInstanceCount) +
      "”中选定的修改应用到选中的" +
      fI2 +
      "。实体、备注、图标名称、文字内容和位置不会改变。"),
    navigationStyleApplyPropertiesElement.replaceChildren(
      ...eC2.map((mappedItemsSample) => {
        const zI2 = onNavigationIconCopyButtonClick(createdInstanceCount, mappedItemsSample),
          al2 = styleTargetCheckbox(createdInstanceCount, mappedItemsSample);
        return runVariantPeer({
          value: mappedItemsSample,
          label: zI2.label,
          detail: zI2.group + " · " + navigationIconCopyError(mappedItemsSample, al2),
        });
      }),
    ),
    runVariantLower(pe8, fI2),
    (navigationStyleApplyMessageElement.hidden = true),
    (navigationStyleApplyMessageElement.textContent = ""),
    (editorCtx.appliedStyleRecord = {
      sourceId: createdInstanceCount.id,
      type: createdInstanceCount.type,
    }),
    navigationStyleApplyDialogElement.showModal());
}
function imageAssetMeasureError() {
  const createdInstanceIndex = removedComponent();
  if (!createdInstanceIndex || createdInstanceIndex.type !== "line-chart") return;
  const yC2 = runAltBackup(createdInstanceIndex),
    pe9 = findReplaceableComponents(createdInstanceIndex);
  !yC2.length ||
    !pe9.length ||
    ((navigationStyleApplyTitleElement.textContent = "应用折线图设置"),
    (navigationStyleApplyTargetHeadingElement.textContent = "应用到折线图"),
    (navigationStyleApplyTargetScopeElement.textContent = "按区域与页面区分"),
    (navigationStyleApplySummaryElement.textContent =
      "将“" +
      componentLabel2(createdInstanceIndex) +
      "”中选定的修改应用到选中的折线图。数值实体、备注、动作和位置不会改变。"),
    navigationStyleApplyPropertiesElement.replaceChildren(
      ...yC2.map((onIconButtonEffectAssetButtonClick) => {
        const isEffectAssetMenuHidden =
            (navigationVisibilityComponentValue as any)[onIconButtonEffectAssetButtonClick],
          el2 = runAltCopy(createdInstanceIndex, onIconButtonEffectAssetButtonClick);
        return runVariantPeer({
          value: onIconButtonEffectAssetButtonClick,
          label: isEffectAssetMenuHidden.label,
          detail:
            isEffectAssetMenuHidden.group +
            " · " +
            runAltTwin(onIconButtonEffectAssetButtonClick, el2),
        });
      }),
    ),
    runVariantLower(
      pe9,
      (effectAssetCatalogError: any) =>
        effectAssetCatalogError.bindings?.entity?.entityId || "未设置数值实体",
    ),
    (navigationStyleApplyMessageElement.hidden = true),
    (navigationStyleApplyMessageElement.textContent = ""),
    (editorCtx.appliedStyleRecord = {
      sourceId: createdInstanceIndex.id,
      type: "line-chart",
    }),
    navigationStyleApplyDialogElement.showModal());
}
function onIconButtonEffectAssetFolderSelectChange(
  onIconButtonEffectAssetSearchInputInput: any,
  onIconButtonEffectAssetOptionsPointerover: any,
  effectAssetPointerOverEvent: any,
) {
  const effectAssetHoverElement = clone2(
    entryStateRecord(onIconButtonEffectAssetSearchInputInput, effectAssetPointerOverEvent),
  );
  if (effectAssetPointerOverEvent === "width") {
    const measuredBoundsStep =
      Number(onIconButtonEffectAssetOptionsPointerover.position?.x || 0) +
      Number(onIconButtonEffectAssetOptionsPointerover.position?.width || 100) / 2;
    onIconButtonEffectAssetOptionsPointerover.position = {
      ...(onIconButtonEffectAssetOptionsPointerover.position || {}),
      x: measuredBoundsStep - Number(effectAssetHoverElement) / 2,
      width: Number(effectAssetHoverElement),
    };
    return;
  }
  if (effectAssetPointerOverEvent === "height") {
    const measuredBoundsPhase =
      Number(onIconButtonEffectAssetOptionsPointerover.position?.y || 0) +
      Number(onIconButtonEffectAssetOptionsPointerover.position?.height || 100) / 2;
    onIconButtonEffectAssetOptionsPointerover.position = {
      ...(onIconButtonEffectAssetOptionsPointerover.position || {}),
      y: measuredBoundsPhase - Number(effectAssetHoverElement) / 2,
      height: Number(effectAssetHoverElement),
    };
    return;
  }
  if (effectAssetPointerOverEvent === "scale") {
    onIconButtonEffectAssetOptionsPointerover.style = {
      ...(onIconButtonEffectAssetOptionsPointerover.style || {}),
      scale: Number(effectAssetHoverElement),
    };
    return;
  }
  if (effectAssetPointerOverEvent === "rotation") {
    onIconButtonEffectAssetOptionsPointerover.position = {
      ...(onIconButtonEffectAssetOptionsPointerover.position || {}),
      rotation: Number(effectAssetHoverElement),
    };
    return;
  }
  onIconButtonEffectAssetOptionsPointerover.properties = {
    ...(onIconButtonEffectAssetOptionsPointerover.properties || {}),
    [effectAssetPointerOverEvent]: effectAssetHoverElement,
  };
}
function runCopyAlt(runCopyAux: any, onIconButtonEffectAssetOptionsClick: any, effectAssetClickEvent: any) {
  const effectAssetElement = clone2(runAuxOld(runCopyAux, effectAssetClickEvent));
  if (effectAssetClickEvent === "width") {
    const effectAssetId =
      Number(onIconButtonEffectAssetOptionsClick.position?.x || 0) +
      Number(onIconButtonEffectAssetOptionsClick.position?.width || 100) / 2;
    onIconButtonEffectAssetOptionsClick.position = {
      ...(onIconButtonEffectAssetOptionsClick.position || {}),
      x: effectAssetId - Number(effectAssetElement) / 2,
      width: Number(effectAssetElement),
    };
    return;
  }
  if (effectAssetClickEvent === "height") {
    const effectAssetRecord =
      Number(onIconButtonEffectAssetOptionsClick.position?.y || 0) +
      Number(onIconButtonEffectAssetOptionsClick.position?.height || 100) / 2;
    onIconButtonEffectAssetOptionsClick.position = {
      ...(onIconButtonEffectAssetOptionsClick.position || {}),
      y: effectAssetRecord - Number(effectAssetElement) / 2,
      height: Number(effectAssetElement),
    };
    return;
  }
  if (effectAssetClickEvent === "scale") {
    onIconButtonEffectAssetOptionsClick.style = {
      ...(onIconButtonEffectAssetOptionsClick.style || {}),
      scale: Number(effectAssetElement),
    };
    return;
  }
  if (effectAssetClickEvent === "rotation") {
    onIconButtonEffectAssetOptionsClick.position = {
      ...(onIconButtonEffectAssetOptionsClick.position || {}),
      rotation: Number(effectAssetElement),
    };
    return;
  }
  onIconButtonEffectAssetOptionsClick.properties = {
    ...(onIconButtonEffectAssetOptionsClick.properties || {}),
    [effectAssetClickEvent]: effectAssetElement,
  };
}
function runCopyVariant(runCopyCopy: any, effectAssetMeasureError: any, effectAssetDraftDocument: any) {
  const deleteUserAssetElementValue = clone2(runAuxInner(runCopyCopy, effectAssetDraftDocument));
  if (effectAssetDraftDocument === "width") {
    const measuredBoundsView =
      Number(effectAssetMeasureError.position?.x || 0) +
      Number(effectAssetMeasureError.position?.width || 100) / 2;
    effectAssetMeasureError.position = {
      ...(effectAssetMeasureError.position || {}),
      x: measuredBoundsView - Number(deleteUserAssetElementValue) / 2,
      width: Number(deleteUserAssetElementValue),
    };
    return;
  }
  if (effectAssetDraftDocument === "height") {
    const effectAssetComponent =
      Number(effectAssetMeasureError.position?.y || 0) +
      Number(effectAssetMeasureError.position?.height || 100) / 2;
    effectAssetMeasureError.position = {
      ...(effectAssetMeasureError.position || {}),
      y: effectAssetComponent - Number(deleteUserAssetElementValue) / 2,
      height: Number(deleteUserAssetElementValue),
    };
    return;
  }
  if (effectAssetDraftDocument === "scale") {
    effectAssetMeasureError.style = {
      ...(effectAssetMeasureError.style || {}),
      scale: Number(deleteUserAssetElementValue),
    };
    return;
  }
  if (effectAssetDraftDocument === "rotation") {
    effectAssetMeasureError.position = {
      ...(effectAssetMeasureError.position || {}),
      rotation: Number(deleteUserAssetElementValue),
    };
    return;
  }
  effectAssetMeasureError.properties = {
    ...(effectAssetMeasureError.properties || {}),
    [effectAssetDraftDocument]: deleteUserAssetElementValue,
  };
}
function runCopyAlias(onUndoButtonClick: any, onRedoButtonClick: any, onRecoveryRestoreButtonClick: any) {
  const recoveredSnapshotState = clone2(
    runAltCopy(onUndoButtonClick, onRecoveryRestoreButtonClick),
  );
  if (onRecoveryRestoreButtonClick === "width") {
    const recoveredSnapshot =
      Number(onRedoButtonClick.position?.x || 0) +
      Number(onRedoButtonClick.position?.width || 100) / 2;
    onRedoButtonClick.position = {
      ...(onRedoButtonClick.position || {}),
      x: recoveredSnapshot - Number(recoveredSnapshotState) / 2,
      width: Number(recoveredSnapshotState),
    };
    return;
  }
  if (onRecoveryRestoreButtonClick === "height") {
    const recoveredComponentIds =
      Number(onRedoButtonClick.position?.y || 0) +
      Number(onRedoButtonClick.position?.height || 100) / 2;
    onRedoButtonClick.position = {
      ...(onRedoButtonClick.position || {}),
      y: recoveredComponentIds - Number(recoveredSnapshotState) / 2,
      height: Number(recoveredSnapshotState),
    };
    return;
  }
  if (onRecoveryRestoreButtonClick === "scale") {
    onRedoButtonClick.style = {
      ...(onRedoButtonClick.style || {}),
      scale: Number(recoveredSnapshotState),
    };
    return;
  }
  if (onRecoveryRestoreButtonClick === "rotation") {
    onRedoButtonClick.position = {
      ...(onRedoButtonClick.position || {}),
      rotation: Number(recoveredSnapshotState),
    };
    return;
  }
  onRedoButtonClick.properties = {
    ...(onRedoButtonClick.properties || {}),
    [onRecoveryRestoreButtonClick]: recoveredSnapshotState,
  };
}
function recoveredComponentId(
  onRecoveryDiscardButtonClick: any,
  onRecoveryDialogCancel: any,
  recoveryCancelEvent: any,
) {
  const deleteAssetRequestIdState = clone2(
    runAltNew(onRecoveryDiscardButtonClick, recoveryCancelEvent),
  );
  if (recoveryCancelEvent === "width") {
    const measuredBoundsStore =
      Number(onRecoveryDialogCancel.position?.x || 0) +
      Number(onRecoveryDialogCancel.position?.width || 100) / 2;
    onRecoveryDialogCancel.position = {
      ...(onRecoveryDialogCancel.position || {}),
      x: measuredBoundsStore - Number(deleteAssetRequestIdState) / 2,
      width: Number(deleteAssetRequestIdState),
    };
    return;
  }
  if (recoveryCancelEvent === "height") {
    const measuredBoundsCache =
      Number(onRecoveryDialogCancel.position?.y || 0) +
      Number(onRecoveryDialogCancel.position?.height || 100) / 2;
    onRecoveryDialogCancel.position = {
      ...(onRecoveryDialogCancel.position || {}),
      y: measuredBoundsCache - Number(deleteAssetRequestIdState) / 2,
      height: Number(deleteAssetRequestIdState),
    };
    return;
  }
  if (recoveryCancelEvent === "scale") {
    onRecoveryDialogCancel.style = {
      ...(onRecoveryDialogCancel.style || {}),
      scale: Number(deleteAssetRequestIdState),
    };
    return;
  }
  if (recoveryCancelEvent === "rotation") {
    onRecoveryDialogCancel.position = {
      ...(onRecoveryDialogCancel.position || {}),
      rotation: Number(deleteAssetRequestIdState),
    };
    return;
  }
  onRecoveryDialogCancel.properties = {
    ...(onRecoveryDialogCancel.properties || {}),
    [recoveryCancelEvent]: deleteAssetRequestIdState,
  };
}
function onErrorDialogCloseButtonClick(
  onErrorDialogConfirmButtonClick: any,
  onErrorDialogClick: any,
  errorDialogClickEvent: any,
) {
  const errorDialogClickEventState = clone2(
    runAltPeer(onErrorDialogConfirmButtonClick, errorDialogClickEvent),
  );
  if (errorDialogClickEvent === "width") {
    const measuredBoundsQueue =
      Number(onErrorDialogClick.position?.x || 0) +
      Number(onErrorDialogClick.position?.width || 100) / 2;
    onErrorDialogClick.position = {
      ...(onErrorDialogClick.position || {}),
      x: measuredBoundsQueue - Number(errorDialogClickEventState) / 2,
      width: Number(errorDialogClickEventState),
    };
    return;
  }
  if (errorDialogClickEvent === "height") {
    const measuredBoundsBuffer =
      Number(onErrorDialogClick.position?.y || 0) +
      Number(onErrorDialogClick.position?.height || 100) / 2;
    onErrorDialogClick.position = {
      ...(onErrorDialogClick.position || {}),
      y: measuredBoundsBuffer - Number(errorDialogClickEventState) / 2,
      height: Number(errorDialogClickEventState),
    };
    return;
  }
  if (errorDialogClickEvent === "scale") {
    onErrorDialogClick.style = {
      ...(onErrorDialogClick.style || {}),
      scale: Number(errorDialogClickEventState),
    };
    return;
  }
  if (errorDialogClickEvent === "rotation") {
    onErrorDialogClick.position = {
      ...(onErrorDialogClick.position || {}),
      rotation: Number(errorDialogClickEventState),
    };
    return;
  }
  onErrorDialogClick.properties = {
    ...(onErrorDialogClick.properties || {}),
    [errorDialogClickEvent]: errorDialogClickEventState,
  };
}
function onShowSharedComponentsButtonClick(
  onShowPageComponentsButtonClick: any,
  onAddComponentButtonClick: any,
  onComponentTemplateCloseButtonClick: any,
) {
  const onComponentTemplateCloseButtonClickState = clone2(
    styleTargetCheckbox(onShowPageComponentsButtonClick, onComponentTemplateCloseButtonClick),
  );
  if (onComponentTemplateCloseButtonClick === "width") {
    const measuredBoundsCursor =
      Number(onAddComponentButtonClick.position?.x || 0) +
      Number(onAddComponentButtonClick.position?.width || 100) / 2;
    onAddComponentButtonClick.position = {
      ...(onAddComponentButtonClick.position || {}),
      x: measuredBoundsCursor - Number(onComponentTemplateCloseButtonClickState) / 2,
      width: Number(onComponentTemplateCloseButtonClickState),
    };
    return;
  }
  if (onComponentTemplateCloseButtonClick === "height") {
    const measuredBoundsPointer =
      Number(onAddComponentButtonClick.position?.y || 0) +
      Number(onAddComponentButtonClick.position?.height || 100) / 2;
    onAddComponentButtonClick.position = {
      ...(onAddComponentButtonClick.position || {}),
      y: measuredBoundsPointer - Number(onComponentTemplateCloseButtonClickState) / 2,
      height: Number(onComponentTemplateCloseButtonClickState),
    };
    return;
  }
  if (onComponentTemplateCloseButtonClick === "scale") {
    onAddComponentButtonClick.style = {
      ...(onAddComponentButtonClick.style || {}),
      scale: Number(onComponentTemplateCloseButtonClickState),
    };
    return;
  }
  if (onComponentTemplateCloseButtonClick === "rotation") {
    onAddComponentButtonClick.position = {
      ...(onAddComponentButtonClick.position || {}),
      rotation: Number(onComponentTemplateCloseButtonClickState),
    };
    return;
  }
  onAddComponentButtonClick.properties = {
    ...(onAddComponentButtonClick.properties || {}),
    [onComponentTemplateCloseButtonClick]: onComponentTemplateCloseButtonClickState,
  };
}
function onComponentTemplateDialogClick(
  templateDialogClickEvent: any,
  onComponentTemplateListClick: any,
  templateListClickEvent: any,
) {
  const templateItemElement = clone2(
    onNavigationStyleApplyConfirmButtonClick(templateDialogClickEvent, templateListClickEvent),
  );
  if (templateListClickEvent === "width") {
    const measuredBoundsTarget =
      Number(onComponentTemplateListClick.position?.x || 0) +
      Number(onComponentTemplateListClick.position?.width || 100) / 2;
    onComponentTemplateListClick.position = {
      ...(onComponentTemplateListClick.position || {}),
      x: measuredBoundsTarget - Number(templateItemElement) / 2,
      width: Number(templateItemElement),
    };
    return;
  }
  if (templateListClickEvent === "height") {
    const measuredBoundsSource =
      Number(onComponentTemplateListClick.position?.y || 0) +
      Number(onComponentTemplateListClick.position?.height || 100) / 2;
    onComponentTemplateListClick.position = {
      ...(onComponentTemplateListClick.position || {}),
      y: measuredBoundsSource - Number(templateItemElement) / 2,
      height: Number(templateItemElement),
    };
    return;
  }
  if (templateListClickEvent === "scale") {
    onComponentTemplateListClick.style = {
      ...(onComponentTemplateListClick.style || {}),
      scale: Number(templateItemElement),
    };
    return;
  }
  if (templateListClickEvent === "rotation") {
    onComponentTemplateListClick.position = {
      ...(onComponentTemplateListClick.position || {}),
      rotation: Number(templateItemElement),
    };
    return;
  }
  onComponentTemplateListClick.properties = {
    ...(onComponentTemplateListClick.properties || {}),
    [templateListClickEvent]: templateItemElement,
  };
}
(navigationApplyStyleElement.addEventListener("click", runVariantFirst),
  panelFrameApplyStyleButtonElement.addEventListener("click", imageAssetClickEvent),
  cameraApplyStyleElement.addEventListener("click", runVariantSecond),
  titleButtonApplyStyleElement.addEventListener("click", runVariantLast),
  lineChartApplyStyleButtonElement.addEventListener("click", imageAssetMeasureError),
  ibeApplyStyleElement.addEventListener("click", runVariantOld),
  iconButtonApplyStyleElement.addEventListener("click", runCopyExtra),
  airConditionerApplyStyleElement.addEventListener("click", runVariantNew),
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
                runAuxBackup(currentComponentScope) !== runAuxBackup(templatePagePath)
              )
            ) {
              for (const imageAssetPointerOverEventState of mappedItemsMode)
                isImageAssetMenuHiddenState === "flow-line"
                  ? applyFlowLineStyle2(templatePagePath, currentComponentScope, [
                      imageAssetPointerOverEventState,
                    ])
                  : isImageAssetMenuHiddenState === "panel-frame"
                    ? runCopyAlt(
                        templatePagePath,
                        currentComponentScope,
                        imageAssetPointerOverEventState,
                      )
                    : isImageAssetMenuHiddenState === "camera"
                      ? runCopyVariant(
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
                          ? runCopyAlias(
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
    (runShadow(hidden5 ? "navigation-icon" : null),
      (navigationIconMenuElement.hidden = !hidden5),
      navigationIconButtonElement.setAttribute("aria-expanded", String(hidden5)),
      hidden5 &&
        iconTooltipElementCount(navigationIconSearchElement.value)
          .then(() => {
            (runNext(),
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
    (runShadow(),
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
    (runShadow(hidden6 ? "ibe-icon" : null),
      (ibeIconMenuElement.hidden = !hidden6),
      ibeIconButtonElement.setAttribute("aria-expanded", String(hidden6)),
      hidden6 &&
        iconTooltipElementFlag(ibeIconSearchElement.value)
          .then(() => {
            (runOld(),
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
    (runShadow(),
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
    (runShadow(hidden7 ? "icon-button-icon" : null),
      (iconButtonIconMenuElement.hidden = !hidden7),
      iconButtonIconButtonElement.setAttribute("aria-expanded", String(hidden7)),
      hidden7 &&
        iconTooltipElementStep(iconButtonIconSearchElement.value)
          .then(() => {
            (runNew(),
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
    (runShadow(),
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
    (runShadow(hidden8 ? "title-button-icon" : null),
      hidden8 &&
        titleButtonIconMenuElement.parentElement !== document.body &&
        document.body.append(titleButtonIconMenuElement),
      (titleButtonIconMenuElement.hidden = !hidden8),
      (titleButtonIconMenuElement.style.position = "fixed"),
      (titleButtonIconMenuElement.style.zIndex = "760"),
      titleButtonIconButtonElement.setAttribute("aria-expanded", String(hidden8)),
      hidden8 &&
        (runShort(),
        iconTooltipElementStore(titleButtonIconSearchElement.value)
          .then(() => {
            (runShort(),
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
    (runShadow(),
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
      (runShadow(hidden9 ? "light-statistics-icon" : null),
        hidden9 &&
          lightStatisticsIconMenuElement.parentElement !== document.body &&
          document.body.append(lightStatisticsIconMenuElement),
        (lightStatisticsIconMenuElement.hidden = !hidden9),
        (lightStatisticsIconMenuElement.style.position = "fixed"),
        (lightStatisticsIconMenuElement.style.zIndex = "760"),
        lightStatisticsIconButtonElement.setAttribute("aria-expanded", String(hidden9)),
        hidden9 &&
          (runLong(),
          iconTooltipElementBuffer(lightStatisticsIconSearchElement.value)
            .then(() => {
              (runLong(),
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
      (runShadow(),
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
      (runShadow(hidden10 ? "light-statistics-entity" : null),
        hidden10 &&
          lightStatisticsEntityMenuElement.parentElement !== document.body &&
          document.body.append(lightStatisticsEntityMenuElement),
        (lightStatisticsEntityMenuElement.hidden = !hidden10),
        (lightStatisticsEntityMenuElement.style.position = "fixed"),
        (lightStatisticsEntityMenuElement.style.zIndex = "760"),
        lightStatisticsEntityButtonElement.setAttribute("aria-expanded", String(hidden10)),
        hidden10 &&
          (runAmount(lightStatisticsEntitySearchElement.value),
          runExtraExtra(),
          window.requestAnimationFrame(() => {
            (runExtraExtra(),
              lightStatisticsEntitySearchElement.focus({
                preventScroll: true,
              }));
          })));
    },
  ),
  lightStatisticsEntitySearchElement.addEventListener("input", () =>
    runAmount(lightStatisticsEntitySearchElement.value),
  ),
  lightStatisticsEntityOptionsElement.addEventListener(
    "click",
    (effectAssetPointerOverEventState: any) => {
      const createdComponentElement = effectAssetPointerOverEventState.target.closest(
        "[data-light-statistics-entity-id]",
      );
      createdComponentElement &&
        (runPrimary(lightStatisticsEntityMenuElement, lightStatisticsEntityButtonElement),
        runLength(createdComponentElement.dataset.lightStatisticsEntityId));
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
        runLocation(Number(groupHeightElement.dataset.lightStatisticsRemoveIndex));
        return;
      }
      groupWidthElement &&
        ((editorCtx.statisticsEntityId = ""),
        (editorCtx.statisticsReplaceIndex = Number(groupWidthElement.dataset.lightStatisticsReplaceIndex)),
        (editorCtx.statisticsComponentId = editorCtx.selectedComponentId || ""),
        (lightStatisticsEntityPendingElement.hidden = true),
        runDelta("请选择新的实体。"),
        runBackup(lightStatisticsEntityButtonElement, "选择替换实体"),
        lightStatisticsEntityButtonElement.click());
    },
  ),
  imageEntityButtonElement.addEventListener("click", () => {
    const hidden11 = imageEntityMenuElement.hidden;
    (runShadow(hidden11 ? "entity" : null),
      (imageEntityMenuElement.hidden = !hidden11),
      imageEntityButtonElement.setAttribute("aria-expanded", String(hidden11)),
      hidden11 &&
        (runExtraVariant(imageEntitySearchElement.value),
        runExtraShadow(),
        window.requestAnimationFrame(() => {
          (runExtraShadow(),
            imageEntitySearchElement.focus({
              preventScroll: true,
            }));
        })));
  }),
  imageEntitySearchElement.addEventListener("input", () =>
    runExtraVariant(imageEntitySearchElement.value),
  ),
  imageEntityOptionsElement.addEventListener("click", (effectAssetClickEventState: any) => {
    const createdWidthElement = effectAssetClickEventState.target.closest("[data-entity-id]");
    if (!createdWidthElement || !editorCtx.selectedComponentId) return;
    const createdWidth = editorCtx.selectedComponentId,
      entityId = createdWidthElement.dataset.entityId;
    (runShadow(),
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
const popupBeingRenamedState = "推荐去 HA 复制实体 ID，粘贴搜索。可精准选择。";
const { deferUntilEntitiesLoaded: popupBeingRenamed }: any = createEditorPickerLifecycle2({
  getEntitiesLoaded: () => editorCtx.isAreEntitiesLoaded,
  getEntityLoadPromise: () => editorCtx.entitiesLoadPromise,
  loadEntities: ensureEntitiesLoaded,
  reportError: handleOperationError,
});
function runCopyFallback() {
  editorCtx.popupBeingRenamedValue?.close();
}
// ── P4 切片转发器（声明级切片：宿主侧薄转发器 + 依赖袋，都是函数声明 → 提升，位置无关）──
function runCopyBackupDeps() {
  return ({
    get runCopyFallback() {
      return runCopyFallback;
    },
    get runShadow() {
      return runShadow;
    },
    get imageAssetLargePreviewImageElement() {
      return imageAssetLargePreviewImageElement;
    },
    get popupBeingRenamedValue() {
      return editorCtx.popupBeingRenamedValue;
    },
    set popupBeingRenamedValue(v) {
      editorCtx.popupBeingRenamedValue = v;
    },
    get hideAssetLargePreview() {
      return hideAssetLargePreview;
    },
    get handleOperationError() {
      return handleOperationError;
    },
  });
}

function runCopyBackup({ kind: popupBeingRenamedConfig, title: popupBeingRenamedRef, subtitle: popupBeingRenamedEntry = "", searchPlaceholder: popupBeingRenamedRecord, triggerButton: popupBeingRenamedName, pageSize: recoveredComponentIdState, initialPage: onRecoveryDiscardButtonClickState = 1, selectedText: onRecoveryDialogCancelState = "", emptyText: recoveryCancelEventState, itemClass: onErrorDialogCloseButtonClickState = "", getPage: onErrorDialogConfirmButtonClickState, renderItem: onErrorDialogClickState, renderLeadingItems: errorDialogClickEventValue = null, renderTrailingItems: onShowSharedComponentsButtonClickState = null, buildToolbar: onShowPageComponentsButtonClickState = null, onSelect: onAddComponentButtonClickState, onDelete: onPopupNewButtonClick = null, onItemHover: onPopupNameCloseButtonClick = null, closeLegacyPickers: onPopupNameCancelButtonClick = true, renderSelectedActions: onPopupNameFormSubmit = null, renderSelectedContent: popupNameSubmitEvent = null, }: any) {
  return runCopyBackupCore(runCopyBackupDeps(), { kind: popupBeingRenamedConfig, title: popupBeingRenamedRef, subtitle: popupBeingRenamedEntry, searchPlaceholder: popupBeingRenamedRecord, triggerButton: popupBeingRenamedName, pageSize: recoveredComponentIdState, initialPage: onRecoveryDiscardButtonClickState, selectedText: onRecoveryDialogCancelState, emptyText: recoveryCancelEventState, itemClass: onErrorDialogCloseButtonClickState, getPage: onErrorDialogConfirmButtonClickState, renderItem: onErrorDialogClickState, renderLeadingItems: errorDialogClickEventValue, renderTrailingItems: onShowSharedComponentsButtonClickState, buildToolbar: onShowPageComponentsButtonClickState, onSelect: onAddComponentButtonClickState, onDelete: onPopupNewButtonClick, onItemHover: onPopupNameCloseButtonClick, closeLegacyPickers: onPopupNameCancelButtonClick, renderSelectedActions: onPopupNameFormSubmit, renderSelectedContent: popupNameSubmitEvent });
}

function titleButtonMenuDeps() {
  return ({
    get customSelectsBySelectElement() {
      return customSelectsBySelectElement;
    },
    get imageAssetFolderSelectElement() {
      return imageAssetFolderSelectElement;
    },
    get ibeAssetFolderElement() {
      return ibeAssetFolderElement;
    },
    get imageAssetFolder() {
      return editorCtx.imageAssetFolder;
    },
    get effectAssetFolder() {
      return editorCtx.effectAssetFolder;
    },
    get canDeleteAssetFolder() {
      return canDeleteAssetFolder;
    },
    get runState() {
      return runState;
    },
    get runConfig() {
      return runConfig;
    },
    get errorPhase() {
      return errorPhase;
    },
    get value() {
      return value;
    },
    get openCustomSelect() {
      return editorCtx.openCustomSelect;
    },
    set openCustomSelect(v) {
      editorCtx.openCustomSelect = v;
    },
    get runCopyLast() {
      return runCopyLast;
    },
    get runOuter() {
      return runOuter;
    },
    get effectVariantUrlState() {
      return effectVariantUrlState;
    },
    get requestJson() {
      return requestJson;
    },
    get ICON_PAGE_SIZE() {
      return ICON_PAGE_SIZE;
    },
    get createIconPickerClearOptionState() {
      return createIconPickerClearOptionState;
    },
  });
}

function loadNavigationIconOptions(loadTitleButtonIconOptionsElement: any) {
  return loadNavigationIconOptionsCore(titleButtonMenuDeps(), loadTitleButtonIconOptionsElement);
}
function positionTitleButtonIconMenu(registerOverflowPreviewRow: any) {
  return positionTitleButtonIconMenuCore(titleButtonMenuDeps(), registerOverflowPreviewRow);
}
function stopHoverScroll(syncEntityPickerValue: any) {
  return stopHoverScrollCore(titleButtonMenuDeps(), syncEntityPickerValue);
}
function iconTooltipElementValue({ optionsElement: iconTooltipElementCard, query: iconTooltipElementConfig = "", currentIcon: iconTooltipElementRef = "", clearLabel: iconTooltipElementEntry = "不使用图标", datasetKey: iconTooltipElementRecord = "iconName", append: iconTooltipElementName = false, }: any) {
  return iconTooltipElementValueCore(titleButtonMenuDeps(), { optionsElement: iconTooltipElementCard, query: iconTooltipElementConfig, currentIcon: iconTooltipElementRef, clearLabel: iconTooltipElementEntry, datasetKey: iconTooltipElementRecord, append: iconTooltipElementName });
}

function inspectorSyncDeps() {
  return ({
    get initActionPopupConfig() {
      return initActionPopupConfig;
    },
    get lightStatisticsActionNoteElement() {
      return lightStatisticsActionNoteElement;
    },
    get activeProject() {
      return editorCtx.activeProject;
    },
    get Option() {
      return Option;
    },
    get pageSelectElement() {
      return pageSelectElement;
    },
    get loadNavigationIconOptions() {
      return loadNavigationIconOptions;
    },
    get entities() {
      return editorCtx.entities;
    },
    get syncPopupEntityButton() {
      return syncPopupEntityButton;
    },
    get renderPopupEntityOptions() {
      return renderPopupEntityOptions;
    },
    get positionPopupEntityMenu() {
      return positionPopupEntityMenu;
    },
    get selectedComponentId() {
      return editorCtx.selectedComponentId;
    },
    get navigatorElement() {
      return navigatorElement;
    },
    get titleButtonLeftElement() {
      return titleButtonLeftElement;
    },
    get lightStatisticsLeftElement() {
      return lightStatisticsLeftElement;
    },
    get iconButtonLeftElement() {
      return iconButtonLeftElement;
    },
    get airConditionerLeftElement() {
      return airConditionerLeftElement;
    },
    get vacuumMapLeftElement() {
      return vacuumMapLeftElement;
    },
    get cameraLeftElement() {
      return cameraLeftElement;
    },
    get ibeLeftElement() {
      return ibeLeftElement;
    },
    get navigationLabelTextInputElement() {
      return navigationLabelTextInputElement;
    },
    get navigationLeftElement() {
      return navigationLeftElement;
    },
    get timeLeftElement() {
      return timeLeftElement;
    },
    get dateLeftElement() {
      return dateLeftElement;
    },
    get weatherLeftElement() {
      return weatherLeftElement;
    },
    get lineChartLeftInputElement() {
      return lineChartLeftInputElement;
    },
    get panelFrameLeftInputElement() {
      return panelFrameLeftInputElement;
    },
    get imageLeftInputElement() {
      return imageLeftInputElement;
    },
    get titleButtonTopElement() {
      return titleButtonTopElement;
    },
    get lightStatisticsTopElement() {
      return lightStatisticsTopElement;
    },
    get iconButtonTopElement() {
      return iconButtonTopElement;
    },
    get airConditionerTopElement() {
      return airConditionerTopElement;
    },
    get vacuumMapTopElement() {
      return vacuumMapTopElement;
    },
    get cameraTopElement() {
      return cameraTopElement;
    },
    get ibeTopElement() {
      return ibeTopElement;
    },
    get navigationTopElement() {
      return navigationTopElement;
    },
    get timeTopElement() {
      return timeTopElement;
    },
    get dateTopElement() {
      return dateTopElement;
    },
    get weatherTopElement() {
      return weatherTopElement;
    },
    get lineChartTopInputElement() {
      return lineChartTopInputElement;
    },
    get panelFrameTopInputElement() {
      return panelFrameTopInputElement;
    },
    get imageTopInputElement() {
      return imageTopInputElement;
    },
    get titleButtonScaleElement() {
      return titleButtonScaleElement;
    },
    get lightStatisticsScaleElement() {
      return lightStatisticsScaleElement;
    },
    get iconButtonScaleElement() {
      return iconButtonScaleElement;
    },
    get airConditionerScaleElement() {
      return airConditionerScaleElement;
    },
    get vacuumMapScaleElement() {
      return vacuumMapScaleElement;
    },
    get cameraScaleElement() {
      return cameraScaleElement;
    },
    get ibeScaleElement() {
      return ibeScaleElement;
    },
    get navigationScaleElement() {
      return navigationScaleElement;
    },
    get timeScaleElement() {
      return timeScaleElement;
    },
    get dateScaleElement() {
      return dateScaleElement;
    },
    get weatherScaleElement() {
      return weatherScaleElement;
    },
    get lineChartScaleInputElement() {
      return lineChartScaleInputElement;
    },
    get panelFrameScaleInputElement() {
      return panelFrameScaleInputElement;
    },
    get imageScaleInputElement() {
      return imageScaleInputElement;
    },
    get titleButtonRotationElement() {
      return titleButtonRotationElement;
    },
    get lightStatisticsRotationElement() {
      return lightStatisticsRotationElement;
    },
    get iconButtonRotationElement() {
      return iconButtonRotationElement;
    },
    get airConditionerRotationElement() {
      return airConditionerRotationElement;
    },
    get vacuumMapRotationElement() {
      return vacuumMapRotationElement;
    },
    get cameraRotationElement() {
      return cameraRotationElement;
    },
    get ibeRotationElement() {
      return ibeRotationElement;
    },
    get navigationRotationElement() {
      return navigationRotationElement;
    },
    get timeRotationElement() {
      return timeRotationElement;
    },
    get dateRotationElement() {
      return dateRotationElement;
    },
    get weatherRotationElement() {
      return weatherRotationElement;
    },
    get lineChartRotationInputElement() {
      return lineChartRotationInputElement;
    },
    get panelFrameRotationInputElement() {
      return panelFrameRotationInputElement;
    },
    get imageRotationInputElement() {
      return imageRotationInputElement;
    },
    get navigationWidthElement() {
      return navigationWidthElement;
    },
    get navigationHeightElement() {
      return navigationHeightElement;
    },
    get ibeWidthElement() {
      return ibeWidthElement;
    },
    get ibeHeightElement() {
      return ibeHeightElement;
    },
    get titleButtonWidthElement() {
      return titleButtonWidthElement;
    },
    get titleButtonHeightElement() {
      return titleButtonHeightElement;
    },
    get lightStatisticsWidthElement() {
      return lightStatisticsWidthElement;
    },
    get lightStatisticsHeightElement() {
      return lightStatisticsHeightElement;
    },
    get iconButtonWidthElement() {
      return iconButtonWidthElement;
    },
    get iconButtonHeightElement() {
      return iconButtonHeightElement;
    },
    get cameraWidthElement() {
      return cameraWidthElement;
    },
    get cameraHeightElement() {
      return cameraHeightElement;
    },
    get airConditionerWidthElement() {
      return airConditionerWidthElement;
    },
    get airConditionerHeightElement() {
      return airConditionerHeightElement;
    },
    get lineChartWidthInputElement() {
      return lineChartWidthInputElement;
    },
    get lineChartHeightInputElement() {
      return lineChartHeightInputElement;
    },
    get panelFrameWidthInputElement() {
      return panelFrameWidthInputElement;
    },
    get panelFrameHeightInputElement() {
      return panelFrameHeightInputElement;
    },
    get removedComponent() {
      return removedComponent;
    },
    get editorRenderer() {
      return editorCtx.editorRenderer;
    },
    get selectedComponentIdsFromDom() {
      return selectedComponentIdsFromDom;
    },
    get coverMotorButtonElement() {
      return coverMotorButtonElement;
    },
    get mutateDocument() {
      return mutateDocument;
    },
    get setComponentsRotation() {
      return setComponentsRotation;
    },
    get runExtraAlt() {
      return runExtraAlt;
    },
    get runShadow() {
      return runShadow;
    },
    get runExtraVariant() {
      return runExtraVariant;
    },
    get resolveAssetPreviewUrl() {
      return resolveAssetPreviewUrl;
    },
    get entitiesByEntityId() {
      return entitiesByEntityId;
    },
    get devicesByDeviceId() {
      return devicesByDeviceId;
    },
  });
}

function syncComponentActionControls(editedActionComponent: any, actionControlsRoot: any) {
  return syncComponentActionControlsCore(inspectorSyncDeps(), editedActionComponent, actionControlsRoot);
}
function applyTransformToInspector(syncedComponentId: any, transform: any) {
  return applyTransformToInspectorCore(inspectorSyncDeps(), syncedComponentId, transform);
}
function previewModeForIcon(resetPreviewForInput: any, resetInputElement: any, bindDeviceSection: any, onDeviceButtonStatePrecisionSelectChange: any,
) {
  return previewModeForIconCore(inspectorSyncDeps(), resetPreviewForInput, resetInputElement, bindDeviceSection, onDeviceButtonStatePrecisionSelectChange);
}
function sharedReferenceId(onShowEditorPreviewButtonClick: any, onShowDashboardPreviewButtonClick = [onShowEditorPreviewButtonClick],
) {
  return sharedReferenceIdCore(inspectorSyncDeps(), onShowEditorPreviewButtonClick, onShowDashboardPreviewButtonClick);
}

function nudgeDeps() {
  return ({
    get removalPageEntry() {
      return removalPageEntry;
    },
    get selectedComponentIdsSet() {
      return editorCtx.selectedComponentIdsSet;
    },
    get mutateDocument() {
      return mutateDocument;
    },
    get airConditionerLayerByComponentId() {
      return airConditionerLayerByComponentId;
    },
  });
}

function nudgeDeltaX(nudgeDeltaY: any, nudgedComponentIds: any) {
  return nudgeDeltaXCore(nudgeDeps(), nudgeDeltaY, nudgedComponentIds);
}

function runCopyTwin(popupListItemElementPanel: any, runCopyBranch: any, runCopyPeer: any) {
  const popupMenuRectElement = document.createElement("button");
  ((popupMenuRectElement.type = "button"),
    (popupMenuRectElement.dataset[runCopyBranch] = runCopyPeer),
    popupListItemElementPanel.replaceChildren(popupMenuRectElement),
    popupMenuRectElement.click(),
    popupListItemElementPanel.replaceChildren());
}
function onPopupListContextmenu(popupListMenuEvent: any) {
  const popupItemElement = removedComponent(),
    popupMenuRect = [
      {
        button: navigationIconButtonElement,
        title: popupItemElement?.type === "scene-mode" ? "选择情景图标" : "选择导航图标",
        options: navigationIconOptionsElement,
        datasetKey: "iconName",
        current: popupItemElement?.properties?.icon || "",
        clear: "不使用图标",
      },
      {
        button: ibeIconButtonElement,
        title: "选择效果按钮图标",
        options: ibeIconOptionsElement,
        datasetKey: "iconName",
        current: popupItemElement?.properties?.icon || "",
        clear: "不使用图标",
      },
      {
        button: iconButtonIconButtonElement,
        title: "选择按钮图标",
        options: iconButtonIconOptionsElement,
        datasetKey: "iconName",
        current: popupItemElement?.properties?.icon || "",
        clear: popupItemElement?.type === "device-button" ? "跟随实体图标" : "不使用图标",
      },
      {
        button: titleButtonIconButtonElement,
        title: "选择标题图标",
        options: titleButtonIconOptionsElement,
        datasetKey: "iconName",
        current: popupItemElement?.properties?.icon || "",
        clear: "不使用图标",
      },
      {
        button: lightStatisticsIconButtonElement,
        title: "选择统计图标",
        options: lightStatisticsIconOptionsElement,
        datasetKey: "lightStatisticsIconName",
        current: String(
          Object.hasOwn(popupItemElement?.properties || {}, "icon")
            ? popupItemElement?.properties?.icon || ""
            : "mdi:lightbulb-group-outline",
        ),
        clear: "不使用图标",
      },
    ].find((onPopupActionsButtonClick) => onPopupActionsButtonClick.button === popupListMenuEvent);
  if (!popupMenuRect) return false;
  runCopyBackup({
    kind: "icon",
    title: popupMenuRect.title,
    searchPlaceholder: "搜索图标名称",
    triggerButton: popupListMenuEvent,
    pageSize: EDITOR_PICKER_PAGE_SIZES2.icon,
    selectedText: "",
    emptyText: "没有匹配的图标",
    itemClass: "icon-grid",
    async getPage({
      query: isPopupActionsMenuHidden,
      page: onPopupActionsMenuClick,
      pageSize: popupActionsClickEvent,
    }: any) {
      const popupActionName = (onPopupActionsMenuClick - 1) * popupActionsClickEvent,
        popupActionTargetId = await requestJson(
          "/icons?query=" +
            encodeURIComponent(isPopupActionsMenuHidden) +
            "&limit=" +
            popupActionsClickEvent +
            "&offset=" +
            popupActionName,
        );
      return {
        items: popupActionTargetId.items || [],
        total: Number(popupActionTargetId.total) || 0,
      };
    },
    renderLeadingItems: () => [],
    renderSelectedActions: () => [
      Object.assign(document.createElement("span"), {
        className: "editor-paged-picker-current-label",
        textContent: "当前选择",
      }),
      createIconPickerClearOption(popupMenuRect.current, popupMenuRect.clear),
      createEditorEntityPickerOption(popupMenuRect.clear, !popupMenuRect.current),
    ],
    renderItem(popupActionTargetIdState: any) {
      const qp2 = createIconPickerClearOptionState(
        popupActionTargetIdState,
        popupMenuRect.current,
        "editorPickerValue",
      );
      return ((qp2.dataset.editorPickerValue = popupActionTargetIdState.name), qp2);
    },
    onSelect: (popupActionTargetIdValue: any) =>
      runCopyTwin(popupMenuRect.options, popupMenuRect.datasetKey, popupActionTargetIdValue),
  });
  return true;
}
function runCopyLocal(runCopyInner: any) {
  const duplicatedPopupId = removedComponent(),
    duplicatedPopupIdState = ["icon-button", "device-button", "presence-sensor"],
    duplicatedPopupIdValue =
      runCopyInner === imageEntityButtonElement
        ? "image"
        : runCopyInner === navigationEntityButtonElement && duplicatedPopupId?.type === "scene-mode"
          ? "scene-mode"
          : runCopyInner === iconButtonEntityButtonElement &&
              duplicatedPopupIdState.includes(duplicatedPopupId?.type)
            ? duplicatedPopupId.type
            : [
                "weather",
                "line-chart",
                "title-button",
                "light-statistics",
                "icon-button-effect",
                "vacuum-map",
                "camera",
                "air-conditioner",
                "navigation-button",
              ].find(
                (templatePageMatchValue) =>
                  runExtraAlt(templatePageMatchValue).button === runCopyInner,
              );
  if (!duplicatedPopupIdValue) return false;
  const draftGroupEntryState = editorCtx.selectedComponentId;
  if (
    popupBeingRenamed(
      runCopyInner,
      () => runCopyLocal(runCopyInner),
      () => editorCtx.selectedComponentId === draftGroupEntryState,
    )
  )
    return true;
  const ao7 = runExtraAlt(duplicatedPopupIdValue),
    draftGroupComponentValue = duplicatedPopupId?.bindings?.entity?.entityId || "",
    targetComponentCollectionState =
      runPortion(duplicatedPopupIdValue).find(
        (popupDuplicateDraftDocument: any) =>
          popupDuplicateDraftDocument.entityId === draftGroupComponentValue,
      ) || null,
    insertionCollectionState =
      duplicatedPopupIdValue === "scene-mode" ? null : runSegment()[0] || null,
    popupToDuplicate = editorEntityMatches(duplicatedPopupIdValue, "").findIndex(
      (popupToDuplicateState: any) => popupToDuplicateState.entityId === draftGroupComponentValue,
    );
  return (
    runCopyBackup({
      kind: "entity",
      title: "选择实体",
      subtitle:
        editorPickerComponentTypeLabel(duplicatedPopupIdValue) + " · " + popupBeingRenamedState,
      searchPlaceholder: "搜索实体名称或 ID",
      triggerButton: runCopyInner,
      pageSize: EDITOR_PICKER_PAGE_SIZES2.entity,
      initialPage: editorEntityPickerInitialPage2(popupToDuplicate, insertionCollectionState),
      selectedText: draftGroupComponentValue || "不使用实体",
      emptyText: "没有匹配的实体",
      itemClass: "entity-list",
      getPage({ query: popupToDuplicateValue, page: popupToDuplicateConfig }: any) {
        const yw2 = editorEntityMatches(duplicatedPopupIdValue, popupToDuplicateValue);
        return editorEntityPickerPage2(yw2, popupToDuplicateConfig, insertionCollectionState);
      },
      renderLeadingItems: (popupToDuplicateRef: any) =>
        popupToDuplicateRef.page === 1 && insertionCollectionState
          ? [createIconPickerOption(insertionCollectionState, draftGroupComponentValue)]
          : [],
      renderSelectedContent: () => [
        createEditorPickerCurrentEntity(targetComponentCollectionState),
      ],
      renderSelectedActions: () => [
        createEditorEntityPickerOption("不使用实体", !draftGroupComponentValue),
      ],
      renderItem: (popupDuplicateMatchState: any) =>
        createIconPickerOption(popupDuplicateMatchState, draftGroupComponentValue),
      onSelect: (popupDuplicateMatchValue: any) =>
        runCopyTwin(ao7.options, "entityId", popupDuplicateMatchValue),
    }),
    true
  );
}
function runCopyOuter() {
  if (removedComponent()?.type !== "light-statistics") return false;
  const templateLabelState = editorCtx.selectedComponentId;
  if (
    popupBeingRenamed(
      lightStatisticsEntityButtonElement,
      runCopyOuter,
      () =>
        editorCtx.selectedComponentId === templateLabelState &&
        removedComponent()?.type === "light-statistics",
    )
  )
    return true;
  const popupDuplicateMatchHandler = (popupDuplicateMatch: any) => {
      const duplicatedPopup = String(popupDuplicateMatch || "")
        .trim()
        .toLocaleLowerCase("zh-CN");
      return runPortion("light-statistics")
        .map((mappedItemsOrder: any, mappedItemsScope: any) => ({
          entity: mappedItemsOrder,
          index: mappedItemsScope,
          support: lightStatisticsEntitySupport2(mappedItemsOrder),
        }))
        .filter(
          ({ entity: popupModuleCopyState }: any) =>
            !duplicatedPopup ||
            (
              runMode(popupModuleCopyState) +
              " " +
              renderNavigationIconPreview(popupModuleCopyState)
            )
              .toLocaleLowerCase("zh-CN")
              .includes(duplicatedPopup),
        )
        .sort(
          (popupModuleCopyValue: any, popupModuleCopyConfig: any) =>
            Number(popupModuleCopyConfig.support.supported) -
              Number(popupModuleCopyValue.support.supported) ||
            +(renderNavigationIconPreview(popupModuleCopyConfig.entity) === "light") -
              +(renderNavigationIconPreview(popupModuleCopyValue.entity) === "light") ||
            popupModuleCopyValue.index - popupModuleCopyConfig.index,
        )
        .map(({ entity: popupModuleCopy }: any) => popupModuleCopy);
    },
    popupToDelete = popupDuplicateMatchHandler("").findIndex(
      (popupToDeleteState: any) => popupToDeleteState.entityId === editorCtx.statisticsEntityId,
    ),
    popupDeleteCandidateState = runSegment()[0] || null;
    runCopyBackup({
      kind: "entity",
      title: editorCtx.statisticsReplaceIndex >= 0 ? "选择替换实体" : "添加统计实体",
      subtitle: popupBeingRenamedState,
      searchPlaceholder: "搜索实体名称或 ID",
      triggerButton: lightStatisticsEntityButtonElement,
      pageSize: EDITOR_PICKER_PAGE_SIZES2.entity,
      initialPage: editorEntityPickerInitialPage2(popupToDelete, popupDeleteCandidateState),
      selectedText: editorCtx.statisticsEntityId || "不使用实体",
      emptyText: "没有匹配的实体",
      itemClass: "entity-list",
      closeLegacyPickers: false,
      getPage({ query: popupDeleteCandidate, page: bindPopupModuleSection }: any) {
        const createdComponentState = popupDuplicateMatchHandler(popupDeleteCandidate);
        return editorEntityPickerPage2(
          createdComponentState,
          bindPopupModuleSection,
          popupDeleteCandidateState,
        );
      },
      renderLeadingItems: (onDeletePopupDialogClose: any) =>
        onDeletePopupDialogClose.page === 1 && popupDeleteCandidateState
          ? [createIconPickerOption(popupDeleteCandidateState, editorCtx.statisticsEntityId)]
          : [],
      renderItem: (onDeletePopupConfirmButtonClick: any) =>
        createIconPickerOption(onDeletePopupConfirmButtonClick, editorCtx.statisticsEntityId),
      onSelect: (popupIdToDelete: any) =>
        runCopyTwin(
          lightStatisticsEntityOptionsElement,
          "lightStatisticsEntityId",
          popupIdToDelete,
        ),
    });
  return true;
}
function runCopyUpper(popupDeleteDraftDocumentElement: any) {
  const groupWidth = popupDeleteDraftDocumentElement.closest("[data-action-trigger]"),
    popupDeleteDraftDocument = groupWidth?.querySelector("[data-popup-entity]"),
    popupIdMatchState = groupWidth?.querySelector("[data-popup-entity-options]");
  if (!groupWidth || !popupDeleteDraftDocument || !popupIdMatchState) return false;
  if (
    popupBeingRenamed(
      popupDeleteDraftDocumentElement,
      () => runCopyUpper(popupDeleteDraftDocumentElement),
      () => groupWidth.isConnected,
    )
  )
    return true;
  const popupIdMatchValue = popupDeleteDraftDocument.value || "",
    popupIdMatchConfig =
      editorCtx.entities.find((popupIdMatch: any) => popupIdMatch.entityId === popupIdMatchValue) || null,
    clearPopupModuleReferencesState = runSegment()[0] || null,
    clearPopupModuleReferences = (clearPopupModuleReferencesValue: any) => {
      const groupHeight = String(clearPopupModuleReferencesValue || "")
        .trim()
        .toLocaleLowerCase("zh-CN");
      return editorCtx.entities.filter(
        (componentNodesState: any) =>
          !componentNodesState.virtual &&
          (!groupHeight ||
            (runMode(componentNodesState) + " " + componentNodesState.entityId)
              .toLocaleLowerCase("zh-CN")
              .includes(groupHeight)),
      );
    },
    createdWidthState = clearPopupModuleReferences("").findIndex(
      (componentNodes: any) => componentNodes.entityId === popupIdMatchValue,
    );
  return (
    runCopyBackup({
      kind: "entity",
      title: "选择弹窗实体",
      subtitle: popupBeingRenamedState,
      searchPlaceholder: "搜索实体名称或 ID",
      triggerButton: popupDeleteDraftDocumentElement,
      pageSize: EDITOR_PICKER_PAGE_SIZES2.entity,
      initialPage: editorEntityPickerInitialPage2(
        createdWidthState,
        clearPopupModuleReferencesState,
      ),
      selectedText: popupIdMatchValue || "不使用实体",
      emptyText: "没有匹配的实体",
      itemClass: "entity-list",
      getPage({ query: componentNode, page: componentActionKey }: any) {
        const createdHeightValue = clearPopupModuleReferences(componentNode);
        return editorEntityPickerPage2(
          createdHeightValue,
          componentActionKey,
          clearPopupModuleReferencesState,
        );
      },
      renderItem: (componentActionValue: any) =>
        createIconPickerOption(componentActionValue, popupIdMatchValue),
      renderLeadingItems: (popupPage: any) =>
        popupPage.page === 1 && clearPopupModuleReferencesState
          ? [createIconPickerOption(clearPopupModuleReferencesState, popupIdMatchValue)]
          : [],
      renderSelectedContent: () => [createEditorPickerCurrentEntity(popupIdMatchConfig)],
      renderSelectedActions: () => [
        createEditorEntityPickerOption("不使用实体", !popupIdMatchValue),
      ],
      onSelect: (onPopupModuleCloseButtonClick: any) =>
        runCopyTwin(popupIdMatchState, "popupActionEntityId", onPopupModuleCloseButtonClick),
    }),
    true
  );
}
function onPopupModuleCancelButtonClick() {
  if (!popupModuleDialogElement.open) return false;
  if (
    popupBeingRenamed(
      popupModuleEntityButtonElement,
      onPopupModuleCancelButtonClick,
      () => popupModuleDialogElement.open,
    )
  )
    return true;
  const onPopupModuleCancelButtonClickState = popupModuleFormElement.elements.entityId.value || "",
    onPopupModuleEntityButtonClickState =
      editorCtx.entities.find(
        (onPopupModuleEntityButtonClick: any) =>
          onPopupModuleEntityButtonClick.entityId === onPopupModuleCancelButtonClickState,
      ) || null,
    isPopupModuleEntityMenuHidden = runSegment()[0] || null,
    isPopupModuleEntityMenuHiddenHandler = (onSoundToggleButtonClickState: any) => {
      const soundToggleDocument = String(onSoundToggleButtonClickState || "")
        .trim()
        .toLocaleLowerCase("zh-CN");
      return editorCtx.entities
        .map((mappedItemsRange: any, mappedItemsSpan: any) => ({
          entity: mappedItemsRange,
          index: mappedItemsSpan,
        }))
        .filter(
          ({ entity: onShowPageEditorButtonClickValue }: any) =>
            !onShowPageEditorButtonClickValue.virtual &&
            (!soundToggleDocument ||
              (
                runMode(onShowPageEditorButtonClickValue) +
                " " +
                onShowPageEditorButtonClickValue.entityId
              )
                .toLocaleLowerCase("zh-CN")
                .includes(soundToggleDocument)),
        )
        .sort(
          (onShowPopupEditorButtonClickState: any, onProjectSelectChangeState: any) =>
            Number(
              popupModuleEntityRecommended2(
                onProjectSelectChangeState.entity,
                popupModuleFormElement.elements.type.value,
              ),
            ) -
              Number(
                popupModuleEntityRecommended2(
                  onShowPopupEditorButtonClickState.entity,
                  popupModuleFormElement.elements.type.value,
                ),
              ) || onShowPopupEditorButtonClickState.index - onProjectSelectChangeState.index,
        )
        .map(({ entity: mappedItemsOffset }: any) => mappedItemsOffset);
    },
    selectedPageComponentState = isPopupModuleEntityMenuHiddenHandler("").findIndex(
      (onPopupModuleEntitySearchInputInput: any) =>
        onPopupModuleEntitySearchInputInput.entityId === onPopupModuleCancelButtonClickState,
    );
  return (
    runCopyBackup({
      kind: "entity",
      title: "选择模块实体",
      subtitle: popupBeingRenamedState,
      searchPlaceholder: "搜索实体名称或 ID",
      triggerButton: popupModuleEntityButtonElement,
      pageSize: EDITOR_PICKER_PAGE_SIZES2.entity,
      initialPage: editorEntityPickerInitialPage2(
        selectedPageComponentState,
        isPopupModuleEntityMenuHidden,
      ),
      selectedText: onPopupModuleCancelButtonClickState || "不使用实体",
      emptyText: "没有匹配的实体",
      itemClass: "entity-list",
      getPage({ query: onPopupModuleEntityOptionsClick, page: popupModuleEntityClickEvent }: any) {
        const popupModuleEntityElement = isPopupModuleEntityMenuHiddenHandler(
          onPopupModuleEntityOptionsClick,
        );
        return editorEntityPickerPage2(
          popupModuleEntityElement,
          popupModuleEntityClickEvent,
          isPopupModuleEntityMenuHidden,
        );
      },
      renderItem: (onPopupNewButtonClickState: any) =>
        createIconPickerOption(onPopupNewButtonClickState, onPopupModuleCancelButtonClickState),
      renderLeadingItems: (onPopupNameCloseButtonClickState: any) =>
        onPopupNameCloseButtonClickState.page === 1 && isPopupModuleEntityMenuHidden
          ? [
              createIconPickerOption(
                isPopupModuleEntityMenuHidden,
                onPopupModuleCancelButtonClickState,
              ),
            ]
          : [],
      renderSelectedContent: () => [
        createEditorPickerCurrentEntity(onPopupModuleEntityButtonClickState),
      ],
      renderSelectedActions: () => [
        createEditorEntityPickerOption("不使用实体", !onPopupModuleCancelButtonClickState),
      ],
      onSelect: (onPopupNameCancelButtonClickState: any) =>
        runCopyTwin(
          popupModuleEntityOptionsElement,
          "popupModuleEntityId",
          onPopupNameCancelButtonClickState,
        ),
    }),
    true
  );
}
function onPopupModuleClimateDeviceTypeClick(climateDeviceTypeClickEvent: any) {
  const climateDeviceTypeClickEventState =
    climateDeviceTypeClickEvent === imageAssetButtonElement
      ? "image"
      : climateDeviceTypeClickEvent === ibeAssetButtonElement
        ? "ibe"
        : "";
  if (!climateDeviceTypeClickEventState) return false;
  const isClimateDeviceTypeClickEvent = climateDeviceTypeClickEventState === "image",
    climateDeviceTypeElementState = removedComponent(),
    climateDeviceTypeElementValue = isClimateDeviceTypeClickEvent
      ? climateDeviceTypeElementState?.properties?.assetId || ""
      : climateDeviceTypeElementState?.properties?.effectAssetId || "",
    sn5 = findAssetById(climateDeviceTypeElementValue);
  reloadAssetCatalog({
    refreshInspector: false,
  })
    .then(() => {
      editorCtx.popupBeingRenamedValue?.triggerButton === climateDeviceTypeClickEvent &&
        (editorCtx.popupBeingRenamedValue.syncAssetToolbar?.(), editorCtx.popupBeingRenamedValue.refresh());
    })
    .catch(handleOperationError);
  const climateDeviceTypeElement = editorAssetMatcher(climateDeviceTypeClickEventState).findIndex(
    (climateDeviceTypeElementConfig: any) =>
      assetMatchesId(climateDeviceTypeElementConfig, climateDeviceTypeElementValue),
  );
  return (
    runCopyBackup({
      kind: climateDeviceTypeClickEventState + "-asset",
      title: isClimateDeviceTypeClickEvent ? "选择控件图片" : "选择效果图片",
      subtitle: "我的图片与HomeOS素材 · 固定分页加载",
      searchPlaceholder: "搜索图片名称",
      triggerButton: climateDeviceTypeClickEvent,
      pageSize: EDITOR_PICKER_PAGE_SIZES2.asset,
      initialPage:
        climateDeviceTypeElement < 0
          ? 1
          : Math.floor(climateDeviceTypeElement / EDITOR_PICKER_PAGE_SIZES2.asset) + 1,
      selectedText: sn5?.name || climateDeviceTypeElementValue || "不使用图片",
      emptyText: "没有匹配的图片",
      itemClass: "asset-grid",
      getPage({
        query: onTargetChangeState,
        page: onTargetChange,
        pageSize: onPopupModuleFormSubmit,
      }: any) {
        const vw2 = editorAssetMatcher(climateDeviceTypeClickEventState, onTargetChangeState),
          popupModuleSubmitEventState = (onTargetChange - 1) * onPopupModuleFormSubmit;
        return {
          items: vw2.slice(
            popupModuleSubmitEventState,
            popupModuleSubmitEventState + onPopupModuleFormSubmit,
          ),
          total: vw2.length,
        };
      },
      renderSelectedContent: () => [createEditorPickerCurrentAsset(sn5)],
      renderSelectedActions: () => [
        createEditorEntityPickerOption("不使用图片", !climateDeviceTypeElementValue),
      ],
      renderItem(popupModuleSubmitEvent: any) {
        const nm2 = createAssetOptionButton(popupModuleSubmitEvent, climateDeviceTypeElementValue),
          popupModuleTargetPopupIdElement = nm2.matches?.("[data-asset-id]")
            ? nm2
            : nm2.querySelector<HTMLElement>("[data-asset-id]");
        return (
          popupModuleTargetPopupIdElement &&
            (popupModuleTargetPopupIdElement.dataset.editorPickerValue =
              popupModuleSubmitEvent.assetId),
          nm2
        );
      },
      buildToolbar: (popupModuleTargetPopupId: any) =>
        editorAssetToolbar(climateDeviceTypeClickEventState, popupModuleTargetPopupId),
      onItemHover: (popupModuleTargetPopupIdState: any, popupModuleTargetPopupIdValue: any) =>
        scheduleAssetPreview(
          findAssetById(popupModuleTargetPopupIdState),
          popupModuleTargetPopupIdValue,
          editorCtx.popupBeingRenamedValue?.dialog,
        ),
      onDelete: runCopyFirst,
      onSelect: (popupModuleTypeState: any) =>
        runCopyTwin(
          isClimateDeviceTypeClickEvent ? imageAssetOptionsElement : ibeAssetOptionsElement,
          "assetId",
          popupModuleTypeState,
        ),
    })?.dialog.append(imageAssetLargePreviewImageElement),
    true
  );
}
function runCopyLower(runCopyLeft: any, runCopyRight: any) {
  const popupModuleType = runCopyRight === "user" ? "user" : "builtin";
  runCopyLeft === "image"
    ? ((editorCtx.imageAssetFolder = popupModuleType),
      (imageAssetSearchInputElement.value = ""),
      leftFolderName("image"),
      syncAssetFolderOptions("image"),
      editorCtx.popupBeingRenamedValue?.kind === "image-asset"
        ? (editorCtx.popupBeingRenamedValue.rebuildToolbar(),
          editorCtx.popupBeingRenamedValue.refresh({
            resetPage: true,
          }))
        : (renderImageAssetOptions(), positionImageAssetMenu()))
    : ((editorCtx.effectAssetFolder = popupModuleType),
      (ibeAssetSearchElement.value = ""),
      leftFolderName("ibe"),
      syncAssetFolderOptions("ibe"),
      editorCtx.popupBeingRenamedValue?.kind === "ibe-asset"
        ? (editorCtx.popupBeingRenamedValue.rebuildToolbar(),
          editorCtx.popupBeingRenamedValue.refresh({
            resetPage: true,
          }))
        : (renderEffectAssetOptions(), positionEffectAssetMenu()));
}
async function popupModuleTypeValue(popupModuleTypeConfig: any, popupModuleTypeRef: any) {
  const popupModuleTypeEntry = [...(popupModuleTypeConfig || [])];
  if (!popupModuleTypeEntry.length) return;
  const Rf2 =
    popupModuleTypeRef === "image" ? imageAssetUploadButtonElement : ibeAssetUploadElement;
  Rf2.disabled = true;
  const popupModuleTypeRecord: any[] = [];
  try {
    for (const popupModuleTypeName of popupModuleTypeEntry) {
      if (!/\.(png|jpe?g|webp|svg)$/i.test(popupModuleTypeName.name)) {
        popupModuleTypeRecord.push(
          popupModuleTypeName.name + "：仅支持 PNG、JPG、JPEG、WebP 和 SVG",
        );
        continue;
      }
      try {
        await requestJson("/assets/user", {
          method: "POST",

          timeoutMs: 120000,
          body: popupModuleTypeName,
          headers: {
            "Content-Type": popupModuleTypeName.type || "application/octet-stream",
            "X-File-Name": encodeURIComponent(popupModuleTypeName.name),
          },
        });
      } catch (caughtErrorCount: any) {
        popupModuleTypeRecord.push(popupModuleTypeName.name + "：" + caughtErrorCount.message);
      }
    }
    (await reloadAssetCatalog({
      refreshInspector: false,
    }),
      runCopyLower(popupModuleTypeRef, "user"),
      popupModuleTypeRecord.length &&
        handleOperationError(new Error(popupModuleTypeRecord.join("\n"))));
  } finally {
    Rf2.disabled = false;
  }
}
function runCopyFirst(runCopySecond: any) {
  const sn6 = findAssetById(runCopySecond);
  if (!sn6 || sn6.source !== "user") return;
  const popupModuleSubmitEntityIdHandler = (popupModuleSubmitEntityIdState: any) =>
    Array.isArray(popupModuleSubmitEntityIdState)
      ? popupModuleSubmitEntityIdState.some(popupModuleSubmitEntityIdHandler)
      : popupModuleSubmitEntityIdState && typeof popupModuleSubmitEntityIdState == "object"
        ? Object.values(popupModuleSubmitEntityIdState).some(popupModuleSubmitEntityIdHandler)
        : popupModuleSubmitEntityIdState === sn6.assetId;
  if (popupModuleSubmitEntityIdHandler(editorCtx.activeProject?.document)) {
    (runShadow(),
      handleOperationError(
        new Error("这张图片正在被当前仪表盘或弹窗使用，请先替换或移除后再删除。"),
      ));
    return;
  }
  ((editorCtx.pendingDeleteAssetId = sn6.assetId),
    (deleteAssetNameElement.textContent = "“" + sn6.name + "”"),
    runShadow(),
    deleteAssetDialogElement.showModal());
}
function runCopyLast(runCopyOld: any, runCopyNew: any) {
  if (
    !canDeleteAssetFolder(runCopyOld === "image" ? editorCtx.imageAssetFolder : editorCtx.effectAssetFolder, runCopyNew)
  )
    return;
  const hL2 = exportedAssetsInFolder(runCopyNew),
    popupModuleSubmitEntityId = "studio3d:" + runCopyNew + "/",
    popupModuleSubmitEntityIdCallback = (popupModuleSubmitEntityIdValue: any) =>
      Array.isArray(popupModuleSubmitEntityIdValue)
        ? popupModuleSubmitEntityIdValue.some(popupModuleSubmitEntityIdCallback)
        : popupModuleSubmitEntityIdValue && typeof popupModuleSubmitEntityIdValue == "object"
          ? Object.values(popupModuleSubmitEntityIdValue).some(popupModuleSubmitEntityIdCallback)
          : typeof popupModuleSubmitEntityIdValue == "string" &&
            popupModuleSubmitEntityIdValue.startsWith(popupModuleSubmitEntityId);
  if (popupModuleSubmitEntityIdCallback(editorCtx.activeProject?.document)) {
    handleOperationError(
      new Error("这个文件夹中的图片正在被当前仪表盘或弹窗使用，请先替换或移除后再删除。"),
    );
    return;
  }
  ((editorCtx.pendingDeleteAssetFolder = {
    kind: runCopyOld,
    folderName: runCopyNew,
  }),
    (deleteAssetFolderNameElement.textContent = "“" + runCopyNew + "”"),
    (deleteAssetFolderCountElement.textContent = String(hL2.length)),
    deleteAssetFolderDialogElement.showModal());
}
function runAliasExtra() {
  (leftFolderName("image"),
    leftFolderName("ibe"),
    renderImageAssetOptions(imageAssetSearchInputElement.value),
    renderEffectAssetOptions(ibeAssetSearchElement.value),
    (editorCtx.popupBeingRenamedValue?.kind === "image-asset" ||
      editorCtx.popupBeingRenamedValue?.kind === "ibe-asset") &&
      (editorCtx.popupBeingRenamedValue.syncAssetToolbar?.(),
      editorCtx.popupBeingRenamedValue.refresh({
        resetPage: true,
      })),
    imageAssetMenuElement.hidden || positionImageAssetMenu(),
    ibeAssetMenuElement.hidden || positionEffectAssetMenu());
}
(imageAssetMenuElement.addEventListener("click", (popupModuleTitleState: any) => {
  const popupModuleTitle = popupModuleTitleState.target.closest("[data-image-asset-source]");
  popupModuleTitle && runCopyLower("image", popupModuleTitle.dataset.imageAssetSource);
}),
  ibeAssetMenuElement.addEventListener("click", (popupModuleDeviceType: any) => {
    const popupModuleDeviceTypeElement =
      popupModuleDeviceType.target.closest("[data-ibe-asset-source]");
    popupModuleDeviceTypeElement &&
      runCopyLower("ibe", popupModuleDeviceTypeElement.dataset.ibeAssetSource);
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
      runCopyFirst(popupModulePopupElement.dataset.deleteUserAsset));
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
          runAliasExtra());
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
      (runShadow(hidden13 ? "asset" : null),
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
    if ((hideAssetLargePreview(), runShadow(), !assetId)) {
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
      (runShadow(hidden14 ? "ibe-asset" : null),
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
    (hideAssetLargePreview(), runShadow());
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
function scaleDraftDocument(scaledPlacement: any) {
  editorCtx.popupDialogMode = scaledPlacement;
  const popupToDuplicateEntry = findCustomPopup2(editorCtx.activeProject?.document, editorCtx.selectedPopupId);
  ((popupNameDialogTitleElement.textContent =
    scaledPlacement === "rename" ? "重命名组合弹窗" : "新建组合弹窗"),
    (popupNameFormElement.elements.name.value =
      scaledPlacement === "rename" ? popupToDuplicateEntry?.name || "" : "新建组合弹窗"),
    popupNameDialogElement.showModal(),
    popupNameFormElement.elements.name.select());
}
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
    (run(), (editorCtx.selectedPopupId = popupSelectElement.value || null), setEditorMode("popup"));
  }),
  popupListElement.addEventListener("click", (bindPopupModuleSectionState: any) => {
    const enterTargetElement = bindPopupModuleSectionState.target.closest("[data-popup-id]");
    enterTargetElement &&
      (run(),
      (editorCtx.selectedPopupId = enterTargetElement.dataset.popupId),
      (popupSelectElement.value = editorCtx.selectedPopupId),
      runExtraOuter(editorCtx.activeProject.document, editorCtx.selectedPopupId),
      setEditorMode("popup"));
  }),
  popupListElement.addEventListener("contextmenu", (invalidateEditorLayoutMetrics: any) => {
    const invalidateEditorLayoutMetricsElement =
      invalidateEditorLayoutMetrics.target.closest("[data-popup-id]");
    if (!invalidateEditorLayoutMetricsElement) return;
    (invalidateEditorLayoutMetrics.preventDefault(),
      (editorCtx.selectedPopupId = invalidateEditorLayoutMetricsElement.dataset.popupId),
      (popupSelectElement.value = editorCtx.selectedPopupId),
      runExtraOuter(editorCtx.activeProject.document, editorCtx.selectedPopupId),
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
    const popupIdToDeleteState =
        readEditorLayoutPx.target.closest("[data-popup-action]")?.dataset.popupAction,
      ce3 = editorCtx.moduleDialogPopupId || editorCtx.selectedPopupId;
    if ((run(), !(!popupIdToDeleteState || !ce3))) {
      if (popupIdToDeleteState === "rename") {
        scaleDraftDocument("rename");
        return;
      }
      if (popupIdToDeleteState === "duplicate") {
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
      if (popupIdToDeleteState === "delete") {
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
function runAliasAlt() {
  ((editorCtx.popupModuleDraft = null), deletePopupDialogElement.close());
}
(deletePopupCloseElement.addEventListener("click", runAliasAlt),
  deletePopupCancelElement.addEventListener("click", runAliasAlt),
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
        (runExtraRight(),
        window.requestAnimationFrame(() =>
          popupModuleEntitySearchElement.focus({
            preventScroll: true,
          }),
        )));
  }),
  popupModuleEntitySearchElement.addEventListener("input", () => runExtraRight()),
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
        runExtraLeft(climateDeviceTypeElementElement.dataset.popupModuleDeviceType);
    },
  ),
  popupModuleFormElement.elements.type.addEventListener("change", () => {
    (runExtraLeft(), popupModuleEntityOptionsElement.replaceChildren());
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
    const deleteAssetFolderClosestElementState = (panelId.target as Element).closest(
      "#delete-asset-folder-dialog",
    );
    (componentMenuElement.contains(panelId.target) || closeComponentMenu(),
      !deleteAssetFolderClosestElementState &&
        editorCtx.openCustomSelect &&
        !editorCtx.openCustomSelect.button.contains(panelId.target) &&
        !editorCtx.openCustomSelect.menu.contains(panelId.target) &&
        runState(),
      (panelId.target as Element).closest(".dashboard-select-row") || errorPhase(),
      (panelId.target as Element).closest(".page-control .page-select-row") || value(),
      !(panelId.target as Element).closest("#popup-list") &&
        !(panelId.target as Element).closest("#popup-actions-menu") &&
        run(),
      (panelId.target as Element).closest("#popup-module-entity-picker") || closePopupModuleEntityMenu(),
      (panelId.target as Element).closest(".component-popup-entity-picker") || closePopupEntityMenus(),
      (panelId.target as Element).closest("#image-entity-picker") ||
        runPrimary(imageEntityMenuElement, imageEntityButtonElement),
      (panelId.target as Element).closest("#weather-entity-picker") ||
        runPrimary(weatherEntityMenuElement, weatherEntityButtonElement),
      (panelId.target as Element).closest("#line-chart-entity-picker") ||
        runPrimary(lineChartEntityMenuElement, lineChartEntityButtonElement),
      (panelId.target as Element).closest("#ibe-entity-picker") ||
        runPrimary(ibeEntityMenuElement, ibeEntityButtonElement),
      (panelId.target as Element).closest("#icon-button-entity-picker") ||
        runPrimary(iconButtonEntityMenuElement, iconButtonEntityButtonElement),
      (panelId.target as Element).closest("#vacuum-map-entity-picker") ||
        runPrimary(vacuumMapEntityMenuElement, vacuumMapEntityButtonElement),
      (panelId.target as Element).closest("#camera-entity-picker") ||
        runPrimary(cameraEntityMenuElement, cameraEntityButtonElement),
      (panelId.target as Element).closest("#air-conditioner-entity-picker") ||
        runPrimary(airConditionerEntityMenuElement, airConditionerEntityButtonElement),
      (panelId.target as Element).closest("#title-button-entity-picker") ||
        runPrimary(titleButtonEntityMenuElement, titleButtonEntityButtonElement),
      !lightStatisticsEntityMenuElement.hidden &&
        !(panelId.target as Element).closest("#light-statistics-entity-picker") &&
        !lightStatisticsEntityMenuElement.contains(panelId.target) &&
        (runPrimary(lightStatisticsEntityMenuElement, lightStatisticsEntityButtonElement),
        runLimit()),
      (panelId.target as Element).closest("#light-statistics-action-entity-picker") ||
        runPrimary(
          lightStatisticsActionEntityMenuElement,
          lightStatisticsActionEntityButtonElement,
        ),
      (panelId.target as Element).closest("#navigation-entity-picker") ||
        runPrimary(navigationEntityMenuElement, navigationEntityButtonElement));
    const panelElement = customSelectsBySelectElement.get(imageAssetFolderSelectElement)?.menu;
    !deleteAssetFolderClosestElementState &&
      !(panelId.target as Element).closest("#image-asset-picker") &&
      !panelElement?.contains(panelId.target) &&
      runPrimary(imageAssetMenuElement, imageAssetButtonElement);
    const panelWidth = customSelectsBySelectElement.get(ibeAssetFolderElement)?.menu;
    (!deleteAssetFolderClosestElementState &&
      !(panelId.target as Element).closest("#ibe-asset-picker") &&
      !panelWidth?.contains(panelId.target) &&
      runPrimary(ibeAssetMenuElement, ibeAssetButtonElement),
      !(panelId.target as Element).closest("#ibe-icon-picker") &&
        !ibeIconMenuElement.contains(panelId.target) &&
        runPrimary(ibeIconMenuElement, ibeIconButtonElement),
      !(panelId.target as Element).closest("#icon-button-icon-picker") &&
        !iconButtonIconMenuElement.contains(panelId.target) &&
        runPrimary(iconButtonIconMenuElement, iconButtonIconButtonElement),
      !(panelId.target as Element).closest("#title-button-icon-picker") &&
        !titleButtonIconMenuElement.contains(panelId.target) &&
        runPrimary(titleButtonIconMenuElement, titleButtonIconButtonElement),
      !(panelId.target as Element).closest("#light-statistics-icon-picker") &&
        !lightStatisticsIconMenuElement.contains(panelId.target) &&
        runPrimary(lightStatisticsIconMenuElement, lightStatisticsIconButtonElement),
      !(panelId.target as Element).closest("#navigation-icon-picker") &&
        !navigationIconMenuElement.contains(panelId.target) &&
        runPrimary(navigationIconMenuElement, navigationIconButtonElement));
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
    const keyboardTargetElementState = (documentKeydownEventState.target as Element).closest(
      'input, textarea, select, button, [contenteditable="true"], dialog',
    );
    const modKey =
      documentKeydownEventState.metaKey || documentKeydownEventState.ctrlKey;
    const keyLower = documentKeydownEventState.key.toLowerCase();

    if (!keyboardTargetElementState && modKey && !documentKeydownEventState.altKey) {
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

    if (documentKeydownEventState.code === "Space" && !keyboardTargetElementState && !modKey) {
      editorCtx.editorSpacePanning = true;
      documentKeydownEventState.preventDefault();
      return;
    }

    if (editorCtx.editorMode === "edit" && editorCtx.selectedComponentIdsSet.size && !keyboardTargetElementState) {
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
      !keyboardTargetElementState
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
      runExtraShadow(),
      resolveAssetPreviewUrl("weather"),
      resolveAssetPreviewUrl("line-chart"),
      resolveAssetPreviewUrl("icon-button-effect"),
      resolveAssetPreviewUrl("icon-button"),
      resolveAssetPreviewUrl("vacuum-map"),
      resolveAssetPreviewUrl("camera"),
      resolveAssetPreviewUrl("air-conditioner"),
      resolveAssetPreviewUrl("title-button"),
      resolveAssetPreviewUrl("light-statistics"),
      runExtraExtra(),
      positionImageAssetMenu(),
      positionEffectAssetMenu(),
      runOld(),
      runNew(),
      runShort(),
      runLong(),
      runNext(),
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
      runState(),
      runShadow(),
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
const entryStateHandler = (runEditorLayoutAction: any) => {
  const targetBoundsName = globalColorPickerSvElement.getBoundingClientRect();
  ((editorCtx.colorPickerSaturation = clampNumber2(
    (runEditorLayoutAction.clientX - targetBoundsName.left) / Math.max(1, targetBoundsName.width),
    0,
    1,
  )),
    (editorCtx.colorPickerBrightness =
      1 -
      clampNumber2(
        (runEditorLayoutAction.clientY - targetBoundsName.top) /
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
          ? (isNavigator = runCopyOuter())
          : metricsElement.matches("[data-popup-entity-button]")
            ? (isNavigator = runCopyUpper(metricsElement))
            : metricsElement === popupModuleEntityButtonElement
              ? (isNavigator = onPopupModuleCancelButtonClick())
              : [imageAssetButtonElement, ibeAssetButtonElement].includes(metricsElement)
                ? (isNavigator = onPopupModuleClimateDeviceTypeClick(metricsElement))
                : (isNavigator = runCopyLocal(metricsElement)),
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
async function onSessionsRevokeOthersConfirmButtonClick(
  revokeOtherSessionsError: any,
  onSessionsRevokeCloseButtonClick: any,
  onSessionsRevokeCancelButtonClick: any,
  onSessionsRevokeConfirmButtonClick: any,
) {
  const Ie9 = editorCtx.componentScopeState,
    onSessionsRevokeConfirmButtonClickState = editorCtx.activeProject?.projectId,
    revokedSessionIdHandler = () =>
      editorCtx.componentScopeState === Ie9 &&
      editorCtx.activeProject?.projectId === onSessionsRevokeConfirmButtonClickState &&
      editorCtx.selectedComponentId === onSessionsRevokeCloseButtonClick &&
      removedComponent()?.properties?.controlMode === "entity-sign";
  revokeOtherSessionsError.disabled = true;
  try {
    if (
      (editorCtx.isAreEntitiesLoaded || (await ensureEntitiesLoaded()),
      !revokedSessionIdHandler() || !revokeOtherSessionsError.isConnected)
    )
      return;
    const revokedSessionId = await requestJson("/ha/numeric-sources");
    if (!revokedSessionIdHandler() || !revokeOtherSessionsError.isConnected) return;
    const mappedItemByIdByName = new Map(
        editorCtx.entities.map((revokeSessionError: any) => [revokeSessionError.entityId, revokeSessionError]),
      ),
      availableItemsValue = (revokedSessionId.items || []).map(
        (onDisplayPairingCustomCodeTextInputInput: any) => ({
          ...(mappedItemByIdByName.get(onDisplayPairingCustomCodeTextInputInput.entityId) || {}),
          ...onDisplayPairingCustomCodeTextInputInput,
          name:
            (mappedItemByIdByName.get(onDisplayPairingCustomCodeTextInputInput.entityId) as any)
              ?.name ||
            onDisplayPairingCustomCodeTextInputInput.name ||
            onDisplayPairingCustomCodeTextInputInput.entityId,
        }),
      );
    runCopyBackup({
      kind: "entity",
      title: "选择流水线条数值实体",
      subtitle: "正数正向，负数反向，0 或不可用时只显示底线",
      searchPlaceholder: "搜索实体名称或 ID",
      triggerButton: revokeOtherSessionsError,
      pageSize: 20,
      selectedText: onSessionsRevokeCancelButtonClick || "未绑定",
      emptyText: "没有匹配的实体",
      itemClass: "entity-list",
      getPage({
        query: onLogoutButtonClick,
        page: onGlobalColorPickerSaturationValuePointerdown,
        pageSize: saturationPointerDownEvent,
      }: any) {
        const split = String(onLogoutButtonClick || "")
            .toLowerCase()
            .trim()
            .split(/\s+/),
          filteredItemsText = availableItemsValue.filter(
            (onGlobalColorPickerSaturationValuePointermove: any) =>
              split.every((saturationPointerMoveEvent) =>
                (
                  runMode(onGlobalColorPickerSaturationValuePointermove) +
                  " " +
                  onGlobalColorPickerSaturationValuePointermove.entityId
                )
                  .toLowerCase()
                  .includes(saturationPointerMoveEvent),
              ),
          );
        return {
          items: filteredItemsText.slice(
            (onGlobalColorPickerSaturationValuePointerdown - 1) * saturationPointerDownEvent,
            onGlobalColorPickerSaturationValuePointerdown * saturationPointerDownEvent,
          ),
          total: filteredItemsText.length,
        };
      },
      renderSelectedActions: () => [
        createEditorEntityPickerOption("清除绑定", !onSessionsRevokeCancelButtonClick),
      ],
      renderItem: (onGlobalColorPickerSaturationValuePointerup: any) => {
        const qt2 = createIconPickerOption(
          onGlobalColorPickerSaturationValuePointerup,
          onSessionsRevokeCancelButtonClick,
        );
        return (
          onGlobalColorPickerSaturationValuePointerup.unavailable &&
            qt2.querySelector(".inspector-entity-name")!.prepend("暂不可用 · "),
          qt2
        );
      },
      onSelect: (saturationPointerUpEvent: any) => {
        if (revokedSessionIdHandler())
          return onSessionsRevokeConfirmButtonClick(saturationPointerUpEvent);
      },
    });
  } catch (onGlobalColorPickerHueRangeInputInput: any) {
    revokedSessionIdHandler() &&
      revokeOtherSessionsError.isConnected &&
      handleOperationError(onGlobalColorPickerHueRangeInputInput);
  } finally {
    revokeOtherSessionsError.disabled = false;
  }
}
function onGlobalColorPickerHexTextInputInput(runAliasAux: any) {
  const hexColorInputValue = runAliasAux?.id;
  return {
    document: editorCtx.activeProject?.document,
    entities: editorCtx.entities,
    entityName: runSnapshot,
    enhance: (onSessionsRevokeCloseButtonClickState: any) => {
      (selectableEntities(onSessionsRevokeCloseButtonClickState),
        destroyDashboardPreview(onSessionsRevokeCloseButtonClickState),
        formatLastSeen(onSessionsRevokeCloseButtonClickState));
    },
    change: (onSessionsRevokeCancelButtonClickState: any) => {
      const il4 =
        onSessionsRevokeCancelButtonClickState.geometry === "rotation"
          ? selectedComponentIdsFromDom()
          : [];
      return mutateDocument((onSessionsRevokeConfirmButtonClickValue: any) => {
        const revokedSessionIdState = findComponent2(
          onSessionsRevokeConfirmButtonClickValue,
          hexColorInputValue,
        )?.component;
        revokedSessionIdState?.type === "percentage-bar" &&
          (onSessionsRevokeCancelButtonClickState.geometry === "rotation" && il4.length > 1
            ? setComponentsRotation(
                onSessionsRevokeConfirmButtonClickValue,
                hexColorInputValue,
                onSessionsRevokeCancelButtonClickState.value,
                il4,
              )
            : applyPercentageBarChange2(
                revokedSessionIdState,
                onSessionsRevokeCancelButtonClickState,
                onSessionsRevokeConfirmButtonClickValue.canvas,
              ));
      });
    },
    canApplyStyle:
      runAliasAux?.type === "percentage-bar" && findReplaceableComponents(runAliasAux).length > 0,
    applyStyle: mutationRecord,
    previewProperty: (
      onGlobalColorPickerHexTextInputChangeState: any,
      onGlobalColorPickerHexTextInputChange: any,
    ) => {
      const hexColorChangeInput = clone2(runAliasAux);
      (applyPercentageBarChange2(
        hexColorChangeInput,
        {
          property: onGlobalColorPickerHexTextInputChangeState,
          value: onGlobalColorPickerHexTextInputChange,
        },
        editorCtx.activeProject.document.canvas,
      ),
        editorCtx.editorRenderer?.previewComponentTransform(hexColorInputValue, hexColorChangeInput.position),
        editorCtx.editorRenderer?.previewComponentProperties(
          hexColorInputValue,
          hexColorChangeInput.properties,
        ));
    },
    previewGeometry: (onDisplayPairingCustomCodeTextInputInputState: any, onLogoutButtonClickState: any) => {
      const canvas = editorCtx.activeProject.document.canvas,
        position = runAliasAux.position;
      if (
        onDisplayPairingCustomCodeTextInputInputState === "rotation" &&
        selectedComponentIdsFromDom().length > 1
      )
        return;
      const hexColorChangeInputState =
        onDisplayPairingCustomCodeTextInputInputState === "left"
          ? {
              x: (canvas.width * onLogoutButtonClickState) / 100 - position.width / 2,
            }
          : onDisplayPairingCustomCodeTextInputInputState === "top"
            ? {
                y: (canvas.height * onLogoutButtonClickState) / 100 - position.height / 2,
              }
            : onDisplayPairingCustomCodeTextInputInputState === "scale"
              ? {
                  scale: onLogoutButtonClickState / 100,
                }
              : {
                  rotation: onLogoutButtonClickState,
                };
      editorCtx.editorRenderer?.previewComponentTransform(hexColorInputValue, hexColorChangeInputState);
    },
    pickEntity: (
      onGlobalColorPickerSaturationValuePointerdownState: any,
      saturationPointerDownEventState: any,
      onGlobalColorPickerSaturationValuePointermoveState: any,
    ) =>
      saturationPointerMoveEventState(
        onGlobalColorPickerSaturationValuePointerdownState,
        hexColorInputValue,
        saturationPointerDownEventState,
        onGlobalColorPickerSaturationValuePointermoveState,
      ),
  };
}
async function saturationPointerMoveEventState(
  colorChannelInput: any,
  onGlobalColorPickerCopyButtonClick: any,
  copyColorError: any,
  onGlobalColorPickerPasteButtonClick: any,
) {
  const clipboardRawText = editorCtx.componentScopeState,
    clipboardRawTextState = editorCtx.activeProject?.projectId,
    clipboardHexColor = () =>
      editorCtx.componentScopeState === clipboardRawText &&
      editorCtx.activeProject?.projectId === clipboardRawTextState &&
      editorCtx.selectedComponentId === onGlobalColorPickerCopyButtonClick;
  colorChannelInput.disabled = true;
  const textContent = colorChannelInput.textContent;
  colorChannelInput.textContent = "正在筛选百分比实体…";
  try {
    if (!editorCtx.isAreEntitiesLoaded) {
      if ((await ensureEntitiesLoaded(), !clipboardHexColor())) return;
      colorChannelInput =
        document.querySelector('#percentage-bar-inspector button[aria-label="选择百分比实体"]') ||
        colorChannelInput;
    }
    const clipboardRawTextValue = await requestJson("/ha/percentage-sources");
    if (!clipboardHexColor() || !colorChannelInput.isConnected) return;
    const mappedItemByIdByCode = new Map(
        editorCtx.entities.map((pasteColorError: any) => [pasteColorError.entityId, pasteColorError]),
      ),
      availableItemsConfig = (clipboardRawTextValue.items || []).map((pickerGuardClickEvent: any) => ({
        ...pickerGuardClickEvent,
        name:
          runSnapshot(mappedItemByIdByCode.get(pickerGuardClickEvent.entityId)) ||
          pickerGuardClickEvent.entityId,
      }));
    runCopyBackup({
      kind: "entity",
      title: "选择百分比实体",
      subtitle: "百分比状态、窗帘开合度、风扇百分比与湿度属性",
      searchPlaceholder: "搜索实体名称或 ID",
      triggerButton: colorChannelInput,
      pageSize: 20,
      selectedText: copyColorError.entityId
        ? "" +
          copyColorError.entityId +
          (copyColorError.attribute ? " · " + copyColorError.attribute : "")
        : "未绑定",
      emptyText: "没有匹配的百分比实体",
      itemClass: "entity-list",
      getPage({
        query: onGlobalColorPickerCopyButtonClickState,
        page: copyColorErrorState,
        pageSize: onGlobalColorPickerPasteButtonClickState,
      }: any) {
        const split2 = String(onGlobalColorPickerCopyButtonClickState || "")
            .toLowerCase()
            .trim()
            .split(/\s+/),
          filteredItemsCount = availableItemsConfig.filter((filteredItemsIndex: any) =>
            split2.every((pickerGuardClickEventState) =>
              (
                filteredItemsIndex.name +
                " " +
                filteredItemsIndex.entityId +
                " " +
                filteredItemsIndex.sourceLabel
              )
                .toLowerCase()
                .includes(pickerGuardClickEventState),
            ),
          );
        return {
          items: filteredItemsCount.slice(
            (copyColorErrorState - 1) * onGlobalColorPickerPasteButtonClickState,
            copyColorErrorState * onGlobalColorPickerPasteButtonClickState,
          ),
          total: filteredItemsCount.length,
        };
      },
      renderSelectedActions: () => [
        createEditorEntityPickerOption("清除绑定", !copyColorError.entityId),
      ],
      renderItem(documentPointerDownCaptureEvent: any) {
        const closeEventState = mappedItemByIdByCode.get(
            documentPointerDownCaptureEvent.entityId,
          ) || {
            entityId: documentPointerDownCaptureEvent.entityId,
            name: documentPointerDownCaptureEvent.name,
          },
          qt3 = createIconPickerOption(
            closeEventState,
            copyColorError.entityId === documentPointerDownCaptureEvent.entityId &&
              copyColorError.attribute === documentPointerDownCaptureEvent.attribute
              ? documentPointerDownCaptureEvent.entityId
              : "",
          );
        return (
          (qt3.dataset.editorPickerValue = JSON.stringify([
            documentPointerDownCaptureEvent.entityId,
            documentPointerDownCaptureEvent.attribute,
          ])),
          (qt3.querySelector(".inspector-entity-name")!.textContent +=
            " · " + documentPointerDownCaptureEvent.sourceLabel),
          qt3
        );
      },
      onSelect(closeEvent: any) {
        if (!clipboardHexColor()) return;
        const [closeEventValue, mutationRecordsState] = closeEvent
          ? JSON.parse(closeEvent)
          : ["", ""];
        onGlobalColorPickerPasteButtonClick({
          entityId: closeEventValue,
          attribute: mutationRecordsState,
        });
      },
    });
  } catch (mutationRecords: any) {
    handleOperationError(mutationRecords);
  } finally {
    ((colorChannelInput.disabled = false), (colorChannelInput.textContent = textContent));
  }
}
function mutationRecord() {
  const createdInstanceSlot = removedComponent();
  if (createdInstanceSlot?.type !== "percentage-bar") return;
  const mutationRecordState = findReplaceableComponents(createdInstanceSlot);
  if (!mutationRecordState.length) return;
  const addedState = {
      variant: "柱体样式",
      orientation: "显示方向",
      thickness: "统一柱宽",
      length: "柱体长度",
      gap: "柱间距",
      valueOffsetX: "数值水平偏移",
      valueOffsetY: "数值垂直偏移",
      labelOffsetX: "备注水平偏移",
      labelOffsetY: "备注垂直偏移",
      valueSize: "数值字号",
      labelSize: "备注字号",
      radius: "柱顶圆角",
      fillOpacity: "填充浓度",
      precision: "小数位数",
      valueVisible: "显示数值",
      labelVisible: "显示备注",
      valueColor: "数值颜色",
      labelColor: "备注颜色",
    },
    addedStateState = {
      gradient: "渐变柱",
      cursor: "内嵌游标柱",
      glass: "玻璃液柱",
      vertical: "纵向",
      horizontal: "横向",
      true: "显示",
      false: "隐藏",
    };
  ((navigationStyleApplyTitleElement.textContent = "应用百分比柱状图样式"),
    (navigationStyleApplyTargetHeadingElement.textContent = "应用到百分比柱状图"),
    (navigationStyleApplyTargetScopeElement.textContent = "按区域与页面区分"),
    (navigationStyleApplySummaryElement.textContent =
      "选择要应用的样式与目标控件，每根柱子的实体、备注和颜色分别保留。"),
    navigationStyleApplyPropertiesElement.replaceChildren(
      ...Object.entries(addedState).map(([addedNode, onDocumentVisibilitychange]) => {
        const onDocumentVisibilitychangeState =
          createdInstanceSlot.properties?.[addedNode] ?? (percentageBarDefaults2 as any)[addedNode];
        return runVariantPeer({
          value: addedNode,
          label: onDocumentVisibilitychange,
          detail:
            (addedStateState as any)[onDocumentVisibilitychangeState] ||
            String(onDocumentVisibilitychangeState),
        });
      }),
    ),
    runVariantLower(mutationRecordState, "百分比柱状图"),
    (navigationStyleApplyMessageElement.hidden = true),
    (editorCtx.appliedStyleRecord = {
      sourceId: createdInstanceSlot.id,
      type: "percentage-bar",
    }),
    navigationStyleApplyDialogElement.showModal());
}


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
