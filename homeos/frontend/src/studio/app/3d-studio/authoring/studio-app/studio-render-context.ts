/**
 * StudioRenderContext —— `studio-app.ts` 的 `runStudioRenderLoop` 宿主闭包里可变状态的显式上下文。
 *
 * 由 `ops/studio/studio_state_context.mjs --emit-ctx` 依据宿主 `let` 声明生成（可手工润色）：
 * 字段顺序 / 类型 / 初值一一对应。**纯字面量初值**已搬进工厂；**初值依赖宿主作用域**的字段
 * 只放占位值（`undefined` / `false` / `0` / `""`），由宿主在**原 `let` 位置**写回真值，
 * 因此不会出现「先读到占位值」的窗口。
 *
 * 显式字段类型（禁止 `{[key:string]: any}` 开放袋子）。类型按「能精确就精确」推导：
 * 29/72 个字段是精确类型（原注解 / `ReturnType<typeof f>` / `InstanceType<typeof X>` / 字面量）；
 * 其余 43 个退 `any`：宿主里本就不自足（原文件自己的 `: any` 注解，或本地私有类型）。
 * **不要**把退化成 `any` 的 receiver 当小事 —— 宿主里 `ctx.x.items.map(cb)` 一旦 receiver 是 `any`，
 * `cb` 就退化成隐式 `any`（`TS7006`），精确类型的价值正是在这里。
 */
export interface StudioRenderContext {
  unusedRenderHandle: any;
  lastRenderSignature: string;
  cacheEpoch: number;
  lastStateJson: string;
  unusedRenderState: any;
  unusedRenderCounter: number;
  floorRetentionService: any;
  sceneRetentionService: any;
  releaseCurtains: any;
  releaseTelevisionScreens: any;
  releaseStartupDeviceSync: any;
  shouldRefreshGeometry: boolean;
  geometryRootRef: any;
  geometryKeyRef: any;
  shadowLights: any;
  geometryBoxes: any;
  backgroundBoundaries: any;
  invalidationBounds: any;
  isBackgroundVisible: any;
  isOrbitEnabled: boolean;
  cameraRootRef: any;
  cameraFirstChildRef: any;
  syncTargets: any;
  cameraRestoreState: any;
  savedCameraState: any;
  orbitTargetVector: any;
  orbitTargetAnchor: any;
  hasBaseLightingApplied: boolean;
  renderRootRef: any;
  renderKeyRef: any;
  renderViewRef: any;
  viewportBaseCamera: any;
  overviewStackOption: any;
  transitionRange: any;
  cameraViewMode: string;
  shouldEnablePan: boolean;
  shouldEnableZoom: boolean;
  isPerspectiveCameraMode: boolean;
  cameraForwardVector: any;
  isSnapshotMode: boolean;
  isRenderLoopOverviewMode: boolean;
  isViewTransitioning: boolean;
  stereoSampleIndex: number;
  lastViewOffsetSignature: string;
  cameraMotionSpec: any;
  renderTickCounter: number;
  reflectionPassCounter: number;
  overviewTimeoutHandle: any;
  isEntranceComplete: boolean;
  hasControlsRestored: boolean;
  isPresentationRunning: boolean;
  presentationHandle: any;
  pendingCameraState: any;
  pendingTransitionSpec: any;
  shouldResetCamera: boolean;
  runStudioRenderLoopLightsByItemKey: any;
  lightRecordsByItemKey: any;
  reflectionModeIndex: any;
  isReflectionEnabled: any;
  previousReflectionEnabled: any;
  isReflectionDisabled: any;
  reflectionDetailMode: any;
  isShadowReady: boolean;
  hasEffectsPrepared: boolean;
  isStartupPresentationDone: boolean;
  shouldStartPresentation: any;
  isReflectionsSuspended: boolean;
  shouldSuspendReflections: boolean;
  hasShadowBoost: boolean;
  shadowBoostStart: any;
  isShadowBoostActive: boolean;
  previousSceneSnapshot: any;
}

export function createStudioRenderContext(): StudioRenderContext {
  return {
    unusedRenderHandle: null,
    lastRenderSignature: "",
    cacheEpoch: 0,
    lastStateJson: "{}",
    unusedRenderState: null,
    unusedRenderCounter: 1,
    floorRetentionService: null,
    sceneRetentionService: null,
    releaseCurtains: null,
    releaseTelevisionScreens: null,
    releaseStartupDeviceSync: null,
    shouldRefreshGeometry: false,
    geometryRootRef: undefined,
    geometryKeyRef: undefined,
    shadowLights: [],
    geometryBoxes: [],
    backgroundBoundaries: [],
    invalidationBounds: [],
    isBackgroundVisible: undefined,
    isOrbitEnabled: false,
    cameraRootRef: undefined,
    cameraFirstChildRef: undefined,
    syncTargets: [],
    cameraRestoreState: undefined,
    savedCameraState: undefined,
    orbitTargetVector: undefined,
    orbitTargetAnchor: undefined,
    hasBaseLightingApplied: false,
    renderRootRef: undefined,
    renderKeyRef: undefined,
    renderViewRef: undefined,
    viewportBaseCamera: null,
    overviewStackOption: undefined,
    transitionRange: null,
    cameraViewMode: "free",
    shouldEnablePan: true,
    shouldEnableZoom: true,
    isPerspectiveCameraMode: false,
    cameraForwardVector: null,
    isSnapshotMode: false,
    isRenderLoopOverviewMode: false,
    isViewTransitioning: false,
    stereoSampleIndex: 0,
    lastViewOffsetSignature: "",
    cameraMotionSpec: null,
    renderTickCounter: 0,
    reflectionPassCounter: 0,
    overviewTimeoutHandle: null,
    isEntranceComplete: false,
    hasControlsRestored: false,
    isPresentationRunning: false,
    presentationHandle: null,
    pendingCameraState: undefined,
    pendingTransitionSpec: undefined,
    shouldResetCamera: false,
    runStudioRenderLoopLightsByItemKey: undefined,
    lightRecordsByItemKey: undefined,
    reflectionModeIndex: undefined,
    isReflectionEnabled: undefined,
    previousReflectionEnabled: undefined,
    isReflectionDisabled: undefined,
    reflectionDetailMode: undefined,
    isShadowReady: false,
    hasEffectsPrepared: false,
    isStartupPresentationDone: false,
    shouldStartPresentation: undefined,
    isReflectionsSuspended: false,
    shouldSuspendReflections: false,
    hasShadowBoost: false,
    shadowBoostStart: null,
    isShadowBoostActive: true,
    previousSceneSnapshot: [],
  };
}
