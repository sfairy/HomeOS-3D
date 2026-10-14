/**
 * StageContext —— `stage.ts` 的 `mountStage` 宿主闭包里可变状态的显式上下文。
 *
 * 由 `ops/studio/studio_state_context.mjs --emit-ctx` 依据宿主 `let` 声明生成（可手工润色）：
 * 字段顺序 / 类型 / 初值一一对应。**纯字面量初值**已搬进工厂；**初值依赖宿主作用域**的字段
 * 只放占位值（`undefined` / `false` / `0` / `""`），由宿主在**原 `let` 位置**写回真值，
 * 因此不会出现「先读到占位值」的窗口。
 *
 * 显式字段类型（禁止 `{[key:string]: any}` 开放袋子）。类型按「能精确就精确」推导：
 * 53/91 个字段是精确类型（原注解 / `ReturnType<typeof f>` / `InstanceType<typeof X>` / 字面量）；
 * 其余 38 个退 `any`：宿主里本就不自足（原文件自己的 `: any` 注解，或本地私有类型）。
 * **不要**把退化成 `any` 的 receiver 当小事 —— 宿主里 `ctx.x.items.map(cb)` 一旦 receiver 是 `any`，
 * `cb` 就退化成隐式 `any`（`TS7006`），精确类型的价值正是在这里。
 */
import type { resolvePageBehavior as resolvePageBehavior2 } from "../idle-rotation";
import type { configuredModuleKinds } from "./_shared";

export interface StageContext {
  value: any;
  options: Record<string, any>;
  deviceStates: Record<string, any>;
  isEditing: boolean;
  isAwaitingFloorViewAdjust: boolean;
  isControlReady: boolean;
  text: string;
  focusedItemId: string;
  selectedFloorId: string;
  isControlBusy: boolean;
  isNavigationVisible: boolean;
  navigationEditing: boolean;
  num: number;
  activePointerDrag: any;
  activeCameraPose: any;
  isStagePresented: boolean;
  animationFrameRequestId: number;
  pageBehavior: ReturnType<typeof resolvePageBehavior2>;
  activeModule: string;
  selectedSecurityKind: string;
  editingVacuumId: string;
  pendingFloorId: string;
  pendingModule: string;
  hasAutoSelectedFloors: boolean;
  panelDisplayMode: string;
  idleReturnCamera: any;
  cameraMotionSnapshot: any;
  focusInset: number;
  hasPendingStageRefresh: boolean;
  isStageVisible: boolean;
  isIdleRotationRunning: boolean;
  isCameraRotating: boolean;
  idleRotationCameraPose: any;
  sceneBackground: any;
  hasPresentedOnce: boolean;
  isPresentedVisible: boolean;
  isRangeEditorOpen: boolean;
  rangeEditorHandle: any;
  canEditLightRange: boolean;
  isRangeEditorSuppressingClose: boolean;
  isRangeEditorOnly: boolean;
  selectedLockEntry: any;
  isUserActive: boolean;
  isPointerHeld: boolean;
  cachedDocumentSource: any;
  cachedDocumentFloorId: any;
  lastInteractionMs: any;
  lightHistoryStorage: any;
  lightEditPreview: any;
  baseStageConfig: Record<string, any>;
  isCameraMoving: boolean;
  hasIdleIconActivity: boolean;
  pendingEditorAction: any;
  furthestFloorOrder: number;
  startupProgress: any;
  idleIconDelayUntilMs: number;
  cameraQuaternionKey: string;
  isIdleIconHidden: boolean;
  lastIdleFrameMs: number;
  lastIdleFloorId: number;
  followVacuumId: string;
  followReturnCamera: any;
  followCameraPose: any;
  lastQuaternionMs: any;
  mediaViewportSize: any;
  containerViewportSize: any;
  mediaScale: number;
  floorTabsSignature: string;
  isModuleTabsHidden: any;
  moduleTabsAnimation: any;
  configuredModuleKinds2: ReturnType<typeof configuredModuleKinds>;
  coverFeedbackStorage: any;
  curtainSyncSnapshot: any;
  list: any;
  trackedCoverBindings: any;
  nasSyncSnapshot: any;
  cameraSyncSnapshot: any;
  hasStartupProgressListener: boolean;
  televisionSyncSnapshot: any;
  environmentSyncSnapshot: any;
  startupDeviceSyncSnapshot: any;
  presenceSyncSignature: any;
  isPresencePressed: boolean;
  isPresenceEditing: boolean;
  vacuumSyncSignature: any;
  vacuumMapSignature: any;
  outgoingGhostAnimation: any;
  presentationUiSignatureCache: string;
  pointerGesture: any;
  focusExitPointer: any;
  lastRenderSignature: string;
}

export function createStageContext(): StageContext {
  return {
    value: null,
    options: { lights: [], },
    deviceStates: {},
    isEditing: false,
    isAwaitingFloorViewAdjust: false,
    isControlReady: false,
    text: "",
    focusedItemId: "",
    selectedFloorId: "",
    isControlBusy: false,
    isNavigationVisible: false,
    navigationEditing: false,
    num: 0,
    activePointerDrag: null,
    activeCameraPose: null,
    isStagePresented: false,
    animationFrameRequestId: 0,
    pageBehavior: undefined as unknown as ReturnType<typeof resolvePageBehavior2>,
    activeModule: "overview",
    selectedSecurityKind: "",
    editingVacuumId: "",
    pendingFloorId: "",
    pendingModule: "",
    hasAutoSelectedFloors: false,
    panelDisplayMode: "",
    idleReturnCamera: null,
    cameraMotionSnapshot: null,
    focusInset: 0,
    hasPendingStageRefresh: false,
    isStageVisible: false,
    isIdleRotationRunning: false,
    isCameraRotating: false,
    idleRotationCameraPose: null,
    sceneBackground: null,
    hasPresentedOnce: false,
    isPresentedVisible: true,
    isRangeEditorOpen: false,
    rangeEditorHandle: null,
    canEditLightRange: false,
    isRangeEditorSuppressingClose: false,
    isRangeEditorOnly: false,
    selectedLockEntry: null,
    isUserActive: false,
    isPointerHeld: false,
    cachedDocumentSource: undefined,
    cachedDocumentFloorId: undefined,
    lastInteractionMs: null,
    lightHistoryStorage: undefined,
    lightEditPreview: null,
    baseStageConfig: { lights: [], },
    isCameraMoving: false,
    hasIdleIconActivity: false,
    pendingEditorAction: null,
    furthestFloorOrder: -Infinity,
    startupProgress: undefined,
    idleIconDelayUntilMs: 0,
    cameraQuaternionKey: "",
    isIdleIconHidden: false,
    lastIdleFrameMs: 0,
    lastIdleFloorId: -1,
    followVacuumId: "",
    followReturnCamera: null,
    followCameraPose: null,
    lastQuaternionMs: null,
    mediaViewportSize: null,
    containerViewportSize: null,
    mediaScale: 1,
    floorTabsSignature: "",
    isModuleTabsHidden: null,
    moduleTabsAnimation: null,
    configuredModuleKinds2: undefined as unknown as ReturnType<typeof configuredModuleKinds>,
    coverFeedbackStorage: undefined,
    curtainSyncSnapshot: null,
    list: [],
    trackedCoverBindings: [],
    nasSyncSnapshot: undefined,
    cameraSyncSnapshot: undefined,
    hasStartupProgressListener: false,
    televisionSyncSnapshot: undefined,
    environmentSyncSnapshot: undefined,
    startupDeviceSyncSnapshot: undefined,
    presenceSyncSignature: null,
    isPresencePressed: false,
    isPresenceEditing: false,
    vacuumSyncSignature: null,
    vacuumMapSignature: null,
    outgoingGhostAnimation: null,
    presentationUiSignatureCache: "",
    pointerGesture: undefined,
    focusExitPointer: null,
    lastRenderSignature: "",
  };
}
