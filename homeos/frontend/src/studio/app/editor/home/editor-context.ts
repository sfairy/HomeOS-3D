/**
 * EditorContext —— `home.ts` 的 `arrow@217` 宿主闭包里可变状态的显式上下文。
 *
 * 由 `ops/studio/studio_state_context.mjs --emit-ctx` 依据宿主 `let` 声明生成（可手工润色）：
 * 字段顺序 / 类型 / 初值一一对应。**纯字面量初值**已搬进工厂；**初值依赖宿主作用域**的字段
 * 只放占位值（`undefined` / `false` / `0` / `""`），由宿主在**原 `let` 位置**写回真值，
 * 因此不会出现「先读到占位值」的窗口。
 *
 * 显式字段类型（禁止 `{[key:string]: any}` 开放袋子）。类型按「能精确就精确」推导：
 * 38/102 个字段是精确类型（原注解 / `ReturnType<typeof f>` / `InstanceType<typeof X>` / 字面量）；
 * 其余 64 个退 `any`：宿主里本就不自足（原文件自己的 `: any` 注解，或本地私有类型）。
 * **不要**把退化成 `any` 的 receiver 当小事 —— 宿主里 `ctx.x.items.map(cb)` 一旦 receiver 是 `any`，
 * `cb` 就退化成隐式 `any`（`TS7006`），精确类型的价值正是在这里。
 */
import type { normalizeBaseLighting as normalizeBaseLighting2 } from "../../3d-studio/loaders/studio-normalization";

export interface EditorContext {
  baseLightingComponentId: string;
  baseLightingSettings: ReturnType<typeof normalizeBaseLighting2>;
  lightingPanelDragStateState: any;
  lightingPanelDragState: any;
  lightingPanelDragFrame: number | null;
  lightingPanelDragPending: { x: number; y: number } | null;
  editorRenderer: any;
  dashboardPreviewRenderer: any;
  editorMode: string;
  projects: any;
  activeProject: any;
  activeProjectState: number;
  componentScopeState: number;
  componentScope: string;
  projectDialogMode: string;
  resizeWarningResolve: any;
  resizeWarningResolveState: string;
  isAspectLockedState: number;
  isAspectLockedValue: number;
  isAspectLocked: boolean;
  lockedCanvasWidthState: number;
  lockedCanvasWidth: number;
  lockedCanvasWidthValue: any;
  lockedCanvasHeightState: any;
  lockedCanvasHeight: number;
  pageDialogMode: string;
  selectedComponentId: any;
  activeGroupId: any;
  lastComponentClick: any;
  selectedPopupId: any;
  popupDialogMode: string;
  selectedPopupModuleId: any;
  moduleDialogPopupId: any;
  popupModuleDraft: any;
  pendingDeleteAssetId: any;
  pendingDeleteAssetFolder: any;
  userAssetsState: any;
  userAssets: any;
  catalogVersionSignature: any;
  entities: any;
  devices: any;
  deviceNamesByDeviceId: any;
  entityResourcesByDeviceId: Record<string, any>;
  entitiesLoadPromise: any;
  isAreEntitiesLoaded: boolean;
  lastConnectedSignature: any;
  writeQueuePromise: any;
  imageAssetFolderState: string;
  effectAssetFolderState: string;
  imageAssetFolder: string;
  effectAssetFolder: string;
  assetPreviewTimeoutId: any;
  navigationIconSearchDebounceTimeoutId: any;
  navigationIconCopiedTimeoutId: any;
  effectIconSearchDebounceTimeoutId: any;
  effectIconCopiedTimeoutId: any;
  deviceIconSearchDebounceTimeoutId: any;
  deviceIconCopiedTimeoutId: any;
  titleButtonIconSearchDebounceTimeoutId: any;
  titleButtonIconCopiedTimeoutId: any;
  lightStatisticsIconSearchDebounceTimeoutId: any;
  lightStatisticsIconCopiedTimeoutId: any;
  statisticsEntityId: string;
  statisticsReplaceIndex: number;
  statisticsComponentId: string;
  navigationApplyFeedbackTimeoutId: any;
  panelFrameApplyFeedbackTimeoutId: any;
  lineChartApplyFeedbackTimeoutId: any;
  effectApplyFeedbackTimeoutId: any;
  titleButtonApplyFeedbackTimeoutId: any;
  deviceButtonApplyFeedbackTimeoutId: any;
  cameraApplyFeedbackTimeoutId: any;
  airConditionerApplyFeedbackTimeoutId: any;
  /** 样式应用脉冲：一个按钮只保留一个 timeout（0.8.1 同款 Map，替代 8 个字段）。 */
  styleApplyPulseByButton: Map<Element, number> | null;
  appliedStyleRecord: any;
  imageAlignSourceComponentId: any;
  selectedComponentIdsSet: any;
  selectionAnchorComponentId: any;
  coverMotorDirectionValue: any;
  savedDocumentSignature: string;
  baselineDocument: any;
  hasUnsavedChanges: boolean;
  copyTargetDraft: any;
  copyTargetLoadToken: number;
  copySuccessNavigationTarget: any;
  isSaving: boolean;
  recoverySnapshot: any;
  menuComponentId: any;
  editorClipboardComponentIds: string[];
  editorCanvasZoom: number;
  editorSpacePanning: boolean;
  openCustomSelect: any;
  activeColorInputElement: HTMLInputElement | null;
  activeColorHex: string;
  colorPickerHue: number;
  colorPickerSaturation: number;
  colorPickerBrightness: number;
  colorPickerDragPointerId: any;
  colorPickerCopyResetTimer: any;
  lastLicenseFeatureSignature: any;
  marqueeState: any;
  iconTooltipElement: HTMLElement | null;
  popupBeingRenamedValue: any;
}

export function createEditorContext(): EditorContext {
  return {
    baseLightingComponentId: "",
    baseLightingSettings: undefined as unknown as ReturnType<typeof normalizeBaseLighting2>,
    lightingPanelDragStateState: null,
    lightingPanelDragState: null,
    lightingPanelDragFrame: null,
    lightingPanelDragPending: null,
    editorRenderer: null,
    dashboardPreviewRenderer: null,
    editorMode: "edit",
    projects: [],
    activeProject: null,
    activeProjectState: 0,
    componentScopeState: 0,
    componentScope: "shared",
    projectDialogMode: "create",
    resizeWarningResolve: null,
    resizeWarningResolveState: "homeos",
    isAspectLockedState: 2778,
    isAspectLockedValue: 1940,
    isAspectLocked: false,
    lockedCanvasWidthState: 2778,
    lockedCanvasWidth: 1940,
    lockedCanvasWidthValue: [],
    lockedCanvasHeightState: [],
    lockedCanvasHeight: 0,
    pageDialogMode: "create",
    selectedComponentId: null,
    activeGroupId: null,
    lastComponentClick: { componentId: null, at: 0, },
    selectedPopupId: null,
    popupDialogMode: "create",
    selectedPopupModuleId: null,
    moduleDialogPopupId: null,
    popupModuleDraft: null,
    pendingDeleteAssetId: null,
    pendingDeleteAssetFolder: null,
    userAssetsState: [],
    userAssets: [],
    catalogVersionSignature: null,
    entities: [],
    devices: [],
    deviceNamesByDeviceId: undefined,
    entityResourcesByDeviceId: {},
    entitiesLoadPromise: null,
    isAreEntitiesLoaded: false,
    lastConnectedSignature: null,
    writeQueuePromise: undefined,
    imageAssetFolderState: "",
    effectAssetFolderState: "",
    imageAssetFolder: "builtin",
    effectAssetFolder: "builtin",
    assetPreviewTimeoutId: null,
    navigationIconSearchDebounceTimeoutId: null,
    navigationIconCopiedTimeoutId: null,
    effectIconSearchDebounceTimeoutId: null,
    effectIconCopiedTimeoutId: null,
    deviceIconSearchDebounceTimeoutId: null,
    deviceIconCopiedTimeoutId: null,
    titleButtonIconSearchDebounceTimeoutId: null,
    titleButtonIconCopiedTimeoutId: null,
    lightStatisticsIconSearchDebounceTimeoutId: null,
    lightStatisticsIconCopiedTimeoutId: null,
    statisticsEntityId: "",
    statisticsReplaceIndex: -1,
    statisticsComponentId: "",
    navigationApplyFeedbackTimeoutId: null,
    panelFrameApplyFeedbackTimeoutId: null,
    lineChartApplyFeedbackTimeoutId: null,
    effectApplyFeedbackTimeoutId: null,
    titleButtonApplyFeedbackTimeoutId: null,
    deviceButtonApplyFeedbackTimeoutId: null,
    cameraApplyFeedbackTimeoutId: null,
    airConditionerApplyFeedbackTimeoutId: null,
    styleApplyPulseByButton: null,
    appliedStyleRecord: null,
    imageAlignSourceComponentId: null,
    selectedComponentIdsSet: undefined,
    selectionAnchorComponentId: null,
    coverMotorDirectionValue: null,
    savedDocumentSignature: "",
    baselineDocument: null,
    hasUnsavedChanges: false,
    copyTargetDraft: null,
    copyTargetLoadToken: 0,
    copySuccessNavigationTarget: null,
    isSaving: false,
    recoverySnapshot: null,
    menuComponentId: null,
    editorClipboardComponentIds: [],
    editorCanvasZoom: 1,
    editorSpacePanning: false,
    openCustomSelect: null,
    activeColorInputElement: null,
    activeColorHex: "",
    colorPickerHue: 0,
    colorPickerSaturation: 0,
    colorPickerBrightness: 1,
    colorPickerDragPointerId: null,
    colorPickerCopyResetTimer: null,
    lastLicenseFeatureSignature: null,
    marqueeState: null,
    iconTooltipElement: null,
    popupBeingRenamedValue: null,
  };
}
