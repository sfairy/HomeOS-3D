const { popupPlacement: computePopupPlacement } = await (import.meta.url.startsWith("file:")
  ? import(
      new URL(
        "../../static/modules/interaction3d/popup-placement.js?v=20260915211726",
        import.meta.url
      )
    )
  : import("/static/modules/interaction3d/popup-placement.js?v=20260915211726"));
import {
  createPresenceScene,
  createPresenceWaves
} from "./presence-scene.js?v=20260915211726";
import { createBackgroundTheme } from "./background-theme.js?v=20260915211726";
import { floorNavigationChoices } from "./floor-navigation.js?v=20260915211726";
import {
  createVacuumMotion,
  vacuumQuip,
  createVacuumFollowCamera,
  vacuumBirdCamera,
  vacuumFollowPose
} from "./vacuum-motion.js?v=20260915211726";
import {
  createVacuumMaps,
  vacuumStatusPresentation,
  vacuumBindingsForMap
} from "./vacuum-map.js?v=20260915211726";
import { televisionState } from "./television-state.js?v=20260915211726";
import { createTelevisionPanel } from "./television-panel.js?v=20260915211726";
import { createTelevisionScreens } from "./television-screen.js?v=20260915211726";
import { createNasPanel } from "./nas-panel.js";
import { createNasStatus, nasDeviceState } from "./nas-status.js?v=20260915211726";
import { createCameraStatus, cameraOnline } from "./camera-status.js";
import {
  coverState,
  coverIconIsOn,
  coverCanAdjustBlades
} from "./cover-state.js?v=20260915211726";
import { createCoverFeedback } from "./cover-feedback.js?v=20260915211726";
import { createCoverPanel } from "./cover-panel.js?v=20260915211726";
import { createCurtainMotion } from "./curtain-motion.js?v=20260915211726";
import { createEnvironmentAirflow } from "./environment-airflow.js?v=20260915211726";
import { createScreenOutlines } from "./environment-halos.js?v=20260915211726";
import { mountRegionRangeEditor } from "./light-range-editor.js?v=20260915211726";
import { climateState } from "./climate-state.js?v=20260915211726";
import { createClimatePanel } from "./climate-panel.js?v=20260915211726";
import {
  createEnvironmentScene,
  pageDimming,
  pageModelBindings
} from "./environment-scene.js?v=20260915211726";
import { startSceneSync } from "./scene-sync.js?v=20260915211726";
import {
  lightCommand,
  createLightPreview,
  createLightStateCache,
  lightRenderState
} from "./light-state.js?v=20260915211726";
import {
  createDampedCameraMotion,
  automaticLightCamera,
  automaticAirConditionerCamera
} from "./camera-motion.js?v=20260915211726";
import {
  resolvePageBehavior,
  createIdleRotation,
  createIdleIconVisibility,
  createIdleFocusExit
} from "./idle-rotation.js?v=20260915211726";
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
export function configuredModuleKinds(rawConfig = {}) {
  return [
    // 总览 is always offered: it aggregates every configured module on the active floor,
    // so it stays meaningful even when only one module has devices.
    "overview",
    "light",
    ...(rawConfig.environment?.airConditioners?.length || rawConfig.environment?.curtains?.length
      ? ["environment"]
      : []),
    ...(rawConfig.devices?.nas?.length || rawConfig.devices?.televisions?.length
      ? ["devices"]
      : []),
    ...(rawConfig.devices?.vacuums?.length ? ["vacuum"] : []),
    ...(rawConfig.security?.cameras?.length || rawConfig.security?.presenceSensors?.length
      ? ["security"]
      : [])
  ];
}
export function mountStage(stageOptions) {
  const { THREE: THREE, container: containerElement, canvas: canvasElement } = stageOptions;
  let config = {
    lights: []
  };
  let statesByEntityId = {};
  let isEditing = false;
  let isViewEditing = false;
  let isInteractive = false;
  let selectedId = "";
  let focusedId = "";
  let currentFloorId = "";
  let isDisposed = false;
  let isEditorCanvas = false;
  let requestSeq = 0;
  let markerDragState = null;
  let savedCameraPose = null;
  let isPresented = false;
  let configRevisionCount = 0;
  let pageBehavior = resolvePageBehavior();
  // 总览 is the landing module: it shows the house without device buttons.
  let activeModule = "overview";
  let editingVacuumId = "";
  let pendingFloorId = "";
  let pendingModule = "";
  let hasInitializedFloor = false;
  const isAllFloorsMode = () => currentFloorId === "all";
  const isOverviewMode = () => activeModule === "overview" || (!isEditing && isAllFloorsMode());
  const isOnActiveFloor = item => currentFloorId === "all" || item.floorId === currentFloorId;
  let focusMode = "";
  let focusRestoreCameraPose = null;
  let cameraTransition = null;
  let focusViewportInset = 0;
  let isPageVisible = false;
  let isIdleRotating = false;
  let hasIdleReturnPending = false;
  let idleBasePose = null;
  let frameLoop = null;
  let hasActivityState = false;
  let isPresentedVisible = true;
  let isRangeEditorOpen = false;
  let rangeEditor = null;
  let isRangeEditingAllowed = false;
  let isRangeEditorBusy = false;
  let isRangeEditorOnly = false;
  const wakeFrameLoop = () => frameLoop?.wake();
  const backgroundTheme = createBackgroundTheme(stageOptions, wakeFrameLoop);
  stageOptions.setBackgroundTheme?.(backgroundTheme);
  let areIdleIconsHidden = false;
  let isActivityHeld = false;
  const activePointerIds = new Set();
  const pressedKeys = new Set();
  const markersById = new Map();
  const lightRequestsById = new Map();
  const markerPointsById = new Map();
  const tempProjectedPoint = new THREE.Vector3();
  let cachedSceneDocument;
  let cachedMarkerFloorId;
  let idleSinceTimestamp = null;
  const lightPreview = createLightPreview();
  const lightHistoryScope = document.body?.dataset?.i3dLightHistoryScope;
  let localStorageRef;
  if (lightHistoryScope) {
    try {
      localStorageRef = window.localStorage;
    } catch {}
  }
  const lightStateCache = createLightStateCache({
    storage: localStorageRef,
    scope: lightHistoryScope
  });
  const readLightState = entityId =>
    lightStateCache.resolve(entityId || "", statesByEntityId[entityId]);
  let lightEffectPreview = null;
  let sceneProperties = {
    lights: []
  };
  let isSceneUpdating = false;
  let hasUserInteracted = false;
  let queuedConfigMessage = null;
  let lastActivityTimestamp = -Infinity;
  const transformCameraPose = (pose, floorSelectionId = config.floorSelection, absolute = false) =>
    stageOptions.transformCamera?.(pose, floorSelectionId, absolute) ?? pose;
  const currentCameraSnapshot = () =>
    transformCameraPose(stageOptions.cameraState(true), config.floorSelection, true);
  function normalizeSceneConfig(sourceConfig) {
    const normalizedConfig = structuredClone(sourceConfig);
    normalizedConfig.camera = transformCameraPose(
      normalizedConfig.floorCameras?.[normalizedConfig.floorSelection] || normalizedConfig.camera,
      normalizedConfig.floorSelection
    );
    normalizedConfig.lights = (normalizedConfig.lights || []).map(lightItem => ({
      ...lightItem,
      ...(lightItem.focusCamera
        ? {
            focusCamera: transformCameraPose(lightItem.focusCamera, normalizedConfig.floorSelection)
          }
        : {})
    }));
    if (normalizedConfig.security?.cameras) {
      normalizedConfig.security.cameras = (normalizedConfig.security.cameras || []).map(
        cameraConfigItem => ({
          ...cameraConfigItem,
          ...(cameraConfigItem.focusCamera
            ? {
                focusCamera: transformCameraPose(
                  cameraConfigItem.focusCamera,
                  normalizedConfig.floorSelection
                )
              }
            : {})
        })
      );
    }
    if (normalizedConfig.security?.presenceSensors) {
      normalizedConfig.security.presenceSensors = normalizedConfig.security.presenceSensors.map(
        sensorItem => ({
          ...sensorItem,
          ...(sensorItem.focusCamera
            ? {
                focusCamera: transformCameraPose(
                  sensorItem.focusCamera,
                  normalizedConfig.floorSelection
                )
              }
            : {})
        })
      );
    }
    if (normalizedConfig.environment) {
      for (const environmentKey of ["airConditioners", "curtains"]) {
        normalizedConfig.environment[environmentKey] = (
          normalizedConfig.environment[environmentKey] || []
        ).map(environmentItem => ({
          ...environmentItem,
          ...(environmentItem.focusCamera
            ? {
                focusCamera: transformCameraPose(
                  environmentItem.focusCamera,
                  normalizedConfig.floorSelection
                )
              }
            : {})
        }));
      }
    }
    for (const deviceKey of ["nas", "televisions", "vacuums"]) {
      if (normalizedConfig.devices?.[deviceKey]) {
        normalizedConfig.devices[deviceKey] = normalizedConfig.devices[deviceKey].map(
          deviceItem => ({
            ...deviceItem,
            ...(deviceItem.focusCamera
              ? {
                  focusCamera: transformCameraPose(
                    deviceItem.focusCamera,
                    normalizedConfig.floorSelection
                  )
                }
              : {})
          })
        );
      }
    }
    if (normalizedConfig.devices?.vacuums) {
      for (const configuredVacuumItem of normalizedConfig.devices.vacuums) {
        configuredVacuumItem.followCamera &&= transformCameraPose(
          configuredVacuumItem.followCamera,
          normalizedConfig.floorSelection
        );
      }
    }
    return normalizedConfig;
  }
  const postToHost = outboundMessage =>
    window.parent.postMessage(
      {
        channel: "hb-i3d-v1",
        ...outboundMessage
      },
      location.origin
    );
  const makeElement = (tagName, className, textContent) => {
    const element = document.createElement(tagName);
    element.className = className || "";
    if (textContent) {
      element.textContent = textContent;
    }
    return element;
  };
  const markersElement = makeElement("div", "i3d-markers");
  const vacuumWorkingLayerElement = makeElement("div", "i3d-vacuum-working-layer");
  let idleIconHideDeadline = 0;
  let lastCameraQuaternionKey = "";
  let areIconsHiddenByRotation = false;
  let lastFrameTimestamp = 0;
  let lastVacuumQuipSlot = -1;
  let followedVacuumId = "";
  let preFollowCameraState = null;
  let followCameraPose = null;
  const previousCameraQuaternion = new THREE.Quaternion();
  let previousFrameTimestamp = null;
  const presentationElement = makeElement("div", "i3d-presentation");
  let presentationLayout = null;
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
  let modulePanelOpenState = null;
  let modulePanelAnimation = null;
  const moduleTabsByModule = new Map();
  let configuredModules = configuredModuleKinds(config);
  for (const [moduleKey, moduleLabel] of [
    // 总览 is the aggregate page: every configured module's markers for the active floor.
    ["overview", "总览"],
    ["light", "灯光"],
    ["environment", "环境"],
    ["devices", "设备"],
    ["vacuum", "扫地机"],
    ["security", "安防"]
  ]) {
    const moduleTabButton = makeElement("button", "", moduleLabel);
    moduleTabButton.type = "button";
    moduleTabButton.dataset.module = moduleKey;
    moduleTabButton.style.setProperty("--i3d-tab-index", String(moduleTabsByModule.size));
    moduleTabButton.addEventListener("click", () => selectModule(moduleKey));
    moduleTabsElement.append(moduleTabButton);
    moduleTabsByModule.set(moduleKey, moduleTabButton);
  }
  const moduleEmptyElement = makeElement("p", "i3d-module-empty");
  moduleEmptyElement.setAttribute("role", "status");
  moduleEmptyElement.hidden = true;
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
  function createSliderControl(labelText, sliderName, minValue, maxValue) {
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
  const presetEntries = LIGHT_PRESETS.map(preset => {
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
  const climateRequestsById = new Map();
  const climatePanel = createClimatePanel({
    onControl: climateCommand =>
      new Promise((resolveClimate, rejectClimate) => {
        const climateBinding = collectClimateBindings().find(
          climateDevice =>
            isOnActiveFloor(climateDevice) &&
            climateDevice.entityId === climateCommand.entityId &&
            climateDevice.modelAvailable
        );
        if (
          !isInteractive ||
          isEditing ||
          isDisposed ||
          activeModule !== "environment" ||
          !climateBinding?.modelId ||
          climateBinding.entityId !== climateCommand.entityId ||
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
  function settleClimateRequest(pendingClimateKey, climateError) {
    const pendingClimateRequest = climateRequestsById.get(pendingClimateKey);
    if (pendingClimateRequest) {
      clearTimeout(pendingClimateRequest.timeout);
      climateRequestsById.delete(pendingClimateKey);
      if (climateError) {
        pendingClimateRequest.reject(new Error(climateError));
      } else {
        pendingClimateRequest.resolve();
      }
    }
  }
  const bladePendingByEntityId = new Map();
  const coverRequestsById = new Map();
  let coverStorage;
  if (lightHistoryScope) {
    try {
      coverStorage = window.sessionStorage;
    } catch {}
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
  function pruneBladePreviews() {
    for (const [previewEntityId, pendingBladeRequest] of bladePendingByEntityId) {
      const standardFeedback = coverFeedback.read(previewEntityId);
      const dreamFeedback = dreamCoverFeedback.read(previewEntityId);
      if (!standardFeedback?.available || !dreamFeedback?.available) {
        bladePendingByEntityId.delete(previewEntityId);
        continue;
      }
      if (
        standardFeedback.positionReported &&
        standardFeedback.raw.attributes.current_position !== pendingBladeRequest.reported
      ) {
        bladePendingByEntityId.delete(previewEntityId);
        continue;
      }
      if (!(Math.abs((dreamFeedback.position ?? -100) - 50) > 0.01)) {
        bladePendingByEntityId.delete(previewEntityId);
        coverFeedback.startPreview(previewEntityId, pendingBladeRequest.requestId);
      }
    }
  }
  const nextCoverDelayMs = () =>
    Math.min(coverFeedback.nextDelay(), dreamCoverFeedback.nextDelay());
  function resolveCoverPresentation(
    coverBindingItem,
    baseCoverState = coverState(
      coverBindingItem.entityId,
      statesByEntityId[coverBindingItem.entityId],
      coverBindingItem
    )
  ) {
    const standardPresentation = coverFeedback.read(coverBindingItem.entityId, baseCoverState);
    if (coverBindingItem.coverKind !== "dream") {
      return standardPresentation;
    }
    const dreamCoverState = dreamCoverFeedback.read(coverBindingItem.entityId);
    const isBladePending = bladePendingByEntityId.has(coverBindingItem.entityId);
    return {
      ...standardPresentation,
      ...(isBladePending
        ? {
            state: "opening",
            opening: true,
            closing: false,
            moving: true,
            closedConfirmed: false
          }
        : {}),
      tiltPosition: dreamCoverState?.position ?? baseCoverState.tiltPosition,
      tiltTarget: dreamCoverState?.targetPosition ?? null,
      error: dreamCoverState?.error || standardPresentation?.error || ""
    };
  }
  const coverPanel = createCoverPanel({
    onPreview: (coverEntityId, bladePosition) => {
      const panelCoverBinding = collectCurtainBindings().find(
        panelDevice => panelDevice.entityId === coverEntityId
      );
      if (
        bladePosition !== null &&
        panelCoverBinding?.coverKind === "dream" &&
        !coverCanAdjustBlades(
          coverState(
            panelCoverBinding.entityId,
            statesByEntityId[panelCoverBinding.entityId],
            panelCoverBinding
          ),
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
          return coverFeedback.read(coverEntityId);
        }
      }
    },
    onControl: coverCommand =>
      new Promise((resolveCover, rejectCover) => {
        const controlCoverBinding = collectCurtainBindings().find(
          controlDevice =>
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
            ),
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
            resolvedCoverPresentation.tiltPosition !== null &&
            Math.abs(resolvedCoverPresentation.tiltPosition - 50) > 0.01;
          if (shouldDeferCover) {
            bladePendingByEntityId.set(controlCoverBinding.entityId, {
              requestId: coverRequestId,
              reported: resolvedCoverPresentation.raw.attributes.current_position
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
      })
  });
  function settleCoverRequest(pendingCoverKey, coverError) {
    const pendingCoverRequest = coverRequestsById.get(pendingCoverKey);
    if (pendingCoverRequest) {
      clearTimeout(pendingCoverRequest.timeout);
      coverRequestsById.delete(pendingCoverKey);
      if (coverError) {
        if (
          bladePendingByEntityId.get(pendingCoverRequest.entityId)?.requestId === pendingCoverKey
        ) {
          bladePendingByEntityId.delete(pendingCoverRequest.entityId);
        }
        dreamCoverFeedback.fail(pendingCoverRequest.entityId, pendingCoverKey, coverError);
        pendingCoverRequest.feedback.fail(
          pendingCoverRequest.entityId,
          pendingCoverKey,
          coverError
        );
        syncCoverFeedback();
        renderLightPanel();
        wakeFrameLoop();
        pendingCoverRequest.reject(new Error(coverError));
      } else {
        pendingCoverRequest.resolve();
      }
    }
  }
  const televisionRequestsById = new Map();
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
          ((["turn_on", "turn_off"].includes(televisionCommand.service) &&
            televisionDevice.powerEntityId) ||
            televisionDevice.entityId) !== televisionCommand.entityId
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
  function settleTelevisionRequest(pendingTelevisionKey, televisionError) {
    const pendingTelevisionRequest = televisionRequestsById.get(pendingTelevisionKey);
    if (pendingTelevisionRequest) {
      clearTimeout(pendingTelevisionRequest.timeout);
      televisionRequestsById.delete(pendingTelevisionKey);
      if (televisionError) {
        pendingTelevisionRequest.reject(new Error(televisionError));
      } else {
        pendingTelevisionRequest.resolve();
      }
    }
  }
  lightPanelElement.append(
    lightPanelHeader,
    lightControlsElement,
    controlErrorElement,
    climatePanel.root,
    coverPanel.root,
    nasPanel.root,
    televisionPanel.root
  );
  const curtainMotion = createCurtainMotion({
    THREE: THREE,
    requestRender: () => wakeFrameLoop()
  });
  let curtainSyncSnapshot = null;
  let curtainFloorIds = [];
  let coverBindings = [];
  function syncCoverFeedback() {
    for (const coverMarkerBinding of coverBindings) {
      const coverIconState = resolveCoverPresentation(coverMarkerBinding);
      curtainMotion.setState(coverMarkerBinding.id, coverIconState, {
        immediate: true
      });
      const coverMarkerElement = markersById.get("cover:" + coverMarkerBinding.id);
      if (coverMarkerElement) {
        coverMarkerElement.classList.toggle(
          "is-on",
          coverIconIsOn(coverMarkerBinding, coverIconState)
        );
      }
    }
  }
  function syncCurtains() {
    const modelRoot = stageOptions.modelRoot;
    const sceneRevision = stageOptions.sceneRevision;
    const sceneDocument = stageOptions.document;
    if (
      curtainSyncSnapshot?.config === config &&
      curtainSyncSnapshot.states === statesByEntityId &&
      curtainSyncSnapshot.root === modelRoot &&
      curtainSyncSnapshot.revision === sceneRevision &&
      curtainSyncSnapshot.source === sceneDocument
    ) {
      return;
    }
    curtainSyncSnapshot = {
      config: config,
      states: statesByEntityId,
      root: modelRoot,
      revision: sceneRevision,
      source: sceneDocument
    };
    const curtainBindings = [...collectCurtainBindings(), ...collectPreviewCovers()];
    coverBindings = curtainBindings;
    curtainFloorIds = [
      ...new Set(
        curtainBindings.map(curtainFloorEntry => curtainFloorEntry.floorId).filter(Boolean)
      )
    ];
    curtainMotion.setBindings(modelRoot, curtainBindings, sceneRevision);
    coverFeedback.retain(
      curtainBindings.map(retainedCurtainEntry => retainedCurtainEntry.entityId)
    );
    const dreamCurtainEntityIds = curtainBindings
      .filter(dreamCurtainEntry => dreamCurtainEntry.coverKind === "dream")
      .map(dreamCurtainIdEntry => dreamCurtainIdEntry.entityId);
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
  stageOptions.setCurtainSync?.(syncCurtains);
  const nasStatus = createNasStatus({
    THREE: THREE,
    requestFrame: () => {
      stageOptions.requestRender?.();
      wakeFrameLoop();
    }
  });
  let nasSnapshot;
  const cameraStatus = createCameraStatus({
    THREE: THREE,
    requestFrame: () => stageOptions.requestRender?.()
  });
  let cameraStatusSnapshot;
  function syncCameraStatus() {
    const statusModelRoot = stageOptions.modelRoot;
    const statusSceneRevision = stageOptions.sceneRevision;
    const isEnabled = !isViewEditing && !isRangeEditorOpen;
    const statusBrightness = activeModule === "security" && currentFloorId !== "all" ? 1 : 0.55;
    if (
      cameraStatusSnapshot?.root === statusModelRoot &&
      cameraStatusSnapshot.revision === statusSceneRevision &&
      cameraStatusSnapshot.config === config &&
      cameraStatusSnapshot.states === statesByEntityId &&
      cameraStatusSnapshot.enabled === isEnabled &&
      cameraStatusSnapshot.brightness === statusBrightness
    ) {
      return;
    }
    cameraStatusSnapshot = {
      root: statusModelRoot,
      revision: statusSceneRevision,
      config: config,
      states: statesByEntityId,
      enabled: isEnabled,
      brightness: statusBrightness
    };
    const cameraBindings = (config.security?.cameras || []).map(cameraBindingEntry => {
      const cameraSceneItem = stageOptions.document.floors
        .find(cameraStatusFloor => cameraStatusFloor.id === cameraBindingEntry.floorId)
        ?.scene.items.find(
          cameraSceneItemMatch =>
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
      root: statusModelRoot,
      revision: statusSceneRevision,
      bindings: cameraBindings,
      states: statesByEntityId,
      enabled: isEnabled,
      brightness: statusBrightness
    });
  }
  function syncNasStatus() {
    const nasEnabled = !isViewEditing && !isRangeEditorOpen;
    const nasModelRoot = stageOptions.modelRoot;
    const nasSceneRevision = stageOptions.sceneRevision;
    const sizeScale = currentFloorId === "all" ? 0.75 : 1;
    const nasBrightness =
      currentFloorId !== "all" && ["devices", "nas", "television"].includes(activeModule) ? 1 : 0.6;
    if (
      nasSnapshot?.root !== nasModelRoot ||
      nasSnapshot.revision !== nasSceneRevision ||
      nasSnapshot.config !== config ||
      nasSnapshot.states !== statesByEntityId ||
      nasSnapshot.enabled !== nasEnabled ||
      nasSnapshot.sizeScale !== sizeScale ||
      nasSnapshot.brightness !== nasBrightness
    ) {
      nasSnapshot = {
        root: nasModelRoot,
        revision: nasSceneRevision,
        config: config,
        states: statesByEntityId,
        enabled: nasEnabled,
        sizeScale: sizeScale,
        brightness: nasBrightness
      };
      nasStatus.sync({
        root: nasModelRoot,
        revision: nasSceneRevision,
        bindings: collectNasBindings(),
        states: statesByEntityId,
        enabled: nasEnabled,
        sizeScale: sizeScale,
        brightness: nasBrightness
      });
    }
  }
  const televisionScreens = createTelevisionScreens({
    THREE: THREE,
    requestFrame: invalidatedModelIds => {
      stageOptions.requestRender?.();
      stageOptions.invalidateReflections?.(invalidatedModelIds);
      wakeFrameLoop();
    }
  });
  let televisionSnapshot;
  function syncTelevisionScreens() {
    const tvModelRoot = stageOptions.modelRoot;
    const tvSceneRevision = stageOptions.sceneRevision;
    const focusedModel =
      activeModule !== "light" && !isViewEditing && !isRangeEditorOpen
        ? isEditing
          ? selectedId
          : focusedId
        : "";
    if (
      televisionSnapshot?.root !== tvModelRoot ||
      televisionSnapshot.revision !== tvSceneRevision ||
      televisionSnapshot.config !== config ||
      televisionSnapshot.states !== statesByEntityId ||
      televisionSnapshot.focused !== focusedModel ||
      televisionSnapshot.module !== activeModule
    ) {
      televisionSnapshot = {
        root: tvModelRoot,
        revision: tvSceneRevision,
        config: config,
        states: statesByEntityId,
        focused: focusedModel,
        module: activeModule
      };
      televisionScreens.sync({
        root: tvModelRoot,
        revision: tvSceneRevision,
        bindings: collectTelevisionBindings(),
        states: statesByEntityId,
        focusedModel: "",
        dimStrength: 0
      });
    }
  }
  const environmentScene = createEnvironmentScene({
    THREE: THREE,
    requestFrame: invalidatedIds => {
      stageOptions.requestRender?.();
      stageOptions.invalidateReflections?.(invalidatedIds);
      wakeFrameLoop();
    }
  });
  stageOptions.setTelevisionSync?.(syncTelevisionScreens);
  stageOptions.setEnvironmentScene?.(environmentScene);
  const environmentAirflow = createEnvironmentAirflow({
    THREE: THREE,
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
    lightPanelElement,
    viewHelpElement
  );
  navigationElement.append(toolbarElement);
  containerElement.append(focusVignetteElement, presentationElement);
  const screenOutlines = createScreenOutlines({
    THREE: THREE,
    container: containerElement,
    getCamera: () => stageOptions.camera,
    getObjectCamera: cameraRequest =>
      stageOptions.presentationCamera?.(cameraRequest) || stageOptions.camera
  });
  function collectClimateBindings() {
    return (config.environment?.airConditioners || []).map(airConditionerEntry => {
      const climateSceneItem = stageOptions.document.floors
        .find(floorCandidate => floorCandidate.id === airConditionerEntry.floorId)
        ?.scene.items.find(
          sceneItemCandidate =>
            sceneItemCandidate.id === airConditionerEntry.modelId &&
            ["wallac", "floorac", "airoutlet"].includes(sceneItemCandidate.type)
        );
      return {
        ...airConditionerEntry,
        deviceKind: "climate",
        x: Number.isFinite(airConditionerEntry.x)
          ? airConditionerEntry.x
          : (climateSceneItem?.x ?? 0),
        y: Number.isFinite(airConditionerEntry.y)
          ? airConditionerEntry.y
          : (climateSceneItem?.y ?? 0),
        height: Number.isFinite(airConditionerEntry.height)
          ? airConditionerEntry.height
          : climateSceneItem
            ? (Number(climateSceneItem.elevation) || 0) +
              (Number(climateSceneItem.height) || 0.28) / 2
            : 0,
        modelAvailable: !!climateSceneItem,
        icon: airConditionerEntry.icon || "mdi:air-conditioner"
      };
    });
  }
  function resolveCurtainGeometry(sceneItemSource, itemConfig = {}) {
    return {
      curtainWidth: Number(sceneItemSource?.width) || 1.8,
      curtainPosition: sceneItemSource?.curtainPosition || "split",
      curtainTrack: sceneItemSource?.curtainTrack || "straight",
      curtainCorner: sceneItemSource?.curtainCorner,
      curtainLeftLength: sceneItemSource?.curtainLeftLength,
      curtainRightLength: sceneItemSource?.curtainRightLength,
      curtainMeet: sceneItemSource?.curtainMeet,
      curtainFabric: sceneItemSource?.curtainFabric || itemConfig.curtainFabric || "cloth",
      coverKind: itemConfig.coverKind === "dream" ? "dream" : "standard",
      unboundPosition: Number.isFinite(itemConfig.unboundPosition)
        ? itemConfig.unboundPosition
        : Number(sceneItemSource?.curtainPreview) || 0
    };
  }
  function collectCurtainBindings() {
    return (config.environment?.curtains || []).map(curtainBindingEntry => {
      const curtainSceneItem = stageOptions.document.floors
        .find(matchingFloor => matchingFloor.id === curtainBindingEntry.floorId)
        ?.scene.items.find(
          matchingSceneItem =>
            matchingSceneItem.id === curtainBindingEntry.modelId &&
            matchingSceneItem.type === "curtain"
        );
      return {
        ...curtainBindingEntry,
        deviceKind: "cover",
        x: Number.isFinite(curtainBindingEntry.x)
          ? curtainBindingEntry.x
          : (curtainSceneItem?.x ?? 0),
        y: Number.isFinite(curtainBindingEntry.y)
          ? curtainBindingEntry.y
          : (curtainSceneItem?.y ?? 0),
        height: Number.isFinite(curtainBindingEntry.height)
          ? curtainBindingEntry.height
          : curtainSceneItem
            ? (Number(curtainSceneItem.elevation) || 0) +
              (Number(curtainSceneItem.height) || 2.4) / 2
            : 0,
        ...resolveCurtainGeometry(curtainSceneItem, curtainBindingEntry),
        modelAvailable: !!curtainSceneItem,
        icon: curtainBindingEntry.icon || "mdi:curtains"
      };
    });
  }
  function collectNasBindings() {
    return (config.devices?.nas || []).map(nasEntry => {
      const nasSceneItem = stageOptions.document.floors
        .find(nasFloor => nasFloor.id === nasEntry.floorId)
        ?.scene.items.find(
          nasSceneItemCandidate =>
            nasSceneItemCandidate.id === nasEntry.modelId && nasSceneItemCandidate.type === "nas"
        );
      return {
        ...nasEntry,
        clickAction: nasEntry.clickAction || "focus",
        deviceKind: "nas",
        x: Number.isFinite(nasEntry.x) ? nasEntry.x : (nasSceneItem?.x ?? 0),
        y: Number.isFinite(nasEntry.y) ? nasEntry.y : (nasSceneItem?.y ?? 0),
        height: Number.isFinite(nasEntry.height)
          ? nasEntry.height
          : (Number(nasSceneItem?.elevation) || 0) + (Number(nasSceneItem?.height) || 0.34) / 2,
        modelAvailable: !!nasSceneItem,
        icon: nasEntry.icon || "mdi:nas"
      };
    });
  }
  const followButton = makeElement("button", "", "跟随漫游");
  followButton.type = "button";
  followButton.hidden = true;
  followButton.title = "以鸟瞰视角跟随扫地机";
  toolbarElement.append(followButton);
  function stopVacuumFollow(restoreCamera = true) {
    if (!followedVacuumId) {
      return;
    }
    const previousCameraState = preFollowCameraState;
    followedVacuumId = "";
    preFollowCameraState = null;
    followCameraPose = null;
    vacuumFollowCamera.reset();
    postToHost({
      type: "vacuum-follow-state",
      active: false
    });
    followButton.textContent = "跟随漫游";
    followButton.setAttribute("aria-pressed", "false");
    stageOptions.endCameraMotion();
    if (restoreCamera && previousCameraState) {
      beginCameraTransition(
        previousCameraState,
        false,
        false,
        () => stageOptions.restoreCamera(previousCameraState),
        "follow-return"
      );
    }
    syncCameraInteraction();
    updateIdleControllers();
  }
  followButton.addEventListener("click", () => {
    if (followedVacuumId) {
      stopVacuumFollow();
      return;
    }
    if (stageOptions.floorTransitionActive || cameraTransition?.owner === "floor") {
      return;
    }
    const trackedVacuums = (config.devices?.vacuums || []).filter(
      trackableVacuumEntry =>
        isOnActiveFloor(trackableVacuumEntry) && vacuumMotion.hasTracking(trackableVacuumEntry.id)
    );
    const followTargetVacuum =
      trackedVacuums.find(vacuumCandidate => "vacuum:" + vacuumCandidate.id === focusedId) ||
      trackedVacuums.find(
        activeVacuumCandidate =>
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
  const vacuumFollowCamera = createVacuumFollowCamera(THREE);
  function updateVacuumFollow(deltaSeconds) {
    if (!followedVacuumId) {
      return;
    }
    const followWorldPosition = vacuumMotion.worldPosition(followedVacuumId);
    const followedVacuumBinding = (config.devices?.vacuums || []).find(
      followedVacuum => followedVacuum.id === followedVacuumId
    );
    if (!followWorldPosition || !followedVacuumBinding) {
      stopVacuumFollow();
      return;
    }
    const followAnchorCenter = stageOptions.environmentModelPose(
      followedVacuumBinding.floorId,
      followedVacuumBinding.modelId
    )?.center;
    const followRevealTarget = (
      followAnchorCenter ? new THREE.Vector3(...followAnchorCenter) : followWorldPosition.clone()
    ).add(new THREE.Vector3(0, 0.05, 0));
    const followPose = vacuumFollowPose(followCameraPose, followRevealTarget.toArray());
    const followCameraTarget = new THREE.Vector3(...followPose.position);
    vacuumFollowCamera.reveal(
      stageOptions,
      followedVacuumBinding,
      followRevealTarget,
      followCameraTarget
    );
    stageOptions.setFocusViewport(0);
    stageOptions.applyCameraPose(followPose);
  }
  const isFocusableDevice = device =>
    ["nas", "television", "vacuum", "presence", "camera"].includes(device?.deviceKind);
  const vacuumMaps = createVacuumMaps(stageOptions, () => {
    stageOptions.requestRender?.();
    wakeFrameLoop();
  });
  const vacuumMotion = createVacuumMotion(stageOptions, wakeFrameLoop);
  const presenceScene = createPresenceScene(stageOptions, wakeFrameLoop);
  const presenceWaves = createPresenceWaves(stageOptions);
  let presenceSyncSignature = null;
  let isPresencePreviewWalk = false;
  let isPresenceHitRangeVisible = false;
  const presenceHitLayerElement = makeElement("div", "i3d-presence-hit-layer");
  presenceHitLayerElement.setAttribute("aria-hidden", "true");
  containerElement.append(presenceHitLayerElement);
  const presenceHitBoxesById = new Map();
  function layoutPresenceHitBoxes() {
    if ((!isEditing || !isPresenceHitRangeVisible) && !presenceHitBoxesById.size) {
      return;
    }
    const presenceHitRects =
      isEditing && isPresenceHitRangeVisible
        ? presenceScene.hitRects(
            stageOptions.camera,
            canvasElement,
            config.security?.presenceSensors || []
          )
        : [];
    const presenceHitRectIds = new Set(presenceHitRects.map(hitRect => hitRect.id));
    const presenceContainerRect = containerElement.getBoundingClientRect();
    for (const [hitBoxId, staleHitBoxElement] of presenceHitBoxesById) {
      if (!presenceHitRectIds.has(hitBoxId)) {
        staleHitBoxElement.remove();
        presenceHitBoxesById.delete(hitBoxId);
      }
    }
    for (const hitBoxRect of presenceHitRects) {
      let hitBoxElement = presenceHitBoxesById.get(hitBoxRect.id);
      if (!hitBoxElement) {
        hitBoxElement = makeElement("div", "i3d-presence-hit-box");
        presenceHitBoxesById.set(hitBoxRect.id, hitBoxElement);
        presenceHitLayerElement.append(hitBoxElement);
      }
      Object.assign(hitBoxElement.style, {
        left: hitBoxRect.left - presenceContainerRect.left - hitBoxRect.padding + "px",
        top: hitBoxRect.top - presenceContainerRect.top - hitBoxRect.padding + "px",
        width: hitBoxRect.width + hitBoxRect.padding * 2 + "px",
        height: hitBoxRect.height + hitBoxRect.padding * 2 + "px",
        borderRadius: hitBoxRect.padding + "px"
      });
    }
  }
  function syncPresenceScene() {
    const isPresenceEnabled =
      isPresented &&
      !isEditorCanvas &&
      (!isEditing || activeModule === "security") &&
      !isViewEditing &&
      !isRangeEditorOpen &&
      isPresentedVisible &&
      !document.hidden &&
      !stageOptions.floorTransitionActive &&
      cameraTransition?.owner !== "floor";
    const presenceSignature = [
      config,
      statesByEntityId,
      stageOptions.sceneRevision,
      currentFloorId,
      isPresenceEnabled,
      isPresencePreviewWalk,
      activeModule
    ];
    if (
      !presenceSyncSignature ||
      !presenceSignature.every(
        (signatureValue, signatureIndex) => signatureValue === presenceSyncSignature[signatureIndex]
      )
    ) {
      presenceSyncSignature = presenceSignature;
      presenceScene.sync(
        config.security?.presenceSensors || [],
        statesByEntityId,
        isPresenceEnabled,
        currentFloorId,
        isEditing,
        isPresencePreviewWalk,
        activeModule
      );
    }
  }
  let presenceSceneSignature = null;
  function syncVacuumMap() {
    const isVacuumMapEnabled =
      isPresented && !isEditing && !isViewEditing && isPresentedVisible && !document.hidden;
    const vacuumMapSignature = [
      config,
      statesByEntityId,
      stageOptions.sceneRevision,
      isVacuumMapEnabled
    ];
    if (
      !presenceSceneSignature ||
      !vacuumMapSignature.every(
        (cachedSignatureValue, cachedSignatureIndex) =>
          cachedSignatureValue === presenceSceneSignature[cachedSignatureIndex]
      )
    ) {
      presenceSceneSignature = vacuumMapSignature;
      vacuumMotion.sync(
        vacuumBindingsForMap(config.devices?.vacuums || [], statesByEntityId),
        statesByEntityId,
        isVacuumMapEnabled
      );
    }
  }
  const vacuumRoomTimersById = new Map();
  let vacuumMapSyncSignature = null;
  function syncVacuumMaps() {
    const isVacuumMapsEnabled =
      activeModule === "vacuum" &&
      !isViewEditing &&
      !isRangeEditorOpen &&
      !stageOptions.floorTransitionActive &&
      cameraTransition?.owner !== "floor" &&
      isPresentedVisible &&
      !document.hidden;
    const vacuumMapsSignature = [
      config,
      statesByEntityId,
      stageOptions.sceneRevision,
      currentFloorId,
      isVacuumMapsEnabled
    ];
    if (
      !vacuumMapSyncSignature ||
      !vacuumMapsSignature.every(
        (syncSignatureValue, syncSignatureIndex) =>
          syncSignatureValue === vacuumMapSyncSignature[syncSignatureIndex]
      )
    ) {
      vacuumMapSyncSignature = vacuumMapsSignature;
      vacuumMaps.sync(
        vacuumBindingsForMap(collectVacuumBindings(), statesByEntityId),
        isVacuumMapsEnabled,
        currentFloorId,
        statesByEntityId
      );
    }
  }
  document.addEventListener("visibilitychange", syncVacuumMaps);
  function collectVacuumBindings() {
    return (config.devices?.vacuums || []).map(vacuumBindingEntry => {
      const vacuumSceneItem = stageOptions.document.floors
        .find(vacuumFloor => vacuumFloor.id === vacuumBindingEntry.floorId)
        ?.scene.items.find(
          vacuumSceneItemCandidate =>
            vacuumSceneItemCandidate.id === vacuumBindingEntry.modelId &&
            vacuumSceneItemCandidate.type === "robotvacuum"
        );
      const vacuumOffset = (!isEditing && vacuumMotion.offset(vacuumBindingEntry.id)) || {
        x: 0,
        y: 0
      };
      return {
        ...vacuumBindingEntry,
        deviceKind: "vacuum",
        clickAction: vacuumBindingEntry.clickAction || "focus-panel",
        x:
          (Number.isFinite(vacuumBindingEntry.x)
            ? vacuumBindingEntry.x
            : (vacuumSceneItem?.x ?? 0)) + vacuumOffset.x,
        y:
          (Number.isFinite(vacuumBindingEntry.y)
            ? vacuumBindingEntry.y
            : (vacuumSceneItem?.y ?? 0)) + vacuumOffset.y,
        height: Number.isFinite(vacuumBindingEntry.height)
          ? vacuumBindingEntry.height
          : (Number(vacuumSceneItem?.elevation) || 0) +
            (Number(vacuumSceneItem?.height) || 0.85) +
            0.25,
        modelAvailable: !!vacuumSceneItem,
        icon: vacuumBindingEntry.icon || "mdi:robot-vacuum"
      };
    });
  }
  function collectVacuumRoomShortcuts() {
    return collectVacuumBindings()
      .filter(
        filteredVacuum =>
          filteredVacuum.visible !== false &&
          (isEditing || filteredVacuum.entityId) &&
          (isEditing ||
            (!vacuumStatusPresentation(filteredVacuum, statesByEntityId).active &&
              (
                statesByEntityId[filteredVacuum.entityId]?.newState ||
                statesByEntityId[filteredVacuum.entityId]
              )?.state !== "paused"))
      )
      .flatMap(shortcutOwnerVacuum =>
        (shortcutOwnerVacuum.shortcuts || [])
          .filter(vacuumShortcutEntry => isEditing || vacuumShortcutEntry.entityId)
          .map(roomShortcut => ({
            ...roomShortcut,
            id: "vacuum-room:" + shortcutOwnerVacuum.id + ":" + roomShortcut.id,
            vacuumId: shortcutOwnerVacuum.id,
            shortcutId: roomShortcut.id,
            floorId: shortcutOwnerVacuum.floorId,
            height: roomShortcut.height ?? 0.08,
            deviceKind: "vacuum-room",
            modelAvailable: shortcutOwnerVacuum.modelAvailable,
            icon: roomShortcut.icon || "mdi:broom",
            size: roomShortcut.size ?? 44,
            iconSize: roomShortcut.iconSize ?? 26,
            hitSize: roomShortcut.hitSize ?? 44
          }))
      );
  }
  function maybeOpenDevicePopup(popupBinding) {
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
  function collectTelevisionBindings() {
    return (config.devices?.televisions || []).map(televisionEntry => {
      const televisionSceneItem = stageOptions.document.floors
        .find(televisionFloor => televisionFloor.id === televisionEntry.floorId)
        ?.scene.items.find(
          televisionSceneItemCandidate =>
            televisionSceneItemCandidate.id === televisionEntry.modelId &&
            televisionSceneItemCandidate.type === "tv"
        );
      return {
        ...televisionEntry,
        clickAction: televisionEntry.clickAction || "focus-panel",
        deviceKind: "television",
        x: Number.isFinite(televisionEntry.x) ? televisionEntry.x : (televisionSceneItem?.x ?? 0),
        y: Number.isFinite(televisionEntry.y) ? televisionEntry.y : (televisionSceneItem?.y ?? 0),
        height: Number.isFinite(televisionEntry.height)
          ? televisionEntry.height
          : (Number(televisionSceneItem?.elevation) || 0) +
            (Number(televisionSceneItem?.height) || 0.92) * 0.62,
        modelAvailable: !!televisionSceneItem,
        icon: televisionEntry.icon || "mdi:television"
      };
    });
  }
  function collectPreviewCovers() {
    const boundCoverKeys = new Set(
      collectCurtainBindings().map(boundCurtain =>
        JSON.stringify([boundCurtain.floorId, boundCurtain.modelId])
      )
    );
    return stageOptions.document.floors.flatMap(previewFloor =>
      (previewFloor.scene?.items || [])
        .filter(
          previewSceneItem =>
            previewSceneItem.type === "curtain" &&
            !boundCoverKeys.has(JSON.stringify([previewFloor.id, previewSceneItem.id]))
        )
        .map(previewCurtainItem => ({
          id: "preview-cover:" + JSON.stringify([previewFloor.id, previewCurtainItem.id]),
          floorId: previewFloor.id,
          modelId: previewCurtainItem.id,
          entityId: "",
          deviceKind: "cover",
          ...resolveCurtainGeometry(previewCurtainItem),
          modelAvailable: true,
          previewOnly: true
        }))
    );
  }
  // Every configured device, regardless of the module it belongs to. Ids follow the same
  // conventions the modules use, so the 总览 page can reuse findBinding/activateBinding.
  function collectAllDeviceBindings() {
    return [
      ...collectClimateBindings(),
      ...collectCurtainBindings(),
      ...collectNasBindings(),
      ...collectTelevisionBindings(),
      ...collectVacuumBindings(),
      ...collectCameraBindings(),
      ...collectPresenceBindings()
    ].map(bindingEntry => ({
      ...bindingEntry,
      id: ["camera", "presence"].includes(bindingEntry.deviceKind)
        ? bindingEntry.id
        : bindingEntry.deviceKind + ":" + bindingEntry.id
    }));
  }
  function collectOverviewBindings() {
    return [...(config.lights || []), ...collectAllDeviceBindings()];
  }
  function resolveModuleBindings() {
    if (!isEditing && isOverviewMode()) {
      // 总览 / 全部楼层 show the house only; device buttons stay on their own tabs.
      return [];
    } else if (activeModule === "overview") {
      return collectOverviewBindings();
    } else if (activeModule === "security") {
      return [...collectCameraBindings(), ...collectPresenceBindings()];
    } else if (activeModule === "vacuum-shortcut") {
      return collectVacuumRoomShortcuts().filter(
        shortcutFilterEntry => shortcutFilterEntry.vacuumId === editingVacuumId
      );
    } else if (activeModule === "nas") {
      return collectNasBindings();
    } else if (activeModule === "vacuum") {
      return collectVacuumBindings()
        .filter(vacuumFilterEntry => isEditing || vacuumFilterEntry.entityId)
        .map(vacuumBinding => ({
          ...vacuumBinding,
          id: isEditing ? vacuumBinding.id : "vacuum:" + vacuumBinding.id
        }));
    } else if (activeModule === "television") {
      return collectTelevisionBindings();
    } else if (activeModule === "devices") {
      return [...collectNasBindings(), ...collectTelevisionBindings()].map(deviceBinding => ({
        ...deviceBinding,
        id: deviceBinding.deviceKind + ":" + deviceBinding.id
      }));
    } else if (activeModule === "cover") {
      return collectCurtainBindings();
    } else if (activeModule === "climate") {
      return collectClimateBindings();
    } else {
      return [...collectClimateBindings(), ...collectCurtainBindings()].map(
        environmentDeviceBinding => ({
          ...environmentDeviceBinding,
          id: environmentDeviceBinding.deviceKind + ":" + environmentDeviceBinding.id
        })
      );
    }
  }
  const collectModuleBindings = () => {
    let moduleBindings =
      activeModule === "security"
        ? [
            ...collectCameraBindings(),
            ...collectPresenceBindings().filter(
              securitySensorEntry => isEditing && securitySensorEntry.modelId
            )
          ]
        : activeModule === "light"
          ? config.lights || []
          : [
              ...resolveModuleBindings(),
              ...(activeModule === "vacuum" && !isEditing ? collectVacuumRoomShortcuts() : [])
            ];
    if (!isEditing && activeModule === "light") {
      moduleBindings = [
        ...moduleBindings,
        ...collectVacuumBindings()
          .filter(
            overviewVacuumEntry =>
              overviewVacuumEntry.entityId &&
              vacuumStatusPresentation(overviewVacuumEntry, statesByEntityId).active &&
              vacuumQuip(overviewVacuumEntry, statesByEntityId, performance.now())
          )
          .map(quipVacuum => ({
            ...quipVacuum,
            id: "vacuum:" + quipVacuum.id,
            overviewQuip: true
          }))
      ];
    }
    return moduleBindings.filter(isOnActiveFloor);
  };
  function renderFloorTabs() {
    navigationElement.hidden = isEditing || isViewEditing || isRangeEditorOpen;
    floorTabsElement.hidden = navigationElement.hidden || stageOptions.document.floors.length < 2;
    const floorChoices = floorNavigationChoices(stageOptions.document.floors, config.floorNumbers);
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
        floorTabButton.addEventListener("click", () => selectFloor(floorTabId));
        floorTabsElement.append(floorTabButton);
      }
    }
    for (const floorTab of floorTabsElement.children) {
      floorTab.setAttribute("aria-pressed", String(floorTab.dataset.floor === currentFloorId));
    }
  }
  function selectFloor(targetFloorId) {
    if (
      isEditing ||
      isViewEditing ||
      isRangeEditorOpen ||
      isSceneUpdating ||
      targetFloorId === currentFloorId ||
      (targetFloorId !== "all" &&
        !stageOptions.document.floors.some(
          selectedFloorEntry => selectedFloorEntry.id === targetFloorId
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
      // Leaving 全部楼层 keeps 总览 selected: it is a valid per-floor module as well.
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
  function openRangeEditor(rangeRequestId) {
    const reportRangeEditorState = (isActive, rangeError = "") =>
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
        onChange(lightRegionOverrides) {
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
      reportRangeEditorState(false, rangeEditorError.message || "范围编辑暂时不可用");
    } finally {
      isRangeEditorBusy = false;
    }
  }
  const collectCameraBindings = () =>
    (config.security?.cameras || []).map(securityCameraEntry => {
      const securityCameraSceneItem = stageOptions.document.floors
        .find(securityCameraFloor => securityCameraFloor.id === securityCameraEntry.floorId)
        ?.scene.items.find(
          cameraSceneItemCandidate =>
            cameraSceneItemCandidate.id === securityCameraEntry.modelId &&
            cameraSceneItemCandidate.type === "camera"
        );
      return {
        ...securityCameraEntry,
        buttonHidden: false,
        hiddenClickable: false,
        id: "camera:" + securityCameraEntry.id,
        deviceKind: "camera",
        clickAction: "focus",
        modelAvailable: !!securityCameraSceneItem,
        icon: securityCameraEntry.icon || "mdi:cctv",
        x: Number.isFinite(securityCameraEntry.x)
          ? securityCameraEntry.x
          : (securityCameraSceneItem?.x ?? 0),
        y: Number.isFinite(securityCameraEntry.y)
          ? securityCameraEntry.y
          : (securityCameraSceneItem?.y ?? 0),
        height: Number.isFinite(securityCameraEntry.height)
          ? securityCameraEntry.height
          : (Number(securityCameraSceneItem?.elevation) || 0) +
            (Number(securityCameraSceneItem?.height) || 0.3) / 2
      };
    });
  const collectPresenceBindings = () =>
    (config.security?.presenceSensors || []).map(presenceSensorBindingEntry => {
      const presenceSceneItem = stageOptions.document.floors
        .find(sensorFloor => sensorFloor.id === presenceSensorBindingEntry.floorId)
        ?.scene.items.find(
          sensorSceneItemCandidate =>
            sensorSceneItemCandidate.id === presenceSensorBindingEntry.modelId &&
            sensorSceneItemCandidate.type === "presence"
        );
      return {
        ...presenceSensorBindingEntry,
        modelAvailable: presenceSensorBindingEntry.modelId ? !!presenceSceneItem : undefined,
        id: "presence:" + presenceSensorBindingEntry.id,
        deviceKind: "presence",
        clickAction: "focus",
        icon: "mdi:motion-sensor",
        size: presenceSensorBindingEntry.modelId ? 36 : presenceSensorBindingEntry.size,
        x: presenceSceneItem?.x ?? presenceSensorBindingEntry.route?.[0]?.x ?? 0,
        y: presenceSceneItem?.y ?? presenceSensorBindingEntry.route?.[0]?.y ?? 0,
        height: presenceSceneItem
          ? (Number(presenceSceneItem.elevation) || 0) +
            (Number(presenceSceneItem.height) || 0.2) / 2
          : (presenceSensorBindingEntry.size ?? 1) * 0.7
      };
    });
  const findBinding = lookupId =>
    collectModuleBindings().find(bindingMatch => bindingMatch.id === lookupId) ||
    collectCameraBindings().find(cameraMatch => cameraMatch.id === lookupId) ||
    collectPresenceBindings().find(presenceMatch => presenceMatch.id === lookupId);
  function renderStage() {
    applyPageBehavior();
    syncPresenceScene();
    presenceWaves.sync({
      bindings: (config.security?.presenceSensors || [])
        .filter(
          presenceSensorFilterEntry =>
            !isEditing || "presence:" + presenceSensorFilterEntry.id === selectedId
        )
        .map(presenceSensorRecord => {
          const presenceSceneItemRecord = stageOptions.document.floors
            .find(presenceFloor => presenceFloor.id === presenceSensorRecord.floorId)
            ?.scene.items.find(
              presenceSceneItemCandidate =>
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
        syncCameraStatus();
        syncTelevisionScreens();
        syncVacuumMap();
      }
      const focusableModuleBindings = resolveModuleBindings().filter(isOnActiveFloor);
      const sceneBindings = (
        isEditing
          ? [
              ...focusableModuleBindings,
              ...(["climate", "devices", "nas", "television", "vacuum"].includes(activeModule)
                ? []
                : collectPreviewCovers())
            ]
          : collectAllDeviceBindings().concat(collectPreviewCovers())
      ).filter(visibleBinding => visibleBinding.modelAvailable && isOnActiveFloor(visibleBinding));
      const pageDimmingState = pageDimming(
        config,
        activeModule,
        !!focusedId && focusMode !== "panel"
      );
      const isEnvironmentActive = !isViewEditing && !isRangeEditorOpen && pageDimmingState.enabled;
      const pageBindings = pageModelBindings(
        stageOptions.document.floors,
        sceneBindings,
        pageDimmingState.page,
        currentFloorId
      );
      screenOutlines.sync(
        stageOptions.modelRoot,
        stageOptions.environmentRevision ?? stageOptions.sceneRevision,
        pageBindings.filter(pageBinding => !selectedId || pageBinding.id === selectedId),
        !focusedId &&
          !isViewEditing &&
          !isRangeEditorOpen &&
          currentFloorId !== "all" &&
          ["environment", "devices", "vacuum", "security"].includes(pageDimmingState.page)
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
          climateBindingEntry => climateBindingEntry.deviceKind === "climate"
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
    toggleModulePanel(isEditing || isViewEditing || isRangeEditorOpen || isAllFloors);
    const activeTabModule = ["overview", "security", "light", "devices", "vacuum"].includes(
      activeModule
    )
      ? activeModule
      : "environment";
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
  function toggleModulePanel(isHidden) {
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
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
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
  let moduleTransition = null;
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
  function animateModuleSwap(applyModuleUpdate) {
    const computedMarkersStyle = markersElement.animate ? getComputedStyle(markersElement) : null;
    const initialOpacity = computedMarkersStyle ? Number(computedMarkersStyle.opacity) : 1;
    const initialTransform = computedMarkersStyle?.transform || "none";
    cancelModuleTransition();
    if (
      !markersElement.animate ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      applyModuleUpdate();
      return;
    }
    const outgoingMarkers = collectModuleBindings()
      .map(markerIndexBinding => ({
        ...markerIndexBinding,
        index: [...markersElement.children].indexOf(markersById.get(markerIndexBinding.id))
      }))
      .filter(positionedOutgoingBinding => positionedOutgoingBinding.index >= 0);
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
    const transitionState = (moduleTransition = {
      ghost: ghostElement,
      outgoing: outgoingMarkers.map(outgoingBinding => ({
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
  function selectModule(targetModule) {
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
  const findFocusedBinding = () => findBinding(focusedId);
  const resolveLightState = lightEntityId =>
    lightPreview.state(lightEntityId, readLightState(lightEntityId));
  function lightStateForBinding(lightBinding) {
    const lightSnapshot = resolveLightState(lightBinding.entityId);
    if (isEditing && lightEffectPreview?.id === lightBinding.id) {
      lightSnapshot.on = true;
      lightSnapshot.available = true;
      if (lightEffectPreview.kind !== "defaults") {
        lightSnapshot.brightness = lightEffectPreview.kind === "brightnessMin" ? 1 : 100;
      }
      if (lightEffectPreview.kind.startsWith("brightness")) {
        lightSnapshot.brightnessSupported = true;
      }
      if (lightEffectPreview.kind.startsWith("temperature")) {
        lightSnapshot.temperatureSupported = true;
        lightSnapshot.kelvin = lightEffectPreview.kind.endsWith("Min")
          ? lightSnapshot.minimum
          : lightSnapshot.maximum;
      }
    }
    return lightSnapshot;
  }
  function applyLightStates(options) {
    const previewMode = isEditing || isViewEditing;
    const previewLightId =
      previewMode && !isViewEditing && focusMode !== "edit" ? lightEffectPreview?.id : null;
    stageOptions.setEditorEffects?.(previewMode, !!previewLightId);
    if (
      (!stageOptions.floorTransitionActive && cameraTransition?.owner !== "floor") ||
      !!stageOptions.floorEffectsFollow
    ) {
      stageOptions.setLightStates(
        (config.lights || [])
          .filter(light => light.entityId)
          .map(lightStateEntry => {
            const lightState = lightStateForBinding(lightStateEntry);
            return {
              ...lightStateEntry,
              ...(isEditing && lightEffectPreview?.id === lightStateEntry.id
                ? lightState
                : lightRenderState(lightState)),
              ...(previewMode && lightStateEntry.id !== previewLightId
                ? {
                    on: false
                  }
                : {})
            };
          }),
        previewMode
          ? {
              ...options,
              editor: true,
              immediate: true
            }
          : options
      );
    }
  }
  function syncCameraInteraction() {
    if (isRangeEditorOpen && rangeEditor?.syncCameraInteraction) {
      rangeEditor.syncCameraInteraction();
      return;
    }
    if (isRangeEditorOpen || followedVacuumId) {
      stageOptions.setCameraInteraction({
        enabled: false,
        panEnabled: false,
        zoomEnabled: false
      });
      return;
    }
    const cameraConfig = {
      ...config.camera,
      ...resolvePageBehavior(config, activeModule).interaction
    };
    const isFreeInteraction =
      isViewEditing || focusMode === "edit" || (isEditing && !focusMode && !cameraTransition);
    stageOptions.setCameraInteraction({
      enabled:
        !markerDragState &&
        (isFreeInteraction ||
          (isInteractive &&
            (!focusMode || focusMode === "panel") &&
            !cameraTransition &&
            !isIdleRotating)),
      rotationMode: isFreeInteraction ? "free" : cameraConfig.rotationMode,
      panEnabled: isFreeInteraction,
      zoomEnabled: isFreeInteraction
    });
  }
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
    const navigationWidth = configuredModules.length * 50 + 6;
    const navigationSettings = config.navigation || {};
    const scaleSetting = navigationEntry =>
      Number.isFinite(navigationEntry?.scale)
        ? Math.max(0.5, Math.min(2, navigationEntry.scale))
        : 1;
    const navigationScale = Math.min(
      scaleSetting(navigationSettings.categories) * 2,
      (layoutWidth - 24) / navigationWidth,
      (layoutHeight - 24) / (navigationElement.offsetHeight || 36)
    );
    const floorScale = Math.min(
      scaleSetting(navigationSettings.floors) * 2,
      (layoutHeight - 24) / (floorTabsElement.scrollHeight || 240),
      (layoutWidth - 24) / (floorTabsElement.offsetWidth || 80)
    );
    presentationElement.style.setProperty("--i3d-navigation-scale", String(navigationScale));
    presentationElement.style.setProperty("--i3d-floor-scale", String(floorScale));
    const placeNavigationElement = (
      elementToPlace,
      offsetSettings,
      fallbackPosition,
      layoutScale,
      fallbackWidth,
      fallbackHeight
    ) => {
      const scaledWidth =
        (elementToPlace === navigationElement
          ? navigationWidth
          : elementToPlace.offsetWidth || fallbackWidth) * layoutScale;
      const scaledHeight = (elementToPlace.offsetHeight || fallbackHeight) * layoutScale;
      const offsetPercent = (axisName, fallbackPercent) =>
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
  function moveFocusInto(targetElement, focusElement = canvasElement) {
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
        activeElement.blur();
      }
    }
  }
  function updateMarkerVisibility() {
    const isFloorMarkersTransitioning =
      cameraTransition?.owner === "floor" && !cameraTransition.markersRevealed;
    const hasHiddenClickable =
      !isEditing &&
      !isViewEditing &&
      collectModuleBindings().some(
        concealedMarkerBinding =>
          concealedMarkerBinding.visible !== false &&
          concealedMarkerBinding.buttonHidden !== true &&
          concealedMarkerBinding.hiddenClickable === true
      );
    const shouldConcealMarkers =
      isFloorMarkersTransitioning ||
      hasUserInteracted ||
      areIconsHiddenByRotation ||
      (areIdleIconsHidden && !hasHiddenClickable) ||
      (hasIdleReturnPending && pageBehavior.hideIconsWhileRotating === true) ||
      (!!focusMode && !["edit", "panel"].includes(focusMode));
    for (const [markerId, marker] of markersById) {
      const isButtonHidden = !isEditing && findBinding(markerId)?.buttonHidden === true;
      const isHiddenClickable =
        !isEditing &&
        !isViewEditing &&
        !isButtonHidden &&
        findBinding(markerId)?.hiddenClickable === true;
      marker.disabled =
        cameraTransition?.owner === "floor" ||
        isButtonHidden ||
        (!isEditing && (isOverviewMode() || findBinding(markerId)?.overviewQuip === true));
      const visibilityBinding = findBinding(markerId);
      const isPassiveMarker =
        !isEditing &&
        (visibilityBinding?.passiveSensor ||
          (visibilityBinding?.deviceKind === "vacuum" &&
            vacuumStatusPresentation(visibilityBinding, statesByEntityId).active));
      const markerLayerElement = isPassiveMarker ? vacuumWorkingLayerElement : markersElement;
      if (marker.parentElement !== markerLayerElement) {
        markerLayerElement.append(marker);
      }
      const isIdleHidden =
        (isFloorMarkersTransitioning && isPassiveMarker) ||
        (!isPassiveMarker &&
          (areIdleIconsHidden || areIconsHiddenByRotation) &&
          !isHiddenClickable &&
          !isEditing &&
          !isViewEditing);
      marker.classList.toggle("is-hidden-clickable", isHiddenClickable);
      marker.classList.toggle("is-idle-hidden", isIdleHidden);
      if (
        isIdleHidden ||
        isButtonHidden ||
        (!isEditing && (isOverviewMode() || findBinding(markerId)?.overviewQuip === true))
      ) {
        moveFocusInto(marker);
        marker.setAttribute("inert", "");
      } else {
        marker.removeAttribute("inert");
      }
      marker.title = isHiddenClickable ? "" : marker.getAttribute("aria-label") || "";
    }
    if (shouldConcealMarkers) {
      moveFocusInto(
        markersElement,
        lightPanelElement.classList.contains("is-open") ? lightPanelElement : canvasElement
      );
      markersElement.setAttribute("inert", "");
    } else if (moduleTransition) {
      markersElement.setAttribute("inert", "");
    } else {
      markersElement.removeAttribute("inert");
    }
    markersElement.removeAttribute("aria-hidden");
    if (shouldConcealMarkers && idleSinceTimestamp === null) {
      idleSinceTimestamp = performance.now();
    } else if (!shouldConcealMarkers) {
      idleSinceTimestamp = null;
    }
    markersElement.style.transition = isFloorMarkersTransitioning ? "none" : "";
    markersElement.style.opacity = isFloorMarkersTransitioning ? "0" : "";
    markersElement.classList.toggle("is-concealed", shouldConcealMarkers);
  }
  function updatePanelChrome() {
    const isFocusHidden = !!focusedId && !!focusMode && focusMode !== "panel";
    for (const chromeElement of [navigationElement, floorTabsElement]) {
      chromeElement.classList.toggle("is-focus-hidden", isFocusHidden);
      chromeElement.inert = isFocusHidden;
      chromeElement.setAttribute("aria-hidden", String(isFocusHidden));
    }
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
  function advanceCameraTransition(transitionTimestamp) {
    if (!cameraTransition) {
      return;
    }
    const activeCameraTransition = cameraTransition;
    const elapsedMs = Math.max(0, transitionTimestamp - cameraTransition.started);
    const transitionProgress = cameraTransition.transition.progress(elapsedMs);
    focusViewportInset =
      cameraTransition.inset +
      (cameraTransition.targetInset - cameraTransition.inset) * transitionProgress;
    const transitionPose = cameraTransition.transition.sample(elapsedMs);
    if (cameraTransition.owner === "floor") {
      stageOptions.advanceFloorTransition?.(transitionProgress, transitionPose);
    }
    if (stageOptions.applyCameraFrame) {
      stageOptions.applyCameraFrame(transitionPose, transitionProgress, focusViewportInset);
    } else {
      stageOptions.applyCameraPose(transitionPose, transitionProgress);
      stageOptions.setFocusViewport(focusViewportInset);
    }
    if (
      cameraTransition.owner === "floor" &&
      transitionProgress >= 0.9 &&
      !cameraTransition.presentationRevealed
    ) {
      cameraTransition.presentationRevealed = true;
      renderStage();
    }
    if (
      cameraTransition.owner === "floor" &&
      transitionProgress >= 0.9 &&
      !cameraTransition.markersRevealed
    ) {
      cameraTransition.markersRevealed = true;
      updateMarkerVisibility();
      updateMarkerPositions(true);
    }
    if (
      cameraTransition.transition.settled(elapsedMs) &&
      cameraTransition === activeCameraTransition
    ) {
      cameraTransition = null;
      stageOptions.endCameraMotion();
      syncCameraInteraction();
      activeCameraTransition.done?.();
      updateIdleControllers();
    }
  }
  function constrainCameraPose(cameraPose) {
    if (!cameraPose) {
      return cameraPose;
    }
    if (cameraPose.view !== "top") {
      return stageOptions.constrainCameraPose({
        ...cameraPose,
        up: [0, 1, 0]
      });
    }
    const poseTargetPoint = new THREE.Vector3(...cameraPose.target);
    const topViewHeight = Math.max(
      new THREE.Vector3(...cameraPose.position).distanceTo(poseTargetPoint),
      0.001
    );
    const topRotationRad = THREE.MathUtils.degToRad(cameraPose.topRotation || 0);
    const upVector = new THREE.Vector3(
      ...(cameraPose.up || [Math.sin(topRotationRad), 0, -Math.cos(topRotationRad)])
    );
    upVector.y = 0;
    if (upVector.lengthSq() < 1e-12) {
      upVector.set(Math.sin(topRotationRad), 0, -Math.cos(topRotationRad));
    }
    return stageOptions.constrainCameraPose({
      ...cameraPose,
      position: [poseTargetPoint.x, poseTargetPoint.y + topViewHeight, poseTargetPoint.z],
      up: upVector.normalize().toArray()
    });
  }
  function beginCameraTransition(
    targetCameraPose,
    focused,
    immediateTransition = false,
    onTransitionDone,
    transitionOwner = "focus",
    floorFrame = null
  ) {
    const transitionTargetPose =
      transitionOwner === "follow-return"
        ? targetCameraPose
        : constrainCameraPose(targetCameraPose);
    const transitionFromPose = stageOptions.beginCameraMotion(
      transitionTargetPose.mode,
      transitionTargetPose,
      transitionOwner
    );
    if (transitionOwner === "floor") {
      stageOptions.setFloorSlideCameras?.(transitionFromPose, transitionTargetPose);
    }
    const isImmediate =
      immediateTransition || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    cameraTransition = {
      from: transitionFromPose,
      to: structuredClone(transitionTargetPose),
      inset: focusViewportInset,
      targetInset: focused ? computePanelInsetRatio() : 0,
      transition: createDampedCameraMotion(THREE, transitionFromPose, transitionTargetPose, {
        immediate: isImmediate,
        owner: transitionOwner,
        floorFrame: floorFrame
      }),
      focused: focused,
      owner: transitionOwner,
      started: performance.now(),
      done: onTransitionDone
    };
    updateIdleControllers();
    syncCameraInteraction();
    advanceCameraTransition(cameraTransition.started);
    wakeFrameLoop();
  }
  function cameraPosesEqual(poseA, poseB) {
    return (
      poseA.mode === poseB.mode &&
      Math.abs(poseA.zoom - poseB.zoom) < 0.000001 &&
      ["position", "target", "up"].every(poseKey =>
        (poseA[poseKey] || [0, 1, 0]).every(
          (poseValue, poseValueIndex) =>
            Math.abs(poseValue - (poseB[poseKey] || [0, 1, 0])[poseValueIndex]) < 0.000001
        )
      ) &&
      ["frameSize", "focalLength"].every(
        numberKey => Math.abs((poseA[numberKey] || 0) - (poseB[numberKey] || 0)) < 0.000001
      )
    );
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
  function applyPageBehavior() {
    pageBehavior = resolvePageBehavior(config, activeModule);
    idleRotation.configure(pageBehavior.autoRotate);
    idleIconVisibility.configure(pageBehavior.idleHideIcons);
    idleFocusExit.configure(pageBehavior.idleExitFocus);
    syncCameraInteraction();
    if (!pageBehavior.hideIconsWhileRotating) {
      areIconsHiddenByRotation = false;
      idleIconHideDeadline = 0;
    }
  }
  function updateIdleControllers() {
    const canAnimate =
      isPresented &&
      isPageVisible &&
      isInteractive &&
      !isEditing &&
      !isViewEditing &&
      !isRangeEditorOpen &&
      !document.hidden &&
      !isDisposed;
    if (!canAnimate) {
      clearInputState();
    }
    idleRotation.setAvailable(
      canAnimate &&
        !followedVacuumId &&
        !focusedId &&
        !focusMode &&
        (!cameraTransition || cameraTransition.owner === "idle")
    );
    idleFocusExit.setAvailable(
      canAnimate && !!focusedId && ["runtime", "panel"].includes(focusMode) && !cameraTransition
    );
    idleIconVisibility.setAvailable(canAnimate);
    frameLoop?.setAvailable(!document.hidden && (!hasActivityState || isPresentedVisible));
    if (document.hidden || !isPresentedVisible) {
      backgroundTheme.suspend();
    }
    wakeFrameLoop();
  }
  function updateActivityHolds() {
    const isHeld = isActivityHeld || activePointerIds.size > 0 || pressedKeys.size > 0;
    idleRotation.hold(isHeld);
    idleIconVisibility.hold(isHeld);
    idleFocusExit.hold(isHeld);
    wakeFrameLoop();
  }
  function trackUserInput(inputEvent) {
    if (followedVacuumId && inputEvent.key === "Escape") {
      stopVacuumFollow();
    }
    lastActivityTimestamp = performance.now();
    hasUserInteracted = false;
    updateMarkerVisibility();
    if (inputEvent.type === "pointerdown") {
      activePointerIds.add(inputEvent.pointerId);
    }
    if (inputEvent.type === "pointerup" || inputEvent.type === "pointercancel") {
      activePointerIds.delete(inputEvent.pointerId);
    }
    if (inputEvent.type === "keydown") {
      pressedKeys.add(inputEvent.code || inputEvent.key);
    }
    if (inputEvent.type === "keyup") {
      pressedKeys.delete(inputEvent.code || inputEvent.key);
    }
    updateActivityHolds();
  }
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
  function clearInputState() {
    activePointerIds.clear();
    pressedKeys.clear();
    isActivityHeld = false;
    updateActivityHolds();
  }
  window.addEventListener("blur", clearInputState);
  if (document.addEventListener) {
    document.addEventListener("visibilitychange", updateIdleControllers);
  }
  function exitFocus(exitOptions = {}) {
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
  function focusBinding(focusId, focusModeName = "runtime", immediateFocus = false) {
    const focusedBinding = findBinding(focusId);
    if (!focusedBinding || focusedBinding.modelAvailable === false) {
      return;
    }
    if (lightEffectPreview) {
      lightEffectPreview = null;
      applyLightStates();
    }
    if (focusedId === focusId && focusMode === focusModeName && focusModeName === "runtime") {
      exitFocus();
      return;
    }
    if (["runtime", "panel"].includes(focusModeName) && (!isInteractive || isOverviewMode())) {
      return;
    }
    idleFocusExit.activity();
    if (focusModeName === "panel") {
      if (focusRestoreCameraPose || cameraTransition) {
        exitFocus({
          immediate: true
        });
      }
      focusedId = focusId;
      focusMode = "panel";
      controlErrorElement.textContent = "";
      lightPanelElement.removeAttribute("inert");
      lightPanelElement.classList.add("is-open");
      updatePanelChrome();
      renderLightPanel();
      syncCameraInteraction();
      updateIdleControllers();
      postToHost({
        type: "focus-state",
        active: false,
        panelOpen: true,
        id: focusId
      });
      maybeOpenDevicePopup(focusedBinding);
      return;
    }
    focusRestoreCameraPose ||= stageOptions.cameraState(true);
    const focusAnchor =
      focusedBinding.deviceKind === "presence"
        ? presenceScene.anchor(focusedBinding.id.slice(9))
        : focusedBinding.modelId
          ? stageOptions.environmentModelPose?.(focusedBinding.floorId, focusedBinding.modelId)
          : null;
    const focusTarget =
      focusAnchor?.center ||
      stageOptions
        .worldPoint(
          focusedBinding.floorId,
          focusedBinding.x,
          focusedBinding.y,
          focusedBinding.height
        )
        ?.toArray();
    if (!focusTarget) {
      return;
    }
    focusedId = focusId;
    focusMode = focusModeName;
    controlErrorElement.textContent = "";
    if (isEditing || !isFocusableDevice(focusedBinding) || focusedBinding.clickAction !== "focus") {
      lightPanelElement.removeAttribute("inert");
      lightPanelElement.classList.add("is-open");
    } else {
      lightPanelElement.setAttribute("inert", "");
      lightPanelElement.classList.remove("is-open");
    }
    stageOptions.setOrbitPivot(null);
    updatePanelChrome();
    renderLightPanel();
    const baseCameraPose = config.camera || savedCameraPose || focusRestoreCameraPose;
    const focusPose =
      focusedBinding.focusCamera ||
      (focusedBinding.modelId
        ? automaticAirConditionerCamera(
            THREE,
            {
              ...baseCameraPose,
              viewportAspect: canvasElement.clientWidth / Math.max(1, canvasElement.clientHeight)
            },
            focusTarget,
            focusAnchor?.forward,
            focusAnchor?.size,
            focusedBinding.deviceKind === "nas"
              ? {
                  minimumFrameSize: 0.7,
                  minimumDistance: 0.6
                }
              : {}
          )
        : automaticLightCamera(THREE, baseCameraPose, focusTarget));
    if (!isEditing) {
      postToHost({
        type: "focus-state",
        active: true,
        id: focusId
      });
    }
    beginCameraTransition(focusPose, true, immediateFocus, () => {
      if (focusedBinding.deviceKind !== "camera") {
        maybeOpenDevicePopup(focusedBinding);
      }
    });
    if (focusedBinding.deviceKind === "camera") {
      maybeOpenDevicePopup(focusedBinding);
    }
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
  function renderPowerButton(powerLightState) {
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
  function renderLightPanel() {
    const panelBinding = findFocusedBinding();
    if (["vacuum", "presence", "camera"].includes(panelBinding?.deviceKind)) {
      lightPanelElement.classList.remove("is-open");
      lightPanelElement.setAttribute("inert", "");
      return;
    }
    const isNasPanel = panelBinding?.deviceKind === "nas";
    const isTelevisionPanel = panelBinding?.deviceKind === "television";
    if (!isTelevisionPanel || !lightPanelElement.classList.contains("is-open")) {
      televisionPanel.hide();
    } else {
      televisionPanel.root.hidden = false;
    }
    nasPanel.root.hidden = !isNasPanel;
    lightPanelElement.classList.toggle("is-nas-panel", isNasPanel);
    lightPanelElement.classList.toggle("is-television-panel", isTelevisionPanel);
    if (isNasPanel || isTelevisionPanel) {
      lightPanelElement.classList.remove(
        "is-cover-panel",
        "is-climate-panel",
        "has-light-controls",
        "has-error"
      );
      lightPanelElement.setAttribute("aria-label", isTelevisionPanel ? "电视状态" : "NAS 状态");
      if (panelBinding.clickAction === "focus" && !isEditing) {
        lightPanelElement.classList.remove("is-open");
        lightPanelElement.setAttribute("inert", "");
      }
      climatePanel.root.hidden =
        coverPanel.root.hidden =
        lightPanelHeader.hidden =
        lightControlsElement.hidden =
        controlErrorElement.hidden =
          true;
      if (isTelevisionPanel) {
        if (
          (isEditing || panelBinding.clickAction !== "focus") &&
          lightPanelElement.classList.contains("is-open")
        ) {
          televisionPanel.update({
            item: panelBinding,
            states: statesByEntityId,
            editing: isEditing || !isInteractive
          });
        }
      } else {
        nasPanel.update({
          item: panelBinding,
          states: statesByEntityId
        });
      }
      return;
    }
    const isCoverPanel = panelBinding?.deviceKind === "cover";
    const isClimatePanel = !!panelBinding?.modelId && !isCoverPanel;
    climatePanel.root.hidden = !isClimatePanel;
    coverPanel.root.hidden = !isCoverPanel;
    lightPanelHeader.hidden =
      lightControlsElement.hidden =
      controlErrorElement.hidden =
        isClimatePanel || isCoverPanel;
    lightPanelElement.classList.toggle("is-cover-panel", isCoverPanel);
    lightPanelElement.classList.toggle("is-climate-panel", isClimatePanel);
    lightPanelElement.setAttribute(
      "aria-label",
      isCoverPanel ? "窗帘控制" : isClimatePanel ? "空调控制" : "灯光控制"
    );
    if (!panelBinding) {
      return exitFocus();
    }
    if (isCoverPanel) {
      lightPanelElement.classList.remove("has-light-controls", "has-error");
      const coverStateValue = coverState(
        panelBinding.entityId,
        statesByEntityId[panelBinding.entityId],
        panelBinding
      );
      if (!panelBinding.modelAvailable) {
        coverStateValue.available = false;
      }
      const coverPanelPresentation = resolveCoverPresentation(panelBinding, coverStateValue);
      coverPanel.update({
        item: panelBinding,
        state: coverStateValue,
        presentation: coverPanelPresentation,
        editing: isEditing,
        error: panelBinding.modelAvailable
          ? coverPanelPresentation.error || ""
          : "窗帘模型已移除，请重新配置。"
      });
      return;
    }
    if (isClimatePanel) {
      lightPanelElement.classList.remove("has-light-controls", "has-error");
      const climateStateValue = climateState(
        panelBinding.entityId,
        statesByEntityId[panelBinding.entityId]
      );
      if (!panelBinding.modelAvailable) {
        climateStateValue.available = false;
      }
      climatePanel.update({
        item: panelBinding,
        state: climateStateValue,
        editing: isEditing,
        error: panelBinding.modelAvailable ? "" : "空调模型已移除，请重新配置。"
      });
      return;
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
      pendingCommand => pendingCommand.entityId === panelBinding.entityId
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
    temperatureControl.input.min = panelLightState.minimum;
    temperatureControl.input.max = panelLightState.maximum;
    for (const [sliderControl, isSupported, currentSliderValue, unitSuffix] of [
      [brightnessControl, panelLightState.brightnessSupported, panelLightState.brightness, "%"],
      [temperatureControl, panelLightState.temperatureSupported, panelLightState.kelvin, " K"]
    ]) {
      sliderControl.root.hidden = !isSupported;
      sliderControl.input.disabled = isEditing || !panelLightState.available || !panelLightState.on;
      if (document.activeElement !== sliderControl.input) {
        sliderControl.input.value =
          currentSliderValue ??
          (sliderControl === brightnessControl ? 100 : panelLightState.minimum);
        sliderControl.value.value =
          currentSliderValue === null ? "—" : "" + currentSliderValue + unitSuffix;
      }
    }
    presetGroupElement.hidden =
      !panelLightState.brightnessSupported && !panelLightState.temperatureSupported;
    for (const presetEntry of presetEntries) {
      const presetKelvin = Math.round(
        panelLightState.minimum +
          ((panelLightState.maximum - panelLightState.minimum) * presetEntry.temperaturePercent) /
            100
      );
      const isPresetActive =
        panelLightState.on &&
        (!panelLightState.brightnessSupported ||
          Math.abs(panelLightState.brightness - presetEntry.brightness) <= 4) &&
        (!panelLightState.temperatureSupported ||
          Math.abs(panelLightState.kelvin - presetKelvin) <=
            Math.max(50, (panelLightState.maximum - panelLightState.minimum) * 0.06));
      presetEntry.button.disabled =
        isEditing || !panelLightState.available || !panelLightState.on || presetGroupElement.hidden;
      presetEntry.button.classList.toggle("is-active", isPresetActive);
      presetEntry.button.setAttribute("aria-pressed", String(isPresetActive));
      presetEntry.detail.textContent = panelLightState.brightnessSupported
        ? presetEntry.brightness + "%"
        : "开启";
    }
  }
  function sendLightCommand(commandRequest, commandPreviewToken) {
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
  function queueLightCommand(queuedCommandRequest, queuedPreviewToken) {
    const existingRequest = [...lightRequestsById.values()].find(
      existingRequestEntry => existingRequestEntry.entityId === queuedCommandRequest.entityId
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
  function settleLightCommand(lightRequestKey, lightError = "", isTimedOut = false) {
    const lightRequest = lightRequestsById.get(lightRequestKey);
    if (!lightRequest) {
      return;
    }
    clearTimeout(lightRequest.timeout);
    lightRequestsById.delete(lightRequestKey);
    const nextCommand = lightRequest.next;
    const shouldSendNext =
      nextCommand &&
      !isTimedOut &&
      !isDisposed &&
      !isEditing &&
      isInteractive &&
      activeModule === "light" &&
      currentFloorId !== "all" &&
      (config.lights || []).some(
        matchingLightEntry =>
          isOnActiveFloor(matchingLightEntry) &&
          matchingLightEntry.entityId === lightRequest.entityId
      ) &&
      readLightState(lightRequest.entityId).available;
    if (lightError) {
      lightPreview.reject(lightRequest.entityId, lightRequest.previewToken);
    } else {
      lightPreview.acknowledge(lightRequest.entityId, lightRequest.previewToken);
    }
    if (shouldSendNext) {
      sendLightCommand(nextCommand.command, nextCommand.previewToken);
    } else if (nextCommand) {
      lightPreview.reject(lightRequest.entityId, nextCommand.previewToken);
    }
    if (findFocusedBinding()?.entityId === lightRequest.entityId) {
      controlErrorElement.textContent = shouldSendNext ? "" : lightError;
    }
    renderMarkers();
  }
  async function runLightCommand(service, serviceValue, targetBinding = findFocusedBinding()) {
    if (!!targetBinding && !isEditing && !isDisposed) {
      try {
        const lightStateSnapshot = readLightState(targetBinding.entityId);
        let lightCommandPayload;
        let previewValue = serviceValue;
        if (service === "preset") {
          if (!LIGHT_PRESETS.includes(serviceValue)) {
            throw new Error("灯光预设无效。");
          }
          const serviceParams = [];
          previewValue = {};
          if (lightStateSnapshot.brightnessSupported) {
            serviceParams.push(["brightness", serviceValue.brightness]);
            previewValue.brightness = serviceValue.brightness;
          }
          if (lightStateSnapshot.temperatureSupported) {
            previewValue.kelvin = Math.round(
              lightStateSnapshot.minimum +
                ((lightStateSnapshot.maximum - lightStateSnapshot.minimum) *
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
              ...generatedCommands.map(generatedCommand => generatedCommand.data)
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
        controlErrorElement.textContent = lightCommandError.message;
        renderLightPanel();
      }
    }
  }
  function activateBinding(activationBindingId, fromPointer = false) {
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
  let markerLayoutSignature = "";
  function updateMarkerPositions(forceLayout = false) {
    if (isRangeEditorOpen || isSceneUpdating || isDisposed) {
      return;
    }
    if (stageOptions.floorTransitionActive || cameraTransition) {
      screenOutlines.pause();
    }
    screenOutlines.update();
    if (
      idleSinceTimestamp !== null &&
      performance.now() - idleSinceTimestamp >= 240 &&
      !collectModuleBindings().some(
        positionedMarkerBinding =>
          positionedMarkerBinding.deviceKind === "vacuum" &&
          vacuumStatusPresentation(positionedMarkerBinding, statesByEntityId).active
      )
    ) {
      markerLayoutSignature = "";
      return;
    }
    stageOptions.camera.updateMatrixWorld();
    if (cachedSceneDocument !== stageOptions.document || cachedMarkerFloorId !== currentFloorId) {
      markerPointsById.clear();
      cachedSceneDocument = stageOptions.document;
      cachedMarkerFloorId = currentFloorId;
    }
    const viewportRect = presentationLayout || containerElement.getBoundingClientRect();
    const viewportWidth = presentationLayout?.width || viewportRect.width;
    const viewportHeight = presentationLayout?.height || viewportRect.height;
    if (moduleTransition && stageOptions.presentationPoint) {
      for (const outgoingMarker of moduleTransition.outgoing) {
        if (!outgoingMarker.node) {
          continue;
        }
        const markerWorldPoint = stageOptions.presentationPoint(
          outgoingMarker.floorId,
          outgoingMarker.x,
          outgoingMarker.y,
          outgoingMarker.height
        );
        if (!markerWorldPoint) {
          outgoingMarker.node.hidden = true;
          continue;
        }
        const markerProjectedPoint = markerWorldPoint.project(stageOptions.camera);
        outgoingMarker.node.hidden =
          markerProjectedPoint.z < -1 ||
          markerProjectedPoint.z > 1 ||
          Math.abs(markerProjectedPoint.x) > 1.05 ||
          Math.abs(markerProjectedPoint.y) > 1.05;
        outgoingMarker.node.style.left = ((markerProjectedPoint.x + 1) * viewportWidth) / 2 + "px";
        outgoingMarker.node.style.top = ((1 - markerProjectedPoint.y) * viewportHeight) / 2 + "px";
      }
    }
    const isUniformOverview =
      currentFloorId === "all" && stageOptions.document.uniformOverviewStack === true;
    const layoutSignature =
      viewportWidth +
      ":" +
      viewportHeight +
      ":" +
      isUniformOverview +
      ":" +
      stageOptions.camera.matrixWorld.elements +
      ":" +
      stageOptions.camera.projectionMatrix.elements;
    if (
      forceLayout === true ||
      !!stageOptions.floorTransitionActive ||
      layoutSignature !== markerLayoutSignature
    ) {
      markerLayoutSignature = layoutSignature;
      for (const markerBindingEntry of collectModuleBindings()) {
        const markerPositionBinding =
          markerDragState?.id === markerBindingEntry.id
            ? {
                ...markerBindingEntry,
                ...markerDragState.point
              }
            : markerBindingEntry;
        const markerBindingId = markerPositionBinding.id;
        const markerElementRef = markersById.get(markerBindingId);
        if (!markerElementRef) {
          continue;
        }
        const isMarkerVisible =
          (isEditing || markerPositionBinding.visible !== false) &&
          (isEditing || markerPositionBinding.buttonHidden !== true) &&
          markerPositionBinding.modelAvailable !== false &&
          (currentFloorId === "all" || markerPositionBinding.floorId === currentFloorId);
        let cachedMarkerPoint = markerPointsById.get(markerBindingId);
        if (
          isMarkerVisible &&
          (!cachedMarkerPoint ||
            cachedMarkerPoint.floorId !== markerPositionBinding.floorId ||
            cachedMarkerPoint.x !== markerPositionBinding.x ||
            cachedMarkerPoint.y !== markerPositionBinding.y ||
            cachedMarkerPoint.height !== markerPositionBinding.height)
        ) {
          cachedMarkerPoint = {
            floorId: markerPositionBinding.floorId,
            x: markerPositionBinding.x,
            y: markerPositionBinding.y,
            height: markerPositionBinding.height,
            point: stageOptions.worldPoint(
              markerPositionBinding.floorId,
              markerPositionBinding.x,
              markerPositionBinding.y,
              markerPositionBinding.height
            )
          };
          markerPointsById.set(markerBindingId, cachedMarkerPoint);
        }
        const resolvedMarkerPoint =
          isMarkerVisible &&
          ((stageOptions.floorTransitionActive || isUniformOverview) &&
          stageOptions.presentationPoint
            ? stageOptions.presentationPoint(
                markerPositionBinding.floorId,
                markerPositionBinding.x,
                markerPositionBinding.y,
                markerPositionBinding.height
              )
            : cachedMarkerPoint?.point);
        if (!resolvedMarkerPoint) {
          markerElementRef.hidden = true;
          continue;
        }
        const projectedMarkerPoint = tempProjectedPoint
          .copy(resolvedMarkerPoint)
          .project(stageOptions.camera);
        markerElementRef.hidden =
          projectedMarkerPoint.z < -1 ||
          projectedMarkerPoint.z > 1 ||
          Math.abs(projectedMarkerPoint.x) > 1.05 ||
          Math.abs(projectedMarkerPoint.y) > 1.05;
        markerElementRef.style.left = ((projectedMarkerPoint.x + 1) * viewportWidth) / 2 + "px";
        markerElementRef.style.top = ((1 - projectedMarkerPoint.y) * viewportHeight) / 2 + "px";
      }
    }
  }
  function renderMarkers() {
    if (isSceneUpdating) {
      return;
    }
    wakeFrameLoop();
    const activeMarkerIds = new Set(
      collectModuleBindings().map(renderMarkerBinding => renderMarkerBinding.id)
    );
    for (const [activeMarkerId, staleMarker] of markersById) {
      if (!activeMarkerIds.has(activeMarkerId)) {
        staleMarker.remove();
        markersById.delete(activeMarkerId);
        markerPointsById.delete(activeMarkerId);
      }
    }
    for (const renderedBinding of collectModuleBindings()) {
      let markerElement = markersById.get(renderedBinding.id);
      if (!markerElement) {
        markerElement = makeElement(renderedBinding.passiveSensor ? "div" : "button", "i3d-marker");
        markerElement.type = "button";
        markerElement.addEventListener("click", markerClickEvent => {
          markerClickEvent.stopPropagation();
          if (
            !findBinding(renderedBinding.id)?.passiveSensor &&
            !isSceneUpdating &&
            !isViewEditing &&
            focusMode !== "edit" &&
            (!!isEditing || findBinding(renderedBinding.id)?.buttonHidden !== true)
          ) {
            if (markerElement.dataset.dragged === "true") {
              markerElement.dataset.dragged = "";
              return;
            }
            activateBinding(renderedBinding.id, true);
          }
        });
        markerElement.addEventListener("pointerdown", markerPointerDownEvent =>
          beginMarkerDrag(markerPointerDownEvent, renderedBinding.id)
        );
        markerElement.addEventListener("pointermove", moveMarkerDrag);
        markerElement.addEventListener("pointerup", endMarkerDrag);
        markerElement.addEventListener("pointercancel", cancelMarkerDrag);
        markersElement.append(markerElement);
        markersById.set(renderedBinding.id, markerElement);
      }
      const iconName = /^mdi:[a-z0-9-]+$/.test(renderedBinding.icon || "")
        ? renderedBinding.icon
        : "";
      const isVacuumMarker = renderedBinding.deviceKind === "vacuum";
      const isVacuumRoomMarker = renderedBinding.deviceKind === "vacuum-room";
      if (!isVacuumMarker && markerElement.dataset.icon !== iconName) {
        markerElement.dataset.icon = iconName;
        if (iconName) {
          const iconElement = makeElement("span", "i3d-marker-icon");
          iconElement.setAttribute("aria-hidden", "true");
          iconElement.style.maskImage =
            'url("/static/vendor/mdi/7.4.47/svg/' + iconName.slice(4) + '.svg")';
          iconElement.style.webkitMaskImage = iconElement.style.maskImage;
          markerElement.replaceChildren(iconElement);
        } else {
          markerElement.innerHTML = DEFAULT_MARKER_ICON_SVG;
        }
      }
      const deviceState = renderedBinding.deviceKind?.startsWith("vacuum")
        ? {
            available:
              !!statesByEntityId[renderedBinding.entityId] &&
              !["unknown", "unavailable"].includes(
                statesByEntityId[renderedBinding.entityId].state
              ),
            on: statesByEntityId[renderedBinding.entityId]?.state === "cleaning"
          }
        : renderedBinding.deviceKind === "television"
          ? televisionState(renderedBinding, statesByEntityId)
          : renderedBinding.deviceKind === "nas"
            ? nasDeviceState(renderedBinding, statesByEntityId)
            : renderedBinding.deviceKind === "cover"
              ? coverState(
                  renderedBinding.entityId,
                  statesByEntityId[renderedBinding.entityId],
                  renderedBinding
                )
              : renderedBinding.modelId
                ? climateState(renderedBinding.entityId, statesByEntityId[renderedBinding.entityId])
                : resolveLightState(renderedBinding.entityId);
      const markerSize =
        Number.isFinite(renderedBinding.size) && renderedBinding.size > 0
          ? renderedBinding.size
          : 44;
      const iconSize =
        Number.isFinite(renderedBinding.iconSize) && renderedBinding.iconSize > 0
          ? renderedBinding.iconSize
          : isVacuumMarker
            ? 26
            : Math.min(markerSize, Math.max(4, markerSize - 18));
      const hitSize =
        Number.isFinite(renderedBinding.hitSize) && renderedBinding.hitSize > 0
          ? renderedBinding.hitSize
          : Math.max(44, markerSize);
      markerElement.style.width = markerElement.style.height = hitSize + "px";
      markerElement.classList.toggle("is-vacuum-status", isVacuumMarker);
      markerElement.classList.toggle("is-overview-quip", renderedBinding.overviewQuip === true);
      markerElement.style.pointerEvents =
        renderedBinding.overviewQuip || renderedBinding.passiveSensor ? "none" : "";
      markerElement.classList.toggle("is-presence-wave", renderedBinding.passiveSensor === true);
      markerElement.classList.toggle(
        "is-security-label",
        renderedBinding.deviceKind === "camera" ||
          (renderedBinding.deviceKind === "presence" && isEditing)
      );
      if (isVacuumMarker) {
        let statusElement = markerElement.querySelector(".i3d-vacuum-status");
        if (
          !statusElement ||
          statusElement.dataset.compact !== String(renderedBinding.overviewQuip === true)
        ) {
          statusElement = makeElement("span", "i3d-vacuum-status");
          statusElement.dataset.compact = String(renderedBinding.overviewQuip === true);
          if (!renderedBinding.overviewQuip) {
            statusElement.append(
              makeElement("strong", "i3d-vacuum-status-name"),
              makeElement("span", "i3d-vacuum-status-detail")
            );
            statusElement.lastElementChild.append(
              makeElement("span", "i3d-vacuum-status-text"),
              makeElement("span", "i3d-vacuum-status-battery")
            );
          }
          statusElement.append(makeElement("span", "i3d-vacuum-quip"));
          if (renderedBinding.overviewQuip) {
            Object.assign(statusElement.style, {
              opacity: ".55",
              pointerEvents: "none",
              background: "none",
              border: "none",
              boxShadow: "none",
              backdropFilter: "none",
              webkitBackdropFilter: "none"
            });
            statusElement.lastElementChild.style.pointerEvents = "none";
          }
          markerElement.replaceChildren(statusElement);
        }
        const vacuumStatus = vacuumStatusPresentation(renderedBinding, statesByEntityId);
        const statusScale = markerSize / 44;
        if (!renderedBinding.overviewQuip) {
          statusElement.querySelector(".i3d-vacuum-status-name").textContent =
            renderedBinding.label || "扫地机器人";
          statusElement.querySelector(".i3d-vacuum-status-text").textContent = vacuumStatus.status;
          statusElement.querySelector(".i3d-vacuum-status-battery").textContent =
            vacuumStatus.battery;
        }
        const quipElement = statusElement.querySelector(".i3d-vacuum-quip");
        quipElement.textContent = vacuumStatus.active
          ? vacuumQuip(renderedBinding, statesByEntityId, performance.now())
          : "";
        quipElement.hidden = !quipElement.textContent;
        statusElement.style.transform = "translate(-50%,-50%) scale(" + statusScale + ")";
        statusElement.style.fontSize = Math.max(8, iconSize / 2) + "px";
        const statusHeight = Math.max(
          renderedBinding.overviewQuip ? 28 : 50,
          statusElement.offsetHeight
        );
        markerElement.style.width = Math.max(hitSize, statusScale * 140) + "px";
        markerElement.style.height = Math.max(hitSize, statusHeight * statusScale) + "px";
        markerElement.dataset.status = vacuumStatus.status;
        markerElement.title =
          (renderedBinding.label || "扫地机器人") +
          " · " +
          vacuumStatus.status +
          " · " +
          vacuumStatus.battery;
        deviceState.on = vacuumStatus.active;
        deviceState.available = vacuumStatus.available;
      }
      if (renderedBinding.deviceKind === "camera" || renderedBinding.deviceKind === "presence") {
        const entityState =
          statesByEntityId[renderedBinding.entityId]?.newState ||
          statesByEntityId[renderedBinding.entityId];
        const isAvailable =
          renderedBinding.deviceKind === "camera"
            ? cameraOnline(entityState)
            : entityState?.available !== false &&
              !!entityState?.state &&
              !["unknown", "unavailable"].includes(entityState.state);
        deviceState.available = isAvailable;
        deviceState.on =
          renderedBinding.deviceKind === "camera"
            ? entityState?.state === "recording"
            : entityState?.state === "on";
        if (renderedBinding.passiveSensor) {
          if (!markerElement.querySelector(".i3d-sensor-wave")) {
            markerElement.replaceChildren(
              ...[0, 1, 2].map(() => makeElement("span", "i3d-sensor-wave"))
            );
          }
          markerElement.hidden = !isAvailable;
          markerElement.setAttribute("aria-hidden", "true");
          markerElement.classList.toggle("is-inactive", !isAvailable);
        } else {
          const isSensorChoice = renderedBinding.deviceKind === "presence" && isEditing;
          markerElement.classList.toggle("is-sensor-choice", isSensorChoice);
          let securityLabelElement = markerElement.querySelector(".i3d-security-label");
          if (!securityLabelElement) {
            securityLabelElement = makeElement("span", "i3d-security-label");
            securityLabelElement.append(makeElement("strong"), makeElement("span"));
            markerElement.append(securityLabelElement);
          }
          securityLabelElement.children[0].textContent =
            renderedBinding.label ||
            (renderedBinding.deviceKind === "camera" ? "摄像头" : "人体传感器");
          securityLabelElement.children[1].textContent =
            isEditing && !renderedBinding.entityId
              ? "未绑定实体"
              : isAvailable
                ? renderedBinding.deviceKind === "presence"
                  ? entityState.state === "on"
                    ? "有人"
                    : "检测中"
                  : "在线"
                : "离线";
          securityLabelElement.children[1].hidden = isSensorChoice;
          securityLabelElement.classList.toggle(
            "is-camera-status",
            renderedBinding.deviceKind === "camera"
          );
          securityLabelElement.classList.toggle("is-camera-offline", !isAvailable);
          securityLabelElement.style.fontSize = (renderedBinding.fontSize || 12) + "px";
          if (renderedBinding.deviceKind === "camera") {
            const securityIconElement = markerElement.querySelector(".i3d-marker-icon");
            if (securityIconElement && securityIconElement.parentNode !== securityLabelElement) {
              securityLabelElement.append(securityIconElement);
            }
            securityLabelElement.style.setProperty("--i3d-marker-icon-size", iconSize + "px");
          }
          markerElement.style.setProperty("--i3d-security-scale", String(markerSize / 44));
          markerElement.style.width =
            Math.max(
              hitSize,
              ((renderedBinding.deviceKind === "camera"
                ? securityLabelElement.offsetWidth || 0
                : isSensorChoice
                  ? 120
                  : 180) *
                markerSize) /
                44
            ) + "px";
          markerElement.style.height =
            Math.max(
              hitSize,
              ((renderedBinding.deviceKind === "camera"
                ? securityLabelElement.offsetHeight || 0
                : isSensorChoice
                  ? 32
                  : 58) *
                markerSize) /
                44
            ) + "px";
        }
      }
      markerElement.classList.toggle("i3d-vacuum-room", isVacuumRoomMarker);
      markerElement.classList.toggle(
        "is-icon-hidden",
        isVacuumRoomMarker && renderedBinding.iconHidden === true
      );
      if (isVacuumRoomMarker) {
        let roomLabelElement = markerElement.querySelector(".i3d-room-label");
        if (!roomLabelElement) {
          roomLabelElement = makeElement("span", "i3d-room-label");
          markerElement.append(roomLabelElement);
        }
        roomLabelElement.textContent = renderedBinding.label || "清扫";
        roomLabelElement.hidden = renderedBinding.labelHidden === true;
        roomLabelElement.style.fontSize = (renderedBinding.fontSize || 12) + "px";
      }
      markerElement.style.setProperty("--i3d-marker-size", markerSize + "px");
      markerElement.style.setProperty("--i3d-marker-icon-size", iconSize + "px");
      markerElement.setAttribute(
        "aria-label",
        renderedBinding.overviewQuip
          ? vacuumQuip(renderedBinding, statesByEntityId, performance.now())
          : renderedBinding.label || deviceState.name || "灯光"
      );
      if (!isVacuumMarker) {
        markerElement.title = renderedBinding.label || deviceState.name;
      }
      markerElement.classList.toggle(
        "is-on",
        renderedBinding.deviceKind === "cover"
          ? coverIconIsOn(renderedBinding, deviceState)
          : deviceState.on
      );
      markerElement.classList.toggle("is-offline", !isEditing && !deviceState.available);
      markerElement.classList.toggle("is-nas", renderedBinding.deviceKind === "nas");
      markerElement.classList.toggle("is-selected", isEditing && selectedId === renderedBinding.id);
    }
    applyLightStates();
    renderStage();
    renderLightPanel();
    layoutStage();
    updateMarkerVisibility();
    updateMarkerPositions(true);
  }
  function pointerToFloorPoint(dragPointerEvent, dragBinding) {
    const floorOrigin = stageOptions.worldPoint(dragBinding.floorId, 0, 0, dragBinding.height);
    if (!floorOrigin) {
      return null;
    }
    const canvasContainerRect = containerElement.getBoundingClientRect();
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2(
      ((dragPointerEvent.clientX - canvasContainerRect.left) / canvasContainerRect.width) * 2 - 1,
      1 - ((dragPointerEvent.clientY - canvasContainerRect.top) / canvasContainerRect.height) * 2
    );
    if (stageOptions.presentationRay) {
      stageOptions.presentationRay(dragBinding.floorId, pointerNdc, raycaster);
    } else {
      raycaster.setFromCamera(pointerNdc, stageOptions.camera);
    }
    const hitPoint = raycaster.ray.intersectPlane(
      new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorOrigin.y),
      new THREE.Vector3()
    );
    if (!hitPoint) {
      return null;
    }
    const xAxisVector = stageOptions
      .worldPoint(dragBinding.floorId, 1, 0, dragBinding.height)
      .sub(floorOrigin);
    const yAxisVector = stageOptions
      .worldPoint(dragBinding.floorId, 0, 1, dragBinding.height)
      .sub(floorOrigin);
    const offsetVector = hitPoint.sub(floorOrigin);
    return {
      x: Math.round((offsetVector.dot(xAxisVector) / xAxisVector.lengthSq()) * 100) / 100,
      y: Math.round((offsetVector.dot(yAxisVector) / yAxisVector.lengthSq()) * 100) / 100
    };
  }
  function beginMarkerDrag(dragStartEvent, dragBindingId) {
    if (!isEditing || focusMode || dragStartEvent.button !== 0) {
      return;
    }
    dragStartEvent.preventDefault();
    dragStartEvent.stopPropagation();
    const draggedBinding = findBinding(dragBindingId);
    if (!draggedBinding) {
      return;
    }
    if (draggedBinding.deviceKind === "presence") {
      selectedId = dragBindingId;
      renderStage();
      postToHost({
        type: "edit",
        action: "select",
        id: dragBindingId
      });
      return;
    }
    selectedId = dragBindingId;
    renderStage();
    postToHost({
      type: "edit",
      action: "select",
      id: dragBindingId
    });
    const pointerOffset = pointerToFloorPoint(dragStartEvent, draggedBinding);
    markerDragState = {
      id: dragBindingId,
      pointerId: dragStartEvent.pointerId,
      clientX: dragStartEvent.clientX,
      clientY: dragStartEvent.clientY,
      original: {
        x: draggedBinding.x,
        y: draggedBinding.y
      },
      point: {
        x: draggedBinding.x,
        y: draggedBinding.y
      },
      height: draggedBinding.height,
      offset: pointerOffset
        ? {
            x: draggedBinding.x - pointerOffset.x,
            y: draggedBinding.y - pointerOffset.y
          }
        : {
            x: 0,
            y: 0
          },
      moved: false
    };
    dragStartEvent.currentTarget.setPointerCapture(dragStartEvent.pointerId);
    stageOptions.controls.enabled = false;
  }
  function moveMarkerDrag(dragMoveEvent) {
    if (
      !markerDragState ||
      markerDragState.pointerId !== dragMoveEvent.pointerId ||
      (Math.hypot(
        dragMoveEvent.clientX - markerDragState.clientX,
        dragMoveEvent.clientY - markerDragState.clientY
      ) < 4 &&
        !markerDragState.moved)
    ) {
      return;
    }
    const draggedPosition = pointerToFloorPoint(dragMoveEvent, findBinding(markerDragState.id));
    if (draggedPosition) {
      markerDragState.moved = true;
      markerDragState.point = {
        x: Math.round((draggedPosition.x + markerDragState.offset.x) * 100) / 100,
        y: Math.round((draggedPosition.y + markerDragState.offset.y) * 100) / 100
      };
      if (activeModule === "light") {
        Object.assign(findBinding(markerDragState.id), markerDragState.point);
      }
      updateMarkerPositions(true);
    }
  }
  function endMarkerDrag(dragEndEvent) {
    if (!!markerDragState && markerDragState.pointerId === dragEndEvent.pointerId) {
      if (markerDragState.moved) {
        dragEndEvent.currentTarget.dataset.dragged = "true";
        const draggedBindingEntry = findBinding(markerDragState.id);
        const draggedModel =
          draggedBindingEntry.deviceKind === "camera"
            ? config.security?.cameras?.find(
                draggedCameraEntry => "camera:" + draggedCameraEntry.id === draggedBindingEntry.id
              )
            : draggedBindingEntry.deviceKind === "vacuum-room"
              ? config.devices?.vacuums
                  ?.find(
                    draggedVacuumEntry => draggedVacuumEntry.id === draggedBindingEntry.vacuumId
                  )
                  ?.shortcuts?.find(
                    draggedShortcutEntry =>
                      draggedShortcutEntry.id === draggedBindingEntry.shortcutId
                  )
              : activeModule === "light"
                ? draggedBindingEntry
                : (["nas", "television", "vacuum"].includes(activeModule)
                    ? config.devices?.[
                        activeModule === "vacuum"
                          ? "vacuums"
                          : activeModule === "television"
                            ? "televisions"
                            : "nas"
                      ] || []
                    : config.environment?.[
                        activeModule === "cover" ? "curtains" : "airConditioners"
                      ] || []
                  ).find(deviceEntry => deviceEntry.id === markerDragState.id);
        if (draggedModel) {
          Object.assign(draggedModel, markerDragState.point);
        }
        postToHost({
          type: "edit",
          action: "position",
          id: draggedBindingEntry.id,
          x: markerDragState.point.x,
          y: markerDragState.point.y
        });
      }
      markerDragState = null;
      syncCameraInteraction();
    }
  }
  function cancelMarkerDrag() {
    if (markerDragState && activeModule === "light") {
      Object.assign(findBinding(markerDragState.id), markerDragState.original);
    }
    markerDragState = null;
    syncCameraInteraction();
    updateMarkerPositions(true);
  }
  let canvasPointerState;
  canvasElement.addEventListener("pointerdown", canvasPointerDownEvent => {
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
  canvasElement.addEventListener("pointermove", canvasPointerMoveEvent => {
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
      backgroundTheme.interact(canvasPointerMoveEvent);
    }
  });
  canvasElement.addEventListener(
    "wheel",
    wheelEvent => {
      if (!isRangeEditorOpen) {
        backgroundTheme.interact(wheelEvent);
      }
    },
    {
      passive: true
    }
  );
  canvasElement.addEventListener("pointercancel", () => {
    canvasPointerState = null;
  });
  canvasElement.addEventListener("pointerup", canvasPointerUpEvent => {
    const isCanvasClick =
      canvasPointerState &&
      !canvasPointerState.moved &&
      canvasPointerState.id === canvasPointerUpEvent.pointerId &&
      Math.hypot(
        canvasPointerUpEvent.clientX - canvasPointerState.x,
        canvasPointerUpEvent.clientY - canvasPointerState.y
      ) < 5;
    canvasPointerState = null;
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
        !cameraTransition
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
        !cameraTransition &&
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
            environmentBinding =>
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
  window.addEventListener("keydown", keydownEvent => {
    if (keydownEvent.key === "Escape") {
      exitFocus();
    }
  });
  function handleHostMessage(messageEvent) {
    if (
      messageEvent.origin !== location.origin ||
      messageEvent.source !== window.parent ||
      messageEvent.data?.channel !== "hb-i3d-v1"
    ) {
      return;
    }
    const message = messageEvent.data;
    wakeFrameLoop();
    if (message.type === "presentation-layout") {
      if (
        Number.isFinite(message.width) &&
        message.width > 0 &&
        Number.isFinite(message.height) &&
        message.height > 0
      ) {
        presentationLayout = {
          width: message.width,
          height: message.height
        };
        layoutStage();
      }
    } else if (message.type === "config") {
      if (isSceneUpdating) {
        queuedConfigMessage = messageEvent;
        return;
      }
      isRangeEditorOnly = message.rangeEditorOnly === true;
      isRangeEditingAllowed = message.allowRangeEditing === true || message.editing === true;
      if (
        isRangeEditorOpen &&
        (!isRangeEditingAllowed ||
          message.viewEditing === true ||
          message.properties?.lightingMode !== "region" ||
          message.properties?.floorSelection !== sceneProperties.floorSelection ||
          JSON.stringify(message.properties?.camera) !== JSON.stringify(sceneProperties.camera) ||
          JSON.stringify(message.properties?.lightRegionOverrides || {}) !==
            JSON.stringify(sceneProperties.lightRegionOverrides || {}))
      ) {
        rangeEditor?.close();
      }
      hasUserInteracted = false;
      if (
        message.editing ||
        message.viewEditing ||
        sceneProperties.floorSelection !== message.properties.floorSelection ||
        JSON.stringify(sceneProperties.floorCameras) !==
          JSON.stringify(message.properties.floorCameras)
      ) {
        pendingFloorId = "";
        pendingModule = "";
      }
      sceneProperties = structuredClone(message.properties);
      if (!hasInitializedFloor && !message.editing && !message.viewEditing) {
        hasInitializedFloor = true;
        if (stageOptions.document.floors.length > 1) {
          pendingFloorId = "all";
        }
      }
      if (
        pendingFloorId &&
        pendingFloorId !== "all" &&
        !stageOptions.document.floors.some(validFloorEntry => validFloorEntry.id === pendingFloorId)
      ) {
        pendingFloorId = "";
      }
      if (
        message?.editing ||
        message?.viewEditing ||
        (sceneProperties.floorSelection !== config.floorSelection && !pendingFloorId)
      ) {
        stageOptions.finishFloorTransition?.();
      }
      stageOptions.setFloorGap?.(sceneProperties.floorGap);
      stageOptions.setUniformOverviewStack?.(sceneProperties.uniformOverviewStack);
      message.properties = normalizeSceneConfig({
        ...sceneProperties,
        ...(pendingFloorId
          ? {
              floorSelection: pendingFloorId
            }
          : {})
      });
      if (pendingFloorId && savedCameraPose) {
        message.properties.camera = savedCameraPose;
      } else if (pendingFloorId && pendingFloorId !== sceneProperties.floorSelection) {
        message.properties.camera = transformCameraPose(
          sceneProperties.floorCameras?.[pendingFloorId] || null,
          pendingFloorId
        );
      }
      idleRotation.activity();
      idleIconVisibility.activity();
      idleFocusExit.activity();
      const isCameraChanged =
        (isViewEditing && message.viewEditing !== true) ||
        JSON.stringify(config.camera) !== JSON.stringify(message.properties.camera);
      if (
        (focusMode || focusRestoreCameraPose || cameraTransition) &&
        (isCameraChanged ||
          config.floorSelection !== message.properties.floorSelection ||
          isEditing !== (message.editing === true) ||
          message.viewEditing === true ||
          (isEditing && selectedId !== (message.selectedId || "")))
      ) {
        exitFocus({
          immediate: true
        });
        if (cameraTransition) {
          cameraTransition = null;
          stageOptions.finishFloorTransition?.();
          stageOptions.endCameraMotion();
        }
      }
      config = structuredClone(message.properties);
      isEditing = message.editing === true;
      isViewEditing = message.viewEditing === true;
      selectedId = message.selectedId || "";
      statesByEntityId = message.states || {};
      isEditorCanvas = message.editorCanvas === true && !isEditing;
      backgroundTheme.configure(config.backgroundTheme);
      isInteractive = !isEditing && message.interactive === true;
      editingVacuumId = message.editingVacuumId || "";
      configuredModules = configuredModuleKinds(config);
      let nextModule = isEditing
        ? [
            "security",
            "climate",
            "cover",
            "nas",
            "television",
            "vacuum",
            "vacuum-shortcut"
          ].includes(message.editingModule)
          ? message.editingModule
          : "light"
        : ["overview", "security", "light", "devices", "vacuum"].includes(activeModule)
          ? activeModule
          : ["nas", "television"].includes(activeModule)
            ? "devices"
            : "environment";
      if (!isEditing && nextModule !== "overview" && !configuredModules.includes(nextModule)) {
        nextModule = "light";
      }
      if (pendingModule && !configuredModules.includes(pendingModule)) {
        pendingModule = "";
      }
      if (activeModule !== nextModule) {
        stopVacuumFollow();
        exitFocus({
          immediate: true
        });
        cancelModuleTransition();
        activeModule = nextModule;
        markerPointsById.clear();
      }
      for (const pendingLightRequest of lightRequestsById.values()) {
        if (
          pendingLightRequest.next &&
          (!isInteractive ||
            !(config.lights || []).some(
              pendingLightEntry => pendingLightEntry.entityId === pendingLightRequest.entityId
            ))
        ) {
          lightPreview.reject(pendingLightRequest.entityId, pendingLightRequest.next.previewToken);
          pendingLightRequest.next = null;
        }
      }
      applyPageBehavior();
      updateIdleControllers();
      stageOptions.appearance(
        isRangeEditorOpen
          ? {
              ...config,
              lightRegionOverrides: stageOptions.regionLighting.getOverrides()
            }
          : config
      );
      const activeFloorId =
        stageOptions.document.floors.some(
          activeFloorEntry => activeFloorEntry.id === config.floorSelection
        ) || config.floorSelection === "all"
          ? config.floorSelection
          : stageOptions.document.floors[0].id;
      // On a single floor 总览 stays valid, so it is never swapped for 灯光 here.
      if (!isEditing && activeFloorId === "all") {
        activeModule = "overview";
      }
      if (currentFloorId !== activeFloorId) {
        stopVacuumFollow(false);
        currentFloorId = activeFloorId;
        stageOptions.setFloor(activeFloorId);
        stageOptions.restoreCamera(
          constrainCameraPose(config.camera || stageOptions.floorDefaultCamera?.(activeFloorId))
        );
        savedCameraPose = stageOptions.cameraState();
      } else if (isCameraChanged) {
        stageOptions.restoreCamera(constrainCameraPose(config.camera || savedCameraPose));
        savedCameraPose = stageOptions.cameraState();
      }
      syncCameraInteraction();
      toolbarElement.hidden = true;
      updatePanelChrome();
      if (isViewEditing || (!isEditing && !isInteractive)) {
        exitFocus({
          immediate: true
        });
      }
      renderMarkers();
      const configRevision = ++configRevisionCount;
      (isPresented ? Promise.resolve() : stageOptions.whenPresented())
        .then(() => {
          if (!isDisposed && configRevision === configRevisionCount) {
            isPresented = true;
            updateIdleControllers();
            updateMarkerPositions(true);
            postToHost({
              type: "presented",
              configId: message.configId,
              camera: transformCameraPose(stageOptions.cameraState(), config.floorSelection, true)
            });
          }
        })
        .catch(presentationFailure => {
          if (!isDisposed && configRevision === configRevisionCount) {
            postToHost({
              type: "error",
              message: presentationFailure.message || "户型画面准备失败，请重新载入。"
            });
          }
        });
    } else if (message.type === "vacuum-room-result") {
      clearTimeout(vacuumRoomTimersById.get(message.id));
      vacuumRoomTimersById.delete(message.id);
      const roomMarker = markersById.get(message.id);
      if (roomMarker) {
        roomMarker.disabled = false;
        roomMarker.title = message.error || "";
      }
      if (message.error) {
        moduleEmptyElement.hidden = false;
        moduleEmptyElement.textContent = message.error;
      }
    } else if (message.type === "range-editor") {
      if (message.flush === true) {
        const rangeEditorBlockedReason =
          !isRangeEditingAllowed || !isRangeEditorOpen ? "请先打开照射范围编辑。" : "";
        if (!rangeEditorBlockedReason) {
          rangeEditor.flush();
        }
        postToHost({
          type: "range-editor-state",
          active: isRangeEditorOpen,
          requestId: message.requestId,
          ...(rangeEditorBlockedReason
            ? {
                error: rangeEditorBlockedReason
              }
            : {})
        });
      } else if (message.open === false) {
        isRangeEditorBusy = !!message.requestId;
        try {
          rangeEditor?.close();
        } finally {
          isRangeEditorBusy = false;
        }
        if (message.requestId) {
          postToHost({
            type: "range-editor-state",
            active: false,
            requestId: message.requestId
          });
        }
      } else {
        openRangeEditor(message.requestId);
      }
    } else if (message.type === "range-save-result") {
      rangeEditor?.setSaveStatus?.(message.error || "");
    } else if (message.type === "activity-state") {
      hasActivityState = true;
      isPageVisible = message.visible === true;
      isPresentedVisible =
        message.presentedVisible === undefined ? isPageVisible : message.presentedVisible === true;
      stageOptions.setPresentedVisible?.(isPresentedVisible);
      syncVacuumMaps();
      if (!isPageVisible) {
        hasUserInteracted = false;
      }
      updateIdleControllers();
    } else if (message.type === "user-activity") {
      hasUserInteracted = false;
      lastActivityTimestamp = performance.now();
      updateMarkerVisibility();
      isActivityHeld = message.held === true;
      updateActivityHolds();
    } else if (message.type === "dismiss-focus") {
      idleRotation.activity();
      idleIconVisibility.activity();
      exitFocus({
        immediate: message.immediate === true
      });
    } else if (message.type === "states") {
      statesByEntityId =
        message.patch === true
          ? {
              ...statesByEntityId,
              ...(message.states || {})
            }
          : message.states || {};
      for (const reconciledLightEntry of config.lights || []) {
        if (
          message.patch !== true ||
          Object.hasOwn(message.states || {}, reconciledLightEntry.entityId)
        ) {
          lightPreview.reconcile(
            reconciledLightEntry.entityId,
            readLightState(reconciledLightEntry.entityId)
          );
        }
      }
      renderMarkers();
    } else if (message.type === "control-result") {
      if (televisionRequestsById.has(message.requestId)) {
        settleTelevisionRequest(message.requestId, message.error);
      } else if (coverRequestsById.has(message.requestId)) {
        settleCoverRequest(message.requestId, message.error);
      } else if (climateRequestsById.has(message.requestId)) {
        settleClimateRequest(message.requestId, message.error);
      } else {
        settleLightCommand(message.requestId, message.error || "", message.timedOut === true);
      }
    } else if (message.type === "editor-command" && isEditing) {
      try {
        if (message.command === "presence-top-view") {
          const { floorId: topViewFloorId, box: topViewBox } = message.value || {};
          if (
            !topViewBox ||
            ![topViewBox.x, topViewBox.y, topViewBox.w, topViewBox.h].every(Number.isFinite) ||
            topViewBox.w <= 0 ||
            topViewBox.h <= 0
          ) {
            throw new Error("顶视图范围无效。");
          }
          const topViewCenter = stageOptions.worldPoint(
            topViewFloorId,
            topViewBox.x + topViewBox.w / 2,
            topViewBox.y + topViewBox.h / 2,
            0
          );
          const topViewMin = stageOptions.worldPoint(topViewFloorId, topViewBox.x, topViewBox.y, 0);
          const topViewMax = stageOptions.worldPoint(
            topViewFloorId,
            topViewBox.x + topViewBox.w,
            topViewBox.y + topViewBox.h,
            0
          );
          if (!topViewCenter || !topViewMin || !topViewMax) {
            throw new Error("请选择有效楼层。");
          }
          const topViewFrameSize = Math.max(
            Math.abs(topViewMax.z - topViewMin.z),
            Math.abs(topViewMax.x - topViewMin.x) /
              (canvasElement.clientWidth / Math.max(1, canvasElement.clientHeight))
          );
          exitFocus({
            immediate: true
          });
          stageOptions.restoreCamera({
            mode: "orthographic",
            view: "top",
            topRotation: 0,
            position: [
              topViewCenter.x,
              topViewCenter.y + Math.max(20, topViewFrameSize * 2),
              topViewCenter.z
            ],
            target: topViewCenter.toArray(),
            up: [0, 0, -1],
            zoom: 1,
            frameSize: topViewFrameSize
          });
        } else if (message.command === "presence-3d-view") {
          stageOptions.setCameraView?.("free");
          stageOptions.restoreCamera(
            config.camera || stageOptions.floorDefaultCamera?.(currentFloorId) || savedCameraPose
          );
        } else if (message.command === "presence-preview-walk") {
          isPresencePreviewWalk = message.value === true;
          syncPresenceScene();
        } else if (message.command === "presence-show-hit-range") {
          isPresenceHitRangeVisible = message.value === true;
          layoutPresenceHitBoxes();
        } else if (message.command === "edit-follow-camera") {
          const cameraBinding = findBinding(message.id);
          if (cameraBinding?.deviceKind !== "vacuum") {
            throw new Error("请选择扫地机。");
          }
          focusBinding(message.id, "edit", true);
          const cameraTarget =
            stageOptions.environmentModelPose(cameraBinding.floorId, cameraBinding.modelId)
              ?.center || stageOptions.cameraState().target;
          beginCameraTransition(
            cameraBinding.followCamera ||
              vacuumBirdCamera(config.camera || stageOptions.cameraState(), cameraTarget),
            false,
            true
          );
        } else if (message.command === "edit-light-camera") {
          focusBinding(message.id, "edit", true);
        } else if (message.command === "preview-light-camera") {
          focusBinding(message.id, "preview");
        } else if (message.command === "preview-light-effect") {
          if (
            ![
              "brightnessMin",
              "brightnessMax",
              "temperatureMin",
              "temperatureMax",
              "defaults"
            ].includes(message.value)
          ) {
            throw new Error("请选择要预览的效果。");
          }
          if (!findBinding(message.id)) {
            throw new Error("灯光按钮已移除。");
          }
          if (!findBinding(message.id).entityId) {
            throw new Error("请先绑定实体，再预览灯光效果。");
          }
          focusBinding(message.id, "preview");
          lightEffectPreview = {
            id: message.id,
            kind: message.value
          };
          applyLightStates({
            preview: true
          });
          renderLightPanel();
        } else if (message.command === "cancel-light-camera") {
          exitFocus({
            immediate: true
          });
        } else {
          if (focusMode !== "edit" || message.id !== focusedId) {
            throw new Error(
              activeModule === "nas"
                ? "请先调整这台NAS的聚焦视角。"
                : activeModule === "cover"
                  ? "请先调整这幅窗帘的聚焦视角。"
                  : activeModule === "climate"
                    ? "请先调整这台空调的聚焦视角。"
                    : "请先调整这盏灯的聚焦视角。"
            );
          }
          if (message.command === "focus-projection") {
            stageOptions.setCameraProjection(message.value);
          }
          if (message.command === "focus-focal-length") {
            stageOptions.setCameraFocalLength(message.value);
          }
        }
        syncCameraInteraction();
        const cameraSnapshot = currentCameraSnapshot();
        postToHost({
          type: "edit",
          action: "focus-camera",
          requestId: message.requestId,
          id: message.id,
          camera: cameraSnapshot
        });
        if (message.command === "save-light-camera") {
          exitFocus({
            immediate: true
          });
        }
      } catch (editorCommandError) {
        postToHost({
          type: "edit",
          action: "focus-camera",
          requestId: message.requestId,
          error: editorCommandError.message
        });
      }
    } else if (message.type === "editor-command" && isViewEditing) {
      if (message.command === "projection") {
        stageOptions.setCameraProjection(message.value);
      }
      if (message.command === "focal-length") {
        stageOptions.setCameraFocalLength(message.value);
      }
      syncCameraInteraction();
      if (message.command === "save-camera" || message.requestId) {
        postToHost({
          type: "edit",
          action: "camera",
          requestId: message.requestId,
          camera: currentCameraSnapshot()
        });
      }
    }
  }
  window.addEventListener("message", handleHostMessage);
  const orbitControls = stageOptions.controls;
  const unsubscribeCameraChange = stageOptions.onCameraChange?.(() => {
    const isCameraMoving = screenOutlines.cameraChanged();
    updateMarkerPositions();
    layoutPresenceHitBoxes();
    if (isCameraMoving || pageBehavior.hideIconsWhileRotating === true) {
      wakeFrameLoop();
    }
  });
  if (!unsubscribeCameraChange) {
    orbitControls.addEventListener("change", updateMarkerPositions);
  }
  const layoutResizeObserver = new ResizeObserver(layoutStage);
  layoutResizeObserver.observe(containerElement);
  layoutResizeObserver.observe(lightPanelElement);
  layoutResizeObserver.observe(navigationElement);
  layoutResizeObserver.observe(floorTabsElement);
  async function applySceneUpdate(sceneUpdate) {
    const previousScene = stageOptions.savedScene;
    const currentCameraPose = currentCameraSnapshot();
    hasUserInteracted =
      hasUserInteracted ||
      (hasIdleReturnPending && pageBehavior.hideIconsWhileRotating === true) ||
      areIdleIconsHidden;
    isSceneUpdating = true;
    idleRotation.activity();
    updateMarkerVisibility();
    let releaseSceneUpdate = () => {};
    let didReplaceScene = false;
    const replaceScene = async nextSceneUpdate => {
      stageOptions.finishFloorTransition?.();
      await stageOptions.replaceScene(nextSceneUpdate);
      if (isDisposed) {
        return;
      }
      stageOptions.setFloorGap?.(sceneProperties.floorGap);
      stageOptions.setUniformOverviewStack?.(sceneProperties.uniformOverviewStack);
      config = normalizeSceneConfig({
        ...sceneProperties,
        ...(pendingFloorId
          ? {
              floorSelection: pendingFloorId
            }
          : {})
      });
      const updateActiveFloorId =
        stageOptions.document.floors.some(
          updateFloorEntry => updateFloorEntry.id === config.floorSelection
        ) || config.floorSelection === "all"
          ? config.floorSelection
          : stageOptions.document.floors[0].id;
      currentFloorId = updateActiveFloorId;
      stageOptions.setFloor(updateActiveFloorId);
      stageOptions.appearance(config);
      savedCameraPose = transformCameraPose(
        sceneProperties.floorCameras?.[updateActiveFloorId] ||
          sceneProperties.camera ||
          currentCameraPose,
        updateActiveFloorId
      );
      stageOptions.restoreCamera(transformCameraPose(currentCameraPose, updateActiveFloorId));
      applyLightStates({
        immediate: true
      });
      await stageOptions.whenPresented();
    };
    try {
      releaseSceneUpdate = stageOptions.coverSceneUpdate();
      stageOptions.setCameraInteraction({
        enabled: false
      });
      didReplaceScene = true;
      await replaceScene(sceneUpdate);
      if (!isDisposed) {
        postToHost({
          type: "model-metadata",
          metadata: buildMetadata()
        });
      }
    } catch (sceneUpdateError) {
      if (didReplaceScene && !isDisposed) {
        await replaceScene(previousScene);
      }
      throw sceneUpdateError;
    } finally {
      releaseSceneUpdate();
      isSceneUpdating = false;
      markerPointsById.clear();
      if (!isDisposed && (syncCameraInteraction(), renderMarkers(), queuedConfigMessage)) {
        const queuedSceneUpdate = queuedConfigMessage;
        queuedConfigMessage = null;
        handleHostMessage(queuedSceneUpdate);
      }
    }
  }
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
  function renderFrame(timestamp) {
    if (isDisposed || document.hidden || isSceneUpdating) {
      return Infinity;
    }
    syncPresenceScene();
    const backgroundDelay = backgroundTheme.tick(timestamp);
    const isFloorTransitionActive =
      stageOptions.floorTransitionActive || cameraTransition?.owner === "floor";
    stageOptions.recordFloorFrame?.(timestamp, !!isFloorTransitionActive);
    if (!isFloorTransitionActive) {
      syncCurtains();
      syncNasStatus();
      syncCameraStatus();
      syncTelevisionScreens();
      syncVacuumMap();
      nasStatus.tick(timestamp);
      if ([coverFeedback.tick(timestamp), dreamCoverFeedback.tick(timestamp)].some(Boolean)) {
        pruneBladePreviews();
        syncCoverFeedback();
        if (findFocusedBinding()?.deviceKind === "cover") {
          renderLightPanel();
        }
      }
      curtainMotion.update(timestamp);
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
    const hasActiveVacuum = (config.devices?.vacuums || []).some(
      vacuumStatusEntry => vacuumStatusPresentation(vacuumStatusEntry, statesByEntityId).active
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
    const hasTrackedVacuum = (config.devices?.vacuums || []).some(
      trackedVacuumEntry =>
        isOnActiveFloor(trackedVacuumEntry) && vacuumMotion.hasTracking(trackedVacuumEntry.id)
    );
    followButton.hidden =
      isEditing || (!followedVacuumId && (activeModule !== "vacuum" || !hasTrackedVacuum));
    toolbarElement.hidden = followButton.hidden;
    followButton.disabled = !followedVacuumId && !hasTrackedVacuum;
    updateMarkerPositions();
    canvasElement.dataset.stageFrameChecks = String(frameLoop.stats.frames);
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
      Math.min(coverFeedback.nextDelay(timestamp), dreamCoverFeedback.nextDelay(timestamp)),
      environmentAirflow.nextDelay(),
      nasStatus.nextDelay(),
      idleFocusExit.nextDelay(timestamp),
      idleRotation.nextDelay(timestamp),
      idleIconVisibility.nextDelay(timestamp),
      lightPreview.nextDelay(timestamp)
    );
  }
  frameLoop = stageOptions.createFrameLoop({
    step: loopTimestamp =>
      stageOptions.profileFrameWork
        ? stageOptions.profileFrameWork("stage-updates", () => renderFrame(loopTimestamp))
        : renderFrame(loopTimestamp)
  });
  updateIdleControllers();
  window.addEventListener("pagehide", () => {
    backgroundTheme.dispose();
    stageOptions.setBackgroundTheme?.(null);
    modulePanelAnimation?.cancel();
    modulePanelAnimation = null;
    cancelModuleTransition();
    document.removeEventListener("visibilitychange", syncVacuumMaps);
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
    curtainMotion.dispose();
    coverFeedback.clear();
    dreamCoverFeedback.clear();
    bladePendingByEntityId.clear();
    for (const televisionRequestKey of televisionRequestsById.keys()) {
      settleTelevisionRequest(televisionRequestKey, "页面已关闭。");
    }
    for (const coverRequestKey of coverRequestsById.keys()) {
      settleCoverRequest(coverRequestKey, "页面已关闭。");
    }
    lightStateCache.flush();
    stopSceneSync();
    screenOutlines.dispose();
    nasPanel.dispose();
    nasStatus.dispose();
    cameraStatus.dispose();
    televisionPanel.dispose();
    televisionScreens.dispose();
    environmentAirflow.dispose();
    environmentScene.dispose();
    climatePanel.dispose();
    for (const climateRequestKey of climateRequestsById.keys()) {
      settleClimateRequest(climateRequestKey, "页面已关闭。");
    }
    stageOptions.finishFloorTransition?.();
    isDisposed = true;
    idleRotation.dispose();
    idleIconVisibility.dispose();
    idleFocusExit.dispose();
    cameraTransition = null;
    postToHost({
      type: "focus-state",
      active: false
    });
    for (const removedEventName of TRACKED_INPUT_EVENTS) {
      window.removeEventListener(removedEventName, trackUserInput, true);
    }
    window.removeEventListener("blur", clearInputState);
    document.removeEventListener?.("visibilitychange", updateIdleControllers);
    frameLoop.dispose();
    unsubscribeCameraChange?.();
    if (!unsubscribeCameraChange) {
      orbitControls.removeEventListener("change", updateMarkerPositions);
    }
    layoutResizeObserver.disconnect();
    lightRequestsById.forEach(pendingLightRequestTimer =>
      clearTimeout(pendingLightRequestTimer.timeout)
    );
    lightRequestsById.clear();
  });
  function buildMetadata() {
    const floorNumbersById = new Map(
      floorNavigationChoices(stageOptions.document.floors)
        .filter(([metadataFloorKey]) => metadataFloorKey !== "all")
        .map(([metadataFloorName, metadataFloorNumberText]) => [
          metadataFloorName,
          metadataFloorNumberText.startsWith("B")
            ? -Number(metadataFloorNumberText.slice(1))
            : Number(metadataFloorNumberText.slice(0, -1))
        ])
    );
    stageOptions.regionLighting?.sync?.(stageOptions.camera);
    return {
      floorGap: stageOptions.document.previewFloorGap,
      uniformOverviewStack: stageOptions.document.uniformOverviewStack === true,
      appearanceCapabilities: {
        detailedLighting: (stageOptions.regionLighting?.stats?.detailedMaterials || 0) > 0
      },
      camera: transformCameraPose(
        stageOptions.cameraState(),
        config.floorSelection || stageOptions.document.activeFloorId,
        true
      ),
      baseLighting: stageOptions.document.baseLighting,
      defaults: stageOptions.defaults,
      floors: stageOptions.document.floors.map(metadataFloor => {
        const configuredWallHeight = metadataFloor.scene.settings?.wallHeight;
        const wallHeights = metadataFloor.scene.walls
          .map(wall => wall.height)
          .filter(wallHeight => Number.isFinite(wallHeight) && wallHeight > 0);
        const resolvedWallHeight = Math.max(
          0.01,
          Math.min(
            6,
            Number.isFinite(configuredWallHeight) && configuredWallHeight > 0
              ? configuredWallHeight
              : Math.max(0, ...wallHeights) || 2.8
          )
        );
        return {
          id: metadataFloor.id,
          name: metadataFloor.name,
          elevation: metadataFloor.elevation,
          number: floorNumbersById.get(metadataFloor.id),
          wallHeight: resolvedWallHeight,
          plan: {
            pixelsPerMeter: metadataFloor.scene.calibration?.pixelsPerMeter || 1,
            walls: metadataFloor.scene.walls.map(metadataWall => ({
              start: metadataWall.start,
              end: metadataWall.end,
              thickness: metadataWall.thickness
            })),
            items: metadataFloor.scene.items.map(
              ({
                id: itemId,
                type: itemType,
                name: itemName,
                x: itemX,
                y: itemY,
                width: itemWidth,
                depth: itemDepth,
                rotation: itemRotation,
                color: itemColor
              }) => ({
                id: itemId,
                type: itemType,
                name: itemName,
                x: itemX,
                y: itemY,
                width: itemWidth,
                depth: itemDepth,
                rotation: itemRotation,
                color: itemColor
              })
            )
          },
          cameras: metadataFloor.scene.items
            .filter(sceneItem => sceneItem.type === "camera")
            .map((cameraSourceItem, cameraIndex) => ({
              id: cameraSourceItem.id,
              name: cameraSourceItem.name || "摄像头 " + (cameraIndex + 1),
              x: cameraSourceItem.x,
              y: cameraSourceItem.y,
              height:
                (Number(cameraSourceItem.elevation) || 0) +
                (Number(cameraSourceItem.height) || 0.3) / 2
            })),
          presenceSensors: metadataFloor.scene.items
            .filter(presenceSourceItem => presenceSourceItem.type === "presence")
            .map((presenceItem, presenceIndex) => ({
              id: presenceItem.id,
              name: presenceItem.name || "人体传感器 " + (presenceIndex + 1)
            })),
          vacuums: metadataFloor.scene.items
            .filter(vacuumSourceItem => vacuumSourceItem.type === "robotvacuum")
            .map((vacuumItem, vacuumIndex) => ({
              id: vacuumItem.id,
              name: vacuumItem.name || "扫地机 " + (vacuumIndex + 1),
              x: vacuumItem.x,
              y: vacuumItem.y,
              height: (Number(vacuumItem.elevation) || 0) + (Number(vacuumItem.height) || 0.85) / 2
            })),
          televisions: metadataFloor.scene.items
            .filter(televisionSourceItem => televisionSourceItem.type === "tv")
            .map((televisionItem, televisionIndex) => ({
              id: televisionItem.id,
              name: televisionItem.name || "电视 " + (televisionIndex + 1),
              type: televisionItem.type,
              x: televisionItem.x,
              y: televisionItem.y,
              height:
                (Number(televisionItem.elevation) || 0) +
                (Number(televisionItem.height) || 0.92) * 0.62
            })),
          nas: metadataFloor.scene.items
            .filter(nasSourceItem => nasSourceItem.type === "nas")
            .map((nasItem, nasIndex) => ({
              id: nasItem.id,
              name: nasItem.name || "NAS " + (nasIndex + 1),
              type: nasItem.type,
              x: nasItem.x,
              y: nasItem.y,
              height: (Number(nasItem.elevation) || 0) + (Number(nasItem.height) || 0.34) / 2
            })),
          curtains: metadataFloor.scene.items
            .filter(curtainSourceItem => curtainSourceItem.type === "curtain")
            .map((curtainItem, curtainIndex) => ({
              id: curtainItem.id,
              name: curtainItem.name || "窗帘 " + (curtainIndex + 1),
              type: curtainItem.type,
              x: curtainItem.x,
              y: curtainItem.y,
              height:
                (Number(curtainItem.elevation) || 0) + (Number(curtainItem.height) || 2.4) / 2,
              curtainPosition: curtainItem.curtainPosition || "split",
              curtainTrack: curtainItem.curtainTrack || "straight",
              curtainFabric: curtainItem.curtainFabric
            })),
          airConditioners: metadataFloor.scene.items
            .filter(airConditionerSourceItem =>
              ["wallac", "floorac", "airoutlet"].includes(airConditionerSourceItem.type)
            )
            .map((airConditionerItem, airConditionerIndex) => ({
              id: airConditionerItem.id,
              name:
                airConditionerItem.name ||
                (airConditionerItem.type === "airoutlet"
                  ? "出风口"
                  : airConditionerItem.type === "wallac"
                    ? "挂机空调"
                    : "柜机空调") +
                  " " +
                  (airConditionerIndex + 1),
              type: airConditionerItem.type,
              x: airConditionerItem.x,
              y: airConditionerItem.y,
              height:
                (Number(airConditionerItem.elevation) || 0) +
                (Number(airConditionerItem.height) || 0.28) / 2
            })),
          groups: metadataFloor.scene.lightGroups.map(lightGroup => {
            const groupItems = metadataFloor.scene.items.filter(
              groupItem => groupItem.lightGroupId === lightGroup.id
            );
            const groupPoints = groupItems.length
              ? groupItems
              : metadataFloor.scene.walls.map(groupWall => groupWall.start);
            return {
              id: lightGroup.id,
              name: lightGroup.name,
              height: resolvedWallHeight,
              x: groupPoints.length
                ? groupPoints.reduce((sumX, pointX) => sumX + pointX.x, 0) / groupPoints.length
                : 0,
              y: groupPoints.length
                ? groupPoints.reduce((sumY, pointY) => sumY + pointY.y, 0) / groupPoints.length
                : 0
            };
          })
        };
      })
    };
  }
  postToHost({
    type: "ready",
    statePatches: true,
    metadata: buildMetadata()
  });
}
