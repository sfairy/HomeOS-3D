/* 检查器上下文（标题/灯光/摄像/扫地机/窗帘电机、弹窗模块、资源目录） */
import type { EditorContext } from "../editor-context";
import { syncTitleButtonInspector as syncTitleButtonInspectorExternal } from "../../home-title-button-inspector";
import { syncLightStatisticsInspector as syncLightStatisticsInspectorExternal } from "../../home-light-statistics-inspector";
import { findComponent as findComponent2 } from "../../component-tree";
import { syncCameraInspector as syncCameraInspectorExternal } from "../../home-camera-inspector";
import { syncVacuumMapInspector as syncVacuumMapInspectorExternal } from "../../home-vacuum-map-inspector";
import { type CoverMotorInspectorContext, coverMotorButtonElement as coverMotorButtonElementSync, collectChangedCoverMotorStyleKeys as runExtraLocalCover } from "../../home-cover-motor-inspector";
import { setBuiltinAssetVersions as setBuiltinAssetVersions2 } from "../../../renderer/panel-renderer";
import { nasProfiles as nasProfiles2, reconcileNasDocument as reconcileNasDocument2 } from "../../../bridge/catalog/nas-catalog";
import { documentSignature as documentSignature2, editorDocumentFrameSignature as editorDocumentFrameSignature2, editorComponentEntries as editorComponentEntries2, editorComponentStructure as editorComponentStructure2 } from "../../editor-history";
import { normalizedPopupClimateDeviceType as normalizedPopupClimateDeviceType2, popupModuleEntityRecommended as popupModuleEntityRecommended2, findCustomPopup as findCustomPopup2 } from "../../editor-document-management";
import { renderEntityOptionButtons } from "./entity-option-list";

export interface InspectorContextsDeps {
  editorCtx: EditorContext;
  airConditionerEntityMenuElement: any;
  airConditionerInspectorElement: any;
  airConditionerPreviewStateByComponentId: any;
  allAssets: any;
  buildCameraInspectorContext: any;
  buildCoverMotorInspectorContext: any;
  buildLightStatisticsInspectorContext: any;
  buildTitleButtonInspectorContext: any;
  buildVacuumMapInspectorContext: any;
  cameraActionControlsElement: any;
  cameraApplyCountElement: any;
  cameraApplyStyleElement: any;
  cameraDisplayModeOptionsElement: any;
  cameraEntityMenuElement: any;
  cameraEntityPickerElement: any;
  cameraFitOptionsElement: any;
  cameraFrameAngleElement: any;
  cameraFrameColorElement: any;
  cameraFrameOpacityElement: any;
  cameraFrameVisibleElement: any;
  cameraFrameWidthElement: any;
  cameraGo2rtcNoteElement: any;
  cameraGo2rtcUrlElement: any;
  cameraGo2rtcUrlFieldElement: any;
  cameraHeightElement: any;
  cameraInspectorElement: any;
  cameraLabelElement: any;
  cameraLeftElement: any;
  cameraMediaVisibleElement: any;
  cameraRadiusElement: any;
  cameraRefreshIntervalElement: any;
  cameraRefreshIntervalFieldElement: any;
  cameraRotationElement: any;
  cameraScaleElement: any;
  cameraSourceOptionsElement: any;
  cameraTopElement: any;
  cameraWidthElement: any;
  closePopupModuleEntityMenu: any;
  componentActionControlsElement: any;
  coverMotorButtonElement: any;
  coverSettingsDirectionElement: any;
  coverSettingsInspectorElement: any;
  coverSettingsKindElement: any;
  coverSettingsMotorDirectionElement: any;
  dateInspectorElement: any;
  destroyDashboardPreview: any;
  discardRecoverySnapshot: any;
  displayDeviceCountElement: any;
  editorCanvasElement: any;
  editorPickers: any;
  eventLogWallInspectorElement: any;
  findReplaceableComponents: any;
  floorplanAutoDiagramBindingListElement: any;
  floorplanAutoDiagramBindingsElement: any;
  floorplanAutoDiagramCameraModeElement: any;
  floorplanAutoDiagramCameraViewElement: any;
  floorplanAutoDiagramFloorSelectElement: any;
  floorplanAutoDiagramFocalLengthInputElement: any;
  floorplanAutoDiagramFolderTextInputElement: any;
  floorplanAutoDiagramHeightInputElement: any;
  floorplanAutoDiagramInspectorFormElement: any;
  floorplanAutoDiagramLabelTextInputElement: any;
  floorplanAutoDiagramLayoutElement: any;
  floorplanAutoDiagramLeftInputElement: any;
  floorplanAutoDiagramOpenBaseLightingButtonElement: any;
  floorplanAutoDiagramOpenStudioButtonElement: any;
  floorplanAutoDiagramRotateTopButtonElement: any;
  floorplanAutoDiagramRotationInputElement: any;
  floorplanAutoDiagramScaleInputElement: any;
  floorplanAutoDiagramStateByComponentId: any;
  floorplanAutoDiagramStatusElement: any;
  floorplanAutoDiagramTopInputElement: any;
  floorplanAutoDiagramViewToggleButtonElement: any;
  floorplanAutoDiagramWidthInputElement: any;
  formatLastSeen: any;
  handleOperationError: any;
  hasActiveProject: any;
  historyState: any;
  ibeActionControlsElement: any;
  ibeActionSectionElement: any;
  ibeApplyCountElement: any;
  ibeApplyStyleElement: any;
  ibeAssetMenuElement: any;
  ibeBrightnessRealtimeElement: any;
  ibeButtonOffColorElement: any;
  ibeButtonOnColorElement: any;
  ibeButtonOpacityElement: any;
  ibeButtonSectionElement: any;
  ibeButtonTransformSectionElement: any;
  ibeButtonVisibleElement: any;
  ibeColorTemperatureRealtimeElement: any;
  ibeEffectFadeDurationElement: any;
  ibeEffectLayoutOptionsElement: any;
  ibeEffectLeftElement: any;
  ibeEffectOpacityElement: any;
  ibeEffectRotationElement: any;
  ibeEffectScaleElement: any;
  ibeEffectSectionElement: any;
  ibeEffectSizeHintElement: any;
  ibeEffectTopElement: any;
  ibeEffectVisibleElement: any;
  ibeEntityMenuElement: any;
  ibeFrameColorElement: any;
  ibeFrameOpacityElement: any;
  ibeFrameWidthElement: any;
  ibeGlowColorElement: any;
  ibeGlowOffStrengthElement: any;
  ibeGlowOnStrengthElement: any;
  ibeHeightElement: any;
  ibeIconMenuElement: any;
  ibeIconOffColorElement: any;
  ibeIconOnColorElement: any;
  ibeIconSizeElement: any;
  ibeLabelElement: any;
  ibeLayerOptionsElement: any;
  ibeLeftElement: any;
  ibePreviewStateElement: any;
  ibeRadiusElement: any;
  ibeRotationElement: any;
  ibeScaleElement: any;
  ibeTopElement: any;
  ibeWidthElement: any;
  iconButtonEffectInspectorElement: any;
  iconButtonEffectLayerByComponentId: any;
  iconButtonEffectPreviewStateByComponentId: any;
  iconButtonEntityMenuElement: any;
  iconButtonIconMenuElement: any;
  iconButtonInspectorElement: any;
  iconButtonPreviewStateByComponentId: any;
  imageAssetPointerOverEvent: any;
  imageInspectorElement: any;
  imageLabelElement: any;
  imageLayoutOptionsElement: any;
  imageLeftInputElement: any;
  imageOpacityInputElement: any;
  imageRotationInputElement: any;
  imageScaleInputElement: any;
  imageTopInputElement: any;
  imageTypeElement: any;
  initialPopupId: any;
  inspectorEmptyElement: any;
  lightStatisticsActionControlsElement: any;
  lightStatisticsActionEntityMenuElement: any;
  lightStatisticsCountActiveColorElement: any;
  lightStatisticsCountColorElement: any;
  lightStatisticsCountGapElement: any;
  lightStatisticsCountSizeElement: any;
  lightStatisticsCountSpacingElement: any;
  lightStatisticsCountVisibleElement: any;
  lightStatisticsCountWeightElement: any;
  lightStatisticsEntityButtonElement: any;
  lightStatisticsEntityMenuElement: any;
  lightStatisticsEntitySearchElement: any;
  lightStatisticsHeightElement: any;
  lightStatisticsIconActiveColorElement: any;
  lightStatisticsIconColorElement: any;
  lightStatisticsIconGapElement: any;
  lightStatisticsIconMenuElement: any;
  lightStatisticsIconSizeElement: any;
  lightStatisticsIconVisibleElement: any;
  lightStatisticsInspectorElement: any;
  lightStatisticsLabelElement: any;
  lightStatisticsLeftElement: any;
  lightStatisticsRotationElement: any;
  lightStatisticsScaleElement: any;
  lightStatisticsTitleColorElement: any;
  lightStatisticsTitleElement: any;
  lightStatisticsTitleSizeElement: any;
  lightStatisticsTitleSpacingElement: any;
  lightStatisticsTitleVisibleElement: any;
  lightStatisticsTitleWeightElement: any;
  lightStatisticsTopElement: any;
  lightStatisticsWidthElement: any;
  lineChartInspectorElement: any;
  loadNavigationIconOptions: any;
  mutateDocument: any;
  navigationIconMenuElement: any;
  navigationInspectorFormElement: any;
  navigationLabelTextInputElement: any;
  navigationPreviewStateByComponentId: any;
  navigatorContentElement: any;
  navigatorElement: any;
  onGlobalColorPickerHexTextInputInput: any;
  onSessionsRevokeOthersConfirmButtonClick: any;
  pageSelectElement: any;
  panelFrameInspectorFormElement: any;
  popupActionsButtonElement: any;
  popupListElement: any;
  popupModuleClimateDeviceTypeElement: any;
  popupModuleDialogElement: any;
  popupModuleDialogTitleElement: any;
  popupModuleEntityButtonElement: any;
  popupModuleEntityMenuElement: any;
  popupModuleEntityOptionsElement: any;
  popupModuleEntitySearchElement: any;
  popupModuleFormElement: any;
  popupSelectElement: any;
  readEffectNaturalSize: any;
  recoveryDialogElement: any;
  reloadAssetCatalog: any;
  removedComponent: any;
  renderComponentLists: any;
  renderLightStatisticsIconPreview: any;
  renderNavigationIconPreview: any;
  renderPopupEntityOptions: any;
  renderTitleButtonIconPreview: any;
  requestJson: any;
  resizeWorkspaceCanvas: any;
  runAlt: any;
  runAltOuter: any;
  runAmount: any;
  runAuxAlt: any;
  runAuxLower: any;
  runBackup: any;
  runCursor: any;
  runExtraFallback: any;
  runExtraLeft: any;
  runExtraLower: any;
  runExtraPeer: any;
  runLimit: any;
  runLocal: any;
  runMode: any;
  runQueue: any;
  runShadow: any;
  runSnapshot: any;
  runZone: any;
  selectableEntities: any;
  setComponentsRotation: any;
  setEditorMode: any;
  stopHoverScroll: any;
  structureVolatileTypesSet: any;
  syncAirConditionerInspector: any;
  syncCameraInspector: any;
  syncComponentActionControls: any;
  syncEffectAssetSelection: any;
  syncEventLogWallInspector: any;
  syncIconButtonInspector: any;
  syncImageAssetSelection: any;
  syncLightStatisticsInspector: any;
  syncLineChartInspector: any;
  syncNavigationInspector: any;
  syncPanelFrameInspector: any;
  syncPopupEntityButton: any;
  syncRendererSelection: any;
  syncTimeInspector: any;
  syncTitleButtonInspector: any;
  syncVacuumMapInspector: any;
  syncWeatherInspector: any;
  timeInspectorElement: any;
  titleButtonActionControlsElement: any;
  titleButtonApplyCountElement: any;
  titleButtonApplyStyleElement: any;
  titleButtonEntityMenuElement: any;
  titleButtonFrameColorElement: any;
  titleButtonFrameOffsetXElement: any;
  titleButtonFrameOffsetYElement: any;
  titleButtonFrameSizeElement: any;
  titleButtonFrameSpacingElement: any;
  titleButtonFrameVisibleElement: any;
  titleButtonFrameWidthElement: any;
  titleButtonHeightElement: any;
  titleButtonIconColorElement: any;
  titleButtonIconLeftElement: any;
  titleButtonIconMenuElement: any;
  titleButtonIconSizeElement: any;
  titleButtonIconTopElement: any;
  titleButtonIconVisibleElement: any;
  titleButtonInspectorElement: any;
  titleButtonLabelElement: any;
  titleButtonLeftElement: any;
  titleButtonMainColorElement: any;
  titleButtonMainLeftElement: any;
  titleButtonMainSizeElement: any;
  titleButtonMainSpacingElement: any;
  titleButtonMainTextElement: any;
  titleButtonMainTopElement: any;
  titleButtonMainVisibleElement: any;
  titleButtonMainWeightElement: any;
  titleButtonMarkerColorElement: any;
  titleButtonMarkerLeftElement: any;
  titleButtonMarkerSizeElement: any;
  titleButtonMarkerTopElement: any;
  titleButtonMarkerVisibleElement: any;
  titleButtonRotationElement: any;
  titleButtonScaleElement: any;
  titleButtonSecondaryColorElement: any;
  titleButtonSecondaryLeftElement: any;
  titleButtonSecondaryLine1Element: any;
  titleButtonSecondaryLine2Element: any;
  titleButtonSecondaryLineGapElement: any;
  titleButtonSecondarySizeElement: any;
  titleButtonSecondarySpacingElement: any;
  titleButtonSecondaryTopElement: any;
  titleButtonSecondaryVisibleElement: any;
  titleButtonSecondaryWeightElement: any;
  titleButtonTopElement: any;
  titleButtonWidthElement: any;
  vacuumMapEntityMenuElement: any;
  vacuumMapInspectorElement: any;
  vacuumMapLabelElement: any;
  vacuumMapLeftElement: any;
  vacuumMapOpacityElement: any;
  vacuumMapRotationElement: any;
  vacuumMapScaleElement: any;
  vacuumMapTopElement: any;
  weatherInspectorElement: any;
  writeError: any;
}

export function buildTitleButtonInspectorContext(deps: InspectorContextsDeps) {
  return {
    get activeProject() {
      return deps.editorCtx.activeProject;
    },
    get selectedComponentIdsSet() {
      return deps.editorCtx.selectedComponentIdsSet;
    },
    titleButtonLabelElement: deps.titleButtonLabelElement,
    runExtraFallback: deps.runExtraFallback,
    titleButtonMainVisibleElement: deps.titleButtonMainVisibleElement,
    titleButtonSecondaryVisibleElement: deps.titleButtonSecondaryVisibleElement,
    titleButtonFrameVisibleElement: deps.titleButtonFrameVisibleElement,
    titleButtonIconVisibleElement: deps.titleButtonIconVisibleElement,
    titleButtonMainTextElement: deps.titleButtonMainTextElement,
    titleButtonSecondaryLine1Element: deps.titleButtonSecondaryLine1Element,
    titleButtonSecondaryLine2Element: deps.titleButtonSecondaryLine2Element,
    titleButtonMainColorElement: deps.titleButtonMainColorElement,
    titleButtonSecondaryColorElement: deps.titleButtonSecondaryColorElement,
    titleButtonMainSizeElement: deps.titleButtonMainSizeElement,
    titleButtonSecondarySizeElement: deps.titleButtonSecondarySizeElement,
    titleButtonMainWeightElement: deps.titleButtonMainWeightElement,
    titleButtonSecondaryWeightElement: deps.titleButtonSecondaryWeightElement,
    titleButtonMainSpacingElement: deps.titleButtonMainSpacingElement,
    titleButtonSecondarySpacingElement: deps.titleButtonSecondarySpacingElement,
    titleButtonSecondaryLineGapElement: deps.titleButtonSecondaryLineGapElement,
    titleButtonMainLeftElement: deps.titleButtonMainLeftElement,
    titleButtonMainTopElement: deps.titleButtonMainTopElement,
    titleButtonSecondaryLeftElement: deps.titleButtonSecondaryLeftElement,
    titleButtonSecondaryTopElement: deps.titleButtonSecondaryTopElement,
    renderLightStatisticsIconPreview: deps.renderLightStatisticsIconPreview,
    titleButtonIconColorElement: deps.titleButtonIconColorElement,
    titleButtonIconSizeElement: deps.titleButtonIconSizeElement,
    titleButtonIconLeftElement: deps.titleButtonIconLeftElement,
    titleButtonIconTopElement: deps.titleButtonIconTopElement,
    titleButtonFrameColorElement: deps.titleButtonFrameColorElement,
    titleButtonFrameWidthElement: deps.titleButtonFrameWidthElement,
    titleButtonFrameSizeElement: deps.titleButtonFrameSizeElement,
    titleButtonFrameSpacingElement: deps.titleButtonFrameSpacingElement,
    titleButtonFrameOffsetXElement: deps.titleButtonFrameOffsetXElement,
    titleButtonFrameOffsetYElement: deps.titleButtonFrameOffsetYElement,
    titleButtonMarkerColorElement: deps.titleButtonMarkerColorElement,
    titleButtonMarkerSizeElement: deps.titleButtonMarkerSizeElement,
    titleButtonMarkerLeftElement: deps.titleButtonMarkerLeftElement,
    titleButtonMarkerTopElement: deps.titleButtonMarkerTopElement,
    titleButtonMarkerVisibleElement: deps.titleButtonMarkerVisibleElement,
    titleButtonLeftElement: deps.titleButtonLeftElement,
    titleButtonTopElement: deps.titleButtonTopElement,
    titleButtonWidthElement: deps.titleButtonWidthElement,
    titleButtonHeightElement: deps.titleButtonHeightElement,
    titleButtonScaleElement: deps.titleButtonScaleElement,
    titleButtonRotationElement: deps.titleButtonRotationElement,
    findReplaceableComponents: deps.findReplaceableComponents,
    runAltOuter: deps.runAltOuter,
    titleButtonApplyStyleElement: deps.titleButtonApplyStyleElement,
    titleButtonApplyCountElement: deps.titleButtonApplyCountElement,
    syncComponentActionControls: deps.syncComponentActionControls,
    titleButtonActionControlsElement: deps.titleButtonActionControlsElement,
  };
}

export function syncTitleButtonInspector(deps: InspectorContextsDeps, titleButtonComponent: any) {
  syncTitleButtonInspectorExternal(deps.buildTitleButtonInspectorContext(), titleButtonComponent);
}

export function buildLightStatisticsInspectorContext(deps: InspectorContextsDeps) {
  return {
    get activeProject() {
      return deps.editorCtx.activeProject;
    },
    get statisticsComponentId() {
      return deps.editorCtx.statisticsComponentId;
    },
    set statisticsComponentId(value: any) {
      deps.editorCtx.statisticsComponentId = value;
    },
    runLimit: deps.runLimit,
    lightStatisticsLabelElement: deps.lightStatisticsLabelElement,
    lightStatisticsTitleElement: deps.lightStatisticsTitleElement,
    runExtraFallback: deps.runExtraFallback,
    lightStatisticsIconVisibleElement: deps.lightStatisticsIconVisibleElement,
    lightStatisticsTitleVisibleElement: deps.lightStatisticsTitleVisibleElement,
    lightStatisticsCountVisibleElement: deps.lightStatisticsCountVisibleElement,
    runLocal: deps.runLocal,
    lightStatisticsIconColorElement: deps.lightStatisticsIconColorElement,
    lightStatisticsIconActiveColorElement: deps.lightStatisticsIconActiveColorElement,
    lightStatisticsIconSizeElement: deps.lightStatisticsIconSizeElement,
    lightStatisticsTitleColorElement: deps.lightStatisticsTitleColorElement,
    lightStatisticsTitleSizeElement: deps.lightStatisticsTitleSizeElement,
    lightStatisticsTitleWeightElement: deps.lightStatisticsTitleWeightElement,
    lightStatisticsTitleSpacingElement: deps.lightStatisticsTitleSpacingElement,
    lightStatisticsCountColorElement: deps.lightStatisticsCountColorElement,
    lightStatisticsCountActiveColorElement: deps.lightStatisticsCountActiveColorElement,
    lightStatisticsCountSizeElement: deps.lightStatisticsCountSizeElement,
    lightStatisticsCountWeightElement: deps.lightStatisticsCountWeightElement,
    lightStatisticsCountSpacingElement: deps.lightStatisticsCountSpacingElement,
    lightStatisticsIconGapElement: deps.lightStatisticsIconGapElement,
    lightStatisticsCountGapElement: deps.lightStatisticsCountGapElement,
    lightStatisticsLeftElement: deps.lightStatisticsLeftElement,
    lightStatisticsTopElement: deps.lightStatisticsTopElement,
    lightStatisticsWidthElement: deps.lightStatisticsWidthElement,
    lightStatisticsHeightElement: deps.lightStatisticsHeightElement,
    lightStatisticsScaleElement: deps.lightStatisticsScaleElement,
    lightStatisticsRotationElement: deps.lightStatisticsRotationElement,
    get selectedComponentIdsSet() {
      return deps.editorCtx.selectedComponentIdsSet;
    },
    runBackup: deps.runBackup,
    lightStatisticsEntityButtonElement: deps.lightStatisticsEntityButtonElement,
    statisticsReplaceIndex: deps.editorCtx.statisticsReplaceIndex,
    runZone: deps.runZone,
    lightStatisticsEntityMenuElement: deps.lightStatisticsEntityMenuElement,
    runAmount: deps.runAmount,
    lightStatisticsEntitySearchElement: deps.lightStatisticsEntitySearchElement,
    syncComponentActionControls: deps.syncComponentActionControls,
    lightStatisticsActionControlsElement: deps.lightStatisticsActionControlsElement,
  };
}

export function syncLightStatisticsInspector(deps: InspectorContextsDeps, lightStatisticsComponent: any) {
  syncLightStatisticsInspectorExternal(
    deps.buildLightStatisticsInspectorContext(),
    lightStatisticsComponent,
  );
}

export function buildCameraInspectorContext(deps: InspectorContextsDeps) {
  return {
    get activeProject() {
      return deps.editorCtx.activeProject;
    },
    cameraLabelElement: deps.cameraLabelElement,
    runExtraFallback: deps.runExtraFallback,
    cameraMediaVisibleElement: deps.cameraMediaVisibleElement,
    cameraSourceOptionsElement: deps.cameraSourceOptionsElement,
    cameraEntityPickerElement: deps.cameraEntityPickerElement,
    cameraGo2rtcUrlFieldElement: deps.cameraGo2rtcUrlFieldElement,
    cameraGo2rtcUrlElement: deps.cameraGo2rtcUrlElement,
    cameraGo2rtcNoteElement: deps.cameraGo2rtcNoteElement,
    cameraDisplayModeOptionsElement: deps.cameraDisplayModeOptionsElement,
    cameraRefreshIntervalElement: deps.cameraRefreshIntervalElement,
    cameraRefreshIntervalFieldElement: deps.cameraRefreshIntervalFieldElement,
    cameraFitOptionsElement: deps.cameraFitOptionsElement,
    cameraFrameVisibleElement: deps.cameraFrameVisibleElement,
    cameraFrameColorElement: deps.cameraFrameColorElement,
    cameraFrameWidthElement: deps.cameraFrameWidthElement,
    cameraRadiusElement: deps.cameraRadiusElement,
    cameraFrameAngleElement: deps.cameraFrameAngleElement,
    cameraFrameOpacityElement: deps.cameraFrameOpacityElement,
    cameraLeftElement: deps.cameraLeftElement,
    cameraTopElement: deps.cameraTopElement,
    cameraWidthElement: deps.cameraWidthElement,
    cameraHeightElement: deps.cameraHeightElement,
    cameraScaleElement: deps.cameraScaleElement,
    cameraRotationElement: deps.cameraRotationElement,
    get selectedComponentIdsSet() {
      return deps.editorCtx.selectedComponentIdsSet;
    },
    findReplaceableComponents: deps.findReplaceableComponents,
    runAuxLower: deps.runAuxLower,
    cameraApplyStyleElement: deps.cameraApplyStyleElement,
    cameraApplyCountElement: deps.cameraApplyCountElement,
    syncComponentActionControls: deps.syncComponentActionControls,
    cameraActionControlsElement: deps.cameraActionControlsElement,
    // 摄像头检查器的写属性控件交互在 `home-camera-inspector.ts` 里挂（宿主只减不增）。
    mutateDocument: deps.mutateDocument,
    findComponent: findComponent2,
    getSelectedComponentId: () => deps.editorCtx.selectedComponentId,
  };
}

export function syncCameraInspector(deps: InspectorContextsDeps, cameraComponent: any) {
  syncCameraInspectorExternal(deps.buildCameraInspectorContext(), cameraComponent);
}

export function buildVacuumMapInspectorContext(deps: InspectorContextsDeps) {
  return {
    get activeProject() {
      return deps.editorCtx.activeProject;
    },
    vacuumMapLabelElement: deps.vacuumMapLabelElement,
    runExtraFallback: deps.runExtraFallback,
    vacuumMapOpacityElement: deps.vacuumMapOpacityElement,
    vacuumMapLeftElement: deps.vacuumMapLeftElement,
    vacuumMapTopElement: deps.vacuumMapTopElement,
    vacuumMapScaleElement: deps.vacuumMapScaleElement,
    vacuumMapRotationElement: deps.vacuumMapRotationElement,
  };
}

export function syncVacuumMapInspector(deps: InspectorContextsDeps, vacuumMapComponent: any) {
  syncVacuumMapInspectorExternal(deps.buildVacuumMapInspectorContext(), vacuumMapComponent);
}

export function buildCoverMotorInspectorContext(deps: InspectorContextsDeps): CoverMotorInspectorContext {
  return {
    activeProject: deps.editorCtx.activeProject,
    airConditionerEntityMenuElement: deps.airConditionerEntityMenuElement,
    airConditionerInspectorElement: deps.airConditionerInspectorElement,
    airConditionerPreviewStateByComponentId: deps.airConditionerPreviewStateByComponentId,
    cameraEntityMenuElement: deps.cameraEntityMenuElement,
    cameraInspectorElement: deps.cameraInspectorElement,
    componentActionControlsElement: deps.componentActionControlsElement,
    coverSettingsDirectionElement: deps.coverSettingsDirectionElement,
    coverSettingsInspectorElement: deps.coverSettingsInspectorElement,
    coverSettingsKindElement: deps.coverSettingsKindElement,
    coverSettingsMotorDirectionElement: deps.coverSettingsMotorDirectionElement,
    dateInspectorElement: deps.dateInspectorElement,
    destroyDashboardPreview: deps.destroyDashboardPreview,
    displayDeviceCountElement: deps.displayDeviceCountElement,
    editorCanvasElement: deps.editorCanvasElement,
    editorMode: deps.editorCtx.editorMode,
    editorPickers: deps.editorPickers,
    editorRenderer: deps.editorCtx.editorRenderer,
    entities: deps.editorCtx.entities,
    eventLogWallInspectorElement: deps.eventLogWallInspectorElement,
    findReplaceableComponents: deps.findReplaceableComponents,
    floorplanAutoDiagramBindingListElement: deps.floorplanAutoDiagramBindingListElement,
    floorplanAutoDiagramBindingsElement: deps.floorplanAutoDiagramBindingsElement,
    floorplanAutoDiagramCameraModeElement: deps.floorplanAutoDiagramCameraModeElement,
    floorplanAutoDiagramCameraViewElement: deps.floorplanAutoDiagramCameraViewElement,
    floorplanAutoDiagramFloorSelectElement: deps.floorplanAutoDiagramFloorSelectElement,
    floorplanAutoDiagramFocalLengthInputElement: deps.floorplanAutoDiagramFocalLengthInputElement,
    floorplanAutoDiagramFolderTextInputElement: deps.floorplanAutoDiagramFolderTextInputElement,
    floorplanAutoDiagramHeightInputElement: deps.floorplanAutoDiagramHeightInputElement,
    floorplanAutoDiagramInspectorFormElement: deps.floorplanAutoDiagramInspectorFormElement,
    floorplanAutoDiagramLabelTextInputElement: deps.floorplanAutoDiagramLabelTextInputElement,
    floorplanAutoDiagramLayoutElement: deps.floorplanAutoDiagramLayoutElement,
    floorplanAutoDiagramLeftInputElement: deps.floorplanAutoDiagramLeftInputElement,
    floorplanAutoDiagramOpenBaseLightingButtonElement: deps.floorplanAutoDiagramOpenBaseLightingButtonElement,
    floorplanAutoDiagramOpenStudioButtonElement: deps.floorplanAutoDiagramOpenStudioButtonElement,
    floorplanAutoDiagramRotateTopButtonElement: deps.floorplanAutoDiagramRotateTopButtonElement,
    floorplanAutoDiagramRotationInputElement: deps.floorplanAutoDiagramRotationInputElement,
    floorplanAutoDiagramScaleInputElement: deps.floorplanAutoDiagramScaleInputElement,
    floorplanAutoDiagramStateByComponentId: deps.floorplanAutoDiagramStateByComponentId,
    floorplanAutoDiagramStatusElement: deps.floorplanAutoDiagramStatusElement,
    floorplanAutoDiagramTopInputElement: deps.floorplanAutoDiagramTopInputElement,
    floorplanAutoDiagramViewToggleButtonElement: deps.floorplanAutoDiagramViewToggleButtonElement,
    floorplanAutoDiagramWidthInputElement: deps.floorplanAutoDiagramWidthInputElement,
    formatLastSeen: deps.formatLastSeen,
    handleOperationError: deps.handleOperationError,
    hasActiveProject: deps.hasActiveProject,
    ibeActionControlsElement: deps.ibeActionControlsElement,
    ibeActionSectionElement: deps.ibeActionSectionElement,
    ibeApplyCountElement: deps.ibeApplyCountElement,
    ibeApplyStyleElement: deps.ibeApplyStyleElement,
    ibeAssetMenuElement: deps.ibeAssetMenuElement,
    ibeBrightnessRealtimeElement: deps.ibeBrightnessRealtimeElement,
    ibeButtonOffColorElement: deps.ibeButtonOffColorElement,
    ibeButtonOnColorElement: deps.ibeButtonOnColorElement,
    ibeButtonOpacityElement: deps.ibeButtonOpacityElement,
    ibeButtonSectionElement: deps.ibeButtonSectionElement,
    ibeButtonTransformSectionElement: deps.ibeButtonTransformSectionElement,
    ibeButtonVisibleElement: deps.ibeButtonVisibleElement,
    ibeColorTemperatureRealtimeElement: deps.ibeColorTemperatureRealtimeElement,
    ibeEffectFadeDurationElement: deps.ibeEffectFadeDurationElement,
    ibeEffectLayoutOptionsElement: deps.ibeEffectLayoutOptionsElement,
    ibeEffectLeftElement: deps.ibeEffectLeftElement,
    ibeEffectOpacityElement: deps.ibeEffectOpacityElement,
    ibeEffectRotationElement: deps.ibeEffectRotationElement,
    ibeEffectScaleElement: deps.ibeEffectScaleElement,
    ibeEffectSectionElement: deps.ibeEffectSectionElement,
    ibeEffectSizeHintElement: deps.ibeEffectSizeHintElement,
    ibeEffectTopElement: deps.ibeEffectTopElement,
    ibeEffectVisibleElement: deps.ibeEffectVisibleElement,
    ibeEntityMenuElement: deps.ibeEntityMenuElement,
    ibeFrameColorElement: deps.ibeFrameColorElement,
    ibeFrameOpacityElement: deps.ibeFrameOpacityElement,
    ibeFrameWidthElement: deps.ibeFrameWidthElement,
    ibeGlowColorElement: deps.ibeGlowColorElement,
    ibeGlowOffStrengthElement: deps.ibeGlowOffStrengthElement,
    ibeGlowOnStrengthElement: deps.ibeGlowOnStrengthElement,
    ibeHeightElement: deps.ibeHeightElement,
    ibeIconMenuElement: deps.ibeIconMenuElement,
    ibeIconOffColorElement: deps.ibeIconOffColorElement,
    ibeIconOnColorElement: deps.ibeIconOnColorElement,
    ibeIconSizeElement: deps.ibeIconSizeElement,
    ibeLabelElement: deps.ibeLabelElement,
    ibeLayerOptionsElement: deps.ibeLayerOptionsElement,
    ibeLeftElement: deps.ibeLeftElement,
    ibePreviewStateElement: deps.ibePreviewStateElement,
    ibeRadiusElement: deps.ibeRadiusElement,
    ibeRotationElement: deps.ibeRotationElement,
    ibeScaleElement: deps.ibeScaleElement,
    ibeTopElement: deps.ibeTopElement,
    ibeWidthElement: deps.ibeWidthElement,
    iconButtonEffectInspectorElement: deps.iconButtonEffectInspectorElement,
    iconButtonEffectLayerByComponentId: deps.iconButtonEffectLayerByComponentId,
    iconButtonEffectPreviewStateByComponentId: deps.iconButtonEffectPreviewStateByComponentId,
    iconButtonEntityMenuElement: deps.iconButtonEntityMenuElement,
    iconButtonIconMenuElement: deps.iconButtonIconMenuElement,
    iconButtonInspectorElement: deps.iconButtonInspectorElement,
    iconButtonPreviewStateByComponentId: deps.iconButtonPreviewStateByComponentId,
    imageAssetPointerOverEvent: deps.imageAssetPointerOverEvent,
    imageInspectorElement: deps.imageInspectorElement,
    imageLabelElement: deps.imageLabelElement,
    imageLayoutOptionsElement: deps.imageLayoutOptionsElement,
    imageLeftInputElement: deps.imageLeftInputElement,
    imageOpacityInputElement: deps.imageOpacityInputElement,
    imageRotationInputElement: deps.imageRotationInputElement,
    imageScaleInputElement: deps.imageScaleInputElement,
    imageTopInputElement: deps.imageTopInputElement,
    imageTypeElement: deps.imageTypeElement,
    inspectorEmptyElement: deps.inspectorEmptyElement,
    lightStatisticsActionEntityMenuElement: deps.lightStatisticsActionEntityMenuElement,
    lightStatisticsEntityMenuElement: deps.lightStatisticsEntityMenuElement,
    lightStatisticsIconMenuElement: deps.lightStatisticsIconMenuElement,
    lightStatisticsInspectorElement: deps.lightStatisticsInspectorElement,
    lineChartInspectorElement: deps.lineChartInspectorElement,
    loadNavigationIconOptions: deps.loadNavigationIconOptions,
    mutateDocument: deps.mutateDocument,
    navigationIconMenuElement: deps.navigationIconMenuElement,
    navigationInspectorFormElement: deps.navigationInspectorFormElement,
    navigationLabelTextInputElement: deps.navigationLabelTextInputElement,
    navigationPreviewStateByComponentId: deps.navigationPreviewStateByComponentId,
    navigatorContentElement: deps.navigatorContentElement,
    navigatorElement: deps.navigatorElement,
    onGlobalColorPickerHexTextInputInput: deps.onGlobalColorPickerHexTextInputInput,
    onSessionsRevokeOthersConfirmButtonClick: deps.onSessionsRevokeOthersConfirmButtonClick,
    pageSelectElement: deps.pageSelectElement,
    panelFrameInspectorFormElement: deps.panelFrameInspectorFormElement,
    readEffectNaturalSize: deps.readEffectNaturalSize,
    removedComponent: deps.removedComponent,
    renderComponentLists: deps.renderComponentLists,
    renderNavigationIconPreview: deps.renderNavigationIconPreview,
    renderTitleButtonIconPreview: deps.renderTitleButtonIconPreview,
    resizeWorkspaceCanvas: deps.resizeWorkspaceCanvas,
    runAuxAlt: deps.runAuxAlt,
    runExtraFallback: deps.runExtraFallback,
    runExtraPeer: deps.runExtraPeer,
    runMode: deps.runMode,
    runShadow: deps.runShadow,
    selectableEntities: deps.selectableEntities,
    selectedComponentIdsSet: deps.editorCtx.selectedComponentIdsSet,
    setComponentsRotation: deps.setComponentsRotation,
    setEditorMode: deps.setEditorMode,
    stopHoverScroll: deps.stopHoverScroll,
    syncAirConditionerInspector: deps.syncAirConditionerInspector,
    syncCameraInspector: deps.syncCameraInspector,
    syncComponentActionControls: deps.syncComponentActionControls,
    syncEffectAssetSelection: deps.syncEffectAssetSelection,
    syncEventLogWallInspector: deps.syncEventLogWallInspector,
    syncIconButtonInspector: deps.syncIconButtonInspector,
    syncImageAssetSelection: deps.syncImageAssetSelection,
    syncLightStatisticsInspector: deps.syncLightStatisticsInspector,
    syncLineChartInspector: deps.syncLineChartInspector,
    syncNavigationInspector: deps.syncNavigationInspector,
    syncPanelFrameInspector: deps.syncPanelFrameInspector,
    syncRendererSelection: deps.syncRendererSelection,
    syncTimeInspector: deps.syncTimeInspector,
    syncTitleButtonInspector: deps.syncTitleButtonInspector,
    syncVacuumMapInspector: deps.syncVacuumMapInspector,
    syncWeatherInspector: deps.syncWeatherInspector,
    timeInspectorElement: deps.timeInspectorElement,
    titleButtonEntityMenuElement: deps.titleButtonEntityMenuElement,
    titleButtonIconMenuElement: deps.titleButtonIconMenuElement,
    titleButtonInspectorElement: deps.titleButtonInspectorElement,
    vacuumMapEntityMenuElement: deps.vacuumMapEntityMenuElement,
    vacuumMapInspectorElement: deps.vacuumMapInspectorElement,
    weatherInspectorElement: deps.weatherInspectorElement,
  };
}

export function coverMotorButtonElement(deps: InspectorContextsDeps) {
  coverMotorButtonElementSync(deps.buildCoverMotorInspectorContext());
}

export function computeCoverMotorStyleChanges(deps: InspectorContextsDeps, component: any) {
  return runExtraLocalCover(deps.buildCoverMotorInspectorContext(), component);
}

export async function reloadAssetCatalog(deps: InspectorContextsDeps, { refreshInspector: refreshInspector = true } = {}) {
  const [all, all2] = await Promise.all([
    deps.requestJson("/assets/builtin?_=" + Date.now()),
    deps.requestJson("/assets/user?_=" + Date.now()),
  ]);
  ((deps.editorCtx.userAssetsState = all.items || []),
    (deps.editorCtx.userAssets = all2.items || []),
    (deps.editorCtx.catalogVersionSignature = (all.catalogVersion || "") + ":" + (all2.catalogVersion || "")));
  const didVersionsChange = setBuiltinAssetVersions2(deps.allAssets());
  return (
    didVersionsChange &&
      (deps.editorCtx.editorRenderer?.renderComponents(true), deps.editorCtx.dashboardPreviewRenderer?.renderComponents(true)),
    refreshInspector && deps.coverMotorButtonElement(),
    didVersionsChange
  );
}

export async function pollAssetCatalogVersion(deps: InspectorContextsDeps) {
  const versionResponse = await deps.requestJson("/assets/version"),
    versionSignature = (versionResponse.builtin || "") + ":" + (versionResponse.user || "");
  deps.editorCtx.catalogVersionSignature !== versionSignature &&
    (await deps.reloadAssetCatalog({
      refreshInspector: true,
    }));
}

export async function ensureEntitiesLoaded(deps: InspectorContextsDeps, { afterCurrent: waitForCurrent = false } = {}): Promise<any> {
  return deps.editorCtx.entitiesLoadPromise
    ? waitForCurrent
      ? (await deps.editorCtx.entitiesLoadPromise, ensureEntitiesLoaded(deps))
      : deps.editorCtx.entitiesLoadPromise
    : ((deps.editorCtx.entitiesLoadPromise = (async () => {
        const collectedEntities: any[] = [];
        let entityOffset = 0,
          entityTotal = 0;
        do {
          const entitiesResponse = await deps.requestJson(
            "/ha/entities?limit=500&offset=" + entityOffset,
          );
          (collectedEntities.push(...(entitiesResponse.items || [])),
            (entityTotal = Number(entitiesResponse.total || 0)),
            (entityOffset += Number(entitiesResponse.limit || 500)));
        } while (collectedEntities.length < entityTotal);
        deps.editorCtx.entities = collectedEntities.filter(
          (filteredItemsConfig) => filteredItemsConfig.status !== "missing",
        );
        const [all3, all4] = await Promise.all([
          deps.requestJson("/ha/devices").catch(() => ({
            items: [] as any[],
          })),
          deps.requestJson("/ha/translations").catch(() => ({
            resources: {} as Record<string, any>,
          })),
        ]);
        ((deps.editorCtx.devices = all3?.items || []),
          (deps.editorCtx.deviceNamesByDeviceId = new Map(
            deps.editorCtx.devices
              .map((mappedItemsCache: any) => [
                String(mappedItemsCache.deviceId || ""),
                deps.runCursor(mappedItemsCache.name),
              ] as const)
              .filter(
                ([entitiesResponseState, entitiesResponseValue]: any) =>
                  entitiesResponseState && entitiesResponseValue,
              ),
          )),
          (deps.editorCtx.entityResourcesByDeviceId = all4?.resources || {}),
          (deps.editorCtx.isAreEntitiesLoaded = true));
        const mappedItemByIdById = new Map(
            nasProfiles2(deps.editorCtx.entities, deps.editorCtx.devices).map((mappedItemsQueue) => [
              mappedItemsQueue.deviceId,
              mappedItemsQueue,
            ]),
          ),
          entitiesResponseConfig = reconcileNasDocument2(
            deps.editorCtx.activeProject?.document,
            mappedItemByIdById,
          ),
          devicesResponseState = reconcileNasDocument2(deps.editorCtx.baselineDocument, mappedItemByIdById);
        deps.editorCtx.savedDocumentSignature = documentSignature2(deps.editorCtx.baselineDocument);
        for (const translationsResponse of [...deps.historyState.undo, ...deps.historyState.redo])
          for (const deviceState of ["document", "beforeSavedDocument", "afterSavedDocument"])
            reconcileNasDocument2(translationsResponse[deviceState], mappedItemByIdById);
        if (deps.editorCtx.recoverySnapshot) {
          reconcileNasDocument2(deps.editorCtx.recoverySnapshot.document, mappedItemByIdById);
          for (const deviceIdKey of [
            ...(deps.editorCtx.recoverySnapshot.undo || []),
            ...(deps.editorCtx.recoverySnapshot.redo || []),
          ])
            for (const deviceNameValueState of [
              "document",
              "beforeSavedDocument",
              "afterSavedDocument",
            ])
              reconcileNasDocument2(deviceIdKey[deviceNameValueState], mappedItemByIdById);
          documentSignature2(deps.editorCtx.recoverySnapshot.document) === deps.editorCtx.savedDocumentSignature &&
            (deps.discardRecoverySnapshot(deps.editorCtx.activeProject.projectId),
            (deps.editorCtx.recoverySnapshot = null),
            deps.recoveryDialogElement.open && deps.recoveryDialogElement.close());
        }
        (deps.editorCtx.editorRenderer?.setEntityCatalog(deps.editorCtx.entities, deps.editorCtx.entityResourcesByDeviceId, deps.editorCtx.devices),
          deps.editorCtx.dashboardPreviewRenderer?.setEntityCatalog(deps.editorCtx.entities, deps.editorCtx.entityResourcesByDeviceId, deps.editorCtx.devices),
          deps.runExtraLower(),
          (entitiesResponseConfig || devicesResponseState) &&
            deps.writeError({
              preserveRecovery: !!deps.editorCtx.recoverySnapshot,
            }),
          document.activeElement?.closest?.(".inspector-form") || deps.coverMotorButtonElement());
      })().finally(() => {
        deps.editorCtx.entitiesLoadPromise = null;
      })),
      deps.editorCtx.entitiesLoadPromise);
}

export function renderCustomPopupSelector(deps: InspectorContextsDeps, popupData: any, catalogEntityRecord = deps.editorCtx.selectedPopupId) {
  const devicesResponse = popupData?.customPopups || [];
  if (
    (deps.popupSelectElement.replaceChildren(),
    deps.popupListElement.replaceChildren(),
    !devicesResponse.length)
  ) {
    ((deps.editorCtx.selectedPopupId = null),
      deps.popupSelectElement.append(new Option("暂无组合弹窗", "")),
      (deps.popupSelectElement.disabled = true),
      (deps.popupActionsButtonElement.disabled = true),
      deps.loadNavigationIconOptions(deps.popupSelectElement));
    const popupEmptyElement = document.createElement("div");
    ((popupEmptyElement.className = "popup-list-empty"),
      (popupEmptyElement.textContent = "还没有组合弹窗"),
      deps.popupListElement.append(popupEmptyElement));
    return;
  }
  for (const popupEntryState of devicesResponse)
    deps.popupSelectElement.append(new Option(popupEntryState.name, popupEntryState.id));
  ((deps.editorCtx.selectedPopupId = devicesResponse.some(
    (candidatePopupState: any) => candidatePopupState.id === catalogEntityRecord,
  )
    ? catalogEntityRecord
    : devicesResponse[0].id),
    (deps.popupSelectElement.value = deps.editorCtx.selectedPopupId),
    (deps.popupSelectElement.disabled = false),
    (deps.popupActionsButtonElement.disabled = false),
    deps.loadNavigationIconOptions(deps.popupSelectElement));
  for (const popupItemState of devicesResponse) {
    const popupItemButtonElement = document.createElement("button");
    ((popupItemButtonElement.type = "button"),
      (popupItemButtonElement.className =
        "popup-list-item" + (popupItemState.id === deps.editorCtx.selectedPopupId ? " selected" : "")),
      (popupItemButtonElement.dataset.popupId = popupItemState.id),
      popupItemButtonElement.setAttribute("role", "option"),
      popupItemButtonElement.setAttribute(
        "aria-selected",
        String(popupItemState.id === deps.editorCtx.selectedPopupId),
      ));
    const popupItemNameElementElement = document.createElement("span");
    popupItemNameElementElement.textContent = popupItemState.name;
    const popupItemMetaElementElement = document.createElement("small");
    ((popupItemMetaElementElement.textContent = (popupItemState.modules || []).length + " 个模块"),
      popupItemButtonElement.append(popupItemNameElementElement, popupItemMetaElementElement),
      deps.popupListElement.append(popupItemButtonElement));
  }
}

export function syncPopupEntityInputs(deps: InspectorContextsDeps) {
  for (const translationsResponseElementElement of document.querySelectorAll<HTMLInputElement>(
    "[data-popup-entity]",
  )) {
    const translationsResponseElementPanel =
      translationsResponseElementElement.closest("[data-action-trigger]");
    (!translationsResponseElementElement.value &&
      deps.editorCtx.entities[0]?.entityId &&
      (translationsResponseElementElement.value = deps.editorCtx.entities[0].entityId),
      deps.syncPopupEntityButton(translationsResponseElementPanel));
    const translationsResponseElement = translationsResponseElementPanel?.querySelector<HTMLElement>(
      "[data-popup-entity-menu]",
    );
    translationsResponseElement &&
      !translationsResponseElement.hidden &&
      deps.renderPopupEntityOptions(
        translationsResponseElementPanel,
        translationsResponseElementPanel!.querySelector<HTMLInputElement>("[data-popup-entity-search]")?.value || "",
      );
  }
}

export function syncPopupModuleClimateDeviceType(deps: InspectorContextsDeps, device = deps.popupModuleFormElement.elements.deviceType.value) {
  const isDevice = deps.popupModuleFormElement.elements.type.value === "climate",
    deviceIdKeyState = normalizedPopupClimateDeviceType2(device);
  ((deps.popupModuleClimateDeviceTypeElement.hidden = !isDevice),
    (deps.popupModuleFormElement.elements.deviceType.value = deviceIdKeyState));
  for (const deviceIdKeyElement of deps.popupModuleClimateDeviceTypeElement.querySelectorAll(
    "[data-popup-module-device-type]",
  )) {
    const isDeviceNameValue = deviceIdKeyElement.dataset.popupModuleDeviceType === deviceIdKeyState;
    (deviceIdKeyElement.classList.toggle("active", isDeviceNameValue),
      deviceIdKeyElement.setAttribute("aria-pressed", String(isDeviceNameValue)));
  }
}

export function deviceNameValue(deps: InspectorContextsDeps, renderPopupList: any) {
  return (
    deps.editorCtx.entities.find((sourceDocument: any) => sourceDocument.entityId === renderPopupList)?.name ||
    renderPopupList ||
    "未选择实体"
  );
}

export function initialPopupId(deps: InspectorContextsDeps) {
  const customPopupList = deps.popupModuleFormElement.elements.entityId.value,
    customPopupListState = deps.editorCtx.entities.find(
      (renderPopupListState: any) => renderPopupListState.entityId === customPopupList,
    ),
    customPopupListValue = customPopupListState
      ? "[" + deps.runQueue(customPopupListState) + "] " + deps.runSnapshot(customPopupListState)
      : customPopupList || "选择实体";
  (deps.runBackup(
    deps.popupModuleEntityButtonElement,
    customPopupListValue,
    customPopupList || customPopupListValue,
  ),
    (deps.popupModuleEntityButtonElement.dataset.entityId = customPopupList),
    deps.popupModuleEntityButtonElement._entityCopySync?.());
}

export function renderPopupModuleEntityOptions(deps: InspectorContextsDeps, query = deps.popupModuleEntitySearchElement.value) {
  const customPopupListConfig = deps.popupModuleFormElement.elements.entityId.value,
    popupEmptyElementState = String(query || "")
      .trim()
      .toLocaleLowerCase("zh-CN"),
    mappedItemsBuffer = deps.editorCtx.entities
      .map((mappedItemsCursor: any, mappedItemsPointer: any) => ({
        entity: mappedItemsCursor,
        index: mappedItemsPointer,
      }))
      .filter(
        ({ entity: popupEntryValue }: any) =>
          !popupEmptyElementState ||
          (deps.runMode(popupEntryValue) + " " + popupEntryValue.entityId)
            .toLocaleLowerCase("zh-CN")
            .includes(popupEmptyElementState),
      )
      .sort(
        (popupEntryConfig: any, popupEntry: any) =>
          Number(
            popupModuleEntityRecommended2(
              popupEntry.entity,
              deps.popupModuleFormElement.elements.type.value,
            ),
          ) -
            Number(
              popupModuleEntityRecommended2(
                popupEntryConfig.entity,
                deps.popupModuleFormElement.elements.type.value,
              ),
            ) || popupEntryConfig.index - popupEntry.index,
      )
      .map(({ entity: candidatePopup }: any) => candidatePopup);
  if (
    (renderEntityOptionButtons(deps.popupModuleEntityOptionsElement, mappedItemsBuffer, {
      selectedId: customPopupListConfig,
      datasetKey: "popupModuleEntityId",
      deps,
    }),
    !mappedItemsBuffer.length)
  ) {
    const popupItemMetaElement = document.createElement("div");
    ((popupItemMetaElement.className = "inspector-picker-empty"),
      (popupItemMetaElement.textContent = "没有匹配的实体"),
      deps.popupModuleEntityOptionsElement.append(popupItemMetaElement));
  }
}

export function closePopupModuleEntityMenu(deps: InspectorContextsDeps) {
  ((deps.popupModuleEntityMenuElement.hidden = true),
    deps.popupModuleEntityButtonElement.setAttribute("aria-expanded", "false"));
}

export function openPopupModuleDialog(deps: InspectorContextsDeps, popupModule: any = null) {
  if (!findCustomPopup2(deps.editorCtx.activeProject?.document, deps.editorCtx.selectedPopupId)) return;
  ((deps.editorCtx.selectedPopupModuleId = popupModule?.id || null),
    (deps.popupModuleDialogTitleElement.textContent = popupModule ? "编辑弹窗模块" : "添加弹窗模块"));
  const moduleTypeName = popupModule?.type === "capability-device" ? "generic" : popupModule?.type;
  ((deps.popupModuleFormElement.elements.type.value = [
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
    deps.loadNavigationIconOptions(deps.popupModuleFormElement.elements.type));
  const defaultEntity =
    deps.editorCtx.entities.find((entityCandidate: any) =>
      popupModuleEntityRecommended2(entityCandidate, deps.popupModuleFormElement.elements.type.value),
    ) || deps.editorCtx.entities[0];
  ((deps.popupModuleFormElement.elements.entityId.value =
    popupModule?.entityId || defaultEntity?.entityId || ""),
    (deps.popupModuleFormElement.elements.title.value = popupModule?.title || ""),
    deps.runExtraLeft(popupModule?.properties?.deviceType || popupModule?.deviceType || "auto"),
    (deps.popupModuleEntitySearchElement.value = ""),
    deps.initialPopupId(),
    deps.popupModuleEntityOptionsElement.replaceChildren(),
    deps.closePopupModuleEntityMenu(),
    deps.popupModuleDialogElement.showModal());
}

export function renderPageSelect(deps: InspectorContextsDeps, projectDocument: any, preferredPagePath: any = null) {
  if ((deps.pageSelectElement.replaceChildren(), !projectDocument.pages.length))
    return (
      deps.pageSelectElement.append(new Option("暂无页面", "")),
      (deps.pageSelectElement.disabled = true),
      deps.loadNavigationIconOptions(deps.pageSelectElement),
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
      deps.pageSelectElement.append(option));
  }
  return (
    (deps.pageSelectElement.disabled = false),
    (deps.pageSelectElement.value =
      preferredPagePath &&
      projectDocument.pages.some((pageCheck: any) => pageCheck.path === preferredPagePath)
        ? preferredPagePath
        : defaultPagePath || projectDocument.pages[0].path),
    deps.loadNavigationIconOptions(deps.pageSelectElement),
    true
  );
}

export function retainExistingSelection(deps: InspectorContextsDeps, documentToCheck: any, pagePathFilter: any) {
  const candidateSelectionIds = deps.editorCtx.selectedComponentIdsSet.size
    ? [...deps.editorCtx.selectedComponentIdsSet]
    : deps.editorCtx.selectedComponentId
      ? [deps.editorCtx.selectedComponentId]
      : [];
  ((deps.editorCtx.selectedComponentIdsSet = new Set(
    candidateSelectionIds.filter((componentIdCandidate) => {
      const candidateComponent = findComponent2(documentToCheck, componentIdCandidate);
      return (
        candidateComponent &&
        (candidateComponent.scope !== "page" || candidateComponent.page?.path === pagePathFilter)
      );
    }),
  )),
    deps.editorCtx.selectedComponentIdsSet.has(deps.editorCtx.selectedComponentId) ||
      (deps.editorCtx.selectedComponentId = deps.editorCtx.selectedComponentIdsSet.values().next().value || null),
    deps.editorCtx.selectedComponentId || (deps.editorCtx.selectionAnchorComponentId = null));
}

export function collectChangedComponents(deps: InspectorContextsDeps, previousDocument: any, nextDocument: any, pagePath: any) {
  if (
    deps.editorCtx.editorMode !== "edit" ||
    !deps.editorCtx.editorRenderer ||
    deps.editorCtx.editorRenderer.page?.path !== pagePath ||
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
      deps.structureVolatileTypesSet.has(previousEntry.component.type) ||
      editorComponentStructure2(previousEntry.component) !==
        editorComponentStructure2(nextEntry.component)
    )
      return null;
    const { children: component3, ...component4 } = previousEntry.component,
      { children: component5, ...component6 } = nextEntry.component;
    if (JSON.stringify(component4) !== JSON.stringify(component6)) {
      if (!deps.editorCtx.editorRenderer.componentHosts.has(componentIdKey)) {
        let ancestorEntry = nextEntry;
        for (; ancestorEntry.parentId;)
          ancestorEntry = nextEntries.entries.get(ancestorEntry.parentId);
        if (
          nextEntry.scope === "shared"
            ? (deps.editorCtx.editorRenderer.page.sharedComponentIds || []).includes(ancestorEntry.component.id)
            : nextEntry.pagePath === pagePath
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

