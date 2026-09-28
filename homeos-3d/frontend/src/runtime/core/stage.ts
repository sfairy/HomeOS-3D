import {
  applyMdiMask,
  capturePointer,
  resolveStateEntry,
  temperatureHumidityReading
} from "./static-helpers.js";
// 「减少动态效果」偏好的唯一判定。
import { prefersReducedMotionNow } from "./motion-preference.js";
// 模型定位键（楼层 + 模型）的唯一实现在 core/scene-model-key.js。
import { sceneModelKey } from "./scene-model-key.js";
const { popupPlacement: computePopupPlacement } = await (import("@app/bridge/popup-placement.js"));
import {
  createPresenceScene,
  createPresenceWaves
} from "../presence/presence-scene.js";
import { createSceneBackground } from "./scene-background.js";
import { floorNavigationChoices } from "./floor-navigation.js";
import {
  createVacuumMotion,
  vacuumQuip,
  createVacuumFollowCamera,
  vacuumBirdCamera,
  vacuumFollowPose
} from "../vacuum/vacuum-motion.js";
import {
  createVacuumMaps,
  vacuumStatusPresentation,
  vacuumBindingsForMap
} from "../vacuum/vacuum-map.js";
import { televisionState } from "../television/television-state.js";
import { createTelevisionPanel } from "../television/television-panel.js";
import { createTelevisionScreens } from "../television/television-screen.js";
import { createNasPanel } from "../nas/nas-panel.js";
import { createNasStatus, nasDeviceState } from "../nas/nas-status.js";
import { createCameraStatus, cameraOnline } from "../camera/camera-status.js";
import {
  coverState,
  coverIconIsOn,
  coverCanAdjustBlades
} from "../cover/cover-state.js";
import { createCoverFeedback } from "../cover/cover-feedback.js";
import { createCoverPanel } from "../cover/cover-panel.js";
// 窗帘组合（一拖多）：组面板把成员各自转发成一块普通窗帘子面板，与单副帘面板同一套外观。
import { createCoverGroupPanel } from "../cover/cover-group-panel.js";
import { createCurtainMotion } from "../cover/curtain-motion.js";
// 门锁：面板（状态 + 电量 + 密码 + 上锁/解锁/释放锁舌）、门外动画（把 doorOpen 翻成门的姿态）、
import { createLockPanel } from "../security/lock-panel.js";
import { createLockMotion } from "../security/lock-motion.js";
import { doorModels, lockHinge, lockState } from "../security/lock-state.js";
import { createEnvironmentAirflow } from "../environment/environment-airflow.js";
import { createScreenOutlines } from "../environment/environment-halos.js";
import { mountRegionRangeEditor } from "../light/light-range-editor.js";
import { climateState, createClimateModeHistory } from "../climate/climate-state.js";
import { createClimatePanel } from "../climate/climate-panel.js";
import { createDevicePanel } from "../device/device-panel.js";
// 通用设备状态灯的状态口径：statusRules 折算成四态与配色，与设备弹窗 / 编辑器同源
import { deviceStatus } from "../device/device-status.js";
import {
  GENERIC_DEVICE_KINDS,
  isGenericDeviceKind,
  genericDeviceProfile
} from "../device/device-profiles.js";
import {
  createEnvironmentScene,
  pageDimming,
  pageModelBindings
} from "../environment/environment-scene.js";
import { startSceneSync } from "./scene-sync.js";
import {
  lightCommand,
  createLightPreview,
  createLightStateCache,
  lightRenderState
} from "../light/light-state.js";
import {
  createDampedCameraMotion,
  automaticLightCamera,
  automaticAirConditionerCamera
} from "../camera/camera-motion.js";
import {
  resolvePageBehavior,
  createIdleRotation,
  createIdleIconVisibility,
  createIdleFocusExit
} from "./idle-rotation.js";
import { createStageMetadata } from "./stage/config-metadata.js";
import { createBindingCollectors } from "./stage/binding-collectors.js";
import { createStageGeometry } from "./stage/geometry.js";
import { createDomAndHostBridge } from "./stage/dom-host.js";
import { createLightStateReaders } from "./stage/light-state.js";
import { createRequestSettlement } from "./stage/request-settlement.js";
import { createCoverPresentation } from "./stage/cover-presentation.js";
import { createPresenceHitBoxes } from "./stage/presence-hitboxes.js";
import { createMarkerLayer } from "./stage/marker-layer.js";
import { createInputActivity } from "./stage/input-activity.js";
import { createCameraTransition } from "./stage/camera-transition.js";
import { createHostMessageHandler } from "./stage/host-messages.js";
// 页签清单与「模块 → 所属页签」的归一：单一出处，改这里（别再就地抄一份映射）。
import { MODULE_TABS, moduleTabOf } from "./stage/module-tabs.js";

/**
 * 舞台宿主注入依赖：THREE / DOM / 相机 / 帧循环 / 场景联动钩子。
 * 未列出的字段以 unknown 收口，调用处再收窄。
 */
type StageSceneDocument = {
  floors?: StageFloor[];
  projectId?: string;
  [key: string]: unknown;
};

type StageFloor = {
  id?: string | number;
  scene?: { items?: StageSceneItem[]; lightGroups?: unknown[]; [key: string]: unknown };
  [key: string]: unknown;
};

type StageSceneItem = {
  id?: string | number;
  name?: string;
  lightGroupId?: string;
  [key: string]: unknown;
};

/** 舞台配置来自宿主 JSON，字段随模块扩展；用宽松索引，调用处按需收窄。 */
type StageConfig = {
  lights?: any[];
  environment?: any;
  devices?: any;
  security?: any;
  floorSelection?: any;
  sceneId?: any;
  camera?: any;
  navigation?: any;
  [key: string]: any;
};

type StageBinding = {
  id?: string;
  floorId?: string;
  entityId?: string;
  deviceKind?: string;
  modelId?: string;
  [key: string]: any;
};

/** three.js 命名空间在舞台侧只用到少量构造器；其余按需收窄。 */
type StageThree = {
  Vector3: new (...args: any[]) => any;
  Quaternion: new (...args: any[]) => any;
  [key: string]: any;
};

/**
 * 舞台宿主注入依赖。方法在真实宿主上始终齐备；索引签名收口扩展字段。
 */
type StageHostOptions = {
  THREE: StageThree;
  container: HTMLElement;
  canvas: HTMLCanvasElement;
  document?: StageSceneDocument | null;
  camera?: any;
  controls?: any;
  modelRoot?: any;
  sceneRevision?: any;
  environmentRevision?: any;
  floorTransitionActive?: boolean;
  regionLighting?: any;
  groundReflections?: any;
  requestRender: () => void;
  setBackgroundTheme: (theme: any) => void;
  setCurtainSync: (sync: any) => void;
  setTelevisionSync: (sync: any) => void;
  setEnvironmentScene: (scene: any) => void;
  setEnvironmentAirflow: (airflow: any) => void;
  setEnvironmentActive: (active: any) => void;
  setFloor: (floorId: any) => void;
  setFocusViewport: (inset: any) => void;
  setOrbitPivot: (pivot: any) => void;
  invalidateReflections: (ids?: any) => void;
  cameraState: (absolute?: boolean) => any;
  applyCameraPose: (pose: any, absolute?: boolean) => void;
  beginCameraMotion: (mode?: any) => void;
  endCameraMotion: () => void;
  getCameraMotionState: () => any;
  getOrbitCenter: () => any;
  orbitCameraPose: (...args: any[]) => any;
  restoreCamera: (...args: any[]) => void;
  floorDefaultCamera: (...args: any[]) => any;
  presentationCamera: (request?: any) => any;
  transitionFloor: (...args: any[]) => any;
  advanceFloorTransition: (...args: any[]) => any;
  finishFloorTransition: (...args: any[]) => void;
  environmentModelPose: (...args: any[]) => any;
  pickEnvironmentModel: (...args: any[]) => any;
  curtainFrame: (frame: any) => void;
  onCameraChange: (listener: any) => any;
  createFrameLoop: (tick: any) => { wake: () => void; dispose?: () => void; [key: string]: any };
  readSceneUpdate: (...args: any[]) => any;
  [key: string]: any;
};


const DEFAULT_MARKER_ICON_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M8 15c0-2-3-3-3-7a7 7 0 0 1 14 0c0 4-3 5-3 7l-1 3H9l-1-3Z"/><path d="M9 21h6M9 15h6"/></svg>';
const LIGHT_PRESETS = [
  {
    label: "柔和",
    brightness: 25,
    temperaturePercent: 10
  },
  {
    label: "日常",
    brightness: 60,
    temperaturePercent: 50
  },
  {
    label: "明亮",
    brightness: 100,
    temperaturePercent: 100
  }
];
/**
 * 楼层过渡「末段可接管」的进度阈值。阻尼收敛的进度按 e^(-rt) 逼近 1，楼层 owner 的停稳判定
 */
const FLOOR_TAIL_DRAG_MIN_PROGRESS = 0.999;
const MODULE_TAB_WIDTH = 56;
const MODULE_TAB_HEIGHT = 32;
const MODULE_TAB_STRIDE = MODULE_TAB_WIDTH + 2;
const MODULE_TAB_TRACK_PADDING = 3;
const MODULE_TAB_TRACK_HEIGHT = MODULE_TAB_HEIGHT + MODULE_TAB_TRACK_PADDING * 2 + 2;
const NAVIGATION_DRAG_THRESHOLD = 4;
/**
 * 算出当前配置下真正可用的模块页签。
 */
function configuredModuleKinds(rawConfig: StageConfig = {}) {
  return [
    // 总览 始终提供：它聚合当前楼层上所有已配置模块的标记，
    "overview",
    "light",
    ...(rawConfig.environment?.airConditioners?.length ||
    rawConfig.environment?.airPurifiers?.length ||
    rawConfig.environment?.curtains?.length
      ? ["environment"]
      : []),
    ...(rawConfig.environment?.temperatureHumidity?.length ? ["temperature-humidity"] : []),
    ...(rawConfig.devices?.nas?.length ||
    rawConfig.devices?.televisions?.length ||
    // 通用设备也住在「设备」页签下：只配了一台冰箱、没配 NAS / 电视时，
    GENERIC_DEVICE_KINDS.some((genericKind: any) => {
      const collection = genericDeviceProfile(genericKind)?.collection;
      return !!(collection && rawConfig.devices?.[collection]?.length);
    })
      ? ["devices"]
      : []),
    ...(rawConfig.devices?.vacuums?.length ? ["vacuum"] : []),
    ...(rawConfig.security?.cameras?.length || rawConfig.security?.presenceSensors?.length
      ? ["security"]
      : [])
  ];
}
/**
 * 快照门控同步器：舞台里有一串同形状的同步函数（窗帘 / 摄像头状态 / NAS / 电视屏 /
 * @param {() => object} readInputs 读取当前输入，返回的键即快照键（每次都要给出同样的键）。
 * @param {(inputs: object) => void} apply 判定变化后执行的同步逻辑，入参即本次输入。
 * @returns {() => void} 可反复调用的同步函数（宿主每帧调用也只在输入变化时才做重活）。
 */
function createSnapshotSyncer(readInputs: () => Record<string, any>, apply: (inputs: Record<string, any>) => void) {
  let previousInputs: any = null;
  return function syncSnapshot() {
    const inputs = readInputs();
    if (previousInputs && snapshotInputsEqual(previousInputs, inputs)) {
      return;
    }
    previousInputs = inputs;
    apply(inputs);
  };
}
/** 逐键引用相等 + 键数一致，供 createSnapshotSyncer 判等。 */
function snapshotInputsEqual(previousInputs: Record<string, any>, inputs: Record<string, any>) {
  const inputKeys = Object.keys(inputs);
  if (inputKeys.length !== Object.keys(previousInputs).length) {
    return false;
  }
  return inputKeys.every((inputKey: any) => Object.is(previousInputs[inputKey], inputs[inputKey]));
}
/**
 * 挂载 3D 舞台：注册宿主消息、渲染循环与全部子系统（窗帘 / 扫地机 / 电视 / NAS / 摄像头 / 环境）。
 * @param {object} stageOptions 宿主注入的依赖与回调（THREE、container、canvas、document、相机、帧循环工厂、联动钩子）。
 */
export function mountStage(stageOptions: StageHostOptions) {
  const THREE = stageOptions.THREE;
  const containerElement = stageOptions.container;
  const canvasElement = stageOptions.canvas;
  const stageDocument = () => stageOptions.document || { floors: [] as StageFloor[] };
  const stageFloors = () => stageDocument().floors || [];

  let config: StageConfig = {
    lights: []
  };
  // 实体状态表：states 消息可整份替换或按 patch 增量合并，键是 entityId。
  let statesByEntityId: Record<string, any> = {};
  // 编辑态：标记可拖拽、点击走 edit 消息而不是控制命令，且强制关闭交互。
  let isEditing = false;
  let isViewEditing = false;
  // 宿主是否允许交互（展示页可关掉）：false 时点击不产生任何控制命令。
  let isInteractive = false;
  // 编辑器选中的标记 ID（编辑态使用）。
  let selectedId = "";
  // 展示态聚焦的标记 ID（由舞台自行维护）。
  let focusedId = "";
  // 当前楼层 ID；"all" 表示全部楼层，此时所有楼层都算「当前楼层」。
  let currentFloorId = "";
  // 页面卸载后置位：所有异步回调（场景替换、呈现等待）据此提前退出，
  let isDisposed = false;
  // 编辑器内嵌的「画布视图」：非编辑态但来自编辑器 iframe，
  let isEditorCanvas = false;
  // 控制请求 ID 自增源：灯光 / 窗帘 / 空调 / 电视共用一条计数，
  let requestSeq = 0;
  let markerDragState: any = null;
  // 导航位置调整态（仅编辑器画布）：置位后分类栏 / 楼层栏可拖动改位置，
  let navigationEditing = false;
  // 进入聚焦 / 切换楼层前的相机快照，退出聚焦时用它还原。
  let savedCameraPose: any = null;
  // 舞台画面是否已呈现（宿主确认后置位）；未呈现前不做空闲动画与定位。
  let isPresented = false;
  // 配置代次：每收到一条 config 自增，异步的呈现等待用它判断
  let configRevisionCount = 0;
  let pageBehavior = resolvePageBehavior();
  // 总览 是落地模块：只展示房子本体，不显示设备按钮。
  let activeModule = "overview";
  let editingVacuumId = "";
  let pendingFloorId = "";
  let pendingModule = "";
  let hasInitializedFloor = false;
  // 楼层选择为 "all" 表示「全部楼层」：标记与相机都按整栋楼处理。
  const isAllFloorsMode = () => currentFloorId === "all";
  // 展示态下的「全部楼层」等价于总览页；编辑态不算，编辑器仍要显示设备标记。
  const isOverviewMode = () => activeModule === "overview" || (!isEditing && isAllFloorsMode());
  // 全部楼层模式下所有楼层都算「当前楼层」，其余情况按 floorId 精确匹配。
  const isOnActiveFloor = (item: StageBinding | Record<string, any>) => currentFloorId === "all" || item.floorId === currentFloorId;
  let focusMode = "";
  let focusRestoreCameraPose: any = null;
  let cameraTransition: any = null;
  let focusViewportInset = 0;
  let isPageVisible = false;
  let isIdleRotating = false;
  let hasIdleReturnPending = false;
  let idleBasePose: any = null;
  let frameLoop: { wake: () => void; dispose?: () => void; [key: string]: any } | null = null;
  // 宿主是否上报过活动状态；未上报时不做页面可见性判断，默认允许渲染。
  let hasActivityState = false;
  let isPresentedVisible = true;
  let isRangeEditorOpen = false;
  let rangeEditor: any = null;
  // 宿主是否允许范围编辑（视图编辑态或非区域布光模式下不允许），
  let isRangeEditingAllowed = false;
  // 范围编辑器正在等待宿主响应（保存 / 打开中），期间不接受新的请求。
  let isRangeEditorBusy = false;
  // 本次会话是否「只为范围编辑」而打开：宿主用它区分纯编辑会话。
  let isRangeEditorOnly = false;
  // 统一用它唤醒按需渲染循环。frameLoop 在函数末尾才创建，
  const wakeFrameLoop = () => frameLoop?.wake();
  // 背景控制器：默认主题下驱动地面星尘，暖阳原木下换成全屏暖色背景。
  const backgroundTheme = createSceneBackground(stageOptions, wakeFrameLoop);
  stageOptions.setBackgroundTheme?.(backgroundTheme);
  let areIdleIconsHidden = false;
  let isActivityHeld = false;
  // 仍按下的指针 ID 集合：只要有内容就保持「活动中」。
  const activePointerIds = new Set<any>();
  // 仍按下的按键集合，与指针集合一起决定活动保持。
  const pressedKeys = new Set<any>();
  // 标记 DOM 索引：键是绑定 ID，renderMarkers 靠它做增删同步。
  const markersById = new Map<string, any>();
  // 在途灯光控制请求：键是 requestId，值含超时句柄与排队中的下一条命令。
  const lightRequestsById = new Map<string, any>();
  const markerPointsById = new Map<string, any>();
  const tempProjectedPoint = new THREE.Vector3();
  let cachedSceneDocument: any;
  let cachedMarkerFloorId: any;
  let idleSinceTimestamp: any = null;
  const lightPreview = createLightPreview();
  const lightHistoryScope = document.body?.dataset?.i3dLightHistoryScope;
  let localStorageRef: Storage | null | undefined;
  if (lightHistoryScope) {
    try {
      // 隐私模式 / 存储被禁用时读 localStorage 会抛异常：
      localStorageRef = window.localStorage;
    } catch {
    }
  }
  const lightStateCache = createLightStateCache({
    storage: localStorageRef,
    scope: lightHistoryScope
  });
  // 空调的「上次使用模式」同样按 scope 隔离；复用灯光那套 storage 与 scope，
  const climateModeHistory = createClimateModeHistory({
    storage: localStorageRef,
    scope: lightHistoryScope
  });
  function observeAllClimates() {
    if (!isEditing) {
      for (const airConditionerBinding of config.environment?.airConditioners || []) {
        climateModeHistory.observe(
          airConditionerBinding.entityId,
          statesByEntityId[airConditionerBinding.entityId]
        );
      }
    }
  }


  let lightEffectPreview: any = null;
  let sceneProperties: StageConfig = {
    lights: []
  };
  let isSceneUpdating = false;
  // 用户是否手动调过相机：用于区分「空闲自动返回」与用户主动确定的视角，
  let hasUserInteracted = false;
  // 场景替换期间到达的 config 消息先挂起（只保留最新一条），
  let queuedConfigMessage: any = null;
  // 初值取 -Infinity：首帧就被视为「已空闲」，空闲旋转可以立刻开始。
  let lastActivityTimestamp = -Infinity;










  const ctx = {
    get DEFAULT_MARKER_ICON_SVG() {
      return DEFAULT_MARKER_ICON_SVG;
    },
    get THREE() {
      return THREE;
    },
    get activateBinding() {
      return activateBinding;
    },
    get activeModule() {
      return activeModule;
    },
    set activeModule(value) {
      activeModule = value;
    },
    get activePointerIds() {
      return activePointerIds;
    },
    get applyLightStates() {
      return applyLightStates;
    },
    get applyMdiMask() {
      return applyMdiMask;
    },
    get applyPageBehavior() {
      return applyPageBehavior;
    },
    get areIconsHiddenByRotation() {
      return areIconsHiddenByRotation;
    },
    set areIconsHiddenByRotation(value) {
      areIconsHiddenByRotation = value;
    },
    get areIdleIconsHidden() {
      return areIdleIconsHidden;
    },
    get automaticAirConditionerCamera() {
      return automaticAirConditionerCamera;
    },
    get automaticLightCamera() {
      return automaticLightCamera;
    },
    get backgroundTheme() {
      return backgroundTheme;
    },
    get beginCameraTransition() {
      return beginCameraTransition;
    },
    get bladePendingByEntityId() {
      return bladePendingByEntityId;
    },
    get buildMetadata() {
      return buildMetadata;
    },
    get cachedMarkerFloorId() {
      return cachedMarkerFloorId;
    },
    set cachedMarkerFloorId(value) {
      cachedMarkerFloorId = value;
    },
    get cachedSceneDocument() {
      return cachedSceneDocument;
    },
    set cachedSceneDocument(value) {
      cachedSceneDocument = value;
    },
    get cameraOnline() {
      return cameraOnline;
    },
    get cameraTransition() {
      return cameraTransition;
    },
    set cameraTransition(value) {
      cameraTransition = value;
    },
    get cancelModuleTransition() {
      return cancelModuleTransition;
    },
    get canvasElement() {
      return canvasElement;
    },
    get capturePointer() {
      return capturePointer;
    },
    get climateRequestsById() {
      return climateRequestsById;
    },
    get climateState() {
      return climateState;
    },
    get collectModuleBindings() {
      return collectModuleBindings;
    },
    get computePanelInsetRatio() {
      return computePanelInsetRatio;
    },
    get config() {
      return config;
    },
    set config(value) {
      config = value;
    },
    get configRevisionCount() {
      return configRevisionCount;
    },
    set configRevisionCount(value) {
      configRevisionCount = value;
    },
    get configuredModuleKinds() {
      return configuredModuleKinds;
    },
    get configuredModules() {
      return configuredModules;
    },
    set configuredModules(value) {
      configuredModules = value;
    },
    get constrainCameraPose() {
      return constrainCameraPose;
    },
    get containerElement() {
      return containerElement;
    },
    get controlErrorElement() {
      return controlErrorElement;
    },
    get coverBindings() {
      return coverBindings;
    },
    get coverFeedback() {
      return coverFeedback;
    },
    get coverIconIsOn() {
      return coverIconIsOn;
    },
    get coverRequestsById() {
      return coverRequestsById;
    },
    get deviceRequestsById() {
      return deviceRequestsById;
    },
    get coverState() {
      return coverState;
    },
    get createLockMotion() {
      return createLockMotion;
    },
    get createLockPanel() {
      return createLockPanel;
    },
    get doorModels() {
      return doorModels;
    },
    get lockState() {
      return lockState;
    },
    get temperatureHumidityReading() {
      return temperatureHumidityReading;
    },
    get createDampedCameraMotion() {
      return createDampedCameraMotion;
    },
    get currentCameraSnapshot() {
      return currentCameraSnapshot;
    },
    get currentFloorId() {
      return currentFloorId;
    },
    set currentFloorId(value) {
      currentFloorId = value;
    },
    get curtainMotion() {
      return curtainMotion;
    },
    get dreamCoverFeedback() {
      return dreamCoverFeedback;
    },
    get editingVacuumId() {
      return editingVacuumId;
    },
    set editingVacuumId(value) {
      editingVacuumId = value;
    },
    get exitFocus() {
      return exitFocus;
    },
    get findBinding() {
      return findBinding;
    },
    get findFocusedBinding() {
      return findFocusedBinding;
    },
    get floorNavigationChoices() {
      return floorNavigationChoices;
    },
    get focusBinding() {
      return focusBinding;
    },
    get focusMode() {
      return focusMode;
    },
    set focusMode(value) {
      focusMode = value;
    },
    get focusRestoreCameraPose() {
      return focusRestoreCameraPose;
    },
    set focusRestoreCameraPose(value) {
      focusRestoreCameraPose = value;
    },
    get focusViewportInset() {
      return focusViewportInset;
    },
    set focusViewportInset(value) {
      focusViewportInset = value;
    },
    get focusedId() {
      return focusedId;
    },
    set focusedId(value) {
      focusedId = value;
    },
    get followButton() {
      return followButton;
    },
    get followCameraPose() {
      return followCameraPose;
    },
    set followCameraPose(value) {
      followCameraPose = value;
    },
    get followedVacuumId() {
      return followedVacuumId;
    },
    set followedVacuumId(value) {
      followedVacuumId = value;
    },
    get frameLoop() {
      return frameLoop;
    },
    get hasActivityState() {
      return hasActivityState;
    },
    set hasActivityState(value) {
      hasActivityState = value;
    },
    get hasIdleReturnPending() {
      return hasIdleReturnPending;
    },
    get hasInitializedFloor() {
      return hasInitializedFloor;
    },
    set hasInitializedFloor(value) {
      hasInitializedFloor = value;
    },
    get hasUserInteracted() {
      return hasUserInteracted;
    },
    set hasUserInteracted(value) {
      hasUserInteracted = value;
    },
    get idleFocusExit() {
      return idleFocusExit;
    },
    get idleIconHideDeadline() {
      return idleIconHideDeadline;
    },
    set idleIconHideDeadline(value) {
      idleIconHideDeadline = value;
    },
    get idleIconVisibility() {
      return idleIconVisibility;
    },
    get idleRotation() {
      return idleRotation;
    },
    get idleSinceTimestamp() {
      return idleSinceTimestamp;
    },
    set idleSinceTimestamp(value) {
      idleSinceTimestamp = value;
    },
    get isActivityHeld() {
      return isActivityHeld;
    },
    set isActivityHeld(value) {
      isActivityHeld = value;
    },
    get isDisposed() {
      return isDisposed;
    },
    get isEditing() {
      return isEditing;
    },
    set isEditing(value) {
      isEditing = value;
    },
    get isEditorCanvas() {
      return isEditorCanvas;
    },
    set isEditorCanvas(value) {
      isEditorCanvas = value;
    },
    get isFocusableDevice() {
      return isFocusableDevice;
    },
    get isIdleRotating() {
      return isIdleRotating;
    },
    get isInteractive() {
      return isInteractive;
    },
    set isInteractive(value) {
      isInteractive = value;
    },
    get isOnActiveFloor() {
      return isOnActiveFloor;
    },
    get isOverviewMode() {
      return isOverviewMode;
    },
    get isPageVisible() {
      return isPageVisible;
    },
    set isPageVisible(value) {
      isPageVisible = value;
    },
    get isPresenceHitRangeVisible() {
      return isPresenceHitRangeVisible;
    },
    set isPresenceHitRangeVisible(value) {
      isPresenceHitRangeVisible = value;
    },
    get isPresencePreviewWalk() {
      return isPresencePreviewWalk;
    },
    set isPresencePreviewWalk(value) {
      isPresencePreviewWalk = value;
    },
    get isPresented() {
      return isPresented;
    },
    set isPresented(value) {
      isPresented = value;
    },
    get isPresentedVisible() {
      return isPresentedVisible;
    },
    set isPresentedVisible(value) {
      isPresentedVisible = value;
    },
    get isRangeEditingAllowed() {
      return isRangeEditingAllowed;
    },
    set isRangeEditingAllowed(value) {
      isRangeEditingAllowed = value;
    },
    get isRangeEditorBusy() {
      return isRangeEditorBusy;
    },
    set isRangeEditorBusy(value) {
      isRangeEditorBusy = value;
    },
    get isRangeEditorOnly() {
      return isRangeEditorOnly;
    },
    set isRangeEditorOnly(value) {
      isRangeEditorOnly = value;
    },
    get isRangeEditorOpen() {
      return isRangeEditorOpen;
    },
    get isSceneUpdating() {
      return isSceneUpdating;
    },
    set isSceneUpdating(value) {
      isSceneUpdating = value;
    },
    get isViewEditing() {
      return isViewEditing;
    },
    set isViewEditing(value) {
      isViewEditing = value;
    },
    get lastActivityTimestamp() {
      return lastActivityTimestamp;
    },
    set lastActivityTimestamp(value) {
      lastActivityTimestamp = value;
    },
    get layoutPresenceHitBoxes() {
      return layoutPresenceHitBoxes;
    },
    get layoutStage() {
      return layoutStage;
    },
    get lightEffectPreview() {
      return lightEffectPreview;
    },
    set lightEffectPreview(value) {
      lightEffectPreview = value;
    },
    get lightPanelElement() {
      return lightPanelElement;
    },
    get lightPreview() {
      return lightPreview;
    },
    get lightRenderState() {
      return lightRenderState;
    },
    get lightRequestsById() {
      return lightRequestsById;
    },
    get lightStateCache() {
      return lightStateCache;
    },
    get makeElement() {
      return makeElement;
    },
    get markerDragState() {
      return markerDragState;
    },
    set markerDragState(value) {
      markerDragState = value;
    },
    get markerLayoutSignature() {
      return markerLayoutSignature;
    },
    set markerLayoutSignature(value) {
      markerLayoutSignature = value;
    },
    get markerPointsById() {
      return markerPointsById;
    },
    get markersById() {
      return markersById;
    },
    get markersElement() {
      return markersElement;
    },
    get maybeOpenDevicePopup() {
      return maybeOpenDevicePopup;
    },
    get moduleEmptyElement() {
      return moduleEmptyElement;
    },
    get moduleTransition() {
      return moduleTransition;
    },
    get moveFocusInto() {
      return moveFocusInto;
    },
    get navigationEditing() {
      return navigationEditing;
    },
    set navigationEditing(value) {
      navigationEditing = value;
    },
    get nasDeviceState() {
      return nasDeviceState;
    },
    get normalizeSceneConfig() {
      return normalizeSceneConfig;
    },
    get observeAllClimates() {
      return observeAllClimates;
    },
    get openRangeEditor() {
      return openRangeEditor;
    },
    get pageBehavior() {
      return pageBehavior;
    },
    set pageBehavior(value) {
      pageBehavior = value;
    },
    get pendingFloorId() {
      return pendingFloorId;
    },
    set pendingFloorId(value) {
      pendingFloorId = value;
    },
    get pendingModule() {
      return pendingModule;
    },
    set pendingModule(value) {
      pendingModule = value;
    },
    get pointerToFloorPoint() {
      return pointerToFloorPoint;
    },
    get postToHost() {
      return postToHost;
    },
    get preFollowCameraState() {
      return preFollowCameraState;
    },
    set preFollowCameraState(value) {
      preFollowCameraState = value;
    },
    get prefersReducedMotionNow() {
      return prefersReducedMotionNow;
    },
    get presenceHitBoxesById() {
      return presenceHitBoxesById;
    },
    get presenceHitLayerElement() {
      return presenceHitLayerElement;
    },
    get presenceScene() {
      return presenceScene;
    },
    get presentationLayout() {
      return presentationLayout;
    },
    set presentationLayout(value) {
      presentationLayout = value;
    },
    get pressedKeys() {
      return pressedKeys;
    },
    get queuedConfigMessage() {
      return queuedConfigMessage;
    },
    set queuedConfigMessage(value) {
      queuedConfigMessage = value;
    },
    get rangeEditor() {
      return rangeEditor;
    },
    get readLightState() {
      return readLightState;
    },
    get renderLightPanel() {
      return renderLightPanel;
    },
    get renderMarkers() {
      return renderMarkers;
    },
    get renderStage() {
      return renderStage;
    },
    get resolveCurtainGeometry() {
      return resolveCurtainGeometry;
    },
    get resolveLightState() {
      return resolveLightState;
    },
    get resolvePageBehavior() {
      return resolvePageBehavior;
    },
    get resolveStateEntry() {
      return resolveStateEntry;
    },
    get savedCameraPose() {
      return savedCameraPose;
    },
    set savedCameraPose(value) {
      savedCameraPose = value;
    },
    get sceneModelKey() {
      return sceneModelKey;
    },
    get sceneProperties() {
      return sceneProperties;
    },
    set sceneProperties(value) {
      sceneProperties = value;
    },
    get screenOutlines() {
      return screenOutlines;
    },
    get selectedId() {
      return selectedId;
    },
    set selectedId(value) {
      selectedId = value;
    },
    get sendLightCommand() {
      return sendLightCommand;
    },
    get settleClimateRequest() {
      return settleClimateRequest;
    },
    get settleCoverRequest() {
      return settleCoverRequest;
    },
    get settleDeviceRequest() {
      return settleDeviceRequest;
    },
    get settleLightCommand() {
      return settleLightCommand;
    },
    get settleTelevisionRequest() {
      return settleTelevisionRequest;
    },
    get stageOptions() {
      return stageOptions;
    },
    get statesByEntityId() {
      return statesByEntityId;
    },
    set statesByEntityId(value) {
      statesByEntityId = value;
    },
    get stopVacuumFollow() {
      return stopVacuumFollow;
    },
    get syncCameraInteraction() {
      return syncCameraInteraction;
    },
    get syncCoverFeedback() {
      return syncCoverFeedback;
    },
    get syncPresenceScene() {
      return syncPresenceScene;
    },
    get syncVacuumMaps() {
      return syncVacuumMaps;
    },
    get televisionRequestsById() {
      return televisionRequestsById;
    },
    get televisionState() {
      return televisionState;
    },
    get tempProjectedPoint() {
      return tempProjectedPoint;
    },
    get toolbarElement() {
      return toolbarElement;
    },
    get transformCameraPose() {
      return transformCameraPose;
    },
    get updateActivityHolds() {
      return updateActivityHolds;
    },
    get updateIdleControllers() {
      return updateIdleControllers;
    },
    get updateMarkerPositions() {
      return updateMarkerPositions;
    },
    get updateMarkerVisibility() {
      return updateMarkerVisibility;
    },
    get updatePanelChrome() {
      return updatePanelChrome;
    },
    get vacuumBirdCamera() {
      return vacuumBirdCamera;
    },
    get vacuumFollowCamera() {
      return vacuumFollowCamera;
    },
    get vacuumFollowPose() {
      return vacuumFollowPose;
    },
    get vacuumMotion() {
      return vacuumMotion;
    },
    get vacuumQuip() {
      return vacuumQuip;
    },
    get vacuumRoomTimersById() {
      return vacuumRoomTimersById;
    },
    get vacuumStatusPresentation() {
      return vacuumStatusPresentation;
    },
    get vacuumWorkingLayerElement() {
      return vacuumWorkingLayerElement;
    },
    get wakeFrameLoop() {
      return wakeFrameLoop;
    }
  };
  const { buildMetadata, normalizeSceneConfig } = createStageMetadata(ctx as any);
  const {
    collectAllDeviceBindings,
    collectCameraBindings,
    collectClimateBindings,
    collectCurtainBindings,
    collectLockBindings,
    collectModuleBindings,
    collectNasBindings,
    collectPresenceBindings,
    collectPreviewCovers,
    collectTelevisionBindings,
    collectVacuumBindings,
    resolveModuleBindings
  } = createBindingCollectors(ctx as any);
  const {
    cameraPosesEqual,
    constrainCameraPose,
    currentCameraSnapshot,
    isFocusableDevice,
    pointerToFloorPoint,
    resolveCurtainGeometry,
    transformCameraPose
  } = createStageGeometry(ctx as any);
  const { makeElement: makeElementStrict, postToHost } = createDomAndHostBridge(ctx as any);
  const makeElement = ((tagName: any, className?: any, textContent?: any) =>
    makeElementStrict(tagName, className, textContent)) as (...args: any[]) => any;
  const { applyLightStates, readLightState, resolveLightState } = createLightStateReaders(ctx as any);
  const {
    settleClimateRequest,
    settleCoverRequest,
    settleDeviceRequest,
    settleLightCommand,
    settleTelevisionRequest
  } = createRequestSettlement(ctx as any);
  const {
    nextCoverDelayMs,
    pruneBladePreviews,
    resolveCoverPresentation,
    syncCoverFeedback
  } = createCoverPresentation(ctx as any);
  const { layoutPresenceHitBoxes } = createPresenceHitBoxes(ctx as any);
  const {
    cancelMarkerDrag,
    renderMarkers,
    scheduleMarkerPositionUpdate,
    updateMarkerPositions,
    updateMarkerVisibility
  } = createMarkerLayer(ctx as any);
  const {
    applyPageBehavior,
    clearInputState,
    trackUserInput,
    updateActivityHolds,
    updateIdleControllers
  } = createInputActivity(ctx as any);
  const {
    advanceCameraTransition,
    beginCameraTransition,
    focusBinding,
    stopVacuumFollow,
    syncCameraInteraction,
    updateVacuumFollow
  } = createCameraTransition(ctx as any);
  const { applySceneUpdate, handleHostMessage } = createHostMessageHandler(ctx as any);

  const markersElement = makeElement("div", "i3d-markers");
  const vacuumWorkingLayerElement = makeElement("div", "i3d-vacuum-working-layer");
  let idleIconHideDeadline = 0;
  let lastCameraQuaternionKey = "";
  let areIconsHiddenByRotation = false;
  let lastFrameTimestamp = 0;
  let lastVacuumQuipSlot = -1;
  let followedVacuumId = "";
  let preFollowCameraState: any = null;
  let followCameraPose: any = null;
  const previousCameraQuaternion = new THREE.Quaternion();
  let previousFrameTimestamp: any = null;
  const presentationElement = makeElement("div", "i3d-presentation");
  let presentationLayout: any = null;
  let presentationScaleX = 1;
  const focusVignetteElement = makeElement("div", "i3d-focus-vignette");
  focusVignetteElement.setAttribute("aria-hidden", "true");
  const toolbarElement = makeElement("nav", "i3d-toolbar");
  const navigationElement = makeElement("div", "i3d-navigation");
  const floorTabsElement = makeElement("nav", "i3d-floor-tabs");
  floorTabsElement.setAttribute("aria-label", "选择楼层");
  let floorTabsSignature = "";
  const moduleTabsElement = makeElement("nav", "i3d-module-tabs");
  moduleTabsElement.setAttribute("aria-label", "3D 控制模块");
  let modulePanelOpenState: any = null;
  let modulePanelAnimation: any = null;
  const moduleTabsByModule = new Map<string, any>();
  let configuredModules = configuredModuleKinds(config);
  // 页签清单在 stage/module-tabs.js：顺序与文案都在那里，本文件不再就地写一份。
  for (const [moduleKey, moduleLabel] of MODULE_TABS) {
    const moduleTabButton = makeElement("button", "", moduleLabel);
    moduleTabButton.type = "button";
    moduleTabButton.dataset.module = moduleKey;
    moduleTabButton.style.setProperty("--i3d-tab-index", String(moduleTabsByModule.size));
    moduleTabButton.addEventListener("click", () => {
      // 调整导航位置时拖完整条轨道会紧跟一个 click，别让它顺手切了模块（见 bindNavigationDrag）。
      if (moduleTabsElement.dataset.dragged === "true") {
        moduleTabsElement.dataset.dragged = "";
        return;
      }
      selectModule(moduleKey);
    });
    moduleTabsElement.append(moduleTabButton);
    moduleTabsByModule.set(moduleKey, moduleTabButton);
  }
  const moduleEmptyElement = makeElement("p", "i3d-module-empty");
  moduleEmptyElement.setAttribute("role", "status");
  moduleEmptyElement.hidden = true;
  // 编辑态的「正在配置：…」提示条。画布上的轮廓只圈得出位置、圈不出名字：同一柜面上并排
  const editorSelectionElement = makeElement("p", "i3d-editor-selection");
  editorSelectionElement.setAttribute("role", "status");
  editorSelectionElement.hidden = true;
  const resetViewButton = makeElement("button", "", "恢复视角");
  resetViewButton.type = "button";
  resetViewButton.hidden = true;
  toolbarElement.append(resetViewButton);
  const lightPanelElement = makeElement("section", "i3d-light-panel");
  lightPanelElement.setAttribute("aria-label", "灯光控制");
  lightPanelElement.setAttribute("inert", "");
  const lightPanelHeader = makeElement("header");
  const lightHeadingText = makeElement("div", "i3d-light-heading-text");
  const lightHeadingLabel = makeElement("strong", "", "灯光");
  const lightStatusElement = makeElement("p", "i3d-device-status");
  lightHeadingText.append(lightHeadingLabel, lightStatusElement);
  const powerButton = makeElement("button", "i3d-power");
  powerButton.type = "button";
  const lampDrawingElement = makeElement("span", "i3d-lamp-drawing");
  lampDrawingElement.setAttribute("aria-hidden", "true");
  const lampAuraElement = makeElement("span", "i3d-lamp-aura");
  const lampBodyElement = makeElement("span", "i3d-lamp-body");
  for (const lampPartName of ["cord", "shade", "bulb", "filament"]) {
    lampBodyElement.append(makeElement("i", "i3d-lamp-" + lampPartName));
  }
  lampDrawingElement.append(lampAuraElement, lampBodyElement);
  powerButton.append(lampDrawingElement);
  lightPanelHeader.append(lightHeadingText, powerButton);
  const lightControlsElement = makeElement("div", "i3d-light-controls");
  /**
   * 建一根灯光滑杆（亮度 / 色温）。
   */
  function createSliderControl(labelText: any, sliderName: any, minValue: any, maxValue: any) {
    const sliderLabelElement = makeElement("label", "i3d-slider i3d-" + sliderName);
    const sliderLabelTextElement = makeElement("span", "", labelText);
    const sliderOutputElement = makeElement("output");
    const sliderInputElement = makeElement("input");
    sliderInputElement.name = "i3d-light-" + sliderName;
    sliderInputElement.type = "range";
    sliderInputElement.min = minValue;
    sliderInputElement.max = maxValue;
    sliderInputElement.step = sliderName === "temperature" ? "10" : "1";
    sliderInputElement.setAttribute("aria-label", labelText);
    const sliderHeadingElement = makeElement("div", "i3d-slider-heading");
    sliderHeadingElement.append(sliderLabelTextElement, sliderOutputElement);
    const sliderLegendElement = makeElement("span", "i3d-slider-legend");
    sliderLegendElement.append(
      makeElement("small", "", sliderName === "temperature" ? "暖色" : "暗"),
      makeElement("small", "", sliderName === "temperature" ? "冷色" : "亮")
    );
    sliderLabelElement.append(sliderHeadingElement, sliderInputElement, sliderLegendElement);
    sliderInputElement.addEventListener("input", () => {
      sliderOutputElement.value =
        "" + sliderInputElement.value + (sliderName === "temperature" ? " K" : "%");
      const activeLightBinding = findFocusedBinding();
      if (
        !!activeLightBinding &&
        !isEditing &&
        !!readLightState(activeLightBinding.entityId).available
      ) {
        lightPreview.set(activeLightBinding.entityId, sliderName, Number(sliderInputElement.value));
        wakeFrameLoop();
        renderLightPanel();
        applyLightStates({
          preview: true
        });
      }
    });
    sliderInputElement.addEventListener(
      "change",
      () => void runLightCommand(sliderName, Number(sliderInputElement.value))
    );
    lightControlsElement.append(sliderLabelElement);
    return {
      root: sliderLabelElement,
      input: sliderInputElement,
      value: sliderOutputElement
    };
  }
  const temperatureControl = createSliderControl("色温", "temperature", "2000", "6500");
  const brightnessControl = createSliderControl("亮度", "brightness", "1", "100");
  const presetGroupElement = makeElement("div", "i3d-light-presets");
  presetGroupElement.setAttribute("role", "group");
  presetGroupElement.setAttribute("aria-label", "灯光预设");
  const presetEntries = LIGHT_PRESETS.map((preset: any) => {
    const presetButton = makeElement("button", "i3d-light-preset");
    presetButton.type = "button";
    const presetDetail = makeElement("small", "", preset.brightness + "%");
    presetButton.append(makeElement("strong", "", preset.label), presetDetail);
    presetButton.addEventListener("click", () => void runLightCommand("preset", preset));
    presetGroupElement.append(presetButton);
    return {
      ...preset,
      button: presetButton,
      detail: presetDetail
    };
  });
  lightControlsElement.append(presetGroupElement);
  const controlErrorElement = makeElement("p", "i3d-control-error");
  controlErrorElement.setAttribute("role", "status");
  const climateRequestsById = new Map<string, any>();
  const climatePanel = createClimatePanel({
    // 面板开关机时用它换回「上次使用的模式」（HA 关机后不再上报原模式）。
    modeHistory: climateModeHistory,
    // 净化器「附加功能」卡片拖动排序 / 改尺寸后的布局回传。上游同口径：只有编辑态才回报
    onLayout: (extraControls: any) => {
      const layoutBinding = findFocusedBinding();
      if (!isEditing || activeModule !== "climate" || !layoutBinding) {
        return;
      }
      postToHost({
        type: "edit",
        action: "purifier-layout",
        id: layoutBinding.id,
        extraControls
      });
    },
    onControl: (climateCommand: any) =>
      new Promise((resolveClimate, rejectClimate) => {
        const climateBinding = collectClimateBindings().find(
          (climateDevice: any) =>
            isOnActiveFloor(climateDevice) &&
            climateDevice.modelAvailable &&
            // 净化器的「附加功能」实体（开关 / 模式 / 滤芯寿命…）不属于控件的绑定实体本身，
            (climateCommand.deviceKind === "purifier-extra"
              ? (climateDevice.extraControls || []).some(
                  (extraControl: any) => extraControl.entityId === climateCommand.entityId
                )
              : climateDevice.entityId === climateCommand.entityId)
        );
        if (
          !isInteractive ||
          isEditing ||
          isDisposed ||
          activeModule !== "environment" ||
          !climateBinding?.modelId ||
          !climateBinding.modelAvailable
        ) {
          rejectClimate(new Error("当前空调不可控制。"));
          return;
        }
        const climateRequestId = "climate-" + ++requestSeq;
        const climateTimeoutId = setTimeout(
          () => settleClimateRequest(climateRequestId, "请求超时，请检查设备状态。"),
          14000
        );
        climateRequestsById.set(climateRequestId, {
          resolve: resolveClimate,
          reject: rejectClimate,
          timeout: climateTimeoutId
        });
        postToHost({
          type: "control",
          requestId: climateRequestId,
          command: climateCommand
        });
      })
  });


  const bladePendingByEntityId = new Map<string, any>();
  const coverRequestsById = new Map<string, any>();
  let coverStorage: any;
  if (lightHistoryScope) {
    try {
      // 同 localStorage：会话存储被禁用时放弃封面状态的续算（storage 传 null 即关闭该能力）。
      coverStorage = window.sessionStorage;
    } catch {
      // 见上：coverStorage 保持 undefined，翻板的续算与持久化整体关闭，
    }
  }
  const coverFeedback = createCoverFeedback({
    commandPreview: true,
    storage: coverStorage,
    scope: lightHistoryScope
  });
  const dreamCoverFeedback = createCoverFeedback({
    commandPreview: true,
    travelTime: 2400
  });






  // 窗帘面板的预览 / 控制回调只按 entityId 反查普通窗帘绑定，与「是不是组合」无关：
  const coverPanelPreview = (coverEntityId: any, bladePosition: any) => {
      const panelCoverBinding = collectCurtainBindings().find(
        (panelDevice: any) => panelDevice.entityId === coverEntityId
      );
      if (
        bladePosition !== null &&
        panelCoverBinding?.coverKind === "dream" &&
        !coverCanAdjustBlades(
          coverState(
            panelCoverBinding.entityId,
            statesByEntityId[panelCoverBinding.entityId],
            panelCoverBinding
          ) as any,
          resolveCoverPresentation(panelCoverBinding)
        )
      ) {
        return resolveCoverPresentation(panelCoverBinding);
      } else {
        if (bladePosition === null) {
          dreamCoverFeedback.preview(coverEntityId, null);
          coverFeedback.preview(coverEntityId, null);
        } else {
          (panelCoverBinding?.coverKind === "dream" ? dreamCoverFeedback : coverFeedback).preview(
            coverEntityId,
            bladePosition
          );
        }
        syncCoverFeedback();
        wakeFrameLoop();
        if (panelCoverBinding) {
          return resolveCoverPresentation(panelCoverBinding);
        } else {
          return coverFeedback.read(coverEntityId, undefined);
        }
      }
  };
  const coverPanelControl = (coverCommand: any) =>
    new Promise((resolveCover, rejectCover) => {
        const controlCoverBinding = collectCurtainBindings().find(
          (controlDevice: any) =>
            isOnActiveFloor(controlDevice) &&
            controlDevice.entityId === coverCommand.entityId &&
            controlDevice.modelAvailable
        );
        if (
          !isInteractive ||
          isEditing ||
          isDisposed ||
          activeModule !== "environment" ||
          !controlCoverBinding?.modelId
        ) {
          rejectCover(new Error("当前窗帘不可控制。"));
          return;
        }
        const coverRequestId = "cover-" + ++requestSeq;
        const coverTimeoutId = setTimeout(
          () => settleCoverRequest(coverRequestId, "请求超时，请检查设备状态。"),
          14000
        );
        syncCurtains();
        const usesBladeAxis =
          controlCoverBinding.coverKind === "dream" &&
          ["set_cover_position", "set_cover_tilt_position"].includes(coverCommand.service);
        if (
          usesBladeAxis &&
          !coverCanAdjustBlades(
            coverState(
              controlCoverBinding.entityId,
              statesByEntityId[controlCoverBinding.entityId],
              controlCoverBinding
            ) as any,
            resolveCoverPresentation(controlCoverBinding)
          )
        ) {
          clearTimeout(coverTimeoutId);
          rejectCover(new Error("只有确认整体完全关闭且停止后，才能调整叶片。"));
          return;
        }
        let shouldDeferCover = false;
        if (!usesBladeAxis && controlCoverBinding.coverKind === "dream") {
          bladePendingByEntityId.delete(controlCoverBinding.entityId);
          const resolvedCoverPresentation = resolveCoverPresentation(controlCoverBinding);
          shouldDeferCover =
            coverCommand.service === "open_cover" &&
            (resolvedCoverPresentation as any).tiltPosition !== null &&
            Math.abs((resolvedCoverPresentation as any).tiltPosition - 50) > 0.01;
          if (shouldDeferCover) {
            bladePendingByEntityId.set(controlCoverBinding.entityId, {
              requestId: coverRequestId,
              reported: (resolvedCoverPresentation as any).raw.attributes.current_position
            });
          }
          if (coverCommand.service === "stop_cover") {
            dreamCoverFeedback.begin(
              {
                ...coverCommand
              },
              coverRequestId
            );
          } else {
            dreamCoverFeedback.begin(
              {
                ...coverCommand,
                service: "set_cover_position",
                data: {
                  position: 50
                }
              },
              coverRequestId
            );
          }
        }
        const coverFeedbackTarget = usesBladeAxis ? dreamCoverFeedback : coverFeedback;
        coverFeedbackTarget.begin(
          usesBladeAxis
            ? {
                ...coverCommand,
                service: "set_cover_position",
                data: {
                  position: coverCommand.data.tilt_position ?? coverCommand.data.position
                }
              }
            : coverCommand,
          coverRequestId,
          {
            defer: shouldDeferCover
          }
        );
        syncCoverFeedback();
        coverRequestsById.set(coverRequestId, {
          resolve: resolveCover,
          reject: rejectCover,
          timeout: coverTimeoutId,
          entityId: coverCommand.entityId,
          feedback: coverFeedbackTarget
        });
        postToHost({
          type: "control",
          requestId: coverRequestId,
          command: coverCommand
        });
        renderMarkers();
        wakeFrameLoop();
      });
  const coverPanel = createCoverPanel({
    onPreview: coverPanelPreview as any,
    onControl: coverPanelControl as any
  });
  // 窗帘组合面板：把每名成员转发成一块普通窗帘子面板，命令 / 预览沿用上面同一对回调。
  const coverGroupPanel = createCoverGroupPanel({
    onPreview: coverPanelPreview as any,
    onControl: coverPanelControl as any
  });


  const televisionRequestsById = new Map<string, any>();
  // 通用设备附加实体的在途请求：与电视 / 空调各自一张表，超时与失败互不牵连。
  const deviceRequestsById = new Map<string, any>();
  const nasPanel = createNasPanel();
  const televisionPanel = createTelevisionPanel({
    onControl: televisionCommand =>
      new Promise((resolveTelevision, rejectTelevision) => {
        const televisionDevice = findFocusedBinding();
        if (
          !isInteractive ||
          isEditing ||
          isDisposed ||
          activeModule !== "devices" ||
          televisionDevice?.deviceKind !== "television" ||
          !televisionDevice.modelAvailable ||
          ((["turn_on", "turn_off"].includes((televisionCommand as any).service) &&
            televisionDevice.powerEntityId) ||
            televisionDevice.entityId) !== (televisionCommand as any).entityId
        ) {
          rejectTelevision(new Error("当前电视不可控制。"));
          return;
        }
        const televisionRequestId = "television-" + ++requestSeq;
        const televisionTimeoutId = setTimeout(
          () => settleTelevisionRequest(televisionRequestId, "请求超时，请检查设备状态。"),
          14000
        );
        televisionRequestsById.set(televisionRequestId, {
          resolve: resolveTelevision,
          reject: rejectTelevision,
          timeout: televisionTimeoutId
        });
        postToHost({
          type: "control",
          requestId: televisionRequestId,
          command: televisionCommand
        });
      })
  });


  // 通用设备弹窗（冰箱 / 冰柜 / 洗碗机 / 洗衣机 / 烘干机 / 绿植）：与空气净化器共用「附加功能卡片网格」。
  const devicePanel = createDevicePanel({
    onLayout: extraControls => {
      const layoutBinding = findFocusedBinding();
      // 同净化器那处：编辑通用设备时 activeModule 是品类名（fridge / plant / …），
      if (
        !isEditing ||
        !(activeModule === "devices" || isGenericDeviceKind(activeModule)) ||
        !layoutBinding
      ) {
        return;
      }
      postToHost({
        type: "edit",
        action: "device-layout",
        id: layoutBinding.id,
        extraControls
      });
    },
    onControl: deviceCommand =>
      new Promise((resolveDevice, rejectDevice) => {
        const deviceBinding = findFocusedBinding();
        if (
          !isInteractive ||
          isEditing ||
          isDisposed ||
          activeModule !== "devices" ||
          !isGenericDeviceKind(deviceBinding?.deviceKind) ||
          !deviceBinding.modelAvailable ||
          !(deviceBinding.extraControls || []).some(
            (deviceExtra: any) => deviceExtra.entityId === deviceCommand.entityId
          )
        ) {
          rejectDevice(new Error("当前设备不可控制。"));
          return;
        }
        const deviceRequestId = "device-" + ++requestSeq;
        const deviceTimeoutId = setTimeout(
          () => settleDeviceRequest(deviceRequestId, "请求超时，请检查设备状态。"),
          14000
        );
        deviceRequestsById.set(deviceRequestId, {
          resolve: resolveDevice,
          reject: rejectDevice,
          timeout: deviceTimeoutId
        });
        postToHost({
          type: "control",
          requestId: deviceRequestId,
          command: deviceCommand
        });
      })
  });

  // 门锁弹窗：门锁本体状态 + 门磁开合 + 电量 + 密码 + 上锁 / 解锁 / 释放锁舌。
  const lockPanel = createLockPanel({
    onControl: lockCommand =>
      new Promise((resolveLock, rejectLock) => {
        const lockBinding = findFocusedBinding();
        if (
          !isInteractive ||
          isEditing ||
          isDisposed ||
          activeModule !== "security" ||
          lockBinding?.deviceKind !== "lock" ||
          !lockBinding.modelAvailable ||
          lockCommand.entityId !== lockBinding.entityId
        ) {
          rejectLock(new Error("当前门锁不可控制。"));
          return;
        }
        const lockRequestId = "lock-" + ++requestSeq;
        const lockTimeoutId = setTimeout(
          () => settleDeviceRequest(lockRequestId, "请求超时，请检查门锁状态。"),
          14000
        );
        deviceRequestsById.set(lockRequestId, {
          resolve: resolveLock,
          reject: rejectLock,
          timeout: lockTimeoutId
        });
        postToHost({
          type: "control",
          requestId: lockRequestId,
          command: lockCommand
        });
      })
  });

  lightPanelElement.append(
    lightPanelHeader,
    lightControlsElement,
    controlErrorElement,
    climatePanel.root,
    coverPanel.root,
    coverGroupPanel.root,
    nasPanel.root,
    televisionPanel.root,
    devicePanel.root,
    lockPanel.root
  );

  /**
   * 非灯光面板的登记表。
   */
  const panelRegistry = [
    {
      match: (binding: any) => isGenericDeviceKind(binding.deviceKind),
      root: devicePanel.root,
      // 标签按品类走：「冰箱控制」「洗衣机控制」…，比统一的「设备控制」好认。
      label: (binding: any) =>
        (binding.deviceLabel || genericDeviceProfile(binding.deviceKind)?.label || "设备") +
        "控制",
      // 通用设备有自己的一套竖直上限（见 device-panel.css）：面板里那台机器（冰箱 190px）
      hostClass: "is-device-panel",
      deferWhenFocusOnly: true,
      show: (binding: any) => {
        // 面板没打开时不画：附加功能卡片的 update() 要重建整片网格。
        if (!lightPanelElement.classList.contains("is-open")) {
          return;
        }
        devicePanel.root.hidden = false;
        devicePanel.update({
          item: binding,
          states: statesByEntityId,
          // 与 climatePanel 同口径：编辑预览态要一并传下去，卡片网格靠它切到
          editing: isEditing,
          // 户型图里把那台设备的模型删掉后，卡片不能停在上一次的状态上装没事：
          error: binding.modelAvailable ? "" : "设备模型已移除，请重新配置。"
        });
      }
    },
    {
      match: (binding: any) => binding.deviceKind === "nas",
      root: nasPanel.root,
      label: "NAS 状态",
      hostClass: "is-nas-panel",
      // NAS 绑定的 clickAction 缺省就是 focus（见 binding-collectors），
      deferWhenFocusOnly: true,
      show: (binding: any) => {
        nasPanel.root.hidden = false;
        nasPanel.update({
          item: binding,
          states: statesByEntityId
        });
      }
    },
    {
      match: (binding: any) => binding.deviceKind === "television",
      root: televisionPanel.root,
      label: "电视状态",
      hostClass: "is-television-panel",
      deferWhenFocusOnly: true,
      show: (binding: any) => {
        // update() 要重算每一路信号源，面板没打开时不画：这时候没人看得见这份内容。
        if (!lightPanelElement.classList.contains("is-open")) {
          return;
        }
        televisionPanel.root.hidden = false;
        if (isEditing || binding.clickAction !== "focus") {
          televisionPanel.update({
            item: binding,
            states: statesByEntityId,
            editing: isEditing || !isInteractive
          });
        }
      }
    },
    {
      match: (binding: any) => binding.deviceKind === "lock",
      root: lockPanel.root,
      label: (binding: any) => binding.label || "门锁控制",
      hostClass: "is-lock-panel",
      deferWhenFocusOnly: true,
      // 让位时作废本地状态：门密码只允许用于一次操作，不能留在输入框里等下一次打开。
      hide: () => lockPanel.hide(),
      show: (binding: any) => {
        lockPanel.root.hidden = false;
        lockPanel.update({
          item: binding,
          states: statesByEntityId,
          editing: isEditing
        });
      }
    },
    {
      match: (binding: any) => binding.isCurtainGroup === true,
      root: coverGroupPanel.root,
      label: (binding: any) => binding.label || "双层窗帘",
      hostClass: "is-cover-group-panel",
      // 竖排 / 并排由组合的 panelLayout 决定：类名挂在容器上（不是面板根），与 hostClass 同一层，
      hide: () => lightPanelElement.classList.remove("is-cover-group-vertical"),
      show: (binding: any) => {
        coverGroupPanel.root.hidden = false;
        lightPanelElement.classList.toggle(
          "is-cover-group-vertical",
          binding.panelLayout === "vertical"
        );
        // 组合的视图模型按**成员 id**（普通窗帘的裸 id）分发状态 / 展示态 / 错误：
        const memberStates: Record<string, any> = {};
        const memberPresentations: Record<string, any> = {};
        const memberErrors: Record<string, any> = {};
        for (const memberItem of binding.memberItems || []) {
          const memberState = coverState(
            memberItem.entityId,
            statesByEntityId[memberItem.entityId],
            memberItem
          );
          if (!memberItem.modelAvailable) {
            memberState.available = false;
          }
          const memberPresentation = resolveCoverPresentation(memberItem, memberState as any);
          memberStates[memberItem.id] = memberState;
          memberPresentations[memberItem.id] = memberPresentation;
          memberErrors[memberItem.id] = memberItem.modelAvailable
            ? memberPresentation.error || ""
            : "窗帘模型已移除，请重新配置。";
        }
        coverGroupPanel.update({
          item: binding,
          states: memberStates,
          presentations: memberPresentations,
          editing: isEditing,
          errors: memberErrors
        });
      }
    },
    {
      match: (binding: any) => binding.deviceKind === "cover" && binding.isCurtainGroup !== true,
      root: coverPanel.root,
      label: "窗帘控制",
      hostClass: "is-cover-panel",
      show: (binding: any) => {
        coverPanel.root.hidden = false;
        const coverStateValue = coverState(
          binding.entityId,
          statesByEntityId[binding.entityId],
          binding
        );
        if (!binding.modelAvailable) {
          coverStateValue.available = false;
        }
        const coverPanelPresentation = resolveCoverPresentation(binding, coverStateValue as any);
        coverPanel.update({
          item: binding,
          state: coverStateValue,
          presentation: coverPanelPresentation,
          editing: isEditing,
          error: binding.modelAvailable
            ? coverPanelPresentation.error || ""
            : "窗帘模型已移除，请重新配置。"
        });
      }
    },
    {
      match: (binding: any) => !!binding.modelId,
      root: climatePanel.root,
      label: "空调控制",
      hostClass: "is-climate-panel",
      show: (binding: any) => {
        climatePanel.root.hidden = false;
        const climateStateValue = climateState(
          binding.entityId,
          statesByEntityId[binding.entityId]
        );
        if (!binding.modelAvailable) {
          climateStateValue.available = false;
        }
        climatePanel.update({
          item: binding,
          state: climateStateValue,
          // 附加功能卡片要读实时状态（开关态、下拉候选、数值范围），而 climateState 只覆盖
          states: statesByEntityId,
          editing: isEditing,
          error: binding.modelAvailable ? "" : "空调模型已移除，请重新配置。"
        });
      }
    }
  ];
  const curtainMotion = createCurtainMotion({
    THREE: THREE as any,
    requestRender: () => wakeFrameLoop()
  });
  let curtainFloorIds: any[] = [];
  let coverBindings: any[] = [];
  // 门动画：与窗帘动画同源的一类「把状态翻成网格姿态」的东西，但门的可动骨架来自
  const lockMotion = createLockMotion({
    modelRoot: stageOptions.modelRoot,
    requestRender: () => {
      stageOptions.requestRender?.();
      wakeFrameLoop();
    },
    invalidateReflections: ((invalidatedModelIds: any) =>
      stageOptions.invalidateReflections?.(invalidatedModelIds)) as any
  });
  // 参与门动画的门锁绑定（含实体、开角、时长、开向）。逐帧 tick 只读这份缓存：绑定归一其实
  let lockDoorModelsList: any[] = [];
  // 上一帧门是否还在动。tick 的返回值在 renderFrame 中段产生，而「下一帧要不要立刻排」
  let lockMotionActive = false;


  /**
   * 重建窗帘绑定，并把状态同步给动画、反馈缓存与宿主。
   */
  const syncCurtains = createSnapshotSyncer(
    () => ({
      config,
      states: statesByEntityId,
      root: stageOptions.modelRoot,
      revision: stageOptions.sceneRevision,
      source: (stageOptions.document as any)
    }),
    ({ root, revision }) => {
      const curtainBindings = [...collectCurtainBindings(), ...collectPreviewCovers()];
      coverBindings = curtainBindings;
      curtainFloorIds = [
        ...new Set(
          curtainBindings.map((curtainFloorEntry: any) => curtainFloorEntry.floorId).filter(Boolean)
        )
      ];
      curtainMotion.setBindings(root, curtainBindings, revision);
      coverFeedback.retain(
        curtainBindings.map((retainedCurtainEntry: any) => retainedCurtainEntry.entityId)
      );
      const dreamCurtainEntityIds = curtainBindings
        .filter((dreamCurtainEntry: any) => dreamCurtainEntry.coverKind === "dream")
        .map((dreamCurtainIdEntry: any) => dreamCurtainIdEntry.entityId);
      dreamCoverFeedback.retain(dreamCurtainEntityIds);
      for (const bladeEntityId of bladePendingByEntityId.keys()) {
        if (!dreamCurtainEntityIds.includes(bladeEntityId)) {
          bladePendingByEntityId.delete(bladeEntityId);
        }
      }
      for (const curtainSyncBinding of curtainBindings) {
        const curtainCoverState = coverState(
          curtainSyncBinding.entityId,
          statesByEntityId[curtainSyncBinding.entityId],
          curtainSyncBinding
        );
        if (curtainSyncBinding.coverKind === "dream") {
          dreamCoverFeedback.sync(curtainSyncBinding.entityId, {
            ...curtainCoverState,
            dream: false,
            overallFeedbackAvailable: true,
            axis: "blade",
            state: "open",
            position: curtainCoverState.tiltPosition,
            opening: false,
            closing: false,
            moving: false
          });
        }
        coverFeedback.sync(curtainSyncBinding.entityId, curtainCoverState);
      }
      syncCoverFeedback();
      stageOptions.curtainFrame?.({
        key: curtainMotion.poseKey(),
        structure: curtainMotion.structureKey(),
        floorIds: curtainFloorIds,
        moving: curtainMotion.isMoving() || nextCoverDelayMs() <= 1000 / 30
      });
    }
  );
  stageOptions.setCurtainSync?.(syncCurtains);

  /**
   * 重算「参与门动画的门锁绑定」清单，供门动画逐帧使用。
   */
  const syncLocks = createSnapshotSyncer(
    () => ({
      config,
      root: stageOptions.modelRoot,
      revision: stageOptions.sceneRevision,
      source: (stageOptions.document as any)
    }),
    () => {
      // modelId 统一成 door:<id>：场景侧一律按这个前缀打标，而老配置可能没写前缀、
      const lockFloors = (stageFloors() as any) || [];
      lockDoorModelsList = (config.security?.locks || []).map((securityLockEntry: any) => {
        const rawModelId = String(securityLockEntry.modelId || "").replace(/^(?:door:)+/, "");
        const lockFloor = lockFloors.find(
          (floorCandidate: any) => floorCandidate.id === securityLockEntry.floorId
        );
        return {
          ...securityLockEntry,
          modelId: rawModelId ? "door:" + rawModelId : "",
          hinge: lockHinge(securityLockEntry, lockFloor)
        };
      });
    }
  );
  const nasStatus = createNasStatus({
    THREE: THREE as any,
    requestFrame: () => {
      stageOptions.requestRender?.();
      wakeFrameLoop();
    }
  });
  // 通用设备（冰箱 / 冰柜 / 洗碗机 / 洗衣机 / 烘干机 / 绿植）状态灯：每个品类一盏，复用 NAS 那套平面灯，
  const genericDeviceStatusLights = new Map(
    GENERIC_DEVICE_KINDS.map((deviceKind: any) => [
      deviceKind,
      createNasStatus({
        THREE: THREE as any,
        // 按品类传各自的 modelType：平面灯据此在场景里认领同类型模型，并决定走四态还是 NAS 内置绿。
        modelType: genericDeviceProfile(deviceKind)?.modelType,
        // 与设备弹窗读同一份 deviceStatus，两处显示不会各说各话。
        readState: deviceStatus as any,
        requestFrame: () => {
          stageOptions.requestRender?.();
          wakeFrameLoop();
        }
      })
    ])
  );
  const cameraStatus = createCameraStatus({
    THREE: THREE as any,
    requestFrame: () => stageOptions.requestRender?.()
  });
  // 摄像头状态同步：安防模块且非「全部楼层」时才全亮（1），其余压暗到 0.55，
  const syncCameraStatus = createSnapshotSyncer(
    () => {
      const isEnabled = !isViewEditing && !isRangeEditorOpen;
      const brightness = activeModule === "security" && currentFloorId !== "all" ? 1 : 0.55;
      return {
        config,
        states: statesByEntityId,
        root: stageOptions.modelRoot,
        revision: stageOptions.sceneRevision,
        enabled: isEnabled,
        brightness
      };
    },
    ({ root, revision, states, enabled, brightness }) => {
      // 摄像头状态灯的挂载尺寸取自场景模型；模型缺失（刚删模型、跨楼层切换中）时
      const cameraBindings = (config.security?.cameras || []).map((cameraBindingEntry: any) => {
        const cameraSceneItem = (stageFloors() as any)
          .find((cameraStatusFloor: any) => cameraStatusFloor.id === cameraBindingEntry.floorId)
          ?.scene.items.find(
            (cameraSceneItemMatch: any) =>
              cameraSceneItemMatch.id === cameraBindingEntry.modelId &&
              cameraSceneItemMatch.type === "camera"
          );
        return {
          ...cameraBindingEntry,
          width: cameraSceneItem?.width || 0.2,
          height: cameraSceneItem?.height || 0.3,
          depth: cameraSceneItem?.depth || 0.2
        };
      });
      cameraStatus.sync({
        root,
        revision,
        bindings: cameraBindings,
        states,
        enabled,
        brightness
      });
    }
  );
  // NAS 状态同步：全部楼层时模型缩到 0.75；设备相关模块下全亮，其余压暗到 0.6。
  const syncNasStatus = createSnapshotSyncer(
    () => ({
      config,
      states: statesByEntityId,
      root: stageOptions.modelRoot,
      revision: stageOptions.sceneRevision,
      enabled: !isViewEditing && !isRangeEditorOpen,
      sizeScale: currentFloorId === "all" ? 0.75 : 1,
      brightness:
        currentFloorId !== "all" && ["devices", "nas", "television"].includes(activeModule)
          ? 1
          : 0.6
    }),
    ({ root, revision, states, enabled, sizeScale, brightness }) => {
      nasStatus.sync({
        root,
        revision,
        bindings: collectNasBindings(),
        states,
        enabled,
        sizeScale,
        brightness
      });
    }
  );
  // 通用设备状态灯同步：快照口径与 syncNasStatus 对齐（全部楼层缩到 0.75，非当前楼层压暗到 0.6），
  const syncGenericDeviceStatus = createSnapshotSyncer(
    () => ({
      config,
      states: statesByEntityId,
      root: stageOptions.modelRoot,
      revision: stageOptions.sceneRevision,
      enabled: !isViewEditing && !isRangeEditorOpen,
      sizeScale: currentFloorId === "all" ? 0.75 : 1,
      brightness:
        currentFloorId !== "all" &&
        (["devices", "nas", "television"].includes(activeModule) ||
          isGenericDeviceKind(activeModule))
          ? 1
          : 0.6
    }),
    ({ root, revision, states, enabled, sizeScale, brightness }) => {
      const genericDeviceBindingsByKind = new Map(
        GENERIC_DEVICE_KINDS.map((deviceKind: any) => [deviceKind, [] as any[]])
      );
      for (const genericDeviceBinding of collectAllDeviceBindings()) {
        // 只有 deviceKind 本身就是品类名（fridge / washer…）的才是通用设备；
        if (isGenericDeviceKind(genericDeviceBinding.deviceKind)) {
          genericDeviceBindingsByKind
            .get(genericDeviceBinding.deviceKind)!
            .push(genericDeviceBinding);
        }
      }
      for (const [deviceKind, genericDeviceStatusLight] of genericDeviceStatusLights) {
        genericDeviceStatusLight.sync({
          root,
          revision,
          bindings: genericDeviceBindingsByKind.get(deviceKind),
          states,
          enabled,
          sizeScale,
          brightness
        });
      }
    }
  );
  const televisionScreens = createTelevisionScreens({
    THREE: THREE as any,
    requestFrame: invalidatedModelIds => {
      stageOptions.requestRender?.();
      stageOptions.invalidateReflections?.(invalidatedModelIds);
      wakeFrameLoop();
    }
  });
  const syncTelevisionScreens = createSnapshotSyncer(
    () => ({
      config,
      states: statesByEntityId,
      root: stageOptions.modelRoot,
      revision: stageOptions.sceneRevision,
      focused:
        activeModule !== "light" && !isViewEditing && !isRangeEditorOpen
          ? isEditing
            ? selectedId
            : focusedId
          : "",
      module: activeModule
    }),
    ({ root, revision, states }) => {
      televisionScreens.sync({
        root,
        revision,
        bindings: collectTelevisionBindings(),
        states,
        focusedModel: "",
        dimStrength: 0
      });
    }
  );
  const environmentScene = createEnvironmentScene({
    THREE: THREE as any,
    requestFrame: (invalidatedIds: any) => {
      stageOptions.requestRender?.();
      stageOptions.invalidateReflections?.(invalidatedIds);
      wakeFrameLoop();
    }
  });
  stageOptions.setTelevisionSync?.(syncTelevisionScreens);
  stageOptions.setEnvironmentScene?.(environmentScene);
  const environmentAirflow = createEnvironmentAirflow({
    THREE: THREE as any,
    requestFrame: () => {
      stageOptions.requestRender?.();
      wakeFrameLoop();
    }
  });
  stageOptions.setEnvironmentAirflow?.(environmentAirflow);
  const viewHelpElement = makeElement(
    "p",
    "i3d-view-help",
    "拖动旋转 · 右键平移 · 滚轮缩放。调整完成后固定视角。"
  );
  viewHelpElement.hidden = true;
  navigationElement.append(moduleTabsElement);
  presentationElement.append(
    markersElement,
    vacuumWorkingLayerElement,
    navigationElement,
    floorTabsElement,
    moduleEmptyElement,
    editorSelectionElement,
    lightPanelElement,
    viewHelpElement
  );
  navigationElement.append(toolbarElement);
  containerElement.append(focusVignetteElement, presentationElement);
  const screenOutlines = createScreenOutlines({
    THREE: THREE as any,
    container: containerElement,
    getCamera: () => stageOptions.camera,
    getObjectCamera: (cameraRequest: any) =>
      stageOptions.presentationCamera?.(cameraRequest) || stageOptions.camera
  });








  const followButton = makeElement("button", "", "跟随漫游");
  followButton.type = "button";
  followButton.hidden = true;
  followButton.title = "以鸟瞰视角跟随扫地机";
  toolbarElement.append(followButton);


  followButton.addEventListener("click", () => {
    if (followedVacuumId) {
      stopVacuumFollow();
      return;
    }
    if (stageOptions.floorTransitionActive || cameraTransition?.owner === "floor") {
      return;
    }
    // 可跟随的只有「在当前楼层」且「已被跟踪（有动画轨迹）」的扫地机；
    const trackedVacuums = (config.devices?.vacuums || []).filter(
      (trackableVacuumEntry: any) =>
        isOnActiveFloor(trackableVacuumEntry) && vacuumMotion.hasTracking(trackableVacuumEntry.id)
    );
    const followTargetVacuum =
      trackedVacuums.find((vacuumCandidate: any) => "vacuum:" + vacuumCandidate.id === focusedId) ||
      trackedVacuums.find(
        (activeVacuumCandidate: any) =>
          vacuumStatusPresentation(activeVacuumCandidate, statesByEntityId).active
      ) ||
      trackedVacuums[0];
    if (!followTargetVacuum) {
      return;
    }
    const followStartCameraState = structuredClone(stageOptions.cameraState(true));
    postToHost({
      type: "vacuum-follow-state",
      active: true
    });
    postToHost({
      type: "vacuum-popup-close"
    });
    exitFocus({
      immediate: true
    });
    cameraTransition = null;
    stageOptions.endCameraMotion();
    preFollowCameraState = followStartCameraState;
    followedVacuumId = followTargetVacuum.id;
    followCameraPose = structuredClone(
      followTargetVacuum.followCamera ||
        vacuumBirdCamera(
          config.camera || followStartCameraState,
          stageOptions.environmentModelPose(followTargetVacuum.floorId, followTargetVacuum.modelId)
            ?.center || followStartCameraState.target
        )
    );
    stageOptions.setFocusViewport(0);
    stageOptions.beginCameraMotion(followCameraPose.mode);
    followButton.textContent = "退出跟随";
    followButton.setAttribute("aria-pressed", "true");
    syncCameraInteraction();
    updateIdleControllers();
    wakeFrameLoop();
  });
  const vacuumFollowCamera = createVacuumFollowCamera(THREE as any);




  const vacuumMaps = createVacuumMaps(stageOptions, () => {
    stageOptions.requestRender?.();
    wakeFrameLoop();
  });
  const vacuumMotion = createVacuumMotion(stageOptions, wakeFrameLoop);
  const presenceScene = createPresenceScene(stageOptions, wakeFrameLoop, () => performance.now());
  const presenceWaves = createPresenceWaves(stageOptions);
  let isPresencePreviewWalk = false;
  let isPresenceHitRangeVisible = false;
  const presenceHitLayerElement = makeElement("div", "i3d-presence-hit-layer");
  presenceHitLayerElement.setAttribute("aria-hidden", "true");
  containerElement.append(presenceHitLayerElement);
  const presenceHitBoxesById = new Map<string, any>();


  // 人体存在场景的开关条件：已呈现、非编辑器画布，且（非编辑态或正处于安防模块）。
  const syncPresenceScene = createSnapshotSyncer(
    () => {
      const isEnabled =
        isPresented &&
        !isEditorCanvas &&
        (!isEditing || activeModule === "security") &&
        !isViewEditing &&
        !isRangeEditorOpen &&
        isPresentedVisible &&
        !document.hidden &&
        !stageOptions.floorTransitionActive &&
        cameraTransition?.owner !== "floor";
      return {
        config,
        states: statesByEntityId,
        revision: stageOptions.sceneRevision,
        floorId: currentFloorId,
        enabled: isEnabled,
        preview: isPresencePreviewWalk,
        module: activeModule
      };
    },
    ({ config: presenceConfig, states, enabled }) => {
      presenceScene.sync(
        presenceConfig.security?.presenceSensors || [],
        states,
        enabled,
        currentFloorId,
        isEditing,
        isPresencePreviewWalk,
        activeModule
      );
    }
  );
  // 单台扫地机地图的开关条件：已呈现且不在编辑 / 视图调整中、页面可见。
  const syncVacuumMap = createSnapshotSyncer(
    () => ({
      config,
      states: statesByEntityId,
      revision: stageOptions.sceneRevision,
      enabled:
        isPresented && !isEditing && !isViewEditing && isPresentedVisible && !document.hidden
    }),
    ({ states, enabled }) => {
      vacuumMotion.sync(
        vacuumBindingsForMap(config.devices?.vacuums || [], states),
        states,
        enabled
      );
    }
  );
  // 房间清扫请求的超时表：请求期间对应按钮保持禁用，
  const vacuumRoomTimersById = new Map<string, any>();
  // 扫地机地图整体只在其专属模块、且非视图编辑 / 范围编辑时开启。
  const syncVacuumMaps = createSnapshotSyncer(
    () => {
      const isEnabled =
        activeModule === "vacuum" &&
        !isViewEditing &&
        !isRangeEditorOpen &&
        !stageOptions.floorTransitionActive &&
        cameraTransition?.owner !== "floor" &&
        isPresentedVisible &&
        !document.hidden;
      return {
        config,
        states: statesByEntityId,
        revision: stageOptions.sceneRevision,
        floorId: currentFloorId,
        enabled: isEnabled
      };
    },
    ({ states, enabled }) => {
      vacuumMaps.sync(
        vacuumBindingsForMap(collectVacuumBindings(), states),
        enabled,
        currentFloorId,
        states
      );
    }
  );
  document.addEventListener("visibilitychange", syncVacuumMaps);




  // 决定是否顺带弹出设备原生弹窗（摄像头 / 扫地机）：仅在非编辑、可交互且
  function maybeOpenDevicePopup(popupBinding: any) {
    if (
      !isEditing &&
      isInteractive &&
      popupBinding.deviceKind === "camera" &&
      popupBinding.entityId &&
      focusedId === popupBinding.id &&
      focusMode !== "edit"
    ) {
      postToHost({
        type: "camera-popup",
        id: popupBinding.id
      });
      return;
    }
    if (
      !followedVacuumId &&
      !isEditing &&
      isInteractive &&
      popupBinding.deviceKind === "vacuum" &&
      popupBinding.entityId &&
      (focusMode === "panel" || popupBinding.clickAction !== "focus") &&
      focusedId === popupBinding.id
    ) {
      postToHost({
        type: "vacuum-popup",
        id: popupBinding.id
      });
    }
  }












  /**
   * 让分类栏 / 楼层栏可以被拖动改位置 —— 只在「导航位置调整态」生效
   * @param {HTMLElement} dragElement 接收指针的元素：分类栏整条轨道 / 楼层栏整列。
   * @param {"categories"|"floors"} navigationKey 写回配置里的哪一条导航。
   * @param {[number, number]} fallbackPosition 配置缺省时的兜底中心点百分比，与布局取法一致。
   */
  function bindNavigationDrag(dragElement: any, navigationKey: any, fallbackPosition: any) {
    // 一次拖动一个状态对象；为 null 说明当前没在拖。
    let navigationDrag: any = null;
    // 读当前生效的中心点百分比：缺省或越界回落兜底位置，夹取口径与布局一致。
    const readOffsetPercent = (axisName: any) => {
      const configuredPercent = config.navigation?.[navigationKey]?.[axisName];
      return Number.isFinite(configuredPercent)
        ? Math.max(0, Math.min(100, configuredPercent))
        : fallbackPosition[axisName === "x" ? 0 : 1];
    };
    // 只覆盖这一条导航的 x / y，同级的 scale、followOffset 等字段原样保留。
    const writeOffsetPercent = (percentX: any, percentY: any) => {
      config = {
        ...config,
        navigation: {
          ...(config.navigation || {}),
          [navigationKey]: {
            ...(config.navigation?.[navigationKey] || {}),
            x: Math.round(percentX * 100) / 100,
            y: Math.round(percentY * 100) / 100
          }
        }
      };
    };
    const stopNavigationDrag = () => {
      if (!navigationDrag) {
        return;
      }
      navigationDrag = null;
      dragElement.classList.remove("is-navigation-dragging");
    };
    dragElement.addEventListener("pointerdown", (dragStartEvent: any) => {
      if (
        !navigationEditing ||
        dragStartEvent.button !== 0 ||
        dragStartEvent.isPrimary === false
      ) {
        return;
      }
      // 同 id 的按下还在拖动中才忽略；上一次拖动的 pointerup 若没送达（元素被替换等），
      if (navigationDrag?.pointerId === dragStartEvent.pointerId) {
        return;
      }
      const containerRect = containerElement.getBoundingClientRect();
      if (!(containerRect.width > 0) || !(containerRect.height > 0)) {
        return;
      }
      // 上一次拖动若在页签外松手，click 不会到来，标记会一直留着吃掉后面的点击：这里先清一次。
      dragElement.dataset.dragged = "";
      dragStartEvent.preventDefault();
      // 拦在这里：画布自己的 pointerdown 会记下指针并驱动背景视差，拖页签时不需要它。
      dragStartEvent.stopPropagation();
      navigationDrag = {
        pointerId: dragStartEvent.pointerId,
        clientX: dragStartEvent.clientX,
        clientY: dragStartEvent.clientY,
        startPercentX: readOffsetPercent("x"),
        startPercentY: readOffsetPercent("y"),
        percentPerClientPxX: 100 / containerRect.width,
        percentPerClientPxY: 100 / containerRect.height,
        moved: false
      };
      capturePointer(dragElement, dragStartEvent.pointerId);
      dragElement.classList.add("is-navigation-dragging");
    });
    dragElement.addEventListener("pointermove", (dragMoveEvent: any) => {
      if (!navigationDrag || navigationDrag.pointerId !== dragMoveEvent.pointerId) {
        return;
      }
      const movedClientX = dragMoveEvent.clientX - navigationDrag.clientX;
      const movedClientY = dragMoveEvent.clientY - navigationDrag.clientY;
      if (!navigationDrag.moved && Math.hypot(movedClientX, movedClientY) < NAVIGATION_DRAG_THRESHOLD) {
        return;
      }
      navigationDrag.moved = true;
      // 用「按下时的中心点 + 总位移」算绝对值，而不是逐帧累加：中途被夹取后再拖回来，
      const nextPercentX = Math.max(
        0,
        Math.min(100, navigationDrag.startPercentX + movedClientX * navigationDrag.percentPerClientPxX)
      );
      const nextPercentY = Math.max(
        0,
        Math.min(100, navigationDrag.startPercentY + movedClientY * navigationDrag.percentPerClientPxY)
      );
      if (nextPercentX === readOffsetPercent("x") && nextPercentY === readOffsetPercent("y")) {
        return;
      }
      writeOffsetPercent(nextPercentX, nextPercentY);
      scheduleLayoutStage();
    });
    dragElement.addEventListener("pointerup", (dragEndEvent: any) => {
      if (!navigationDrag || navigationDrag.pointerId !== dragEndEvent.pointerId) {
        return;
      }
      const finishedDrag = navigationDrag;
      stopNavigationDrag();
      if (!finishedDrag.moved) {
        // 没超过阈值：当作点选页签，不写位置，点击仍由页签自己的 click 处理。
        return;
      }
      // 这次拖拽的尾巴会紧跟一个 click，用标记吃掉它，免得顺手切了模块 / 楼层。
      dragElement.dataset.dragged = "true";
      postToHost({
        type: "edit",
        action: "navigation-position",
        target: navigationKey,
        x: readOffsetPercent("x"),
        y: readOffsetPercent("y")
      });
    });
    // 指针被系统收走（来电、手势接管）时的回滚：本地预览过的新位置退回按下时的值，
    dragElement.addEventListener("pointercancel", () => {
      if (!navigationDrag) {
        return;
      }
      const cancelledDrag = navigationDrag;
      stopNavigationDrag();
      if (cancelledDrag.moved) {
        writeOffsetPercent(cancelledDrag.startPercentX, cancelledDrag.startPercentY);
        scheduleLayoutStage();
      }
    });
  }
  // 分类栏绑在内层轨道（moduleTabsElement）而不是外层 .i3d-navigation：外层是
  bindNavigationDrag(moduleTabsElement, "categories", [50, 94]);
  bindNavigationDrag(floorTabsElement, "floors", [96, 50]);
  // 渲染楼层页签：编辑 / 视图编辑 / 范围编辑时整块隐藏；只有一个楼层时不显示页签。
  function renderFloorTabs() {
    navigationElement.hidden = !isEditorCanvas && (isEditing || isViewEditing || isRangeEditorOpen);
    floorTabsElement.hidden =
      isEditing || isViewEditing || isRangeEditorOpen || (stageFloors() as any).length < 2;
    const floorChoices = floorNavigationChoices((stageFloors() as any), config.floorNumbers);
    const outsideFloorId =
      currentFloorId === "all"
        ? floorChoices.filter(([floorId]) => floorId !== "all").at(-1)?.[0] || ""
        : null;
    stageOptions.groundReflections?.setOutsideFloor?.(outsideFloorId);
    stageOptions.groundReflections?.setVisibleFloor?.(null);
    const floorTabsJson = JSON.stringify(floorChoices);
    if (floorTabsJson !== floorTabsSignature) {
      floorTabsSignature = floorTabsJson;
      floorTabsElement.replaceChildren();
      for (const [floorTabId, floorTabLabel, floorTabTitle] of floorChoices) {
        const floorTabButton = makeElement("button", "", floorTabLabel);
        floorTabButton.type = "button";
        floorTabButton.dataset.floor = floorTabId;
        floorTabButton.title = floorTabTitle;
        floorTabButton.setAttribute("aria-label", floorTabTitle);
        floorTabButton.addEventListener("click", () => {
          // 同上：拖完楼层栏紧跟的 click 只用来清标记。
          if (floorTabsElement.dataset.dragged === "true") {
            floorTabsElement.dataset.dragged = "";
            return;
          }
          selectFloor(floorTabId);
        });
        floorTabsElement.append(floorTabButton);
      }
    }
    for (const floorTab of floorTabsElement.children) {
      floorTab.setAttribute("aria-pressed", String(floorTab.dataset.floor === currentFloorId));
    }
  }
  /**
   * 切换楼层：更新楼层状态、相机与标记，并把选择结果回报宿主。
   */
  function selectFloor(targetFloorId: any) {
    if (
      isEditing ||
      isViewEditing ||
      isRangeEditorOpen ||
      isSceneUpdating ||
      targetFloorId === currentFloorId ||
      (targetFloorId !== "all" &&
        !(stageFloors() as any).some(
          (selectedFloorEntry: any) => selectedFloorEntry.id === targetFloorId
        ))
    ) {
      return;
    }
    stopVacuumFollow(false);
    exitFocus({
      immediate: true,
      preserveCamera: true
    });
    cancelMarkerDrag();
    const previousCameraStateBeforeFloor = stageOptions.cameraState(true);
    const fromPivot = stageOptions.getOrbitCenter?.();
    const cameraMotionState = stageOptions.getCameraMotionState?.();
    pendingFloorId = targetFloorId;
    animateModuleSwap(() => {
      currentFloorId = targetFloorId;
      const toPivot = stageOptions.transitionFloor
        ? stageOptions.transitionFloor(targetFloorId)
        : (stageOptions.setFloor(targetFloorId), stageOptions.getOrbitCenter?.());
      const floorCameraPose = transformCameraPose(
        sceneProperties.floorCameras?.[targetFloorId] ||
          (targetFloorId === sceneProperties.floorSelection ? sceneProperties.camera : null),
        targetFloorId
      );
      const nextFloorCameraPose =
        floorCameraPose ||
        stageOptions.floorDefaultCamera?.(targetFloorId) ||
        stageOptions.cameraState();
      savedCameraPose = floorCameraPose || nextFloorCameraPose;
      config = normalizeSceneConfig({
        ...sceneProperties,
        floorSelection: targetFloorId
      });
      config.camera = savedCameraPose;
      // 离开「全部楼层」时保持选中「总览」：它本身也是一个合法的单层模块。
      if (targetFloorId === "all") {
        activeModule = "overview";
        pendingModule = "";
      } else if (pendingModule) {
        activeModule = pendingModule;
        pendingModule = "";
      }
      stageOptions.restoreCamera(previousCameraStateBeforeFloor, cameraMotionState);
      beginCameraTransition(
        nextFloorCameraPose,
        false,
        false,
        () => {
          stageOptions.finishFloorTransition?.();
          applyLightStates();
          renderStage();
          syncVacuumMaps();
          updateMarkerVisibility();
        },
        "floor",
        {
          fromPivot: fromPivot,
          toPivot: toPivot
        }
      );
      markerPointsById.clear();
      applyLightStates({
        immediate: true
      });
      renderMarkers();
      updatePanelChrome();
      updateIdleControllers();
    });
  }
  /**
   * 打开灯光范围编辑器，并把开关 / 出错状态回报宿主。
   */
  function openRangeEditor(rangeRequestId: any) {
    // 状态回报的统一出口：requestId 只在宿主主动下发了请求时才回带，
    const reportRangeEditorState = (isActive: any, rangeError: any = "") =>
      postToHost({
        type: "range-editor-state",
        active: isActive,
        ...(rangeRequestId
          ? {
              requestId: rangeRequestId
            }
          : {}),
        ...(rangeError
          ? {
              error: rangeError
            }
          : {})
      });
    const unavailableReason = isRangeEditingAllowed
      ? stageOptions.regionLighting
        ? isPresented
          ? isSceneUpdating
            ? "户型正在同步，请稍候再调整照射范围。"
            : isViewEditing
              ? "请先完成户型视角调整，再编辑照射范围。"
              : ""
          : "户型还在加载，请稍候再调整照射范围。"
        : "请先选择轻量柔光模式。"
      : "请在已授权的控件编辑器中调整照射范围。";
    if (unavailableReason) {
      reportRangeEditorState(false, unavailableReason);
      return;
    }
    if (isRangeEditorOpen) {
      reportRangeEditorState(true);
      return;
    }
    exitFocus({
      immediate: true
    });
    isRangeEditorOpen = true;
    isRangeEditorBusy = true;
    updateIdleControllers();
    syncCameraInteraction();
    renderStage();
    presentationElement.style.display = "none";
    presentationElement.setAttribute("inert", "");
    focusVignetteElement.style.display = "none";
    try {
      rangeEditor ||= mountRegionRangeEditor(stageOptions, {
        getConfig: () => config,
        standalone: isRangeEditorOnly,
        wake: wakeFrameLoop,
        onChange(lightRegionOverrides: any) {
          if (isRangeEditingAllowed) {
            config.lightRegionOverrides = structuredClone(lightRegionOverrides);
            sceneProperties.lightRegionOverrides = structuredClone(lightRegionOverrides);
            postToHost({
              type: "range-overrides",
              overrides: lightRegionOverrides
            });
          }
        },
        onClose() {
          isRangeEditorOpen = false;
          presentationElement.style.display = "";
          presentationElement.removeAttribute("inert");
          focusVignetteElement.style.display = "";
          applyLightStates({
            immediate: true
          });
          syncCameraInteraction();
          renderStage();
          updatePanelChrome();
          updateMarkerPositions(true);
          updateIdleControllers();
          if (!isRangeEditorBusy) {
            postToHost({
              type: "range-editor-state",
              active: false
            });
          }
        }
      });
      rangeEditor.open();
      reportRangeEditorState(true);
    } catch (rangeEditorError) {
      rangeEditor?.close();
      isRangeEditorOpen = false;
      presentationElement.style.display = "";
      presentationElement.removeAttribute("inert");
      focusVignetteElement.style.display = "";
      syncCameraInteraction();
      renderStage();
      updateIdleControllers();
      reportRangeEditorState(false, (rangeEditorError as any).message || "范围编辑暂时不可用");
    } finally {
      isRangeEditorBusy = false;
    }
  }




  // 按标记 ID 反查绑定：先查当前模块的集合，再兜底查门锁、摄像头与人体传感器 ——
  const findBinding = (lookupId: any) =>
    collectModuleBindings().find((bindingMatch: any) => bindingMatch.id === lookupId) ||
    collectLockBindings().find((lockMatch: any) => lockMatch.id === lookupId) ||
    collectCameraBindings().find((cameraMatch: any) => cameraMatch.id === lookupId) ||
    collectPresenceBindings().find((presenceMatch: any) => presenceMatch.id === lookupId);
  // 「正在配置：」提示条里那半句品类名。键是 deviceKind；通用设备的 deviceKind 直接就是
  const EDITOR_SELECTION_KIND_LABELS = {
    light: "灯光",
    climate: "空调",
    cover: "窗帘",
    nas: "NAS",
    television: "电视",
    vacuum: "扫地机",
    "vacuum-room": "快捷按钮",
    "temperature-humidity": "温湿度计",
    lock: "门",
    camera: "摄像头",
    presence: "人体传感器"
  };
  /**
   * 编辑态提示条文案。没选中时说「请选择要配置的对象」而不是整条藏起来 —— 空着比消失更能
   */
  function renderEditorSelection(selectedBinding: any, highlightedModelCount: any) {
    editorSelectionElement.hidden = !isEditing;
    if (!isEditing) {
      editorSelectionElement.textContent = "";
      return;
    }
    if (!selectedBinding) {
      editorSelectionElement.textContent = "请选择要配置的对象";
      return;
    }
    const kindLabel =
      (EDITOR_SELECTION_KIND_LABELS as any)[selectedBinding.deviceKind] ||
      genericDeviceProfile(selectedBinding.deviceKind)?.label ||
      "设备";
    const nameLabel =
      selectedBinding.label || selectedBinding.deviceLabel || selectedBinding.entityId || "未命名";
    const selectedFloorName = (stageFloors() as any).find(
      (floorEntry: any) => floorEntry.id === selectedBinding.floorId
    )?.name;
    editorSelectionElement.textContent =
      "正在配置：" +
      kindLabel +
      " · " +
      nameLabel +
      (selectedFloorName ? " · " + selectedFloorName : "") +
      (highlightedModelCount > 1 ? " · " + highlightedModelCount + " 个模型" : "");
  }
  /**
   * 舞台的总重绘入口：把当前配置、状态与交互态一次性铺到 DOM 与 3D 上。
   */
  function renderStage() {
    applyPageBehavior();
    syncPresenceScene();
    presenceWaves.sync({
      bindings: (config.security?.presenceSensors || [])
        .filter(
          (presenceSensorFilterEntry: any) =>
            !isEditing || "presence:" + presenceSensorFilterEntry.id === selectedId
        )
        .map((presenceSensorRecord: any) => {
          const presenceSceneItemRecord = (stageFloors() as any)
            .find((presenceFloor: any) => presenceFloor.id === presenceSensorRecord.floorId)
            ?.scene.items.find(
              (presenceSceneItemCandidate: any) =>
                presenceSceneItemCandidate.id === presenceSensorRecord.modelId
            );
          return {
            ...presenceSensorRecord,
            width: presenceSceneItemRecord?.width,
            height: presenceSceneItemRecord?.height,
            depth: presenceSceneItemRecord?.depth
          };
        }),
      states: statesByEntityId,
      floorId: currentFloorId,
      preview: isEditing,
      enabled:
        activeModule === "security" &&
        !focusedId &&
        !focusMode &&
        !isViewEditing &&
        !isRangeEditorOpen &&
        !stageOptions.floorTransitionActive &&
        cameraTransition?.owner !== "floor"
    });
    syncVacuumMaps();
    const isFloorTransitioning =
      stageOptions.floorTransitionActive || cameraTransition?.owner === "floor";
    environmentScene.setRoot(
      stageOptions.modelRoot,
      stageOptions.environmentRevision ?? stageOptions.sceneRevision
    );
    if (!isFloorTransitioning || cameraTransition?.presentationRevealed) {
      if (!isFloorTransitioning) {
        syncCurtains();
        syncNasStatus();
        syncGenericDeviceStatus();
        syncCameraStatus();
        syncTelevisionScreens();
        syncVacuumMap();
      }
      const focusableModuleBindings = resolveModuleBindings().filter(isOnActiveFloor);
      // 编辑态 = 当前模块绑定 + 预览窗帘（场景里有模型但未绑定实体的窗帘），
      const sceneBindings = (
        isEditing
          ? [
              ...focusableModuleBindings,
              ...(["climate", "devices", "nas", "television", "vacuum"].includes(activeModule)
                ? []
                : collectPreviewCovers())
            ]
          : collectAllDeviceBindings().concat(collectPreviewCovers())
      ).filter((visibleBinding: any) => visibleBinding.modelAvailable && isOnActiveFloor(visibleBinding));
      const pageDimmingState = pageDimming(
        config,
        activeModule,
        !!focusedId && focusMode !== "panel"
      );
      const isEnvironmentActive = !isViewEditing && !isRangeEditorOpen && pageDimmingState.enabled;
      const pageBindings = pageModelBindings(
        (stageFloors() as any),
        sceneBindings,
        pageDimmingState.page,
        currentFloorId
      );
      // 编辑态被高亮的模型集合：屏幕轮廓圈的是它，提示条的「N 个模型」数的也是它 ——
      const highlightedBindings = pageBindings.filter(
        (pageBinding: any) => !selectedId || pageBinding.id === selectedId
      );
      screenOutlines.sync(
        stageOptions.modelRoot,
        stageOptions.environmentRevision ?? stageOptions.sceneRevision,
        highlightedBindings,
        !focusedId &&
          !isViewEditing &&
          !isRangeEditorOpen &&
          currentFloorId !== "all" &&
          ["environment", "devices", "vacuum", "security"].includes(pageDimmingState.page)
      );
      renderEditorSelection(
        isEditing && selectedId ? findBinding(selectedId) : null,
        highlightedBindings.length
      );
      environmentAirflow.setRoot(stageOptions.modelRoot, stageOptions.sceneRevision);
      environmentScene.setMode({
        enabled: isEnvironmentActive,
        saturation: pageDimmingState.saturation,
        dimStrength: isEnvironmentActive ? pageDimmingState.strength : 0,
        bindings: pageBindings,
        animateBindings: !isEditing && !isViewEditing,
        states: statesByEntityId,
        focusedId: focusedId,
        selectedId: isEditing ? selectedId : ""
      });
      environmentAirflow.setState({
        enabled: !isViewEditing && !isRangeEditorOpen,
        bindings: sceneBindings.filter(
          (climateBindingEntry: any) => climateBindingEntry.deviceKind === "climate"
        ),
        states: statesByEntityId,
        focusedId: focusedId,
        overview: !focusedId || focusMode === "panel"
      });
      stageOptions.setEnvironmentActive?.(isEnvironmentActive || environmentScene.isActive);
    }
    const overviewBindings = resolveModuleBindings().filter(isOnActiveFloor);
    renderFloorTabs();
    const isAllFloors = currentFloorId === "all";
    toggleModulePanel(!isEditorCanvas && (isEditing || isViewEditing || isRangeEditorOpen || isAllFloors));
    // 选中态落在哪个页签上：模块 → 页签的归一在 stage/module-tabs.js（与页签清单同源）。
    const activeTabModule = moduleTabOf(activeModule);
    moduleTabsElement.classList.toggle("is-all-floors", isAllFloors);
    moduleTabsElement.style.setProperty("--i3d-tab-count", String(configuredModules.length));
    moduleTabsElement.style.setProperty(
      "--i3d-selected-tab",
      String(Math.max(0, configuredModules.indexOf(activeTabModule)))
    );
    for (const [panelModuleKey, panelTabButton] of moduleTabsByModule) {
      const tabIndex = configuredModules.indexOf(panelModuleKey);
      const isTabDisabled = isAllFloors || tabIndex < 0;
      if (isTabDisabled) {
        moveFocusInto(panelTabButton);
      }
      panelTabButton.hidden = moduleTabsElement.hidden || tabIndex < 0;
      panelTabButton.disabled = isTabDisabled;
      panelTabButton.style.setProperty("--i3d-tab-index", String(Math.max(0, tabIndex)));
      panelTabButton.setAttribute("aria-pressed", String(panelModuleKey === activeTabModule));
    }
    moduleEmptyElement.hidden =
      isAllFloors ||
      moduleTabsElement.hidden ||
      (!pendingModule &&
        (activeModule === "security"
          ? [...(config.security?.presenceSensors || []), ...(config.security?.cameras || [])].some(
              isOnActiveFloor
            )
          : activeModule === "overview" ||
            activeModule === "light" ||
            overviewBindings.length > 0));
    moduleEmptyElement.textContent = pendingModule
      ? "请选择楼层，再使用" + (moduleTabsByModule.get(pendingModule)?.textContent || "控制") + "。"
      : activeModule === "security"
        ? "尚未配置安防相关设备"
        : activeModule === "vacuum"
          ? "尚未配置扫地机相关设备"
          : activeModule === "devices"
            ? "尚未配置相关设备"
            : "尚未配置环境相关设备";
  }
  // 展开 / 收起模块面板（灯光、空调、窗帘、NAS、电视共用一个容器）。
  function toggleModulePanel(isHidden: any) {
    if (modulePanelOpenState === isHidden) {
      return;
    }
    const wasUninitialized = modulePanelOpenState === null;
    const computedTabsStyle =
      !moduleTabsElement.hidden &&
      moduleTabsElement.animate &&
      typeof getComputedStyle == "function"
        ? getComputedStyle(moduleTabsElement)
        : null;
    const baseFrame = {
      clipPath: moduleTabsElement.hidden
        ? "inset(0 100% 0 0 round 12px)"
        : computedTabsStyle?.clipPath && computedTabsStyle.clipPath !== "none"
          ? computedTabsStyle.clipPath
          : "inset(0 0% 0 0 round 12px)",
      opacity: moduleTabsElement.hidden ? 0 : Number(computedTabsStyle?.opacity ?? 1),
      transform: moduleTabsElement.hidden
        ? "translateX(-6px)"
        : computedTabsStyle?.transform || "none"
    };
    modulePanelAnimation?.cancel();
    modulePanelAnimation = null;
    modulePanelOpenState = isHidden;
    moduleTabsElement.inert = isHidden;
    moduleTabsElement.setAttribute("aria-hidden", String(isHidden));
    if (isHidden) {
      moveFocusInto(moduleTabsElement);
    }
    if (
      wasUninitialized ||
      !moduleTabsElement.animate ||
      prefersReducedMotionNow()
    ) {
      moduleTabsElement.hidden = isHidden;
      return;
    }
    moduleTabsElement.hidden = false;
    const panelKeyframes = isHidden
      ? [
          baseFrame,
          {
            clipPath: "inset(0 100% 0 0 round 12px)",
            opacity: 0,
            transform: "translateX(-4px)"
          }
        ]
      : [
          baseFrame,
          {
            clipPath: "inset(0 0% 0 0 round 12px)",
            opacity: 1,
            transform: "translateX(2px)",
            offset: 0.8
          },
          {
            clipPath: "inset(0 0% 0 0 round 12px)",
            opacity: 1,
            transform: "translateX(0)"
          }
        ];
    const panelAnimation = moduleTabsElement.animate(panelKeyframes, {
      duration: isHidden ? 380 : 480,
      easing: "cubic-bezier(.2,.7,.2,1)",
      fill: "both"
    });
    modulePanelAnimation = panelAnimation;
    panelAnimation.onfinish = () => {
      if (modulePanelAnimation === panelAnimation) {
        modulePanelAnimation = null;
        moduleTabsElement.hidden = isHidden;
        for (const [hiddenModuleKey, hiddenTabButton] of moduleTabsByModule) {
          hiddenTabButton.hidden = isHidden || !configuredModules.includes(hiddenModuleKey);
        }
        panelAnimation.cancel();
      }
    };
  }
  let moduleTransition: any = null;
  function cancelModuleTransition() {
    const activeTransition = moduleTransition;
    moduleTransition = null;
    if (activeTransition) {
      activeTransition.out?.cancel();
      activeTransition.in?.cancel();
      activeTransition.ghost.remove();
      markersElement.removeAttribute("inert");
    }
  }
  // 模块切换动画：把旧标记复制成幽灵元素淡出，再应用新模块的更新。
  function animateModuleSwap(applyModuleUpdate: any) {
    const computedMarkersStyle = markersElement.animate ? getComputedStyle(markersElement) : null;
    const initialOpacity = computedMarkersStyle ? Number(computedMarkersStyle.opacity) : 1;
    const initialTransform = computedMarkersStyle?.transform || "none";
    cancelModuleTransition();
    if (
      !markersElement.animate ||
      prefersReducedMotionNow()
    ) {
      applyModuleUpdate();
      return;
    }
    const outgoingMarkers = collectModuleBindings()
      .map((markerIndexBinding: any) => ({
        ...markerIndexBinding,
        index: [...markersElement.children].indexOf(markersById.get(markerIndexBinding.id))
      }))
      .filter((positionedOutgoingBinding: any) => positionedOutgoingBinding.index >= 0);
    const ghostElement = markersElement.cloneNode(true);
    ghostElement.setAttribute("aria-hidden", "true");
    ghostElement.setAttribute("inert", "");
    ghostElement.classList.add("i3d-module-outgoing");
    ghostElement.style.pointerEvents = "none";
    for (const ghostButton of ghostElement.querySelectorAll("button")) {
      ghostButton.style.pointerEvents = "none";
      ghostButton.removeAttribute("id");
    }
    markersElement.parentNode.append(ghostElement);
    applyModuleUpdate();
    markersElement.setAttribute("inert", "");
    const transitionState: any = (moduleTransition = {
      ghost: ghostElement,
      outgoing: outgoingMarkers.map((outgoingBinding: any) => ({
        ...outgoingBinding,
        node: ghostElement.children[outgoingBinding.index]
      }))
    });
    transitionState.out = ghostElement.animate(
      [
        {
          opacity: initialOpacity,
          transform: initialTransform
        },
        {
          opacity: 0,
          transform: initialTransform
        }
      ],
      {
        duration: 240,
        easing: "linear",
        fill: "forwards"
      }
    );
    if (!markersElement.classList.contains("is-concealed")) {
      transitionState.in = markersElement.animate(
        [
          {
            opacity: 0
          },
          {
            opacity: 1
          }
        ],
        {
          duration: 240,
          easing: "linear",
          fill: "backwards"
        }
      );
    }
    Promise.all([transitionState.out.finished, transitionState.in?.finished])
      .then(() => {
        if (moduleTransition === transitionState) {
          ghostElement.remove();
          moduleTransition = null;
          updateMarkerVisibility();
        }
      })
      .catch(() => {});
  }
  function selectModule(targetModule: any) {
    if (
      !isEditing &&
      !isViewEditing &&
      !isRangeEditorOpen &&
      !isSceneUpdating &&
      !!configuredModules.includes(targetModule) &&
      currentFloorId !== "all"
    ) {
      pendingModule = "";
      if (targetModule === activeModule) {
        renderStage();
        return;
      }
      if (followedVacuumId) {
        stopVacuumFollow();
      }
      exitFocus();
      animateModuleSwap(() => {
        activeModule = targetModule;
        idleRotation.activity();
        idleIconVisibility.activity();
        idleFocusExit.activity();
        markerPointsById.clear();
        renderStage();
        renderMarkers();
      });
    }
  }
  // 运行态焦点：编辑态用 selectedId，这里只解析展示态的 focusedId。
  const findFocusedBinding = () => findBinding(focusedId);








  // 算出面板对取景的遮挡比例：摄像头与通用弹窗两套布局不同，
  const computePanelInsetRatio = () => {
    const insetBinding = findFocusedBinding();
    const popupLayoutSettings =
      config.popupLayout?.[insetBinding?.deviceKind === "camera" ? "camera" : "general"];
    if (
      (Number.isFinite(popupLayoutSettings?.x) && popupLayoutSettings.x < 75) ||
      (!isEditing && isFocusableDevice(insetBinding) && insetBinding?.clickAction === "focus")
    ) {
      return 0;
    } else {
      return Math.min(
        0.7,
        (lightPanelElement.getBoundingClientRect().width + presentationScaleX * 24) /
          Math.max(containerElement.clientWidth, 1)
      );
    }
  };
  // 舞台布局：容器尺寸变化（ResizeObserver）时重排演示层与各面板，并刷新标记位置。
  function layoutStage() {
    const containerRect = containerElement.getBoundingClientRect();
    const layoutWidth = presentationLayout?.width || containerRect.width;
    const layoutHeight = presentationLayout?.height || containerRect.height;
    if (
      !(layoutWidth > 0) ||
      !(layoutHeight > 0) ||
      !(containerRect.width > 0) ||
      !(containerRect.height > 0)
    ) {
      return;
    }
    presentationScaleX = containerRect.width / layoutWidth;
    const navigationWidth = configuredModules.length * MODULE_TAB_STRIDE + MODULE_TAB_TRACK_PADDING * 2;
    const navigationSettings = config.navigation || {};
    // 宿主可给导航 / 楼层页签设缩放，允许范围 0.5~2（超出会被夹住），缺省为 1；
    const scaleSetting = (navigationEntry: any) =>
      Number.isFinite(navigationEntry?.scale)
        ? Math.max(0.5, Math.min(2, navigationEntry.scale))
        : 1;
    const navigationScale = Math.min(
      scaleSetting(navigationSettings.categories) * 2,
      (layoutWidth - 24) / navigationWidth,
      (layoutHeight - 24) / (navigationElement.offsetHeight || MODULE_TAB_TRACK_HEIGHT)
    );
    const floorScale = Math.min(
      scaleSetting(navigationSettings.floors) * 2,
      (layoutHeight - 24) / (floorTabsElement.scrollHeight || 240),
      (layoutWidth - 24) / (floorTabsElement.offsetWidth || 80)
    );
    presentationElement.style.setProperty("--i3d-navigation-scale", String(navigationScale));
    presentationElement.style.setProperty("--i3d-floor-scale", String(floorScale));
    // 操作提示条的反算系数：演示层被缩小多少倍，提示条就放大多少倍，屏幕上保持设计字号
    presentationElement.style.setProperty(
      "--i3d-help-scale",
      String(Math.min(4, Math.max(1, 1 / Math.max(presentationScaleX, 0.01))))
    );
    // 按宿主给的偏移摆放导航元素；偏移支持百分比与像素两种写法，
    const placeNavigationElement = (
      elementToPlace: any,
      offsetSettings: any,
      fallbackPosition: any,
      layoutScale: any,
      fallbackWidth: any,
      fallbackHeight: any
    ) => {
      const scaledWidth =
        (elementToPlace === navigationElement
          ? navigationWidth
          : elementToPlace.offsetWidth || fallbackWidth) * layoutScale;
      // 元素尺寸要乘同一份布局缩放，下方才能按「12px 安全边距」把中心点夹回可视区。
      const scaledHeight = (elementToPlace.offsetHeight || fallbackHeight) * layoutScale;
      // 宿主下发的偏移可能越界（负数或 >100）且允许缺省，这里夹到 0~100，
      const offsetPercent = (axisName: any, fallbackPercent: any) =>
        Number.isFinite(offsetSettings?.[axisName])
          ? Math.max(0, Math.min(100, offsetSettings[axisName]))
          : fallbackPercent;
      const placedLeftPx = Math.max(
        12 + scaledWidth / 2,
        Math.min(
          layoutWidth - 12 - scaledWidth / 2,
          (layoutWidth * offsetPercent("x", fallbackPosition[0])) / 100
        )
      );
      const placedTopPx = Math.max(
        12 + scaledHeight / 2,
        Math.min(
          layoutHeight - 12 - scaledHeight / 2,
          (layoutHeight * offsetPercent("y", fallbackPosition[1])) / 100
        )
      );
      elementToPlace.style.left = placedLeftPx + "px";
      elementToPlace.style.top = placedTopPx + "px";
      return placedTopPx - scaledHeight / 2;
    };
    const navigationTop = placeNavigationElement(
      navigationElement,
      navigationSettings.categories,
      [50, 94],
      navigationScale,
      420,
      36
    );
    const followOffset = Number.isFinite(navigationSettings.followOffset)
      ? Math.max(0, Math.min(300, navigationSettings.followOffset))
      : 16;
    // 工具栏与导航共用同一份缩放，才能比较出「换行堆叠到导航上方」还是「贴边」；
    const toolbarHeight = (toolbarElement.offsetHeight || 30) * navigationScale;
    const shouldStackToolbar = navigationTop >= toolbarHeight + 12;
    toolbarElement.style.bottom = shouldStackToolbar
      ? "calc(100% + " +
        Math.min(followOffset, navigationTop - toolbarHeight - 12) / navigationScale +
        "px)"
      : "auto";
    toolbarElement.style.top = shouldStackToolbar ? "auto" : "calc(100% + 8px)";
    placeNavigationElement(
      floorTabsElement,
      navigationSettings.floors,
      [96, 50],
      floorScale,
      80,
      120
    );
    const panelDefaultTop = Math.max(12, Math.min(layoutHeight * 0.56 - 400, layoutHeight - 812));
    presentationElement.style.setProperty(
      "--i3d-navigation-bottom",
      Math.max(12, navigationTop - navigationScale * 50) + "px"
    );
    const popupLayoutResult = computePopupPlacement({
      width: layoutWidth,
      height: layoutHeight,
      panelWidth: lightPanelElement.offsetWidth || 360,
      panelHeight: lightPanelElement.offsetHeight || 400,
      defaultTop: panelDefaultTop,
      defaultScale: Math.min(
        2,
        (layoutWidth - 32) / (lightPanelElement.offsetWidth || 360),
        Math.max(
          0.5,
          (layoutHeight - panelDefaultTop - 100) / (lightPanelElement.offsetHeight || 400)
        )
      ),
      settings: config.popupLayout?.general
    });
    lightPanelElement.style.setProperty("--i3d-control-top", popupLayoutResult.top + "px");
    lightPanelElement.style.setProperty("--i3d-control-scale", String(popupLayoutResult.scale));
    lightPanelElement.style.right = popupLayoutResult.right + "px";
    Object.assign(presentationElement.style, {
      width: layoutWidth + "px",
      height: layoutHeight + "px",
      transform: "scale(" + presentationScaleX + "," + containerRect.height / layoutHeight + ")"
    });
    if (cameraTransition?.focused) {
      cameraTransition.targetInset = computePanelInsetRatio();
    }
    if (focusMode && focusMode !== "panel" && !cameraTransition) {
      focusViewportInset = computePanelInsetRatio();
      stageOptions.setFocusViewport(focusViewportInset);
    }
    updateMarkerPositions(true);
  }
  // layoutStage 会写回它自己观察的样式（缩放变量、偏移、尺寸），在 ResizeObserver
  let pendingLayoutFrameId = 0;
  function scheduleLayoutStage() {
    if (pendingLayoutFrameId) {
      return;
    }
    pendingLayoutFrameId = requestAnimationFrame(() => {
      pendingLayoutFrameId = 0;
      layoutStage();
    });
  }
  function moveFocusInto(targetElement: any, focusElement: any = canvasElement) {
    const activeElement = document.activeElement;
    if (!!activeElement && !!targetElement.contains(activeElement)) {
      focusElement.setAttribute("tabindex", "-1");
      focusElement.focus({
        preventScroll: true
      });
      if (targetElement.contains(document.activeElement) && focusElement !== canvasElement) {
        canvasElement.setAttribute("tabindex", "-1");
        canvasElement.focus({
          preventScroll: true
        });
      }
      if (targetElement.contains(document.activeElement)) {
        activeElement;
      }
    }
  }


  // 聚焦且非面板模式时隐藏导航与楼层页签并置 inert，防止键盘点到已藏起的按钮。
  function updatePanelChrome() {
    const isFocusHidden = !!focusedId && !!focusMode && focusMode !== "panel";
    for (const chromeElement of [navigationElement, floorTabsElement]) {
      const chromeIsFocusHidden = isFocusHidden && (!isEditorCanvas || chromeElement !== navigationElement);
      chromeElement.classList.toggle("is-focus-hidden", chromeIsFocusHidden);
      chromeElement.inert = chromeIsFocusHidden;
      chromeElement.setAttribute("aria-hidden", String(chromeIsFocusHidden));
    }
    // 导航位置调整态：可拖标记挂在真正接收指针的两条上（分类栏内层轨道 / 楼层栏），
    moduleTabsElement.classList.toggle("is-navigation-draggable", navigationEditing);
    floorTabsElement.classList.toggle("is-navigation-draggable", navigationEditing);
    const panelOpacity = Number.isFinite(config.popupOpacity)
      ? Math.max(0, Math.min(100, config.popupOpacity))
      : 74;
    lightPanelElement.style.setProperty("--i3d-panel-opacity", String(panelOpacity / 100));
    const vignetteStrength = Number.isFinite(config.focusVignetteStrength)
      ? Math.max(0, Math.min(60, config.focusVignetteStrength))
      : 14;
    focusVignetteElement.style.setProperty(
      "--i3d-vignette-opacity",
      String(vignetteStrength / 100)
    );
    focusVignetteElement.hidden = isViewEditing || focusMode === "edit" || focusMode === "panel";
    focusVignetteElement.classList.toggle(
      "is-active",
      vignetteStrength > 0 && !!focusedId && !!focusMode && !focusVignetteElement.hidden
    );
    viewHelpElement.hidden = !isViewEditing && focusMode !== "edit" && (!isEditing || !!focusMode);
    viewHelpElement.textContent =
      focusMode === "edit"
        ? "拖动旋转 · 右键平移 · 滚轮缩放。调整完成后保存" +
          (findFocusedBinding()?.deviceKind === "camera"
            ? "摄像头"
            : findFocusedBinding()?.deviceKind === "presence"
              ? "传感器"
              : activeModule === "vacuum"
                ? "扫地机"
                : activeModule === "television"
                  ? "电视"
                  : activeModule === "nas"
                    ? "NAS"
                    : activeModule === "cover"
                      ? "窗帘"
                      : activeModule === "climate"
                        ? "空调"
                        : activeModule === "temperature-humidity"
                          ? "温湿度计"
                          : "此灯") +
          "视角。"
        : isEditing && !isViewEditing
          ? "拖动空白处旋转 · 右键平移 · 滚轮缩放。临时查看不改变已保存视角。"
          : "拖动旋转 · 右键平移 · 滚轮缩放。调整完成后固定视角。";
    markersElement.classList.toggle("is-view-editing", isViewEditing || focusMode === "edit");
    lightPanelElement.classList.toggle("is-preview", isEditing);
    renderStage();
    updateMarkerVisibility();
  }








  const idleRotation = createIdleRotation({
    returnToBase(onReturned) {
      hasIdleReturnPending = true;
      idleBasePose = structuredClone(
        pageBehavior.autoRotate.returnToDefault === true
          ? constrainCameraPose(config.camera || savedCameraPose || stageOptions.cameraState())
          : stageOptions.cameraState(true)
      );
      const hadFocus = !!focusedId || !!focusMode;
      focusedId = "";
      focusMode = "";
      focusRestoreCameraPose = null;
      moveFocusInto(lightPanelElement);
      lightPanelElement.classList.remove("is-open");
      lightPanelElement.setAttribute("inert", "");
      updatePanelChrome();
      if (hadFocus) {
        postToHost({
          type: "focus-state",
          active: false
        });
      }
      stageOptions.setOrbitPivot(null);
      if (
        !cameraTransition &&
        !focusViewportInset &&
        cameraPosesEqual(stageOptions.cameraState(), idleBasePose)
      ) {
        onReturned();
      } else {
        beginCameraTransition(idleBasePose, false, false, onReturned, "idle");
      }
    },
    start() {
      isIdleRotating = true;
      stageOptions.beginCameraMotion(idleBasePose.mode);
      syncCameraInteraction();
    },
    rotate(rotationStep) {
      stageOptions.applyCameraPose(stageOptions.orbitCameraPose(idleBasePose, rotationStep));
    },
    stop() {
      const isIdleTransition = cameraTransition?.owner === "idle";
      const wasRotating = isIdleRotating;
      isIdleRotating = false;
      hasIdleReturnPending = false;
      areIconsHiddenByRotation = false;
      idleIconHideDeadline = 0;
      lastCameraQuaternionKey = stageOptions.camera.quaternion?.toArray?.().join(",") || "";
      updateMarkerVisibility();
      if (isIdleTransition) {
        cameraTransition = null;
      }
      if (isIdleTransition || wasRotating) {
        stageOptions.endCameraMotion();
      }
      syncCameraInteraction();
    }
  });
  const idleIconVisibility = createIdleIconVisibility({
    onChange(iconsHidden) {
      areIdleIconsHidden = iconsHidden;
      updateMarkerVisibility();
    }
  });
  const idleFocusExit = createIdleFocusExit({
    onExit: () => exitFocus()
  });








  const TRACKED_INPUT_EVENTS = [
    "pointerdown",
    "pointermove",
    "pointerup",
    "pointercancel",
    "wheel",
    "keydown",
    "keyup"
  ];
  for (const trackedEventName of TRACKED_INPUT_EVENTS) {
    window.addEventListener(trackedEventName, trackUserInput, {
      capture: true,
      passive: true
    });
  }


  window.addEventListener("blur", clearInputState);
  if (document.addEventListener) {
    document.addEventListener("visibilitychange", updateIdleControllers);
  }
  /**
   * 退出聚焦状态：恢复导航栏、相机与面板，并通知宿主。
   */
  function exitFocus(exitOptions: any = {}) {
    if (findFocusedBinding()?.deviceKind === "vacuum") {
      postToHost({
        type: "vacuum-popup-close"
      });
    }
    if (findFocusedBinding()?.deviceKind === "camera") {
      postToHost({
        type: "camera-popup-close"
      });
    }
    televisionPanel.hide();
    if (!focusedId && !focusMode && (!focusRestoreCameraPose || exitOptions.immediate !== true)) {
      return;
    }
    const hadLightPreview = !!lightEffectPreview;
    lightEffectPreview = null;
    const wasEditingFocus = !!focusMode && !!isEditing;
    focusedId = "";
    focusMode = "";
    moveFocusInto(lightPanelElement);
    lightPanelElement.classList.remove("is-open");
    lightPanelElement.setAttribute("inert", "");
    updatePanelChrome();
    postToHost({
      type: "focus-state",
      active: false
    });
    if (exitOptions.preserveCamera) {
      cameraTransition = null;
      focusRestoreCameraPose = null;
      stageOptions.setOrbitPivot(null);
    } else if (focusRestoreCameraPose) {
      beginCameraTransition(focusRestoreCameraPose, false, exitOptions.immediate === true, () => {
        focusRestoreCameraPose = null;
        stageOptions.setOrbitPivot(null);
      });
    }
    updateIdleControllers();
    if (wasEditingFocus) {
      postToHost({
        type: "edit",
        action: "focus-exited"
      });
    }
    if (hadLightPreview) {
      applyLightStates();
    }
    syncCameraInteraction();
  }


  resetViewButton.addEventListener("click", () => {
    if (focusMode || focusRestoreCameraPose || cameraTransition) {
      exitFocus();
    } else {
      stageOptions.restoreCamera(constrainCameraPose(config.camera || savedCameraPose));
    }
  });
  powerButton.addEventListener("click", () => {
    const powerBinding = findFocusedBinding();
    if (powerBinding) {
      runLightCommand("power", !resolveLightState(powerBinding.entityId).on);
    }
  });
  // 画总开关的亮度观感：把 1~100 的亮度映射成灯丝与光晕的视觉参数
  function renderPowerButton(powerLightState: any) {
    const brightnessPercent = Math.max(
      1,
      Math.min(
        100,
        Number(powerLightState.brightness) || (powerLightState.brightnessSupported ? 1 : 100)
      )
    );
    const temperatureRatio =
      (Math.max(2000, Math.min(6500, Number(powerLightState.kelvin) || 3000)) - 2000) / 4500;
    const WARM_LAMP_RGB = [255, 132, 42];
    const COOL_LAMP_RGB = [172, 225, 255];
    const lampRgb = WARM_LAMP_RGB.map((channelValue, channelIndex) =>
      Math.round(channelValue + (COOL_LAMP_RGB[channelIndex] - channelValue) * temperatureRatio)
    );
    powerButton.classList.toggle("is-on", powerLightState.on);
    powerButton.setAttribute("aria-pressed", String(powerLightState.on));
    powerButton.setAttribute(
      "aria-label",
      "" +
        (findFocusedBinding()?.label || powerLightState.name) +
        (powerLightState.available
          ? powerLightState.on
            ? "已开启，点击关闭"
            : "已关闭，点击开启"
          : "当前不可用")
    );
    powerButton.style.setProperty("--i3d-lamp-color", "rgb(" + lampRgb.join(",") + ")");
    powerButton.style.setProperty(
      "--i3d-lamp-opacity",
      powerLightState.on && brightnessPercent > 0
        ? String(0.08 + (brightnessPercent / 100) * 0.92)
        : "0"
    );
    powerButton.style.setProperty(
      "--i3d-lamp-scale",
      String(0.62 + (brightnessPercent / 100) * 1.05)
    );
  }
  /**
   * 重绘灯光面板：标题状态、总开关、滑杆与预设。
   */
  function renderLightPanel() {
    const panelBinding = findFocusedBinding();
    if (["vacuum", "presence", "camera"].includes(panelBinding?.deviceKind)) {
      lightPanelElement.classList.remove("is-open");
      lightPanelElement.setAttribute("inert", "");
      return;
    }
    const panelEntry = panelBinding
      ? panelRegistry.find((entry: any) => entry.match(panelBinding))
      : null;
    for (const entry of panelRegistry) {
      const isActivePanel = entry === panelEntry;
      lightPanelElement.classList.toggle(entry.hostClass, isActivePanel);
      if (isActivePanel) {
        entry.show(panelBinding);
      } else {
        entry.hide?.();
        entry.root.hidden = true;
      }
    }
    // 非灯光面板接管这一块：标题栏、灯光控件与错误行都收起来；灯光面板反之。
    lightPanelHeader.hidden =
      lightControlsElement.hidden =
      controlErrorElement.hidden =
        Boolean(panelEntry);
    const panelLabel = panelEntry
      ? typeof panelEntry.label === "function"
        ? panelEntry.label(panelBinding)
        : panelEntry.label
      : "灯光控制";
    lightPanelElement.setAttribute("aria-label", panelLabel);
    if (panelEntry) {
      lightPanelElement.classList.remove("has-light-controls", "has-error");
      // 「点击只聚焦」的绑定不自动展开：用户点它只是为了对焦视角。
      if (panelEntry.deferWhenFocusOnly && panelBinding.clickAction === "focus" && !isEditing) {
        lightPanelElement.classList.remove("is-open");
        lightPanelElement.setAttribute("inert", "");
      }
      return;
    }
    if (!panelBinding) {
      return exitFocus();
    }
    const panelLightState = resolveLightState(panelBinding.entityId);
    lightHeadingLabel.textContent = panelBinding.label || panelLightState.name;
    lightStatusElement.textContent = panelBinding.entityId
      ? panelLightState.available
        ? panelLightState.on
          ? "已开启"
          : "已关闭"
        : "设备不可用"
      : "尚未绑定设备";
    lightHeadingLabel.title = lightHeadingLabel.textContent;
    controlErrorElement.title = controlErrorElement.textContent;
    renderPowerButton(panelLightState);
    lightStatusElement.classList.toggle("is-on", panelLightState.available && panelLightState.on);
    const isCommandPending = [...lightRequestsById.values()].some(
      (pendingCommand: any) => pendingCommand.entityId === panelBinding.entityId
    );
    lightPanelElement.classList.toggle(
      "is-command-pending",
      isCommandPending && panelLightState.available && !isEditing
    );
    lightPanelElement.setAttribute("aria-busy", String(isCommandPending));
    const hasLightControls =
      panelLightState.brightnessSupported || panelLightState.temperatureSupported;
    lightPanelElement.classList.toggle("has-light-controls", hasLightControls);
    lightPanelElement.classList.toggle("has-error", !!controlErrorElement.textContent);
    if (isEditing || !panelLightState.available || !panelLightState.on) {
      moveFocusInto(lightControlsElement, lightPanelElement);
    }
    if (hasLightControls) {
      lightControlsElement.removeAttribute("inert");
    } else {
      moveFocusInto(lightControlsElement, lightPanelElement);
      lightControlsElement.setAttribute("inert", "");
    }
    lightControlsElement.removeAttribute("aria-hidden");
    powerButton.disabled = isEditing || !panelLightState.available;
    brightnessControl.input.min = 1;
    brightnessControl.input.max = 100;
    temperatureControl.input.min = (panelLightState.minimum as number);
    temperatureControl.input.max = (panelLightState.maximum as number);
    for (const [sliderControl, isSupported, currentSliderValue, unitSuffix] of [
      [brightnessControl, panelLightState.brightnessSupported, (panelLightState.brightness as number), "%"],
      [temperatureControl, panelLightState.temperatureSupported, (panelLightState.kelvin as number), " K"]
    ]) {
      (sliderControl as any).root.hidden = !isSupported;
      (sliderControl as any).input.disabled = isEditing || !panelLightState.available || !panelLightState.on;
      if (document.activeElement !== (sliderControl as any).input) {
        (sliderControl as any).input.value =
          currentSliderValue ??
          (sliderControl === brightnessControl ? 100 : (panelLightState.minimum as number));
        (sliderControl as any).value.value =
          currentSliderValue === null ? "—" : "" + currentSliderValue + unitSuffix;
      }
    }
    presetGroupElement.hidden =
      !panelLightState.brightnessSupported && !panelLightState.temperatureSupported;
    for (const presetEntry of presetEntries) {
      const presetKelvin = Math.round(
        (panelLightState.minimum as number) +
          (((panelLightState.maximum as number) - (panelLightState.minimum as number)) * presetEntry.temperaturePercent) /
            100
      );
      const isPresetActive =
        panelLightState.on &&
        (!panelLightState.brightnessSupported ||
          Math.abs((panelLightState.brightness as number) - presetEntry.brightness) <= 4) &&
        (!panelLightState.temperatureSupported ||
          Math.abs((panelLightState.kelvin as number) - presetKelvin) <=
            Math.max(50, ((panelLightState.maximum as number) - (panelLightState.minimum as number)) * 0.06));
      presetEntry.button.disabled =
        isEditing || !panelLightState.available || !panelLightState.on || presetGroupElement.hidden;
      presetEntry.button.classList.toggle("is-active", isPresetActive);
      presetEntry.button.setAttribute("aria-pressed", String(isPresetActive));
      presetEntry.detail.textContent = panelLightState.brightnessSupported
        ? presetEntry.brightness + "%"
        : "开启";
    }
  }
  // 下发灯光命令：登记预览令牌并挂 14 秒超时（与后端 / HA 的响应时间对齐），
  function sendLightCommand(commandRequest: any, commandPreviewToken: any) {
    const lightRequestId = String(++requestSeq);
    const commandEntityId = commandRequest.entityId;
    lightPreview.retain(commandEntityId, commandPreviewToken);
    const lightTimeoutId = setTimeout(
      () => settleLightCommand(lightRequestId, "请求超时，请检查设备状态。", true),
      14000
    );
    lightRequestsById.set(lightRequestId, {
      entityId: commandEntityId,
      command: commandRequest,
      previewToken: commandPreviewToken,
      timeout: lightTimeoutId,
      next: null
    });
    postToHost({
      type: "control",
      requestId: lightRequestId,
      command: commandRequest
    });
  }
  // 同一实体已有在途请求时排队：合并中间值只保留最新一条，
  function queueLightCommand(queuedCommandRequest: any, queuedPreviewToken: any) {
    const existingRequest = [...lightRequestsById.values()].find(
      (existingRequestEntry: any) => existingRequestEntry.entityId === queuedCommandRequest.entityId
    );
    if (!existingRequest) {
      return sendLightCommand(queuedCommandRequest, queuedPreviewToken);
    }
    const previousCommand = existingRequest.next?.command || existingRequest.command;
    if (previousCommand.service === "turn_on" && queuedCommandRequest.service === "turn_on") {
      const mergedCommandData = {
        ...previousCommand.data
      };
      if (
        "brightness" in queuedCommandRequest.data ||
        "brightness_pct" in queuedCommandRequest.data
      ) {
        delete mergedCommandData.brightness;
        delete mergedCommandData.brightness_pct;
      }
      queuedCommandRequest = {
        ...queuedCommandRequest,
        data: {
          ...mergedCommandData,
          ...queuedCommandRequest.data
        }
      };
    }
    existingRequest.next = {
      command: queuedCommandRequest,
      previewToken: queuedPreviewToken
    };
    lightPreview.hold(queuedCommandRequest.entityId, queuedPreviewToken);
  }


  /**
   * 执行一次灯光操作（开关、亮度、色温、预设），必要时补一条开灯命令。
   */
  async function runLightCommand(service: any, serviceValue: any, targetBinding: any = findFocusedBinding()) {
    if (!!targetBinding && !isEditing && !isDisposed) {
      try {
        const lightStateSnapshot = readLightState(targetBinding.entityId);
        let lightCommandPayload: any;
        let previewValue = serviceValue;
        if (service === "preset") {
          if (!LIGHT_PRESETS.includes(serviceValue)) {
            throw new Error("灯光预设无效。");
          }
          const serviceParams: any[] = [];
          previewValue = {};
          if (lightStateSnapshot.brightnessSupported) {
            serviceParams.push(["brightness", serviceValue.brightness]);
            previewValue.brightness = serviceValue.brightness;
          }
          if (lightStateSnapshot.temperatureSupported) {
            previewValue.kelvin = Math.round(
              (lightStateSnapshot.minimum as number) +
                (((lightStateSnapshot.maximum as number) - (lightStateSnapshot.minimum as number)) *
                  serviceValue.temperaturePercent) /
                  100
            );
            serviceParams.push(["temperature", previewValue.kelvin]);
          }
          if (!serviceParams.length) {
            throw new Error("此设备不支持灯光预设。");
          }
          const generatedCommands = serviceParams.map(([serviceKey, serviceParamValue]) =>
            lightCommand(targetBinding.entityId, serviceKey, serviceParamValue, lightStateSnapshot)
          );
          lightCommandPayload = {
            ...generatedCommands[0],
            data: Object.assign(
              {},
              ...generatedCommands.map((generatedCommand: any) => generatedCommand.data)
            )
          };
          if (lightStateSnapshot.brightnessSupported && serviceValue.brightness < 100) {
            delete lightCommandPayload.data.brightness;
            lightCommandPayload.data.brightness_pct = serviceValue.brightness;
          }
        } else {
          lightCommandPayload = lightCommand(
            targetBinding.entityId,
            service,
            serviceValue,
            lightStateSnapshot
          );
        }
        const previewToken = lightPreview.set(targetBinding.entityId, service, previewValue, true);
        applyLightStates({
          preview: service !== "power"
        });
        queueLightCommand(lightCommandPayload, previewToken);
        controlErrorElement.textContent = "";
        renderMarkers();
      } catch (lightCommandError) {
        controlErrorElement.textContent = (lightCommandError as any).message;
        renderLightPanel();
      }
    }
  }
  /**
   * 点击标记的总入口：按绑定类型分发到聚焦、窗帘 / 扫地机面板、房间快捷入口等。
   */
  function activateBinding(activationBindingId: any, fromPointer: any = false) {
    if (!isEditing && isOverviewMode()) {
      return;
    }
    const activationBinding = findBinding(activationBindingId);
    if (
      !activationBinding ||
      activationBinding.modelAvailable === false ||
      (!isEditing && (activationBinding.overviewQuip || activationBinding.passiveSensor)) ||
      (followedVacuumId && !isEditing)
    ) {
      return;
    }
    const clickAction = activationBinding.clickAction || "focus";
    if (isEditing) {
      selectedId = activationBindingId;
      postToHost({
        type: "edit",
        action: "select",
        id: activationBindingId
      });
      renderMarkers();
      return;
    }
    if (activationBinding.deviceKind === "camera") {
      if (isInteractive && activationBinding.entityId) {
        focusBinding(activationBindingId);
      }
      return;
    }
    if (activationBinding.deviceKind === "vacuum-room") {
      if (
        !isInteractive ||
        !activationBinding.entityId ||
        vacuumRoomTimersById.has(activationBindingId)
      ) {
        return;
      }
      const roomRequestTimeoutId = setTimeout(() => {
        vacuumRoomTimersById.delete(activationBindingId);
        const roomMarkerElement = markersById.get(activationBindingId);
        if (roomMarkerElement) {
          roomMarkerElement.disabled = false;
          roomMarkerElement.title = "请求超时，请检查设备状态";
        }
      }, 14000);
      vacuumRoomTimersById.set(activationBindingId, roomRequestTimeoutId);
      if (markersById.get(activationBindingId)) {
        markersById.get(activationBindingId).disabled = true;
      }
      postToHost({
        type: "vacuum-room",
        id: activationBindingId,
        vacuumId: activationBinding.vacuumId,
        shortcutId: activationBinding.shortcutId
      });
      return;
    }
    if (isFocusableDevice(activationBinding)) {
      const openPanel =
        fromPointer &&
        activationBinding.deviceKind === "vacuum" &&
        vacuumStatusPresentation(activationBinding, statesByEntityId).active;
      focusBinding(
        activationBindingId,
        openPanel || activationBinding.clickAction === "panel" ? "panel" : "runtime"
      );
      return;
    }
    if (activationBinding.deviceKind === "cover") {
      focusBinding(activationBindingId, clickAction === "panel" ? "panel" : "runtime");
      return;
    }
    if (activationBinding.modelId) {
      if (clickAction === "turn-on") {
        climatePanel.update({
          item: activationBinding,
          state: climateState(
            activationBinding.entityId,
            statesByEntityId[activationBinding.entityId]
          ),
          // 与面板登记表里的分支一致：附加功能卡片需要整张状态表才能显示兄弟实体。
          states: statesByEntityId,
          editing: isEditing
        });
        climatePanel.power?.({
          toggle: true
        });
        return;
      }
      focusBinding(activationBindingId, clickAction === "turn-on-panel" ? "panel" : "runtime");
      if (clickAction !== "focus" && focusedId === activationBindingId) {
        climatePanel.power?.({
          toggle: false
        });
      }
      return;
    }
    const activationLightState = resolveLightState(activationBinding.entityId);
    if (clickAction === "turn-on") {
      if (activationLightState.available) {
        runLightCommand("power", !activationLightState.on, activationBinding);
      }
      return;
    }
    if (clickAction === "turn-on-panel") {
      focusBinding(activationBindingId, "panel");
      if (activationLightState.available && !activationLightState.on) {
        runLightCommand("power", true, activationBinding);
      }
      return;
    }
    focusBinding(activationBindingId);
    if (
      focusedId === activationBindingId &&
      focusMode === "runtime" &&
      clickAction === "turn-on-focus" &&
      activationLightState.available &&
      !activationLightState.on
    ) {
      runLightCommand("power", true);
    }
  }
  // 标记布局签名：坐标与可见性都没变时跳过 DOM 写入 ——
  let markerLayoutSignature = "";














  let canvasPointerState: any;
  canvasElement.addEventListener("pointerdown", (canvasPointerDownEvent: any) => {
    canvasPointerState =
      (canvasPointerDownEvent.button == null || canvasPointerDownEvent.button === 0) &&
      canvasPointerDownEvent.isPrimary !== false
        ? {
            x: canvasPointerDownEvent.clientX,
            y: canvasPointerDownEvent.clientY,
            id: canvasPointerDownEvent.pointerId,
            moved: false
          }
        : null;
  });
  /**
   * 楼层切换末段按下即接管相机。
   */
  canvasElement.addEventListener(
    "pointerdown",
    (floorTailDragPointerDownEvent: any) => {
      if (
        floorTailDragPointerDownEvent.isPrimary === false ||
        (floorTailDragPointerDownEvent.button != null &&
          floorTailDragPointerDownEvent.button !== 0) ||
        isRangeEditorOpen ||
        followedVacuumId ||
        markerDragState ||
        (!isInteractive && !isEditing && !isViewEditing) ||
        focusedId ||
        focusMode
      ) {
        return;
      }
      if (cameraTransition?.owner !== "floor") {
        return;
      }
      if (
        !(cameraTransition.amount >= FLOOR_TAIL_DRAG_MIN_PROGRESS) ||
        !cameraTransition.presentationRevealed ||
        !cameraTransition.markersRevealed
      ) {
        return;
      }
      const settledFloorTransition = cameraTransition;
      cameraTransition = null;
      stageOptions.advanceFloorTransition?.(1, stageOptions.cameraState());
      stageOptions.endCameraMotion();
      settledFloorTransition.done?.();
      stageOptions.setOrbitPivot(null);
      syncCameraInteraction();
      updateIdleControllers();
    },
    {
      capture: true
    }
  );
  canvasElement.addEventListener("pointermove", (canvasPointerMoveEvent: any) => {
    if (
      canvasPointerState &&
      (canvasPointerMoveEvent.pointerId !== canvasPointerState.id ||
        Math.hypot(
          canvasPointerMoveEvent.clientX - canvasPointerState.x,
          canvasPointerMoveEvent.clientY - canvasPointerState.y
        ) >= 5)
    ) {
      canvasPointerState.moved = true;
    }
    if (canvasPointerState?.moved && !isRangeEditorOpen) {
      backgroundTheme.interact(canvasPointerMoveEvent, false);
    }
  });
  canvasElement.addEventListener(
    "wheel",
    (wheelEvent: any) => {
      if (!isRangeEditorOpen) {
        backgroundTheme.interact(wheelEvent, false);
      }
    },
    {
      passive: true
    }
  );
  canvasElement.addEventListener("pointercancel", () => {
    canvasPointerState = null;
  });
  canvasElement.addEventListener("pointerup", (canvasPointerUpEvent: any) => {
    const isCanvasClick =
      canvasPointerState &&
      !canvasPointerState.moved &&
      canvasPointerState.id === canvasPointerUpEvent.pointerId &&
      Math.hypot(
        canvasPointerUpEvent.clientX - canvasPointerState.x,
        canvasPointerUpEvent.clientY - canvasPointerState.y
      ) < 5;
    canvasPointerState = null;
    // 聚焦返回动画期间也允许点选其他设备：刚退出聚焦就想切隔壁设备时等动画跑完
    const canPickDuringFocusReturn =
      !cameraTransition ||
      (cameraTransition.owner === "focus" && !cameraTransition.focused && !focusedId && !focusMode);
    if (
      !!isCanvasClick &&
      !followedVacuumId &&
      focusMode !== "edit" &&
      (!!isEditing || !isOverviewMode())
    ) {
      if (
        activeModule === "security" &&
        !isEditing &&
        !isViewEditing &&
        isInteractive &&
        canPickDuringFocusReturn
      ) {
        const pickedSensorId = presenceScene.pick(
          canvasPointerUpEvent.clientX,
          canvasPointerUpEvent.clientY,
          stageOptions.camera,
          canvasElement,
          config.security?.presenceSensors || []
        );
        if (pickedSensorId) {
          focusBinding("presence:" + pickedSensorId);
          return;
        }
      }
      if (
        !isOverviewMode() &&
        activeModule !== "light" &&
        !isViewEditing &&
        canPickDuringFocusReturn &&
        (isEditing || isInteractive)
      ) {
        const pickedEnvironmentModel = stageOptions.pickEnvironmentModel?.(
          canvasPointerUpEvent.clientX,
          canvasPointerUpEvent.clientY,
          collectModuleBindings(),
          canvasPointerUpEvent.pointerType === "touch" ? 10 : 5
        );
        const matchedEnvironmentBinding =
          pickedEnvironmentModel &&
          collectModuleBindings().find(
            (environmentBinding: any) =>
              environmentBinding.floorId === pickedEnvironmentModel.floorId &&
              environmentBinding.modelId === pickedEnvironmentModel.modelId
          );
        if (matchedEnvironmentBinding) {
          activateBinding(matchedEnvironmentBinding.id);
          return;
        }
      }
      exitFocus();
    }
  });
  /**
   * ESC 退出聚焦。具名而不是内联箭头函数：pagehide 时要能摘掉它，
   */
  function handleEscapeKeydown(keydownEvent: any) {
    if (keydownEvent.key === "Escape") {
      exitFocus();
    }
  }
  window.addEventListener("keydown", handleEscapeKeydown);


  window.addEventListener("message", handleHostMessage);
  const orbitControls = stageOptions.controls;
  const unsubscribeCameraChange = stageOptions.onCameraChange?.(() => {
    const isCameraMoving = screenOutlines.cameraChanged();
    scheduleMarkerPositionUpdate();
    layoutPresenceHitBoxes();
    if (isCameraMoving || pageBehavior.hideIconsWhileRotating === true) {
      wakeFrameLoop();
    }
  });
  if (!unsubscribeCameraChange) {
    orbitControls.addEventListener("change", scheduleMarkerPositionUpdate);
  }
  const layoutResizeObserver = new ResizeObserver(scheduleLayoutStage);
  layoutResizeObserver.observe(containerElement);
  layoutResizeObserver.observe(lightPanelElement);
  layoutResizeObserver.observe(navigationElement);
  layoutResizeObserver.observe(floorTabsElement);


  const stopSceneSync = stageOptions.readSceneUpdate
    ? startSceneSync({
        eligible: () =>
          !isDisposed &&
          isPresented &&
          isPageVisible &&
          !document.hidden &&
          !isEditing &&
          !isViewEditing &&
          !focusMode &&
          !cameraTransition &&
          !markerDragState &&
          !isRangeEditorOpen &&
          !isSceneUpdating &&
          !lightRequestsById.size &&
          !climateRequestsById.size &&
          !coverRequestsById.size &&
          !televisionRequestsById.size &&
          !deviceRequestsById.size &&
          !curtainMotion.isMoving() &&
          nextCoverDelayMs() === Infinity &&
          !isActivityHeld &&
          !activePointerIds.size &&
          !pressedKeys.size &&
          performance.now() - lastActivityTimestamp > 1200,
        read: sceneUpdatePayload => stageOptions.readSceneUpdate(sceneUpdatePayload),
        apply: applySceneUpdate
      })
    : () => {};
  /**
   * 渲染循环的一帧：推进各子系统动画、刷新标记与面板，返回下一帧间隔（毫秒）。
   */
  function renderFrame(timestamp: any) {
    if (isDisposed || document.hidden || isSceneUpdating) {
      return Infinity;
    }
    syncPresenceScene();
    const backgroundDelay = backgroundTheme.tick(timestamp);
    const isFloorTransitionActive =
      stageOptions.floorTransitionActive || cameraTransition?.owner === "floor";
    if (!isFloorTransitionActive) {
      syncCurtains();
      syncLocks();
      syncNasStatus();
      syncGenericDeviceStatus();
      syncCameraStatus();
      syncTelevisionScreens();
      syncVacuumMap();
      nasStatus.tick(timestamp);
      for (const genericDeviceStatusLight of genericDeviceStatusLights.values()) {
        genericDeviceStatusLight.tick(timestamp);
      }
      if ([coverFeedback.tick(timestamp), dreamCoverFeedback.tick(timestamp)].some(Boolean)) {
        pruneBladePreviews();
        syncCoverFeedback();
        if (findFocusedBinding()?.deviceKind === "cover") {
          renderLightPanel();
        }
      }
      curtainMotion.update(timestamp);
      // 门动画逐帧推进。门模型清单走 syncLocks 的快照缓存（见下），
      lockMotionActive = lockMotion.tick(timestamp, lockDoorModelsList, statesByEntityId);
    }
    syncVacuumMaps();
    stageOptions.curtainFrame?.({
      key: curtainMotion.poseKey(),
      structure: curtainMotion.structureKey(),
      floorIds: curtainFloorIds,
      moving: curtainMotion.isMoving() || nextCoverDelayMs() <= 1000 / 30
    });
    const presenceWavesDelay = presenceWaves.tick(timestamp);
    const environmentSceneDelay = environmentScene.tick(timestamp);
    if (!isFloorTransitionActive) {
      environmentAirflow.tick(timestamp);
    }
    stageOptions.setEnvironmentActive?.(environmentScene.isActive);
    advanceCameraTransition(timestamp);
    const vacuumMapDelay = vacuumMaps.tick(timestamp);
    idleFocusExit.tick(timestamp);
    idleRotation.tick(timestamp);
    idleIconVisibility.tick(timestamp);
    if (lightPreview.expire()) {
      renderMarkers();
    }
    const frameDeltaSeconds = lastFrameTimestamp
      ? Math.min(0.1, (timestamp - lastFrameTimestamp) / 1000)
      : 0;
    lastFrameTimestamp = timestamp;
    const presenceSceneDelay = !isFloorTransitionActive && presenceScene.tick(frameDeltaSeconds);
    layoutPresenceHitBoxes();
    const hasVacuumMotion = !isFloorTransitionActive && vacuumMotion.tick(frameDeltaSeconds);
    if (hasVacuumMotion) {
      markerLayoutSignature = "";
      updateMarkerPositions(true);
    }
    // 是否至少有一台扫地机处于「工作中」：只有这时才值得重渲染随行台词气泡。
    const hasActiveVacuum = (config.devices?.vacuums || []).some(
      (vacuumStatusEntry: any) => vacuumStatusPresentation(vacuumStatusEntry, statesByEntityId).active
    );
    const vacuumQuipSlot = Math.floor(timestamp / 7000);
    if (hasActiveVacuum && vacuumQuipSlot !== lastVacuumQuipSlot) {
      lastVacuumQuipSlot = vacuumQuipSlot;
      renderMarkers();
    }
    updateVacuumFollow(frameDeltaSeconds);
    const cameraQuaternionKey = stageOptions.camera.quaternion?.toArray?.().join(",") || "";
    if (cameraQuaternionKey !== lastCameraQuaternionKey) {
      const rotationDeltaSeconds =
        Math.min(100, Math.max(1, timestamp - (previousFrameTimestamp ?? timestamp - 16.7))) / 1000;
      const rotationSpeed =
        previousCameraQuaternion.angleTo(stageOptions.camera.quaternion) / rotationDeltaSeconds;
      if (
        lastCameraQuaternionKey &&
        !cameraTransition &&
        !followedVacuumId &&
        (activePointerIds.size || isActivityHeld || rotationSpeed > 0.035)
      ) {
        idleIconHideDeadline = timestamp + 60;
      }
      lastCameraQuaternionKey = cameraQuaternionKey;
    }
    previousCameraQuaternion.copy(stageOptions.camera.quaternion);
    previousFrameTimestamp = timestamp;
    const isUserRotating =
      areIconsHiddenByRotation &&
      !cameraTransition &&
      !followedVacuumId &&
      (activePointerIds.size > 0 || isActivityHeld);
    const shouldHideIcons =
      pageBehavior.hideIconsWhileRotating === true &&
      !isEditing &&
      !isViewEditing &&
      (isIdleRotating || isUserRotating || timestamp < idleIconHideDeadline);
    if (shouldHideIcons !== areIconsHiddenByRotation) {
      areIconsHiddenByRotation = shouldHideIcons;
      updateMarkerVisibility();
    }
    // 当前楼层有没有被跟踪（有动画轨迹、可跟随）的扫地机；没有就隐藏「跟随漫游」
    const hasTrackedVacuum = (config.devices?.vacuums || []).some(
      (trackedVacuumEntry: any) =>
        isOnActiveFloor(trackedVacuumEntry) && vacuumMotion.hasTracking(trackedVacuumEntry.id)
    );
    followButton.hidden =
      isEditing || (!followedVacuumId && (activeModule !== "vacuum" || !hasTrackedVacuum));
    toolbarElement.hidden = followButton.hidden;
    followButton.disabled = !followedVacuumId && !hasTrackedVacuum;
    updateMarkerPositions();
    return Math.min(
      backgroundDelay,
      presenceWavesDelay ? 1000 / 30 : Infinity,
      screenOutlines.nextDelay(),
      presenceSceneDelay ? 1000 / 30 : Infinity,
      hasVacuumMotion || followedVacuumId ? 1000 / 30 : Infinity,
      areIconsHiddenByRotation ? 60 : Infinity,
      hasActiveVacuum ? 7000 - (timestamp % 7000) : Infinity,
      cameraTransition || environmentSceneDelay || vacuumMapDelay ? 0 : Infinity,
      curtainMotion.isMoving() ? 1000 / 30 : Infinity,
      lockMotionActive ? 1000 / 30 : Infinity,
      Math.min(coverFeedback.nextDelay(timestamp), dreamCoverFeedback.nextDelay(timestamp)),
      environmentAirflow.nextDelay(),
      nasStatus.nextDelay(),
      ...Array.from(genericDeviceStatusLights.values(), statusLight => statusLight.nextDelay()),
      idleFocusExit.nextDelay(timestamp),
      idleRotation.nextDelay(timestamp),
      idleIconVisibility.nextDelay(timestamp),
      lightPreview.nextDelay(timestamp)
    );
  }
  // 按需渲染循环：每帧回调 renderFrame，只有它返回非 Infinity 时才会继续下一帧。
  frameLoop = stageOptions.createFrameLoop({
    step: (loopTimestamp: any) => renderFrame(loopTimestamp)
  });
  updateIdleControllers();
  // 页面卸载时统一释放：先停各子系统动画与定时器，再把所有在途控制请求
  window.addEventListener("pagehide", () => {
    // bfcache 下 pagehide 会在 pageshow 之后再次触发；释放只做一次。
    if (isDisposed) {
      return;
    }
    // 这一段是「关键释放」，必须先做，且不依赖后面任何一步。它们的共同性质是：
    isDisposed = true;
    frameLoop?.dispose?.();
    stopSceneSync();
    window.removeEventListener("keydown", handleEscapeKeydown);
    window.removeEventListener("message", handleHostMessage);
    window.removeEventListener("blur", clearInputState);
    for (const removedEventName of TRACKED_INPUT_EVENTS) {
      window.removeEventListener(removedEventName, trackUserInput, true);
    }
    document.removeEventListener("visibilitychange", syncVacuumMaps);
    document.removeEventListener?.("visibilitychange", updateIdleControllers);
    // 相机变更回调在释放后仍会触发 updateMarkerPositions，同样属于「还会动」。
    unsubscribeCameraChange?.();
    if (!unsubscribeCameraChange) {
      orbitControls.removeEventListener("change", scheduleMarkerPositionUpdate);
    }
    layoutResizeObserver.disconnect();
    // 已排程但未执行的那一帧布局要一并取消：dispose 后 DOM 可能已被拆掉。
    if (pendingLayoutFrameId) {
      cancelAnimationFrame(pendingLayoutFrameId);
      pendingLayoutFrameId = 0;
    }
    lightRequestsById.forEach((pendingLightRequestTimer: any) =>
      clearTimeout(pendingLightRequestTimer.timeout)
    );
    lightRequestsById.clear();
    lightStateCache.flush();
    // 在途控制请求一律按失败结清，宿主侧不必等到各自超时才回收。
    for (const televisionRequestKey of televisionRequestsById.keys()) {
      settleTelevisionRequest(televisionRequestKey, "页面已关闭。");
    }
    for (const coverRequestKey of coverRequestsById.keys()) {
      settleCoverRequest(coverRequestKey, "页面已关闭。");
    }
    for (const climateRequestKey of climateRequestsById.keys()) {
      settleClimateRequest(climateRequestKey, "页面已关闭。");
    }
    for (const deviceRequestKey of deviceRequestsById.keys()) {
      settleDeviceRequest(deviceRequestKey, "页面已关闭。");
    }
    postToHost({
      type: "focus-state",
      active: false
    });
    // 其余属于尽力回收：即使某一步抛异常，上面的关键释放已经完成。注意这个 try 只能
    try {
      backgroundTheme.dispose();
      stageOptions.setBackgroundTheme?.(null);
      modulePanelAnimation?.cancel();
      modulePanelAnimation = null;
      cancelModuleTransition();
      vacuumMaps.dispose();
      vacuumMotion.dispose();
      presenceScene.dispose();
      presenceWaves.dispose();
      if (followedVacuumId) {
        stopVacuumFollow(false);
      }
      for (const vacuumRoomTimerId of vacuumRoomTimersById.values()) {
        clearTimeout(vacuumRoomTimerId);
      }
      vacuumRoomTimersById.clear();
      isRangeEditingAllowed = false;
      rangeEditor?.dispose();
      stageOptions.setCurtainSync?.(null);
      stageOptions.setTelevisionSync?.(null);
      coverPanel.dispose();
      coverGroupPanel.dispose();
      curtainMotion.dispose();
      coverFeedback.clear();
      dreamCoverFeedback.clear();
      bladePendingByEntityId.clear();
      screenOutlines.dispose();
      nasPanel.dispose();
      nasStatus.dispose();
      for (const genericDeviceStatusLight of genericDeviceStatusLights.values()) {
        genericDeviceStatusLight.dispose();
      }
      cameraStatus.dispose();
      televisionPanel.dispose();
      televisionScreens.dispose();
      environmentAirflow.dispose();
      environmentScene.dispose();
      climatePanel.dispose();
      devicePanel.dispose();
      lockPanel.dispose();
      lockMotion.dispose();
      stageOptions.finishFloorTransition?.();
      idleRotation.dispose();
      idleIconVisibility.dispose();
      idleFocusExit.dispose();
      cameraTransition = null;
    } catch (teardownError) {
      console.warn("3D 舞台的资源回收未走完，部分节点可能留在页面里。", teardownError);
    }
  });


  postToHost({
    // 挂载即回报 ready：metadata 里带平面图、墙体高度与各类模型坐标，
    type: "ready",
    statePatches: true,
    metadata: buildMetadata()
  });
}