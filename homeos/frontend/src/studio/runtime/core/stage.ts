
import { createAirerMotion as createAirerMotion2 } from "../airer/airer-motion";
import { createFanMotion as createFanMotion2 } from "../fan/fan-motion";
import { createCarCharging as createCarCharging2 } from "../vehicle/car-charging";
import { createSpeakerPanel as createSpeakerPanel2 } from "../speaker/speaker-panel";
import { createSpeakerRings as createSpeakerRings2 } from "../speaker/speaker-ring";
const [
  { backgroundOpacity: labelBackgroundOpacity },
  { withPageAppearancePreset: applyPageAppearancePreset },
  { withRegionLightingPreset: applyRegionLightingPreset },
  { withFixedLightEffects: applyFixedLightEffects },
  {
    temperatureHumidityReading: readTemperatureHumidity,
    temperatureHumidityEntities: temperatureHumidityEntities,
    ENVIRONMENT_METRICS: environmentMetricNames,
    layoutEnvironmentReadings: layoutEnvironmentReadings,
    DEFAULT_LABEL_SIZE: defaultLabelSize,
    DEFAULT_LABEL_ICON_SIZE: defaultLabelIconSize,
    MAX_LABEL_SIZE: maxLabelSize,
    MAX_LABEL_ICON_SIZE: maxLabelIconSize,
    MIN_LABEL_SIZE: minLabelSize,
    MIN_LABEL_ICON_SIZE: minLabelIconSize,
  },
  { popupPlacement: computePopupPlacement },
  { createMarkerTouch: createMarkerTouch, nearestMarkerTarget: nearestMarkerTarget },
  { buttonIconSize: resolveButtonIconSize, DEFAULT_BUTTON_SIZE: defaultButtonSize },
  { CARD_TEXT_SIZE_PX: cardTextSizePx },
] = await Promise.all([
  import("./label-appearance"),
  import("@app/bridge/presets/page-appearance-presets"),
  import("@app/bridge/presets/region-lighting-presets"),
  import("@app/bridge/presets/light-effect-policy"),
  import("@app/bridge/temperature-humidity"),
  import("@app/bridge/presets/popup-placement"),
  import("./marker-input"),
  import("@app/bridge/presets/button-icon-size"),
  import("@app/bridge/presets/card-text-size"),
]);
import {
  createPresenceScene as createPresenceScene2,
  createPresenceWaves as createPresenceWaves2,
} from "../presence/presence-scene";
import { createLockPanel as createLockPanel2 } from "../security/lock-panel";
import { createLockMotion as createLockMotion2 } from "../security/lock-motion";
import {
  createSecurityAlarmOverlay,
  isSecurityAlarmKind,
} from "../security/security-alarm";
import {
  doorModels as doorModels2,
} from "../security/lock-state";
import { createSceneBackground as createSceneBackground2 } from "./scene-background";
import { floorNavigationChoices as floorNavigationChoices2 } from "./floor-navigation";
import {
  createVacuumMotion as createVacuumMotion2,
  createVacuumFollowCamera as createVacuumFollowCamera2,
  vacuumBirdCamera as vacuumBirdCamera2,
  vacuumFollowPose as vacuumFollowPose2,
} from "../vacuum/vacuum-motion";
import {
  createVacuumMaps as createVacuumMaps2,
  vacuumStatusPresentation as vacuumStatusPresentation2,
  vacuumBindingsForMap as vacuumBindingsForMap2,
} from "../vacuum/vacuum-map";
import { createTelevisionPanel as createTelevisionPanel2 } from "../television/television-panel";
import { createTelevisionScreens as createTelevisionScreens2 } from "../television/television-screen";
import { createDevicePanel as createDevicePanel2 } from "../device/device-panel";
import { deviceStatus as deviceStatus2 } from "../device/device-status";
import {
  GENERIC_DEVICE_KINDS as GENERIC_DEVICE_KINDS2,
  genericDeviceProfile as genericDeviceProfile2,
  isGenericDeviceKind as isGenericDeviceKind2,
} from "../device/generic-device-catalog";
import { createNasPanel as createNasPanel2 } from "../nas/nas-panel";
import {
  createNasStatus as createNasStatus2,
} from "../nas/nas-status";
import {
  createCameraStatus as createCameraStatus2,
} from "../camera/camera-status";
import {
  coverState as coverState2,
  coverIconIsOn as coverIconIsOn2,
  coverCanAdjustBlades as coverCanAdjustBlades2,
} from "../cover/cover-state";
import { createCoverFeedback as createCoverFeedback2 } from "../cover/cover-feedback";
import { createCoverPanel as createCoverPanel2 } from "../cover/cover-panel";
import { createCoverGroupPanel as createCoverGroupPanel2 } from "../cover/cover-group-panel";
import type { CurtainGroupLike } from "../cover/cover-groups";
import {
  validCurtainGroups as validCurtainGroups2,
  curtainGroupEntryId as curtainGroupEntryId2,
} from "../cover/cover-groups";
import { createCurtainMotion as createCurtainMotion2 } from "../cover/curtain-motion";
import { createEnvironmentAirflow as createEnvironmentAirflow2 } from "../environment/environment-airflow";
import { createScreenOutlines as createScreenOutlines2 } from "../environment/environment-halos";
import {
  createClimateModeHistory as createClimateModeHistory2,
} from "../climate/climate-state";
import { createClimatePanel as createClimatePanel2 } from "../climate/climate-panel";
import {
  createEnvironmentScene as createEnvironmentScene2,
} from "../environment/environment-scene";
import { startSceneSync as startSceneSync2 } from "./scene-sync";
import {
  createStateUpdatePlanner as createStateUpdatePlanner2,
  lightBindingsForUpdate as lightBindingsForUpdate2,
} from "./state-update-plan";
import {
  createLightColorPicker as createLightColorPicker2,
  createLightModeMenu as createLightModeMenu2,
} from "../light/light-color-picker";
import {
  createLightPreview as createLightPreview2,
  createLightStateCache as createLightStateCache2,
  lightRenderState as lightRenderState2,
} from "../light/light-state";
import {
  createDampedCameraMotion as createDampedCameraMotion2,
} from "../camera/camera-motion";
import {
  resolvePageBehavior as resolvePageBehavior2,
  createIdleRotation as createIdleRotation2,
  createIdleIconVisibility as createIdleIconVisibility2,
  createIdleFocusExit as createIdleFocusExit2,
} from "./idle-rotation";
import {
  lightPresetEntries,
  configuredModuleKinds,
  createStageModelIndex,
  postHostMessage,
  createStageElement,
  coverGeometryOverrides,
  expandGroupMembers,
  isSameCameraPose,
} from "./stage/_shared";
export { createStageModelIndex } from "./stage/_shared";
import { buildMetadata } from "./stage/build-metadata";
import {
  createHandleHostMessage,
  createPickMarkerAtPoint,
  createRenderMarkerPositions,
  createRunFrame,
  createSyncMarkers,
  createUpdateDevicePanel,
  type StageHandlersHost,
} from "./stage/stage-handlers";
import { buildFloorCameraConfig as buildFloorCameraConfigExternal } from "./stage/floor-camera-config";
import { updateLampButtonCore, runLightCommandCore } from "./stage/lighting";
import { buildSliderControlCore, updateEditorSelectionCore, collectClimateBindingsCore, collectModuleBindingsCore, toggleModuleTabsCore, runModuleSwitchAnimationCore } from "./stage/controls";
import { syncCameraInteractionCore, advanceCameraMotionCore, exitFocusModeCore, focusMarkerByIdCore, activateMarkerCore, beginMarkerDragCore, endMarkerDragCore } from "./stage/camera-motion";
import { syncNasOverlayCore, syncEnvironmentLayersCore, syncLayoutMetricsCore, syncStageVisibilityCore } from "./stage/layers-sync";
import { selectFloorCore, openRangeEditorCore, refreshStageUiCore, adoptSceneUpdateCore } from "./stage/refresh";
import { rebuildCurtainMotionCore } from "./stage/curtain-motion";
import { bindNavigationDragCore } from "./stage/navigation-drag";

/**
 * 注入依赖袋的 `getComputedStyle` 必须**钉死接收者**：消费者写成 `deps.getComputedStyle(el)` 时
 * 接收者是袋对象本身，而 WebIDL 只认 Window，普通对象直接 `TypeError: Illegal invocation`
 * （真踩过：`syncPanelChrome → refreshStageUi → toggleModuleTabsCore` 断在这里，而 `stage-handlers.ts`
 * 里的裸调用反而没事）。包一层钉成 window，与 `climate-panel` 用 `defaultView.getComputedStyle` 同理。
 */
const getComputedStyleForDeps = (measurementTarget: Element) =>
  window.getComputedStyle(measurementTarget);

export function mountStage(mountOptions: any) {
  const { THREE: three, container: element, canvas: canvasElement } = mountOptions;
  let value: any = null;
  const hasStageRect = () => !!value,
    noopStageCallback = () => {};

  const stateUpdatePlanner = createStateUpdatePlanner2(),
    stageModelIndex = createStageModelIndex(mountOptions);
  let options: Record<string, any> = {
      lights: [] as any[],
    },
    deviceStates: Record<string, any> = {},
    isEditing = false,
    isAwaitingFloorViewAdjust = false,
    isControlReady = false,
    text = "",
    focusedItemId = "",
    selectedFloorId = "",
    isControlBusy = false,
    isNavigationVisible = false,
    navigationEditing = false,
    num = 0,
    activePointerDrag: any = null,
    activeCameraPose: any = null,
    isStagePresented = false,
    animationFrameRequestId = 0,
    pageBehavior = resolvePageBehavior2(),

    activeModule = "overview",
    selectedSecurityKind = "",
    editingVacuumId = "",
    pendingFloorId = "",
    pendingModule = "",
    hasAutoSelectedFloors = false;
  const isOverviewOrAllFloors = () =>
      activeModule === "overview" || (!isEditing && selectedFloorId === "all"),
    matchesSelectedFloor = (floorBinding: any) =>
      selectedFloorId === "all" || floorBinding.floorId === selectedFloorId;
  let panelDisplayMode = "",
    idleReturnCamera: any = null,
    cameraMotionSnapshot: any = null,
    focusInset = 0,
    hasPendingStageRefresh = false,
    isStageVisible = false,
    isIdleRotationRunning = false,
    isCameraRotating = false,
    idleRotationCameraPose: any = null,
    sceneBackground: any = null,
    hasPresentedOnce = false,
    isPresentedVisible = true,
    isRangeEditorOpen = false,
    rangeEditorHandle: any = null,
    canEditLightRange = false,
    isRangeEditorSuppressingClose = false,
    isRangeEditorOnly = false;
  const wakeSceneBackground = () => sceneBackground?.wake(),
    wakeBackgroundAnimation = () => sceneBackground?.wakeAnimation(),
    sceneBackgroundController = createSceneBackground2(mountOptions, wakeSceneBackground),
    lockMotion = createLockMotion2(mountOptions);
  let selectedLockEntry: any = null;
  mountOptions.setBackgroundTheme?.(sceneBackgroundController);
  let isUserActive = false,
    isPointerHeld = false;
  const set = new Set(),
    lightSyncKeySet = new Set(),
    map = new Map(),
    lightGroupByKey = new Map(),
    sceneCacheByKey = new Map(),
    scratchVector = new three.Vector3();
  let cachedDocumentSource: any,
    cachedDocumentFloorId: any,
    lastInteractionMs: any = null;
  const vector = createLightPreview2(),
    lightHistoryScope = document.body?.dataset?.i3dLightHistoryScope;
  let lightHistoryStorage;
  if (lightHistoryScope)
    try {
      lightHistoryStorage = window.localStorage;
    } catch { /* 存储写入是 best-effort：隐私模式 / 配额 / 序列化失败都不应影响本次渲染 */ }


  const lightStateCacheOptions = {
      storage: lightHistoryStorage,
      scope: lightHistoryScope,
    },
    lightStateCache = createLightStateCache2(lightStateCacheOptions),
    climateModeHistory = createClimateModeHistory2({
      storage: lightHistoryStorage,
      scope: lightHistoryScope,
    });
  function syncAirConditionerHistory(changedAirConditionerState: any = null) {
    if (!isEditing) {
      for (const airConditionerEntry of options.environment?.airConditioners || [])
        (!changedAirConditionerState ||
          changedAirConditionerState.changed.has(airConditionerEntry.entityId)) &&
          climateModeHistory.observe(
            airConditionerEntry.entityId,
            (deviceStates as any)[airConditionerEntry.entityId],
          );
    }
  }
  const resolveDeviceState = (resolvedEntityId: any) =>
    lightStateCache.resolve(resolvedEntityId || "", (deviceStates as any)[resolvedEntityId]);
  let lightEditPreview: any = null,

    baseStageConfig: Record<string, any> = {
      lights: [] as any[],
    },
    isCameraMoving = false,
    hasIdleIconActivity = false,
    pendingEditorAction: any = null,
    furthestFloorOrder = -Infinity;
  const transformFloorCamera = (
      transformedFloorCameraPose: any,
      floorSelectionId = options.floorSelection,
      isImmediateCamera = false,
    ) =>
      mountOptions.transformCamera?.(
        transformedFloorCameraPose,
        floorSelectionId,
        isImmediateCamera,
      ) ?? transformedFloorCameraPose,
    applyDefaultCamera = () =>
      transformFloorCamera(mountOptions.cameraState(true), options.floorSelection, true);
  function buildFloorCameraConfig(rawFloorConfig: any) {
    return buildFloorCameraConfigExternal(
      rawFloorConfig,
      applyPageAppearancePreset,
      transformFloorCamera,
    );
  }
  let startupProgress = mountOptions.onStartupEffectsProgress ? 0 : 1;
  const markerLayerElement = createStageElement("div", "i3d-markers"),
    vacuumWorkingLayerElement = createStageElement("div", "i3d-vacuum-working-layer");
  let idleIconDelayUntilMs = 0,
    cameraQuaternionKey = "",
    isIdleIconHidden = false,
    lastIdleFrameMs = 0,
    lastIdleFloorId = -1,
    followVacuumId = "",
    followReturnCamera: any = null,
    followCameraPose: any = null;
  const scratchQuaternion = new three.Quaternion();
  let lastQuaternionMs: any = null;
  const presentationLayerElement = createStageElement("div", "i3d-presentation");
  const securityAlarmOverlay = createSecurityAlarmOverlay(presentationLayerElement);
  let mediaViewportSize: any = null,
    containerViewportSize: any = null,
    mediaScale = 1;
  const focusVignetteElement = createStageElement("div", "i3d-focus-vignette");
  focusVignetteElement.setAttribute("aria-hidden", "true");
  const toolbarElement = createStageElement("nav", "i3d-toolbar"),
    navigationLayerElement = createStageElement("div", "i3d-navigation"),
    floorTabsElement = createStageElement("nav", "i3d-floor-tabs");
  floorTabsElement.setAttribute("aria-label", "选择楼层");
  let floorTabsSignature = "";
  const moduleTabsElement = createStageElement("nav", "i3d-module-tabs");
  moduleTabsElement.setAttribute("aria-label", "3D 控制模块");
  let isModuleTabsHidden: any = null,
    moduleTabsAnimation: any = null;
  const moduleTabsByKind = new Map();
  let configuredModuleKinds2 = configuredModuleKinds(options);
  for (const [moduleKind, moduleLabel] of [
    ["overview", "3D"],
    ["light", "灯光"],
    ["environment", "环境"],
    ["devices", "设备"],
    ["vacuum", "扫地机"],
    ["security", "安防"],
  ]) {
    const moduleTabButton = createStageElement("button", "", moduleLabel);
    ((moduleTabButton.type = "button"),
      (moduleTabButton.dataset.module = moduleKind),
      moduleTabButton.style.setProperty("--i3d-tab-index", String(moduleTabsByKind.size)),

      moduleTabButton.addEventListener("click", () => {
        if (moduleTabsElement.dataset.dragged === "true") {
          moduleTabsElement.dataset.dragged = "";
          return;
        }
        selectModule(moduleKind);
      }),
      moduleTabsElement.append(moduleTabButton),
      moduleTabsByKind.set(moduleKind, moduleTabButton));
  }
  const moduleEmptyElement = createStageElement("p", "i3d-module-empty");
  (moduleEmptyElement.setAttribute("role", "status"), (moduleEmptyElement.hidden = true));
  const restoreViewButton = createStageElement("button", "", "恢复视角");
  ((restoreViewButton.type = "button"),
    (restoreViewButton.hidden = true),
    toolbarElement.append(restoreViewButton));
  const lightPanelSection = createStageElement("section", "i3d-light-panel");
  (lightPanelSection.setAttribute("aria-label", "灯光控制"),
    lightPanelSection.setAttribute("inert", ""));
  const lightPanelHeader = createStageElement("header"),
    lightHeadingElement = createStageElement("div", "i3d-light-heading-text"),
    lightTitleElement = createStageElement("strong", "", "灯光"),
    deviceStatusElement = createStageElement("p", "i3d-device-status");
  lightHeadingElement.append(lightTitleElement, deviceStatusElement);
  const powerButton = createStageElement("button", "i3d-power");
  powerButton.type = "button";
  const lampDrawingElement = createStageElement("span", "i3d-lamp-drawing");
  lampDrawingElement.setAttribute("aria-hidden", "true");
  const lampAuraElement = createStageElement("span", "i3d-lamp-aura"),
    lampBodyElement = createStageElement("span", "i3d-lamp-body");
  for (const lampPartName of ["cord", "shade", "bulb", "filament"])
    lampBodyElement.append(createStageElement("i", "i3d-lamp-" + lampPartName));
  (lampDrawingElement.append(lampAuraElement, lampBodyElement),
    powerButton.append(lampDrawingElement),
    lightPanelHeader.append(lightHeadingElement, powerButton));
  const lightModeMenu = createLightModeMenu2((menuMode: any) => {
    const menuLightEntry = getFocusedEntry();
    if (!menuLightEntry) return;
    const menuLightRenderState = resolveLightState(menuLightEntry);
    (lightColorPicker.cancel(),
      runLightCommand(
        menuMode,
        menuMode === "color"
          ? menuLightRenderState.colorHs || [0, 0]
          : menuMode === "temperature"
            ? menuLightRenderState.kelvin || menuLightRenderState.minimum
            : true,
      ));
  });
  lightHeadingElement.append(lightModeMenu.root);
  const lightControlsElement = createStageElement("div", "i3d-light-controls"),
    lightColorPicker = createLightColorPicker2({
      onPreview(previewColor: any) {
        const previewLightEntry = getFocusedEntry();
        if (!previewLightEntry || isEditing || !resolveLightState(previewLightEntry).available)
          return null;
        const colorValue = vector.set(previewLightEntry.entityId, "color", previewColor);
        return (
          wakeSceneBackground(),
          applyLightStates({
            preview: true,
          }),
          updateLampButton(resolveLightState(previewLightEntry)),
          colorValue
        );
      },
      onCommit: (committedColor: any) => void runLightCommand("color", committedColor),
      onCancel(cancelEntityId: any, cancelReason: any) {
        (vector.reject(cancelEntityId, cancelReason),
          applyLightStates({
            preview: true,
          }),
          updateDevicePanel());
      },
    });
  lightControlsElement.append(lightColorPicker.root);
  function stageControlsDeps() {
    return ({
      get getFocusedEntry() {
        return getFocusedEntry;
      },
      get isEditing() {
        return isEditing;
      },
      get resolveLightState() {
        return resolveLightState;
      },
      get vector() {
        return vector;
      },
      get wakeSceneBackground() {
        return wakeSceneBackground;
      },
      get updateDevicePanel() {
        return updateDevicePanel;
      },
      get applyLightStates() {
        return applyLightStates;
      },
      get runLightCommand() {
        return runLightCommand;
      },
      get lightControlsElement() {
        return lightControlsElement;
      },
      get currentModuleBindings() {
        return currentModuleBindings;
      },
      get text() {
        return text;
      },
      get editorSelectionElement() {
        return editorSelectionElement;
      },
      get activeModule() {
        return activeModule;
      },
      get selectedSecurityKind() {
        return selectedSecurityKind;
      },
      get mountOptions() {
        return mountOptions;
      },
      get editorSelectionOutlines() {
        return editorSelectionOutlines;
      },
      get options() {
        return options;
      },
      get stageModelIndex() {
        return stageModelIndex;
      },
      get isOverviewOrAllFloors() {
        return isOverviewOrAllFloors;
      },
      get collectSecurityBindings() {
        return collectSecurityBindings;
      },
      get collectVacuumShortcuts() {
        return collectVacuumShortcuts;
      },
      get editingVacuumId() {
        return editingVacuumId;
      },
      get collectGenericDeviceBindings() {
        return collectGenericDeviceBindings;
      },
      get collectNasBindings() {
        return collectNasBindings;
      },
      get collectVacuumBindings() {
        return collectVacuumBindings;
      },
      get collectSpeakerBindings() {
        return collectSpeakerBindings;
      },
      get collectTelevisionBindings() {
        return collectTelevisionBindings;
      },
      get collectCoverBindings() {
        return collectCoverBindings;
      },
      get collectGroupedCovers() {
        return collectGroupedCovers;
      },
      get isModuleTabsHidden() {
        return isModuleTabsHidden;
      },
      set isModuleTabsHidden(v) {
        isModuleTabsHidden = v;
      },
      get moduleTabsElement() {
        return moduleTabsElement;
      },
      get getComputedStyle() {
        return getComputedStyleForDeps;
      },
      get moduleTabsAnimation() {
        return moduleTabsAnimation;
      },
      set moduleTabsAnimation(v) {
        moduleTabsAnimation = v;
      },
      get restoreFocusWithin() {
        return restoreFocusWithin;
      },
      get moduleTabsByKind() {
        return moduleTabsByKind;
      },
      get configuredModuleKinds2() {
        return configuredModuleKinds2;
      },
      get markerLayerElement() {
        return markerLayerElement;
      },
      get cancelGhostAnimation() {
        return cancelGhostAnimation;
      },
      get map() {
        return map;
      },
      get outgoingGhostAnimation() {
        return outgoingGhostAnimation;
      },
      set outgoingGhostAnimation(v) {
        outgoingGhostAnimation = v;
      },
      get syncStageVisibility() {
        return syncStageVisibility;
      },
    });
  }

  function buildSliderControl(sliderLabelText: any, sliderKey: any, sliderMin: any, sliderMax: any) {
    return buildSliderControlCore(stageControlsDeps(), sliderLabelText, sliderKey, sliderMin, sliderMax);
  }
  function updateEditorSelection() {
    return updateEditorSelectionCore(stageControlsDeps());
  }
  function collectClimateBindings() {
    return collectClimateBindingsCore(stageControlsDeps());
  }
  function collectModuleBindings() {
    return collectModuleBindingsCore(stageControlsDeps());
  }
  function toggleModuleTabs(shouldHideTabs: any) {
    return toggleModuleTabsCore(stageControlsDeps(), shouldHideTabs);
  }
  function runModuleSwitchAnimation(switchContent: any) {
    return runModuleSwitchAnimationCore(stageControlsDeps(), switchContent);
  }
  const temperatureSlider = buildSliderControl("色温", "temperature", "2000", "6500"),
    brightnessSlider = buildSliderControl("亮度", "brightness", "1", "100"),
    lightPresetsElement = createStageElement("div", "i3d-light-presets");
  (lightPresetsElement.setAttribute("role", "group"),
    lightPresetsElement.setAttribute("aria-label", "灯光预设"));
  const lightPresetRecords = lightPresetEntries.map((presetEntry) => {
    const lightPresetButton = createStageElement("button", "i3d-light-preset");
    lightPresetButton.type = "button";
    const presetBrightnessLabel = createStageElement("small", "", presetEntry.brightness + "%");
    return (
      lightPresetButton.append(
        createStageElement("strong", "", presetEntry.label),
        presetBrightnessLabel,
      ),
      lightPresetButton.addEventListener(
        "click",
        () => void runLightCommand("preset", presetEntry),
      ),
      lightPresetsElement.append(lightPresetButton),
      {
        ...presetEntry,
        button: lightPresetButton,
        detail: presetBrightnessLabel,
      }
    );
  });
  lightControlsElement.append(lightPresetsElement);
  const controlErrorElement = createStageElement("p", "i3d-control-error");
  controlErrorElement.setAttribute("role", "status");
  const pendingControlRequestsByRequestId = new Map(),
    buildBindingCommand = (commandBinding: any, commandDevice: any, isExtraCommand = false) => ({
      ...commandBinding,
      bindingId: isExtraCommand
        ? commandDevice.id.slice(commandDevice.deviceKind.length + 1)
        : commandDevice.id,
      bindingFloorId: commandDevice.floorId,
      bindingModelId: commandDevice.modelId,
    }),
    climatePanel = createClimatePanel2({
      modeHistory: climateModeHistory,
      onLayout: (climateLayout: any = null) => {
        isEditing &&
          ["climate", "fan", "purifier", "water-heater"].includes(activeModule) &&
          getFocusedEntry() &&
          postHostMessage({
            type: "edit",
            action: "purifier-layout",
            id: getFocusedEntry().id,
            extraControls: climateLayout,
          });
      },
      onControl: (climateControl: any = null, climateDeviceState: any = null) =>
        new Promise<void>((climateResolve, climateReject) => {
          const climateBinding = collectClimateBindings().find(
              (climateCandidate) =>
                climateDeviceState &&
                (climateCandidate.id === climateDeviceState.id ||
                  "climate:" + climateCandidate.id === climateDeviceState.id) &&
                climateCandidate.floorId === climateDeviceState.floorId &&
                climateCandidate.modelId === climateDeviceState.modelId,
            ),
            extraControlKind = climateBinding?.pedestalFan
              ? "fan-extra"
              : climateBinding?.waterHeater
                ? "water-heater-extra"
                : climateBinding?.climateType === "bath-heater"
                  ? "climate-extra"
                  : climateBinding?.airPurifier || climateBinding?.entityId?.startsWith("fan.")
                    ? "purifier-extra"
                    : "climate-extra",
            isExtraControlMatch = climateControl.deviceKind?.endsWith("-extra")
              ? climateControl.deviceKind === extraControlKind &&
                climateBinding?.extraControls?.some(
                  (matchedExtraControl: any) => matchedExtraControl.entityId === climateControl.entityId,
                )
              : climateBinding?.entityId === climateControl.entityId &&
                !!climateBinding?.pedestalFan == (climateControl.deviceKind === "fan");
          if (
            !isControlReady ||
            isEditing ||
            isControlBusy ||
            !isExtraControlMatch ||
            !matchesSelectedFloor(climateBinding || {}) ||
            climateBinding?.visible === false ||
            activeModule !== (climateBinding?.waterHeater ? "devices" : "environment") ||
            !climateBinding?.modelId ||
            !climateBinding.modelAvailable
          ) {
            climateReject(new Error("当前设备不可控制。"));
            return;
          }
          const climateRequestId = "climate-" + ++num,
            climateRequestTimeoutId = setTimeout(
              () => settleClimateRequest(climateRequestId, "请求超时，请检查设备状态。"),
              14000,
            );
          (pendingControlRequestsByRequestId.set(climateRequestId, {
            resolve: climateResolve,
            reject: climateReject,
            timeout: climateRequestTimeoutId,
          }),
            postHostMessage({
              type: "control",
              requestId: climateRequestId,
              command:
                climateBinding.climateType === "bath-heater"
                  ? buildBindingCommand(
                      {
                        ...climateControl,
                        deviceKind: climateControl.deviceKind?.endsWith("-extra")
                          ? "climate-extra"
                          : "bath-heater",
                      },
                      climateBinding,
                    )
                  : climateControl.deviceKind?.endsWith("-extra")
                    ? buildBindingCommand(climateControl, climateBinding)
                    : climateControl,
            }));
        }),
    });
  function settleClimateRequest(climateSettledRequestId: any, climateSettleErrorMessage: any) {
    const pendingClimateRequest = pendingControlRequestsByRequestId.get(climateSettledRequestId);
    pendingClimateRequest &&
      (clearTimeout(pendingClimateRequest.timeout),
      pendingControlRequestsByRequestId.delete(climateSettledRequestId),
      climateSettleErrorMessage
        ? pendingClimateRequest.reject(new Error(climateSettleErrorMessage))
        : pendingClimateRequest.resolve());
  }
  const tiltPreviewByCoverKey = new Map(),
    computeCoverKey = (coverKeyBinding: any) =>
      JSON.stringify([
        coverKeyBinding.entityId,
        coverKeyBinding.coverKind === "dream" ? "dream" : "rail",
      ]),
    findCoverBinding = (coverLookupEntityId: any, coverLookupBinding: any) =>
      collectCoverBindings().find(
        (coverLookupCandidate) =>
          coverLookupCandidate.entityId === coverLookupEntityId &&
          (!coverLookupBinding?.id ||
            coverLookupCandidate.id === coverLookupBinding.id ||
            "cover:" + coverLookupCandidate.id === coverLookupBinding.id),
      );
  let coverFeedbackStorage;
  if (lightHistoryScope)
    try {
      coverFeedbackStorage = window.sessionStorage;
    } catch { /* 存储写入是 best-effort：隐私模式 / 配额 / 序列化失败都不应影响本次渲染 */ }
  const coverControlRequestsByRequestId = new Map(),
    coverFeedback = createCoverFeedback2({
      commandPreview: true,
      storage: coverFeedbackStorage,
      scope: lightHistoryScope,
    }),
    dreamTiltFeedback = createCoverFeedback2({
      commandPreview: true,
      travelTime: 2400,
    });
  function pruneTiltPreviews() {
    for (const [coverFeedbackKey, coverFeedbackState] of tiltPreviewByCoverKey) {
      const primaryFeedbackState = coverFeedback.read(coverFeedbackKey, undefined),
        tiltFeedbackState = dreamTiltFeedback.read(coverFeedbackKey, undefined);
      if (!primaryFeedbackState?.available || !tiltFeedbackState?.available) {
        tiltPreviewByCoverKey.delete(coverFeedbackKey);
        continue;
      }
      if (
        primaryFeedbackState.positionReported &&
        primaryFeedbackState.raw.attributes.current_position !== coverFeedbackState.reported
      ) {
        tiltPreviewByCoverKey.delete(coverFeedbackKey);
        continue;
      }
      Math.abs((tiltFeedbackState.position ?? -100) - 50) > 0.01 ||
        (tiltPreviewByCoverKey.delete(coverFeedbackKey),
        coverFeedback.startPreview(coverFeedbackKey, coverFeedbackState.requestId));
    }
  }
  const nextCoverFeedbackDelay = () =>
    Math.min(coverFeedback.nextDelay(), dreamTiltFeedback.nextDelay());
  function readCoverFeedback(
    feedbackBinding: any,
    initialCoverState = coverState2(
      feedbackBinding.entityId,
      (deviceStates as any)[feedbackBinding.entityId],
      feedbackBinding,
    ),
  ) {
    if (feedbackBinding.airer) return airerMotion.read(feedbackBinding, initialCoverState);
    const baseCoverFeedback = coverFeedback.read(
      computeCoverKey(feedbackBinding),
      initialCoverState,
    );
    if (feedbackBinding.coverKind !== "dream") return baseCoverFeedback;
    const tiltCoverFeedback = dreamTiltFeedback.read(computeCoverKey(feedbackBinding), undefined),
      hasDreamTiltPreview = tiltPreviewByCoverKey.has(computeCoverKey(feedbackBinding));
    return {
      ...baseCoverFeedback,
      ...(hasDreamTiltPreview
        ? {
            state: "opening",
            opening: true,
            closing: false,
            moving: true,
            closedConfirmed: false,
          }
        : {}),
      tiltPosition: tiltCoverFeedback?.position ?? initialCoverState.tiltPosition,
      tiltTarget: tiltCoverFeedback?.targetPosition ?? null,
      error: tiltCoverFeedback?.error || baseCoverFeedback?.error || "",
    };
  }
  const coverPanelOptions = {
      onPreview: (previewDeviceBinding: any, previewPosition: any, previewTargetBinding: any) => {
        const previewCoverBinding = findCoverBinding(previewDeviceBinding, previewTargetBinding);
        if (!previewCoverBinding) return;
        if (previewCoverBinding.airer) return readCoverFeedback(previewCoverBinding);
        const previewCoverKey = computeCoverKey(previewCoverBinding);
        return (
          (previewPosition !== null &&
            previewCoverBinding?.coverKind === "dream" &&
            !coverCanAdjustBlades2(
              coverState2(
                previewCoverBinding.entityId,
                (deviceStates as any)[previewCoverBinding.entityId],
                previewCoverBinding,
              ),
              readCoverFeedback(previewCoverBinding),
            )) ||
            (previewPosition === null
              ? (dreamTiltFeedback.preview(previewCoverKey, null),
                coverFeedback.preview(previewCoverKey, null))
              : (previewCoverBinding.coverKind === "dream"
                  ? dreamTiltFeedback
                  : coverFeedback
                ).preview(previewCoverKey, previewPosition),
            syncCoverIconStates(),
            wakeSceneBackground()),
          readCoverFeedback(previewCoverBinding)
        );
      },
      onControl: (coverControlRequest: any, coverControlBinding: any) =>
        new Promise((coverResolve, coverReject) => {
          const coverActionBinding = findCoverBinding(
            coverControlRequest.entityId,
            coverControlBinding,
          );
          if (
            !isControlReady ||
            isEditing ||
            isControlBusy ||
            activeModule !== (coverActionBinding?.airer ? "devices" : "environment") ||
            !coverActionBinding?.modelId ||
            !coverActionBinding.modelAvailable ||
            !matchesSelectedFloor(coverActionBinding)
          ) {
            coverReject(
              new Error(coverActionBinding?.airer ? "当前晾衣架不可控制。" : "当前窗帘不可控制。"),
            );
            return;
          }
          if (coverActionBinding.airer) {
            const airerRequestId = "airer-" + ++num,
              airerRequestTimeoutId = setTimeout(
                () => settleMediaRequest(airerRequestId, "请求超时，请检查设备状态。"),
                14000,
              );
            (mediaControlRequestsByRequestId.set(airerRequestId, {
              resolve: coverResolve,
              reject: coverReject,
              timeout: airerRequestTimeoutId,
            }),
              postHostMessage({
                type: "control",
                requestId: airerRequestId,
                command: {
                  ...coverControlRequest,
                  deviceKind: "airer",
                },
              }));
            return;
          }
          const coverEntryKey = computeCoverKey(coverActionBinding),
            tiltCommand = {
              ...coverControlRequest,
              entityId: coverEntryKey,
            },
            coverRequestId = "cover-" + ++num,
            coverRequestTimeoutId = setTimeout(
              () => failCoverRequest(coverRequestId, "请求超时，请检查设备状态。"),
              14000,
            );
          rebuildCurtainMotion();
          const includes =
            coverActionBinding.coverKind === "dream" &&
            ["set_cover_position", "set_cover_tilt_position"].includes(coverControlRequest.service);
          if (
            includes &&
            !coverCanAdjustBlades2(
              coverState2(
                coverActionBinding.entityId,
                (deviceStates as any)[coverActionBinding.entityId],
                coverActionBinding,
              ),
              readCoverFeedback(coverActionBinding),
            )
          ) {
            (clearTimeout(coverRequestTimeoutId),
              coverReject(new Error("只有整体完全开启或完全关闭后，才能调整叶片。")));
            return;
          }
          let isDreamTiltPreview = false;
          if (!includes && coverActionBinding.coverKind === "dream") {
            tiltPreviewByCoverKey.delete(coverEntryKey);
            const coverBindingState = readCoverFeedback(coverActionBinding);
            ((isDreamTiltPreview =
              coverControlRequest.service === "open_cover" &&
              coverBindingState.tiltPosition !== null &&
              Math.abs(coverBindingState.tiltPosition - 50) > 0.01),
              isDreamTiltPreview &&
                tiltPreviewByCoverKey.set(coverEntryKey, {
                  requestId: coverRequestId,
                  reported: coverBindingState.raw.attributes.current_position,
                }),
              coverControlRequest.service === "stop_cover"
                ? dreamTiltFeedback.begin(tiltCommand, coverRequestId)
                : dreamTiltFeedback.begin(
                    {
                      ...tiltCommand,
                      service: "set_cover_position",
                      data: {
                        position: 50,
                      },
                    },
                    coverRequestId,
                  ));
          }
          const activeCoverFeedback = includes ? dreamTiltFeedback : coverFeedback;
          (activeCoverFeedback.begin(
            includes
              ? {
                  ...tiltCommand,
                  service: "set_cover_position",
                  data: {
                    position:
                      coverControlRequest.data.tilt_position ?? coverControlRequest.data.position,
                  },
                }
              : tiltCommand,
            coverRequestId,
            {
              defer: isDreamTiltPreview,
            },
          ),
            syncCoverIconStates(),
            coverControlRequestsByRequestId.set(coverRequestId, {
              resolve: coverResolve,
              reject: coverReject,
              timeout: coverRequestTimeoutId,
              key: coverEntryKey,
              feedback: activeCoverFeedback,
            }),
            postHostMessage({
              type: "control",
              requestId: coverRequestId,
              command: coverControlRequest,
            }),
            syncMarkers(),
            wakeSceneBackground());
        }),
    },
    coverPanel = createCoverPanel2({
      ...coverPanelOptions,
      onLayout: (coverLayout) => {
        isEditing &&
          activeModule === "airer" &&
          getFocusedEntry() &&
          postHostMessage({
            type: "edit",
            action: "purifier-layout",
            id: getFocusedEntry().id,
            extraControls: coverLayout,
          });
      },
      onExtraControl: (coverExtraControl) =>
        new Promise((coverExtraResolve, coverExtraReject) => {
          const extraControlEntry = getFocusedEntry();
          if (
            !isControlReady ||
            isEditing ||
            isControlBusy ||
            activeModule !== "devices" ||
            !extraControlEntry?.airer ||
            !extraControlEntry.modelAvailable ||
            !matchesSelectedFloor(extraControlEntry) ||
            !(extraControlEntry.extraControls || []).some(
              (extraControlCandidate: any) =>
                extraControlCandidate.entityId === coverExtraControl.entityId,
            )
          ) {
            coverExtraReject(new Error("当前晾衣架不可控制。"));
            return;
          }
          const airerExtraRequestId = "airer-extra-" + ++num,
            airerExtraRequestTimeoutId = setTimeout(
              () => settleMediaRequest(airerExtraRequestId, "请求超时，请检查设备状态。"),
              14000,
            );
          (mediaControlRequestsByRequestId.set(airerExtraRequestId, {
            resolve: coverExtraResolve,
            reject: coverExtraReject,
            timeout: airerExtraRequestTimeoutId,
          }),
            postHostMessage({
              type: "control",
              requestId: airerExtraRequestId,
              command: buildBindingCommand(
                {
                  ...coverExtraControl,
                  deviceKind: "airer-extra",
                },
                extraControlEntry,
                true,
              ),
            }));
        }),
    }),
    coverGroupPanel = createCoverGroupPanel2(coverPanelOptions);
  function failCoverRequest(coverFailedRequestId: any, coverFailedErrorMessage: any) {
    const coverRequestEntry = coverControlRequestsByRequestId.get(coverFailedRequestId);
    coverRequestEntry &&
      (clearTimeout(coverRequestEntry.timeout),
      coverControlRequestsByRequestId.delete(coverFailedRequestId),
      coverFailedErrorMessage
        ? (tiltPreviewByCoverKey.get(coverRequestEntry.key)?.requestId === coverFailedRequestId &&
            tiltPreviewByCoverKey.delete(coverRequestEntry.key),
          dreamTiltFeedback.fail(
            coverRequestEntry.key,
            coverFailedRequestId,
            coverFailedErrorMessage,
          ),
          coverRequestEntry.feedback.fail(
            coverRequestEntry.key,
            coverFailedRequestId,
            coverFailedErrorMessage,
          ),
          syncCoverIconStates(),
          updateDevicePanel(),
          wakeSceneBackground(),
          coverRequestEntry.reject(new Error(coverFailedErrorMessage)))
        : coverRequestEntry.resolve());
  }
  const mediaControlRequestsByRequestId = new Map(),
    controlMediaDevice = (mediaCommand: any = null, mediaTargetEntry = getFocusedEntry()) =>
      new Promise<void>((mediaResolve, mediaReject) => {
        if (
          !isControlReady ||
          isEditing ||
          isControlBusy ||
          activeModule !== "devices" ||
          !["television", "speaker"].includes(mediaTargetEntry?.deviceKind) ||
          mediaCommand.deviceKind !== mediaTargetEntry.deviceKind ||
          !mediaTargetEntry.modelAvailable ||
          !matchesSelectedFloor(mediaTargetEntry) ||
          ((["turn_on", "turn_off"].includes(mediaCommand.service) &&
            mediaTargetEntry.powerEntityId) ||
            mediaTargetEntry.entityId) !== mediaCommand.entityId
        ) {
          mediaReject(new Error("当前媒体设备不可控制。"));
          return;
        }
        const mediaRequestId = "television-" + ++num,
          mediaRequestTimeoutId = setTimeout(
            () => settleMediaRequest(mediaRequestId, "请求超时，请检查设备状态。"),
            14000,
          );
        (mediaControlRequestsByRequestId.set(mediaRequestId, {
          resolve: mediaResolve,
          reject: mediaReject,
          timeout: mediaRequestTimeoutId,
          entityId: mediaCommand.entityId,
        }),
          postHostMessage({
            type: "control",
            requestId: mediaRequestId,
            command: mediaCommand,
          }));
      }),
    speakerPanel = createSpeakerPanel2({
      onControl: controlMediaDevice,
    }),
    nasPanel = createNasPanel2(),
    televisionPanel = createTelevisionPanel2({
      onControl: controlMediaDevice,
    }),
    devicePanel = createDevicePanel2({
      onLayout: (genericDeviceLayout: any = null) => {
        isEditing &&
          isGenericDeviceKind2(activeModule) &&
          getFocusedEntry() &&
          postHostMessage({
            type: "edit",
            action: "device-layout",
            id: getFocusedEntry().id,
            extraControls: genericDeviceLayout,
          });
      },
      onControl: (genericDeviceControl: any) =>
        new Promise((genericDeviceResolve, genericDeviceReject) => {
          const genericDeviceEntry = getFocusedEntry();
          if (
            !isControlReady ||
            isEditing ||
            isControlBusy ||
            activeModule !== "devices" ||
            !isGenericDeviceKind2(genericDeviceEntry?.deviceKind) ||
            !genericDeviceEntry.modelAvailable ||
            !(genericDeviceEntry.extraControls || []).some(
              (genericDeviceExtraControl: any) =>
                genericDeviceExtraControl.entityId === genericDeviceControl.entityId,
            )
          ) {
            genericDeviceReject(new Error("当前设备不可控制。"));
            return;
          }
          const deviceRequestId = "device-" + ++num,
            deviceRequestTimeoutId = setTimeout(
              () => settleMediaRequest(deviceRequestId, "请求超时，请检查设备状态。"),
              14000,
            );
          (mediaControlRequestsByRequestId.set(deviceRequestId, {
            resolve: genericDeviceResolve,
            reject: genericDeviceReject,
            timeout: deviceRequestTimeoutId,
          }),
            postHostMessage({
              type: "control",
              requestId: deviceRequestId,
              command: buildBindingCommand(genericDeviceControl, genericDeviceEntry, true),
            }));
        }),
    });
  function settleMediaRequest(mediaSettledRequestId: any, mediaSettleErrorMessage: any) {
    const mediaRequestEntry = mediaControlRequestsByRequestId.get(mediaSettledRequestId);
    mediaRequestEntry &&
      (clearTimeout(mediaRequestEntry.timeout),
      mediaControlRequestsByRequestId.delete(mediaSettledRequestId),
      mediaSettleErrorMessage
        ? mediaRequestEntry.reject(new Error(mediaSettleErrorMessage))
        : mediaRequestEntry.resolve());
  }
  const lockPanel = createLockPanel2({
    onControl: (lockControl: any) =>
      new Promise((lockResolve, lockReject) => {
        const lockEntry = getFocusedEntry();
        if (
          !isControlReady ||
          isEditing ||
          isControlBusy ||
          activeModule !== "security" ||
          lockEntry?.deviceKind !== "lock" ||
          !lockEntry.modelAvailable ||
          lockControl.entityId !== lockEntry.entityId
        ) {
          lockReject(new Error("当前门锁不可控制。"));
          return;
        }
        const lockRequestId = "lock-" + ++num,
          lockRequestTimeoutId = setTimeout(
            () => settleMediaRequest(lockRequestId, "请求超时，请检查门锁状态。"),
            14000,
          );
        (mediaControlRequestsByRequestId.set(lockRequestId, {
          resolve: lockResolve,
          reject: lockReject,
          timeout: lockRequestTimeoutId,
        }),
          postHostMessage({
            type: "control",
            requestId: lockRequestId,
            command: lockControl,
          }));
      }),
  });
  lightPanelSection.append(
    lightPanelHeader,
    lightControlsElement,
    controlErrorElement,
    climatePanel.root,
    coverPanel.root,
    coverGroupPanel.root,
    nasPanel.root,
    televisionPanel.root,
    speakerPanel.root,
    devicePanel.root,
    lockPanel.root,
  );
  const curtainMotion = createCurtainMotion2({
    THREE: three,
    requestRender: () => wakeBackgroundAnimation(),
  });
  let curtainSyncSnapshot: any = null,
    list: any = [],
    trackedCoverBindings: any = [];
  function syncCoverIconStates() {
    for (const trackedCoverBinding of trackedCoverBindings) {
      const trackedCoverState = readCoverFeedback(trackedCoverBinding);
      trackedCoverBinding.airer ||
        curtainMotion.setState(trackedCoverBinding.id, trackedCoverState, {
          immediate: true,
        });
      const coverIconElement = map.get("cover:" + trackedCoverBinding.id);
      coverIconElement &&
        coverIconElement.classList.toggle(
          "is-on",
          coverIconIsOn2(trackedCoverBinding, trackedCoverState),
        );
    }
    for (const curtainGroupBinding of buildCurtainGroups()) {
      const coverGroupElement = map.get(
        isEditing
          ? curtainGroupBinding!.id
          : curtainGroupBinding!.isCurtainGroup
            ? "cover:" + curtainGroupBinding!.id
            : "cover:" + curtainGroupBinding!.id,
      );
      coverGroupElement &&
        curtainGroupBinding!.memberItems.forEach((groupMemberBinding, groupMemberIndex) => {
          const memberCoverElement = coverGroupElement.children[groupMemberIndex],
            memberCoverState = readCoverFeedback(groupMemberBinding);
          (memberCoverElement?.classList.toggle(
            "is-on",
            groupMemberBinding.modelAvailable &&
              coverIconIsOn2(groupMemberBinding, memberCoverState),
          ),
            memberCoverElement?.classList.toggle(
              "is-offline",
              !isEditing &&
                (!groupMemberBinding.entityId ||
                  !groupMemberBinding.modelAvailable ||
                  !memberCoverState?.available),
            ));
        });
    }
  }
  function stageCurtainMotionDeps() {
    return ({
      get mountOptions() {
        return mountOptions;
      },
      get curtainSyncSnapshot() {
        return curtainSyncSnapshot;
      },
      set curtainSyncSnapshot(v) {
        curtainSyncSnapshot = v;
      },
      get options() {
        return options;
      },
      get deviceStates() {
        return deviceStates;
      },
      get syncCoverIconStates() {
        return syncCoverIconStates;
      },
      get collectCoverBindings() {
        return collectCoverBindings;
      },
      get collectPreviewCovers() {
        return collectPreviewCovers;
      },
      get trackedCoverBindings() {
        return trackedCoverBindings;
      },
      set trackedCoverBindings(v) {
        trackedCoverBindings = v;
      },
      get list() {
        return list;
      },
      set list(v) {
        list = v;
      },
      get curtainMotion() {
        return curtainMotion;
      },
      get coverFeedback() {
        return coverFeedback;
      },
      get computeCoverKey() {
        return computeCoverKey;
      },
      get dreamTiltFeedback() {
        return dreamTiltFeedback;
      },
      get tiltPreviewByCoverKey() {
        return tiltPreviewByCoverKey;
      },
      get pruneTiltPreviews() {
        return pruneTiltPreviews;
      },
      get startupProgress() {
        return startupProgress;
      },
      get nextCoverFeedbackDelay() {
        return nextCoverFeedbackDelay;
      },
    });
  }

  function rebuildCurtainMotion() {
    return rebuildCurtainMotionCore(stageCurtainMotionDeps());
  }
  mountOptions.setCurtainSync?.(rebuildCurtainMotion);
  const nasStatus = createNasStatus2({
      THREE: three,
      requestFrame: () => {
        (mountOptions.requestRender?.(), wakeBackgroundAnimation());
      },
    }),
    entries = Object.fromEntries(
      GENERIC_DEVICE_KINDS2.map((waterHeaterKindName) => [
        waterHeaterKindName,
        createNasStatus2({
          THREE: three,
          modelType: genericDeviceProfile2(waterHeaterKindName).modelType,
          readState: deviceStatus2,
          requestFrame: () => {
            (mountOptions.requestRender?.(), wakeBackgroundAnimation());
          },
        }),
      ]),
    ),
    waterHeaterStatusByModelType = Object.fromEntries(
      ["storagewaterheater", "gaswaterheater"].map((waterHeaterModelType) => [
        waterHeaterModelType,
        createNasStatus2({
          THREE: three,
          modelType: waterHeaterModelType,
          readState: deviceStatus2,
          requestFrame: () => {
            (mountOptions.requestRender?.(), wakeBackgroundAnimation());
          },
        }),
      ]),
    );
  let nasSyncSnapshot: any;
  const cameraStatus = createCameraStatus2({
    THREE: three,
    requestFrame: () => mountOptions.requestRender?.(),
  });
  let cameraSyncSnapshot: any;
  function syncCameraOverlay() {
    if (startupProgress === 0) return;
    const modelRoot2 = mountOptions.modelRoot,
      sceneRevision2 = mountOptions.sceneRevision,
      isCameraOverlayEnabled = !isAwaitingFloorViewAdjust && !isRangeEditorOpen,
      cameraBrightnessScale = activeModule === "security" && selectedFloorId !== "all" ? 1 : 0.55;
    if (
      cameraSyncSnapshot?.root === modelRoot2 &&
      cameraSyncSnapshot.revision === sceneRevision2 &&
      cameraSyncSnapshot.config === options &&
      cameraSyncSnapshot.states === deviceStates &&
      cameraSyncSnapshot.enabled === isCameraOverlayEnabled &&
      cameraSyncSnapshot.brightness === cameraBrightnessScale
    )
      return;
    cameraSyncSnapshot = {
      root: modelRoot2,
      revision: sceneRevision2,
      config: options,
      states: deviceStates,
      enabled: isCameraOverlayEnabled,
      brightness: cameraBrightnessScale,
    };
    const cameraSceneBindings = (options.security?.cameras || []).map((cameraSceneBinding: any) => {
      const cameraSceneModel = stageModelIndex.item(
        cameraSceneBinding.floorId,
        cameraSceneBinding.modelId,
        "camera",
      );
      return {
        ...cameraSceneBinding,
        width: cameraSceneModel?.width || 0.2,
        height: cameraSceneModel?.height || 0.3,
        depth: cameraSceneModel?.depth || 0.2,
      };
    });
    cameraStatus.sync({
      root: modelRoot2,
      revision: sceneRevision2,
      bindings: cameraSceneBindings,
      states: deviceStates,
      enabled: isCameraOverlayEnabled,
      brightness: cameraBrightnessScale,
    });
  }
  function stageLayersSyncDeps() {
    return ({
      get startupProgress() {
        return startupProgress;
      },
      get isAwaitingFloorViewAdjust() {
        return isAwaitingFloorViewAdjust;
      },
      get isRangeEditorOpen() {
        return isRangeEditorOpen;
      },
      get mountOptions() {
        return mountOptions;
      },
      get selectedFloorId() {
        return selectedFloorId;
      },
      get activeModule() {
        return activeModule;
      },
      get nasSyncSnapshot() {
        return nasSyncSnapshot;
      },
      set nasSyncSnapshot(v) {
        nasSyncSnapshot = v;
      },
      get options() {
        return options;
      },
      get deviceStates() {
        return deviceStates;
      },
      get nasStatus() {
        return nasStatus;
      },
      get collectNasBindings() {
        return collectNasBindings;
      },
      get waterHeaterStatusByModelType() {
        return waterHeaterStatusByModelType;
      },
      get entries() {
        return entries;
      },
      get collectGenericDeviceBindings() {
        return collectGenericDeviceBindings;
      },
      get environmentSyncSnapshot() {
        return environmentSyncSnapshot;
      },
      set environmentSyncSnapshot(v) {
        environmentSyncSnapshot = v;
      },
      get speakerRings() {
        return speakerRings;
      },
      get collectSpeakerBindings() {
        return collectSpeakerBindings;
      },
      get carCharging() {
        return carCharging;
      },
      get airerMotion() {
        return airerMotion;
      },
      get collectCoverBindings() {
        return collectCoverBindings;
      },
      get fanMotion() {
        return fanMotion;
      },
      get isEditing() {
        return isEditing;
      },
      get text() {
        return text;
      },
      get focusedItemId() {
        return focusedItemId;
      },
      get televisionSyncSnapshot() {
        return televisionSyncSnapshot;
      },
      set televisionSyncSnapshot(v) {
        televisionSyncSnapshot = v;
      },
      get televisionScreens() {
        return televisionScreens;
      },
      get collectTelevisionBindings() {
        return collectTelevisionBindings;
      },
      get element() {
        return element;
      },
      get mediaViewportSize() {
        return mediaViewportSize;
      },
      get containerViewportSize() {
        return containerViewportSize;
      },
      set containerViewportSize(v) {
        containerViewportSize = v;
      },
      get mediaScale() {
        return mediaScale;
      },
      set mediaScale(v) {
        mediaScale = v;
      },
      get value() {
        return value;
      },
      set value(v) {
        value = v;
      },
      get configuredModuleKinds2() {
        return configuredModuleKinds2;
      },
      get navigationLayerElement() {
        return navigationLayerElement;
      },
      get floorTabsElement() {
        return floorTabsElement;
      },
      get toolbarElement() {
        return toolbarElement;
      },
      get lightPanelSection() {
        return lightPanelSection;
      },
      get speakerPanel() {
        return speakerPanel;
      },
      get getComputedStyle() {
        return getComputedStyleForDeps;
      },
      get presentationLayerElement() {
        return presentationLayerElement;
      },
      get computePopupPlacement() {
        return computePopupPlacement;
      },
      get presentationUiSignatureCache() {
        return presentationUiSignatureCache;
      },
      set presentationUiSignatureCache(v) {
        presentationUiSignatureCache = v;
      },
      get cameraMotionSnapshot() {
        return cameraMotionSnapshot;
      },
      get computeFocusInset() {
        return computeFocusInset;
      },
      get panelDisplayMode() {
        return panelDisplayMode;
      },
      get focusInset() {
        return focusInset;
      },
      set focusInset(v) {
        focusInset = v;
      },
      get renderMarkerPositions() {
        return renderMarkerPositions;
      },
      get currentModuleBindings() {
        return currentModuleBindings;
      },
      get hasPendingStageRefresh() {
        return hasPendingStageRefresh;
      },
      get hasIdleIconActivity() {
        return hasIdleIconActivity;
      },
      get isIdleIconHidden() {
        return isIdleIconHidden;
      },
      get isUserActive() {
        return isUserActive;
      },
      get isCameraRotating() {
        return isCameraRotating;
      },
      get pageBehavior() {
        return pageBehavior;
      },
      get map() {
        return map;
      },
      get findBindingById() {
        return findBindingById;
      },
      get isOverviewOrAllFloors() {
        return isOverviewOrAllFloors;
      },
      get vacuumWorkingLayerElement() {
        return vacuumWorkingLayerElement;
      },
      get markerLayerElement() {
        return markerLayerElement;
      },
      get restoreFocusWithin() {
        return restoreFocusWithin;
      },
      get canvasElement() {
        return canvasElement;
      },
      get outgoingGhostAnimation() {
        return outgoingGhostAnimation;
      },
      get lastInteractionMs() {
        return lastInteractionMs;
      },
      set lastInteractionMs(v) {
        lastInteractionMs = v;
      },
    });
  }

  function syncNasOverlay() {
    return syncNasOverlayCore(stageLayersSyncDeps());
  }
  function syncEnvironmentLayers() {
    return syncEnvironmentLayersCore(stageLayersSyncDeps());
  }
  function syncLayoutMetrics() {
    return syncLayoutMetricsCore(stageLayersSyncDeps());
  }
  function syncStageVisibility() {
    return syncStageVisibilityCore(stageLayersSyncDeps());
  }
  const televisionScreens = createTelevisionScreens2({
      THREE: three,
      requestFrame: (televisionModelRoot) => {
        (mountOptions.requestRender?.(),
          mountOptions.invalidateReflections?.(televisionModelRoot),
          wakeBackgroundAnimation());
      },
    }),
    airerMotion = createAirerMotion2({
      requestFrame: () => {
        (mountOptions.requestRender?.(), wakeBackgroundAnimation());
      },
    }),
    fanMotion = createFanMotion2({
      requestFrame: () => {
        (mountOptions.requestRender?.(), wakeBackgroundAnimation());
      },
    }),
    carCharging = createCarCharging2({
      requestFrame: () => {
        (mountOptions.requestRender?.(), wakeBackgroundAnimation());
      },
    });
  let hasStartupProgressListener = false;
  const startupEffectsUnsubscribe = mountOptions.onStartupEffectsProgress?.(
    (startupProgressValue: any) => {
      const isStartupBeforeFirstFrame = startupProgress === 0;
      ((startupProgress = startupProgressValue),
        carCharging.setPresentationGain(startupProgressValue),
        (markerLayerElement.style.opacity = vacuumWorkingLayerElement.style.opacity =
          String(startupProgressValue)),
        presentationLayerElement.classList.toggle(
          "i3d-startup-effects-pending",
          startupProgressValue === 0,
        ),
        hasStartupProgressListener &&
          isStartupBeforeFirstFrame &&
          startupProgressValue > 0 &&
          ((lastIdleFrameMs = 0), syncLockMotion(), syncMarkers(), wakeSceneBackground()));
    },
  );
  hasStartupProgressListener = true;
  const speakerRings = createSpeakerRings2({
    requestFrame: () => {
      (mountOptions.requestRender?.(), wakeBackgroundAnimation());
    },
  });
  let televisionSyncSnapshot: any, environmentSyncSnapshot: any;
  let startupDeviceSyncSnapshot: any;
  function syncStartupDeviceLayers() {
    if (startupProgress > 0) return;
    syncNasOverlay();
    const modelRoot4 = mountOptions.modelRoot,
      sceneRevision4 = mountOptions.sceneRevision,
      environmentRevision = mountOptions.environmentRevision ?? sceneRevision4,
      document4 = mountOptions.document;
    (startupDeviceSyncSnapshot?.root === modelRoot4 &&
      startupDeviceSyncSnapshot.revision === sceneRevision4 &&
      startupDeviceSyncSnapshot.environmentRevision === environmentRevision &&
      startupDeviceSyncSnapshot.source === document4 &&
      startupDeviceSyncSnapshot.config === options &&
      startupDeviceSyncSnapshot.states === deviceStates) ||
      (carCharging.sync({
        root: modelRoot4,
        revision: environmentRevision,
        retainedRoots: mountOptions.retainedModelRoots || [],
        bindings: options.devices?.cars || [],
        states: deviceStates,
      }),
      airerMotion.sync({
        root: modelRoot4,
        revision: environmentRevision,
        bindings: collectCoverBindings().filter((airerSyncBinding) => airerSyncBinding.airer),
        states: deviceStates,
        preparing: true,
      }),
      fanMotion.sync({
        root: modelRoot4,
        revision: environmentRevision,
        bindings: options.environment?.fans || [],
        states: deviceStates,
      }),
      (startupDeviceSyncSnapshot = {
        root: modelRoot4,
        revision: sceneRevision4,
        environmentRevision: environmentRevision,
        source: document4,
        config: options,
        states: deviceStates,
      }));
  }
  const environmentScene = createEnvironmentScene2({
    THREE: three,
    prepareMaterials: () => mountOptions.prepareEnvironmentMaterials?.(),
    requestFrame: (environmentModelRoot: any = null) => {
      (mountOptions.requestRender?.(),
        mountOptions.invalidateReflections?.(environmentModelRoot),
        wakeBackgroundAnimation());
    },
  });
  (mountOptions.setTelevisionSync?.(syncEnvironmentLayers),
    mountOptions.setStartupDeviceSync?.(syncStartupDeviceLayers),
    mountOptions.setEnvironmentScene?.(environmentScene));


  const environmentAirflowOptions = {
    THREE: three,
    camera: mountOptions.camera,
    requestFrame: () => {
      (mountOptions.requestRender?.(), wakeBackgroundAnimation());
    },
  };
  const environmentAirflow = createEnvironmentAirflow2(environmentAirflowOptions);
  mountOptions.setEnvironmentAirflow?.(environmentAirflow);
  const viewHelpElement = createStageElement(
    "p",
    "i3d-view-help",
    "拖动旋转 · 右键平移 · 滚轮缩放。调整完成后固定视角。",
  );
  ((viewHelpElement.hidden = true),
    navigationLayerElement.append(moduleTabsElement),
    presentationLayerElement.append(
      markerLayerElement,
      vacuumWorkingLayerElement,
      navigationLayerElement,
      floorTabsElement,
      moduleEmptyElement,
      lightPanelSection,
      viewHelpElement,
    ),
    navigationLayerElement.append(toolbarElement),
    element.append(focusVignetteElement, presentationLayerElement));
  const screenOutlines = createScreenOutlines2({
      THREE: three,
      container: presentationLayerElement,

      camera: mountOptions.camera,
      getCamera: () => mountOptions.camera,
      getObjectCamera: (screenOutlineObject: any) =>
        mountOptions.presentationCamera?.(screenOutlineObject) || mountOptions.camera,
    }),
    editorSelectionOutlines = createScreenOutlines2({
      THREE: three,
      container: presentationLayerElement,
      camera: mountOptions.camera,
      getCamera: () => mountOptions.camera,
      getObjectCamera: (editorOutlineObject: any) =>
        mountOptions.presentationCamera?.(editorOutlineObject) || mountOptions.camera,
      color: "#ffbb45",
      pulse: false,
      editorSelection: true,
    }),
    editorSelectionElement = createStageElement("div", "i3d-editor-selection");
  (editorSelectionElement.setAttribute("role", "status"),
    (editorSelectionElement.hidden = true),
    presentationLayerElement.append(editorSelectionElement));
  function collectCoverBindings() {
    return [...(options.environment?.curtains || []), ...(options.environment?.airers || [])].map(
      (coverSourceEntry) => {
        const isAirer = (options.environment?.airers || []).includes(coverSourceEntry),
          coverModel = stageModelIndex.item(
            coverSourceEntry.floorId,
            coverSourceEntry.modelId,
            isAirer ? "airer" : "curtain",
          );
        return {
          ...coverSourceEntry,
          airer: isAirer,
          deviceKind: "cover",
          x: Number.isFinite(coverSourceEntry.x) ? coverSourceEntry.x : (coverModel?.x ?? 0),
          y: Number.isFinite(coverSourceEntry.y) ? coverSourceEntry.y : (coverModel?.y ?? 0),
          height: Number.isFinite(coverSourceEntry.height)
            ? coverSourceEntry.height
            : coverModel
              ? (Number(coverModel.elevation) || 0) + (Number(coverModel.height) || 2.4) / 2
              : 0,
          ...coverGeometryOverrides(coverModel, coverSourceEntry),
          ...(isAirer
            ? {
                coverKind: "airer",
                unboundPosition: coverModel?.airerPreview ?? 55,
                height:
                  coverSourceEntry.height ??
                  (Number(coverModel?.elevation) || 2.7) -
                    (Number(coverModel?.airerExtension) || 1.2) / 2,
              }
            : {}),
          modelAvailable: !!coverModel,
          icon: coverSourceEntry.icon || (isAirer ? "mdi:hanger" : "mdi:curtains"),
        };
      },
    );
  }
  function buildCurtainGroups() {
    const sourceCoverBindings = collectCoverBindings();
    return validCurtainGroups2(options.environment)
      .map((curtainGroupSource: CurtainGroupLike & {
        x?: number;
        y?: number;
        height?: number;
        clickAction?: string;
      }) => {
        const filter = (curtainGroupSource.memberIds || [])
            .map((curtainGroupMemberId) =>
              sourceCoverBindings.find(
                (curtainGroupMember) => curtainGroupMember.id === curtainGroupMemberId,
              ),
            )
            .filter(Boolean),
          representativeMember =
            filter.find((groupMember) => groupMember.modelAvailable) || filter[0];
        return representativeMember
          ? {
              ...curtainGroupSource,
              id: curtainGroupEntryId2(curtainGroupSource),
              deviceKind: "cover",
              entityId: "",
              modelId: representativeMember.modelId,
              memberItems: filter,
              groupId: curtainGroupSource.id,
              x: Number.isFinite(curtainGroupSource.x)
                ? curtainGroupSource.x
                : representativeMember.x,
              y: Number.isFinite(curtainGroupSource.y)
                ? curtainGroupSource.y
                : representativeMember.y,
              height: Number.isFinite(curtainGroupSource.height)
                ? curtainGroupSource.height
                : representativeMember.height,
              modelAvailable: true,
              isCurtainGroup: true,
              icon: "",
              clickAction: curtainGroupSource.clickAction || "focus",
            }
          : null;
      })
      .filter(Boolean);
  }
  function collectGroupedCovers() {
    const groupMemberIdSet = new Set(
      validCurtainGroups2(options.environment).flatMap(
        (groupMemberIdList) => groupMemberIdList.memberIds,
      ),
    );
    return [
      ...buildCurtainGroups(),
      ...collectCoverBindings().filter(
        (groupedCoverEntry) => !groupMemberIdSet.has(groupedCoverEntry.id),
      ),
    ];
  }
  function computeGroupBounds(boundsGroup: any) {
    const memberPoseList = boundsGroup.memberItems
      .filter((poseMember: any) => poseMember.modelAvailable)
      .map((poseMemberModel: any) =>
        mountOptions.environmentModelPose?.(poseMemberModel.floorId, poseMemberModel.modelId),
      )
      .filter(Boolean);
    if (!memberPoseList.length) return null;
    const boundingBox = new three.Box3();
    for (const memberPose of memberPoseList) {
      const array = new three.Vector3().fromArray(memberPose.center),
        array2 = new three.Vector3().fromArray(memberPose.size || [1, 1, 1]);
      boundingBox.union(new three.Box3().setFromCenterAndSize(array, array2));
    }
    return {
      center: boundingBox.getCenter(new three.Vector3()).toArray(),
      size: boundingBox.getSize(new three.Vector3()).toArray(),
      forward: memberPoseList[0].forward,
    };
  }
  function collectGenericDeviceBindings(collectDeviceKind: any) {
    const deviceProfile = genericDeviceProfile2(collectDeviceKind);
    return deviceProfile
      ? (options.devices?.[deviceProfile.collection] || []).map((profileDeviceEntry: any) => {
          const deviceModel = stageModelIndex.item(
            profileDeviceEntry.floorId,
            profileDeviceEntry.modelId,
            deviceProfile.modelTypes || [deviceProfile.modelType],
          );
          return {
            ...profileDeviceEntry,
            clickAction: profileDeviceEntry.clickAction || "focus-panel",
            deviceKind: collectDeviceKind,
            deviceLabel: deviceProfile.label,
            x:
              collectDeviceKind === "smallcar"
                ? (deviceModel?.x ?? 0) + (profileDeviceEntry.x ?? 0)
                : Number.isFinite(profileDeviceEntry.x)
                  ? profileDeviceEntry.x
                  : (deviceModel?.x ?? 0),
            y:
              collectDeviceKind === "smallcar"
                ? (deviceModel?.y ?? 0) + (profileDeviceEntry.y ?? 0)
                : Number.isFinite(profileDeviceEntry.y)
                  ? profileDeviceEntry.y
                  : (deviceModel?.y ?? 0),
            height: Number.isFinite(profileDeviceEntry.height)
              ? profileDeviceEntry.height
              : (Number(deviceModel?.elevation) || 0) +
                (Number(deviceModel?.height) || deviceProfile.height) *
                  (collectDeviceKind === "smallcar" ? 1 : 0.5) +
                (collectDeviceKind === "smallcar" ? 0.25 : 0),
            modelAvailable: !!deviceModel,
            icon: profileDeviceEntry.icon || deviceProfile.icon,
          };
        })
      : [];
  }
  function collectNasBindings() {
    return (options.devices?.nas || []).map((nasSourceEntry: any) => {
      const nasModel = stageModelIndex.item(
        nasSourceEntry.floorId,
        nasSourceEntry.modelId,
        "nas",
      );
      return {
        ...nasSourceEntry,
        clickAction: nasSourceEntry.clickAction || "focus",
        deviceKind: "nas",
        x: Number.isFinite(nasSourceEntry.x) ? nasSourceEntry.x : (nasModel?.x ?? 0),
        y: Number.isFinite(nasSourceEntry.y) ? nasSourceEntry.y : (nasModel?.y ?? 0),
        height: Number.isFinite(nasSourceEntry.height)
          ? nasSourceEntry.height
          : (Number(nasModel?.elevation) || 0) + (Number(nasModel?.height) || 0.34) / 2,
        modelAvailable: !!nasModel,
        icon: nasSourceEntry.icon || "mdi:nas",
      };
    });
  }
  const followToggleButton = createStageElement("button", "", "跟随漫游");
  ((followToggleButton.type = "button"),
    (followToggleButton.hidden = true),
    (followToggleButton.title = "以鸟瞰视角跟随扫地机"),
    toolbarElement.append(followToggleButton));
  function stopVacuumFollow(shouldRestoreCamera = true) {
    if (!followVacuumId) return;
    const returnCameraSnapshot = followReturnCamera;
    ((followVacuumId = ""),
      (followReturnCamera = null),
      (followCameraPose = null),
      vacuumFollowCamera.reset(),
      postHostMessage({
        type: "vacuum-follow-state",
        active: false,
      }),
      (followToggleButton.textContent = "跟随漫游"),
      followToggleButton.setAttribute("aria-pressed", "false"),
      mountOptions.endCameraMotion(),
      shouldRestoreCamera &&
        returnCameraSnapshot &&
        startCameraMotion(
          returnCameraSnapshot,
          false,
          false,
          () => mountOptions.restoreCamera(returnCameraSnapshot),
          "follow-return",
        ),
      syncFocusHidden(),
      syncCameraInteraction(),
      syncAvailability());
  }
  followToggleButton.addEventListener("click", () => {
    if (followVacuumId) {
      stopVacuumFollow();
      return;
    }
    if (mountOptions.floorTransitionActive || cameraMotionSnapshot?.owner === "floor") return;
    const followableVacuums = (options.devices?.vacuums || []).filter(
        (followableVacuum: any) =>
          matchesSelectedFloor(followableVacuum) && vacuumMotion.hasTracking(followableVacuum.id),
      ),
      followVacuum =
        followableVacuums.find(
          (followCandidateVacuum: any) => "vacuum:" + followCandidateVacuum.id === focusedItemId,
        ) ||
        followableVacuums.find(
          (activeFollowVacuum: any) =>
            vacuumStatusPresentation2(activeFollowVacuum, deviceStates).active,
        ) ||
        followableVacuums[0];
    if (!followVacuum) return;
    const structuredClone2 = structuredClone(mountOptions.cameraState(true));
    (postHostMessage({
      type: "vacuum-follow-state",
      active: true,
    }),
      postHostMessage({
        type: "vacuum-popup-close",
      }),
      exitFocusMode({
        immediate: true,
      }),
      (cameraMotionSnapshot = null),
      mountOptions.endCameraMotion(),
      (followReturnCamera = structuredClone2),
      (followVacuumId = followVacuum.id),
      (followCameraPose = structuredClone(
        followVacuum.followCamera ||
          vacuumBirdCamera2(
            options.camera || structuredClone2,
            mountOptions.environmentModelPose(followVacuum.floorId, followVacuum.modelId)?.center ||
              structuredClone2.target,
          ),
      )),
      mountOptions.setFocusViewport(0),
      mountOptions.beginCameraMotion(followCameraPose.mode),
      (followToggleButton.textContent = "退出跟随"),
      followToggleButton.setAttribute("aria-pressed", "true"),
      syncFocusHidden(),
      syncCameraInteraction(),
      syncAvailability(),
      wakeSceneBackground());
  });
  const vacuumFollowCamera = createVacuumFollowCamera2(three);
  function revealFollowCamera() {
    if (!followVacuumId) return;
    const worldPosition = vacuumMotion.worldPosition(followVacuumId),
      followVacuumBinding = (options.devices?.vacuums || []).find(
        (followVacuumMatch: any) => followVacuumMatch.id === followVacuumId,
      );
    if (!worldPosition || !followVacuumBinding) {
      stopVacuumFollow();
      return;
    }
    const vacuumCenter = mountOptions.environmentModelPose(
        followVacuumBinding.floorId,
        followVacuumBinding.modelId,
      )?.center,
      add = (vacuumCenter ? new three.Vector3(...vacuumCenter) : worldPosition.clone()).add(
        new three.Vector3(0, 0.05, 0),
      ),
      followPose = vacuumFollowPose2(followCameraPose, add.toArray()),
      followTargetVector = new three.Vector3(...followPose.position);
    (vacuumFollowCamera.reveal(mountOptions, followVacuumBinding, add, followTargetVector),
      mountOptions.setFocusViewport(0),
      mountOptions.applyCameraPose(followPose));
  }
  const isPanelDeviceKind = (panelDeviceEntry: any) =>
      ["lock", "nas", "television", "speaker", "vacuum", "presence", "camera"].includes(
        panelDeviceEntry?.deviceKind,
      ) || isGenericDeviceKind2(panelDeviceEntry?.deviceKind),
    vacuumMaps = createVacuumMaps2(mountOptions, () => {
      (mountOptions.requestRender?.(), wakeBackgroundAnimation());
    }),
    vacuumMotion = createVacuumMotion2(mountOptions, wakeSceneBackground),
    presenceScene = createPresenceScene2(mountOptions, wakeSceneBackground, undefined),
    presenceWaves = createPresenceWaves2(mountOptions, wakeBackgroundAnimation);
  let presenceSyncSignature: any = null,
    isPresencePressed = false,
    isPresenceEditing = false;
  const presenceHitLayerElement = createStageElement("div", "i3d-presence-hit-layer");
  (presenceHitLayerElement.setAttribute("aria-hidden", "true"),
    presentationLayerElement.append(presenceHitLayerElement));
  const presenceHitBoxesByRectId = new Map();
  function layoutPresenceHitBoxes() {
    if ((!isEditing || !isPresenceEditing) && !presenceHitBoxesByRectId.size) return;
    const hitRects =
        isEditing && isPresenceEditing
          ? presenceScene.hitRects(
              mountOptions.camera,
              canvasElement,
              selectedSecurityKind === "presence" ? options.security?.presenceSensors || [] : [],
              mediaViewportSize,
            )
          : [],
      activeHitRectIdSet = new Set(hitRects.map((hitRectEntry) => hitRectEntry.id)),
      boundingClientRect = element.getBoundingClientRect(),
      presenceHitScaleX = mediaViewportSize
        ? boundingClientRect.width / mediaViewportSize.width
        : 1,
      presenceHitScaleY = mediaViewportSize
        ? boundingClientRect.height / mediaViewportSize.height
        : 1;
    if (presenceHitScaleX > 0 && presenceHitScaleY > 0) {
      for (const [staleHitRectId, staleHitBoxElement] of presenceHitBoxesByRectId)
        activeHitRectIdSet.has(staleHitRectId) ||
          (staleHitBoxElement.remove(), presenceHitBoxesByRectId.delete(staleHitRectId));
      for (const layoutHitRect of hitRects) {
        let hitBoxElement = presenceHitBoxesByRectId.get(layoutHitRect.id);
        (hitBoxElement ||
          ((hitBoxElement = createStageElement("div", "i3d-presence-hit-box")),
          presenceHitBoxesByRectId.set(layoutHitRect.id, hitBoxElement),
          presenceHitLayerElement.append(hitBoxElement)),
          Object.assign(hitBoxElement.style, {
            left:
              (layoutHitRect.left - boundingClientRect.left) / presenceHitScaleX -
              layoutHitRect.padding +
              "px",
            top:
              (layoutHitRect.top - boundingClientRect.top) / presenceHitScaleY -
              layoutHitRect.padding +
              "px",
            width: layoutHitRect.width / presenceHitScaleX + layoutHitRect.padding * 2 + "px",
            height: layoutHitRect.height / presenceHitScaleY + layoutHitRect.padding * 2 + "px",
            borderRadius: layoutHitRect.padding + "px",
          }));
      }
    }
  }
  function syncPresenceScene() {
    if (startupProgress === 0) return;
    const isPresenceVisualsEnabled =
        isStagePresented &&
        (!isNavigationVisible || (isEditing && activeModule === "security")) &&
        (!isEditing || activeModule === "security") &&
        !isAwaitingFloorViewAdjust &&
        !isRangeEditorOpen &&
        isPresentedVisible &&
        !document.hidden &&
        !mountOptions.floorTransitionActive &&
        cameraMotionSnapshot?.owner !== "floor",
      presenceBindingList =
        isEditing && activeModule !== "security" && selectedSecurityKind !== "presence"
          ? []
          : options.security?.presenceSensors || [],
      presenceSyncSignatureParts = [
        options,
        deviceStates,
        mountOptions.sceneRevision,
        selectedFloorId,
        isPresenceVisualsEnabled,
        isPresencePressed,
        activeModule,
        selectedSecurityKind,
      ];
    (presenceSyncSignature &&
      presenceSyncSignatureParts.every(
        (presenceSignatureValue, presenceSignatureIndex) =>
          presenceSignatureValue === presenceSyncSignature[presenceSignatureIndex],
      )) ||
      ((presenceSyncSignature = presenceSyncSignatureParts),
      presenceScene.sync(
        presenceBindingList,
        deviceStates,
        isPresenceVisualsEnabled,
        selectedFloorId,
        isEditing,
        isPresencePressed,
        activeModule,
      ));
  }
  let vacuumSyncSignature: any = null;
  function syncVacuumMotion() {
    if (startupProgress === 0) return;
    const isVacuumSyncEnabled =
        isStagePresented &&
        !isEditing &&
        !isAwaitingFloorViewAdjust &&
        isPresentedVisible &&
        !document.hidden,
      vacuumSyncSignatureParts = [
        options,
        deviceStates,
        mountOptions.sceneRevision,
        isVacuumSyncEnabled,
      ];
    (vacuumSyncSignature &&
      vacuumSyncSignatureParts.every(
        (vacuumSignatureValue, vacuumSignatureIndex) =>
          vacuumSignatureValue === vacuumSyncSignature[vacuumSignatureIndex],
      )) ||
      ((vacuumSyncSignature = vacuumSyncSignatureParts),
      vacuumMotion.sync(
        vacuumBindingsForMap2(options.devices?.vacuums || [], deviceStates),
        deviceStates,
        isVacuumSyncEnabled,
      ));
  }
  const vacuumOverlayByKey = new Map();
  let vacuumMapSignature: any = null;
  function syncVacuumMap() {
    const isVacuumMapVisible =
        activeModule === "vacuum" &&
        !isAwaitingFloorViewAdjust &&
        !isRangeEditorOpen &&
        !mountOptions.floorTransitionActive &&
        cameraMotionSnapshot?.owner !== "floor" &&
        isPresentedVisible &&
        !document.hidden,
      vacuumMapSignatureParts = [
        options,
        deviceStates,
        mountOptions.sceneRevision,
        selectedFloorId,
        isVacuumMapVisible,
      ];
    (vacuumMapSignature &&
      vacuumMapSignatureParts.every(
        (vacuumMapSignatureValue, vacuumMapSignatureIndex) =>
          vacuumMapSignatureValue === vacuumMapSignature[vacuumMapSignatureIndex],
      )) ||
      ((vacuumMapSignature = vacuumMapSignatureParts),
      vacuumMaps.sync(
        vacuumBindingsForMap2(collectVacuumBindings(), deviceStates),
        isVacuumMapVisible,
        selectedFloorId,
        deviceStates,
      ));
  }
  document.addEventListener("visibilitychange", syncVacuumMap);
  function collectVacuumBindings() {
    return (options.devices?.vacuums || []).map((vacuumSourceEntry: any) => {
      const vacuumModel = stageModelIndex.item(
        vacuumSourceEntry.floorId,
        vacuumSourceEntry.modelId,
        "robotvacuum",
      ),
        vacuumMapOffset = (!isEditing && vacuumMotion.offset(vacuumSourceEntry.id)) || {
          x: 0,
          y: 0,
        };
      return {
        ...vacuumSourceEntry,
        deviceKind: "vacuum",
        clickAction: vacuumSourceEntry.clickAction || "focus-panel",
        x:
          (Number.isFinite(vacuumSourceEntry.x) ? vacuumSourceEntry.x : (vacuumModel?.x ?? 0)) +
          vacuumMapOffset.x,
        y:
          (Number.isFinite(vacuumSourceEntry.y) ? vacuumSourceEntry.y : (vacuumModel?.y ?? 0)) +
          vacuumMapOffset.y,
        height: Number.isFinite(vacuumSourceEntry.height)
          ? vacuumSourceEntry.height
          : (Number(vacuumModel?.elevation) || 0) + (Number(vacuumModel?.height) || 0.85) + 0.25,
        modelAvailable: !!vacuumModel,
        icon: vacuumSourceEntry.icon || "mdi:robot-vacuum",
      };
    });
  }
  function collectVacuumShortcuts() {
    return collectVacuumBindings()
      .filter(
        (vacuumShortcutEntry: any) =>
          vacuumShortcutEntry.visible !== false &&
          (isEditing || vacuumShortcutEntry.entityId) &&
          (isEditing ||
            (!vacuumStatusPresentation2(vacuumShortcutEntry, deviceStates).active &&
              !vacuumStatusPresentation2(vacuumShortcutEntry, deviceStates).paused)),
      )
      .flatMap((vacuumShortcutSource: any) =>
        (vacuumShortcutSource.shortcuts || [])
          .filter((vacuumShortcut: any) => isEditing || vacuumShortcut.entityId)
          .map((vacuumShortcutRoom: any) => ({
            ...vacuumShortcutRoom,
            id: "vacuum-room:" + vacuumShortcutSource.id + ":" + vacuumShortcutRoom.id,
            vacuumId: vacuumShortcutSource.id,
            shortcutId: vacuumShortcutRoom.id,
            floorId: vacuumShortcutSource.floorId,
            height: vacuumShortcutRoom.height ?? 0.08,
            deviceKind: "vacuum-room",
            modelAvailable: vacuumShortcutSource.modelAvailable,
            icon: vacuumShortcutRoom.icon || "mdi:broom",
            size: vacuumShortcutRoom.size ?? defaultButtonSize,
            iconSize: vacuumShortcutRoom.iconSize ?? resolveButtonIconSize(defaultButtonSize),
            hitSize: vacuumShortcutRoom.hitSize ?? defaultButtonSize,
          })),
      );
  }
  function handleMarkerActivate(markerEntry: any) {
    if (
      !isEditing &&
      isControlReady &&
      markerEntry.deviceKind === "camera" &&
      markerEntry.entityId &&
      focusedItemId === markerEntry.id &&
      panelDisplayMode !== "edit"
    ) {
      postHostMessage({
        type: "camera-popup",
        id: markerEntry.id,
      });
      return;
    }
    !followVacuumId &&
      !isEditing &&
      isControlReady &&
      markerEntry.deviceKind === "vacuum" &&
      markerEntry.entityId &&
      (panelDisplayMode === "panel" || markerEntry.clickAction !== "focus") &&
      focusedItemId === markerEntry.id &&
      postHostMessage({
        type: "vacuum-popup",
        id: markerEntry.id,
      });
  }
  function collectSpeakerBindings() {
    return (options.devices?.speakers || []).map((speakerSourceEntry: any) => {
      const speakerModel = stageModelIndex.item(
        speakerSourceEntry.floorId,
        speakerSourceEntry.modelId,
        "speaker",
      );
      return {
        ...speakerSourceEntry,
        clickAction: speakerSourceEntry.clickAction || "focus-panel",
        deviceKind: "speaker",
        x: Number.isFinite(speakerSourceEntry.x) ? speakerSourceEntry.x : (speakerModel?.x ?? 0),
        y: Number.isFinite(speakerSourceEntry.y) ? speakerSourceEntry.y : (speakerModel?.y ?? 0),
        height: Number.isFinite(speakerSourceEntry.height)
          ? speakerSourceEntry.height
          : (Number(speakerModel?.elevation) || 0) + (Number(speakerModel?.height) || 0.2336) / 2,
        modelAvailable: !!speakerModel,
        icon: speakerSourceEntry.icon || "mdi:speaker",
      };
    });
  }
  function collectTelevisionBindings() {
    return (options.devices?.televisions || []).map((televisionSourceEntry: any) => {
      const televisionModel = stageModelIndex.item(
        televisionSourceEntry.floorId,
        televisionSourceEntry.modelId,
        "tv",
      );
      return {
        ...televisionSourceEntry,
        clickAction: televisionSourceEntry.clickAction || "focus-panel",
        deviceKind: "television",
        x: Number.isFinite(televisionSourceEntry.x)
          ? televisionSourceEntry.x
          : (televisionModel?.x ?? 0),
        y: Number.isFinite(televisionSourceEntry.y)
          ? televisionSourceEntry.y
          : (televisionModel?.y ?? 0),
        height: Number.isFinite(televisionSourceEntry.height)
          ? televisionSourceEntry.height
          : (Number(televisionModel?.elevation) || 0) +
            (Number(televisionModel?.height) || 0.92) * 0.62,
        modelAvailable: !!televisionModel,
        icon: televisionSourceEntry.icon || "mdi:television",
      };
    });
  }
  function collectPreviewCovers() {
    const boundCoverKeySet = new Set(
      collectCoverBindings().map((boundCoverBinding) =>
        JSON.stringify([boundCoverBinding.floorId, boundCoverBinding.modelId]),
      ),
    );
    return mountOptions.document.floors.flatMap((previewFloor: any) =>
      (previewFloor.scene?.items || [])
        .filter(
          (previewSceneItem: any) =>
            previewSceneItem.type === "curtain" &&
            !boundCoverKeySet.has(JSON.stringify([previewFloor.id, previewSceneItem.id])),
        )
        .map((previewCurtainItem: any) => ({
          id: "preview-cover:" + JSON.stringify([previewFloor.id, previewCurtainItem.id]),
          floorId: previewFloor.id,
          modelId: previewCurtainItem.id,
          entityId: "",
          deviceKind: "cover",
          ...coverGeometryOverrides(previewCurtainItem),
          modelAvailable: true,
          previewOnly: true,
        })),
    );
  }
  const currentModuleBindings = () =>
    (activeModule === "security"
      ? collectSecurityBindings()
      : activeModule === "light"
        ? options.lights || []
        : [
            ...collectModuleBindings(),
            ...(activeModule === "vacuum" && !isEditing ? collectVacuumShortcuts() : []),
          ]
    ).filter(matchesSelectedFloor);
  function syncFloorTabs() {
    ((navigationLayerElement.hidden =
      !isNavigationVisible && (isEditing || isAwaitingFloorViewAdjust || isRangeEditorOpen)),
      (floorTabsElement.hidden =
        isEditing ||
        isAwaitingFloorViewAdjust ||
        isRangeEditorOpen ||
        mountOptions.document.floors.length < 2));
    const floorChoices = floorNavigationChoices2(
        mountOptions.document.floors,
        options.floorNumbers,
      ),
      outsideFloorId =
        selectedFloorId === "all"
          ? floorChoices.filter(([floorChoiceId]) => floorChoiceId !== "all").at(-1)?.[0] || ""
          : null;
    (mountOptions.groundReflections?.setOutsideFloor?.(outsideFloorId),
      mountOptions.groundReflections?.setVisibleFloor?.(null));
    const stringify = JSON.stringify(floorChoices);
    if (stringify !== floorTabsSignature) {
      ((floorTabsSignature = stringify), floorTabsElement.replaceChildren());
      for (const [floorChoiceKey, floorChoiceLabel, floorChoiceTitle] of floorChoices) {
        const floorTabButton = createStageElement("button", "", floorChoiceLabel);
        ((floorTabButton.type = "button"),
          (floorTabButton.dataset.floor = floorChoiceKey),
          (floorTabButton.title = floorChoiceTitle),
          floorTabButton.setAttribute("aria-label", floorChoiceTitle),

          floorTabButton.addEventListener("click", () => {
            if (floorTabsElement.dataset.dragged === "true") {
              floorTabsElement.dataset.dragged = "";
              return;
            }
            selectFloor(floorChoiceKey);
          }),
          floorTabsElement.append(floorTabButton));
      }
    }
    for (const floorTabElement of floorTabsElement.children)
      floorTabElement.setAttribute(
        "aria-pressed",
        String(floorTabElement.dataset.floor === selectedFloorId),
      );
  }
  function stageRefreshDeps() {
    return ({
      get isEditing() {
        return isEditing;
      },
      get isAwaitingFloorViewAdjust() {
        return isAwaitingFloorViewAdjust;
      },
      get isRangeEditorOpen() {
        return isRangeEditorOpen;
      },
      set isRangeEditorOpen(v) {
        isRangeEditorOpen = v;
      },
      get isCameraMoving() {
        return isCameraMoving;
      },
      set isCameraMoving(v) {
        isCameraMoving = v;
      },
      get selectedFloorId() {
        return selectedFloorId;
      },
      set selectedFloorId(v) {
        selectedFloorId = v;
      },
      get mountOptions() {
        return mountOptions;
      },
      get stopVacuumFollow() {
        return stopVacuumFollow;
      },
      get exitFocusMode() {
        return exitFocusMode;
      },
      get cancelMarkerDrag() {
        return cancelMarkerDrag;
      },
      get pendingFloorId() {
        return pendingFloorId;
      },
      set pendingFloorId(v) {
        pendingFloorId = v;
      },
      get runModuleSwitchAnimation() {
        return runModuleSwitchAnimation;
      },
      get syncLockMotion() {
        return syncLockMotion;
      },
      get transformFloorCamera() {
        return transformFloorCamera;
      },
      get baseStageConfig() {
        return baseStageConfig;
      },
      get activeCameraPose() {
        return activeCameraPose;
      },
      set activeCameraPose(v) {
        activeCameraPose = v;
      },
      get options() {
        return options;
      },
      set options(v) {
        options = v;
      },
      get buildFloorCameraConfig() {
        return buildFloorCameraConfig;
      },
      get activeModule() {
        return activeModule;
      },
      set activeModule(v) {
        activeModule = v;
      },
      get pendingModule() {
        return pendingModule;
      },
      set pendingModule(v) {
        pendingModule = v;
      },
      get syncNasOverlay() {
        return syncNasOverlay;
      },
      get startCameraMotion() {
        return startCameraMotion;
      },
      get applyLightStates() {
        return applyLightStates;
      },
      get syncVacuumMap() {
        return syncVacuumMap;
      },
      get syncStageVisibility() {
        return syncStageVisibility;
      },
      get sceneCacheByKey() {
        return sceneCacheByKey;
      },
      get syncMarkers() {
        return syncMarkers;
      },
      get syncPanelChrome() {
        return syncPanelChrome;
      },
      get syncAvailability() {
        return syncAvailability;
      },
      get canEditLightRange() {
        return canEditLightRange;
      },
      get isStagePresented() {
        return isStagePresented;
      },
      get isRangeEditorSuppressingClose() {
        return isRangeEditorSuppressingClose;
      },
      set isRangeEditorSuppressingClose(v) {
        isRangeEditorSuppressingClose = v;
      },
      get syncCameraInteraction() {
        return syncCameraInteraction;
      },
      get presentationLayerElement() {
        return presentationLayerElement;
      },
      get focusVignetteElement() {
        return focusVignetteElement;
      },
      get rangeEditorHandle() {
        return rangeEditorHandle;
      },
      set rangeEditorHandle(v) {
        rangeEditorHandle = v;
      },
      get isRangeEditorOnly() {
        return isRangeEditorOnly;
      },
      get wakeSceneBackground() {
        return wakeSceneBackground;
      },
      get renderMarkerPositions() {
        return renderMarkerPositions;
      },
      get updateEditorSelection() {
        return updateEditorSelection;
      },
      get configureIdleBehaviors() {
        return configureIdleBehaviors;
      },
      get syncPresenceScene() {
        return syncPresenceScene;
      },
      get presenceWaves() {
        return presenceWaves;
      },
      get text() {
        return text;
      },
      get stageModelIndex() {
        return stageModelIndex;
      },
      get deviceStates() {
        return deviceStates;
      },
      get startupProgress() {
        return startupProgress;
      },
      get focusedItemId() {
        return focusedItemId;
      },
      get panelDisplayMode() {
        return panelDisplayMode;
      },
      get cameraMotionSnapshot() {
        return cameraMotionSnapshot;
      },
      get carCharging() {
        return carCharging;
      },
      get environmentScene() {
        return environmentScene;
      },
      get rebuildCurtainMotion() {
        return rebuildCurtainMotion;
      },
      get syncCameraOverlay() {
        return syncCameraOverlay;
      },
      get syncEnvironmentLayers() {
        return syncEnvironmentLayers;
      },
      get syncVacuumMotion() {
        return syncVacuumMotion;
      },
      get collectModuleBindings() {
        return collectModuleBindings;
      },
      get matchesSelectedFloor() {
        return matchesSelectedFloor;
      },
      get collectPreviewCovers() {
        return collectPreviewCovers;
      },
      get collectClimateBindings() {
        return collectClimateBindings;
      },
      get collectGroupedCovers() {
        return collectGroupedCovers;
      },
      get collectNasBindings() {
        return collectNasBindings;
      },
      get collectSpeakerBindings() {
        return collectSpeakerBindings;
      },
      get collectTelevisionBindings() {
        return collectTelevisionBindings;
      },
      get collectGenericDeviceBindings() {
        return collectGenericDeviceBindings;
      },
      get collectVacuumBindings() {
        return collectVacuumBindings;
      },
      get lockBindings() {
        return lockBindings;
      },
      get securityCameraBindings() {
        return securityCameraBindings;
      },
      get presenceBindings() {
        return presenceBindings;
      },
      get screenOutlines() {
        return screenOutlines;
      },
      get environmentAirflow() {
        return environmentAirflow;
      },
      get syncFloorTabs() {
        return syncFloorTabs;
      },
      get navigationEditing() {
        return navigationEditing;
      },
      get isNavigationVisible() {
        return isNavigationVisible;
      },
      get moduleTabsElement() {
        return moduleTabsElement;
      },
      get floorTabsElement() {
        return floorTabsElement;
      },
      get toggleModuleTabs() {
        return toggleModuleTabs;
      },
      get configuredModuleKinds2() {
        return configuredModuleKinds2;
      },
      get moduleTabsByKind() {
        return moduleTabsByKind;
      },
      get restoreFocusWithin() {
        return restoreFocusWithin;
      },
      get moduleEmptyElement() {
        return moduleEmptyElement;
      },
      get applyDefaultCamera() {
        return applyDefaultCamera;
      },
      get hasIdleIconActivity() {
        return hasIdleIconActivity;
      },
      set hasIdleIconActivity(v) {
        hasIdleIconActivity = v;
      },
      get isCameraRotating() {
        return isCameraRotating;
      },
      get pageBehavior() {
        return pageBehavior;
      },
      get isUserActive() {
        return isUserActive;
      },
      get idleRotationControl() {
        return idleRotationControl;
      },
      get isControlBusy() {
        return isControlBusy;
      },
      get applyRegionLightingPreset() {
        return applyRegionLightingPreset;
      },
      get lastRenderSignature() {
        return lastRenderSignature;
      },
      set lastRenderSignature(v) {
        lastRenderSignature = v;
      },
      get pendingEditorAction() {
        return pendingEditorAction;
      },
      set pendingEditorAction(v) {
        pendingEditorAction = v;
      },
      get handleHostMessage() {
        return handleHostMessage;
      },
    });
  }

  function selectFloor(targetFloorId: any) {
    return selectFloorCore(stageRefreshDeps(), targetFloorId);
  }
  function openRangeEditor(rangeEditorRequestId: any) {
    return openRangeEditorCore(stageRefreshDeps(), rangeEditorRequestId);
  }
  function refreshStageUi() {
    return refreshStageUiCore(stageRefreshDeps());
  }
  function adoptSceneUpdate(sceneUpdateInput: any) {
    return adoptSceneUpdateCore(stageRefreshDeps(), sceneUpdateInput);
  }
  function syncLockMotion() {
    const lockMotionPlan = buildLockMotionInput();
    mountOptions.setLockMoving?.(lockMotion.sync(lockMotionPlan.bindings, lockMotionPlan.states));
  }
  const lockBindings = () =>
      (options.security?.locks || [])
        .map((lockSourceEntry: any) => {
          const lockFloor = mountOptions.document.floors.find(
              (lockFloorModel: any) => lockFloorModel.id === lockSourceEntry.floorId,
            ),
            lockDoorModel =
              lockFloor &&
              doorModels2(lockFloor).find(
                (lockDoor: any) => lockDoor.modelId === lockSourceEntry.modelId,
              );
          return {
            ...lockSourceEntry,
            hinge: lockSourceEntry.hinge || lockDoorModel?.hinge || "left",
            id: "lock:" + lockSourceEntry.id,
            deviceKind: "lock",
            clickAction: "focus-panel",
            icon: lockSourceEntry.icon || "mdi:door-closed",
            modelAvailable: !!lockDoorModel,
            x: Number.isFinite(lockSourceEntry.x) ? lockSourceEntry.x : (lockDoorModel?.x ?? 0),
            y: Number.isFinite(lockSourceEntry.y) ? lockSourceEntry.y : (lockDoorModel?.y ?? 0),
            height: Number.isFinite(lockSourceEntry.height)
              ? lockSourceEntry.height
              : (lockDoorModel?.height ?? 2.2) * 0.5,
          };
        })
        .filter(
          (lockFilterEntry: any) =>
            isEditing ||
            lockFilterEntry.doorEntityId ||
            lockFilterEntry.doorEventEntityId ||
            lockFilterEntry.doorOpenEntityId ||
            lockFilterEntry.doorCloseEntityId ||
            lockFilterEntry.batteryEntityId ||
            lockFilterEntry.battery2EntityId ||
            lockFilterEntry.entityId,
        ),
    labelModeOf = (labelModeEntry: any) =>
      labelModeEntry.labelMode === "hidden" ||
      labelModeEntry.labelMode === "open" ||
      labelModeEntry.labelMode === "always"
        ? labelModeEntry.labelMode
        : "always",
    isLockLabelShown = (lockLabelEntry: any, lockLabelState: any) =>
      lockLabelEntry.deviceKind !== "lock" ||
      labelModeOf(lockLabelEntry) === "always" ||
      (labelModeOf(lockLabelEntry) === "open" && lockLabelState?.doorOpen === true),
    securityCameraBindings = () =>
      (options.security?.cameras || []).map((securityCameraSourceEntry: any) => {
        const securityCameraModel = stageModelIndex.item(
          securityCameraSourceEntry.floorId,
          securityCameraSourceEntry.modelId,
          "camera",
        );
        return {
          ...securityCameraSourceEntry,
          id: "camera:" + securityCameraSourceEntry.id,
          deviceKind: "camera",
          clickAction: "focus",
          modelAvailable: !!securityCameraModel,
          icon: securityCameraSourceEntry.icon || "mdi:cctv",
          x: Number.isFinite(securityCameraSourceEntry.x)
            ? securityCameraSourceEntry.x
            : (securityCameraModel?.x ?? 0),
          y: Number.isFinite(securityCameraSourceEntry.y)
            ? securityCameraSourceEntry.y
            : (securityCameraModel?.y ?? 0),
          height: Number.isFinite(securityCameraSourceEntry.height)
            ? securityCameraSourceEntry.height
            : (Number(securityCameraModel?.elevation) || 0) +
              (Number(securityCameraModel?.height) || 0.3) / 2,
        };
      }),
    alarmBindings = () =>
      (options.security?.alarms || []).map((alarmSourceEntry: any) => {
        const kind = isSecurityAlarmKind(alarmSourceEntry.kind)
          ? alarmSourceEntry.kind
          : "smoke";
        return {
          ...alarmSourceEntry,
          kind,
          id: kind + ":" + alarmSourceEntry.id,
          deviceKind: kind,
          securityAlarm: true,
          // 浮动卡片不依赖场景模型；显式 true，避免被 modelAvailable===false 裁掉
          modelAvailable: true,
          clickAction: "focus",
          x: Number.isFinite(alarmSourceEntry.x) ? alarmSourceEntry.x : 0,
          y: Number.isFinite(alarmSourceEntry.y) ? alarmSourceEntry.y : 0,
          height: Number.isFinite(alarmSourceEntry.height) ? alarmSourceEntry.height : 1.8,
          size: Number.isFinite(alarmSourceEntry.size) ? alarmSourceEntry.size : 340,
          fontSize: Number.isFinite(alarmSourceEntry.fontSize)
            ? alarmSourceEntry.fontSize
            : 21,
          opacity: Number.isFinite(alarmSourceEntry.opacity) ? alarmSourceEntry.opacity : 1,
        };
      }),
    presenceBindings = () =>
      (options.security?.presenceSensors || []).map((presenceSourceEntry: any) => {
        const presenceModel = stageModelIndex.item(
          presenceSourceEntry.floorId,
          presenceSourceEntry.modelId,
          "presence",
        );
        return {
          ...presenceSourceEntry,
          modelAvailable: presenceSourceEntry.modelId ? !!presenceModel : undefined,
          id: "presence:" + presenceSourceEntry.id,
          deviceKind: "presence",
          clickAction: "focus",
          icon: "mdi:motion-sensor",
          size: presenceSourceEntry.modelId ? 36 : presenceSourceEntry.size,
          x: presenceModel?.x ?? presenceSourceEntry.route?.[0]?.x ?? 0,
          y: presenceModel?.y ?? presenceSourceEntry.route?.[0]?.y ?? 0,
          height: presenceModel
            ? (Number(presenceModel.elevation) || 0) + (Number(presenceModel.height) || 0.2) / 2
            : (presenceSourceEntry.size ?? 1) * 0.7,
        };
      });
  function collectSecurityBindings() {
    const securityBindingEntries = [
      ...lockBindings(),
      ...securityCameraBindings(),
      ...alarmBindings(),
      ...presenceBindings().filter(
        (securityBinding: any) => (isEditing && securityBinding.modelId) || !isEditing,
      ),
    ];
    return isEditing && selectedSecurityKind
      ? securityBindingEntries.filter(
          (filteredSecurityBinding) =>
            filteredSecurityBinding.deviceKind === selectedSecurityKind ||
            (isSecurityAlarmKind(selectedSecurityKind) &&
              filteredSecurityBinding.securityAlarm &&
              filteredSecurityBinding.kind === selectedSecurityKind),
        )
      : securityBindingEntries;
  }
  function buildLockMotionInput() {
    const lockBindingList = options.security?.locks || [];
    if (isEditing && !selectedLockEntry)
      return {
        bindings: [] as any[],
        states: {} as Record<string, any>,
      };
    if (!isEditing || selectedSecurityKind !== "lock" || !selectedLockEntry?.id)
      return {
        bindings: lockBindingList,
        states: deviceStates,
      };
    const replace = selectedLockEntry.id.replace(/^lock:/, ""),
      selectedLockBinding = lockBindingList.find((matchedLock: any) => matchedLock.id === replace);
    if (!selectedLockBinding)
      return {
        bindings: lockBindingList,
        states: deviceStates,
      };
    const lockPreviewEntityId = selectedLockBinding.doorEntityId || "__hb_lock_motion_preview__",
      lockPreviewEntry = {
        ...selectedLockBinding,
        doorEntityId: lockPreviewEntityId,
      };
    return {
      bindings: lockBindingList.map((lockPreviewBinding: any) =>
        lockPreviewBinding === selectedLockBinding ? lockPreviewEntry : lockPreviewBinding,
      ),
      states: {
        ...deviceStates,
        [lockPreviewEntityId]: {
          state: selectedLockEntry.open ? "open" : "closed",
          available: true,
        },
      },
    };
  }
  const findBindingById = (bindingLookupId: any) =>
    currentModuleBindings().find((moduleBinding: any) => moduleBinding.id === bindingLookupId) ||
    lockBindings().find((lockLookupBinding: any) => lockLookupBinding.id === bindingLookupId) ||
    securityCameraBindings().find(
      (cameraLookupBinding: any) => cameraLookupBinding.id === bindingLookupId,
    ) ||
    presenceBindings().find(
      (presenceLookupBinding: any) => presenceLookupBinding.id === bindingLookupId,
    ) ||
    alarmBindings().find((alarmLookupBinding: any) => alarmLookupBinding.id === bindingLookupId);
  let outgoingGhostAnimation: any = null;
  function cancelGhostAnimation() {
    const ghostAnimation = outgoingGhostAnimation;
    if (((outgoingGhostAnimation = null), !!ghostAnimation)) {
      for (const ghostAnimationEntry of ghostAnimation.animations) ghostAnimationEntry.cancel();
      (ghostAnimation.ghost.remove(), markerLayerElement.removeAttribute("inert"));
    }
  }
  function reportModuleSwitch(lifecycleEventName: any, fromModuleName: any, toModuleName: any) {
    try {
      const moduleOrderEntries = [
        "overview",
        "light",
        "environment",
        "devices",
        "vacuum",
        "security",
      ];
      mountOptions.reportLifecycle?.(lifecycleEventName, {
        fromCategory: moduleOrderEntries.indexOf(fromModuleName),
        toCategory: moduleOrderEntries.indexOf(toModuleName),
        ...vacuumMaps.diagnostics?.(),
      });
    } catch { /* 上报 / 观测类调用是 best-effort：观测通道失败不应中断业务主流程 */ }
  }
  function selectModule(targetModule: any) {
    if (
      isEditing ||
      isAwaitingFloorViewAdjust ||
      isRangeEditorOpen ||
      isCameraMoving ||
      !configuredModuleKinds2.includes(targetModule) ||
      selectedFloorId === "all"
    )
      return;
    if (((pendingModule = ""), targetModule === activeModule)) {
      refreshStageUi();
      return;
    }
    const previousModule = activeModule;
    (reportModuleSwitch("category-switch-start", previousModule, targetModule),
      followVacuumId && stopVacuumFollow(),
      exitFocusMode(),
      runModuleSwitchAnimation(() => {
        ((activeModule = targetModule),
          idleRotationControl.activity(),
          idleIconVisibilityControl.activity(),
          idleFocusExitControl.activity(),
          sceneCacheByKey.clear(),
          refreshStageUi(),
          syncMarkers(),
          reportModuleSwitch("category-switch-applied", previousModule, targetModule));
      }));
  }
  const getFocusedEntry = () => findBindingById(focusedItemId),
    readLightState = (lightEntityId: any) =>
      vector.state(lightEntityId, resolveDeviceState(lightEntityId));
  function resolveLightState(lightEntry: any) {
    const lightState = readLightState(lightEntry?.entityId),
      deviceState = resolveDeviceState(lightEntry?.entityId);
    if (!lightEntry?.entityId?.startsWith("light.")) return lightState;
    const lightStateView =
      deviceState.capabilitiesKnown ||
      lightState.brightnessSupported ||
      lightState.temperatureSupported
        ? {
            ...lightState,
          }
        : {
            ...lightState,
            brightnessSupported: true,
            temperatureSupported: true,
            brightness: lightState.on ? (lightState.brightness ?? 100) : 0,
            kelvin: lightState.kelvin ?? 3500,
          };
    return (
      !lightStateView.on && lightStateView.brightnessSupported && (lightStateView.brightness = 0),
      lightStateView
    );
  }
  function previewEditedLight(editedLightBinding: any) {
    const editedLightState = readLightState(editedLightBinding.entityId);
    return (
      isEditing &&
        lightEditPreview?.id === editedLightBinding.id &&
        ((editedLightState.on = true),
        (editedLightState.available = true),
        lightEditPreview.kind !== "defaults" &&
          (editedLightState.brightness = lightEditPreview.kind === "brightnessMin" ? 1 : 100),
        lightEditPreview.kind.startsWith("brightness") &&
          (editedLightState.brightnessSupported = true),
        lightEditPreview.kind.startsWith("temperature") &&
          ((editedLightState.temperatureSupported = true),
          (editedLightState.kelvin = lightEditPreview.kind.endsWith("Min")
            ? editedLightState.minimum
            : editedLightState.maximum))),
      editedLightState
    );
  }
  function applyLightStates(lightStateOptions: any = undefined, lightStatePatch: any = null) {
    const isEditorActive = isEditing || isAwaitingFloorViewAdjust,
      editedLightEntityId =
        isEditorActive && !isAwaitingFloorViewAdjust && panelDisplayMode !== "edit"
          ? lightEditPreview?.id
          : null;
    if (
      (mountOptions.setEditorEffects?.(isEditorActive, !!editedLightEntityId),
      (mountOptions.floorTransitionActive || cameraMotionSnapshot?.owner === "floor") &&
        !mountOptions.floorEffectsFollow)
    )
      return;
    const isPartialLightPatch =
        !isEditorActive && lightStatePatch && mountOptions.lightStatePatchReady === true,
      lightBindingList = (options.lights || []).filter((lightBinding: any) => lightBinding.entityId),
      targetLightBindings = isPartialLightPatch
        ? lightBindingsForUpdate2(lightBindingList, lightStatePatch)
        : lightBindingList;
    mountOptions.setLightStates(
      targetLightBindings.map((targetLightBinding: any) => {
        const targetLightStateView = previewEditedLight(targetLightBinding);
        return {
          ...applyFixedLightEffects(targetLightBinding),
          ...(isEditing && lightEditPreview?.id === targetLightBinding.id
            ? targetLightStateView
            : lightRenderState2(targetLightStateView)),
          ...(isEditorActive && targetLightBinding.id !== editedLightEntityId
            ? {
                on: false,
              }
            : {}),
        };
      }),
      isEditorActive
        ? {
            ...lightStateOptions,
            editor: true,
            immediate: true,
          }
        : isPartialLightPatch
          ? {
              ...lightStateOptions,
              partial: true,
            }
          : lightStateOptions,
    );
  }
  function stageCameraMotionDeps() {
    return ({
      get isRangeEditorOpen() {
        return isRangeEditorOpen;
      },
      get rangeEditorHandle() {
        return rangeEditorHandle;
      },
      get followVacuumId() {
        return followVacuumId;
      },
      get mountOptions() {
        return mountOptions;
      },
      get options() {
        return options;
      },
      get activeModule() {
        return activeModule;
      },
      get isAwaitingFloorViewAdjust() {
        return isAwaitingFloorViewAdjust;
      },
      get panelDisplayMode() {
        return panelDisplayMode;
      },
      set panelDisplayMode(v) {
        panelDisplayMode = v;
      },
      get isEditing() {
        return isEditing;
      },
      get cameraMotionSnapshot() {
        return cameraMotionSnapshot;
      },
      set cameraMotionSnapshot(v) {
        cameraMotionSnapshot = v;
      },
      get getFocusedEntry() {
        return getFocusedEntry;
      },
      get computeGroupBounds() {
        return computeGroupBounds;
      },
      get presenceScene() {
        return presenceScene;
      },
      get activePointerDrag() {
        return activePointerDrag;
      },
      set activePointerDrag(v) {
        activePointerDrag = v;
      },
      get isControlReady() {
        return isControlReady;
      },
      get isIdleRotationRunning() {
        return isIdleRotationRunning;
      },
      get focusInset() {
        return focusInset;
      },
      set focusInset(v) {
        focusInset = v;
      },
      get refreshStageUi() {
        return refreshStageUi;
      },
      get syncStageVisibility() {
        return syncStageVisibility;
      },
      get renderMarkerPositions() {
        return renderMarkerPositions;
      },
      get exitFollowMode() {
        return exitFollowMode;
      },
      get syncAvailability() {
        return syncAvailability;
      },
      get climatePanel() {
        return climatePanel;
      },
      get lightModeMenu() {
        return lightModeMenu;
      },
      get lightColorPicker() {
        return lightColorPicker;
      },
      get coverPanel() {
        return coverPanel;
      },
      get coverGroupPanel() {
        return coverGroupPanel;
      },
      get televisionPanel() {
        return televisionPanel;
      },
      get speakerPanel() {
        return speakerPanel;
      },
      get focusedItemId() {
        return focusedItemId;
      },
      set focusedItemId(v) {
        focusedItemId = v;
      },
      get idleReturnCamera() {
        return idleReturnCamera;
      },
      set idleReturnCamera(v) {
        idleReturnCamera = v;
      },
      get lightEditPreview() {
        return lightEditPreview;
      },
      set lightEditPreview(v) {
        lightEditPreview = v;
      },
      get hasPendingStageRefresh() {
        return hasPendingStageRefresh;
      },
      set hasPendingStageRefresh(v) {
        hasPendingStageRefresh = v;
      },
      get restoreFocusWithin() {
        return restoreFocusWithin;
      },
      get lightPanelSection() {
        return lightPanelSection;
      },
      get syncPanelChrome() {
        return syncPanelChrome;
      },
      get startCameraMotion() {
        return startCameraMotion;
      },
      get applyLightStates() {
        return applyLightStates;
      },
      get findBindingById() {
        return findBindingById;
      },
      get isOverviewOrAllFloors() {
        return isOverviewOrAllFloors;
      },
      get idleFocusExitControl() {
        return idleFocusExitControl;
      },
      get controlErrorElement() {
        return controlErrorElement;
      },
      get updateDevicePanel() {
        return updateDevicePanel;
      },
      get handleMarkerActivate() {
        return handleMarkerActivate;
      },
      get isPanelDeviceKind() {
        return isPanelDeviceKind;
      },
      get activeCameraPose() {
        return activeCameraPose;
      },
      get three() {
        return three;
      },
      get canvasElement() {
        return canvasElement;
      },
      get text() {
        return text;
      },
      set text(v) {
        text = v;
      },
      get syncMarkers() {
        return syncMarkers;
      },
      get vacuumOverlayByKey() {
        return vacuumOverlayByKey;
      },
      get map() {
        return map;
      },
      get isControlBusy() {
        return isControlBusy;
      },
      get deviceStates() {
        return deviceStates;
      },
      get mediaControlRequestsByRequestId() {
        return mediaControlRequestsByRequestId;
      },
      get controlMediaDevice() {
        return controlMediaDevice;
      },
      get readCoverFeedback() {
        return readCoverFeedback;
      },
      get coverPanelOptions() {
        return coverPanelOptions;
      },
      get readLightState() {
        return readLightState;
      },
      get runLightCommand() {
        return runLightCommand;
      },
      get screenPointToFloor() {
        return screenPointToFloor;
      },
      get stageModelIndex() {
        return stageModelIndex;
      },
    });
  }

  function syncCameraInteraction() {
    return syncCameraInteractionCore(stageCameraMotionDeps());
  }
  function advanceCameraMotion(frameTimestampInput: any) {
    return advanceCameraMotionCore(stageCameraMotionDeps(), frameTimestampInput);
  }
  function exitFocusMode(exitOptions: { immediate?: boolean; preserveCamera?: boolean } = {}) {
    return exitFocusModeCore(stageCameraMotionDeps(), exitOptions);
  }
  function focusMarkerById(targetMarkerId: any, focusMode = "runtime", isImmediate = false) {
    return focusMarkerByIdCore(stageCameraMotionDeps(), targetMarkerId, focusMode, isImmediate);
  }
  function activateMarker(activatedMarkerId: any, isShortcut = false) {
    return activateMarkerCore(stageCameraMotionDeps(), activatedMarkerId, isShortcut);
  }
  function beginMarkerDrag(dragStartEvent: any, dragMarkerId: any) {
    return beginMarkerDragCore(stageCameraMotionDeps(), dragStartEvent, dragMarkerId);
  }
  function endMarkerDrag(dragEndEvent: any) {
    return endMarkerDragCore(stageCameraMotionDeps(), dragEndEvent);
  }
  let presentationUiSignatureCache = "";
  const computeFocusInset = () => {
    const insetFocusedEntry = getFocusedEntry(),
      popupPlacementConfig =
        options.popupLayout?.[insetFocusedEntry?.deviceKind === "camera" ? "camera" : "general"];
    if (
      (Number.isFinite(popupPlacementConfig?.x) && popupPlacementConfig.x < 75) ||
      (!isEditing &&
        isPanelDeviceKind(insetFocusedEntry) &&
        insetFocusedEntry?.clickAction === "focus")
    )
      return 0;
    const clientWidth = mediaViewportSize?.width || element.clientWidth,
      lightPanelScale =
        lightPanelSection.getBoundingClientRect().width / Math.max(mediaScale, 0.0001);
    return Math.min(0.7, (lightPanelScale + 24) / Math.max(clientWidth, 1));
  };

  const NAVIGATION_DRAG_THRESHOLD = 4;
  function stageNavigationDragDeps() {
    return ({
      get options() {
        return options;
      },
      set options(v) {
        options = v;
      },
      get navigationEditing() {
        return navigationEditing;
      },
      get element() {
        return element;
      },
      get NAVIGATION_DRAG_THRESHOLD() {
        return NAVIGATION_DRAG_THRESHOLD;
      },
      get syncLayoutMetrics() {
        return syncLayoutMetrics;
      },
    });
  }

  function bindNavigationDrag(dragElement: any, navigationKey: any, fallbackPosition: any) {
    return bindNavigationDragCore(stageNavigationDragDeps(), dragElement, navigationKey, fallbackPosition);
  }


  bindNavigationDrag(moduleTabsElement, "categories", [50, 94]);
  bindNavigationDrag(floorTabsElement, "floors", [96, 50]);
  function restoreFocusWithin(focusScopeElement: any, focusTargetElement = canvasElement) {
    const activeElement = document.activeElement;
    !activeElement ||
      !focusScopeElement.contains(activeElement) ||
      (focusTargetElement.setAttribute("tabindex", "-1"),
      focusTargetElement.focus({
        preventScroll: true,
      }),
      focusScopeElement.contains(document.activeElement) &&
        focusTargetElement !== canvasElement &&
        (canvasElement.setAttribute("tabindex", "-1"),
        canvasElement.focus({
          preventScroll: true,
        })),
      focusScopeElement.contains(document.activeElement) && (activeElement as HTMLElement).blur());
  }
  function syncFocusHidden() {
    (moduleTabsElement.classList.toggle("is-follow-hidden", !!followVacuumId),
      (moduleTabsElement.inert = !!(followVacuumId || isModuleTabsHidden)),
      moduleTabsElement.setAttribute(
        "aria-hidden",
        String(!!(followVacuumId || isModuleTabsHidden)),
      ));
    const isFocusHidden =
      hasPendingStageRefresh ||
      !!(focusedItemId && panelDisplayMode && panelDisplayMode !== "panel");
    for (const focusTabElement of [navigationLayerElement, floorTabsElement]) {
      const isTabFocusHidden =
        (isFocusHidden || (!!followVacuumId && focusTabElement === floorTabsElement)) &&
        !(isNavigationVisible && focusTabElement === navigationLayerElement);
      (focusTabElement.classList.toggle("is-focus-hidden", isTabFocusHidden),
        (focusTabElement.inert = isTabFocusHidden),
        focusTabElement.setAttribute("aria-hidden", String(isTabFocusHidden)));
    }
  }
  function exitFollowMode() {
    hasPendingStageRefresh &&
      ((hasPendingStageRefresh = false),
      syncStageVisibility(),
      renderMarkerPositions(true),
      syncFocusHidden());
  }
  function syncPanelChrome() {
    syncFocusHidden();
    const panelOpacityPercent = Number.isFinite(options.popupOpacity)
      ? Math.max(0, Math.min(100, options.popupOpacity))
      : 74;
    lightPanelSection.style.setProperty("--i3d-panel-opacity", String(panelOpacityPercent / 100));
    const focusVignettePercent = Number.isFinite(options.focusVignetteStrength)
      ? Math.max(0, Math.min(60, options.focusVignetteStrength))
      : 14;
    (focusVignetteElement.style.setProperty(
      "--i3d-vignette-opacity",
      String(focusVignettePercent / 100),
    ),
      (focusVignetteElement.hidden =
        isAwaitingFloorViewAdjust || panelDisplayMode === "edit" || panelDisplayMode === "panel"),
      focusVignetteElement.classList.toggle(
        "is-active",
        focusVignettePercent > 0 &&
          !!focusedItemId &&
          !!panelDisplayMode &&
          !focusVignetteElement.hidden,
      ),
      (viewHelpElement.hidden =
        !isAwaitingFloorViewAdjust &&
        panelDisplayMode !== "edit" &&
        !(isEditing && !panelDisplayMode)),
      (viewHelpElement.textContent =
        panelDisplayMode === "edit"
          ? "拖动旋转 · 右键平移 · 滚轮缩放。调整完成后保存视角。"
          : isEditing && !isAwaitingFloorViewAdjust
            ? "拖动空白处旋转 · 右键平移 · 滚轮缩放。临时查看不改变已保存视角。"
            : "拖动旋转 · 右键平移 · 滚轮缩放。调整完成后固定视角。"),
      markerLayerElement.classList.toggle(
        "is-view-editing",
        isAwaitingFloorViewAdjust || panelDisplayMode === "edit",
      ),
      lightPanelSection.classList.toggle("is-preview", isEditing),
      refreshStageUi(),
      syncStageVisibility());
  }
  function normalizeCameraPose(rawCameraPose: any) {
    if (!rawCameraPose) return rawCameraPose;
    if (rawCameraPose.view !== "top")
      return mountOptions.constrainCameraPose({
        ...rawCameraPose,
        up: [0, 1, 0],
      });
    const poseTargetVector = new three.Vector3(...rawCameraPose.target),
      poseCameraDistance = Math.max(
        new three.Vector3(...rawCameraPose.position).distanceTo(poseTargetVector),
        0.001,
      ),
      degToRad = three.MathUtils.degToRad(rawCameraPose.topRotation || 0),
      poseUpVector = new three.Vector3(
        ...(rawCameraPose.up || [Math.sin(degToRad), 0, -Math.cos(degToRad)]),
      );
    return (
      (poseUpVector.y = 0),
      poseUpVector.lengthSq() < 1e-12 &&
        poseUpVector.set(Math.sin(degToRad), 0, -Math.cos(degToRad)),
      mountOptions.constrainCameraPose({
        ...rawCameraPose,
        position: [poseTargetVector.x, poseTargetVector.y + poseCameraDistance, poseTargetVector.z],
        up: poseUpVector.normalize().toArray(),
      })
    );
  }
  function startCameraMotion(
    targetCameraPose: any,
    isFocused: any,
    isImmediateMotion = false,
    doneCallback: any = undefined,
    motionOwner = "focus",
    floorFrame: any = null,
  ) {
    const normalizedCameraPose =
        motionOwner === "follow-return" ? targetCameraPose : normalizeCameraPose(targetCameraPose),
      beginCameraMotion = mountOptions.beginCameraMotion(
        normalizedCameraPose.mode,
        normalizedCameraPose,
        motionOwner,
      );
    motionOwner === "floor" &&
      mountOptions.setFloorSlideCameras?.(beginCameraMotion, normalizedCameraPose);
    const isReducedMotion =
      isImmediateMotion || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    ((cameraMotionSnapshot = {
      from: beginCameraMotion,
      to: structuredClone(normalizedCameraPose),
      inset: focusInset,
      targetInset: isFocused ? computeFocusInset() : 0,
      transition: createDampedCameraMotion2(three, beginCameraMotion, normalizedCameraPose, {
        immediate: isReducedMotion,
        owner: motionOwner,
        floorFrame: floorFrame,
      }),
      focused: isFocused,
      owner: motionOwner,
      started: performance.now(),
      elapsed: 0,
      done: doneCallback,
    }),
      (motionOwner !== "focus" || isFocused) && exitFollowMode(),
      syncAvailability(),
      syncCameraInteraction(),
      advanceCameraMotion(cameraMotionSnapshot.started),
      cameraMotionSnapshot && (cameraMotionSnapshot.firstFrame = true),
      wakeSceneBackground());
  }
  const idleRotationControl = createIdleRotation2({
      returnToBase(returnCallback: any) {
        ((isCameraRotating = true),
          (idleRotationCameraPose = structuredClone(
            pageBehavior.autoRotate.returnToDefault === true
              ? normalizeCameraPose(
                  options.camera || activeCameraPose || mountOptions.cameraState(),
                )
              : mountOptions.cameraState(true),
          )));
        const hasActiveFocus = !!(focusedItemId || panelDisplayMode);
        ((focusedItemId = ""),
          (panelDisplayMode = ""),
          (idleReturnCamera = null),
          (hasPendingStageRefresh = false),
          restoreFocusWithin(lightPanelSection),
          lightPanelSection.classList.remove("is-open"),
          lightPanelSection.setAttribute("inert", ""),
          syncPanelChrome(),
          hasActiveFocus &&
            postHostMessage({
              type: "focus-state",
              active: false,
            }),
          mountOptions.setOrbitPivot(null),
          !cameraMotionSnapshot &&
          !focusInset &&
          isSameCameraPose(mountOptions.cameraState(), idleRotationCameraPose)
            ? returnCallback()
            : startCameraMotion(idleRotationCameraPose, false, false, returnCallback, "idle"));
      },
      start() {
        ((isIdleRotationRunning = true),
          mountOptions.beginCameraMotion(idleRotationCameraPose.mode),
          syncCameraInteraction());
      },
      rotate(rotationDelta: any) {
        mountOptions.applyCameraPose(
          mountOptions.orbitCameraPose(idleRotationCameraPose, rotationDelta),
        );
      },
      stop() {
        const isIdleMotionOwned = cameraMotionSnapshot?.owner === "idle",
          isIdleRotationStopping = isIdleRotationRunning;
        ((isIdleRotationRunning = false),
          (isCameraRotating = false),
          (isIdleIconHidden = false),
          (idleIconDelayUntilMs = 0),
          (cameraQuaternionKey = mountOptions.camera.quaternion?.toArray?.().join(",") || ""),
          syncStageVisibility(),
          isIdleMotionOwned && (cameraMotionSnapshot = null),
          (isIdleMotionOwned || isIdleRotationStopping) && mountOptions.endCameraMotion(),
          syncCameraInteraction());
      },
    }),
    idleIconVisibilityControl = createIdleIconVisibility2({
      onChange(isIconVisible) {
        ((isUserActive = isIconVisible), syncStageVisibility());
      },
    }),
    idleFocusExitControl = createIdleFocusExit2({
      onExit: () => exitFocusMode(),
    });
  function configureIdleBehaviors() {
    ((pageBehavior = resolvePageBehavior2(options, activeModule)),
      idleRotationControl.configure(pageBehavior.autoRotate),
      idleIconVisibilityControl.configure(pageBehavior.idleHideIcons),
      idleFocusExitControl.configure(pageBehavior.idleExitFocus),
      syncCameraInteraction(),
      pageBehavior.hideIconsWhileRotating ||
        ((isIdleIconHidden = false), (idleIconDelayUntilMs = 0)));
  }
  function syncAvailability() {
    const isIdleRotationAvailable =
      isStagePresented &&
      isStageVisible &&
      isControlReady &&
      !isEditing &&
      !isAwaitingFloorViewAdjust &&
      !isRangeEditorOpen &&
      !document.hidden &&
      !isControlBusy;
    (isIdleRotationAvailable || clearActivityState(),
      idleRotationControl.setAvailable(
        isIdleRotationAvailable &&
          !followVacuumId &&
          !focusedItemId &&
          !panelDisplayMode &&
          !(cameraMotionSnapshot && cameraMotionSnapshot.owner !== "idle"),
      ),
      idleFocusExitControl.setAvailable(
        isIdleRotationAvailable &&
          !!focusedItemId &&
          ["runtime", "panel"].includes(panelDisplayMode) &&
          !cameraMotionSnapshot,
      ),
      idleIconVisibilityControl.setAvailable(isIdleRotationAvailable));
    const isFrameLoopAvailable =
      !isControlBusy && !document.hidden && (!hasPresentedOnce || isPresentedVisible);
    (sceneBackground?.setAvailable(isFrameLoopAvailable),
      screenOutlines.setAvailable(isFrameLoopAvailable),
      editorSelectionOutlines.setAvailable(isFrameLoopAvailable),
      document.body?.classList.toggle("is-render-suspended", !isFrameLoopAvailable),
      (document.hidden || !isPresentedVisible) && sceneBackgroundController.suspend(),
      wakeSceneBackground());
  }
  function syncIdleHold() {
    const isIdleHeld = isPointerHeld || set.size > 0 || lightSyncKeySet.size > 0;
    (idleRotationControl.hold(isIdleHeld),
      idleIconVisibilityControl.hold(isIdleHeld),
      idleFocusExitControl.hold(isIdleHeld),
      wakeSceneBackground());
  }
  function handleActivityInput(inputEvent: any) {
    (followVacuumId && inputEvent.key === "Escape" && stopVacuumFollow(),
      (furthestFloorOrder = performance.now()),
      (hasIdleIconActivity = false),
      syncStageVisibility(),
      inputEvent.type === "pointerdown" && set.add(inputEvent.pointerId),
      (inputEvent.type === "pointerup" || inputEvent.type === "pointercancel") &&
        set.delete(inputEvent.pointerId),
      inputEvent.type === "keydown" && lightSyncKeySet.add(inputEvent.code || inputEvent.key),
      inputEvent.type === "keyup" && lightSyncKeySet.delete(inputEvent.code || inputEvent.key),
      syncIdleHold());
  }
  const activityEventNames = [
    "pointerdown",
    "pointermove",
    "pointerup",
    "pointercancel",
    "wheel",
    "keydown",
    "keyup",
  ];
  for (const activityEventName of activityEventNames)
    window.addEventListener(activityEventName, handleActivityInput, {
      capture: true,
      passive: true,
    });
  function clearActivityState() {
    (set.clear(), lightSyncKeySet.clear(), (isPointerHeld = false), syncIdleHold());
  }
  window.addEventListener("blur", clearActivityState);
  function handleVisibilityChange() {
    (document.hidden &&
      focusExitPointer &&
      releaseFocusExit({
        pointerId: focusExitPointer.pointerId,
      }),
      syncAvailability());
  }
  document.addEventListener &&
    document.addEventListener("visibilitychange", handleVisibilityChange);
  (restoreViewButton.addEventListener("click", () => {
    panelDisplayMode || idleReturnCamera || cameraMotionSnapshot
      ? exitFocusMode()
      : mountOptions.restoreCamera(normalizeCameraPose(options.camera || activeCameraPose));
  }),
    powerButton.addEventListener("click", () => {
      const clickedLightItem = getFocusedEntry();
      clickedLightItem && runLightCommand("power", !readLightState(clickedLightItem.entityId).on);
    }));
  function stageLightingDeps() {
    return ({
      get powerButton() {
        return powerButton;
      },
      get getFocusedEntry() {
        return getFocusedEntry;
      },
      get isEditing() {
        return isEditing;
      },
      get isControlBusy() {
        return isControlBusy;
      },
      get resolveLightState() {
        return resolveLightState;
      },
      get vector() {
        return vector;
      },
      get applyLightStates() {
        return applyLightStates;
      },
      get enqueueControlCommand() {
        return enqueueControlCommand;
      },
      get controlErrorElement() {
        return controlErrorElement;
      },
      get syncMarkers() {
        return syncMarkers;
      },
      get updateDevicePanel() {
        return updateDevicePanel;
      },
    });
  }

  function updateLampButton(mountOptionsLightState: any) {
    return updateLampButtonCore(stageLightingDeps(), mountOptionsLightState);
  }
  function runLightCommand(serviceName: any, serviceValue: any, commandTargetItem = getFocusedEntry()) {
    return runLightCommandCore(stageLightingDeps(), serviceName, serviceValue, commandTargetItem);
  }
  function dispatchControlCommand(controlCommand: any, previewToken: any) {
    const requestId = String(++num),
      entityId2 = controlCommand.entityId;
    vector.retain(entityId2, previewToken);
    const commandTimeoutHandle = setTimeout(
      () => settleControlCommand(requestId, "请求超时，请检查设备状态。", true),
      14000,
    );
    (lightGroupByKey.set(requestId, {
      entityId: entityId2,
      command: controlCommand,
      previewToken: previewToken,
      timeout: commandTimeoutHandle,
      next: null as any,
    }),
      postHostMessage({
        type: "control",
        requestId: requestId,
        command: controlCommand,
      }));
  }
  function enqueueControlCommand(nextCommand: any, nextPreviewToken: any) {
    const existingCommandEntry = [...lightGroupByKey.values()].find(
      (matchedEntry) => matchedEntry.entityId === nextCommand.entityId,
    );
    if (!existingCommandEntry) return dispatchControlCommand(nextCommand, nextPreviewToken);
    const command = existingCommandEntry.next?.command || existingCommandEntry.command;
    if (command.service === "turn_on" && nextCommand.service === "turn_on") {
      const retainedCommandFields = {
        ...command.data,
      };
      (("brightness" in nextCommand.data || "brightness_pct" in nextCommand.data) &&
        (delete retainedCommandFields.brightness, delete retainedCommandFields.brightness_pct),
        ["hs_color", "rgb_color", "color_temp_kelvin", "white"].some(
          (colorFieldName) => colorFieldName in nextCommand.data,
        ) &&
          (delete retainedCommandFields.hs_color,
          delete retainedCommandFields.rgb_color,
          delete retainedCommandFields.color_temp_kelvin,
          delete retainedCommandFields.white),
        (nextCommand = {
          ...nextCommand,
          data: {
            ...retainedCommandFields,
            ...nextCommand.data,
          },
        }));
    }
    ((existingCommandEntry.next = {
      command: nextCommand,
      previewToken: nextPreviewToken,
    }),
      vector.hold(nextCommand.entityId, nextPreviewToken));
  }
  function settleControlCommand(settledRequestId: any, errorMessage = "", isTimedOut = false) {
    const settledEntry = lightGroupByKey.get(settledRequestId);
    if (!settledEntry) return;
    (clearTimeout(settledEntry.timeout), lightGroupByKey.delete(settledRequestId));
    const next = settledEntry.next,
      available =
        next &&
        !isTimedOut &&
        !isControlBusy &&
        !isEditing &&
        isControlReady &&
        activeModule === "light" &&
        selectedFloorId !== "all" &&
        (options.lights || []).some(
          (boundLightItem: any) =>
            matchesSelectedFloor(boundLightItem) &&
            boundLightItem.entityId === settledEntry.entityId,
        ) &&
        resolveDeviceState(settledEntry.entityId).available;
    (errorMessage
      ? vector.reject(settledEntry.entityId, settledEntry.previewToken)
      : vector.acknowledge(settledEntry.entityId, settledEntry.previewToken),
      available
        ? dispatchControlCommand(next.command, next.previewToken)
        : next && vector.reject(settledEntry.entityId, next.previewToken),
      getFocusedEntry()?.entityId === settledEntry.entityId &&
        (controlErrorElement.textContent = available ? "" : errorMessage),
      syncMarkers());
  }
  function screenPointToFloor(floorPointerEvent: any, floorMarkerItem: any) {
    const worldPoint = mountOptions.worldPoint(
      floorMarkerItem.floorId,
      0,
      0,
      floorMarkerItem.height,
    );
    if (!worldPoint) return null;
    const floorCanvasRect = element.getBoundingClientRect(),
      floorRaycaster = new three.Raycaster(),
      pointerNdc = new three.Vector2(
        ((floorPointerEvent.clientX - floorCanvasRect.left) / floorCanvasRect.width) * 2 - 1,
        1 - ((floorPointerEvent.clientY - floorCanvasRect.top) / floorCanvasRect.height) * 2,
      );
    mountOptions.presentationRay
      ? mountOptions.presentationRay(floorMarkerItem.floorId, pointerNdc, floorRaycaster)
      : floorRaycaster.setFromCamera(pointerNdc, mountOptions.camera);
    const intersectPlane = floorRaycaster.ray.intersectPlane(
      new three.Plane(new three.Vector3(0, 1, 0), -worldPoint.y),
      new three.Vector3(),
    );
    if (!intersectPlane) return null;
    const sub = mountOptions
        .worldPoint(floorMarkerItem.floorId, 1, 0, floorMarkerItem.height)
        .sub(worldPoint),
      sub2 = mountOptions
        .worldPoint(floorMarkerItem.floorId, 0, 1, floorMarkerItem.height)
        .sub(worldPoint),
      sub3 = intersectPlane.sub(worldPoint);
    return {
      x: Math.round((sub3.dot(sub) / sub.lengthSq()) * 100) / 100,
      y: Math.round((sub3.dot(sub2) / sub2.lengthSq()) * 100) / 100,
    };
  }
  function moveMarkerDrag(dragMovePointerEvent: any) {
    if (
      !activePointerDrag ||
      activePointerDrag.pointerId !== dragMovePointerEvent.pointerId ||
      (Math.hypot(
        dragMovePointerEvent.clientX - activePointerDrag.clientX,
        dragMovePointerEvent.clientY - activePointerDrag.clientY,
      ) < 4 &&
        !activePointerDrag.moved)
    )
      return;
    const dragCurrentFloorPoint = screenPointToFloor(
      dragMovePointerEvent,
      findBindingById(activePointerDrag.id),
    );
    dragCurrentFloorPoint &&
      ((activePointerDrag.moved = true),
      (activePointerDrag.point = {
        x: Math.round((dragCurrentFloorPoint.x + activePointerDrag.offset.x) * 100) / 100,
        y: Math.round((dragCurrentFloorPoint.y + activePointerDrag.offset.y) * 100) / 100,
      }),
      activeModule === "light" &&
        Object.assign(findBindingById(activePointerDrag.id), activePointerDrag.point),
      renderMarkerPositions(true));
  }
  function cancelMarkerDrag() {
    (activePointerDrag &&
      activeModule === "light" &&
      Object.assign(findBindingById(activePointerDrag.id), activePointerDrag.original),
      (activePointerDrag = null),
      syncCameraInteraction(),
      renderMarkerPositions(true));
  }
  let pointerGesture: any,
    focusExitPointer: any = null;
  const getPointerSlop = (slopPointerEvent: any) => (slopPointerEvent.pointerType === "touch" ? 8 : 5);
  (canvasElement.addEventListener(
    "pointerdown",
    (stageDownEvent: any) => {
      if (!(
        stageDownEvent.isPrimary === false ||
        (stageDownEvent.button != null && stageDownEvent.button !== 0) ||
        isRangeEditorOpen ||
        followVacuumId ||
        activePointerDrag ||
        (!isControlReady && !isEditing && !isAwaitingFloorViewAdjust) ||
        focusedItemId ||
        panelDisplayMode
      )) {
        if (cameraMotionSnapshot?.owner === "floor") {
          if (
            !(cameraMotionSnapshot.amount >= 0.999) ||
            !cameraMotionSnapshot.presentationRevealed ||
            !cameraMotionSnapshot.markersRevealed
          )
            return;
          const closingCameraMotion = cameraMotionSnapshot;
          ((cameraMotionSnapshot = null),
            mountOptions.advanceFloorTransition?.(1, mountOptions.cameraState()),
            mountOptions.endCameraMotion(),
            closingCameraMotion.done?.(),
            mountOptions.setOrbitPivot(null),
            syncCameraInteraction(),
            syncAvailability(),
            wakeSceneBackground());
          return;
        }
        cameraMotionSnapshot?.owner !== "focus" ||
          cameraMotionSnapshot.focused ||
          ((focusExitPointer = {
            motion: cameraMotionSnapshot,
            pointerId: stageDownEvent.pointerId,
            x: stageDownEvent.clientX,
            y: stageDownEvent.clientY,
            slop: getPointerSlop(stageDownEvent),
            returnCamera: idleReturnCamera,
          }),
          (cameraMotionSnapshot = null),
          mountOptions.endCameraMotion(),
          syncCameraInteraction(),
          wakeSceneBackground());
      }
    },
    {
      capture: true,
    },
  ),
    canvasElement.addEventListener(
      "pointermove",
      (stageMoveEvent: any) => {
        const pendingFocusExitPointer = focusExitPointer;
        !pendingFocusExitPointer ||
          stageMoveEvent.pointerId !== pendingFocusExitPointer.pointerId ||
          Math.hypot(
            stageMoveEvent.clientX - pendingFocusExitPointer.x,
            stageMoveEvent.clientY - pendingFocusExitPointer.y,
          ) < pendingFocusExitPointer.slop ||
          ((focusExitPointer = null),
          !cameraMotionSnapshot &&
            !panelDisplayMode &&
            idleReturnCamera === pendingFocusExitPointer.returnCamera &&
            ((idleReturnCamera = null),
            mountOptions.setOrbitPivot(null),
            exitFollowMode(),
            syncAvailability()));
      },
      {
        capture: true,
      },
    ));
  const releaseFocusExit = (releasePointerEvent: any) => {
    const releasedFocusExitPointer = focusExitPointer;
    !releasedFocusExitPointer ||
      releasePointerEvent.pointerId !== releasedFocusExitPointer.pointerId ||
      ((focusExitPointer = null),
      !cameraMotionSnapshot &&
        !panelDisplayMode &&
        idleReturnCamera === releasedFocusExitPointer.returnCamera &&
        startCameraMotion(
          releasedFocusExitPointer.motion.to,
          false,
          false,
          releasedFocusExitPointer.motion.done,
        ));
  };
  (canvasElement.addEventListener("pointerup", releaseFocusExit, {
    capture: true,
  }),
    canvasElement.addEventListener("pointercancel", releaseFocusExit, {
      capture: true,
    }),
    window.addEventListener("blur", () => {
      focusExitPointer &&
        releaseFocusExit({
          pointerId: focusExitPointer.pointerId,
        });
    }),
    window.addEventListener("homeos:display-view-lock", () => {
      syncCameraInteraction();
    }),
    window.addEventListener("homeos:display-reset-camera", () => {
      try {
        mountOptions.setCameraView?.("free");
      } catch {
        /* ignore */
      }
      syncCameraInteraction();
    }),
    canvasElement.addEventListener("pointerdown", (gestureStartEvent: any) => {
      pointerGesture =
        (gestureStartEvent.button == null || gestureStartEvent.button === 0) &&
        gestureStartEvent.isPrimary !== false
          ? {
              x: gestureStartEvent.clientX,
              y: gestureStartEvent.clientY,
              id: gestureStartEvent.pointerId,
              slop: getPointerSlop(gestureStartEvent),
              moved: false,
            }
          : null;
    }),
    canvasElement.addEventListener("pointermove", (gestureMoveEvent: any) => {
      (pointerGesture &&
        (gestureMoveEvent.pointerId !== pointerGesture.id ||
          Math.hypot(
            gestureMoveEvent.clientX - pointerGesture.x,
            gestureMoveEvent.clientY - pointerGesture.y,
          ) >= pointerGesture.slop) &&
        (pointerGesture.moved = true),
        pointerGesture?.moved &&
          !isRangeEditorOpen &&
          sceneBackgroundController.interact(gestureMoveEvent, undefined));
    }),
    canvasElement.addEventListener(
      "wheel",
      (stageWheelEvent: any) => {
        isRangeEditorOpen || sceneBackgroundController.interact(stageWheelEvent, undefined);
      },
      {
        passive: true,
      },
    ),
    canvasElement.addEventListener("pointercancel", () => {
      pointerGesture = null;
    }),
    canvasElement.addEventListener("pointerup", (stageUpEvent: any) => {
      const isTap =
        pointerGesture &&
        !pointerGesture.moved &&
        pointerGesture.id === stageUpEvent.pointerId &&
        Math.hypot(
          stageUpEvent.clientX - pointerGesture.x,
          stageUpEvent.clientY - pointerGesture.y,
        ) < pointerGesture.slop;
      if (((pointerGesture = null), !isTap || followVacuumId || panelDisplayMode === "edit"))
        return;
      if (panelDisplayMode && panelDisplayMode !== "panel" && !isEditing) {
        exitFocusMode();
        return;
      }
      if (!isEditing && isOverviewOrAllFloors()) return;
      const isScenePickable =
        !cameraMotionSnapshot ||
        (cameraMotionSnapshot.owner === "focus" &&
          !cameraMotionSnapshot.focused &&
          !focusedItemId &&
          !panelDisplayMode);
      if (
        activeModule === "security" &&
        !isEditing &&
        !isAwaitingFloorViewAdjust &&
        isControlReady &&
        isScenePickable
      ) {
        const pick = presenceScene.pick(
          stageUpEvent.clientX,
          stageUpEvent.clientY,
          mountOptions.camera,
          canvasElement,
          options.security?.presenceSensors || [],
          mediaViewportSize,
        );
        if (pick) {
          focusMarkerById("presence:" + pick);
          return;
        }
      }
      if (
        !isOverviewOrAllFloors() &&
        activeModule !== "light" &&
        !isAwaitingFloorViewAdjust &&
        isScenePickable &&
        (isEditing || isControlReady)
      ) {
        const pickedEnvironmentModel = mountOptions.pickEnvironmentModel?.(
            stageUpEvent.clientX,
            stageUpEvent.clientY,
            expandGroupMembers(currentModuleBindings()),
            (stageUpEvent.pointerType === "touch" ? 10 : 5) *
              Math.min(value?.x || 1, value?.y || 1),
          ),
          matchedMarkerItem =
            pickedEnvironmentModel &&
            expandGroupMembers(currentModuleBindings()).find(
              (matchedMarkerFilterItem: any) =>
                matchedMarkerFilterItem.floorId === pickedEnvironmentModel.floorId &&
                matchedMarkerFilterItem.modelId === pickedEnvironmentModel.modelId,
            ),
          pickedMarkerEntry =
            matchedMarkerItem && findBindingById(matchedMarkerItem.entryId || matchedMarkerItem.id);
        if (pickedMarkerEntry) {
          activateMarker(pickedMarkerEntry.id);
          return;
        }
      }
      exitFocusMode();
    }),
    window.addEventListener("keydown", (stageKeydownEvent) => {
      stageKeydownEvent.key === "Escape" && exitFocusMode();
    }));
  let lastRenderSignature = "";
  const stageHandlersHost: StageHandlersHost = {
    activateMarker,
    get activeCameraPose() { return activeCameraPose; },
    set activeCameraPose(v: any) { activeCameraPose = v; },
    get activeModule() { return activeModule; },
    set activeModule(v: any) { activeModule = v; },
    activePointerDrag,
    advanceCameraMotion,
    airerMotion,
    animationFrameRequestId,
    applyDefaultCamera,
    applyLightStates,
    get baseStageConfig() { return baseStageConfig; },
    set baseStageConfig(v: any) { baseStageConfig = v; },
    beginMarkerDrag,
    brightnessSlider,
    buildFloorCameraConfig,
    buildLockMotionInput,
    get cachedDocumentFloorId() { return cachedDocumentFloorId; },
    set cachedDocumentFloorId(v: any) { cachedDocumentFloorId = v; },
    get cachedDocumentSource() { return cachedDocumentSource; },
    set cachedDocumentSource(v: any) { cachedDocumentSource = v; },
    get cameraMotionSnapshot() { return cameraMotionSnapshot; },
    set cameraMotionSnapshot(v: any) { cameraMotionSnapshot = v; },
    get cameraQuaternionKey() { return cameraQuaternionKey; },
    set cameraQuaternionKey(v: any) { cameraQuaternionKey = v; },
    get canEditLightRange() { return canEditLightRange; },
    set canEditLightRange(v: any) { canEditLightRange = v; },
    cancelGhostAnimation,
    cancelMarkerDrag,
    canvasElement,
    carCharging,
    climatePanel,
    configureIdleBehaviors,
    get configuredModuleKinds2() { return configuredModuleKinds2; },
    set configuredModuleKinds2(v: any) { configuredModuleKinds2 = v; },
    containerViewportSize,
    controlErrorElement,
    coverControlRequestsByRequestId,
    coverFeedback,
    coverGroupPanel,
    coverPanel,
    currentModuleBindings,
    curtainMotion,
    devicePanel,
    get deviceStates() { return deviceStates; },
    set deviceStates(v: any) { deviceStates = v; },
    deviceStatusElement,
    dreamTiltFeedback,
    get editingVacuumId() { return editingVacuumId; },
    set editingVacuumId(v: any) { editingVacuumId = v; },
    editorSelectionOutlines,
    element,
    endMarkerDrag,
    entries,
    environmentAirflow,
    environmentScene,
    exitFocusMode,
    failCoverRequest,
    fanMotion,
    findBindingById,
    focusExitPointer,
    focusMarkerById,
    focusedItemId,
    followToggleButton,
    followVacuumId,
    get furthestFloorOrder() { return furthestFloorOrder; },
    set furthestFloorOrder(v: any) { furthestFloorOrder = v; },
    getFocusedEntry,
    get hasAutoSelectedFloors() { return hasAutoSelectedFloors; },
    set hasAutoSelectedFloors(v: any) { hasAutoSelectedFloors = v; },
    get hasIdleIconActivity() { return hasIdleIconActivity; },
    set hasIdleIconActivity(v: any) { hasIdleIconActivity = v; },
    get hasPresentedOnce() { return hasPresentedOnce; },
    set hasPresentedOnce(v: any) { hasPresentedOnce = v; },
    hasStageRect,
    idleFocusExitControl,
    get idleIconDelayUntilMs() { return idleIconDelayUntilMs; },
    set idleIconDelayUntilMs(v: any) { idleIconDelayUntilMs = v; },
    idleIconVisibilityControl,
    idleReturnCamera,
    idleRotationControl,
    get isAwaitingFloorViewAdjust() { return isAwaitingFloorViewAdjust; },
    set isAwaitingFloorViewAdjust(v: any) { isAwaitingFloorViewAdjust = v; },
    isCameraMoving,
    isControlBusy,
    get isControlReady() { return isControlReady; },
    set isControlReady(v: any) { isControlReady = v; },
    get isEditing() { return isEditing; },
    set isEditing(v: any) { isEditing = v; },
    get isIdleIconHidden() { return isIdleIconHidden; },
    set isIdleIconHidden(v: any) { isIdleIconHidden = v; },
    isIdleRotationRunning,
    isLockLabelShown,
    get isNavigationVisible() { return isNavigationVisible; },
    set isNavigationVisible(v: any) { isNavigationVisible = v; },
    get isPointerHeld() { return isPointerHeld; },
    set isPointerHeld(v: any) { isPointerHeld = v; },
    get isPresenceEditing() { return isPresenceEditing; },
    set isPresenceEditing(v: any) { isPresenceEditing = v; },
    get isPresencePressed() { return isPresencePressed; },
    set isPresencePressed(v: any) { isPresencePressed = v; },
    get isPresentedVisible() { return isPresentedVisible; },
    set isPresentedVisible(v: any) { isPresentedVisible = v; },
    get isRangeEditorOnly() { return isRangeEditorOnly; },
    set isRangeEditorOnly(v: any) { isRangeEditorOnly = v; },
    isRangeEditorOpen,
    get isRangeEditorSuppressingClose() { return isRangeEditorSuppressingClose; },
    set isRangeEditorSuppressingClose(v: any) { isRangeEditorSuppressingClose = v; },
    get isStagePresented() { return isStagePresented; },
    set isStagePresented(v: any) { isStagePresented = v; },
    get isStageVisible() { return isStageVisible; },
    set isStageVisible(v: any) { isStageVisible = v; },
    get lastIdleFloorId() { return lastIdleFloorId; },
    set lastIdleFloorId(v: any) { lastIdleFloorId = v; },
    get lastIdleFrameMs() { return lastIdleFrameMs; },
    set lastIdleFrameMs(v: any) { lastIdleFrameMs = v; },
    lastInteractionMs,
    get lastQuaternionMs() { return lastQuaternionMs; },
    set lastQuaternionMs(v: any) { lastQuaternionMs = v; },
    get lastRenderSignature() { return lastRenderSignature; },
    set lastRenderSignature(v: any) { lastRenderSignature = v; },
    layoutPresenceHitBoxes,
    lightColorPicker,
    lightControlsElement,
    get lightEditPreview() { return lightEditPreview; },
    set lightEditPreview(v: any) { lightEditPreview = v; },
    lightGroupByKey,
    lightModeMenu,
    lightPanelHeader,
    lightPanelSection,
    lightPresetRecords,
    lightPresetsElement,
    lightTitleElement,
    list,
    lockMotion,
    lockPanel,
    map,
    markerLayerElement,
    matchesSelectedFloor,
    mediaControlRequestsByRequestId,
    get mediaViewportSize() { return mediaViewportSize; },
    set mediaViewportSize(v: any) { mediaViewportSize = v; },
    moduleEmptyElement,
    mountOptions,
    moveMarkerDrag,
    nasPanel,
    nasStatus,
    get navigationEditing() { return navigationEditing; },
    set navigationEditing(v: any) { navigationEditing = v; },
    nextCoverFeedbackDelay,
    noopStageCallback,
    normalizeCameraPose,
    openRangeEditor,
    get options() { return options; },
    set options(v: any) { options = v; },
    outgoingGhostAnimation,
    pageBehavior,
    get panelDisplayMode() { return panelDisplayMode; },
    set panelDisplayMode(v: any) { panelDisplayMode = v; },
    pendingControlRequestsByRequestId,
    get pendingEditorAction() { return pendingEditorAction; },
    set pendingEditorAction(v: any) { pendingEditorAction = v; },
    get pendingFloorId() { return pendingFloorId; },
    set pendingFloorId(v: any) { pendingFloorId = v; },
    get pendingModule() { return pendingModule; },
    set pendingModule(v: any) { pendingModule = v; },
    powerButton,
    presenceScene,
    presenceWaves,
    pruneTiltPreviews,
    rangeEditorHandle,
    readCoverFeedback,
    readLightState,
    rebuildCurtainMotion,
    refreshStageUi,
    releaseFocusExit,
    resolveDeviceState,
    resolveLightState,
    restoreFocusWithin,
    revealFollowCamera,
    get sceneBackground() {
      return sceneBackground;
    },
    set sceneBackground(v: any) {
      sceneBackground = v;
    },
    sceneBackgroundController,
    sceneCacheByKey,
    scratchQuaternion,
    scratchVector,
    screenOutlines,
    securityAlarmOverlay,
    get selectedFloorId() { return selectedFloorId; },
    set selectedFloorId(v: any) { selectedFloorId = v; },
    get selectedLockEntry() { return selectedLockEntry; },
    set selectedLockEntry(v: any) { selectedLockEntry = v; },
    get selectedSecurityKind() { return selectedSecurityKind; },
    set selectedSecurityKind(v: any) { selectedSecurityKind = v; },
    set,
    settleClimateRequest,
    settleControlCommand,
    settleMediaRequest,
    speakerPanel,
    speakerRings,
    stageModelIndex,
    startCameraMotion,
    get startupProgress() { return startupProgress; },
    set startupProgress(v: any) { startupProgress = v; },
    stateUpdatePlanner,
    stopVacuumFollow,
    syncAirConditionerHistory,
    syncAvailability,
    syncCameraInteraction,
    syncCameraOverlay,
    syncCoverIconStates,
    syncEnvironmentLayers,
    syncIdleHold,
    syncLayoutMetrics,
    syncNasOverlay,
    syncPanelChrome,
    syncPresenceScene,
    syncStageVisibility,
    syncVacuumMap,
    syncVacuumMotion,
    televisionPanel,
    temperatureSlider,
    get text() { return text; },
    set text(v: any) { text = v; },
    toolbarElement,
    transformFloorCamera,
    updateLampButton,
    vacuumMaps,
    vacuumMotion,
    vacuumOverlayByKey,
    vacuumWorkingLayerElement,
    vector,
    wakeSceneBackground,
    waterHeaterStatusByModelType,
  };
  const updateDevicePanel = createUpdateDevicePanel(stageHandlersHost);
  stageHandlersHost.updateDevicePanel = updateDevicePanel;
  const renderMarkerPositions = createRenderMarkerPositions(stageHandlersHost);
  stageHandlersHost.renderMarkerPositions = renderMarkerPositions;
  const pickMarkerAtPoint = createPickMarkerAtPoint(stageHandlersHost);
  stageHandlersHost.pickMarkerAtPoint = pickMarkerAtPoint;
  const syncMarkers = createSyncMarkers(stageHandlersHost);
  stageHandlersHost.syncMarkers = syncMarkers;
  const handleHostMessage = createHandleHostMessage(stageHandlersHost);
  stageHandlersHost.handleHostMessage = handleHostMessage;
  const runFrame = createRunFrame(stageHandlersHost);
  stageHandlersHost.runFrame = runFrame;

  window.addEventListener("message", handleHostMessage);
  const controls = mountOptions.controls,
    cameraChangeUnsubscribe = mountOptions.onCameraChange?.(() => {
      const cameraChanged = screenOutlines.cameraChanged();
      (renderMarkerPositions(),
        layoutPresenceHitBoxes(),
        (cameraChanged || pageBehavior.hideIconsWhileRotating === true) && wakeSceneBackground());
    });
  cameraChangeUnsubscribe || controls.addEventListener("change", renderMarkerPositions);
  const resizeObserver = new ResizeObserver(syncLayoutMetrics);
  (resizeObserver.observe(element),
    resizeObserver.observe(lightPanelSection),
    resizeObserver.observe(navigationLayerElement),
    resizeObserver.observe(floorTabsElement));
  const sceneSync = mountOptions.readSceneUpdate
    ? startSceneSync2({
        eligible: () =>
          !isControlBusy &&
          isStagePresented &&
          isStageVisible &&
          !document.hidden &&
          !isEditing &&
          !isAwaitingFloorViewAdjust &&
          !isNavigationVisible &&
          !panelDisplayMode &&
          !followVacuumId &&
          !cameraMotionSnapshot &&
          !activePointerDrag &&
          !isRangeEditorOpen &&
          !isCameraMoving &&
          !lightGroupByKey.size &&
          !pendingControlRequestsByRequestId.size &&
          !coverControlRequestsByRequestId.size &&
          !mediaControlRequestsByRequestId.size &&
          !curtainMotion.isMoving() &&
          nextCoverFeedbackDelay() === Infinity &&
          !isPointerHeld &&
          !set.size &&
          !lightSyncKeySet.size &&
          performance.now() - furthestFloorOrder > 1200,
        read: (sceneReadRequest: any) => mountOptions.readSceneUpdate(sceneReadRequest),
        apply: adoptSceneUpdate,
      })
    : () => {};
  ((sceneBackground = mountOptions.createFrameLoop({
    step: (frameStepTimestamp: any) =>
      mountOptions.profileFrameWork
        ? mountOptions.profileFrameWork("stage-updates", () => runFrame(frameStepTimestamp))
        : runFrame(frameStepTimestamp),
  })),
    syncAvailability(),
    window.addEventListener("pagehide", () => {
      (stateUpdatePlanner.invalidate(),
        stageModelIndex.invalidate(),
        lockMotion.dispose(),
        mountOptions.setLockMoving?.(false),
        lockPanel.dispose(),
        securityAlarmOverlay.dispose(),
        sceneBackgroundController.dispose(),
        mountOptions.setBackgroundTheme?.(null),
        moduleTabsAnimation?.cancel(),
        (moduleTabsAnimation = null),
        cancelGhostAnimation(),
        document.removeEventListener("visibilitychange", syncVacuumMap),
        vacuumMaps.dispose(),
        vacuumMotion.dispose(),
        presenceScene.dispose(),
        presenceWaves.dispose(),
        followVacuumId && stopVacuumFollow(false));
      for (const roomTimeoutHandleRef of vacuumOverlayByKey.values())
        clearTimeout(roomTimeoutHandleRef);
      (vacuumOverlayByKey.clear(),
        (canEditLightRange = false),
        rangeEditorHandle?.dispose(),
        mountOptions.setCurtainSync?.(null),
        mountOptions.setTelevisionSync?.(null),
        mountOptions.setStartupDeviceSync?.(null),
        coverPanel.dispose(),
        coverGroupPanel.dispose(),
        curtainMotion.dispose(),
        coverFeedback.clear(),
        dreamTiltFeedback.clear(),
        tiltPreviewByCoverKey.clear());
      for (const pendingControlRequestId of mediaControlRequestsByRequestId.keys())
        settleMediaRequest(pendingControlRequestId, "页面已关闭。");
      for (const pendingSceneRequestId of coverControlRequestsByRequestId.keys())
        failCoverRequest(pendingSceneRequestId, "页面已关闭。");
      (lightModeMenu.dispose(),
        lightColorPicker.dispose(),
        lightStateCache.flush(),
        sceneSync(),
        screenOutlines.dispose(),
        editorSelectionOutlines.dispose(),
        editorSelectionElement.remove(),
        nasPanel.dispose(),
        nasStatus.dispose());
      for (const disposedStateTicker of Object.values(waterHeaterStatusByModelType))
        disposedStateTicker.dispose();
      for (const disposedGenericTicker of Object.values(entries)) disposedGenericTicker.dispose();
      (devicePanel.dispose(),
        cameraStatus.dispose(),
        speakerPanel.dispose(),
        speakerRings.dispose(),
        fanMotion.dispose(),
        airerMotion.dispose(),
        televisionPanel.dispose(),
        televisionScreens.dispose(),
        environmentAirflow.dispose(),
        environmentScene.dispose(),
        startupEffectsUnsubscribe?.(),
        carCharging.dispose(),
        climatePanel.dispose());
      for (const pendingSyncRequestId of pendingControlRequestsByRequestId.keys())
        settleClimateRequest(pendingSyncRequestId, "页面已关闭。");
      (mountOptions.finishFloorTransition?.(),
        (isControlBusy = true),
        idleRotationControl.dispose(),
        idleIconVisibilityControl.dispose(),
        idleFocusExitControl.dispose(),
        (cameraMotionSnapshot = null),
        postHostMessage({
          type: "focus-state",
          active: false,
        }));
      for (const activityEventNameRef of activityEventNames)
        window.removeEventListener(activityEventNameRef, handleActivityInput, true);
      (window.removeEventListener("blur", clearActivityState),
        document.removeEventListener?.("visibilitychange", handleVisibilityChange),
        sceneBackground.dispose(),
        cameraChangeUnsubscribe?.(),
        cameraChangeUnsubscribe || controls.removeEventListener("change", renderMarkerPositions),
        resizeObserver.disconnect(),
        lightGroupByKey.forEach((pendingCommandEntry) => clearTimeout(pendingCommandEntry.timeout)),
        lightGroupByKey.clear());
    }));
  postHostMessage({
    type: "ready",
    statePatches: true,
    metadata: buildMetadata(mountOptions, transformFloorCamera, options.floorSelection),
  });
}
