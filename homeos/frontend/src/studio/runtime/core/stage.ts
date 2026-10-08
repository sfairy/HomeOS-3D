import { syncHtmlRangeProgress } from "@app/utils/range-progress";
import { bathHeaterState as bathHeaterState2 } from "../bath-heater/bath-heater";
import { purifierState as purifierState2 } from "../purifier/purifier-state";
import { createAirerMotion as createAirerMotion2 } from "../airer/airer-motion";
import { createFanMotion as createFanMotion2 } from "../fan/fan-motion";
import { carState as carState2 } from "../vehicle/car-state";
import { updateCarCard as updateCarCard2 } from "../vehicle/car-card";
import { createCarCharging as createCarCharging2 } from "../vehicle/car-charging";
import { speakerState as speakerState2 } from "../speaker/speaker-state";
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
  import("@app/bridge/page-appearance-presets"),
  import("@app/bridge/region-lighting-presets"),
  import("@app/bridge/light-effect-policy"),
  import("@app/bridge/temperature-humidity"),
  import("@app/bridge/popup-placement"),
  import("./marker-input"),
  import("@app/bridge/button-icon-size"),
  import("@app/bridge/card-text-size"),
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
  overlayEligibleAlarms,
  renderSecurityAlarmCard,
  securityAlarmReading,
  securityAlarmReadings,
} from "../security/security-alarm";
import {
  doorModels as doorModels2,
  lockState as lockState2,
} from "../security/lock-state";
import { createSceneBackground as createSceneBackground2 } from "./scene-background";
import { floorNavigationChoices as floorNavigationChoices2 } from "./floor-navigation";
import {
  createVacuumMotion as createVacuumMotion2,
  vacuumQuip as vacuumQuip2,
  createVacuumFollowCamera as createVacuumFollowCamera2,
  vacuumBirdCamera as vacuumBirdCamera2,
  vacuumFollowPose as vacuumFollowPose2,
} from "../vacuum/vacuum-motion";
import {
  createVacuumMaps as createVacuumMaps2,
  vacuumStatusPresentation as vacuumStatusPresentation2,
  vacuumBindingsForMap as vacuumBindingsForMap2,
} from "../vacuum/vacuum-map";
import {
  televisionState as televisionState2,
  televisionPower as televisionPower2,
} from "../television/television-state";
import { createTelevisionPanel as createTelevisionPanel2 } from "../television/television-panel";
import { createTelevisionScreens as createTelevisionScreens2 } from "../television/television-screen";
import { createDevicePanel as createDevicePanel2 } from "../device/device-panel";
import { deviceStatus as deviceStatus2 } from "../device/device-status";
import {
  GENERIC_DEVICE_KINDS as GENERIC_DEVICE_KINDS2,
  genericDeviceProfile as genericDeviceProfile2,
  isGenericDeviceKind as isGenericDeviceKind2,
} from "../device/device-profiles";
import { createNasPanel as createNasPanel2 } from "../nas/nas-panel";
import {
  createNasStatus as createNasStatus2,
  nasDeviceState as nasDeviceState2,
} from "../nas/nas-status";
import {
  createCameraStatus as createCameraStatus2,
  cameraOnline as cameraOnline2,
} from "../camera/camera-status";
import {
  coverState as coverState2,
  coverControl as coverControl2,
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
import { mountRegionRangeEditor as mountRegionRangeEditor2 } from "../editor/light-range-editor";
import {
  climateState as climateState2,
  createClimateModeHistory as createClimateModeHistory2,
} from "../climate/climate-state";
import { createClimatePanel as createClimatePanel2 } from "../climate/climate-panel";
import {
  createEnvironmentScene as createEnvironmentScene2,
  pageDimming as pageDimming2,
  pageModelBindings as pageModelBindings2,
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
  hsToRgbColor as hsToRgbColor2,
  lightCommand as lightCommand2,
  createLightPreview as createLightPreview2,
  createLightStateCache as createLightStateCache2,
  lightRenderState as lightRenderState2,
} from "../light/light-state";
import {
  createDampedCameraMotion as createDampedCameraMotion2,
  automaticLightCamera as automaticLightCamera2,
  automaticAirConditionerCamera as automaticAirConditionerCamera2,
} from "../camera/camera-motion";
import {
  resolvePageBehavior as resolvePageBehavior2,
  createIdleRotation as createIdleRotation2,
  createIdleIconVisibility as createIdleIconVisibility2,
  createIdleFocusExit as createIdleFocusExit2,
} from "./idle-rotation";
import {
  lampIconSvgMarkup,
  lightPresetEntries,
  resolveMarkerIconSize,
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
import { buildFloorCameraConfig as buildFloorCameraConfigExternal } from "./stage/floor-camera-config";
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
    } catch {}


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
  function buildSliderControl(sliderLabelText: any, sliderKey: any, sliderMin: any, sliderMax: any) {
    const sliderFieldLabel = createStageElement("label", "i3d-slider i3d-" + sliderKey),
      sliderNameElement = createStageElement("span", "", sliderLabelText),
      sliderOutputElement = createStageElement("output"),
      rangeInput = createStageElement("input");
    ((rangeInput.name = "i3d-light-" + sliderKey),
      (rangeInput.type = "range"),
      rangeInput.classList.add("i3d-control-range"),
      (rangeInput.min = sliderMin),
      (rangeInput.max = sliderMax),
      (rangeInput.step = sliderKey === "temperature" ? "10" : "1"),
      rangeInput.setAttribute("aria-label", sliderLabelText));
    const syncSliderProgress = () => {
      const progressCss = syncHtmlRangeProgress(rangeInput);
      if (sliderKey === "brightness") {
        rangeInput.style.background = `linear-gradient(90deg, #d6ae65 0%, #d6ae65 ${progressCss}, #3a342c ${progressCss}, #3a342c 100%)`;
      } else if (sliderKey === "temperature") {
        rangeInput.style.background = `linear-gradient(90deg, transparent 0%, transparent ${progressCss}, #3a342c ${progressCss}, #3a342c 100%), linear-gradient(90deg, #eaa95b, #f1e1bf, #b8d6f4)`;
      }
    };
    const sliderHeadingElement = createStageElement("div", "i3d-slider-heading");
    sliderHeadingElement.append(sliderNameElement, sliderOutputElement);
    const sliderLegendElement = createStageElement("span", "i3d-slider-legend");
    return (
      sliderLegendElement.append(
        createStageElement("small", "", sliderKey === "temperature" ? "暖色" : "暗"),
        createStageElement("small", "", sliderKey === "temperature" ? "冷色" : "亮"),
      ),
      sliderFieldLabel.append(sliderHeadingElement, rangeInput, sliderLegendElement),
      rangeInput.addEventListener("input", () => {
        (syncSliderProgress(),
          (sliderOutputElement.value =
            "" + rangeInput.value + (sliderKey === "temperature" ? " K" : "%")));
        const interactiveLightEntry = getFocusedEntry();
        !interactiveLightEntry ||
          isEditing ||
          !resolveLightState(interactiveLightEntry).available ||
          (vector.set(interactiveLightEntry.entityId, sliderKey, Number(rangeInput.value)),
          wakeSceneBackground(),
          updateDevicePanel(),
          applyLightStates({
            preview: true,
          }));
      }),
      rangeInput.addEventListener(
        "change",
        () => void runLightCommand(sliderKey, Number(rangeInput.value)),
      ),
      syncSliderProgress(),
      lightControlsElement.append(sliderFieldLabel),
      {
        root: sliderFieldLabel,
        input: rangeInput,
        value: sliderOutputElement,
        syncProgress: syncSliderProgress,
      }
    );
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
    } catch {}
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
              coverReject(new Error("只有确认整体完全关闭且停止后，才能调整叶片。")));
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
  function rebuildCurtainMotion() {
    const modelRoot = mountOptions.modelRoot,
      sceneRevision = mountOptions.sceneRevision,
      document2 = mountOptions.document;
    if (
      curtainSyncSnapshot?.config === options &&
      curtainSyncSnapshot.states === deviceStates &&
      curtainSyncSnapshot.root === modelRoot &&
      curtainSyncSnapshot.revision === sceneRevision &&
      curtainSyncSnapshot.source === document2
    ) {
      syncCoverIconStates();
      return;
    }
    curtainSyncSnapshot = {
      config: options,
      states: deviceStates,
      root: modelRoot,
      revision: sceneRevision,
      source: document2,
    };
    const coverBindings = [...collectCoverBindings(), ...collectPreviewCovers()];
    ((trackedCoverBindings = coverBindings),
      (list = [
        ...new Set(coverBindings.map((coverBinding) => coverBinding.floorId).filter(Boolean)),
      ]),
      curtainMotion.setBindings(
        modelRoot,
        coverBindings.filter((airerFilterBinding) => !airerFilterBinding.airer),
        sceneRevision,
      ),
      coverFeedback.retain(coverBindings.map(computeCoverKey)));
    const dreamCoverKeys = coverBindings
      .filter((dreamBinding) => dreamBinding.coverKind === "dream")
      .map(computeCoverKey);
    dreamTiltFeedback.retain(dreamCoverKeys);
    for (const staleCoverKey of tiltPreviewByCoverKey.keys())
      dreamCoverKeys.includes(staleCoverKey) || tiltPreviewByCoverKey.delete(staleCoverKey);
    for (const coverBindingForSync of coverBindings) {
      const coverStateSnapshot = coverState2(
        coverBindingForSync.entityId,
        (deviceStates as any)[coverBindingForSync.entityId],
        coverBindingForSync,
      );
      (coverBindingForSync.coverKind === "dream" &&
        dreamTiltFeedback.sync(computeCoverKey(coverBindingForSync), {
          ...coverStateSnapshot,
          dream: false,
          overallFeedbackAvailable: true,
          axis: "blade",
          state: "open",
          position: coverStateSnapshot.tiltPosition,
          opening: false,
          closing: false,
          moving: false,
        }),
        coverFeedback.sync(computeCoverKey(coverBindingForSync), coverStateSnapshot));
    }
    (pruneTiltPreviews(),
      syncCoverIconStates(),
      mountOptions.curtainFrame?.({
        key: curtainMotion.poseKey(),
        structure: curtainMotion.structureKey(),
        floorIds: list,
        moving:
          startupProgress > 0 &&
          (curtainMotion.isMoving() || nextCoverFeedbackDelay() <= 1000 / 30),
      }));
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
  function syncNasOverlay() {
    const isNasOverlayEnabled =
        startupProgress > 0 && !isAwaitingFloorViewAdjust && !isRangeEditorOpen,
      modelRoot3 = mountOptions.modelRoot,
      sceneRevision3 = mountOptions.sceneRevision,
      nasSizeScale = selectedFloorId === "all" ? 0.75 : 1,
      nasBrightnessScale =
        selectedFloorId !== "all" &&
        (["devices", "nas", "television", "speaker", "water-heater"].includes(activeModule) ||
          isGenericDeviceKind2(activeModule))
          ? 1
          : 0.6;
    if (!(
      nasSyncSnapshot?.root === modelRoot3 &&
      nasSyncSnapshot.revision === sceneRevision3 &&
      nasSyncSnapshot.config === options &&
      nasSyncSnapshot.states === deviceStates &&
      nasSyncSnapshot.enabled === isNasOverlayEnabled &&
      nasSyncSnapshot.sizeScale === nasSizeScale &&
      nasSyncSnapshot.brightness === nasBrightnessScale
    )) {
      ((nasSyncSnapshot = {
        root: modelRoot3,
        revision: sceneRevision3,
        config: options,
        states: deviceStates,
        enabled: isNasOverlayEnabled,
        sizeScale: nasSizeScale,
        brightness: nasBrightnessScale,
      }),
        nasStatus.sync({
          root: modelRoot3,
          revision: sceneRevision3,
          bindings: collectNasBindings(),
          states: deviceStates,
          enabled: isNasOverlayEnabled,
          sizeScale: nasSizeScale,
          brightness: nasBrightnessScale,
        }));
      for (const waterHeaterStatus of Object.values(waterHeaterStatusByModelType))
        waterHeaterStatus.sync({
          root: modelRoot3,
          revision: sceneRevision3,
          bindings: options.environment?.waterHeaters || [],
          states: deviceStates,
          enabled: isNasOverlayEnabled,
          sizeScale: nasSizeScale,
          brightness: nasBrightnessScale,
        });
      for (const statusGenericDeviceKind of GENERIC_DEVICE_KINDS2)
        entries[statusGenericDeviceKind].sync({
          root: modelRoot3,
          revision: sceneRevision3,
          bindings: collectGenericDeviceBindings(statusGenericDeviceKind),
          states: deviceStates,
          enabled: isNasOverlayEnabled,
          sizeScale: nasSizeScale,
          brightness: nasBrightnessScale,
        });
    }
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
  function syncEnvironmentLayers() {
    if (startupProgress === 0) return;
    const modelRoot4 = mountOptions.modelRoot,
      sceneRevision4 = mountOptions.sceneRevision,
      environmentRevision = mountOptions.environmentRevision ?? sceneRevision4,
      document3 = mountOptions.document;
    (!environmentSyncSnapshot ||
      environmentSyncSnapshot.root !== modelRoot4 ||
      environmentSyncSnapshot.revision !== sceneRevision4 ||
      environmentSyncSnapshot.environmentRevision !== environmentRevision ||
      environmentSyncSnapshot.source !== document3 ||
      environmentSyncSnapshot.config !== options ||
      environmentSyncSnapshot.states !== deviceStates) &&
      (speakerRings.sync({
        root: modelRoot4,
        revision: sceneRevision4,
        bindings: collectSpeakerBindings(),
        states: deviceStates,
      }),
      carCharging.sync({
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
      }),
      fanMotion.sync({
        root: modelRoot4,
        revision: environmentRevision,
        bindings: options.environment?.fans || [],
        states: deviceStates,
      }),
      (environmentSyncSnapshot = {
        root: modelRoot4,
        revision: sceneRevision4,
        environmentRevision: environmentRevision,
        source: document3,
        config: options,
        states: deviceStates,
      }));
    const focusedModelKey =
      activeModule !== "light" && !isAwaitingFloorViewAdjust && !isRangeEditorOpen
        ? isEditing
          ? text
          : focusedItemId
        : "";
    (televisionSyncSnapshot?.root === modelRoot4 &&
      televisionSyncSnapshot.revision === sceneRevision4 &&
      televisionSyncSnapshot.config === options &&
      televisionSyncSnapshot.states === deviceStates &&
      televisionSyncSnapshot.focused === focusedModelKey &&
      televisionSyncSnapshot.module === activeModule) ||
      ((televisionSyncSnapshot = {
        root: modelRoot4,
        revision: sceneRevision4,
        config: options,
        states: deviceStates,
        focused: focusedModelKey,
        module: activeModule,
      }),
      televisionScreens.sync({
        root: modelRoot4,
        revision: sceneRevision4,
        bindings: collectTelevisionBindings(),
        states: deviceStates,
        focusedModel: "",
        dimStrength: 0,
      }));
  }
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
  function updateEditorSelection() {
    const editorSelectionEntry = isEditing
      ? currentModuleBindings().find(
          (editorTargetEntry: any) =>
            editorTargetEntry.id === text || editorTargetEntry.entryId === text,
        )
      : null;
    editorSelectionElement.hidden = !isEditing;
    const deviceKindLabels = {
        light: "灯光",
        climate: "空调/浴霸",
        fan: "电风扇",
        purifier: "空气净化器",
        "water-heater": "热水器",
        airer: "晾衣架",
        cover: "窗帘",
        nas: "NAS",
        speaker: "智能音响",
        television: "电视",
        vacuum: "扫地机",
        "vacuum-shortcut": "快捷按钮",
        "temperature-humidity": "环境标签",
        lock: "门",
        camera: "摄像头",
        presence: "人体传感器",
        alarm: "安防传感器",
        moisture: "水浸",
        smoke: "烟雾",
        gas: "天然气",
      },
      editorSelectionKind = activeModule === "security" ? selectedSecurityKind : activeModule,
      editorSelectionFloor = mountOptions.document.floors.find(
        (editorSelectionFloorModel: any) =>
          editorSelectionFloorModel.id === editorSelectionEntry?.floorId,
      ),
      editorSelectionModels = editorSelectionEntry
        ? activeModule === "light"
          ? (editorSelectionFloor?.scene?.items || [])
              .filter(
                (editorLightItem: any) => editorLightItem.lightGroupId === editorSelectionEntry.groupId,
              )
              .map((editorModelItem: any) => ({
                floorId: editorSelectionFloor.id,
                modelId: editorModelItem.id,
              }))
          : expandGroupMembers([editorSelectionEntry]).filter(
              (editorModelCandidate: any) => editorModelCandidate.modelId,
            )
        : [];
    ((editorSelectionElement.textContent = editorSelectionEntry
      ? "正在配置：" +
        ((deviceKindLabels as any)[editorSelectionKind] ||
          genericDeviceProfile2(editorSelectionKind)?.label ||
          "设备") +
        " · " +
        (editorSelectionEntry.label ||
          editorSelectionEntry.deviceName ||
          editorSelectionEntry.entityId ||
          "未命名") +
        (editorSelectionFloor?.name ? " · " + editorSelectionFloor.name : "") +
        (editorSelectionModels.length > 1 ? " · " + editorSelectionModels.length + " 个模型" : "")
      : "请选择要配置的对象"),
      editorSelectionOutlines.sync(
        mountOptions.modelRoot,
        mountOptions.environmentRevision ?? mountOptions.sceneRevision,
        editorSelectionModels,
        !!(
          isEditing &&
          editorSelectionEntry &&
          editorSelectionEntry.deviceKind !== "smallcar" &&
          !mountOptions.floorTransitionActive
        ),
      ),
      editorSelectionOutlines.update());
  }
  function collectClimateBindings() {
    return [
      ...(options.environment?.airConditioners || []),
      ...(options.environment?.fans || []),
      ...(options.environment?.airPurifiers || []),
      ...(options.environment?.waterHeaters || []),
    ].map((climateSourceEntry) => {
      const climateModel = stageModelIndex.item(
        climateSourceEntry.floorId,
        climateSourceEntry.modelId,
        options.environment?.waterHeaters?.includes(climateSourceEntry)
          ? ["storagewaterheater", "gaswaterheater"]
          : options.environment?.fans?.includes(climateSourceEntry)
            ? ["fan"]
            : options.environment?.airPurifiers?.includes(climateSourceEntry)
              ? ["airpurifier"]
              : ["wallac", "floorac", "airoutlet"],
      );
      return {
        ...climateSourceEntry,
        pedestalFan: (options.environment?.fans || []).includes(climateSourceEntry),
        waterHeater: (options.environment?.waterHeaters || []).includes(climateSourceEntry),
        airPurifier: (options.environment?.airPurifiers || []).includes(climateSourceEntry),
        deviceKind: "climate",
        x: Number.isFinite(climateSourceEntry.x) ? climateSourceEntry.x : (climateModel?.x ?? 0),
        y: Number.isFinite(climateSourceEntry.y) ? climateSourceEntry.y : (climateModel?.y ?? 0),
        height: Number.isFinite(climateSourceEntry.height)
          ? climateSourceEntry.height
          : climateModel
            ? (Number(climateModel.elevation) || 0) + (Number(climateModel.height) || 0.28) / 2
            : 0,
        modelAvailable: !!climateModel,
        icon:
          climateSourceEntry.icon ||
          (options.environment?.waterHeaters?.includes(climateSourceEntry)
            ? "mdi:water-boiler"
            : options.environment?.fans?.includes(climateSourceEntry)
              ? "mdi:fan"
              : options.environment?.airPurifiers?.includes(climateSourceEntry)
                ? "mdi:air-purifier"
                : "mdi:air-conditioner"),
      };
    });
  }
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
  function collectModuleBindings() {
    const temperatureHumidityBindings = (options.environment?.temperatureHumidity || []).map(
      (temperatureHumidityEntry: any) => ({
        ...temperatureHumidityEntry,
        deviceKind: "temperature-humidity",
      }),
    );
    return isOverviewOrAllFloors()
      ? []
      : activeModule === "security"
        ? collectSecurityBindings()
        : activeModule === "vacuum-shortcut"
          ? collectVacuumShortcuts().filter(
              (vacuumShortcutBinding: any) => vacuumShortcutBinding.vacuumId === editingVacuumId,
            )
          : isGenericDeviceKind2(activeModule)
            ? collectGenericDeviceBindings(activeModule)
            : activeModule === "nas"
              ? collectNasBindings()
              : activeModule === "vacuum"
                ? collectVacuumBindings()
                    .filter((visibleVacuumBinding: any) => isEditing || visibleVacuumBinding.entityId)
                    .map((vacuumModuleBinding: any) => ({
                      ...vacuumModuleBinding,
                      id: isEditing ? vacuumModuleBinding.id : "vacuum:" + vacuumModuleBinding.id,
                    }))
                : activeModule === "speaker"
                  ? collectSpeakerBindings()
                  : activeModule === "television"
                    ? collectTelevisionBindings()
                    : activeModule === "devices"
                      ? [
                          ...collectCoverBindings().filter(
                            (airerModuleBinding) => airerModuleBinding.airer,
                          ),
                          ...collectClimateBindings().filter(
                            (waterHeaterModuleBinding) => waterHeaterModuleBinding.waterHeater,
                          ),
                          ...collectNasBindings(),
                          ...collectSpeakerBindings(),
                          ...collectTelevisionBindings(),
                          ...GENERIC_DEVICE_KINDS2.flatMap((genericModuleDeviceKind) =>
                            collectGenericDeviceBindings(genericModuleDeviceKind),
                          ),
                        ].map((genericModuleBinding) => ({
                          ...genericModuleBinding,
                          id: genericModuleBinding.deviceKind + ":" + genericModuleBinding.id,
                        }))
                      : activeModule === "airer"
                        ? collectCoverBindings().filter(
                            (airerFilteredBinding) => airerFilteredBinding.airer,
                          )
                        : activeModule === "cover"
                          ? collectGroupedCovers().filter(
                              (coverFilteredBinding) => !coverFilteredBinding.airer,
                            )
                          : activeModule === "climate"
                            ? collectClimateBindings().filter((climateFilteredBinding) =>
                                (options.environment?.airConditioners || []).some(
                                  (climateFilterSource: any) =>
                                    climateFilterSource.id === climateFilteredBinding.id,
                                ),
                              )
                            : activeModule === "water-heater"
                              ? collectClimateBindings().filter((waterHeaterFilteredBinding) =>
                                  (options.environment?.waterHeaters || []).some(
                                    (waterHeaterFilterSource: any) =>
                                      waterHeaterFilterSource.id === waterHeaterFilteredBinding.id,
                                  ),
                                )
                              : activeModule === "fan"
                                ? collectClimateBindings().filter(
                                    (fanFilteredBinding) => fanFilteredBinding.pedestalFan,
                                  )
                                : activeModule === "purifier"
                                  ? collectClimateBindings().filter((purifierFilteredBinding) =>
                                      (options.environment?.airPurifiers || []).some(
                                        (purifierFilterSource: any) =>
                                          purifierFilterSource.id === purifierFilteredBinding.id,
                                      ),
                                    )
                                  : activeModule === "temperature-humidity"
                                    ? temperatureHumidityBindings
                                    : [
                                        ...collectClimateBindings().filter(
                                          (fallbackClimateBinding) =>
                                            !fallbackClimateBinding.waterHeater,
                                        ),
                                        ...collectGroupedCovers().filter(
                                          (fallbackCoverBinding) => !fallbackCoverBinding.airer,
                                        ),
                                        ...temperatureHumidityBindings,
                                      ].map((fallbackModuleBinding) => ({
                                        ...fallbackModuleBinding,
                                        id:
                                          fallbackModuleBinding.deviceKind +
                                          ":" +
                                          fallbackModuleBinding.id,
                                      }));
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
  function selectFloor(targetFloorId: any) {
    if (
      isEditing ||
      isAwaitingFloorViewAdjust ||
      isRangeEditorOpen ||
      isCameraMoving ||
      targetFloorId === selectedFloorId ||
      (targetFloorId !== "all" &&
        !mountOptions.document.floors.some((existingFloor: any) => existingFloor.id === targetFloorId))
    )
      return;
    (stopVacuumFollow(false),
      exitFocusMode({
        immediate: true,
        preserveCamera: true,
      }),
      cancelMarkerDrag());
    const cameraState = mountOptions.cameraState(true),
      orbitCenter = mountOptions.getOrbitCenter?.(),
      cameraMotionState = mountOptions.getCameraMotionState?.();
    ((pendingFloorId = targetFloorId),
      runModuleSwitchAnimation(() => {
        (syncLockMotion(), (selectedFloorId = targetFloorId));
        const transitionFloor = mountOptions.transitionFloor
            ? mountOptions.transitionFloor(targetFloorId)
            : (mountOptions.setFloor(targetFloorId), mountOptions.getOrbitCenter?.()),
          floorCameraPose = transformFloorCamera(
            baseStageConfig.floorCameras?.[targetFloorId] ||
              (targetFloorId === baseStageConfig.floorSelection ? baseStageConfig.camera : null),
            targetFloorId,
          ),
          cameraState2 =
            floorCameraPose ||
            mountOptions.floorDefaultCamera?.(targetFloorId) ||
            mountOptions.cameraState();
        ((activeCameraPose = floorCameraPose || cameraState2),
          (options = buildFloorCameraConfig({
            ...baseStageConfig,
            floorSelection: targetFloorId,
          })),
          (options.camera = activeCameraPose),
          targetFloorId === "all"
            ? ((activeModule = "overview"), (pendingModule = ""))
            : pendingModule && ((activeModule = pendingModule), (pendingModule = "")),
          syncLockMotion(),
          syncNasOverlay(),
          mountOptions.restoreCamera(cameraState, cameraMotionState),
          startCameraMotion(
            cameraState2,
            false,
            false,
            () => {
              (mountOptions.finishFloorTransition?.(),
                syncLockMotion(),
                applyLightStates(),
                refreshStageUi(),
                syncVacuumMap(),
                syncStageVisibility());
            },
            "floor",
            {
              fromPivot: orbitCenter,
              toPivot: transitionFloor,
            },
          ),
          sceneCacheByKey.clear(),
          applyLightStates({
            immediate: true,
          }),
          syncMarkers(),
          syncPanelChrome(),
          syncAvailability());
      }));
  }
  function syncLockMotion() {
    const lockMotionPlan = buildLockMotionInput();
    mountOptions.setLockMoving?.(lockMotion.sync(lockMotionPlan.bindings, lockMotionPlan.states));
  }
  function openRangeEditor(rangeEditorRequestId: any) {
    const postRangeEditorState = (isEditorActiveState: any, rangeEditorErrorMessage = "") =>
        postHostMessage({
          type: "range-editor-state",
          active: isEditorActiveState,
          ...(rangeEditorRequestId
            ? {
                requestId: rangeEditorRequestId,
              }
            : {}),
          ...(rangeEditorErrorMessage
            ? {
                error: rangeEditorErrorMessage,
              }
            : {}),
        }),
      rangeEditorBlockReason = canEditLightRange
        ? mountOptions.regionLighting
          ? isStagePresented
            ? isCameraMoving
              ? "户型正在同步，请稍候再调整照射范围。"
              : isAwaitingFloorViewAdjust
                ? "请先完成户型视角调整，再编辑照射范围。"
                : ""
            : "户型还在加载，请稍候再调整照射范围。"
          : "请先选择轻量柔光模式。"
        : "请在已授权的控件编辑器中调整照射范围。";
    if (rangeEditorBlockReason) {
      postRangeEditorState(false, rangeEditorBlockReason);
      return;
    }
    if (isRangeEditorOpen) {
      postRangeEditorState(true);
      return;
    }
    (exitFocusMode({
      immediate: true,
    }),
      (isRangeEditorOpen = true),
      (isRangeEditorSuppressingClose = true),
      syncAvailability(),
      syncCameraInteraction(),
      refreshStageUi(),
      (presentationLayerElement.style.display = "none"),
      presentationLayerElement.setAttribute("inert", ""),
      (focusVignetteElement.style.display = "none"));
    try {
      ((rangeEditorHandle ||= mountRegionRangeEditor2(mountOptions, {
        getConfig: () => options,
        standalone: isRangeEditorOnly,
        wake: wakeSceneBackground,
        onChange(rangeOverrides: any = null) {
          canEditLightRange &&
            ((options.lightRegionOverrides = structuredClone(rangeOverrides)),
            (baseStageConfig.lightRegionOverrides = structuredClone(rangeOverrides)),
            postHostMessage({
              type: "range-overrides",
              overrides: rangeOverrides,
            }));
        },
        onClose() {
          ((isRangeEditorOpen = false),
            (presentationLayerElement.style.display = ""),
            presentationLayerElement.removeAttribute("inert"),
            (focusVignetteElement.style.display = ""),
            applyLightStates({
              immediate: true,
            }),
            syncCameraInteraction(),
            refreshStageUi(),
            syncPanelChrome(),
            renderMarkerPositions(true),
            syncAvailability(),
            isRangeEditorSuppressingClose ||
              postHostMessage({
                type: "range-editor-state",
                active: false,
              }));
        },
      })),
        rangeEditorHandle.open(),
        postRangeEditorState(true));
    } catch (rangeEditorError: any) {
      (rangeEditorHandle?.close(),
        (isRangeEditorOpen = false),
        (presentationLayerElement.style.display = ""),
        presentationLayerElement.removeAttribute("inert"),
        (focusVignetteElement.style.display = ""),
        syncCameraInteraction(),
        refreshStageUi(),
        syncAvailability(),
        postRangeEditorState(false, rangeEditorError.message || "范围编辑暂时不可用"));
    } finally {
      isRangeEditorSuppressingClose = false;
    }
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
          clickAction: "focus",
          x: Number.isFinite(alarmSourceEntry.x) ? alarmSourceEntry.x : 0,
          y: Number.isFinite(alarmSourceEntry.y) ? alarmSourceEntry.y : 0,
          height: Number.isFinite(alarmSourceEntry.height) ? alarmSourceEntry.height : 1.8,
          size: Number.isFinite(alarmSourceEntry.size) ? alarmSourceEntry.size : 180,
          fontSize: Number.isFinite(alarmSourceEntry.fontSize)
            ? alarmSourceEntry.fontSize
            : 12,
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
  function refreshStageUi() {
    (updateEditorSelection(),
      configureIdleBehaviors(),
      syncPresenceScene(),
      presenceWaves.sync({
        bindings: (options.security?.presenceSensors || [])
          .filter((presenceSyncEntry: any) => !isEditing || "presence:" + presenceSyncEntry.id === text)
          .map((presenceSyncSensor: any) => {
            const presenceLayerItem = stageModelIndex.item(
              presenceSyncSensor.floorId,
              presenceSyncSensor.modelId,
            );
            return {
              ...presenceSyncSensor,
              width: presenceLayerItem?.width,
              height: presenceLayerItem?.height,
              depth: presenceLayerItem?.depth,
            };
          }),
        states: deviceStates,
        floorId: selectedFloorId,
        preview: isEditing,
        enabled:
          startupProgress > 0 &&
          activeModule === "security" &&
          !focusedItemId &&
          !panelDisplayMode &&
          !isAwaitingFloorViewAdjust &&
          !isRangeEditorOpen &&
          !mountOptions.floorTransitionActive &&
          cameraMotionSnapshot?.owner !== "floor",
      }),
      syncVacuumMap());
    const floorTransitionActive =
      mountOptions.floorTransitionActive || cameraMotionSnapshot?.owner === "floor";
    if (
      (carCharging.sync({
        root: mountOptions.modelRoot,
        revision: mountOptions.environmentRevision ?? mountOptions.sceneRevision,
        retainedRoots: mountOptions.retainedModelRoots || [],
        bindings: options.devices?.cars || [],
        states: deviceStates,
      }),
      environmentScene.setRoot(
        mountOptions.modelRoot,
        mountOptions.environmentRevision ?? mountOptions.sceneRevision,
      ),
      !floorTransitionActive || cameraMotionSnapshot?.presentationRevealed)
    ) {
      floorTransitionActive ||
        (rebuildCurtainMotion(),
        syncNasOverlay(),
        syncCameraOverlay(),
        syncEnvironmentLayers(),
        syncVacuumMotion());
      const navigationBindings = collectModuleBindings().filter(matchesSelectedFloor),
        modelBindings = expandGroupMembers(
          isEditing
            ? [
                ...navigationBindings,
                ...([
                  "climate",
                  "water-heater",
                  "devices",
                  "nas",
                  "television",
                  "speaker",
                  "vacuum",
                  ...GENERIC_DEVICE_KINDS2,
                ].includes(activeModule)
                  ? []
                  : collectPreviewCovers()),
              ]
            : [
                ...collectClimateBindings(),
                ...collectGroupedCovers(),
                ...collectNasBindings(),
                ...collectSpeakerBindings(),
                ...collectTelevisionBindings(),
                ...GENERIC_DEVICE_KINDS2.flatMap((deviceKindForBinding) =>
                  collectGenericDeviceBindings(deviceKindForBinding),
                ),
                ...collectVacuumBindings(),
                ...lockBindings(),
                ...securityCameraBindings(),
                ...presenceBindings(),
              ]
                .map((stageBinding) => ({
                  ...stageBinding,
                  id: ["lock", "camera", "presence"].includes(stageBinding.deviceKind)
                    ? stageBinding.id
                    : stageBinding.deviceKind + ":" + stageBinding.id,
                }))
                .concat(collectPreviewCovers()),
        ).filter(
          (availableStageBinding: any) =>
            availableStageBinding.modelAvailable && matchesSelectedFloor(availableStageBinding),
        ),
        pageDimming = pageDimming2(
          options,
          activeModule,
          !!focusedItemId && panelDisplayMode !== "panel",
        ),
        enabled = !isAwaitingFloorViewAdjust && !isRangeEditorOpen && pageDimming.enabled,
        isTemperatureHumidityPreview = isEditing && activeModule === "temperature-humidity",
        sceneBindings = isTemperatureHumidityPreview
          ? []
          : pageModelBindings2(
              mountOptions.document.floors,
              modelBindings,
              pageDimming.page,
              selectedFloorId,
            );
      if (isEditing && !isTemperatureHumidityPreview && text) {
        for (const sceneBinding of modelBindings)
          (sceneBinding.id === text || sceneBinding.entryId === text) &&
            !sceneBindings.some(
              (sceneBindingMatch: any) =>
                sceneBindingMatch.floorId === sceneBinding.floorId &&
                sceneBindingMatch.modelId === sceneBinding.modelId,
            ) &&
            sceneBindings.push({
              ...sceneBinding,
              visible: true,
            });
      }
      (screenOutlines.sync(
        mountOptions.modelRoot,
        mountOptions.environmentRevision ?? mountOptions.sceneRevision,
        sceneBindings.filter(
          (sceneBindingFilter: any) =>
            sceneBindingFilter.deviceKind !== "smallcar" &&
            (!text || sceneBindingFilter.id === text || sceneBindingFilter.entryId === text),
        ),
        !isEditing &&
          !focusedItemId &&
          !isAwaitingFloorViewAdjust &&
          !isRangeEditorOpen &&
          selectedFloorId !== "all" &&
          ["environment", "devices", "vacuum", "security"].includes(pageDimming.page),
      ),
        environmentAirflow.setRoot(mountOptions.modelRoot, mountOptions.sceneRevision),
        environmentScene.setMode({
          enabled: enabled,
          saturation: pageDimming.saturation,
          dimStrength: enabled ? pageDimming.strength : 0,
          bindings: sceneBindings,
          animateBindings: !isEditing && !isAwaitingFloorViewAdjust,
          states: deviceStates,
          focusedId: focusedItemId,
          selectedId: isEditing ? text : "",
        }),
        environmentAirflow.setState({
          enabled:
            startupProgress > 0 &&
            !isAwaitingFloorViewAdjust &&
            !isRangeEditorOpen &&
            !isTemperatureHumidityPreview,
          bindings: modelBindings.filter(
            (climateEnvironmentBinding: any) =>
              climateEnvironmentBinding.deviceKind === "climate" &&
              !climateEnvironmentBinding.waterHeater,
          ),
          states: deviceStates,
          focusedId: focusedItemId,
          overview: !focusedItemId || panelDisplayMode === "panel",
        }),
        mountOptions.setEnvironmentActive?.(enabled || environmentScene.isActive));
    }
    const fallbackBindings = collectModuleBindings().filter(matchesSelectedFloor);
    syncFloorTabs();

    const isNavigationDraggable = navigationEditing && isNavigationVisible;
    (moduleTabsElement.classList.toggle("is-navigation-draggable", isNavigationDraggable),
      floorTabsElement.classList.toggle("is-navigation-draggable", isNavigationDraggable),
      !isNavigationDraggable &&
        (moduleTabsElement.classList.remove("is-navigation-dragging"),
        floorTabsElement.classList.remove("is-navigation-dragging")));
    const isAllFloorsSelected = selectedFloorId === "all";
    toggleModuleTabs(
      !isNavigationVisible &&
        (isEditing || isAwaitingFloorViewAdjust || isRangeEditorOpen || isAllFloorsSelected),
    );
    const normalizedModule = ["water-heater", "airer"].includes(activeModule)
      ? "devices"
      : ["overview", "security", "light", "devices", "vacuum"].includes(activeModule)
        ? activeModule
        : "environment";
    (moduleTabsElement.classList.toggle("is-all-floors", isAllFloorsSelected),
      moduleTabsElement.style.setProperty("--i3d-tab-count", String(configuredModuleKinds2.length)),
      moduleTabsElement.style.setProperty(
        "--i3d-selected-tab",
        String(Math.max(0, configuredModuleKinds2.indexOf(normalizedModule))),
      ));
    for (const [tabModuleKind, moduleTabElement] of moduleTabsByKind) {
      const indexOf = configuredModuleKinds2.indexOf(tabModuleKind),
        isModuleTabDisabled = isAllFloorsSelected || indexOf < 0;
      (isModuleTabDisabled && restoreFocusWithin(moduleTabElement),
        (moduleTabElement.hidden = moduleTabsElement.hidden || indexOf < 0),
        (moduleTabElement.disabled = isModuleTabDisabled),
        moduleTabElement.style.setProperty("--i3d-tab-index", String(Math.max(0, indexOf))),
        moduleTabElement.setAttribute("aria-pressed", String(tabModuleKind === normalizedModule)));
    }
    ((moduleEmptyElement.hidden =
      isAllFloorsSelected ||
      moduleTabsElement.hidden ||
      (!pendingModule &&
        (activeModule === "security"
          ? [
              ...(options.security?.locks || []),
              ...(options.security?.presenceSensors || []),
              ...(options.security?.cameras || []),
            ].some(matchesSelectedFloor)
          : activeModule === "overview" ||
            activeModule === "light" ||
            fallbackBindings.length > 0))),
      (moduleEmptyElement.textContent = pendingModule
        ? "请选择楼层，再使用" + (moduleTabsByKind.get(pendingModule)?.textContent || "控制") + "。"
        : activeModule === "security"
          ? "尚未配置安防相关设备"
          : activeModule === "vacuum"
            ? "尚未配置扫地机相关设备"
            : activeModule === "devices"
              ? "尚未配置相关设备"
              : "尚未配置环境相关设备"));
  }
  function toggleModuleTabs(shouldHideTabs: any) {
    if (isModuleTabsHidden === shouldHideTabs) return;
    const isModuleTabsInitial = isModuleTabsHidden === null,
      computedStyle =
        !moduleTabsElement.hidden &&
        moduleTabsElement.animate &&
        typeof getComputedStyle == "function"
          ? getComputedStyle(moduleTabsElement)
          : null,
      moduleTabsBaseKeyframe = {
        clipPath: moduleTabsElement.hidden
          ? "inset(0 100% 0 0 round 12px)"
          : computedStyle?.clipPath && computedStyle.clipPath !== "none"
            ? computedStyle.clipPath
            : "inset(0 0% 0 0 round 12px)",
        opacity: moduleTabsElement.hidden ? 0 : Number(computedStyle?.opacity ?? 1),
        transform: moduleTabsElement.hidden
          ? "translateX(-6px)"
          : computedStyle?.transform || "none",
      };
    if (
      (moduleTabsAnimation?.cancel(),
      (moduleTabsAnimation = null),
      (isModuleTabsHidden = shouldHideTabs),
      (moduleTabsElement.inert = shouldHideTabs),
      moduleTabsElement.setAttribute("aria-hidden", String(shouldHideTabs)),
      shouldHideTabs && restoreFocusWithin(moduleTabsElement),
      isModuleTabsInitial ||
        !moduleTabsElement.animate ||
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
    ) {
      moduleTabsElement.hidden = shouldHideTabs;
      return;
    }
    moduleTabsElement.hidden = false;
    const moduleTabsKeyframes = shouldHideTabs
        ? [
            moduleTabsBaseKeyframe,
            {
              clipPath: "inset(0 100% 0 0 round 12px)",
              opacity: 0,
              transform: "translateX(-4px)",
            },
          ]
        : [
            moduleTabsBaseKeyframe,
            {
              clipPath: "inset(0 0% 0 0 round 12px)",
              opacity: 1,
              transform: "translateX(2px)",
              offset: 0.8,
            },
            {
              clipPath: "inset(0 0% 0 0 round 12px)",
              opacity: 1,
              transform: "translateX(0)",
            },
          ],
      animate = moduleTabsElement.animate(moduleTabsKeyframes, {
        duration: shouldHideTabs ? 380 : 480,
        easing: "cubic-bezier(.2,.7,.2,1)",
        fill: "both",
      });
    ((moduleTabsAnimation = animate),
      (animate.onfinish = () => {
        if (moduleTabsAnimation === animate) {
          ((moduleTabsAnimation = null), (moduleTabsElement.hidden = shouldHideTabs));
          for (const [finishedModuleKind, finishedModuleTabElement] of moduleTabsByKind)
            finishedModuleTabElement.hidden =
              shouldHideTabs || !configuredModuleKinds2.includes(finishedModuleKind);
          animate.cancel();
        }
      }));
  }
  let outgoingGhostAnimation: any = null;
  function cancelGhostAnimation() {
    const ghostAnimation = outgoingGhostAnimation;
    if (((outgoingGhostAnimation = null), !!ghostAnimation)) {
      for (const ghostAnimationEntry of ghostAnimation.animations) ghostAnimationEntry.cancel();
      (ghostAnimation.ghost.remove(), markerLayerElement.removeAttribute("inert"));
    }
  }
  function runModuleSwitchAnimation(switchContent: any) {
    const previousOpacityList = markerLayerElement.animate
      ? [...markerLayerElement.children].map((opacityChild) =>
          Number(getComputedStyle(opacityChild).opacity),
        )
      : [];
    if (
      (cancelGhostAnimation(),
      !markerLayerElement.animate ||
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
    ) {
      switchContent();
      return;
    }
    const childIndexByNode = new Map(
        [...markerLayerElement.children].map((indexedChild, indexedChildIndex) => [
          indexedChild,
          indexedChildIndex,
        ]),
      ),
      outgoingEntries = currentModuleBindings()
        .map((outgoingBinding: any) => ({
          ...outgoingBinding,
          index: childIndexByNode.get(map.get(outgoingBinding.id)) ?? -1,
        }))
        .filter((outgoingEntry: any) => outgoingEntry.index >= 0),
      cloneNode = markerLayerElement.cloneNode(true);
    (cloneNode.setAttribute("aria-hidden", "true"),
      cloneNode.setAttribute("inert", ""),
      cloneNode.classList.add("i3d-module-outgoing"),
      (cloneNode.style.pointerEvents = "none"));
    for (const ghostButton of cloneNode.querySelectorAll("button"))
      ((ghostButton.style.pointerEvents = "none"), ghostButton.removeAttribute("id"));
    (markerLayerElement.parentNode.append(cloneNode),
      switchContent(),
      markerLayerElement.setAttribute("inert", ""));
    const ghostAnimationState = (outgoingGhostAnimation = {
      ghost: cloneNode,
      animations: [] as any[],
      outgoing: outgoingEntries.map((ghostOutgoingEntry: any) => ({
        ...ghostOutgoingEntry,
        node: cloneNode.children[ghostOutgoingEntry.index],
      })),
    });
    for (const [ghostChildIndex, ghostChildElement] of [...cloneNode.children].entries())
      ghostChildElement.hidden ||
        ghostAnimationState.animations.push(
          ghostChildElement.animate(
            [
              {
                opacity: previousOpacityList[ghostChildIndex] ?? 1,
              },
              {
                opacity: 0,
              },
            ],
            {
              duration: 240,
              easing: "linear",
              fill: "both",
            },
          ),
        );
    if (!markerLayerElement.classList.contains("is-concealed")) {
      for (const stageChildElement of markerLayerElement.children)
        if (!stageChildElement.hidden) {
          const childOpacity = Number(getComputedStyle(stageChildElement).opacity);
          ghostAnimationState.animations.push(
            stageChildElement.animate(
              [
                {
                  opacity: 0,
                },
                {
                  opacity: childOpacity,
                },
              ],
              {
                duration: 240,
                easing: "linear",
                fill: "backwards",
              },
            ),
          );
        }
    }
    Promise.all(
      ghostAnimationState.animations.map((ghostAnimationHandle) => ghostAnimationHandle.finished),
    )
      .then(() => {
        outgoingGhostAnimation === ghostAnimationState &&
          (cancelGhostAnimation(), syncStageVisibility());
      })
      .catch(() => {});
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
    } catch {}
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
  function syncCameraInteraction() {
    if (isRangeEditorOpen && rangeEditorHandle?.syncCameraInteraction) {
      rangeEditorHandle.syncCameraInteraction();
      return;
    }
    if (isRangeEditorOpen || followVacuumId) {
      mountOptions.setCameraInteraction({
        enabled: false,
        panEnabled: false,
        zoomEnabled: false,
      });
      return;
    }
    const cameraInteractionConfig = {
        ...options.camera,
        ...resolvePageBehavior2(options, activeModule).interaction,
      },
      isFreeCameraMode =
        isAwaitingFloorViewAdjust ||
        panelDisplayMode === "edit" ||
        (isEditing && !panelDisplayMode && !cameraMotionSnapshot),
      editedEntry = panelDisplayMode === "edit" ? getFocusedEntry() : null,
      anchor =
        editedEntry &&
        (editedEntry.isCurtainGroup
          ? computeGroupBounds(editedEntry)
          : editedEntry.deviceKind === "presence"
            ? presenceScene.anchor(editedEntry.id.slice(9))
            : editedEntry.modelId
              ? mountOptions.environmentModelPose?.(editedEntry.floorId, editedEntry.modelId)
              : null),
      editFocusPoint = editedEntry
        ? anchor?.center ||
          mountOptions
            .worldPoint(editedEntry.floorId, editedEntry.x, editedEntry.y, editedEntry.height)
            ?.toArray()
        : null;
    const documentPanEnabled = cameraInteractionConfig.panEnabled !== false;
    const documentZoomEnabled = cameraInteractionConfig.zoomEnabled !== false;
    // Vue 总览条经 window 旗标切换「视角锁定」，避免 runtime 包与 SPA facade 交叉依赖
    const facadeViewLocked = !!(globalThis as any).__homeosDisplayViewLocked;
    const viewLocked = cameraInteractionConfig.viewLocked === true || facadeViewLocked;
    mountOptions.setCameraInteraction({
      enabled:
        !activePointerDrag &&
        (isFreeCameraMode ||
          (isControlReady &&
            (!panelDisplayMode || panelDisplayMode === "panel") &&
            !cameraMotionSnapshot &&
            !isIdleRotationRunning)),
      rotationMode: isFreeCameraMode ? "free" : cameraInteractionConfig.rotationMode,
      // 总览尊重文档 interaction 配置；编辑/调层模式始终可平移缩放；显式锁定时关闭
      panEnabled: !viewLocked && (isFreeCameraMode || documentPanEnabled),
      zoomEnabled: !viewLocked && (isFreeCameraMode || documentZoomEnabled),
      focusEditing: panelDisplayMode === "edit",
      focusPoint: editFocusPoint,
    });
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
  function syncLayoutMetrics() {
    const stageBoundingRect = element.getBoundingClientRect(),
      width2 = mediaViewportSize?.width || stageBoundingRect.width,
      height = mediaViewportSize?.height || stageBoundingRect.height;
    if (!(width2 > 0 && height > 0 && stageBoundingRect.width > 0 && stageBoundingRect.height > 0))
      return;
    ((containerViewportSize = {
      width: stageBoundingRect.width,
      height: stageBoundingRect.height,
    }),
      (mediaScale = stageBoundingRect.width / width2));
    const stageScaleY = stageBoundingRect.height / height,
      // 触控缩放用等比 fit，避免横向/纵向非均匀 stretch 造成 UI 变形。
      uniformMediaScale = Math.min(mediaScale, stageScaleY),
      hasMediaViewport = !!mediaViewportSize,
      isTouchScalingEnabled = typeof mountOptions < "u" && hasMediaViewport,
      width3 = isTouchScalingEnabled ? width2 : stageBoundingRect.width,
      height2 = isTouchScalingEnabled ? height : stageBoundingRect.height,
      uiScaleX = hasMediaViewport ? uniformMediaScale : 1,
      uiScaleY = hasMediaViewport ? uniformMediaScale : 1;
    ((value = hasMediaViewport
      ? {
          x: uiScaleX,
          y: uiScaleY,
          width: width2,
          height: height,
        }
      : null));
    const moduleTabStride = configuredModuleKinds2.length * 50 + 6,
      navigationConfig = options.navigation || {},
      normalizeNavigationScale = (navigationScaleConfig: any) =>
        Number.isFinite(navigationScaleConfig?.scale)
          ? Math.max(0.5, Math.min(10, navigationScaleConfig.scale))
          : 1,
      categoryScaleFactor = 2 * normalizeNavigationScale(navigationConfig.categories),
      floorScaleFactor = 2 * normalizeNavigationScale(navigationConfig.floors),
      navigationLayerHeight = navigationLayerElement.offsetHeight || 36,
      floorTabsWidth = floorTabsElement.offsetWidth || 80,
      floorTabsHeight = floorTabsElement.offsetHeight || 120,
      toolbarHeight = toolbarElement.offsetHeight || 30,
      lightPanelWidth = lightPanelSection.offsetWidth || 360,
      lightPanelHeight = lightPanelSection.offsetHeight || 400,
      speakerPanelReservedHeight = speakerPanel.root.hidden
        ? lightPanelHeight
        : lightPanelHeight +
          Math.max(
            0,
            parseFloat(getComputedStyle(speakerPanel.root).maxHeight) -
              speakerPanel.root.offsetHeight,
          );
    (presentationLayerElement.style.setProperty("--i3d-presentation-width", width3 + "px"),
      presentationLayerElement.style.setProperty("--i3d-presentation-height", height2 + "px"),
      presentationLayerElement.style.setProperty("--i3d-touch-hit-width", 44 / uiScaleX + "px"),
      presentationLayerElement.style.setProperty("--i3d-touch-hit-height", 44 / uiScaleY + "px"),
      presentationLayerElement.style.setProperty("--i3d-media-canvas-width", width2 + "px"),
      presentationLayerElement.style.setProperty("--i3d-media-canvas-height", height + "px"),
      presentationLayerElement.style.setProperty("--i3d-media-scale-x", String(uiScaleX)),
      presentationLayerElement.style.setProperty("--i3d-media-scale-y", String(uiScaleY)),
      presentationLayerElement.style.setProperty(
        "--i3d-navigation-scale",
        String(categoryScaleFactor),
      ),
      presentationLayerElement.style.setProperty("--i3d-floor-scale", String(floorScaleFactor)),


      presentationLayerElement.style.setProperty(
        "--i3d-help-scale",
        String(Math.min(4, Math.max(1, 1 / Math.max(mediaScale, 0.01)))),
      ));
    const placeNavigationGroup = (
        navigationTargetElement: any,
        placementConfig: any,
        placementPercentPair: any,
        placementCenterScale: any,
        placementSpanPx: any,
        placementItemPx: any,
      ) => {
        const groupSpanX = placementSpanPx * placementCenterScale,
          groupSpanY = placementItemPx * placementCenterScale,
          clampPercent = (percentCoordinateKey: any, percentFallback: any) =>
            Number.isFinite(placementConfig?.[percentCoordinateKey])
              ? Math.max(0, Math.min(100, placementConfig[percentCoordinateKey]))
              : percentFallback,
          max = Math.max(
            12 + groupSpanX / 2,
            Math.min(
              width3 - 12 - groupSpanX / 2,
              (width3 * clampPercent("x", placementPercentPair[0])) / 100,
            ),
          ),
          navigationTopPosition = Math.max(
            12 + groupSpanY / 2,
            Math.min(
              height2 - 12 - groupSpanY / 2,
              (height2 * clampPercent("y", placementPercentPair[1])) / 100,
            ),
          );
        return (
          (navigationTargetElement.style.left = max + "px"),
          (navigationTargetElement.style.top = navigationTopPosition + "px"),
          navigationTopPosition - groupSpanY / 2
        );
      },
      navigationBottomOffset = placeNavigationGroup(
        navigationLayerElement,
        navigationConfig.categories,
        [50, 94],
        categoryScaleFactor,
        moduleTabStride,
        navigationLayerHeight,
      ),
      followOffsetClamp = Number.isFinite(navigationConfig.followOffset)
        ? Math.max(0, Math.min(300, navigationConfig.followOffset))
        : 16,
      toolbarThreshold = toolbarHeight * categoryScaleFactor,
      isToolbarAboveNavigation = navigationBottomOffset >= toolbarThreshold + 12;
    ((toolbarElement.style.bottom = isToolbarAboveNavigation
      ? "calc(100% + " +
        Math.min(followOffsetClamp, navigationBottomOffset - toolbarThreshold - 12) /
          categoryScaleFactor +
        "px)"
      : "auto"),
      (toolbarElement.style.top = isToolbarAboveNavigation ? "auto" : "calc(100% + 8px)"),
      placeNavigationGroup(
        floorTabsElement,
        navigationConfig.floors,
        [96, 50],
        floorScaleFactor,
        floorTabsWidth,
        floorTabsHeight,
      ));
    const popupDefaultTop = Math.max(12, Math.min(height * 0.56 - 400, height - 812));
    presentationLayerElement.style.setProperty(
      "--i3d-navigation-bottom",
      Math.max(12, navigationBottomOffset - 50 * categoryScaleFactor) + "px",
    );
    const us2 = computePopupPlacement({
      width: width3,
      height: height2,
      panelWidth: lightPanelWidth,
      panelHeight: speakerPanelReservedHeight,
      defaultTop: popupDefaultTop,
      defaultScale: 2,
      settings: options.popupLayout?.general,
    });
    (lightPanelSection.style.setProperty("--i3d-control-top", us2.top + "px"),
      lightPanelSection.style.setProperty("--i3d-control-scale", String(us2.scale)),
      (lightPanelSection.style.right = us2.right + "px"),
      Object.assign(presentationLayerElement.style, {
        width: width3 + "px",
        height: height2 + "px",
        transform: isTouchScalingEnabled
          ? "scale(" + uniformMediaScale + "," + uniformMediaScale + ")"
          : "none",
      }));
    const presentationUiSignature = JSON.stringify({
      fixedUi: hasMediaViewport,
      width: width3,
      height: height2,
      uiScaleX: uiScaleX,
      uiScaleY: uiScaleY,
    });
    (typeof presentationUiSignatureCache < "u" &&
      presentationUiSignature !== presentationUiSignatureCache &&
      ((presentationUiSignatureCache = presentationUiSignature),
      postHostMessage({
        type: "presentation-ui",
        fixedUi: hasMediaViewport,
        width: width3,
        height: height2,
        uiScaleX: uiScaleX,
        uiScaleY: uiScaleY,
        sourceWidth: width2,
        sourceHeight: height,
      })),
      cameraMotionSnapshot?.focused && (cameraMotionSnapshot.targetInset = computeFocusInset()),
      panelDisplayMode &&
        panelDisplayMode !== "panel" &&
        !cameraMotionSnapshot &&
        ((focusInset = computeFocusInset()), mountOptions.setFocusViewport(focusInset)),
      renderMarkerPositions(true));
  }

  const NAVIGATION_DRAG_THRESHOLD = 4;
  /** 让分类栏 / 楼层栏可以被拖动改位置 —— 只在「导航位置调整态」生效。
 *
 * @param {HTMLElement} dragElement 接收指针的元素：分类栏整条轨道 / 楼层栏整列。
 * @param {"categories"|"floors"} navigationKey 写回配置里的哪一条导航。
 * @param {[number, number]} fallbackPosition 配置缺省时的兜底中心点百分比，与布局取法一致。
 */
  function bindNavigationDrag(dragElement: any, navigationKey: any, fallbackPosition: any) {

    let navigationDrag: any = null;

    const readOffsetPercent = (axisName: any) => {
      const configuredPercent = options.navigation?.[navigationKey]?.[axisName];
      return Number.isFinite(configuredPercent)
        ? Math.max(0, Math.min(100, configuredPercent))
        : fallbackPosition[axisName === "x" ? 0 : 1];
    };

    const writeOffsetPercent = (percentX: any, percentY: any) => {
      options = {
        ...options,
        navigation: {
          ...(options.navigation || {}),
          [navigationKey]: {
            ...(options.navigation?.[navigationKey] || {}),
            x: Math.round(percentX * 100) / 100,
            y: Math.round(percentY * 100) / 100,
          },
        },
      };
    };
    const stopNavigationDrag = () => {
      if (!navigationDrag) return;
      navigationDrag = null;
      dragElement.classList.remove("is-navigation-dragging");
    };
    dragElement.addEventListener("pointerdown", (dragStartEvent: any) => {

      if (!navigationEditing || dragStartEvent.button !== 0 || dragStartEvent.isPrimary === false)
        return;


      if (navigationDrag?.pointerId === dragStartEvent.pointerId) return;
      const containerRect = element.getBoundingClientRect();
      if (!(containerRect.width > 0) || !(containerRect.height > 0)) return;

      dragElement.dataset.dragged = "";
      dragStartEvent.preventDefault();

      dragStartEvent.stopPropagation();
      navigationDrag = {
        pointerId: dragStartEvent.pointerId,
        clientX: dragStartEvent.clientX,
        clientY: dragStartEvent.clientY,
        startPercentX: readOffsetPercent("x"),
        startPercentY: readOffsetPercent("y"),
        percentPerClientPxX: 100 / containerRect.width,
        percentPerClientPxY: 100 / containerRect.height,
        moved: false,
      };
      dragElement.setPointerCapture?.(dragStartEvent.pointerId);
      dragElement.classList.add("is-navigation-dragging");
    });
    dragElement.addEventListener("pointermove", (dragMoveEvent: any) => {
      if (!navigationDrag || navigationDrag.pointerId !== dragMoveEvent.pointerId) return;

      if (!navigationEditing) {
        (stopNavigationDrag(), (dragElement.dataset.dragged = ""));
        return;
      }
      const movedClientX = dragMoveEvent.clientX - navigationDrag.clientX,
        movedClientY = dragMoveEvent.clientY - navigationDrag.clientY;
      if (
        !navigationDrag.moved &&
        Math.hypot(movedClientX, movedClientY) < NAVIGATION_DRAG_THRESHOLD
      )
        return;
      navigationDrag.moved = true;


      const nextPercentX = Math.max(
          0,
          Math.min(
            100,
            navigationDrag.startPercentX + movedClientX * navigationDrag.percentPerClientPxX,
          ),
        ),
        nextPercentY = Math.max(
          0,
          Math.min(
            100,
            navigationDrag.startPercentY + movedClientY * navigationDrag.percentPerClientPxY,
          ),
        );
      if (nextPercentX === readOffsetPercent("x") && nextPercentY === readOffsetPercent("y"))
        return;
      (writeOffsetPercent(nextPercentX, nextPercentY), syncLayoutMetrics());
    });
    dragElement.addEventListener("pointerup", (dragEndEvent: any) => {
      if (!navigationDrag || navigationDrag.pointerId !== dragEndEvent.pointerId) return;
      const finishedDrag = navigationDrag;
      stopNavigationDrag();
      if (!finishedDrag.moved) {

        return;
      }

      dragElement.dataset.dragged = "true";
      postHostMessage({
        type: "edit",
        action: "navigation-position",
        target: navigationKey,
        x: readOffsetPercent("x"),
        y: readOffsetPercent("y"),
      });
    });

    dragElement.addEventListener("pointercancel", () => {
      if (!navigationDrag) return;
      const cancelledDrag = navigationDrag;
      stopNavigationDrag();
      if (cancelledDrag.moved) {
        (writeOffsetPercent(cancelledDrag.startPercentX, cancelledDrag.startPercentY),
          syncLayoutMetrics());
      }
    });
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
  function syncStageVisibility() {
    const isFloorMotionUnrevealed =
        cameraMotionSnapshot?.owner === "floor" && !cameraMotionSnapshot.markersRevealed,
      stageMarkerItems = currentModuleBindings(),
      stageMarkersByIdMap = new Map(
        stageMarkerItems.map((stageMarkerEntry: any) => [stageMarkerEntry.id, stageMarkerEntry]),
      ),
      some =
        !isEditing &&
        !isAwaitingFloorViewAdjust &&
        stageMarkerItems.some(
          (visibilityMarker: any) =>
            visibilityMarker.visible !== false &&
            visibilityMarker.buttonHidden !== true &&
            visibilityMarker.hiddenClickable === true,
        ),
      isStageConcealed =
        isFloorMotionUnrevealed ||
        hasPendingStageRefresh ||
        hasIdleIconActivity ||
        isIdleIconHidden ||
        (isUserActive && !some) ||
        (isCameraRotating && pageBehavior.hideIconsWhileRotating === true) ||
        !!(panelDisplayMode && !["edit", "panel"].includes(panelDisplayMode));
    for (const [stageMarkerId, stageMarkerElement] of map) {
      const stageMarkerItem =
          stageMarkersByIdMap.get(stageMarkerId) || findBindingById(stageMarkerId),
        isStageButtonHidden = !isEditing && stageMarkerItem?.buttonHidden === true,
        isStageHiddenClickable =
          !isEditing &&
          !isAwaitingFloorViewAdjust &&
          !isStageButtonHidden &&
          stageMarkerItem?.hiddenClickable === true;
      stageMarkerElement.disabled =
        cameraMotionSnapshot?.owner === "floor" ||
        isStageButtonHidden ||
        (!isEditing && (isOverviewOrAllFloors() || stageMarkerItem?.overviewQuip === true));
      const active =
          !isEditing &&
          (stageMarkerItem?.passiveSensor ||
            (stageMarkerItem?.deviceKind === "vacuum" &&
              vacuumStatusPresentation2(stageMarkerItem, deviceStates).active)),
        stageMarkerHostElement = active ? vacuumWorkingLayerElement : markerLayerElement;
      stageMarkerElement.parentElement !== stageMarkerHostElement &&
        stageMarkerHostElement.append(stageMarkerElement);
      const isStageMarkerIdleHidden =
        (isFloorMotionUnrevealed && active) ||
        (!active &&
          (isUserActive || isIdleIconHidden) &&
          !isStageHiddenClickable &&
          !isEditing &&
          !isAwaitingFloorViewAdjust);
      (stageMarkerElement.classList.toggle("is-hidden-clickable", isStageHiddenClickable),
        stageMarkerElement.classList.toggle("is-idle-hidden", isStageMarkerIdleHidden),
        isStageMarkerIdleHidden ||
        isStageButtonHidden ||
        (!isEditing && (isOverviewOrAllFloors() || stageMarkerItem?.overviewQuip === true))
          ? (restoreFocusWithin(stageMarkerElement), stageMarkerElement.setAttribute("inert", ""))
          : stageMarkerElement.removeAttribute("inert"),
        (stageMarkerElement.title = isStageHiddenClickable
          ? ""
          : stageMarkerElement.getAttribute("aria-label") || ""));
    }
    (isStageConcealed
      ? (restoreFocusWithin(
          markerLayerElement,
          lightPanelSection.classList.contains("is-open") ? lightPanelSection : canvasElement,
        ),
        markerLayerElement.setAttribute("inert", ""))
      : outgoingGhostAnimation
        ? markerLayerElement.setAttribute("inert", "")
        : markerLayerElement.removeAttribute("inert"),
      markerLayerElement.removeAttribute("aria-hidden"),
      isStageConcealed && lastInteractionMs === null
        ? (lastInteractionMs = performance.now())
        : isStageConcealed || (lastInteractionMs = null),
      markerLayerElement.classList.toggle("is-floor-concealed", isFloorMotionUnrevealed),
      markerLayerElement.classList.toggle("is-concealed", isStageConcealed));
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
  function advanceCameraMotion(frameTimestampInput: any) {
    if (!cameraMotionSnapshot) return;
    const now = performance.now(),
      sampledFrameTimestamp = now - frameTimestampInput > 50 ? now : frameTimestampInput,
      clampedFrameTimestamp = Math.max(
        sampledFrameTimestamp,
        cameraMotionSnapshot.lastFrame ?? cameraMotionSnapshot.started,
      );
    (cameraMotionSnapshot.firstFrame &&
      ((cameraMotionSnapshot.lastFrame = clampedFrameTimestamp),
      (cameraMotionSnapshot.firstFrame = false)),
      (cameraMotionSnapshot.elapsed += Math.min(
        50,
        Math.max(
          0,
          clampedFrameTimestamp - (cameraMotionSnapshot.lastFrame ?? clampedFrameTimestamp),
        ),
      )),
      (cameraMotionSnapshot.lastFrame = clampedFrameTimestamp));
    const trackedCameraMotion = cameraMotionSnapshot,
      elapsed = cameraMotionSnapshot.elapsed,
      progress = cameraMotionSnapshot.transition.progress(elapsed);
    ((cameraMotionSnapshot.amount = progress),
      (focusInset =
        cameraMotionSnapshot.inset +
        (cameraMotionSnapshot.targetInset - cameraMotionSnapshot.inset) * progress));
    const sample = cameraMotionSnapshot.transition.sample(elapsed);
    (cameraMotionSnapshot.owner === "floor" &&
      mountOptions.advanceFloorTransition?.(progress, sample),
      mountOptions.applyCameraFrame
        ? mountOptions.applyCameraFrame(sample, progress, focusInset)
        : (mountOptions.applyCameraPose(sample, progress),
          mountOptions.setFocusViewport(focusInset)),
      cameraMotionSnapshot.owner === "floor" &&
        progress >= 0.9 &&
        !cameraMotionSnapshot.presentationRevealed &&
        ((cameraMotionSnapshot.presentationRevealed = true), refreshStageUi()),
      cameraMotionSnapshot.owner === "floor" &&
        progress >= 0.9 &&
        !cameraMotionSnapshot.markersRevealed &&
        ((cameraMotionSnapshot.markersRevealed = true),
        syncStageVisibility(),
        renderMarkerPositions(true)),
      cameraMotionSnapshot.owner === "focus" &&
        !cameraMotionSnapshot.focused &&
        progress >= 0.99 &&
        exitFollowMode(),
      cameraMotionSnapshot.transition.settled(elapsed) &&
        cameraMotionSnapshot === trackedCameraMotion &&
        ((cameraMotionSnapshot = null),
        mountOptions.endCameraMotion(),
        syncCameraInteraction(),
        trackedCameraMotion.done?.(),
        syncAvailability()));
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
  function exitFocusMode(exitOptions: { immediate?: boolean; preserveCamera?: boolean } = {}) {
    if (
      (climatePanel.cancelPending?.(),
      lightModeMenu.close(),
      lightColorPicker.cancel(),
      coverPanel.deactivate(),
      typeof coverGroupPanel < "u" && coverGroupPanel.deactivate(),
      getFocusedEntry()?.deviceKind === "vacuum" &&
        postHostMessage({
          type: "vacuum-popup-close",
        }),
      getFocusedEntry()?.deviceKind === "camera" &&
        postHostMessage({
          type: "camera-popup-close",
        }),
      televisionPanel.hide(),
      speakerPanel.hide(),
      !focusedItemId && !panelDisplayMode && (!idleReturnCamera || exitOptions.immediate !== true))
    )
      return;
    const hasLightEffectPreview = !!lightEditPreview;
    lightEditPreview = null;
    const hasEditFocus = !!(panelDisplayMode && isEditing);
    ((hasPendingStageRefresh = !!(
      idleReturnCamera &&
      !isEditing &&
      panelDisplayMode !== "panel" &&
      exitOptions.immediate !== true &&
      !exitOptions.preserveCamera
    )),
      (focusedItemId = ""),
      (panelDisplayMode = ""),
      restoreFocusWithin(lightPanelSection),
      lightPanelSection.classList.remove("is-open"),
      lightPanelSection.setAttribute("inert", ""),
      syncPanelChrome(),
      postHostMessage({
        type: "focus-state",
        active: false,
      }),
      exitOptions.preserveCamera
        ? ((cameraMotionSnapshot = null),
          (idleReturnCamera = null),
          mountOptions.setOrbitPivot(null))
        : idleReturnCamera &&
          startCameraMotion(idleReturnCamera, false, exitOptions.immediate === true, () => {
            ((idleReturnCamera = null), mountOptions.setOrbitPivot(null));
          }),
      syncAvailability(),
      hasEditFocus &&
        postHostMessage({
          type: "edit",
          action: "focus-exited",
        }),
      hasLightEffectPreview && applyLightStates(),
      syncCameraInteraction());
  }
  function focusMarkerById(targetMarkerId: any, focusMode = "runtime", isImmediate = false) {
    const targetMarkerItem = findBindingById(targetMarkerId);
    // 门锁与其它 panel 设备一致：直播允许 focus / panel（lock-panel 负责控制）
    if (!targetMarkerItem || targetMarkerItem.modelAvailable === false) return;
    if (focusedItemId !== targetMarkerId) {
      lightModeMenu.close();
      lightColorPicker.cancel();
    }
    if (
      (lightEditPreview && ((lightEditPreview = null), applyLightStates()),
      focusedItemId === targetMarkerId && panelDisplayMode === focusMode && focusMode === "runtime")
    ) {
      exitFocusMode();
      return;
    }
    if (
      !isEditing &&
      ["runtime", "panel"].includes(focusMode) &&
      (!isControlReady || isOverviewOrAllFloors())
    )
      return;
    if ((idleFocusExitControl.activity(), focusMode === "panel")) {
      ((idleReturnCamera || cameraMotionSnapshot) &&
        exitFocusMode({
          immediate: true,
        }),
        (focusedItemId = targetMarkerId),
        (panelDisplayMode = "panel"),
        (controlErrorElement.textContent = ""),
        lightPanelSection.removeAttribute("inert"),
        lightPanelSection.classList.add("is-open"),
        syncPanelChrome(),
        updateDevicePanel(),
        syncCameraInteraction(),
        syncAvailability(),
        postHostMessage({
          type: "focus-state",
          active: false,
          panelOpen: true,
          id: targetMarkerId,
        }),
        handleMarkerActivate(targetMarkerItem));
      return;
    }
    idleReturnCamera ||= mountOptions.cameraState(true);
    const anchor2 = targetMarkerItem.isCurtainGroup
        ? computeGroupBounds(targetMarkerItem)
        : targetMarkerItem.deviceKind === "presence"
          ? presenceScene.anchor(targetMarkerItem.id.slice(9))
          : targetMarkerItem.modelId
            ? mountOptions.environmentModelPose?.(
                targetMarkerItem.floorId,
                targetMarkerItem.modelId,
              )
            : null,
      focusWorldPoint =
        anchor2?.center ||
        mountOptions
          .worldPoint(
            targetMarkerItem.floorId,
            targetMarkerItem.x,
            targetMarkerItem.y,
            targetMarkerItem.height,
          )
          ?.toArray();
    if (!focusWorldPoint) return;
    ((focusedItemId = targetMarkerId),
      (panelDisplayMode = focusMode),
      (controlErrorElement.textContent = ""),
      isEditing || !isPanelDeviceKind(targetMarkerItem) || targetMarkerItem.clickAction !== "focus"
        ? (lightPanelSection.removeAttribute("inert"), lightPanelSection.classList.add("is-open"))
        : (lightPanelSection.setAttribute("inert", ""),
          lightPanelSection.classList.remove("is-open")),
      mountOptions.setOrbitPivot(null),
      syncPanelChrome(),
      updateDevicePanel());
    const camera = options.camera || activeCameraPose || idleReturnCamera,
      focusCamera =
        targetMarkerItem.focusCamera ||
        (targetMarkerItem.modelId
          ? automaticAirConditionerCamera2(
              three,
              {
                ...camera,
                viewportAspect: canvasElement.clientWidth / Math.max(1, canvasElement.clientHeight),
              },
              focusWorldPoint,
              anchor2?.forward,
              anchor2?.size,
              targetMarkerItem.deviceKind === "nas"
                ? {
                    minimumFrameSize: 0.7,
                    minimumDistance: 0.6,
                  }
                : {},
            )
          : automaticLightCamera2(three, camera, focusWorldPoint));
    (isEditing ||
      postHostMessage({
        type: "focus-state",
        active: true,
        id: targetMarkerId,
      }),
      startCameraMotion(focusCamera, true, isImmediate, () => {}),
      (targetMarkerItem.deviceKind === "camera" || targetMarkerItem.deviceKind === "vacuum") &&
        handleMarkerActivate(targetMarkerItem));
  }
  (restoreViewButton.addEventListener("click", () => {
    panelDisplayMode || idleReturnCamera || cameraMotionSnapshot
      ? exitFocusMode()
      : mountOptions.restoreCamera(normalizeCameraPose(options.camera || activeCameraPose));
  }),
    powerButton.addEventListener("click", () => {
      const clickedLightItem = getFocusedEntry();
      clickedLightItem && runLightCommand("power", !readLightState(clickedLightItem.entityId).on);
    }));
  function updateLampButton(mountOptionsLightState: any) {
    const brightnessPercent = Math.max(
        1,
        Math.min(
          100,
          Number(mountOptionsLightState.brightness) ||
            (mountOptionsLightState.brightnessSupported ? 1 : 100),
        ),
      ),
      kelvinRatio =
        (Math.max(2000, Math.min(6500, Number(mountOptionsLightState.kelvin) || 3000)) - 2000) /
        4500,
      warmColorRgb = [255, 132, 42],
      coolColorRgb = [172, 225, 255],
      lampColorRgb =
        mountOptionsLightState.colorMode === "white"
          ? [255, 255, 255]
          : mountOptionsLightState.colorSupported &&
              !["color_temp", "onoff", "brightness", "unknown"].includes(
                mountOptionsLightState.colorMode,
              ) &&
              mountOptionsLightState.colorHs
            ? mountOptionsLightState.colorRgb || hsToRgbColor2(mountOptionsLightState.colorHs)
            : warmColorRgb.map((warmChannelBase, colorChannelIndex) =>
                Math.round(
                  warmChannelBase +
                    (coolColorRgb[colorChannelIndex] - warmChannelBase) * kelvinRatio,
                ),
              );
    (powerButton.classList.toggle("is-on", mountOptionsLightState.on),
      powerButton.setAttribute("aria-pressed", String(mountOptionsLightState.on)),
      powerButton.setAttribute(
        "aria-label",
        "" +
          (getFocusedEntry()?.label || mountOptionsLightState.name) +
          (mountOptionsLightState.available
            ? mountOptionsLightState.on
              ? "已开启，点击关闭"
              : "已关闭，点击开启"
            : "当前不可用"),
      ),
      powerButton.style.setProperty("--i3d-lamp-color", "rgb(" + lampColorRgb.join(",") + ")"),
      powerButton.style.setProperty(
        "--i3d-lamp-opacity",
        mountOptionsLightState.on && brightnessPercent > 0
          ? String(0.08 + (brightnessPercent / 100) * 0.92)
          : "0",
      ),
      powerButton.style.setProperty(
        "--i3d-lamp-scale",
        String(0.62 + (brightnessPercent / 100) * 1.05),
      ));
  }
  function updateDevicePanel() {
    lightPanelSection.classList.toggle("is-airer-panel", !!getFocusedEntry()?.airer);
    const panelItem = getFocusedEntry();
    if (!(panelItem?.deviceKind === "lock")) lockPanel.hide();
    else {
      lockPanel.root.hidden = false;
      for (const panelRootElement of [
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
      ])
        panelRootElement.hidden = true;
      (lightPanelSection.classList.remove(
        "is-cover-panel",
        "is-climate-panel",
        "is-nas-panel",
        "is-television-panel",
        "has-light-controls",
      ),
        lightPanelSection.setAttribute("aria-label", "门"),
        lockPanel.update({
          item: panelItem,
          states: deviceStates,
          editing: isEditing || !isControlReady || !panelItem.modelAvailable,
        }));
      return;
    }
    const isCurtainGroupKind = panelItem?.isCurtainGroup === true;
    if (
      (typeof coverGroupPanel < "u" && (coverGroupPanel.root.hidden = !isCurtainGroupKind),
      lightPanelSection.classList.toggle("is-cover-group-panel", isCurtainGroupKind),
      lightPanelSection.classList.toggle(
        "is-cover-group-vertical",
        isCurtainGroupKind && panelItem.panelLayout === "vertical",
      ),
      !isCurtainGroupKind && typeof coverGroupPanel < "u" && coverGroupPanel.deactivate(),
      ["vacuum", "presence", "camera"].includes(panelItem?.deviceKind))
    ) {
      (lightPanelSection.classList.remove("is-open"), lightPanelSection.setAttribute("inert", ""));
      return;
    }
    const isGenericDevice = isGenericDeviceKind2(panelItem?.deviceKind);
    typeof devicePanel < "u" && (devicePanel.root.hidden = !isGenericDevice);
    const isSpeakerDevice = panelItem?.deviceKind === "speaker";
    !isSpeakerDevice || !lightPanelSection.classList.contains("is-open")
      ? speakerPanel.hide()
      : (speakerPanel.root.hidden = false);
    const isNasDevice = panelItem?.deviceKind === "nas",
      isTelevisionDevice = panelItem?.deviceKind === "television";
    if (
      (!isTelevisionDevice || !lightPanelSection.classList.contains("is-open")
        ? televisionPanel.hide()
        : (televisionPanel.root.hidden = false),
      (nasPanel.root.hidden = !isNasDevice),
      lightPanelSection.classList.toggle("is-nas-panel", isNasDevice),
      lightPanelSection.classList.toggle(
        "is-television-panel",
        isTelevisionDevice || isSpeakerDevice,
      ),
      isNasDevice || isTelevisionDevice || isSpeakerDevice || isGenericDevice)
    ) {
      (lightPanelSection.classList.remove(
        "is-cover-panel",
        "is-climate-panel",
        "has-light-controls",
        "has-error",
      ),
        lightPanelSection.classList.toggle("is-climate-panel", isGenericDevice),
        lightPanelSection.setAttribute(
          "aria-label",
          isGenericDevice
            ? (panelItem.deviceLabel ||
                genericDeviceProfile2(panelItem.deviceKind)?.label ||
                "设备") + "控制"
            : isSpeakerDevice
              ? "智能音响控制"
              : isTelevisionDevice
                ? "电视状态"
                : "NAS 状态",
        ),
        panelItem.clickAction === "focus" &&
          !isEditing &&
          (lightPanelSection.classList.remove("is-open"),
          lightPanelSection.setAttribute("inert", "")),
        (climatePanel.root.hidden =
          coverPanel.root.hidden =
          lightPanelHeader.hidden =
          lightControlsElement.hidden =
          controlErrorElement.hidden =
            true),
        isSpeakerDevice
          ? (isEditing || panelItem.clickAction !== "focus") &&
            lightPanelSection.classList.contains("is-open") &&
            speakerPanel.update({
              item: panelItem,
              states: deviceStates,
              editing: isEditing || !isControlReady || !panelItem.modelAvailable,
            })
          : isTelevisionDevice
            ? (isEditing || panelItem.clickAction !== "focus") &&
              lightPanelSection.classList.contains("is-open") &&
              televisionPanel.update({
                item: panelItem,
                states: deviceStates,
                editing: isEditing || !isControlReady,
              })
            : isGenericDevice && typeof devicePanel < "u"
              ? devicePanel.update({
                  item: panelItem,
                  states: deviceStates,
                  editing: isEditing || !isControlReady || !panelItem.modelAvailable,
                })
              : nasPanel.update({
                  item: panelItem,
                  states: deviceStates,
                }));
      return;
    }
    const isCoverDevice = panelItem?.deviceKind === "cover",
      isClimateDevice = !!panelItem?.modelId && !isCoverDevice;
    if (
      ((climatePanel.root.hidden = !isClimateDevice),
      (coverPanel.root.hidden = !isCoverDevice || isCurtainGroupKind),
      typeof coverGroupPanel < "u" && (coverGroupPanel.root.hidden = !isCurtainGroupKind),
      (lightPanelHeader.hidden =
        lightControlsElement.hidden =
        controlErrorElement.hidden =
          isClimateDevice || isCoverDevice),
      lightPanelSection.classList.toggle("is-cover-panel", isCoverDevice),
      lightPanelSection.classList.toggle("is-climate-panel", isClimateDevice),
      lightPanelSection.setAttribute(
        "aria-label",
        isCoverDevice
          ? panelItem.airer
            ? "晾衣架控制"
            : "窗帘控制"
          : isClimateDevice
            ? panelItem.waterHeater
              ? "热水器控制"
              : panelItem.pedestalFan
                ? "电风扇控制"
                : panelItem.airPurifier
                  ? "空气净化器控制"
                  : "空调控制"
            : "灯光控制",
      ),
      !panelItem)
    )
      return exitFocusMode();
    if (isCoverDevice) {
      if (
        (lightPanelSection.classList.remove("has-light-controls", "has-error"), isCurtainGroupKind)
      ) {
        const coverStatesById = Object.fromEntries(
            panelItem.memberItems.map((coverMemberEntry: any) => [
              coverMemberEntry.id,
              coverState2(
                coverMemberEntry.entityId,
                (deviceStates as any)[coverMemberEntry.entityId],
                coverMemberEntry,
              ),
            ]),
          ),
          coverPresentationsById = Object.fromEntries(
            panelItem.memberItems.map((presentationMemberEntry: any) => [
              presentationMemberEntry.id,
              readCoverFeedback(
                presentationMemberEntry,
                coverStatesById[presentationMemberEntry.id],
              ),
            ]),
          );
        typeof coverGroupPanel < "u" &&
          coverGroupPanel.update({
            item: panelItem,
            states: coverStatesById,
            presentations: coverPresentationsById,
            editing: isEditing || !isControlReady,
            errors: Object.fromEntries(
              panelItem.memberItems.map((errorMemberEntry: any) => [
                errorMemberEntry.id,
                errorMemberEntry.modelAvailable
                  ? coverPresentationsById[errorMemberEntry.id]?.error || ""
                  : "窗帘模型已移除，请重新配置。",
              ]),
            ),
          });
      } else {
        const coverState = coverState2(
          panelItem.entityId,
          (deviceStates as any)[panelItem.entityId],
          panelItem,
        );
        panelItem.modelAvailable || (coverState.available = false);
        const coverPresentation = readCoverFeedback(panelItem, coverState);
        coverPanel.update({
          item: panelItem,
          state: coverState,
          states: deviceStates,
          presentation: coverPresentation,
          editing: isEditing || !isControlReady,
          error: panelItem.modelAvailable
            ? coverPresentation.error || ""
            : "窗帘模型已移除，请重新配置。",
        });
      }
      return;
    }
    if (isClimateDevice) {
      lightPanelSection.classList.remove("has-light-controls", "has-error");
      const climateState = climateState2(panelItem.entityId, (deviceStates as any)[panelItem.entityId]);
      (panelItem.modelAvailable || (climateState.available = false),
        climatePanel.update({
          item: panelItem,
          state: climateState,
          states: deviceStates,
          editing: isEditing || !isControlReady || !panelItem.modelAvailable,
          error: panelItem.modelAvailable ? "" : "设备模型已移除，请重新配置。",
        }));
      return;
    }
    const panelLightState = resolveLightState(panelItem);
    ((lightTitleElement.textContent = panelItem.label || panelLightState.name),
      (deviceStatusElement.textContent = panelItem.entityId
        ? panelLightState.available
          ? panelLightState.on
            ? "已开启"
            : "已关闭"
          : "设备不可用"
        : "尚未绑定设备"),
      (lightTitleElement.title = lightTitleElement.textContent),
      (controlErrorElement.title = controlErrorElement.textContent),
      updateLampButton(panelLightState),
      deviceStatusElement.classList.toggle(
        "is-on",
        panelLightState.available && panelLightState.on,
      ));
    const some2 = [...lightGroupByKey.values()].some(
      (pendingLightCommand) => pendingLightCommand.entityId === panelItem.entityId,
    );
    (lightPanelSection.classList.toggle(
      "is-command-pending",
      some2 && panelLightState.available && !isEditing,
    ),
      lightPanelSection.setAttribute("aria-busy", String(some2)));
    const colorSupported =
        panelLightState.brightnessSupported ||
        panelLightState.temperatureSupported ||
        panelLightState.colorSupported,
      colorModeName =
        panelLightState.colorMode === "white"
          ? "white"
          : panelLightState.colorMode === "color_temp" && panelLightState.temperatureSupported
            ? "temperature"
            : panelLightState.colorSupported
              ? "color"
              : "temperature",
      lightModeOptions = {
        color: panelLightState.colorSupported,
        temperature: panelLightState.temperatureSupported,
        white: panelLightState.colorModes?.includes("white"),
      };
    (lightModeMenu.update({
      modes: lightModeOptions,
      value: colorModeName,
      disabled: isEditing || !panelLightState.available,
      entity: panelItem.entityId,
    }),
      lightColorPicker.update({
        entityId: panelItem.entityId,
        hs: panelLightState.colorHs,
        visible: panelLightState.colorSupported && colorModeName === "color",
        enabled: !isEditing && panelLightState.available,
      }),
      lightPanelSection.classList.toggle("has-light-controls", colorSupported),
      lightPanelSection.classList.toggle(
        "has-color-controls",
        panelLightState.colorSupported && colorModeName === "color",
      ),
      lightPanelSection.classList.toggle("has-error", !!controlErrorElement.textContent),
      (isEditing || !panelLightState.available || !panelLightState.on) &&
        restoreFocusWithin(lightControlsElement, lightPanelSection),
      colorSupported
        ? lightControlsElement.removeAttribute("inert")
        : (restoreFocusWithin(lightControlsElement, lightPanelSection),
          lightControlsElement.setAttribute("inert", "")),
      lightControlsElement.removeAttribute("aria-hidden"),
      (powerButton.disabled = isEditing || !panelLightState.available),
      (brightnessSlider.input.min = 0),
      (brightnessSlider.input.max = 100),
      (temperatureSlider.input.min = panelLightState.minimum),
      (temperatureSlider.input.max = panelLightState.maximum));
    for (const [lightSliderControl, isSliderEnabled, sliderValue, sliderUnitSuffix] of [
      [brightnessSlider, panelLightState.brightnessSupported, panelLightState.brightness, "%"],
      [
        temperatureSlider,
        panelLightState.temperatureSupported && colorModeName === "temperature",
        panelLightState.kelvin,
        " K",
      ],
    ])
      ((lightSliderControl.root.hidden = !isSliderEnabled),
        (lightSliderControl.input.disabled = isEditing || !panelLightState.available),
        lightSliderControl === brightnessSlider &&
          !panelLightState.on &&
          isSliderEnabled &&
          (lightSliderControl.input.value = "0"),
        document.activeElement !== lightSliderControl.input &&
          ((lightSliderControl.input.value =
            sliderValue ??
            (lightSliderControl === brightnessSlider ? 100 : panelLightState.minimum)),
          (lightSliderControl.value.value =
            sliderValue === null ? "—" : "" + sliderValue + sliderUnitSuffix)),
        lightSliderControl.syncProgress?.());
    lightPresetsElement.hidden =
      panelLightState.colorSupported ||
      (!panelLightState.brightnessSupported && !panelLightState.temperatureSupported);
    for (const lightPreset of lightPresetRecords) {
      const round = Math.round(
          panelLightState.minimum +
            ((panelLightState.maximum - panelLightState.minimum) * lightPreset.temperaturePercent) /
              100,
        ),
        isPresetActive =
          panelLightState.on &&
          (!panelLightState.brightnessSupported ||
            Math.abs(panelLightState.brightness - lightPreset.brightness) <= 4) &&
          (!panelLightState.temperatureSupported ||
            Math.abs(panelLightState.kelvin - round) <=
              Math.max(50, (panelLightState.maximum - panelLightState.minimum) * 0.06));
      ((lightPreset.button.disabled =
        isEditing || !panelLightState.available || lightPresetsElement.hidden),
        lightPreset.button.classList.toggle("is-active", isPresetActive),
        lightPreset.button.setAttribute("aria-pressed", String(isPresetActive)),
        (lightPreset.detail.textContent = panelLightState.brightnessSupported
          ? lightPreset.brightness + "%"
          : "开启"));
    }
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
  async function runLightCommand(serviceName: any, serviceValue: any, commandTargetItem = getFocusedEntry()) {
    if (!(!commandTargetItem || isEditing || isControlBusy))
      try {
        const commandLightState = resolveLightState(commandTargetItem);
        let commandPayload,
          commandValue = serviceValue;
        if (serviceName === "preset") {
          if (!lightPresetEntries.includes(serviceValue)) throw new Error("灯光预设无效。");
          const presetFieldPairs: any[] = [];
          if (
            ((commandValue = {}),
            commandLightState.brightnessSupported &&
              (presetFieldPairs.push(["brightness", serviceValue.brightness]),
              (commandValue.brightness = serviceValue.brightness)),
            commandLightState.temperatureSupported &&
              ((commandValue.kelvin = Math.round(
                commandLightState.minimum +
                  ((commandLightState.maximum - commandLightState.minimum) *
                    serviceValue.temperaturePercent) /
                    100,
              )),
              presetFieldPairs.push(["temperature", commandValue.kelvin])),
            !presetFieldPairs.length)
          )
            throw new Error("此设备不支持灯光预设。");
          const presetFieldCommands = presetFieldPairs.map(([presetFieldName, presetFieldValue]) =>
            lightCommand2(
              commandTargetItem.entityId,
              presetFieldName,
              presetFieldValue,
              commandLightState,
            ),
          );
          ((commandPayload = {
            ...presetFieldCommands[0],
            data: Object.assign(
              {},
              ...presetFieldCommands.map((presetFieldCommand) => presetFieldCommand.data),
            ),
          }),
            commandLightState.brightnessSupported &&
              serviceValue.brightness < 100 &&
              (delete commandPayload.data.brightness,
              (commandPayload.data.brightness_pct = serviceValue.brightness)));
        } else
          commandPayload = lightCommand2(
            commandTargetItem.entityId,
            serviceName,
            serviceValue,
            commandLightState,
          );
        const previewTokenFromSet = vector.set(
          commandTargetItem.entityId,
          serviceName,
          commandValue,
          true,
        );
        (applyLightStates({
          preview: serviceName !== "power",
        }),
          enqueueControlCommand(commandPayload, previewTokenFromSet),
          (controlErrorElement.textContent = ""),
          syncMarkers());
      } catch (lightCommandError: any) {
        ((controlErrorElement.textContent = lightCommandError.message), updateDevicePanel());
      }
  }
  function activateMarker(activatedMarkerId: any, isShortcut = false) {
    if (!isEditing && isOverviewOrAllFloors()) return;
    const activatedMarkerItem = findBindingById(activatedMarkerId);
    if (
      !activatedMarkerItem ||
      activatedMarkerItem.modelAvailable === false ||
      (!isEditing && (activatedMarkerItem.overviewQuip || activatedMarkerItem.passiveSensor)) ||
      (followVacuumId && !isEditing) ||
      (!isEditing &&
        ["temperature-humidity", "smallcar"].includes(activatedMarkerItem.deviceKind))
    )
      return;
    const markerClickAction = activatedMarkerItem.clickAction || "focus";
    if (isEditing) {
      ((text = activatedMarkerId),
        postHostMessage({
          type: "edit",
          action: "select",
          id: activatedMarkerId,
        }),
        syncMarkers());
      return;
    }
    if (activatedMarkerItem.deviceKind === "camera") {
      isControlReady && activatedMarkerItem.entityId && focusMarkerById(activatedMarkerId);
      return;
    }
    if (activatedMarkerItem.deviceKind === "vacuum-room") {
      if (
        !isControlReady ||
        !activatedMarkerItem.entityId ||
        vacuumOverlayByKey.has(activatedMarkerId)
      )
        return;
      const roomTimeoutHandle = setTimeout(() => {
        vacuumOverlayByKey.delete(activatedMarkerId);
        const roomMarkerElement = map.get(activatedMarkerId);
        roomMarkerElement &&
          ((roomMarkerElement.disabled = false),
          (roomMarkerElement.title = "请求超时，请检查设备状态"));
      }, 14000);
      (vacuumOverlayByKey.set(activatedMarkerId, roomTimeoutHandle),
        map.get(activatedMarkerId) && (map.get(activatedMarkerId).disabled = true),
        postHostMessage({
          type: "vacuum-room",
          id: activatedMarkerId,
          vacuumId: activatedMarkerItem.vacuumId,
          shortcutId: activatedMarkerItem.shortcutId,
        }));
      return;
    }
    const isTurnOnAction = ["turn-on", "turn-on-focus", "turn-on-panel"].includes(
        markerClickAction,
      ),
      openPanelOrRuntime = () => {
        const targetFocusMode = markerClickAction === "turn-on-panel" ? "panel" : "runtime";
        (focusedItemId === activatedMarkerId && panelDisplayMode === targetFocusMode) ||
          focusMarkerById(activatedMarkerId, targetFocusMode);
      },
      reportMarkerError = (markerError: any) => {
        if (isControlBusy) return;
        const roomMarkerElementRef = map.get(activatedMarkerId);
        (roomMarkerElementRef && (roomMarkerElementRef.title = markerError.message),
          focusedItemId === activatedMarkerId &&
            ((controlErrorElement.textContent = markerError.message), updateDevicePanel()));
      };
    if (activatedMarkerItem.deviceKind === "television" && isTurnOnAction) {
      if (!isControlReady) return;
      const televisionPowerState = televisionPower2(activatedMarkerItem, deviceStates);
      if (
        (markerClickAction !== "turn-on" && !televisionPowerState.on && openPanelOrRuntime(),
        !televisionPowerState.available ||
          !televisionPowerState.supported ||
          [...mediaControlRequestsByRequestId.values()].some(
            (powerCommandEntry) => powerCommandEntry.entityId === televisionPowerState.entityId,
          ))
      )
        return;
      controlMediaDevice(televisionPowerState.command, activatedMarkerItem).catch(
        reportMarkerError,
      );
      return;
    }
    if (isPanelDeviceKind(activatedMarkerItem)) {
      const active2 =
        isShortcut &&
        activatedMarkerItem.deviceKind === "vacuum" &&
        vacuumStatusPresentation2(activatedMarkerItem, deviceStates).active;
      focusMarkerById(
        activatedMarkerId,
        active2 || activatedMarkerItem.clickAction === "panel" ? "panel" : "runtime",
      );
      return;
    }
    if (activatedMarkerItem.deviceKind === "cover") {
      if (isTurnOnAction) {
        if (!isControlReady) return;
        const coverEntryList = (
            activatedMarkerItem.isCurtainGroup
              ? activatedMarkerItem.memberItems
              : [activatedMarkerItem]
          )
            .filter((coverFilterItem: any) => coverFilterItem.modelAvailable !== false)
            .map((coverMapItem: any) => ({
              item: coverMapItem,
              state: readCoverFeedback(coverMapItem),
            }))
            .filter(({ state: availableCoverState }: any) => availableCoverState.available),
          some3 = coverEntryList.some(({ state: movingCoverState }: any) => movingCoverState.moving),
          some4 = coverEntryList.some(
            ({ state: openCoverState }: any) =>
              openCoverState.on || openCoverState.position > 0 || openCoverState.state === "open",
          ),
          coverServiceName = some3 ? "stop_cover" : some4 ? "close_cover" : "open_cover";
        markerClickAction !== "turn-on" && !some3 && !some4 && openPanelOrRuntime();
        const commandedEntityIdSet = new Set();
        for (const { item: coverCommandItem, state: coverCommandState } of coverEntryList)
          if (!(
            (coverServiceName === "open_cover" && !coverCommandState.closedConfirmed) ||
            (some3 && !coverCommandState.moving) ||
            commandedEntityIdSet.has(coverCommandItem.entityId)
          ))
            try {
              const coverControlCommand = coverControl2(
                coverCommandState,
                coverServiceName,
                undefined,
              );
              (commandedEntityIdSet.add(coverCommandItem.entityId),
                coverPanelOptions
                  .onControl(coverControlCommand, coverCommandItem)
                  .catch(reportMarkerError));
            } catch (coverCommandError: any) {
              reportMarkerError(coverCommandError);
            }
        return;
      }
      focusMarkerById(activatedMarkerId, markerClickAction === "panel" ? "panel" : "runtime");
      return;
    }
    if (activatedMarkerItem.modelId) {
      const markerClimateState = climateState2(
        activatedMarkerItem.entityId,
        (deviceStates as any)[activatedMarkerItem.entityId],
      );
      if (
        (activatedMarkerItem.climateType === "bath-heater" ||
          activatedMarkerItem.airPurifier ||
          activatedMarkerItem.waterHeater) &&
        !activatedMarkerItem.entityId
      ) {
        focusMarkerById(
          activatedMarkerId,
          markerClickAction === "turn-on-panel" ? "panel" : "runtime",
        );
        return;
      }
      const isFocusTurnOn = ["turn-on-focus", "turn-on-panel"].includes(markerClickAction);
      if (
        markerClickAction === "turn-on" ||
        (isFocusTurnOn && markerClimateState.available && markerClimateState.on)
      ) {
        (climatePanel.update({
          item: activatedMarkerItem,
          state: markerClimateState,
          states: deviceStates,
          editing: isEditing || !isControlReady || !activatedMarkerItem.modelAvailable,
        }),
          climatePanel.power?.({
            toggle: true,
          }));
        return;
      }
      ((markerClickAction === "turn-on-focus" &&
        focusedItemId === activatedMarkerId &&
        panelDisplayMode === "runtime") ||
        focusMarkerById(
          activatedMarkerId,
          markerClickAction === "turn-on-panel" ? "panel" : "runtime",
        ),
        markerClickAction !== "focus" &&
          focusedItemId === activatedMarkerId &&
          climatePanel.power?.({
            toggle: false,
          }));
      return;
    }
    const markerLightState = readLightState(activatedMarkerItem.entityId);
    if (markerClickAction === "turn-on") {
      markerLightState.available &&
        runLightCommand("power", !markerLightState.on, activatedMarkerItem);
      return;
    }
    if (
      ["turn-on-focus", "turn-on-panel"].includes(markerClickAction) &&
      markerLightState.available &&
      markerLightState.on
    ) {
      runLightCommand("power", false, activatedMarkerItem);
      return;
    }
    if (markerClickAction === "turn-on-panel") {
      (focusMarkerById(activatedMarkerId, "panel"),
        markerLightState.available &&
          !markerLightState.on &&
          runLightCommand("power", true, activatedMarkerItem));
      return;
    }
    ((markerClickAction === "turn-on-focus" &&
      focusedItemId === activatedMarkerId &&
      panelDisplayMode === "runtime") ||
      focusMarkerById(activatedMarkerId),
      focusedItemId === activatedMarkerId &&
        panelDisplayMode === "runtime" &&
        markerClickAction === "turn-on-focus" &&
        markerLightState.available &&
        !markerLightState.on &&
        runLightCommand("power", true));
  }
  let lastRenderSignature = "";
  function renderMarkerPositions(isForced = false) {
    if (isRangeEditorOpen || isCameraMoving || isControlBusy) return;
    ((mountOptions.floorTransitionActive || cameraMotionSnapshot) && screenOutlines.pause(),
      screenOutlines.update(),
      editorSelectionOutlines.update());
    const isConcealGraceElapsed =
      lastInteractionMs !== null && performance.now() - lastInteractionMs >= 240;
    if (isConcealGraceElapsed && !vacuumWorkingLayerElement.childElementCount) {
      lastRenderSignature = "";
      return;
    }
    (mountOptions.camera.updateMatrixWorld(),
      (cachedDocumentSource !== mountOptions.document ||
        cachedDocumentFloorId !== selectedFloorId) &&
        (sceneCacheByKey.clear(),
        (cachedDocumentSource = mountOptions.document),
        (cachedDocumentFloorId = selectedFloorId)));
    const renderCanvasRect = containerViewportSize || element.getBoundingClientRect(),
      width4 = (hasStageRect() && mediaViewportSize?.width) || renderCanvasRect.width,
      height3 = (hasStageRect() && mediaViewportSize?.height) || renderCanvasRect.height;
    if (outgoingGhostAnimation && mountOptions.presentationPoint)
      for (const outgoingMarker of outgoingGhostAnimation.outgoing) {
        if (!outgoingMarker.node) continue;
        const presentationPoint = mountOptions.presentationPoint(
          outgoingMarker.floorId,
          outgoingMarker.x,
          outgoingMarker.y,
          outgoingMarker.height,
        );
        if (!presentationPoint) {
          outgoingMarker.node.hidden = true;
          continue;
        }
        const project = presentationPoint.project(mountOptions.camera);
        ((outgoingMarker.node.hidden =
          project.z < -1 ||
          project.z > 1 ||
          Math.abs(project.x) > 1.05 ||
          Math.abs(project.y) > 1.05),
          (outgoingMarker.node.style.left = ((project.x + 1) * width4) / 2 + "px"),
          (outgoingMarker.node.style.top = ((1 - project.y) * height3) / 2 + "px"));
      }
    const isUniformOverviewStack =
        selectedFloorId === "all" && mountOptions.document.uniformOverviewStack === true,
      renderSignature =
        width4 +
        ":" +
        height3 +
        ":" +
        isUniformOverviewStack +
        ":" +
        mountOptions.camera.matrixWorld.elements +
        ":" +
        mountOptions.camera.projectionMatrix.elements;
    if (!(
      isForced !== true &&
      !mountOptions.floorTransitionActive &&
      renderSignature === lastRenderSignature
    )) {
      lastRenderSignature = renderSignature;
      for (const layoutMarkerItem of currentModuleBindings()) {
        const layoutMarkerSnapshot =
            activePointerDrag?.id === layoutMarkerItem.id
              ? {
                  ...layoutMarkerItem,
                  ...activePointerDrag.point,
                }
              : layoutMarkerItem,
          layoutMarkerId = layoutMarkerSnapshot.id,
          layoutMarkerElement = map.get(layoutMarkerId);
        if (
          !layoutMarkerElement ||
          (isConcealGraceElapsed && layoutMarkerElement.parentElement === markerLayerElement)
        )
          continue;
        const isMarkerVisible =
          (isEditing || layoutMarkerSnapshot.deviceKind !== "presence") &&
          (isEditing || layoutMarkerSnapshot.visible !== false) &&
          (isEditing || layoutMarkerSnapshot.buttonHidden !== true) &&
          layoutMarkerSnapshot.modelAvailable !== false &&
          (selectedFloorId === "all" || layoutMarkerSnapshot.floorId === selectedFloorId);
        let cachedWorldPoint = sceneCacheByKey.get(layoutMarkerId);
        isMarkerVisible &&
          (!cachedWorldPoint ||
            cachedWorldPoint.floorId !== layoutMarkerSnapshot.floorId ||
            cachedWorldPoint.x !== layoutMarkerSnapshot.x ||
            cachedWorldPoint.y !== layoutMarkerSnapshot.y ||
            cachedWorldPoint.height !== layoutMarkerSnapshot.height) &&
          ((cachedWorldPoint = {
            floorId: layoutMarkerSnapshot.floorId,
            x: layoutMarkerSnapshot.x,
            y: layoutMarkerSnapshot.y,
            height: layoutMarkerSnapshot.height,
            point: mountOptions.worldPoint(
              layoutMarkerSnapshot.floorId,
              layoutMarkerSnapshot.x,
              layoutMarkerSnapshot.y,
              layoutMarkerSnapshot.height,
            ),
          }),
          sceneCacheByKey.set(layoutMarkerId, cachedWorldPoint));
        const presentationPoint2 =
          isMarkerVisible &&
          ((mountOptions.floorTransitionActive || isUniformOverviewStack) &&
          mountOptions.presentationPoint
            ? mountOptions.presentationPoint(
                layoutMarkerSnapshot.floorId,
                layoutMarkerSnapshot.x,
                layoutMarkerSnapshot.y,
                layoutMarkerSnapshot.height,
              )
            : cachedWorldPoint?.point);
        if (!presentationPoint2) {
          layoutMarkerElement.hidden = true;
          continue;
        }
        const project2 = scratchVector.copy(presentationPoint2).project(mountOptions.camera);
        ((layoutMarkerElement.hidden =
          project2.z < -1 ||
          project2.z > 1 ||
          Math.abs(project2.x) > 1.05 ||
          Math.abs(project2.y) > 1.05),
          (layoutMarkerElement.style.left = ((project2.x + 1) * width4) / 2 + "px"),
          (layoutMarkerElement.style.top = ((1 - project2.y) * height3) / 2 + "px"));
      }
    }
  }
  function pickMarkerAtPoint(pickPointerEvent: any, fallbackMarkerId: any) {
    if (isEditing) return fallbackMarkerId;
    const hitCandidates: any[] = [];
    for (const [candidateMarkerId, candidateMarkerElement] of map) {
      if (
        candidateMarkerElement.hidden ||
        candidateMarkerElement.disabled ||
        candidateMarkerElement.closest("[inert]")
      )
        continue;
      const computedStyle2 = getComputedStyle(candidateMarkerElement);
      if (computedStyle2.pointerEvents === "none" || computedStyle2.visibility === "hidden")
        continue;
      const candidateMarkerRect = candidateMarkerElement.getBoundingClientRect();
      candidateMarkerRect.width > 0 &&
        candidateMarkerRect.height > 0 &&
        hitCandidates.push({
          id: candidateMarkerId,
          rect: candidateMarkerRect,
          width:
            ((parseFloat(candidateMarkerElement.style.width) ||
              candidateMarkerElement.offsetWidth) *
              candidateMarkerRect.width) /
            candidateMarkerElement.offsetWidth,
          height:
            ((parseFloat(candidateMarkerElement.style.height) ||
              candidateMarkerElement.offsetHeight) *
              candidateMarkerRect.height) /
            candidateMarkerElement.offsetHeight,
        });
    }
    return (
      nearestMarkerTarget(hitCandidates, pickPointerEvent.clientX, pickPointerEvent.clientY) ||
      fallbackMarkerId
    );
  }
  function syncMarkers(markerChange: any = null) {
    if (isCameraMoving) return;
    (markerChange ||
      (stateUpdatePlanner.invalidate(), stageModelIndex.invalidate()),
      wakeSceneBackground(),
      markerLayerElement.classList.toggle("is-editing", isEditing));
    const syncMarkerItems = currentModuleBindings().filter(
        (filteredMarkerItem: any) => isEditing || filteredMarkerItem.deviceKind !== "presence",
      ),
      visibleMarkerIdSet = new Set(
        syncMarkerItems.map((visibleMarkerItem: any) => visibleMarkerItem.id),
      );
    let hasMarkerChange = false;
    for (const [existingMarkerId, existingMarkerElement] of map)
      visibleMarkerIdSet.has(existingMarkerId) ||
        (existingMarkerElement.remove(),
        map.delete(existingMarkerId),
        sceneCacheByKey.delete(existingMarkerId),
        (hasMarkerChange = true));
    for (const syncMarkerItem of syncMarkerItems) {
      let syncMarkerElement = map.get(syncMarkerItem.id);
      if (syncMarkerElement && markerChange && !markerChange.affects(syncMarkerItem)) continue;
      if (((hasMarkerChange = true), !syncMarkerElement)) {
        ((syncMarkerElement = createStageElement(
          syncMarkerItem.passiveSensor ||
            syncMarkerItem.securityAlarm ||
            ["temperature-humidity", "smallcar", "lock"].includes(syncMarkerItem.deviceKind)
            ? "div"
            : "button",
          "i3d-marker",
        )),
          (syncMarkerElement.type = "button"));
        const ms2 = createMarkerTouch((markerHitEvent: any) =>
          pickMarkerAtPoint(markerHitEvent, syncMarkerItem.id),
        );
        (syncMarkerElement.addEventListener("pointerdown", (dragDownEvent: any) => {
          isEditing || ms2.down(dragDownEvent);
        }),
          syncMarkerElement.addEventListener("pointermove", (dragMoveEvent: any) =>
            ms2.move(dragMoveEvent),
          ),
          syncMarkerElement.addEventListener("pointerup", (dragUpEvent: any) => ms2.up(dragUpEvent)),
          syncMarkerElement.addEventListener("pointercancel", () => ms2.cancel()),
          syncMarkerElement.addEventListener("click", (markerClickEvent: any) => {
            if (
              (markerClickEvent.stopPropagation(),
              findBindingById(syncMarkerItem.id)?.passiveSensor ||
                isCameraMoving ||
                isAwaitingFloorViewAdjust ||
                panelDisplayMode === "edit" ||
                (!isEditing && findBindingById(syncMarkerItem.id)?.buttonHidden === true))
            )
              return;
            if (syncMarkerElement.dataset.dragged === "true") {
              syncMarkerElement.dataset.dragged = "";
              return;
            }
            const clickedMarkerId =
                !isEditing && markerClickEvent.detail > 0
                  ? pickMarkerAtPoint(markerClickEvent, syncMarkerItem.id)
                  : syncMarkerItem.id,
              target = isEditing
                ? syncMarkerItem.id
                : ms2.target(markerClickEvent, clickedMarkerId);
            target && activateMarker(target, true);
          }),
          syncMarkerElement.addEventListener("pointerdown", (markerDragEvent: any) =>
            beginMarkerDrag(markerDragEvent, syncMarkerItem.id),
          ),
          syncMarkerElement.addEventListener("pointermove", moveMarkerDrag),
          syncMarkerElement.addEventListener("pointerup", endMarkerDrag),
          syncMarkerElement.addEventListener("pointercancel", cancelMarkerDrag),
          markerLayerElement.append(syncMarkerElement),
          map.set(syncMarkerItem.id, syncMarkerElement));
      }
      const icon2 = /^mdi:[a-z0-9-]+$/.test(syncMarkerItem.icon || "") ? syncMarkerItem.icon : "",
        isVacuumDevice = syncMarkerItem.deviceKind === "vacuum",
        isVacuumRoomDevice = syncMarkerItem.deviceKind === "vacuum-room";
      if (syncMarkerItem.isCurtainGroup) {
        const memberIconList = syncMarkerItem.memberItems.map((memberIconItem: any) =>
            /^mdi:[a-z0-9-]+$/.test(memberIconItem.icon || "")
              ? memberIconItem.icon
              : "mdi:curtains",
          ),
          join = memberIconList.join("|");
        syncMarkerElement.dataset.groupIcons !== join &&
          ((syncMarkerElement.dataset.groupIcons = join),
          syncMarkerElement.replaceChildren(
            ...memberIconList.map((memberIconName: any) => {
              const groupIconElement = createStageElement(
                  "span",
                  "i3d-marker-icon i3d-curtain-group-icon",
                ),
                groupIconMaskUrl =
                  'url("/static/vendor/mdi/7.4.47/svg/' + memberIconName.slice(4) + '.svg")';
              return (
                groupIconElement.style.setProperty("mask-image", groupIconMaskUrl),
                groupIconElement.style.setProperty("-webkit-mask-image", groupIconMaskUrl),
                groupIconElement
              );
            }),
          ));
      } else {
        if (
          !isVacuumDevice &&
          !syncMarkerItem.securityAlarm &&
          syncMarkerItem.deviceKind !== "smallcar" &&
          syncMarkerItem.deviceKind !== "temperature-humidity" &&
          syncMarkerElement.dataset.icon !== icon2
        ) {
          if (((syncMarkerElement.dataset.icon = icon2), icon2)) {
            const markerIconElement = createStageElement("span", "i3d-marker-icon");
            markerIconElement.setAttribute("aria-hidden", "true");
            const markerIconMaskUrl =
              'url("/static/vendor/mdi/7.4.47/svg/' + icon2.slice(4) + '.svg")';
            (markerIconElement.style.setProperty("mask-image", markerIconMaskUrl),
              markerIconElement.style.setProperty("-webkit-mask-image", markerIconMaskUrl),
              syncMarkerElement.replaceChildren(markerIconElement));
          } else syncMarkerElement.innerHTML = lampIconSvgMarkup;
        }
      }
      const markerPresentationState = syncMarkerItem.isCurtainGroup
          ? {
              available: syncMarkerItem.memberItems.some(
                (coverAvailabilityMember: any) =>
                  coverState2(
                    coverAvailabilityMember.entityId,
                    (deviceStates as any)[coverAvailabilityMember.entityId],
                    coverAvailabilityMember,
                  ).available,
              ),
              on: syncMarkerItem.memberItems.some((coverIconMember: any) =>
                coverIconIsOn2(
                  coverIconMember,
                  coverState2(
                    coverIconMember.entityId,
                    (deviceStates as any)[coverIconMember.entityId],
                    coverIconMember,
                  ),
                ),
              ),
            }
          : syncMarkerItem.deviceKind === "temperature-humidity"
            ? {
                available: temperatureHumidityEntities([syncMarkerItem]).some(
                  ({ entityId: humidityEntityId }) =>
                    readTemperatureHumidity(deviceStates[humidityEntityId]).available,
                ),
                on: false,
              }
            : syncMarkerItem.deviceKind?.startsWith("vacuum")
              ? {
                  available: !!(
                    (deviceStates as any)[syncMarkerItem.entityId] &&
                    !["unknown", "unavailable"].includes(
                      (deviceStates as any)[syncMarkerItem.entityId].state,
                    )
                  ),
                  on: (deviceStates as any)[syncMarkerItem.entityId]?.state === "cleaning",
                }
              : syncMarkerItem.deviceKind === "lock"
                ? (() => {
                    const lockState = lockState2(syncMarkerItem, deviceStates);
                    return {
                      available: lockState.available,
                      on: lockState.state === "unlocked" || lockState.state === "open",
                      name: syncMarkerItem.label || "门",
                      lock: lockState,
                    };
                  })()
                : syncMarkerItem.deviceKind === "speaker"
                  ? speakerState2(syncMarkerItem, deviceStates)
                  : syncMarkerItem.deviceKind === "television"
                    ? televisionState2(syncMarkerItem, deviceStates)
                    : syncMarkerItem.deviceKind === "smallcar"
                      ? carState2(syncMarkerItem, deviceStates)
                      : isGenericDeviceKind2(syncMarkerItem.deviceKind)
                        ? deviceStatus2(syncMarkerItem, deviceStates)
                        : syncMarkerItem.deviceKind === "nas"
                          ? nasDeviceState2(syncMarkerItem, deviceStates)
                          : syncMarkerItem.deviceKind === "cover"
                            ? coverState2(
                                syncMarkerItem.entityId,
                                (deviceStates as any)[syncMarkerItem.entityId],
                                syncMarkerItem,
                              )
                            : syncMarkerItem.modelId
                              ? syncMarkerItem.waterHeater && !syncMarkerItem.entityId
                                ? deviceStatus2(syncMarkerItem, deviceStates)
                                : syncMarkerItem.airPurifier
                                  ? purifierState2(syncMarkerItem, deviceStates)
                                  : syncMarkerItem.climateType === "bath-heater"
                                    ? bathHeaterState2(syncMarkerItem, deviceStates)
                                    : climateState2(
                                        syncMarkerItem.entityId,
                                        (deviceStates as any)[syncMarkerItem.entityId],
                                      )
                              : readLightState(syncMarkerItem.entityId),
        size =
          Number.isFinite(syncMarkerItem.size) && syncMarkerItem.size > 0
            ? syncMarkerItem.size
            : defaultButtonSize,
        iconSize = resolveMarkerIconSize(syncMarkerItem, size, isVacuumDevice, resolveButtonIconSize),
        hitSize =
          Number.isFinite(syncMarkerItem.hitSize) && syncMarkerItem.hitSize > 0
            ? syncMarkerItem.hitSize
            : Math.max(defaultButtonSize, size),
        scaleXFactor = 1,
        scaleYFactor = 1,
        baseScaleFactor = scaleXFactor,
        scaledSizeX = size * scaleXFactor,
        scaledSizeY = size * scaleYFactor,
        scaledIconSizeX = iconSize * scaleXFactor,
        scaledIconSizeY = iconSize * scaleYFactor,
        scaledHitSizeX = hitSize * scaleXFactor,
        scaledHitSizeY = hitSize * scaleYFactor;
      if (
        ((syncMarkerElement.style.width = scaledHitSizeX + "px"),
        (syncMarkerElement.style.height = scaledHitSizeY + "px"),
        syncMarkerItem.isCurtainGroup &&
          ((syncMarkerElement.style.width =
            Math.max(
              scaledHitSizeX,
              scaledSizeX * 2 + 4 * scaleXFactor,
              scaledIconSizeX * 2 + 12 * scaleXFactor,
            ) + "px"),
          (syncMarkerElement.style.height =
            Math.max(scaledHitSizeY, scaledSizeY, scaledIconSizeY + 8 * scaleYFactor) + "px")),
        syncMarkerElement.classList.toggle("is-vacuum-status", isVacuumDevice),
        syncMarkerElement.classList.toggle(
          "is-curtain-group",
          syncMarkerItem.isCurtainGroup === true,
        ),
        syncMarkerElement.classList.toggle(
          "is-overview-quip",
          syncMarkerItem.overviewQuip === true,
        ),
        (syncMarkerElement.style.pointerEvents =
          syncMarkerItem.overviewQuip ||
          (syncMarkerItem.passiveSensor && syncMarkerItem.deviceKind !== "temperature-humidity")
            ? "none"
            : ""),
        syncMarkerElement.classList.toggle(
          "is-presence-wave",
          syncMarkerItem.passiveSensor === true &&
            syncMarkerItem.deviceKind !== "temperature-humidity",
        ),
        syncMarkerElement.classList.toggle(
          "is-security-label",
          syncMarkerItem.deviceKind === "lock" ||
            syncMarkerItem.deviceKind === "camera" ||
            syncMarkerItem.deviceKind === "presence",
        ),
        syncMarkerElement.classList.toggle("is-lock-label", syncMarkerItem.deviceKind === "lock"),
        syncMarkerElement.classList.toggle(
          "is-temperature-humidity",
          syncMarkerItem.deviceKind === "temperature-humidity",
        ),
        syncMarkerElement.classList.toggle(
          "is-editable-temperature-humidity",
          syncMarkerItem.deviceKind === "temperature-humidity" && isEditing,
        ),
        syncMarkerItem.deviceKind === "temperature-humidity")
      ) {
        let selector = syncMarkerElement.querySelector(".i3d-temperature-humidity-card");
        if (!selector) {
          selector = createStageElement("span", "i3d-temperature-humidity-card");
          const environmentHeaderElement = createStageElement("span", "i3d-environment-header"),
            batteryRowElement = createStageElement("span", "i3d-environment-battery"),
            batteryIconElement = createStageElement("i", "i3d-meter-icon");
          batteryIconElement.setAttribute("aria-hidden", "true");
          const batteryIconMaskUrl = "url('/static/vendor/mdi/7.4.47/svg/battery.svg')";
          (batteryIconElement.style.setProperty("mask-image", batteryIconMaskUrl),
            batteryIconElement.style.setProperty("-webkit-mask-image", batteryIconMaskUrl),
            batteryRowElement.append(
              batteryIconElement,
              createStageElement("span", "i3d-meter-label", "电量"),
              createStageElement("span", "i3d-meter-number"),
            ),
            environmentHeaderElement.append(
              createStageElement("strong", "i3d-temperature-humidity-title"),
              batteryRowElement,
            ),
            selector.append(
              environmentHeaderElement,
              createStageElement("span", "i3d-temperature-humidity-values"),
            ));
          for (const {
            key: metricKey,
            label: metricLabelText,
            icon: metricIconName,
          } of environmentMetricNames) {
            const metricReadingElement = createStageElement(
                "span",
                "i3d-meter-reading is-" + metricKey,
              ),
              metricReadingIconElement = createStageElement("i", "i3d-meter-icon");
            metricReadingIconElement.setAttribute("aria-hidden", "true");
            const metricIconMaskUrl =
              "url('/static/vendor/mdi/7.4.47/svg/" + metricIconName + ".svg')";
            (metricReadingIconElement.style.setProperty("mask-image", metricIconMaskUrl),
              metricReadingIconElement.style.setProperty("-webkit-mask-image", metricIconMaskUrl),
              metricReadingElement.setAttribute("aria-label", metricLabelText),
              (metricReadingElement.title = metricLabelText),
              metricReadingElement.append(
                metricReadingIconElement,
                createStageElement("span", "i3d-meter-label", metricLabelText),
                createStageElement("span", "i3d-meter-number"),
                createStageElement("span", "i3d-meter-unit"),
              ),
              selector.lastElementChild.append(metricReadingElement));
          }
          syncMarkerElement.replaceChildren(selector);
        }
        const humidityTitleElement = selector.querySelector(".i3d-temperature-humidity-title");
        ((humidityTitleElement.textContent = syncMarkerItem.label ?? "环境标签"),
          (humidityTitleElement.hidden = !humidityTitleElement.textContent));
        const isMetricNamesVisible = syncMarkerItem.showMetricNames !== false;
        selector.classList.toggle("is-metric-names-hidden", !isMetricNamesVisible);
        const batteryPanelElement = selector.querySelector(".i3d-environment-battery"),
          ar2 = readTemperatureHumidity((deviceStates as any)[syncMarkerItem.batteryEntityId]);
        ((batteryPanelElement.hidden = !syncMarkerItem.batteryEntityId),
          (batteryPanelElement.querySelector(".i3d-meter-label").hidden = !isMetricNamesVisible),
          batteryPanelElement.classList.toggle("is-unavailable", !ar2.available));
        const batteryValueText = "" + ar2.value + (ar2.available ? ar2.unit || "%" : "");
        ((batteryPanelElement.querySelector(".i3d-meter-number").textContent = batteryValueText),
          batteryPanelElement.setAttribute("aria-label", "电量 " + batteryValueText),
          (selector.querySelector(".i3d-environment-header").hidden =
            humidityTitleElement.hidden && batteryPanelElement.hidden));
        const some5 = environmentMetricNames.some(
          ({ key: metricEntitySuffix }) => syncMarkerItem[metricEntitySuffix + "EntityId"],
        );
        selector.querySelector(".i3d-temperature-humidity-values").hidden = !some5;
        for (const { key: metricLoopKey } of environmentMetricNames) {
          const metricEntityId = syncMarkerItem[metricLoopKey + "EntityId"],
            ar3 = readTemperatureHumidity((deviceStates as any)[metricEntityId]),
            metricRowElement = selector.querySelector(".is-" + metricLoopKey);
          ((metricRowElement.hidden = !metricEntityId),
            (metricRowElement.querySelector(".i3d-meter-label").hidden = !isMetricNamesVisible),
            metricRowElement.classList.toggle("is-unavailable", !ar3.available),
            (metricRowElement.querySelector(".i3d-meter-number").textContent = ar3.value));
          const metricUnitElement = metricRowElement.querySelector(".i3d-meter-unit");
          ((metricUnitElement.textContent = ar3.unit), (metricUnitElement.hidden = !ar3.unit));
        }


        const min = Math.min(
          maxLabelSize,
          Math.max(minLabelSize, Number(syncMarkerItem.size) || defaultLabelSize),
        );
        ((selector.style.fontSize =
          Math.min(
            maxLabelIconSize,
            Math.max(minLabelIconSize, Number(syncMarkerItem.iconSize) || defaultLabelIconSize),
          ) + "px"),
          selector.style.setProperty(
            "--meter-background-opacity",
            String(
              Number.isFinite(syncMarkerItem.opacity)
                ? Math.min(1, Math.max(0, syncMarkerItem.opacity))
                : 1,
            ),
          ),
          (selector.style.width = min + "px"),
          layoutEnvironmentReadings(selector, syncMarkerItem.columns),
          (selector.style.transformOrigin = "top left"),
          (selector.style.transform = "scale(" + scaleXFactor + ", " + scaleYFactor + ")"),
          (syncMarkerElement.style.width =
            Math.min(
              maxLabelSize,
              Math.max(minLabelSize, Number(syncMarkerItem.size) || defaultLabelSize),
            ) *
            scaleXFactor +
            "px"),
          (syncMarkerElement.style.height =
            Math.max(44, selector.offsetHeight || 48) * scaleYFactor + "px"),
          syncMarkerElement.setAttribute("role", isEditing ? "button" : "group"),
          isEditing
            ? syncMarkerElement.setAttribute("tabindex", "0")
            : syncMarkerElement.removeAttribute("tabindex"));
      }
      if (
        (syncMarkerElement.classList.toggle(
          "is-car-status",
          syncMarkerItem.deviceKind === "smallcar",
        ),
        syncMarkerItem.deviceKind === "smallcar" &&
          (updateCarCard2(syncMarkerElement, syncMarkerItem, deviceStates),
          (syncMarkerElement.style.pointerEvents = isEditing ? "" : "none"),
          syncMarkerElement.setAttribute("role", isEditing ? "button" : "group"),
          isEditing
            ? syncMarkerElement.setAttribute("tabindex", "0")
            : syncMarkerElement.removeAttribute("tabindex")),
        isVacuumDevice)
      ) {
        syncMarkerElement.style.setProperty(
          "--label-background-opacity",
          String(labelBackgroundOpacity(syncMarkerItem.backgroundOpacity)),
        );
        let vacuumStatusElement = syncMarkerElement.querySelector(".i3d-vacuum-status");
        (!vacuumStatusElement ||
          vacuumStatusElement.dataset.compact !== String(syncMarkerItem.overviewQuip === true)) &&
          ((vacuumStatusElement = createStageElement("span", "i3d-vacuum-status")),
          (vacuumStatusElement.dataset.compact = String(syncMarkerItem.overviewQuip === true)),
          syncMarkerItem.overviewQuip ||
            (vacuumStatusElement.append(
              createStageElement("strong", "i3d-vacuum-status-name"),
              createStageElement("span", "i3d-vacuum-status-detail"),
            ),
            vacuumStatusElement.lastElementChild.append(
              createStageElement("span", "i3d-vacuum-status-text"),
              createStageElement("span", "i3d-vacuum-status-battery"),
            )),
          vacuumStatusElement.append(createStageElement("span", "i3d-vacuum-quip")),
          syncMarkerItem.overviewQuip &&
            (Object.assign(vacuumStatusElement.style, {
              opacity: ".55",
              pointerEvents: "none",
              background: "none",
              border: "none",
              boxShadow: "none",
              backdropFilter: "none",
              webkitBackdropFilter: "none",
            }),
            (vacuumStatusElement.lastElementChild.style.pointerEvents = "none")),
          syncMarkerElement.replaceChildren(vacuumStatusElement));
        const vacuumPresentation = vacuumStatusPresentation2(syncMarkerItem, deviceStates),
          vacuumScaleX = scaledSizeX / 44,
          vacuumScaleY = scaledSizeY / 44;
        syncMarkerItem.overviewQuip ||
          ((vacuumStatusElement.querySelector(".i3d-vacuum-status-name").textContent =
            syncMarkerItem.label || "扫地机器人"),
          (vacuumStatusElement.querySelector(".i3d-vacuum-status-text").textContent =
            vacuumPresentation.status),
          (vacuumStatusElement.querySelector(".i3d-vacuum-status-battery").textContent =
            vacuumPresentation.battery));
        const vacuumQuipElement = vacuumStatusElement.querySelector(".i3d-vacuum-quip");
        ((vacuumQuipElement.textContent = vacuumPresentation.active
          ? vacuumQuip2(syncMarkerItem, deviceStates, performance.now())
          : ""),
          (vacuumQuipElement.hidden = !vacuumQuipElement.textContent),
          (vacuumStatusElement.style.transform =
            "translate(-50%,-50%) scale(" + vacuumScaleX + "," + vacuumScaleY + ")"),
          (vacuumStatusElement.style.fontSize = Math.max(8, iconSize / 2) + "px"));
        const vacuumCardHeight = Math.max(
          syncMarkerItem.overviewQuip ? 28 : 50,
          vacuumStatusElement.offsetHeight,
        );
        ((syncMarkerElement.style.width = Math.max(scaledHitSizeX, 140 * vacuumScaleX) + "px"),
          (syncMarkerElement.style.height =
            Math.max(scaledHitSizeY, vacuumCardHeight * vacuumScaleY) + "px"),
          (syncMarkerElement.dataset.status = vacuumPresentation.status),
          (syncMarkerElement.title =
            (syncMarkerItem.label || "扫地机器人") +
            " · " +
            vacuumPresentation.status +
            " · " +
            vacuumPresentation.battery),
          (markerPresentationState.on = vacuumPresentation.active),
          (markerPresentationState.available = vacuumPresentation.available));
      }
      if (syncMarkerItem.securityAlarm) {
        const alarmReading = securityAlarmReading(syncMarkerItem, deviceStates);
        (syncMarkerElement.classList.toggle("is-alarm-card", true),
          syncMarkerElement.classList.toggle("is-editable-alarm-card", isEditing),
          (syncMarkerElement.style.pointerEvents = isEditing ? "auto" : "none"),
          renderSecurityAlarmCard(syncMarkerElement, syncMarkerItem, deviceStates),
          (markerPresentationState.available =
            alarmReading.available || alarmReading.status === "unbound"),
          (markerPresentationState.on = alarmReading.on),
          (syncMarkerElement.title = alarmReading.label + " · " + alarmReading.detail));
      }
      if (
        syncMarkerItem.deviceKind === "lock" ||
        syncMarkerItem.deviceKind === "camera" ||
        syncMarkerItem.deviceKind === "presence"
      ) {
        const securityDeviceState =
            (deviceStates as any)[syncMarkerItem.entityId]?.newState ||
            (deviceStates as any)[syncMarkerItem.entityId],
          lock = syncMarkerItem.deviceKind === "lock" ? markerPresentationState.lock : null,
          available2 =
            syncMarkerItem.deviceKind === "lock"
              ? lock.available
              : syncMarkerItem.deviceKind === "camera"
                ? cameraOnline2(securityDeviceState)
                : securityDeviceState?.available !== false &&
                  !!securityDeviceState?.state &&
                  !["unknown", "unavailable"].includes(securityDeviceState.state);
        if (
          ((markerPresentationState.available = available2),
          (markerPresentationState.on =
            syncMarkerItem.deviceKind === "lock"
              ? lock.state === "unlocked" || lock.state === "open"
              : syncMarkerItem.deviceKind === "camera"
                ? securityDeviceState?.state === "recording"
                : securityDeviceState?.state === "on"),
          syncMarkerItem.passiveSensor)
        )
          (syncMarkerElement.querySelector(".i3d-sensor-wave") ||
            syncMarkerElement.replaceChildren(
              ...[0, 1, 2].map(() => createStageElement("span", "i3d-sensor-wave")),
            ),
            (syncMarkerElement.hidden = !available2),
            syncMarkerElement.setAttribute("aria-hidden", "true"),
            syncMarkerElement.classList.toggle("is-inactive", !available2));
        else {
          const isPresenceChoice = syncMarkerItem.deviceKind === "presence" && isEditing;
          syncMarkerElement.classList.toggle("is-sensor-choice", isPresenceChoice);
          let securityLabelElement = syncMarkerElement.querySelector(".i3d-security-label");
          (securityLabelElement ||
            ((securityLabelElement = createStageElement("span", "i3d-security-label")),
            securityLabelElement.append(createStageElement("strong"), createStageElement("span")),
            syncMarkerElement.append(securityLabelElement)),
            (securityLabelElement.children[0].textContent =
              syncMarkerItem.label ||
              (syncMarkerItem.deviceKind === "lock"
                ? "门"
                : syncMarkerItem.deviceKind === "camera"
                  ? "摄像头"
                  : "人体传感器")));
          const entityId3 =
            syncMarkerItem.deviceKind === "lock" &&
            (syncMarkerItem.doorEntityId ||
              syncMarkerItem.doorEventEntityId ||
              syncMarkerItem.doorOpenEntityId ||
              syncMarkerItem.doorCloseEntityId ||
              syncMarkerItem.batteryEntityId ||
              syncMarkerItem.entityId);
          if (
            ((securityLabelElement.children[1].textContent =
              isEditing &&
              !(syncMarkerItem.deviceKind === "lock" ? entityId3 : syncMarkerItem.entityId)
                ? "未绑定实体"
                : available2
                  ? syncMarkerItem.deviceKind === "lock"
                    ? "" +


                      (lock.doorOpenLabel ||
                        (lock.doorOpen === true
                          ? "门已打开"
                          : lock.doorOpen === false
                            ? "门已关闭"
                            : "门状态未知")) +
                      (syncMarkerItem.batteryEntityId && lock.battery !== "—"
                        ? " · " + lock.battery
                        : "")
                    : syncMarkerItem.deviceKind === "presence"
                      ? securityDeviceState.state === "on"
                        ? "有人"
                        : "检测中"
                      : "在线"
                  : "离线"),
            (securityLabelElement.children[1].hidden = isPresenceChoice),
            securityLabelElement.classList.toggle(
              "is-camera-status",
              syncMarkerItem.deviceKind === "camera",
            ),
            securityLabelElement.classList.toggle(
              "is-lock-status",
              syncMarkerItem.deviceKind === "lock",
            ),
            securityLabelElement.classList.toggle("is-camera-offline", !available2),
            (securityLabelElement.hidden = !isLockLabelShown(syncMarkerItem, lock)),
            (securityLabelElement.style.fontSize = (syncMarkerItem.fontSize || cardTextSizePx) + "px"),
            securityLabelElement.style.setProperty(
              "--label-background-opacity",
              String(labelBackgroundOpacity(syncMarkerItem.backgroundOpacity)),
            ),
            syncMarkerItem.deviceKind === "camera" || syncMarkerItem.deviceKind === "lock")
          ) {
            const securityMarkerIconElement = syncMarkerElement.querySelector(".i3d-marker-icon");
            (securityMarkerIconElement &&
              securityMarkerIconElement.parentNode !== securityLabelElement &&
              securityLabelElement.append(securityMarkerIconElement),
              securityLabelElement.style.setProperty("--i3d-marker-icon-size", iconSize + "px"));
          }
          (syncMarkerElement.style.setProperty("--i3d-security-scale", String(scaledSizeX / 44)),
            syncMarkerElement.style.setProperty("--i3d-security-scale-y", String(scaledSizeY / 44)),
            (syncMarkerElement.style.width =
              Math.max(
                scaledHitSizeX,
                ((syncMarkerItem.deviceKind === "camera"
                  ? securityLabelElement.offsetWidth || 0
                  : isPresenceChoice
                    ? 120
                    : 180) *
                  scaledSizeX) /
                  44,
              ) + "px"),
            (syncMarkerElement.style.height =
              Math.max(
                scaledHitSizeY,
                ((syncMarkerItem.deviceKind === "camera"
                  ? securityLabelElement.offsetHeight || 0
                  : isPresenceChoice
                    ? 32
                    : 58) *
                  scaledSizeY) /
                  44,
              ) + "px"));
        }
      }
      if (
        (syncMarkerElement.classList.toggle("i3d-vacuum-room", isVacuumRoomDevice),
        syncMarkerElement.classList.toggle(
          "is-icon-hidden",
          isVacuumRoomDevice && syncMarkerItem.iconHidden === true,
        ),
        isVacuumRoomDevice)
      ) {
        let vacuumRoomLabelElement = syncMarkerElement.querySelector(".i3d-room-label");
        (vacuumRoomLabelElement ||
          ((vacuumRoomLabelElement = createStageElement("span", "i3d-room-label")),
          syncMarkerElement.append(vacuumRoomLabelElement)),
          (vacuumRoomLabelElement.textContent = syncMarkerItem.label || "清扫"),
          (vacuumRoomLabelElement.hidden = syncMarkerItem.labelHidden === true),
          (vacuumRoomLabelElement.style.fontSize =
            (syncMarkerItem.fontSize || cardTextSizePx) * baseScaleFactor + "px"));
      }
      (syncMarkerElement.style.setProperty("--i3d-marker-size", scaledSizeX + "px"),
        syncMarkerElement.style.setProperty("--i3d-marker-size-y", scaledSizeY + "px"),
        syncMarkerElement.style.setProperty("--i3d-marker-icon-size", scaledIconSizeX + "px"),
        syncMarkerElement.style.setProperty("--i3d-marker-icon-size-y", scaledIconSizeY + "px"),
        syncMarkerItem.deviceKind !== "smallcar" &&
          syncMarkerElement.setAttribute(
            "aria-label",
            syncMarkerItem.overviewQuip
              ? vacuumQuip2(syncMarkerItem, deviceStates, performance.now())
              : syncMarkerItem.label || markerPresentationState.name || "灯光",
          ),
        !isVacuumDevice &&
          syncMarkerItem.deviceKind !== "smallcar" &&
          (syncMarkerElement.title = syncMarkerItem.label || markerPresentationState.name));
      const playing =
        syncMarkerItem.deviceKind === "speaker"
          ? markerPresentationState.available && markerPresentationState.playing
          : syncMarkerItem.deviceKind === "cover"
            ? coverIconIsOn2(syncMarkerItem, markerPresentationState)
            : markerPresentationState.on;
      (syncMarkerElement.classList.toggle(
        "is-on",
        !isVacuumDevice && syncMarkerItem.deviceKind !== "smallcar" && playing,
      ),
        syncMarkerElement.classList.toggle(
          "is-offline",
          !isEditing && !markerPresentationState.available,
        ),
        syncMarkerElement.classList.toggle("is-nas", syncMarkerItem.deviceKind === "nas"),
        syncMarkerElement.classList.toggle("is-selected", isEditing && text === syncMarkerItem.id));
    }
    // 全屏报警由父页 runtime 挂到 document.body；iframe 内仅保留卡片，避免只盖住 3D 区域。
    securityAlarmOverlay.update(
      securityAlarmReadings(
        overlayEligibleAlarms(options.security?.alarms || []),
        deviceStates,
      ),
      false,
      options.sceneStyle === "warm-wood" ? "warm-wood" : "default",
    );
    ((!markerChange || markerChange.lighting) && applyLightStates(undefined, markerChange),
      (!markerChange || markerChange.environment) && refreshStageUi());
    const isPanelAffected =
      !markerChange || !!(focusedItemId && markerChange.affects(getFocusedEntry()));
    (isPanelAffected && updateDevicePanel(),
      (!markerChange || hasMarkerChange || isPanelAffected) &&
        (syncLayoutMetrics(), syncStageVisibility(), renderMarkerPositions(true)));
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
  function beginMarkerDrag(dragStartEvent: any, dragMarkerId: any) {
    if (!isEditing || panelDisplayMode || dragStartEvent.button !== 0) return;
    (dragStartEvent.preventDefault(), dragStartEvent.stopPropagation());
    const dragMarkerItem = findBindingById(dragMarkerId);
    if (!dragMarkerItem) return;
    if (dragMarkerItem.deviceKind === "presence") {
      ((text = dragMarkerId),
        refreshStageUi(),
        postHostMessage({
          type: "edit",
          action: "select",
          id: dragMarkerId,
        }));
      return;
    }
    ((text = dragMarkerId),
      refreshStageUi(),
      postHostMessage({
        type: "edit",
        action: "select",
        id: dragMarkerId,
      }));
    const dragStartFloorPoint = screenPointToFloor(dragStartEvent, dragMarkerItem);
    ((activePointerDrag = {
      id: dragMarkerId,
      pointerId: dragStartEvent.pointerId,
      clientX: dragStartEvent.clientX,
      clientY: dragStartEvent.clientY,
      original: {
        x: dragMarkerItem.x,
        y: dragMarkerItem.y,
      },
      point: {
        x: dragMarkerItem.x,
        y: dragMarkerItem.y,
      },
      height: dragMarkerItem.height,
      offset: dragStartFloorPoint
        ? {
            x: dragMarkerItem.x - dragStartFloorPoint.x,
            y: dragMarkerItem.y - dragStartFloorPoint.y,
          }
        : {
            x: 0,
            y: 0,
          },
      moved: false,
    }),
      dragStartEvent.currentTarget.setPointerCapture(dragStartEvent.pointerId),
      (mountOptions.controls.enabled = false));
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
  function endMarkerDrag(dragEndEvent: any) {
    if (!(!activePointerDrag || activePointerDrag.pointerId !== dragEndEvent.pointerId)) {
      if (activePointerDrag.moved) {
        dragEndEvent.currentTarget.dataset.dragged = "true";
        const draggedMarkerItem = findBindingById(activePointerDrag.id),
          draggedTargetEntry =
            draggedMarkerItem.deviceKind === "temperature-humidity"
              ? options.environment?.temperatureHumidity?.find(
                  (humidityCollectionItem: any) => humidityCollectionItem.id === draggedMarkerItem.id,
                )
              : draggedMarkerItem.isCurtainGroup
                ? options.environment?.curtainGroups?.find(
                    (curtainGroupCollectionItem: any) =>
                      curtainGroupEntryId2(curtainGroupCollectionItem) === draggedMarkerItem.id,
                  )
                : draggedMarkerItem.securityAlarm
                  ? options.security?.alarms?.find(
                      (alarmCollectionItem: any) =>
                        (alarmCollectionItem.kind || "smoke") +
                          ":" +
                          alarmCollectionItem.id ===
                        draggedMarkerItem.id,
                    )
                  : draggedMarkerItem.deviceKind === "camera"
                  ? options.security?.cameras?.find(
                      (cameraCollectionItem: any) =>
                        "camera:" + cameraCollectionItem.id === draggedMarkerItem.id,
                    )
                  : draggedMarkerItem.deviceKind === "vacuum-room"
                    ? options.devices?.vacuums
                        ?.find(
                          (vacuumCollectionItem: any) =>
                            vacuumCollectionItem.id === draggedMarkerItem.vacuumId,
                        )
                        ?.shortcuts?.find(
                          (shortcutCollectionItem: any) =>
                            shortcutCollectionItem.id === draggedMarkerItem.shortcutId,
                        )
                    : activeModule === "light"
                      ? draggedMarkerItem
                      : (isGenericDeviceKind2(activeModule)
                          ? options.devices?.[genericDeviceProfile2(activeModule).collection] || []
                          : ["nas", "television", "speaker", "vacuum"].includes(activeModule)
                            ? options.devices?.[
                                activeModule === "vacuum"
                                  ? "vacuums"
                                  : activeModule === "speaker"
                                    ? "speakers"
                                    : activeModule === "television"
                                      ? "televisions"
                                      : "nas"
                              ] || []
                            : options.environment?.[
                                activeModule === "airer"
                                  ? "airers"
                                  : activeModule === "cover"
                                    ? "curtains"
                                    : activeModule === "water-heater"
                                      ? "waterHeaters"
                                      : activeModule === "fan"
                                        ? "fans"
                                        : activeModule === "purifier"
                                          ? "airPurifiers"
                                          : "airConditioners"
                              ] || []
                        ).find(
                          (deviceCollectionItem: any) =>
                            deviceCollectionItem.id === activePointerDrag.id,
                        ),
          nextMarkerPosition = {
            ...activePointerDrag.point,
          };
        if (draggedMarkerItem.deviceKind === "smallcar") {
          const smallcarSceneItem = stageModelIndex.item(
            draggedMarkerItem.floorId,
            draggedMarkerItem.modelId,
          );
          ((nextMarkerPosition.x -= smallcarSceneItem?.x ?? 0),
            (nextMarkerPosition.y -= smallcarSceneItem?.y ?? 0));
        }
        (draggedTargetEntry && Object.assign(draggedTargetEntry, nextMarkerPosition),
          postHostMessage({
            type: "edit",
            action: "position",
            id: draggedMarkerItem.id,
            ...nextMarkerPosition,
          }));
      }
      ((activePointerDrag = null), syncCameraInteraction());
    }
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
  function handleHostMessage(hostMessageEvent: any) {
    if (
      hostMessageEvent.origin !== location.origin ||
      hostMessageEvent.source !== window.parent ||
      hostMessageEvent.data?.channel !== "hb-i3d-v1"
    )
      return;
    const data = hostMessageEvent.data;
    if ((data.type !== "states" && wakeSceneBackground(), data.type === "presentation-layout"))
      Number.isFinite(data.width) &&
        data.width > 0 &&
        Number.isFinite(data.height) &&
        data.height > 0 &&
        ((mediaViewportSize = {
          width: data.width,
          height: data.height,
        }),
        syncLayoutMetrics());
    else {
      if (data.type === "config") {
        if (isCameraMoving) {
          pendingEditorAction = hostMessageEvent;
          return;
        }
        ((isRangeEditorOnly = data.rangeEditorOnly === true),
          (canEditLightRange = data.allowRangeEditing === true || data.editing === true),
          isRangeEditorOpen &&
            (!canEditLightRange ||
              data.viewEditing === true ||
              data.properties?.lightingMode !== "region" ||
              data.properties?.floorSelection !== baseStageConfig.floorSelection ||
              JSON.stringify(data.properties?.camera) !== JSON.stringify(baseStageConfig.camera) ||
              JSON.stringify(data.properties?.lightRegionOverrides || {}) !==
                JSON.stringify(baseStageConfig.lightRegionOverrides || {})) &&
            rangeEditorHandle?.close(),
          (hasIdleIconActivity = false),
          focusedItemId.startsWith("vacuum:") &&
            JSON.stringify(
              (baseStageConfig.devices?.vacuums || []).find(
                (currentVacuumEntry: any) => "vacuum:" + currentVacuumEntry.id === focusedItemId,
              ),
            ) !==
              JSON.stringify(
                (data.properties.devices?.vacuums || []).find(
                  (nextVacuumEntry: any) => "vacuum:" + nextVacuumEntry.id === focusedItemId,
                ),
              ) &&
            exitFocusMode({
              immediate: true,
            }),
          (data.editing ||
            data.viewEditing ||
            baseStageConfig.floorSelection !== data.properties.floorSelection ||
            JSON.stringify(baseStageConfig.floorCameras) !==
              JSON.stringify(data.properties.floorCameras)) &&
            ((pendingFloorId = ""), (pendingModule = "")),
          (baseStageConfig = structuredClone(data.properties)),
          !hasAutoSelectedFloors &&
            !data.editing &&
            !data.viewEditing &&
            ((hasAutoSelectedFloors = true),
            mountOptions.document.floors.length > 1 && (pendingFloorId = "all")),
          pendingFloorId &&
            pendingFloorId !== "all" &&
            !mountOptions.document.floors.some(
              (knownFloorEntry: any) => knownFloorEntry.id === pendingFloorId,
            ) &&
            (pendingFloorId = ""),
          (data?.editing ||
            data?.viewEditing ||
            (baseStageConfig.floorSelection !== options.floorSelection && !pendingFloorId)) &&
            mountOptions.finishFloorTransition?.(),
          mountOptions.setFloorGap?.(baseStageConfig.floorGap),
          mountOptions.setUniformOverviewStack?.(baseStageConfig.uniformOverviewStack),
          (data.properties = buildFloorCameraConfig({
            ...baseStageConfig,
            ...(pendingFloorId
              ? {
                  floorSelection: pendingFloorId,
                }
              : {}),
          })),
          pendingFloorId && activeCameraPose
            ? (data.properties.camera = activeCameraPose)
            : pendingFloorId &&
              pendingFloorId !== baseStageConfig.floorSelection &&
              (data.properties.camera = transformFloorCamera(
                baseStageConfig.floorCameras?.[pendingFloorId] || null,
                pendingFloorId,
              )),
          idleRotationControl.activity(),
          idleIconVisibilityControl.activity(),
          idleFocusExitControl.activity());
        const isCameraChanged =
          (isAwaitingFloorViewAdjust && data.viewEditing !== true) ||
          JSON.stringify(options.camera) !== JSON.stringify(data.properties.camera);
        (panelDisplayMode || idleReturnCamera || cameraMotionSnapshot) &&
          (isCameraChanged ||
            options.sceneStyle !== data.properties.sceneStyle ||
            options.wallOpacity !== data.properties.wallOpacity ||
            options.floorSelection !== data.properties.floorSelection ||
            isEditing !== (data.editing === true) ||
            data.viewEditing === true ||
            (isEditing && text !== (data.selectedId || ""))) &&
          (exitFocusMode({
            immediate: true,
          }),
          cameraMotionSnapshot &&
            ((cameraMotionSnapshot = null),
            mountOptions.finishFloorTransition?.(),
            mountOptions.endCameraMotion()));
        const editingSecurityKind =
          data.editing === true &&
          ["camera", "presence", "lock", "moisture", "smoke", "gas"].includes(
            data.editingSecurityKind,
          )
            ? data.editingSecurityKind
            : "";
        ((data.editing !== true ||
          editingSecurityKind !== "lock" ||
          (text && text !== (data.selectedId || ""))) &&
          (selectedLockEntry = null),
          (options = structuredClone(data.properties)),
          (isEditing = data.editing === true),
          (selectedSecurityKind = editingSecurityKind),
          (isAwaitingFloorViewAdjust = data.viewEditing === true),
          (text = data.selectedId || ""),
          (deviceStates = data.states || {}),
          syncAirConditionerHistory(),
          (isNavigationVisible = data.editorCanvas === true && !isEditing),

          (navigationEditing = data.navigationEditing === true && isNavigationVisible),
          document.body?.dataset &&
            (document.body.dataset.sceneStyle =
              options.sceneStyle === "warm-wood" ? "warm-wood" : "default"),
          sceneBackgroundController.configure(options.backgroundTheme, options),
          (isControlReady = !isEditing && data.interactive === true),
          (editingVacuumId = data.editingVacuumId || ""),
          (configuredModuleKinds2 = configuredModuleKinds(options)));
        let editingModule = isEditing
          ? [
              "security",
              "climate",
              "fan",
              "purifier",
              "water-heater",
              "airer",
              "cover",
              "nas",
              "television",
              "speaker",
              "vacuum",
              "vacuum-shortcut",
              "temperature-humidity",
              ...GENERIC_DEVICE_KINDS2,
            ].includes(data.editingModule)
            ? data.editingModule
            : "light"
          : ["overview", "security", "light", "devices", "vacuum"].includes(activeModule)
            ? activeModule
            : [
                  "nas",
                  "television",
                  "speaker",
                  "water-heater",
                  "airer",
                  ...GENERIC_DEVICE_KINDS2,
                ].includes(activeModule)
              ? "devices"
              : "environment";
        (!isEditing &&
          editingModule !== "overview" &&
          !configuredModuleKinds2.includes(editingModule) &&
          (editingModule = "light"),
          pendingModule && !configuredModuleKinds2.includes(pendingModule) && (pendingModule = ""),
          activeModule !== editingModule &&
            (stopVacuumFollow(),
            exitFocusMode({
              immediate: true,
            }),
            cancelGhostAnimation(),
            (activeModule = editingModule),
            sceneCacheByKey.clear()));
        for (const queuedCommandEntry of lightGroupByKey.values())
          queuedCommandEntry.next &&
            (!isControlReady ||
              !(options.lights || []).some(
                (configuredLightItem: any) =>
                  configuredLightItem.entityId === queuedCommandEntry.entityId,
              )) &&
            (vector.reject(queuedCommandEntry.entityId, queuedCommandEntry.next.previewToken),
            (queuedCommandEntry.next = null));
        (configureIdleBehaviors(),
          syncAvailability(),
          mountOptions.appearance(
            applyRegionLightingPreset(
              isRangeEditorOpen
                ? {
                    ...options,
                    lightRegionOverrides: mountOptions.regionLighting.getOverrides(),
                  }
                : options,
            ),
          ));
        const floorSelection =
          mountOptions.document.floors.some(
            (configuredFloorEntry: any) => configuredFloorEntry.id === options.floorSelection,
          ) || options.floorSelection === "all"
            ? options.floorSelection
            : mountOptions.document.floors[0].id;
        (isEditing || (floorSelection === "all" && (activeModule = "overview")),
          selectedFloorId !== floorSelection
            ? (stopVacuumFollow(false),
              (selectedFloorId = floorSelection),
              mountOptions.setFloor(floorSelection),
              mountOptions.restoreCamera(
                normalizeCameraPose(
                  options.camera || mountOptions.floorDefaultCamera?.(floorSelection),
                ),
              ),
              (activeCameraPose = mountOptions.cameraState()))
            : isCameraChanged &&
              (mountOptions.restoreCamera(normalizeCameraPose(options.camera || activeCameraPose)),
              (activeCameraPose = mountOptions.cameraState())),
          syncCameraInteraction(),
          (toolbarElement.hidden = true),
          syncPanelChrome(),
          (isAwaitingFloorViewAdjust || (!isEditing && !isControlReady)) &&
            exitFocusMode({
              immediate: true,
            }),
          syncMarkers());
        const adoptGeneration = ++animationFrameRequestId;
        (isStagePresented ? Promise.resolve() : mountOptions.whenPresented())
          .then(() => {
            isControlBusy ||
              adoptGeneration !== animationFrameRequestId ||
              (isStagePresented || (activeCameraPose = mountOptions.cameraState()),
              (isStagePresented = true),
              syncAvailability(),
              renderMarkerPositions(true),
              noopStageCallback(),
              postHostMessage({
                type: "presented",
                configId: data.configId,
                camera: transformFloorCamera(
                  mountOptions.cameraState(),
                  options.floorSelection,
                  true,
                ),
              }));
          })
          .catch((adoptError: any) => {
            !isControlBusy &&
              adoptGeneration === animationFrameRequestId &&
              postHostMessage({
                type: "error",
                message: adoptError.message || "户型画面准备失败，请重新载入。",
              });
          });
      } else {
        if (data.type === "vacuum-room-result") {
          (clearTimeout(vacuumOverlayByKey.get(data.id)), vacuumOverlayByKey.delete(data.id));
          const roomResultMarkerElement = map.get(data.id);
          (roomResultMarkerElement &&
            ((roomResultMarkerElement.disabled = false),
            (roomResultMarkerElement.title = data.error || "")),
            data.error &&
              ((moduleEmptyElement.hidden = false), (moduleEmptyElement.textContent = data.error)));
        } else {
          if (data.type === "range-editor") {
            if (data.flush === true) {
              const rangeEditorFlushError =
                !canEditLightRange || !isRangeEditorOpen ? "请先打开照射范围编辑。" : "";
              (rangeEditorFlushError || rangeEditorHandle.flush(),
                postHostMessage({
                  type: "range-editor-state",
                  active: isRangeEditorOpen,
                  requestId: data.requestId,
                  ...(rangeEditorFlushError
                    ? {
                        error: rangeEditorFlushError,
                      }
                    : {}),
                }));
            } else {
              if (data.open === false) {
                isRangeEditorSuppressingClose = !!data.requestId;
                try {
                  rangeEditorHandle?.close();
                } finally {
                  isRangeEditorSuppressingClose = false;
                }
                data.requestId &&
                  postHostMessage({
                    type: "range-editor-state",
                    active: false,
                    requestId: data.requestId,
                  });
              } else openRangeEditor(data.requestId);
            }
          } else {
            if (data.type === "range-save-result")
              rangeEditorHandle?.setSaveStatus?.(data.error || "");
            else {
              if (data.type === "activity-state")
                ((hasPresentedOnce = true),
                  (isStageVisible = data.visible === true),
                  (isPresentedVisible =
                    data.presentedVisible === undefined
                      ? isStageVisible
                      : data.presentedVisible === true),
                  (!isStageVisible || !isPresentedVisible) &&
                    focusExitPointer &&
                    releaseFocusExit({
                      pointerId: focusExitPointer.pointerId,
                    }),
                  mountOptions.setPresentedVisible?.(isPresentedVisible),
                  syncVacuumMap(),
                  isStageVisible || (hasIdleIconActivity = false),
                  syncAvailability());
              else {
                if (data.type === "user-activity")
                  ((hasIdleIconActivity = false),
                    (furthestFloorOrder = performance.now()),
                    syncStageVisibility(),
                    (isPointerHeld = data.held === true),
                    syncIdleHold());
                else {
                  if (data.type === "dismiss-focus")
                    (idleRotationControl.activity(),
                      idleIconVisibilityControl.activity(),
                      stopVacuumFollow(data.immediate !== true),
                      exitFocusMode({
                        immediate: data.immediate === true,
                      }));
                  else {
                    if (data.type === "states") {
                      const stateUpdatePlan =
                          data.patch === true
                            ? stateUpdatePlanner.plan(options, data.states)
                            : null,
                        snapshotLightState = (patchedEntityId: any) =>
                          JSON.stringify([
                            resolveDeviceState(patchedEntityId),
                            readLightState(patchedEntityId),
                          ]),
                        lightOnlySnapshotMap = new Map(
                          (stateUpdatePlan?.lightOnlyIds || []).map((lightOnlyId) => [
                            lightOnlyId,
                            snapshotLightState(lightOnlyId),
                          ]),
                        );
                      ((deviceStates =
                        data.patch === true
                          ? {
                              ...deviceStates,
                              ...(data.states || {}),
                            }
                          : data.states || {}),
                        syncAirConditionerHistory(stateUpdatePlan));
                      for (const patchedLightItem of options.lights || [])
                        (data.patch !== true ||
                          Object.hasOwn(data.states || {}, patchedLightItem.entityId)) &&
                          vector.reconcile(
                            patchedLightItem.entityId,
                            resolveDeviceState(patchedLightItem.entityId),
                          );
                      for (const [trackedLightId, previousLightSnapshot] of lightOnlySnapshotMap)
                        snapshotLightState(trackedLightId) === previousLightSnapshot &&
                          stateUpdatePlan!.changed.delete(trackedLightId);
                      (!stateUpdatePlan || stateUpdatePlan.changed.size) &&
                        syncMarkers(stateUpdatePlan);
                    } else {
                      if (data.type === "control-result")
                        mediaControlRequestsByRequestId.has(data.requestId)
                          ? settleMediaRequest(data.requestId, data.error)
                          : coverControlRequestsByRequestId.has(data.requestId)
                            ? failCoverRequest(data.requestId, data.error)
                            : pendingControlRequestsByRequestId.has(data.requestId)
                              ? settleClimateRequest(data.requestId, data.error)
                              : settleControlCommand(
                                  data.requestId,
                                  data.error || "",
                                  data.timedOut === true,
                                );
                      else {
                        if (data.type === "editor-command" && isEditing)
                          try {
                            if (data.command === "preview-lock-motion") {
                              if (selectedSecurityKind !== "lock") throw new Error("请先选择门。");
                              const previewLockMarkerItem = findBindingById(data.id);
                              if (
                                previewLockMarkerItem?.deviceKind !== "lock" ||
                                !previewLockMarkerItem.modelAvailable
                              )
                                throw new Error("请选择可用的门模型。");
                              ((selectedLockEntry = {
                                id: data.id,
                                open: data.value !== "closed",
                              }),
                                wakeSceneBackground(),
                                syncCameraInteraction());
                              return;
                            } else {
                              if (data.command === "presence-top-view") {
                                const { floorId: presenceFloorId, box: presenceViewBox } =
                                  data.value || {};
                                if (
                                  !presenceViewBox ||
                                  ![
                                    presenceViewBox.x,
                                    presenceViewBox.y,
                                    presenceViewBox.w,
                                    presenceViewBox.h,
                                  ].every(Number.isFinite) ||
                                  presenceViewBox.w <= 0 ||
                                  presenceViewBox.h <= 0
                                )
                                  throw new Error("顶视图范围无效。");
                                const worldPoint2 = mountOptions.worldPoint(
                                    presenceFloorId,
                                    presenceViewBox.x + presenceViewBox.w / 2,
                                    presenceViewBox.y + presenceViewBox.h / 2,
                                    0,
                                  ),
                                  worldPoint3 = mountOptions.worldPoint(
                                    presenceFloorId,
                                    presenceViewBox.x,
                                    presenceViewBox.y,
                                    0,
                                  ),
                                  worldPoint4 = mountOptions.worldPoint(
                                    presenceFloorId,
                                    presenceViewBox.x + presenceViewBox.w,
                                    presenceViewBox.y + presenceViewBox.h,
                                    0,
                                  );
                                if (!worldPoint2 || !worldPoint3 || !worldPoint4)
                                  throw new Error("请选择有效楼层。");
                                const presenceFrameSize = Math.max(
                                  Math.abs(worldPoint4.z - worldPoint3.z),
                                  Math.abs(worldPoint4.x - worldPoint3.x) /
                                    (canvasElement.clientWidth /
                                      Math.max(1, canvasElement.clientHeight)),
                                );
                                (exitFocusMode({
                                  immediate: true,
                                }),
                                  mountOptions.restoreCamera({
                                    mode: "orthographic",
                                    view: "top",
                                    topRotation: 0,
                                    position: [
                                      worldPoint2.x,
                                      worldPoint2.y + Math.max(20, presenceFrameSize * 2),
                                      worldPoint2.z,
                                    ],
                                    target: worldPoint2.toArray(),
                                    up: [0, 0, -1],
                                    zoom: 1,
                                    frameSize: presenceFrameSize,
                                  }));
                              } else {
                                if (data.command === "presence-3d-view")
                                  (mountOptions.setCameraView?.("free"),
                                    mountOptions.restoreCamera(
                                      options.camera ||
                                        mountOptions.floorDefaultCamera?.(selectedFloorId) ||
                                        activeCameraPose,
                                    ));
                                else {
                                  if (data.command === "presence-preview-walk")
                                    ((isPresencePressed = data.value === true),
                                      syncPresenceScene());
                                  else {
                                    if (data.command === "presence-show-hit-range")
                                      ((isPresenceEditing = data.value === true),
                                        layoutPresenceHitBoxes());
                                    else {
                                      if (data.command === "edit-follow-camera") {
                                        const followMarkerItem = findBindingById(data.id);
                                        if (followMarkerItem?.deviceKind !== "vacuum")
                                          throw new Error("请选择扫地机。");
                                        focusMarkerById(data.id, "edit", true);
                                        const followCameraTarget =
                                          mountOptions.environmentModelPose(
                                            followMarkerItem.floorId,
                                            followMarkerItem.modelId,
                                          )?.center || mountOptions.cameraState().target;
                                        startCameraMotion(
                                          followMarkerItem.followCamera ||
                                            vacuumBirdCamera2(
                                              options.camera || mountOptions.cameraState(),
                                              followCameraTarget,
                                            ),
                                          false,
                                          true,
                                        );
                                      } else {
                                        if (data.command === "edit-light-camera")
                                          focusMarkerById(data.id, "edit", true);
                                        else {
                                          if (data.command === "preview-light-camera")
                                            focusMarkerById(data.id, "preview");
                                          else {
                                            if (data.command === "preview-device-panel")
                                              focusMarkerById(data.id, "panel");
                                            else {
                                              if (data.command === "preview-light-effect") {
                                                if (
                                                  ![
                                                    "brightnessMin",
                                                    "brightnessMax",
                                                    "temperatureMin",
                                                    "temperatureMax",
                                                    "defaults",
                                                  ].includes(data.value)
                                                )
                                                  throw new Error("请选择要预览的效果。");
                                                if (!findBindingById(data.id))
                                                  throw new Error("灯光按钮已移除。");
                                                if (!findBindingById(data.id).entityId)
                                                  throw new Error("请先绑定实体，再预览灯光效果。");
                                                (focusMarkerById(data.id, "preview"),
                                                  (lightEditPreview = {
                                                    id: data.id,
                                                    kind: data.value,
                                                  }),
                                                  applyLightStates({
                                                    preview: true,
                                                  }),
                                                  updateDevicePanel());
                                              } else {
                                                if (data.command === "cancel-light-camera")
                                                  exitFocusMode({
                                                    immediate: true,
                                                  });
                                                else {
                                                  if (
                                                    panelDisplayMode !== "edit" ||
                                                    data.id !== focusedItemId
                                                  )
                                                    throw new Error("请先进入视角调整。");
                                                  (data.command === "focus-projection" &&
                                                    mountOptions.setCameraProjection(data.value),
                                                    data.command === "focus-focal-length" &&
                                                      mountOptions.setCameraFocalLength(
                                                        data.value,
                                                      ));
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                            syncCameraInteraction();
                            const editCameraSnapshot = applyDefaultCamera();
                            (postHostMessage({
                              type: "edit",
                              action: "focus-camera",
                              requestId: data.requestId,
                              id: data.id,
                              camera: editCameraSnapshot,
                            }),
                              data.command === "save-light-camera" &&
                                exitFocusMode({
                                  immediate: true,
                                }));
                          } catch (editorCommandError: any) {
                            postHostMessage({
                              type: "edit",
                              action: "focus-camera",
                              requestId: data.requestId,
                              error: editorCommandError.message,
                            });
                          }
                        else
                          data.type === "editor-command" &&
                            isAwaitingFloorViewAdjust &&
                            (data.command === "projection" &&
                              mountOptions.setCameraProjection(data.value),
                            data.command === "focal-length" &&
                              mountOptions.setCameraFocalLength(data.value),
                            syncCameraInteraction(),
                            (data.command === "save-camera" || data.requestId) &&
                              postHostMessage({
                                type: "edit",
                                action: "camera",
                                requestId: data.requestId,
                                camera: applyDefaultCamera(),
                              }));
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
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
  async function adoptSceneUpdate(sceneUpdateInput: any) {
    const savedScene = mountOptions.savedScene,
      currentCameraSnapshot = applyDefaultCamera(),
      sceneAdoptStartTime = performance.now(),
      reportLifecycle = (lifecyclePhase: any) => {
        try {
          Promise.resolve(
            mountOptions.reportLifecycle?.(lifecyclePhase, {
              sourceRevision: sceneUpdateInput?.revision,
              floorCount: sceneUpdateInput?.scene?.floors?.length,
              durationMs: Math.max(0, performance.now() - sceneAdoptStartTime),
            }),
          ).catch(() => {});
        } catch {}
      };
    (reportLifecycle("source-adopt-start"),
      (hasIdleIconActivity =
        hasIdleIconActivity ||
        (isCameraRotating && pageBehavior.hideIconsWhileRotating === true) ||
        isUserActive),
      (isCameraMoving = true),
      idleRotationControl.activity(),
      syncStageVisibility());
    let releaseSceneCover = () => {},
      hasCoveredScene = false;
    const applySceneUpdate = async (nextSceneUpdate: any) => {
      if (
        (mountOptions.finishFloorTransition?.(),
        await mountOptions.replaceScene(nextSceneUpdate),
        isControlBusy)
      )
        return;
      (mountOptions.setFloorGap?.(baseStageConfig.floorGap),
        mountOptions.setUniformOverviewStack?.(baseStageConfig.uniformOverviewStack));
      const floorSelection2 = pendingFloorId || baseStageConfig.floorSelection,
        resolvedFloorId =
          mountOptions.document.floors.some(
            (resolvedFloorEntry: any) => resolvedFloorEntry.id === floorSelection2,
          ) || floorSelection2 === "all"
            ? floorSelection2
            : mountOptions.document.floors[0].id;
      (pendingFloorId && (pendingFloorId = resolvedFloorId),
        (options = buildFloorCameraConfig({
          ...baseStageConfig,
          floorSelection: resolvedFloorId,
        })),
        (selectedFloorId = resolvedFloorId),
        resolvedFloorId === "all" && (activeModule = "overview"),
        mountOptions.setFloor(resolvedFloorId),
        mountOptions.appearance(applyRegionLightingPreset(options)),
        (activeCameraPose = transformFloorCamera(
          baseStageConfig.floorCameras?.[resolvedFloorId] ||
            baseStageConfig.camera ||
            currentCameraSnapshot,
          resolvedFloorId,
        )),
        mountOptions.restoreCamera(transformFloorCamera(currentCameraSnapshot, resolvedFloorId)),
        applyLightStates({
          immediate: true,
        }),
        await mountOptions.whenPresented(),
        isControlBusy ||
          applyLightStates({
            immediate: true,
          }));
    };
    try {
      ((releaseSceneCover = mountOptions.coverSceneUpdate()),
        mountOptions.setCameraInteraction({
          enabled: false,
        }),
        (hasCoveredScene = true),
        await applySceneUpdate(sceneUpdateInput),
        isControlBusy ||
          (postHostMessage({
            type: "model-metadata",
            metadata: buildMetadata(mountOptions, transformFloorCamera, options.floorSelection),
          }),
          reportLifecycle("source-adopt-complete")));
    } catch (sceneAdoptError: any) {
      throw (
        reportLifecycle("source-adopt-failed"),
        hasCoveredScene && !isControlBusy && (await applySceneUpdate(savedScene)),
        sceneAdoptError
      );
    } finally {
      if (
        (releaseSceneCover(),
        (isCameraMoving = false),
        sceneCacheByKey.clear(),
        (lastRenderSignature = ""),
        !isControlBusy &&
          (syncCameraInteraction(),
          syncMarkers(),
          renderMarkerPositions(true),
          pendingEditorAction))
      ) {
        const pendingHostMessage = pendingEditorAction;
        ((pendingEditorAction = null), handleHostMessage(pendingHostMessage));
      }
    }
  }
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
  function runFrame(frameTimestamp: any) {
    if (isControlBusy || document.hidden || isCameraMoving || startupProgress === 0)
      return Infinity;
    syncPresenceScene();
    const floorTransitionActive2 =
      mountOptions.floorTransitionActive || cameraMotionSnapshot?.owner === "floor";
    if (
      (mountOptions.recordFloorFrame?.(frameTimestamp, !!floorTransitionActive2),
      !floorTransitionActive2)
    ) {
      (rebuildCurtainMotion(),
        syncNasOverlay(),
        syncCameraOverlay(),
        syncEnvironmentLayers(),
        syncVacuumMotion(),
        speakerRings.tick(frameTimestamp),
        carCharging.tick(frameTimestamp),
        fanMotion.tick(frameTimestamp),
        airerMotion.tick(frameTimestamp),
        nasStatus.tick(frameTimestamp));
      for (const stateTickerEntry of Object.values(waterHeaterStatusByModelType))
        stateTickerEntry.tick(frameTimestamp);
      for (const genericTickerEntry of Object.values(entries))
        genericTickerEntry.tick(frameTimestamp);
      ([coverFeedback.tick(frameTimestamp), dreamTiltFeedback.tick(frameTimestamp)].some(Boolean) &&
        (pruneTiltPreviews(),
        syncCoverIconStates(),
        getFocusedEntry()?.deviceKind === "cover" && updateDevicePanel()),
        curtainMotion.update(frameTimestamp));
    }
    (syncVacuumMap(),
      mountOptions.curtainFrame?.({
        key: curtainMotion.poseKey(),
        structure: curtainMotion.structureKey(),
        floorIds: list,
        moving:
          startupProgress > 0 &&
          (curtainMotion.isMoving() || nextCoverFeedbackDelay() <= 1000 / 30),
      }));
    const tick = presenceWaves.tick(frameTimestamp),
      tick2 = environmentScene.tick(frameTimestamp);
    (floorTransitionActive2 || environmentAirflow.tick(frameTimestamp),
      mountOptions.setEnvironmentActive?.(environmentScene.isActive),
      advanceCameraMotion(frameTimestamp));
    const tick3 = sceneBackgroundController.tick(frameTimestamp),
      tick4 = vacuumMaps.tick(frameTimestamp);
    (idleFocusExitControl.tick(frameTimestamp),
      idleRotationControl.tick(frameTimestamp),
      idleIconVisibilityControl.tick(frameTimestamp),
      vector.expire() && syncMarkers());
    const deltaSeconds = lastIdleFrameMs
      ? Math.min(0.1, (frameTimestamp - lastIdleFrameMs) / 1000)
      : 0;
    lastIdleFrameMs = frameTimestamp;
    const lightBindingFrame = buildLockMotionInput(),
      tick5 =
        !floorTransitionActive2 &&
        lockMotion.tick(frameTimestamp, lightBindingFrame.bindings, lightBindingFrame.states);
    mountOptions.setLockMoving?.(tick5);
    const tick6 = !floorTransitionActive2 && presenceScene.tick(deltaSeconds);
    layoutPresenceHitBoxes();
    const tick7 = !floorTransitionActive2 && vacuumMotion.tick(deltaSeconds);
    tick7 && ((lastRenderSignature = ""), renderMarkerPositions(true));
    const some6 = (options.devices?.vacuums || []).some(
        (activeVacuumItem: any) => vacuumStatusPresentation2(activeVacuumItem, deviceStates).active,
      ),
      floor = Math.floor(frameTimestamp / 7000);
    (some6 && floor !== lastIdleFloorId && ((lastIdleFloorId = floor), syncMarkers()),
      revealFollowCamera());
    const frameTimestampCameraQuaternionKey =
      mountOptions.camera.quaternion?.toArray?.().join(",") || "";
    if (frameTimestampCameraQuaternionKey !== cameraQuaternionKey) {
      const frameDeltaSeconds =
          Math.min(100, Math.max(1, frameTimestamp - (lastQuaternionMs ?? frameTimestamp - 16.7))) /
          1000,
        cameraAngularSpeed =
          scratchQuaternion.angleTo(mountOptions.camera.quaternion) / frameDeltaSeconds;
      (cameraQuaternionKey &&
        !cameraMotionSnapshot &&
        !followVacuumId &&
        (set.size || isPointerHeld || cameraAngularSpeed > 0.035) &&
        (idleIconDelayUntilMs = frameTimestamp + 60),
        (cameraQuaternionKey = frameTimestampCameraQuaternionKey));
    }
    (scratchQuaternion.copy(mountOptions.camera.quaternion), (lastQuaternionMs = frameTimestamp));
    const isRotatingByPointer =
        isIdleIconHidden &&
        !cameraMotionSnapshot &&
        !followVacuumId &&
        (set.size > 0 || isPointerHeld),
      shouldHideIconsWhileRotating =
        pageBehavior.hideIconsWhileRotating === true &&
        !isEditing &&
        !isAwaitingFloorViewAdjust &&
        (isIdleRotationRunning || isRotatingByPointer || frameTimestamp < idleIconDelayUntilMs);
    shouldHideIconsWhileRotating !== isIdleIconHidden &&
      ((isIdleIconHidden = shouldHideIconsWhileRotating), syncStageVisibility());
    const some7 = (options.devices?.vacuums || []).some(
      (trackedVacuumItem: any) =>
        matchesSelectedFloor(trackedVacuumItem) && vacuumMotion.hasTracking(trackedVacuumItem.id),
    );
    return (
      (followToggleButton.hidden =
        isEditing || (!followVacuumId && (activeModule !== "vacuum" || !some7))),
      (toolbarElement.hidden = followToggleButton.hidden),
      (followToggleButton.disabled = !followVacuumId && !some7),
      renderMarkerPositions(),
      (canvasElement.dataset.stageFrameChecks = String(sceneBackground.stats.frames)),
      Math.min(
        carCharging.nextDelay(),
        airerMotion.nextDelay(),
        fanMotion.nextDelay(),
        speakerRings.nextDelay(),
        tick5 ? 1000 / 30 : Infinity,
        tick3,
        tick ? 1000 / 30 : Infinity,
        screenOutlines.nextDelay(),
        tick6 ? 0 : Infinity,
        tick7 || followVacuumId ? 1000 / 30 : Infinity,
        isIdleIconHidden ? 60 : Infinity,
        some6 ? 7000 - (frameTimestamp % 7000) : Infinity,
        cameraMotionSnapshot || tick2 || tick4 ? 0 : Infinity,
        curtainMotion.isMoving() ? 1000 / 30 : Infinity,
        Math.min(
          coverFeedback.nextDelay(frameTimestamp),
          dreamTiltFeedback.nextDelay(frameTimestamp),
        ),
        environmentAirflow.nextDelay(),
        nasStatus.nextDelay(),
        ...Object.values(waterHeaterStatusByModelType).map((stateTickerForDelay) =>
          stateTickerForDelay.nextDelay(),
        ),
        ...Object.values(entries).map((genericTickerForDelay) => genericTickerForDelay.nextDelay()),
        idleFocusExitControl.nextDelay(frameTimestamp),
        idleRotationControl.nextDelay(frameTimestamp),
        idleIconVisibilityControl.nextDelay(frameTimestamp),
        vector.nextDelay(frameTimestamp),
      )
    );
  }
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
